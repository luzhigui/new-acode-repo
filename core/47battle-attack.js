// core/47battle-attack.js - 光明顶5v5 攻击流程模块
// V5.1.0 | ~27000 bytes | 2026-07-16 精英技能判定收敛至23elite-skills
export const VER = 'core/47battle-attack.js V5.1.0';

import { CONFIG, DEF_TAUNT, HP_TAUNT } from './01config-5v5-test.js';
import { rand, calcDamage, getFangLevel, isMelee, getFronts, isBlocked, getFlyDodgeRate, getRandomTaunt, getZhangNearTaunt, makeFXSnapshot, hasBuff, getUnitCol, getUnitRow } from './03battle-utils.js';
import { computeBuffStats, applyBuffEffectsBeforeAttack, applyBuffEffectsAfterAttack } from './04buff-system.js';
import {
    checkExtinctionCounter, checkNineYinClaw, getRebelTarget, getRebelDmgBonus, getRebelTrueDmg,
    getPhantomThunderBonus, applyXuanmingPalm, getHornStrikeBonus,
    checkKuLian, applyXingFenGrant, applyXinHunDeduction, applyXingFenPenalty,
    applyXiaoZhaoDerived, applyDamageModifiers, isXiaoZhaoPermanentActive,
    applyPhantomDisguise, applyXiaoZhaoMindControl, checkXiaoZhaoPermanentDoubleStrike,
    canXingFenTrigger, consumeXingFen
} from '../modules/23elite-skills.js';
const C = CONFIG, DT = DEF_TAUNT, HT = HP_TAUNT;

function emitEvent(unit, eventType, payload) {
    if (typeof window._emitEvent === 'function') window._emitEvent(unit, eventType, payload);
}

export function selectTarget(unit, enemySide) {
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

    // 成昆幻影伪装：收敛至23elite-skills
    const phantomResult = applyPhantomDisguise(unit, enemySide);
    if (phantomResult && target) {
        target = phantomResult.target;
    }

    return target;
}

export function resolveDodge(unit, target, attackerBuffStats, log) {
    const allyBuffs = (target.camp === 'ally' ? A._activeBuffs : B._activeBuffs) || (target.camp === 'enemy' ? B._activeBuffs : A._activeBuffs);
    const hasCloudBody = hasBuff(allyBuffs, 'cloudBody') || (target.isXiaoZhao && target._permanentBuffs && target._permanentBuffs.some(b => b.key === 'cloudBody'));
    if (!target.alive || (!target.isWei && !hasCloudBody && target._acted)) return false;
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
        if (!unit._deathTime) unit._deathTime = Date.now();
    }
    emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _isDead: unit._isDead || false });
    let dg = {type:'attack-group', uidA:target.uid, uidD:unit.uid, entries:[], isDodge:true, hpAfter:unit.hp, alive:unit.alive, _fxSnapshot:makeFXSnapshot(target,unit), waveTaunt:null, waveUnit:null, buffEffects:[], _atkBonus:0, _defBonus:0};
    if (target.isWei) {
        let heal = Math.floor(reboundDmg * 0.15);
        let wasFullHp = (target.hp >= target.maxHp);
        let newMaxHp = Math.min(target.maxHp + heal, target._baseMaxHp * 2);
        target.maxHp = newMaxHp;
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
    if (unit.hp <= 0) { unit.alive = false; unit._isDead = true; dg.isDead = true; dg.alive = false; dg.hpAfter = 0; dg.entries.push({type:'info', text:`${unit.name}被反击击杀！`}); }
    dg._events = [...window._battleEvents];
    window._battleEvents = [];
    log.push(dg);
    unit._acted = true;
    return true;
}

export function calcAttackDamage(unit, target, attackerBuffStats, defenderBuffStats) {
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
        let lv = getFangLevel(displayDef, unit.m), k = C.FANG_K[lv + 1] !== undefined ? C.FANG_K[lv + 1] : C.FANG_K[C.FANG_K.length - 1];
        let penPart = calcDamage(atkAct, defAct);
        raw = penPart + displayDef * k + unit.maxHp * C.HP_DMG_RATIO;
        rawFormula = `${Math.floor(penPart)} + ${Math.floor(displayDef)}×${k} + ${Math.floor(unit.maxHp)}×${C.HP_DMG_RATIO} = ${Math.floor(raw)}`;
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

export function applyPostAttackEffects(unit, target, dmg, atkAct, defAct, reboundEntry, allySide, enemySide, log, A) {
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
        emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _isDead: unit._isDead || false });
        log.push({type:'info', text:`<span class="red">⚔️ 灭绝双剑反击！${target.name} 对 ${unit.name} 造成 ${counterDmg} 点反击伤害</span>`, buffType:'elite_counter', uidD: unit.uid, isDead: !unit.alive});
    }
    const poisonLog = applyXuanmingPalm(unit, target);
    if (poisonLog) { log.push(poisonLog); }
    if (reboundEntry) { log.push(reboundEntry); }
    let dead = !target.alive;
    if (dead && target.camp === 'ally') { checkZhangSwitch(A, log); }
    return nineYinTotal;
}

// 辅助函数，定义在文件内使用
function checkZhangSwitch(A, log) {
    let zhang = A.find(c => c.isZhang && c.alive && !c._zhangSwitched);
    if (!zhang) return;
    let col = (zhang.pos - 1) % 3;
    let hasFrontAlly = A.some(c => c.alive && !c.isHorse && c.pos === 1 + col && c.uid !== zhang.uid);
    if (!hasFrontAlly) {
        zhang.rangedForm = false; zhang.atk += 3; zhang.def += 2;
        zhang.maxHp = Math.min(zhang.maxHp + 50, zhang._baseMaxHp * 2);
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

export function processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, lockedTargetUid = null) {
    // 连击锁定同一目标
    let target;
    if (lockedTargetUid) {
        target = enemySide.find(u => u.uid === lockedTargetUid && u.alive) || null;
        if (!target) target = selectTarget(unit, enemySide); // 目标死了，换目标
    } else {
        target = selectTarget(unit, enemySide);
    }
    let phantomLog = null;

    // 小昭永久惑人心智：改用23elite-skills新函数
    if (target && unit.camp === 'enemy') {
        const mindResult = applyXiaoZhaoMindControl(unit, allySide, enemySide);
        if (mindResult) {
            phantomLog = mindResult.log;
            target = mindResult.target;
        }
    }

    if (!target) {
        let emptyGroup = { type:'attack-group', uidA:unit.uid, uidD:null, entries:[], isMiss:true, _fxSnapshot:null, waveTaunt:null, waveUnit:null, buffEffects: [] };
        emptyGroup.entries.push({type:'combat-text', text:`<span class="${unit.camp==='ally'?'blue':'orange'}">${unit.camp==='ally'?'明教':'六大派'} ${unit.name}</span> 无法选择目标`});
        emptyGroup.entries.push({type:'info', text:`<span class="gray">无可选目标，跳过行动</span>`});
        emptyGroup._events = [...window._battleEvents];
        window._battleEvents = [];
        log.push(emptyGroup);
        unit._acted = true;
        return false;
    }

    let miss = false;
    let missChance = 0;
    if (unit.role === '远程') {
        missChance = 3;
    } else if (unit.role === '飞行') {
        missChance = 6;
    } else {
        missChance = 1;
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
        applyXingFenPenalty(unit, log);
        if (doubleStrikeUnitUid && unit.uid === doubleStrikeUnitUid && unit.alive && unit.camp === 'ally' && !unit._doubleStriked) {
    if (Math.random() < 0.15) {
                log.push({type:'info', text:`<span class="gold">⚡ 概率连击触发！</span>`, isDoubleStrikeBanner:true});
                unit._doubleStriked = true; unit._acted = false;
                // 锁定同一目标，除非目标死亡才换目标
                const lockedTargetUid = (target && target.alive) ? target.uid : null;
                processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, lockedTargetUid);
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
        unitAllyTeam = unitAllyTeam.concat((state.allAllies || state.ally).filter(c => !c.alive));
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

    if (resolveDodge(unit, target, defenderBuffStats, log)) return false;

    // 战士破防在攻击前执行，让伤害计算用削减后的防御
    let defReduced = 0;
    if (unit.role === '战士' && target.def > 0) {
        defReduced = Math.min(2, target.def);
        target.def = Math.max(0, target.def - 2);
        emitEvent(target, 'hp-change', { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: target.def, _isDead: target._isDead || false });
        // 暂存破防日志，待攻击组构建时插入
        unit._pendingDefReduceEntry = {type:'detail', text:`<span class="purple small">🗡️ ${unit.name} 破防：${target.name} 防御 -${defReduced}</span>`};
    }

    let dmgCalc = calcAttackDamage(unit, target, attackerBuffStats, defenderBuffStats);
    let { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, raw, rawFormula, thunderBonus, hornBonus, trueDmg } = dmgCalc;
    const rebelBonus = getRebelDmgBonus(unit);

    let dmg = Math.floor(raw);
    let hpAfter = Math.floor(target.hp) - dmg;
    let dead = hpAfter <= 0;

    // ★ 伤害修正钩子
    let bonusEntries = [];
    if (unit.camp !== 'ally') {
        const modifierResult = applyDamageModifiers(unit, target, dmg, A, B, log);
        dmg = modifierResult.modifiedDmg;
        bonusEntries = modifierResult.entries || [];
        const originalDmg = Math.floor(raw);
        if (dmg !== originalDmg) {
            rawFormula += `-30%=${Math.floor(dmg)}`;
        }
    }
    hpAfter = Math.floor(target.hp) - dmg;
    dead = hpAfter <= 0;

    if (dead) {
        target.hp = 0;
        target.alive = false;
        target._isDead = true;
        if (!target._deathTime) target._deathTime = Date.now();
    } else { target.hp = hpAfter; }

    const executeThreshold = A.some(u => u.isXiaoZhao && u.alive) ? 0.20 : 0.15;
    if (unit.role === '战士' && target.alive && target.hp > 0 && target.hp <= target.maxHp * executeThreshold) {
        target.hp = 0;
        target.alive = false;
        target._isDead = true;
        if (!target._deathTime) target._deathTime = Date.now();
        dead = true;
        // 斩杀日志（稍后会在 group 中显示）
        if (!unit._executeLog) unit._executeLog = [];
        unit._executeLog.push({type:'info', text:`<span class="red">⚔️ 战士斩杀！${unit.name} 直接击杀 ${target.name}！</span>`});
    }
    unit.dmgDealt += dmg; target.dmgTaken += dmg;
    if (unit.name === '成昆') {
        unit._phantomTarget = null;
    }
    if (unit.name === '成昆' && dmg > 0) {
        const enemyAlive = enemySide.filter(u => u.alive && !u.isHorse);
        if (enemyAlive.length > 0) {
            unit._phantomTarget = enemyAlive[rand(0, enemyAlive.length - 1)].uid;
            const lostHp = unit.maxHp - unit.hp;
            if (lostHp > 0) {
                const aliveCount = enemySide.filter(u => u.alive).length;
                const heal = Math.floor(lostHp * 0.06 * aliveCount);
                unit.hp = Math.min(unit.maxHp, unit.hp + heal);
                unit.healDone += heal;
                if (!unit._phantomHeal) unit._phantomHeal = 0;
                unit._phantomHeal += heal;
            }
            emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _phantomTarget: unit._phantomTarget });
        }
    }
    if (target.role === '防战' && dmg > 0) {
        if (!target._fortifyStacks) target._fortifyStacks = 0;
        if (target._fortifyStacks < 6) {
            target._fortifyStacks = Math.min(6, target._fortifyStacks + 0.5);
            target.def += 0.5;
        }
    }
    // 破防已在攻击前执行，此处不再重复
    emitEvent(target, 'hp-change', { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: target.def, _isDead: target._isDead || false });

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
            emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _isDead: unit._isDead || false });
            reboundEntry = {
                type: 'buff-rebound-fortify',
                text: `<span class="gold">🛡️ 严阵以待反弹${reboundDmg}给${unit.name}，${unit.name}血量 ${attHpBefore} → ${Math.floor(unit.hp)}</span>`,
                buffType: 'fortify_rebound', reboundDmg: reboundDmg, attackerUid: unit.uid, defenderUid: target.uid, uidD: unit.uid, isDead: !unit.alive
            };
        }
    }

    let hpPctBefore = Math.floor((hpBefore / target.maxHp) * 100), hpPctAfter = Math.floor((target.hp / target.maxHp) * 100);
    let campA = unit.camp === 'ally' ? '明教' : '六大派', campD = target.camp === 'ally' ? '明教' : '六大派';
    let ac = unit.camp === 'ally' ? 'blue' : 'orange', dc = target.camp === 'ally' ? 'blue' : 'orange';
    let displayAtk = Math.floor(unit.atk + unit.atk * attackerBuffStats.atkBonus);
    let displayDef = Math.floor(target.def + target.def * defenderBuffStats.defBonus);
    let unitHpBefore = Math.floor(unit.hp);
    let group = { type:'attack-group', uidA:unit.uid, uidD:target.uid, entries:[], hpAfter:target.hp, alive:target.alive, isDead:dead, waveTaunt, waveUnit, unitRole:unit.role, _fxSnapshot:makeFXSnapshot(unit,target), _dmg:dmg, _isZhangNear:unit.isZhang && !unit.rangedForm, _nearAtkCount:unit.nearAtkCount, hpPctBefore, hpPctAfter, isMiss:miss, isDodge:false, buffEffects:[], _atkBonus:Math.floor(unit.atk * attackerBuffStats.atkBonus), _defBonus:Math.floor(target.def * defenderBuffStats.defBonus), isKuLianAttack: !!(unit.name === '宋青书' && unit._kuLianActive) };
    // 将暂存的破防日志插入到战斗文本之前
    if (unit._pendingDefReduceEntry) {
        group.entries.push(unit._pendingDefReduceEntry);
        delete unit._pendingDefReduceEntry;
    }
    group.entries.push({type:'combat-text', text:`<span class="${ac}">${campA} ${unit.name}</span>(攻${displayAtk} 血${unitHpBefore}) → <span class="${dc}">${campD} ${target.name}</span>(防${displayDef} 血${hpBefore})`});
    if (phantomLog) group.entries.push({type:'info', text:`<span class="gold">${phantomLog}</span>`});
    group.entries.push({type:'detail', text:`<span class="gray small">波动：攻${atkBase}→${atkAct} 防${defBase}→${defAct} 血${hpBonus >= 0 ? '+' + hpBonus : hpBonus}</span>`});
    if (thunderBonus > 0) group.entries.push({type:'detail', text:`<span class="red small">💥 混元霹雳劲+${thunderBonus}真实伤害</span>`});
    if (hornBonus.defIgnore > 0) {
        let poisonTag = hornBonus.dmgMultiplier > 1 ? '，目标已中毒伤害+50%' : '';
        group.entries.push({type:'detail', text:`<span class="purple small">🦌 鹿角杖法：防御 ${dmgCalc.defReduction || ''}（忽略${Math.round(hornBonus.defIgnore*100)}%）${poisonTag}</span>`});
    }
    if (trueDmg > 0) group.entries.push({type:'detail', text:`<span class="red small">⚔️ 叛逆真伤+${trueDmg}（目标当前生命10%）</span>`});
    group.entries.push({type:'detail', text:`<span class="gray small">计算：${rawFormula}</span>`});
    group.entries.push({type:'damage-text', deadFlag:dead, text:`<span class="damage-line ${dead?'brush-red':''} ${ac}">${dead?'💀击杀💀 ':''}${campA} ${unit.name}</span> 造成 <span class="red">${dmg}</span> 伤害，<span class="${dc}">${campD} ${target.name}</span> ${hpBefore} → ${Math.floor(target.hp)} ${dead?'💀阵亡':''}`});
    if (unit._executeLog) {
        unit._executeLog.forEach(e => group.entries.push(e));
        delete unit._executeLog;
    }

    if (target.role === '防战' && dmg > 0 && target._fortifyStacks !== undefined) {
        group.entries.push({type:'detail', text:`<span class="blue small">🛡️ ${target.name} 坚盾：防御+0.5（已叠${target._fortifyStacks}/6）</span>`});
    }

    group._events = [...window._battleEvents];
    window._battleEvents = [];

    for (const entry of bonusEntries) {
        group.entries.push(entry);
    }

    if (unit.camp === 'ally' && unit.isZhang && unit.alive) {
        const hpBefore = Math.floor(unit.hp);
        let heal = Math.floor(unit.maxHp * 0.05);
        unit.hp = Math.min(unit.maxHp, unit.hp + heal);
        unit.healDone += heal;
        group.entries.push({type:'info', text:`<span class="green">☀️ 九阳神功回复+${heal}，${hpBefore}→${Math.floor(unit.hp)}</span>`, isHealEntry:true, healAmount:heal, healUnitUid:unit.uid});
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
                    group.isDead = true;
                    group.alive = false;
                    group.hpAfter = 0;
                }
                emitEvent(target, 'hp-change', { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: target.def, _isDead: target._isDead || false });
                group.entries.push({type:'info', text:`<span class="red">🔥 融会贯通额外+${extra}（目标攻击${Math.floor(target.atk)}×15%）</span>`});
            }
        }
    }
    if (target.camp === 'ally' && (target.pos === 4 || target.pos === 6) && dmg > 0) {
        let xiaoZhaoActive = A.find(u => u.isXiaoZhao && u.alive);
        if (!xiaoZhaoActive) {
            let zhang = A.find(c => c.isZhang && c.alive && c.rangedForm);
            if (zhang) {
                let rebound = Math.floor(dmg * (CONFIG.ELITE_SKILLS.xiaoZhao.normalReboundPct || 0.15));
                unit.hp = Math.max(0, unit.hp - rebound);
                unit.dmgTaken += rebound;
                zhang.reboundDone += rebound;
                if (unit.hp <= 0) {
                    unit.alive = false;
                    unit._isDead = true;
                    unit._flash = 'dead';
                    if (!unit._deathTime) unit._deathTime = Date.now();
                }
                let selfDmg = Math.max(1, Math.floor(rebound * (CONFIG.ELITE_SKILLS.xiaoZhao.normalSelfDmgPct || 0.1)));
                zhang.hp -= selfDmg;
                zhang.dmgTaken += selfDmg;
                emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _isDead: unit._isDead || false });
                emitEvent(zhang, 'hp-change', { hp: zhang.hp, maxHp: zhang.maxHp, alive: zhang.alive, atk: zhang.atk, def: zhang.def });
                group.entries.push({type:'info', text:`<span class="gold">✨ 乾坤大挪移反弹${rebound}给${unit.name}（无忌自伤${selfDmg}）</span>`, buffType:'rebound'});
                if (unit.hp <= 0) { unit.alive = false; unit._isDead = true; }
                if (zhang.hp <= 0) {
                    zhang.hp = 0;
                    zhang.alive = false;
                    zhang._isDead = true;
                    if (!zhang._deathTime) zhang._deathTime = Date.now();
                }
            }
        }
    }
    if (target.camp === 'ally' && dmg > 0) {
        applyXiaoZhaoDerived(A, target, dmg, group);
    }
    if (unit.role === '远程' && dmg > 0) {
        unit.atk += 2;
        emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def });
        group.entries.push({type:'detail', text:`<span class="blue small">🏹 ${unit.name} 远程熟练：攻击 +2 → ${Math.floor(unit.atk)}</span>`});
    }
    if (unit.role === '飞行' && dmg > 0) {
        if (!unit._dodgeStack) unit._dodgeStack = 0;
        unit._dodgeStack += 2;
    }
    // 嗜血狂刀：小昭在场时战士额外砍一刀
    if (unit.role === '战士' && hasBuff(unitActiveBuffs, 'bloodthirst') && dmg > 0 && target.alive && A.some(u => u.isXiaoZhao && u.alive) && !unit._bloodthirstStriked) {
        unit._bloodthirstStriked = true;
        processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, target.uid);
    }
    if (unit.camp === 'ally' && unit.isWei && dmg > 0) {
        let heal = Math.floor(dmg * 0.18);
        let wasFullHp = (unit.hp >= unit.maxHp);
        let newMaxHp = Math.min(unit.maxHp + heal, unit._baseMaxHp * 2);
        let hpDelta = newMaxHp - unit.maxHp;
        unit.maxHp = newMaxHp;
        unit.hp = Math.min(unit.hp + hpDelta, unit.maxHp);
        if (wasFullHp) { unit.hp = unit.maxHp; }
        unit.healDone += heal; unit.leechDone += heal;
        emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def });
        group.entries.push({type:'info', text:`<span class="green">🦇 韦一笑吸血+${heal}，上限→${Math.floor(unit.maxHp)}</span>`, isHealEntry:true, healAmount:heal, healUnitUid:unit.uid});
    }
    unit._acted = true;
    log.push(group);

    applyXinHunDeduction(unit, allySide, log);
    applyXingFenPenalty(unit, log);

    if (!unit._isLinkAttack && dmg > 0 && target.alive) {
        // 玄冥二老联动逻辑保持不变，因较复杂暂不收敛
        if (unit.name === '鹤笔翁') {
            const lu = allySide.find(u => u.name === '鹿杖客' && u.alive && !u._acted);
            if (!lu) {
                const luActed = allySide.find(u => u.name === '鹿杖客' && u.alive && u._acted);
                if (luActed && !luActed._linkTriggered) {
                    luActed._isLinkAttack = true;
                    luActed._linkTriggered = true;
                    const origSelectTarget = selectTarget;
                    selectTarget = (u, enemies) => enemies.find(e => e.uid === target.uid) || origSelectTarget(u, enemies);
                    processUnitAttack(luActed, allySide, enemySide, log, A, B, state, null);
                    selectTarget = origSelectTarget;
                    luActed._isLinkAttack = false;
                    luActed._acted = false;
                    emitEvent(luActed, 'hp-change', { hp: luActed.hp, maxHp: luActed.maxHp, alive: luActed.alive, atk: luActed.atk, def: luActed.def });
                }
            } else if (!lu._linkTriggered) {
                lu._isLinkAttack = true;
                lu._linkTriggered = true;
                const origSelectTarget = selectTarget;
                selectTarget = (u, enemies) => enemies.find(e => e.uid === target.uid) || origSelectTarget(u, enemies);
                processUnitAttack(lu, allySide, enemySide, log, A, B, state, null);
                selectTarget = origSelectTarget;
                lu._isLinkAttack = false;
                lu._acted = false;
                emitEvent(lu, 'hp-change', { hp: lu.hp, maxHp: lu.maxHp, alive: lu.alive, atk: lu.atk, def: lu.def });
            }
        } else if (unit.name === '鹿杖客') {
            const he = allySide.find(u => u.name === '鹤笔翁' && u.alive && !u._acted);
            if (!he) {
                const heActed = allySide.find(u => u.name === '鹤笔翁' && u.alive && u._acted);
                if (heActed && !heActed._linkTriggered) {
                    heActed._isLinkAttack = true;
                    heActed._linkTriggered = true;
                    const origSelectTarget = selectTarget;
                    selectTarget = (u, enemies) => enemies.find(e => e.uid === target.uid) || origSelectTarget(u, enemies);
                    processUnitAttack(heActed, allySide, enemySide, log, A, B, state, null);
                    selectTarget = origSelectTarget;
                    heActed._isLinkAttack = false;
                    heActed._acted = false;
                    emitEvent(heActed, 'hp-change', { hp: heActed.hp, maxHp: heActed.maxHp, alive: heActed.alive, atk: heActed.atk, def: heActed.def });
                }
            } else if (!he._linkTriggered) {
                he._isLinkAttack = true;
                he._linkTriggered = true;
                const origSelectTarget = selectTarget;
                selectTarget = (u, enemies) => enemies.find(e => e.uid === target.uid) || origSelectTarget(u, enemies);
                processUnitAttack(he, allySide, enemySide, log, A, B, state, null);
                selectTarget = origSelectTarget;
                he._isLinkAttack = false;
                he._acted = false;
                emitEvent(he, 'hp-change', { hp: he.hp, maxHp: he.maxHp, alive: he.alive, atk: he.atk, def: he.def });
            }
        }
    }

    let nineYinTotal = applyPostAttackEffects(unit, target, dmg, atkAct, defAct, reboundEntry, allySide, enemySide, log, A);
    if (nineYinTotal > 0) {
        group._dmg += nineYinTotal;
    }

    if (doubleStrikeUnitUid && unit.uid === doubleStrikeUnitUid && unit.alive && unit.camp === 'ally' && !unit._doubleStriked) {
        if (rand(1,100) <= 80) {
            log.push({type:'info', text:`<span class="gold">⚡ 概率连击触发！</span>`, isDoubleStrikeBanner:true});
            unit._doubleStriked = true; unit._acted = false;
            // 锁定同一目标，除非目标死亡才换目标
            const lockedTargetUid = (target && target.alive) ? target.uid : null;
            processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, lockedTargetUid);
        } else {
            log.push({type:'info', text:`<span class="gray">⚡ 概率连击触发失败，${unit.name} 未能再次攻击</span>`});
        }
    }

    // 小昭永久概率连击：改用23elite-skills新函数
    if (unit.isXiaoZhao && checkXiaoZhaoPermanentDoubleStrike(unit, A._activeBuffs) && unit.alive) {
        unit._xiaoZhaoDoubleStriked = true;
        unit._acted = false;
        log.push({type:'info', text:`<span class="gold">🦋 蝶击：小昭永久概率连击触发！</span>`, isDoubleStrikeBanner:true});
        const lockedTargetUid = (target && target.alive) ? target.uid : null;
        processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, lockedTargetUid);
    }

    if (canXingFenTrigger(unit) && enemySide.some(u => u.alive)) {
        consumeXingFen(unit);
        log.push({type:'info', text:`<span class="gold">💗 性奋：${unit.name} 获得额外攻击机会！</span>`});
        processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid);
    }

    return true;
}