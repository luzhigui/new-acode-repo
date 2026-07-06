// core/06battle-engine-core.js - 光明顶5v5 战斗核心循环
// V5.0.0 | ~55000 bytes | 2026-07-06 引擎改造为逐步执行生成器
export const VER = 'core/06battle-engine-core.js V5.0.0';

import { CONFIG, DEF_TAUNT, HP_TAUNT } from './01config-5v5-test.js';
import { rand, calcDamage, getFangLevel, isMelee, getFronts, isBlocked, getFlyDodgeRate, getRandomTaunt, getZhangNearTaunt, makeFXSnapshot, hasBuff } from './03battle-utils.js';
import { computeBuffStats, applyBuffEffectsBeforeAttack, applyBuffEffectsAfterAttack, logBuffSummary } from './04buff-system.js';
import { spawnHorse, destroyHorse } from './05battle-horse.js';
import { Unit } from './02unit.js';
import {
    checkExtinctionCounter, checkNineYinClaw, getRebelTarget, getRebelDmgBonus, getRebelTrueDmg,
    getPhantomThunderBonus, applyXuanmingPalm, tickXuanmingPoison, getHornStrikeBonus,
    checkKuLian, applyXingFenGrant, applyXinHunDeduction, tickKuaiLeHeal, canXingFenTrigger, consumeXingFen
} from '../modules/23elite-skills.js';
const C = CONFIG, DT = DEF_TAUNT, HT = HP_TAUNT;

// ==================== 事件系统增强 ====================
function emitEvent(unit, eventType, payload) {
    if (typeof window._battleEvents === 'undefined') return;
    payload.dmgDealt = unit.dmgDealt;
    payload.dmgTaken = unit.dmgTaken;
    payload.healDone = unit.healDone;
    payload.reboundDone = unit.reboundDone;
    payload.leechDone = unit.leechDone;
    payload.dodgeCount = unit.dodgeCount;
    payload.critCount = unit.critCount;
    payload.survivedRounds = unit.survivedRounds;
    payload.buffAtkBonus = unit.buffAtkBonus || 0;
    payload.buffDefBonus = unit.buffDefBonus || 0;
    payload.buffDodgeBonus = unit.buffDodgeBonus || 0;
    payload.buffHpBonus = unit.buffHpBonus || 0;
    payload._isAbsolute = true;
    window._battleEvents.push({ unitUid: unit.uid, eventType, payload });
}
window._emitEvent = emitEvent;

function emitFullUnitState(unit, eventType) {
    emitEvent(unit, eventType, {
        uid: unit.uid,
        name: unit.name,
        role: unit.role,
        camp: unit.camp,
        pos: unit.pos,
        hp: unit.hp,
        maxHp: unit.maxHp,
        atk: unit.atk,
        def: unit.def,
        alive: unit.alive,
        isHorse: unit.isHorse || false,
        _isDead: unit._isDead || false
    });
}

// ==================== 拆分后的独立函数 ====================

function getNextAvailableUnit(team) {
    return team.filter(c => c.alive && !c._acted).sort((a, b) => a.pos - b.pos)[0] || null;
}

function checkZhangSwitch(A, log) {
    let zhang = A.find(c => c.isZhang && c.alive && !c._zhangSwitched);
    if (!zhang) return;
    let col = (zhang.pos - 1) % 3;
    let hasFrontAlly = A.some(c => c.alive && !c.isHorse && c.pos === 1 + col && c.uid !== zhang.uid);
    if (!hasFrontAlly) {
        zhang.rangedForm = false; zhang.atk += 3; zhang.def += 2; zhang.maxHp += 50;
        zhang.hp = Math.min(zhang.hp + 50, zhang.maxHp); zhang.role = '战士';
        zhang._blocked = false; zhang._resting = false; zhang._zhangSwitched = true;
        zhang._baseMaxHp = zhang.maxHp;
        emitEvent(zhang, 'zhang-switch', {
            atk: zhang.atk,
            def: zhang.def,
            maxHp: zhang.maxHp,
            hp: zhang.hp,
            role: zhang.role,
            rangedForm: false
        });
        log.push({ type:'info', text:`<span class="gold">⚔️ 张无忌切换近战形态！攻+3、防+2、生命上限+50</span>`, isZhangSwitch:true, unit: zhang });
        log.push({ type:'info', text:`<span class="gold">🗣️ 张无忌：不好，要顶上去了！</span>`, isZhangTaunt:true });
    }
}

function selectTarget(unit, enemySide) {
    let targets = enemySide.filter(c => c.alive);
    if (targets.length === 0) return null;
    let target = null;
    const rebelTarget = getRebelTarget(unit, enemySide);
    if (rebelTarget) {
        target = rebelTarget;
    } else if (unit.isWei) {
        target = targets.reduce((a,b) => a.hp < b.hp ? a : b);
    } else if (isMelee(unit.role) || unit.isHorse) {
        let fronts = getFronts(targets);
        if (fronts.length === 0) return null;
        target = fronts[rand(0, fronts.length - 1)];
    } else {
        target = targets[rand(0, targets.length - 1)];
    }
    return target;
}

function resolveDodge(unit, target, attackerBuffStats, log) {
    if (!target.alive || (!target.isWei && target._acted)) return false;
    let baseDodge = getFlyDodgeRate(target, unit);
    let buffDodge = attackerBuffStats.dodgeBonus;
    if (baseDodge + buffDodge <= 0) return false;
    let finalHit = (1 - baseDodge) * (1 - buffDodge);
    let totalDodge = 1 - finalHit;
    if (rand(1,100) > totalDodge * 100) return false;
    target.dodgeCount++;
    let reboundDmg = Math.floor((target.atk + target.def) * 0.5);
    let unitHpBeforeRebound = Math.floor(unit.hp);
    unit.hp = Math.max(0, unit.hp - reboundDmg);
    target.dmgDealt += reboundDmg; unit.dmgTaken += reboundDmg;
    if (unit.hp <= 0) {
        unit.alive = false;
        unit._isDead = true;
        unit._flash = 'dead';
        if (!unit._deathTime) unit._deathTime = Date.now();
    }
    emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def });
    let dg = {type:'attack-group', uidA:target.uid, uidD:unit.uid, entries:[], isDodge:true, hpAfter:unit.hp, alive:unit.alive, _fxSnapshot:makeFXSnapshot(target,unit), waveTaunt:null, waveUnit:null, buffEffects:[], _atkBonus:0, _defBonus:0};
    if (target.isWei) {
        let heal = Math.floor(reboundDmg * 0.15);
        let wasFullHp = (target.hp >= target.maxHp);
        target.maxHp += heal;
        target.hp = Math.min(target.hp + heal, target.maxHp);
        if (wasFullHp) { target.hp = target.maxHp; }
        target.healDone += heal;
        target.leechDone += heal;
        emitEvent(target, 'hp-change', { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: target.def });
        dg.entries.push({type:'info', text:`<span class="green">🦇 韦一笑闪避反击吸血+${heal}，上限→${Math.floor(target.maxHp)}</span>`, isHealEntry:true, healAmount:heal, healUnitUid:target.uid});
    }
    dg.entries.push({type:'combat-text', text:`<span class="${unit.camp==='ally'?'blue':'orange'}">${unit.camp==='ally'?'明教':'六大派'} ${unit.name}</span>(攻${Math.floor(unit.atk)} 血${unitHpBeforeRebound}) → <span class="${target.camp==='ally'?'blue':'orange'}">${target.camp==='ally'?'明教':'六大派'} ${target.name}</span>(防${Math.floor(target.def)} 血${Math.floor(target.hp)})`});
    dg.entries.push({type:'info', text:`<span class="gray">🦅 ${target.name}闪避了攻击！</span>`});
    dg.entries.push({type:'damage-text', text:`<span class="red">🦅 ${target.name}反击 → ${unit.name} 造成 ${reboundDmg} 真实伤害（${unitHpBeforeRebound} → ${Math.floor(unit.hp)}）</span>`});
    if (unit.hp <= 0) { unit.alive = false; unit._flash = 'dead'; unit._isDead = true; dg.entries.push({type:'info', text:`${unit.name}被反击击杀！`}); }
    dg._events = [...window._battleEvents];
    window._battleEvents = [];
    log.push(dg);
    unit._acted = true;
    return true;
}

function calcAttackDamage(unit, target, attackerBuffStats, defenderBuffStats) {
    let atkBase = Math.floor(unit.atk) + Math.floor(unit.atk * attackerBuffStats.atkBonus);
    let defBase = Math.floor(target.def) + Math.floor(target.def * defenderBuffStats.defBonus);
    const hornBonus = getHornStrikeBonus(unit, target);
    if (hornBonus.defIgnore > 0) {
        let defBefore = defBase;
        defBase = Math.floor(defBase * (1 - hornBonus.defIgnore));
        hornBonus._defBefore = defBefore;
        hornBonus._defAfter = defBase;
    }
    let atkVar = rand(0, C.ATK_VAR), defVar = rand(0, C.DEF_VAR), hpBonus = rand(C.HP_BONUS_MIN, C.HP_BONUS_MAX);
    let atkAct = atkBase + atkVar, defAct = defBase + defVar;
    let hpBefore = Math.floor(target.hp);
    target.hp += hpBonus;
    let waveTaunt = null, waveUnit = null;
    if (atkVar === C.ATK_VAR) { waveTaunt = getRandomTaunt(unit); waveUnit = unit; unit.critCount++; }
    else if (defVar === C.DEF_VAR) { waveTaunt = DT[rand(0, DT.length - 1)]; waveUnit = target; }
    else if (hpBonus === C.HP_BONUS_MAX) { waveTaunt = HT[rand(0, HT.length - 1)]; waveUnit = target; }
    if (unit.isZhang && !unit.rangedForm && unit.nearAtkCount < 3) {
        let zt = getZhangNearTaunt(unit.nearAtkCount + 1);
        if (zt && !waveTaunt) { waveTaunt = zt; waveUnit = unit; }
    }
    let raw, rawFormula;
    if (unit.role === '防战') {
        let displayDef = Math.floor(unit.def + unit.def * (attackerBuffStats.defBonus || 0));
        let lv = getFangLevel(displayDef, unit.m), k = C.FANG_K[lv];
        let penPart = calcDamage(atkAct, defAct);
        raw = penPart + displayDef * k + unit.maxHp * 0.01;
        rawFormula = `${Math.floor(penPart)} + ${Math.floor(displayDef)}×${k} + ${Math.floor(unit.maxHp)}×0.01 = ${Math.floor(raw)}`;
    } else {
        raw = calcDamage(atkAct, defAct);
        rawFormula = `${atkAct}×(${atkAct}/(${atkAct}+${defAct})) = ${Math.floor(raw)}`;
    }
    const thunderBonus = getPhantomThunderBonus(unit);
    raw += thunderBonus;
    if (thunderBonus > 0) rawFormula += ` + 混元霹雳劲${thunderBonus}`;
    const rebelBonus = getRebelDmgBonus(unit);
    const trueDmg = getRebelTrueDmg(unit, target);
    if (rebelBonus > 0) {
        raw = raw * (1 + rebelBonus) + trueDmg;
        rawFormula = `(${rawFormula})×1.30 + 叛逆真伤${trueDmg} = ${Math.floor(raw)}`;
    } else if (trueDmg > 0) {
        raw += trueDmg;
        rawFormula = `${rawFormula} + 叛逆真伤${trueDmg} = ${Math.floor(raw)}`;
    }
    if (hornBonus.dmgMultiplier > 1) raw *= hornBonus.dmgMultiplier;
    return { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, raw, rawFormula, thunderBonus, hornBonus, trueDmg, defReduction: hornBonus._defBefore ? `${hornBonus._defBefore}→${hornBonus._defAfter}` : null };
}

function applyPostAttackEffects(unit, target, dmg, atkAct, defAct, reboundEntry, allySide, enemySide, log, A) {
    if (unit.camp === 'ally') {
        applyBuffEffectsBeforeAttack(unit, target, allySide, enemySide, log);
        checkZhangSwitch(A, log);
    } else {
        applyBuffEffectsBeforeAttack(unit, target, enemySide, allySide, log);
    }
    if (unit.camp === 'ally') {
        applyBuffEffectsAfterAttack(unit, target, dmg, allySide, enemySide, log);
    }
    let nineYinTotal = checkNineYinClaw(unit, target, dmg, log);
    const counterDmg = checkExtinctionCounter(target, dmg);
    if (counterDmg > 0) {
        unit.hp -= counterDmg; target.dmgDealt += counterDmg; unit.dmgTaken += counterDmg;
        if (unit.hp <= 0) {
            unit.alive = false;
            unit._isDead = true;
            if (!unit._deathTime) unit._deathTime = Date.now();
        }
        log.push({type:'info', text:`<span class="red">⚔️ 灭绝双剑反击！${target.name} 对 ${unit.name} 造成 ${counterDmg} 点反击伤害</span>`, buffType:'elite_counter'});
        emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def });
    }
    const poisonLog = applyXuanmingPalm(unit, target);
    if (poisonLog) { log.push(poisonLog); }
    if (reboundEntry) { log.push(reboundEntry); }
    let dead = !target.alive;
    if (dead && target.camp === 'ally') { checkZhangSwitch(A, log); }
    return nineYinTotal;
}

// ==================== 攻击执行主函数 ====================

function processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid) {
    let target = selectTarget(unit, enemySide);
    if (!target) { unit._acted = true; return false; }

    let miss = false;
    let missChance = 0;
    if (!unit.isWei && (unit.role === '远程' || unit.role === '飞行')) {
        missChance = 5;
    }
    if (missChance > 0 && rand(1,100) <= missChance) {
        miss = true;
        let mg = {type:'attack-group', uidA:unit.uid, uidD:target.uid, entries:[], isMiss:true, _fxSnapshot:makeFXSnapshot(unit,target), waveTaunt:null, waveUnit:null, buffEffects: []};
        mg.entries.push({type:'combat-text', text:`<span class="${unit.camp==='ally'?'blue':'orange'}">${unit.camp==='ally'?'明教':'六大派'} ${unit.name}</span> 的攻击`});
        mg.entries.push({type:'info', text:`<span class="gray">未命中！</span>`});
        unit._acted = true;
        mg._events = [...window._battleEvents];
        window._battleEvents = [];
        log.push(mg);
        applyXinHunDeduction(unit, allySide, log);
        if (doubleStrikeUnitUid && unit.uid === doubleStrikeUnitUid && unit.alive && unit.camp === 'ally' && !unit._doubleStriked) {
            if (rand(1,100) <= 80) {
                log.push({type:'info', text:`<span class="gold">⚡ 概率连击触发！</span>`, isDoubleStrikeBanner:true});
                unit._doubleStriked = true; unit._acted = false;
                processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid);
            } else {
                log.push({type:'info', text:`<span class="gray">⚡ 概率连击触发失败，${unit.name} 未能再次攻击</span>`});
            }
        }
        if (canXingFenTrigger(unit) && enemySide.some(u => u.alive)) {
            consumeXingFen(unit);
            log.push({type:'info', text:`<span class="gold">💗 性奋：${unit.name} 获得额外攻击机会！</span>`});
            processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid);
        }
        return true;
    }

    let unitActiveBuffs = unit.camp === 'ally' ? A._activeBuffs : B._activeBuffs;
    let unitAllyTeam = unit.camp === 'ally' ? A : B;
    if (hasBuff(unitActiveBuffs, 'carry') && unit.camp === 'ally') {
        unitAllyTeam = unitAllyTeam.concat(state.ally.filter(c => !c.alive));
        unitAllyTeam = unitAllyTeam.filter((u, i, arr) => arr.findIndex(v => v.uid === u.uid) === i);
    }
    let attackerBuffStats = computeBuffStats(unit, unitActiveBuffs, unitAllyTeam);
    unit.buffAtkBonus = attackerBuffStats.atkBonus;
    unit.buffDefBonus = attackerBuffStats.defBonus;
    unit.buffDodgeBonus = attackerBuffStats.dodgeBonus;
    unit.buffHpBonus = attackerBuffStats.hpBonus;

    let targetActiveBuffs = target.camp === 'ally' ? A._activeBuffs : B._activeBuffs;
    let targetAllyTeam = target.camp === 'ally' ? A : B;
    let defenderBuffStats = computeBuffStats(target, targetActiveBuffs, targetAllyTeam);
    target.buffAtkBonus = defenderBuffStats.atkBonus;
    target.buffDefBonus = defenderBuffStats.defBonus;
    target.buffDodgeBonus = defenderBuffStats.dodgeBonus;
    target.buffHpBonus = defenderBuffStats.hpBonus;

    if (resolveDodge(unit, target, attackerBuffStats, log)) return false;

    let dmgCalc = calcAttackDamage(unit, target, attackerBuffStats, defenderBuffStats);
    let { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, raw, rawFormula, thunderBonus, hornBonus, trueDmg } = dmgCalc;
    const rebelBonus = getRebelDmgBonus(unit);

    let dmg = Math.floor(raw);
    let hpAfter = Math.floor(target.hp) - dmg;
    let dead = hpAfter <= 0;
    if (dead) {
        target.hp = 0;
        target.alive = false;
        target._isDead = true;
        if (!target._deathTime) target._deathTime = Date.now();
    } else { target.hp = hpAfter; }
    unit.dmgDealt += dmg; target.dmgTaken += dmg;
    emitEvent(target, 'hp-change', { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: target.def });

    let allyBuffs_fortify = (target.camp === 'ally' ? A._activeBuffs : B._activeBuffs) || [];
    let reboundEntry = null;
    if (hasBuff(allyBuffs_fortify, 'fortify') && target.role === '防战' && dmg > 0) {
        let reboundDmg = Math.floor((atkAct - Math.floor(calcDamage(atkAct, defAct))) / 2);
        if (reboundDmg > 0) {
            let attHpBefore = Math.floor(unit.hp);
            unit.hp -= reboundDmg; target.reboundDone += reboundDmg;
            unit.dmgTaken += reboundDmg;
            if (unit.hp <= 0) {
                unit.alive = false;
                unit._isDead = true;
                if (!unit._deathTime) unit._deathTime = Date.now();
            }
            emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def });
            reboundEntry = {
                type: 'buff-rebound-fortify',
                text: `<span class="gold">🛡️ 严阵以待反弹${reboundDmg}给${unit.name}，${unit.name}血量 ${attHpBefore} → ${Math.floor(unit.hp)}</span>`,
                buffType: 'fortify_rebound', reboundDmg: reboundDmg, attackerUid: unit.uid, defenderUid: target.uid
            };
        }
    }

    let hpPctBefore = Math.floor((hpBefore / target.maxHp) * 100), hpPctAfter = Math.floor((target.hp / target.maxHp) * 100);
    let campA = unit.camp === 'ally' ? '明教' : '六大派', campD = target.camp === 'ally' ? '明教' : '六大派';
    let ac = unit.camp === 'ally' ? 'blue' : 'orange', dc = target.camp === 'ally' ? 'blue' : 'orange';
    let displayAtk = Math.floor(unit.atk + unit.atk * attackerBuffStats.atkBonus);
    let displayDef = Math.floor(target.def + target.def * defenderBuffStats.defBonus);
    let unitHpBefore = Math.floor(unit.hp);
    let group = { type:'attack-group', uidA:unit.uid, uidD:target.uid, entries:[], hpAfter:target.hp, alive:target.alive, isDead:dead, waveTaunt, waveUnit, unitRole:unit.role, _fxSnapshot:makeFXSnapshot(unit,target), _dmg:dmg, _isZhangNear:unit.isZhang && !unit.rangedForm, _nearAtkCount:unit.nearAtkCount, hpPctBefore, hpPctAfter, isMiss:miss, isDodge:false, buffEffects:[], _atkBonus:Math.floor(unit.atk * attackerBuffStats.atkBonus), _defBonus:Math.floor(target.def * defenderBuffStats.defBonus) };
    group.entries.push({type:'combat-text', text:`<span class="${ac}">${campA} ${unit.name}</span>(攻${displayAtk} 血${unitHpBefore}) → <span class="${dc}">${campD} ${target.name}</span>(防${displayDef} 血${hpBefore})`});
    group.entries.push({type:'detail', text:`<span class="gray small">波动：攻${atkBase}→${atkAct} 防${defBase}→${defAct} 血${hpBonus >= 0 ? '+' + hpBonus : hpBonus}</span>`});

    if (thunderBonus > 0) group.entries.push({type:'detail', text:`<span class="red small">💥 混元霹雳劲+${thunderBonus}真实伤害</span>`});
    if (hornBonus.defIgnore > 0) {
        let poisonTag = hornBonus.dmgMultiplier > 1 ? '，目标已中毒伤害+50%' : '';
        group.entries.push({type:'detail', text:`<span class="purple small">🦌 鹿角杖法：防御 ${dmgCalc.defReduction || ''}（忽略${Math.round(hornBonus.defIgnore*100)}%）${poisonTag}</span>`});
    }
    if (trueDmg > 0) group.entries.push({type:'detail', text:`<span class="red small">⚔️ 叛逆真伤+${trueDmg}（目标当前生命10%）</span>`});
    group.entries.push({type:'detail', text:`<span class="gray small">计算：${rawFormula}</span>`});
    group.entries.push({type:'damage-text', deadFlag:dead, text:`<span class="damage-line ${dead?'brush-red':''} ${ac}">${dead?'💀击杀💀 ':''}${campA} ${unit.name}</span> 造成 <span class="red">${dmg}</span> 伤害，<span class="${dc}">${campD} ${target.name}</span> ${hpBefore} → ${Math.floor(target.hp)} ${dead?'💀阵亡':''}`});

    if (unit.camp === 'ally' && unit.isZhang && unit.alive) {
        const hpBefore = Math.floor(unit.hp);
        let heal = Math.floor(unit.maxHp * 0.05); 
        unit.hp = Math.min(unit.maxHp, unit.hp + heal); 
        unit.healDone += heal;
        group.entries.push({type:'info', text:`<span class="green">☀️ 九阳神功回复${heal}，${hpBefore}→${Math.floor(unit.hp)}</span>`, isHealEntry:true});
        emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def });
        if (!unit.rangedForm) {
            if (unit.nearAtkCount === 0 && !unit._zhangTauntDone) {
                let firstTaunt = getZhangNearTaunt(1);
                if (firstTaunt) { group.entries.push({type:'info', text:`<span class="gold">🗣️ ${unit.name}：${firstTaunt}</span>`}); unit._zhangTauntDone = true; }
            }
            unit.nearAtkCount++;
            if (unit.nearAtkCount === 2) {
                let secondTaunt = getZhangNearTaunt(2);
                if (secondTaunt) group.entries.push({type:'info', text:`<span class="gold">🗣️ ${unit.name}：${secondTaunt}</span>`});
            }
            if (unit.nearAtkCount === 3) unit.ronghui = true;
            if (unit.nearAtkCount === 3) {
                let zt = getZhangNearTaunt(3); if (zt) group.entries.push({type:'info', text:`<span class="gold">🗣️ ${unit.name}：${zt}</span>`});
                let extra = Math.floor(target.atk * 0.15); target.hp -= extra; unit.dmgDealt += extra;
                if (target.hp <= 0) {
                    target.hp = 0;
                    target.alive = false;
                    target._isDead = true;
                    if (!target._deathTime) target._deathTime = Date.now();
                }
                emitEvent(target, 'hp-change', { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: target.def });
                group.entries.push({type:'info', text:`<span class="red">🔥 融会贯通额外+${extra}（目标攻击${Math.floor(target.atk)}×15%）</span>`});
            }
        }
    }
    if (target.camp === 'ally' && (target.pos === 4 || target.pos === 6) && dmg > 0) {
        let zhang = (target.camp === 'ally' ? A : B).find(c => c.isZhang && c.alive && c.rangedForm);
        if (zhang) {
            let rebound = Math.floor(dmg * 0.15);
            unit.hp = Math.max(0, unit.hp - rebound);
            unit.dmgTaken += rebound;
            unit.dmgTaken += rebound;
            zhang.reboundDone += rebound;
            if (unit.hp <= 0) {
                unit.alive = false;
                unit._isDead = true;
                unit._flash = 'dead';
                if (!unit._deathTime) unit._deathTime = Date.now();
            }
            let selfDmg = Math.floor(rebound * 0.1);
            zhang.hp -= selfDmg;
            zhang.dmgTaken += selfDmg;
            group.entries.push({type:'info', text:`<span class="gold">✨ 乾坤大挪移反弹${rebound}给${unit.name}（无忌自伤${selfDmg}）</span>`, buffType:'rebound'});
            if (unit.hp <= 0) { unit.alive = false; unit._isDead = true; }
            if (zhang.hp <= 0) {
                zhang.hp = 0;
                zhang.alive = false;
                zhang._isDead = true;
                if (!zhang._deathTime) zhang._deathTime = Date.now();
            }
            emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def });
            emitEvent(zhang, 'hp-change', { hp: zhang.hp, maxHp: zhang.maxHp, alive: zhang.alive, atk: zhang.atk, def: zhang.def });
        }
    }
    if (unit.camp === 'ally' && unit.isWei && dmg > 0) {
        let heal = Math.floor(dmg * 0.15);
        let wasFullHp = (unit.hp >= unit.maxHp);
        unit.maxHp += heal;
        unit.hp = Math.min(unit.hp + heal, unit.maxHp);
        if (wasFullHp) { unit.hp = unit.maxHp; }
        unit.healDone += heal; unit.leechDone += heal;
        group.entries.push({type:'info', text:`<span class="green">🦇 韦一笑吸血+${heal}，上限→${Math.floor(unit.maxHp)}</span>`, isHealEntry:true, healAmount:heal, healUnitUid:unit.uid});
        emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def });
    }
    unit._acted = true;
    log.push(group);
    
    applyXinHunDeduction(unit, allySide, log);
    let nineYinTotal = applyPostAttackEffects(unit, target, dmg, atkAct, defAct, reboundEntry, allySide, enemySide, log, A);
    group._events = [...window._battleEvents];
    window._battleEvents = [];
    if (nineYinTotal > 0) {
        group._dmg += nineYinTotal;
    }

    if (doubleStrikeUnitUid && unit.uid === doubleStrikeUnitUid && unit.alive && unit.camp === 'ally' && !unit._doubleStriked) {
        if (rand(1,100) <= 80) {
            log.push({type:'info', text:`<span class="gold">⚡ 概率连击触发！</span>`, isDoubleStrikeBanner:true});
            unit._doubleStriked = true; unit._acted = false;
            processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid);
        } else {
            log.push({type:'info', text:`<span class="gray">⚡ 概率连击触发失败，${unit.name} 未能再次攻击</span>`});
        }
    }

    if (canXingFenTrigger(unit) && enemySide.some(u => u.alive)) {
        consumeXingFen(unit);
        log.push({type:'info', text:`<span class="gold">💗 性奋：${unit.name} 获得额外攻击机会！</span>`});
        processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid);
    }

    return true;
}

// ==================== 新增：逐步执行生成器 ====================

export function* createRoundStepper(state) {
    let A = state.ally.filter(u => u.alive).map(u => u.clone());
    let B = state.enemy.filter(u => u.alive).map(u => u.clone());
    let log = [];
    let round = state.round;
    
    A._activeBuffs = state.activeBuffs.filter(b => b.target === 'ally' || !b.target);
    B._activeBuffs = state.activeBuffs.filter(b => b.target === 'enemy');
    
    window._battleEvents = [];
    
    log.push({ type:'round-start', text:`<div class="separator">———— 第${round}回合开始 ————</div>` });
    
    tickKuaiLeHeal(A.concat(B), log);
    
    A.concat(B).forEach(u => {
        if (!u.alive) return;
        const dot = tickXuanmingPoison(u);
        if (dot > 0) {
            log.push({ type:'info', text:`<span class="purple">❄️ 玄冥神掌寒毒发作，${u.name} 受到 ${dot} 点伤害</span>` });
            emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def });
        }
    });
    
    spawnHorse(A, log, B);
    spawnHorse(B, log, A);
    
    applyXingFenGrant(B, log);
    
    let doubleStrikeUnitUid = null;
    if (hasBuff(A._activeBuffs, 'doubleStrike')) {
        let candidates = A.filter(u => u.alive && !u.isHorse);
        if (candidates.length > 0) {
            let chosen = candidates[rand(0, candidates.length - 1)];
            doubleStrikeUnitUid = chosen.uid;
        }
    }
    
    window._currentBattleState = { ally: state.ally, enemy: state.enemy };
    logBuffSummary(A, log, doubleStrikeUnitUid);
    
    log.filter(l => l.type === 'buff-summon').forEach(hl => {
        const team = hl.buffType === 'summon' ? A : B;
        const horse = team.find(u => u.uid === hl.horseUid);
        if (horse) {
            emitFullUnitState(horse, 'unit-add');
        }
    });
    
    A.forEach(u => {
        if (!u.alive) return;
        let allyTeamWithDead = A.slice();
        if (hasBuff(A._activeBuffs, 'carry')) {
            allyTeamWithDead = allyTeamWithDead.concat(state.ally.filter(c => !c.alive));
            allyTeamWithDead = allyTeamWithDead.filter((u, i, arr) => arr.findIndex(v => v.uid === u.uid) === i);
        }
        let stats = computeBuffStats(u, A._activeBuffs || [], allyTeamWithDead);
        u.buffAtkBonus = stats.atkBonus;
        u.buffDefBonus = stats.defBonus;
        u.buffDodgeBonus = stats.dodgeBonus;
        u.buffHpBonus = stats.hpBonus;
        emitEvent(u, 'stat-bonus-change', {
            buffAtkBonus: stats.atkBonus,
            buffDefBonus: stats.defBonus,
            buffDodgeBonus: stats.dodgeBonus,
            buffHpBonus: stats.hpBonus
        });
        if (hasBuff(A._activeBuffs, 'carry') && u.pos === 5 && u._baseMaxHp !== undefined && !u.isHorse) {
            let oldMaxHp = u.maxHp, oldHp = u.hp;
            let extraHp = Math.floor(u._baseMaxHp * stats.hpBonus);
            let newMaxHp = u._baseMaxHp + extraHp;
            if (newMaxHp > oldMaxHp) {
                u.maxHp = newMaxHp;
                u.hp = Math.min(u.hp + (newMaxHp - oldMaxHp), newMaxHp);
            } else if (newMaxHp < oldMaxHp && oldMaxHp > 0) {
                u.maxHp = newMaxHp;
                u.hp = Math.min(u.hp, newMaxHp);
            }
            emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def });
        }
        u._extinctionUsed = false;
        u._acted = false;
    });
    
    B.forEach(u => {
        if (!u.alive) return;
        let stats = computeBuffStats(u, B._activeBuffs || [], B);
        u.buffAtkBonus = stats.atkBonus;
        u.buffDefBonus = stats.defBonus;
        u.buffDodgeBonus = stats.dodgeBonus;
        u.buffHpBonus = stats.hpBonus;
        emitEvent(u, 'stat-bonus-change', {
            buffAtkBonus: stats.atkBonus,
            buffDefBonus: stats.defBonus,
            buffDodgeBonus: stats.dodgeBonus,
            buffHpBonus: stats.hpBonus
        });
        u._extinctionUsed = false;
        u._acted = false;
    });

    // 产出回合开始步骤
    const roundStartEvents = [...window._battleEvents];
    window._battleEvents = [];
    yield { log: [...log], events: roundStartEvents, ally: A, enemy: B, winner: null, done: false };
    log = [];

    // 构建行动队列
    const actionQueue = [];
    
    const kuLianUnit = checkKuLian(B);
    if (kuLianUnit) {
        kuLianUnit._kuLianActive = true;
        log.push({ type:'info', text:`<span class="gold">🏋️ 苦练：${kuLianUnit.name} 每回合最先行动！</span>` });
        actionQueue.push({ unit: kuLianUnit, side: 'enemy' });
    }
    
    // 交替顺序：从敌方开始
    let currentSide = 'enemy';
    let allyRemaining = A.filter(u => u.alive && !u._acted).sort((a, b) => a.pos - b.pos);
    let enemyRemaining = B.filter(u => u.alive && !u._acted).sort((a, b) => a.pos - b.pos);
    // 排除苦练单位
    if (kuLianUnit) enemyRemaining = enemyRemaining.filter(u => u.uid !== kuLianUnit.uid);
    
    while (allyRemaining.length > 0 || enemyRemaining.length > 0) {
        if (currentSide === 'enemy' && enemyRemaining.length > 0) {
            actionQueue.push({ unit: enemyRemaining.shift(), side: 'enemy' });
            currentSide = 'ally';
        } else if (currentSide === 'ally' && allyRemaining.length > 0) {
            actionQueue.push({ unit: allyRemaining.shift(), side: 'ally' });
            currentSide = 'enemy';
        } else if (enemyRemaining.length > 0) {
            actionQueue.push({ unit: enemyRemaining.shift(), side: 'enemy' });
        } else if (allyRemaining.length > 0) {
            actionQueue.push({ unit: allyRemaining.shift(), side: 'ally' });
        }
    }

    // 逐个执行行动
    for (const action of actionQueue) {
        let unit = action.unit;
        let allySide = unit.camp === 'ally' ? A : B;
        let enemySide = unit.camp === 'ally' ? B : A;

        if (unit.isZhang && !unit._zhangSwitched) checkZhangSwitch(A, log);
        unit._blocked = isBlocked(unit, allySide);
        unit.survivedRounds++;

        if ((unit.isHorse && unit.atk <= 0) || (unit._blocked && isMelee(unit.role))) {
            if (unit._blocked && isMelee(unit.role)) {
                let hpBefore = Math.floor(unit.hp);
                unit.hp = Math.min(unit.maxHp, unit.hp + 10);
                let hpAfter = Math.floor(unit.hp);
                unit._resting = true;
                emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def });
                let bg = {type:'attack-group', uidA:unit.uid, uidD:null, entries:[], isBlock:true, _fxSnapshot:makeFXSnapshot(unit,null), waveTaunt:null, waveUnit:null, buffEffects:[], healAmount: 10, healUnitUid: unit.uid};
                bg.entries.push({type:'combat-text', text:`<span class="${unit.camp==='ally'?'blue':'orange'}">${unit.camp==='ally'?'明教':'六大派'} ${unit.name}</span> 被遮挡`});
                bg.entries.push({type:'info', text:`<span class="green">休息回复10点生命（${hpBefore} → ${hpAfter}）</span>`});
                bg._events = [...window._battleEvents];
                window._battleEvents = [];
                log.push(bg);
            } else if (unit.isHorse) {
                log.push({type:'info', text:`<span class="gray">🐴 拒马无法攻击，自动跳过</span>`});
            }
            unit._acted = true;
        } else {
            processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid);
        }

        // 产出步骤
        const stepEvents = [...window._battleEvents];
        window._battleEvents = [];
        const allyAlive = A.some(u => u.alive);
        const enemyAlive = B.some(u => u.alive);
        let winner = null;
        let done = false;
        if (!allyAlive) { winner = '六大派'; done = true; }
        else if (!enemyAlive) { winner = '明教'; done = true; }
        
        yield { log: [...log], events: stepEvents, ally: A, enemy: B, winner, done };
        log = [];
        
        if (done) return;
    }

    // 回合结束
    destroyHorse(A, log); destroyHorse(B, log);
    
    log.filter(l => l.type === 'buff-destroy').forEach(hl => {
        const team = hl.buffType === 'destroy' ? A : B;
        const horse = team.find(u => u.uid === hl.horseUid);
        if (horse) {
            emitEvent(horse, 'unit-remove', { uid: horse.uid });
        }
    });
    
    A._activeBuffs = (A._activeBuffs || []).map(b => ({...b, remaining: b.remaining - 1})).filter(b => b.remaining > 0);
    B._activeBuffs = (B._activeBuffs || []).map(b => ({...b, remaining: b.remaining - 1})).filter(b => b.remaining > 0);

    let winner = null;
    let done = false;
    if (B.every(c => !c.alive)) { winner = '明教'; done = true; }
    else if (A.every(c => !c.alive)) { winner = '六大派'; done = true; }
    if (round >= C.MAX_ROUND && !done) { winner = '平局'; done = true; }
    
    if (winner) {
        let losers = winner === '明教' ? B : A;
        losers.forEach(u => {
            u.hp = 0;
            u.alive = false;
            u._isDead = true;
            if (!u._deathTime) u._deathTime = Date.now();
        });
    }
    
    log.push({type:'round-end', text:`<div class="separator">———— 第${round}回合结束 ————</div>`});

    const endEvents = [...window._battleEvents];
    window._battleEvents = [];
    yield { log: [...log], events: endEvents, ally: A, enemy: B, winner, done };
}

// ==================== 保留原有 runBattleRound（内部调用生成器） ====================

export function runBattleRound(state) {
    const stepper = createRoundStepper(state);
    let finalResult = null;
    for (const step of stepper) {
        finalResult = step;
    }
    return {
        ally: finalResult.ally,
        enemy: finalResult.enemy,
        round: state.round,
        log: [],
        winner: finalResult.winner,
        activeBuffs: finalResult.ally._activeBuffs || [],
        doubleStrikeUid: null
    };
}

// ==================== 保留原有 runBattle ====================

export function runBattle(snapshot, activeBuffs = [], buffData = {}) {
    let state = {
        ally: snapshot.ally.map(u => u.clone()),
        enemy: snapshot.enemy.map(u => u.clone()),
        round: 1, activeBuffs: activeBuffs
    };
    let fullLog = [];
    let finalWinner = null;
    let doubleStrikeUids = [];
    while (true) {
        const stepper = createRoundStepper(state);
        let lastStep = null;
        for (const step of stepper) {
            fullLog = fullLog.concat(step.log);
            lastStep = step;
            if (step.done && step.winner) {
                finalWinner = step.winner;
                break;
            }
        }
        if (finalWinner) {
            return {
                winner: finalWinner, rounds: state.round, log: fullLog,
                ally: lastStep.ally, enemy: lastStep.enemy,
                activeBuffs: { ally: lastStep.ally._activeBuffs || [], enemy: [] },
                doubleStrikeUids
            };
        }
        state = {
            ally: lastStep.ally, enemy: lastStep.enemy,
            round: state.round + 1, activeBuffs: lastStep.ally._activeBuffs || []
        };
    }
}