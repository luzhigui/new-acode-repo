// health-report-parse.mjs V1.0.0 | 2026-11-18 第28轮
// 一键体检报告的纯解析函数（无副作用，可离线自证）。
// 背景：#40 把"真实 bug 候选"从 run-all 输出里抓出来给用户看，但解析一直没端到端验证成功
//   （全套 28 项太重、机器并发负载高）。把解析抽成纯函数后，喂真实输出样本即可 --selftest，
//   不再依赖跑全套——解析器哑了当场知道。
// 解析对象：run-all 汇总表的 key line（pickKeyLine 剥过前缀），形如
//   `覆盖率/空转红线  99317ms  exit=1  156  100.0% 70/86/0  ❌ 伤害印数与血条实落同源`

// 从 run-all 完整输出抓汇总表红行，剥掉 "  ❌ " 前缀
export function extractRedLines(output) {
    return String(output || '').split(/\r?\n/)
        .filter(l => /^  ❌/.test(l))
        .map(l => l.replace(/^  ❌\s*/, ''));
}

// 从红行里抓 coverage 的 "pass/fail/skip ❌ 规则名"，只留 fail>0（真实 bug 候选）
export function parseBugCandidates(redLines) {
    const out = [];
    for (const line of (redLines || [])) {
        const m = String(line).match(/(\d+)\/(\d+)\/(\d+)\s+❌\s+(.+)$/);
        if (!m) continue;
        const [, pass, fail, skip, name] = m;
        if (Number(fail) > 0) out.push({ name: name.trim(), pass: +pass, fail: +fail, skip: +skip });
    }
    return out;
}

export function selftestHealthReportParse() {
    const fails = [];
    const eq = (a, b, label) => {
        if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(label + '：得 ' + JSON.stringify(a) + ' 期望 ' + JSON.stringify(b));
    };
    // 真实样本（第27轮从一键报告 raw 字段抓到的原文）
    const sample = [
        '✅ 全绿项                  12ms',
        '  ✅ 静态快检                846ms',
        '  ❌ 覆盖率/空转红线       99317ms  exit=1  156  100.0% 70/86/0         ❌ 伤害印数与血条实落同源',
        '  ❌ 规则回放             1730ms  exit=1  规则回放自检：156 场',
        '  ❌ 胜负基线闸门         6418ms  exit=1  RESULT: 基线回归 10/24 场',
    ].join('\n');
    const reds = extractRedLines(sample);
    eq(reds.length, 3, '① 红行数（✅不计、❌计）');
    if (reds.some(l => l.startsWith('❌ '))) fails.push('② 红行前缀未剥干净');
    const bugs = parseBugCandidates(reds);
    eq(bugs.length, 1, '③ bug候选数（只有 coverage 那行符合）');
    eq(bugs[0], { name: '伤害印数与血条实落同源', pass: 70, fail: 86, skip: 0 }, '④ 解析字段值');
    // 负路径：没有 coverage 行时不误报候选
    eq(parseBugCandidates(['规则回放 exit=1 规则回放自检：156 场', '胜负基线 exit=1 基线回归']), [], '⑤ 无coverage行应空');
    // 负路径：fail=0 不算 bug 候选
    eq(parseBugCandidates(['名 156 100.0% 70/0/86         ❌ 某规则']), [], '⑥ fail=0应过滤');
    // 边界：空输入 / null
    eq(parseBugCandidates(null), [], '⑦ null输入');
    if (fails.length) {
        console.error('❌ 体检报告解析自证失败：\n  ' + fails.join('\n  '));
        return false;
    }
    console.log('✅ 体检报告解析自证 7/7（红行提取/前缀剥离/bug候选/字段值/负路径/边界）');
    return true;
}
