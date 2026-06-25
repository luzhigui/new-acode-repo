// 37health-core.js - 光明顶 5v5 全面体检核心逻辑 V2.2.1
// 2026-06-25 kimi: 增加 waitGameReady，等模块初始化后再点封面；取消模拟 btnMain/投票/Buff 流程，改用 doManualReset/selectStage + waitCtx，解决超时
// 0625 18:10 trae: 修复 30test-runner.html 移入 tools/ 后游戏路径错误（从 tools/ 往根目录找）
// 预估行数: 300, 发送时间: 20260625 18:10, 版本: V2.2.1
// 联动: 被 30test-runner.html 调用，依赖 29health-rules.js
// 改动: 精简掉答题/反馈 UI 逻辑（已移至 30），专注体检核心流程 + 报告内联展示

import { createHealthRules } from './29health-rules.js';

export async function runHealthCheck(config) {
    const {
        iframe, statusEl, reportEl, copySumBtn, copyFullBtn, runBtn,
        progCont, progFill, progText, stageCbs, groupCbs
    } = config;

    const selectedStages = Array.from(stageCbs.querySelectorAll('input:checked'))
        .map(cb => parseInt(cb.value)).sort((a, b) => a - b);
    const selectedGroups = Array.from(groupCbs.querySelectorAll('input:checked'))
        .map(cb => cb.value);

    if (!selectedStages.length) {
        statusEl.textContent = '请至少选择一个关卡';
        return;
    }

    reportEl.innerHTML = '';
    copySumBtn.style.display = 'none';
    copyFullBtn.style.display = 'none';
    statusEl.textContent = '正在启动...';
    runBtn.disabled = true;
    runBtn.textContent = '⏳ 检测中...';
    progCont.style.display = 'block';
    progFill.style.width = '0%';
    progText.textContent = '初始化...';

    const W = () => iframe.contentWindow;
    const D = () => iframe.contentDocument || W().document;

    const waitFor = (sel, timeout = 15000) => new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            const doc = D();
            const el = doc ? doc.querySelector(sel) : null;
            if (el) resolve(el);
            else if (Date.now() - start > timeout) reject(new Error('等待元素超时: ' + sel));
            else setTimeout(check, 300);
        };
        check();
    });

    const waitCtx = (timeout = 25000) => new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            const ctx = W()._getPlayerContext?.();
            if (ctx?.UI?.allyTeam?.length === 5 && ctx?.UI?.enemyTeam?.length === 5) resolve(ctx);
            else if (Date.now() - start > timeout) reject(new Error('等待游戏上下文超时'));
            else setTimeout(check, 500);
        };
        check();
    });

    // 等待游戏模块初始化完成（_getPlayerContext 已挂载且阵容已生成）
    const waitGameReady = (timeout = 20000) => new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            try {
                const ctx = W()._getPlayerContext?.();
                if (ctx?.UI?.allyTeam?.length === 5 && ctx?.UI?.enemyTeam?.length === 5) resolve(ctx);
                else if (Date.now() - start > timeout) reject(new Error('游戏模块初始化超时'));
                else setTimeout(check, 400);
            } catch (e) {
                if (Date.now() - start > timeout) reject(new Error('游戏模块初始化超时'));
                else setTimeout(check, 400);
            }
        };
        check();
    });

    // 30test-runner.html 已移入 tools/，需要从根目录找游戏页面
    const baseUrl = window.location.href.replace(/tools\/.*$/, '');
    const gameUrl = baseUrl + 'mode-5v5-test.html';
    iframe.src = gameUrl;

    try {
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('游戏加载超时')), 20000);
            iframe.addEventListener('load', () => { clearTimeout(timeout); resolve(); }, { once: true });
        });

        // 等模块初始化后再点封面，避免事件监听还没挂上
        await waitGameReady(20000);
        const coverBtn = await waitFor('#coverStartBtn');
        coverBtn.click();
        await new Promise(r => setTimeout(r, 500));

        const results = [];

        for (let idx = 0; idx < selectedStages.length; idx++) {
            const s = selectedStages[idx];
            const progress = Math.floor(((idx + 1) / selectedStages.length) * 100);
            progFill.style.width = progress + '%';
            progText.textContent = `第 ${s} 关 (${idx + 1}/${selectedStages.length})`;
            statusEl.textContent = `正在检测第 ${s} 关...`;

            try {
                if (idx === 0 && s === 1) {
                    // 第一关直接重置为初始状态，确保阵容新鲜
                    if (typeof W().doManualReset === 'function') W().doManualReset();
                } else {
                    await safeSelectStage(s, W, waitCtx);
                }
                await waitCtx(15000);
            } catch (e) {
                results.push({ stage: s, error: '关卡初始化超时' });
                continue;
            }

            const ctx = W()._getPlayerContext();
            if (!ctx) {
                results.push({ stage: s, error: '游戏上下文不可用' });
                continue;
            }

            const allRules = createHealthRules(W(), D());
            const rules = allRules.filter(r => selectedGroups.includes(r.group));
            const pass = [], fail = [];

            for (const item of rules) {
                try {
                    const result = item.test.constructor.name === 'AsyncFunction'
                        ? await item.test()
                        : item.test();
                    if (result === true) pass.push(item.name);
                    else if (result === false) fail.push({ name: item.name, fix: item.fix });
                } catch (e) {
                    fail.push({ name: item.name, fix: item.fix, error: e.message });
                }
            }

            results.push({ stage: s, passed: pass.length, failed: fail.length, failedItems: fail, passedItems: pass });
            try { W()._getPlayerContext().gs = 'IDLE'; } catch (e) {}
        }

        // 生成报告（内联每一项）
        const tp = results.reduce((s, r) => s + (r.passed || 0), 0);
        const tf = results.reduce((s, r) => s + (r.failed || 0), 0);
        statusEl.textContent = `✅ 通过${tp}，失败${tf}`;
        reportEl.innerHTML = results.map(r => {
            if (r.error) return `<div class="stage-result"><span class="stage-name">第${r.stage}关 ❌</span> ${r.error}</div>`;
            let html = `<div class="stage-result"><span class="stage-name">第${r.stage}关 ${r.failed === 0 ? '✅' : '⚠️'}</span>`;
            if (r.passedItems.length) html += '<br><span style="color:#4caf50;">✅ ' + r.passedItems.join('</span><br><span style="color:#4caf50;">✅ ') + '</span>';
            if (r.failedItems.length) html += '<br><span style="color:#f44336;">❌ ' + r.failedItems.map(f => f.name + ' → ' + f.fix).join('</span><br><span style="color:#f44336;">❌ ') + '</span>';
            html += '</div>';
            return html;
        }).join('');

        // 生成汇总文本
        const fullText = generateReport(results);
        copyFullBtn.style.display = 'block';
        copyFullBtn.onclick = () => navigator.clipboard.writeText(fullText);

        const summary = generateSummary(results, selectedStages.length);
        if (summary) {
            copySumBtn.style.display = 'block';
            copySumBtn.onclick = () => navigator.clipboard.writeText(summary);
        }

        // 存储历史
        saveHistory(results);

    } catch (e) {
        statusEl.textContent = '❌ ' + e.message;
        reportEl.innerHTML = `<div class="stage-result">❌ ${e.message}</div>`;
    } finally {
        runBtn.disabled = false;
        runBtn.textContent = '🤖 开始全面体检';
        setTimeout(() => { progCont.style.display = 'none'; }, 5000);
    }
}

async function safeSelectStage(stage, W, waitCtx) {
    try {
        // 先尝试通过主控暴露的全局函数直接切换（需要 13main-5v5-test.js V3.0.2+）
        if (typeof W().selectStage === 'function') {
            W().selectStage(stage);
            await new Promise(r => setTimeout(r, 600));
            await waitCtx(25000);
            return;
        }
    } catch (e) {
        console.warn('safeSelectStage direct call failed, falling back', e);
    }
    throw new Error('当前游戏版本不支持自动选关，请刷新游戏页面');
}

function generateReport(results) {
    let text = `✅ 全关完成\n\n`;
    results.forEach(r => {
        if (r.error) { text += `第${r.stage}关 ❌ ${r.error}\n`; return; }
        text += `第${r.stage}关 ${r.failed === 0 ? '✅' : '⚠️'}\n`;
        if (r.passedItems.length) text += r.passedItems.map(p => '  ✅ ' + p).join('\n') + '\n';
        if (r.failedItems.length) text += r.failedItems.map(f => '  ❌ ' + f.name + ' → ' + f.fix).join('\n') + '\n';
        text += '\n';
    });
    return text;
}

function generateSummary(results, totalStages) {
    const common = {};
    results.forEach(r => {
        if (!r.failedItems) return;
        r.failedItems.forEach(f => {
            if (!common[f.name]) common[f.name] = { fix: f.fix, stages: [] };
            common[f.name].stages.push(r.stage);
        });
    });
    const entries = Object.entries(common);
    if (!entries.length) return null;
    return '汇总失败项：\n' + entries.map(([name, info]) =>
        `❌ ${name} (${info.stages.length === totalStages ? '全部关卡' : '关卡 ' + info.stages.join(', ')})\n  修复：${info.fix}`
    ).join('\n\n');
}

function saveHistory(results) {
    const tp = results.reduce((s, r) => s + (r.passed || 0), 0);
    const tf = results.reduce((s, r) => s + (r.failed || 0), 0);
    const hist = JSON.parse(localStorage.getItem('ming_test_history') || '[]');
    hist.unshift({ id: Date.now(), time: new Date().toLocaleString(), pass: tp, fail: tf, text: generateReport(results) });
    if (hist.length > 50) hist.pop();
    localStorage.setItem('ming_test_history', JSON.stringify(hist));
}