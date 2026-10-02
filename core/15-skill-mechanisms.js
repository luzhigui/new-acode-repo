// V6.4.0 | ~22300 bytes | 2026-10-02 mechanics type 静默失效治理：安装期交叉校验（顶层 type 必须在 core/18 注册表或本地安装器名单、四类内层元素 type 必须在分发名单，查不到开局即抛错）；全部分发比较改用 infra/56 的 MECHANIC_TYPES / MECHANIC_EFFECT_TYPES 枚举
export const VER = 'core/15-skill-mechanisms.js V6.4.0';

import { EXECUTION_LAYER as L, EFFECT_TYPES, registerSettlementHook } from '../infra/50-event-bus.js';
import { CONFIG } from './01config-5v5-test.js';
import { registerDodgeRule } from './12battle-attack-steps.js';
import { emitEvent, applyStatChange, getBattleRng } from './13battle-shared.js';
import { fmtHp } from '../infra/51-core-utils.js';
import { FACT_TYPES, UNIT_EVENT_TYPES, CAMP_TYPES, SIGNAL_TYPES, MECHANIC_TYPES, MECHANIC_EFFECT_TYPES } from '../infra/56-battle-enums.js';
import { installMechanicByType, hasMechanicHandler } from './18mechanic-registry.js';
import { canBeTargeted } from './03battle-utils.js';
import { watchUnit, unwatchUnit } from './19unit-watch.js';

// 本地安装器承接的顶层机制 type（不经 core/18 注册表）；其余顶层 type 必须已注册。
const LOCAL_MECHANIC_TYPES = new Set([
    MECHANIC_TYPES.LINK_ATTACK,
    MECHANIC_TYPES.FOLLOW_ATTACK,
    MECHANIC_TYPES.PHANTOM_DISGUISE
]);

// 四类内层容器允许的元素 type 名单（值来自 infra/56 枚举，JSON 侧字符串由安装期校验兜）。
const LOCAL_EFFECT_TYPES = Object.freeze({
    onHitEffects: new Set(Object.values(MECHANIC_EFFECT_TYPES.ON_HIT)),
    beforeDamageEffects: new Set(Object.values(MECHANIC_EFFECT_TYPES.BEFORE_DAMAGE)),
    attributeMods: new Set(Object.values(MECHANIC_EFFECT_TYPES.ATTRIBUTE_MODS)),
    dodgeRules: new Set(Object.values(MECHANIC_EFFECT_TYPES.DODGE_RULES))
});

// 安装期交叉校验：数据声明的每个 type 都必须有人接。
// 顶层 type：core/18 注册表（modules/26、30）或上面的本地安装器名单；
// 内层元素：必须落在所属容器的分发名单内。任一查不到立即抛错——
// 漏注册/改名漏跟必须在开局暴露，禁止机制静默失效。
function validateMechanicDeclarations(declarations) {
    for (const decl of declarations) {
        if (!decl) continue;
        if (decl.type && !LOCAL_MECHANIC_TYPES.has(decl.type) && !hasMechanicHandler(decl.type)) {
            throw new Error(`[core/15] 未知顶层机制 type "${decl.type}"（角色 ${decl.name}）：未在 core/18 注册，也不在本地安装器名单内`);
        }
        for (const [container, allow] of Object.entries(LOCAL_EFFECT_TYPES)) {
            const arr = decl[container];
            if (!Array.isArray(arr)) continue;
            for (const el of arr) {
                const t = el && el.type;
                if (typeof t !== 'string' || !allow.has(t)) {
                    throw new Error(`[core/15] 未知内层效果 type "${t}"（角色 ${decl.name} 的 ${container}）：不在 core/15 分发名单内`);
                }
            }
        }
    }
}

// 成昆模仿观察 token：chengkunUid → watcher token
const _phantomWatchTokens = new Map();

// 给成昆登记"模仿对象不可选即失效"的观察
function registerPhantomWatcher(chengkun, target, allySide) {
    const oldToken = _phantomWatchTokens.get(chengkun.uid);
    if (oldToken) unwatchUnit(oldToken);
    const targetUid = target.uid;
    const token = watchUnit(chengkun,
        () => {
            const t = allySide.find(u => u.uid === targetUid);
            return t ? canBeTargeted(t) : false;
        },
        (stillTargetable) => {
            if (!stillTargetable && chengkun.state._phantomTarget === targetUid) {
                chengkun.state._phantomTarget = null;
            }
        }
    );
    _phantomWatchTokens.set(chengkun.uid, token);
}

export function installDeclaredSkills(eventBus, A, B, log, declarations) {
    // 安装期先校验全部 type 都有人接，再登记任何 hook（fail-fast，不留半装状态）
    validateMechanicDeclarations(declarations);
    for (const decl of declarations) {
        if (!decl || !decl.name) continue;
        installTargetRule(eventBus, A, B, decl);
        installAttributeModifiers(A, B, decl);
        installDodgeRules(decl);
    }
    installBeforeDamageEffects(eventBus, declarations);
    installOnHitEffects(eventBus, A, B, declarations);
    installPhantomDisguise(eventBus, A, B, declarations);
    installLinkAttack(eventBus, declarations);
    installFollowAttack(eventBus, declarations);
    // 带 type 的声明（chainClaw / kuLian / xinHun / xingFen / dotTick / damageReflect …）
    // 走机制注册表：具体实现由 modules 侧 registerMechanicHandler 提供，core 只负责转发。
    // 本地安装器承接的 type（linkAttack / followAttack / phantomDisguise）不进注册表。
    for (const decl of declarations) {
        if (!decl || !decl.type) continue;
        if (LOCAL_MECHANIC_TYPES.has(decl.type)) continue;
        if (!hasMechanicHandler(decl.type)) {
            throw new Error(`[core/15] 未知机制 type "${decl.type}"（角色 ${decl.name}）：未注册，也不在本地名单内`);
        }
        installMechanicByType(eventBus, decl.type, A, B, log, decl);
    }
}

export function installFromGameData(eventBus, A, B, log, gameData) {
    if (!gameData || !gameData.characters) return;
    const declarations = [];
    for (const [name, character] of Object.entries(gameData.characters)) {
        if (!character.mechanics || !Array.isArray(character.mechanics)) continue;
        for (const mech of character.mechanics) {
            if (!mech || typeof mech !== 'object') continue;
            declarations.push({ name, ...mech });
        }
    }
    installDeclaredSkills(eventBus, A, B, log, declarations);
}

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
            handler: (data) => { submitLowestHpTarget(data, decl); }
        });
    } else if (rule === 'highestHpPct') {
        registerSettlementHook({
            when: SIGNAL_TYPES.BEFORE_SELECT_TARGET,
            priority: L.BEFORE_SELECT_TARGET.REBEL,
            handler: (data) => { submitHighestHpPctTarget(data, decl); }
        });
    }
}

function submitBeforeDamageEffects(data, decls) {
    for (const decl of decls) {
        if (data.unit.name !== decl.name) continue;
        for (const eff of decl.beforeDamageEffects) {
            if (eff.type === MECHANIC_EFFECT_TYPES.BEFORE_DAMAGE.IGNORE_DEF) {
                data.declarations.push({ type: EFFECT_TYPES.IGNORE_DEF, value: eff.ratio, source: data.unit });
            } else if (eff.type === MECHANIC_EFFECT_TYPES.BEFORE_DAMAGE.DAMAGE_MULTIPLIER_IF_POISONED) {
                if (data.target.state._xuanmingPoison && data.target.state._xuanmingPoison.remaining > 0) {
                    data.declarations.push({ type: EFFECT_TYPES.DMG_MULTIPLIER, value: 1 + eff.bonus, source: data.unit, label: '鹿角杖法' });
                }
            } else if (eff.type === MECHANIC_EFFECT_TYPES.BEFORE_DAMAGE.BONUS_LOST_HP) {
                const lostHp = data.unit.maxHp - data.unit.hp;
                const bonus = Math.floor(lostHp * eff.ratio);
                if (bonus > 0) data.declarations.push({ type: EFFECT_TYPES.BONUS_DMG, value: bonus, source: data.unit, label: eff.label || '额外伤害' });
            } else if (eff.type === MECHANIC_EFFECT_TYPES.BEFORE_DAMAGE.BONUS_TARGET_CURRENT_HP) {
                const trueDmg = Math.floor(data.target.hp * eff.ratio);
                if (trueDmg > 0) data.declarations.push({ type: EFFECT_TYPES.BONUS_DMG, value: trueDmg, source: data.unit, label: eff.label || '额外伤害' });
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
        handler: (data) => { submitBeforeDamageEffects(data, decls); }
    });
}

function installAttributeModifiers(A, B, decl) {
    if (!decl.attributeMods || decl.attributeMods.length === 0) return;
    const target = decl.camp === CAMP_TYPES.ENEMY
        ? B.find(u => u.name === decl.name && u.alive)
        : A.find(u => u.name === decl.name && u.alive);
    if (!target) return;
    for (const mod of decl.attributeMods) {
        if (mod.type === MECHANIC_EFFECT_TYPES.ATTRIBUTE_MODS.FORTIFY_INCREMENT_MUL) {
            Object.assign(target.state, { _fortifyIncrement: CONFIG.FORTIFY_INCREMENT * mod.mult, _fortifyCap: CONFIG.FORTIFY_CAP * mod.mult });
        }
    }
}

function submitOnHitEffects(data, onHitDecls) {
    const unit = data.unit;
    const target = data.target;
    const dmg = data.dmg;
    if (!unit || !unit.alive || dmg <= 0) return;

    for (const decl of onHitDecls) {
        if (unit.name !== decl.name) continue;
        for (const eff of decl.onHitEffects) {
            if (eff.type === MECHANIC_EFFECT_TYPES.ON_HIT.LEECH) {
                const lostPct = (unit.maxHp - unit.hp) / unit.maxHp;
                const ratio = eff.minRatio + (eff.maxRatio - eff.minRatio) * lostPct;
                const heal = Math.max(1, Math.floor(dmg * ratio));
                const newMaxHp = unit.maxHp + heal;
                if (!data.declarations) data.declarations = [];
                data.declarations.push({ type: EFFECT_TYPES.LEECH, value: heal, source: unit, maxHp: newMaxHp, factType: FACT_TYPES.WEI_LEECH, factData: { unitName: unit.name, heal, newMaxHp: Math.floor(newMaxHp), unitUid: unit.uid } });
            } else if (eff.type === MECHANIC_EFFECT_TYPES.ON_HIT.HEAL_MAX_HP_PCT) {
                const heal = Math.min(Math.floor(unit.maxHp * eff.pct), unit.maxHp - unit.hp);
                if (heal > 0) {
                    if (!data.declarations) data.declarations = [];
                    data.declarations.push({ type: EFFECT_TYPES.HEAL, value: heal, source: unit, factType: FACT_TYPES.NINE_YANG_HEAL, factData: { unitName: unit.name, heal, hpBefore: fmtHp(unit.hp), hpAfter: fmtHp(unit.hp + heal), unitUid: unit.uid } });
                }
            } else if (eff.type === MECHANIC_EFFECT_TYPES.ON_HIT.POISON) {
                Object.assign(target.state, { _xuanmingPoison: { remaining: eff.duration, dotPercents: [...eff.dotPercents] } });
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
            } else if (eff.type === MECHANIC_EFFECT_TYPES.ON_HIT.BONUS_LOST_HP) {
                const lostHp = unit.maxHp - unit.hp;
                const bonus = Math.floor(lostHp * eff.ratio);
                if (bonus > 0) {
                    if (!data.declarations) data.declarations = [];
                    data.declarations.push({ type: EFFECT_TYPES.BONUS_DMG, value: bonus, source: unit, label: eff.label || '额外伤害', logText: null });
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
        handler: (data) => { submitOnHitEffects(data, onHitDecls); }
    });
}

function submitPhantomDisguiseOnHit(data, decls) {
    const unit = data.unit;
    if (!unit || !unit.alive || data.dmg <= 0) return;
    const decl = decls.find(d => d.name === unit.name);
    if (!decl) return;
    const lostHp = unit.maxHp - unit.hp;
    if (lostHp > 0) {
        const aliveCount = data.enemySide.filter(u => u.alive).length;
        const heal = Math.floor(lostHp * decl.healRatio * aliveCount);
        if (!data.declarations) data.declarations = [];
        data.declarations.push({ type: EFFECT_TYPES.HEAL, value: heal, source: unit, factType: FACT_TYPES.PHANTOM_DISGUISE_HEAL, factData: { unitName: unit.name, heal, unitUid: unit.uid } });
    }
    emitEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _phantomTarget: unit.state._phantomTarget });
}

// 幻影伪装：攻击后模仿对方单位。受击不重刷（闪避反击时保持暴露），只在成昆自身攻击结算后重刷
function rollPhantomDisguise(unit, enemySide) {
    const enemyAlive = enemySide.filter(u => canBeTargeted(u) && !u.isHorse);
    if (enemyAlive.length > 0) {
        const target = enemyAlive[getBattleRng().nextInt(0, enemyAlive.length - 1)];
        Object.assign(unit.state, { _phantomTarget: target.uid });
        // 登记观察：被模仿者变得不可选（死/飞天/附身）→ 模仿立即失效
        registerPhantomWatcher(unit, target, enemySide);
        emitEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _phantomTarget: unit.state._phantomTarget });
    }
}

// 成昆开始攻击前卸下伪装（伪装不跨攻击生效）
function submitPhantomClearBeforeAttack(data, decls) {
    const decl = decls.find(d => d.name === data.unit.name);
    if (!decl || !data.unit.alive) return;
    data.unit.state._phantomTarget = null;
}

// 成昆攻击结算后重新伪装：命中/未命中都算攻击过；闪避走 ON_DODGE 不在此列
function submitPhantomRerollAfterAttack(data, decls) {
    const decl = decls.find(d => d.name === data.unit.name);
    if (!decl || !data.unit.alive || !data.enemySide) return;
    rollPhantomDisguise(data.unit, data.enemySide);
}

function submitPhantomDisguiseTarget(data, decls) {
    if (data.unit.camp !== CAMP_TYPES.ALLY) return;
    const { unit, enemySide, declaration, allySide } = data;
    let phantomDecl = null;
    let chengkun = null;
    for (const d of decls) {
        const candidate = enemySide.find(u => u.name === d.name && u.alive && u.state._phantomTarget);
        if (candidate) { phantomDecl = d; chengkun = candidate; break; }
    }
    if (!phantomDecl || !chengkun) return;
    const isPhantomTarget = chengkun.state._phantomTarget === unit.uid;
    if (isPhantomTarget) {
        declaration.targetResult = chengkun;
        declaration.phantomFact = { factType: FACT_TYPES.PHANTOM_REVEAL, data: { unitName: unit.name, deceiver: chengkun.name, deceiverUid: chengkun.uid } };
        return;
    }
    const lostHpPct = (chengkun.maxHp - chengkun.hp) / chengkun.maxHp;
    const confuseChance = phantomDecl.baseChance + phantomDecl.per10pctLost * (lostHpPct * 10);
    if (getBattleRng().next() >= confuseChance) return;
    const phantomTarget = allySide.find(u => u.alive && !u.isHorse && !u.state._untargetable && u.uid === chengkun.state._phantomTarget && u.uid !== unit.uid);
    if (phantomTarget) {
        declaration.targetResult = phantomTarget;
        declaration.phantomFact = { factType: FACT_TYPES.PHANTOM_CONFUSE, data: { unitName: unit.name, deceiver: chengkun.name, targetName: phantomTarget.name } };
    }
}

function installPhantomDisguise(eventBus, A, B, declarations) {
    const decls = declarations.filter(d => d && d.type === MECHANIC_TYPES.PHANTOM_DISGUISE);
    if (decls.length === 0) return;
    // 每回合重新登记已有模仿的观察（clearAllWatchers 已在上游清空，且 A/B 每回合是新克隆）
    const chengkun = B.find(u => u.isChengKun && u.alive && u.state._phantomTarget);
    if (chengkun) {
        const target = A.find(u => u.uid === chengkun.state._phantomTarget);
        if (target) {
            registerPhantomWatcher(chengkun, target, A);
        } else {
            // 被模仿者已消失（上回合死亡/被移除），模仿立即作废
            chengkun.state._phantomTarget = null;
        }
    }
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
        priority: L.AFTER_DAMAGE_APPLIED.DISGUISE,
        handler: (data) => { submitPhantomDisguiseOnHit(data, decls); }
    });
    registerSettlementHook({
        when: SIGNAL_TYPES.BEFORE_SELECT_TARGET,
        priority: L.BEFORE_SELECT_TARGET.DISGUISE,
        handler: (data) => { submitPhantomDisguiseTarget(data, decls); }
    });
    registerSettlementHook({
        when: SIGNAL_TYPES.BEFORE_SELECT_TARGET,
        priority: L.BEFORE_SELECT_TARGET.PHANTOM_CLEAR,
        handler: (data) => { submitPhantomClearBeforeAttack(data, decls); }
    });
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_ATTACK,
        priority: L.AFTER_ATTACK.PHANTOM_REROLL,
        handler: (data) => { submitPhantomRerollAfterAttack(data, decls); }
    });
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_MISS,
        priority: L.AFTER_MISS.PHANTOM_REROLL,
        handler: (data) => { submitPhantomRerollAfterAttack(data, decls); }
    });
}

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
        data.extraRequests.push({ unit: partner, targetUid: target.uid, reason: 'xuanmingLink', actedMode: 'restore', actedSnapshot: partner.state._acted, priority: 40 });
        break;
    }
}

function installLinkAttack(eventBus, declarations) {
    const decls = declarations.filter(d => d && d.type === MECHANIC_TYPES.LINK_ATTACK);
    if (decls.length === 0) return;
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_ATTACK,
        priority: L.AFTER_ATTACK.XUANMING_LINK,
        handler: (data) => { submitLinkAttack(data, decls); }
    });
}

// 跟随攻击（灭绝师太）：任意队友命中后，chance 概率由跟随者打同一目标，无每回合上限。
// 与玄冥联动的方向相反——联动是「攻击者声明带谁跟随」，队友固定；这里是「跟随者声明跟所有人」，
// 队友是任意单位、没法逐个登记，所以声明挂在跟随者名下。
// 防乒乓：跟随攻击自身会走 AFTER_ATTACK，core/10 对 reason:'followAttack' 置 _isLinkAttack，
// 这里开头同样判 _isLinkAttack，保证一次额外攻击不会再触发一次跟随。
function submitFollowAttack(data, decls) {
    const { unit, target, dmg, allySide } = data;
    if (!unit || unit.state._isLinkAttack || dmg <= 0 || !target || !target.alive) return;
    for (const decl of decls) {
        const follower = allySide.find(u => u.name === decl.name && u.alive);
        if (!follower || follower.uid === unit.uid) continue;
        if (getBattleRng().next() >= (decl.chance || 0)) continue;
        if (data.group && data.group.data && data.group.data.entries) {
            data.group.data.entries.push({ type: 'info', text: `<span class="gold">🐺 ${follower.name} 跟随 ${unit.name} 出手！</span>` });
        }
        if (!data.extraRequests) data.extraRequests = [];
        data.extraRequests.push({
            unit: follower,
            targetUid: target.uid,
            reason: 'followAttack',
            actedMode: 'restore',
            actedSnapshot: follower.state._acted,
            priority: 45
        });
    }
}

function installFollowAttack(eventBus, declarations) {
    const decls = declarations.filter(d => d && d.type === MECHANIC_TYPES.FOLLOW_ATTACK);
    if (decls.length === 0) return;
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_ATTACK,
        priority: L.AFTER_ATTACK.FOLLOW_ATTACK,
        handler: (data) => { submitFollowAttack(data, decls); }
    });
}

function installDodgeRules(decl) {
    if (!decl.dodgeRules || decl.dodgeRules.length === 0) return;
    for (const rule of decl.dodgeRules) {
        if (rule.type === MECHANIC_EFFECT_TYPES.DODGE_RULES.LOST_HP_PERCENT) {
            registerDodgeRule((unit) => {
                if (unit.name !== decl.name || !unit.alive) return 0;
                const lostPct = (unit.maxHp - unit.hp) / unit.maxHp;
                return lostPct * rule.max;
            });
        }
    }
}