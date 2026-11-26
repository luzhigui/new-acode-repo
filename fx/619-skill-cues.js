// fx/619-skill-cues.js — 轻量技能演出（吸星连线 / 现形换脸 / 断锤数字 / 双面观音变装 / 蹦蹦挪位）
//   设计口径：不花哨、一眼看懂；复用既有 fx 写法（body 级 fixed 临时元素 + data-fx="temporary" +
//   clock.animate 逻辑时间 + z-index 10004~10011），不引新配色体系。
//   载荷全部是可序列化的 uid/camp/pos/数值 → 回放、联机从机都能播同一份演出。
//   一条 cue 只在这里演出一次；快进由 fx/610 订阅侧统一拦（不阻塞战斗）。
// V1.1.1 | 2026-11-21 新增 blazeBurst：炎魔狮王炎爆改为「掌心凝球→拖尾飞行→命中爆开」三段演出（纯 CSS 火球，不再只飘 emoji）
// V1.1.2 | 2026-11-21 炎爆三段加 minRealMs 保底（320/380/240），倍速/快进下也看得清凝聚与飞行
// V1.1.3 | 2026-11-23 断锤三式攻防飘字补快进闸（快进统一不飘）
// V1.2.0 | 2026-11-24 新增 demonBurst（魔化谢逊真伤复用炎爆三段演出）+ sanDuCycle（三渡轮转逐个描轨迹，修「轮回太快看不清」）
// V1.2.3 | 2026-11-25 火球/圣光 cue 改 Promise + queueBurst 串行，支持 cue.slow 放慢（魔化开轰两下）
// V1.2.1 | 2026-11-24 新增 demonHeal（谢逊拍醒队友：圣光光柱 + 十字光 + 上浮光点）
export const VER = 'fx/619-skill-cues.js V1.2.3';   // V1.2.3 2026-11-25 火球/圣光 cue 改 Promise + queueBurst 串行，支持 cue.slow 放慢（魔化开轰两下）

import { clock } from '../infra/103-clock.js';
import { SKILL_CUE_KINDS } from '../infra/106-battle-enums.js';
import { snapshotCellByPos, getCellByPos } from './611-fx-ref-manager.js';
import { showAtkBuffFloat } from './601-fx-common-5v5-test.js';
import { isFxSkipped as inFastForward } from '../infra/111-fx-gate.js';

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

// 火球/圣光排队播放：魔化谢逊一次开轰是「两下」，两下的 cue 会同一批 fact 里几乎同时到达，
//   不排队就会叠在一起（老板 2026-11-25：动画要慢、要看得清两下）。只有这两类进队列。
let _burstChain = Promise.resolve();
function queueBurst(fn) {
    _burstChain = _burstChain.then(fn).catch(() => {});
    return _burstChain;
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
        case SKILL_CUE_KINDS.BLAZE_BURST: return showBlazeBurst(cue);
        case SKILL_CUE_KINDS.DEMON_BURST: return queueBurst(() => showBlazeBurst(cue));
        case SKILL_CUE_KINDS.DEMON_HEAL: return queueBurst(() => showDemonHeal(cue));
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
    if (inFastForward()) return;   // 快进统一不飘（2026-11-23）
    showAtkBuffFloat(u, -Number(numText(cue.amount)));
}

function showAtkGrow(cue) {
    const u = refUnit(cue.unit);
    if (!u || !(cue.amount > 0)) return;
    if (inFastForward()) return;   // 快进统一不飘（2026-11-23）
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

// ── 炎魔狮王·炎爆：掌心凝聚火球 → 拖尾飞向目标 → 命中爆开 ──
//   三段全部走逻辑时间：凝球 420ms、飞行 460ms、爆点 340ms（不阻塞战斗）。
//   纯 CSS 火球（无 emoji），一眼能看出「从狮王手里打出去」而不是凭空在对方头上冒字。
// slow:true 时全段放慢（老板 2026-11-25：开轰动画慢一点）；返回 Promise，供 queueBurst 串行播两下
async function showBlazeBurst(cue) {
    const from = cellOf(cue.self);
    const to = cellOf(cue.target);
    if (!from || !to) return;
    const sp = cue.slow ? 1.9 : 1;

    // ① 凝聚：火球在身前由小到大亮起，带脉动
    const orb = jot(`position:fixed;left:${from.x}px;top:${from.y}px;width:38px;height:38px;
        transform:translate(-50%,-50%) scale(0.15);opacity:0;border-radius:50%;pointer-events:none;z-index:10006;
        background:radial-gradient(circle at 38% 35%, #FFFBE0 0%, #FFD24A 30%, #FF8A1E 62%, #D8340A 88%, rgba(216,52,10,0) 100%);
        box-shadow:0 0 18px 6px rgba(255,150,30,0.70), 0 0 46px 16px rgba(255,72,0,0.30);`);
    await clock.animate(420 * sp, p => {
        orb.style.opacity = (p < 0.22 ? p / 0.22 : 1).toFixed(2);
        const grow = Math.min(1, p / 0.82);
        const pulse = 0.08 * Math.sin(p * Math.PI * 6) * grow;
        orb.style.transform = `translate(-50%,-50%) scale(${(0.15 + 0.85 * grow + pulse).toFixed(3)})`;
    }, { minRealMs: 320 * sp });
    drop(orb);

    // ② 飞行：火球本体 + 拖尾，飞向目标
    const dx = to.x - from.x, dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    const ang = Math.atan2(dy, dx);
    const ball = jot(`position:fixed;left:${from.x}px;top:${from.y}px;width:24px;height:24px;
        transform:translate(-50%,-50%);border-radius:50%;pointer-events:none;z-index:10007;
        background:radial-gradient(circle at 38% 35%, #FFFBE6 0%, #FFD24A 32%, #FF7A12 68%, #C22A06 92%, rgba(194,42,6,0) 100%);
        box-shadow:0 0 16px 6px rgba(255,160,40,0.75), 0 0 38px 14px rgba(255,70,0,0.32);`);
    const tail = jot(`position:fixed;left:${from.x}px;top:${from.y}px;width:${Math.min(96, dist).toFixed(0)}px;height:9px;
        transform-origin:0 50%;border-radius:5px;pointer-events:none;z-index:10006;
        background:linear-gradient(90deg, rgba(255,210,74,0) 0%, rgba(255,150,30,0.55) 55%, rgba(255,244,180,0.95) 100%);
        box-shadow:0 0 10px rgba(255,140,26,0.55);`);
    const tailLen = Math.min(96, dist);
    await clock.animate(460 * sp, p => {
        const e = 1 - Math.pow(1 - p, 2);   // 前快后慢：出膛快、临近略收
        const bx = from.x + dx * e, by = from.y + dy * e;
        ball.style.left = bx.toFixed(1) + 'px';
        ball.style.top = by.toFixed(1) + 'px';
        ball.style.transform = `translate(-50%,-50%) scale(${(1 + 0.18 * Math.sin(p * Math.PI)).toFixed(2)})`;
        const len = tailLen * (0.35 + 0.65 * Math.sin(Math.min(1, p) * Math.PI));
        tail.style.left = (bx - Math.cos(ang) * len).toFixed(1) + 'px';
        tail.style.top = (by - Math.sin(ang) * len).toFixed(1) + 'px';
        tail.style.width = len.toFixed(1) + 'px';
        tail.style.transform = `rotate(${ang}rad)`;
        tail.style.opacity = (0.9 * (1 - p * 0.45)).toFixed(2);
    }, { minRealMs: 380 * sp });
    drop(ball); drop(tail);

    // ③ 命中：橙色冲击环外扩 + 中心白闪
    const ring = jot(`position:fixed;left:${to.x}px;top:${to.y}px;width:26px;height:26px;border-radius:50%;
        border:3px solid rgba(255,178,64,0.95);pointer-events:none;z-index:10008;
        box-shadow:0 0 18px rgba(255,120,20,0.80), inset 0 0 12px rgba(255,220,120,0.65);
        transform:translate(-50%,-50%);`);
    const flash = jot(`position:fixed;left:${to.x}px;top:${to.y}px;width:46px;height:46px;border-radius:50%;
        pointer-events:none;z-index:10009;transform:translate(-50%,-50%);opacity:0.95;
        background:radial-gradient(circle, rgba(255,255,235,0.95) 0%, rgba(255,196,90,0.55) 42%, rgba(255,120,20,0) 72%);`);
    await clock.animate(340 * sp, p => {
        ring.style.transform = `translate(-50%,-50%) scale(${(0.5 + 2.6 * (1 - Math.pow(1 - p, 2))).toFixed(2)})`;
        ring.style.opacity = (0.95 * (1 - p)).toFixed(2);
        flash.style.transform = `translate(-50%,-50%) scale(${(0.6 + 0.9 * p).toFixed(2)})`;
        flash.style.opacity = (0.95 * (1 - p)).toFixed(2);
    }, { minRealMs: 240 * sp });
    drop(ring); drop(flash);
}

// ── 魔化谢逊·拍醒队友：头顶降下圣光 + 十字光 + 上浮光点（老板 2026-11-24 要「圣光回血」的十字架感）──
async function showDemonHeal(cue) {
    const cell = cellOf(cue.target || {});
    if (!cell) return;
    const beam = jot(`position:fixed;left:${cell.x}px;top:${cell.y}px;
        width:${Math.max(26, cell.width * 0.5)}px;height:${Math.round(cell.height * 1.6)}px;
        transform:translate(-50%,-100%);pointer-events:none;z-index:10006;opacity:0;border-radius:8px;
        background:linear-gradient(to top, rgba(255,248,205,0.10) 0%, rgba(255,246,190,0.55) 55%, rgba(255,255,255,0.85) 100%);
        box-shadow:0 0 18px rgba(255,240,170,0.75);`);
    await clock.animate(620, p => {
        beam.style.opacity = (p < 0.22 ? 0.95 * (p / 0.22) : 0.95 * (1 - (p - 0.22) / 0.78)).toFixed(2);
        beam.style.height = `${Math.round(cell.height * (1.4 + 0.9 * Math.min(1, p * 1.6)))}px`;
    });
    drop(beam);

    // 十字光：竖 + 横各一道，一闪即散
    const cross = jot(`position:fixed;left:${cell.x}px;top:${cell.y}px;
        width:${Math.round(cell.width * 0.9)}px;height:${Math.round(cell.height * 0.9)}px;
        transform:translate(-50%,-50%);pointer-events:none;z-index:10007;opacity:0;`);
    cross.innerHTML = `<div style="position:absolute;left:50%;top:0;width:14%;height:100%;transform:translateX(-50%);background:linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,250,215,0.95), rgba(255,255,255,0));border-radius:4px;box-shadow:0 0 12px rgba(255,244,180,0.9);"></div>
        <div style="position:absolute;top:42%;left:0;width:100%;height:14%;transform:translateY(-50%);background:linear-gradient(to right, rgba(255,255,255,0), rgba(255,250,215,0.95), rgba(255,255,255,0));border-radius:4px;box-shadow:0 0 12px rgba(255,244,180,0.9);"></div>`;
    clock.animate(560, p => {
        cross.style.opacity = (p < 0.15 ? 0.95 * (p / 0.15) : 0.95 * (1 - (p - 0.15) / 0.85)).toFixed(2);
        cross.style.transform = `translate(-50%,-50%) scale(${(1 + 0.35 * p).toFixed(2)})`;
    }).then(() => drop(cross));

    // 上浮光点 4 颗
    for (let i = 0; i < 4; i++) {
        clock.wait(i * 90).then(() => {
            const dx = (i - 1.5) * cell.width * 0.22;
            const s = jot(`position:fixed;left:${(cell.x + dx).toFixed(1)}px;top:${cell.y}px;
                width:9px;height:9px;border-radius:50%;pointer-events:none;z-index:10008;opacity:0;
                background:radial-gradient(circle, #fffbe0 0%, rgba(255,235,150,0) 70%);`);
            clock.animate(560, p => {
                s.style.opacity = (p < 0.2 ? 0.95 * (p / 0.2) : 0.95 * (1 - (p - 0.2) / 0.8)).toFixed(2);
                s.style.transform = `translate(-50%, ${(-cell.height * 0.9 * p).toFixed(1)}px)`;
            }).then(() => drop(s));
        });
    }
}
