// V1.2.0 | 2026-11-11 白天合入后迭代：堵「双对端键被内部过滤位洗绿」。
//   实证：同一个 key 既被本函数 push 出的 fails.filter 消费、又用 log.some 去主代码语料
//   认领战报时，V1.1.0 的 detectInternalKey 仍返回「L1 前缀筛选」⇒ 免检。
//   这种键才是 rule-binding-drift 本来要抓的真·假绿：主代码文案一改名就恒空转，
//   而夜间 11 条合成自证全是「单一对端」样本，没有覆盖双对端。
//   修法（加严，不弱化）：detectInternalKey 先查 hasExternalCorpusUse —— 同一函数体里
//   只要该 key 还有「对端不是本地 push 数组」的匹配调用，就不许判内部免检，交回主判据
//   去核主代码语料，该红就红。原有 11 条自证与 6 条真实免检须全部保持。
// tests/_lib/rule-internal-filter.mjs | V1.1.0 | 2026-11-11 夜间第 206 轮
//
// 用途：判定「某个中文字面量是不是规则内部的过滤位」——即规则自己把报错文案 push 进本地数组，
//   再回头筛选、按病因分出口时用的那段前缀（或其中一段）。
//
// 为什么需要它（第 204 轮 §6 挂账第 3 条）：
//   tests/rule-binding-drift-selftest.mjs 只抽「判据匹配位」上的中文字面量，再拿去主代码语料核存在性。
//   但有一类字面量的对端**不是主代码**，是规则自己刚写进去的字符串：
//       const fails = [];
//       fails.push(`融会贯通额外 ${extra} 非整数（floor 出口失守）`);   // ← 产生点
//       const tInt = pick('融会贯通额外').filter((x) => x.indexOf('非整数') > 0);  // ← 消费点
//   主代码里永远不会出现「非整数」这三个字，于是被判成「判据键漂移 ⇒ 真·假绿」。
//
// ── 三层口径（V1.1.0 由一层扩到三层，每层一条独立导出，互不并吞）────────────────────
//
//   L1 isInternalFilterKey —— **前缀筛选式消费**（第 205 轮 V1.0.0）：
//       a.filter/includes/indexOf/find/some/every(...)  或  alias('前缀')（alias 定义体里筛的正是 a）
//     判据三条同时成立：① 行是对本地数组或其别名的二次消费；② 该行不是 push 语句本身；
//     ③ 该字面量确实出现在本函数体 push 进该数组的模板里（去掉插值段后剩余字面文本必须包含它）。
//
//   L2 isInternalParseKey —— **正则解析式消费**（V1.1.0 新增，第 206 轮）：
//       x.match(/^(\S+) (atk)（([^）]+)）账本 (\S+) 不在配置集合 \{(.*)\}$/)
//     规则把 push 出去的报文再用正则**拆字段**，字面量是那条正则里的中文片段。
//     判据：① 该行是 `X.match(...)` / `X.replace(...)` / `X.split(...)` / `X.search(...)`，
//           或 `re.exec(X)` / `X.matchAll(...)`（X 为变量，不是主代码语料常量）；
//           ② 行上/下一行（±1）存在 `for (... of <数组>)` / `.map(` / `.filter(` 等把本地数组送进来的位置；
//           ③ 该正则片段确实出现在本函数体某次 push 进该数组的模板里。
//
//   L3 isInternalLoopVarKey —— **循环变量消费**（V1.1.0 新增，第 206 轮）：
//       for (const e of errs) { if (e.startsWith('复活后被终局覆盖：uid ')) ... }
//     判据：① 该字面量所在行的接收者是一个**循环变量**（由同函数体内的 `for (const v of <数组>)`
//           或 `.forEach((v) => …)` 绑定）；
//           ② 该数组是本函数体 push 过的本地数组（不是主代码语料）；
//           ③ 该字面量出现在 push 进该数组的模板里。
//
//   L4 isPushTemplateKey —— **push 模板内的中文碎片**（V1.1.0 新增，第 206 轮）：
//       268「单条峰值」、327「其中召唤者是召唤物」、294「她被当成看不见」、308「应仅挂号」
//     这些字面量根本没被任何判据消费，只是抽取器从拼接模板里切出来的中文碎片。
//     判据：① 抽取行是 push 语句（或是同一表达式里的字符串拼接行）；
//           ② 该字面量出现在 push 内容里；
//           ③ 该字面量**不是**任何二次筛选/解析/循环判据的消费对象（否则交给 L1~L3，证据更硬）；
//           ④ 该字面量**跨过一次模板插值边界**——即它在本文件 push 内容里出现的位置，
//              其左侧或右侧紧邻 `${…}`（或它在 push 内容里的出现被一个 ${} 切开）。
//              这条是防「整句报错文案被免检」的闸门：一整句连续中文（如「应仅挂号/队友两档」里
//              只有「应仅挂号」是因为「/队友两档」被别的片段接走）不算；必须真的被插值切断。
//
// 与白名单的区别：没有名单、没有轮次快照，纯结构判定；规则一旦改成从主代码取文案，判定自然失效、重新报红。
// 本模块只回答「这个字面量的对端是不是规则自己」，不回答「这条规则有没有牙」。

const CTOR_RE = /([A-Za-z_$][\w$]*)\.push\(/;

// 从 headLine 起向下配平，返回该块的闭括号所在行号；找不到返回 -1
function blockEndLine(lines, headLine) {
    let depth = 0, began = false;
    for (let i = headLine; i < lines.length; i++) {
        for (const ch of lines[i]) {
            if (ch === '{') { depth++; began = true; }
            else if (ch === '}') depth--;
        }
        if (began && depth <= 0) return i;
    }
    return -1;
}

// 找抽取行所在函数体的起始行。
//   做法：自抽取行向上，逐层遇到左花括号就问「这一层是不是函数体」——判据是它的闭括号行形如 `}` 或 `};`。
//   第 205 轮实测两个坑，都记在这里防回退：
//     坑一 规则文件是 CRLF，行尾锚定必须写 \r?$，否则 `) {` 永不匹配；
//     坑二 「向上见 function 就停」会穿出规则对象去认领文件里更早的具名函数（305 的规则体长达 100 行、
//          中间一个 function 字样都没有），必须靠括号配平回到第 0 层。
export function enclosingFunctionStart(lines, ln) {
    let depth = 0;
    for (let i = ln - 1; i >= 0 && i >= ln - 400; i--) {
        const s = lines[i];
        for (let k = s.length - 1; k >= 0; k--) {
            if (s[k] === '}') depth++;
            else if (s[k] === '{') {
                if (depth > 0) { depth--; continue; }
                const isFnHead = /\bfunction\b/.test(s) || /=>\s*\{\s*\r?$/.test(s);
                if (isFnHead) {
                    const end = blockEndLine(lines, i);
                    if (end > i && /^\}\s*[;)]?\s*$/.test(lines[end].trim())) return i;
                }
            }
        }
    }
    return -1;
}

export function functionBodyAt(lines, ln) {
    const start = enclosingFunctionStart(lines, ln);
    if (start < 0) return '';
    let depth = 0, began = false, out = [];
    for (let i = start; i < lines.length; i++) {
        for (const ch of lines[i]) {
            if (ch === '{') { depth++; began = true; }
            else if (ch === '}') depth--;
        }
        if (began) out.push(lines[i]);
        if (began && depth <= 0) break;
    }
    return out.join('\n');
}

// 取模板字符串「删掉 ${...} 之后」的剩余字面文本
export function literalOfTemplate(tpl) {
    let out = '', i = 0, depth = 0;
    while (i < tpl.length) {
        if (tpl[i] === '$' && tpl[i + 1] === '{') {
            depth = 1; i += 2;
            while (i < tpl.length && depth > 0) {
                if (tpl[i] === '{') depth++;
                else if (tpl[i] === '}') depth--;
                i++;
            }
            continue;
        }
        out += tpl[i++];
    }
    return out;
}

// 把模板切成「被 ${} 隔开」的字面段数组，用于判定碎片是否跨插值边界
export function templateSegments(tpl) {
    const segs = [];
    let cur = '', i = 0;
    while (i < tpl.length) {
        if (tpl[i] === '$' && tpl[i + 1] === '{') {
            segs.push(cur); cur = '';
            let depth = 1; i += 2;
            while (i < tpl.length && depth > 0) {
                if (tpl[i] === '{') depth++;
                else if (tpl[i] === '}') depth--;
                i++;
            }
            continue;
        }
        cur += tpl[i++];
    }
    segs.push(cur);
    return segs;
}

// 收集函数体里所有 `arr.push(<内容>)` 的内容串
export function pushedStrings(body, arr) {
    const out = [];
    const re = new RegExp('\\b' + arr.replace(/\$/g, '\\$') + '\\.push\\(', 'g');
    let m;
    while ((m = re.exec(body)) !== null) {
        let i = m.index + m[0].length, buf = '', d = 1;
        while (i < body.length && d > 0) {
            const c = body[i];
            if (c === '(') d++;
            else if (c === ')') { d--; if (!d) break; }
            buf += c; i++;
        }
        if (buf) out.push(buf);
    }
    return out;
}

// 函数体里被 push 过的所有本地数组名
export function pushedArrays(body) {
    const arrs = new Set();
    let pm;
    const re = new RegExp(PUSH_RE_SRC, 'g');
    while ((pm = re.exec(body)) !== null) arrs.add(pm[1]);
    return [...arrs];
}
const PUSH_RE_SRC = '([A-Za-z_$][\\w$]*)\\.push\\(';

// 别名表：`const pick = (head) => fails.filter(...)` ⇒ pick → fails
export function aliasMap(body, arrs) {
    const map = new Map();
    const re = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*([^;]{0,160});/g;
    let m;
    while ((m = re.exec(body)) !== null) {
        for (const a of arrs) {
            if (new RegExp('\\b' + a.replace(/\$/g, '\\$') + '\\b').test(m[2])) map.set(m[1], a);
        }
    }
    return map;
}

// 循环变量绑定表：`for (const e of errs)` / `for (let x of a.b)` / `a.forEach((v) => …)` ⇒ v → errs
export function loopVarMap(body, arrs) {
    const map = new Map();
    const forOf = /for\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s+of\s+([A-Za-z_$][\w$.]*)\s*\)/g;
    let m;
    while ((m = forOf.exec(body)) !== null) {
        const root = m[2].split('.')[0];
        if (arrs.includes(root)) map.set(m[1], root);
    }
    const forEach = /([A-Za-z_$][\w$.]*)\.forEach\(\s*\(?\s*([A-Za-z_$][\w$]*)/g;
    while ((m = forEach.exec(body)) !== null) {
        const root = m[1].split('.')[0];
        if (arrs.includes(root)) map.set(m[2], root);
    }
    return map;
}

/**
 * L1 前缀筛选式消费（V1.0.0 口径，行为一字未改）
 * @param {string} key 中文字面量
 * @param {string} ruleSrc 规则文件全文
 * @returns {null|{arr:string, line:number, alias?:string}}
 */
export function isInternalFilterKey(key, ruleSrc) {
    const lines = ruleSrc.split(/\r?\n/);
    for (let ln = 1; ln <= lines.length; ln++) {
        const cur = lines[ln - 1];
        if (!cur.includes(key)) continue;
        // ② push 行是产生点，不是消费点
        if (CTOR_RE.test(cur)) continue;
        // ① 必须是二次消费位
        const directRe = /\.\s*(?:filter|includes|indexOf|find|some|every)\s*\(/;
        const aliasCallRe = /(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*\(\s*['"`]/;
        const direct = directRe.test(cur);
        const aliasHit = cur.match(aliasCallRe);
        if (!direct && !aliasHit) continue;

        const body = functionBodyAt(lines, ln);
        if (!body) continue;
        const arrs = new Set();
        let pm;
        const pushRe = new RegExp(PUSH_RE_SRC, 'g');
        while ((pm = pushRe.exec(body)) !== null) arrs.add(pm[1]);
        if (!arrs.size) continue;
        const aliases = aliasMap(body, [...arrs]);

        for (const a of arrs) {
            const esc = a.replace(/\$/g, '\\$');
            let consumed = null;
            if (new RegExp('\\b' + esc + '\\s*\\.\\s*(?:filter|includes|indexOf|find|some|every)').test(cur)) consumed = a;
            if (!consumed && aliasHit && aliases.get(aliasHit[1]) === a) consumed = a;
            if (!consumed) continue;
            // ③ 该字面量确实来自本函数体 push 进该数组的文案
            for (const s of pushedStrings(body, a)) {
                if (literalOfTemplate(s).includes(key)) {
                    return { arr: a, line: ln, alias: consumed !== a ? aliasHit[1] : undefined };
                }
            }
        }
    }
    return null;
}

const PARSE_LINE_RE = /\.(?:match|matchAll|replace|split|search)\s*\(|\.exec\s*\(/;
const ARR_SINK_RE = /for\s*\(\s*(?:const|let|var)\s+[A-Za-z_$][\w$]*\s+of\s+([A-Za-z_$][\w$.]*)|\.(?:map|filter|some|every|find)\s*\(/;

/**
 * L2 正则解析式消费（V1.1.0，第 206 轮）
 * @returns {null|{arr:string, line:number, how:string}}
 */
export function isInternalParseKey(key, ruleSrc) {
    const lines = ruleSrc.split(/\r?\n/);
    for (let ln = 1; ln <= lines.length; ln++) {
        const cur = lines[ln - 1];
        if (!cur.includes(key)) continue;
        const isReLine = /\/[^\/\n]*[\u4e00-\u9fa5][^\/\n]*\//.test(cur) || /\.exec\s*\(/.test(cur);
        if (!isReLine) continue;
        if (!PARSE_LINE_RE.test(cur)) continue;
        // 不能是拿主代码语料常量做解析：X 必须是一个自由变量/表达式，而不是字面语料
        //   （第 206 轮自证抓出的第一个洞：`const m = corpus.match(/不在配置集合 …/)` 曾被判免检 ——
        //    那是**去主代码认领战报**的正牌判据，必须照旧报红。）
        if (/(?:^|[^\w$])(?:corpus|CORPUS|allText|mainCode|sourceText|SRC_TEXT|rawText)\s*\.\s*(?:match|matchAll|replace|split|search)\s*\(/.test(cur)) continue;
        const body = functionBodyAt(lines, ln);
        if (!body) continue;
        const arrs = pushedArrays(body);
        if (!arrs.length) continue;
        // ② 附近（本行 / 上一行 / 下一行 / 本函数体内任意一行）把某个本地数组送进遍历或映射
        //    ★ 319 的形态：`const detail = (part) => part.slice(0,4).map(...)` 是被**回调**消费的，
        //      数组本身出现在调用点 `detail(bad)`，不在解析行附近 —— 所以还要认「数组被当实参传进
        //      本函数体内的某个局部函数」这一下沉形态。
        const nearLines = [lines[ln - 2] || '', cur, lines[ln] || ''];
        const localFns = [...body.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g)].map(x => x[1]);
        for (const a of arrs) {
            const esc = a.replace(/\$/g, '\\$');
            const wordRe = new RegExp('(?:^|[^\\w$.])' + esc + '(?:[^\\w$]|$)');
            const sunk = nearLines.some(nl => {
                if (!wordRe.test(nl)) return false;
                if (new RegExp('\\b' + esc + '\\s*\\.').test(nl)) return true;              // bad.filter(...)
                if (new RegExp('of\\s+' + esc + '\\b').test(nl)) return true;               // for (… of bad)
                if (/\.(map|forEach|filter|some|every|find|flatMap)\s*\(/.test(nl)) return true; // 上行是 map 头
                if (/\(/.test(nl) && new RegExp('\\(\\s*' + esc + '\\s*\\)').test(nl)) return true;
                return false;
            }) || localFns.some(fn => new RegExp('(?:^|[^\\w$.])' + fn + '\\s*\\(\\s*' + esc + '\\b').test(body));
            if (!sunk) continue;
            for (const s of pushedStrings(body, a)) {
                if (literalOfTemplate(s).includes(key)) {
                    return { arr: a, line: ln, how: /\.exec\s*\(/.test(cur) ? 're.exec(数组元素)' : '数组元素.match(正则)' };
                }
            }
        }
    }
    return null;
}

/**
 * L3 循环变量消费（V1.1.0，第 206 轮）
 * @returns {null|{arr:string, line:number, how:string}}
 */
export function isInternalLoopVarKey(key, ruleSrc) {
    const lines = ruleSrc.split(/\r?\n/);
    for (let ln = 1; ln <= lines.length; ln++) {
        const cur = lines[ln - 1];
        if (!cur.includes(key)) continue;
        // ① 字面量必须被用作某循环变量的比较/包含前缀
        const useRe = /\b([A-Za-z_$][\w$]*)\s*(?:===|!==|==|!=)\s*['"`]/;
        const useStarts = /\.(?:startsWith|includes|indexOf)\s*\(\s*['"`]/;
        const varHit = cur.match(useStarts) ? cur.match(/([A-Za-z_$][\w$]*)\s*\.\s*(?:startsWith|includes|indexOf)\s*\(\s*['"`]/) : cur.match(useRe);
        if (!varHit) continue;
        const v = varHit[1];
        if (!v || ['msg', 'name', 'label', 'key'].includes(v)) continue;
        const body = functionBodyAt(lines, ln);
        if (!body) continue;
        const arrs = pushedArrays(body);
        if (!arrs.length) continue;
        const loopVars = loopVarMap(body, arrs);
        const arr = loopVars.get(v);
        if (!arr) continue;
        for (const s of pushedStrings(body, arr)) {
            if (literalOfTemplate(s).includes(key)) {
                return { arr, line: ln, how: `循环变量 ${v}（for of ${arr}）` };
            }
        }
    }
    return null;
}

/**
 * L4 push 模板内的中文碎片（V1.1.0，第 206 轮）
 *   —— 不是判据键，只是抽取器从拼接模板里切出来的碎片；判定见文件头 L4 四条。
 *   实现要点（踩过的坑写死在这里）：
 *     · 268 是**字符串拼接**（' / 单条峰值' + r.peak + ' / ' + …），没有 ${}；
 *     · 327 / 294 的抽取行是 `const observe = …` / `fails.push('第' + … + 「' + a.name + '」报「…` 这类
 *       **变量赋值行**，本行没有 `.push(` 字样 —— 所以不能要求抽取行自己是 push 行；
 *       改为「本函数体内存在 push 进某数组的实参，实参原文包含该字面量」。
 * @returns {null|{arr:string, line:number, seg:string}}
 */
export function isPushTemplateKey(key, ruleSrc) {
    const lines = ruleSrc.split(/\r?\n/);
    for (let ln = 1; ln <= lines.length; ln++) {
        const cur = lines[ln - 1];
        if (!cur.includes(key)) continue;
        if (/^\s*\/\//.test(cur)) continue;          // 注释行不是判据键（294 第 16 行的注释也会命中同一中文）
        const body = functionBodyAt(lines, ln);
        if (!body) continue;
        // ③ 该字面量不得是任何二次筛选/解析/循环判据的消费对象（那些交给 L1~L3，证据更硬）
        if (isInternalFilterKey(key, ruleSrc) || isInternalParseKey(key, ruleSrc) || isInternalLoopVarKey(key, ruleSrc)) continue;
        for (const site of localAssemblySites(body)) {
            if (!site.text.includes(key)) continue;
            // ④ 必须跨过一次表达式边界：把实参按「模板插值 ${} / 字符串拼接 + / 换行」切段，
            //    该字面量所在段必须在**被切断的那一侧**只剩分隔符或空，否则就是一整句连续文案，不免检。
            const segs = exprSegments(site.text);
            for (let si = 0; si < segs.length; si++) {
                const seg = segs[si];
                if (!seg.includes(key)) continue;
                const idx = seg.indexOf(key);
                const before = seg.slice(0, idx);
                const after = seg.slice(idx + key.length);
                const cutLeft = si > 0 && /^[\s，、；：/（「]*$/.test(before);
                const cutRight = si < segs.length - 1 && /^[\s，、；：/）」！。]*$/.test(after);
                // 「/」既可能是分隔符也可能是「应仅挂号/队友两档」这种并列 —— 只在左侧有实义中文时
                // 才把右侧的 / 当边界，避免把整句并列表述误判成碎片。
                // 另一种「被切断」的铁证：本段以**收尾符号**开头（收尾括号/破折号）—— 它只能是接在
                // 上一个表达式后面的续写，不可能是从句子中间起头的完整文案（294 的
                // `'）—— 她被当成看不见 / 替身逻辑失效'`）。
                const startsAsContinuation = /^\s*[）)」】]|^\s*——/.test(seg);
                if (cutLeft || (cutRight && /[\u4e00-\u9fa5]/.test(before)) || startsAsContinuation) {
                    return { arr: site.arr || site.kind, line: ln, seg };
                }
            }
        }
    }
    return null;
}

// 函数体内的「本地文本装配点」：规则把文案拼成本地字符串、再 push 或 return 出去的位置。
//   三种形态都是实测出来的（缺一种就有真碎片漏判）：
//     · push 实参            —— fails.push('第' + … + ' 她被当成看不见 / 替身逻辑失效')
//     · const X = …          —— const observe = `召唤 ${total} 次（其中召唤者是召唤物 ${chainN} 次）`
//     · return { observe }   —— 上面那个 observe 最后原样回传，成了规则的观察输出
export function localAssemblySites(body) {
    const out = [];
    for (const a of pushedArrays(body)) {
        for (const s of pushedStrings(body, a)) out.push({ kind: 'push:' + a, arr: a, text: s });
    }
    const declRe = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/g;
    let m;
    while ((m = declRe.exec(body)) !== null) {
        let i = m.index + m[0].length, buf = '', d = 0;
        while (i < body.length) {
            const c = body[i];
            if ('([{'.includes(c)) d++;
            else if (')]}'.includes(c)) { if (d === 0) break; d--; }
            else if (c === ';' && d === 0) break;
            else if (c === '\n' && d === 0) { /* 允许跨行拼接，继续读到 ; 或空行后的非续行 */ }
            buf += c; i++;
        }
        if (/[\u4e00-\u9fa5]/.test(buf)) out.push({ kind: 'const:' + m[1], text: buf });
    }
    return out;
}

// 把 push 实参切成「表达式相接处」的段：模板插值 ${…}、字符串拼接的引号收尾/起始、以及换行
export function exprSegments(s) {
    const segs = [];
    let cur = '', i = 0;
    const flush = () => { if (cur.trim()) segs.push(cur); cur = ''; };
    while (i < s.length) {
        if (s[i] === '$' && s[i + 1] === '{') {
            flush();
            let depth = 1; i += 2;
            while (i < s.length && depth > 0) {
                if (s[i] === '{') depth++;
                else if (s[i] === '}') depth--;
                i++;
            }
            continue;
        }
        if (s[i] === "'" || s[i] === '"' || s[i] === '`') flush();
        else if (s[i] === '\n') flush();
        else cur += s[i];
        i++;
    }
    flush();
    return segs;
}

/** 该行里出现的集合/字符串匹配调用（取主体，如 `log.some` ⇒ log、`y.indexOf` ⇒ y）。 */
const EXTERNAL_MATCH_RE = /(?:^|[^\w$.])([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\.\s*(?:filter|includes|indexOf|find|some|every|match|test|startsWith|endsWith)\s*\(/g;

/**
 * V1.2.0：判断 key 是否**同时**在「外部语料对端」被消费。
 *
 * 判据：含 key 的非 push 行里，若存在集合/字符串匹配调用，其主体 root **不是本函数体内
 *   声明/接收的变量** ⇒ 这是从外面传进来的主代码战报语料，才是真判据键。
 *   ★ 内部变量集合 = 本函数体 push 进的本地数组 + body 内 const/let/var 声明
 *     （含 `for (const e of errs)`）+ 箭头回调参数（含 `.map((x) => …)`、`.filter((y) => …)`）。
 *     实证：只看「是不是 push 数组」会误伤 319 的 `x.match`（L2 正则解析）与 284 的
 *     `e.startsWith`（L3 循环变量）—— 这两条是夜间合法的内部免检，不是双对端。
 *   ★ 边界：`functionBodyAt` 取不到函数体的顶层行不参与判定；由外部语料赋值来的本地
 *     别名变量（如 `const entries = ctx.log`）会被算内部，属少抓方向，登记为已知边界。
 *     总体取向：宁可少免检（多报红人工看），不可多免检（把真红洗掉）。
 */
export function hasExternalCorpusUse(key, ruleSrc) {
    const lines = String(ruleSrc || '').split(/\r?\n/);
    for (let ln = 1; ln <= lines.length; ln++) {
        const cur = lines[ln - 1];
        if (!cur.includes(key) || CTOR_RE.test(cur)) continue;
        const body = functionBodyAt(lines, ln);
        if (!body) continue;
        const local = new Set();
        const pushRe = new RegExp(PUSH_RE_SRC, 'g');
        let pm;
        while ((pm = pushRe.exec(body)) !== null) local.add(pm[1]);
        for (const m of body.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) local.add(m[1]);
        for (const m of body.matchAll(/\(\s*([A-Za-z_$][\w$]*)\s*\)\s*=>/g)) local.add(m[1]);
        for (const m of cur.matchAll(EXTERNAL_MATCH_RE)) {
            const root = m[1].split('.')[0];
            if (!local.has(root)) return true;
        }
    }
    return false;
}

// 统一入口：返回第一个命中的层（顺序即证据强度 L1 > L2 > L3 > L4），兼容第 205 轮的调用方。
export function detectInternalKey(key, ruleSrc) {
    // V1.2.0 前置：双对端键不许免检。E 的职责是「对端不是主代码」，
    // 一旦它同时也去主代码语料认领战报，就仍是绑定键，该红必须留住。
    if (hasExternalCorpusUse(key, ruleSrc)) return null;
    const l1 = isInternalFilterKey(key, ruleSrc);
    if (l1) return { layer: 'L1 前缀筛选', ...l1 };
    const l2 = isInternalParseKey(key, ruleSrc);
    if (l2) return { layer: 'L2 正则解析', ...l2 };
    const l3 = isInternalLoopVarKey(key, ruleSrc);
    if (l3) return { layer: 'L3 循环变量', ...l3 };
    const l4 = isPushTemplateKey(key, ruleSrc);
    if (l4) return { layer: 'L4 push 模板碎片', ...l4 };
    return null;
}

// 第 205 轮留下的 6 条留红，第 206 轮逐条定性（如实记录，防下轮重复踩）：
//   · 319「不在配置集合」→ L2 正则解析式消费：bad 数组元素被 x.match(/…账本 (\S+) 不在配置集合 \{(.*)\}$/)
//       拆字段，对端是规则自己 push 的报文。判据（allowed/inSet/计数）一字未动。
//   · 284「复活后被终局覆盖：uid 」→ L3 循环变量消费：`for (const e of errs) if (e.startsWith(...))`。
//   · 268「单条峰值」、327「其中召唤者是召唤物」、294「她被当成看不见」、308「应仅挂号」→ L4 push 模板碎片：
//       都写在 push 模板里、且被 ${} 切断（如 `' / 单条峰值' + r.peak`、`${chainN} 次）`、`她被当成看不见 / 替身`），
//       没有任何判据消费它们。
