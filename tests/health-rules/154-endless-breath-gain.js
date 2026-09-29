// 回归规则：张三丰·生生不息「回血转永久攻防」的**数值** —— 此前完全没人校验这笔加成算得对不对
//
// 立它的原因（第 43 轮）：变异牙齿测试新增 T4（把 ENDLESS_BREATH fact 的 atkGain 多写 5、实际属性不动），
//   结果**规则侧零反应 → 装饰品**。也就是说：fact 早在 V6.1.x 就带了 atkGain/defGain/heal/overflow 全套数值，
//   战报上也渲染出来了，可**没有任何一条体检规则校验这些数算得对不对** —— 显示多少就是多少，错 5 点没人知道。
//   本规则把这笔账**按 content 公式反推**做精确校验，是 T4 的补牙。
//
// 机制源（modules/26elite-sixsects.js L78-92 + L116-130，content 张三丰.skills.endlessBreath.params）：
//   gainOf(amount, div) = amount > 0 ? Math.max(minBonus, amount / div) : 0   ← 注意是**除法不是 floor**，可能是小数
//   side = 战斗 RNG 二选一（V6.14.7 改版：一次触发只给一边，另一边恒 0）
//   selfAtkGain = side==='atk' ? gainOf(healed, healAtkDiv)    + gainOf(overflow, overflowAtkDiv)    : 0
//   defGain     = side==='def' ? gainOf(healed, healDefDiv)    + gainOf(overflow, overflowDefDiv)    : 0
//   params（content，截至本版）：healAtkDiv=20 healDefDiv=10 overflowAtkDiv=10 overflowDefDiv=5 minBonus=1
//   渲染（render/35 L408-431）：`☯ 生生不息：张三丰 回复20点生命（攻+2.6），溢出20点转给X（回复5点，攻+0.5）`
//     —— 自身段在前，括号里就是自身那笔加成；「生命已满」表示 heal=0。
//
// 三条复发信号：
//   1) 攻与防同时 > 0 —— 二选一被破坏（V6.14.7 起每次触发只应给一边）
//   2) 加攻量 ≠ 按 heal/overflow 反推的期望值 —— 系数漂移、或 fact 数值被写错（T4 直接命中）
//   3) heal=0 且 overflow=0（满血且无溢出）却仍显示加成 —— 无源之水，多给了
//
// 误报规避：
//   - 本场没有生生不息条目 → skip（张三丰是随机精英，多数场次没有）
//   - 文本解析不出加成括号 → 跳过该条（渲染格式变了就宁可不判）
//   - 渲染值经 Math.round(v*10)/10 只保留 1 位，故用 0.2 容差（T4 的 +5 远超容差，不会漏）
export const VER = 'tests/health-rules/154-endless-breath-gain.js V6.1.19';
import { collectNodes, plain } from '../122health-utils.js';

// content 张三丰.skills.endlessBreath.params（与 136 的 ATK_PER_SPLASH / 144 的 XINHUN_DEDUCT 同款硬编码口径：
// 规则要在浏览器端同步加载，不做 json import；参数若改需同步改这里并在记录-更改履历登记）
const P = { healAtkDiv: 20, healDefDiv: 10, overflowAtkDiv: 10, overflowDefDiv: 5, minBonus: 1 };
const EPS = 0.2; // 渲染只保留 1 位小数

function gainOf(amount, div) { return amount > 0 ? Math.max(P.minBonus, amount / div) : 0; }

export const rule101 = {
    group: '精英技能回归',
    name: '张三丰生生不息回血转攻防量(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var nodes = collectNodes(log);
        var checked = 0;
        for (var i = 0; i < nodes.length; i++) {
            var t = plain(nodes[i] && nodes[i].text);
            if (!t || t.indexOf('☯ 生生不息：') === -1) continue;

            var healM = t.match(/回复(\d+(?:\.\d+)?)点生命/);
            var heal = healM ? parseFloat(healM[1]) : 0;   // 「生命已满」→ 0
            var ovM = t.match(/，溢出(\d+(?:\.\d+)?)点/);
            var ov = ovM ? parseFloat(ovM[1]) : 0;

            // 自身段 = 文本里**第一个**括号（溢出段的括号在它后面）
            var bp = t.indexOf('（'), bpe = t.indexOf('）', bp);
            var bonusTxt = (bp >= 0 && bpe > bp) ? t.substring(bp + 1, bpe) : '';
            var aM = bonusTxt.match(/攻\+([\d.]+)/);
            var dM = bonusTxt.match(/防\+([\d.]+)/);
            if (!aM && !dM) continue; // 解析不出加成（格式变了）→ 不猜
            checked++;
            var atk = aM ? parseFloat(aM[1]) : 0;
            var def = dM ? parseFloat(dM[1]) : 0;
            var who = t.substring(t.indexOf('☯ 生生不息：') + 6).split(' ')[0];

            // 信号1：二选一被破坏（攻防同时给了）
            if (atk > 0 && def > 0) {
                return { fail: true, msg: '复发：第' + i + '条 ' + who + ' 生生不息同时给了 攻+' + atk + ' 防+' + def
                    + '（V6.14.7 起每次触发应只给一边）' };
            }
            // 信号3：无回血也无溢出却仍显示加成
            if (heal === 0 && ov === 0 && (atk > 0 || def > 0)) {
                return { fail: true, msg: '复发：第' + i + '条 ' + who + ' 生生不息在「无回血且无溢出」时仍给了加成（攻+'
                    + atk + ' 防+' + def + '，无源之水）' };
            }
            // 信号2：按公式反推的精确校验
            if (atk > 0) {
                var expAtk = gainOf(heal, P.healAtkDiv) + gainOf(ov, P.overflowAtkDiv);
                if (Math.abs(atk - expAtk) > EPS) {
                    return { fail: true, msg: '复发：第' + i + '条 ' + who + ' 生生不息 回复' + heal + '点/溢出' + ov
                        + '点，加攻却写 ' + atk + '，按 content 公式应为 ' + Math.round(expAtk * 10) / 10
                        + '（heal/' + P.healAtkDiv + ' + overflow/' + P.overflowAtkDiv + '，每档地板 ' + P.minBonus + '）' };
                }
            }
            if (def > 0) {
                var expDef = gainOf(heal, P.healDefDiv) + gainOf(ov, P.overflowDefDiv);
                if (Math.abs(def - expDef) > EPS) {
                    return { fail: true, msg: '复发：第' + i + '条 ' + who + ' 生生不息 回复' + heal + '点/溢出' + ov
                        + '点，加防却写 ' + def + '，按 content 公式应为 ' + Math.round(expDef * 10) / 10
                        + '（heal/' + P.healDefDiv + ' + overflow/' + P.overflowDefDiv + '，每档地板 ' + P.minBonus + '）' };
                }
            }
        }
        if (checked === 0) return 'skip'; // 本场没有可校验的生生不息加成
        return { fail: false };
    }
};
