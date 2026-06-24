// 38health-ui.js - 光明顶 5v5 全面体检 UI 交互模块 V1.0
// 预估行数: 150, 发送时间: 20260625 13:30, 版本: V1.0.0
// 联动: 被 30test-runner.html 调用，负责绑定 UI 事件、历史记录展示、出题模块交互

import { loadQuizBank, saveCustomQuiz } from './35quiz-bank.js';

/**
 * 初始化全面体检面板的所有 UI 交互
 * @param {Object} elements - DOM 元素集合
 * @param {Function} runHealthCheck - 体检主函数引用
 */
export function initUI(elements, runHealthCheck) {
    const {
        runBtn, statusEl, reportEl, copySumBtn, copyFullBtn,
        progCont, progFill, progText, stageCbs, groupCbs,
        quizPanel, quizQ, quizOpts, quizFeed, quizScoreEl,
        toggleAdd, quizAdd, quizInput, submitQuiz, quizOutput,
        historyPanel, iframe
    } = elements;

    // 初始化规则组复选框
    const allGroups = [
        '🚀 启动与加载', '🎨 九宫格基础', '❤️ 血条与属性',
        '✨ Buff 系统', '🎭 状态样式', '🎵 音效', '🎬 特效',
        '👹 精英', '🔗 数据', '⚙️ 引擎', '📋 日志', '📍 站位'
    ];
    groupCbs.innerHTML = allGroups.map(g =>
        `<label><input type="checkbox" value="${g}" checked> ${g.split(' ')[1] || g}</label>`
    ).join('');

    // 开始体检按钮
    runBtn.addEventListener('click', () => {
        const config = {
            iframe, statusEl, reportEl, copySumBtn, copyFullBtn, runBtn,
            progCont, progFill, progText, stageCbs, groupCbs,
            quizPanel, quizQ, quizOpts, quizFeed, quizScoreEl
        };
        runHealthCheck(config, updateUIState);
    });

    // 出题模块开关
    toggleAdd.addEventListener('click', () => {
        quizAdd.style.display = quizAdd.style.display === 'block' ? 'none' : 'block';
    });

    // 提交自定义题目
    submitQuiz.addEventListener('click', () => {
        const line = quizInput.value.trim();
        if (!line) return;

        const parts = line.split('|');
        if (parts.length < 7) {
            quizOutput.textContent = '格式错误，需要7段：题目|A|B|C|D|答案(0-3)|解释';
            return;
        }

        const item = {
            q: parts[0],
            o: [parts[1], parts[2], parts[3], parts[4]],
            a: parseInt(parts[5]),
            e: parts[6]
        };

        saveCustomQuiz(item);
        quizOutput.textContent = '✅ 已添加！JSON:\n' + JSON.stringify(item);
        quizInput.value = '';
    });

    // 加载历史记录
    loadHistory(historyPanel, statusEl);

    // 初始状态
    statusEl.textContent = '选择关卡和规则组，点击按钮开始';
}

// UI 状态更新回调（体检过程中调用）
function updateUIState(state) {
    // state 可以是 { progress, text, status } 等
    // 此函数在体检核心中被调用，这里做空实现，实际逻辑在核心中直接操作 DOM
}

// 加载历史记录面板
function loadHistory(historyPanel, statusEl) {
    const hist = JSON.parse(localStorage.getItem('ming_test_history') || '[]');
    if (!hist.length) {
        historyPanel.style.display = 'none';
        return;
    }

    historyPanel.innerHTML = '<div style="color:#ffd700;font-weight:bold;margin-bottom:8px;">📜 历史记录</div>' +
        hist.map((h, i) => `
            <div class="history-item">
                <span>${h.time} 通过${h.pass} 失败${h.fail}</span>
                <button data-i="${i}" style="font-size:10px;padding:2px 6px;">复制</button>
            </div>
        `).join('');

    historyPanel.style.display = 'block';

    // 绑定复制按钮
    historyPanel.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const i = parseInt(e.target.dataset.i);
            const h = JSON.parse(localStorage.getItem('ming_test_history') || '[]')[i];
            if (h) {
                navigator.clipboard.writeText(h.text).then(() => {
                    statusEl.textContent = '📋 已复制历史报告';
                });
            }
        });
    });
}

// 导出加载历史记录函数（供外部刷新调用）
export { loadHistory };