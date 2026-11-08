// 播放状态机切换清理：定位 / 跳步 / 段拨 / 播放 / 暂停互相切换时，不得留下悬挂的动画等待与未清理 fx。
// 为什么需要：倒针面板所有动作共用一个播放循环与若干等待句柄（busy / playing / stopPlay / playRelease /
//   _rewindCue / watchdog / 死亡摘格定时器）。任一句柄在切换路径上漏释放，就会留下「永远停住的 await」
//   （表现为点继续没反应）或「没人收的定时器 / 红叉」（表现为死亡特效残留、越回看越多）。
//   这些只在浏览器里发生，回放日志看不见 → 本规则对导出状态机入口做源码结构断言（不跑 DOM）。
// 判据（回放 140 场逐场执行，0 误报）：
//   ① 粗拨/快进入口必须 cancelRun（先取消在跑的播放，再定位）；
//   ② 细拨入口必须走 scrubToCue（互斥 token 路径）；
//   ③ startPlay 的 finally 必须清 _rewindCue + 复位 busy/playing，且回看态保持静默（只有 exitReview 能关）；
//   ④ exitReview 必须释放 playRelease、清 watchdog、清死亡摘格定时器、清 _rewindCue；
//   ⑤ enterReview 必须挂死亡摘格 watchdog 并先清一次残留计时器；
//   ⑥ pausePlay 只打停点标记；resumePlay 必须放行 playRelease 或重回 startPlay。
export const VER = 'tests/health-rules/258-rewind-state-cleanup.js V1.0.0';

import { enterReview, exitReview, startPlay, resumePlay, pausePlay, prevStep, nextStep, prevCue, nextCue, fastForward } from '../../ui/727-rewind-core.js';

function srcOf(fn) { return String(fn); }

function has(re, s) { return re.test(s); }

export const rule258 = {
    group: '战报与渲染一致性',
    name: '播放状态机切换清理(无悬挂演出)',
    test: function(ctx, log) {
        var enter = srcOf(enterReview);
        var exitS = srcOf(exitReview);
        var play = srcOf(startPlay);
        var resume = srcOf(resumePlay);
        var pause = srcOf(pausePlay);
        var prev = srcOf(prevStep);
        var next = srcOf(nextStep);
        var pCue = srcOf(prevCue);
        var nCue = srcOf(nextCue);
        var ff = srcOf(fastForward);

        // ① 粗拨/快进入口先取消在跑播放
        if (!has(/cancelRun\(\)/, prev)) return { fail: true, msg: 'prevStep 未 cancelRun：切换时在跑的播放没被取消，两路演出叠在一起' };
        if (!has(/cancelRun\(\)/, next)) return { fail: true, msg: 'nextStep 未 cancelRun：切换时在跑的播放没被取消' };
        if (!has(/cancelRun\(\)/, ff)) return { fail: true, msg: 'fastForward 未 cancelRun：后台算到底时原播放还在跑，落点会被旧播放覆盖' };
        // ② 细拨入口走互斥 token 路径
        if (!has(/scrubToCue\(/, pCue) || !has(/scrubToCue\(/, nCue)) {
            return { fail: true, msg: 'prevCue/nextCue 未走 scrubToCue：细拨失去 token 互斥，连续点会留下旧动画' };
        }
        // ③ 播放结束收口（finally）
        if (!/finally\s*\{[\s\S]*?c\._rewindCue\s*=\s*null[\s\S]*?S\.busy\s*=\s*false[\s\S]*?S\.playing\s*=\s*false/.test(play)) {
            return { fail: true, msg: 'startPlay 的 finally 未清 _rewindCue / 复位 busy+playing：播放异常退出会留悬挂停点' };
        }
        if (!/finally\s*\{[\s\S]*?setReviewSilent\(c,\s*true\)/.test(play)) {
            return { fail: true, msg: 'startPlay 结束未回到静默态：停止后真实战场的 FX 会被误放' };
        }
        // ④ 退出清理四件
        if (!has(/clearInterval\(S\.watchdog\)/, exitS)) return { fail: true, msg: 'exitReview 未清 watchdog：死亡摘格定时器继续跑，退出后尸体被反复摘掉' };
        if (!has(/clearDeathTimers\(c\)/, exitS)) return { fail: true, msg: 'exitReview 未清死亡摘格计时器' };
        if (!has(/c\._rewindCue\s*=\s*null/, exitS)) return { fail: true, msg: 'exitReview 未清 _rewindCue：残留停点回调会在真实战场触发' };
        if (!has(/S\.playRelease/, exitS)) return { fail: true, msg: 'exitReview 未释放 playRelease：停在停点时退出，继续按钮会永远等不到放行' };
        // ⑤ 进场挂 watchdog 并先清残留
        if (!has(/setInterval\(\(\)\s*=>\s*clearDeathTimers\(c\),\s*800\)/, enter)) {
            return { fail: true, msg: 'enterReview 未挂死亡摘格 watchdog：回看时尸体会被主循环摘掉，回看画面缺人' };
        }
        if (!has(/clearDeathTimers\(c\)/, enter)) return { fail: true, msg: 'enterReview 未先清残留死亡计时器：上次回看的定时器会带进新回看' };
        // ⑥ 暂停/继续语义
        if (!has(/S\.stopPlay\s*=\s*true/, pause)) return { fail: true, msg: 'pausePlay 未打停点标记：暂停不生效' };
        if (!has(/S\.playRelease/, resume) || !has(/startPlay\(\)/, resume)) {
            return { fail: true, msg: 'resumePlay 未「放行停点 或 重回 startPlay」：暂停后继续会失效' };
        }
        return { fail: false, msg: '状态机切换清理 6 项齐备（粗拨/细拨/播放收口/退出清理/进场 watchdog/暂停继续）' };
    }
};
