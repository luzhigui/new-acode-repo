// 回归规则：唐文亮「冲刺·七伤齐发」落地验证 — 满 7 次出手冲到目标同列前排位、把后排目标拽到该位
// 机制源（modules/26elite-sixsects-tangwenliang.js doDash，AFTER_SELECT_TARGET:12）：
//   · 触发：出手计数 `_qiShangCount` 每满 content 唐文亮.chongCi.cycle（7）次、且本次有目标；
//   · 落点 frontPos = ((target.pos - 1) % 3) + 1（目标同列的前排位 1/2/3）；
//   · relocate(tw, frontPos) —— 唐文亮冲往该位（落点被本队队友占着则先与该队友换位）；
//   · if (target.pos > 3) relocate(target, frontPos) —— **仅 456/789 的后排目标**被拽到该位
//     （前排/中排目标不拽；两队各有独立 1-9 棋盘，唐文亮与目标同号不同盘、不叠格）；
//   · 报幕（pushSkillAnnounce，line 未置 false ⇒ 落战报）：「⚡ 唐文亮冲刺·七伤齐发：拽 X 至 N 号位，
//     双方各受当前生命 45% 真伤（目标 -a / 自身 -b），转近战战士」。
// 复发信号：
//   1) 宣告位算错：N ≠ 目标同列前排位（frontPos 公式写反/取错目标站位）；
//   2) 唐文亮冲位未落地：后续出场快照从未落到宣告位（被后续位移打断则放弃判定）；
//   3) 后排目标拽位未落地：目标冲刺前在 456/789，后续快照从未落到宣告位。
// 数值侧（双方 45% 真伤、转战士加成 atk/def/maxHp）由 stat-decl 的 TW_DASH 契约盯（addMod 与
//   TW_DASH_APPLY fact 同 handler 同值），本规则只管位置/宣告自洽，不做数值复核。
// V1.0.0 | 2026-10-21 第 114 轮新建：唐文亮 10 月内三次大改（锁位洗牌/冲刺重做/回春层数），
//   位置落地此前无任何规则盯——第 111 轮 166 惑心规则还因"冲刺改站位不发位移事件"假红过，
//   当时只加了白名单兜底，本次补专属规则。样本说明：冲刺需唐文亮出手满 7 次，敌方随机出阵
//   （弱精英混入）⇒ 单场稀有，未抽到即 skip（与宋青书链路类规则同型的条件稀有，非恒空转——
//   实测 140 场回放有命中，见 124rule-recipes 备注）。
export const VER = 'tests/health-rules/171-tangwenliang-dash.js V1.0.0';
import { entryTextsDeep } from '../122health-utils.js';

export const rule171 = {
    group: '技能效果回归',
    name: '唐文亮冲刺落地(回归)',
    test: function(ctx, log, beforeA, beforeE) {
        var n = log ? log.length : 0;
        if (n === 0) return 'skip';

        // 1. 收集冲刺报幕（文本通道；报幕条目只带 text，uid 一律按名/快照解析）
        var dashes = [];
        for (var i = 0; i < n; i++) {
            var e = log[i];
            if (!e) continue;
            var texts = entryTextsDeep(e);
            for (var t = 0; t < texts.length; t++) {
                var m = texts[t].match(/唐文亮冲刺·七伤齐发：拽 (.+?) 至 (\d) 号位/);
                if (m) { dashes.push({ idx: i, targetName: m[1], declarePos: parseInt(m[2], 10) }); break; }
            }
        }
        if (dashes.length === 0) return 'skip';   // 本场唐文亮没冲刺（未出阵/未满 7 次出手）

        // 唐文亮 uid：开局快照按名取（六大派弱精英，每局至多一名）
        var tangUid = null;
        var snapE = (ctx && ctx.snapshot && Array.isArray(ctx.snapshot.enemy)) ? ctx.snapshot.enemy : (beforeE || []);
        for (var s = 0; s < snapE.length; s++) {
            if (snapE[s] && snapE[s].name === '唐文亮') { tangUid = snapE[s].uid; break; }
        }
        if (tangUid == null) return 'skip';   // 快照定位不到（理论上此时已有冲刺，不应发生）；宁漏勿误

        // 某单位在 idx 之前的**当前**站位：从 idx-1 往回走，第一个涉及他的条目即给出站位——
        //   攻击组快照（attackerPos/defenderPos）或位移事件（buff-push 的 newPos/oldPos、
        //   buff-swap 的对调位）。为什么必须认位移事件：换位/击退不产生攻击组快照，只认快照会拿到
        //   被换走前的旧位（seed=18 r16 实锤：韦一笑先被惑心换位 2→6，旧快照仍是 2，
        //   导致误判「宣告位算错」——其实宣告位 3 是对的）。往回走第一个命中即最近一次定位，
        //   它到 idx 之间没有任何条目涉及他 ⇒ 站位未变。
        var posBefore = function (uid, idx) {
            for (var r = idx - 1; r >= 0; r--) {
                var a = log[r];
                if (!a) continue;
                if (a.type === 'buff-push') {
                    if (a.pushTargetUid === uid && a.newPos != null) return a.newPos;
                    if (a.behindUid === uid && a.oldPos != null) return a.oldPos;
                } else if (a.type === 'buff-swap') {
                    if (a.uidA === uid && a.oldPosB != null) return a.oldPosB;
                    if (a.uidB === uid && a.oldPosA != null) return a.oldPosA;
                } else if (a.type === 'attack-group' && a._fxSnapshot) {
                    if (a.uidA === uid) return a._fxSnapshot.attackerPos;
                    if (a.uidD === uid) return a._fxSnapshot.defenderPos;
                }
            }
            return null;
        };
        // 宣告位落地验证（复用 138 V6.1.12 口径：被后续 buff-push/buff-swap 打断则放弃；
        //   一拍时滞内任一快照落到宣告位即算生效；无后续快照不报）
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

        // 报幕条目所在回合（供报错定位）
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
            var tag = '第' + roundAt(da.idx) + '回合冲刺(目标=' + da.targetName + ')';
            // 宣告位合法性：1~9
            if (!(da.declarePos >= 1 && da.declarePos <= 9)) {
                problems.push(tag + ' 宣告位越界：' + da.declarePos);
                continue;
            }
            // 目标冲刺前站位（报幕之前的最后一次出场快照）
            var tgtUid = null, tgtPre = null;
            // 冲刺攻击组 = 报幕后第一条涉及唐文亮的攻击组（报幕在 AFTER_SELECT_TARGET 推、攻击组在其后）。
            //   ⚠ 闪避组 uid 对调（render/34 renderDodgeFact：uidA=闪避者、uidD=攻击者，同 134 规则注释），
            //   故 uidD===唐文亮 且 isDodge 时目标取 uidA——首版漏了这个，seed=18 r16 冲刺被闪避，
            //   规则抓到后面某次攻击组 ⇒ 张冠李戴算出错的目标站位（假红）。
            for (var r2 = da.idx + 1; r2 < n; r2++) {
                var ag = log[r2];
                if (!ag || ag.type !== 'attack-group') continue;
                if (ag.uidA === tangUid && ag.uidD != null) { tgtUid = ag.uidD; break; }
                if (ag.isDodge && ag.uidD === tangUid && ag.uidA != null) { tgtUid = ag.uidA; break; }
            }
            if (tgtUid != null) tgtPre = posBefore(tgtUid, da.idx);
            // 判据 1：宣告位 = 目标同列前排位（frontPos 公式对账）
            if (tgtPre != null) {
                var frontPos = ((tgtPre - 1) % 3) + 1;
                if (da.declarePos !== frontPos) {
                    problems.push(tag + ' 宣告位算错：宣告 ' + da.declarePos + ' 号位，但目标冲刺前在 ' + tgtPre
                        + ' 号位、同列前排位应为 ' + frontPos);
                }
            }
            // 判据 2：唐文亮冲位落地
            var p1 = checkLanding(tangUid, da.idx, da.declarePos, '唐文亮冲位');
            if (p1) problems.push(tag + ' ' + p1);
            // 判据 3：后排目标（冲刺前 456/789）应被拽到宣告位；前排/中排目标不拽，不判
            if (tgtUid != null && tgtPre != null && tgtPre > 3) {
                var p2 = checkLanding(tgtUid, da.idx, da.declarePos, '目标拽位');
                if (p2) problems.push(tag + ' ' + p2);
            }
        }
        if (problems.length > 0) return { fail: true, msg: '复发：唐文亮冲刺落地异常 — ' + problems.slice(0, 3).join(' | ') };
        return { fail: false };
    }
};
