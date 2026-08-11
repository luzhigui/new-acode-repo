// core/49battle-attack-steps.js - 光明顶5v5 攻击步骤拆分模块
// V5.4.0 | ~35600 bytes| 2026-07-28 乾坤反弹迁移至事件总线
export const VER = 'core/49battle-attack-steps.js V5.4.0';

import { CONFIG, DEF_TAUNT, HP_TAUNT, getSkillParams } from './01config-5v5-test.js';
import { eventBus } from './00-event-bus.js';
import { rand, calcDamage, getFangLevel, isMelee, getFronts, isBlocked, getRandomTaunt, getZhangNearTaunt, makeFXSnapshot, hasBuff, getUnitCol, getUnitRow } from './03battle-utils.js';
import { computeBuffStats, applyBuffEffectsBeforeAttack, applyBuffEffectsAfterAttack } from './04buff-system.js';
import { emitEvent, applyStatChange, applyMaxHpChange, query, getBattleRng } from './50battle-shared.js';
import { GlobalStore } from '../modules/46global-store.js';

// ==================== 闪避规则注册表 ====================
// 裁判统一管理所有闪避规则。每个规则是一个函数 (unit, attacker) => dodgeRate (0~1)
// 通用规则在模块加载时注册，精英规则通过事件总线在回合开始注册
const _dodgeRules = [];

/**
 * 注册闪避规则（通用或精英均可调用）
 * @param {function} fn - (unit, attacker) => dodgeRate
 */
export function registerDodgeRule(fn) {
    _dodgeRules.push(fn);
}

/**
 * 清除精英注册的动态规则，保留通用规则
 */
export function clearEliteDodgeRules() {
    _dodgeRules.length = 2; // 保留前两条通用规则
}

// 通用规则：飞行单位基础闪避15%
registerDodgeRule((unit, attacker) => {
    if (unit.role === '飞行') return CONFIG.BASE_DODGE_FLY || 0.15;
    return 0;
});

// 通用规则：非飞行单位基础闪避3%
registerDodgeRule((unit, attacker) => {
    if (unit.role !== '飞行') return CONFIG.BASE_DODGE_GROUND || 0.03;
    return 0;
});

const C = CONFIG, DT = DEF_TAUNT, HT = HP_TAUNT;

// ==================== 步骤1：选择攻击目标 ====================
export function selectAttackTarget(unit, enemySide, allySide) {
    const rng = getBattleRng();
    // 可选中目标池（存活、非不可选中）
    const validTargets = enemySide.filter(c => c.alive && !c._untargetable);
    if (validTargets.length === 0) return { target: null, phantomLog: null };

    // ---------- 第一步：声明收集 ----------
    // 组件可声明 { target, method, reason } 覆盖通用规则
    const declaration = { targetResult: null };
    eventBus.emit('beforeSelectTarget', { unit, enemySide, allySide, validTargets, declaration });

    // ---------- 第二步：裁判裁定 ----------
    let target = null;
    let phantomLog = null;

    if (declaration.targetResult) {
        // 组件直接指定目标 → 校验合法性
        const declared = declaration.targetResult;
        if (declared && validTargets.includes(declared)) {
            target = declared;
            phantomLog = declaration.phantomLog || null;
        }
        // 不合法则回退到通用规则
    }

    if (!target) {
        // 通用规则：按角色类型匹配选择方法
        if (unit.isWei) {
            // 韦一笑：全场血量最低优先
            const sorted = [...validTargets].sort((a, b) => a.hp - b.hp);
            target = sorted[0];
        } else if (unit.role === '飞行') {
            // 普通飞行：血量低于40%的残血优先，否则前排随机
            const lowHpTargets = validTargets.filter(u => u.hp / u.maxHp < 0.4);
            if (lowHpTargets.length > 0) {
                target = lowHpTargets[rng.nextInt(0, lowHpTargets.length - 1)];
            } else {
                let fronts = getFronts(validTargets);
                if (fronts.length > 0) {
                    target = fronts[rng.nextInt(0, fronts.length - 1)];
                } else {
                    target = validTargets[rng.nextInt(0, validTargets.length - 1)];
                }
            }
        } else if (isMelee(unit.role) || unit.isHorse) {
            // 近战 / 拒马：前排随机
            const fronts = getFronts(validTargets);
            if (fronts.length === 0) return { target: null, phantomLog: null };
            target = fronts[rng.nextInt(0, fronts.length - 1)];
        } else {
            // 远程：全场随机
            target = validTargets[rng.nextInt(0, validTargets.length - 1)];
        }
    }

    // ---------- 第三步：感知校验 ----------
    if (!target || !target.alive || target._untargetable) {
        // 校验失败，尝试回退
        const fallback = validTargets.filter(c => c.alive && !c._untargetable);
        if (fallback.length === 0) return { target: null, phantomLog: null };
        target = fallback[rng.nextInt(0, fallback.length - 1)];
    }

    return { target, phantomLog };
}

// ==================== 步骤2：未命中+闪避判定 ====================
/**
 * 判定本次攻击是否命中/被闪避
 * @param {Unit} unit - 攻击者
 * @param {Unit} target - 目标
 * @param {object} attackerBuffStats - 攻击者 Buff 统计 { atkBonus, defBonus, dodgeBonus }
 * @param {object} defenderBuffStats - 目标 Buff 统计
 * @param {Array} log - 日志数组
 * @param {Array} A - 明教方单位数组
 * @param {Array} B - 六大派方单位数组
 * @param {string|null} doubleStrikeUnitUid - 概率连击单位 uid
 * @param {EventBus} eventBus - 事件总线实例
 * @returns {{ skipped: boolean, retry: boolean, lockedTargetUid: string|null, missGroup?: object, dodgeGroup?: object }}
 *   返回命中结果：skipped=true 表示跳过后续伤害步骤，retry=true 需递归重试
 */
export function resolveAttackHit(unit, target, attackerBuffStats, defenderBuffStats, log, A, B, doubleStrikeUnitUid, eventBus) {
    const rng = getBattleRng();
    let missChance = 0;
    if (unit.role === '远程') { missChance = 3; }
    else if (unit.role === '飞行') {
        missChance = 6;
        // 飞行攻击残血目标时，场上每有一个残血单位，未命中率 +3%
        const allUnits = [...(A || []), ...(B || [])];
        const lowHpCount = allUnits.filter(u => u.alive && u.hp / u.maxHp < 0.4).length;
        missChance += lowHpCount * 3;
    }
    else { missChance = 1; }

    if (missChance > 0 && rng.nextInt(1,100) <= missChance) {
        // 未命中 — 返回日志数据让调用方拼接
        const missData = {
            skipped: true, retry: false, lockedTargetUid: null,
            missGroup: {
                type:'attack-group', uidA:unit.uid, uidD:target.uid, entries:[], isMiss:true,
                _fxSnapshot:makeFXSnapshot(unit,target), waveTaunt:null, waveUnit:null,
                buffEffects: [], needsSeparator: true,
                combatText: `<span class="${unit.camp==='ally'?'blue':'orange'}">${unit.camp==='ally'?'明教':'六大派'} ${unit.name}</span> 的攻击`,
                infoText: `<span class="gray">未命中！</span>`
            }
        };
        unit.state._acted = true;
        missData.missGroup._events = GlobalStore.flushBattleEvents();

        if (eventBus) {
            let afterMissData = { unit, target, log, retry: false, retryTargetUid: null };
            eventBus.emit('afterMiss', afterMissData);
            if (afterMissData.retry) {
                return { skipped: true, retry: true, lockedTargetUid: afterMissData.retryTargetUid };
            }
        }

        return missData;
    }

    const allyBuffs = (target.camp === 'ally' && A ? A._activeBuffs : (target.camp === 'enemy' && B ? B._activeBuffs : []));
    if (target.state._stunned) return { skipped: false, retry: false, lockedTargetUid: null };
    const hasCloudBody = hasBuff(allyBuffs, 'cloudBody') || ((target.isXiaoZhaoSister || target.isXiaoZhaoBrother) && target._permanentBuffs && target._permanentBuffs.some(b => b.key === 'cloudBody'));
    if (target.alive && (target.isWei || hasCloudBody || !target.state._acted)) {
        // 各闪避来源独立判定（乘法叠加），任一触发即闪避
        let dodgeTriggered = false;
        for (const ruleFn of _dodgeRules) {
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
        // 将最终总闪避率写入单位，供面板显示
        target._dodgeChance = Math.round((defenderBuffStats.dodgeBonus || 0) * 100);
        if (dodgeTriggered) {
            target.dodgeCount++;
            let reboundDmg = Math.floor((target.atk + target.def) * C.DODGE_REBOUND_RATIO);
            let unitHpBeforeRebound = Math.floor(unit.hp);

            // ---------- 闪避后效果声明收集 ----------
            const dodgeDeclarations = [];
            // 反击伤害提交声明
            dodgeDeclarations.push({ type: 'rebound', value: reboundDmg });
            // 眩晕提交声明
            dodgeDeclarations.push({ type: 'stun' });

            // 韦一笑吸血等组件通过 onDodge 追加声明
            eventBus.emit('onDodge', { unit, target, reboundDmg, declarations: dodgeDeclarations });

            // ---------- 裁判执行闪避后效果 ----------
            resolveDodgeEffects(dodgeDeclarations, unit, target);

            unit.state._acted = true;
            emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _stunned: true });

            const dodgeData = {
                skipped: true, retry: false, lockedTargetUid: null,
                dodgeGroup: {
                    type:'attack-group', uidA:target.uid, uidD:unit.uid, entries:[], isDodge:true,
                    hpAfter:unit.hp, alive:unit.alive,
                    _fxSnapshot:makeFXSnapshot(target,unit), waveTaunt:null, waveUnit:null,
                    buffEffects:[], _atkBonus:0, _defBonus:0, needsSeparator: true,
                    isDead: unit.hp <= 0,
                    combatText: `<span class="${unit.camp==='ally'?'blue':'orange'}">${unit.camp==='ally'?'明教':'六大派'} ${unit.name}</span>(攻${Math.floor(unit.atk)} 血${unitHpBeforeRebound}) → <span class="${target.camp==='ally'?'blue':'orange'}">${target.camp==='ally'?'明教':'六大派'} ${target.name}</span>(防${Math.floor(target.def)} 血${Math.floor(target.hp)})`,
                    dodgeText: `<span class="gray">🦅 ${target.name}闪避了攻击！</span>`,
                    reboundText: `<span class="red">🦅 ${target.name}反击 → ${unit.name} 造成 ${reboundDmg} 真实伤害（${unitHpBeforeRebound} → ${Math.floor(unit.hp)}）</span>`,
                    stunText: `<span class="gray">😵 ${unit.name} 被反击眩晕，本回合无法行动！</span>`,
                    weiHealData: dodgeDeclarations.find(d => d.type === 'weiHeal')?.data || null,
                    _events: GlobalStore.flushBattleEvents()
                }
            };
            return dodgeData;
        }
    }
    return { skipped: false, retry: false, lockedTargetUid: null };
}

// ==================== 步骤3：伤害计算 ====================
/**
 * 计算本次攻击的最终伤害值
 * 第一步收集组件声明的破防/忽略防御/附加伤害/增伤倍率，第二步裁判统一结算，第三步基础伤害公式计算
 * @param {Unit} unit - 攻击者
 * @param {Unit} target - 目标
 * @param {object} attackerBuffStats - 攻击者 Buff 统计
 * @param {object} defenderBuffStats - 目标 Buff 统计
 * @param {Array} allySide - 攻击者阵营单位数组
 * @param {Array} enemySide - 目标阵营单位数组
 * @param {Array} log - 日志数组
 * @returns {{ atkBase: number, defBase: number, dmg: number, ... }} 伤害计算完整数据包
 */
export function calcFinalDamage(unit, target, attackerBuffStats, defenderBuffStats, allySide, enemySide, log) {
    // ---------- 第一步：伤害声明收集 ----------
    // 组件一次性声明所有效果，格式 { type: 'breakDef'|'ignoreDef'|'bonusDmg'|'dmgMultiplier', value: number, target }
    const damageDeclarations = [];
    eventBus.emit('beforeDamageCalc', { unit, target, allySide, enemySide, log, declarations: damageDeclarations });

    // ---------- 第二步：裁判应用声明 ----------
    let defBase = Math.floor(target.def);
    let defReduced = 0;
    let ignoreDefRatio = 0;
    let bonusDmgTotal = 0;
    let dmgMultiplier = 1;

    for (const decl of damageDeclarations) {
        if (decl.type === 'breakDef') {
            const reduce = Math.min(decl.value || 0, defBase);
            defBase -= reduce;
            applyStatChange(target, 'def', -reduce, unit, '破防');
            defReduced = reduce;
            if (reduce > 0) {
                unit._pendingDefReduceEntry = {type:'detail', text:`<span class="purple small">🗡️ ${unit.name} 破防：${target.name} 防御 -${reduce}</span>`};
                emitEvent(target, 'hp-change', { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: defBase, _isDead: target.state._isDead || false });
            }
        } else if (decl.type === 'ignoreDef') {
            ignoreDefRatio = Math.max(ignoreDefRatio, decl.value || 0);
        } else if (decl.type === 'bonusDmg') {
            bonusDmgTotal += decl.value || 0;
        } else if (decl.type === 'dmgMultiplier') {
            dmgMultiplier *= decl.value || 1;
        } else if (decl.type === 'dmgReduction') {
            // 乾坤衍生减伤：追加到 bonusDmgTotal（负数）或直接调整 raw
            bonusDmgTotal -= (decl.value || 0);
        }
    }

    if (ignoreDefRatio > 0) {
        defBase = Math.floor(defBase * (1 - ignoreDefRatio));
    }

    // ---------- 第三步：基础伤害计算 ----------
    let atkBase = Math.floor(unit.atk);
    const rng = getBattleRng();
    let atkVar = rng.nextInt(1, C.ATK_VAR), defVar = rng.nextInt(1, C.DEF_VAR), hpBonus = rng.nextInt(C.HP_BONUS_MIN + 1, C.HP_BONUS_MAX);
    let atkAct = atkBase + atkVar, defAct = defBase + defVar;
    let hpBefore = Math.floor(target.hp);
    applyStatChange(target, 'hp', hpBonus, unit, '伤害波动回血');
    let waveTaunt = null, waveUnit = null;
    if (atkVar === C.ATK_VAR) { waveTaunt = getRandomTaunt(unit); waveUnit = unit; unit.critCount++; }
    else if (defVar + hpBonus >= 7) { waveTaunt = DT[rng.nextInt(0, DT.length - 1)]; waveUnit = target; }
    if (unit.isZhang && !unit.rangedForm && unit.nearAtkCount < 3) {
        let zt = getZhangNearTaunt(unit.nearAtkCount + 1);
        if (zt && !waveTaunt) { waveTaunt = zt; waveUnit = unit; }
    }
    let raw, rawFormula, hpRatio = 0;
    if (unit.role === '防战') {
        let displayDef = Math.floor(unit.def);
        let lv = getFangLevel(displayDef, unit.m), k = C.FANG_K[lv] !== undefined ? C.FANG_K[lv] : C.FANG_K[C.FANG_K.length - 1];
        let penPart = calcDamage(atkAct, defAct);
        const maxHpRatio = unit.maxHp / unit.m;
        if (maxHpRatio >= 1.85) hpRatio = 0.060;
        else if (maxHpRatio >= 1.775) hpRatio = 0.050;
        else if (maxHpRatio >= 1.725) hpRatio = 0.039;
        else if (maxHpRatio >= 1.675) hpRatio = 0.033;
        else if (maxHpRatio >= 1.60) hpRatio = 0.028;
        else if (maxHpRatio >= 1.55) hpRatio = 0.022;
        else if (maxHpRatio >= 1.475) hpRatio = 0.017;
        else if (maxHpRatio >= 1.425) hpRatio = 0.013;
        else hpRatio = 0.01;
        raw = penPart + displayDef * k + unit.maxHp * hpRatio;
    } else {
        raw = calcDamage(atkAct, defAct);
    }

    // ---------- 第四步：声明增伤结算 ----------
    raw += bonusDmgTotal;
    raw *= dmgMultiplier;

    let dmg = Math.floor(raw);
    let bonusEntries = [];
    const modifierResult = query('damageModifiers', unit, target, dmg, enemySide, allySide, log);
    dmg = modifierResult.modifiedDmg;
    bonusEntries = modifierResult.entries || [];

    return { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, raw, rawFormula: null, thunderBonus: 0, hornDmgMultiplier: 1, hornDefIgnore: 0, trueDmg: 0, dmg, bonusEntries, defReduced, defReduction: null, bonusDmgTotal, dmgMultiplier, hpRatio: unit.role === '防战' ? hpRatio : 0 };
}

// ==================== 步骤4：应用伤害结果 ====================
/**
 * 将计算好的伤害应用到目标，处理击杀、掉落、拒马反伤、严阵以待反弹声明
 * @param {Unit} unit - 攻击者
 * @param {Unit} target - 目标
 * @param {object} dmgCalc - calcFinalDamage 的返回值（伤害计算数据包）
 * @param {Array} A - 明教方单位数组
 * @param {Array} B - 六大派方单位数组
 * @returns {{ dmg: number, dead: boolean, fortifyDeclarations: Array|null, ... }}
 */
export function applyAttackResult(unit, target, dmgCalc, attackerBuffStats, defenderBuffStats, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid) {
    const rng = getBattleRng();
    let { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, raw, rawFormula, thunderBonus, hornDmgMultiplier, trueDmg, dmg, bonusEntries, defReduction } = dmgCalc;

    let hpAfter = Math.floor(target.hp) - dmg;
    let dead = hpAfter <= 0;
    applyStatChange(target, 'hp', -dmg, unit, '攻击伤害');
    if (dead) {
        target.alive = false;
        target._pendingDeath = true;
        if (!target._deathTime) target._deathTime = Date.now();
    }

    // 战士斩杀 — 已由 registerBloodthirst 通过 afterDamageApplied 声明提交并执行
    unit.dmgDealt += dmg; target.dmgTaken += dmg;
    if (dead && target.camp === 'enemy' && unit.camp === 'ally' && !target._tokenDropped) {
        const stage = GlobalStore.get('currentStage') || 1;
        const dropRate = (C.TOKEN_DROP_RATES[stage] || 0) / 100;
        if (rng.next() < dropRate) {
            target._tokenDropped = true;
            const currentToken = GlobalStore.get('holyToken') || 0;
            GlobalStore.set('holyToken', currentToken + 1);
            localStorage.setItem('ming_holy_token_5v5_test', String(currentToken + 1));
            window.GlobalStore.pushBattleEvent({ unitUid: unit.uid, eventType: 'info', payload: { text: `🔥 圣火令掉落！${unit.name} 击杀 ${target.name}，获得1枚圣火令！当前总数：${currentToken + 1}`, fastEntry: true } });
            log.push({type:'info', text:`<span class="gold">🔥 圣火令掉落！${unit.name} 击杀 ${target.name}，获得1枚圣火令！当前总数：${currentToken + 1}</span>`, fastEntry: true, unitUid: unit.uid});
        }
    }
    if (dead && target.camp === 'enemy' && unit.camp === 'ally' && !target._chestDropped) {
        const chestKillRate = C.CHEST_DROP_RATE / 100;
        if (rng.next() < chestKillRate) {
            target._chestDropped = true;
            let chests = parseInt(localStorage.getItem('ming_chest_count') || '0');
            chests++;
            localStorage.setItem('ming_chest_count', String(chests));
            GlobalStore.set('chestCount', chests);
            window.GlobalStore.pushBattleEvent({ unitUid: unit.uid, eventType: 'info', payload: { text: `🎁 宝箱掉落！${unit.name} 击杀 ${target.name}，获得1个宝箱！当前总数：${chests}`, fastEntry: true } });
        }
    }

    // 拒马反伤
    let horseReboundEntry = null;
    const xiaoHEnhance = query('xiaoHexEnhance', A, A._activeBuffs, 'horseFormation');
    if (target.isHorse && dmg > 0 && xiaoHEnhance && hasBuff(A._activeBuffs, 'horseFormation')) {
        const rebound = xiaoHEnhance.reboundDmg;
        applyStatChange(unit, 'hp', -rebound, target, '巨马反伤');
        horseReboundEntry = {type:'info', text:`<span class="red">🐴 巨马反伤：${unit.name} 受到 ${rebound} 点反伤</span>`};
    }

    // 防战坚盾已迁移至事件总线监听器
    emitEvent(target, 'hp-change', { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: target.def, _isDead: target.state._isDead || false });

    // 小昭姐乾坤衍生已迁移至事件总线 allyDamaged 信号

    // 严阵以待反弹 — 提交声明，由攻击后效果边裁统一执行
    let reboundEntry = null;
    let fortifyDeclarations = null;
    let allyBuffs_fortify = (target.camp === 'ally' ? A._activeBuffs : B._activeBuffs) || [];
    if (hasBuff(allyBuffs_fortify, 'fortify') && target.role === '防战' && dmg > 0) {
        const reboundDmg = Math.floor((atkAct - Math.floor(atkAct * (atkAct / (atkAct + defAct)))) / 2);
        if (reboundDmg > 0) {
            const hasSister = A && A.some(u => u.isXiaoZhaoSister && u.alive);
            fortifyDeclarations = [{
                type: 'rebound',
                value: reboundDmg,
                source: target,
                target: unit,
                hasSister,
                logText: hasSister
                    ? `<span class="gold">🛡️ 严阵以待反弹${reboundDmg}给${unit.name}（姐姐强化：回复${reboundDmg}）</span>`
                    : `<span class="gold">🛡️ 严阵以待反弹${reboundDmg}给${unit.name}</span>`
            }];
        }
    }

    return { dmg, dead, horseReboundEntry, reboundEntry, bonusEntries, hpBefore, defReduction, waveTaunt, waveUnit, rawFormula, thunderBonus, hornDmgMultiplier, trueDmg, atkAct, defAct, hpBonus, fortifyDeclarations };
}

// ==================== 死亡结算边裁 ====================
// 裁判统一裁定死亡：扫描待死亡单位 → 发射声明 → 执行死亡 → 移除
export function resolveDeaths(allySide, enemySide, log) {
    const allUnits = [...allySide, ...enemySide];
    const pending = allUnits.filter(u => u._pendingDeath && u.alive);
    if (pending.length === 0) return;

    // 发射死亡前声明（预留亡语接口）
    eventBus.emit('onBeforeDeath', { units: pending, allySide, enemySide, log });

    // 执行死亡 — 走统一状态变更入口
    for (const u of pending) {
        applyStatChange(u, 'hp', -u.hp, null, '死亡结算');
        u.alive = false;
        u.state._isDead = true;
        u._pendingDeath = false;
        emitEvent(u, 'unit-remove', { uid: u.uid });
    }

    // 死亡完成后广播（被动技能监听，如张无忌前排检测）
    if (pending.length > 0) {
        eventBus.emit('onUnitDeath', { deadUnits: pending, allySide, enemySide, log });
    }
}

// ==================== 伤害免疫边裁 ====================
// 收集所有免疫声明，统一裁定本次伤害是否免疫
// 当前规则：任一声明要求免疫即免疫。预留扩展为多声明时按 priority 选一个生效
export function resolveDamageImmune(declarations) {
    if (!declarations || declarations.length === 0) return null;
    const immuneDecls = declarations.filter(d => d.immune);
    if (immuneDecls.length === 0) return null;
    // 多个免疫声明时取第一个（后续可改为按 priority 排序取最优）
    return immuneDecls[0];
}

// ==================== 攻击后效果结算 ====================
/**
 * 裁判统一执行攻击后附加效果。裁决顺序：额外伤害 → 吸血 → 回血 → 溅射 → 反弹 → 属性变更 → 斩杀 → 其他
 * @param {Array} declarations - 攻击后效果声明数组，组件通过 afterDamageApplied 信号提交
 * @param {Unit} unit - 攻击者
 * @param {Unit} target - 目标
 * @param {object} group - 攻击组日志对象（未使用，预留）
 * @returns {Array} 已执行的声明列表，供调用方拼接日志
 */
export function resolveAfterDamageEffects(declarations, unit, target, group) {
    if (!declarations || declarations.length === 0) return [];

    const executed = []; // 记录已执行的声明，供调用方拼接日志

    // 0. 主目标额外伤害
    for (const decl of declarations.filter(d => d.type === 'bonusDmg')) {
        if (!decl.target || !decl.target.alive) continue;
        applyStatChange(decl.target, 'hp', -(decl.value || 0), unit, '额外伤害');
        executed.push(decl);
    }

    // 1. 吸血
    for (const decl of declarations.filter(d => d.type === 'leech')) {
        if (!decl.source || !decl.source.alive) continue;
        const capped = Math.min(decl.value || 0, decl.source.maxHp - decl.source.hp);
        applyStatChange(decl.source, 'hp', capped, null, '吸血');
        decl.source.leechDone = (decl.source.leechDone || 0) + capped;
        executed.push(decl);
    }

    // 2. 回血
    for (const decl of declarations.filter(d => d.type === 'heal')) {
        if (!decl.source || !decl.source.alive) continue;
        const capped = Math.min(decl.value || 0, decl.source.maxHp - decl.source.hp);
        if (capped > 0) {
            applyStatChange(decl.source, 'hp', capped, null, '回血');
            if (decl.source.dmgTaken !== undefined) decl.source.dmgTaken -= capped;
        }
        executed.push(decl);
    }

    // 3. 溅射
    for (const decl of declarations.filter(d => d.type === 'splash')) {
        if (!decl.targets || decl.targets.length === 0) continue;
        for (const st of decl.targets) {
            if (!st.alive) continue;
            applyStatChange(st, 'hp', -(decl.value || 0), unit, '溅射');
        }
        // 流星赶月溅射触发远程成长：每命中一个目标 +2 攻
        if (unit && unit.role === '远程' && decl.buffType === 'meteor_splash') {
            const hitCount = decl.targets.filter(t => t.alive).length;
            if (hitCount > 0) {
                applyStatChange(unit, 'atk', hitCount * 2, null, '流星溅射成长');
                if (unit._baseAtk !== undefined) unit._baseAtk += hitCount * 2;
                decl.logText += ` <span class="gold">⚡ ${unit.name} 攻击+${hitCount * 2}</span>`;
            }
        }
        executed.push(decl);
    }

    // 3.5 反弹
    for (const decl of declarations.filter(d => d.type === 'rebound')) {
        if (!decl.target || !decl.target.alive) continue;
        applyStatChange(decl.target, 'hp', -(decl.value || 0), decl.source, '反弹');
        if (decl.source) decl.source.reboundDone = (decl.source.reboundDone || 0) + (decl.value || 0);
        if (decl.hasSister && decl.source && decl.source.alive) {
            applyStatChange(decl.source, 'hp', decl.value || 0, null, '反弹回复');
        }
        executed.push(decl);
    }

    // 3.5 属性变更（乾坤衍生加攻等）
    for (const decl of declarations.filter(d => d.type === 'statChange')) {
        if (!decl.target || !decl.target.alive) continue;
        applyStatChange(decl.target, decl.field, decl.delta, null, '乾坤衍生');
        if (decl.field === 'atk' && decl.target._baseAtk !== undefined) {
            decl.target._baseAtk += decl.delta;
        }
        executed.push(decl);
    }

    // 3.6 斩杀（战士斩杀等）
    for (const decl of declarations.filter(d => d.type === 'execute')) {
        if (!decl.target || !decl.target.alive) continue;
        applyStatChange(decl.target, 'hp', -decl.target.hp, decl.source, '斩杀');
        // 斩杀产生的事件（hp-change/_isDead）立即收集，避免被后续攻击组抢占
        decl._events = GlobalStore.flushBattleEvents();
        executed.push(decl);
    }

    // 4. 其他
    for (const decl of declarations.filter(d => !['bonusDmg','leech','heal','splash','rebound','statChange','execute'].includes(d.type))) {
        executed.push(decl);
    }

    return executed;
}

// ==================== 步骤5：构建攻击组日志 + 攻击后效果 ====================
/**
 * 构建 attack-group 日志对象并推入 log 数组，触发攻击后 Buff 效果
 * @param {Unit} unit - 攻击者
 * @param {Unit} target - 目标
 * @param {object} dmgCalc - calcFinalDamage 的返回值
 * @param {object} dmgResult - applyAttackResult 的返回值
 * @param {Array} log - 日志数组（直接修改，push group）
 * @param {Array} A - 明教方单位数组
 * @param {Array} B - 六大派方单位数组
 * @param {string|null} phantomLog - 幻影伪装日志文本
 * @returns {object} group - 攻击组日志对象，供播放器消费
 */
export async function buildAttackGroup(unit, target, dmgCalc, dmgResult, attackerBuffStats, defenderBuffStats, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, phantomLog) {
    let { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, raw, rawFormula, thunderBonus, hornDmgMultiplier, hornDefIgnore, trueDmg, defReduction, bonusDmgTotal, dmgMultiplier, hpRatio } = dmgCalc;
    let { dmg, dead, horseReboundEntry, reboundEntry, bonusEntries } = dmgResult;

    let hpPctBefore = Math.floor((hpBefore / target.maxHp) * 100), hpPctAfter = Math.floor((target.hp / target.maxHp) * 100);
    let campA = unit.camp === 'ally' ? '明教' : '六大派', campD = target.camp === 'ally' ? '明教' : '六大派';
    let ac = unit.camp === 'ally' ? 'blue' : 'orange', dc = target.camp === 'ally' ? 'blue' : 'orange';
    let displayAtk = Math.floor(unit.atk + unit.atk * attackerBuffStats.atkBonus);
    let displayDef = Math.floor(target.def + target.def * defenderBuffStats.defBonus);
    let unitHpBefore = Math.floor(unit.hp);
    let group = { type:'attack-group', uidA:unit.uid, uidD:target.uid, entries:[], hpAfter:target.hp, alive:target.alive, isDead:dead, waveTaunt, waveUnit, unitRole:unit.role, _fxSnapshot:makeFXSnapshot(unit,target), _dmg:dmg, _isZhangNear:unit.isZhang && !unit.rangedForm, _nearAtkCount:unit.nearAtkCount, hpPctBefore, hpPctAfter, isMiss:false, isDodge:false, buffEffects:[], needsSeparator: true, _atkBonus:Math.floor(unit.atk * attackerBuffStats.atkBonus), _defBonus:Math.floor(target.def * defenderBuffStats.defBonus), isKuLianAttack: !!(unit.name === '宋青书' && unit._kuLianActive) };

    if (unit._pendingDefReduceEntry) {
        group.entries.push(unit._pendingDefReduceEntry);
        delete unit._pendingDefReduceEntry;
    }
    group.entries.push({type:'combat-text', text:`<span class="${ac}">${campA} ${unit.name}</span>(攻${displayAtk} 血${unitHpBefore}) → <span class="${dc}">${campD} ${target.name}</span>(防${displayDef} 血${hpBefore})`});
    if (phantomLog) {
        group.entries.push({type:'info', text:`<span class="gold">${phantomLog}</span>`});
    }
    if (horseReboundEntry) group.entries.push(horseReboundEntry);
    group.entries.push({type:'detail', text:`<span class="gray small">波动：攻${atkBase}→${atkAct} 防${defBase}→${defAct} 血${hpBonus >= 0 ? '+' + hpBonus : hpBonus}</span>`});
    if (thunderBonus > 0) group.entries.push({type:'detail', text:`<span class="red small">💥 混元霹雳劲+${thunderBonus}真实伤害</span>`});
    if (hornDefIgnore > 0 && hornDmgMultiplier > 1) {
        group.entries.push({type:'info', text:`<span class="gold">🦌 目标已中毒（玄冥神掌），鹤笔翁 鹿角杖法伤害+50%！</span>`});
    }
    if (trueDmg > 0) group.entries.push({type:'detail', text:`<span class="red small">⚔️ 叛逆真伤+${trueDmg}（目标当前生命${Math.round((C.ELITE_SKILLS?.rebelStrike?.currentHpRatio || 0.12) * 100)}%）</span>`});
    // 拼接伤害公式
    let formulaText = '';
    if (unit.role === '防战') {
        const penPart = calcDamage(atkAct, defAct);
        const lv = getFangLevel(Math.floor(unit.def), unit.m);
        const k = C.FANG_K[lv] !== undefined ? C.FANG_K[lv] : C.FANG_K[C.FANG_K.length - 1];
        const z = hpRatio !== undefined ? hpRatio : C.HP_DMG_RATIO;
        formulaText = `${Math.floor(penPart)} + ${Math.floor(unit.def)}×${k} + ${Math.floor(unit.maxHp)}×${z} = ${Math.floor(raw)}`;
    } else {
        formulaText = `${atkAct}×(${atkAct}/(${atkAct}+${defAct})) = ${Math.floor(raw)}`;
    }
    if (bonusDmgTotal > 0) formulaText += ` + 额外伤害${bonusDmgTotal}`;
    if (dmgMultiplier !== 1) formulaText += `×${dmgMultiplier}`;
    // 如果最终伤害与公式原始值不同，追加减伤说明
    if (dmg !== Math.floor(raw)) {
        const reduction = Math.floor(raw) - dmg;
        formulaText += ` → 减伤${reduction} = ${dmg}`;
    }
    group.entries.push({type:'detail', text:`<span class="gray small">计算：${formulaText}</span>`});
    group.entries.push({type:'damage-text', deadFlag:dead, text:`<span class="damage-line ${dead?'brush-red':''} ${ac}">${dead?'💀击杀💀 ':''}${campA} ${unit.name}</span> 造成 <span class="red">${dmg}</span> 伤害，<span class="${dc}">${campD} ${target.name}</span> ${hpBefore} → ${Math.floor(target.hp)} ${dead?'💀阵亡':''}`});
    if (unit._executeLog) {
        unit._executeLog.forEach(e => group.entries.push(e));
        delete unit._executeLog;
    }

    for (const entry of bonusEntries) {
        group.entries.push(entry);
    }

    log.push(group);

    const postReboundEntry = applyPostAttackEffects(unit, target, dmg, atkAct, defAct, reboundEntry, allySide, enemySide, log, A);
    if (postReboundEntry) { log.push(postReboundEntry); }
    return group;
}

// 辅助函数
export function applyPostAttackEffects(unit, target, dmg, atkAct, defAct, reboundEntry, allySide, enemySide, log, A) {
    if (unit.camp === 'ally') {
        applyBuffEffectsBeforeAttack(unit, target, allySide, enemySide, log);
    } else {
        applyBuffEffectsBeforeAttack(unit, target, enemySide, allySide, log);
    }
    if (unit.camp === 'ally') {
        applyBuffEffectsAfterAttack(unit, target, dmg, allySide, enemySide, log);
    }
    // 反弹日志由调用方拼接，此处不再推送
    let dead = !target.alive;
    // 张无忌近战切换改为事件驱动：监听 onUnitDeath / onPositionSwap，不再手动调用
    return reboundEntry;
}

export function isUnitStunned(unit) {
    return !!(unit && unit.state._stunned);
}

// ==================== 闪避后效果边裁 ====================
/**
 * 统一裁定执行闪避后效果（反击伤害、眩晕、韦一笑吸血）
 * 组件通过 onDodge 信号提交声明，此函数由 resolveAttackHit 调用
 * @param {Array} declarations - 闪避后效果声明数组，每项 { type: 'rebound'|'stun'|'weiHeal', value?, data? }
 * @param {Unit} unit - 攻击者（闪避反击的承受方）
 * @param {Unit} target - 闪避者（闪避反击的来源方）
 */
export function resolveDodgeEffects(declarations, unit, target) {
    if (!declarations || declarations.length === 0) return;

    for (const decl of declarations) {
        if (decl.type === 'rebound') {
            applyStatChange(unit, 'hp', -decl.value, target, '闪避反击');
        } else if (decl.type === 'stun') {
            unit.state._stunned = true;
            emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _stunned: true });
        } else if (decl.type === 'weiHeal') {
            const { heal, newMaxHp } = decl.data;
            applyMaxHpChange(target, newMaxHp, null, '韦一笑吸血上限提升');
            target._baseMaxHp = Math.max(target._baseMaxHp, newMaxHp);
            target.healDone += heal;
            target.leechDone += heal;
        }
    }
}