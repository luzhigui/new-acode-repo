// V6.18.0 | 2026-10-08 搭档连线注册面接龙：宋青书×周芷若配对知识从 core/11 迁入本文件
// V6.17.1 | 2026-10-08 atkCost 5→3（用户看实战战报定调：5 攻触发条件偏高）；付费/攻不足的日志可见性——付费 fact 带 cost（render/35 句首「消耗N点攻击力」+ render/38 ⚔-N 飘字），攻不足推灰字 fail fact（此前静默）
// V6.17.0 | 2026-10-08 张三丰生生不息改「付费触发」：轮到自己/八卦阵两处均消耗 atkCost 点攻击力（攻不足不触发，共用同一池燃料；回血随机加攻使燃料可再生，付费与成长拉锯），回合开始仍免费；八卦阵删「-1攻+1防」对冲改纯扣攻，fact defDelta 发 0 保契约字段
// V6.16.0 | 2026-10-07 苦练/生生不息溢出受益池收编 getBenefitTargets 裁判（core/03）——苦练补上垂死+天上蝶蛛+附身排除（原只排死人和拒马），溢出行为不变口径归一
// V6.15.5 | ~48300 bytes | 2026-10-02 胖远桥·莽撞补飘字：被攻击加攻量写进本击 fact（group.data.pangAtkGain），render/38 据此产 STAT_CHANGE(atk) 飘「⚔+N」
// V6.15.4 | 2026-10-02 四个注册表 handler 补 fields 字段契约（core/15 安装期按此校验 JSON，缺字段/类型错开局即抛）
export const VER = 'modules/26elite-sixsects.js V6.18.0';
import { registerElite, registerLinkPartners } from '../core/08-elite-registry.js';
import { CONFIG, getSkillParams, getGameData } from '../core/01config-5v5-test.js';
import { SIGNAL_TYPES, FACT_TYPES, BUFF_TYPES, CAMP_TYPES, ROLE_TYPES, MECHANIC_TYPES } from '../infra/56-battle-enums.js';
import { applyStatChange, addMod, getStat, getBattleRng, resolvePushOrStun, refreshMaxHp } from '../core/13battle-shared.js';
import { eventBus, EFFECT_TYPES, EXECUTION_LAYER as L } from '../infra/50-event-bus.js';
import { canBeTargeted, getBenefitTargets } from '../core/03battle-utils.js';
import { spawnUnit } from '../core/05battle-horse.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { FX_SIGNALS } from '../infra/55-fx-signals.js';
import { registerMechanicHandler } from '../core/18mechanic-registry.js';
import { processUnitAttack } from '../core/10battle-attack.js';
import { fmtHp } from '../infra/51-core-utils.js';

// 宋青书
export function createSongQingshuComponent() {
    return {
        name: '宋青书',
        register(eventBus, A, B, log) {}
    };
}

// 周芷若
export function createZhouZhiruoComponent() {
    return {
        name: '周芷若',
        register(eventBus, A, B, log) {}
    };
}

// 张三丰（六大派·防战）：不攻击的续航核心
// 技能1 生生不息 / 技能3 八卦阵 / 技能5 第三回合严阵以待
// 技能4 不争（仅剩一人判负）在 core/11 的胜负判定里
export function createZhangSanfengComponent() {
    return {
        name: '张三丰',
        register(eventBus, A, B, log) {
            const zhang = B.find(u => u.isZhangSanfeng && u.alive);
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
                        applyStatChange(pick, 'hp', overflow, unit, '生生不息·溢出');
                        receiver = pick;
                        // 队友可能只差一点点血（或本就满血），实际收到的比溢出量少——飘字和日志都报实际值
                        receiverHealed = Math.round(Math.max(0, receiver.hp - rHpBefore));
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

// 胖远桥（六大派·武当·战士）：莽撞 / 正义国字脸 / 年轻气盛
// 2026-09-22 新增；2026-09-23 改版：嘲讽与打歪合并为「每次攻击前二选一」——
//   血越高越容易发动正义国字脸（全体敌人本回合后续只能打他，且自身防御永久+40、无上限叠加），
//   攻越高越容易发动年轻气盛（随机目标 ×2.0 + 击退，退无可退则眩晕）。
// 第三关与宋青书每局随机二选一（content 的 encounters.squadVariants["3"]）。
// 三个技能全在本组件闭环：击退/眩晕复用 core/13 的公共 fact，其余日志走 group.data.entries。
export function createPangYuanQiaoComponent() {
    return {
        name: '胖远桥',
        register(eventBus, A, B, log) {
            // 不写死阵营：core/11 固定传（A=明教 / B=六大派），这里按身份标记在两侧找，
            // 胖远桥将来换边也照样生效
            const pang = [...A, ...B].find(u => u.isPangYuanQiao && u.alive);
            if (!pang) return;

            const rage = getSkillParams('胖远桥', 'rageOnHit');
            if (!rage) throw new Error('缺技能参数: 胖远桥.rageOnHit');
            const face = getSkillParams('胖远桥', 'righteousFace');
            if (!face) throw new Error('缺技能参数: 胖远桥.righteousFace');
            const young = getSkillParams('胖远桥', 'youngBlood');
            if (!young) throw new Error('缺技能参数: 胖远桥.youngBlood');

            function pushInfo(data, text) {
                if (data && data.group && data.group.data && data.group.data.entries) {
                    data.group.data.entries.push({ type: 'info', text });
                }
            }

            // 技能1 莽撞（被动）：每次被攻击后自身攻击 +atkPerHit，永久累计、无上限
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.PANG_RAGE, (data) => {
                if (data.target !== pang || !pang.alive) return;
                if (!data.dmg || data.dmg <= 0) return;
                addMod(pang, 'atk', { source: '莽撞', value: rage.atkPerHit, ttl: 'permanent', group: 'rageOnHit', op: 'add' });
                // 2026-10-02 飘字：加攻量随本击 fact 走一格（此前只有金色战报行、头顶零飘字）。
                //   group.data === 本击 ATTACK fact 的 data（core/12 buildAttackGroup 同一对象），render/38 据此产
                //   STAT_CHANGE(atk) → render/39 发 ATK_BUFF_FLOAT → fx/80 在胖远桥头顶飘「⚔+N」。
                if (data.group && data.group.data) data.group.data.pangAtkGain = rage.atkPerHit;
                // 数值声明 fact：发实际 addMod 的带符号值，供体检对照器按 group='rageOnHit' 隔离比对
                if (data.log) {
                    data.log.push({
                        factType: FACT_TYPES.RAGE_ON_HIT,
                        data: { unitName: pang.name, atkDelta: rage.atkPerHit }
                    });
                }
                pushInfo(data, `<span class="gold">💢 莽撞：胖远桥挨了打，攻击+${rage.atkPerHit}（当前 ${Math.floor(getStat(pang, 'atk'))}）</span>`);
            });

            // 技能1 补充（2026-09-24）：流星赶月/乘风突袭的溅射（二次伤害）同样算「挨打」，与主目标口径一致。
            //   AFTER_DAMAGE_APPLIED 只发主目标，溅射由 core/16 的 SPLASH handler 走 SPLASH_DAMAGED 窄信号。
            eventBus.on(SIGNAL_TYPES.SPLASH_DAMAGED, 50, (data) => {
                if (data.unit !== pang || !pang.alive) return;
                if (!data.dmg || data.dmg <= 0) return;
                addMod(pang, 'atk', { source: '莽撞', value: rage.atkPerHit, ttl: 'permanent', group: 'rageOnHit', op: 'add' });
                // 数值声明 fact：与主路径同口径，供对照器按 group='rageOnHit' 比对
                if (data.log) {
                    data.log.push({
                        factType: FACT_TYPES.RAGE_ON_HIT,
                        data: { unitName: pang.name, atkDelta: rage.atkPerHit }
                    });
                }
                // 台词挂在溅射那条 fact 上（render/35 会追加到行尾）
                if (data.factData) {
                    data.factData.rageText = `<span class="gold">💢 莽撞：胖远桥吃了溅射，攻击+${rage.atkPerHit}（当前 ${Math.floor(getStat(pang, 'atk'))}）</span>`;
                    // 2026-10-02 飘字同主路径：溅射 fact 也在本击 ATTACK fact 的 entries 里，
                    //   render/38 扫到该 factType 时按此 uid/加攻量飘「⚔+N」
                    data.factData.pangAtkUid = pang.uid;
                    data.factData.pangAtkGain = rage.atkPerHit;
                }
            });

            // 技能2/3 二选一（每次攻击前掷一次，必触发其一）：
            //   T = 0.10 + (atk - 30)/200      —— 打歪阈值，攻击越高 T 越大
            //   p_打歪 = clamp((1 - 血量比) / (1 - T), 0, 1)，p_嘲讽 = 1 - p_打歪
            //   满血 → 必嘲讽；血量 ≤ T → 必打歪
            eventBus.on(SIGNAL_TYPES.BEFORE_SELECT_TARGET, L.BEFORE_SELECT_TARGET.PANG_CLUMSY, (data) => {
                if (data.unit !== pang || !pang.alive) return;
                pang.state._clumsyHit = false;
                pang.state._tauntFired = false;
                const cands = (data.validTargets || []).filter(t => t && t.alive && t !== pang);
                if (cands.length === 0) return;
                const rng = getBattleRng();
                const hpRatio = pang.maxHp > 0 ? pang.hp / pang.maxHp : 1;
                // 阈值公式系数走 CONFIG.PANG_CLUMSY_FORMULA（参数体系收敛批 2）
                const f = CONFIG.PANG_CLUMSY_FORMULA;
                const threshold = Math.min(f.cap, f.base + (getStat(pang, 'atk') - f.atkRef) / f.atkDiv);
                const clumsyProb = Math.min(1, Math.max(0, (1 - hpRatio) / (1 - threshold)));
                if (rng.next() < clumsyProb) {
                    // 年轻气盛（打歪）：随机挑一名敌人，×dmgMultiplier 并附带击退/眩晕
                    data.declaration.targetResult = cands[rng.nextInt(0, cands.length - 1)];
                    pang.state._clumsyHit = true;
                    return;
                }
                // 正义国字脸（嘲讽）：全体敌人本回合后续只能打胖远桥（标记回合级，不消耗），
                //   同时自身防御永久 +defGain（2026-09-24 由「被嘲讽者的伤害 ×0.3」改为叠防，无上限叠加）
                for (const foe of cands) foe.state._tauntedByPang = true;
                addMod(pang, 'def', { source: '正义国字脸', value: face.defGain, ttl: 'permanent', group: 'righteousFace', op: 'add' });
                pang.state._tauntFired = true;
            });

            // 年轻气盛：该次伤害 ×dmgMultiplier（DMG_MULTIPLIER 修饰器由 core/12 calcFinalDamage 消费）
            eventBus.on(SIGNAL_TYPES.BEFORE_DAMAGE_CALC, L.BEFORE_DAMAGE_CALC.PANG_YOUNG_MULT, (data) => {
                if (data.unit !== pang || !pang.state._clumsyHit) return;
                data.declarations.push({ type: EFFECT_TYPES.DMG_MULTIPLIER, value: young.dmgMultiplier, source: pang, label: '年轻气盛' });
            });

            // 年轻气盛：命中后击退（退无可退则眩晕）——与乘风突袭共用 core/13 的判定
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.PANG_CLUMSY_LOG, (data) => {
                if (data.unit !== pang || !pang.state._clumsyHit) return;
                pang.state._clumsyHit = false;
                const tgt = data.target;
                if (!tgt || !tgt.alive) return;
                // 打歪的演出标记：本击 fact 带上，render/39 出手帧据此发 PANG_CLUMSY（生成步不发，避免抢画面）
                if (data.group && data.group.data) data.group.data.pangClumsy = true;
                pushInfo(data, `<span class="gold">😵 年轻气盛：胖远桥一拳打歪，招呼到 ${tgt.name} 身上（伤害×${young.dmgMultiplier}）</span>`);
                resolvePushOrStun(tgt, tgt.camp === CAMP_TYPES.ALLY ? A : B, data.log, '😤 年轻气盛');
            });

            // 正义国字脸的台词：目标选择阶段没有日志通道，攒到本次攻击收尾（AFTER_ATTACK）再补一条
            eventBus.on(SIGNAL_TYPES.AFTER_ATTACK, L.AFTER_ATTACK.PANG_TAUNT, (data) => {
                if (data.unit !== pang || !pang.alive || !pang.state._tauntFired) return;
                pang.state._tauntFired = false;
                // 国字脸的演出标记：与台词同帧写进 fact，render/39 出手帧据此发 PANG_TAUNT
                if (data.group && data.group.data) {
                    data.group.data.pangTaunt = true;
                    // 2026-10-02 加防量随 fact 走一格（此前只有上面那行文字、无飘字），
                    //   render/38 据此产 STAT_CHANGE(def) → fx/80 飘「🛡+N」
                    data.group.data.pangDefGain = face.defGain;
                }
                pushInfo(data, `<span class="gold">😤 正义国字脸：胖远桥横眉一喝，敌人本回合只能打他（自身防御+${face.defGain}，当前 ${Math.floor(getStat(pang, 'def'))}）</span>`);
            });

            // 嘲讽的强制执行：被嘲讽者本回合每次选目标都改成胖远桥（标记回合级，回合开始统一清）
            eventBus.on(SIGNAL_TYPES.BEFORE_SELECT_TARGET, L.BEFORE_SELECT_TARGET.PANG_TAUNT_FORCE, (data) => {
                const u = data.unit;
                if (!u || !u.state) return;
                if (!u.state._tauntedByPang) return;
                if (!pang.alive || !canBeTargeted(pang)) return;
                data.declaration.targetResult = pang;
            });

            // 未命中 / 被闪避路径的复位点
            eventBus.on(SIGNAL_TYPES.AFTER_MISS, L.AFTER_MISS.PANG_CLEAR, (data) => {
                if (data.unit === pang) pang.state._clumsyHit = false;
            });
        }
    };
}

// 灭绝师太（六大派·峨眉掌门·战士·M115）：反击 / 跟随攻击 / 每第三次攻击 / 召唤周芷若
// 2026-09-22 新增，作为新第七关精英。四技能分工：
//   反击、每第三次攻击 → 本组件闭环（日志走 group.data.entries 的 { type:'info', text }）
//   跟随攻击 → 走 content mechanics 的 followAttack 声明（core/15 安装）。
//     队友是任意普通单位、没法逐个登记，所以声明挂在灭绝自己名下，而不是像玄冥联动那样挂在攻击者名下。
//   召唤周芷若 → 队友或她本人阵亡时在原位置召唤（全场 1 次），落位时机见下方 flushZhouSummon

// 灭绝师太出手计数的繁体轮换表：第 1/2/3 次依次「壹/貳/參」，第 4 次回到「壹」
const CN_NUM_TRA = ['壹', '貳', '參'];

// 召唤周芷若的统一落位入口：阵亡当帧只记位置（state._pendingZhouPos），落位延到「下一个行动步」。
//   落位与死亡特效的配合：同格「尸体 + 周芷若」由 render/32 保证「尸体优先渲、3 秒清尸后才露人」，
//   所以这里只需避开阵亡当帧，不必等尸体被移除。
//   待落位标记写灭绝自己的 state（battle 级、跨回合克隆保留），不写队伍数组：
//   队伍数组每回合都会重新 map 出来（core/11 createRoundStepper），数组级标记过不了回合边界；
//   她本人在回合最后一手阵亡时下一回合组件不再注册（core/11 只为存活单位注册），
//   所以另有一条模块级 ON_ROUND_START 兜底，靠扫描她的 state 把队列清掉。
function flushZhouSummon(miejue, team, log) {
    const pos = miejue.state._pendingZhouPos;
    if (pos == null || pos < 0) return;
    miejue.state._pendingZhouPos = -1;
    if (miejue.state._summonedZhou) return;
    if (team.some(u => u.isZhouZhiruo && u.alive)) return;
    const summon = getSkillParams('灭绝师太', 'summonZhou');
    if (!summon) return;
    const zhou = spawnUnit(team, '周芷若', summon.m, ROLE_TYPES.WARRIOR, pos);
    miejue.state._summonedZhou = true;
    if (log) {
        log.push({ factType: FACT_TYPES.SUMMON_UNIT, data: { summonName: zhou.name, summonUid: zhou.uid, pos, byName: '灭绝师太' } });
    }
}

// 跨回合兜底：灭绝本人在回合最后一手阵亡 → 当回合已无「下一个行动步」可挂，队列留到下一回合开始落位
eventBus.on(SIGNAL_TYPES.ON_ROUND_START, L.ROUND_START.MIEJUE_SUMMON, (data) => {
    for (const team of [data.A, data.B]) {
        const miejue = team.find(u => u.isMieJueShiTai);
        if (miejue) flushZhouSummon(miejue, team, data.log);
    }
});

export function createMieJueShiTaiComponent() {
    return {
        name: '灭绝师太',
        register(eventBus, A, B, log) {
            // 不写死阵营：按身份标记在两侧找，灭绝换边也照样生效
            const miejue = [...A, ...B].find(u => u.isMieJueShiTai && u.alive);
            if (!miejue) return;
            const myTeam = miejue.camp === CAMP_TYPES.ALLY ? A : B;

            const counter = getSkillParams('灭绝师太', 'counterAttack');
            if (!counter) throw new Error('缺技能参数: 灭绝师太.counterAttack');
            const third = getSkillParams('灭绝师太', 'thirdStrike');
            if (!third) throw new Error('缺技能参数: 灭绝师太.thirdStrike');
            // 召唤参数在落位时（flushZhouSummon）现取；这里只做一次启动期存在性校验
            if (!getSkillParams('灭绝师太', 'summonZhou')) throw new Error('缺技能参数: 灭绝师太.summonZhou');

            function pushInfo(data, text) {
                if (data && data.group && data.group.data && data.group.data.entries) {
                    data.group.data.entries.push({ type: 'info', text });
                }
            }

            // 技能1 反击：被攻击后 prob 概率反击攻击者，伤害 ×dmgRatio，不可闪避，无每回合上限。
            // 走 extraRequests 而不是直接 applyStatChange——反击要过完整伤害管线（防御/格挡/修饰器/记账），
            // 直接扣血等于绕开引擎。跨阵营换边与不可闪避由 core/10 的额外攻击循环处理。
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.MIEJUE_COUNTER, (data) => {
                if (data.target !== miejue || !miejue.alive) return;
                // 2026-09-24 这一击已经把她打进「待死」就不该再反击（此时 alive 还是 true，死亡结算在 resolveDeaths）
                if (miejue.state._pendingDeath) return;
                if (!data.dmg || data.dmg <= 0) return;
                const attacker = data.unit;
                if (!attacker || !attacker.alive || attacker === miejue) return;
                if (getBattleRng().next() >= (counter.prob ?? 1)) return;
                if (!data.extraRequests) data.extraRequests = [];
                data.extraRequests.push({
                    unit: miejue,
                    targetUid: attacker.uid,
                    reason: 'counterAttack',
                    ignoreDodge: true,
                    actedMode: 'restore',
                    actedSnapshot: miejue.state._acted,
                    priority: 12
                });
                pushInfo(data, `<span class="gold">🗡 灭绝师太反击 ${attacker.name}！（伤害×${counter.dmgRatio}，不可闪避）</span>`);
            });

            // 技能3 每第三次攻击：第 3 的倍数那一次命中，伤害 ×dmgMultiplier 并吸血 leechRatio 倍本次伤害。
            // 计数口径 =「她打中过几次」：反击 / 跟随攻击这类被动出手也算她的一次出手（原设计），
            //   只有真正打中的才计（未命中/被闪避到不了 AFTER_DAMAGE_APPLIED）。
            // 三击判定不落标记：两处都按同一个 _attackCount 现算——额外攻击走 lockedTargetUid，
            //   不发 BEFORE_SELECT_TARGET，落标记的方式在反击那一击上必然失同步。
            //   「本次结算前计数 +1 能被 3 整除」= 这一击就是第 3 的倍数。
            const isThirdHit = () => (((miejue.state._attackCount || 0) + 1) % third.interval) === 0;

            eventBus.on(SIGNAL_TYPES.BEFORE_DAMAGE_CALC, L.BEFORE_DAMAGE_CALC.MIEJUE_THIRD_MULT, (data) => {
                if (data.unit !== miejue || !miejue.alive || !isThirdHit()) return;
                data.declarations.push({ type: EFFECT_TYPES.DMG_MULTIPLIER, value: third.dmgMultiplier, source: miejue, label: '灭绝三击' });
            });

            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.MIEJUE_THIRD_LEECH, (data) => {
                if (data.unit !== miejue || !miejue.alive) return;
                if (!data.dmg || data.dmg <= 0) return;
                const isThird = isThirdHit();
                miejue.state._attackCount = (miejue.state._attackCount || 0) + 1;
                const count = miejue.state._attackCount;
                // 2026-09-24 计数飘字（壹/貳/參）与攻击行末尾提示都写进本击的 fact（group.data），
                //   由表现层在「演出帧」消费：原先在这里 emit 飘字，是动作生成步执行，飘字会抢在画面前跳出来。
                //   2026-09-24 三击那一次不再往攻击行尾塞「伤害×1.5+吸血」——同一件事下一行「🩸 灭绝三击」已报，
                //   两行重复；攻击行只留出手计数。
                if (data.group && data.group.data) {
                    data.group.data.miejueCountText = CN_NUM_TRA[(count - 1) % 3];
                    data.group.data.miejueHint = `<span class="gold small">（第 ${count} 次出手）</span>`;
                }
                if (!isThird) return;
                const leechVal = Math.floor(data.dmg * third.leechRatio);
                // 实际回血量按 core/16 LEECH handler 的同口径现算（封顶当前缺口）：LEECH 结算在本次
                //   AFTER_DAMAGE_APPLIED 之后立刻执行（core/10 resolveAfterDamageEffects），此处算的就是最终值
                const capped = Math.max(0, Math.floor(Math.min(leechVal, miejue.maxHp - miejue.hp)));
                const hpBefore = Math.floor(miejue.hp);
                if (!data.declarations) data.declarations = [];
                data.declarations.push({ type: EFFECT_TYPES.LEECH, value: leechVal, source: miejue });
                // 吸血飘字交给 render/39 的出手演出帧发（同计数飘字，避免抢在画面前）
                if (data.group && data.group.data) data.group.data.miejueLeech = capped;
                pushInfo(data, `<span class="gold">🩸 灭绝三击：第 ${count} 次出手，伤害/吸血×${third.dmgMultiplier}，吸血=${capped}，生命 ${hpBefore} → ${hpBefore + capped}</span>`);
            });

            // 技能4 召唤周芷若：任一队友或她本人阵亡 → 记下阵亡者原位置，全场仅 1 次。
            //   落位不在当帧（当帧会顶掉死亡特效），交给下一个行动步的 BEFORE_STATE_TRANSITION；
            //   她本人在回合最后一手阵亡时没有下一步，由模块级 ON_ROUND_START 兜底。
            eventBus.on(SIGNAL_TYPES.ON_UNIT_DEATH, L.ON_UNIT_DEATH.MIEJUE_RECORD, (data) => {
                if (miejue.state._summonedZhou || miejue.state._pendingZhouPos >= 0) return;
                const dead = (data.deadUnits || []).find(u => myTeam.includes(u));
                if (!dead || dead.pos == null) return;
                miejue.state._pendingZhouPos = dead.pos;
            });

            eventBus.on(SIGNAL_TYPES.BEFORE_STATE_TRANSITION, L.BEFORE_STATE_TRANSITION.MIEJUE_SUMMON, (data) => {
                flushZhouSummon(miejue, myTeam, data.log);
            });
        }
    };
}

// ========== 宋青书机制（从 core/15 搬出，走 registerMechanicHandler 注册） ==========

// 苦练前置：场上无周芷若时，宋青书成为受益者
function checkKuLian(allyTeam) {
    const song = allyTeam.find(u => u.isSongQingshu && u.alive);
    if (!song) return null;
    const zhou = allyTeam.find(u => u.isZhouZhiruo && u.alive);
    if (zhou) return null;
    return song;
}

// 快乐回血：每层按 healPct 回一次，层数推进到下一档。
// levels 真值唯一来源：宋青书 mechanics 里 type=MECHANIC_TYPES.XIN_HUN 的 healLevels（批 1 已删 skills.params 死副本）。
function tickKuaiLeHeal(allUnits, log, declarations) {
    const xinHunMech = (getGameData()?.characters?.['宋青书']?.mechanics || []).find(m => m && m.type === MECHANIC_TYPES.XIN_HUN);
    const levels = xinHunMech?.healLevels;
    if (!levels) throw new Error('缺技能参数: 宋青书.mechanics.xinHun.healLevels');
    allUnits.forEach(unit => {
        if (!unit.state._kuaiLeStack || unit.state._kuaiLeStack.length === 0) return;
        if (!unit.alive) return;
        let totalHeal = 0;
        const newStack = [];
        unit.state._kuaiLeStack.forEach(layer => {
            const healAmount = Math.floor(unit.maxHp * layer.healPct);
            totalHeal += healAmount;
            const currentIdx = levels.indexOf(layer.healPct);
            if (currentIdx >= 0 && currentIdx < levels.length - 1) newStack.push({ healPct: levels[currentIdx + 1] });
        });
        if (totalHeal > 0) {
            const hpBefore = Math.floor(unit.hp);
            const hpAfterPredicted = Math.min(unit.maxHp, unit.hp + totalHeal);
            if (declarations) {
                declarations.push({ type: EFFECT_TYPES.ROUND_STAT_GRANT, field: 'hp', delta: totalHeal, target: unit, source: null, reason: '快乐回血' });
            } else {
                applyStatChange(unit, 'hp', totalHeal, null, '快乐回血');
            }
            log.push({ factType: FACT_TYPES.KUAI_LE_HEAL, data: { unitName: unit.name, unitUid: unit.uid, heal: totalHeal, hpBefore: fmtHp(hpBefore), hpAfter: fmtHp(hpAfterPredicted), layers: unit.state._kuaiLeStack.length } });
        }
        Object.assign(unit.state, { _kuaiLeStack: newStack });
    });
}

// 性奋状态授予：周芷若存活时，宋青书本回合获得额外攻击机会
function applyXingFenGrant(allyTeam, log) {
    const zhou = allyTeam.find(u => u.isZhouZhiruo && u.alive);
    const song = allyTeam.find(u => u.isSongQingshu && u.alive);
    if (!zhou || !song) return;
    Object.assign(song.state, { _xingFenActive: true });
    log.push({ factType: FACT_TYPES.XING_FEN_GRANT, data: { zhouName: zhou.name, songName: song.name } });
}

function canXingFenTrigger(attacker) {
    if (!attacker.isSongQingshu) return false;
    if (!attacker.state._xingFenActive) return false;
    if (!attacker.alive) return false;
    return true;
}

function consumeXingFen(attacker) {
    Object.assign(attacker.state, { _xingFenActive: false });
}

// 机制① 九阴白骨爪连锁
registerMechanicHandler(MECHANIC_TYPES.CHAIN_CLAW, {
    // jealous 为可选嫉妒态覆盖对象（张三丰在场时用），不进必需字段
    fields: {
        baseDmg: 'number', procChance: 'number', chainProcChance: 'number',
        lostHpRatio: 'number', maxHpRatio: 'number', executeThreshold: 'number'
    },
    install({ eventBus, decl }) {
        eventBus.on(SIGNAL_TYPES.AFTER_ATTACK, L.AFTER_ATTACK.CLAW, (data) => {
            const { unit, target, dmg, log, allySide, enemySide } = data;
            if (!unit || unit.name !== decl.name) return;
            if (!target || !target.alive) return;
            const rng = getBattleRng();
            const zhangAlive = enemySide && enemySide.some(u => u.isZhang && u.alive);
            const baseHit = zhangAlive ? decl.jealous?.baseDmg : decl.baseDmg;
            const s = zhangAlive ? { ...decl, ...(decl.jealous || {}) } : decl;
            if (!unit.state._nineYinFirstDone) Object.assign(unit.state, { _nineYinFirstDone: true });
            else if (rng.next() > s.procChance) return;

            const hits = [];
            let executeInfo = null;
            let totalHeal = 0;
            const song = allySide.find(u => u.isSongQingshu && u.alive);
            let simulatedTargetHp = target.hp;
            let simulatedSongHp = song ? song.hp : 0;
            let depth = 0;

            while (simulatedTargetHp > 0 && !target.state._pendingDeath && depth < 100) {
                if (depth > 0 && rng.next() > s.chainProcChance) break;
                const lostHp = target.maxHp - simulatedTargetHp;
                const ratioDmg = Math.floor((lostHp * s.lostHpRatio + target.maxHp * s.maxHpRatio) * 10) / 10;
                const bonusDmg = Math.floor((baseHit + Math.max(0, ratioDmg)) * 10) / 10;
                simulatedTargetHp -= bonusDmg;
                const isDeadByHit = simulatedTargetHp <= 0;
                const hpPctAfter = simulatedTargetHp / target.maxHp;
                const execThreshold = s.executeThreshold;
                const isExecute = !isDeadByHit && hpPctAfter <= execThreshold && simulatedTargetHp > 0;
                hits.push({ dmg: bonusDmg, factType: FACT_TYPES.CLAW_HIT, data: { unitName: unit.name, targetName: target.name, dmg: bonusDmg, isExecute, jealous: zhangAlive, depth, hpAfter: simulatedTargetHp, targetUid: target.uid }, isClawHit: true, clawAttackerUid: unit.uid, clawTargetUid: target.uid, isExecute });
                if (song && song.alive) {
                    const healAmount = Math.min(bonusDmg, song.maxHp - simulatedSongHp);
                    totalHeal += healAmount;
                    simulatedSongHp += healAmount;
                }
                if (isDeadByHit) break;
                if (isExecute) {
                    executeInfo = { factType: FACT_TYPES.CLAW_EXECUTE, data: { unitName: unit.name, targetName: target.name, unitUid: unit.uid, targetUid: target.uid }, isClawHit: true, clawAttackerUid: unit.uid, clawTargetUid: target.uid, isExecute: true };
                    break;
                }
                depth++;
            }

            if (hits.length > 0 && data && data.declarations) {
                data.declarations.push({ type: EFFECT_TYPES.CLAW_CHAIN, source: unit, target, hits, execute: executeInfo });
            }
            if (totalHeal > 0 && song && song.alive && data && data.declarations) {
                data.declarations.push({ type: EFFECT_TYPES.HEAL, value: totalHeal, source: song, factType: FACT_TYPES.CLAW_HEAL, factData: { totalHeal, unitUid: song.uid } });
            } else if (song && song.alive) {
                log.push({ factType: FACT_TYPES.CLAW_NO_HEAL, data: {} });
            }
        });
    }
});

// 机制② 苦练：全队永久属性加成，宋青书双倍；周芷若缺席时享有优先出手
registerMechanicHandler(MECHANIC_TYPES.KU_LIAN, {
    fields: { atkBonus: 'number', defBonus: 'number', hpBonus: 'number' },
    install({ eventBus, decl }) {
        const s = { atkBonus: decl.atkBonus, defBonus: decl.defBonus, hpBonus: decl.hpBonus };
        eventBus.on(SIGNAL_TYPES.ON_ROUND_START, L.ROUND_START.KULIAN_BUFF, (data) => {
            const B = data.B;
            const kuLianSong = checkKuLian(B);
            if (!kuLianSong) return;
            Object.assign(kuLianSong.state, { _kuLianActive: true });
            // 2026-10-07 苦练受益池收编 getBenefitTargets 裁判：原写法只排死人和拒马，
            // 垂死、天上蝶蛛、附身中的都能白吃加成——与乾坤衍生/振奋/生生不息溢出同口径
            const targets = getBenefitTargets(B);
            const kuLianTargets = [];
            for (const u of targets) {
                const mult = u.uid === kuLianSong.uid ? 2 : 1;
                // 实际增量提到变量：既给 addMod 也给下方 targets 名单，保证「声明 == 实际」逐人一致
                const atkDelta = s.atkBonus * mult;
                const defDelta = s.defBonus * mult;
                const maxHpDelta = s.hpBonus * mult;
                addMod(u, 'atk', { source: '苦练', value: atkDelta, ttl: 'permanent', group: 'kuLian', op: 'add' });
                addMod(u, 'def', { source: '苦练', value: defDelta, ttl: 'permanent', group: 'kuLian', op: 'add' });
                addMod(u, 'maxHp', { source: '苦练', value: maxHpDelta, ttl: 'permanent', group: 'kuLian', op: 'add' });
                refreshMaxHp(u, null, '苦练');
                kuLianTargets.push({ unitName: u.name, atkDelta, defDelta, maxHpDelta });
            }
            data.log.push({ factType: FACT_TYPES.KU_LIAN_PRIORITY, data: { unitName: kuLianSong.name } });
            // 数值声明 fact：原字段（unitName/atkBonus/defBonus/hpBonus）保留给渲染不动画面；
            // 新增 targets 名单——每人实际已乘 mult 的增量，供体检对照器按 group='kuLian' 逐人比对。
            // 坑点：原来只发未乘 mult 的原始值，本人那一份（×2）会被对照器判成翻倍，故必须走 targets。
            data.log.push({ factType: FACT_TYPES.KU_LIAN, data: { unitName: kuLianSong.name, atkBonus: s.atkBonus, defBonus: s.defBonus, hpBonus: s.hpBonus, targets: kuLianTargets } });
        });
        eventBus.on(SIGNAL_TYPES.BEFORE_ACTION_SELECT, L.BEFORE_ACTION.KULIAN_PRIORITY, (data) => {
            if (!data.unit.isSongQingshu || !data.unit.alive) return;
            const zhou = data.allySide && data.allySide.find(u => u.isZhouZhiruo && u.alive);
            if (!zhou) data.declaration.priority = 1;
        });
    }
});

// 机制③ 新婚：宋青书攻击后扣周芷若血、叠快乐层、自身永久减上限（性奋代价）
registerMechanicHandler(MECHANIC_TYPES.XIN_HUN, {
    fields: { hpDeduct: 'number', healLevels: 'numberArray' },
    install({ eventBus, decl }) {
        eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.XINGFEN, (data) => {
            const { unit, allySide, log } = data;
            if (!unit || unit.name !== decl.name || !unit.alive) return;
            const zhou = allySide.find(u => u.isZhouZhiruo && u.alive);
            if (!zhou) return;
            const hpDeduct = decl.hpDeduct;
            const healLevels = decl.healLevels;
            applyStatChange(zhou, 'hp', -hpDeduct, unit, '新婚扣血', false);
            zhou.state._kuaiLeStack.push({ healPct: healLevels[0] });
            if (zhou.hp <= 0) { if (!zhou.state._deathTime) zhou.state._deathTime = Date.now(); }
            log.push({ factType: FACT_TYPES.XIN_HUN, data: { attackerName: unit.name, targetName: zhou.name, hpDeduct, healPct: healLevels[0], stackCount: zhou.state._kuaiLeStack.length, zhouUid: zhou.uid, zhouHpAfter: zhou.hp, isDead: !!zhou._pendingDeath } });
            if (zhou.state._pendingDeath) log.push({ factType: FACT_TYPES.XIN_HUN_DEATH, data: { unitName: zhou.name, uidD: zhou.uid } });
            Object.assign(unit.state, { _xingFenPenaltyCount: (unit.state._xingFenPenaltyCount || 0) + 1 });
            // 本次减上限 = 当前累计攻击次数（第 1 次 -1、第 2 次 -2、第 3 次 -3…）
            const penalty = unit.state._xingFenPenaltyCount;
            if (penalty > 0 && unit.maxHp > 1) {
                const oldMaxHp = unit.maxHp;
                addMod(unit, 'maxHp', { source: '性奋代价', value: -penalty, ttl: 'permanent', group: 'xingFenCost', op: 'add' });
                refreshMaxHp(unit, null, '性奋代价');
                log.push({ factType: FACT_TYPES.XING_FEN_COST, data: { unitName: unit.name, oldMaxHp, newMaxHp: Math.floor(unit.maxHp), penalty } });
            }
        });
    }
});

// 机制④ 性奋：回合开始授予；命中后额外攻击；未命中重试
registerMechanicHandler(MECHANIC_TYPES.XING_FEN, {
    install({ eventBus, decl }) {
        eventBus.on(SIGNAL_TYPES.ON_ROUND_START, L.ROUND_START.XINGFEN_GRANT, (data) => {
            applyXingFenGrant(data.B, data.log);
            tickKuaiLeHeal(data.A.concat(data.B), data.log, data.declarations);
        });
        eventBus.on(SIGNAL_TYPES.AFTER_ATTACK, L.AFTER_ATTACK.XINGFEN_EXTRA, (data) => {
            const { unit, allySide, enemySide, log } = data;
            if (!unit || unit.name !== decl.name || !unit.isSongQingshu || !unit.alive || unit.state._xingFenExtraAttacking) return;
            if (!canXingFenTrigger(unit)) return;
            consumeXingFen(unit);
            log.push({ factType: FACT_TYPES.XING_FEN_EXTRA_ATTACK, data: { unitName: unit.name } });
            unit.state._xingFenExtraAttacking = true;
            processUnitAttack(unit, allySide, enemySide, log, data.A, data.B, data.state, null, null);
            unit.state._xingFenExtraAttacking = false;
        });
        eventBus.on(SIGNAL_TYPES.AFTER_MISS, L.AFTER_MISS.XINGFEN_RETRY, (data) => {
            const { unit, allySide, enemySide, log } = data;
            if (!unit || unit.name !== decl.name || !unit.isSongQingshu || !unit.alive) return;
            if (canXingFenTrigger(unit)) {
                consumeXingFen(unit);
                log.push({ factType: FACT_TYPES.XING_FEN_RETRY, data: { unitName: unit.name } });
                processUnitAttack(unit, allySide, enemySide, log, data.A, data.B, data.state, null, null);
            }
        });
    }
});

registerElite('宋青书', createSongQingshuComponent);
registerElite('周芷若', createZhouZhiruoComponent);
// 2026-10-08 搭档连线注册（core/11 特判收口）：白骨爪连锁配对知识住在英雄家
registerLinkPartners('宋青书', '周芷若');
registerElite('张三丰', createZhangSanfengComponent);
registerElite('胖远桥', createPangYuanQiaoComponent);
registerElite('灭绝师太', createMieJueShiTaiComponent);