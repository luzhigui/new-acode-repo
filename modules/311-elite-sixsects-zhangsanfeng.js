// modules/311-elite-sixsects-zhangsanfeng.js — 六大派精英「张三丰」：生生不息 / 八卦阵 / 严阵以待（不攻击的续航核心）
// V6.28.0 | 2026-11-19 新增张三丰专属海克斯「太极归一」（taijiUnity，六大派抽取）：获得后下一回合开始
//   全场真英雄生命均摊一次（各自封顶，装不下的作废）；buff 期间每次受张三丰治疗，其攻防拉平为
//   (攻+防)/2 —— 攻防差归零，克制张无忌融会贯通（差值口径）。词条 ttl:'round' + 先清后挂，buff 到期即失效。
//   （V6.27.5：蓄意抑疗可见 / 溢出按抑疗后额度算——更早版本见 记录-更改履历.md）
// V6.28.1 | 2026-11-19 | fact 出口收口（T-EP-1）：严阵以待 BUFF_SUMMARY 裸 data.log.push → pushFact
export const VER = 'modules/311-elite-sixsects-zhangsanfeng.js V6.28.1';
import { CONFIG } from '../core/201-config-5v5-test.js';
import { applyStatChange, addMod, getStat, getBattleRng, previewHeal, removeModsByGroup, emitHpChange } from '../core/214-battle-shared.js';
import { getBenefitTargets, canBeTargeted, hasBuff } from '../core/203-battle-utils.js';
import { EFFECT_TYPES } from '../infra/101-event-bus.js';
import { SIGNAL_TYPES, FACT_TYPES, BUFF_TYPES, CAMP_TYPES } from '../infra/106-battle-enums.js';
import { GlobalStore } from '../infra/104-global-store.js';
import { FX_SIGNALS } from '../infra/105-fx-signals.js';
import { pushSkillAnnounce, selfOrFindAlive, requireSkillParams, pushFact } from './305-elite-helpers.js';
import { grantCrazy, revokeCrazy } from './333-elite-mingjiao-crazy.js';
import { healModReasons } from '../core/217-effect-handlers.js';
// 张三丰（六大派·防战）：不攻击的续航核心
// 技能1 生生不息 / 技能3 八卦阵 / 技能5 第三回合严阵以待
// 技能4 不争（仅剩一人判负）在 core/11 的胜负判定里
export function createZhangSanfengComponent() {
    return {
        name: '张三丰',
        register(eventBus, A, B, log, self) {
            // 多实例化（老板拍板「完全真技能」）：组件认 self=本实例单位；self 阵亡回退 B 侧 find
            const zhang = selfOrFindAlive(self, B, 'isZhangSanfeng');
            if (!zhang) return;

            const s = requireSkillParams('张三丰', 'endlessBreath');
            const ba = requireSkillParams('张三丰', 'baguaArray');
            const tf = requireSkillParams('张三丰', 'tenRoundFortify');

            // ── 太极归一（张三丰专属海克斯 taijiUnity）──────────────────────────────
            // buff 在本方阵营（张三丰在六大派 → B）时生效；判据随手可查，不做缓存。
            const taijiActive = () => hasBuff((zhang.camp === CAMP_TYPES.ALLY ? A : B)._activeBuffs || [], BUFF_TYPES.TAIJI_UNITY);
            // 攻防拉平：先清同组旧词条再按当前值重算——addMod 不去重、永久词条不清，不先清会越叠越多。
            //   口径：floor((攻+防)/2) 双向补齐；ttl:'round' 保证 buff 到期后自然失效，不残留整局。
            function applyTaijiNormalize(target) {
                if (!target || !target.alive) return;
                removeModsByGroup(target, 'taijiNormalize');
                const atk = getStat(target, 'atk');
                const def = getStat(target, 'def');
                const half = Math.floor((atk + def) / 2);
                const atkDelta = half - atk;
                const defDelta = half - def;
                if (atkDelta !== 0) addMod(target, 'atk', { source: '太极归一', value: atkDelta, ttl: 'round', group: 'taijiNormalize', op: 'add' });
                if (defDelta !== 0) addMod(target, 'def', { source: '太极归一', value: defDelta, ttl: 'round', group: 'taijiNormalize', op: 'add' });
                if (atkDelta !== 0 || defDelta !== 0) emitHpChange(target);
            }

            // 生生不息：只回 healPct 上限（三处触发共用：回合开始[免费] / 轮到自己[付费atkCost攻] / 八卦阵[付费atkCost攻]）；回血同时转永久攻防，见下
            // 溢出转嫁：自身回不满的那部分（满血时即全部）转给随机一名存活友方，
            // 拒马也算友方；满血队友也可被选中（选中即作废，不改选）；随机走战斗 RNG（getBattleRng），保证 PVP 双端同源
            function triggerEndlessBreath(unit, log, cost) {
                if (!unit || !unit.alive) return;
                const heal = Math.floor(unit.maxHp * s.healPct);
                // 抑疗（截脉/寒毒，统一 -33%）：应发额度按核心同一口径先打折（previewHeal rawOnly），
                //   实回由 applyStatChange 内部再打一次；溢出只算「抑疗后仍装不下」的部分——
                //   抑疗罚掉的量不转给队友（2026-11-19 老板拍板）。
                const afterReduce = previewHeal(unit, heal, true);
                const healMods = afterReduce < heal ? healModReasons(unit) : [];
                const hpBefore = unit.hp;
                applyStatChange(unit, 'hp', heal, null, '生生不息');
                const healed = Math.round(Math.max(0, unit.hp - hpBefore));
                const overflow = Math.max(0, afterReduce - healed);

                // 溢出转嫁：从「存活友方」里随机挑一个（不含自己，满血也可被选中）；挑中满血者则该次溢出作废，不再改选
                let receiver = null;
                let receiverHealed = 0;
                if (overflow > 0) {
                    // 溢出接盘池统一走 canBeTargeted：天上蝶/蛛、垂死、不可选单位不接盘（与打人门禁同口径）
                    // 收编进 03 的 getBenefitTargets 裁判（includeHorse:拒马也算友方，老板拍板过；行为不变口径归一）
                    const cands = getBenefitTargets(B, { includeHorse: true, excludeUids: [unit.uid] });
                    if (cands.length > 0) {
                        const pick = cands[getBattleRng().nextInt(0, cands.length - 1)];
                        const rHpBefore = pick.hp;
                        // source 必须传张三丰：统计层按产出者记账（core/13 `(source||target).healDone`），
                        // 不传 source 会把溢出治疗记到接盘队友头上，张三丰的治疗量看起来少一大截
                        // 先预演再落账：截脉/寒毒打折后的量才是「应发」，再受 maxHp 夹取得「实收」
                        const willHeal = previewHeal(pick, overflow);
                        applyStatChange(pick, 'hp', overflow, unit, '生生不息·溢出');
                        receiver = pick;
                        receiverHealed = Math.round(Math.max(0, Math.min(willHeal, receiver.hp - rHpBefore)));
                    }
                }

                // 定案：回血同时转永久攻防，按「实际回血 / 溢出」两档、按血量落点记账——
                // 张三丰自己那笔（实疗 healed + 自身溢出 overflow）加给自己；转给队友那笔
                // （队友实疗 receiverHealed + 队友二次溢出 overflow-receiverHealed）加给队友。
                // 系数走 content endlessBreath.params（每 N 点血 → 攻/防 +1），每档有 minBonus 地板。
                // 例（二选一后）：张三丰满血 100/100、heal=20 → 溢出20，本次掷到「攻」则 攻+2、不涨防；掷到「防」则 防+4；
                //     转给队友那笔同方向：实疗10 → 攻+1 或 防+1，二次溢出10 → 再 攻+1 或 防+2。
                // 注意：八卦阵被攻击时也触发生生不息 → 挨打越多攻防越高，是个正反馈，数值需跑评测盯。
                const gainOf = (amount, div) => amount > 0 ? Math.max(s.minBonus, amount / div) : 0;
                // 二选一改版（V6.14.7）：比例不变，每次触发随机「攻」「防」只给一边——
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

                // 太极归一：本次受疗者（张三丰自己 + 溢出接盘者）攻防拉平——攻防差归零，张无忌融会贯通打不动
                if (taijiActive()) {
                    applyTaijiNormalize(unit);
                    if (receiver) applyTaijiNormalize(receiver);
                }

                // 回血弹幕不在这里发了：改由下面的 fact → render/38 翻译 → 39 HEAL 动作，
                // 跟其它所有治疗一样「随文本行播出」。原先此处直接 emit(HEAL_FLOAT) 是引擎解算瞬间发信号，
                // 弹幕会抢在日志文字前面（全项目唯一一处这么干的治疗）。
                if (!GlobalStore.get('fastForwardActive')) {
                    // 太极印：三处触发共用（回合开始 / 轮到自己 / 八卦阵）。
                    // 1 号位会出现「回合开始 + 立刻轮到自己」两次紧邻——不去抖会连出两个，
                    // 由 fx/80 showMeditateEffect 内部按 uid 去抖（1.2s），此处只管发。
                    eventBus.emit(FX_SIGNALS.MEDITATE, { unit });
                }
                // 日志：走 fact（两处触发都进主 log，随 step 渲染）
                // cost：付费触发（轮到自己/八卦阵）把消耗值带上，渲染层显示「消耗N点攻击力」；回合开始免费不带
                if (log) {
                    log.push({
                        factType: FACT_TYPES.ENDLESS_BREATH,
                        data: {
                            unitName: unit.name, unitUid: unit.uid,
                            heal: healed,
                            // 抑疗提示（2026-11-19 老板拍板）：healRaw=声明值 / healNominal=抑疗后应发 /
                            //   healMods=原因清单（无修正不挂，渲染层不给正常回血加噪音）
                            healRaw: heal,
                            healNominal: afterReduce,
                            healActual: healed,
                            healMods,
                            // 回血后的引擎真值：演出层在场就按它落 store（血条当场刷新），
                            //   不然这笔回血要等「同一个 step 里下一个出手单位的步末同步」才显形（老板实机：攒到队友攻击才刷）
                            hpAfter: unit.hp,
                            overflow,
                            cost,
                            atkGain: selfAtkGain,
                            defGain,
                            overflowToName: receiver ? receiver.name : null,
                            overflowToUid: receiver ? receiver.uid : null,
                            overflowHealed: receiverHealed,
                            overflowToHpAfter: receiver ? receiver.hp : null,
                            overflowAtkGain: receiverAtkGain,
                            overflowDefGain: receiverDefGain
                        }
                    });
                }
            }

            // 技能1·持癫乱回（2026-11-19 老板拍板）：张三丰被传染「癫」后，轮到自己的付费回血不再回自己，
            //   改为全场随机乱灌一个（不分敌友、排除自己、canBeTargeted 过滤与癫打人同口径、拒马不进池），
            //   并把癫传染给被灌者（grant/revoke 走 333 同一出口）。回合开始免费回血与八卦阵触发不变。
            // 加成口径：实疗/二次溢出两档全给被灌者（与原版「溢出转给队友那笔」完全同款）；满血被灌中 → 全额按溢出档给加成。
            // fact 复用 ENDLESS_BREATH 契约（heal=0 / overflow=全额 / overflowTo=被灌者），渲染零改动。
            function triggerCrazyBreath(unit, log, cost) {
                if (!unit || !unit.alive) return;
                const heal = Math.floor(unit.maxHp * s.healPct);
                const pool = [...A, ...B].filter(u => u && u.alive && u.uid !== unit.uid && canBeTargeted(u));
                let receiver = null;
                let receiverHealed = 0;
                let receiverReduce = 0;      // 抑疗后被灌者应发额度（无接盘者 = 0）
                let receiverMods = [];       // 被灌者的凝疗原因（截脉/寒毒）
                if (pool.length > 0) {
                    const pick = pool[getBattleRng().nextInt(0, pool.length - 1)];
                    const rHpBefore = pick.hp;
                    // 抑疗口径与 triggerEndlessBreath 同源：先算出「抑疗后应发」，实回由 applyStatChange 打，
                    //   溢出只算「抑疗后仍装不下」的部分（抑疗罚掉的量不算乱灌量）
                    const afterReduce = previewHeal(pick, heal, true);
                    const mods = afterReduce < heal ? healModReasons(pick) : [];
                    const willHeal = previewHeal(pick, heal);
                    // source 传张三丰：治疗统计按产出者记账（与溢出转嫁同口径）
                    applyStatChange(pick, 'hp', heal, unit, '生生不息·癫乱回');
                    receiver = pick;
                    receiverHealed = Math.round(Math.max(0, Math.min(willHeal, receiver.hp - rHpBefore)));
                    receiverReduce = afterReduce;
                    receiverMods = mods;
                    // 癫传染：撤销自己 → 传给被灌者（与 333 攻击传染完全同款）
                    revokeCrazy(unit);
                    grantCrazy(receiver);
                    if (log) pushSkillAnnounce(log, unit, '癫',
                        `🤪 ${unit.name} 受「癫」影响，生生不息乱灌 ${receiver.name} ${afterReduce} 点生命` +
                        (mods.length ? `（${mods.join('+')}：应灌${heal}）` : '') +
                        `，并把「癫」传染给了 ${receiver.name}`,
                        { floatText: '🤪', floatUid: receiver.uid });
                } else if (log) {
                    pushSkillAnnounce(log, unit, '癫', `🤪 ${unit.name} 受「癫」影响想乱灌生生不息，但全场无人可接，白白消散`, { floatText: '🤪', floatUid: unit.uid });
                }
                // 攻防转化：side 掷一次，实疗+二次溢出两档全给被灌者（满血被灌中=全额作废进溢出档，仍给加成）
                const gainOf = (amount, div) => amount > 0 ? Math.max(s.minBonus, amount / div) : 0;
                const side = getBattleRng().nextInt(0, 1) === 0 ? 'atk' : 'def';
                const receiverOverflow = Math.max(0, (receiver ? receiverReduce : heal) - receiverHealed);
                const recvAtkGain = side === 'atk' ? gainOf(receiverHealed, s.healAtkDiv) + gainOf(receiverOverflow, s.overflowAtkDiv) : 0;
                const recvDefGain = side === 'def' ? gainOf(receiverHealed, s.healDefDiv) + gainOf(receiverOverflow, s.overflowDefDiv) : 0;
                if (receiver && recvAtkGain > 0) addMod(receiver, 'atk', { source: '生生不息', value: recvAtkGain, ttl: 'permanent', group: 'endlessBreath', op: 'add' });
                if (receiver && recvDefGain > 0) addMod(receiver, 'def', { source: '生生不息', value: recvDefGain, ttl: 'permanent', group: 'endlessBreath', op: 'add' });
                // 太极印：灌给谁亮谁的格子（无人可接退回张三丰）
                if (!GlobalStore.get('fastForwardActive')) {
                    eventBus.emit(FX_SIGNALS.MEDITATE, { unit: receiver || unit });
                }
                if (log) {
                    log.push({
                        factType: FACT_TYPES.ENDLESS_BREATH,
                        data: {
                            unitName: unit.name, unitUid: unit.uid,
                            heal: 0,
                            hpAfter: unit.hp,
                            overflow: receiver ? receiverReduce : heal,
                            healRaw: heal,
                            healNominal: receiver ? receiverReduce : heal,
                            healActual: 0,
                            healMods: receiverMods,
                            cost,
                            atkGain: 0,
                            defGain: 0,
                            overflowToName: receiver ? receiver.name : null,
                            overflowToUid: receiver ? receiver.uid : null,
                            overflowHealed: receiverHealed,
                            overflowToHpAfter: receiver ? receiver.hp : null,
                            overflowAtkGain: recvAtkGain,
                            overflowDefGain: recvDefGain
                        }
                    });
                }
            }

            // 太极归一·众生平等（2026-11-19 老板拍板）：拿到海克斯后的下一回合开始，一次性把全场真英雄
            //   （非拒马 isHorse / 非召唤物 isSummon）生命均摊到同一水平；各自按 maxHp 封顶，装不下的量作废
            //   （老板拍板：浪费就浪费）。只做一次——标记挂 buff 对象（跨回合同一引用；单位 state 会被回合重置）。
            //   优先级 11 < 下面生生不息 12：先平血、再回血，避免「刚补齐又被治疗顶到上限」。
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, 11, (data) => {
                if (!zhang.alive) return;
                const buffs = (zhang.camp === CAMP_TYPES.ALLY ? data.A : data.B)?._activeBuffs || [];
                const buff = buffs.find(b => b.key === BUFF_TYPES.TAIJI_UNITY);
                if (!buff || buff._taijiShared) return;
                buff._taijiShared = true;
                const all = [...(data.A || []), ...(data.B || [])].filter(u => u && u.alive && !u.isHorse && !u.isSummon);
                if (!all.length) return;
                const avg = all.reduce((sum, u) => sum + u.hp, 0) / all.length;
                for (const u of all) {
                    const delta = Math.round(Math.min(u.maxHp, avg) - u.hp);
                    if (delta !== 0) applyStatChange(u, 'hp', delta, null, '太极归一·众生平等');
                }
                if (data.log) pushSkillAnnounce(data.log, zhang, '太极归一',
                    `☯️ 太极归一：全场 ${all.length} 名真英雄生命均摊至 ${Math.round(avg)}`,
                    { floatText: '☯️', floatUid: zhang.uid });
            });

            // 技能1：回合开始时触发
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, 12, (data) => {
                if (!zhang.alive) return;
                triggerEndlessBreath(zhang, data.log);
            });

            // 技能1：轮到自己行动完成时触发（「如沐春风」取消）
            // 付费触发：消耗 atkCost(3) 点攻击力才回血；攻不足只休息不回血（回合开始那次仍免费）。
            // 攻不足时推灰字 fail fact（此前完全静默，玩家看不出"本该触发但燃料没了"）
            eventBus.on(SIGNAL_TYPES.ON_UNIT_ACTED, 50, (data) => {
                const actor = data.unit;
                if (!actor || !actor.alive || !actor.isZhangSanfeng) return;
                if (actor.uid !== zhang.uid) return;   // 多实例守卫：各实例只响应自己的单位，防双张三丰对同一行动双倍付费回血
                if (getStat(actor, 'atk') < s.atkCost) {
                    if (data.log) data.log.push({ factType: FACT_TYPES.ENDLESS_BREATH, data: { unitName: actor.name, heal: 0, failReason: 'atk', atkCost: s.atkCost } });
                    return;
                }
                addMod(actor, 'atk', { source: '生生不息', value: -s.atkCost, ttl: 'permanent', group: 'endlessBreathCost', op: 'add' });
                // 持癫分支：付费回血变全场乱灌+传染（见 triggerCrazyBreath 注释）
                if (actor.state && actor.state._isCrazy) triggerCrazyBreath(actor, data.log, s.atkCost);
                else triggerEndlessBreath(actor, data.log, s.atkCost);
            });

            // 技能3：八卦阵——被攻击时 procChance(50%) 概率触发：消耗 atkCost(3) 点攻击力，并触发生生不息
            // 改版：付费触发（与「轮到自己」共用同一池攻击力当燃料）；攻不足时推灰字 fail fact（此前静默）；
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
                    // 头顶弹幕：八卦阵此前只有战报行（回血另走 ENDLESS_BREATH 的 +N 飘字），
                    //   补 ☯ 让「八卦阵发动」本身可见；line:false —— 战报行已由上方 if 块承担
                    pushSkillAnnounce(data.log, zhang, '八卦阵', `☯ 八卦阵：张三丰攻击-${ba.atkCost}，触发生生不息`, { line: false, floatText: '☯八卦阵！', floatUid: zhang.uid });
                }
            });

            // 技能5：第 3 回合结束后仍未分胜负（即第 4 回合开始）→ 张三丰获得严阵以待（仅限自身）
            // 不走 B._activeBuffs：那条会让六大派全体防战都吃到；改为直接挂词条 + 组件自算反弹
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, 45, (data) => {
                if (!zhang.state._tenRoundFired) {
                    zhang.state._roundCountForFortify = (zhang.state._roundCountForFortify || 0) + 1;
                    if (zhang.state._roundCountForFortify <= tf.round) return;
                    zhang.state._tenRoundFired = true;
                }
                // 防御 +50%（ttl: round，每回合开始重挂，跟明教同源参数）
                //   去重：若团队版严阵以待已挂（applyFortifyDef 先挂的），不再叠第二条
                const zhangDefMods = (zhang._mods && zhang._mods.def) || [];
                if (!zhangDefMods.some(m => m.group === 'fortify' && m.ttl === 'round')) {
                    addMod(zhang, 'def', { source: '严阵以待', value: CONFIG.BUFFS.fortify.defBonus, ttl: 'round', op: 'mul', group: 'fortify' });
                }
                pushFact(data.log, FACT_TYPES.BUFF_SUMMARY, {
                    buff: { key: BUFF_TYPES.FORTIFY, name: '严阵以待', remaining: Infinity },
                    allyTeamUids: [zhang.uid]
                });
            });

            // 严阵以待反弹：仅张三丰自身（不走 camp buff 检查，故不受 core/12 那条影响）
            // 口径统一：原实现"实际伤害的一半"导致他越硬弹得越少，与配置「反弹{reboundRatio}伤害差值」
            //   及通用防战(core/12)相反。改为逐字对齐 core/12：被防御抵消部分(atkAct-基础公式伤害)×配置比例
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, 46, (data) => {
                if (!zhang.state._tenRoundFired || !zhang.alive) return;
                if (data.target !== zhang) return;
                if (!data.dmg || data.dmg <= 0) return;
                // 去重：六大派有团队版严阵以待时，core/12 的通用逻辑已经弹一条，这里不再重复弹
                const teamBuffs = (B || [])._activeBuffs || [];
                if (teamBuffs.some(b => b.key === BUFF_TYPES.FORTIFY)) return;
                const attacker = data.unit;
                if (!attacker || !attacker.alive || attacker === zhang) return;
                if (typeof data.atkAct !== 'number' || typeof data.defAct !== 'number') return;
                const baseDmg = Math.floor(data.atkAct * (data.atkAct / (data.atkAct + data.defAct)));
                // 反弹比例走配置（与 core/12 通用防战同源），不再写死一半
                const fortifyRatio = CONFIG.BUFFS.fortify.reboundRatio ?? 0.5;
                const rebound = Math.floor((data.atkAct - baseDmg) * fortifyRatio);
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