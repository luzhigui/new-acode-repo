// V5.5.0 | 2026-08-15 从 23global-store 拆出
export const VER = 'modules/28buff-tools.js V5.5.0';

import { CONFIG } from '../core/01config-5v5-test.js';
import { getBattleRng } from '../core/13battle-shared.js';
import { CAMP_TYPES, BUFF_TYPES } from '../infra/56-battle-enums.js';

export function createBuffObject(key, duration) {
    const buff = { key, target: CAMP_TYPES.ALLY, remaining: duration, name: CONFIG.BUFFS[key]?.name || key };
    if (key === BUFF_TYPES.HOLY_FLAME) {
        const cols = [];
        const rng = getBattleRng();
        while (cols.length < 2) { const c = rng.nextInt(1, 3); if (!cols.includes(c)) cols.push(c); }
        cols.sort((a, b) => a - b);
        const rows = [];
        while (rows.length < 2) { const r = rng.nextInt(1, 3); if (!rows.includes(r)) rows.push(r); }
        rows.sort((a, b) => a - b);
        buff.cols = cols;
        buff.rows = rows;
    }
    return buff;
}

export function generateBuffChoices(activeBuffs, allyTeam = [], rng = null) {
    const activeBuffKeys = activeBuffs.map(b => b.key);
    const allKeys = Object.keys(CONFIG.BUFFS);
    const available = allKeys.filter(k => {
        if (activeBuffKeys.includes(k)) return false;
        if (k === BUFF_TYPES.FORTIFY && !activeBuffs.some(b => b.remaining > 0)) return false;
        const requiredRole = CONFIG.BUFF_ROLE_REQUIREMENTS[k];
        if (requiredRole && !allyTeam.some(u => u.alive && u.role === requiredRole)) return false;
        return true;
    });
    const shuffled = [...available];
    const r = rng || getBattleRng();
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = r.nextInt(0, i);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, CONFIG.BUFF_CHOICES);
}

export function tickBuffDurations(activeBuffs, selectedBuffIndex, updateBuffSlotsFn) {
    activeBuffs = activeBuffs.map(b => ({...b, remaining: b.remaining - 1})).filter(b => b.remaining > 0);
    if (selectedBuffIndex >= activeBuffs.length) selectedBuffIndex = -1;
    updateBuffSlotsFn();
    return { activeBuffs, selectedBuffIndex };
}

export function getActiveBuffList(activeBuffs) {
    return activeBuffs.map(b => b.name + '(' + b.remaining + '回)').join('、') || '无';
}
