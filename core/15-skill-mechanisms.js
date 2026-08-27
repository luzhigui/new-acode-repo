// core/15-skill-mechanisms.js - 光明顶5v5 技能机制解释器
// V5.7.1 | ~14500 bytes| 2026-08-24 苦练血量+3、宋青书自身三倍加成
export const VER = 'core/15-skill-mechanisms.js V5.7.1';

import { EXECUTION_LAYER as L, EFFECT_TYPES } from '../infra/50-event-bus.js';
import { CONFIG } from './01config-5v5-test.js';
import { registerDodgeRule } from './12battle-attack-steps.js';
import { emitEvent, applyStatChange, applyMaxHpChange, getBattleRng } from './13battle-shared.js';
import { checkKuLian, applyXingFenGrant, tickKuaiLeHeal, canXingFenTrigger, consumeXingFen } from '../modules/20elite-skills.js';
import { getEliteState, setEliteState } from './18-elite-state.js';
import { FACT_TYPES } from '../infra/56-battle-enums.js';

// 安装声明式技能：把声明表翻译成 eventBus 监听
export function installDeclaredSkills(eventBus, A, B, log, declarations) {
    for (const decl of declarations) {
        if (!decl || !decl.name) continue;
        installTargetRule(eventBus, A, B, decl);
        installAttributeModifiers(A, B, decl);
        installDodgeRules(decl);
    }
    installBeforeDamageEffects(eventBus, declarations);
    installOnHitEffects(eventBus, A, B, declarations);
    installPhantomDisguise(eventBus, declarations);
    installLinkAttack(eventBus, declarations);
    installChainClaw(eventBus, A, B, declarations);
    installKuLian(eventBus, A, B, declarations);
    installXinHun(eventBus, A, B, declarations);
    installXingFen(eventBus, A, B, declarations);
}

// 新增：从 gameData 读取 mechanics 并转换为 declarations 后安装
// 数据驱动内容管线入口，第三档复杂组件不在 mechanics 中声明，不会经过此路径
export function installFromGameData(eventBus, A, B, log, gameData) {
    if (!gameData || !gameData.characters) return;
    const declarations = [];
    for (const [name, character] of Object.entries(gameData.characters)) {
        if (!character.mechanics || !Array.isArray(character.mechanics)) continue;
        for (const mech of character.mechanics) {
            if (!mech || typeof mech !== 'object') continue;
            declarations.push({
                name,
                ...mech
            });
        }
    }
    installDeclaredSkills(eventBus, A, B, log, declarations);
}

// ==================== 目标选择声明 ====================
function installTargetRule(eventBus, A, B, decl) {
    if (!decl.targetRule) return;
    const rule = decl.targetRule;

    if (rule === 'lowestHp') {
        eventBus.on('beforeSelectTarget', L.BEFORE_SELECT_TARGET.REBEL, (data) => {
            if (data.unit.name !== decl.name) return;
            const sorted = [...data.validTargets].sort((a, b) => a.hp - b.hp);
            if (sorted[0]) data.declaration.targetResult = sorted[0];
        });
    } else if (rule === 'highestHpPct') {
        eventBus.on('beforeSelectTarget', L.BEFORE_SELECT_TARGET.REBEL, (data) => {
            if (data.unit.name !== decl.name) return;
            const target = data.validTargets.reduce((a, b) => (a.hp / a.maxHp) > (b.hp / b.maxHp) ? a : b);
            if (target) data.declaration.targetResult = target;
        });
    }
}

// ==================== 伤害计算前效果声明 ====================
// 所有声明的 beforeDamageEffects 共用一个监听器（同 onHitEffects，避开 EventBus toString 去重）
function installBeforeDamageEffects(eventBus, declarations) {
    const decls = declarations.filter(d => d && d.name && d.beforeDamageEffects && d.beforeDamageEffects.length > 0);
    if (decls.length === 0) return;

    eventBus.on('beforeDamageCalc', L.BEFORE_DAMAGE_CALC.TRUE_DMG, (data) => {
        for (const decl of decls) {
            if (data.unit.name !== decl.name) continue;
            for (const eff of decl.beforeDamageEffects) {
                if (eff.type === 'ignoreDef') {
                    data.declarations.push({ type: EFFECT_TYPES.IGNORE_DEF, value: eff.ratio, source: data.unit });
                } else if (eff.type === 'damageMultiplierIfPoisoned') {
                    if (getEliteState(data.target.uid)._xuanmingPoison && getEliteState(data.target.uid)._xuanmingPoison.remaining > 0) {
                        data.declarations.push({ type: EFFECT_TYPES.DMG_MULTIPLIER, value: 1 + eff.bonus, source: data.unit, label: '鹿角杖法' });
                    }
                } else if (eff.type === 'bonusLostHp') {
                    const lostHp = data.unit.maxHp - data.unit.hp;
                    const bonus = Math.floor(lostHp * eff.ratio);
                    if (bonus > 0) {
                        data.declarations.push({ type: EFFECT_TYPES.BONUS_DMG, value: bonus, source: data.unit, label: eff.label || '额外伤害' });
                    }
                } else if (eff.type === 'bonusTargetCurrentHp') {
                    const trueDmg = Math.floor(data.target.hp * eff.ratio);
                    if (trueDmg > 0) {
                        data.declarations.push({ type: EFFECT_TYPES.BONUS_DMG, value: trueDmg, source: data.unit, label: eff.label || '额外伤害' });
                    }
                }
            }
        }
    });
}

// ==================== 属性修正声明 ====================
function installAttributeModifiers(A, B, decl) {
    if (!decl.attributeMods || decl.attributeMods.length === 0) return;
    const target = decl.camp === 'enemy'
        ? B.find(u => u.name === decl.name && u.alive)
        : A.find(u => u.name === decl.name && u.alive);
    if (!target) return;
    for (const mod of decl.attributeMods) {
        if (mod.type === 'fortifyIncrementMul') {
            target._fortifyIncrement = CONFIG.FORTIFY_INCREMENT * mod.mult;
            target._fortifyCap = CONFIG.FORTIFY_CAP * mod.mult;
        }
    }
}

// ==================== 命中后效果声明 ====================
// 所有声明的 onHitEffects 共用一个监听器（EventBus 按 toString 去重，同模板多闭包会被误杀）
function installOnHitEffects(eventBus, A, B, declarations) {
    const onHitDecls = declarations.filter(d => d && d.name && d.onHitEffects && d.onHitEffects.length > 0);
    if (onHitDecls.length === 0) return;

    eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.LEECH, (data) => {
        const unit = data.unit;
        const target = data.target;
        const dmg = data.dmg;
        if (!unit || !unit.alive || dmg <= 0) return;

        for (const decl of onHitDecls) {
            if (unit.name !== decl.name) continue;
            for (const eff of decl.onHitEffects) {
                if (eff.type === 'leech') {
                    const lostPct = (unit.maxHp - unit.hp) / unit.maxHp;
                    const ratio = eff.minRatio + (eff.maxRatio - eff.minRatio) * lostPct;
                    const heal = Math.floor(dmg * ratio);
                    const newMaxHp = Math.min(unit.maxHp + heal, unit._baseMaxHp * 2);
                    if (!data.declarations) data.declarations = [];
                    data.declarations.push({
                        type: EFFECT_TYPES.LEECH,
                        value: heal,
                        source: unit,
                        maxHp: newMaxHp,
                        factType: FACT_TYPES.WEI_LEECH,
                        factData: { unitName: unit.name, heal, newMaxHp: Math.floor(newMaxHp), unitUid: unit.uid }
                    });
                } else if (eff.type === 'healMaxHpPct') {
                    const heal = Math.min(Math.floor(unit.maxHp * eff.pct), unit.maxHp - unit.hp);
                    if (heal > 0) {
                        if (!data.declarations) data.declarations = [];
                        data.declarations.push({
                            type: EFFECT_TYPES.HEAL,
                            value: heal,
                            source: unit,
                            factType: FACT_TYPES.NINE_YANG_HEAL,
                            factData: { unitName: unit.name, heal, hpBefore: Math.floor(unit.hp), hpAfter: Math.floor(unit.hp + heal), unitUid: unit.uid }
                        });
                    }
                } else if (eff.type === 'poison') {
                    setEliteState(target.uid, { _xuanmingPoison: { remaining: eff.duration, dotPercents: [...eff.dotPercents] } });
                    if (data.log) data.log.push({ factType: FACT_TYPES.XUAN_MING_POISONED, data: { attackerName: unit.name, targetName: target.name, dotPercents: eff.dotPercents } });
                } else if (eff.type === 'bonusLostHp') {
                    const lostHp = unit.maxHp - unit.hp;
                    const bonus = Math.floor(lostHp * eff.ratio);
                    if (bonus > 0) {
                        if (!data.declarations) data.declarations = [];
                        data.declarations.push({
                            type: EFFECT_TYPES.BONUS_DMG,
                            value: bonus,
                            source: unit,
                            label: eff.label || '额外伤害',
                            logText: null
                        });
                    }
                }
            }
        }
    });
}

// ==================== 幻影伪装声明（阶段2a） ====================
function installPhantomDisguise(eventBus, declarations) {
    const decls = declarations.filter(d => d && d.type === 'phantomDisguise');
    if (decls.length === 0) return;

    // afterDamageApplied：设置伪装目标并回血
    eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.DISGUISE, (data) => {
        const unit = data.unit;
        if (!unit || !unit.alive || data.dmg <= 0) return;
        const decl = decls.find(d => d.name === unit.name);
        if (!decl) return;
        const enemyAlive = data.enemySide.filter(u => u.alive && !u.isHorse && !u._untargetable);
        if (enemyAlive.length > 0) {
            setEliteState(unit.uid, { _phantomTarget: enemyAlive[getBattleRng().nextInt(0, enemyAlive.length - 1)].uid });
            const lostHp = unit.maxHp - unit.hp;
            if (lostHp > 0) {
                const aliveCount = data.enemySide.filter(u => u.alive).length;
                const heal = Math.floor(lostHp * (decl.healRatio || 0.06) * aliveCount);
                if (!data.declarations) data.declarations = [];
                data.declarations.push({
                    type: EFFECT_TYPES.HEAL,
                    value: heal,
                    source: unit,
                    factType: FACT_TYPES.PHANTOM_DISGUISE_HEAL,
                    factData: { unitName: unit.name, heal }
                });
            }
            emitEvent(unit, 'hp-change', { hp:unit.hp, maxHp:unit.maxHp, alive:unit.alive, atk:unit.atk, def:unit.def, _phantomTarget:getEliteState(unit.uid)._phantomTarget });
        }
    });

    // beforeSelectTarget：被模仿者攻击时概率混乱
    eventBus.on('beforeSelectTarget', L.BEFORE_SELECT_TARGET.DISGUISE, (data) => {
        if (data.unit.camp !== 'ally') return;
        const { unit, enemySide, declaration, allySide } = data;
        let phantomDecl = null;
        let chengkun = null;
        for (const d of decls) {
            const candidate = enemySide.find(u => u.name === d.name && u.alive && getEliteState(u.uid)._phantomTarget);
            if (candidate) {
                phantomDecl = d;
                chengkun = candidate;
                break;
            }
        }
        if (!phantomDecl || !chengkun) return;

        const isPhantomTarget = getEliteState(chengkun.uid)._phantomTarget === unit.uid;
        if (isPhantomTarget) {
            declaration.targetResult = chengkun;
            declaration.phantomFact = { factType: FACT_TYPES.PHANTOM_REVEAL, data: { unitName: unit.name, deceiver: chengkun.name } };
            return;
        }

        const lostHpPct = (chengkun.maxHp - chengkun.hp) / chengkun.maxHp;
        const confuseChance = (phantomDecl.baseChance || 0.30) + (phantomDecl.per10pctLost || 0.06) * (lostHpPct * 10);
        if (getBattleRng().next() >= confuseChance) return;

        const phantomTarget = allySide.find(u => u.alive && !u.isHorse && !u._untargetable && u.uid === getEliteState(chengkun.uid)._phantomTarget && u.uid !== unit.uid);
        if (phantomTarget) {
            declaration.targetResult = phantomTarget;
            declaration.phantomFact = { factType: FACT_TYPES.PHANTOM_CONFUSE, data: { unitName: unit.name, deceiver: chengkun.name, targetName: phantomTarget.name } };
        }
    });
}

// ==================== 玄冥联动声明（阶段2a） ====================
function installLinkAttack(eventBus, declarations) {
    const decls = declarations.filter(d => d && d.type === 'linkAttack');
    if (decls.length === 0) return;

    eventBus.on('afterAttack', L.AFTER_ATTACK.XUANMING_LINK, (data) => {
        const { unit, target, dmg, allySide, log } = data;
        if (!unit || unit._isLinkAttack || dmg <= 0 || !target || !target.alive) return;
        const decl = decls.find(d => d.name === unit.name);
        if (!decl) return;
        const partnerNames = decl.partnerNames || [];
        for (const partnerName of partnerNames) {
            const partner = allySide.find(u => u.name === partnerName && u.alive && !u._linkTriggered);
            if (!partner) continue;
            partner._linkTriggered = true;
            log.push({ factType: FACT_TYPES.XUAN_MING_LINK_ATTACK, data: { partnerName: partner.name, unitName: unit.name } });
            if (!data.extraRequests) data.extraRequests = [];
            data.extraRequests.push({
                unit: partner,
                targetUid: target.uid,
                reason: 'xuanmingLink',
                actedMode: 'restore',
                actedSnapshot: partner.state._acted,
                priority: 40
            });
            break;
        }
    });
}

// ==================== 九阴白骨爪声明（阶段2b） ====================
function installChainClaw(eventBus, A, B, declarations) {
    const decls = declarations.filter(d => d && d.type === 'chainClaw');
    if (decls.length === 0) return;

    eventBus.on('afterAttack', L.AFTER_ATTACK.CLAW, (data) => {
        const { unit, target, dmg, log, allySide, enemySide } = data;
        const decl = decls.find(d => d.name === unit.name);
        if (!decl || !target || !target.alive) return;
        const rng = getBattleRng();
        const battleState = window.GlobalStore?.get('currentBattleState');
        const zhangAlive = battleState && battleState.ally && battleState.ally.some(u => u.isZhang && u.alive);
        const baseHit = zhangAlive ? (decl.jealous?.baseDmg ?? decl.baseDmg ?? 2) : (decl.baseDmg ?? 1.5);
        const s = zhangAlive ? { ...decl, ...(decl.jealous || {}) } : decl;

        if (!getEliteState(unit.uid)._nineYinFirstDone) {
            setEliteState(unit.uid, { _nineYinFirstDone: true });
        } else {
            if (rng.next() > (s.procChance || 0.80)) return;
        }

        const hits = [];
        let executeInfo = null;
        let totalHeal = 0;
        const song = allySide.find(u => u.name === '宋青书' && u.alive);
        let simulatedTargetHp = target.hp;
        let simulatedSongHp = song ? song.hp : 0;
        let depth = 0;

        while (simulatedTargetHp > 0 && !target._pendingDeath && depth < 100) {
            if (depth > 0 && rng.next() > (s.chainProcChance || 0.80)) break;
            const lostHp = target.maxHp - simulatedTargetHp;
            const ratioDmg = Math.floor((lostHp * (s.lostHpRatio || 0.015) + target.maxHp * (s.maxHpRatio || 0.01)) * 10) / 10;
            const bonusDmg = Math.floor((baseHit + Math.max(0, ratioDmg)) * 10) / 10;
            simulatedTargetHp -= bonusDmg;
            const isDeadByHit = simulatedTargetHp <= 0;
            const hpPctAfter = simulatedTargetHp / target.maxHp;
            const execThreshold = s.executeThreshold || 0.15;
            const isExecute = !isDeadByHit && hpPctAfter <= execThreshold && simulatedTargetHp > 0;
            hits.push({ dmg: bonusDmg, factType: FACT_TYPES.CLAW_HIT, data: { unitName: unit.name, targetName: target.name, dmg: bonusDmg, isExecute, jealous: zhangAlive, depth }, isClawHit: true, clawAttackerUid: unit.uid, clawTargetUid: target.uid, isExecute });
            if (song && song.alive) {
                const healAmount = Math.min(bonusDmg, song.maxHp - simulatedSongHp);
                totalHeal += healAmount;
                simulatedSongHp += healAmount;
            }
            if (isDeadByHit) break;
            if (isExecute) {
                executeInfo = { factType: FACT_TYPES.CLAW_EXECUTE, data: { unitName: unit.name, targetName: target.name, unitUid: unit.uid, targetUid: target.uid }, isClawHit: true, clawAttackerUid: unit.uid, clawTargetUid: target.uid, isExecute: true };
                break;
            }
            depth++;
        }

        if (hits.length > 0 && data && data.declarations) {
            data.declarations.push({
                type: EFFECT_TYPES.CLAW_CHAIN,
                source: unit,
                target: target,
                hits: hits,
                execute: executeInfo
            });
        }
        if (totalHeal > 0 && song && song.alive && data && data.declarations) {
            data.declarations.push({
                type: EFFECT_TYPES.HEAL,
                value: totalHeal,
                source: song,
                factType: FACT_TYPES.CLAW_HEAL,
                factData: { totalHeal }
            });
        } else if (song && song.alive) {
            log.push({ factType: FACT_TYPES.CLAW_NO_HEAL, data: {} });
        }
    });
}

// ==================== 苦练声明（阶段2b） ====================
function installKuLian(eventBus, A, B, declarations) {
    const decls = declarations.filter(d => d && d.type === 'kuLian');
    if (decls.length === 0) return;

    eventBus.on('onRoundStart', L.ROUND_START.KULIAN_BUFF, (data) => {
        const { A, B, log } = data;
        const decl = decls[0]; // 宋青书声明
        if (!decl) return;
        const kuLianSong = checkKuLian(B);
        if (!kuLianSong) return;
        setEliteState(kuLianSong.uid, { _kuLianActive: true });
        const s = {
            atkBonus: decl.atkBonus || 1,
            defBonus: decl.defBonus || 1,
            hpBonus: decl.hpBonus || 3
        };
        B.forEach(u => {
            if (!u.alive || u.isHorse) return;
            const mult = u.uid === kuLianSong.uid ? 3 : 1;
            applyStatChange(u, 'atk', s.atkBonus * mult, null, '苦练');
            applyStatChange(u, 'def', s.defBonus * mult, null, '苦练');
            applyMaxHpChange(u, u.maxHp + s.hpBonus * mult, null, '苦练血上限');
            u._baseAtk = (u._baseAtk || u.atk) + s.atkBonus * mult;
            u._baseDef = (u._baseDef || u.def) + s.defBonus * mult;
            u._baseMaxHp = Math.max(u._baseMaxHp || u.maxHp, u.maxHp);
        });
        log.push({ factType: FACT_TYPES.KU_LIAN_PRIORITY, data: { unitName: kuLianSong.name } });
        log.push({ factType: FACT_TYPES.KU_LIAN, data: { unitName: kuLianSong.name, atkBonus: s.atkBonus, defBonus: s.defBonus, hpBonus: s.hpBonus } });
    });
}

// ==================== 新婚声明（阶段2b） ====================
function installXinHun(eventBus, A, B, declarations) {
    const decls = declarations.filter(d => d && d.type === 'xinHun');
    if (decls.length === 0) return;

    eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.XINGFEN, (data) => {
        const { unit, target, dmg, allySide, log } = data;
        const decl = decls.find(d => d.name === unit.name);
        if (!decl || unit.name !== '宋青书' || !unit.alive) return;
        const zhou = allySide.find(u => u.name === '周芷若' && u.alive);
        if (!zhou) return;
        const hpDeduct = decl.hpDeduct || 1;
        const healLevels = decl.healLevels || [0.16, 0.10, 0.06, 0.03];
        applyStatChange(zhou, 'hp', -hpDeduct, unit, '新婚扣血', false);
        getEliteState(zhou.uid)._kuaiLeStack.push({ healPct: healLevels[0] });
        if (zhou.hp <= 0) { if (!zhou._deathTime) zhou._deathTime = Date.now(); }
        log.push({
            factType: FACT_TYPES.XIN_HUN,
            data: {
                attackerName: unit.name,
                targetName: zhou.name,
                hpDeduct,
                healPct: healLevels[0],
                stackCount: getEliteState(zhou.uid)._kuaiLeStack.length,
                zhouUid: zhou.uid,
                zhouHpAfter: zhou.hp,
                isDead: !!zhou._pendingDeath
            }
        });
        if (zhou._pendingDeath) { log.push({ factType: FACT_TYPES.XIN_HUN_DEATH, data: { unitName: zhou.name, uidD: zhou.uid } }); }
        setEliteState(unit.uid, { _xingFenPenaltyCount: (getEliteState(unit.uid)._xingFenPenaltyCount || 0) + 1 });
        const penalty = getEliteState(unit.uid)._xingFenPenaltyCount + 1;
        if (penalty > 0 && unit.maxHp > 1) {
            const oldMaxHp = unit.maxHp;
            applyMaxHpChange(unit, Math.max(1, unit.maxHp - penalty), null, '性奋代价');
            if (unit.hp <= 0) { if (!unit._deathTime) unit._deathTime = Date.now(); }
            log.push({ factType: FACT_TYPES.XING_FEN_COST, data: { unitName: unit.name, oldMaxHp, newMaxHp: unit.maxHp, penalty } });
        }
    });
}

// ==================== 性奋声明（阶段2b） ====================
function installXingFen(eventBus, A, B, declarations) {
    const decls = declarations.filter(d => d && d.type === 'xingFen');
    if (decls.length === 0) return;

    // 回合开始：周芷若在场时给宋青书性奋状态
    eventBus.on('onRoundStart', L.ROUND_START.XINGFEN_GRANT, (data) => {
        const { A, B, log } = data;
        applyXingFenGrant(B, log);
        tickKuaiLeHeal(A.concat(B), log);
    });

    // 攻击后：性奋额外攻击
    eventBus.on('afterAttack', L.AFTER_ATTACK.XINGFEN_EXTRA, async (data) => {
        const { unit, target, allySide, enemySide, log } = data;
        const decl = decls.find(d => d.name === unit.name);
        if (!decl || unit.name !== '宋青书' || !unit.alive || unit._xingFenExtraAttacking) return;
        if (!canXingFenTrigger(unit)) return;
        consumeXingFen(unit);
        log.push({ factType: FACT_TYPES.XING_FEN_EXTRA_ATTACK, data: { unitName: unit.name } });
        unit._xingFenExtraAttacking = true;
        const { processUnitAttack } = await import('./10battle-attack.js');
        await processUnitAttack(unit, allySide, enemySide, log, data.A, data.B, data.state, null, null);
        unit._xingFenExtraAttacking = false;
    });

    // 未命中后：性奋重试
    eventBus.on('afterMiss', L.AFTER_MISS.XINGFEN_RETRY, (data) => {
        const { unit, target, log } = data;
        const decl = decls.find(d => d.name === unit.name);
        if (!decl || unit.name !== '宋青书' || !unit.alive) return;
        if (canXingFenTrigger(unit)) {
            consumeXingFen(unit);
            log.push({ factType: FACT_TYPES.XING_FEN_RETRY, data: { unitName: unit.name } });
            if (!data.extraRequests) data.extraRequests = [];
            data.extraRequests.push({
                unit,
                targetUid: null,
                reason: 'xingFenMiss',
                actedMode: 'allow',
                priority: 30
            });
        }
    });
}

// ==================== 闪避规则声明 ====================
function installDodgeRules(decl) {
    if (!decl.dodgeRules || decl.dodgeRules.length === 0) return;
    for (const rule of decl.dodgeRules) {
        if (rule.type === 'lostHpPercent') {
            registerDodgeRule((unit) => {
                if (unit.name !== decl.name || !unit.alive) return 0;
                const lostPct = (unit.maxHp - unit.hp) / unit.maxHp;
                return lostPct * rule.max;
            });
        }
    }
}