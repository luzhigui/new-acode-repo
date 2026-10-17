// modules/26elite-sixsects-hetaichong.js — 六大派精英「何太冲」：两仪连接 / 箭靶标记 / 红血
// V6.26.0 | ~15815 bytes | 2026-10-13 红血触发改挂 ON_UNIT_ACTED（行动结束帧）：旧挂 BEFORE_DAMAGE_APPLY
//   是「先换位后挨打」——swap 事实序排在本击攻击组之前，攻击组还按换位后坐标画出「追着打」；
//   改后整段攻击（含双击/连锁）先落地打成红血，行动结束再播两仪互换；打死不触发（hp≤0/待死跳过），
//   加血独立行随迁本文件（core/10 的对照补偿退役）。优先级 ON_UNIT_ACTED:30 见 infra/50 V6.9.0。
export const VER = 'modules/26elite-sixsects-hetaichong.js V6.26.0';
import { getSkillParams } from '../core/01config-5v5-test.js';
import { getRoleBonus } from '../core/02unit.js';
import { addMod, getStat, getBattleRng, refreshMaxHp, swapUnitPositions, moveUnitPosition, emitEvent } from '../core/13battle-shared.js';
import { emitStateChange } from '../infra/59-state-change.js';
import { applyRoleBonusMods, switchRoleOnly } from './23elite-helpers.js';
import { EFFECT_TYPES, EXECUTION_LAYER as L } from '../infra/50-event-bus.js';
import { SIGNAL_TYPES, FACT_TYPES, ROLE_TYPES, STATE_CHANGE_TYPES, UNIT_EVENT_TYPES } from '../infra/56-battle-enums.js';

// ========== 何太冲（六大派·昆仑·远程；「两仪双修」型弱精英） ==========
// 2026-10-12 重做 V3：旧三技能（连环箭/破甲箭/昆仑合击）整组删除，改由本组件全量承接。
//   机制① 两仪连接：开局即与一名对系队友（远程连战士、战士连远程）结连（☯），
//     双方互授对方职业能力（_dualSchools）→ core/03 的破防/斩杀/远程成长三个声明按能力放行，
//     即「连接期间共享战士+远程两系攻击特效」。连接绑定不更换，搭档阵亡即断连。
//   机制② 箭靶标记 🎯：何太冲命中即挂标（3 回合、不叠层）；带标目标被队友打 ×1.3、被何太冲打 ×1.5 并当场刷新。
//   机制③ 红血：血量 ≤40% 触发（每局限一次，不挑伤害来源），判定在当次行动结束帧——先挨打成红血、演出完再换位；
//     有连接且仅一方红血 → 两仪互换，
//     否则走单人规则（先叠两套加成，能撤则撤切远程，撤不了再叠战士加成切战士）。
export function createHeTaichongComponent() {
    return {
        name: '何太冲',
        register(eventBus, A, B, log) {
            const he = B.find(u => u.isHeTaichong && u.alive);
            if (!he) return;
            const mark = getSkillParams('何太冲', 'targetMark');
            if (!mark) throw new Error('缺技能参数: 何太冲.targetMark');
            const red = getSkillParams('何太冲', 'redBlood');
            if (!red) throw new Error('缺技能参数: 何太冲.redBlood');
            const team = B;
            const redThreshold = (red.thresholdPct || 40) / 100;

            // 连接搭档（存活才算；阵亡 / 未连接 → null，即单人态）
            const partnerOf = (u) => (u.state._liangyiPartnerUid ? team.find(p => p.alive && p.uid === u.state._liangyiPartnerUid) : null);

            // 只登记职业加成（不改职业）：旧加成保留，照蛛变「叠新不扣旧」口径
            // 红血加成 grants 收集器（2026-10-13 第 85 轮体检转交）：每套加成记一条 {uid, atk, def, maxHp}，
            //   由下方 announce fact 的 data.grants 带给体检契约 HE_TAICHONG_RED 对账；只读 bonus 原值，零行为副作用
            let pendingGrants = null;
            function addRoleBonus(unit, role, label) {
                const bonus = applyRoleBonusMods(unit, role, label, 'heTaichongRed');
                if (pendingGrants) pendingGrants.push({ uid: unit.uid, atk: bonus.atk, def: bonus.def, maxHp: bonus.maxHp });
            }
            // 换职业 + 叠该职业加成（两仪互换 / 单人红血共用）
            function switchRole(unit, role, label, outLog) {
                addRoleBonus(unit, role, label);
                switchRoleOnly(unit, role, label, outLog);
            }

            // ── 机制① 两仪连接（建立一次即绑定，不更换） ──
            if (he.state._liangyiPartnerUid == null) {
                const foeRole = he.role === ROLE_TYPES.WARRIOR ? ROLE_TYPES.RANGED : ROLE_TYPES.WARRIOR;
                const candidates = team.filter(u => u.alive && u.uid !== he.uid && u.role === foeRole && !u.isHorse);
                if (candidates.length > 0) {
                    const partner = candidates[getBattleRng().nextInt(0, candidates.length - 1)];
                    Object.assign(he.state, { _liangyiPartnerUid: partner.uid, _dualSchools: [foeRole] });
                    Object.assign(partner.state, { _liangyiPartnerUid: he.uid, _dualSchools: [he.role] });
                    if (log) log.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: { unitName: he.name, unitUid: he.uid, camp: he.camp, skillName: '两仪双修', note: `☯ 两仪连接：${he.name} 与 ${partner.name}` } });
                }
            }

            // ── 箭靶标记 🎯 计时：每回合开始递减（挂标当回合算 1 回合，共 mark.rounds 回合＝当前回合+下一回合） ──
            for (const u of [...A, ...B]) {
                if (u.state._heMarkRounds > 0) u.state._heMarkRounds -= 1;
            }

            // ── 机制② 箭靶标记（加伤） ──
            eventBus.on(SIGNAL_TYPES.BEFORE_DAMAGE_CALC, L.BEFORE_DAMAGE_CALC.HE_TAICHONG_MARK, (data) => {
                const unit = data.unit;
                if (!unit || unit.camp !== he.camp) return;
                // 单人常态（无存活搭档）：何太冲攻击伤害 ×soloMult
                if (unit.uid === he.uid && !partnerOf(he)) {
                    data.declarations.push({ type: EFFECT_TYPES.DMG_MULTIPLIER, value: red.soloMult, source: he, label: '两仪独修' });
                }
                const t = data.target;
                if (!t || !t.state || !(t.state._heMarkRounds > 0)) return;
                // 2026-10-12 乘区改档（老板拍板）：何太冲「或」其搭档打带标目标 ×carrierMult(1.3)、其他队友 ×allyMult(1.1)
                const p = partnerOf(he);
                const isCarrier = unit.uid === he.uid || !!(p && unit.uid === p.uid);
                const mult = isCarrier ? mark.carrierMult : mark.allyMult;
                data.declarations.push({ type: EFFECT_TYPES.DMG_MULTIPLIER, value: mult, source: he, label: '箭靶标记' });
                if (data.log) {
                    data.log.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: { unitName: he.name, unitUid: he.uid, camp: he.camp, skillName: '箭靶标记', note: `箭靶标记 ×${mult}`, line: false, floatText: `🎯×${mult}`, floatUid: unit.uid } });
                }
            });

            // ── 机制② 箭靶标记（挂标 / 一次性消耗） ──
            // 挂标属「攻击特效」：何太冲与其两仪搭档（存活才算连）命中都可上标；
            // 任何人（同阵营）打中带标目标 → 标记当帧消耗消失；何太冲/搭档打中后随即重挂。
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.HE_TAICHONG_MARK, (data) => {
                const unit = data.unit;
                if (!unit || unit.camp !== he.camp || !he.alive) return;
                if (!data.dmg || data.dmg <= 0) return;
                const t = data.target;
                if (!t || !t.alive || !t.state) return;
                const consumed = t.state._heMarkRounds > 0;
                if (consumed) t.state._heMarkRounds = 0;
                // 2026-10-12 碎裂时机前移 + 扩围（老板拍板）：消费的「碎裂」原先落日志行 → 排在整组文本之后、永远最后出来，
                //   改挂本击攻击组标记 markBurst（ATTACK 演出在命中帧、伤害弹幕之前播靶子碎裂）；
                //   且「任何人」的消耗都播（原只给何太冲/搭档的消费播）——飞起=标碎=logo 没，三件事同格同时。
                if (consumed && data.group && data.group.data) data.group.data.markBurst = true;
                const partner = partnerOf(he);
                const isCarrier = unit.uid === he.uid || (partner && unit.uid === partner.uid);
                if (!isCarrier) return;
                t.state._heMarkRounds = mark.rounds;
                if (consumed) {
                    // 2026-10-12 补回日志行（老板：被攻击者的 🎯 log 不能缺）：消耗→重挂 = 命中帧碎裂（markBurst 演出）+ 一行「重新标记」文本
                    if (data.log) data.log.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: { unitName: unit.name, unitUid: unit.uid, camp: he.camp, skillName: '箭靶标记', note: `🎯 ${unit.name} 重新标记 ${t.name}` } });
                } else if (data.log) {
                    data.log.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: { unitName: unit.name, unitUid: unit.uid, camp: he.camp, skillName: '箭靶标记', note: `🎯 ${unit.name} 标记 ${t.name}`, floatText: '🎯', floatUid: t.uid } });
                }
            });

            // ── 机制③ 红血（当帧判定，每局限一次） ──
            function soloRedBlood(u, outLog) {
                // ① 先叠一套战士加成，再叠一套远程加成
                addRoleBonus(u, ROLE_TYPES.WARRIOR, '红血·战士');
                addRoleBonus(u, ROLE_TYPES.RANGED, '红血·远程');
                // ② 能撤则撤：移到一名 1–6 位存活队友身后的空位（同列后方），切远程
                let retreatPos = null;
                for (const mate of team) {
                    if (!mate.alive || mate.uid === u.uid || mate.isHorse) continue;
                    if (mate.pos < 1 || mate.pos > 6) continue;
                    const back = mate.pos + 3;
                    if (!team.some(x => x.alive && x.pos === back)) { retreatPos = back; break; }
                }
                if (retreatPos != null) {
                    moveUnitPosition(u, retreatPos, outLog);
                    switchRole(u, ROLE_TYPES.RANGED, '红血·转远程', outLog);
                    if (outLog) outLog.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: { unitName: u.name, unitUid: u.uid, camp: u.camp, skillName: '红血', note: `🩸 ${u.name} 红血：撤退至 ${retreatPos} 号位、转远程`, floatText: '🩸', floatUid: u.uid, grants: pendingGrants } });
                } else {
                    // ③ 无法撤退 → 再叠一套战士加成，切战士
                    addRoleBonus(u, ROLE_TYPES.WARRIOR, '红血·战士');
                    switchRole(u, ROLE_TYPES.WARRIOR, '红血·转战士', outLog);
                    if (outLog) outLog.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: { unitName: u.name, unitUid: u.uid, camp: u.camp, skillName: '红血', note: `🩸 ${u.name} 红血：退无可退、转战士`, floatText: '🩸', floatUid: u.uid, grants: pendingGrants } });
                }
            }
            function tryRedBlood(subject, outLog) {
                // 行动结束帧判定（2026-10-13 改时机）：伤害已落地，直接看现血；打死（hp≤0/待死）不触发
                if (!subject || !subject.alive || subject.state._redBloodUsed) return;
                if (subject.hp <= 0 || subject.state._pendingDeath) return;
                if (subject.hp > subject.maxHp * redThreshold) return;
                pendingGrants = [];   // 本次红血事件的加成收集起点（两仪互换/单人红血各算一轮）
                const partner = partnerOf(subject);
                const partnerRed = partner ? (partner.hp <= partner.maxHp * redThreshold) : false;
                subject.state._redBloodUsed = true;
                subject.state._stunned = false;   // 触发当帧免疫控制（眩晕）
                const hpBefore = Math.floor(subject.hp);
                if (partner && !partnerRed) {
                    // ① 仅一方红血 → 两仪互换（职业 + 位置，各叠一套对方职业加成）
                    const myRole = subject.role, hisRole = partner.role;
                    const myPos = subject.pos, hisPos = partner.pos;   // 2026-10-12 连线换位特效：旧位置先存（swap 一走就没了）
                    partner.state._redBloodUsed = true;
                    swapUnitPositions(subject, partner, outLog);
                    switchRole(subject, hisRole, `两仪互换·${hisRole}`, outLog);
                    switchRole(partner, myRole, `两仪互换·${myRole}`, outLog);
                    if (outLog) outLog.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: { unitName: subject.name, unitUid: subject.uid, camp: subject.camp, skillName: '两仪互换', note: `☯ 两仪互换：${subject.name} ⇄ ${partner.name}（互换职业与位置）`, floatText: '☯', floatUid: subject.uid, swap: { aUid: subject.uid, bUid: partner.uid, posA: myPos, posB: hisPos }, grants: pendingGrants } });
                } else if (subject.uid === he.uid) {
                    // ② 两人同时红血 / ③ 无连接 → 何太冲走单人红血规则
                    soloRedBlood(he, outLog);
                }
                // 加血独立行（2026-10-13 随迁自 core/10）：maxHp 词条「升则等量加」的回血单独落行，
                //   紧跟互换/红血报幕——加血发生在攻击行之后，天然不会再有「造成 33 伤害，75→77」矛盾行
                const healed = Math.floor(subject.hp) - hpBefore;
                if (healed > 0 && outLog) {
                    outLog.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: { unitName: subject.name, unitUid: subject.uid, camp: subject.camp, skillName: '红血加血', note: `🩸 ${subject.name} 红血：生命 +${healed}（${hpBefore} → ${hpBefore + healed}）`, floatText: `+${healed}`, floatUid: subject.uid } });
                }
            }
            // ── 机制③ 红血触发（2026-10-13 改时机：ON_UNIT_ACTED 行动结束帧） ──
            // 旧挂 BEFORE_DAMAGE_APPLY 是「先换位后挨打」：swap 事实序排在本击攻击组之前，
            //   攻击组还按换位后坐标补刀（「换到后排还被追着打」）；现整段攻击（含双击/连锁）先打完，
            //   血落定红血再触发互换。何太冲先判（两人同时红血时单人规则归他），再判搭档。
            eventBus.on(SIGNAL_TYPES.ON_UNIT_ACTED, L.ON_UNIT_ACTED.HE_TAICHONG_RED_BLOOD, (data) => {
                const outLog = data.log || log;
                tryRedBlood(he, outLog);
                const p = partnerOf(he);
                if (p) tryRedBlood(p, outLog);
            });
        }
    };
}
