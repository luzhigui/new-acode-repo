// tools/109-role-balance.js - 光明顶5v5 职业平衡分析工具
// V5.6.0 | ~16500 bytes| 2026-08-22 新增海克斯开关（复刻全自动选buff流程），近战限位默认关
export const VER = 'tools/109-role-balance.js V5.6.0';

import { CONFIG } from '../core/01config-5v5-test.js';
import { Unit } from '../core/02unit.js';
import { SeededRNG } from '../infra/51-core-utils.js';
import { createRoundStepper } from '../core/11battle-round.js';
import { setBattleRng } from '../core/13battle-shared.js';
import { createBuffObject } from '../modules/28buff-tools.js';
import '../infra/54-global-store.js';
import '../modules/25elite-imperial.js';
import '../modules/26elite-sixsects.js';
import '../modules/27elite-mingjiao.js';
import { CAMP_TYPES, ROLE_TYPES, BUFF_TYPES } from '../infra/56-battle-enums.js';

const ROLES = [ROLE_TYPES.DEFENDER, ROLE_TYPES.WARRIOR, ROLE_TYPES.FLYER, ROLE_TYPES.RANGED];
const ROLE_ICONS = { [ROLE_TYPES.DEFENDER]: '🛡️', [ROLE_TYPES.WARRIOR]: '⚔️', [ROLE_TYPES.FLYER]: '🦅', [ROLE_TYPES.RANGED]: '🏹' };
const BASE_TEMPLATE = { 1: ROLE_TYPES.DEFENDER, 2: ROLE_TYPES.WARRIOR, 5: ROLE_TYPES.FLYER, 7: ROLE_TYPES.RANGED, 9: ROLE_TYPES.RANGED };

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

// ========== 工具函数 ==========
function createUnit(role, camp, rng) {
    const campLabel = camp === CAMP_TYPES.ALLY ? '明教' : '六大派';
    const u = new Unit(`${campLabel}·${role}`, 100, role, camp);
    u.init(rng);
    u.applyBonus();
    return u;
}

function buildTeam(extraRole, camp, rng) {
    const team = [];
    for (const [posStr, role] of Object.entries(BASE_TEMPLATE)) {
        const u = createUnit(role, camp, rng);
        u.pos = parseInt(posStr, 10);
        u._originalPos = u.pos;
        team.push(u);
    }
    const positions = extraPosConfig[extraRole] || extraPosDefault;
    const extraPos = positions[rng.nextInt(0, positions.length - 1)];
    const extra = createUnit(extraRole, camp, rng);
    extra.pos = extraPos;
    extra._originalPos = extraPos;
    team.push(extra);
    return team;
}

// 海克斯：选一个新 buff（复刻主代码全自动规则）
// withFortifyRule=开局规则（无激活buff时排除fortify）；every3=每3回合规则（无fortify排除）
function pickHexBuff(activeBuffs, allyTeam, rng, withFortifyRule) {
    const existing = activeBuffs.map(b => b.key);
    const allKeys = Object.keys(CONFIG.BUFFS);
    const available = allKeys.filter(k => {
        if (existing.includes(k)) return false;
        if (withFortifyRule && k === BUFF_TYPES.FORTIFY && !activeBuffs.some(b => b.remaining > 0)) return false;
        const requiredRole = CONFIG.BUFF_ROLE_REQUIREMENTS[k];
        if (requiredRole && !allyTeam.some(u => u.alive && u.role === requiredRole)) return false;
        return true;
    });
    if (available.length === 0) return null;
    const pick = available[rng.nextInt(0, available.length - 1)];
    const duration = CONFIG.BUFFS[pick].duration || CONFIG.BUFF_DURATION || 4;
    return createBuffObject(pick, duration);
}

async function runNakedBattle(allyUnits, enemyUnits, seed, firstSide = CAMP_TYPES.ENEMY, hexEnabled = false) {
    const rng = new SeededRNG(seed);
    setBattleRng(rng); // createBuffObject 的 holyFlame 列行随机依赖 battleRng（stepper 每回合也会重设，这里保证开局选择前可用）
    let masterBuffs = [];
    if (hexEnabled) {
        const first = pickHexBuff(masterBuffs, allyUnits, rng, true);
        if (first) masterBuffs.push(first);
    }
    let battleState = {
        ally: allyUnits.map(u => u.clone()),
        enemy: enemyUnits.map(u => u.clone()),
        round: 1,
        activeBuffs: masterBuffs,
        allAllies: allyUnits.map(u => u.clone()),
        _rng: rng,
        _firstSide: firstSide
    };
    let lastStep = null;
    const maxRound = CONFIG.MAX_ROUND || 35;
    while (battleState.round <= maxRound) {
        const stepper = createRoundStepper(battleState);
        for await (const step of stepper) {
            lastStep = step;
            if (step.winner) return { winner: step.winner };
        }
        // 回合结束：buff 计时 -1（与主代码 42player-core 的主列表同步一致；引擎内部副本自行tick互不影响）
        masterBuffs = masterBuffs.map(b => ({ ...b, remaining: b.remaining - 1 })).filter(b => b.remaining > 0);
        // 每3回合选新 buff（round%3===0：刚打完的回合数）
        if (hexEnabled && battleState.round % 3 === 0 && battleState.round > 0) {
            const aliveCheckTeam = (lastStep && lastStep.ally) ? lastStep.ally : allyUnits;
            const nb = pickHexBuff(masterBuffs, aliveCheckTeam, rng, false);
            if (nb) {
                if (masterBuffs.length >= 2) {
                    const shortest = masterBuffs.reduce((a, b) => a.remaining < b.remaining ? a : b);
                    masterBuffs.splice(masterBuffs.indexOf(shortest), 1);
                }
                masterBuffs.push(nb);
            }
        }
        battleState = {
            ally: (lastStep ? lastStep.ally : battleState.ally).map(u => u.clone()),
            enemy: (lastStep ? lastStep.enemy : battleState.enemy).map(u => u.clone()),
            round: battleState.round + 1,
            activeBuffs: masterBuffs.map(b => ({ ...b })),
            allAllies: battleState.allAllies,
            _rng: battleState._rng
        };
    }
    return { winner: '平局' };
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
        const matrix = {};
        const allyStats = {};
        const enemyStats = {};
        const masterSeed = Date.now();

        for (let ai = 0; ai < ROLES.length; ai++) {
            for (let ei = 0; ei < ROLES.length; ei++) {
                const allyRole = ROLES[ai];
                const enemyRole = ROLES[ei];
                const key = `${allyRole}_${enemyRole}`;
                matrix[key] = { wins: 0, total: roundsPerGroup };
                allyStats[allyRole] = allyStats[allyRole] || { wins: 0, total: 0 };
                enemyStats[enemyRole] = enemyStats[enemyRole] || { wins: 0, total: 0 };

                let wins = 0;
                for (let i = 0; i < roundsPerGroup; i++) {
                    const seed = masterSeed + ai * 100000 + ei * 10000 + i * 7919;
                    const rng = new SeededRNG(seed);
                    const allyTeam = buildTeam(allyRole, CAMP_TYPES.ALLY, rng);
                    const enemyTeam = buildTeam(enemyRole, CAMP_TYPES.ENEMY, rng);
                    const firstSide = CAMP_TYPES.ENEMY;
                    const r = await runNakedBattle(allyTeam, enemyTeam, seed, firstSide, hexEnabled);
                    if (r.winner === '明教') wins++;
                    if (i % 10 === 0) {
                        progress.textContent = `明教额外[${allyRole}] vs 六大派额外[${enemyRole}]：${i}/${roundsPerGroup}`;
                        await new Promise(res => setTimeout(res, 0));
                    }
                }
                matrix[key].wins = wins;
                allyStats[allyRole].wins += wins;
                allyStats[allyRole].total += roundsPerGroup;
                enemyStats[enemyRole].wins += wins;
                enemyStats[enemyRole].total += roundsPerGroup;
                progress.textContent = `✅ 明教额外[${allyRole}] vs 六大派额外[${enemyRole}] 完成：明教胜 ${wins}/${roundsPerGroup}`;
                renderResult(result, matrix, allyStats, enemyStats);
                await new Promise(res => setTimeout(res, 20));
            }
        }
        progress.textContent = '✅ 全部 16 组完成';
    });
};

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