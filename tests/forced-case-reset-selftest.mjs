// V1.0.0 | 2026-11-17 第37轮新建：强制开关「空值形态」与 store schema 类型的一致性守门。
// tests/forced-case-reset-selftest.mjs
//
// 干什么：盯住 `tests/_lib/forced-case-normalize.mjs` 的 `RESET_VALUE`（各 force 开关的复位值）
//   与主代码 `infra/112-store-schema.js` 里这些键的**权威类型声明**一一对得上。
//
// ★ 为什么要有它（本轮真踩出来的坑，不是设想）：
//   第37轮把 FORCE_KEYS 从 3 条补到 9 条（补 forceZhang / forceHanLiSa / forcePang /
//   forceWeakElite / forceMingUnit / forceSectUnit）。补完当场跑消费方
//   `tests/stat-decl-vs-actual-check.mjs` ⇒ 直接崩：
//     [GlobalStore.schema] key='forceWeakElite' forceWeakElite 期望 string，实际 boolean
//   根因：`resetForces` 沿用了「一律设 false」的旧写法，而那 3 个**带值**开关
//   （forceMingUnit / forceSectUnit / forceWeakElite）在 schema 里是 **STRING** 型
//   ⇒ 给它们塞 boolean 会被 GlobalStore.set 的 schema 校验当场拒绝。
//   ★ 补登记前白名单只有 3 个 boolean 键，这个 bug **根本不显形** ⇒ 也就是说
//     「复位值形态对不对」这件事，此前**没有任何机器断言在守**。
//
// 判据（五条）：
//   ① RESET_VALUE 的键集 ≡ FORCE_KEYS 的键集（不多不少，双向相等）；
//   ② RESET_VALUE 的每个值，其 JS 类型必须被 schema 声明接受
//      （BOOLEAN ⇒ 布尔；STRING ⇒ 字符串或 null；BOOLEAN|STRING ⇒ 两样都行）；
//   ③ schema 里每个 FORCE_KEYS 成员都必须有类型声明（漏声明 ⇒ 报红，不许当「无约束」放过）；
//   ④ 规模闸门：FORCE_KEYS ≥ 9 条、RESET_VALUE ≥ 9 条（低于 ⇒ 有人删了一大批，须报）；
//   ⑤ 反向样本：给一个 string 型键塞 false 会被 schema 拒绝（证明②这道闸不是空转）。
//
// 用法：node tests/forced-case-reset-selftest.mjs   （exit 0 = 全过；exit 1 = 有问题）
export const VER = 'tests/forced-case-reset-selftest.mjs V1.0.0';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORCE_KEYS, RESET_VALUE } from './_lib/forced-case-normalize.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const SCHEMA_REL = 'infra/112-store-schema.js';

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

// ── 读 schema 的类型声明（剥注释后按 "key: { type: ..." 抽）─────────────────
const schemaPath = path.join(root, SCHEMA_REL);
if (!fs.existsSync(schemaPath)) {
    console.log('❌ 零触发守卫：schema 文件不存在：' + SCHEMA_REL);
    process.exit(1);
}
const raw = fs.readFileSync(schemaPath, 'utf8');
// 剥掉行注释，避免注释里的 "forceXxx: { type: ..." 假命中
const code = raw.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');

const TYPES = {};   // key -> array of type names
for (const m of code.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*\{\s*type\s*:\s*(\[[^\]]*\]|[A-Za-z_$][\w$.]*)/g)) {
    const key = m[1];
    const rawType = m[2].replace(/[[\]]/g, '').trim();
    TYPES[key] = rawType.split(',').map(s => s.trim()).filter(Boolean);
}
// schema 里的类型常量名（S.BOOLEAN 之类）→ 实际语义
const BOOL_TOKENS = ['BOOLEAN', 'BOOL'];
const STR_TOKENS = ['STRING', 'STR'];

const isBoolType = (t) => BOOL_TOKENS.some(tok => t.includes(tok));
const isStrType = (t) => STR_TOKENS.some(tok => t.includes(tok));

// ── ① 键集双向相等 ───────────────────────────────────────────────────────
const rvKeys = Object.keys(RESET_VALUE).sort();
const fkKeys = [...FORCE_KEYS].sort();
const onlyRv = rvKeys.filter(k => !fkKeys.includes(k));
const onlyFk = fkKeys.filter(k => !rvKeys.includes(k));
ok(onlyRv.length === 0, '① RESET_VALUE 有多余键（不在 FORCE_KEYS 里）：' + onlyRv.join(', '));
ok(onlyFk.length === 0, '① FORCE_KEYS 有键缺复位值：' + onlyFk.join(', '));

// ── ② 复位值类型须被 schema 接受 ─────────────────────────────────────────
for (const k of fkKeys) {
    if (!rvKeys.includes(k)) continue;
    const types = TYPES[k];
    if (!types || types.length === 0) continue;   // ③ 单独判
    const v = RESET_VALUE[k];
    const acceptBool = types.some(isBoolType);
    const acceptStr = types.some(isStrType);
    const vIsBool = typeof v === 'boolean';
    const vIsNull = v === null;
    const vIsStr = typeof v === 'string';
    // null 对 string 型是「空值」⇒ 合法；对 boolean 型不合法（schema 要求 boolean）
    const legal = (acceptBool && vIsBool) || (acceptStr && (vIsStr || vIsNull));
    ok(legal, `② 复位值类型不符：${k} = ${JSON.stringify(v)}（schema 声明 ${types.join('|')}）`);
}

// ── ③ schema 里每个 FORCE_KEYS 成员都要有类型声明 ────────────────────────
for (const k of fkKeys) {
    ok(TYPES[k] && TYPES[k].length > 0, `③ schema 未声明 ${k} 的类型（不许当「无约束」放过）`);
}

// ── ④ 规模闸门 ────────────────────────────────────────────────────────────
ok(FORCE_KEYS.length >= 9, `④ FORCE_KEYS ${FORCE_KEYS.length} 条 < 9（有人删了一批）`);
ok(rvKeys.length >= 9, `④ RESET_VALUE ${rvKeys.length} 条 < 9（有人删了一批）`);

// ── ⑤ 反向样本：string 型键塞 boolean 必须被拒（证明②不是空转）─────────
{
    const strKey = fkKeys.find(k => (TYPES[k] || []).some(isStrType) && !(TYPES[k] || []).some(isBoolType));
    if (strKey) {
        // 用 schema 自己的校验函数验（权威判据，不自己复写）
        let rejected = false;
        try {
            const mod = await import('../infra/112-store-schema.js');
            mod.validateStoreValue(strKey, false);
        } catch (e) { rejected = true; }
        ok(rejected, `⑤ 反向样本：${strKey} 塞 boolean 竟被 schema 接受（②空转了？）`);
    } else {
        ok(false, '⑤ 找不到纯 string 型的 force 键做反向样本（schema 类型表可能变了）');
    }
}

if (fails.length) {
    console.log('❌ 强制开关复位形态自检失败（' + fails.length + ' 条）：');
    for (const f of fails) console.log('  - ' + f);
    process.exit(1);
}
console.log(`✅ 强制开关复位形态自检通过（FORCE_KEYS ${FORCE_KEYS.length} 条 / RESET_VALUE ${rvKeys.length} 条 · 键集双向相等 · 复位值类型合 schema · schema 无漏声明 · 反向样本咬住）`);
