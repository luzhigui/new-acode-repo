// V6.2.2 | ~4400 bytes | 2026-10-14 圣火令基础版口径收口为「1 列 + 2 行」（老板确认正式服即两行一列）：
//          createBuffObject 原写死抽 2列+2行，与 modules/27 每回合重掷（无姊 1列2行 / 有姊 2列2行）及 content desc 三处不一致
// V6.2.1 | ~4300 bytes | 2026-10-13 「整局」海克斯支持（圣火不熄）：createBuffObject 读 content permanent:true →
//          时长取 CONFIG.MAX_ROUND（不用 Infinity，防对象过 JSON 时被序列化成 null 丢 buff）；
//          getActiveBuffList 显示点渲染成「整局」而非回合数
// V6.2.0 | ~2300 bytes | 2026-10-06 carry 候选过滤：无 carry 位（5 号；小昭·姊在场放宽 4/5/6）则不进候选
export const VER = 'modules/28buff-tools.js V6.2.2';

import { CONFIG } from '../core/01config-5v5-test.js';
import { getBattleRng } from '../core/13battle-shared.js';
import { CAMP_TYPES, BUFF_TYPES } from '../infra/56-battle-enums.js';

// target 缺省为明教：单机路径行为不变；联网 PVP 下六大派传 CAMP_TYPES.ENEMY
export function createBuffObject(key, duration, target = CAMP_TYPES.ALLY) {
    // 2026-10-13 「整局」海克斯（content 打 permanent:true，如圣火不熄）：时长按引擎回合上限，确保整局不过期
    //   ——全部抽卡入口（player/49、ui/65、ui/70、tools/116）都汇聚本函数，只此一处映射；
    //   不用 Infinity：buff 对象进 PVP 下发/回放可能过 JSON，Infinity 会被序列化成 null 反而丢 buff。
    //   permanent 标记随对象下发，供各显示点渲染成「整局」而不是回合数
    const cfg = CONFIG.BUFFS[key] || {};
    const buff = { key, target, remaining: cfg.permanent ? CONFIG.MAX_ROUND : duration, name: cfg.name || key };
    if (cfg.permanent) buff.permanent = true;
    if (key === BUFF_TYPES.HOLY_FLAME) {
        // 2026-10-14 基础版形状 = 1 列 + 2 行（与 modules/27 每回合重掷的无姊口径、content desc 三处对齐）：
        //   创建值在每回合开头即被重掷覆盖，这里只保证首帧/工具口径与正式服一致，不额外抽第二列。
        const rng = getBattleRng();
        const cols = [rng.nextInt(1, 3)];
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

// carry 只在「carry 位」有活人时才有效：5 号位；小昭·姊在场放宽到 4/5/6（与 core/04 的 carryPositions 同口径）。
// 无 carry 位则无可加成对象 → 不进候选（手动弹窗与自动选同此判据）。
export function hasCarryTarget(team) {
    const sister = team.some(u => u.alive && u.isXiaoZhaoSister);
    const positions = sister ? [4, 5, 6] : [5];
    return team.some(u => u.alive && positions.includes(u.pos));
}

// activeBuffs 传「本阵营已有 buff」：各阵营独立去重，明教与六大派可各选一次同名 buff
export function generateBuffChoices(activeBuffs, team = [], rng = null) {
    const activeBuffKeys = activeBuffs.map(b => b.key);
    const allKeys = Object.keys(CONFIG.BUFFS);
    const available = allKeys.filter(k => {
        if (activeBuffKeys.includes(k)) return false;
        if (k === BUFF_TYPES.FORTIFY && !activeBuffs.some(b => b.remaining > 0)) return false;
        if (k === BUFF_TYPES.CARRY && !hasCarryTarget(team)) return false;
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
    return activeBuffs.map(b => b.name + '(' + (b.permanent ? '整局' : b.remaining + '回') + ')').join('、') || '无';
}
