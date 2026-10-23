// tests/silent-relocate-judge-selftest.mjs | V1.0.0 | 2026-10-24 第 125 轮
// 干什么：给 tests/122health-utils.js 的 isSilentRelocate（静默位移白名单判据）装一组**离线自检**，
//   用真实主代码产出的报幕文本 / fact 载荷当样本，逐条断言「该认的认、不该认的不认」。
// 为什么要有它（这是本轮真正的发现，比修两条判据更重要）：
//   138 / 166 的「宣告位置是否落地」判据，靠 isSilentRelocate 判断「期望位被第三方合法改写」
//   从而放弃归因（宁漏勿误）。这条路一旦判据写歪，只有两种后果：
//     - 判据太松 ⇒ 真实回归被静默放行（假绿）；
//     - 判据太紧 ⇒ 合法位移被误报（假红，第 121/124 轮各栽一次）。
//   两种后果在 140 场回放里都**表现为 pass/fail 数字不变**（本轮实测：补两条判据前后，
//   138 pass=16 fail=0、166 pass=66 fail=0 一模一样）—— 也就是说，回放根本看不出判据好坏，
//   它是一个**回放盲区**。必须有一组不依赖抽样的离线断言盯着它。
// 样本来源（全部取自主代码真实写法，改主代码需同步改这里）：
//   tangwenliang.js L160 listText          「${m.unit.name} ${m.from}→${m.to}」（箭头，无「号位」二字）
//   hetaichong.js L128 / L156              「红血：撤退至 N 号位」/「☯ 两仪互换：A ⇄ B」
//   hanlisa.js L294 / L305 / L310          WIND_ASSAULT_PUSH(behindPos) / PUSH_STUN(pos)
// 退出码：0 = 全部断言通过；1 = 有断言不符（判据被改坏或被改松）。
import { isSilentRelocate } from '../tests/122health-utils.js';

const CASES = [
    // ── 判据③ 箭头落位（第 125 轮补）：冲刺报幕写「唐文亮 5→2」，不带「号位」二字，
    //    V6.2.0 的通用落位号判据认不出 ⇒ 冲刺这类静默位移此前是漏判的。
    ['③正·冲刺本人落到期望位', { text: '⚡ 唐文亮冲刺·七伤齐发：唐文亮 5→2；张松溪 4→1。双方各受当前生命 45% 真伤（目标 -12 / 自身 -9），转近战战士' }, { uid: 5, name: '唐文亮', pos: 2 }, true],
    ['③反·同句他人的落位不算本人', { text: '⚡ 唐文亮冲刺·七伤齐发：唐文亮 5→2；张松溪 4→1。双方各受当前生命 45% 真伤' }, { uid: 5, name: '唐文亮', pos: 1 }, false],
    ['③反·无已登记机制的箭头不认', { text: '寒离飒 5→2' }, { uid: 5, name: '寒离飒', pos: 2 }, false],
    // ── 判据④ 载荷落位（第 125 轮补）：蓄意轰拳**全程无报幕文本**，只发带落位号的 fact，
    //    任何文本关键词判据（含上游第 118 轮的关键词名单）都够不着，只能靠名字粗匹配误放行。
    ['④正·PUSH_STUN.pos 落点', { data: { label: '蓄意轰拳', target: { uid: 7, name: '何太冲' }, pos: 2 } }, { uid: 7, name: '何太冲', pos: 2 }, true],
    ['④正·WIND_ASSAULT_PUSH.behindPos', { data: { label: '蓄意轰拳·崩飞', target: { uid: 3, name: '静照' }, behindUnit: null, oldPos: 5, behindPos: 4 } }, { uid: 3, name: '静照', pos: 4 }, true],
    ['④反·非位移 fact 的 pos 不认（寒毒也带 pos）', { data: { label: '寒毒', target: { uid: 7, name: '何太冲' }, pos: 2 } }, { uid: 7, name: '何太冲', pos: 2 }, false],
    ['④反·落点说的是别的单位', { data: { label: '蓄意轰拳', target: { uid: 9, name: '静照' }, pos: 2 } }, { uid: 7, name: '何太冲', pos: 2 }, false],
    ['④反·落点与期望位不符', { data: { label: '蓄意轰拳', target: { uid: 7, name: '何太冲' }, pos: 6 } }, { uid: 7, name: '何太冲', pos: 2 }, false],
    // ── 判据①② 回归护栏：补新判据不能把老判据顶掉
    ['①正·号位文本（红血撤退）', { text: '🩸 何太冲 红血：撤退至 5 号位、转远程' }, { uid: 7, name: '何太冲', pos: 5 }, true],
    ['②正·具名互换（两仪互换）', { text: '☯ 两仪互换：昆仑弟子 ⇄ 何太冲（互换职业与位置）' }, { uid: 7, name: '何太冲', pos: 2 }, true],
    ['①反·号位与期望位不符', { text: '🩸 何太冲 红血：撤退至 5 号位、转远程' }, { uid: 7, name: '何太冲', pos: 3 }, false],
    ['通反·空条目', null, { uid: 7, name: '何太冲', pos: 2 }, false],
    ['通反·无期望位', { text: '🩸 何太冲 红血：撤退至 5 号位、转远程' }, { uid: 7, name: '何太冲' }, false]
];

let bad = [];
for (const [name, mid, exp, want] of CASES) {
    let got;
    try { got = isSilentRelocate(mid, exp); }
    catch (e) { bad.push(name + ' 抛异常：' + e.message); continue; }
    if (got !== want) bad.push(name + ' 得到 ' + got + '，期望 ' + want);
}
if (bad.length) {
    console.log('❌ 静默位移判据自检失败 ' + bad.length + '/' + CASES.length + ' 条：');
    for (const b of bad) console.log('   - ' + b);
    process.exit(1);
}
console.log('✅ 静默位移判据自检通过（' + CASES.length + '/' + CASES.length + ' 条断言：判据①②③④ 正例命中、反例不放行）');
