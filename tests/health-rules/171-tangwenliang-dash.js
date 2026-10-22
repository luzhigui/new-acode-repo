// 回归规则：唐文亮「冲刺·七伤齐发」落地验证 — 满 7 次出手冲到目标同列前排位、把后排目标拽到该位
// 机制源（modules/26elite-sixsects-tangwenliang.js doDash，AFTER_SELECT_TARGET:12；V7.0.3 起被命中
//   也推进七伤计数、满 7 对攻击者冲刺并补一刀）：
//   · 触发：出手计数 `_qiShangCount` 每满 content 唐文亮.chongCi.cycle（7）次、且本次有目标；
//   · 落点 frontPos = ((target.pos - 1) % 3) + 1（目标同列的前排位 1/2/3）；
//   · relocate(tw, frontPos) —— 唐文亮冲往该位（落点被本队队友占着则先与该队友换位）；
//   · if (target.pos > 3) relocate(target, frontPos) —— 仅 456/789 的后排目标被拽到该位；
//   · 2026-10-22 照实报幕（体检第 114 轮转交落地）：拽成功写「拽 X 至 N 号位」，目标免疫写
//     「X 免疫位移、纹丝不动」（swapUnitPositions/moveUnitPosition 现返回布尔）。
// 复发信号（V1.1.0 起只保留可观测的落位判据）：
//   1) 唐文亮冲位未落地：拽位成功后，他后续出场快照从未落到 frontPos；
//   2) 目标拽位未落地（仅「拽至 N」模式）：目标后续出场快照从未落到 N。
// ★ V1.1.0 口径变更（2026-10-22 第 115 轮）：**废弃「宣告位算错」判据**——moveUnitPosition
//   （core/13）只发 ON_UNIT_STATE_CHANGE 信号、**不产生任何战报条目**，冲刺拽位/何太冲撤退/寒离飒
//   位移都走它 ⇒ 「目标冲刺前站位」根本不可可靠观测（只认攻击组快照+位移事件会拿到被隐形位移
//   挪动前的旧位，seed=16 stage=7 实证假红）。落位判据不受影响：宣告位 N 由引擎按真实站位算出，
//   后续快照核对 N 即可证「落地」。
// 免疫模式（「纹丝不动」）不判位置：N 不在文案里、目标原站位又不可观测（宁漏勿误）；
//   该模式的「照实报幕」本身即第 114 轮转交的落地成果。
// 数值侧（双方 45% 真伤、转战士加成 atk/def/maxHp）由 stat-decl TW_DASH 契约盯，本规则只管位置落地。
// 样本说明：冲刺需唐文亮出手满 7 次，敌方随机出阵（弱精英混入）⇒ 单场稀有，未抽到即 skip。
export const VER = 'tests/health-rules/171-tangwenliang-dash.js V1.1.3';
import { entryTextsDeep } from '../122health-utils.js';

export const rule171 = {
    group: '技能效果回归',
    name: '唐文亮冲刺落地(回归)',
    test: function(ctx, log, beforeA, beforeE) {
        var n = log ? log.length : 0;
        if (n === 0) return 'skip';

        // 1. 收集冲刺报幕。两种形态（照实报幕）：
        //    「⚡ 唐文亮冲刺·七伤齐发：拽 X 至 N 号位，双方各受…」      —— 拽位成功
        //    「⚡ 唐文亮冲刺·七伤齐发：X 免疫位移、纹丝不动，双方各受…」 —— 目标免疫、没拽动
        var dashes = [];
        for (var i = 0; i < n; i++) {
            var e = log[i];
            if (!e) continue;
            var texts = entryTextsDeep(e);
            for (var t = 0; t < texts.length; t++) {
                var mDrag = texts[t].match(/唐文亮冲刺·七伤齐发：拽 (.+?) 至 (\d) 号位/);
                var mImm = texts[t].match(/唐文亮冲刺·七伤齐发：(.+?) 免疫位移、纹丝不动/);
                if (mDrag) { dashes.push({ idx: i, targetName: mDrag[1], declarePos: parseInt(mDrag[2], 10), immune: false }); break; }
                if (mImm) { dashes.push({ idx: i, targetName: mImm[1], declarePos: null, immune: true }); break; }
            }
        }
        if (dashes.length === 0) return 'skip';   // 本场唐文亮没冲刺（未出阵/未满 7 次出手）

        // 唐文亮 uid：开局快照按名取（六大派弱精英，每局至多一名）
        var tangUid = null;
        var snapE = (ctx && ctx.snapshot && Array.isArray(ctx.snapshot.enemy)) ? ctx.snapshot.enemy : (beforeE || []);
        for (var s = 0; s < snapE.length; s++) {
            if (snapE[s] && snapE[s].name === '唐文亮') { tangUid = snapE[s].uid; break; }
        }
        if (tangUid == null) return 'skip';   // 快照定位不到（此时已有冲刺，不应发生）；宁漏勿误

        // 目标 uid 取「报幕后**紧邻**的涉及唐文亮的攻击组」的对手方（V1.1.3）——AFTER_SELECT 路径下
        //   冲刺后当次普攻紧接着报幕，该组即冲刺那一刀，uidD/uidA 是引擎真实目标且**多实例安全**
        //   （seed=17 s2 实证：众志成城召唤出第二个张无忌，报幕只写名字、按名解析会认错初始实例）。
        //   ⚠ 必须加紧邻约束：V7.0.3 起「被命中也冲刺」的反手路径把补一刀延迟结算（可能跨回合），
        //   报幕后第一条唐文亮攻击组可能是他之后的普通攻击（seed=16 s7 实证：抓到 u332 而非真实
        //   目标 u4）⇒ 非紧邻（隔了 round-start/round-end 或超过 2 条）一律不认，该条不判目标落位
        //   （唐文亮自身落位照判——他的冲位在任何后续快照都能验证）。
        //   闪避组 uid 对调（render/34：uidA=闪避者、uidD=攻击者）⇒ isDodge 且 uidD===唐文亮 时取 uidA。
        var dashGroupTarget = function (idx) {
            for (var r = idx + 1; r <= Math.min(n - 1, idx + 2); r++) {
                var ag = log[r];
                if (!ag) continue;
                if (ag.type === 'round-start' || ag.type === 'round-end') return null;   // 跨回合：反手路径，不认
                if (ag.type !== 'attack-group') continue;
                if (ag.uidA === tangUid && ag.uidD != null) return ag.uidD;
                if (ag.isDodge && ag.uidD === tangUid && ag.uidA != null) return ag.uidA;
            }
            return null;
        };
        var uidByName = function (nm) {
            if (!nm) return null;
            var pools = [snapE, (ctx && ctx.snapshot && Array.isArray(ctx.snapshot.ally)) ? ctx.snapshot.ally : (beforeA || [])];
            var found = null, cnt = 0;
            for (var p = 0; p < pools.length; p++) {
                for (var k = 0; k < (pools[p] || []).length; k++) {
                    if (pools[p][k] && pools[p][k].name === nm) { found = pools[p][k].uid; cnt++; }
                }
            }
            return cnt === 1 ? found : null;
        };
        // 落位验证（复用 138 V6.1.12 口径：被后续 buff-push/buff-swap 打断则放弃；一拍时滞内任一
        //   快照落到宣告位即算生效；无后续快照不报）
        var checkLanding = function (uid, idx, expectPos, tag) {
            var seen = 0, hit = false;
            for (var r = idx + 1; r < n; r++) {
                var a = log[r];
                if (!a || a.type !== 'attack-group' || !a._fxSnapshot) continue;
                var actual = null;
                if (a.uidA === uid) actual = a._fxSnapshot.attackerPos;
                else if (a.uidD === uid) actual = a._fxSnapshot.defenderPos;
                if (actual == null) continue;
                var interrupted = false;
                for (var s2 = idx + 1; s2 < r; s2++) {
                    var mid = log[s2];
                    if (mid && (mid.type === 'buff-push' || mid.type === 'buff-swap')) {
                        if (mid.pushTargetUid === uid || mid.behindUid === uid ||
                            mid.uidA === uid || mid.uidB === uid) { interrupted = true; break; }
                    }
                }
                if (interrupted) break;
                seen++;
                if (actual === expectPos) { hit = true; break; }
            }
            if (seen > 0 && !hit) return tag + '未落到宣告位 ' + expectPos + ' 号位（' + seen + ' 次出场均未落到）';
            return null;
        };
        var roundAt = function (idx) {
            for (var q = idx; q >= 0; q--) {
                var e2 = log[q];
                if (e2 && e2.type === 'round-start') {
                    var mm = (e2.text || '').match(/第(\d+)回合/);
                    if (mm) return parseInt(mm[1], 10);
                }
            }
            return 0;
        };

        var problems = [];
        for (var d = 0; d < dashes.length; d++) {
            var da = dashes[d];
            var tag = '第' + roundAt(da.idx) + '回合冲刺(目标=' + da.targetName + (da.immune ? '·免疫未拽' : '') + ')';
            if (da.immune) continue;   // 免疫模式：N 不在文案里、原站位不可观测 ⇒ 不判位置（照实报幕即转交成果）
            if (!(da.declarePos >= 1 && da.declarePos <= 9)) {
                problems.push(tag + ' 宣告位越界：' + da.declarePos);
                continue;
            }
            // 判据 1：唐文亮冲位落地
            var p1 = checkLanding(tangUid, da.idx, da.declarePos, '唐文亮冲位');
            if (p1) problems.push(tag + ' ' + p1);
            // 判据 2：目标拽位落地（仅「拽至 N」模式）
            var tgtUid = dashGroupTarget(da.idx);   // 反手路径取不到 ⇒ 不判目标落位（宁漏勿误）
            if (tgtUid != null) {
                var p2 = checkLanding(tgtUid, da.idx, da.declarePos, '目标拽位');
                if (p2) problems.push(tag + ' ' + p2);
            }
        }
        if (problems.length > 0) return { fail: true, msg: '复发：唐文亮冲刺落地异常 — ' + problems.slice(0, 3).join(' | ') };
        return { fail: false };
    }
};
