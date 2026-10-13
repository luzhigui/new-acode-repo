// V6.4.4 | ~27700 bytes | 2026-10-13 圣火不熄两项强化（老板拍板）：① 复活名额排除召唤物（isSummon）——
//           幼狮/雄狮/母狮阵亡不再占用唯一一次复活名额（原先只排 isHorse，名额常被 0 攻幼狮吃掉）
//           ② 「整局」时长：content 打 permanent:true，时长映射在 modules/28 createBuffObject（单点）
// V6.4.3 | ~27370 bytes | 2026-10-13 摄魂降防改乘法（老板拍板）：第 N 回合累计乘率 = 0.9×0.95^(N-1)（原线性叠加作废），
//           defRatio = (1+defBonus)×(1+perRoundBonus)^(N-1)-1，乘法累积越拖越脆但渐近封顶
// V6.4.2 | ~27000 bytes | 2026-10-13 修圣火不熄「回合开始兜底复活」吞行动权：reviveHolyFireUnit 的
//           withStun=false 分支补 else u.state._acted = false（阵亡态被回合初重置整段跳过，旧值遗留）
// ── 更早版本见 记录-更改履历.md
export const VER = 'core/04buff-system.js V6.4.4';
import {
    applyFortifyDef,
    applyCloudBodyDodge_Normal, applyCloudBodyDodge_Sister, applyCloudBodyDodge_Brother,
    applyHolyFlame_Normal, applyHolyFlame_Sister, applyHolyFlame_Brother,
    calcCarryBonus_Normal, calcCarryBonus_Sister,
    applyMindControl_Normal, applyMindControl_Sister
} from './14buff-effects.js';
import { CONFIG, getGameData } from './01config-5v5-test.js';
import { hasBuff, getUnitRow, getUnitCol, getAdjacentPositions } from './03battle-utils.js';
import { emitEvent, applyStatChange, refreshMaxHp, query, getBattleRng, resolvePushOrStun, addMod, getStat, removeModsByGroup } from './13battle-shared.js';
import { findFreePos } from './05battle-horse.js';
import { eventBus, EXECUTION_LAYER as L, EFFECT_TYPES, registerSettlementHook } from '../infra/50-event-bus.js';
import { FACT_TYPES, BUFF_TYPES, BUFF_SUBTYPES, UNIT_EVENT_TYPES, CAMP_TYPES, ROLE_TYPES, SIGNAL_TYPES } from '../infra/56-battle-enums.js';
const C = CONFIG;

export function applyHolyFlameBonus(unit, activeBuffs, ctx) {
    const holyFlameBuff = activeBuffs.find(b => b.key === BUFF_TYPES.HOLY_FLAME);
    if (!holyFlameBuff) return;
    if (ctx.hasSister) applyHolyFlame_Sister(unit, null, activeBuffs, ctx.log);
    else applyHolyFlame_Normal(unit, null, activeBuffs, ctx.log);
}

export function applyFortifyBonus(unit, activeBuffs) {
    // 2026-09-19 支持分阵营：六大派持有严阵以待时同样生效
    if (unit.role !== ROLE_TYPES.DEFENDER) return;
    if (activeBuffs.some(b => b.key === BUFF_TYPES.FORTIFY)) {
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
    if (!hasBuff(casterActiveBuffs, BUFF_TYPES.SOUL_DRAIN)) return;
    const cfg = CONFIG.BUFFS.soulDrain;
    const extra = ctx ? Math.max(0, ctx.targetAlive - ctx.casterAlive) : 0;
    const ratio = cfg.atkBonus - cfg.perUnitBonus * extra;
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
            // 纯记账（体检对照 bloodthirstLeech group）：只 push _mods['hp']，零游戏逻辑副作用
            addMod(unit, 'hp', { source: '嗜血狂刀', value: leechVal, ttl: 'permanent', group: 'bloodthirstLeech', op: 'add' });
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
            // 纯记账（同分支 1，体检对照 bloodthirstLeech group）：零游戏逻辑副作用
            addMod(unit, 'hp', { source: '嗜血狂刀', value: leechVal, ttl: 'permanent', group: 'bloodthirstLeech', op: 'add' });
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
        // 纯记账（体检对照 hotBloodHeal group）：只 push _mods['hp']，零游戏逻辑副作用
        addMod(unit, 'hp', { source: '热血奋战', value: leech, ttl: 'permanent', group: 'hotBloodHeal', op: 'add' });
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
            // 纯记账（体检对照 flyerRegen group）：value 与 fact heal 同一个 healed，保精确相等
            addMod(u, 'hp', { source: '飞行再生', value: healed, ttl: 'permanent', group: 'flyerRegen', op: 'add' });
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
    if (!owner) return;
    // 每局一次：本人群中已有「待复活」或「已复活」标记即不再记（两个标记都写在阵亡者本体上，跨回合存活）
    if (owner.some(u => u.state && (u.state._holyFire === 'pending' || u.state._holyFire === 'used'))) return;
    // 2026-10-13 名额只给「真角色」：拒马(isHorse)与召唤物(幼狮/雄狮/母狮，isSummon)阵亡不占名额——
    //   否则唯一一次复活常被 0 攻幼狮这类召唤物吃掉，复活出来也是白板（老板拍板 ①）
    const victim = (data.deadUnits || []).find(u => u && owner.includes(u) && !u.isHorse && !u.isSummon);
    if (!victim || victim.pos == null) return;
    victim.state._holyFire = 'pending';
}

function reviveHolyFireUnit(u, team, log, withStun) {
    u.state._holyFire = 'used';
    const cfg = C.BUFFS.holyFire || {};
    const ratio = cfg.reviveRatio != null ? cfg.reviveRatio : 0.4;
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
    if (withStun) u.state._stunned = true;
    // 2026-10-13 第 86 轮：回合开始兜底复活（withStun=false）＝设计意图「那个回合已过、新回合正常参与」，
    //   但阵亡前已行动过的单位 _acted 遗留 true —— core/11 L157-158 的回合初重置 resetStateFields 只扫 alive，
    //   阵亡态被整段跳过；本钩子挂在 ON_ROUND_START（本文件 L374），跑在 L157-158 之后 ⇒ 复活者回合级旧值一个都没清。
    //   回合循环按 alive && !_acted 选人（core/11 L372/L387）⇒ 新回合行动权被吞（静默：无攻击、无 PASS、无休息记录）。
    //   清 false 让它进本回合候选。注：只清行动权一字段——本钩子之前（优先级 5~35）已发的回合级加成不擦除；
    //   withStun=true 路径（当回合内复活）由 _stunned 挡当回合、下回合 resetStateFields 自然清，闭环完整无需动。
    else u.state._acted = false;
    emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: true, atk: getStat(u, 'atk'), def: getStat(u, 'def'), _stunned: !!withStun });
    if (log) {
        log.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: {
            unitName: u.name, unitUid: u.uid, camp: u.camp, skillName: '圣火不熄',
            note: `🕯️ 圣火不熄！${u.name} 原地复活，回复 ${Math.round(ratio * 100)}% 生命${withStun ? '（当回合不可行动）' : ''}`,
            floatText: '🕯️', floatUid: u.uid
        } });
    }
}

// 下一个行动步落位（当回合内复活 → 置 _stunned 挡掉本回合剩余行动，回合开始自动清）
export function flushHolyFire(data) {
    for (const team of [data.A, data.B]) {
        if (!team) continue;
        const victim = team.find(u => u.state && u.state._holyFire === 'pending');
        if (victim) reviveHolyFireUnit(victim, team, data.log, true);
    }
}

// 回合开始兜底（阵亡发生在回合最后一手 → 无「下一行动步」）：那个回合已过，不再补 _stunned
export function flushHolyFireRoundStart(data) {
    for (const team of [data.A, data.B]) {
        if (!team) continue;
        const victim = team.find(u => u.state && u.state._holyFire === 'pending');
        if (victim) reviveHolyFireUnit(victim, team, data.log, false);
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