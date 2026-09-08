// 复刻 116 worker 的 elite job：shim 掉 fetch/self/localStorage，直接喂消息看回报
import { readFileSync } from 'node:fs';

const received = [];
globalThis.self = globalThis;
globalThis.postMessage = (msg) => received.push(msg);
globalThis.localStorage = {
    _m: new Map(),
    getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
    setItem(k, v) { this._m.set(k, String(v)); },
    removeItem(k) { this._m.delete(k); },
    clear() { this._m.clear(); }
};
globalThis.fetch = async (url) => {
    const p = String(url).replace('file://', '');
    try {
        const txt = readFileSync(p, 'utf8');
        return { ok: true, json: async () => JSON.parse(txt) };
    } catch (e) {
        console.error('[probe] fetch FAIL:', p, e.message);
        return { ok: false, json: async () => { throw new Error('404 ' + p); } };
    }
};

process.on('unhandledRejection', (reason) => {
    console.error('[probe] UNHANDLED-REJECTION:', reason && (reason.stack || reason.message || reason));
});

await import('../tools/116-role-balance-worker.js');
console.log('[probe] ready 消息:', JSON.stringify(received[0]));

const { ROLE_TYPES } = await import('../infra/56-battle-enums.js');
const cfg = { name: '张无忌', flag: 'isZhang', role: ROLE_TYPES.RANGED, m: 115 };
self.onmessage({ data: { jobId: 1, kind: 'elite', cfg, stage: 6, seed: 20260908, runs: 10 } });
const jobMsg = received.find(m => m.jobId === 1);
console.log('[probe] job 回报:', jobMsg ? JSON.stringify({ ok: jobMsg.ok, error: jobMsg.error, result: jobMsg.result }) : '无回报');
