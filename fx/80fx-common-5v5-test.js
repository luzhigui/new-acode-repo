// V6.3.12 | 2026-10-20 | ~32400 bytes
export const VER = 'fx/80fx-common-5v5-test.js V6.3.12';

import { CAMP_TYPES } from '../infra/56-battle-enums.js';
import { snapshotUnitCell } from './90fx-ref-manager.js';
import { clock } from '../infra/52-clock.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { getPerfParam } from '../core/23perf-params.js';

const POOL = {}; const POOL_SIZES = { danmaku: 8, dmgFloat: 6, dodge: 4, healFloat: 4, atkBuffFloat: 4, defBuffFloat: 4, buffBanner: 2 };
function initPool(type, createFn) { if (!POOL[type]) { POOL[type] = { available: [], active: [] }; for (let i = 0; i < POOL_SIZES[type]; i++) { let el = createFn(); el.style.display = 'none'; document.body.appendChild(el); POOL[type].available.push(el); } } }

function acquireFromPool(type, setupFn, duration) {
    if (!POOL[type]) return;
    let pool = POOL[type], el;
    if (pool.available.length > 0) {
        el = pool.available.pop();
    } else if (pool.active.length > 0) {
        el = pool.active.shift();
    } else {
        // 对象池耗尽，buffBanner 允许临时补一个；其余直接放弃
        if (type === 'buffBanner') {
            el = createBuffBannerEl();
        } else {
            return;
        }
    }
    if (!el) return;
    setupFn(el);
    el.style.display = '';
    pool.active.push(el);
    // 回收：用 seq token 判断是否已被复用；clock.wait 不可取消，靠 token 拦旧回调
    el._releaseSeq = (el._releaseSeq || 0) + 1;
    const seq = el._releaseSeq;
    if (duration > 0) {
        clock.wait(duration).then(() => {
            if (el._releaseSeq !== seq) return;
            releaseToPool(type, el);
        });
    }
}
function releaseToPool(type, el) { if (!POOL[type]) return; let pool = POOL[type], idx = pool.active.indexOf(el); if (idx >= 0) { pool.active.splice(idx, 1); el.style.display = 'none'; pool.available.push(el); } }

function createDanmakuEl() { let b = document.createElement('div'); b.className = 'danmaku-bubble'; return b; }
initPool('danmaku', createDanmakuEl);
// 弹幕池重置：战斗重置时必须调用，清空池内引用并重建 DOM
export function resetDanmakuPool() {
    const pool = POOL['danmaku'];
    if (!pool) return;
    [...pool.available, ...pool.active].forEach(el => {
        if (el.parentNode) el.parentNode.removeChild(el);
    });
    POOL['danmaku'] = { available: [], active: [] };
    for (let i = 0; i < POOL_SIZES.danmaku; i++) {
        let el = createDanmakuEl();
        el.style.display = 'none';
        document.body.appendChild(el);
        POOL['danmaku'].available.push(el);
    }
}
export function showDanmaku(unit, text) {
    const rect = snapshotUnitCell(unit);
    if (!rect) return;
    // 存活时长读参数表（bubbleLife），按当前 speed 档位；取不到回落 3500
    const speedKey = GlobalStore.get('speed') || 300;
    const life = getPerfParam('bubbleLife', speedKey) || 3500;
    acquireFromPool('danmaku', (bubble) => {
        bubble.textContent = text;
        bubble.className = 'danmaku-bubble';
        bubble.classList.add(unit.camp===CAMP_TYPES.ALLY?'ally':'enemy');
        bubble.style.left=(rect.left-4)+'px';
        bubble.style.top=(rect.top+rect.height*0.35)+'px';
        bubble.style.transform='translate(-100%, -50%)';
    }, life);
}

function createDmgFloatEl() { let d = document.createElement('div'); d.className = 'dmg-float'; return d; }
initPool('dmgFloat', createDmgFloatEl);
// 同单位掉血飘字短时错位（与 healFloat 同方案）：主攻击数字与流星加深等 afterText 数字近窗连飘时分层上移
const _dmgFloatStack = new Map();
const DMG_STACK_WINDOW = 900;   // ms：同单位在此窗口内的第 N 条上移
const DMG_STACK_MAX = 3;        // 最多错 3 层，第 4 条回到原位
const DMG_STACK_STEP = 20;      // 每层上移像素
export function showDamageFloat(unit, dmg) {
    const rect = snapshotUnitCell(unit);
    if (!rect) return;
    const now = Date.now();
    let rec = _dmgFloatStack.get(unit.uid);
    if (!rec || now - rec.lastAt > DMG_STACK_WINDOW) rec = { count: 0, lastAt: now };
    rec.count = (rec.count % DMG_STACK_MAX) + 1;
    rec.lastAt = now;
    _dmgFloatStack.set(unit.uid, rec);
    const stackOffset = (rec.count - 1) * DMG_STACK_STEP;
    // 存活时长读参数表（floatLife），按当前 speed 档位；取不到回落 1400
    const speedKey = GlobalStore.get('speed') || 300;
    const life = getPerfParam('floatLife', speedKey) || 1400;
    acquireFromPool('dmgFloat', (dmgEl) => {
        dmgEl.textContent = '💥-'+dmg;   // 掉血补图标，与 ⚔攻/🛡防/❤回血 凑齐四类
        dmgEl.style.display = '';        // 点亮量宽（登记进 _activeFloats 供 ⚔/🛡️ 避让；💥 自身仍 right 锚定不变）
        markFloatActive(unit.uid, 'dmg', dmgEl.offsetWidth);
        dmgEl.style.right=(window.innerWidth-rect.right+4)+'px';
        dmgEl.style.top=(rect.top-4-stackOffset)+'px';
    }, life);
}

function createDodgeBubbleEl() { let b = document.createElement('div'); b.className = 'dodge-bubble'; return b; }
initPool('dodge', createDodgeBubbleEl);
export function showDodgeBubble(unit, text) {
    const rect = snapshotUnitCell(unit);
    if (!rect) return;
    acquireFromPool('dodge', (bubble) => {
        bubble.textContent=text;
        bubble.style.left=(rect.left+rect.width/2)+'px';
        bubble.style.top=(rect.top-8)+'px';
    }, 1600);
}

function createHealFloatEl() { let d = document.createElement('div'); d.className = 'heal-float'; return d; }
initPool('healFloat', createHealFloatEl);

// ===== 三次定稿（老板拍板·动态布局）：飘字同单位活跃登记表 =====
// 规则：❤ 钉死格内最左（左缘贴 rect.left+2），💥 钉死最右（right 锚定不动）；
//   ⚔/🛡️ 不占固定坐标——落位时查同单位当前活跃的其他飘字，在「❤右界 ↔ 💥左界」剩余空间动态安放，
//   只保证相对关系「⚔ 恒在 🛡️ 左」。四条实战从不同帧，有限组合：张三丰=❤+⚔、流星=💥+🛡️、振奋=⚔单、胖远桥=🛡️单。
// 落位时把自己的像素宽度一并登记，后落者精确避让（不回挪先落者：⚔先🛡️后→🛡️避⚔，反之亦然，两序都成立）。
const _activeFloats = new Map();   // uid -> { heal:到期ts, healW:px, dmg:ts, dmgW, atk:ts, atkW, def:ts, defW }
const FLOAT_GAP = 4;              // 避让间隙 px
function markFloatActive(uid, kind, w) {
    const now = Date.now();
    let rec = _activeFloats.get(uid);
    if (!rec) { rec = {}; _activeFloats.set(uid, rec); }
    rec[kind] = now + 1400;       // 与池回收时长一致
    rec[kind + 'W'] = w || 0;
    if (_activeFloats.size > 40) {   // 防泄漏：顺带清过期记录
        for (const [k, r] of _activeFloats) {
            if (!(r.heal > now || r.dmg > now || r.atk > now || r.def > now)) _activeFloats.delete(k);
        }
    }
}
// ⚔/🛡️ 动态左缘：kind='atk'（左族）/ 'def'（右族）。
//   对方在场 → ⚔ 取剩余区间 0.28、🛡️ 取 0.72（配对居中）
//   独享     → 区间 0.3 偏移（观感近史前版 0.38/0.62 单独出现的位置）
//   同类已在飘（⚔×2/🛡️×2，如八卦⚔-1+生生不息⚔+N、坚盾🛡️+八卦🛡️）→ 水平右挪一条身位（宽+4px，上限💥左界），
//   不再垂直错层——V6.3.7 的 20px 上错层被老板实测否掉（两条不同战报行的⚔被错开，读起来像「一行加攻飘老高」）；
//   同高并排才符合「一行=一个高度」。⚠️ 调用序：必须先调本函数再 markFloatActive，否则查到的是自己。
function dynamicBuffLeft(uid, rect, kind, w) {
    const now = Date.now();
    const rec = _activeFloats.get(uid) || {};
    const healR = rec.heal > now ? rect.left + 2 + (rec.healW || 30) + FLOAT_GAP : rect.left + 2;   // 可用左界（❤右侧）
    const dmgL = rec.dmg > now ? rect.right + 4 - (rec.dmgW || 30) - FLOAT_GAP : rect.right - 2;   // 可用右界（💥左侧）
    const span = Math.max(0, dmgL - healR - w);
    let left;
    if (kind === 'atk') left = rec.def > now ? healR + span * 0.28 : healR + span * 0.3;
    else { const base = dmgL - w; left = rec.atk > now ? base - span * 0.28 : base - span * 0.3; }
    // 同类避让返回 wrap 标记：窄格放不下两条并排时 left 回独享位、wrap=true 交调用方垂直错层；
    //   宽屏放得下仍水平并排（一行 = 一个高度）。
    if (rec[kind] > now) {
        const shifted = left + (rec[kind + 'W'] || 30) + FLOAT_GAP;
        if (shifted > dmgL - w) return { left, wrap: true };
        left = shifted;
    }
    return { left, wrap: false };
}

// 同单位回血飘字短时错位：九阳+热血同时回血时两条飘字原先完全重叠
const _healFloatStack = new Map();
const HEAL_STACK_WINDOW = 900;   // ms：同单位在此窗口内的第 N 条上移
const HEAL_STACK_MAX = 3;        // 最多错 3 层，第 4 条回到原位
const HEAL_STACK_STEP = 20;      // 每层上移像素

export function showHealFloat(unit, heal) {
    const rect = snapshotUnitCell(unit);
    if (!rect) return;
    const now = Date.now();
    let rec = _healFloatStack.get(unit.uid);
    if (!rec || now - rec.lastAt > HEAL_STACK_WINDOW) rec = { count: 0, lastAt: now };
    rec.count = (rec.count % HEAL_STACK_MAX) + 1;
    rec.lastAt = now;
    _healFloatStack.set(unit.uid, rec);
    const stackOffset = (rec.count - 1) * HEAL_STACK_STEP;
    acquireFromPool('healFloat', (healEl) => {
        healEl.textContent = '❤+' + heal;
        healEl.style.display = '';      // 先点亮再量宽（池元素 setup 时仍 display:none，offsetWidth 恒 0）
        // 三次定稿：❤ 钉死格内最左（左缘贴 rect.left+2，不再外伸——二次版被否）。
        //   宽度登记进 _activeFloats 供 ⚔/🛡️ 落位时避让；史前版内联 translate 被 healUp 首帧覆盖的坑见 V6.2.9 注。
        markFloatActive(unit.uid, 'heal', healEl.offsetWidth);
        healEl.style.left = Math.round(rect.left + 2) + 'px';
        healEl.style.right = 'auto';
        healEl.style.top = Math.round(rect.top - 4 - stackOffset) + 'px';
        healEl.style.transform = '';    // 清残留（动画接管 transform）
    }, 1400);
}

// 攻击力增加飘字
function createAtkBuffFloatEl() { let d = document.createElement('div'); d.className = 'heal-float'; d.style.color = '#ff8c00'; return d; }
initPool('atkBuffFloat', createAtkBuffFloatEl);

// 弹幕图标版（用户定调）：加攻⚔ / 加防🛡️ 前缀图标
//   图标一律取游戏职业 logo 本体（战士⚔️ / 防战🛡️），不另造字形；数值颜色沿用既有色规：
//   攻=橙 .orange #d2691e、防=蓝 .blue #1e6bb8、血=绿 .green #2e7d32、掉血=红 .red #c0392b
function createDefBuffFloatEl() { let d = document.createElement('div'); d.className = 'heal-float'; d.style.textShadow = '0 1px 3px rgba(0,0,0,0.85)'; return d; }
initPool('defBuffFloat', createDefBuffFloatEl);

export function showDefBuffFloat(unit, def) {
    const rect = snapshotUnitCell(unit);
    if (!rect) return;
    acquireFromPool('defBuffFloat', (el) => {
        el.textContent = '🛡️' + (def > 0 ? '+' : '') + def;   // 🛡️ 带 U+FE0F = 防战职业 logo 本体（彩色）
        el.style.color = '#1e6bb8';                            // 复用游戏既有防御色，不自造
        el.style.display = '';      // 先点亮再量宽（池元素 setup 时仍 display:none，offsetWidth 恒 0）
        const w = el.offsetWidth;
        // V6.3.8：先算 left 再登记（查的是之前在飘的同类）；V6.3.9 返回值带 wrap：
        //   水平放不下（窄格两条🛡️，如流星减防+坚盾同格）→ 垂直一上一下（老板 10-08 拍板），首条标准位、次条**上错 20px**
        const { left, wrap } = dynamicBuffLeft(unit.uid, rect, 'def', w);
        el.style.left = Math.round(left) + 'px';
        markFloatActive(unit.uid, 'def', w);
        el.style.right = 'auto';
        el.style.top = Math.round(rect.top - 4 - (wrap ? 20 : 0)) + 'px';   // 放得下=一行一个高度；放不下=一上一下
    }, 1400);
}

// 拒马沙化消散（用户定调：消散≠死亡，不走死亡画笔）：
//   拒马原地碎成一撮烟沙——底座沙圈淡出 + 顶上冒一缕上飘的沙雾粒子，纯 CSS 动画一次性元素。
export function showHorseDissolve(unit) {
    const rect = snapshotUnitCell(unit);
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const bed = document.createElement('div');
    bed.setAttribute('data-fx', 'temporary');
    bed.style.cssText = `
        position:fixed; left:${cx}px; top:${cy}px; width:${Math.max(rect.width * 0.7, 40)}px; height:12px;
        transform:translate(-50%,-50%);
        background:radial-gradient(ellipse at center, rgba(194,178,128,0.85) 0%, rgba(194,178,128,0) 70%);
        border-radius:50%; z-index:10001; pointer-events:none;
        animation:horseDissolveBed 1.2s ease-out forwards;`;
    document.body.appendChild(bed);
    for (let i = 0; i < 8; i++) {
        const p = document.createElement('div');
        p.setAttribute('data-fx', 'temporary');
        const dx = (Math.random() - 0.5) * rect.width * 0.8;
        const dur = 900 + Math.random() * 600;
        const size = 3 + Math.random() * 4;
        p.style.cssText = `
            position:fixed; left:${cx + (Math.random() - 0.5) * rect.width * 0.5}px; top:${cy + (Math.random() - 0.5) * rect.height * 0.4}px;
            width:${size}px; height:${size}px; border-radius:50%;
            background:rgba(194,178,128,0.9); z-index:10001; pointer-events:none;
            animation:horseDissolveDust ${dur}ms ease-out forwards;
            --dx:${dx}px;`;
        document.body.appendChild(p);
    }
    setTimeout(() => { bed.remove(); }, 1300);
    setTimeout(() => {
        document.querySelectorAll('[data-fx="temporary"]').forEach(el => {
            if (el.style.animation && el.style.animation.includes('horseDissolveDust')) el.remove();
        });
    }, 1700);
}
// 攻/防飘字落点**统一**（用户定案）：初始高度与掉血/回血**同一高度**（rect.top - 4，顶边距格顶 4px），
//   再由 healUp 动画往上飘；水平按类型错开——⚔ 居中偏左 0.38、🛡️ 居中偏右 0.62。
//   此前 ⚔/🛡️ 试过「格子内垂直居中」「格子上方（底距格顶 4px）」两版，均非用户要的落点（已废弃）。
//   通用注意：不能用 translate 做居中（healUp 动画全程接管 transform），一律「先清 display → 量宽 → 算 left」。
export function showAtkBuffFloat(unit, atk) {
    const rect = snapshotUnitCell(unit);
    if (!rect) return;
    acquireFromPool('atkBuffFloat', (el) => {
        el.textContent = '⚔' + (atk > 0 ? '+' : '') + atk;   // 负数（八卦减攻）不带 '+'，避免 '⚔+-1'
        el.style.display = '';      // 先点亮再量宽（池元素 setup 时 display:none，offsetWidth 恒 0）
        el.style.transform = '';    // 清掉旧 translate，见上注
        const w = el.offsetWidth;
        // V6.3.8：先算 left 再登记；V6.3.9 同款 wrap——⚔×2 同格水平放不下（胖远桥被溅射+攻+八卦-攻同格等）
        //   垂直上错，与 🛡️ 同规矩（次条往上）
        const { left, wrap } = dynamicBuffLeft(unit.uid, rect, 'atk', w);
        el.style.left = Math.round(left) + 'px';
        markFloatActive(unit.uid, 'atk', w);
        el.style.right = 'auto';
        el.style.top = Math.round(rect.top - 4 - (wrap ? 20 : 0)) + 'px';   // 初始高度与掉血/回血一致；放不下=一上一下
        el.style.zIndex = '10004';
    }, 1400);
}

// 灭绝师太出手计数：头顶正中飘出大写数字（壹/貳/參 轮换），放大后上浮消散。
//   不走对象池——一次性元素用完即删，与 fx/91 的「吼」字同套路；快进判断由 emit 侧（fx/89）拦。
export function showMiejueCountFloat(unit, text) {
    const rect = snapshotUnitCell(unit);
    if (!rect || !text) return;
    const el = document.createElement('div');
    el.setAttribute('data-fx', 'temporary');
    el.textContent = text;
    const cx = rect.left + rect.width / 2;
    el.style.cssText = `
        position:fixed; left:${cx}px; top:${rect.top + 2}px;
        transform:translate(-50%,-50%) scale(0.6);
        font-family:"KaiTi","STKaiti","Songti SC",serif;
        font-size:22px; font-weight:900; color:#ffe89a;
        text-shadow:0 0 10px rgba(255,170,0,0.95), 0 0 22px rgba(200,0,0,0.6), 0 2px 3px rgba(0,0,0,0.85);
        z-index:10012; pointer-events:none; opacity:0; white-space:nowrap;
    `;
    document.body.appendChild(el);
    clock.animate(1000, (p) => {
        let op, sc, rise;
        if (p <= 0.18) { const t = p / 0.18; op = t; sc = 0.6 + 0.75 * t; rise = -6 * t; }
        else if (p <= 0.55) { const t = (p - 0.18) / 0.37; op = 1; sc = 1.35 - 0.1 * t; rise = -6 - 12 * t; }
        else { const t = (p - 0.55) / 0.45; op = 1 - t; sc = 1.25 + 0.25 * t; rise = -18 - 16 * t; }
        el.style.opacity = op.toFixed(2);
        el.style.transform = `translate(-50%, calc(-50% + ${rise.toFixed(1)}px)) scale(${sc.toFixed(2)})`;
    }).then(() => { if (el.parentNode) el.parentNode.removeChild(el); });
}

// 何太冲箭靶碎裂（消费 🎯 的命中帧）：🎯 急弹放大 → 崩裂消散，同时金色冲击环扩散、4 片碎光四散。
//   一次性元素（data-fx="temporary"），不走对象池；快进在调用方（fx/88 _triggerFX 入口）已拦。
export function showMarkBurst(unit) {
    const rect = snapshotUnitCell(unit);
    if (!rect) return;
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;

    // ① 金色冲击环
    const ring = document.createElement('div');
    ring.setAttribute('data-fx', 'temporary');
    ring.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:8px;height:8px;border-radius:50%;
        border:2px solid rgba(255,205,85,0.95);box-shadow:0 0 14px rgba(255,120,40,0.9);
        transform:translate(-50%,-50%);z-index:10013;pointer-events:none;`;
    document.body.appendChild(ring);
    clock.animate(420, (p) => {
        ring.style.transform = `translate(-50%,-50%) scale(${(1 + 8 * (1 - Math.pow(1 - p, 2))).toFixed(2)})`;
        ring.style.opacity = (0.95 * (1 - p)).toFixed(2);
    }).then(() => { if (ring.parentNode) ring.parentNode.removeChild(ring); });

    // ② 靶心 🎯：急弹 → 崩裂放大消散
    const core = document.createElement('div');
    core.textContent = '🎯';
    core.setAttribute('data-fx', 'temporary');
    core.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;font-size:26px;line-height:1;
        transform:translate(-50%,-50%) scale(0.5) rotate(-14deg);z-index:10014;pointer-events:none;opacity:0;
        filter:drop-shadow(0 0 10px rgba(255,150,40,0.95));`;
    document.body.appendChild(core);
    clock.animate(520, (p) => {
        let op, sc, rot;
        if (p <= 0.30) { const t = p / 0.30; op = t; sc = 0.5 + 1.0 * t; rot = -14 + 10 * t; }           // 弹出
        else { const t = (p - 0.30) / 0.70; op = 1 - t; sc = 1.5 + 0.9 * t; rot = -4 + 22 * t; }        // 崩裂放大消散
        core.style.opacity = op.toFixed(2);
        core.style.transform = `translate(-50%,-50%) scale(${sc.toFixed(2)}) rotate(${rot.toFixed(0)}deg)`;
    }).then(() => { if (core.parentNode) core.parentNode.removeChild(core); });

    // ③ 4 片碎光四散（上/右/下/左四向 + 固定抖动，不用随机数——表现层不占战斗 RNG）
    for (let i = 0; i < 4; i++) {
        const shard = document.createElement('div');
        shard.textContent = '✦';
        shard.setAttribute('data-fx', 'temporary');
        shard.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;font-size:12px;
            transform:translate(-50%,-50%);z-index:10013;pointer-events:none;opacity:0;
            color:#ffd76a;text-shadow:0 0 8px rgba(255,120,40,0.9);`;
        document.body.appendChild(shard);
        const ang = (-70 + i * 75) * Math.PI / 180;
        const dist = 26 + (i % 2) * 8;
        clock.animate(560, (p) => {
            const d = dist * (1 - Math.pow(1 - p, 2));   // easeOut
            const op = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
            shard.style.left = (cx + Math.cos(ang) * d).toFixed(1) + 'px';
            shard.style.top = (cy + Math.sin(ang) * d).toFixed(1) + 'px';
            shard.style.opacity = Math.max(0, op).toFixed(2);
            shard.style.transform = `translate(-50%,-50%) rotate(${(p * 260).toFixed(0)}deg)`;
        }).then(() => { if (shard.parentNode) shard.parentNode.removeChild(shard); });
    }
}

// 死亡画笔：600ms 展开覆盖层，clock 驱动
function _executeBrush(div) {
    if (!div) return;
    let oldOverlay = div.querySelector('.brush-overlay');
    if (oldOverlay) oldOverlay.remove();
    div.style.width = 'auto';
    div.offsetHeight;
    div.style.width = '100%';
    div.style.minWidth = '100%';
    let logEl = document.getElementById('log'), paddingLeft = 6;
    if (logEl) { let cs = getComputedStyle(logEl), pl = parseFloat(cs.paddingLeft); if (!isNaN(pl) && pl > 0) paddingLeft = pl; }
    let overlay = document.createElement('div');
    overlay.className = 'brush-overlay';
    overlay.style.position = 'absolute';
    overlay.style.left = (-paddingLeft) + 'px';
    overlay.style.top = '0';
    overlay.style.width = '0';
    overlay.style.height = '100%';
    overlay.style.pointerEvents = 'none';
    div.style.position = 'relative';
    div.appendChild(overlay);
    clock.animate(600, (p) => {
        if (p >= 1) {
            overlay.style.width = 'calc(100% + ' + (paddingLeft*2) + 'px)';
            overlay.style.opacity = '0.6';
        } else {
            overlay.style.width = (p * 100) + '%';
        }
    });
}
export function applyBrushEffect(div) { _executeBrush(div); }

// 乘风突袭波及爪痕特效（视觉由 CSS 动画承担，clock 只负责移除时机）
export function showWindClaw(unit) {
    let grid = document.querySelector(`[data-uid="${unit.uid}"]`);
    if (!grid) return;

    const rect = grid.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    for (let i = 0; i < 3; i++) {
        const claw = document.createElement('div');
        claw.setAttribute('data-fx', 'temporary');
        const angle = -30 + Math.random() * 20;
        const len = 20 + Math.random() * 15;
        const thickness = 1 + Math.random() * 2.5;
        const offsetX = (Math.random() - 0.5) * 20;
        const offsetY = (Math.random() - 0.5) * 20;
        claw.style.cssText = `
            position:fixed; left:${cx + offsetX}px; top:${cy + offsetY}px;
            width:${len}px; height:${thickness}px;
            background: linear-gradient(to right, rgba(45,45,50,0.95), rgba(15,15,20,0.35));
            transform: rotate(${angle}deg);
            z-index:10010; pointer-events:none;
            border-radius: 1px;
            filter: drop-shadow(0 0 5px rgba(255,255,255,0.55)) drop-shadow(0 0 2px rgba(0,0,0,0.7));
            animation: clawSlash 0.5s ease-out forwards;
            animation-delay: ${i * 0.08}s;
        `;
        document.body.appendChild(claw);
        clock.wait(600).then(() => { if (claw.parentNode) claw.remove(); });
    }
}

// 苦练：全队 💪 上浮 + 金圈闪烁
export function showKuLianEffect(unit, team) {
    team.forEach(member => {
        if (!member.alive || member.isHorse) return;
        let grid = document.querySelector(`[data-uid="${member.uid}"]`);
        if (!grid) return;

        let muscle = document.createElement('div');
        muscle.setAttribute('data-fx', 'temporary');
        muscle.innerHTML = '💪';
        muscle.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:20px;z-index:10005;pointer-events:none;opacity:0;';
        grid.style.position = 'relative';
        grid.appendChild(muscle);

        // clock 驱动的上浮：0→0.3 淡入上升到 -120%，0.3→0.8 缓升，0.8→1 淡出
        clock.animate(1500, (p) => {
            let op, ty;
            if (p <= 0.3) { const t = p / 0.3; op = t; ty = -50 - 70 * t; }
            else if (p <= 0.8) { const t = (p - 0.3) / 0.5; op = 1; ty = -120 - 10 * t; }
            else { const t = (p - 0.8) / 0.2; op = 1 - t; ty = -130 - 30 * t; }
            muscle.style.opacity = op;
            muscle.style.transform = `translate(-50%, ${ty}%)`;
        });

        // 金圈闪烁：blinks*2 次相位切换，clock 驱动
        const totalBlinks = (member.uid === unit.uid ? 3 : 2) * 2;
        let lastPhase = -1;
        clock.animate(totalBlinks * 400, (p) => {
            const phase = Math.min(totalBlinks - 1, Math.floor(p * totalBlinks));
            if (phase !== lastPhase) {
                lastPhase = phase;
                grid.style.boxShadow = (phase % 2 === 0) ? '0 0 12px rgba(255,215,0,0.7)' : '';
            }
            if (p >= 1) grid.style.boxShadow = '';
        });

        clock.wait(2000).then(() => { if (muscle.parentNode) muscle.remove(); });
    });
}

// 生生不息：太极印从格子上浮 + 柔和金晕，格子本体不动。
// 不用 cell-cheer：那是胜利特效的跳动，语义是庆祝；疗愈该"扩散"不该"蹦"。
// 同单位 1.2s 内只播一次：回合开始与「轮到自己」可能紧邻（1 号位），
// 三处触发共用同一份续航，视觉合并成一次，避免连出两个太极印。
const _meditateAt = new Map();
const MEDITATE_DEBOUNCE_MS = 1200;

export function showMeditateEffect(unit) {
    const now = Date.now();
    if (now - (_meditateAt.get(unit.uid) || 0) < MEDITATE_DEBOUNCE_MS) return;
    _meditateAt.set(unit.uid, now);
    const grid = document.querySelector(`[data-uid="${unit.uid}"]`);
    if (!grid) return;
    grid.style.position = 'relative';

    // ☯ 用字体原色（黑底白鱼），不染不发光——之前染成暗金 + 金晕，看起来发黄发绿
    const sigil = document.createElement('div');
    sigil.setAttribute('data-fx', 'temporary');
    sigil.textContent = '☯';
    sigil.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:22px;color:#111;z-index:10005;pointer-events:none;opacity:0;';
    grid.appendChild(sigil);

    // 上升 + 放大 + 自转一整圈（转起来才像"阵在运转"）
    clock.animate(1400, (p) => {
        let op, ty, sc;
        if (p <= 0.25) { const t = p / 0.25; op = t; ty = -50 - 20 * t; sc = 0.6 + 0.5 * t; }
        else if (p <= 0.7) { const t = (p - 0.25) / 0.45; op = 1; ty = -70 - 30 * t; sc = 1.1; }
        else { const t = (p - 0.7) / 0.3; op = 1 - t; ty = -100 - 20 * t; sc = 1.1 - 0.2 * t; }
        sigil.style.opacity = op;
        sigil.style.transform = `translate(-50%, ${ty}%) scale(${sc}) rotate(${p * 360}deg)`;
    });

    // 白光呼吸两下就散：只动 box-shadow，不改 border、不位移
    clock.animate(1200, (p) => {
        const g = Math.sin(p * Math.PI * 2) * (1 - p);
        grid.style.boxShadow = g > 0.05 ? `0 0 14px rgba(255,255,255,${(0.75 * g).toFixed(2)})` : '';
        if (p >= 1) grid.style.boxShadow = '';
    });

    clock.wait(1500).then(() => { if (sigil.parentNode) sigil.remove(); });
}

// 全屏横幅
function createBuffBannerEl() { let d = document.createElement('div'); d.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:2.5rem;font-weight:bold;color:#ffd700;z-index:10030;pointer-events:none;text-shadow:0 0 20px rgba(255,215,0,0.8);white-space:nowrap;animation:bannerPop 1.5s ease-out forwards;'; return d; }
initPool('buffBanner', createBuffBannerEl);

export async function showBuffBanner(text) {
    return new Promise(resolve => {
        try {
            acquireFromPool('buffBanner', (banner) => {
                if (!banner) return;
                banner.textContent = text;
                banner.style.animation = 'none';
                banner.offsetHeight;
                banner.style.animation = 'bannerPop 1.5s ease-out forwards';
            }, 1500);
        } catch (e) {
            console.error('showBuffBanner 对象池异常:', e);
        }
        // 阻塞横幅：clock.wait 在暂停时挂起、快进时立即完成，不会死锁
        clock.wait(1500).then(resolve);
    });
}

// 大型横幅，用于闪避反击等重要事件，不走对象池，独立创建
export function showCriticalBanner(text) {
    return new Promise(resolve => {
        const banner = document.createElement('div');
        banner.textContent = text;
        banner.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:3.5rem;font-weight:bold;color:#FFD700;z-index:10050;pointer-events:none;text-shadow:0 0 30px rgba(255,215,0,0.9), 0 0 10px black;white-space:nowrap;animation:bannerPop 2.5s ease-out forwards;';
        document.body.appendChild(banner);
        clock.wait(2500).then(() => {
            if (banner.parentNode) banner.remove();
            resolve();
        });
    });
}

// 通用气泡
export function showComicBubble(text, x, y, className) {
    const bubble = document.createElement('div');
    bubble.className = `comic-bubble ${className}`; bubble.textContent = text;
    bubble.style.left = x + 'px'; bubble.style.top = y + 'px';
    bubble.style.transform = 'translate(-50%, -50%)';
    bubble.style.position = 'fixed'; bubble.style.zIndex = '10030';
    bubble.style.background = 'white'; bubble.style.border = '2px solid #FFD700';
    bubble.style.borderRadius = '20px'; bubble.style.padding = '10px 20px';
    bubble.style.fontWeight = 'bold'; bubble.style.fontSize = '16px';
    bubble.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
    bubble.style.pointerEvents = 'none'; bubble.style.whiteSpace = 'nowrap';
    bubble.style.animation = 'bubbleIn 0.3s ease-out';
    bubble.setAttribute('data-fx', 'temporary');
    document.body.appendChild(bubble);
    clock.wait(4000).then(() => {
        bubble.style.transition = 'opacity 0.3s'; bubble.style.opacity = '0';
        clock.wait(300).then(() => bubble.remove());
    });
    return bubble;
}

// 新婚爱心特效（在格子中间显示淡粉红爱心）
export function showHeartEffect(unit) {
    let grid = document.querySelector(`[data-uid="${unit.uid}"]`);
    if (!grid) return;

    let heart = document.createElement('div');
    heart.setAttribute('data-fx', 'temporary');
    heart.innerHTML = '💖';
    grid.style.position = 'relative';
    heart.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:24px;color:#FFB6C1;text-shadow:0 0 8px #FFB6C1;z-index:9999;opacity:0;transition:opacity 0.3s, transform 0.3s;pointer-events:none;';
    grid.appendChild(heart);

    requestAnimationFrame(() => {
        heart.style.opacity = '1';
        heart.style.transform = 'translate(-50%, -120%)';
    });

    clock.wait(1500).then(() => { heart.style.opacity = '0'; });
    clock.wait(2000).then(() => { if (heart.parentNode) heart.parentNode.removeChild(heart); });
}

// 快乐掉血闪动特效（淡红色闪动）
export function showPinkFlash(unit) {
    let grid = document.querySelector(`[data-uid="${unit.uid}"]`);
    if (!grid) return;
    let flash = document.createElement('div');
    flash.className = 'pink-flash';
    flash.setAttribute('data-fx', 'temporary');
    flash.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(255, 105, 180, 0.4);z-index:9;pointer-events:none;opacity:0;';
    grid.appendChild(flash);
    let lastPhase = -1;
    clock.animate(600, (p) => {
        const phase = Math.min(3, Math.floor(p * 4));
        if (phase !== lastPhase) {
            lastPhase = phase;
            flash.style.opacity = (phase % 2 === 0) ? '1' : '0';
        }
        if (p >= 1) {
            flash.style.opacity = '0';
            clock.wait(300).then(() => { if (flash.parentNode) flash.parentNode.removeChild(flash); });
        }
    });
}