// 用法：runParallel({ jobs, kind, nextJobMsg, onJobDone, onAllDone, poolSize, workerUrl })
// ⚠️ ?v= 必须与 816 当前 VER 同步手抬（831-ablation-lab.html、809-role-balance.js 同款）：
//   2026-11-19 根因修复——裸 URL 让手机缓存旧版 816，其内部 import 的 201 是旧 hash 实例（已加载），
//   而新 330 import 的新 hash 201 实例没加载数据 → 同一 worker 双实例，job 链路读空
//   → 「gameData 未加载：角色池为 characters 推导，不能为空」。
export const SHARED_WORKER_URL = new URL('./816-role-balance-worker.js?v=V1_24_2', import.meta.url);

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

// V1.3.0 | 2026-11-21 加看门狗：worker 内的 job 是同步长循环，一旦某场战斗在引擎里进入死循环
//   （或 worker 被系统 OOM 回收且不触发 onerror），整个池会静默永久卡住、页面只停在「(15/392)」不动。
//   现在每个 job 下发后计时，超时未回报即终止全池并抛出带 job 标签的错误（能直接看出是哪一关/哪个单位）。
const JOB_TIMEOUT_MS = 180000;

// V1.3.1 | 2026-11-21 版本偏差自愈：站点刚重新部署时，页面里的旧代码会碰到新游戏数据
//   （数据里多出未注册的机制 → core/216 抛「未知顶层机制」）。这不是逻辑错误，也不该让用户看到红字：
//   自动整页刷新一次（HTML 重新拉最新、工具脚本带 ?t= 重新拉、引擎再按新版本装配），60s 内只刷一次防循环。
function maybeReloadOnVersionSkew(err) {
    const msg = String((err && err.message) || err || '');
    if (!/未知顶层机制|未在 core\/219 注册/.test(msg)) return false;
    let last = 0;
    try { last = parseInt(sessionStorage.getItem('mf_ver_skew_ts'), 10) || 0; } catch (e) { return false; }
    if (Date.now() - last < 60000) return false;
    try { sessionStorage.setItem('mf_ver_skew_ts', String(Date.now())); } catch (e) { return false; }
    setTimeout(() => location.reload(), 600);
    return true;
}

export async function runParallel({ jobs, kind, nextJobMsg, onJobDone, onAllDone, poolSize, workerUrl = SHARED_WORKER_URL }) {
    return new Promise((resolve, reject) => {
        const workers = [];
        const timers = [];
        const doneResults = [];
        const total = jobs.length;
        let finished = 0;
        let nextJob = 0;
        let readyCount = 0;
        let dispatchStarted = false;
        let aborted = false;

        const clearAllTimers = () => { for (const t of timers) clearTimeout(t); };
        const abort = (err) => {
            if (aborted) return;
            aborted = true;
            clearAllTimers();
            workers.forEach(x => x.terminate());
            maybeReloadOnVersionSkew(err);
            reject(err);
        };

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
            // 看门狗：该 job 必须在 JOB_TIMEOUT_MS 内回报，否则判定死循环 / worker 被回收
            clearTimeout(timers[workerIdx]);
            timers[workerIdx] = setTimeout(() => {
                abort(new Error(`worker#${workerIdx} 组[${job.label || ('#' + job.__id)}] ${Math.round(JOB_TIMEOUT_MS / 1000)}s 无响应（疑似该组战斗死循环或 worker 被系统回收）`));
            }, JOB_TIMEOUT_MS);
        };

        const spawn = (workerIdx) => {
            const w = new Worker(workerUrl, { type: 'module' });
            w.onmessage = (e) => {
                const msg = e.data;
                clearTimeout(timers[workerIdx]);
                if (msg && msg.kind === 'worker-ready') {
                    readyCount++;
                    if (!msg.ok) {
                        console.error(`[117-runner] worker#${workerIdx} 数据加载失败:`, msg.error);
                        abort(new Error(`worker#${workerIdx} 数据加载失败: ${msg.error}`));
                        return;
                    }
                    tryStartDispatch();
                    return;
                }
                const job = jobs.find(j => j.__id === msg.jobId);
                if (!job) return;
                if (msg.ok === false) {
                    console.error(`[117-runner] worker#${workerIdx} job[${job.label}] FAILED:`, msg.error);
                    abort(new Error(`worker#${workerIdx} 组[${job.label}] 异常: ${msg.error}`));
                    return;
                }
                doneResults.push({ job, result: msg.result });
                finished++;
                onJobDone && onJobDone(finished, total, job, msg.result);
                if (finished === total) {
                    clearAllTimers();
                    workers.forEach(x => x.terminate());
                    onAllDone && onAllDone(doneResults);
                    resolve(doneResults);
                    return;
                }
                dispatch(workerIdx);
            };
            w.onerror = (err) => {
                console.error(`[117-runner] worker#${workerIdx} ERROR`, err && err.message, err && err.filename, err && err.lineno);
                abort(new Error((err && err.message) || 'worker 异常' + (err && err.filename ? ` @${err.filename}:${err.lineno}` : '')));
            };
            w.onmessageerror = () => {
                abort(new Error(`worker#${workerIdx} 消息反序列化失败`));
            };
            workers.push(w);
            // 冷启动看门狗：worker 迟迟不报 ready（引擎/数据加载卡死）也要能收口，否则池永远不派活
            timers[workerIdx] = setTimeout(() => {
                abort(new Error(`worker#${workerIdx} ${Math.round(JOB_TIMEOUT_MS / 1000)}s 未就绪（引擎或数据加载卡死）`));
            }, JOB_TIMEOUT_MS);
        };

        const size = getPoolSize(poolSize);
        for (let i = 0; i < size; i++) spawn(i);
    });
}