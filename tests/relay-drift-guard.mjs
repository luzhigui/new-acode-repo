// V1.1.0 | 2026-11-07 第二棒（MiniMax）迭代：指纹口径补两处漏 + 排除体检自产产物
//   ① 体检自产产物不计入指纹：tests/baselines/*.json 每次跑体检都被自动重写（内容含
//      generatedAt 时间戳）⇒ 旧口径下「跑一次体检指纹就变」，而这个守门的全部意义是
//      「指纹变了 = 有人动过同一批文件」。实测：跑一次 xinhun 定向用例，指纹从
//      RELAY-69658c54ae2f 变成 RELAY-1eca046d1c3d，人一个字符没改 —— 信号被自己稀释掉了。
//      改法：baselines/ 里的文件照旧列出来（看得见），但不进指纹。
//   ② 补一枚主代码指纹：旧口径只扫 tests/，而体检的规则是**对着主代码跑的** —— 主代码在动
//      （本轮实测 core/modules/render/player + index.html/manifest.json 全在改，还新增了
//      modules/390-rewind-core.js、ui/726-rewind-panel.js）时，tests/ 指纹纹丝不动，
//      下一棒看不到「基线已经漂了」。改法：另出一枚 RELAY-MAIN-<指纹>，覆盖 tests/ 之外的全部改动。
//   ③ 冲突标记扫描同步扩到主代码侧：主代码里留冲突标记同样没人喊。
// V1.0.0 | 2026-11-07 新建：并行接力漂移守门（冲突残留硬红 + 工作树指纹显形）
// tests/relay-drift-guard.mjs | V1.1.0 | 2026-11-07 体检迭代：并行接力漂移守门
//   （第 187 棒监督小账：本登记行原仍写 V1.0.0，与 V1.1.0 的头注/VER 常量不一致。
//    ver-bump 取「头注最高版本」，第 1 行 V1.1.0 已压住它 ⇒ 绊线不会咬，但登记行腐烂会
//    让版本履历看着像停在旧版。此处补齐，不改任何判据、不抬 VER。）
//
// ★ 立它的由头（2026-11-07 用户引入第二个体检会话后，当天就出现的真实现场）：
//    下午 MiniMax 提交了 5 笔（含 150/151 回血判据、121/122/141/142/148），
//    我上一轮的 16 个改动仍未提交，两份成果混在同一份工作树里，
//    而 25 项体检没有任何一项会喊「这里有人改过但没交接」或「合并冲突没解干净」。
//    ⇒ 并行最难的不是改代码，是**下一棒不知道上一棒停在哪**。
//
// ★ 本件只管两件事，刻意不重复别人的判据：
//    ① 硬红（确定性缺陷）：tests/ 源码里残留 git 冲突标记、或 git 报未解决冲突。
//       这类残留不炸也不红，只是让规则悄悄跑在半截代码上，是双人改同一文件最典型的烂尾。
//    ② 显形（不判红、不改任何判据）：列出 tests/ 下未提交改动，并算一枚「工作树指纹」。
//       当前体检跑的是工作树、不是 HEAD；下一棒若从 HEAD 起步，看不到这些改动就会重复劳动
//       甚至互相覆盖。指纹交给接力方核对：变了就说明有人动过同一批文件，须先对齐再动手。
//    ★ 不抄 ver-bump / ver-drift / orphan-sweep 的任何逻辑；它们管版本与清单，本件管交接。
//
// 用法：node tests/relay-drift-guard.mjs            每轮随体检秒级跑（纯只读）
//       node tests/relay-drift-guard.mjs --selftest  纯函数正负路径自证，不读工作树

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const VER = 'tests/relay-drift-guard.mjs V1.1.0';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const SKIP_DIR = new Set(['.mut', '.git', 'node_modules', '.handoff']);
const SUFFIX = /\.(?:js|mjs|json|html|txt|md)$/i;
const RE_UNRESOLVED = /^(?:UU|AA|DD|AU|UA|DU|UD)$/;
// 体检自产产物：跑体检会自己重写（内容带时间戳）⇒ 列出来但**不计入指纹**
const RE_AUTO_GEN = /^tests\/baselines\//;
// 主代码侧目录（V1.1.0）：冲突标记扫描要覆盖到
const MAIN_DIRS = ['core', 'modules', 'render', 'player', 'ui', 'fx', 'infra', 'content'];

/** 只认行首的合并冲突标记：注释里提到、字符串里含、markdown 分隔线都不算。 */
export function findConflictMarkers(rel, src) {
    const hits = [];
    src.split(/\r?\n/).forEach((line, i) => {
        if (/^(?:<<<<<<< |>>>>>>> )/.test(line)) {
            hits.push({ rel, line: i + 1, text: line.trim().slice(0, 80) });
        }
    });
    return hits;
}

/** 与文件顺序无关、任一文件内容变一格即变；给下一棒核对工作树用。 */
export function fingerprint(entries) {
    const s = entries.slice()
        .sort((a, b) => a.rel.localeCompare(b.rel))
        .map(e => e.rel + ':' + e.hash)
        .join('\n');
    return crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
}

function walk(dir, out = []) {
    for (const name of fs.readdirSync(dir)) {
        if (SKIP_DIR.has(name)) continue;
        const abs = path.join(dir, name);
        let st;
        try { st = fs.statSync(abs); } catch { continue; }
        if (st.isDirectory()) walk(abs, out);
        else if (SUFFIX.test(name)) out.push(abs);
    }
    return out;
}

function fileHash(rel) {
    try {
        return crypto.createHash('sha256')
            .update(fs.readFileSync(path.join(REPO, rel)))
            .digest('hex').slice(0, 16);
    } catch { return '-'; }
}

/**
 * 把 git status --porcelain 的行拆成四类（纯函数，自检可直接打桩）：
 *   unresolved —— 未解决冲突（硬红）
 *   pending    —— tests/ 侧的真实改动，**计入** tests/ 指纹
 *   autoGen    —— tests/baselines/ 下的体检自产产物，列出来但**不计入**指纹
 *   mainPending—— tests/ 之外的主代码侧改动，计入 MAIN 指纹
 */
export function classifyRows(rows) {
    const unresolved = [], pending = [], autoGen = [], mainPending = [];
    for (const row of rows) {
        const code = row.slice(0, 2);
        const rel = row.slice(3).trim().replace(/^"|"$/g, '');
        if (!rel) continue;
        if (RE_UNRESOLVED.test(code)) { unresolved.push(`${code} ${rel}`); continue; }
        if (code === '  ') continue;                       // 未改动
        if (rel.startsWith('tests/')) {
            if (RE_AUTO_GEN.test(rel)) autoGen.push(rel);  // 体检自产：跑一次就变，不进指纹
            else pending.push(rel);
        } else {
            mainPending.push(rel);
        }
    }
    return { unresolved, pending, autoGen, mainPending };
}

function selftest() {
    const cases = [
        ['真冲突残留（两侧标记）', 'const a=1;\n<<<<<<< HEAD\nconst a=2;\n>>>>>>> minimax\n', 2],
        ['只残留一侧也要抓', '<<<<<<< HEAD\nconst a=1;\n', 1],
        ['注释里提到不算', '// <<<<<<< HEAD 是合并标记示例\nconst a=1;\n', 0],
        ['Markdown 分隔线不算', '标题\n=======\n正文\n', 0],
        ['正常代码', 'export const A = 1;\n', 0]
    ];
    let bad = 0;
    console.log('=== 并行接力漂移守门 · 自证 ===');
    for (const [name, src, want] of cases) {
        const got = findConflictMarkers('x.js', src).length;
        const ok = got === want;
        if (!ok) bad++;
        console.log(`  ${ok ? '✅' : '❌'} ${name} → ${got} 处（期望 ${want}）`);
    }
    const e1 = [{ rel: 'b.js', hash: 'bb' }, { rel: 'a.js', hash: 'aa' }];
    const e2 = [{ rel: 'a.js', hash: 'aa' }, { rel: 'b.js', hash: 'bb' }];
    const e3 = [{ rel: 'a.js', hash: 'aa' }, { rel: 'b.js', hash: 'cc' }];
    const f1 = fingerprint(e1);
    const fpOk = f1 === fingerprint(e2) && f1 !== fingerprint(e3);
    if (!fpOk) bad++;
    console.log(`  ${fpOk ? '✅' : '❌'} 指纹与顺序无关、改一字即变（${f1}）`);

    // V1.1.0：四类拆分的正负路径
    const rows = [
        ' M tests/rule-binding-drift-selftest.mjs',   // tests 真实改动 → pending
        '?? tests/relay-drift-guard.mjs',             // 未跟踪新增 → pending
        ' M tests/baselines/xinhun-death-case.json',  // 体检自产 → autoGen（不进指纹）
        ' M core/204-buff-system.js',                 // 主代码 → mainPending
        '?? modules/390-rewind-core.js',              // 主代码新增 → mainPending
        'UU tests/conflicted.js',                     // 未解决冲突 → unresolved
        '   tests/clean.js'                           // 未改动 → 忽略
    ];
    const c = classifyRows(rows);
    const splitCases = [
        ['tests 真实改动进 pending', c.pending.length === 2 && c.pending.includes('tests/rule-binding-drift-selftest.mjs')],
        ['体检自产产物归 autoGen', c.autoGen.length === 1 && c.autoGen[0] === 'tests/baselines/xinhun-death-case.json'],
        ['主代码改动归 mainPending', c.mainPending.length === 2 && c.mainPending.includes('modules/390-rewind-core.js')],
        ['未解决冲突单独归类', c.unresolved.length === 1],
        ['自产产物不进 tests 指纹', !c.pending.includes('tests/baselines/xinhun-death-case.json')]
    ];
    for (const [name, ok] of splitCases) {
        if (!ok) bad++;
        console.log(`  ${ok ? '✅' : '❌'} ${name}`);
    }
    // 指纹稳定性：只含自产产物时，tests 指纹应为空集（不随体检运行而变）
    const onlyAuto = fingerprint(c.autoGen.map(rel => ({ rel, hash: 'x' })));
    console.log(`  ℹ 说明：自产产物若进指纹，指针会随每次体检运行而变（实测 RELAY-69658c54ae2f → RELAY-1eca046d1c3d）；现口径下其指纹=${onlyAuto}`);

    console.log(bad ? `RESULT: FAIL（${bad} 条自证不符）` : 'RESULT: PASS（' + (6 + splitCases.length) + ' 条自证全过）');
    process.exit(bad ? 1 : 0);
}

if (process.argv.includes('--selftest')) selftest();

const files = walk(HERE);
const mainFiles = [];
for (const d of MAIN_DIRS) {
    const base = path.join(REPO, d);
    if (fs.existsSync(base)) mainFiles.push(...walk(base));
}
const markers = [];
for (const abs of files.concat(mainFiles)) {
    let src;
    try { src = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    const rel = path.relative(REPO, abs).replace(/\\/g, '/');
    markers.push(...findConflictMarkers(rel, src));
}

const gs = spawnSync('git', ['-c', 'core.quotepath=false', 'status', '--porcelain'], {
    cwd: REPO, encoding: 'utf8', timeout: 15000, windowsHide: true
});
const gitOk = gs.status === 0 && !gs.error;
const rows = gitOk ? String(gs.stdout || '').split(/\r?\n/).filter(Boolean) : [];
const { unresolved, pending, autoGen, mainPending } = classifyRows(rows);

const ok = markers.length === 0 && unresolved.length === 0;
console.log('=== 并行接力漂移守门（双人接力防打架）===');
console.log(`  扫 ${files.length} 个 tests/ 文件 + ${mainFiles.length} 个主代码文件 · 冲突标记残留 ${markers.length} 处 · 未解决冲突 ${unresolved.length} 个`);
for (const m of markers.slice(0, 10)) console.log(`  ❌ ${m.rel}:${m.line} ${m.text}`);
for (const u of unresolved.slice(0, 10)) console.log('  ❌ 未解决 ' + u);
if (gitOk) {
    console.log(`  ℹ tests/ 未提交改动 ${pending.length} 个 —— 当前体检跑的是工作树，不是 HEAD`);
    for (const rel of pending.slice(0, 20)) console.log(`     - ${rel}  ${fileHash(rel)}`);
    if (pending.length > 20) console.log(`     ... 其余 ${pending.length - 20} 个略`);
    if (autoGen.length) {
        console.log(`  ℹ 体检自产产物 ${autoGen.length} 个（跑体检即重写，不计入指纹）: ${autoGen.join(', ')}`);
    }
    const fp = fingerprint(pending.map(rel => ({ rel, hash: fileHash(rel) })));
    console.log(`  ℹ 工作树指纹 RELAY-${fp} —— 交接给下一棒核对；变了说明有人动过同一批文件`);
    if (mainPending.length) {
        console.log(`  ℹ 主代码侧未提交改动 ${mainPending.length} 个 —— 体检的规则是对着主代码跑的，主代码变了基线一样漂：`);
        for (const rel of mainPending.slice(0, 20)) console.log(`     - ${rel}  ${fileHash(rel)}`);
        if (mainPending.length > 20) console.log(`     ... 其余 ${mainPending.length - 20} 个略`);
        const mfp = fingerprint(mainPending.map(rel => ({ rel, hash: fileHash(rel) })));
        console.log(`  ℹ 主代码指纹 RELAY-MAIN-${mfp} —— 下一棒开工先核这一枚`);
    } else {
        console.log('  ℹ 主代码侧无未提交改动（RELAY-MAIN-空）');
    }
} else {
    console.log('  ℹ 非 git 工作树或 git 不可用 ⇒ 跳过漂移显形，冲突标记扫描仍然有效');
}
if (!ok) console.log('  ⇒ 先把合并冲突解干净再跑体检；不要改本守门的判据来刷绿');
console.log(ok ? 'RESULT: PASS' : 'RESULT: FAIL');
process.exit(ok ? 0 : 1);
