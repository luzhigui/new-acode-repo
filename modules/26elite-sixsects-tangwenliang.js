// modules/26elite-sixsects-tangwenliang.js — 六大派精英「唐文亮」（崆峒·标枪弱精英·M104）：
//   ① 七伤拳（出手自损换增伤 / 临危更凶） + ② 回春术（可叠加的持续回血） +
//   ③ 冲刺·七伤齐发（满 7 次出手冲前排、拽目标到 123 位、双方各受当前生命 45% 真伤、转近战战士） +
//   ④ 同归于尽（阵亡反噬击杀者）
export const VER = 'modules/26elite-sixsects-tangwenliang.js V7.1.1';
import { getSkillParams } from '../core/01config-5v5-test.js';
import { getRoleBonus } from '../core/02unit.js';
import { addMod, applyStatChange, emitEvent, getBattleRng, getStat, moveUnitPosition, refreshMaxHp, recordHpAudit, previewHeal } from '../core/13battle-shared.js';
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
            // 叠层：只累加 _hcStacks（remaining 起始 = hc.rounds），不立即回血。
            //   回血统一由 tickHuiChun 在「行动完那一刻」（ON_UNIT_ACTED / 冲刺后赠送攻击完）结算。
            function addHuiChunStack(unit, outLog) {
                const stacks = [...(unit.state._hcStacks || []), hc.rounds];
                unit.state._hcStacks = stacks.filter(r => r > 0);
                if (outLog) pushSkillAnnounce(outLog, unit, '回春术',
                    `🌿 ${unit.name} 回春术 +1 层（${stacks.length} 层）`,
                    { floatText: '🌿', floatUid: unit.uid });
            }

            // 回春结算：逐层按当前已损血比回一次，每层 remaining-1，归零移除。
            //   每层按「回血前」的当前血量比计算（血越空回得越多），逐层推进。
            function tickHuiChun(unit, outLog) {
                if (!unit || !unit.alive) return;
                const stacks = unit.state._hcStacks || [];
                if (stacks.length === 0) return;
                let vhp = unit.hp;
                let total = 0;
                const next = [];
                for (const remain of stacks) {
                    const ratio = vhp < unit.maxHp * hc.lowHpThreshold ? hc.lostHpPctLow : hc.lostHpPct;
                    const healed = Math.floor((unit.maxHp - vhp) * ratio);
                    if (healed > 0) { total += healed; vhp = Math.min(unit.maxHp, vhp + healed); }
                    if (remain - 1 > 0) next.push(remain - 1);
                }
                unit.state._hcStacks = next;
                if (total <= 0) return;
                const hpBefore = Math.floor(unit.hp);
                const actualTotal = previewHeal(unit, total);
                applyStatChange(unit, 'hp', total, null, '回春术');
                recordHpAudit(unit, 'huiChun', actualTotal, '回春术');
                if (outLog) outLog.push({ factType: FACT_TYPES.HEAL, data: {
                    unitName: unit.name, unitUid: unit.uid, heal: actualTotal,
                    hpBefore: fmtHp(hpBefore), hpAfter: fmtHp(hpBefore + actualTotal),
                    icon: '🌿', label: '回春术', mode: 'plusTrail'
                } });
            }
            // ③ 冲刺·七伤齐发：冲到「目标同列」的己方前排位（1/2/3），落点被占不换人——
            //    沿 PUSH_PATH（本列自上而下，满了往邻列顺延）把挡路队友整列前推到空位
            //    （2026-10-23 拍板：换位制两人对调 → 强推挤压制）；
            //    双方各受当前生命 dmgRatio / selfDmgRatio 真伤；之后叠一套战士加成、转「战士」近战
            // 列路径（key=frontPos 所在列 0/1/2）：先本列 1→4→7，满了按邻列顺序顺延
            const PUSH_PATH = {
                0: [1, 4, 7, 2, 5, 8, 3, 6, 9],
                1: [2, 5, 8, 1, 4, 7, 3, 6, 9],
                2: [3, 6, 9, 2, 5, 8, 1, 4, 7]
            };
            // 飞天/附身原格不可推——判据照抄 core/13 resolvePushOrStun（2026-10-23 拍板），别另造
            const isAirborne = (u) => !!(u.state && (u.state._spiderFlying || u.state._butterflyHost || u.state._flyMode === 'spider' || u.state._flyMode === 'butterfly')) || !!(u._fsm && (u._fsm.is('attached') || u._fsm.is('flying')));

            // 只读扫描：算「unit 落到 targetPos」的推挤路径，不改任何 pos——
            //   落地必须走 applyMoves→moveUnitPosition（免疫守卫/POS_CHANGE 事件/战报行全在接口里，不许绕过 core/13）。
            //   落点被免疫/飞天占 → 失败（外层换列）；路径中间遇免疫 → 失败（外层换列）；
            //   路径中间遇飞天/附身 → 穿过（视同空位继续往后找）。
            function forceInsert(team, unit, targetPos) {
                if (unit.pos === targetPos) return { ok: true, moved: [] };

                // 落点检查：被免疫/飞天占 → 直接失败（外层换列）
                const occAtTarget = team.find(u => u !== unit && u.pos === targetPos && u.alive);
                if (occAtTarget) {
                    if (occAtTarget.state && occAtTarget.state._ctrlImmune) {
                        return { ok: false, reason: 'blocked-target-immune', blocked: occAtTarget, moved: [] };
                    }
                    if (isAirborne(occAtTarget)) {
                        return { ok: false, reason: 'blocked-target-airborne', blocked: occAtTarget, moved: [] };
                    }
                }
                // 落点本身空着 → 不推任何人，直接落（旧版从 startIdx+1 往后扫到第一个空格，
                //   会把落点之后的队友整串前推——2 号位空着却把 5 号的队友推到 8 号，就是老板看到的现象）
                if (!occAtTarget) return { ok: true, moved: [{ unit, from: unit.pos, to: targetPos, isDash: true }] };

                const col = (targetPos - 1) % 3;
                const path = PUSH_PATH[col];
                const startIdx = path.indexOf(targetPos);
                if (startIdx === -1) return { ok: false, reason: 'bad-pos', moved: [] };

                let emptyIdx = -1, blocked = null;
                for (let i = startIdx + 1; i < path.length; i++) {
                    const p = path[i];
                    const occ = team.find(u => u !== unit && u.pos === p && u.alive);
                    if (occ) {
                        if (occ.state && occ.state._ctrlImmune) { blocked = occ; break; }  // 路径中间免疫 → 换列
                        if (isAirborne(occ)) continue;   // 飞天/附身 → 穿过（视同空位）
                        continue;                        // 活人 → 继续往后
                    }
                    emptyIdx = i; break;
                }

                if (blocked) return { ok: false, reason: 'blocked-path-immune', blocked, moved: [] };
                if (emptyIdx === -1) return { ok: false, reason: 'full', moved: [] };

                const moved = [];
                for (let i = emptyIdx; i > startIdx; i--) {
                    const curr = path[i], prev = path[i - 1];
                    const mover = team.find(u => u !== unit && u.pos === prev && u.alive);
                    if (mover && !isAirborne(mover)) moved.push({ unit: mover, from: prev, to: curr });
                }
                moved.push({ unit, from: unit.pos, to: targetPos, isDash: true });
                return { ok: true, moved };
            }

            // 多列尝试：先落 preferredPos；失败则随机试另两列（老板口径：「1 或 3 随机」）。
            //   任何原因导致失败（落点免疫/飞天/路径免疫/满）都换列；三列全失败才真的不动。
            function forceInsertAnyColumn(team, unit, preferredPos) {
                const r0 = forceInsert(team, unit, preferredPos);
                if (r0.ok) return r0;
                const prefCol = (preferredPos - 1) % 3;
                // 另两列（col 0/1/2 映射到 pos 1/2/3）
                const altCols = prefCol === 1 ? [0, 2] : (prefCol === 0 ? [1, 2] : [0, 1]);
                const altPos = altCols.map(c => c + 1);
                // 随机顺序（老板口径「1 或 3 随机」）
                if (getBattleRng().nextInt(0, 1) === 0) altPos.reverse();
                for (const pos of altPos) {
                    const r = forceInsert(team, unit, pos);
                    if (r.ok) return r;
                }
                return { ok: false, reason: 'all-blocked', moved: [] };
            }

            // 落地：moved 已是「末端→前端」顺序，正序调用不会撞格
            function applyMoves(moves, log) {
                for (const m of moves) moveUnitPosition(m.unit, m.to, log);
            }

            function doDash(target, outLog) {
                const frontPos = ((target.pos - 1) % 3) + 1;   // 目标同列的前排位（首选）
                const twFromPos = tw.pos;
                const targetFromPos = target.pos;
                const allyTeam = target.camp === CAMP_TYPES.ALLY ? A : B;
                const enemyTeam = tw.camp === CAMP_TYPES.ALLY ? A : B;
                // 多列尝试（首选同列前排；被免疫/飞天占或路径被免疫挡 → 随机换 1/3 列）
                const allyRes = target.pos > 3 ? forceInsertAnyColumn(allyTeam, target, frontPos) : { ok: true, moved: [] };
                const enemyRes = forceInsertAnyColumn(enemyTeam, tw, frontPos);
                // 先落冲方、再落目标方
                if (enemyRes.ok) applyMoves(enemyRes.moved, outLog);
                if (allyRes.ok) applyMoves(allyRes.moved, outLog);

                // 真伤：当前生命 45%，上限「当前血 - 1」（冲刺不会致死，老板口径）
                const toFoe = Math.max(0, Math.min(Math.round(target.hp * dash.dmgRatio), Math.floor(target.hp) - 1));
                if (toFoe > 0) applyStatChange(target, 'hp', -toFoe, tw, '冲刺·七伤齐发');
                const toSelf = Math.max(0, Math.min(Math.round(tw.hp * dash.selfDmgRatio), Math.floor(tw.hp) - 1));
                if (toSelf > 0) applyStatChange(tw, 'hp', -toSelf, null, '冲刺·七伤齐发自损', false);

                addRoleBonus(tw, ROLE_TYPES.WARRIOR, '冲刺·转战士');
                const rb = getRoleBonus(ROLE_TYPES.WARRIOR);
                if (outLog) outLog.push({ factType: FACT_TYPES.TW_DASH_APPLY, data: { unitName: tw.name, unitUid: tw.uid, camp: tw.camp, atk: rb.atk, def: rb.def, maxHp: rb.maxHp } });
                switchRole(tw, ROLE_TYPES.WARRIOR, '冲刺·转战士', outLog);
                // 回春延到「冲刺后那一拳」结算完再叠
                tw.state._pendingDashHeal = true;
                tw.state._isDashStrikeFx = true; // 标记本击跳过物理攻击动画
                if (outLog) {
                    const moves = [...(enemyRes.ok ? enemyRes.moved : []), ...(allyRes.ok ? allyRes.moved : [])]
                        .map(m => ({ uid: m.unit.uid, camp: m.unit.camp, from: m.from, to: m.to, isDash: !!m.isDash }));
                    const blockText = (res) => {
                        if (res.reason === 'full') return '无空位';
                        if (res.reason === 'all-blocked') return '全部列被免疫/飞天挡下、整侧不动';
                        const b = res.blocked;
                        return `被 ${b.name}${isAirborne(b) ? '（飞天/附身）' : '免疫'} 挡下、整侧不动`;
                    };
                    const listText = (res) => res.moved.map(m => `${m.unit.name} ${m.from}→${m.to}`).join('、');
                    const enemyText = enemyRes.ok
                        ? (listText(enemyRes) || '唐文亮原地未动')
                        : `唐文亮无法落位（${blockText(enemyRes)}）`;
                    const allyText = target.pos > 3
                        ? (allyRes.ok ? (listText(allyRes) || `${target.name} 原地未动`) : `目标侧${blockText(allyRes)}`)
                        : `${target.name} 已在前排`;
                    pushSkillAnnounce(outLog, tw, '冲刺·七伤齐发', `⚡ 唐文亮冲刺·七伤齐发：${enemyText}；${allyText}。双方各受当前生命 ${Math.round(dash.dmgRatio * 100)}% 真伤（目标 -${toFoe} / 自身 -${toSelf}），转近战战士`,
                        { floatText: '⚡', floatUid: target.uid,
                          // 冲刺是唐文亮的独立动作（被动触发时插在攻击者组后），画分隔线自成一段
                          needsSeparator: true,
                          dash: { fromUid: tw.uid, fromPos: twFromPos, toPos: tw.pos, fromCamp: tw.camp,
                                  targetUid: target.uid, targetFromPos, targetToPos: target.pos, targetCamp: target.camp,
                                  moves,
                                  // 子弹时间慢速档 ⑥ 伤害数字数据源（fx/94 按 uid 找格子浮字）
                                  hits: [
                                      toFoe > 0 ? { uid: target.uid, dmg: toFoe } : null,
                                      toSelf > 0 ? { uid: tw.uid, dmg: toSelf } : null
                                  ].filter(Boolean) } });
                }
            }

            // 冲刺后的回春：等这一拳（dashStrike 或紧随的普攻）结算完再叠 + 立即 tick 回血。
            //   冲刺后的这一拳若走额外攻击通道（被动触发/赠送攻击），core/11 不会再 emit ON_UNIT_ACTED，
            //   所以此处必须「叠 + tick」一起做；主动冲刺的普攻在 ON_UNIT_ACTED 会再触发一次，
            //   由 _hcTickedThisTurn 拦下（本回合已 tick 过则跳过），不会双回血。
            const flushDashHeal = (data) => {
                if (data.unit !== tw || !tw.alive || !tw.state._pendingDashHeal) return;
                tw.state._pendingDashHeal = false;
                tw.state._isDashStrikeFx = false; // 清理标记
                addHuiChunStack(tw, data.log);
                if (!tw.state._hcTickedThisTurn) {
                    tickHuiChun(tw, data.log);
                    tw.state._hcTickedThisTurn = true;
                }
            };
            eventBus.on(SIGNAL_TYPES.AFTER_ATTACK, 60, flushDashHeal);
            eventBus.on(SIGNAL_TYPES.AFTER_MISS, 60, flushDashHeal);
            // 免疫分支（AFTER_ATTACK_IMMUNE，小昭·妹飞天）：上面两条都不发，
            //   这一拳打出去了但回春不叠——补挂一条，保证「冲刺后必叠」在任何结算分支都成立。
            eventBus.on(SIGNAL_TYPES.AFTER_ATTACK_IMMUNE, 60, flushDashHeal);
            // 闪避分支：被闪避时 core/10 的 skipped 分支直接 return，AFTER_ATTACK/AFTER_MISS 都不发，
            //   只有 core/12 内部 emit 的 ON_DODGE（data.unit = 攻击者）——漏挂这条导致
            //   「冲刺后的平A被闪避 → 回春叠不上」（线上实测病根）。tw 作为攻击者时 data.unit === tw 通过，
            //   别人闪避时 data.unit 是别人、被判据拦掉，不会误触发。
            eventBus.on(SIGNAL_TYPES.ON_DODGE, 60, flushDashHeal);

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
                    addHuiChunStack(tw, data.log);   // 每次出手 4% 概率叠 1 层（只叠层，回血由行动完 ON_UNIT_ACTED 的 tickHuiChun 结算）
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

            // ——被攻击推进七伤：每次被命中必涨 1 次计数（无概率）——老板口径：被击必涨七伤。
            //   自损 4% maxHp（留 1 血）随计数同进。
            //   4% 概率的位置在「被击是否叠回春」上（与出手同率），不在「涨不涨计数」上。
            //   满 7 → 冲刺 + 赠送一次攻击（不论本回合是否已行动过，都赠送攻击；见用户口径 a/b 统一）。
            //   优先级裸数字 60（晚于 55 的「自损量搬进攻击组」；AFTER_DAMAGE_APPLIED 无 QISHANG 键，故不引用层键）
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, 60, (data) => {
                if (data.target !== tw || !tw.alive) return;
                if (tw.state._pendingDeath) return;
                if (!data.dmg || data.dmg <= 0) return;
                const attacker = data.unit;
                if (!attacker || !attacker.alive || attacker === tw) return;

                // 计数必涨（老板口径：被击必涨七伤，无概率）
                const n = (tw.state._qiShangCount || 0) + 1;
                tw.state._qiShangCount = n;
                const want = Math.max(qi.minSelfDmg, Math.round(tw.maxHp * qi.selfHpPct));
                const real = Math.min(want, Math.max(0, Math.floor(tw.hp) - 1));
                if (real > 0) applyStatChange(tw, 'hp', -real, null, '七伤拳自损', false);
                pushSkillAnnounce(data.log, tw, '七伤拳',
                    `👊 唐文亮七伤拳（被击）：自损 ${real} 点（伤己 ${((n - 1) % dash.cycle) + 1}/${dash.cycle}）`,
                    { floatText: `💥-${real}`, floatUid: tw.uid });

                // 满 7 → 冲刺 + 赠送一次额外攻击（a/b 两种场景统一：都赠送攻击）
                if (((n - 1) % dash.cycle) + 1 === dash.cycle) {
                    doDash(attacker, data.log);
                    tw.state._acted = true;
                    tw.state._pendingDashHeal = true;
                    if (!data.extraRequests) data.extraRequests = [];
                    data.extraRequests.push({
                        unit: tw,
                        targetUid: attacker.alive ? attacker.uid : null,
                        reason: 'dashStrike',
                        priority: 13,
                        infoText: `<span class="gold">⚡ ${tw.name} 被打急了眼，趁势反手一拳！</span>`
                    });
                    return;
                }

                // 未满 7：独立 4% 叠回春（这是「被击触发回春」的真实位置）
                if (getBattleRng().nextInt(1, 100) <= Math.round(hc.chance * 100)) {
                    addHuiChunStack(tw, data.log);
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

            // ② 回春术：回血时机从「回合开始」改为「行动完那一刻」——冲刺自损/普攻自损全部结算完，
            //    在该单位本回合行动结束的那一刹那回一次。叠层动作本身不回血（见 addHuiChunStack）。
            //    回合开始只做一件事：清 _hcTickedThisTurn（本回合尚未 tick，等待行动完触发）。
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, 33, (data) => {
                if (!tw.alive) return;
                tw.state._hcTickedThisTurn = false;
            });

            // ③ 行动完 tick：每次行动结束（攻击/休息/被遮挡）emit ON_UNIT_ACTED，此处触发回春回血。
            //    优先级 55（晚于常规 ON_UNIT_ACTED 监听，确保其他机制已处理完）。本回合已 tick 则跳过。
            eventBus.on(SIGNAL_TYPES.ON_UNIT_ACTED, 55, (data) => {
                if (data.unit !== tw || !tw.alive) return;
                if (tw.state._pendingDeath) return;
                if (tw.state._hcTickedThisTurn) return;
                if (!Array.isArray(tw.state._hcStacks) || tw.state._hcStacks.length === 0) return;
                tickHuiChun(tw, data.log);
                tw.state._hcTickedThisTurn = true;
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
