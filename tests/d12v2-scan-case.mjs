// tests/d12v2-scan-case.mjs | V1.0.0 | 2026-11-14（D12 扫描器定向用例：六类反例精确断言 + acorn 守卫真反向样本）
// V1.0.0 说明：本作 V1.0.0 之前没有 VER 常量（被 ver-drift 判成「有文件无 VER 孤儿」），
//   且原第 3 项只是**在源码里 grep 守卫代码**（打印了「守卫前提失效」几个字就算过）——
//   那种断言把守卫删掉、把 exit 换成注释都照样绿，正是本域自己反对的「装饰品闸门」。
//   本版把第 3 项换成**真反向样本**：用解析钩子把 'acorn' 真拦掉跑一次子进程，
//   验证它真的打印「守卫前提失效：acorn 缺失」且真的 exit(1)；另加不拦的正向对照。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { selfCheck, analyzeSource, SELF_FIXTURES } from './rule-false-green-scan.mjs';

export const VER = 'tests/d12v2-scan-case.mjs V1.0.0';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const scannerPath = path.join(here, 'rule-false-green-scan.mjs');
const GUARD_MSG = '守卫前提失效：acorn 缺失';

// ---------------------------------------------------------------- 1. 判据自证
console.log('=== 1. 判据自证（扫描器自己的反例必须被咬住，且不多咬） ===');
const selfProblems = selfCheck();
if (selfProblems.length) {
    console.log('❌ 自证失败:');
    selfProblems.forEach(p => console.log('  · ' + p));
    process.exit(1);
}
console.log('✅ 自证通过：' + SELF_FIXTURES.length + ' 条夹具 / 六类判据（A B C D1 D2 D3）精确命中，干净夹具 0 误咬');

// ---------------------------------------------------------------- 2. 逐夹具精确断言
console.log('\n=== 2. 逐夹具精确断言（命中集合必须**恰好**等于 expectCats） ===');
const catMap = { A: '形状非法', B: '无 fail 路径', C: '恒 pass 分支', D1: 'catch 吞成 pass', D2: 'catch 吞成 skip', D3: '空 catch' };
let allOk = true;
for (const fx of SELF_FIXTURES) {
    const got = analyzeSource(fx.src, '(fixture)');
    const cats = [...new Set(got.map(f => f.cat))].sort();
    const want = [...new Set(fx.expectCats || fx.categories)].sort();
    const missing = want.filter(c => !cats.includes(c));
    const extra = cats.filter(c => !want.includes(c));
    if (missing.length || extra.length) {
        console.log('❌ 「' + fx.name + '」实际命中 ' + (cats.join(',') || '0 类')
            + '，期望恰好 ' + (want.join(',') || '0 类')
            + (missing.length ? '；漏 ' + missing.join(',') : '')
            + (extra.length ? '；多 ' + extra.join(',') : ''));
        allOk = false;
        continue;
    }
    console.log('✅ 「' + fx.name + '」命中恰好 ' + (want.join(',') || '0 类')
        + (want.length ? '（' + want.map(c => catMap[c] || c).join(' / ') + '）' : ''));
}
if (!allOk) process.exit(1);
console.log('✅ ' + SELF_FIXTURES.length + ' 条夹具全部精确命中（0 漏 0 多）');

// ---------------------------------------------------------------- 3. acorn 缺失守卫 · 真反向样本
console.log('\n=== 3. acorn 缺失守卫 · 真反向样本（真把 acorn 拦掉跑一次） ===');

// 3.0 造一个「acorn 加载不到」的运行环境：自定义解析钩子拦掉 'acorn'（等价于没装 acorn）
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hc-d12-acorn-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* 清理失败不影响结论 */ } });

fs.writeFileSync(path.join(tmp, 'block-acorn-loader.mjs'), [
    'export async function resolve(specifier, context, nextResolve) {',
    "    if (specifier === 'acorn') {",
    "        const e = new Error(\"Cannot find package 'acorn'\");",
    "        e.code = 'ERR_MODULE_NOT_FOUND';",
    '        throw e;',
    '    }',
    '    return nextResolve(specifier, context);',
    '}'
].join('\n'), 'utf8');
fs.writeFileSync(path.join(tmp, 'register-block-acorn.mjs'), [
    "import { register } from 'node:module';",
    "register('./block-acorn-loader.mjs', import.meta.url);"
].join('\n'), 'utf8');

function runNode(args, opts) {
    const r = spawnSync(process.execPath, args, { encoding: 'utf8', ...opts });
    if (r.error) return { code: -1, out: '', err: String(r.error) };
    return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), err: '' };
}

// 守卫行为的判定口径：① exit(1) ② 打印守卫提示 ③ 没继续跑主流程 ④ **不是崩掉的**
//   ④ 是防「守卫只打印不退出」这种半吊子改法蒙混过关（那样进程会带着空 parse 崩在后面，
//   退出码也是 1，光看 ①② 会误判成通过）。
function guardCheck(r) {
    if (r.code === -1) return { ok: false, why: '起不了子进程（' + r.err + '）' };
    if (r.code !== 1) return { ok: false, why: '退出码 ' + r.code + '（应为 1）' };
    if (!r.out.includes(GUARD_MSG)) return { ok: false, why: '没打印「' + GUARD_MSG + '」' };
    if (r.out.includes('规则假绿静态扫描')) return { ok: false, why: '守卫失效后仍继续跑主流程' };
    if (/\n\s+at\s/.test(r.out) || /Error:/.test(r.out)) return { ok: false, why: '进程是崩掉的（守卫没真正拦住）' };
    // ★ 守卫必须是**唯一**输出：守卫只打印不退出时，扫描器会带着空 parse 继续往下跑，
    //   在「判据自证失败」分支退出（退出码也是 1）——只看 ①②③ 会误判成通过。
    const lines = r.out.split('\n').map(s => s.trim()).filter(Boolean)
        .filter(s => !/^\(node:\d+\)/.test(s)); // node 自身告警行不算
    if (lines.length !== 1) {
        return { ok: false, why: '守卫之外还有 ' + (lines.length - 1) + ' 行输出（守卫没真拦住）' };
    }
    return { ok: true, why: '' };
}

// 3a 反向：acorn 真加载不到 ⇒ 必须打印守卫提示 + exit(1) + 不得继续跑主流程 + 不得崩
// ★ Windows 下 --import 只认 file:// URL（绝对路径会被当 c: 协议拒掉）⇒ 必须转 URL
const blocked = runNode(['--import', pathToFileURL(path.join(tmp, 'register-block-acorn.mjs')).href, scannerPath], { cwd: tmp });
const blockedCheck = guardCheck(blocked);
if (!blockedCheck.ok) {
    console.log('❌ acorn 被拦掉时守卫没按预期生效：' + blockedCheck.why);
    console.log(blocked.out);
    process.exit(1);
}
console.log('✅ 反向样本成立：acorn 加载不到 ⇒ 打印「' + GUARD_MSG + '」+ exit(1)，未继续跑主流程，也没崩');
console.log('   实际输出：' + blocked.out.trim().split('\n').slice(-1)[0]);

// 3c 有牙：把守卫改坏（①只打印不退出 ②整段拆掉）⇒ 同一套判定必须判红
//   （变体只存在于临时目录，不碰仓库里的扫描器）
// ★ 匹配必须**行尾无关**：仓库 .gitattributes 是 text=auto eol=crlf ⇒ 干净工作树里源码是 CRLF、
//   本机工作树里可能是 LF，写死 '\n' 会导致「变异体没改到东西」而在别的机器上假红。
const scannerSrc = fs.readFileSync(scannerPath, 'utf8');
const GUARD_RE = /(console\.error\('守卫前提失效：acorn 缺失[^\n]*?)(\r?\n)([ \t]*)process\.exit\(1\);/;
const mutations = [
    {
        name: '守卫只打印不退出',
        src: scannerSrc.replace(GUARD_RE, '$1$2$3/* 变体：故意不退出 */')
    },
    {
        name: '守卫整段被拆掉',
        src: scannerSrc.replace(GUARD_RE, '')
    }
];
for (const mu of mutations) {
    if (mu.src === scannerSrc) {
        console.log('❌ 变异体没改到东西（扫描器源码结构变了，变异样本失效）');
        process.exit(1);
    }
    const muPath = path.join(tmp, 'scanner-mutant.mjs');
    fs.writeFileSync(muPath, mu.src, 'utf8');
    const muRes = runNode(['--import', pathToFileURL(path.join(tmp, 'register-block-acorn.mjs')).href, muPath], { cwd: tmp });
    const muCheck = guardCheck(muRes);
    if (muCheck.ok) {
        console.log('❌ 变异体「' + mu.name + '」竟然仍被判通过 ⇒ 这套守卫判定没有牙');
        process.exit(1);
    }
    console.log('✅ 变异体「' + mu.name + '」被判红（' + muCheck.why + '）⇒ 守卫判定有牙');
}

// 3b 正向对照：acorn 可用 ⇒ 守卫不得误触发，且要真跑到主流程
const normal = runNode([scannerPath], { cwd: repoRoot });
if (normal.code === -1) {
    console.log('❌ 守卫前提失效：起不了子进程（' + normal.err + '）');
    process.exit(1);
}
if (normal.out.includes(GUARD_MSG)) {
    console.log('❌ acorn 可用时守卫误触发');
    console.log(normal.out);
    process.exit(1);
}
if (!normal.out.includes('规则假绿静态扫描')) {
    console.log('❌ acorn 可用时扫描器没跑到主流程');
    console.log(normal.out);
    process.exit(1);
}
console.log('✅ 正向对照成立：acorn 可用 ⇒ 守卫不触发，扫描器正常进入主流程（本轮退出码 ' + normal.code + '）');

console.log('\n🎉 所有定向用例通过');
process.exit(0);
