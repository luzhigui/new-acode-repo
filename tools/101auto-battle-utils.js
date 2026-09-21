// V6.1.0 | ~6500 bytes | 2026-09-10 对齐正式游戏规则：删开局白送4Buff（改为第3/6/9回合自动补选，同真人局节奏）；接通小昭妹永久继承 addPermanentBuff（此前 import 未调用）；局中所选 Buff 记入 hexLog
export const VER = 'tools/101auto-battle-utils.js V6.1.0';

import { CONFIG } from '../core/01config-5v5-test.js';
import { SeededRNG, flushBattleEvents } from '../infra/51-core-utils.js';
import { createRoundStepper } from '../core/11battle-round.js';
import { initBattleTeams } from '../modules/29battle-init.js';
import { BUFF_TYPES, CAMP_TYPES } from '../infra/56-battle-enums.js';
import '../infra/54-global-store.js';
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

// 无界面自动补 Buff（每3回合）：复用主游戏筛选规则，优先不重复且满足角色要求
function autoPickBuffForBattle(state, currentBuffs, preferredBuffs = []) {
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
    const preferred = available.filter(k => preferredBuffs.includes(k));
    const pick = preferred.length > 0 ? preferred[rng.nextInt(0, preferred.length - 1)] : available[rng.nextInt(0, available.length - 1)];
    const duration = C.BUFFS[pick].duration || C.BUFF_DURATION || 4;
    const newBuff = { key: pick, target: CAMP_TYPES.ALLY, remaining: duration, name: C.BUFFS[pick].name };
    if (pick === BUFF_TYPES.HOLY_FLAME) {
        newBuff.col = rng.nextInt(1, 3);
        newBuff.row = rng.nextInt(1, 3);
    }
    // 对齐正式游戏：小昭·妹永久继承所选 Buff（真人局选完即调 addPermanentBuff，工具局此前 import 了却从未调用）
    const brother = allyTeam.find(u => u.isXiaoZhaoBrother);
    if (brother) {
        const extra = pick === BUFF_TYPES.HOLY_FLAME ? { col: newBuff.col, row: newBuff.row } : {};
        addPermanentBuff(brother, pick, newBuff.name, extra);
    }
    return newBuff;
}

// 无界面完整战斗：复用 createRoundStepper 循环到分出胜负（headless，无 UI/动画）
// 对齐正式游戏：开局 0 Buff，第 3/6/9…回合结束自动补选（同真人局"第3回合倍数选Buff"节奏）
async function runBattle(snap, seed, preferredBuffs = []) {
    const rng = seed instanceof SeededRNG ? seed : new SeededRNG(seed ?? Date.now());
    const buffsPicked = [];
    // 海克斯抽取回调：沿用 autoPickBuffForBattle（带偏好 + 小昭·妹永久继承 + 记 buffsPicked）。
    // autoPickBuffForBattle 内部自己起 rng（state._rng），签名要求 state，故这里包一层假 state。
    const hexPicker = (activeBuffs, allySide, rng2) => {
        const nb = autoPickBuffForBattle({ ally: allySide, _rng: rng2 }, activeBuffs, preferredBuffs);
        if (nb) buffsPicked.push(nb);
        return nb;
    };
    const res = runBattleCore({
        ally: snap.ally,
        enemy: snap.enemy,
        seed: rng,
        hexPicker
    });
    return { winner: res.winner || '平局', buffsPicked };
}

// 自动批量战斗
export async function runAutoBattle(rounds, onProgress, stage = 1, preferredBuffs = []) {
    let wins = { ally: 0, enemy: 0, draw: 0 };
    const hexLog = []; // 每场海克斯 + 胜负记录，供 108 仪表盘读取（记录局中第3/6/9回合自动补选的 Buff）
    for (let i = 0; i < rounds; i++) {
        const rng = new SeededRNG(Date.now() + i * 7919);
        const snap = generateSnapshot(stage, rng);
        const result = await runBattle(snap, rng, preferredBuffs);
        // 每场结束清理全局累积：_eventBuffer（已 flush）+ _eliteStates Map（uid 永不复用，会无限膨胀导致 OOM）
        flushBattleEvents();
        // 状态已并入 unit.state，随对局对象 GC，无需清理（18-elite-state 已废弃）
        if (result.winner === '明教') wins.ally++;
        else if (result.winner === '六大派') wins.enemy++;
        else wins.draw++;
        hexLog.push({ stage, buffs: result.buffsPicked.map(b => b.key), winner: result.winner });
        if (onProgress) onProgress(i + 1, rounds);
        // 2026-09-20 每 25 场让出主线程一瞬：runBattle 是纯同步计算，一口气跑几百场会把主线程占死
        // （移动端弹"网页暂无响应"、进度文字永远画不出来）。setTimeout(0) 是宏任务，浏览器借机重绘。
        if ((i + 1) % 25 === 0 && i + 1 < rounds) await new Promise(r => setTimeout(r, 0));
    }
    // 新增：追加保存海克斯归因记录，供 108 仪表盘读取
    try {
        const KEY = 'ming_hex_battle_log';
        const prev = JSON.parse(localStorage.getItem(KEY) || '[]');
        localStorage.setItem(KEY, JSON.stringify(prev.concat(hexLog)));
    } catch (e) {}
    return wins;
}