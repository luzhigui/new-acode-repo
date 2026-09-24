// V6.2.0 | ~3900 bytes | 2026-09-24 战斗改走 116 Worker 并行（kind:'hex'，核数-1 池），口径与 108 仪表盘统一；删除本地坏死循环（原 runBattleCore 全仓库无定义，一跑即 ReferenceError）
export const VER = 'tools/101auto-battle-utils.js V6.2.0';

import { SeededRNG } from '../infra/51-core-utils.js';
import { initBattleTeams } from '../modules/29battle-init.js';
import { runParallel } from './117-shared-worker-runner.js';
import '../infra/54-global-store.js';
import '../modules/25elite-imperial.js';
import '../modules/26elite-sixsects.js';
import '../modules/27elite-mingjiao.js';

// 纯数据快照生成器
export function generateSnapshot(currentStage = 1, rng = new SeededRNG(Date.now())) {
    // 复用主代码 initBattleTeams：各关明教+六大派阵容生成完全一致
    // 修复：自写简化版只支持第 1 关（MING_SQUADS 仅定义 1:），第 2-6 关 allyTeam 空导致 spawnHorse 取 allyTeam[0].camp 崩溃
    const { allyTeam, enemyTeam } = initBattleTeams(currentStage, rng);
    return {
        ally: allyTeam.map(u => Object.freeze(u.clone())),
        enemy: enemyTeam.map(u => Object.freeze(u.clone()))
    };
}

// 每片场次：与 108 仪表盘一致，单片别太长，进度条才动得起来
const CHUNK = 300;
// 片间距：worker 内 seed = 片seed + i*7919（i < CHUNK），CHUNK×7919 ≈ 238 万，取 300 万保证各片 seed 区间不重叠
const CHUNK_STRIDE = 3000000;

// 自动批量战斗：分片投给 116 Worker 池并行跑（kind:'hex'）。
// 战斗口径（含第3/6/9回合自动补海克斯、偏好优先、小昭·妹永久继承）全在 worker 内，与真人局一致。
export async function runAutoBattle(rounds, onProgress, stage = 1, preferredBuffs = []) {
    const total = Math.max(0, Math.floor(rounds) || 0);
    const wins = { ally: 0, enemy: 0, draw: 0 };
    const hexLog = []; // 每场海克斯 + 胜负记录，供 108 仪表盘读取
    if (total === 0) return wins;

    const masterSeed = Date.now();
    const chunks = Math.ceil(total / CHUNK);
    const jobs = [];
    for (let c = 0; c < chunks; c++) {
        const runs = Math.min(CHUNK, total - c * CHUNK);
        if (runs <= 0) continue;
        jobs.push({ stage, seed: masterSeed + c * CHUNK_STRIDE, runs, preferredBuffs, label: `第${stage}关#${c + 1}` });
    }

    let doneRuns = 0;
    await runParallel({
        jobs,
        kind: 'hex',
        nextJobMsg: (job, id) => ({
            jobId: id,
            kind: 'hex',
            stage: job.stage,
            seed: job.seed,
            runs: job.runs,
            preferredBuffs: job.preferredBuffs
        }),
        onJobDone: (finished, jobTotal, job, result) => {
            if (result) {
                wins.ally += result.ally || 0;
                wins.enemy += result.enemy || 0;
                wins.draw += result.draw || 0;
                if (result.hexLog) hexLog.push(...result.hexLog);
            }
            doneRuns += job.runs;
            if (onProgress) onProgress(Math.min(doneRuns, total), total);
        }
    });

    // 追加保存海克斯归因记录，供 108 仪表盘读取
    try {
        const KEY = 'ming_hex_battle_log';
        const prev = JSON.parse(localStorage.getItem(KEY) || '[]');
        localStorage.setItem(KEY, JSON.stringify(prev.concat(hexLog)));
    } catch (e) {}
    return wins;
}