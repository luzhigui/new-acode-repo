// 38health-ui.js - 光明顶 5v5 测试与体检 UI 交互模块 V2.2
// 2026-06-25 kimi: 清空历史记录改用自定义确认弹窗；环境诊断代码用 if(diagCont) 包裹，兼容 30test-runner 下掉诊断页签
// 预估行数: 230, 发送时间: 20260625 18:00, 版本: V2.2.0
// 联动: 被 30test-runner.html 调用，集中管理所有 UI 逻辑
// 变更: 将 30 内联 JS 全部移入，30 只保留 HTML 骨架

import { runTests } from './25unit-tests.js';
import { runHealthCheck } from './37health-core.js';
import { loadQuizBank, saveCustomQuiz } from './35quiz-bank.js';

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
            const r = runTests(log, err);
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
                allOpts.forEach(o => o.style.pointerEvents = 'none');
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
        const list = JSON.parse(localStorage.getItem('ming_feedback') || '[]');
        list.unshift({ time: new Date().toLocaleString(), text });
        if (list.length > 50) list.pop();
        localStorage.setItem('ming_feedback', JSON.stringify(list));
        feedbackInput.value = '';
        loadFeedbackHistory();
    });
    function loadFeedbackHistory() {
        const list = JSON.parse(localStorage.getItem('ming_feedback') || '[]');
        feedbackHistory.innerHTML = list.length ? list.map((f, i) => '<div>' + f.time + ' ' + f.text + ' <button data-fi="' + i + '" style="font-size:10px;padding:0 4px;">复制</button></div>').join('') : '暂无反馈记录';
        feedbackHistory.querySelectorAll('button').forEach(b => b.addEventListener('click', (e) => {
            const i = parseInt(e.target.dataset.fi);
            const item = JSON.parse(localStorage.getItem('ming_feedback') || '[]')[i];
            if (item) navigator.clipboard.writeText(item.time + ' ' + item.text).then(() => statusEl.textContent = '📋 已复制');
        }));
    }

    // ==================== 历史记录 ====================
    function saveHistoryList(list) {
        if (list.length > 50) list = list.slice(0, 50);
        localStorage.setItem('ming_test_history', JSON.stringify(list));
    }

    function loadHistory() {
        const hist = JSON.parse(localStorage.getItem('ming_test_history') || '[]');
        if (!hist.length) { historyPanel.style.display = 'none'; historyPanel.innerHTML = ''; return; }
        historyPanel.innerHTML = '<div style="color:#ffd700;font-weight:bold;display:flex;justify-content:space-between;align-items:center;"><span>📜 历史记录</span><button id="clearHistoryBtn" style="font-size:10px;padding:2px 8px;background:#f44336;color:#fff;border:none;border-radius:4px;">清空</button></div>'
            + hist.map((h, i) => '<div class="history-item" data-id="' + (h.id || i) + '"><span>' + h.time + ' 通过' + h.pass + ' 失败' + h.fail + '</span><span><button data-action="copy" data-i="' + i + '" style="font-size:10px;padding:2px 6px;">复制</button><button data-action="del" data-i="' + i + '" style="font-size:10px;padding:2px 6px;margin-left:4px;background:#f44336;color:#fff;border:none;border-radius:4px;">删除</button></span></div>').join('');
        historyPanel.style.display = 'block';
        historyPanel.querySelectorAll('button').forEach(b => b.addEventListener('click', (e) => {
            e.stopPropagation();
            const i = parseInt(e.target.dataset.i);
            const action = e.target.dataset.action;
            let list = JSON.parse(localStorage.getItem('ming_test_history') || '[]');
            if (action === 'copy') {
                const h = list[i];
                if (h) navigator.clipboard.writeText(h.text).then(() => statusEl.textContent = '📋 已复制');
            } else if (action === 'del') {
                list.splice(i, 1);
                saveHistoryList(list);
                loadHistory();
            } else if (e.target.id === 'clearHistoryBtn') {
                showCustomConfirm('确定清空全部历史记录？', () => { localStorage.removeItem('ming_test_history'); loadHistory(); });
            }
        }));
    }
    loadHistory();

    // ==================== 开始体检 ====================
    runBtn.addEventListener('click', () => {
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