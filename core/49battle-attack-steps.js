// core/49battle-attack-steps.js - 光明顶5v5 攻击步骤拆分模块
// V5.2.1 | ~18000 bytes | 2026-07-18 从47battle-attack拆分processUnitAttack
export const VER = 'core/49battle-attack-steps.js V5.2.1';

import { CONFIG, DEF_TAUNT, HP_TAUNT } from './01config-5v5-test.js';
import { rand, calcDamage, getFangLevel, isMelee, getFronts, isBlocked, getFlyDodgeRate, getRandomTaunt, getZhangNearTaunt, makeFXSnapshot, hasBuff, getUnitCol, getUnitRow } from './03battle-utils.js';
import { checkZhangSwitch } from './50battle-shared.js';
import { computeBuffStats, applyBuffEffectsBeforeAttack, applyBuffEffectsAfterAttack } from './04buff-system.js';
// showDamageFloat 已随张无忌乾坤反弹迁移，47 不再直接使用
import {
    getRebelTarget, getRebelDmgBonus, getRebelTrueDmg,
    checkKuLian, applyXingFenGrant,
    applyDamageModifiers, isXiaoZhaoPermanentActive,
    applyPhantomDisguise, applyXiaoZhaoMindControl, checkXiaoZhaoPermanentDoubleStrike,
    getXiaoZhaoHexEnhance,
    canXingFenTrigger, consumeXingFen
} from '../modules/23elite-skills.js';
import { applyFortifyRebound_Normal, applyFortifyRebound_Sister } from './50buff-effects.js';
import { createChengKunComponent } from '../modules/95elite-chengkun.js';
import { createHeBiWengComponent } from '../modules/93elite-hebiweng.js';
import { createXiaoZhaoSisterComponent } from '../modules/92elite-xiaozhao-sister.js';
const C = CONFIG, DT = DEF_TAUNT, HT = HP_TAUNT;

function emitEvent(unit, eventType, payload) {
    if (typeof window._emitEvent === 'function') window._emitEvent(unit, eventType, payload);
}

// ==================== 步骤1：选择攻击目标 ====================
export function selectAttackTarget(unit, enemySide, allySide) {
    let targets = enemySide.filter(c => c.alive && c._flyMode !== 'butterfly' && c._flyMode !== 'spider' && !c._spiderFlying);
    if (targets.length === 0) return { target: null, phantomLog: null };

    let target = null;
    const rebelTarget = getRebelTarget(unit, enemySide);
    if (rebelTarget) {
        target = rebelTarget;
    } else if (unit.isWei) {
        target = targets.reduce((a,b) => a.hp < b.hp ? a : b);
        if (!target) target = targets[rand(0, targets.length - 1)];
    } else if (unit.role === '飞行') {
        const lowHpTargets = targets.filter(u => u.hp / u.maxHp < 0.4);
        if (lowHpTargets.length > 0) {
            target = lowHpTargets[rand(0, lowHpTargets.length - 1)];
        } else {
            let fronts = getFronts(targets);
            if (fronts.length > 0) {
                target = fronts[rand(0, fronts.length - 1)];
            } else {
                target = targets[rand(0, targets.length - 1)];
            }
        }
    } else if (isMelee(unit.role) || unit.isHorse) {
        let fronts = getFronts(targets);
        if (fronts.length === 0) return { target: null, phantomLog: null };
        target = fronts[rand(0, fronts.length - 1)];
    } else {
        target = targets[rand(0, targets.length - 1)];
    }

    // 成昆幻影伪装
    let phantomLog = null;
    if (unit.camp === 'ally' && target) {
        // 被模仿者未行动：识破伪装，强制锁定成昆
        const chengkun = enemySide.find(u => u.name === '成昆' && u.alive && u._phantomTarget === unit.uid);
        if (chengkun && !unit._acted) {
            return { target: chengkun, phantomLog: `🎭 ${unit.name} 识破伪装，锁定真正的成昆！` };
        }
        const phantomResult = applyPhantomDisguise(unit, enemySide, allySide);
        if (phantomResult && phantomResult.target) {
            phantomLog = phantomResult.log;
            target = phantomResult.target;
        }
    }

    // 小昭永久惑人心智
    if (target && unit.camp === 'enemy') {
        const mindResult = applyXiaoZhaoMindControl(unit, allySide, enemySide);
        if (mindResult) {
            phantomLog = mindResult.log;
            target = mindResult.target;
        }
    }

    return { target, phantomLog };
}

// ==================== 步骤2：未命中+闪避判定 ====================
export function resolveAttackHit(unit, target, attackerBuffStats, defenderBuffStats, log, A, B, doubleStrikeUnitUid) {
    // 未命中判定
    let missChance = 0;
    if (unit.role === '远程') { missChance = 3; }
    else if (unit.role === '飞行') { missChance = 6; }
    else { missChance = 1; }

    if (missChance > 0 && rand(1,100) <= missChance) {
        let mg = {type:'attack-group', uidA:unit.uid, uidD:target.uid, entries:[], isMiss:true, _fxSnapshot:makeFXSnapshot(unit,target), waveTaunt:null, waveUnit:null, buffEffects: []};
        mg.entries.push({type:'combat-text', text:`<span class="${unit.camp==='ally'?'blue':'orange'}">${unit.camp==='ally'?'明教':'六大派'} ${unit.name}</span> 的攻击`});
        mg.entries.push({type:'info', text:`<span class="gray">未命中！</span>`});
        unit._acted = true;
        mg._events = [...window._battleEvents];
        window._battleEvents = [];
        if (window.GlobalStore) window.GlobalStore.flushBattleEvents();
        log.push(mg);

        // 未命中后的连击/性奋判定
        if (doubleStrikeUnitUid && unit.uid === doubleStrikeUnitUid && unit.alive && unit.camp === 'ally' && !unit._doubleStriked) {
            const xiaoDoubleEnhance = getXiaoZhaoHexEnhance(unit.camp === 'ally' ? A : B, unit.camp === 'ally' ? A._activeBuffs : B._activeBuffs, 'doubleStrike');
            const missChainChance = xiaoDoubleEnhance ? 1.0 : 0.8;
            if (Math.random() < missChainChance) {
                log.push({type:'info', text:`<span class="gold">⚡ 概率连击触发！</span>`, isDoubleStrikeBanner:true});
                unit._doubleStriked = true; unit._acted = false;
                return { skipped: true, retry: true, lockedTargetUid: (target && target.alive) ? target.uid : null };
            }
        }
        if (canXingFenTrigger(unit) && B.some(u => u.alive)) {
            consumeXingFen(unit);
            log.push({type:'info', text:`<span class="gold">💗 性奋：${unit.name} 获得额外攻击机会！</span>`});
            return { skipped: true, retry: true, lockedTargetUid: null };
        }
        return { skipped: true, retry: false, lockedTargetUid: null };
    }

    // 闪避判定
    const allyBuffs = (target.camp === 'ally' && A ? A._activeBuffs : (target.camp === 'enemy' && B ? B._activeBuffs : []));
    if (target._stunned) return { skipped: false, retry: false, lockedTargetUid: null };
    const hasCloudBody = hasBuff(allyBuffs, 'cloudBody') || (target.isXiaoZhao && target._permanentBuffs && target._permanentBuffs.some(b => b.key === 'cloudBody'));
    if (target.alive && (target.isWei || hasCloudBody || !target._acted)) {
        let baseDodge = getFlyDodgeRate(target, unit);
        let buffDodge = defenderBuffStats.dodgeBonus || 0;
        if (baseDodge + buffDodge > 0) {
            let bloodDodge = 0;
            if (target.isWei) {
                const lostPct = (target.maxHp - target.hp) / target.maxHp;
                const maxRatio = (CONFIG.ELITE_SKILLS.weiBloodDodge && CONFIG.ELITE_SKILLS.weiBloodDodge.maxRatio) ? CONFIG.ELITE_SKILLS.weiBloodDodge.maxRatio : 0;
                bloodDodge = lostPct * maxRatio;
            }
            let finalHit = (1 - baseDodge) * (1 - buffDodge) * (1 - bloodDodge);
            let totalDodge = 1 - finalHit;
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
                if (window.GlobalStore) window.GlobalStore.flushBattleEvents();
                log.push(dg);
                unit._acted = true;
                unit._stunned = true;
                emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _stunned: true });
                dg.entries.push({type:'info', text:`<span class="gray">😵${unit.name} 被反击眩晕，本回合无法行动！</span>`});
                return { skipped: true, retry: false, lockedTargetUid: null };
            }
        }
    }
    return { skipped: false, retry: false, lockedTargetUid: null };
}

// ==================== 步骤3：伤害计算 ====================
export function calcFinalDamage(unit, target, attackerBuffStats, defenderBuffStats, allySide, enemySide, log) {
    // 战士破防
    let defReduced = 0;
    if (unit.role === '战士' && target.def > 0) {
        defReduced = Math.min(2, target.def);
        target.def = Math.max(0, target.def - 2);
        target._baseDef = Math.max(0, (target._baseDef || target.def) - 2);
        emitEvent(target, 'hp-change', { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: target.def, _isDead: target._isDead || false });
        unit._pendingDefReduceEntry = {type:'detail', text:`<span class="purple small">🗡️ ${unit.name} 破防：${target.name} 防御 -${defReduced}</span>`};
    }

    let atkBase = Math.floor(unit.atk);
    let defBase = Math.floor(target.def);
    // 精英组件变量提前声明
    let hornDefIgnore = 0;
    let hornDmgMultiplier = 1;
    let hornDefBefore = null;
    let hornDefAfter = null;
    // 鹤笔翁鹿角杖法防御忽略 → 组件模式
    if (hornDefIgnore > 0) {
        let defBefore = defBase;
        defBase = Math.floor(defBase * (1 - hornDefIgnore));
        hornDefBefore = defBefore;
        hornDefAfter = defBase;
    }
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
    // 成昆混元霹雳劲 + 鹤笔翁鹿角杖法 → 组件模式
    let thunderBonus = 0;
    const chengkunComp = createChengKunComponent();
    const ckBonus = chengkunComp.onDamageCalc(unit, target, raw);
    thunderBonus = ckBonus;
    if (thunderBonus > 0) rawFormula += ` + 混元霹雳劲${thunderBonus}`;
        if (thunderBonus > 0) rawFormula += ` + 混元霹雳劲${thunderBonus}`;

    if (unit.camp !== 'ally') {
        const hebiwengComp = createHeBiWengComponent();
        const hbResult = hebiwengComp.onDamageCalc(unit, target, raw);
        if (hbResult && hbResult.defIgnore) {
            hornDefIgnore = hbResult.defIgnore;
            hornDmgMultiplier = hbResult.dmgMultiplier || 1;
        }
    }
    raw += thunderBonus;
    const rebelBonus = getRebelDmgBonus(unit);
    const trueDmg = getRebelTrueDmg(unit, target);
    if (rebelBonus > 0) {
        raw = raw * (1 + rebelBonus) + trueDmg;
        rawFormula = `(${rawFormula})×1.30 + 叛逆真伤${trueDmg} = ${Math.floor(raw)}`;
    } else if (trueDmg > 0) {
        raw += trueDmg;
        rawFormula = `${rawFormula} + 叛逆真伤${trueDmg} = ${Math.floor(raw)}`;
    }
    if (hornDmgMultiplier > 1) {
        const beforeHorn = Math.floor(raw);
        raw *= hornDmgMultiplier;
        rawFormula += `×${hornDmgMultiplier}=${Math.floor(raw)}`;
    }

    // 伤害修正钩子
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

    return { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, raw, rawFormula, thunderBonus, hornDmgMultiplier, hornDefIgnore, trueDmg, dmg, bonusEntries, defReduced, defReduction: hornDefBefore ? `${hornDefBefore}→${hornDefAfter}` : null };
}

// ==================== 步骤4：应用伤害结果 ====================
export function applyAttackResult(unit, target, dmgCalc, attackerBuffStats, defenderBuffStats, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid) {
    let { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, raw, rawFormula, thunderBonus, hornDmgMultiplier, hornDefIgnore, trueDmg, dmg, bonusEntries, defReduction } = dmgCalc;

    let hpAfter = Math.floor(target.hp) - dmg;
    let dead = hpAfter <= 0;
    if (dead) {
        target.hp = 0;
        target.alive = false;
        target._isDead = true;
        if (!target._deathTime) target._deathTime = Date.now();
    } else { target.hp = hpAfter; }

    // 战士斩杀
    const executeThreshold = hasBuff(A._activeBuffs, 'bloodthirst') ? 0.20 : 0.15;
    if (unit.role === '战士' && target.alive && target.hp > 0 && target.hp <= target.maxHp * executeThreshold) {
        target.hp = 0;
        target.alive = false;
        target._isDead = true;
        if (!target._deathTime) target._deathTime = Date.now();
        dead = true;
        if (!unit._executeLog) unit._executeLog = [];
        unit._executeLog.push({type:'info', text:`<span class="red">⚔️ 战士斩杀！${unit.name} 直接击杀 ${target.name}！</span>`});
    }
    unit.dmgDealt += dmg; target.dmgTaken += dmg;
    if (dead && target.camp === 'enemy' && unit.camp === 'ally' && !target._tokenDropped) {
        const stage = GlobalStore.get('currentStage') || 1;
        const dropRate = [0, 1.5, 2, 2.5, 4, 5.5, 6][stage] / 100;
        if (Math.random() < dropRate) {
            target._tokenDropped = true;
            const currentToken = GlobalStore.get('holyToken') || 0;
            GlobalStore.set('holyToken', currentToken + 1);
            localStorage.setItem('ming_holy_token_5v5_test', String(currentToken + 1));
            window._battleEvents.push({ unitUid: unit.uid, eventType: 'info', payload: { text: `🔥 圣火令掉落！${unit.name} 击杀 ${target.name}，获得1枚圣火令！当前总数：${currentToken + 1}`, fastEntry: true } });
            log.push({type:'info', text:`<span class="gold">🔥 圣火令掉落！${unit.name} 击杀 ${target.name}，获得1枚圣火令！当前总数：${currentToken + 1}</span>`, fastEntry: true, unitUid: unit.uid});
        }
    }
    // 宝箱击杀掉落
    if (dead && target.camp === 'enemy' && unit.camp === 'ally' && !target._chestDropped) {
        const stage = GlobalStore.get('currentStage') || 1;
        const chestKillRate = 0.2 / 100;
        if (Math.random() < chestKillRate) {
            target._chestDropped = true;
            let chests = parseInt(localStorage.getItem('ming_chest_count') || '0');
            chests++;
            localStorage.setItem('ming_chest_count', String(chests));
            GlobalStore.set('chestCount', chests);
            window._battleEvents.push({ unitUid: unit.uid, eventType: 'info', payload: { text: `🎁 宝箱掉落！${unit.name} 击杀 ${target.name}，获得1个宝箱！当前总数：${chests}`, fastEntry: true } });
        }
    }

    // 成昆幻影伪装已迁移至 modules/95elite-chengkun.js 组件

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

    // 防战坚盾
    if (target.role === '防战' && dmg > 0) {
        if (!target._fortifyStacks) target._fortifyStacks = 0;
        if (target._fortifyStacks < 6) {
            const increment = target.name === '成昆' ? 1 : 0.5;
            target._fortifyStacks = Math.min(6, target._fortifyStacks + increment);
            target.def += increment;
        }
    }
    emitEvent(target, 'hp-change', { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: target.def, _isDead: target._isDead || false });

    // 小昭姐乾坤衍生
    if (target.camp === 'ally') {
        const sisterComp = createXiaoZhaoSisterComponent();
        sisterComp.onAllyDamaged(target, dmg, A, null);
    }

    // 严阵以待反弹
    let reboundEntry = null;
    let allyBuffs_fortify = (target.camp === 'ally' ? A._activeBuffs : B._activeBuffs) || [];
    if (hasBuff(allyBuffs_fortify, 'fortify') && target.role === '防战' && dmg > 0) {
        const hasSister = A && A.some(u => u.isXiaoZhaoSister && u.alive);
        let entry;
        if (hasSister) {
            entry = applyFortifyRebound_Sister(unit, target, atkAct, defAct, A, B, log);
        } else {
            entry = applyFortifyRebound_Normal(unit, target, atkAct, defAct, A, B, log);
        }
        if (entry) reboundEntry = entry;
    }

    return { dmg, dead, horseReboundEntry, reboundEntry, bonusEntries, hpBefore, defReduction, waveTaunt, waveUnit, rawFormula, thunderBonus, hornDmgMultiplier, trueDmg, atkAct, defAct, hpBonus };
}

// ==================== 步骤5：构建攻击组日志 + 攻击后效果 ====================
export function buildAttackGroup(unit, target, dmgCalc, dmgResult, attackerBuffStats, defenderBuffStats, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, phantomLog) {
    let { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, rawFormula, thunderBonus, hornDmgMultiplier, hornDefIgnore, trueDmg, defReduction } = dmgCalc;
    let { dmg, dead, horseReboundEntry, reboundEntry, bonusEntries } = dmgResult;

    let hpPctBefore = Math.floor((hpBefore / target.maxHp) * 100), hpPctAfter = Math.floor((target.hp / target.maxHp) * 100);
    let campA = unit.camp === 'ally' ? '明教' : '六大派', campD = target.camp === 'ally' ? '明教' : '六大派';
    let ac = unit.camp === 'ally' ? 'blue' : 'orange', dc = target.camp === 'ally' ? 'blue' : 'orange';
    let displayAtk = Math.floor(unit.atk + unit.atk * attackerBuffStats.atkBonus);
    let displayDef = Math.floor(target.def + target.def * defenderBuffStats.defBonus);
    let unitHpBefore = Math.floor(unit.hp);
    let group = { type:'attack-group', uidA:unit.uid, uidD:target.uid, entries:[], hpAfter:target.hp, alive:target.alive, isDead:dead, waveTaunt, waveUnit, unitRole:unit.role, _fxSnapshot:makeFXSnapshot(unit,target), _dmg:dmg, _isZhangNear:unit.isZhang && !unit.rangedForm, _nearAtkCount:unit.nearAtkCount, hpPctBefore, hpPctAfter, isMiss:false, isDodge:false, buffEffects:[], _atkBonus:Math.floor(unit.atk * attackerBuffStats.atkBonus), _defBonus:Math.floor(target.def * defenderBuffStats.defBonus), isKuLianAttack: !!(unit.name === '宋青书' && unit._kuLianActive) };

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
    if (hornDefIgnore > 0) {
        if (hornDmgMultiplier > 1) {
            group.entries.push({type:'info', text:`<span class="gold">🦌 目标已中毒（玄冥神掌），鹤笔翁 鹿角杖法伤害+50%！</span>`});
        }
    }
    if (trueDmg > 0) group.entries.push({type:'detail', text:`<span class="red small">⚔️ 叛逆真伤+${trueDmg}（目标当前生命${Math.round((C.ELITE_SKILLS?.rebelStrike?.currentHpRatio || 0.12) * 100)}%）</span>`});
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
    if (window.GlobalStore) window.GlobalStore.flushBattleEvents();
    for (const entry of bonusEntries) {
        group.entries.push(entry);
    }

    log.push(group);

    // 攻击后效果
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
    // 玄冥神掌已迁移至 modules/94elite-luzhangke.js 组件
    if (reboundEntry) { log.push(reboundEntry); }
    let dead = !target.alive;
    if (dead && target.camp === 'ally') { checkZhangSwitch(A, log); }
}

// selectTarget 已移除，所有调用方统一使用 selectAttackTarget
// checkZhangSwitch 已移除，统一使用 core/50battle-shared.js 的导出

export { calcFinalDamage as calcAttackDamage };

// resolveDodge 已整合到 resolveAttackHit，旧兼容导出已移除

export function isUnitStunned(unit) {
    return !!(unit && unit._stunned);
}