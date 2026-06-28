// 14ui-render-5v5-test.js - 光明顶对战 5v5 UI渲染模块
// 0625 12:38 kimi: 补充鹿杖客/鹤笔翁/成昆技能描述，玄冥二老拆分后详情弹窗适配
// 预估行数: 610, 发送时间: 20260625 12:38, 版本: V1.0.14
export const VER = '14ui-render-5v5-test.js V1.0.14';

import { CONFIG } from '../core/01config-5v5-test.js';
import { showDanmaku as _showDanmaku } from '../fx/15fx-common-5v5-test.js';
const showDanmaku = (...args) => { if (typeof _showDanmaku === 'function') return _showDanmaku(...args); };

export function stripTags(html) { let div = document.createElement('div'); div.innerHTML = html; return div.textContent || ''; }

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

let detailPopup = null;
let detailPopupUnit = null;
let detailPopupInterval = null;

function openDetailPopup(unit, team, activeBuffs, doubleStrikeUid) {
    closeDetailPopup();
    detailPopupUnit = unit;
    detailPopup = document.createElement('div');
    detailPopup.className = 'detail-popup';
    detailPopup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fdf5e6;border:3px solid #b8860b;border-radius:12px;padding:16px;z-index:10050;min-width:220px;box-shadow:0 8px 30px rgba(0,0,0,0.5);font-size:13px;line-height:1.6;';
    let closeBtn = document.createElement('span');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'position:absolute;top:6px;right:10px;cursor:pointer;font-size:18px;color:#8b7355;font-weight:bold;';
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeDetailPopup(); });
    detailPopup.appendChild(closeBtn);
    updateDetailPopupContent(activeBuffs, doubleStrikeUid);
    document.body.appendChild(detailPopup);
    setTimeout(() => { document.addEventListener('click', closeDetailPopupOnClick); }, 100);
    detailPopupInterval = setInterval(() => {
        if (detailPopup && detailPopupUnit) {
            let ctx = window._getPlayerContext ? window._getPlayerContext() : null;
            if (ctx && ctx.activeBuffs) {
                updateDetailPopupContent(ctx.activeBuffs, ctx.currentDoubleStrikeUid);
            }
        }
    }, 1000);
}

function updateDetailPopupContent(activeBuffs, doubleStrikeUid) {
    if (!detailPopup || !detailPopupUnit) return;
    let ctx = window._getPlayerContext ? window._getPlayerContext() : null;
    if (!ctx) return;
    let uid = detailPopupUnit.uid;
    let latestUnit = ctx.UI.allyTeam.concat(ctx.UI.enemyTeam).find(u => u.uid === uid);
    if (!latestUnit) { closeDetailPopup(); return; }
    detailPopupUnit = latestUnit;
    const u = latestUnit;
    let allyTeam = ctx.UI.allyTeam || [];
    let unitBuffs = activeBuffs.filter(b => isUnitBenefitedByBuff(u, b.key, allyTeam, doubleStrikeUid, activeBuffs));
    let buffText = '无';
    if (unitBuffs.length > 0) buffText = unitBuffs.map(b => `${b.name}(${b.remaining}回)`).join('、');
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
            <span style="color:#888;">血量</span><span style="color:${hpColor};font-weight:bold;">${Math.floor(u.hp)} / ${Math.floor(u.maxHp)} (${hpPct}%)${hpBonusVal > 0 ? ' <span style="color:#b8860b;font-size:10px;">(基础' + Math.floor(u.maxHp - hpBonusVal) + '+' + hpBonusVal + '加成)</span>' : ''}</span>
            <span style="color:#888;">攻击</span><span>${u.atk}${atkBonusVal > 0 ? ' <span style="color:#b8860b;">+' + atkBonusVal + '</span>' : ''} = <span style="font-weight:bold;">${displayAtk}</span></span>
            <span style="color:#888;">防御</span><span>${u.def}${defBonusVal > 0 ? ' <span style="color:#b8860b;">+' + defBonusVal + '</span>' : ''} = <span style="font-weight:bold;">${displayDef}</span></span>
            <span style="color:#888;">造成伤害</span><span>${u.dmgDealt || 0}</span>
            <span style="color:#888;">承受伤害</span><span>${u.dmgTaken || 0}</span>
            <span style="color:#888;">治疗</span><span>${u.healDone || 0}</span>
            <span style="color:#888;">闪避次数</span><span>${u.dodgeCount || 0}</span>
            <span style="color:#888;">暴击次数</span><span>${u.critCount || 0}</span>
            <span style="color:#888;">Buff</span><span>${buffText}</span>
            ${(() => {
                let skills = [];
                if (u.name === '张无忌') skills = ['九阳神功：每回合回复5%生命', '乾坤大挪移：保护4/6号位队友，反弹15%伤害', '近战形态：前排无人时切换，攻+3/防+2/血+50'];
                else if (u.name === '韦一笑') skills = ['寒冰掌：攻击吸血15%，增加生命上限', '青翼蝠王：基础闪避20%，无视行动状态闪避'];
                else if (u.name === '宋青书') skills = ['叛逆突袭：优先攻击血量最高目标，伤害+30%，附加目标当前生命10%真实伤害', '苦练：场上无周芷若时每回合最先行动', '新婚：每次攻击扣除周芷若1点血，叠加快乐', '性奋：周芷若在场时攻击后可再次行动'];
                else if (u.name === '周芷若') skills = ['九阴白骨爪：70%概率追加25%额外伤害，不可闪避，张无忌在场时提升至40%', '嫉妒：张无忌在场时伤害加深'];
                else if (u.name === '成昆') skills = ['混元霹雳劲：附加已损失生命30%的真实伤害', '高生存：作为防战，防御极高且可反弹伤害'];
                else if (u.name === '鹿杖客') skills = ['玄冥神掌：攻击附带寒毒，每回合损失3%最大生命，持续3回合', '与鹤笔翁联动：鹤笔翁对中毒目标伤害+50%'];
                else if (u.name === '鹤笔翁') skills = ['鹿角杖法：忽略目标30%防御', '毒伤加成：对已中毒目标伤害额外+50%'];
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

export function renderGrid(id, team, camp, debugMode, oldTeam) {
    let grid = document.getElementById(id); grid.innerHTML = '';
    let displayOrder = camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
    let ctx = window._getPlayerContext ? window._getPlayerContext() : null;
    let isAdjustMode = ctx ? ctx.adjustMode : false;
    let selectedPos = ctx ? ctx.selectedAdjustPos : null;
    let activeBuffs = ctx ? (ctx.activeBuffs || []) : [];
    let allyTeam = ctx ? ctx.UI.allyTeam : [];
    let doubleStrikeUid = ctx ? ctx.currentDoubleStrikeUid : null;

    for (let i = 0; i < displayOrder.length; i++) {
        let pos = displayOrder[i], unit = team.find(c => c.pos === pos);
        // 仅当单位显式处于飞走模式时才跳过渲染
if (unit && (unit._flyMode || unit._isDead)) unit = null;
        if (!unit) {
            let div = document.createElement('div');
            div.className = 'cell';
            // 检查该位置是否有正在飞走动画的单位（避免显示“空”）
            let flyUnit = team.find(c => c.pos === pos && c._flyMode);
            if (flyUnit) {
                // 飞走模式：透明占位，不显示文字，不参与交互
                div.style.opacity = '0';
                div.style.pointerEvents = 'none';
                div.innerHTML = '';
            } else {
                div.innerHTML = '<span style="color:#999;">空</span>';
            }
            div.dataset.pos = pos;
            if (camp === 'ally' && isAdjustMode) div.classList.add('adjustable');
            if (camp === 'ally' && isAdjustMode && selectedPos === pos) div.classList.add('adjust-selected');
            grid.appendChild(div); continue;
        }
        let roleIcon = unit.role==='战士'?'⚔️':(unit.role==='防战'?'🛡️':(unit.role==='远程'?'🏹':'🦅'));
        if (unit.isZhang && !unit.rangedForm) roleIcon = '⚔️';
        if (unit.isHorse) roleIcon = '🐴';
        let buffStats = getBuffStats(unit);
        let atkBonusVal = Math.floor(unit.atk * buffStats.atkBonus);
        let defBonusVal = Math.floor(unit.def * buffStats.defBonus);
        let hpBonusVal = Math.floor(unit.maxHp * buffStats.hpBonus);
        let displayAtk = unit.atk + atkBonusVal;
        let displayDef = unit.def + defBonusVal;
        let hpPct = unit.alive ? (unit.hp / unit.maxHp) * 100 : 0;
        let hpColorClass = hpPct>70?'hp-text-green':(hpPct>40?'hp-text-orange':'hp-text-red');
        let barColor = hpPct>70?'#4caf50':(hpPct>40?'#ff9800':'#f44336');
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
        if (isDead) { div.setAttribute('data-flash', 'dead'); }
        else if (unit._flash) { div.setAttribute('data-flash', unit._flash); }
        div.dataset.pos = pos;
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
            buffIcons = unitBuffs.map(b => {
                let info = CONFIG.BUFFS ? CONFIG.BUFFS[b.key] : null;
                return info ? info.icon : '';
            }).filter(icon => icon).join('');
            // 概率连击是特殊 Buff，单独给该单位加上闪电图标
            // 概率连击图标：单独检查当前单位是否被选中
            if (doubleStrikeUid != null && unit.uid === doubleStrikeUid) {
                buffIcons = buffIcons + '⚡';
            }
        }
        let atkStyle = atkBonusVal > 0 ? 'color:#b8860b;font-weight:bold;' : '';
        let defStyle = defBonusVal > 0 ? 'color:#b8860b;font-weight:bold;' : '';
        let hpStyle = hpBonusVal > 0 ? 'color:#b8860b;font-weight:bold;' : '';
        div.innerHTML = `<span class="cell-icon">${isBlocked && unit.alive && isResting && !(unit.isZhang && unit.rangedForm) && !isDead ? '😴' : roleIcon}</span><div class="cell-info"><span class="cell-name ${unit.isZhang?'gold':''}">${unit.name}${buffIcons ? ' ' + buffIcons : ''}</span><span class="cell-stats">攻<span style="${atkStyle}">${displayAtk}</span> 防<span style="${defStyle}">${displayDef}</span> <span class="${hpColorClass}" style="${hpStyle}">血${Math.floor(unit.hp)}</span></span></div><div class="hp-bar-wrap"><div class="hp-bar-inner" id="hpbar-${unit.uid}" style="height:${hpPct}%;background:${barColor};transition:none;"></div></div>`;
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
            if (unit) openDetailPopup(unit, team, activeBuffs, doubleStrikeUid);
        });
        grid.appendChild(div);
    }
}

export function updateUI(UI, oldUI) {
    let oldAlly = oldUI ? oldUI.allyTeam : null;
    let oldEnemy = oldUI ? oldUI.enemyTeam : null;
    renderGrid('enemyGrid', UI.enemyTeam, 'enemy', window._debugMode || false, oldEnemy);
    renderGrid('allyGrid', UI.allyTeam, 'ally', window._debugMode || false, oldAlly);
}

export function spawnVictoryEffects(winnerCamp) {
    let gridId = winnerCamp==='明教'?'allyGrid':'enemyGrid', grid = document.getElementById(gridId);
    grid.classList.add('victory-border');
    let cells = grid.children;
    let displayOrder = winnerCamp==='明教'?[1,2,3,4,5,6,7,8,9]:[7,8,9,4,5,6,1,2,3];
    let UI = window._getPlayerContext ? window._getPlayerContext().UI : null;
    if (!UI) return;
    for (let i=0;i<cells.length;i++) { let pos = displayOrder[i]; let unit = winnerCamp==='明教'?UI.allyTeam.find(c=>c.pos===pos):UI.enemyTeam.find(c=>c.pos===pos); if (unit && unit.alive) cells[i].classList.add('cell-cheer'); }
    let centerCell = grid.children[4], rect = centerCell?centerCell.getBoundingClientRect():grid.getBoundingClientRect();
    document.body.classList.add('shake'); setTimeout(()=>document.body.classList.remove('shake'),500);
    let banner = document.createElement('div'); banner.className='victory-banner'; banner.textContent='🏆 胜利 🏆'; banner.style.top=Math.max(5,rect.top-12)+'px'; banner.style.left=(rect.left+rect.width/2)+'px'; document.body.appendChild(banner);
    setTimeout(()=>{if(banner.parentNode)banner.parentNode.removeChild(banner);},8000);
    let winUnits = winnerCamp==='明教'?UI.allyTeam:UI.enemyTeam;
    let aliveUnits = winUnits.filter(u => u.alive);
    let cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
    let colors=['#ffd700','#ff6b6b','#51cf66','#45a7ff','#ff9f43','#ff00ff'];
    for(let i=0;i<60;i++){let particle=document.createElement('div');particle.className='party-particle';let angle=Math.random()*Math.PI*2,dist=40+Math.random()*80;particle.style.setProperty('--dx',Math.cos(angle)*dist+'px');particle.style.setProperty('--dy',Math.sin(angle)*dist+'px');particle.style.left=cx+'px';particle.style.top=cy+'px';particle.style.background=colors[Math.floor(Math.random()*colors.length)];document.body.appendChild(particle);setTimeout(()=>{if(particle.parentNode)particle.parentNode.removeChild(particle);},2800);}
    for(let i=0;i<15;i++){let star=document.createElement('div');star.className='star-particle';let angle=Math.random()*Math.PI*2,dist=30+Math.random()*50;star.style.setProperty('--dx',Math.cos(angle)*dist+'px');star.style.setProperty('--dy',Math.sin(angle)*dist+'px');star.style.left=cx+'px';star.style.top=cy+'px';star.textContent=['⭐','🌟','✨'][Math.floor(Math.random()*3)];document.body.appendChild(star);setTimeout(()=>{if(star.parentNode)star.parentNode.removeChild(star);},3300);}
    let logDiv=document.getElementById('log'),winColor=winnerCamp==='明教'?'blue':'orange';logDiv.innerHTML+=`<span class="gold">🎉🏆 <span class="${winColor}">${winnerCamp}</span>获得最终胜利！ 🏆🎉</span><br>`;logDiv.scrollTop=logDiv.scrollHeight;
}

export function clearLogExceptFirst() { let logDiv = document.getElementById('log'), children = logDiv.children; while (children.length > 1) logDiv.removeChild(children[1]); let calibrator = document.createElement('div'); calibrator.style.display = 'block'; calibrator.innerHTML = ''; logDiv.appendChild(calibrator); }