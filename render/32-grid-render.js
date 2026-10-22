// render/32-grid-render.js — 战场九宫格渲染主循环（camp/team 装配 + buff 图标 + 展示层合成）
// V7.0.3 | 2026-10-22 | ~28500 bytes
// 计数胶囊占用 logo 名额：胶囊（1/7、2/3）原来白占宽度不进上限，
// 「唐文亮 + 1/7 + 2 个 logo」挤爆格子；现在胶囊算 1 个名额，最多再显示最新 1 个 logo
export const VER = 'render/32-grid-render.js V7.0.3';

import { getUnitCol, getUnitRow, getAuraBonuses, fmtHp } from '../infra/51-core-utils.js';
import { getDodgeRules } from '../core/20-registry-dodge.js';
import { CONFIG, getSkillDesc, isNamedCharacter } from '../core/01config-5v5-test.js';
import { GlobalStore, getPlayerContext } from '../infra/54-global-store.js';
import { FLASH_TYPES, CAMP_TYPES, ROLE_TYPES, BUFF_TYPES } from '../infra/56-battle-enums.js';
import { updateHanLiSaChargeFx } from '../fx/90-hanlisa-charge.js';
import { getStat } from '../core/13battle-shared.js';
import { computeBuffStats } from '../core/04buff-system.js';
import { clock } from '../infra/52-clock.js';
import { getView, setView } from '../infra/61-view-sheet.js';
import { getRoleIcon } from './37-role-cards.js';

import {
    ensureGridCells, resetCell, getSlotUnits, updateHpDisplay, getShakeRemain,
    tryHorseSpawnAnim, clearGridCells, applyGridShake
} from './32grid-cells.js';
import { buildCountBadge, getDodgeBreakdown, isUnitBenefitedByBuff } from './32grid-badges.js';
export { getDodgeBreakdown, isUnitBenefitedByBuff };
export { markGridShake } from './32grid-cells.js';

let _store = null;
let _subscribed = false;
let _ctx = null;

export function setGridRenderCtx(ctx) { _ctx = ctx; }
function getCtx() { return _ctx || getPlayerContext(); }
function selectOrStore(ctx, key) {
    const store = ctx && ctx.store;
    if (store) {
        const units = store.getState().units || [];
        if (key === 'allyTeam') return units.filter(u => u.camp === CAMP_TYPES.ALLY);
        if (key === 'enemyTeam') return units.filter(u => u.camp === CAMP_TYPES.ENEMY);
    }
    return (ctx && ctx.UI && ctx.UI[key]) || [];
}
function getStore() {
    if (!_store) _store = GlobalStore.get('battleStore');
    return _store;
}
export function setGridStore(store) { _store = store; _subscribed = false; clearGridCells(); }

export function renderGrid(id, camp) {
    let grid = document.getElementById(id);
    if (!grid) return;
    const cells = ensureGridCells(grid, id);
    const slotUnits = getSlotUnits(id);

    const store = getStore();
    const ctx = getCtx();
    let team = [];
    if (store) {
        const state = store.getState();
        team = state.units.filter(u => u.camp === camp);
    } else if (ctx && ctx.UI) {
        team = selectOrStore(ctx, camp === CAMP_TYPES.ALLY ? 'allyTeam' : 'enemyTeam');
    }

    // 摆位可调权限：单机只明教；本地双人 PVP 两队都可调；联网 PVP 各管一队（房主明教 / 从机六大派）
    // 从机视角必须「同源同帧」做两件事，否则会出现「角色在7号位却显示在前排」：
    //   ① 战场上下翻转（从机执六大派，自己队伍显示在下方）→ 给 #battlefield 加 guest-view
    //   ② 每队行序镜像（靠近两队中间的一行才是前置位 pos1-3）
    // 原先 ① 在 ui/68 的 updateButtons() 里切、② 在这里算，两处时机一旦错开，上下与前后排就会对不上；
    // 现在合并到本函数，每次渲染网格都保证两者一致。
    const netRole = GlobalStore.get('netRole');
    const mirrored = netRole === 'guest';
    const bf = document.getElementById('battlefield');
    if (bf) bf.classList.toggle('guest-view', mirrored);
    // 行序 = 显示顺序。视觉上「靠近两队中间的行」是前置位(pos1-3)：
    //   房主视角：明教在自己下方、前置行在顶部 → pos由小到大排；六大派在明教上方、前置行在底部 → pos由大到小排
    //   从机视角(自己执六大派在下方)：两阵营行序互换——明教(上方、前置行在底部)pos由大到小，六大派(下方、前置行在顶部)pos由小到大
    const allyOrder = mirrored ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
    const enemyOrder = mirrored ? [1,2,3,4,5,6,7,8,9] : [7,8,9,4,5,6,1,2,3];
    let displayOrder = camp === CAMP_TYPES.ALLY ? allyOrder : enemyOrder;
    let isAdjustMode = ctx ? ctx.adjustMode : false;
    let selectedPos = ctx ? ctx.selectedAdjustPos : null;
    let renderAdjust;
    if (netRole === 'host') renderAdjust = isAdjustMode && camp === CAMP_TYPES.ALLY;
    else if (netRole === 'guest') renderAdjust = isAdjustMode && camp === CAMP_TYPES.ENEMY;
    else renderAdjust = isAdjustMode && (camp === CAMP_TYPES.ALLY || !!GlobalStore.get('pvpMode'));
    let activeBuffs = ctx ? (ctx.activeBuffs || []) : [];
    let allyTeam = (store && store.getState) ? store.getState().units.filter(u => u.camp === CAMP_TYPES.ALLY) : selectOrStore(ctx, 'allyTeam');
    let doubleStrikeUid = ctx ? ctx.currentDoubleStrikeUid : null;
    // 胖远桥·正义国字脸生效期间：本回合有敌人被锁定 → 他头顶换 🐷 嘲讽脸（回合级标记，回合开始自清）
    const pangTauntUnits = (store && store.getState) ? store.getState().units : allyTeam.concat(selectOrStore(ctx, 'enemyTeam'));
    const pangTaunting = pangTauntUnits.some(u => u && u.alive && u.state && u.state._tauntedByPang);

    for (let i = 0; i < displayOrder.length; i++) {
        // 同格「尸体 + 新单位」（周芷若在原位召唤、击退换位）：先让尸体的死亡特效播完。
        //   UI 3 秒清尸（player/42 REMOVE_UNIT）之前一律优先渲尸体，清尸触发 store 重绘后自然露出新单位；
        //   否则新单位当帧就顶掉红底 ✕，看起来像死亡特效被吃掉。无存活单位同格时行为与原先一致。
        let pos = displayOrder[i];
        const corpseAtPos = team.find(c => c.pos === pos && (c.alive === false || (c.state && c.state._isDead)));
        let unit = corpseAtPos || team.find(c => c.pos === pos && c.alive) || team.find(c => c.pos === pos);
        if (unit && !unit.state) unit.state = {};
        if (unit && !unit.isHorse) {
            // _renderFlyMode 是飞撞/子弹时间的纯渲染态（攻击者本身不飞行），优先于 state._flyMode
            const effectiveFlyMode = getView(unit.uid, '_renderFlyMode') || (unit.state && unit.state._flyMode);
            if (effectiveFlyMode || (unit.state && (unit.state._fsmPhase === 'attached' || unit.state._fsmPhase === 'flying'))) {
                const div = cells[i];
                resetCell(div);
                div.className = 'cell occupied';
                div.dataset.pos = pos;
                div.dataset.uid = unit.uid;
                if (effectiveFlyMode === 'fly') {
                    div.style.background = 'transparent';
                    div.style.border = '2px solid transparent';
                    div.style.boxShadow = 'none';
                } else if (effectiveFlyMode === 'ghost') {
                    // 虚影分支不判眩晕/死亡（与原逻辑一致），只带嘲讽态
                    let roleIcon = getRoleIcon(unit, { isStunned: false, isDead: false, pangTaunting });
                    const ghostAtk = unit._frozen?.atk !== undefined ? Math.floor(unit._frozen.atk) : Math.floor(getStat(unit,'atk'));
                    const ghostDef = unit._frozen?.def !== undefined ? Math.floor(unit._frozen.def) : Math.floor(getStat(unit,'def'));
                    div.innerHTML = `<span class="cell-icon">${roleIcon}</span><div class="cell-info"><span class="cell-name">${unit.name}</span><span class="cell-stats">攻${ghostAtk} 防${ghostDef} 血${fmtHp(unit.hp)}</span></div>`;
                    div.style.opacity = '0.5';
                    div.style.background = 'rgba(30,100,255,0.28)';
                    div.style.border = '2px solid rgba(100,150,255,0.6)';
                    div.style.boxShadow = '0 0 12px rgba(100,150,255,0.5)';
                } else if (effectiveFlyMode === 'butterfly' || (unit.state && unit.state._fsmPhase === 'attached')) {
                    const crashMode = GlobalStore.get('crashMode') || 'ghost';
                    if (crashMode === 'fly') {
                        div.innerHTML = '<span class="cell-icon">🦋</span>';
                        div.style.background = 'transparent';
                        div.style.border = '2px solid transparent';
                    } else {
                        div.innerHTML = '<span class="cell-icon">🦋</span><div class="cell-info"><span class="cell-name">蝴蝶</span></div>';
                        div.style.opacity = '0.4';
                        div.style.background = 'rgba(255, 192, 203, 0.15)';
                        div.style.border = '2px solid rgba(255, 105, 180, 0.4)';
                    }
                } else if (effectiveFlyMode === 'spider' || (unit.state && unit.state._fsmPhase === 'flying')) {
                    const crashMode = GlobalStore.get('crashMode') || 'ghost';
                    if (crashMode === 'fly') {
                        div.innerHTML = '<span class="cell-icon">🕷️</span>';
                        div.style.background = 'transparent';
                        div.style.border = '2px solid transparent';
                    } else {
                        div.innerHTML = '<span class="cell-icon">🕷️</span><div class="cell-info"><span class="cell-name">蜘蛛</span></div>';
                        div.style.opacity = '0.4';
                        div.style.background = 'rgba(128, 0, 128, 0.1)';
                        div.style.border = '2px solid rgba(128, 0, 128, 0.4)';
                    }
                }
                slotUnits[i] = null;
                continue;
            }
            if (unit.state && unit.state._isDead) {
                unit = { ...unit, state: { ...(unit.state || {}), _resting: false, _acted: false, _blocked: false } };
            }
        }
        if (!unit) {
            const div = cells[i];
            resetCell(div);
            div.innerHTML = '<span style="color:#999;">空</span>';
            div.dataset.pos = pos;
            if (renderAdjust) div.classList.add('adjustable');
            if (renderAdjust && selectedPos === pos) div.classList.add('adjust-selected');
            slotUnits[i] = null;
            continue;
        }
        const _storeForFlash = getStore();
        const storeUnit = (_storeForFlash && _storeForFlash.getState) ? _storeForFlash.getState().units.find(u => u.uid === unit.uid) : null;
        const flashVal = getView(unit.uid, '_flash') ?? null;
        let hasFlash = !!flashVal;
        let isDead = (flashVal===FLASH_TYPES.DEAD || !unit.alive || unit.state._isDead);
        let isBlocked = (unit.state && unit.state._blocked) || false;
        let isResting = (unit.state && unit.state._resting) || false;
        let isStunned = (unit.state && unit.state._stunned) || false;

        // 改查名片表（原为本地 7 分支 if/else 链）
        //   表迁 render/37：import 由 ui/69 改 ./37-role-cards.js，切断 render→ui 反向依赖
        //   顺序/回落与原先完全一致：😵 > 无忌(非远程)⚔️ > 拒马🐴 > 小昭·姊🦋 > 幼狮🐱 > 胖远桥嘲讽🐷 > 职业图标
        let roleIcon = getRoleIcon(unit, { isStunned, isDead, pangTaunting });

        let displayName = unit.name;
        // 格子显示别名：全名太长挤爆格子的角色只影响格子显示，日志/弹窗仍用全名
        if (unit.isXieXun) displayName = '金毛狮王';
        // 灭绝师太 →「灭绝」：4 字名 + 出手计数徽章 + logo 挤爆格子宽度被 ellipsis 截断，
        //   缩短后 logo 能完整露出（上限仍是 2 个，本改动只是不再被截掉）。日志/弹窗/战报仍用全名
        if (unit.isMieJueShiTai) displayName = '灭绝';
        // 名字颜色分档（老板拍板 黑蓝紫金）：m≥112 金（boss 档）、m≥107 紫（精英）、m≥104 且具名 蓝（弱精英）、其余黑。
        //   张无忌/灭绝 m115 原描金特判天然并入金档；成昆幻影跟随被模仿者的 m（跟 displayName 同口径换算，不剧透本体档位）。
        let displayTierM = unit.m || 0;
        if (unit.isChengKun && unit.state && unit.state._phantomTarget) {
            const allUnits = selectOrStore(ctx, 'allyTeam').concat(selectOrStore(ctx, 'enemyTeam'));
            const mimicTarget = allUnits.find(u => u.uid === unit.state._phantomTarget);
            if (mimicTarget) {
                displayName = mimicTarget.name;
                displayTierM = mimicTarget.m || 0;
                roleIcon = mimicTarget.role===ROLE_TYPES.WARRIOR?'⚔️':(mimicTarget.role===ROLE_TYPES.DEFENDER?'🛡️':(mimicTarget.role===ROLE_TYPES.RANGED?'🏹':(mimicTarget.role===ROLE_TYPES.JAVELIN?'🪠':'🦅')));
            }
        }
        let latestUnit = unit;
        if (store) {
            const state = store.getState();
            const freshUnit = state.units.find(u => u.uid === unit.uid);
            if (freshUnit) latestUnit = freshUnit;
        }

        // 状态源唯一：攻/防都优先读引擎随 step 下发的本步真值（core/11 frozenValues →
        //   player/42 挂到 store 单位 _frozen），读不到才回落到 getStat 现算（老回放文件无 frozenValues 时）。
        //   原 def 走 _displayDef（从日志 snap 单点捞的补丁）已删——frozenValues 是它的正主。
        const displayAtk = latestUnit._frozen?.atk !== undefined ? Math.round(latestUnit._frozen.atk) : Math.round(getStat(latestUnit, 'atk'));
        const initAtk = latestUnit.state._initAtk !== undefined ? Math.round(latestUnit.state._initAtk) : displayAtk;
        const totalChange = displayAtk - initAtk;
        let atkDisplayHtml = `${displayAtk}`;
        if (totalChange > 0) atkDisplayHtml = `<span style="color:var(--c-gain);font-weight:bold;">${displayAtk}</span>`;
        else if (totalChange < 0) atkDisplayHtml = `<span style="color:var(--c-danger);font-weight:bold;">${displayAtk}</span>`;

        const displayDef = latestUnit._frozen?.def !== undefined ? Math.round(latestUnit._frozen.def) : Math.round(getStat(latestUnit, 'def'));
        const initDef = latestUnit.state._initDef !== undefined ? Math.round(latestUnit.state._initDef) : displayDef;
        const totalDefChange = displayDef - initDef;
        let defDisplayHtml = `${displayDef}`;
        if (totalDefChange > 0) defDisplayHtml = `<span style="color:var(--c-gain);font-weight:bold;">${displayDef}</span>`;
        else if (totalDefChange < 0) defDisplayHtml = `<span style="color:var(--c-danger);font-weight:bold;">${displayDef}</span>`;

        let hpPct = unit.alive ? Math.floor((unit.hp / unit.maxHp) * 100) : 0;
        let hpColorClass = hpPct>70?'hp-text-green':(hpPct>40?'hp-text-orange':'hp-text-red');
        let barColor = hpPct>70?'#4caf50':(hpPct>40?'#ff9800':'#f44336');
        // 护盾表现（寒离飒蓄力起通用）：血条上叠一层白色半透明，厚度=剩余护盾/最大生命
        // 临时（蓄力）+ 永久（九阳溢出）护盾合计显示
        const shieldVal = (unit.state._shield || 0) + (unit.state._permShield || 0);
        const shieldPct = unit.alive && shieldVal > 0 ? Math.min(100, Math.round((shieldVal / unit.maxHp) * 100)) : 0;
        const shieldHtml = shieldPct > 0 ? `<div style="position:absolute;left:0;right:0;bottom:0;height:${shieldPct}%;background:rgba(255,255,255,0.55);border-top:1px solid rgba(255,255,255,0.85);pointer-events:none;"></div>` : '';
        let hpDisplayHtml = `${fmtHp(unit.hp)}`;
        if ((latestUnit.state._initMaxHp !== undefined && latestUnit.state._initMaxHp > 0 && latestUnit.maxHp > latestUnit.state._initMaxHp)) {
            hpDisplayHtml = `<span style="color:var(--c-gain);font-weight:bold;">${fmtHp(unit.hp)}</span>`;
        }

        // HP 条动画状态更新（目标 pct / 首帧直落 / 需要时启动 tick），返回本帧展示 pct —— 与原先内联段等价
        const displayPct = updateHpDisplay(unit, hpPct);

        // 判灰认双路：引擎真值 state._acted（步末灌入）+ 视图表镜像 _renderActed（fx 起跳/收尾写，立即生效）
        const actedFlag = (unit.state && unit.state._acted) || getView(unit.uid, '_renderActed');
        let readyClass = (!hasFlash && !actedFlag && unit.alive && !isDead) ? 'ready' : '';
        let actedClass = (!hasFlash && actedFlag && unit.alive && !isDead) ? 'acted' : '';
        const shakeRemain = getShakeRemain(unit.uid);
        let cheerClass = (hasFlash && flashVal === FLASH_TYPES.CHEER && !isDead) ? 'cell-cheer' : '';
        let restingClass = (isBlocked && unit.alive && isResting && !(unit.isZhang && unit.rangedForm) && !isDead) ? 'resting' : '';
        const div = cells[i];
        resetCell(div);
        div.className = `cell occupied ${readyClass} ${actedClass} ${cheerClass} ${restingClass}`;
        // 消费抖动：只播动画、不续 deadline（等价原内联 runGridShake(div, shakeRemain)）；
        //   若改用 markGridShake 会每帧续 deadline → 抖动在连续 store 重绘下永不停
        if (shakeRemain > 0) applyGridShake(div, shakeRemain);
        if (isDead) { div.setAttribute('data-flash', FLASH_TYPES.DEAD); div.style.transition = 'none'; }
        else if (flashVal) { div.setAttribute('data-flash', flashVal); div.style.transition = 'none'; }
        div.dataset.pos = pos;
        div.dataset.uid = unit.uid;
        if (renderAdjust) {
            if (unit.fixed) div.classList.add('fixed-unit');
            else { div.classList.add('swappable'); if (selectedPos === pos) div.classList.add('adjust-selected'); }
        }
        if (getView(unit.uid, '_phantomFlash')) {
            div.style.animation = 'phantomFlash 0.4s ease-in-out 2';
            setTimeout(() => { div.style.animation = ''; setView(unit.uid, '_phantomFlash', null); }, 800);
        }
        tryHorseSpawnAnim(div, unit);
        let buffIcons = '';
        if (ctx) {
            // 各阵营只显示自己的海克斯图标（buff.target 定归属，历史无 target 的归明教）
            const campBuffs = activeBuffs.filter(b => camp === CAMP_TYPES.ALLY
                ? (b.target === CAMP_TYPES.ALLY || !b.target)
                : b.target === camp);
            if (campBuffs.length) {
                let iconMap = {};
                campBuffs.forEach(b => {
                    let info = CONFIG.BUFFS ? CONFIG.BUFFS[b.key] : null;
                    if (info && info.icon && isUnitBenefitedByBuff(unit, b.key, team, doubleStrikeUid, campBuffs)) {
                        iconMap[info.icon] = (iconMap[info.icon] || 0) + 1;
                    }
                });
                buffIcons = Object.entries(iconMap).map(([icon, count]) => icon + (count > 1 ? 'x' + count : '')).join(' ');
            }
        }
        // 小昭·妹永久海克斯 logo（老板需求）：有全局激活海克斯优先显示全局（上面 buffIcons 已填）；
        //   全局缺位时补她账本里「最新的」一个受益永久海克斯图标（_permanentBuffs 按获得顺序 push，队尾即最新）。
        //   carry/双击的永久效果直接挂妹自身（modules/27 给 bro addMod / 妹双击），不受 5 号位判定限制，恒显示。
        if (!buffIcons && unit.isXiaoZhaoBrother && Array.isArray(unit.state._permanentBuffs)) {
            const perms = unit.state._permanentBuffs;
            for (let bi = perms.length - 1; bi >= 0; bi--) {
                const pk = perms[bi].key;
                const info = CONFIG.BUFFS ? CONFIG.BUFFS[pk] : null;
                let ok;
                if (pk === BUFF_TYPES.CARRY || pk === BUFF_TYPES.DOUBLE_STRIKE) ok = true;
                else if (pk === BUFF_TYPES.HOLY_FLAME) {
                    // 永久圣火令改命中制（core/14），账本里的旧 cols/rows 不作数，读每回合重画的 _xiaoHolyFlame
                    const hfDraw = unit.state._xiaoHolyFlame;
                    ok = !!hfDraw && ((hfDraw.rows || []).includes(getUnitRow(unit.pos))
                        || (hfDraw.cols || []).includes(getUnitCol(unit.pos)));
                } else ok = isUnitBenefitedByBuff(unit, pk, team, unit.uid, perms);
                if (info && info.icon && ok) { buffIcons = info.icon; break; }
            }
        }
        let atkStyle = totalChange > 0 ? 'color:var(--c-gain);font-weight:bold;' : '';
        let defStyle = (totalDefChange > 0 || (latestUnit.state._fortifyStacks || 0) > 0) ? 'color:var(--c-gain);font-weight:bold;' : '';
        let hpStyle = '';
        // 小昭姊/妹的身份已由左侧 roleIcon（🦋/🕷️）承担，名字后不再重复挂
        // 张三丰：进入严阵以待阶段后挂图标——他的严阵以待是组件自身 addMod（不走团队 buff），
        // activeBuffs 里没有 fortify，格子上原本毫无提示
        let eliteSkillIcon = (unit.isZhouZhiruo && unit.state._kuaiLeStack && unit.state._kuaiLeStack.length > 0) ? ' 💖'
            : (unit.isSongQingshu && getView(unit.uid, '_hasXingFen')) ? ' 💗'
            : (unit.isZhangSanfeng && unit.alive && unit.state._tenRoundFired) ? ' 🛡️'
            // 寒离飒蓄力：格子挂沙漏标记（蓄力中/已起手两态同图标）
            : (unit.isHanLiSa && (unit.state._hlsCharging || 0) > 0) ? ' ⏳'
            : '';
        if (!eliteSkillIcon) {
            const sisterHost = allyTeam.find(a => a.isXiaoZhaoSister && a.alive && a.state._butterflyHost === unit.uid);
            if (sisterHost) eliteSkillIcon = ' 🦋';
        }
        if (unit.isChengKun && unit.state && unit.state._phantomTarget) eliteSkillIcon += ' 🎭';
        if (unit.state._xuanmingPoison && unit.state._xuanmingPoison.remaining > 0) eliteSkillIcon += ' ❄️';
        // 寒离飒·寒冰神掌寒毒：与玄冥毒同款 ❄️ 标记
        if (unit.state._hlsHanDu && unit.state._hlsHanDu.remaining > 0) eliteSkillIcon += ' ❄️';
        // 唐文亮·回春术层标记（老板需求）：🌿 或 🌿xN——不然看不出他攒着几层回血
        if (unit.isTangWenLiang && Array.isArray(unit.state._hcStacks) && unit.state._hcStacks.length > 0) {
            eliteSkillIcon += ' 🌿' + (unit.state._hcStacks.length > 1 ? 'x' + unit.state._hcStacks.length : '');
        }

        let logoList = [];
        if (eliteSkillIcon) eliteSkillIcon.trim().split(/\s+/).forEach(ic => { if (ic) logoList.push(ic); });
        if (buffIcons) buffIcons.split(/\s+/).forEach(ic => { if (ic) logoList.push(ic); });
        // 何太冲重做 V3：两个「状态标记」压到 logoList 末尾——V6.5.5 的「最多留最新 2 个」按尾部优先，
        //   放末尾才能保证这两个老板点名要看的标记不会被 buff 图标挤掉：
        //   ① 🎯 箭靶标记：带标单位（_heMarkRounds > 0，何太冲命中挂标/刷新，整场存活 3 回合）；
        //   ② ☯ 两仪连接：已结连且搭档仍在场的一方（_liangyiPartnerUid 指向存活同伴）。
        //   ③ 🔻 摄魂降攻：挂有 group:'soulDrain' 的 atk 词条（ttl:'round' 每回合重挂），随降攻生灭。
        if (unit.state._heMarkRounds > 0) logoList.push('🎯');
        if (unit.state._liangyiPartnerUid && selectOrStore(ctx, unit.camp === CAMP_TYPES.ALLY ? 'allyTeam' : 'enemyTeam').some(u => u.alive && u.uid === unit.state._liangyiPartnerUid)) logoList.push('☯');
        if ((unit._mods && unit._mods.atk ? unit._mods.atk : []).some(m => m.group === 'soulDrain')) logoList.push('🔻');
        // 杨逍改版：点穴眩晕走角色图标 😵（getRoleIcon），此处只挂 ❌ 禁疗（截脉中：治疗/吸血回复减半）
        if (unit.state._jinMai && unit.state._jinMai.rounds > 0) logoList.push('❌');

        // 名字颜色分档收口：nameGold 特判（张无忌/灭绝描金）由 m 档位规则天然覆盖
        //   蓝档加「具名」门槛（老板：蓝色只给弱精英，不该给所有 104）：无名杂兵（空闻/班淑娴等）落黑
        const nameTier = displayTierM >= 112 ? 'gold' : displayTierM >= 107 ? 'name-purple' : (displayTierM >= 104 && isNamedCharacter(displayName)) ? 'name-blue' : '';
        let compressName = false;
        let displayLogos = logoList.slice();
        if (displayName.length >= 5) compressName = true;
        // 计数胶囊（灭绝 2/3、唐文亮 1/7、张无忌 1/3）也算一个 logo 名额：
        //   原先它白占宽度不进上限，3 字名 + 胶囊 + 2 个 logo 会把格子撑爆。
        //   注意 slice(-0) 会返回整个数组，必须单独处理 budget<=0。
        const countBadgeHtml = buildCountBadge(unit);
        const logoBudget = 2 - (countBadgeHtml ? 1 : 0);
        if (logoBudget <= 0) displayLogos = [];
        else if (displayLogos.length > logoBudget) displayLogos = displayLogos.slice(-logoBudget);
        let nameHtml;
        if (compressName) {
            let logoHtml = displayLogos.slice().reverse().join(' ');
            nameHtml = `<span class="cell-name ${nameTier} cell-name-long">${displayName}${countBadgeHtml}${logoHtml ? '<span class="cell-logo">' + logoHtml + '</span>' : ''}</span>`;
        } else if (displayLogos.length < logoList.length) {
            nameHtml = `<span class="cell-name ${nameTier}">${displayName}${countBadgeHtml}${displayLogos.length ? ' ' + displayLogos.join(' ') : ''}</span>`;
        } else {
            // 修 ☯/🎯/🔻 隐形：短名分支原先只拼 eliteSkillIcon+buffIcons，logoList 里的状态标记不消费
            nameHtml = `<span class="cell-name ${nameTier}">${displayName}${countBadgeHtml}${displayLogos.length ? ' ' + displayLogos.join(' ') : ''}</span>`;
        }
        div.innerHTML = `<span class="cell-icon">${isBlocked && unit.alive && isResting && !(unit.isZhang && unit.rangedForm) && !isDead ? '😴' : roleIcon}</span><div class="cell-info">${nameHtml}<span class="cell-stats">攻<span style="${atkStyle}">${atkDisplayHtml}</span> 防<span style="${defStyle}">${defDisplayHtml}</span> <span class="${hpColorClass}" style="${hpStyle}">血${hpDisplayHtml}</span></span></div><div class="hp-bar-wrap"><div class="hp-bar-inner" id="hpbar-${unit.uid}" style="height:${displayPct}%;background:${barColor};"></div>${shieldHtml}</div>`;
        if (isDead) {
            let deadMark = document.createElement('span'); deadMark.className = 'dead-mark'; deadMark.textContent = '✕'; div.appendChild(deadMark);
            div.style.transform = 'scale(0.8)'; div.style.opacity = '0.9';
        }
        if (isBlocked && unit.alive && isResting && !(unit.isZhang && unit.rangedForm) && !isDead) {
            let zzz = document.createElement('div'); zzz.className = 'zzz-mark'; zzz.innerHTML = '<span>z</span><span>Z</span><span>Z</span>'; div.appendChild(zzz);
        }
        // 灭绝师太的出手计数不再走格子徽章（顶个红底数字太丑），
        //   改由 fx 层在她头顶飘出「壹/貳/參」气泡消散（信号 fx:mejueCount，见 fx/89）
        div.style.cursor = 'pointer';
        // click 已在 ensureGridCells 一次性绑定，这里只登记当前单位供回调取用
        slotUnits[i] = unit;
    }
}

export function updateGridUI() {
    renderGrid('enemyGrid', CAMP_TYPES.ENEMY);
    renderGrid('allyGrid', CAMP_TYPES.ALLY);
    // 寒离飒蓄力扇形：两网格都渲完后按全局单位取格子坐标画（不含在单网格内，避免画两次）
    const st = getStore();
    if (st && st.getState) updateHanLiSaChargeFx(st.getState().units);

    if (!_subscribed) {
        const store = getStore();
        if (store) {
            store.subscribe(() => {
                renderGrid('enemyGrid', CAMP_TYPES.ENEMY);
                renderGrid('allyGrid', CAMP_TYPES.ALLY);
            });
            _subscribed = true;
        }
    }
}