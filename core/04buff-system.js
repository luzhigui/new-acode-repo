// core/04buff-system.js - 光明顶5v5 Buff系统
// V4.0.0 | ~275 lines | 2026-06-29 09:29
export const VER = 'core/04buff-system.js V4.0.0';

import { CONFIG } from './01config-5v5-test.js';
import { rand, hasBuff, getUnitRow, getUnitCol, getAdjacentPositions } from './03battle-utils.js';
const C = CONFIG;

export function computeBuffStats(unit, activeBuffs, allyTeam) {
    // console.log('computeBuffStats called, activeBuffs:', JSON.stringify(activeBuffs?.map(b => ({ key: b.key, target: b.target, remaining: b.remaining }))));
    let atkBonus = 0, defBonus = 0, dodgeBonus = 0, hpBonus = 0;
    if (!activeBuffs) return { atkBonus, defBonus, dodgeBonus, hpBonus };

    if (hasBuff(activeBuffs, 'holyFlame')) {
        let buffObj = activeBuffs.find(b => b.key === 'holyFlame');
        if (buffObj) {
            if (buffObj.col == null) buffObj.col = rand(1, 3);
            if (buffObj.row == null) buffObj.row = rand(1, 3);
            if (getUnitCol(unit.pos) === buffObj.col) { atkBonus += C.BUFFS.holyFlame.atkBonus; }
            if (getUnitRow(unit.pos) === buffObj.row) { defBonus += C.BUFFS.holyFlame.defBonus; }
        }
    }
    if (hasBuff(activeBuffs, 'carry') && unit.pos === 5 && unit.alive) {
        if (allyTeam) {
            let allAllies = allyTeam.filter(u => u.uid !== unit.uid);
            let totalAtk = 0, totalDef = 0, totalHp = 0;
            allAllies.forEach(a => {
                let mult = a.alive ? 1 : C.BUFFS.carry.deathMultiplier;
                totalAtk += C.BUFFS.carry.atkBonus * mult;
                totalDef += C.BUFFS.carry.defBonus * mult;
                if (C.BUFFS.carry.hpBonus) totalHp += C.BUFFS.carry.hpBonus * mult;
            });
            atkBonus += totalAtk; defBonus += totalDef; hpBonus += totalHp;
        }
    }
    if (hasBuff(activeBuffs, 'fortify') && unit.role === '防战') { defBonus += C.BUFFS.fortify.defBonus; }
    if (hasBuff(activeBuffs, 'cloudBody')) { dodgeBonus = C.BUFFS.cloudBody.dodgeBonus; }
    // console.log('computeBuffStats:', unit.name, 'atkBonus:', atkBonus, 'defBonus:', defBonus, 'activeBuffs:', activeBuffs?.map(b => b.key));
    return { atkBonus, defBonus, dodgeBonus, hpBonus };
}

export function applyBuffEffectsBeforeAttack(unit, target, allyTeam, enemyTeam, log) {
    let buffs = allyTeam._activeBuffs || [];
    
    if (hasBuff(buffs, 'mindControl')) {
        let frontUnit = allyTeam.filter(u => u.alive && !u.isHorse).sort((a,b) => a.pos - b.pos)[0];
        if (frontUnit && frontUnit.uid === unit.uid) {
            if (rand(1,100) <= 80) {
                let enemies = enemyTeam.filter(u => u.alive);
                if (enemies.length >= 2) {
                    let a = enemies[rand(0, enemies.length-1)];
                    let b; do { b = enemies[rand(0, enemies.length-1)]; } while (b.uid === a.uid);
                    let posA = a.pos, posB = b.pos;
                    let tempPos = a.pos; a.pos = b.pos; b.pos = tempPos;
                    log.push({type:'buff-swap', text:`<span class="gold">🌀 惑人心智：${posA}号位${a.name}(${a.role})与${posB}号位${b.name}(${b.role})互换位置！</span>`, buffType:'swap'});
                }
            } else {
                log.push({type:'info', text:`<span class="gray">🌀 惑人心智（敌方换位）触发失败</span>`});
            }
            if (rand(1,100) <= 40) {
                let allies = allyTeam.filter(u => u.alive);
                if (allies.length >= 2) {
                    let a = allies[rand(0, allies.length-1)];
                    let b; do { b = allies[rand(0, allies.length-1)]; } while (b.uid === a.uid);
                    let posA = a.pos, posB = b.pos;
                    let tempPos = a.pos; a.pos = b.pos; b.pos = tempPos;
                    log.push({type:'buff-swap', text:`<span class="gold">🌀 惑人心智：己方${posA}号位${a.name}(${a.role})与${posB}号位${b.name}(${b.role})互换位置！</span>`, buffType:'swap'});
                }
            } else {
                log.push({type:'info', text:`<span class="gray">🌀 惑人心智（己方换位）触发失败</span>`});
            }
        }
    }
}

export function applyBuffEffectsAfterAttack(unit, target, dmg, allySide, enemySide, log) {
    let allyBuffs = allySide._activeBuffs || [];
    
    if (hasBuff(allyBuffs, 'bloodthirst') && unit.role === '战士') {
        let leech = Math.floor(dmg * C.BUFFS.bloodthirst.leechRatio);
        let hpBefore = unit.hp;
        unit.hp = Math.min(unit.maxHp, unit.hp + leech);
        unit.healDone += leech;
        log.push({type:'buff-leech', text:`<span class="green">🗡️ ${unit.name} 的嗜血狂刀吸血+${leech}，血量 ${hpBefore} → ${unit.hp}</span>`, isHealEntry:true, buffType:'leech', healAmount:leech, healUnitUid:unit.uid});
    }
    
    if (hasBuff(allyBuffs, 'hotBlood')) {
        if (!unit._hotBloodCount) unit._hotBloodCount = 0;
        unit._hotBloodCount++;
        let ratio = (unit._hotBloodCount % C.BUFFS.hotBlood.critInterval === 0) ? C.BUFFS.hotBlood.critRatio : C.BUFFS.hotBlood.leechRatio;
        let leech = Math.min(Math.floor((unit.maxHp - unit.hp) * ratio), unit.maxHp - unit.hp);
        let hpBefore = unit.hp;
        unit.hp = Math.min(unit.maxHp, unit.hp + leech);
        unit.healDone += leech;
        let tag = (ratio > C.BUFFS.hotBlood.leechRatio) ? '❤️‍🔥 热血奋战(翻倍)' : '❤️ 热血奋战';
        log.push({type:'buff-leech', text:`<span class="green">${tag}：${unit.name} 回复+${leech}，血量 ${hpBefore} → ${unit.hp}</span>`, isHealEntry:true, buffType:'hotBlood', healAmount:leech, healUnitUid:unit.uid});
    }
    
    // 流星赶月：本体额外伤害 + 溅射合并
    if (hasBuff(allyBuffs, 'meteorShower') && unit.role === '远程' && target.alive) {
        let bonusDmg = Math.floor(dmg * C.BUFFS.meteorShower.bonusRatio);
        target.hp -= bonusDmg;
        unit.dmgDealt += bonusDmg;
        target.dmgTaken += bonusDmg;
        if (target.hp <= 0) { target.hp = 0; target.alive = false; }
        log.push({
            type:'buff-bonus',
            text:`<span class="gold">☄️ 流星赶月伤害加深：${target.name} 额外-${bonusDmg}</span>`,
            buffType:'meteor_bonus',
            targetUid: target.uid,
            bonusDmg: bonusDmg
        });
        
        let splashDmg = Math.floor(dmg * C.BUFFS.meteorShower.splashRatio);
        let adjPositions = getAdjacentPositions(target.pos);
        let splashTargets = enemySide.filter(u => u.alive && adjPositions.includes(u.pos));
        if (splashTargets.length > 0) {
            let details = splashTargets.map(st => {
                let hpBefore = Math.floor(st.hp);
                st.hp -= splashDmg;
                unit.dmgDealt += splashDmg;
                st.dmgTaken += splashDmg;
                if (st.hp <= 0) { st.hp = 0; st.alive = false; }
                return `${st.name}：${hpBefore}→${Math.floor(st.hp)}`;
            }).join('，');
            log.push({
                type:'buff-splash',
                text:`<span class="orange">☄️ 流星赶月溅射：${details}，各-${splashDmg}</span>`,
                buffType:'meteor_splash',
                attackerUid: unit.uid,
                primaryUid: target.uid,
                splashUids: splashTargets.map(st => st.uid),
                splashDmg: splashDmg
            });
        }
    }
    
    if (hasBuff(allyBuffs, 'windAssault') && unit.role === '飞行' && target.alive) {
        if (rand(1,100) <= 80) {
            let row = getUnitRow(target.pos);
            let rowTargets = enemySide.filter(u => u.alive && getUnitRow(u.pos) === row && u.uid !== target.uid);
            if (rowTargets.length > 0) {
                let hitDmg = Math.floor(dmg);
                let details = rowTargets.map(rt => {
                    let hpBefore = Math.floor(rt.hp);
                    rt.hp -= hitDmg; unit.dmgDealt += hitDmg; rt.dmgTaken += hitDmg;
                    if (rt.hp <= 0) { rt.hp = 0; rt.alive = false; }
                    return `${rt.name}：${hpBefore}→${Math.floor(rt.hp)}`;
                }).join('，');
                log.push({type:'buff-splash', text:`<span class="orange">🦅 乘风突袭波及${details}，各 -${hitDmg}</span>`, buffType:'wind_assault', attackerUid: unit.uid});
            }
        } else {
            log.push({type:'info', text:`<span class="gray">🦅 乘风突袭波及触发失败</span>`});
        }
        if (rand(1,100) <= 60) {
            let behindPos = target.pos + 3;
            if (behindPos <= 9) {
                let oldPos = target.pos;
                let behindUnit = enemySide.find(u => u.pos === behindPos && u.alive);
                if (behindUnit) {
                    let behindOldPos = behindUnit.pos;
                    let tempPos = target.pos; target.pos = behindPos; behindUnit.pos = tempPos;
                    log.push({type:'buff-push', text:`<span class="gold" style="font-size:1.1em;">🦅 乘风突袭击退！${target.name}从${oldPos}号位击退至${behindPos}号位，${behindUnit.name}被迫从${behindOldPos}号位移至${oldPos}号位</span>`, buffType:'push', pushTarget: target.name, pushBehind: behindUnit.name, pushPos: behindPos});
                } else {
                    target.pos = behindPos;
                    log.push({type:'buff-push', text:`<span class="gold" style="font-size:1.1em;">🦅 乘风突袭击退！${target.name}从${oldPos}号位被击退至${behindPos}号位</span>`, buffType:'push', pushTarget: target.name, pushBehind: null, pushPos: behindPos});
                }
            }
        } else {
            log.push({type:'info', text:`<span class="gray">🦅 乘风突袭击退触发失败</span>`});
        }
    }
}

export function logBuffSummary(allyTeam, log, doubleStrikeUid) {
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
                if (msUnits.length > 0) log.push({type:'buff-summary', text:`<span class="gold">☄️ 流星赶月：${msUnits.map(u=>u.name).join('、')} 伤害加深${Math.round(C.BUFFS.meteorShower.bonusRatio*100)}% 溅射${Math.round(C.BUFFS.meteorShower.splashRatio*100)}%</span>`, buffType:'buff_stat'});
                break;
            case 'holyFlame': {
                if (b.col == null) b.col = rand(1, 3);
                if (b.row == null) b.row = rand(1, 3);
                let col = b.col, row = b.row;
                let colUnits = allyTeam.filter(u => u.alive && getUnitCol(u.pos) === col);
                let rowUnits = allyTeam.filter(u => u.alive && getUnitRow(u.pos) === row);
                let atkNames = colUnits.map(u=>u.name).join('、') || '无';
                let defNames = rowUnits.map(u=>u.name).join('、') || '无';
                log.push({type:'buff-summary', text:`<span class="gold">🔥 圣火令：第${col}列(${atkNames})攻击+${Math.round(C.BUFFS.holyFlame.atkBonus*100)}%，第${row}行(${defNames})防御+${Math.round(C.BUFFS.holyFlame.defBonus*100)}%</span>`, buffType:'buff_stat'});
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
                    let fullAllies = window._currentBattleState?.ally || allyTeam;
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