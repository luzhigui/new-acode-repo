// 倒针静默开关完整性：回看态只许由 ui/727 的 setReviewSilent 唯一开/关，
//   且 player/504 的每条演出通道都必须带 `!c.isRewinding` 守卫。
// 为什么需要：倒针采用 D 口径（定位/跳步/段拨静默，连续播放恢复演出）。
//   静默开关漏一处 = 回看定位时重放历史死亡红墨/飘字；连续播放被误静默 = 该有的攻击演出全丢。
//   两种故障都只在浏览器里出现，回放日志看不见 —— 故本规则做源码结构推演（导出函数源码级断言），
//   不依赖 DOM，不跑浏览器；回放 140 场逐场执行（每场都验一遍源码，0 误报）。
// 判据：
//   ① enterReview 必须置静默（setReviewSilent(c, true)）；
//   ② exitReview 必须恢复演出（setReviewSilent(c, false)）；
//   ③ 快进（fastForward）必须静默定位；
//   ④ 连续播放（startPlay）与继续播放（resumePlay）必须在开演前恢复演出；
//   ⑤ player/504 的每个 applyStageActionToFX 调用点与死亡红墨 BRUSH_EFFECT 都必须被
//      `!c.isRewinding` 同一行守卫或包在 `if (!c.isRewinding) { ... }` 块内；
//   ⑥ 零调用点守卫：504 的 FX 调用点数不得低于 5（守卫被连调用点一起删掉时不许假绿）。
export const VER = 'tests/health-rules/255-rewind-silent-switch.js V1.0.0';

import { enterReview, exitReview, startPlay, resumePlay, fastForward } from '../../ui/727-rewind-core.js';
import { playStepInterleaved } from '../../player/504-player-play-step.js';

var FX_CALL = /applyStageActionToFX\s*\(/;

function srcOf(fn) { return String(fn); }

// 逐行括号栈：找出「调用点既不在同一行 !c.isRewinding 条件里、也不在守卫块内」的行。
//   守卫块形如 `if (!c.isRewinding) {` 或 `if (hasDeathAction && !c.isRewinding) {` 都算。
function unguardedCalls(source, callRe) {
    var lines = source.split('\n');
    var depth = 0;
    var guardDepths = [];
    var bad = [];
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var inBlock = guardDepths.length > 0;
        if (callRe.test(line) && !/!c\.isRewinding/.test(line) && !inBlock) {
            bad.push((i + 1) + ': ' + line.trim().slice(0, 90));
        }
        if (/if\s*\([^)]*!c\.isRewinding[^)]*\)\s*\{/.test(line)) guardDepths.push(depth);
        depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        while (guardDepths.length && depth <= guardDepths[guardDepths.length - 1]) guardDepths.pop();
    }
    return bad;
}

export const rule255 = {
    group: '战报与渲染一致性',
    name: '倒针静默开关完整性(进场/定位/退出)',
    test: function(ctx, log) {
        var enter = srcOf(enterReview);
        var exitS = srcOf(exitReview);
        var play = srcOf(startPlay);
        var resume = srcOf(resumePlay);
        var ff = srcOf(fastForward);
        var step = srcOf(playStepInterleaved);

        // ① 进场即静默
        if (!/setReviewSilent\(c,\s*true\)/.test(enter)) {
            return { fail: true, msg: '进场未静默：enterReview 缺 setReviewSilent(c, true) —— 回看会重放战场演出' };
        }
        // ② 退出才恢复
        if (!/setReviewSilent\(c,\s*false\)/.test(exitS)) {
            return { fail: true, msg: '退出未恢复演出：exitReview 缺 setReviewSilent(c, false) —— 回真实战场后 FX 全被静默' };
        }
        // ③ 快进定位必须静默
        if (!/setReviewSilent\(\s*(ctx\(\)|c)\s*,\s*true\)/.test(ff)) {
            return { fail: true, msg: '快进未静默：fastForward 缺 setReviewSilent(..., true) —— 后台算到底会逐帧重放历史演出' };
        }
        // ④ 连续播放/继续播放前必须恢复演出
        if (!/setReviewSilent\(c,\s*false\)/.test(play)) {
            return { fail: true, msg: '连续播放未恢复演出：startPlay 缺 setReviewSilent(c, false) —— 该有的攻击/伤害/死亡特效全丢' };
        }
        if (!/setReviewSilent\(c,\s*false\)/.test(resume)) {
            return { fail: true, msg: '继续播放未恢复演出：resumePlay 缺 setReviewSilent(c, false)' };
        }
        // ⑥ 零调用点守卫（先于 ⑤ 执行：调用点被整段删掉时不许假绿）
        var fxCount = (step.match(/applyStageActionToFX\s*\(/g) || []).length;
        if (fxCount < 5) {
            return { fail: true, msg: '504 演出调用点只剩 ' + fxCount + ' 处（应 ≥5）——守卫可能连着调用点一起被删，演出通道缺失' };
        }
        // ⑤ 504 每条演出通道都要有静默守卫
        var fxBad = unguardedCalls(step, FX_CALL);
        if (fxBad.length) {
            return { fail: true, msg: '504 有 ' + fxBad.length + ' 处演出调用缺 !c.isRewinding 守卫（回看会重放历史特效）：' + fxBad.join(' | ') };
        }
        var brushBad = unguardedCalls(step, /BRUSH_EFFECT/);
        if (brushBad.length) {
            return { fail: true, msg: '504 死亡红墨 BRUSH_EFFECT 缺 !c.isRewinding 守卫（回看会刷历史死亡红叉）：' + brushBad.join(' | ') };
        }
        return { fail: false, msg: '静默开关 5 处齐备，504 演出调用点 ' + fxCount + ' 处全带守卫' };
    }
};
