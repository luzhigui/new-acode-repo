#!/usr/bin/env node
// V1.3.0 | 2026-11-09 夜间第 199 轮：★ `msg:` 定位加词边界 + 常量内联提取
//*   V1.2.0 留了一个盲区：把静态标签抽成常量再写进模板首段
//*   （`msg: \`${LABEL}${x}\``）时，模板首段是**插值**，`staticPrefixOf` 截到空串 ⇒ fp=null。
//*   本轮 262 蝶变就是这么写的，结果「新增无可抽取指纹的分支」照旧报红。
//*   本版：① `indexOf('msg:')` 换成带词边界的正则（防 `xxxmsg:` 类标识符误命中）；
//*         ② 模板首段是**单个标识符 + 立即闭合插值**时，回溯该标识符的 `const X = '...'` 字面量，
//*            取它的静态前缀 —— 这是**语法层可判定的常量内联**，不做数据流推断；
//*            回溯不到就如实返回 null（绝不猜，假指纹比无指纹更危险）。
//*   ★ 口径阈值一个字没动：MIN_FP_LEN 仍是 4，白名单仍是 0，判据仍是 `fail: true` 的 return。
//* V1.2.0 | 2026-11-09 夜间第 198 轮：★ `msg: <arr>.join(sep)` 形态补「多前缀」抽取
//   旧口径只取 msg 后**第一个字符串字面量** ⇒ `msg: fails.slice(0,3).join('；')` 取到的是分隔符「；」，
//   长度 1 < MIN_FP_LEN ⇒ fp=null ⇒ 该规则名下**全部**证据都「对不上号」。实测这 2 条规则
//   （262 蝶变 150 条 / 284 终局 148 条）占了 475 条不可解析里的 298 条，把证据可解析率压到 6.8%。
//   本版：join 形态时回溯数组变量的所有 `<arr>.push(<字面量>...)` 调用，逐条抽静态前缀，
//   一个分支对多前缀（`fps` 数组）；`fp` 仍为**首个**（向后兼容全部受体），`bittenKeyOf` 口径不变。
//   ★ 判据一个字没动：95% 下限没放宽、两条规则没进白名单、join 文案没改去迎合抽取器。
// V1.1.0 | 2026-10-28 夜间第 151 轮：★ 手写第二份去注释**收口为公共件**
//   旧版自带的 stripCommentsKeepStrings 与公共件 stripComments 口径不同：
//   它把**多行块注释连同换行一起吃掉**（行结构塌陷），公共件则逐个保留换行。
//   实测：tests/health-rules 47 个文件里 3 个受影响（132-claw-damage / 156-desc-truth-drift /
//   170-taunts-integrity），tests 根目录 37 个里 11 个受影响。
//   ⇒ 本轮改为 import 公共件，函数名保留（薄封装，受体无需改动）；
//     行为等价性由本轮牙A 反证：改前改后 159 条判据分支抽取结果**逐字一致**（见迭代日志）。
// V1.0.0 | 2026-10-25 第 133 轮
//
// 判据分支静态抽取的**唯一来源**（single source of truth）。
//
// 为什么抽它：第 131 轮立的 rule-branch-idle-selftest 自带一套抽取口径，第 133 轮要新增
//   rule-teeth-evidence-selftest（牙口证据链对账）复用同一套口径。**若各自抄一份，两处口径必然分叉** ——
//   一处收紧、另一处没跟，就会出现「同一个分支在两个自检里结论不同」的幽灵事件，
//   而两个自检都报绿，谁都看不出来。属第 122 轮立的通规（静默位移白名单收口为唯一来源）的同款应用。
//
// 抽取口径（与第 132 轮 V1.1.0 逐字一致，行为不变，纯搬迁）：
//   ① 扫 tests/health-rules/*.js，每个 `fail: true` 的 return 记为一个**判据分支**；
//   ② 指纹 = 该分支 msg 里**首个静态字符串字面量**的前缀（遇模板插值 ${ 处截断；≥4 字才算）；
//   ③ 指纹**只取到本语句结束**（含 msg 的那条 return 的第一个分号前）—— 旧口径会越过语句边界、
//      把后续代码里的别的字符串误当成本分支指纹，造出"假指纹"（比无指纹危险得多）。
//
// 用法：import { extractBranches, keyOf, bittenKeyOf } from './_lib/rule-branch-extract.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './static-truth-slice.mjs';

export const VER = 'tests/_lib/rule-branch-extract.mjs V1.3.0';

const here = path.dirname(fileURLToPath(import.meta.url));

/** 规则文件目录（tests/health-rules） */
export const RULE_DIR = path.join(here, '..', 'health-rules');

/** 最短可定位指纹长度（短于此视为"多分支共用短前缀"，不可定位） */
export const MIN_FP_LEN = 4;

/** 剥注释但保留字符串/正则字面量原样（指纹靠字符串字面量，注释里的字符串不能算）
 *  ★ V1.1.0 起**不再是手写第二份**：转发公共件 tests/_lib/static-truth-slice.mjs 的 stripComments
 *    （唯一来源）。保留导出名是为了不动受体；想改口径请改公共件，别在这里另写一份。 */
export function stripCommentsKeepStrings(src) {
    return stripComments(src);
}

/** 从一个字符串字面量原文里取静态前缀（模板插值 ${ 处截断；不足 MIN_FP_LEN 返回 null） */
function staticPrefixOf(v) {
    let s = String(v);
    const d = s.indexOf('${');       // 模板插值处截断，只取静态前缀
    if (d !== -1) s = s.slice(0, d);
    s = s.trim();
    return s.length >= MIN_FP_LEN ? s : null;
}

/**
 * V1.2.0：`msg: <arr>.slice(...).join(sep)` 形态的多前缀抽取。
 *   动机：这两条规则（262 蝶变 / 284 终局）把所有子病因 push 进同一个数组，再 join 成一条 msg。
 *   旧口径只看 msg 后面第一个字面量 ⇒ 拿到的是**分隔符**（长度 1）⇒ 整条规则下的证据全部对不上号。
 *   口径：① 从 msg 表达式里认出 `<ident>` 与紧随其后的 `.join(`；② 用 `<ident>.push(` 在**同一文件**
 *   全文里回溯所有推送点；③ 每个推送点的模板首段取静态前缀（≥MIN_FP_LEN），去重后按出现顺序返回。
 *   ★ 只认「变量本身 + .push(」这一种写法，不做数据流推断：认不出就返回空，明确退回无指纹，
 *     绝不猜 —— 猜出来的前缀会让「假指纹」出现，那比无指纹更危险（见文件头 ③）。
 */
function joinShapePrefixes(src, msgExpr, varName) {
    const esc = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pushRe = new RegExp(esc + '\\s*\\.\\s*push\\s*\\(', 'g');
    const out = [];
    let m;
    while ((m = pushRe.exec(src)) !== null) {
        // 取该 push( 的第一个实参：从 "(" 后开始，扫到括号配平或遇到顶层逗号为止
        let i = m.index + m[0].length;
        let depth = 0, arg = '', inStr = null;
        for (; i < src.length; i++) {
            const ch = src[i];
            if (inStr) {
                arg += ch;
                if (ch === '\\') { arg += src[i + 1] || ''; i++; continue; }
                if (ch === inStr) inStr = null;
                continue;
            }
            if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; arg += ch; continue; }
            if (ch === '(' || ch === '[' || ch === '{') { depth++; arg += ch; continue; }
            if (ch === ')' || ch === ']' || ch === '}') { if (depth === 0) break; depth--; arg += ch; continue; }
            if (ch === ',' && depth === 0) break;
            if (ch === ';' && depth === 0) break;   // 实参没闭合就断了 ⇒ 不认
            arg += ch;
        }
        // ★ V1.3.0：原来只取**第一个**字面量，取到就 `staticPrefixOf` ⇒ 拿到不足 4 字的短串
        //   （如 `'第' + … '回合：'` 取到「第」）就判 `p=null` 并 continue，整条 push **作废**。
        //   实测 182/183/184/188/232/234/236/247/264/283/285 十一条规则全栽在这 ——
        //   它们的 errs 条目都以「第${round}回合：」打头，抽出来的永远是「第」。
        //   改为：按出现顺序逐个字面量试，取**第一个能给出可用静态前缀**的（口径仍是
        //   「首个满足 MIN_FP_LEN 的静态前缀」，只是不再因为第一个字面量太短就整条放弃）。
        //   ★ 不做拼接（`'第'+'回合：'`）—— 那是跨表达式串味，会把不同子病因的前缀缝在一起。
        const lits = [...arg.matchAll(/(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g)];
        for (const l of lits) {
            const p = staticPrefixOf(l[2]);
            if (p) { out.push(p); break; }
        }
    }
    return [...new Set(out)];
}

/**
 * V1.2.0 辅助：把 msg 表达式（`msg:` 之后、语句分号前的那一段）解析成分支的前缀集合。
 *   返回 { fps, shape }，shape ∈ ('literal' | 'join' | 'none')。
 */
function prefixesOfMsgSeg(src, seg, mi) {
    const expr = seg.slice(mi + lenOfMsgColon(seg, mi));
    // ★ V1.2.0 走查结论（务必先看）：join 形态**不能无条件**多前缀。
    //   实测第 198 轮初版：18 个 join 分支全部展开多前缀后，证据对不上号从 473 条升到 504 条
    //   —— 收回了约 30 条（本意），却新增约 61 条错配：多前缀把匹配面扩大到同一数组里的**其它子病因**，
    //   把原本记在别的分支名下的证据抢了过来（如「蝶变」名下冒出十几条成长曲线证据）。
    //   故口径收紧为：**仅当旧口径抽不出可用前缀（fp=null）时**才走 join 多前缀兜底。
    //   有前缀的分支一律保持旧口径逐字不变 —— 这样「改造只影响原本不可裁定的那批」，不可能让任何既有结论变差。
    const m = expr.slice(0, 404).match(/(['"`])((?:\\.|(?!\1).)*)\1/);
    if (m) {
        const p = staticPrefixOf(m[2]);
        if (p) return { fps: [p], shape: 'literal' };
        // ★ V1.3.0：模板首段是纯插值 ⇒ 试「单标识符常量内联」（`msg: `${LABEL}rest``）
        const inl = inlineConstPrefix(src, m[2]);
        if (inl) return { fps: [inl], shape: 'literal' };
    }
    // ② 旧口径抽不出 ⇒ 才试 join 形态：`<ident>(...).join(` —— 取被 join 的那个数组变量名
    const jm = expr.match(/([A-Za-z_$][\w$]*)\s*(\.\s*slice\s*\([^)]*\)\s*)?\.\s*join\s*\(/);
    if (jm) {
        // ★ V1.3.0 修正：切点被收窄到 `join(...)` 右括号（见 cutMsgStatement），
        //   `msg:` 之后已经**看不到数组变量名**了（expr 以分隔符「；」开头）⇒ 必须回到原始语句 seg 里取。
        const multi = joinShapePrefixes(src, seg, jm[1]);
        if (multi.length) return { fps: multi, shape: 'join' };
        return { fps: [], shape: 'none' };   // 认得出 join 但回溯不到可用前缀 ⇒ 如实无指纹，不猜
    }
    return { fps: [], shape: 'none' };
}

/** `msg:` 匹配串的实际长度（`msg:` / `msg :` 都算），供调用方算表达式起点 */
function lenOfMsgColon(seg, mi) {
    const t = seg.slice(mi, mi + 12);
    const mm = /^msg\s*:/.exec(t);
    return mm ? mm[0].length : 4;
}

/**
 * V1.3.0：**单标识符常量内联**。
 *   只认两种形态：`${IDENT}` 与 `${IDENT}${...}`（即模板首段恰好是一个裸标识符插值）。
 *   然后在本文件全文回溯 `const|let|var IDENT = '<字面量>'`，取该字面量的静态前缀。
 *   ★ 刻意**不**做更宽的推断（不外接运算、不跟函数返回、不跨文件）：认不出就返回 null。
 *     理由同 join 兜底 —— 猜出来的前缀会造「假指纹」，那比无指纹更毒。
 */
function inlineConstPrefix(src, tplBody) {
    const head = tplBody.match(/^\$\{\s*([A-Za-z_$][\w$]*)\s*\}/);
    if (!head) return null;
    const name = head[1];
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('(?:const|let|var)\\s+' + esc + '\\s*=\\s*([\'"`])((?:\\\\.|(?!\\1)[\\s\\S])*)\\1');
    const mm = re.exec(src);
    if (!mm) return null;
    return staticPrefixOf(mm[2]);
}

/**
 * V1.3.0：`msg:` 的定位**必须带词边界**。
 *   旧口径是 `seg.indexOf('msg:')` —— 纯子串查找，会命中 `.slice(...)` 里的 `slice(` ？不会；
 *   但会命中**任何**以 msg 结尾的标识符，实测第 199 轮踩到：
 *   `msg: \`${BUTTERFLY_RESIDUE_LABEL}${residue[0].slice(BUTTERFLY_RESIDUE_LABEL.length)}\``
 *   里 `.slice(BUTTERFLY_RESIDUE_LABEL.length)` 的 `..._LABEL.length` 内含 `L.length`，
 *   而真正的坑是**常量名里就带** `..._LABEL`，子串查找先撞上 `${BUTTERFLY_RESIDUE_LABEL}` 之后
 *   的 `.slice(` 里的 `e(` —— 不，真正命中的是 `seg.indexOf('msg:')` 找到的**第一个**位置，
 *   在该位置之后 404 字内做字面量匹配时，撞上了**属性名 `_LABEL.length` 无关**；
 *   根因是常量名 `BUTTERFLY_RESIDUE_LABEL` 里 `LABEL` 与 `msg:` 无关，而 `indexOf` 命中的是
 *   第一个 `msg:` —— 那里紧跟的是模板首段 `${BUTTERFLY_RESIDUE_LABEL}`（插值，静态前缀为空）。
 *   总之：**以插值开头的模板无法给出静态前缀**，改成把标签直接写进模板首段。
 *   本版另加词边界锚定，防 `xxxmsg:` 这类标识符误命中（属同一族的假定位）。
 */
const MSG_COLON_RE = /(?<![\w$.])msg\s*:/;

/**
 * msg 表达式的切点：默认到**本语句第一个分号前**（旧口径，防越过语句边界取到别的字符串）。
 * ★ V1.2.0：`msg: <arr>....join(sep)` 形态里 join 的实参可含分号以外的任意内容，
 *   但更重要的是 —— 该形态下**表达式本身**才是要解析的对象，收紧到分号不变；
 *   真正修的是 join 形态底下「取数组名 → 回溯 push」，与切点无关。
 *   这里只负责把 seg 裁到「含 msg 的这条 return 语句」为止，两种形态共用。
 */
export function cutMsgStatement(lines, li) {
    let seg = lines[li];
    // ★ 第 0 轮就用**本行自身**试一次：V1.2.0 之前从 k=1 开始拼，旧口径下无差别（字面量必在本行），
    //   但 join 形态可能整条语句就写在一行里 —— 不从 0 试会把本行内已闭合的 join 漏掉。
    for (let k = 0; k <= 6 && li + k < lines.length; k++) {
        if (k > 0) seg += '\n' + lines[li + k];
        const mm0 = MSG_COLON_RE.exec(seg);
        if (!mm0) continue;
        const ms = mm0.index;
        // ★ V1.2.0：join 形态优先 —— `msg: <arr>.join('；')` 的分隔符本身就是中文分号，
        //   按分号切会把 `.join('` 之后的右括号切掉 ⇒ 形似「认不出」。改为**裁到 join 调用的右括号后一位**。
        const mlen = lenOfMsgColon(seg, ms);
        const after = seg.slice(ms + mlen);
        const jm = after.match(/[A-Za-z_$][\w$]*\s*(\.\s*slice\s*\([^)]*\)\s*)?\.\s*join\s*\(/);
        if (jm) {
            const open = ms + mlen + jm.index + jm[0].length - 1;   // join( 左括号的下标
            let depth = 0, inStr = null, end = -1;
            for (let i = open; i < seg.length; i++) {
                const ch = seg[i];
                if (inStr) { if (ch === '\\') { i++; continue; } if (ch === inStr) inStr = null; continue; }
                if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
                if (ch === '(') { depth++; continue; }
                if (ch === ')') { depth--; if (depth === 0) { end = i + 1; break; } }
            }
            if (end !== -1) return seg.slice(0, end).replace(/\r$/, '');
            continue;   // join 实参还没闭合，再看下一行
        }
        const term = seg.indexOf(';', ms);
        if (term !== -1) { seg = seg.slice(0, term); break; }
    }
    return seg;
}

/** 抽取一个规则文件里的全部判据分支（按源码顺序） */
export function extractBranches(src, file) {
    const cleaned = stripCommentsKeepStrings(src);
    const lines = cleaned.split('\n');
    const out = [];
    let curRule = null;
    for (let li = 0; li < lines.length; li++) {
        const L = lines[li];
        const nm = L.match(/name:\s*(['"])(.*?)\1/);
        if (nm) curRule = nm[2];
        if (!/fail:\s*true/.test(L)) continue;
        const seg = cutMsgStatement(lines, li);
        const mi = /(?<![\w$.])msg\s*:/.exec(seg);
        const miIdx = mi ? mi.index : -1;
        let fps = [];
        let shape = 'none';
        if (miIdx !== -1) {
            const r = prefixesOfMsgSeg(cleaned, seg, miIdx);
            fps = r.fps;
            shape = r.shape;
        }
        out.push({ file, rule: curRule, fp: fps[0] || null, fps, fpShape: shape });
    }
    return out;
}

/** 扫全目录，返回该目录下所有判据分支（按文件名排序） */
export function scanAllBranches(dir = RULE_DIR) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
    const branches = [];
    for (const f of files) branches.push(...extractBranches(fs.readFileSync(path.join(dir, f), 'utf8'), f));
    return { files, branches };
}

/** 分支键（文件|规则）—— 不含指纹，用于"无指纹白名单"这类按文件+规则聚合的场合 */
export function keyOf(b) { return b.file + '|' + b.rule; }

/** 有牙键（文件|规则|指纹）—— 用于唯一确定一条判据分支 */
export function bittenKeyOf(b) { return b.file + '|' + b.rule + '|' + b.fp; }

/**
 * 在候选分支里找能匹配该 msg 的分支（命中判定与运行时一致：msg 以**任一分支前缀**为前缀）。
 * 只在同一规则名下找 —— 跨规则匹配属口径错误。
 * ★ V1.2.0：join 形态一个分支带多前缀（fps），旧版只比 `b.fp`（首个）会漏掉其余子病因。
 *   ★ 选支顺序**保持旧语义**：按分支在源码中的先后取第一个命中者，一个分支内任一前缀命中即算命中。
 *     为什么不按「最长前缀优先」：第 198 轮初版就是这么写的，结果多前缀把匹配面扩大到别的分支，
 *     实测证据可解析率反而从 6.8% **跌到 6.3%**，且「蝶变」规则名下一口气冒出十几条成长曲线类错配证据
 *     —— 这是「抢匹配」，比漏匹配更毒（把别人的证据记到自己账上，牙口结论张冠李戴）。
 *     多前缀的本意只是让**同一分支**的子病因都能定位，不该扩大跨分支的抢占面。
 */
export function findBranchByMsg(cands, msg) {
    for (const b of cands) {
        const ps = b.fps && b.fps.length ? b.fps : (b.fp ? [b.fp] : []);
        for (const p of ps) if (msg.startsWith(p)) return b;
    }
    return null;
}
