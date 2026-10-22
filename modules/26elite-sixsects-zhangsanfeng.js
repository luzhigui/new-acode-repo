// modules/26elite-sixsects-zhangsanfeng.js — 六大派精英「张三丰」：生生不息 / 八卦阵 / 严阵以待（不攻击的续航核心）
// V6.27.0 | ~16200 bytes | 2026-10-18 八卦阵补头顶弹幕 ☯八卦阵！（pushSkillAnnounce + line:false，
//           复用 SKILL_ANNOUNCE → SKILL_FLOAT 通道；回血 +N 飘字仍走 ENDLESS_BREATH fact 那条）
// V6.26.0 | ~16000 bytes | 2026-10-17 多实例化（老板拍板「完全真技能」，配套 core/11 V6.3.29 / core/04 V6.6.0）：
//           register 增第 5 参 self 认自己；ON_UNIT_ACTED 付费回血加 actor.uid 守卫（防双张三丰对同一行动双倍回血/双倍 RNG）
// V6.25.0 | ~15900 bytes | 2026-10-13 自 modules/26elite-sixsects.js V6.24.2 拆出（纯搬移，数值/日志/fact 顺序零变化）
// V6.27.1 | 2026-10-22 生生不息溢出转嫁：先 previewHeal 预演再落账，receiverHealed 取「应发∩实收」
export const VER = 'modules/26elite-sixsects-zhangsanfeng.js V6.27.1';
import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { applyStatChange, addMod, getStat, getBattleRng, previewHeal } from '../core/13battle-shared.js';
import { getBenefitTargets } from '../core/03battle-utils.js';
import { EFFECT_TYPES } from '../infra/50-event-bus.js';
import { SIGNAL_TYPES, FACT_TYPES, BUFF_TYPES } from '../infra/56-battle-enums.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { FX_SIGNALS } from '../infra/55-fx-signals.js';
import { pushSkillAnnounce } from './23elite-helpers.js';

// 张三丰（六大派·防战）：不攻击的续航核心
// 技能1 生生不息 / 技能3 八卦阵 / 技能5 第三回合严阵以待
// 技能4 不争（仅剩一人判负）在 core/11 的胜负判定里
export function createZhangSanfengComponent() {
    return {
        name: '张三丰',
        register(eventBus, A, B, log, self) {
            // 2026-10-17 多实例化（老板拍板「完全真技能」）：组件认 self=本实例单位；self 阵亡回退 B 侧 find
            const zhang = (self && self.alive) ? self : B.find(u => u.isZhangSanfeng && u.alive);
            if (!zhang) return;

            const s = getSkillParams('张三丰', 'endlessBreath');
            if (!s) throw new Error('缺技能参数: 张三丰.endlessBreath');
            const ba = getSkillParams('张三丰', 'baguaArray');
            if (!ba) throw new Error('缺技能参数: 张三丰.baguaArray');
            const tf = getSkillParams('张三丰', 'tenRoundFortify');
            if (!tf) throw new Error('缺技能参数: 张三丰.tenRoundFortify');

            // 生生不息：只回 healPct 上限（三处触发共用：回合开始[免费] / 轮到自己[付费atkCost攻] / 八卦阵[付费atkCost攻]）；回血同时转永久攻防，见下
            // 2026-09-21 溢出转嫁：自身回不满的那部分（满血时即全部）转给随机一名存活友方，
            // 拒马也算友方；满血队友也可被选中（选中即作废，不改选）；随机走战斗 RNG（getBattleRng），保证 PVP 双端同源
            function triggerEndlessBreath(unit, log, cost) {
                if (!unit || !unit.alive) return;
                const heal = Math.floor(unit.maxHp * s.healPct);
                const hpBefore = unit.hp;
                applyStatChange(unit, 'hp', heal, null, '生生不息');
                const healed = Math.round(Math.max(0, unit.hp - hpBefore));
                const overflow = Math.max(0, heal - healed);

                // 溢出转嫁：从「存活友方」里随机挑一个（不含自己，满血也可被选中）；挑中满血者则该次溢出作废，不再改选
                let receiver = null;
                let receiverHealed = 0;
                if (overflow > 0) {
                    // 2026-10-06 溢出接盘池统一走 canBeTargeted：天上蝶/蛛、垂死、不可选单位不接盘（与打人门禁同口径）
                    // 2026-10-07 收编进 03 的 getBenefitTargets 裁判（includeHorse:拒马也算友方，老板拍板过；行为不变口径归一）
                    const cands = getBenefitTargets(B, { includeHorse: true, excludeUids: [unit.uid] });
                    if (cands.length > 0) {
                        const pick = cands[getBattleRng().nextInt(0, cands.length - 1)];
                        const rHpBefore = pick.hp;
                        // source 必须传张三丰：统计层按产出者记账（core/13 `(source||target).healDone`），
                        // 不传 source 会把溢出治疗记到接盘队友头上，张三丰的治疗量看起来少一大截
                        // 2026-10-22 先预演再落账：截脉/寒毒打折后的量才是「应发」，再受 maxHp 夹取得「实收」
                        const willHeal = previewHeal(pick, overflow);
                        applyStatChange(pick, 'hp', overflow, unit, '生生不息·溢出');
                        receiver = pick;
                        receiverHealed = Math.round(Math.max(0, Math.min(willHeal, receiver.hp - rHpBefore)));
                    }
                }

                // 2026-09-27 定案：回血同时转永久攻防，按「实际回血 / 溢出」两档、按血量落点记账——
                // 张三丰自己那笔（实疗 healed + 自身溢出 overflow）加给自己；转给队友那笔
                // （队友实疗 receiverHealed + 队友二次溢出 overflow-receiverHealed）加给队友。
                // 系数走 content endlessBreath.params（每 N 点血 → 攻/防 +1），每档有 minBonus 地板。
                // 例（二选一后）：张三丰满血 100/100、heal=20 → 溢出20，本次掷到「攻」则 攻+2、不涨防；掷到「防」则 防+4；
                //     转给队友那笔同方向：实疗10 → 攻+1 或 防+1，二次溢出10 → 再 攻+1 或 防+2。
                // 注意：八卦阵被攻击时也触发生生不息 → 挨打越多攻防越高，是个正反馈，数值需跑评测盯。
                const gainOf = (amount, div) => amount > 0 ? Math.max(s.minBonus, amount / div) : 0;
                // 2026-09-28 二选一改版（V6.14.7）：比例不变，每次触发随机「攻」「防」只给一边——
                // 随机走战斗 RNG（PVP 双端同源，同 getBattleRng 溢出转嫁口径）；一次触发一个方向，
                // 张三丰自己那笔与转给队友那笔同方向（同一条 fact 内可读）
                const side = getBattleRng().nextInt(0, 1) === 0 ? 'atk' : 'def';
                const selfAtkGain = side === 'atk' ? gainOf(healed, s.healAtkDiv) + gainOf(overflow, s.overflowAtkDiv) : 0;
                const defGain = side === 'def' ? gainOf(healed, s.healDefDiv) + gainOf(overflow, s.overflowDefDiv) : 0;
                if (selfAtkGain > 0) addMod(unit, 'atk', { source: '生生不息', value: selfAtkGain, ttl: 'permanent', group: 'endlessBreath', op: 'add' });
                if (defGain > 0) addMod(unit, 'def', { source: '生生不息', value: defGain, ttl: 'permanent', group: 'endlessBreath', op: 'add' });
                let receiverAtkGain = 0;
                let receiverDefGain = 0;
                if (receiver) {
                    // 队友二次溢出＝转给它但没变成生命的那部分（含它本就满血时全额作废），仍照溢出档给加成
                    const receiverOverflow = Math.max(0, overflow - receiverHealed);
                    // 二选一：队友那笔跟随本次触发的同一方向（side 在上面已掷）
                    receiverAtkGain = side === 'atk' ? gainOf(receiverHealed, s.healAtkDiv) + gainOf(receiverOverflow, s.overflowAtkDiv) : 0;
                    receiverDefGain = side === 'def' ? gainOf(receiverHealed, s.healDefDiv) + gainOf(receiverOverflow, s.overflowDefDiv) : 0;
                    if (receiverAtkGain > 0) addMod(receiver, 'atk', { source: '生生不息', value: receiverAtkGain, ttl: 'permanent', group: 'endlessBreath', op: 'add' });
                    if (receiverDefGain > 0) addMod(receiver, 'def', { source: '生生不息', value: receiverDefGain, ttl: 'permanent', group: 'endlessBreath', op: 'add' });
                }

                // 2026-09-27 回血弹幕不在这里发了：改由下面的 fact → render/38 翻译 → 39 HEAL 动作，
                // 跟其它所有治疗一样「随文本行播出」。原先此处直接 emit(HEAL_FLOAT) 是引擎解算瞬间发信号，
                // 弹幕会抢在日志文字前面（全项目唯一一处这么干的治疗）。
                if (!GlobalStore.get('fastForwardActive')) {
                    // 太极印：三处触发共用（回合开始 / 轮到自己 / 八卦阵）。
                    // 1 号位会出现「回合开始 + 立刻轮到自己」两次紧邻——不去抖会连出两个，
                    // 由 fx/80 showMeditateEffect 内部按 uid 去抖（1.2s），此处只管发。
                    eventBus.emit(FX_SIGNALS.MEDITATE, { unit });
                }
                // 2026-09-17 日志：走 fact（两处触发都进主 log，随 step 渲染）
                // 2026-10-08 cost：付费触发（轮到自己/八卦阵）把消耗值带上，渲染层显示「消耗N点攻击力」；回合开始免费不带
                if (log) {
                    log.push({
                        factType: FACT_TYPES.ENDLESS_BREATH,
                        data: {
                            unitName: unit.name, unitUid: unit.uid,
                            heal: healed,
                            overflow,
                            cost,
                            atkGain: selfAtkGain,
                            defGain,
                            overflowToName: receiver ? receiver.name : null,
                            overflowToUid: receiver ? receiver.uid : null,
                            overflowHealed: receiverHealed,
                            overflowAtkGain: receiverAtkGain,
                            overflowDefGain: receiverDefGain
                        }
                    });
                }
            }

            // 技能1：回合开始时触发（2026-09-20 曾取消，同日恢复——第二关张三丰续航偏弱）
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, 12, (data) => {
                if (!zhang.alive) return;
                triggerEndlessBreath(zhang, data.log);
            });

            // 技能1：轮到自己行动完成时触发（「如沐春风」2026-09-20 取消）
            // 2026-10-08 付费触发：消耗 atkCost(3) 点攻击力才回血；攻不足只休息不回血（回合开始那次仍免费）。
            // 攻不足时推灰字 fail fact（此前完全静默，玩家看不出"本该触发但燃料没了"）
            eventBus.on(SIGNAL_TYPES.ON_UNIT_ACTED, 50, (data) => {
                const actor = data.unit;
                if (!actor || !actor.alive || !actor.isZhangSanfeng) return;
                if (actor.uid !== zhang.uid) return;   // 2026-10-17 多实例守卫：各实例只响应自己的单位，防双张三丰对同一行动双倍付费回血
                if (getStat(actor, 'atk') < s.atkCost) {
                    if (data.log) data.log.push({ factType: FACT_TYPES.ENDLESS_BREATH, data: { unitName: actor.name, heal: 0, failReason: 'atk', atkCost: s.atkCost } });
                    return;
                }
                addMod(actor, 'atk', { source: '生生不息', value: -s.atkCost, ttl: 'permanent', group: 'endlessBreathCost', op: 'add' });
                triggerEndlessBreath(actor, data.log, s.atkCost);
            });

            // 技能3：八卦阵——被攻击时 procChance(50%) 概率触发：消耗 atkCost(3) 点攻击力，并触发生生不息
            // 2026-10-08 改版：付费触发（与「轮到自己」共用同一池攻击力当燃料）；攻不足时推灰字 fail fact（此前静默）；
            // 原「-1攻+1防」对冲删除，不再加防——fact 的 defDelta 发 0 保住契约三字段（渲染/体检按 >0 分支自然静音）
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, 45, (data) => {
                if (data.target !== zhang || !zhang.alive) return;
                if (!data.dmg || data.dmg <= 0) return;
                if (getStat(zhang, 'atk') < ba.atkCost) {
                    // 攻不足：50% 掷骰都不做，直接提示未触发（区别于概率未命中——那个属正常运气，不提示）
                    if (data.log) data.log.push({ factType: FACT_TYPES.ENDLESS_BREATH, data: { unitName: zhang.name, heal: 0, failReason: 'atk', atkCost: ba.atkCost, via: '八卦阵' } });
                    return;
                }
                const rng = getBattleRng();
                if (rng.nextInt(1, 100) > ba.procChance * 100) return;
                addMod(zhang, 'atk', { source: '八卦阵', value: -ba.atkCost, ttl: 'permanent', group: 'baguaArray', op: 'add' });
                // 数值声明 fact：发实际 addMod 的带符号值，供体检对照器按 group='baguaArray' 隔离比对
                if (data.log) {
                    data.log.push({
                        factType: FACT_TYPES.BAGUA_ARRAY,
                        data: { unitName: zhang.name, unitUid: zhang.uid, atkDelta: -ba.atkCost, defDelta: 0 }
                    });
                }
                triggerEndlessBreath(zhang, data.log);
                if (data.group && data.group.data && data.group.data.entries) {
                    data.group.data.entries.push({ type: 'info', text: `<span class="gold">☯ 八卦阵：张三丰攻击-${ba.atkCost}，触发生生不息</span>` });
                    // 2026-10-18 头顶弹幕：八卦阵此前只有战报行（回血另走 ENDLESS_BREATH 的 +N 飘字），
                    //   补 ☯ 让「八卦阵发动」本身可见；line:false —— 战报行已由上方 if 块承担
                    pushSkillAnnounce(data.log, zhang, '八卦阵', `☯ 八卦阵：张三丰攻击-${ba.atkCost}，触发生生不息`, { line: false, floatText: '☯八卦阵！', floatUid: zhang.uid });
                }
            });

            // 技能5：第 3 回合结束后仍未分胜负（即第 4 回合开始）→ 张三丰获得严阵以待（仅限自身）
            // 2026-09-17 不走 B._activeBuffs：那条会让六大派全体防战都吃到；改为直接挂词条 + 组件自算反弹
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, 45, (data) => {
                if (!zhang.state._tenRoundFired) {
                    zhang.state._roundCountForFortify = (zhang.state._roundCountForFortify || 0) + 1;
                    if (zhang.state._roundCountForFortify <= tf.round) return;
                    zhang.state._tenRoundFired = true;
                }
                // 防御 +50%（ttl: round，每回合开始重挂，跟明教同源参数）
                addMod(zhang, 'def', { source: '严阵以待', value: CONFIG.BUFFS.fortify.defBonus, ttl: 'round', op: 'mul', group: 'fortify' });
                if (data.log) {
                    data.log.push({
                        factType: FACT_TYPES.BUFF_SUMMARY,
                        data: {
                            buff: { key: BUFF_TYPES.FORTIFY, name: '严阵以待', remaining: Infinity },
                            allyTeamUids: [zhang.uid]
                        }
                    });
                }
            });

            // 严阵以待反弹：仅张三丰自身（不走 camp buff 检查，故不受 core/12 那条影响）
            // 2026-10-02 口径统一：原实现"实际伤害的一半"导致他越硬弹得越少，与配置"反弹50%伤害差值"
            //   及通用防战(core/12)相反。改为逐字对齐 core/12：被防御抵消部分(atkAct-基础公式伤害)的一半
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, 46, (data) => {
                if (!zhang.state._tenRoundFired || !zhang.alive) return;
                if (data.target !== zhang) return;
                if (!data.dmg || data.dmg <= 0) return;
                const attacker = data.unit;
                if (!attacker || !attacker.alive || attacker === zhang) return;
                if (typeof data.atkAct !== 'number' || typeof data.defAct !== 'number') return;
                const baseDmg = Math.floor(data.atkAct * (data.atkAct / (data.atkAct + data.defAct)));
                const rebound = Math.floor((data.atkAct - baseDmg) / 2);
                if (rebound <= 0) return;
                data.declarations = data.declarations || [];
                data.declarations.push({
                    type: EFFECT_TYPES.REBOUND,
                    value: rebound,
                    source: zhang,
                    target: attacker,
                    hasSister: false,
                    factType: FACT_TYPES.FORTIFY_REBOUND,
                    factData: { reboundDmg: rebound, unitName: attacker.name, hasSister: false, attackerUid: attacker.uid, unitUid: zhang.uid }
                });
            });
        }
    };
}
