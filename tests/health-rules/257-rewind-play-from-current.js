// 连续播放只从当前步往后（不重演前面已看过的步）。
// 为什么需要：回看连续播放若从第 0 步起播，会把已经看过/已经段拨过的历史步再演一遍
//   （日志重复追加、特效重复刷、玩家以为跳回开局）。D 口径要求「从哪里继续就从哪一步往后」。
//   该行为完全在浏览器里，回放日志看不见 → 本规则对 gated 导出函数做源码结构断言（不跑 DOM、不开浏览器）。
// 判据（回放 140 场逐场执行，0 误报）：
//   ① startPlay 的播放循环必须从 S.stepIdx 起，不得从 0 起；
//   ② 循环体必须把 S.stepIdx 推进到 i（播完到底时按末步收口）；
//   ③ 起播前必须把 store/日志静默摆到「本步之前」（paintAt(S.stepIdx, -1) + syncReviewLog(S.stepIdx - 1)），
//      只回日志不回 store 会把本步动作叠在段拨中间态上（buff 叠层翻倍 / 目标已不存在）；
//   ④ 继续播放（resumePlay）必须走 startPlay，不得重进 enterReview（后者会把位置重置到末步）。
//   ⑤ 跳步/粗拨必须夹在合法区间内（nextStep 不得越过末步、prevStep 不得小于 0）。
export const VER = 'tests/health-rules/257-rewind-play-from-current.js V1.0.0';

import { startPlay, resumePlay, prevStep, nextStep } from '../../ui/727-rewind-core.js';

function srcOf(fn) { return String(fn); }

export const rule257 = {
    group: '战报与渲染一致性',
    name: '连续播放只从当前步往后(不重演)',
    test: function(ctx, log) {
        var play = srcOf(startPlay);
        var resume = srcOf(resumePlay);
        var prev = srcOf(prevStep);
        var next = srcOf(nextStep);

        // ① 从当前步起播
        if (!/for\s*\(\s*let\s+i\s*=\s*S\.stepIdx;\s*i\s*<\s*S\.steps\.length;\s*i\+\+\)/.test(play)) {
            return { fail: true, msg: '连续播放未从当前步起播：startPlay 循环不是 i = S.stepIdx 起 —— 会把已看过的历史步重演一遍' };
        }
        if (/for\s*\(\s*let\s+i\s*=\s*0;\s*i\s*<\s*S\.steps\.length/.test(play)) {
            return { fail: true, msg: '连续播放从第 0 步起播：startPlay 存在 i = 0 循环 —— 历史步会全部重演' };
        }
        // ② 循环内推进步号
        if (!/for\s*\(\s*let\s+i\s*=\s*S\.stepIdx[\s\S]{0,120}S\.stepIdx\s*=\s*i;/.test(play)) {
            return { fail: true, msg: '播放循环未推进 S.stepIdx：播放器停点/暂停位置会与实际演出步错位' };
        }
        // ③ 起播前把基底摆到「本步之前」
        if (!/paintAt\(S\.stepIdx,\s*-1\)/.test(play) || !/syncReviewLog\(S\.stepIdx\s*-\s*1,\s*null\)/.test(play)) {
            return { fail: true, msg: '起播未回摆到本步之前：缺 paintAt(S.stepIdx,-1) 或 syncReviewLog(S.stepIdx-1) —— 本步会叠在段拨中间态上' };
        }
        // ④ 继续播放走 startPlay，不重置位置
        if (!/startPlay\(\)/.test(resume)) {
            return { fail: true, msg: 'resumePlay 没有接回 startPlay：暂停后继续会失效或走错路径' };
        }
        if (/enterReview\(/.test(resume)) {
            return { fail: true, msg: 'resumePlay 重进 enterReview：位置会被重置到末步，继续播放回不到原处' };
        }
        // ⑤ 跳步夹区间
        if (!/Math\.min\(\s*S\.steps\.length\s*-\s*1\s*,\s*S\.stepIdx\s*\+\s*1\s*\)/.test(next)) {
            return { fail: true, msg: 'nextStep 未夹末步上限：跳步可能越界' };
        }
        if (!/Math\.max\(\s*0\s*,\s*S\.stepIdx\s*-\s*1\s*\)/.test(prev)) {
            return { fail: true, msg: 'prevStep 未夹 0 下限：跳步可能取到负步号' };
        }
        return { fail: false, msg: '连续播放从当前步往后：起播回摆/循环起点/继续播放/跳步夹区间 4 项齐备' };
    }
};
