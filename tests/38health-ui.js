// tests/38health-ui.js - 光明顶5v5 体检UI交互
// V4.0.1 | 2026-06-30 | ~240 lines | ~7500 字符
export const VER = 'tests/38health-ui.js V4.0.1';

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

        let selectedIdx = -1;

        q.o.forEach((opt, i) => {
            const btn = document.createElement('button');
            btn.className = 'quiz-option';
            btn.textContent = opt;
            btn.addEventListener('click', () => {
                // 高亮当前选择
                quizOpts.querySelectorAll('.quiz-option').forEach(o => o.style.borderColor = '#444');
                btn.style.borderColor = '#ffd700';
                selectedIdx = i;
            });
            quizOpts.appendChild(btn);
        });

        // 提交按钮
        const submitBtn = document.createElement('button');
        submitBtn.className = 'quiz-option';
        submitBtn.textContent = '✅ 提交';
        submitBtn.style.cssText = 'background:#ffd700;color:#1a1a2e;font-weight:bold;';
        submitBtn.addEventListener('click', () => {
            if (selectedIdx === -1) return; // 没选不能提交
            const allOpts = quizOpts.querySelectorAll('.quiz-option');
            allOpts.forEach(o => o.style.pointerEvents = 'none');
            submitBtn.style.pointerEvents = 'none';
            const correctIdx = q.a;
            allOpts.forEach((o, i) => {
                if (i === correctIdx) o.classList.add('correct');
                else if (i === selectedIdx && i !== correctIdx) o.classList.add('wrong');
            });
            if (selectedIdx === correctIdx) {
                quizScore += 10;
                quizFeed.textContent = '✅ ' + q.e;
            } else {
                quizFeed.textContent = '❌ 正确答案：' + q.o[q.a] + '。' + q.e;
                quizScore = Math.max(0, quizScore - 5);
            }
            quizScoreEl.textContent = '得分：' + quizScore;
            setTimeout(() => { if (quizActive) showQuiz(); }, 3000);
        });
        quizOpts.appendChild(submitBtn);

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

    // ==================== 复制按钮 ====================
    copySumBtn.style.display = 'inline-block';
    copySumBtn.addEventListener('click', () => {
        const text = statusEl.textContent + '\n' + (reportEl.textContent || reportEl.innerText);
        navigator.clipboard.writeText(text).then(() => statusEl.textContent = '📋 已复制汇总');
    });

    copyFullBtn.style.display = 'inline-block';
    copyFullBtn.addEventListener('click', () => {
        const text = (reportEl.innerText || reportEl.textContent);
        navigator.clipboard.writeText(text).then(() => statusEl.textContent = '📋 已复制完整报告');
    });

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