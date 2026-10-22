// V6.8.2 | 2026-10-22 张无忌九阳满血转护盾：溢出回复量进永久护盾 _permShield（rawOnly 拿应发额度）
// V6.8.1 | ~16900 bytes | 2026-10-17 HIGHEST_HP_PCT 平局改随机：原 reduce 平局恒取末位，拒马/幼狮恒满血
//   又 push 在队尾 ⇒ 宋青书整局只盯召唤物打。先取最高百分比，再从并列者随机挑（getBattleRng，
//   与概率引擎同源可回放）。
// V6.8.0 | ~16640 bytes | 2026-10-14 core/15 瘦身：linkAttack / followAttack / phantomDisguise 三个英雄机制
//   连同安装器迁出 core——改由 modules 侧 registerMechanicHandler 注册（25 承接玄冥联动 + 成昆幻影、
//   26 承接灭绝跟随）。本文件删 LOCAL_MECHANIC_TYPES / LOCAL_MECHANIC_FIELDS 两张例外表与 isLocal 分支，
//   顶层机制只剩「注册表查表」一条路（未注册的 type 开局即抛）。四个导出签名不变，core/11 调用点零改动。
// V6.7.0 | ~27750 bytes | 2026-10-12 成昆幻影伪装治疗补 `_mods['hp']` 纯记账条目（group 'phantomDisguiseHeal'）：PHANTOM_DISGUISE_HEAL 自身 hp 贡献隔离进账本，供体检对照器核对「声明 heal vs 实际治疗」；真实治疗仍由 EFFECT_TYPES.HEAL 声明结算负责，零游戏逻辑副作用
export const VER = 'core/15-skill-mechanisms.js V6.8.3';

import { EXECUTION_LAYER as L, EFFECT_TYPES, registerSettlementHook } from '../infra/50-event-bus.js';
import { CONFIG } from './01config-5v5-test.js';
import { registerDodgeRule } from './20-registry-dodge.js';
import { recordHpAudit, getBattleRng, previewHeal } from './13battle-shared.js';
import { fmtHp } from '../infra/51-core-utils.js';
import { FACT_TYPES, CAMP_TYPES, SIGNAL_TYPES, MECHANIC_EFFECT_TYPES, MECHANIC_TARGET_RULES } from '../infra/56-battle-enums.js';
import { installMechanicByType, hasMechanicHandler, getMechanicHandler } from './18mechanic-registry.js';

// 四类内层容器允许的元素 type 名单（值来自 infra/56 枚举，JSON 侧字符串由安装期校验兜）。
const LOCAL_EFFECT_TYPES = Object.freeze({
    onHitEffects: new Set(Object.values(MECHANIC_EFFECT_TYPES.ON_HIT)),
    beforeDamageEffects: new Set(Object.values(MECHANIC_EFFECT_TYPES.BEFORE_DAMAGE)),
    attributeMods: new Set(Object.values(MECHANIC_EFFECT_TYPES.ATTRIBUTE_MODS)),
    dodgeRules: new Set(Object.values(MECHANIC_EFFECT_TYPES.DODGE_RULES))
});

// 四类内层效果的必需字段契约：字段名必须与下方分发链实际读取的一致，改读取先改这里。
const INNER_FIELD_SCHEMA = Object.freeze({
    onHitEffects: Object.freeze({
        [MECHANIC_EFFECT_TYPES.ON_HIT.LEECH]: { minRatio: 'number', maxRatio: 'number' },
        [MECHANIC_EFFECT_TYPES.ON_HIT.HEAL_MAX_HP_PCT]: { pct: 'number' },
        [MECHANIC_EFFECT_TYPES.ON_HIT.POISON]: { duration: 'number', dotPercents: 'numberArray' },
        [MECHANIC_EFFECT_TYPES.ON_HIT.BONUS_LOST_HP]: { ratio: 'number' }
    }),
    beforeDamageEffects: Object.freeze({
        [MECHANIC_EFFECT_TYPES.BEFORE_DAMAGE.IGNORE_DEF]: { ratio: 'number' },
        [MECHANIC_EFFECT_TYPES.BEFORE_DAMAGE.DAMAGE_MULTIPLIER_IF_POISONED]: { bonus: 'number' },
        [MECHANIC_EFFECT_TYPES.BEFORE_DAMAGE.BONUS_LOST_HP]: { ratio: 'number' },
        [MECHANIC_EFFECT_TYPES.BEFORE_DAMAGE.BONUS_TARGET_CURRENT_HP]: { ratio: 'number' }
    }),
    attributeMods: Object.freeze({
        [MECHANIC_EFFECT_TYPES.ATTRIBUTE_MODS.FORTIFY_INCREMENT_MUL]: { mult: 'number' }
    }),
    dodgeRules: Object.freeze({
        [MECHANIC_EFFECT_TYPES.DODGE_RULES.LOST_HP_PERCENT]: { max: 'number' }
    })
});

const TARGET_RULE_TYPES = new Set(Object.values(MECHANIC_TARGET_RULES));

// 字段契约 kind 口径：number 有限数 / string 非空串 / nonEmptyArray 非空数组 /
//   numberArray 非空且元素全有限数 / stringArray 非空且元素全非空字符串。
function checkKind(value, kind) {
    if (kind === 'number') return typeof value === 'number' && Number.isFinite(value);
    if (kind === 'string') return typeof value === 'string' && value.length > 0;
    if (kind === 'nonEmptyArray') return Array.isArray(value) && value.length > 0;
    if (kind === 'numberArray') return Array.isArray(value) && value.length > 0
        && value.every(x => typeof x === 'number' && Number.isFinite(x));
    if (kind === 'stringArray') return Array.isArray(value) && value.length > 0
        && value.every(x => typeof x === 'string' && x.length > 0);
    return false;
}

// 按 schema 校验单个声明对象的字段，缺字段/类型错立即抛错（where 标明角色与机制，定位到具体数据行）。
function checkFields(obj, schema, where) {
    for (const [key, kind] of Object.entries(schema)) {
        if (!checkKind(obj ? obj[key] : undefined, kind)) {
            let got;
            try { got = JSON.stringify(obj ? obj[key] : undefined); } catch { got = String(obj ? obj[key] : undefined); }
            throw new Error(`[core/15] 机制字段 "${key}" 缺失或类型错（${where}，应为 ${kind}）：${got}`);
        }
    }
}

// 安装期交叉校验：数据声明的每个 type 都必须有人接、每个被读取的字段都必须齐全。
// 顶层 type：core/18 注册表（modules/26、30，字段契约取 handler.fields）或本地安装器（LOCAL_MECHANIC_FIELDS）；
// targetRule：必须在 MECHANIC_TARGET_RULES 内；
// 内层元素：必须落在所属容器的分发名单内且字段过 schema。任一不过立即抛错——
// 漏注册/改名漏跟/字段缺失必须在开局暴露，禁止机制静默失效或算出 NaN。
export function validateMechanicDeclarations(declarations) {
    for (const decl of declarations) {
        if (!decl) continue;
        if (decl.type) {
            const handler = getMechanicHandler(decl.type);
            if (!handler) {
                throw new Error(`[core/15] 未知顶层机制 type "${decl.type}"（角色 ${decl.name}）：未在 core/18 注册（实现在 modules 侧 registerMechanicHandler 登记）`);
            }
            const schema = handler.fields || null;
            if (schema) checkFields(decl, schema, `角色 ${decl.name} 的顶层 ${decl.type}`);
        }
        if (decl.targetRule !== undefined && !TARGET_RULE_TYPES.has(decl.targetRule)) {
            throw new Error(`[core/15] 未知 targetRule "${decl.targetRule}"（角色 ${decl.name}）：合法值 ${[...TARGET_RULE_TYPES].join('/')}`);
        }
        for (const [container, allow] of Object.entries(LOCAL_EFFECT_TYPES)) {
            const arr = decl[container];
            if (!Array.isArray(arr)) continue;
            const fieldSchema = INNER_FIELD_SCHEMA[container];
            for (const el of arr) {
                const t = el && el.type;
                if (typeof t !== 'string' || !allow.has(t)) {
                    throw new Error(`[core/15] 未知内层效果 type "${t}"（角色 ${decl.name} 的 ${container}）：不在 core/15 分发名单内`);
                }
                checkFields(el, fieldSchema[t] || {}, `角色 ${decl.name} 的 ${container}.${t}`);
            }
        }
    }
}

// 从 gameData 拍平 mechanics 声明（{name, ...mech}），安装与体检对账共用，避免两处各写一份遍历。
export function buildMechanicDeclarations(gameData) {
    const declarations = [];
    if (!gameData || !gameData.characters) return declarations;
    for (const [name, character] of Object.entries(gameData.characters)) {
        if (!Array.isArray(character.mechanics)) continue;
        for (const mech of character.mechanics) {
            if (mech && typeof mech === 'object') declarations.push({ name, ...mech });
        }
    }
    return declarations;
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
    // 带 type 的声明（chainClaw / kuLian / xinHun / xingFen / dotTick / damageReflect /
    //   linkAttack / followAttack / phantomDisguise …）一律走机制注册表：具体实现由 modules 侧
    //   registerMechanicHandler 提供，core 只负责转发（2026-10-14 起无「本地安装器」例外名单）。
    for (const decl of declarations) {
        if (!decl || !decl.type) continue;
        if (!hasMechanicHandler(decl.type)) {
            throw new Error(`[core/15] 未知机制 type "${decl.type}"（角色 ${decl.name}）：未在 core/18 注册`);
        }
        installMechanicByType(eventBus, decl.type, A, B, log, decl);
    }
}

export function installFromGameData(eventBus, A, B, log, gameData) {
    installDeclaredSkills(eventBus, A, B, log, buildMechanicDeclarations(gameData));
}

function submitLowestHpTarget(data, decl) {
    if (data.unit.name !== decl.name) return;
    const sorted = [...data.validTargets].sort((a, b) => a.hp - b.hp);
    if (sorted[0]) data.declaration.targetResult = sorted[0];
}

function submitHighestHpPctTarget(data, decl) {
    if (data.unit.name !== decl.name) return;
    // 2026-10-17 百分比并列改随机：原 reduce 平局取末位，而拒马/幼狮恒满血又 push 在队尾，
    //   宋青书整局只会盯着召唤物打。改为先取最高百分比，再从并列者里随机挑。
    let best = -Infinity;
    for (const t of data.validTargets) {
        const pct = t.hp / t.maxHp;
        if (pct > best) best = pct;
    }
    const tied = data.validTargets.filter(t => t.hp / t.maxHp === best);
    const target = tied[getBattleRng().nextInt(0, tied.length - 1)];
    if (target) data.declaration.targetResult = target;
}

function installTargetRule(eventBus, A, B, decl) {
    if (!decl.targetRule) return;
    const rule = decl.targetRule;
    // 未知值已在安装期 validateMechanicDeclarations 抛错，这里只接合法两条。
    if (rule === MECHANIC_TARGET_RULES.LOWEST_HP) {
        registerSettlementHook({
            when: SIGNAL_TYPES.BEFORE_SELECT_TARGET,
            priority: L.BEFORE_SELECT_TARGET.REBEL,
            handler: (data) => { submitLowestHpTarget(data, decl); }
        });
    } else if (rule === MECHANIC_TARGET_RULES.HIGHEST_HP_PCT) {
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
                // 2026-10-22 吸血量与飘字都取实际落地值（截脉/寒毒打折后；上限提升按实际回血等量加）
                const rawHeal = Math.max(1, Math.floor(dmg * ratio));
                const heal = previewHeal(unit, rawHeal);
                const newMaxHp = unit.maxHp + heal;
                if (!data.declarations) data.declarations = [];
                data.declarations.push({ type: EFFECT_TYPES.LEECH, value: rawHeal, source: unit, maxHp: newMaxHp, factType: FACT_TYPES.WEI_LEECH, factData: { unitName: unit.name, heal, newMaxHp: Math.floor(newMaxHp), unitUid: unit.uid } });
            } else if (eff.type === MECHANIC_EFFECT_TYPES.ON_HIT.HEAL_MAX_HP_PCT) {
                // 2026-10-22 满血转护盾（与寒离飒左拳·九阳同口径）：rawOnly 拿打折后应发额度，
                //   应发 − 实回 = 溢出，进永久护盾 _permShield（截脉/寒毒都算在 nominal 里）
                const rawNominal = Math.floor(unit.maxHp * eff.pct);
                const nominal = previewHeal(unit, rawNominal, true);
                // 实回按 core/16 HEAL handler 口径（先夹 maxHp 缺口、再打折），保证文案/飘字 = 血条
                const heal = previewHeal(unit, Math.min(rawNominal, Math.max(0, unit.maxHp - unit.hp)));
                const shieldGain = Math.max(0, nominal - heal);
                if (heal > 0) {
                    if (!data.declarations) data.declarations = [];
                    data.declarations.push({ type: EFFECT_TYPES.HEAL, value: rawNominal, source: unit, factType: FACT_TYPES.HEAL, factData: { unitName: unit.name, heal, hpBefore: fmtHp(unit.hp), hpAfter: fmtHp(unit.hp + heal), unitUid: unit.uid, icon: '☀️', label: '九阳神功回复', mode: 'plusTrail', anchorVerb: '回复' } });
                    recordHpAudit(unit, 'nineYangHeal', heal, '九阳神功治疗'); // 账本记实际落地值（与 fact.heal 同口径）
                }
                if (shieldGain > 0) {
                    unit.state._permShield = (unit.state._permShield || 0) + shieldGain;
                }
            } else if (eff.type === MECHANIC_EFFECT_TYPES.ON_HIT.POISON) {
                // 2026-10-22 不衰减 + 可叠加 + 无上限：每命中 stacks+1、remaining 刷新为 duration。
                //   每回合伤害 = maxHp × dotPercents[0] × stacks（结算见 modules/30 dotTick）
                const prev = target.state._xuanmingPoison;
                const stacks = (prev && prev.remaining > 0 && prev.stacks > 0 ? prev.stacks : 0) + 1;
                Object.assign(target.state, { _xuanmingPoison: { remaining: eff.duration, dotPercents: [...eff.dotPercents], stacks } });
                const poisonFact = { factType: FACT_TYPES.XUAN_MING_POISONED, data: { attackerName: unit.name, targetName: target.name, dotPercents: eff.dotPercents, stacks } };
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