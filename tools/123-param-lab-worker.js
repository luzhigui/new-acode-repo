// tools/123-param-lab-worker.js — 参数对照实验台专属 Worker（不改 116，走 117 的 workerUrl 覆盖参数）
//          arm 可为任意唯一串（换旋钮必还原重打补丁）；120 的 'base'/'patch' 用法不变。
export const VER = 'tools/123-param-lab-worker.js V1.3.0';

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

import { ensureGameData, sampleStage, runLineupRange, statSeedOf, concreteKey, applyPatchOps, restoreGameData } from './122-param-lab-core.js';
import { CONFIG } from '../core/01config-5v5-test.js';

let _arm = null;   // 当前数据表状态：null = 未定 / 'base' = 原始 / 'patch' = 已打补丁

// 纯规则常量（CONFIG）不在 gameData 里，applyPatchOps 按 root 路径解析必然找不到 ——
// 135 扫「全局常量」时由本文件就地改 CONFIG，并在换 arm 时还原（否则基线与补丁臂会串味）。
const _cfgOrig = new Map();      // CONFIG 一级键 → 原始值副本
function restoreConfig() {
    for (const [k, v] of _cfgOrig) CONFIG[k] = structuredClone(v);
    _cfgOrig.clear();
}
function applyConfigOps(ops) {
    for (const op of ops) {
        const parts = op.path.split('.');
        if (!(parts[0] in CONFIG)) throw new Error(`CONFIG 补丁路径不存在：${op.path}`);
        if (!_cfgOrig.has(parts[0])) _cfgOrig.set(parts[0], structuredClone(CONFIG[parts[0]]));
        let cur = CONFIG;
        for (let i = 0; i < parts.length - 1; i++) {
            if (cur == null || !(parts[i] in cur)) throw new Error(`CONFIG 补丁路径不存在：${op.path}`);
            cur = cur[parts[i]];
        }
        const last = parts[parts.length - 1];
        if (cur == null || !(last in cur)) throw new Error(`CONFIG 补丁路径不存在：${op.path}`);
        cur[last] = op.value;
    }
}
// 按路径首段分流：在 gameData 里 → 走 applyPatchOps；只在 CONFIG 里 → 走 applyConfigOps
async function applyOps(ops) {
    const root = await ensureGameData();
    const gameOps = [], cfgOps = [];
    for (const op of ops) {
        const head = op.path.split('.')[0];
        if (head in root) gameOps.push(op);
        else if (head in CONFIG) cfgOps.push(op);
        else throw new Error(`补丁路径不存在：${op.path}`);
    }
    if (gameOps.length) applyPatchOps(root, gameOps);
    if (cfgOps.length) applyConfigOps(cfgOps);
}

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
            // arm 可以是 'base' / 'patch'（120 实验台），也可以是任意自定义串（135 参数扫描：
            // 每旋钮一个唯一 arm，保证换旋钮时一定还原+重打补丁，不会把上一轮补丁带过来）
            const { arm, stage, stages, spec, base, startIndex, runs, patchOps } = e.data;
            if (arm !== _arm) {
                restoreGameData();                     // 先还原成原始数据表
                restoreConfig();                       // 全局常量同样还原
                // 空补丁 = 基线臂（135 搜索无解时 applied 为空，不能让 applyPatchOps 抛「没有 set 数组」）
                const ops = patchOps || [];
                if (arm && arm !== 'base' && ops.length) await applyOps(ops);
                _arm = arm;
            }
            if (Array.isArray(stages)) {
                // 2026-10-22 V1.2.0：一个 job 跑多关（135 用），避免「旋钮×关卡」把 job 数放大数倍
                result = { perStage: stages.map(s => ({
                    stage: s.stage,
                    winners: runLineupRange(s.stage, s.spec, statSeedOf(concreteKey(s.spec)), s.base, s.startIndex || 0, s.runs)
                })) };
            } else {
                const statSeed = statSeedOf(concreteKey(spec));
                result = { winners: runLineupRange(stage, spec, statSeed, base, startIndex || 0, runs) };
            }
        } else {
            throw new Error(`未知 worker kind: ${kind}`);
        }
        self.postMessage({ jobId, ok: true, result });
    } catch (err) {
        self.postMessage({ jobId, ok: false, error: String(err && err.stack || err) });
    }
};