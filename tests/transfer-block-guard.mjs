#!/usr/bin/env node
// tests/transfer-block-guard.mjs | V1.0.0 | 2026-11-16 · #15 转交块交付守门（防空头话复发）
//
// 由头（2026-11-14 第14轮真实疏漏）：贡献者报告写「要不要主代码配合：要，但本轮一处没碰」，
// 看板 #11/#12/#13 三行都写「只写转交块、等授权落地」——**一块都没发**。skill §4.5 事后才立
// 「说要主代码配合⇒同轮必贴块」，但那只是文字纪律，别的会话/软件不读 SKILL 就照样犯。
// 本件把该纪律固化成机器约束。
//
// 口径（与 transfer-exit-guard / entry-path-guard 同一套：冻结存量 + 只拦新增 + 确定性缺陷才红）：
//   ① 只扫看板**任务行**（`| 数字 | ... |`），不扫表头/状态约定/守门自身的定义文本
//      —— 否则「转交块交付守门」这行自己的验收标准含关键词会被自命中（防自命中，参见 nightly-merge-guard）。
//   ② 一行命中「空头话标记」且**没有**「已交付登记」标记 ⇒ 记为一条空头话候选。
//   ③ 存量候选冻结进 baseline.json，逐条不判红；**新增**空头话候选 ⇒ 硬红。
//   ④ baseline 只允许收缩（销项后变短），变长 ⇒ 硬红（防把基线当调节阀洗长）。
//   ⑤ 抽取器失位（任务行解析出 0 行 / baseline 损坏）⇒ 硬红，防恒绿。
//
// 空头话标记：要主代码配合 / 需主代码 / 只写转交块 / 等授权落地 / 待补转交块 / 转交块待补
// 已交付登记：转交块已交付 / START 转交块 / 完整代码 / 已落地销项 / 已按转交块落地
// 自指豁免：行内标题含「守门」（本件与其它守门的定义行）
//
// 用法：
//   node tests/transfer-block-guard.mjs              报告 + 硬判据
//   node tests/transfer-block-guard.mjs --selftest    纯内存正负自证（零 IO）
//   node tests/transfer-block-guard.mjs --src=<path>  指定看板副本（夜间基底/自证用）
//   node tests/transfer-block-guard.mjs --update-baseline  冻结当前候选（只许变短）
//
// EXIT 1 = 守门自身失守（新增空头话 / baseline 被洗长 / 抽取器失位），属体检域确定性缺陷。
// 挂 run-all 的 OBSERVES（不改 CHECKS 分母、不改退码口径）。只读 tests/ 文档，不碰主代码。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VER = 'tests/transfer-block-guard.mjs V1.0.0';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const BOARD = 'tests/_registry/HEALTH_BOARD.md';
const BASELINE = 'tests/transfer-block-baseline.json';

const EMPTY_MARKS = ['要主代码配合', '需主代码', '只写转交块', '等授权落地', '待补转交块', '转交块待补'];
const DELIVERED_MARKS = ['转交块已交付', 'START 转交块', '完整代码', '已落地销项', '已按转交块落地'];
const SELF_REF = '守门';

/** 从看板文本抽出任务行（| 数字 | ... |），返回 {id, text}[]。唯一抽取处，守门与自证共用。 */
export function extractTaskRows(text) {
    const out = [];
    for (const line of String(text || '').split(/\r?\n/)) {
        const m = line.match(/^\|\s*(\d+)\s*\|/);
        if (!m) continue;
        out.push({ id: Number(m[1]), text: line });
    }
    return out;
}

/**
 * 判定一行是否为空头话。
 * @param {{id:number,text:string}} row
 * @returns {boolean}
 */
export function isEmptyPromise(row) {
    const t = String((row && row.text) || '');
    // 自指豁免：标题/描述含「守门」的是守门自身定义行
    const cells = t.split('|').map(s => s.trim()).filter(Boolean);
    const title = cells[1] || '';
    if (title.includes(SELF_REF)) return false;
    // 没命中空头话标记 ⇒ 不是候选
    if (!EMPTY_MARKS.some(k => t.includes(k))) return false;
    // 有交付登记 ⇒ 已交块，不是空头话
    if (DELIVERED_MARKS.some(k => t.includes(k))) return false;
    return true;
}

/** 给定文本 → 空头话任务 id 数组（唯一判定处）。 */
export function findEmptyPromises(text) {
    return extractTaskRows(text).filter(isEmptyPromise).map(r => r.id);
}

function normalizeKey(s) {
    return String(s || '').replace(/[\s，,。.；;：:、|"'“”‘’\-—]/g, '').slice(0, 80);
}

function readJson(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function selftest() {
    const cases = [
        { name: 'A 空头话（只写转交块、无交付）', row: '| 9 | X | 发现主代码缺陷→只写转交块、等授权落地 | open | - | - |', want: true },
        { name: 'B 已交块（含「转交块已交付」）', row: '| 11 | X | 转交块已交付（第14轮），落地后复跑 Y | blocked | - | - |', want: false },
        { name: 'C 自指守门行（标题含守门）', row: '| 15 | 转交块交付守门 | 扫「只写转交块」等字样报警 | open | - | - |', want: false },
        { name: 'D 无关任务行', row: '| 6 | run-all 并行化实测 | 提速比与稳定性 | done | - | - |', want: false },
        { name: 'E 表头非任务行', row: '| # | 标题 | 验收标准 | 状态 |', want: null },
        { name: 'F 有标记但已落地销项', row: '| 2 | X | 需主代码修复，已落地销项（261ea965）| done | - | - |', want: false }
    ];
    let bad = 0;
    for (const c of cases) {
        const rows = extractTaskRows(c.row);
        if (c.want === null) {
            const ok = rows.length === 0;
            if (!ok) bad++;
            console.log((ok ? '  ✅ ' : '  ❌ ') + c.name + ' → 抽出任务行 ' + rows.length + '（期望 0）');
        } else {
            const got = rows.length === 1 ? isEmptyPromise(rows[0]) : false;
            const ok = got === c.want;
            if (!ok) bad++;
            console.log((ok ? '  ✅ ' : '  ❌ ') + c.name + ' → 空头话=' + got + '（期望 ' + c.want + '）');
        }
    }
    // G 抽取器规模：整段看板多任务行都抽到
    const sample = '| 1 | A | x | open | - | - |\n| 2 | B | y | done | - | - |\n| 3 | C | z | open | - | - |';
    const n = extractTaskRows(sample).length;
    const gOk = n === 3;
    if (!gOk) bad++;
    console.log((gOk ? '  ✅ ' : '  ❌ ') + 'G 抽取器抽到 3 行任务（防恒绿）');
    console.log(bad ? '结论：' + bad + ' 项自证失败' : '结论：7/7 自证通过（空头话识别 / 自指豁免 / 已交付豁免 / 抽取器规模）');
    return bad ? 1 : 0;
}

function main() {
    if (process.argv.includes('--selftest')) process.exit(selftest());
    const srcArg = process.argv.find(a => a.startsWith('--src='));
    const boardFile = srcArg ? srcArg.slice(6) : BOARD;
    const boardPath = path.isAbsolute(boardFile) ? boardFile : path.join(ROOT, boardFile);
    const update = process.argv.includes('--update-baseline');
    if (!fs.existsSync(boardPath)) {
        console.log('❌ 看板文件不存在：' + boardPath);
        process.exit(1);
    }
    const text = fs.readFileSync(boardPath, 'utf8');
    const rows = extractTaskRows(text);
    if (rows.length < 3) {
        console.log('❌ 抽取器失位：只抽到 ' + rows.length + ' 行任务（下限 3），守门结论不可信');
        process.exit(1);
    }
    const current = findEmptyPromises(text);
    const baselinePath = path.join(ROOT, BASELINE);
    const base = readJson(baselinePath);
    const baseIds = base && Array.isArray(base.emptyPromises) ? base.emptyPromises : null;

    console.log('=== 转交块交付守门 ===');
    console.log('· 看板：' + boardFile + '（任务行 ' + rows.length + '）');
    console.log('· 当前空头话任务：' + (current.length ? current.join('、') : '0 条'));
    console.log('· 基线：' + (baseIds ? baseIds.join('、') || '（空）' : '不存在'));

    if (update) {
        if (baseIds && current.length > baseIds.length) {
            console.log('❌ 基线只许收缩：当前 ' + current.length + ' 条 > 基线 ' + baseIds.length + ' 条，拒绝洗长');
            process.exit(1);
        }
        fs.writeFileSync(baselinePath, JSON.stringify({ emptyPromises: current, note: '冻结的空头话任务 id；只许收缩' }, null, 2) + '\n');
        console.log('✅ 基线已更新（' + current.length + ' 条，只许收缩）');
        process.exit(0);
    }

    const fails = [];
    if (!baseIds) {
        fails.push('基线缺失或损坏：' + BASELINE + '（抽取器/基线失位 ⇒ 守门恒绿，先修本件）');
    } else {
        const added = current.filter(id => !baseIds.includes(id));
        if (added.length) fails.push('新增空头话任务 ' + added.join('、') + '：声称要主代码配合却无转交块交付登记（见 SKILL.md §4.5）');
        const grew = current.length > baseIds.length;
        if (grew) fails.push('空头话集合变长（' + baseIds.length + '→' + current.length + '），基线被当调节阀');
    }
    if (fails.length) {
        for (const f of fails) console.log('❌ ' + f);
        console.log('结论：转交块交付守门失守 ' + fails.length + ' 项');
        process.exit(1);
    }
    console.log('✅ 转交块交付守门通过：无新增空头话、基线未变长、抽取器在位');
    process.exit(0);
}

main();
