// tests/health-rules-syntax-sweep.mjs | V1.0.0 | 2026-11-05 迭代：补「单文件语法坏→整harness崩溃」盲区。
// 干什么：node --check 解析扫一遍 tests/ 下所有 .js/.mjs（递归，排除 .mut 变异冻结副本），
//   任何一个体检文件写出语法/解析错误，浏览器侧 120/121 harness 会加载即崩、47 条运行时规则全灭，
//   却没有任何自检提前发现（registration-check 只核对登记、不解析内容）。本扫在 node 侧拦下，
//   轻量、零执行（--check 只解析不跑，不解析 import 目标、不触碰浏览器全局），故对浏览器专用模块也安全。
// 负路径已验证：故意写坏的片段 node --check --input-type=module 经 stdin 返回 exit 1 + SyntaxError（非假绿）。
// 运行：node tests/health-rules-syntax-sweep.mjs
export const VER = 'tests/health-rules-syntax-sweep.mjs V1.0.0';

import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { URL, fileURLToPath } from 'node:url';
import path from 'node:path';

// 从本文件所在目录（tests/）递归收集 .js/.mjs，跳过 .mut/（变异冻结旧版副本，扫它只会炮制一堆冻结旧码的假红）。
function walk(dir, rel, out) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
        if (ent.name === '.mut' || ent.name === 'node_modules') continue;
        if (ent.isDirectory()) walk(path.join(dir, ent.name), rel ? rel + '/' + ent.name : ent.name, out);
        else if (ent.name.endsWith('.js') || ent.name.endsWith('.mjs')) out.push(rel ? rel + '/' + ent.name : ent.name);
    }
    return out;
}

const here = fileURLToPath(new URL('.', import.meta.url));
const files = walk(here, '', []);
const bad = [];
for (const f of files) {
    const code = readFileSync(new URL(f, import.meta.url), 'utf8');
    // 经 stdin 喂内容 + --input-type=module 保证按 ESM 解析（.js 无 package.json type:module 也能正确按模块语法校验）
    const r = spawnSync('node', ['--check', '--input-type=module'], { input: code, encoding: 'utf8' });
    if (r.status !== 0) {
        // 取 stderr 头部 6 行：含 [stdin]:行号 + 源码片段 + 脱字符 + SyntaxError 行，定位信息最有用；
        // 末尾是栈帧与 "Node.js vX" 尾，对体检无用，丢弃。
        const msg = (r.stderr || r.stdout || '未知解析错误').trim().split('\n').slice(0, 6).join('\n');
        bad.push({ f, msg });
    }
}

console.log(`语法扫描：tests/ 下 ${files.length} 个 .js/.mjs 文件（递归，排除 .mut）`);
if (bad.length) {
    console.log(`\n[硬失败] ${bad.length} 个文件解析失败（会导致 120/121 harness 加载即崩、规则全灭）：`);
    for (const { f, msg } of bad) console.log('  ✗ ' + f + ':\n      ' + msg.replace(/\n/g, '\n      '));
    process.exit(1);
}
console.log('✅ 全部文件解析通过（node --check 仅解析不执行；health-rules 下规则文件单点坏也不会再静默拖垮整 harness）');
