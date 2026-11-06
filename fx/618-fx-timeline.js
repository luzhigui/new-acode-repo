// V1.0.0 | 2026-11-06 新建：特效时间线唯一拼装入口 runTimeline（等待→逐帧→清理），fx/615 试点迁移
// fx/618-fx-timeline.js — 特效时间线的唯一拼装入口
//   把「等待 → 逐帧动画 → 收尾清理」的手写 .then 链收敛成声明式步骤表；行为与直接调用 clock 完全一致：
//     real: true （默认，真实时间轴）→ clock.waitReal / clock.animateReal：不吃倍速、暂停冻结、快进直接完成
//     real: false（逻辑时间轴）      → clock.wait / clock.animate：吃倍速、快进按倍率加速
//   步骤字段：at（相对起点偏移 ms，多步按 at 并行）｜dur（动画时长 ms）｜real｜minRealMs（仅 real:false）
//            onStart（到点后、动画开始前）｜onFrame(p 0..1)｜onDone（动画结束或 cancel 时执行清理）
//   cancel()：不再启动未开始步骤，并立即为所有步骤执行 onDone，防一次性特效 DOM 残留。
//   各文件自己的时长缩放（BT()/T()）仍留在调用方，保证各档位观感口径不变。
export const VER = 'fx/618-fx-timeline.js V1.0.0';

import { clock } from '../infra/103-clock.js';

export function runTimeline(steps) {
    const finished = new Set();
    let cancelled = false;
    const finish = (i) => {
        if (finished.has(i)) return;
        finished.add(i);
        const s = steps[i];
        if (s && typeof s.onDone === 'function') {
            try { s.onDone(); } catch (e) { console.error('[fx/618-fx-timeline] onDone 异常:', e); }
        }
    };
    const jobs = steps.map((s, i) => {
        const at = s.at > 0 ? s.at : 0;
        const dur = s.dur > 0 ? s.dur : 0;
        const real = s.real !== false;
        const go = () => {
            if (cancelled) { finish(i); return; }
            if (typeof s.onStart === 'function') {
                try { s.onStart(); } catch (e) { console.error('[fx/618-fx-timeline] onStart 异常:', e); }
            }
            if (dur <= 0) { finish(i); return; }
            const onFrame = typeof s.onFrame === 'function' ? s.onFrame : () => {};
            const anim = real
                ? clock.animateReal(dur, onFrame)
                : clock.animate(dur, onFrame, s.minRealMs > 0 ? { minRealMs: s.minRealMs } : undefined);
            anim.then(() => finish(i));
        };
        return (real ? clock.waitReal(at) : clock.wait(at)).then(go);
    });
    return {
        promise: Promise.all(jobs),
        cancel() { cancelled = true; steps.forEach((s, i) => finish(i)); }
    };
}
