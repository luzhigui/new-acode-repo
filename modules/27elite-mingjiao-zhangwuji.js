// modules/27elite-mingjiao-zhangwuji.js — 明教精英「张无忌」：组件工厂 + 近身切换私有 checkZhangSwitch
// V1.1.0 | ~10000 bytes | 2026-10-17 多实例化（老板拍板「完全真技能」，配套 core/11 V6.3.29 / core/04 V6.6.0）：
//           register 增第 5 参 self 认自己；checkZhangSwitch 改收 zhang 实参（不再全场 find 第一个，防双张无忌误切非触发者）
// V1.0.1 | ~9934 bytes | 2026-10-17 前排判定同口径三处排除幼狮 isLionCub（与拒马 isHorse 一样不挡前排）；雄鹰/雌鹰按老板拍板本次仍算占位不排除
// V1.0.0 | ~9887 bytes | 2026-10-17 自 modules/27elite-mingjiao.js V7.1.7 拆出（纯搬移，零逻辑改动；组件工厂逐字迁入，集中注册留 barrel）
export const VER = 'modules/27elite-mingjiao-zhangwuji.js V1.1.0';
import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { getZhangNearTaunt } from '../core/03battle-utils.js';
import { getRoleBonus } from '../core/02unit.js';
import { emitEvent, applyStatChange, refreshMaxHp, addMod, getStat } from '../core/13battle-shared.js';
import { eventBus, EXECUTION_LAYER as L, EFFECT_TYPES } from '../infra/50-event-bus.js';
import { StateMachine } from '../infra/51-core-utils.js';
import { FACT_TYPES, UNIT_EVENT_TYPES, CAMP_TYPES, ROLE_TYPES, SIGNAL_TYPES, STATE_CHANGE_TYPES } from '../infra/56-battle-enums.js';
import { emitStateChange } from '../infra/59-state-change.js';
import { watchUnit } from '../core/19unit-watch.js';
function checkZhangSwitch(zhang, A, log) {
    // 2026-10-17 多实例化（老板拍板「完全真技能」）：由调用方传自己的单位实例，不再全场 find 第一个——
    //   双张无忌时 find 会误切「非触发者」（A 未满足切换条件也被切、触发者反而只转了形态没加攻防）
    if (!zhang || !zhang.alive || zhang.state._zhangSwitched) return;
    // 口径同 27 组件 watcher：他成为所在列最靠前的存活单位才切（同列无 pos 更小的存活非马队友）
    const hasFrontAlly = A.some(c => c.alive && !c.isHorse && !c.isLionCub && c.uid !== zhang.uid
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
            const hasFrontAlly = A.some(c => c.alive && !c.isHorse && !c.isLionCub && c.uid !== zhang.uid
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
                        checkZhangSwitch(zhang, A, (data && data.log) || log);
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
        register(eventBus, A, B, log, self) {
            // 2026-10-17 多实例化（老板拍板「完全真技能」）：组件认 self=本实例单位；self 阵亡回退全场 find
            const zhang = (self && self.alive) ? self : A.find(u => u.isZhang && u.alive);
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
                const hasFrontAlly = A.some(c => c.alive && !c.isHorse && !c.isLionCub && c.uid !== zhang.uid
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
