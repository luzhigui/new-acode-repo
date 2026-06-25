// 38health-ui.js - 光明顶 5v5 测试与体检 UI 交互模块 V2.0
// 预估行数: 200, 发送时间: 20260625 18:00, 版本: V2.0.0
// 联动: 被 30test-runner.html 调用，集中管理所有 UI 逻辑
// 变更: 将 30 内联 JS 全部移入，30 只保留 HTML 骨架

import { runTests } from './25unit-tests.js';
import { runHealthCheck } from './37health-core.js';
import { loadQuizBank, saveCustomQuiz } from './35quiz-bank.js';

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

    // ==================== 环境诊断 ====================
    const diagCont = document.getElementById('diagnosisContainer');
    const diagItems = [
        { g: '🎵', n: 'AudioManager', t: () => !!window.AudioManager, f: '确认28audio' },
        { g: '⚔️', n: '固定单位=3', t: () => { var c = window._getPlayerContext?.(); return c?.UI?.allyTeam?.filter(u => u.fixed).length === 3; }, f: '检查doInitBattle' },
        { g: '⚔️', n: '明教pos非-1', t: () => { var c = window._getPlayerContext?.(); return c?.UI?.allyTeam?.every(u => u.pos !== -1); }, f: '改为null' },
        { g: '⚔️', n: '六大派pos合法', t: () => { var c = window._getPlayerContext?.(); return c?.UI?.enemyTeam?.every(u => u.pos >= 1 && u.pos <= 9); }, f: '检查兜底' },
        { g: '📦', n: '错误面板', t: () => !!document.getElementById('errorCapturePanel'), f: '24未加载' },
        { g: '📦', n: '06核心', t: () => typeof window.VER_CORE !== 'undefined', f: '检查06' },
        { g: '📦', n: '10播放器', t: () => typeof window.VER_PLAYER_CORE !== 'undefined', f: '检查10' },
    ];
    var groups = {}; diagItems.forEach(i => { if (!groups[i.g]) groups[i.g] = []; groups[i.g].push(i); });
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
    diagCont.addEventListener('click', async (e) => {
        if (!e.target.classList.contains('run')) return;
        var btn = e.target, gn = btn.dataset.g, idx = parseInt(btn.dataset.i), item = groups[gn][idx];
        var card = document.getElementById('diag-' + gn + '-' + idx), span = card.querySelector('.diag-status span');
        btn.textContent = '⏳'; btn.disabled = true; card.classList.remove('pass', 'fail'); card.classList.add('pending');
        try {
            var r = item.t.constructor.name === 'AsyncFunction' ? await item.t() : item.t();
            card.classList.remove('pending'); btn.textContent = '🔄'; btn.classList.remove('run'); btn.classList.add('retest');
            if (r === true) { card.classList.add('pass'); span.className = 'pass-text'; span.textContent = '✅'; }
            else if (r === null) { card.classList.add('pending'); span.className = 'pending-text'; span.textContent = '⚠️'; }
            else { card.classList.add('fail'); span.className = 'fail-text'; span.textContent = '❌'; }
        } catch (err) { card.classList.add('fail'); span.className = 'fail-text'; span.textContent = '❌'; }
        finally { btn.disabled = false; }
    });

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
    const allGroups = ['🚀 启动与加载', '🎨 九宫格基础', '❤️ 血条与属性', '✨ Buff 系统', '🎭 状态样式', '🎵 音效', '🎬 特效', '👹 精英', '🔗 数据', '⚙️ 引擎', '📋 日志', '📍 站位'];
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
    function loadHistory() {
        const hist = JSON.parse(localStorage.getItem('ming_test_history') || '[]');
        historyPanel.innerHTML = hist.length ? '<div style="color:#ffd700;font-weight:bold;">📜 历史记录</div>' + hist.map((h, i) => '<div class="history-item"><span>' + h.time + ' 通过' + h.pass + ' 失败' + h.fail + '</span><button data-i="' + i + '" style="font-size:10px;padding:2px 6px;">复制</button></div>').join('') : '';
        historyPanel.style.display = hist.length ? 'block' : 'none';
        historyPanel.querySelectorAll('button').forEach(b => b.addEventListener('click', (e) => {
            const i = parseInt(e.target.dataset.i);
            const h = JSON.parse(localStorage.getItem('ming_test_history') || '[]')[i];
            if (h) navigator.clipboard.writeText(h.text).then(() => statusEl.textContent = '📋 已复制');
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