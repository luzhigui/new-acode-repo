// modules/29battle-init.js — 双方阵容生成（精英分层 / 弱精英混入 / 站位锚点）
// 明教精英分层：Boss（张无忌）独掷，出 Boss 最多再配 1 个（强 70%/弱 30%）；无 Boss 时强精英 90% 出 1、10% 出 2，
//   弱精英独立 30% 混入。骰子一律先掷后判、RNG 流双端同源——force 只改「是否应用」，不改消耗序列。
// V7.6.5 | 2026-10-29 | ~33700 bytes | 何太冲双修：敌方主建队路径取消固定远程，远程/战士各 50% 摇
//        （_rng.next() 走建队 RNG 保联机同步）。注意：含何太冲的固定 seed 局 RNG 流多消耗一次，
//        旧跑批基线数字在相关关不可比；第 5 关玄冥凑数池（V7.6.4 的 L431 路径）未同改，
//        抽到何太冲仍固定远程（挂账待拍板）。
// V7.6.4 | 2026-10-29 | ~33500 bytes | 图鉴加成 ×5 → ×1.2（老板口径：20% → 24%）。原 ×5 占位把张无忌
//        顶成 100% 必出；rate 当前仅 hasBoss 一掷消费，选韦一笑/小昭/谢逊/寒离飒今日实际无效果（挂账）
// V7.6.3 | 2026-10-22 | ~33500 bytes
export const VER = 'modules/29battle-init.js V7.6.5';

import { CONFIG, getGameData } from '../core/01config-5v5-test.js';
import { Unit, applyHeroFlags, HERO_FLAGS } from '../core/02unit.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { CAMP_TYPES, ROLE_TYPES } from '../infra/56-battle-enums.js';

const C = CONFIG;

// 内容表功率读数（单一数据源，缺项即抛错，不静默兜底）
function elitePowerOf(name) {
    const p = C.ELITE_POWER?.[name];
    if (p == null) throw new Error(`缺 roster.elitePower: ${name}`);
    return p;
}
function normalPowerOf(m) {
    const p = C.NORMAL_POWER?.[m];
    if (p == null) throw new Error(`缺 roster.normalPower: ${m}`);
    return p;
}

// 六大派精英身份 → 站位优先数组：数据源 content.roster.enemyElitePos（格式 { flag: [优先级数组] }）
// 加新精英：若需要固定站位就在 content 加一行 { "isXxx": [优先级数组] }，本文件无需改
// ⚠️ 匹配顺序 = JSON 键序（Object.entries 按书写顺序），靠前的身份优先命中
function getEnemyElitePosFlags() {
    return Object.entries(C.ENEMY_ELITE_POS_FLAGS_MAP || {});
}

// 战斗-初始化：生成明教+六大派阵容（纯逻辑，无 DOM）
export function initBattleTeams(currentStage, _rng) {
    const ENEMY_M = CONFIG.ENEMY_M;
    const _rand = (min, max) => _rng.nextInt(min, max);
    let allyTeam = [], enemyTeam = [];
    const mingSquadTemplate = C.MING_SQUADS && C.MING_SQUADS[currentStage] ? C.MING_SQUADS[currentStage] : null;
    const eliteRate = C.ELITE_RATE || {};
    const targetPower = C.MING_TARGET_POWER && C.MING_TARGET_POWER[currentStage] ? C.MING_TARGET_POWER[currentStage] : null;

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
    //   Boss：张无忌独一档，按 ELITE_RATE.张无忌（20%，content.roster.eliteRate）独立掷；出 Boss 时最多再配 1 个（强 70% / 弱 30%）
    //   无 Boss：强精英 90% 出 1 / 10% 出 2（绝不 3）；弱精英独立 WEAK_ELITE_MIX_RATE（30%）混入，总数 ≤ 3
    //   强精英池 = 韦一笑 / 小昭 / 金毛狮王谢逊 / 寒离飒（寒离飒由弱升强，与前者同级）
    //   弱精英池 = 杨逍 / 殷天正（由 HERO_FLAGS − eliteConfigs 派生，寒离飒进了精英表即自动排除）
    //   RNG 流纪律（PVP 双端同源）：骰子全部无条件消耗，force 只改「是否应用」，不改消耗序列。
    // 精英配置从 content.roster.eliteConfigs 读（数据化）——加精英只改 content，本文件不动
    //   tier='boss'   明教 Boss（独一档，Boss 局最多再配 1 个搭档）
    //   tier='strong' 强精英池（Boss 局可配、无 Boss 局走轮盘）
    //   flag          与 core/02 HERO_FLAGS 的名字映射对应（加新精英时那边也要补一行）
    //   power         仍从 content.roster.elitePower 查（数值唯一源不变）
    // 无兜底：配置缺失一律抛错，避免静默按老口径算
    const allEliteConfigs = C.ELITE_CONFIGS;
    if (!Array.isArray(allEliteConfigs) || allEliteConfigs.length === 0) {
        throw new Error('缺配置: content.roster.eliteConfigs（应为非空数组）');
    }
    const toEliteConfig = (c) => {
        if (!c || !c.name || !c.m || !c.role || !c.flag || !c.tier) {
            throw new Error(`缺字段: content.roster.eliteConfigs 项 ${JSON.stringify(c)}（须含 name/m/role/flag/tier）`);
        }
        if (!Object.values(ROLE_TYPES).includes(c.role)) {
            throw new Error(`非法 role: content.roster.eliteConfigs 项 ${c.name} 的 role='${c.role}'（须为 ROLE_TYPES 之一）`);
        }
        return { name: c.name, m: c.m, role: c.role, [c.flag]: true, power: elitePowerOf(c.name) };
    };
    const bossConfigs = allEliteConfigs.filter(c => c.tier === 'boss').map(toEliteConfig);
    if (bossConfigs.length !== 1) {
        throw new Error(`content.roster.eliteConfigs 里 tier='boss' 必须恰好 1 项（当前实现不支持多 Boss），实际 ${bossConfigs.length} 项`);
    }
    const bossConfig = bossConfigs[0];
    const strongEliteConfigs = allEliteConfigs.filter(c => c.tier === 'strong').map(toEliteConfig);
    if (strongEliteConfigs.length === 0) {
        throw new Error(`content.roster.eliteConfigs 里 tier='strong' 至少 1 项`);
    }
    // eliteConfigs 保留旧名：下游「弱精英池排除固定精英」按名字过滤，Boss 与强精英一并纳入
    const eliteConfigs = [bossConfig, ...strongEliteConfigs];

    // 派生弱精英池（需提前定义，供概率推演和强制判定使用）
    const fixedEliteNames = new Set(eliteConfigs.map(c => c.name));
    const mingWeakPool = Object.entries(C.MING_M)
        .filter(([n]) => HERO_FLAGS[n] && !fixedEliteNames.has(n))
        .map(([n, m]) => ({ name: n, m }));
    const forceWeakElite = GlobalStore.get('forceWeakElite') || localStorage.getItem('_forceWeakElite') || null;
    if (forceWeakElite && !mingWeakPool.some(w => w.name === forceWeakElite) && ENEMY_M[forceWeakElite] == null) {
        throw new Error(`forceWeakElite 无效（不在明教弱精英池、也不在 roster.enemyM）: ${forceWeakElite}`);
    }
    const weakAllyForced = !!(forceWeakElite && mingWeakPool.some(w => w.name === forceWeakElite));

    // 骰子先掷后判（全部无条件消耗，保证联机双端 RNG 序列一致）
    const bossRoll = _rng.next();
    const bossPartnerRoll = _rng.next();
    const noBossRouteRoll = _rng.next();
    const subRouteRoll = _rng.next();
    const strongPickIdxA = _rng.nextInt(0, strongEliteConfigs.length - 1);
    const strongPickIdxB = _rng.nextInt(0, strongEliteConfigs.length - 1);
    const weakPickIdxA = _rng.nextInt(0, Math.max(0, mingWeakPool.length - 1));
    const weakPickIdxB = _rng.nextInt(0, Math.max(0, mingWeakPool.length - 1));

    const hasBoss = bossRoll < (rate['张无忌'] ?? 0.20);

    let usedPower = 0;

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
        usedPower += c.power;
        return unit;
    };

    // 强制精英（dev）：任一 force 命中 = 单精英局，抑制随机轮盘
    const forceZhang = GlobalStore.get('forceZhang') || localStorage.getItem('_forceZhang') === '1';
    const forceWei = GlobalStore.get('forceWei') || localStorage.getItem('_forceWei') === '1';
    const forceXieXun = GlobalStore.get('forceXieXun') || localStorage.getItem('_forceXieXun') === '1';
    // V7.6.1：寒离飒已升强精英，需独立 force 通道（走 forceWeakElite 会撞下方入池校验抛错）
    const forceHanLiSa = GlobalStore.get('forceHanLiSa') || localStorage.getItem('_forceHanLiSa') === '1';
    const _forceXzEarly = (GlobalStore.get('forceXiaoZhao') === 'sister' || GlobalStore.get('forceXiaoZhao') === 'brother'
        || localStorage.getItem('_forceXiaoZhao') === 'sister' || localStorage.getItem('_forceXiaoZhao') === 'brother');
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
        usedPower += elitePowerOf(w.name);
        return unit;
    };

    if (weakAllyForced) {
        pushWeakElite(mingWeakPool.find(w => w.name === forceWeakElite));
    } else if (!anyForce) {
        if (hasBoss) {
            // 出张无忌 (20%)：
            // 20%带一强, 25%带一弱, 15%带两弱, 10%带一强一弱, 30%啥也不带
            pushElite(bossConfig);
            if (noBossRouteRoll < 0.20) {
                pushElite(strongEliteConfigs[strongPickIdxA]);
            } else if (noBossRouteRoll < 0.45) {
                if (mingWeakPool.length > 0) pushWeakElite(mingWeakPool[weakPickIdxA]);
            } else if (noBossRouteRoll < 0.60) {
                if (mingWeakPool.length > 0) {
                    pushWeakElite(mingWeakPool[weakPickIdxA]);
                    if (mingWeakPool.length > 1) {
                        const idxB = (weakPickIdxB === weakPickIdxA) ? (weakPickIdxB + 1) % mingWeakPool.length : weakPickIdxB;
                        pushWeakElite(mingWeakPool[idxB]);
                    }
                }
            } else if (noBossRouteRoll < 0.70) {
                pushElite(strongEliteConfigs[strongPickIdxA]);
                if (mingWeakPool.length > 0) pushWeakElite(mingWeakPool[weakPickIdxA]);
            }
        } else {
            // 无张无忌 (80%)：必出1强精英。然后：
            // 10%出双强, 40%出1弱, 10%出2弱, 剩下40%啥也不带
            pushElite(strongEliteConfigs[strongPickIdxA]);
            if (noBossRouteRoll < 0.10) {
                const idxB = (strongPickIdxB === strongPickIdxA) ? (strongPickIdxB + 1) % strongEliteConfigs.length : strongPickIdxB;
                pushElite(strongEliteConfigs[idxB]);
            } else if (noBossRouteRoll < 0.50) {
                if (mingWeakPool.length > 0) pushWeakElite(mingWeakPool[weakPickIdxA]);
            } else if (noBossRouteRoll < 0.60) {
                if (mingWeakPool.length > 0) {
                    pushWeakElite(mingWeakPool[weakPickIdxA]);
                    if (mingWeakPool.length > 1) {
                        const idxB = (weakPickIdxB === weakPickIdxA) ? (weakPickIdxB + 1) % mingWeakPool.length : weakPickIdxB;
                        pushWeakElite(mingWeakPool[idxB]);
                    }
                }
            }
        }
    }

    // 普通兵候选池
    const candidatePool = [];
    for (const [name, m] of Object.entries(C.MING_M)) {
        // 去名字字面量：用身份标记判断是否精英（与 eliteConfigs 同源）
        if (HERO_FLAGS[name]) continue;
        if (m >= 95 && m <= 104) candidatePool.push({ name, m, role: null, power: normalPowerOf(m) });
    }
    candidatePool.sort((a, b) => a.power - b.power);

    const remainingCandidates = [...candidatePool];
    let remainingPower = (targetPower ?? C.MING_TARGET_POWER_FALLBACK) - usedPower;
    let remainingSlots = 5 - allyTeam.length;
    for (let slot = 0; slot < remainingSlots; slot++) {
        const avgPower = remainingSlots > 0 ? remainingPower / remainingSlots : C.POWER_FALLBACK;
        const candidates = [];
        const above = remainingCandidates.filter(c => c.power >= avgPower).sort((a, b) => a.power - b.power).slice(0, 3);
        const below = remainingCandidates.filter(c => c.power < avgPower).sort((a, b) => b.power - a.power).slice(0, 2);
        candidates.push(...above);
        for (const c of below) { if (!candidates.some(x => x.name === c.name)) candidates.push(c); }
        if (candidates.length === 0) candidates.push(...remainingCandidates.slice(0, 5));
        const pick = candidates[_rand(0, candidates.length - 1)];
        const idx = remainingCandidates.findIndex(c => c.name === pick.name);
        if (idx >= 0) remainingCandidates.splice(idx, 1);
        const role = C.ROLES[_rand(0, 3)];
        const unit = new Unit(pick.name, pick.m, role, CAMP_TYPES.ALLY);
        unit.init(_rng); unit.applyBonus();
        unit.pos = null;
        allyTeam.push(unit);
        remainingPower -= pick.power;
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
                remainingPower += normalPowerOf(swappable.m);
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
            remainingPower -= elitePowerOf('小昭');
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
    if (squadVariants && squadVariants.length > 0) {
        // 先抽再判：forcePang 时即使覆盖结果也照抽一次，保证 RNG 流与不强制时一致（PVP 双端同源）
        const roll = _rng.nextInt(0, squadVariants.length - 1);
        const forcePang = GlobalStore.get('forcePang') || localStorage.getItem('_forcePang') === '1';
        let variant = squadVariants[roll];
        if (forcePang) {
            const target = squadVariants.find(v => v.squad.some(it => it && it.name === '胖远桥'));
            if (!target) throw new Error('forcePang 生效，但第三关没有含「胖远桥」的阵容变体');
            variant = target;
        }
        enemySquad = variant.squad;
        variantPosTemplate = variant.posTemplate || null;
    }
    let enemyUnits = [];
    const usedEnemyNames = [];

    // —— 六大派弱精英混入——
    // 池由名册派生（六大派名册里带身份标记、且不属于任一关卡的固定精英池）＝何太冲/唐文亮，不另建清单；
    //   命中则本局把「首个 M 值匹配的数字空位」锁定为该弱精英（每局至多一名），照明教侧混入口径。
    //   本关若没有对应 M 的数字空位（如第 3 关变体全是对象项）则不生效。
    const fixedEnemyEliteNames = new Set(Object.values(C.ELITE_POOL || {}).flat().map(e => e && e.name));
    const enemyWeakPool = Object.entries(ENEMY_M)
        .filter(([n]) => HERO_FLAGS[n] && !fixedEnemyEliteNames.has(n))
        .map(([n, m]) => ({ name: n, m }));
    // RNG 流纪律（PVP 双端同源）：抽签无条件消耗，锁定与否只改「是否应用」，不改消耗序列
    const enemyWeakRoll = _rng.next();
    const enemyWeakPickIdx = enemyWeakPool.length > 0 ? _rand(0, enemyWeakPool.length - 1) : 0;
    let weakLockName = null;
    if (forceWeakElite && ENEMY_M[forceWeakElite] != null) {
        weakLockName = forceWeakElite;          // dev 强制优先
    } else if (enemyWeakPool.length > 0 && enemyWeakRoll < C.WEAK_ELITE_MIX_RATE) {
        weakLockName = enemyWeakPool[enemyWeakPickIdx].name;
    }
    let weakLockUsed = false;

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
                let pool = Object.entries(ENEMY_M).filter(([n, v]) => v === mVal);
                let name = null;
                const squadDefs = Object.values(C.ENEMY_SQUADS).flat();
                for (let def of squadDefs) { if (typeof def === 'object' && def.m === mVal && !usedEnemyNames.includes(def.name)) { name = def.name; break; } }
                if (!name && pool.length > 0) {
                    let attempts = 0;
                    while ((!name || usedEnemyNames.includes(name)) && attempts < 50) { let pick = pool[_rand(0, pool.length - 1)]; name = pick[0]; attempts++; }
                }
                if (!name) {
                    const fallbackSects = ['少林弟子', '武当弟子', '峨眉弟子', '昆仑弟子', '崆峒弟子'];
                    const fallbackName = fallbackSects[_rand(0, fallbackSects.length - 1)];
                    const existingCount = usedEnemyNames.filter(n => n.startsWith(fallbackName)).length;
                    name = fallbackName + (existingCount > 0 ? String(existingCount + 1) : '');
                }
                // 弱精英锁定：命中名册且 M 值对上
                //   本数字空位时锁定该具名——六大派弱精英「混入正常阵容占 1 位」，每局至多一名；
                //   本关若无对应 M 空位则不生效（如第 3 关胖远桥组全对象项）
                if (!weakLockUsed && weakLockName && ENEMY_M[weakLockName] === mVal && !usedEnemyNames.includes(weakLockName)) {
                    name = weakLockName;
                    weakLockUsed = true;
                }
                // 具名角色填数值空位时用「自身职业」，不再四选一乱抽——
                //   老板实测何太冲（昆仑·远程）偶尔顶着"防战"出场：该路径职业原本与身份无关。
                //   无名杂兵（空闻/班淑娴等，不在 characters 表）保持随机，当作阵容变数。
                let role = C.ROLES[_rand(0, 3)];
                // 职业解析优先级：content `role` 字段（标枪等非 CONFIG.ROLES 职业）> tags 命中 CONFIG.ROLES
                // 第二道防线：tags 里直接写「标枪」也认（role 字段丢失时不至于回落到随机四选一）
                const chNamed = getGameData()?.characters?.[name];
                let tagRole = chNamed?.role || (chNamed?.tags || []).find(t => C.ROLES.includes(t) || t === ROLE_TYPES.JAVELIN);

                // 何太冲双修：取消固定远程，在远程和战士之间随机摇（RNG 走 _rng，保联机同步）
                if (name === '何太冲') {
                    tagRole = _rng.next() < 0.5 ? ROLE_TYPES.WARRIOR : ROLE_TYPES.RANGED;
                }

                if (tagRole) role = tagRole;
                let unit = new Unit(name, mVal, role, CAMP_TYPES.ENEMY);
                unit.pos = null; unit.init(_rng); unit.applyBonus();
                enemyUnits.push(unit);
                usedEnemyNames.push(name);
            }
        }
        if (currentStage === 5 && xuanmingPairCount === 2) {
            let extraM = C.XUANMING_EXTRA_M;
            let pool = Object.entries(ENEMY_M).filter(([n, v]) => v === extraM);
            let usedNames = enemyUnits.map(u => u.name);
            let name = null;
            while ((!name || usedNames.includes(name)) && pool.length > 0) {
                let pick = pool[_rand(0, pool.length - 1)];
                name = pick[0];
                if (usedNames.includes(name)) { name = null; pool.splice(pool.indexOf(pick), 1); }
            }
            if (!name) {
                const fallbackSects = ['少林弟子', '武当弟子', '峨眉弟子', '昆仑弟子', '崆峒弟子'];
                const fallbackName = fallbackSects[_rand(0, fallbackSects.length - 1)];
                const existingCount = usedEnemyNames.filter(n => n.startsWith(fallbackName)).length;
                name = fallbackName + (existingCount > 0 ? String(existingCount + 1) : '');
            }
            // 职业解析与具名兵同口径：content `role` 字段 > tags 命中 CONFIG.ROLES 或标枪
            //   （此前这里只掷 C.ROLES 随机四选一，M104 池抽到唐文亮会给错职业）
            const chNamed = getGameData()?.characters?.[name];
            let role = C.ROLES[_rand(0, 3)];
            const tagRole = chNamed?.role || (chNamed?.tags || []).find(t => C.ROLES.includes(t) || t === ROLE_TYPES.JAVELIN);
            if (tagRole) role = tagRole;
            let extraUnit = new Unit(name, extraM, role, CAMP_TYPES.ENEMY);
            extraUnit.init(_rng); extraUnit.applyBonus();
            enemyUnits.push(extraUnit);
        }
        let allUnits = [...enemyUnits];
        let template = variantPosTemplate || (C.ENEMY_POS_TEMPLATES && C.ENEMY_POS_TEMPLATES[currentStage] ? C.ENEMY_POS_TEMPLATES[currentStage] : null);
        let eliteUnits = allUnits.filter(u => C.ELITE_POOL && C.ELITE_POOL[currentStage] && C.ELITE_POOL[currentStage].some(e => e.name === u.name));
        let normalUnits = allUnits.filter(u => !eliteUnits.includes(u));
        // 张三丰固定1号位：普通兵排位之前先锁，其他单位不许占
        const zhangSanfeng = eliteUnits.find(u => u.name === '张三丰');
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

    return { allyTeam, enemyTeam };
}