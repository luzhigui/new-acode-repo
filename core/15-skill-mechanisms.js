// V5.7.2 | 2026-08-28 毒 fact 按攻击组定位插入
export const VER = 'core/15-skill-mechanisms.js V5.7.2';

import { EXECUTION_LAYER as L, EFFECT_TYPES, registerSettlementHook } from '../infra/50-event-bus.js';
import { CONFIG } from './01config-5v5-test.js';
import { registerDodgeRule } from './12battle-attack-steps.js';
import { emitEvent, applyStatChange, applyMaxHpChange, getBattleRng } from './13battle-shared.js';
import { checkKuLian, applyXingFenGrant, tickKuaiLeHeal, canXingFenTrigger, consumeXingFen } from '../modules/20elite-skills.js';
import { FACT_TYPES, UNIT_EVENT_TYPES, CAMP_TYPES, SIGNAL_TYPES } from '../infra/56-battle-enums.js';
// 机制查表化：静态顶层 import 避免动态 import 的异步时序导致 registerSettlementHook 错过注册
import { installMechanicByType } from '../modules/30custom-effects.js';
// 同步化：性奋额外攻击改为静态导入，避免动态 import 引入异步，使 processUnitAttack 可同步递归
import { processUnitAttack } from './10battle-attack.js';

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
    // 机制查表化：对每条带 type 的声明，交由 modules/30 注册表按 type 安装第三方/数据驱动机制
    for (const decl of declarations) {
        if (decl && decl.type) installMechanicByType(eventBus, decl.type, A, B, log);
    }
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

// 目标选择：判定与 targetResult 写入已抽为纯函数
function submitLowestHpTarget(data, decl) {
    if (data.unit.name !== decl.name) return;
    const sorted = [...data.validTargets].sort((a, b) => a.hp - b.hp);
    if (sorted[0]) data.declaration.targetResult = sorted[0];
}

function submitHighestHpPctTarget(data, decl) {
    if (data.unit.name !== decl.name) return;
    const target = data.validTargets.reduce((a, b) => (a.hp / a.maxHp) > (b.hp / b.maxHp) ? a : b);
    if (target) data.declaration.targetResult = target;
}

function installTargetRule(eventBus, A, B, decl) {
    if (!decl.targetRule) return;
    const rule = decl.targetRule;

    if (rule === 'lowestHp') {
        registerSettlementHook({
            when: SIGNAL_TYPES.BEFORE_SELECT_TARGET,
            priority: L.BEFORE_SELECT_TARGET.REBEL,
            handler: (data) => {
                submitLowestHpTarget(data, decl);
            }
        });
    } else if (rule === 'highestHpPct') {
        registerSettlementHook({
            when: SIGNAL_TYPES.BEFORE_SELECT_TARGET,
            priority: L.BEFORE_SELECT_TARGET.REBEL,
            handler: (data) => {
                submitHighestHpPctTarget(data, decl);
            }
        });
    }
}

// 伤害计算前效果声明
// 所有声明的 beforeDamageEffects 共用一个监听器（同 onHitEffects，避开 EventBus toString 去重）
function submitBeforeDamageEffects(data, decls) {
    for (const decl of decls) {
        if (data.unit.name !== decl.name) continue;
        for (const eff of decl.beforeDamageEffects) {
            if (eff.type === 'ignoreDef') {
                data.declarations.push({ type: EFFECT_TYPES.IGNORE_DEF, value: eff.ratio, source: data.unit });
            } else if (eff.type === 'damageMultiplierIfPoisoned') {
                if (data.target.state._xuanmingPoison && data.target.state._xuanmingPoison.remaining > 0) {
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
}

function installBeforeDamageEffects(eventBus, declarations) {
    const decls = declarations.filter(d => d && d.name && d.beforeDamageEffects && d.beforeDamageEffects.length > 0);
    if (decls.length === 0) return;

    registerSettlementHook({
        when: SIGNAL_TYPES.BEFORE_DAMAGE_CALC,
        priority: L.BEFORE_DAMAGE_CALC.TRUE_DMG,
        handler: (data) => {
            submitBeforeDamageEffects(data, decls);
        }
    });
}

// 属性修正声明
function installAttributeModifiers(A, B, decl) {
    if (!decl.attributeMods || decl.attributeMods.length === 0) return;
    const target = decl.camp === CAMP_TYPES.ENEMY
        ? B.find(u => u.name === decl.name && u.alive)
        : A.find(u => u.name === decl.name && u.alive);
    if (!target) return;
    for (const mod of decl.attributeMods) {
        if (mod.type === 'fortifyIncrementMul') {
            Object.assign(target.state, { _fortifyIncrement: CONFIG.FORTIFY_INCREMENT * mod.mult, _fortifyCap: CONFIG.FORTIFY_CAP * mod.mult });
        }
    }
}

// 命中后效果声明
// 所有声明的 onHitEffects 共用一个监听器（EventBus 按 toString 去重，同模板多闭包会被误杀）
function submitOnHitEffects(data, onHitDecls) {
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
                Object.assign(target.state, { _xuanmingPoison: { remaining: eff.duration, dotPercents: [...eff.dotPercents] } });
                // 毒记账异步 push（emit 未 await）：按所属 group 定位插入 log，紧跟本攻击组，
                // 嵌套联动攻击下外层毒先插到自己 group 后、内层毒插到自己 group 后，顺序稳定不错位
                const poisonFact = { factType: FACT_TYPES.XUAN_MING_POISONED, data: { attackerName: unit.name, targetName: target.name, dotPercents: eff.dotPercents } };
                if (data.log) {
                    const group = data.group;
                    if (group) {
                        const idx = data.log.indexOf(group);
                        if (idx >= 0) data.log.splice(idx + 1, 0, poisonFact);
                        else data.log.push(poisonFact);
                    } else {
                        data.log.push(poisonFact);
                    }
                }
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
}

function installOnHitEffects(eventBus, A, B, declarations) {
    const onHitDecls = declarations.filter(d => d && d.name && d.onHitEffects && d.onHitEffects.length > 0);
    if (onHitDecls.length === 0) return;

    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
        priority: L.AFTER_DAMAGE_APPLIED.LEECH,
        handler: (data) => {
            submitOnHitEffects(data, onHitDecls);
        }
    });
}

// 幻影伪装（阶段2a）：判定与状态/声明写入已抽为纯函数
function submitPhantomDisguiseOnHit(data, decls) {
    const unit = data.unit;
    if (!unit || !unit.alive || data.dmg <= 0) return;
    const decl = decls.find(d => d.name === unit.name);
    if (!decl) return;
    const enemyAlive = data.enemySide.filter(u => u.alive && !u.isHorse && !u.state._untargetable);
    if (enemyAlive.length > 0) {
        Object.assign(unit.state, { _phantomTarget: enemyAlive[getBattleRng().nextInt(0, enemyAlive.length - 1)].uid });
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
                factData: { unitName: unit.name, heal, unitUid: unit.uid }
            });
        }
        emitEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp:unit.hp, maxHp:unit.maxHp, alive:unit.alive, atk:unit.atk, def:unit.def, _phantomTarget:unit.state._phantomTarget });
    }
}

function submitPhantomDisguiseTarget(data, decls) {
    if (data.unit.camp !== CAMP_TYPES.ALLY) return;
    const { unit, enemySide, declaration, allySide } = data;
    let phantomDecl = null;
    let chengkun = null;
    for (const d of decls) {
        const candidate = enemySide.find(u => u.name === d.name && u.alive && u.state._phantomTarget);
        if (candidate) {
            phantomDecl = d;
            chengkun = candidate;
            break;
        }
    }
    if (!phantomDecl || !chengkun) return;

    const isPhantomTarget = chengkun.state._phantomTarget === unit.uid;
    if (isPhantomTarget) {
        declaration.targetResult = chengkun;
        declaration.phantomFact = { factType: FACT_TYPES.PHANTOM_REVEAL, data: { unitName: unit.name, deceiver: chengkun.name } };
        return;
    }

    const lostHpPct = (chengkun.maxHp - chengkun.hp) / chengkun.maxHp;
    const confuseChance = (phantomDecl.baseChance || 0.30) + (phantomDecl.per10pctLost || 0.06) * (lostHpPct * 10);
    if (getBattleRng().next() >= confuseChance) return;

    const phantomTarget = allySide.find(u => u.alive && !u.isHorse && !u.state._untargetable && u.uid === chengkun.state._phantomTarget && u.uid !== unit.uid);
    if (phantomTarget) {
        declaration.targetResult = phantomTarget;
        declaration.phantomFact = { factType: FACT_TYPES.PHANTOM_CONFUSE, data: { unitName: unit.name, deceiver: chengkun.name, targetName: phantomTarget.name } };
    }
}

function installPhantomDisguise(eventBus, declarations) {
    const decls = declarations.filter(d => d && d.type === 'phantomDisguise');
    if (decls.length === 0) return;

    // afterDamageApplied：设置伪装目标并回血
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
        priority: L.AFTER_DAMAGE_APPLIED.DISGUISE,
        handler: (data) => {
            submitPhantomDisguiseOnHit(data, decls);
        }
    });

    // beforeSelectTarget：被模仿者攻击时概率混乱
    registerSettlementHook({
        when: SIGNAL_TYPES.BEFORE_SELECT_TARGET,
        priority: L.BEFORE_SELECT_TARGET.DISGUISE,
        handler: (data) => {
            submitPhantomDisguiseTarget(data, decls);
        }
    });
}

// 玄冥联动（阶段2a）：判定推 extraRequests 驱动再攻击链（_linkTriggered 直写不走声明）
function submitLinkAttack(data, decls) {
    const { unit, target, dmg, allySide, log } = data;
    if (!unit || unit.state._isLinkAttack || dmg <= 0 || !target || !target.alive) return;
    const decl = decls.find(d => d.name === unit.name);
    if (!decl) return;
    const partnerNames = decl.partnerNames || [];
    for (const partnerName of partnerNames) {
        const partner = allySide.find(u => u.name === partnerName && u.alive && !u.state._linkTriggered);
        if (!partner) continue;
        Object.assign(partner.state, { _linkTriggered: true });
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
}

function installLinkAttack(eventBus, declarations) {
    const decls = declarations.filter(d => d && d.type === 'linkAttack');
    if (decls.length === 0) return;

    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_ATTACK,
        priority: L.AFTER_ATTACK.XUANMING_LINK,
        handler: (data) => {
            submitLinkAttack(data, decls);
        }
    });
}

// 白骨爪（阶段2b）：模拟链结算推 CLAW_CHAIN/HEAL 声明（直接读 window.GlobalStore）
function submitChainClaw(data, decls) {
    const { unit, target, dmg, log, allySide, enemySide } = data;
    const decl = decls.find(d => d.name === unit.name);
    if (!decl || !target || !target.alive) return;
    const rng = getBattleRng();
    const zhangAlive = enemySide && enemySide.some(u => u.isZhang && u.alive);
    const baseHit = zhangAlive ? (decl.jealous?.baseDmg ?? decl.baseDmg ?? 2) : (decl.baseDmg ?? 1.5);
    const s = zhangAlive ? { ...decl, ...(decl.jealous || {}) } : decl;

    if (!unit.state._nineYinFirstDone) {
        Object.assign(unit.state, { _nineYinFirstDone: true });
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
            factData: { totalHeal, unitUid: song.uid }
        });
    } else if (song && song.alive) {
        log.push({ factType: FACT_TYPES.CLAW_NO_HEAL, data: {} });
    }
}

function installChainClaw(eventBus, A, B, declarations) {
    const decls = declarations.filter(d => d && d.type === 'chainClaw');
    if (decls.length === 0) return;

    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_ATTACK,
        priority: L.AFTER_ATTACK.CLAW,
        handler: (data) => {
            submitChainClaw(data, decls);
        }
    });
}

// 苦练（阶段2b）：全队属性直改承载（声明路覆盖不到）
function submitKuLian(data, decls) {
    const { A, B, log, declarations } = data;
    const decl = decls[0]; // 宋青书声明
    if (!decl) return;
    const kuLianSong = checkKuLian(B);
    if (!kuLianSong) return;
    // 苦练：每回合给全队 +攻+防+血上限，宋青书三倍，可跨回合累积
    const s = {
        atkBonus: decl.atkBonus || 1,
        defBonus: decl.defBonus || 1,
        hpBonus: decl.hpBonus || 3
    };
    const targets = B.filter(u => u.alive && !u.isHorse);
    const atkTargets = targets.map(u => ({ target: u, delta: s.atkBonus * (u.uid === kuLianSong.uid ? 3 : 1) }));
    const defTargets = targets.map(u => ({ target: u, delta: s.defBonus * (u.uid === kuLianSong.uid ? 3 : 1) }));
    const hpTargets = targets.map(u => ({ target: u, delta: s.hpBonus * (u.uid === kuLianSong.uid ? 3 : 1) }));
    if (!declarations) data.declarations = declarations = [];
    for (const group of [
        { field: 'atk', list: atkTargets },
        { field: 'def', list: defTargets },
        { field: 'maxHp', list: hpTargets }
    ]) {
        for (const item of group.list) {
            declarations.push({
                type: EFFECT_TYPES.ROUND_STAT_GRANT,
                field: group.field,
                delta: item.delta,
                target: item.target,
                source: null,
                reason: '苦练'
            });
        }
    }
    log.push({ factType: FACT_TYPES.KU_LIAN_PRIORITY, data: { unitName: kuLianSong.name } });
    log.push({ factType: FACT_TYPES.KU_LIAN, data: { unitName: kuLianSong.name, atkBonus: s.atkBonus, defBonus: s.defBonus, hpBonus: s.hpBonus } });
}

function installKuLian(eventBus, A, B, declarations) {
    const decls = declarations.filter(d => d && d.type === 'kuLian');
    if (decls.length === 0) return;

    registerSettlementHook({
        when: SIGNAL_TYPES.ON_ROUND_START,
        priority: L.ROUND_START.KULIAN_BUFF,
        handler: (data) => {
            submitKuLian(data, decls);
        }
    });

    // 周芷若不在场时，宋青书六大派内最先行动，不占用额外次数
    registerSettlementHook({
        when: SIGNAL_TYPES.BEFORE_ACTION_SELECT,
        priority: L.BEFORE_ACTION.KULIAN_PRIORITY,
        handler: (data) => {
            if (data.unit.name !== '宋青书' || !data.unit.alive) return;
            const zhou = data.enemySide && data.enemySide.find(u => u.name === '周芷若' && u.alive);
            if (!zhou) data.declaration.priority = 1;
        }
    });
}

// 新婚声明（阶段2b）
// 新婚：宋青书攻击时扣周芷若血、叠快乐层、自身性奋代价递增
function submitXinHun(data, decls) {
    const { unit, target, dmg, allySide, log } = data;
    const decl = decls.find(d => d.name === unit.name);
    if (!decl || unit.name !== '宋青书' || !unit.alive) return;
    const zhou = allySide.find(u => u.name === '周芷若' && u.alive);
    if (!zhou) return;
    const hpDeduct = decl.hpDeduct || 1;
    const healLevels = decl.healLevels || [0.16, 0.10, 0.06, 0.03];
    applyStatChange(zhou, 'hp', -hpDeduct, unit, '新婚扣血', false);
    zhou.state._kuaiLeStack.push({ healPct: healLevels[0] });
    if (zhou.hp <= 0) { if (!zhou._deathTime) zhou._deathTime = Date.now(); }
    log.push({
        factType: FACT_TYPES.XIN_HUN,
        data: {
            attackerName: unit.name,
            targetName: zhou.name,
            hpDeduct,
            healPct: healLevels[0],
            stackCount: zhou.state._kuaiLeStack.length,
            zhouUid: zhou.uid,
            zhouHpAfter: zhou.hp,
            isDead: !!zhou._pendingDeath
        }
    });
    if (zhou._pendingDeath) { log.push({ factType: FACT_TYPES.XIN_HUN_DEATH, data: { unitName: zhou.name, uidD: zhou.uid } }); }
    Object.assign(unit.state, { _xingFenPenaltyCount: (unit.state._xingFenPenaltyCount || 0) + 1 });
    const penalty = unit.state._xingFenPenaltyCount + 1;
    if (penalty > 0 && unit.maxHp > 1) {
        const oldMaxHp = unit.maxHp;
        applyMaxHpChange(unit, Math.max(1, unit.maxHp - penalty), null, '性奋代价');
        if (unit.hp <= 0) { if (!unit._deathTime) unit._deathTime = Date.now(); }
        log.push({ factType: FACT_TYPES.XING_FEN_COST, data: { unitName: unit.name, oldMaxHp, newMaxHp: unit.maxHp, penalty } });
    }
}

function installXinHun(eventBus, A, B, declarations) {
    const decls = declarations.filter(d => d && d.type === 'xinHun');
    if (decls.length === 0) return;

    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
        priority: L.AFTER_DAMAGE_APPLIED.XINGFEN,
        handler: (data) => {
            submitXinHun(data, decls);
        }
    });
}

// 性奋（阶段2b）：回合激活直改 + 额外攻击/重试驱动再攻击链
// 性奋激活 + 快乐回血 tick，均随 roundStart 事件数据携带 declarations
function submitXingFenGrant(data) {
    const { A, B, log, declarations } = data;
    applyXingFenGrant(B, log);
    tickKuaiLeHeal(A.concat(B), log, declarations);
}

function submitXingFenExtra(data, decls) {
    const { unit, target, allySide, enemySide, log } = data;
    const decl = decls.find(d => d.name === unit.name);
    if (!decl || unit.name !== '宋青书' || !unit.alive || unit._xingFenExtraAttacking) return;
    if (!canXingFenTrigger(unit)) return;
    consumeXingFen(unit);
    log.push({ factType: FACT_TYPES.XING_FEN_EXTRA_ATTACK, data: { unitName: unit.name } });
    unit._xingFenExtraAttacking = true;
    // 同步递归攻击，processUnitAttack 已同步化
    processUnitAttack(unit, allySide, enemySide, log, data.A, data.B, data.state, null, null);
    unit._xingFenExtraAttacking = false;
}

function submitXingFenRetry(data, decls) {
    const { unit, target, log, allySide, enemySide } = data;
    const decl = decls.find(d => d.name === unit.name);
    if (!decl || unit.name !== '宋青书' || !unit.alive) return;
    if (canXingFenTrigger(unit)) {
        consumeXingFen(unit);
        log.push({ factType: FACT_TYPES.XING_FEN_RETRY, data: { unitName: unit.name } });
        processUnitAttack(unit, allySide, enemySide, log, data.A, data.B, data.state, null, null);
    }
}

function installXingFen(eventBus, A, B, declarations) {
    const decls = declarations.filter(d => d && d.type === 'xingFen');
    if (decls.length === 0) return;

    // 回合开始：周芷若在场时给宋青书性奋状态
    registerSettlementHook({
        when: SIGNAL_TYPES.ON_ROUND_START,
        priority: L.ROUND_START.XINGFEN_GRANT,
        handler: (data) => {
            submitXingFenGrant(data);
        }
    });

    // 攻击后：性奋额外攻击
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_ATTACK,
        priority: L.AFTER_ATTACK.XINGFEN_EXTRA,
        handler: async (data) => {
            await submitXingFenExtra(data, decls);
        }
    });

    // 未命中后：性奋重试
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_MISS,
        priority: L.AFTER_MISS.XINGFEN_RETRY,
        handler: (data) => {
            submitXingFenRetry(data, decls);
        }
    });
}

// 闪避规则声明
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