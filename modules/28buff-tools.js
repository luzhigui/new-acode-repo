// V6.1.0 | ~1800 bytes | 2026-09-19 联网PVP：buff 分阵营（createBuffObject 加 target 参数、新增 buffsOfCamp）
// V6.0.0 | ~1200 bytes | 2026-08-15 从 23global-store 拆出
export const VER = 'modules/28buff-tools.js V6.1.0';

import { CONFIG } from '../core/01config-5v5-test.js';
import { getBattleRng } from '../core/13battle-shared.js';
import { CAMP_TYPES, BUFF_TYPES } from '../infra/56-battle-enums.js';

// target 缺省为明教：单机路径行为不变；联网 PVP 下六大派传 CAMP_TYPES.ENEMY
export function createBuffObject(key, duration, target = CAMP_TYPES.ALLY) {
    const buff = { key, target, remaining: duration, name: CONFIG.BUFFS[key]?.name || key };
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

// 按阵营取 buff 列表。引擎侧（core/11）也是同一套归属判定：无 target 的历史 buff 归明教
export function buffsOfCamp(activeBuffs, camp) {
    return (activeBuffs || []).filter(b => camp === CAMP_TYPES.ALLY
        ? (b.target === CAMP_TYPES.ALLY || !b.target)
        : b.target === camp);
}

// activeBuffs 传「本阵营已有 buff」：各阵营独立去重，明教与六大派可各选一次同名 buff
export function generateBuffChoices(activeBuffs, team = [], rng = null) {
    const activeBuffKeys = activeBuffs.map(b => b.key);
    const allKeys = Object.keys(CONFIG.BUFFS);
    const available = allKeys.filter(k => {
        if (activeBuffKeys.includes(k)) return false;
        if (k === BUFF_TYPES.FORTIFY && !activeBuffs.some(b => b.remaining > 0)) return false;
        const requiredRole = CONFIG.BUFF_ROLE_REQUIREMENTS[k];
        if (requiredRole && !team.some(u => u.alive && u.role === requiredRole)) return false;
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
