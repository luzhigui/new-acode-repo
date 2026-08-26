// core/05battle-horse.js - 光明顶5v5 拒马逻辑
// V5.5.1 | ~2906 bytes| 2026-08-21 战报记账修正：拒马初始化/消散改非记账
export const VER = 'core/05battle-horse.js V5.5.1';

import { CONFIG } from './01config-5v5-test.js';
import { hasBuff } from './03battle-utils.js';
import { query, getBattleRng, applyStatChange } from './13battle-shared.js';
import { Unit } from './02unit.js';
import { FACT_TYPES } from '../infra/56-battle-enums.js';
const C = CONFIG;

// 拒马-生成：创建拒马单位并随机站位
export function spawnHorse(allyTeam, log, enemyTeam, force = false) {
    let buffs = allyTeam._activeBuffs || [];
    if (!force && !hasBuff(buffs, 'horseFormation')) return;
    let occupiedPositions = new Set(
        allyTeam.filter(u => u.alive).map(u => u.pos)
    );
    let available = [1,2,3,4,5,6,7,8,9].filter(p => !occupiedPositions.has(p));
    if (available.length === 0) return;
    // Fisher–Yates 洗牌，确保真正的随机性
    const rng = getBattleRng();
    for (let i = available.length - 1; i > 0; i--) {
        const j = rng.nextInt(0, i);
        [available[i], available[j]] = [available[j], available[i]];
    }
    let horsePos = available[0];
    let horse = new Unit('拒马', 15, '防战', allyTeam[0].camp);
    const xiaoHEnhance = query('xiaoHexEnhance', allyTeam, allyTeam._activeBuffs || [], 'horseFormation');
    horse.atk = 0;
    horse._hpDmgRatio = 0.06;
    if (xiaoHEnhance) {
        applyStatChange(horse, 'def', xiaoHEnhance.horseDef, null, '拒马初始化');
        applyStatChange(horse, 'maxHp', xiaoHEnhance.horseHp, null, '拒马初始化');
    } else {
        applyStatChange(horse, 'def', C.BUFFS.horseFormation.horseDef, null, '拒马初始化');
        applyStatChange(horse, 'maxHp', C.BUFFS.horseFormation.horseHp, null, '拒马初始化');
    }
    applyStatChange(horse, 'hp', horse.maxHp, null, '拒马初始化', false);
    horse._baseMaxHp = horse.maxHp;  // 防止 carry 误判 _baseMaxHp=0 把马打成 maxHp=0
    horse.pos = horsePos; horse.isHorse = true; horse._originalPos = horsePos;
    allyTeam.push(horse);
    // 返回生成的拒马单位，让调用方自己写日志
    return horse;
}

// 拒马-销毁：回合结束概率消散拒马
export function destroyHorse(allyTeam, log) {
    let horses = allyTeam.filter(u => u.isHorse && u.alive).sort((a, b) => b.pos - a.pos);
    if (horses.length === 0) return;

    // 连续销毁概率递减：第一匹50%，每成功一匹概率减半，失败重置回50%；避免多匹拒马被一轮清空
    let currentProb = 50;
    const rng = getBattleRng();
    for (const horse of horses) {
        const roll = rng.nextInt(1, 100);
        const success = roll <= currentProb;
        if (success) {
            applyStatChange(horse, 'hp', -horse.hp, null, '拒马消散', false);
            horse.alive = false;
            horse.state._isDead = true;
            log.push({ factType: FACT_TYPES.HORSE_DESTROY, data: { pos: horse.pos, success: true, prob: currentProb, roll, horseUid: horse.uid } });
            currentProb = Math.floor(currentProb / 2);
        } else {
            log.push({ factType: FACT_TYPES.HORSE_DESTROY, data: { pos: horse.pos, success: false, prob: currentProb, roll, horseUid: horse.uid } });
            currentProb = 50;
        }
    }
}