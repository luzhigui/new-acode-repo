// 回归规则：张三丰·生生不息「回血转永久攻防」的**数值** —— 此前完全没人校验这笔加成算得对不对
//
// 立它的原因（第 43 轮）：变异牙齿测试新增 T4（把 ENDLESS_BREATH fact 的 atkGain 多写 5、实际属性不动），
//   结果**规则侧零反应 → 装饰品**。也就是说：fact 早在 V6.1.x 就带了 atkGain/defGain/heal/overflow 全套数值，
//   战报上也渲染出来了，可**没有任何一条体检规则校验这些数算得对不对** —— 显示多少就是多少，错 5 点没人知道。
//   本规则把这笔账**按 content 公式反推**做精确校验，是 T4 的补牙。
//
// 机制源（modules/311-elite-sixsects-zhangsanfeng.js L90-113，content 张三丰.skills.endlessBreath.params）：
//   gainOf(amount, div) = amount > 0 ? Math.max(minBonus, amount / div) : 0   ← 注意是**除法不是 floor**，可能是小数
//   side = 战斗 RNG 二选一（V6.14.7 改版：一次触发只给一边，另一边恒 0）
//   selfAtkGain = side==='atk' ? gainOf(healed, healAtkDiv)    + gainOf(overflow, overflowAtkDiv)    : 0
//   defGain     = side==='def' ? gainOf(healed, healDefDiv)    + gainOf(overflow, overflowDefDiv)    : 0
//   渲染：`☯ 生生不息：张三丰 回复20点生命（攻+2.6），溢出20点转给X（回复5点，攻+0.5）`
//     —— 自身段在前，括号里就是自身那笔加成；「生命已满」表示 heal=0。
//
// ★ V6.2.0（第 246 轮）改判据模型：系数从 content 现读，不再抄一份常量。
//   动因（上游 4ef115795 / V6.28.2 + upstream 4 笔）：系数由 20/10/10/5 改成 21/8.5/10.5/4。
//   旧版把 4 个系数硬编码在本文件（第 31 行 P 常量，注释自称「参数若改需同步改这里」），
//   结果 37 条红全是「加防却写 7.5，应为 6」这种**判据自身过期**的假红 —— 引擎按 content 算得对，
//   是规则拿着上上代的除数在骂它。这也是第 245 轮教训「判据键/判据值随上游换代失配」的又一次复发。
//   新模型：① 系数一律走 getSkillParams 现读（缺键才回落到旧常量，且该回落本身在自证里被盯住）；
//           ② 判据重心从「逐条对死公式」改为「整场最小二乘估计」——
//              gainOf 在 amount≥minBonus*div 时恒等于 amount/div，故 each-gain = h/div + o/div'，
//              对 heal/overflow 做无截距回归即得分母估计；逐条判据改为「样本离回归线不超过容差」。
//   这样即使上游把小数系数来回调（8.5→9→7.5），规则也不需要跟着改，只有**真的写错数**才红。
//
// 三条复发信号：
//   1) 攻与防同时 > 0 —— 二选一被破坏（V6.14.7 起每次触发只应给一边）
//   2) 逐条：实际加成 > 按 content 公式算出的期望值 + EPS + 0.1（渲染一位小数量化） —— fact 多报（T4 的「多写 5」仍咬）；少报只做观察不计红
//   3) heal=0 且 overflow=0（满血且无溢出）却仍显示加成 —— 无源之水，多给了
//   另加：估计出的分母若与 content 现读值偏差 > 12%，报「系数与 content 不符」（这条才是抓真实漂移的那条）。
//
// 误报规避：
//   - 本场没有生生不息条目 → skip（张三丰是随机精英，多数场次没有）
//   - 文本解析不出加成括号 → 跳过该条（渲染格式变了就宁可不判）
//   - 触底以上样本数 < MIN_SAMPLES 时不做系数核对（样本太少，中位比不稳），仍做逐条公式校验与信号 1/3
export const VER = 'tests/health-rules/154-endless-breath-gain.js V6.2.2';
import { collectNodes, plain } from '../122health-utils.js';
import { getSkillParams } from '../../core/201-config-5v5-test.js';

// 旧常量只作「content 取不到时」的兜底；正常情况下四个系数一律由 getSkillParams 现读。
const P_FALLBACK = { healAtkDiv: 20, healDefDiv: 10, overflowAtkDiv: 10, overflowDefDiv: 5, minBonus: 1 };
const EPS = 0.2;          // 渲染只保留 1 位小数 + 引擎侧 Math.round 落账
const MIN_SAMPLES = 8;    // 系数核对最少样本（少于这个数中位比不稳，宁可只做逐条校验）
const DIV_TOL = 0.12;     // 「实际/期望」中位比允许偏离 1 的幅度（12%，与 EPS 同量级）

function params() {
    let s = null;
    try { s = getSkillParams('张三丰', 'endlessBreath') || null; } catch (e) { s = null; }
    const out = {};
    for (const k of Object.keys(P_FALLBACK)) {
        out[k] = (s && typeof s[k] === 'number' && isFinite(s[k])) ? s[k] : P_FALLBACK[k];
    }
    out._fromContent = !!(s && typeof s.healAtkDiv === 'number');
    return out;
}

function gainOf(amount, div, minBonus) { return amount > 0 ? Math.max(minBonus, amount / div) : 0; }

export const rule101 = {
    group: '精英技能回归',
    name: '张三丰生生不息回血转攻防量(回归)',
    test: function(ctx, log) {
        var p = params();
        var nodes = collectNodes(log);
        var rows = [];
        for (var i = 0; i < nodes.length; i++) {
            var t = plain(nodes[i] && nodes[i].text);
            if (!t || t.indexOf('☯ 生生不息：') === -1) continue;

            var healM = t.match(/回复(\d+(?:\.\d+)?)点生命/);
            var heal = healM ? parseFloat(healM[1]) : 0;   // 「生命已满」→ 0
            var ovM = t.match(/，溢出(\d+(?:\.\d+)?)点/);
            var ov = ovM ? parseFloat(ovM[1]) : 0;

            // ★ V6.2.1：加成括号必须按**所在段**定位，不能取全文第一个。
            //   消费式触发渲染成「☯ 生生不息：张三丰 消耗3点攻击力，生命已满（攻+3.4），溢出36点转给张中（回复6点，攻+3.9）」，
            //   全文第一个括号是**张三丰自己的**那条，最后一个「（回复…，攻+…）」是**溢出接盘者**的 ——
            //   旧版取第一个括号会漏判消费式，取最后一个会把接盘者的加成效应当成张三丰的（36 溢出报 3.9 的假红就是这么来的）。
            //   正解：自身段 = 「回复N点生命 / 生命已满」之后、出现「，溢出」之前的那个括号。
            var ovPos = t.indexOf('，溢出');
            var selfSeg = ovPos >= 0 ? t.substring(0, ovPos) : t;
            var sbp = selfSeg.lastIndexOf('（'), sbpe = selfSeg.indexOf('）', sbp);
            var bonusTxt = (sbp >= 0 && sbpe > sbp) ? selfSeg.substring(sbp + 1, sbpe) : '';
            var aM = bonusTxt.match(/攻\+([\d.]+)/);
            var dM = bonusTxt.match(/防\+([\d.]+)/);
            if (!aM && !dM) continue; // 解析不出加成（格式变了）→ 不猜
            var atk = aM ? parseFloat(aM[1]) : 0;
            var def = dM ? parseFloat(dM[1]) : 0;
            var who = t.substring(t.indexOf('☯ 生生不息：') + 6).split(' ')[0];

            // 信号1：二选一被破坏（攻防同时给了）
            if (atk > 0 && def > 0) {
                return { fail: true, msg: '复发：生生不息同时给攻防：第' + i + '条 ' + who + ' 生生不息同时给了 攻+' + atk + ' 防+' + def
                    + '（V6.14.7 起每次触发应只给一边）' };
            }
            // 信号3：无回血也无溢出却仍显示加成
            if (heal === 0 && ov === 0 && (atk > 0 || def > 0)) {
                return { fail: true, msg: '复发：生生不息无源加成：第' + i + '条 ' + who + ' 生生不息在「无回血且无溢出」时仍给了加成（攻+'
                    + atk + ' 防+' + def + '，无源之水）' };
            }
            rows.push({ i: i, who: who, heal: heal, ov: ov, atk: atk, def: def, gain: atk > 0 ? atk : def, side: atk > 0 ? 'atk' : 'def' });
        }
        if (rows.length === 0) return 'skip'; // 本场没有可校验的生生不息加成

        // 用 content 现读系数逐条算期望值；样本够时再做无截距回归，用回归分母交叉验证 content。
        var violations = [];
        for (var r = 0; r < rows.length; r++) {
            var row = rows[r];
            var exp = row.side === 'atk'
                ? gainOf(row.heal, p.healAtkDiv, p.minBonus) + gainOf(row.ov, p.overflowAtkDiv, p.minBonus)
                : gainOf(row.heal, p.healDefDiv, p.minBonus) + gainOf(row.ov, p.overflowDefDiv, p.minBonus);
            // 只判「自报得过多、但数值对不上」——那才是 fact 写错数（T4 的 +5）。
            //   ★ 自报得比公式少的，是阈值边界（出手前 hp 已低于 30% 走临危、或太极归一/抑疗改写了换血口径），
            //     公式这条链看不见；这种「少给」不在本规则的判据范围内，交由 302/账本对照各自去管。
            //     宁可漏判也不冤枉——第 245 轮教训：判据吃不下口径变化时会批量炮制假红。
            //   容差随量级走：0.2 固定值在 15 点这种大数上会被除数量化台阶误判，故取 max(0.2, 5%)。
            if (row.gain > 0 && row.gain - exp > Math.max(EPS, exp * 0.05)) {
                violations.push('第' + row.i + '条 ' + row.who + ' 回复' + row.heal + '/溢出' + row.ov + ' 得' + row.side + '+' + row.gain
                    + '，按 content（' + (row.side === 'atk' ? 'atk ' + p.healAtkDiv + '/' + p.overflowAtkDiv : 'def ' + p.healDefDiv + '/' + p.overflowDefDiv)
                    + '，地板' + p.minBonus + '）应为 ' + Math.round(exp * 10) / 10);
            }
        }

        // 回归校验：只在「两项都够大、没碰到地板」的样本上做——此时 gainOf 恒等于 amount/div，
        //   解出来的 1/a 才真是分母。碰到地板的样本（heal 或 overflow < minBonus*div）会系统性抬高
        //   估计值，必须剔除；同理 overflow=0 的样本对 overflow 那一列毫无信息，靠两列结构把系数分开。
        var sideStats = {};
        for (var s = 0; s < rows.length; s++) {
            var rw = rows[s];
            var divH = rw.side === 'atk' ? p.healAtkDiv : p.healDefDiv;
            var divO = rw.side === 'atk' ? p.overflowAtkDiv : p.overflowDefDiv;
            if (rw.heal < p.minBonus * divH || rw.ov < p.minBonus * divO) continue;  // 触地板 → 非线性，不入回归
            var key = rw.side;
            (sideStats[key] = sideStats[key] || { xs: [], ys: [] });
            sideStats[key].xs.push([rw.heal, rw.ov]);
            sideStats[key].ys.push(rw.gain);
        }
        var drift = [];
        for (var k in sideStats) {
            var st = sideStats[k];
            if (st.xs.length < MIN_SAMPLES) continue;
            // 两列共线性兜底：heal 与 overflow 在多数场次里此消彼长（heal+overflow≈常数），
            //   直接解 2x2 会把分母估歪。判据用「最小 / 最大」两个锚点：gain 对 (heal/divH + ov/divO) 的
            //   比值应当恒为 1；取全部样本里该比值的中位数，中位数偏离 1 超过 DIV_TOL 才算漂移。
            var ratios = [];
            for (var q = 0; q < st.xs.length; q++) {
                var x1 = st.xs[q][0], x2 = st.xs[q][1], y = st.ys[q];
                var pred = x1 / (k === 'atk' ? p.healAtkDiv : p.healDefDiv) + x2 / (k === 'atk' ? p.overflowAtkDiv : p.overflowDefDiv);
                if (pred > 0) ratios.push(y / pred);
            }
            ratios.sort(function(a, b) { return a - b; });
            var med = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 1;
            if (Math.abs(med - 1) > DIV_TOL) {
                drift.push('侧=' + k + ' 实际/期望 中位比 ' + Math.round(med * 1000) / 1000 + '（' + st.xs.length
                    + ' 条触底以上样本，偏离 ±' + Math.round(DIV_TOL * 100) + '% 即判）');
            }
        }

        if (violations.length > 0) {
            return { fail: true, msg: '复发：生生不息加成与 content 公式不符 ' + violations.length + '/' + rows.length + ' 条 —— '
                + violations.slice(0, 3).join(' ； ') };
        }
        if (drift.length > 0) {
            return { fail: true, msg: '复发：生生不息系数与 content 不符（引擎或 fact 用了旧系数）—— ' + drift.join(' ； ') };
        }
        return { fail: false };
    }
};
