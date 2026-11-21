﻿// V1.2.6 | 2026-11-20 智取抢来的回血补飘字：张松溪/受益队友吃血后推 HEAL fact（💡 智取），血条不再无声上涨。
// V1.2.7 | 2026-11-21 补版本日志行（VER 常量已抬，漏写本行致 ver-drift 判领先）。
// V1.2.5 | 2026-11-20 智取回血改为各分一半：张松溪固定先拿自己那份（队友满血吃不完才转给他），
//   修「抢来的回血全喂给没满血的队友、张松溪一点不分」。
// V1.2.4 | 2026-11-19 智取分配排除已死/待死单位：hp=0 或 _pendingDeath 不再吃盾、不再回血、不当抢血目标
//   （老板报「殷梨亭血量已归零，智取还给他分了护盾」——alive 要等死亡结算才翻 false）。
// V1.2.3 | 2026-11-19 直回血出口纳入智取：飞行再生/休息回血（不走 HEAL 声明）经 214 前置钩子抢三成×2；
//   战报行带「智取（…，原 N）」后缀（飞行再生走 healMods、休息回复走 PASS 的 zhiQuNote）。
// V1.2.2 | 2026-11-19 智取文案小数点约整（fmtNum 同口径）：护盾/回血/溢出转上限数字不再露长浮点；
//   顺手修正「溢出一半转上限」旧文案——实际早已是 100% 转（V1.2.0 拍板）。
// V1.2.1 | 2026-11-19 连续智取合并灯泡：同一步内张松溪已报过「智取」→ 后续只落战报行，不再重复飞 💡
// V1.2.0 | 2026-11-19 智取二段分配 + 回血抢夺：
//   1) 护盾：敌方获得 N → 实得 0.5N，张松溪 0.25N，其血量百分比最低的存活队友 0.25N（无队友则两份全归张松溪）；
//   2) 回血：同口径（由 core/217 HEAL handler 调 stealHealHalf，213/209 补传 enemySide）；
//   3) 图标 🧠 → 💡；偷取成功落「💡 智取」战报行 + 头顶弹幕（pushSkillAnnounce 通道，与吸星同路径）。
// V1.1.0 | 2026-11-19 智取偷盾补提示（战报行 + 弹幕）。
// V1.0.0 | 2026-11-18 张松溪「智取」：抢夺敌方新获护盾的一半。调用点：319 五处 + 216 九阳溢出转盾。

import { applyStatChange, addMod, refreshMaxHp, recordHpAudit, setHealStealHook } from '../core/214-battle-shared.js';
import { isEffectivelyAlive } from '../core/203-battle-utils.js';
import { pushSkillAnnounce } from './305-elite-helpers.js';
import { FACT_TYPES } from '../infra/106-battle-enums.js';
import { fmtNum } from '../infra/102-core-utils.js';

export const VER = 'modules/341-common-shield-steal.js V1.2.7';

const STEALER_NAME = '张松溪';

// 有效存活统一走 core/203 单点判据：alive 要等死亡结算才翻 false，hp 已归零 / 已挂待死标记的单位
//   不能再吃护盾、回血或当抢血目标（2026-11-19 老板报「殷梨亭血量归零了，智取还给他分了护盾」）。
const isValid = isEffectivelyAlive;

function findStealer(A, B) {
    return [...(A || []), ...(B || [])].find(u => isValid(u) && u.name === STEALER_NAME) || null;
}

// 张松溪同阵营中「血量百分比最低」的存活队友（不含张松溪、不含战马）；无队友返回 null
function pickNeediestMate(thief, sideUnits) {
    const mates = (sideUnits || []).filter(u => isValid(u) && u !== thief && !u.isHorse);
    if (mates.length === 0) return null;
    return mates.reduce((low, u) => (u.hp / u.maxHp < low.hp / low.maxHp ? u : low), mates[0]);
}

function announceZhiQu(log, thief, detail) {
    if (!Array.isArray(log)) return;
    // 连续智取合并灯泡（2026-11-19 老板拍板）：同一步内已报过「智取」→ 本条只落战报行，不再飞第二个 💡。
    //   判据从尾部往前找：先遇到张松溪的智取公告 → 合并；先遇到攻击事实 → 不是连击，正常飞。
    let merged = false;
    for (let i = log.length - 1; i >= 0; i--) {
        const f = log[i];
        if (!f || !f.data) continue;
        if (f.data.attacker && f.data.attacker.uid) break;               // 中间隔了攻击 → 不算连续
        if (f.factType === FACT_TYPES.SKILL_ANNOUNCE && f.data.unitUid === thief.uid && f.data.skillName === '智取') {
            merged = true;
            break;
        }
    }
    pushSkillAnnounce(log, thief, '智取', `💡 智取：${detail}`, merged ? {} : { floatText: '💡', floatUid: thief.uid });
}

// A/B 全集里张松溪所在阵营的存活成员列表
function sideOf(thief, A, B) {
    return [...(A || []), ...(B || [])].filter(u => isValid(u) && u.camp === thief.camp);
}

// 抢来的回血也走回血飘字（2026-11-20）：受益者吃血后推一条 HEAL fact（💚 智取），
//   与目标那侧的「飞行再生/休息回复」动效同源，避免血条无声上涨。
//   老板澄清：要的是回血数值飘字，不是技能灯泡——icon 用 💚，fx 走 heal 数值。
function pushZhiQuHeal(log, unit, hpBefore, heal) {
    if (!Array.isArray(log) || !(heal > 0)) return;
    log.push({
        factType: FACT_TYPES.HEAL,
        data: {
            unitName: unit.name, unitUid: unit.uid,
            heal, maxHp: unit.maxHp, stacks: 1,
            hpBefore, hpAfter: unit.hp,
            icon: '💚', label: '智取'
        }
    });
}

/**
 * 护盾抢夺：unit 本要获得 amount 的护盾。
 * 实得 amount - 2×share；share 各归张松溪与 needy（各自 _permShield += share）。
 * @returns {number} 实际留给 unit 的护盾值
 */
export function stealShieldHalf(unit, amount, A, B, ctx) {
    if (!isValid(unit) || !(amount > 0)) return amount;
    const thief = findStealer(A, B);
    if (!thief || thief.camp === unit.camp) return amount;
    const share = Math.floor(amount * 0.3);   // 抢夺比例 0.6：两份各 0.3，敌方实得 0.4（2026-11-19 用户拍板）
    if (share <= 0) return amount;
    thief.state._permShield = (thief.state._permShield || 0) + share;
    const mate = pickNeediestMate(thief, sideOf(thief, A, B));
    let detail;
    if (mate) {
        mate.state._permShield = (mate.state._permShield || 0) + share;
        detail = `抢取 ${unit.name} 的护盾 ${fmtNum(amount)}（自得 ${share}，分给 ${mate.name} ${share}）`;
    } else {
        thief.state._permShield = (thief.state._permShield || 0) + share;
        detail = `抢取 ${unit.name} 的护盾 ${fmtNum(amount)}（无队友，${share * 2} 全并入自身）`;
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
    if (!isValid(target) || !(nominal > 0)) return { kept: nominal, stolen: 0 };
    const thief = findStealer(A, B);
    if (!thief || thief.camp === target.camp) return { kept: nominal, stolen: 0 };
    const share = Math.floor(nominal * 0.3);   // 抢夺比例 0.6：两份各 0.3（2026-11-19 用户拍板）
    if (share <= 0) return { kept: nominal, stolen: 0 };
    const mate = pickNeediestMate(thief, sideOf(thief, A, B));
    // 分配（2026-11-20 老板拍板）：抢来的两半各归一个人——张松溪固定先拿自己那一半，
    //   不再「队友吃满才轮到张松溪」（旧顺序会把回血全喂给没满血的队友，张松溪一点不剩）。
    const eaten = { mate: 0, thief: 0, maxHpUp: 0 };
    let toThief = share;
    if (mate) {
        eaten.mate = Math.min(share, Math.max(0, Math.floor(mate.maxHp - mate.hp)));
        if (eaten.mate > 0) {
            const before = mate.hp;
            applyStatChange(mate, 'hp', eaten.mate, thief, '智取抢血', true, true);   // 产出者=张松溪：抢来的血算张松溪的治疗产出（214 治疗记账口径）
            recordHpAudit(mate, 'zhiQuHeal', eaten.mate, '智取抢血');
            pushZhiQuHeal(ctx && ctx.log, mate, before, eaten.mate);
        }
        toThief += share - eaten.mate;   // 队友满血吃不完的，转给张松溪
    } else {
        toThief += share;                // 无队友：两半都归张松溪
    }
    eaten.thief = Math.min(toThief, Math.max(0, Math.floor(thief.maxHp - thief.hp)));
    if (eaten.thief > 0) {
        const before = thief.hp;
        applyStatChange(thief, 'hp', eaten.thief, thief, '智取抢血', true, true);
        recordHpAudit(thief, 'zhiQuHeal', eaten.thief, '智取抢血');
        pushZhiQuHeal(ctx && ctx.log, thief, before, eaten.thief);
    }
    const pool = toThief - eaten.thief;
    if (pool > 0) {
        eaten.maxHpUp = pool;   // 溢出 100% 转生命上限（2026-11-19 用户拍板，原为一半）
        if (eaten.maxHpUp > 0) {
            addMod(thief, 'maxHp', { source: '智取', value: eaten.maxHpUp, ttl: 'permanent', group: 'zhiQu', op: 'add' });
            refreshMaxHp(thief, null, '智取溢出转上限');
        }
    }
    const stolen = share * 2;
    const parts = [];
    if (mate && eaten.mate > 0) parts.push(`${mate.name} 回血 ${fmtNum(eaten.mate)}`);
    if (eaten.thief > 0) parts.push(`张松溪 回血 ${fmtNum(eaten.thief)}`);
    if (eaten.maxHpUp > 0) parts.push(`溢出 ${fmtNum(pool)} 转生命上限 +${fmtNum(eaten.maxHpUp)}`);
    // 战报行自动带「智取（…，原 N）」后缀：healModReasons 读该临时字段（core/217 消费后清除）
    target.state._zhiQuNote = `智取（张松溪抢 ${fmtNum(stolen)}）`;
    announceZhiQu(ctx && ctx.log, thief, `抢取 ${target.name} 的回血 ${fmtNum(stolen)}（${parts.join('；') || '无人可吃'}）`);
    return { kept: nominal - stolen, stolen };
}

// 注册「直回血出口」的前置钩子（2026-11-19 老板拍板：飞行再生/休息回血也可被智取）：
//   这两条不走 EFFECT_TYPES.HEAL 声明，core 侧在 applyStatChange 前调 stealHealByHook 过这里；
//   core 不反向 import modules，故由本模块自注册。
setHealStealHook((unit, amount, A, B, log) => stealHealHalf(unit, amount, A, B, { log }).kept);

