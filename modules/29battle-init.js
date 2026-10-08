// V7.5.16 | 2026-10-08 随机精英轮盘互锁补全：forceXieXun / forceXiaoZhao 也抑制轮盘（与张/韦对称）——四路 force 全=真·单精英局；正常局无 force 行为不变（基线 18 场全一致）
// V6.5.4 | ~23400 bytes | 2026-10-03 强制小昭换人候选补排谢逊（!u.isXieXun，对齐下方站位段口径）：此前谢逊在场且无小昭时被当普通兵换掉，normalPowerOf(107) 查表抛「缺 roster.normalPower: 107」
export const VER = 'modules/29battle-init.js V6.5.4';

import { CONFIG } from '../core/01config-5v5-test.js';
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

    // 精英出场率：80%一个、15%两个、5%三个，按 ELITE_RATE 权重选人
    // 阈值走 CONFIG.ELITE_COUNT_THRESHOLDS（[3人, 2人, 1人] 的上界）
    const [t3, t2, t1] = C.ELITE_COUNT_THRESHOLDS;
    const eliteConfigs = [
        { name: '张无忌', m: 115, role: ROLE_TYPES.RANGED, isZhang: true, power: elitePowerOf('张无忌') },
        { name: '韦一笑', m: 107, role: ROLE_TYPES.FLYER, isWei: true, power: elitePowerOf('韦一笑') },
        { name: '小昭', m: 107, role: ROLE_TYPES.RANGED, isXiaoZhaoBrother: true, power: elitePowerOf('小昭') },
        // 2026-09-22 金毛狮王谢逊转正：与另外三位同性质，走随机精英轮盘（不再是 demo 开关专享）
        { name: '金毛狮王谢逊', m: 107, role: ROLE_TYPES.WARRIOR, isXieXun: true, power: elitePowerOf('金毛狮王谢逊') }
    ];
    const eliteRoll = _rng.next();
    let eliteCount;
    if (eliteRoll < t3) {
        eliteCount = 3;
    } else if (eliteRoll < t2) {
        eliteCount = 2;
    } else if (eliteRoll < t1) {
        eliteCount = 1;
    } else {
        eliteCount = 0;
    }

    let usedPower = 0;

    // 强制精英：张无忌/韦一笑独立覆盖
    const forceZhang = GlobalStore.get('forceZhang') || localStorage.getItem('_forceZhang') === '1';
    const forceWei = GlobalStore.get('forceWei') || localStorage.getItem('_forceWei') === '1';
    if (forceZhang || forceWei) {
        eliteCount = Math.max(eliteCount, 1);
        if (forceZhang) {
            const cfg = eliteConfigs.find(c => c.name === '张无忌');
            if (cfg && !allyTeam.some(u => u.isZhang)) {
                let unit = new Unit(cfg.name, cfg.m, cfg.role, CAMP_TYPES.ALLY);
                unit.isZhang = true;
                unit.init(_rng); unit.applyBonus();
                unit.pos = null;
                allyTeam.push(unit);
                usedPower += cfg.power;
            }
        }
        if (forceWei) {
            const cfg = eliteConfigs.find(c => c.name === '韦一笑');
            if (cfg && !allyTeam.some(u => u.isWei)) {
                let unit = new Unit(cfg.name, cfg.m, cfg.role, CAMP_TYPES.ALLY);
                unit.isWei = true;
                unit.init(_rng); unit.applyBonus();
                unit.pos = null;
                allyTeam.push(unit);
                usedPower += cfg.power;
            }
        }
    }

    // 2026-09-22 强制金毛狮王谢逊（demo 用）：明教侧固定加入，站 7 号位。
    // 与 forceZhang / forceWei 同口径（GlobalStore 优先、localStorage 兜底），但独立成块——
    // 谢逊是固定位角色，不参与上面的随机精英轮盘（eliteCount / weightedPick）。
    // 2026-10-08 V7.5.16 轮盘互锁（老板拍板「谢逊加一下」）：forceXieXun 同样抑制随机轮盘——
    //   旧版勾谢逊后轮盘照转，队里常是「谢逊+另一个精英」，四精英单挑评测口径不对齐（112/探针实测
    //   单精英命中 0/300）。现与张/韦同款互锁，勾了谢逊=单精英局。
    const forceXieXun = GlobalStore.get('forceXieXun') || localStorage.getItem('_forceXieXun') === '1';
    if (forceXieXun && !allyTeam.some(u => u.isXieXun)) {
        const unit = new Unit('金毛狮王谢逊', 107, ROLE_TYPES.WARRIOR, CAMP_TYPES.ALLY);
        unit.init(_rng); unit.applyBonus();
        unit.pos = null;
        allyTeam.push(unit);
        usedPower += elitePowerOf('金毛狮王谢逊');
    }

    // 2026-10-08 V7.5.16 小昭同款互锁（dev 试玩按钮与张/韦同一排，口径对齐）：指定姊/妹时轮盘不转，
    //   队里=单小昭局。旧版轮盘照抽，「小昭+另一精英」双精英场占 3/4（探针实测单精英命中仅 74/300）。
    const _forceXzEarly = (GlobalStore.get('forceXiaoZhao') === 'sister' || GlobalStore.get('forceXiaoZhao') === 'brother'
        || localStorage.getItem('_forceXiaoZhao') === 'sister' || localStorage.getItem('_forceXiaoZhao') === 'brother');
    if (eliteCount > 0 && !forceZhang && !forceWei && !forceXieXun && !_forceXzEarly) {
        const picked = [];
        // 2026-09-22 已在队的精英不再进池：forceXieXun 等强制路径可能已经加过，
        // 不去重会抽出第二个同名精英（小昭会被改名成「小昭·姊/妹」，所以标记判断不能只看 name）
        const pool = eliteConfigs.filter(c => !allyTeam.some(u =>
            u.name === c.name ||
            (c.isZhang && u.isZhang) ||
            (c.isWei && u.isWei) ||
            (c.isXiaoZhaoBrother && (u.isXiaoZhaoSister || u.isXiaoZhaoBrother)) ||
            (c.isXieXun && u.isXieXun)
        ));
        function weightedPick(arr) {
            const total = arr.reduce((s, c) => s + (rate[c.name] || 1 / arr.length), 0);
            let r = _rng.next() * total;
            for (let i = 0; i < arr.length; i++) {
                r -= (rate[arr[i].name] || 1 / arr.length);
                if (r <= 0) return i;
            }
            return arr.length - 1;
        }
        if (eliteCount === 3) {
            // 2026-09-22 池子从 3 人扩到 4 人后，不能再 push(...pool) 全抽（会出 4 个超编），改为按权重抽满 3 个
            const rest = [...pool];
            while (picked.length < 3 && rest.length > 0) {
                const i = weightedPick(rest);
                picked.push(rest[i]);
                rest.splice(i, 1);
            }
        } else if (eliteCount === 2) {
            const i1 = weightedPick(pool);
            const rest = pool.filter((_, i) => i !== i1);
            const i2 = weightedPick(rest);
            picked.push(pool[i1], rest[i2]);
        } else {
            picked.push(pool[weightedPick(pool)]);
        }

        for (const c of picked) {
            // 小昭初始职业随机（与 forceXiaoZhao 路径一致，两条路必须同口径）。
            // initXiaoZhao 只覆盖 血/攻/防 的分配（50% 血、剩余对半分），不改职业，故这里给什么职业都行。
            const initRole = c.isXiaoZhaoBrother ? C.ROLES[_rng.nextInt(0, 3)] : c.role;
            let unit = new Unit(c.name, c.m, initRole, CAMP_TYPES.ALLY);
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
            const swappable = allyTeam.find(u => !u.isZhang && !u.isWei && !u.isXieXun);
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

    // 保证至少一个前排单位
    if (!allyTeam.some(u => u.role === ROLE_TYPES.DEFENDER || u.role === ROLE_TYPES.WARRIOR)) {
        const nonFixed = allyTeam.filter(u => !u.isZhang && !u.isWei && !u.isXiaoZhaoSister && !u.isXiaoZhaoBrother);
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
    let others = allyTeam.filter(u => !u.isZhang && !u.isWei && !u.isXiaoZhaoSister && !u.isXiaoZhaoBrother && !u.isXieXun);
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
    let toLock = [zhang, wei, xz, xie].filter(Boolean).slice(0, 3);
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
                let role = C.ROLES[_rand(0, 3)];
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
            let role = C.ROLES[_rand(0, 3)];
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
            for (let role of [ROLE_TYPES.DEFENDER, ROLE_TYPES.RANGED, ROLE_TYPES.FLYER, ROLE_TYPES.WARRIOR]) {
                let need = templateNeeds[role] || 0;
                let current = roleCounts[role] || 0;
                let shortage = need - current;
                if (shortage > 0) {
                    let others = normalUnits.filter(u => u.role !== role && (templateNeeds[u.role] || 0) < (roleCounts[u.role] || 0));
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
        const zhou = eliteUnits.find(u => u.isZhouZhiruo);
        const song = eliteUnits.find(u => u.isSongQingshu);
        if (zhou && zhou.pos == null) {
            const zhouPriority = [2, 3, 4, 5, 6, 7, 8, 9];
            let placed = false;
            for (const p of zhouPriority) { if (!enemyPosSet.has(p)) { zhou.pos = p; zhou.state._originalPos = p; enemyPosSet.add(p); placed = true; break; } }
            if (!placed) { let displaced = normalUnits.find(u => u.pos === 2); if (displaced) { displaced.pos = null; displaced.state._originalPos = -1; } zhou.pos = 2; zhou.state._originalPos = 2; enemyPosSet.add(2); }
        }
        if (song && song.pos == null) {
            const zhouPos = zhou ? zhou.pos : 0;
            let placed = false;
            for (let p = zhouPos + 1; p <= 9; p++) { if (!enemyPosSet.has(p)) { song.pos = p; song.state._originalPos = p; enemyPosSet.add(p); placed = true; break; } }
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