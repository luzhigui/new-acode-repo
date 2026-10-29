// core/12battle-attack-chain.js — 攻击流程主干（选敌 → 命中/闪避 → 伤害 → 应用 → 构建攻击组 + 闪避效果）
// 边裁与纯工具（computeDodgeChance / snapshotUnitForFact / resolveDeaths / resolveAfterDamageEffects /
//   resolveDamageImmune / isUnitStunned）在 12battle-attack-edge.js。
export const VER = 'core/12battle-attack-chain.js V1.0.3';

import { CONFIG, getSkillParams, getGameData } from './01config-5v5-test.js';
import { eventBus, EFFECT_TYPES } from '../infra/50-event-bus.js';
import { calcDamage, getFangLevel, isMelee, getRandomTaunt, getZhangNearTaunt, makeFXSnapshot, hasBuff, getMissBreakdown, canBeTargeted } from './03battle-utils.js';
import { emitEvent, applyStatChange, refreshMaxHp, query, getBattleRng, recordCombatStat, getStat, addMod, recordHpAudit } from './13battle-shared.js';
import { flushBattleEvents, pushBattleEvent, getBattleState, setBattleState, persistValue, loadPersistedValue, fmtHp } from '../infra/51-core-utils.js';
import { getDodgeRules } from './20-registry-dodge.js';
import { validateCalcModifierFields } from './16effect-handlers.js';
import { getCalcModifier } from './21-registry-calc.js';
import { runTargetStrategies } from './07-target-strategies.js';
import { FACT_TYPES, BUFF_TYPES, UNIT_EVENT_TYPES, DROP_TYPES, CAMP_TYPES, ROLE_TYPES, SIGNAL_TYPES, STATE_CHANGE_TYPES } from '../infra/56-battle-enums.js';
import { emitStateChange } from '../infra/59-state-change.js';
import { computeDodgeChance, snapshotUnitForFact } from './12battle-attack-edge.js';

const C = CONFIG;

// 步骤1：选择攻击目标
export function selectAttackTarget(unit, enemySide, allySide) {
    const rng = getBattleRng();
    // 统一走 canBeTargeted：含 pendingDeath / flyMode / 附身 / FSM 飞行
    const validTargets = enemySide.filter(c => canBeTargeted(c));
    if (validTargets.length === 0) return { target: null, phantomFact: null };

    const declaration = { targetResult: null };
    eventBus.emit(SIGNAL_TYPES.BEFORE_SELECT_TARGET, { unit, enemySide, allySide, validTargets, declaration });

    let target = null;
    let phantomFact = null;

    if (declaration.targetResult) {
        const declared = declaration.targetResult;
        if (declared && canBeTargeted(declared)) {
            target = declared;
            phantomFact = declaration.phantomFact || null;
        }
    }

    if (!target) {
        // 默认选敌策略表（core/07）：飞行低血优先 → 近战打前排 → 兜底随机。
        // abort 表示策略主动放弃本次选敌（近战无前排），不走兜底。
        const result = runTargetStrategies(unit, validTargets, {
            rng,
            isMelee: isMelee(unit.role) || unit.isHorse
        });
        if (result && result.abort) return { target: null, phantomFact: null };
        target = result ? result.target : null;
    }

    if (!target || !canBeTargeted(target)) {
        const fallback = validTargets.filter(c => canBeTargeted(c));
        if (fallback.length === 0) return { target: null, phantomFact: null };
        target = fallback[rng.nextInt(0, fallback.length - 1)];
    }

    return { target, phantomFact };
}

// 步骤2：未命中+闪避判定
// ctx = { log, A, B, doubleStrikeUnitUid, state }
export function resolveAttackHit(unit, target, attackerBuffStats, defenderBuffStats, eventBus, ctx) {
    if (unit.state._neverMiss) return { skipped: false };
    const rng = getBattleRng();
    // 未命中率算法下沉 03.getMissBreakdown（与详情弹窗同源，避免两处漂移）
    const missAllySide = unit.camp === CAMP_TYPES.ALLY ? (ctx.A || []) : (ctx.B || []);
    const missEnemySide = unit.camp === CAMP_TYPES.ALLY ? (ctx.B || []) : (ctx.A || []);
    const missChance = getMissBreakdown(unit, missAllySide, missEnemySide).total;

    if (missChance > 0 && rng.nextInt(1,100) <= missChance) {
        const missData = {
            skipped: true,
            missFact: {
                type: 'miss',
                attacker: snapshotUnitForFact(unit),
                target: snapshotUnitForFact(target),
                fxSnapshot: makeFXSnapshot(unit, target)
            }
        };
        unit.state._acted = true;
        missData.missFact.events = flushBattleEvents();

        if (eventBus) {
            let afterMissExtraRequests = [];
            const allySide = unit.camp === CAMP_TYPES.ALLY ? ctx.A : ctx.B;
            const enemySide = unit.camp === CAMP_TYPES.ALLY ? ctx.B : ctx.A;
            let afterMissData = { unit, target, log: ctx.log, extraRequests: afterMissExtraRequests, allySide, enemySide, A: ctx.A, B: ctx.B, state: ctx.state };
            eventBus.emit(SIGNAL_TYPES.AFTER_MISS, afterMissData);
            if (afterMissExtraRequests.length > 0) {
                missData.extraRequests = afterMissExtraRequests;
            }
        }

        return missData;
    }

    const allyBuffs = (target.camp === CAMP_TYPES.ALLY && ctx.A ? ctx.A._activeBuffs : (target.camp === CAMP_TYPES.ENEMY && ctx.B ? ctx.B._activeBuffs : []));
    if (target.state._stunned) return { skipped: false };
    const hasCloudBody = hasBuff(allyBuffs, BUFF_TYPES.CLOUD_BODY) || ((target.isXiaoZhaoSister || target.isXiaoZhaoBrother) && target.state._permanentBuffs && target.state._permanentBuffs.some(b => b.key === BUFF_TYPES.CLOUD_BODY));
    // 不可闪避：攻击方带 _ignoreDodge 时整体跳过闪避判定（灭绝师太反击用，见 core/10 额外攻击循环）
    // _canAlwaysDodge 替代 isWei 硬编码：行动过仍可闪避由组件声明
    if (!unit.state._ignoreDodge && target.alive && (target.state._canAlwaysDodge || hasCloudBody || !target.state._acted)) {
        let dodgeTriggered = false;
        for (const ruleFn of getDodgeRules()) {
            const rate = ruleFn(target, unit) || 0;
            if (rate > 0 && rng.nextInt(1, 100) <= rate * 100) {
                dodgeTriggered = true;
                break;
            }
        }
        if (!dodgeTriggered) {
            let buffDodge = defenderBuffStats.dodgeBonus || 0;
            if (buffDodge > 0 && rng.nextInt(1, 100) <= buffDodge * 100) {
                dodgeTriggered = true;
            }
        }
        // 综合闪避率下沉 computeDodgeChance（与唐文亮·同归于尽「概率直读」同源，公式单点维护）
        target.state._dodgeChance = Math.round(computeDodgeChance(target, unit, defenderBuffStats) * 100);
        if (dodgeTriggered) {
            target.dodgeCount++;
            emitEvent(target, UNIT_EVENT_TYPES.HP_CHANGE, { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: getStat(target, 'atk'), def: getStat(target, 'def'), dodgeCount: target.dodgeCount });
            recordCombatStat(unit, target, 'dodge', {
                rawAmount: Math.floor(getStat(unit, 'atk')),
                actualAmount: 0
            });
            let reboundDmg = Math.floor((getStat(target, 'atk') + getStat(target, 'def')) * C.DODGE_REBOUND_RATIO);
            let unitHpBeforeRebound = Math.floor(unit.hp);

            const dodgeDeclarations = [];
            dodgeDeclarations.push({ type: EFFECT_TYPES.REBOUND, value: reboundDmg });
            dodgeDeclarations.push({ type: EFFECT_TYPES.STUN });

            // log 随载荷下发：唐文亮「冲刺后必叠回春」挂在 ON_DODGE 上（闪避分支不发 AFTER_ATTACK/AFTER_MISS），
            //   而回春叠层 + 回血必须往当步 log 里推 fact（战报行 + 飘字锚点），无 log 会静默丢公告。
            eventBus.emit(SIGNAL_TYPES.ON_DODGE, { unit, target, reboundDmg, declarations: dodgeDeclarations, log: ctx.log });

            const dodgeEffectResult = resolveDodgeEffects(dodgeDeclarations, unit, target, ctx.log);

            unit.state._acted = true;
            emitEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: getStat(unit, 'atk'), def: getStat(unit, 'def'), _stunned: dodgeEffectResult.stunned });

            const dodgeData = {
                skipped: true,
                dodgeFact: {
                    type: 'dodge',
                    attacker: snapshotUnitForFact(unit),
                    dodger: snapshotUnitForFact(target),
                    reboundDmg,
                    attackerHpBefore: unitHpBeforeRebound,
                    attackerHpAfter: unit.hp,
                    attackerAlive: unit.alive,
                    attackerAtk: Math.floor(getStat(unit, 'atk')),
                    dodgerDef: Math.floor(getStat(target, 'def')),
                    dodgerHp: Math.floor(target.hp),
                    // 是否真被眩晕（_ctrlImmune 单位会是 false），渲染层据此写文案
                    stunned: dodgeEffectResult.stunned,
                    weiHeal: dodgeDeclarations.find(d => d.type === EFFECT_TYPES.WEI_HEAL)?.data || null,
                    fxSnapshot: makeFXSnapshot(target, unit)
                }
            };
            dodgeData.dodgeFact.events = flushBattleEvents();
            return dodgeData;
        }
    }
    return { skipped: false };
}

// 步骤3：伤害计算
export function calcFinalDamage(unit, target, attackerBuffStats, defenderBuffStats, allySide, enemySide, log) {
    const damageDeclarations = [];
    const damageData = { unit, target, allySide, enemySide, log, declarations: damageDeclarations };
    eventBus.emit(SIGNAL_TYPES.BEFORE_DAMAGE_CALC, damageData);

    // 被动出手系数（core/10 额外攻击写入，-1=无）：反击/跟随那手按系数打折。
    //   记进 dmgMultiplierEntries：战报公式明细里能看到这一乘，日志不吹牛。
    const extraDmgRatio = unit.state._extraDmgRatio;

    // refs 直接构造，modifier 链就地读写；不再手动解构-装回
    const refs = {
        defBase: Math.floor(getStat(target, 'def')),
        defReduced: 0,
        ignoreDefRatio: 0,
        bonusDmgTotal: 0,
        dmgMultiplier: (extraDmgRatio != null && extraDmgRatio > 0) ? extraDmgRatio : 1,
        bonusDmgEntries: [],
        dmgMultiplierEntries: (extraDmgRatio != null && extraDmgRatio > 0) ? [{ label: '被动出手系数', value: extraDmgRatio }] : []
    };
    for (const decl of damageDeclarations) {
        const handler = getCalcModifier(decl.type);
        if (!handler) continue;
        const missing = validateCalcModifierFields(decl.type, decl);
        if (missing && missing.length > 0) {
            throw new Error(`[12battle-attack-steps] ${decl.type} 修饰器声明缺字段: ${missing.join(', ')}`);
        }
        handler({ decl, unit, target, refs });
    }
    // 解构用 let：defBase 下方还会按 ignoreDef 折一次，不能 const
    let { defBase, defReduced, ignoreDefRatio, bonusDmgTotal, dmgMultiplier, bonusDmgEntries, dmgMultiplierEntries } = refs;

    if (ignoreDefRatio > 0) {
        defBase = Math.floor(defBase * (1 - ignoreDefRatio));
    }

    let atkBase = Math.floor(getStat(unit, 'atk'));
    const rng = getBattleRng();
    let atkVar = rng.nextInt(1, C.ATK_VAR), defVar = rng.nextInt(1, C.DEF_VAR), hpBonus = rng.nextInt(C.HP_BONUS_MIN + 1, C.HP_BONUS_MAX);
    let atkAct = atkBase + atkVar, defAct = defBase + defVar;
    let hpBefore = Math.floor(target.hp);
    // hpBonus 当该次攻击的减伤，在 applyAttackResult 里从扣血中抵扣（不能「先回血再加」——满血时被 maxHp 夹掉＝白给）。
    //   按 dmg 计数的链路（吸血/反伤/破防/统计）不受影响。
    let waveTaunt = null, waveUnit = null;
    if (atkVar === C.ATK_VAR) { waveTaunt = getRandomTaunt(unit); waveUnit = unit; unit.critCount++; emitEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: getStat(unit, 'atk'), def: getStat(unit, 'def'), critCount: unit.critCount }); }
    else if (defVar + hpBonus >= C.DEF_WAVE_THRESHOLD) {
        const defTaunts = getGameData().taunts.def;
        waveTaunt = defTaunts[rng.nextInt(0, defTaunts.length - 1)];
        waveUnit = target;
    }
    if (unit.isZhang && !unit.rangedForm && unit.nearAtkCount < 3) {
        let zt = getZhangNearTaunt(unit.nearAtkCount + 1);
        if (zt) { waveTaunt = zt; waveUnit = unit; }
    }
    let raw, rawFormula, hpRatio = 0;
    // formula 明细要用的值，提到外层供末尾构造 formula 使用（只存不改，不影响伤害结果）
    let displayDefForFormula = 0, kForFormula = 0, penPartForFormula = 0;
    let blockBase = atkAct;
    if (unit.role === ROLE_TYPES.DEFENDER) {
        let displayDef = Math.floor(getStat(unit, 'def'));
        let lv = getFangLevel(displayDef, unit.m), k = C.FANG_K[lv] !== undefined ? C.FANG_K[lv] : C.FANG_K[C.FANG_K.length - 1];
        let penPart = calcDamage(atkAct, defAct);
        hpRatio = unit.state._hpDmgRatio;
        raw = penPart + displayDef * k + unit.maxHp * hpRatio;
        blockBase = atkAct + displayDef * k + unit.maxHp * hpRatio;
        displayDefForFormula = displayDef;
        kForFormula = k;
        penPartForFormula = penPart;
    } else {
        raw = calcDamage(atkAct, defAct);
    }

    raw += bonusDmgTotal;
    raw *= dmgMultiplier;
    const blockValue = Math.floor((blockBase + bonusDmgTotal) * dmgMultiplier * 10) / 10;

    let dmg = Math.floor(raw * 10) / 10;
    let bonusEntries = [];
    // 注意：calcFinalDamage 的形参名 allySide/enemySide 与实参语义相反
    // （实参传进来的是「攻击方队伍 / 防守方队伍」）。此处与形参名互换的写法互相抵消，
    // 传给 applyDamageModifiers 的才是真正的 (攻方队伍, 守方队伍)。勿单独"修正"任一侧。
    const modifierResult = query('damageModifiers', unit, target, dmg, enemySide, allySide, log);
    if (!modifierResult) {
        throw new Error(`[12] damageModifiers 未注册：modules/20elite-skills.js 未被加载（unit=${unit.name}）`);
    }
    dmg = modifierResult.modifiedDmg;
    bonusEntries = modifierResult.entries || [];
    
    // 背水一战易伤：如果目标处于触发状态，伤害乘以系数
    const lastStandTakenMul = target.state._lastStandTakenMul;
    if (lastStandTakenMul && lastStandTakenMul > 1) {
        dmg = Math.floor(dmg * lastStandTakenMul * 10) / 10;
    }

    // 计算明细（结构化，不是字符串）：渲染层照着排版，不再自己重算一遍。
    // 历史问题：render/30 为拼"计算：…"那行，又调了一次 calcDamage + 查了一次 FANG_K，
    // 而且用的是开局快照的 m/maxHp，引擎用的是实时值 —— 两边会对不上。
    const baseRaw = Math.round((raw - bonusDmgTotal) / dmgMultiplier * 100) / 100;
    const formula = unit.role === ROLE_TYPES.DEFENDER
        ? {
            kind: 'defender',
            terms: [
                { text: String(Math.round(penPartForFormula * 100) / 100), value: penPartForFormula },
                { text: `${displayDefForFormula}×${kForFormula}`, value: displayDefForFormula * kForFormula },
                { text: `${Math.floor(unit.maxHp)}×${hpRatio}`, value: unit.maxHp * hpRatio }
            ],
            baseRaw
        }
        : {
            kind: 'normal',
            terms: [
                { text: `${atkAct}×(${atkAct}/(${atkAct}+${defAct}))`, value: calcDamage(atkAct, defAct) }
            ],
            baseRaw
        };

    return { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, raw, rawFormula: null, thunderBonus: 0, hornDmgMultiplier: 1, hornDefIgnore: 0, trueDmg: 0, dmg, bonusEntries, defReduced, defReduction: null, bonusDmgTotal, bonusDmgEntries, dmgMultiplier, dmgMultiplierEntries, hpRatio: unit.role === ROLE_TYPES.DEFENDER ? hpRatio : 0, blockValue, pendingDefReduceFact: refs.pendingDefReduceFact || null, derivedEntries: damageData._derivedEntries || [], formula };
}

// 步骤4：应用伤害结果
// ctx = { log, A, B, state, doubleStrikeUnitUid }
export function applyAttackResult(unit, target, dmgCalc, attackerBuffStats, defenderBuffStats, allySide, enemySide, ctx) {
    const rng = getBattleRng();
    let { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, raw, rawFormula, thunderBonus, hornDmgMultiplier, trueDmg, dmg, bonusEntries, defReduction } = dmgCalc;

    // 波动减伤：hpBonus 从本次扣血里抵扣（dmg 本身不动，吸血/反伤/破防仍按 dmg 算），下限 0 不倒吸血
    let hpLoss = Math.max(0, dmg - hpBonus);
    // 护盾：扣血前先吸收，吸收量写 state 供组件出战报行；只吃本体伤害，不影响 dmg 本身（吸血/破防/反伤仍按 dmg 计）。
    //   两种护盾分家：先吃临时（蓄力，爆发结算会清零），吃完再吃永久（九阳满血溢出，整场累积）。
    let shieldAbsorbed = 0;
    target.state._shieldAbsorbed = 0;
    const tempLeft = target.state._shield || 0;
    if (tempLeft > 0 && hpLoss > 0) {
        const a = Math.min(tempLeft, hpLoss);
        target.state._shield = tempLeft - a;
        shieldAbsorbed += a;
        hpLoss -= a;
    }
    const permLeft = target.state._permShield || 0;
    if (permLeft > 0 && hpLoss > 0) {
        const a = Math.min(permLeft, hpLoss);
        target.state._permShield = permLeft - a;
        shieldAbsorbed += a;
        hpLoss -= a;
    }
    target.state._shieldAbsorbed = shieldAbsorbed;
    let hpAfter = Math.floor(target.hp) - hpLoss;
    let dead = hpAfter <= 0;
    applyStatChange(target, 'hp', -hpLoss, unit, '攻击伤害');
    if (dmgCalc.blockValue > dmg) {
        recordCombatStat(unit, target, 'damage', {
            rawAmount: dmgCalc.blockValue - dmg,
            actualAmount: 0
        });
    }
    if (dead) {
        // 不直接设 alive=false，留给 resolveDeaths 统一处理：否则 (_pendingDeath && alive) 过滤为空
        //   → DEATH 信号不发 → watchUnit 收不到重判 → 张无忌不变身。
        target.state._pendingDeath = true;
        if (!target.state._deathTime) target.state._deathTime = Date.now();
    }

    if (dead && target.camp === CAMP_TYPES.ENEMY && unit.camp === CAMP_TYPES.ALLY && !target.state._tokenDropped) {
        const stage = getBattleState('currentStage') || 1;
        // 圣火令·气运：击杀者带 holyTokenLuck 时掉率按倍率放大（数据驱动，张无忌 4 倍无条件；
        // 按名字查表而非认 isZhang——core 不硬编码精英身份，与 _canAlwaysDodge 同一约定）
        // 小昭条目带 requiresHolyFlame 门控（老板拍板）：妹永久账本里有圣火令才生效——
        //   _permanentBuffs「本局不过期」语义天然满足「拥有圣火令后、这一局内」
        let luck = getSkillParams(unit.name, 'holyTokenLuck');
        if (luck && luck.requiresHolyFlame &&
            !(unit.isXiaoZhaoBrother && unit.state._permanentBuffs?.some(b => b.key === BUFF_TYPES.HOLY_FLAME))) luck = null;
        const dropRate = Math.min(1, (C.TOKEN_DROP_RATES[stage] || 0) / 100 * (luck && luck.multiplier ? luck.multiplier : 1));
        if (rng.next() < dropRate) {
            target.state._tokenDropped = true;
            const currentToken = getBattleState('holyToken') || 0;
            setBattleState('holyToken', currentToken + 1);
            persistValue('ming_holy_token_5v5_test', currentToken + 1);
            pushBattleEvent({ unitUid: unit.uid, eventType: 'info', payload: { text: `🔥 圣火令掉落！${unit.name} 击杀 ${target.name}，获得1枚圣火令！当前总数：${currentToken + 1}`, fastEntry: true } });
            ctx.log.push({ factType: FACT_TYPES.DROP, data: { kind: DROP_TYPES.TOKEN, killerName: unit.name, victimName: target.name, total: currentToken + 1, unitUid: unit.uid } });
        }
    }
    if (dead && target.camp === CAMP_TYPES.ENEMY && unit.camp === CAMP_TYPES.ALLY && !target.state._chestDropped) {
        const chestKillRate = C.CHEST_DROP_RATE / 100;
        if (rng.next() < chestKillRate) {
            target.state._chestDropped = true;
            let chests = loadPersistedValue('ming_chest_count', 0);
            chests++;
            persistValue('ming_chest_count', chests);
            setBattleState('chestCount', chests);
            ctx.log.push({ factType: FACT_TYPES.DROP, data: { kind: DROP_TYPES.CHEST, killerName: unit.name, victimName: target.name, total: chests, unitUid: unit.uid } });
        }
    }

    let horseReboundDeclarations = [];
    const xiaoHEnhance = query('xiaoHexEnhance', ctx.A, ctx.A._activeBuffs, BUFF_TYPES.HORSE_FORMATION);
    if (target.isHorse && dmg > 0 && xiaoHEnhance && hasBuff(ctx.A._activeBuffs, BUFF_TYPES.HORSE_FORMATION)) {
        const rebound = xiaoHEnhance.reboundDmg;
        horseReboundDeclarations.push({
            type: EFFECT_TYPES.REBOUND,
            value: rebound,
            source: target,
            target: unit,
            factType: FACT_TYPES.HORSE_REBOUND,
            factData: { unitName: unit.name, rebound, attackerUid: unit.uid, unitUid: target.uid }
        });
    }

    emitEvent(target, UNIT_EVENT_TYPES.HP_CHANGE, { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: getStat(target, 'atk'), def: getStat(target, 'def'), _isDead: target.state._isDead || false });

    let reboundEntry = null;
    let fortifyDeclarations = null;
    let allyBuffs_fortify = (target.camp === CAMP_TYPES.ALLY ? ctx.A._activeBuffs : ctx.B._activeBuffs) || [];
    // 妹永久补 fortify 反弹：团队严阵以待过期后，妹（防战形态）被击仍反弹
    //   （xiaoPermanentActive 在团队 buff 在场时返回 false，两分支不重复）
    const fortifyActive = hasBuff(allyBuffs_fortify, BUFF_TYPES.FORTIFY) || query('xiaoPermanentActive', target, allyBuffs_fortify, BUFF_TYPES.FORTIFY);
    if (fortifyActive && target.role === ROLE_TYPES.DEFENDER && dmg > 0) {
        const reboundDmg = Math.floor((atkAct - Math.floor(atkAct * (atkAct / (atkAct + defAct)))) / 2);
        if (reboundDmg > 0) {
            const hasSister = ctx.A && ctx.A.some(u => u.isXiaoZhaoSister && u.alive);
            fortifyDeclarations = [{
                type: EFFECT_TYPES.REBOUND,
                value: reboundDmg,
                source: target,
                target: unit,
                hasSister,
                factType: FACT_TYPES.FORTIFY_REBOUND,
                factData: { reboundDmg, unitName: unit.name, hasSister, attackerUid: unit.uid, unitUid: target.uid }
            }];
            // 姊强化：严阵反弹时防战回复反弹伤害的 1/3
            if (hasSister) {
                const healVal = Math.floor(reboundDmg / 3);
                if (healVal > 0) {
                    fortifyDeclarations.push({
                        type: EFFECT_TYPES.HEAL,
                        value: healVal,
                        source: target,
                        factType: FACT_TYPES.HEAL,
                        factData: { unitName: target.name, heal: healVal, hpBefore: fmtHp(target.hp), hpAfter: fmtHp(target.hp + healVal), unitUid: target.uid, icon: '🛡️', label: '严阵以待回复', mode: 'plusTrail', anchorVerb: '回复' }
                    });
                }
            }
        }
    }

    return { dmg, dead, horseReboundDeclarations, reboundEntry, bonusEntries, hpBefore, defReduction, waveTaunt, waveUnit, rawFormula, thunderBonus, hornDmgMultiplier, trueDmg, atkAct, defAct, hpBonus, fortifyDeclarations };
}

// 步骤5：构建攻击事实
// ctx = { log, A, B, state, doubleStrikeUnitUid }
export function buildAttackGroup(unit, target, dmgCalc, dmgResult, attackerBuffStats, defenderBuffStats, allySide, enemySide, ctx, phantomFact) {
    let { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, raw, rawFormula, thunderBonus, hornDmgMultiplier, hornDefIgnore, trueDmg, defReduction, bonusDmgTotal, bonusDmgEntries, dmgMultiplier, dmgMultiplierEntries, hpRatio } = dmgCalc;
    let { dmg, dead, reboundEntry, bonusEntries } = dmgResult;

    let hpPctBefore = Math.floor((hpBefore / target.maxHp) * 100), hpPctAfter = Math.floor((target.hp / target.maxHp) * 100);

    const pendingEntries = [];
    if (dmgCalc.pendingDefReduceFact) {
        pendingEntries.push({ factType: FACT_TYPES.BREAK_DEF, data: dmgCalc.pendingDefReduceFact });
    }
    if (unit._executeLog) {
        unit._executeLog.forEach(e => pendingEntries.push(e));
        delete unit._executeLog;
    }
    // 修饰器 fact（乾坤等）必须进 entries 才能进 log→31 拿 stageAction。
    if (Array.isArray(bonusEntries) && bonusEntries.length > 0) {
        bonusEntries.forEach(e => pendingEntries.push(e));
    }

    const snap = {
        attackerPos: unit.pos,
        targetPos: target.pos,
        attackerHp: fmtHp(unit.hp),
        attackerAtkDisplay: Math.floor(getStat(unit, 'atk')),
        attackerAtk: Math.floor(getStat(unit, 'atk')),
        attackerDef: Math.floor(getStat(unit, 'def')),
        attackerMaxHp: Math.floor(unit.maxHp),
        attackerM: unit.m,
        attackerRole: unit.role,
        attackerIsZhangNear: !!(unit.isZhang && !unit.rangedForm),
        attackerNearAtkCount: unit.nearAtkCount,
        isKuLianAttack: !!(unit.isSongQingshu && unit.state._kuLianActive),
        isLinkAttack: !!unit.state._isLinkAttack,
        // 被动出手原因（纯展示）：反击/跟随/随动/联动/追击——render 层徽章与飘字的依据
        linkReason: unit.state?._linkReason || null,
        targetDefDisplay: Math.floor(getStat(target, 'def')),
        targetHpAfter: fmtHp(target.hp),
        targetAlive: target.alive
    };

    // 关键：attacker 和 target 改为快照对象，不再引用活体 Unit
    const attackFact = {
        factType: FACT_TYPES.ATTACK,
        data: {
            attacker: snapshotUnitForFact(unit),
            target: snapshotUnitForFact(target),
            dmgCalc,
            dmgResult,
            attackerBuffStats,
            defenderBuffStats,
            hpPctBefore,
            hpPctAfter,
            phantomFact,
            entries: pendingEntries,
            snap,
            isDashStrikeFx: !!unit.state._isDashStrikeFx
        },
        _events: []
    };

    return attackFact;
}

// 闪避后效果边裁
export function resolveDodgeEffects(declarations, unit, target, log) {
    // 返回 { stunned }：调用方据此决定战报写不写「被反击眩晕」
    //   （_ctrlImmune 单位实际没被控，原渲染器无条件写「本回合无法行动」= 战报说谎）
    const result = { stunned: false };
    if (!declarations || declarations.length === 0) return result;

    for (const decl of declarations) {
        if (decl.type === EFFECT_TYPES.REBOUND) {
            applyStatChange(unit, 'hp', -decl.value, target, '闪避反击');
        } else if (decl.type === EFFECT_TYPES.STUN) {
            // 控制位移免疫（寒离飒·开局常驻）：闪避反击的眩晕不生效，反弹伤害照掉
            if (unit.state && unit.state._ctrlImmune) continue;
            unit.state._stunned = true;
            result.stunned = true;
            emitEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: getStat(unit, 'atk'), def: getStat(unit, 'def'), _stunned: true });
            emitStateChange(unit, STATE_CHANGE_TYPES.STUNNED, {}, log);
        } else if (decl.type === EFFECT_TYPES.WEI_HEAL) {
            const { heal, newMaxHp } = decl.data;
            // 词条化：27 传的 newMaxHp 已是"当前 maxHp+heal"的绝对值（不封顶），这里只算增量
            const delta = Math.max(0, newMaxHp - Math.floor(getStat(target, 'maxHp')));
            // 体检对照增量字段：decl.data 随后按引用挂到 dodgeFact.weiHeal（见上方闪避 fact 组装）
            decl.data.maxHpDelta = delta;
            // 独立数值声明 fact（演出仍走 dodgeFact.weiHeal：34 日志行 + 39 飘字，此 fact 不进画面）
            log.push({ factType: FACT_TYPES.WEI_DODGE_LEECH, data: { unitName: target.name, unitUid: target.uid, heal, newMaxHp, maxHpDelta: delta } });
            if (delta > 0) {
                addMod(target, 'maxHp', { source: '韦一笑吸血', value: delta, ttl: 'permanent', group: 'weiLeech', op: 'add' });
                refreshMaxHp(target, null, '韦一笑吸血上限提升');
                // 审计账本：hp 抬升与 refreshMaxHp 同源（delta），记进 unit._audit.hp，零行为副作用
                recordHpAudit(target, 'weiDodgeHeal', delta, '韦一笑吸血');
            }
            recordCombatStat(target, target, 'leech', {
                actualAmount: heal
            });
        }
    }
    return result;
}