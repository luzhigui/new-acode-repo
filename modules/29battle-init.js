// modules/29battle-init.js - 光明顶5v5 战斗初始化逻辑（从 ui/65main-battle.js 抽离）
// V5.5.0 | ~8000 bytes| 2026-08-14 抽离 doInitBattle 纯逻辑部分，消除 ui→modules 依赖中不该在 ui 层的业务逻辑
export const VER = 'modules/29battle-init.js V5.5.0';

import { CONFIG, ENEMY_M } from '../core/01config-5v5-test.js';
import { Unit } from '../core/02unit.js';
import { GlobalStore } from '../modules/23global-store.js';

const C = CONFIG;

// 战斗-初始化：生成明教+六大派阵容（纯逻辑，无 DOM）
export function initBattleTeams(currentStage, _rng) {
    const _rand = (min, max) => _rng.nextInt(min, max);
    let allyTeam = [], enemyTeam = [];
    const mingSquadTemplate = C.MING_SQUADS && C.MING_SQUADS[currentStage] ? C.MING_SQUADS[currentStage] : null;
    const elitePower = C.ELITE_POWER || {};
    const eliteRate = C.ELITE_RATE || {};
    const normalPower = C.NORMAL_POWER || {};
    const targetPower = C.MING_TARGET_POWER && C.MING_TARGET_POWER[currentStage] ? C.MING_TARGET_POWER[currentStage] : null;

    // 精英出场率：80%一个、15%两个、5%三个，按 ELITE_RATE 权重选人
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
        eliteCount = Math.max(eliteCount, 1);
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
    }

    if (eliteCount > 0 && !forceZhang && !forceWei) {
        const picked = [];
        const pool = [...eliteConfigs];
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

        for (const c of picked) {
            let unit = new Unit(c.name, c.m, c.role, 'ally');
            if (c.isZhang) unit.isZhang = true;
            if (c.isWei) unit.isWei = true;
            if (c.isXiaoZhaoBrother) {
                if (_rng.next() < 0.5) { unit.isXiaoZhaoSister = true; }
                else { unit.isXiaoZhaoBrother = true; }
                unit.name = unit.isXiaoZhaoSister ? '小昭·姊' : '小昭·妹';
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
            existingXz.isXiaoZhaoSister = (forceXzMode === 'sister');
            existingXz.isXiaoZhaoBrother = (forceXzMode === 'brother');
            existingXz.name = existingXz.isXiaoZhaoSister ? '小昭·姊' : '小昭·妹';
        } else {
            const swappable = allyTeam.find(u => !u.isZhang && !u.isWei);
            if (swappable) {
                allyTeam.splice(allyTeam.indexOf(swappable), 1);
                remainingPower += (normalPower[swappable.m] || 90);
            }
            let xzUnit = new Unit('小昭', 107, C.ROLES[_rand(0, 3)], 'ally');
            xzUnit.isXiaoZhaoSister = (forceXzMode === 'sister');
            xzUnit.isXiaoZhaoBrother = (forceXzMode === 'brother');
            xzUnit.name = xzUnit.isXiaoZhaoSister ? '小昭·姊' : '小昭·妹';
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
    for (let i = emptySlots.length - 1; i > 0; i--) {
        const j = _rng.nextInt(0, i);
        [emptySlots[i], emptySlots[j]] = [emptySlots[j], emptySlots[i]];
    }
    for (let u of others) {
        if (emptySlots.length > 0) { u.pos = emptySlots.shift(); takenPos.add(u.pos); }
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
            extraUnit.init(_rng); extraUnit.applyBonus();
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
        let emptyEnemySlots = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(p => !enemyPosSet.has(p));
        for (let u of unplacedNormals) { if (emptyEnemySlots.length > 0) { let idx = _rand(0, emptyEnemySlots.length - 1); u.pos = emptyEnemySlots[idx]; u._originalPos = u.pos; enemyPosSet.add(emptyEnemySlots[idx]); emptyEnemySlots.splice(idx, 1); } }
        enemyTeam = allUnits;
    }

    return { allyTeam, enemyTeam };
}