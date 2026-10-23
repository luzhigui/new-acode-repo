// 回归规则：乘风破浪击退换位 — 击退恰一行(+3)、有身后单位时双方换位、位置随后真实生效
// 复发信号：击退距离≠+3 / 换位描述缺失 / 击退后单位站位与战报宣告不一致（换位未生效或特效错位）
// 对应已报 Bug：乘风破浪击退换位特效不对
// V6.1.13（2026-10-19 第 103 轮）：排除蓄意轰拳·轰飞击退来源的 buff-push——寒离飒 V2 新技能的击退
//   设计就是「8 穿中列落 2 号位 + 途经 2/5 侧崩」，距离语义非 +3（与乘风共用 buff-push 通道），
//   +3 判据对其全不适用（seed=5 s2/s5/s7 三场误报：8→2）。Scope 收敛回「只管乘风击退」
//   （与 tests/124rule-recipes.js 既有 Scope 声明一致）；乘风/蝶翼/胖远桥来源的 push 判照旧。
// V6.1.12（2026-10-1x）：判据3 改「被下一次换位打断前，任一快照落到宣告位即算生效」——
//   旧口径只看击退后第一条快照，而 fxSnapshot 抓取存在一拍时滞（实测 seed=20 stage=4：
//   击退后紧邻的一条仍是旧位、再往后两条才落宣告位），把"位置其实生效了"误判未生效。
export const VER = 'tests/health-rules/138-wind-push.js V6.2.1';

// 静默位移识别（第 121 轮取证）：唐文亮冲刺 / 何太冲撤退 / 寒离飒位移都走 core/13 moveUnitPosition，
//   它**只发 ON_UNIT_STATE_CHANGE 信号、不产 buff-push/buff-swap 条目**（第 115 轮实证），
//   于是这类位移在战报里不留任何"位置改写"标记。旧逻辑只看得见位置变了、看不见是谁改的，
//   便把"击退已落地、之后又被别人挪走"误判为"击退没落地"（实证 seed=63 stage=4：唐文亮在
//   117 条被击退至 6 号位，125 条冲刺把自己 relocate 到 2 号位，126 条快照 @2 ⇒ 旧判据误报）。
// 口径收得很紧，只认真正会改写该期望单位站位的两种情形；数值与落地判据一字未放宽：
//   ① 位移条目宣告的落位号（「至 / 落在 / 压至 … N 号位」）与期望位相同 ⇒ 该位被第三方重写，无法归因；
//   ② 条目宣告两人互换位置却不报落位号、且文本含期望单位名（两仪互换，第 124 轮登记）。
// V6.2.1（2026-10-23 第 124 轮）：上面两条收口为 tests/122health-utils.js 的 isSilentRelocate
//   （138 / 166 此前各写一份，重复即埋雷；本轮在 166 侧实证上游新机制「两仪互换」同样走
//   swapUnitPositions、同样不发位移事件，白名单必须由唯一来源维护）。
import { isSilentRelocate } from '../122health-utils.js';

export const rule85 = {
    group: '技能效果回归',
    name: '乘风击退换位异常(回归)',
    test: function(ctx, log) {
        var pushes = [];
        for (var i = 0; i < log.length; i++) {
            var e = log[i];
            if (e && e.type === 'buff-push') pushes.push({ idx: i, entry: e });
        }
        if (pushes.length === 0) return 'skip';
        // 2026-10-19 第 103 轮：蓄意轰拳·轰飞击退不走 +3 口径，须排除——
        //   设计（modules/27 hanlisa 文件头 V2）：「瞄 8 特例：8 吃 N/2 且被轰穿中列落 2 号位撞边眩晕，
        //   途经 2/5 被崩向两侧（一左一右）」。它与乘风击退共用 buff-push 渲染通道，但距离语义不同
        //   （8→2 穿列、2/5 侧崩），本规则的 +3 判据对其全不适用（seed=5 s2/s5/s7 三场实锤误报）。
        //   本规则只管乘风击退（Scope 见 tests/124rule-recipes.js「138 只管乘风击退」），蓄意轰拳来源
        //   不判；其专属回归规则尚未建立，建立后由那规则盯（届时本排除可收窄为该规则的补充说明）。
        var windPushes = pushes.filter(function (p) {
            var t = p.entry && p.entry.text;
            return !(typeof t === 'string' && t.indexOf('蓄意轰拳') !== -1);
        });
        if (windPushes.length === 0) return 'skip';
        var problems = [];
        for (var p = 0; p < windPushes.length; p++) {
            var pu = windPushes[p].entry;
            var oldPos = pu.oldPos, newPos = pu.newPos;
            // 1. 击退距离：应恰为一行（pos+3）
            if (oldPos != null && newPos != null && newPos !== oldPos + 3) {
                problems.push('击退距离异常：' + oldPos + '→' + newPos + '号位（应+3）');
                continue;
            }
            // 2. 换位描述：有身后单位时应含双方移位描述
            if (pu.behindUid != null && pu.text && pu.text.indexOf('移至') === -1) {
                problems.push('击退换位缺身后单位移位描述');
            }
            // 3. 位置一致性：击退后该单位下次参与攻击时站位应为宣告位置（中途再换位则跳过）
            //    V6.1.12 修正：此前只看「击退后的第一条」攻击快照，而 fxSnapshot 是攻击动作开
            //    始时抓的，换位写入存在一拍时滞（实测 seed=20 stage=4：击退后紧邻的一条快照仍
            //    是旧位，再往后两条才落到宣告位），于是"位置其实生效了"却被判未生效 → 误报。
            //    改为：在被下一次换位打断之前，只要任一快照出现宣告位置即视为生效；只有存在
            //    后续快照却全部不等于宣告位置，才是真的"击退没落地"。
            //    静默位移名解析（第 121 轮）：唐文亮冲刺会把**他自己** relocate 到前排，文案只报
            //    被拽者（「拽 X 至 N 号位」），不报他自己 ⇒ 判据要靠名字认出"这条位移改写了谁"。
            var pt = typeof pu.text === 'string' ? pu.text : '';
            var pnM = pt.match(/击退！(\S+?)从\d+号位被击退至\d+号位/);
            var bnM = pt.match(/(\S+?)被迫从\d+号位移至\d+号位/);
            var expect = [{ uid: pu.pushTargetUid, pos: newPos, tag: '被击退者', name: pnM ? pnM[1] : null }];
            if (pu.behindUid != null) expect.push({ uid: pu.behindUid, pos: oldPos, tag: '被迫换位者', name: bnM ? bnM[1] : null });
            for (var q = 0; q < expect.length; q++) {
                var exp = expect[q];
                var seen = 0, hit = false;
                for (var r = windPushes[p].idx + 1; r < log.length; r++) {
                    var a = log[r];
                    if (!a || a.type !== 'attack-group' || !a._fxSnapshot) continue;
                    var actual = null;
                    if (a.uidA === exp.uid) actual = a._fxSnapshot.attackerPos;
                    else if (a.uidD === exp.uid) actual = a._fxSnapshot.defenderPos;
                    if (actual == null) continue;
                    var interrupted = false;
                    for (var s = windPushes[p].idx + 1; s < r; s++) {
                        var mid = log[s];
                            if (mid && (mid.type === 'buff-push' || mid.type === 'buff-swap')) {
                                if (mid.pushTargetUid === exp.uid || mid.behindUid === exp.uid ||
                                    mid.uidA === exp.uid || mid.uidB === exp.uid) { interrupted = true; break; }
                            }
                            // 第 121 轮补：静默位移（冲刺/撤退/寒离飒位移）也要算打断，否则误报
                            if (isSilentRelocate(mid, exp)) { interrupted = true; break; }
                    }
                    if (interrupted) break;
                    seen++;
                    if (actual === exp.pos) { hit = true; break; } // 落到宣告位置即算生效
                }
                if (seen > 0 && !hit) {
                    problems.push(exp.tag + '击退后位置未生效：预期' + exp.pos + '号位（' + seen + '次出场均未落到该位）');
                }
            }
        }
        if (problems.length > 0) return { fail: true, msg: '复发：乘风击退换位异常 — ' + problems.slice(0, 3).join(' | ') };
        return { fail: false };
    }
};
