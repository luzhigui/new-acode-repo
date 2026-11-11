// core/212-battle-attack-chain.js — 攻击流程主干（选敌 → 命中/闪避 → 伤害 → 应用 → 构建攻击组 + 闪避效果）
// 边裁与纯工具（computeDodgeChance / snapshotUnitForFact / resolveDeaths / resolveAfterDamageEffects /
//   resolveDamageImmune / isUnitStunned）在 213-battle-attack-edge.js。
// V1.0.15 | 2026-11-08 known-transfers 三条：(1)马阵反弹改按马所属阵营取 buff（旧版恒取明教侧，
//   明教打敌方马吃自家姊反弹）；(2)严阵回血的姊判定改按防御者阵营（旧版恒读 ctx.A，敌方防御者
//   白吃明教姊回血）；(3)applyAttackResult 回传 cappedLoss（被 _dmgCap 吃掉的量），供伤害行/飘字
//   印实际落地值（庄铮断锤三式此前报「造成 53」而血只掉 1）；(4)韦一笑闪避吸血的上限增量不再
//   Math.floor 基准（floor 抹掉小数尾巴 => delta 比 heal 多零点几，体检 164 四处复发）。
export const VER = 'core/212-battle-attack-chain.js V1.0.16';

import { CONFIG, getSkillParams, getGameData } from './201-config-5v5-test.js';
// 小昭运行时改名为「小昭·姊/妹」，查任何以角色名为键的数据表都要退回主名（否则圣火令气运永不生效）
import { baseHeroName } from './202-unit.js';
import { eventBus, EFFECT_TYPES } from '../infra/101-event-bus.js';
import { calcDamage, getFangLevel, isMelee, getRandomTaunt, getZhangNearTaunt, makeFXSnapshot, hasBuff, getMissBreakdown, canBeTargeted } from './203-battle-utils.js';
import { emitEvent, applyStatChange, refreshMaxHp, query, getBattleRng, recordCombatStat, getStat, addMod, recordHpAudit } from './214-battle-shared.js';
import { flushBattleEvents, pushBattleEvent, getBattleState, setBattleState, persistValue, loadPersistedValue, fmtHp } from '../infra/102-core-utils.js';
import { getDodgeRules } from './221-registry-dodge.js';
import { validateCalcModifierFields } from './217-effect-handlers.js';
import { getCalcModifier } from './222-registry-calc.js';
import { runTargetStrategies, runTargetFilters } from './207-target-strategies.js';
import { FACT_TYPES, BUFF_TYPES, UNIT_EVENT_TYPES, DROP_TYPES, CAMP_TYPES, ROLE_TYPES, SIGNAL_TYPES, STATE_CHANGE_TYPES } from '../infra/106-battle-enums.js';
import { emitStateChange } from '../infra/108-state-change.js';
import { computeDodgeChance, snapshotUnitForFact } from './213-battle-attack-edge.js';
import { hasBrotherPermanent } from './204-buff-system.js';
// 状态语义（受控/免控）：core/218 标签表是单一真源
import { isControlled, isCCImmune } from './218-state-keys.js';

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
        const chainCtx = { rng, isMelee: isMelee(unit.role) || unit.isHorse };
        // 选目标前过滤（core/07 注册面）：模块按注册序裁候选池，结果原地写回同一 validTargets 引用
        //   （emit payload 与策略看到的是同一份）。全被排除＝本次无目标，直接返回、不兜底。
        runTargetFilters(unit, validTargets, chainCtx);
        if (validTargets.length === 0) return { target: null, phantomFact: null };
        // 默认选敌策略表（core/07）：飞行低血优先 → 近战打前排 → 兜底随机。
        // abort 表示策略主动放弃本次选敌（近战无前排），不走兜底。
        const result = runTargetStrategies(unit, validTargets, chainCtx);
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
            // 未命中期间的声明类 fact（连击 / 连蛛 / 性奋重试）走这里暂存：
            //   AFTER_MISS 在 MISS fact 入 log 之前广播，监听器直接 log.push 会让声明行排到「未命中！」之前。
            //   core/10 收到 pendingMissFacts 后紧跟在 MISS fact 之后落账，顺序才对。
            const pendingMissFacts = [];
            const allySide = unit.camp === CAMP_TYPES.ALLY ? ctx.A : ctx.B;
            const enemySide = unit.camp === CAMP_TYPES.ALLY ? ctx.B : ctx.A;
            let afterMissData = { unit, target, log: ctx.log, extraRequests: afterMissExtraRequests, deferredFacts: pendingMissFacts, allySide, enemySide, A: ctx.A, B: ctx.B, state: ctx.state };
            eventBus.emit(SIGNAL_TYPES.AFTER_MISS, afterMissData);
            if (afterMissExtraRequests.length > 0) {
                missData.extraRequests = afterMissExtraRequests;
            }
            if (pendingMissFacts.length > 0) {
                missData.pendingMissFacts = pendingMissFacts;
            }
        }

        return missData;
    }

    const allyBuffs = (target.camp === CAMP_TYPES.ALLY && ctx.A ? ctx.A._activeBuffs : (target.camp === CAMP_TYPES.ENEMY && ctx.B ? ctx.B._activeBuffs : []));
    if (isControlled(target)) return { skipped: false };
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
            // 闪避反伤倍率：姊流云身法可覆盖（reboundRatio = 50%），否则走 CONFIG 默认
            const dodgeTeam = target.camp === CAMP_TYPES.ALLY ? ctx.A : ctx.B;
            const xzCloud = dodgeTeam ? query('xiaoHexEnhance', dodgeTeam, dodgeTeam._activeBuffs || [], BUFF_TYPES.CLOUD_BODY) : null;
            const rebRatio = (xzCloud && xzCloud.reboundRatio) ? xzCloud.reboundRatio : C.DODGE_REBOUND_RATIO;
            let reboundDmg = Math.floor((getStat(target, 'atk') + getStat(target, 'def')) * rebRatio);
            let unitHpBeforeRebound = unit.hp;

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
                    dodgerHp: target.hp,
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
// 形参语义（2026-11-01 修正）：attackerTeam = 攻击方所在队，defenderTeam = 防守方所在队。
// 原形参名为 allySide/enemySide（按明教视角命名），但所有调用方传的是「攻方队 / 守方队」，
// 且函数内部还要再互换一次传给 applyDamageModifiers（那边的 allySide 语义是目标队）——
// 两层反语义靠互换抵消，极易改错。现统一：本函数用 attackerTeam/defenderTeam。
export function calcFinalDamage(unit, target, attackerBuffStats, defenderBuffStats, attackerTeam, defenderTeam, log) {
    const damageDeclarations = [];
    // BEFORE_DAMAGE_CALC 的 payload 键名保持 allySide/enemySide（向后兼容：全部监听方零改动），
    // 值改为本次语义的攻方队/守方队。
    const damageData = { unit, target, allySide: attackerTeam, enemySide: defenderTeam, log, declarations: damageDeclarations };
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
    let hpBefore = target.hp;
    // hpBonus 当该次攻击的减伤，在 applyAttackResult 里从扣血中抵扣（不能「先回血再加」——满血时被 maxHp 夹掉＝白给）。
    //   按 dmg 计数的链路（吸血/反伤/破防/统计）不受影响。
    let waveTaunt = null, waveUnit = null;
    if (atkVar === C.ATK_VAR) { waveTaunt = getRandomTaunt(unit); waveUnit = unit; emitEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: getStat(unit, 'atk'), def: getStat(unit, 'def'), critCount: unit.critCount }); }
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
    // applyDamageModifiers 的形参语义是 (目标队, 攻击方队)——目标在防守方队，
    // 所以传 defenderTeam 作目标队、attackerTeam 作攻击方队。
    const modifierResult = query('damageModifiers', unit, target, dmg, defenderTeam, attackerTeam, log);
    if (!modifierResult) {
        throw new Error(`[12] damageModifiers 未注册：modules/302-elite-skills.js 未被加载（unit=${unit.name}）`);
    }
    // 减伤前伤害：乾坤护盾的「整段吸收」在 query 内完成（modules/302），吸收后 modifiedDmg=0，
    //   不能靠 dmg<=0 判断（攻击力为 0 的真命中也是 0），必须拿减前值对照 absorbed。
    const preModDmg = dmg;
    dmg = modifierResult.modifiedDmg;
    bonusEntries = modifierResult.entries || [];
    
    // 背水一战易伤：如果目标处于触发状态，伤害乘以系数。
    //   进 dmgMultiplierEntries，让计算行显示「×1.5 背水一战易伤 = N」——
    //   旧版只乘数值不写明细，战报里只看到计算 33、结果 48，差 15 对不上（老板 2026-11-11 指出）。
    const lastStandTakenMul = target.state._lastStandTakenMul;
    if (lastStandTakenMul && lastStandTakenMul > 1) {
        dmg = Math.floor(dmg * lastStandTakenMul * 10) / 10;
        dmgMultiplierEntries.push({ label: '背水一战易伤', value: lastStandTakenMul });
    }

    // 伤害出口下限（老板定案 2026-11-08）：真打中（未被闪避/免疫/完全挡下）的最终伤害至少 1，
    //   负攻（众志补员吃防战 -8）也不再算出负伤害。被挡下/免疫的路径不进本函数，不会凭空给 1。
    // 例外：乾坤护盾整段吸收（absorbed ≥ 减后伤害）＝ 实际落地 0，此时保留下限 0，
    //   否则战报写「造成 1 点伤害」而血条不动，与上一行注释口径相反（体检 183 转绿的依据）。
    const qkFull = (bonusEntries || []).some((e) => {
        if (!e || !e.data) return false;
        if (typeof e.data.absorbed !== 'number' || typeof e.data.reducePct !== 'number') return false;
        const reduced = Math.round(preModDmg * (1 - e.data.reducePct));
        return reduced > 0 && e.data.absorbed >= reduced;
    });
    dmg = qkFull ? 0 : Math.max(1, dmg);

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

    return { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, raw, rawFormula: null, isCrit: atkVar === C.ATK_VAR, dmg, bonusEntries, defReduced, defReduction: null, bonusDmgTotal, bonusDmgEntries, dmgMultiplier, dmgMultiplierEntries, hpRatio: unit.role === ROLE_TYPES.DEFENDER ? hpRatio : 0, blockValue, pendingDefReduceFact: refs.pendingDefReduceFact || null, derivedEntries: damageData._derivedEntries || [], formula };
}

// 步骤4：应用伤害结果
// ctx = { log, A, B, state, doubleStrikeUnitUid }
export function applyAttackResult(unit, target, dmgCalc, attackerBuffStats, defenderBuffStats, allySide, enemySide, ctx) {
    const rng = getBattleRng();
    let { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, raw, rawFormula, dmg, bonusEntries, defReduction } = dmgCalc;

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
    // 单次受伤上限（庄铮·断锤三式）：必须截在 dead 判定之前——core/13 的 hp 截断只改落账值，
    //   这里不改 hpLoss 的话，致死伤害照样把 hpAfter 算成 ≤0、死亡标记照样落下（上限形同虚设）。
    //   上限只有 _dmgCap 一个来源；core/13 直扣血出口读同一字段。
    const hpLossBeforeCap = hpLoss;
    if (target.state._dmgCap > 0) hpLoss = Math.min(hpLoss, target.state._dmgCap);
    // 被单次受伤上限吃掉的那部分：战报的伤害行/飘字必须扣掉它（旧版仍印截断前的 53，
    //   而血量只掉 1）。只记账不影响结算——dmg 本身仍按原值供吸血/反伤/破防计。
    const cappedLoss = Math.max(0, hpLossBeforeCap - hpLoss);
    let hpAfter = target.hp - hpLoss;
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
        let luck = getSkillParams(baseHeroName(unit.name), 'holyTokenLuck');
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
    // 马阵反弹按「马所属阵营」取，不是恒取明教侧：旧版读 ctx.A，明教打敌方马也吃明教姊的反弹
    //   （自己人反自己人）。马是 target，马阵 buff 挂在召唤它的那一队。
    const horseTeam = target.camp === CAMP_TYPES.ALLY ? ctx.A : ctx.B;
    const horseBuffs = (horseTeam && horseTeam._activeBuffs) || [];
    const xiaoHEnhance = query('xiaoHexEnhance', horseTeam, horseBuffs, BUFF_TYPES.HORSE_FORMATION);
    if (target.isHorse && dmg > 0 && xiaoHEnhance && hasBuff(horseBuffs, BUFF_TYPES.HORSE_FORMATION)) {
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
    // 妹永久补 fortify 反弹：团队严阵以待过期后，队里任一防战被击都反弹（不只妹自己）。
    //   原判据 query('xiaoPermanentActive', target, ...) 要求 target 自己是妹，与 applyFortifyBonus 的
    //   hasBrotherPermanent(team, ...) 不一致——「全队加防、只有妹反弹」。现统一用 hasBrotherPermanent。
    const targetTeamForFortify = target.camp === CAMP_TYPES.ALLY ? ctx.A : ctx.B;
    const fortifyActive = hasBuff(allyBuffs_fortify, BUFF_TYPES.FORTIFY) || hasBrotherPermanent(targetTeamForFortify, BUFF_TYPES.FORTIFY);
    if (fortifyActive && target.role === ROLE_TYPES.DEFENDER && dmg > 0) {
        // 反弹比例走配置（BUFFS.fortify.reboundRatio，现值 0.4），不再写死一半
        const fortifyRatio = C.BUFFS.fortify.reboundRatio ?? 0.5;
        const reboundDmg = Math.floor((atkAct - Math.floor(atkAct * (atkAct / (atkAct + defAct)))) * fortifyRatio);
        if (reboundDmg > 0) {
            // 姊判定按「防御者阵营」取，与上面 allyBuffs_fortify / 下面 hasBrotherPermanent 同口径：
            //   旧版恒读 ctx.A（明教侧），六大派防御者吃严阵反弹时会白吃明教姊的回血。
            const hasSister = !!targetTeamForFortify && !(globalThis.MING_ABLATION?.noSisterHex) && targetTeamForFortify.some(u => u.isXiaoZhaoSister && u.alive);
            // 姊强化回血开关读 002 sister.fortify.healOnRebound（此前写死「有姊就回血」，配置成为死数据）
            const fortifySisterCfg = hasSister ? getSkillParams('小昭', 'hexEnhance').fortify : null;
            if (hasSister && !fortifySisterCfg) throw new Error('002-hex-enhance.json 缺 sister.fortify');
            fortifyDeclarations = [{
                type: EFFECT_TYPES.REBOUND,
                value: reboundDmg,
                source: target,
                target: unit,
                hasSister,
                factType: FACT_TYPES.FORTIFY_REBOUND,
                factData: { reboundDmg, unitName: unit.name, hasSister, attackerUid: unit.uid, unitUid: target.uid }
            }];
            // 姊强化：严阵反弹时防战回复反弹伤害的 1/3（开关 = sister.fortify.healOnRebound）
            if (fortifySisterCfg && fortifySisterCfg.healOnRebound) {
                const healVal = Math.floor(reboundDmg / 3);
                if (healVal > 0) {
                    fortifyDeclarations.push({
                        type: EFFECT_TYPES.HEAL,
                        value: healVal,
                        source: target,
                        factType: FACT_TYPES.HEAL,
                        factData: { unitName: target.name, heal: healVal, hpBefore: fmtHp(target.hp), hpAfter: fmtHp(target.hp + healVal), unitUid: target.uid, maxHp: target.maxHp, stacks: 1, icon: '🛡️', label: '严阵以待回复', mode: 'plusTrail', anchorVerb: '回复' }
                    });
                }
            }
        }
    }

    return { dmg, dead, cappedLoss, horseReboundDeclarations, reboundEntry, bonusEntries, hpBefore, defReduction, waveTaunt, waveUnit, rawFormula, atkAct, defAct, hpBonus, fortifyDeclarations, _shield: target.state._shield || 0, _permShield: target.state._permShield || 0 };
}

// 步骤5：构建攻击事实
// ctx = { log, A, B, state, doubleStrikeUnitUid }
export function buildAttackGroup(unit, target, dmgCalc, dmgResult, attackerBuffStats, defenderBuffStats, allySide, enemySide, ctx, phantomFact) {
    let { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, raw, rawFormula, defReduction, bonusDmgTotal, bonusDmgEntries, dmgMultiplier, dmgMultiplierEntries, hpRatio } = dmgCalc;
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
        // 实数血量（引擎真值，未取整）：attackerHp / targetHpAfter 是显示口径（≥10 取整），
        //   体检无法对账 0.x 级扣血，故另带一份实数快照。
        attackerHpReal: unit.hp,
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
        targetHpAfterReal: target.hp,
        targetAlive: target.alive
    };

    // 关键：attacker 和 target 改为快照对象，不再引用活体 Unit
    // 冲刺拳头「跳过默认攻击动画」是一次性标记：建组时读到即清（不清会永久跳过唐文亮后续所有攻击动画）
    const dashStrikeFx = !!(unit.state && unit.state._isDashStrikeFx);
    if (dashStrikeFx) unit.state._isDashStrikeFx = false;
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
            isDashStrikeFx: dashStrikeFx
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
            if (isCCImmune(unit)) continue;
            unit.state._stunned = true;
            result.stunned = true;
            emitEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: getStat(unit, 'atk'), def: getStat(unit, 'def'), _stunned: true });
            emitStateChange(unit, STATE_CHANGE_TYPES.STUNNED, {}, log);
        } else if (decl.type === EFFECT_TYPES.WEI_HEAL) {
            const { heal, newMaxHp } = decl.data;
            // 词条化：27 传的 newMaxHp 已是"当前 maxHp+heal"的绝对值（不封顶），这里只算增量
            // 不再 Math.floor 基准：floor 把上限的小数尾巴抹掉，delta 会比 heal 多出零点几（体检 164 判「+2 但
            //   delta=2.325」）。newMaxHp = 当前上限 + heal（modules/321 声明），减实数基准即严格等于 heal。
            const delta = Math.max(0, newMaxHp - getStat(target, 'maxHp'));
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