// modules/322-elite-mingjiao-xiaozhao-sister.js — 明教精英「小昭·姊」：组件工厂（蝶变/蝴蝶附身全套）
// V1.0.12 | 2026-11-11 消融子开关三件套（老板拍板分化三子集）：noQianKunReduce/noQianKunHeal/noQianKunAtk 各关各的（常规+白骨爪双路径同口径），noQianKun 总闸不变；子开关只跳过生效、掷骰照常消耗保序列逐位一致； 渲染联动 410：缺哪段不吐哪段（不再渲染 null）
export const VER = 'modules/322-elite-mingjiao-xiaozhao-sister.js V1.0.12';

import { getBenefitTargets } from '../core/203-battle-utils.js';
import { emitEvent, applyStatChange, refreshMaxHp, getBattleRng, addMod, removeModsByGroup, getStat, recordHpAudit, previewHeal } from '../core/214-battle-shared.js';
import { eventBus, EXECUTION_LAYER as L, EFFECT_TYPES } from '../infra/101-event-bus.js';
import { StateMachine } from '../infra/102-core-utils.js';
import { FACT_TYPES, UNIT_EVENT_TYPES, CAMP_TYPES, SIGNAL_TYPES, STATE_CHANGE_TYPES } from '../infra/106-battle-enums.js';
import { emitStateChange } from '../infra/108-state-change.js';
import { watchUnit, unwatchUnit } from '../core/220-unit-watch.js';
import { findAlive, requireSkillParams, emitHpChange } from './305-elite-helpers.js';
import { isControlled } from '../core/218-state-keys.js';

// 宿主死亡观察：sister.uid -> token。宿主一死立刻触发飞回（不必等回合末的 BUTTERFLY_RETURN 声明）
const _hostWatchers = new Map();
// 乾坤衍生减伤：dmg × 目标def / defToReduce%，保留一位小数。
// 取消 minReduce 保底：白骨爪等多段小伤害不再被保底减伤吃掉（content/001 已删 minReduce 键）。
// 普通攻击路径与白骨爪逐爪路径共用同一份公式，改公式只改这里。
function calcQianKunReduce(dmg, defStat, s) {
    const raw = dmg * defStat / (s.defToReduce * 100);
    return Math.round(raw * 10) / 10;
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
            const sister = findAlive(A, 'isXiaoZhaoSister', u => !isControlled(u));
            if (!sister) return;
            const fsm = this._buildFsm(sister, A, log);
            sister._fsm = fsm;
            const comp = this;
            // 乾坤衍生：DMG_REDUCTION 走声明，hp/atk 直改并记账
            // V1.0.9 消融子开关三件套（老板拍板分化加攻/减伤/回血三子集）：noQianKunReduce / noQianKunHeal /
            //   noQianKunAtk 各关各的，noQianKun 总闸不变（全关）。子开关只跳过「生效」，
            //   掷骰照常消耗——随机数序列逐位一致，同种子配对消融臂才干净（残血光环两半同测同款纪律）
            function submitXiaoZhaoQianKunDerivedDeclaration(data) {
    const abl = globalThis.MING_ABLATION || {};
    if (abl.noQianKun) return;   // 831 消融实验室：乾坤衍生总闸（三子集全关，831）
                const xiaoZhao = findAlive(A, 'isXiaoZhaoSister', u => !isControlled(u));
                if (!xiaoZhao) return;
                const zhang = findAlive(A, 'isZhang');
                if (zhang) return;
                const target = data.target;
                if (!target || target.camp !== CAMP_TYPES.ALLY) return;
                const atkStat = data.unit ? getStat(data.unit, 'atk') : 0;
                const defStat = getStat(target, 'def');
                const dmg = data.unit ? atkStat * (atkStat / (atkStat + defStat)) : 0;
                const s = requireSkillParams('小昭', 'qianKunDerived');
                let reduce = null;
                if (!abl.noQianKunReduce) {
                    reduce = calcQianKunReduce(dmg, defStat, s);
                    if (!data.declarations) data.declarations = [];
                    data.declarations.push({
                        type: EFFECT_TYPES.DMG_REDUCTION,
                        value: reduce,
                        source: xiaoZhao,
                        logText: null
                    });
                }
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
                    const atkTarget = aliveAllies[rng.nextInt(0, aliveAllies.length - 1)];
                    let heal = null, atkGain = null;
                    if (!abl.noQianKunHeal) {
                        const healRaw = Math.max(1, Math.floor(getStat(healTarget, 'def') * s.defToHeal));   // V1.0.6 乘法口径：defToHeal 即回血比例
                        heal = previewHeal(healTarget, healRaw);
                        applyStatChange(healTarget, 'hp', healRaw, xiaoZhao, '乾坤衍生治疗');
                        // 审计账本：记进 unit._audit.hp，零行为副作用
                        recordHpAudit(healTarget, 'qianKunHeal', heal, '乾坤衍生治疗'); // 账本记实际落地值（与 fact heal 同口径；白骨爪路径已同口径）
                    }
                    if (!abl.noQianKunAtk) {
                        atkGain = Math.max(1, Math.floor(getStat(atkTarget, 'def') * s.defToAtk));     // V1.0.6 乘法口径：defToAtk 即加攻比例
                        // 属性只算不存：加攻改走 addMod 词条（原 applyStatChange 写 unit.atk 对 getStat 无效，
                        //   真正生效的是紧随的 state._baseAtk += —— 直改基数、绕过词条系统）
                        addMod(atkTarget, 'atk', { source: '乾坤衍生', value: atkGain, ttl: 'permanent', group: 'qianKunDerived', op: 'add' });
                        emitHpChange(atkTarget);
                    }
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
    const abl = globalThis.MING_ABLATION || {};
    if (abl.noQianKun) return;   // 831 消融实验室：乾坤衍生总闸（白骨爪通道）
                const xiaoZhao = findAlive(A, 'isXiaoZhaoSister', u => !isControlled(u));
                if (!xiaoZhao) return;
                const zhang = findAlive(A, 'isZhang');
                if (zhang) return;
                const target = data.target;
                if (!target || target.camp !== CAMP_TYPES.ALLY) return;
                const s = requireSkillParams('小昭', 'qianKunDerived');
                // 减伤半：基数=本爪实际伤害（老板拍板——不再拿攻击者普攻名义伤害算，
                //   否则 0.6 的爪吃 2 点减伤直接归零）。爪小 → 套公式不足 1 → 保底取 1（最低限值），
                //   实际效果：小爪被吃光、斩杀刀减 1 无关痛痒，乾坤衍生的肉在治疗+加攻上。斩杀照杀不减。
                //   V1.0.9：noQianKunReduce 时减伤整段跳过（不写回 payload.reduce，白骨爪照扣全额）
                let reduce = 0;
                if (!abl.noQianKunReduce && !data.noReduce) {
                    const defStat = getStat(target, 'def');
                    reduce = calcQianKunReduce(data.dmg, defStat, s);
                    data.reduce = reduce;
                }
                const aliveAllies = getBenefitTargets(A);
                if (aliveAllies.length === 0) return;
                const rng = getBattleRng();
                const healTarget = aliveAllies[rng.nextInt(0, aliveAllies.length - 1)];
                const atkTarget = aliveAllies[rng.nextInt(0, aliveAllies.length - 1)];
                // 掷骰照常消耗（序列保序），只跳过生效
                let heal = null, atkGain = null;
                if (!abl.noQianKunHeal) {
                    const healRaw = Math.max(1, Math.floor(getStat(healTarget, 'def') * s.defToHeal));   // V1.0.6 乘法口径：defToHeal 即回血比例
                    heal = previewHeal(healTarget, healRaw);
                    applyStatChange(healTarget, 'hp', healRaw, xiaoZhao, '乾坤衍生治疗');
                    recordHpAudit(healTarget, 'qianKunHeal', heal, '乾坤衍生治疗');
                }
                if (!abl.noQianKunAtk) {
                    atkGain = Math.max(1, Math.floor(getStat(atkTarget, 'def') * s.defToAtk));     // V1.0.6 乘法口径：defToAtk 即加攻比例
                    addMod(atkTarget, 'atk', { source: '乾坤衍生', value: atkGain, ttl: 'permanent', group: 'qianKunDerived', op: 'add' });
                    emitHpChange(atkTarget);
                }
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
                const sis = findAlive(A, 'isXiaoZhaoSister', u => u.state._butterflyHost);
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
            const comp = this;
            if (sister.state._butterflyHost) return null;
            const flyDirection = A._flyDirection || 'left';
            // 扫描顺序从「她当前所在位置」向外展开，不能写死 [3,2,1,…]/[5,6,7,…]——
            //   原表按 4 号位邻居硬编码，她被击退到 9 号位后仍从 3/5 起扫，就出现「人在 9 号位按 4 号位飞」。
            //   左飞 = pos 递减方向、右飞 = pos 递增方向，9 格环形（pos 从 1 到 9 循环）。
            const order = [];
            const startPos = (typeof sister.pos === 'number' && sister.pos >= 1 && sister.pos <= 9) ? sister.pos : 4;
            for (let i = 1; i < 9; i++) {
                const step = flyDirection === 'left' ? -i : i;
                const p = ((startPos - 1 + step + 18) % 9) + 1;
                if (p !== startPos) order.push(p);
            }
            let host = null;
            for (const p of order) { const u = A.find(a => a.pos === p && a.alive && !a.isHorse && a.uid !== sister.uid); if (u) { host = u; break; } }
            if (!host) {
                applyStatChange(sister, 'hp', -sister.hp, null, '蝶变无宿主', false);
                log.push({ factType: FACT_TYPES.BUTTERFLY_NO_HOST, data: { unitName: sister.name, sisterUid: sister.uid } });
                return null;
            }
            // 转移比例走内容表（1 = 100%）：向右飞只转攻、向左飞只转防、血量永远转
            const bp = requireSkillParams('小昭', 'butterflyAttach');
            const atkRatio = flyDirection === 'left' ? 0 : bp.atkRatioRight;
            const defRatio = flyDirection === 'left' ? bp.defRatioLeft : 0;
            const hpRatio = bp.hpRatio;
            // 与吸星同口径：引擎一律实数，0.5 比例配奇数面板不再丢 0.5；面板显示仍走显示层取整。
            const atkTransfer = sister.state._baseAtk * atkRatio;
            const defTransfer = sister.state._baseDef * defRatio;
            const hpTransfer = sister.hp * hpRatio;
            Object.assign(sister.state, { _butterflyHpTransfer: hpTransfer });
            addMod(host, 'atk', { source: '蝶变附身', value: atkTransfer, ttl: 'attached', group: 'butterfly', op: 'add' });
            addMod(host, 'def', { source: '蝶变附身', value: defTransfer, ttl: 'attached', group: 'butterfly', op: 'add' });
            addMod(host, 'maxHp', { source: '蝶变附身', value: hpTransfer, ttl: 'attached', group: 'butterfly', op: 'add' });
            refreshMaxHp(host, sister, '蝶变附身血上限');
            emitEvent(host, UNIT_EVENT_TYPES.HP_CHANGE, { hp:host.hp, maxHp:host.maxHp, alive:host.alive, atk:getStat(host, 'atk'), def:getStat(host, 'def'), _phantomTarget:sister.uid });
            
            // 附身只对主宿主生效（文档口径：转移给宿主一个人，不设第二个受益者）
            const aliveAllies = A.filter(a => a.alive && !a.isHorse && a.uid !== sister.uid);
            const totalHp = aliveAllies.reduce((sum,a) => sum + a.hp, 0); const totalMaxHp = aliveAllies.reduce((sum,a) => sum + a.maxHp, 0);
            if (totalMaxHp > 0) {
                const newHp = sister.maxHp * (totalHp/totalMaxHp);
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
            // 宿主死亡 → 立刻飞回她当前所在的格子（不等回合末声明），并把 core/210 的
            //   「首个友方回合已触发附身」标记复位：下一位队友出手前，主循环会再跑一次
            //   onFirstAllyTurn，按原有左右取序重新挑宿主（规则不新增）。
            const prevToken = _hostWatchers.get(sister.uid);
            if (prevToken) unwatchUnit(prevToken);
            _hostWatchers.set(sister.uid, watchUnit(host, () => !host.alive, (dead, trigger) => {
                if (!dead || !sister.alive) return;
                comp.executeReturn(sister, A, (trigger && trigger.log) ? trigger.log : log);
                A._butterflyTriggered = false;
            }));
            return sister;
        },
        _executeReturn(sister, A, log) {
            // 正常飞回/宿主死亡飞回都走这里：注销宿主观察，避免重复触发
            const token = _hostWatchers.get(sister.uid);
            if (token) { unwatchUnit(token); _hostWatchers.delete(sister.uid); }
            if (!sister.alive || !sister.state._butterflyHost) return;
            // 先存档宿主 uid：下面死主分支会清空 _butterflyHost，清完再读就恒为 null（旧 bug）
            const hostUidBeforeClear = sister.state._butterflyHost;
            // 宿主记录分两档：hostRec 含已阵亡（清词条要用），host 仅存活（走正常飞回分支）。
            //   旧版一步 find(... && u.alive) 拿到 undefined，死亡分支就彻底拿不到宿主对象，词条无从清理。
            const hostRec = A.find(u => u.uid === hostUidBeforeClear) || null;
            const host = (hostRec && hostRec.alive) ? hostRec : null;
            if (!host) {
                // 关窗必清宿主蝶变词条（与下方 host-alive 分支同口径）：旧版死亡分支只清 _butterflyHost，
                //   宿主的 atk/def/maxHp 三件蝶变词条永久留在账本上——被圣火不熄复活后白吃攻/防/血上限；
                //   残留 maxHp 还会抬高下面「全队 maxHp 分母」，让姐姐飞回血量偏低（156 场 26 具宿主实证）。
                //   ★ 必须在算分母之前清，否则这一场飞回血量仍然算错。
                if (hostRec) {
                    removeModsByGroup(hostRec, 'butterfly');
                    refreshMaxHp(hostRec, sister, '蝶变飞回血上限');
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
                Object.assign(sister.state, { _flyMode: null, _untargetable: false, _butterflyHost: null });
                Object.assign(sister.state, { _butterflyHpTransfer: 0 });
                sister._fsm.transition('normal');
                emitStateChange(sister, STATE_CHANGE_TYPES.RETURNED, { hostDead: true }, log);
                // 附身窗口关闭载荷（体检总框架 D3）：带上宿主 uid，渲染器据此打 windowClosed 标记
                //   用进函数时存档的 hostUidBeforeClear，不能读已被清空的 state._butterflyHost
                log.push({ factType: FACT_TYPES.BUTTERFLY_HOST_DEAD, data: { sisterName: sister.name, sisterUid: sister.uid, hostUid: hostUidBeforeClear } });
                // 让格子当帧退出蝶形态（与下面正常飞回同款），宿主一死就立刻看到人回来，不等步末 sync
                emitEvent(sister, UNIT_EVENT_TYPES.HP_CHANGE, {
                    hp: sister.hp, maxHp: sister.maxHp, alive: sister.alive,
                    atk: sister.atk, def: sister.def, _flyMode: null, _butterflyHost: null
                });
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
            let sister = findAlive(A, 'isXiaoZhaoSister', u => u.pos === 4 && !isControlled(u));
            if (!sister) sister = findAlive(A, 'isXiaoZhaoSister', u => !isControlled(u));
            if (!sister || sister.state._butterflyHost) return null;
            const fsm = sister._fsm;
            if (fsm && fsm.is('normal') && !globalThis.MING_ABLATION?.noAttach) fsm.transition('attaching', { log });   // 831 消融实验室：附身关闭则保持地面形态
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
            const sisterForAttach = findAlive(A, 'isXiaoZhaoSister', u => !isControlled(u) && !u.state._butterflyHost);
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