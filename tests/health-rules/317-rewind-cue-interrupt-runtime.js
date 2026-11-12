// 倒针「段拨打断收敛 + 连续播放停点释放」（运行时探针）：上一棒自己列的运行时证据空白之二。
// 为什么需要：
//   ① 段拨被新段拨打断时的状态收敛：ui/727 的 scrubToCue 用 `token = ++S.cueToken` 做打断守卫，
//      被打断的那一次应当在 await 之后立刻收手。守卫一旦失效，被打断的旧段拨会在事后把自己的
//      日志行补回来 —— 玩家停在第 1 步，日志里却出现了第 2 步的行：画面/日志与位置对不上，
//      而且要等下一次同步才会被悄悄抹掉。静态规则（273/265）只查「源码里有没有那个 token 判断」，
//      盖不住「守卫真的生效吗」。
//   ② 连续播放的停点释放：pausePlay 只打「到下一个停点就停」的标记，resumePlay 必须把停点那个
//      挂起的等待真的放行（S.playRelease 兑现）；不放行 ⇒ 播放永久卡在停点，面板上「继续」
//      点了没反应。258 只静态查了这两句的存在。
// 本规则调用合成探针 tests/rewind-cue-interrupt-probe-case.mjs（复用共用沙箱：DOM/Store 桩 +
//   变异体工厂，另加 rAF 桩让 infra/103 的时钟走起来、log 元素 innerHTML↔children 联动），
//   真跑 ui/727，逐条断言：
//     ① 被打断后最终位置 = 最后一次操作的目标，且日志行数与最终位置一致（旧段拨不得事后补行）；
//     ② 连续播放必须在停点停住：进度不再前进、且仍在运行态（busy=true ⇒ 是停在停点不是播完了）；
//     ③ 「继续」必须真放行停点：播放继续推进、且能走到头（busy 归 false）；重复点不抛异常。
//   探针自带 3 条反向样本（改坏 ui/727 真源码重跑必须红在指定判据上）：
//     no-token-guard（去掉打断守卫→①红）/ pause-no-flag（不打停点标记→②红）/
//     no-play-release（不放行停点→③红）。
// 为什么是子进程：探针要自建 document/window/localStorage 桩 + 时钟，不能污染本 runner 的运行时；
//   进程隔离 + 结果缓存（156 场只跑一次），失败信息原样带回。
// ★ 环境起不来子进程（EPERM/ENOENT…）时返回 skip（守卫前提失效），不误报红 —— 详见共用沙箱
//   的 isSpawnEnvFailure；真缺陷（探针跑完报红）仍然照红不误。
export const VER = 'tests/health-rules/317-rewind-cue-interrupt-runtime.js V1.0.0';

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isSpawnEnvFailure, isEnvSkipOutput, ENV_SKIP_REASON } from '../rewind-probe-sandbox-case.mjs';

const PROBE = fileURLToPath(new URL('../rewind-cue-interrupt-probe-case.mjs', import.meta.url));
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

export const rule317 = {
    group: '战报与渲染一致性',
    name: '倒针段拨打断收敛与播放停点释放(运行时)',
    test: function(ctx, log) {
        const r = runProbe();
        if (r.skip) {
            console.log('[317] ' + ENV_SKIP_REASON + '（' + r.skip + '）⇒ 本项本轮跳过，不计失败');
            return 'skip';
        }
        if (isEnvSkipOutput(r.out)) {
            console.log('[317] ' + ENV_SKIP_REASON + '（探针内部子进程起不来）⇒ 本项本轮跳过，不计失败');
            return 'skip';
        }
        if (!r.ok) {
            const tail = (r.out || '').split('\n').filter(l => /✗|RESULT|Error/i.test(l)).slice(-6).join(' | ');
            return { fail: true, msg: '倒针段拨/停点探针未通过（被打断的段拨在事后补日志，或「继续」没放行停点）：' + (tail || '无输出') };
        }
        return { fail: false, msg: '运行时探针 PASS：打断后位置与日志一致 / 播放停在停点且仍在跑 / 「继续」真放行并走完（3 条反向样本全红）' };
    }
};
