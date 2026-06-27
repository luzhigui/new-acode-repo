// tests/health-check.js - 全面体检（合并自37health-core+38health-ui）

import { createHealthRules } from './health-rules.js';
import { runTests } from './test-utils.js';
import { loadQuizBank } from './test-utils.js';

export const VER = 'tests/health-check.js V3.0.0';

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

    // 30test-runner.html 已移入 tools/，需要从根目录找游戏页面
    const baseUrl = window.location.href.replace(/tools\/.*$/, '');
    const gameUrl = baseUrl + 'mode-5v5-test.html?t=' + Date.now();
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
        statusEl.textContent = '等待封面按钮...';
        const coverBtn = await waitFor('#coverStartBtn');
        coverBtn.click();
        await new Promise(r => setTimeout(r, 800));
        // 封面点击后等待阵容初始化
        statusEl.textContent = '等待阵容初始化...';
        await waitCtx(20000);

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
    // ==================== 标签页切换 ====================
    document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
    }));

    // ==================== 核心测试 ====================
    document.getElementById('runBtn').addEventListener('click', async () => {
        const resDiv = document.getElementById('results'), sum = document.getElementById('coreSummary');
        resDiv.innerHTML = ''; sum.style.display = 'none';
        const log = (m) => { const d = document.createElement('div'); d.className = 'result pass-line'; d.textContent = m; resDiv.appendChild(d); };
        const err = (m) => { const d = document.createElement('div'); d.className = 'result fail-line'; d.textContent = m; resDiv.appendChild(d); };
        try {
            const r = await runTests(log, err);
            sum.style.display = 'block';
            sum.textContent = '📋 通过' + r.passed + '，失败' + r.failed + (r.failed === 0 ? ' 🎉' : '');
        } catch (e) { err('❌ ' + e.message); }
    });

    // ==================== 环境诊断（已下掉页签，保留代码兼容） ====================
    const diagCont = document.getElementById('diagnosisContainer');
    if (diagCont) {
        const diagItems = [
            { g: '🎵', n: 'AudioManager', t: () => !!window.AudioManager, f: '确认 28audio 已加载', reqGame: true },
            { g: '⚔️', n: '固定单位=3', t: () => { var c = window._getPlayerContext?.(); return c?.UI?.allyTeam?.filter(u => u.fixed).length === 3; }, f: '检查 doInitBattle', reqGame: true },
            { g: '⚔️', n: '明教pos非-1', t: () => { var c = window._getPlayerContext?.(); return c?.UI?.allyTeam?.every(u => u.pos !== -1); }, f: '改为 null', reqGame: true },
            { g: '⚔️', n: '六大派pos合法', t: () => { var c = window._getPlayerContext?.(); return c?.UI?.enemyTeam?.every(u => u.pos >= 1 && u.pos <= 9); }, f: '检查兜底', reqGame: true },
            { g: '📦', n: '错误面板', t: () => !!document.getElementById('errorCapturePanel'), f: '24 未加载', reqGame: true },
            { g: '📦', n: '06核心', t: () => typeof window.VER_CORE !== 'undefined', f: '检查 06', reqGame: true },
            { g: '📦', n: '10播放器', t: () => typeof window.VER_PLAYER_CORE !== 'undefined', f: '检查 10', reqGame: true },
        ];
        const inGamePage = () => typeof window.VER_CORE !== 'undefined';
        var groups = {}; diagItems.forEach(i => { if (!groups[i.g]) groups[i.g] = []; groups[i.g].push(i); });

        var gdAll = document.createElement('div');
        gdAll.innerHTML = '<div style="margin-bottom:8px;padding:6px;background:#2a2a4e;border-radius:4px;color:#aaa;font-size:12px;">⚠️ 以下诊断项需要在 mode-5v5-test.html 游戏页面内运行，在 30test-runner 页面里大部分项目会因全局变量未挂载而显示失败。</div><button id="runAllDiagBtn" style="width:auto;padding:8px 16px;margin:0 0 12px 0;font-size:13px;">🔍 全部诊断</button>';
        diagCont.appendChild(gdAll);

        for (var gn in groups) {
            var gd = document.createElement('div');
            gd.innerHTML = '<div class="group-title">' + gn + '</div><div class="diagnosis-grid"></div>';
            var grid = gd.querySelector('.diagnosis-grid');
            groups[gn].forEach((it, idx) => {
                var card = document.createElement('div'); card.className = 'diag-card pending'; card.id = 'diag-' + gn + '-' + idx;
                card.innerHTML = '<div class="diag-name">' + it.n + '</div><div class="diag-status"><span class="pending-text">⏳</span></div><div class="diag-fix">🔧 ' + it.f + '</div><button class="diag-btn run" data-g="' + gn + '" data-i="' + idx + '">▶</button>';
                grid.appendChild(card);
            });
            diagCont.appendChild(gd);
        }

        async function runOneDiag(gn, idx) {
            var item = groups[gn][idx];
            var card = document.getElementById('diag-' + gn + '-' + idx), span = card.querySelector('.diag-status span');
            var btn = card.querySelector('.diag-btn');
            btn.textContent = '⏳'; btn.disabled = true; card.classList.remove('pass', 'fail'); card.classList.add('pending');
            try {
                if (item.reqGame && !inGamePage()) {
                    card.classList.remove('pending'); btn.textContent = '▶'; btn.classList.remove('retest'); btn.classList.add('run');
                    card.classList.add('fail'); span.className = 'fail-text'; span.textContent = '未加载';
                    return;
                }
                var r = item.t.constructor.name === 'AsyncFunction' ? await item.t() : item.t();
                card.classList.remove('pending'); btn.textContent = '🔄'; btn.classList.remove('run'); btn.classList.add('retest');
                if (r === true) { card.classList.add('pass'); span.className = 'pass-text'; span.textContent = '✅'; }
                else if (r === null) { card.classList.add('pending'); span.className = 'pending-text'; span.textContent = '⚠️'; }
                else { card.classList.add('fail'); span.className = 'fail-text'; span.textContent = '❌'; }
            } catch (err) { card.classList.add('fail'); span.className = 'fail-text'; span.textContent = '❌'; }
            finally { btn.disabled = false; }
        }

        diagCont.addEventListener('click', async (e) => {
            if (e.target.id === 'runAllDiagBtn') {
                e.target.disabled = true; e.target.textContent = '⏳ 全部诊断中...';
                for (var gn in groups) { for (var idx = 0; idx < groups[gn].length; idx++) await runOneDiag(gn, idx); }
                e.target.disabled = false; e.target.textContent = '🔍 全部诊断';
                return;
            }
            if (!e.target.classList.contains('run') && !e.target.classList.contains('retest')) return;
            var btn = e.target, gn = btn.dataset.g, idx = parseInt(btn.dataset.i);
            await runOneDiag(gn, idx);
        });
    }

    // ==================== 全面体检 UI 绑定 ====================
    const runBtn = document.getElementById('runAutoCheckBtn');
    const statusEl = document.getElementById('autoStatus');
    const reportEl = document.getElementById('autoReport');
    const copySumBtn = document.getElementById('copySummaryBtn');
    const copyFullBtn = document.getElementById('copyFullBtn');
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

    // 初始化规则组复选框
    const allGroups = ['🚀 启动与加载', '🎨 九宫格基础', '❤️ 血条与属性', '✨ Buff 系统', '🎭 状态样式', '🎵 音效', '🎬 特效', '👹 精英', '🔗 数据', '⚙️ 核心参数与公式', '⚙️ 引擎', '📋 日志', '📍 站位'];
    groupCbs.innerHTML = allGroups.map(g => '<label><input type="checkbox" value="' + g + '" checked> ' + (g.split(' ')[1] || g) + '</label>').join('');

    // ==================== 答题功能 ====================
    let quizActive = false;
    let quizScore = 0;
    const quizBank = loadQuizBank();

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
    document.getElementById('toggleFeedback').addEventListener('click', () => {
        feedbackArea.style.display = feedbackArea.style.display === 'block' ? 'none' : 'block';
        loadFeedbackHistory();
    });
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
            iframe, statusEl, reportEl, copySumBtn, copyFullBtn, runBtn,
            progCont, progFill, progText, stageCbs, groupCbs
        };
        runHealthCheck(config).then(() => {
            stopQuiz();
            loadHistory();
        });
    });
}