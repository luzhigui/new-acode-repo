// modules/27elite-mingjiao.js - 明教精英组件合集
// V5.7.0 | ~31800 bytes| 2026-08-24 拆除 ELITE_SKILLS/本地台词硬编码兜底：统一 getSkillParams + gameData.taunts
export const VER = 'modules/27elite-mingjiao.js V5.7.0';

import { registerElite } from '../core/08-elite-registry.js';
import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { hasBuff, getZhangNearTaunt } from '../core/03battle-utils.js';
import { spawnHorse } from '../core/05battle-horse.js';
import { spiderTransform, spiderReturn } from '../modules/20elite-skills.js';
import { checkZhangSwitch, emitEvent, applyStatChange, applyMaxHpChange, getBattleRng } from '../core/13battle-shared.js';
import { eventBus, EXECUTION_LAYER as L, EFFECT_TYPES } from '../infra/50-event-bus.js';
import { registerDodgeRule } from '../core/12battle-attack-steps.js';
import { StateMachine } from '../infra/51-core-utils.js';
import { getEliteState, setEliteState } from '../core/18-elite-state.js';
import { FACT_TYPES, BUFF_TYPES, UNIT_EVENT_TYPES, CAMP_TYPES, ROLE_TYPES, SIGNAL_TYPES } from '../infra/56-battle-enums.js';

// ==================== 张无忌 ====================
export function createZhangWujiComponent() {
    return {
        name: '张无忌',
        _buildFsm(zhang, A, log) {
            let fsm;
            const col = (zhang.pos - 1) % 3;
            const hasFrontAlly = A.some(c => c.alive && !c.isHorse && c.pos === 1 + col && c.uid !== zhang.uid);
            const states = {
                ranged: {
                    onEnter() { zhang.rangedForm = true; zhang.role = ROLE_TYPES.RANGED; setEliteState(zhang.uid, { _zhangSwitched: false }); },
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
            // FSM 切换判定保留事件路（状态机迁移非数值结算）
            function submitZhangRangeCheckDeclaration(data) {
                if (zhang && zhang.alive && !getEliteState(zhang.uid)._zhangSwitched && fsm.is('ranged')) {
                    const col = (zhang.pos - 1) % 3;
                    const hasFrontAlly = A.some(c => c.alive && !c.isHorse && c.pos === 1 + col && c.uid !== zhang.uid);
                    if (!hasFrontAlly) fsm.transition('switching');
                }
            }
            function submitZhangSwitchOnDeathDeclaration(data) {
                if (zhang && zhang.alive && !getEliteState(zhang.uid)._zhangSwitched && fsm.is('ranged')) {
                    const col = (zhang.pos - 1) % 3;
                    const hasFrontAlly = A.some(c => c.alive && !c.isHorse && c.pos === 1 + col && c.uid !== zhang.uid);
                    if (!hasFrontAlly) fsm.transition('switching', { log: data && data.log });
                }
            }
            function submitZhangSwitchOnSwapDeclaration(data) {
                if (zhang && zhang.alive && !getEliteState(zhang.uid)._zhangSwitched && fsm.is('ranged')) {
                    const col = (zhang.pos - 1) % 3;
                    const hasFrontAlly = A.some(c => c.alive && !c.isHorse && c.pos === 1 + col && c.uid !== zhang.uid);
                    if (!hasFrontAlly) fsm.transition('switching', { log: data && data.log });
                }
            }
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, L.ROUND_START.RANGE_CHECK, (data) => {
                submitZhangRangeCheckDeclaration(data);
            });
            eventBus.on(SIGNAL_TYPES.ON_UNIT_DEATH, L.ON_UNIT_DEATH.SWITCH, (data) => {
                submitZhangSwitchOnDeathDeclaration(data);
            });
            eventBus.on(SIGNAL_TYPES.ON_POSITION_SWAP, L.ON_POSITION_SWAP.SWITCH, (data) => {
                submitZhangSwitchOnSwapDeclaration(data);
            });
        },
        submitZhangJiuYangDeclaration(unit, target, dmgCalc, group, A, log, data) {
            if (unit.camp !== CAMP_TYPES.ALLY || !unit.isZhang || !unit.alive) return;
            const fsm = unit._fsm;
            // ronghui 是 near 的融会贯通激活态：FSM 转入后仍需继续触发（第3次起每次攻击都有效）
            if (fsm && (fsm.is('near') || fsm.is('ronghui'))) {
                if (unit.nearAtkCount === 0 && !getEliteState(unit.uid)._zhangTauntDone) { const firstTaunt = getZhangNearTaunt(1); if (firstTaunt) { group.data.entries.push({ factType: FACT_TYPES.ZHANG_TAUNT, data: { unitName: unit.name, taunt: firstTaunt } }); setEliteState(unit.uid, { _zhangTauntDone: true }); } }
                unit.nearAtkCount++;
                if (unit.nearAtkCount === 2) { const secondTaunt = getZhangNearTaunt(2); if (secondTaunt) group.data.entries.push({ factType: FACT_TYPES.ZHANG_TAUNT, data: { unitName: unit.name, taunt: secondTaunt } }); }
                if (unit.nearAtkCount >= 3) {
                    if (!fsm.is('ronghui')) fsm.transition('ronghui');
                    const extra = Math.floor(Math.abs(target.atk - target.def) * 0.5);
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
                    group.data.entries.push({ factType: FACT_TYPES.RONG_HUI_BONUS, data: { unitName: unit.name, extra, targetAtk: Math.floor(target.atk), targetDef: Math.floor(target.def) } });
                }
            }
        }
    };
}

// ==================== 韦一笑 ====================
export function createWeiYixiaoComponent() {
    return {
        name: '韦一笑',
        register(eventBus, A, B, log) {
            const wei = A.find(u => u.isWei && u.alive);
            if (!wei) return;

            // 韦一笑吸星：判定 + WEI_HEAL 声明提交（纯函数，事件监听器薄壳转调）
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
                const newMaxHp = Math.min(target.maxHp + heal, target._baseMaxHp * 2);
                declarations.push({
                    type: EFFECT_TYPES.WEI_HEAL,
                    data: { heal, newMaxHp, oldMaxHp, wasFullHp }
                });
            }
            eventBus.on(SIGNAL_TYPES.ON_DODGE, L.AFTER_DAMAGE_APPLIED.LEECH, (data) => {
                submitWeiLeechDeclaration(data);
            });

            registerDodgeRule((unit, attacker) => {
                if (!unit.isWei || !unit.alive) return 0;
                return CONFIG.BASE_DODGE_FLY;
            });
        }
    };
}

// ==================== 小昭·姊 ====================
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
                        setEliteState(sister.uid, { _untargetable: true });
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
            // 乾坤衍生：DMG_REDUCTION 已推声明；hp/atk 直改 + _baseAtk/_pendingDerivedEntries 记账链保留事件路（无同时机声明路径）
            function submitXiaoZhaoQianKunDerivedDeclaration(data) {
                const xiaoZhao = A.find(u => u.isXiaoZhaoSister && u.alive && !u.state._stunned);
                if (!xiaoZhao) return;
                const zhang = A.find(u => u.isZhang && u.alive);
                if (zhang) return;
                const target = data.target;
                if (!target || target.camp !== CAMP_TYPES.ALLY) return;
                const dmg = data.unit ? data.unit.atk * (data.unit.atk / (data.unit.atk + target.def)) : 0;
                const s = getSkillParams('小昭', 'qianKunDerived');
                if (!s) throw new Error('缺技能参数: 小昭.qianKunDerived');
                const reduce = Math.max(1, Math.floor(dmg * target.def / s.defToReduce));
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
                    const heal = Math.max(1, Math.floor(healTarget.def / s.defToHeal));
                    const atkTarget = aliveAllies[rng.nextInt(0, aliveAllies.length - 1)];
                    const atkGain = Math.max(1, Math.floor(atkTarget.def / s.defToAtk));
                    applyStatChange(healTarget, 'hp', heal, xiaoZhao, '乾坤衍生治疗');
                    applyStatChange(atkTarget, 'atk', atkGain, xiaoZhao, '乾坤衍生加攻');
                    if (atkTarget._baseAtk !== undefined) atkTarget._baseAtk += atkGain;
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
            // 蝶变附身跳过行动：判定 + skip 写入（纯函数，事件监听器薄壳转调）
            function submitButterflySkipDeclaration(data) {
                if (!data.unit.isXiaoZhaoSister || !data.unit.alive) return;
                if (fsm.is('attached')) {
                    data.declaration.skip = true;
                }
            }
            // 蝶变回归：回归声明提交（纯函数，事件监听器薄壳转调）
            function submitButterflyReturnDeclaration(data) {
                const sis = A.find(u => u.isXiaoZhaoSister && u.alive && getEliteState(u.uid)._butterflyHost);
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
            if (getEliteState(sister.uid)._butterflyHost) return null;
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
            const atkTransfer = Math.floor(sister._baseAtk * atkRatio);
            const defTransfer = Math.floor(sister._baseDef * defRatio);
            const hpTransfer = Math.floor(sister.hp * hpRatio);
            setEliteState(sister.uid, { _butterflyHpTransfer: hpTransfer });
            const hostEs = getEliteState(host.uid);
            setEliteState(host.uid, { _butterflyHpBonus: (hostEs._butterflyHpBonus || 0) + hpTransfer });
            setEliteState(host.uid, { _butterflyAtkBonus: (hostEs._butterflyAtkBonus || 0) + atkTransfer, _butterflyDefBonus: (hostEs._butterflyDefBonus || 0) + defTransfer });
            applyStatChange(host, 'atk', atkTransfer, sister, '蝶变附身');
            applyStatChange(host, 'def', defTransfer, sister, '蝶变附身');
            applyMaxHpChange(host, host.maxHp + hpTransfer, sister, '蝶变附身血上限');
            emitEvent(host, UNIT_EVENT_TYPES.HP_CHANGE, { hp:host.hp, maxHp:host.maxHp, alive:host.alive, atk:host.atk, def:host.def, _phantomTarget:sister.uid });
            const aliveAllies = A.filter(a => a.alive && !a.isHorse && a.uid !== sister.uid);
            const totalHp = aliveAllies.reduce((sum,a) => sum + a.hp, 0); const totalMaxHp = aliveAllies.reduce((sum,a) => sum + a.maxHp, 0);
            if (totalMaxHp > 0) {
                const newHp = Math.floor(sister.maxHp * (totalHp/totalMaxHp));
                const delta = newHp - sister.hp;
                applyStatChange(sister, 'hp', delta, null, '蝶变附身血量', false);
            }
            // ★ 必须同时写 elite state 的 _flyMode，renderGrid 只读 getEliteState()._flyMode，
            //   否则原地格子不消失，仍显示完整单位（和飞撞残留蓝色格子同根因）。
            setEliteState(sister.uid, { _butterflyHost: host.uid, _flyMode: 'butterfly' });
            sister._fsm.transition('attached');
            emitEvent(sister, UNIT_EVENT_TYPES.HP_CHANGE, { hp:sister.hp, maxHp:sister.maxHp, alive:sister.alive, atk:sister.atk, def:sister.def, _flyMode:'butterfly', _butterflyHost:getEliteState(sister.uid)._butterflyHost });
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
            return sister;
        },
        _executeReturn(sister, A, log) {
            if (!sister.alive || !getEliteState(sister.uid)._butterflyHost) return;
            const host = A.find(u => u.uid === getEliteState(sister.uid)._butterflyHost && u.alive);
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
                setEliteState(sister.uid, { _flyMode: null, _untargetable: false, _butterflyHost: null });
                setEliteState(sister.uid, { _butterflyAtk: 0, _butterflyDef: 0, _butterflyHp: 0, _butterflyHpTransfer: 0 });
                sister._fsm.transition('normal');
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
            applyStatChange(sister, 'atk', sister._baseAtk - sister.atk, null, '蝶变飞回重置攻');
            applyStatChange(sister, 'def', sister._baseDef - sister.def, null, '蝶变飞回重置防');
            if (host && host.alive) {
                applyStatChange(host, 'atk', -(getEliteState(host.uid)._butterflyAtkBonus || 0), sister, '蝶变飞回');
                applyStatChange(host, 'def', -(getEliteState(host.uid)._butterflyDefBonus || 0), sister, '蝶变飞回');
                setEliteState(host.uid, { _butterflyAtkBonus: 0, _butterflyDefBonus: 0 });
                setEliteState(host.uid, { _butterflyHpBonus: 0 });
                const hpTransfer = getEliteState(sister.uid)._butterflyHpTransfer || 0;
                applyMaxHpChange(host, Math.max(1, host.maxHp - hpTransfer), sister, '蝶变飞回血上限');
                emitEvent(host, UNIT_EVENT_TYPES.HP_CHANGE, {
                    hp: host.hp, maxHp: host.maxHp, alive: host.alive,
                    atk: host.atk, def: host.def
                });
            }
            setEliteState(sister.uid, { _butterflyHost: null });
            setEliteState(sister.uid, { _butterflyAtk: 0, _butterflyDef: 0, _butterflyHp: 0, _butterflyHpTransfer: 0 });
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
        },
        executeAttach(A, log) {
            let sister = A.find(u => u.isXiaoZhaoSister && u.alive && u.pos === 4 && !u.state._stunned);
            if (!sister) sister = A.find(u => u.isXiaoZhaoSister && u.alive && !u.state._stunned);
            if (!sister || getEliteState(sister.uid)._butterflyHost) return null;
            const fsm = sister._fsm;
            if (fsm && fsm.is('normal')) fsm.transition('attaching', { log });
            return sister;
        },
        executeReturn(sister, A, log) {
            if (!sister.alive || !getEliteState(sister.uid)._butterflyHost) return;
            const fsm = sister._fsm;
            if (fsm && fsm.is('attached')) fsm.transition('returning', { log });
        },
    };
}

// ==================== 小昭·妹 ====================
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
                        if (!getEliteState(brother.uid)._spiderTriggered70 && brother.hp > brother.maxHp * 0.7) {
                            setEliteState(brother.uid, { _spiderTriggered70: true });
                            reason = reason || '血量即将低于70%';
                        } else if (!getEliteState(brother.uid)._spiderTriggered40 && brother.hp > brother.maxHp * 0.4) {
                            setEliteState(brother.uid, { _spiderTriggered40: true });
                            reason = reason || '血量即将低于40%';
                        } else if (!getEliteState(brother.uid)._spiderTriggeredDeath) {
                            setEliteState(brother.uid, { _spiderTriggeredDeath: true });
                            reason = reason || '即将阵亡';
                        }
                        setEliteState(brother.uid, { _spiderTriggeredThisRound: true });
                        const esRemaining = getEliteState(brother.uid)._spiderRemaining;
                        setEliteState(brother.uid, { _spiderRemaining: Math.max(0, (esRemaining ?? 3) - 1) });
                        setEliteState(brother.uid, { _spiderFlying: true, _flyMode: 'spider' });
                        brother.state._acted = true;
                        emitEvent(brother, UNIT_EVENT_TYPES.HP_CHANGE, { hp:brother.hp, maxHp:brother.maxHp, alive:brother.alive, atk:brother.atk, def:brother.def, _flyMode:'spider', _spiderFlying:true });
                        // 飞天事实随 transition data 携带（不落 unit），由免疫声明/log 消费
                        data._flyFactData = { unitName: brother.name, spiderUid: brother.uid, reason, incomingDmg, remaining: getEliteState(brother.uid)._spiderRemaining };
                    },
                    onExit() {
                        setEliteState(brother.uid, { _spiderFlying: false, _flyMode: null });
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
            // 蛛化飞天免疫：FSM 飞天迁移保留事件路（状态机迁移非数值结算），免疫声明已推
            function submitSpiderFlyDeclaration(data) {
                if (data.target.uid !== brother.uid || !data.A) return;
                if (fsm.is('flying') || fsm.is('dead')) return;
                const maxHp = brother.maxHp;
                const hpAfter = Math.max(0, brother.hp - (data.dmg || 0));
                let shouldFly = false;
                let reason = '';
                if (!getEliteState(brother.uid)._spiderTriggered70 && brother.hp > maxHp * 0.7 && hpAfter <= maxHp * 0.7) {
                    shouldFly = true; reason = '血量即将低于70%';
                } else if (!getEliteState(brother.uid)._spiderTriggered40 && brother.hp > maxHp * 0.4 && hpAfter <= maxHp * 0.4) {
                    shouldFly = true; reason = '血量即将低于40%';
                } else if (!getEliteState(brother.uid)._spiderTriggeredDeath && hpAfter <= 0) {
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
            // 蛛化飞天跳过行动：判定 + skip 写入（纯函数，事件监听器薄壳转调）
            function submitSpiderSkipDeclaration(data) {
                if (!data.unit.isXiaoZhaoBrother || !data.unit.alive) return;
                if (fsm.is('flying') || fsm.is('dead')) {
                    data.declaration.skip = true;
                }
            }
            // 永久惑心混乱：判定 + targetResult/phantomFact 写入（纯函数，事件监听器薄壳转调）
            function submitSpiderMindControlDeclaration(data) {
                if (data.unit.camp !== CAMP_TYPES.ENEMY) return;
                if (!brother || !brother.alive || !getEliteState(brother.uid)._permanentBuffs || !getEliteState(brother.uid)._permanentBuffs.some(b => b.key === BUFF_TYPES.MIND_CONTROL)) return;
                if (hasBuff(data.enemySide._activeBuffs, BUFF_TYPES.MIND_CONTROL)) return;
                if (getBattleRng().next() < 0.15) {
                    const fakeTarget = data.allySide.find(u => u.alive && !u.isHorse && u.uid !== data.unit.uid);
                    if (fakeTarget) {
                        data.declaration.targetResult = fakeTarget;
                        data.declaration.phantomFact = { factType: FACT_TYPES.PHANTOM_CONFUSE, data: { unitName: data.unit.name, deceiver: '小昭·妹', targetName: fakeTarget.name } };
                    }
                }
            }
            // 蛛落：下落声明提交（纯函数，事件监听器薄壳转调）
            function submitSpiderDescendDeclaration(data) {
                const bro = A.find(u => u.isXiaoZhaoBrother && u.alive && getEliteState(u.uid)._spiderFlying);
                if (bro && bro._fsm && bro._fsm.is('flying')) {
                    if (!data.declarations) data.declarations = [];
                    data.declarations.push({ type: 'spiderDescend', unit: bro, A, B, log: data.log });
                }
            }
            // 蛛变：FSM 迁移 + setEliteState + spawnHorse + 永久carry 直改保留事件路
            function submitSpiderTransformDeclaration(data) {
                const { A, B, log } = data;
                const bro = A.find(u => u.isXiaoZhaoBrother && u.alive);
                if (!bro) return;
                if (bro._fsm && bro._fsm.is('normal')) bro._fsm.transition('transforming');
                if (bro._fsm && bro._fsm.is('transforming')) bro._fsm.transition('normal');
                if (getEliteState(bro.uid)._spiderTriggeredHit === undefined) setEliteState(bro.uid, { _spiderTriggeredHit: false });
                if (getEliteState(bro.uid)._spiderTriggered70 === undefined) setEliteState(bro.uid, { _spiderTriggered70: false });
                if (getEliteState(bro.uid)._spiderTriggered40 === undefined) setEliteState(bro.uid, { _spiderTriggered40: false });
                setEliteState(bro.uid, { _spiderTriggeredThisRound: false });
                const teamHasHorse = hasBuff(A._activeBuffs, BUFF_TYPES.HORSE_FORMATION);
                const hasPermanent = getEliteState(bro.uid)._permanentBuffs?.some(b => b.key === BUFF_TYPES.HORSE_FORMATION);
                if (!teamHasHorse && hasPermanent) {
                    const xzHorse = spawnHorse(A, log, B, true);
                    if (xzHorse) {
                        log.push({ factType: FACT_TYPES.XIAO_ZHAO_HORSE, data: { pos: xzHorse.pos, horseUid: xzHorse.uid } });
                    }
                }
                const hasTeamCarry = hasBuff(A._activeBuffs, BUFF_TYPES.CARRY);
                if (!hasTeamCarry && getEliteState(bro.uid)._permanentBuffs?.some(b => b.key === BUFF_TYPES.CARRY) && bro._baseMaxHp !== undefined) {
                    applyStatChange(bro, 'atk', 3, null, '小昭·妹永久carry');
                    applyStatChange(bro, 'def', 4, null, '小昭·妹永久carry');
                    applyMaxHpChange(bro, bro.maxHp + 20, null, '小昭·妹永久carry');
                    bro._baseMaxHp = bro.maxHp;
                }
            }
            // 永久双击重试：_xiaoZhaoDoubleStriked 直写 + extraRequests 驱动"再攻击"链（保留原样）
            function submitXiaoZhaoDoubleStrikeDeclaration(data) {
                const { unit, target, log } = data;
                if (!unit.isXiaoZhaoBrother || !unit.alive || getEliteState(unit.uid)._xiaoZhaoDoubleStriked) return;
                if (!getEliteState(unit.uid)._permanentBuffs || !getEliteState(unit.uid)._permanentBuffs.some(b => b.key === BUFF_TYPES.DOUBLE_STRIKE)) return;
                if (hasBuff(A._activeBuffs, BUFF_TYPES.DOUBLE_STRIKE)) return;
                const s = getSkillParams('小昭', 'spiderFly');
                if (!s) throw new Error('缺技能参数: 小昭.spiderFly');
                const chance = s.xiaoZhaoDoubleStrikeChance;
                if (getBattleRng().nextInt(1, 100) <= chance) {
                    setEliteState(unit.uid, { _xiaoZhaoDoubleStriked: true });
                    log.push({ factType: FACT_TYPES.SPIDER_DOUBLE_STRIKE, data: {} });
                    if (!data.extraRequests) data.extraRequests = [];
                    data.extraRequests.push({
                        unit,
                        targetUid: (target && target.alive) ? target.uid : null,
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
            if (!getEliteState(unit.uid)._spiderTriggered70 && unit.hp > maxHp * 0.7 && hpAfter <= maxHp * 0.7) {
                reason = '血量即将低于70%';
            } else if (!getEliteState(unit.uid)._spiderTriggered40 && unit.hp > maxHp * 0.4 && hpAfter <= maxHp * 0.4) {
                reason = '血量即将低于40%';
            } else if (!getEliteState(unit.uid)._spiderTriggeredDeath && hpAfter <= 0) {
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

registerElite('张无忌', createZhangWujiComponent);
registerElite('韦一笑', createWeiYixiaoComponent);
registerElite('小昭·姊', createXiaoZhaoSisterComponent);
registerElite('小昭·妹', createXiaoZhaoBrotherComponent);