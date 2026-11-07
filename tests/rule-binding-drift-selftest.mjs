#!/usr/bin/env node
// tests/rule-binding-drift-selftest.mjs | V1.1.0 | 2026-11-07 第 186 棒（体检侧·MiniMax）：名表补收 content/characters 的角色名键（修「附身于 张无忌」误报）
//
// 背景（为什么要有它，务必先读）：
//   第 128 轮在**账本契约侧**抓出一个真·假绿：HLS_JIUYANG_HEAL 绑的 label 在主代码里零命中，
//   声明侧恒 0 ⇒ 严格比对恒 0 ⇒ 那个"偏差 0"是没得比、不是比过了没偏差。同一轮为此立了
//   contract-binding-drift-selftest 并留了下轮目标：**这条口径要横向铺到规则侧**——
//   tests/health-rules/*.js 里的判据同样大量靠**中文字面量**认领战报文本（初扫 416 条中文字面量），
//   一旦主代码文案改名而规则没跟上，规则就会静默失守（要么恒空转、要么恒绿），且**回放数字一模一样**、肉眼撞不见。
//
// 难点与口径（第 128 轮点名"噪声大，需先设计抽取口径再落地"，本轮就是来交这份设计的）：
//   416 条中文字面量里绝大多数是注释、规则名、报错文案，**不是**判据匹配键；照单全收必然误报刷屏。
//   故本自检只抽「判据匹配位」上的字面量，抽取四步：
//     ① 先剥注释（// 与 /* */，且保留字符串与正则字面量原样，避免把注释里的词当成判据键）；
//     ② 只取匹配位：比较（=== / !== / == / !=）、包含（includes / indexOf / startsWith / endsWith）、
//        switch case、new RegExp('…')，以及**正则字面量里的中文片段**（长度 ≥ 2）；
//     ③ 只要含中文的键（纯 ASCII 键另有用例，暂不在本自检口径内，避免噪声）；
//     ④ 三类免检（都不静默放行，逐个写明理由并留痕，见下方 ASSIST 注释）：
//        A 模板拼装 —— 键里含角色名（来自 content / core 配置），去掉名字后**剩余碎片全部命中语料**
//          ⇒ 说明主代码是 `受${zhouName}激励` 这类拼出来的，整串零命中属正常，不是漂移；
//        B 规则自身文案 —— 抽取行原文含 problems.push / msg: / name: ⇒ 那是规则自己的报错文案或规则名，
//          不是去主代码里认领战报的判据键（只作用于正则片段类，比较位提取的键不受此免检）；
//        C 反向哨兵（显式白名单）—— 键**故意**要零命中：主代码一旦真的出现，规则就该报红（如 137 的
//          「+0攻」「自身三倍」是判"占位未过滤/文案回退"的复发信号）。白名单按棘轮只许收缩：
//          条目里的键若已从规则中消失 ⇒ 判失败（防白名单腐烂）。
//
// 与既有自检的分工：contract-binding-drift-selftest 盯「账本契约 ↔ 主代码」的接线，
//   本自检盯「回归规则 ↔ 主代码」的接线；两者都只保证"接线没松"，**不能**证明该规则真能抓住那颗牙
//   （后者只有跑变异树才能回答）。
//
// 用法：node tests/rule-binding-drift-selftest.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripCommentsMapped } from './_lib/static-truth-slice.mjs';
import { readIfAbs } from './_lib/read-if-abs.mjs';

export const VER = 'tests/rule-binding-drift-selftest.mjs V1.1.0';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const RULE_DIR = path.join(root, 'tests', 'health-rules');
// 主代码口径：战报文本与角色名的产出方（含 content 数据；不含 tests/ 自身、不含 tools/）
const CORPUS_DIRS = ['core', 'modules', 'render', 'player', 'ui', 'fx', 'infra', 'content'];
// 规模下限：低于此值说明抽取口径失效或规则被批量删除 ⇒ 自检结果不可信
const MIN_RULE_FILES = 40;
const MIN_KEYS = 100;

// C 反向哨兵白名单（只许收缩：条目必须仍在规则里出现，否则判失败）
const SENTINEL_KEYS = [
    { key: '+0攻', why: '137 苦练提示的复发信号：主代码若真出现「+0攻」即占位 fact 未过滤，规则本就该报红 ⇒ 零命中才是正确状态' },
    { key: '+0防', why: '同上，137 的另一半复发信号' },
    { key: '自身三倍', why: '137 判 V6.1.8 文案回退（当前应为「自身双倍」），出现即判复发 ⇒ 零命中才是正确状态' },
    { key: '已叠0/', why: '125 坚盾计数的复发信号（_fortifyThisRound 未更新就读取）⇒ 出现即判复发，零命中才是正确状态' }
];

// D 兼容 / 变异点保留键（只许收缩：条目必须仍在规则里出现，否则判失败）
const COMPAT_KEYS = [
    { key: '互换位置！', why: '166 mOld 旧格式分支：主代码 render 现行只发「位置重排！」，此键为兼容 + 变异牙齿回退变异点，零命中预期' },
    { key: '可用单位不足', why: '166 failReason 白名单：core/14 现行只发 未触发/无变化，此 reason 已退役；兼容 + 变异点' }
];

// --- ① 剥注释：保留字符串与正则字面量原样 ---
// ★ V1.1.0 起**不再是手写第二份**：转发公共件 tests/_lib/static-truth-slice.mjs 的
//   stripCommentsMapped（唯一来源，第 151 轮上提）。原实现原样搬进公共件，行为一字未变；
//   本文件只留薄封装，目的是让「口径只有一份」这件事被 auditStripCopies 机械守住。
function stripComments(src) {
    const { code, owner, lineOf } = stripCommentsMapped(src);
    return { code, owner, lineOf };
}

const HAS_CN = /[\u4e00-\u9fa5]/;

// 抽取行的上下文窗口（±2 行）：报错文案常跨行拼接（problems.push / msg: 在上一行、字面量在下一行）
function windowAround(lines, ln) {
    const from = Math.max(1, ln - 2), to = Math.min(lines.length, ln + 2);
    return lines.slice(from - 1, to).join('\n');
}

// --- ② 只取匹配位上的字面量 ---
function extractKeys(code, owner, lineOf, rawLines) {
    const out = [];
    const cmpPats = [
        { re: /[!=]==?\s*'([^']*)'/g, how: '比较' },
        { re: /[!=]==?\s*"([^"]*)"/g, how: '比较' },
        { re: /\.(?:includes|indexOf|startsWith|endsWith)\(\s*'([^']*)'/g, how: '包含' },
        { re: /\.(?:includes|indexOf|startsWith|endsWith)\(\s*"([^"]*)"/g, how: '包含' },
        { re: /case\s+'([^']*)'\s*:/g, how: '分支' },
        { re: /new RegExp\(\s*'([^']*)'/g, how: '正则' }
    ];
    for (const p of cmpPats) {
        let m;
        while ((m = p.re.exec(code)) !== null) {
            const at = owner[m.index + m[0].indexOf(m[1])] || 0;
            out.push({ key: m[1], how: p.how, line: lineOf(at), raw: rawLines[lineOf(at) - 1] || '',
                win: windowAround(rawLines, lineOf(at)) });
        }
    }
    // 正则字面量里的中文片段
    const reLit = /\/(?:\\.|\[(?:\\.|[^\]])*\]|[^\/\\\n])+\/[gimsuy]*/g;
    let m2;
    while ((m2 = reLit.exec(code)) !== null) {
        const body = m2[0].replace(/^\//, '').replace(/\/[gimsuy]*$/, '');
        const runs = body.match(/[\u4e00-\u9fa5][\u4e00-\u9fa5·、，！：]*/g) || [];
        const at = owner[m2.index] || 0;
        const ln = lineOf(at);
        for (const r of runs) {
            if (r.length >= 2) out.push({ key: r, how: '正则片段', line: ln, raw: rawLines[ln - 1] || '',
                win: windowAround(rawLines, ln) });
        }
    }
    return out;
}

// --- 语料 ---
function collectCorpus() {
    const parts = [];
    for (const d of CORPUS_DIRS) {
        const base = path.join(root, d);
        if (!fs.existsSync(base)) continue;
        const stack = [base];
        while (stack.length) {
            const cur = stack.pop();
            let ents = [];
            try { ents = fs.readdirSync(cur, { withFileTypes: true }); } catch (e) { continue; }
            for (const e of ents) {
                const full = path.join(cur, e.name);
                if (e.isDirectory()) stack.push(full);
                else if (e.isFile() && /\.(js|json)$/.test(e.name)) parts.push(readIfAbs(full));
            }
        }
    }
    return parts.join('\n');
}

// --- A 模板拼装：配置名表 ---
//   = ① content / core 里 "name" / "character" 字段的**值**（机制名、技能名）
//   + ② content/*.json 里 characters 对象的**键**（角色名）
// V1.1.0 补 ②：病由是「角色名在 content 里是对象的键，不是字段的值」。
//   content/001-game-data.json 的 characters 长这样：{ "周芷若": {...}, "张无忌": {...} } ——
//   角色名挂在键上；而旧口径只收 "name"/"character" 字段的**值** ⇒ 名表实测 100 条里
//   **一个角色名都没有**（张无忌 / 殷天正 / 小昭 全查不到）。
//   后果：像 143 的「附身于 张无忌」这种「主代码拼 前缀+角色名」的判据键，零命中会被自检
//   当成「真·假绿」报红。可主代码并没改名 —— render/409-facts-control.js 的文案是
//   `化为蝴蝶附身于 ${fact.hostName}！`，运行时确实会拼出「附身于 张无忌」，规则没写错。
//   ⇒ 是名表漏了角色名，不是判据失守。这条红是**自检自己误报**，必须从名表这边修。
//   实测（补进 67 个角色名后）：新增免检 2 条（143 的 carry：张无忌 / 附身于 张无忌，
//   都是真·模板拼装）、**误伤 0 条**、其余零命中全被既有免检兜住。
function collectRoleNames() {
    const names = new Set();
    const base = path.join(root, 'content');
    if (!fs.existsSync(base)) return names;
    const stack = [base];
    while (stack.length) {
        const cur = stack.pop();
        let ents = [];
        try { ents = fs.readdirSync(cur, { withFileTypes: true }); } catch (e) { continue; }
        for (const e of ents) {
            const full = path.join(cur, e.name);
            if (e.isDirectory()) { stack.push(full); continue; }
            if (!/\.json$/.test(e.name)) continue;
            const raw = readIfAbs(full);
            if (!raw) continue;
            let j;
            try { j = JSON.parse(raw); } catch { continue; }
            const chars = j && j.characters;
            if (!chars || typeof chars !== 'object' || Array.isArray(chars)) continue;
            for (const k of Object.keys(chars)) if (HAS_CN.test(k) && k.length >= 2) names.add(k);
        }
    }
    return names;
}
function collectCharNames() {
    const names = new Set();
    const dirs = ['content', 'core'];
    for (const d of dirs) {
        const base = path.join(root, d);
        if (!fs.existsSync(base)) continue;
        const stack = [base];
        while (stack.length) {
            const cur = stack.pop();
            let ents = [];
            try { ents = fs.readdirSync(cur, { withFileTypes: true }); } catch (e) { continue; }
            for (const e of ents) {
                const full = path.join(cur, e.name);
                if (e.isDirectory()) { stack.push(full); continue; }
                if (!/\.(js|json)$/.test(e.name)) continue;
                const src = readIfAbs(full);
                const re = /"(?:name|character)"\s*:\s*"([^"]+)"/g;
                let m;
                while ((m = re.exec(src)) !== null) if (HAS_CN.test(m[1]) && m[1].length >= 2) names.add(m[1]);
            }
        }
    }
    for (const k of collectRoleNames()) names.add(k);
    return names;
}

const fails = [];
const notes = [];
const exempt = [];

const corpus = collectCorpus();
if (!corpus) { console.error('❌ 主代码语料为空 —— 目录清单可能变了：' + CORPUS_DIRS.join('/')); process.exit(1); }
const charNames = [...collectCharNames()].sort((a, b) => b.length - a.length);

const files = fs.readdirSync(RULE_DIR).filter(f => f.endsWith('.js')).sort();
const seen = new Map(); // key -> { files:Set, how, line, raw }
let rawCount = 0;
for (const f of files) {
    const src = readIfAbs(path.join(RULE_DIR, f));
    if (!src) continue;
    const rawLines = src.split(/\r?\n/);
    const { code, owner, lineOf } = stripComments(src);
    for (const it of extractKeys(code, owner, lineOf, rawLines)) {
        if (!HAS_CN.test(it.key)) continue;
        rawCount++;
        if (!seen.has(it.key)) seen.set(it.key, { files: new Set(), how: it.how, line: it.line, raw: it.raw, win: it.win });
        seen.get(it.key).files.add(f);
    }
}

// 逐个键判定
let checked = 0;
for (const [key, meta] of [...seen.entries()].sort()) {
    if (corpus.includes(key)) { checked++; continue; }
    const where = [...meta.files].join(',') + ':' + meta.line;
    // A 模板拼装
    let assembled = false;
    for (const nm of charNames) {
        if (!key.includes(nm)) continue;
        const rest = key.split(nm).filter(Boolean);
        if (rest.length && rest.every(fr => corpus.includes(fr))) {
            exempt.push(`A 模板拼装「${key}」—— 含配置名「${nm}」，去掉后碎片 [${rest.join(' | ')}] 全在语料里 ⇒ 主代码为拼接产出，零命中属正常`);
            assembled = true; break;
        }
    }
    if (assembled) continue;
    // B 规则自身文案（只作用于正则片段类，比较位提取的键不受此免检）
    if (meta.how === '正则片段' && /problems\.push|msg:|name:|fail:\s*true/.test(meta.win || '')) {
        exempt.push(`B 规则自身文案「${key}」—— 抽取行上下是规则自己的报错/规则名（${where}），不是去主代码认领战报的判据键`);
        continue;
    }
    // C 反向哨兵白名单
    const s = SENTINEL_KEYS.find(x => x.key === key);
    if (s) { exempt.push(`C 反向哨兵「${key}」—— ${s.why}`); continue; }
    const c2 = COMPAT_KEYS.find(x => x.key === key);
    if (c2) { exempt.push('D 兼容/变异点保留「' + key + '」—— ' + c2.why); continue; }
    fails.push(`判据键「${key}」在主代码语料里**零命中**（${meta.how} · ${where}）`
        + ' —— 规则靠这个字面量认领战报，主代码文案已改名/撤除 ⇒ 该判据恒不命中（恒空转或恒绿），属真·假绿');
    checked++;
}

// 棘轮：白名单条目必须仍在规则里出现（防白名单腐烂）
for (const s of SENTINEL_KEYS) {
    if (!seen.has(s.key)) fails.push(`⓪ 反向哨兵白名单里的「${s.key}」已在规则中消失 —— 条目已失效，请从白名单移除（白名单只许收缩）`);
}
for (const c of COMPAT_KEYS) {
    if (!seen.has(c.key)) fails.push('⏭ 兼容/变异点键「' + c.key + '」已在规则中消失，请从 COMPAT_KEYS 移除（只许收缩）');
}

const cnKeys = seen.size;
// 角色名表下限：名表漏了角色名 ⇒ 免检 A 失效 ⇒ 模板拼装型判据键被误报成「真·假绿」。
//   （V1.1.0 修的就是这个：旧名表 100 条、一个角色名都没有。）这道闸门防它再悄悄塌回去 ——
//   content 的 characters 结构若改名/搬家，角色名会静默变 0 条 ⇒ 免检 A 整片失效 ⇒
//   误报会以「判据失守」的名义卷土重来，而那时没人知道是名表空了。
const MIN_ROLE_NAMES = 50;
const roleNames = collectRoleNames();
if (roleNames.size < MIN_ROLE_NAMES) {
    fails.push(`⓪ 角色名表只收到 ${roleNames.size} 条（下限 ${MIN_ROLE_NAMES}）—— content 的 characters 段`
        + '可能改名/搬家/格式变了 ⇒ 免检 A（模板拼装）整片失效，模板拼装型判据键会被误报成「真·假绿」');
}
if (files.length < MIN_RULE_FILES) fails.push(`⓪ 只扫到 ${files.length} 个规则文件，低于下限 ${MIN_RULE_FILES} —— 目录可能变了，本自检结果不可信`);
if (cnKeys < MIN_KEYS) fails.push(`⓪ 只抽到 ${cnKeys} 个中文判据键，低于下限 ${MIN_KEYS} —— 抽取口径可能失效（静默恒绿），本自检结果不可信`);

if (!fails.length) {
    notes.push(`抽取口径：${files.length} 个规则文件 → ${cnKeys} 个中文判据键（匹配位 ${rawCount} 处），逐键到主代码语料核存在性 —— 无一漂移`);
    notes.push(`免检 ${exempt.length} 条（A 模板拼装 / B 规则自身文案 / C 反向哨兵），逐条留痕如下`);
    notes.push(`模板拼装免检用的名表：共 ${charNames.length} 条（其中角色名 ${roleNames.size} 条来自 content/*.json 的 characters 键`
        + ' —— 不收这批，143 的「附身于 张无忌」类键会被误报成「真·假绿」）');
    notes.push(`棘轮：反向哨兵白名单 ${SENTINEL_KEYS.length} 条全部仍在规则中出现（只许收缩，不得新增）`);
}

for (const n of notes) console.log('  ✅ ' + n);
for (const e of exempt) console.log('  ⏭  ' + e);
if (fails.length) {
    console.log(`\n❌ 规则绑定键漂移自检失败 ${fails.length} 项：`);
    for (const f of fails) console.log('  ❌ ' + f);
    process.exit(1);
}
console.log(`\n✅ 规则绑定键漂移自检通过（${notes.length}/${notes.length} 项断言：抽取规模 / 判据键存在性 / 白名单棘轮）`);
process.exit(0);
