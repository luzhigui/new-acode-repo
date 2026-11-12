// 倒针「快进收尾与取消」（运行时探针）：上一棒自己列的运行时证据空白之三。
// 为什么需要：快进（fastForward）是倒针面板里唯一会自己改画面的入口：把进度一路摆到录制末步，
//   然后在 finally 里 exitReview（真暂停）。这条路径要钉死两处：
//   ① 快进期间必须置 busy（面板据此禁重复操作）；快进完成后必须收敛成「已退出回看 + 真暂停 +
//      倍速还原 + 两份账本按引用还原」；
//   ② **快进的尾巴不得越界动真战场**：用户在快进途中关掉面板（取消）时，尾巴仍会跑
//      syncReviewLog —— 而此时 #log 已经被 exitReview 还原成「真战场的战报行」，尾巴那次同步
//      把它们当成「多出来的行」整块清掉 ⇒ 玩家继续打的时候，战报日志凭空消失。
//      根因：尾巴不知道自己负责的那一回看还在不在（没有会话代次概念），也没判断
//      「回看已经被换掉了」⇒ 已转交主代码修（见 tests/known-transfers.md 的登记条 + 迭代日志转交块）。
// 本规则调用合成探针 tests/rewind-fastforward-cancel-probe-case.mjs（复用共用沙箱：DOM/Store 桩 +
//   变异体工厂，另加 rAF 桩让 infra/103 的时钟走起来、log 元素 innerHTML↔children 联动——不联动就
//   看不见「真账本被清空」），真跑 ui/727，逐条断言：
//     ① 快进期间 busy=true；
//     ② 快进完成后：回看已退出 + gs=PAUSED + isPaused=true + 倍速回到进场快照值 + 两份账本按引用还原；
//     ③ 快进被取消时，尾巴不得清空真战场的 #log（真账本必须还在）。
//   探针自带 3 条反向样本：no-busy（去掉 busy→①红）/ ff-resume（快进后改成 resume→②红）/
//   fix-tail-guard（★「修好样本」：给尾巴加会话代次守卫 ⇒ ③ 必须由红转绿，
//   证明这条判据咬的正是这个缺陷、不是别的东西）。
// ★ 当前主代码下 ③ 为红（真缺陷，已转交）⇒ 本规则暂时报红；该规则已登记进
//   tests/known-transfers.md（「转交中」不计退出码），主代码落地后即转绿并销项。
// ★ 环境起不来子进程（EPERM/ENOENT…）时返回 skip（守卫前提失效），不误报红。
export const VER = 'tests/health-rules/318-rewind-fastforward-cancel-runtime.js V1.0.0';

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isSpawnEnvFailure, isEnvSkipOutput, ENV_SKIP_REASON } from '../rewind-probe-sandbox-case.mjs';

const PROBE = fileURLToPath(new URL('../rewind-fastforward-cancel-probe-case.mjs', import.meta.url));
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
let _cached = null;

// 故障注入钩子（只给体检自证用）：把要起的解释器指到不存在的路径 ⇒ 模拟「环境不许起子进程」。
const EXE = process.env.HC_PROBE_EXE || process.execPath;

function runProbe() {
    if (_cached) return _cached;
    try {
        const out = execFileSync(EXE, [PROBE], {
            cwd: ROOT,
            encoding: 'utf8',
            timeout: 180000,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: process.env
        });
        _cached = { ok: /RESULT:\s*PASS/.test(out), out: out, skip: null };
    } catch (e) {
        const errOut = String((e && (e.stdout || '')) || '') + String((e && (e.stderr || '')) || '');
        if (isSpawnEnvFailure(e)) {
            _cached = { ok: false, out: errOut, skip: String((e && (e.code || e.errno || e.syscall)) || 'SPAWN_FAILED') };
        } else {
            _cached = { ok: false, out: errOut + ' [exit=' + (e && e.status) + ']' };
        }
    }
    return _cached;
}

export const rule318 = {
    group: '战报与渲染一致性',
    name: '倒针快进收尾与取消(运行时)',
    test: function(ctx, log) {
        const r = runProbe();
        if (r.skip) {
            console.log('[318] ' + ENV_SKIP_REASON + '（' + r.skip + '）⇒ 本项本轮跳过，不计失败');
            return 'skip';
        }
        if (isEnvSkipOutput(r.out)) {
            console.log('[318] ' + ENV_SKIP_REASON + '（探针内部子进程起不来）⇒ 本项本轮跳过，不计失败');
            return 'skip';
        }
        if (!r.ok) {
            const tail = (r.out || '').split('\n').filter(l => /✗|RESULT|Error/i.test(l)).slice(-6).join(' | ');
            return { fail: true, msg: '倒针快进探针未通过（快进取消后尾巴清空了真战场的战报日志 / 快进后没收敛）：' + (tail || '无输出') };
        }
        return { fail: false, msg: '运行时探针 PASS：快进期间 busy / 快进后收敛（退出+真暂停+倍速还原）/ 取消后真账本未被清空（3 条反向样本全红）' };
    }
};
