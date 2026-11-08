// core/204-buff-system.js — 海克斯机制集中营（圣火令/严阵/摄魂/carry/背水/众志/嗜血/热血/乘风/流星/惑心/圣火不熄）
// V6.8.4 | 2026-11-08 背水一战声明载荷补齐：def 乘率 + 战士 atk/def/maxHp 三条 add（体检总框架 D1/D4）
// V6.8.3 | 2026-11-08 飞行再生去掉 Math.round：0.4 的真实回复被取整成 0 会打出「回复 0 点生命」，
//         改实数差值，显示在 render/410 经 fmtNum 收口
// V6.8.6 | 2026-11-08 体检转交：劈空/流星溅射在主伤为 0 时跳过声明（0 伤害也会触发挨打增益与成长）。
// V6.8.7 | 2026-11-08 体检转交：HEAL fact 补 maxHp / stacks（回血量可按百分比校验，不再靠最近 ATTACK 快照反推）。
// V6.8.8 | 2026-11-08 体检转交：圣火不熄复活带账——复活记录（uid/实际回复量/原始量/maxHp/档位/比例/名额）写进
//         | 阵亡者 state._holyFireRevives，随每回合 BUFF_SUMMARY 下发，复活公告同时带 healAmount 等结构化字段。
export const VER = 'core/204-buff-system.js V6.8.8';
// V6.8.5（2026-11-08）：carry 目标位改读 002 sister.carry.targetPositions（原硬编码 [4,5,6]）；缺子键显式报错。
import {
    applyFortifyDef,
    applyCloudBodyDodge_Normal, applyCloudBodyDodge_Sister, applyCloudBodyDodge_Brother,
    applyHolyFlame_Normal, applyHolyFlame_Sister, applyHolyFlame_Brother,
    calcCarryBonus_Normal, calcCarryBonus_Sister,
    applyMindControl_Normal, applyMindControl_Sister
} from './215-buff-effects.js';
import { CONFIG, getGameData, getSkillParams, getBrotherHexEnhance } from './201-config-5v5-test.js';
import { getRoleBonus } from './202-unit.js';
import { hasBuff, getUnitRow, getUnitCol, getAdjacentPositions } from './203-battle-utils.js';
import { emitEvent, applyStatChange, refreshMaxHp, query, getBattleRng, resolvePushOrStun, addMod, getStat, removeModsByGroup, recordHpAudit, previewHeal } from './214-battle-shared.js';
import { findFreePos, spawnUnit } from './205-battle-horse.js';
import { eventBus, EXECUTION_LAYER as L, EFFECT_TYPES, registerSettlementHook } from '../infra/101-event-bus.js';
import { FACT_TYPES, BUFF_TYPES, BUFF_SUBTYPES, UNIT_EVENT_TYPES, CAMP_TYPES, ROLE_TYPES, SIGNAL_TYPES, STATE_CHANGE_TYPES } from '../infra/106-battle-enums.js';
import { FX_SIGNALS } from '../infra/105-fx-signals.js';
import { fmtNum } from '../infra/102-core-utils.js';
const C = CONFIG;

export function applyHolyFlameBonus(unit, activeBuffs, ctx) {
    const holyFlameBuff = activeBuffs.find(b => b.key === BUFF_TYPES.HOLY_FLAME);
    if (!holyFlameBuff) {
        // 团队圣火令过期后，小昭·妹自己续上（永久海克斯）。别删此分支：
        //   applyHolyFlame_Brother 曾导出后全仓零调用，导致「妹妹永久继承」只记账不生效。
        if (unit.isXiaoZhaoBrother && query('xiaoPermanentActive', unit, activeBuffs, BUFF_TYPES.HOLY_FLAME)) {
            applyHolyFlame_Brother(unit, null, activeBuffs, ctx.log);
        }
        return;
    }
    if (ctx.hasSister) applyHolyFlame_Sister(unit, null, activeBuffs, ctx.log);
    else applyHolyFlame_Normal(unit, null, activeBuffs, ctx.log);
}

// 妹妹永久：全队同职业共享（导出：core/212 严阵反弹要与 applyFortifyBonus 同判据，否则「全队加防、只有妹反弹」）
export function hasBrotherPermanent(team, buffKey) {
    if (!Array.isArray(team)) return false;
    return team.some(u => u.isXiaoZhaoBrother && u.alive && u.state?._permanentBuffs?.some(b => b.key === buffKey));
}

export function applyFortifyBonus(unit, activeBuffs, team) {
    // 支持分阵营：六大派持有严阵以待时同样生效
    if (unit.role !== ROLE_TYPES.DEFENDER) return;
    if (activeBuffs.some(b => b.key === BUFF_TYPES.FORTIFY)) {
        applyFortifyDef(unit);
    } else if (hasBrotherPermanent(team, BUFF_TYPES.FORTIFY)) {
        // 妹永久补 fortify：团队严阵以待过期后，防战队友共享
        applyFortifyDef(unit);
    }
}

// 摄魂（首个削弱型海克斯）：对阵方（casterActiveBuffs 持有）使我方每存活单位攻击力 ×(1+ratio)。
//   与严阵以待同款「每回合重挂」口径——ttl:'round' 由回合开始统一清理，故整局持续、不做回合计数器。
//   调用点见 core/11：明教持有 → 施加到六大派每人；六大派持有 → 施加到明教每人。
//   逆风补偿：被削方每比施法方多 1 个存活单位（非马），减攻比例再 -perUnitBonus；被削方人数 ≤ 施法方时保底 atkBonus。
//   两值见 content buffs.soulDrain，两方人数由 core/11 回合开始快照传入；降防见函数内注释，回合数由 core/11 传入。
//   ctx 收口：log / aliveCounts 等上下文型尾参合并为单 ctx={log,casterAlive,targetAlive,round}，新增上下文只进 ctx 不再改签名
export function applySoulDrain(unit, casterActiveBuffs, ctx) {
    const hasTeam = hasBuff(casterActiveBuffs, BUFF_TYPES.SOUL_DRAIN);
    // 妹永久摄魂：团队摄魂过期后由 preparePermanentSoulDrain 每回合随机点名
    //   1 名敌方（写 _soulDrainRounds=2），此处只认 rounds>0 才削（基础值、不吃姊增强），稳态约 2 人同时在削。
    const permanentHit = !hasTeam && (unit.state?._soulDrainRounds || 0) > 0;
    if (!hasTeam && !permanentHit) return;
    const cfg = CONFIG.BUFFS.soulDrain;
    // 姊增强接线：仅团队版生效（施法方小昭·姊存活在场 → 减攻 -30%→-45%、逆风每多 1 人 -5%→-10%，hexEnhance.soulDrain）
    const enhance = (hasTeam && ctx?.casterSide && ctx.casterSide.some(u => u.isXiaoZhaoSister && u.alive)) ? (getSkillParams('小昭', 'hexEnhance').soulDrain || null) : null;
    const atkBase = enhance ? enhance.atkBonus : cfg.atkBonus;
    const perUnit = enhance ? enhance.perUnitBonus : cfg.perUnitBonus;
    const extra = ctx ? Math.max(0, ctx.targetAlive - ctx.casterAlive) : 0;
    const ratio = atkBase - perUnit * extra;
    addMod(unit, 'atk', { source: '摄魂', value: ratio, ttl: 'round', op: 'mul', group: 'soulDrain' });
    // 数值声明 fact（体检对照 soulDrain group，不进画面）：ratio 与 addMod 同值（随人数下探为负，契约 allowNeg 放行）
    if (ctx?.log) ctx.log.push({ factType: FACT_TYPES.SOUL_DRAIN_APPLY, data: { unitName: unit.name, unitUid: unit.uid, camp: unit.camp, field: 'atk', op: 'mul', ratio } });
    // 降防走乘法：defRatio = (1+defBonus)×(1+perRoundBonus)^(N-1) - 1，渐近封顶（线性版会在第 19 回合归零）。
    //   词条 mul 是多条求和，故先把累计乘率算好挂单条；ttl:'round' 每回合重挂，恒 1 条不残留。
    const round = ctx?.round || 1;
    const defRatio = (1 + (cfg.defBonus || 0)) * Math.pow(1 + (cfg.perRoundBonus || 0), round - 1) - 1;
    addMod(unit, 'def', { source: '摄魂', value: defRatio, ttl: 'round', op: 'mul', group: 'soulDrain' });
    if (ctx?.log) ctx.log.push({ factType: FACT_TYPES.SOUL_DRAIN_APPLY, data: { unitName: unit.name, unitUid: unit.uid, camp: unit.camp, field: 'def', op: 'mul', ratio: defRatio } });
}

// 妹永久摄魂：团队版在场时不启用（团队版全体削）；妹持永久摄魂时每回合按 pointChance 概率随机点名 1 名敌方
//   （非巨马、非召唤物），写 _soulDrainRounds=pointRounds。core/11 先对存量 -1 再点名，稳态约 2 人同削。
export function preparePermanentSoulDrain(casterSide, targetSide, ctx) {
    if (!casterSide || !targetSide) return;
    if (hasBuff(casterSide._activeBuffs || [], BUFF_TYPES.SOUL_DRAIN)) return;
    const hasBrother = casterSide.some(u => u.isXiaoZhaoBrother && query('xiaoPermanentActive', u, casterSide._activeBuffs || [], BUFF_TYPES.SOUL_DRAIN));
    if (!hasBrother) return;
    // 妹永久摄魂点名概率 / 持续回合：唯一真源 201 brother.soulDrain（缺则炸）
    const enh = getBrotherHexEnhance('soulDrain');
    if (!enh || enh.pointChance == null || enh.pointRounds == null) {
        throw new Error('002-hex-enhance.json 缺 brother.soulDrain.pointChance/pointRounds');
    }
    if (ctx.rng.next() >= enh.pointChance) return;
    const pool = targetSide.filter(u => u.alive && !u.isHorse && !u.isSummon);
    if (!pool.length) return;
    const pick = pool[ctx.rng.nextInt(0, pool.length - 1)];
    pick.state._soulDrainRounds = enh.pointRounds;
}

// 受益面含拒马与狮子：门控不放 isHorse——拒马站受益位也吃加成。副作用：拒马吃到攻加成后 atk>0，
//   不再走「拒马休息」、会出手。
export function applyCarryBonus(unit, A, state, log) {
    const activeBuffs = A._activeBuffs || [];
    const hasCarryActive = hasBuff(activeBuffs, BUFF_TYPES.CARRY);
    const sister = A.some(a => a.isXiaoZhaoSister && a.alive);
    // 姊版多目标位读 002 sister.carry.targetPositions（此前硬编码 [4,5,6]，改配置不生效）
    let carryPositions = [5];
    if (sister) {
        const carryCfg = getSkillParams('小昭', 'hexEnhance').carry;
        if (!carryCfg || !Array.isArray(carryCfg.targetPositions)) {
            throw new Error('002-hex-enhance.json 缺 sister.carry.targetPositions');
        }
        carryPositions = carryCfg.targetPositions;
    }
    if (hasCarryActive && carryPositions.includes(unit.pos) && !unit.isXiaoZhaoSister && !unit.isXiaoZhaoBrother) {
        const bonus = sister ? calcCarryBonus_Sister(unit, A) : calcCarryBonus_Normal(unit, A);
        if (bonus.atkAbs) addMod(unit, 'atk', { source: 'carry', value: bonus.atkAbs, ttl: 'round', op: 'add', group: 'carry' });
        if (bonus.defAbs) addMod(unit, 'def', { source: 'carry', value: bonus.defAbs, ttl: 'round', op: 'add', group: 'carry' });
        if (bonus.hpAbs) { addMod(unit, 'maxHp', { source: 'carry', value: bonus.hpAbs, ttl: 'round', op: 'add', group: 'carry' }); refreshMaxHp(unit, null, 'carry'); }
        // unitUid（第 185 轮补）：单靠显示名无法区分同名单位（如两侧各 1 只「雄鹰」），
        //   体检 148 的同回合重复判据与 render/419 的属性动画都按 uid 归因（419 早已读 data.unitUid ?? data.unit?.uid）。
        log.push({ factType: FACT_TYPES.CARRY_APPLY, data: { unitName: unit.name, unitUid: unit.uid, atk: bonus.atkAbs, def: bonus.defAbs, hp: bonus.hpAbs } });
    }
}

// carry 放开 5 号位门槛：5 号位无人时改召唤「雄鹰」顶位——整局仅 1 只（死了不补），
//   随回合开始进场，故 core/11 组件工厂循环能当回合挂上雄鹰技能；数值读 content buffs.carry.params.eagle。
export function spawnCarryEagle(team, log) {
    if (!team || !team.length) return null;
    // carry 全场只能选一次后，雄鹰重召规则：carry 有效期内（buff 还在 remaining>0）每回合都检查，
    //   5 号位空且场上无雄鹰 → 补一只。雄鹰死了后下一回合能再召，直到 carry 过期。
    const buff = (team._activeBuffs || []).find(b => b.key === BUFF_TYPES.CARRY);
    if (!buff) return null;
    if (team.some(u => u.alive && u.pos === 5)) return null;
    if (team.some(u => u.isCarryEagle)) return null;
    const spec = C.BUFFS?.carry?.params?.eagle;
    if (!spec) return null;
    const eagle = spawnUnit(team, spec.name, spec.m, spec.role, 5, { atk: spec.atk, def: spec.def, maxHp: spec.maxHp });
    eagle.isCarryEagle = true;
    if (log) log.push({ factType: FACT_TYPES.SUMMON_UNIT, data: { summonName: eagle.name, summonUid: eagle.uid, pos: eagle.pos } });
    return eagle;
}

// 背水一战（lastStand）：己方单位当前血量低于 maxHp × hpThreshold 时，攻击力 ×(1+atkBonus)。
//   与摄魂/严阵以待同款「每回合重挂」口径——ttl:'round' 每回合统一清理后再判一次，血回上去即自然失效。
//   buff 整局持有（content permanent:true → player/49 给 remaining=Infinity）。
//   姊强化接线：小昭·姊在场且有团队背水 → 阈值 35%→50%（hexEnhance.lastStand.hpThreshold）。
//   妹永久接线：团队背水不在场时，只要**任一队友**血量低于阈值，妹（isXiaoZhaoBrother）也吃背水加成。
//   数值声明 fact（LAST_STAND_APPLY）：op:mul 乘法词条共享乘区、无独立增量，发乘率 ratio 供体检核对。
export function applyLastStandBonus(unit, team, activeBuffs, log) {
    const cfg = C.BUFFS.lastStand;
    if (!cfg || unit.maxHp <= 0) return;

    // 已经触发过，首次挂载的永久词条不会被清理，直接返回，严禁每回合重复 addMod 叠加
    if (unit.state._lastStandTriggered) {
        return;
    }

    const teamHas = hasBuff(activeBuffs, BUFF_TYPES.LAST_STAND);
    const permOwned = !!(unit.isXiaoZhaoBrother && Array.isArray(unit.state?._permanentBuffs)
        && unit.state._permanentBuffs.some(b => b.key === BUFF_TYPES.LAST_STAND));
    if (!teamHas && !permOwned) return;
    
    const enh = (teamHas && Array.isArray(team) && team.some(u => u.isXiaoZhaoSister && u.alive))
        ? (getSkillParams('小昭', 'hexEnhance').lastStand || null) : null;
    const teamThreshold = (enh && enh.hpThreshold != null) ? enh.hpThreshold : (cfg.hpThreshold ?? 0.35);
    // 妹永久背水触发阈值：只在 permOwned 为真时才读 201——
    //   团队版场景（teamHas=true, permOwned=false）的普通单位不碰 201，避免 worker 无 201 环境误炸
    let permThreshold = null;
    if (permOwned) {
        const brotherLsEnh = getBrotherHexEnhance('lastStand');
        if (!brotherLsEnh || brotherLsEnh.hpThreshold == null) {
            throw new Error('002-hex-enhance.json 缺 brother.lastStand.hpThreshold');
        }
        permThreshold = brotherLsEnh.hpThreshold;
    }
    const teamLow = teamHas && unit.hp < unit.maxHp * teamThreshold;
    const permLow = permOwned && Array.isArray(team) && team.some(u => u.alive && u.hp < u.maxHp * permThreshold);
    
    if (!teamLow && !permLow) return;

    // 团队版不在场（纯妹永久场景）交给 modules/31 专属组件处理，避免双触发。
    //   团队版在场时走本函数老逻辑（团队版覆盖所有人，含妹）。
    if (!teamHas && permOwned) return;
    
    // 首次触发！
    unit.state._lastStandTriggered = true;
    // 挂上易伤标记：承受伤害增加系数（默认 1.2 即多受 20% 伤害）
    unit.state._lastStandTakenMul = cfg.takenDmgMul ?? 1.2;
    
    // 判定最终攻击加成（姐姐强化版若给定了专属数值则用姐姐的，否则走基础配置）
    const finalAtkBonus = (teamLow && enh && enh.atkBonus != null) ? enh.atkBonus : cfg.atkBonus;
    addMod(unit, 'atk', { source: '背水一战', value: finalAtkBonus, ttl: 'permanent', op: 'mul', group: 'lastStand' });
    
    // 背水一战：防御力永久降低（用 mul 负词条，吃基础防御乘区）
    const finalDefPenalty = cfg.defPenalty ?? 0.2;
    if (finalDefPenalty > 0) {
        addMod(unit, 'def', { source: '背水一战', value: -finalDefPenalty, ttl: 'permanent', op: 'mul', group: 'lastStand' });
    }
    
    // 触发者获得一次战士加成
    const warriorBonus = getRoleBonus(ROLE_TYPES.WARRIOR);
    addMod(unit, 'atk', { source: '背水一战·战士', value: warriorBonus.atk, ttl: 'permanent', group: 'lastStandWarrior', op: 'add' });
    addMod(unit, 'def', { source: '背水一战·战士', value: warriorBonus.def, ttl: 'permanent', group: 'lastStandWarrior', op: 'add' });
    addMod(unit, 'maxHp', { source: '背水一战·战士', value: warriorBonus.maxHp, ttl: 'permanent', group: 'lastStandWarrior', op: 'add' });
    refreshMaxHp(unit, null, '背水一战·战士');

    if (teamLow && enh && enh.leechRatio) {
        unit.state._lastStandLeechRatio = enh.leechRatio;
    } else {
        unit.state._lastStandLeechRatio = 0;
    }

    if (log) {
        log.push({ factType: FACT_TYPES.LAST_STAND_APPLY, data: { unitName: unit.name, unitUid: unit.uid, camp: unit.camp, field: 'atk', op: 'mul', ratio: finalAtkBonus } });
        // 载荷补齐（体检总框架 D1/D4）：def 乘率与战士三条 add 词条此前只有 addMod、无声明 fact，
        //   账本侧看不到「声明」只能看落地值。def 用 LAST_STAND_APPLY（负乘率，契约侧只认正值则自动跳过），
        //   战士三条用通用 STAT_CHANGE_APPLY（field/delta 与 addMod 入参同值）。
        if (finalDefPenalty > 0) {
            log.push({ factType: FACT_TYPES.LAST_STAND_APPLY, data: { unitName: unit.name, unitUid: unit.uid, camp: unit.camp, field: 'def', op: 'mul', ratio: -finalDefPenalty, group: 'lastStand' } });
        }
        log.push({ factType: FACT_TYPES.STAT_CHANGE_APPLY, data: { unitName: unit.name, unitUid: unit.uid, camp: unit.camp, field: 'atk', delta: warriorBonus.atk, group: 'lastStandWarrior' } });
        log.push({ factType: FACT_TYPES.STAT_CHANGE_APPLY, data: { unitName: unit.name, unitUid: unit.uid, camp: unit.camp, field: 'def', delta: warriorBonus.def, group: 'lastStandWarrior' } });
        log.push({ factType: FACT_TYPES.STAT_CHANGE_APPLY, data: { unitName: unit.name, unitUid: unit.uid, camp: unit.camp, field: 'maxHp', delta: warriorBonus.maxHp, group: 'lastStandWarrior' } });
        log.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: { unitName: unit.name, unitUid: unit.uid, camp: unit.camp, skillName: '背水一战', note: `🩸 背水一战：${unit.name} 永久获得攻击+${Math.round(finalAtkBonus * 100)}%，并获得一次战士加成；自身受到伤害增加${Math.round((unit.state._lastStandTakenMul - 1) * 100)}%`, line: false, floatText: '🩸背水一战！', floatUid: unit.uid } });
    }
}

// 众志成城（unity）加成：按本阵营存活人数（拒马/幼狮/雄鹰/召唤物都算人）取最高达标档，攻防同乘。
//   与摄魂同款：ttl:'round' 每回合清理重挂，故整局持续、不做回合计数器；人数每回合现算。
//   数值声明 fact（UNITY_APPLY）：op:mul 乘法词条，攻/防各发一条乘率 ratio 供体检按乘率口径核对。
export function applyUnityBonus(unit, team, activeBuffs, log) {
    if (!hasBuff(activeBuffs, BUFF_TYPES.UNITY)) return;
    const cfg = C.BUFFS.unity;
    if (!cfg || !Array.isArray(cfg.tiers)) return;
    const aliveN = team.filter(u => u.alive).length;
    let tier = null;
    for (const t of cfg.tiers) { if (aliveN >= t.count) tier = t; }
    if (!tier) return;
    addMod(unit, 'atk', { source: '众志成城', value: tier.atkBonus, ttl: 'round', op: 'mul', group: 'unity' });
    addMod(unit, 'def', { source: '众志成城', value: tier.defBonus, ttl: 'round', op: 'mul', group: 'unity' });
    if (log) {
        log.push({ factType: FACT_TYPES.UNITY_APPLY, data: { unitName: unit.name, unitUid: unit.uid, camp: unit.camp, field: 'atk', op: 'mul', ratio: tier.atkBonus } });
        log.push({ factType: FACT_TYPES.UNITY_APPLY, data: { unitName: unit.name, unitUid: unit.uid, camp: unit.camp, field: 'def', op: 'mul', ratio: tier.defBonus } });
        // announce 载荷（体检总框架 D1/D4）：与 lastStand/twDash 同口径，一半数值走 grants，
        //   规则侧不必再从两条 *_APPLY 里拼「本次众志成城到底加了多少」。
        log.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: {
            unitName: unit.name, unitUid: unit.uid, camp: unit.camp, skillName: '众志成城', label: 'unity',
            note: `🤝 众志成城：${unit.name} 攻 +${Math.round(tier.atkBonus * 100)}%、防 +${Math.round(tier.defBonus * 100)}%（${aliveN} 人）`,
            line: false, grants: [{ uid: unit.uid, mulAtk: tier.atkBonus, mulDef: tier.defBonus }]
        } });
    }

    // 9人满员彩蛋：当队伍达到 9 人时，借用战斗横幅触发一次专属提示（整个阵营只弹一次）
    if (aliveN >= 9 && unit.camp === CAMP_TYPES.ALLY && unit.pos === 5 && log) {
        // 只在 5 号位（核心位）计算时触发一次，防刷屏
        const hasBanner = log.some(l => l.data && l.data.text && l.data.text.includes('九人满员'));
        if (!hasBanner) {
            // 直接走战斗横幅通道（39 层会消费并阻塞播放）
            log.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: {
                unitName: unit.name, unitUid: unit.uid, camp: unit.camp, skillName: '众志成城',
                note: `🤝 众志成城 · 九人满员！全队攻防达到巅峰！`,
                line: false, bannerText: '🤝 众志成城 · 九人满员！'
            } });
        }
    }
}

// 众志成城补员：首回合场上有几人补到 4（姐姐强化补到 5；已达目标人数则不补），之后每回合 +1，
//   直到 buff 到期（唯一上限是 9 格站位）。目标人数读 content unity.recruitTarget / hexEnhance.unity.recruitTarget。
//   首回合标记挂 buff 对象（跨回合同一对象，且只出现在持有它的阵营列表里，天然按阵营隔离）。
//   召唤细节（精英技能全开 + 属性下限钳制）收在 spawnOneUnityRecruit，团队补员与妹永久召唤共用。
//   必须在 core/11 组件工厂循环「之前」调用，召唤物当回合才能被注册面挂上技能。
export function spawnUnityRecruits(team, log) {
    if (!team || !team.length) return;
    const buff = (team._activeBuffs || []).find(b => b.key === BUFF_TYPES.UNITY);
    if (!buff) return;
    const cfg = C.BUFFS.unity;
    if (!cfg) return;
    // 姊强化接线：小昭·姊在场且有团队众志 → 补员 M 值 / 首回合目标人数取 hexEnhance.unity
    const enh = query('xiaoHexEnhance', team, team._activeBuffs || [], BUFF_TYPES.UNITY);
    const m = (enh && enh.recruitM != null) ? enh.recruitM : cfg.recruitM;
    const target = (enh && enh.recruitTarget != null) ? enh.recruitTarget : (cfg.recruitTarget ?? 4);
    const aliveN = team.filter(u => u.alive).length;
    let toSpawn;
    if (!buff._spawnStarted) {
        buff._spawnStarted = true;
        if (aliveN >= target) return;          // 到手已达标：首回合不召，从第二回合起才 +1
        toSpawn = target - aliveN;             // 首回合补差额（普通版一次补到 4）
    } else {
        toSpawn = 1;                           // 第二回合起每回合 +1
    }
    if (toSpawn <= 0) return;
    for (let i = 0; i < toSpawn; i++) {
        if (!spawnOneUnityRecruit(team, log, m, '众志成城')) break;   // 9 格全被活人占：放弃本次落位
    }
}

// 众志成城·单次补员（团队补员与妹永久召唤共用）：随机空位 + 池内随机 + 精英技能全开 + 属性下限钳制。
//   召唤走 core/05 spawnUnit（自动 isSummon + applyHeroFlags → 精英技能全开）；属性下限：防 <5 补到 5、
//   生命上限 <25 补到 25。攻击力不钳制（老板定案 2026-11-08）：吃职业加成后为负就照实数存 atk/_baseAtk/_initAtk，
//   只在显示层把 <0 显示成 0；≤0 攻仍走 core/11 pass 不攻击。口径同 spawnHorse/spawnUnit(stats)：
//   建人阶段直接写基础值并同步 state._base* / _init*（getStat 只认 _base*，不回写则加成后仍读旧值）+ 满血 hp。
//   重名保护取消（定案「完全真技能」）：补员精英不降级白板，组件多实例化由 core/11 传 self 支撑。
export function spawnOneUnityRecruit(team, log, m, byName) {
    if (!team || !team.length) return null;
    const cfg = C.BUFFS.unity;
    if (!cfg) return null;
    const camp = team.find(u => u.alive)?.camp;
    const pool = (cfg.recruitPool && cfg.recruitPool[camp === CAMP_TYPES.ENEMY ? 'enemy' : 'ally']) || [];
    if (!pool.length) return null;
    const rng = getBattleRng();
    const order = [];
    for (let p = 1; p <= 9; p++) order.push(p);
    for (let j = order.length - 1; j > 0; j--) { const k = rng.nextInt(0, j); [order[j], order[k]] = [order[k], order[j]]; }
    const landPos = findFreePos(team, order);
    if (landPos == null) return null;   // 9 格全被活人占：放弃本次落位
    const pick = pool[rng.nextInt(0, pool.length - 1)];
    const recruit = spawnUnit(team, pick.name, m, pick.role, landPos);
    if (recruit.def < 5) { recruit.def = 5; recruit.state._baseDef = 5; recruit.state._initDef = 5; }
    if (recruit.maxHp < 25) {
        recruit.maxHp = 25;
        recruit.hp = 25;
        recruit.state._baseMaxHp = 25;
        recruit.state._initMaxHp = 25;
    }
    recruit.isUnityRecruit = true;
    if (log) log.push({ factType: FACT_TYPES.SUMMON_UNIT, data: { summonName: recruit.name, summonUid: recruit.uid, pos: landPos, byName: byName || '众志成城' } });
    return recruit;
}

// 妹永久众志：团队众志不在场时，早于组件工厂循环补召 1 人（技能全开）。
//   原逻辑挂在 323 的 ON_ROUND_START（prepareSoulDrain 阶段），晚于 installRoundMechanics 的工厂循环，
//   召出来的单位当回合是白板、下回合才挂上组件。挪到 prepareRoundSpawns 阶段（与团队版 spawnUnityRecruits 同时机）。
export function spawnBrotherPermanentUnityRecruit(team, log) {
    if (!team || !team.length) return;
    if (hasBuff(team._activeBuffs || [], BUFF_TYPES.UNITY)) return;   // 团队版在场：走 spawnUnityRecruits
    const bro = team.find(u => u.isXiaoZhaoBrother && u.alive);
    if (!bro) return;
    if (!bro.state._permanentBuffs?.some(b => b.key === BUFF_TYPES.UNITY)) return;
    const unEnh = getBrotherHexEnhance('unity');
    if (!unEnh || unEnh.summonChance == null) throw new Error('002-hex-enhance.json 缺 brother.unity.summonChance');
    if (unEnh.recruitM == null || unEnh.recruitM <= 0) throw new Error('002-hex-enhance.json 缺 brother.unity.recruitM');
    if (getBattleRng().next() < unEnh.summonChance) {
        spawnOneUnityRecruit(team, log, unEnh.recruitM, '小昭·妹');
    }
}

export function computeBuffStats(unit, activeBuffs, allyTeam) {
    // 词条系统下，攻防由 getStat 统一计算；此处只保留闪避率计算
    let dodgeBonus = 0;
    if (hasBuff(activeBuffs, BUFF_TYPES.CLOUD_BODY) && !unit.state._cloudBodySkip) {
        if (allyTeam && allyTeam.some(u => u.isXiaoZhaoSister && u.alive)) dodgeBonus = applyCloudBodyDodge_Sister();
        else dodgeBonus = applyCloudBodyDodge_Normal();
    } else if (unit.isXiaoZhaoBrother && query('xiaoPermanentActive', unit, activeBuffs, BUFF_TYPES.CLOUD_BODY)) {
        dodgeBonus = applyCloudBodyDodge_Brother();
    }
    return { atkBonus: 0, defBonus: 0, dodgeBonus, hpBonus: 0, carryAtkAbs: 0, carryDefAbs: 0, carryHpAbs: 0 };
}

export function logBuffSummary(allyTeam, ctx) {
    const buffs = allyTeam._activeBuffs || [];
    const aliveUids = allyTeam.filter(u => u.alive).map(u => u.uid);
    // 圣火不熄复活账（体检转交）：此前摘要只有「每局首次阵亡单位原地复活」一句文案，293 条无法按 uid 归账。
    //   复活发生在摘要之后（回合中/回合开始兜底），记录写在阵亡者本人 state（跨回合存活），这里随摘要下发。
    const holyFireRevives = [];
    for (const u of allyTeam) {
        if (!u || !u.state || !Array.isArray(u.state._holyFireRevives)) continue;
        for (const r of u.state._holyFireRevives) holyFireRevives.push(r);
    }
    buffs.forEach(b => {
        const data = { buff: b, allyTeamUids: aliveUids, doubleStrikeUids: ctx.doubleStrikeUids };
        if (b.key === BUFF_TYPES.HOLY_FIRE && holyFireRevives.length) {
            const last = holyFireRevives[holyFireRevives.length - 1];
            data.revives = holyFireRevives;       // 全量复活记录（体检按 uid 逐条归账）
            data.reviveUid = last.uid;            // 最近一次复活单位 uid
            data.reviveHeal = last.heal;          // 实际回复量（缺口夹取后）
            data.reviveRaw = last.raw;            // 档位原始量 ratio×maxHp（回复被上限夹取时仍可反推档位）
            data.reviveMaxHp = last.maxHp;
            data.reviveTier = last.tier;          // 第几次复活（team 名额按本人已用次数；self 名额恒 1）
            data.reviveRatio = last.ratio;        // 实际档位比例（1.0/0.7/0.4/0.3）
            data.reviveSlot = last.slot;          // 'team' 团队名额 / 'self' 妹独立名额
        }
        ctx.log.push({ factType: FACT_TYPES.BUFF_SUMMARY, data });
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
        // 姊强化：吸血率翻倍（普通 80% → 强化 160%，读 content hexEnhance.bloodthirst.leechRatio）
        const enhanceBT = hasSister ? getSkillParams('小昭', 'hexEnhance').bloodthirst : null;
        const leechRatio = (enhanceBT && enhanceBT.leechRatio != null) ? enhanceBT.leechRatio : C.BUFFS.bloodthirst.leechRatio;
        // 声明量必须填原值：core/16 LEECH handler 落账时还会再走一次截脉/寒毒打折，
        //   这里若直接填 preview 值会被打两次折（50% 变 25%）；preview 只用于飘字/审计「实际落地值」
        const rawLeech = Math.floor(dmg * leechRatio);
        const leechVal = previewHeal(unit, rawLeech);
        const decl = { type: EFFECT_TYPES.LEECH, value: rawLeech, source: unit, factType: FACT_TYPES.BLOOD_THIRST_LEECH, factData: { unitName: unit.name, leechVal, isBrother, unitUid: unit.uid } };
        if (!data.declarations) data.declarations = [];
        if (leechVal > 0) {
            data.declarations.push(decl);
            // 审计账本：记进 unit._audit.hp，零游戏逻辑副作用
            recordHpAudit(unit, 'bloodthirstLeech', leechVal, '嗜血狂刀'); // 账本记实际落地值（与 factData.leechVal 同口径）
        }
        // 姊强化：移除必出双击逻辑，只保留数值翻倍（forceDoubleStrike 已从 002-hex-enhance.json 移除）
    } else if (hasBrotherPermanent(allySide, BUFF_TYPES.BLOODTHIRST) && unit.role === ROLE_TYPES.WARRIOR && dmg > 0) {
        // 同主分支：声明量填原值，preview 只用于飘字/审计
        const rawLeech = Math.floor(dmg * C.BUFFS.bloodthirst.leechRatio);
        const leechVal = previewHeal(unit, rawLeech);
        if (!data.declarations) data.declarations = [];
        if (leechVal > 0) {
            data.declarations.push({ type: EFFECT_TYPES.LEECH, value: rawLeech, source: unit, factType: FACT_TYPES.BLOOD_THIRST_LEECH, factData: { unitName: unit.name, leechVal, isBrother, unitUid: unit.uid } });
            // 审计账本（同分支 1）：记进 unit._audit.hp，零游戏逻辑副作用
            recordHpAudit(unit, 'bloodthirstLeech', leechVal, '嗜血狂刀'); // 账本记实际落地值（与 factData.leechVal 同口径）
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
    const enhanceHB = hasSister ? query('xiaoHexEnhance', allySide, unitBuffs, BUFF_TYPES.HOT_BLOOD) : null;
    const leechPct = enhanceHB ? (enhanceHB.leechPct || C.BUFFS.hotBlood.leechRatio) : C.BUFFS.hotBlood.leechRatio;
    Object.assign(unit.state, { _hotBloodCount: (unit.state._hotBloodCount || 0) + 1 });
    let isDouble = false;
    if (enhanceHB && Array.isArray(enhanceHB.critPattern)) {
        // 姐姐强化：按配置数组定翻倍节奏（[2,3] = 每 3 次攻击里的第 2、3 次翻倍）
        const cycleLen = enhanceHB.critPattern[enhanceHB.critPattern.length - 1] || C.HOT_BLOOD_CRIT_INTERVAL;
        const pos = (unit.state._hotBloodCount - 1) % cycleLen + 1;
        isDouble = enhanceHB.critPattern.includes(pos);
    } else {
        // 普通版：固定间隔翻倍
        isDouble = unit.state._hotBloodCount % C.HOT_BLOOD_CRIT_INTERVAL === 0;
    }
    const ratio = isDouble ? leechPct * 2 : leechPct;
    // 声明量填原值（core/16 HEAL handler 落账时再走一次截脉/寒毒打折，填 preview 会二次打折）；
    //   preview 只用于飘字/审计的实际落地值
    const rawLeech = Math.min(Math.floor((unit.maxHp - unit.hp) * ratio), unit.maxHp - unit.hp);
    const leech = previewHeal(unit, rawLeech);
    if (leech > 0) {
        if (!data.declarations) data.declarations = [];
        data.declarations.push({ type: EFFECT_TYPES.HEAL, value: rawLeech, source: unit, isDouble, factType: FACT_TYPES.HOT_BLOOD_HEAL, factData: { unitName: unit.name, leech, tag: isDouble ? '❤️‍🔥 热血奋战(翻倍)' : '❤️ 热血奋战', isBrother, unitUid: unit.uid } });
        // 审计账本：记进 unit._audit.hp，零游戏逻辑副作用
        recordHpAudit(unit, 'hotBloodHeal', leech, '热血奋战'); // 账本记实际落地值（与 factData.leech 同口径）
    }
}

export function registerHotBlood(eventBus) {
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
        priority: L.AFTER_DAMAGE_APPLIED.HOT_BLOOD,
        handler: (data) => { submitHotBloodDeclaration(data); }
    });
}

// 背水一战·姐姐强化专属吸血（15%）
function submitLastStandLeechDeclaration(data) {
    const { unit, dmg } = data;
    if (!unit || !unit.alive || !dmg || dmg <= 0) return;
    const ratio = unit.state._lastStandLeechRatio;
    if (!ratio) return;
    
    const rawLeech = Math.floor(dmg * ratio);
    const leechVal = previewHeal(unit, rawLeech);
    if (leechVal > 0) {
        if (!data.declarations) data.declarations = [];
        data.declarations.push({
            type: EFFECT_TYPES.LEECH, value: rawLeech, source: unit,
            factType: FACT_TYPES.HEAL,
            factData: { unitName: unit.name, heal: leechVal, hpBefore: unit.hp, hpAfter: unit.hp + leechVal, unitUid: unit.uid, maxHp: unit.maxHp, stacks: 1, icon: '🩸', label: '背水一战吸血', mode: 'plusTrail', anchorVerb: '吸血' }
        });
        recordHpAudit(unit, 'lastStandLeech', leechVal, '背水一战吸血');
    }
}

export function registerLastStandLeech(eventBus) {
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
        priority: L.AFTER_DAMAGE_APPLIED.LEECH,
        handler: (data) => { submitLastStandLeechDeclaration(data); }
    });
}

// 背水一战·实时触发：受伤扣血后，若跌破阈值立即原地触发（回合开始逻辑保留作为初始/毒发兜底）
export function registerLastStand(eventBus) {
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
        priority: L.AFTER_DAMAGE_APPLIED.LEECH + 1, // 排在吸血前，让本次触发带来的上限提升能吃到当次回血
        handler: (data) => {
            const u = data.target;
            if (!u || !u.alive || u.state._lastStandTriggered) return;
            const team = u.camp === CAMP_TYPES.ALLY ? data.A : data.B;
            if (!team) return;
            const buffs = team._activeBuffs || [];
            applyLastStandBonus(u, team, buffs, data.log);
        }
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
    const brotherActive = unit.role === ROLE_TYPES.FLYER && hasBrotherPermanent(allySide, BUFF_TYPES.WIND_ASSAULT);
    if (!active && !brotherActive) return;
    const enhance = query('xiaoHexEnhance', allySide, unitBuffs, BUFF_TYPES.WIND_ASSAULT);
    const hitProb = enhance ? Math.floor(enhance.hitProb * 100) : Math.floor(C.BUFFS.windAssault.hitProb * 100);
    const pushProb = enhance ? Math.floor(enhance.pushProb * 100) : Math.floor(C.BUFFS.windAssault.pushProb * 100);
    const label = brotherActive ? '🦋 蝶翼' : '🦅 乘风突袭';
    if (rng.nextInt(1, 100) <= hitProb) {
        // 姊强化不再额外加伤（改为持续 +1 回合，见 modules/28 createBuffObject）
        const row = getUnitRow(target.pos);
        const rowTargets = enemySide.filter(u => u.alive && getUnitRow(u.pos) === row && u.uid !== target.uid && !(u.state._flyMode === 'butterfly') && !(u.state._flyMode === 'spider') && !u.state._spiderFlying);
        if (rowTargets.length > 0) {
            const splashDmg = Math.floor(dmg);
            // 主伤被护罩全吸收时 dmg=0：0 伤害的溅射仍会触发挨打增益/流星成长等副作用，直接不声明
            if (splashDmg > 0) {
                if (!data.declarations) data.declarations = [];
                data.declarations.push({ type: EFFECT_TYPES.SPLASH, value: splashDmg, targets: rowTargets, buffType: BUFF_SUBTYPES.WIND_ASSAULT, attackerUid: unit.uid, primaryUid: target.uid, splashUids: rowTargets.map(t => t.uid), splashDmg, factType: FACT_TYPES.WIND_ASSAULT_SPLASH, factData: { label, targets: rowTargets.map(t => ({ uid: t.uid, name: t.name })), splashDmg } });
            } else if (log) {
                log.push({ factType: FACT_TYPES.WIND_ASSAULT_FAIL, data: { label, reason: '主伤为 0，不产生溅射' } });
            }
        } else {
            log.push({ factType: FACT_TYPES.WIND_ASSAULT_FAIL, data: { label, reason: '波及无同行目标' } });
        }
    } else {
        log.push({ factType: FACT_TYPES.WIND_ASSAULT_FAIL, data: { label, reason: '波及触发失败' } });
    }
    if (rng.nextInt(1, 100) <= pushProb) {
        // 击退/眩晕统一判定：7-9 号位退无可退改为眩晕（与胖远桥·年轻气盛共用 core/13）
        // 取队口径：allySide/enemySide 是「攻击方视角」的别名（allySide=攻击方自己那队），而 target.camp 是全局阵营
        //   ——必须拿 unit.camp 作参照，不能拿 CAMP_TYPES.ALLY。原写法 `target.camp === CAMP_TYPES.ALLY ? allySide : enemySide`
        //   在敌方飞行单位触发时会取到攻击方自己那队，把敌方单位换进我方格（跨阵营换位、同阵营双人同格）。
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
    const brotherActive = unit.role === ROLE_TYPES.RANGED && hasBrotherPermanent(allySide, BUFF_TYPES.METEOR_SHOWER);
    if (!active && !brotherActive) return;
    // 姊强化·飞箭雨：全屏真伤，与下方「主目标加伤 + 溅射 + 降防」叠加（V6.8.2 删 return：
    //   原实现直接 return 跳过整套结算，姐姐版实际只剩真伤）
    const meteorEnh = query('xiaoHexEnhance', allySide, unitBuffs, BUFF_TYPES.METEOR_SHOWER);
    if (active && meteorEnh && meteorEnh.trueDmgPct > 0) {
        const foes = (enemySide || []).filter(u => u.alive && !u.isHorse);
        if (!data.declarations) data.declarations = [];
        const rows = [];
        for (const u of foes) {
            const dmg = Math.floor(getStat(u, 'maxHp') * meteorEnh.trueDmgPct);
            if (dmg <= 0) continue;
            data.declarations.push({ type: EFFECT_TYPES.BONUS_DMG, value: dmg, target: u, label: '☄️ 飞箭雨' });
            rows.push(`${u.name} 受 ${dmg} 真伤`);
        }
        if (log) {
            eventBus.emit(FX_SIGNALS.METEOR_RAIN, { enemySide });
            log.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: {
                unitName: unit.name, unitUid: unit.uid, camp: unit.camp, skillName: '流星赶月·飞箭雨',
                note: `☄️ 飞箭雨！${rows.join('、')}`,
                floatText: '☄️', floatUid: unit.uid
            } });
        }
    }
    const label = brotherActive ? '🦋 蝶星' : '☄️ 流星赶月';
    const bonusDmg = Math.floor(dmg * C.BUFFS.meteorShower.bonusRatio);
    if (!data.declarations) data.declarations = [];
    data.declarations.push({ type: EFFECT_TYPES.STAT_CHANGE, field: 'def', delta: -(C.BUFFS.meteorShower.mainDefReduce || 2), target, reason: '流星赶月', logText: null });
    data.declarations.push({ type: EFFECT_TYPES.BONUS_DMG, value: bonusDmg, target, buffType: BUFF_SUBTYPES.METEOR_BONUS, factType: FACT_TYPES.METEOR_SHOWER_MAIN, factData: { label, targetName: target.name, targetUid: target.uid, bonusDmg, defReduce: C.BUFFS.meteorShower.mainDefReduce || 2 } });
    const splashDmg = Math.floor(dmg * C.BUFFS.meteorShower.splashRatio);
    const adjPositions = getAdjacentPositions(target.pos);
    const splashSide = target.camp === unit.camp ? allySide : enemySide;
    const splashTargets = splashSide.filter(u => u.alive && adjPositions.includes(u.pos) && !(u.state._flyMode === 'butterfly') && !(u.state._flyMode === 'spider') && !u.state._spiderFlying);
    // 0 伤害溅射不声明：主伤被护罩全吸收时 dmg=0，声明出去会白触发挨打增益/流星成长（体检 2/156 场）
    if (splashTargets.length > 0 && splashDmg > 0) {
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
// 数值唯一来源：content 的 roles.飞行.baseRegen；挂 ON_UNIT_DEATH（core/12 死亡广播），由 core/11 每回合注册监听。
// 回血弹幕走 fact 管线（render/35 渲染，isHealEntry 飘 "+N"）。
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
            // 回血出口保实数：hp 是 0.1 精度（applyStatChange 落 step 到 0.1），差值的浮点尾巴（73.7-63.7 =
            //   10.000000000000007）由显示侧 fmtNum 收口；原 Math.round 会把 0.4 的真实回复取整成 0，
            //   打出「飞行再生：XX 回复 0 点生命」的空行（守卫 u.hp > before 已保证实际有回血）。
            const healed = Math.max(0, u.hp - before);
            log.push({ factType: FACT_TYPES.FLYER_REGEN, data: { unitName: u.name, unitUid: u.uid, heal: healed, deadCount: dead.length } });
            // 审计账本：value 与 fact heal 同一个 healed，保精确相等
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
    // 按死者认领名额：先确定死的是谁、属于哪支队伍，再查那支队伍有没有圣火。
    //   不能取「第一个持有圣火的队伍」——双方都持有时会取到敌方，己方死者永远认领不到（判负照走）。
    // 名额只给「真角色」：拒马(isHorse)与召唤物(幼狮/雄狮/母狮，isSummon)阵亡不占名额——
    //   否则唯一一次复活常被 0 攻幼狮这类召唤物吃掉，复活出来也是白板。
    const owner = teams.find(t => (data.deadUnits || []).some(u => u && t.includes(u) && !u.isHorse && !u.isSummon && u.pos != null)
        && hasBuff(t._activeBuffs || [], BUFF_TYPES.HOLY_FIRE));
    if (owner) {
        // 名额：普通版 1 次；姊强化 reviveCount 可到 2 次。按队伍求和（已用 + 待复活占用），
        //   _holyFireUses 记在阵亡者本人 state（跨回合存活），故同一人第二次阵亡也能累加。
        const hfEnh = owner.some(u => u.isXiaoZhaoSister && u.alive) ? (getSkillParams('小昭', 'hexEnhance').holyFire || null) : null;
        const reviveCount = (hfEnh && hfEnh.reviveCount != null) ? hfEnh.reviveCount : 1;
        const usedCount = owner.reduce((n, u) => n + (((u.state && u.state._holyFireUses) || 0) + (u.state && u.state._holyFire === 'pending' ? 1 : 0)), 0);
        const pendingExists = owner.some(u => u.state && u.state._holyFire === 'pending');
        if (!pendingExists && usedCount < reviveCount) {
            const victim = (data.deadUnits || []).find(u => u && owner.includes(u) && !u.isHorse && !u.isSummon);
            if (victim && victim.pos != null) victim.state._holyFire = 'pending';
        }
    }
    // 妹永久补 holyFire（「团队 1 + 她 1」）：小昭·妹自己阵亡，独立名额再复活一次——与团队名额互不占用
    //   （_holyFireSelf 单独记账）；直查 _permanentBuffs，不走 xiaoPermanentActive（那个在团队 buff 在场时返回 false，
    //   而妹名额要与团队名额叠加生效）。已被团队名额接管（_holyFire==='pending'）时不再记，防同一次死亡双复活。
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
    // 姊增强接线：复活方小昭·姊存活在场 → 回血 40%→60%（hexEnhance.holyFire）
    const enhance = team.some(x => x.isXiaoZhaoSister && x.alive) ? (getSkillParams('小昭', 'hexEnhance').holyFire || null) : null;
    // 妹永久名额（slot='self'）回血固定 30%（content.buffs.holyFire.brotherReviveRatio），
    //   不吃姊增强——与「永久版一律用团队基础值」的既定口径一致（圣火令/摄魂同款）
    // 妹独立名额（slot='self'）回血率唯一真源 = 201 brother.holyFire.reviveRatio（缺则炸）；
    //   团队名额（slot 非 self）有姊强化走姊表，否则回落普通版
    let ratio;
    let reviveTier;
    if (slot === 'self') {
        const brotherHFEnh = getBrotherHexEnhance('holyFire');
        if (!brotherHFEnh || brotherHFEnh.reviveRatio == null) {
            throw new Error('002-hex-enhance.json 缺 brother.holyFire.reviveRatio');
        }
        ratio = brotherHFEnh.reviveRatio;
        reviveTier = 1;               // 妹独立名额每局 1 次，档位恒第 1 次
    } else {
        // 姊强化：首复活 100% / 次复活 70%（按本人已用次数选档）；无强化回落普通版
        const used = u.state._holyFireUses || 0;
        ratio = enhance
            ? (used === 0 ? (enhance.firstReviveRatio != null ? enhance.firstReviveRatio : 1.0)
                          : (enhance.secondReviveRatio != null ? enhance.secondReviveRatio : 0.7))
            : (cfg.reviveRatio != null ? cfg.reviveRatio : 0.4);
        u.state._holyFireUses = used + 1;
        reviveTier = used + 1;        // 第几次复活（体检按档位反推 70% / 40%）
    }
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
    // 文案报实际落地值：下面 isHeal=false 不吃截脉/寒毒，故不能用 previewHeal（会误打折），按 maxHp 缺口夹取即实际值
    const reviveRaw = Math.round(u.maxHp * ratio);
    const reviveHeal = Math.min(reviveRaw, Math.max(0, u.maxHp - u.hp));
    const hpBeforeRevive = u.hp;
    applyStatChange(u, 'hp', reviveRaw, null, '圣火不熄', false, false);
    // 复活即可动：删「当回合眩晕」（原 withStun 置 _stunned 挡本回合剩余行动），_acted 统一清 false——
    //   回合中复活（BEFORE_STATE_TRANSITION）本轮没动过就补上这一手，动过则多给一手（每局仅 1 次，代价可控）；
    //   回合开始兜底同口径。
    u.state._acted = false;
    emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: true, atk: getStat(u, 'atk'), def: getStat(u, 'def'), _stunned: false });
    // 复活账（体检归账）：实际回复量/原始量/档位/名额写进本人 state，随每回合 BUFF_SUMMARY 下发；
    //   复活公告也补结构化字段，体检不必再从 note 中文里抠数字（note 文案保持不变）。
    const reviveSlot = slot === 'self' ? 'self' : 'team';
    const rec = {
        uid: u.uid, name: u.name, camp: u.camp,
        slot: reviveSlot, tier: reviveTier, ratio,
        heal: reviveHeal, raw: reviveRaw, maxHp: u.maxHp,
        hpBefore: hpBeforeRevive, hpAfter: u.hp
    };
    if (!u.state._holyFireRevives) u.state._holyFireRevives = [];
    u.state._holyFireRevives.push(rec);
    if (log) {
        log.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: {
            unitName: u.name, unitUid: u.uid, camp: u.camp, skillName: '圣火不熄',
            note: `🕯️ 圣火不熄！${u.name} 原地复活，回复 ${fmtNum(reviveHeal)} 点生命`,
            floatText: '🕯️', floatUid: u.uid,
            healUnitUid: u.uid, healAmount: reviveHeal,
            hpBefore: hpBeforeRevive, hpAfter: u.hp,
            reviveTier, reviveRatio: ratio, reviveSlot, reviveMaxHp: u.maxHp, reviveRaw
        } });
    }
}

// 下一个行动步落位（复活即可动，见 reviveHolyFireUnit 注）
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
        holyFireRevive: registerHolyFire,
        lastStandLeech: registerLastStandLeech,
        lastStandTrigger: registerLastStand
    };
    for (const buff of Object.values(gd.buffs)) {
        if (!buff.effects || !Array.isArray(buff.effects)) continue;
        for (const effectName of buff.effects) {
            const install = processors[effectName];
            if (install) install(eventBus);
        }
    }
}