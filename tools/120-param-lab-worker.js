// tools/120-param-lab-worker.js — 参数对照实验台专属 Worker（不改 116，走 117 的 workerUrl 覆盖参数）
// V1.0.0 | 预估 2600 bytes | 2026-09-28 新建：结构照抄 116-role-balance-worker.js。
//          两种 kind：
//            · lab-sample → sampleStage 的精英组合列表（供页面取典型阵容）
//            · lab-run    → 某阵容某区间的逐局胜负（基线臂 / 补丁臂）
//          补丁臂：每个 worker 实例只 applyPatchOps 一次（模块级 flag），之后的补丁 job 直接跑。
export const VER = 'tools/120-param-lab-worker.js V1.0.0';

// Worker 环境兼容 shim：core 的模块体在无 DOM 全局时需 window/localStorage
if (typeof window === 'undefined') globalThis.window = globalThis;
if (typeof localStorage === 'undefined') {
    const _ls = new Map();
    globalThis.localStorage = {
        getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
        setItem: (k, v) => { _ls.set(k, String(v)); },
        removeItem: (k) => { _ls.delete(k); },
        clear: () => { _ls.clear(); }
    };
}

import { ensureGameData, sampleStage, runLineupRange, statSeedOf, concreteKey, applyPatchOps } from './120-param-lab-core.js';

let _patched = false;   // 补丁臂：每实例只打一次补丁

// 模块顶层一次性加载游戏数据（幂等，worker 独立全局需自备）
try {
    await ensureGameData();
    self.postMessage({ kind: 'worker-ready', ok: true });
} catch (err) {
    self.postMessage({ kind: 'worker-ready', ok: false, error: String(err && err.message || err) });
}

self.onmessage = async (e) => {
    const { jobId, kind } = e.data;
    try {
        let result;
        if (kind === 'lab-sample') {
            const { stage, runs, base } = e.data;
            result = { list: sampleStage(stage, runs, base).list };
        } else if (kind === 'lab-run') {
            const { arm, stage, spec, base, startIndex, runs, patchOps } = e.data;
            if (arm === 'patch' && !_patched) {
                applyPatchOps(await ensureGameData(), patchOps || []);
                _patched = true;
            }
            const statSeed = statSeedOf(concreteKey(spec));
            result = { winners: runLineupRange(stage, spec, statSeed, base, startIndex || 0, runs) };
        } else {
            throw new Error(`未知 worker kind: ${kind}`);
        }
        self.postMessage({ jobId, ok: true, result });
    } catch (err) {
        self.postMessage({ jobId, ok: false, error: String(err && err.stack || err) });
    }
};