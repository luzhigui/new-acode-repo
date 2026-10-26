#!/usr/bin/env node
// tests/contract-binding-drift-selftest.mjs | V1.3.0 | 2026-10-27 夜间第 142 轮：薄取样档 ——
//   取样不为空但极小（如只 2 个 group）时 ③ 会把几十条「一次都没出现」报成 group 改名/撤除，
//   与第 141 轮收口的空取样是同一个洞；本轮把「空」的门槛从 0 抬到「静态 group 字面量的半数」，
//   薄取样且未识别到崩溃时**仍判失败**（防静默绿），另加 ④c 门槛自证
// tests/contract-binding-drift-selftest.mjs | V1.2.0 | 2026-10-27 夜间第 141 轮：空取样闸门 ——
//   ③ 的 56 条「group 一次都没出现」实为空取样所致，不再逐条报并误导成 group 改名；新增 ④ 自证两条
// tests/contract-binding-drift-selftest.mjs | V1.1.0 | 2026-10-27 夜间第 140 轮：新增判据 ⓪（对照器崩溃预检）
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

export const VER = 'tests/contract-binding-drift-selftest.mjs V1.3.0';

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

// 对照器崩溃标记（2026-10-27 夜间第 140 轮新增；由 scanLedgerGroups 填，供 ⓪ 判据使用）
let CRASH_FLAG = 0;
let CRASH_LINE = '';

// 崩溃行识别正则（第 141 轮抽成常量，供 ④b 自证）—— 它一旦失配，空取样就无法与真改名区分。
const CRASH_RE = /对照器异常|^\s*Error:|throw |台词池缺失|击杀台词池缺失/;
// scan-groups 行形如：`hlsJiuYangHeal | 61 |`（第 141 轮抽成常量，供 ④b 自证）
const GROUP_LINE_RE = /^([A-Za-z][A-Za-z0-9_]*)\s*\|\s*(\d+)\s*\|/gm;
// ④a 规模下限：主代码里静态抽出的 group 字面量个数。它是「运行时取样确实坏了」的对照基准 ——
//   静态侧明明有几十个 group，运行时却取样到 0 个，才能断言是取样坏了而非 group 真被撤光。
const MIN_GROUP_SOURCES = 20;

// 跑一次对照器 --scan-groups，取「账本里真的出现过哪些 group」
function scanLedgerGroups() {
    const r = spawnSync(process.execPath, [path.join(root, COMPARER), '--scan-groups'],
        { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const out = ((r.stdout || '') + '\n' + (r.stderr || ''));
    const seen = new Map();
    const re = new RegExp(GROUP_LINE_RE.source, 'gm');
    let m;
    while ((m = re.exec(out)) !== null) seen.set(m[1], Number(m[2]));
    // 2026-10-27 夜间第 140 轮新增：对照器崩 ⇒ 取样为空 ⇒ ③ 会把「恒空」误诊成「group 改名/撤除」。
    //   真因是主代码回归（小昭·姊职业改「蝴蝶」漏补 taunts 池，对照器 throw「台词池缺失」），
    // 与契约绑定毫无关系。故先把崩如实标出（存模块级变量，不污染 group 表本身），
    //   避免白天会话照着 56 条假诊断去改契约绑定。
    const crashLine = (out.split('\n').find(l => CRASH_RE.test(l)) || '').trim();
    CRASH_LINE = crashLine.slice(0, 160);
    CRASH_FLAG = crashLine ? 1 : 0;
    return seen;
}

const fails = [];
const notes = [];
// 空转不成立清单（2026-10-27 夜间第 141 轮新增）：取样为空时依赖该取样的结论既不是通过也不是失败，
//   而是「没得判」。此前 ③ 在取样为空时逐条报「group 一次都没出现」共 56 条，
//   把白天会话引向「查 group 是不是改名了」—— 指错方向，故单列一档，不计绿也不计红。
const vacuous = [];

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

// 取样是否够用（2026-10-27 夜间第 142 轮重构）：
//   空 —— 运行时取样到 0 个 group（第 141 轮已收口，此档下 ③ 一律标「不成立」）；
//   薄 —— 取样不为空，但少于「主代码里静态抽出的 group 字面量」的一半：
//         运行时只取到 2 个 group 时，剩下 50 多条契约的 group 全都会「一次都没出现」，
//         照 ③ 报出去就是几十条「group 改名/撤除」的假诊断，与空取样是同一个洞，只是体量小一点。
//         故第 142 轮把门槛从 0 抬到这里，空与薄统一按「取样不足」处置。
//   不另抄魔数：门槛由静态侧的 group 字面量个数推出，静态侧一变它就跟着动。
const THIN_GROUPS_MAX = Math.ceil(groupSources.size / 2);
const GROUPS_EMPTY = ledgerGroups.size === 0;
const GROUPS_THIN = ledgerGroups.size > 0 && ledgerGroups.size < THIN_GROUPS_MAX;
const GROUPS_INSUFFICIENT = GROUPS_EMPTY || GROUPS_THIN;
const GROUPS_STATE = GROUPS_EMPTY
    ? '运行时取样 0 个 group'
    : `运行时只取样到 ${ledgerGroups.size} 个 group（低于 ${THIN_GROUPS_MAX} 个的薄取样线，`
      + `静态侧主代码里却有 ${groupSources.size} 个 group 字面量）`;

let contractCount = 0;
let keyCount = 0;
let zeroDecl = 0;
let groupChecked = 0;
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
        groupChecked++;
        // 第 141 轮收口（空）+ 第 142 轮扩到薄取样：取样不足时每条都会「一次都没出现」，
        //   报出来是几十条同根因噪音，且会被误读成「group 改名/撤除」（指错方向）。
        //   统一收口到循环后的「③ 取样不足」一条；属薄取样且未识别到崩溃的那支仍判失败（见下）。
        if (!GROUPS_INSUFFICIENT && !ledgerGroups.has(g)) {
            fails.push(`③ 契约 ${id} 绑定的账本 group 「${g}」在标准样本的账本里一次都没出现`
                + ' —— group 被改名/撤除，或该机制本场不出场 ⇒ 实际侧恒空，比对永远比不到东西');
        }
    }
}

// ③ 取样不足收口（第 141 轮立、第 142 轮扩到薄取样）—— 三岔：
//   空/薄 + 崩已知 ⇒ 标「不成立」（不计绿也不计红），真因在 ⓪，红由 ⓪ 兜住；
//   空/薄 + 崩未知 ⇒ **仍判失败**，绝不凭空放行 —— 否则取样器一坏，③ 就永久静默。
//   薄取样这一支是第 142 轮补的：此前它会被 ③ 逐条报成「group 改名/撤除」，几十条同根因假诊断。
if (GROUPS_INSUFFICIENT) {
    if (CRASH_FLAG) {
        vacuous.push(`③ ${groupChecked} 条契约的账本 group 非空校验不成立 —— ${GROUPS_STATE}，`
            + '逐条「一次都没出现」是**取样不足**所致，不是 group 改名/撤除（真因见 ⓪）');
    } else {
        fails.push(`③ 账本 group 取样不足（${GROUPS_STATE}），且未识别到崩溃行`
            + ` —— ${groupChecked} 条契约的 group 此刻大半查不到，既可能是 group 真被改名/撤除，`
            + '也可能是 --scan-groups 取样面塌了**却没崩**（比崩更隐蔽：它会一路报绿）；'
            + '本支与空取样同判为失败，必查，不逐条报以免同根因噪音淹没真因');
    }
}

if (CRASH_FLAG) {
    fails.push('⓪ 对照器本次根本没跑完（异常中断）：' + CRASH_LINE
        + ' —— ③ 的「group 一次都没出现」是**空取样**造成的假诊断（真因是主代码回归，非 group 改名），'
        + '先修对照器崩这一条，再谈绑定键漂移');
}

if (contractCount < MIN_CONTRACTS) {
    fails.push(`⓪ 只切出 ${contractCount} 条契约，低于下限 ${MIN_CONTRACTS} —— 对照器结构可能变了，本自检结果不可信`);
}

if (!fails.length) {
    notes.push(`① ${contractCount} 条契约共 ${keyCount} 个绑定键，逐个到主代码全库核存在性 —— 无一漂移`);
    notes.push(`② 契约引用的 FACT_TYPES 全部存在于 infra/56 枚举（${enumMap.size} 项）`);
    if (!GROUPS_INSUFFICIENT) {
        notes.push(`③ ${groupChecked} 条契约的账本 group 全部在标准样本账本里实测出现过`
            + `（共 ${ledgerGroups.size} 个 group，远高于 ${THIN_GROUPS_MAX} 个的薄取样线）`);
    }
}

// ④ 自证断言（2026-10-27 夜间第 141 轮新增）—— 本线自己的抽取器与闸门腐烂时，先把自己报红：
//   ④a 静态 group 字面量抽取必须非空 —— 它是「运行时取样确实坏了」的对照基准；一旦抽不出，
//       「静态侧有 group、运行时 0 个」这个论断就不成立，③ 的空取样收口也随之失去依据。
//   ④b 崩溃正则与 scan-groups 行解析器必须在合成样本上命中 —— 任一腐烂，
//       空取样与「group 真被改名/撤除」就无从区分，③ 的结论不再可信。
{
    if (groupSources.size < MIN_GROUP_SOURCES) {
        fails.push(`④a 主代码里只抽出 ${groupSources.size} 个 group 字面量，低于下限 ${MIN_GROUP_SOURCES} —— `
            + '抽取器已腐烂，「运行时取样坏了」失去对照基准，③ 的空取样收口不再可信（先修本文件）');
    } else {
        notes.push(`④a 静态侧抽出 ${groupSources.size} 个 group 字面量（下限 ${MIN_GROUP_SOURCES}）—— `
            + '可作为「运行时取样是否坏了」的对照基准');
    }

    const synthCrash = '对照器异常： Error: 台词池缺失: 小昭·姊';
    const synthGroup = 'hlsJiuYangHeal | 61 |';
    const okCrash = CRASH_RE.test(synthCrash);
    const okGroup = new RegExp(GROUP_LINE_RE.source, 'gm').test(synthGroup);
    if (!okCrash || !okGroup) {
        fails.push(`④b 合成样本自证失败（崩溃正则${okCrash ? '命中' : '失配'} / `
            + `group 行解析${okGroup ? '命中' : '失配'}）—— 空取样与真改名将无从区分，`
            + '③ 的结论不再可信（先修本文件，不是主代码）');
    } else {
        notes.push('④b 崩溃正则与 group 行解析器在合成样本上均命中 —— 取样不足可与真改名区分');
    }

    // ④c（2026-10-27 夜间第 142 轮新增）—— 薄取样门槛本身必须站得住：
    //   门槛为 0 ⇒ ③ 退回「取样只剩 2 个 group 也照样逐条判改名」的老洞；
    //   门槛 ≥ 静态 group 字面量总数 ⇒ 任何取样都算「薄」，③ 从此永不判、等于被静默拆掉。
    if (!(THIN_GROUPS_MAX > 0 && THIN_GROUPS_MAX < groupSources.size)) {
        fails.push(`④c 薄取样门槛 ${THIN_GROUPS_MAX} 失位（须满足 0 < 门槛 < 静态 group 字面量 ${groupSources.size}）`
            + ' —— 门槛为 0 则③ 退回「极少量取样也逐条判改名」的老洞；'
            + '门槛 ≥ 静态 group 总数则③ 从此永不判、等于被静默拆掉（先修本文件的常量，不是主代码）');
    } else {
        notes.push(`④c 薄取样门槛 ${THIN_GROUPS_MAX} 个落在合理区间（0 < ${THIN_GROUPS_MAX} < ${groupSources.size}）`
            + ' —— ③ 既不恒错判改名也不恒虚');
    }
}

for (const n of notes) console.log('  ✅ ' + n);
for (const v of vacuous) console.log('  ⚠️  ' + v);
if (fails.length) {
    console.log(`\n❌ 契约绑定键漂移自检失败 ${fails.length} 项`
        + (vacuous.length ? `（另有 ${vacuous.length} 项因取样不足**不成立**，不计绿也不计红）` : '') + '：');
    for (const f of fails) console.log('  ❌ ' + f);
    process.exit(1);
}
console.log(`\n✅ 契约绑定键漂移自检通过（${notes.length}/${notes.length} 项断言：绑定键存在性 / FACT_TYPES 枚举一致性 / 账本 group 实测非空 / 自证三条）`);
process.exit(0);
