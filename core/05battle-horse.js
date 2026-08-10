﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// core/05battle-horse.js - 光明顶5v5 拒马逻辑
// V5.4.0 | ~2900 bytes| 2026-07-05
export const VER = 'core/05battle-horse.js V5.4.0';

import { CONFIG } from './01config-5v5-test.js';
import { rand, hasBuff } from './03battle-utils.js';
import { query } from './50battle-shared.js';
import { Unit } from './02unit.js';
const C = CONFIG;

export function spawnHorse(allyTeam, log, enemyTeam, force = false) {
    let buffs = allyTeam._activeBuffs || [];
    if (!force && !hasBuff(buffs, 'horseFormation')) return;
    let occupiedPositions = new Set(
        allyTeam.filter(u => u.alive).map(u => u.pos)
    );
    let available = [1,2,3,4,5,6,7,8,9].filter(p => !occupiedPositions.has(p));
    if (available.length === 0) return;
    // Fisher–Yates 洗牌，确保真正的随机性
    for (let i = available.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [available[i], available[j]] = [available[j], available[i]];
    }
    let horsePos = available[0];
    let horse = new Unit('拒马', 20, '防战', allyTeam[0].camp);
    const xiaoHEnhance = query('xiaoHexEnhance', allyTeam, allyTeam._activeBuffs || [], 'horseFormation');
    horse.atk = 0;
    if (xiaoHEnhance) {
        horse.def = xiaoHEnhance.horseDef;
        horse.maxHp = xiaoHEnhance.horseHp;
    } else {
        horse.def = 5;
        horse.maxHp = 25;
    }
    horse.hp = horse.maxHp;
    horse._baseMaxHp = horse.maxHp;  // 防止 carry 误判 _baseMaxHp=0 把马打成 maxHp=0
    horse.pos = horsePos; horse.isHorse = true; horse._originalPos = horsePos;
    allyTeam.push(horse);
    // 返回生成的拒马单位，让调用方自己写日志
    return horse;
}

export function destroyHorse(allyTeam, log) {
    let buffs = allyTeam._activeBuffs || [];
    if (!hasBuff(buffs, 'horseFormation')) return;
    let horses = allyTeam.filter(u => u.isHorse && u.alive).sort((a, b) => b.pos - a.pos);
    if (horses.length === 0) return;

    let currentProb = 50;
    for (const horse of horses) {
        const roll = rand(1, 100);
        const success = roll <= currentProb;
        if (success) {
            horse.hp = 0;
            horse.alive = false;
            horse.state._isDead = true;
            log.push({type:'buff-destroy', text:`<span class="gray">🐴 拒马阵：${horse.pos}号位拒马消散（成功率${currentProb}%，${roll}）</span>`, buffType:'destroy', horseUid: horse.uid, needsSeparator: true});
            currentProb = Math.floor(currentProb / 2);
        } else {
            log.push({type:'info', text:`<span class="gray">🐴 拒马阵：${horse.pos}号位拒马未消散（成功率${currentProb}%，${roll}）</span>`});
            currentProb = 50;
        }
    }
}