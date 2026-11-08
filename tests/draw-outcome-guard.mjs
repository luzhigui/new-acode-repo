// tests/draw-outcome-guard.mjs
// 体检守卫：胜负/平局统计口径的**静态**一致性（引擎 winner 三态恒有值）
//
// 背景（2026-11-08）：引擎判胜只产 '明教' / '六大派' / '平局' 三个值，winner 从不为空
//   （core/210 teamAliveOrPending 判胜 + MAX_ROUND 平局），所以任何「winner 为空 ⇒ 平局」的写法都是**死守卫**：
//   · `if (!res.winner) { draws++ }` ⇒ draws 永远 0（816 的 __meta.draws 就是这么坏的）；
//   · `if (!res.winner) continue` ⇒ 平局场照样进分母，但被当成「没打赢」。
//   统计口径已定：**胜 = winner === '明教'**；平局只进分母（败/平都算非胜场）。
//
// 判据：
//   ① tests/ 下（排除 health-rules 与本文件）不得出现 `if (!x.winner)` 形式的空值判平局/跳过 —— 红；
//   ② tests/ 下不得出现 `meta.draws += 1` 被 `!winner` 守卫 —— 红（同上，换写法也逃不掉）；
//   ③ 报告项（不计退码）：tools/ 下同类死守卫清单（主代码侧，已登记在 tests/known-transfers.md）；
//      以及 tests/ 里 winner 三态的引用分布，便于确认「胜 = '明教'」口径有没有扩散。
//   合法的 `while (... && !winner)` / `if (!winner && lastStep)` 属于循环状态位，不是平局判断，不判。
//
// 用法：node tests/draw-outcome-guard.mjs   # 退 0 = 口径干净
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VER = 'tests/draw-outcome-guard.mjs V1.0.0';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');

function walk(dir, out, skip) {
    let st;
    try { st = statSync(dir); } catch (e) { return out; }
    if (!st.isDirectory()) return out;
    for (const name of readdirSync(dir)) {
        if (name.startsWith('.')) continue;
        const p = join(dir, name);
        const s = statSync(p);
        if (s.isDirectory()) { walk(p, out, skip); continue; }
        if (!/\.(mjs|js)$/.test(name)) continue;
        if (skip && skip(p)) continue;
        out.push(p);
    }
    return out;
}

function rel(p) { return p.slice(REPO.length + 1).replace(/\\/g, '/'); }
function lineOf(src, idx) { return src.slice(0, idx).split('\n').length; }

// 把注释和字符串字面量挖成空格，长度不变 ⇒ 偏移和行号仍对得上原文件。
// 不这么做会把「体检报告正文里引用的 if (!res.winner)」当成真代码（2026-11-08 实测误报 6 处）。
// 模板串里的 ${...} 属于真代码，照常扫描（嵌套模板串也要能穿透）。
function stripLiterals(src) {
    const n = src.length;
    const out = src.split('');
    const blank = (a, b) => { for (let k = a; k < b && k < n; k++) if (out[k] !== '\n') out[k] = ' '; };

    function scanTemplate(start) {                 // start 指向开头的反引号
        let j = start + 1, seg = start + 1;
        while (j < n) {
            if (src[j] === '\\') { j += 2; continue; }
            if (src[j] === '`') { blank(seg, j); return j + 1; }
            if (src[j] === '$' && src[j + 1] === '{') {
                blank(seg, j);
                const end = scanCode(j + 2, true);
                j = end + 1; seg = j; continue;
            }
            j++;
        }
        blank(seg, n); return n;
    }

    function scanCode(from, untilBrace) {
        let i = from, depth = 0;
        while (i < n) {
            const c = src[i];
            if (untilBrace && depth === 0 && c === '}') return i;
            if (c === '/' && src[i + 1] === '/') {
                let j = src.indexOf('\n', i); if (j < 0) j = n;
                blank(i + 2, j); i = j; continue;
            }
            if (c === '/' && src[i + 1] === '*') {
                let j = src.indexOf('*/', i + 2); j = (j < 0 ? n : j + 2);
                blank(i, j); i = j; continue;
            }
            if (c === '\'' || c === '"') {
                let j = i + 1;
                while (j < n) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === c) break; j++; }
                blank(i + 1, j); i = j + 1; continue;
            }
            if (c === '`') { i = scanTemplate(i); continue; }
            if (c === '{') { depth++; i++; continue; }
            if (c === '}') { depth--; i++; continue; }
            i++;
        }
        return n;
    }

    scanCode(0, false);
    return out.join('');
}

// 「winner 为空 ⇒ 平局/跳过」的两种写法
const DEAD_PROP = /if\s*\(\s*!\s*[A-Za-z_$][\w$]*\s*\.\s*winner\s*\)/g;   // if (!res.winner)
const DEAD_PROPSPACE = /if\s*\(\s*!\s*[A-Za-z_$][\w$]*\s*\.\s*winner\s*[|&|=]/g;
const DEAD_HEAD = /!\s*[A-Za-z_$][\w$]*\s*\.\s*winner/;                   // 无 g，供局部片段判断
const DRAW_INC = /(?:meta|m|s|acc|out|stat)[\w$]*\s*\.\s*draws\s*(?:\+\+|\+=|=\s*[\w$]*draws\s*\+)/g;
const WIN_MINGJIAO = /winner\s*===\s*['"]明教['"]/g;
const WIN_DRAW = /winner\s*===\s*['"]平局['"]/g;

const testsFiles = walk(HERE, [], (p) => /health-rules/.test(p) || rel(p) === 'tests/draw-outcome-guard.mjs');
const toolFiles = walk(join(REPO, 'tools'), [], () => false);

let fails = 0;
function fail(msg) { fails++; console.log('❌ ' + msg); }

console.log('=== 胜负/平局统计口径守卫 ===');
console.log('VER ' + VER);

const testFindings = [];
const reportOnly = [];
let mingjiaoRefs = 0, drawRefs = 0;

for (const abs of testsFiles) {
    const src = readFileSync(abs, 'utf8');
    const bare = stripLiterals(src);
    const dead = [...bare.matchAll(DEAD_PROP), ...bare.matchAll(DEAD_PROPSPACE)];
    for (const m of dead) {
        testFindings.push(`${rel(abs)}:${lineOf(bare, m.index)} —— \`${src.substr(m.index, m[0].length).trim()}\`（winner 恒非空 ⇒ 死守卫；胜应写 winner === '明教'）`);
    }
    for (const m of bare.matchAll(DRAW_INC)) {
        const head = bare.slice(Math.max(0, m.index - 200), m.index);
        if (head.includes('!winner') || DEAD_HEAD.test(head)) {
            testFindings.push(`${rel(abs)}:${lineOf(bare, m.index)} —— 平局计数被空值守卫包住（draws 恒 0）`);
        }
    }
    mingjiaoRefs += [...bare.matchAll(WIN_MINGJIAO)].length;
    drawRefs += [...bare.matchAll(WIN_DRAW)].length;
}

if (testFindings.length) {
    fail('tests/ 里存在「winner 为空 ⇒ 平局」死守卫 ' + testFindings.length + ' 处：');
    for (const t of testFindings.slice(0, 8)) console.log('   • ' + t);
    if (testFindings.length > 8) console.log('   … 其余 ' + (testFindings.length - 8) + ' 处');
} else {
    console.log('① tests/ 无空值判平局死守卫（0 处）');
}

for (const abs of toolFiles) {
    const bare = stripLiterals(readFileSync(abs, 'utf8'));
    const dead = [...bare.matchAll(DEAD_PROP)].length;
    if (dead) reportOnly.push(`${rel(abs)}（${dead} 处）`);
}
console.log('③ 报告项（不计退码）：' +
    (reportOnly.length
        ? 'tools/ 主代码侧仍有空值守卫：' + reportOnly.join('、') + '（已登记 tests/known-transfers.md）'
        : 'tools/ 未发现空值守卫') + `；tests/ 内 winner==='明教' ${mingjiaoRefs} 处、winner==='平局' ${drawRefs} 处`);

console.log(fails ? `\nRESULT: FAIL（${fails} 项）` : '\nRESULT: PASS');
process.exit(fails ? 1 : 0);
