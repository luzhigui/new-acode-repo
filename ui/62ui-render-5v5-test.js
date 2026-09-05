// V5.5.1 | 2026-08-17 格子渲染下沉 render/32
export const VER = 'ui/62ui-render-5v5-test.js V5.5.1';

import { getSkillDesc } from '../core/01config-5v5-test.js';
import { getAuraBonuses } from '../core/03battle-utils.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { BUFF_TYPES, CAMP_TYPES } from '../infra/56-battle-enums.js';
import {
    renderGrid,
    updateGridUI,
    setGridStore,
    setGridRenderCtx,
    getBuffStats,
    getDodgeBreakdown,
    isUnitBenefitedByBuff
} from '../render/32-grid-render.js';

export { getBuffStats, getDodgeBreakdown, isUnitBenefitedByBuff };
import { showDanmaku as _showDanmaku } from '../fx/80fx-common-5v5-test.js';
const showDanmaku = (...args) => { if (typeof _showDanmaku === 'function') return _showDanmaku(...args); };

export function stripTags(html) { let div = document.createElement('div'); div.innerHTML = html; return div.textContent || ''; }

// 兼容旧调用（保留）
export { renderGrid, updateGridUI as updateUI };
export function setRenderStore(store) {
    setGridStore(store);
    if (store === null) GlobalStore.set('battleStore', null);
}

function getCtx() {
    return window._getPlayerContext ? window._getPlayerContext() : null;
}



// 详情弹窗
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
window.openDetailPopup = openDetailPopup;

function renderAtkDetail(u, buffStats, ctx) {
    let initAtk = u.state._initAtk !== undefined ? u.state._initAtk : u.atk;
    let holyAtkBonus = Math.floor(initAtk * buffStats.atkBonus);
    let carryAtk = u.state._carryAtkBonus || 0;
    let butterflyAtk = u.state._butterflyAtkBonus || 0;
    let finalAtk = u.atk;
    let permChange = finalAtk - initAtk - holyAtkBonus - carryAtk - butterflyAtk;
    let parts = [String(initAtk)];
    if (permChange > 0) parts.push(`<span style="color:#2e7d32;">+${permChange}永</span>`);
    else if (permChange < 0) parts.push(`<span style="color:#c0392b;">${permChange}永</span>`);
    if (butterflyAtk > 0) parts.push(`<span style="color:#daa520;">+${butterflyAtk}附身</span>`);
    if (holyAtkBonus > 0) parts.push(`<span style="color:#ff8c00;">+${holyAtkBonus}临</span>`);
    if (carryAtk > 0) parts.push(`<span style="color:#ff8c00;">+${carryAtk}临</span>`);
    const enemyTeamForAura = ctx.UI.enemyTeam || [];
    const allyTeamForAura = ctx.UI.allyTeam || [];
    const auraSideA = u.camp === CAMP_TYPES.ALLY ? allyTeamForAura : enemyTeamForAura;
    const auraSideB = u.camp === CAMP_TYPES.ALLY ? enemyTeamForAura : allyTeamForAura;
    const aura = getAuraBonuses(u, auraSideA, auraSideB);
    if (aura.emptyCol > 0) parts.push(`<span style="color:#ff8c00;">+${aura.emptyCol}光环</span>`);
    if (aura.bloodAura > 0) parts.push(`<span style="color:#ff8c00;">+${aura.bloodAura}光环</span>`);
    if (parts.length === 1) return parts[0];
    return parts.join(' ') + ' = <span style="color:#daa520;font-weight:bold;">' + finalAtk + '</span>';
}

function renderDefDetail(u, buffStats) {
    let initDef = u.state._initDef !== undefined ? u.state._initDef : u.def;
    let holyDefBonus = Math.floor(initDef * buffStats.defBonus);
    let carryDef = u.state._carryDefBonus || 0;
    let butterflyDef = u.state._butterflyDefBonus || 0;
    let fortifyStacks = u.state._fortifyStacks || 0;
    let fortifyDef = fortifyStacks;
    let finalDef = Math.round(u.def);
    let permChange = finalDef - Math.round(initDef) - holyDefBonus - carryDef - butterflyDef - fortifyDef;
    let parts = [String(Math.round(initDef))];
    if (permChange > 0) parts.push(`<span style="color:#2e7d32;">+${permChange}永</span>`);
    else if (permChange < 0) parts.push(`<span style="color:#c0392b;">${permChange}永</span>`);
    if (butterflyDef > 0) parts.push(`<span style="color:#daa520;">+${butterflyDef}附身</span>`);
    if (holyDefBonus > 0) parts.push(`<span style="color:#ff8c00;">+${holyDefBonus}临</span>`);
    if (carryDef > 0) parts.push(`<span style="color:#ff8c00;">+${carryDef}临</span>`);
    if (fortifyDef > 0) parts.push(`<span style="color:#ff8c00;">+${fortifyDef}坚盾(${fortifyStacks}层)</span>`);
    if (parts.length === 1) return parts[0];
    return parts.join(' ') + ' = <span style="color:#daa520;font-weight:bold;">' + finalDef + '</span>';
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
    const buffStats = getBuffStats(u);
    let allyTeam = ctx.UI.allyTeam || [];
    let activeBuffs = ctx.activeBuffs || [];
    let doubleStrikeUid = ctx.currentDoubleStrikeUid;
    let holyFlameBuffs = activeBuffs.filter(b => {
        if (b.key !== BUFF_TYPES.HOLY_FLAME) return false;
        const cols = b.cols || (b.col != null ? [b.col] : []);
        const rows = b.rows || (b.row != null ? [b.row] : []);
        const unitCol = (u.pos - 1) % 3 + 1;
        const unitRow = Math.ceil(u.pos / 3);
        return cols.includes(unitCol) || rows.includes(unitRow);
    });
    let unitBuffs = activeBuffs.filter(b => b.key !== BUFF_TYPES.HOLY_FLAME && isUnitBenefitedByBuff(u, b.key, allyTeam, doubleStrikeUid, activeBuffs));
    if (holyFlameBuffs.length > 0) {
        unitBuffs.push({ key: BUFF_TYPES.HOLY_FLAME, name: '圣火令', icon: '🔥', remaining: holyFlameBuffs[0].remaining });
    }
    let buffText = '无';
    let masteryText = '';
    if (u.isXiaoZhaoSister || u.isXiaoZhaoBrother) {
        const perms = u.state._permanentBuffs || [];
        buffText = perms.length > 0 ? perms.map(b => b.name).join('、') : '无';
        const mastered = u.state._masteredRoles || [];
        masteryText = mastered.length > 0 ? `<span style="color:#888;">精通</span><span>${mastered.join('、')}（${mastered.length}/4，+${mastered.length * 2}攻+${mastered.length * 3}防+${(mastered.length * 12.5).toFixed(1)}血）</span>` : '';
    } else if (unitBuffs.length > 0) {
        buffText = unitBuffs.map(b => `${b.name}(${b.remaining}回)`).join('、');
    }
    let atkBonusVal = Math.floor(u.atk * u.buffAtkBonus);
    let defBonusVal = Math.floor(u.def * u.buffDefBonus);
    let hpBonusVal = Math.floor(u.maxHp * u.buffHpBonus);
    let butterflyHpBonus = u.state._butterflyHpBonus || 0;
    if (butterflyHpBonus > 0) {
        hpStyle = 'color:#daa520;font-weight:bold;';
    }
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
            <span style="color:#888;">闪避</span><span>${(() => { const db = getDodgeBreakdown(u, activeBuffs, allyTeam); return db.combined + '%' + (db.sources.length > 0 ? ' (' + db.sources.map(s => s.label + '+' + s.value + '%').join(' ') + ')' : ''); })()}</span>
            <span style="color:#888;">攻击</span><span>${renderAtkDetail(u, buffStats, ctx)}</span>
            <span style="color:#888;">防御</span><span>${renderDefDetail(u, buffStats)}</span>
            <span style="color:#888;">造成伤害</span><span>${u.dmgDealt || 0}</span>
            <span style="color:#888;">承受伤害</span><span>${u.dmgTaken || 0}</span>
            <span style="color:#888;">治疗</span><span>${u.healDone || 0}</span>
            <span style="color:#888;">闪避次数</span><span>${u.dodgeCount || 0}</span>
            <span style="color:#888;">暴击次数</span><span>${u.critCount || 0}</span>
            <span style="color:#888;">Buff</span><span>${buffText}</span>
            ${masteryText}
            ${(() => {
                let skills = [];
                if (u.name === '张无忌') skills = [
                    getSkillDesc('张无忌', 'nineYang'),
                    getSkillDesc('张无忌', 'qianKun'),
                    getSkillDesc('张无忌', 'nearSwitch')
                ];
                else if (u.name === '韦一笑') skills = [
                    getSkillDesc('韦一笑', 'coldPalm'),
                    getSkillDesc('韦一笑', 'bloodDodge')
                ];
                else if (u.name === '宋青书') {
                    skills = [
                        `💥 ${getSkillDesc('宋青书', 'rebelStrike', false)}`,
                        `💪 ${getSkillDesc('宋青书', 'kuLian', false)}`,
                        `💒 ${getSkillDesc('宋青书', 'xinHun', false)}`,
                        `💗 ${getSkillDesc('宋青书', 'xingFen', false)}`
                    ];
                }
                else if (u.name === '周芷若') {
                    const descNormal = getSkillDesc('周芷若', 'nineYinClaw', false);
                    const descJealous = getSkillDesc('周芷若', 'nineYinClaw', true);
                    skills = [`🐾 ${descNormal}（无忌在场：${descJealous}），可连锁`];
                }
                else if (u.name === '成昆') skills = [
                    `💥 ${getSkillDesc('成昆', 'phantomThunder')}`,
                    `🌀 ${getSkillDesc('成昆', 'phantomDisguise')}`
                ];
                else if (u.name === '鹿杖客') skills = [
                    `❄️ ${getSkillDesc('鹿杖客', 'xuanmingPalm')}`,
                    '🔗 联动鹤笔翁：攻击后鹤笔翁立刻攻击同一目标'
                ];
                else if (u.name === '鹤笔翁') skills = [
                    `🦌 ${getSkillDesc('鹤笔翁', 'hornStrike')}`,
                    '🔗 联动鹿杖客：攻击后鹿杖客立刻攻击同一目标'
                ];
                else if (u.isXiaoZhaoSister) skills = [
                    `🦋 ${getSkillDesc('小昭', 'butterflyAttach')}`,
                    `🦋 ${getSkillDesc('小昭', 'qianKunDerived')}`,
                    `🛡️ ${getSkillDesc('小昭', 'qianKunUpgraded')}`,
                    `♾️ ${getSkillDesc('小昭', 'permanentHex')}`
                ];
                else if (u.isXiaoZhaoBrother) skills = [
                    `🕷️ ${getSkillDesc('小昭', 'spiderTransform')}`,
                    `🕷️ ${getSkillDesc('小昭', 'spiderFly')}`,
                    `🛡️ ${getSkillDesc('小昭', 'qianKunUpgraded')}`,
                    `♾️ ${getSkillDesc('小昭', 'permanentHex')}`,
                    `🏆 ${getSkillDesc('小昭', 'mastery')}`
                ];
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

// 胜利特效
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
    const winColorClass = winnerCamp === '明教' ? 'blue' : 'orange';
    sortedAlive.forEach((u, index) => {
        const taunt = WIN_TAUNTS[Math.floor(Math.random() * WIN_TAUNTS.length)];
        logDiv.innerHTML += `<span class="${winColorClass}">🗯️ ${u.name}：${taunt}</span><br>`;
        setTimeout(() => {
            requestAnimationFrame(() => {
                showDanmaku(u, taunt);
            });
        }, index * 600);
    });
    logDiv.innerHTML+=`<span class="gold">🎉🏆 <span class="${winColor}">${winnerCamp}</span>获得最终胜利！ 🏆🎉</span><br>`;logDiv.scrollTop=logDiv.scrollHeight;
}

// 日志清除
export function clearLogExceptFirst() { let logDiv = document.getElementById('log'), children = logDiv.children; while (children.length > 1) logDiv.removeChild(children[1]); let calibrator = document.createElement('div'); calibrator.style.display = 'block'; calibrator.innerHTML = ''; logDiv.appendChild(calibrator); }