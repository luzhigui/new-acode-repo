// worktree-redline-guard.mjs V1.0.0 | 2026-11-18 第29轮 (#45)
// 临时 worktree 三条红线的纯判定函数（无副作用，可离线自证）。
// 背景：第27轮踩坑——一键脚本把临时树建在 ROOT 内 → git checkout 复制该目录 → 连跑5次嵌套5层、
//   跑批从4分钟劣化到18分钟卡死；残留的子进程占句柄导致目录删不掉；陈旧 worktree 注册 prune 不清。
//   这些判定原先内联在 one-click-health.mjs 里、无法离线验证。抽成纯函数后可 --selftest 正负路径。
// 三条红线（用户 2026-11-18）：
//   ① 临时产物目录一律仓库外；② 不在临时目录 git init/clone（主仓树内不出现嵌套 .git）；
//   ③ 不设 ACL、跑完子进程全退、临时树清理干净。

// ① 路径是否落在主仓目录树内（true=违规）
export function isInsideRepo(worktree, root) {
    if (!worktree || !root) return true;  // 空输入按违规处理（fail-safe）
    const normalizedW = String(worktree).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const normalizedR = String(root).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    return normalizedW === normalizedR || normalizedW.startsWith(normalizedR + '/');
}

// ② 从 git worktree list --porcelain 输出里，抓指向目标 worktree 的注册行数。
//    0=未建/已清（合法），1=唯一（合法），>1=嵌套残留（违规）。
export function countRegistrations(porcelainOut, worktree) {
    const target = String(worktree || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    let n = 0;
    for (const line of String(porcelainOut || '').split(/\r?\n/)) {
        if (!line.startsWith('worktree ')) continue;
        const p = line.slice(9).trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
        if (p === target) n++;
    }
    return n;
}

// ③ 清理是否完成（true=干净）。也接受"路径存在但注册已清"的判断由调用方组合。
export function isCleaned(pathStillExists) {
    return !pathStillExists;
}

export function selftestWorktreeRedline() {
    const fails = [];
    const eq = (a, b, label) => {
        if (a !== b) fails.push(label + '：得 ' + a + ' 期望 ' + b);
    };
    const root = 'D:/repo/new-acode-repo';
    const outside = 'D:/repo/_仓库外产物/.tmp-health';
    // ① 仓库外/内 + 边界（前缀相同但不是子目录，如 new-acode-repo-other 不应误判）
    eq(isInsideRepo(outside, root), false, '①a 仓库外应合法');
    eq(isInsideRepo(root + '/.tmp-x', root), true, '①b 仓库内应违规');
    eq(isInsideRepo(root, root), true, '①c 等于root应违规');
    eq(isInsideRepo('D:/repo/new-acode-repo-other/.tmp', root), false, '①d 前缀相同非子目录不误判');
    eq(isInsideRepo('d:/REPO/NEW-ACODE-REPO/.tmp', root), true, '①e 大小写不敏感');
    eq(isInsideRepo('', root), true, '①f 空输入fail-safe');
    // ② 注册计数：0/1/2 + 路径归一（斜杠/尾斜杠）+ 只数目标不数别的 worktree
    const p1 = 'worktree ' + outside + '\nHEAD abc\n';
    eq(countRegistrations(p1, outside), 1, '②a 单注册');
    eq(countRegistrations(p1.replace(/\//g, '\\'), outside), 1, '②b 反斜杠归一');
    eq(countRegistrations('worktree ' + outside + '/\nHEAD x\n', outside), 1, '②c 尾斜杠归一（单条带尾斜杠仍算1）');
    eq(countRegistrations(p1 + p1, outside), 2, '②d 双注册=嵌套残留');
    eq(countRegistrations('worktree D:/other/wt\nHEAD x\n', outside), 0, '②e 别人的worktree不数');
    eq(countRegistrations('', outside), 0, '②f 空输出=未建/已清');
    // ③ 清理完成
    eq(isCleaned(false), true, '③a 目录已删=干净');
    eq(isCleaned(true), false, '③b 目录还在=没清干净');
    if (fails.length) {
        console.error('❌ 临时worktree红线守卫自证失败：\n  ' + fails.join('\n  '));
        return false;
    }
    console.log('✅ 临时worktree红线守卫自证 13/13（仓库外/路径边界/大小写/注册0-1-2/归一/清理）');
    return true;
}
