// tests/_lib/read-if-abs.mjs — 读文件容错收口（第二份重复普查第 151 轮抽提）
// V1.0.0 | 2026-10-31 第 165 轮(续)：contract-binding-drift / rule-binding-drift 两处逐字重复的
//   readIfAbs 收口为唯一来源，消除 second-source-scan 棘轮越界（逐字重复函数 5 组 → 4 组）。
//   口径：原样保留两处的行为（try readFileSync catch 返回 ''），只换存放位置。
export const VER = 'tests/_lib/read-if-abs.mjs V1.0.0';

import fs from 'node:fs';

export function readIfAbs(p) {
    try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; }
}
