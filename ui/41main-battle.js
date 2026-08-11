﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// ui/41main-battle.js - 光明顶5v5 战斗初始化
// V5.3.3 | 2026-08-05 精英出场率改为80%/15%/5% + ELITE_RATE加权选人
export const VER = 'ui/41main-battle.js V5.4.0';

import { CONFIG, ENEMY_M } from '../core/01config-5v5-test.js';
import { Unit } from '../core/02unit.js';
import { rand } from '../core/03battle-utils.js';
import { SeededRNG } from '../core/07-rng.js';
import { addPermanentBuff } from '../modules/23elite-skills.js';
import { updateUI, clearLogExceptFirst } from './14ui-render-5v5-test.js';
import { showModal } from './12main-utils.js';

const C = CONFIG;
const ALL_BUFF_KEYS = Object.keys(C.BUFFS);

// ==================== 阵容生成 ====================
export function doInitBattle(currentStage, UI, snapshot, activeBuffs, selectedBuffIndex, currentDoubleStrikeUid) {
    if (!UI || !snapshot) return;
    // 确定性 RNG：确保 init() 属性分配具有确定性，回放时可复现
    const _rng = snapshot._rngSeed ? new SeededRNG(snapshot._rngSeed) : new SeededRNG(Date.now());
    const _rand = (min, max) => _rng.nextInt(min, max);
    let allyTeam = [], enemyTeam = [];
    const mingSquadTemplate = C.MING_SQUADS && C.MING_SQUADS[currentStage] ? C.MING_SQUADS[currentStage] : null;
    const elitePower = C.ELITE_POWER || {};
    const eliteRate = C.ELITE_RATE || {};
    const normalPower = C.NORMAL_POWER || {};
    const targetPower = C.MING_TARGET_POWER && C.MING_TARGET_POWER[currentStage] ? C.MING_TARGET_POWER[currentStage] : null;

    // 精英出场率：80%一个、15%两个、5%三个，按 ELITE_RATE 权重选人
    // 精英先占坑，剩余位置和预算给普通兵
    const eliteConfigs = [
        { name: '张无忌', m: 115, role: '远程', isZhang: true, power: elitePower['张无忌'] || 140 },
        { name: '韦一笑', m: 107, role: '飞行', isWei: true, power: elitePower['韦一笑'] || 120 },
        { name: '小昭', m: 107, role: '远程', isXiaoZhaoBrother: true, power: elitePower['小昭'] || 135 }
    ];
    const eliteRoll = _rng.next();
    let eliteCount;
    if (eliteRoll < 0.05) {
        eliteCount = 3;
    } else if (eliteRoll < 0.20) {
        eliteCount = 2;
    } else if (eliteRoll < 0.80) {
        eliteCount = 1;
    } else {
        eliteCount = 0;
    }

    let usedPower = 0;

    // 强制精英模式：张无忌/韦一笑独立覆盖
    const forceZhang = GlobalStore.get('forceZhang') || localStorage.getItem('_forceZhang') === '1';
    const forceWei = GlobalStore.get('forceWei') || localStorage.getItem('_forceWei') === '1';
    if (forceZhang || forceWei) {
        // 重置精英计数器，强制覆盖
        eliteCount = Math.max(eliteCount, 1);
        // 从 eliteConfigs 中找到对应精英配置
        if (forceZhang) {
            const cfg = eliteConfigs.find(c => c.name === '张无忌');
            if (cfg && !allyTeam.some(u => u.name === '张无忌')) {
                let unit = new Unit(cfg.name, cfg.m, cfg.role, 'ally');
                unit.isZhang = true;
                unit.init(_rng); unit.applyBonus();
                unit.pos = null;
                allyTeam.push(unit);
                usedPower += cfg.power;
            }
        }
        if (forceWei) {
            const cfg = eliteConfigs.find(c => c.name === '韦一笑');
            if (cfg && !allyTeam.some(u => u.name === '韦一笑')) {
                let unit = new Unit(cfg.name, cfg.m, cfg.role, 'ally');
                unit.isWei = true;
                unit.init(_rng); unit.applyBonus();
                unit.pos = null;
                allyTeam.push(unit);
                usedPower += cfg.power;
            }
        }
        // 清理标记，防止影响后续战斗
        // 不清理标记，选关后仍可强制精英出场
    }

    if (eliteCount > 0 && !forceZhang && !forceWei) {
        const picked = [];
        const pool = [...eliteConfigs];
        // 加权抽取：按 ELITE_RATE 权重选精英，不重复
        function weightedPick(arr) {
            const total = arr.reduce((s, c) => s + (eliteRate[c.name] || 1 / arr.length), 0);
            let r = _rng.next() * total;
            for (let i = 0; i < arr.length; i++) {
                r -= (eliteRate[arr[i].name] || 1 / arr.length);
                if (r <= 0) return i;
            }
            return arr.length - 1;
        }
        if (eliteCount === 3) {
            picked.push(...pool);
        } else if (eliteCount === 2) {
            const i1 = weightedPick(pool);
            const rest = pool.filter((_, i) => i !== i1);
            const i2 = weightedPick(rest);
            picked.push(pool[i1], rest[i2]);
        } else {
            picked.push(pool[weightedPick(pool)]);
        }

        // 精英直接占坑
        for (const c of picked) {
            let unit = new Unit(c.name, c.m, c.role, 'ally');
            if (c.isZhang) unit.isZhang = true;
            if (c.isWei) unit.isWei = true;
            if (c.isXiaoZhaoBrother) {
                if (_rng.next() < 0.5) { unit.isXiaoZhaoSister = true; }
                else { unit.isXiaoZhaoBrother = true; }
                unit.initXiaoZhao(); unit.applyBonus();
                unit._baseMaxHp = unit.maxHp; unit._baseAtk = unit.atk; unit._baseDef = unit.def;
            } else {
                unit.init(_rng); unit.applyBonus();
            }
            unit.pos = null;
            allyTeam.push(unit);
            usedPower += c.power;
        }
    }

    // 普通兵候选池
    const candidatePool = [];
    for (const [name, m] of Object.entries(C.MING_M)) {
        if (['张无忌','韦一笑','小昭'].includes(name)) continue;
        if (m >= 95 && m <= 104) candidatePool.push({ name, m, role: null, power: normalPower[m] || 90 });
    }
    candidatePool.sort((a, b) => a.power - b.power);

    const remainingCandidates = [...candidatePool];
    let remainingPower = (targetPower || 500) - usedPower;
    let remainingSlots = 5 - allyTeam.length;
    for (let slot = 0; slot < remainingSlots; slot++) {
        const avgPower = remainingSlots > 0 ? remainingPower / remainingSlots : 90;
        const candidates = [];
        const above = remainingCandidates.filter(c => c.power >= avgPower).sort((a, b) => a.power - b.power).slice(0, 3);
        const below = remainingCandidates.filter(c => c.power < avgPower).sort((a, b) => b.power - a.power).slice(0, 2);
        candidates.push(...above);
        for (const c of below) { if (!candidates.some(x => x.name === c.name)) candidates.push(c); }
        if (candidates.length === 0) candidates.push(...remainingCandidates.slice(0, 5));
        const pick = candidates[_rand(0, candidates.length - 1)];
        const idx = remainingCandidates.findIndex(c => c.name === pick.name);
        if (idx >= 0) remainingCandidates.splice(idx, 1);
        const role = C.ROLES[_rand(0, 3)];
        const unit = new Unit(pick.name, pick.m, role, 'ally');
        unit.init(_rng); unit.applyBonus();
        unit.pos = null;
        allyTeam.push(unit);
        remainingPower -= pick.power;
    }

    // 强制小昭模式：如有小昭则修正标志，如无则添加
    const forceXzMode = GlobalStore.get('forceXiaoZhao');
    if (forceXzMode === 'sister' || forceXzMode === 'brother') {
        const existingXz = allyTeam.find(u => u.isXiaoZhaoSister || u.isXiaoZhaoBrother);
        if (existingXz) {
            // 场上已有小昭，直接修正标志
            existingXz.isXiaoZhaoSister = (forceXzMode === 'sister');
            existingXz.isXiaoZhaoBrother = (forceXzMode === 'brother');
        } else {
            // 场上没有小昭，新增一个
            const swappable = allyTeam.find(u => !u.isZhang && !u.isWei);
            if (swappable) {
                allyTeam.splice(allyTeam.indexOf(swappable), 1);
                remainingPower += (normalPower[swappable.m] || 90);
            }
            let xzUnit = new Unit('小昭', 107, C.ROLES[_rand(0, 3)], 'ally');
            xzUnit.isXiaoZhaoSister = (forceXzMode === 'sister');
            xzUnit.isXiaoZhaoBrother = (forceXzMode === 'brother');
            xzUnit.initXiaoZhao(); xzUnit.applyBonus();
            xzUnit._baseMaxHp = xzUnit.maxHp; xzUnit._baseAtk = xzUnit.atk; xzUnit._baseDef = xzUnit.def;
            xzUnit.pos = swappable ? swappable.pos : null;
            allyTeam.push(xzUnit);
            remainingPower -= (elitePower['小昭'] || 140);
        }
    }

    // 至少一个前排
    if (!allyTeam.some(u => u.role === '防战' || u.role === '战士')) {
        const nonFixed = allyTeam.filter(u => !u.isZhang && !u.isWei && !u.isXiaoZhaoSister && !u.isXiaoZhaoBrother);
        if (nonFixed.length > 0) {
            nonFixed[0].role = _rand(0, 1) === 0 ? '防战' : '战士';
            nonFixed[0].init(_rng); nonFixed[0].applyBonus();
        }
    }

    // 站位
    const takenPos = new Set();
    let zhang = allyTeam.find(u => u.isZhang);
    let wei = allyTeam.find(u => u.isWei);
    let xz = allyTeam.find(u => u.isXiaoZhaoSister || u.isXiaoZhaoBrother);
    if (zhang) { zhang.pos = 5; takenPos.add(5); }
    if (wei) { wei.pos = 6; takenPos.add(6); }
    if (xz) { xz.pos = 4; takenPos.add(4); }
    let others = allyTeam.filter(u => !u.isZhang && !u.isWei && !u.isXiaoZhaoSister && !u.isXiaoZhaoBrother);
    if (others.length > 0 && zhang && !takenPos.has(2)) { others[0].pos = 2; takenPos.add(2); others.shift(); }
    let emptySlots = [1,2,3,4,5,6,7,8,9].filter(p => !takenPos.has(p));
    for (let u of others) {
        if (emptySlots.length > 0) { let idx = _rand(0, emptySlots.length - 1); u.pos = emptySlots[idx]; takenPos.add(emptySlots[idx]); emptySlots.splice(idx, 1); }
        else { u.pos = 5; }
    }
    let toLock = [zhang, wei, xz].filter(Boolean);
    while (toLock.length < 3) { let pool = allyTeam.filter(u => !toLock.includes(u)); if (pool.length === 0) break; let pick = pool[_rand(0, pool.length - 1)]; toLock.push(pick); }
    toLock.forEach(u => { u.fixed = true; });

    // ==================== 六大派阵容生成 ====================
    const enemySquad = C.ENEMY_SQUADS && C.ENEMY_SQUADS[currentStage] ? C.ENEMY_SQUADS[currentStage] : null;
    let enemyUnits = [];
    const usedEnemyNames = [];

    if (enemySquad) {
        let enemyPosSet = new Set();
        let xuanmingPairCount = 0;
        for (let item of enemySquad) {
            if (typeof item === 'object' && item.name) {
                let unit = new Unit(item.name, item.m, item.role, 'enemy');
                unit.pos = null; unit.init(_rng); unit.applyBonus();
                enemyUnits.push(unit);
                usedEnemyNames.push(item.name);
                if (item.name === '鹿杖客' || item.name === '鹤笔翁') xuanmingPairCount++;
            } else {
                let mVal = item;
                let pool = Object.entries(ENEMY_M).filter(([n, v]) => v === mVal);
                let name = null;
                const squadDefs = Object.values(C.ENEMY_SQUADS).flat();
                for (let def of squadDefs) { if (typeof def === 'object' && def.m === mVal && !usedEnemyNames.includes(def.name)) { name = def.name; break; } }
                if (!name && pool.length > 0) {
                    let attempts = 0;
                    while ((!name || usedEnemyNames.includes(name)) && attempts < 50) { let pick = pool[_rand(0, pool.length - 1)]; name = pick[0]; attempts++; }
                }
                if (!name) {
                    // 兜底名字加序号，避免重名
                    const fallbackSects = ['少林弟子', '武当弟子', '峨眉弟子', '昆仑弟子', '崆峒弟子'];
                    const fallbackName = fallbackSects[_rand(0, fallbackSects.length - 1)];
                    const existingCount = usedEnemyNames.filter(n => n.startsWith(fallbackName)).length;
                    name = fallbackName + (existingCount > 0 ? String(existingCount + 1) : '');
                }
                let role = C.ROLES[_rand(0, 3)];
                let unit = new Unit(name, mVal, role, 'enemy');
                unit.pos = null; unit.init(_rng); unit.applyBonus();
                enemyUnits.push(unit);
                usedEnemyNames.push(name);
            }
        }
        if (currentStage === 5 && xuanmingPairCount === 2) {
            let extraM = 104;
            let pool = Object.entries(ENEMY_M).filter(([n, v]) => v === extraM);
            let usedNames = enemyUnits.map(u => u.name);
            let name = null;
            while ((!name || usedNames.includes(name)) && pool.length > 0) {
                let pick = pool[_rand(0, pool.length - 1)];
                name = pick[0];
                if (usedNames.includes(name)) { name = null; pool.splice(pool.indexOf(pick), 1); }
            }
            if (!name) {
                const fallbackSects = ['少林弟子', '武当弟子', '峨眉弟子', '昆仑弟子', '崆峒弟子'];
                const fallbackName = fallbackSects[_rand(0, fallbackSects.length - 1)];
                const existingCount = usedEnemyNames.filter(n => n.startsWith(fallbackName)).length;
                name = fallbackName + (existingCount > 0 ? String(existingCount + 1) : '');
            }
            let role = C.ROLES[_rand(0, 3)];
            let extraUnit = new Unit(name, extraM, role, 'enemy');
            extraUnit.init(); extraUnit.applyBonus();
            enemyUnits.push(extraUnit);
        }
        let allUnits = [...enemyUnits];
        let template = C.ENEMY_POS_TEMPLATES && C.ENEMY_POS_TEMPLATES[currentStage] ? C.ENEMY_POS_TEMPLATES[currentStage] : null;
        let eliteUnits = allUnits.filter(u => C.ELITE_POOL && C.ELITE_POOL[currentStage] && C.ELITE_POOL[currentStage].some(e => e.name === u.name));
        let normalUnits = allUnits.filter(u => !eliteUnits.includes(u));
        if (template) {
            let roleCounts = { '战士': 0, '防战': 0, '远程': 0, '飞行': 0 };
            normalUnits.forEach(u => { if (roleCounts[u.role] !== undefined) roleCounts[u.role]++; });
            let templateNeeds = {};
            for (let [role, poses] of Object.entries(template)) { if (role === 'random') continue; templateNeeds[role] = poses.length; }
            for (let role of ['防战', '远程', '飞行', '战士']) {
                let need = templateNeeds[role] || 0;
                let current = roleCounts[role] || 0;
                let shortage = need - current;
                if (shortage > 0) {
                    let others = normalUnits.filter(u => u.role !== role && (templateNeeds[u.role] || 0) < (roleCounts[u.role] || 0));
                    for (let i = 0; i < Math.min(shortage, others.length); i++) { roleCounts[others[i].role]--; others[i].role = role; roleCounts[role]++; }
                }
            }
            normalUnits.forEach(u => { u.init(_rng); u.applyBonus(); });
        }
        if (template) {
            for (let [role, poses] of Object.entries(template)) {
                if (role === 'random') continue;
                for (let pos of poses) {
                    let unit = normalUnits.find(u => u.role === role && u.pos == null);
                    if (unit && !enemyPosSet.has(pos)) { unit.pos = pos; unit._originalPos = pos; enemyPosSet.add(pos); }
                }
            }
        }
        const zhou = eliteUnits.find(u => u.name === '周芷若');
        const song = eliteUnits.find(u => u.name === '宋青书');
        if (zhou && zhou.pos == null) {
            const zhouPriority = [2, 3, 4, 5, 6, 7, 8, 9];
            let placed = false;
            for (const p of zhouPriority) { if (!enemyPosSet.has(p)) { zhou.pos = p; zhou._originalPos = p; enemyPosSet.add(p); placed = true; break; } }
            if (!placed) { let displaced = normalUnits.find(u => u.pos === 2); if (displaced) { displaced.pos = null; displaced._originalPos = -1; } zhou.pos = 2; zhou._originalPos = 2; enemyPosSet.add(2); }
        }
        if (song && song.pos == null) {
            const zhouPos = zhou ? zhou.pos : 0;
            let placed = false;
            for (let p = zhouPos + 1; p <= 9; p++) { if (!enemyPosSet.has(p)) { song.pos = p; song._originalPos = p; enemyPosSet.add(p); placed = true; break; } }
            if (!placed) { for (let p = 1; p <= 9; p++) { if (!enemyPosSet.has(p)) { song.pos = p; song._originalPos = p; enemyPosSet.add(p); placed = true; break; } } }
            if (!placed) { let backPos = zhouPos + 1; if (backPos <= 9) { let displaced = normalUnits.find(u => u.pos === backPos); if (displaced) { displaced.pos = null; displaced._originalPos = -1; } song.pos = backPos; song._originalPos = backPos; enemyPosSet.add(backPos); } }
        }
        const otherElites = eliteUnits.filter(u => u !== zhou && u !== song && u.pos == null);
        for (let u of otherElites) {
            let priority;
            if (u.name === '成昆') priority = [1, 2, 3, 4, 5, 6, 7, 8, 9];
            else if (u.name === '鹿杖客') priority = [7, 8, 9, 4, 5, 6, 1, 2, 3];
            else if (u.name === '鹤笔翁') priority = [3, 4, 5, 6, 7, 8, 9, 1, 2];
            else priority = [1, 2, 3, 4, 5, 6, 7, 8, 9];
            for (const p of priority) { if (!enemyPosSet.has(p)) { u.pos = p; u._originalPos = p; enemyPosSet.add(p); break; } }
            if (u.pos == null) { let p = priority[0]; let displaced = normalUnits.find(u2 => u2.pos === p); if (displaced) { displaced.pos = null; displaced._originalPos = -1; } u.pos = p; u._originalPos = p; enemyPosSet.add(p); }
        }
        let unplacedNormals = normalUnits.filter(u => u.pos == null);
        let emptySlots = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(p => !enemyPosSet.has(p));
        for (let u of unplacedNormals) { if (emptySlots.length > 0) { let idx = _rand(0, emptySlots.length - 1); u.pos = emptySlots[idx]; u._originalPos = u.pos; enemyPosSet.add(emptySlots[idx]); emptySlots.splice(idx, 1); } }
        enemyTeam = allUnits;
    }

    snapshot.ally = allyTeam.map(u => Object.freeze(u.clone()));
    snapshot.enemy = enemyTeam.map(u => Object.freeze(u.clone()));
    UI.allyTeam = allyTeam.map(u => u.clone());
    UI.enemyTeam = enemyTeam.map(u => u.clone());
    UI.currentResult = null;
    UI.round = 0;
    GlobalStore.set('battleHasZhang', allyTeam.some(u => u.isZhang));
    window._lastBattleSeed = Date.now();
    snapshot._rngSeed = _rng.getState();
    let stageText = currentStage === 1 ? '第一关' : `第${currentStage}关`;
    document.getElementById('labelEnemy').textContent = `六大派\n${stageText}`;
    document.getElementById('labelAlly').textContent = '明 教';
    updateUI();
}// ==================== Buff 选择 ====================
/**
 * 弹窗选择姐姐附身方向
 * @param {function} callback - 选完后调用，参数 'right' 或 'left'
 */
export function showFlyDirectionPopup(callback) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'flyDirectionModalOverlay';

    const box = document.createElement('div');
    box.className = 'modal-box';
    box.style.cssText = 'max-width:340px;background:#1a1a2e;color:#eee;padding:20px;position:relative;';

    const title = document.createElement('div');
    title.textContent = '🦋 姐姐附身方向';
    title.style.cssText = 'color:#ffd700;font-size:16px;font-weight:bold;margin-bottom:12px;text-align:center;';
    box.appendChild(title);

    const desc = document.createElement('div');
    desc.textContent = '选择本回合蝴蝶飞行方向';
    desc.style.cssText = 'color:#aaa;font-size:12px;margin-bottom:16px;text-align:center;';
    box.appendChild(desc);

    const btnDiv = document.createElement('div');
    btnDiv.style.cssText = 'display:flex;gap:10px;justify-content:center;';

    const btnLeft = document.createElement('button');
    btnLeft.textContent = '🦋 向左飞\n（防+血）';
    btnLeft.style.cssText = 'flex:1;padding:12px;border-radius:8px;border:2px solid #ff69b4;background:#2a2a4e;color:#ff69b4;font-size:13px;cursor:pointer;white-space:pre-line;';
    btnLeft.onclick = () => {
        document.body.removeChild(overlay);
        callback('left');
    };

    const btnRight = document.createElement('button');
    btnRight.textContent = '🦋 向右飞\n（攻+血）';
    btnRight.style.cssText = 'flex:1;padding:12px;border-radius:8px;border:2px solid #ffd700;background:#2a2a4e;color:#ffd700;font-size:13px;cursor:pointer;white-space:pre-line;';
    btnRight.onclick = () => {
        document.body.removeChild(overlay);
        callback('right');
    };

    btnDiv.appendChild(btnLeft);
    btnDiv.appendChild(btnRight);
    box.appendChild(btnDiv);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

export function createBuffObject(key, duration) {
    const buff = { key, target: 'ally', remaining: duration, name: CONFIG.BUFFS[key]?.name || key };
    if (key === 'holyFlame') {
        const cols = [];
        while (cols.length < 2) { const c = rand(1, 3); if (!cols.includes(c)) cols.push(c); }
        cols.sort((a, b) => a - b);
        const rows = [];
        while (rows.length < 2) { const r = rand(1, 3); if (!rows.includes(r)) rows.push(r); }
        rows.sort((a, b) => a - b);
        buff.cols = cols;
        buff.rows = rows;
    }
    return buff;
}

export function generateBuffChoices(activeBuffs, allyTeam = []) {
    let activeBuffKeys = activeBuffs.map(b => b.key);
    let available = ALL_BUFF_KEYS.filter(k => {
        if (activeBuffKeys.includes(k)) return false;
        // 严阵以待：首次选海克斯不出现，必须3回合后
        if (k === 'fortify' && !activeBuffs.some(b => b.remaining > 0)) return false;
        const requiredRole = C.BUFF_ROLE_REQUIREMENTS[k];
        if (requiredRole && !allyTeam.some(u => u.alive && u.role === requiredRole)) return false;
        return true;
    });
    let shuffled = [...available].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, C.BUFF_CHOICES);
}

export function showBuffSelection(callback, activeBuffs, selectedBuffIndex, updateBuffSlotsFn, updateUIFn, autoScrollLogFn, allyTeam) {
    // 如果传入的 allyTeam 无效，从全局状态重新获取
    if (!allyTeam || !allyTeam.length || !allyTeam.some(u => u.alive)) {
        const ctx = window._getPlayerContext?.();
        allyTeam = ctx?.UI?.allyTeam || [];
    }
    const allKeys = Object.keys(C.BUFFS || {});
    const existingKeys = activeBuffs.map(b => b.key);
    const available = allKeys.filter(k => !existingKeys.includes(k));
    const choices = (GlobalStore.get('bugMode'))
        ? available
        : generateBuffChoices(activeBuffs, allyTeam);
    const text = '选择 Buff（持续 ' + C.BUFF_DURATION + ' 回合）';
    const buttons = choices.map(key => ({
        text: (C.BUFFS[key]?.icon || '?') + ' ' + (C.BUFFS[key]?.name || key) + '\n' + (C.BUFFS[key]?.desc || ''),
        value: key,
        cls: 'buff'
    }));
    showModal(text, buttons, (key) => {
        let duration = C.BUFFS[key].duration || C.BUFF_DURATION;
        if (activeBuffs.length >= 2) {
            let shortest = activeBuffs.reduce((a, b) => a.remaining < b.remaining ? a : b);
            activeBuffs.splice(activeBuffs.indexOf(shortest), 1);
        }
        // 圣火令仅作为标记，实际行列由回合引擎每回合生成
        activeBuffs.push(createBuffObject(key, duration));
        // 小昭永久海克斯存储
        if (allyTeam) {
            const xiaoZhao = allyTeam.find(u => u.isXiaoZhao);
            if (xiaoZhao) {
                addPermanentBuff(xiaoZhao, key, C.BUFFS[key].name, {});
            }
        }
        updateBuffSlotsFn();
        let logDiv = document.getElementById('log');
        if (logDiv) { logDiv.innerHTML += `<span class="gold">✨ 获得Buff：${C.BUFFS[key].name}（持续${duration}回合）</span><br>`; autoScrollLogFn(); }
        if (window._updateGlowColors) window._updateGlowColors(selectedBuffIndex);
        updateUIFn();
        callback();
    }, true, false);
}

export function showBugModeBuffSelection(callback, activeBuffs, selectedBuffIndex, updateBuffSlotsFn, updateUIFn, autoScrollLogFn, allyTeam) {
    const allKeys = Object.keys(C.BUFFS || {});
    const existingKeys = activeBuffs.map(b => b.key);
    const available = allKeys.filter(k => !existingKeys.includes(k));
    const choices = available;
    const text = '选择 Buff（持续 ' + C.BUFF_DURATION + ' 回合） [Bug模式]';
    const buttons = choices.map(key => ({
        text: (C.BUFFS[key]?.icon || '?') + ' ' + (C.BUFFS[key]?.name || key) + '\n' + (C.BUFFS[key]?.desc || ''),
        value: key,
        cls: 'buff'
    }));
    showModal(text, buttons, (key) => {
        let duration = C.BUFFS[key].duration || C.BUFF_DURATION;
        if (activeBuffs.length >= 2) {
            let shortest = activeBuffs.reduce((a, b) => a.remaining < b.remaining ? a : b);
            activeBuffs.splice(activeBuffs.indexOf(shortest), 1);
        }
        activeBuffs.push(createBuffObject(key, duration));
        if (allyTeam) {
            const xiaoZhao = allyTeam.find(u => u.isXiaoZhao);
            if (xiaoZhao) {
                addPermanentBuff(xiaoZhao, key, C.BUFFS[key].name, {});
            }
        }
        updateBuffSlotsFn();
        let logDiv = document.getElementById('log');
        if (logDiv) { logDiv.innerHTML += `<span class="gold">✨ 获得Buff：${C.BUFFS[key].name}（持续${duration}回合）</span><br>`; autoScrollLogFn(); }
        if (window._updateGlowColors) window._updateGlowColors(selectedBuffIndex);
        updateUIFn();
        callback();
    }, true, false);
}

// ==================== Buff 槽 ====================


export function tickBuffDurations(activeBuffs, selectedBuffIndex, updateBuffSlotsFn) {
    activeBuffs = activeBuffs.map(b => ({...b, remaining: b.remaining - 1})).filter(b => b.remaining > 0);
    if (selectedBuffIndex >= activeBuffs.length) selectedBuffIndex = -1;
    updateBuffSlotsFn();
    return { activeBuffs, selectedBuffIndex };
}

export function getActiveBuffList(activeBuffs) {
    return activeBuffs.map(b => b.name + '(' + b.remaining + '回)').join('、') || '无';
}

// ==================== 战斗日志 ====================
export function logTeamInfo(label, UI, gs, battleResultForInfo, activeBuffs, hasLoggedTeam) {
    let ally = UI.allyTeam, enemy = UI.enemyTeam;
    if (!ally.length || !enemy.length) return;
    let logDiv = document.getElementById('log');
    let appendDiv = (html) => { let d = document.createElement('div'); d.innerHTML = html + '<br>'; logDiv.appendChild(d); };
    let lbl = label || '阵容详情', contextNote = '';
    if (gs === 'RUNNING' || gs === 'PAUSED') contextNote = `（当前：第${UI.round||'?'}回合${gs==='PAUSED'?' 已暂停':''}）`;
    else if (gs === 'GAMEOVER') contextNote = '（当前：战斗已结束）';
    else contextNote = '（当前：准备阶段）';
    appendDiv(`<div class="separator">📋 ${lbl} ${contextNote}</div>`);
    appendDiv(`<span class="gold">[Buff: ${getActiveBuffList(activeBuffs)}]</span>`);
    let hasStats = (gs === 'GAMEOVER' && battleResultForInfo) || gs === 'RUNNING' || gs === 'PAUSED';
    [
        {name:'明教', color:'blue', data:ally},
        {name:'六大派', color:'orange', data:enemy}
    ].forEach(camp => {
        appendDiv(`<span class="${camp.color}">【${camp.name}】</span>`);
        camp.data.forEach(u => {
            let aliveText = u.alive ? '存活' : '💀阵亡';
            let displayPos = u.pos === -1 ? (u._originalPos || '?') : u.pos;
            let infoParts = [
                `${u.name}(${u.role} M${u.m})`,
                u.isHorse ? '[拒马]' : '',
                `站位${displayPos}`,
                `攻${Math.floor(u.atk)} 防${Math.floor(u.def)}`,
                `血${Math.floor(u.hp)}/${Math.floor(u.maxHp)}`,
                aliveText,
                u.isZhang ? '[无忌]' : '',
                u.isWei ? '[韦一笑]' : ''
            ].filter(Boolean);
            appendDiv('  ' + infoParts.join(' '));
            let statParts = [];
            if (hasStats) {
                if (u.dmgDealt !== undefined && u.dmgDealt > 0) statParts.push(`输出${u.dmgDealt}`);
                if (u.dmgTaken !== undefined && u.dmgTaken > 0) statParts.push(`承伤${u.dmgTaken}`);
            }
            if (u.dodgeCount > 0) statParts.push(`闪避${u.dodgeCount}次`);
            if (u.healDone > 0) statParts.push(`治疗${u.healDone}`);
            if (u.reboundDone > 0) statParts.push(`反弹${u.reboundDone}`);
            if (u.leechDone > 0) statParts.push(`吸血${u.leechDone}`);
            if (u.critCount > 0) statParts.push(`暴击${u.critCount}次`);
            if (u.survivedRounds > 0) statParts.push(`存活${u.survivedRounds}回合`);
            if (statParts.length > 0) appendDiv('    └ ' + statParts.join(' | '));
        });
    });
    logDiv.scrollTop = logDiv.scrollHeight;
    return true;
}

// ==================== 中止 ====================
export function abortAll(abortController, UI, waitingForNextRound, isBattleStarting, adjustMode, selectedAdjustPos, activeBuffs, selectedBuffIndex, currentDoubleStrikeUid, updateBuffSlotsFn) {
    if (abortController) { abortController.abort(); abortController = null; }
    window._fastForwardActive = false;  // 重置快进标志，防止弹幕被跳过
    UI.currentResult = null;
    waitingForNextRound = false;
    isBattleStarting = false;
    adjustMode = false;
    selectedAdjustPos = null;
    activeBuffs = [];
    selectedBuffIndex = -1;
    currentDoubleStrikeUid = null;
    // 清理所有单位的视觉标记，防止战斗重置后 UI 残留 _flash / _isDead 等状态
    [UI.allyTeam, UI.enemyTeam].forEach(team => {
        team.forEach(u => {
            u._flash = null;
            u.state._acted = false;
            u.state._resting = false;
            u.state._blocked = false;
            u.state._isDead = false;
            u.alive = true;
            u.hp = u.maxHp;
            u.state._stunned = false;
        });
    });
    updateBuffSlotsFn();
    return { abortController, waitingForNextRound, isBattleStarting, adjustMode, selectedAdjustPos, activeBuffs, selectedBuffIndex, currentDoubleStrikeUid };
}