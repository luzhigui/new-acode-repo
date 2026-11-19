// tests/board-open-seed-guard.mjs | V1.0.0 | 2026-11-19 #45 看板 open 数自动补格（OBSERVES，仅报告不写文件）
// 当 board-state-count-guard 报红（open<3）时，按口径计算并报告应补哪几个占位任务；
// 不自动写文件（避免并发写冲突），供人工补格。纯 tests/，只读看板，不碰主代码/判据/基线。
export const VER = 'tests/board-open-seed-guard.mjs V1.0.0';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const board = path.resolve(here, '_registry', 'HEALTH_BOARD.md');

const TASK_ROW_RE = /^\|\s*(\d+)\s*\|/;

// 按「取该编号首次出现行的状态列」口径（与 board-state-count-guard.mjs 同口径）
function parseTaskRow(line) {
    if (!TASK_ROW_RE.test(line)) return null;
    const cells = line.split('|').map(c => c.trim()).filter((c, i) => i > 0 && i < line.split('|').length - 1);
    if (cells.length < 4) return null;
    const num = Number(cells[0]);
    if (!Number.isFinite(num)) return null;
    const state = cells[3];
    if (!/^(open|doing|done|blocked)$/.test(state)) return null;
    return { num, state };
}

function firstOccurrenceState(boardText) {
    const map = new Map();
    for (const line of boardText.split('\n')) {
        const t = parseTaskRow(line);
        if (!t) continue;
        if (!map.has(t.num)) map.set(t.num, t.state);
    }
    return map;
}

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

    const enough = '| # | 标题 | 验收标准 | 状态 | owner | 更新时间 |\n' +
        '|---|------|----------|------|-------|----------|\n' +
        '| 1 | 任务A | desc | open | AI | 2026-11-19 |\n' +
        '| 2 | 任务B | desc | open | AI | 2026-11-19 |\n' +
        '| 3 | 任务C | desc | open | AI | 2026-11-19 |\n';
    ok(countOpen(enough) === 3, '① 3 个 open => 无需补格');

    const notEnough = '| # | 标题 | 验收标准 | 状态 | owner | 更新时间 |\n' +
        '|---|------|----------|------|-------|----------|\n' +
        '| 1 | 任务A | desc | open | AI | 2026-11-19 |\n';
    ok(countOpen(notEnough) === 1, '② 1 个 open => 应补 2 个占位');

    const none = '| # | 标题 | 验收标准 | 状态 | owner | 更新时间 |\n' +
        '|---|------|----------|------|-------|----------|\n' +
        '| 1 | 任务A | desc | done | AI | 2026-11-19 |\n';
    ok(countOpen(none) === 0, '③ 0 个 open => 应补 3 个占位');

    if (fails.length) {
        console.error('❌ 看板 open 数补格自证失败：\n  ' + fails.join('\n  '));
        return { total: 3, fails };
    }
    console.log('✅ 看板 open 数补格自证 3/3（≥3 不补 / 1 补 2 / 0 补 3）');
    return { total: 3, fails };
}

async function main() {
    if (process.argv.includes('--selftest')) {
        const { total, fails } = runSelfTest();
        process.exit(fails.length ? 1 : 0);
    }
    const text = readFileSync(board, 'utf8');
    const n = countOpen(text);
    if (n >= 3) {
        console.log('✅ 看板 open 数=' + n + ' ≥ 3（红线满足），无需补格。');
        process.exit(0);
    }
    const states = firstOccurrenceState(text);
    const openNums = [...states.entries()].filter(([, s]) => s === 'open').map(([n]) => n).sort((a, b) => a - b);
    const maxNum = states.size ? Math.max(...states.keys()) : 0;
    const need = 3 - n;
    const lines = [];
    for (let i = 1; i <= need; i++) {
        const num = maxNum + i;
        lines.push(`| ${num} | 看板 open 数不足补格（自动占位，待人工认领/替换） | 保持「永远 ≥3 个 open」红线。 | open | - | - |`);
    }
    console.log('⚠️ 看板 open 数=' + n + ' < 3（红线未满足），建议补 ' + need + ' 个占位任务：');
    for (const ln of lines) console.log('   ' + ln);
    console.log('   （本脚本仅报告不写文件；由人工将上述行贴进 tests/_registry/HEALTH_BOARD.md 末尾，再 commit + 双推）');
    process.exit(1); // 红：红线未满足
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirect) {
    main().catch(e => { console.error(e); process.exit(1); });
}