// modules/330-battle-init.js — 双方阵容生成（M107/M104/M100 分层 / 额外混入 / 站位锚点）
// 明教（我方）：Boss 张无忌 20% 独掷；Boss 局 25% 再配 1 强精英；无 Boss 局必出 1 强、其中 35% 再 1 强（双强）。
//   M104 只从弱精英池（杨逍/殷天正）取，M100 从带技能普通兵池（周颠/说不得/彭莹玉/张中/反伤弟子）取，
//   剩余空位从普通兵池等概率补齐；队伍一律不超过 5 人，同档不取重名。
// 六大派：保留 WEAK_ELITE_MIX_RATE（M104 混入），另加 M107 20% / M100 30% 两档独立判定；
//   只替换「非具名、且不属本关固定精英池」的杂兵位，找不到杂兵位就放弃，绝不顶掉关卡固定精英。
//   额外混入按关卡解锁范围过滤：后段专属精英（如灭绝师太只属第7关固定池）不得提前出现在前段关，
//   越界则本次不补（少补一人），不删名单也保证后段该出还能出。
//   骰子一律先掷后判、RNG 流双端同源——force 只改「是否应用」，不改消耗序列。
// V7.9.0 | 2026-11-09 明教必出 107：无 Boss 局强精英判定 80% → 100%（每局至少一个 107）； 无 107 兜底分支改为「M104 弱精英拉满 + M100 带技能补满」，不再用普通杂兵凑人数。
export const VER = 'modules/330-battle-init.js V7.9.0';

// ── RNG 抽签契约版本（initBattleTeams 内随机数消耗的「次数 + 顺序」指纹）──
// 为什么必须有：V7.6.7 把明教骰子 3→7、六大派骰子 2→6 时没有任何版本标记，
//   冻结种子回放、历史基线、双端联机分布全部失配却无从识别「是哪一版抽出来的」。
// 改动触发条件（任一发生就必须改这里，并同步重录 tests/rng-draw-baseline.json）：
//   ① 增删任何一颗骰子；② 调换抽签顺序；③ 改变 pick / nextInt 的调用次数。
// 当前 rng-contract-v1 的固定前缀（无条件消耗）：
//   明教 7 掷 boss / m107 / m107Second / m104-1 / m104-2 / m100-1 / m100-2
//         + 6 pick strongA / strongB / weakA / weakB / m100A / m100B；
//   六大派 3 掷 m107 / m104 / m100 + 3 pick m107 / m104 / m100；
//   阵容变体 1 pick（仅当该关有 squadVariants）；
//   之后是随分支/人数变化的补齐抽签（候选池洗牌、普通兵填充、站位洗牌、何太冲职业摇）——同属契约。
export const RNG_CONTRACT_VERSION = 'rng-contract-v1';
// 六大派额外精英/特殊兵混入池（M107 / M104 / M100 三档）。
//   导出给 tools/820 参数实验室的「关卡角色过滤」用——工具里不再抄一份名单，避免两边漂移。
export const SIX_SECTS_WEAK_ELITE_POOLS = Object.freeze({
    M107: ['张三丰', '宋青书', '周芷若', '胖远桥', '灭绝师太'],
    M104: ['何太冲', '唐文亮', '空见'],
    M100: ['俞莲舟', '素问', '少林圆真']
});

import { CONFIG, getGameData } from '../core/201-config-5v5-test.js';
import { Unit, applyHeroFlags, HERO_FLAGS } from '../core/202-unit.js';
import { GlobalStore } from '../infra/104-global-store.js';
import { CAMP_TYPES, ROLE_TYPES } from '../infra/106-battle-enums.js';

const C = CONFIG;

// 六大派精英身份 → 站位优先数组：数据源 content.roster.enemyElitePos（格式 { flag: [优先级数组] }）
// 加新精英：若需要固定站位就在 content 加一行 { "isXxx": [优先级数组] }，本文件无需改
// ⚠️ 匹配顺序 = JSON 键序（Object.entries 按书写顺序），靠前的身份优先命中
function getEnemyElitePosFlags() {
    return Object.entries(C.ENEMY_ELITE_POS_FLAGS_MAP || {});
}

// 战斗-初始化：生成明教+六大派阵容（纯逻辑，无 DOM）
export function initBattleTeams(currentStage, _rng) {
    const ENEMY_M = CONFIG.ENEMY_M;
    const ENEMY_POOL_TIER = CONFIG.ENEMY_POOL_TIER;  // 池表整场不变，先取一次，别在 filter 里逐角色读 getter
    const _rand = (min, max) => _rng.nextInt(min, max);

    // 具名兵职业解析（主建队与凑数池两条路径同口径）：
    //   content `role` 字段（标枪等非 CONFIG.ROLES 职业）> tags 命中 CONFIG.ROLES 或标枪 > 随机四选一。
    //   何太冲双修：远程/战士 50/50 摇，走 _rng 保联机同步。
    //   ⚠️ RNG 消耗序列固定为「先 _rand(0,3)，再何太冲 _rng.next()」，与抽离前逐字一致。
    const resolveEnemyRole = (name) => {
        let role = C.ROLES[_rand(0, 3)];
        const chNamed = getGameData()?.characters?.[name];
        let tagRole = chNamed?.role || (chNamed?.tags || []).find(t => C.ROLES.includes(t) || t === ROLE_TYPES.JAVELIN);
        if (name === '何太冲') tagRole = _rng.next() < 0.5 ? ROLE_TYPES.WARRIOR : ROLE_TYPES.RANGED;
        if (tagRole) role = tagRole;
        return role;
    };

    // 无名杂兵补名：同门派递增编号（少林弟子 / 少林弟子2 …）
    const makeFallbackName = (used) => {
        const sects = ['少林弟子', '武当弟子', '峨眉弟子', '昆仑弟子', '崆峒弟子'];
        const base = sects[_rand(0, sects.length - 1)];
        const existingCount = used.filter(n => n.startsWith(base)).length;
        return base + (existingCount > 0 ? String(existingCount + 1) : '');
    };
    let allyTeam = [], enemyTeam = [];
    const eliteRate = C.ELITE_RATE || {};

    // 玩家在图鉴选定的角色 → 提高对应精英出场率（zw/wy 直连；xz/xm → 小昭并偏向姊/妹）
    let pickKey = null;
    try { pickKey = localStorage.getItem('ming_elite_pick_5v5'); } catch {}
    const PICK_TO_ELITE = { zw: '张无忌', wy: '韦一笑', xz: '小昭', xm: '小昭' };
    const rate = { ...eliteRate };
    if (pickKey && PICK_TO_ELITE[pickKey]) {
        // 2026-10-29 老板口径：图鉴加成 = 出场率 ×1.2（如张无忌 20% → 24%）。
        //   原 ×5 占位会把张无忌顶成 100%（0.20×5=1.0，掷点必中）。rate 当前仅 hasBoss 一掷消费。
        rate[PICK_TO_ELITE[pickKey]] = (rate[PICK_TO_ELITE[pickKey]] || 0.3) * 1.2;
    }

    // ── 明教精英分层重写（老板口径：限强度、保趣味）──
    //   Boss：张无忌独一档，按 ELITE_RATE.张无忌（20%，content.roster.eliteRate）独立掷；带人分布见文件头
    //   无 Boss：必出 1 强（100%），其中 35% 再 1 强（双强），其余按下方 M104/M100 档位配人，总数 ≤ 3
    //   强精英池 = 韦一笑 / 小昭 / 金毛狮王谢逊 / 寒离飒（寒离飒由弱升强，与前者同级）
    //   弱精英池 = 杨逍 / 殷天正（由 HERO_FLAGS − eliteConfigs 派生，寒离飒进了精英表即自动排除）
    //   RNG 流纪律（PVP 双端同源）：骰子全部无条件消耗，force 只改「是否应用」，不改消耗序列。
    // 精英配置由 characters 派生（core/201 getHeroPools：camp=明教 && tier∈{boss,strong}）——加精英只改 content，本文件不动
    //   tier='boss'   明教 Boss（独一档，Boss 局最多再配 1 个搭档）
    //   tier='strong' 强精英池（Boss 局可配、无 Boss 局走轮盘）
    //   flag          直接取 characters[name].flag（core/02 HERO_FLAGS 已是该字段的 proxy，无第二份映射可补）
    //   power         已不参与建队（老板口径 2026-11-09：出场只按概率/配比，不按功率目标取人）
    // 无兜底：配置缺失一律抛错，避免静默按老口径算
    const allEliteConfigs = C.ELITE_CONFIGS;
    if (!Array.isArray(allEliteConfigs) || allEliteConfigs.length === 0) {
        throw new Error('缺配置: characters 派生的 eliteConfigs 为空（camp=明教 && tier∈{boss,strong} 至少 1 条）');
    }
    const toEliteConfig = (c) => {
        if (!c || !c.name || !c.m || !c.role || !c.flag || !c.tier) {
            throw new Error(`缺字段: characters 派生精英项 ${JSON.stringify(c)}（须含 name/m/role/flag/tier）`);
        }
        if (!Object.values(ROLE_TYPES).includes(c.role)) {
            throw new Error(`非法 role: characters 派生精英项 ${c.name} 的 role='${c.role}'（须为 ROLE_TYPES 之一）`);
        }
        return { name: c.name, m: c.m, role: c.role, [c.flag]: true };
    };
    const bossConfigs = allEliteConfigs.filter(c => c.tier === 'boss').map(toEliteConfig);
    if (bossConfigs.length !== 1) {
        throw new Error(`characters 里 tier='boss' 必须恰好 1 项（当前实现不支持多 Boss），实际 ${bossConfigs.length} 项`);
    }
    const bossConfig = bossConfigs[0];
    const strongEliteConfigs = allEliteConfigs.filter(c => c.tier === 'strong').map(toEliteConfig);
    if (strongEliteConfigs.length === 0) {
        throw new Error(`characters 里 tier='strong' 至少 1 项`);
    }
    // eliteConfigs 保留旧名：下游「弱精英池排除固定精英」按名字过滤，Boss 与强精英一并纳入
    const eliteConfigs = [bossConfig, ...strongEliteConfigs];

    // 派生弱精英池（需提前定义，供概率推演和强制判定使用）
    const fixedEliteNames = new Set(eliteConfigs.map(c => c.name));
    const mingWeakPool = Object.entries(C.MING_M)
        .filter(([n]) => HERO_FLAGS[n] && !fixedEliteNames.has(n))
        .map(([n, m]) => ({ name: n, m }));
    const forceWeakElite = GlobalStore.get('forceWeakElite') || null;
    if (forceWeakElite && !mingWeakPool.some(w => w.name === forceWeakElite) && C.ENEMY_POOL_TIER[forceWeakElite] == null) {
        throw new Error(`forceWeakElite 无效（不在明教弱精英池、也不在 roster.enemyM）: ${forceWeakElite}`);
    }
    const weakAllyForced = !!(forceWeakElite && mingWeakPool.some(w => w.name === forceWeakElite));

    // 明教带技能的普通兵池（M100 档补位用；反伤弟子在数据里是 m=97，建单位一律读 MING_M 实际值，不硬写 100）
    const MING_SPECIAL_M100 = ['周颠', '说不得', '彭莹玉', '张中', '反伤弟子'];

    // ⚠️ RNG 序列更新（V7.6.7）：明教抽签次数从原 3 次变更为 7 次，旧冻结基线（固定种子回放/140 场体检）失效，
    //    联机双端需重新校准基线。骰子一律无条件消耗，force 只改「是否应用」。
    //   顺序：1 boss → 2 m107 → 3 m107Second → 4 m104Roll1 → 5 m104Roll2 → 6 m100Roll1 → 7 m100Roll2
    //        → 8 strongPickIdxA → 9 strongPickIdxB → 10 weakPickIdxA → 11 weakPickIdxB
    //        → 12 m100PickIdxA → 13 m100PickIdxB（pick 一律走 _rng.nextInt，与 _rng 同一条流）
    const bossRoll = _rng.next();
    const m107Roll = _rng.next();   // Boss 局搭档判定沿用本值；无 Boss 局已改为必出 107，不再用它判档（RNG 抽签契约不变）
    const m107SecondRoll = _rng.next();
    const m104Roll1 = _rng.next();
    const m104Roll2 = _rng.next();
    const m100Roll1 = _rng.next();
    const m100Roll2 = _rng.next();
    const strongPickIdxA = _rng.nextInt(0, strongEliteConfigs.length - 1);
    const strongPickIdxB = _rng.nextInt(0, strongEliteConfigs.length - 1);
    const weakPickIdxA = _rng.nextInt(0, Math.max(0, mingWeakPool.length - 1));
    const weakPickIdxB = _rng.nextInt(0, Math.max(0, mingWeakPool.length - 1));
    const m100PickIdxA = _rng.nextInt(0, MING_SPECIAL_M100.length - 1);
    const m100PickIdxB = _rng.nextInt(0, MING_SPECIAL_M100.length - 1);

    const hasBoss = bossRoll < (rate['张无忌'] ?? 0.20);

    // 造精英单位（小昭走形态分支；其余 init+applyBonus）
    const pushElite = (c) => {
        const initRole = c.isXiaoZhaoBrother ? C.ROLES[_rng.nextInt(0, 3)] : c.role;
        const unit = new Unit(c.name, c.m, initRole, CAMP_TYPES.ALLY);
        if (c.isZhang) unit.isZhang = true;
        if (c.isWei) unit.isWei = true;
        if (c.isXiaoZhaoBrother) {
            const sisterProb = C.XIAO_ZHAO_SISTER_PROB[pickKey] ?? C.XIAO_ZHAO_SISTER_PROB.default;
            if (_rng.next() < sisterProb) { unit.isXiaoZhaoSister = true; }
            else { unit.isXiaoZhaoBrother = true; }
            unit.name = unit.isXiaoZhaoSister ? '小昭·姊' : '小昭·妹';
            applyHeroFlags(unit);
            unit.initXiaoZhao(); unit.applyBonus(true);   // true = 不吃职业加成
            unit.state._baseMaxHp = unit.maxHp; unit.state._baseAtk = unit.atk; unit.state._baseDef = unit.def;
        } else {
            unit.init(_rng); unit.applyBonus();
        }
        unit.pos = null;
        allyTeam.push(unit);
        return unit;
    };

    // 强制精英（dev）：任一 force 命中 = 单精英局，抑制随机轮盘
    const forceZhang = GlobalStore.get('forceZhang');
    const forceWei = GlobalStore.get('forceWei');
    const forceXieXun = GlobalStore.get('forceXieXun');
    // V7.6.1：寒离飒已升强精英，需独立 force 通道（走 forceWeakElite 会撞下方入池校验抛错）
    const forceHanLiSa = GlobalStore.get('forceHanLiSa');
    const _forceXzEarly = (GlobalStore.get('forceXiaoZhao') === 'sister' || GlobalStore.get('forceXiaoZhao') === 'brother');
    // V7.5.26：forceSoloWeakElite（工具强精英单挑）单独抑制轮盘——只锁寒离飒、不产生第二个精英
    const forceSoloWeak = GlobalStore.get('forceSoloWeakElite') === true;
    const anyForce = forceZhang || forceWei || forceXieXun || forceHanLiSa || _forceXzEarly || forceSoloWeak;

    if (forceZhang && !allyTeam.some(u => u.isZhang)) pushElite(bossConfig);
    if (forceWei && !allyTeam.some(u => u.isWei)) pushElite(strongEliteConfigs.find(c => c.isWei));
    if (forceXieXun && !allyTeam.some(u => u.isXieXun)) pushElite(strongEliteConfigs.find(c => c.isXieXun));
    if (forceHanLiSa && !allyTeam.some(u => u.isHanLiSa)) pushElite(strongEliteConfigs.find(c => c.isHanLiSa));

    // V7.5.16 小昭同款互锁（dev 试玩按钮与张/韦同一排，口径对齐）：指定姊/妹时轮盘不转，
    //   队里=单小昭局。旧版轮盘照抽，「小昭+另一精英」双精英场占 3/4（探针实测单精英命中仅 74/300）。
    const pushWeakElite = (w) => {
        const chWeak = getGameData()?.characters?.[w.name];
        const tagRole = chWeak?.role || (chWeak?.tags || []).find(t => C.ROLES.includes(t));
        if (!tagRole) throw new Error(`明教弱精英缺职业（characters.${w.name}.role / tags）`);
        const unit = new Unit(w.name, w.m, tagRole, CAMP_TYPES.ALLY);
        unit.init(_rng); unit.applyBonus();
        unit.pos = null;
        allyTeam.push(unit);
        return unit;
    };

    // 明教带技能普通兵（M100 档）：职业按 characters 身份取，取不到才随机四选一
    const pushMingSpecial = (name) => {
        const ch = getGameData()?.characters?.[name];
        const m = C.MING_M[name];
        if (m == null) throw new Error(`缺 MING_M: ${name}`);
        const tagRole = ch?.role || (ch?.tags || []).find(t => C.ROLES.includes(t));
        const role = tagRole || C.ROLES[_rand(0, 3)];
        const unit = new Unit(name, m, role, CAMP_TYPES.ALLY);
        unit.init(_rng); unit.applyBonus();
        unit.pos = null;
        allyTeam.push(unit);
        return unit;
    };

    // 分层抽取（2026-11-08 重写，替代旧 noBossRouteRoll 四路分支）：
    //   ① 先定 M107 强精英数（Boss 局 0/1、无 Boss 局 1/2——107 必出）；
    //   ② 再按 M107 档位配 M104（弱精英池）/ M100（带技能普通兵）补位；
    //   ③ 剩余空位交下方 candidatePool 普通兵等概率补齐。
    let m107Count = 0;
    if (weakAllyForced) {
        pushWeakElite(mingWeakPool.find(w => w.name === forceWeakElite));
    } else if (!anyForce) {
        if (hasBoss) {
            pushElite(bossConfig);
            if (m107Roll < 0.25) { pushElite(strongEliteConfigs[strongPickIdxA]); m107Count = 1; }
        } else {
            pushElite(strongEliteConfigs[strongPickIdxA]); m107Count = 1;
            if (m107SecondRoll < 0.35) {
                const idxB = (strongPickIdxB === strongPickIdxA) ? (strongPickIdxB + 1) % strongEliteConfigs.length : strongPickIdxB;
                pushElite(strongEliteConfigs[idxB]); m107Count = 2;
            }
        }

        // M104 / M100 档位表（阈值即线上口径，改动必须同步重录基线）
        let m104Count = 0, m100Count = 0;
        if (hasBoss) {
            if (m107Count === 1) {
                if (m104Roll1 < 0.50) m104Count = 1;
                if (m100Roll1 < 0.50) m100Count = 1;
            } else {
                if (m104Roll1 < 0.80) m104Count = 1;
                if (m100Roll1 < 0.80) m100Count++;
                if (m100Roll2 < 0.50) m100Count++;
            }
        } else if (m107Count === 2) {
            if (m104Roll1 < 0.60) m104Count = 1;
            if (m100Roll1 < 0.70) m100Count = 1;
        } else if (m107Count === 1) {
            if (m104Roll1 < 0.80) m104Count = 1;
            if (m100Roll1 < 0.85) m100Count++;
            if (m100Roll2 < 0.60) m100Count++;
        } else {
            // 无 107 兜底（107 必出后正常流程已不可达，保留防呆）：这种局面不得出现普通杂兵，
            //   弱精英池（M104 杨逍/殷天正）拉满，剩余空位全交带技能 M100（周颠/说不得/彭莹玉/张中/反伤弟子）。
            m104Count = mingWeakPool.length;
            m100Count = Math.max(0, 5 - m104Count);
        }

        // 实例化 M104：mingWeakPool（杨逍/殷天正），两个 idx 撞名就顺延一位
        for (let i = 0; i < m104Count && allyTeam.length < 5 && mingWeakPool.length > 0; i++) {
            let idx = i === 0 ? weakPickIdxA : weakPickIdxB;
            for (let tries = 0; tries < mingWeakPool.length && allyTeam.some(u => u.name === mingWeakPool[idx].name); tries++) {
                idx = (idx + 1) % mingWeakPool.length;
            }
            const w = mingWeakPool[idx];
            if (allyTeam.some(u => u.name === w.name)) break;   // 池里已无可用名
            pushWeakElite(w);
        }

        // 实例化 M100：带技能普通兵池，排除已用名后按 idx 取
        for (let i = 0; i < m100Count && allyTeam.length < 5; i++) {
            const used = new Set(allyTeam.map(u => u.name));
            const pool = MING_SPECIAL_M100.filter(n => !used.has(n));
            if (pool.length === 0) break;
            const pickIdx = (i === 0 ? m100PickIdxA : m100PickIdxB) % pool.length;
            pushMingSpecial(pool[pickIdx]);
        }
    }

    // 普通兵候选池
    const candidatePool = [];
    for (const [name, tier] of Object.entries(C.MING_POOL_TIER)) {
        // 去名字字面量：用身份标记判断是否精英（与 eliteConfigs 同源）
        if (HERO_FLAGS[name]) continue;
        // 入池资格读池档 poolTier；数值档 m 只用于建单位
        const m = C.MING_M[name];
        if (tier >= 95 && tier <= 104) candidatePool.push({ name, m });
    }
    // 候选池先用战斗 RNG 洗一次牌（保持抽签次数不变；PVP 双端同源、同种子可复现），
    //   随后逐位从剩余候选里等概率抽人——不再按功率目标/均值挑人（老板口径 2026-11-09）。
    for (let i = candidatePool.length - 1; i > 0; i--) {
        const j = _rng.nextInt(0, i);
        [candidatePool[i], candidatePool[j]] = [candidatePool[j], candidatePool[i]];
    }

    // 已由 M107/M104/M100 分档补进队里的名字不再参与普通兵填充（防同名重复）
    const remainingCandidates = candidatePool.filter(c => !allyTeam.some(u => u.name === c.name));
    let remainingSlots = 5 - allyTeam.length;
    for (let slot = 0; slot < remainingSlots; slot++) {
        if (remainingCandidates.length === 0) break;
        const pick = remainingCandidates.splice(_rng.nextInt(0, remainingCandidates.length - 1), 1)[0];
        const role = C.ROLES[_rand(0, 3)];
        const unit = new Unit(pick.name, pick.m, role, CAMP_TYPES.ALLY);
        unit.init(_rng); unit.applyBonus();
        unit.pos = null;
        allyTeam.push(unit);
    }

    // 强制指定普通兵（如说不得、周颠）出场
    const forceMingUnit = GlobalStore.get('forceMingUnit');
    if (forceMingUnit) {
        if (!allyTeam.some(u => u.name === forceMingUnit)) {
            const mVal = C.MING_M[forceMingUnit] || 100;
            const role = C.ROLES[_rand(0, 3)];
            const unit = new Unit(forceMingUnit, mVal, role, CAMP_TYPES.ALLY);
            unit.init(_rng); unit.applyBonus();
            unit.pos = null;
            if (allyTeam.length >= 5) allyTeam.pop(); // 满 5 人则挤掉最后一个
            allyTeam.push(unit);
        }
    }

    // 强制小昭模式：如有小昭则修正标志，如无则添加
    const forceXzMode = GlobalStore.get('forceXiaoZhao');
    if (forceXzMode === 'sister' || forceXzMode === 'brother') {
        const existingXz = allyTeam.find(u => u.isXiaoZhaoSister || u.isXiaoZhaoBrother);
        if (existingXz) {
            existingXz.isXiaoZhaoSister = (forceXzMode === 'sister');
            existingXz.isXiaoZhaoBrother = (forceXzMode === 'brother');
            existingXz.name = existingXz.isXiaoZhaoSister ? '小昭·姊' : '小昭·妹';
            applyHeroFlags(existingXz);
        } else {
            const swappable = allyTeam.find(u => !u.isZhang && !u.isWei && !u.isXieXun && !u.isYangXiao);
            if (swappable) {
                allyTeam.splice(allyTeam.indexOf(swappable), 1);
            }
            let xzUnit = new Unit('小昭', 107, C.ROLES[_rand(0, 3)], CAMP_TYPES.ALLY);
            xzUnit.isXiaoZhaoSister = (forceXzMode === 'sister');
            xzUnit.isXiaoZhaoBrother = (forceXzMode === 'brother');
            xzUnit.name = xzUnit.isXiaoZhaoSister ? '小昭·姊' : '小昭·妹';
            applyHeroFlags(xzUnit);
            xzUnit.initXiaoZhao(); xzUnit.applyBonus(true);   // true = 不吃职业加成
            xzUnit.state._baseMaxHp = xzUnit.maxHp; xzUnit.state._baseAtk = xzUnit.atk; xzUnit.state._baseDef = xzUnit.def;
            xzUnit.pos = swappable ? swappable.pos : null;
            allyTeam.push(xzUnit);
        }
    }

    // （弱精英随机混入逻辑已删除：现由上方概率树统一调度，更精确直观）

    // 保证至少一个前排单位
    if (!allyTeam.some(u => u.role === ROLE_TYPES.DEFENDER || u.role === ROLE_TYPES.WARRIOR)) {
        const nonFixed = allyTeam.filter(u => !u.isZhang && !u.isWei && !u.isXiaoZhaoSister && !u.isXiaoZhaoBrother && !u.isYangXiao && !u.isYinTianZheng);
        if (nonFixed.length > 0) {
            nonFixed[0].role = _rand(0, 1) === 0 ? ROLE_TYPES.DEFENDER : ROLE_TYPES.WARRIOR;
            nonFixed[0].init(_rng); nonFixed[0].applyBonus();
        }
    }

    // 站位
    const takenPos = new Set();
    let zhang = allyTeam.find(u => u.isZhang);
    let wei = allyTeam.find(u => u.isWei);
    let xz = allyTeam.find(u => u.isXiaoZhaoSister || u.isXiaoZhaoBrother);
    // 张无忌 5 号、韦一笑 6 号、小昭 4 号是硬编码规则，不能随意动
    if (zhang) { zhang.pos = 5; takenPos.add(5); }
    if (wei) { wei.pos = 6; takenPos.add(6); }
    if (xz) { xz.pos = 4; takenPos.add(4); }
    // 金毛狮王谢逊站 7 号位（与张无忌5/韦一笑6/小昭4 同性质：只是站位锚点）
    // 不在这里单独锁死：他和张/韦/小昭 一样，只占下面「固定 3 位」里的一个名额。
    //   原先此处直接 xie.fixed = true，会让他不在 toLock 名单里却多锁一个 → 明教出现 4 个固定位，
    //   且补足到 3 的随机补位可能落到无关的普通弟子身上。
    let xie = allyTeam.find(u => u.isXieXun);
    if (xie) { xie.pos = 7; takenPos.add(7); }
    // 寒离飒恒定 2 号位（老板拍板）：先于「张无忌在场时 others[0] 站 2」的旧规则抢位，
    //   并从 others 名单摘掉，避免被随机补位顶走
    let hls = allyTeam.find(u => u.isHanLiSa);
    if (hls && !takenPos.has(2)) { hls.pos = 2; takenPos.add(2); }
    let others = allyTeam.filter(u => !u.isZhang && !u.isWei && !u.isXiaoZhaoSister && !u.isXiaoZhaoBrother && !u.isXieXun && !u.isHanLiSa);
    if (others.length > 0 && zhang && !takenPos.has(2)) { others[0].pos = 2; takenPos.add(2); others.shift(); }
    let emptySlots = [1,2,3,4,5,6,7,8,9].filter(p => !takenPos.has(p));
    for (let i = emptySlots.length - 1; i > 0; i--) {
        const j = _rng.nextInt(0, i);
        [emptySlots[i], emptySlots[j]] = [emptySlots[j], emptySlots[i]];
    }
    for (let u of others) {
        if (emptySlots.length > 0) { u.pos = emptySlots.shift(); takenPos.add(u.pos); }
        else { u.pos = 5; }
    }
    // 谢逊并入名单：明教固定位恒为 3 个（张/韦/小昭/谢逊 中在队的按序占名额，不足 3 随机补足）。
    //   四人同时在队时（forceXieXun + 满精英）按优先级截断到 3，保证「锁 3 位」恒定，不会又变回 4 位。
    // 寒离飒插队首位（老板实机反馈「初始站位固定 2 号位置」）：她的整套蓄意轰拳以 2 号位为锚，
    //   准备阶段不许拖走；五锚同队时张/韦保锁、小昭/谢逊按序让位，锁位总数仍恒 3。
    let toLock = [hls, zhang, wei, xz, xie].filter(Boolean).slice(0, 3);
    while (toLock.length < 3) { let pool = allyTeam.filter(u => !toLock.includes(u)); if (pool.length === 0) break; let pick = pool[_rand(0, pool.length - 1)]; toLock.push(pick); }
    toLock.forEach(u => { u.fixed = true; });

    // 六大派阵容生成
    let enemySquad = C.ENEMY_SQUADS && C.ENEMY_SQUADS[currentStage] ? C.ENEMY_SQUADS[currentStage] : null;
    // 第三关阵容轮换：encounters.squadVariants[stage] 存在时随机抽一组（走 _rng，PVP 双端同源）
    // 变体升级为 { squad, posTemplate? }：阵容与站位成套下发；posTemplate 缺省才回落关卡级 ENEMY_POS_TEMPLATES
    const squadVariants = C.ENCOUNTER_VARIANTS[currentStage];
    let variantPosTemplate = null;
    // 抽中的变体 id（v1/v2…）落成返回值，跑批/体检直接读，不再按阵容反推；无变体的关卡为 null
    let encounterVariant = null;
    if (squadVariants && squadVariants.length > 0) {
        // 先抽再判：forcePang 时即使覆盖结果也照抽一次，保证 RNG 流与不强制时一致（PVP 双端同源）
        const roll = _rng.nextInt(0, squadVariants.length - 1);
        const forcePang = GlobalStore.get('forcePang');
        let variant = squadVariants[roll];
        if (forcePang) {
            const target = squadVariants.find(v => v.squad.some(it => it && it.name === '胖远桥'));
            if (!target) throw new Error('forcePang 生效，但第三关没有含「胖远桥」的阵容变体');
            variant = target;
        }
        enemySquad = variant.squad;
        variantPosTemplate = variant.posTemplate || null;
        encounterVariant = `v${squadVariants.indexOf(variant) + 1}`;
    }
    let enemyUnits = [];
    const usedEnemyNames = [];

    // —— 六大派额外精英/特殊兵混入池（保留原 WEAK_ELITE_MIX_RATE 混入率，另加 M107 / M100 两档独立判定）——
    //   命中后只替换「非具名、且不属于本关固定精英池」的杂兵位；找不到杂兵位就放弃，绝不顶掉关卡固定精英
    const fixedEnemyEliteNames = new Set(Object.values(C.ELITE_POOL || {}).flat().map(e => e && e.name));
    const { M107: SIX_M107, M104: SIX_M104, M100: SIX_M100 } = SIX_SECTS_WEAK_ELITE_POOLS;
    // 关卡解锁范围：名字若出现在任一关的固定精英池，只允许从它首次出现的关卡起被额外混入。
    //   例：灭绝师太只在第7关固定池 → 第1~6关不得靠额外混入提前出场；周芷若首次第4关 → 第3关不出。
    //   不在任何固定池的名字（何太冲/唐文亮/空见/俞莲舟/素问/少林圆真）不受关卡限制。
    const eliteFirstStage = new Map();
    for (const [stageStr, list] of Object.entries(C.ELITE_POOL || {})) {
        const stage = Number(stageStr);
        for (const e of (list || [])) {
            const n = e && e.name;
            if (!n) continue;
            const prev = eliteFirstStage.get(n);
            if (prev == null || stage < prev) eliteFirstStage.set(n, stage);
        }
    }
    // 该关变体池：squadVariants 里出现过的所有人名。
    //   变体是「二选一」关系（第三关：宋青书 vs 胖远桥），额外混入不能跨变体塞人，
    //   否则会出现「胖远桥 + 宋青书同场」（老板 2026-11-11 报）。
    const variantPoolNames = new Set();
    for (const v of (C.ENCOUNTER_VARIANTS[currentStage] || [])) {
        for (const it of (v.squad || [])) {
            if (it && it.name) variantPoolNames.add(it.name);
        }
    };
    const stageAllows = (name) => {
        const from = eliteFirstStage.get(name);
        if (from != null && currentStage < from) return false;
        // 名字属于该关变体池 → 额外混入一律拒绝。
        //   当前变体里已有的名字会被 usedEnemyNames 去重拦掉，走到这的必是「另一个变体的人」。
        if (variantPoolNames.has(name)) return false;
        return true;
    };
    // ⚠️ RNG 序列更新（V7.6.7）：三颗骰子 + 三个 pick 一律无条件消耗，命中与否只改「是否应用」
    const enemyM107Roll = _rng.next();
    const enemyM104Roll = _rng.next();
    const enemyM100Roll = _rng.next();
    const enemyM107PickIdx = _rand(0, SIX_M107.length - 1);
    const enemyM104PickIdx = _rand(0, SIX_M104.length - 1);
    const enemyM100PickIdx = _rand(0, SIX_M100.length - 1);
    const extraEnemyElites = [];
    if (forceWeakElite && C.ENEMY_POOL_TIER[forceWeakElite] != null) {
        extraEnemyElites.push(forceWeakElite);                 // dev 强制优先（不受关卡过滤）
    } else if (enemyM104Roll < C.WEAK_ELITE_MIX_RATE && stageAllows(SIX_M104[enemyM104PickIdx])) {
        extraEnemyElites.push(SIX_M104[enemyM104PickIdx]);
    }
    if (enemyM107Roll < 0.20 && stageAllows(SIX_M107[enemyM107PickIdx])) extraEnemyElites.push(SIX_M107[enemyM107PickIdx]);
    if (enemyM100Roll < 0.30 && stageAllows(SIX_M100[enemyM100PickIdx])) extraEnemyElites.push(SIX_M100[enemyM100PickIdx]);

    if (enemySquad) {
        let enemyPosSet = new Set();
        let xuanmingPairCount = 0;
        for (let item of enemySquad) {
            if (typeof item === 'object' && item.name) {
                let unit = new Unit(item.name, item.m, item.role, CAMP_TYPES.ENEMY);
                unit.pos = null; unit.init(_rng); unit.applyBonus();
                enemyUnits.push(unit);
                usedEnemyNames.push(item.name);
                if (unit.isLuZhangKe || unit.isHeBiWeng) xuanmingPairCount++;
            } else {
                let mVal = item;
                // 筛池按池档 poolTier（入池资格），不再拿数值档 m 当条件；取出的 m 仍用于建单位
                let pool = Object.entries(ENEMY_M).filter(([n]) => ENEMY_POOL_TIER[n] === mVal);
                let name = null;
                const squadDefs = Object.values(C.ENEMY_SQUADS).flat();
                for (let def of squadDefs) { if (typeof def === 'object' && def.m === mVal && !usedEnemyNames.includes(def.name)) { name = def.name; break; } }
                if (!name && pool.length > 0) {
                    let attempts = 0;
                    while ((!name || usedEnemyNames.includes(name)) && attempts < 50) { let pick = pool[_rand(0, pool.length - 1)]; name = pick[0]; attempts++; }
                }
                if (!name) {
                    name = makeFallbackName(usedEnemyNames);
                }
                // 具名角色填数值空位时用「自身职业」，不再四选一乱抽——
                //   老板实测何太冲（昆仑·远程）偶尔顶着"防战"出场：该路径职业原本与身份无关。
                //   无名杂兵（空闻/班淑娴等，不在 characters 表）保持随机，当作阵容变数。
                const role = resolveEnemyRole(name);
                let unit = new Unit(name, mVal, role, CAMP_TYPES.ENEMY);
                unit.pos = null; unit.init(_rng); unit.applyBonus();
                enemyUnits.push(unit);
                usedEnemyNames.push(name);
            }
        }
        if (currentStage === 5 && xuanmingPairCount === 2) {
            let extraM = C.XUANMING_EXTRA_M;
            let pool = Object.entries(ENEMY_M).filter(([n]) => ENEMY_POOL_TIER[n] === extraM);
            let usedNames = enemyUnits.map(u => u.name);
            let name = null;
            while ((!name || usedNames.includes(name)) && pool.length > 0) {
                let pick = pool[_rand(0, pool.length - 1)];
                name = pick[0];
                if (usedNames.includes(name)) { name = null; pool.splice(pool.indexOf(pick), 1); }
            }
            if (!name) {
                name = makeFallbackName(usedEnemyNames);
            }
            // 职业解析与具名兵同口径：content `role` 字段 > tags 命中 CONFIG.ROLES 或标枪
            //   （此前这里只掷 C.ROLES 随机四选一，M104 池抽到唐文亮会给错职业）
            const role = resolveEnemyRole(name);
            let extraUnit = new Unit(name, extraM, role, CAMP_TYPES.ENEMY);
            extraUnit.init(_rng); extraUnit.applyBonus();
            enemyUnits.push(extraUnit);
            // V7.6.7：补位单位必须登记进 usedEnemyNames，否则下方「额外混入」去重守卫看不到它，
            //   会再混入同名 M104（第5关玄冥局曾刷出「唐文亮×2 / 何太冲×2」）
            usedEnemyNames.push(name);
        }
        // 应用额外混入：只替换无名普通杂兵，找不到空位则放弃本轮，绝不顶替关卡固定精英
        for (const en of extraEnemyElites) {
            if (usedEnemyNames.includes(en)) continue;
            const ch = getGameData()?.characters?.[en];
            const m = ch?.m;
            if (m == null) throw new Error(`六大派额外混入缺 characters.${en}.m`);
            const targetIdx = enemyUnits.findIndex(u => !fixedEnemyEliteNames.has(u.name)
                && getGameData()?.characters?.[u.name]?.named !== true);
            if (targetIdx < 0) continue;                           // 全被固定精英/具名填满 → 放弃，不 append
            const role = ch?.role || (ch?.tags || []).find(t => C.ROLES.includes(t)) || C.ROLES[0];
            const newUnit = new Unit(en, m, role, CAMP_TYPES.ENEMY);
            newUnit.pos = null;
            newUnit.init(_rng);
            newUnit.applyBonus();
            const oldName = enemyUnits[targetIdx].name;
            const oldIdx = usedEnemyNames.indexOf(oldName);
            if (oldIdx >= 0) usedEnemyNames.splice(oldIdx, 1);
            enemyUnits[targetIdx] = newUnit;
            usedEnemyNames.push(en);
        }
        // 强制指定六大派带技能角色出场（dev-index 🧪 按钮，2026-11-10）：同 _forceMingUnit 口径，
        //   M/职业读 content characters 单一真源；先顶无名杂兵，顶不掉满员换最后一个（阵容人数不变，保站位模板）
        const forceSectUnit = GlobalStore.get('forceSectUnit');
        if (forceSectUnit) {
            if (!enemyUnits.some(u => u.name === forceSectUnit)) {
                const chDef = getGameData() && getGameData().characters && getGameData().characters[forceSectUnit];
                if (!chDef || chDef.m == null) throw new Error(`forceSectUnit 无效（characters 表缺 ${forceSectUnit} 或缺 m）`);
                const role = resolveEnemyRole(forceSectUnit);
                let unit = new Unit(forceSectUnit, chDef.m, role, CAMP_TYPES.ENEMY);
                unit.pos = null; unit.init(_rng); unit.applyBonus();
                const plainIdx = enemyUnits.findIndex(u => !usedEnemyNames.includes(u.name));
                if (plainIdx >= 0) {
                    const oldName = enemyUnits[plainIdx].name;
                    const oldIdx = usedEnemyNames.indexOf(oldName);
                    if (oldIdx >= 0) usedEnemyNames.splice(oldIdx, 1);
                    enemyUnits[plainIdx] = unit;
                } else if (enemyUnits.length >= 5) {
                    const oldName = enemyUnits[enemyUnits.length - 1].name;
                    const oldIdx = usedEnemyNames.indexOf(oldName);
                    if (oldIdx >= 0) usedEnemyNames.splice(oldIdx, 1);
                    enemyUnits[enemyUnits.length - 1] = unit;
                } else {
                    enemyUnits.push(unit);
                }
                usedEnemyNames.push(forceSectUnit);
            }
        }
        let allUnits = [...enemyUnits];
        let template = variantPosTemplate || (C.ENEMY_POS_TEMPLATES && C.ENEMY_POS_TEMPLATES[currentStage] ? C.ENEMY_POS_TEMPLATES[currentStage] : null);
        let eliteUnits = allUnits.filter(u => C.ELITE_POOL && C.ELITE_POOL[currentStage] && C.ELITE_POOL[currentStage].some(e => e.name === u.name));
        let normalUnits = allUnits.filter(u => !eliteUnits.includes(u));
        // 张三丰固定1号位：普通兵排位之前先锁，其他单位不许占
        //   识别范围必须是 allUnits 而非 eliteUnits：eliteUnits 只收「本关固定池」的精英，
        //   张三丰按 M107 混入第 3~7 关时不在池里，旧版就此当普通兵走模板/随机位（实证 seed7 s7 落 9 号位）。
        const zhangSanfeng = allUnits.find(u => u.name === '张三丰');
        if (zhangSanfeng && !enemyPosSet.has(1)) {
            zhangSanfeng.pos = 1;
            zhangSanfeng.state._originalPos = 1;
            enemyPosSet.add(1);
        }
        if (template) {
            let roleCounts = { [ROLE_TYPES.WARRIOR]: 0, [ROLE_TYPES.DEFENDER]: 0, [ROLE_TYPES.RANGED]: 0, [ROLE_TYPES.FLYER]: 0 };
            normalUnits.forEach(u => { if (roleCounts[u.role] !== undefined) roleCounts[u.role]++; });
            let templateNeeds = {};
            for (let [role, poses] of Object.entries(template)) { if (role === 'random') continue; templateNeeds[role] = poses.length; }
            // 具名角色（characters 表且有 ROLES tag，如 何太冲=远程）：职业是身份，不参与下面的凑模板改职
            //   补 content `role` 字段（标枪等非 CONFIG.ROLES 职业）同判 isTagFixed
            const isTagFixed = (u) => { const ch = getGameData()?.characters?.[u.name]; return !!(ch && (ch.role || (ch.tags || []).find(t => C.ROLES.includes(t)))); };
            for (let role of [ROLE_TYPES.DEFENDER, ROLE_TYPES.RANGED, ROLE_TYPES.FLYER, ROLE_TYPES.WARRIOR]) {
                let need = templateNeeds[role] || 0;
                let current = roleCounts[role] || 0;
                let shortage = need - current;
                if (shortage > 0) {
                    // 具名角色不参与凑模板改职（V7.5.17 只守了抽名这步，会把何太冲改成飞行）——缺位留给无名杂兵
                    let others = normalUnits.filter(u => u.role !== role && (templateNeeds[u.role] || 0) < (roleCounts[u.role] || 0) && !isTagFixed(u));
                    for (let i = 0; i < Math.min(shortage, others.length); i++) { roleCounts[others[i].role]--; others[i].role = role; roleCounts[role]++; }
                }
            }
            normalUnits.forEach(u => { u.init(_rng); u.applyBonus(); });
        }
        if (template) {
            for (let [role, poses] of Object.entries(template)) {
                if (role === 'random') continue;
                for (let pos of poses) {
                    let unit = normalUnits.find(u => u.role === role && u.pos == null);
                    if (unit && !enemyPosSet.has(pos)) { unit.pos = pos; unit.state._originalPos = pos; enemyPosSet.add(pos); }
                }
            }
        }
        // 唐文亮（标枪弱精英）：恒定落中后排 4~9——「标枪」不是模板职业，模板排位挑不到他，
        //   故在模板排位之后、周芷若/宋青书等精英之前，按身份优先表抢位（1~3 仅作极端挤占兜底）
        const twJavelin = normalUnits.find(u => u.isTangWenLiang && u.pos == null);
        if (twJavelin) {
            // V7.5.24 老板口径「456789 随机」：旧版恒抢 4 号（优先表第一顺位），把宋青书挤到 3 号挨集火
            //   （评测实证第3关宋青书行唐文亮 Δ+4.2 = 帮明教杀宋青书的假增益）。改每局 4~9 洗牌随机（_rng 种子化，评测可复现），
            //   全占才走原优先表 1~3 兜底
            const twOrder = [4, 5, 6, 7, 8, 9];
            for (let i = twOrder.length - 1; i > 0; i--) {
                const j = _rng.nextInt(0, i);
                const tmp = twOrder[i]; twOrder[i] = twOrder[j]; twOrder[j] = tmp;
            }
            // 唐文亮的"优先兜底数组"也走 content（content.roster.enemyElitePos.isTangWenLiang）；
            //   他不走 general 循环（不是 eliteUnits），此处显式引用
            const twPriority = C.ENEMY_ELITE_POS_FLAGS_MAP.isTangWenLiang || [1, 2, 3, 4, 5, 6, 7, 8, 9];
            for (const p of twOrder.concat(twPriority)) {
                if (!enemyPosSet.has(p)) { twJavelin.pos = p; twJavelin.state._originalPos = p; enemyPosSet.add(p); break; }
            }
        }
        const zhou = eliteUnits.find(u => u.isZhouZhiruo);
        const song = eliteUnits.find(u => u.isSongQingshu);
        if (zhou && zhou.pos == null) {
            const zhouPriority = [2, 3, 4, 5, 6, 7, 8, 9];
            let placed = false;
            for (const p of zhouPriority) { if (!enemyPosSet.has(p)) { zhou.pos = p; zhou.state._originalPos = p; enemyPosSet.add(p); placed = true; break; } }
            if (!placed) { let displaced = normalUnits.find(u => u.pos === 2); if (displaced) { displaced.pos = null; displaced.state._originalPos = -1; } zhou.pos = 2; zhou.state._originalPos = 2; enemyPosSet.add(2); }
        }
        if (song && song.pos == null) {
            // V7.5.25 宋青书落位修复（老板报「唐文亮一上宋青书就被挤前排暴毙」，探针实证：锁定唐文亮臂
            //   宋青书 75% 落 2/3 号、阵亡率 22%，自然臂 80% 落 4 号、阵亡率 12%）：
            //   他是飞行职业（m107），周芷若不在时却按「从 1 号找第一个空位」落前排——唐文亮占掉一个后排位就被顶到 2 号挨集火。
            //   改为无周芷若时从 4 号（中后排）找起，全占才回落 1~3；有周芷若（第4关）保持原「顺延在周芷若之后」不动
            const zhouPos = zhou ? zhou.pos : 0;
            let placed = false;
            for (let p = (zhou ? zhouPos + 1 : 4); p <= 9; p++) { if (!enemyPosSet.has(p)) { song.pos = p; song.state._originalPos = p; enemyPosSet.add(p); placed = true; break; } }
            if (!placed) { for (let p = 1; p <= 9; p++) { if (!enemyPosSet.has(p)) { song.pos = p; song.state._originalPos = p; enemyPosSet.add(p); placed = true; break; } } }
            if (!placed) { let backPos = zhouPos + 1; if (backPos <= 9) { let displaced = normalUnits.find(u => u.pos === backPos); if (displaced) { displaced.pos = null; displaced.state._originalPos = -1; } song.pos = backPos; song.state._originalPos = backPos; enemyPosSet.add(backPos); } }
        }
        const otherElites = eliteUnits.filter(u => u !== zhou && u !== song && u.pos == null);
        // 身份优先表见 content.roster.enemyElitePos（未命中回落默认 1→9）
        const enemyElitePosMap = getEnemyElitePosFlags();
        for (let u of otherElites) {
            let priority;
            const hit = enemyElitePosMap.find(([flag]) => u[flag]);
            priority = hit ? hit[1] : C.ENEMY_ELITE_POS_FALLBACK;
            for (const p of priority) { if (!enemyPosSet.has(p)) { u.pos = p; u.state._originalPos = p; enemyPosSet.add(p); break; } }
            if (u.pos == null) { let p = priority[0]; let displaced = normalUnits.find(u2 => u2.pos === p); if (displaced) { displaced.pos = null; displaced.state._originalPos = -1; } u.pos = p; u.state._originalPos = p; enemyPosSet.add(p); }
        }
        let unplacedNormals = normalUnits.filter(u => u.pos == null);
        let emptyEnemySlots = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(p => !enemyPosSet.has(p));
        for (let u of unplacedNormals) { if (emptyEnemySlots.length > 0) { let idx = _rand(0, emptyEnemySlots.length - 1); u.pos = emptyEnemySlots[idx]; u.state._originalPos = u.pos; enemyPosSet.add(emptyEnemySlots[idx]); emptyEnemySlots.splice(idx, 1); } }
        enemyTeam = allUnits;
    }

    // rngContractVersion：本局阵容由哪一版抽签契约产出（跑批 / 回放 / 联机对账靠它识别失配，别按阵容反推）
    return { allyTeam, enemyTeam, encounterVariant, rngContractVersion: RNG_CONTRACT_VERSION };
}