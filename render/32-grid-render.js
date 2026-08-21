// render/32-grid-render.js - 光明顶5v5 战场格子渲染
// V5.5.2 | ~9003 bytes| 2026-08-19 import 路径合并至 infra/51-core-utils
export const VER = 'render/32-grid-render.js V5.5.2';

import { getUnitCol, getUnitRow, getAuraBonuses, getDodgeRules } from '../infra/51-core-utils.js';
import { CONFIG, getSkillDesc } from '../core/01config-5v5-test.js';
import { GlobalStore, getPlayerContext } from '../infra/54-global-store.js';

let _store = null;
let _subscribed = false;
let _ctx = null;

export function setGridRenderCtx(ctx) { _ctx = ctx; }
function getCtx() { return _ctx || getPlayerContext(); }
function getStore() {
    if (!_store) _store = GlobalStore.get('battleStore');
    return _store;
}
export function setGridStore(store) { _store = store; _subscribed = false; }

function getBuffStats(unit) {
    return {
        atkBonus: unit.buffAtkBonus || 0,
        defBonus: unit.buffDefBonus || 0,
        dodgeBonus: unit.buffDodgeBonus || 0,
        hpBonus: unit.buffHpBonus || 0
    };
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
            if (unit.role === '飞行' && rate === 0.15 && !seenFlightBase) {
                label = '飞行基础';
                seenFlightBase = true;
            } else if (unit.role === '飞行' && rate === 0.15 && seenFlightBase) {
                label = '青翼蝠王';
            } else if (unit.role !== '飞行' && rate === 0.03) {
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
        case 'carry': return unit.pos === 5 && unit.alive;
        case 'meteorShower': return unit.role === '远程';
        case 'bloodthirst': return unit.role === '战士';
        case 'fortify': return unit.role === '防战' && unit.camp === 'ally';
        case 'windAssault': return unit.role === '飞行';
        case 'cloudBody': return true;
        case 'holyFlame': {
            if (!activeBuffs) return false;
            const holyBuffs = activeBuffs.filter(b => b.key === 'holyFlame');
            return holyBuffs.some(b => {
                const cols = b.cols || (b.col != null ? [b.col] : []);
                const rows = b.rows || (b.row != null ? [b.row] : []);
                return cols.includes(getUnitCol(unit.pos)) || rows.includes(getUnitRow(unit.pos));
            });
        }
        case 'hotBlood': return true;
        case 'doubleStrike': return unit.uid === doubleStrikeUid && doubleStrikeUid != null;
        case 'horseFormation': return false;
        case 'mindControl': {
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

export function renderGrid(id, camp) {
    let grid = document.getElementById(id);
    if (!grid) return;
    grid.innerHTML = '';

    const store = getStore();
    const ctx = getCtx();
    let team = [];
    if (store) {
        const state = store.getState();
        team = state.units.filter(u => u.camp === camp);
    } else if (ctx && ctx.UI) {
        team = camp === 'ally' ? (ctx.UI.allyTeam || []) : (ctx.UI.enemyTeam || []);
    }

    let displayOrder = camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
    let isAdjustMode = ctx ? ctx.adjustMode : false;
    let selectedPos = ctx ? ctx.selectedAdjustPos : null;
    let activeBuffs = ctx ? (ctx.activeBuffs || []) : [];
    let allyTeam = ctx ? (ctx.UI.allyTeam || []) : [];
    let doubleStrikeUid = ctx ? ctx.currentDoubleStrikeUid : null;

    for (let i = 0; i < displayOrder.length; i++) {
        let pos = displayOrder[i], unit = team.find(c => c.pos === pos && c.alive) || team.find(c => c.pos === pos);
        if (unit && !unit.state) unit.state = {};
        if (unit && !unit.isHorse) {
            if ((unit.state && unit.state._flyMode) || (unit._fsm && (unit._fsm.is('attached') || unit._fsm.is('flying')))) {
                let div = document.createElement('div');
                div.className = 'cell occupied';
                div.dataset.pos = pos;
                div.dataset.uid = unit.uid;
                if (unit.state._flyMode === 'fly') {
                    div.style.background = 'transparent';
                    div.style.border = '2px solid transparent';
                    div.style.boxShadow = 'none';
                } else if (unit.state._flyMode === 'ghost') {
                    let roleIcon = unit.role==='战士'?'⚔️':(unit.role==='防战'?'🛡️':(unit.role==='远程'?'🏹':'🦅'));
                    div.innerHTML = `<span class="cell-icon">${roleIcon}</span><div class="cell-info"><span class="cell-name">${unit.name}</span><span class="cell-stats">攻${Math.floor(unit.atk)} 防${Math.floor(unit.def)} 血${Math.floor(unit.hp)}</span></div>`;
                    div.style.opacity = '0.5';
                    div.style.background = 'rgba(30,100,255,0.28)';
                    div.style.border = '2px solid rgba(100,150,255,0.6)';
                    div.style.boxShadow = '0 0 12px rgba(100,150,255,0.5)';
                } else if (unit.state._flyMode === 'butterfly' || (unit._fsm && unit._fsm.is('attached'))) {
                    const crashMode = window.GlobalStore?.get('crashMode') || 'ghost';
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
                } else if (unit.state._flyMode === 'spider' || (unit._fsm && unit._fsm.is('flying'))) {
                    const crashMode = window.GlobalStore?.get('crashMode') || 'ghost';
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
                grid.appendChild(div);
                continue;
            }
            if (unit.state && unit.state._isDead) {
                unit = { ...unit, _flash: 'dead', _resting: false, _acted: false, _blocked: false };
            }
        }
        if (!unit) {
            let div = document.createElement('div');
            div.className = 'cell';
            div.innerHTML = '<span style="color:#999;">空</span>';
            div.dataset.pos = pos;
            if (camp === 'ally' && isAdjustMode) div.classList.add('adjustable');
            if (camp === 'ally' && isAdjustMode && selectedPos === pos) div.classList.add('adjust-selected');
            grid.appendChild(div); continue;
        }
        let hasFlash = !!unit._flash;
        let isDead = (unit._flash==='dead' || !unit.alive || unit.state._isDead);
        let isBlocked = (unit.state && unit.state._blocked) || false;
        let isResting = (unit.state && unit.state._resting) || false;
        let isStunned = (unit.state && unit.state._stunned) || false;

        let roleIcon;
        if (isStunned && !isDead) {
            roleIcon = '😵';
        } else if (unit.isZhang && !unit.rangedForm) {
            roleIcon = '⚔️';
        } else if (unit.isHorse) {
            roleIcon = '🐴';
        } else {
            roleIcon = unit.role==='战士'?'⚔️':(unit.role==='防战'?'🛡️':(unit.role==='远程'?'🏹':'🦅'));
        }
        let displayName = unit.name;
        let displayIsZhang = unit.isZhang || false;
        if (unit.name === '成昆' && unit.state && unit.state._phantomTarget) {
            const allUnits = (ctx.UI.allyTeam || []).concat(ctx.UI.enemyTeam || []);
            const mimicTarget = allUnits.find(u => u.uid === unit.state._phantomTarget);
            if (mimicTarget) {
                displayName = mimicTarget.name;
                displayIsZhang = mimicTarget.isZhang || false;
                roleIcon = mimicTarget.role==='战士'?'⚔️':(mimicTarget.role==='防战'?'🛡️':(mimicTarget.role==='远程'?'🏹':'🦅'));
            }
        }
        let latestUnit = unit;
        if (store) {
            const state = store.getState();
            const freshUnit = state.units.find(u => u.uid === unit.uid);
            if (freshUnit) latestUnit = freshUnit;
        }

        let atkBonusVal = Math.floor(latestUnit.atk * latestUnit.buffAtkBonus);
        let defBonusVal = Math.floor((latestUnit._baseDef || latestUnit.def) * latestUnit.buffDefBonus);
        let hpBonusVal = Math.floor(latestUnit.maxHp * latestUnit.buffHpBonus);
        let displayAtk = Math.round(latestUnit.atk + (latestUnit._carryAtkBonus || 0) + atkBonusVal);
        let initAtk = latestUnit._initAtk !== undefined ? Math.round(latestUnit._initAtk) : Math.round(latestUnit.atk);
        let totalChange = displayAtk - initAtk;
        let atkDisplayHtml = `${displayAtk}`;
        if (totalChange > 0) atkDisplayHtml = `<span style="color:#daa520;font-weight:bold;">${displayAtk}</span>`;
        else if (totalChange < 0) atkDisplayHtml = `<span style="color:#c0392b;font-weight:bold;">${displayAtk}</span>`;
        let displayDef = Math.round(latestUnit.def + defBonusVal);
        let initDef = latestUnit._initDef !== undefined ? Math.round(latestUnit._initDef) : Math.round(latestUnit.def);
        let totalDefChange = displayDef - initDef;
        let defDisplayHtml = `${displayDef}`;
        if (totalDefChange > 0) defDisplayHtml = `<span style="color:#daa520;font-weight:bold;">${displayDef}</span>`;
        else if (totalDefChange < 0) defDisplayHtml = `<span style="color:#c0392b;font-weight:bold;">${displayDef}</span>`;
        let hpPct = unit.alive ? Math.floor((unit.hp / unit.maxHp) * 100) : 0;
        let hpColorClass = hpPct>70?'hp-text-green':(hpPct>40?'hp-text-orange':'hp-text-red');
        let barColor = hpPct>70?'#4caf50':(hpPct>40?'#ff9800':'#f44336');
        let hpDisplayHtml = `${Math.floor(unit.hp)}`;
        const hasButterflyHpBonus = (latestUnit._butterflyHpBonus || 0) > 0;
        if (hpBonusVal > 0 || (latestUnit._baseMaxHp !== undefined && latestUnit.maxHp > latestUnit._baseMaxHp) || hasButterflyHpBonus) {
            hpDisplayHtml = `<span style="color:#daa520;font-weight:bold;">${Math.floor(unit.hp)}</span>`;
        }
        let readyClass = (!hasFlash && !(unit.state && unit.state._acted) && unit.alive && !isDead) ? 'ready' : '';
        let actedClass = (!hasFlash && (unit.state && unit.state._acted) && unit.alive && !isDead) ? 'acted' : '';
        let cheerClass = (hasFlash && unit._flash==='cheer' && !isDead) ? 'cell-cheer' : '';
        let restingClass = (isBlocked && unit.alive && isResting && !(unit.isZhang && unit.rangedForm) && !isDead) ? 'resting' : '';
        let div = document.createElement('div');
        div.className = `cell occupied ${readyClass} ${actedClass} ${cheerClass} ${restingClass}`;
        if (isDead) { div.setAttribute('data-flash', 'dead'); div.style.transition = 'none'; }
        else if (unit._flash) { div.setAttribute('data-flash', unit._flash); div.style.transition = 'none'; }
        div.dataset.pos = pos;
        div.dataset.uid = unit.uid;
        if (camp === 'ally' && isAdjustMode) {
            if (unit.fixed) { div.classList.add('fixed-unit'); }
            else { div.classList.add('swappable'); if (selectedPos === pos) div.classList.add('adjust-selected'); }
        }
        if (unit._phantomFlash) {
            div.style.animation = 'phantomFlash 0.4s ease-in-out 2';
            setTimeout(() => { div.style.animation = ''; delete unit._phantomFlash; }, 800);
        }
        if (unit.isHorse && unit.alive && !(unit.state && unit.state._isDead) && !unit._horseSpawned) {
            unit._horseSpawned = true;
            requestAnimationFrame(() => createHorseSpawnAnim(div));
        }
        let buffIcons = '';
        if (ctx && camp === 'ally') {
            let iconMap = {};
            activeBuffs.forEach(b => {
                let info = CONFIG.BUFFS ? CONFIG.BUFFS[b.key] : null;
                if (info && info.icon && isUnitBenefitedByBuff(unit, b.key, allyTeam, doubleStrikeUid, activeBuffs)) {
                    iconMap[info.icon] = (iconMap[info.icon] || 0) + 1;
                }
            });
            buffIcons = Object.entries(iconMap).map(([icon, count]) => icon + (count > 1 ? 'x' + count : '')).join(' '); // join(' ') 空格分隔，便于后续 logo 拆分
        }
        let atkStyle = atkBonusVal > 0 ? 'color:#daa520;font-weight:bold;' : '';
        let defStyle = (defBonusVal > 0 || (latestUnit._fortifyStacks || 0) > 0) ? 'color:#daa520;font-weight:bold;' : '';
        let hpStyle = hpBonusVal > 0 ? 'color:#daa520;font-weight:bold;' : '';
        let eliteSkillIcon = (unit.name === '周芷若' && unit._hasKuaiLe) ? ' 💖' : (unit.name === '宋青书' && unit._hasXingFen) ? ' 💗' : (unit.isXiaoZhaoSister ? ' 🦋' : (unit.isXiaoZhaoBrother ? ' 🕷️' : ''));
        if (!eliteSkillIcon) {
            const sisterHost = allyTeam.find(a => a.isXiaoZhaoSister && a.alive && a.state && a.state._butterflyHost === unit.uid);
            if (sisterHost) eliteSkillIcon = ' 🦋';
        }
        if (unit.name === '成昆' && unit.state && unit.state._phantomTarget) eliteSkillIcon += ' 🎭';
        if (unit._xuanmingPoison && unit._xuanmingPoison.remaining > 0) eliteSkillIcon += ' ❄️';

        // ====== 格子名字+logo 分级显示逻辑 ======
        // 规则（2026-08-19 达达+用户确认）：
        // 1. logo 按加入顺序排列，最新的最靠近名字
        // 2. 名字≥5字时压缩名字宽度（letter-spacing:-0.5px），logo 大小不变
        // 3. logo 数量>2 且格子放不下时，只显示最新的2个（隐藏最早的）
        // 4. 短名字（≤4字）+ ≤2 logo：正常空格分隔，不压缩
        // 5. 小昭·姊/妹 的·保留，其他角色名已去掉·
        //
        // logo 总数计算：eliteSkillIcon 中的图标数 + buffIcons 中的图标数
        // eliteSkillIcon 用空格分隔（如 ' 🦋 🎭'），可按空格拆分
        // buffIcons 用空格分隔（如 '🔥 ❄️'），可按空格拆分
        // 注意：emoji 可能含 variation selector（如 ❄️ = ❄+️），不能单独用 Array.from 拆分

        // 把 buffIcons 的 join 改成空格分隔，便于后续拆分
        // （原代码第283行 .join('') 已改为 .join(' ')）

        // 组装 logo 列表：eliteSkillIcon 在前（先加），buffIcons 在后（后加）
        // 数组顺序 = 加入顺序，末尾 = 最新
        let logoList = [];
        if (eliteSkillIcon) {
            eliteSkillIcon.trim().split(/\s+/).forEach(ic => { if (ic) logoList.push(ic); });
        }
        if (buffIcons) {
            buffIcons.split(/\s+/).forEach(ic => { if (ic) logoList.push(ic); });
        }

        // 分级处理
        let compressName = false;
        let displayLogos = logoList.slice();

        if (displayName.length >= 5) {
            // 5字名字：压缩名字宽度
            compressName = true;
            // 压缩后放2个logo没问题，3个放不下 → 隐藏最早的
            if (displayLogos.length > 2) {
                displayLogos = displayLogos.slice(-2); // 保留最新2个
            }
        } else if (displayName.length === 4 && displayLogos.length > 2) {
            // 4字名字+3 logo以上：不压缩，隐藏最早的
            displayLogos = displayLogos.slice(-2);
        }
        // 其他情况：≤4字 + ≤2 logo 或 2~3字 + 任意 logo → 不动

        // 生成名字 HTML
        let nameHtml;
        if (compressName) {
            // 压缩模式：logo 紧贴名字（cell-logo 包裹），最新的最靠近名字
            // displayLogos 末尾 = 最新，反转后最新的排前面紧贴名字
            let logoHtml = displayLogos.slice().reverse().join(' ');
            nameHtml = `<span class="cell-name ${displayIsZhang?'gold':''} cell-name-long">${displayName}${logoHtml ? '<span class="cell-logo">' + logoHtml + '</span>' : ''}</span>`;
        } else if (displayLogos.length < logoList.length) {
            // 非压缩但隐藏了部分 logo：用空格分隔显示
            nameHtml = `<span class="cell-name ${displayIsZhang?'gold':''}">${displayName}${displayLogos.length ? ' ' + displayLogos.join(' ') : ''}</span>`;
        } else {
            // 正常模式：完全保持原来的显示格式（eliteSkillIcon 带前导空格 + buffIcons 空格分隔）
            nameHtml = `<span class="cell-name ${displayIsZhang?'gold':''}">${displayName}${eliteSkillIcon}${buffIcons ? ' ' + buffIcons : ''}</span>`;
        }
        div.innerHTML = `<span class="cell-icon">${isBlocked && unit.alive && isResting && !(unit.isZhang && unit.rangedForm) && !isDead ? '😴' : roleIcon}</span><div class="cell-info">${nameHtml}<span class="cell-stats">攻<span style="${atkStyle}">${atkDisplayHtml}</span> 防<span style="${defStyle}">${defDisplayHtml}</span> <span class="${hpColorClass}" style="${hpStyle}">血${hpDisplayHtml}</span></span></div><div class="hp-bar-wrap"><div class="hp-bar-inner" id="hpbar-${unit.uid}" style="height:${hpPct}%;background:${barColor};transition:height 0.4s ease, background 0.4s ease;"></div></div>`;
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
            if (typeof window.openDetailPopup === 'function') window.openDetailPopup(unit);
        });
        grid.appendChild(div);
    }
}

export function updateGridUI() {
    renderGrid('enemyGrid', 'enemy');
    renderGrid('allyGrid', 'ally');

    if (!_subscribed) {
        const store = getStore();
        if (store) {
            store.subscribe(() => {
                renderGrid('enemyGrid', 'enemy');
                renderGrid('allyGrid', 'ally');
            });
            _subscribed = true;
        }
    }
}