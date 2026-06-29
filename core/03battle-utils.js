// core/03battle-utils.js - 光明顶5v5 战斗工具函数
// V4.0.0 | ~300 lines | 2026-06-29 09:29
export const VER = 'core/03battle-utils.js V4.0.0';

import { CONFIG, TAUNT_LIB, DEF_TAUNT, HP_TAUNT, ZHANG_NEAR_TAUNT } from './01config-5v5-test.js';
const C = CONFIG, TL = TAUNT_LIB, DT = DEF_TAUNT, HT = HP_TAUNT, ZT = ZHANG_NEAR_TAUNT;

export function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
export function calcDamage(atk, def) { if (def <= 0) return atk; let d = atk * (atk / (atk + def)); return Math.max(d, atk * 0.1); }
export function getFangLevel(def, m) { let ratio = def / m; for (let i = C.FANG_LEVELS.length - 1; i >= 0; i--) { if (ratio >= C.FANG_LEVELS[i]) return i; } return 0; }

export function isMelee(role) { return role === '战士' || role === '防战' || role === '飞行'; }

export function getFronts(units) {
    let fronts = [];
    for (let col = 0; col < 3; col++) {
        let poses = [1+col, 4+col, 7+col];
        let chars = units.filter(c => poses.includes(c.pos) && c.alive).sort((a, b) => a.pos - b.pos);
        if (chars.length > 0) fronts.push(chars[0]);
    }
    return fronts;
}

export function isBlocked(unit, allies) {
    if (unit.role === '飞行') return false;
    let col = (unit.pos - 1) % 3;
    let poses = [1+col, 4+col, 7+col];
    let front = poses.find(p => allies.some(a => a.pos === p && a.alive && !a.isHorse));
    if (!front) return false;
    if (unit.pos === front) return false;
    return unit.pos > front;
}

export function getFlyDodgeRate(unit, attacker) {
    // 韦一笑：固定20%基础闪避
    if (unit.isWei) return 0.20;
    // 其他飞行单位：15%
    if (unit.role === '飞行') return 0.15;
    // 非飞行单位：0.0基础闪避（仅能通过流云身法）
    return 0;
}

export function getRandomTaunt(unit) { if (unit.isZhang) return TL['张无忌'][rand(0,TL['张无忌'].length-1)]; if (unit.isWei) return TL['韦一笑'][rand(0,TL['韦一笑'].length-1)]; let pool=TL[unit.role]; if(pool) return pool[rand(0,pool.length-1)]; return '看招！'; }
export function getKillTaunt(unit, KT) { if (unit.isZhang) return KT['张无忌'][rand(0,KT['张无忌'].length-1)]; if (unit.isWei) return KT['韦一笑'][rand(0,KT['韦一笑'].length-1)]; let pool=KT[unit.role]; if(pool) return pool[rand(0,pool.length-1)]; return '受死吧！'; }
export function getZhangNearTaunt(nearAtkCount) { if (nearAtkCount>=1&&nearAtkCount<=3) return ZT[nearAtkCount-1]; return null; }
export function makeFXSnapshot(attacker, defender) { return { attackerPos: attacker?attacker.pos:null, defenderPos: defender?defender.pos:null }; }

export function getActiveBuffs(allies, enemy) {
    let ally = allies[0]?.camp === 'ally' ? allies : enemy;
    return ally._activeBuffs || [];
}
export function hasBuff(buffs, buffKey) { return buffs.some(b => b.key === buffKey); }
export function getUnitRow(pos) { return Math.ceil(pos / 3); }
export function getUnitCol(pos) { return (pos - 1) % 3 + 1; }
export function getAdjacentPositions(pos) {
    const row = getUnitRow(pos), col = getUnitCol(pos);
    let adj = [];
    for (let r = row-1; r <= row+1; r++) {
        for (let c = col-1; c <= col+1; c++) {
            if (r === row && c === col) continue;
            if (r >= 1 && r <= 3 && c >= 1 && c <= 3) adj.push((r-1)*3 + c);
        }
    }
    return adj;
}