#!/usr/bin/env node
// tests/entry-path-guard.mjs V1.0.0 | 预估 ~14000 bytes
//
// 「入口路径强制」：把「公共入口已经建好，但没人被要求必须用」这件事，从纪律变成机器可验的约束。
//
// 立此件的由头（2026-11-08 高视角审核实测）：
//   modules/305 上一轮已抽出 6 个公共动作，但铺开率极不均匀 —— findAlive 39/50、requireSkillParams 48/65
//   尚可，pushFact 却只有 1/95、emitHpChange 14/42。骨架不是「缺」，是「可选」；而可选就等于没有。
//   更根本的是：现有全部闸门（分层方向 / ver-drift / manifest / 契约一致性）管的是
//   「目录怎么依赖」「版本有没有升」「字段有没有登记」，**没有一条**管
//   「你已经提供了公共出口，代码却绕过它自己手写」。这一层空档，正是改一处得找 N 处的放大器。
//
// 判据（每条都是源码里不可争辩的事实，不靠自觉）：
//   规则 A「裸推 fact」     ：`log.push({ factType` / `data.log.push` / `outLog.push`
//                             → 应走 modules/305 的 pushFact(log, factType, data)
//   规则 B「裸广播血量/攻防」：`emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, …)`
//                             → 应走 core/214 的 emitHpChange(unit, extra)
//   ★ 规则 B 的入口本身在 core/214 而不是 modules/305：core 是业务最低层，modules 以上都能 import；
//     入口若放 modules，core 自己那 22 处永远够不到（core→modules 属反向依赖）——规则会留 79% 的活口。
//     本轮已把实作从 305 下移到 214（V6.4.8），305 改 re-export 转口，行为一字未改。
//
// 为什么「只拦新增」而不是要求清零：
//   与 layer-direction-scan 同一取舍（见那边 V1.0 头注释）：存量 138 处一次性清零要动 core/204（24 处）、
//   core/210、core/212 等核心战斗路径，属改行为的批量重构，风险远大于收益。故本件：
//   ① 存量逐文件登记进 tests/entry-path-baseline.json，冻结为上限；
//   ② --enforce 只拦「超出基线」的新增，旧账可以逐批还；
//   ③ 还清后跑 --update-baseline 收缩上限，棘轮只降不抬。
//
// ★ 公平面：公共入口自身的实现必然「裸写」（pushFact 里那句 log.push、emitHpChange 里那句
//   emitEvent），故 core/214 与 modules/305 的对应处同样进基线冻结——不是豁免，是「这两处的计数
//   从此不许变多」。想给入口加第二个裸写，照样红。
//
// 已知边界（少收不错判，与项目既有取舍一致）：
//   ① 正则只认 `log` / `data.log` / `ctx.log` / `outLog` 四种 fact 日志容器名；
//      `sink.push` / `group.data.entries.push` / `pendingEntries.push` 等**不是** fact 日志，刻意不收
//      （实测这四类共 10 处，混进来会造成误报）。
//   ② 字符串字面量里的同款文本按「行内引号奇偶」排除：命中位置所在行的前半段引号数为奇数即判为
//      字面量内、跳过。跨行模板串会漏收（少收方向，安全）。
//   ③ 剥注释走 tests/_lib/static-truth-slice 的 stripCommentsMapped（全项目唯一来源，不写第二份）。
//   ④ 只扫 infra/core/modules/render/player/fx/ui 七个主代码目录，不含 tests/ 与 tools/
//      （tests 里的合成源码自证要用裸写法，tools 是外部工具层）。
//
// 用法：
//   node tests/entry-path-guard.mjs                 仅报告，恒 EXIT 0
//   node tests/entry-path-guard.mjs --enforce       有新增 → EXIT 1（挂 run-all 用这个）
//   node tests/entry-path-guard.mjs --update-baseline  按当前实测重写基线（收缩旧账后用）
//   node tests/entry-path-guard.mjs --selftest      12 条正负路径自证，EXIT 0 = 全过
//   node tests/entry-path-guard.mjs --json          机器可读结果

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripCommentsMapped, mainSourceDirs } from './_lib/static-truth-slice.mjs';

export const VER = 'tests/entry-path-guard.mjs V1.0.0';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const BASELINE_FILE = path.join(HERE, 'entry-path-baseline.json');

const SCAN_DIRS = mainSourceDirs;

// 规则表。新增一条规则 = 加一行 + 重跑一次 --update-baseline（存量自动入基线）。
const RULES = [
    {
        id: 'bare-fact-push',
        title: '裸推 fact',
        entry: 'pushFact(log, factType, data)  @ modules/305-elite-helpers.js',
        re: /(?:\blog|outLog)\.push\(\s*\{\s*factType/g,
    },
    {
        id: 'bare-hp-change',
        title: '裸广播血量/攻防',
        entry: 'emitHpChange(unit, extra)  @ core/214-battle-shared.js',
        re: /(?:emitEvent|emitCoreEvent)\([^;{}]{0,160}?UNIT_EVENT_TYPES\.HP_CHANGE/g,
    },
];

// ---------------------------------------------------------------------------
// 核心扫描：纯函数，喂源码出命中（自证直接打这个，不依赖仓库内容）
// ---------------------------------------------------------------------------
export function scanSource(src) {
    const lines = String(src).split('\n');
    const { code, owner, lineOf } = stripCommentsMapped(String(src));
    const out = {};
    for (const rule of RULES) {
        const hits = [];
        rule.re.lastIndex = 0;
        let m;
        while ((m = rule.re.exec(code)) !== null) {
            tuneGuard(m);
            const srcIdx = owner[m.index];
            const lineStart = src.lastIndexOf('\n', srcIdx - 1) + 1;
            const before = src.slice(lineStart, srcIdx);
            // 字符串字面量内：命中位置之前该行引号数为奇数 → 判为字面量正文，跳过
            if (((before.match(/['"`]/g) || []).length % 2) === 1) continue;
            const ln = lineOf(srcIdx);
            hits.push({ line: ln, text: (lines[ln - 1] || '').trim().slice(0, 110) });
        }
        if (hits.length) out[rule.id] = hits;
    }
    return out;
}

// 空转保护：正则若匹配空串会让 while 死循环（自证里会测到）
function tuneGuard(m) {
    if (m[0] === '') throw new Error('规则正则匹配到空串，写法有误: ' + m.input.slice(m.index, m.index + 20));
}

export function scanRepo() {
    const byRule = {};
    let files = 0;
    for (const d of SCAN_DIRS) {
        const abs = path.join(ROOT, d);
        if (!fs.existsSync(abs)) continue;
        for (const f of fs.readdirSync(abs).filter(x => x.endsWith('.js')).sort()) {
            const rel = `${d}/${f}`;
            let hits;
            try {
                hits = scanSource(fs.readFileSync(path.join(abs, f), 'utf8'));
            } catch (e) {
                hits = {};
                byRule._errors = byRule._errors || [];
                byRule._errors.push(`${rel}: ${e.message}`);
            }
            files++;
            for (const [id, list] of Object.entries(hits)) {
                if (!byRule[id]) byRule[id] = {};
                byRule[id][rel] = list;
            }
        }
    }
    return { files, byRule };
}

// ---------------------------------------------------------------------------
// 基线与比对
// ---------------------------------------------------------------------------
export function buildBaseline(byRule) {
    const rules = {};
    for (const rule of RULES) {
        rules[rule.id] = {};
        for (const [rel, list] of Object.entries(byRule[rule.id] || {})) {
            rules[rule.id][rel] = list.length;
        }
    }
    return {
        $comment: '入口路径强制扫描的存量基线：仅登记生成时已存在的裸写点，按「规则 × 文件」冻结上限（不含行号，避免改行数就失效）。新增由 tests/entry-path-guard.mjs --enforce 拦截；还清旧账后跑 --update-baseline 收缩（棘轮只降不抬）。',
        version: VER,
        generatedAt: new Date().toISOString().slice(0, 10),
        rules,
    };
}

export function diffAgainstBaseline(byRule, baseline) {
    const rules = (baseline && baseline.rules) || {};
    const added = [];
    const paid = [];
    for (const rule of RULES) {
        const cur = byRule[rule.id] || {};
        const capMap = rules[rule.id] || {};
        for (const [file, list] of Object.entries(cur)) {
            const cap = capMap[file] || 0;
            // 只报**超出基线的那几条**（list.slice(cap)）：否则报出来的永远是文件里前几条既存命中，
            //   看的人会去改不该改的行。这是第 1 版端到端实测暴露的真问题（注入违规却指向 L146 旧代码）。
            if (list.length > cap) added.push({ rule: rule.id, file, now: list.length, cap, samples: list.slice(cap, cap + 3) });
            else if (list.length < cap) paid.push({ rule: rule.id, file, now: list.length, cap });
        }
        for (const [file, cap] of Object.entries(capMap)) {
            if (!cur[file] && cap > 0) paid.push({ rule: rule.id, file, now: 0, cap });
        }
    }
    return { added, paid };
}

function loadBaseline() {
    if (!fs.existsSync(BASELINE_FILE)) return { data: null, error: '基线文件不存在：tests/entry-path-baseline.json' };
    try {
        const data = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
        const missing = RULES.filter(r => !data.rules || !data.rules[r.id]).map(r => r.id);
        if (missing.length) return { data, error: `基线缺少规则段：${missing.join(', ')}（跑 --update-baseline 补）` };
        return { data, error: null };
    } catch (e) {
        return { data: null, error: `基线解析失败：${e.message}` };
    }
}

// ---------------------------------------------------------------------------
// 自证：12 条正负路径（正例必须抓到，负例必须不误伤）
//   自带断言编号，失败时打印"哪一条"，避免"某条绿了就以为全绿"。
// ---------------------------------------------------------------------------
const SELFTESTS = [
    { n: 1, desc: '裸推 fact 正例：log.push({factType})', src: "log.push({ factType: FACT_TYPES.X, data: {} });", expect: { 'bare-fact-push': 1 } },
    { n: 2, desc: '负路径：注释里的 log.push 不算', src: "// log.push({ factType: FACT_TYPES.X });", expect: {} },
    { n: 3, desc: '正例：data.log.push 也认', src: "if (ctx?.log) ctx.log.push({ factType: FACT_TYPES.Y, data: {} });", expect: { 'bare-fact-push': 1 } },
    { n: 4, desc: '正例：outLog.push 也认', src: "outLog.push({ factType: FACT_TYPES.Z, data: {} });", expect: { 'bare-fact-push': 1 } },
    { n: 5, desc: '负路径：渲染条目 entries.push 不是 fact 日志', src: "group.data.entries.push({ factType: 'INFO', text: 'x' });", expect: {} },
    { n: 6, desc: '负路径：已走入口 pushFact 不报', src: "pushFact(log, FACT_TYPES.X, { a: 1 });", expect: {} },
    { n: 7, desc: '正例：多行对象形态照样抓', src: "log.push({\n    factType: FACT_TYPES.X,\n    data: { a: 1 }\n});", expect: { 'bare-fact-push': 1 } },
    { n: 8, desc: '负路径：字符串字面量里的同款文本不算（行内引号奇偶）', src: "const tip = 'log.push({ factType: X })';", expect: {} },
    { n: 9, desc: '裸广播血量正例', src: "emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp });", expect: { 'bare-hp-change': 1 } },
    { n: 10, desc: '负路径：注释里的 emitEvent 不算', src: "// emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp });", expect: {} },
    { n: 11, desc: '负路径：已走入口 emitHpChange 不报', src: "emitHpChange(u, { role: 'x' });", expect: {} },
    { n: 12, desc: '负路径：别的 eventType 不误伤', src: "emitEvent(u, UNIT_EVENT_TYPES.POS_CHANGE, { pos: 3 });", expect: {} },
];

export function runSelfTest() {
    const fails = [];
    for (const t of SELFTESTS) {
        let got;
        try {
            const hits = scanSource(t.src);
            got = {};
            for (const [id, list] of Object.entries(hits)) got[id] = list.length;
        } catch (e) {
            fails.push({ n: t.n, desc: t.desc, why: '抛错：' + e.message });
            continue;
        }
        const want = t.expect;
        const keys = new Set([...Object.keys(got), ...Object.keys(want)]);
        for (const k of keys) {
            if ((got[k] || 0) !== (want[k] || 0)) {
                fails.push({ n: t.n, desc: t.desc, why: `${k}: 期望 ${want[k] || 0} 实得 ${got[k] || 0}` });
            }
        }
    }
    // 附加自证：基线比对器的三态（新增 / 不变 / 已还清）
    const fakeNow = { 'bare-fact-push': { 'a.js': [1, 2, 3], 'b.js': [1] } };
    const fakeBase = { rules: { 'bare-fact-push': { 'a.js': 2, 'c.js': 5 }, 'bare-hp-change': { 'd.js': 2 } } };
    const d = diffAgainstBaseline(fakeNow, fakeBase);
    const addOk = d.added.length === 2
        && d.added.some(x => x.file === 'a.js' && x.now === 3 && x.cap === 2)
        && d.added.some(x => x.file === 'b.js' && x.now === 1 && x.cap === 0);
    const paidOk = d.paid.some(x => x.file === 'c.js' && x.now === 0 && x.cap === 5)
        && d.paid.some(x => x.file === 'd.js' && x.now === 0 && x.cap === 2);
    if (!addOk) fails.push({ n: 13, desc: '基线比对：新增/无登记必须判为超限', why: JSON.stringify(d.added) });
    if (!paidOk) fails.push({ n: 14, desc: '基线比对：减少/清零必须判为已还清', why: JSON.stringify(d.paid) });

    return { total: SELFTESTS.length + 2, fails };
}

// ---------------------------------------------------------------------------
// 报告
// ---------------------------------------------------------------------------
function topDebt(byRule, limit) {
    const rows = [];
    for (const rule of RULES) {
        for (const [file, list] of Object.entries(byRule[rule.id] || {})) rows.push({ rule: rule.id, file, n: list.length });
    }
    rows.sort((a, b) => b.n - a.n);
    return rows.slice(0, limit);
}

function main() {
    const argv = process.argv.slice(2);
    const enforce = argv.includes('--enforce');
    const asJson = argv.includes('--json');
    const updateBaseline = argv.includes('--update-baseline');

    if (argv.includes('--selftest')) {
        const r = runSelfTest();
        for (const f of r.fails) console.log(`  ✗ [${f.n}] ${f.desc} → ${f.why}`);
        console.log(`自证断言 ${r.total} 条：${r.fails.length === 0 ? '全过' : `${r.fails.length} 条失败`}`);
        process.exit(r.fails.length === 0 ? 0 : 1);
    }

    const { files, byRule } = scanRepo();

    if (updateBaseline) {
        const baseline = buildBaseline(byRule);
        fs.writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2) + '\n', 'utf8');
        const total = RULES.reduce((s, r) => s + (byRule[r.id] ? Object.values(byRule[r.id]).reduce((a, l) => a + l.length, 0) : 0), 0);
        console.log(`基线已重写：tests/entry-path-baseline.json（${RULES.length} 条规则 / ${total} 处存量 / ${files} 个文件）`);
        process.exit(0);
    }

    const bl = loadBaseline();
    const diff = diffAgainstBaseline(byRule, bl.data);

    if (asJson) {
        console.log(JSON.stringify({ ver: VER, files, byRule, baselineError: bl.error, added: diff.added, paid: diff.paid }, null, 2));
        process.exit(enforce && (diff.added.length > 0 || bl.error) ? 1 : 0);
    }

    console.log(`════ 入口路径强制扫描 ${VER} ════`);
    console.log(`扫描 ${SCAN_DIRS.length} 个主代码目录 / ${files} 个文件 / ${RULES.length} 条规则`);
    let grand = 0;
    for (const rule of RULES) {
        const m = byRule[rule.id] || {};
        const n = Object.values(m).reduce((a, l) => a + l.length, 0);
        grand += n;
        console.log(`  ${rule.title.padEnd(10, '　')} : ${String(n).padStart(3)} 处 / ${String(Object.keys(m).length).padStart(2)} 文件`);
        console.log(`  ${''.padEnd(10, '　')}   正确入口 ${rule.entry}`);
    }
    console.log(`  合计存量${'　'.padEnd(4, '　')} : ${String(grand).padStart(3)} 处`);

    if (bl.error) console.log(`\n⚠ 基线问题：${bl.error}`);

    if (diff.added.length) {
        console.log(`\n❌ 新增违规 ${diff.added.length} 项（--enforce 判红）：`);
        for (const a of diff.added) {
            console.log(`  · [${a.rule}] ${a.file}  基线 ${a.cap} → 现在 ${a.now}`);
            for (const s of a.samples) console.log(`      L${s.line}  ${s.text}`);
        }
        const entryOf = Object.fromEntries(RULES.map(r => [r.id, r.entry]));
        console.log('  改法：删掉手写，改调对应入口 ——');
        for (const id of [...new Set(diff.added.map(a => a.rule))]) console.log(`    ${id} → ${entryOf[id]}`);
    } else {
        console.log('\n✓ 无新增违规');
    }

    if (diff.paid.length) {
        console.log(`\n↓ 已还清 ${diff.paid.length} 项（跑 --update-baseline 可收缩上限）：`);
        for (const p of diff.paid.slice(0, 10)) console.log(`  · [${p.rule}] ${p.file}  基线 ${p.cap} → ${p.now}`);
        if (diff.paid.length > 10) console.log(`  … 其余 ${diff.paid.length - 10} 项`);
    }

    const debt = topDebt(byRule, 5);
    if (debt.length) {
        console.log('\n欠账最多的 5 个文件（存量，非本轮新增）：');
        for (const d of debt) console.log(`  · ${d.file.padEnd(42)} ${d.rule.padEnd(16)} ${d.n} 处`);
    }

    const bad = diff.added.length > 0 || !!bl.error;
    console.log(`\nRESULT: ${bad ? (enforce ? 'FAIL' : 'WARN') : 'PASS'}（新增 ${diff.added.length} / 已还清 ${diff.paid.length} / 存量 ${grand}）`);
    process.exit(enforce && bad ? 1 : 0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) main();
