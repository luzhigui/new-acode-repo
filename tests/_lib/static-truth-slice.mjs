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
export const VER = 'tests/_lib/static-truth-slice.mjs V1.1.0';

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
    return fails;
}
