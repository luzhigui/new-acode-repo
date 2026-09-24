// V6.3.2 | ~24600 bytes | 2026-09-24 韦一笑吸血上限不再封顶（27 传 newMaxHp 为当前 maxHp+heal 绝对值）
export const VER = 'core/12battle-attack-steps.js V6.3.2';

import { CONFIG, getSkillParams, getGameData } from './01config-5v5-test.js';
import { eventBus, EFFECT_TYPES } from '../infra/50-event-bus.js';
import { calcDamage, getFangLevel, isMelee, isBlocked, getRandomTaunt, getZhangNearTaunt, makeFXSnapshot, hasBuff, getUnitCol, getUnitRow, getMissBreakdown, canBeTargeted } from './03battle-utils.js';
import { emitEvent, applyStatChange, refreshMaxHp, query, getBattleRng, recordCombatStat, getStat, addMod } from './13battle-shared.js';
import { flushBattleEvents, pushBattleEvent, getBattleState, setBattleState, registerDodgeRule, clearEliteDodgeRules, getDodgeRules, persistValue, loadPersistedValue, fmtHp } from '../infra/51-core-utils.js';
import { getEffectHandler, hasEffectHandler, getCalcModifier, validateDeclarationFields, validateCalcModifierFields } from './16effect-handlers.js';
import { runTargetStrategies } from './07-target-strategies.js';
import { FACT_TYPES, BUFF_TYPES, UNIT_EVENT_TYPES, DROP_TYPES, CAMP_TYPES, ROLE_TYPES, SIGNAL_TYPES, STATE_CHANGE_TYPES } from '../infra/56-battle-enums.js';
import { emitStateChange } from '../infra/59-state-change.js';

// 闪避规则注册表（已下沉 infra/51，此处转发）
export { registerDodgeRule, clearEliteDodgeRules, getDodgeRules };

registerDodgeRule((unit, attacker) => {
    if (unit.role === ROLE_TYPES.FLYER) return CONFIG.BASE_DODGE_FLY || 0.15;
    return 0;
});

registerDodgeRule((unit, attacker) => {
    if (unit.role !== ROLE_TYPES.FLYER) return CONFIG.BASE_DODGE_GROUND || 0.03;
    return 0;
});

const C = CONFIG;

// fact 快照：把 Unit 转换为纯数据对象，供渲染/翻译读取，不保留引用
function snapshotUnitForFact(unit) {
    if (!unit) return null;
    return {
        uid: unit.uid,
        name: unit.name,
        camp: unit.camp,
        pos: unit.pos,
        role: unit.role,
        atk: getStat(unit, 'atk'),
        def: getStat(unit, 'def'),
        hp: fmtHp(unit.hp),
        maxHp: fmtHp(unit.maxHp),
        alive: unit.alive,
        isZhang: unit.isZhang || false,
        isWei: unit.isWei || false,
        isHorse: unit.isHorse || false,
        rangedForm: unit.rangedForm !== false,
        nearAtkCount: unit.nearAtkCount || 0,
        state: {
            _isDead: unit.state?._isDead || false,
            _stunned: unit.state?._stunned || false,
            _acted: unit.state?._acted || false,
            _resting: unit.state?._resting || false,
            _blocked: unit.state?._blocked || false,
            _kuLianActive: unit.state?._kuLianActive || false,
            _isLinkAttack: unit.state?._isLinkAttack || false,
            _flyMode: unit.state?._flyMode || null,
            _spiderFlying: unit.state?._spiderFlying || false,
            _butterflyHost: unit.state?._butterflyHost || null
        }
    };
}

// 步骤1：选择攻击目标
export function selectAttackTarget(unit, enemySide, allySide) {
    const rng = getBattleRng();
    // 2026-09-19 统一走 canBeTargeted：含 pendingDeath / flyMode / 附身 / FSM 飞行
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
export function resolveAttackHit(unit, target, attackerBuffStats, defenderBuffStats, log, A, B, doubleStrikeUnitUid, eventBus, state) {
    if (unit.state._neverMiss) return { skipped: false };
    const rng = getBattleRng();
    // 2026-09-16 未命中率算法下沉 03.getMissBreakdown（与详情弹窗同源，避免两处漂移）
    const missAllySide = unit.camp === CAMP_TYPES.ALLY ? (A || []) : (B || []);
    const missEnemySide = unit.camp === CAMP_TYPES.ALLY ? (B || []) : (A || []);
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
            const allySide = unit.camp === CAMP_TYPES.ALLY ? A : B;
            const enemySide = unit.camp === CAMP_TYPES.ALLY ? B : A;
            let afterMissData = { unit, target, log, extraRequests: afterMissExtraRequests, allySide, enemySide, A, B, state };
            eventBus.emit(SIGNAL_TYPES.AFTER_MISS, afterMissData);
            if (afterMissExtraRequests.length > 0) {
                missData.extraRequests = afterMissExtraRequests;
            }
        }

        return missData;
    }

    const allyBuffs = (target.camp === CAMP_TYPES.ALLY && A ? A._activeBuffs : (target.camp === CAMP_TYPES.ENEMY && B ? B._activeBuffs : []));
    if (target.state._stunned) return { skipped: false };
    const hasCloudBody = hasBuff(allyBuffs, BUFF_TYPES.CLOUD_BODY) || ((target.isXiaoZhaoSister || target.isXiaoZhaoBrother) && target.state._permanentBuffs && target.state._permanentBuffs.some(b => b.key === BUFF_TYPES.CLOUD_BODY));
    // 2026-09-22 不可闪避：攻击方带 _ignoreDodge 时整体跳过闪避判定（灭绝师太反击用，见 core/10 额外攻击循环）
    // 2026-09-24 _canAlwaysDodge 替代 isWei 硬编码：行动过仍可闪避由组件声明
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
        const rates = [];
        for (const ruleFn of getDodgeRules()) {
            const r = ruleFn(target, unit) || 0;
            if (r > 0) rates.push(r);
        }
        if ((defenderBuffStats.dodgeBonus || 0) > 0) rates.push(defenderBuffStats.dodgeBonus);
        let product = 1;
        for (const r of rates) { product *= (1 - r); }
        target.state._dodgeChance = Math.round((1 - product) * 100);
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

            eventBus.emit(SIGNAL_TYPES.ON_DODGE, { unit, target, reboundDmg, declarations: dodgeDeclarations });

            resolveDodgeEffects(dodgeDeclarations, unit, target, log);

            unit.state._acted = true;
            emitEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: getStat(unit, 'atk'), def: getStat(unit, 'def'), _stunned: true });

            const dodgeData = {
                skipped: true,
                dodgeFact: {
                    type: 'dodge',
                    attacker: snapshotUnitForFact(unit),
                    dodger: snapshotUnitForFact(target),
                    reboundDmg,
                    attackerHpBefore: unitHpBeforeRebound,
                    attackerHpAfter: Math.floor(unit.hp),
                    attackerAlive: unit.alive,
                    attackerAtk: Math.floor(getStat(unit, 'atk')),
                    dodgerDef: Math.floor(getStat(target, 'def')),
                    dodgerHp: Math.floor(target.hp),
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

    // refs 直接构造，modifier 链就地读写；不再手动解构-装回
    const refs = {
        defBase: Math.floor(getStat(target, 'def')),
        defReduced: 0,
        ignoreDefRatio: 0,
        bonusDmgTotal: 0,
        dmgMultiplier: 1,
        bonusDmgEntries: [],
        dmgMultiplierEntries: []
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
    applyStatChange(target, 'hp', hpBonus, unit, '伤害波动回血', false);
    let waveTaunt = null, waveUnit = null;
    if (atkVar === C.ATK_VAR) { waveTaunt = getRandomTaunt(unit); waveUnit = unit; unit.critCount++; emitEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: getStat(unit, 'atk'), def: getStat(unit, 'def'), critCount: unit.critCount }); }
    else if (defVar + hpBonus >= 7) {
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
export function applyAttackResult(unit, target, dmgCalc, attackerBuffStats, defenderBuffStats, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid) {
    const rng = getBattleRng();
    let { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, raw, rawFormula, thunderBonus, hornDmgMultiplier, trueDmg, dmg, bonusEntries, defReduction } = dmgCalc;

    let hpAfter = Math.floor(target.hp) - dmg;
    let dead = hpAfter <= 0;
    applyStatChange(target, 'hp', -dmg, unit, '攻击伤害');
    if (dmgCalc.blockValue > dmg) {
        recordCombatStat(unit, target, 'damage', {
            rawAmount: dmgCalc.blockValue - dmg,
            actualAmount: 0
        });
    }
    if (dead) {
        // 2026-09-16 不再直接设 alive=false：留给 resolveDeaths 统一处理。
        //   否则 resolveDeaths 的 (_pendingDeath && alive) 过滤为空 → DEATH 信号不发
        //   → watchUnit 收不到重判 → 张无忌不变身
        target.state._pendingDeath = true;
        if (!target.state._deathTime) target.state._deathTime = Date.now();
    }

    if (dead && target.camp === CAMP_TYPES.ENEMY && unit.camp === CAMP_TYPES.ALLY && !target.state._tokenDropped) {
        const stage = getBattleState('currentStage') || 1;
        const dropRate = (C.TOKEN_DROP_RATES[stage] || 0) / 100;
        if (rng.next() < dropRate) {
            target.state._tokenDropped = true;
            const currentToken = getBattleState('holyToken') || 0;
            setBattleState('holyToken', currentToken + 1);
            persistValue('ming_holy_token_5v5_test', currentToken + 1);
            pushBattleEvent({ unitUid: unit.uid, eventType: 'info', payload: { text: `🔥 圣火令掉落！${unit.name} 击杀 ${target.name}，获得1枚圣火令！当前总数：${currentToken + 1}`, fastEntry: true } });
            log.push({ factType: FACT_TYPES.DROP, data: { kind: DROP_TYPES.TOKEN, killerName: unit.name, victimName: target.name, total: currentToken + 1, unitUid: unit.uid } });
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
            log.push({ factType: FACT_TYPES.DROP, data: { kind: DROP_TYPES.CHEST, killerName: unit.name, victimName: target.name, total: chests, unitUid: unit.uid } });
        }
    }

    let horseReboundDeclarations = [];
    const xiaoHEnhance = query('xiaoHexEnhance', A, A._activeBuffs, BUFF_TYPES.HORSE_FORMATION);
    if (target.isHorse && dmg > 0 && xiaoHEnhance && hasBuff(A._activeBuffs, BUFF_TYPES.HORSE_FORMATION)) {
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
    let allyBuffs_fortify = (target.camp === CAMP_TYPES.ALLY ? A._activeBuffs : B._activeBuffs) || [];
    if (hasBuff(allyBuffs_fortify, BUFF_TYPES.FORTIFY) && target.role === ROLE_TYPES.DEFENDER && dmg > 0) {
        const reboundDmg = Math.floor((atkAct - Math.floor(atkAct * (atkAct / (atkAct + defAct)))) / 2);
        if (reboundDmg > 0) {
            const hasSister = A && A.some(u => u.isXiaoZhaoSister && u.alive);
            fortifyDeclarations = [{
                type: EFFECT_TYPES.REBOUND,
                value: reboundDmg,
                source: target,
                target: unit,
                hasSister,
                factType: FACT_TYPES.FORTIFY_REBOUND,
                factData: { reboundDmg, unitName: unit.name, hasSister, attackerUid: unit.uid, unitUid: target.uid }
            }];
        }
    }

    return { dmg, dead, horseReboundDeclarations, reboundEntry, bonusEntries, hpBefore, defReduction, waveTaunt, waveUnit, rawFormula, thunderBonus, hornDmgMultiplier, trueDmg, atkAct, defAct, hpBonus, fortifyDeclarations };
}

// 死亡结算边裁
export function resolveDeaths(allySide, enemySide, log) {
    const allUnits = [...allySide, ...enemySide];
    const pending = allUnits.filter(u => u.state._pendingDeath && u.alive);
    if (pending.length === 0) return;

    eventBus.emit(SIGNAL_TYPES.ON_BEFORE_DEATH, { units: pending, allySide, enemySide, log });

    // 2026-09-22 支持「替死」：ON_BEFORE_DEATH 监听器可以清掉自己的 _pendingDeath 来取消本次死亡
    //   （谢逊消耗狮子替死）。pending 是发射前的快照，只清标记是取消不掉循环的，必须逐条复查。
    const died = [];
    for (const u of pending) {
        if (!u.state._pendingDeath) continue;
        applyStatChange(u, 'hp', -u.hp, null, '死亡结算', false);
        u.alive = false;
        u.state._isDead = true;
        // 2026-09-19 修字段 bug：标记时写的是 state._pendingDeath，清理时写成了顶层
        u.state._pendingDeath = false;
        emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: false, atk: getStat(u, 'atk'), def: getStat(u, 'def'), _isDead: true });
        // 2026-09-24 死亡不再发 UNIT_REMOVE：伤口一结算就把格子从 store 摘掉，会出现「格子先空、死亡特效后到」。
        //   改为只保留 _isDead 状态 → 格子当帧就上死亡态（红底 ✕），尸体交给 player/42 的 3 秒清尸计时统一移除。
        emitStateChange(u, STATE_CHANGE_TYPES.DEATH, {}, log);
        died.push(u);
    }

    if (died.length > 0) {
        eventBus.emit(SIGNAL_TYPES.ON_UNIT_DEATH, { deadUnits: died, allySide, enemySide, log });
    }
}

// 伤害免疫边裁
export function resolveDamageImmune(declarations) {
    if (!declarations || declarations.length === 0) return null;
    const immuneDecls = declarations.filter(d => d.immune);
    if (immuneDecls.length === 0) return null;
    return immuneDecls[0];
}

// 攻击后效果结算
export function resolveAfterDamageEffects(declarations, unit, target, group, allySide, unitBuffs) {
    if (!declarations || declarations.length === 0) return [];

    const executed = [];
    const typeOrder = [
        EFFECT_TYPES.BONUS_DMG,
        EFFECT_TYPES.LEECH,
        EFFECT_TYPES.HEAL,
        EFFECT_TYPES.SPLASH,
        EFFECT_TYPES.REBOUND,
        EFFECT_TYPES.STAT_CHANGE,
        EFFECT_TYPES.EXECUTE,
        EFFECT_TYPES.CLAW_CHAIN
    ];

    for (const type of typeOrder) {
        if (!hasEffectHandler(type)) continue;
        const decls = declarations.filter(d => d.type === type);
        if (decls.length === 0) continue;
        for (const decl of decls) {
            const missing = validateDeclarationFields(type, decl);
            if (missing && missing.length > 0) {
                throw new Error(`[12battle-attack-steps] ${type} 声明缺字段: ${missing.join(', ')}`);
            }
        }
        const result = getEffectHandler(type)({
            decls,
            unit,
            target,
            group,
            allySide,
            unitBuffs,
            log: null
        });
        if (result && result.executed) executed.push(...result.executed);
    }

    const knownTypes = new Set(typeOrder);
    for (const decl of declarations) {
        if (!decl || !decl.type || !knownTypes.has(decl.type)) {
            executed.push(decl);
        }
    }

    return executed;
}

// 步骤5：构建攻击事实
export function buildAttackGroup(unit, target, dmgCalc, dmgResult, attackerBuffStats, defenderBuffStats, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, phantomFact) {
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
    // 2026-09-16 修正：修饰器 fact（乾坤等）必须进 entries 才能进 log→31 拿 stageAction。
    // 上轮删这条是删错方向；该删的是 renderAttackFact 直读 dmgResult.bonusEntries 那条（见改动 B）。
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
            snap
        },
        _events: []
    };

    return attackFact;
}

export function isUnitStunned(unit) {
    return !!(unit && unit.state._stunned);
}

// 闪避后效果边裁
export function resolveDodgeEffects(declarations, unit, target, log) {
    if (!declarations || declarations.length === 0) return;

    for (const decl of declarations) {
        if (decl.type === EFFECT_TYPES.REBOUND) {
            applyStatChange(unit, 'hp', -decl.value, target, '闪避反击');
        } else if (decl.type === EFFECT_TYPES.STUN) {
            unit.state._stunned = true;
            emitEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: getStat(unit, 'atk'), def: getStat(unit, 'def'), _stunned: true });
            emitStateChange(unit, STATE_CHANGE_TYPES.STUNNED, {}, log);
        } else if (decl.type === EFFECT_TYPES.WEI_HEAL) {
            const { heal, newMaxHp } = decl.data;
            // 词条化：27 传的 newMaxHp 已是"当前 maxHp+heal"的绝对值（不封顶），这里只算增量
            const delta = Math.max(0, newMaxHp - Math.floor(getStat(target, 'maxHp')));
            if (delta > 0) {
                addMod(target, 'maxHp', { source: '韦一笑吸血', value: delta, ttl: 'permanent', group: 'weiLeech', op: 'add' });
                refreshMaxHp(target, null, '韦一笑吸血上限提升');
            }
            recordCombatStat(target, target, 'leech', {
                actualAmount: heal
            });
        }
    }
}