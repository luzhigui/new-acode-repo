// tests/_lib/foundation-scan.mjs | V1.0.0 | 2026-10-28 夜间第 149 轮
//
// 「非版本化地基」枚举与「体检项 × 地基」依赖绑定的**唯一来源**（single source of truth）。
//
// 为什么抽它：第 148 轮立的 sandbox-fragility-scan 把这套判据写在自己体内；第 149 轮要新增
//   foundation-portability（地基可携化：导出/回灌/对账），它必须知道「哪些产物是非版本化地基」
//   才能导出对。**若新件自己抄一份判据，两处口径必然分叉** —— 一处收紧、另一处没跟，就会出现
//   「同一个产物在普查件里算地基、在导出件里不算」的幽灵事件，而两边都报绿，谁都看不出来。
//   属第 122 轮立的通规（静默位移白名单收口为唯一来源）的同款应用，与 _lib/rule-branch-extract
//   （第 133 轮）、_lib/static-truth-slice（第 145 轮）同一条规矩。
//
// 判据口径（与第 148 轮 sandbox-fragility-scan V1.0.0 逐字一致，行为不变，纯搬迁）：
//   ① 非版本化 = git 自己说了算（git check-ignore / git ls-files --ignored --directory），
//      ★ 不手写 .gitignore 正则：那是第二份规则快照，会腐烂（本仓库这类病已发作四次）；
//   ② 体检项依赖 = 抽脚本源码里的路径字面量 + path.join 分段拼装，逐个过 git 判据。
//
// 用法：
//   import { enumerateFoundations, gitIgnored, ignoredPresentEntries,
//            normalizeToRepoRel, extractPathLits, collectItems, ROOT,
//            selfCheck as foundationSelfCheck } from './_lib/foundation-scan.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VER = 'tests/_lib/foundation-scan.mjs V1.0.0';

const here = path.dirname(fileURLToPath(import.meta.url));

/** 仓库根（tests/_lib 的上两级） */
export const ROOT = path.resolve(here, '..', '..');

/** 地基枚举的默认扫描面（体检产物都在 tests/ 下；扩到全仓须显式传参） */
export const TESTS_DIR = 'tests';

// 抠清单的锚点：CHECKS / OBSERVES 里每一项都是 { name: '...', script: '...' }。
// ★ 一次抠「配对」而非只抠 script —— 交叉归因要靠项名对号，只抠脚本就得靠文件名猜中文项名。
export const RE_ITEM = /name:\s*'([^']+)'\s*,\s*script:\s*'([^']+)'/g;

// 路径字面量：源码里被引号包起来的、长度可控的片段，再由 normalizeToRepoRel 筛成仓库相对路径。
const RE_PATH_LIT = /['"]([^'"\n]{1,160})['"]/g;

export function gitIgnored(rel) {
    return spawnSync('git', ['check-ignore', '-q', rel], { cwd: ROOT, encoding: 'utf8' }).status === 0;
}

// 已存在的被忽略产物：--directory 让整棵被忽略的目录折叠成一行
// （否则变异树临时树 tests/.mut/ 下几千个文件会把报告彻底淹没，真信号反而看不见）。
export function ignoredPresentEntries(dirRel) {
    const r = spawnSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '--', dirRel],
        { cwd: ROOT, encoding: 'utf8' });
    return (r.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

// 把源码里的字面量归一成仓库相对路径；归不出来的返回 null（不猜）。
export function normalizeToRepoRel(s) {
    if (!s || !s.includes('/')) return null;
    if (/^https?:/i.test(s) || s.startsWith('node:')) return null;
    let t = s.replace(/^\.\//, '');
    const i = t.indexOf('tests/');
    if (i > 0) t = t.slice(i);
    else if (i < 0 && t.startsWith('.mut')) t = 'tests/' + t;
    else if (i < 0) return null;
    t = t.replace(/\/\*+$/, '').replace(/\/$/, '');
    if (!/^tests\/[A-Za-z0-9._\-\/]{1,160}$/.test(t)) return null;
    return t;
}

// 分段拼装识别：path.join(here, '.mut', 'teeth-results.txt') 这类写法里，路径被拆成多段字面量，
// ★ 只认整条字面量会正好漏掉最关键的那一处（第 148 轮实测：牙口自检的 EVIDENCE 就是这么写的，
//   初版因此把 tests/.mut/teeth-results.txt 整条地基漏掉 —— 而它正是沙箱重置后红的那一处）。
// 这里不猜 here/root 的语义，而是把分段拼成尾段后两种基都试，最终由 git 判据定夺（并写明理由）。
const RE_JOIN_CALL = /path\.join\(([^();]*)\)/g;
const RE_SEG_LIT = /'([^']*)'|"([^"]*)"/g;

export function extractJoinTails(src) {
    const out = [];
    RE_JOIN_CALL.lastIndex = 0;
    let m;
    while ((m = RE_JOIN_CALL.exec(src))) {
        const segs = [];
        RE_SEG_LIT.lastIndex = 0;
        let s;
        while ((s = RE_SEG_LIT.exec(m[1]))) segs.push(s[1] !== undefined ? s[1] : s[2]);
        if (!segs.length) continue;
        const tail = segs.join('/').replace(/\/+/g, '/').replace(/^\//, '');
        if (tail) out.push({ kind: 'join', segs, tail });
    }
    return out;
}

export function extractPathLits(src) {
    const out = [];
    const seen = new Set();
    RE_PATH_LIT.lastIndex = 0;
    let m;
    while ((m = RE_PATH_LIT.exec(src))) {
        const rel = normalizeToRepoRel(m[1]);
        if (!rel || seen.has(rel)) continue;
        seen.add(rel);
        out.push({ rel, why: '字面量 ' + m[1] });
    }
    for (const j of extractJoinTails(src)) {
        for (const cand of ['tests/' + j.tail, j.tail]) {
            const rel = normalizeToRepoRel(cand);
            if (!rel || seen.has(rel)) continue;
            seen.add(rel);
            out.push({ rel, why: 'path.join 分段拼装（' + j.segs.join(' + ') + '）' });
            break;
        }
    }
    return out;
}

export function collectItems(src) {
    const out = [];
    RE_ITEM.lastIndex = 0;
    let m;
    while ((m = RE_ITEM.exec(src))) out.push({ name: m[1], script: m[2] });
    return out;
}

/**
 * 枚举全部非版本化地基，并把体检项绑定到它依赖的地基上。
 * @param {Array<{name:string, script:string}>} items 体检清单（真值口径）
 * @param {string} scanDir 磁盘实测的扫描面（默认 tests）
 * @returns {Array<{rel:string, users:string[], why:string, present:boolean}>}
 */
export function enumerateFoundations(items, scanDir = TESTS_DIR) {
    const declared = new Map();
    for (const it of items) {
        let src = '';
        try {
            src = fs.readFileSync(path.join(ROOT, it.script), 'utf8');
        } catch (e) {
            continue;
        }
        for (const p of extractPathLits(src)) {
            if (p.rel === it.script || !gitIgnored(p.rel)) continue;
            if (!declared.has(p.rel)) declared.set(p.rel, { users: [], why: p.why });
            const d = declared.get(p.rel);
            if (!d.users.includes(it.name)) d.users.push(it.name);
        }
    }

    // ① 已存在的被忽略产物（本沙箱独有、白天拿到 patch 也看不见）
    const presentIgnored = ignoredPresentEntries(scanDir);

    const unversioned = [];
    const push = (rel, users, why) => {
        if (unversioned.some(u => u.rel === rel)) return;
        unversioned.push({ rel, users, why, present: fs.existsSync(path.join(ROOT, rel)) });
    };
    for (const rel of presentIgnored) push(rel, ['（磁盘实测：存在但被 git 忽略）'], 'git ls-files --ignored 实测');
    for (const [rel, d] of declared) push(rel, d.users.slice().sort(), d.why);
    return unversioned;
}

// ---------------------------------------------------------------------------
// 自证：本件腐烂了要能被听见（第 143 轮 sample-sufficiency 的规矩：每个新件挂一条 selfCheck）。
//   ★ 原则照抄第 148 轮：自证失败必须由**受体并入 fails 并影响退码** —— 只打印不计退码就是假绿。
// ---------------------------------------------------------------------------
export function selfCheck() {
    const fails = [];
    try {
        // ① git 判据两端都钉住：一个已知被忽略、一个已知已跟踪
        if (!gitIgnored('tests/.mut/teeth-results.txt')) {
            fails.push('① git 忽略判据失位：tests/.mut/teeth-results.txt 应判为被忽略，实判未忽略 —— 地基清单会静默变空');
        }
        if (gitIgnored('tests/run-all.mjs')) {
            fails.push('①b git 忽略判据失位：tests/run-all.mjs 应判为已跟踪，实判被忽略 —— 会把整个 tests 目录当成地基');
        }
        // ② URL / node: 内置必须被排除（否则地基清单里全是外链）
        if (normalizeToRepoRel('https://example.com/a/b') !== null) {
            fails.push('② 路径归一失位：URL 被当成仓库路径了（地基清单会被外链淹没）');
        }
        // ③ 分段拼装：本件存在的理由就是它，漏了本件形同虚设
        const probeJoin = "const EVIDENCE = path.join(here, '.mut', 'teeth-results.txt');";
        const gotJoin = extractPathLits(probeJoin).map(x => x.rel);
        if (!gotJoin.includes('tests/.mut/teeth-results.txt')) {
            fails.push('③ 分段拼装抽取失位：path.join(here, .mut, teeth-results.txt) 没还原成 tests/.mut/teeth-results.txt（实得 ' + JSON.stringify(gotJoin) + '）');
        }
        // ④ 清单配对抽取器：合成一段 name+script，必须抠出配对
        const items2 = collectItems("{ name: '合成项', script: 'tests/synthetic-probe.mjs' }");
        if (!items2.some(x => x.name === '合成项' && x.script === 'tests/synthetic-probe.mjs')) {
            fails.push('④ 清单配对抽取器失位：合成样本里的 name+script 没抠成配对 —— 依赖绑定会全线对不上号');
        }
    } catch (e) {
        fails.push('地基枚举公共件自证自身抛异常（' + (e && e.message ? e.message : String(e)) + '）⇒ 用地基枚举得到的任何结论一并作废');
    }
    return fails;
}
