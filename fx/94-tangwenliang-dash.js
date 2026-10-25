// fx/94-tangwenliang-dash.js — 唐文亮「冲刺·七伤齐发」多人推挤演出
// V2.4.0 | 2026-10-25 冲刺慢版总时长接表现参数表（dashDur）：内部 2910ms 编排按 dashTotal 等比缩放，
//   各段 minRealMs 同值跟随（遮罩进/锁链/走位/白闪/真伤数字/遮罩出），慢版不再固定 2910ms。
// V2.3.0 | 2026-10-24 对齐 demo（老板指正「跟 demo 差蛮多、连线没有、对方不动就没高亮」）：
//   ① 锚点不再依赖 moves：目标在前排不动 / 唐文亮被挡原地时，直接用真格当高亮+连线端点；
//   ② 金线改「卡边→卡边」并抬到克隆体之上（旧版中心线压在卡片底下，实机等于看不见）；
//   ③ 唐文亮超冲回弹 + 3 层残影；目标原地不动时被「顶」一下；落点冲击环/火花两侧都放；
//   ④ 遮罩从 0.86 黑改 0.34 轻压暗，真格高亮才看得见（旧版黑幕把原地目标埋了）。
// V2.2.1 | 2026-10-24 收尾修正：撞击即断链 + 清主角高亮（不留「人已落位、线还连着」1.3 秒）；
//   唐文亮原地未动时 twG 取 null，不再退回 ghosts[0]（那会把锁链/金边锁到被挤队友身上）。
// V2.2.0 | 2026-10-24 视觉权重修正：主角=唐文亮+目标（按 targetUid 精确认，旧版取「第一个非 dash」会锁到被挤队友），
//   队友克隆体压暗缩小(z10040/0.82/0.55)且 380ms 先归位——「被挤走」只作背景，主视觉是主角连线对拉。
// V2.1.0 | 2026-10-24 子弹时间档真实时间保底：慢速档全部阶段走 minRealMs（真实时钟），
//   倍速 2x/4x 压不短这一段——冲刺演出必须完整可见；1x 下时长与原来一致。快进/自动照旧直接跳过。
// V2.0.0 | 2026-10-23 强推挤压版（老板拍板）：单目标双克隆 → moves 多人克隆 + 金线对拉 + 冲击环/火花/屏震。
//   纯装饰：位置由引擎 doDash 经 moveUnitPosition 落定（POS_CHANGE/STATE_CHANGE 事件走 core/13 既有链）。
//   step 回放起点 store 位置已是终值——单位渲染在「终点格」、DASH store 步用 fly 模式藏住等交棒，
//   所以克隆体内容取终点格 DOM、从起点格 rect 起跑（必须带 .cell 类，否则布局丢——fx/82 cloneCellEl 同口径）。
//   交接顺序（别搞反，否则旧格闪回一帧）：克隆体落定 → storeAfter 清 fly 显真格 → 克隆体才淡出。
//   快进：入口直接 return。
import { clock } from '../infra/52-clock.js';
import { getCellByPos } from './90fx-ref-manager.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { getPerfParam } from '../core/23perf-params.js';
import { getRoleIcon } from '../render/37-role-cards.js';

export const VER = 'fx/94-tangwenliang-dash.js V2.4.0';

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

// 单位数据 → 格子卡片 HTML（与 render/32 的格子同款结构；自绘用，解决 fly 空壳拿不到内容）
function cardHtmlFromUnit(u) {
    const pct = Math.max(0, Math.floor((u.hp / u.maxHp) * 100));
    const hpCls = pct > 50 ? 'hp-text-green' : (pct > 20 ? 'hp-text-orange' : 'hp-text-red');
    const bar = pct > 50 ? '#2e7d32' : (pct > 20 ? '#daa520' : '#c0392b');
    const icon = getRoleIcon(u, { isStunned: false, isDead: false, pangTaunting: false });
    return `<span class="cell-icon">${icon}</span>` +
        `<div class="cell-info"><span class="cell-name">${u.name}</span>` +
        `<span class="cell-stats">攻${Math.round(u.atk)} 防${Math.round(u.def)} <span class="${hpCls}">血${Math.floor(u.hp)}</span></span></div>` +
        `<div class="hp-bar-wrap"><div class="hp-bar-inner" style="height:${pct}%;background:${bar};"></div></div>`;
}

// 克隆体：摆到「起点格」rect 起跑。
//   内容来源两级：① 终点格 DOM 有内容就克隆（最省事、样式完全一致）；
//   ② 终点格是空壳 → 从 battleStore 按 uid 自绘卡片。
//   为什么需要 ②：DASH 的 store 步先把位置写进 store、再设 _renderFlyMode='fly'，而 render/32 的 fly 分支
//   会 resetCell 清空内容只留透明样式 —— 终点格必然是空壳，只靠 ① 会导致所有克隆体 null、
//   整个位移/锁链/慢速档全部跳过（老板实机「动画完全不对」的根因）。
function makeGhost(camp, fromPos, toPos, z, uid) {
    const r = rectOf(camp, fromPos);
    if (!r) return null;
    const src = getCellByPos(camp, toPos);
    let g = null;
    if (src && (src.querySelector('.cell-icon') || src.textContent.trim())) {
        g = src.cloneNode(true);
        g.classList.remove('ready', 'acted');
        g.removeAttribute('data-flash');
    }
    if (!g) {
        const store = GlobalStore.get('battleStore');
        const u = store ? store.getState().units.find(x => x.uid === uid) : null;
        if (!u) return null;
        g = document.createElement('div');
        g.className = 'cell';
        g.innerHTML = cardHtmlFromUnit(u);
    }
    g.setAttribute('data-fx', 'temporary');
    // 只覆盖定位/显隐，保留 .cell 类自带的外观样式（背景/边框/圆角）
    g.style.cssText += `;position:fixed;left:${r.left}px;top:${r.top}px;width:${r.w}px;height:${r.h}px;
        margin:0;z-index:${z};pointer-events:none;box-sizing:border-box;opacity:1;visibility:visible;transition:none;`;
    // fly 模式的隐藏可能落在任一层内联样式上，克隆体全部还原成可见
    g.querySelectorAll('*').forEach(el => {
        if (el.style && (el.style.opacity === '0' || el.style.visibility === 'hidden')) { el.style.opacity = ''; el.style.visibility = ''; }
    });
    document.body.appendChild(g);
    return { el: g, from: r };
}

// ---- 金线：glow(9px 模糊) + core(3px 实线) + head(11px 光点)，从两端向中间收拢（clock 版，别用 rAF） ----
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

// ---- 冲击环：从格子中心向外扩 + 淡出 ----
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

// ---- 火花：n 个粒子径向炸开，带重力下坠（26*p*p 那项） ----
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

// ---- 屏震：battlefield ±2px，220ms 衰减 ----
function screenShake() {
    const bf = document.getElementById('battlefield');
    if (!bf) return;
    clock.animate(220, (p) => {
        const s = 2 * (1 - p);
        bf.style.transform = `translate(${(Math.random() - 0.5) * 2 * s}px,${(Math.random() - 0.5) * 2 * s}px)`;
    }).then(() => { bf.style.transform = ''; });
}

// 慢速档专用样式（目标锁框脉冲 / 唐文亮金边）：只注入一次
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

// 卡边取点：把「卡中心 → 对方中心」的射线裁到本卡边框上（demo 的 edgeOf）
function edgeOf(r, tx, ty) {
    const cx = r.left + r.w / 2, cy = r.top + r.h / 2;
    const dx = tx - cx, dy = ty - cy;
    if (!dx && !dy) return { x: cx, y: cy };
    const kx = dx ? (r.w / 2) / Math.abs(dx) : Infinity;
    const ky = dy ? (r.h / 2) / Math.abs(dy) : Infinity;
    const k = Math.min(kx, ky);
    return { x: cx + dx * k, y: cy + dy * k };
}

// —— 子弹时间档（老板口径 2026-10-23）：遮罩内慢速完整演出 ——
//   时长用真实时钟（每段 minRealMs），倍速 2x/4x 压不短；快进/自动入口直接返回 []。
//   与快版共用 makeGhost/rectOf；慢版自己造粗锁链与高 z 环/火花（快版 createBeam 的 z 写死 10/11/12、
//   impactRing/sparkBurstAt 的 z 写死 20/35，都会被遮罩盖住）。
//   返回 ghosts 交 render/39 storeAfter 淡出（交棒顺序与快版一致：先清 fly 显真格，再淡出克隆体）。
//   跳过 / 快进 / 无位移 → 返回 [] 或原 ghosts，不影响 store 步已写好的位置。
async function showTangWenLiangDashSlow(dash) {
    if (!dash || GlobalStore.get('fastForwardActive')) return [];

    let moves = Array.isArray(dash.moves) ? dash.moves.filter(m => m && m.uid != null) : [];
    if (moves.length === 0 && dash.fromUid != null && dash.fromPos != null && dash.toPos != null) {
        moves = [{ uid: dash.fromUid, camp: dash.fromCamp, from: dash.fromPos, to: dash.toPos, isDash: true }];
        if (dash.targetUid != null && dash.targetFromPos != null && dash.targetToPos != null && dash.targetFromPos !== dash.targetToPos) {
            moves.push({ uid: dash.targetUid, camp: dash.targetCamp, from: dash.targetFromPos, to: dash.targetToPos, isDash: false });
        }
    }
    moves = moves.filter(m => m.from !== m.to && m.to != null);
    if (moves.length === 0) return [];

    let skipped = false;
    const created = [];
    const ghosts = [];
    let clearHl = () => {};
    let staticCell = null;
    // 2026-10-25 总时长读参数表（dashDur），按当前 speed 档位；取不到回落 1700。
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
    //   被挤队友压暗缩小、z 更低，只作背景（老板口径 2026-10-24：挤走是自然结果，别抢戏）
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

    const twGH = ghosts.find(x => x.isDash) || null;
    const tgtGH = targetUid != null ? (ghosts.find(x => x.uid === targetUid) || null) : null;
    // 队友 = 既不是唐文亮（没动时为空）也不是目标的其余克隆体
    const minorGhosts = ghosts.filter(x => !x.isDash && x.uid !== targetUid);

    // 锚点 = 克隆体（动了）或真格（没动）。目标在前排原地不动时也要高亮 + 连线（老板 2026-10-24 指正：
    //   旧版只认 moves，目标不动就没有 tgG → 既没金线也没高亮，看着像什么都没发生）
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
    if (skipped) { cleanupAll(); return []; }

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

    // 卡边 → 卡边，且 z(10072~10074) 高于克隆体(10070)：旧版中心线压在卡片底下，实机等于看不见
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
    if (skipped) { cleanupAll(); return []; }

    // ④ 走位（对齐 demo 节奏）：唐文亮 620ms 超冲回弹 + 残影；目标延迟 16% 跟上；
    //   目标原地不动 → 被「顶」一下；队友只快速让位，不抢戏
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
            twGH.g.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
            afterImgs.forEach((im, i) => {
                const k = (i + 1) * 6 * Math.min(1, e * 3);
                im.style.transform = `translate(${(x - ux * k).toFixed(1)}px,${(y - uy * k).toFixed(1)}px)`;
                im.style.opacity = String((0.26 / (i + 1)) * Math.min(1, e * 2.6));
            });
        }
        if (tgtFrom && tgtTo) {
            const q = Math.max(0, (p - 0.16) / 0.84);
            const e2 = 1 - Math.pow(1 - q, 3);
            tgtGH.g.el.style.transform = `translate(${((tgtTo.left - tgtFrom.left) * e2).toFixed(1)}px,${((tgtTo.top - tgtFrom.top) * e2).toFixed(1)}px)`;
        }
        if (minorGhosts.length > 0) {
            const q = Math.min(1, p * 1.4);
            const e3 = 1 - Math.pow(1 - q, 3);
            for (const gh of minorGhosts) {
                const t = gh.toRect; if (!t) continue;
                const f = gh.g.from;
                gh.g.el.style.transform = `translate(${((t.left - f.left) * e3).toFixed(1)}px,${((t.top - f.top) * e3).toFixed(1)}px) scale(0.82)`;
            }
        }
        // 原地不动的目标被顶一下（沿唐文亮→目标方向 ±6px，撞完回弹）
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
    if (skipped) { cleanupAll(); return []; }

    // ⑤ 碰撞：白闪 + 高 z 冲击环 + 火花 + 屏震
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
    await clock.animate(T(400), (p) => {
        flash.style.opacity = p < 0.35 ? String(0.75 * (p / 0.35)) : String(Math.max(0, 0.75 * (1 - (p - 0.35) / 0.65)));
    }, { minRealMs: T(400) });
    if (twGH && twGH.toRect) { ringAt(twGH.toRect, 'rgba(255,209,102,0.95)', 10062); sparksAt(twGH.toRect.cx, twGH.toRect.cy, '#ffd166', 12, 10063); }
    const tgtRectNow = actorRect(tgtActorEl);
    if (tgtRectNow) { ringAt(tgtRectNow, 'rgba(255,120,80,0.95)', 10062); sparksAt(tgtRectNow.cx, tgtRectNow.cy, '#ff6b3d', 10, 10063); }
    screenShake();
    // 撞击即断链 + 清高亮：此刻还在白闪里，断得看不出来；
    //   留到 ⑦ 才断，会出现「两人已经落位、金线还连着」持续 1.3 秒（实机「怪怪的」主因）。
    chainGlow.style.opacity = '0';
    chainCore.style.opacity = '0';
    chainHead.style.opacity = '0';
    clearHl();
    if (skipped) { cleanupAll(); return []; }

    // ⑥ 真伤数字浮出（dash.hits 载荷里带 dmg）
    const hits = Array.isArray(dash.hits) ? dash.hits : [];
    hits.forEach((h, i) => {
        if (!(h.dmg > 0) || h.uid == null) return;
        realWait(T(120 + i * 90)).then(() => {
            if (skipped) return;
            const el = document.querySelector(`[data-uid="${h.uid}"]`);
            const r = el ? el.getBoundingClientRect() : null;
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
    if (skipped) { cleanupAll(); return []; }

    // ⑦ 遮罩淡出（真格已在终位，克隆体留给 storeAfter 淡出）
    await clock.animate(T(400), (p) => { mask.style.opacity = String(0.34 * (1 - p)); }, { minRealMs: T(400) });
    chainGlow.style.opacity = '0';
    chainCore.style.opacity = '0';
    chainHead.style.opacity = '0';
    if (skipBtn.parentNode) skipBtn.remove();
    cleanupUi();

    return ghosts;
}

// 主演出：克隆多人 → 金线对拉 → 位移动画（dash 本体超冲回弹）→ 落定特效。
// 返回克隆体数组交给 39 的 storeAfter（交棒：清 fly 显格后才淡出）。
export async function showTangWenLiangDash(dash, opts) {
    // 「唐文亮·冲刺子弹时间」（fxDashSlow）开着走慢速档；关掉 / 快进走原快版
    if (opts && opts.slowMotion) return showTangWenLiangDashSlow(dash);
    if (!dash || GlobalStore.get('fastForwardActive')) return [];

    // moves 载荷（新）优先；旧档无 moves 按旧双单位字段拼两条（兼容老战报回放）
    let moves = Array.isArray(dash.moves) ? dash.moves.filter(m => m && m.uid != null) : [];
    if (moves.length === 0 && dash.fromUid != null && dash.fromPos != null && dash.toPos != null) {
        moves = [{ uid: dash.fromUid, camp: dash.fromCamp, from: dash.fromPos, to: dash.toPos, isDash: true }];
        if (dash.targetUid != null && dash.targetFromPos != null && dash.targetToPos != null && dash.targetFromPos !== dash.targetToPos) {
            moves.push({ uid: dash.targetUid, camp: dash.targetCamp, from: dash.targetFromPos, to: dash.targetToPos, isDash: false });
        }
    }
    moves = moves.filter(m => m.from !== m.to && m.to != null);   // 原地未动（被挡侧 from=to）不克隆
    if (moves.length === 0) return [];

    // ① 克隆体（内容取终点格、起点 rect 起跑；dash 本体 z=70，其余 50）
    const ghosts = [];
    for (const m of moves) {
        const g = makeGhost(m.camp, m.from, m.to, m.isDash ? 70 : 50, m.uid);
        if (g) ghosts.push({ ...m, g, toRect: rectOf(m.camp, m.to) });
    }
    if (ghosts.length === 0) return [];

    // ② 金线锁定：连「唐文亮克隆体当前位置」与「目标克隆体当前位置」，随动画实时跟随
    //   （demo 口径：线是锁在两人身上的，不是画在两个未来落点之间——老板实机指出的视觉偏差）
    const twG = ghosts.find(x => x.isDash) || ghosts[0];
    const tgG = ghosts.find(x => !x.isDash);
    const beam = (twG && tgG) ? createBeam(document.body) : null;
    if (beam) {
        const a0 = twG.g.el.getBoundingClientRect();
        const b0 = tgG.g.el.getBoundingClientRect();
        await clock.animate(240, (p) => {
            setBeam(beam, a0.left + a0.width/2, a0.top + a0.height/2, b0.left + b0.width/2, b0.top + b0.height/2, p);
            beam.glow.style.opacity = String(0.85 * p);
            beam.core.style.opacity = String(p);
            beam.head.style.opacity = String(p);
        });
    }

    // ③ 位移动画 560ms easeOutCubic；dash 本体直线 + 轻微超冲回弹（0.68 处最远、末端收回）
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
        if (beam && twG && tgG) {
            const a1 = twG.g.el.getBoundingClientRect();
            const b1 = tgG.g.el.getBoundingClientRect();
            setBeam(beam, a1.left + a1.width/2, a1.top + a1.height/2, b1.left + b1.width/2, b1.top + b1.height/2, 1);
        }
    });

    // ④ 落定：冲击环 + 火花 + 屏震（dash 本体最隆重；目标落点次之）
    const land = twG.toRect;
    if (land) {
        impactRing(land, '#ffd166');
        sparkBurstAt(land.cx, land.cy, '#ffd166', 12);
        sparkBurstAt(land.cx, land.cy, '#ff9f43', 6);
        screenShake();
    }
    if (tgG && tgG.toRect) impactRing(tgG.toRect, '#ff6b6b');
    if (beam) removeBeam(beam);   // 不 await，光束淡出与落定特效并行

    return ghosts;
}

// 交棒淡出：由 39 的 storeAfter 在「清 fly 显真格之后」调用——顺序反了会旧格闪回一帧
export function fadeOutDashGhosts(ghosts) {
    if (!Array.isArray(ghosts) || ghosts.length === 0) return;
    clock.animate(160, (p) => {
        for (const gh of ghosts) if (gh && gh.g && gh.g.el) gh.g.el.style.opacity = String(1 - p);
    }).then(() => {
        for (const gh of ghosts) if (gh && gh.g && gh.g.el && gh.g.el.parentNode) gh.g.el.remove();
    });
}
