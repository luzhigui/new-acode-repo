// tests/nightly-merge-guard.mjs | V1.0.0 | 2026-11-08
// V1.0.0 | 2026-11-08 合并轮：新建「夜间成果合入守门」，拦住「远端已推 N 轮、白天会话一个都没取回」
//   这类静默断链。四路信号（日志夜间轮 / 合入登记 / 本地 refs / 远端实时）+ 15 条自证牙，
//   纯只读、挂 OBSERVES、不改分母。
//
// ★ 立它的由头（2026-11-08 早上实测，不是推断）：
//     夜间自动化每天 23/1/3/5/7 点各跑一轮，成果推到 Gitee 的 nightly/第N轮 分支 + 资料库 patch，
//     **不会**自动进白天会话的工作树。今早本地 refs 停在「第184轮」，远端已有 185/186/187/188/189
//     五轮实质成果（每轮都改了 tests/、都全量重跑过变异树），白天却完全看不见，甚至会误判
//     「昨天夜里没跑」。用户当场点过这个：「你昨天说的把他带进去了是什么？你这不是在扯淡吗？」
//
// ★ 本件只管一件事：夜间成果有没有进主线。不管判据对不对、不管代码有没有冲突（接力漂移守门管后者）。
//     定位与 mutation-freshness-tripwire 同款互补：那件管「变异树多久没产出」，本件管「夜间分支
//     多久没取回/没合入」。两者不重复实现对方逻辑。
//
// ★ 四路信号，全部实时解析，不维护第二份清单（第 173 轮「第二份快照」教训）：
//     ① latestNightly —— tests/体检迭代日志.md 里 latest 的「## 第 N 轮（…夜间…）」标题轮号；
//     ② mergedUpTo   —— 日志里独占一行的合入登记标记（由合并人写明「已合入到第几轮」）；
//     ③ fetchedUpTo  —— 本地 refs/remotes/gitee 里 nightly 分支的最大轮号（git for-each-ref）；
//     ④ remoteUpTo   —— 远端实时最大轮号（git ls-remote，8 秒超时）。
//   判红：未登记合入 / 登记落后于日志或远端 / 本地 refs 落后于日志 / 拿不到 git。
//   远端探测失败（离线、超时、没配 gitee 远端）只提示不判红：那不是「确定有成果没合入」。
//
// ★ 防自命中（第 189 轮「谈论命令 ≠ 执行命令」的同族坑）：合入登记只认**独占整行**的标记，
//   且该行不得含反引号。日志里凡解释本守门、引用标记写法的文字一律不算登记，Z9 自证牙咬住。
//
// ★ 只点名、不收口：挂 OBSERVES（hard: true 标确定性缺陷），不改 CHECKS 分母、不自动 fetch/merge。
//   「取回 + 合并 + 补登记」是人的动作，脚本不代劳，也不假装已经做过。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const VER = 'tests/nightly-merge-guard.mjs V1.0.0';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const LOG = path.join(HERE, '体检迭代日志.md');

// ---- 纯解析层（可单测，不碰磁盘/网络） ------------------------------------

/** 日志里的夜间轮标题：`## 第 185 轮（2026-11-07 夜间 · V9 双通道轮）`。
 *  「棒」（白天接力）与不带「夜间」的标题一律不算。 */
export function parseNightlyRounds(text) {
    const out = [];
    const re = /^##\s*第\s*(\d+)\s*轮（[^）\n]*夜间[^）\n]*）/gm;
    let m;
    while ((m = re.exec(text)) !== null) out.push(Number(m[1]));
    return out;
}

/** 合入登记：必须独占整行、不得含反引号（防「解释标记的样例」被当成真登记）。 */
export function parseMergeMarks(text) {
    const out = [];
    for (const line of String(text).split(/\r?\n/)) {
        if (line.includes('`')) continue;
        const m = /^<!--\s*NIGHTLY-MERGED:\s*(\d+)\s*-->\s*$/.exec(line);
        if (m) out.push(Number(m[1]));
    }
    return out;
}

/** 本地远端跟踪分支：gitee/nightly/第189轮 或 gitee/nightly-189 两种形态都认。 */
export function parseFetchedRounds(refsText) {
    const out = [];
    const re = /nightly\/(?:第)?(\d+)轮|nightly-(\d+)(?!\d)/g;
    let m;
    while ((m = re.exec(String(refsText))) !== null) out.push(Number(m[1] || m[2]));
    return out;
}

/** ls-remote 输出：sha + refs/heads/nightly/第N轮。 */
export function parseRemoteRounds(lsText) {
    const out = [];
    const re = /refs\/heads\/nightly\/(?:第)?(\d+)轮/g;
    let m;
    while ((m = re.exec(String(lsText))) !== null) out.push(Number(m[1]));
    return out;
}

/**
 * 纯判定。sig = { latestNightly, mergedUpTo, fetchedUpTo, remoteUpTo|null, gitOk, logOk }
 * 返回 { ok, reasons, required }。fail-closed：拿不到日志/git 一律判红。
 */
export function judge(sig) {
    const reasons = [];
    const maxOf = arr => (arr.length ? Math.max(...arr) : 0);
    const latest = maxOf([sig.latestNightly ?? 0]);
    const merged = maxOf([sig.mergedUpTo ?? 0]);
    const fetched = maxOf([sig.fetchedUpTo ?? 0]);
    const remote = sig.remoteUpTo;
    const required = Math.max(latest, Number.isFinite(remote) ? remote : 0);

    if (!sig.logOk) reasons.push('读不到 tests/体检迭代日志.md —— 无法核对夜间轮次（fail-closed）');
    if (!sig.gitOk) reasons.push('git for-each-ref 不可用 —— 无法核本地已取回分支（fail-closed）');
    if (sig.logOk && latest === 0) reasons.push('日志里解析不到任何「## 第 N 轮（…夜间…）」标题 —— 解析器可能已腐烂');
    if (sig.logOk && latest > 0 && merged === 0) {
        reasons.push(`日志已有夜间第 ${latest} 轮，但没有任何合入登记 —— 成果是否进过主线无从证明`);
    }
    if (merged > 0 && merged < required) {
        reasons.push(`合入登记只到第 ${merged} 轮，落后于应有轮次 ${required}`
            + (Number.isFinite(remote) && remote > latest ? `（远端已推到第 ${remote} 轮，本地日志还没这轮）` : '（日志里已有更新的夜间轮）'));
    }
    if (sig.gitOk && latest > 0 && fetched < latest) {
        reasons.push(`本地只取回到 nightly 第 ${fetched} 轮，落后于日志第 ${latest} 轮 —— 先 git fetch gitee 的夜间分支`);
    }
    if (sig.gitOk && merged > 0 && merged > fetched) {
        reasons.push(`合入登记写的是第 ${merged} 轮，本地却只取回到第 ${fetched} 轮 —— 登记与取证对不上，不许凭空登记`);
    }
    return { ok: reasons.length === 0, reasons, required };
}

// ---- 自证牙 ----------------------------------------------------------------
// 每颗都喂纯函数，不碰真实仓库。少一颗就少一层「改坏了没人知道」的保护。
function selftest() {
    const fails = [];
    const check = (name, sig, wantOk) => {
        const got = judge(sig);
        if (got.ok !== wantOk) fails.push(`${name}（期望 ${wantOk ? 'PASS' : 'FAIL'}，实得 ${got.ok ? 'PASS' : 'FAIL'}）`);
    };
    const base = { latestNightly: 189, mergedUpTo: 189, fetchedUpTo: 189, remoteUpTo: 189, gitOk: true, logOk: true };
    check('Z1 全同步必过', base, true);
    check('Z2 无合入登记必咬', { ...base, mergedUpTo: 0 }, false);
    check('Z3 登记落后一轮必咬', { ...base, mergedUpTo: 188 }, false);
    check('Z4 本地 refs 落后必咬', { ...base, fetchedUpTo: 184 }, false);
    check('Z5 远端新推一轮、日志还没合入必咬', { ...base, remoteUpTo: 190 }, false);
    check('Z6 登记超过本地已取回必咬', { ...base, fetchedUpTo: 188 }, false);
    check('Z7 git 不可用必咬（fail-closed）', { ...base, gitOk: false }, false);
    check('Z8 日志读不到必咬（fail-closed）', { ...base, logOk: false }, false);
    check('Z9 日志解析不出夜间轮必咬', { ...base, latestNightly: 0 }, false);
    check('Z10 离线（远端探测不到）不误伤', { ...base, remoteUpTo: null }, true);

    // 解析层自证：形状认得对、且不会把「谈论标记的文字」读成真登记。
    const log = [
        '## 第 185 轮（2026-11-07 夜间 · V9 双通道轮）',
        '## 第 189 轮（2026-11-08 夜间 · V9 双通道轮）',
        '## 合并轮（2026-11-08 白天会话）',
        '<!-- NIGHTLY-MERGED: 189 -->',
    ].join('\n');
    if (Math.max(...parseNightlyRounds(log)) !== 189) fails.push('Z11 夜间轮标题解析错（把白天合并轮也算进去）');
    if (Math.max(...parseMergeMarks(log)) !== 189) fails.push('Z12 合入登记解析错');
    const decoy = [
        '<!-- NIGHTLY-MERGED: 999 -->  ← 这只是说明文字里的样例',
        '`<!-- NIGHTLY-MERGED: 999 -->`',
        '  <!-- NIGHTLY-MERGED: 999 -->',
        '<!-- NIGHTLY-MERGED: 12 -->',
    ].join('\n');
    if (parseMergeMarks(decoy).length !== 1 || parseMergeMarks(decoy)[0] !== 12) {
        fails.push('Z13 防自命中失效：解释文字/反引号/缩进行被当成了真登记');
    }
    if (Math.max(...parseFetchedRounds('gitee/nightly/第189轮\ngitee/nightly-188\ngitee/main')) !== 189) {
        fails.push('Z14 本地 refs 两种形态解析错');
    }
    if (Math.max(...parseRemoteRounds('abc\trefs/heads/nightly/第190轮\ndef\trefs/heads/nightly/第189轮')) !== 190) {
        fails.push('Z15 远端轮号解析错');
    }

    if (fails.length) {
        console.log('❌ 自证牙失败 ' + fails.length + ' 条：' + fails.join('；'));
        return 1;
    }
    console.log('✅ 自证牙 15 条全咬住（Z1 同步 / Z2 缺登记 / Z3 登记落后 / Z4 本地落后 / Z5 远端领先 / '
        + 'Z6 登记超前 / Z7 无 git / Z8 无日志 / Z9 零夜间轮 / Z10 离线不误伤 / Z11–Z15 解析层与防自命中）');
    return 0;
}

// ---- 主流程 ----------------------------------------------------------------

function runGit(args, timeoutMs) {
    try {
        return execFileSync('git', args, {
            cwd: REPO, encoding: 'utf8', timeout: timeoutMs,
            stdio: ['ignore', 'pipe', 'ignore'],
        });
    } catch { return null; }
}

function main() {
    let logText = '';
    try { logText = fs.readFileSync(LOG, 'utf8'); } catch { /* logOk=false 交给 judge */ }
    const logOk = logText.length > 0;

    const refsText = runGit(['for-each-ref', '--format=%(refname:short)', 'refs/remotes/gitee'], 8000);
    const gitOk = refsText !== null;

    let remoteUpTo = null;
    const lsText = runGit(['ls-remote', '--heads', 'gitee', 'refs/heads/nightly/*'], 8000);
    if (lsText !== null) {
        const rr = parseRemoteRounds(lsText);
        remoteUpTo = rr.length ? Math.max(...rr) : 0;
    }

    const sig = {
        latestNightly: logOk ? (parseNightlyRounds(logText).reduce((a, b) => Math.max(a, b), 0)) : 0,
        mergedUpTo: logOk ? (parseMergeMarks(logText).reduce((a, b) => Math.max(a, b), 0)) : 0,
        fetchedUpTo: gitOk ? (parseFetchedRounds(refsText).reduce((a, b) => Math.max(a, b), 0)) : 0,
        remoteUpTo, gitOk, logOk,
    };
    const r = judge(sig);

    console.log('=== 夜间成果合入守门 ' + VER + ' ===');
    console.log('  ① 日志最新夜间轮        : 第 ' + sig.latestNightly + ' 轮');
    console.log('  ② 合入登记最高轮        : ' + (sig.mergedUpTo ? '第 ' + sig.mergedUpTo + ' 轮' : '（无登记）'));
    console.log('  ③ 本地已取回分支最高轮  : ' + (gitOk ? '第 ' + sig.fetchedUpTo + ' 轮' : '（git 不可用）'));
    console.log('  ④ 远端实时最高轮        : ' + (remoteUpTo === null ? '（未探测：离线/超时/未配 gitee 远端，不判红）' : '第 ' + remoteUpTo + ' 轮'));
    if (!r.ok) {
        console.log('RESULT: TRIP —— 有夜间成果没进主线，下列结论勿当作「昨夜没干活」：');
        for (const s of r.reasons) console.log('  · ' + s);
        console.log('  处置：git fetch gitee 的 nightly 分支 → 合并 tests/ 改动 → 在体检迭代日志追加独占一行的合入登记。');
        return 1;
    }
    console.log('RESULT: PASS —— 夜间第 ' + r.required + ' 轮及以前均有合入登记，且本地已取回');
    return 0;
}

if (process.argv.includes('--selftest')) {
    process.exit(selftest());
}
process.exit(main());
