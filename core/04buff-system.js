// core/04buff-system.js - 光明顶5v5 Buff系统
// V5.4.0 | ~28700 bytes| 2026-07-28 海克斯效果迁移至事件总线
export const VER = 'core/04buff-system.js V5.4.0';
import {
    applyFortifyDef_Normal, applyFortifyDef_Sister, applyFortifyDef_Brother,
    applyCloudBodyDodge_Normal, applyCloudBodyDodge_Sister, applyCloudBodyDodge_Brother,
    applyHolyFlame_Normal, applyHolyFlame_Sister, applyHolyFlame_Brother,
    calcCarryBonus_Normal, calcCarryBonus_Sister,
    applyMindControl_Normal, applyMindControl_Sister
} from './14buff-effects.js';
import { CONFIG } from './01config-5v5-test.js';
import { hasBuff, getUnitRow, getUnitCol, getAdjacentPositions } from './03battle-utils.js';
import { emitEvent, applyStatChange, applyMaxHpChange, query, getBattleRng } from './13battle-shared.js';
import { EXECUTION_LAYER as L } from './00-event-bus.js';
import { processUnitAttack } from './10battle-attack.js';
const C = CONFIG;

/**
 * 圣火令绝对值加成（独立于Carry）
 */
export function applyHolyFlameBonus(unit, activeBuffs) {
    unit._holyAtkBonus = 0;
    unit._holyDefBonus = 0;
    if (!activeBuffs || unit.camp !== 'ally') return;
    const holyFlameBuff = activeBuffs.find(b => b.key === 'holyFlame');
    if (!holyFlameBuff) return;
    const cols = holyFlameBuff.cols || (holyFlameBuff.col != null ? [holyFlameBuff.col] : []);
    const rows = holyFlameBuff.rows || (holyFlameBuff.row != null ? [holyFlameBuff.row] : []);
    const baseAtk = unit._baseAtk || unit.atk;
    const baseDef = unit._baseDef || unit.def;
    if (cols.includes(getUnitCol(unit.pos))) unit._holyAtkBonus = Math.floor(baseAtk * C.BUFFS.holyFlame.atkBonus);
    if (rows.includes(getUnitRow(unit.pos))) unit._holyDefBonus = Math.floor(baseDef * C.BUFFS.holyFlame.defBonus);
}

/**
 * 严阵以待绝对值加成（独立于Carry）
 */
export function applyFortifyBonus(unit, activeBuffs) {
    unit._fortifyDefBonus = 0;
    if (unit.role !== '防战' || unit.camp !== 'ally') return;
    if (activeBuffs && activeBuffs.some(b => b.key === 'fortify')) {
        const baseDef = unit._baseDef || unit.def;
        unit._fortifyDefBonus = Math.floor(baseDef * C.BUFFS.fortify.defBonus);
    }
}

/**
 * 应用 carry 加成（绝对值），含激活和清除逻辑
 * @param {Unit} unit - 当前单位
 * @param {Unit[]} A - 己方存活单位
 * @param {object} state - 战斗状态，需包含 allAllies
 * @param {string[]} log - 日志数组
 * @param {object} stats - computeBuffStats 的返回值
 */
export function applyCarryBonus(unit, A, state, log, stats) {
    if (unit.camp !== 'ally') return;
    const activeBuffs = A._activeBuffs || [];
    const hasCarryActive = hasBuff(activeBuffs, 'carry');
    const sister = A.some(a => a.isXiaoZhaoSister && a.alive);
    const carryPositions = sister ? [4, 5, 6] : [5];

    if (hasCarryActive && carryPositions.includes(unit.pos) && unit._baseMaxHp !== undefined && !unit.isHorse && !unit.isXiaoZhaoSister && !unit.isXiaoZhaoBrother) {
        // carry 生效：先回到基础血上限，再叠加本次 carry 加成
        applyMaxHpChange(unit, unit._baseMaxHp, null, 'carry归位血上限');
        applyStatChange(unit, 'atk', (unit._baseAtk || unit.atk) + (unit._butterflyAtkBonus || 0) - unit.atk, null, 'carry归位');
        applyStatChange(unit, 'def', (unit._baseDef || unit.def) + (unit._butterflyDefBonus || 0) - unit.def, null, 'carry归位');

        const oldCarryAtk = unit._carryAtkBonus || 0;
        const oldCarryDef = unit._carryDefBonus || 0;
        unit._carryAtkBonus = Math.floor(stats.carryAtkAbs);
        unit._carryDefBonus = Math.floor(stats.carryDefAbs);
        unit._carryHpBonus = Math.floor(stats.carryHpAbs);

        const atkDelta = unit._carryAtkBonus - oldCarryAtk;
        const defDelta = unit._carryDefBonus - oldCarryDef;
        if (atkDelta !== 0) applyStatChange(unit, 'atk', atkDelta, null, 'carry激活');
        if (defDelta !== 0) applyStatChange(unit, 'def', defDelta, null, 'carry激活');

        if (unit._carryHpBonus) {
            let newMaxHp = Math.min(unit._baseMaxHp + unit._carryHpBonus, unit._baseMaxHp * 2);
            applyMaxHpChange(unit, newMaxHp, null, 'carry血上限提升');
        }

        if (stats.carryAtkAbs || stats.carryDefAbs || stats.carryHpAbs) {
            log.push({ type:'info', text:`<span class="gold">👑 carry：${unit.name} 获得队友属性加成 攻+${stats.carryAtkAbs} 防+${stats.carryDefAbs} 血上限+${stats.carryHpAbs}</span>` });
        }
    } else if (!unit.isHorse && !hasCarryActive && !unit.isXiaoZhaoSister && !unit.isXiaoZhaoBrother) {
        // carry 消失：清除加成，恢复基值
        if (carryPositions.includes(unit.pos) && (unit._carryAtkBonus || unit._carryDefBonus || unit._carryHpBonus)) {
            if (unit._carryHpBonus) applyMaxHpChange(unit, unit._baseMaxHp, null, 'carry清除血上限');
            const clearAtk = unit._carryAtkBonus || 0;
            const clearDef = unit._carryDefBonus || 0;
            unit._carryAtkBonus = 0;
            unit._carryDefBonus = 0;
            unit._carryHpBonus = 0;
            applyStatChange(unit, 'atk', -clearAtk, null, 'carry清除');
            applyStatChange(unit, 'def', -clearDef, null, 'carry清除');
        }
    }
}

export function computeBuffStats(unit, activeBuffs, allyTeam) {
    let atkBonus = 0, defBonus = 0, dodgeBonus = 0, hpBonus = 0;
    if (!activeBuffs) return { atkBonus, defBonus, dodgeBonus, hpBonus };

    // carry 加成是绝对值，单独返回
    let carryAtkAbs = 0, carryDefAbs = 0, carryHpAbs = 0;
    const hasCarry = hasBuff(activeBuffs, 'carry');
    if (hasCarry && unit.alive && allyTeam) {
        const hasSister = allyTeam.some(u => u.isXiaoZhaoSister && u.alive);
        if (hasSister) {
            const bonus = calcCarryBonus_Sister(unit, allyTeam);
            carryAtkAbs = bonus.atkAbs; carryDefAbs = bonus.defAbs; carryHpAbs = bonus.hpAbs;
        } else {
            const bonus = calcCarryBonus_Normal(unit, allyTeam);
            carryAtkAbs = bonus.atkAbs; carryDefAbs = bonus.defAbs; carryHpAbs = bonus.hpAbs;
        }
    }

    // ---- 严阵以待防御（比率） ----
    if (hasBuff(activeBuffs, 'fortify') && unit.role === '防战' && unit.camp === 'ally') {
        if (allyTeam && allyTeam.some(u => u.isXiaoZhaoSister && u.alive)) applyFortifyDef_Sister(unit, { defBonus });
        else applyFortifyDef_Normal(unit, { defBonus });
    } else if (unit.isXiaoZhaoBrother && query('xiaoPermanentActive', unit, activeBuffs, 'fortify') && unit.role === '防战') {
        applyFortifyDef_Brother(unit, { defBonus });
    }

    // ---- 流云身法闪避 ----
    if (hasBuff(activeBuffs, 'cloudBody') && unit.camp === 'ally') {
        if (allyTeam && allyTeam.some(u => u.isXiaoZhaoSister && u.alive)) applyCloudBodyDodge_Sister(unit, { dodgeBonus });
        else applyCloudBodyDodge_Normal(unit, { dodgeBonus });
    } else if (unit.isXiaoZhaoBrother && query('xiaoPermanentActive', unit, activeBuffs, 'cloudBody')) {
        applyCloudBodyDodge_Brother(unit, { dodgeBonus });
    }

    // ---- 小昭变身精通加成 ----
    let masteryAtkAbs = 0, masteryDefAbs = 0, masteryHpAbs = 0;
    if (unit.isXiaoZhaoBrother) {
        const mastery = query('butterflyMastery', unit);
        masteryAtkAbs = mastery.atk; masteryDefAbs = mastery.def; masteryHpAbs = mastery.hp;
    }

    // ---- 圣火令（比率） ----
    const holyFlameTeam = hasBuff(activeBuffs, 'holyFlame');
    if (holyFlameTeam) {
        if (allyTeam && allyTeam.some(u => u.isXiaoZhaoSister && u.alive)) applyHolyFlame_Sister(unit, allyTeam, activeBuffs, { atkBonus, defBonus });
        else applyHolyFlame_Normal(unit, allyTeam, activeBuffs, { atkBonus, defBonus });
    } else if (unit.isXiaoZhaoBrother && query('xiaoPermanentActive', unit, activeBuffs, 'holyFlame')) {
        applyHolyFlame_Brother(unit, allyTeam, activeBuffs, { atkBonus, defBonus });
    }

    return { atkBonus, defBonus, dodgeBonus, hpBonus, carryAtkAbs, carryDefAbs, carryHpAbs, masteryAtkAbs, masteryDefAbs, masteryHpAbs };
}

export function applyBuffEffectsBeforeAttack(unit, target, allyTeam, enemyTeam, log) {
    // 惑人心智已迁移至事件总线监听器 registerMindControl
}

export function applyBuffEffectsAfterAttack(unit, target, dmg, allySide, enemySide, log) {
    let unitBuffs = (unit.camp === 'ally' ? allySide._activeBuffs : enemySide._activeBuffs) || [];
    const hasSister = allySide.some(u => u.isXiaoZhaoSister && u.alive);
    const isBrother = unit.isXiaoZhaoBrother;

    // ---- 嗜血狂刀已迁移至事件总线 ----
    // ---- 热血奋战已迁移至事件总线 ----
    // ---- 乘风突袭已迁移至事件总线 ----
    // ---- 流星赶月已迁移至事件总线 ----

    // 严阵以待反弹已在 applyAttackResult（步骤4）中处理，此处不再重复
}

export function logBuffSummary(allyTeam, log, doubleStrikeUid) {
    let buffs = allyTeam._activeBuffs || [];
    const rng = getBattleRng();
    buffs.forEach(b => {
        switch (b.key) {
            case 'bloodthirst':
                let btUnits = allyTeam.filter(u => u.alive && u.role === '战士');
                if (btUnits.length > 0) log.push({type:'buff-summary', text:`<span class="gold">🗡️ 嗜血狂刀：${btUnits.map(u=>u.name).join('、')} 攻击吸血${Math.round(C.BUFFS.bloodthirst.leechRatio*100)}%</span>`, buffType:'buff_stat'});
                break;
            case 'hotBlood':
                let hbUnits = allyTeam.filter(u => u.alive);
                if (hbUnits.length > 0) log.push({type:'buff-summary', text:`<span class="gold">❤️ 热血奋战：${hbUnits.map(u=>u.name).join('、')} 攻击回血${Math.round(C.BUFFS.hotBlood.leechRatio*100)}%（每3次翻倍）</span>`, buffType:'buff_stat'});
                break;
            case 'fortify':
                let ftUnits = allyTeam.filter(u => u.alive && u.role === '防战');
                if (ftUnits.length > 0) log.push({type:'buff-summary', text:`<span class="gold">🛡️ 严阵以待：${ftUnits.map(u=>u.name).join('、')} 防御+${Math.round(C.BUFFS.fortify.defBonus*100)}% 反弹50%</span>`, buffType:'buff_stat'});
                break;
            case 'cloudBody':
                let cbUnits = allyTeam.filter(u => u.alive);
                if (cbUnits.length > 0) log.push({type:'buff-summary', text:`<span class="gold">💨 流云身法：${cbUnits.map(u=>u.name).join('、')} 闪避+${Math.round(C.BUFFS.cloudBody.dodgeBonus*100)}%</span>`, buffType:'buff_stat'});
                break;
            case 'windAssault':
                let waUnits = allyTeam.filter(u => u.alive && u.role === '飞行');
                if (waUnits.length > 0) log.push({type:'buff-summary', text:`<span class="gold">🦅 乘风突袭：${waUnits.map(u=>u.name).join('、')} 80%波及同行 60%击退（持续3回合）</span>`, buffType:'buff_stat'});
                break;
            case 'meteorShower':
                let msUnits = allyTeam.filter(u => u.alive && u.role === '远程');
                if (msUnits.length > 0) log.push({type:'buff-summary', text:`<span class="gold">☄️ 流星赶月：${msUnits.map(u=>u.name).join('、')} 伤害加深${Math.round(C.BUFFS.meteorShower.bonusRatio*100)}% 溅射${Math.round(C.BUFFS.meteorShower.splashRatio*100)}%（主箭降2防，小箭降1防）</span>`, buffType:'buff_stat'});
                break;
            case 'holyFlame': {
                const teamHolyBuffs = buffs.filter(b => b.key === 'holyFlame' && !b._xiaoZhao);
                const xiaoZhaoHolyBuffs = buffs.filter(b => b.key === 'holyFlame' && b._xiaoZhao);
                
                if (teamHolyBuffs.length > 0) {
                    for (const hb of teamHolyBuffs) {
                        const cols = hb.cols || (hb.col != null ? [hb.col] : [rng.nextInt(1, 3)]);
                        const rows = hb.rows || (hb.row != null ? [hb.row] : [rng.nextInt(1, 3), rng.nextInt(1, 3)]);
                        let colUnits = allyTeam.filter(u => u.alive && cols.includes(getUnitCol(u.pos)));
                        let rowUnits = allyTeam.filter(u => u.alive && u.camp === 'ally' && rows.includes(getUnitRow(u.pos)));
                        let atkNames = colUnits.map(u=>u.name).join('、') || '无';
                        let defNames = rowUnits.map(u=>u.name).join('、') || '无';
                        const colList = cols.join('、');
                        const rowList = rows.join('、');
                        log.push({type:'buff-summary', text:`<span class="gold">🔥 圣火令（团队）：第${colList}列(${atkNames})攻击+${Math.round(C.BUFFS.holyFlame.atkBonus*100)}%，第${rowList}行(${defNames})防御+${Math.round(C.BUFFS.holyFlame.defBonus*100)}%</span>`, buffType:'buff_stat'});
                    }
                }
                
                if (xiaoZhaoHolyBuffs.length > 0) {
                    for (const hb of xiaoZhaoHolyBuffs) {
                        const xzCols = hb.cols || (hb.col != null ? [hb.col] : [rng.nextInt(1, 3)]);
                        const xzRows = hb.rows || (hb.row != null ? [hb.row] : [rng.nextInt(1, 3), rng.nextInt(1, 3)]);
                        let colUnits = allyTeam.filter(u => u.alive && xzCols.includes(getUnitCol(u.pos)));
                        let rowUnits = allyTeam.filter(u => u.alive && u.camp === 'ally' && xzRows.includes(getUnitRow(u.pos)));
                        let atkNames = colUnits.map(u=>u.name).join('、') || '无';
                        let defNames = rowUnits.map(u=>u.name).join('、') || '无';
                        let xiaoZhaoLabel = '🦋 圣火令（小昭）';
                        const hasOverlap = colUnits.some(u => teamHolyBuffs.some(tb => {
                            const tcols = tb.cols || (tb.col != null ? [tb.col] : []);
                            return tcols.includes(getUnitCol(u.pos));
                        })) || rowUnits.some(u => teamHolyBuffs.some(tb => {
                            const trows = tb.rows || (tb.row != null ? [tb.row] : []);
                            return trows.includes(getUnitRow(u.pos));
                        }));
                        const suffix = hasOverlap ? '（部分单位受双重影响 → 圣火令×2）' : '';
                        const xzColList = xzCols.join('、');
                        const xzRowList = xzRows.join('、');
                        log.push({type:'buff-summary', text:`<span class="gold">${xiaoZhaoLabel}：第${xzColList}列(${atkNames})攻击+${Math.round(C.BUFFS.holyFlame.atkBonus*100)}%，第${xzRowList}行(${defNames})防御+${Math.round(C.BUFFS.holyFlame.defBonus*100)}%${suffix}</span>`, buffType:'buff_stat'});
                    }
                }
                break;
            }
            case 'doubleStrike':
                break;
            case 'mindControl':
                log.push({type:'buff-summary', text:`<span class="gold">🌀 惑人心智：最前排80%扰乱敌方换位，40%扰乱己方换位</span>`, buffType:'buff_stat'});
                break;
            case 'carry':
                let carryUnit = allyTeam.find(u => u.pos === 5 && u.alive);
                if (carryUnit) {
                    let fullAllies = GlobalStore.get('currentBattleState')?.ally || allyTeam;
                    let allAllies = fullAllies.filter(u => u.uid !== carryUnit.uid && !u.isHorse);
                    let aliveCount = allAllies.filter(a => a.alive).length;
                    let deadCount = allAllies.length - aliveCount;
                    let desc = `👑 你就是carry：${carryUnit.name} 获得队友属性加成（${aliveCount}人存活`;
if (deadCount > 0) desc += `，${deadCount}人阵亡大幅提升`;
desc += `）`;
                    log.push({type:'buff-summary', text:`<span class="gold">${desc}</span>`, buffType:'buff_stat'});
                }
                break;
        }
    });
}

export function registerBloodthirst(eventBus) {
    // 统一消费额外攻击请求（嗜血狂刀姐姐强化、宋青书性奋等）
    eventBus.on('requestExtraAttack', L.REQUEST_EXTRA_ATTACK.DEFAULT, async (data) => {
        const { unit, target, allySide, enemySide, log, A, B, state } = data;
        if (unit.alive && target?.alive && typeof processUnitAttack === 'function') {
            await processUnitAttack(unit, allySide, enemySide, log, A || allySide, B || enemySide, state || null, null, target.uid);
        } else if (unit.alive && typeof processUnitAttack === 'function') {
            await processUnitAttack(unit, allySide, enemySide, log, A || allySide, B || enemySide, state || null, null);
        }
    });

    eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.BLOODTHIRST, async (data) => {
        const { unit, target, dmg, allySide, enemySide, log } = data;
        if (!unit.alive || unit.camp !== 'ally') return;
        const unitBuffs = allySide._activeBuffs || [];
        const hasSister = allySide.some(u => u.isXiaoZhaoSister && u.alive);
        const isBrother = unit.isXiaoZhaoBrother;
        
        if (hasBuff(unitBuffs, 'bloodthirst') && unit.role === '战士' && dmg > 0) {
            const leechVal = Math.floor(dmg * C.BUFFS.bloodthirst.leechRatio);
            const decl = {
                type: 'leech',
                value: leechVal,
                source: unit,
                logText: `<span class="green">🗡️ ${unit.name} 的嗜血狂刀吸血+${leechVal}</span>`
            };
            if (!data.declarations) data.declarations = [];
            data.declarations.push(decl);
            if (hasSister && unit.alive && target.alive && !unit._bloodthirstStriked) {
                unit._bloodthirstStriked = true;
                eventBus.emit('requestExtraAttack', { unit, target, allySide, enemySide, log });
            }
        } else if (isBrother && query('xiaoPermanentActive', unit, unitBuffs, 'bloodthirst') && unit.role === '战士') {
            const leechVal = Math.floor(dmg * 0.8);
            const decl = {
                type: 'leech',
                value: leechVal,
                source: unit,
                logText: `<span class="green">🦋 蝶血：小昭嗜血狂刀吸血+${leechVal}</span>`
            };
            if (!data.declarations) data.declarations = [];
            data.declarations.push(decl);
        }
    });
}

export function registerHotBlood(eventBus) {
    eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.HOT_BLOOD, (data) => {
        const { unit, dmg, allySide, enemySide, log } = data;
        if (!unit.alive || unit.camp !== 'ally' || unit.hp >= unit.maxHp) return;
        const unitBuffs = allySide._activeBuffs || [];
        const hasSister = allySide.some(u => u.isXiaoZhaoSister && u.alive);
        const isBrother = unit.isXiaoZhaoBrother;

        if (hasBuff(unitBuffs, 'hotBlood')) {
            if (!unit._hotBloodCount) unit._hotBloodCount = 0;
            unit._hotBloodCount++;
            let ratio, tag;
            if (hasSister) {
                ratio = (unit._hotBloodCount % 2 === 0) ? 0.40 : 0.20;
                tag = (unit._hotBloodCount % 2 === 0) ? '❤️‍🔥 热血奋战(翻倍)' : '❤️ 热血奋战';
            } else {
                ratio = (unit._hotBloodCount % 3 === 0) ? C.BUFFS.hotBlood.critRatio : C.BUFFS.hotBlood.leechRatio;
                tag = (unit._hotBloodCount % 3 === 0) ? '❤️‍🔥 热血奋战(翻倍)' : '❤️ 热血奋战';
            }
            const leech = Math.min(Math.floor((unit.maxHp - unit.hp) * ratio), unit.maxHp - unit.hp);
            if (leech > 0) {
                const decl = {
                    type: 'heal',
                    value: leech,
                    source: unit,
                    logText: `<span class="green">${tag}：${unit.name} 回复+${leech}</span>`
                };
                if (!data.declarations) data.declarations = [];
                data.declarations.push(decl);
            }
        } else if (isBrother && query('xiaoPermanentActive', unit, unitBuffs, 'hotBlood')) {
            if (!unit._hotBloodCount) unit._hotBloodCount = 0;
            unit._hotBloodCount++;
            if (unit.hp < unit.maxHp) {
                let ratio = (unit._hotBloodCount % 2 === 0) ? 0.40 : 0.20;
                const leech = Math.min(Math.floor((unit.maxHp - unit.hp) * ratio), unit.maxHp - unit.hp);
                const tag = (unit._hotBloodCount % 2 === 0) ? '🦋 热血(翻倍)' : '🦋 热血';
                if (leech > 0) {
                    const decl = {
                        type: 'heal',
                        value: leech,
                        source: unit,
                        logText: `<span class="green">${tag}：小昭回复+${leech}</span>`
                    };
                    if (!data.declarations) data.declarations = [];
                    data.declarations.push(decl);
                }
            }
        }
    });
}

export function registerWindAssault(eventBus) {
    eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.WIND_ASSAULT, (data) => {
        const { unit, target, dmg, allySide, enemySide, log } = data;
        const rng = getBattleRng();
        if (!unit.alive || unit.camp !== 'ally' || !target || !target.alive) return;
        const unitBuffs = allySide._activeBuffs || [];
        const hasSister = allySide.some(u => u.isXiaoZhaoSister && u.alive);
        const isBrother = unit.isXiaoZhaoBrother;

        const active = hasBuff(unitBuffs, 'windAssault') && unit.role === '飞行';
        const brotherActive = isBrother && unit.role === '飞行' && query('xiaoPermanentActive', unit, unitBuffs, 'windAssault');
        if (!active && !brotherActive) return;

        const hitProb = hasSister ? 100 : 80;
        const pushProb = hasSister ? 80 : 60;
        const label = brotherActive ? '🦋 蝶翼' : '🦅 乘风突袭';

        if (rng.nextInt(1, 100) <= hitProb) {
            const row = getUnitRow(target.pos);
            const rowTargets = enemySide.filter(u => u.alive && getUnitRow(u.pos) === row && u.uid !== target.uid && !(u.state._flyMode === 'butterfly') && !(u.state._flyMode === 'spider') && !u.state._spiderFlying);
            if (rowTargets.length > 0) {
                const splashDmg = Math.floor(dmg);
                const details = rowTargets.map(rt => `${rt.name}`).join('、');
                const decl = {
                    type: 'splash',
                    value: splashDmg,
                    targets: rowTargets,
                    buffType: 'wind_assault',
                    logText: `<span class="orange">${label}波及${details}，各 -${splashDmg}</span>`
                };
                if (!data.declarations) data.declarations = [];
                data.declarations.push(decl);
            } else {
                log.push({type:'info', text:`<span class="gray">${label}波及触发失败</span>`});
            }
        } else {
            log.push({type:'info', text:`<span class="gray">${label}波及触发失败</span>`});
        }

        // 击退逻辑保留在组件（改位置不冲突其他效果）
        if (rng.nextInt(1, 100) <= pushProb) {
            const behindPos = target.pos + 3;
            if (behindPos <= 9) {
                const targetTeam = target.camp === 'ally' ? allySide : enemySide;
                const behindUnit = targetTeam.find(u => u.pos === behindPos && u.alive);
                const oldPos = target.pos;
                if (behindUnit) {
                    const behindOldPos = behindUnit.pos;
                    target.pos = behindPos;
                    behindUnit.pos = oldPos;
                    log.push({type:'buff-push', pushTargetUid: target.uid, behindUid: behindUnit.uid, oldPos, newPos: behindPos, behindOldPos, buffType:'push', text:`<span class="gold" style="font-size:1.1em;">${label}击退！${target.name}从${oldPos}号位击退至${behindPos}号位，${behindUnit.name}被迫从${behindOldPos}号位移至${oldPos}号位</span>`});
                } else {
                    target.pos = behindPos;
                    log.push({type:'buff-push', pushTargetUid: target.uid, behindUid: null, oldPos, newPos: behindPos, buffType:'push', text:`<span class="gold" style="font-size:1.1em;">${label}击退！${target.name}从${oldPos}号位被击退至${behindPos}号位</span>`});
                }
            }
        } else {
            log.push({type:'info', text:`<span class="gray">${label}击退触发失败</span>`});
        }

        // 击退/换位完成后广播（被动技能监听，如张无忌前排检测）
        eventBus.emit('onPositionSwap', { allySide, enemySide, log });
    });
}

export function registerMeteorShower(eventBus) {
    eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.METEOR_SHOWER, (data) => {
        const { unit, target, dmg, allySide, enemySide, log } = data;
        if (!unit.alive || unit.camp !== 'ally' || !target || !target.alive) return;
        const unitBuffs = allySide._activeBuffs || [];
        const hasSister = allySide.some(u => u.isXiaoZhaoSister && u.alive);
        const isBrother = unit.isXiaoZhaoBrother;

        const active = hasBuff(unitBuffs, 'meteorShower') && unit.role === '远程';
        const brotherActive = isBrother && unit.role === '远程' && query('xiaoPermanentActive', unit, unitBuffs, 'meteorShower');
        if (!active && !brotherActive) return;

        const label = brotherActive ? '🦋 蝶星' : '☄️ 流星赶月';

        // 主箭额外增伤 — 改为提交 bonusDmg 声明
        const bonusDmg = Math.floor(dmg * C.BUFFS.meteorShower.bonusRatio);
        applyStatChange(target, 'def', -(C.BUFFS.meteorShower.mainDefReduce || 2), unit, '流星赶月');
        const decl = {
            type: 'bonusDmg',
            value: bonusDmg,
            target: target,
            buffType: 'meteor_bonus',
            logText: `<span class="gold">${label}伤害加深：${target.name} 额外-${bonusDmg}，防御-${C.BUFFS.meteorShower.mainDefReduce || 2}</span>`
        };
        if (!data.declarations) data.declarations = [];
        data.declarations.push(decl);

        // 溅射 — 提交 splash 声明
        const splashDmg = Math.floor(dmg * C.BUFFS.meteorShower.splashRatio);
        const adjPositions = getAdjacentPositions(target.pos);
        const splashSide = target.camp === unit.camp ? allySide : enemySide;
        const splashTargets = splashSide.filter(u => u.alive && adjPositions.includes(u.pos) && !(u.state._flyMode === 'butterfly') && !(u.state._flyMode === 'spider') && !u.state._spiderFlying);
        if (splashTargets.length > 0) {
            const details = splashTargets.map(st => `${st.name}`).join('、');
            const decl = {
                type: 'splash',
                value: splashDmg,
                targets: splashTargets,
                buffType: 'meteor_splash',
                attackerUid: unit.uid,
                primaryUid: target.uid,
                splashUids: splashTargets.map(st => st.uid),
                splashDmg: splashDmg,
                logText: `<span class="orange">${label}溅射：${details}，各-${splashDmg}，防御-${C.BUFFS.meteorShower.splashDefReduce || 1}</span>`
            };
            if (!data.declarations) data.declarations = [];
            data.declarations.push(decl);
            for (const st of splashTargets) {
                applyStatChange(st, 'def', -(C.BUFFS.meteorShower.splashDefReduce || 1), unit, '流星溅射');
            }
        }
    });
}

export function registerMindControl(eventBus) {
    eventBus.on('afterAttack', L.AFTER_ATTACK.MIND_CONTROL, (data) => {
        const { unit, allySide, enemySide, log } = data;
        if (!unit.alive || unit.camp !== 'ally') return;
        const buffs = allySide._activeBuffs || [];
        const hasSister = allySide.some(u => u.isXiaoZhaoSister && u.alive);

        if (hasBuff(buffs, 'mindControl') && !allySide._mindControlTriggered) {
            allySide._mindControlTriggered = true;
            if (hasSister) applyMindControl_Sister(unit, allySide, enemySide, log);
            else applyMindControl_Normal(unit, allySide, enemySide, log);
        }
    });
}