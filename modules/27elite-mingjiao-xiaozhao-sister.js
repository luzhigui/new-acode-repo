// modules/27elite-mingjiao-xiaozhao-sister.js — 明教精英「小昭·姊」：组件工厂（蝶变/蝴蝶附身全套）
// V1.0.1 | 2026-10-22 | ~22700 bytes
export const VER = 'modules/27elite-mingjiao-xiaozhao-sister.js V1.0.1';
import { getSkillParams } from '../core/01config-5v5-test.js';
import { getBenefitTargets } from '../core/03battle-utils.js';
import { emitEvent, applyStatChange, refreshMaxHp, getBattleRng, addMod, removeModsByGroup, getStat, recordHpAudit, previewHeal } from '../core/13battle-shared.js';
import { eventBus, EXECUTION_LAYER as L, EFFECT_TYPES } from '../infra/50-event-bus.js';
import { StateMachine } from '../infra/51-core-utils.js';
import { FACT_TYPES, UNIT_EVENT_TYPES, CAMP_TYPES, SIGNAL_TYPES, STATE_CHANGE_TYPES } from '../infra/56-battle-enums.js';
import { emitStateChange } from '../infra/59-state-change.js';
// 乾坤衍生减伤：dmg × 目标def / defToReduce%，保留一位小数，不低于 minReduce。
// 普通攻击路径与白骨爪逐爪路径共用同一份公式，改公式只改这里；改保底值去 content 的 minReduce。
function calcQianKunReduce(dmg, defStat, s) {
    const raw = dmg * defStat / (s.defToReduce * 100);
    const min = (s.minReduce != null) ? s.minReduce : 0.5;
    return Math.max(min, Math.round(raw * 10) / 10);
}

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
            const fsm = new StateMachine(states, 'normal', {
                normal: ['attaching'],
                attaching: ['attached'],
                attached: ['returning'],
                returning: ['normal']
            }, (s) => { sister.state._fsmPhase = s; });
            sister.state._fsmPhase = 'normal';
            return fsm;
        },
        register(eventBus, A, B, log) {
            // 从 core/11 迁入：姊在场 → 友方默认飞行方向 left（幂等 ||=；
            //   原版只在 round===1 设、无人中途清空 _flyDirection，每轮重设等价）
            A._flyDirection = A._flyDirection || 'left';
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
                const reduce = calcQianKunReduce(dmg, defStat, s);
                if (!data.declarations) data.declarations = [];
                data.declarations.push({
                    type: EFFECT_TYPES.DMG_REDUCTION,
                    value: reduce,
                    source: xiaoZhao,
                    logText: null
                });
                // 姐姐附身中不再吃乾坤衍生：附身=趴在宿主头顶的蝶形态（_flyMode='butterfly'），
                //   不是地面作战单位，治疗/加攻候选池排除她；未附身（地面正常站位）时仍可被选中（老板拍板）
                // 受益池收编 getBenefitTargets（03 裁判）：此前只排蝶/蛛，垂死、妹蛛 _spiderFlying、
                //   FSM 附身、标记不可选都没排——与打人门禁同口径后这些一律不进池
                const aliveAllies = getBenefitTargets(A);
                if (aliveAllies.length > 0) {
                    const rng = getBattleRng();
                    const healTarget = aliveAllies[rng.nextInt(0, aliveAllies.length - 1)];
                    // 实际落地值（截脉/寒毒打折后）只用于飘字/审计；
                    //   落账仍传原值——applyStatChange 内部会打折，传 preview 会二次打折
                    const healRaw = Math.max(1, Math.floor(getStat(healTarget, 'def') / (s.defToHeal * 100)));
                    const heal = previewHeal(healTarget, healRaw);
                    const atkTarget = aliveAllies[rng.nextInt(0, aliveAllies.length - 1)];
                    const atkGain = Math.max(1, Math.floor(getStat(atkTarget, 'def') / (s.defToAtk * 100)));
                    applyStatChange(healTarget, 'hp', healRaw, xiaoZhao, '乾坤衍生治疗');
                    // 审计账本：记进 unit._audit.hp，零行为副作用
                    recordHpAudit(healTarget, 'qianKunHeal', healRaw, '乾坤衍生治疗');
                    // 属性只算不存：加攻改走 addMod 词条（原 applyStatChange 写 unit.atk 对 getStat 无效，
                    //   真正生效的是紧随的 state._baseAtk += —— 直改基数、绕过词条系统）
                    addMod(atkTarget, 'atk', { source: '乾坤衍生', value: atkGain, ttl: 'permanent', group: 'qianKunDerived', op: 'add' });
                    emitEvent(atkTarget, UNIT_EVENT_TYPES.HP_CHANGE, { hp: atkTarget.hp, maxHp: atkTarget.maxHp, alive: atkTarget.alive, atk: getStat(atkTarget, 'atk'), def: getStat(atkTarget, 'def') });
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
            // 白骨爪连锁逐爪的乾坤衍生（core/16 CLAW_CHAIN 每爪【扣血前】广播，本处写回 payload.reduce 由它落地减伤）：
            //   减伤与治疗/加攻都比照常规路径（BEFORE_DAMAGE_CALC）同式；斩杀那一刀 payload.noReduce 照杀不减，只给治疗+加攻。
            //   门槛与常规乾坤衍生一致（姊在场存活未眩晕、张无忌不在场、被爪者是友方）；
            //   受益池继续走 getBenefitTargets。条目随 payload 回传，由 core/10 落攻击组 entries。
            function submitClawQianKunDerived(data) {
                const xiaoZhao = A.find(u => u.isXiaoZhaoSister && u.alive && !u.state._stunned);
                if (!xiaoZhao) return;
                const zhang = A.find(u => u.isZhang && u.alive);
                if (zhang) return;
                const target = data.target;
                if (!target || target.camp !== CAMP_TYPES.ALLY) return;
                const s = getSkillParams('小昭', 'qianKunDerived');
                if (!s) throw new Error('缺技能参数: 小昭.qianKunDerived');
                // 减伤半：基数=本爪实际伤害（老板拍板——不再拿攻击者普攻名义伤害算，
                //   否则 0.6 的爪吃 2 点减伤直接归零）。爪小 → 套公式不足 1 → 保底取 1（最低限值），
                //   实际效果：小爪被吃光、斩杀刀减 1 无关痛痒，乾坤衍生的肉在治疗+加攻上。斩杀照杀不减。
                let reduce = 0;
                if (!data.noReduce) {
                    const defStat = getStat(target, 'def');
                    reduce = calcQianKunReduce(data.dmg, defStat, s);
                    data.reduce = reduce;
                }
                const aliveAllies = getBenefitTargets(A);
                if (aliveAllies.length === 0) return;
                const rng = getBattleRng();
                const healTarget = aliveAllies[rng.nextInt(0, aliveAllies.length - 1)];
                // 实际落地值只用于飘字/审计；落账传原值（applyStatChange 内部打折，传 preview 会二次打折）
                const healRaw = Math.max(1, Math.floor(getStat(healTarget, 'def') / (s.defToHeal * 100)));
                const heal = previewHeal(healTarget, healRaw);
                const atkTarget = aliveAllies[rng.nextInt(0, aliveAllies.length - 1)];
                const atkGain = Math.max(1, Math.floor(getStat(atkTarget, 'def') / (s.defToAtk * 100)));
                applyStatChange(healTarget, 'hp', healRaw, xiaoZhao, '乾坤衍生治疗');
                // 审计账本：记进 unit._audit.hp，零行为副作用
                recordHpAudit(healTarget, 'qianKunHeal', heal, '乾坤衍生治疗');
                // 属性只算不存：加攻改走 addMod 词条（同常规乾坤衍生，原直改 _baseAtk 绕过词条）
                addMod(atkTarget, 'atk', { source: '乾坤衍生', value: atkGain, ttl: 'permanent', group: 'qianKunDerived', op: 'add' });
                emitEvent(atkTarget, UNIT_EVENT_TYPES.HP_CHANGE, { hp: atkTarget.hp, maxHp: atkTarget.maxHp, alive: atkTarget.alive, atk: getStat(atkTarget, 'atk'), def: getStat(atkTarget, 'def') });
                if (!data.derivedEntries) data.derivedEntries = [];
                const entryData = {
                    targetName: target.name,
                    healTargetName: healTarget.name,
                    heal,
                    atkTargetName: atkTarget.name,
                    atkGain,
                    healTargetUid: healTarget.uid,
                    atkTargetUid: atkTarget.uid
                };
                if (reduce > 0) entryData.reduce = reduce;
                data.derivedEntries.push({ factType: FACT_TYPES.QIAN_KUN_DERIVED, data: entryData });
            }
            eventBus.on(SIGNAL_TYPES.CLAW_HIT_APPLIED, L.CLAW_HIT_APPLIED.XIAOZHAO_QIAN_KUN, (data) => {
                submitClawQianKunDerived(data);
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
            const flyDirection = A._flyDirection || 'left';
            const order = flyDirection === 'left' ? [3,2,1,9,8,7,6,5] : [5,6,7,8,9,1,2,3];
            let host = null;
            for (const p of order) { const u = A.find(a => a.pos === p && a.alive && !a.isHorse && a.uid !== sister.uid); if (u) { host = u; break; } }
            if (!host) {
                applyStatChange(sister, 'hp', -sister.hp, null, '蝶变无宿主', false);
                log.push({ factType: FACT_TYPES.BUTTERFLY_NO_HOST, data: { unitName: sister.name, sisterUid: sister.uid } });
                return null;
            }
            // 转移比例走内容表（1 = 100%）：向右飞只转攻、向左飞只转防、血量永远转
            const bp = getSkillParams('小昭', 'butterflyAttach');
            if (!bp) throw new Error('缺技能参数: 小昭.butterflyAttach');
            const atkRatio = flyDirection === 'left' ? 0 : bp.atkRatioRight;
            const defRatio = flyDirection === 'left' ? bp.defRatioLeft : 0;
            const hpRatio = bp.hpRatio;
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
                applyStatChange(sister, 'hp', delta, null, '蝶变附身血量', false, false);
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
                    applyStatChange(sister, 'hp', delta, null, '蝶变飞回血量', false, false);
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
                applyStatChange(sister, 'hp', delta, null, '蝶变飞回血量', false, false);
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
            // 补清 _untargetable（对齐下方"宿主已死"路径）：此前宿主存活飞回漏清，
            //   姐姐整场不可被选 → 敌方越过的假前排同列队友，也是体检139"姐姐零承伤"的真根因
            Object.assign(sister.state, { _flyMode: null, _untargetable: false, _butterflyHost: null });
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
        // 从 core/11 迁入的相位钩子（原蝶附身触发内联版）：
        //   首个友方回合开始时找可附身的姊（未眩晕、未附身）触发附身；
        //   返回 true = 插播了演出（主循环 yield 一步）——与原版「预检通过即 yield」口径一致
        onFirstAllyTurn(A, B, log) {
            const sisterForAttach = A.find(u => u.isXiaoZhaoSister && u.alive && !u.state._stunned && !u.state._butterflyHost);
            if (!sisterForAttach) return false;
            this.executeAttach(A, log);
            return true;
        },
    };
}

// 小昭·妹 — 飞天三档 + 蜘蛛卵
// 三档判定·落点判据：只看本次伤害落点 hpAfter 掉进哪一档，未消费的最高档优先补——
//   被毒/反伤蹭过血线不算触发（它们不走 BEFORE_DAMAGE_APPLY），机会自动顺延到下一次正规攻击。
//   三档 = 70% / 40% / 致死；致死档两种花法：正常攻击致死 → 飞天免死，毒/反伤致死 → 蜘蛛卵。
