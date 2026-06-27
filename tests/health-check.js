// tests/health-check.js - 全面体检（合并自37health-core+38health-ui）

import { createHealthRules } from './health-rules.js';
import { runTests } from './test-utils.js';
import { loadQuizBank } from './test-utils.js';

export const VER = 'tests/health-check.js V3.0.0';

export async function runHealthCheck(config) {
    const {
        iframe, statusEl, reportEl, copySumBtn, copyFullBtn, runBtn,
        progCont, progFill, progText, stageCbs, groupCbs, compReportEl,
        exportJsonBtn, errorToastEl
    } = config;

    const selectedStages = Array.from(stageCbs.querySelectorAll('input:checked'))
        .map(cb => parseInt(cb.value)).sort((a, b) => a - b);
    const selectedGroups = Array.from(groupCbs.querySelectorAll('input:checked'))
        .map(cb => cb.value);

    if (!selectedStages.length) {
        statusEl.textContent = '请至少选择一个关卡';
        return;
    }

    const startTime = Date.now();
    const runtimeErrors = [];
    let lastErrorAt = 0;

    reportEl.innerHTML = '';
    if (compReportEl) compReportEl.innerHTML = '';
    copySumBtn.style.display = 'none';
    copyFullBtn.style.display = 'none';
    if (exportJsonBtn) exportJsonBtn.style.display = 'none';
    statusEl.textContent = '正在启动...';
    runBtn.disabled = true;
    runBtn.textContent = '⏳ 检测中...';
    progCont.style.display = 'block';
    progFill.style.width = '0%';
    progText.textContent = '初始化...';

    const W = () => iframe.contentWindow;
    const D = () => iframe.contentDocument || W().document;

    // 实时错误监控：捕获 iframe 中的 error / unhandledrejection / console.error
    function attachRuntimeMonitor() {
        const win = W();
        if (!win) return;
        const pushErr = (type, msg, extra) => {
            const ts = new Date().toLocaleTimeString();
            runtimeErrors.push({ type, message: msg, time: ts, extra });
            lastErrorAt = Date.now();
            if (errorToastEl) {
                errorToastEl.textContent = `⚠️ 检测到 ${runtimeErrors.length} 个运行时异常`;
                errorToastEl.style.display = 'block';
            }
        };
        try {
            win.addEventListener('error', e => {
                const msg = e.error && e.error.stack
                    ? e.error.stack
                    : (e.message + ' @ ' + e.filename + ':' + e.lineno);
                pushErr('error', msg, { filename: e.filename, lineno: e.lineno });
            });
            win.addEventListener('unhandledrejection', e => {
                const reason = e.reason;
                const msg = reason && reason.stack
                    ? reason.stack
                    : (reason ? (reason.message || JSON.stringify(reason)) : '未处理的 Promise 拒绝');
                pushErr('unhandledrejection', msg, {});
            });
            const origError = win.console.error;
            win.console.error = function(...args) {
                pushErr('console.error', args.map(a => (a && a.stack) || String(a)).join(' '), {});
                origError.apply(win.console, args);
            };
        } catch (e) {
            console.warn('attachRuntimeMonitor failed:', e);
        }
    }

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
            if (ctx?.UI?.allyTeam?.length >= 5 && ctx?.UI?.enemyTeam?.length >= 5) resolve(ctx);
            else if (Date.now() - start > timeout) reject(new Error('等待游戏上下文超时'));
            else setTimeout(check, 500);
        };
        check();
    });

    // 等待游戏模块初始化完成（_getPlayerContext 已挂载即可，不检查阵容）
    const waitGameReady = (timeout = 20000) => new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            try {
                const ctx = W()._getPlayerContext?.();
                if (ctx) resolve(ctx);
                else if (Date.now() - start > timeout) reject(new Error('游戏模块初始化超时'));
                else setTimeout(check, 400);
            } catch (e) {
                if (Date.now() - start > timeout) reject(new Error('游戏模块初始化超时'));
                else setTimeout(check, 400);
            }
        };
        check();
    });

    // 主代码健康检查闸门：九宫格与阵容就绪前暂停测试
    const waitForGameHealthy = (timeout = 25000) => new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            try {
                const doc = D();
                const allyGrid = doc?.getElementById('allyGrid');
                const enemyGrid = doc?.getElementById('enemyGrid');
                const ctx = W()._getPlayerContext?.();
                const allyOk = allyGrid?.children.length === 9;
                const enemyOk = enemyGrid?.children.length === 9;
                const teamOk = ctx?.UI?.allyTeam?.length >= 5 && ctx?.UI?.enemyTeam?.length >= 5;
                if (allyOk && enemyOk && teamOk) resolve({ allyOk, enemyOk, teamOk });
                else if (Date.now() - start > timeout) {
                    const reasons = [];
                    if (!allyOk) reasons.push('友方九宫格未渲染');
                    if (!enemyOk) reasons.push('敌方九宫格未渲染');
                    if (!teamOk) reasons.push('阵容未初始化');
                    reject(new Error('主代码未就绪：' + reasons.join('，')));
                } else setTimeout(check, 500);
            } catch (e) {
                if (Date.now() - start > timeout) reject(new Error('主代码健康检查超时'));
                else setTimeout(check, 500);
            }
        };
        check();
    });

    // 30test-runner.html 已移入 tools/，需要从根目录找游戏页面
    const baseUrl = window.location.href.replace(/tools\/.*$/, '').replace(/\/[^/]*$/, '/');
    const gameUrl = baseUrl + 'game.html?t=' + Date.now();
    iframe.style.display = 'block';
    iframe.src = gameUrl;

    try {
        statusEl.textContent = '正在加载游戏页面...';
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('游戏加载超时')), 20000);
            iframe.addEventListener('load', () => { clearTimeout(timeout); resolve(); }, { once: true });
        });

        // 等模块初始化后再点封面，避免事件监听还没挂上
        statusEl.textContent = '等待模块初始化...';
        await waitGameReady(20000);

        // 挂载运行时错误监控
        attachRuntimeMonitor();

        statusEl.textContent = '等待封面按钮...';
        const coverBtn = await waitFor('#coverStartBtn');
        coverBtn.click();
        await new Promise(r => setTimeout(r, 800));
        // 封面点击后等待阵容初始化
        statusEl.textContent = '等待阵容初始化...';
        await waitCtx(20000);

        // 主代码健康检查闸门
        statusEl.textContent = '检查主代码健康状态...';
        try {
            await waitForGameHealthy(25000);
            statusEl.textContent = '主代码就绪，开始体检';
        } catch (healthErr) {
            throw new Error(healthErr.message + '；测试流程已暂停，请修复主代码后重试。');
        }

        const results = [];
        // 规则在循环外创建一次，避免每关重复
        const allRules = createHealthRules(W(), D());

        for (let idx = 0; idx < selectedStages.length; idx++) {
            const s = selectedStages[idx];
            const progress = Math.floor(((idx + 1) / selectedStages.length) * 100);
            progFill.style.width = progress + '%';
            progText.textContent = `第 ${s} 关 (${idx + 1}/${selectedStages.length})`;
            statusEl.textContent = `正在检测第 ${s} 关...`;

            try {
                if (idx === 0) {
                    // 首关先重置为干净状态，确保阵容新鲜
                    if (typeof W().doManualReset === 'function') W().doManualReset();
                    await waitCtx(15000);
                    // 如果首关不是第1关，需要额外切换
                    if (s !== 1) await safeSelectStage(s, W, waitCtx);
                } else {
                    await safeSelectStage(s, W, waitCtx);
                }
            } catch (e) {
                results.push({ stage: s, error: '关卡初始化超时: ' + (e.message || '') });
                continue;
            }

            const ctx = W()._getPlayerContext();
            if (!ctx) {
                results.push({ stage: s, error: '游戏上下文不可用' });
                continue;
            }

            const rules = allRules.filter(r => selectedGroups.includes(r.group));
            const pass = [], fail = [], skip = [];

            // 每关切换后模拟 1-2 回合战斗，让单位产生运行时状态
            try {
                statusEl.textContent = `第 ${s} 关 - 模拟战斗中...`;
                const ctx = W()._getPlayerContext();
                const win = W();
                if (ctx && ctx.UI && ctx.UI.allyTeam && ctx.UI.enemyTeam
                    && ctx.UI.allyTeam.length >= 5 && ctx.UI.enemyTeam.length >= 5
                    && typeof win.runBattle === 'function') {
                    // 模拟 1 回合，让单位产生 _flash, _resting 等状态
                    for (let simRound = 0; simRound < 1; simRound++) {
                        try {
                            const battleLog = win.runBattle(ctx.UI.allyTeam, ctx.UI.enemyTeam, ctx.currentStage || s);
                            // 播放几条日志让状态生效
                            if (battleLog && battleLog.length) {
                                for (let li = 0; li < Math.min(3, battleLog.length); li++) {
                                    const entry = battleLog[li];
                                    if (entry.type === 'attack' || entry.type === 'death' || entry.type === 'buff-summon') {
                                        if (entry.type === 'attack' && entry.targetIdx != null) {
                                            const target = entry.targetIdx < ctx.UI.allyTeam.length
                                                ? ctx.UI.allyTeam[entry.targetIdx]
                                                : ctx.UI.enemyTeam[entry.targetIdx - ctx.UI.allyTeam.length];
                                            if (target && entry.dmg != null) target.hp = Math.max(0, target.hp - entry.dmg);
                                            if (entry.crit) target._flash = 'attack';
                                        }
                                        if (entry.type === 'death' && entry.targetIdx != null) {
                                            const target = entry.targetIdx < ctx.UI.allyTeam.length
                                                ? ctx.UI.allyTeam[entry.targetIdx]
                                                : ctx.UI.enemyTeam[entry.targetIdx - ctx.UI.allyTeam.length];
                                            if (target) { target._isDead = true; target.alive = false; target._flash = 'dead'; }
                                        }
                                    }
                                }
                            }
                        } catch (simErr) {
                            // 模拟战斗失败不影响体检
                            console.warn('模拟战斗失败:', simErr);
                        }
                    }
                }
            } catch (simOuterErr) {
                console.warn('模拟战斗阶段失败:', simOuterErr);
            }

            // 后台分片执行规则，避免阻塞父页面
            await new Promise((resolve) => {
                let i = 0;
                function next() {
                    if (i >= rules.length) { resolve(); return; }
                    const item = rules[i++];
                    const ruleStart = Date.now();
                    Promise.resolve().then(() => {
                        const isAsync = item.test.constructor.name === 'AsyncFunction';
                        return isAsync ? item.test() : item.test();
                    }).then(result => {
                        const cost = Date.now() - ruleStart;
                        if (result === true) pass.push({ name: item.name, cost });
                        else if (result === false) fail.push({ name: item.name, fix: item.fix, cost, group: item.group });
                        else if (result === null || result === undefined) skip.push({ name: item.name, cost });
                        else fail.push({ name: item.name, fix: item.fix, error: '非预期返回值: ' + result, cost, group: item.group });
                    }).catch(e => {
                        const cost = Date.now() - ruleStart;
                        fail.push({ name: item.name, fix: item.fix, error: e.message, cost, group: item.group });
                    }).then(() => {
                        // 让出主线程，实现后台运行效果
                        setTimeout(next, 0);
                    });
                }
                next();
            });

            results.push({ stage: s, passed: pass.length, failed: fail.length, skipped: skip.length, failedItems: fail, passedItems: pass.map(p => p.name), skippedItems: skip.map(s => s.name) });
            try { W()._getPlayerContext().gs = 'IDLE'; } catch (e) {}
        }

        // 生成综合测试报告
        const totalTime = Date.now() - startTime;
        const comprehensive = generateComprehensiveReport(results, selectedStages, selectedGroups, totalTime, runtimeErrors);

        // 生成内联明细
        const tp = results.reduce((s, r) => s + (r.passed || 0), 0);
        const tf = results.reduce((s, r) => s + (r.failed || 0), 0);
        const ts = results.reduce((s, r) => s + (r.skipped || 0), 0);
        statusEl.textContent = `✅ 通过${tp}，❌ 失败${tf}，⏭️ 跳过${ts}，⏱️ ${Math.round(totalTime / 1000)}s`;
        reportEl.innerHTML = results.map(r => {
            if (r.error) return `<div class="stage-result"><span class="stage-name">第${r.stage}关 ❌</span> ${r.error}</div>`;
            let html = `<div class="stage-result"><span class="stage-name">第${r.stage}关 ${r.failed === 0 ? '✅' : '⚠️'}</span>`;
            if (r.passedItems.length) html += '<br><span style="color:#4caf50;">✅ ' + r.passedItems.join('</span><br><span style="color:#4caf50;">✅ ') + '</span>';
            if (r.failedItems.length) html += '<br><span style="color:#f44336;">❌ ' + r.failedItems.map(f => f.name + (f.error ? ` (${f.error})` : '') + ' → ' + f.fix).join('</span><br><span style="color:#f44336;">❌ ') + '</span>';
            if (r.skippedItems.length) html += '<br><span style="color:#ff9800;">⏭️ ' + r.skippedItems.join('</span><br><span style="color:#ff9800;">⏭️ ') + '</span>';
            html += '</div>';
            return html;
        }).join('');

        // 渲染综合报告
        if (compReportEl) {
            compReportEl.innerHTML = comprehensive.html;
            compReportEl.style.display = 'block';
        }

        // 生成汇总文本
        const fullText = generateReport(results, runtimeErrors);
        copyFullBtn.style.display = 'block';
        copyFullBtn.onclick = () => navigator.clipboard.writeText(fullText);

        const summary = generateSummary(results, selectedStages.length);
        if (summary) {
            copySumBtn.style.display = 'block';
            copySumBtn.onclick = () => navigator.clipboard.writeText(summary);
        }

        // 导出 JSON
        if (exportJsonBtn) {
            exportJsonBtn.style.display = 'block';
            exportJsonBtn.onclick = () => {
                const blob = new Blob([JSON.stringify(comprehensive.json, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `health-report-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
            };
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
            await new Promise(r => setTimeout(r, 800));
            await waitCtx(25000);
            return;
        }
    } catch (e) {
        console.warn('safeSelectStage direct call failed, falling back', e);
    }
    // 兜底：尝试 doManualReset 后手动切换
    try {
        if (typeof W().doManualReset === 'function') {
            W().doManualReset();
            await new Promise(r => setTimeout(r, 800));
            // 重置后尝试用 selectStage 切换（doManualReset 复位到第1关）
            if (typeof W().selectStage === 'function') {
                W().selectStage(stage);
            } else {
                try { W()._getPlayerContext().currentStage = stage; } catch(e) {}
            }
            await waitCtx(25000);
            return;
        }
    } catch (e2) {
        console.warn('safeSelectStage fallback failed', e2);
    }
    throw new Error('当前游戏版本不支持自动选关，请刷新游戏页面');
}

function generateReport(results, runtimeErrors) {
    let text = `✅ 全关完成\n\n`;
    results.forEach(r => {
        if (r.error) { text += `第${r.stage}关 ❌ ${r.error}\n`; return; }
        text += `第${r.stage}关 ${r.failed === 0 ? '✅' : '⚠️'}\n`;
        if (r.passedItems.length) text += r.passedItems.map(p => '  ✅ ' + p).join('\n') + '\n';
        if (r.failedItems.length) text += r.failedItems.map(f => '  ❌ ' + f.name + (f.error ? ` (${f.error})` : '') + ' → ' + f.fix).join('\n') + '\n';
        text += '\n';
    });
    if (runtimeErrors && runtimeErrors.length) {
        text += '\n🚨 运行时异常捕获（' + runtimeErrors.length + '条）\n';
        text += runtimeErrors.map(e => `[${e.time}][${e.type}] ${e.message}`).join('\n') + '\n';
    }
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

function generateComprehensiveReport(results, selectedStages, selectedGroups, totalTime, runtimeErrors) {
    const totalRules = results.reduce((s, r) => s + (r.passed || 0) + (r.failed || 0) + (r.skipped || 0), 0);
    const totalPassed = results.reduce((s, r) => s + (r.passed || 0), 0);
    const totalFailed = results.reduce((s, r) => s + (r.failed || 0), 0);
    const totalSkipped = results.reduce((s, r) => s + (r.skipped || 0), 0);

    // 按规则组统计失败率
    const groupStats = {};
    results.forEach(r => {
        (r.failedItems || []).forEach(f => {
            const g = f.group || '未分类';
            if (!groupStats[g]) groupStats[g] = { fail: 0, names: [] };
            groupStats[g].fail++;
            if (!groupStats[g].names.includes(f.name)) groupStats[g].names.push(f.name);
        });
    });

    // 优先级评估：启动/引擎/九宫格为 P0
    function priorityOf(name, group) {
        const p0 = ['🚀 启动与加载', '⚙️ 引擎', '🎨 九宫格基础'];
        const p1 = ['✨ Buff 系统', '🎭 状态样式', '❤️ 血条与属性'];
        if (p0.includes(group)) return 'P0';
        if (p1.includes(group)) return 'P1';
        return 'P2';
    }

    const priority = { P0: [], P1: [], P2: [] };
    results.forEach(r => {
        (r.failedItems || []).forEach(f => {
            const p = priorityOf(f.name, f.group);
            if (!priority[p].includes(f.name)) priority[p].push(f.name);
        });
    });

    // 性能指标
    const perStage = results.map(r => ({
        stage: r.stage,
        passed: r.passed || 0,
        failed: r.failed || 0,
        skipped: r.skipped || 0
    }));

    const json = {
        generatedAt: new Date().toISOString(),
        coverage: {
            stages: selectedStages,
            groups: selectedGroups,
            totalRules,
            totalPassed,
            totalFailed,
            totalSkipped,
            passRate: totalRules ? Math.round((totalPassed / totalRules) * 1000) / 10 : 0
        },
        runtimeErrors,
        errorsByGroup: groupStats,
        priority,
        performance: {
            totalTimeMs: totalTime,
            perStage
        }
    };

    const html = `
        <div class="stage-result" style="border:1px solid #ffd700;">
            <div class="stage-name">📊 综合测试报告</div>
            <div style="margin:6px 0;">⏱️ 总耗时：${Math.round(totalTime / 1000)}s &nbsp;|&nbsp; 关卡：${selectedStages.length} &nbsp;|&nbsp; 规则组：${selectedGroups.length}</div>
            <div style="margin:6px 0;">📈 覆盖率：${totalRules} 条规则 &nbsp;|&nbsp; 通过率：${json.coverage.passRate}%</div>
            <div style="margin:6px 0;">✅ 通过 ${totalPassed} &nbsp;❌ 失败 ${totalFailed} &nbsp;⏭️ 跳过 ${totalSkipped}</div>
            ${runtimeErrors.length ? `<div style="margin:6px 0;color:#f44336;">🚨 运行时异常：${runtimeErrors.length} 条</div>` : ''}
            <div style="margin:8px 0;color:#ffd700;">🔥 关键问题：</div>
            <div style="padding-left:12px;">
                ${priority.P0.length ? `<div style="color:#f44336;">P0（阻塞）：${priority.P0.join('、')}</div>` : '<div style="color:#4caf50;">P0 无阻塞问题</div>'}
                ${priority.P1.length ? `<div style="color:#ff9800;">P1（重要）：${priority.P1.join('、')}</div>` : ''}
                ${priority.P2.length ? `<div style="color:#aaa;">P2（一般）：${priority.P2.join('、')}</div>` : ''}
            </div>
        </div>
    `;

    return { html, json };
}

function saveHistory(results) {
    try {
        const tp = results.reduce((s, r) => s + (r.passed || 0), 0);
        const tf = results.reduce((s, r) => s + (r.failed || 0), 0);
        const hist = JSON.parse(localStorage.getItem('ming_test_history') || '[]');
        hist.unshift({ id: Date.now(), time: new Date().toLocaleString(), pass: tp, fail: tf, text: generateReport(results) });
        if (hist.length > 50) hist.pop();
        localStorage.setItem('ming_test_history', JSON.stringify(hist));
    } catch (e) {
        console.warn('saveHistory failed:', e);
    }
}

function showCustomConfirm(msg, onConfirm, onCancel) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;';
    const box = document.createElement('div');
    box.style.cssText = 'background:#16213e;border:2px solid #ffd700;border-radius:12px;padding:20px;max-width:300px;text-align:center;color:#eee;';
    box.innerHTML = '<div style="margin-bottom:16px;font-size:14px;">' + msg + '</div>';
    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:12px;justify-content:center;';
    const ok = document.createElement('button');
    ok.textContent = '确定';
    ok.style.cssText = 'padding:8px 16px;background:#f44336;color:#fff;border:none;border-radius:6px;font-weight:bold;cursor:pointer;';
    const cancel = document.createElement('button');
    cancel.textContent = '取消';
    cancel.style.cssText = 'padding:8px 16px;background:#444;color:#fff;border:none;border-radius:6px;cursor:pointer;';
    ok.addEventListener('click', () => { document.body.removeChild(overlay); if (onConfirm) onConfirm(); });
    cancel.addEventListener('click', () => { document.body.removeChild(overlay); if (onCancel) onCancel(); });
    btns.appendChild(ok); btns.appendChild(cancel);
    box.appendChild(btns); overlay.appendChild(box); document.body.appendChild(overlay);
}

export function initTestRunner() {
    // ==================== 全面体检 UI 绑定 ====================
    const runBtn = document.getElementById('runAutoCheckBtn');
    const statusEl = document.getElementById('autoStatus');
    const reportEl = document.getElementById('autoReport');
    const compReportEl = document.getElementById('comprehensiveReport');
    const errorToastEl = document.getElementById('errorToast');
    const copySumBtn = document.getElementById('copySummaryBtn');
    const copyFullBtn = document.getElementById('copyFullBtn');
    const exportJsonBtn = document.getElementById('exportJsonBtn');
    const progCont = document.getElementById('progressContainer');
    const progFill = document.getElementById('progressFill');
    const progText = document.getElementById('progressText');
    const stageCbs = document.getElementById('stageCheckboxes');
    const groupCbs = document.getElementById('groupCheckboxes');
    const quizPanel = document.getElementById('quizPanel');
    const quizQ = document.getElementById('quizQuestion');
    const quizOpts = document.getElementById('quizOptions');
    const quizFeed = document.getElementById('quizFeedback');
    const quizScoreEl = document.getElementById('quizScore');
    const feedbackArea = document.getElementById('feedbackArea');
    const feedbackInput = document.getElementById('feedbackInput');
    const feedbackHistory = document.getElementById('feedbackHistory');
    const historyPanel = document.getElementById('historyPanel');
    const iframe = document.getElementById('autoIframe');

    // 核心元素缺失则放弃初始化
    if (!runBtn || !groupCbs || !reportEl) {
        console.error('initTestRunner: 核心元素缺失', { runBtn: !!runBtn, groupCbs: !!groupCbs, reportEl: !!reportEl });
        return;
    }

    // 初始化规则组复选框
    const allGroups = ['🚀 启动与加载', '🎨 九宫格基础', '❤️ 血条与属性', '✨ Buff 系统', '🎭 状态样式', '🎵 音效', '🎬 特效', '👹 精英', '🔗 数据', '⚙️ 核心参数与公式', '⚙️ 引擎', '📋 日志', '📍 站位'];
    groupCbs.innerHTML = allGroups.map(g => '<label><input type="checkbox" value="' + g + '" checked> ' + (g.split(' ')[1] || g) + '</label>').join('');

    // ==================== 答题功能 ====================
    let quizActive = false;
    let quizScore = 0;
    let quizBank = [];
    try { quizBank = loadQuizBank(); } catch (e) { console.warn('loadQuizBank failed:', e); }

    function showQuiz() {
        if (!quizActive || !quizBank.length) return;
        const q = quizBank[Math.floor(Math.random() * quizBank.length)];
        quizQ.textContent = '❓ ' + q.q;
        quizOpts.innerHTML = '';
        q.o.forEach((opt, i) => {
            const btn = document.createElement('button');
            btn.className = 'quiz-option';
            btn.textContent = opt;
            btn.addEventListener('click', () => {
                if (btn.classList.contains('correct') || btn.classList.contains('wrong')) return;
                const allOpts = quizOpts.querySelectorAll('.quiz-option');
                allOpts.forEach(o => o.style.pointerEvents = 'none');
                if (i === q.a) {
                    btn.classList.add('correct');
                    quizScore += 10;
                    quizFeed.textContent = '✅ ' + q.e;
                } else {
                    btn.classList.add('wrong');
                    quizFeed.textContent = '❌ ' + q.e;
                    quizScore = Math.max(0, quizScore - 5);
                }
                quizScoreEl.textContent = '得分：' + quizScore;
                setTimeout(() => { if (quizActive) showQuiz(); }, 2500);
            });
            quizOpts.appendChild(btn);
        });
        quizFeed.textContent = '';
    }

    function startQuiz() {
        quizScore = 0;
        quizScoreEl.textContent = '得分：0';
        quizActive = true;
        quizPanel.style.display = 'block';
        showQuiz();
    }

    function stopQuiz() {
        quizActive = false;
        quizPanel.style.display = 'none';
    }

    // ==================== 快速反馈 ====================
    if (document.getElementById('toggleFeedback')) {
    document.getElementById('toggleFeedback').addEventListener('click', () => {
        feedbackArea.style.display = feedbackArea.style.display === 'block' ? 'none' : 'block';
        loadFeedbackHistory();
    });
    }
    if (document.getElementById('submitFeedback')) {
    document.getElementById('submitFeedback').addEventListener('click', () => {
        const text = feedbackInput.value.trim();
        if (!text) return;
        try {
            const list = JSON.parse(localStorage.getItem('ming_feedback') || '[]');
            list.unshift({ time: new Date().toLocaleString(), text });
            if (list.length > 50) list.pop();
            localStorage.setItem('ming_feedback', JSON.stringify(list));
        } catch (e) { console.warn('submitFeedback localStorage failed:', e); }
        feedbackInput.value = '';
        loadFeedbackHistory();
    });
    }
    function loadFeedbackHistory() {
        try {
            const list = JSON.parse(localStorage.getItem('ming_feedback') || '[]');
            feedbackHistory.innerHTML = list.length ? list.map((f, i) => '<div>' + f.time + ' ' + f.text + ' <button data-fi="' + i + '" style="font-size:10px;padding:0 4px;">复制</button></div>').join('') : '暂无反馈记录';
            feedbackHistory.querySelectorAll('button').forEach(b => b.addEventListener('click', (e) => {
                const i = parseInt(e.target.dataset.fi);
                const item = JSON.parse(localStorage.getItem('ming_feedback') || '[]')[i];
                if (item) navigator.clipboard.writeText(item.time + ' ' + item.text).then(() => statusEl.textContent = '📋 已复制').catch(() => {});
            }));
        } catch (e) { console.warn('loadFeedbackHistory failed:', e); }
    }

    // ==================== 历史记录 ====================
    function saveHistoryList(list) {
        if (list.length > 50) list = list.slice(0, 50);
        try { localStorage.setItem('ming_test_history', JSON.stringify(list)); } catch (e) {}
    }

    function loadHistory() {
        try {
            const hist = JSON.parse(localStorage.getItem('ming_test_history') || '[]');
            if (!hist.length) { historyPanel.style.display = 'none'; historyPanel.innerHTML = ''; return; }
            historyPanel.innerHTML = '<div style="color:#ffd700;font-weight:bold;display:flex;justify-content:space-between;align-items:center;"><span>📜 历史记录</span><button id="clearHistoryBtn" style="font-size:10px;padding:2px 8px;background:#f44336;color:#fff;border:none;border-radius:4px;">清空</button></div>'
                + hist.map((h, i) => '<div class="history-item" data-id="' + (h.id || i) + '"><span>' + h.time + ' 通过' + h.pass + ' 失败' + h.fail + '</span><span><button data-action="copy" data-id="' + (h.id || i) + '" style="font-size:10px;padding:2px 6px;">复制</button><button data-action="del" data-id="' + (h.id || i) + '" style="font-size:10px;padding:2px 6px;margin-left:4px;background:#f44336;color:#fff;border:none;border-radius:4px;">删除</button></span></div>').join('');
            historyPanel.style.display = 'block';
            historyPanel.querySelectorAll('button').forEach(b => b.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = e.target.dataset.id;
                const action = e.target.dataset.action;
                if (action === 'copy') {
                    const h = hist.find(item => String(item.id) === id);
                    if (h) navigator.clipboard.writeText(h.text).then(() => statusEl.textContent = '📋 已复制').catch(() => {});
                } else if (action === 'del') {
                    let list = JSON.parse(localStorage.getItem('ming_test_history') || '[]');
                    list = list.filter(item => String(item.id) !== id);
                    saveHistoryList(list);
                    loadHistory();
                } else if (e.target.id === 'clearHistoryBtn') {
                    showCustomConfirm('确定清空全部历史记录？', () => { try { localStorage.removeItem('ming_test_history'); } catch(e) {} loadHistory(); });
                }
            }));
        } catch (e) { console.warn('loadHistory failed:', e); }
    }
    loadHistory();

    // ==================== 开始体检 ====================
    runBtn.addEventListener('click', () => {
        if (runBtn.disabled) return;
        runBtn.disabled = true;
        runBtn.textContent = '⏳ 检测中...';
        startQuiz();
        const config = {
            iframe, statusEl, reportEl, compReportEl, errorToastEl,
            copySumBtn, copyFullBtn, exportJsonBtn, runBtn,
            progCont, progFill, progText, stageCbs, groupCbs
        };
        runHealthCheck(config).then(() => {
            stopQuiz();
            loadHistory();
        });
    });
}