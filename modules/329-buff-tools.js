// modules/329-buff-tools.js — 海克斯池过滤、生成、计时与通用海克斯工具函数
// V6.2.12 | 2026-11-17 专属海克斯改制（老板拍板）：① 新增 familyOf（读 content 的 xxxExclusive 家族标记）
//   与 pickBuffChoices（家族折叠：抽中任一成员即整族一起进候选）；② recordUsedBuffKey 改整族登记，
//   filterAvailableBuffs 改整族排除 ⇒ 选定一个专属后另两个终身不再出现；③ generateBuffChoices 改走家族折叠。
export const VER = 'modules/329-buff-tools.js V6.2.12';

import { CONFIG, getSisterHexEnhance } from '../core/201-config-5v5-test.js';
import { getBattleRng } from '../core/214-battle-shared.js';
import { GlobalStore } from '../infra/104-global-store.js';
import { CAMP_TYPES, BUFF_TYPES } from '../infra/106-battle-enums.js';

// target 缺省为明教：单机路径行为不变；联网 PVP 下六大派传 CAMP_TYPES.ENEMY
// team 用于动态计算部分海克斯的时长（如姐姐强化流星赶月）
export function createBuffObject(key, duration = null, target = CAMP_TYPES.ALLY, team = []) {
    const cfg = CONFIG.BUFFS[key] || {};
    
    // 时长收口：如果外部没传 duration，内部根据配置和当前队伍状态自行判定
    if (duration == null) {
        if (cfg.permanent) {
            duration = CONFIG.MAX_ROUND;
        } else if (key === BUFF_TYPES.METEOR_SHOWER && team.some(u => u.isXiaoZhaoSister && u.alive)) {
            const meteorEnh = getSisterHexEnhance('meteorShower');
            if (!meteorEnh || meteorEnh.duration == null) {
                throw new Error('002-hex-enhance.json 缺 sister.meteorShower.duration');
            }
            duration = meteorEnh.duration;
        } else if ((key === BUFF_TYPES.HOT_BLOOD || key === BUFF_TYPES.WIND_ASSAULT || key === BUFF_TYPES.UNITY) && team.some(u => u.isXiaoZhaoSister && u.alive)) {
            // 姊强化：热血奋战 / 乘风突袭 / 众志成城 持续 +N 回合（201 sister.extraDuration，缺则炸）
            const enhKey = key === BUFF_TYPES.HOT_BLOOD ? 'hotBlood'
                : (key === BUFF_TYPES.WIND_ASSAULT ? 'windAssault' : 'unity');
            const sisterEnh = getSisterHexEnhance(enhKey);
            if (!sisterEnh || sisterEnh.extraDuration == null) {
                throw new Error(`002-hex-enhance.json 缺 sister.${enhKey}.extraDuration`);
            }
            duration = (cfg.duration || CONFIG.BUFF_DURATION || 4) + sisterEnh.extraDuration;
        } else {
            duration = cfg.duration || CONFIG.BUFF_DURATION || 4;
        }
    }

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
// 记录已选过的「全场唯一」海克斯；选 buff 的四处流程（手选/全自动/联网/双海克斯）统一调这里
//   全场唯一 = carry / permanent 海克斯（圣火不熄、背水一战）/ 专属海克斯（content 里带 heroRequirement 的）
export function recordUsedBuffKey(key) {
    if (!key) return;
    const def = CONFIG.BUFFS[key] || {};
    const isExclusive = key === BUFF_TYPES.CARRY || key === BUFF_TYPES.HOLY_FIRE || key === BUFF_TYPES.LAST_STAND || !!def.heroRequirement;
    if (!isExclusive) return;
    const used = GlobalStore.get('usedBuffKeys') || [];
    // 家族整族登记（2026-11-17）：选了「快来护驾」⇒ 我命由我 / 武学奇才 一并记入已用。
    //   否则过滤层「同族任一被用即整族排除」缺数据源，另两个还能再进池。
    const fam = familyOf(key);
    const toAdd = fam
        ? Object.keys(CONFIG.BUFFS).filter(k => familyOf(k) === fam)
        : [key];
    const next = [...used];
    let changed = false;
    for (const k of toAdd) if (!next.includes(k)) { next.push(k); changed = true; }
    if (changed) GlobalStore.set('usedBuffKeys', next);
}

// ── 专属海克斯家族（2026-11-17 老板拍板）────────────────────────
//   规则三条：① 与普通海克斯等概率、任何回合格都能被抽到（不再有「开局专属弹窗 + 0.2 概率」）；
//   ② 抽中家族任一成员 → 把该家族其余成员一起拉进候选（弹窗里就是「三选一」）；
//   ③ 选定任一成员 → 整家族终身不再进池（这才是「专属」的强度：一局只有一条路线）。
//   家族键 = content 里形如 `xxxExclusive: true` 的布尔字段（现只有 zhangExclusive 三个）。
//   ⚠ 该字段此前是**纯摆设、全库零读取**，本轮起它是家族归属的唯一真源。
export function familyOf(key) {
    const def = CONFIG.BUFFS[key];
    if (!def) return null;
    for (const field in def) {
        if (field.endsWith('Exclusive') && def[field] === true) return field;
    }
    return null;
}

// 洗牌后按「家族折叠成 1 个抽取单元」取候选：家族成员各算一个单元，抽中一个即代表抽中整族。
// 展开时家族优先占位、普通海克斯只填剩余槽，故家族总超过 choices 时不截断（弹窗按钮自适应）。
export function pickBuffChoices(available, rng = null, choicesCount = null) {
    const r = rng || getBattleRng();
    const shuffled = [...available];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = r.nextInt(0, i);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // 折叠：同族成员只占 1 个抽取单元（第二个及以后不重复占位）
    const units = [];
    const seenFam = new Set();
    for (const k of shuffled) {
        const fam = familyOf(k);
        if (!fam) { units.push({ key: k }); continue; }
        if (seenFam.has(fam)) continue;
        seenFam.add(fam);
        units.push({ fam, keys: shuffled.filter(x => familyOf(x) === fam) });
    }
    const n = choicesCount == null ? CONFIG.BUFF_CHOICES : choicesCount;
    const chosen = units.slice(0, n);
    const fams = chosen.filter(u => u.fam);
    const plain = chosen.filter(u => !u.fam);
    const out = [];
    for (const f of fams) out.push(...f.keys);
    const slots = Math.max(0, n - out.length);
    out.push(...plain.slice(0, slots).map(u => u.key));
    return out;
}

// 获得专属 buff 时的一次性效果（「快来护驾」召唤）**不在本文件实现**：
//   引擎每回合用 state.ally.map(clone) 重建 A/B（core/210），UI 侧队伍数组是 filter 副本，
//   往那里 push 新单位下一回合就丢。故召唤归属 core/204 的 spawnZhangRescueIfNeeded，
//   由 core/210 的 applyRoundStartSpawns 在回合开头调用（与众志成城同款时机）。

export function filterAvailableBuffs(activeBuffs, team = [], opts = {}) {
    const { withFortifyRule = false, enemyTeam = [] } = opts;
    const ab = activeBuffs || [];
    const activeBuffKeys = ab.map(b => b.key);
    const usedKeys = opts.usedKeys || GlobalStore.get('usedBuffKeys') || [];
    const alive = (team || []).filter(u => u && u.alive);
    return Object.keys(CONFIG.BUFFS).filter(k => {
        if (activeBuffKeys.includes(k)) return false;
        // 全场只能选一次：carry + permanent 海克斯（背水一战 / 圣火不熄）
        //   permanent 靠 remaining=MAX_ROUND 天然不会再进池，但那是数值挡；这里补机制挡，防未来 duration 改动。
        if ((k === BUFF_TYPES.CARRY || k === BUFF_TYPES.HOLY_FIRE || k === BUFF_TYPES.LAST_STAND) && usedKeys.includes(k)) return false;
        if (withFortifyRule && k === BUFF_TYPES.FORTIFY && !ab.some(b => b.remaining > 0)) return false;
        // 众志成城门槛：本阵营「场上存活人数 ≤ 5」时都可能出现——
        //   人数口径含拒马/幼狮/雄鹰等召唤物（与 core/04 applyUnityBonus 同口径）；超过 5 人（即满 6 人）不进候选
        if (k === BUFF_TYPES.UNITY && alive.length > 5) return false;
        // 圣火令：场上存活角色 < 3 时不再出现（包含召唤物）
        if (k === BUFF_TYPES.HOLY_FLAME && alive.length < 3) return false;
        // 背水一战：场上存活角色 < 3 时不再出现，避免残局选了纯占位
        if (k === BUFF_TYPES.LAST_STAND && alive.length < 3) return false;
        // 惑人心智：双方存活人数都必须大于 2（至少3人才能换位）
        if (k === BUFF_TYPES.MIND_CONTROL && (alive.length <= 2 || enemyTeam.length <= 2)) return false;
        const requiredRole = CONFIG.BUFF_ROLE_REQUIREMENTS[k];
        if (requiredRole && !alive.some(u => u.role === requiredRole)) return false;
        // 专属海克斯（2026-11-13）：heroRequirement 指定哪个身份标记必须在场
        //   content 里 buff.heroRequirement = 'isWei' → 只有韦一笑在场才进候选池（六大派抽不到）
        //   requires='noCharge' → 该角色正在蓄力时也不进池（寒离飒强化「必须他未蓄力」）
        //   全场唯一：已选过的专属海克斯不再进池（与 carry / permanent 同口径的机制挡）
        const heroReq = CONFIG.BUFFS[k].heroRequirement;
        if (heroReq) {
            // 家族整族锁（2026-11-17）：同族任一成员被选中 ⇒ 其余成员也终身不再进池。
            //   原来只判 `usedKeys.includes(k)`（单个 key），选完「快来护驾」另外两个照样能再进池。
            const fam = familyOf(k);
            if (fam) {
                const famUsed = Object.keys(CONFIG.BUFFS).some(x => familyOf(x) === fam && usedKeys.includes(x));
                if (famUsed) return false;
            } else if (usedKeys.includes(k)) return false;
            const hero = alive.find(u => u[heroReq]);
            if (!hero) return false;
            if (CONFIG.BUFFS[k].requires === 'noCharge' && (hero.state?._hlsCharging || 0) !== 0) return false;
        }
        return true;
    });
}

// activeBuffs 传「本阵营已有 buff」：各阵营独立去重，明教与六大派可各选一次同名 buff
// enemyTeam：对方阵营存活单位——惑人心智门槛读它，不传等于恒剔除该项（V6.2.6 补参数）
export function generateBuffChoices(activeBuffs, team = [], rng = null, enemyTeam = []) {
    const available = filterAvailableBuffs(activeBuffs, team, { withFortifyRule: true, enemyTeam });
    // 家族折叠交给 pickBuffChoices 单点处理（与 ui/711 手选弹窗同口径）
    return pickBuffChoices(available, rng);
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

// 妹永久账本写入：开局选 buff（ui/702）与每 3 回合选 buff（player/512）共用。
//   写到 GlobalStore 独立账本，不写 store 里妹的 state（会被 syncStoreFromStep 整份覆盖），
//   也不依赖 activeBuffs（remaining 归零即删）。账本只增不减，回合末由 player/503 覆盖进引擎。
//   幂等：同 key 不重复写。target 强制 ALLY——防双海克斯模式下六大派 buff 混进妹账本。
export function recordXiaoZhaoPermanentBuff(buff) {
    if (!buff || !buff.key) return;
    const white = CONFIG.XIAO_ZHAO_PERMANENT_BUFFS || [];
    if (!white.includes(buff.key)) return;
    const ledger = GlobalStore.get('xiaoZhaoPermanentBuffs') || [];
    if (ledger.some(b => b.key === buff.key)) return;
    ledger.push({ key: buff.key, name: buff.name, target: CAMP_TYPES.ALLY, remaining: Infinity });
    GlobalStore.set('xiaoZhaoPermanentBuffs', ledger);
}