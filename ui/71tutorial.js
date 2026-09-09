// ui/71tutorial.js - 新手引导（日志区固定提示面板 + 浮动箭头，不遮挡操作）
// V6.0.0 | 2026-09-09 改为日志区固定面板持续提示
export const VER = 'ui/71tutorial.js V6.0.0';

const DONE_KEY = 'ming_tutorial_done_5v5_test';

export function isTutorialDone() {
    try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return true; }
}
export function markTutorialDone() {
    try { localStorage.setItem(DONE_KEY, '1'); } catch {}
}
export function resetTutorialDone() {
    try { localStorage.removeItem(DONE_KEY); } catch {}
}

// 浮动箭头管理
let _arrows = [];

function clearArrows() {
    _arrows.forEach(a => { a.el.remove(); window.removeEventListener('resize', a.onResize); });
    _arrows = [];
}

function arrowTo(target) {
    if (!target) return;
    const el = document.createElement('div');
    el.className = 'tutorial-arrow';
    el.textContent = '▼';
    document.body.appendChild(el);
    const place = () => {
        const r = target.getBoundingClientRect();
        el.style.left = (r.left + r.width / 2 - 20) + 'px';
        el.style.top = (r.top - 42) + 'px';
    };
    place();
    const onResize = place;
    window.addEventListener('resize', onResize);
    _arrows.push({ el, onResize });
}

// 固定提示面板：absolute 定位在日志区顶部，pointer-events:none 完全不遮挡
function ensurePanel() {
    let p = document.getElementById('tutorialPanel');
    if (p) return p;
    const c = document.querySelector('.log-container');
    if (!c) return null;
    p = document.createElement('div');
    p.id = 'tutorialPanel';
    c.appendChild(p);
    return p;
}

function setGuide({ title, lines, targets }) {
    const p = ensurePanel();
    clearArrows();
    document.body.classList.add('tut-active'); // 引导期间显示队伍边框（明教蓝/六大派橙）
    if (p) {
        p.innerHTML = (title ? `<b class="tut-title">${title}</b><br>` : '') +
            (lines || []).map(l => `<span>${l}</span>`).join('<br>');
    }
    (targets || []).forEach(t => arrowTo(t));
}

// (1) 封面关闭：指「调整站位」按钮
export function stepAdjustStart() {
    if (isTutorialDone()) return;
    setGuide({
        title: '🔧 调整站位',
        lines: ['点击下方「调整站位」按钮，可调整明教队站位。'],
        targets: [document.getElementById('btnMain')]
    });
}

// (2) 进入站位模式：指绿色格子，说明交换规则 + 可跳过
export function stepAdjustMove() {
    if (isTutorialDone()) return;
    const cells = document.querySelectorAll('#allyGrid .cell.adjustable, #allyGrid .cell.swappable');
    const targets = cells.length ? Array.from(cells).slice(0, 2) : [document.getElementById('allyGrid')];
    setGuide({
        title: '🔧 交换站位',
        lines: ['点击两个绿色格子（或绿格+空格）交换位置，灰色格子不可调。', '也可直接点「开始投票」跳过调整。'],
        targets
    });
}

// (3) 投票窗口弹出后：说明选队规则
export function stepVoteOpen() {
    if (isTutorialDone()) return;
    setGuide({
        title: '🗳️ 投票',
        lines: ['你看好哪个队伍赢？选「六大派」或「明教」为它助威。', '猜对有积分（张无忌在场双倍），也可选「放弃」。'],
        targets: []
    });
}

// (4) 倒计时：等待 + 垃圾话
export function stepCountdown() {
    if (isTutorialDone()) return;
    setGuide({
        title: '⏳ 倒计时',
        lines: ['请稍候，倒计时结束战斗开始，双方先放几句狠话～'],
        targets: []
    });
}

// (5) 海克斯窗口：三选一说明
export function stepBuff() {
    if (isTutorialDone()) return;
    setGuide({
        title: '✨ 选择海克斯',
        lines: ['三选一增强明教队（只对明教生效），最多叠加两个。'],
        targets: []
    });
}

// (6) 战斗开始：收尾提示并标记完成（移除队伍边框，战场恢复原样）
export function stepBattleStart() {
    if (isTutorialDone()) return;
    setGuide({
        title: '⚔️ 战斗开始',
        lines: ['明教能否守住光明顶？六大派能否踏破？下面见分晓！'],
        targets: []
    });
    document.body.classList.remove('tut-active'); // 引导结束，去掉队伍边框
    markTutorialDone();
}

// ❓ 按钮：重置并从头重播
export function initTutorial() {
    const btn = document.getElementById('btnTutorial');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        resetTutorialDone();
        stepAdjustStart();
    });
}