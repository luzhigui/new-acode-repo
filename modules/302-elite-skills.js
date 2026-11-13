// modules/302-elite-skills.js — 精英技能公共实现（小昭蛛变/飞天/蛛袭、乾坤减伤、永久海克斯查询）
// 飞天落地回血先 previewHeal 预演再落账：文案/飘字取实际值，声明值只记审计。
//   landHeal 提前算好写进 SPIDER_RETURN fact data（数值对照器声明侧；不落地记 0，与 addMod 同条件同值）。
// V6.4.0 | 2026-11-09 飞行·猎杀成长去掉「只给明教」的阵营门槛：敌方飞行击杀我方同样涨攻/涨未命中， 其余排除原样保留（只算杀敌、杀者须存活且 role=FLYER）。
export const VER = 'modules/302-elite-skills.js V6.4.2';

import { CONFIG, getGameData } from '../core/201-config-5v5-test.js';
import { spawnUnit } from '../core/205-battle-horse.js';
import { getRoleBonus, getHpDmgRatio } from '../core/202-unit.js';
import { hasBuff } from '../core/203-battle-utils.js';
import { buildTargetCandidates } from '../core/207-target-strategies.js';
import { emitEvent, applyStatChange, refreshMaxHp, registerQuery, getBattleRng, addMod, removeModsByGroup, getStat, recordHpAudit, previewHeal } from '../core/214-battle-shared.js';
import { FACT_TYPES, UNIT_EVENT_TYPES, CAMP_TYPES, ROLE_TYPES, STATE_CHANGE_TYPES, SIGNAL_TYPES, BUFF_TYPES } from '../infra/106-battle-enums.js';
import { emitStateChange } from '../infra/108-state-change.js';
import { registerSettlementHook, EXECUTION_LAYER as L } from '../infra/101-event-bus.js';
import { registerRoundHook } from '../core/208-registry-elite.js';
import { pushSkillAnnounce, findAlive, requireSkillParams, emitHpChange } from './305-elite-helpers.js';
import { fmtNum } from '../infra/102-core-utils.js';
import { isControlled } from '../core/218-state-keys.js';

// 玄冥二老 — 中毒/鹿角

export function tickXuanmingPoison(unit, source) {
    if (!unit.alive) return 0;
    const poison = unit.state._xuanmingPoison;
    if (!poison || poison.remaining <= 0) return 0;
    poison.remaining--;
    const s = requireSkillParams('鹿杖客', 'xuanmingPalm');
    const idx = Math.min(poison.dotPercents.length - 1, s.duration - 1 - poison.remaining);
    const pct = poison.dotPercents[idx] || 0;
    const dot = Math.floor(unit.maxHp * pct);
    applyStatChange(unit, 'hp', -dot, source, '玄冥中毒');
    return dot;
}

// 乾坤大挪移升级版减伤

// 乾坤保护域：张无忌当前所站的四邻格（前后左右）。3x3 棋盘 1-9：上=p-3、下=p+3、左=p-1（非左列）、右=p+1（非右列）。
// 站中心 5 号时恰为旧版固定 2/4/6/8；站边角时邻格只有 2-3 个，保护范围随之收窄。
function qianKunZone(pos) {
    const zone = [];
    if (pos > 3) zone.push(pos - 3);
    if (pos <= 6) zone.push(pos + 3);
    if (pos % 3 !== 1) zone.push(pos - 1);
    if (pos % 3 !== 0) zone.push(pos + 1);
    return zone;
}

// 形参语义（2026-11-01 修正）：targetTeam = 目标所在队（本函数只保护明教友方，
// 故调用方传防守方队），attackerTeam = 攻击方队（当前函数体未使用，保留占位符对齐 query 参数位置）。
// 原名 allySide/enemySide 会与 calcFinalDamage 的同名形参语义冲突（那边是攻方队），已改。
export function applyDamageModifiers(unit, target, dmg, targetTeam, attackerTeam, log) {
    let modifiedDmg = dmg;
    const entries = [];
    const xiaoZhao = targetTeam.find(u => (u.isXiaoZhaoSister || u.isXiaoZhaoBrother) && u.alive);
    const zhang = targetTeam.find(c => c.isZhang && c.alive && c.rangedForm && !isControlled(c));
    if (target.camp !== CAMP_TYPES.ALLY || !zhang) return { modifiedDmg, entries };

    let isProtected = false;
    let reducePct, reboundPct, selfDmgPct;
    let label;

    if (xiaoZhao && qianKunZone(zhang.pos).includes(target.pos)) {
        const s = requireSkillParams('小昭', 'qianKunUpgraded');
        reducePct = s.reducePct; reboundPct = s.reboundPct; selfDmgPct = s.selfDmgPct;
        isProtected = true; label = 'QIAN_KUN_UPGRADED';
    } else if (!xiaoZhao && qianKunZone(zhang.pos).includes(target.pos)) {
        const s = requireSkillParams('张无忌', 'qianKun');
        reducePct = s.reducePct; reboundPct = s.reboundPct; selfDmgPct = s.selfDmgPct;
        isProtected = true; label = 'QIAN_KUN_BASIC';
    }

    if (isProtected) {
        const reducedDmg = Math.round(dmg * (1 - reducePct));
        const rebound = Math.floor(dmg * reboundPct);
        const selfDmg = Math.max(1, Math.floor(dmg * selfDmgPct));

        zhang.reboundDone += rebound;
        applyStatChange(unit, 'hp', -rebound, zhang, '乾坤反弹');
        applyStatChange(zhang, 'hp', -selfDmg, unit, '乾坤自伤', false);

        // 新增：张无忌如果有护盾，优先用护盾替队友全额挡下剩余伤害
        let absorbed = 0;
        let shieldLeft = (zhang.state._shield || 0) + (zhang.state._permShield || 0);
        if (shieldLeft > 0 && reducedDmg > 0) {
            absorbed = Math.min(shieldLeft, reducedDmg);
            let remainAbsorb = absorbed;

            // 先扣临时盾
            if (zhang.state._shield > 0) {
                const deduct = Math.min(zhang.state._shield, remainAbsorb);
                zhang.state._shield -= deduct;
                remainAbsorb -= deduct;
            }
            // 再扣永久盾
            if (remainAbsorb > 0 && zhang.state._permShield > 0) {
                const deduct = Math.min(zhang.state._permShield, remainAbsorb);
                zhang.state._permShield -= deduct;
                remainAbsorb -= deduct;
            }

            // 刷新张无忌的 UI（血量/护盾状态）
            emitHpChange(zhang);
        }

        entries.push({
            factType: FACT_TYPES[label],
            data: {
                attackerName: unit.name,
                zhangName: zhang.name,
                dmg,          // 减伤前原始伤害（反弹/吸收校验的基数）
                reducePct,
                rebound,
                selfDmg,
                absorbed,
                attackerUid: unit.uid,
                zhangUid: zhang.uid
            }
        });

        modifiedDmg = reducedDmg - absorbed;
    }

    return { modifiedDmg, entries };
}

// 小昭·妹 — 蛛变/飞天/蛛落

// 精通层数：每职业 1 层，全 4 门后 +2 层（封顶 6）
function masteryLayers(count) { return count >= CONFIG.ROLES.length ? count + CONFIG.MASTERY_FULL_BONUS_LAYERS : count; }

// 背水·突袭精通拉满（2026-11-10 老板改版）：所有未精通职业立即白拿首穿精通加成、层数封顶（全 4 门+2=6）。
//   逐门走与 spiderTransform 首穿完全同款的「层数差结算」，保证与正常轮换路径逐数一致。返回本次新增层数。
export function masterAllRoles(unit, log) {
    if (!unit.isXiaoZhaoBrother || !unit.alive) return 0;
    const roles = [ROLE_TYPES.WARRIOR, ROLE_TYPES.DEFENDER, ROLE_TYPES.RANGED, ROLE_TYPES.FLYER];
    if (!unit.state._masteredRoles) Object.assign(unit.state, { _masteredRoles: [] });
    const m = requireSkillParams('小昭', 'mastery');
    let granted = 0;
    for (const role of roles) {
        if (unit.state._masteredRoles.includes(role)) continue;
        unit.state._masteredRoles.push(role);
        const gained = masteryLayers(unit.state._masteredRoles.length) - masteryLayers(unit.state._masteredRoles.length - 1);
        if (gained > 0) {
            const gAtk = gained * m.atkPer, gDef = gained * m.defPer, gHp = gained * m.hpPer;
            addMod(unit, 'atk', { source: '精通', value: gAtk, ttl: 'permanent', group: 'spiderMastery', op: 'add' });
            addMod(unit, 'def', { source: '精通', value: gDef, ttl: 'permanent', group: 'spiderMastery', op: 'add' });
            addMod(unit, 'maxHp', { source: '精通', value: gHp, ttl: 'permanent', group: 'spiderMastery', op: 'add' });
            granted += gained;
        }
    }
    if (granted > 0) { refreshMaxHp(unit, null, '精通拉满'); emitHpChange(unit); }
    return granted;
}

export function spiderTransform(unit, log) {
    if (!unit.isXiaoZhaoBrother || !unit.alive) return;
    // 背水·精通转战士（modules/324）触发后永久锁战士：蛛变轮换停摆（老板拍板 2026-11-10「选了背水永远战士」）
    if (unit.state._brotherLastStandTriggered) return;
    const rng = getBattleRng();
    const roles = [ROLE_TYPES.WARRIOR, ROLE_TYPES.DEFENDER, ROLE_TYPES.RANGED, ROLE_TYPES.FLYER];

    // 动态排除候选池（2026-11-06）：按各职业被抽中的累计次数剔除「用过多」的职业——
    //   与抽得最少的职业相差 ≥4 次的职业不进池（而非旧口径「超过 4 次就永久不给加成」）。
    //   选池顺序：动态池里先排除当前职业 → 空则退回动态池 → 再空退回全职业。
    if (!unit.state._roleCounts) Object.assign(unit.state, { _roleCounts: {} });
    const counts = unit.state._roleCounts;
    const minCount = Math.min(...roles.map(r => counts[r] || 0));
    const allowedRoles = roles.filter(r => (counts[r] || 0) - minCount < 4);
    let availableRoles = allowedRoles.filter(r => r !== unit.role);
    if (availableRoles.length === 0) availableRoles = allowedRoles;
    if (availableRoles.length === 0) availableRoles = roles;
    const newRole = availableRoles[rng.nextInt(0, availableRoles.length - 1)];
    // OBJECT 字段是浅拷贝，就地改内容会漏到 UI 镜像——按项目惯例整对象换新
    unit.state._roleCounts = { ...counts, [newRole]: (counts[newRole] || 0) + 1 };
    unit.state._lastRole = newRole;

    if (!unit.state._masteredRoles) Object.assign(unit.state, { _masteredRoles: [] });
    const isNewMastery = !unit.state._masteredRoles.includes(newRole);
    if (isNewMastery) unit.state._masteredRoles.push(newRole);

    // 蛛变：每次变身叠加新职业加成，不扣旧
    const newStats = getRoleBonus(newRole);
    unit.role = newRole;
    if (newRole === ROLE_TYPES.DEFENDER) unit.state._hpDmgRatio = getHpDmgRatio(0.5);
    addMod(unit, 'atk', { source: '蛛变·' + newRole, value: newStats.atk, ttl: 'permanent', group: 'spiderTransform', op: 'add' });
    addMod(unit, 'def', { source: '蛛变·' + newRole, value: newStats.def, ttl: 'permanent', group: 'spiderTransform', op: 'add' });
    addMod(unit, 'maxHp', { source: '蛛变·' + newRole, value: newStats.maxHp, ttl: 'permanent', group: 'spiderTransform', op: 'add' });
    refreshMaxHp(unit, null, '蛛变');
    emitHpChange(unit);

    // 精通加成：首次精通时按层数差结算，全精通补 2 层
    let masteryGain = null;
    if (isNewMastery) {
        const m = requireSkillParams('小昭', 'mastery');
        const gained = masteryLayers(unit.state._masteredRoles.length) - masteryLayers(unit.state._masteredRoles.length - 1);
        if (gained > 0) {
            const gAtk = gained * m.atkPer, gDef = gained * m.defPer, gHp = gained * m.hpPer;
            addMod(unit, 'atk', { source: '精通', value: gAtk, ttl: 'permanent', group: 'spiderMastery', op: 'add' });
            addMod(unit, 'def', { source: '精通', value: gDef, ttl: 'permanent', group: 'spiderMastery', op: 'add' });
            addMod(unit, 'maxHp', { source: '精通', value: gHp, ttl: 'permanent', group: 'spiderMastery', op: 'add' });
            refreshMaxHp(unit, null, '精通');
            emitHpChange(unit);
            masteryGain = { atk: gAtk, def: gDef, hp: gHp };
        }
    }

    emitHpChange(unit, { role: newRole });
    emitStateChange(unit, STATE_CHANGE_TYPES.ROLE_CHANGED, { newRole }, log);
    // 体检对照增量字段：atkDelta/defDelta/maxHpDelta = 本次蛛变实际登记的职业加成（与上方 addMod 入参同源）；
    //   masteryGain 是精通层数的独立增量，勿混用
    log.push({ factType: FACT_TYPES.SPIDER_TRANSFORM, data: { unitName: unit.name, unitUid: unit.uid, newRole, mastered: unit.state._masteredRoles.length, masteryGain, atkDelta: newStats.atk, defDelta: newStats.def, maxHpDelta: newStats.maxHp } });
}

export function spiderReturn(unit, allyTeam, enemySide, log) {
    if (!unit.isXiaoZhaoBrother) return;
    const rng = getBattleRng();

    Object.assign(unit.state, { _spiderFlying: false, _flyMode: null });
    unit.state._acted = false;

    // 落格规矩（老板定稿）：回原格优先——自己是几号位先落哪，原格被占再按「原格+1 环形顺延」
    //   （7 → 8,9,1,2,3,4,5,6）。一切存活队友都算占格：拒马/狮子/召唤物/天上的蝶/蛛/附身者（旧版
    //   后排优先 [4,5,6...] 且把拒马当空气，会一头落进拒马格子——seed15 stage5 R9 重叠案，体检不变量
    //   「pos 冲突」即此）。飞天期间 pos 不动（自己原格天然保留），anchor 即原格。
    const anchor = unit.pos || 4;
    const order = [];
    for (let i = 0; i < 9; i++) order.push(((anchor - 1 + i) % 9) + 1);
    const occupied = new Set(allyTeam.filter(a => a.alive && a.uid !== unit.uid).map(a => a.pos));
    for (const p of order) {
        if (!occupied.has(p)) { unit.pos = p; break; }
    }

    emitHpChange(unit, { _flyMode: null, _spiderFlying: false });
    emitEvent(unit, UNIT_EVENT_TYPES.POS_CHANGE, { pos: unit.pos });
    emitStateChange(unit, STATE_CHANGE_TYPES.LANDING, { pos: unit.pos }, log);

    // 落地回血：70/40 档回 maxHp 的 landHealRatio，
    //   致死档回 landHealRatioDeath；孵化落地不回（血钉 eggHatchHpRatio）。档位随 _spiderLandTier 带入。
    // landHeal 提前算好并写进 SPIDER_RETURN fact（数值对照器 SPIDER_LAND_HEAL 契约的声明侧，体检第 88 轮转交）；
    //   不落地（孵化/满血/比率为 0）时记 0，与 addMod 记账同条件同值
    let landHeal = 0;
    if (!unit.state._spiderEggHatch) {
        const flyParams = requireSkillParams('小昭', 'spiderFly');
        const ratio = unit.state._spiderLandTier === 'death' ? flyParams.landHealRatioDeath : flyParams.landHealRatio;
        const heal = Math.floor(unit.maxHp * ratio);
        if (heal > 0 && unit.hp < unit.maxHp) landHeal = heal;
    }

    // 2026-10-22 体检第 115 轮转交：fact/账本/飘字三处同报实际落地值（截脉/寒毒打折后），
    //   与九阳/嗜血/热血/快乐/寒离飒吸血同口径（landHeal 仍是公式原值，只作 applyStatChange 入参）
    let actualLandHeal = 0;
    if (landHeal > 0) actualLandHeal = previewHeal(unit, landHeal);

    log.push({ factType: FACT_TYPES.SPIDER_RETURN, data: { unitName: unit.name, spiderUid: unit.uid, pos: unit.pos, landHeal: actualLandHeal } });

    if (landHeal > 0) {
        const hpBeforeHeal = unit.hp;
        applyStatChange(unit, 'hp', landHeal, unit, '飞天落地回血');
        recordHpAudit(unit, 'spiderLandHeal', actualLandHeal, '飞天落地回血');
        pushSkillAnnounce(log, unit, '飞天落地回血', `🕷️ ${unit.name} 飞天落地回血：生命 +${fmtNum(actualLandHeal)}（${fmtNum(hpBeforeHeal)} → ${fmtNum(hpBeforeHeal + actualLandHeal)}）`, { floatText: `+${fmtNum(actualLandHeal)}`, floatUid: unit.uid });
    }

    // 落地打击目标池统一走 core/207 出口：内部含 canBeTargeted + 全部引擎级过滤器（与主攻击门禁同口径）
    const aliveEnemies = buildTargetCandidates(unit, [enemySide], { rng });
    if (aliveEnemies.length > 0) {
        const target = aliveEnemies[rng.nextInt(0, aliveEnemies.length - 1)];
        if (!target.alive) { log.push({ factType: FACT_TYPES.SPIDER_DEAD_TARGET, data: {} }); return; }
        const atk = getStat(unit, 'atk');
        const def = getStat(target, 'def');
        // 老板拍板：落地蛛袭的穿透伤害减半（精通额外伤害保持不变）
        const penetrationDmg = Math.floor(atk * (atk / (atk + def)) * 0.5);
        const masteryCount = unit.state._masteredRoles?.length || 0;
        const params = requireSkillParams('小昭', 'spiderStrike');
        const extraDmgMap = params.extraDmgMap;
        const extraDmg = extraDmgMap[Math.min(masteryCount, Object.keys(extraDmgMap).length - 1)] || 0;
        const totalDmg = penetrationDmg + extraDmg;
        applyStatChange(target, 'hp', -totalDmg, unit, '蛛袭');
        // 审计账本：记进 unit._audit.hp，零游戏逻辑副作用
        recordHpAudit(target, 'spiderStrike', -totalDmg, '蛛袭');
        log.push({
            factType: FACT_TYPES.SPIDER_STRIKE,
            data: {
                unitName: unit.name,
                targetName: target.name,
                penetrationDmg,
                extraDmg,
                totalDmg,
                isDead: target.hp <= 0,          // 原 isDead: !target.alive —— 上一步 applyStatChange 已即时扣血（hp 夹到 0 不保 1），
                                                 //   alive 要到 finalizeDeaths 才置 false，故旧写法恒为 false、击杀标记永远不出现
                unitUid: unit.uid,
                targetUid: target.uid
            }
        });
    }
}

// 永久海克斯 — 仅小昭·妹可用（isXiaoZhaoBrother）；姊走 hexEnhance 增强路线，不继承永久效果

export function addPermanentBuff(xiaoZhao, buffKey, buffName, extraFields = {}) {
    if (!xiaoZhao || !xiaoZhao.isXiaoZhaoBrother) return;
    // 背水触发后永不继承（老板拍板 2026-11-10）：账本只保留背水一张，其他永久海克斯一律不再收
    if (xiaoZhao.state._brotherLastStandTriggered && buffKey !== BUFF_TYPES.LAST_STAND) return;
    if (!CONFIG.XIAO_ZHAO_PERMANENT_BUFFS.includes(buffKey)) return;
    if (!xiaoZhao.state._permanentBuffs) Object.assign(xiaoZhao.state, { _permanentBuffs: [] });
    if (xiaoZhao.state._permanentBuffs.some(b => b.key === buffKey)) return;
    xiaoZhao.state._permanentBuffs.push({
        key: buffKey,
        target: CAMP_TYPES.ALLY,
        remaining: Infinity,
        name: buffName,
        ...extraFields
    });
}

export function isXiaoZhaoPermanentActive(unit, activeBuffs, buffKey) {
    if (!unit || !unit.isXiaoZhaoBrother || !unit.state._permanentBuffs) return false;
    if (!CONFIG.XIAO_ZHAO_PERMANENT_BUFFS.includes(buffKey)) return false;
    if (activeBuffs && hasBuff(activeBuffs, buffKey)) return false;
    return unit.state._permanentBuffs.some(b => b.key === buffKey);
}

export function getXiaoZhaoHexEnhance(allyTeam, activeBuffs, hexKey, log) {
    // 诊断：每个返回 null 的分支都推一条 fact（只有调用方传了 log 才推，如 core/205 的生成/销毁两条链）。
    //   下一次「姊拒马为什么消散」直接从战报看到断在哪一关。
    const fail = (reason) => {
        if (log) {
            // 契约必填 unitUid/camp（infra/107；渲染器只读 note，uid 供对账）：
            //   姊在队伍里（含阵亡/未附身）→ 锚她自己，真值；完全不在场 → 合成标识 'sisterHex:<hex>'。
            //   camp 一律取队伍真值，无队伍回落 ALLY。
            const sis = Array.isArray(allyTeam) ? allyTeam.find(u => u && u.isXiaoZhaoSister) : null;
            const teamCamp = (Array.isArray(allyTeam) && allyTeam[0] && allyTeam[0].camp) || CAMP_TYPES.ALLY;
            log.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: {
                unitName: '小昭·姊', unitUid: (sis && sis.uid) || ('sisterHex:' + hexKey), camp: (sis && sis.camp) || teamCamp,
                skillName: '海克斯增强', note: `🔎 姊强化未生效（${hexKey}）：${reason}`
            } });
        }
        return null;
    };
    if (globalThis.MING_ABLATION?.noSisterHex) return fail('831 消融实验室关闭姊版海克斯');
    // 判据放宽：存活，或正在附身（_butterflyHost 有值）。
    //   附身中她仍在队伍、alive 正常；放宽是为覆盖「宿主/克隆边界下只剩附身标记、alive 已被置假」的瞬时态。
    const xiaoZhao = findAlive(allyTeam, 'isXiaoZhaoSister')
        || (allyTeam || []).find(u => u && u.isXiaoZhaoSister && u.state && u.state._butterflyHost);
    if (!xiaoZhao) return fail('队伍里没有存活/附身中的小昭·姊');
    if (!hasBuff(activeBuffs, hexKey)) return fail(`团队没有生效中的 ${hexKey} buff`);
    const s = requireSkillParams('小昭', 'hexEnhance');
    if (!s[hexKey]) return fail('hexEnhance 数据缺该键');
    return s[hexKey];
}

// 查询注册
registerQuery('xiaoHexEnhance', getXiaoZhaoHexEnhance);
registerQuery('xiaoPermanentActive', isXiaoZhaoPermanentActive);
registerQuery('damageModifiers', applyDamageModifiers);

// 飞行·猎杀成长（全局机制，不属于某个角色）：每击杀 1 名敌人，攻击永久 +2；非必中单位同时
//   未命中率 +6 个百分点（getMissBreakdown 里 _missChanceBonus 按百分点直接相加）。
//   作用范围：双方飞行单位对称生效——敌方飞行击杀我方同样成长（老板口径 2026-11-09）；
//   排除项与改动前一致：只算杀敌（队友误伤不计）、杀者须存活且 role=FLYER。
//   必须经 registerRoundHook 每回合重挂：core/210 每回合 eventBus.clearAll()，顶层直接挂会第一回合后失效。
export function registerFlyerKillGrowth() {
    registerSettlementHook({
        when: SIGNAL_TYPES.ON_UNIT_DEATH,
        priority: L.ON_UNIT_DEATH.XIAO_CARRY_COUNT + 1,
        handler: (data) => {
            for (const dead of (data.deadUnits || [])) {
                if (dead.camp === CAMP_TYPES.ALLY) continue;        // 只算杀敌，队友误伤/自损不计
                const killerUid = dead.state && dead.state._killerUid;   // core/214 applyStatChange 致命伤害时写入
                if (!killerUid) continue;
                const all = [...(data.allySide || []), ...(data.enemySide || [])];
                const killer = all.find(u => u.uid === killerUid);
                if (!killer || !killer.alive || killer.role !== ROLE_TYPES.FLYER) continue;
                const atkBefore = getStat(killer, 'atk');
                const missBefore = killer.state._missChanceBonus || 0;
                addMod(killer, 'atk', { source: '飞行·猎杀', value: 2, ttl: 'permanent', group: 'flyerKill', op: 'add' });
                const neverMiss = !!killer.state._neverMiss;
                if (!neverMiss) killer.state._missChanceBonus = missBefore + 6;
                const atkAfter = getStat(killer, 'atk');
                const missAfter = killer.state._missChanceBonus || 0;
                // 战报 + 头顶 🦇 飘字（金钟罩同款 floatText 路径：从格子升起后淡出）。
                //   每次击杀独立一条，连续成长就连着升多个，不合并。
                pushSkillAnnounce(data.log, killer, '飞行·猎杀',
                    `🦇 ${killer.name} 飞行·猎杀（击杀 ${dead.name}）：攻击 ${fmtNum(atkBefore)} → ${fmtNum(atkAfter)}`
                    + (neverMiss ? '，未命中免疫（不叠加）' : `，未命中 +6%（累计 +${fmtNum(missAfter)}%）`),
                    {
                        floatText: '🦇', floatUid: killer.uid,
                        atkBefore, atkAfter, missChance: missAfter,
                        missDelta: neverMiss ? 0 : 6, neverMiss,
                        deadName: dead.name, deadUid: dead.uid
                    });
            }
        }
    });
}
registerRoundHook(registerFlyerKillGrowth);

// ═══════════════════════════════════════════════════════════════
// 张无忌专属 · 快来护驾（2026-11-13）
//   先算张无忌队当前空位 → 从明教带技能角色池筛「能落到锚点空位」的候选
//   → 随机抽 1 人 → 落位。
//   排除规则：① 已在队同名（不重复召唤）② 固定站位锚点不在空位里就排除
//   （寒离飒要 2 号位、小昭 4 号位、韦一笑 6 号位、金毛狮王谢逊 7 号位——来自 330 建队锚点）
//   姐姐：默认向右飞（_flyDirection），不弹窗。
// ═══════════════════════════════════════════════════════════════
export function summonZhangRescue(team, log) {
    if (!team || !team.length) return null;
    const occupied = new Set(team.filter(u => u.alive).map(u => u.pos));
    const freePositions = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(p => !occupied.has(p));
    if (freePositions.length === 0) return null;

    const usedNames = new Set(team.filter(u => u.alive).map(u => u.name));
    // 固定站位锚点（来自 modules/330 建队规则）：角色 → 必需位置
    const FIXED_ANCHOR = { '寒离飒': 2, '小昭·姊': 4, '小昭·妹': 4, '韦一笑': 6, '金毛狮王谢逊': 7, '张无忌': 5 };
    const gd = getGameData();
    const ROLE_POOL = [ROLE_TYPES.WARRIOR, ROLE_TYPES.DEFENDER, ROLE_TYPES.RANGED, ROLE_TYPES.FLYER, ROLE_TYPES.JAVELIN, '蝴蝶'];
    const candidates = Object.keys(gd.characters || {}).filter(n => {
        const ch = gd.characters[n];
        if (!ch || ch.camp !== '明教' || !ch.skills) return false;
        if (usedNames.has(n)) return false;
        // 姐姐/妹的基础名都是「小昭」，content key 是「小昭」，单独处理
        if (n === '小昭') return freePositions.includes(FIXED_ANCHOR['小昭·姊']);
        const anchor = FIXED_ANCHOR[n];
        if (anchor != null) return freePositions.includes(anchor);
        return true;
    });
    if (candidates.length === 0) return null;

    const rng = getBattleRng();
    const pickedName = candidates[rng.nextInt(0, candidates.length - 1)];
    const ch = gd.characters[pickedName];
    // content key 是「小昭」，实际建单位用「小昭·姊」
    const finalName = pickedName === '小昭' ? '小昭·姊' : pickedName;
    let landPos;
    if (finalName === '小昭·姊' || finalName === '小昭·妹') {
        landPos = 4;
    } else if (FIXED_ANCHOR[finalName] != null && freePositions.includes(FIXED_ANCHOR[finalName])) {
        landPos = FIXED_ANCHOR[finalName];
    } else {
        landPos = freePositions[rng.nextInt(0, freePositions.length - 1)];
    }
    const role = ch.role || (ch.tags || []).find(t => ROLE_POOL.includes(t)) || ROLE_TYPES.WARRIOR;
    const unit = spawnUnit(team, finalName, ch.m, role, landPos);
    if (finalName === '小昭·姊' && team._flyDirection == null) team._flyDirection = 'right';
    if (log) {
        log.push({ factType: FACT_TYPES.SUMMON_UNIT, data: {
            summonName: finalName, summonUid: unit.uid, pos: landPos,
            byName: '张无忌', byUid: (team.find(u => u.isZhang) || {}).uid || null
        } });
    }
    return unit;
}