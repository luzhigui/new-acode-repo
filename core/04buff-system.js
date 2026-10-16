// V6.5.4 | ~38500 bytes | 2026-10-16 carry 雄鹰改「一次性判定」（老板拍板）：spawnCarryEagle 在 hasBuff 判过后查
//           _carryEagleDone（core/17 schema）——carry 首次生效那回合判一次 5 号位即锁死，5 号位有人则本局永不招、
//           招过之后雄鹰阵亡也不补；同批：spawnUnityRecruits 加重名保护（召唤物与场上同名单位并存时降级白板，
//           清身份旗标，配合 core/11 该召唤物跳过组件注册，防 hook/声明翻倍与精英误认人）
// V6.5.3 | ~37500 bytes | 2026-10-15 第二批内容：新增 applyLastStandBonus（背水一战·低血攻×1.4）、
//           applyUnityBonus（众志成城·按存活人数阶梯乘攻防）、spawnUnityRecruits（不足 5 人时每回合召唤随机角色补员，
//           M50 含精英技能全开、整局上限 4 个；获得时已满 5 人则永久不召）。三者调用点见 core/11。
// V6.5.2 | ~35010 bytes | 2026-10-14 carry 放开 5 号位门槛（老板拍板）：新增 spawnCarryEagle——carry 生效且
//           5 号位无活人时召唤「雄鹰」顶位（整局仅 1 只，模块标记 isCarryEagle 判定，死了不补）；数值读 content buffs.carry.params.eagle
// V6.5.1 | ~30500 bytes | 2026-10-14 妹永久摄魂改「点名 2 回合」（老板拍板削弱）：团队摄魂过期后不再是整局全体续削，
//           改由 preparePermanentSoulDrain 每回合随机点名 1 名敌方（非马/非召唤物）写 _soulDrainRounds=2，
//           稳态约 2 人同时在削（core/11 每回合先 -1 再点名）；applySoulDrain 妹版分支改认 rounds>0，姊增强只对团队版生效
// V6.5.0 | ~29800 bytes | 2026-10-14 妹永久补全 13 项全覆盖 + 新两海克斯姊增强（老板拍板）：
//           ① 妹永久补 fortify（自己防+50%且反弹）、soulDrain（团队过期后续削敌方）、holyFire（妹专属额外 1 次复活，_holyFireSelf 独立名额）；
//           ② hexEnhance 接线 soulDrain（减攻 -30%→-45%、逆风 -5%→-10%/人）与 holyFire（复活回血 40%→60%），均判施法/复活方姊存活在场
// V6.4.6 | 2026-10-14 补齐「妹妹永久」缺口：applyHolyFlameBonus 团队圣火令过期分支补
//           小昭·妹永久续上（applyHolyFlame_Brother 此前导出后全仓零调用，该机制只记账不生效）
// V6.4.5 | ~27600 bytes | 2026-10-14 圣火不熄取消「复活当回合不可行动」（老板拍板：复活即可动）——
//           reviveHolyFireUnit 删 withStun 形参与 _stunned 分支，统一 _acted=false；note 后缀同步移除
// V6.4.4 | ~27700 bytes | 2026-10-13 圣火不熄两项强化（老板拍板）：① 复活名额排除召唤物（isSummon）——
//           幼狮/雄狮/母狮阵亡不再占用唯一一次复活名额（原先只排 isHorse，名额常被 0 攻幼狮吃掉）
//           ② 「整局」时长：content 打 permanent:true，时长映射在 modules/28 createBuffObject（单点）
// V6.4.3 | ~27370 bytes | 2026-10-13 摄魂降防改乘法（老板拍板）：第 N 回合累计乘率 = 0.9×0.95^(N-1)（原线性叠加作废），
//           defRatio = (1+defBonus)×(1+perRoundBonus)^(N-1)-1，乘法累积越拖越脆但渐近封顶
// V6.4.2 | ~27000 bytes | 2026-10-13 修圣火不熄「回合开始兜底复活」吞行动权：reviveHolyFireUnit 的
//           withStun=false 分支补 else u.state._acted = false（阵亡态被回合初重置整段跳过，旧值遗留）
// ── 更早版本见 记录-更改履历.md
export const VER = 'core/04buff-system.js V6.5.4';
import {
    applyFortifyDef,
    applyCloudBodyDodge_Normal, applyCloudBodyDodge_Sister, applyCloudBodyDodge_Brother,
    applyHolyFlame_Normal, applyHolyFlame_Sister, applyHolyFlame_Brother,
    calcCarryBonus_Normal, calcCarryBonus_Sister,
    applyMindControl_Normal, applyMindControl_Sister
} from './14buff-effects.js';
import { CONFIG, getGameData, getSkillParams } from './01config-5v5-test.js';
import { hasBuff, getUnitRow, getUnitCol, getAdjacentPositions } from './03battle-utils.js';
import { emitEvent, applyStatChange, refreshMaxHp, query, getBattleRng, resolvePushOrStun, addMod, getStat, removeModsByGroup, recordHpAudit } from './13battle-shared.js';
import { findFreePos, spawnUnit } from './05battle-horse.js';
import { clearHeroFlags } from './02unit.js';
import { eventBus, EXECUTION_LAYER as L, EFFECT_TYPES, registerSettlementHook } from '../infra/50-event-bus.js';
import { FACT_TYPES, BUFF_TYPES, BUFF_SUBTYPES, UNIT_EVENT_TYPES, CAMP_TYPES, ROLE_TYPES, SIGNAL_TYPES } from '../infra/56-battle-enums.js';
const C = CONFIG;

export function applyHolyFlameBonus(unit, activeBuffs, ctx) {
    const holyFlameBuff = activeBuffs.find(b => b.key === BUFF_TYPES.HOLY_FLAME);
    if (!holyFlameBuff) {
        // 2026-10-14 补齐「妹妹永久」缺口：团队圣火令过期后，小昭·妹自己续上（无条件攻防双加成）——
        //   此前 applyHolyFlame_Brother 导出后全仓零调用，「妹妹永久继承圣火令」只记账不生效。
        //   口径与其余 9 项永久海克斯一致（core/04：流云/嗜血/热血/乘风/流星；modules/27：惑心/巨马/carry/连击）。
        if (unit.isXiaoZhaoBrother && query('xiaoPermanentActive', unit, activeBuffs, BUFF_TYPES.HOLY_FLAME)) {
            applyHolyFlame_Brother(unit, null, activeBuffs, ctx.log);
        }
        return;
    }
    if (ctx.hasSister) applyHolyFlame_Sister(unit, null, activeBuffs, ctx.log);
    else applyHolyFlame_Normal(unit, null, activeBuffs, ctx.log);
}

export function applyFortifyBonus(unit, activeBuffs) {
    // 2026-09-19 支持分阵营：六大派持有严阵以待时同样生效
    if (unit.role !== ROLE_TYPES.DEFENDER) return;
    if (activeBuffs.some(b => b.key === BUFF_TYPES.FORTIFY)) {
        applyFortifyDef(unit);
    } else if (unit.isXiaoZhaoBrother && query('xiaoPermanentActive', unit, activeBuffs, BUFF_TYPES.FORTIFY)) {
        // 2026-10-14 妹永久补 fortify：团队严阵以待过期后，妹（防战形态）自己继续吃防御+50%
        applyFortifyDef(unit);
    }
}

// 摄魂（首个削弱型海克斯）：对阵方（casterActiveBuffs 持有）使我方每存活单位攻击力 ×(1+ratio)。
//   与严阵以待同款「每回合重挂」口径——ttl:'round' 由回合开始统一清理，故整局持续、不做回合计数器。
//   调用点见 core/11：明教持有 → 施加到六大派每人；六大派持有 → 施加到明教每人。
// 2026-10-12 逆风补偿（老板拍板）：被削方每比施法方多 1 个存活单位（非马），减攻比例再 -perUnitBonus；
//   被削方人数 ≤ 施法方时保底 atkBonus。两值见 content buffs.soulDrain（当前 -0.30 / 0.05），两方人数由 core/11 回合开始快照传入。
//   另有降防（初始 defBonus + 每回合 perRoundBonus 线性叠加）见 applySoulDrain 内注释，当前回合数同样由 core/11 传入。
// 2026-10-13 ctx 收口：log / aliveCounts 两个上下文型尾参合并为单 ctx={log,casterAlive,targetAlive,round}，此后新增上下文只进 ctx 不再改签名
export function applySoulDrain(unit, casterActiveBuffs, ctx) {
    const hasTeam = hasBuff(casterActiveBuffs, BUFF_TYPES.SOUL_DRAIN);
    // 2026-10-14 妹永久摄魂改「点名 2 回合」（老板拍板削弱）：团队摄魂过期后不再整局全体续削，
    //   改由 preparePermanentSoulDrain 每回合随机点名 1 名敌方、写 unit.state._soulDrainRounds=2，
    //   此处只认 rounds>0 才削（基础值、不吃姊增强），稳态约 2 人同时在削（见 core/11 回合开始）。
    const permanentHit = !hasTeam && (unit.state?._soulDrainRounds || 0) > 0;
    if (!hasTeam && !permanentHit) return;
    const cfg = CONFIG.BUFFS.soulDrain;
    // 2026-10-14 姊增强接线：仅团队版生效（施法方小昭·姊存活在场 → 减攻 -30%→-45%、逆风每多 1 人 -5%→-10%，hexEnhance.soulDrain）
    const enhance = (hasTeam && ctx?.casterSide && ctx.casterSide.some(u => u.isXiaoZhaoSister && u.alive)) ? (getSkillParams('小昭', 'hexEnhance').soulDrain || null) : null;
    const atkBase = enhance ? enhance.atkBonus : cfg.atkBonus;
    const perUnit = enhance ? enhance.perUnitBonus : cfg.perUnitBonus;
    const extra = ctx ? Math.max(0, ctx.targetAlive - ctx.casterAlive) : 0;
    const ratio = atkBase - perUnit * extra;
    addMod(unit, 'atk', { source: '摄魂', value: ratio, ttl: 'round', op: 'mul', group: 'soulDrain' });
    // 数值声明 fact（体检对照 soulDrain group，不进画面）：ratio 与 addMod 同值（随人数下探为负，契约 allowNeg 放行）
    if (ctx?.log) ctx.log.push({ factType: FACT_TYPES.SOUL_DRAIN_APPLY, data: { unitName: unit.name, unitUid: unit.uid, camp: unit.camp, field: 'atk', op: 'mul', ratio } });
    // 2026-10-13 降防改乘法（老板拍板）：防御 ×0.9，此后每回合再 ×0.95——
    //   第 N 回合累计乘率 defRatio = (1+defBonus)×(1+perRoundBonus)^(N-1) - 1（defBonus=-0.10 → ×0.9，perRoundBonus=-0.05 → ×0.95），
    //   乘法累积越拖越脆但渐近封顶（不再像线性版第 19 回合防御归零）。
    //   词条 mul 是多条求和，故把累计乘率算好挂单条；ttl:'round' 每回合随清理重挂，恒 1 条不残留。
    const round = ctx?.round || 1;
    const defRatio = (1 + (cfg.defBonus || 0)) * Math.pow(1 + (cfg.perRoundBonus || 0), round - 1) - 1;
    addMod(unit, 'def', { source: '摄魂', value: defRatio, ttl: 'round', op: 'mul', group: 'soulDrain' });
    if (ctx?.log) ctx.log.push({ factType: FACT_TYPES.SOUL_DRAIN_APPLY, data: { unitName: unit.name, unitUid: unit.uid, camp: unit.camp, field: 'def', op: 'mul', ratio: defRatio } });
}

// 2026-10-14 妹永久摄魂「点名」调度（core/11 每回合开始调用，方向：casterSide 削 targetSide）：
//   团队摄魂在场时不启用（团队版自己全体削，4 回合）；妹在场且持永久摄魂时，随机点名 1 名敌方
//   （非巨马、非召唤物，与圣火不熄名额同口径），写 _soulDrainRounds=2 → 该单位本回合+下回合被 applySoulDrain 削。
//   每回合 core/11 先对存量 -1 再点名，故稳态约 2 人同时在削；重复点名同名即刷新为 2（可叠加续命）。
export function preparePermanentSoulDrain(casterSide, targetSide, ctx) {
    if (!casterSide || !targetSide) return;
    if (hasBuff(casterSide._activeBuffs || [], BUFF_TYPES.SOUL_DRAIN)) return;
    const hasBrother = casterSide.some(u => u.isXiaoZhaoBrother && query('xiaoPermanentActive', u, casterSide._activeBuffs || [], BUFF_TYPES.SOUL_DRAIN));
    if (!hasBrother) return;
    const pool = targetSide.filter(u => u.alive && !u.isHorse && !u.isSummon);
    if (!pool.length) return;
    const pick = pool[ctx.rng.nextInt(0, pool.length - 1)];
    pick.state._soulDrainRounds = 2;
}

// 2026-10-12 受益面放开（老板拍板「把拒马和狮子们也都改成能吃 carry」）：门控删 !unit.isHorse——
//   拒马站受益位时也吃加成；狮子本就不在排除项内（无需改）。副作用：拒马吃到攻加成后 atk>0，不再走「拒马休息」、会出手。
export function applyCarryBonus(unit, A, state, log) {
    const activeBuffs = A._activeBuffs || [];
    const hasCarryActive = hasBuff(activeBuffs, BUFF_TYPES.CARRY);
    const sister = A.some(a => a.isXiaoZhaoSister && a.alive);
    const carryPositions = sister ? [4, 5, 6] : [5];
    if (hasCarryActive && carryPositions.includes(unit.pos) && !unit.isXiaoZhaoSister && !unit.isXiaoZhaoBrother) {
        const bonus = sister ? calcCarryBonus_Sister(unit, A) : calcCarryBonus_Normal(unit, A);
        if (bonus.atkAbs) addMod(unit, 'atk', { source: 'carry', value: bonus.atkAbs, ttl: 'round', op: 'add', group: 'carry' });
        if (bonus.defAbs) addMod(unit, 'def', { source: 'carry', value: bonus.defAbs, ttl: 'round', op: 'add', group: 'carry' });
        if (bonus.hpAbs) { addMod(unit, 'maxHp', { source: 'carry', value: bonus.hpAbs, ttl: 'round', op: 'add', group: 'carry' }); refreshMaxHp(unit, null, 'carry'); }
        log.push({ factType: FACT_TYPES.CARRY_APPLY, data: { unitName: unit.name, atk: bonus.atkAbs, def: bonus.defAbs, hp: bonus.hpAbs } });
    }
}

// 2026-10-14 carry 放开 5 号位门槛（老板拍板）：5 号位无人时不再跳过 carry，改召唤「雄鹰」顶位——
//   整局仅 1 只（模块标记 isCarryEagle 判定，死了不补），随回合开始进场，故 core/11 组件工厂循环能当回合挂上雄鹰技能。
//   位置固定 5 号位（触发条件即「5 号位无活人」，故 5 号位必空）；数值/形态读 content buffs.carry.params.eagle
//   （基础值，spawnUnit 照常叠飞行职业加成）。
export function spawnCarryEagle(team, log) {
    if (!team || !team.length) return null;
    if (!hasBuff(team._activeBuffs || [], BUFF_TYPES.CARRY)) return null;
    // 2026-10-16 一次性判定（老板拍板）：carry「首次生效」那回合判一次 5 号位即锁死——
    //   那回合 5 号位有活人则本局永不招（之后空出来也不补），招过之后雄鹰阵亡也不补。
    //   锁记在 _carryEagleDone（core/17 schema，随 unit.clone 跨回合保留）；任一单位带标 = 本队已判过，直接跳过
    if (team.some(u => u.state && u.state._carryEagleDone)) return null;
    team.forEach(u => { if (u.state) u.state._carryEagleDone = true; });
    if (team.some(u => u.alive && u.pos === 5)) return null;
    if (team.some(u => u.isCarryEagle)) return null;
    const spec = C.BUFFS?.carry?.params?.eagle;
    if (!spec) return null;
    const eagle = spawnUnit(team, spec.name, spec.m, spec.role, 5, { atk: spec.atk, def: spec.def, maxHp: spec.maxHp });
    eagle.isCarryEagle = true;
    if (log) log.push({ factType: FACT_TYPES.SUMMON_UNIT, data: { summonName: eagle.name, summonUid: eagle.uid, pos: eagle.pos } });
    return eagle;
}

// 2026-10-15 背水一战（lastStand）：己方单位当前血量低于 maxHp × hpThreshold 时，攻击力 ×(1+atkBonus)。
//   与摄魂/严阵以待同款「每回合重挂」口径——ttl:'round' 每回合统一清理后再判一次，血回上去即自然失效。
export function applyLastStandBonus(unit, activeBuffs) {
    if (!hasBuff(activeBuffs, BUFF_TYPES.LAST_STAND)) return;
    const cfg = C.BUFFS.lastStand;
    if (!cfg || unit.maxHp <= 0) return;
    if (unit.hp >= unit.maxHp * (cfg.hpThreshold ?? 0.35)) return;
    addMod(unit, 'atk', { source: '背水一战', value: cfg.atkBonus, ttl: 'round', op: 'mul', group: 'lastStand' });
}

// 2026-10-15 众志成城（unity）加成：按本阵营存活人数（拒马/幼狮/雄鹰/召唤物都算人）取最高达标档，攻防同乘。
//   与摄魂同款：ttl:'round' 每回合清理重挂，故整局持续、不做回合计数器；人数每回合现算。
export function applyUnityBonus(unit, team, activeBuffs) {
    if (!hasBuff(activeBuffs, BUFF_TYPES.UNITY)) return;
    const cfg = C.BUFFS.unity;
    if (!cfg || !Array.isArray(cfg.tiers)) return;
    const aliveN = team.filter(u => u.alive).length;
    let tier = null;
    for (const t of cfg.tiers) { if (aliveN >= t.count) tier = t; }
    if (!tier) return;
    addMod(unit, 'atk', { source: '众志成城', value: tier.atkBonus, ttl: 'round', op: 'mul', group: 'unity' });
    addMod(unit, 'def', { source: '众志成城', value: tier.defBonus, ttl: 'round', op: 'mul', group: 'unity' });
}

// 2026-10-15 众志成城（unity）补员：获得时若本阵营不足 5 人，则每回合召唤随机角色补员——
//   首回合补到 5 人、此后每回合 +1（整局上限 cfg.maxRecruits）；
//   获得时已满 5 人则永久不召唤（state._unityNoRecruit 锁定），只吃加成。
//   召唤走 core/05 spawnUnit（自动 isSummon + applyHeroFlags，故精英召唤物技能全开），M 用 cfg.recruitM(50)、
//   角色取 cfg.recruitPool[camp]。已召数按 unit.isUnityRecruit 现数（阵亡者也计，跨回合随 unit 克隆保留）。
//   必须在 core/11 组件工厂循环「之前」调用，召唤物当回合才能被注册面挂上技能。
export function spawnUnityRecruits(team, state, log) {
    if (!team || !team.length || !state) return;
    if (!hasBuff(team._activeBuffs || [], BUFF_TYPES.UNITY)) return;
    const cfg = C.BUFFS.unity;
    if (!cfg) return;
    if (state._unityNoRecruit) return;
    if (!state._unityChecked) {
        state._unityChecked = true;
        if (team.filter(u => u.alive).length >= 5) { state._unityNoRecruit = true; return; }
    }
    const maxRecruits = cfg.maxRecruits ?? 4;
    const recruited = team.filter(u => u.isUnityRecruit).length;
    if (recruited >= maxRecruits) return;
    const aliveN = team.filter(u => u.alive).length;
    const toSpawn = aliveN < 5 ? Math.min(5 - aliveN, maxRecruits - recruited) : 1;
    if (toSpawn <= 0) return;
    const camp = team.find(u => u.alive)?.camp;
    const pool = (cfg.recruitPool && cfg.recruitPool[camp === CAMP_TYPES.ENEMY ? 'enemy' : 'ally']) || [];
    if (!pool.length) return;
    const rng = getBattleRng();
    for (let i = 0; i < toSpawn; i++) {
        const order = [];
        for (let p = 1; p <= 9; p++) order.push(p);
        for (let j = order.length - 1; j > 0; j--) { const k = rng.nextInt(0, j); [order[j], order[k]] = [order[k], order[j]]; }
        const landPos = findFreePos(team, order);
        if (landPos == null) break;   // 9 格全被活人占：放弃本次落位
        const pick = pool[rng.nextInt(0, pool.length - 1)];
        const recruit = spawnUnit(team, pick.name, cfg.recruitM, pick.role, landPos);
        recruit.isUnityRecruit = true;
        // 2026-10-16 重名保护（老板拍板「重名可保留、但不得引出别的 bug」）：召唤角色与场上**其他**单位同名时，
        //   该召唤物降级为白板——清掉 Unit 构造期按名字自动打上的身份旗标（isZhang/isWei/isYinTianZheng…）。
        //   不清则 modules/27 一批 `find(u => u.isZhang/isWei && u.alive)` 会误认它：原版阵亡后命中白板召唤物，
        //   精英联动/FSM 会作用在没有 _fsm 的对象上。名字本身保留（显示不变），只摘内部身份。
        //   另一半保护在 core/11 组件工厂循环：同名召唤物跳过组件注册（重复注册会让 hook/声明翻倍）。
        if (team.some(u => u !== recruit && u.name === recruit.name)) clearHeroFlags(recruit);
        if (log) log.push({ factType: FACT_TYPES.SUMMON_UNIT, data: { summonName: recruit.name, summonUid: recruit.uid, pos: landPos, byName: '众志成城' } });
    }
}

export function computeBuffStats(unit, activeBuffs, allyTeam) {
    // 词条系统下，攻防由 getStat 统一计算；此处只保留闪避率计算
    let dodgeBonus = 0;
    if (hasBuff(activeBuffs, BUFF_TYPES.CLOUD_BODY)) {
        if (allyTeam && allyTeam.some(u => u.isXiaoZhaoSister && u.alive)) dodgeBonus = applyCloudBodyDodge_Sister();
        else dodgeBonus = applyCloudBodyDodge_Normal();
    } else if (unit.isXiaoZhaoBrother && query('xiaoPermanentActive', unit, activeBuffs, BUFF_TYPES.CLOUD_BODY)) {
        dodgeBonus = applyCloudBodyDodge_Brother();
    }
    return { atkBonus: 0, defBonus: 0, dodgeBonus, hpBonus: 0, carryAtkAbs: 0, carryDefAbs: 0, carryHpAbs: 0 };
}

export function logBuffSummary(allyTeam, ctx) {
    let buffs = allyTeam._activeBuffs || [];
    buffs.forEach(b => {
        ctx.log.push({ factType: FACT_TYPES.BUFF_SUMMARY, data: { buff: b, allyTeamUids: allyTeam.filter(u => u.alive).map(u => u.uid), doubleStrikeUid: ctx.doubleStrikeUid } });
    });
}

// 嗜血狂刀：战士攻击吸血
export function submitBloodthirstDeclaration(data) {
    const { unit, target, dmg, allySide, enemySide, log } = data;
    if (!unit.alive) return;
    const unitBuffs = allySide._activeBuffs || [];
    const hasSister = allySide.some(u => u.isXiaoZhaoSister && u.alive);
    const isBrother = unit.isXiaoZhaoBrother;

    if (hasBuff(unitBuffs, BUFF_TYPES.BLOODTHIRST) && unit.role === ROLE_TYPES.WARRIOR && dmg > 0) {
        const leechVal = Math.floor(dmg * C.BUFFS.bloodthirst.leechRatio);
        const decl = { type: EFFECT_TYPES.LEECH, value: leechVal, source: unit, factType: FACT_TYPES.BLOOD_THIRST_LEECH, factData: { unitName: unit.name, leechVal, isBrother: false, unitUid: unit.uid } };
        if (!data.declarations) data.declarations = [];
        if (leechVal > 0) {
            data.declarations.push(decl);
            // 审计账本（2026-10-14 迁出 _mods）：记进 unit._audit.hp，零游戏逻辑副作用
            recordHpAudit(unit, 'bloodthirstLeech', leechVal, '嗜血狂刀');
        }
        if (hasSister && unit.alive && target.alive && !unit.state._bloodthirstStriked) {
            unit.state._bloodthirstStriked = true;
            if (!data.extraRequests) data.extraRequests = [];
            data.extraRequests.push({ unit, targetUid: target.uid, reason: 'bloodthirst', actedMode: 'allow', priority: 20 });
        }
    } else if (isBrother && query('xiaoPermanentActive', unit, unitBuffs, BUFF_TYPES.BLOODTHIRST) && unit.role === ROLE_TYPES.WARRIOR) {
        const leechVal = Math.floor(dmg * C.BUFFS.bloodthirst.leechRatio);
        if (!data.declarations) data.declarations = [];
        if (leechVal > 0) {
            data.declarations.push({ type: EFFECT_TYPES.LEECH, value: leechVal, source: unit, factType: FACT_TYPES.BLOOD_THIRST_LEECH, factData: { unitName: unit.name, leechVal, isBrother: true, unitUid: unit.uid } });
            // 审计账本（同分支 1）：记进 unit._audit.hp，零游戏逻辑副作用
            recordHpAudit(unit, 'bloodthirstLeech', leechVal, '嗜血狂刀');
        }
    }
}

export function registerBloodthirst(eventBus) {
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
        priority: L.AFTER_DAMAGE_APPLIED.BLOODTHIRST,
        handler: (data) => { submitBloodthirstDeclaration(data); }
    });
}

// 热血奋战：攻击后回复已损失生命
export function submitHotBloodDeclaration(data) {
    const { unit, dmg, allySide, enemySide, log } = data;
    if (!unit.alive || unit.hp >= unit.maxHp) return;
    const unitBuffs = allySide._activeBuffs || [];
    const hasSister = allySide.some(u => u.isXiaoZhaoSister && u.alive);
    const isBrother = unit.isXiaoZhaoBrother;
    // 热血奋战仅在持有该 buff 或小昭·妹永久海克斯激活时触发
    const active = hasBuff(unitBuffs, BUFF_TYPES.HOT_BLOOD);
    const brotherActive = isBrother && query('xiaoPermanentActive', unit, unitBuffs, BUFF_TYPES.HOT_BLOOD);
    if (!active && !brotherActive) return;
    const leechPct = hasSister ? (query('xiaoHexEnhance', allySide, unitBuffs, BUFF_TYPES.HOT_BLOOD)?.leechPct || C.BUFFS.hotBlood.leechRatio) : C.BUFFS.hotBlood.leechRatio;
    Object.assign(unit.state, { _hotBloodCount: (unit.state._hotBloodCount || 0) + 1 });
    const critInterval = hasSister ? (query('xiaoHexEnhance', allySide, unitBuffs, BUFF_TYPES.HOT_BLOOD)?.critInterval || C.HOT_BLOOD_CRIT_INTERVAL) : C.HOT_BLOOD_CRIT_INTERVAL;
    const isDouble = unit.state._hotBloodCount % critInterval === 0;
    const ratio = isDouble ? leechPct * 2 : leechPct;
    const leech = Math.min(Math.floor((unit.maxHp - unit.hp) * ratio), unit.maxHp - unit.hp);
    if (leech > 0) {
        if (!data.declarations) data.declarations = [];
        data.declarations.push({ type: EFFECT_TYPES.HEAL, value: leech, source: unit, isDouble, factType: FACT_TYPES.HOT_BLOOD_HEAL, factData: { unitName: unit.name, leech, tag: isDouble ? '❤️‍🔥 热血奋战(翻倍)' : '❤️ 热血奋战', isBrother, unitUid: unit.uid } });
        // 审计账本（2026-10-14 迁出 _mods）：记进 unit._audit.hp，零游戏逻辑副作用
        recordHpAudit(unit, 'hotBloodHeal', leech, '热血奋战');
    }
}

export function registerHotBlood(eventBus) {
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
        priority: L.AFTER_DAMAGE_APPLIED.HOT_BLOOD,
        handler: (data) => { submitHotBloodDeclaration(data); }
    });
}

// 乘风突袭：飞行单位攻击时波及同行 + 概率击退
export function submitWindAssaultDeclaration(data) {
    const { unit, target, dmg, allySide, enemySide, log } = data;
    const rng = getBattleRng();
    if (!unit.alive || !target || !target.alive) return;
    if (target.camp === unit.camp) return;
    const unitBuffs = allySide._activeBuffs || [];
    const active = hasBuff(unitBuffs, BUFF_TYPES.WIND_ASSAULT) && unit.role === ROLE_TYPES.FLYER;
    const brotherActive = unit.isXiaoZhaoBrother && unit.role === ROLE_TYPES.FLYER && query('xiaoPermanentActive', unit, unitBuffs, BUFF_TYPES.WIND_ASSAULT);
    if (!active && !brotherActive) return;
    const enhance = query('xiaoHexEnhance', allySide, unitBuffs, BUFF_TYPES.WIND_ASSAULT);
    const hitProb = enhance ? Math.floor(enhance.hitProb * 100) : Math.floor(C.BUFFS.windAssault.hitProb * 100);
    const pushProb = enhance ? Math.floor(enhance.pushProb * 100) : Math.floor(C.BUFFS.windAssault.pushProb * 100);
    const label = brotherActive ? '🦋 蝶翼' : '🦅 乘风突袭';
    if (rng.nextInt(1, 100) <= hitProb) {
        const row = getUnitRow(target.pos);
        const rowTargets = enemySide.filter(u => u.alive && getUnitRow(u.pos) === row && u.uid !== target.uid && !(u.state._flyMode === 'butterfly') && !(u.state._flyMode === 'spider') && !u.state._spiderFlying);
        if (rowTargets.length > 0) {
            const splashDmg = Math.floor(dmg);
            if (!data.declarations) data.declarations = [];
            data.declarations.push({ type: EFFECT_TYPES.SPLASH, value: splashDmg, targets: rowTargets, buffType: BUFF_SUBTYPES.WIND_ASSAULT, attackerUid: unit.uid, primaryUid: target.uid, splashUids: rowTargets.map(t => t.uid), splashDmg, factType: FACT_TYPES.WIND_ASSAULT_SPLASH, factData: { label, targets: rowTargets.map(t => ({ uid: t.uid, name: t.name })), splashDmg } });
        } else {
            log.push({ factType: FACT_TYPES.WIND_ASSAULT_FAIL, data: { label, reason: '波及无同行目标' } });
        }
    } else {
        log.push({ factType: FACT_TYPES.WIND_ASSAULT_FAIL, data: { label, reason: '波及触发失败' } });
    }
    if (rng.nextInt(1, 100) <= pushProb) {
        // 击退/眩晕统一判定：7-9 号位退无可退改为眩晕（与胖远桥·年轻气盛共用 core/13）
        // 取队口径（2026-09-25 修）：allySide/enemySide 是「攻击方视角」的别名（allySide=攻击方自己那队），
        //   而 target.camp 是全局阵营 —— 必须拿 unit.camp 作参照，不能拿 CAMP_TYPES.ALLY。
        //   原写法 `target.camp === CAMP_TYPES.ALLY ? allySide : enemySide` 在**敌方飞行单位**触发时会取到攻击方自己那队，
        //   于是把敌方单位换进我方格 / 我方单位换进敌方格（跨阵营换位），造成同阵营双人同格。
        //   同文件 submitMeteorShowerDeclaration 用的就是 `target.camp === unit.camp` 的正确写法。
        const targetTeam = target.camp === unit.camp ? allySide : enemySide;
        resolvePushOrStun(target, targetTeam, log, label);
    } else {
        log.push({ factType: FACT_TYPES.WIND_ASSAULT_FAIL, data: { label, reason: '击退触发失败' } });
    }
    eventBus.emit(SIGNAL_TYPES.ON_POSITION_SWAP, { allySide, enemySide, log });
}

export function registerWindAssault(eventBus) {
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
        priority: L.AFTER_DAMAGE_APPLIED.WIND_ASSAULT,
        handler: (data) => { submitWindAssaultDeclaration(data); }
    });
}

// 流星赶月：远程攻击加深 + 溅射 + 降防
export function submitMeteorShowerDeclaration(data) {
    const { unit, target, dmg, allySide, enemySide, log } = data;
    if (!unit.alive || !target || !target.alive) return;
    const unitBuffs = allySide._activeBuffs || [];
    const isBrother = unit.isXiaoZhaoBrother;
    const active = hasBuff(unitBuffs, BUFF_TYPES.METEOR_SHOWER) && unit.role === ROLE_TYPES.RANGED;
    const brotherActive = isBrother && unit.role === ROLE_TYPES.RANGED && query('xiaoPermanentActive', unit, unitBuffs, BUFF_TYPES.METEOR_SHOWER);
    if (!active && !brotherActive) return;
    const label = brotherActive ? '🦋 蝶星' : '☄️ 流星赶月';
    const bonusDmg = Math.floor(dmg * C.BUFFS.meteorShower.bonusRatio);
    if (!data.declarations) data.declarations = [];
    data.declarations.push({ type: EFFECT_TYPES.STAT_CHANGE, field: 'def', delta: -(C.BUFFS.meteorShower.mainDefReduce || 2), target, reason: '流星赶月', logText: null });
    data.declarations.push({ type: EFFECT_TYPES.BONUS_DMG, value: bonusDmg, target, buffType: BUFF_SUBTYPES.METEOR_BONUS, factType: FACT_TYPES.METEOR_SHOWER_MAIN, factData: { label, targetName: target.name, targetUid: target.uid, bonusDmg, defReduce: C.BUFFS.meteorShower.mainDefReduce || 2 } });
    const splashDmg = Math.floor(dmg * C.BUFFS.meteorShower.splashRatio);
    const adjPositions = getAdjacentPositions(target.pos);
    const splashSide = target.camp === unit.camp ? allySide : enemySide;
    const splashTargets = splashSide.filter(u => u.alive && adjPositions.includes(u.pos) && !(u.state._flyMode === 'butterfly') && !(u.state._flyMode === 'spider') && !u.state._spiderFlying);
    if (splashTargets.length > 0) {
        data.declarations.push({ type: EFFECT_TYPES.SPLASH, value: splashDmg, targets: splashTargets, buffType: BUFF_SUBTYPES.METEOR_SPLASH, attackerUid: unit.uid, primaryUid: target.uid, splashUids: splashTargets.map(st => st.uid), splashDmg, factType: FACT_TYPES.METEOR_SHOWER_SPLASH, factData: { label, targets: splashTargets.map(st => ({ uid: st.uid, name: st.name })), splashDmg, defReduce: C.BUFFS.meteorShower.splashDefReduce || 1 } });
        for (const st of splashTargets) {
            data.declarations.push({ type: EFFECT_TYPES.STAT_CHANGE, field: 'def', delta: -(C.BUFFS.meteorShower.splashDefReduce || 1), target: st, reason: '流星溅射', logText: null });
        }
    }
}

export function registerMeteorShower(eventBus) {
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
        priority: L.AFTER_DAMAGE_APPLIED.METEOR_SHOWER,
        handler: (data) => { submitMeteorShowerDeclaration(data); }
    });
}

// 惑人心智：最前排攻击后扰乱双方换位
export function registerMindControl(eventBus) {
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_ATTACK,
        priority: L.AFTER_ATTACK.MIND_CONTROL,
        handler: (data) => {
            const { unit, allySide, enemySide, log } = data;
            if (!unit.alive) return;
            const buffs = allySide._activeBuffs || [];
            const hasSister = allySide.some(u => u.isXiaoZhaoSister && u.alive);
            if (hasBuff(buffs, BUFF_TYPES.MIND_CONTROL)) {
                if (hasSister) applyMindControl_Sister(unit, allySide, enemySide, log);
                else applyMindControl_Normal(unit, allySide, enemySide, log);
            }
        }
    });
}

// 飞行职业基础再生：每有一个非拒马角色阵亡，全场所有存活飞行立即回复 baseRegen 生命。
// 数值唯一来源：content 的 roles.飞行.baseRegen。
// 挂 ON_UNIT_DEATH 信号（core/12 resolveDeaths 的死亡广播），由 core/11 每回合注册监听。
// V6.2.4 | 2026-10-02 补回血弹幕：按 fact 管线推 FLYER_REGEN（render/35 渲染，isHealEntry 飘 "+N"）
export function onUnitDeathFlyerRegen(data, A, B, log) {
    const dead = (data && data.deadUnits ? data.deadUnits : []).filter(u => u && !u.isHorse);
    if (dead.length === 0) return;
    const regen = getGameData().roles?.[ROLE_TYPES.FLYER]?.baseRegen;
    if (typeof regen !== 'number' || regen <= 0) return;
    const gain = regen * dead.length;
    for (const u of [...A, ...B]) {
        if (!u || !u.alive || u.isHorse || u.role !== ROLE_TYPES.FLYER) continue;
        const before = u.hp;
        applyStatChange(u, 'hp', gain, null, '飞行再生');
        if (log && u.hp > before) {
            // 2026-10-13 回血出口取整：hp 是 0.1 精度（core/13 applyStatChange 落 step 到 0.1），
            //   两个一位小数相减会出浮点尾巴（73.7-63.7 = 10.000000000000007）进日志与记账；
            //   与生生不息（26elite-sixsects-zhangsanfeng L37 Math.round）同口径，截到整数
            const healed = Math.round(Math.max(0, u.hp - before));
            log.push({ factType: FACT_TYPES.FLYER_REGEN, data: { unitName: u.name, unitUid: u.uid, heal: healed, deadCount: dead.length } });
            // 审计账本（2026-10-14 迁出 _mods）：value 与 fact heal 同一个 healed，保精确相等
            recordHpAudit(u, 'flyerRegen', healed, '飞行再生');
        }
    }
}

// 圣火不熄（海克斯·死亡交互）：每局首次己方（非巨马）单位阵亡 → 该单位原地复活。
//   时机复用「灭绝召唤周芷若」的两段式：当帧只记死位（当帧复活会顶掉死亡特效），
//   落位延到下一个行动步 BEFORE_STATE_TRANSITION；回合最后一手阵亡没有下一步，由 ON_ROUND_START 兜底。
//   与灭绝的关键区别：复活对象＝原单位本体，不调 spawnUnit 新建。
//   与 小昭·妹飞天/结茧 的分工：那套钩在 ON_BEFORE_DEATH（当场清 _pendingDeath 取消死亡，根本走不到
//   ON_UNIT_DEATH），所以「能保命就保命、保不住（真死）才轮到海克斯」——两者不会同帧抢触发。
export function submitHolyFireRecord(data) {
    const teams = [data.allySide, data.enemySide].filter(Boolean);
    const owner = teams.find(t => hasBuff(t._activeBuffs || [], BUFF_TYPES.HOLY_FIRE));
    if (owner) {
        // 每局一次：本人群中已有「待复活」或「已复活」标记即不再记（两个标记都写在阵亡者本体上，跨回合存活）
        if (!owner.some(u => u.state && (u.state._holyFire === 'pending' || u.state._holyFire === 'used'))) {
            // 2026-10-13 名额只给「真角色」：拒马(isHorse)与召唤物(幼狮/雄狮/母狮，isSummon)阵亡不占名额——
            //   否则唯一一次复活常被 0 攻幼狮这类召唤物吃掉，复活出来也是白板（老板拍板 ①）
            const victim = (data.deadUnits || []).find(u => u && owner.includes(u) && !u.isHorse && !u.isSummon);
            if (victim && victim.pos != null) victim.state._holyFire = 'pending';
        }
    }
    // 2026-10-14 妹永久补 holyFire（老板拍板「团队 1 + 她 1」）：小昭·妹自己阵亡，独立名额再复活一次——
    //   与团队名额互不占用（_holyFireSelf 单独记账，见 core/17 schema）；直查 _permanentBuffs，
    //   不走 xiaoPermanentActive（那个在团队 buff 在场时返回 false，而妹名额要与团队名额叠加生效）。
    //   本次死亡已被团队名额接管（本人 _holyFire==='pending'）时不再重复记，防同一次死亡双复活。
    for (const team of teams) {
        const bro = (data.deadUnits || []).find(u => u && team.includes(u) && u.isXiaoZhaoBrother && !u.isHorse && !u.isSummon);
        if (!bro || bro.pos == null) continue;
        if (bro.state._holyFire === 'pending') continue;
        if (bro.state._holyFireSelf === 'pending' || bro.state._holyFireSelf === 'used') continue;
        if (!(bro.state._permanentBuffs && bro.state._permanentBuffs.some(b => b.key === BUFF_TYPES.HOLY_FIRE))) continue;
        bro.state._holyFireSelf = 'pending';
    }
}

function reviveHolyFireUnit(u, team, log, slot) {
    const mark = slot === 'self' ? '_holyFireSelf' : '_holyFire';
    u.state[mark] = 'used';
    const cfg = C.BUFFS.holyFire || {};
    // 2026-10-14 姊增强接线：复活方小昭·姊存活在场 → 回血 40%→60%（hexEnhance.holyFire）
    const enhance = team.some(x => x.isXiaoZhaoSister && x.alive) ? (getSkillParams('小昭', 'hexEnhance').holyFire || null) : null;
    const ratio = enhance ? (enhance.reviveRatio != null ? enhance.reviveRatio : 0.6) : (cfg.reviveRatio != null ? cfg.reviveRatio : 0.4);
    // 落位取格：原格若被活人占（召唤物/换位挤进来）→ core/05 findFreePos 按「原格+1 环形顺延」取首个空位
    //   （findFreePos 只算 alive 占位、尸体不占格，故通常直接原地复活）
    let landPos = u.pos;
    if (team.some(o => o !== u && o.alive && o.pos === u.pos)) {
        const order = [];
        for (let i = 0; i < 9; i++) order.push(((u.pos - 1 + i) % 9) + 1);
        landPos = findFreePos(team, order);
        if (landPos == null) return;   // 9 格全被活人占：放弃本次复活，保持阵亡
    }
    // 以蜘蛛卵形态阵亡（卵被打碎＝真死）时先清掉卵的攻防修正，避免 0 攻/卵防复活
    if (u.state._spiderEgg) removeModsByGroup(u, 'spiderEgg');
    u.pos = landPos;
    u.alive = true;
    Object.assign(u.state, { _isDead: false, _pendingDeath: false, _deathTime: 0 });
    // 回血出口与生生不息等同口径（目标血值取整；core/13 applyStatChange 自行落 0.1 精度）；复活不回写治疗统计
    applyStatChange(u, 'hp', Math.round(u.maxHp * ratio), null, '圣火不熄', false, false);
    // 2026-10-14 老板拍板：复活即可动——删「当回合眩晕」（原 withStun 置 _stunned 挡本回合剩余行动）。
    //   _acted 统一清 false：回合中复活（BEFORE_STATE_TRANSITION）本轮没动过就正常补上这一手，
    //   动过则多给一手（每局仅 1 次，代价可控）；回合开始兜底同口径（第 86 轮吞行动权修复的自然延续——
    //   当时只给兜底路径清 _acted，现两条路径行为一致，withStun 形参一并删除）。
    u.state._acted = false;
    emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: true, atk: getStat(u, 'atk'), def: getStat(u, 'def'), _stunned: false });
    if (log) {
        log.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: {
            unitName: u.name, unitUid: u.uid, camp: u.camp, skillName: '圣火不熄',
            note: `🕯️ 圣火不熄！${u.name} 原地复活，回复 ${Math.round(ratio * 100)}% 生命`,
            floatText: '🕯️', floatUid: u.uid
        } });
    }
}

// 下一个行动步落位（复活即可动，见 reviveHolyFireUnit 2026-10-14 注）
export function flushHolyFire(data) {
    for (const team of [data.A, data.B]) {
        if (!team) continue;
        const victim = team.find(u => u.state && u.state._holyFire === 'pending');
        if (victim) reviveHolyFireUnit(victim, team, data.log);
        const bro = team.find(u => u.state && u.state._holyFireSelf === 'pending');
        if (bro) reviveHolyFireUnit(bro, team, data.log, 'self');
    }
}

// 回合开始兜底（阵亡发生在回合最后一手 → 无「下一行动步」）
export function flushHolyFireRoundStart(data) {
    for (const team of [data.A, data.B]) {
        if (!team) continue;
        const victim = team.find(u => u.state && u.state._holyFire === 'pending');
        if (victim) reviveHolyFireUnit(victim, team, data.log);
        const bro = team.find(u => u.state && u.state._holyFireSelf === 'pending');
        if (bro) reviveHolyFireUnit(bro, team, data.log, 'self');
    }
}

export function registerHolyFire() {
    registerSettlementHook({ when: SIGNAL_TYPES.ON_UNIT_DEATH, priority: L.ON_UNIT_DEATH.HOLY_FIRE, handler: submitHolyFireRecord });
    registerSettlementHook({ when: SIGNAL_TYPES.BEFORE_STATE_TRANSITION, priority: L.BEFORE_STATE_TRANSITION.HOLY_FIRE, handler: flushHolyFire });
    registerSettlementHook({ when: SIGNAL_TYPES.ON_ROUND_START, priority: L.ROUND_START.HOLY_FIRE, handler: flushHolyFireRoundStart });
}

// Buff 声明化装配器
export function installBuffMechanics(eventBus) {
    const gd = getGameData();
    if (!gd || !gd.buffs) return;
    const processors = {
        bloodthirstLeech: registerBloodthirst,
        hotBloodHeal: registerHotBlood,
        windAssaultSplash: registerWindAssault,
        meteorShowerMain: registerMeteorShower,
        mindControlSwap: registerMindControl,
        holyFireRevive: registerHolyFire
    };
    for (const buff of Object.values(gd.buffs)) {
        if (!buff.effects || !Array.isArray(buff.effects)) continue;
        for (const effectName of buff.effects) {
            const install = processors[effectName];
            if (install) install(eventBus);
        }
    }
}