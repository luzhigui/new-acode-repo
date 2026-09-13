// infra/52-clock.js
// V1.0.0 | 2026-09-13 统一时间源：唯一 rAF 循环，集中管理 倍速/暂停/快进
// 消费方只调 wait()/animate()，不再自己判 fastForwardActive、不再传 getPausedFn、不再各自开 rAF
export const VER = 'infra/52-clock.js V1.0.0';

// 逻辑时间基准：调用方传入的 ms 一律是"1x 基准时长"，实际流逝由 timescale 缩放
class Clock {
    constructor() {
        this.now = 0;              // 逻辑时间(ms)，随 timescale 推进
        this.timescale = 1;        // 1 = 基准；8 = 8倍速；0.5 = 半速
        this.paused = false;
        this.fastForward = false;
        this._realLast = 0;
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
        if (!this.paused && !this.fastForward) {
            this.now += realDelta * this.timescale;
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
                const p = t.duration <= 0 ? 1 : Math.min(1, (this.now - t.startAt) / t.duration);
                t.onFrame(p);
                if (p >= 1) t.resolve();
                else remain.push(t);
            }
            this._tweens = remain;
        }
    }

    // 等待 ms 逻辑毫秒（1x 基准时长）
    wait(ms) {
        if (this.fastForward || ms <= 0) return Promise.resolve();
        return new Promise(resolve => {
            this._waits.push({ dueAt: this.now + ms, resolve });
        });
    }

    // 逐帧动画：onFrame(progress 0..1)，duration 为 1x 基准毫秒
    // 暂停时 progress 冻结；快进时立即 onFrame(1) 并 resolve
    animate(duration, onFrame) {
        if (this.fastForward || duration <= 0) {
            try { onFrame(1); } catch (e) {}
            return Promise.resolve();
        }
        return new Promise(resolve => {
            this._tweens.push({ startAt: this.now, duration, onFrame, resolve });
        });
    }

    setTimescale(x) { this.timescale = Math.max(0.01, x); }

    pause() { this.paused = true; }
    resume() { this.paused = false; }

    setFastForward(on) {
        this.fastForward = !!on;
        if (on) {
            const waits = this._waits; this._waits = [];
            waits.forEach(w => w.resolve());
            const tweens = this._tweens; this._tweens = [];
            tweens.forEach(t => { try { t.onFrame(1); } catch (e) {} t.resolve(); });
        }
    }
}

export const clock = new Clock();