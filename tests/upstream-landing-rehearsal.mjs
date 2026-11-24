#!/usr/bin/env node
// tests/upstream-landing-rehearsal.mjs | V1.0.0 | 2026-11-24 夜间第 263 轮（看板 #77）
//
// 干什么：把第 262 轮**手工做了一遍**的「上游主线先落会怎样」预演，固化成一条命令。
//
// 由头（第 262 轮手工留痕）：
//   第 262 轮为了回答「上游 a1f3e7653 这一笔能不能直接落」，手工做了四步：worktree 取上游树 →
//   叠加本轮 tests → 临时提交 → 跑六项判据 → 删 worktree。结论很有价值（11 条新失败、1 条假绿、
//   上游已修 T-LAYER-260），但**过程完全靠人记**：worktree 路径靠手打、删没删靠自觉、
//   逐规则对比靠人眼比对两份控制台输出。下一轮换个会话，这套动作就得重学一遍，
//   而且「删 worktree」这一步漏了就会在看板 #64 那条里积脏（实测已积到十六棵）。
//
//   本件把四步钉成机器流程，并且**多出三样手工做不到的**：
//     ① 逐规则对比走 RULE_STATS_OUT 的 JSON（不再靠人眼比对文本，pass/fail/skip 三列机器比）；
//     ② 假绿判定机械化：某规则从「有红」变成 pass=0 且 skip 全量 ⇒ 单列「假绿」，
//        与「真转绿」分开 —— 这是第 262 轮靠人眼才看出来的一条（周颠癫传染链一致性）；
//     ③ 清理自证：收尾必删 worktree 并 `git worktree prune`，再回读 `git worktree list`
//        断言零残留；删不掉就退 3，不静默留脏。
//
// 判定口径（与跨线融合复核操作单 7.2 逐条同源，本件不新增判据）：
//   · 失败规则数不增、无假绿、四件静态判据不退化 ⇒ 可落（退 0）
//   · 失败规则数增加 / 出现假绿 / 静态判据退化 ⇒ 不可直接落（退 1），逐条列归因待办
//   · 树不干净 / base 取不到 / worktree 建不起来或删不干净 ⇒ 取证不完整（退 3）
//   ★ 本件**不判内容改名与真回归的区别**，也不改任何规则、不改主代码：
//     它只把「哪几条变了」摆成表，归因仍是白天的事（夜间擅自改判据等于替上游掩盖回归）。
//
// 两种模式：
//   默认（quick，挂 run-all OBSERVES 用的就是它）：双边只跑四项静态判据 + 结构核对，约 40~90 秒；
//       规则回放一栏显式打「未比（--full 才跑）」，不假装全绿。
//   --full：双边六项全跑（含 rules-replay 逐规则对比），单边约 4~5 分钟、双边 8~10 分钟。
//       不挂默认通道就是因为它太重：run-all 的观察项段已有 400s+ 的孤儿普查，再加 10 分钟必被超时线砍。
//
// 用法：
//   node tests/upstream-landing-rehearsal.mjs                  # quick，base 默认 gitee/main
//   node tests/upstream-landing-rehearsal.mjs --full           # 六项全跑 + 逐规则对比表
//   node tests/upstream-landing-rehearsal.mjs --base <ref>     # 指定上游 ref（默认 gitee/main）
//   node tests/upstream-landing-rehearsal.mjs --keep           # 保留 worktree 供人工翻查（默认必删）
//   node tests/upstream-landing-rehearsal.mjs --selftest       # 纯内存自证，不建 worktree、不跑子进程
//
// 自证（--selftest，18 条离线断言，全部喂合成数据，不建树、不跑子进程）：
//   A 新增失败被点名          B 真转绿被点名            C 假绿（pass=0 且 skip 全量）单列、不算转绿
//   D 规则消失不静默          E 规则新增不静默          F1/F2 同规则更差·转好被点名
//   F3 失败数增加 ⇒ 不可落    G 失败数不变且无假绿 ⇒ 可落
//   H 空样本（ruleCount=0）⇒ 判红，不放过              I 静态判据由 pass 转 fail ⇒ 不可落
//   J 整池全灭标记（pass=0 且 fail=cases）              K 对比函数对同一份数据幂等
//   L 规范化幂等 / L2 规则表空但 ruleCount 有值仍判红（V1.0.0 自咬的回归牙）
//   M1~M3 参数解析（--base 正常取值 / 缺值 / 后跟开关）
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkWorktreeClean } from './_lib/worktree-guard.mjs';
// 第49轮(main移植)：main 的 worktree-guard 还是 V1.0.1，尚无 exitDirtyByGuard（那是夜间 V1.1.0 新增的全局退码口径）。
//   本工具不为此改全局守卫(会改别的脚本退码)，只在本地保留同语义的退 3：脏树=取证环境不干净，非代码缺陷。
function exitDirtyLocal(g, opts) {
    const label = (opts && opts.label) || '本脚本';
    console.log('❌ 结论作废（环境不干净，非代码缺陷）：' + label);
    for (const r of (g && g.reasons) || []) console.log('    · ' + r);
    return 3;
}

export const VER = 'tests/upstream-landing-rehearsal.mjs V1.0.0';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const EXIT_OK = 0;
const EXIT_NOT_LANDABLE = 1;
const EXIT_ENV = 3;
// 叠加 tests 时排除的目录：变异沙箱 2.1G、报告目录、历史报告产物 —— 排除后 2.2G 降到约 100M。
const OVERLAY_EXCLUDE = [
    /[\\/]tests[\\/]\.mut([\\/]|$)/,
    /[\\/]tests[\\/]_reports([\\/]|$)/,
    /[\\/]tests[\\/]output([\\/]|$)/
];

// ---------------------------------------------------------------------------
// 纯函数区：规则统计的规范化 / 对比 / 判定（--selftest 直接喂合成对象，不碰磁盘与子进程）
// ---------------------------------------------------------------------------

/**
 * 把 RULE_STATS_OUT 的 JSON 规范化成 { cases, ruleCount, rules:Map<name,{pass,fail,skip}>, knownTransfers:Set }。
 * ★ V1.0.0 自咬一处：本函数曾被调用两次（runRulesReplay 返回已规范化对象，diffRuleStats 又规范化一次），
 *   第二次读不到 o.agg ⇒ rules 空 Map、ruleCount 仍是 181 ⇒ 对比表三列全 0 却判 PASS。
 *   这正是本件要防的「空样本假绿」，只是发生在自己身上。故加①幂等短路；②rules 为空一律按未取到处理。
 */
export function normalizeStats(raw) {
    if (raw && raw.rules instanceof Map) return raw; // 已规范化：原样返回（幂等）
    const o = (typeof raw === 'string') ? JSON.parse(raw) : raw;
    const rules = new Map();
    if (o && o.agg && typeof o.agg === 'object') {
        for (const [name, a] of Object.entries(o.agg)) {
            rules.set(name, {
                pass: Number(a && a.pass) || 0,
                fail: Number(a && a.fail) || 0,
                skip: Number(a && a.skip) || 0
            });
        }
    }
    return {
        cases: Number(o && o.cases) || 0,
        ruleCount: Number(o && o.ruleCount) || rules.size,
        rules,
        knownTransfers: new Set(Array.isArray(o && o.knownTransfers) ? o.knownTransfers : [])
    };
}

/**
 * 逐规则对比。返回六桶，桶名即归因待办的分类：
 *   addedFail 本树无红、上游有红（**唯一能单独构成「不可落」的桶**）
 *   fixed     本树有红、上游无红且仍需样本（真转绿）
 *   fakeGreen 本树有红、上游 pass=0（一次样本都没取到 —— 不是修好，是没跑）
 *   worsened  两边都有红、上游失败更多
 *   eased     两边都有红、上游失败更少（不构成可落，只是趋势）
 *   vanished / appeared  规则条数对不上（改名/删除/新增，必须人看一眼，不静默）
 */
export function diffRuleStats(localRaw, upstreamRaw) {
    const L = normalizeStats(localRaw);
    const U = normalizeStats(upstreamRaw);
    const out = {
        local: L,
        upstream: U,
        addedFail: [], fixed: [], fakeGreen: [], worsened: [], eased: [],
        vanished: [], appeared: []
    };
    for (const [name, l] of L.rules) {
        const u = U.rules.get(name);
        if (!u) { out.vanished.push({ name, local: l }); continue; }
        const lRed = l.fail > 0, uRed = u.fail > 0;
        if (!lRed && uRed) out.addedFail.push({ name, local: l, upstream: u });
        else if (lRed && !uRed) {
            // pass=0 ⇒ 上游这条规则一个样本都没断言过。skip 全量是最强证据，但 pass=0 本身就足够定性。
            if (u.pass === 0) out.fakeGreen.push({ name, local: l, upstream: u });
            else out.fixed.push({ name, local: l, upstream: u });
        } else if (lRed && uRed) {
            if (u.fail > l.fail) out.worsened.push({ name, local: l, upstream: u });
            else if (u.fail < l.fail) out.eased.push({ name, local: l, upstream: u });
        }
    }
    for (const [name, u] of U.rules) {
        if (!L.rules.has(name)) out.appeared.push({ name, upstream: u });
    }
    // 排序：失败多的在前，方便白天先看最狠的
    const byFail = (a, b) => (b.upstream.fail - a.upstream.fail) || a.name.localeCompare(b.name);
    out.addedFail.sort(byFail);
    out.worsened.sort(byFail);
    return out;
}

/** 上游与本地的一级汇总（失败规则数 / 转交 / 恒 skip），口径与 rules-replay 结论行同源。 */
export function summarize(stats) {
    let fails = 0, transferred = 0, dead = 0;
    for (const [name, a] of stats.rules) {
        const isTransfer = a.fail > 0 && stats.knownTransfers.has(name);
        if (a.fail > 0 && !isTransfer) fails++;
        else if (isTransfer) transferred++;
        else if (a.pass === 0) dead++;
    }
    return { cases: stats.cases, ruleCount: stats.ruleCount, rulesSize: stats.rules.size, fails, transferred, dead };
}

/** 整池全灭：一次通过都没有，且失败数就是样本数（或远超通过数）。 */
export function isPoolWipe(a, cases) {
    if (!a || a.pass > 0) return false;
    if (a.fail === 0) return false; // 全 skip ≠ 全灭，那是空转，另有口径
    if (cases > 0) return a.fail >= cases;
    return a.fail > 0 && a.skip === 0;
}

/**
 * 判定：可落 / 不可落。静态判据用 { key, code } 数组传入（0 pass，非 0 红）。
 * ★ 只做「不增红」判定，不做「必须转绿」判定 —— 上游修好多少不是落地的必要条件。
 */
export function verdict(diff, staticLocal, staticUpstream) {
    const reasons = [];
    const L = summarize(diff.local);
    const U = summarize(diff.upstream);

    if (!L.ruleCount || !U.ruleCount || !L.rulesSize || !U.rulesSize) {
        reasons.push('样本未取到：本树规则 ' + L.ruleCount + ' 条 / 上游规则 ' + U.ruleCount + ' 条（空样本不许判可落）');
    }
    if (diff.addedFail.length) reasons.push('新增失败规则 ' + diff.addedFail.length + ' 条');
    if (diff.fakeGreen.length) reasons.push('假绿 ' + diff.fakeGreen.length + ' 条（有红变 pass=0，不是修好）');
    if (U.dead > L.dead) reasons.push('恒 skip 规则由 ' + L.dead + ' 增到 ' + U.dead + ' 条');
    if (U.fails > L.fails) reasons.push('失败规则总数由 ' + L.fails + ' 增到 ' + U.fails + ' 条');

    for (const l of (staticLocal || [])) {
        const u = (staticUpstream || []).find(x => x.key === l.key);
        if (!u) continue;
        if (l.code === 0 && u.code !== 0) reasons.push('静态判据退化：' + l.label + '（本树通过 → 上游退 ' + u.code + '）');
    }
    return { ok: reasons.length === 0, reasons, local: L, upstream: U };
}

/** 从子进程输出抽一行结论（与 run-all 的 pickKeyLine 同思路的极简版：末条命中断言词的行）。 */
export function pickVerdictLine(raw, code) {
    const lines = String(raw || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const red = /(FAIL|失败|❌|漂移|违规|拦截|不可落)/;
    const green = /(PASS|通过|✅|全过)/;
    for (let i = lines.length - 1; i >= 0; i--) {
        const l = lines[i];
        if (code !== 0 ? red.test(l) : (green.test(l) || red.test(l))) return l.slice(0, 200);
    }
    return lines.length ? lines[lines.length - 1].slice(0, 200) : '(无输出)';
}

// ---------------------------------------------------------------------------
// 静态判据抽取（四项 + 版本抬升，共五项；规则回放单独走 JSON）
// ---------------------------------------------------------------------------

export function staticChecks() {
    return [
        { key: 'layer', label: '分层依赖方向', script: 'tests/layer-direction-scan.mjs', args: ['--enforce'] },
        { key: 'verdrift', label: '版本常量漂移', script: 'tests/ver-drift-selftest.mjs', args: [] },
        { key: 'state', label: '状态字段注册', script: 'tests/state-field-registry-scan.mjs', args: [] },
        { key: 'contract', label: '静态契约一致性', script: 'tests/contract-consistency.mjs', args: [] },
        { key: 'verbump', label: '版本抬升绊线', script: 'tests/ver-bump-selftest.mjs', args: [] }
    ];
}

/** 从静态脚本输出里抽「数字指标」，抽不到就用退码 —— 抽不到不算绿，只算「未取到」。 */
export function staticMetric(key, raw, code) {
    const s = String(raw || '');
    const num = (re) => { const m = s.match(re); return m ? Number(m[1]) : null; };
    if (key === 'layer') {
        const rev = num(/新增反向\s*(\d+)\s*条/);
        const cyc = num(/新增环\s*(\d+)\s*组/);
        if (rev === null && cyc === null) return { text: code === 0 ? '0 反向 / 0 环' : '退 ' + code, n: null };
        return { text: (rev || 0) + ' 反向 / ' + (cyc || 0) + ' 环', n: (rev || 0) + (cyc || 0) };
    }
    if (key === 'verdrift') {
        const d = num(/漂移\s*(\d+)\s*条/);
        if (d === null) return { text: code === 0 ? '0 条' : '退 ' + code, n: null };
        return { text: d + ' 条', n: d };
    }
    if (key === 'state') {
        const v = num(/违规\s*(\d+)\s*处/);
        if (v === null) return { text: code === 0 ? '0 处' : '退 ' + code, n: null };
        return { text: v + ' 处', n: v };
    }
    return { text: code === 0 ? '通过' : '退 ' + code, n: null };
}

// ---------------------------------------------------------------------------
// 子进程与工作树
// ---------------------------------------------------------------------------

function sh(cmd, args, opts) {
    const r = spawnSync(cmd, args, {
        cwd: (opts && opts.cwd) || ROOT,
        encoding: 'utf8',
        env: Object.assign({}, process.env, (opts && opts.env) || {}),
        maxBuffer: 128 * 1024 * 1024,
        timeout: (opts && opts.timeout) || 20 * 60 * 1000
    });
    return { code: (typeof r.status === 'number') ? r.status : 1, out: r.stdout || '', err: r.stderr || '' };
}

function git(args, cwd) {
    return sh('git', args, { cwd: cwd || ROOT, timeout: 180 * 1000 });
}

function resolveRef(ref) {
    const r = git(['rev-parse', '--verify', '--quiet', ref]);
    return r.code === 0 ? r.out.trim() : null;
}

function shortSha(sha) {
    return String(sha || '').slice(0, 8);
}

/** 叠加 tests：排除变异沙箱与报告目录；先删目标 tests 再整棵拷，避免上游残留旧文件干扰。 */
function overlayTests(repoRoot, workDir) {
    const src = path.join(repoRoot, 'tests');
    const dst = path.join(workDir, 'tests');
    fs.rmSync(dst, { recursive: true, force: true });
    fs.cpSync(src, dst, {
        recursive: true,
        dereference: false,
        filter: (p) => !OVERLAY_EXCLUDE.some(re => re.test(p))
    });
    const nmSrc = path.join(repoRoot, 'node_modules');
    const nmDst = path.join(workDir, 'node_modules');
    if (fs.existsSync(nmSrc) && !fs.existsSync(nmDst)) {
        try { fs.symlinkSync(nmSrc, nmDst, 'dir'); } catch (e) { /* 软链失败不致命：体检脚本纯 node，无第三方依赖 */ }
    }
}

/** 临时提交：rules-replay 在脏树上按 exit 3 拒答，不提交等于白跑。身份用 -c 临时给，不写任何 config。 */
function tmpCommit(workDir) {
    const add = git(['add', '-A', 'tests'], workDir);
    if (add.code !== 0) return { ok: false, why: 'git add 失败：' + add.err.trim().slice(0, 200) };
    const st = git(['status', '--porcelain'], workDir);
    if (st.code === 0 && !st.out.trim()) return { ok: true, why: '无需提交（树已干净）' };
    const c = git(['-c', 'user.name=预演', '-c', 'user.email=pre@local', 'commit', '-q', '-m', 'tmp: 预演叠加 tests'], workDir);
    if (c.code !== 0) return { ok: false, why: '临时提交失败：' + (c.err || c.out).trim().slice(0, 200) };
    return { ok: true, why: '已临时提交' };
}

function runStaticChecks(treeDir) {
    const rows = [];
    for (const c of staticChecks()) {
        const r = sh(process.execPath, [path.join(treeDir, c.script), ...c.args], { cwd: treeDir, timeout: 10 * 60 * 1000 });
        const m = staticMetric(c.key, r.out + '\n' + r.err, r.code);
        rows.push({
            key: c.key, label: c.label, code: r.code, metric: m.text, n: m.n,
            line: pickVerdictLine(r.out + '\n' + r.err, r.code)
        });
    }
    return rows;
}

function runRulesReplay(treeDir, outJson) {
    const r = sh(process.execPath, [path.join(treeDir, 'tests/rules-replay.mjs')], {
        cwd: treeDir,
        env: { RULE_STATS_OUT: outJson },
        timeout: 30 * 60 * 1000
    });
    let stats = null;
    try { stats = normalizeStats(JSON.parse(fs.readFileSync(outJson, 'utf8'))); } catch (e) { stats = null; }
    return { code: r.code, raw: r.out + '\n' + r.err, stats };
}

function worktreeRegistered(workDir) {
    const r = git(['worktree', 'list', '--porcelain']);
    if (r.code !== 0) return true; // 读不到就按「可能残留」处理，宁可报红
    return r.out.split(/\r?\n/).some(l => l.startsWith('worktree ') && path.resolve(l.slice(9).trim()) === path.resolve(workDir));
}

function cleanupWorktree(workDir) {
    const notes = [];
    git(['worktree', 'remove', '--force', workDir]);
    git(['worktree', 'prune']);
    if (fs.existsSync(workDir)) {
        try { fs.rmSync(workDir, { recursive: true, force: true }); notes.push('目录句柄已强删'); } catch (e) { notes.push('强删失败：' + e.message); }
        git(['worktree', 'prune']);
    }
    const still = worktreeRegistered(workDir);
    if (still) notes.push('注册表仍残留该路径');
    return { clean: !still && !fs.existsSync(workDir), notes };
}

// ---------------------------------------------------------------------------
// 输出
// ---------------------------------------------------------------------------

function printTable(title, head, rows) {
    console.log('');
    console.log(title);
    const widths = head.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)));
    const line = (cells) => '  ' + cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');
    console.log(line(head));
    console.log('  ' + widths.map(w => '-'.repeat(w)).join('  '));
    for (const r of rows) console.log(line(r));
}

function printDiff(diff, cases) {
    const L = summarize(diff.local), U = summarize(diff.upstream);
    printTable('规则回放汇总（口径同 rules-replay 结论行）：', ['项', '本树', '上游预演', '差'], [
        ['样本场次', L.cases, U.cases, U.cases - L.cases],
        ['规则条数', L.ruleCount, U.ruleCount, U.ruleCount - L.ruleCount],
        ['失败规则', L.fails, U.fails, (U.fails - L.fails >= 0 ? '+' : '') + (U.fails - L.fails)],
        ['转交中', L.transferred, U.transferred, (U.transferred - L.transferred >= 0 ? '+' : '') + (U.transferred - L.transferred)],
        ['恒 skip', L.dead, U.dead, (U.dead - L.dead >= 0 ? '+' : '') + (U.dead - L.dead)]
    ]);

    if (diff.addedFail.length) {
        printTable('新增失败 ' + diff.addedFail.length + ' 条（本树无红 → 上游有红；先判内容改名还是真回归）：',
            ['规则', '本树 pass/fail/skip', '上游 pass/fail/skip', '标记'],
            diff.addedFail.map(x => [
                x.name,
                x.local.pass + '/' + x.local.fail + '/' + x.local.skip,
                x.upstream.pass + '/' + x.upstream.fail + '/' + x.upstream.skip,
                isPoolWipe(x.upstream, U.cases) ? '★整池全灭' : ''
            ]));
    }
    const tag = (o) => o.name + '  ' + o.local.pass + '/' + o.local.fail + '/' + o.local.skip
        + ' → ' + o.upstream.pass + '/' + o.upstream.fail + '/' + o.upstream.skip;
    if (diff.fakeGreen.length) {
        console.log('');
        console.log('⚠ 假绿 ' + diff.fakeGreen.length + ' 条（本树有红 → 上游 pass=0：一次样本都取不到，不是修好，不许记转绿）：');
        for (const x of diff.fakeGreen) console.log('   · ' + tag(x));
    }
    if (diff.fixed.length) {
        console.log('');
        console.log('✅ 真转绿 ' + diff.fixed.length + ' 条（上游仍有样本通过）：');
        for (const x of diff.fixed) console.log('   · ' + tag(x));
    }
    if (diff.worsened.length) {
        console.log('');
        console.log('❌ 同规则更差 ' + diff.worsened.length + ' 条：');
        for (const x of diff.worsened) console.log('   · ' + tag(x));
    }
    if (diff.eased.length) {
        console.log('');
        console.log('· 同规则转好 ' + diff.eased.length + ' 条（不构成可落依据）：');
        for (const x of diff.eased) console.log('   · ' + tag(x));
    }
    if (diff.vanished.length) {
        console.log('');
        console.log('⚠ 规则消失 ' + diff.vanished.length + ' 条（本树有、上游无；改名或删除，须人看）：');
        for (const x of diff.vanished) console.log('   · ' + x.name + '（本树 ' + x.local.pass + '/' + x.local.fail + '/' + x.local.skip + '）');
    }
    if (diff.appeared.length) {
        console.log('');
        console.log('⚠ 规则新增 ' + diff.appeared.length + ' 条（上游有、本树无）：');
        for (const x of diff.appeared) console.log('   · ' + x.name + '（上游 ' + x.upstream.pass + '/' + x.upstream.fail + '/' + x.upstream.skip + '）');
    }
}

// ---------------------------------------------------------------------------
// --selftest：13 组合成断言
// ---------------------------------------------------------------------------

function selftest() {
    let bad = 0, total = 0;
    const ok = (cond, name, extra) => {
        total++;
        if (!cond) bad++;
        console.log((cond ? '  ✅ ' : '  ❌ ') + name + (cond || !extra ? '' : '  → ' + extra));
    };
    const mk = (cases, agg, transfers) => ({ cases, ruleCount: Object.keys(agg).length, agg, knownTransfers: transfers || [] });
    const A = { pass: 10, fail: 0, skip: 0 };
    const R = { pass: 8, fail: 2, skip: 0 };
    const P0 = { pass: 0, fail: 0, skip: 156 };
    const FULL = { pass: 0, fail: 156, skip: 0 };

    const local = mk(156, { '新增红': A, '真修好': R, '假绿规则': R, '更差': R, '转好': { pass: 5, fail: 5, skip: 0 }, '消失规则': R, '幂等': R });
    const upstream = mk(156, { '新增红': R, '真修好': A, '假绿规则': P0, '更差': { pass: 5, fail: 5, skip: 0 }, '转好': R, '新增规则': R, '幂等': R });
    const d = diffRuleStats(local, upstream);

    ok(d.addedFail.length === 1 && d.addedFail[0].name === '新增红', 'A 新增失败被点名');
    ok(d.fixed.length === 1 && d.fixed[0].name === '真修好', 'B 真转绿被点名');
    ok(d.fakeGreen.length === 1 && d.fakeGreen[0].name === '假绿规则' && d.fixed.every(x => x.name !== '假绿规则'),
        'C 假绿单列、且不被算进转绿', JSON.stringify(d.fixed.map(x => x.name)));
    ok(d.vanished.length === 1 && d.vanished[0].name === '消失规则', 'D 规则消失不静默');
    ok(d.appeared.length === 1 && d.appeared[0].name === '新增规则', 'E 规则新增不静默');
    ok(d.worsened.length === 1 && d.worsened[0].name === '更差', 'F1 同规则更差被点名');
    ok(d.eased.length === 1 && d.eased[0].name === '转好', 'F2 同规则转好被点名');

    const vBad = verdict(d, [], []);
    ok(!vBad.ok && vBad.reasons.some(r => /新增失败规则 1 条/.test(r)), 'F3 失败数增加 ⇒ 不可落', vBad.reasons.join('；'));

    const clean = diffRuleStats(mk(156, { x: R }), mk(156, { x: R }));
    ok(verdict(clean, [], []).ok, 'G 失败数不变且无假绿 ⇒ 可落');

    const empty = diffRuleStats(mk(0, {}), mk(0, {}));
    const vEmpty = verdict(empty, [], []);
    ok(!vEmpty.ok && vEmpty.reasons.some(r => /样本未取到/.test(r)), 'H 空样本 ⇒ 判红，不放过');

    const vStatic = verdict(clean, [{ key: 'layer', label: '分层依赖方向', code: 0 }], [{ key: 'layer', label: '分层依赖方向', code: 1 }]);
    ok(!vStatic.ok && vStatic.reasons.some(r => /静态判据退化/.test(r)), 'I 静态判据由 pass 转 fail ⇒ 不可落');

    ok(isPoolWipe(FULL, 156) && !isPoolWipe({ pass: 0, fail: 0, skip: 156 }, 156) && !isPoolWipe(R, 156),
        'J 整池全灭标记（全 skip 不算全灭）');

    const d2 = diffRuleStats(local, upstream);
    ok(JSON.stringify(d) === JSON.stringify(d2), 'K 对同一份数据幂等');

    // L：二次规范化不许丢规则（V1.0.0 自咬的回归牙 —— 对比表全 0 却判 PASS 就是这条没牙）
    const n1 = normalizeStats(local);
    const n2 = normalizeStats(n1);
    ok(n2.rules.size === n1.rules.size && n2.rules.size === 7,
        'L 规范化幂等（二次调用不丢规则）', n1.rules.size + ' → ' + n2.rules.size);
    const vLost = verdict({ local: normalizeStats({ cases: 156, ruleCount: 181, agg: {} }), upstream: normalizeStats({ cases: 156, ruleCount: 181, agg: {} }), addedFail: [], fakeGreen: [], vanished: [], appeared: [], worsened: [], eased: [] }, [], []);
    ok(!vLost.ok, 'L2 ruleCount 有值但规则表为空 ⇒ 仍按空样本判红');

    // M：参数解析（看板 #77 验收要求「自证覆盖参数解析」）—— 缺值/跟开关都不许把默认值吞掉
    const m1 = parseArgs(['--base', 'origin/main', '--full']);
    const m2 = parseArgs(['--base']);
    const m3 = parseArgs(['--base', '--keep']);
    ok(m1.base === 'origin/main' && m1.full && !m1.keep, 'M1 --base 正常取值 + --full 生效');
    ok(m2.base === 'gitee/main', 'M2 --base 缺值回落 gitee/main（不许变成 undefined）');
    ok(m3.base === 'gitee/main' && m3.keep, 'M3 --base 后跟开关时回落默认，且开关不被吞');

    console.log('');
    console.log(bad === 0
        ? '✅ RESULT: PASS —— 上游落地预演 自证 ' + total + '/' + total
        : '❌ RESULT: FAIL —— 上游落地预演 自证 ' + (total - bad) + '/' + total);
    return bad === 0 ? EXIT_OK : EXIT_NOT_LANDABLE;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

/** 参数解析（纯函数，可离线自证）：--base 缺值或后面跟的是另一个开关时回落到 gitee/main，不吞开关。 */
export function parseArgs(argv) {
    const list = Array.isArray(argv) ? argv : [];
    const bi = list.indexOf('--base');
    const next = bi >= 0 ? list[bi + 1] : null;
    return {
        selftest: list.includes('--selftest'),
        help: list.includes('-h') || list.includes('--help'),
        full: list.includes('--full'),
        keep: list.includes('--keep'),
        base: (next && !next.startsWith('-')) ? next : 'gitee/main'
    };
}

function main(argv) {
    const opt = parseArgs(argv);
    if (opt.selftest) return selftest();
    if (opt.help) {
        console.log('用法：node tests/upstream-landing-rehearsal.mjs [--full] [--base <ref>] [--keep] [--selftest]');
        return EXIT_OK;
    }
    const full = opt.full;
    const keep = opt.keep;
    const base = opt.base;

    console.log('=== 上游落地预演 ' + VER + ' ===');

    // 0) 前置：树必须干净。脏树上的对比一律不可信 —— 退 3，与「代码缺陷」分家。
    const g = checkWorktreeClean(import.meta.url);
    if (g.dirty) {
        const code = exitDirtyLocal(g, { label: '上游落地预演' });
        console.log('⛔ 取证不完整：脏树上不做预演对比');
        return code;
    }

    const localHead = resolveRef('HEAD');
    const baseHead = resolveRef(base);
    if (!baseHead) {
        console.log('⛔ 取证不完整：base「' + base + '」不可解析（先 git fetch 对应远端）');
        console.log('RESULT: 未执行 —— 上游 ref 取不到，退 ' + EXIT_ENV);
        return EXIT_ENV;
    }
    console.log('本树 HEAD=' + shortSha(localHead) + '  上游 base=' + base + '@' + shortSha(baseHead)
        + '  模式=' + (full ? 'full（六项 + 逐规则）' : 'quick（四项静态；规则侧不跑）'));

    if (localHead === baseHead) {
        console.log('· 本树与上游同一提交，无需预演');
        console.log('RESULT: PASS —— 无差异可预演');
        return EXIT_OK;
    }

    const workDir = '/tmp/hc-pre-' + shortSha(baseHead) + '-' + process.pid;
    if (fs.existsSync(workDir)) {
        try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (e) { /* 交给 worktree remove */ }
    }
    let exitCode = EXIT_ENV;
    let cleaned = { clean: false, notes: ['未执行清理'] };

    try {
        const add = git(['worktree', 'add', '--detach', workDir, base]);
        if (add.code !== 0) {
            console.log('⛔ 取证不完整：worktree 建立失败');
            console.log('   ' + (add.err || add.out).trim().split(/\r?\n/).slice(0, 3).join(' / '));
            console.log('RESULT: 未执行 —— worktree 建不起来，退 ' + EXIT_ENV);
            return EXIT_ENV;
        }
        const t0 = Date.now();
        overlayTests(ROOT, workDir);
        console.log('· 已叠加 tests（排除 .mut/_reports/output）到 ' + workDir + '（' + ((Date.now() - t0) / 1000).toFixed(1) + 's）');

        const commit = tmpCommit(workDir);
        if (!commit.ok) {
            console.log('⛔ 取证不完整：' + commit.why);
            console.log('RESULT: 未执行 —— 预演树弄不干净（rules-replay 会按脏树拒答），退 ' + EXIT_ENV);
            return EXIT_ENV;
        }
        console.log('· ' + commit.why + '，预演树可回放');

        // 1) 静态判据（双边）
        const sLocal = runStaticChecks(ROOT);
        const sUp = runStaticChecks(workDir);
        printTable('静态判据（本树 vs 上游预演）：', ['判据', '本树', '上游', '结论'],
            staticChecks().map(c => {
                const l = sLocal.find(x => x.key === c.key);
                const u = sUp.find(x => x.key === c.key);
                let v = '不变';
                if (l.code === 0 && u.code !== 0) v = '❌ 退化';
                else if (l.code !== 0 && u.code === 0) v = '✅ 转绿';
                else if (l.code !== 0 && u.code !== 0) v = (l.n !== null && u.n !== null && l.n !== u.n) ? '仍红·换批' : '仍红';
                return [c.label, l.metric + (l.code ? ' (退' + l.code + ')' : ''), u.metric + (u.code ? ' (退' + u.code + ')' : ''), v];
            }));

        // 2) 规则回放（仅 --full）
        let diff = null;
        if (full) {
            const stLocal = path.join(workDir, '..', '.hc-pre-local-' + process.pid + '.json');
            const stUp = path.join(workDir, '..', '.hc-pre-up-' + process.pid + '.json');
            console.log('');
            console.log('· 规则回放（本树）…');
            const rl = runRulesReplay(ROOT, stLocal);
            console.log('  exit=' + rl.code + '  ' + pickVerdictLine(rl.raw, rl.code));
            console.log('· 规则回放（上游预演树）…');
            const ru = runRulesReplay(workDir, stUp);
            console.log('  exit=' + ru.code + '  ' + pickVerdictLine(ru.raw, ru.code));
            if (rl.stats && ru.stats) {
                diff = diffRuleStats(rl.stats, ru.stats);
                printDiff(diff, ru.stats.cases);
            } else {
                console.log('⚠ 规则统计 JSON 未取到（本树 ' + (rl.stats ? 'ok' : 'null') + ' / 上游 ' + (ru.stats ? 'ok' : 'null') + '），规则侧判为未取到');
            }
            for (const p of [stLocal, stUp]) { try { fs.unlinkSync(p); } catch (e) { /* 忽略 */ } }
        } else {
            console.log('');
            console.log('规则回放：未比（quick 模式只跑静态四项；逐规则对比用 --full，双边约 8~10 分钟）');
        }

        // 3) 判定：full 才谈「可落」；quick 只报静态是否退化，明确不作可落结论（否则读起来像全绿）
        const sFlatL = sLocal.map(x => ({ key: x.key, label: x.label, code: x.code }));
        const sFlatU = sUp.map(x => ({ key: x.key, label: x.label, code: x.code }));
        const v = diff
            ? verdict(diff, sFlatL, sFlatU)
            : { ok: true, reasons: [], local: null, upstream: null };
        if (!diff) {
            for (const u of sFlatU) {
                const l = sFlatL.find(x => x.key === u.key);
                if (!l) v.reasons.push('静态判据缺项：' + u.label + '（本树未跑出来）');
                else if (l.code === 0 && u.code !== 0) v.reasons.push('静态判据退化：' + u.label + '（本树通过 → 上游退 ' + u.code + '）');
            }
            v.ok = v.reasons.length === 0;
        }

        console.log('');
        if (v.ok) {
            if (full) console.log('RESULT: PASS —— 预演未见退化（六项 + 逐规则：无新增红、无假绿、静态四项不退）');
            else console.log('RESULT: PASS —— 静态项未见退化（规则侧未比；本结论不构成可落依据，判可落须 --full）');
            exitCode = EXIT_OK;
        } else {
            console.log('RESULT: FAIL —— ' + (full ? '不可直接落' : '静态项已退化（规则侧未比）') + '（' + v.reasons.join('；') + '）');
            exitCode = EXIT_NOT_LANDABLE;
        }
    } catch (e) {
        console.log('⛔ 内部异常：' + (e && e.message ? e.message : e));
        console.log('RESULT: 未完成 —— 异常中断，退 ' + EXIT_ENV);
        exitCode = EXIT_ENV;
    } finally {
        if (keep) {
            console.log('· --keep：保留预演树 ' + workDir + '（人工翻查后请自行 git worktree remove --force）');
        } else {
            cleaned = cleanupWorktree(workDir);
            console.log('· 清理自证：worktree ' + (cleaned.clean ? '已删除、注册表零残留' : '清理不干净 —— ' + cleaned.notes.join('；')));
            if (!cleaned.clean && exitCode === EXIT_OK) exitCode = EXIT_ENV;
        }
    }
    console.log('自证：本仓 HEAD=' + shortSha(localHead) + ' 未改动；预演树路径=' + workDir + (keep ? '（保留）' : '（已删）'));
    return exitCode;
}

try {
    process.exit(main(process.argv.slice(2)));
} catch (e) {
    console.error('上游落地预演 异常退出：' + (e && e.stack ? e.stack : e));
    process.exit(EXIT_ENV);
}
