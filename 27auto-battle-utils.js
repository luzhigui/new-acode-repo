// 27auto-battle-utils.js - 自动批量战斗工具函数 (V3.0 定制阵容)
// 预估行数: 120, 发送时间: 20260621 08:00, 版本: V3.0.0
export const VER = '27auto-battle-utils.js V3.0.0';

import { CONFIG, ENEMY_M } from './01config-5v5-test.js';
import { Unit, rand, runBattle } from './07battle-engine-5v5-test.js';
const C = CONFIG;

// 纯数据快照生成器
export function generateSnapshot(currentStage = 1) {
    const PARTY_SIZE = 5;
    let allyTeam = [], enemyTeam = [];
    const mingSquad = C.MING_SQUADS && C.MING_SQUADS[currentStage] ? C.MING_SQUADS[currentStage] : null;
    const enemySquad = C.ENEMY_SQUADS && C.ENEMY_SQUADS[currentStage] ? C.ENEMY_SQUADS[currentStage] : null;

    // --- 明教 ---
    if (mingSquad) {
        let mingConfig;
        if (currentStage === 1 && Array.isArray(mingSquad[0])) {
            mingConfig = mingSquad[rand(0, mingSquad.length - 1)];
        } else {
            mingConfig = mingSquad;
        }
        // 确保 mingConfig 是数组
        if (!Array.isArray(mingConfig)) {
            mingConfig = [mingConfig];
        }
        let takenPos = new Set();
        for (let item of mingConfig) {
            let name, mVal;
            if (typeof item === 'string') {
                name = item;
                mVal = C.MING_M[name] || 95;
            } else {
                mVal = item;
                // 明教弟子统一用带编号的格式
                if (mVal === 95) {
                    const existingDisciples = allyTeam.filter(u => u.name && u.name.startsWith('明教弟子'));
                    name = '明教弟子' + (existingDisciples.length + 1);
                } else {
                    // 按 M 值查找名字，排除已使用的
                    const usedNames = allyTeam.map(u => u.name);
                    const candidates = Object.entries(C.MING_M).filter(([n, v]) => v === mVal && !usedNames.includes(n));
                    if (candidates.length > 0) {
                        name = candidates[rand(0, candidates.length - 1)][0];
                    } else {
                        const allCandidates = Object.entries(C.MING_M).filter(([n, v]) => v === mVal);
                        name = allCandidates.length > 0 ? allCandidates[rand(0, allCandidates.length - 1)][0] : ('明教弟子' + (allyTeam.length + 1));
                    }
                }
            }
            if (!name) name = '明教弟子' + (allyTeam.length + 1);
            if (!mVal) mVal = 95;
            let role = name === '张无忌' ? '远程' : (name === '韦一笑' ? '飞行' : C.ROLES[rand(0, 3)]);
            let unit = new Unit(name, mVal, role, 'ally');
            if (name === '张无忌') unit.isZhang = true;
            if (name === '韦一笑') unit.isWei = true;
            unit.pos = null;
            unit.init(); unit.applyBonus();
            allyTeam.push(unit);
        }
        let zhang = allyTeam.find(u => u.isZhang);
        let wei = allyTeam.find(u => u.isWei);
        if (zhang) { zhang.pos = 5; zhang.fixed = true; takenPos.add(5); }
        if (wei) { wei.pos = 6; wei.fixed = true; takenPos.add(6); }
        let others = allyTeam.filter(u => !u.isZhang && !u.isWei);
        if (others.length > 0 && zhang && !takenPos.has(2)) {
            others[0].pos = 2; others[0].fixed = true; takenPos.add(2);
            others.shift();
        }

    }

    // --- 六大派 ---
    let enemyUnits = [];
    if (enemySquad) {
        let enemyPosSet = new Set();
        for (let item of enemySquad) {
            if (typeof item === 'object' && item.name) {
                let unit = new Unit(item.name, item.m, item.role, 'enemy');
                unit.init(); unit.applyBonus();
                enemyUnits.push(unit);
            } else {
                let mVal = item;
                // 优先从 ENEMY_SQUADS 的定义中查找名字，其次从 ENEMY_M 中查找，最后兜底为“六大派弟子”
                let pool = Object.entries(ENEMY_M).filter(([n, v]) => v === mVal);
                let usedNames = enemyUnits.map(u => u.name);
                let name = null;
                // 先从 ENEMY_SQUADS 中按 mVal 查找未被使用的名字
                const squadDefs = Object.values(C.ENEMY_SQUADS).flat();
                for (let def of squadDefs) {
                    if (typeof def === 'object' && def.m === mVal && !usedNames.includes(def.name)) {
                        name = def.name;
                        break;
                    }
                }
                // 如果 Squad 中没找到，再从 ENEMY_M 池子中随机
                if (!name && pool.length > 0) {
                    let attempts = 0;
                    while ((!name || usedNames.includes(name)) && attempts < 50) {
                        let pick = pool[rand(0, pool.length - 1)];
                        name = pick[0];
                        attempts++;
                    }
                }
                if (!name) name = '六大派弟子';
                let role = C.ROLES[rand(0, 3)];
                let unit = new Unit(name, mVal, role, 'enemy');
                unit.init(); unit.applyBonus();
                enemyUnits.push(unit);
            }
        }
        let template = C.ENEMY_POS_TEMPLATES && C.ENEMY_POS_TEMPLATES[currentStage] ? C.ENEMY_POS_TEMPLATES[currentStage] : null;
        if (template) {
            for (let [role, poses] of Object.entries(template)) {
                if (role === 'random') continue;
                for (let pos of poses) {
                    let unit = enemyUnits.find(u => u.role === role && u.pos == null);
                    if (unit && !enemyPosSet.has(pos)) {
                        unit.pos = pos; unit._originalPos = pos;
                        enemyPosSet.add(pos);
                    }
                }
            }
        }        // 其余随机
        let remaining = enemyUnits.filter(u => u.pos == null);
        let allPos = [1,2,3,4,5,6,7,8,9].filter(p => !enemyPosSet.has(p));
        for (let u of remaining) {
            if (allPos.length > 0) {
                let idx = rand(0, allPos.length - 1);
                u.pos = allPos[idx]; u._originalPos = u.pos;
                enemyPosSet.add(allPos[idx]);
                allPos.splice(idx, 1);
            }
        }
        // 最终兜底：任何仍未获得位置的单位，强制从所有空位中随机分配
        let stillUnplaced = enemyUnits.filter(u => u.pos == null);
        if (stillUnplaced.length > 0) {
            let finalPositions = [1,2,3,4,5,6,7,8,9].filter(p => !enemyPosSet.has(p));
            for (let u of stillUnplaced) {
                if (finalPositions.length > 0) {
                    let idx = rand(0, finalPositions.length - 1);
                    u.pos = finalPositions[idx]; u._originalPos = u.pos;
                    enemyPosSet.add(finalPositions[idx]);
                    finalPositions.splice(idx, 1);
                } else {
                    // 极端情况：所有位置被占，强行给一个合法位置
                    u.unit.pos = 1 + rand(0, 8);
                }
            }
        }
        enemyTeam = enemyUnits.map(e => e.unit || e);
    }

    return {
        ally: allyTeam.map(u => Object.freeze(u.clone())),
        enemy: enemyTeam.map(u => Object.freeze(u.clone()))
    };
}

// 自动挑选海克斯，支持偏好列表
export function autoPickBuff(choices, preferredBuffs = []) {
    if (!choices || choices.length === 0) return null;
    if (preferredBuffs.length > 0) {
        const preferredChoices = choices.filter(c => preferredBuffs.includes(c));
        if (preferredChoices.length > 0) {
            return preferredChoices[Math.floor(Math.random() * preferredChoices.length)];
        }
    }
    return choices[Math.floor(Math.random() * choices.length)];
}

// 生成海克斯选项
function generateBuffChoices() {
    const ALL_BUFF_KEYS = Object.keys(C.BUFFS);
    let shuffled = [...ALL_BUFF_KEYS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, C.BUFF_CHOICES);
}

// 自动批量战斗
export async function runAutoBattle(rounds, onProgress, stage = 1, preferredBuffs = []) {
    let wins = { ally: 0, enemy: 0, draw: 0 };
    for (let i = 0; i < rounds; i++) {
        const snap = generateSnapshot(stage);
        let buffs = [];
        for (let j = 0; j < 4; j++) {
            const choices = generateBuffChoices();
            const picked = autoPickBuff(choices, preferredBuffs);
            if (picked) buffs.push({ key: picked, target: 'ally', remaining: C.BUFFS[picked].duration || C.BUFF_DURATION });
        }
        const result = runBattle(snap, buffs);
        if (result.winner === '明教') wins.ally++;
        else if (result.winner === '六大派') wins.enemy++;
        else wins.draw++;
        if (onProgress) onProgress(i + 1, rounds);
    }
    return wins;
}