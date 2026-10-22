// V7.6.3 | 2026-10-22 额外兵职业解析同口径（M104 池抽到唐文亮不再掷随机四选一，读 content role/tags）
// V7.6.2 | 2026-10-22 数字空位职业解析加第二道防线：tags 含「标枪」也认（不依赖 content role 字段在不在）
// V7.6.1 | 2026-10-22 补寒离飒强精英 force 通道（forceHanLiSa）：她 V7.6.0 并入 eliteConfigs 后
//   已在弱精英池之外，旧的 forceWeakElite='寒离飒' 会撞入池校验抛错、强精英评测整组跑不了
// V7.6.0 | 2026-10-22 明教精英分层重写（老板口径限强度保趣味）：Boss（张无忌 30%）独掷、Boss 局最多再配 1 个
//   （强 70%/弱 30%）；无 Boss 时强精英 90% 出 1 / 10% 出 2（绝不 3），弱精英独立 30% 混入；
//   寒离飒由弱升强进强精英池；删 eliteCount / ELITE_COUNT_THRESHOLDS 旧轮盘（骰子先掷后判，RNG 流仍双端同源）
// V7.5.26 | 2026-10-21 新增 forceSoloWeakElite（仅工具 112 强精英单挑用）：配合 forceWeakElite 锁定寒离飒时
//            抑制随机精英轮盘，得到「只有她一个精英」的单核局；不设该标志时弱精英混入照旧（强精英轮盘照常）
// V7.5.24 | ~25400 bytes | 2026-10-19 六大派弱精英随机混入（老板拍板，与明教侧同率 WEAK_ELITE_MIX_RATE）：
//            池由名册派生（HERO_FLAGS ∩ 不属于任一关卡固定精英池）＝何太冲/唐文亮，命中则锁定一处 M 值匹配的数字空位
//            （每局至多一名）；dev 强制 forceWeakElite 优先，两者共用同一条锁定通道
// V7.5.23 | 2026-10-17 唐文亮（标枪弱精英）重做接线：职业优先读 content `characters.*.role`（标枪不进 CONFIG.ROLES，
//            故不能只靠 tags 判定）+ 恒定落中后排 4~9（身份优先表 CONFIG.ENEMY_ELITE_POS_PRIORITY.tangWenLiang）
// V7.5.22 | ~24700 bytes | 2026-10-16 弱精英定案：明教固定精英轮盘只留张/韦/小昭/谢逊，杨逍/殷天正改「随机混入」正常阵容；
//            六大派第 3 关撤销崆峒整队变体（只剩宋青书/胖远桥两变体），唐文亮降 M104 混入具名池；新增 forceWeakElite 锁定（测试用）
// ── 更早版本见 记录-更改履历.md
export const VER = 'modules/29battle-init.js V7.6.3';

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

// 六大派精英身份 → 站位优先表（身份优先于 CONFIG.ELITE_POS_PRIORITY 的职业表）
const ENEMY_ELITE_POS_FLAGS = [
    ['isChengKun', 'chengKun'],
    ['isMieJueShiTai', 'mieJueShiTai'],
    ['isPangYuanQiao', 'pangYuanQiao'],
    ['isLuZhangKe', 'luZhangKe'],
    ['isHeBiWeng', 'heBiWeng']
];

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
        rate[PICK_TO_ELITE[pickKey]] = (rate[PICK_TO_ELITE[pickKey]] || 0.3) * 5;
    }

    // ── 2026-10-22 明教精英分层重写（老板口径：限强度、保趣味）──
    //   Boss：张无忌独一档，按 ELITE_RATE.张无忌（30%）独立掷；出 Boss 时最多再配 1 个（强 70% / 弱 30%）
    //   无 Boss：强精英 90% 出 1 / 10% 出 2（绝不 3）；弱精英独立 WEAK_ELITE_MIX_RATE（30%）混入，总数 ≤ 3
    //   强精英池 = 韦一笑 / 小昭 / 金毛狮王谢逊 / 寒离飒（寒离飒 2026-10-22 由弱升强，与前者同级）
    //   弱精英池 = 杨逍 / 殷天正（由 HERO_FLAGS − eliteConfigs 派生，寒离飒进了精英表即自动排除）
    //   RNG 流纪律（PVP 双端同源）：骰子全部无条件消耗，force 只改「是否应用」，不改消耗序列。
    const bossConfig = { name: '张无忌', m: 115, role: ROLE_TYPES.RANGED, isZhang: true, power: elitePowerOf('张无忌') };
    const strongEliteConfigs = [
        { name: '韦一笑', m: 107, role: ROLE_TYPES.FLYER, isWei: true, power: elitePowerOf('韦一笑') },
        { name: '小昭', m: 107, role: ROLE_TYPES.RANGED, isXiaoZhaoBrother: true, power: elitePowerOf('小昭') },
        { name: '金毛狮王谢逊', m: 107, role: ROLE_TYPES.WARRIOR, isXieXun: true, power: elitePowerOf('金毛狮王谢逊') },
        { name: '寒离飒', m: 107, role: ROLE_TYPES.WARRIOR, isHanLiSa: true, power: elitePowerOf('寒离飒') }
    ];
    // eliteConfigs 保留旧名：下游「弱精英池排除固定精英」按名字过滤，Boss 与强精英一并纳入
    const eliteConfigs = [bossConfig, ...strongEliteConfigs];

    // 骰子先掷后判（全部无条件消耗）
    const bossRoll = _rng.next();
    const bossPartnerRoll = _rng.next();
    const strongCountRoll = _rng.next();
    const strongPickIdxA = _rng.nextInt(0, strongEliteConfigs.length - 1);
    const strongPickIdxB = _rng.nextInt(0, strongEliteConfigs.length - 1);
    const hasBoss = bossRoll < (rate['张无忌'] ?? 0.30);
    const bossWantStrong = bossPartnerRoll < 0.70;
    const noBossStrongCount = strongCountRoll < 0.10 ? 2 : 1;

    let usedPower = 0;
    let bossPartnerIsStrong = false;   // Boss 局搭档名额是否已用掉（弱精英块据此跳过）

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
    // 2026-10-22 V7.6.1：寒离飒已升强精英，需独立 force 通道（走 forceWeakElite 会撞下方入池校验抛错）
    const forceHanLiSa = GlobalStore.get('forceHanLiSa') || localStorage.getItem('_forceHanLiSa') === '1';
    const _forceXzEarly = (GlobalStore.get('forceXiaoZhao') === 'sister' || GlobalStore.get('forceXiaoZhao') === 'brother'
        || localStorage.getItem('_forceXiaoZhao') === 'sister' || localStorage.getItem('_forceXiaoZhao') === 'brother');
    // 2026-10-21 V7.5.26：forceSoloWeakElite（工具强精英单挑）单独抑制轮盘——只锁寒离飒、不产生第二个精英
    const forceSoloWeak = GlobalStore.get('forceSoloWeakElite') === true;
    const anyForce = forceZhang || forceWei || forceXieXun || forceHanLiSa || _forceXzEarly || forceSoloWeak;

    if (forceZhang && !allyTeam.some(u => u.isZhang)) pushElite(bossConfig);
    if (forceWei && !allyTeam.some(u => u.isWei)) pushElite(strongEliteConfigs.find(c => c.isWei));
    if (forceXieXun && !allyTeam.some(u => u.isXieXun)) pushElite(strongEliteConfigs.find(c => c.isXieXun));
    if (forceHanLiSa && !allyTeam.some(u => u.isHanLiSa)) pushElite(strongEliteConfigs.find(c => c.isHanLiSa));

    // 2026-10-08 V7.5.16 小昭同款互锁（dev 试玩按钮与张/韦同一排，口径对齐）：指定姊/妹时轮盘不转，
    //   队里=单小昭局。旧版轮盘照抽，「小昭+另一精英」双精英场占 3/4（探针实测单精英命中仅 74/300）。
    if (!anyForce) {
        if (hasBoss) {
            pushElite(bossConfig);
            // Boss 局最多再配 1 个：70% 配强精英，30% 名额留给下方弱精英混入块
            if (bossWantStrong) {
                pushElite(strongEliteConfigs[strongPickIdxA]);
                bossPartnerIsStrong = true;
            }
        } else {
            pushElite(strongEliteConfigs[strongPickIdxA]);
            if (noBossStrongCount >= 2) {
                // 第二抽避开第一抽（index 相同时顺延一位，不额外消耗 RNG）
                const idxB = (strongPickIdxB === strongPickIdxA)
                    ? (strongPickIdxB + 1) % strongEliteConfigs.length
                    : strongPickIdxB;
                pushElite(strongEliteConfigs[idxB]);
            }
        }
    }

    // 普通兵候选池
    const candidatePool = [];
    for (const [name, m] of Object.entries(C.MING_M)) {
        // 2026-09-14 去名字字面量：用身份标记判断是否精英（与 eliteConfigs 同源）
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

    // —— 弱精英随机混入（明教，2026-10-16 定案）——
    // 明教固定精英轮盘＝张无忌/韦一笑/小昭/谢逊；其余具名身份（杨逍/殷天正）属「弱精英」，
    //   不进轮盘：按 WEAK_ELITE_MIX_RATE 概率随机替换一个普通位混入正常阵容（每局至多一名）。
    // 弱精英池由名册派生（明教名册里带身份标记、且不在固定精英轮盘内），不另建清单。
    const fixedEliteNames = new Set(eliteConfigs.map(c => c.name));
    const mingWeakPool = Object.entries(C.MING_M)
        .filter(([n]) => HERO_FLAGS[n] && !fixedEliteNames.has(n))
        .map(([n, m]) => ({ name: n, m }));
    // 弱精英锁定（dev 测试用）：GlobalStore/localStorage 传具名 → 该弱精英必出（明教侧走本块、六大派侧见数字空位锁定）
    const forceWeakElite = GlobalStore.get('forceWeakElite') || localStorage.getItem('_forceWeakElite') || null;
    if (forceWeakElite && !mingWeakPool.some(w => w.name === forceWeakElite) && ENEMY_M[forceWeakElite] == null) {
        throw new Error(`forceWeakElite 无效（不在明教弱精英池、也不在 roster.enemyM）: ${forceWeakElite}`);
    }
    const weakAllyForced = !!(forceWeakElite && mingWeakPool.some(w => w.name === forceWeakElite));
    // 2026-10-22 寒离飒已升强精英：混入时不能再把他换掉；Boss 局搭档已配强精英则跳过（总数控在 Boss+1）
    const mixSwappable = allyTeam.filter(u => !u.isZhang && !u.isWei && !u.isXiaoZhaoSister && !u.isXiaoZhaoBrother && !u.isXieXun && !u.isHanLiSa);
    // RNG 流纪律（PVP 双端同源）：抽签无条件消耗，锁定与否只改「是否应用」，不改消耗序列
    const mixRoll = _rng.next();
    const mixVictimIdx = mixSwappable.length > 0 ? _rand(0, mixSwappable.length - 1) : 0;
    const mixPickIdx = mingWeakPool.length > 0 ? _rand(0, mingWeakPool.length - 1) : 0;
    const weakMixAllowed = weakAllyForced || (!bossPartnerIsStrong && mixRoll < C.WEAK_ELITE_MIX_RATE);
    if (mingWeakPool.length > 0 && mixSwappable.length > 0 && weakMixAllowed) {
        const victim = mixSwappable[mixVictimIdx];
        const pick = weakAllyForced
            ? mingWeakPool.find(w => w.name === forceWeakElite)
            : mingWeakPool[mixPickIdx];
        // 2026-10-17 职业解析优先级：content `role` 字段（可放非 CONFIG.ROLES 的职业，如标枪）> tags 命中 CONFIG.ROLES
        const chWeak = getGameData()?.characters?.[pick.name];
        const tagRole = chWeak?.role || (chWeak?.tags || []).find(t => C.ROLES.includes(t));
        if (!tagRole) throw new Error(`明教弱精英缺职业（characters.${pick.name}.role / tags）`);
        const unit = new Unit(pick.name, pick.m, tagRole, CAMP_TYPES.ALLY);
        unit.init(_rng); unit.applyBonus();
        unit.pos = null;
        allyTeam.splice(allyTeam.indexOf(victim), 1, unit);
    }

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
    // 2026-09-22 金毛狮王谢逊站 7 号位（与张无忌5/韦一笑6/小昭4 同性质：只是站位锚点）
    // 2026-09-24 不在这里单独锁死：他和张/韦/小昭 一样，只占下面「固定 3 位」里的一个名额。
    //   原先此处直接 xie.fixed = true，会让他不在 toLock 名单里却多锁一个 → 明教出现 4 个固定位，
    //   且补足到 3 的随机补位可能落到无关的普通弟子身上。
    let xie = allyTeam.find(u => u.isXieXun);
    if (xie) { xie.pos = 7; takenPos.add(7); }
    // 2026-10-17 寒离飒恒定 2 号位（老板拍板）：先于「张无忌在场时 others[0] 站 2」的旧规则抢位，
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
    // 2026-09-24 谢逊并入名单：明教固定位恒为 3 个（张/韦/小昭/谢逊 中在队的按序占名额，不足 3 随机补足）。
    //   四人同时在队时（forceXieXun + 满精英）按优先级截断到 3，保证「锁 3 位」恒定，不会又变回 4 位。
    // 2026-10-19 寒离飒插队首位（老板实机反馈「初始站位固定 2 号位置」）：她的整套蓄意轰拳以 2 号位为锚，
    //   准备阶段不许拖走；五锚同队时张/韦保锁、小昭/谢逊按序让位，锁位总数仍恒 3。
    let toLock = [hls, zhang, wei, xz, xie].filter(Boolean).slice(0, 3);
    while (toLock.length < 3) { let pool = allyTeam.filter(u => !toLock.includes(u)); if (pool.length === 0) break; let pick = pool[_rand(0, pool.length - 1)]; toLock.push(pick); }
    toLock.forEach(u => { u.fixed = true; });

    // 六大派阵容生成
    let enemySquad = C.ENEMY_SQUADS && C.ENEMY_SQUADS[currentStage] ? C.ENEMY_SQUADS[currentStage] : null;
    // 第三关阵容轮换：encounters.squadVariants[stage] 存在时随机抽一组（走 _rng，PVP 双端同源）
    // 2026-09-22 变体升级为 { squad, posTemplate? }：阵容与站位成套下发；posTemplate 缺省才回落关卡级 ENEMY_POS_TEMPLATES
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

    // —— 六大派弱精英混入（2026-10-19 老板拍板：与明教侧同率 WEAK_ELITE_MIX_RATE）——
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
                // 弱精英锁定（2026-10-16 起；2026-10-19 扩为「dev 强制 or 本局随机混入」）：命中名册且 M 值对上
                //   本数字空位时锁定该具名——六大派弱精英「混入正常阵容占 1 位」，每局至多一名；
                //   本关若无对应 M 空位则不生效（如第 3 关胖远桥组全对象项）
                if (!weakLockUsed && weakLockName && ENEMY_M[weakLockName] === mVal && !usedEnemyNames.includes(weakLockName)) {
                    name = weakLockName;
                    weakLockUsed = true;
                }
                // 2026-10-11 具名角色填数值空位时用「自身职业」，不再四选一乱抽——
                //   老板实测何太冲（昆仑·远程）偶尔顶着"防战"出场：该路径职业原本与身份无关。
                //   无名杂兵（空闻/班淑娴等，不在 characters 表）保持随机，当作阵容变数。
                let role = C.ROLES[_rand(0, 3)];
                // 2026-10-17 职业解析优先级：content `role` 字段（标枪等非 CONFIG.ROLES 职业）> tags 命中 CONFIG.ROLES
                // 2026-10-22 第二道防线：tags 里直接写「标枪」也认（role 字段丢失时不至于回落到随机四选一）
                const chNamed = getGameData()?.characters?.[name];
                const tagRole = chNamed?.role || (chNamed?.tags || []).find(t => C.ROLES.includes(t) || t === ROLE_TYPES.JAVELIN);
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
            // 2026-10-22 职业解析与具名兵同口径：content `role` 字段 > tags 命中 CONFIG.ROLES 或标枪
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
        // 2026-09-17 张三丰固定1号位：普通兵排位之前先锁，其他单位不许占
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
            // 2026-10-12 具名角色（characters 表且有 ROLES tag，如 何太冲=远程）：职业是身份，不参与下面的凑模板改职
            //   2026-10-17 补 content `role` 字段（标枪等非 CONFIG.ROLES 职业）同判 isTagFixed
            const isTagFixed = (u) => { const ch = getGameData()?.characters?.[u.name]; return !!(ch && (ch.role || (ch.tags || []).find(t => C.ROLES.includes(t)))); };
            for (let role of [ROLE_TYPES.DEFENDER, ROLE_TYPES.RANGED, ROLE_TYPES.FLYER, ROLE_TYPES.WARRIOR]) {
                let need = templateNeeds[role] || 0;
                let current = roleCounts[role] || 0;
                let shortage = need - current;
                if (shortage > 0) {
                    // 2026-10-12 具名角色不参与凑模板改职（V7.5.17 只守了抽名这步，会把何太冲改成飞行）——缺位留给无名杂兵
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
        // 2026-10-17 唐文亮（标枪弱精英）：恒定落中后排 4~9——「标枪」不是模板职业，模板排位挑不到他，
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
            for (const p of twOrder.concat(C.ENEMY_ELITE_POS_PRIORITY.tangWenLiang)) {
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
        for (let u of otherElites) {
            let priority;
            // 身份优先表见 CONFIG.ENEMY_ELITE_POS_PRIORITY（未命中回落默认 1→9）
            const hit = ENEMY_ELITE_POS_FLAGS.find(([flag]) => u[flag]);
            priority = hit ? C.ENEMY_ELITE_POS_PRIORITY[hit[1]] : C.ENEMY_ELITE_POS_FALLBACK;
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