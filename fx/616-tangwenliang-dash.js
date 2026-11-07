// fx/616-tangwenliang-dash.js — 唐文亮「冲刺·七伤齐发」多人推挤演出
// V3.0.0 视觉整体对齐 demo（2026-11-02）：位置/缩放分离、克隆体自绘、标枪收尾、血条防剧透
export const VER = 'fx/616-tangwenliang-dash.js V3.0.2';
// V3.0.2 | 2026-11-07 | 修「标枪飞行期间名字不变蓝、飞完才变蓝」：
//   克隆体卡片没带名字色档（真格 render/403 对唐文亮是 name-blue），演出时看到的是白名克隆体，
//   收尾后 storeAfter 显真格才变蓝。cardHtmlFromUnit 补上同一套色档（绿/金/紫/蓝），克隆体与真格一致。
// V3.0.1 | 2026-11-06 | 修「冲刺特效只显示一部分」：
//   ① 快版锚点从「ghosts.find(x => !x.isDash)」改成按 targetUid 找克隆体，找不到用真格 ——
//      目标本来就在前排（target.pos<=3）不会产生克隆体，旧写法必抓到「被挤队友」，
//      金线/冲击环/标枪全打在队友身上，目标一次都没被演出；`_isDashStrikeFx` 又把默认攻击动画跳过，
//      所以玩家看到的就是「后半段没了」。
//   ② 快版/慢版去掉「moves 为空 / ghosts 为空就 return」——双方原地未动也照常用真格演完
//      锁链→冲击→标枪，只有 dash 连 from/to 都没有才放弃。
//   ③ performFinishingPunch 的基线按 position 分口径：克隆体是 fixed（left/top=视口坐标），
//      真格 .cell 是 relative（left/top=相对偏移），否则拿真格当唐文亮锚点时整格会被 left=视口 x 顶飞。
// V3.0.0 | 2026-11-02 | 视觉整体对齐 demo 逐帧演示（用户拍板「能替换全部替换」）：
//   ① makeGhost 改为一律从 store 自绘卡片 —— DASH 的 store 步会先把终点格 resetCell 成空壳
//      （_renderFlyMode='fly' 走 render/32 的 fly 分支），cloneNode 那条路在回放/联机从机上必然拿 null，
//      整个位移/锁链/慢速档会被静默跳过（老板实机「动画完全不对」的根因）。
//   ② 位置只写 left/top、transform 只放 scale —— 修「双算位移冲出格子」（原慢速档走位写 transform）。
//   ③ 新增 freezeGhosts：碰撞帧把 left/top 固化到终点 —— 修「克隆体在 finishing punch 时弹回起点」
//      （原版 finishing punch 把位移写进 transform，与 left/top 双算）。
//   ④ performFinishingPunch 改为 CSS 标枪（shaft 64×8 + head 22px 三角），飞 400ms、扎中停留 200ms。
//      语义说明：原版是「近战一拳」；主代码唐文亮冲刺后转战士、拳头语义更贴；但用户拍板标枪更精致，
//      且标枪本就是唐文亮招牌——按用户指令改标枪，快版与慢速档统一。
//   ⑤ 血条防剧透：血量真值由引擎 modules/315 随 dash.hits 直接带过来（hpBefore/hpAfter），
//      克隆体用 hpBefore 开场，碰撞帧 revealGhostHp 切到 hpAfter。
//      不再从 store 反推——被动冲刺时 store 已被 ATTACK 收尾写成扣血后，反推等于二次扣血（血条忽空）。
//      同时删掉原版慢速档/快版里「碰撞帧 store.dispatch(HP_CHANGE) 再扣一次」的双扣血
//      （syncStoreFromStep 最终会覆盖回引擎值，但演出瞬态会显示多扣一次的血条）。
//   ⑥ 卡片血条颜色阈值 50/20 → 70/40，与 render/403-grid-render 的格子色档对齐（原版两者不一致）。
// 强推挤压版：单目标双克隆 → moves 多人克隆 + 金线对拉 + 冲击环/火花/屏震。
//   纯装饰：位置由引擎 doDash 经 moveUnitPosition 落定（POS_CHANGE/STATE_CHANGE 事件走 core/13 既有链）。
//   交接顺序（别搞反，否则旧格闪回一帧）：克隆体落定 → storeAfter 清 fly 显真格 → 克隆体才淡出。
//   快进：入口直接 return。
import { clock } from '../infra/103-clock.js';
import { getCellByPos } from './611-fx-ref-manager.js';
import { GlobalStore } from '../infra/104-global-store.js';
import { getPerfParam } from '../core/223-perf-params.js';
import { getRoleIcon } from '../render/414-role-cards.js';
import { isNamedCharacter, hasSkills } from '../core/201-config-5v5-test.js';
import { STORE_ACTION_TYPES } from '../infra/106-battle-enums.js';
import { isFxSkipped } from '../infra/111-fx-gate.js';
import { fmtHp } from '../infra/102-core-utils.js';

// 真实时间等待：clock.wait 会被倍速压缩，子弹时间档不能用它——
//   用一个空 animate + minRealMs 同值，保证真实时钟走满 ms 才 resolve（暂停时同样冻结）。
function realWait(ms) {
    return clock.animate(ms, () => {}, { minRealMs: ms });
}

function rectOf(camp, pos) {
    if (camp == null || pos == null) return null;
    const el = getCellByPos(camp, pos);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}

// 元素 → 同结构 rect（真格锚点用；克隆体与真格共用同一套字段）
function rectOfEl(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}

// ============================== 血条防剧透 ==============================
// 引擎 modules/315 doDash 在 dash.hits 里给出真值：hpBefore（冲刺前）/ hpAfter（applyStatChange 扣完后的实际值）。
//   克隆体开场用 hpBefore（不剧透），碰撞帧 revealGhostHp 切到 hpAfter。
//   不能从 store 反推：主动冲刺时 store 还没落账（是扣血前）、被动冲刺时 store 已是扣血后，
//   同一个「反推公式」在两种触发时机必错一种。
const _hpSnapshot = new Map();   // uid -> hpBefore（演出前血量）
const _hpAfter = new Map();      // uid -> hpAfter（碰撞帧才揭晓的扣血后血量）
const _hpRevealed = new Set();   // 已解密 uid（碰撞帧后可以显示扣血后）
const _hpShown = new Map();      // uid -> 当前克隆体显示的血量

function snapshotHpBefore(dash) {
    _hpSnapshot.clear();
    _hpAfter.clear();
    _hpRevealed.clear();
    _hpShown.clear();
    // 只搬运引擎给的真值，不再从 store 反推（那会把同一刀扣两次，见上）。
    for (const h of ((dash && dash.hits) || [])) {
        if (!h || h.uid == null || !(h.dmg > 0)) continue;
        if (h.hpBefore == null || h.hpAfter == null) continue;
        _hpSnapshot.set(h.uid, h.hpBefore);
        _hpShown.set(h.uid, h.hpBefore);
        _hpAfter.set(h.uid, h.hpAfter);
    }
}

function revealGhostHp(uids) {
    for (const uid of (uids || [])) {
        if (!_hpSnapshot.has(uid)) continue;
        _hpRevealed.add(uid);
        _hpShown.delete(uid);
    }
    // 碰撞帧直接重绘成 payload 的 hpAfter：两种触发时机 store 的值不一样（主动=扣血前 / 被动=扣血后），
    //   只有引擎真值可靠，所以这里不读 store 的血量。
    const store = GlobalStore.get('battleStore');
    if (!store) return;
    const units = store.getState().units;
    for (const gh of activeGhosts) {
        if (!gh.g || !gh.g.el) continue;
        if (!_hpRevealed.has(gh.uid)) continue;
        const after = _hpAfter.get(gh.uid);
        const u = units.find(x => x.uid === gh.uid);
        if (!u || after == null) continue;
        _hpShown.set(gh.uid, after);
        gh.g.el.innerHTML = cardHtmlFromUnit(u, after);
    }
}

// ============================== 卡片 / 克隆体 ==============================
// 名字色档：与 render/403-grid-render 同一套判据（绿=M100带技能 / 金≥112 / 紫≥107 / 蓝≥104且具名）。
//   克隆体必须带同款色档，否则演出中是白名、收尾显真格才「变蓝」。
function nameTierOf(u) {
    const displayName = (u.state && u.state._displayName) || u.name || '';
    const m = u.m || 0;
    if (m === 100 && hasSkills(displayName)) return 'name-green';
    if (m >= 112) return 'gold';
    if (m >= 107) return 'name-purple';
    if (m >= 104 && isNamedCharacter(displayName)) return 'name-blue';
    return '';
}

// 单位数据 → 格子卡片 HTML（与 render/403-grid-render 同款结构与色档）
//   hpOverride：演出前血量；缺省用 store 当前值
function cardHtmlFromUnit(u, hpOverride) {
    const hp = (hpOverride != null) ? hpOverride : u.hp;
    const pct = Math.max(0, Math.floor((hp / u.maxHp) * 100));
    const hpCls = pct > 70 ? 'hp-text-green' : (pct > 40 ? 'hp-text-orange' : 'hp-text-red');
    const bar = pct > 70 ? '#4caf50' : (pct > 40 ? '#ff9800' : '#f44336');
    const icon = getRoleIcon(u, { isStunned: false, isDead: false, pangTaunting: false });
    const nameTier = nameTierOf(u);
    return `<span class="cell-icon">${icon}</span>` +
        `<div class="cell-info"><span class="cell-name ${nameTier}">${u.name}</span>` +
        `<span class="cell-stats">攻${Math.round(u.atk)} 防${Math.round(u.def)} <span class="${hpCls}">血${fmtHp(hp)}</span></span></div>` +
        `<div class="hp-bar-wrap"><div class="hp-bar-inner" style="height:${pct}%;background:${bar};"></div></div>`;
}

// 克隆体：一律从 store 自绘（不再 clone 终点格 DOM）。
//   内容取 fromPos 格的 rect 起跑、单位数据从 store 按 uid 现取。
function makeGhost(camp, fromPos, toPos, z, uid) {
    const r = rectOf(camp, fromPos);
    if (!r) return null;
    const store = GlobalStore.get('battleStore');
    const u = store ? store.getState().units.find(x => x.uid === uid) : null;
    if (!u) return null;
    const hpOverride = _hpSnapshot.has(uid) ? _hpSnapshot.get(uid) : null;
    const g = document.createElement('div');
    g.className = 'cell';
    g.innerHTML = cardHtmlFromUnit(u, hpOverride);
    g.setAttribute('data-fx', 'temporary');
    g.style.cssText += `;position:fixed;left:${r.left}px;top:${r.top}px;width:${r.w}px;height:${r.h}px;
        margin:0;z-index:${z};pointer-events:none;box-sizing:border-box;opacity:1;visibility:visible;transition:none;`;
    document.body.appendChild(g);
    return { el: g, from: r };
}

// 落定：把 left/top 固化到终点（后续标枪/收势不再动位置，不会弹回起点）
//   transform 保持创建时的 scale（不写死，避免抹掉队友的 0.82）
function freezeGhosts(ghosts) {
    for (const gh of (ghosts || [])) {
        if (!gh || !gh.toRect || !gh.g) continue;
        gh.g.el.style.left = gh.toRect.left + 'px';
        gh.g.el.style.top = gh.toRect.top + 'px';
    }
}

// ============================== 血条单一时间线 ==============================
// 每帧对比「克隆体当前显示血量」与 store 当前血量，不同才重绘。
//   未解密的 uid 跳过（克隆体保持演出前的 hpBefore，不跟随 store，防剧透）。
let maskEl = null;
let chainEl = null;
let chainHead = null;
let activeGhosts = [];

function guardTick() {
    const store = GlobalStore.get('battleStore');
    if (!store) return;
    const units = store.getState().units;
    for (const gh of activeGhosts) {
        if (!gh.g || !gh.g.el) continue;
        if (!_hpRevealed.has(gh.uid)) continue;
        const u = units.find(x => x.uid === gh.uid);
        if (!u) continue;
        const shown = _hpShown.get(gh.uid);
        if (shown === u.hp) continue;
        _hpShown.set(gh.uid, u.hp);
        gh.g.el.innerHTML = cardHtmlFromUnit(u, null);
    }
}

// ============================== 金线（快版用） ==============================
function createBeam(container) {
    const glow = document.createElement('div');
    glow.setAttribute('data-fx', 'temporary');
    glow.style.cssText = 'position:fixed;height:9px;border-radius:6px;pointer-events:none;opacity:0;z-index:10;background:linear-gradient(90deg,rgba(255,214,96,.15),rgba(255,150,60,.62));filter:blur(3px);transform-origin:0 50%;';
    const core = document.createElement('div');
    core.setAttribute('data-fx', 'temporary');
    core.style.cssText = 'position:fixed;height:3px;border-radius:2px;pointer-events:none;opacity:0;z-index:11;background:linear-gradient(90deg,#fff3c4,#ffd166 42%,#ff9f43);box-shadow:0 0 10px rgba(255,200,90,.95);transform-origin:0 50%;';
    const head = document.createElement('div');
    head.setAttribute('data-fx', 'temporary');
    head.style.cssText = 'position:fixed;width:11px;height:11px;border-radius:50%;pointer-events:none;opacity:0;z-index:12;background:radial-gradient(circle,#fff 0%,#ffe9a8 35%,rgba(255,170,60,0) 72%);';
    container.append(glow, core, head);
    return { glow, core, head };
}

function setBeam(b, x1, y1, x2, y2, p) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 0.001;
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;
    [[b.glow, 9], [b.core, 3]].forEach(([el, h]) => {
        el.style.left = x1 + 'px';
        el.style.top = (y1 - h / 2) + 'px';
        el.style.width = len + 'px';
        el.style.transform = `rotate(${ang}deg) scaleX(${Math.max(0.0001, p)})`;
    });
    const hx = x1 + Math.cos(Math.atan2(dy, dx)) * len * p;
    const hy = y1 + Math.sin(Math.atan2(dy, dx)) * len * p;
    b.head.style.left = (hx - 5.5) + 'px';
    b.head.style.top = (hy - 5.5) + 'px';
}

async function removeBeam(b) {
    if (!b) return;
    await clock.animate(180, (p) => {
        b.glow.style.opacity = String(0.85 * (1 - p));
        b.core.style.opacity = String(1 - p);
        b.head.style.opacity = String(1 - p);
    });
    b.glow.remove(); b.core.remove(); b.head.remove();
}

// ============================== 冲击环 / 火花 / 屏震 ==============================
function impactRing(rect, color) {
    const d = document.createElement('div');
    d.setAttribute('data-fx', 'temporary');
    d.style.cssText = `position:fixed;left:${rect.cx}px;top:${rect.cy}px;width:${rect.w}px;height:${rect.h}px;border:2px solid ${color};border-radius:9px;pointer-events:none;z-index:20;box-shadow:0 0 16px ${color};`;
    document.body.appendChild(d);
    clock.animate(430, (p) => {
        const e = 1 - Math.pow(1 - p, 2);
        d.style.transform = `translate(-50%,-50%) scale(${0.55 + e * 0.95})`;
        d.style.opacity = String(1 - p);
    }).then(() => d.remove());
}

function sparkBurstAt(cx, cy, color, n) {
    for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + Math.random() * 0.6;
        const sp = 20 + Math.random() * 32;
        const sz = 2 + Math.random() * 3;
        const d = document.createElement('div');
        d.setAttribute('data-fx', 'temporary');
        d.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:${sz}px;height:${sz}px;margin:${-sz / 2}px 0 0 ${-sz / 2}px;border-radius:50%;background:${color};box-shadow:0 0 7px ${color};pointer-events:none;z-index:35;`;
        document.body.appendChild(d);
        const dur = 280 + Math.random() * 200;
        clock.animate(dur, (p) => {
            const e = 1 - Math.pow(1 - p, 2.4);
            d.style.transform = `translate(${Math.cos(a) * sp * e}px,${Math.sin(a) * sp * e + 26 * p * p}px) scale(${1 - p * 0.7})`;
            d.style.opacity = String(1 - p * p);
        }).then(() => d.remove());
    }
}

function screenShake() {
    const bf = document.getElementById('battlefield');
    if (!bf) return;
    clock.animate(220, (p) => {
        const s = 2 * (1 - p);
        bf.style.transform = `translate(${(Math.random() - 0.5) * 2 * s}px,${(Math.random() - 0.5) * 2 * s}px)`;
    }).then(() => { bf.style.transform = ''; });
}

// ============================== 慢速档专用样式 ==============================
function injectSlowStyle() {
    if (document.getElementById('fx94-slow-style')) return;
    const st = document.createElement('style');
    st.id = 'fx94-slow-style';
    st.textContent = [
        '@keyframes fx94Lock{0%,100%{box-shadow:0 0 0 2px rgba(255,90,40,.95),0 0 14px rgba(255,90,40,.55)}',
        '50%{box-shadow:0 0 0 3px rgba(255,140,70,1),0 0 30px rgba(255,90,40,.95)}}',
        '@keyframes fx94Tw{0%,100%{box-shadow:0 0 0 2px rgba(255,209,102,.95),0 0 22px rgba(255,209,102,.8)}',
        '50%{box-shadow:0 0 0 3px rgba(255,255,255,1),0 0 34px rgba(255,215,0,1)}}',
        '.fx94-lock{animation:fx94Lock .8s ease-in-out infinite !important;}',
        '.fx94-tw{animation:fx94Tw .5s ease-in-out infinite !important;}'
    ].join('');
    document.head.appendChild(st);
}

// 卡边取点：把「卡中心 → 对方中心」的射线裁到本卡边框上
function edgeOf(r, tx, ty) {
    const cx = r.left + r.w / 2, cy = r.top + r.h / 2;
    const dx = tx - cx, dy = ty - cy;
    if (!dx && !dy) return { x: cx, y: cy };
    const kx = dx ? (r.w / 2) / Math.abs(dx) : Infinity;
    const ky = dy ? (r.h / 2) / Math.abs(dy) : Infinity;
    const k = Math.min(kx, ky);
    return { x: cx + dx * k, y: cy + dy * k };
}

// ============================== 标枪收尾（原 finishing punch 替身） ==============================
// 从唐文亮位置向目标飞一根 CSS 标枪（shaft 64×8 + head 22px 三角），
//   飞 400ms、扎中停留 200ms；随后白光+火花+冲击环+屏震；最后唐文亮回到原位。
// 位置只动 left/top（transform 只放枪身旋转），不碰唐文亮克隆体的 transform（保留 baseScale）。
async function performFinishingPunch(twEl, targetEl, T = (v) => v) {
    const twR = twEl.getBoundingClientRect();
    const tgR = targetEl.getBoundingClientRect();
    const dx = (tgR.left + tgR.width / 2) - (twR.left + twR.width / 2);
    const dy = (tgR.top + tgR.height / 2) - (twR.top + twR.height / 2);
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist, ny = dy / dist;
    const baseLeft = parseFloat(twEl.style.left) || twR.left;
    const baseTop = parseFloat(twEl.style.top) || twR.top;
    // 克隆体是 position:fixed（left/top = 视口坐标）；真格 .cell 是 position:relative
    //   （left/top = 相对偏移，基线必须从 0 起，否则把整格顶到 left=视口x 的位置回不来）
    const isRel = getComputedStyle(twEl).position !== 'fixed';
    const baseL = isRel ? (parseFloat(twEl.style.left) || 0) : baseLeft;
    const baseT = isRel ? (parseFloat(twEl.style.top) || 0) : baseTop;

    // 1. 蓄力后缩（120ms）
    await clock.animateReal(T(120), (p) => {
        const e = 1 - Math.pow(1 - p, 3);
        twEl.style.left = (baseL - nx * 8 * e).toFixed(1) + 'px';
        twEl.style.top = (baseT - ny * 8 * e).toFixed(1) + 'px';
    });

    // 2. 标枪飞行（400ms）
    const jv = document.createElement('div');
    jv.setAttribute('data-fx', 'temporary');
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    jv.style.cssText = `position:fixed;z-index:10080;pointer-events:none;transform:translate(-100%, -50%) rotate(${angle}deg);transform-origin: 100% 50%;display:flex;align-items:center;filter:drop-shadow(0 4px 6px rgba(0,0,0,0.5));`;
    const shaft = document.createElement('div');
    shaft.style.cssText = 'width:64px;height:8px;background:linear-gradient(180deg, #8b6f4b, #5c4033);border-radius:4px 0 0 4px;box-shadow:inset 0 2px 2px rgba(255,255,255,0.2);';
    const head = document.createElement('div');
    head.style.cssText = 'width:0;height:0;border-left:22px solid #e0e0e0;border-top:8px solid transparent;border-bottom:8px solid transparent;filter:drop-shadow(0 0 6px rgba(255,255,255,0.9));';
    jv.appendChild(shaft);
    jv.appendChild(head);
    document.body.appendChild(jv);

    const startX = baseLeft + twR.width / 2;
    const startY = baseTop + twR.height / 2;
    const endX = tgR.left + tgR.width / 2;
    const endY = tgR.top + tgR.height / 2;

    await clock.animateReal(T(400), (p) => {
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        jv.style.left = (startX + (endX - startX) * e).toFixed(1) + 'px';
        jv.style.top = (startY + (endY - startY) * e).toFixed(1) + 'px';
    });
    // 扎中后停留 200ms
    await clock.waitReal(T(200));
    jv.remove();

    // 3. 命中爆发（白光 + 火花 + 冲击环 + 屏震）
    const flash = document.createElement('div');
    flash.setAttribute('data-fx', 'temporary');
    flash.style.cssText = `position:fixed;left:${tgR.left}px;top:${tgR.top}px;width:${tgR.width}px;height:${tgR.height}px;border-radius:6px;background:radial-gradient(circle,#fff 0%,rgba(255,240,180,0.4) 60%,rgba(255,255,255,0) 100%);pointer-events:none;z-index:10080;`;
    document.body.appendChild(flash);
    clock.animateReal(T(230), (p) => {
        flash.style.opacity = (1 - p).toFixed(3);
        flash.style.transform = `scale(${(1 + p * 0.18).toFixed(2)})`;
    }).then(() => flash.remove());
    targetEl.classList.add('shake');
    setTimeout(() => targetEl.classList.remove('shake'), 420);
    const cx = tgR.left + tgR.width / 2, cy = tgR.top + tgR.height / 2;
    sparkBurstAt(cx, cy, '#fff2b0', 16);
    sparkBurstAt(cx, cy, '#ff9f43', 10);
    impactRing({ left: tgR.left, top: tgR.top, w: tgR.width, h: tgR.height, cx, cy }, 'rgba(255,255,255,0.95)');
    screenShake();

    // 4. 回到原位（left/top 回 base）
    await clock.animateReal(T(200), (p) => {
        const e = 1 - Math.pow(1 - p, 3);
        twEl.style.left = (baseL - nx * 8 * (1 - e)).toFixed(1) + 'px';
        twEl.style.top = (baseT - ny * 8 * (1 - e)).toFixed(1) + 'px';
    });
    twEl.style.left = baseL + 'px';
    twEl.style.top = baseT + 'px';
}

// ============================== 慢速档（子弹时间） ==============================
// 时长用真实时钟（每段 minRealMs），倍速 2x/4x 压不短；快进/自动入口直接返回 []。
//   与快版共用 makeGhost / freezeGhosts / performFinishingPunch；慢版自己造粗锁链与高 z 环/火花
//   （快版 createBeam 的 z 写死 10/11/12、impactRing/sparkBurstAt 的 z 写死 20/35，都会被遮罩盖住）。
//   返回 ghosts 交 render/39 storeAfter 淡出（交棒顺序与快版一致：先清 fly 显真格，再淡出克隆体）。
async function showTangWenLiangDashSlow(dash) {
    if (!dash || isFxSkipped()) return [];

    let moves = Array.isArray(dash.moves) ? dash.moves.filter(m => m && m.uid != null) : [];
    if (moves.length === 0 && dash.fromUid != null && dash.fromPos != null && dash.toPos != null) {
        moves = [{ uid: dash.fromUid, camp: dash.fromCamp, from: dash.fromPos, to: dash.toPos, isDash: true }];
        if (dash.targetUid != null && dash.targetFromPos != null && dash.targetToPos != null && dash.targetFromPos !== dash.targetToPos) {
            moves.push({ uid: dash.targetUid, camp: dash.targetCamp, from: dash.targetFromPos, to: dash.targetToPos, isDash: false });
        }
    }
    moves = moves.filter(m => m.from !== m.to && m.to != null);
    // 双方原地未动（唐文亮已在该列前排 / 目标本来就在前排 / 全部落位失败）不放弃演出：
    //   克隆体为空时下面回落到真格锚点，锁链→冲击→标枪照常演完；只有 payload 连 from/to 都缺才走空
    if (moves.length === 0 && dash.fromCamp == null) return [];

    let skipped = false;
    const created = [];
    const ghosts = [];
    let clearHl = () => {};
    let staticCell = null;
    // 总时长读参数表（dashDur），按当前 speed 档位；取不到回落 1700。
    //   内部编排 350+240+620+400+900+400 = 2910ms，按 dashTotal 等比缩放，各段 minRealMs 同值跟随。
    const dashTotal = getPerfParam('dashDur', GlobalStore.get('speed') || 300) || 1700;
    const s = dashTotal / 2910;
    const T = (v) => Math.max(60, Math.round(v * s));
    const track = (el) => { if (el) created.push(el); return el; };
    const cleanupUi = () => { for (const el of created) if (el && el.parentNode) el.remove(); };
    const cleanupAll = () => {
        clearHl();
        if (staticCell) staticCell.style.transform = '';
        cleanupUi();
        for (const gh of ghosts) if (gh && gh.g && gh.g.el && gh.g.el.parentNode) gh.g.el.remove();
    };

    // 血条快照：入口记 hpBefore，克隆体用它初始化（碰撞帧 reveal 后切到 store 当前值）
    snapshotHpBefore(dash);

    // ① 遮罩 + 跳过按钮（轻压暗：0.86 黑幕会把「原地不动的目标」埋掉，高亮看不见）
    const mask = track(document.createElement('div'));
    mask.setAttribute('data-fx', 'temporary');
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.34);z-index:9990;pointer-events:none;opacity:0;';
    document.body.appendChild(mask);

    const skipBtn = track(document.createElement('div'));
    skipBtn.setAttribute('data-fx', 'temporary');
    skipBtn.textContent = '跳过';
    skipBtn.style.cssText = 'position:fixed;bottom:12%;right:8%;z-index:10090;color:rgba(255,255,255,0.72);font-size:18px;font-weight:bold;cursor:pointer;line-height:1;letter-spacing:2px;transform:rotate(-30deg);pointer-events:auto;';
    skipBtn.onclick = () => { skipped = true; };
    document.body.appendChild(skipBtn);

    // ② 克隆体：只给「唐文亮 + 目标」主角权重（z 高于遮罩、原尺寸）；
    //   被挤队友压暗缩小、z 更低，只作背景
    const targetUid = dash.targetUid;
    for (const m of moves) {
        const isMain = !!m.isDash || (targetUid != null && m.uid === targetUid);
        const g = makeGhost(m.camp, m.from, m.to, isMain ? 10070 : 10040, m.uid);
        if (g) {
            if (!isMain) g.el.style.cssText += ';opacity:0.55;transform:scale(0.82);';
            ghosts.push({ ...m, g, toRect: rectOf(m.camp, m.to) });
        }
    }
    if (ghosts.length === 0) { cleanupAll(); return []; }

    // 把 activeGhosts 指过去；注意 guardTick 在主链路没有调用点（只有 Z demo 演示页调用自己的副本），
    //   生产里的血条揭晓由 revealGhostHp 完成，这里是给 demo 留的口子
    activeGhosts = ghosts;

    // 克隆体已画上 DOM，此时再隐藏真格（无缝替换，杜绝 store 阶段的提前隐身空窗期）
    {
        const _store = GlobalStore.get('battleStore');
        if (_store) {
            for (const m of moves) _store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: m.uid, _renderFlyMode: 'fly' });
        }
    }

    const twGH = ghosts.find(x => x.isDash) || null;
    const tgtGH = targetUid != null ? (ghosts.find(x => x.uid === targetUid) || null) : null;
    const minorGhosts = ghosts.filter(x => !x.isDash && x.uid !== targetUid);

    // 锚点 = 克隆体（动了）或真格（没动）
    const twActorEl = twGH ? twGH.g.el
        : (dash.fromCamp != null && dash.toPos != null ? getCellByPos(dash.fromCamp, dash.toPos) : null);
    const tgtActorEl = tgtGH ? tgtGH.g.el
        : (dash.targetCamp != null && dash.targetToPos != null ? getCellByPos(dash.targetCamp, dash.targetToPos) : null);
    staticCell = tgtGH ? null : tgtActorEl;
    const actorRect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    };

    // 主角高亮：唐文亮金边、目标橙红锁框脉冲（原地不动也亮）
    injectSlowStyle();
    const hlList = [];
    const addHl = (el, cls) => { if (!el) return; el.classList.add(cls); hlList.push([el, cls]); };
    addHl(twActorEl, 'fx94-tw');
    addHl(tgtActorEl, 'fx94-lock');
    clearHl = () => { for (const [el, cls] of hlList) { try { el.classList.remove(cls); } catch (e) {} } hlList.length = 0; };

    // 唐文亮残影（只有真冲出去才有）：3 层拖影把「冲」拉出来
    const afterImgs = [];
    if (twGH) {
        for (let i = 0; i < 3; i++) {
            const im = track(twGH.g.el.cloneNode(true));
            im.classList.remove('fx94-tw');
            im.style.cssText = twGH.g.el.style.cssText + `;z-index:${10066 - i};opacity:0;filter:blur(1.6px) saturate(1.5);`;
            document.body.appendChild(im);
            afterImgs.push(im);
        }
    }

    await clock.animate(T(350), (p) => { mask.style.opacity = String(0.34 * p); }, { minRealMs: T(350) });
    if (skipped) { cleanupAll(); activeGhosts = []; return []; }

    // ③ 粗锁链展开（唐文亮 → 目标），双层发光
    const chainGlow = track(document.createElement('div'));
    chainGlow.setAttribute('data-fx', 'temporary');
    chainGlow.style.cssText = 'position:fixed;height:12px;border-radius:8px;pointer-events:none;opacity:0;z-index:10072;background:linear-gradient(90deg,rgba(255,214,96,.25),rgba(255,160,60,.85));filter:blur(4px);transform-origin:0 50%;';
    document.body.appendChild(chainGlow);
    const chainCore = track(document.createElement('div'));
    chainCore.setAttribute('data-fx', 'temporary');
    chainCore.style.cssText = 'position:fixed;height:5px;border-radius:3px;pointer-events:none;opacity:0;z-index:10073;background:linear-gradient(90deg,#fff7d6,#ffd166 42%,#ff9f43);box-shadow:0 0 14px rgba(255,200,90,.95),0 0 30px rgba(255,150,60,.6);transform-origin:0 50%;';
    document.body.appendChild(chainCore);
    const chainHead = track(document.createElement('div'));
    chainHead.setAttribute('data-fx', 'temporary');
    chainHead.style.cssText = 'position:fixed;width:11px;height:11px;border-radius:50%;pointer-events:none;opacity:0;z-index:10074;background:radial-gradient(circle,#fff 0%,#ffe9a8 35%,rgba(255,170,60,0) 72%);';
    document.body.appendChild(chainHead);

    const chainSet = (p) => {
        const ra = actorRect(twActorEl), rb = actorRect(tgtActorEl);
        if (!ra || !rb) return;
        const pa = edgeOf(ra, rb.cx, rb.cy), pb = edgeOf(rb, ra.cx, ra.cy);
        const dx = pb.x - pa.x, dy = pb.y - pa.y, len = Math.hypot(dx, dy) || 1;
        const ang = Math.atan2(dy, dx) * 180 / Math.PI;
        const sc = Math.max(0.0001, p);
        [[chainGlow, 12], [chainCore, 5]].forEach(([el, h]) => {
            el.style.left = pa.x + 'px';
            el.style.top = (pa.y - h / 2) + 'px';
            el.style.width = len + 'px';
            el.style.transform = `rotate(${ang}deg) scaleX(${sc})`;
        });
        chainHead.style.left = (pb.x - 5.5) + 'px';
        chainHead.style.top = (pb.y - 5.5) + 'px';
    };

    if (twActorEl && tgtActorEl) {
        await clock.animate(T(240), (p) => {
            chainSet(p);
            chainGlow.style.opacity = String(0.9 * p);
            chainCore.style.opacity = String(p);
            chainHead.style.opacity = String(p);
        }, { minRealMs: T(240) });
    }
    if (skipped) { cleanupAll(); activeGhosts = []; return []; }

    // ④ 走位：left/top 写位置、transform 只放 scale（避免双算位移冲出格子）
    const twFrom = twGH ? twGH.g.from : null, twTo = twGH ? twGH.toRect : null;
    const tgtFrom = tgtGH ? tgtGH.g.from : null, tgtTo = tgtGH ? tgtGH.toRect : null;
    await clock.animate(T(620), (p) => {
        if (twFrom && twTo) {
            const dx = twTo.left - twFrom.left, dy = twTo.top - twFrom.top;
            const dist = Math.hypot(dx, dy) || 1;
            const ux = dx / dist, uy = dy / dist;
            const ovMax = Math.min(16, dist * 0.22);
            const easeOut = (q) => 1 - Math.pow(1 - q, 3);
            let e, ov;
            if (p < 0.68) { const q = p / 0.68; e = easeOut(q); ov = ovMax * easeOut(q); }
            else { const q = (p - 0.68) / 0.32; e = 1; ov = ovMax * (1 - easeOut(q)); }
            const x = dx * e + ux * ov, y = dy * e + uy * ov;
            twGH.g.el.style.left = (twFrom.left + x).toFixed(1) + 'px';
            twGH.g.el.style.top = (twFrom.top + y).toFixed(1) + 'px';
            afterImgs.forEach((im, i) => {
                const k = (i + 1) * 6 * Math.min(1, e * 3);
                im.style.left = (twFrom.left + x - ux * k).toFixed(1) + 'px';
                im.style.top = (twFrom.top + y - uy * k).toFixed(1) + 'px';
                im.style.opacity = String((0.26 / (i + 1)) * Math.min(1, e * 2.6));
            });
        }
        if (tgtFrom && tgtTo) {
            const q = Math.max(0, (p - 0.16) / 0.84);
            const e2 = 1 - Math.pow(1 - q, 3);
            tgtGH.g.el.style.left = (tgtFrom.left + (tgtTo.left - tgtFrom.left) * e2).toFixed(1) + 'px';
            tgtGH.g.el.style.top = (tgtFrom.top + (tgtTo.top - tgtFrom.top) * e2).toFixed(1) + 'px';
        }
        if (minorGhosts.length > 0) {
            const q = Math.min(1, p * 1.4);
            const e3 = 1 - Math.pow(1 - q, 3);
            for (const gh of minorGhosts) {
                const t = gh.toRect; if (!t) continue;
                const f = gh.g.from;
                gh.g.el.style.left = (f.left + (t.left - f.left) * e3).toFixed(1) + 'px';
                gh.g.el.style.top = (f.top + (t.top - f.top) * e3).toFixed(1) + 'px';
            }
        }
        // 原地不动的目标被顶一下（沿唐文亮→目标方向 ±6px，撞完回弹）——真格用 transform 是「相对偏移」，不用改
        if (staticCell) {
            const ra = actorRect(twActorEl), rb = actorRect(tgtActorEl);
            if (ra && rb) {
                const ddx = rb.cx - ra.cx, ddy = rb.cy - ra.cy, dd = Math.hypot(ddx, ddy) || 1;
                const k = Math.sin(Math.min(1, p * 1.8) * Math.PI) * 6;
                staticCell.style.transform = `translate(${(ddx / dd * k).toFixed(1)}px,${(ddy / dd * k).toFixed(1)}px)`;
            }
        }
        chainSet(1);
    }, { minRealMs: T(620) });
    if (staticCell) staticCell.style.transform = '';
    if (skipped) { cleanupAll(); activeGhosts = []; return []; }

    // 走位落定：把 left/top 固化到终点（后续标枪/收势不再动位置，不会弹回起点）
    freezeGhosts(ghosts);

    // ⑤ 碰撞：白闪 + 高 z 冲击环 + 火花 + 屏震 + 解密血条
    const ringAt = (rect, color, z) => {
        if (!rect) return;
        const d = track(document.createElement('div'));
        d.setAttribute('data-fx', 'temporary');
        d.style.cssText = `position:fixed;left:${rect.cx}px;top:${rect.cy}px;width:${rect.w}px;height:${rect.h}px;border:3px solid ${color};border-radius:12px;pointer-events:none;z-index:${z};box-shadow:0 0 24px ${color};`;
        document.body.appendChild(d);
        clock.animate(620, (p) => {
            const e = 1 - Math.pow(1 - p, 2);
            d.style.transform = `translate(-50%,-50%) scale(${0.5 + e * 1.1})`;
            d.style.opacity = String(1 - p);
        }).then(() => { if (d.parentNode) d.remove(); });
    };
    const sparksAt = (cx, cy, color, n, z) => {
        for (let i = 0; i < n; i++) {
            const a = (Math.PI * 2 * i) / n + Math.random() * 0.6;
            const sp = 26 + Math.random() * 40;
            const sz = 3 + Math.random() * 3;
            const d = track(document.createElement('div'));
            d.setAttribute('data-fx', 'temporary');
            d.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:${sz}px;height:${sz}px;margin:${-sz / 2}px 0 0 ${-sz / 2}px;border-radius:50%;background:${color};box-shadow:0 0 9px ${color};pointer-events:none;z-index:${z};`;
            document.body.appendChild(d);
            const dur = 380 + Math.random() * 240;
            clock.animate(dur, (p) => {
                const e = 1 - Math.pow(1 - p, 2.4);
                d.style.transform = `translate(${Math.cos(a) * sp * e}px,${Math.sin(a) * sp * e + 30 * p * p}px) scale(${1 - p * 0.7})`;
                d.style.opacity = String(1 - p * p);
            }).then(() => { if (d.parentNode) d.remove(); });
        }
    };

    const flash = track(document.createElement('div'));
    flash.setAttribute('data-fx', 'temporary');
    flash.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:10080;pointer-events:none;opacity:0;';
    document.body.appendChild(flash);
    // 解密命中目标血条：碰撞帧才切到 store 当前值（之前一直显示 hpBefore，防剧透）
    revealGhostHp((dash.hits || []).map(h => h && h.uid).filter(uid => uid != null));
    await clock.animate(T(400), (p) => {
        flash.style.opacity = p < 0.35 ? String(0.75 * (p / 0.35)) : String(Math.max(0, 0.75 * (1 - (p - 0.35) / 0.65)));
    }, { minRealMs: T(400) });
    if (twGH && twGH.toRect) { ringAt(twGH.toRect, 'rgba(255,209,102,0.95)', 10062); sparksAt(twGH.toRect.cx, twGH.toRect.cy, '#ffd166', 12, 10063); }
    const tgtRectNow = actorRect(tgtActorEl);
    if (tgtRectNow) { ringAt(tgtRectNow, 'rgba(255,120,80,0.95)', 10062); sparksAt(tgtRectNow.cx, tgtRectNow.cy, '#ff6b3d', 10, 10063); }
    screenShake();
    chainGlow.style.opacity = '0';
    chainCore.style.opacity = '0';
    chainHead.style.opacity = '0';
    clearHl();
    if (skipped) { cleanupAll(); activeGhosts = []; return []; }

    // ⑥ 真伤数字浮出（dash.hits 载荷里带 dmg）
    //   注意：不 store.dispatch(HP_CHANGE) —— 引擎 doDash 已经扣过血（syncStoreFromStep 会用引擎权威值覆盖回去，
    //   但演出瞬态会显示多扣一次的血条）。这里只解密血条 + 飘数字。
    const hits = Array.isArray(dash.hits) ? dash.hits : [];
    hits.forEach((h, i) => {
        if (!(h.dmg > 0) || h.uid == null) return;
        realWait(T(120 + i * 90)).then(() => {
            if (skipped) return;
            const gh = ghosts.find(g => g.uid === h.uid);
            const r = gh && gh.g && gh.g.el ? gh.g.el.getBoundingClientRect() : null;
            if (!r) return;
            const d = track(document.createElement('div'));
            d.setAttribute('data-fx', 'temporary');
            d.textContent = '−' + h.dmg;
            d.style.cssText = `position:fixed;left:${r.left + r.width / 2}px;top:${r.top + r.height * 0.18}px;transform:translate(-50%,0);font-size:32px;font-weight:900;color:#ffe9a8;text-shadow:0 0 12px rgba(255,200,80,0.95),0 3px 6px rgba(0,0,0,0.95);z-index:10085;pointer-events:none;opacity:0;`;
            document.body.appendChild(d);
            clock.animate(T(900), (p) => {
                const e2 = 1 - Math.pow(1 - p, 2.2);
                d.style.opacity = p < 0.12 ? String(p / 0.12) : String(1 - (p - 0.12) / 0.88);
                d.style.transform = `translate(-50%,${(-46 * e2).toFixed(1)}px) scale(${(1 + 0.2 * (1 - Math.abs(2 * p - 1))).toFixed(2)})`;
            }).then(() => { if (d.parentNode) d.remove(); });
        });
    });
    await realWait(T(900));
    if (skipped) { cleanupAll(); activeGhosts = []; return []; }

    // ⑦ 遮罩淡出（真格已在终位，克隆体留给 storeAfter 淡出）
    await clock.animate(T(400), (p) => { mask.style.opacity = String(0.34 * (1 - p)); }, { minRealMs: T(400) });
    chainGlow.style.opacity = '0';
    chainCore.style.opacity = '0';
    chainHead.style.opacity = '0';
    if (skipBtn.parentNode) skipBtn.remove();
    cleanupUi();

    // ⑦.5 标枪收尾（快慢版统一视觉）
    const twEl = twGH ? twGH.g.el : twActorEl;
    const tgtEl = tgtGH ? tgtGH.g.el : tgtActorEl;
    if (twEl && tgtEl) {
        await performFinishingPunch(twEl, tgtEl, T);
    }

    return ghosts;
}

// ============================== 快版（主路径） ==============================
export async function showTangWenLiangDash(dash, opts) {
    // 「唐文亮·冲刺子弹时间」（fxDashSlow）开着走慢速档；关掉 / 快进走原快版
    if (opts && opts.slowMotion) return showTangWenLiangDashSlow(dash);
    if (!dash || isFxSkipped()) return [];

    // moves 载荷（新）优先；旧档无 moves 按旧双单位字段拼两条（兼容老战报回放）
    let moves = Array.isArray(dash.moves) ? dash.moves.filter(m => m && m.uid != null) : [];
    if (moves.length === 0 && dash.fromUid != null && dash.fromPos != null && dash.toPos != null) {
        moves = [{ uid: dash.fromUid, camp: dash.fromCamp, from: dash.fromPos, to: dash.toPos, isDash: true }];
        if (dash.targetUid != null && dash.targetFromPos != null && dash.targetToPos != null && dash.targetFromPos !== dash.targetToPos) {
            moves.push({ uid: dash.targetUid, camp: dash.targetCamp, from: dash.targetFromPos, to: dash.targetToPos, isDash: false });
        }
    }
    moves = moves.filter(m => m.from !== m.to && m.to != null);   // 原地未动（被挡侧 from=to）不克隆
    // 无人位移也照常演：克隆体为空时下面全部回落到真格锚点（旧版这里直接 return，冲刺整段消失）
    if (moves.length === 0 && dash.fromCamp == null) return [];

    // 血条快照：入口记 hpBefore，克隆体用它初始化（落定帧 reveal 后切到 store 当前值）
    snapshotHpBefore(dash);

    // ① 克隆体（内容一律从 store 自绘、起点 rect 起跑；dash 本体 z=70，其余 50）
    const ghosts = [];
    for (const m of moves) {
        const g = makeGhost(m.camp, m.from, m.to, m.isDash ? 70 : 50, m.uid);
        if (g) ghosts.push({ ...m, g, toRect: rectOf(m.camp, m.to) });
    }
    // 没有克隆体（双方原地未动）不放弃：后面全部回落到真格锚点
    activeGhosts = ghosts;

    // 克隆体已画上 DOM，此时再隐藏真格（无缝替换，杜绝 store 阶段的提前隐身空窗期）
    {
        const _store = GlobalStore.get('battleStore');
        if (_store) {
            for (const m of moves) _store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: m.uid, _renderFlyMode: 'fly' });
        }
    }

    // ② 金线锁定：锚点按 uid 取克隆体，取不到（原地未动）就用真格。
    //   旧写法 ghosts.find(x => !x.isDash) 会把「被挤队友」当成目标——目标本来就在前排时没有克隆体，
    //   金线/冲击环/标枪全部打在队友身上，目标一次都没被演出（「只显示一部分」的断点就在这一行）。
    const twG = (dash.fromUid != null ? ghosts.find(x => x.uid === dash.fromUid) : ghosts.find(x => x.isDash)) || null;
    const tgG = dash.targetUid != null ? (ghosts.find(x => x.uid === dash.targetUid) || null) : (ghosts.find(x => !x.isDash) || null);
    const twAnchorEl = twG ? twG.g.el : (dash.fromCamp != null && dash.toPos != null ? getCellByPos(dash.fromCamp, dash.toPos) : null);
    const tgAnchorEl = tgG ? tgG.g.el : (dash.targetCamp != null && dash.targetToPos != null ? getCellByPos(dash.targetCamp, dash.targetToPos) : null);
    const beam = (twAnchorEl && tgAnchorEl) ? createBeam(document.body) : null;
    if (beam) {
        const a0 = twAnchorEl.getBoundingClientRect();
        const b0 = tgAnchorEl.getBoundingClientRect();
        await clock.animate(240, (p) => {
            setBeam(beam, a0.left + a0.width / 2, a0.top + a0.height / 2, b0.left + b0.width / 2, b0.top + b0.height / 2, p);
            beam.glow.style.opacity = String(0.85 * p);
            beam.core.style.opacity = String(p);
            beam.head.style.opacity = String(p);
        });
    }

    // ③ 位移动画 560ms easeOutCubic（left/top 写位置）；dash 本体直线 + 轻微超冲回弹（0.68 处最远、末端收回）
    await clock.animate(560, (p) => {
        const e = 1 - Math.pow(1 - p, 3);
        for (const gh of ghosts) {
            const t = gh.toRect; if (!t) continue;
            const f = gh.g.from;
            const dx = t.left - f.left, dy = t.top - f.top;
            let x = f.left + dx * e, y = f.top + dy * e;
            if (gh.isDash && (dx || dy)) {
                const d = Math.hypot(dx, dy) || 1;
                const ov = Math.min(14, d * 0.2);
                const off = p < 0.68 ? ov * (1 - Math.pow(1 - p / 0.68, 3)) : ov * (1 - (1 - Math.pow(1 - (p - 0.68) / 0.32, 3)));
                x += (dx / d) * off; y += (dy / d) * off;
            }
            gh.g.el.style.left = x.toFixed(1) + 'px';
            gh.g.el.style.top = y.toFixed(1) + 'px';
        }
        if (beam && twAnchorEl && tgAnchorEl) {
            const a1 = twAnchorEl.getBoundingClientRect();
            const b1 = tgAnchorEl.getBoundingClientRect();
            setBeam(beam, a1.left + a1.width / 2, a1.top + a1.height / 2, b1.left + b1.width / 2, b1.top + b1.height / 2, 1);
        }
    });

    // 走位落定：left/top 固化到终点（后续标枪/收势不再动位置，不会弹回起点）
    freezeGhosts(ghosts);
    // 解密命中目标血条：落定帧切到 store 当前值（之前一直显示 hpBefore，防剧透）
    revealGhostHp((dash.hits || []).map(h => h && h.uid).filter(uid => uid != null));

    // ④ 落定：冲击环 + 火花 + 屏震（dash 本体最隆重；目标落点次之）
    //   注意：不 store.dispatch(HP_CHANGE) —— 引擎 doDash 已扣过血，这里只飘数字。
    const land = twG ? twG.toRect : (twAnchorEl ? rectOfEl(twAnchorEl) : null);
    if (land) {
        impactRing(land, '#ffd166');
        sparkBurstAt(land.cx, land.cy, '#ffd166', 12);
        sparkBurstAt(land.cx, land.cy, '#ff9f43', 6);
        screenShake();
    }
    const tgtLand = tgG ? tgG.toRect : (tgAnchorEl ? rectOfEl(tgAnchorEl) : null);
    if (tgtLand) impactRing(tgtLand, '#ff6b6b');
    if (beam) removeBeam(beam);   // 不 await，光束淡出与落定特效并行

    // ⑤ 标枪收尾（快慢版统一视觉）：两个锚点（克隆体或真格）齐了必播，
    //   旧写法要求「唐文亮和目标都有克隆体」，目标原地不动时整段收尾直接没了
    if (twAnchorEl && tgAnchorEl) {
        await performFinishingPunch(twAnchorEl, tgAnchorEl);
    }

    return ghosts;
}

// 交棒淡出：由 39 的 storeAfter 在「清 fly 显真格之后」调用——顺序反了会旧格闪回一帧
export function fadeOutDashGhosts(ghosts) {
    if (!Array.isArray(ghosts) || ghosts.length === 0) return;
    clock.animate(160, (p) => {
        for (const gh of ghosts) if (gh && gh.g && gh.g.el) gh.g.el.style.opacity = String(1 - p);
    }).then(() => {
        for (const gh of ghosts) if (gh && gh.g && gh.g.el && gh.g.el.parentNode) gh.g.el.remove();
        activeGhosts = [];
    });
}