// tests/board-state-count-guard.mjs | V1.0.0 | 2026-11-18 #41 看板解析脚本（机器校验 open 计数 ≥3）
// 口径：「取该编号首次出现行的状态列」——每个编号只看其在表里第一次出现的行，
// 跳过随后的转交块/续行说明行；统计状态列为 `open` 的任务数，<3 即退码 1。
// 纯 tests/，不碰主代码/判据/基线；挂进 run-all CHECKS（只报，不改分母）。
export const VER = 'tests/board-state-count-guard.mjs V1.0.0';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const board = path.resolve(here, '_registry', 'HEALTH_BOARD.md');

// 任务行正则：| # | 标题 | ... | 状态 | owner | 更新时间 |
// 状态列在行拆分后第 4 个非空单元格（0-index: | # | 标题 | 验收标准 | 状态 | ...）
const TASK_ROW_RE = /^\|\s*(\d+)\s*\|/;

// 从行里按 `|` 拆分，取各单元格；返回 { num, state } 或 null（非任务行）
function parseTaskRow(line) {
    if (!TASK_ROW_RE.test(line)) return null;
    const cells = line.split('|').map(c => c.trim()).filter((c, i) => i > 0 && i < line.split('|').length - 1);
    // cells[0]=#, cells[1]=标题, cells[2]=验收标准, cells[3]=状态, cells[4]=owner, cells[5]=更新时间
    if (cells.length < 4) return null;
    const num = Number(cells[0]);
    if (!Number.isFinite(num)) return null;
    const state = cells[3];
    if (!/^(open|doing|done|blocked)$/.test(state)) return null;
    return { num, state };
}

/**
 * 按「首次出现行」口径统计各编号的状态。
 * @param {string} boardText
 * @returns {Map<number, string>} 编号 -> 状态（取首次出现行）
 */
function firstOccurrenceState(boardText) {
    const map = new Map();
    for (const line of boardText.split('\n')) {
        const t = parseTaskRow(line);
        if (!t) continue;
        if (!map.has(t.num)) map.set(t.num, t.state);
    }
    return map;
}

/**
 * 统计 open 数（按首次出现行口径）。
 * @param {string} boardText
 * @returns {number}
 */
function countOpen(boardText) {
    const states = firstOccurrenceState(boardText);
    let n = 0;
    for (const st of states.values()) if (st === 'open') n++;
    return n;
}

// 离线自证（纯逻辑，不碰磁盘基线）
export function runSelfTest() {
    const fails = [];
    const ok = (cond, desc) => { if (!cond) fails.push(desc); };

    const good = '| # | 标题 | 验收标准 | 状态 | owner | 更新时间 |\n' +
        '|---|------|----------|------|-------|----------|\n' +
        '| 1 | 任务A | desc | open | AI | 2026-11-18 |\n' +
        '| 2 | 任务B | desc | doing | AI | 2026-11-18 |\n' +
        '| 3 | 任务C | desc | done | AI | 2026-11-18 |\n';
    ok(countOpen(good) === 1, '① 3 个任务 1 个 open => 计数 1');

    const cross = '| 4 | 跨行标题 | desc | open | AI | 2026-11-18 |\n' +
        '状态: open 说明: 跨行续行（不应被再次计数） |\n' +
        '| 5 | 任务E | desc | open | AI | 2026-11-18 |\n' +
        '| 6 | 任务F | desc | open | AI | 2026-11-18 |\n';
    ok(countOpen(cross) === 3, '② 跨行续行行不影响，#4 只算首次出现行 => open 计数 3（#4,#5,#6）');

    const exactly3 = '| 7 | 任务G | desc | open | AI | 2026-11-18 |\n' +
        '| 8 | 任务H | desc | open | AI | 2026-11-18 |\n' +
        '| 9 | 任务I | desc | open | AI | 2026-11-18 |\n';
    ok(countOpen(exactly3) === 3, '③ 恰好 3 个 open => 计数 3（红线边界，不应判红）');

    const only2 = '| 10 | 任务J | desc | open | AI | 2026-11-18 |\n' +
        '| 11 | 任务K | desc | open | AI | 2026-11-18 |\n';
    ok(countOpen(only2) === 2, '④ 只有 2 个 open => 计数 2（<3，应红）');

    const allDone = '| 12 | 任务L | desc | done | AI | 2026-11-18 |\n' +
        '| 13 | 任务M | desc | blocked | AI | 2026-11-18 |\n';
    ok(countOpen(allDone) === 0, '⑤ 全 done/blocked => 计数 0');

    if (fails.length) {
        console.error('❌ 看板 open 计数自证失败：\n  ' + fails.join('\n  '));
        return { total: 5, fails };
    }
    console.log('✅ 看板 open 计数自证 5/5（首次出现行口径 / 跨行不误判 / 边界 3 绿 / 2 红 / 0 绿不误报）');
    return { total: 5, fails };
}

async function main() {
    if (process.argv.includes('--selftest')) {
        const { total, fails } = runSelfTest();
        process.exit(fails.length ? 1 : 0);
    }
    const text = readFileSync(board, 'utf8');
    const n = countOpen(text);
    const states = firstOccurrenceState(text);
    const openNums = [...states.entries()].filter(([, s]) => s === 'open').map(([n]) => n).sort((a, b) => a - b);
    if (n < 3) {
        console.error('❌ 看板 open 计数守门：open=' + n + ' < 3（开启任务不足，红线）。open 编号：' + (openNums.join(', ') || '（无）'));
        process.exit(1);
    }
    console.log('✅ 看板 open 计数守门：open=' + n + ' ≥ 3（红线满足）。open 编号：' + openNums.join(', '));
    process.exit(0);
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirect) {
    main().catch(e => { console.error(e); process.exit(1); });
}