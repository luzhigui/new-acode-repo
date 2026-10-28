// tests/_lib/static-truth-slice.mjs | V1.1.0 | 2026-10-28 夜间第 146 轮：新增第五样东西
//   ⑤ auditAnchorSites —— 给「在源文件里正则抠锚点」这一类取样做同一个体检：
//      这个锚点到底落在真代码里，还是只活在注释里？
//      背景（本轮第三/第四个受体的发现点）：param-read-guard 报「命中 getSkillParams 的文件 N 个」，
//      这个 N 是用 `code.replace(/\/\/.*$/gm,'')` 算的 —— 一条只认行注释、不认块注释、也不认字符串
//      里 // 的野路子。它与同文件真正做抽取的 maskLiterals 是**两套口径**：同一个文件，可能被算进
//      「命中」却在抽取侧一个读取点都提取不出来。
//      ★ 这正是第 144 轮那条病换了个皮：不是"文本切片混进別的枚举"，而是
//        "报告口径掺进了注释这种第二种写法"。本轮牙B2 已实证：给一个无关文件加一行块注释，
//        旧口径立刻从 21 虚高到 22，而没人能从报告里看出那一处是假的。
// V1.0.0 | 2026-10-27 夜间第 145 轮：把第 144 轮在
//   fact-coverage-selftest 里**现写的一次性**「静态真值口径审计」（构成归属 / 同名重复 /
//   真值对照 / 独立第三路径）抽成公共件，供所有"用文本切片假装静态真值"的自检复用。
//
// 为什么要抽（第 144 轮自己点名的下轮优先，本轮兑现）：
//   第 144 轮在 fact-coverage-selftest 里抓到：它号称取的是 infra/56 的 FACT_TYPES，
//   实际用 `src.slice(src.indexOf('FACT_TYPES'), src.indexOf('MECHANIC_TYPES'))` 切——
//   这两个标识之间隔着 BUFF_TYPES / STAGE_ACTION_TYPES / BUFF_EFFECT_TYPES / FLY_MODE_TYPES
//   四个别的枚举，于是 145 条里有 54 条是外来的，其中 16 条还与 FACT_TYPES 同名 ⇒ 同一条被计两次。
//   结论：长期被引用的「悬空引用 7 类」里只有 1 类是真的。
//   ★ 同一款病在别处也在（本轮第二个受体 fact-dead-field-scan 已实证）：凡**用两段锚点切文本**
//     或**用一条平铺正则扫全文件**去取"某个枚举的真值面"的自检，都活得在"下一个同名枚举出现"
//     的风险里。三处各写一份就是三份口径，将来改一处忘两处 = 新分叉。故抽成唯一来源，
//     判据一字不改，只换存放位置（行为等价性由本轮的验牙反证）。
//
// 本件提供的四样东西：
//   ① stripComments / codeMask    —— 把注释从"写法=证据"的取样面里剔出去（保字符串与模板串不被误删）；
//   ② parseEnumBlocks             —— **按所有权**解析 `export const X = Object.freeze({...})` 块；
//   ③ attributeSlice / auditSlice —— 给"文本切片"做体检：构成归属、外来者、同名重复、与真值口径的差集、独立第三路径；
//   ④ auditValueMap               —— 给"值→常量名"平铺映射做体检：跨枚举值冲突、外来条目、所有权真值表。
//
// 用法：
//   const blocks = parseEnumBlocks(src);
//   const a = auditSlice({ src, from: 'FACT_TYPES', to: 'MECHANIC_TYPES', owner: 'FACT_TYPES', truthKeys: Object.keys(FACT_TYPES) });
//   const v = auditValueMap(blocks, 'FACT_TYPES');
//   for (const bad of selfCheck()) fails.push('静态真值口径公共件自证：' + bad);
// V1.3.0 | 2026-10-29 夜间第 152 轮：★ 收口判据**真正落盘**（isClosedOnTruth + RE_IMPORT_TRUTH）
//   —— 第 151 轮在日志里写下"判据收紧为只认 import 语句"，但收紧**没进提交**：本轮开场
//     git show d1dd14a0 复核，RE_IMPORT_TRUTH 只存在于日志散文，代码里仍是第一版宽口径
//     /static-truth-slice/.test(src)（它自己诊断出的"形同虚设"那一版）。
//     本轮开场牙A 复现：删掉受体A 的真 import、只在注释里留公共件路径 ⇒ 普查仍报
//     "已收口 2 条 / PASS"，机制确实一路漏着。收紧后同一口牙报 4 项。
//   ★ 判据 = 在**剥掉注释之后的源码**里存在 import ... from '...static-truth-slice...' 语句。
//     两个条件各咬一款病：① 必须是 import 语句（不能只是"文件里出现过这个字样"）；
//     ② 必须在剥注释之后匹配（否则注释里抄一句完整 import 照样骗过去）。
//   ★ 并给判据本身加了自证⑯⑰⑱ —— 因为这一款的病不是"没想收紧"，而是"以为收紧了"：
//     把口径钉进自证，谁把它退回宽口径，自证立刻报。
// V1.2.0 | 2026-10-28 夜间第 151 轮：新增 ⑥ stripCommentsMapped / auditStripCopies
//   —— 收「手写第二份去注释」这一款病（本仓库第四次发作）：
//     tests 下曾同时存在三份各写一遍的剥注释实现（_lib/rule-branch-extract 的
//     stripCommentsKeepStrings、rule-binding-drift-selftest 的 stripComments（带行号映射）、
//     123static-scan.js 的 stripComments）。三份口径互不相同：
//       · rule-branch-extract 那份会把**多行块注释连同换行一起吃掉**（行结构塌陷）；
//       · 只有 rule-binding-drift 那份识别**正则字面量**（公共件 stripComments 的已知边界）。
//     ⇒ 一处收紧、另一处没跟，就是"同一份源码在两个自检里取样面不同"的幽灵事件，
//       而两边都报绿，谁也看不出来。本轮把带映射+正则感知那一版上提为公共件唯一来源，
//       两个 .mjs 受体改为复用；123static-scan.js 因被浏览器页面直接 import（121health-monitor
//       跑在页面里），改 import 会影响线上页面，故**点名挂账待拍板**，不擅自收口。
//   ★ 为什么不动 stripComments 让它也带正则感知：那会一次性改变 5 个既有受体的取样面，
//     属"顺手改判据"。本轮只做收口，stripComments 一字未动（差异已实测并点名，见 audit 输出）。
//
// 本件提供的五样东西：
//   ① stripComments / codeMask    —— 把注释从"写法=证据"的取样面里剔出去（保字符串与模板串不被误删）；
//   ② parseEnumBlocks             —— **按所有权**解析 `export const X = Object.freeze({...})` 块；
//   ③ attributeSlice / auditSlice —— 给"文本切片"做体检：构成归属、外来者、同名重复、与真值口径的差集、独立第三路径；
//   ④ auditValueMap               —— 给"值→常量名"平铺映射做体检：跨枚举值冲突、外来条目、所有权真值表；
//   ⑤ auditAnchorSites            —— 锚点落在真代码里还是只活在注释里；
//   ⑥ stripCommentsMapped / auditStripCopies —— 带行号映射的剥注释（含正则字面量感知）+「第二份快照」点名与棘轮。
export const VER = 'tests/_lib/static-truth-slice.mjs V1.3.0';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// ① 注释清除：把注释原文清掉，但**保住字符串 / 模板串里长得像注释的东西**。
//    为什么必须自己写而不是去找已有实现：123static-scan 里有一份同类函数，但它是浏览器模块的一部分，
//    tests 侧暂无可复用的导出。更重要的是本件要能自证，故连同自证件一起放进同一个文件。
//    ★ 已知边界：正则字面量里的 // 或 /* 会被误判成注释起点（本仓自检消费的源码里尚无此写法；
//      真出现时表现为"某行被整行判成注释"，属**少收**而非**错判**，且只影响"干净口径"这一路对照，
//      不影响任何既有原口径结论）。
// ---------------------------------------------------------------------------
export function stripComments(code) {
    const out = [];
    let mode = 'code'; // code | line | block | sq | dq | tpl
    for (let i = 0; i < code.length; i++) {
        const c = code[i], d = code[i + 1];
        if (mode === 'code') {
            if (c === '/' && d === '/') { mode = 'line'; i++; continue; }
            if (c === '/' && d === '*') { mode = 'block'; i++; out.push(' '); continue; }
            if (c === "'") { mode = 'sq'; out.push(c); continue; }
            if (c === '"') { mode = 'dq'; out.push(c); continue; }
            if (c === '`') { mode = 'tpl'; out.push(c); continue; }
            out.push(c); continue;
        }
        if (mode === 'line') {
            if (c === '\n') { mode = 'code'; out.push(c); }
            continue;
        }
        if (mode === 'block') {
            if (c === '*' && d === '/') { mode = 'code'; i++; out.push(' '); continue; }
            if (c === '\n') out.push(c);
            continue;
        }
        out.push(c);
        if (c === '\\') { if (i + 1 < code.length) { out.push(code[i + 1]); i++; } continue; }
        if (mode === 'sq' && c === "'") { mode = 'code'; continue; }
        if (mode === 'dq' && c === '"') { mode = 'code'; continue; }
        if (mode === 'tpl' && c === '`') { mode = 'code'; continue; }
    }
    return out.join('');
}

// 逐行标注：'code' = 该行有非空白的真代码；'comment' = 该行除注释外无代码。
//   用途：不必在"要不要整篇 stripComments"上赌——整篇 strip 会改动列偏移与行结构，
//   而取回原文件里的"证据片段"需要**行号对齐**，故这里只按行打标签，由调用方决定要不要跳过注释行。
export function codeMask(code) {
    const lines = code.split('\n');
    const marks = new Array(lines.length).fill('comment');
    let mode = 'code';
    let li = 0;
    const note = (t) => { if (marks[li] === 'comment' || t === 'code') marks[li] = t; };
    for (let i = 0; i < code.length; i++) {
        const c = code[i], d = code[i + 1];
        if (c === '\n') { li++; if (mode === 'line') mode = 'code'; continue; }
        if (mode === 'code') {
            if (c === '/' && d === '/') { mode = 'line'; i++; continue; }
            if (c === '/' && d === '*') { mode = 'block'; i++; continue; }
            if (c === "'") { mode = 'sq'; note('code'); continue; }
            if (c === '"') { mode = 'dq'; note('code'); continue; }
            if (c === '`') { mode = 'tpl'; note('code'); continue; }
            if (c.trim() !== '') note('code');
            continue;
        }
        if (mode === 'line') { continue; }
        if (mode === 'block') { if (c === '*' && d === '/') { mode = 'code'; i++; } continue; }
        if (c === '\\') { i++; continue; }
        if (mode === 'sq' && c === "'") mode = 'code';
        if (mode === 'dq' && c === '"') mode = 'code';
        if (mode === 'tpl' && c === '`') mode = 'code';
    }
    // 单 '\n' 分支里 mode 重置发生在下一次循环，这里补齐最后一行的边界
    return marks;
}

// ---------------------------------------------------------------------------
// ⑥-a 带映射的剥注释（唯一来源）：与 stripComments 只差两点
//   ① 返回 { code, owner, lineOf }：调用方要按**原文行号**回指（报错行号、抽取行上下文窗口靠它）；
//   ② 额外识别**正则字面量**，避免把正则里的 // 或 /* 当注释起点（stripComments 的已知边界）。
//   ★ 来源 = tests/rule-binding-drift-selftest.mjs 那份手写实现，本轮原样上提、行为一字不变；
//     该文件改为 import 本函数，手写第二份随之消失（由 auditStripCopies 守着不许再长回来）。
//   ★ 保行结构：块注释里的换行**逐个保留**（out 里按原下标 push '\n'），
//     这与 rule-branch-extract 旧手写版"连换行一起吃掉"不同 —— 那版会让多行块注释之后
//     的行号整体塌陷一截，抽取侧按行号回指时就会指错行。
export function stripCommentsMapped(src) {
    let out = '';
    const owner = [];
    let i = 0; const n = src.length;
    let state = 'code'; let prevSig = '';
    const push = (ch, idx) => { out += ch; owner.push(idx); };
    while (i < n) {
        const c = src[i], d = src[i + 1];
        if (state === 'code') {
            if (c === '/' && d === '/') { state = 'line'; i += 2; continue; }
            if (c === '/' && d === '*') { state = 'block'; i += 2; continue; }
            if (c === "'" || c === '"' || c === '`') {
                const q = c; push(c, i); i++;
                while (i < n) {
                    const ch = src[i];
                    if (ch === '\\') { push(ch, i); if (i + 1 < n) push(src[i + 1], i + 1); i += 2; continue; }
                    push(ch, i); i++;
                    if (ch === q) break;
                }
                prevSig = ')';
                continue;
            }
            if (c === '/' && '(,=:[!&|?{;'.includes(prevSig)) {
                let j = i + 1; let inClass = false;
                while (j < n) {
                    const ch = src[j];
                    if (ch === '\\') { j += 2; continue; }
                    if (ch === '[') inClass = true;
                    else if (ch === ']') inClass = false;
                    else if (ch === '/' && !inClass) break;
                    else if (ch === '\n') break;
                    j++;
                }
                for (let k = i; k <= j && k < n; k++) push(src[k], k);
                i = j + 1; prevSig = ')';
                continue;
            }
            push(c, i); i++;
            if (!' \t\r\n'.includes(c)) prevSig = c;
            continue;
        }
        if (state === 'line') { if (c === '\n') { state = 'code'; push('\n', i); } i++; continue; }
        if (c === '*' && d === '/') { state = 'code'; i += 2; continue; }
        if (c === '\n') push('\n', i);
        i++;
    }
    const lineStart = [0];
    for (let k = 0; k < src.length; k++) if (src[k] === '\n') lineStart.push(k + 1);
    const lineOf = (idx) => {
        let lo = 0, hi = lineStart.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStart[mid] <= idx) lo = mid; else hi = mid - 1; }
        return lo + 1;
    };
    return { code: out, owner, lineOf };
}

// ---------------------------------------------------------------------------
// ⑥-b 「第二份快照」点名与棘轮：把"以后还会不会再写一份"这件事关掉
//   规则（机械可验，不靠自觉）：
//     扫 tests/ 下所有 .js/.mjs，找**剥注释/串掩码类的本地函数定义**（按函数名匹配）；
//     · 命中文件 == 本公共件 ⇒ 唯一来源本身，不计；
//     · 命中文件 import 了本公共件 ⇒ 视为已收口（转发/复用），计入"已收口"；
//     · 其余 ⇒ **第二份快照（未收口）**，逐条点名；条数受棘轮上限约束，新增即报。
//   ★ 与第 150 轮同一句话：机制负责关掉污染，点名负责把关掉了什么（以及还剩什么）打印出来 ——
//     否则哪天又抄一份，报告依旧绿，那就是静默复发。
// ---------------------------------------------------------------------------
const RE_STRIP_DEF = /^\s*(?:export\s+)?(?:async\s+)?function\s+(stripComments\w*|stripComment\w*|maskStrings\w*)\s*\(/gm;

// ---------------------------------------------------------------------------
// ⑥-c 「已收口」判据（★ 第 152 轮收紧；第 151 轮**声称**已收紧、代码里却没落盘，见下）
//   判据 = 在**剥掉注释之后的源码**里，存在 import ... from '...static-truth-slice...' 语句。
//   两个条件缺一不可，各咬一款病：
//     ① 必须是 import 语句，不能只是"文件里出现过这个字样"
//        —— 否则注释里提一句公共件路径就被判成"已收口"（第 151 轮牙A 实证，本轮复现）；
//     ② 必须在**剥注释之后**匹配
//        —— 否则注释里抄一句完整 import 照样被判成"已收口"（同款病的变体）。
//   ★ 这正是本件自己的老本行：第 149 轮立的规矩就是"注释里的东西不算真值"，
//     而 auditStripCopies 第一版偏偏没给自己用上 —— 机制自己踩了机制要防的那款病。
//   ★ 已知边界：剥注释用的是 stripCommentsMapped（带正则感知，公共件内的唯一来源）。
//     若某文件的正则里含 // 且其后真 import 被误判进注释，本判据会判成"未收口"
//     —— **少收不是错收**：表现为该收口的没计入 closed，属安全方向；
//     绝不会把未收口误判成已收口（后者才是机制失效）。
// ---------------------------------------------------------------------------
const RE_IMPORT_TRUTH = /(?:^|\n)[ \t]*import\s[\s\S]{0,300}?\bfrom\s*['"][^'"]*static-truth-slice[^'"]*['"]/;
/** 是否已在剥注释后的源码里 import 了本公共件（收口判据的唯一来源，改这里要同步改自证⑯⑰⑱） */
export function isClosedOnTruth(src) {
    return RE_IMPORT_TRUTH.test(stripCommentsMapped(src).code);
}

/** 已收口/豁免登记表（唯一来源）：改这里必须写 why，且条数只减不增 */
export const STRIP_COPY_ALLOWLIST = [
    { file: '123static-scan.js', why: '浏览器双用：tests/121health-monitor.js 在页面里 import 它，改成 import 本公共件会牵动线上页面加载路径，故点名挂账待拍板（第 151 轮）' }
];
/** 未收口条数棘轮上限（只降不抬；要抬须拍板并写明理由） */
export const STRIP_COPY_RATCHET = 1;

export function auditStripCopies(dir) {
    const self = path.basename(fileURLToPath(import.meta.url));
    const names = fs.readdirSync(dir).filter(f => f.endsWith('.js') || f.endsWith('.mjs'));
    const closed = [], open = [];
    for (const f of names) {
        const src = fs.readFileSync(path.join(dir, f), 'utf8');
        const hits = [...src.matchAll(RE_STRIP_DEF)].map(m => m[1]);
        if (hits.length === 0) continue;
        const rec = { file: f, fns: hits };
        if (f === self) continue;
        if (isClosedOnTruth(src)) { closed.push(rec); continue; }
        open.push(rec);
    }
    for (const d of [dir + '/_lib', dir + '/health-rules']) {
        if (!fs.existsSync(d)) continue;
        for (const f of fs.readdirSync(d).filter(x => x.endsWith('.js') || x.endsWith('.mjs'))) {
            const src = fs.readFileSync(path.join(d, f), 'utf8');
            const hits = [...src.matchAll(RE_STRIP_DEF)].map(m => m[1]);
            if (hits.length === 0) continue;
            const rel = path.basename(d) + '/' + f;
            if (rel === '_lib/' + self) continue;
            const rec = { file: rel, fns: hits };
            if (isClosedOnTruth(src)) closed.push(rec); else open.push(rec);
        }
    }
    const allow = new Set(STRIP_COPY_ALLOWLIST.map(a => a.file));
    const unnamed = open.filter(o => !allow.has(o.file));
    const fails = [];
    if (unnamed.length > 0) {
        for (const o of unnamed) fails.push('发现未登记的第二份剥注释实现：' + o.file + '（' + o.fns.join('/') + '）—— 请改为复用本公共件，或登记进 STRIP_COPY_ALLOWLIST 并写 why');
    }
    if (open.length > STRIP_COPY_RATCHET) {
        fails.push('第二份剥注释实现 ' + open.length + ' 条 > 棘轮上限 ' + STRIP_COPY_RATCHET + '（只降不抬；要抬须拍板）');
    }
    return { closed, open, allowlisted: open.filter(o => allow.has(o.file)), fails };
}

// ---------------------------------------------------------------------------
// ⑦ 跨文件同名 / 逐字重复函数点名（第 152 轮新增）
//   第 151 轮只盯"剥注释"一款。本轮把"第二份"的检测**扩面**到机械可验的一般形态：
//   同一函数名在 ≥2 个文件里各定义一遍。★ 分两桶，判据不同、处置不同：
//     · identical     —— 函数体**逐字相同** ⇒ 铁证如山的第二份，须收口；
//     · sameNameOnly  —— 同名但函数体不同 ⇒ 只点名、待人工判定。★ 后者比前者更值得看：
//       "抄了一份又改了一点"，改的那一点就是**口径分叉**本身（一处收紧另一处没跟，
//       两个自检都报绿，谁也看不出来 —— 第 133 轮立的原话）。
//   ★ 排除名单里的不是"豁免第二份"，而是"本来就该各写一份"：
//     main 是每个可执行脚本的入口；selfCheck / runSelfChecks 是各件自证 ——
//     第 143 轮立的设计原则就是"一处坏多处喊"，刻意各写一份，收口反而违背设计。
//   ★ 边界：extractFnSource 按花括号配对切函数体，不解析字符串/正则里的花括号。
//     命中时会取到**偏大**的一段（多取不会误判成"不同"，只会让 identical 变难命中，
//     属安全方向）；取不到时该处记为 null，按"无法判定"处理，不进 identical。
// ---------------------------------------------------------------------------
export const DUP_FN_ALLOWLIST = [
    { name: 'main', why: '每个可执行脚本的入口函数，属命名约定而非重复实现（实测 22 处）' },
    { name: 'selfCheck', why: '各件自证入口 —— 第 143 轮立的设计原则是「一处坏多处喊」，刻意各写一份，收口反而违背设计（3 处）' },
    { name: 'runSelfChecks', why: 'selfCheck 的实现体，同上（3 处）' },
];
/**
 * 逐字重复条数棘轮上限（只降不抬；要抬须拍板并写明理由）。
 * ★ 4 = 第 152 轮**首次点名**的实测基线（fail×3 / collectFacts×2 / parentDmgOf×2 / readIfAbs×2）。
 *   与第 151 轮同一取舍：**先点名、再谈收口** —— 首次普查不追求"一上来就红"，
 *   先把"还剩什么"如实打印出来，收口一条棘轮就降一格。本轮一条没收（其中 fail /
 *   parentDmgOf 两组落在 health-rules 规则文件里，收口须拍板），如实挂账。
 */
export const DUP_FN_RATCHET = 4;
const RE_FN_DEF = /^[ \t]*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm;

/** 从 `function name(` 的定义起点切出整个函数体（花括号配对；取不到返回 null） */
function extractFnSource(src, idx) {
    const open = src.indexOf('{', idx);
    if (open === -1) return null;
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(idx, i + 1).replace(/\s+$/, ''); }
    }
    return null;
}

export function auditDupFnNames(dir) {
    const dirs = [dir, dir + '/_lib', dir + '/health-rules'];
    const groups = new Map();
    for (const d of dirs) {
        if (!fs.existsSync(d)) continue;
        for (const f of fs.readdirSync(d).filter(x => x.endsWith('.js') || x.endsWith('.mjs'))) {
            const rel = (d === dir ? '' : path.basename(d) + '/') + f;
            const src = fs.readFileSync(path.join(d, f), 'utf8');
            const seen = new Set();
            for (const m of src.matchAll(RE_FN_DEF)) {
                const name = m[1];
                if (seen.has(name)) continue; // 同文件内重名只取第一处，避免把重载误算成"第二份"
                seen.add(name);
                if (!groups.has(name)) groups.set(name, []);
                groups.get(name).push({ file: rel, body: extractFnSource(src, m.index) });
            }
        }
    }
    const skip = new Set(DUP_FN_ALLOWLIST.map(a => a.name));
    const identical = [], sameNameOnly = [];
    for (const [name, list] of groups) {
        if (skip.has(name)) continue;
        const files = list.map(x => x.file);
        if (files.length < 2) continue;
        const bodies = list.map(x => x.body);
        const rec = {
            name, files, copies: files.length,
            why: bodies.every(b => b === null) ? '无法判定' : ''
        };
        const comparable = bodies.filter(b => b !== null);
        const allSame = comparable.length === bodies.length && new Set(comparable).size === 1;
        if (allSame) {
            rec.why = '函数体逐字相同 —— 铁证如山的第二份，须收口为唯一来源';
            identical.push(rec);
        } else {
            rec.why = '同名但函数体不同 —— 待人工判定：可能是巧合同名，也可能是「抄了一份又改了一点」（后者更危险：改的那点就是口径分叉）';
            sameNameOnly.push(rec);
        }
    }
    identical.sort((a, b) => b.copies - a.copies || a.name.localeCompare(b.name));
    sameNameOnly.sort((a, b) => b.copies - a.copies || a.name.localeCompare(b.name));
    const fails = [];
    if (identical.length > DUP_FN_RATCHET) {
        fails.push('逐字重复函数 ' + identical.length + ' 组 > 棘轮上限 ' + DUP_FN_RATCHET + '（只降不抬；要抬须拍板）');
    }
    return { identical, sameNameOnly, fails };
}

// ---------------------------------------------------------------------------
// ② 按所有权解析枚举块：每段以 `export const <NAME> = Object.freeze({` 起，以其闭合 `});` 止。
//    ★ 与"两锚点切文本"的根本区别：切出来的每一行都**知道它属于哪个枚举**，
//      于是"混进来別的枚举"这件事从"看不见"变成"一条数组"。
// ---------------------------------------------------------------------------
const RE_BLOCK_HEAD = /^export\s+const\s+([A-Z][A-Z0-9_]*)\s*=\s*Object\.freeze\(\{\s*$/;
const RE_BLOCK_TAIL = /^\}\);/;
const RE_KV = /([A-Z][A-Z0-9_]+)\s*:\s*'([^']+)'/g;

export function parseEnumBlocks(src) {
    const lines = src.split('\n');
    const order = [];
    const blocks = new Map();
    let cur = null;
    for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        if (!cur) {
            const h = RE_BLOCK_HEAD.exec(ln);
            if (h) cur = { name: h[1], startLine: i, endLine: -1, keys: [] };
            continue;
        }
        if (RE_BLOCK_TAIL.test(ln)) { cur.endLine = i; order.push(cur.name); blocks.set(cur.name, cur); cur = null; continue; }
        let m;
        RE_KV.lastIndex = 0;
        while ((m = RE_KV.exec(ln)) !== null) cur.keys.push({ key: m[1], val: m[2], line: i + 1 });
    }
    return { order, blocks };
}

// ---------------------------------------------------------------------------
// ③ 给"文本切片"做体检
//   attributeSlice：把切片逐行归属到它真正所属的枚举（第 144 轮原逻辑，一字不改搬过来）。
//   soloBlockKeys ：独立第三路径 —— 只截 <owner> 那一段（从它的 Object.freeze 起到本段闭合止），
//                   专门咬"真值口径被偷偷换成文本重建"（第 144 轮牙一实证：没有这条自证，
//                   掉包就是一次完美的静默假绿）。
//   auditSlice    ：三合一，返回可直接打印的对象 + 红线清单 fails。
// ---------------------------------------------------------------------------
export function attributeSlice(sliceText, defaultOwner) {
    const lines = sliceText.split('\n');
    const rows = [];
    let owner = defaultOwner;
    for (const line of lines) {
        const decl = /^export const ([A-Z][A-Z0-9_]*) = Object\.freeze/.exec(line);
        if (decl) { owner = decl[1]; continue; }
        let m;
        RE_KV.lastIndex = 0;
        while ((m = RE_KV.exec(line)) !== null) rows.push({ owner, key: m[1], val: m[2] });
    }
    const ownerCount = {};
    const keyCount = {};
    for (const r of rows) { ownerCount[r.owner] = (ownerCount[r.owner] || 0) + 1; keyCount[r.key] = (keyCount[r.key] || 0) + 1; }
    return {
        rows,
        ownerCount,
        keyCount,
        foreignOwners: Object.keys(ownerCount).filter(o => o !== defaultOwner),
        foreignRows: rows.filter(r => r.owner !== defaultOwner),
        dupKeys: Object.keys(keyCount).filter(k => keyCount[k] > 1).sort(),
        dupDetail: Object.keys(keyCount).filter(k => keyCount[k] > 1).sort()
            .map(k => k + '（' + rows.filter(r => r.key === k).map(r => r.owner).join(' + ') + '）'),
    };
}

export function soloBlockKeys(src, owner) {
    const lines = src.split('\n');
    let s = -1, e = -1;
    const headRe = new RegExp(owner + '\\s*=\\s*Object\\.freeze\\(\\{');
    for (let i = 0; i < lines.length; i++) {
        if (s < 0) { if (headRe.test(lines[i])) s = i; continue; }
        if (/^\}\);/.test(lines[i])) { e = i; break; }
    }
    if (s < 0 || e <= s) return [];
    const seg = lines.slice(s, e).join('\n');
    return [...seg.matchAll(new RegExp(RE_KV.source, 'g'))].map(m => m[1]);
}

// opts: { src, from, to, owner, truthKeys }
//   行为等价第 144 轮：不改变任何既有判据，只把"这套值到底干不干净"算明白。
export function auditSlice(opts) {
    const src = opts.src;
    const from = src.indexOf(opts.from);
    const to = src.indexOf(opts.to);
    const slice = (from >= 0 && to > from) ? src.slice(from, to) : '';
    const attr = attributeSlice(slice, opts.owner);
    const truthKeys = opts.truthKeys || [];
    const soloKeys = soloBlockKeys(src, opts.owner);
    const extraKeys = attr.rows.map(r => r.key).filter(k => !truthKeys.includes(k));
    const missingKeys = truthKeys.filter(k => !attr.rows.some(r => r.key === k));
    const all = [...slice.matchAll(new RegExp(RE_KV.source, 'g'))].map(m => m[1]);
    return {
        slice,
        rawCount: all.length,
        ...attr,
        truthKeys,
        soloKeys,
        extraKeys: [...new Set(extraKeys)],
        missingKeys,
    };
}


// ---------------------------------------------------------------------------
// ④ 给"值→常量名"平铺映射做体检（本轮第二个受体的发现点）：
//   fact-dead-field-scan 用一条平铺正则扫 infra/56 全文建 值→常量名 映射，再拿它去找 fact 的发射点。
//   它暗含一个没人担保的前提：**同一个字面值不会出现在两个枚举里**。今天恰好成立（实测冲突 0 条），
//   但同一文件里已有 24 个跨枚举同名键 —— 哪天某个值也撞上，映射会把某个 fact 指到**别的枚举的同名常量**上，
//   于是"证据"指向错误的发射文件，A 类（可整批降级）可能就此被错误签发。
// ---------------------------------------------------------------------------
export function auditValueMap(blocks, owner) {
    const flat = new Map();      // 值 → 常量名（平铺口径，既有行为）
    const own = new Map();       // 值 → 常量名（只认 owner 段）
    const collisions = [];       // 同一值被多个常量认领
    const foreign = [];          // 值根本不属于 owner 却进了 flat
    const byVal = new Map();
    for (const name of blocks.order) {
        const b = blocks.blocks.get(name);
        for (const k of b.keys) {
            if (!byVal.has(k.val)) byVal.set(k.val, []);
            byVal.get(k.val).push({ name: k.key, owner: name, line: k.line });
        }
    }
    for (const [val, list] of byVal) {
        const names = [...new Set(list.map(x => x.name))];
        if (names.length > 1) collisions.push({ val, detail: list.map(x => x.owner + '.' + x.name).sort() });
        for (const x of list) flat.set(val, x.name); // 平铺口径：后写覆盖前写（还原既有行为）
    }
    const ownerRows = blocks.blocks.get(owner) ? blocks.blocks.get(owner).keys : [];
    const ownerVals = new Set(ownerRows.map(k => k.val));
    for (const k of ownerRows) own.set(k.val, k.key);
    const ownerNames = new Set(ownerRows.map(k => k.key));
    for (const [val, name] of flat) {
        if (ownerVals.has(val)) continue;
        const src = [...blocks.order].find(n => [...(blocks.blocks.get(n)?.keys || [])].some(k => k.val === val));
        foreign.push({ val, name, realOwner: src || '?' });
    }
    return { flat, own, collisions, foreign, ownerNames, ownerRows };
}

// ---------------------------------------------------------------------------
// ⑤ 给「正则抠锚点」做体检：这个锚点落在真代码里，还是只活在注释里？
//   opts: { src, anchors }   anchors = [{ id, re }]，re 必须带 g；函数内部每次都重置 lastIndex
//   三份取样面，逐份数同一批锚点：
//     rawView   原样源码                       —— 最宽松，注释也算，容易虚高
//     lineView  codeMask 逐行屏蔽「纯注释行」   —— 挡得住整行注释，挡不住行尾注释
//     stripView stripComments 精细剔注释文本   —— 唯一被认作真值的一份（行内注释也不留）
//   两类差值即两类骗局：
//     phantomLine = raw - line   —— 锚点只出现在整行注释里
//     phantomTail = line - strip —— 锚点出现在「代码行的行尾注释」里（★ 逐行 mask 的结构性盲区）
//   ★ 为什么必须三份而不是直接上 stripView：只有一个数字时，你无法知道它和历史报告差在哪；
//     三个数字并列，"掺了多少水"才是看得见的量。
// ---------------------------------------------------------------------------
function countOf(text, re) {
    re.lastIndex = 0;
    let n = 0;
    while (re.exec(text) !== null) n++;
    return n;
}

export function auditAnchorSites(opts) {
    const src = opts.src || '';
    const anchors = opts.anchors || [];
    const marks = codeMask(src);
    const lines = src.split('\n');
    const lineView = lines.map((ln, i) => (marks[i] === 'code' ? ln : '')).join('\n');
    const stripView = stripComments(src);
    const rows = anchors.map(a => {
        const raw = countOf(src, a.re);
        const line = countOf(lineView, a.re);
        const strip = countOf(stripView, a.re);
        return {
            id: a.id,
            raw, line, strip,
            phantomLine: raw - line,
            phantomTail: line - strip,
        };
    });
    return {
        rows,
        lines: lines.length,
        commentLines: marks.filter(m => m === 'comment').length,
        phantomTotal: rows.reduce((s, r) => s + r.phantomLine + r.phantomTail, 0),
    };
}

// ---------------------------------------------------------------------------
// 自证：本件自己腐烂了要能被听见。四条 +
//   ⒌ 独立第三路径自证（soloBlockKeys 必须数与真值口径同一份）。
//   ⒍⒎ 锚点取样三视图自证（整行注释 / 行尾注释 两种假写法必须各自能被数出来）。
//   ★ 设计原则照抄第 143 轮 sample-sufficiency：每个新受体挂一条 selfCheck()，一处坏多处喊。
// ---------------------------------------------------------------------------
export function selfCheck() {
    const fails = [];
    // ★ 自证自己必须"全函数不抛"：它一旦抛异常，两个受体会**直接崩掉**而不是报红
    //   （本轮牙三实证：把块头正则改坏后 fact-coverage-selftest 与 fact-dead-field-scan 双双
    //   TypeError 退出，报错信息写的是公共件的行号，反而把真因藏了）。
    //   故这里兜一层：异常也要转成一条 selfCheck 失败项，让受体继续跑完并把它打出来。
    try {
        runSelfChecks(fails);
    } catch (e) {
        fails.push('静态真值口径公共件自证自身抛异常（' + (e && e.message ? e.message : String(e)) + '）⇒ 本件已不可信，用它得到的任何"口径"结论一并作废');
    }
    return fails;
}

function runSelfChecks(fails) {
    const keysOf = (blocks, name) => (blocks.blocks.get(name) ? blocks.blocks.get(name).keys : []);
    // ① 注释清除：字符串里的 // 与 块注释里的 /* 都必须保住 / 删掉
    const fx1 = "const a = 'http://x.example/p'; // 行注释\nconst b = 'X';";
    const s1 = stripComments(fx1);
    if (!s1.includes("http://x.example/p")) fails.push('stripComments 把字符串里的 // 误删了（会伤及取值/URL 类的字面量证据）');
    if (s1.includes('行注释')) fails.push('stripComments 没删掉行注释（注释会被当成第二种"写法"）');
    const fx2 = "const c = 1; /* 块注释里也有 'X' */\nconst d = 2;";
    const s2 = stripComments(fx2);
    if (s2.includes('块注释里')) fails.push('stripComments 没删掉块注释（注释会被当成第二种"写法"）');
    if (!s2.includes('const d = 2;')) fails.push('stripComments 连注释后面的真代码也删了（过度清除 ⇒ 真写法被整行吞掉）');
    if (!s2.includes('const c = 1;')) fails.push('stripComments 把注释前面的真代码删了（过度清除 ⇒ 真写法被整行吞掉）');
    // ② codeMask：整行注释必须被标成 comment，含代码的行必须标成 code
    const mask = codeMask("// 纯注释行\nconst x = 1; // 尾巴注释\n/* 块 */");
    if (mask[0] !== 'comment') fails.push('codeMask 把纯注释行标成了代码行（去注释口径会失效）');
    if (mask[1] !== 'code') fails.push('codeMask 把含代码的行标成了注释（会漏掉真写法）');
    if (mask[2] !== 'comment') fails.push('codeMask 没识别出整块注释');
    // ③ 所有权解析：两个相邻枚举必须各归各的，且同一条不串门
    const fx3 = [
        "export const A_TYPES = Object.freeze({",
        "    K1: 'v1',",
        "});",
        "export const B_TYPES = Object.freeze({",
        "    K2: 'v2',",
        "});",
        "",
    ].join('\n');
    const b3 = parseEnumBlocks(fx3);
    if (b3.order.length !== 2) fails.push('parseEnumBlocks 没能按所有权切出两个枚举块（结构断言失效）');
    if (!b3.blocks.get('A_TYPES').keys.some(k => k.key === 'K1')) fails.push('parseEnumBlocks 漏收了 A_TYPES.K1');
    if (b3.blocks.get('A_TYPES').keys.some(k => k.key === 'K2')) fails.push('parseEnumBlocks 把 B_TYPES 的键算进了 A_TYPES（所有权串门）');
    // ④ 独立第三路径：必须与 block 口径数出同一份
    const solo3 = soloBlockKeys(fx3, 'A_TYPES');
    if (solo3.length !== 1 || solo3[0] !== 'K1') fails.push('soloBlockKeys 独立路径失灵（真值口径掉包就再也咬不住了）');
    // ⑤ 值冲突：同一字面值出现在两个枚举必须被报出来
    const fx5 = [
        "export const A_TYPES = Object.freeze({",
        "    SAME: 'dup',",
        "});",
        "export const B_TYPES = Object.freeze({",
        "    OTHER: 'dup',",
        "    ONLY_B: 'onlyb',",
        "});",
        "",
    ].join('\n');
    const v5 = auditValueMap(parseEnumBlocks(fx5), 'A_TYPES');
    if (v5.collisions.length !== 1) fails.push('auditValueMap 没报出跨枚举同值冲突（值→名映射会被静默带错）');
    if (!v5.foreign.some(f => f.realOwner === 'B_TYPES')) fails.push('auditValueMap 没标出外来条目（flat 映射的外来占比无从得知）');
    // ⑥ 切片审计必须识别"混进来別的枚举"与"同名重复"
    const fx6 = "export const A_TYPES = Object.freeze({\n  K1: 'v1',\n});\nexport const B_TYPES = Object.freeze({\n  K1: 'vx',\n});\nexport const ZZZ_MARK = Object.freeze({\n  K9: 'v9',\n});\n";
    const a6 = auditSlice({ src: fx6, from: 'A_TYPES', to: 'ZZZ_MARK', owner: 'A_TYPES', truthKeys: ['K1'] });
    if (a6.foreignOwners.length !== 1) fails.push('auditSlice 没识别出切片里混进来的外来枚举（这是第 144 轮那条病的本体）');
    if (a6.dupKeys.length !== 1) fails.push('auditSlice 没识别出跨枚举同名重复（重复会让分母虚增）');
    // ⑦ 锚点三视图：注释里的锚点一个都不许被算进真值
    const ANCH = [{ id: 'NSX hooked', re: /\bhooked\b/g }];
    const fx7 = [
        "const real = 1; // hooked 只在行尾注释里",
        "// hooked 整行都是注释",
        "const real2 = hookedFn();",
        "",
    ].join('\n');
    const a7 = auditAnchorSites({ src: fx7, anchors: ANCH });
    if (a7.rows[0].strip !== 0) {
        fails.push('auditAnchorSites 把注释里的锚点算成了真值（stripView 应为 0，说明注释没被剔干净）');
    }
    if (a7.rows[0].phantomLine !== 1) {
        fails.push('auditAnchorSites 没数出「整行注释里的锚点」（phantomLine 应为 1，实为 ' + a7.rows[0].phantomLine + '）');
    }
    if (a7.rows[0].phantomTail !== 1) {
        fails.push('auditAnchorSites 没数出「行尾注释里的锚点」（phantomTail 应为 1，实为 ' + a7.rows[0].phantomTail + '）—— 这正是逐行 mask 的结构性盲区');
    }
    // ⑧ 锚点三视图：反过来也不许误伤 —— 真代码里的锚点一个都不能少
    const fx8 = "/* 注释里也提一次 hooked */\nconst x = hooked;\n";
    const a8 = auditAnchorSites({ src: fx8, anchors: ANCH });
    if (a8.rows[0].strip !== 1) {
        fails.push('auditAnchorSites 把真代码里的锚点误删了（stripView 应为 1，实为 ' + a8.rows[0].strip + '）');
    }
    if (a8.rows[0].raw !== 2) {
        fails.push('auditAnchorSites 的 raw 视图漏数（应为 2，实为 ' + a8.rows[0].raw + '），三视图差值就失真了');
    }

    // ---- ⑥ stripCommentsMapped / auditStripCopies 自证（第 151 轮新增，五条） ----
    // ⑪ 正则字面量里的 // 不能被当注释起点（本函数相对 stripComments 的核心增量，
    //    牙一就是咬这里：删掉正则分支它会立刻报）
    // ★ 样本取 /a\/*b/：正则字面量里不可能出现未转义的 //（那会先把正则终止掉，不构成风险），
    //   真正会把剥注释带沟里的是正则里的 /* —— 无正则感知时被当块注释起点，一路吃到文件尾。
    //   （第 151 轮牙B 实证：第一版样本写的是 \/\/，压根没有相邻的 //，断言形同虚设、咬不动）
    const m1 = stripCommentsMapped("const re = /a\\/*b/; const x = 1;");
    if (!m1.code.includes('/a\\/*b/')) {
        fails.push('stripCommentsMapped 把正则字面量里的 // 当成了注释起点（正则会被整段吞掉 ⇒ 取样面少一大块）');
    }
    if (!m1.code.includes('const x = 1;')) {
        fails.push('stripCommentsMapped 连正则后面的真代码也吞了（正则识别越界）');
    }
    // ⑫ 保行结构：多行块注释里的换行必须逐个保留（旧手写版会连换行一起吃掉 ⇒ 行号塌陷）
    const m2 = stripCommentsMapped("const a = 1;\n/* 块注释\n   第二行\n   第三行 */\nconst b = 2;");
    if ((m2.code.match(/\n/g) || []).length !== 4) {
        fails.push('stripCommentsMapped 没有保留多行块注释里的换行（行数 ' + ((m2.code.match(/\n/g) || []).length + 1) + '，应为 5）⇒ 行号回指会整体错位');
    }
    if (!m2.code.includes('const b = 2;')) {
        fails.push('stripCommentsMapped 把块注释后面的真代码删了（过度清除）');
    }
    // ⑬ lineOf 映射：剥注释后剩余字符必须能回指到原文的真实行号（受体靠它报"第几行"）
    const m3 = stripCommentsMapped("// 注释行\nconst a = 'x';\n");
    const at = m3.code.indexOf("const a");
    if (at === -1 || m3.lineOf(m3.owner[at]) !== 2) {
        fails.push('stripCommentsMapped 的 lineOf 回指错位（"const a" 应在第 2 行，实为 ' + (at === -1 ? '未找到' : m3.lineOf(m3.owner[at])) + '）⇒ 报出来的行号不可信');
    }
    // ⑭ 字符串里的 // 与转义引号不能被误伤（与 stripComments 同源的硬要求）
    const m4 = stripCommentsMapped("const u = 'http://x.example/p'; const q = 'a\\'b//c';");
    if (!m4.code.includes("http://x.example/p")) {
        fails.push('stripCommentsMapped 把字符串里的 // 误删了（URL 类字面量会被切断）');
    }
    if (!m4.code.includes("a\\'b//c")) {
        fails.push('stripCommentsMapped 没正确跳过转义引号（字符串边界判错 ⇒ 后面整段错位）');
    }
    // ⑮ auditStripCopies 必须能在"给一个无关文件加一份手写实现"时把它点出来
    //    （牙二就是咬这里：把受体 A 改回手写版，本条必须报，否则机制形同虚设）
    const testsDir = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // tests/_lib -> tests
    try {
        const a9 = auditStripCopies(testsDir);
        if (!Array.isArray(a9.closed) || a9.closed.length === 0) {
            fails.push('auditStripCopies 一条"已收口"都没点出来（两个受体都已改用公共件，closed 应 ≥ 1；实为 0 说明 import 检测失灵）');
        }
        if (a9.open.length > STRIP_COPY_RATCHET) {
            fails.push('auditStripCopies 未收口条数 ' + a9.open.length + ' 已超棘轮上限 ' + STRIP_COPY_RATCHET + '（有人在公共件之外又写了第二份）');
        }
        for (const o of a9.open) {
            if (!STRIP_COPY_ALLOWLIST.some(x => x.file === o.file)) {
                fails.push('auditStripCopies 发现未登记的第二份：' + o.file + '（' + o.fns.join('/') + '）');
            }
        }
    } catch (e) {
        fails.push('auditStripCopies 自身抛异常（' + (e && e.message ? e.message : String(e)) + '）⇒ 第二份快照的守卫已失效');
    }

    // ---- ⑥-c 收口判据自证（第 152 轮新增，三条）----
    // ★ 为什么必须给"判据"本身写自证：第 151 轮已经在日志里写下"判据收紧为只认 import 语句"，
    //   但代码里落盘的仍是第一版宽口径 —— 收紧**没有进提交**（本轮开场 git show d1dd14a0 复核：
    //   RE_IMPORT_TRUTH 四个字只存在于日志散文里，代码一处于 _lib/static-truth-slice.mjs 一处也没有）。
    //   ⇒ 日志写了、报告也 PASS、牙A 也"报了 4 项"，可机制一直是漏的。这就是**验证态与交付态混淆**：
    //     牙A 是在收紧后的工作区里咬出来的，而最后从备份还原时把收紧一起覆盖掉了，
    //     日志撰写者把"验证时看到的现象"当成了"已落盘的改动"。
    //   ⇒ 机制守护机制只有一条路可走：**把判据口径钉进自证**，谁把它退回宽口径，自证立刻报。
    //     否则下一轮还会再"声称收紧一次"，再漏一次。
    // ⑯ 只在注释里提到公共件路径、没有真 import ⇒ 必须判「未收口」
    const c16 = 'function stripCommentsFake(src) { return src; }\n// 注释里提一句 tests/_lib/static-truth-slice.mjs 不算收口\n';
    if (isClosedOnTruth(c16)) {
        fails.push('收口判据把「注释里提到的公共件路径」当成了已收口（第 151 轮那款病原样复发：注释里的东西被当成真值）');
    }
    // ⑰ 注释里抄一句**完整 import 语句**、没有真 import ⇒ 必须判「未收口」
    //    （这条专咬"只认 import 字样、但不剥注释"的退化 —— 那样的判据照样会被注释骗过去）
    // ★ ★ 样本必须是**真风险形态**（第 151 轮牙B 的教训，本轮当场又踩一次）：
    //     第一版写成 `// import { ... } from '...'` —— 行首是 // 不是 import，
    //     而 RE_IMPORT_TRUTH 要求行首紧邻 import，(?:^|\n)[ \t]*import 压根匹配不到，
    //     于是"不剥注释"的退化版本也照样判它未收口 ⇒ 断言形同虚设、牙B 咬不动。
    //     真风险形态是**块注释内部换行后行首就是 import**：那种写法下
    //     (?:^|\n) 之后正好紧邻 import，不剥注释必然误判成已收口。
    const c17 = 'function stripCommentsFake(src) { return src; }\n/* 举个反例：\nimport { stripComments } from \'./static-truth-slice.mjs\';\n*/\n';
    if (isClosedOnTruth(c17)) {
        fails.push('收口判据把「注释里抄的完整 import 语句」当成了已收口（只认 import 字样却不剥注释，等于没收紧）');
    }
    // ⑱ 有真 import、且注释里也提 ⇒ 必须判「已收口」（反向，防剥注释误伤真 import）
    const c18 = '// 参考 tests/_lib/static-truth-slice.mjs\nimport { stripComments } from \'./static-truth-slice.mjs\';\nfunction stripCommentsFake(src) { return stripComments(src); }\n';
    if (!isClosedOnTruth(c18)) {
        fails.push('收口判据把「真 import」漏判成未收口（剥注释过度 ⇒ 真 import 被一起删了，已收口的会凭空变红）');
    }

    // ---- ⑦ 跨文件重复函数点名自证（第 152 轮新增，两条）----
    // ★ 与⑯⑰⑱同一句话：点名件自己也会腐烂（正则改坏、排除名单被删、目录不扫了），
    //   它一坏就表现为"一条都不点名"，而报告依旧 PASS —— 那正是它存在的意义被静默抹掉。
    // ⑲ 真实 tests 目录上必须点出已知的逐字重复（collectFacts / readIfAbs 两组，本轮实测存在）
    try {
        const d9 = auditDupFnNames(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
        const names9 = new Set(d9.identical.map(x => x.name));
        for (const must of ['collectFacts', 'readIfAbs']) {
            if (!names9.has(must)) {
                fails.push('auditDupFnNames 没点出已知的逐字重复函数 ' + must + '（两条铁证都丢了 ⇒ 重复检测已失灵，报告会静默变绿）');
            }
        }
        if (d9.identical.length < 2) {
            fails.push('auditDupFnNames 逐字重复只点出 ' + d9.identical.length + ' 组（应 ≥ 2）⇒ 重复检测覆盖面塌了');
        }
    } catch (e) {
        fails.push('auditDupFnNames 自身抛异常（' + (e && e.message ? e.message : String(e)) + '）⇒ 跨文件重复函数的守卫已失效');
    }
    // ⑳ 排除名单必须生效：main / selfCheck / runSelfChecks 一个都不许出现在两桶里。
    // ★ ★ 必查清单必须**硬编码在这里**，绝不能写成遍历 DUP_FN_ALLOWLIST 本身 ——
    //    本轮牙F 实证：第一版就是遍历 ALLOWLIST，于是"把 main 从名单里删掉"这个动作
    //    同时把"检查 main"这件事也删掉了，自证一声不吭（牙F 咬不动）。
    //    ⇒ 与 auditStripCopies 第一版"用注释里的字样证明已收口"是**同一款病**：
    //      拿被检查的东西自己来证明自己，证据来源不可靠，机制必然形同虚设。
    //    修法只有一条：自证持有**独立于被检查对象**的那份清单，两边互相盯着。
    const MUST_SKIP = ['main', 'selfCheck', 'runSelfChecks'];
    try {
        const d10 = auditDupFnNames(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
        const seen = [...d10.identical, ...d10.sameNameOnly].map(x => x.name);
        for (const n of MUST_SKIP) {
            if (seen.includes(n)) {
                fails.push('auditDupFnNames 把「本来就该各写一份」的 ' + n + ' 点成了第二份（排除名单失效 ⇒ 报告会被噪音淹没）');
            }
        }
        // ⑳-b 反向：硬编码清单与 ALLOWLIST 必须一一对应（防两边漂移：
        //   有人往 ALLOWLIST 加了一条而自证不知道，或删了一条而自证还在查 —— 两边都盯住）
        const allowNames = DUP_FN_ALLOWLIST.map(x => x.name);
        for (const n of MUST_SKIP) {
            if (!allowNames.includes(n)) {
                fails.push('DUP_FN_ALLOWLIST 缺登记 ' + n + '（自证必查清单与排除名单已漂移，请同步并写明 why）');
            }
        }
        for (const n of allowNames) {
            if (!MUST_SKIP.includes(n)) {
                fails.push('DUP_FN_ALLOWLIST 多出未受自证保护的条目 ' + n + '（新增排除项必须同步进本件 MUST_SKIP，否则它不受任何断言约束）');
            }
        }
    } catch (e) {
        fails.push('auditDupFnNames 排除名单校验抛异常（' + (e && e.message ? e.message : String(e)) + '）');
    }
    return fails;
}
