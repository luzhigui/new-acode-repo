// V6.2.0 | ~4700 bytes | 2026-09-24 战报补召唤单位行（狮子之类不在开局 snapshot，按 uid 补）
export const VER = 'player/48battle-report.js V6.2.0';

import { GlobalStore } from '../infra/54-global-store.js';
import { getBattleRng } from '../core/13battle-shared.js';
import { renderVictoryLine, showScoreFloat } from './47renderer.js';

// 2026-09-24 召唤单位补行：战报名单原先只映射开局 snapshot 两队，谢逊召唤出来的幼狮/雄狮/母狮
//   压根不在 snapshot 里，输出与承伤全被丢掉。此处把「结束态队伍里 uid 不在 snapshot」的单位
//   （即召唤物）原样补到队尾，统计字段直接取结束态单位自身的记账。
function collectSummons(finalState, snapshotList) {
    const known = new Set((snapshotList || []).map(u => u.uid));
    return (finalState || [])
        .filter(u => u && !known.has(u.uid))
        .map(u => ({ ...u, _isDead: !!(u.state && u.state._isDead) }));
}

// 构建战报数据（纯函数）
export function buildBattleReportData(finalStep, snapshot, winner) {
    if (winner !== '明教' && winner !== '六大派') return null;
    const finalAllyState = finalStep ? finalStep.ally : [];
    const finalEnemyState = finalStep ? finalStep.enemy : [];
    const allyMap = new Map(finalAllyState.map(u => [u.uid, u]));
    const enemyMap = new Map(finalEnemyState.map(u => [u.uid, u]));
    const reportAllies = (snapshot.ally || []).map(u => {
        const final = allyMap.get(u.uid);
        return final ? { ...u, hp: final.hp, maxHp: final.maxHp, alive: final.alive, pos: final.pos, dmgDealt: final.dmgDealt, dmgTaken: final.dmgTaken, healDone: final.healDone, reboundDone: final.reboundDone, leechDone: final.leechDone, dodgeCount: final.dodgeCount, critCount: final.critCount, survivedRounds: final.survivedRounds, _isDead: final.state._isDead } : { ...u, alive: false, _isDead: true };
    });
    const reportEnemies = (snapshot.enemy || []).map(u => {
        const final = enemyMap.get(u.uid);
        return final ? { ...u, hp: final.hp, maxHp: final.maxHp, alive: final.alive, pos: final.pos, dmgDealt: final.dmgDealt, dmgTaken: final.dmgTaken, healDone: final.healDone, reboundDone: final.reboundDone, leechDone: final.leechDone, dodgeCount: final.dodgeCount, critCount: final.critCount, survivedRounds: final.survivedRounds, _isDead: final.state._isDead } : { ...u, alive: false, _isDead: true };
    });
    return { winner, ally: reportAllies.concat(collectSummons(finalAllyState, snapshot.ally)), enemy: reportEnemies.concat(collectSummons(finalEnemyState, snapshot.enemy)) };
}

// 积分结算（纯函数）
export function computeVoteResult(winner, voteChoice, battleHasZhang, currentScore) {
    if (!voteChoice || voteChoice === 'skip' || winner === '平局') {
        return { earnPoints: 0, newScore: currentScore, voteMsg: null, isCorrect: false, shouldPersist: false };
    }
    const isCorrect = voteChoice === winner;
    const earnPoints = isCorrect ? (battleHasZhang ? 3 : 2) : -1;
    const newScore = currentScore + earnPoints;
    
    // localStorage 保护：写入前读取旧值，异常下降超过 50 分拒绝写入
    let shouldPersist = true;
    try {
        const oldScoreStr = localStorage.getItem('ming_vote_score_5v5_test');
        const oldScore = oldScoreStr ? parseInt(oldScoreStr, 10) : 0;
        if (oldScore !== 0 && newScore < oldScore && (oldScore - newScore) > 50) {
            shouldPersist = false;
            console.error(`🚨 阻止可疑积分覆盖：${oldScore} → ${newScore}，下降幅度过大，已忽略写入`, '\n调用栈:', new Error().stack);
        }
    } catch (e) {
        shouldPersist = true;
    }
    
    const voteMsg = isCorrect
        ? `<span class="green">📊 你猜了${voteChoice}，正确！+${earnPoints}分！ 当前积分：${newScore}</span>`
        : `<span class="red">📊 你猜了${voteChoice}，错误！-1分！当前积分：${newScore}</span>`;
    return { earnPoints, newScore, voteMsg, isCorrect, shouldPersist };
}

// 通关奖励（圣火令/宝箱）
export function grantClearRewards(winner, currentStage) {
    if (winner !== '明教' || !currentStage) return;
    const rng = getBattleRng();
    const stage = currentStage;
    const killRate = [0, 1.5, 2, 2.5, 4, 5.5, 6][stage] / 100;
    const clearRate = stage === 5 ? killRate * 6 : killRate * 5;
    if (rng.next() < clearRate) {
        const currentToken = GlobalStore.get('holyToken') || 0;
        GlobalStore.set('holyToken', currentToken + 1);
        localStorage.setItem('ming_holy_token_5v5_test', String(currentToken + 1));
        renderVictoryLine(`<span class="gold">🔥 通关奖励：获得1枚圣火令！当前总数：${currentToken + 1}</span><br>`);
    }
    const chestClearRate = 1 / 100;
    if (rng.next() < chestClearRate) {
        let chests = parseInt(localStorage.getItem('ming_chest_count') || '0');
        chests++;
        localStorage.setItem('ming_chest_count', String(chests));
        GlobalStore.set('chestCount', chests);
        renderVictoryLine(`<span class="gold">🎁 通关宝箱：获得1个宝箱！当前总数：${chests}</span><br>`);
    }
}