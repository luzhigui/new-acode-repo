// modules/99elite-mingjiao.js - 明教精英组件合集
// V5.4.0 | ~23700 bytes| 2026-08-06 状态转换迁移至声明→裁定模式
export const VER = 'modules/99elite-mingjiao.js V5.4.0';

import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { ROLE_BONUS } from '../core/02unit.js';
import { rand, hasBuff } from '../core/03battle-utils.js';
import { spawnHorse } from '../core/05battle-horse.js';
import { spiderTransform, spiderReturn } from '../modules/23elite-skills.js';
import { checkZhangSwitch, emitEvent, applyStatChange, applyMaxHpChange } from '../core/50battle-shared.js';
import { EXECUTION_LAYER as L } from '../core/00-event-bus.js';
import { registerDodgeRule } from '../core/49battle-attack-steps.js';
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
        register(eventBus, A, B, log) {
            const zhang = A.find(u => u.isZhang && u.alive);
            if (!zhang) return;
            const onAfterApplyDamage = this.onAfterApplyDamage;
            // 九阳回血
            eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.ZHANG_JIUYANG, (data) => {
                if (data.unit.uid !== zhang.uid) return;
                onAfterApplyDamage(data.unit, data.target, { dmg: data.dmg }, data.group, A, data.log);
            });
            // 近战形态切换 — 被动监听：单位死亡、换位后自行检测前排
            eventBus.on('onUnitDeath', L.ON_UNIT_DEATH.ZHANG_SWITCH, (data) => {
                const { allySide, log } = data;
                if (zhang && zhang.alive && !zhang._zhangSwitched) checkZhangSwitch(allySide, log);
            });
            eventBus.on('onPositionSwap', L.ON_POSITION_SWAP.ZHANG_SWITCH, (data) => {
                const { allySide, log } = data;
                if (zhang && zhang.alive && !zhang._zhangSwitched) checkZhangSwitch(allySide, log);
            });
        },
        onAfterApplyDamage(unit, target, dmgCalc, group, A, log) {
            if (unit.camp !== 'ally' || !unit.isZhang || !unit.alive) return;
            const hpBeforeZhang = Math.floor(unit.hp);
            const s = getSkillParams('张无忌', 'nineYang') || { healPct: 8 };
            const heal = Math.floor(unit.maxHp * (s.healPct / 100));
            unit.hp = Math.min(unit.maxHp, unit.hp + heal);
            unit.healDone += heal;
            group.entries.push({ type:'info', text:`<span class="green">☀️ 九阳神功回复+${heal}，${hpBeforeZhang}→${Math.floor(unit.hp)}</span>`, isHealEntry:true, healAmount:heal, healUnitUid:unit.uid });
            emitEvent(unit, 'hp-change', { hp:unit.hp, maxHp:unit.maxHp, alive:unit.alive, atk:unit.atk, def:unit.def });
            if (!unit.rangedForm) {
                if (unit.nearAtkCount === 0 && !unit._zhangTauntDone) { const firstTaunt = getZhangNearTaunt(1); if (firstTaunt) { group.entries.push({ type:'info', text:`<span class="gold">🗣️ ${unit.name}：${firstTaunt}</span>` }); unit._zhangTauntDone = true; } }
                unit.nearAtkCount++;
                if (unit.nearAtkCount === 2) { const secondTaunt = getZhangNearTaunt(2); if (secondTaunt) group.entries.push({ type:'info', text:`<span class="gold">🗣️ ${unit.name}：${secondTaunt}</span>` }); }
                if (unit.nearAtkCount >= 3) {
                    unit.ronghui = true;
                    const zt = getZhangNearTaunt(3); if (zt) group.entries.push({ type:'info', text:`<span class="gold">🗣️ ${unit.name}：${zt}</span>` });
                    const extra = Math.floor(Math.abs(target.atk - target.def) * 0.5);
                    applyStatChange(target, 'hp', -extra, unit, '融会贯通');
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
                const s = getSkillParams('韦一笑', 'coldPalm') || { leechMin: 20, leechMax: 40 };
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
        register(eventBus, A, B, log) {
            const sister = A.find(u => u.isXiaoZhaoSister && u.alive && !u._stunned);
            if (!sister) return;
            const comp = this;
            // 蝶变附身：提交声明，由裁判在 beforeStateTransition 中裁定执行
            eventBus.on('beforeFirstAllyAttack', L.BEFORE_FIRST_ALLY_ATTACK.BUTTERFLY_ATTACH, (data) => {
                const { A, log, result } = data;
                const sister = A.find(u => u.isXiaoZhaoSister && u.alive && u.pos === 4 && !u._stunned);
                if (!sister || sister._butterflyHost) return;
                if (!data.declarations) data.declarations = [];
                data.declarations.push({ type: 'butterflyAttach', sister, A, log });
                result.intercepted = true;
                result.interceptUnitUid = sister.uid;
            });
            eventBus.on('allyDamaged', L.ALLY_DAMAGED.QIANKUN_DERIVED, (data) => {
                const xiaoZhao = A.find(u => u.isXiaoZhaoSister && u.alive && !u._stunned);
                if (!xiaoZhao) return;
                const zhang = A.find(u => u.isZhang && u.alive);
                if (zhang) return;
                comp.onAllyDamaged(data.target, data.dmg, A, data.log);
            });
            eventBus.on('beforeActionSelect', L.BEFORE_ACTION.BUTTERFLY_SKIP, (data) => {
                if (!data.unit.isXiaoZhaoSister || !data.unit.alive) return;
                if (data.unit._flyMode === 'butterfly' || data.unit._butterflyHost) {
                    data.declaration.skip = true;
                }
            });
            // 蝶变飞回：提交声明，由裁判在 onRoundEnd 后统一裁定执行
            eventBus.on('onRoundEnd', L.ROUND_END.BUTTERFLY_RETURN, (data) => {
                const sister = A.find(u => u.isXiaoZhaoSister && u.alive && u._butterflyHost);
                if (!sister) return;
                if (data.forced || sister.hp <= 0) {
                    if (!data.declarations) data.declarations = [];
                    data.declarations.push({ type: 'butterflyReturn', sister, A, log: data.log });
                }
            });
        },
        // 裁判接口：执行附身（由 resolveActionOrder 调用）
        executeAttach(A, log) {
            const sister = A.find(u => u.isXiaoZhaoSister && u.alive && u.pos === 4 && !u._stunned);
            if (!sister || sister._butterflyHost) return null;
            const order = [5,6,7,8,9,1,2,3]; let host = null;
            for (const p of order) { const u = A.find(a => a.pos === p && a.alive && !a.isHorse && a.uid !== sister.uid); if (u) { host = u; break; } }
            if (!host) { applyStatChange(sister, 'hp', -sister.hp, null, '蝶变无宿主'); log.push({ type:'info', text:`<span class="red">🦋 蝶变：${sister.name} 无队友可附身，香消玉殒！</span>` }); return null; }
            const s = getSkillParams('小昭', 'butterflyAttach') || {};
            const atkRatio = 1/3;
            const defRatio = 1/3;
            const hpRatio = 1/2;
            const atkTransfer = Math.floor(sister._baseAtk * atkRatio);
            const defTransfer = Math.floor(sister._baseDef * defRatio);
            const hpTransfer = Math.floor(sister.hp * hpRatio);
            sister._butterflyHpTransfer = hpTransfer;
            host._butterflyAtkBonus += atkTransfer; host._butterflyDefBonus += defTransfer;
            applyStatChange(host, 'atk', atkTransfer, sister, '蝶变附身');
            applyStatChange(host, 'def', defTransfer, sister, '蝶变附身');
            applyMaxHpChange(host, host.maxHp + hpTransfer, sister, '蝶变附身血上限');
            host.hp = Math.min(host.maxHp, host.hp + hpTransfer);
            emitEvent(host, 'hp-change', { hp:host.hp, maxHp:host.maxHp, alive:host.alive, atk:host.atk, def:host.def, _phantomTarget:sister.uid });
            const aliveAllies = A.filter(a => a.alive && !a.isHorse && a.uid !== sister.uid);
            const totalHp = aliveAllies.reduce((sum,a) => sum + a.hp, 0); const totalMaxHp = aliveAllies.reduce((sum,a) => sum + a.maxHp, 0);
            if (totalMaxHp > 0) { sister.hp = Math.floor(sister.maxHp * (totalHp/totalMaxHp)); }
            sister._butterflyHost = host.uid; sister._flyMode = 'butterfly'; sister._untargetable = true; sister._acted = true;
            emitEvent(sister, 'hp-change', { hp:sister.hp, maxHp:sister.maxHp, alive:sister.alive, atk:sister.atk, def:sister.def, _flyMode:'butterfly', _butterflyHost:sister._butterflyHost });
            log.push({ type:'info', text:`<span class="gold">🦋 蝶变：${sister.name} 化为蝴蝶附身于 ${host.name}！攻+${atkTransfer} 防+${defTransfer} 血上限+${hpTransfer}</span>`, needsSeparator: true });
            return sister;
        },
        // 裁判接口：执行飞回（由 onRoundEnd 裁判调用）
        executeReturn(sister, A, log) {
            if (!sister._butterflyHost) return;
            const host = A.find(u => u.uid === sister._butterflyHost);
            if (!host || !host.alive) {
                const allAllies = A.filter(a => !a.isHorse && a.uid !== sister.uid);
                const totalHp = allAllies.reduce((sum, a) => sum + (a.alive ? a.hp : 0), 0);
                const totalMaxHp = allAllies.reduce((sum, a) => sum + a.maxHp, 0);
                if (totalMaxHp > 0) {
                    sister.hp = Math.floor(sister.maxHp * (totalHp / totalMaxHp));
                } else {
                    sister.hp = 0;
                    sister.alive = false;
                    sister._isDead = true;
                    if (!sister._deathTime) sister._deathTime = Date.now();
                }
                sister._flyMode = null; sister._untargetable = false;
                sister._butterflyHost = null;
                sister._butterflyAtk = 0;
                sister._butterflyDef = 0;
                sister._butterflyHp = 0;
                sister._butterflyHpTransfer = 0;
                emitEvent(sister, 'hp-change', {
                    hp: sister.hp, maxHp: sister.maxHp, alive: sister.alive,
                    atk: sister.atk, def: sister.def, _flyMode: null, _butterflyHost: null
                });
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
                sister.hp = Math.floor(sister.maxHp * (totalHp / totalMaxHp));
            } else {
                sister.hp = 0;
                sister.alive = false;
                sister._isDead = true;
                if (!sister._deathTime) sister._deathTime = Date.now();
            }
            sister.atk = sister._baseAtk;
            sister.def = sister._baseDef;
            sister._flyMode = null; sister._untargetable = false;
            if (host && host.alive) {
                applyStatChange(host, 'atk', -(host._butterflyAtkBonus || 0), sister, '蝶变飞回');
                applyStatChange(host, 'def', -(host._butterflyDefBonus || 0), sister, '蝶变飞回');
                host._butterflyAtkBonus = 0;
                host._butterflyDefBonus = 0;
                const hpTransfer = sister._butterflyHpTransfer || 0;
                applyMaxHpChange(host, Math.max(1, host.maxHp - hpTransfer), sister, '蝶变飞回血上限');
                emitEvent(host, 'hp-change', {
                    hp: host.hp, maxHp: host.maxHp, alive: host.alive,
                    atk: host.atk, def: host.def
                });
            }
            sister._butterflyHost = null;
            sister._butterflyAtk = 0;
            sister._butterflyDef = 0;
            sister._butterflyHp = 0;
            sister._butterflyHpTransfer = 0;
            if (!A.find(a => a.uid === sister.uid)) {
                A.push(sister);
            }
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
        onAllyDamaged(target, dmg, allyTeam, log) {
            const sister = allyTeam.find(u => u.isXiaoZhaoSister && u.alive && !u._stunned);
            if (!sister) return; const zhang = allyTeam.find(u => u.isZhang && u.alive); if (zhang) return;
            const s = getSkillParams('小昭', 'qianKunDerived') || ES.xiaoZhao;
            let reduce = Math.max(1, Math.floor(dmg * target.def / (s.defToReduce||150)));
            const aliveAllies = allyTeam.filter(u => u.alive && !u.isHorse);
            if (aliveAllies.length > 0) {
                const healTarget = aliveAllies[Math.floor(Math.random()*aliveAllies.length)];
                let heal = Math.max(1, Math.floor(healTarget.def/(s.defToHeal||8)));
                const atkTarget = aliveAllies[Math.floor(Math.random()*aliveAllies.length)];
                let atkGain = Math.max(1, Math.floor(atkTarget.def/(s.defToAtk||16)));
                // 提交声明，由攻击后效果边裁统一执行
                if (!data.declarations) data.declarations = [];
                data.declarations.push({
                    type: 'heal',
                    value: reduce,
                    source: target,
                    logText: null
                });
                data.declarations.push({
                    type: 'heal',
                    value: heal,
                    source: healTarget,
                    logText: null
                });
                data.declarations.push({
                    type: 'statChange',
                    target: atkTarget,
                    field: 'atk',
                    delta: atkGain,
                    logText: null
                });
                if (log) { log.push({ type:'info', text:`<span class="gold">🦋 乾坤衍生：${target.name}减伤${reduce}，${healTarget.name}治疗+${heal}，${atkTarget.name}攻击+${atkGain}</span>`, isHealEntry:true, healAmount:heal, healUnitUid:healTarget.uid }); }
            }
        }
    };
}

// ==================== 小昭·妹 ====================
export function createXiaoZhaoBrotherComponent() {
    return {
        name: '小昭·妹',
        register(eventBus, A, B, log) {
            const brother = A.find(u => u.isXiaoZhaoBrother && u.alive);
            if (!brother) return;
            // 飞天触发：判断条件后提交声明到 beforeStateTransition，同时提交免疫声明
            eventBus.on('beforeDamageApply', L.BEFORE_DAMAGE_APPLY.SPIDER_IMMUNE, (data) => {
                if (data.target.uid !== brother.uid || !data.A) return;
                const maxHp = brother.maxHp;
                const hpAfter = Math.max(0, brother.hp - (data.dmg || 0));
                let shouldFly = false;
                if (!brother._spiderTriggered70 && brother.hp > maxHp * 0.7 && hpAfter <= maxHp * 0.7) {
                    shouldFly = true;
                } else if (!brother._spiderTriggered40 && brother.hp > maxHp * 0.4 && hpAfter <= maxHp * 0.4) {
                    shouldFly = true;
                } else if (!brother._spiderTriggeredDeath && hpAfter <= 0) {
                    shouldFly = true;
                }
                if (shouldFly) {
                    if (!data.declarations) data.declarations = [];
                    data.declarations.push({ immune: true, reason: '🕷️ 飞天：免疫本次伤害' });
                    // 提交飞天声明到 A 队延迟队列，由 resolveActionOrder 在 beforeStateTransition 中收集
                    if (!data.A._pendingStateTransitions) data.A._pendingStateTransitions = [];
                    data.A._pendingStateTransitions.push({ type: 'spiderFly', unit: brother, incomingDmg: data.dmg, A: data.A, log: data.log });
                }
            });
            eventBus.on('beforeActionSelect', L.BEFORE_ACTION.SPIDER_SKIP, (data) => {
                if (!data.unit.isXiaoZhaoBrother || !data.unit.alive) return;
                if (data.unit._spiderFlying || data.unit._flyMode === 'spider') {
                    data.declaration.skip = true;
                }
            });
            eventBus.on('beforeSelectTarget', L.BEFORE_SELECT_TARGET.PERMANENT_MIND_CONTROL, (data) => {
                if (data.unit.camp !== 'enemy') return;
                if (!brother || !brother.alive || !brother._permanentBuffs || !brother._permanentBuffs.some(b => b.key === 'mindControl')) return;
                if (hasBuff(data.enemySide._activeBuffs, 'mindControl')) return;
                if (Math.random() < 0.15) {
                    const fakeTarget = data.allySide.find(u => u.alive && !u.isHorse && u.uid !== data.unit.uid);
                    if (fakeTarget) {
                        data.declaration.targetResult = fakeTarget;
                        data.declaration.phantomLog = `🦋 蝶舞迷心！${data.unit.name}被小昭迷惑，误攻队友${fakeTarget.name}！`;
                    }
                }
            });
            // 蛛落：提交声明，由裁判在 onRoundEnd 后统一裁定执行
            eventBus.on('onRoundEnd', L.ROUND_END.SPIDER_RETURN, (data) => {
                const brother = A.find(u => u.isXiaoZhaoBrother && u.alive && u._spiderFlying);
                if (brother) {
                    if (!data.declarations) data.declarations = [];
                    data.declarations.push({ type: 'spiderDescend', unit: brother, A, B, log: data.log });
                }
            });
            eventBus.on('onRoundStart', L.ROUND_START.SPIDER_TRANSFORM, (data) => {
                const { A, B, log } = data;
                const brother = A.find(u => u.isXiaoZhaoBrother && u.alive);
                if (!brother) return;
                spiderTransform(brother, log);
                if (brother._spiderTriggeredHit === undefined) brother._spiderTriggeredHit = false;
                if (brother._spiderTriggered70 === undefined) brother._spiderTriggered70 = false;
                if (brother._spiderTriggered40 === undefined) brother._spiderTriggered40 = false;
                brother._spiderTriggeredThisRound = false;
                const teamHasHorse = hasBuff(A._activeBuffs, 'horseFormation');
                const hasPermanent = brother._permanentBuffs?.some(b => b.key === 'horseFormation');
                if (!teamHasHorse && hasPermanent) {
                    const xzHorse = spawnHorse(A, log, B, true);
                    if (xzHorse) {
                        xzHorse.atk = 0;
                        xzHorse.def = 25;
                        xzHorse.maxHp = 25;
                        xzHorse.hp = 25;
                        log.push({type:'buff-summon', text:`<span class="gold">🐴 小昭的拒马在${xzHorse.pos}号位出现！</span>`, buffType:'summon', horsePos: xzHorse.pos, horseUid: xzHorse.uid, horseTaunt: '嗷——！'});
                    }
                }
                const hasTeamCarry = hasBuff(A._activeBuffs, 'carry');
                if (!hasTeamCarry && brother._permanentBuffs?.some(b => b.key === 'carry') && brother._baseMaxHp !== undefined) {
                    applyStatChange(brother, 'atk', 3, null, '小昭永久carry');
                    applyStatChange(brother, 'def', 4, null, '小昭永久carry');
                    applyMaxHpChange(brother, brother.maxHp + 20, null, '小昭永久carry');
                    brother._baseMaxHp = brother.maxHp;
                    brother.hp = Math.min(brother.hp + 20, brother.maxHp);
                }
            });
            eventBus.on('afterMiss', L.AFTER_MISS.XIAOZHAO_DOUBLE_RETRY, (data) => {
                const { unit, target, log } = data;
                if (!unit.isXiaoZhaoBrother || !unit.alive || unit._xiaoZhaoDoubleStriked) return;
                if (!unit._permanentBuffs || !unit._permanentBuffs.some(b => b.key === 'doubleStrike')) return;
                if (hasBuff(A._activeBuffs, 'doubleStrike')) return;
                const s = getSkillParams('小昭', 'spiderFly') || {};
                const chance = (s.xiaoZhaoDoubleStrikeChance || 80);
                if (rand(1, 100) <= chance) {
                    unit._xiaoZhaoDoubleStriked = true;
                    unit._acted = false;
                    log.push({type:'info', text:`<span class="gold">🦋 蝶击：小昭永久概率连击触发！</span>`, isDoubleStrikeBanner:true});
                    data.retry = true;
                    data.retryTargetUid = (target && target.alive) ? target.uid : null;
                }
            });
        },
        // 裁判接口：执行飞天（由 resolveActionOrder 调用）
        executeFly(unit, incomingDmg, A, log) {
            if (!unit.isXiaoZhaoBrother || !unit.alive || unit._spiderFlying || unit._flyMode === 'spider' || unit._spiderTriggeredThisRound) return false;
            const maxHp = unit.maxHp;
            const hpAfter = Math.max(0, unit.hp - (incomingDmg || 0));
            let reason = '';
            if (!unit._spiderTriggered70 && unit.hp > maxHp * 0.7 && hpAfter <= maxHp * 0.7) {
                unit._spiderTriggered70 = true;
                reason = '血量即将低于70%';
            } else if (!unit._spiderTriggered40 && unit.hp > maxHp * 0.4 && hpAfter <= maxHp * 0.4) {
                unit._spiderTriggered40 = true;
                reason = '血量即将低于40%';
            } else if (!unit._spiderTriggeredDeath && hpAfter <= 0) {
                unit._spiderTriggeredDeath = true;
                reason = '即将阵亡';
            }
            if (!reason) return false;
            unit._spiderTriggeredThisRound = true;
            unit._spiderRemaining = (unit._spiderRemaining || 3) - 1;
            unit._spiderFlying = true;
            unit._flyMode = 'spider';
            unit._acted = true;
            emitEvent(unit, 'hp-change', { hp:unit.hp, maxHp:unit.maxHp, alive:unit.alive, atk:unit.atk, def:unit.def, _flyMode:'spider', _spiderFlying:true });
            log.push({ type:'info', text:`<span class="gold">🕷️ 飞天：${unit.name} ${reason}，免疫本次攻击的 ${incomingDmg||0} 点伤害，化为蜘蛛遁走！剩余次数：${unit._spiderRemaining}</span>`, needsSeparator: true });
            return true;
        },
        // 裁判接口：执行蛛落（由 onRoundEnd 裁判调用）
        executeDescend(unit, A, B, log) {
            spiderReturn(unit, A, B, log);
        },
        onAfterApplyDamage(unit) {
            if (!unit.isXiaoZhaoBrother || !unit.alive) return;
        }
    };
}