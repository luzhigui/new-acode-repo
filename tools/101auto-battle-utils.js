﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// tools/101auto-battle-utils.js - 光明顶5v5 自动批量战斗工具
// V5.5.0 | ~14800 bytes| 2026-08-15 补齐 headless runBattle + 修 init 缺 rng
export const VER = 'tools/101auto-battle-utils.js V5.5.0';

import { CONFIG } from '../core/01config-5v5-test.js';
import { SeededRNG } from '../core/07-rng.js';
import { createRoundStepper } from '../core/11battle-round.js';
import { initBattleTeams } from '../modules/29battle-init.js';
import '../modules/23global-store.js';
import '../modules/25elite-imperial.js';
import '../modules/26elite-sixsects.js';
import '../modules/27elite-mingjiao.js';
import { addPermanentBuff } from '../modules/20elite-skills.js';
const C = CONFIG;

// 纯数据快照生成器
export function generateSnapshot(currentStage = 1, rng = new SeededRNG(Date.now())) {
    // 复用主代码 initBattleTeams：第 1-6 关明教+六大派阵容生成完全一致
    // 修复：自写简化版只支持第 1 关（MING_SQUADS 仅定义 1:），第 2-6 关 allyTeam 空导致 spawnHorse 取 allyTeam[0].camp 崩溃
    const { allyTeam, enemyTeam } = initBattleTeams(currentStage, rng);
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
    const hexLog = []; // 新增：每场海克斯 + 胜负记录，供 108 仪表盘读取
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
        hexLog.push({ stage, buffs: buffs.map(b => b.key), winner: result.winner }); // 新增
        if (onProgress) onProgress(i + 1, rounds);
    }
    // 新增：追加保存海克斯归因记录，供 108 仪表盘读取
    try {
        const KEY = 'ming_hex_battle_log';
        const prev = JSON.parse(localStorage.getItem(KEY) || '[]');
        localStorage.setItem(KEY, JSON.stringify(prev.concat(hexLog)));
    } catch (e) {}
    return wins;
}