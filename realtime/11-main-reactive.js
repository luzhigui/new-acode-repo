// realtime/11-main-reactive.js - 响应式架构入口，复用原版UI渲染
// V1.0.0 | 2026-07-05 store+播放器，renderGrid原样复用
export const VER = 'realtime/11-main-reactive.js V1.0.0';

import { CONFIG, ENEMY_M, KILL_TAUNT } from '../core/01config-5v5-test.js';
import { Unit } from '../core/02unit.js';
import { rand } from '../core/03battle-utils.js';
import { runBattle } from '../core/06battle-engine-core.js';

const C = CONFIG;
const ALL_BUFF_KEYS = Object.keys(C.BUFFS);

// ==================== store ====================
function createStore(initialState, reducer) {
    let state = initialState;
    const listeners = [];
    return {
        getState: () => state,
        dispatch(action) {
            const next = reducer(state, action);
            if (next === state) return;
            state = next;
            listeners.forEach(fn => { try { fn(state, action); } catch(e) { console.error(e); } });
        },
        subscribe(fn) { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); }
    };
}

function battleReducer(state, action) {
    switch (action.type) {
        case 'BATTLE_INIT':
            return { ...state, units: action.units, round: 0, phase: 'ready', winner: null, activeBuffs: action.activeBuffs || [] };
        case 'LOG_ENTRY': {
            const entry = action.entry;
            let units = state.units;
            if (entry.type === 'buff-summon' && entry.horseUid) {
                const horse = { uid: entry.horseUid, name: '拒马', role: '防战', camp: 'ally', pos: entry.horsePos, hp: 50, maxHp: 50, atk: 0, def: 5, alive: true, isHorse: true, dmgDealt:0, dmgTaken:0, healDone:0, dodgeCount:0, critCount:0, survivedRounds:0 };
                units = [...units, horse];
            } else if (entry.type === 'buff-destroy' && entry.horseUid) {
                units = units.map(u => u.uid === entry.horseUid ? { ...u, alive: false, hp: 0, _isDead: true } : u);
            } else if (entry.type === 'attack-group') {
                units = applyAttackGroup(units, entry);
            } else if (entry._events) {
                units = applyEvents(units, entry._events);
            }
            if (entry.type === 'round-end') {
                units = units.map(u => u.alive ? { ...u, survivedRounds: (u.survivedRounds||0)+1 } : u);
            }
            return { ...state, units, lastEntry: entry };
        }
        case 'BATTLE_END': {
            const synced = syncFinalState(state.units, action.ally, action.enemy);
            return { ...state, phase: 'ended', winner: action.winner, units: synced };
        }
        default: return state;
    }
}

function applyAttackGroup(units, entry) {
    let next = units.map(u => ({ ...u }));
    if (entry.uidD) {
        const idx = next.findIndex(u => u.uid === entry.uidD);
        if (idx >= 0) {
            next[idx].hp = entry.hpAfter;
            next[idx].alive = entry.alive !== undefined ? entry.alive : next[idx].alive;
            if (!next[idx].alive) next[idx]._isDead = true;
        }
    }
    // 攻击者 hp 也可能变（反弹/自伤）
    if (entry._events && entry._events.length > 0) {
        next = applyEvents(next, entry._events);
    }
    // 统计字段从 _events 里取
    return next;
}

function applyEvents(units, events) {
    if (!events || events.length === 0) return units;
    let next = units.map(u => ({ ...u }));
    for (const ev of events) {
        const idx = next.findIndex(u => u.uid === ev.unitUid);
        if (idx < 0) continue;
        const p = ev.payload;
        if (p.hp !== undefined) next[idx].hp = p.hp;
        if (p.maxHp !== undefined) next[idx].maxHp = p.maxHp;
        if (p.alive !== undefined) next[idx].alive = p.alive;
        if (p.atk !== undefined) next[idx].atk = p.atk;
        if (p.def !== undefined) next[idx].def = p.def;
        if (p.dmgDealt !== undefined) next[idx].dmgDealt = p.dmgDealt;
        if (p.dmgTaken !== undefined) next[idx].dmgTaken = p.dmgTaken;
        if (p.healDone !== undefined) next[idx].healDone = p.healDone;
        if (p.reboundDone !== undefined) next[idx].reboundDone = p.reboundDone;
        if (p.leechDone !== undefined) next[idx].leechDone = p.leechDone;
        if (p.dodgeCount !== undefined) next[idx].dodgeCount = p.dodgeCount;
        if (p.critCount !== undefined) next[idx].critCount = p.critCount;
        if (p.survivedRounds !== undefined) next[idx].survivedRounds = p.survivedRounds;
    }
    return next;
}

function syncFinalState(units, ally, enemy) {
    let next = units.map(u => ({ ...u }));
    for (const src of [...ally, ...enemy]) {
        const idx = next.findIndex(u => u.uid === src.uid);
        if (idx >= 0) {
            next[idx].hp = src.hp;
            next[idx].maxHp = src.maxHp;
            next[idx].alive = src.alive;
            next[idx].atk = src.atk;
            next[idx].def = src.def;
            next[idx].dmgDealt = src.dmgDealt || 0;
            next[idx].dmgTaken = src.dmgTaken || 0;
            next[idx].healDone = src.healDone || 0;
            next[idx].reboundDone = src.reboundDone || 0;
            next[idx].leechDone = src.leechDone || 0;
            next[idx].dodgeCount = src.dodgeCount || 0;
            next[idx].critCount = src.critCount || 0;
            next[idx].survivedRounds = src.survivedRounds || 0;
            next[idx]._isDead = !src.alive;
        }
    }
    return next;
}

// ==================== 阵容生成（复刻原版） ====================
function generateAllyTeam(stage) {
    const squad = C.MING_SQUADS[stage];
    let config;
    if (stage === 1 && Array.isArray(squad[0])) {
        config = squad[rand(0, squad.length - 1)];
    } else {
        config = squad;
    }
    if (!Array.isArray(config)) config = [config];

    const team = [];
    const takenPos = new Set();
    for (const item of config) {
        let name, mVal;
        if (typeof item === 'string') {
            name = item; mVal = C.MING_M[name] || 95;
        } else {
            mVal = item;
            if (mVal === 95) {
                const count = team.filter(u => u.name && u.name.startsWith('明教弟子')).length;
                name = '明教弟子' + (count + 1);
            } else {
                const used = team.map(u => u.name);
                const candidates = Object.entries(C.MING_M).filter(([n, v]) => v === mVal && !used.includes(n));
                name = candidates.length > 0 ? candidates[rand(0, candidates.length - 1)][0] : '明教弟子' + (team.length + 1);
            }
        }
        const role = name === '张无忌' ? '远程' : (name === '韦一笑' ? '飞行' : C.ROLES[rand(0, 3)]);
        const unit = new Unit(name, mVal, role, 'ally');
        if (name === '张无忌') unit.isZhang = true;
        if (name === '韦一笑') unit.isWei = true;
        unit.init(); unit.applyBonus();
        team.push(unit);
    }
    const zhang = team.find(u => u.isZhang);
    const wei = team.find(u => u.isWei);
    if (zhang) { zhang.pos = 5; takenPos.add(5); }
    if (wei) { wei.pos = 6; takenPos.add(6); }
    const others = team.filter(u => !u.isZhang && !u.isWei);
    if (others.length > 0 && zhang && !takenPos.has(2)) { others[0].pos = 2; takenPos.add(2); others.shift(); }
    let slots = [1,2,3,4,5,6,7,8,9].filter(p => !takenPos.has(p));
    for (const u of others) {
        if (slots.length > 0) { const i = rand(0, slots.length - 1); u.pos = slots[i]; takenPos.add(slots[i]); slots.splice(i, 1); }
        else u.pos = 5;
    }
    return team;
}

function generateEnemyTeam(stage) {
    const squad = C.ENEMY_SQUADS[stage];
    const units = [];
    const posSet = new Set();
    for (const item of squad) {
        if (typeof item === 'object' && item.name) {
            const u = new Unit(item.name, item.m, item.role, 'enemy');
            u.init(); u.applyBonus();
            units.push(u);
        } else {
            const mVal = item;
            const pool = Object.entries(ENEMY_M).filter(([n, v]) => v === mVal);
            const used = units.map(u => u.name);
            let name = null;
            const defs = Object.values(C.ENEMY_SQUADS).flat();
            for (const d of defs) { if (typeof d === 'object' && d.m === mVal && !used.includes(d.name)) { name = d.name; break; } }
            if (!name && pool.length > 0) {
                let tries = 0;
                while ((!name || used.includes(name)) && tries < 50) { name = pool[rand(0, pool.length - 1)][0]; tries++; }
            }
            if (!name) name = '六大派弟子';
            const role = C.ROLES[rand(0, 3)];
            const u = new Unit(name, mVal, role, 'enemy');
            u.init(); u.applyBonus();
            units.push(u);
        }
    }
    const xuanmingCount = units.filter(u => u.name === '鹿杖客' || u.name === '鹤笔翁').length;
    if (stage === 5 && xuanmingCount === 2) {
        const pool = Object.entries(ENEMY_M).filter(([n, v]) => v === 104);
        const used = units.map(u => u.name);
        let name = null;
        while ((!name || used.includes(name)) && pool.length > 0) { const p = pool[rand(0, pool.length - 1)]; name = p[0]; if (used.includes(name)) { name = null; pool.splice(pool.indexOf(p), 1); } }
        if (!name) name = '六大派弟子';
        const u = new Unit(name, 104, C.ROLES[rand(0, 3)], 'enemy');
        u.init(); u.applyBonus();
        units.push(u);
    }
    const template = C.ENEMY_POS_TEMPLATES[stage];
    const eliteDefs = C.ELITE_POOL[stage] || [];
    const eliteUnits = units.filter(u => eliteDefs.some(e => e.name === u.name));
    const normalUnits = units.filter(u => !eliteUnits.includes(u));
    if (template) {
        for (const [role, poses] of Object.entries(template)) {
            if (role === 'random') continue;
            for (const pos of poses) {
                const u = normalUnits.find(u => u.role === role && u.pos == null);
                if (u && !posSet.has(pos)) { u.pos = pos; u._originalPos = pos; posSet.add(pos); }
            }
        }
    }
    let empty = [1,2,3,4,5,6,7,8,9].filter(p => !posSet.has(p));
    for (const u of normalUnits.filter(u => u.pos == null)) {
        if (empty.length > 0) { const i = rand(0, empty.length - 1); u.pos = empty[i]; u._originalPos = u.pos; posSet.add(empty[i]); empty.splice(i, 1); }
    }
    const zhou = eliteUnits.find(u => u.name === '周芷若');
    const song = eliteUnits.find(u => u.name === '宋青书');
    if (zhou) { for (const p of [2,3,4,5,6,7,8,9]) { if (!posSet.has(p)) { zhou.pos = p; zhou._originalPos = p; posSet.add(p); break; } } }
    if (song) {
        const zp = zhou ? zhou.pos : 0;
        for (let p = zp + 1; p <= 9; p++) { if (!posSet.has(p)) { song.pos = p; song._originalPos = p; posSet.add(p); break; } }
        if (song.pos == null) { for (let p = 1; p <= 9; p++) { if (!posSet.has(p)) { song.pos = p; song._originalPos = p; posSet.add(p); break; } } }
    }
    for (const u of eliteUnits.filter(u => u !== zhou && u !== song && u.pos == null)) {
        empty = [1,2,3,4,5,6,7,8,9].filter(p => !posSet.has(p));
        if (empty.length > 0) { const i = rand(0, empty.length - 1); u.pos = empty[i]; u._originalPos = u.pos; posSet.add(empty[i]); }
    }
    return units;
}

// ==================== 状态 ====================
let store = null;
let activeBuffs = [];
let selectedBuffIndex = -1;
let currentStage = 1;
let isPaused = false;
let currentSpeed = 2; // 默认2x
let playbackController = null;
let doubleStrikeUid = null;

// ==================== 提供给 renderGrid 的 context ====================
window._getPlayerContext = function() {
    if (!store) return null;
    const s = store.getState();
    return {
        UI: {
            allyTeam: s.units.filter(u => u.camp === 'ally'),
            enemyTeam: s.units.filter(u => u.camp === 'enemy'),
        },
        activeBuffs: activeBuffs,
        currentDoubleStrikeUid: doubleStrikeUid,
        adjustMode: false,
        selectedAdjustPos: null
    };
};

// ==================== 渲染（内联版，匹配原版CSS） ====================
function renderGrid(gridId, team, camp) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = '';
    const displayOrder = camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
    for (const pos of displayOrder) {
        const unit = team.find(c => c.pos === pos && c.alive);
        const deadUnit = team.find(c => c.pos === pos && !c.alive);
        const div = document.createElement('div');
        div.className = 'cell';
        div.dataset.pos = pos;
        if (unit) {
            div.classList.add(camp);
            if (unit.isHorse) div.classList.add('horse');
            const hpPct = Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100));
            const hpClass = hpPct > 60 ? 'high' : hpPct > 30 ? 'mid' : 'low';
            const tags = unit.isZhang ? '⚔️' : unit.isWei ? '🦇' : unit.isHorse ? '🐴' : '';
            div.innerHTML = `<span class="unit-tags">${tags}</span><span class="unit-name">${unit.name}</span><span class="unit-role">${unit.role}</span><div class="hp-bar"><div class="hp-fill ${hpClass}" style="width:${hpPct}%"></div></div><span class="hp-text">${Math.floor(unit.hp)}/${Math.floor(unit.maxHp)}</span><div class="unit-stats"><span>⚔${Math.floor(unit.atk)}</span><span>🛡${Math.floor(unit.def)}</span></div>`;
        } else if (deadUnit) {
            div.classList.add('dead', camp);
            div.innerHTML = `<span class="unit-name" style="text-decoration:line-through;opacity:0.4">${deadUnit.name}</span>`;
        } else {
            div.classList.add('empty');
        }
        grid.appendChild(div);
    }
}

function renderAll() {
    if (!store) return;
    const s = store.getState();
    const ally = s.units.filter(u => u.camp === 'ally');
    const enemy = s.units.filter(u => u.camp === 'enemy');
    renderGrid('enemyGrid', enemy, 'enemy');
    renderGrid('allyGrid', ally, 'ally');
}

// ==================== 日志 ====================
function appendLog(html) {
    const log = document.getElementById('log');
    const div = document.createElement('div');
    div.innerHTML = html;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
}

function autoScrollLog() {
    const log = document.getElementById('log');
    log.scrollTop = log.scrollHeight;
}

// ==================== Buff 选择 ====================
function generateBuffChoices() {
    let activeKeys = activeBuffs.map(b => b.key);
    let available = ALL_BUFF_KEYS.filter(k => !activeKeys.includes(k));
    let shuffled = [...available].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, C.BUFF_CHOICES);
}

function showBuffSelection(callback) {
    let choices = generateBuffChoices();
    let modal = document.createElement('div');
    modal.className = 'modal-overlay';
    let text = '选择 Buff（持续 ' + C.BUFF_DURATION + ' 回合）';
    let buttons = choices.map(key => {
        let buff = C.BUFFS[key];
        return `<button class="modal-btn buff" data-key="${key}">${buff.icon} ${buff.name}<br><span style="font-size:9px;color:#666;">${buff.desc}</span></button>`;
    }).join('');
    modal.innerHTML = `<div class="modal-box"><div class="modal-text">${text}</div><div class="modal-buttons">${buttons}</div></div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('.buff').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.key;
            const buff = C.BUFFS[key];
            activeBuffs.push({ key, name: buff.name, icon: buff.icon, remaining: C.BUFF_DURATION });
            appendLog(`<span class="gold">✨ 获得Buff：${buff.name}（持续${C.BUFF_DURATION}回合）</span><br>`);
            updateBuffSlots();
            modal.remove();
            callback();
        });
    });
}

function updateBuffSlots() {
    for (let i = 0; i < 2; i++) {
        let slot = document.getElementById('buffSlot' + i);
        if (!slot) continue;
        if (i < activeBuffs.length) {
            let buff = activeBuffs[i];
            slot.textContent = buff.icon + buff.name + '/' + buff.remaining + '回';
            slot.classList.add('glow');
            if (selectedBuffIndex === i) slot.classList.add('active');
            else slot.classList.remove('active');
        } else {
            slot.textContent = 'buff' + (i+1);
            slot.classList.remove('active', 'glow');
        }
    }
}

// ==================== 战斗流程 ====================
async function startBattle() {
    const btnMain = document.getElementById('btnMain');
    btnMain.disabled = true;
    document.getElementById('log').innerHTML = '';
    isPaused = false;
    document.getElementById('btnPause').textContent = '⏸️ 暂停';
    document.getElementById('btnPause').disabled = false;

    // 生成阵容
    const allyTeam = generateAllyTeam(currentStage);
    const enemyTeam = generateEnemyTeam(currentStage);

    // 初始 store
    window._battleEvents = [];
    window._currentBattleState = { ally: allyTeam, enemy: enemyTeam };
    const allUnits = [...allyTeam.map(u => ({...u, camp: 'ally'})), ...enemyTeam.map(u => ({...u, camp: 'enemy'}))];
    store = createStore({ units: allUnits, round: 0, phase: 'ready', winner: null, lastEntry: null }, battleReducer);
    store.subscribe(() => renderAll());
    renderAll();

    appendLog(`<span class="gold">⚔️ 第${currentStage}关战斗开始！</span><br>`);

    // Buff 选择（第2关开始）
    if (currentStage >= 2) {
        await new Promise(resolve => showBuffSelection(resolve));
    }

    // 引擎跑完整场
    const snapshot = {
        ally: allyTeam.map(u => u.clone()),
        enemy: enemyTeam.map(u => u.clone())
    };
    window._battleEvents = [];
    window._currentBattleState = { ally: snapshot.ally, enemy: snapshot.enemy };
    const buffsForEngine = activeBuffs.map(b => ({ key: b.key, name: b.name, remaining: b.remaining }));
    const result = runBattle(snapshot, buffsForEngine, {});

    // 播放日志
    await playbackLog(result);

    // 结束
    appendLog(`<span class="gold">🏁 ${result.winner}获胜！共${result.rounds}回合</span><br>`);
    spawnVictoryEffects(result.winner);

    btnMain.disabled = false;
}

async function playbackLog(result) {
    const baseDelay = 600 / currentSpeed;

    for (let i = 0; i < result.log.length; i++) {
        if (playbackController?.aborted) break;

        while (isPaused) { await new Promise(r => setTimeout(r, 100)); }

        const entry = result.log[i];

        // dispatch 到 store
        store.dispatch({ type: 'LOG_ENTRY', entry });

        // 日志显示
        if (entry.type === 'round-start') {
            appendLog(`<div class="separator" style="text-align:center;color:#b8860b;margin:4px 0;">———— 第${entry.round || (Math.floor(i/10)+1)}回合开始 ————</div>`);
        } else if (entry.type === 'round-end') {
            appendLog(`<div class="separator" style="text-align:center;color:#888;margin:4px 0;">———— 回合结束 ————</div>`);
        } else if (entry.type === 'attack-group') {
            if (entry.entries) {
                let html = '';
                for (const e of entry.entries) {
                    html += `<div style="font-size:10px;">${e.text || ''}</div>`;
                }
                appendLog(html);
            }
        } else if (entry.text) {
            appendLog(entry.text + '<br>');
        }

        // 节奏
        let delay = baseDelay;
        if (entry.type === 'round-start' || entry.type === 'round-end') delay = baseDelay * 0.3;
        else if (entry.type === 'attack-group') delay = baseDelay;
        else delay = baseDelay * 0.5;

        await new Promise(r => setTimeout(r, delay));
    }

    // 最终同步
    store.dispatch({
        type: 'BATTLE_END',
        winner: result.winner,
        ally: result.ally,
        enemy: result.enemy
    });

    // 更新 Buff 剩余
    if (result.activeBuffs?.ally) {
        activeBuffs = result.activeBuffs.ally.map(b => ({ key: b.key, name: C.BUFFS[b.key]?.name || b.key, icon: C.BUFFS[b.key]?.icon || '', remaining: b.remaining }));
        updateBuffSlots();
    }
}

// ==================== 控制器 ====================
(function init() {
  try {
    // 封面
    const cover = document.getElementById('coverOverlay');
    const startBtn = document.getElementById('coverStartBtn');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            if (cover) cover.style.display = 'none';
            // 生成初始阵容预览
            const ally = generateAllyTeam(currentStage);
            const enemy = generateEnemyTeam(currentStage);
            window._battleEvents = [];
            window._currentBattleState = { ally, enemy };
            const allUnits = [...ally.map(u => ({...u, camp:'ally'})), ...enemy.map(u => ({...u, camp:'enemy'}))];
            store = createStore({ units: allUnits, round:0, phase:'ready', winner:null, lastEntry:null }, battleReducer);
            store.subscribe(() => renderAll());
            renderAll();
        });
    }

    // 版本信息
    const cv = document.getElementById('coverVersion');
    if (cv) cv.innerHTML = `响应式架构 V1.0<br>引擎 V4.0.2 原样复用`;

    // 主按钮
    const btnMain = document.getElementById('btnMain');
    btnMain.addEventListener('click', () => {
        if (store) {
            playbackController = { aborted: false };
            startBattle();
        }
    });

    // 暂停
    const btnPause = document.getElementById('btnPause');
    btnPause.addEventListener('click', function() {
        isPaused = !isPaused;
        this.textContent = isPaused ? '▶ 继续' : '⏸️ 暂停';
    });

    // 速度
    const speedMap = { 'btnSpeed2': 2, 'btnSpeed05': 0.5, 'btnSpeed05x': 0.5, 'btnSpeed2x': 2, 'btnSpeed4x': 4, 'btnSpeed7x': 7 };
    for (const [id, speed] of Object.entries(speedMap)) {
        const btn = document.getElementById(id);
        if (!btn) continue;
        btn.addEventListener('click', function() {
            currentSpeed = speed;
            document.querySelectorAll('.controls button').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    }
    // 默认2x
    const btnSpeed2 = document.getElementById('btnSpeed2');
    if (btnSpeed2) btnSpeed2.classList.add('active');

    // 选关
    const btnStage = document.getElementById('btnStageSelect');
    if (btnStage) {
        btnStage.addEventListener('click', () => {
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            let btns = '';
            for (let i = 1; i <= 6; i++) {
                btns += `<button class="modal-btn" data-stage="${i}" style="margin:3px;">第${i}关</button>`;
            }
            modal.innerHTML = `<div class="modal-box"><div class="modal-text">选择关卡</div><div class="modal-buttons">${btns}</div></div>`;
            document.body.appendChild(modal);
            modal.querySelectorAll('[data-stage]').forEach(b => {
                b.addEventListener('click', () => {
                    currentStage = parseInt(b.dataset.stage);
                    modal.remove();
                    // 重新生成阵容
                    const ally = generateAllyTeam(currentStage);
                    const enemy = generateEnemyTeam(currentStage);
                    window._battleEvents = [];
                    window._currentBattleState = { ally, enemy };
                    const allUnits = [...ally.map(u => ({...u, camp:'ally'})), ...enemy.map(u => ({...u, camp:'enemy'}))];
                    store = createStore({ units: allUnits, round:0, phase:'ready', winner:null, lastEntry:null }, battleReducer);
                    store.subscribe(() => renderAll());
                    activeBuffs = [];
                    updateBuffSlots();
                    renderAll();
                });
            });
        });
    }

    // 音乐按钮（占位）
    const btnBGM = document.getElementById('btnBGM');
    if (btnBGM) {
        btnBGM.addEventListener('click', function() {
            this.classList.toggle('active');
        });
    }

    // 详细/自动按钮
    const btnDetail = document.getElementById('btnDetail');
    if (btnDetail) {
        btnDetail.addEventListener('click', function() {
            this.classList.toggle('active');
            document.getElementById('log').classList.toggle('detail-hidden');
        });
    }
    const btnAuto = document.getElementById('btnAuto');
    if (btnAuto) {
        btnAuto.addEventListener('click', function() {
            this.classList.toggle('active');
        });
    }

    // 复制日志
    const copyLog = document.getElementById('copyLog');
    if (copyLog) {
        copyLog.addEventListener('click', () => {
            const text = document.getElementById('log').innerText;
            navigator.clipboard?.writeText(text);
        });
    }

    // 阵容信息
    const btnInfo = document.getElementById('btnInfo');
    if (btnInfo) {
        btnInfo.addEventListener('click', () => {
            if (!store) return;
            const s = store.getState();
            let html = '<div style="font-size:11px;">';
            for (const u of s.units.filter(u => u.camp === 'ally')) {
                html += `<span class="blue">${u.name}</span> ${u.role} M${u.m} 攻${u.atk} 防${u.def} 血${Math.floor(u.hp)}/${Math.floor(u.maxHp)}<br>`;
            }
            html += '---<br>';
            for (const u of s.units.filter(u => u.camp === 'enemy')) {
                html += `<span class="orange">${u.name}</span> ${u.role} M${u.m} 攻${u.atk} 防${u.def} 血${Math.floor(u.hp)}/${Math.floor(u.maxHp)}<br>`;
            }
            html += '</div>';
            appendLog(html);
        });
    }

    // Buff 槽点击
    for (let i = 0; i < 2; i++) {
        const slot = document.getElementById('buffSlot' + i);
        if (slot) {
            slot.addEventListener('click', () => {
                selectedBuffIndex = selectedBuffIndex === i ? -1 : i;
                updateBuffSlots();
            });
        }
    }

    // 初始生成第一关阵容
    const ally = generateAllyTeam(1);
    const enemy = generateEnemyTeam(1);
    window._battleEvents = [];
    window._currentBattleState = { ally, enemy };
    const allUnits = [...ally.map(u => ({...u, camp:'ally'})), ...enemy.map(u => ({...u, camp:'enemy'}))];
    store = createStore({ units: allUnits, round:0, phase:'ready', winner:null, lastEntry:null }, battleReducer);
    store.subscribe(() => renderAll());
    renderAll();

    console.log('✅ 响应式架构 V1.0 已加载（原版UI）');
    console.log('引擎：core/06battle-engine-core.js V4.0.2（原样复用）');
  } catch(e) { console.error('❌ init error:', e.message, e.stack); }
})();
