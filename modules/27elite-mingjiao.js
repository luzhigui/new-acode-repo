// V7.0.1 | ~74500 bytes | 2026-10-14 体检第 88 轮转交：toSpiderEgg 结茧增量先算局部（eggAtkDelta/eggDefDelta）
//   写进「蜘蛛卵」announce fact（数值对照器 SPIDER_EGG 契约声明侧；与 addMod 同变量同值，零行为变化）
//   V7.0.0 杨逍重做（拍板）：弱精英 m104；选敌优先未行动；点穴=眩晕😵+禁疗❌3回合同时挂；敌方全行动→飞行默认+追击×1.3
//   同轮：修永久 carry 无限叠加 bug（蛛变声明续 carry 的 addMod 加 group 去重门控，只续一份常驻）
// ── 更早版本见 记录-更改履历.md
export const VER = 'modules/27elite-mingjiao.js V7.0.1';

import { registerElite, registerRoundComponent, registerBuffRoundTransformer, registerStateTransition, registerHolyFlameEnhancer } from '../core/08-elite-registry.js';
import { CONFIG, getSkillParams, getMechanicField } from '../core/01config-5v5-test.js';
import { hasBuff, getZhangNearTaunt, getBenefitTargets } from '../core/03battle-utils.js';
import { spawnHorse, spawnUnit } from '../core/05battle-horse.js';
import { applyHeroFlags, getRoleBonus } from '../core/02unit.js';
import { registerTargetPoolFilter } from '../core/07-target-strategies.js';
import { spiderTransform, spiderReturn } from '../modules/20elite-skills.js';
import { emitEvent, applyStatChange, refreshMaxHp, getBattleRng, addMod, removeModsByGroup, getStat } from '../core/13battle-shared.js';
import { eventBus, EXECUTION_LAYER as L, EFFECT_TYPES } from '../infra/50-event-bus.js';
import { StateMachine } from '../infra/51-core-utils.js';
import { FACT_TYPES, BUFF_TYPES, UNIT_EVENT_TYPES, CAMP_TYPES, ROLE_TYPES, SIGNAL_TYPES, STATE_CHANGE_TYPES, MECHANIC_EFFECT_TYPES } from '../infra/56-battle-enums.js';
import { emitStateChange } from '../infra/59-state-change.js';
import { watchUnit } from '../core/19unit-watch.js';

// 2026-09-02 定案：本文件的 FSM（张无忌/小昭·姊/小昭·妹）不做声明化、不搬表。
//   理由：有状态机的角色仅 3 个，转移规则在组件内一眼可见；声明化只能挪骨架、
//   动作仍须写 JS，收益不抵成本。保持组件内硬编码，此决定不再反复讨论。

// 张无忌
// 2026-10-08 V7.5.19 从 core/13 逐字迁入（老板拍板「搬掉」——core 是公共地基不住英雄名）：
//   张无忌近身切换（乾坤大挪移变近战）。全库唯一调用点=下方张无忌组件 switching.onEnter。
//   唯一改名：emitCoreEvent → emitEvent（core/13 的模块内私有名，此处用其导出别名，同一实现）。
function checkZhangSwitch(A, log) {
    let zhang = A.find(c => c.isZhang && c.alive && !c.state._zhangSwitched);
    if (!zhang) return;
    // 口径同 27 组件 watcher：他成为所在列最靠前的存活单位才切（同列无 pos 更小的存活非马队友）
    const hasFrontAlly = A.some(c => c.alive && !c.isHorse && c.uid !== zhang.uid
        && (c.pos - 1) % 3 === (zhang.pos - 1) % 3 && c.pos < zhang.pos);
    if (!hasFrontAlly) {
        zhang.rangedForm = false;
        // 加成倍率走内容表（相对战士职业加成），缺失即抛错
        const mul = getSkillParams('张无忌', 'nearSwitch');
        if (!mul) throw new Error('缺技能参数: 张无忌.nearSwitch');
        const warriorBonus = getRoleBonus(ROLE_TYPES.WARRIOR);
        const atkGain = warriorBonus.atk * mul.atkMul;
        const defGain = warriorBonus.def * mul.defMul;
        const maxHpGain = warriorBonus.maxHp * mul.maxHpMul;
        addMod(zhang, 'atk', { source: '近战切换', value: atkGain, ttl: 'permanent', group: 'zhangSwitch', op: 'add' });
        addMod(zhang, 'def', { source: '近战切换', value: defGain, ttl: 'permanent', group: 'zhangSwitch', op: 'add' });
        addMod(zhang, 'maxHp', { source: '近战切换', value: maxHpGain, ttl: 'permanent', group: 'zhangSwitch', op: 'add' });
        refreshMaxHp(zhang, null, '乾坤大挪移变身');
        zhang.role = ROLE_TYPES.WARRIOR;
        zhang.state._resting = false; Object.assign(zhang.state, { _zhangSwitched: true });
        emitEvent(zhang, UNIT_EVENT_TYPES.ZHANG_SWITCH, {
            atk: getStat(zhang, 'atk'),
            def: getStat(zhang, 'def'),
            maxHp: getStat(zhang, 'maxHp'),
            hp: zhang.hp,
            role: zhang.role,
            rangedForm: false,
            _baseAtk: zhang.state._baseAtk,
            _baseDef: zhang.state._baseDef,
            _baseMaxHp: zhang.state._baseMaxHp
        });
        emitStateChange(zhang, STATE_CHANGE_TYPES.TRANSFORMED, { newRole: ROLE_TYPES.WARRIOR }, log);
        log.push({
            factType: FACT_TYPES.ZHANG_SWITCH,
            data: {
                zhang: { uid: zhang.uid, name: zhang.name, pos: zhang.pos },
                atkGain,
                defGain,
                maxHpGain
            }
        });
    }
}

export function createZhangWujiComponent() {
    return {
        name: '张无忌',
        _buildFsm(zhang, A, log) {
            let fsm;
            // 切近战口径：他成为「所在列最靠前的存活单位」才切——同列存在任何 pos 更小的存活非马队友就仍是远程。
            //   中排(4-6)时等价于旧的「1/2/3 同列最前排」判定；被击退/换位到后排(7-9)时，4/5/6 的中排队友也算前方有人。
            const hasFrontAlly = A.some(c => c.alive && !c.isHorse && c.uid !== zhang.uid
                && (c.pos - 1) % 3 === (zhang.pos - 1) % 3 && c.pos < zhang.pos);
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
            }, (s) => { zhang.state._fsmPhase = s; });
            zhang.state._fsmPhase = initial;
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
                // 条件：存活 + 尚未切换 + 处于远程形态 + 他已是同列最前排（同列无 pos 更小的存活队友）
                if (!zhang.alive || zhang.state._zhangSwitched || !fsm.is('ranged')) return false;
                const hasFrontAlly = A.some(c => c.alive && !c.isHorse && c.uid !== zhang.uid
                    && (c.pos - 1) % 3 === (zhang.pos - 1) % 3 && c.pos < zhang.pos);
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
                if (unit.nearAtkCount >= CONFIG.ZHANG_NEAR_ATK_LIMIT) {
                    if (!fsm.is('ronghui')) fsm.transition('ronghui');
                    const extra = Math.floor(Math.abs(getStat(target, 'atk') - getStat(target, 'def')) * CONFIG.ZHANG_RONGHUI_RATIO);
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
                    // 2026-09-27 补 targetUid / targetAlive：render/38 扫 entries 时据此在目标头上补一条额外伤害飘字
                    // （这笔 BONUS_DMG 在主攻击结算之后单独扣血，不进主攻击 dmg，此前完全没有飘字）；
                    // targetAlive 与 core/16 裁定器的应用条件（decl.target.alive）一致——已死目标不扣这笔，也就不飘字
                    group.data.entries.push({ factType: FACT_TYPES.RONG_HUI_BONUS, data: { unitName: unit.name, extra, targetUid: target.uid, targetAlive: target.alive, targetAtk: Math.floor(getStat(target, 'atk')), targetDef: Math.floor(getStat(target, 'def')) } });
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
            // 行动过仍可闪避 + 不参与飞行跳前排选敌：由组件声明，core 不再认 isWei
            Object.assign(wei.state, { _canAlwaysDodge: true });

            // 韦一笑吸星：判定后推 WEI_HEAL 声明（纯函数）
            function submitWeiLeechDeclaration(data) {
                const { unit, target, reboundDmg, declarations } = data;
                if (!target.isWei || !target.alive) return;
                // 吸血率真值唯一来源：韦一笑 mechanics 的 leech 原语（与命中吸血同源），不再另存 skills.params 副本
                const leechMin = getMechanicField('韦一笑', MECHANIC_EFFECT_TYPES.ON_HIT.LEECH, 'minRatio');
                const leechMax = getMechanicField('韦一笑', MECHANIC_EFFECT_TYPES.ON_HIT.LEECH, 'maxRatio');
                if (typeof leechMin !== 'number' || typeof leechMax !== 'number') {
                    throw new Error('缺机制参数: 韦一笑.mechanics.leech.minRatio/maxRatio');
                }
                const lostPct = (target.maxHp - target.hp) / target.maxHp;
                const leechRate = leechMin + (leechMax - leechMin) * lostPct;
                const heal = Math.max(1, Math.floor(reboundDmg * leechRate));
                const wasFullHp = (target.hp >= target.maxHp);
                const oldMaxHp = target.maxHp;
                const newMaxHp = target.maxHp + heal;
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
            // 2026-10-08 从 core/11 迁入：姊在场 → 友方默认飞行方向 left（幂等 ||=；
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
                const reduce = Math.max(1, Math.floor(dmg * defStat / (s.defToReduce * 100)));
                if (!data.declarations) data.declarations = [];
                data.declarations.push({
                    type: EFFECT_TYPES.DMG_REDUCTION,
                    value: reduce,
                    source: xiaoZhao,
                    logText: null
                });
                // 2026-10-06 姐姐附身中不再吃乾坤衍生：附身=趴在宿主头顶的蝶形态（_flyMode='butterfly'），
                //   不是地面作战单位，治疗/加攻候选池排除她；未附身（地面正常站位）时仍可被选中（老板拍板）
                // 2026-10-07 受益池收编 getBenefitTargets（03 裁判）：此前只排蝶/蛛，垂死、妹蛛 _spiderFlying、
                //   FSM 附身、标记不可选都没排——与打人门禁同口径后这些一律不进池
                const aliveAllies = getBenefitTargets(A);
                if (aliveAllies.length > 0) {
                    const rng = getBattleRng();
                    const healTarget = aliveAllies[rng.nextInt(0, aliveAllies.length - 1)];
                    const heal = Math.max(1, Math.floor(getStat(healTarget, 'def') / (s.defToHeal * 100)));
                    const atkTarget = aliveAllies[rng.nextInt(0, aliveAllies.length - 1)];
                    const atkGain = Math.max(1, Math.floor(getStat(atkTarget, 'def') / (s.defToAtk * 100)));
                    applyStatChange(healTarget, 'hp', heal, xiaoZhao, '乾坤衍生治疗');
                    // 纯记账（体检对照 qianKunHeal group，2026-10-13 第 84 轮）：只 push _mods['hp']，零行为副作用
                    addMod(healTarget, 'hp', { source: '乾坤衍生治疗', value: heal, ttl: 'permanent', group: 'qianKunHeal', op: 'add' });
                    // 2026-10-11 属性只算不存：加攻改走 addMod 词条（原 applyStatChange 写 unit.atk 对 getStat 无效，
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
                // 减伤半：基数=本爪实际伤害（2026-10-09 老板拍板——不再拿攻击者普攻名义伤害算，
                //   否则 0.6 的爪吃 2 点减伤直接归零）。爪小 → 套公式不足 1 → 保底取 1（最低限值），
                //   实际效果：小爪被吃光、斩杀刀减 1 无关痛痒，乾坤衍生的肉在治疗+加攻上。斩杀照杀不减。
                let reduce = 0;
                if (!data.noReduce) {
                    const defStat = getStat(target, 'def');
                    reduce = Math.max(1, Math.floor(data.dmg * defStat / (s.defToReduce * 100)));
                    data.reduce = reduce;
                }
                const aliveAllies = getBenefitTargets(A);
                if (aliveAllies.length === 0) return;
                const rng = getBattleRng();
                const healTarget = aliveAllies[rng.nextInt(0, aliveAllies.length - 1)];
                const heal = Math.max(1, Math.floor(getStat(healTarget, 'def') / (s.defToHeal * 100)));
                const atkTarget = aliveAllies[rng.nextInt(0, aliveAllies.length - 1)];
                const atkGain = Math.max(1, Math.floor(getStat(atkTarget, 'def') / (s.defToAtk * 100)));
                applyStatChange(healTarget, 'hp', heal, xiaoZhao, '乾坤衍生治疗');
                // 纯记账（体检对照 qianKunHeal group，2026-10-13 第 84 轮）：只 push _mods['hp']，零行为副作用
                addMod(healTarget, 'hp', { source: '乾坤衍生治疗', value: heal, ttl: 'permanent', group: 'qianKunHeal', op: 'add' });
                // 2026-10-11 属性只算不存：加攻改走 addMod 词条（同常规乾坤衍生，原直改 _baseAtk 绕过词条）
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
            // 2026-10-03 补清 _untargetable（对齐下方"宿主已死"路径）：此前宿主存活飞回漏清，
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
        // 2026-10-08 从 core/11 迁入的相位钩子（原蝶附身触发内联版）：
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

// 小昭·妹 — 飞天三档 + 蜘蛛卵（2026-10-13 重做）
// 三档判定·落点判据：只看本次伤害落点 hpAfter 掉进哪一档，未消费的最高档优先补——
//   被毒/反伤蹭过血线不算触发（它们不走 BEFORE_DAMAGE_APPLY），机会自动顺延到下一次正规攻击。
//   三档 = 70% / 40% / 致死；致死档两种花法：正常攻击致死 → 飞天免死，毒/反伤致死 → 蜘蛛卵。
const SPIDER_TIER_REASON = { '70': '血量即将低于70%', '40': '血量即将低于40%', 'death': '即将阵亡', hatch: '蜘蛛孵化' };
function decideSpiderTier(state, maxHp, hpAfter, fp) {
    if (!state._spiderTriggered70 && hpAfter <= maxHp * fp.hpThresholds[0]) return '70';
    if (!state._spiderTriggered40 && hpAfter <= maxHp * fp.hpThresholds[1]) return '40';
    if (!state._spiderTriggeredDeath && hpAfter <= 0) return 'death';
    return null;
}
function markSpiderTier(state, tier) {
    if (tier === '70') state._spiderTriggered70 = true;
    else if (tier === '40') state._spiderTriggered40 = true;
    else if (tier === 'death') state._spiderTriggeredDeath = true;
    state._spiderTriggeredThisRound = true;
}
// 卵属性词条逆算：getStat = (base+addSum)×(1+mulSum)，令结果= targetVal 反推 add 词条值（孵化时按 group 整组移除恢复）
function eggModValue(unit, stat, targetVal) {
    const cur = getStat(unit, stat);
    let mulSum = 0;
    for (const m of (unit._mods && unit._mods[stat]) || []) if (m.op === 'mul') mulSum += m.value;
    return (targetVal - cur) / (1 + mulSum);
}

// 结茧（2026-10-13）：毒/反伤致死不走 BEFORE_DAMAGE_APPLY、飞天接不住 → ON_BEFORE_DEATH 清 _pendingDeath
//   取消死亡，原地变 0 攻 / eggDef 防 / 满血的卵（占格、不可行动、可被打碎=真死）。致死档在此落账。
function toSpiderEgg(u, outLog) {
    const fp = getSkillParams('小昭', 'spiderFly');
    if (!fp) throw new Error('缺技能参数: 小昭.spiderFly');
    u.state._pendingDeath = false;
    Object.assign(u.state, { _spiderEgg: true, _spiderEggRounds: 0, _spiderTriggeredDeath: true });
    // 结茧属性增量先算局部（体检第 88 轮转交：写进 announce fact 供数值对照器 SPIDER_EGG 契约做声明侧）
    const eggAtkDelta = eggModValue(u, 'atk', 0);
    const eggDefDelta = eggModValue(u, 'def', fp.eggDef);
    addMod(u, 'atk', { source: '蜘蛛卵', value: eggAtkDelta, ttl: 'permanent', group: 'spiderEgg', op: 'add' });
    addMod(u, 'def', { source: '蜘蛛卵', value: eggDefDelta, ttl: 'permanent', group: 'spiderEgg', op: 'add' });
    if (u.hp < u.maxHp) applyStatChange(u, 'hp', u.maxHp - u.hp, null, '蜘蛛结茧', false, false);
    emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: getStat(u, 'atk'), def: getStat(u, 'def') });
    outLog.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: { unitName: u.name, unitUid: u.uid, camp: u.camp, skillName: '蜘蛛卵', note: `🥚 ${u.name} 原地结茧：0 攻 / ${fp.eggDef} 防 / 满血，不可行动（打碎即死）`, floatText: '🥚', floatUid: u.uid, eggAtkDelta, eggDefDelta } });
}

// 孵化（2026-10-13）：卵挺过「本回合+下回合」两个回合末 → 保留 eggHatchHpRatio 血、攻防恢复死亡前、
//   三档全作废（再死=真死），直接飞天 → 落地蛛袭（spiderReturn 自带随机目标；_spiderEggHatch 跳过落地回血）
function hatchSpiderEgg(u, outLog) {
    const fp = getSkillParams('小昭', 'spiderFly');
    if (!fp) throw new Error('缺技能参数: 小昭.spiderFly');
    Object.assign(u.state, {
        _spiderEgg: false, _spiderEggUsed: true, _spiderEggHatch: true, _spiderRemaining: 0,
        _spiderTriggered70: true, _spiderTriggered40: true, _spiderTriggeredDeath: true
    });
    removeModsByGroup(u, 'spiderEgg');
    const targetHp = Math.floor(u.maxHp * fp.eggHatchHpRatio);
    if (u.hp > targetHp) applyStatChange(u, 'hp', -(u.hp - targetHp), null, '蜘蛛孵化', false);
    emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: getStat(u, 'atk'), def: getStat(u, 'def') });
    outLog.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: { unitName: u.name, unitUid: u.uid, camp: u.camp, skillName: '蜘蛛孵化', note: `🕷️ ${u.name} 破茧孵化：保留 ${Math.round(fp.eggHatchHpRatio * 100)}% 血、攻防恢复，直接飞天！`, floatText: '🕷️', floatUid: u.uid } });
    const fsm = u._fsm;
    if (fsm && fsm.is('normal')) {
        const flyData = { tier: 'hatch', reason: SPIDER_TIER_REASON.hatch, incomingDmg: 0, log: outLog };
        fsm.transition('flying', flyData);
        if (flyData._flyFactData) outLog.push({ factType: FACT_TYPES.SPIDER_FLY, data: flyData._flyFactData });
        if (fsm.is('flying')) fsm.transition('descending', { log: outLog });
        if (fsm.is('descending')) fsm.transition('normal');
    }
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
                        const incomingDmg = data ? data.incomingDmg : 0;
                        // 飞天次数上限唯一来源：内容表 小昭.spiderFly.params（core/17 state 默认值只是镜像）
                        const flyParams = getSkillParams('小昭', 'spiderFly');
                        if (!flyParams) throw new Error('缺技能参数: 小昭.spiderFly');
                        // 档位消费（2026-10-13）：档位由 decideSpiderTier 在触发点算好随 data.tier 带入，这里只落账；
                        //   hatch（蜘蛛孵化）不占档——孵化时三档已全作废
                        const tier = (data && data.tier) || 'death';
                        const reason = (data && data.reason) || SPIDER_TIER_REASON[tier];
                        markSpiderTier(brother.state, tier);
                        const esRemaining = brother.state._spiderRemaining;
                        Object.assign(brother.state, { _spiderRemaining: Math.max(0, (esRemaining ?? flyParams.maxTriggers) - 1) });
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
            const fsm = new StateMachine(states, 'normal', {
                normal: ['flying', 'transforming'],
                transforming: ['normal'],
                flying: ['descending'],
                descending: ['normal'],
                dead: []
            }, (s) => { brother.state._fsmPhase = s; });
            brother.state._fsmPhase = 'normal';
            return fsm;
        },
        register(eventBus, A, B, log) {
            const brother = A.find(u => u.isXiaoZhaoBrother && u.alive);
            if (!brother) return;
            const fsm = this._buildFsm(brother, A, B, log);
            brother._fsm = fsm;
            // 蛛化飞天免疫：落点判据三档（顺延见 decideSpiderTier 注释），免疫本次伤害
            function submitSpiderFlyDeclaration(data) {
                if (data.target.uid !== brother.uid || !data.A) return;
                if (fsm.is('flying') || fsm.is('dead')) return;
                if (brother.state._spiderEgg) return;
                const fp = getSkillParams('小昭', 'spiderFly');
                if (!fp) throw new Error('缺技能参数: 小昭.spiderFly');
                const hpAfter = Math.max(0, brother.hp - (data.dmg || 0));
                const tier = decideSpiderTier(brother.state, brother.maxHp, hpAfter, fp);
                if (tier) {
                    if (!data.declarations) data.declarations = [];
                    const flyData = { tier, reason: SPIDER_TIER_REASON[tier], incomingDmg: data.dmg, log: data.log || log };
                    fsm.transition('flying', flyData);
                    data.declarations.push({ immune: true, flyData: flyData._flyFactData || null, reason: flyData._flyFactData ? null : '🕷️ 飞天：免疫本次伤害' });
                }
            }
            eventBus.on(SIGNAL_TYPES.BEFORE_DAMAGE_APPLY, L.BEFORE_DAMAGE_APPLY.SPIDER_IMMUNE, (data) => {
                submitSpiderFlyDeclaration(data);
            });
            // 飞天/蜘蛛卵状态跳过行动（卵不可行动，老板定稿）
            function submitSpiderSkipDeclaration(data) {
                if (!data.unit.isXiaoZhaoBrother || !data.unit.alive) return;
                if (fsm.is('flying') || fsm.is('dead') || data.unit.state._spiderEgg) {
                    data.declaration.skip = true;
                }
            }
            // 永久惑心：小昭·妹在场时敌方攻击 15% 概率误伤
            function submitSpiderMindControlDeclaration(data) {
                if (data.unit.camp !== CAMP_TYPES.ENEMY) return;
                if (!brother || !brother.alive || !brother.state._permanentBuffs || !brother.state._permanentBuffs.some(b => b.key === BUFF_TYPES.MIND_CONTROL)) return;
                if (hasBuff(data.enemySide._activeBuffs, BUFF_TYPES.MIND_CONTROL)) return;
                if (getBattleRng().next() < CONFIG.SPIDER_MIND_CONTROL_CHANCE) {
                    const fakeTarget = data.allySide.find(u => u.alive && !u.isHorse && u.uid !== data.unit.uid);
                    if (fakeTarget) {
                        data.declaration.targetResult = fakeTarget;
                        // 2026-10-11 去名字字面量：deceiver 用本人名，另打 deceiverIsSpider 供渲染层分支
                        //   （render/35 原先拿 fact.deceiver === '小昭·妹' 判蝶舞迷心，渲染层不该认英雄名）
                        data.declaration.phantomFact = { factType: FACT_TYPES.PHANTOM_CONFUSE, data: { unitName: data.unit.name, deceiver: brother.name, deceiverIsSpider: true, targetName: fakeTarget.name } };
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
            // 蛛变：每回合随机变职业并结算永久海克斯（蜘蛛卵期间冻结：不蛛变不召唤）
            function submitSpiderTransformDeclaration(data) {
                const { A, B, log } = data;
                const bro = A.find(u => u.isXiaoZhaoBrother && u.alive);
                if (!bro) return;
                if (bro.state._spiderEgg) return;
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
                // 去重门控（2026-10-13 修无限叠加 bug）：永久 carry 只续一份常驻——_mods 里已有该 group 即已续过，
                //   不再 addMod（此前每回合蛛变叠一笔 +3/+4/+20，R5-R15 叠 11 笔、血上限 132→577）
                const carryApplied = bro._mods?.atk?.some(m => m.group === 'xiaoZhaoCarry');
                if (!hasTeamCarry && !carryApplied && bro.state._permanentBuffs?.some(b => b.key === BUFF_TYPES.CARRY) && bro.state._baseMaxHp !== undefined) {
                    const carryMods = CONFIG.XIAO_ZHAO_CARRY_MODS;
                    addMod(bro, 'atk', { source: '小昭·妹永久carry', value: carryMods.atk, ttl: 'permanent', group: 'xiaoZhaoCarry', op: 'add' });
                    addMod(bro, 'def', { source: '小昭·妹永久carry', value: carryMods.def, ttl: 'permanent', group: 'xiaoZhaoCarry', op: 'add' });
                    addMod(bro, 'maxHp', { source: '小昭·妹永久carry', value: carryMods.maxHp, ttl: 'permanent', group: 'xiaoZhaoCarry', op: 'add' });
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
                // 概率口径 1 = 100%，比较前 ×100 回到百分点域（骰子仍是 nextInt(1, 100)）
                const chancePct = s.xiaoZhaoDoubleStrikeChance * 100;
                if (getBattleRng().nextInt(1, 100) <= chancePct) {
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
            // 蜘蛛卵（2026-10-13）：毒/反伤致死 → 结茧续命。正常攻击致死走致死档飞天、到不了这里；
            //   打碎的卵（_spiderEgg）/ 本局结过茧（_spiderEggUsed）/ 致死档已花（_spiderTriggeredDeath）= 真死
            eventBus.on(SIGNAL_TYPES.ON_BEFORE_DEATH, L.ON_BEFORE_DEATH.SPIDER_EGG, (data) => {
                for (const u of data.units) {
                    if (!u.isXiaoZhaoBrother || !u.alive) continue;
                    if (u.state._spiderEgg || u.state._spiderEggUsed || u.state._spiderTriggeredDeath) continue;
                    toSpiderEgg(u, data.log);
                }
            });
            // 卵计时：结茧当回合末 +1、下回合末 +2 → 先于蛛落（SPIDER_RETURN:10）孵化
            eventBus.on(SIGNAL_TYPES.ON_ROUND_END, L.ROUND_END.SPIDER_EGG, (data) => {
                const bro = A.find(u => u.isXiaoZhaoBrother && u.alive && u.state._spiderEgg);
                if (!bro) return;
                bro.state._spiderEggRounds = (bro.state._spiderEggRounds || 0) + 1;
                if (bro.state._spiderEggRounds >= 2) hatchSpiderEgg(bro, data.log || log);
            });
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, L.ROUND_START.SPIDER_TRANSFORM, (data) => {
                submitSpiderTransformDeclaration(data);
            });
            eventBus.on(SIGNAL_TYPES.AFTER_MISS, L.AFTER_MISS.PERMANENT_DOUBLE_RETRY, (data) => {
                submitXiaoZhaoDoubleStrikeDeclaration(data);
            });
        },
        executeFly(unit, incomingDmg, A, log) {
            if (!unit.isXiaoZhaoBrother || !unit.alive || unit.state._spiderEgg) return false;
            const fsm = unit._fsm;
            if (!fsm || !fsm.is('normal')) return false;
            const fp = getSkillParams('小昭', 'spiderFly');
            if (!fp) throw new Error('缺技能参数: 小昭.spiderFly');
            // 2026-10-13 与 submitSpiderFlyDeclaration 共用落点判据（顺延语义一致）
            const hpAfter = Math.max(0, unit.hp - (incomingDmg || 0));
            const tier = decideSpiderTier(unit.state, unit.maxHp, hpAfter, fp);
            if (!tier) return false;
            const flyData = { tier, reason: SPIDER_TIER_REASON[tier], incomingDmg, log };
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
                    if (growRng.next() >= summon.grow.prob) continue;
                    const spec = cub.pos <= summon.grow.frontMax ? summon.grow.front : summon.grow.back;
                    // spec 里写的是【基础值】，目标形态的最终值 = 基础值 + 该职业加成
                    //   （2026-09-26 口径统一：m 是基础预算，职业加成由引擎加、不写进配置）。
                    //   基线用 cub 配置值：幼狮自身豁免加成，且幼狮期间吃到的振奋要留在成长值之上。
                    const bonus = getRoleBonus(spec.role);
                    const tgtAtk = spec.atk + bonus.atk;
                    const tgtDef = spec.def + bonus.def;
                    const tgtMaxHp = spec.maxHp + bonus.maxHp;
                    // 属性只算不存：成长差值登记为永久词条；maxHp 另走 refreshMaxHp 同步（上限升则当前血等量加）
                    // 2026-10-02 差值先落变量：fact 增量字段与 addMod 入参必须同源（体检对照同一表达式）
                    const atkDelta = tgtAtk - summon.cub.atk;
                    const defDelta = tgtDef - summon.cub.def;
                    const maxHpDelta = tgtMaxHp - summon.cub.maxHp;
                    addMod(cub, 'atk', { source: '幼狮成长', value: atkDelta, ttl: 'permanent', group: 'lionGrow', op: 'add' });
                    addMod(cub, 'def', { source: '幼狮成长', value: defDelta, ttl: 'permanent', group: 'lionGrow', op: 'add' });
                    addMod(cub, 'maxHp', { source: '幼狮成长', value: maxHpDelta, ttl: 'permanent', group: 'lionGrow', op: 'add' });
                    refreshMaxHp(cub, null, '幼狮成长');
                    cub.name = spec.name;
                    cub.role = spec.role;
                    cub.m = spec.m;            // m 同步为目标形态的基础预算（原先缺这行，成形后的狮子一直挂着幼狮的 m=20）
                    applyHeroFlags(cub);       // 按新名字补 isLionMale / isLioness
                    cub.isLionCub = false;     // 形态标记互斥，旧形态显式清掉
                    emitEvent(cub, UNIT_EVENT_TYPES.HP_CHANGE, { hp: cub.hp, maxHp: cub.maxHp, alive: cub.alive, role: cub.role, atk: getStat(cub, 'atk'), def: getStat(cub, 'def') });
                    if (data && data.log) {
                        data.log.push({ factType: FACT_TYPES.LION_GROW, data: { name: spec.name, unitName: spec.name, unitUid: cub.uid, pos: cub.pos, atk: tgtAtk, def: tgtDef, maxHp: tgtMaxHp, atkDelta, defDelta, maxHpDelta } });
                    }
                }
            });

            // ② 召唤：每回合开始 prob 概率，在随机空位召唤 1 只幼狮（落点随机 → 成长方向随机；无空位则不召）
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, L.ROUND_START.XIE_SUMMON, (data) => {
                if (!xiexun.alive) return;
                const rng = getBattleRng();
                if (rng.next() >= summon.prob) return;
                const occupied = new Set(myTeam.filter(u => u.alive).map(u => u.pos));
                const free = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(p => !occupied.has(p));
                if (free.length === 0) return;
                const pos = free[rng.nextInt(0, free.length - 1)];
                const cub = spawnUnit(myTeam, summon.cub.name, summon.cub.m, summon.cub.role, pos,
                    { atk: summon.cub.atk, def: summon.cub.def, maxHp: summon.cub.maxHp, skipRoleBonus: summon.cub.skipRoleBonus });
                if (data && data.log) {
                    data.log.push({ factType: FACT_TYPES.SUMMON_UNIT, data: { summonName: cub.name, summonUid: cub.uid, pos, byName: xiexun.name } });
                }
            });

            // ③ 雄狮·振奋：雄狮命中后，己方全体存活角色（含雄狮自己、谢逊）永久 +atkPerHit 攻。
            //    走 addMod 登记永久词条，getStat 现算，不直改 unit.atk。
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.LION_INSPIRE, (data) => {
                const lion = data.unit;
                if (!lion || !lion.isLionMale || !lion.alive) return;
                if (!data.dmg || data.dmg <= 0) return;
                const gain = inspire.atkPerHit;
                // 2026-10-06 振奋受益池统一走 canBeTargeted + 排拒马：天上蝶/蛛不白吃加攻，拒马不加攻
                // 2026-10-07 收编进 03 的 getBenefitTargets 裁判（行为不变，口径一处管）
                // 2026-10-08 幼狮也豁免（用户拍板）：攻被振奋抬>0 会真的出手（幼狮设计是零攻白板），
                //   且幼狮吃振奋会让"成长前白赚全队攻"变成最优解——成长链的代价感就没了
                const targets = getBenefitTargets(myTeam).filter(u => !u.isLionCub);
                if (targets.length === 0) return;
                const inspireTargets = [];
                for (const t of targets) {
                    addMod(t, 'atk', { source: '振奋', value: gain, ttl: 'permanent', group: 'lionInspire', op: 'add' });
                    inspireTargets.push({ unitName: t.name, atkDelta: gain });
                    emitEvent(t, UNIT_EVENT_TYPES.HP_CHANGE, { hp: t.hp, maxHp: t.maxHp, alive: t.alive, atk: getStat(t, 'atk'), def: getStat(t, 'def') });
                }
                // 数值声明 fact：一次触发给多人各 +gain，用 targets 名单承载（供体检对照器按 group='lionInspire' 比对）
                // 2026-10-01 契约补齐：requiredFields 要 unitName（触发者=雄狮）但发射处一直没带——校验器红字但不阻断，此前漏了
                if (data.log) {
                    data.log.push({
                        factType: FACT_TYPES.LION_INSPIRE,
                        data: { unitName: lion.name, targets: inspireTargets }
                    });
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
                // 2026-09-25 顺序改按站位：原来直接沿用队伍数组顺序（建队/召唤先后），
                //   谢逊在建队时就入队，于是永远第一个随动、狮子按召出先后排；现改 pos 升序，位置靠前的先出手。
                const mates = myTeam.filter(u => u.alive && u.uid !== lioness.uid && !u.isLionCub && (u.isLionMale || u.isLioness || u.isXieXun))
                    .sort((a, b) => a.pos - b.pos);
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

// 杨逍（光明左使·飞行·弱精英 m104）
// ① 弹指神通：命中后 prob 概率点穴——回合级 _stunned（😵 复用现有渲染，本回合选人时被跳过）+ 同时挂截脉禁疗 _jinMai（❌）
//    rounds 回合（本回合+下+下下，回合开始递减），冷却 _dianXueCd（同一目标 cdRounds 回合最多被点一次）。
//    禁疗消费落点在 core/13 applyStatChange 单点收口（全库 10+ 治疗出口）。
// ② 选敌：pool-filter 优先未行动敌人（点穴控到还有行动权的 target 才有意义）；敌方全部已行动 → 候选排空照飞行默认选敌，
//    且本次伤害 ×allActedDmgRatio（BEFORE_DAMAGE_CALC 声明，战报明细可见）。
// ③ 鹰眼被动（未命中 −12pp）实装在 core/03 getMissBreakdown 单源，详情弹窗自动同步。
export function createYangXiaoComponent() {
    return {
        name: '杨逍',
        register(eventBus, A, B, log) {
            // 不写死阵营：按身份标记在两侧找，杨逍换边也照样生效
            const yangxiao = [...A, ...B].find(u => u.isYangXiao && u.alive);
            if (!yangxiao) return;

            const dian = getSkillParams('杨逍', 'dianXueShenTong');
            if (!dian) throw new Error('缺技能参数: 杨逍.dianXueShenTong');
            const jie = getSkillParams('杨逍', 'dianXueJieMai');
            if (!jie) throw new Error('缺技能参数: 杨逍.dianXueJieMai');

            // ① 命中后点穴判定：眩晕 + 禁疗同时挂（data.unit=杨逍，data.target=被命中者）
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.DIAN_XUE, (data) => {
                const unit = data.unit;
                if (!unit || !unit.isYangXiao || !unit.alive) return;
                const target = data.target;
                if (!target || !target.alive || !data.dmg || data.dmg <= 0) return;
                if (target.state._dianXueCd > 0) return;                 // 冷却中：cdRounds 回合内不再被点
                if (getBattleRng().next() >= dian.prob) return;

                Object.assign(target.state, { _stunned: true, _dianXueCd: dian.cdRounds });
                // OBJECT 字段在 state 拷贝里是浅拷贝，必须整对象换新，避免就地改漏到 UI 镜像
                target.state._jinMai = { rounds: jie.rounds, ratio: 1 - jie.healReduceRatio };
                emitEvent(target, UNIT_EVENT_TYPES.HP_CHANGE, { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: getStat(target, 'atk'), def: getStat(target, 'def'), _stunned: true });
                emitStateChange(target, STATE_CHANGE_TYPES.STUNNED, {}, data.log);
                if (data.log) {
                    data.log.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: {
                        unitName: unit.name, unitUid: unit.uid, camp: unit.camp, skillName: '弹指神通',
                        note: `😵 ${unit.name} 弹指神通：点中 ${target.name} 穴道，本回合无法行动，并禁疗 ${jie.rounds} 回合（治疗/吸血回复减少 ${Math.round(jie.healReduceRatio * 100)}%）`,
                        floatText: '😵', floatUid: target.uid
                    } });
                }
            });

            // ② 敌方全部已行动过 → 追击：本次伤害 ×allActedDmgRatio（与选敌排空回退飞行默认同一条件）
            eventBus.on(SIGNAL_TYPES.BEFORE_DAMAGE_CALC, L.BEFORE_DAMAGE_CALC.YANGXIAO_ALL_ACTED, (data) => {
                if (data.unit !== yangxiao || !yangxiao.alive) return;
                if (!dian.allActedDmgRatio) return;
                const enemySide = yangxiao.camp === CAMP_TYPES.ALLY ? B : A;
                const enemies = enemySide.filter(u => u.alive);
                if (enemies.length === 0 || !enemies.every(u => u.state._acted)) return;
                data.declarations.push({ type: EFFECT_TYPES.DMG_MULTIPLIER, value: dian.allActedDmgRatio, source: yangxiao, label: '弹指神通·追击' });
            });

            // ③ 回合开始：递减 _jinMai 剩余回合与 _dianXueCd 冷却
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, L.ROUND_START.JIN_MAI, (data) => {
                for (const u of [...(data.A || []), ...(data.B || [])]) {
                    if (!u.alive) continue;
                    const st = u.state;
                    if (st._jinMai && st._jinMai.rounds > 0) {
                        st._jinMai = { ...st._jinMai, rounds: st._jinMai.rounds - 1 };
                    }
                    if (st._dianXueCd > 0) st._dianXueCd -= 1;
                }
            });
        }
    };
}

registerElite('张无忌', createZhangWujiComponent);
registerElite('韦一笑', createWeiYixiaoComponent);
registerElite('小昭·姊', createXiaoZhaoSisterComponent);
registerElite('小昭·妹', createXiaoZhaoBrotherComponent);
registerElite('金毛狮王谢逊', createXieXunComponent);
registerElite('杨逍', createYangXiaoComponent);

// 杨逍·选敌 pool-filter（core/07 通用飞行分支取目标前调用）：
//   优先未行动且未被点穴的敌人（控到还有行动权的 target 才有意义）；非杨逍返回 null（不干预）；
//   敌方全部已行动时候选排空 → runTargetPoolFilters 不替换池，按飞行默认照打（与组件内追击 ×1.3 同一条件）。
registerTargetPoolFilter((unit, candidates) => {
    if (!unit.isYangXiao) return null;
    return candidates.filter(e => !e.state._acted && !e.state._stunned);
});

// —— 2026-10-08 V7.5.13 回合钩子注册（core/11 特判收口）：小昭的知识搬回小昭家 ——
// 回合组件：姊/妹工厂产的是带相位方法的组件（onFirstAllyTurn/executeAttach/executeFly…），
// 主循环工厂循环按此标记保留实例调度（原 core/11 小昭特判分支的泛化）
registerRoundComponent('小昭·姊', CAMP_TYPES.ALLY);
registerRoundComponent('小昭·妹', CAMP_TYPES.ALLY);

// 圣火令增强判定（数值加成消费，applyHolyFlameBonus 第三参）：姊在场即增强——
//   原 core/11 hasSisterForHolyFlame 变量的泛化，与下行行列重画同一语义
registerHolyFlameEnhancer(A => A.some(u => u.isXiaoZhaoSister && u.alive));

// 圣火令增强：姊在场时每回合重画覆盖行列（原 core/11 hexEnhance 内联版逐字迁移；
// 同位置同条件画 rng，序不变——140 基线二分保障）
registerBuffRoundTransformer(BUFF_TYPES.HOLY_FLAME, (buff, rng, A, B) => {
    if (!(buff.target === CAMP_TYPES.ALLY || !buff.target)) return buff;
    const hasSisterForHolyFlame = A.some(u => u.isXiaoZhaoSister && u.alive);
    const hexEnhanceParams = getSkillParams('小昭', 'hexEnhance');
    if (!hexEnhanceParams) throw new Error('缺技能参数: 小昭.hexEnhance');
    const holyFlameEnhance = hasSisterForHolyFlame ? hexEnhanceParams.holyFlame : null;
    const holyColCount = holyFlameEnhance ? holyFlameEnhance.atkCols : 1;
    const holyRowCount = holyFlameEnhance ? holyFlameEnhance.defRows : 2;
    const cols = [];
    while (cols.length < holyColCount) { const c = rng.nextInt(1, 3); if (!cols.includes(c)) cols.push(c); }
    cols.sort((a, b) => a - b);
    const rows = [];
    while (rows.length < holyRowCount) { const r = rng.nextInt(1, 3); if (!rows.includes(r)) rows.push(r); }
    rows.sort((a, b) => a - b);
    return { ...buff, cols, rows };
});

// 状态迁移声明的通用分发（原 core/11 的 sisterComp/brotherComp if-else 链；
// dispatch 闭包适配各方法签名，deferred=攒到下回合/回合末）
registerStateTransition('butterflyAttach', { deferred: false, dispatch(comps, decl, A, B, log) { for (const c of comps) if (typeof c.executeAttach === 'function') { c.executeAttach(A, log); return; } } });
registerStateTransition('butterflyReturn', { deferred: true, dispatch(comps, decl, A, B, log) { for (const c of comps) if (typeof c.executeReturn === 'function') { c.executeReturn(decl.sister, A, log); return; } } });
registerStateTransition('spiderFly', { deferred: false, dispatch(comps, decl, A, B, log) { for (const c of comps) if (typeof c.executeFly === 'function') { c.executeFly(decl.unit, decl.incomingDmg, A, log); return; } } });
registerStateTransition('spiderDescend', { deferred: true, dispatch(comps, decl, A, B, log) { for (const c of comps) if (typeof c.executeDescend === 'function') { c.executeDescend(decl.unit, A, B, log); return; } } });