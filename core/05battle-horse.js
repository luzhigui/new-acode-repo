// core/05battle-horse.js - 光明顶5v5 拒马逻辑
// V4.0.0 | ~80 lines | 2026-06-29 09:29
export const VER = 'core/05battle-horse.js V4.0.0';

import { CONFIG } from './01config-5v5-test.js';
import { rand, hasBuff } from './03battle-utils.js';
import { Unit } from './02unit.js';
const C = CONFIG;

export function spawnHorse(allyTeam, log, enemyTeam) {
    let buffs = allyTeam._activeBuffs || [];
    if (!hasBuff(buffs, 'horseFormation')) return;
    let occupiedPositions = new Set([
        ...allyTeam.filter(u => u.alive).map(u => u.pos),
        ...(enemyTeam ? enemyTeam.filter(u => u.alive).map(u => u.pos) : [])
    ]);
    let available = [1,2,3,4,5,6,7,8,9].filter(p => !occupiedPositions.has(p));
    if (available.length === 0) return;
    let horsePos = available[rand(0, available.length-1)];
    let horse = new Unit('拒马', 20, '防战', allyTeam[0].camp);
    horse.atk = C.BUFFS.horseFormation.horseAtk;
    let defVar = rand(0, 5);
    horse.def = C.BUFFS.horseFormation.horseDef + defVar;
    let hpVar = rand(0, 5);
    horse.maxHp = C.BUFFS.horseFormation.horseHp + hpVar;
    horse.hp = horse.maxHp;
    horse.pos = horsePos; horse.isHorse = true; horse._originalPos = horsePos;
    allyTeam.push(horse);
    log.push({type:'buff-summon', text:`<span class="gold">🐴 拒马阵：拒马出现在${horsePos}号位！</span>`, buffType:'summon', horsePos, horseUid: horse.uid, horseTaunt: '嘶——！'});
}

export function destroyHorse(allyTeam, log) {
    let buffs = allyTeam._activeBuffs || [];
    if (!hasBuff(buffs, 'horseFormation')) return;
    let horses = allyTeam.filter(u => u.isHorse && u.alive);
    if (horses.length === 0) return;
    if (rand(1,100) <= 50) {
        let horse = horses[rand(0, horses.length-1)];
        horse.hp = 0; horse.alive = false; horse._isDead = true;
        log.push({type:'buff-destroy', text:`<span class="gray">🐴 拒马阵：拒马在${horse.pos}号位消散</span>`, buffType:'destroy', horseUid: horse.uid});
    } else {
        log.push({type:'info', text:`<span class="gray">🐴 拒马阵：拒马销毁判定失败，拒马保留</span>`});
    }
}