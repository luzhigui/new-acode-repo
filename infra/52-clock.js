// infra/52-clock.js
// V1.1.1 | 2026-10-22 animate 支持 opts.minRealMs 最短真实时长保底（新增 _realNow 真实时间轴，
//          暂停冻结、不受倍速/快进影响）：倍速下关键演出（冲刺/轰拳/打歪）也看得清
// V1.1.0 | ~3948 bytes | 2026-09-13 统一时间源：唯一 rAF 循环，集中管理 倍速/暂停/快进
// 消费方只调 wait()/animate()，不再自己判 fastForwardActive、不再传 getPausedFn、不再各自开 rAF
export const VER = 'infra/52-clock.js V1.1.1';

// 逻辑时间基准：调用方传入的 ms 一律是"1x 基准时长"，实际流逝由 timescale 缩放
class Clock {
    constructor() {
        this.now = 0;              // 逻辑时间(ms)，随 timescale 推进
        this.timescale = 1;        // 1 = 基准；8 = 8倍速；0.5 = 半速
        this.fastForwardScale = 12;// 快进倍率（8x 按钮是 6；快进跳过特效，实际观感约为 8x 的 4~5 倍）
        this.paused = false;
        this.fastForward = false;
        this._realLast = 0;
        // 2026-10-22 真实时间轴（暂停时冻结、不受倍速/快进影响）：供 minRealMs 最短时长保底
        this._realNow = 0;
        this._rafId = null;
        this._running = false;
        this._waits = [];          // { dueAt, resolve }
        this._tweens = [];         // { startAt, duration, onFrame, resolve }
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
    reset() {
        this.now = 0;
        this._realNow = 0;
        this._realLast = performance.now();
        this._waits = [];
        this._tweens = [];
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
                // 2026-10-22 最短真实时长：真实时间没走满 minRealMs 就压住进度
                if (t.minRealMs > 0) p = Math.min(p, (this._realNow - t.startReal) / t.minRealMs);
                t.onFrame(p);
                if (p >= 1) t.resolve();
                else remain.push(t);
            }
            this._tweens = remain;
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

    setTimescale(x) { this.timescale = Math.max(0.01, x); }

    pause() { this.paused = true; }
    resume() { this.paused = false; }

    // 快进开关：只改推进倍率，不再把挂起的 wait/tween 一次性冲掉（那样等于瞬移到结算，看不到演出）
    setFastForward(on) {
        this.fastForward = !!on;
    }
}

export const clock = new Clock();