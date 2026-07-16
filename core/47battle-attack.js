// ===== ../core/47battle-attack.js =====
// core/47battle-attack.js - 光明顶5v5 攻击流程模块
// V5.1.0 | ~27000 bytes | 2026-07-16 从06battle-engine-core拆分
export const VER = 'core/47battle-attack.js V5.1.0';

import { CONFIG, DEF_TAUNT, HP_TAUNT } from './01config-5v5-test.js';
import { rand, calcDamage, getFangLevel, isMelee, getFronts, isBlocked, getFlyDodgeRate, getRandomTaunt, getZhangNearTaunt, makeFXSnapshot, hasBuff, getUnitCol, getUnitRow } from './03battle-utils.js';
import { computeBuffStats, applyBuffEffectsBeforeAttack, applyBuffEffectsAfterAttack } from './04buff-system.js';
import {
    checkExtinctionCounter, checkNineYinClaw, getRebelTarget, getRebelDmgBonus, getRebelTrueDmg,
    getPhantomThunderBonus, applyXuanmingPalm, getHornStrikeBonus,
    checkKuLian, applyXingFenGrant, applyXinHunDeduction, applyXingFenPenalty,
    applyXiaoZhaoDerived, applyDamageModifiers, isXiaoZhaoPermanentActive
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

    // 成昆幻影伪装：混乱判定 —— 攻击者去打自己阵营里成昆伪装的那个队友
    if (target && unit.camp === 'ally') {
        const chengkun = enemySide.find(u => u.name === '成昆' && u.alive && u._phantomTarget);
        if (chengkun && !unit._isLinkAttack) {
            const lostPct = (chengkun.maxHp - chengkun.hp) / chengkun.maxHp;
            const chance = CONFIG.ELITE_SKILLS.phantomDisguise.baseChance + Math.floor(lostPct * 10) * CONFIG.ELITE_SKILLS.phantomDisguise.per10pctLost;
            if (Math.random() < chance) {
                const fakeTarget = enemySide.find(u => u.uid === chengkun._phantomTarget && u.alive && !u.isHorse);
                if (fakeTarget) {
                    chengkun._phantomLog = `🌀 幻影伪装！${unit.name}被混乱，误攻队友${fakeTarget.name}！`;
                    target = fakeTarget;
                }
            }
        }
    }

    return target;
}

export function resolveDodge(unit, target, attackerBuffStats, log) {
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
    // 小昭永久惑人心智：20%概率混乱敌方，使其攻击自己人（仅团队惑人心智消失后激活）
    if (target && unit.camp === 'enemy') {
        const xiaoZhao = enemySide.find(u => u.isXiaoZhao && u.alive);
        if (xiaoZhao && xiaoZhao._permanentBuffs && xiaoZhao._permanentBuffs.some(b => b.key === 'mindControl') && !hasBuff(enemySide._activeBuffs, 'mindControl')) {
            if (Math.random() < 0.20) {
                // 敌方阵营中随机选一个存活非拒马单位作为攻击目标
                const xzFakeTarget = enemySide.find(u => u.uid !== unit.uid && u.alive && !u.isHorse);
                if (xzFakeTarget) {
                    phantomLog = `🦋 蝶舞迷心！${unit.name}被小昭迷惑，误攻队友${xzFakeTarget.name}！`;
                    target = xzFakeTarget;
                }
            }
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

    let dmgCalc = calcAttackDamage(unit, target, attackerBuffStats, defenderBuffStats);
    let { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, raw, rawFormula, thunderBonus, hornBonus, trueDmg } = dmgCalc;
    const rebelBonus = getRebelDmgBonus(unit);

    let dmg = Math.floor(raw);
    let hpAfter = Math.floor(target.hp) - dmg;
    let dead = hpAfter <= 0;

    // ★ 伤害修正钩子：乾坤大挪移升级版等，在伤害应用前统一处理
    let bonusEntries = [];
    if (unit.camp === 'ally') {
        // 攻击者是明教 → target 是六大派，不需要处理明教防御技能
    } else {
        // 攻击者是六大派 → target 是明教，触发防御技能
        const modifierResult = applyDamageModifiers(unit, target, dmg, A, B, log);
        dmg = modifierResult.modifiedDmg;
        bonusEntries = modifierResult.entries || [];
        // 减伤后更新公式显示（乾坤大挪移固定30%减伤）
        const originalDmg = Math.floor(raw);
        if (dmg !== originalDmg) {
            rawFormula += `-30%=${Math.floor(dmg)}`;
        }
    }
    hpAfter = Math.floor(target.hp) - dmg;
    dead = hpAfter <= 0;

    // 应用伤害
    if (dead) {
        target.hp = 0;
        target.alive = false;
        target._isDead = true;
        if (!target._deathTime) target._deathTime = Date.now();
    } else { target.hp = hpAfter; }
    // 战士普攻斩杀：目标剩余血量 ≤ 最大血量 15% 时直接击杀
    if (unit.role === '战士' && target.alive && target.hp > 0 && target.hp <= target.maxHp * 0.15) {
        target.hp = 0;
        target.alive = false;
        target._isDead = true;
        if (!target._deathTime) target._deathTime = Date.now();
        dead = true;
    }
    unit.dmgDealt += dmg; target.dmgTaken += dmg;
    // 成昆幻影伪装：攻击前变回自己
    if (unit.name === '成昆') {
        unit._phantomTarget = null;
    }
    // 成昆幻影伪装：攻击后随机模仿一个对方单位，并回复已损失生命值的30%
    if (unit.name === '成昆' && dmg > 0) {
        const enemyAlive = enemySide.filter(u => u.alive && !u.isHorse);
        if (enemyAlive.length > 0) {
            unit._phantomTarget = enemyAlive[rand(0, enemyAlive.length - 1)].uid;
            // 变身回复已损失生命值的30%
            const lostHp = unit.maxHp - unit.hp;
            if (lostHp > 0) {
                const heal = Math.floor(lostHp * 0.3);
                unit.hp = Math.min(unit.maxHp, unit.hp + heal);
                unit.healDone += heal;
                // 注意：group 尚未定义，这里稍后会在 group 中加条目，暂时先累积
                if (!unit._phantomHeal) unit._phantomHeal = 0;
                unit._phantomHeal += heal;
            }
            emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _phantomTarget: unit._phantomTarget });
        }
    }
    let defReduced = 0;
    // 防战被攻击时积攒防御：每次被攻击 +1，上限 +6
    if (target.role === '防战' && dmg > 0) {
        if (!target._fortifyStacks) target._fortifyStacks = 0;
        if (target._fortifyStacks < 6) {
            target._fortifyStacks += 1;
            target.def += 1;
        }
    }
    if (unit.role === '战士' && dmg > 0 && target.def > 0) {
        defReduced += Math.min(2, target.def);
        target.def = Math.max(0, target.def - 2);
    }
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
    if (defReduced > 0) {
        group.entries.push({type:'detail', text:`<span class="purple small">🗡️ ${unit.name} 破防：${target.name} 防御 -${defReduced}</span>`});
    }
    // 防战被攻击积攒防御日志
    if (target.role === '防战' && dmg > 0 && target._fortifyStacks !== undefined) {
        group.entries.push({type:'detail', text:`<span class="blue small">🛡️ ${target.name} 坚盾：防御+1（已叠${target._fortifyStacks}/6）</span>`});
    }

    // ★ 普攻事件快照：在精英技能/特效之前抓取，只含本次普攻的血量变化
    group._events = [...window._battleEvents];
    window._battleEvents = [];

    // 附加伤害修正日志（乾坤升级版等）
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
    // 普通乾坤大挪移：仅保护4/6号位
    if (target.camp === 'ally' && (target.pos === 4 || target.pos === 6) && dmg > 0) {
        let xiaoZhaoActive = A.find(u => u.isXiaoZhao && u.alive);
        if (!xiaoZhaoActive) { // 小昭在场时走升级版，不执行普通版
            let zhang = A.find(c => c.isZhang && c.alive && c.rangedForm);
            if (zhang) {
                let rebound = Math.floor(dmg * 0.15);
                unit.hp = Math.max(0, unit.hp - rebound);
                unit.dmgTaken += rebound;
                zhang.reboundDone += rebound;
                if (unit.hp <= 0) {
                    unit.alive = false;
                    unit._isDead = true;
                    unit._flash = 'dead';
                    if (!unit._deathTime) unit._deathTime = Date.now();
                }
                let selfDmg = Math.max(1, Math.floor(rebound * 0.1));
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
    // 小昭衍生版乾坤大挪移：队友受伤时触发减伤/治疗/加攻（无忌不在时）
    if (target.camp === 'ally' && dmg > 0) {
        applyXiaoZhaoDerived(A, target, dmg, group);
    }
    if (unit.role === '远程' && dmg > 0) {
        unit.atk += 2;
        emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def });
        group.entries.push({type:'detail', text:`<span class="blue small">🏹 ${unit.name} 远程熟练：攻击 +2 → ${Math.floor(unit.atk)}</span>`});
    }
    // 飞行单位每次攻击后闪避率 +2%
    if (unit.role === '飞行' && dmg > 0) {
        if (!unit._dodgeStack) unit._dodgeStack = 0;
        unit._dodgeStack += 2;
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

    // 玄冥二老联动：互相触发攻击，锁定同一目标
    if (!unit._isLinkAttack && dmg > 0 && target.alive) {
        if (unit.name === '鹤笔翁') {
            // 鹤笔翁攻击后，如果鹿杖客还没行动，触发他联动
            const lu = allySide.find(u => u.name === '鹿杖客' && u.alive && !u._acted);
            if (!lu) {
                // 鹿杖客已经行动过了，检查是否是被联动触发的，如果是则让他再次联动
                const luActed = allySide.find(u => u.name === '鹿杖客' && u.alive && u._acted && u._isLinkAttack);
                if (luActed) {
                    luActed._acted = false;
                    luActed._isLinkAttack = true;
                    const origSelectTarget = selectTarget;
                    selectTarget = (u, enemies) => enemies.find(e => e.uid === target.uid) || origSelectTarget(u, enemies);
                    processUnitAttack(luActed, allySide, enemySide, log, A, B, state, null);
                    selectTarget = origSelectTarget;
                    luActed._isLinkAttack = false;
                    luActed._acted = false;
                }
            } else {
                // 鹿杖客还没行动，正常触发联动
                lu._isLinkAttack = true;
                const origSelectTarget = selectTarget;
                selectTarget = (u, enemies) => enemies.find(e => e.uid === target.uid) || origSelectTarget(u, enemies);
                processUnitAttack(lu, allySide, enemySide, log, A, B, state, null);
                selectTarget = origSelectTarget;
                lu._isLinkAttack = false;
                lu._acted = false;
            }
        } else if (unit.name === '鹿杖客') {
            // 鹿杖客攻击后，如果鹤笔翁还没行动，触发他联动
            const he = allySide.find(u => u.name === '鹤笔翁' && u.alive && !u._acted);
            if (!he) {
                // 鹤笔翁已经行动过了，检查是否是被联动触发的，如果是则让他再次联动
                const heActed = allySide.find(u => u.name === '鹤笔翁' && u.alive && u._acted && u._isLinkAttack);
                if (heActed) {
                    heActed._acted = false;
                    heActed._isLinkAttack = true;
                    const origSelectTarget = selectTarget;
                    selectTarget = (u, enemies) => enemies.find(e => e.uid === target.uid) || origSelectTarget(u, enemies);
                    processUnitAttack(heActed, allySide, enemySide, log, A, B, state, null);
                    selectTarget = origSelectTarget;
                    heActed._isLinkAttack = false;
                    heActed._acted = false;
                }
            } else {
                // 鹤笔翁还没行动，正常触发联动
                he._isLinkAttack = true;
                const origSelectTarget = selectTarget;
                selectTarget = (u, enemies) => enemies.find(e => e.uid === target.uid) || origSelectTarget(u, enemies);
                processUnitAttack(he, allySide, enemySide, log, A, B, state, null);
                selectTarget = origSelectTarget;
                he._isLinkAttack = false;
                he._acted = false;
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
            processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid);
        } else {
            log.push({type:'info', text:`<span class="gray">⚡ 概率连击触发失败，${unit.name} 未能再次攻击</span>`});
        }
    }
    // 小昭永久概率连击：80%概率触发，锁定同一目标（仅团队概率连击消失后激活）
    if (unit.isXiaoZhao && unit._permanentBuffs && unit._permanentBuffs.some(b => b.key === 'doubleStrike') && unit.alive && !unit._xiaoZhaoDoubleStriked && !hasBuff(A._activeBuffs, 'doubleStrike')) {
        const xzDoubleStrikeChance = window._xzDoubleStrikeChance ?? 80;
        if (rand(1, 100) <= xzDoubleStrikeChance) {
            unit._xiaoZhaoDoubleStriked = true; unit._acted = false;
            log.push({type:'info', text:`<span class="gold">🦋 蝶击：小昭永久概率连击触发！</span>`, isDoubleStrikeBanner:true});
            // 锁定同一目标：如果目标还活着，传过去让 selectTarget 优先选它
            const lockedTargetUid = (target && target.alive) ? target.uid : null;
            processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, lockedTargetUid);
        } else {
            log.push({type:'info', text:`<span class="gray">🦋 蝶击：小昭永久概率连击触发失败</span>`});
        }
    }

    if (canXingFenTrigger(unit) && enemySide.some(u => u.alive)) {
        consumeXingFen(unit);
        log.push({type:'info', text:`<span class="gold">💗 性奋：${unit.name} 获得额外攻击机会！</span>`});
        processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid);
    }

    return true;
}