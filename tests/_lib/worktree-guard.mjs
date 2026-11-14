// tests/_lib/worktree-guard.mjs | V1.0.1 | 2026-11-14 · #9 引擎依赖体检脚本脏树前置守卫
//
// 目的：给依赖引擎/真实回放/变异取证的脚本提供统一「运行环境是否干净」前置检测。
// 背景（#3 脏树 skip=156 误判教训）：叠了并行会话未提交主代码 WIP 的共享主树上跑规则回放，
// 引擎崩溃/动态失真会把健康规则误判成「恒空转/假绿/覆盖不足」—— 结论静默失真、不可采信。
// ★ 脏树 ≠ 失败：本守卫只负责「显式告警 + 禁止下失真结论」，不篡改判据、不默认改退码。
//   调用方按自己的结论口径决定：拿 `dirty` 做闸门，脏时改报「结论作废/不可下结论」并跳过判绿。
//
// V1.0.1（2026-11-14 · #16）：修「干净树锁历史提交被误判成脏」。
//   V1.0.0 把「HEAD 与远端 tip 有 ahead/behind」也塞进 reasons ⇒ 一棵 porcelain=0、
//   锁在历史提交（或本地领先 1 笔）的干净 detached 树会被判 dirty=true，5 个回放族脚本全部
//   exit(1) 拿不到任何结论。这违反 #9 自己验收标准里「干净 detached worktree 跑法不受影响」，
//   也违反 skill §1.5 的推荐取证跑法 —— 防失真的守卫反而成了新的失真源。
//   ★ 修法：dirty 的唯一依据 = 工作树有未提交改动 / 状态读不到（会让引擎回放崩溃或动态失真的真因）；
//     tip 漂移降为 notes 仅提示，不参与判脏。判据①一字未动 ⇒ 脏树拒绝路径不放宽。
//
// 判定（V1.0.1）：
//   · 干净：`git status --porcelain` 为空（含未暂存/已暂存/未跟踪）。detached HEAD、锁历史提交、
//     本地领先/落后远端一律算干净 —— 文件固定在某一个 commit，恰是最可靠的取证环境。
//   · 脏：存在任意改动（主代码 WIP、测试 WIP、未跟踪等），或状态读取失败（不吞异常）。
//   · 远端 tip 漂移：best-effort 记录到 notes / remoteAhead，仅提示，不判脏。
//
// 用法：
//   import { checkWorktreeClean } from './_lib/worktree-guard.mjs';
//   const g = checkWorktreeClean(import.meta.url);
//   if (g.dirty) { /* 打印告警；禁止输出恒空转/假绿/覆盖不足结论；按需 exit */ }
//
// 自证（纯内存、零 IO、不依赖真实 git）：node tests/_lib/worktree-guard.mjs --selftest
//
export const VER = 'tests/_lib/worktree-guard.mjs V1.0.1';

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function gitOut(cwd, args) {
    try {
        return { ok: true, out: String(execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).trim() };
    } catch (e) {
        const stderr = e && e.stderr ? String(e.stderr).trim() : '';
        return { ok: false, out: '', err: (e && e.message ? e.message : String(e)) + (stderr ? ' | ' + stderr : '') };
    }
}

function resolveRoot(hint) {
    const start = hint ? path.dirname(fileURLToPath(hint)) : process.cwd();
    const r = gitOut(start, ['rev-parse', '--show-toplevel']);
    return r.ok ? r.out : path.resolve(start, '..');
}

/**
 * 纯判定：把「工作树状态」与「远端 tip 漂移」彻底分开，可离线自证。
 * ★ 唯一 dirty 依据是工作树有未提交改动 / 状态读不到。tip 漂移只进 notes。
 * @param {{statusOk:boolean, statusOut?:string, statusErr?:string, ahead?:number, behind?:number, hasRemote?:boolean, remoteRef?:string}} input
 * @returns {{dirty:boolean, clean:boolean, reasons:string[], notes:string[], changed:string[], tipDrift:boolean}}
 */
export function evaluateWorktree(input) {
    const { statusOk, statusOut = '', statusErr = '', ahead = 0, behind = 0, hasRemote = false, remoteRef = null } = input || {};
    const reasons = [];
    const notes = [];
    const changed = [];

    // ① 未提交改动（含 staged / unstaged / untracked）—— 唯一判脏依据
    if (!statusOk) {
        reasons.push('无法读取工作树状态：' + (statusErr || '(unknown)'));
    } else if (statusOut) {
        const lines = statusOut.split(/\r?\n/).filter(Boolean);
        for (const l of lines) changed.push(l.slice(0, 120));
        reasons.push('工作树存在未提交改动 ' + lines.length + ' 项（含主代码/测试/未跟踪的 WIP 皆会导致引擎回放失真）');
    }

    // ② HEAD ↔ 远端 tip 漂移：仅提示，不判脏（V1.0.1）
    const tipDrift = !!hasRemote && (ahead !== 0 || behind !== 0);
    if (tipDrift) {
        notes.push('HEAD 与远端 tip(' + remoteRef + ') 不一致：ahead ' + ahead + ' / behind ' + behind
            + '（干净树上属正常：锁历史提交或本地领先/落后；仅提示，不影响结论）');
    }

    const dirty = reasons.length > 0;
    return { dirty, clean: !dirty, reasons, notes, changed, tipDrift };
}

/**
 * @param {string|URL} [hint] import.meta.url 或任意路径，用于定位仓库根
 * @returns {{dirty:boolean, clean:boolean, reasons:string[], notes:string[], changed:string[], root:string, head:string, remoteRef:string|null, remoteAhead:boolean|null, tipDrift:boolean}}
 */
export function checkWorktreeClean(hint) {
    const root = resolveRoot(hint);
    const headR = gitOut(root, ['rev-parse', '--short', 'HEAD']);
    const head = headR.ok ? headR.out : '(unknown)';

    const st = gitOut(root, ['status', '--porcelain']);

    // 远端 tip 漂移（best-effort，只提示不判脏）
    let remoteRef = null;
    let ahead = 0, behind = 0, hasRemote = false;
    const candidates = ['@{u}', 'gh-ssh/main', 'gitee/main', 'origin/main'];
    for (const ref of candidates) {
        const r = gitOut(root, ['rev-parse', '--verify', '--quiet', ref]);
        if (r.ok && r.out) { remoteRef = ref; break; }
    }
    if (remoteRef) {
        const diff = gitOut(root, ['rev-list', '--left-right', '--count', 'HEAD...' + remoteRef]);
        if (diff.ok) {
            const parts = diff.out.split(/\s+/);
            ahead = parseInt(parts[0], 10) || 0;
            behind = parseInt(parts[1], 10) || 0;
            hasRemote = true;
        }
    }

    const judged = evaluateWorktree({ statusOk: st.ok, statusOut: st.out, statusErr: st.err, ahead, behind, hasRemote, remoteRef });
    return {
        ...judged,
        root, head, remoteRef,
        remoteAhead: hasRemote ? (ahead !== 0 || behind !== 0) : null
    };
}

/**
 * 打印统一告警。返回 guard 结果。
 * @param {object} g checkWorktreeClean 结果
 * @param {{label?:string, maxShow?:number}=} opts
 */
export function warnIfDirty(g, opts) {
    const label = (opts && opts.label) || '本脚本';
    const maxShow = (opts && opts.maxShow) || 8;
    if (!g || !g.dirty) return g;
    console.log('⚠️  脏树警告（' + label + '）—— 当前运行环境不干净，以下结论**不可作为恒空转/假绿/覆盖不足的判定依据**：');
    for (const r of g.reasons) console.log('    · ' + r);
    for (const n of (g.notes || [])) console.log('    · 提示：' + n);
    if (g.head) console.log('    · HEAD=' + g.head + (g.remoteRef ? '  远端参照=' + g.remoteRef : '  远端参照=（无可用远端 ref，跳过 tip 对比）'));
    if (g.changed && g.changed.length) {
        console.log('    · 改动明细（前 ' + Math.min(maxShow, g.changed.length) + ' 项）：');
        for (const c of g.changed.slice(0, maxShow)) console.log('      ' + c);
        if (g.changed.length > maxShow) console.log('      … 其余 ' + (g.changed.length - maxShow) + ' 项略');
    }
    console.log('    · 处置：在干净的 detached worktree（git status --porcelain 为空）复跑后再下结论；叠 WIP 的主树结论一律作废。');
    return g;
}

// ---------------------------------------------------------------------------
// --selftest：6 组离线断言，锁死「干净树不因 tip 漂移被误判」+「脏树拒绝不放宽」
// ---------------------------------------------------------------------------
function selftest() {
    const cases = [
        { name: 'A 干净树锁当前 tip', in: { statusOk: true, statusOut: '', hasRemote: true, ahead: 0, behind: 0, remoteRef: 'gh-ssh/main' }, dirty: false },
        { name: 'B 干净树锁历史提交(behind 1)', in: { statusOk: true, statusOut: '', hasRemote: true, ahead: 0, behind: 1, remoteRef: 'gh-ssh/main' }, dirty: false },
        { name: 'C 干净树本地领先(ahead 1)', in: { statusOk: true, statusOut: '', hasRemote: true, ahead: 1, behind: 0, remoteRef: 'gh-ssh/main' }, dirty: false },
        { name: 'D 干净树无远端 ref', in: { statusOk: true, statusOut: '', hasRemote: false }, dirty: false },
        { name: 'E 脏树有 WIP（拒绝路径不放宽）', in: { statusOk: true, statusOut: ' M core/210-battle-round.js\n M tools/802-toolkit.html', hasRemote: true, ahead: 0, behind: 0, remoteRef: 'gh-ssh/main' }, dirty: true },
        { name: 'F 状态读取失败（不吞异常）', in: { statusOk: false, statusErr: 'fatal: not a git repository' }, dirty: true }
    ];
    let bad = 0;
    for (const c of cases) {
        const r = evaluateWorktree(c.in);
        const ok = r.dirty === c.dirty;
        if (!ok) bad++;
        console.log((ok ? '  ✅ ' : '  ❌ ') + c.name + ' → dirty=' + r.dirty + '（期望 ' + c.dirty + '）');
    }
    // 附加：B/C 必须带 tip 提示但不带 reasons（证明信息没丢、只是不判脏）
    const b = evaluateWorktree(cases[1].in);
    const okNotes = b.tipDrift && b.notes.length === 1 && b.reasons.length === 0;
    if (!okNotes) bad++;
    console.log((okNotes ? '  ✅ ' : '  ❌ ') + 'G tip 漂移降级为 notes，reasons 为空');
    console.log(bad ? '结论：' + bad + ' 项自证失败' : '结论：7/7 自证通过（干净树不误判、脏树不放宽、信息不丢）');
    return bad ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv.includes('--selftest')) process.exit(selftest());
}
