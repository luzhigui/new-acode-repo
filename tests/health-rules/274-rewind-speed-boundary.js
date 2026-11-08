// 倍速切换边界（静态）：回看进场存倍速、退出按快照还原，且回看期间不得另写倍速。
// 为什么需要：倒针会把 gs 抬到 RUNNING、放开 isPaused 让 FX 播；若回看路径顺手改 speed，
//   退出后战场倍速就和用户进来前不一致（表现为「回看一次变快/变慢」）。反过来，快照只在
//   进场存、退出必须无条件还（不能只写在 resume 分支里，否则停泊态退出会漏还原）。
//   另：倍速改动必须走 ui/718 的 setState.speed（写值 + 刷按钮高亮），否则档位显示与实际不符。
// 判据：
//   ① enterReview 快照必须含 speed（GlobalStore.get('speed')）；
//   ② exitReview 必须 GlobalStore.set('speed', S.snap.speed)，且位于 if (resume) 之前（无条件）；
//   ③ ui/727 全文对 speed 的写入只能有这 1 处（回看动作不得改倍速）；
//   ④ ui/718 的倍速入口（setSpeed / restoreSpeedFromScroll）必须经 setState.speed，不得裸 set('speed')。
export const VER = 'tests/health-rules/274-rewind-speed-boundary.js V1.0.0';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { enterReview, exitReview, startPlay, resumePlay, fastForward } from '../../ui/727-rewind-core.js';
import { setSpeed, restoreSpeedFromScroll } from '../../ui/718-speed-controls.js';

function srcOf(fn) { return String(fn); }

export const rule274 = {
    group: '战报与渲染一致性',
    name: '倍速切换边界(进场快照/退出无条件还原)',
    test: function(ctx, log) {
        let file727 = '';
        try { file727 = readFileSync(fileURLToPath(new URL('../../ui/727-rewind-core.js', import.meta.url)), 'utf8'); }
        catch (e) { return { fail: true, msg: '读不到 ui/727 源码：' + (e && e.message || e) }; }

        const enter = srcOf(enterReview);
        const exitS = srcOf(exitReview);

        // ① 进场快照
        if (!/speed:\s*GlobalStore\.get\('speed'\)/.test(enter)) {
            return { fail: true, msg: 'enterReview 未快照 speed：退出时无法还原用户进来前的倍速' };
        }
        // ③ 全文件唯一写（先于 ②，防止别处多写后 ② 仍绿）
        const nSet = (file727.match(/GlobalStore\.set\('speed'/g) || []).length;
        if (nSet !== 1) {
            return { fail: true, msg: '727 对 speed 的写入应为 1 处（仅退出还原），实际 ' + nSet + ' 处 —— 回看动作会改倍速' };
        }
        // ② 退出无条件还原
        if (!/GlobalStore\.set\('speed',\s*S\.snap\.speed\)/.test(exitS)) {
            return { fail: true, msg: 'exitReview 未按快照还原 speed' };
        }
        const iRestore = exitS.indexOf("GlobalStore.set('speed', S.snap.speed)");
        const iResume = exitS.indexOf('if (resume)');
        if (iResume >= 0 && iRestore > iResume) {
            return { fail: true, msg: 'exitReview 的 speed 还原写在 resume 分支之后：停泊态退出会漏还原倍速' };
        }
        // ④ 718 倍速入口走统一写入 + 刷高亮
        const sSet = srcOf(setSpeed);
        const sRestore = srcOf(restoreSpeedFromScroll);
        if (!/setState\.speed\(/.test(sSet)) return { fail: true, msg: '718 setSpeed 未走 setState.speed：倍速值变了但按钮高亮不刷新' };
        if (!/setState\.speed\(/.test(sRestore)) return { fail: true, msg: '718 restoreSpeedFromScroll 未走 setState.speed' };
        if (/GlobalStore\.set\('speed'/.test(sSet) || /GlobalStore\.set\('speed'/.test(sRestore)) {
            return { fail: true, msg: "718 存在裸 GlobalStore.set('speed')：绕过了按钮高亮刷新" };
        }
        // 播放/快进入口不得写倍速（与 ③ 互补，防 ③ 被改成 0 后漏检）
        for (const [k, src] of [['startPlay', srcOf(startPlay)], ['resumePlay', srcOf(resumePlay)], ['fastForward', srcOf(fastForward)]]) {
            if (/set\('speed'|setState\.speed\(/.test(src)) {
                return { fail: true, msg: k + ' 里出现倍速写入：回看期间会改战场倍速' };
            }
        }
        return { fail: false, msg: '倍速边界收口：进场快照 / 退出无条件还原 / 回看动作零写 / 718 统一走 setState.speed' };
    }
};
