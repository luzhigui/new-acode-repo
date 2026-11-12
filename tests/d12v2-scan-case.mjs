import { selfCheck, analyzeSource, SELF_FIXTURES } from './rule-false-green-scan.mjs';

// 测试 1: 自证全过（这是 scanner 直接跑时的逻辑，但这里作为独立单元复用）
console.log('=== 1. 自证 ===');
const selfProblems = selfCheck();
if (selfProblems.length) {
    console.log('❌ 自证失败:');
    selfProblems.forEach(p => console.log('  · ' + p));
    process.exit(1);
}
console.log('✅ 自证通过: A/B/C/D1/D2/D3 六类反例各咬住 1 例，干净夹具 0 误咬');

// 测试 2: 逐类反向样本确认（直接喂各类 fixture 源码，确认只有目标类命中）
console.log('\n=== 2. 逐类反向样本（每类只许该类命中） ===');
const catMap = { A: '形状非法', B: '无 fail 路径', C: '恒 pass 分支', D1: 'catch 吞成 pass', D2: 'catch 吞成 skip', D3: '空 catch' };
let allOk = true;
for (const fx of SELF_FIXTURES) {
    const got = analyzeSource(fx.src, '(fixture)');
    const cats = new Set(got.map(f => f.cat));
    // 应该命中的类
    for (const c of fx.categories) {
        if (!cats.has(c)) {
            console.log('❌ 反向样本缺口: 「' + fx.name + '」本应命中 ' + c + ' (' + catMap[c] + ') 却未命中');
            allOk = false;
        }
    }
    // 不该命中的类：C 夹具（两支都 return pass）天然也命中 B（整体无 fail 路径），这是正确行为
    for (const c of cats) {
        if (fx.categories.length > 0 && !fx.categories.includes(c)) {
            if (fx.categories.includes('C') && c === 'B') {
                console.log('   (C 夹具两支都 return pass，整体也无 fail 路径 → 同时命中 C 和 B，正确行为)');
                continue;
            }
            console.log('❌ 误伤: 「' + fx.name + '」不该命中 ' + c + ' (' + catMap[c] + ') 却命中了 → ' + got.find(f => f.cat === c).why);
            allOk = false;
        }
    }
    if (fx.categories.length > 0) {
        console.log('✅ 「' + fx.name + '」精准命中 ' + fx.categories.join(',') + ' (' + fx.categories.map(c => catMap[c]).join(',') + ')');
    } else {
        console.log('✅ 「' + fx.name + '」(干净夹具) 0 命中');
    }
}
if (!allOk) process.exit(1);
console.log('\n✅ 所有反向样本精准命中，0 误伤');

// 测试 3: 守卫前提失效（模拟 acorn 缺失）需要单独进程跑，这里只确认文件里有守卫代码
console.log('\n=== 3. 守卫代码存在性确认 ===');
const src = (await import('node:fs')).readFileSync('tests/rule-false-green-scan.mjs', 'utf8');
if (!src.includes('守卫前提失效') || !src.includes('acorn 缺失') || !src.includes('process.exit(1)')) {
    console.log('❌ 守卫代码不完整');
    process.exit(1);
}
console.log('✅ 守卫代码在位（含 "守卫前提失效"、"acorn 缺失"、process.exit(1)）');

console.log('\n🎉 所有定向用例通过');
process.exit(0);