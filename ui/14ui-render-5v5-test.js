﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// ui/14ui-render-5v5-test.js - 光明顶5v5 UI渲染模块（响应式版）
// V5.2.1 | ~18500 bytes | 2026-07-11 数据驱动渲染，移除魔数清理
export const VER = 'ui/14ui-render-5v5-test.js V5.2.1';

import { CONFIG } from '../core/01config-5v5-test.js';
import { rand } from '../core/03battle-utils.js';
import { computeBuffStats } from '../core/04buff-system.js';
import { getUnitCol, getUnitRow } from '../core/03battle-utils.js';
import { showDanmaku as _showDanmaku } from '../fx/15fx-common-5v5-test.js';
const showDanmaku = (...args) => { if (typeof _showDanmaku === 'function') return _showDanmaku(...args); };

export function stripTags(html) { let div = document.createElement('div'); div.innerHTML = html; return div.textContent || ''; }

// ==================== 响应式 Store 引用 ====================
let _store = null;
let _subscribed = false;
function getStore() {
    if (!_store) {
        if (GlobalStore.get('battleStore')) _store = GlobalStore.get('battleStore');
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
    // 正确统计所有覆盖该单位的圣火令
    let holyFlameBuffs = activeBuffs.filter(b => {
        if (b.key !== 'holyFlame') return false;
        const cols = b.cols || (b.col != null ? [b.col] : []);
        const rows = b.rows || (b.row != null ? [b.row] : []);
        const unitCol = (u.pos - 1) % 3 + 1;
        const unitRow = Math.ceil(u.pos / 3);
        return cols.includes(unitCol) || rows.includes(unitRow);
    });
    let unitBuffs = activeBuffs.filter(b => b.key !== 'holyFlame' && isUnitBenefitedByBuff(u, b.key, allyTeam, doubleStrikeUid, activeBuffs));
    if (holyFlameBuffs.length > 0) {
        // 把圣火令加进去，让它在弹窗的Buff列表里显示出来
        unitBuffs.push({ key: 'holyFlame', name: '圣火令', icon: '🔥', remaining: holyFlameBuffs[0].remaining });
    }
    let buffText = '无';
    let masteryText = '';
    if (u.isXiaoZhaoSister || u.isXiaoZhaoBrother) {
        // 小昭：显示永久海克斯列表
        const perms = u._permanentBuffs || [];
        buffText = perms.length > 0 ? perms.map(b => b.name).join('、') : '无';
        // 精通进度
        const mastered = u._masteredRoles || [];
        masteryText = mastered.length > 0 ? `<span style="color:#888;">精通</span><span>${mastered.join('、')}（${mastered.length}/4，+${mastered.length * 2}攻+${mastered.length * 3}防+${(mastered.length * 12.5).toFixed(1)}血）</span>` : '';
    } else if (unitBuffs.length > 0) {
        buffText = unitBuffs.map(b => `${b.name}(${b.remaining}回)`).join('、');
    }
    let buffStats = computeBuffStats(u, activeBuffs, allyTeam);
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
            <span style="color:#888;">攻击</span><span>${(() => {
                let initAtk = u._initAtk !== undefined ? u._initAtk : u.atk;
                let holyAtkBonus = Math.floor(initAtk * buffStats.atkBonus);
                let carryAtk = u._carryAtkBonus || 0;
                let butterflyAtk = u._butterflyAtkBonus || 0;
                let finalAtk = u.atk;
                let permChange = finalAtk - initAtk - holyAtkBonus - carryAtk - butterflyAtk;
                let parts = [String(initAtk)];
                if (permChange > 0) parts.push(`<span style="color:#daa520;">+${permChange}永</span>`);
                else if (permChange < 0) parts.push(`<span style="color:#c0392b;">${permChange}永</span>`);
                if (holyAtkBonus > 0) parts.push(`<span style="color:#daa520;">+${holyAtkBonus}圣火令</span>`);
                if (carryAtk > 0) parts.push(`<span style="color:#daa520;">+${carryAtk}carry</span>`);
                if (butterflyAtk > 0) parts.push(`<span style="color:#daa520;">+${butterflyAtk}附身</span>`);
                if (parts.length === 1) return parts[0];
                return parts.join(' ') + ' = <span style="color:#daa520;font-weight:bold;">' + finalAtk + '</span>';
            })()}</span>
            <span style="color:#888;">防御</span><span>${(() => {
                let initDef = u._initDef !== undefined ? u._initDef : u.def;
                let holyDefBonus = Math.floor(initDef * buffStats.defBonus);
                let carryDef = u._carryDefBonus || 0;
                let butterflyDef = u._butterflyDefBonus || 0;
                let fortifyStacks = u._fortifyStacks || 0;
                let fortifyDef = fortifyStacks * 0.5;
                let finalDef = Math.round(u.def);
                let permChange = finalDef - Math.round(initDef) - holyDefBonus - carryDef - butterflyDef - fortifyDef;
                let parts = [String(Math.round(initDef))];
                if (permChange > 0) parts.push(`<span style="color:#daa520;">+${permChange}永</span>`);
                else if (permChange < 0) parts.push(`<span style="color:#c0392b;">${permChange}永</span>`);
                if (holyDefBonus > 0) parts.push(`<span style="color:#daa520;">+${holyDefBonus}圣火令</span>`);
                if (carryDef > 0) parts.push(`<span style="color:#daa520;">+${carryDef}carry</span>`);
                if (butterflyDef > 0) parts.push(`<span style="color:#daa520;">+${butterflyDef}附身</span>`);
                if (fortifyDef > 0) parts.push(`<span style="color:#daa520;">+${fortifyDef}坚盾(${fortifyStacks}层)</span>`);
                if (parts.length === 1) return parts[0];
                return parts.join(' ') + ' = <span style="color:#daa520;font-weight:bold;">' + finalDef + '</span>';
            })()}</span>
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
                else if (u.name === '宋青书') skills = [`💥 叛逆突袭：优先攻击血量最高目标，附加目标当前生命${Math.round((CONFIG.ELITE_SKILLS.rebelStrike.currentHpRatio || 0.12) * 100)}%真实伤害`, `💪 苦练：场上无周芷若时最先行动；行动前全体队友+${CONFIG.ELITE_SKILLS.kuLian.atkBonus}攻+${CONFIG.ELITE_SKILLS.kuLian.defBonus}防+${CONFIG.ELITE_SKILLS.kuLian.hpBonus}生命上限，自身翻倍`, `💒 新婚：攻击扣除周芷若${CONFIG.ELITE_SKILLS.xinHun.hpDeduct}血，叠快乐层（${(CONFIG.ELITE_SKILLS.xinHun.healLevels || []).map(p => Math.round(p * 100) + '%').join('→')}）`, '💗 性奋：周芷若在场时攻击后可再次行动；每次攻击后减少递增生命上限'];
                else if (u.name === '周芷若') skills = ['🐾 九阴白骨爪：基础1+已损失1%+最大1%追击，≤12%斩杀（无忌在场：基础2+1.5%+2%，≤15%斩杀），可连锁'];
                else if (u.name === '成昆') skills = ['💥 混元霹雳劲：附加已损失生命30%的真实伤害', '🌀 幻影伪装：攻击后模仿对方单位并回复已损失30%生命；对方攻击时30%概率混乱，每损失10%生命+6%'];
                else if (u.name === '鹿杖客') skills = ['❄️ 玄冥神掌：中毒每回合损失4%→2%→1%→消失', '🔗 联动鹤笔翁：攻击后鹤笔翁立刻攻击同一目标'];
                else if (u.name === '鹤笔翁') skills = ['🦌 鹿角杖法：忽略30%防御，中毒目标伤害+30%', '🔗 联动鹿杖客：攻击后鹿杖客立刻攻击同一目标'];
                else if (u.isXiaoZhaoSister) skills = ['🦋 蝶变附身：明教首次攻击前，附身到4号位后最近队友，转移一半攻/防/血，自身血量按队友比例调整', '🦋 乾坤衍生：张无忌不在时，队友受伤触发减伤、治疗和攻击加成', '🛡️ 乾坤大挪移（升级）：张无忌在场时，全队减伤30%并反弹20%伤害（无忌自伤10%）', '♾️ 永久海克斯：团队海克斯消失后，单独续上效果'];
                else if (u.isXiaoZhaoBrother) skills = ['🕷️ 蛛变：每回合随机变换职业，记录精通，+5血上限', '🕷️ 飞天：首次受击/血量<70%/血量<40%触发，化为小蜘蛛（0攻/10*精通防/30*精通血），反伤精通*5，回合结束落下攻击随机敌人（穿透+精通*10）', '🛡️ 乾坤大挪移（升级）：张无忌在场时，全队减伤30%并反弹20%伤害（无忌自伤10%）', '♾️ 记忆海克斯：团队海克斯消失后，单独续上效果', '🏆 精通：每精通一个职业+1.5攻+2防+10血上限（最多4职业，额外+一次）'];
                else if (u.isXiaoZhao) skills = ['🦋 蝶变：每回合随机变换职业，记录精通，+5血上限', '✨ 乾坤大挪移（衍生）：张无忌不在时，队友受伤触发减伤、治疗和攻击加成', '🛡️ 乾坤大挪移（升级）：张无忌在场时，全队减伤30%并反弹20%伤害（无忌自伤10%）', '♾️ 永久海克斯：团队海克斯消失后，小昭单独续上效果', '🏆 精通：每精通一个职业+2攻+3防+12.5血上限（最多4职业，额外+一次）'];
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
                if (unit._flyMode === 'fly') {
                    div.style.background = 'transparent';
                    div.style.border = '2px solid transparent';
                    div.style.boxShadow = 'none';
                } else if (unit._flyMode === 'ghost') {
                    let roleIcon = unit.role==='战士'?'⚔️':(unit.role==='防战'?'🛡️':(unit.role==='远程'?'🏹':'🦅'));
                    div.innerHTML = `<span class="cell-icon">${roleIcon}</span><div class="cell-info"><span class="cell-name">${unit.name}</span><span class="cell-stats">攻${Math.floor(unit.atk)} 防${Math.floor(unit.def)} 血${Math.floor(unit.hp)}</span></div>`;
                    div.style.opacity = '0.5';
                    div.style.background = 'rgba(30,100,255,0.28)';
                    div.style.border = '2px solid rgba(100,150,255,0.6)';
                    div.style.boxShadow = '0 0 12px rgba(100,150,255,0.5)';
                } else if (unit._flyMode === 'butterfly') {
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
                } else if (unit._flyMode === 'spider') {
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
        let hasFlash = !!unit._flash;
        let isDead = (unit._flash==='dead' || !unit.alive || unit._isDead);
        let isBlocked = unit._blocked || false;
        let isResting = unit._resting || false;
        let isStunned = unit._stunned || false;

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
        if (unit.isXiaoZhaoSister) displayName += '·姊';
        if (unit.isXiaoZhaoBrother) displayName += '·妹';
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
        let defBonusVal = Math.floor((latestUnit._baseDef || latestUnit.def) * buffStats.defBonus);
        let hpBonusVal = Math.floor(latestUnit.maxHp * buffStats.hpBonus);
        let displayAtk = Math.round(latestUnit.atk + (latestUnit._carryAtkBonus || 0) + atkBonusVal);
        let initAtk = latestUnit._initAtk !== undefined ? latestUnit._initAtk : latestUnit.atk;
        let totalChange = displayAtk - initAtk;
        let atkDisplayHtml = `${displayAtk}`;
        if (totalChange > 0) {
            atkDisplayHtml = `<span style="color:#daa520;font-weight:bold;">${displayAtk}</span>`;
        } else if (totalChange < 0) {
            atkDisplayHtml = `<span style="color:#c0392b;font-weight:bold;">${displayAtk}</span>`;
        }
        let displayDef = Math.round(latestUnit.def + defBonusVal);
        let initDef = latestUnit._initDef !== undefined ? Math.round(latestUnit._initDef) : Math.round(latestUnit.def);
        let totalDefChange = displayDef - initDef;
        let defDisplayHtml = `${displayDef}`;
        if (totalDefChange > 0) {
            defDisplayHtml = `<span style="color:#daa520;font-weight:bold;">${displayDef}</span>`;
        } else if (totalDefChange < 0) {
            defDisplayHtml = `<span style="color:#c0392b;font-weight:bold;">${displayDef}</span>`;
        }
        let hpPct = unit.alive ? Math.floor((unit.hp / unit.maxHp) * 100) : 0;
        let hpColorClass = hpPct>70?'hp-text-green':(hpPct>40?'hp-text-orange':'hp-text-red');
        let barColor = hpPct>70?'#4caf50':(hpPct>40?'#ff9800':'#f44336');
        let hpDisplayHtml = `${Math.floor(unit.hp)}`;
        if (hpBonusVal > 0 || (latestUnit._baseMaxHp !== undefined && latestUnit.maxHp > latestUnit._baseMaxHp)) {
            hpDisplayHtml = `<span style="color:#daa520;font-weight:bold;">${Math.floor(unit.hp)}</span>`;
        }
        let readyClass = (!hasFlash && !unit._acted && unit.alive && !isDead) ? 'ready' : '';
        let actedClass = (!hasFlash && unit._acted && unit.alive && !isDead) ? 'acted' : '';
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
            // 成昆幻影伪装闪烁效果
            div.style.animation = 'phantomFlash 0.4s ease-in-out 2';
            setTimeout(() => {
                div.style.animation = '';
                delete unit._phantomFlash;
            }, 800);
        }
        if (unit.isHorse && unit.alive && !unit._isDead && !unit._horseSpawned) {
            unit._horseSpawned = true;
            requestAnimationFrame(() => createHorseSpawnAnim(div));
        }
        let buffIcons = '';
        if (ctx && camp === 'ally') {
            // 统计所有 Buff 的图标，依靠 activeBuffs 自身的正确性
            let iconMap = {};
            activeBuffs.forEach(b => {
                let info = CONFIG.BUFFS ? CONFIG.BUFFS[b.key] : null;
                if (info && info.icon && isUnitBenefitedByBuff(unit, b.key, allyTeam, doubleStrikeUid, activeBuffs)) {
                    iconMap[info.icon] = (iconMap[info.icon] || 0) + 1;
                }
            });
            buffIcons = Object.entries(iconMap).map(([icon, count]) => {
                return icon + (count > 1 ? 'x' + count : '');
            }).join('');
        }
        let atkStyle = atkBonusVal > 0 ? 'color:#daa520;font-weight:bold;' : '';
        let defStyle = (defBonusVal > 0 || (latestUnit._fortifyStacks || 0) > 0) ? 'color:#daa520;font-weight:bold;' : '';
        let hpStyle = hpBonusVal > 0 ? 'color:#daa520;font-weight:bold;' : '';
        let eliteSkillIcon = (unit.name === '周芷若' && unit._hasKuaiLe) ? ' 💖' : (unit.name === '宋青书' && unit._hasXingFen) ? ' 💗' : (unit.isXiaoZhaoSister ? ' 🦋' : (unit.isXiaoZhaoBrother ? ' 🕷️' : (unit.isXiaoZhao ? ' 🦋' : '')));
        // 如果这个单位是小昭·姊的附身宿主，名字后面加蝴蝶
        if (!eliteSkillIcon) {
            const sisterHost = allyTeam.find(a => a.isXiaoZhaoSister && a.alive && a._butterflyHost === unit.uid);
            if (sisterHost) eliteSkillIcon = ' 🦋';
        }
        if (unit.name === '成昆' && unit._phantomTarget) eliteSkillIcon += ' 🎭';
        if (unit._xuanmingPoison && unit._xuanmingPoison.remaining > 0) eliteSkillIcon += ' ❄️';
        div.innerHTML = `<span class="cell-icon">${isBlocked && unit.alive && isResting && !(unit.isZhang && unit.rangedForm) && !isDead ? '😴' : roleIcon}</span><div class="cell-info"><span class="cell-name ${displayIsZhang?'gold':''}">${displayName}${eliteSkillIcon}${buffIcons ? ' ' + buffIcons : ''}</span><span class="cell-stats">攻<span style="${atkStyle}">${atkDisplayHtml}</span> 防<span style="${defStyle}">${defDisplayHtml}</span> <span class="${hpColorClass}" style="${hpStyle}">血${hpDisplayHtml}</span></span></div><div class="hp-bar-wrap"><div class="hp-bar-inner" id="hpbar-${unit.uid}" style="height:${hpPct}%;background:${barColor};transition:height 0.4s ease, background 0.4s ease;"></div></div>`;
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
    const winColorClass = winnerCamp === '明教' ? 'blue' : 'orange';
    sortedAlive.forEach((u, index) => {
        const taunt = WIN_TAUNTS[rand(0, WIN_TAUNTS.length - 1)];
        // 立即写入日志，确保复制时不被遗漏
        logDiv.innerHTML += `<span class="${winColorClass}">🗯️ ${u.name}：${taunt}</span><br>`;
        setTimeout(() => {
            requestAnimationFrame(() => {
                showDanmaku(u, taunt);
            });
        }, index * 600);
    });
    logDiv.innerHTML+=`<span class="gold">🎉🏆 <span class="${winColor}">${winnerCamp}</span>获得最终胜利！ 🏆🎉</span><br>`;logDiv.scrollTop=logDiv.scrollHeight;
}

// ==================== 日志清除 ====================
export function clearLogExceptFirst() { let logDiv = document.getElementById('log'), children = logDiv.children; while (children.length > 1) logDiv.removeChild(children[1]); let calibrator = document.createElement('div'); calibrator.style.display = 'block'; calibrator.innerHTML = ''; logDiv.appendChild(calibrator); }