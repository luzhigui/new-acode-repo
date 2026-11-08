// 回归规则：乘风破浪击退换位 — 击退恰一行(+3)、有身后单位时双方换位、位置随后真实生效
// 复发信号：击退距离≠+3 / 换位描述缺失 / 击退后单位站位与战报宣告不一致（换位未生效或特效错位）
// 对应已报 Bug：乘风破浪击退换位特效不对
export const VER = 'tests/health-rules/138-wind-push.js V6.2.4';
// V6.2.4（2026-11-07 第 185 轮）：修「击退落地后又被惑心换走」一类误报 —— 只改打断识别，判据与阈值未动。
//   病由：判据 3 的"中途被打断"分支读 `mid.uidA === uid || mid.uidB === uid`，而渲染后的 buff-swap
//   条目只有 { type, swaps, buffType, text }，不含 uidA/uidB ⇒ 对惑心换位恒 false。乘风把张无忌击退到
//   8 号位后，紧随的惑心又把他换到 5 号位（实测 seed=6 stage=1：L229 PUSH 张无忌 8→5，L241/L242 惑心
//   再把 5→8→5 来回换），此后 6 次快照都不在 8 号位 ⇒ 误报「击退后位置未生效」。
//   修法：补 swapMovedUids(mid) 这条等价判定（读 swaps 数组），与既有 pushTargetUid/behindUid 同权。
//   ★ 上游 0800f201「惑心保证有效」删掉「洗完回原位」空结果路径后，换位条目必写，此类误报由偶发转高频。
//   覆盖不减：真正的"击退没落地"仍是「有后续快照且全部不在宣告位、且中间无任何第三方改写」。
// V6.2.3（2026-11-07 第 184 轮）：拆聚合型分支（只改「怎么报」，不改判定口径与阈值）。
//   病由：三类子病因（击退距离异常 / 缺身后单位移位描述 / 击退后位置未生效）全 push 进 problems，
//   末尾 slice(0,3).join(' | ') 合成一条 msg ⇒ 分支级只见一个聚合外壳指纹，丢其中任一类都看不出来。
//   今三类各存一格、按次序命中首因返回；同一场同时命中多类时只报最靠前的一类（与运行期表现一致）。

// 静默位移识别（第 121 轮取证）：唐文亮冲刺 / 何太冲撤退 / 寒离飒位移都走 core/13 moveUnitPosition，
//   它**只发 ON_UNIT_STATE_CHANGE 信号、不产 buff-push/buff-swap 条目**（第 115 轮实证），
//   于是这类位移在战报里不留任何"位置改写"标记。旧逻辑只看得见位置变了、看不见是谁改的，
//   便把"击退已落地、之后又被别人挪走"误判为"击退没落地"（实证 seed=63 stage=4：唐文亮在
//   117 条被击退至 6 号位，125 条冲刺把自己 relocate 到 2 号位，126 条快照 @2 ⇒ 旧判据误报）。
// 口径收得很紧，只认真正会改写该期望单位站位的两种情形；数值与落地判据一字未放宽：
//   ① 位移条目宣告的落位号（「至 / 落在 / 压至 … N 号位」）与期望位相同 ⇒ 该位被第三方重写，无法归因；
//   ② 条目宣告两人互换位置却不报落位号、且文本含期望单位名（两仪互换，第 124 轮登记）。
// V6.2.2（2026-10-24 第 125 轮）：共享判据升 V6.3.0（补③④两条证据判据，本规则自动受益）——
//   ③ 箭头落位：唐文亮冲刺报幕写「唐文亮 5→2」不带「号位」二字，V6.2.0 的通用落位号判据认不出；
//   ④ 载荷落位：蓄意轰拳全程无报幕文本，只发带落位号的 fact，文本类判据一律够不着。
//   两条都是按证据判定（名字/uid 锚定 + 落位号比对），比关键词名单通用；判据1（+3 距离）是
//   独立硬判据、不受本次改动影响——变异牙 T11 复跑仍报 fail=36，证明本规则没被放软。
// V6.2.1（2026-10-23 第 124 轮）：上面两条收口为 tests/122health-utils.js 的 isSilentRelocate
//   （138 / 166 此前各写一份，重复即埋雷；本轮在 166 侧实证上游新机制「两仪互换」同样走
//   swapUnitPositions、同样不发位移事件，白名单必须由唯一来源维护）。
import { isSilentRelocate, swapMovedUids } from '../122health-utils.js';

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
        // ★ 第 184 轮（拆聚合型分支）：子病因各存一格、各自独立上报（命中首因即返回），
        //   不再 slice(0,3).join(' | ') 合并成一条聚合外壳。判定口径与阈值一字未改。
        var pDist = null, pDesc = null, pLand = null;
        for (var p = 0; p < windPushes.length; p++) {
            var pu = windPushes[p].entry;
            var oldPos = pu.oldPos, newPos = pu.newPos;
            // 1. 击退距离：应恰为一行（pos+3）
            if (oldPos != null && newPos != null && newPos !== oldPos + 3) {
                if (!pDist) pDist = '击退距离异常：' + oldPos + '→' + newPos + '号位（应+3）';
                continue;
            }
            // 2. 换位描述：有身后单位时应含双方移位描述
            if (pu.behindUid != null && pu.text && pu.text.indexOf('移至') === -1) {
                if (!pDesc) pDesc = '击退换位缺身后单位移位描述';
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
                                // 第 185 轮：buff-swap 条目不带 uidA/uidB（render/409 只给 swaps 数组），
                                //   上一行对惑心换位恒 false ⇒ 「击退落地后又被惑心换走」认不出，误判未落地。
                                if (swapMovedUids(mid).indexOf(exp.uid) !== -1) { interrupted = true; break; }
                            }
                            // 第 121 轮补：静默位移（冲刺/撤退/寒离飒位移）也要算打断，否则误报
                            if (isSilentRelocate(mid, exp)) { interrupted = true; break; }
                    }
                    if (interrupted) break;
                    seen++;
                    if (actual === exp.pos) { hit = true; break; } // 落到宣告位置即算生效
                }
                if (seen > 0 && !hit) {
                    if (!pLand) pLand = exp.tag + '击退后位置未生效：预期' + exp.pos + '号位（' + seen + '次出场均未落到该位）';
                }
            }
        }
        if (pDist) return { fail: true, msg: '复发：乘风击退距离异常 — ' + pDist };
        if (pDesc) return { fail: true, msg: '复发：乘风击退缺移位描述 — ' + pDesc };
        if (pLand) return { fail: true, msg: '复发：乘风击退未落地 — ' + pLand };
        return { fail: false };
    }
};
