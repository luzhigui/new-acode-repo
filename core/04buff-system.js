// core/04buff-system.js - 光明顶5v5 Buff系统
// V5.2.0 | ~15100 bytes | 2026-07-05
export const VER = 'core/04buff-system.js V5.2.0';
import {
    applyBloodthirst_Normal, applyBloodthirst_Sister, applyBloodthirst_Brother,
    applyHotBlood_Normal, applyHotBlood_Sister, applyHotBlood_Brother,
    applyWindAssault_Normal, applyWindAssault_Sister, applyWindAssault_Brother,
    applyMeteorShower_Normal, applyMeteorShower_Sister, applyMeteorShower_Brother,
    applyFortifyRebound_Normal, applyFortifyRebound_Sister, applyFortifyRebound_Brother,
    applyMindControl_Normal, applyMindControl_Sister,
    applyFortifyDef_Normal, applyFortifyDef_Sister, applyFortifyDef_Brother,
    applyCloudBodyDodge_Normal, applyCloudBodyDodge_Sister, applyCloudBodyDodge_Brother,
    applyHolyFlame_Normal, applyHolyFlame_Sister, applyHolyFlame_Brother,
    calcCarryBonus_Normal, calcCarryBonus_Sister
} from './50buff-effects.js';
import { CONFIG } from './01config-5v5-test.js';
import { rand, hasBuff, getUnitRow, getUnitCol, getAdjacentPositions } from './03battle-utils.js';
import { checkKuLian, applyXingFenGrant, applyXinHunDeduction, tickKuaiLeHeal, canXingFenTrigger, consumeXingFen, applyXingFenPenalty, applyXiaoZhaoDerived, computeButterflyMastery, isXiaoZhaoPermanentActive, getXiaoZhaoHexEnhance } from '../modules/23elite-skills.js';
const C = CONFIG;

export function computeBuffStats(unit, activeBuffs, allyTeam) {
    // console.log('computeBuffStats called, activeBuffs:', JSON.stringify(activeBuffs?.map(b => ({ key: b.key, target: b.target, remaining: b.remaining }))));
    let atkBonus = 0, defBonus = 0, dodgeBonus = 0, hpBonus = 0;
    if (!activeBuffs) return { atkBonus, defBonus, dodgeBonus, hpBonus };


    // carry 加成是绝对值，单独返回，不混入 atkBonus/defBonus（那两个字段是比率，供 calcAttackDamage 做乘法用）
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
    // ---- 严阵以待防御 ----
    if (hasBuff(activeBuffs, 'fortify') && unit.role === '防战' && unit.camp === 'ally') {
        if (allyTeam && allyTeam.some(u => u.isXiaoZhaoSister && u.alive)) applyFortifyDef_Sister(unit, { defBonus });
        else applyFortifyDef_Normal(unit, { defBonus });
    } else if (unit.isXiaoZhaoBrother && isXiaoZhaoPermanentActive(unit, activeBuffs, 'fortify') && unit.role === '防战') {
        applyFortifyDef_Brother(unit, { defBonus });
    }

    // ---- 流云身法闪避 ----
    if (hasBuff(activeBuffs, 'cloudBody') && unit.camp === 'ally') {
        if (allyTeam && allyTeam.some(u => u.isXiaoZhaoSister && u.alive)) applyCloudBodyDodge_Sister(unit, { dodgeBonus });
        else applyCloudBodyDodge_Normal(unit, { dodgeBonus });
    } else if (unit.isXiaoZhaoBrother && isXiaoZhaoPermanentActive(unit, activeBuffs, 'cloudBody')) {
        applyCloudBodyDodge_Brother(unit, { dodgeBonus });
    }

    // ---- 小昭变身精通加成 ----
    let masteryAtkAbs = 0, masteryDefAbs = 0, masteryHpAbs = 0;
    if (unit.isXiaoZhaoBrother) {
        const mastery = computeButterflyMastery(unit);
        masteryAtkAbs = mastery.atk; masteryDefAbs = mastery.def; masteryHpAbs = mastery.hp;
    }

    // ---- 圣火令 ----
    const holyFlameTeam = hasBuff(activeBuffs, 'holyFlame');
    if (holyFlameTeam) {
        if (allyTeam && allyTeam.some(u => u.isXiaoZhaoSister && u.alive)) applyHolyFlame_Sister(unit, allyTeam, activeBuffs, { atkBonus, defBonus });
        else applyHolyFlame_Normal(unit, allyTeam, activeBuffs, { atkBonus, defBonus });
    } else if (unit.isXiaoZhaoBrother && isXiaoZhaoPermanentActive(unit, activeBuffs, 'holyFlame')) {
        applyHolyFlame_Brother(unit, allyTeam, activeBuffs, { atkBonus, defBonus });
    }

    return { atkBonus, defBonus, dodgeBonus, hpBonus, carryAtkAbs, carryDefAbs, carryHpAbs, masteryAtkAbs, masteryDefAbs, masteryHpAbs };
}

export function applyBuffEffectsBeforeAttack(unit, target, allyTeam, enemyTeam, log) {
    let buffs = allyTeam._activeBuffs || [];
    const hasSister = allyTeam.some(u => u.isXiaoZhaoSister && u.alive);

    if (hasBuff(buffs, 'mindControl')) {
        if (hasSister) applyMindControl_Sister(unit, allyTeam, enemyTeam, log);
        else applyMindControl_Normal(unit, allyTeam, enemyTeam, log);
    }
}

export function applyBuffEffectsAfterAttack(unit, target, dmg, allySide, enemySide, log) {
    let unitBuffs = (unit.camp === 'ally' ? allySide._activeBuffs : enemySide._activeBuffs) || [];
    const hasSister = allySide.some(u => u.isXiaoZhaoSister && u.alive);
    const isBrother = unit.isXiaoZhaoBrother;

    // ---- 嗜血狂刀 ----
    if (hasBuff(unitBuffs, 'bloodthirst')) {
        if (hasSister) applyBloodthirst_Sister(unit, target, dmg, allySide, enemySide, log);
        else applyBloodthirst_Normal(unit, target, dmg, allySide, enemySide, log);
    } else if (isBrother && isXiaoZhaoPermanentActive(unit, unitBuffs, 'bloodthirst')) {
        applyBloodthirst_Brother(unit, target, dmg, allySide, enemySide, log);
    }

    // ---- 热血奋战 ----
    if (hasBuff(unitBuffs, 'hotBlood')) {
        if (hasSister) applyHotBlood_Sister(unit, target, dmg, allySide, enemySide, log);
        else applyHotBlood_Normal(unit, target, dmg, allySide, enemySide, log);
    } else if (isBrother && isXiaoZhaoPermanentActive(unit, unitBuffs, 'hotBlood')) {
        applyHotBlood_Brother(unit, target, dmg, allySide, enemySide, log);
    }

    // ---- 乘风突袭 ----
    if (hasBuff(unitBuffs, 'windAssault') && unit.role === '飞行' && target.alive) {
        if (hasSister) applyWindAssault_Sister(unit, target, dmg, allySide, enemySide, log);
        else applyWindAssault_Normal(unit, target, dmg, allySide, enemySide, log);
    } else if (isBrother && unit.role === '飞行' && isXiaoZhaoPermanentActive(unit, unitBuffs, 'windAssault') && target.alive) {
        applyWindAssault_Brother(unit, target, dmg, allySide, enemySide, log);
    }

    // ---- 流星赶月 ----
    if (hasBuff(unitBuffs, 'meteorShower') && unit.role === '远程') {
        if (hasSister) applyMeteorShower_Sister(unit, target, dmg, allySide, enemySide, log);
        else applyMeteorShower_Normal(unit, target, dmg, allySide, enemySide, log);
    } else if (isBrother && unit.role === '远程' && isXiaoZhaoPermanentActive(unit, unitBuffs, 'meteorShower')) {
        applyMeteorShower_Brother(unit, target, dmg, allySide, enemySide, log);
    }
}export function logBuffSummary(allyTeam, log, doubleStrikeUid) {
    let buffs = allyTeam._activeBuffs || [];
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
                // 分团队圣火令和小昭圣火令
                const teamHolyBuffs = buffs.filter(b => b.key === 'holyFlame' && !b._xiaoZhao);
                const xiaoZhaoHolyBuffs = buffs.filter(b => b.key === 'holyFlame' && b._xiaoZhao);
                
                // 团队圣火令
                if (teamHolyBuffs.length > 0) {
                    for (const hb of teamHolyBuffs) {
                        const cols = hb.cols || (hb.col != null ? [hb.col] : [rand(1, 3), rand(1, 3)]);
                        const rows = hb.rows || (hb.row != null ? [hb.row] : [rand(1, 3), rand(1, 3)]);
                        let colUnits = allyTeam.filter(u => u.alive && cols.includes(getUnitCol(u.pos)));
                        let rowUnits = allyTeam.filter(u => u.alive && u.camp === 'ally' && rows.includes(getUnitRow(u.pos)));
                        let atkNames = colUnits.map(u=>u.name).join('、') || '无';
                        let defNames = rowUnits.map(u=>u.name).join('、') || '无';
                        const colList = cols.join('、');
                        const rowList = rows.join('、');
                        log.push({type:'buff-summary', text:`<span class="gold">🔥 圣火令（团队）：第${colList}列(${atkNames})攻击+${Math.round(C.BUFFS.holyFlame.atkBonus*100)}%，第${rowList}行(${defNames})防御+${Math.round(C.BUFFS.holyFlame.defBonus*100)}%</span>`, buffType:'buff_stat'});
                    }
                }
                
                // 小昭圣火令
                if (xiaoZhaoHolyBuffs.length > 0) {
                    for (const hb of xiaoZhaoHolyBuffs) {
                        const xzCols = hb.cols || (hb.col != null ? [hb.col] : [rand(1, 3), rand(1, 3)]);
                        const xzRows = hb.rows || (hb.row != null ? [hb.row] : [rand(1, 3), rand(1, 3)]);
                        let colUnits = allyTeam.filter(u => u.alive && xzCols.includes(getUnitCol(u.pos)));
                        let rowUnits = allyTeam.filter(u => u.alive && u.camp === 'ally' && xzRows.includes(getUnitRow(u.pos)));
                        let atkNames = colUnits.map(u=>u.name).join('、') || '无';
                        let defNames = rowUnits.map(u=>u.name).join('、') || '无';
                        let xiaoZhaoLabel = '🦋 圣火令（小昭）';
                        // 检查是否有单位同时受团队和小昭圣火令影响
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
                if (doubleStrikeUid) {
                    let dsUnit = allyTeam.find(u => u.uid === doubleStrikeUid);
                    if (dsUnit) log.push({type:'buff-summary', text:`<span class="gold">⚡ 概率连击：${dsUnit.name} 80%概率额外攻击一次</span>`, buffType:'buff_stat'});
                } else {
                    log.push({type:'buff-summary', text:`<span class="gold">⚡ 概率连击：己方随机一人80%概率额外攻击一次</span>`, buffType:'buff_stat'});
                }
                break;
            case 'mindControl':
                log.push({type:'buff-summary', text:`<span class="gold">🌀 惑人心智：最前排80%扰乱敌方换位，40%扰乱己方换位</span>`, buffType:'buff_stat'});
                break;
            case 'carry':
                let carryUnit = allyTeam.find(u => u.pos === 5 && u.alive);
                if (carryUnit) {
                    // 需要从原始战斗状态中获取完整队友列表（包含已阵亡）
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
    // buff-summary 的分隔符由播放器统一控制，引擎不再插入
}
