// V1.0.2 | 2026-11-08 迭代：修「变异表被当成手抄装配」的假红，并补两条负路径牙。
//   实证：上游 301 新增 import './302-elite-skills.js' 后，installed 动态扩面，
//   守门当场报 tests/mutation-teeth.mjs:311/377「手抄装配」——那两行其实是 MUTATIONS 里的
//   `file: 'modules/xxx.js'`（变异目标的**数据**），文件里连一个动态 import() 都没有，
//   真正装配发生在生成的 tests/.mut/drive.mjs。原判据 B 形态只看 rows>=2，任何含 ≥2 个
//   模块路径的数据表都会被一网打尽 ⇒ 上游每加一个模块就凭空多一片假红。
//   修法：B 形态额外要求全文存在「动态 import 且参数带插值/变量」的落地证据
//   （smoke-headless.mjs 的 `await import(`../${rel}`)` 形态）；A 形态（本行有 import 关键字）
//   判据一字未动，真手抄仍当场报红。判据强度只升不降。
// V1.0.1 | 2026-11-07 迭代：最后一个待迁移宿主 tests/rules-replay.mjs 已收口 ⇒ PENDING 清空。
//   守门机制保留（Map 为空时 ④ 自然空转，输出如实打「待迁移 无」），下次谁再手抄仍当场报红。
// V1.0.0 | 2026-11-06 新建：机制装配收口常驻守门（301 动态扩面 + 宿主扫描 + 装配探针 + 待迁移自收敛）
// tests/mechanics-install-selftest.mjs | V1.0.1 | 2026-11-07 体检迭代：机制装配收口常驻守门
//   V1.0.0 | 2026-11-06 新建。守住「离线宿主一律走 tests/_lib/install-mechanics.mjs」这条收口：
//     ① 从生产总入口 modules/301-reg-mechanics.js **动态读** import 清单（不手抄，301 增模块自动扩面），
//        递归扫 tests/ 下所有 .js/.mjs，凡直接装配这些模块的 import 语句一律报红；
//     ② 两个绑定入口（node helper / 浏览器 rule157 bundle）必须仍指向 301，防绑定本身烂掉；
//     ③ 真装配探针：离线 node 域动态装一次，验 MECHANIC_TYPES 全有 handler
//        （纯代码常量、不读 content，避开并行会话 WIP 造成假红）；157 只在浏览器体检域跑，离线缺这一层；
//     ④ 待迁移清单自收敛：他人维护文件登记在内只提示不擅改，一旦它改好而清单没删 = 清单腐烂，报红；
//     ⑤ 负路径自证：同一纯函数喂合成源码，确认手抄抓得到、注释/helper/301 不误伤。
//   纯 node 只读 + 一次轻量装配，零子进程、零网络；不碰主代码、不改任何既有判据。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VER = 'tests/mechanics-install-selftest.mjs V1.0.2';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = 'tests/mechanics-install-selftest.mjs';
const HELPER = 'tests/_lib/install-mechanics.mjs';
const BUNDLE = 'tests/health-rules/_mech-handler-bundle.mjs';
const PROD = 'modules/301-reg-mechanics.js';

// 只有这两个文件允许直接绑定 301：一个是离线宿主入口，一个是浏览器规则入口。
const DIRECT_301_ALLOWED = new Set([HELPER, BUNDLE]);

// 待迁移登记：他人并行维护，不擅改，只在报告里点名。★ 清单会自收敛，见下方 ④。
const PENDING = new Map([
    // 2026-11-07 清空：rules-replay.mjs 已改走 helper（V6.12.0）。
    // 若再有「他人并行维护、暂不擅改」的宿主，照原格式登记；改好后必须删行，否则 ④ 报清单腐烂。
]);

const read = p => fs.readFileSync(path.isAbsolute(p) ? p : path.join(root, p), 'utf8');

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === '.mut' || e.name === 'node_modules') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.(js|mjs)$/.test(e.name) && !/^(_tmp-|_verify)/.test(e.name)) out.push(p);
    }
    return out;
}

/** 生产总入口 import 了哪些机制模块（动态读，301 增模块自动扩面，绝不手抄第二份清单）。 */
function prodModules(src) {
    const set = new Set();
    for (const m of src.matchAll(/^\s*import\s+['"]\.\/([^'"]+\.js)['"]/gm)) set.add(m[1]);
    return set;
}

/** 找出「直接装配生产机制模块」的源码行，覆盖两种形态：
 *    A. 逐行 await import('../modules/xxx.js')（十几个回放宿主的原写法）；
 *    B. 字符串表驱动：toLoad 表里并列多个模块路径，循环里 await import(`../${rel}`)
 *       （无头 smoke 的写法；单看一行根本没有 import 关键字，靠「同文件 ≥2 个装配路径」识别）。
 *    排除：整行注释、块注释行、以及 read()/readFileSync() 读源码文本做静态分析的那类引用。
 */
function findDirectInstall(src, installed) {
    const rows = [];
    // V1.0.2：B 形态必须同时有「动态 import 且参数带插值/变量」的落地证据。
    //   否则 tests/mutation-teeth.mjs 里 23 条 `file: 'modules/xxx.js'`（纯变异目标数据）
    //   会被 rows>=2 全判成装配。注意 A 形态（行内有 import 关键字）不受此开关影响。
    const hasDynamicTable = /import\s*\(\s*(?:`[^`]*\$\{|[A-Za-z_$][\w$]*\s*\))/.test(src);
    src.split(/\r?\n/).forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith('*') || t.startsWith('/*')) return;
        const code = line.replace(/\/\/.*$/, '').trim();
        if (!code || /\bread(?:FileSync)?\s*\(/.test(code)) return;
        for (const m of code.matchAll(/['"]([^'"]*modules\/([^'"/]+\.js))['"]/g)) {
            if (installed.has(m[2])) {
                rows.push({ line: i + 1, spec: m[1], isImport: /\bimport\b/.test(code) });
            }
        }
    });
    const tableish = hasDynamicTable && rows.length >= 2; // B 形态：表驱动 + 真有动态 import 落地
    return rows.filter(r => r.isImport || tableish);
}

const fails = [];
const bad = msg => fails.push(msg);

// ① 生产总入口 + 两个绑定入口健康
let installed = new Set();
try {
    installed = prodModules(read(PROD));
    if (!installed.size) bad('生产总入口 ' + PROD + ' 解析出 0 个机制模块：清单被清空或写法变了，守门已失效');
} catch (e) {
    bad('读不到生产总入口 ' + PROD + '：' + e.message);
}
for (const [rel, label] of [[HELPER, 'node 宿主绑定入口'], [BUNDLE, '浏览器规则绑定入口']]) {
    try {
        const src = read(rel);
        if (!/import\s+['"][^'"]*(?:301-reg-mechanics\.js|install-mechanics\.mjs)['"]/.test(src)) {
            bad(label + ' ' + rel + ' 已不再绑定生产总入口 301（也不指向 helper）');
        }
    } catch (e) {
        bad(label + ' ' + rel + ' 缺失：' + e.message);
    }
}

// ② 禁止宿主手抄装配；顺手数已收口宿主
const seenPending = new Set();
let helperHosts = 0;
for (const abs of walk(path.join(root, 'tests'))) {
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (rel === SELF) continue; // 自指免扫：正文含路径常量与正则字面量
    const src = read(abs);
    // ② b 禁止「半收口」：除两个绑定入口外，任何 tests/ 文件不得自己直接 import 301，
    //    否则又多出一条没人守的装配链（本轮 stat-decl 上一版的写法即此类）。
    if (!DIRECT_301_ALLOWED.has(rel)
        && /import\s*(?:\(\s*)?['"][^'"]*301-reg-mechanics\.js['"]/.test(src)) {
        bad('绕过统一入口：' + rel + ' 直接 import 了 301 ⇒ 改成 await import(\'./_lib/install-mechanics.mjs\')');
    }
    // 只数真正 import 了 helper 的宿主（注释里提到路径不算，避免把编排器/文档算成宿主）
    if (/import\s*(?:\(\s*)?['"][^'"]*_lib\/install-mechanics\.mjs['"]/.test(src)) helperHosts++;
    const hits = findDirectInstall(src, installed);
    if (!hits.length) continue;
    if (PENDING.has(rel)) { seenPending.add(rel); continue; }
    for (const h of hits) {
        bad('手抄装配：' + rel + ':' + h.line + ' → ' + h.spec
            + ' ⇒ 改成 await import(\'./_lib/install-mechanics.mjs\')；301 增机制时手抄必漏');
    }
}
// ④ 待迁移清单自收敛
for (const rel of PENDING.keys()) {
    if (!seenPending.has(rel)) bad('待迁移清单腐烂：' + rel + ' 已无手抄装配，请把 PENDING 里这条删掉');
}

// ③ 真装配探针（离线域补 157 的空缺；不看 content，避开 WIP）
try {
    await import('./_lib/install-mechanics.mjs');
    const { MECHANIC_TYPES } = await import('../infra/106-battle-enums.js');
    const { getMechanicHandler } = await import('../core/219-mechanic-registry.js');
    const missing = Object.values(MECHANIC_TYPES).filter(t => typeof t === 'string' && !getMechanicHandler(t));
    if (missing.length) {
        bad('装配后机制 handler 缺失：' + missing.join(', ')
            + ' ⇒ ' + PROD + ' 漏 import 了注册这些 handler 的模块（宿主开局会整片静默崩）');
    }
} catch (e) {
    bad('真装配探针异常：' + (e && e.message) + ' ⇒ 装配链自身加载不了，不是 content 数据问题');
}

// ⑤ 负路径自证（同一个纯函数，合成源码正反样本）
const installedSample = new Set(['307-elite-imperial.js', '334-common-absorb.js']);
const pos = findDirectInstall([
    "await import('../modules/307-elite-imperial.js');",
    "await import('../modules/334-common-absorb.js');"
].join('\n'), installedSample);
if (pos.length !== 2) bad('负路径自证失败：A 形态手抄两行应抓到 2 处，实得 ' + pos.length);
const posTable = findDirectInstall([
    "const toLoad = {",
    "    emp: 'modules/307-elite-imperial.js',",
    "    custom: 'modules/334-common-absorb.js' // 副作用 import 说明",
    "};",
    "for (const [k, rel] of Object.entries(toLoad)) { mods[k] = await import(`../${rel}`); }"
].join('\n'), installedSample);
if (posTable.length !== 2) bad('负路径自证失败：B 形态字符串表应抓到 2 处，实得 ' + posTable.length);
// V1.0.2 新增牙：变异表样式（多条 file 字段 + 零动态 import）必须 0 命中。
const negMutationTable = findDirectInstall([
    "const MUTATIONS = [",
    "  { id: 'A17', file: 'modules/307-elite-imperial.js', from: 'a', to: 'b' },",
    "  { id: 'A21', file: 'modules/334-common-absorb.js', from: 'a', to: 'b' },",
    "  { id: 'A30', file: 'modules/302-elite-skills.js', from: 'a', to: 'b' },",
    "];"
].join('\n'), installedSample);
if (negMutationTable.length) bad('负路径自证失败：变异表 file 字段是数据不是装配，不该被判手抄，实得 ' + JSON.stringify(negMutationTable));
// V1.0.2 新增牙：只把「多个路径」堆在一起、没有动态 import 落地的普通数据表也不能算 B 形态。
const negPlainTable = findDirectInstall([
    "const MAP = {",
    "  a: 'modules/307-elite-imperial.js',",
    "  b: 'modules/334-common-absorb.js',",
    "};"
].join('\n'), installedSample);
if (negPlainTable.length) bad('负路径自证失败：无动态 import 的普通数据表不该被判手抄，实得 ' + JSON.stringify(negPlainTable));
const neg = findDirectInstall([
    "// await import('../modules/307-elite-imperial.js');",
    "await import('./_lib/install-mechanics.mjs');",
    "import '../../modules/301-reg-mechanics.js';",
    "const s = await read('../modules/307-elite-imperial.js');"
].join('\n'), new Set(['307-elite-imperial.js']));
if (neg.length) bad('负路径自证失败：注释/helper/总入口/读源码不该被判手抄，实得 ' + JSON.stringify(neg));

if (fails.length) {
    console.log('❌ 机制装配收口守门：' + fails.length + ' 项不一致');
    for (const f of fails) console.log('  - ' + f);
    console.log('RESULT: FAIL');
    process.exit(1);
}
console.log('✅ 机制装配收口守门：' + installed.size + ' 个生产机制模块统一由 ' + PROD + ' 装载');
console.log('  已收口宿主 ' + helperHosts + ' 个 · 无手抄装配 · 装配后 handler 齐全 · 待迁移 '
    + ([...PENDING.keys()].join(', ') || '无'));
console.log('RESULT: PASS');
