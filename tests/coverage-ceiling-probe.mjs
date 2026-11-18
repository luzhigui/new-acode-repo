// tests/coverage-ceiling-probe.mjs | V1.0.0 | 2026-11-18（看板 #27：单场覆盖上限实测 + 全覆盖轮换入口取证）
//
// 定位：回答两个问题，各给**实测数字**，不猜：
//   ① 一场 5v5 最多能真正检查多少条规则？（体验层「快速跑完 / 实时跟跑」不带 RECIPE_TAGS
//      ⇒ 零强制上场 ⇒ 规则大面积 skip ⇒ 用户看到「啥也查不到」）
//   ② 想全覆盖需要轮换几局？哪些规则**轮换也覆盖不到**（必须靠强制上场/特定条件）？
//
// 测法（**零改动复用既有回放器**，不改任何判据/阈值/基线/主代码）：
//   每跑一场单场回放（SEEDS=x STAGES=y），从 RULE_STATS_OUT 落盘里读每条规则的 pass/fail/skip：
//     pass+fail > 0  ⇒ 这场真的执行了这条规则（没被 skip）
//     pass=fail=0     ⇒ 这场这条规则被 skip（结构上没机会检查）
//   于是「单场覆盖上限」= 各场执行条数的 max；「轮换 N 局」= 按执行条数贪心累加并集，
//   看多少场能把可覆盖的规则吃满。
//
// 静态侧（可选佐证）：从 tests/124rule-recipes.js 的 RULE_META 拿「规则名→英雄标签」映射，
//   算一场 5v5（我方 5 + 敌方 5）在**最优阵容**下的理论覆盖上限，以及轮换局数下界。
//
// 本件是**取证件**：只打印报告，默认不判红（退出码 0）；只有「测量本身跑不起来」才退 1。
// 想把结论接进守门请另立任务并写死判据，不要在本件里悄悄加红。
//
// 用法：
//   node tests/coverage-ceiling-probe.mjs                # 默认 12 场 + 静态侧
//   node tests/coverage-ceiling-probe.mjs --cases 24     # 多跑几场
//   node tests/coverage-ceiling-probe.mjs --json out.json
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RULE_META } from './124rule-recipes.js';

export const VER = 'tests/coverage-ceiling-probe.mjs V1.0.0';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const REPLAY = path.join(here, 'rules-replay.mjs');

const argv = process.argv.slice(2);
const jsonIdx = argv.indexOf('--json');
const JSON_OUT = jsonIdx >= 0 ? argv[jsonIdx + 1] : null;
const caseIdx = argv.indexOf('--cases');
const CASE_COUNT = caseIdx >= 0 ? Math.max(1, Number(argv[caseIdx + 1]) || 12) : 12;

// 采样场次：跨 7 个关卡铺开（每关卡先取 seed 1，再 seed 2……），避免只测第一关。
function buildCases(n) {
    const out = [];
    for (let i = 0; out.length < n; i++) {
        const stage = (i % 7) + 1;
        const seed = Math.floor(i / 7) + 1;
        out.push({ seed, stage });
    }
    return out;
}

// ---------------------------------------------------------------- 静态侧：规则名 → 英雄标签 → 一场能查多少
function staticSide() {
    const byTag = new Map();       // tag -> 规则名[]
    const generic = [];            // 无 hero 要求（generic/mechanic/未登记）
    for (const [name, meta] of Object.entries(RULE_META)) {
        const tag = (meta && meta.tag) || '';
        if (tag.startsWith('hero:') || tag.startsWith('enemy:')) {
            if (!byTag.has(tag)) byTag.set(tag, []);
            byTag.get(tag).push(name);
        } else generic.push(name);
    }
    const allyTags = [...byTag.keys()].filter(t => t.startsWith('hero:'));
    const enemyTags = [...byTag.keys()].filter(t => t.startsWith('enemy:'));
    // 阵容上限：我方 5 人 + 敌方 5 人（关卡精英占位）
    const pick = (tags, slots) => {
        // 穷举 C(n, slots)：n 很小，直接算精确最优（不是估算）
        const combos = [];
        const rec = (start, cur) => {
            if (cur.length === slots) { combos.push(cur.slice()); return; }
            for (let i = start; i < tags.length; i++) { cur.push(tags[i]); rec(i + 1, cur); cur.pop(); }
        };
        rec(0, []);
        let best = null;
        for (const c of combos) {
            const cnt = c.reduce((n, t) => n + byTag.get(t).length, 0);
            if (!best || cnt > best.cnt) best = { cnt, combo: c };
        }
        return best;
    };
    const ally = pick(allyTags, 5);
    const enemy = pick(enemyTags, 5);
    return {
        metaEntries: Object.keys(RULE_META).length,
        tagRules: [...byTag.entries()].map(([tag, names]) => ({ tag, count: names.length })).sort((a, b) => b.count - a.count),
        ally,
        enemy,
        genericCount: generic.length,
        // 轮换下界：每场最多覆盖 ally.cnt + enemy.cnt 条带标签规则
        perMatchMax: ally.cnt + enemy.cnt
    };
}

// ---------------------------------------------------------------- 实测侧：一场一场跑，读每条的 pass/fail/skip
function runOneCase(seed, stage, tmpDir) {
    const outFile = path.join(tmpDir, `stats_${seed}_${stage}.json`);
    const env = { ...process.env, SEEDS: String(seed), STAGES: String(stage), RULE_STATS_OUT: outFile };
    const r = spawnSync(process.execPath, [REPLAY], { cwd: repoRoot, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (!fs.existsSync(outFile)) {
        return { seed, stage, error: '回放未落盘（RULE_STATS_OUT）· 退出码 ' + r.status + ' · ' + String(r.stderr || '').slice(0, 200) };
    }
    let stats;
    try {
        stats = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    } catch (e) {
        return { seed, stage, error: '落盘文件解析失败：' + e.message };
    }
    const executed = [];
    const skipped = [];
    for (const [name, a] of Object.entries(stats.agg || {})) {
        if ((a.pass || 0) + (a.fail || 0) > 0) executed.push(name);
        else skipped.push(name);
    }
    const resultLine = String(r.stdout || '').split('\n').filter(l => l.startsWith('RESULT:')).slice(-1)[0] || '';
    return {
        seed, stage,
        ruleCount: stats.ruleCount,
        executedCount: executed.length,
        skippedCount: skipped.length,
        executed,
        skipped,
        replayExit: r.status,
        resultLine
    };
}

// ---------------------------------------------------------------- 主流程
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hc-ceiling-'));
process.on('exit', () => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* 清理失败不影响结论 */ } });

console.log('=== 单场覆盖上限实测（看板 #27）===');
const st = staticSide();
console.log('【静态侧】RULE_META 登记 ' + st.metaEntries + ' 条；带英雄标签的规则按标签分布（前 12）：');
for (const t of st.tagRules.slice(0, 12)) console.log('    ' + t.tag + ' → ' + t.count + ' 条规则');
console.log('【静态侧】最优阵容下我方 5 人可查 ' + st.ally.cnt + ' 条（' + st.ally.combo.join('、') + '），'
    + '敌方 5 人可查 ' + st.enemy.cnt + ' 条（' + st.enemy.combo.join('、') + '）');
console.log('【静态侧】⇒ 单场理论覆盖上限 ≈ ' + st.perMatchMax + ' 条带标签规则（另有 ' + st.genericCount + ' 条无英雄要求）');

const cases = buildCases(CASE_COUNT);
const measured = [];
let failed = 0;
for (const c of cases) {
    const m = runOneCase(c.seed, c.stage, tmpDir);
    if (m.error) {
        failed++;
        console.log('  ❌ seed=' + c.seed + ' stage=' + c.stage + ' ' + m.error);
        continue;
    }
    measured.push(m);
    console.log('  · seed=' + c.seed + ' stage=' + c.stage + '：执行 ' + m.executedCount + '/' + m.ruleCount
        + ' 条（skip ' + m.skippedCount + '）' + (m.resultLine ? ' · ' + m.resultLine : ''));
}

if (!measured.length) {
    console.log('❌ 一场都没跑起来，测量不成立（不是结论，是环境阻塞）');
    process.exit(1);
}

const counts = measured.map(m => m.executedCount).sort((a, b) => b - a);
const max = counts[0], min = counts[counts.length - 1];
const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
const union = new Set();
for (const m of measured) for (const n of m.executed) union.add(n);
const ruleCount = measured[0].ruleCount;
console.log('\n【实测侧】单场执行条数：max ' + max + ' / 中位 ' + counts[Math.floor(counts.length / 2)] + ' / min ' + min
    + ' / 均值 ' + avg.toFixed(1) + '（规则总数 ' + ruleCount + '）');
console.log('【实测侧】' + measured.length + ' 场轮换的并集覆盖 = ' + union.size + '/' + ruleCount
    + ' 条（' + (union.size / ruleCount * 100).toFixed(1) + '%）');

// 贪心累计曲线：按单场执行条数从多到少累加，看几场能把可覆盖的吃满
const sorted = measured.slice().sort((a, b) => b.executedCount - a.executedCount);
const seen = new Set();
const curve = [];
for (const m of sorted) {
    for (const n of m.executed) seen.add(n);
    curve.push({ seed: m.seed, stage: m.stage, cum: seen.size });
}
console.log('【实测侧】贪心累计曲线（按单场执行条数降序累加）：'
    + curve.map((p, i) => (i + 1) + '场→' + p.cum).join('，'));

// 轮换也覆盖不到的规则（这些必须有强制上场/特定条件，轮换阵容解决不了）
const never = [...(measured[0].skipped)].filter(n => !union.has(n));
console.log('\n【实测侧】本样本轮换后**仍未执行**的规则 ' + never.length + ' 条：');
for (const n of never) {
    const meta = RULE_META[n];
    console.log('    · ' + n + (meta && meta.tag ? '  [' + meta.tag + ']' : '  [无标签登记]')
        + (meta && meta.note ? '  —— ' + String(meta.note).slice(0, 60) : ''));
}

const report = {
    ver: VER,
    static: { metaEntries: st.metaEntries, perMatchMax: st.perMatchMax, ally: st.ally, enemy: st.enemy, genericCount: st.genericCount, tagRules: st.tagRules },
    measured: measured.map(m => ({ seed: m.seed, stage: m.stage, executedCount: m.executedCount, ruleCount: m.ruleCount })),
    singleMatch: { max, min, avg: Number(avg.toFixed(2)), ruleCount },
    unionCoverage: { covered: union.size, total: ruleCount, cases: measured.length },
    curve,
    neverCovered: never
};
if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2), 'utf8');
    console.log('\n📄 已落盘：' + JSON_OUT);
}
console.log('\n' + (failed ? '⚠️ ' + failed + ' 场没跑起来（环境阻塞），上面的统计只含跑成的 ' + measured.length + ' 场' : '✅ 全部 ' + measured.length + ' 场跑成'));
process.exit(0);
