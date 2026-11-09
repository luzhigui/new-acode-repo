// tests/meteor-growth-render-selftest.mjs | V1.0.0 | 2026-11-08 夜间第 195 轮
//
// 干什么：给 tests/health-rules/155-meteor-growth-dup.js 的两条判据装离线自检
//   （信号1 单位名缺失 / 信号2 同一笔成长渲染两遍）。
//
// 为什么这轮必须补（这是本轮最值得记的一条）：
//   155 在 156 场回放里**恒空转**（pass=0 fail=0 skip=156），根因是它只认 `攻击+(\d+)`，
//   而主代码 render/412 早已改为 `攻击${sgn(fact.growth)}` —— 负成长渲染成「攻击-3」，一条都认不到。
//   更要命的是：153 的头注白纸黑字写着「单位名缺失 / 渲染两遍两条已拆到 155」，
//   但 153 的实现里**只剩成长量一条**。两处一空一转，= 这两块覆盖在 156 场里彻底失守，
//   而体检面板一直显示它们「在册」。这就是「规则在册 ≠ 规则在岗」。
//   修正则之后必须证明它真能咬住，否则下次口径再漂还是没人喊。
//
// 样本照抄主代码真实渲染文案（tests/.mut/probe-meteor.mjs 第 43 轮实测原文）：
//   溅射行尾内联「☄️ 流星赶月溅射：A、B，各-5，防御-1 ⚡ X 攻击+8」
//   独立成长行「⚡ 明教弟子3 攻击+8」 / 负成长「⚡ 明教弟子3 攻击-3」
//
// 退出码：0 = 全对；1 = 有断言不符（判据被改坏、或又被改回只认正号）。
//
// V1.0.0 | 2026-11-08 夜间第 195 轮：新建。文本 7 条 + fact 6 条，
//   专咬「把正则改回只认 +」与「fact 侧两条信号被摘掉」两类退化。
export const VER = 'tests/meteor-growth-render-selftest.mjs V1.0.0';

import { rule102, assessFacts } from './health-rules/155-meteor-growth-dup.js';

const LN = (text) => ({ text });
const run = (lines) => {
    const res = rule102.test({}, lines.map(LN), [], [], [], []);
    if (res === 'skip') return 'skip';
    return res && res.fail ? 'fail' : 'pass';
};

const CASES = [
    // ── 反向（必须咬住）──
    ['R1 成长行单位名缺失（老路径 undefined）', [
        '☄️ 流星赶月溅射：班淑娴、何太冲，各-5 ⚡ undefined 攻击+8',
        '⚡ 明教弟子3 攻击+8'
    ], 'fail'],
    ['R2 同一笔成长渲染两遍（溅射行尾 + 紧随独立行，数值相同）', [
        '☄️ 流星赶月溅射：班淑娴、何太冲，各-5 ⚡ 明教弟子3 攻击+4',
        '⚡ 明教弟子3 攻击+4'
    ], 'fail'],
    ['R3 负成长下单位名缺失也必须抓到（旧正则连认都认不到）', [
        '☄️ 流星赶月溅射：班淑娴、何太冲，各-5 ⚡ undefined 攻击-3'
    ], 'fail'],

    // ── 正向（不许误报）──
    ['P1 正常形态：溅射行内联 + 独立行数值不同', [
        '☄️ 流星赶月溅射：班淑娴、何太冲，各-5 ⚡ 明教弟子3 攻击+4',
        '⚡ 明教弟子3 攻击+2'
    ], 'pass'],
    // V1.2.0：零样本不再静默 skip，改为「如实报告不可取证」（fail=false + observe），
    //   对外仍算 pass，但结论里会说清「本场没样本」，不会假装覆盖。
    ['P2 没有流星成长的本场（应如实报告不可取证，而不是静默 skip）', [
        '⚔️ 张无忌 攻击 灭绝师太，造成 12 伤害'
    ], 'pass'],
    ['P3 只有负成长、无重复无缺名（第 195 轮之前会 skip）', [
        '⚡ 明教弟子3 攻击-3'
    ], 'pass'],
    ['P4 两笔数值相同的成长相隔很远（不同回合巧合，不算重复）', [
        '⚡ 明教弟子3 攻击+4',
        '⚔️ 张无忌 攻击 灭绝师太，造成 12 伤害',
        '☄️ 流星赶月溅射：班淑娴、何太冲，各-5',
        '⚡ 明教弟子3 攻击+4'
    ], 'pass']
];

// ── fact 侧（V1.2.0 主通道）：形态同源校验 ──
const F = (unitName, growth) => ({ factType: 'meteorSplashGrowth', data: { unitName, growth } });
const FACT_CASES = [
    ['F1 fact 缺 unitName', [F(undefined, 8)], 'fail'],
    ['F2 fact unitName 为空串', [F('  ', 8)], 'fail'],
    ['F3 同一笔成长发了两遍 fact', [F('明教弟子3', 4), F('明教弟子3', 4)], 'fail'],
    ['F4 正常 fact', [F('明教弟子3', 4)], 'pass'],
    ['F5 两笔同数值但中间隔了别的成长（不同回合巧合）', [F('明教弟子3', 4), F('明教弟子1', 2), F('明教弟子3', 4)], 'pass'],
    ['F6 本场没有成长 fact（交回文本通道）', [], null]
];

let bad = 0;
for (const [name, facts, want] of FACT_CASES) {
    const r = assessFacts(facts);
    const got = r === null ? null : (r.fail ? 'fail' : 'pass');
    if (got !== want) {
        bad++;
        console.log(`❌ ${name}：期望 ${want}，实得 ${got}`);
    }
}
for (const [name, lines, want] of CASES) {
    const got = run(lines);
    if (got !== want) {
        bad++;
        console.log(`❌ ${name}：期望 ${want}，实得 ${got}`);
    }
}
if (bad === 0) {
    console.log(`✅ 流星成长渲染判据自检通过（文本 ${CASES.length} 条 + fact ${FACT_CASES.length} 条：反向全咬住 / 正向零误报 / skip 如实）`);
    process.exit(0);
}
console.log(`❌ 流星成长渲染判据自检失败 ${bad} 条`);
process.exit(1);
