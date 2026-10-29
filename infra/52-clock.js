// infra/52-clock.js
// V1.2.1 | 2026-10-29 | ~6400 bytes | reset() 清场前把挂起的 animate/animateReal 逐帧动画走完最后一帧并
//   resolve（原直接丢数组 = Promise 永不结算 → 一次性特效 DOM 残留，联机换关后特效越叠越多）
// V1.2.0 | 2026-10-25 | ~6100 bytes | 新增 waitReal / animateReal 真实时间轴（按 _realNow 推进，不吃 timescale；
//   暂停冻结、快进直接完成）——参数表 core/23perf-params 的消费点改用真实毫秒，表里填多少就是多少。
//   原 wait/animate 保留不动（逻辑时间，仍受倍速缩放）
// V1.1.1 | 2026-10-22 | ~4900 bytes
// animate 支持 opts.minRealMs 最短真实时长保底（新增 _realNow 真实时间轴，
// 暂停冻结、不受倍速/快进影响）：倍速下关键演出（冲刺/轰拳/打歪）也看得清
// 消费方只调 wait()/animate()，不再自己判 fastForwardActive、不再传 getPausedFn、不再各自开 rAF
export const VER = 'infra/52-clock.js V1.2.1';

// 逻辑时间基准：调用方传入的 ms 一律是"1x 基准时长"，实际流逝由 timescale 缩放
class Clock {
    constructor() {
        this.now = 0;              // 逻辑时间(ms)，随 timescale 推进
        this.timescale = 1;        // 1 = 基准；8 = 8倍速；0.5 = 半速
        this.fastForwardScale = 12;// 快进倍率（8x 按钮是 6；快进跳过特效，实际观感约为 8x 的 4~5 倍）
        this.paused = false;
        this.fastForward = false;
        this._realLast = 0;
        // 真实时间轴（暂停时冻结、不受倍速/快进影响）：供 minRealMs 最短时长保底
        this._realNow = 0;
        this._rafId = null;
        this._running = false;
        this._waits = [];          // { dueAt, resolve }
        this._tweens = [];         // { startAt, duration, onFrame, resolve }
        // 真实时间队列（waitReal / animateReal）：按 _realNow 推进，不吃 timescale、快进直接完成
        this._realWaits = [];      // { dueAt, resolve }
        this._realTweens = [];     // { startReal, duration, onFrame, resolve }
        this._loop = this._loop.bind(this);
    }

    start() {
        if (this._running) return;
        this._running = true;
        this._realLast = performance.now();
        this._rafId = requestAnimationFrame(this._loop);
    }

    stop() {
        this._running = false;
        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    }

    // 重置：新一局开始时清空 now 与所有挂起任务
    //   清场前先让挂起的逐帧动画走完最后一帧并 resolve：否则各 fx 的 .then(() => el.remove())
    //   永远不会执行，一次性特效 DOM（data-fx="temporary"，如护罩碎裂闪光/碎片）以终态残留，越换关越叠。
    reset() {
        for (const t of this._tweens) { try { t.onFrame(1); } catch (e) {} try { t.resolve(); } catch (e) {} }
        for (const t of this._realTweens) { try { t.onFrame(1); } catch (e) {} try { t.resolve(); } catch (e) {} }
        this.now = 0;
        this._realNow = 0;
        this._realLast = performance.now();
        this._waits = [];
        this._tweens = [];
        this._realWaits = [];
        this._realTweens = [];
        this.paused = false;
        this.fastForward = false;
        this.timescale = 1;
    }

    _loop(ts) {
        if (!this._running) return;
        const realDelta = Math.min(ts - this._realLast, 100);
        this._realLast = ts;
        if (!this.paused) {
            this.now += realDelta * (this.fastForward ? this.fastForwardScale : this.timescale);
            this._realNow += realDelta;
        }
        this._flush();
        this._rafId = requestAnimationFrame(this._loop);
    }

    _flush() {
        if (this._waits.length) {
            const remain = [];
            for (const w of this._waits) {
                if (this.now >= w.dueAt) w.resolve();
                else remain.push(w);
            }
            this._waits = remain;
        }
        if (this._tweens.length) {
            const remain = [];
            for (const t of this._tweens) {
                let p = t.duration <= 0 ? 1 : Math.min(1, (this.now - t.startAt) / t.duration);
                // 最短真实时长：真实时间没走满 minRealMs 就压住进度
                if (t.minRealMs > 0) p = Math.min(p, (this._realNow - t.startReal) / t.minRealMs);
                t.onFrame(p);
                if (p >= 1) t.resolve();
                else remain.push(t);
            }
            this._tweens = remain;
        }
        // 真实时间 waits：按 _realNow 到点（不受 timescale 影响，暂停冻结，快进直接完成）
        if (this._realWaits.length) {
            const remain = [];
            for (const w of this._realWaits) {
                if (this.fastForward || this._realNow >= w.dueAt) w.resolve();
                else remain.push(w);
            }
            this._realWaits = remain;
        }
        // 真实时间 tweens：按 _realNow 计算进度（暂停冻结，快进直接跳到 1）
        if (this._realTweens.length) {
            const remain = [];
            for (const t of this._realTweens) {
                if (this.fastForward) {
                    try { t.onFrame(1); } catch (e) {}
                    t.resolve();
                    continue;
                }
                const p = t.duration <= 0 ? 1 : Math.min(1, (this._realNow - t.startReal) / t.duration);
                t.onFrame(p);
                if (p >= 1) t.resolve();
                else remain.push(t);
            }
            this._realTweens = remain;
        }
    }

    // 等待 ms 逻辑毫秒（1x 基准时长）。快进时不再瞬时返回，由 _loop 的 fastForwardScale 加速推进
    wait(ms) {
        if (ms <= 0) return Promise.resolve();
        return new Promise(resolve => {
            this._waits.push({ dueAt: this.now + ms, resolve });
        });
    }

    // 逐帧动画：onFrame(progress 0..1)，duration 为 1x 基准毫秒
    // 暂停时 progress 冻结；快进时按倍率快放（仍逐帧回调）
    // opts.minRealMs：最短真实时长保底。倍速把 duration 压到 100ms 时，进度仍按真实时间爬，
    //   至少走满 minRealMs 才到 1——给「关键演出」用（冲刺/轰拳/打歪），1x 下行为完全不变。
    animate(duration, onFrame, opts) {
        if (duration <= 0) {
            try { onFrame(1); } catch (e) {}
            return Promise.resolve();
        }
        return new Promise(resolve => {
            this._tweens.push({
                startAt: this.now, duration, onFrame, resolve,
                startReal: this._realNow,
                minRealMs: (opts && opts.minRealMs > 0) ? opts.minRealMs : 0
            });
        });
    }

    // 真实时间等待：ms 就是真实毫秒，不吃 timescale。暂停冻结、快进直接完成。
    //   参数表（core/23perf-params）的所有消费点都该用这个，表里填什么就是什么。
    waitReal(ms) {
        if (ms <= 0) return Promise.resolve();
        if (this.fastForward) return Promise.resolve();
        return new Promise(resolve => {
            this._realWaits.push({ dueAt: this._realNow + ms, resolve });
        });
    }

    // 真实时间动画：duration 是真实毫秒，不吃 timescale。暂停冻结、快进直接 onFrame(1)。
    animateReal(duration, onFrame) {
        if (duration <= 0) {
            try { onFrame(1); } catch (e) {}
            return Promise.resolve();
        }
        if (this.fastForward) {
            try { onFrame(1); } catch (e) {}
            return Promise.resolve();
        }
        return new Promise(resolve => {
            this._realTweens.push({
                startReal: this._realNow,
                duration,
                onFrame,
                resolve
            });
        });
    }

    setTimescale(x) { this.timescale = Math.max(0.01, x); }

    pause() { this.paused = true; }
    resume() { this.paused = false; }

    // 快进开关：只改推进倍率，不再把挂起的 wait/tween 一次性冲掉（那样等于瞬移到结算，看不到演出）
    setFastForward(on) {
        this.fastForward = !!on;
    }
}

export const clock = new Clock();