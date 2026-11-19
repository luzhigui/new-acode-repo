// V1.2.0 | 2026-11-19 智取二段分配 + 回血抢夺：
//   1) 护盾：敌方获得 N → 实得 0.5N，张松溪 0.25N，其血量百分比最低的存活队友 0.25N（无队友则两份全归张松溪）；
//   2) 回血：同口径（由 core/217 HEAL handler 调 stealHealHalf，213/209 补传 enemySide）；
//   3) 图标 🧠 → 💡；偷取成功落「💡 智取」战报行 + 头顶弹幕（pushSkillAnnounce 通道，与吸星同路径）。
// V1.1.0 | 2026-11-19 智取偷盾补提示（战报行 + 弹幕）。
// V1.0.0 | 2026-11-18 张松溪「智取」：抢夺敌方新获护盾的一半。调用点：319 五处 + 216 九阳溢出转盾。

import { applyStatChange, addMod, refreshMaxHp } from '../core/214-battle-shared.js';
import { pushSkillAnnounce } from './305-elite-helpers.js';

const STEALER_NAME = '张松溪';

function findStealer(A, B) {
    return [...(A || []), ...(B || [])].find(u => u && u.alive && u.name === STEALER_NAME) || null;
}

// 张松溪同阵营中「血量百分比最低」的存活队友（不含张松溪、不含战马）；无队友返回 null
function pickNeediestMate(thief, sideUnits) {
    const mates = (sideUnits || []).filter(u => u && u.alive && u !== thief && !u.isHorse);
    if (mates.length === 0) return null;
    return mates.reduce((low, u) => (u.hp / u.maxHp < low.hp / low.maxHp ? u : low), mates[0]);
}

function announceZhiQu(log, thief, detail) {
    if (!Array.isArray(log)) return;
    pushSkillAnnounce(log, thief, '智取', `💡 智取：${detail}`, { floatText: '💡', floatUid: thief.uid });
}

// A/B 全集里张松溪所在阵营的存活成员列表
function sideOf(thief, A, B) {
    return [...(A || []), ...(B || [])].filter(u => u && u.alive && u.camp === thief.camp);
}

/**
 * 护盾抢夺：unit 本要获得 amount 的护盾。
 * 实得 amount - 2×share；share 各归张松溪与 needy（各自 _permShield += share）。
 * @returns {number} 实际留给 unit 的护盾值
 */
export function stealShieldHalf(unit, amount, A, B, ctx) {
    if (!unit || !(amount > 0)) return amount;
    const thief = findStealer(A, B);
    if (!thief || thief.camp === unit.camp) return amount;
    const share = Math.floor(amount / 4);
    if (share <= 0) return amount;
    thief.state._permShield = (thief.state._permShield || 0) + share;
    const mate = pickNeediestMate(thief, sideOf(thief, A, B));
    let detail;
    if (mate) {
        mate.state._permShield = (mate.state._permShield || 0) + share;
        detail = `抢取 ${unit.name} 的护盾 ${amount}（自得 ${share}，分给 ${mate.name} ${share}）`;
    } else {
        thief.state._permShield = (thief.state._permShield || 0) + share;
        detail = `抢取 ${unit.name} 的护盾 ${amount}（无队友，${share * 2} 全并入自身）`;
    }
    announceZhiQu(ctx && ctx.log, thief, detail);
    return amount - share * 2;
}

/**
 * 回血抢夺：target 本要回复 nominal 点生命（已过抑疗、未夹上限）。
 * 实落 nominal - stolen；抢走 2×share 进池，分配（2026-11-19 用户拍板）：
 *   队友（血量百分比最低者）优先吃 → 张松溪吃剩余 → 都吃不下（满血）时溢出的一半永久转为张松溪生命上限。
 * 份额吃满血夹取；溢出转上限走 addMod('maxHp') permanent。
 * @returns {{kept:number, stolen:number}} kept=实落值；stolen=抢走总额
 */
export function stealHealHalf(target, nominal, A, B, ctx) {
    if (!target || !(nominal > 0)) return { kept: nominal, stolen: 0 };
    const thief = findStealer(A, B);
    if (!thief || thief.camp === target.camp) return { kept: nominal, stolen: 0 };
    const share = Math.floor(nominal / 4);
    if (share <= 0) return { kept: nominal, stolen: 0 };
    const mate = pickNeediestMate(thief, sideOf(thief, A, B));
    let pool = share * 2;
    const eaten = { mate: 0, thief: 0, maxHpUp: 0 };
    if (mate) {
        eaten.mate = Math.min(pool, Math.max(0, Math.floor(mate.maxHp - mate.hp)));
        if (eaten.mate > 0) applyStatChange(mate, 'hp', eaten.mate, null, '智取抢血', true, true);
        pool -= eaten.mate;
    }
    eaten.thief = Math.min(pool, Math.max(0, Math.floor(thief.maxHp - thief.hp)));
    if (eaten.thief > 0) applyStatChange(thief, 'hp', eaten.thief, null, '智取抢血', true, true);
    pool -= eaten.thief;
    if (pool > 0) {
        eaten.maxHpUp = Math.floor(pool / 2);
        if (eaten.maxHpUp > 0) {
            addMod(thief, 'maxHp', { source: '智取', value: eaten.maxHpUp, ttl: 'permanent', group: 'zhiQu', op: 'add' });
            refreshMaxHp(thief, null, '智取溢出转上限');
        }
    }
    const stolen = share * 2;
    const parts = [];
    if (mate && eaten.mate > 0) parts.push(`${mate.name} 回血 ${eaten.mate}`);
    if (eaten.thief > 0) parts.push(`张松溪 回血 ${eaten.thief}`);
    if (eaten.maxHpUp > 0) parts.push(`溢出 ${pool} 的一半转生命上限 +${eaten.maxHpUp}`);
    // 战报行自动带「智取（…，原 N）」后缀：healModReasons 读该临时字段（core/217 消费后清除）
    target.state._zhiQuNote = `智取（张松溪抢 ${stolen}）`;
    announceZhiQu(ctx && ctx.log, thief, `抢取 ${target.name} 的回血 ${stolen}（${parts.join('；') || '无人可吃'}）`);
    return { kept: nominal - stolen, stolen };
}
