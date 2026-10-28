// render/32grid-badges.js — 格子内展示计算（计数徽章 / 闪避分解 / buff 受益判定）
// V1.0.0 | 2026-10-18 | ~5300 bytes
//   buildCountBadge / getDodgeBreakdown / isUnitBenefitedByBuff 整块迁入。
//   只依赖传入的 unit/team/buffs，不碰 DOM、不碰 store（渲染主循环调用它们取值）。
export const VER = 'render/32grid-badges.js V1.0.0';

import { CONFIG } from '../core/01config-5v5-test.js';
import { ROLE_TYPES, BUFF_TYPES } from '../infra/56-battle-enums.js';
import { getDodgeRules } from '../core/20-registry-dodge.js';
import { computeBuffStats } from '../core/04buff-system.js';
import { getUnitCol, getUnitRow } from '../infra/51-core-utils.js';

// 计数技能进度徽章：进度型（凑 N 次触发）在角色名后显示「当前档/N」小胶囊，
//   不用头顶大红数字（旧版被否）；当前档随计数推进，满档触发后回到 1。
export function buildCountBadge(unit) {
    if (!unit || !unit.alive) return '';
    // 灭绝师太·三击：state._attackCount=打中次数（含反击/跟随被动出手），3 档循环
    if (unit.isMieJueShiTai) {
        const n = unit.state._attackCount || 0;
        if (n > 0) return `<span class="count-badge count-mj">${((n - 1) % 3) + 1}/3</span>`;
    }
    // 唐文亮·七伤：state._qiShangCount=七伤自损累计，7 档循环
    if (unit.isTangWenLiang) {
        const n = unit.state._qiShangCount || 0;
        if (n > 0) return `<span class="count-badge count-tw">${((n - 1) % 7) + 1}/7</span>`;
    }
    // 张无忌·近战连击：near 形态打够 3 次（ZHANG_NEAR_ATK_LIMIT）转融会贯通，显示当前连击进度
    if (unit.isZhang && unit.state._fsmPhase === 'near') {
        const n = unit.nearAtkCount || 0;
        if (n > 0) return `<span class="count-badge count-zw">${Math.min(n, 3)}/3</span>`;
    }
    return '';
}

export function getDodgeBreakdown(unit, activeBuffs, allyTeam) {
    const sources = [];
    const rates = [];
    let seenFlightBase = false;

    const _dodgeRules = getDodgeRules();
    for (const ruleFn of _dodgeRules) {
        const rate = ruleFn(unit, null) || 0;
        if (rate > 0) {
            let label = '';
            if (unit.role === ROLE_TYPES.FLYER && rate === 0.15 && !seenFlightBase) {
                label = '飞行基础';
                seenFlightBase = true;
            } else if (unit.role === ROLE_TYPES.FLYER && rate === 0.15 && seenFlightBase) {
                label = '青翼蝠王';
            } else if (unit.role !== ROLE_TYPES.FLYER && rate === CONFIG.BASE_DODGE_GROUND) {
                label = '地面基础';
            } else if (unit.isWei && rate !== 0.15) {
                label = '残血幻影';
            } else {
                label = '规则闪避';
            }
            sources.push({ label, value: Math.round(rate * 100) });
            rates.push(rate);
        }
    }

    // 改走 computeBuffStats 现算：buffDodgeBonus 是 V6.1.1 词条化时剥离掉的顶层字段，
    //   全库已无写入源（原读法让「流云身法」这行永远读不到值）。闪避真值本来就由本函数现算，与 core/10、core/12 同源。
    const buffStats = computeBuffStats(unit, activeBuffs || [], allyTeam);
    if (buffStats.dodgeBonus > 0) {
        sources.push({ label: '流云身法', value: Math.round(buffStats.dodgeBonus * 100) });
        rates.push(buffStats.dodgeBonus);
    }

    let combined = 0;
    if (rates.length > 0) {
        let product = 1;
        for (const r of rates) product *= (1 - r);
        combined = Math.round((1 - product) * 100);
    }

    return { sources, combined };
}

export function isUnitBenefitedByBuff(unit, buffKey, allyTeam, doubleStrikeUid, activeBuffs) {
    switch (buffKey) {
        case BUFF_TYPES.CARRY: return unit.pos === 5 && unit.alive;
        case BUFF_TYPES.METEOR_SHOWER: return unit.role === ROLE_TYPES.RANGED;
        case BUFF_TYPES.BLOODTHIRST: return unit.role === ROLE_TYPES.WARRIOR;
        case BUFF_TYPES.FORTIFY: return unit.role === ROLE_TYPES.DEFENDER;
        case BUFF_TYPES.WIND_ASSAULT: return unit.role === ROLE_TYPES.FLYER;
        case BUFF_TYPES.CLOUD_BODY: return !unit.state?._cloudBodySkip;
        case BUFF_TYPES.HOLY_FLAME: {
            if (!activeBuffs) return false;
            const holyBuffs = activeBuffs.filter(b => b.key === BUFF_TYPES.HOLY_FLAME);
            return holyBuffs.some(b => {
                const cols = b.cols || (b.col != null ? [b.col] : []);
                const rows = b.rows || (b.row != null ? [b.row] : []);
                return cols.includes(getUnitCol(unit.pos)) || rows.includes(getUnitRow(unit.pos));
            });
        }
        case BUFF_TYPES.HOT_BLOOD: return true;
        case BUFF_TYPES.DOUBLE_STRIKE: return Array.isArray(doubleStrikeUid) ? doubleStrikeUid.includes(unit.uid) : (unit.uid === doubleStrikeUid && doubleStrikeUid != null);
        case BUFF_TYPES.HORSE_FORMATION: return false;
        case BUFF_TYPES.MIND_CONTROL: {
            if (!allyTeam) return false;
            let frontUnit = allyTeam.filter(u => u.alive && !u.isHorse).sort((a, b) => a.pos - b.pos)[0];
            return frontUnit && unit.uid === frontUnit.uid;
        }
        default: return false;
    }
}