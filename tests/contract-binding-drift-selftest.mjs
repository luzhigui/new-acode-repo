#!/usr/bin/env node
// tests/contract-binding-drift-selftest.mjs | V1.0.0 | 2026-10-24 第 128 轮
//
// 背景（本轮最硬的一条，务必先读）：
//   第 127 轮把「恒空转契约 2 条（178 条账本词条无人比对）」立成待办，定性是"样本未覆盖该形态"，
//   由白名单棘轮钉住等拍板。本轮取证发现：**其中一条根本不是样本问题，是契约自己过期了**——
//     HLS_JIUYANG_HEAL 绑定 label === '九阳神拳回复'，而主代码实际发的是 '左拳·九阳回复'
//     （modules/27elite-mingjiao-hanlisa.js L80）。全库检索 '九阳神拳回复' **零命中**。
//     ⇒ 声明侧恒 0 ⇒ 严格比对恒 0 ⇒ 那个"偏差 0"是**没得比**，不是"比过了没偏差"：
//     账本 group「hlsJiuYangHeal」的 61 条词条一条都没被盯住，改错也查不出 —— 真·假绿。
//   这与第 99 轮 NINE_YANG_HEAL 是**同一款缺陷**（引擎迁通道后契约仍绑旧键），
//   说明"契约绑定键漂移"是一个**会复发的类别**，不是个案。故本文件把它做成常驻自检并计退码。
//
// 自检三条（全部离线、秒级；③ 需跑一次对照器取样，约 3 秒，不跑变异树）：
//   ① 绑定键存在性（静态）—— 逐契约扫出它靠哪些**字面量**认领声明（形如 `d.label !== 'X'`、
//      `data.skillName === 'Y'`、`text.indexOf('Z')`），再拿去主代码全库核存在性。
//      任一绑定键在主代码里**零命中** ⇒ 该契约必然恒空转（守不住任何牙）⇒ 判失败。
//   ② FACT_TYPES 枚举存在性（静态）—— 契约引用的 FACT_TYPES.X 必须在 infra/56 枚举里存在；
//      若枚举值不等于契约 group，说明归属错位（读到的声明与账本隔离口径对不上）⇒ 判失败。
//      （注：枚举值与 group 属两套命名空间，历史上本就**不必**相等；本项只在"契约自己
//        引用了 FACT_TYPES 常量"时才校验，且错位判定以对照器既有约定为准，
//        首轮实测已确认无错位 ⇒ 该项当前为空操作，用于防未来接线松动。）
//   ③ 账本 group 实际侧非空（运行时）—— 每个契约绑定的 group 必须在标准样本的账本里
//      真的出现过词条（取自对照器 --scan-groups 的实测行）。group 被改名或撤除
//      ⇒ 实际侧恒空 ⇒ 比对永远比不到东西 ⇒ 判失败。
//
// 局限（如实写）：本自检只能保证"契约跟主代码之间的接线没松"——键还在、指得到东西。
//   它**不能**证明"该契约真能抓住这颗牙"，后者只有全量跑 46 棵变异树（约 6 分半）才能回答。
//   与 contract-guard-selftest 互补：那边盯"契约表还在 / 干净树零命中 / 恒空转棘轮"，
//   这边盯"接线没松"。
//
// 用法：node tests/contract-binding-drift-selftest.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const VER = 'tests/contract-binding-drift-selftest.mjs V1.0.0';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const COMPARER = 'tests/stat-decl-vs-actual-check.mjs';
const ENUM_FILE = path.join(root, 'infra', '56-battle-enums.js');
// 主代码口径：tests/ 之外的一切 js（含 core / modules / render / player / ui / fx / infra）
const MAIN_DIRS = ['core', 'modules', 'render', 'player', 'ui', 'fx', 'infra'];
// ① 规模下限：低于此值说明 CONTRACTS 切块失败或契约被批量删除，自检结果不可信
const MIN_CONTRACTS = 50;
// ① 绑定键白名单：这些键在主代码里本就不是字面量（由配置/常量拼出），属已知的例外，
//    逐个写明理由。白名单只允许收缩，不允许新增。
const KNOWN_ABSENT_KEYS = [];

function readIfAbs(p) {
    try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; }
}

function collectMainCorpus() {
    const parts = [];
    for (const d of MAIN_DIRS) {
        const base = path.join(root, d);
        if (!fs.existsSync(base)) continue;
        const stack = [base];
        while (stack.length) {
            const cur = stack.pop();
            let ents = [];
            try { ents = fs.readdirSync(cur, { withFileTypes: true }); } catch (e) { continue; }
            for (const ent of ents) {
                const full = path.join(cur, ent.name);
                if (ent.isDirectory()) stack.push(full);
                else if (ent.isFile() && ent.name.endsWith('.js')) parts.push(readIfAbs(full));
            }
        }
    }
    return parts.join('\n');
}

// 切出 CONTRACTS 数组区域：从 `const CONTRACTS = [` 到行首 `];`
function sliceContractsRegion(src) {
    const start = src.indexOf('const CONTRACTS = [');
    if (start < 0) return '';
    const m = /\n\];/.exec(src.slice(start));
    const end = m ? start + m.index + m[0].length : src.length;
    return src.slice(start, end);
}

// 按顶层 `    {` 切块（CONTRACTS 内每个契约对象都是 4 空格缩进的 `{`）
function splitContractChunks(region) {
    const idx = [];
    const re = /^    \{\s*$/gm;
    let m;
    while ((m = re.exec(region)) !== null) idx.push(m.index);
    const chunks = [];
    for (let i = 0; i < idx.length; i++) {
        chunks.push(region.slice(idx[i], i + 1 < idx.length ? idx[i + 1] : region.length));
    }
    return chunks;
}

// 抽取绑定键：形如 `d.label !== 'X'` / `data.skillName === 'Y'` / `text.indexOf('Z')`
function extractBindingKeys(chunk) {
    const out = [];
    // 两种写法都要收：`d.label !== 'X'`（形参名 d）与 `f.data.label !== 'X'`（直取载荷）
    const re = /(?:\.|\b)(?:d|data)\.([A-Za-z_]+)\s*[!=]==?\s*'([^']*)'|indexOf\(\s*'([^']*)'\s*\)/g;
    let m;
    while ((m = re.exec(chunk)) !== null) {
        const field = m[1] || 'text';
        const key = m[2] !== undefined ? m[2] : m[3];
        if (key === undefined || key === '') continue;
        out.push({ field, key });
    }
    return out;
}

function parseFactTypesEnum(src) {
    const enumIdx = src.indexOf('export const FACT_TYPES');
    const at = enumIdx >= 0 ? enumIdx : src.indexOf('FACT_TYPES');
    if (at < 0) return new Map();
    const braceStart = src.indexOf('{', at);
    if (braceStart < 0) return new Map();
    let depth = 0, end = braceStart;
    for (let i = braceStart; i < src.length; i++) {
        const ch = src[i];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    const body = src.slice(braceStart, end);
    const map = new Map();
    const re = /([A-Z][A-Z_0-9]*)\s*:\s*'([^']*)'/g;
    let m;
    while ((m = re.exec(body)) !== null) map.set(m[1], m[2]);
    return map;
}

// 跑一次对照器 --scan-groups，取「账本里真的出现过哪些 group」
function scanLedgerGroups() {
    const r = spawnSync(process.execPath, [path.join(root, COMPARER), '--scan-groups'],
        { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const out = ((r.stdout || '') + '\n' + (r.stderr || ''));
    const seen = new Map();
    const re = /^([A-Za-z][A-Za-z0-9_]*)\s*\|\s*(\d+)\s*\|/gm;
    let m;
    while ((m = re.exec(out)) !== null) seen.set(m[1], Number(m[2]));
    return seen;
}

const fails = [];
const notes = [];

const comparerSrc = readIfAbs(path.join(root, COMPARER));
if (!comparerSrc) {
    console.error('❌ 读不到对照器源码：' + COMPARER);
    process.exit(1);
}
const region = sliceContractsRegion(comparerSrc);
const chunks = splitContractChunks(region);
if (!chunks.length) {
    console.error('❌ CONTRACTS 区域没切出任何契约块 —— 对照器结构可能变了');
    process.exit(1);
}

const corpus = collectMainCorpus();
if (!corpus) {
    console.error('❌ 主代码语料为空 —— 目录清单可能变了：' + MAIN_DIRS.join('/'));
    process.exit(1);
}
const enumMap = parseFactTypesEnum(readIfAbs(ENUM_FILE));
const ledgerGroups = scanLedgerGroups();

// ② 需要的 group 来源两种写法：`group: 'xxx'`（addMod）与 `recordHpAudit(u,'xxx',…)`（hp 记账）
const groupSources = new Set();
{
    const re = /group\s*:\s*'([^']*)'/g;
    let m;
    while ((m = re.exec(corpus)) !== null) groupSources.add(m[1]);
    const re2 = /recordHpAudit\s*\([^,()]+,\s*'([^']*)'/g;
    while ((m = re2.exec(corpus)) !== null) groupSources.add(m[1]);
}

let contractCount = 0;
let keyCount = 0;
let zeroDecl = 0;
for (const chunk of chunks) {
    const idm = /id:\s*'([^']+)'/.exec(chunk);
    if (!idm) continue;
    const id = idm[1];
    contractCount++;

    // ① 绑定键存在性
    for (const b of extractBindingKeys(chunk)) {
        keyCount++;
        if (corpus.includes(b.key)) continue;
        if (KNOWN_ABSENT_KEYS.includes(b.key)) continue;
        fails.push(`① 契约 ${id} 的绑定键 ${b.field} = '${b.key}' 在主代码全库**零命中**`
            + ' —— 契约绑的键已被改名或撤除 ⇒ 该契约声明侧恒 0、严格比对恒 0，'
            + '守着的账本词条一条都比对不上（"偏差 0"是没得比、不是比过了没偏差）⇒ 真·假绿');
    }

    // ② FACT_TYPES 枚举存在性
    const ft = new Set();
    const fre = /FACT_TYPES\.([A-Z][A-Z_0-9]*)/g;
    let mm;
    while ((mm = fre.exec(chunk)) !== null) ft.add(mm[1]);
    for (const k of ft) {
        if (!enumMap.has(k)) {
            fails.push(`② 契约 ${id} 引用 FACT_TYPES.${k}，但 infra/56 枚举里没有这一项 —— 引用已失效`);
        }
    }

    // ③ 账本 group 实际侧非空
    const gm = /group\s*:\s*'([^']+)'/.exec(chunk);
    if (gm) {
        const g = gm[1];
        if (!ledgerGroups.has(g)) {
            fails.push(`③ 契约 ${id} 绑定的账本 group 「${g}」在标准样本的账本里一次都没出现`
                + ' —— group 被改名/撤除，或该机制本场不出场 ⇒ 实际侧恒空，比对永远比不到东西');
        }
    }
}

if (contractCount < MIN_CONTRACTS) {
    fails.push(`⓪ 只切出 ${contractCount} 条契约，低于下限 ${MIN_CONTRACTS} —— 对照器结构可能变了，本自检结果不可信`);
}

if (!fails.length) {
    notes.push(`① ${contractCount} 条契约共 ${keyCount} 个绑定键，逐个到主代码全库核存在性 —— 无一漂移`);
    notes.push(`② 契约引用的 FACT_TYPES 全部存在于 infra/56 枚举（${enumMap.size} 项）`);
    notes.push(`③ ${contractCount} 条契约的账本 group 全部在标准样本账本里实测出现过（共 ${ledgerGroups.size} 个 group）`);
}

for (const n of notes) console.log('  ✅ ' + n);
if (fails.length) {
    console.log(`\n❌ 契约绑定键漂移自检失败 ${fails.length} 项：`);
    for (const f of fails) console.log('  ❌ ' + f);
    process.exit(1);
}
console.log(`\n✅ 契约绑定键漂移自检通过（${notes.length}/${notes.length} 项断言：绑定键存在性 / FACT_TYPES 枚举一致性 / 账本 group 实测非空）`);
process.exit(0);
