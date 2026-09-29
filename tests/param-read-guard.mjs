// tests/param-read-guard.mjs V1.2.0 | 预估 ~12400 bytes
// V1.2.0 | 2026-09-29 参数单一真值源收口：新增第二侧校验 —— 复用 tests/health-rules/156 的
//   checkDescTruth()，核对「技能说明里的数字 == mechanics 引擎真值」（core/01 DESC_TRUTH 映射）。
//   两侧任一漂移都退出码 1。该侧需先垫 file:// fetch 并 loadGameData() 才能读到 content。
// 2026-09-29 立；V1.1.0 增「孤儿登记」一侧：skills.params「引擎真读字段」漂移守卫 —— 静态扫全仓
//   getSkillParams( 调用点，提取每个技能键被读的字段，与 tools/120-param-lab-glossary.js 的
//   ENGINE_READ / ENGINE_READ_DYNAMIC / ENGINE_READ_NONE / ENGINE_READ_ORPHAN 双向比对。表一旦过时
//   （引擎新增/删除某种读取）本检查立刻报红并打印差异。
//   孤儿登记（ENGINE_READ_ORPHAN）= 源码里确实存在读取点、但所在函数全仓无调用点（孤儿/死代码），
//   实际不生效。登记在案不算漂移；**反向也管住** —— 源码里那个读取点消失了（例如孤儿函数被删）
//   就报「孤儿登记已失效，请从 ENGINE_READ_ORPHAN 里删掉」，避免登记表自己腐烂。
//
// 为什么要有它：glossary 那张 ENGINE_READ 表是**手写的源码快照**，引擎侧以后改读取不会自动同步；
//   最危险的漂移是「某字段真被读了，表里却仍标成仅文案」——会误导人跳过有效旋钮。本守卫把「表 == 源码」
//   变成机器可校验的事实；表只此一份（直接 import，不复制），没有第二个腐化点。
//
// 扫描范围：只扫 core/、modules/、render/ 三个引擎目录 —— getSkillParams 的**计算侧**读取都在这里
//   （见 glossary 表头「读取点」清单）。刻意排除：
//     · tools/  —— 工具侧读取（如 tools/108-hex-dashboard.js 做展示）算不到引擎头上；
//     · tests/  —— 体检自用（如 health-rules/141 读 tenRoundFortify.round 做判据）同理；
//     · ui/ player/ fx/ infra/ —— 现无读取点，且属表现/基础设施层，不承担战斗数值。
//
// 提取策略（务实、不求 100% JS 语义分析）：
//   1) 先把注释与字符串/模板内容掩成空格（保留长度与换行），得到「结构性视图」，在其上做括号配对、
//      取字段、找变量 —— 避免字符串里的花括号/字段名造成误判；
//   2) 调用形态三选一：
//      a. 直接链式 getSkillParams(...).prop / ?.prop   → 记该 prop；
//      b. 赋值 const NAME = getSkillParams(...)         → 在该**最内层花括号块**（= const 的作用域）内，
//         找 NAME 后续被访问的字段名（同一文件里 else 分支/另一个函数里的同名 const 互不干扰）；
//      c. 裸调用（存在性校验，如 if (!getSkillParams(...))）→ 记「未读」。
//   3) NAME[动态键]（如 s[hexKey]）→ 记「整包动态读」，归 ENGINE_READ_DYNAMIC 一边，不逐字段比对、不误报。
//
// 双向比对（两类都算失败）：
//   ① 表里登记被读、源码里没扫到 → 「表陈旧（多了）」；
//   ② 源码里扫到被读、表里没登记 → 「表遗漏（少了）」。
//   子字段规则：表登记父路径时其任意子字段算已登记（表值 = 顶层字段名即可满足引擎现状）。
//
// 运行：node tests/param-read-guard.mjs        → 一致退出码 0；发现漂移退出码 1
export const VER = 'tests/param-read-guard.mjs V1.2.0';

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ENGINE_READ, ENGINE_READ_DYNAMIC, ENGINE_READ_NONE, ENGINE_READ_ORPHAN } from '../tools/120-param-lab-glossary.js';

const ROOTS = ['../core/', '../modules/', '../render/'];

// ---- 文本视图：注释 + 字符串/模板内容 → 空格（保留长度与换行），并记录字符串字面量值 ----
function maskLiterals(code) {
    const chars = code.split('');
    const literals = [];
    const n = code.length;
    let i = 0;
    const blank = (k) => { if (code[k] !== '\n') chars[k] = ' '; };
    while (i < n) {
        const c = code[i], d = code[i + 1];
        if (c === '/' && d === '/') { while (i < n && code[i] !== '\n') { blank(i); i++; } continue; }
        if (c === '/' && d === '*') {
            blank(i); blank(i + 1); i += 2;
            while (i < n && !(code[i] === '*' && code[i + 1] === '/')) { blank(i); i++; }
            if (i < n) { blank(i); blank(i + 1); i += 2; }
            continue;
        }
        if (c === '"' || c === "'") {
            const q = c, start = i;
            blank(i); i++;
            let value = '';
            while (i < n) {
                const ch = code[i];
                if (ch === '\\') { blank(i); i++; if (i < n) { blank(i); i++; } continue; }
                if (ch === q) { blank(i); i++; break; }
                value += ch; blank(i); i++;
            }
            literals.push({ start, end: i, value });
            continue;
        }
        // 模板字符串：静态文本掩掉，但 ${...} 里的**是代码**（很多字段读取就写在插值里，
        //   如 `${counter.dmgRatio}`）；整段掩掉会把真实读取漏掉 —— 必须保留插值内容。
        if (c === '`') {
            const start = i;
            blank(i); i++;
            let value = '';
            while (i < n) {
                const ch = code[i];
                if (ch === '\\') { blank(i); i++; if (i < n) { blank(i); i++; } continue; }
                if (ch === '`') { blank(i); i++; break; }
                if (ch === '$' && code[i + 1] === '{') {
                    blank(i); blank(i + 1); i += 2;
                    let depth = 1;
                    while (i < n && depth > 0) {
                        const cc = code[i];
                        if (cc === '{') depth++;
                        else if (cc === '}') { depth--; if (depth === 0) { blank(i); i++; break; } }
                        i++;
                    }
                    continue;
                }
                value += ch; blank(i); i++;
            }
            literals.push({ start, end: i, value });
            continue;
        }
        i++;
    }
    return { masked: chars.join(''), literals };
}

// 从 idx 起读取一次属性访问 `.prop` / `?.prop`（允许中间空白）；无则返回 null
function propAt(s, idx) {
    let j = idx;
    while (j < s.length && /\s/.test(s[j])) j++;
    if (s[j] === '?' && s[j + 1] === '.') j += 2;
    else if (s[j] === '.') j += 1;
    else return null;
    const m = /^[A-Za-z_$][\w$]*/.exec(s.slice(j));
    if (!m) return null;
    return { prop: m[0], next: j + m[0].length };
}

// 最内层花括号块 [start,end)（= const 的文本作用域）
// 注意：相对深度降到 **-1** 才是「包住 idx 的那层」的闭合括号；降到 0 只是 idx 之后的
//   某个独立代码块（如 push({...}) 的对象字面量）闭合。起初写成 ==0，导致作用域被提前截断，
//   同一函数后半段的字段读取（modules/27 的 s.defToHeal/defToAtk）扫不到 —— 是真漏，不是保守。
function enclosingBlock(s, idx) {
    let depth = 0, start = -1;
    for (let i = idx - 1; i >= 0; i--) {
        if (s[i] === '}') depth++;
        else if (s[i] === '{') { if (depth === 0) { start = i; break; } depth--; }
    }
    depth = 0;
    let end = s.length;
    for (let i = idx; i < s.length; i++) {
        if (s[i] === '{') depth++;
        else if (s[i] === '}') { depth--; if (depth < 0) { end = i; break; } }
    }
    return { start, end };
}

// callStart 紧邻左侧是否 `const/let/var NAME =`，是则返回 NAME
function assignNameBefore(s, callStart) {
    let j = callStart - 1;
    while (j >= 0 && /\s/.test(s[j])) j--;
    if (s[j] !== '=' || s[j - 1] === '=' || s[j - 1] === '!' || s[j - 1] === '<' || s[j - 1] === '>') return null;
    j--;
    while (j >= 0 && /\s/.test(s[j])) j--;
    const end = j + 1;
    while (j >= 0 && /[\w$]/.test(s[j])) j--;
    const name = s.slice(j + 1, end);
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) return null;
    let k = j;
    while (k >= 0 && /\s/.test(s[k])) k--;
    const kwEnd = k + 1;
    while (k >= 0 && /[a-z]/.test(s[k])) k--;
    const kw = s.slice(k + 1, kwEnd);
    return /^(const|let|var)$/.test(kw) ? name : null;
}

// 解析调用实参：返回 [{start,end}]（顶层逗号切分）；括号已配平
function parseArgs(s, openParen) {
    const args = [];
    let depth = 1, i = openParen + 1, segStart = i;
    while (i < s.length) {
        const c = s[i];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) { args.push({ start: segStart, end: i }); return { args, close: i }; } }
        else if (c === ',' && depth === 1) { args.push({ start: segStart, end: i }); segStart = i + 1; }
        i++;
    }
    return { args, close: -1 };
}

function extractFromFile(rel, code, acc) {
    const { masked, literals } = maskLiterals(code);
    const callRe = /(?<![\w$.])getSkillParams\s*\(/g;
    let m;
    while ((m = callRe.exec(masked)) !== null) {
        const callStart = m.index;
        const openParen = callStart + m[0].length - 1;
        const { args, close } = parseArgs(masked, openParen);
        if (close < 0) continue;
        // 只认 (字符串, 字符串) 两参形态；其余（含 core/01 的定义行、变量参数）跳过
        const strs = args.map(a => {
            const seg = masked.slice(a.start, a.end).trim();
            if (seg !== '') return null;
            const hit = literals.find(l => l.start >= a.start && l.end <= a.end);
            return hit ? hit.value : null;
        });
        if (args.length !== 2 || strs.some(v => v === null)) continue;
        const key = strs[1];
        const callEnd = close + 1;
        const entry = acc.get(key) || { fields: new Set(), dynamic: false, noneOnly: false, sites: [] };
        entry.sites.push(rel);
        // 形态 a：直接链式
        const chain = propAt(masked, callEnd);
        if (chain) {
            entry.fields.add(chain.prop);
        } else {
            // 形态 b：赋值变量
            const name = assignNameBefore(masked, callStart);
            if (name) {
                const { end } = enclosingBlock(masked, callStart);
                const block = masked.slice(callEnd, end);
                const useRe = new RegExp('(?<![\\w$.])' + name + '(?![\\w$])', 'g');
                let u;
                while ((u = useRe.exec(block)) !== null) {
                    const abs = callEnd + u.index + name.length;
                    let j = abs; while (j < masked.length && /\s/.test(masked[j])) j++;
                    if (masked[j] === '[') { entry.dynamic = true; continue; }
                    const p = propAt(masked, abs);
                    if (p) entry.fields.add(p.prop);
                }
            } else {
                // 形态 c：裸调用 = 仅存在性校验
                entry.noneOnly = true;
            }
        }
        acc.set(key, entry);
    }
}

async function collectFiles(dirUrl) {
    const out = [];
    let entries;
    try { entries = await readdir(dirUrl, { withFileTypes: true }); } catch (e) { return out; }
    for (const e of entries) {
        const child = new URL(e.name + (e.isDirectory() ? '/' : ''), dirUrl);
        if (e.isDirectory()) out.push(...await collectFiles(child));
        else if (e.name.endsWith('.js')) out.push(child);
    }
    return out;
}

// ---- 第二侧：技能说明数字 == 引擎真值（复用 156 规则的同一实现，不另写判据）----
async function checkDescTruthDrift() {
    // Node 的 fetch 不支持 file://：垫一个读本地文件的 shim，再 loadGameData（health-rules/156 依赖它）
    const fs = await import('node:fs');
    globalThis.fetch = async (url) => {
        const p = fileURLToPath(new URL(url));
        return { ok: true, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) };
    };
    const { loadGameData } = await import('../core/01config-5v5-test.js');
    await loadGameData();
    const { checkDescTruth } = await import('./health-rules/156-desc-truth-drift.js');
    return checkDescTruth();
}

async function main() {
    const acc = new Map();
    let fileCount = 0;
    const scanned = [];
    for (const root of ROOTS) {
        const dirUrl = new URL(root, import.meta.url);
        for (const url of await collectFiles(dirUrl)) {
            const code = await readFile(url, 'utf8');
            const rel = fileURLToPath(url).split(/[\\/]new-acode-repo[\\/]/).pop();
            fileCount++;
            if (/getSkillParams\s*\(/.test(code.replace(/\/\/.*$/gm, ''))) scanned.push(rel);
            extractFromFile(rel, code, acc);
        }
    }

    const orphanKeys = new Set(Object.keys(ENGINE_READ_ORPHAN));
    const tableKeys = new Set([...Object.keys(ENGINE_READ), ...ENGINE_READ_DYNAMIC, ...ENGINE_READ_NONE, ...orphanKeys]);
    const problems = [];

    // ① 表陈旧：登记了、源码没扫到（孤儿登记另有专门的「失效」判据）
    for (const k of tableKeys) {
        if (acc.has(k)) continue;
        if (orphanKeys.has(k)) problems.push({ kind: 'orphan-stale', key: k, fields: ENGINE_READ_ORPHAN[k] });
        else problems.push({ kind: 'stale-key', key: k });
    }

    // ② 已登记的键：字段双向比对
    for (const k of tableKeys) {
        if (!acc.has(k)) continue;
        const s = acc.get(k);
        if (ENGINE_READ_DYNAMIC.has(k)) continue;              // 动态整包：不逐字段
        if (ENGINE_READ_NONE.has(k)) {
            if (s.fields.size > 0) problems.push({ kind: 'should-be-engine', key: k, fields: [...s.fields] });
            continue;
        }
        // 孤儿登记：读取点还在 → 认账，不算漂移；登记的那几个字段在源码里找不到 → 报「登记失效」
        if (orphanKeys.has(k)) {
            const of = ENGINE_READ_ORPHAN[k];
            for (const t of of) {
                if (![...s.fields].some(f => f === t || f.startsWith(t + '.'))) problems.push({ kind: 'orphan-stale', key: k, field: t });
            }
            for (const f of s.fields) {
                if (!of.some(t => f === t || f.startsWith(t + '.'))) problems.push({ kind: 'missing-field', key: k, field: f });
            }
            continue;
        }
        const tf = ENGINE_READ[k] || [];
        for (const t of tf) {
            if (![...s.fields].some(f => f === t || f.startsWith(t + '.'))) problems.push({ kind: 'stale-field', key: k, field: t });
        }
        for (const f of s.fields) {
            if (!tf.some(t => f === t || f.startsWith(t + '.'))) problems.push({ kind: 'missing-field', key: k, field: f });
        }
    }

    // ③ 源码扫到、表里完全没有
    for (const [k, s] of acc) {
        if (tableKeys.has(k)) continue;
        if (s.fields.size > 0) problems.push({ kind: 'missing-key', key: k, fields: [...s.fields] });
        else if (s.dynamic) problems.push({ kind: 'dynamic-unregistered', key: k });
        else problems.push({ kind: 'none-unregistered', key: k });
    }

    console.log('=== skills.params 引擎真读字段 · 漂移守卫 ===');
    console.log(`扫描 core/ modules/ render/：${fileCount} 文件；命中 getSkillParams 的文件 ${scanned.length} 个；技能键 ${acc.size} 个`);
    console.log(`登记表：ENGINE_READ ${Object.keys(ENGINE_READ).length} 键 · DYNAMIC ${ENGINE_READ_DYNAMIC.size} 键 · NONE ${ENGINE_READ_NONE.size} 键 · 孤儿登记 ${orphanKeys.size} 项`);

    const descProblems = await checkDescTruthDrift();

    if (problems.length === 0 && descProblems.length === 0) {
        console.log('\n✅ 表与源码双向一致（引擎读取无漂移）');
        console.log('✅ 技能说明数字与引擎真值一致（DESC_TRUTH 全部命中）');
        process.exit(0);
    }

    if (problems.length === 0) {
        console.log('\n✅ 表与源码双向一致（引擎读取无漂移）');
    } else {
        const label = {
            'stale-key': '表陈旧（源码已不读该技能键）',
            'stale-field': '表陈旧（源码已不读该字段）',
            'missing-field': '表遗漏（源码读了，表未登记）',
            'missing-key': '表遗漏（整键未登记）',
            'should-be-engine': '分类错误（表列为仅校验，源码实读字段）',
            'dynamic-unregistered': '表遗漏（源码整包动态读，未列入 DYNAMIC）',
            'none-unregistered': '表遗漏（源码仅存在性校验，未列入 NONE）',
            'orphan-stale': '孤儿登记已失效（源码已无该读取点，请从 ENGINE_READ_ORPHAN 删掉）'
        };
        console.log('\n发现漂移：');
        for (const p of problems) {
            const extra = p.field ? ` 字段「${p.field}」` : (p.fields ? ` 字段 ${p.fields.join('、')}` : '');
            console.log(`  ✗ [${label[p.kind]}] ${p.key}${extra}`);
        }
        console.log(`\n✗ 共 ${problems.length} 项漂移 —— ENGINE_READ 表已过时，请同步 tools/120-param-lab-glossary.js`);
    }
    if (descProblems.length) {
        console.log('\n技能说明数字 vs 引擎真值 漂移：');
        for (const d of descProblems) console.log(`  ✗ ${d}`);
        console.log(`\n✗ 共 ${descProblems.length} 项 —— 请同步 content/200game-data.json 与 core/01 DESC_TRUTH`);
    }
    process.exit(1);
}

main().catch(e => { console.error('[param-read-guard] 异常：', e); process.exit(1); });