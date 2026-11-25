#!/usr/bin/env node
// V1.0.0 | 2026-11-25 第56轮：补 VER 常量与日志行（原文件无 VER，ver-drift 断言⑩判无版本孤儿）。
export const VER = 'tests/enum-contract-check.mjs V1.0.0';

// tests/enum-contract-check.mjs — 枚举契约表静态守门（秒级，纯 node 只读）
//
// 背景（2026-11-25）：并行会话连续两次给 UI 处理器加键、却没登记 infra/106 UI_HANDLER_KEYS，
//   GlobalStore.setUIHandler 在模块初始化期直接 throw ⇒ ui/702 初始化中断、btnMain 监听没绑上，
//   表现是「开局卡住 / 点什么都没反应」。同类风险遍布所有枚举契约：
//     · content 里写了 mechanics[].type = 'xxx'，但 MECHANIC_TYPES 没注册 → core/15 安装期抛错
//     · 代码写 MECHANIC_TYPES.SAN_DU_PASSIVE（枚举里没这个键）→ undefined 当类型用
//     · setUIHandler('xxx') 白名单没登记
//     · when: 'xxx' / factType: 'xxx' 字面量写错
//   等玩家撞上再排查代价太大，这里一次性把「代码/数据用到的枚举值 ⊆ 枚举定义」做成 push 门禁。
//
// 判据（任一红 ⇒ 退出 1）：
//   1) 全仓 NAME.KEY 引用（NAME ∈ infra/106、infra/107 导出的枚举）——KEY 必须在该枚举里
//   2) content/*.json 里 mechanics[].type 必须 ∈ MECHANIC_TYPES 的值集
//   3) 代码里 when: 'x' 必须 ∈ SIGNAL_TYPES 值集；factType: 'x' 必须 ∈ FACT_TYPES 值集
//   4) setUIHandler('x') / getUIHandler('x') 的键必须 ∈ UI_HANDLER_KEYS 值集
//
// 用法：node tests/enum-contract-check.mjs
// 退出码：0 全绿 / 1 有违约（逐条列出文件:行号）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENUM_FILES = ['infra/106-battle-enums.js', 'infra/107-battle-consts.js'];
const SCAN_DIRS = ['ui', 'player', 'modules', 'fx', 'render', 'core', 'infra'];
const SKIP_DIRS = new Set(['node_modules', '_archive', '_bak_web', '_publish', 'output']);

const violations = [];
function addViolation(msg) { violations.push(msg); }

function walk(dir, out = []) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.isDirectory()) {
            if (SKIP_DIRS.has(ent.name)) continue;
            walk(path.join(dir, ent.name), out);
        } else if (/\.m?js$/.test(ent.name)) {
            out.push(path.join(dir, ent.name));
        }
    }
    return out;
}

function rel(p) { return path.relative(ROOT, p).replace(/\\/g, '/'); }

// ── 1. 解析枚举定义：export const NAME = Object.freeze({ KEY: 'value', ... }) ──
const enums = new Map(); // NAME -> { keys:Set, values:Set }
for (const f of ENUM_FILES) {
    const abs = path.join(ROOT, f);
    if (!fs.existsSync(abs)) continue;
    const src = fs.readFileSync(abs, 'utf8');
    const re = /export const ([A-Z][A-Z0-9_]+)\s*=\s*(?:Object\.freeze\(\s*)?\{([\s\S]*?)\n\}\);/g;
    for (const m of src.matchAll(re)) {
        const name = m[1];
        const body = m[2];
        // 枚举体里键一行多个、带行尾注释，还有嵌套子枚举（如 MECHANIC_EFFECT_TYPES.ON_HIT 里再嵌 LEECH）。
        //   按「列缩进最浅的那层」认顶层键：顶层键通常是 4 空格，嵌套子键 8 空格。
        const lines = body.split(/\r?\n/).map(l => l.split('//')[0]);
        const cands = [];
        for (const line of lines) {
            const indent = line.search(/\S/);
            if (indent < 0) continue;
            for (const mm of line.matchAll(/([A-Z][A-Z0-9_]*)\s*:\s*('[^']*')?/g)) {
                cands.push({ key: mm[1], indent, value: mm[2] ? mm[2].slice(1, -1) : null });
            }
        }
        if (!cands.length) continue;
        const minIndent = Math.min(...cands.map(c => c.indent));
        const keys = new Set();
        const values = new Set();
        for (const c of cands) {
            if (c.indent !== minIndent) continue;
            keys.add(c.key);
            if (c.value !== null) values.add(c.value);
        }
        if (keys.size) enums.set(name, { keys, values });
    }
}
if (!enums.size) {
    console.error('[红] 没能从 infra/106、infra/107 解析出任何枚举（解析规则可能已失效）');
    process.exit(1);
}

// ── 2. 扫代码：NAME.KEY 引用 + 字面量 when/factType + UI 处理器键 ──
const uiHandlers = []; // {key, loc}
const signalLiterals = []; // {value, loc}
const factTypeLiterals = [];
for (const dir of SCAN_DIRS) {
    const absDir = path.join(ROOT, dir);
    if (!fs.existsSync(absDir)) continue;
    for (const file of walk(absDir)) {
        const rawLines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
        let inBlock = false;
        rawLines.forEach((raw, i) => {
            const loc = `${rel(file)}:${i + 1}`;
            // 剥掉注释（块注释跨行跟踪 + 行尾 //），注释里的示例写法（如 FACT_TYPES.XXX）不算违约
            let line = raw;
            if (inBlock) {
                const end = line.indexOf('*/');
                if (end < 0) return;
                line = line.slice(end + 2);
                inBlock = false;
            }
            const bStart = line.indexOf('/*');
            if (bStart >= 0) {
                const bEnd = line.indexOf('*/', bStart + 2);
                if (bEnd < 0) { inBlock = true; line = line.slice(0, bStart); }
                else line = line.slice(0, bStart) + line.slice(bEnd + 2);
            }
            if (!line.trim()) return;
            line = line.split('//')[0];
            // NAME.KEY（仅限已解析的枚举名 + 大写成员，避免误伤 .length / .map 之类）
            for (const m of line.matchAll(/\b([A-Z][A-Z0-9_]+)\.([A-Z][A-Z0-9_]*)\b/g)) {
                const [full, name, key] = m;
                const def = enums.get(name);
                if (!def) continue;                       // 不是本仓枚举（如 Object.keys / Math.PI）
                if (!def.keys.has(key)) addViolation(`[枚举引用] ${loc}  ${full} —— ${name} 里没有 ${key} 这个键`);
            }
            for (const m of line.matchAll(/\bwhen\s*:\s*'([^']+)'/g)) signalLiterals.push({ value: m[1], loc });
            for (const m of line.matchAll(/\bfactType\s*:\s*'([^']+)'/g)) factTypeLiterals.push({ value: m[1], loc });
            for (const m of line.matchAll(/(?:setUIHandler|getUIHandler)\(\s*'([^']+)'/g)) uiHandlers.push({ key: m[1], loc });
        });
    }
}

function requireEnum(name) {
    const def = enums.get(name);
    if (!def) {
        console.error(`[红] 枚举 ${name} 未在 infra/106/infra/107 找到，守门失效`);
        process.exit(1);
    }
    return def;
}

// 2a. when / factType 字面量必须是合法枚举值（有值集时）
if (signalLiterals.length) {
    const sig = requireEnum('SIGNAL_TYPES');
    for (const s of signalLiterals) {
        if (!sig.values.has(s.value)) addViolation(`[信号字面量] ${s.loc}  when: '${s.value}' —— SIGNAL_TYPES 里没有这个值`);
    }
}
if (factTypeLiterals.length) {
    const ft = requireEnum('FACT_TYPES');
    for (const s of factTypeLiterals) {
        if (!ft.values.has(s.value)) addViolation(`[事实字面量] ${s.loc}  factType: '${s.value}' —— FACT_TYPES 里没有这个值`);
    }
}

// 2b. UI 处理器键必须已登记
{
    const ui = requireEnum('UI_HANDLER_KEYS');
    const missing = new Map();
    for (const h of uiHandlers) {
        if (ui.values.has(h.key)) continue;
        if (!missing.has(h.key)) missing.set(h.key, []);
        missing.get(h.key).push(h.loc);
    }
    for (const [key, locs] of missing) {
        addViolation(`[UI 处理器键] '${key}' 未登记进 UI_HANDLER_KEYS（会 setUIHandler 抛错、整页初始化中断）  用到：${locs.slice(0, 5).join('、')}`);
    }
}

// ── 3. content 数据：mechanics[].type 必须已注册 ──
let mechChecked = 0;
{
    const mech = requireEnum('MECHANIC_TYPES');
    const contentDir = path.join(ROOT, 'content');
    const files = fs.existsSync(contentDir) ? fs.readdirSync(contentDir).filter(f => f.endsWith('.json')) : [];
    for (const f of files) {
        const abs = path.join(contentDir, f);
        let data;
        try { data = JSON.parse(fs.readFileSync(abs, 'utf8')); }
        catch (e) { addViolation(`[数据解析] content/${f} JSON 解析失败：${e.message}`); continue; }
        const stack = [[data, '']];
        while (stack.length) {
            const [node, p] = stack.pop();
            if (Array.isArray(node)) {
                node.forEach((v, i) => { if (v && typeof v === 'object') stack.push([v, `${p}[${i}]`]); });
                continue;
            }
            if (!node || typeof node !== 'object') continue;
            if (Array.isArray(node.mechanics)) {
                node.mechanics.forEach((m, i) => {
                    if (!m || !m.type) return;
                    mechChecked++;
                    if (!mech.values.has(m.type)) {
                        addViolation(`[机制类型] content/${f} ${p}.mechanics[${i}].type = '${m.type}' —— MECHANIC_TYPES 里没注册`);
                    }
                });
            }
            for (const [k, v] of Object.entries(node)) {
                if (v && typeof v === 'object') stack.push([v, `${p}.${k}`]);
            }
        }
    }
}

// ── 汇总 ──
const uniq = [...new Set(violations)];
if (uniq.length) {
    console.error(`[红] 枚举契约违约 ${uniq.length} 处：`);
    for (const v of uniq.slice(0, 60)) console.error('  - ' + v);
    if (uniq.length > 60) console.error(`  …… 还有 ${uniq.length - 60} 处未列出`);
    console.error('');
    console.error('修法：补齐 infra/106（或 107）里对应枚举的键/值；数据里的 type 必须在 MECHANIC_TYPES 注册后才能被 core/15 安装。');
    process.exit(1);
}

const enumSummary = [...enums.entries()].map(([k, v]) => `${k}(${v.keys.size})`).join(' ');
console.log(`[绿] 枚举契约全部成立：${enumSummary}`);
console.log(`      静态扫描：${uiHandlers.length} 处 UI 键、${signalLiterals.length} 处 when 字面量、${factTypeLiterals.length} 处 factType 字面量、content 机制类型 ${mechChecked} 条全部已注册`);
process.exit(0);
