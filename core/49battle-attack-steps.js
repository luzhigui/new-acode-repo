// core/49battle-attack-steps.js - 光明顶5v5 攻击步骤拆分模块
// V5.3.1 | ~23800 bytes| 2026-07-28 乾坤反弹迁移至事件总线
export const VER = 'core/49battle-attack-steps.js V5.3.1';

import { CONFIG, DEF_TAUNT, HP_TAUNT } from './01config-5v5-test.js';
import { eventBus } from './00-event-bus.js';
import { rand, calcDamage, getFangLevel, isMelee, getFronts, isBlocked, getRandomTaunt, getZhangNearTaunt, makeFXSnapshot, hasBuff, getUnitCol, getUnitRow } from './03battle-utils.js';
import { checkZhangSwitch } from './50battle-shared.js';
import { computeBuffStats, applyBuffEffectsBeforeAttack, applyBuffEffectsAfterAttack } from './04buff-system.js';
import { applyDamageModifiers, getXiaoZhaoHexEnhance } from '../modules/23elite-skills.js';
import { emitEvent } from './50battle-shared.js';

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
                target = lowHpTargets[rand(0, lowHpTargets.length - 1)];
            } else {
                let fronts = getFronts(validTargets);
                if (fronts.length > 0) {
                    target = fronts[rand(0, fronts.length - 1)];
                } else {
                    target = validTargets[rand(0, validTargets.length - 1)];
                }
            }
        } else if (isMelee(unit.role) || unit.isHorse) {
            // 近战 / 拒马：前排随机
            const fronts = getFronts(validTargets);
            if (fronts.length === 0) return { target: null, phantomLog: null };
            target = fronts[rand(0, fronts.length - 1)];
        } else {
            // 远程：全场随机
            target = validTargets[rand(0, validTargets.length - 1)];
        }
    }

    // ---------- 第三步：感知校验 ----------
    if (!target || !target.alive || target._untargetable) {
        // 校验失败，尝试回退
        const fallback = validTargets.filter(c => c.alive && !c._untargetable);
        if (fallback.length === 0) return { target: null, phantomLog: null };
        target = fallback[rand(0, fallback.length - 1)];
    }

    // 成昆攻击前清除旧伪装（恢复真身）——临时保留，后续迁移至成昆组件
    if (unit.name === '成昆' && unit._phantomTarget) {
        delete unit._phantomTarget;
    }

    return { target, phantomLog };
}

// ==================== 步骤2：未命中+闪避判定 ====================
export function resolveAttackHit(unit, target, attackerBuffStats, defenderBuffStats, log, A, B, doubleStrikeUnitUid, eventBus) {
    let missChance = 0;
    if (unit.role === '远程') { missChance = 3; }
    else if (unit.role === '飞行') { missChance = 6; }
    else { missChance = 1; }

    if (missChance > 0 && rand(1,100) <= missChance) {
        let mg = {type:'attack-group', uidA:unit.uid, uidD:target.uid, entries:[], isMiss:true, _fxSnapshot:makeFXSnapshot(unit,target), waveTaunt:null, waveUnit:null, buffEffects: [], needsSeparator: true};
        mg.entries.push({type:'combat-text', text:`<span class="${unit.camp==='ally'?'blue':'orange'}">${unit.camp==='ally'?'明教':'六大派'} ${unit.name}</span> 的攻击`});
        mg.entries.push({type:'info', text:`<span class="gray">未命中！</span>`});
        unit._acted = true;
        mg._events = GlobalStore.flushBattleEvents();
        log.push(mg);

        // 发射 afterMiss 信号，让监听器有机会设置重试
        if (eventBus) {
            let data = { unit, target, log, retry: false, retryTargetUid: null };
            eventBus.emit('afterMiss', data);
            if (data.retry) {
                return { skipped: true, retry: true, lockedTargetUid: data.retryTargetUid };
            }
        }

        return { skipped: true, retry: false, lockedTargetUid: null };
    }

    const allyBuffs = (target.camp === 'ally' && A ? A._activeBuffs : (target.camp === 'enemy' && B ? B._activeBuffs : []));
    if (target._stunned) return { skipped: false, retry: false, lockedTargetUid: null };
    const hasCloudBody = hasBuff(allyBuffs, 'cloudBody') || ((target.isXiaoZhaoSister || target.isXiaoZhaoBrother) && target._permanentBuffs && target._permanentBuffs.some(b => b.key === 'cloudBody'));
    if (target.alive && (target.isWei || hasCloudBody || !target._acted)) {
        // 汇总闪避率：遍历规则注册表，累加每个规则返回的闪避值
        let totalDodge = 0;
        for (const ruleFn of _dodgeRules) {
            totalDodge += ruleFn(target, unit) || 0;
        }
        // Buff 闪避加成
        let buffDodge = defenderBuffStats.dodgeBonus || 0;
        totalDodge += buffDodge;
        if (totalDodge > 0) {
            if (rand(1,100) <= totalDodge * 100) {
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
                let dg = {type:'attack-group', uidA:target.uid, uidD:unit.uid, entries:[], isDodge:true, hpAfter:unit.hp, alive:unit.alive, _fxSnapshot:makeFXSnapshot(target,unit), waveTaunt:null, waveUnit:null, buffEffects:[], _atkBonus:0, _defBonus:0, needsSeparator: true};
                if (target.isWei) {
                    const lostPctWei = (target.maxHp - target.hp) / target.maxHp;
                    const leechRateWei = 0.20 + (0.50 - 0.20) * lostPctWei;
                    let heal = Math.floor(reboundDmg * leechRateWei);
                    let wasFullHp = (target.hp >= target.maxHp);
                    let newMaxHp = Math.min(target.maxHp + heal, target._baseMaxHp * 2);
                    target.maxHp = newMaxHp;
                    target.hp = Math.min(target.hp + heal, target.maxHp);
                    if (wasFullHp) { target.hp = target.maxHp; }
                    target.healDone += heal;
                    target.leechDone += heal;
                    emitEvent(target, 'hp-change', { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: target.def });
                    dg.entries.push({type:'info', text:`<span class="green">🦇 青翼蝠王·闪避反击吸血+${heal}，上限→${Math.floor(target.maxHp)}</span>`, isHealEntry:true, healAmount:heal, healUnitUid:target.uid});
                }
                dg.entries.push({type:'combat-text', text:`<span class="${unit.camp==='ally'?'blue':'orange'}">${unit.camp==='ally'?'明教':'六大派'} ${unit.name}</span>(攻${Math.floor(unit.atk)} 血${unitHpBeforeRebound}) → <span class="${target.camp==='ally'?'blue':'orange'}">${target.camp==='ally'?'明教':'六大派'} ${target.name}</span>(防${Math.floor(target.def)} 血${Math.floor(target.hp)})`});
                dg.entries.push({type:'info', text:`<span class="gray">🦅 ${target.name}闪避了攻击！</span>`});
                dg.entries.push({type:'damage-text', text:`<span class="red">🦅 ${target.name}反击 → ${unit.name} 造成 ${reboundDmg} 真实伤害（${unitHpBeforeRebound} → ${Math.floor(unit.hp)}）</span>`});
                if (unit.hp <= 0) { unit.alive = false; unit._isDead = true; dg.isDead = true; dg.alive = false; dg.hpAfter = 0; dg.entries.push({type:'info', text:`${unit.name}被反击击杀！`}); }
                dg._events = GlobalStore.flushBattleEvents();
                log.push(dg);
                unit._acted = true;
                unit._stunned = true;
                emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _stunned: true });
                dg.entries.push({type:'info', text:`<span class="gray">😵 ${unit.name} 被反击眩晕，本回合无法行动！</span>`});
                return { skipped: true, retry: false, lockedTargetUid: null };
            }
        }
    }
    return { skipped: false, retry: false, lockedTargetUid: null };
}

// ==================== 步骤3：伤害计算 ====================
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
            defReduced = reduce;
            if (reduce > 0) {
                unit._pendingDefReduceEntry = {type:'detail', text:`<span class="purple small">🗡️ ${unit.name} 破防：${target.name} 防御 -${reduce}</span>`};
                emitEvent(target, 'hp-change', { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: defBase, _isDead: target._isDead || false });
            }
        } else if (decl.type === 'ignoreDef') {
            ignoreDefRatio = Math.max(ignoreDefRatio, decl.value || 0);
        } else if (decl.type === 'bonusDmg') {
            bonusDmgTotal += decl.value || 0;
        } else if (decl.type === 'dmgMultiplier') {
            dmgMultiplier *= decl.value || 1;
        }
    }

    if (ignoreDefRatio > 0) {
        defBase = Math.floor(defBase * (1 - ignoreDefRatio));
    }

    // ---------- 第三步：基础伤害计算 ----------
    let atkBase = Math.floor(unit.atk);
    let atkVar = rand(1, C.ATK_VAR), defVar = rand(1, C.DEF_VAR), hpBonus = rand(C.HP_BONUS_MIN + 1, C.HP_BONUS_MAX);
    let atkAct = atkBase + atkVar, defAct = defBase + defVar;
    let hpBefore = Math.floor(target.hp);
    target.hp += hpBonus;
    let waveTaunt = null, waveUnit = null;
    if (atkVar === C.ATK_VAR) { waveTaunt = getRandomTaunt(unit); waveUnit = unit; unit.critCount++; }
    else if (defVar + hpBonus >= 7) { waveTaunt = DT[rand(0, DT.length - 1)]; waveUnit = target; }
    if (unit.isZhang && !unit.rangedForm && unit.nearAtkCount < 3) {
        let zt = getZhangNearTaunt(unit.nearAtkCount + 1);
        if (zt && !waveTaunt) { waveTaunt = zt; waveUnit = unit; }
    }
    let raw, rawFormula;
    if (unit.role === '防战') {
        let displayDef = Math.floor(unit.def);
        let lv = getFangLevel(displayDef, unit.m), k = C.FANG_K[lv + 1] !== undefined ? C.FANG_K[lv + 1] : C.FANG_K[C.FANG_K.length - 1];
        let penPart = calcDamage(atkAct, defAct);
        raw = penPart + displayDef * k + unit.maxHp * C.HP_DMG_RATIO;
        rawFormula = `${Math.floor(penPart)} + ${Math.floor(displayDef)}×${k} + ${Math.floor(unit.maxHp)}×${C.HP_DMG_RATIO} = ${Math.floor(raw)}`;
    } else {
        raw = calcDamage(atkAct, defAct);
        rawFormula = `${atkAct}×(${atkAct}/(${atkAct}+${defAct})) = ${Math.floor(raw)}`;
    }

    // ---------- 第四步：声明增伤结算 ----------
    raw += bonusDmgTotal;
    if (bonusDmgTotal > 0) {
        rawFormula += ` + 额外伤害${bonusDmgTotal}`;
    }
    raw *= dmgMultiplier;
    if (dmgMultiplier !== 1) {
        rawFormula += `×${dmgMultiplier}`;
    }

    let dmg = Math.floor(raw);
    let bonusEntries = [];
    if (unit.camp !== 'ally') {
        const modifierResult = applyDamageModifiers(unit, target, dmg, enemySide, allySide, log);
        dmg = modifierResult.modifiedDmg;
        bonusEntries = modifierResult.entries || [];
        const originalDmg = Math.floor(raw);
        if (dmg !== originalDmg) {
            rawFormula += `-30%=${Math.floor(dmg)}`;
        }
    }

    return { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, raw, rawFormula, thunderBonus: 0, hornDmgMultiplier: 1, hornDefIgnore: 0, trueDmg: 0, dmg, bonusEntries, defReduced, defReduction: null };
}

// ==================== 步骤4：应用伤害结果 ====================
export function applyAttackResult(unit, target, dmgCalc, attackerBuffStats, defenderBuffStats, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid) {
    let { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, raw, rawFormula, thunderBonus, hornDmgMultiplier, trueDmg, dmg, bonusEntries, defReduction } = dmgCalc;

    let hpAfter = Math.floor(target.hp) - dmg;
    let dead = hpAfter <= 0;
    target.hp = Math.max(0, hpAfter);
    if (dead) {
        target._pendingDeath = true;
        if (!target._deathTime) target._deathTime = Date.now();
    }

    // 战士斩杀 — 已由 registerBloodthirst 通过 afterDamageApplied 声明提交并执行
    unit.dmgDealt += dmg; target.dmgTaken += dmg;
    if (dead && target.camp === 'enemy' && unit.camp === 'ally' && !target._tokenDropped) {
        const stage = GlobalStore.get('currentStage') || 1;
        const dropRate = [0, 1.5, 2, 2.5, 4, 5.5, 6][stage] / 100;
        if (Math.random() < dropRate) {
            target._tokenDropped = true;
            const currentToken = GlobalStore.get('holyToken') || 0;
            GlobalStore.set('holyToken', currentToken + 1);
            localStorage.setItem('ming_holy_token_5v5_test', String(currentToken + 1));
            window.GlobalStore.pushBattleEvent({ unitUid: unit.uid, eventType: 'info', payload: { text: `🔥 圣火令掉落！${unit.name} 击杀 ${target.name}，获得1枚圣火令！当前总数：${currentToken + 1}`, fastEntry: true } });
            log.push({type:'info', text:`<span class="gold">🔥 圣火令掉落！${unit.name} 击杀 ${target.name}，获得1枚圣火令！当前总数：${currentToken + 1}</span>`, fastEntry: true, unitUid: unit.uid});
        }
    }
    if (dead && target.camp === 'enemy' && unit.camp === 'ally' && !target._chestDropped) {
        const stage = GlobalStore.get('currentStage') || 1;
        const chestKillRate = 0.2 / 100;
        if (Math.random() < chestKillRate) {
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
    const xiaoHEnhance = getXiaoZhaoHexEnhance(A, A._activeBuffs, 'horseFormation');
    if (target.isHorse && dmg > 0 && xiaoHEnhance && hasBuff(A._activeBuffs, 'horseFormation')) {
        const rebound = xiaoHEnhance.reboundDmg;
        unit.hp = Math.max(0, unit.hp - rebound);
        unit.dmgTaken += rebound;
        emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def });
        horseReboundEntry = {type:'info', text:`<span class="red">🐴 巨马反伤：${unit.name} 受到 5 点反伤</span>`};
    }

    // 防战坚盾已迁移至事件总线监听器
    emitEvent(target, 'hp-change', { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: target.def, _isDead: target._isDead || false });

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

    // 执行死亡
    for (const u of pending) {
        u.hp = 0;
        u.alive = false;
        u._isDead = true;
        u._pendingDeath = false;
        emitEvent(u, 'hp-change', { hp: 0, maxHp: u.maxHp, alive: false, atk: u.atk, def: u.def, _isDead: true });
        emitEvent(u, 'unit-remove', { uid: u.uid });
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
// 裁判统一执行攻击后附加效果。裁决顺序：吸血 → 回血 → 溅射波及 → 其他
export function resolveAfterDamageEffects(declarations, unit, target, group, log) {
    if (!declarations || declarations.length === 0) return;

    // 按类型分组
    const bonusDmgDecls = declarations.filter(d => d.type === 'bonusDmg');
    const leechDecls = declarations.filter(d => d.type === 'leech');
    const healDecls = declarations.filter(d => d.type === 'heal');
    const splashDecls = declarations.filter(d => d.type === 'splash');
    const otherDecls = declarations.filter(d => !['bonusDmg', 'leech', 'heal', 'splash'].includes(d.type));

    // 0. 对主目标的额外伤害（如流星赶月）
    for (const decl of bonusDmgDecls) {
        if (!decl.target || !decl.target.alive) continue;
        decl.target.hp = Math.max(0, decl.target.hp - (decl.value || 0));
        unit.dmgDealt = (unit.dmgDealt || 0) + (decl.value || 0);
        decl.target.dmgTaken = (decl.target.dmgTaken || 0) + (decl.value || 0);
        if (decl.target.hp <= 0) { decl.target._pendingDeath = true; if (!decl.target._deathTime) decl.target._deathTime = Date.now(); }
        emitEvent(decl.target, 'hp-change', { hp: decl.target.hp, maxHp: decl.target.maxHp, alive: decl.target.alive, atk: decl.target.atk, def: decl.target.def });
        if (group && group.entries) {
            group.entries.push({ type: 'info', text: decl.logText || '' });
        }
    }

    // 1. 吸血
    for (const decl of leechDecls) {
        if (!decl.source || !decl.source.alive) continue;
        decl.source.hp = Math.min(decl.source.maxHp, decl.source.hp + (decl.value || 0));
        decl.source.healDone = (decl.source.healDone || 0) + (decl.value || 0);
        decl.source.leechDone = (decl.source.leechDone || 0) + (decl.value || 0);
        emitEvent(decl.source, 'hp-change', { hp: decl.source.hp, maxHp: decl.source.maxHp, alive: decl.source.alive, atk: decl.source.atk, def: decl.source.def });
        if (group && group.entries) {
            group.entries.push({ type: 'info', text: decl.logText || '', isHealEntry: true, healAmount: decl.value || 0, healUnitUid: decl.source.uid });
        }
    }

    // 2. 回血
    for (const decl of healDecls) {
        if (!decl.source || !decl.source.alive) continue;
        decl.source.hp = Math.min(decl.source.maxHp, decl.source.hp + (decl.value || 0));
        decl.source.healDone = (decl.source.healDone || 0) + (decl.value || 0);
        emitEvent(decl.source, 'hp-change', { hp: decl.source.hp, maxHp: decl.source.maxHp, alive: decl.source.alive, atk: decl.source.atk, def: decl.source.def });
        if (group && group.entries) {
            group.entries.push({ type: 'info', text: decl.logText || '', isHealEntry: true, healAmount: decl.value || 0, healUnitUid: decl.source.uid });
        }
    }

    // 3. 溅射波及
    for (const decl of splashDecls) {
        if (!decl.targets || decl.targets.length === 0) continue;
        const splashDmg = decl.value || 0;
        for (const st of decl.targets) {
            if (!st.alive) continue;
            st.hp = Math.max(0, st.hp - splashDmg);
            unit.dmgDealt = (unit.dmgDealt || 0) + splashDmg;
            st.dmgTaken = (st.dmgTaken || 0) + splashDmg;
            if (st.hp <= 0) { st._pendingDeath = true; if (!st._deathTime) st._deathTime = Date.now(); }
            emitEvent(st, 'hp-change', { hp: st.hp, maxHp: st.maxHp, alive: st.alive, atk: st.atk, def: st.def });
        }
        if (group && group.entries) {
            group.entries.push({ type: 'info', text: decl.logText || '' });
        }
    }

    // 3.5 反弹（排在溅射之后、其他之前）
    const reboundDecls = declarations.filter(d => d.type === 'rebound');
    for (const decl of reboundDecls) {
        if (!decl.target || !decl.target.alive) continue;
        decl.target.hp = Math.max(0, decl.target.hp - (decl.value || 0));
        decl.target.dmgTaken = (decl.target.dmgTaken || 0) + (decl.value || 0);
        if (decl.source) decl.source.reboundDone = (decl.source.reboundDone || 0) + (decl.value || 0);
        if (decl.target.hp <= 0) { decl.target._pendingDeath = true; if (!decl.target._deathTime) decl.target._deathTime = Date.now(); }
        emitEvent(decl.target, 'hp-change', { hp: decl.target.hp, maxHp: decl.target.maxHp, alive: decl.target.alive, atk: decl.target.atk, def: decl.target.def });
        if (decl.hasSister && decl.source && decl.source.alive) {
            decl.source.hp = Math.min(decl.source.maxHp, decl.source.hp + (decl.value || 0));
            decl.source.healDone = (decl.source.healDone || 0) + (decl.value || 0);
            emitEvent(decl.source, 'hp-change', { hp: decl.source.hp, maxHp: decl.source.maxHp, alive: decl.source.alive, atk: decl.source.atk, def: decl.source.def });
        }
        if (group && group.entries && decl.logText) {
            group.entries.push({ type: 'info', text: decl.logText });
        }
    }

    // 4. 其他（预留扩展）
    for (const decl of otherDecls) {
        if (group && group.entries && decl.logText) {
            group.entries.push({ type: 'info', text: decl.logText });
        }
    }
}

// ==================== 步骤5：构建攻击组日志 + 攻击后效果 ====================
export async function buildAttackGroup(unit, target, dmgCalc, dmgResult, attackerBuffStats, defenderBuffStats, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, phantomLog) {
    let { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, rawFormula, thunderBonus, hornDmgMultiplier, hornDefIgnore, trueDmg, defReduction } = dmgCalc;
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
    group.entries.push({type:'detail', text:`<span class="gray small">计算：${rawFormula}</span>`});
    group.entries.push({type:'damage-text', deadFlag:dead, text:`<span class="damage-line ${dead?'brush-red':''} ${ac}">${dead?'💀击杀💀 ':''}${campA} ${unit.name}</span> 造成 <span class="red">${dmg}</span> 伤害，<span class="${dc}">${campD} ${target.name}</span> ${hpBefore} → ${Math.floor(target.hp)} ${dead?'💀阵亡':''}`});
    if (unit._executeLog) {
        unit._executeLog.forEach(e => group.entries.push(e));
        delete unit._executeLog;
    }

    for (const entry of bonusEntries) {
        group.entries.push(entry);
    }

    log.push(group);



    applyPostAttackEffects(unit, target, dmg, atkAct, defAct, reboundEntry, allySide, enemySide, log, A);
    return group;
}

// 辅助函数
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
    if (reboundEntry) { log.push(reboundEntry); }
    let dead = !target.alive;
    if (dead && target.camp === 'ally') { checkZhangSwitch(A, log); }
}

export { calcFinalDamage as calcAttackDamage };

export function isUnitStunned(unit) {
    return !!(unit && unit._stunned);
}