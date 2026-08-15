﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// tools/47auto-battle-utils.js - 光明顶5v5 自动批量战斗工具
// V5.4.0 | ~14800 bytes| 2026-08-15 补齐 headless runBattle + 修 init 缺 rng
export const VER = 'tools/47auto-battle-utils.js V5.4.0';

import { CONFIG, ENEMY_M } from '../core/01config-5v5-test.js';
import { Unit } from '../core/02unit.js';
import { SeededRNG } from '../core/07-rng.js';
import { createRoundStepper } from '../core/11battle-round.js';
import '../modules/18global-store.js';
import '../modules/20elite-imperial.js';
import '../modules/21elite-sixsects.js';
import '../modules/22elite-mingjiao.js';
import { addPermanentBuff } from '../modules/15elite-skills.js';
const _randLocal = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const C = CONFIG;

// 纯数据快照生成器
export function generateSnapshot(currentStage = 1, rng = new SeededRNG(Date.now())) {
    const PARTY_SIZE = 5;
    let allyTeam = [], enemyTeam = [];
    const mingSquad = C.MING_SQUADS && C.MING_SQUADS[currentStage] ? C.MING_SQUADS[currentStage] : null;
    const enemySquad = C.ENEMY_SQUADS && C.ENEMY_SQUADS[currentStage] ? C.ENEMY_SQUADS[currentStage] : null;

    // --- 明教 ---
    if (mingSquad) {
        let mingConfig;
        if (currentStage === 1 && Array.isArray(mingSquad[0])) {
            mingConfig = mingSquad[_randLocal(0, mingSquad.length - 1)];
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
                mVal = name === '小昭' ? 107 : (C.MING_M[name] || 95);
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
                        name = candidates[_randLocal(0, candidates.length - 1)][0];
                    } else {
                        const allCandidates = Object.entries(C.MING_M).filter(([n, v]) => v === mVal);
                        name = allCandidates.length > 0 ? allCandidates[_randLocal(0, allCandidates.length - 1)][0] : ('明教弟子' + (allyTeam.length + 1));
                    }
                }
            }
            if (!name) name = '明教弟子' + (allyTeam.length + 1);
            if (!mVal) mVal = 95;
            let role = (name === '张无忌' || name === '小昭') ? '远程' : (name === '韦一笑' ? '飞行' : C.ROLES[_randLocal(0, 3)]);
            let unit = new Unit(name, mVal, role, 'ally');
            if (name === '张无忌') unit.isZhang = true;
            if (name === '韦一笑') unit.isWei = true;
            if (name === '小昭') {
                if (rng.next() < 0.5) { unit.isXiaoZhaoSister = true; }
                else { unit.isXiaoZhaoBrother = true; }
                unit.name = unit.isXiaoZhaoSister ? '小昭·姊' : '小昭·妹';
                unit.initXiaoZhao(); unit.applyBonus();
            } else {
                unit.init(rng); unit.applyBonus();
            }
            unit.pos = null;
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
                unit.init(rng); unit.applyBonus();
                enemyUnits.push(unit);
            } else {
                let mVal = item;
                // 已使用的敌人名字（用于避免重名）
                let usedNames = enemyUnits.map(u => u.name);
                // 优先从 ENEMY_SQUADS 的定义中查找名字，其次从 ENEMY_M 中查找，最后兜底为“六大派弟子”
                let pool = Object.entries(ENEMY_M).filter(([n, v]) => v === mVal);
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
                        let pick = pool[_randLocal(0, pool.length - 1)];
                        name = pick[0];
                        attempts++;
                    }
                }
                if (!name) {
                    // 兜底名字加序号，避免重名
                    const fallbackSects = ['少林弟子', '武当弟子', '峨眉弟子', '昆仑弟子', '崆峒弟子'];
                    const fallbackName = fallbackSects[_randLocal(0, fallbackSects.length - 1)];
                    const existingCount = usedNames.filter(n => n.startsWith(fallbackName)).length;
                    name = fallbackName + (existingCount > 0 ? String(existingCount + 1) : '');
                }
                let role = C.ROLES[_randLocal(0, 3)];
                let unit = new Unit(name, mVal, role, 'enemy');
                unit.init(rng); unit.applyBonus();
                enemyUnits.push(unit);
            }
        }
        // 精英优先读 config 的 pos（与主代码 ELITE_POOL 对齐）
        const elitePool = C.ELITE_POOL?.[currentStage] || [];
        for (const elite of elitePool) {
            const unit = enemyUnits.find(u => u.name === elite.name);
            if (unit && elite.pos && !enemyPosSet.has(elite.pos)) {
                unit.pos = elite.pos;
                unit._originalPos = elite.pos;
                enemyPosSet.add(elite.pos);
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
        }        // 精英优先按 pos 配置站位，被占则向后顺延；宋青书永远在周芷若后面
        // 1) 先分离精英和普通敌人
        const eliteUnits = enemyUnits.filter(u => u.name === '宋青书' || u.name === '周芷若');
        const normalUnits = enemyUnits.filter(u => !eliteUnits.includes(u));

        // 2) 普通敌人按模板占位后，剩余的随机分配
        let remainingNormals = normalUnits.filter(u => u.pos == null);
        let allPos = [1,2,3,4,5,6,7,8,9].filter(p => !enemyPosSet.has(p));
        for (let u of remainingNormals) {
            if (allPos.length > 0) {
                let idx = _randLocal(0, allPos.length - 1);
                u.pos = allPos[idx]; u._originalPos = u.pos;
                enemyPosSet.add(allPos[idx]);
                allPos.splice(idx, 1);
            }
        }

        // 3) 周芷若先占位：优先 2 号，被占则顺延 3→4→5→6→7→8→9
        const zhou = eliteUnits.find(u => u.name === '周芷若');
        const song = eliteUnits.find(u => u.name === '宋青书');

        if (zhou && zhou.pos == null) {
            const zhouPriority = [2, 3, 4, 5, 6, 7, 8, 9];
            for (const p of zhouPriority) {
                if (!enemyPosSet.has(p)) {
                    zhou.pos = p; zhou._originalPos = p;
                    enemyPosSet.add(p);
                    break;
                }
            }
            // 全满的极端情况，随机找一个
            if (zhou.pos == null) {
                allPos = [1,2,3,4,5,6,7,8,9].filter(p => !enemyPosSet.has(p));
                if (allPos.length > 0) {
                    zhou.pos = allPos[0]; zhou._originalPos = zhou.pos;
                    enemyPosSet.add(allPos[0]);
                }
            }
        }

        // 4) 宋青书后占位：必须在周芷若序号之后，且靠前
        if (song && song.pos == null) {
            const zhouPos = zhou ? zhou.pos : 0;
            const songPriority = [];
            // 按靠前优先，但必须在周芷若之后
            for (let p = zhouPos + 1; p <= 9; p++) {
                if (!enemyPosSet.has(p)) songPriority.push(p);
            }
            if (songPriority.length > 0) {
                song.pos = songPriority[0]; song._originalPos = song.pos;
                enemyPosSet.add(songPriority[0]);
            }
        }

        // 5) 其他精英（如果有）随机分配
        const otherElites = eliteUnits.filter(u => u !== zhou && u !== song && u.pos == null);
        for (let u of otherElites) {
            allPos = [1,2,3,4,5,6,7,8,9].filter(p => !enemyPosSet.has(p));
            if (allPos.length > 0) {
                let idx = _randLocal(0, allPos.length - 1);
                u.pos = allPos[idx]; u._originalPos = u.pos;
                enemyPosSet.add(allPos[idx]);
            }
        }
        // 最终兜底：任何仍未获得位置的单位，强制从所有空位中随机分配
        let stillUnplaced = enemyUnits.filter(u => u.pos == null);
        if (stillUnplaced.length > 0) {
            let finalPositions = [1,2,3,4,5,6,7,8,9].filter(p => !enemyPosSet.has(p));
            for (let u of stillUnplaced) {
                if (finalPositions.length > 0) {
                    let idx = _randLocal(0, finalPositions.length - 1);
                    u.pos = finalPositions[idx]; u._originalPos = u.pos;
                    enemyPosSet.add(finalPositions[idx]);
                    finalPositions.splice(idx, 1);
                } else {
                    // 极端情况：所有位置被占，强行给一个合法位置
                    u.pos = 1 + _randLocal(0, 8);
                }
            }
        }
        enemyTeam = enemyUnits;
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

// 无界面自动补 Buff（每3回合）：复用主游戏筛选规则，优先不重复且满足角色要求
function autoPickBuffForBattle(state, currentBuffs) {
    const allKeys = Object.keys(C.BUFFS);
    const existing = (currentBuffs || []).map(b => b.key);
    const allyTeam = state.ally || [];
    const available = allKeys.filter(k => {
        if (existing.includes(k)) return false;
        const requiredRole = C.BUFF_ROLE_REQUIREMENTS?.[k];
        if (requiredRole && !allyTeam.some(u => u.alive && u.role === requiredRole)) return false;
        return true;
    });
    if (available.length === 0) return null;
    const rng = state._rng || new SeededRNG(Date.now());
    const pick = available[rng.nextInt(0, available.length - 1)];
    const duration = C.BUFFS[pick].duration || C.BUFF_DURATION || 4;
    const newBuff = { key: pick, target: 'ally', remaining: duration, name: C.BUFFS[pick].name };
    if (pick === 'holyFlame') {
        newBuff.col = rng.nextInt(1, 3);
        newBuff.row = rng.nextInt(1, 3);
    }
    return newBuff;
}

// 无界面完整战斗：复用 createRoundStepper 循环到分出胜负（headless，无 UI/动画）
async function runBattle(snap, buffs, seed) {
    const rng = seed instanceof SeededRNG ? seed : new SeededRNG(seed ?? Date.now());
    let battleState = {
        ally: snap.ally.map(u => u.clone()),
        enemy: snap.enemy.map(u => u.clone()),
        round: 1,
        activeBuffs: (buffs || []).map(b => ({ ...b })),
        allAllies: snap.ally.map(u => u.clone()),
        _rng: rng
    };
    let lastStep = null;
    const maxRound = C.MAX_ROUND || 35;
    while (battleState.round <= maxRound) {
        const stepper = createRoundStepper(battleState);
        for await (const step of stepper) {
            lastStep = step;
            if (step.winner) return { winner: step.winner };
        }
        // 回合结束：Buff 递减 + 每3回合自动补一个 Buff
        let nextBuffs = (battleState.activeBuffs || []).map(b => ({ ...b, remaining: b.remaining - 1 })).filter(b => b.remaining > 0);
        if (battleState.round % 3 === 0) {
            const nb = autoPickBuffForBattle(battleState, nextBuffs);
            if (nb) nextBuffs.push(nb);
        }
        battleState = {
            ally: (lastStep ? lastStep.ally : battleState.ally).map(u => u.clone()),
            enemy: (lastStep ? lastStep.enemy : battleState.enemy).map(u => u.clone()),
            round: battleState.round + 1,
            activeBuffs: nextBuffs,
            allAllies: battleState.allAllies,
            _rng: battleState._rng
        };
    }
    return { winner: '平局' };
}

// 自动批量战斗
export async function runAutoBattle(rounds, onProgress, stage = 1, preferredBuffs = []) {
    let wins = { ally: 0, enemy: 0, draw: 0 };
    for (let i = 0; i < rounds; i++) {
        const rng = new SeededRNG(Date.now() + i * 7919);
        const snap = generateSnapshot(stage, rng);
        let buffs = [];
        for (let j = 0; j < 4; j++) {
            const choices = generateBuffChoices();
            const picked = autoPickBuff(choices, preferredBuffs);
            if (picked) buffs.push({ key: picked, target: 'ally', remaining: C.BUFFS[picked].duration || C.BUFF_DURATION });
        }
        const result = await runBattle(snap, buffs, rng);
        if (result.winner === '明教') wins.ally++;
        else if (result.winner === '六大派') wins.enemy++;
        else wins.draw++;
        if (onProgress) onProgress(i + 1, rounds);
    }
    return wins;
}