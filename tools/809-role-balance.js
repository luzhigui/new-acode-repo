export const VER = 'tools/809-role-balance.js V6.3.2';
// V6.3.2 | 2026-11-08 可复现：新增「种子」输入框（留空=Date.now()），结果顶部显示 masterSeed；
//   填回上次的 masterSeed 即按同样随机流重跑。
// V6.3.1 | 2026-11-08 池化去重：同一场对局在「我方/敌方」两视角各记一次，poolN 原为 at+et（=2×真实对局）。
//   改为 poolN=(at+et)/2=at，poolW 同步折半 —— 点估计不变（仍 50% 基准），CI 变宽约 √2。
//   只折分母会得到 >100% 的假胜率，故分子必须同步折半；「不分阵营」排行表同口径修正。
//   顺带改正配对说明的方向：样本正相关 → 真实区间更宽（原来写成「偏保守、不夸大」是反的）。
// V6.2.3 | 2026-11-01 修「表读不懂」的真因：海克斯默认单边（明教有/六大派无）→ 明教胜率被拉到 ~95%，
//   四职业数字全被压平。① 默认关海克斯；开海克斯时自动勾「双海克斯」保证对称；
//   ② 四职业总评加「整体偏差自检」：明教整体胜率 <35% 或 >65% 时红框告警「不可判平衡」；
//   ③ 表头改成大白话（我方第6格是它 / 敌方第6格是它 / 净强度），并加一句「只看净强度离 50% 多远」。
// V6.2.2 | 2026-11-01 配对采样：109 派发 balance job 时带 pairedSeed=true，116 去掉 ai 分量 →
//   同一 (敌职业, 场次序号) 下四个职业共用完全相同的基底种子，只在第 6 弹性格换职业；点差更干净。
// V6.2.1 | 2026-11-01 四职业平衡总评：用同一份 4×4 结果推导（不额外跑）——
//   每职业合并「在我方弹性格 / 在敌方弹性格」两视角的所在方胜率，带 Wilson 95% 区间、
//   偏离 50% 幅度、判定（噪声内/偏强/偏弱）、最好打/最难打对手，并给出最强-最弱差距与区间是否重叠。
//   口径写死在界面：基底 5 人固定、只换第 6 弹性格 → 测的是「职业池边际强度」，不是抽象机制平衡。
// V6.2.0 | 2026-10-31 双海克斯开关（双海克斯=六大派也自动选，与主游戏 enemyAutoHex 对齐）：
//   新增「双海克斯」复选框，只在「海克斯」开启时可用；勾选后透传 enemyHex 给 116 balance job，
//   116 由 core/206-battle-runner V1.3.0 的 enemyHexPicker 在明教选完后对称给六大派补一个（同 seed 同结果）。

import { ROLE_TYPES } from '../infra/106-battle-enums.js';
import { getPoolSize } from './817-shared-worker-runner.js';
import { STATS_TH } from './827-tool-registry.js';

const ROLES = [ROLE_TYPES.DEFENDER, ROLE_TYPES.WARRIOR, ROLE_TYPES.FLYER, ROLE_TYPES.RANGED];
const ROLE_ICONS = { [ROLE_TYPES.DEFENDER]: '🛡️', [ROLE_TYPES.WARRIOR]: '⚔️', [ROLE_TYPES.FLYER]: '🦅', [ROLE_TYPES.RANGED]: '🏹' };

// 第六人站位规则：默认所有职业 [3,4,6,8]（近战限位默认关），开启近战限位后防战/战士仅 [3,6]
let extraPosConfig = { [ROLE_TYPES.DEFENDER]: [3, 4, 6, 8], [ROLE_TYPES.WARRIOR]: [3, 4, 6, 8], [ROLE_TYPES.FLYER]: [3, 4, 6, 8], [ROLE_TYPES.RANGED]: [3, 4, 6, 8] };
let extraPosDefault = [3, 4, 6, 8];

// 样式
if (!document.getElementById('roleBalStyle')) {
    const style = document.createElement('style');
    style.id = 'roleBalStyle';
    style.textContent = `
.role-bal-mask{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center}
.role-bal-box{background:#1a1a2e;color:#eee;font-family:monospace;border:1px solid #444;border-radius:12px;width:min(920px,94vw);max-height:88vh;max-height:88dvh;display:flex;flex-direction:column;padding:16px}
.role-bal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.role-bal-head h1{color:#ffd700;font-size:20px;margin:0}
.role-bal-close{background:#444;color:#ccc;border:none;border-radius:8px;padding:6px 14px;font-weight:bold;cursor:pointer;font-family:monospace}
.role-bal-copy{background:#444;color:#eee;border:none;border-radius:8px;padding:6px 14px;font-weight:bold;cursor:pointer;font-family:monospace;margin-right:8px}
.role-bal-copy:hover{background:#5a5a7e;color:#fff}
.role-bal-tip{color:#888;font-size:12px;margin-bottom:12px;line-height:1.5}
.role-bal-config{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.role-bal-config label{color:#ffd700;font-weight:bold}
.role-bal-config input{width:90px;padding:6px;border-radius:6px;border:1px solid #555;background:#111;color:#eee;font-size:14px;text-align:center}
.role-bal-box button{padding:10px 20px;border:none;border-radius:8px;font-weight:bold;cursor:pointer;font-family:monospace;font-size:13px}
.role-bal-run{background:#ffd700;color:#1a1a2e}
.role-bal-clear{background:#f44336;color:#fff;margin-left:8px}
.role-bal-progress{color:#4fc3f7;font-size:12px;min-height:20px;margin-bottom:8px}
.role-bal-body{overflow:auto;flex:1}
.role-bal-section{margin-bottom:16px}
.role-bal-section h2{color:#ffd700;font-size:15px;margin:12px 0 8px}
.role-bal-box table{width:100%;border-collapse:collapse;font-size:12px}
.role-bal-box th{background:#2a2a4e;color:#ffd700;padding:8px;text-align:center}
.role-bal-box td{padding:6px 8px;border-bottom:1px solid #333;color:#ccc;text-align:center}
.role-bal-matrix td{font-weight:bold}
.role-bal-strong{color:#f44336}
.role-bal-weak{color:#4fc3f7}
.role-bal-pos-config{display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap}
.role-bal-pos-config label{color:#aaa;font-size:12px}
.role-bal-pos-config input[type="text"]{width:130px;padding:5px 8px;border-radius:6px;border:1px solid #555;background:#111;color:#eee;font-size:12px}
.role-bal-toggle{display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none}
.role-bal-toggle input{display:none}
.role-bal-toggle .switch{width:36px;height:20px;background:#555;border-radius:10px;position:relative;transition:background .2s}
.role-bal-toggle .switch::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;background:#fff;border-radius:50%;transition:transform .2s}
.role-bal-toggle input:checked+.switch{background:#ffd700}
.role-bal-toggle input:checked+.switch::after{transform:translateX(16px)}
`;
    document.head.appendChild(style);
}

// 主界面
window.openRoleBalance = function() {
    const mask = document.createElement('div');
    mask.className = 'role-bal-mask';
    mask.innerHTML = `
        <div class="role-bal-box">
            <div class="role-bal-head">
                <h1>⚖️ 职业平衡分析</h1>
                <div style="display:flex;align-items:center">
                    <button class="role-bal-copy" id="roleBalCopy">📋 复制结果</button>
                    <button class="role-bal-close">关闭</button>
                </div>
            </div>
            <div class="role-bal-body">
                <p class="role-bal-tip">6V6 标准模板循环赛：双方基础模板（1防战、2战士、5飞行、7远程、9远程）各加一名额外职业。M=100，明教侧按全自动规则选海克斯（开局1个+每3回合1个，仅明教方）；勾选「双海克斯」则六大派也自动选。统计明教视角胜率。</p>
                <div class="role-bal-pos-config">
                    <label class="role-bal-toggle" id="roleBalHexLabel">
                        <input type="checkbox" id="roleBalHex">
                        <span class="switch"></span> 海克斯
                    </label>
                    <label class="role-bal-toggle" id="roleBalEnemyHexLabel">
                        <input type="checkbox" id="roleBalEnemyHex" checked>
                        <span class="switch"></span> 双海克斯（六大派也选）
                    </label>
                    <label class="role-bal-toggle" id="roleBalToggleLabel">
                        <input type="checkbox" id="roleBalMeleeLimit">
                        <span class="switch"></span> 防战/战士限定 [3,6]
                    </label>
                    <label>站位池：</label>
                    <input type="text" id="roleBalPosPool" value="3,4,6,8" title="逗号分隔，所有职业默认站位池">
                </div>
                <div class="role-bal-config">
                    <label>每组场次：</label>
                    <input type="number" id="roleBalRounds" value="100" min="10" max="1000" step="10">
                    <label>种子：</label>
                    <input type="number" id="roleBalSeed" placeholder="留空=自动" title="填上次结果的 masterSeed 可按同样随机流重跑" style="width:150px">
                    <button class="role-bal-run" id="roleBalRun">▶ 开始分析</button>
                    <button class="role-bal-clear" id="roleBalClear">清空</button>
                </div>
                <div class="role-bal-progress" id="roleBalProgress"></div>
                <div id="roleBalResult"></div>
            </div>
        </div>`;
    document.body.appendChild(mask);

    mask.querySelector('.role-bal-close').addEventListener('click', () => mask.remove());
    mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });

    // 📋 复制结果：把渲染出的四张表刮成 Markdown（与 838 复制兜底同口径）
    mask.querySelector('#roleBalCopy').addEventListener('click', async () => {
        const md = tablesToMd(result);
        if (!md) { progress.textContent = '⚠️ 先跑一次分析再复制'; return; }
        const ok = await copyText(md);
        progress.textContent = ok ? '📋 结果已复制到剪贴板' : '复制失败，可手动选中表格复制';
    });

    const roundsInput = mask.querySelector('#roleBalRounds');
    const seedInput = mask.querySelector('#roleBalSeed');
    const progress = mask.querySelector('#roleBalProgress');
    const result = mask.querySelector('#roleBalResult');
    const meleeLimitCb = mask.querySelector('#roleBalMeleeLimit');
    const posPoolInput = mask.querySelector('#roleBalPosPool');

    function updatePosConfig() {
        const raw = posPoolInput.value.replace(/\s/g, '');
        const pool = raw.split(',').map(Number).filter(n => n >= 1 && n <= 9);
        if (pool.length === 0) return;
        extraPosDefault = pool;
        if (meleeLimitCb.checked) {
            extraPosConfig = {
                [ROLE_TYPES.DEFENDER]: [3, 6],
                [ROLE_TYPES.WARRIOR]: [3, 6],
                [ROLE_TYPES.FLYER]: pool,
                [ROLE_TYPES.RANGED]: pool
            };
        } else {
            extraPosConfig = {
                [ROLE_TYPES.DEFENDER]: pool, [ROLE_TYPES.WARRIOR]: pool, [ROLE_TYPES.FLYER]: pool, [ROLE_TYPES.RANGED]: pool
            };
        }
    }

    meleeLimitCb.addEventListener('change', updatePosConfig);
    posPoolInput.addEventListener('input', updatePosConfig);

    // V6.2.0：双海克斯只在「海克斯」开启时可选（海克斯关闭 = 双方裸机，勾了也没意义）
    const hexCb = mask.querySelector('#roleBalHex');
    const enemyHexCb = mask.querySelector('#roleBalEnemyHex');
    const syncEnemyHex = () => {
        enemyHexCb.disabled = !hexCb.checked;
        enemyHexCb.parentElement.style.opacity = hexCb.checked ? '1' : '.45';
    };
    hexCb.addEventListener('change', () => {
        // V6.2.3：开海克斯默认「双方都开」，否则明教单边白拿海克斯会把胜率拉到 ~95%，
        //   四职业对比全被这个偏差淹没（老板看到的就是这张读不懂的表）。
        if (hexCb.checked) enemyHexCb.checked = true;
        syncEnemyHex();
    });
    syncEnemyHex();

    mask.querySelector('#roleBalClear').addEventListener('click', () => {
        result.innerHTML = '';
        progress.textContent = '';
    });

    mask.querySelector('#roleBalRun').addEventListener('click', async () => {
        const roundsPerGroup = parseInt(roundsInput.value) || 100;
        const hexEnabled = mask.querySelector('#roleBalHex').checked;
        const enemyHex = hexEnabled && mask.querySelector('#roleBalEnemyHex').checked;
        const startT = performance.now();
        const matrix = {};
        const allyStats = {};
        const enemyStats = {};
        // V6.3.2：种子可复现——填上次 masterSeed 即按同样随机流重跑；留空才用 Date.now()
        const seedRaw = parseInt(seedInput ? seedInput.value : '', 10);
        const masterSeed = Number.isFinite(seedRaw) && seedRaw > 0 ? seedRaw : Date.now();
        const positions = JSON.parse(JSON.stringify({ ...extraPosConfig })); // 快照，worker 间共享只读

        // Worker 池并行：每核 1 worker，16 组 job 按可用 worker 并发派发
        const poolSize = getPoolSize(); // 默认吃满核心（localStorage 'battle_pool_size' 可覆盖）；计算在 worker，主线程 UI 不受影响
        const jobs = [];
        for (let ai = 0; ai < ROLES.length; ai++) {
            for (let ei = 0; ei < ROLES.length; ei++) {
                const allyRole = ROLES[ai];
                const enemyRole = ROLES[ei];
                const key = `${allyRole}_${enemyRole}`;
                matrix[key] = { wins: 0, total: roundsPerGroup };
                allyStats[allyRole] = allyStats[allyRole] || { wins: 0, total: 0 };
                enemyStats[enemyRole] = enemyStats[enemyRole] || { wins: 0, total: 0 };
                jobs.push({ ai, ei, allyRole, enemyRole, key });
            }
        }

        progress.textContent = `⏳ 启动 ${poolSize} 个并行 Worker，共 ${jobs.length} 组 × ${roundsPerGroup} 场…`;
        renderResult(result, matrix, allyStats, enemyStats, { masterSeed });

        try {
            const results = await runJobsParallel(jobs, roundsPerGroup, positions, hexEnabled, enemyHex, masterSeed, poolSize, (msg) => {
            const st = startT;
            const sec = ((performance.now() - st) / 1000).toFixed(1);
            if (msg.done) {
                progress.textContent = `✅ 全部 ${msg.total} 组完成，总耗时 ${sec}s`;
            } else {
                progress.textContent = `${msg.text}（已用 ${sec}s）`;
            }
        });
            for (const { jobId, ai, ei, key, wins } of results) {
                matrix[key].wins = wins;
                allyStats[ROLES[ai]].wins += wins;
                allyStats[ROLES[ai]].total += roundsPerGroup;
                enemyStats[ROLES[ei]].wins += wins;
                enemyStats[ROLES[ei]].total += roundsPerGroup;
            }
            progress.textContent = `✅ 全部 ${jobs.length} 组完成，总耗时 ${((performance.now() - startT) / 1000).toFixed(1)}s`;
            renderResult(result, matrix, allyStats, enemyStats, { masterSeed });
        } catch (err) {
            progress.textContent = `❌ 并行评测异常：${err.message || err}（已用 ${((performance.now() - startT) / 1000).toFixed(1)}s）`;
        }
    });
};

// Worker 池：并发派发 jobs，逐组回报进度，聚合结果
function runJobsParallel(jobs, rounds, positions, hexEnabled, enemyHex, masterSeed, poolSize, progress) {
    return new Promise((resolve, reject) => {
        const workers = [];
        const doneResults = [];
        let nextJob = 0;
        let finished = 0;
        const total = jobs.length;
        const t0 = performance.now();
        let lastMsLogged = 0;
        let readyCount = 0;
        let dispatchStarted = false;

        const tryStartDispatch = () => {
            if (dispatchStarted || readyCount < workers.length) return;
            dispatchStarted = true;
            console.log(`[109-parallel] 全部 worker ready，开始派发 ${total} 组`);
            for (let i = 0; i < workers.length; i++) dispatch(i);
        };

        const spawn = (workerIdx) => {
            const w = new Worker(new URL('./816-role-balance-worker.js', import.meta.url), { type: 'module' });
            console.log(`[109-parallel] spawn worker#${workerIdx}, poolSize=${poolSize}`);
            w.onmessage = (e) => {
                const msg = e.data;
                if (msg && msg.kind === 'worker-ready') {
                    readyCount++;
                    if (!msg.ok) {
                        console.error(`[109-parallel] worker#${workerIdx} 数据加载失败:`, msg.error);
                        workers.forEach(x => x.terminate());
                        reject(new Error(`worker#${workerIdx} 数据加载失败: ${msg.error}`));
                        return;
                    }
                    console.log(`[109-parallel] worker#${workerIdx} ready (${readyCount}/${workers.length})`);
                    tryStartDispatch();
                    return;
                }
                const job = jobs.find(j => j.ai === msg.jobId.ai && j.ei === msg.jobId.ei);
                if (!job || msg.jobId.kind !== 'run') return;
                if (msg.ok === false) {
                    console.error(`[109-parallel] worker#${workerIdx} job[${job.allyRole} vs ${job.enemyRole}] FAILED:`, msg.error);
                    workers.forEach(x => x.terminate());
                    reject(new Error(`worker#${workerIdx} 组[${job.allyRole} vs ${job.enemyRole}] 异常: ${msg.error}`));
                    return;
                }
                doneResults.push({ jobId: msg.jobId, ai: job.ai, ei: job.ei, key: job.key, wins: msg.result ? msg.result.wins : undefined });
                finished++;
                const now = performance.now();
                console.log(`[109-parallel] finished ${finished}/${total} [${job.allyRole} vs ${job.enemyRole}] wins=${msg.wins} +${(now-lastMsLogged).toFixed(0)}ms`);
                lastMsLogged = now;
                progress({ done: false, text: `⏳ 完成 ${finished}/${total} 组 [${job.allyRole} vs ${job.enemyRole}]（并行中）` });
                if (finished === total) {
                    const dt = (performance.now() - t0) / 1000;
                    console.log(`[109-parallel] ALL DONE ${total} 组 × ${rounds} 场 总耗时 ${dt.toFixed(1)}s`);
                    progress({ done: true, total });
                    workers.forEach(x => x.terminate());
                    resolve(doneResults);
                    return;
                }
                dispatch(workerIdx);
            };
            w.onerror = (err) => {
                console.error(`[109-parallel] worker#${workerIdx} ERROR`, err && err.message, err && err.filename, err && err.lineno);
                workers.forEach(x => x.terminate());
                reject(new Error((err && err.message) || 'worker 异常' + (err && err.filename ? ` @${err.filename}:${err.lineno}` : '')));
            };
            workers.push(w);
        };

        const dispatch = (workerIdx) => {
            if (nextJob >= total) return;
            const job = jobs[nextJob];
            nextJob++;
            workers[workerIdx].postMessage({
                jobId: { ai: job.ai, ei: job.ei, allyRole: job.allyRole, enemyRole: job.enemyRole, kind: 'run' },
                kind: 'balance',
                ai: job.ai, ei: job.ei, allyRole: job.allyRole, enemyRole: job.enemyRole,
                rounds, positions, hexEnabled, enemyHex, masterSeed,
                pairedSeed: true   // V6.2.2：四职业共用同一批基底种子（同 (ei,i) 同 seed，只换第 6 弹性格职业）
            });
        };

        for (let i = 0; i < poolSize; i++) spawn(i);
        // 派发由 tryStartDispatch 在全部 worker ready 后统一启动（避免数据未加载先派发）
    });
}

// Wilson 95% 置信区间（比例）——与 52/138 同口径，判「差距是否只是噪声」
function wilson95(w, n) {
    if (!n) return null;
    const z = 1.96, p = w / n;
    const d = 1 + z * z / n;
    const c = p + z * z / (2 * n);
    const s = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
    return [(c - s) / d, (c + s) / d];
}

function renderResult(container, matrix, allyStats, enemyStats, meta) {
    // V6.3.2：结果顶部显示本批次 masterSeed（填回「种子」框可原样重跑）
    let html = meta && meta.masterSeed != null
        ? `<div style="color:#888;font-size:12px;margin-bottom:6px">种子 masterSeed=<b style="color:#ffd700">${meta.masterSeed}</b></div>`
        : '';

    // ===== 2026-11-01：四职业平衡总评（用同一份 4×4 结果推导，不额外跑） =====
    // 口径：基底 5 人固定（1防战/2战士/5飞行/7远程/9远程），只换第 6 个弹性格位。
    //   综合强度 = 该职业「在我方弹性格」与「在敌方弹性格」两种视角合并后的该方胜率（50% = 不偏不倚）。
    //   所以这测的是「多带/少带某职业的边际平衡」，不是抽象机制平衡。
    const bal = ROLES.map(role => {
        const aw = (allyStats[role] && allyStats[role].wins) || 0;
        const at = (allyStats[role] && allyStats[role].total) || 0;
        const ew = (enemyStats[role] && enemyStats[role].wins) || 0;
        const et = (enemyStats[role] && enemyStats[role].total) || 0;
        const allyPct = at ? aw / at * 100 : null;
        const enemyPct = et ? ew / et * 100 : null;          // 敌方差位时「明教」胜率：越低=该职业对敌方越强
        // V6.3.1：同一场对局在「我方视角 / 敌方视角」各记一次，n 不能直接用 at+et（=2×真实对局）。
        //   分母取 (at+et)/2 = at（每个职业两视角场次相等），分子同步折半 —— 只折分母会算出 >100% 的假胜率。
        const poolW = (aw + (et - ew)) / 2, poolN = (at + et) / 2;   // 统一成「该职业所在方获胜」的场次
        const poolPct = poolN ? poolW / poolN * 100 : null;
        const ci = wilson95(poolW, poolN);
        return { role, allyPct, enemyPct, poolPct, poolN, ci };
    }).filter(x => x.poolPct !== null).sort((a, b) => b.poolPct - a.poolPct);

    if (bal.length) {
        const best = bal[0], worst = bal[bal.length - 1];
        const spread = best.poolPct - worst.poolPct;
        const overlap = (best.ci && worst.ci) ? !(best.ci[0] > worst.ci[1] || worst.ci[0] > best.ci[1]) : true;
        // V6.2.3：整体偏差自检——明教整体胜率严重偏离 50% 时，四职业数字全被单边优势淹没，不能当平衡结论
        const _allW = Object.keys(matrix).reduce((a, k) => a + ((matrix[k] && matrix[k].total) ? matrix[k].wins : 0), 0);
        const _allN = Object.keys(matrix).reduce((a, k) => a + ((matrix[k] && matrix[k].total) ? matrix[k].total : 0), 0);
        const overall = _allN ? _allW / _allN * 100 : null;
        const biased = overall !== null && (overall > STATS_TH.OVERALL_HIGH || overall < STATS_TH.OVERALL_LOW);

        html += '<div class="role-bal-section"><h2>⚖ 四职业平衡总评</h2>';
        if (biased) {
            html += `<div style="background:#4a1010;border:1px solid #f44336;color:#ffb4b4;border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.6;margin-bottom:8px;">`
                + `⚠️ 本局明教整体胜率 <b>${overall.toFixed(1)}%</b>，严重偏向一方。最常见原因：<b>只给明教开了海克斯</b>（六大派没有）。`
                + `这个偏差会把四职业数字全压平，<b>此刻不能判断职业平衡</b>。请关掉「海克斯」，或勾上「双海克斯」让双方都吃，再重跑。</div>`;
        }
        html += '<div style="color:#aaa;font-size:12px;margin-bottom:6px;line-height:1.6">'
            + '看这一列就够了：<b>净强度</b>离 50% 有多远。50% = 四职业一样强；'
            + '若 95% 区间跨过 50%，就是「分不出强弱」（可能只是样本波动）。</div>';
        html += '<table><tr><th>排名</th><th>职业</th><th>我方第6格是它</th><th>敌方第6格是它<br>（我方胜率）</th><th>净强度</th><th>95% 区间</th><th>偏离 50%</th><th>判定</th><th>最好打 / 最难打</th></tr>';
        bal.forEach((x, i) => {
            const dev = x.poolPct - 50;
            const ciTxt = x.ci ? `${(x.ci[0] * 100).toFixed(1)}–${(x.ci[1] * 100).toFixed(1)}%` : '—';
            const includes50 = x.ci ? (x.ci[0] <= 0.5 && x.ci[1] >= 0.5) : true;
            const verdict = includes50 ? '噪声内（与均衡无差）' : (dev > 0 ? '偏强' : '偏弱');
            const vCls = includes50 ? '' : (dev > 0 ? 'role-bal-strong' : 'role-bal-weak');
            // 最好打 / 最难打：从 4×4 行里挑该职业作我方时胜率最高/最低的敌职业
            let hiR = null, hiV = -1, loR = null, loV = 999;
            for (const er of ROLES) {
                const d = matrix[`${x.role}_${er}`];
                if (!d || !d.total) continue;
                const v = d.wins / d.total * 100;
                if (v > hiV) { hiV = v; hiR = er; }
                if (v < loV) { loV = v; loR = er; }
            }
            const mm = hiR ? `${ROLE_ICONS[hiR]}${hiR}(${hiV.toFixed(0)}%) / ${ROLE_ICONS[loR]}${loR}(${loV.toFixed(0)}%)` : '—';
            html += `<tr><td>#${i + 1}</td><td>${ROLE_ICONS[x.role]}${x.role}</td>`
                + `<td>${x.allyPct !== null ? x.allyPct.toFixed(1) + '%' : '—'}</td>`
                + `<td>${x.enemyPct !== null ? x.enemyPct.toFixed(1) + '%' : '—'}</td>`
                + `<td class="${vCls}"><b>${x.poolPct.toFixed(1)}%</b><div class="cell-sub" style="color:#888;font-size:11px">${x.poolN} 场</div></td>`
                + `<td>${ciTxt}</td>`
                + `<td>${dev > 0 ? '+' : ''}${dev.toFixed(1)}pp</td>`
                + `<td class="${vCls}">${verdict}</td><td style="font-size:11px">${mm}</td></tr>`;
        });
        html += '</table>';
        html += `<div style="color:#aaa;font-size:12px;margin-top:8px;line-height:1.7">`
            + `最强 <b>${ROLE_ICONS[best.role]}${best.role}</b> ${best.poolPct.toFixed(1)}% vs 最弱 <b>${ROLE_ICONS[worst.role]}${worst.role}</b> ${worst.poolPct.toFixed(1)}% ，差距 <b>${spread.toFixed(1)}pp</b>。`
            + (biased
                ? '⚠️ 但当前存在系统性单边偏差（见上方红框），这个差距<b>不可信</b>。'
                : (overlap
                    ? '两者 95% 区间<b>有重叠</b> → 这点差距可能只是噪声，加大「每组场次」再看。'
                    : '两者 95% 区间<b>不重叠</b> → 差距是真的，不是样本波动。'))
            + `</div>`;
        html += '<div style="color:#888;font-size:11px;margin-top:6px;line-height:1.6">口径：基底 5 人固定（1防战 / 2战士 / 5飞行 / 7远程 / 9远程），只换第 6 个弹性格位；'
            + '四职业共用同一批基底种子（同敌职业、同场次序号跑完全相同的基底，只换弹性格职业），所以点差更干净。'
            + '「综合强度」= 该职业在我方 / 在敌方两种视角合并后的所在方胜率（50% = 不偏不倚）。'
            + '区间按独立样本近似；配对共享随机使样本正相关、有效样本量小于 n，真实区间比这里更宽（当前略偏窄，边界别当铁线）。'
            + '因此它衡量的是「多带或撞上某职业时的边际强弱」，不是抽象的机制平衡；且职业与具体角色绑定，结论应读作「职业池强度」。</div>';
        html += '</div>';
    }

    html += '<div class="role-bal-section"><h2>📊 4×4 对阵矩阵（明教视角胜率）</h2>';
    html += '<table class="role-bal-matrix"><tr><th>明教额外 \\ 六大派额外</th>';
    for (const enemyRole of ROLES) {
        html += `<th>${ROLE_ICONS[enemyRole]}${enemyRole}</th>`;
    }
    html += '</tr>';
    for (const allyRole of ROLES) {
        html += `<tr><th>${ROLE_ICONS[allyRole]}${allyRole}</th>`;
        for (const enemyRole of ROLES) {
            const key = `${allyRole}_${enemyRole}`;
            const data = matrix[key];
            if (!data) { html += '<td>-</td>'; continue; }
            const pct = data.total > 0 ? (data.wins / data.total * 100) : 0;
            const cls = pct > 55 ? 'role-bal-strong' : (pct < 45 ? 'role-bal-weak' : '');
            html += `<td class="${cls}">${pct.toFixed(1)}%</td>`;
        }
        html += '</tr>';
    }
    html += '</table></div>';

    html += '<div class="role-bal-section"><h2>🏆 明教额外职业平均胜率排行</h2>';
    html += '<table><tr><th>职业</th><th>总场次</th><th>明教胜</th><th>胜率</th></tr>';
    const allySorted = ROLES.slice().sort((a, b) => {
        const pa = (allyStats[a]?.total || 0) > 0 ? allyStats[a].wins / allyStats[a].total : 0;
        const pb = (allyStats[b]?.total || 0) > 0 ? allyStats[b].wins / allyStats[b].total : 0;
        return pb - pa;
    });
    for (const role of allySorted) {
        const s = allyStats[role] || { wins: 0, total: 0 };
        const pct = s.total > 0 ? (s.wins / s.total * 100).toFixed(1) : '-';
        html += `<tr><td>${ROLE_ICONS[role]}${role}</td><td>${s.total}</td><td>${s.wins}</td><td>${pct}%</td></tr>`;
    }
    html += '</table></div>';

    html += '<div class="role-bal-section"><h2>🏆 额外职业综合胜率排行（不分阵营）</h2>';
    html += '<table><tr><th>职业</th><th>总场次</th><th>该方胜场</th><th>胜率</th></tr>';
    const combinedSorted = ROLES.slice().sort((a, b) => {
        const aw = (allyStats[a]?.wins || 0) + ((enemyStats[a]?.total || 0) - (enemyStats[a]?.wins || 0));
        const at = (allyStats[a]?.total || 0) + (enemyStats[a]?.total || 0);
        const bw = (allyStats[b]?.wins || 0) + ((enemyStats[b]?.total || 0) - (enemyStats[b]?.wins || 0));
        const bt = (allyStats[b]?.total || 0) + (enemyStats[b]?.total || 0);
        const pa = at > 0 ? aw / at : 0;
        const pb = bt > 0 ? bw / bt : 0;
        return pb - pa;
    });
    for (const role of combinedSorted) {
        const aw = allyStats[role]?.wins || 0;
        const at = allyStats[role]?.total || 0;
        const ew = (enemyStats[role]?.total || 0) - (enemyStats[role]?.wins || 0);
        const et = enemyStats[role]?.total || 0;
        // V6.3.1：同一场对局被两视角各计一次 → 分子分母同步折半（同总评口径）
        const totalWins = (aw + ew) / 2;
        const totalGames = (at + et) / 2;
        const pct = totalGames > 0 ? (totalWins / totalGames * 100).toFixed(1) : '-';
        const showW = Number.isInteger(totalWins) ? totalWins : totalWins.toFixed(1);
        html += `<tr><td>${ROLE_ICONS[role]}${role}</td><td>${totalGames}</td><td>${showW}</td><td>${pct}%</td></tr>`;
    }
    html += '</table></div>';

    container.innerHTML = html;
}

// 把容器内所有 <table> 刮成 Markdown（带就近标题），用于「📋 复制结果」
function prevHeading(table) {
    let n = table.previousElementSibling;
    while (n) { if (/^H[1-6]$/.test(n.tagName)) return n.textContent.trim(); n = n.previousElementSibling; }
    return '';
}
function tablesToMd(container) {
    const tables = Array.from(container.querySelectorAll('table'));
    if (!tables.length) return '';
    const lines = [];
    for (const t of tables) {
        const h = prevHeading(t);
        if (h) lines.push('## ' + h);
        const rows = Array.from(t.querySelectorAll('tr'));
        const mdRows = rows.map(r => Array.from(r.children)
            .map(c => c.textContent.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim())
            .join(' | '));
        if (mdRows.length) {
            lines.push(mdRows[0]);
            lines.push(mdRows[0].split(' | ').map(() => '---').join(' | '));
            for (let i = 1; i < mdRows.length; i++) lines.push(mdRows[i]);
        }
        lines.push('');
    }
    return lines.join('\n').trim();
}

// 复制：优先 clipboard API，失败回退 textarea+execCommand
async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) { /* 落到下面兜底 */ }
    try {
        const ta = document.createElement('textarea');
        ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch (e) { return false; }
}