// 回归规则：唐文亮「冲刺·七伤齐发」落地验证 — 强推挤压制（2026-10-23 重设计）
// 机制源（modules/26elite-sixsects-tangwenliang.js doDash / forceInsert）：
//   满 7 次出手冲到「目标同列」己方前排位 frontPos=((target.pos-1)%3)+1，
//   沿 PUSH_PATH（本列自上而下、满了邻列顺延）把挡路单位整列前推到空位——
//   forceInsert 只读算路返回 moved=[{unit,from,to}...]（dasher 带 isDash），applyMoves 逐个 moveUnitPosition 落地。
//   两侧独立：目标侧(allyRes，仅后排目标) + 冲方侧(enemyRes，唐文亮+被挤敌人) 各自算路各自落地。
//   免疫语义：forceInsert 遇 _ctrlImmune/飞天单位即 blocked ⇒ 该侧 ok=false 不落地。
// 报幕（照实报幕，pushSkillAnnounce '冲刺·七伤齐发'）：
//   「⚡ 唐文亮冲刺·七伤齐发：{enemyText}；{allyText}。双方各受…」
//   enemyText/allyText = 该侧 moved 逐条「name from→to」（无移动则「唐文亮原地未动」/「目标已在前排」；
//   被挡则「唐文亮无法落位（…）」/「目标侧被 X 免疫挡下、整侧不动」/「无空位」）。
//   ⇒ 每个「name from→to」就是一次宣告移动，落位可直接对账（比旧对调制更易验）。
// 为什么值得盯：
//   1) 强推挤压直接改写多方站位，而站位决定行动序/carry/圣火令列——一次错推静默改变整局节奏；
//   2) 落地走 moveUnitPosition（core/13 只发 ON_UNIT_STATE_CHANGE、不发位移事件）⇒ 只能靠
//      「宣告位置 vs 后续真实出场快照」对账（与 138 乘风击退同款病灶）。
// 复发信号（每个宣告移动逐一验）：
//   · 宣告位越界：解析出的 to 不在 1~9；
//   · 落位未生效：该单位宣告 to 后，被下一次「唐文亮冲刺」或 buff-push/swap 打断前，
//     后续出场快照从未落到 to（一拍时滞内任一快照命中即算生效；无后续快照不报）。
// 误报规避：
//   · 本场无「唐文亮冲刺·七伤齐发：」报幕 ⇒ skip（唐文亮未出阵/未满 7 次出手）；
//   · 被挡/免疫/原地未动不产生 from→to ⇒ 不判位置（照实报幕即设计成果，宁漏勿误）；
//   · 同名多实例（众志成城补员）按名解析 uid 失败 ⇒ 跳过该单位（唐文亮自身用开局快照 uid，不受影响）；
//   · 唐文亮强推挤压改站位不发位移事件 ⇒ checkLanding 中断判定须叠加 isOtherRelocate 白名单
//     （后续任一「唐文亮冲刺·七伤齐发」报幕提到该单位名 = 位置被合法改写），
//     否则把「之后又被挤走」误判成「这次没落地」（rule113 判据5 V6.1.3 已踩过同款）。
export const VER = 'tests/health-rules/171-tangwenliang-dash.js V2.0.1';
// V2.0.1（2026-10-30 第 144 轮续）：checkLanding 的「被打断」判定补齐通用静默位移白名单
//   isSilentRelocate（122health-utils.js）。此前只认 唐文亮冲刺报幕(isOtherRelocate) 与
//   buff-push/buff-swap，漏认「其它不发位移事件却改写站位」的机制（两仪互换/红血撤退/蓄意轰拳/
//   标枪前压/压进）。实证：宋青书被冲刺·七伤齐发推到 6 号位后，被此类机制合法挤走，规则却因认不出
//   中断而误报「未落到 6 号位」。现与 166 判据5 同口径——命中 isSilentRelocate 即视为合法改写、放弃
//   该次落位对账（宁漏勿误）。机制本体未改，属测试侧覆盖缺口，非主代码缺陷。
import { entryTextsDeep, isSilentRelocate } from '../122health-utils.js';

// 位置改写白名单：唐文亮强推挤压改站位不发位移事件（moveUnitPosition），
//   后续任一冲刺报幕提到该单位名 ⇒ 视为位置被合法改写，放弃其落位对账（宁漏勿误）。
function isOtherRelocate(mid, name) {
    if (!mid || !name) return false;
    var texts = entryTextsDeep(mid);
    for (var i = 0; i < texts.length; i++) {
        var tk = String(texts[i]);
        if (tk.indexOf('唐文亮冲刺·七伤齐发') !== -1 && tk.indexOf(name) !== -1) return true;
    }
    return false;
}

export const rule171 = {
    group: '技能效果回归',
    name: '唐文亮冲刺落地(回归)',
    test: function(ctx, log, beforeA, beforeE) {
        var n = log ? log.length : 0;
        if (n === 0) return 'skip';

        // 1. 收集冲刺报幕 + 解析所有宣告移动「name from→to」
        //    只取「唐文亮冲刺·七伤齐发：」起到「。」前的主体，避开真伤数值里的数字被误当位置。
        var dashes = [];
        for (var i = 0; i < n; i++) {
            var e = log[i];
            if (!e) continue;
            var texts = entryTextsDeep(e);
            for (var t = 0; t < texts.length; t++) {
                var tk = String(texts[t]);
                var di = tk.indexOf('唐文亮冲刺·七伤齐发：');
                if (di === -1) continue;
                var body = tk.slice(di);
                var cut = body.indexOf('。');
                if (cut !== -1) body = body.slice(0, cut);
                var moves = [];
                var mre = /([^\s、；。，：]+?) (\d)→(\d)/g;
                var mm;
                while ((mm = mre.exec(body)) !== null) {
                    moves.push({ name: mm[1], from: parseInt(mm[2], 10), to: parseInt(mm[3], 10) });
                }
                dashes.push({ idx: i, moves: moves });
                break;   // 一条报幕只落一个 text，命中即收
            }
        }
        if (dashes.length === 0) return 'skip';   // 本场唐文亮没冲刺（未出阵/未满 7 次出手）

        // 2. 唐文亮 uid：开局快照按名取（六大派弱精英，每局至多一名）
        var tangUid = null;
        var snapE = (ctx && ctx.snapshot && Array.isArray(ctx.snapshot.enemy)) ? ctx.snapshot.enemy : (beforeE || []);
        for (var s = 0; s < snapE.length; s++) {
            if (snapE[s] && snapE[s].name === '唐文亮') { tangUid = snapE[s].uid; break; }
        }
        if (tangUid == null) return 'skip';   // 快照定位不到（此时已有冲刺，不应发生）；宁漏勿误

        // 3. 同名单位 uid 解析（众志成城补员召同名克隆 ⇒ 不唯一即放弃，宁漏勿误）
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

        var roundAt = function (idx) {
            for (var q = idx; q >= 0; q--) {
                var e2 = log[q];
                if (e2 && e2.type === 'round-start') {
                    var mm2 = (e2.text || '').match(/第(\d+)回合/);
                    if (mm2) return parseInt(mm2[1], 10);
                }
            }
            return 0;
        };

        // 4. 落位验证：宣告位 vs 后续真实出场快照；被 buff-push/swap 或后续唐文亮冲刺
        //    (isOtherRelocate) 打断则放弃；一拍时滞内任一快照命中即算生效；无后续快照不报。
        var checkLanding = function (uid, name, idx, expectPos, tag) {
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
                    // 通用静默位移白名单（V2.0.1 补）：命中即该单位被其它「改站位却不发位移事件」机制
                    //   合法改写，放弃本次落位对账（宁漏勿误），否则把「之后又被挤走」误判成「这次没落地」。
                    if (isSilentRelocate(mid, { name: name, pos: expectPos })) { interrupted = true; break; }
                    if (isOtherRelocate(mid, name)) { interrupted = true; break; }
                }
                if (interrupted) break;
                seen++;
                if (actual === expectPos) { hit = true; break; }
            }
            if (seen > 0 && !hit) return tag + '未落到宣告位 ' + expectPos + ' 号位（' + seen + ' 次出场均未落到）';
            return null;
        };

        // 5. 逐条报幕、逐个宣告移动验落地
        var problems = [];
        for (var d = 0; d < dashes.length; d++) {
            var da = dashes[d];
            var tag = '第' + roundAt(da.idx) + '回合冲刺';
            if (da.moves.length === 0) continue;   // 全被挡/免疫/原地未动：无宣告移动，不判位置（照实报幕）
            for (var mv = 0; mv < da.moves.length; mv++) {
                var mo = da.moves[mv];
                if (!(mo.to >= 1 && mo.to <= 9)) {
                    problems.push(tag + ' ' + mo.name + ' 宣告位越界：' + mo.to);
                    continue;
                }
                var uid = (mo.name === '唐文亮') ? tangUid : uidByName(mo.name);
                if (uid == null) continue;   // 同名多实例/定位不到 ⇒ 宁漏勿误
                var p = checkLanding(uid, mo.name, da.idx, mo.to, mo.name + '落位');
                if (p) problems.push(tag + ' ' + p);
            }
        }
        if (problems.length > 0) return { fail: true, msg: '复发：唐文亮冲刺落地异常 — ' + problems.slice(0, 3).join(' | ') };
        return { fail: false };
    }
};
