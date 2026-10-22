// V6.2.5 | 2026-10-16 | ~5300 bytes
//          （拒马/幼狮/雄鹰等召唤物都算人，与 core/04 applyUnityBonus 同口径）时才可能进入候选
export const VER = 'modules/28buff-tools.js V6.2.5';

import { CONFIG } from '../core/01config-5v5-test.js';
import { getBattleRng } from '../core/13battle-shared.js';
import { CAMP_TYPES, BUFF_TYPES } from '../infra/56-battle-enums.js';

// target 缺省为明教：单机路径行为不变；联网 PVP 下六大派传 CAMP_TYPES.ENEMY
export function createBuffObject(key, duration, target = CAMP_TYPES.ALLY) {
    // 「整局」海克斯（content 打 permanent:true，如圣火不熄）：时长按引擎回合上限，确保整局不过期
    //   ——全部抽卡入口（player/49、ui/65、ui/70、tools/116）都汇聚本函数，只此一处映射；
    //   不用 Infinity：buff 对象进 PVP 下发/回放可能过 JSON，Infinity 会被序列化成 null 反而丢 buff。
    //   permanent 标记随对象下发，供各显示点渲染成「整局」而不是回合数
    const cfg = CONFIG.BUFFS[key] || {};
    const buff = { key, target, remaining: cfg.permanent ? CONFIG.MAX_ROUND : duration, name: cfg.name || key };
    if (cfg.permanent) buff.permanent = true;
    if (key === BUFF_TYPES.HOLY_FLAME) {
        // 基础版形状 = 1 列 + 2 行（与 modules/27 每回合重掷的无姊口径、content desc 三处对齐）：
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

// 老板拍板放开门槛：carry 随时可入选，主代码不再调用本判据——
//   5 号位无人时改由 core/04 spawnCarryEagle 召唤「雄鹰」顶位（雄鹰命中后恢复队友行动力 / 无人可恢复时召雌鹰）。
//   函数保留导出供 tools/ 与 tests/ 复用（那边同步前仍引用，删会断链）；受益面仍由 core/04 carryPositions 决定。
export function hasCarryTarget(team) {
    return team.some(u => u.alive && u.pos === 5);
}

// 候选池过滤收口：116（两处）/ 122 原各自复制一份同样的过滤逻辑，加条件要改 3~4 处；
// 现统一由本函数提供，generateBuffChoices 也改调它（行为不变）。
// opts.withFortifyRule：116 职业平衡 job 专用（无剩余 buff 时禁选严阵以待），默认关；116 hex job / 122 不开。
// 注意：V6.2.4 已按老板拍板删掉 carry 过滤（无 5 号位时 core/04 会召唤雄鹰顶位），本函数同样不含。
export function filterAvailableBuffs(activeBuffs, team = [], opts = {}) {
    const { withFortifyRule = false } = opts;
    const ab = activeBuffs || [];
    const activeBuffKeys = ab.map(b => b.key);
    const alive = (team || []).filter(u => u && u.alive);
    return Object.keys(CONFIG.BUFFS).filter(k => {
        if (activeBuffKeys.includes(k)) return false;
        if (withFortifyRule && k === BUFF_TYPES.FORTIFY && !ab.some(b => b.remaining > 0)) return false;
        // 众志成城门槛（老板拍板）：只有本阵营「场上存活人数 < 4」时才可能出现——
        //   人数口径含拒马/幼狮/雄鹰等召唤物（与 core/04 applyUnityBonus 同口径）；满 4 人及以上不进候选
        if (k === BUFF_TYPES.UNITY && alive.length >= 4) return false;
        const requiredRole = CONFIG.BUFF_ROLE_REQUIREMENTS[k];
        if (requiredRole && !alive.some(u => u.role === requiredRole)) return false;
        return true;
    });
}

// activeBuffs 传「本阵营已有 buff」：各阵营独立去重，明教与六大派可各选一次同名 buff
export function generateBuffChoices(activeBuffs, team = [], rng = null) {
    const available = filterAvailableBuffs(activeBuffs, team, { withFortifyRule: true });
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
