// tests/_lib/worktree-guard.mjs | V1.0.0 | 2026-11-14 · #9 引擎依赖体检脚本脏树前置守卫
//
// 目的：给依赖引擎/真实回放/变异取证的脚本提供统一「运行环境是否干净」前置检测。
// 背景（#3 脏树 skip=156 误判教训）：叠了并行会话未提交主代码 WIP 的共享主树上跑规则回放，
// 引擎崩溃/动态失真会把健康规则误判成「恒空转/假绿/覆盖不足」—— 结论静默失真、不可采信。
// ★ 脏树 ≠ 失败：本守卫只负责「显式告警 + 禁止下失真结论」，不篡改判据、不默认改退码。
//   调用方按自己的结论口径决定：拿 `dirty` 做闸门，脏时改报「结论作废/不可下结论」并跳过判绿。
//
// 判定：
//   · 干净：`git status --porcelain` 为空（含未暂存/已暂存/未跟踪）。detached HEAD 但无改动 = 干净（允许）。
//   · 脏：存在任意改动（主代码 WIP、测试 WIP、未跟踪等）。
//   · 远端 tip 漂移：HEAD ≠ @{u} / gh-ssh/main / gitee/main 任一已知远端主分支时告警（best-effort，
//     无远端信息不判脏，只跳过此项）。
//
// 用法：
//   import { checkWorktreeClean } from './_lib/worktree-guard.mjs';
//   const g = checkWorktreeClean(import.meta.url);
//   if (g.dirty) { /* 打印告警；禁止输出恒空转/假绿/覆盖不足结论；按需 exit */ }
//
export const VER = 'tests/_lib/worktree-guard.mjs V1.0.0';

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
 * @param {string|URL} [hint] import.meta.url 或任意路径，用于定位仓库根
 * @returns {{dirty:boolean, clean:boolean, reasons:string[], changed:string[], root:string, head:string, remoteRef:string|null, remoteAhead:boolean|null}}
 */
export function checkWorktreeClean(hint) {
    const root = resolveRoot(hint);
    const reasons = [];
    const changed = [];

    const headR = gitOut(root, ['rev-parse', '--short', 'HEAD']);
    const head = headR.ok ? headR.out : '(unknown)';

    // ① 未提交改动（含 staged / unstaged / untracked）
    const st = gitOut(root, ['status', '--porcelain']);
    if (!st.ok) {
        reasons.push('无法读取工作树状态：' + st.err);
    } else if (st.out) {
        const lines = st.out.split(/\r?\n/).filter(Boolean);
        for (const l of lines) changed.push(l.slice(0, 120));
        reasons.push('工作树存在未提交改动 ' + lines.length + ' 项（含主代码/测试/未跟踪的 WIP 皆会导致引擎回放失真）');
    }

    // ② HEAD ≠ 远端稳定 tip（best-effort）
    let remoteRef = null;
    let remoteAhead = null;
    const candidates = ['@{u}', 'gh-ssh/main', 'gitee/main', 'origin/main'];
    for (const ref of candidates) {
        const r = gitOut(root, ['rev-parse', '--verify', '--quiet', ref]);
        if (r.ok && r.out) { remoteRef = ref; break; }
    }
    if (remoteRef) {
        const diff = gitOut(root, ['rev-list', '--left-right', '--count', 'HEAD...' + remoteRef]);
        if (diff.ok) {
            const parts = diff.out.split(/\s+/);
            const ahead = parseInt(parts[0], 10) || 0;
            const behind = parseInt(parts[1], 10) || 0;
            remoteAhead = ahead !== 0 || behind !== 0;
            if (remoteAhead) {
                reasons.push('HEAD 与远端稳定 tip(' + remoteRef + ') 不一致：ahead ' + ahead + ' / behind ' + behind
                    + '（未推送或未同步的提交会让本地结论与远端基线脱节）');
            }
        }
    }

    const dirty = reasons.length > 0;
    return { dirty, clean: !dirty, reasons, changed, root, head, remoteRef, remoteAhead };
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
    if (g.head) console.log('    · HEAD=' + g.head + (g.remoteRef ? '  远端参照=' + g.remoteRef : '  远端参照=（无可用远端 ref，跳过 tip 对比）'));
    if (g.changed && g.changed.length) {
        console.log('    · 改动明细（前 ' + Math.min(maxShow, g.changed.length) + ' 项）：');
        for (const c of g.changed.slice(0, maxShow)) console.log('      ' + c);
        if (g.changed.length > maxShow) console.log('      … 其余 ' + (g.changed.length - maxShow) + ' 项略');
    }
    console.log('    · 处置：在干净的 detached worktree（锁定远端稳定 tip，git status --porcelain 为空）复跑后再下结论；叠 WIP 的主树结论一律作废。');
    return g;
}
