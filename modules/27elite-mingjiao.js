// modules/27elite-mingjiao.js - 明教精英组件合集
// V5.6.2 | ~32300 bytes| 2026-08-23 张无忌：切换 fact 用触发时 log（修复丢失）；融会贯通 ronghui 态持续生效
export const VER = 'modules/27elite-mingjiao.js V5.6.2';

import { registerElite } from '../core/08-elite-registry.js';
import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { hasBuff } from '../core/03battle-utils.js';
import { spawnHorse } from '../core/05battle-horse.js';
import { spiderTransform, spiderReturn } from '../modules/20elite-skills.js';
import { checkZhangSwitch, emitEvent, applyStatChange, applyMaxHpChange, getBattleRng } from '../core/13battle-shared.js';
import { EXECUTION_LAYER as L, EFFECT_TYPES } from '../infra/50-event-bus.js';
import { registerDodgeRule } from '../core/12battle-attack-steps.js';
import { StateMachine } from '../infra/51-core-utils.js';
const ES = CONFIG.ELITE_SKILLS;
function getZhangNearTaunt(nearAtkCount) {
    const ZHANG_NEAR_TAUNT = ['还好，还记得七七八八。', '糟糕，只记得一两层了。', '不好，全忘光了！'];
    if (nearAtkCount >= 1 && nearAtkCount <= 3) return ZHANG_NEAR_TAUNT[nearAtkCount - 1];
    return null;
}

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
                    onEnter() { zhang.rangedForm = true; zhang.role = '远程'; zhang._zhangSwitched = false; },
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
                        if (zt) log.push({ factType: 'zhangTaunt', data: { unitName: zhang.name, taunt: zt } });
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
            const onAfterApplyDamage = this.onAfterApplyDamage;
            eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.ZHANG_JIUYANG, (data) => {
                if (data.unit.uid !== zhang.uid) return;
                onAfterApplyDamage(data.unit, data.target, { dmg: data.dmg }, data.group, A, data.log, data);
            });
            eventBus.on('onRoundStart', L.ROUND_START.ZHANG_RANGE_CHECK, (data) => {
                if (zhang && zhang.alive && !zhang._zhangSwitched && fsm.is('ranged')) {
                    const col = (zhang.pos - 1) % 3;
                    const hasFrontAlly = A.some(c => c.alive && !c.isHorse && c.pos === 1 + col && c.uid !== zhang.uid);
                    if (!hasFrontAlly) fsm.transition('switching');
                }
            });
            eventBus.on('onUnitDeath', L.ON_UNIT_DEATH.ZHANG_SWITCH, (data) => {
                if (zhang && zhang.alive && !zhang._zhangSwitched && fsm.is('ranged')) {
                    const col = (zhang.pos - 1) % 3;
                    const hasFrontAlly = A.some(c => c.alive && !c.isHorse && c.pos === 1 + col && c.uid !== zhang.uid);
                    if (!hasFrontAlly) fsm.transition('switching', { log: data && data.log });
                }
            });
            eventBus.on('onPositionSwap', L.ON_POSITION_SWAP.ZHANG_SWITCH, (data) => {
                if (zhang && zhang.alive && !zhang._zhangSwitched && fsm.is('ranged')) {
                    const col = (zhang.pos - 1) % 3;
                    const hasFrontAlly = A.some(c => c.alive && !c.isHorse && c.pos === 1 + col && c.uid !== zhang.uid);
                    if (!hasFrontAlly) fsm.transition('switching', { log: data && data.log });
                }
            });
        },
        onAfterApplyDamage(unit, target, dmgCalc, group, A, log, data) {
            if (unit.camp !== 'ally' || !unit.isZhang || !unit.alive) return;
            const fsm = unit._fsm;
            // ronghui 是 near 的融会贯通激活态：FSM 转入后仍需继续触发（第3次起每次攻击都有效）
            if (fsm && (fsm.is('near') || fsm.is('ronghui'))) {
                if (unit.nearAtkCount === 0 && !unit._zhangTauntDone) { const firstTaunt = getZhangNearTaunt(1); if (firstTaunt) { group.data.entries.push({ factType: 'zhangTaunt', data: { unitName: unit.name, taunt: firstTaunt } }); unit._zhangTauntDone = true; } }
                unit.nearAtkCount++;
                if (unit.nearAtkCount === 2) { const secondTaunt = getZhangNearTaunt(2); if (secondTaunt) group.data.entries.push({ factType: 'zhangTaunt', data: { unitName: unit.name, taunt: secondTaunt } }); }
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
                    group.data.entries.push({ factType: 'rongHuiBonus', data: { unitName: unit.name, extra, targetAtk: Math.floor(target.atk), targetDef: Math.floor(target.def) } });
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

            eventBus.on('onDodge', L.AFTER_DAMAGE_APPLIED.WEI_LEECH, (data) => {
                const { unit, target, reboundDmg, declarations } = data;
                if (!target.isWei || !target.alive) return;
                const s = getSkillParams('韦一笑', 'coldPalm') || CONFIG.ELITE_SKILLS.coldPalm;
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
            });

            registerDodgeRule((unit, attacker) => {
                if (!unit.isWei || !unit.alive) return 0;
                return CONFIG.BASE_DODGE_FLY || 0.15;
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
                        sister._untargetable = true;
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
            eventBus.on('beforeDamageCalc', L.BEFORE_DAMAGE_CALC.WARRIOR_BREAK, (data) => {
                const xiaoZhao = A.find(u => u.isXiaoZhaoSister && u.alive && !u.state._stunned);
                if (!xiaoZhao) return;
                const zhang = A.find(u => u.isZhang && u.alive);
                if (zhang) return;
                const target = data.target;
                if (!target || target.camp !== 'ally') return;
                const dmg = data.unit ? data.unit.atk * (data.unit.atk / (data.unit.atk + target.def)) : 0;
                const s = getSkillParams('小昭', 'qianKunDerived') || ES.xiaoZhao;
                const reduce = Math.max(1, Math.floor(dmg * target.def / (s.defToReduce || 150)));
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
                    const heal = Math.max(1, Math.floor(healTarget.def / (s.defToHeal || 8)));
                    const atkTarget = aliveAllies[rng.nextInt(0, aliveAllies.length - 1)];
                    const atkGain = Math.max(1, Math.floor(atkTarget.def / (s.defToAtk || 16)));
                    applyStatChange(healTarget, 'hp', heal, xiaoZhao, '乾坤衍生治疗');
                    applyStatChange(atkTarget, 'atk', atkGain, xiaoZhao, '乾坤衍生加攻');
                    if (atkTarget._baseAtk !== undefined) atkTarget._baseAtk += atkGain;
                    if (!data.unit._pendingDerivedEntries) data.unit._pendingDerivedEntries = [];
                    data.unit._pendingDerivedEntries.push({
                        factType: 'qianKunDerived',
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
            });
            eventBus.on('beforeActionSelect', L.BEFORE_ACTION.BUTTERFLY_SKIP, (data) => {
                if (!data.unit.isXiaoZhaoSister || !data.unit.alive) return;
                if (fsm.is('attached')) {
                    data.declaration.skip = true;
                }
            });
            eventBus.on('onRoundEnd', L.ROUND_END.BUTTERFLY_RETURN, (data) => {
                const sis = A.find(u => u.isXiaoZhaoSister && u.alive && u.state._butterflyHost);
                if (!sis || !fsm.is('attached')) return;
                if (!data.declarations) data.declarations = [];
                data.declarations.push({ type: 'butterflyReturn', sister: sis, A, log: data.log });
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
                log.push({ factType: 'butterflyNoHost', data: { unitName: sister.name } });
                return null;
            }
            const s = getSkillParams('小昭', 'butterflyAttach') || {};
            const atkRatio = flyDirection === 'left' ? 0 : 1/2;
            const defRatio = flyDirection === 'left' ? 1/2 : 0;
            const hpRatio = 1/2;
            const atkTransfer = Math.floor(sister._baseAtk * atkRatio);
            const defTransfer = Math.floor(sister._baseDef * defRatio);
            const hpTransfer = Math.floor(sister.hp * hpRatio);
            sister._butterflyHpTransfer = hpTransfer;
            host._butterflyHpBonus = (host._butterflyHpBonus || 0) + hpTransfer;
            host._butterflyAtkBonus += atkTransfer; host._butterflyDefBonus += defTransfer;
            applyStatChange(host, 'atk', atkTransfer, sister, '蝶变附身');
            applyStatChange(host, 'def', defTransfer, sister, '蝶变附身');
            applyMaxHpChange(host, host.maxHp + hpTransfer, sister, '蝶变附身血上限');
            emitEvent(host, 'hp-change', { hp:host.hp, maxHp:host.maxHp, alive:host.alive, atk:host.atk, def:host.def, _phantomTarget:sister.uid });
            const aliveAllies = A.filter(a => a.alive && !a.isHorse && a.uid !== sister.uid);
            const totalHp = aliveAllies.reduce((sum,a) => sum + a.hp, 0); const totalMaxHp = aliveAllies.reduce((sum,a) => sum + a.maxHp, 0);
            if (totalMaxHp > 0) {
                const newHp = Math.floor(sister.maxHp * (totalHp/totalMaxHp));
                const delta = newHp - sister.hp;
                applyStatChange(sister, 'hp', delta, null, '蝶变附身血量', false);
            }
            sister.state._butterflyHost = host.uid;
            sister._fsm.transition('attached');
            emitEvent(sister, 'hp-change', { hp:sister.hp, maxHp:sister.maxHp, alive:sister.alive, atk:sister.atk, def:sister.def, _flyMode:'butterfly', _butterflyHost:sister.state._butterflyHost });
            log.push({
                factType: 'butterflyAttach',
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
                sister.state._flyMode = null; sister._untargetable = false;
                sister.state._butterflyHost = null;
                sister._butterflyAtk = 0;
                sister._butterflyDef = 0;
                sister._butterflyHp = 0;
                sister._butterflyHpTransfer = 0;
                sister._fsm.transition('normal');
                log.push({ factType: 'butterflyHostDead', data: { sisterName: sister.name, isDead: !sister.alive, sisterUid: sister.uid } });
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
                applyStatChange(host, 'atk', -(host._butterflyAtkBonus || 0), sister, '蝶变飞回');
                applyStatChange(host, 'def', -(host._butterflyDefBonus || 0), sister, '蝶变飞回');
                host._butterflyAtkBonus = 0;
                host._butterflyDefBonus = 0;
                host._butterflyHpBonus = 0;
                const hpTransfer = sister._butterflyHpTransfer || 0;
                applyMaxHpChange(host, Math.max(1, host.maxHp - hpTransfer), sister, '蝶变飞回血上限');
                emitEvent(host, 'hp-change', {
                    hp: host.hp, maxHp: host.maxHp, alive: host.alive,
                    atk: host.atk, def: host.def
                });
            }
            sister.state._butterflyHost = null;
            sister._butterflyAtk = 0;
            sister._butterflyDef = 0;
            sister._butterflyHp = 0;
            sister._butterflyHpTransfer = 0;
            if (!A.find(a => a.uid === sister.uid)) {
                A.push(sister);
            }
            sister._fsm.transition('normal');
            emitEvent(sister, 'hp-change', {
                hp: sister.hp, maxHp: sister.maxHp, alive: sister.alive,
                atk: sister.atk, def: sister.def, _flyMode: null, _butterflyHost: null
            });
            log.push({
                factType: 'butterflyReturn',
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
                        if (!brother.state._spiderTriggered70 && brother.hp > brother.maxHp * 0.7) {
                            brother.state._spiderTriggered70 = true;
                            reason = reason || '血量即将低于70%';
                        } else if (!brother.state._spiderTriggered40 && brother.hp > brother.maxHp * 0.4) {
                            brother.state._spiderTriggered40 = true;
                            reason = reason || '血量即将低于40%';
                        } else if (!brother.state._spiderTriggeredDeath) {
                            brother.state._spiderTriggeredDeath = true;
                            reason = reason || '即将阵亡';
                        }
                        brother.state._spiderTriggeredThisRound = true;
                        brother._spiderRemaining = Math.max(0, (brother._spiderRemaining ?? 3) - 1);
                        brother.state._spiderFlying = true;
                        brother.state._flyMode = 'spider';
                        brother.state._acted = true;
                        emitEvent(brother, 'hp-change', { hp:brother.hp, maxHp:brother.maxHp, alive:brother.alive, atk:brother.atk, def:brother.def, _flyMode:'spider', _spiderFlying:true });
                        brother._flyFactData = { unitName: brother.name, spiderUid: brother.uid, reason, incomingDmg, remaining: brother._spiderRemaining };
                    },
                    onExit() {
                        brother.state._spiderFlying = false;
                        brother.state._flyMode = null;
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
            eventBus.on('beforeDamageApply', L.BEFORE_DAMAGE_APPLY.SPIDER_IMMUNE, (data) => {
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
                    fsm.transition('flying', { reason, incomingDmg: data.dmg, log: data.log || log });
                    data.declarations.push({ immune: true, flyData: brother._flyFactData || null, reason: brother._flyFactData ? null : '🕷️ 飞天：免疫本次伤害' });
                }
            });
            eventBus.on('beforeActionSelect', L.BEFORE_ACTION.SPIDER_SKIP, (data) => {
                if (!data.unit.isXiaoZhaoBrother || !data.unit.alive) return;
                if (fsm.is('flying') || fsm.is('dead')) {
                    data.declaration.skip = true;
                }
            });
            eventBus.on('beforeSelectTarget', L.BEFORE_SELECT_TARGET.PERMANENT_MIND_CONTROL, (data) => {
                if (data.unit.camp !== 'enemy') return;
                if (!brother || !brother.alive || !brother._permanentBuffs || !brother._permanentBuffs.some(b => b.key === 'mindControl')) return;
                if (hasBuff(data.enemySide._activeBuffs, 'mindControl')) return;
                if (getBattleRng().next() < 0.15) {
                    const fakeTarget = data.allySide.find(u => u.alive && !u.isHorse && u.uid !== data.unit.uid);
                    if (fakeTarget) {
                        data.declaration.targetResult = fakeTarget;
                        data.declaration.phantomFact = { factType: 'phantomConfuse', data: { unitName: data.unit.name, deceiver: '小昭·妹', targetName: fakeTarget.name } };
                    }
                }
            });
            eventBus.on('onRoundEnd', L.ROUND_END.SPIDER_RETURN, (data) => {
                const bro = A.find(u => u.isXiaoZhaoBrother && u.alive && u.state._spiderFlying);
                if (bro && bro._fsm && bro._fsm.is('flying')) {
                    if (!data.declarations) data.declarations = [];
                    data.declarations.push({ type: 'spiderDescend', unit: bro, A, B, log: data.log });
                }
            });
            eventBus.on('onRoundStart', L.ROUND_START.SPIDER_TRANSFORM, (data) => {
                const { A, B, log } = data;
                const bro = A.find(u => u.isXiaoZhaoBrother && u.alive);
                if (!bro) return;
                if (bro._fsm && bro._fsm.is('normal')) bro._fsm.transition('transforming');
                if (bro._fsm && bro._fsm.is('transforming')) bro._fsm.transition('normal');
                if (bro.state._spiderTriggeredHit === undefined) bro.state._spiderTriggeredHit = false;
                if (bro.state._spiderTriggered70 === undefined) bro.state._spiderTriggered70 = false;
                if (bro.state._spiderTriggered40 === undefined) bro.state._spiderTriggered40 = false;
                bro.state._spiderTriggeredThisRound = false;
                const teamHasHorse = hasBuff(A._activeBuffs, 'horseFormation');
                const hasPermanent = bro._permanentBuffs?.some(b => b.key === 'horseFormation');
                if (!teamHasHorse && hasPermanent) {
                    const xzHorse = spawnHorse(A, log, B, true);
                    if (xzHorse) {
                        log.push({ factType: 'xiaoZhaoHorse', data: { pos: xzHorse.pos, horseUid: xzHorse.uid } });
                    }
                }
                const hasTeamCarry = hasBuff(A._activeBuffs, 'carry');
                if (!hasTeamCarry && bro._permanentBuffs?.some(b => b.key === 'carry') && bro._baseMaxHp !== undefined) {
                    applyStatChange(bro, 'atk', 3, null, '小昭·妹永久carry');
                    applyStatChange(bro, 'def', 4, null, '小昭·妹永久carry');
                    applyMaxHpChange(bro, bro.maxHp + 20, null, '小昭·妹永久carry');
                    bro._baseMaxHp = bro.maxHp;
                }
            });
            eventBus.on('afterMiss', L.AFTER_MISS.XIAOZHAO_DOUBLE_RETRY, (data) => {
                const { unit, target, log } = data;
                if (!unit.isXiaoZhaoBrother || !unit.alive || unit._xiaoZhaoDoubleStriked) return;
                if (!unit._permanentBuffs || !unit._permanentBuffs.some(b => b.key === 'doubleStrike')) return;
                if (hasBuff(A._activeBuffs, 'doubleStrike')) return;
                const s = getSkillParams('小昭', 'spiderFly') || {};
                const chance = (s.xiaoZhaoDoubleStrikeChance || 80);
                if (getBattleRng().nextInt(1, 100) <= chance) {
                    unit._xiaoZhaoDoubleStriked = true;
                    log.push({ factType: 'spiderDoubleStrike', data: {} });
                    if (!data.extraRequests) data.extraRequests = [];
                    data.extraRequests.push({
                        unit,
                        targetUid: (target && target.alive) ? target.uid : null,
                        reason: 'xiaoZhaoDoubleMiss',
                        actedMode: 'allow',
                        priority: 30
                    });
                }
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
            fsm.transition('flying', { reason, incomingDmg, log });
            if (unit._flyFactData && log) {
                log.push({ factType: 'spiderFly', data: unit._flyFactData });
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