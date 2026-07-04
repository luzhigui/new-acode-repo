// realtime/05-battle-round.js - 光明顶5v5 简化回合循环
// V1.0.0 | 2026-07-04 仅用于验证新引擎的回合流程
export const VER = 'realtime/05-battle-round.js V1.0.0';

import { executeAttack } from './03-attack-steps.js';

/**
 * 运行一个最简单的回合循环
 * @param {object} store - 状态仓库
 * @param {function} onUpdate - 每次攻击后的回调（用于更新UI）
 */
export async function runSimpleLoop(store, onUpdate) {
    let round = 1;
    while (true) {
        const state = store.getState();
        const enemy = state.units.find(u => u.alive && u.camp === 'enemy');
        const ally = state.units.find(u => u.alive && u.camp === 'ally');

        if (!enemy || !ally) break;

        // 敌方攻击
        let result = executeAttack(store, enemy.uid, ally.uid);
        if (onUpdate) onUpdate(round, enemy.name, ally.name, result);
        if (result.isDead) break;

        // 己方攻击
        result = executeAttack(store, ally.uid, enemy.uid);
        if (onUpdate) onUpdate(round, ally.name, enemy.name, result);
        if (result.isDead) break;

        round++;
        await new Promise(r => setTimeout(r, 500));
    }
}
