// modules/26elite-sixsects-tangwenliang.js — 六大派精英「唐文亮」（崆峒·标枪弱精英·M104）：
//   ① 七伤拳（出手自损换增伤 / 临危更凶） + ② 回春术（可叠加的持续回血） +
//   ③ 冲刺·七伤齐发（满 7 次出手冲前排、拽目标到 123 位、双方各受当前生命 45% 真伤、转近战战士） +
//   ④ 同归于尽（阵亡反噬击杀者）
// V7.0.3 | 2026-10-22 七伤双路径 + 回春立即结算：被命中 4% 也推进七伤计数（自损 4% maxHp 留 1 血），满 7 对攻击者
//   冲刺并补一刀；回春术叠层当场结算首轮回血（不再等回合开始）；冲刺报幕带 dash 载荷供 fx/94 独立演出
// V7.0.2 | 2026-10-22 回春术飘字改实际落地值（previewHeal）：截脉/寒毒打折后与血条一致
// V7.0.1 | 2026-10-22 冲刺拽位照实报幕：swapUnitPositions/moveUnitPosition 现返回布尔，
//   目标免疫位移时改写「免疫位移、纹丝不动」，不再假报"拽至 N 号位"（体检 114 家族案）
// 版本历史见 记录-更改履历.md（检索 "modules/26elite-sixsects-tangwenliang"）
export const VER = 'modules/26elite-sixsects-tangwenliang.js V7.0.3';
import { getSkillParams } from '../core/01config-5v5-test.js';
import { getRoleBonus } from '../core/02unit.js';
import { addMod, applyStatChange, emitEvent, getBattleRng, getStat, moveUnitPosition, refreshMaxHp, swapUnitPositions, recordHpAudit, previewHeal } from '../core/13battle-shared.js';
import { computeBuffStats } from '../core/04buff-system.js';
import { computeDodgeChance, snapshotUnitForFact } from '../core/12battle-attack-steps.js';
import { getMissBreakdown, makeFXSnapshot } from '../core/03battle-utils.js';
import { flushBattleEvents, fmtHp } from '../infra/51-core-utils.js';
import { emitStateChange } from '../infra/59-state-change.js';
import { applyRoleBonusMods, switchRoleOnly, pushSkillAnnounce } from './23elite-helpers.js';
import { eventBus, EFFECT_TYPES, EXECUTION_LAYER as L } from '../infra/50-event-bus.js';
import { SIGNAL_TYPES, FACT_TYPES, CAMP_TYPES, ROLE_TYPES, STATE_CHANGE_TYPES, UNIT_EVENT_TYPES } from '../infra/56-battle-enums.js';

export function createTangWenLiangComponent() {
    return {
        name: '唐文亮',
        register(eventBus, A, B, log) {
            // 不写死阵营：按身份标记在两侧找
            const tw = [...A, ...B].find(u => u.isTangWenLiang && u.alive);
            if (!tw) return;

            const qi = getSkillParams('唐文亮', 'qiShangQuan');
            if (!qi) throw new Error('缺技能参数: 唐文亮.qiShangQuan');
            const hc = getSkillParams('唐文亮', 'huiChunShu');
            if (!hc) throw new Error('缺技能参数: 唐文亮.huiChunShu');
            const dash = getSkillParams('唐文亮', 'chongCi');
            if (!dash) throw new Error('缺技能参数: 唐文亮.chongCi');
            const tong = getSkillParams('唐文亮', 'tongGuiYuJin');
            if (!tong) throw new Error('缺技能参数: 唐文亮.tongGuiYuJin');

            // 职业加成（冲刺转战士用，与何太冲红血同款口径：addMod 词条 + refreshMaxHp 同步）
            function addRoleBonus(unit, role, label) {
                return applyRoleBonusMods(unit, role, label, 'twDash');
            }
            // 换职业 + 广播（HP_CHANGE 让 UI 重画攻防，ROLE_CHANGED 走 59 状态变更通道）
            function switchRole(unit, role, label, outLog) {
                switchRoleOnly(unit, role, label, outLog);
            }
            // 2026-10-22 叠层即结算第一次回血（原要等回合开始，玩家看不到「刚触发」的反馈）。
            //   该层 remaining 起手减 1（本次已消耗），后续回合开始照旧结算剩余次数。
            function addHuiChunStack(unit, outLog) {
                const stacks = [...(unit.state._hcStacks || []), hc.rounds - 1];
                unit.state._hcStacks = stacks.filter(r => r > 0);
                const ratio = unit.hp < unit.maxHp * hc.lowHpThreshold ? hc.lostHpPctLow : hc.lostHpPct;
                const raw = Math.floor((unit.maxHp - unit.hp) * ratio);
                const healed = previewHeal(unit, raw);
                if (healed > 0) {
                    applyStatChange(unit, 'hp', raw, null, '回春术');
                    recordHpAudit(unit, 'huiChun', raw, '回春术');
                    if (outLog) outLog.push({ factType: FACT_TYPES.HEAL, data: {
                        unitName: unit.name, unitUid: unit.uid, heal: healed,
                        hpBefore: fmtHp(Math.floor(unit.hp) - healed), hpAfter: fmtHp(Math.floor(unit.hp)),
                        icon: '🌿', label: '回春术', mode: 'plusTrail'
                    } });
                }
                if (outLog) pushSkillAnnounce(outLog, unit, '回春术',
                    `🌿 ${unit.name} 回春术 +1 层（${stacks.length} 层${healed > 0 ? `，立即回复 ${healed}` : ''}）`,
                    { floatText: '🌿', floatUid: unit.uid });
            }
            // ③ 冲刺·七伤齐发：冲到「目标同列」的己方前排位（1/2/3），把对方 456/789 的目标拽到其 123 位；
            //    双方各受当前生命 dmgRatio / selfDmgRatio 真伤；之后叠一套战士加成、转「战士」近战
            function doDash(target, outLog) {
                const frontPos = ((target.pos - 1) % 3) + 1;   // 目标同列的前排位（4→1 / 5→2 / 6→3，7→1 / 8→2 / 9→3）
                // 落点若被本队队友占着先换位（避免两单位挤同一格；只在本队内找占位者，两队 1~9 编号同域）
                const relocate = (unit, pos) => {
                    if (!unit || unit.pos === pos) return true;
                    const team = unit.camp === CAMP_TYPES.ALLY ? A : B;
                    const occupant = team.find(u => u !== unit && u.alive && u.pos === pos);
                    if (occupant) return swapUnitPositions(unit, occupant, outLog);
                    return moveUnitPosition(unit, pos, outLog);
                };
                const twFromPos = tw.pos;
                const targetFromPos = target.pos;
                relocate(tw, frontPos);
                // 2026-10-22 目标免疫 → 拽不动：照实报幕，别再写"拽至 N 号位"（体检 114）
                const targetMoved = target.pos > 3 ? relocate(target, frontPos) : true;

                const toFoe = Math.max(1, Math.round(target.hp * dash.dmgRatio));
                applyStatChange(target, 'hp', -toFoe, tw, '冲刺·七伤齐发');
                const selfWant = Math.max(1, Math.round(tw.hp * dash.selfDmgRatio));
                const toSelf = Math.min(selfWant, Math.max(0, Math.floor(tw.hp) - 1));   // 自伤留 1 血：不因冲刺把自己送走
                if (toSelf > 0) applyStatChange(tw, 'hp', -toSelf, null, '冲刺·七伤齐发自损', false);

                addRoleBonus(tw, ROLE_TYPES.WARRIOR, '冲刺·转战士');
                // 数值声明 fact（TW_DASH_APPLY）：op:add 永久职业加成，atk/def/maxHp 与 addMod value 同值
                //   （getRoleBonus(WARRIOR)），供体检按加法增量口径核对；纯记账、零游戏逻辑副作用（不进画面）。
                const rb = getRoleBonus(ROLE_TYPES.WARRIOR);
                if (outLog) outLog.push({ factType: FACT_TYPES.TW_DASH_APPLY, data: { unitName: tw.name, unitUid: tw.uid, camp: tw.camp, atk: rb.atk, def: rb.def, maxHp: rb.maxHp } });
                switchRole(tw, ROLE_TYPES.WARRIOR, '冲刺·转战士', outLog);
                addHuiChunStack(tw, outLog);   // 冲刺必叠 1 层（不走 4% 掷骰），叠层即结算一次回血
                // 冲刺报幕：在出手帧（本信号处理内）直接落一行，与胖远桥出手声明同口径——
                //   此时本击攻击组还没建（group 由 core/10 命中结算后才产出），落不进组也不该丢
                //   （后随的普攻若被闪避就没有组，挂组会让这行消失）
                if (outLog) {
                    const dragText = targetMoved
                        ? `拽 ${target.name} 至 ${frontPos} 号位`
                        : `${target.name} 免疫位移、纹丝不动`;
                    pushSkillAnnounce(outLog, tw, '冲刺·七伤齐发', `⚡ 唐文亮冲刺·七伤齐发：${dragText}，双方各受当前生命 ${Math.round(dash.dmgRatio * 100)}% 真伤（目标 -${toFoe} / 自身 -${toSelf}），转近战战士`,
                        { floatText: '⚡', floatUid: target.uid,
                          // 2026-10-22 冲刺独立演出：位置数值随载荷下发，fx/94 按坐标画克隆，不读 store 当前状态
                          dash: { fromUid: tw.uid, fromPos: twFromPos, toPos: frontPos, fromCamp: tw.camp,
                                  targetUid: target.uid, targetFromPos, targetToPos: frontPos, targetCamp: target.camp } });
                }
            }

            // 出手计数（整场）+ 冲刺触发 + 回春术叠层：core/10 在选敌完成、命中/闪避判定之前广播
            //   （带 target 与 log）——故命中/闪避都算一次出手；射程内无人（休息）时不广播、不计。
            //   冲刺在本击命中判定前完成，本次出手的正常攻击流程随后继续 → 天然得到「冲刺 + 当回合再普攻一次」。
            //   优先级裸数字 12（晚于胖远桥出手声明 10；模块侧允许裸数字，同 AFTER_DAMAGE_APPLIED:55 先例）
            eventBus.on(SIGNAL_TYPES.AFTER_SELECT_TARGET, 12, (data) => {
                if (data.unit !== tw || !tw.alive) return;
                if (tw.state._pendingDeath) return;
                const n = (tw.state._qiShangCount || 0) + 1;
                tw.state._qiShangCount = n;
                const idx = ((n - 1) % dash.cycle) + 1;
                if (idx === dash.cycle && data.target) {
                    doDash(data.target, data.log);
                } else if (getBattleRng().nextInt(1, 100) <= Math.round(hc.chance * 100)) {
                    addHuiChunStack(tw, data.log);   // 每次出手 4% 概率叠 1 层，叠层即结算一次回血
                }
            });

            // ① 七伤拳：出手前自损 maxHp×selfHpPct（≥minSelfDmg，且不致死——留 1 点），
            //    本次伤害 ×(1+dmgBonus)；自身生命低于 lowHpThreshold 时额外再 +lowHpExtra（临危更凶）。
            //    自损走统一 HP 出口 applyStatChange（记 hp 审计），不经伤害管线（否则会吃防御/格挡）
            eventBus.on(SIGNAL_TYPES.BEFORE_DAMAGE_CALC, L.BEFORE_DAMAGE_CALC.QISHANG, (data) => {
                if (data.unit !== tw || !tw.alive) return;
                if (tw.state._pendingDeath) return;
                const lowHp = tw.hp < tw.maxHp * qi.lowHpThreshold;
                const mult = 1 + qi.dmgBonus + (lowHp ? qi.lowHpExtra : 0);
                data.declarations.push({ type: EFFECT_TYPES.DMG_MULTIPLIER, value: mult, source: tw, label: lowHp ? '七伤拳·临危' : '七伤拳' });
                const want = Math.max(qi.minSelfDmg, Math.round(tw.maxHp * qi.selfHpPct));
                const real = Math.min(want, Math.max(0, Math.floor(tw.hp) - 1));
                // 本击展示三件套清零（报幕文本/横幅/自损量）：它们是「本击攻击组内演出」的载体，防上一击旧值串场
                Object.assign(tw.state, { _qiShangDmg: 0, _qiShangNote: null, _qiShangBanner: null });
                let idxInCycle = 0;
                if (real > 0) {
                    applyStatChange(tw, 'hp', -real, null, '七伤拳自损', false);
                    // 出手计数已在 AFTER_SELECT_TARGET 递增（本击命中路径必经过那里），此处只读来算档位
                    idxInCycle = ((tw.state._qiShangCount - 1) % dash.cycle) + 1;
                    tw.state._qiShangDmg = real;
                }
                // 报幕文本 + 满档横幅先存 state：此刻攻击组还没建（group 由 core/10 命中结算后 buildAttackGroup
                //   才产出），由下面 ①-b 钩子搬进「唐文亮自己的攻击组」，不做组外扁平行
                tw.state._qiShangNote = `👊 唐文亮七伤拳：自损 ${real} 点生命${real <= 0 ? '（残血保命，已无可损）' : (idxInCycle > 0 ? `（伤己 ${idxInCycle}/${dash.cycle}）` : '')}，本次伤害 ×${mult.toFixed(2)}${lowHp ? '（临危加成）' : ''}`;
                tw.state._qiShangBanner = idxInCycle === dash.cycle ? '💢 七伤齐发！' : null;
            });

            // —— 2026-10-22 被攻击也推进七伤：每次被命中 4% 概率 +1 计数、自损 4% maxHp（留 1 血），
            //   满 7 对攻击者冲刺。若此时本回合还没出手，冲刺后立刻补一刀（消耗行动权），
            //   攻击者已死/待死则不冲（core/10 的 _pendingDeath 守卫同理）。
            //   优先级裸数字 60（晚于 55 的「自损量搬进攻击组」；AFTER_DAMAGE_APPLIED 无 QISHANG 键，故不引用层键）
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, 60, (data) => {
                if (data.target !== tw || !tw.alive) return;
                if (tw.state._pendingDeath) return;
                if (!data.dmg || data.dmg <= 0) return;
                const attacker = data.unit;
                if (!attacker || !attacker.alive || attacker === tw) return;
                if (getBattleRng().nextInt(1, 100) > Math.round(hc.chance * 100)) return;   // 与回春同率 4%
                const n = (tw.state._qiShangCount || 0) + 1;
                tw.state._qiShangCount = n;
                const want = Math.max(qi.minSelfDmg, Math.round(tw.maxHp * qi.selfHpPct));
                const real = Math.min(want, Math.max(0, Math.floor(tw.hp) - 1));
                if (real > 0) applyStatChange(tw, 'hp', -real, null, '七伤拳自损', false);
                pushSkillAnnounce(data.log, tw, '七伤拳',
                    `👊 唐文亮七伤拳（被击）：自损 ${real} 点（伤己 ${((n - 1) % dash.cycle) + 1}/${dash.cycle}）`,
                    { floatText: `💥-${real}`, floatUid: tw.uid });
                if (((n - 1) % dash.cycle) + 1 !== dash.cycle) return;
                // 满档：对攻击者冲刺
                doDash(attacker, data.log);
                // 本回合未出手 → 冲刺后补一刀，并消耗行动权
                if (!tw.state._acted) {
                    tw.state._acted = true;
                    if (!data.extraRequests) data.extraRequests = [];
                    data.extraRequests.push({
                        unit: tw,
                        targetUid: attacker.alive ? attacker.uid : null,
                        reason: 'dashStrike',
                        priority: 13,
                        infoText: `<span class="gold">⚡ ${tw.name} 被打急了眼，趁势反手一拳！</span>`
                    });
                }
            });

            // ①-b 攻击组内演出把手：把本击的「报幕文本 / 横幅 / 自损量」搬进**本击攻击组**（老板口径：单位自己
            //   产生的攻击前置与特效必须落在自己的攻击组内）——报幕行插在本组 entries 开头（与殷天正 pushInfo
            //   同口径）；自损量/横幅挂本组 data，由 render/38 翻成同组演出（💥-N 掉血弹幕 / 💢 横幅）。
            //   自损发生在命中判定之后（MISS/DODGE 分支不进 BEFORE_DAMAGE_CALC），故此标记天然只挂命中路径；
            //   优先级裸数字 55（不新增 infra/50 层键，与胖远桥蓄力回血钩子同口径）
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, 55, (data) => {
                if (data.unit !== tw) return;
                const selfDmg = tw.state._qiShangDmg;
                const note = tw.state._qiShangNote;
                const banner = tw.state._qiShangBanner;
                Object.assign(tw.state, { _qiShangDmg: 0, _qiShangNote: null, _qiShangBanner: null });
                const gd = data.group && data.group.data;
                if (!gd) return;
                if (note && Array.isArray(gd.entries)) gd.entries.unshift({ type: 'info', text: note });
                if (selfDmg > 0) gd.qiShangSelfDmg = selfDmg;
                if (banner) gd.qiShangBanner = banner;
            });

            // ② 回春术：每回合开始，逐层回自身已损生命的 hc.lostHpPct（血 <30% 时 hc.lostHpPctLow）——
            //    层数数组每人每层各回一次（逐层按当时血量算，血越空回得越多），每层剩余回合 -1、归零即移除。
            //    走统一声明出口（ROUND_STAT_GRANT）+ 通用 HEAL 通道（🌿 飘字 + 战报行），总回血量合并成一条
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, 33, (data) => {
                if (!tw.alive || tw.state._pendingDeath) return;
                const stacks = tw.state._hcStacks || [];
                if (stacks.length === 0) return;
                let vhp = tw.hp;
                let total = 0;
                const next = [];
                for (const remain of stacks) {
                    const ratio = vhp < tw.maxHp * hc.lowHpThreshold ? hc.lostHpPctLow : hc.lostHpPct;
                    const healed = Math.floor((tw.maxHp - vhp) * ratio);
                    if (healed > 0) { total += healed; vhp = Math.min(tw.maxHp, vhp + healed); }
                    if (remain - 1 > 0) next.push(remain - 1);
                }
                tw.state._hcStacks = next;
                if (total <= 0) return;
                const hpBefore = Math.floor(tw.hp);
                // 2026-10-22 飘字取实际落地值（截脉/寒毒打折后）
                const actualTotal = previewHeal(tw, total);
                if (data.declarations) data.declarations.push({ type: EFFECT_TYPES.ROUND_STAT_GRANT, field: 'hp', delta: total, target: tw, source: null, reason: '回春术' });
                recordHpAudit(tw, 'huiChun', total, '回春术');
                if (data.log) data.log.push({ factType: FACT_TYPES.HEAL, data: {
                    unitName: tw.name, unitUid: tw.uid, heal: actualTotal,
                    hpBefore: fmtHp(hpBefore), hpAfter: fmtHp(hpBefore + actualTotal),
                    // 修飘字锚点静默失效：原 anchorVerb:'回复' 与正文前缀 label '回春术' 不一致 ⇒ 锚「回复+N」
                    //   不是正文「🌿 回春术+N」子串，飘字永不触发。删 anchorVerb 回退 label 兜底（render/36：
                    //   anchorVerb || label）——胖远桥'蓄力回复'没事是其 label 本身含'回复'。
                    icon: '🌿', label: '回春术', mode: 'plusTrail'
                } });
            });

            // ④ 同归于尽：阵亡时反噬击杀者，扣其 maxHp×reflectRatio 的真实伤害——可被闪避、可直接致死。
            //    击杀者来自 core/13 致死出口的 _killerUid 记账；找不到有效凶手（毒/无源伤害致死、
            //    凶手同帧阵亡）时退回随机一名存活敌人。落空两层独立判（引擎同源公式、概率直读）：
            //   ①自身未命中 getMissBreakdown ②目标闪避 computeDodgeChance（含闪避规则表 + 流云身法）；
            //    反噬是死人出手，不吃「行动过不能闪避」引擎前置，故此处直调公式而非走 resolveAttackHit
            eventBus.on(SIGNAL_TYPES.ON_UNIT_DEATH, L.ON_UNIT_DEATH.TONG_GUI, (data) => {
                const dead = (data.deadUnits || []).find(u => u.isTangWenLiang);
                if (!dead) return;
                const allies = [...(data.allySide || []), ...(data.enemySide || [])];
                const valid = v => v && v.alive && !v.state._pendingDeath && !v.isHorse && v.camp !== dead.camp;
                let victim = allies.find(u => u.uid === dead.state._killerUid && valid(u)) || null;
                if (!victim) {
                    const pool = (dead.camp === CAMP_TYPES.ALLY ? data.enemySide : data.allySide) || [];
                    const candidates = pool.filter(valid);
                    if (!candidates.length) return;
                    victim = candidates[getBattleRng().nextInt(0, candidates.length - 1)];
                }
                const deadSide = dead.camp === CAMP_TYPES.ALLY ? data.allySide : data.enemySide;
                const victimSide = victim.camp === CAMP_TYPES.ALLY ? data.allySide : data.enemySide;
                const rng = getBattleRng();
                const missChance = getMissBreakdown(dead, deadSide, victimSide).total;
                if (missChance > 0 && rng.nextInt(1, 100) <= missChance) {
                    if (data.log) {
                        const missFact = { type: 'miss', attacker: snapshotUnitForFact(dead), target: snapshotUnitForFact(victim), fxSnapshot: makeFXSnapshot(dead, victim) };
                        missFact.events = flushBattleEvents();
                        data.log.push({ factType: FACT_TYPES.MISS, data: missFact });
                        pushSkillAnnounce(data.log, dead, '同归于尽', `💨 唐文亮同归于尽反噬 ${victim.name}：打空了`, { floatText: '💨', floatUid: victim.uid });
                    }
                    return;
                }
                const defenderStats = computeBuffStats(victim, victimSide && victimSide._activeBuffs, victimSide);
                const dodgeChance = computeDodgeChance(victim, dead, defenderStats);
                victim.state._dodgeChance = Math.round(dodgeChance * 100);
                if (dodgeChance > 0 && rng.nextInt(1, 100) <= dodgeChance * 100) {
                    if (data.log) {
                        const dodgeFact = { type: 'dodge', attacker: snapshotUnitForFact(dead), dodger: snapshotUnitForFact(victim),
                            reboundDmg: 0, attackerHpBefore: 0, attackerHpAfter: 0, attackerAlive: false,
                            attackerAtk: Math.floor(getStat(dead, 'atk')), dodgerDef: Math.floor(getStat(victim, 'def')),
                            dodgerHp: Math.floor(victim.hp), weiHeal: null, fxSnapshot: makeFXSnapshot(victim, dead) };
                        dodgeFact.events = flushBattleEvents();
                        data.log.push({ factType: FACT_TYPES.DODGE, data: dodgeFact });
                        pushSkillAnnounce(data.log, dead, '同归于尽', `🌀 唐文亮同归于尽反噬 ${victim.name}：被闪避了`, { floatText: '🌀', floatUid: victim.uid });
                    }
                    return;
                }
                // 命中：全额真实伤害（不走攻防公式），不保留 1 血——致死则挂 _pendingDeath 交 resolveDeaths 统一结算
                const want = Math.max(1, Math.round(victim.maxHp * tong.reflectRatio));
                applyStatChange(victim, 'hp', -want, dead, '同归于尽');
                if (data.log) pushSkillAnnounce(data.log, dead, '同归于尽', `💥 唐文亮同归于尽：反噬击杀者 ${victim.name}，扣 ${want} 点生命`, { floatText: '💥', floatUid: victim.uid });
            });
        }
    };
}
