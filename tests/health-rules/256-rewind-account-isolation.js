// 回看不写真实账本：倒针期间产出的日志/事实只能进临时数组，退出时必须整块换回本局真账本。
// 为什么需要：ui/727 回看复用本局录制、在同一页面里跑；若回看直接把 GlobalStore 的
//   battleLog / battleFacts 当写入口，退出后本局战报会被「回看的重演行」污染（复盘/导出/体检全串）。
//   主代码的隔离手段是「进场快照 + 清空 + 退出整块还原」，本规则把这条结构钉住：
//   任一步被删（快照丢了 / 清空丢了 / 还原丢了 / 504 直接写全局账本），回看就会污染真账。
// 判据（导出函数源码级，回放 140 场逐场执行，0 误报）：
//   ① enterReview 快照里必须同时含 battleLog 与 battleFacts；
//   ② enterReview 必须把两者置空（回看期间的写入落进临时数组）；
//   ③ exitReview 必须把两者从 S.snap 还原；
//   ④ player/504 只能 get/push 全局 battleLog / battleFacts，不得 set（否则会把回看行写进真账）。
export const VER = 'tests/health-rules/256-rewind-account-isolation.js V1.0.0';

import { enterReview, exitReview } from '../../ui/727-rewind-core.js';
import { playStepInterleaved } from '../../player/504-player-play-step.js';

function srcOf(fn) { return String(fn); }

function has(re, s) { return re.test(s); }

export const rule256 = {
    group: '战报与渲染一致性',
    name: '回看不写真实账本(快照隔离)',
    test: function(ctx, log) {
        var enter = srcOf(enterReview);
        var exitS = srcOf(exitReview);
        var step = srcOf(playStepInterleaved);

        // ① 进场快照两份账本
        if (!has(/battleLog\s*:\s*GlobalStore\.get\('battleLog'\)/, enter)) {
            return { fail: true, msg: '进场未快照战报：enterReview 的 S.snap 缺 battleLog —— 退出后无法还原本局真账' };
        }
        if (!has(/battleFacts\s*:\s*GlobalStore\.get\('battleFacts'\)/, enter)) {
            return { fail: true, msg: '进场未快照事实流：enterReview 的 S.snap 缺 battleFacts —— 退出后走势分析会被回看数据污染' };
        }
        // ② 回看期间两份账本置空（写入落进临时数组）
        if (!has(/GlobalStore\.set\('battleLog',\s*\[\]\)/, enter)) {
            return { fail: true, msg: '回看未隔离战报：enterReview 没有清空 battleLog，回看重演行会混进本局真账' };
        }
        if (!has(/GlobalStore\.set\('battleFacts',\s*\[\]\)/, enter)) {
            return { fail: true, msg: '回看未隔离事实流：enterReview 没有清空 battleFacts' };
        }
        // ③ 退出整块还原
        if (!has(/GlobalStore\.set\('battleLog',\s*S\.snap\.battleLog\)/, exitS)) {
            return { fail: true, msg: '退出未还原战报：exitReview 没有把 S.snap.battleLog 写回 —— 本局真账丢了' };
        }
        if (!has(/GlobalStore\.set\('battleFacts',\s*S\.snap\.battleFacts\)/, exitS)) {
            return { fail: true, msg: '退出未还原事实流：exitReview 没有把 S.snap.battleFacts 写回' };
        }
        // ④ 播放层不得直接 set 全局账本
        if (has(/GlobalStore\.set\('battleLog'/, step) || has(/GlobalStore\.set\('battleFacts'/, step)) {
            return { fail: true, msg: '504 直接写全局账本：播放层只许 get/push 临时数组，不许 set 真账本' };
        }
        return { fail: false, msg: '回看账本隔离四件齐备（快照/清空/还原/播放层只读）' };
    }
};
