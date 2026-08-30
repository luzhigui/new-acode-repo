// tools/109-role-balance.js - 光明顶5v5 职业平衡分析工具
// V5.7.0 | ~15500 bytes| 2026-08-24 Worker 并行化：批量战斗移至 116-role-balance-worker.js，主文件只负责派发/聚合/渲染
export const VER = 'tools/109-role-balance.js V5.7.0';

import { ROLE_TYPES } from '../infra/56-battle-enums.js';

const ROLES = [ROLE_TYPES.DEFENDER, ROLE_TYPES.WARRIOR, ROLE_TYPES.FLYER, ROLE_TYPES.RANGED];
const ROLE_ICONS = { [ROLE_TYPES.DEFENDER]: '🛡️', [ROLE_TYPES.WARRIOR]: '⚔️', [ROLE_TYPES.FLYER]: '🦅', [ROLE_TYPES.RANGED]: '🏹' };

// 第六人站位规则：默认所有职业 [3,4,6,8]（近战限位默认关），开启近战限位后防战/战士仅 [3,6]
let extraPosConfig = { [ROLE_TYPES.DEFENDER]: [3, 4, 6, 8], [ROLE_TYPES.WARRIOR]: [3, 4, 6, 8], [ROLE_TYPES.FLYER]: [3, 4, 6, 8], [ROLE_TYPES.RANGED]: [3, 4, 6, 8] };
let extraPosDefault = [3, 4, 6, 8];

// ========== 样式 ==========
if (!document.getElementById('roleBalStyle')) {
    const style = document.createElement('style');
    style.id = 'roleBalStyle';
    style.textContent = `
.role-bal-mask{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center}
.role-bal-box{background:#1a1a2e;color:#eee;font-family:monospace;border:1px solid #444;border-radius:12px;width:min(920px,94vw);max-height:88vh;display:flex;flex-direction:column;padding:16px}
.role-bal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.role-bal-head h1{color:#ffd700;font-size:20px;margin:0}
.role-bal-close{background:#444;color:#ccc;border:none;border-radius:8px;padding:6px 14px;font-weight:bold;cursor:pointer;font-family:monospace}
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

// ========== 主界面 ==========
window.openRoleBalance = function() {
    const mask = document.createElement('div');
    mask.className = 'role-bal-mask';
    mask.innerHTML = `
        <div class="role-bal-box">
            <div class="role-bal-head">
                <h1>⚖️ 职业平衡分析</h1>
                <button class="role-bal-close">关闭</button>
            </div>
            <div class="role-bal-body">
                <p class="role-bal-tip">6V6 标准模板循环赛：双方基础模板（1防战、2战士、5飞行、7远程、9远程）各加一名额外职业。M=100，明教侧按全自动规则选海克斯（开局1个+每3回合1个，仅明教方）。统计明教视角胜率。</p>
                <div class="role-bal-pos-config">
                    <label class="role-bal-toggle" id="roleBalHexLabel">
                        <input type="checkbox" id="roleBalHex" checked>
                        <span class="switch"></span> 海克斯
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

    const roundsInput = mask.querySelector('#roleBalRounds');
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

    mask.querySelector('#roleBalClear').addEventListener('click', () => {
        result.innerHTML = '';
        progress.textContent = '';
    });

    mask.querySelector('#roleBalRun').addEventListener('click', async () => {
        const roundsPerGroup = parseInt(roundsInput.value) || 100;
        const hexEnabled = mask.querySelector('#roleBalHex').checked;
        const startT = performance.now();
        const matrix = {};
        const allyStats = {};
        const enemyStats = {};
        const masterSeed = Date.now();
        const positions = JSON.parse(JSON.stringify({ ...extraPosConfig })); // 快照，worker 间共享只读

        // Worker 池并行：每核 1 worker，16 组 job 按可用 worker 并发派发
        const poolSize = Math.max(1, (navigator.hardwareConcurrency || 4) - 1); // 留 1 核给主线程 UI
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
        renderResult(result, matrix, allyStats, enemyStats);

        try {
            const results = await runJobsParallel(jobs, roundsPerGroup, positions, hexEnabled, masterSeed, poolSize, (msg) => {
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
            renderResult(result, matrix, allyStats, enemyStats);
        } catch (err) {
            progress.textContent = `❌ 并行评测异常：${err.message || err}（已用 ${((performance.now() - startT) / 1000).toFixed(1)}s）`;
        }
    });
};

// Worker 池：并发派发 jobs，逐组回报进度，聚合结果
function runJobsParallel(jobs, rounds, positions, hexEnabled, masterSeed, poolSize, progress) {
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
            const w = new Worker(new URL('./116-role-balance-worker.js', import.meta.url), { type: 'module' });
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
                doneResults.push({ jobId: msg.jobId, ai: job.ai, ei: job.ei, key: job.key, wins: msg.wins });
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
                ai: job.ai, ei: job.ei, allyRole: job.allyRole, enemyRole: job.enemyRole,
                rounds, positions, hexEnabled, masterSeed
            });
        };

        for (let i = 0; i < poolSize; i++) spawn(i);
        // 派发由 tryStartDispatch 在全部 worker ready 后统一启动（避免数据未加载先派发）
    });
}

function renderResult(container, matrix, allyStats, enemyStats) {
    let html = '';

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
        const totalWins = aw + ew;
        const totalGames = at + et;
        const pct = totalGames > 0 ? (totalWins / totalGames * 100).toFixed(1) : '-';
        html += `<tr><td>${ROLE_ICONS[role]}${role}</td><td>${totalGames}</td><td>${totalWins}</td><td>${pct}%</td></tr>`;
    }
    html += '</table></div>';

    container.innerHTML = html;
}