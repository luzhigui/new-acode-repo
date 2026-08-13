// modules/22elite-mingjiao.js - 明教精英组件合集
// V5.4.0 | ~33000 bytes| 2026-08-10 关键单位显式FSM迁移
export const VER = 'modules/22elite-mingjiao.js V5.4.0';

import { registerElite } from '../core/08-elite-registry.js';
import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { ROLE_BONUS } from '../core/02unit.js';
import { hasBuff } from '../core/03battle-utils.js';
import { spawnHorse } from '../core/05battle-horse.js';
import { spiderTransform, spiderReturn } from '../modules/15elite-skills.js';
import { checkZhangSwitch, emitEvent, applyStatChange, applyMaxHpChange, getBattleRng } from '../core/13battle-shared.js';
import { EXECUTION_LAYER as L } from '../core/00-event-bus.js';
import { registerDodgeRule } from '../core/12battle-attack-steps.js';
import { StateMachine } from '../core/06-fsm.js';
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
            const states = {
                ranged: {
                    onEnter() { zhang.rangedForm = true; zhang.role = '远程'; zhang._zhangSwitched = false; },
                    onExit() {}
                },
                switching: {
                    onEnter() {
                        checkZhangSwitch(A, log);
                        if (fsm) fsm.transition('near');
                    },
                    onExit() {}
                },
                near: {
                    onEnter() {},
                    onExit() {}
                },
                ronghui: {
                    onEnter() {
                        zhang.ronghui = true;
                        const zt = getZhangNearTaunt(3);
                        if (zt) log.push({ type:'info', text:`<span class="gold">🗣️ ${zhang.name}：${zt}</span>` });
                    },
                    onExit() {}
                }
            };
            const initial = (zhang._fsm && zhang._fsm.current) ? zhang._fsm.current : (zhang.rangedForm ? 'ranged' : 'near');
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
            // 九阳回血
            eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.ZHANG_JIUYANG, (data) => {
                if (data.unit.uid !== zhang.uid) return;
                onAfterApplyDamage(data.unit, data.target, { dmg: data.dmg }, data.group, A, data.log, data);
            });
            // 近战形态切换 — 被动监听：单位死亡、换位后自行检测前排
            eventBus.on('onUnitDeath', L.ON_UNIT_DEATH.ZHANG_SWITCH, (data) => {
                if (zhang && zhang.alive && !zhang._zhangSwitched && fsm.is('ranged')) {
                    const col = (zhang.pos - 1) % 3;
                    const hasFrontAlly = A.some(c => c.alive && !c.isHorse && c.pos === 1 + col && c.uid !== zhang.uid);
                    if (!hasFrontAlly) fsm.transition('switching');
                }
            });
            eventBus.on('onPositionSwap', L.ON_POSITION_SWAP.ZHANG_SWITCH, (data) => {
                if (zhang && zhang.alive && !zhang._zhangSwitched && fsm.is('ranged')) {
                    const col = (zhang.pos - 1) % 3;
                    const hasFrontAlly = A.some(c => c.alive && !c.isHorse && c.pos === 1 + col && c.uid !== zhang.uid);
                    if (!hasFrontAlly) fsm.transition('switching');
                }
            });
        },
        onAfterApplyDamage(unit, target, dmgCalc, group, A, log, data) {
            if (unit.camp !== 'ally' || !unit.isZhang || !unit.alive) return;
            const fsm = unit._fsm;
            const hpBeforeZhang = Math.floor(unit.hp);
            const s = getSkillParams('张无忌', 'nineYang') || { healPct: 8 };
            const heal = Math.min(Math.floor(unit.maxHp * (s.healPct / 100)), unit.maxHp - unit.hp);
            if (heal > 0) {
                if (data && data.declarations) {
                    data.declarations.push({
                        type: 'heal',
                        value: heal,
                        source: unit,
                        logText: `<span class="green">☀️ 九阳神功回复+${heal}，${hpBeforeZhang}→${Math.floor(unit.hp + heal)}</span>`
                    });
                } else {
                    applyStatChange(unit, 'hp', heal, null, '九阳神功');
                }
            }
            if (!data || !data.declarations) {
                group.entries.push({ type:'info', text:`<span class="green">☀️ 九阳神功回复+${heal}，${hpBeforeZhang}→${Math.floor(unit.hp)}</span>`, isHealEntry:true, healAmount:heal, healUnitUid:unit.uid });
            }
            if (fsm && fsm.is('near')) {
                if (unit.nearAtkCount === 0 && !unit._zhangTauntDone) { const firstTaunt = getZhangNearTaunt(1); if (firstTaunt) { group.entries.push({ type:'info', text:`<span class="gold">🗣️ ${unit.name}：${firstTaunt}</span>` }); unit._zhangTauntDone = true; } }
                unit.nearAtkCount++;
                if (unit.nearAtkCount === 2) { const secondTaunt = getZhangNearTaunt(2); if (secondTaunt) group.entries.push({ type:'info', text:`<span class="gold">🗣️ ${unit.name}：${secondTaunt}</span>` }); }
                if (unit.nearAtkCount >= 3 && !fsm.is('ronghui')) {
                    fsm.transition('ronghui');
                    const extra = Math.floor(Math.abs(target.atk - target.def) * 0.5);
                    if (data && data.declarations) {
                        data.declarations.push({
                            type: 'bonusDmg',
                            value: extra,
                            target: target,
                            logText: null
                        });
                    } else {
                        applyStatChange(target, 'hp', -extra, unit, '融会贯通');
                    }
                    group.entries.push({ type:'info', text:`<span class="red">🔥 融会贯通额外+${extra}（目标攻击${Math.floor(target.atk)} 防御${Math.floor(target.def)}，差值绝对值×50%）</span>` });
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
            eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.WEI_LEECH, (data) => {
                if (data.unit.uid !== wei.uid || !wei.alive || data.dmg <= 0) return;
                const s = getSkillParams('韦一笑', 'coldPalm') || CONFIG.ELITE_SKILLS.coldPalm;
                const lostPct = (wei.maxHp - wei.hp) / wei.maxHp;
                const leechRate = (s.leechMin + (s.leechMax - s.leechMin) * lostPct) / 100;
                const healWei = Math.floor(data.dmg * leechRate);
                const newMaxHpWei = Math.min(wei.maxHp + healWei, wei._baseMaxHp * 2);
                const decl = {
                    type: 'leech',
                    value: healWei,
                    source: wei,
                    logText: `<span class="green">🦇 青翼蝠王·吸血+${healWei}，上限→${Math.floor(newMaxHpWei)}</span>`
                };
                if (!data.declarations) data.declarations = [];
                data.declarations.push(decl);
                wei._baseMaxHp = Math.max(wei._baseMaxHp, newMaxHpWei);
                applyMaxHpChange(wei, newMaxHpWei, null, '韦一笑吸血上限提升');
            });

            // 闪避反击吸血：通过 onDodge 信号提交声明
            eventBus.on('onDodge', L.AFTER_DAMAGE_APPLIED.WEI_LEECH, (data) => {
                const { unit, target, reboundDmg, declarations } = data;
                if (!target.isWei || !target.alive) return;
                const s = getSkillParams('韦一笑', 'coldPalm') || CONFIG.ELITE_SKILLS.coldPalm;
                const lostPct = (target.maxHp - target.hp) / target.maxHp;
                const leechRate = (s.leechMin + (s.leechMax - s.leechMin) * lostPct) / 100;
                const heal = Math.floor(reboundDmg * leechRate);
                const wasFullHp = (target.hp >= target.maxHp);
                const newMaxHp = Math.min(target.maxHp + heal, target._baseMaxHp * 2);
                declarations.push({
                    type: 'weiHeal',
                    data: { heal, newMaxHp, wasFullHp }
                });
            });

            // 血蝠闪避：损失血量比例 × maxRatio，乘法叠加到总闪避
            registerDodgeRule((unit, attacker) => {
                if (!unit.isWei || !unit.alive) return 0;
                const lostPct = (unit.maxHp - unit.hp) / unit.maxHp;
                const s = getSkillParams('韦一笑', 'bloodDodge') || { maxRatio: 70 };
                return lostPct * (s.maxRatio / 100);
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
                    type: 'dmgReduction',
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
                    const derivedEntry = {
                        type:'info',
                        text:`<span class="gold">🦋 乾坤衍生：${target.name}减伤${reduce}，${healTarget.name}治疗+${heal}，${atkTarget.name}攻击+${atkGain}</span>`,
                        isHealEntry: true,
                        healAmount: heal,
                        healUnitUid: healTarget.uid,
                        buffType: 'qiankun_atk',
                        atkGain: atkGain,
                        atkTargetUid: atkTarget.uid
                    };
                    if (!data.unit._pendingDerivedEntries) data.unit._pendingDerivedEntries = [];
                    data.unit._pendingDerivedEntries.push(derivedEntry);
                }
            });
            eventBus.on('beforeActionSelect', L.BEFORE_ACTION.BUTTERFLY_SKIP, (data) => {
                if (!data.unit.isXiaoZhaoSister || !data.unit.alive) return;
                if (fsm.is('attached')) {
                    data.declaration.skip = true;
                }
            });
            // 蝶变飞回
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
            if (!host) { applyStatChange(sister, 'hp', -sister.hp, null, '蝶变无宿主'); log.push({ type:'info', text:`<span class="red">🦋 蝶变：${sister.name} 无队友可附身，香消玉殒！</span>` }); return null; }
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
                applyStatChange(sister, 'hp', delta, null, '蝶变附身血量');
            }
            sister.state._butterflyHost = host.uid;
            sister._fsm.transition('attached');
            emitEvent(sister, 'hp-change', { hp:sister.hp, maxHp:sister.maxHp, alive:sister.alive, atk:sister.atk, def:sister.def, _flyMode:'butterfly', _butterflyHost:sister.state._butterflyHost });
            log.push({ type:'info', text:`<span class="gold">🦋 蝶变：${sister.name} 化为蝴蝶附身于 ${host.name}！方向：${flyDirection === 'left' ? '←左' : '右→'} 攻+${atkTransfer} 防+${defTransfer} 血上限+${hpTransfer}</span>`, needsSeparator: true });
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
                    applyStatChange(sister, 'hp', delta, null, '蝶变飞回血量');
                } else {
                    applyStatChange(sister, 'hp', -sister.hp, null, '蝶变飞回无队友');
                }
                sister.state._flyMode = null; sister._untargetable = false;
                sister.state._butterflyHost = null;
                sister._butterflyAtk = 0;
                sister._butterflyDef = 0;
                sister._butterflyHp = 0;
                sister._butterflyHpTransfer = 0;
                sister._fsm.transition('normal');
                log.push({
                    type: 'info',
                    text: `<span class="gold">🦋 蝶变：宿主已阵亡，${sister.name} 被迫返回！</span>`,
                    uidD: sister.uid,
                    isDead: !sister.alive
                });
                return;
            }
            const allAllies = A.filter(a => !a.isHorse && a.uid !== sister.uid);
            const totalHp = allAllies.reduce((sum, a) => sum + (a.alive ? a.hp : 0), 0);
            const totalMaxHp = allAllies.reduce((sum, a) => sum + a.maxHp, 0);
            if (totalMaxHp > 0) {
                const newHp = Math.floor(sister.maxHp * (totalHp / totalMaxHp));
                const delta = newHp - sister.hp;
                applyStatChange(sister, 'hp', delta, null, '蝶变飞回血量');
            } else {
                applyStatChange(sister, 'hp', -sister.hp, null, '蝶变飞回无队友');
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
                type: 'info',
                text: `<span class="gold">🦋 蝶变：${sister.name} 从 ${host ? host.name : '宿主'} 飞回，恢复原形！攻 ${sister.atk} 防 ${sister.def} 血 ${sister.hp}</span>`,
                needsSeparator: true
            });
        },
        executeAttach(A, log) {
            let sister = A.find(u => u.isXiaoZhaoSister && u.alive && u.pos === 4 && !u.state._stunned);
            // 如果4号位没有，尝试找任意位置的姐姐
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
                        brother._spiderRemaining = (brother._spiderRemaining || 3) - 1;
                        brother.state._spiderFlying = true;
                        brother.state._flyMode = 'spider';
                        brother.state._acted = true;
                        emitEvent(brother, 'hp-change', { hp:brother.hp, maxHp:brother.maxHp, alive:brother.alive, atk:brother.atk, def:brother.def, _flyMode:'spider', _spiderFlying:true });
                        currentLog.push({ type:'info', text:`<span class="gold">🕷️ 飞天：${brother.name} ${reason}，免疫本次攻击的 ${incomingDmg||0} 点伤害，化为蜘蛛遁走！剩余次数：${brother._spiderRemaining}</span>`, needsSeparator: true });
                    },
                    onExit() {
                        brother.state._spiderFlying = false;
                        brother.state._flyMode = null;
                        brother.state._acted = false;
                    }
                },
                descending: {
                    onEnter() {
                        spiderReturn(brother, A, B, log);
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
            // 飞天触发
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
                    data.declarations.push({ immune: true, reason: '🕷️ 飞天：免疫本次伤害' });
                    fsm.transition('flying', { reason, incomingDmg: data.dmg, log: data.log || log });
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
                        data.declaration.phantomLog = `🦋 蝶舞迷心！${data.unit.name}被小昭迷惑，误攻队友${fakeTarget.name}！`;
                    }
                }
            });
            // 蛛落
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
                        log.push({type:'buff-summon', text:`<span class="gold">🐴 小昭的拒马在${xzHorse.pos}号位出现！</span>`, buffType:'summon', horsePos: xzHorse.pos, horseUid: xzHorse.uid, horseTaunt: '嗷——！'});
                    }
                }
                const hasTeamCarry = hasBuff(A._activeBuffs, 'carry');
                if (!hasTeamCarry && bro._permanentBuffs?.some(b => b.key === 'carry') && bro._baseMaxHp !== undefined) {
                    applyStatChange(bro, 'atk', 3, null, '小昭永久carry');
                    applyStatChange(bro, 'def', 4, null, '小昭永久carry');
                    applyMaxHpChange(bro, bro.maxHp + 20, null, '小昭永久carry');
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
                    unit.state._acted = false;
                    log.push({type:'info', text:`<span class="gold">🦋 蝶击：小昭永久概率连击触发！</span>`, isDoubleStrikeBanner:true});
                    data.retry = true;
                    data.retryTargetUid = (target && target.alive) ? target.uid : null;
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
            return true;
        },
        executeDescend(unit, A, B, log) {
            const fsm = unit._fsm;
            if (fsm && fsm.is('flying')) {
                fsm.transition('descending');
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