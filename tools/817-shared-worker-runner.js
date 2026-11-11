// 用法：runParallel({ jobs, kind, nextJobMsg, onJobDone, onAllDone, poolSize, workerUrl })
export const SHARED_WORKER_URL = new URL('./816-role-balance-worker.js', import.meta.url);

// 统一池大小口径：默认 min(逻辑核数, 16)。
// V1.2.0 | 2026-11-11 | 原「用满全部逻辑核」在高核机器上翻车：93 核服务器一次开 93 个 worker，
//   每个 worker 各装一份完整引擎+配置数据（几十 MB），内存爆 + worker 冷启动互相挤崩
//   （实测 console：worker#92 ERROR，839 测评首跑被中断；这也解释了仪表盘「跑一次占内存很大」）。
//   16 封顶后普通机器（≤16核）速度不变，高核机器不再失控。
// 想给系统留核或强制更大池时，控制台执行 localStorage.setItem('battle_pool_size', 6) 即可，下次点击生效。
export function getPoolSize(override) {
    if (override) return Math.max(1, Math.floor(override) || 1);
    try {
        const v = parseInt(localStorage.getItem('battle_pool_size'), 10);
        if (v > 0) return v;
    } catch (e) {}
    return Math.max(1, Math.min(navigator.hardwareConcurrency || 4, 16));
}

export async function runParallel({ jobs, kind, nextJobMsg, onJobDone, onAllDone, poolSize, workerUrl = SHARED_WORKER_URL }) {
    return new Promise((resolve, reject) => {
        const workers = [];
        const doneResults = [];
        const total = jobs.length;
        let finished = 0;
        let nextJob = 0;
        let readyCount = 0;
        let dispatchStarted = false;

        const tryStartDispatch = () => {
            if (dispatchStarted || readyCount < workers.length) return;
            dispatchStarted = true;
            for (let i = 0; i < workers.length; i++) dispatch(i);
        };

        const dispatch = (workerIdx) => {
            if (nextJob >= total) return;
            const job = jobs[nextJob];
            nextJob++;
            job.__id = nextJob; // 打标，worker 回报 jobId 后回查用
            workers[workerIdx].postMessage(nextJobMsg(job, nextJob));
        };

        const spawn = (workerIdx) => {
            const w = new Worker(workerUrl, { type: 'module' });
            w.onmessage = (e) => {
                const msg = e.data;
                if (msg && msg.kind === 'worker-ready') {
                    readyCount++;
                    if (!msg.ok) {
                        console.error(`[117-runner] worker#${workerIdx} 数据加载失败:`, msg.error);
                        workers.forEach(x => x.terminate());
                        reject(new Error(`worker#${workerIdx} 数据加载失败: ${msg.error}`));
                        return;
                    }
                    tryStartDispatch();
                    return;
                }
                const job = jobs.find(j => j.__id === msg.jobId);
                if (!job) return;
                if (msg.ok === false) {
                    console.error(`[117-runner] worker#${workerIdx} job[${job.label}] FAILED:`, msg.error);
                    workers.forEach(x => x.terminate());
                    reject(new Error(`worker#${workerIdx} 组[${job.label}] 异常: ${msg.error}`));
                    return;
                }
                doneResults.push({ job, result: msg.result });
                finished++;
                onJobDone && onJobDone(finished, total, job, msg.result);
                if (finished === total) {
                    workers.forEach(x => x.terminate());
                    onAllDone && onAllDone(doneResults);
                    resolve(doneResults);
                    return;
                }
                dispatch(workerIdx);
            };
            w.onerror = (err) => {
                console.error(`[117-runner] worker#${workerIdx} ERROR`, err && err.message, err && err.filename, err && err.lineno);
                workers.forEach(x => x.terminate());
                reject(new Error((err && err.message) || 'worker 异常' + (err && err.filename ? ` @${err.filename}:${err.lineno}` : '')));
            };
            workers.push(w);
        };

        const size = getPoolSize(poolSize);
        for (let i = 0; i < size; i++) spawn(i);
    });
}