// infra/52-rng.js - 光明顶5v5 确定性随机数生成器
// V5.5.0 | ~1000 bytes| 2026-08-17 从core/07迁移至infra
export const VER = 'infra/52-rng.js V5.5.0';

export class SeededRNG {
    constructor(seed) {
        if (typeof seed === 'string') {
            let h = 0;
            for (let i = 0; i < seed.length; i++) {
                h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
            }
            seed = h;
        }
        this._state = seed >>> 0;
    }

    next() {
        let t = this._state;
        t ^= t << 13;
        t ^= t >> 17;
        t ^= t << 5;
        this._state = t >>> 0;
        return (t >>> 0) / 4294967296;
    }

    nextInt(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    getState() {
        return this._state;
    }

    setState(state) {
        this._state = state >>> 0;
    }
}