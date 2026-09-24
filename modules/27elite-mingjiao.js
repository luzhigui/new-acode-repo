// V6.3.0 | ~40300 bytes | 2026-09-24 召唤概率 30%；狮吼不再由引擎发信号，改由 render/39 锚在雄狮出手演出帧
export const VER = 'modules/27elite-mingjiao.js V6.3.0';

import { registerElite } from '../core/08-elite-registry.js';
import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { hasBuff, getZhangNearTaunt } from '../core/03battle-utils.js';
import { spawnHorse, spawnUnit } from '../core/05battle-horse.js';
import { applyHeroFlags } from '../core/02unit.js';
import { spiderTransform, spiderReturn } from '../modules/20elite-skills.js';
import { checkZhangSwitch, emitEvent, applyStatChange, refreshMaxHp, getBattleRng, addMod, removeModsByGroup, getStat } from '../core/13battle-shared.js';
import { eventBus, EXECUTION_LAYER as L, EFFECT_TYPES } from '../infra/50-event-bus.js';
import { StateMachine } from '../infra/51-core-utils.js';
import { FACT_TYPES, BUFF_TYPES, UNIT_EVENT_TYPES, CAMP_TYPES, ROLE_TYPES, SIGNAL_TYPES, STATE_CHANGE_TYPES } from '../infra/56-battle-enums.js';
import { emitStateChange } from '../infra/59-state-change.js';
import { watchUnit } from '../core/19unit-watch.js';

// 2026-09-02 定案：本文件的 FSM（张无忌/小昭·姊/小昭·妹）不做声明化、不搬表。
//   理由：有状态机的角色仅 3 个，转移规则在组件内一眼可见；声明化只能挪骨架、
//   动作仍须写 JS，收益不抵成本。保持组件内硬编码，此决定不再反复讨论。

// 张无忌
export function createZhangWujiComponent() {
    return {
        name: '张无忌',
        _buildFsm(zhang, A, log) {
            let fsm;
            const col = (zhang.pos - 1) % 3;
            const hasFrontAlly = A.some(c => c.alive && !c.isHorse && c.pos === 1 + col && c.uid !== zhang.uid);
            const states = {
                ranged: {
                    onEnter() { zhang.rangedForm = true; zhang.role = ROLE_TYPES.RANGED; Object.assign(zhang.state, { _zhangSwitched: false }); },
                    onExit() {}
                },
                switching: {
                    onEnter(data) {
                        // 必须用触发时刻的 log（data.log）：闭包 log 是回合开始已消费的旧数组，
                        // push 进去会随 makeStep 快照丢失（切换行/台词/弹幕全丢）
                        checkZhangSwitch(A, (data && data.log) || log);
                        if (fsm) fsm.transition('near');
                    },
                    onExit() {}
                },
                near: {
                    onEnter() { zhang.rangedForm = false; },
                    onExit() {}
                },
                ronghui: {
                    onEnter() {
                        zhang.ronghui = true;
                        const zt = getZhangNearTaunt(3);
                        if (zt) log.push({ factType: FACT_TYPES.ZHANG_TAUNT, data: { unitName: zhang.name, taunt: zt } });
                    },
                    onExit() {}
                }
            };
            const initial = (zhang._fsm && zhang._fsm.current) ? zhang._fsm.current : (hasFrontAlly ? 'ranged' : 'near');
            fsm = new StateMachine(states, initial, {
                ranged: ['switching'],
                switching: ['near'],
                near: ['ronghui'],
                ronghui: []
            });
            return fsm;
        },
        register(eventBus, A, B, log) {
            const zhang = A.find(u => u.isZhang && u.alive);
            if (!zhang) return;
            const fsm = this._buildFsm(zhang, A, log);
            zhang._fsm = fsm;
            const submitZhangJiuYangDeclaration = this.submitZhangJiuYangDeclaration;
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.JIUYANG, (data) => {
                if (data.unit.uid !== zhang.uid) return;
                submitZhangJiuYangDeclaration(data.unit, data.target, { dmg: data.dmg }, data.group, A, data.log, data);
            });
            // 前排切换判定：交给裁判。任何单位状态变化都会触发重判，条件翻转的瞬间切换。
            // 不再订阅死亡/换位/回合开始三个独立信号——那些漏发就 bug，且回合开始兜底违背实时切换语义。
            watchUnit(zhang, () => {
                // 条件：存活 + 尚未切换 + 处于远程形态 + 前排无人
                if (!zhang.alive || zhang.state._zhangSwitched || !fsm.is('ranged')) return false;
                const col = (zhang.pos - 1) % 3;
                const hasFrontAlly = A.some(c => c.alive && !c.isHorse && c.pos === 1 + col && c.uid !== zhang.uid);
                return !hasFrontAlly;
            }, (shouldSwitch, trigger) => {
                if (shouldSwitch && fsm.is('ranged')) {
                    fsm.transition('switching', { log: trigger && trigger.log });
                }
            });
        },
        submitZhangJiuYangDeclaration(unit, target, dmgCalc, group, A, log, data) {
            if (unit.camp !== CAMP_TYPES.ALLY || !unit.isZhang || !unit.alive) return;
            const fsm = unit._fsm;
            // ronghui 是 near 的融会贯通激活态：FSM 转入后仍需继续触发（第3次起每次攻击都有效）
            if (fsm && (fsm.is('near') || fsm.is('ronghui'))) {
                if (unit.nearAtkCount === 0 && !unit.state._zhangTauntDone) { const firstTaunt = getZhangNearTaunt(1); if (firstTaunt) { group.data.entries.push({ factType: FACT_TYPES.ZHANG_TAUNT, data: { unitName: unit.name, taunt: firstTaunt } }); Object.assign(unit.state, { _zhangTauntDone: true }); } }
                unit.nearAtkCount++;
                if (unit.nearAtkCount === 2) { const secondTaunt = getZhangNearTaunt(2); if (secondTaunt) group.data.entries.push({ factType: FACT_TYPES.ZHANG_TAUNT, data: { unitName: unit.name, taunt: secondTaunt } }); }
                if (unit.nearAtkCount >= 3) {
                    if (!fsm.is('ronghui')) fsm.transition('ronghui');
                    const extra = Math.floor(Math.abs(getStat(target, 'atk') - getStat(target, 'def')) * 0.5);
                    if (data && data.declarations) {
                        data.declarations.push({
                            type: EFFECT_TYPES.BONUS_DMG,
                            value: extra,
                            target: target,
                            logText: null
                        });
                    } else {
                        applyStatChange(target, 'hp', -extra, unit, '融会贯通');
                    }
                    group.data.entries.push({ factType: FACT_TYPES.RONG_HUI_BONUS, data: { unitName: unit.name, extra, targetAtk: Math.floor(getStat(target, 'atk')), targetDef: Math.floor(getStat(target, 'def')) } });
                }
            }
        }
    };
}

// 韦一笑
export function createWeiYixiaoComponent() {
    return {
        name: '韦一笑',
        register(eventBus, A, B, log) {
            const wei = A.find(u => u.isWei && u.alive);
            if (!wei) return;
            wei.state._neverMiss = true;

            // 韦一笑吸星：判定后推 WEI_HEAL 声明（纯函数）
            function submitWeiLeechDeclaration(data) {
                const { unit, target, reboundDmg, declarations } = data;
                if (!target.isWei || !target.alive) return;
                const s = getSkillParams('韦一笑', 'coldPalm');
                if (!s) throw new Error('缺技能参数: 韦一笑.coldPalm');
                const lostPct = (target.maxHp - target.hp) / target.maxHp;
                const leechRate = (s.leechMin + (s.leechMax - s.leechMin) * lostPct) / 100;
                const heal = Math.floor(reboundDmg * leechRate);
                const wasFullHp = (target.hp >= target.maxHp);
                const oldMaxHp = target.maxHp;
                const newMaxHp = Math.min(target.maxHp + heal, target.state._baseMaxHp * 2);
                declarations.push({
                    type: EFFECT_TYPES.WEI_HEAL,
                    data: { heal, newMaxHp, oldMaxHp, wasFullHp }
                });
            }
            eventBus.on(SIGNAL_TYPES.ON_DODGE, L.AFTER_DAMAGE_APPLIED.LEECH, (data) => {
                submitWeiLeechDeclaration(data);
            });
        }
    };
}

// 小昭·姊
export function createXiaoZhaoSisterComponent() {
    return {
        name: '小昭·姊',
        _buildFsm(sister, A, log) {
            const comp = this;
            const states = {
                normal: {
                    onEnter() {},
                    onExit() {}
                },
                attaching: {
                    onEnter(data) {
                        comp._executeAttach(sister, A, (data && data.log) ? data.log : log);
                    },
                    onExit() {}
                },
                attached: {
                    onEnter() {
                        sister.state._acted = true;
                        Object.assign(sister.state, { _untargetable: true });
                    },
                    onExit() {}
                },
                returning: {
                    onEnter(data) {
                        comp._executeReturn(sister, A, (data && data.log) ? data.log : log);
                    },
                    onExit() {}
                }
            };
            return new StateMachine(states, 'normal', {
                normal: ['attaching'],
                attaching: ['attached'],
                attached: ['returning'],
                returning: ['normal']
            });
        },
        register(eventBus, A, B, log) {
            const sister = A.find(u => u.isXiaoZhaoSister && u.alive && !u.state._stunned);
            if (!sister) return;
            const fsm = this._buildFsm(sister, A, log);
            sister._fsm = fsm;
            const comp = this;
            // 乾坤衍生：DMG_REDUCTION 走声明，hp/atk 直改并记账
            function submitXiaoZhaoQianKunDerivedDeclaration(data) {
                const xiaoZhao = A.find(u => u.isXiaoZhaoSister && u.alive && !u.state._stunned);
                if (!xiaoZhao) return;
                const zhang = A.find(u => u.isZhang && u.alive);
                if (zhang) return;
                const target = data.target;
                if (!target || target.camp !== CAMP_TYPES.ALLY) return;
                const atkStat = data.unit ? getStat(data.unit, 'atk') : 0;
                const defStat = getStat(target, 'def');
                const dmg = data.unit ? atkStat * (atkStat / (atkStat + defStat)) : 0;
                const s = getSkillParams('小昭', 'qianKunDerived');
                if (!s) throw new Error('缺技能参数: 小昭.qianKunDerived');
                const reduce = Math.max(1, Math.floor(dmg * defStat / s.defToReduce));
                if (!data.declarations) data.declarations = [];
                data.declarations.push({
                    type: EFFECT_TYPES.DMG_REDUCTION,
                    value: reduce,
                    source: xiaoZhao,
                    logText: null
                });
                const aliveAllies = A.filter(u => u.alive && !u.isHorse);
                if (aliveAllies.length > 0) {
                    const rng = getBattleRng();
                    const healTarget = aliveAllies[rng.nextInt(0, aliveAllies.length - 1)];
                    const heal = Math.max(1, Math.floor(getStat(healTarget, 'def') / s.defToHeal));
                    const atkTarget = aliveAllies[rng.nextInt(0, aliveAllies.length - 1)];
                    const atkGain = Math.max(1, Math.floor(getStat(atkTarget, 'def') / s.defToAtk));
                    applyStatChange(healTarget, 'hp', heal, xiaoZhao, '乾坤衍生治疗');
                    applyStatChange(atkTarget, 'atk', atkGain, xiaoZhao, '乾坤衍生加攻');
                    if (atkTarget.state._baseAtk !== undefined) atkTarget.state._baseAtk += atkGain;
                    // 记账随 beforeDamageCalc 事件 data 携带，由 12 calcFinalDamage 收入 dmgCalc 返回，不落 unit
                    if (!data._derivedEntries) data._derivedEntries = [];
                    data._derivedEntries.push({
                        factType: FACT_TYPES.QIAN_KUN_DERIVED,
                        data: {
                            targetName: target.name,
                            reduce,
                            healTargetName: healTarget.name,
                            heal,
                            atkTargetName: atkTarget.name,
                            atkGain,
                            healTargetUid: healTarget.uid,
                            atkTargetUid: atkTarget.uid
                        }
                    });
                }
            }
            eventBus.on(SIGNAL_TYPES.BEFORE_DAMAGE_CALC, L.BEFORE_DAMAGE_CALC.WARRIOR_BREAK, (data) => {
                submitXiaoZhaoQianKunDerivedDeclaration(data);
            });
            // 蝶变附身中跳过行动
            function submitButterflySkipDeclaration(data) {
                if (!data.unit.isXiaoZhaoSister || !data.unit.alive) return;
                if (fsm.is('attached')) {
                    data.declaration.skip = true;
                }
            }
            // 蝶变回归：回合结束飞回
            function submitButterflyReturnDeclaration(data) {
                const sis = A.find(u => u.isXiaoZhaoSister && u.alive && u.state._butterflyHost);
                if (!sis || !fsm.is('attached')) return;
                if (!data.declarations) data.declarations = [];
                data.declarations.push({ type: 'butterflyReturn', sister: sis, A, log: data.log });
            }
            eventBus.on(SIGNAL_TYPES.BEFORE_ACTION_SELECT, L.BEFORE_ACTION.BUTTERFLY_SKIP, (data) => {
                submitButterflySkipDeclaration(data);
            });
            eventBus.on(SIGNAL_TYPES.ON_ROUND_END, L.ROUND_END.BUTTERFLY_RETURN, (data) => {
                submitButterflyReturnDeclaration(data);
            });
        },
        _executeAttach(sister, A, log) {
            if (sister.state._butterflyHost) return null;
            const flyDirection = A._flyDirection || 'right';
            const order = flyDirection === 'left' ? [3,2,1,9,8,7,6,5] : [5,6,7,8,9,1,2,3];
            let host = null;
            for (const p of order) { const u = A.find(a => a.pos === p && a.alive && !a.isHorse && a.uid !== sister.uid); if (u) { host = u; break; } }
            if (!host) {
                applyStatChange(sister, 'hp', -sister.hp, null, '蝶变无宿主', false);
                log.push({ factType: FACT_TYPES.BUTTERFLY_NO_HOST, data: { unitName: sister.name } });
                return null;
            }
            const atkRatio = flyDirection === 'left' ? 0 : 1/2;
            const defRatio = flyDirection === 'left' ? 1/2 : 0;
            const hpRatio = 1/2;
            const atkTransfer = Math.floor(sister.state._baseAtk * atkRatio);
            const defTransfer = Math.floor(sister.state._baseDef * defRatio);
            const hpTransfer = Math.floor(sister.hp * hpRatio);
            Object.assign(sister.state, { _butterflyHpTransfer: hpTransfer });
            addMod(host, 'atk', { source: '蝶变附身', value: atkTransfer, ttl: 'attached', group: 'butterfly', op: 'add' });
            addMod(host, 'def', { source: '蝶变附身', value: defTransfer, ttl: 'attached', group: 'butterfly', op: 'add' });
            addMod(host, 'maxHp', { source: '蝶变附身', value: hpTransfer, ttl: 'attached', group: 'butterfly', op: 'add' });
            refreshMaxHp(host, sister, '蝶变附身血上限');
            emitEvent(host, UNIT_EVENT_TYPES.HP_CHANGE, { hp:host.hp, maxHp:host.maxHp, alive:host.alive, atk:getStat(host, 'atk'), def:getStat(host, 'def'), _phantomTarget:sister.uid });
            const aliveAllies = A.filter(a => a.alive && !a.isHorse && a.uid !== sister.uid);
            const totalHp = aliveAllies.reduce((sum,a) => sum + a.hp, 0); const totalMaxHp = aliveAllies.reduce((sum,a) => sum + a.maxHp, 0);
            if (totalMaxHp > 0) {
                const newHp = Math.floor(sister.maxHp * (totalHp/totalMaxHp));
                const delta = newHp - sister.hp;
                applyStatChange(sister, 'hp', delta, null, '蝶变附身血量', false);
            }
            // 必须同时写 state 的 _flyMode，renderGrid 只读 unit.state._flyMode，
            //   否则原地格子不消失，仍显示完整单位（和飞撞残留蓝色格子同根因）。
            Object.assign(sister.state, { _butterflyHost: host.uid, _flyMode: 'butterfly' });
            sister._fsm.transition('attached');
            emitEvent(sister, UNIT_EVENT_TYPES.HP_CHANGE, { hp:sister.hp, maxHp:sister.maxHp, alive:sister.alive, atk:sister.atk, def:sister.def, _flyMode:'butterfly', _butterflyHost:sister.state._butterflyHost });
            log.push({
                factType: FACT_TYPES.BUTTERFLY_ATTACH,
                data: {
                    sisterName: sister.name,
                    sisterUid: sister.uid,
                    hostName: host.name,
                    hostUid: host.uid,
                    flyDirection,
                    atkTransfer,
                    defTransfer,
                    hpTransfer
                }
            });
            emitStateChange(sister, STATE_CHANGE_TYPES.ATTACHED, { hostUid: host.uid }, log);
            return sister;
        },
        _executeReturn(sister, A, log) {
            if (!sister.alive || !sister.state._butterflyHost) return;
            const host = A.find(u => u.uid === sister.state._butterflyHost && u.alive);
            if (!host || !host.alive) {
                const allAllies = A.filter(a => !a.isHorse && a.uid !== sister.uid);
                const totalHp = allAllies.reduce((sum, a) => sum + (a.alive ? a.hp : 0), 0);
                const totalMaxHp = allAllies.reduce((sum, a) => sum + a.maxHp, 0);
                if (totalMaxHp > 0) {
                    const newHp = Math.floor(sister.maxHp * (totalHp / totalMaxHp));
                    const delta = newHp - sister.hp;
                    applyStatChange(sister, 'hp', delta, null, '蝶变飞回血量', false);
                } else {
                    applyStatChange(sister, 'hp', -sister.hp, null, '蝶变飞回无队友', false);
                }
                Object.assign(sister.state, { _flyMode: null, _untargetable: false, _butterflyHost: null });
                Object.assign(sister.state, { _butterflyHpTransfer: 0 });
                sister._fsm.transition('normal');
                emitStateChange(sister, STATE_CHANGE_TYPES.RETURNED, { hostDead: true }, log);
                log.push({ factType: FACT_TYPES.BUTTERFLY_HOST_DEAD, data: { sisterName: sister.name, isDead: !sister.alive, sisterUid: sister.uid } });
                return;
            }
            const allAllies = A.filter(a => !a.isHorse && a.uid !== sister.uid);
            const totalHp = allAllies.reduce((sum, a) => sum + (a.alive ? a.hp : 0), 0);
            const totalMaxHp = allAllies.reduce((sum, a) => sum + a.maxHp, 0);
            if (totalMaxHp > 0) {
                const newHp = Math.floor(sister.maxHp * (totalHp / totalMaxHp));
                const delta = newHp - sister.hp;
                applyStatChange(sister, 'hp', delta, null, '蝶变飞回血量', false);
            } else {
                applyStatChange(sister, 'hp', -sister.hp, null, '蝶变飞回无队友', false);
            }
            applyStatChange(sister, 'atk', sister.state._baseAtk - sister.atk, null, '蝶变飞回重置攻');
            applyStatChange(sister, 'def', sister.state._baseDef - sister.def, null, '蝶变飞回重置防');
            if (host && host.alive) {
                removeModsByGroup(host, 'butterfly');
                refreshMaxHp(host, sister, '蝶变飞回血上限');
                emitEvent(host, UNIT_EVENT_TYPES.HP_CHANGE, {
                    hp: host.hp, maxHp: host.maxHp, alive: host.alive,
                    atk: host.atk, def: host.def
                });
            }
            Object.assign(sister.state, { _flyMode: null, _butterflyHost: null });
            Object.assign(sister.state, { _butterflyHpTransfer: 0 });
            if (!A.find(a => a.uid === sister.uid)) {
                A.push(sister);
            }
            sister._fsm.transition('normal');
            emitEvent(sister, UNIT_EVENT_TYPES.HP_CHANGE, {
                hp: sister.hp, maxHp: sister.maxHp, alive: sister.alive,
                atk: sister.atk, def: sister.def, _flyMode: null, _butterflyHost: null
            });
            log.push({
                factType: FACT_TYPES.BUTTERFLY_RETURN,
                data: {
                    sisterName: sister.name,
                    sisterUid: sister.uid,
                    hostName: host ? host.name : '宿主',
                    hostUid: host ? host.uid : null,
                    sisterAtk: sister.atk,
                    sisterDef: sister.def,
                    sisterHp: sister.hp
                }
            });
            emitStateChange(sister, STATE_CHANGE_TYPES.RETURNED, {}, log);
        },
        executeAttach(A, log) {
            let sister = A.find(u => u.isXiaoZhaoSister && u.alive && u.pos === 4 && !u.state._stunned);
            if (!sister) sister = A.find(u => u.isXiaoZhaoSister && u.alive && !u.state._stunned);
            if (!sister || sister.state._butterflyHost) return null;
            const fsm = sister._fsm;
            if (fsm && fsm.is('normal')) fsm.transition('attaching', { log });
            return sister;
        },
        executeReturn(sister, A, log) {
            if (!sister.alive || !sister.state._butterflyHost) return;
            const fsm = sister._fsm;
            if (fsm && fsm.is('attached')) fsm.transition('returning', { log });
        },
    };
}

// 小昭·妹
export function createXiaoZhaoBrotherComponent() {
    return {
        name: '小昭·妹',
        _buildFsm(brother, A, B, log) {
            const comp = this;
            const states = {
                normal: {
                    onEnter() {},
                    onExit() {}
                },
                transforming: {
                    onEnter() {
                        spiderTransform(brother, log);
                    },
                    onExit() {}
                },
                flying: {
                    onEnter(data) {
                        const currentLog = (data && data.log) ? data.log : log;
                        let reason = data ? data.reason : '';
                        const incomingDmg = data ? data.incomingDmg : 0;
                        if (!brother.state._spiderTriggered70 && brother.hp > brother.maxHp * 0.7) {
                            Object.assign(brother.state, { _spiderTriggered70: true });
                            reason = reason || '血量即将低于70%';
                        } else if (!brother.state._spiderTriggered40 && brother.hp > brother.maxHp * 0.4) {
                            Object.assign(brother.state, { _spiderTriggered40: true });
                            reason = reason || '血量即将低于40%';
                        } else if (!brother.state._spiderTriggeredDeath) {
                            Object.assign(brother.state, { _spiderTriggeredDeath: true });
                            reason = reason || '即将阵亡';
                        }
                        Object.assign(brother.state, { _spiderTriggeredThisRound: true });
                        const esRemaining = brother.state._spiderRemaining;
                        Object.assign(brother.state, { _spiderRemaining: Math.max(0, (esRemaining ?? 3) - 1) });
                        Object.assign(brother.state, { _spiderFlying: true, _flyMode: 'spider' });
                        brother.state._acted = true;
                        emitEvent(brother, UNIT_EVENT_TYPES.HP_CHANGE, { hp:brother.hp, maxHp:brother.maxHp, alive:brother.alive, atk:brother.atk, def:brother.def, _flyMode:'spider', _spiderFlying:true });
                        emitStateChange(brother, STATE_CHANGE_TYPES.FLYING, { reason, incomingDmg }, currentLog);
                        // 飞天事实随 transition data 携带（不落 unit），由免疫声明/log 消费
                        data._flyFactData = { unitName: brother.name, spiderUid: brother.uid, reason, incomingDmg, remaining: brother.state._spiderRemaining };
                    },
                    onExit() {
                        Object.assign(brother.state, { _spiderFlying: false, _flyMode: null });
                        brother.state._acted = false;
                    }
                },
                descending: {
                    onEnter(data) {
                        spiderReturn(brother, A, B, (data && data.log) ? data.log : log);
                    },
                    onExit() {}
                },
                dead: {
                    onEnter() {},
                    onExit() {}
                }
            };
            return new StateMachine(states, 'normal', {
                normal: ['flying', 'transforming'],
                transforming: ['normal'],
                flying: ['descending'],
                descending: ['normal'],
                dead: []
            });
        },
        register(eventBus, A, B, log) {
            const brother = A.find(u => u.isXiaoZhaoBrother && u.alive);
            if (!brother) return;
            const fsm = this._buildFsm(brother, A, B, log);
            brother._fsm = fsm;
            // 蛛化飞天免疫：血量阈值触发，免疫本次伤害
            function submitSpiderFlyDeclaration(data) {
                if (data.target.uid !== brother.uid || !data.A) return;
                if (fsm.is('flying') || fsm.is('dead')) return;
                const maxHp = brother.maxHp;
                const hpAfter = Math.max(0, brother.hp - (data.dmg || 0));
                let shouldFly = false;
                let reason = '';
                if (!brother.state._spiderTriggered70 && brother.hp > maxHp * 0.7 && hpAfter <= maxHp * 0.7) {
                    shouldFly = true; reason = '血量即将低于70%';
                } else if (!brother.state._spiderTriggered40 && brother.hp > maxHp * 0.4 && hpAfter <= maxHp * 0.4) {
                    shouldFly = true; reason = '血量即将低于40%';
                } else if (!brother.state._spiderTriggeredDeath && hpAfter <= 0) {
                    shouldFly = true; reason = '即将阵亡';
                }
                if (shouldFly) {
                    if (!data.declarations) data.declarations = [];
                    const flyData = { reason, incomingDmg: data.dmg, log: data.log || log };
                    fsm.transition('flying', flyData);
                    data.declarations.push({ immune: true, flyData: flyData._flyFactData || null, reason: flyData._flyFactData ? null : '🕷️ 飞天：免疫本次伤害' });
                }
            }
            eventBus.on(SIGNAL_TYPES.BEFORE_DAMAGE_APPLY, L.BEFORE_DAMAGE_APPLY.SPIDER_IMMUNE, (data) => {
                submitSpiderFlyDeclaration(data);
            });
            // 飞天状态跳过行动
            function submitSpiderSkipDeclaration(data) {
                if (!data.unit.isXiaoZhaoBrother || !data.unit.alive) return;
                if (fsm.is('flying') || fsm.is('dead')) {
                    data.declaration.skip = true;
                }
            }
            // 永久惑心：小昭·妹在场时敌方攻击 15% 概率误伤
            function submitSpiderMindControlDeclaration(data) {
                if (data.unit.camp !== CAMP_TYPES.ENEMY) return;
                if (!brother || !brother.alive || !brother.state._permanentBuffs || !brother.state._permanentBuffs.some(b => b.key === BUFF_TYPES.MIND_CONTROL)) return;
                if (hasBuff(data.enemySide._activeBuffs, BUFF_TYPES.MIND_CONTROL)) return;
                if (getBattleRng().next() < 0.15) {
                    const fakeTarget = data.allySide.find(u => u.alive && !u.isHorse && u.uid !== data.unit.uid);
                    if (fakeTarget) {
                        data.declaration.targetResult = fakeTarget;
                        data.declaration.phantomFact = { factType: FACT_TYPES.PHANTOM_CONFUSE, data: { unitName: data.unit.name, deceiver: '小昭·妹', targetName: fakeTarget.name } };
                    }
                }
            }
            // 蛛落：回合结束从天而降并攻击
            function submitSpiderDescendDeclaration(data) {
                const bro = A.find(u => u.isXiaoZhaoBrother && u.alive && u.state._spiderFlying);
                if (bro && bro._fsm && bro._fsm.is('flying')) {
                    if (!data.declarations) data.declarations = [];
                    data.declarations.push({ type: 'spiderDescend', unit: bro, A, B, log: data.log });
                }
            }
            // 蛛变：每回合随机变职业并结算永久海克斯
            function submitSpiderTransformDeclaration(data) {
                const { A, B, log } = data;
                const bro = A.find(u => u.isXiaoZhaoBrother && u.alive);
                if (!bro) return;
                if (bro._fsm && bro._fsm.is('normal')) bro._fsm.transition('transforming');
                if (bro._fsm && bro._fsm.is('transforming')) bro._fsm.transition('normal');
                if (bro.state._spiderTriggeredHit === undefined) Object.assign(bro.state, { _spiderTriggeredHit: false });
                if (bro.state._spiderTriggered70 === undefined) Object.assign(bro.state, { _spiderTriggered70: false });
                if (bro.state._spiderTriggered40 === undefined) Object.assign(bro.state, { _spiderTriggered40: false });
                Object.assign(bro.state, { _spiderTriggeredThisRound: false });
                const teamHasHorse = hasBuff(A._activeBuffs, BUFF_TYPES.HORSE_FORMATION);
                const hasPermanent = bro.state._permanentBuffs?.some(b => b.key === BUFF_TYPES.HORSE_FORMATION);
                if (!teamHasHorse && hasPermanent) {
                    const xzHorse = spawnHorse(A, log, B, true);
                    if (xzHorse) {
                        log.push({ factType: FACT_TYPES.XIAO_ZHAO_HORSE, data: { pos: xzHorse.pos, horseUid: xzHorse.uid } });
                    }
                }
                const hasTeamCarry = hasBuff(A._activeBuffs, BUFF_TYPES.CARRY);
                if (!hasTeamCarry && bro.state._permanentBuffs?.some(b => b.key === BUFF_TYPES.CARRY) && bro.state._baseMaxHp !== undefined) {
                    addMod(bro, 'atk', { source: '小昭·妹永久carry', value: 3, ttl: 'permanent', group: 'xiaoZhaoCarry', op: 'add' });
                    addMod(bro, 'def', { source: '小昭·妹永久carry', value: 4, ttl: 'permanent', group: 'xiaoZhaoCarry', op: 'add' });
                    addMod(bro, 'maxHp', { source: '小昭·妹永久carry', value: 20, ttl: 'permanent', group: 'xiaoZhaoCarry', op: 'add' });
                    refreshMaxHp(bro, null, '小昭·妹永久carry');
                }
            }
            // 永久双击：小昭·妹 80% 概率额外攻击一次
            function submitXiaoZhaoDoubleStrikeDeclaration(data) {
                const { unit, target, log } = data;
                if (!unit.isXiaoZhaoBrother || !unit.alive || unit.state._xiaoZhaoDoubleStriked) return;
                if (!unit.state._permanentBuffs || !unit.state._permanentBuffs.some(b => b.key === BUFF_TYPES.DOUBLE_STRIKE)) return;
                if (hasBuff(A._activeBuffs, BUFF_TYPES.DOUBLE_STRIKE)) return;
                const s = getSkillParams('小昭', 'spiderFly');
                if (!s) throw new Error('缺技能参数: 小昭.spiderFly');
                const chance = s.xiaoZhaoDoubleStrikeChance;
                if (getBattleRng().nextInt(1, 100) <= chance) {
                    Object.assign(unit.state, { _xiaoZhaoDoubleStriked: true });
                    log.push({ factType: FACT_TYPES.SPIDER_DOUBLE_STRIKE, data: {} });
                    if (!data.extraRequests) data.extraRequests = [];
                    data.extraRequests.push({
                        unit,
                        // 2026-09-22 同 doubleStrike：原目标同击致死后 alive 仍 true，须连 _pendingDeath 一起判，
                        //   否则把待死 uid 锁给第二次攻击 → 白跳
                        targetUid: (target && target.alive && !target.state._pendingDeath) ? target.uid : null,
                        reason: 'xiaoZhaoDoubleMiss',
                        actedMode: 'allow',
                        priority: 30
                    });
                }
            }
            eventBus.on(SIGNAL_TYPES.BEFORE_ACTION_SELECT, L.BEFORE_ACTION.SPIDER_SKIP, (data) => {
                submitSpiderSkipDeclaration(data);
            });
            eventBus.on(SIGNAL_TYPES.BEFORE_SELECT_TARGET, L.BEFORE_SELECT_TARGET.PERMANENT_MIND_CONTROL, (data) => {
                submitSpiderMindControlDeclaration(data);
            });
            eventBus.on(SIGNAL_TYPES.ON_ROUND_END, L.ROUND_END.SPIDER_RETURN, (data) => {
                submitSpiderDescendDeclaration(data);
            });
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, L.ROUND_START.SPIDER_TRANSFORM, (data) => {
                submitSpiderTransformDeclaration(data);
            });
            eventBus.on(SIGNAL_TYPES.AFTER_MISS, L.AFTER_MISS.PERMANENT_DOUBLE_RETRY, (data) => {
                submitXiaoZhaoDoubleStrikeDeclaration(data);
            });
        },
        executeFly(unit, incomingDmg, A, log) {
            if (!unit.isXiaoZhaoBrother || !unit.alive) return false;
            const fsm = unit._fsm;
            if (!fsm || !fsm.is('normal')) return false;
            const maxHp = unit.maxHp;
            const hpAfter = Math.max(0, unit.hp - (incomingDmg || 0));
            let reason = '';
            if (!unit.state._spiderTriggered70 && unit.hp > maxHp * 0.7 && hpAfter <= maxHp * 0.7) {
                reason = '血量即将低于70%';
            } else if (!unit.state._spiderTriggered40 && unit.hp > maxHp * 0.4 && hpAfter <= maxHp * 0.4) {
                reason = '血量即将低于40%';
            } else if (!unit.state._spiderTriggeredDeath && hpAfter <= 0) {
                reason = '即将阵亡';
            }
            if (!reason) return false;
            const flyData = { reason, incomingDmg, log };
            fsm.transition('flying', flyData);
            if (flyData._flyFactData && log) {
                log.push({ factType: FACT_TYPES.SPIDER_FLY, data: flyData._flyFactData });
            }
            return true;
        },
        executeDescend(unit, A, B, log) {
            const fsm = unit._fsm;
            if (fsm && fsm.is('flying')) {
                fsm.transition('descending', { log });
                if (fsm.is('descending')) fsm.transition('normal');
            }
        },
        onAfterApplyDamage(unit) {
            if (!unit.isXiaoZhaoBrother || !unit.alive) return;
        }
    };
}

// 金毛狮王谢逊（明教 · 站 7 号位）：召唤幼狮 / 幼狮成长 / 雄狮振奋 / 母狮随动
// 2026-09-22 新增；2026-09-23 改版：删「替死 / 集火 / 狮吼」，狮子改为一条成长链——
//   召唤幼狮 → ON_ROUND_START 每回合 prob 概率随机空位 1 只（攻=0 故打不出伤害，轮到它走休息通道回血；
//               被振奋抬到攻>0 后会正常出手，职业是防战 → core/12 走防战公式）
//   幼狮成长 → ON_ROUND_START 上一回合留下的幼狮按所在位置成形（1-6 雄狮 / 7-9 母狮）
//   雄狮振奋 → AFTER_DAMAGE_APPLIED：雄狮命中后，己方全体存活角色永久 +atkPerHit 攻
//   母狮随动 → AFTER_DAMAGE_APPLIED：母狮命中后，其他雄狮/母狮与谢逊各随动攻击一次（目标同母狮）
export function createXieXunComponent() {
    return {
        name: '金毛狮王谢逊',
        register(eventBus, A, B, log) {
            // 不写死阵营：按身份标记在两侧找，谢逊换边也照样生效
            const xiexun = [...A, ...B].find(u => u.isXieXun && u.alive);
            if (!xiexun) return;
            const myTeam = xiexun.camp === CAMP_TYPES.ALLY ? A : B;

            const summon = getSkillParams('金毛狮王谢逊', 'summonLion');
            if (!summon) throw new Error('缺技能参数: 金毛狮王谢逊.summonLion');
            const inspire = getSkillParams('金毛狮王谢逊', 'lionInspire');
            if (!inspire) throw new Error('缺技能参数: 金毛狮王谢逊.lionInspire');
            if (!getSkillParams('金毛狮王谢逊', 'lionFollow')) throw new Error('缺技能参数: 金毛狮王谢逊.lionFollow');

            function pushInfo(data, text) {
                if (data && data.group && data.group.data && data.group.data.entries) {
                    data.group.data.entries.push({ type: 'info', text });
                }
            }

            // ① 成长：上一回合留下的幼狮，本回合开始按所在位置成形（1-6 雄狮 / 7-9 母狮）。
            //    必须排在召唤之前（LION_GROW 15 < XIE_SUMMON 16），否则刚召出来的幼狮会在同一次回合开始里立刻长大。
            //    2026-09-23 成长加概率：每只幼狮独立掷 grow.prob（默认1=必定成长），未中则保持幼狮下回合再判定。
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, L.ROUND_START.LION_GROW, (data) => {
                const cubs = myTeam.filter(u => u.isLionCub && u.alive && u.pos);
                const growRng = getBattleRng();
                for (const cub of cubs) {
                    if (growRng.next() >= (summon.grow.prob ?? 1)) continue;
                    const spec = cub.pos <= (summon.grow.frontMax || 6) ? summon.grow.front : summon.grow.back;
                    // 属性只算不存：成长差值登记为永久词条；maxHp 另走 refreshMaxHp 同步（上限升则当前血等量加）
                    addMod(cub, 'atk', { source: '幼狮成长', value: spec.atk - summon.cub.atk, ttl: 'permanent', group: 'lionGrow', op: 'add' });
                    addMod(cub, 'def', { source: '幼狮成长', value: spec.def - summon.cub.def, ttl: 'permanent', group: 'lionGrow', op: 'add' });
                    addMod(cub, 'maxHp', { source: '幼狮成长', value: spec.maxHp - summon.cub.maxHp, ttl: 'permanent', group: 'lionGrow', op: 'add' });
                    refreshMaxHp(cub, null, '幼狮成长');
                    cub.name = spec.name;
                    cub.role = spec.role;
                    applyHeroFlags(cub);       // 按新名字补 isLionMale / isLioness
                    cub.isLionCub = false;     // 形态标记互斥，旧形态显式清掉
                    emitEvent(cub, UNIT_EVENT_TYPES.HP_CHANGE, { hp: cub.hp, maxHp: cub.maxHp, alive: cub.alive, role: cub.role, atk: getStat(cub, 'atk'), def: getStat(cub, 'def') });
                    if (data && data.log) {
                        data.log.push({ factType: FACT_TYPES.LION_GROW, data: { name: spec.name, pos: cub.pos, atk: spec.atk, def: spec.def, maxHp: spec.maxHp } });
                    }
                }
            });

            // ② 召唤：每回合开始 prob 概率，在随机空位召唤 1 只幼狮（落点随机 → 成长方向随机；无空位则不召）
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, L.ROUND_START.XIE_SUMMON, (data) => {
                if (!xiexun.alive) return;
                const rng = getBattleRng();
                if (rng.next() >= (summon.prob ?? 0.5)) return;
                const occupied = new Set(myTeam.filter(u => u.alive).map(u => u.pos));
                const free = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(p => !occupied.has(p));
                if (free.length === 0) return;
                const pos = free[rng.nextInt(0, free.length - 1)];
                const cub = spawnUnit(myTeam, summon.cub.name, summon.cub.m, summon.cub.role, pos,
                    { atk: summon.cub.atk, def: summon.cub.def, maxHp: summon.cub.maxHp });
                if (data && data.log) {
                    data.log.push({ factType: FACT_TYPES.SUMMON_UNIT, data: { summonName: cub.name, summonUid: cub.uid, pos, byName: xiexun.name } });
                }
            });

            // ③ 雄狮·振奋：雄狮命中后，己方全体存活角色（含雄狮自己、谢逊、幼狮）永久 +atkPerHit 攻。
            //    走 addMod 登记永久词条，getStat 现算，不直改 unit.atk。
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.LION_INSPIRE, (data) => {
                const lion = data.unit;
                if (!lion || !lion.isLionMale || !lion.alive) return;
                if (!data.dmg || data.dmg <= 0) return;
                const gain = inspire.atkPerHit;
                const targets = myTeam.filter(u => u.alive);
                if (targets.length === 0) return;
                for (const t of targets) {
                    addMod(t, 'atk', { source: '振奋', value: gain, ttl: 'permanent', group: 'lionInspire', op: 'add' });
                    emitEvent(t, UNIT_EVENT_TYPES.HP_CHANGE, { hp: t.hp, maxHp: t.maxHp, alive: t.alive, atk: getStat(t, 'atk'), def: getStat(t, 'def') });
                }
                // 2026-09-24 狮吼演出改由表现层发：引擎在「生成步」时就 emit 会让吼抢在画面前面
                //   （随动出手的演出被 isLinkAttack 延后 1400ms、苦练延后 1200ms），看起来像「母狮出手反而吼」。
                //   现由 render/39 的 ATTACK 演出在雄狮真正出手的那一帧发 LION_ROAR + ATK_BUFF_FLOAT。
                pushInfo(data, `<span class="gold">🦁 雄狮振奋！己方全体攻击力 +${gain}</span>`);
            });

            // ④ 母狮·随动：母狮命中后，其他雄狮/母狮与谢逊各随动攻击一次，打母狮同一个目标。
            //    走 extraRequests（core/10 只在 doubleStrike 判遮挡），因此「无论是否被遮挡」都能出手；
            //    reason:'lionFollow' 会被 core/10 置 _isLinkAttack，随动自身不会再触发一次随动（防乒乓）。
            //    目标已阵亡 / 待死 → 整条随动取消。
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.LION_FOLLOW, (data) => {
                const lioness = data.unit;
                if (!lioness || !lioness.isLioness || !lioness.alive) return;
                if (lioness.state._isLinkAttack) return;
                if (!data.dmg || data.dmg <= 0) return;
                const target = data.target;
                if (!target || !target.alive || target.state._pendingDeath) return;
                const mates = myTeam.filter(u => u.alive && u.uid !== lioness.uid && !u.isLionCub && (u.isLionMale || u.isLioness || u.isXieXun));
                if (mates.length === 0) return;
                if (!data.extraRequests) data.extraRequests = [];
                for (const m of mates) {
                    data.extraRequests.push({
                        unit: m,
                        targetUid: target.uid,
                        reason: 'lionFollow',
                        actedMode: 'restore',
                        actedSnapshot: m.state._acted,
                        priority: 44
                    });
                }
                pushInfo(data, `<span class="gold">🦁 母狮长啸！${mates.map(m => m.name).join('、')} 随动出击！</span>`);
            });
        }
    };
}

registerElite('张无忌', createZhangWujiComponent);
registerElite('韦一笑', createWeiYixiaoComponent);
registerElite('小昭·姊', createXiaoZhaoSisterComponent);
registerElite('小昭·妹', createXiaoZhaoBrotherComponent);
registerElite('金毛狮王谢逊', createXieXunComponent);