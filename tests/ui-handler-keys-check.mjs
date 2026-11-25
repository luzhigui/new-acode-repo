#!/usr/bin/env node
// tests/ui-handler-keys-check.mjs — UI 处理器白名单静态守门（秒级）
//
// 背景（2026-11-25）：并行会话给「机制弟子四选一」加功能，连续两次漏登记白名单键
//   （switchDisciple、syncDiscipleSwitchBtn），GlobalStore.setUIHandler 在模块初始化期直接 throw
//   ⇒ ui/702 的初始化半途中断，btnMain 监听没绑上，表现是「开局卡住 / 点什么都没反应」。
//   等玩家撞上再排查代价太大，所以把「代码里用到的键 ⊆ infra/106 UI_HANDLER_KEYS」做成 push 门禁。
//
// 判据：
//   1) 全仓 setUIHandler('x' / getUIHandler('x' 用到的键，必须出现在 UI_HANDLER_KEYS 里 —— 缺 = 红，退出 1
//   2) 白名单里登记了但没人用的键 —— 只提示不判红（有些键是外部/动态调用，误报代价高）
//
// 用法：node tests/ui-handler-keys-check.mjs
// 退出码：0 通过 / 1 有缺登记

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENUM_FILE = path.join(ROOT, 'infra', '106-battle-enums.js');
const SCAN_DIRS = ['ui', 'player', 'modules', 'fx', 'render', 'core', 'infra'];
const SKIP_DIRS = new Set(['node_modules', '_archive', '_bak_web', '_publish', 'output']);

function walk(dir, out = []) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.isDirectory()) {
            if (SKIP_DIRS.has(ent.name)) continue;
            walk(path.join(dir, ent.name), out);
        } else if (/\.(m?js)$/.test(ent.name)) {
            out.push(path.join(dir, ent.name));
        }
    }
    return out;
}

// 1) 读白名单：只取 UI_HANDLER_KEYS = Object.freeze({ ... }) 那一块里的 'xxx' 值
const enumSrc = fs.readFileSync(ENUM_FILE, 'utf8');
const blockStart = enumSrc.indexOf('UI_HANDLER_KEYS');
if (blockStart < 0) {
    console.error('[红] infra/106 里找不到 UI_HANDLER_KEYS');
    process.exit(1);
}
const blockEnd = enumSrc.indexOf('});', blockStart);
const block = enumSrc.slice(blockStart, blockEnd < 0 ? enumSrc.length : blockEnd + 3);
const whitelist = new Set([...block.matchAll(/:\s*'([^']+)'/g)].map(m => m[1]));
if (whitelist.size === 0) {
    console.error('[红] UI_HANDLER_KEYS 解析出 0 个键，解析规则可能已失效');
    process.exit(1);
}

// 2) 扫代码里用到的键
const used = new Map(); // key -> [文件:行]
for (const dir of SCAN_DIRS) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of walk(abs)) {
        const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
        lines.forEach((line, i) => {
            for (const m of line.matchAll(/(?:setUIHandler|getUIHandler)\(\s*'([^']+)'/g)) {
                const k = m[1];
                if (!used.has(k)) used.set(k, []);
                used.get(k).push(`${path.relative(ROOT, file).replace(/\\/g, '/')}:${i + 1}`);
            }
        });
    }
}

const missing = [...used.keys()].filter(k => !whitelist.has(k)).sort();
const unused = [...whitelist].filter(k => !used.has(k)).sort();

if (unused.length) {
    console.log(`[提示] 白名单里 ${unused.length} 个键暂时没被静态调用（动态调用可忽略）：${unused.join(', ')}`);
}

if (missing.length) {
    console.error('');
    console.error('[红] 以下 UI 处理器键没登记进 infra/106 UI_HANDLER_KEYS —— 运行时 GlobalStore.setUIHandler 会直接 throw、整页初始化中断：');
    for (const k of missing) {
        console.error(`  - '${k}'`);
        for (const loc of used.get(k).slice(0, 5)) console.error(`      用到：${loc}`);
    }
    console.error('');
    console.error('修法：infra/106-battle-enums.js 的 UI_HANDLER_KEYS 里补一行 XXX: \'键名\'（值必须与调用处字符串完全一致）。');
    process.exit(1);
}

console.log(`[绿] UI 处理器键全部已登记（白名单 ${whitelist.size} 个，静态用到 ${used.size} 个）`);
process.exit(0);
