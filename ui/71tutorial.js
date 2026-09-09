// ui/71tutorial.js - 新手引导（站位/投票/海克斯三环节轻量提示）
// V6.0.0 | 2026-09-09 新增新手引导
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

let _cleanup = null;

function clearGuide() {
    if (_cleanup) { const f = _cleanup; _cleanup = null; f(); }
}

// 绿色闪烁箭头，指向目标元素（仅站位引导用，无遮罩）
function makeArrow(target) {
    const arrow = document.createElement('div');
    arrow.className = 'tutorial-arrow';
    arrow.textContent = '▼';
    document.body.appendChild(arrow);
    const place = () => {
        const r = target.getBoundingClientRect();
        arrow.style.left = (r.left + r.width / 2 - 20) + 'px';
        arrow.style.top = (r.top - 46) + 'px';
    };
    place();
    window.addEventListener('resize', place);
    return { arrow, place };
}

// 引导气泡：遮罩(可选) + 文案 + 确认按钮
function makeBubble({ title, lines, confirmText, dim }) {
    if (dim) {
        const scrim = document.createElement('div');
        scrim.className = 'tutorial-scrim';
        document.body.appendChild(scrim);
    }
    const bubble = document.createElement('div');
    bubble.className = 'tutorial-bubble';
    bubble.innerHTML =
        `<div class="tutorial-text"><b>${title}</b><br>` +
        lines.map(l => `<span>${l}</span>`).join('<br>') +
        `</div>`;
    const btn = document.createElement('button');
    btn.className = 'tutorial-btn';
    btn.textContent = confirmText;
    bubble.appendChild(btn);
    document.body.appendChild(bubble);
    return { bubble, btn };
}

// 气泡定位：水平居中于锚点，clamp 到屏幕内；above=true 放锚点上方，否则下方
function placeBubble(bubble, anchor, dy, { above = false } = {}) {
    const r = anchor.getBoundingClientRect();
    const bw = bubble.offsetWidth || 320;
    const vw = window.innerWidth;
    let cx = r.left + r.width / 2;
    cx = Math.min(Math.max(cx, bw / 2 + 8), vw - bw / 2 - 8);
    bubble.style.left = cx + 'px';
    bubble.style.top = (above ? r.top - dy : r.bottom + dy) + 'px';
    bubble.style.transform = 'translateX(-50%)';
}

// 找第一个可交换的绿色格子（空格子.adjustable 或占位格.swappable），找不到回退到整个网格
function findAdjustCell() {
    return document.querySelector('#allyGrid .cell.adjustable, #allyGrid .cell.swappable')
        || document.getElementById('allyGrid');
}

// 站位引导：箭头指向绿色格子，说明点空格或绿格交换；"下一步"转指投票按钮
export function showPositionGuide(onNext) {
    clearGuide();
    const target = findAdjustCell();
    if (!target) { if (onNext) onNext(); return; }
    const { arrow, place } = makeArrow(target);
    const { bubble, btn } = makeBubble({
        title: '🔄 调整站位',
        lines: ['点击任意空格或绿色格子，', '可交换两个我方单位的站位。'],
        confirmText: '下一步'
    });
    placeBubble(bubble, target, 8);

    const close = () => {
        arrow.remove();
        bubble.remove();
        window.removeEventListener('resize', place);
        if (onNext) onNext();
    };
    btn.addEventListener('click', close);
    _cleanup = () => {
        arrow.remove();
        bubble.remove();
        window.removeEventListener('resize', place);
    };
}

// 投票按钮引导：箭头指向"开始投票"按钮
export function showVoteButtonGuide() {
    clearGuide();
    const target = document.getElementById('btnMain');
    if (!target) return;
    const { arrow, place } = makeArrow(target);
    const { bubble, btn } = makeBubble({
        title: '🗳️ 开始投票',
        lines: ['位置调整好后，点这个「开始投票」按钮。'],
        confirmText: '知道了'
    });
    placeBubble(bubble, target, 46, { above: true });

    const close = () => {
        arrow.remove();
        bubble.remove();
        window.removeEventListener('resize', place);
    };
    btn.addEventListener('click', close);
    _cleanup = () => {
        arrow.remove();
        bubble.remove();
        window.removeEventListener('resize', place);
    };
}

// 开战引导：封面关闭后，箭头指向"调整站位"按钮
export function showStartGuide() {
    clearGuide();
    const target = document.getElementById('btnMain');
    if (!target) return;
    const { arrow, place } = makeArrow(target);
    const { bubble, btn } = makeBubble({
        title: '⚔️ 开始前先布阵',
        lines: ['先点下面的「调整站位」按钮，', '交换我方格子安排阵型，再开战。'],
        confirmText: '知道了'
    });
    placeBubble(bubble, target, 46, { above: true });

    const close = () => {
        arrow.remove();
        bubble.remove();
        window.removeEventListener('resize', place);
    };
    btn.addEventListener('click', close);
    _cleanup = () => {
        arrow.remove();
        bubble.remove();
        window.removeEventListener('resize', place);
    };
}

// 投票引导：前置说明，点"去投票"后弹真实投票窗
export function showVoteGuide(onConfirm) {
    clearGuide();
    const { bubble, btn } = makeBubble({
        title: '🗳️ 开始投票',
        lines: ['战斗前先预测这场谁赢：', '· 猜对 +积分', '· 猜错不得分', '· 张无忌在场时猜对双倍积分', '选"放弃"则跳过本轮预测。'],
        confirmText: '去投票',
        dim: true
    });
    btn.addEventListener('click', () => {
        clearGuide();
        if (onConfirm) onConfirm();
    });
    _cleanup = () => { bubble.remove(); document.querySelector('.tutorial-scrim')?.remove(); };
}

// 海克斯引导：前置说明，点"去选择"后弹真实三选一
export function showBuffGuide(onConfirm) {
    clearGuide();
    const { bubble, btn } = makeBubble({
        title: '✨ 选择海克斯',
        lines: ['从三个增益中选一个，持续若干回合。', '最多同时持有两个，新选的会顶掉最短的一个。'],
        confirmText: '去选择',
        dim: true
    });
    btn.addEventListener('click', () => {
        clearGuide();
        markTutorialDone();
        if (onConfirm) onConfirm();
    });
    _cleanup = () => { bubble.remove(); document.querySelector('.tutorial-scrim')?.remove(); };
}

// 新手须知总览（"?"按钮随时重看，不改变完成标记）
export function showTutorialOverview() {
    clearGuide();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '100010';
    const box = document.createElement('div');
    box.className = 'modal-box';
    box.innerHTML = `<div class="modal-text" style="text-align:left;line-height:1.7;">
<b>📖 新手须知</b><br>
<b>① 调整站位</b>：战斗前点击两个我方格子可交换位置。<br>
<b>② 投票</b>：预测这场谁赢，猜对 +积分（张无忌在场双倍），猜错不得分。<br>
<b>③ 海克斯</b>：选一个增益持续若干回合，最多叠两个。<br>
<b>④ 开战</b>：倒计时后双方自动按站位对攻，可调倍速/暂停/结算。
</div><div class="modal-buttons"><button class="modal-btn">关闭</button></div>`;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    box.querySelector('.modal-btn').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    _cleanup = close;
}

// 初始化："?"入口按钮绑定：重新演示引导（重置完成标记 + 重播）
export function initTutorial() {
    const btn = document.getElementById('btnTutorial');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        resetTutorialDone();
        showStartGuide();
    });
}