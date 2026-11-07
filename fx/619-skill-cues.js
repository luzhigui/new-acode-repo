// fx/619-skill-cues.js — 轻量技能演出（吸星连线 / 现形换脸 / 断锤数字 / 双面观音变装 / 蹦蹦挪位）
//   设计口径：不花哨、一眼看懂；复用既有 fx 写法（body 级 fixed 临时元素 + data-fx="temporary" +
//   clock.animate 逻辑时间 + z-index 10004~10011），不引新配色体系。
//   载荷全部是可序列化的 uid/camp/pos/数值 → 回放、联机从机都能播同一份演出。
//   一条 cue 只在这里演出一次；快进由 fx/610 订阅侧统一拦（不阻塞战斗）。
export const VER = 'fx/619-skill-cues.js V1.1.0';
// V1.1.0 | 2026-11-07 吸星演出放慢到可读：连线 1000ms、数值 1700ms、目标间隔 180ms（逻辑时间，不阻塞）。

import { clock } from '../infra/103-clock.js';
import { SKILL_CUE_KINDS } from '../infra/106-battle-enums.js';
import { snapshotCellByPos, getCellByPos } from './611-fx-ref-manager.js';
import { showAtkBuffFloat } from './601-fx-common-5v5-test.js';

function cellOf(ref) {
    if (!ref || ref.camp == null || ref.pos == null) return null;
    return snapshotCellByPos(ref.camp, ref.pos);
}

function jot(css) {
    const el = document.createElement('div');
    el.setAttribute('data-fx', 'temporary');
    el.style.cssText = css;
    document.body.appendChild(el);
    return el;
}

function drop(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
}

// 小数值统一：≥10 取整，<10 保留一位（去掉 .0）
function numText(v) {
    const n = Math.abs(Number(v) || 0);
    if (n >= 10) return String(Math.round(n));
    return (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '');
}

function refUnit(ref) {
    if (!ref || ref.pos == null || ref.camp == null) return null;
    return { uid: ref.uid, camp: ref.camp, pos: ref.pos };
}

export function showSkillCue(cue) {
    if (!cue || !cue.kind) return;
    switch (cue.kind) {
        case SKILL_CUE_KINDS.ABSORB: return showAbsorb(cue);
        case SKILL_CUE_KINDS.REVEAL: return showReveal(cue);
        case SKILL_CUE_KINDS.ATK_HALVE: return showAtkHalve(cue);
        case SKILL_CUE_KINDS.ATK_GROW: return showAtkGrow(cue);
        case SKILL_CUE_KINDS.DISGUISE: return showDisguise(cue);
        case SKILL_CUE_KINDS.UNVEIL: return showUnveil(cue);
        case SKILL_CUE_KINDS.MASK_PEEL: return showMaskPeel(cue);
        case SKILL_CUE_KINDS.SUMMON_MOVE: return showSummonMove(cue);
        default: return;
    }
}

// ── 俞莲舟·吸星大法：每个被吸者一格细线收向他 + 头顶飘「攻/防/血」被吸掉的数 + 自身轻微加深 ──
//   节奏按「第一次看的人能读出来」定：连线 1000ms、数值 1700ms 停留、目标间隔 180ms（全部逻辑时间、不阻塞）。
function showAbsorb(cue) {
    const self = cellOf(cue.self);
    if (!self) return;
    // 自身轻微加深：暗紫气机在身周压一层，不遮血条
    const shade = jot(`position:fixed;left:${self.x}px;top:${self.y}px;width:${self.width}px;height:${self.height}px;
        transform:translate(-50%,-50%);border-radius:8px;pointer-events:none;z-index:10003;opacity:0;
        background:radial-gradient(ellipse at center, rgba(96,58,148,0.40) 0%, rgba(96,58,148,0.12) 62%, rgba(96,58,148,0) 78%);`);
    clock.animate(1400, p => {
        shade.style.opacity = (p < 0.16 ? p / 0.16 : 1 - (p - 0.16) / 0.84).toFixed(2);
    }).then(() => drop(shade));

    const targets = Array.isArray(cue.targets) ? cue.targets : [];
    targets.forEach((t, i) => {
        const tr = cellOf(t);
        if (!tr) return;
        clock.wait(i * 180).then(() => {
            absorbLine(tr, self);
            // 线飞出去一点点后再出数，先看「吸谁」、再读「吸多少」
            clock.wait(140).then(() => absorbNumbers(tr, t));
        });
    });
}

function absorbLine(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;
    const line = jot(`position:fixed;left:${from.x}px;top:${from.y}px;width:${len}px;height:2px;
        transform-origin:0 50%;transform:rotate(${ang}deg) scaleX(0);pointer-events:none;z-index:10005;opacity:0;
        background:linear-gradient(90deg, rgba(196,150,255,0.05) 0%, rgba(186,140,255,0.55) 58%, rgba(255,214,130,0.9) 100%);
        box-shadow:0 0 6px rgba(160,110,255,0.45);`);
    clock.animate(1000, p => {
        // 0~50% 长到对方身上，50~62% 停住可看清，62~100% 淡出
        const grow = p < 0.5 ? p / 0.5 : 1;
        line.style.transform = `rotate(${ang}deg) scaleX(${grow.toFixed(3)})`;
        const op = p < 0.08 ? p / 0.08 : (p < 0.62 ? 1 : 1 - (p - 0.62) / 0.38);
        line.style.opacity = Math.max(0, op).toFixed(2);
    }).then(() => drop(line));
}

function absorbNumbers(rect, t) {
    const bits = [];
    if (t.atk > 0) bits.push('攻-' + numText(t.atk));
    if (t.def > 0) bits.push('防-' + numText(t.def));
    if (t.hp > 0) bits.push('血-' + numText(t.hp));
    if (bits.length === 0) return;
    const el = jot(`position:fixed;left:${rect.x}px;top:${rect.top - 4}px;transform:translate(-50%,0);
        font-size:14px;font-weight:700;color:#efe4ff;white-space:nowrap;pointer-events:none;z-index:10006;opacity:0;
        text-shadow:0 0 8px rgba(120,70,200,0.9),0 1px 3px rgba(0,0,0,0.85);`);
    el.textContent = bits.join(' ');
    clock.animate(1700, p => {
        // 14% 淡入 → 72% 前保持满亮可读 → 最后淡出；上浮 34px
        const op = p < 0.14 ? p / 0.14 : (p < 0.72 ? 1 : 1 - (p - 0.72) / 0.28);
        const rise = -34 * (1 - Math.pow(1 - Math.min(1, p / 0.85), 2));
        el.style.opacity = Math.max(0, op).toFixed(2);
        el.style.transform = `translate(-50%, ${rise.toFixed(1)}px)`;
    }).then(() => drop(el));
}

// ── 圆真·现形变脸：原地碎裂环 + 换脸白闪 + 名字牌翻一下（少林圆真 → 成昆） ──
function showReveal(cue) {
    const r = cellOf(cue.unit);
    if (!r) return;
    const flash = jot(`position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;
        border-radius:6px;background:rgba(255,248,225,0.55);pointer-events:none;z-index:10008;opacity:0.9;`);
    clock.animate(280, p => { flash.style.opacity = (0.9 * (1 - p)).toFixed(2); }).then(() => drop(flash));

    const ring = jot(`position:fixed;left:${r.x}px;top:${r.y}px;width:10px;height:10px;border-radius:50%;
        border:2px solid rgba(238,226,196,0.95);box-shadow:0 0 12px rgba(180,150,90,0.7);
        transform:translate(-50%,-50%);pointer-events:none;z-index:10009;`);
    clock.animate(460, p => {
        ring.style.transform = `translate(-50%,-50%) scale(${(1 + 6.5 * (1 - Math.pow(1 - p, 2))).toFixed(2)})`;
        ring.style.opacity = (0.9 * (1 - p)).toFixed(2);
    }).then(() => drop(ring));

    // 5 片面具碎屑向四周弹开
    for (let i = 0; i < 5; i++) {
        const ang = (-100 + i * 55) * Math.PI / 180;
        const dist = 30 + (i % 2) * 10;
        const shard = jot(`position:fixed;left:${r.x}px;top:${r.y}px;width:5px;height:10px;
            background:rgba(236,224,198,0.9);border-radius:1px;transform:translate(-50%,-50%);
            box-shadow:0 0 6px rgba(180,150,90,0.6);pointer-events:none;z-index:10009;opacity:0;`);
        clock.animate(560, p => {
            const d = dist * (1 - Math.pow(1 - p, 2));
            const op = p < 0.12 ? p / 0.12 : 1 - (p - 0.12) / 0.88;
            shard.style.left = (r.x + Math.cos(ang) * d).toFixed(1) + 'px';
            shard.style.top = (r.y + Math.sin(ang) * d).toFixed(1) + 'px';
            shard.style.opacity = Math.max(0, op).toFixed(2);
            shard.style.transform = `translate(-50%,-50%) rotate(${(i * 72 + p * 180).toFixed(0)}deg)`;
        }).then(() => drop(shard));
    }

    flipNamePlate(cue.unit, cue.fromName, cue.toName, 'rgba(255,225,150,0.95)');
}

// 名字牌翻牌：在名字区域盖一张同底色小卡，先合再开；下层真名由 store 同步后自动更新
function flipNamePlate(ref, fromName, toName, glow) {
    if (!toName) return;
    const cell = getCellByPos(ref.camp, ref.pos);
    if (!cell) return;
    const nameEl = cell.querySelector('.cell-name');
    const cr = cell.getBoundingClientRect();
    const nr = nameEl ? nameEl.getBoundingClientRect() : null;
    const box = nr && nr.width > 0
        ? { left: nr.left, top: nr.top, width: nr.width, height: nr.height }
        : { left: cr.left + 6, top: cr.top + 6, width: Math.max(60, cr.width - 12), height: 18 };
    let bg = 'rgba(26,22,18,0.96)';
    try {
        const c = getComputedStyle(cell).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)/.test(c)) bg = c;
    } catch (e) { /* 取不到底色就用兜底深色 */ }
    const card = jot(`position:fixed;left:${(box.left - 6).toFixed(1)}px;top:${(box.top - 3).toFixed(1)}px;
        width:${Math.max(60, box.width + 12).toFixed(1)}px;height:${(box.height + 6).toFixed(1)}px;
        display:flex;align-items:center;justify-content:center;background:${bg};
        border:1px solid rgba(255,214,140,0.65);border-radius:4px;color:#ffe7b0;
        font-size:${Math.max(12, box.height * 0.86).toFixed(0)}px;font-weight:700;white-space:nowrap;
        pointer-events:none;z-index:10011;transform-origin:50% 50%;transform:scaleY(1);`);
    card.textContent = fromName || '…';
    clock.animate(120, p => { card.style.transform = `scaleY(${(1 - p).toFixed(3)})`; })
        .then(() => {
            card.textContent = toName;
            if (glow) card.style.borderColor = glow;
            card.style.color = '#fff6e0';
            return clock.animate(160, p => { card.style.transform = `scaleY(${p.toFixed(3)})`; });
        })
        // 停一瞬再淡出：用 animate 承载「停留」而不是 wait，clock.reset 时也会走到收尾并删 DOM
        .then(() => clock.animate(300, p => {
            if (p < 0.5) return;
            card.style.opacity = (1 - (p - 0.5) / 0.5).toFixed(2);
        }))
        .then(() => drop(card));
}

// ── 庄铮·断锤三式：减半时攻击数字往上剥走一半；之后每次出手回涨一格 ──
function showAtkHalve(cue) {
    const u = refUnit(cue.unit);
    if (!u || !(cue.amount > 0)) return;
    showAtkBuffFloat(u, -Number(numText(cue.amount)));
}

function showAtkGrow(cue) {
    const u = refUnit(cue.unit);
    if (!u || !(cue.amount > 0)) return;
    showAtkBuffFloat(u, Number(numText(cue.amount)));
}

// ── 彭莹玉·双面观音：变装时薄纱扫过 + 名字牌换成女装；褪装时妆容碎屑往下散 ──
function showDisguise(cue) {
    const r = cellOf(cue.unit);
    if (!r) return;
    const veil = jot(`position:fixed;left:${(r.left - r.width * 0.35).toFixed(1)}px;top:${(r.top + r.height * 0.12).toFixed(1)}px;
        width:${(r.width * 1.3).toFixed(1)}px;height:${(r.height * 0.55).toFixed(1)}px;pointer-events:none;z-index:10007;opacity:0;
        background:linear-gradient(90deg, rgba(255,214,236,0) 0%, rgba(255,208,232,0.62) 45%, rgba(255,246,252,0.9) 55%, rgba(255,208,232,0) 100%);
        filter:blur(1px);`);
    clock.animate(560, p => {
        const op = p < 0.18 ? p / 0.18 : (p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45);
        veil.style.opacity = Math.max(0, op).toFixed(2);
        veil.style.transform = `translateX(${(-16 + 34 * p).toFixed(1)}%) skewX(-14deg)`;
    }).then(() => drop(veil));

    const flash = jot(`position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:6px;
        background:radial-gradient(circle, rgba(255,196,226,0.40) 0%, rgba(255,196,226,0) 72%);
        pointer-events:none;z-index:10006;opacity:0;`);
    clock.animate(520, p => {
        flash.style.opacity = (p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8).toFixed(2);
    }).then(() => drop(flash));

    flipNamePlate(cue.unit, cue.fromName, cue.toName, 'rgba(255,150,200,0.95)');
}

function showUnveil(cue) {
    const r = cellOf(cue.unit);
    if (!r) return;
    // 妆容褪去：几片淡粉碎屑往下飘
    for (let i = 0; i < 4; i++) {
        const sx = r.left + r.width * (0.25 + i * 0.16);
        const sh = jot(`position:fixed;left:${sx.toFixed(1)}px;top:${(r.top + r.height * 0.35).toFixed(1)}px;
            width:4px;height:7px;background:rgba(255,190,220,0.85);border-radius:2px;
            pointer-events:none;z-index:10007;opacity:0;`);
        clock.animate(620, p => {
            const op = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
            sh.style.opacity = Math.max(0, op).toFixed(2);
            sh.style.transform = `translateY(${(p * 22).toFixed(1)}px) rotate(${(p * 40).toFixed(0)}deg)`;
        }).then(() => drop(sh));
    }
    flipNamePlate(cue.unit, cue.fromName, cue.toName, 'rgba(180,200,220,0.9)');
}

// 识破/被迷惑：面具揭开感（🎭 往下脱落 + 一圈淡粉小环）
function showMaskPeel(cue) {
    const r = cellOf(cue.unit);
    if (!r) return;
    const mask = jot(`position:fixed;left:${r.x}px;top:${r.y}px;font-size:20px;line-height:1;
        pointer-events:none;z-index:10010;transform:translate(-50%,-50%);opacity:0;
        filter:drop-shadow(0 0 6px rgba(255,160,210,0.8));`);
    mask.textContent = '🎭';
    clock.animate(620, p => {
        const op = p < 0.16 ? p / 0.16 : 1 - (p - 0.16) / 0.84;
        mask.style.opacity = Math.max(0, op).toFixed(2);
        mask.style.transform = `translate(-50%, calc(-50% + ${(p * 16).toFixed(1)}px)) rotate(${(p * 28).toFixed(0)}deg)`;
    }).then(() => drop(mask));

    const ring = jot(`position:fixed;left:${r.x}px;top:${(r.top + r.height * 0.35).toFixed(1)}px;width:8px;height:8px;
        border-radius:50%;border:1.5px solid rgba(255,180,215,0.85);
        transform:translate(-50%,-50%);pointer-events:none;z-index:10009;`);
    clock.animate(380, p => {
        ring.style.transform = `translate(-50%,-50%) scale(${(1 + 3.4 * p).toFixed(2)})`;
        ring.style.opacity = (0.85 * (1 - p)).toFixed(2);
    }).then(() => drop(ring));
}

// ── 张中·蹦蹦挪空位：从张中格到空位留一串残影，落点轻闪一下 ──
function showSummonMove(cue) {
    const from = cellOf(cue.from);
    const to = cellOf(cue.to);
    if (!from || !to) return;

    const ghost = jot(`position:fixed;left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px;
        border-radius:6px;border:1px solid rgba(255,214,140,0.5);background:rgba(255,214,140,0.10);
        pointer-events:none;z-index:10004;opacity:0;`);
    clock.animate(520, p => { ghost.style.opacity = (0.8 * (1 - p)).toFixed(2); }).then(() => drop(ghost));

    for (let i = 0; i < 3; i++) {
        clock.wait(i * 80).then(() => {
            const t = 0.25 + i * 0.25;
            const gx = from.x + (to.x - from.x) * t;
            const gy = from.y + (to.y - from.y) * t;
            const s = jot(`position:fixed;left:${gx.toFixed(1)}px;top:${gy.toFixed(1)}px;
                width:${(from.width * 0.5).toFixed(1)}px;height:${(from.height * 0.5).toFixed(1)}px;border-radius:6px;
                background:radial-gradient(circle, rgba(255,226,160,0.45) 0%, rgba(255,226,160,0) 70%);
                transform:translate(-50%,-50%);pointer-events:none;z-index:10005;opacity:0;`);
            clock.animate(420, p => {
                s.style.opacity = (p < 0.2 ? 0.7 * (p / 0.2) : 0.7 * (1 - (p - 0.2) / 0.8)).toFixed(2);
                s.style.transform = `translate(-50%,-50%) scale(${(1 + 0.35 * p).toFixed(2)})`;
            }).then(() => drop(s));
        });
    }

    const ring = jot(`position:fixed;left:${to.x}px;top:${to.y}px;width:10px;height:10px;border-radius:50%;
        border:2px solid rgba(255,218,132,0.95);box-shadow:0 0 10px rgba(255,190,60,0.75);
        transform:translate(-50%,-50%);pointer-events:none;z-index:10009;`);
    clock.animate(400, p => {
        ring.style.transform = `translate(-50%,-50%) scale(${(1 + 3.2 * (1 - Math.pow(1 - p, 2))).toFixed(2)})`;
        ring.style.opacity = (0.9 * (1 - p)).toFixed(2);
    }).then(() => drop(ring));
}
