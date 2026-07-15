// ui/14ui-render-5v5-test.js - 光明顶5v5 UI渲染模块（响应式版）
// V5.0.2 | ~18500 bytes | 2026-07-11 数据驱动渲染，移除魔数清理
export const VER = 'ui/14ui-render-5v5-test.js V5.0.3';

import { CONFIG } from '../core/01config-5v5-test.js';
import { rand } from '../core/03battle-utils.js';
import { computeBuffStats } from '../core/04buff-system.js';
import { showDanmaku as _showDanmaku } from '../fx/15fx-common-5v5-test.js';
const showDanmaku = (...args) => { if (typeof _showDanmaku === 'function') return _showDanmaku(...args); };

export function stripTags(html) { let div = document.createElement('div'); div.innerHTML = html; return div.textContent || ''; }

// ==================== 响应式 Store 引用 ====================
let _store = null;
let _subscribed = false;
function getStore() {
    if (!_store) {
        if (window._battleStore) _store = window._battleStore;
    }
    return _store;
}
export function setRenderStore(store) {
    _store = store;
    _subscribed = false;
    if (store === null) window._battleStore = null;
}

// ==================== 辅助函数 ====================
function getCtx() {
    return window._getPlayerContext ? window._getPlayerContext() : null;
}

function getBuffStats(unit) {
    return {
        atkBonus: unit.buffAtkBonus || 0,
        defBonus: unit.buffDefBonus || 0,
        dodgeBonus: unit.buffDodgeBonus || 0,
        hpBonus: unit.buffHpBonus || 0
    };
}

export function isUnitBenefitedByBuff(unit, buffKey, allyTeam, doubleStrikeUid, activeBuffs) {
    switch (buffKey) {
        case 'carry': return unit.pos === 5 && unit.alive;
        case 'meteorShower': return unit.role === '远程';
        case 'bloodthirst': return unit.role === '战士';
        case 'fortify': return unit.role === '防战';
        case 'windAssault': return unit.role === '飞行';
        case 'cloudBody': return true;
        case 'holyFlame': {
            if (!activeBuffs) return false;
            let holyBuff = activeBuffs.find(b => b.key === 'holyFlame');
            if (!holyBuff) return false;
            let col = holyBuff.col, row = holyBuff.row;
            if (col == null || row == null) return false;
            let unitCol = (unit.pos - 1) % 3 + 1;
            let unitRow = Math.ceil(unit.pos / 3);
            return unitCol === col || unitRow === row;
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

// ==================== 详情弹窗 ====================
let detailPopup = null;
let detailPopupUnit = null;
let detailPopupInterval = null;

function openDetailPopup(unit) {
    closeDetailPopup();
    detailPopupUnit = unit;
    detailPopup = document.createElement('div');
    detailPopup.className = 'detail-popup';
    detailPopup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fdf5e6;border:3px solid #b8860b;border-radius:12px;padding:16px;z-index:10050;min-width:240px;max-width:300px;max-height:85vh;overflow-y:auto;box-shadow:0 8px 30px rgba(0,0,0,0.5);font-size:13px;line-height:1.6;';
    let closeBtn = document.createElement('span');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'position:absolute;top:6px;right:10px;cursor:pointer;font-size:18px;color:#8b7355;font-weight:bold;';
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeDetailPopup(); });
    detailPopup.appendChild(closeBtn);
    updateDetailPopupContent();
    document.body.appendChild(detailPopup);
    setTimeout(() => { document.addEventListener('click', closeDetailPopupOnClick); }, 100);
    detailPopupInterval = setInterval(() => {
        if (detailPopup && detailPopupUnit) updateDetailPopupContent();
    }, 1000);
}

function updateDetailPopupContent() {
    if (!detailPopup || !detailPopupUnit) return;
    const ctx = getCtx();
    if (!ctx) return;
    let uid = detailPopupUnit.uid;
    let allUnits = (ctx.UI.allyTeam || []).concat(ctx.UI.enemyTeam || []);
    let latestUnit = allUnits.find(u => u.uid === uid);
    if (!latestUnit) { closeDetailPopup(); return; }
    detailPopupUnit = latestUnit;
    const u = latestUnit;
    let allyTeam = ctx.UI.allyTeam || [];
    let activeBuffs = ctx.activeBuffs || [];
    let doubleStrikeUid = ctx.currentDoubleStrikeUid;
    let unitBuffs = activeBuffs.filter(b => isUnitBenefitedByBuff(u, b.key, allyTeam, doubleStrikeUid, activeBuffs));
    let buffText = '无';
    let masteryText = '';
    if (u.isXiaoZhao) {
        // 小昭：显示永久海克斯列表
        const perms = u._permanentBuffs || [];
        buffText = perms.length > 0 ? perms.map(b => b.name).join('、') : '无';
        // 精通进度
        const mastered = u._masteredRoles || [];
        masteryText = mastered.length > 0 ? `<span style="color:#888;">精通</span><span>${mastered.join('、')}（${mastered.length}/4，需carry才生效）</span>` : '';
    } else if (unitBuffs.length > 0) {
        buffText = unitBuffs.map(b => `${b.name}(${b.remaining}回)`).join('、');
    }
    let buffStats = getBuffStats(u);
    let atkBonusVal = Math.floor(u.atk * buffStats.atkBonus);
    let defBonusVal = Math.floor(u.def * buffStats.defBonus);
    let hpBonusVal = Math.floor(u.maxHp * buffStats.hpBonus);
    let displayAtk = u.atk + atkBonusVal;
    let displayDef = u.def + defBonusVal;
    let hpPct = u.alive ? Math.floor((u.hp / u.maxHp) * 100) : 0;
    let hpColor = hpPct > 70 ? '#2e7d32' : (hpPct > 40 ? '#d2691e' : '#c0392b');

    let closeBtn = detailPopup.querySelector('span');
    detailPopup.innerHTML = '';
    if (closeBtn) detailPopup.appendChild(closeBtn);

    let content = document.createElement('div');
    content.innerHTML = `
        <div style="font-weight:bold;font-size:15px;margin-bottom:8px;color:#5c4033;">${u.name} ${u.isHorse ? '🐴' : ''}${u.isZhang ? '[无忌]' : ''}${u.isWei ? '[韦一笑]' : ''}</div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;">
            <span style="color:#888;">角色</span><span>${u.role} M${u.m}</span>
            <span style="color:#888;">站位</span><span>${!u.alive ? '已阵亡' : (u.pos || '?') + '号位'}</span>
            <span style="color:#888;">血量</span><span style="color:${hpColor};font-weight:bold;">${Math.floor(u.hp)} / ${Math.floor(u.maxHp)} (${hpPct}%)</span>
            <span style="color:#888;">攻击</span><span>${u._baseAtk !== undefined && u.atk > u._baseAtk ? `${u._baseAtk}<span style="color:#daa520;">+${u.atk - u._baseAtk}</span> = <span style="color:#daa520;font-weight:bold;">${u.atk}</span>` : `${u.atk}${atkBonusVal > 0 ? ' <span style="color:#daa520;">+' + atkBonusVal + '</span> = ' + displayAtk : ''}`}</span>
            <span style="color:#888;">防御</span><span>${u.def}${defBonusVal > 0 ? ' <span style="color:#daa520;">+' + defBonusVal + '</span>' : ''} = <span style="color:#daa520;font-weight:bold;">${displayDef}</span></span>
            <span style="color:#888;">造成伤害</span><span>${u.dmgDealt || 0}</span>
            <span style="color:#888;">承受伤害</span><span>${u.dmgTaken || 0}</span>
            <span style="color:#888;">治疗</span><span>${u.healDone || 0}</span>
            <span style="color:#888;">闪避次数</span><span>${u.dodgeCount || 0}</span>
            <span style="color:#888;">暴击次数</span><span>${u.critCount || 0}</span>
            <span style="color:#888;">Buff</span><span>${buffText}</span>
            ${masteryText}
            ${(() => {
                let skills = [];
                if (u.name === '张无忌') skills = ['九阳神功：每回合回复5%生命', '乾坤大挪移：保护4/6号位队友，反弹15%伤害', '近战形态：前排无人时切换，攻+3/防+2/血+50'];
                else if (u.name === '韦一笑') skills = ['寒冰掌：攻击吸血15%，增加生命上限', '青翼蝠王：基础闪避20%，无视行动状态闪避'];
                else if (u.name === '宋青书') skills = ['💥 叛逆突袭：优先攻击血量最高目标，附加目标当前生命10%真实伤害', '💪 苦练：场上无周芷若时最先行动；行动前全体队友+1攻+1防+2生命上限，自身翻倍', '💒 新婚：攻击扣除周芷若1血，叠快乐层（16%→10%→6%→3%）', '💗 性奋：周芷若在场时攻击后可再次行动；每次攻击后减少递增生命上限'];
                else if (u.name === '周芷若') skills = ['🐾 九阴白骨爪：基础1+已损失1%+最大1%追击，≤12%斩杀（无忌在场：基础2+1.5%+2%，≤15%斩杀），可连锁'];
                else if (u.name === '成昆') skills = ['💥 混元霹雳劲：附加已损失生命30%的真实伤害', '🌀 幻影伪装：攻击后模仿对方单位；对方攻击时20%概率混乱，每损失10%生命+3%'];
                else if (u.name === '鹿杖客') skills = ['❄️ 玄冥神掌：中毒每回合损失4%→2%→1%→消失', '🔗 联动鹤笔翁：攻击后鹤笔翁立刻攻击同一目标'];
                else if (u.name === '鹤笔翁') skills = ['🦌 鹿角杖法：忽略30%防御，中毒目标伤害+30%', '🔗 联动鹿杖客：攻击后鹿杖客立刻攻击同一目标'];
                else if (u.name === '小昭') skills = ['🦋 蝶变：每回合随机变换职业，记录精通，+25血上限', '✨ 乾坤大挪移（衍生）：张无忌不在时，队友受伤触发减伤、治疗和攻击加成', '🛡️ 乾坤大挪移（升级）：张无忌在场时，全队减伤30%并反弹伤害', '♾️ 永久海克斯：获得的海克斯效果永久持续，按当前职业自动匹配', '🏆 精通（需carry）：每精通一个职业+4攻+4防+25血上限（最多4职业）'];
                if (skills.length > 0) {
                    return `<span style="color:#888;">技能</span><span style="color:#b8860b;">${skills.join('<br>')}</span>`;
                }
                return '';
            })()}
        </div>
        <div style="text-align:center;margin-top:10px;color:#888;font-size:11px;">点击外部关闭</div>
    `;
    detailPopup.appendChild(content);
}

function closeDetailPopup() {
    if (detailPopupInterval) { clearInterval(detailPopupInterval); detailPopupInterval = null; }
    if (detailPopup && detailPopup.parentNode) { detailPopup.parentNode.removeChild(detailPopup); }
    detailPopup = null; detailPopupUnit = null;
    document.removeEventListener('click', closeDetailPopupOnClick);
}

function closeDetailPopupOnClick(e) { if (detailPopup && !detailPopup.contains(e.target)) closeDetailPopup(); }

function createHorseSpawnAnim(cell) {
    cell.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    cell.style.transform = 'scale(1.3)';
    cell.style.boxShadow = '0 0 20px rgba(255,215,0,0.8)';
    setTimeout(() => { cell.style.transform = 'scale(1)'; cell.style.boxShadow = ''; }, 400);
}

// ==================== 核心渲染函数 ====================

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
        let pos = displayOrder[i], unit = team.find(c => c.pos === pos);
        if (unit && !unit.isHorse) {
            if (unit._flyMode) {
                let div = document.createElement('div');
                div.className = 'cell occupied';
                div.dataset.pos = pos;
                div.dataset.uid = unit.uid;
                if (unit._flyMode === 'ghost') {
                    let roleIcon = unit.role==='战士'?'⚔️':(unit.role==='防战'?'🛡️':(unit.role==='远程'?'🏹':'🦅'));
                    div.innerHTML = `<span class="cell-icon">${roleIcon}</span><div class="cell-info"><span class="cell-name">${unit.name}</span><span class="cell-stats">攻${Math.floor(unit.atk)} 防${Math.floor(unit.def)} 血${Math.floor(unit.hp)}</span></div>`;
                    div.style.opacity = '0.5';
                    div.style.background = 'rgba(30,100,255,0.28)';
                    div.style.border = '2px solid rgba(100,150,255,0.6)';
                    div.style.boxShadow = '0 0 12px rgba(100,150,255,0.5)';
                }
                grid.appendChild(div);
                continue;
            }
            if (unit._isDead) {
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
        let roleIcon;
        if (unit.isZhang && !unit.rangedForm) {
            roleIcon = '⚔️';
        } else if (unit.isHorse) {
            roleIcon = '🐴';
        } else {
            roleIcon = unit.role==='战士'?'⚔️':(unit.role==='防战'?'🛡️':(unit.role==='远程'?'🏹':'🦅'));
        }
        let displayName = unit.name;
        let displayIsZhang = unit.isZhang || false;
        if (unit.name === '成昆' && unit._phantomTarget) {
            const allUnits = (ctx.UI.allyTeam || []).concat(ctx.UI.enemyTeam || []);
            const mimicTarget = allUnits.find(u => u.uid === unit._phantomTarget);
            if (mimicTarget) {
                displayName = mimicTarget.name;
                displayIsZhang = mimicTarget.isZhang || false;
                roleIcon = mimicTarget.role==='战士'?'⚔️':(mimicTarget.role==='防战'?'🛡️':(mimicTarget.role==='远程'?'🏹':'🦅'));
            }
        }
        // 强制从Store获取最新单位数据，确保UI能立即响应属性变化
        let latestUnit = unit;
        if (store) {
            const state = store.getState();
            const freshUnit = state.units.find(u => u.uid === unit.uid);
            if (freshUnit) {
                latestUnit = freshUnit;
            }
        }

        // 实时计算 Buff 加成，不依赖可能滞后的 unit.buffAtkBonus
        let buffStats = computeBuffStats(latestUnit, activeBuffs, allyTeam);
        let atkBonusVal = Math.floor(latestUnit.atk * buffStats.atkBonus);
        let defBonusVal = Math.floor(latestUnit.def * buffStats.defBonus);
        let hpBonusVal = Math.floor(latestUnit.maxHp * buffStats.hpBonus);
        let displayAtk = Math.round(latestUnit.atk + atkBonusVal);
        let atkDisplayHtml = `${displayAtk}`;
        if ((latestUnit._baseAtk !== undefined && displayAtk > latestUnit._baseAtk) || atkBonusVal > 0) {
            atkDisplayHtml = `<span style="color:#daa520;font-weight:bold;">${displayAtk}</span>`;
        }
        let displayDef = Math.round(latestUnit.def + defBonusVal);
        let defDisplayHtml = `${displayDef}`;
        if ((latestUnit._baseDef !== undefined && displayDef > latestUnit._baseDef) || defBonusVal > 0) {
            defDisplayHtml = `<span style="color:#daa520;font-weight:bold;">${displayDef}</span>`;
        }
        let hpPct = unit.alive ? Math.floor((unit.hp / unit.maxHp) * 100) : 0;
        let hpColorClass = hpPct>70?'hp-text-green':(hpPct>40?'hp-text-orange':'hp-text-red');
        let barColor = hpPct>70?'#4caf50':(hpPct>40?'#ff9800':'#f44336');
        let hpDisplayHtml = `${Math.floor(unit.hp)}`;
        if (hpBonusVal > 0 || (latestUnit._baseMaxHp !== undefined && latestUnit.maxHp > latestUnit._baseMaxHp)) {
            hpDisplayHtml = `<span style="color:#daa520;font-weight:bold;">${Math.floor(unit.hp)}</span>`;
        }
        let hasFlash = !!unit._flash;
        let isDead = (unit._flash==='dead' || !unit.alive || unit._isDead);
        let readyClass = (!hasFlash && !unit._acted && unit.alive && !isDead) ? 'ready' : '';
        let actedClass = (!hasFlash && unit._acted && unit.alive && !isDead) ? 'acted' : '';
        let isBlocked = unit._blocked || false;
        let isResting = unit._resting || false;
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
        if (unit.isHorse && unit.alive && !unit._isDead && !unit._horseSpawned) {
            unit._horseSpawned = true;
            requestAnimationFrame(() => createHorseSpawnAnim(div));
        }
        let buffIcons = '';
        if (ctx && camp === 'ally') {
            let unitBuffs = activeBuffs.filter(b => isUnitBenefitedByBuff(unit, b.key, allyTeam, doubleStrikeUid, activeBuffs));
            // 手动处理图标，以便显示 "x2"
            let iconMap = {};
            unitBuffs.forEach(b => {
                let info = CONFIG.BUFFS ? CONFIG.BUFFS[b.key] : null;
                if (info && info.icon) {
                    iconMap[info.icon] = (iconMap[info.icon] || 0) + 1;
                }
            });
            buffIcons = Object.entries(iconMap).map(([icon, count]) => {
                return icon + (count > 1 ? 'x' + count : '');
            }).join('');
        }
        let atkStyle = atkBonusVal > 0 ? 'color:#daa520;font-weight:bold;' : '';
        let defStyle = defBonusVal > 0 ? 'color:#daa520;font-weight:bold;' : '';
        let hpStyle = hpBonusVal > 0 ? 'color:#daa520;font-weight:bold;' : '';
        let eliteSkillIcon = (unit.name === '周芷若' && unit._hasKuaiLe) ? ' 💖' : (unit.name === '宋青书' && unit._hasXingFen) ? ' 💗' : (unit.isXiaoZhao ? ' 🦋' : '');
        if (unit.name === '成昆' && unit._phantomTarget) eliteSkillIcon += ' 🎭';
        if (unit._xuanmingPoison && unit._xuanmingPoison.remaining > 0) eliteSkillIcon += ' ❄️';
        div.innerHTML = `<span class="cell-icon">${isBlocked && unit.alive && isResting && !(unit.isZhang && unit.rangedForm) && !isDead ? '😴' : roleIcon}</span><div class="cell-info"><span class="cell-name ${displayIsZhang?'gold':''}">${displayName}${eliteSkillIcon}${buffIcons ? ' ' + buffIcons : ''}</span><span class="cell-stats">攻<span style="${atkStyle}">${atkDisplayHtml}</span> 防<span style="${defStyle}">${defDisplayHtml}</span> <span class="${hpColorClass}" style="${hpStyle}">血${hpDisplayHtml}</span></span></div><div class="hp-bar-wrap"><div class="hp-bar-inner" id="hpbar-${unit.uid}" style="height:${hpPct}%;background:${barColor};transition:none;"></div></div>`;
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
            if (unit) openDetailPopup(unit);
        });
        grid.appendChild(div);
    }
}

export function updateUI() {
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

// ==================== 胜利特效 ====================
export function spawnVictoryEffects(winnerCamp, aliveUnitsOverride) {
    let gridId = winnerCamp==='明教'?'allyGrid':'enemyGrid', grid = document.getElementById(gridId);
    if (!grid) return;
    grid.classList.add('victory-border');
    let cells = grid.children;
    let ctx = getCtx();
    if (!ctx) return;
    let UI = ctx.UI;
    let winUnits = winnerCamp==='明教'?UI.allyTeam:UI.enemyTeam;
    let aliveUnits = aliveUnitsOverride || winUnits.filter(u => u.alive);
    for (let i=0;i<cells.length;i++) {
        let pos = winnerCamp==='明教'?([1,2,3,4,5,6,7,8,9][i]):([7,8,9,4,5,6,1,2,3][i]);
        let unit = winUnits.find(c => c.pos === pos);
        if (unit && unit.alive) cells[i].classList.add('cell-cheer');
    }
    let centerCell = grid.children[4], rect = centerCell?centerCell.getBoundingClientRect():grid.getBoundingClientRect();
    document.body.classList.add('shake'); setTimeout(()=>document.body.classList.remove('shake'),500);
    let banner = document.createElement('div'); banner.className='victory-banner'; banner.textContent='🏆 胜利 🏆'; banner.style.top=Math.max(5,rect.top-12)+'px'; banner.style.left=(rect.left+rect.width/2)+'px'; document.body.appendChild(banner);
    setTimeout(()=>{if(banner.parentNode)banner.parentNode.removeChild(banner);},8000);
    let cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
    let colors=['#ffd700','#ff6b6b','#51cf66','#45a7ff','#ff9f43','#ff00ff'];
    for(let i=0;i<60;i++){let particle=document.createElement('div');particle.className='party-particle';let angle=Math.random()*Math.PI*2,dist=40+Math.random()*80;particle.style.setProperty('--dx',Math.cos(angle)*dist+'px');particle.style.setProperty('--dy',Math.sin(angle)*dist+'px');particle.style.left=cx+'px';particle.style.top=cy+'px';particle.style.background=colors[Math.floor(Math.random()*colors.length)];document.body.appendChild(particle);setTimeout(()=>{if(particle.parentNode)particle.parentNode.removeChild(particle);},2800);}
    for(let i=0;i<15;i++){let star=document.createElement('div');star.className='star-particle';let angle=Math.random()*Math.PI*2,dist=30+Math.random()*50;star.style.setProperty('--dx',Math.cos(angle)*dist+'px');star.style.setProperty('--dy',Math.sin(angle)*dist+'px');star.style.left=cx+'px';star.style.top=cy+'px';star.textContent=['⭐','🌟','✨'][Math.floor(Math.random()*3)];document.body.appendChild(star);setTimeout(()=>{if(star.parentNode)star.parentNode.removeChild(star);},3300);}
    let logDiv=document.getElementById('log'),winColor=winnerCamp==='明教'?'blue':'orange';
    const WIN_TAUNTS = [
        '赢了！', '哈哈，胜了！', '活下来了！', '敌人全灭了！', '太好了！',
        '好好好！', '哈哈哈！', '还有谁？', '干得漂亮！', '不过如此！',
        '总算结束了！', '痛快！', '明教必胜！', '再来啊！', '就这？'
    ];
    const sortedAlive = aliveUnits.sort((a, b) => {
        if ((b.dmgDealt || 0) !== (a.dmgDealt || 0)) return (b.dmgDealt || 0) - (a.dmgDealt || 0);
        return (b.dmgTaken || 0) - (a.dmgTaken || 0);
    });
    sortedAlive.forEach((u, index) => {
        const taunt = WIN_TAUNTS[rand(0, WIN_TAUNTS.length - 1)];
        setTimeout(() => {
            requestAnimationFrame(() => {
                showDanmaku(u, taunt);
                logDiv.innerHTML += `<span class="${winColor}">🗯️ ${u.name}：${taunt}</span><br>`;
                logDiv.scrollTop = logDiv.scrollHeight;
            });
        }, index * 600);
    });
    logDiv.innerHTML+=`<span class="gold">🎉🏆 <span class="${winColor}">${winnerCamp}</span>获得最终胜利！ 🏆🎉</span><br>`;logDiv.scrollTop=logDiv.scrollHeight;
}

// ==================== 日志清除 ====================
export function clearLogExceptFirst() { let logDiv = document.getElementById('log'), children = logDiv.children; while (children.length > 1) logDiv.removeChild(children[1]); let calibrator = document.createElement('div'); calibrator.style.display = 'block'; calibrator.innerHTML = ''; logDiv.appendChild(calibrator); }