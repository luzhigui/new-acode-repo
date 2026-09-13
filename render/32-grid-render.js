// V6.0.0 | 2026-08-19 import 路径合并至 infra/51-core-utils
// V6.0.0 | 2026-09-07 属性词条化：攻防显示与详情改 getStat，不再读 unit.atk/def 做二次乘法
export const VER = 'render/32-grid-render.js V6.0.0';

import { getUnitCol, getUnitRow, getAuraBonuses, getDodgeRules } from '../infra/51-core-utils.js';
import { CONFIG, getSkillDesc } from '../core/01config-5v5-test.js';
import { GlobalStore, getPlayerContext } from '../infra/54-global-store.js';
import { FLASH_TYPES, CAMP_TYPES, ROLE_TYPES, BUFF_TYPES } from '../infra/56-battle-enums.js';
import { getStat } from '../core/13battle-shared.js';

let _store = null;
let _subscribed = false;
let _ctx = null;
const _hpTargetPct = new Map();
const _hpDisplayPct = new Map();
let _hpAnimRunning = false;
const _shakeUntil = new Map();
const _horseSpawnedUids = new Set();
// pos → { key, cell }：命中即原地更新，未命中才重建该格
const _gridCells = { allyGrid: new Map(), enemyGrid: new Map() };

function roleIconOf(role, isZhang, rangedForm, isHorse, isStunned, isDead) {
    if (isStunned && !isDead) return '😵';
    if (isZhang && !rangedForm) return '⚔️';
    if (isHorse) return '🐴';
    return role === ROLE_TYPES.WARRIOR ? '⚔️' : (role === ROLE_TYPES.DEFENDER ? '🛡️' : (role === ROLE_TYPES.RANGED ? '🏹' : '🦅'));
}

export function markGridShake(uid, durationMs) {
    if (uid == null) return;
    _shakeUntil.set(uid, Date.now() + durationMs);
    const cell = document.querySelector(`[data-uid="${uid}"]`);
    if (cell) runGridShake(cell, durationMs);
}

function runGridShake(el, durationMs) {
    const start = Date.now();
    const d = Math.min(200, durationMs);
    const origTransform = el.style.transform || '';
    const origBg = el.style.background || '';
    el.style.transition = 'background 0.1s ease';
    el.style.background = '#ffd700';
    let bgCleared = false;
    function tick() {
        const elapsed = Date.now() - start;
        if (elapsed >= durationMs) {
            el.style.transform = origTransform;
            el.style.transition = '';
            if (!bgCleared) { el.style.background = origBg; bgCleared = true; }
            return;
        }
        const progress = elapsed / durationMs;
        const decay = 1 - progress;
        const scale = 0.88 + 0.12 * progress;
        const offsetX = (Math.random() - 0.5) * 4 * decay;
        const offsetY = (Math.random() - 0.5) * 4 * decay;
        el.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        if (!bgCleared && elapsed > d) { el.style.background = origBg; bgCleared = true; }
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

export function setGridRenderCtx(ctx) { _ctx = ctx; }
function getCtx() { return _ctx || getPlayerContext(); }
// 2026-09-14 状态三轨收敛：战斗期一律读 battleStore，不再读 c.UI 的冗余拷贝
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
export function setGridStore(store) {
    _store = store; _subscribed = false; _horseSpawnedUids.clear();
    // 2026-09-14 局部刷新：换 store = 新一局，cell 缓存必须一起清，否则旧元素会被当成命中
    _gridCells.allyGrid.clear();
    _gridCells.enemyGrid.clear();
    _hpTargetPct.clear();
    _hpDisplayPct.clear();
}

function getDodgeBreakdown(unit, activeBuffs, allyTeam) {
    const sources = [];
    const rates = [];
    let seenFlightBase = false;

    const _dodgeRules = getDodgeRules();
    for (const ruleFn of _dodgeRules) {
        const rate = ruleFn(unit, null) || 0;
        if (rate > 0) {
            let label = '';
            if (unit.role === ROLE_TYPES.FLYER && rate === 0.15 && !seenFlightBase) {
                label = '飞行基础';
                seenFlightBase = true;
            } else if (unit.role === ROLE_TYPES.FLYER && rate === 0.15 && seenFlightBase) {
                label = '青翼蝠王';
            } else if (unit.role !== ROLE_TYPES.FLYER && rate === 0.03) {
                label = '地面基础';
            } else if (unit.isWei && rate !== 0.15) {
                label = '残血幻影';
            } else {
                label = '规则闪避';
            }
            sources.push({ label, value: Math.round(rate * 100) });
            rates.push(rate);
        }
    }

    if (unit.buffDodgeBonus > 0) {
        sources.push({ label: '流云身法', value: Math.round(unit.buffDodgeBonus * 100) });
        rates.push(unit.buffDodgeBonus);
    }

    let combined = 0;
    if (rates.length > 0) {
        let product = 1;
        for (const r of rates) product *= (1 - r);
        combined = Math.round((1 - product) * 100);
    }

    return { sources, combined };
}

function isUnitBenefitedByBuff(unit, buffKey, allyTeam, doubleStrikeUid, activeBuffs) {
    switch (buffKey) {
        case BUFF_TYPES.CARRY: return unit.pos === 5 && unit.alive;
        case BUFF_TYPES.METEOR_SHOWER: return unit.role === ROLE_TYPES.RANGED;
        case BUFF_TYPES.BLOODTHIRST: return unit.role === ROLE_TYPES.WARRIOR;
        case BUFF_TYPES.FORTIFY: return unit.role === ROLE_TYPES.DEFENDER && unit.camp === CAMP_TYPES.ALLY;
        case BUFF_TYPES.WIND_ASSAULT: return unit.role === ROLE_TYPES.FLYER;
        case BUFF_TYPES.CLOUD_BODY: return true;
        case BUFF_TYPES.HOLY_FLAME: {
            if (!activeBuffs) return false;
            const holyBuffs = activeBuffs.filter(b => b.key === BUFF_TYPES.HOLY_FLAME);
            return holyBuffs.some(b => {
                const cols = b.cols || (b.col != null ? [b.col] : []);
                const rows = b.rows || (b.row != null ? [b.row] : []);
                return cols.includes(getUnitCol(unit.pos)) || rows.includes(getUnitRow(unit.pos));
            });
        }
        case BUFF_TYPES.HOT_BLOOD: return true;
        case BUFF_TYPES.DOUBLE_STRIKE: return unit.uid === doubleStrikeUid && doubleStrikeUid != null;
        case BUFF_TYPES.HORSE_FORMATION: return false;
        case BUFF_TYPES.MIND_CONTROL: {
            if (!allyTeam) return false;
            let frontUnit = allyTeam.filter(u => u.alive && !u.isHorse).sort((a, b) => a.pos - b.pos)[0];
            return frontUnit && unit.uid === frontUnit.uid;
        }
        default: return false;
    }
}

function createHorseSpawnAnim(cell) {
    cell.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    cell.style.transform = 'scale(1.3)';
    cell.style.boxShadow = '0 0 20px rgba(255,215,0,0.8)';
    setTimeout(() => { cell.style.transform = 'scale(1)'; cell.style.boxShadow = ''; }, 400);
}

function tickHpAnim() {
    _hpAnimRunning = false;
    let any = false;
    for (const [uid, target] of _hpTargetPct) {
        const cur = _hpDisplayPct.get(uid);
        if (cur === undefined) continue;
        const diff = target - cur;
        if (Math.abs(diff) < 0.1) {
            _hpDisplayPct.set(uid, target);
            continue;
        }
        const step = Math.abs(diff) < 2 ? diff : diff * 0.15;
        const next = cur + step;
        _hpDisplayPct.set(uid, next);
        const bar = document.getElementById('hpbar-' + uid);
        if (bar) bar.style.height = next + '%';
        any = true;
    }
    if (any) {
        _hpAnimRunning = true;
        requestAnimationFrame(tickHpAnim);
    }
}

// ---- 局部刷新基础设施（2026-09-14）----
// 原实现每帧 grid.innerHTML = '' 全量重建 18 个格子，导致：血条动画元素被销毁、fx 层
// 抓到的 cell 引用变游离节点、DOM 抖动。现按 pos 缓存 cell：结构键不变就只更新文本/class，
// 变了才重建该格并换掉。顺序仍由 displayOrder 保证，position 与缓存对得上。
function cellKeyOf(unit, pos, flyMode) {
    if (!unit) return 'empty:' + pos;
    return [unit.uid, pos, unit.alive ? 1 : 0, unit.state && unit.state._isDead ? 1 : 0, flyMode || '', unit.isHorse ? 1 : 0].join('|');
}

function buildFlyCell(unit, pos, camp) {
    const flyMode = (unit.state && unit.state._flyMode) || unit._renderFlyMode || null;
    const fsm = unit._fsm;
    let div = document.createElement('div');
    div.className = 'cell occupied';
    div.dataset.pos = pos;
    div.dataset.uid = unit.uid;
    if (flyMode === 'fly') {
        div.style.background = 'transparent';
        div.style.border = '2px solid transparent';
        div.style.boxShadow = 'none';
    } else if (flyMode === 'ghost') {
        const roleIcon = roleIconOf(unit.role, false, true, false, false, false);
        div.innerHTML = `<span class="cell-icon">${roleIcon}</span><div class="cell-info"><span class="cell-name">${unit.name}</span><span class="cell-stats">攻${Math.floor(getStat(unit,'atk'))} 防${Math.floor(getStat(unit,'def'))} 血${Math.floor(unit.hp)}</span></div>`;
        div.style.opacity = '0.5';
        div.style.background = 'rgba(30,100,255,0.28)';
        div.style.border = '2px solid rgba(100,150,255,0.6)';
        div.style.boxShadow = '0 0 12px rgba(100,150,255,0.5)';
    } else if (flyMode === 'butterfly' || (fsm && fsm.is('attached'))) {
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
    } else if (flyMode === 'spider' || (fsm && fsm.is('flying'))) {
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
    } else {
        // 理论上不会走到（无 flyMode 时不进本分支），保险给个透明格
        div.innerHTML = '<span class="cell-icon">💨</span>';
        div.style.background = 'transparent';
    }
    return div;
}

function buildEmptyCell(pos, camp, isAdjustMode, selectedPos) {
    let div = document.createElement('div');
    div.className = 'cell';
    div.innerHTML = '<span style="color:#999;">空</span>';
    div.dataset.pos = pos;
    if (camp === CAMP_TYPES.ALLY && isAdjustMode) div.classList.add('adjustable');
    if (camp === CAMP_TYPES.ALLY && isAdjustMode && selectedPos === pos) div.classList.add('adjust-selected');
    return div;
}

function buildOccupiedCell(unit, pos, camp, env) {
    const { ctx, store, isAdjustMode, selectedPos, activeBuffs, allyTeam, doubleStrikeUid } = env;
    const _storeForFlash = getStore();
    const storeUnit = (_storeForFlash && _storeForFlash.getState) ? _storeForFlash.getState().units.find(u => u.uid === unit.uid) : null;
    const flashVal = (storeUnit && storeUnit._flash) || unit._flash || null;
    let hasFlash = !!flashVal;
    let isDead = (flashVal === FLASH_TYPES.DEAD || !unit.alive || unit.state._isDead);
    let isBlocked = (unit.state && unit.state._blocked) || false;
    let isResting = (unit.state && unit.state._resting) || false;
    let isStunned = (unit.state && unit.state._stunned) || false;

    let roleIcon = roleIconOf(unit.role, unit.isZhang, unit.rangedForm, unit.isHorse, isStunned, isDead);

    let displayName = unit.name;
    let displayIsZhang = unit.isZhang || false;
    if (unit.isChengKun && unit.state && unit.state._phantomTarget) {
        const allUnits = selectOrStore(ctx, 'allyTeam').concat(selectOrStore(ctx, 'enemyTeam'));
        const mimicTarget = allUnits.find(u => u.uid === unit.state._phantomTarget);
        if (mimicTarget) {
            displayName = mimicTarget.name;
            displayIsZhang = mimicTarget.isZhang || false;
            roleIcon = roleIconOf(mimicTarget.role, false, true, false, false, false);
        }
    }
    let latestUnit = unit;
    if (store) {
        const freshUnit = store.getState().units.find(u => u.uid === unit.uid);
        if (freshUnit) latestUnit = freshUnit;
    }

    const displayAtk = Math.round(getStat(latestUnit, 'atk'));
    const initAtk = latestUnit.state._initAtk !== undefined ? Math.round(latestUnit.state._initAtk) : displayAtk;
    const totalChange = displayAtk - initAtk;
    let atkDisplayHtml = `${displayAtk}`;
    if (totalChange > 0) atkDisplayHtml = `<span style="color:#daa520;font-weight:bold;">${displayAtk}</span>`;
    else if (totalChange < 0) atkDisplayHtml = `<span style="color:#c0392b;font-weight:bold;">${displayAtk}</span>`;

    const displayDef = Math.round(getStat(latestUnit, 'def'));
    const initDef = latestUnit.state._initDef !== undefined ? Math.round(latestUnit.state._initDef) : displayDef;
    const totalDefChange = displayDef - initDef;
    let defDisplayHtml = `${displayDef}`;
    if (totalDefChange > 0) defDisplayHtml = `<span style="color:#daa520;font-weight:bold;">${displayDef}</span>`;
    else if (totalDefChange < 0) defDisplayHtml = `<span style="color:#c0392b;font-weight:bold;">${displayDef}</span>`;

    let hpPct = unit.alive ? Math.floor((unit.hp / unit.maxHp) * 100) : 0;
    let hpColorClass = hpPct > 70 ? 'hp-text-green' : (hpPct > 40 ? 'hp-text-orange' : 'hp-text-red');
    let barColor = hpPct > 70 ? '#4caf50' : (hpPct > 40 ? '#ff9800' : '#f44336');
    let hpDisplayHtml = `${Math.floor(unit.hp)}`;
    if ((latestUnit.state._initMaxHp !== undefined && latestUnit.state._initMaxHp > 0 && latestUnit.maxHp > latestUnit.state._initMaxHp)) {
        hpDisplayHtml = `<span style="color:#daa520;font-weight:bold;">${Math.floor(unit.hp)}</span>`;
    }

    // _hpTargetPct / _hpDisplayPct 的刷新已上移到 renderGrid 主循环（命中缓存也要跑），此处只读
    const displayPct = _hpDisplayPct.get(unit.uid) ?? hpPct;

    let readyClass = (!hasFlash && !(unit.state && unit.state._acted) && unit.alive && !isDead) ? 'ready' : '';
    let actedClass = (!hasFlash && (unit.state && unit.state._acted) && unit.alive && !isDead) ? 'acted' : '';
    let shakeRemain = 0;
    const shakeDeadline = _shakeUntil.get(unit.uid);
    if (shakeDeadline) {
        if (shakeDeadline > Date.now()) shakeRemain = shakeDeadline - Date.now();
        else _shakeUntil.delete(unit.uid);
    }
    let cheerClass = (hasFlash && unit._flash === FLASH_TYPES.CHEER && !isDead) ? 'cell-cheer' : '';
    let restingClass = (isBlocked && unit.alive && isResting && !(unit.isZhang && unit.rangedForm) && !isDead) ? 'resting' : '';
    let div = document.createElement('div');
    div.className = `cell occupied ${readyClass} ${actedClass} ${cheerClass} ${restingClass}`;
    if (shakeRemain > 0) runGridShake(div, shakeRemain);
    if (isDead) { div.setAttribute('data-flash', FLASH_TYPES.DEAD); div.style.transition = 'none'; }
    else if (unit._flash) { div.setAttribute('data-flash', unit._flash); div.style.transition = 'none'; }
    div.dataset.pos = pos;
    div.dataset.uid = unit.uid;
    if (camp === CAMP_TYPES.ALLY && isAdjustMode) {
        if (unit.fixed) div.classList.add('fixed-unit');
        else { div.classList.add('swappable'); if (selectedPos === pos) div.classList.add('adjust-selected'); }
    }
    if (unit._phantomFlash) {
        div.style.animation = 'phantomFlash 0.4s ease-in-out 2';
        setTimeout(() => { div.style.animation = ''; delete unit._phantomFlash; }, 800);
    }
    if (unit.isHorse && unit.alive && !(unit.state && unit.state._isDead) && !_horseSpawnedUids.has(unit.uid)) {
        _horseSpawnedUids.add(unit.uid);
        requestAnimationFrame(() => createHorseSpawnAnim(div));
    }
    let buffIcons = '';
    if (ctx && camp === CAMP_TYPES.ALLY) {
        let iconMap = {};
        activeBuffs.forEach(b => {
            let info = CONFIG.BUFFS ? CONFIG.BUFFS[b.key] : null;
            if (info && info.icon && isUnitBenefitedByBuff(unit, b.key, allyTeam, doubleStrikeUid, activeBuffs)) {
                iconMap[info.icon] = (iconMap[info.icon] || 0) + 1;
            }
        });
        buffIcons = Object.entries(iconMap).map(([icon, count]) => icon + (count > 1 ? 'x' + count : '')).join(' ');
    }
    let atkStyle = totalChange > 0 ? 'color:#daa520;font-weight:bold;' : '';
    let defStyle = (totalDefChange > 0 || (latestUnit.state._fortifyStacks || 0) > 0) ? 'color:#daa520;font-weight:bold;' : '';
    let hpStyle = '';
    let eliteSkillIcon = (unit.isZhouZhiruo && unit._hasKuaiLe) ? ' 💖' : (unit.isSongQingshu && unit._hasXingFen) ? ' 💗' : (unit.isXiaoZhaoSister ? ' 🦋' : (unit.isXiaoZhaoBrother ? ' 🕷️' : ''));
    if (!eliteSkillIcon) {
        const sisterHost = allyTeam.find(a => a.isXiaoZhaoSister && a.alive && a.state._butterflyHost === unit.uid);
        if (sisterHost) eliteSkillIcon = ' 🦋';
    }
    if (unit.isChengKun && unit.state && unit.state._phantomTarget) eliteSkillIcon += ' 🎭';
    if (unit.state._xuanmingPoison && unit.state._xuanmingPoison.remaining > 0) eliteSkillIcon += ' ❄️';

    let logoList = [];
    if (eliteSkillIcon) eliteSkillIcon.trim().split(/\s+/).forEach(ic => { if (ic) logoList.push(ic); });
    if (buffIcons) buffIcons.split(/\s+/).forEach(ic => { if (ic) logoList.push(ic); });

    let compressName = false;
    let displayLogos = logoList.slice();
    if (displayName.length >= 5) {
        compressName = true;
        if (displayLogos.length > 2) displayLogos = displayLogos.slice(-2);
    } else if (displayName.length === 4 && displayLogos.length > 2) {
        displayLogos = displayLogos.slice(-2);
    }

    let nameHtml;
    if (compressName) {
        let logoHtml = displayLogos.slice().reverse().join(' ');
        nameHtml = `<span class="cell-name ${displayIsZhang?'gold':''} cell-name-long">${displayName}${logoHtml ? '<span class="cell-logo">' + logoHtml + '</span>' : ''}</span>`;
    } else if (displayLogos.length < logoList.length) {
        nameHtml = `<span class="cell-name ${displayIsZhang?'gold':''}">${displayName}${displayLogos.length ? ' ' + displayLogos.join(' ') : ''}</span>`;
    } else {
        nameHtml = `<span class="cell-name ${displayIsZhang?'gold':''}">${displayName}${eliteSkillIcon}${buffIcons ? ' ' + buffIcons : ''}</span>`;
    }
    div.innerHTML = `<span class="cell-icon">${isBlocked && unit.alive && isResting && !(unit.isZhang && unit.rangedForm) && !isDead ? '😴' : roleIcon}</span><div class="cell-info">${nameHtml}<span class="cell-stats">攻<span style="${atkStyle}">${atkDisplayHtml}</span> 防<span style="${defStyle}">${defDisplayHtml}</span> <span class="${hpColorClass}" style="${hpStyle}">血${hpDisplayHtml}</span></span></div><div class="hp-bar-wrap"><div class="hp-bar-inner" id="hpbar-${unit.uid}" style="height:${displayPct}%;background:${barColor};"></div></div>`;
    if (isDead) {
        let deadMark = document.createElement('span'); deadMark.className = 'dead-mark'; deadMark.textContent = '✕'; div.appendChild(deadMark);
        div.style.transform = 'scale(0.8)'; div.style.opacity = '0.9';
    }
    if (isBlocked && unit.alive && isResting && !(unit.isZhang && unit.rangedForm) && !isDead) {
        let zzz = document.createElement('div'); zzz.className = 'zzz-mark'; zzz.innerHTML = '<span>z</span><span>Z</span><span>Z</span>'; div.appendChild(zzz);
    }
    div.style.cursor = 'pointer';
    div.addEventListener('click', (e) => {
        if (isAdjustMode) return;
        const openDetail = GlobalStore.getUIHandler('openDetailPopup');
        if (typeof openDetail === 'function') openDetail(unit);
    });
    return div;
}

export function renderGrid(id, camp) {
    let grid = document.getElementById(id);
    if (!grid) return;

    const store = getStore();
    const ctx = getCtx();
    let team = [];
    if (store) {
        const state = store.getState();
        team = state.units.filter(u => u.camp === camp);
    } else if (ctx && ctx.UI) {
        team = selectOrStore(ctx, camp === CAMP_TYPES.ALLY ? 'allyTeam' : 'enemyTeam');
    }

    let displayOrder = camp === CAMP_TYPES.ENEMY ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
    let isAdjustMode = ctx ? ctx.adjustMode : false;
    let selectedPos = ctx ? ctx.selectedAdjustPos : null;
    let activeBuffs = ctx ? (ctx.activeBuffs || []) : [];
    let allyTeam = (store && store.getState) ? store.getState().units.filter(u => u.camp === CAMP_TYPES.ALLY) : selectOrStore(ctx, 'allyTeam');
    let doubleStrikeUid = ctx ? ctx.currentDoubleStrikeUid : null;
    const env = { ctx, store, isAdjustMode, selectedPos, activeBuffs, allyTeam, doubleStrikeUid };

    const cache = _gridCells[id] || (_gridCells[id] = new Map());

    for (let i = 0; i < displayOrder.length; i++) {
        let pos = displayOrder[i], unit = team.find(c => c.pos === pos && c.alive) || team.find(c => c.pos === pos);
        if (unit && !unit.state) unit.state = {};

        // 计算本格结构键
        let flyMode = null;
        if (unit && !unit.isHorse) {
            flyMode = (unit.state && unit.state._flyMode) || unit._renderFlyMode || null;
            if (!flyMode && unit._fsm && (unit._fsm.is('attached') || unit._fsm.is('flying'))) flyMode = 'fsm';
        }
        let effUnit = unit;
        if (unit && !unit.isHorse && unit.state && unit.state._isDead && !flyMode) {
            effUnit = { ...unit, state: { ...(unit.state || {}), _resting: false, _acted: false, _blocked: false } };
        }
        const key = cellKeyOf(unit, pos, flyMode) + (isAdjustMode ? '|adj' : '') + (selectedPos === pos ? '|sel' : '');

        const cached = cache.get(pos);
        const wantEl = grid.children[i] || null;

        // 血条目标值必须每帧刷新（不能随重建一起跳过，否则命中缓存时血条不再动）
        let hit = false;
        if (effUnit) {
            const hpPctLive = effUnit.alive ? Math.floor((effUnit.hp / effUnit.maxHp) * 100) : 0;
            _hpTargetPct.set(effUnit.uid, hpPctLive);
            if (!_hpDisplayPct.has(effUnit.uid) || GlobalStore.get('fastForwardActive')) _hpDisplayPct.set(effUnit.uid, hpPctLive);
            if (Math.abs((_hpDisplayPct.get(effUnit.uid) ?? hpPctLive) - hpPctLive) > 0.1 && !_hpAnimRunning) {
                _hpAnimRunning = true;
                requestAnimationFrame(tickHpAnim);
            }
        }

        // 命中：原地复用已是第 i 位的元素，不再重建整格
        if (cached && cached.key === key && cached.cell === wantEl) {
            hit = true;
        }
        if (hit) continue;

        let cell;
        if (!unit) {
            cell = buildEmptyCell(pos, camp, isAdjustMode, selectedPos);
        } else if (flyMode) {
            cell = buildFlyCell(unit, pos, camp);
        } else if (effUnit !== unit) {
            cell = buildOccupiedCell(effUnit, pos, camp, env);
        } else {
            cell = buildOccupiedCell(unit, pos, camp, env);
        }
        cache.set(pos, { key, cell });
        if (wantEl) grid.replaceChild(cell, wantEl);
        else grid.appendChild(cell);
    }
}

export { getDodgeBreakdown, isUnitBenefitedByBuff };

export function updateGridUI() {
    renderGrid('enemyGrid', CAMP_TYPES.ENEMY);
    renderGrid('allyGrid', CAMP_TYPES.ALLY);

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