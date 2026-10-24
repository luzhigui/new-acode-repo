#!/usr/bin/env node
// tests/_lib/rule-branch-extract.mjs | V1.0.0 | 2026-10-25 第 133 轮
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

export const VER = 'tests/_lib/rule-branch-extract.mjs V1.0.0';

const here = path.dirname(fileURLToPath(import.meta.url));

/** 规则文件目录（tests/health-rules） */
export const RULE_DIR = path.join(here, '..', 'health-rules');

/** 最短可定位指纹长度（短于此视为"多分支共用短前缀"，不可定位） */
export const MIN_FP_LEN = 4;

/** 剥注释但保留字符串/正则字面量原样（指纹靠字符串字面量，注释里的字符串不能算） */
export function stripCommentsKeepStrings(src) {
    let out = '';
    let i = 0;
    const n = src.length;
    while (i < n) {
        const ch = src[i];
        if (ch === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
        if (ch === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
        if (ch === '"' || ch === "'" || ch === '`') {
            const q = ch;
            let j = i + 1;
            while (j < n) {
                if (src[j] === '\\') { j += 2; continue; }
                if (src[j] === q) { j++; break; }
                j++;
            }
            out += src.slice(i, j);
            i = j;
            continue;
        }
        out += ch;
        i++;
    }
    return out;
}

/** 抽取一个规则文件里的全部判据分支（按源码顺序） */
export function extractBranches(src, file) {
    const lines = stripCommentsKeepStrings(src).split('\n');
    const out = [];
    let curRule = null;
    for (let li = 0; li < lines.length; li++) {
        const L = lines[li];
        const nm = L.match(/name:\s*(['"])(.*?)\1/);
        if (nm) curRule = nm[2];
        if (!/fail:\s*true/.test(L)) continue;
        // msg 可能换行书写，向后多看 6 行拼成片段；★ 但**只取到本语句结束**（含 msg 的那条 return
        // 语句的第一个分号前）—— 旧口径会越过语句边界，把后续代码里的别的字符串误当成本分支指纹。
        let seg = L;
        for (let k = 1; k <= 6 && li + k < lines.length; k++) {
            seg += '\n' + lines[li + k];
            const ms = seg.indexOf('msg:');
            const term = ms === -1 ? -1 : seg.indexOf(';', ms);
            if (term !== -1) { seg = seg.slice(0, term); break; }
        }
        const mi = seg.indexOf('msg:');
        let fp = null;
        if (mi !== -1) {
            const m = seg.slice(mi + 4, mi + 404).match(/(['"`])((?:\\.|(?!\1).)*)\1/);
            if (m) {
                let v = m[2];
                const d = v.indexOf('${');       // 模板插值处截断，只取静态前缀
                if (d !== -1) v = v.slice(0, d);
                v = v.trim();
                if (v.length >= MIN_FP_LEN) fp = v;
            }
        }
        out.push({ file, rule: curRule, fp });
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
 * 在候选分支里找能匹配该 msg 的分支（命中判定与运行时一致：msg 以分支指纹为前缀）。
 * 只在同一规则名下找 —— 跨规则匹配属口径错误。
 */
export function findBranchByMsg(cands, msg) {
    return cands.find(b => b.fp && msg.startsWith(b.fp)) || null;
}
