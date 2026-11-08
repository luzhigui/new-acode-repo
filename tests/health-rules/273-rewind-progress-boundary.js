// 进度跳转边界（静态）：步拨 / 段拨 / 快进在「第 0 步、第 0 段、末步末段、空点」上不得越界。
// 为什么需要：倒针是唯一允许用户把进度推到两端的地方。任一入口少一层夹取，
//   就会读出 S.steps[-1] / cues[-1]（undefined 后连锁 TypeError），表现为「点上一段没反应」
//   或「面板卡死」；且这些只在浏览器里出现，回放日志看不见 → 整文件源码结构断言。
// 判据：
//   ① 9 个导出入口都必须有 S.active 守卫（未进回看时点击不得改变状态）；
//   ② prevStep 夹 0、nextStep 夹末步；
//   ③ prevCue 在段 0 时回退到上一步末段，且第 0 步自身不再回绕（无负索引）；
//   ④ nextCue 在末段时前进到下一步第 0 段，且末步自身不再前进；
//   ⑤ paintAt 对 cueIdx 做 [-1, cues.length-1] 双向夹取 + step 缺失即返回（-1 = 本段之前基底态）；
//   ⑥ scrubToCue 对 cueIdx 做 [0, cues.length-1] 夹取 + step 缺失即返回；
//   ⑦ fastForward 的 last/stride/循环上界自洽（stride ≥1、i ≤ last）；
//   ⑧ enterReview 对「未开局 / 还没打出手（零步）」返回失败，不进入空进度回看。
export const VER = 'tests/health-rules/273-rewind-progress-boundary.js V1.0.0';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { enterReview, exitReview, startPlay, resumePlay, pausePlay, prevStep, nextStep, prevCue, nextCue, fastForward } from '../../ui/727-rewind-core.js';

function srcOf(fn) { return String(fn); }

export const rule273 = {
    group: '战报与渲染一致性',
    name: '进度跳转边界(步拨/段拨/快进不越界)',
    test: function(ctx, log) {
        let file = '';
        try { file = readFileSync(fileURLToPath(new URL('../../ui/727-rewind-core.js', import.meta.url)), 'utf8'); }
        catch (e) { return { fail: true, msg: '读不到 ui/727 源码：' + (e && e.message || e) }; }

        const srcs = {
            enterReview: srcOf(enterReview), exitReview: srcOf(exitReview), startPlay: srcOf(startPlay),
            resumePlay: srcOf(resumePlay), pausePlay: srcOf(pausePlay),
            prevStep: srcOf(prevStep), nextStep: srcOf(nextStep),
            prevCue: srcOf(prevCue), nextCue: srcOf(nextCue), fastForward: srcOf(fastForward)
        };
        // ① 未进回看不得动状态（enterReview 自己负责进门，不在此列）
        for (const k of ['exitReview', 'startPlay', 'resumePlay', 'pausePlay', 'prevStep', 'nextStep', 'prevCue', 'nextCue', 'fastForward']) {
            if (!/!S\.active/.test(srcs[k])) return { fail: true, msg: k + ' 缺 S.active 守卫：未进回看时点击会改状态' };
        }
        // ② 步拨两端夹取
        if (!/Math\.max\(0,\s*S\.stepIdx - 1\)/.test(srcs.prevStep)) return { fail: true, msg: 'prevStep 未夹 0：第 0 步点「上一步」会读 S.steps[-1]' };
        if (!/Math\.min\(S\.steps\.length - 1,\s*S\.stepIdx \+ 1\)/.test(srcs.nextStep)) return { fail: true, msg: 'nextStep 未夹末步：末步点「下一步」会读 S.steps[length]' };
        // ③④ 段拨两端
        if (!/S\.cueIdx > 0/.test(srcs.prevCue) || !/S\.stepIdx > 0/.test(srcs.prevCue)) {
            return { fail: true, msg: 'prevCue 两端分支不全：段 0 必须回退到上一步末段，且第 0 步不再回绕（否则负索引）' };
        }
        if (!/S\.cueIdx < n - 1/.test(srcs.nextCue) || !/S\.stepIdx < S\.steps\.length - 1/.test(srcs.nextCue)) {
            return { fail: true, msg: 'nextCue 两端分支不全：末段必须前进到下一步第 0 段，末步不再前进' };
        }
        // ⑤ paintAt 夹取（整文件内私有函数）
        if (!/Math\.min\(cueIdx,\s*cues\.length - 1\)/.test(file) || !/if\s*\(upto < -1\)\s*upto = -1/.test(file)) {
            return { fail: true, msg: 'paintAt 缺 cueIdx 双向夹取（上界 cues.length-1 / 下界 -1 基底态）' };
        }
        if (!/function paintAt\(stepIdx, cueIdx, opts = \{\}\) \{[\s\S]{0,120}if\s*\(!step\)\s*return;/m.test(file)) {
            return { fail: true, msg: 'paintAt 缺 step 缺失即返回：越界步号会连锁 TypeError' };
        }
        // ⑥ scrubToCue 夹取
        if (!/Math\.max\(0,\s*Math\.min\(cueIdx,\s*cues\.length - 1\)\)/.test(file)) {
            return { fail: true, msg: 'scrubToCue 缺 cueIdx 夹取：段拨可能读到 cues[-1]' };
        }
        if (!/async function scrubToCue\(stepIdx, cueIdx\) \{[\s\S]{0,160}if\s*\(!step\)\s*return;/m.test(file)) {
            return { fail: true, msg: 'scrubToCue 缺 step 缺失即返回' };
        }
        // ⑦ 快进上界自洽
        if (!/const last = S\.steps\.length - 1/.test(srcs.fastForward)) return { fail: true, msg: 'fastForward 未以末步为上界' };
        if (!/const stride = Math\.max\(1,\s*Math\.ceil\(span \/ 60\)\)/.test(srcs.fastForward)) return { fail: true, msg: 'fastForward stride 未夹 ≥1：span 为 0 时步长 0 会死循环' };
        if (!/for \(let i = from; i <= last; i \+= stride\)/.test(srcs.fastForward)) return { fail: true, msg: 'fastForward 循环上界不闭合（i <= last）' };
        if (!/const from = S\.stepIdx/.test(srcs.fastForward)) return { fail: true, msg: 'fastForward 未从当前步起算' };
        // ⑧ 进门零步保护
        if (!/steps\.length === 0/.test(srcs.enterReview) || !/!c\.store/.test(srcs.enterReview)) {
            return { fail: true, msg: 'enterReview 缺「未开局 / 零步」保护：会进入无内容回看' };
        }
        return { fail: false, msg: '进度跳转边界 8 项齐备（守卫/步拨/段拨/paintAt/scrub/快进/零步保护）' };
    }
};
