// modules/25elite-imperial.js — 元朝朝廷精英：成昆（幻影伪装）/ 鹿杖客·鹤笔翁（玄冥联动）
// V6.1.0 | ~10950 bytes | 2026-10-14 core/15 瘦身批 1：linkAttack / phantomDisguise 两个顶层机制从 core/15
//   本地安装器改造成 core/18 注册表 handler（定义与注册同处本文件）。两条改造口径：
//   ① 每 decl 一次 install，钩子内不再遍历 decls，一律用 decl.name 过滤（玄冥双方各声明一条、各自命中自己）
//   ② 幻影的「是不是成昆」由 isChengKun 硬标记改为 decl.name——机制实现不再知道角色名
//   同批（core/15 V6.8.0）已删 core/15 的两张例外表与旧本地安装器：本 handler 是这两个机制的唯一实现，
//   core/15 只在安装期按键查表转发
// ── 更早版本见 记录-更改履历.md
export const VER = 'modules/25elite-imperial.js V6.1.0';

import { registerElite, registerLinkPartners } from '../core/08-elite-registry.js';
import { registerMechanicHandler } from '../core/18mechanic-registry.js';
import { registerSettlementHook, EFFECT_TYPES, EXECUTION_LAYER as L } from '../infra/50-event-bus.js';
import { emitEvent, addMod, getBattleRng } from '../core/13battle-shared.js';
import { canBeTargeted } from '../core/03battle-utils.js';
import { watchUnit, unwatchUnit } from '../core/19unit-watch.js';
import { SIGNAL_TYPES, FACT_TYPES, MECHANIC_TYPES, CAMP_TYPES, UNIT_EVENT_TYPES } from '../infra/56-battle-enums.js';

// 成昆
export function createChengKunComponent() {
    return {
        name: '成昆',
        register(eventBus, A, B, log) {}
    };
}

// 鹿杖客：玄冥毒 tick 已收归数据驱动的 dotTick 原语（modules/30 + content 声明），
//   本组件不再持有 tick 逻辑——残存 register 空实现以保持注册表结构一致。
export function createLuZhangKeComponent() {
    return {
        name: '鹿杖客',
        register(eventBus, A, B, log) {}
    };
}

// 鹤笔翁
export function createHeBiWengComponent() {
    return {
        name: '鹤笔翁',
        register(eventBus, A, B, log) {
            const he = B.find(u => u.isHeBiWeng && u.alive);
            if (!he) return;
        },
    };
}

// —— 玄冥联动（linkAttack）：攻击命中后带动搭档补一击 ——
// 声明挂在攻击者名下（partnerNames 指向搭档），搭档固定；「跟随者声明跟所有人」的相反方向见 followAttack。
export const linkAttackHandler = {
    fields: { partnerNames: 'stringArray' },
    install({ decl }) {
        registerSettlementHook({
            when: SIGNAL_TYPES.AFTER_ATTACK,
            priority: L.AFTER_ATTACK.XUANMING_LINK,
            handler: (data) => { submitLinkAttack(data, decl); }
        });
    }
};

function submitLinkAttack(data, decl) {
    const { unit, target, dmg, allySide, log } = data;
    if (!unit || unit.state._isLinkAttack || dmg <= 0 || !target || !target.alive) return;
    if (unit.name !== decl.name) return;
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

// —— 幻影伪装（phantomDisguise）：攻击后模仿一名敌方存活单位；
// 被模仿者变得不可选（死/飞天/附身）→ 模仿立即失效 ——
// 成昆模仿观察 token：chengkunUid → watcher token
const _phantomWatchTokens = new Map();

// 给模仿者登记「模仿对象不可选即失效」的观察
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

export const phantomDisguiseHandler = {
    fields: { healRatio: 'number', baseChance: 'number', per10pctLost: 'number' },
    install({ A, B, decl }) {
        // 每回合重新登记已有模仿的观察（clearAllWatchers 已在上游清空，且 A/B 每回合是新克隆）
        const chengkun = B.find(u => u.name === decl.name && u.alive && u.state._phantomTarget);
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
            handler: (data) => { submitPhantomDisguiseOnHit(data, decl); }
        });
        registerSettlementHook({
            when: SIGNAL_TYPES.BEFORE_SELECT_TARGET,
            priority: L.BEFORE_SELECT_TARGET.DISGUISE,
            handler: (data) => { submitPhantomDisguiseTarget(data, decl); }
        });
        registerSettlementHook({
            when: SIGNAL_TYPES.BEFORE_SELECT_TARGET,
            priority: L.BEFORE_SELECT_TARGET.PHANTOM_CLEAR,
            handler: (data) => { submitPhantomClearBeforeAttack(data, decl); }
        });
        registerSettlementHook({
            when: SIGNAL_TYPES.AFTER_ATTACK,
            priority: L.AFTER_ATTACK.PHANTOM_REROLL,
            handler: (data) => { submitPhantomRerollAfterAttack(data, decl); }
        });
        registerSettlementHook({
            when: SIGNAL_TYPES.AFTER_MISS,
            priority: L.AFTER_MISS.PHANTOM_REROLL,
            handler: (data) => { submitPhantomRerollAfterAttack(data, decl); }
        });
    }
};

function submitPhantomDisguiseOnHit(data, decl) {
    const unit = data.unit;
    if (!unit || !unit.alive || data.dmg <= 0) return;
    if (unit.name !== decl.name) return;
    const lostHp = unit.maxHp - unit.hp;
    if (lostHp > 0) {
        const aliveCount = data.enemySide.filter(u => u.alive).length;
        const heal = Math.floor(lostHp * decl.healRatio * aliveCount);
        if (!data.declarations) data.declarations = [];
        data.declarations.push({ type: EFFECT_TYPES.HEAL, value: heal, source: unit, factType: FACT_TYPES.PHANTOM_DISGUISE_HEAL, factData: { unitName: unit.name, heal, unitUid: unit.uid } });
        // 体检记账（V6.7.0）：幻影伪装治疗自身 hp 贡献以独立 group 隔离进账本，供 stat-decl 对照器按
        //   group='phantomDisguiseHeal' 比对「声明 heal vs 实际治疗」。纯记账——addMod 只 push 到 _mods['hp']，
        //   真实治疗仍由上方 HEAL 声明结算负责，零游戏逻辑副作用。
        addMod(unit, 'hp', { source: '成昆幻影伪装治疗', value: heal, ttl: 'permanent', group: 'phantomDisguiseHeal', op: 'add' });
    }
    emitEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _phantomTarget: unit.state._phantomTarget });
}

// 幻影伪装：攻击后模仿对方单位。受击不重刷（闪避反击时保持暴露），只在自身攻击结算后重刷
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

// 开始攻击前卸下伪装（伪装不跨攻击生效）
function submitPhantomClearBeforeAttack(data, decl) {
    if (data.unit.name !== decl.name || !data.unit.alive) return;
    data.unit.state._phantomTarget = null;
}

// 攻击结算后重新伪装：命中/未命中都算攻击过；闪避走 ON_DODGE 不在此列
function submitPhantomRerollAfterAttack(data, decl) {
    if (data.unit.name !== decl.name || !data.unit.alive || !data.enemySide) return;
    rollPhantomDisguise(data.unit, data.enemySide);
}

function submitPhantomDisguiseTarget(data, decl) {
    if (data.unit.camp !== CAMP_TYPES.ALLY) return;
    const { unit, enemySide, declaration, allySide } = data;
    const chengkun = enemySide.find(u => u.name === decl.name && u.alive && u.state._phantomTarget);
    if (!chengkun) return;
    const isPhantomTarget = chengkun.state._phantomTarget === unit.uid;
    if (isPhantomTarget) {
        declaration.targetResult = chengkun;
        declaration.phantomFact = { factType: FACT_TYPES.PHANTOM_REVEAL, data: { unitName: unit.name, deceiver: chengkun.name, deceiverUid: chengkun.uid } };
        return;
    }
    const lostHpPct = (chengkun.maxHp - chengkun.hp) / chengkun.maxHp;
    const confuseChance = decl.baseChance + decl.per10pctLost * (lostHpPct * 10);
    if (getBattleRng().next() >= confuseChance) return;
    const phantomTarget = allySide.find(u => u.alive && !u.isHorse && !u.state._untargetable && u.uid === chengkun.state._phantomTarget && u.uid !== unit.uid);
    if (phantomTarget) {
        declaration.targetResult = phantomTarget;
        declaration.phantomFact = { factType: FACT_TYPES.PHANTOM_CONFUSE, data: { unitName: unit.name, deceiver: chengkun.name, targetName: phantomTarget.name } };
    }
}

registerElite('成昆', createChengKunComponent);
registerElite('鹿杖客', createLuZhangKeComponent);
registerElite('鹤笔翁', createHeBiWengComponent);
// 2026-10-08 搭档连线注册（core/11 特判收口）：玄冥二老配对知识住在英雄家
registerLinkPartners('鹿杖客', '鹤笔翁');
// 2026-10-14 core/15 迁移：两个机制改走 core/18 注册表（原先靠 core/15 本地安装器例外承接）
registerMechanicHandler(MECHANIC_TYPES.LINK_ATTACK, linkAttackHandler);
registerMechanicHandler(MECHANIC_TYPES.PHANTOM_DISGUISE, phantomDisguiseHandler);
