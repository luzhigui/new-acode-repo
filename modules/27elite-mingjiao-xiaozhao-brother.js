// modules/27elite-mingjiao-xiaozhao-brother.js — 明教精英「小昭·妹」：组件工厂 + 蛛变/蜘蛛卵全套 + 死亡计数自注册
// V1.1.0 | ~24500 bytes | 2026-10-18 飞天落地回血按档位：飞天时记录 _spiderLandTier，供 spiderReturn 选回血比例
// V1.0.0 | ~24278 bytes | 2026-10-17 自 modules/27elite-mingjiao.js V7.1.7 拆出（纯搬移，零逻辑改动；组件工厂逐字迁入，集中注册留 barrel）
export const VER = 'modules/27elite-mingjiao-xiaozhao-brother.js V1.1.0';
import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { hasBuff } from '../core/03battle-utils.js';
import { spawnHorse } from '../core/05battle-horse.js';
import { spiderTransform, spiderReturn } from '../modules/20elite-skills.js';
import { emitEvent, applyStatChange, refreshMaxHp, getBattleRng, addMod, removeModsByGroup, getStat } from '../core/13battle-shared.js';
import { eventBus, EXECUTION_LAYER as L, registerSettlementHook } from '../infra/50-event-bus.js';
import { StateMachine } from '../infra/51-core-utils.js';
import { FACT_TYPES, BUFF_TYPES, UNIT_EVENT_TYPES, CAMP_TYPES, SIGNAL_TYPES, STATE_CHANGE_TYPES } from '../infra/56-battle-enums.js';
import { emitStateChange } from '../infra/59-state-change.js';
import { pushSkillAnnounce } from './23elite-helpers.js';
registerSettlementHook({ when: SIGNAL_TYPES.ON_UNIT_DEATH, priority: L.ON_UNIT_DEATH.XIAO_CARRY_COUNT, handler: (data) => {
    const bro = (data.allySide || []).find(u => u.isXiaoZhaoBrother && u.alive);
    if (!bro) return;
    const deaths = (data.deadUnits || []).filter(u => u.camp === CAMP_TYPES.ALLY).length;
    if (deaths <= 0) return;
    const d = bro.state._xiaoCarryDeaths || { cur: 0, r1: 0, r2: 0 };
    Object.assign(bro.state, { _xiaoCarryDeaths: { cur: d.cur + deaths, r1: d.r1, r2: d.r2 } });
}});
const SPIDER_TIER_REASON = { '70': '血量即将低于70%', '40': '血量即将低于40%', 'death': '即将阵亡', hatch: '蜘蛛孵化' };
function decideSpiderTier(state, maxHp, hpAfter, fp) {
    if (!state._spiderTriggered70 && hpAfter <= maxHp * fp.hpThresholds[0]) return '70';
    if (!state._spiderTriggered40 && hpAfter <= maxHp * fp.hpThresholds[1]) return '40';
    if (!state._spiderTriggeredDeath && hpAfter <= 0) return 'death';
    return null;
}
function markSpiderTier(state, tier) {
    if (tier === '70') state._spiderTriggered70 = true;
    else if (tier === '40') state._spiderTriggered40 = true;
    else if (tier === 'death') state._spiderTriggeredDeath = true;
    state._spiderTriggeredThisRound = true;
}
// 卵属性词条逆算：getStat = (base+addSum)×(1+mulSum)，令结果= targetVal 反推 add 词条值（孵化时按 group 整组移除恢复）
function eggModValue(unit, stat, targetVal) {
    const cur = getStat(unit, stat);
    let mulSum = 0;
    for (const m of (unit._mods && unit._mods[stat]) || []) if (m.op === 'mul') mulSum += m.value;
    return (targetVal - cur) / (1 + mulSum);
}

// 结茧（2026-10-13）：毒/反伤致死不走 BEFORE_DAMAGE_APPLY、飞天接不住 → ON_BEFORE_DEATH 清 _pendingDeath
//   取消死亡，原地变 0 攻 / eggDef 防 / 满血的卵（占格、不可行动、可被打碎=真死）。致死档在此落账。
function toSpiderEgg(u, outLog) {
    const fp = getSkillParams('小昭', 'spiderFly');
    if (!fp) throw new Error('缺技能参数: 小昭.spiderFly');
    u.state._pendingDeath = false;
    Object.assign(u.state, { _spiderEgg: true, _spiderEggRounds: 0, _spiderTriggeredDeath: true });
    // 结茧属性增量先算局部（体检第 88 轮转交：写进 announce fact 供数值对照器 SPIDER_EGG 契约做声明侧）
    const eggAtkDelta = eggModValue(u, 'atk', 0);
    const eggDefDelta = eggModValue(u, 'def', fp.eggDef);
    addMod(u, 'atk', { source: '蜘蛛卵', value: eggAtkDelta, ttl: 'permanent', group: 'spiderEgg', op: 'add' });
    addMod(u, 'def', { source: '蜘蛛卵', value: eggDefDelta, ttl: 'permanent', group: 'spiderEgg', op: 'add' });
    if (u.hp < u.maxHp) applyStatChange(u, 'hp', u.maxHp - u.hp, null, '蜘蛛结茧', false, false);
    emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: getStat(u, 'atk'), def: getStat(u, 'def') });
    pushSkillAnnounce(outLog, u, '蜘蛛卵', `🥚 ${u.name} 原地结茧：0 攻 / ${fp.eggDef} 防 / 满血，不可行动（打碎即死）`, { floatText: '🥚', floatUid: u.uid, eggAtkDelta, eggDefDelta });
}

// 孵化（2026-10-13）：卵挺过「本回合+下回合」两个回合末 → 保留 eggHatchHpRatio 血、攻防恢复死亡前、
//   三档全作废（再死=真死），直接飞天 → 落地蛛袭（spiderReturn 自带随机目标；_spiderEggHatch 跳过落地回血）
function hatchSpiderEgg(u, outLog) {
    const fp = getSkillParams('小昭', 'spiderFly');
    if (!fp) throw new Error('缺技能参数: 小昭.spiderFly');
    Object.assign(u.state, {
        _spiderEgg: false, _spiderEggUsed: true, _spiderEggHatch: true, _spiderRemaining: 0,
        _spiderTriggered70: true, _spiderTriggered40: true, _spiderTriggeredDeath: true
    });
    removeModsByGroup(u, 'spiderEgg');
    const targetHp = Math.floor(u.maxHp * fp.eggHatchHpRatio);
    if (u.hp > targetHp) applyStatChange(u, 'hp', -(u.hp - targetHp), null, '蜘蛛孵化', false);
    emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: getStat(u, 'atk'), def: getStat(u, 'def') });
    pushSkillAnnounce(outLog, u, '蜘蛛孵化', `🕷️ ${u.name} 破茧孵化：保留 ${Math.round(fp.eggHatchHpRatio * 100)}% 血、攻防恢复，直接飞天！`, { floatText: '🕷️', floatUid: u.uid });
    const fsm = u._fsm;
    if (fsm && fsm.is('normal')) {
        const flyData = { tier: 'hatch', reason: SPIDER_TIER_REASON.hatch, incomingDmg: 0, log: outLog };
        fsm.transition('flying', flyData);
        if (flyData._flyFactData) outLog.push({ factType: FACT_TYPES.SPIDER_FLY, data: flyData._flyFactData });
        if (fsm.is('flying')) fsm.transition('descending', { log: outLog });
        if (fsm.is('descending')) fsm.transition('normal');
    }
}

// 小昭·妹
export function createXiaoZhaoBrotherComponent() {
    return {
        name: '小昭·妹',
        _buildFsm(brother, A, B, log) {
            const comp = this;
            const states = {
                normal: {
                    onEnter() {},
                    onExit() {}
                },
                transforming: {
                    onEnter() {
                        spiderTransform(brother, log);
                    },
                    onExit() {}
                },
                flying: {
                    onEnter(data) {
                        const currentLog = (data && data.log) ? data.log : log;
                        const incomingDmg = data ? data.incomingDmg : 0;
                        // 飞天次数上限唯一来源：内容表 小昭.spiderFly.params（core/17 state 默认值只是镜像）
                        const flyParams = getSkillParams('小昭', 'spiderFly');
                        if (!flyParams) throw new Error('缺技能参数: 小昭.spiderFly');
                        // 档位消费（2026-10-13）：档位由 decideSpiderTier 在触发点算好随 data.tier 带入，这里只落账；
                        //   hatch（蜘蛛孵化）不占档——孵化时三档已全作废
                        const tier = (data && data.tier) || 'death';
                        const reason = (data && data.reason) || SPIDER_TIER_REASON[tier];
                        markSpiderTier(brother.state, tier);
                        // 落地回血档位：记下本次飞天档，spiderReturn 依此选 landHealRatio / landHealRatioDeath
                        brother.state._spiderLandTier = tier;
                        const esRemaining = brother.state._spiderRemaining;
                        Object.assign(brother.state, { _spiderRemaining: Math.max(0, (esRemaining ?? flyParams.maxTriggers) - 1) });
                        Object.assign(brother.state, { _spiderFlying: true, _flyMode: 'spider' });
                        brother.state._acted = true;
                        emitEvent(brother, UNIT_EVENT_TYPES.HP_CHANGE, { hp:brother.hp, maxHp:brother.maxHp, alive:brother.alive, atk:brother.atk, def:brother.def, _flyMode:'spider', _spiderFlying:true });
                        emitStateChange(brother, STATE_CHANGE_TYPES.FLYING, { reason, incomingDmg }, currentLog);
                        // 飞天事实随 transition data 携带（不落 unit），由免疫声明/log 消费
                        data._flyFactData = { unitName: brother.name, spiderUid: brother.uid, reason, incomingDmg, remaining: brother.state._spiderRemaining };
                    },
                    onExit() {
                        Object.assign(brother.state, { _spiderFlying: false, _flyMode: null });
                        brother.state._acted = false;
                    }
                },
                descending: {
                    onEnter(data) {
                        spiderReturn(brother, A, B, (data && data.log) ? data.log : log);
                    },
                    onExit() {}
                },
                dead: {
                    onEnter() {},
                    onExit() {}
                }
            };
            const fsm = new StateMachine(states, 'normal', {
                normal: ['flying', 'transforming'],
                transforming: ['normal'],
                flying: ['descending'],
                descending: ['normal'],
                dead: []
            }, (s) => { brother.state._fsmPhase = s; });
            brother.state._fsmPhase = 'normal';
            return fsm;
        },
        register(eventBus, A, B, log) {
            const brother = A.find(u => u.isXiaoZhaoBrother && u.alive);
            if (!brother) return;
            const fsm = this._buildFsm(brother, A, B, log);
            brother._fsm = fsm;
            // 蛛化飞天免疫：落点判据三档（顺延见 decideSpiderTier 注释），免疫本次伤害
            function submitSpiderFlyDeclaration(data) {
                if (data.target.uid !== brother.uid || !data.A) return;
                if (fsm.is('flying') || fsm.is('dead')) return;
                if (brother.state._spiderEgg) return;
                const fp = getSkillParams('小昭', 'spiderFly');
                if (!fp) throw new Error('缺技能参数: 小昭.spiderFly');
                const hpAfter = Math.max(0, brother.hp - (data.dmg || 0));
                const tier = decideSpiderTier(brother.state, brother.maxHp, hpAfter, fp);
                if (tier) {
                    if (!data.declarations) data.declarations = [];
                    const flyData = { tier, reason: SPIDER_TIER_REASON[tier], incomingDmg: data.dmg, log: data.log || log };
                    fsm.transition('flying', flyData);
                    data.declarations.push({ immune: true, flyData: flyData._flyFactData || null, reason: flyData._flyFactData ? null : '🕷️ 飞天：免疫本次伤害' });
                }
            }
            eventBus.on(SIGNAL_TYPES.BEFORE_DAMAGE_APPLY, L.BEFORE_DAMAGE_APPLY.SPIDER_IMMUNE, (data) => {
                submitSpiderFlyDeclaration(data);
            });
            // 飞天/蜘蛛卵状态跳过行动（卵不可行动，老板定稿）
            function submitSpiderSkipDeclaration(data) {
                if (!data.unit.isXiaoZhaoBrother || !data.unit.alive) return;
                if (fsm.is('flying') || fsm.is('dead') || data.unit.state._spiderEgg) {
                    data.declaration.skip = true;
                }
            }
            // 永久惑心：小昭·妹在场时敌方攻击 15% 概率误伤
            function submitSpiderMindControlDeclaration(data) {
                if (data.unit.camp !== CAMP_TYPES.ENEMY) return;
                if (!brother || !brother.alive || !brother.state._permanentBuffs || !brother.state._permanentBuffs.some(b => b.key === BUFF_TYPES.MIND_CONTROL)) return;
                if (hasBuff(data.enemySide._activeBuffs, BUFF_TYPES.MIND_CONTROL)) return;
                if (getBattleRng().next() < CONFIG.SPIDER_MIND_CONTROL_CHANCE) {
                    const fakeTarget = data.allySide.find(u => u.alive && !u.isHorse && u.uid !== data.unit.uid);
                    if (fakeTarget) {
                        data.declaration.targetResult = fakeTarget;
                        // 2026-10-11 去名字字面量：deceiver 用本人名，另打 deceiverIsSpider 供渲染层分支
                        //   （render/35 原先拿 fact.deceiver === '小昭·妹' 判蝶舞迷心，渲染层不该认英雄名）
                        data.declaration.phantomFact = { factType: FACT_TYPES.PHANTOM_CONFUSE, data: { unitName: data.unit.name, deceiver: brother.name, deceiverIsSpider: true, targetName: fakeTarget.name } };
                    }
                }
            }
            // 蛛落：回合结束从天而降并攻击
            function submitSpiderDescendDeclaration(data) {
                const bro = A.find(u => u.isXiaoZhaoBrother && u.alive && u.state._spiderFlying);
                if (bro && bro._fsm && bro._fsm.is('flying')) {
                    if (!data.declarations) data.declarations = [];
                    data.declarations.push({ type: 'spiderDescend', unit: bro, A, B, log: data.log });
                }
            }
            // 蛛变：每回合随机变职业并结算永久海克斯（蜘蛛卵期间冻结：不蛛变不召唤）
            function submitSpiderTransformDeclaration(data) {
                const { A, B, log } = data;
                const bro = A.find(u => u.isXiaoZhaoBrother && u.alive);
                if (!bro) return;
                // 2026-10-15 结茧冻结也要滚动/掷骰（回合对齐不断档）：死亡桶 r2←r1←cur←0；
                //   妹永久圣火令按全局同口径掷 atkCols 列 + defRows 行（core/14 _Brother 读此命中判）
                const dd = bro.state._xiaoCarryDeaths || { cur: 0, r1: 0, r2: 0 };
                Object.assign(bro.state, { _xiaoCarryDeaths: { cur: 0, r1: dd.cur, r2: dd.r1 } });
                if (bro.state._permanentBuffs?.some(b => b.key === BUFF_TYPES.HOLY_FLAME)) {
                    const hf = CONFIG.BUFFS.holyFlame;
                    const rng = getBattleRng();
                    const cols = [];
                    while (cols.length < hf.atkCols) { const c = rng.nextInt(1, 3); if (!cols.includes(c)) cols.push(c); }
                    const rows = [];
                    while (rows.length < hf.defRows) { const r = rng.nextInt(1, 3); if (!rows.includes(r)) rows.push(r); }
                    Object.assign(bro.state, { _xiaoHolyFlame: { cols: cols.sort((x, y) => x - y), rows: rows.sort((x, y) => x - y) } });
                }
                if (bro.state._spiderEgg) return;
                if (bro._fsm && bro._fsm.is('normal')) bro._fsm.transition('transforming');
                if (bro._fsm && bro._fsm.is('transforming')) bro._fsm.transition('normal');
                if (bro.state._spiderTriggeredHit === undefined) Object.assign(bro.state, { _spiderTriggeredHit: false });
                if (bro.state._spiderTriggered70 === undefined) Object.assign(bro.state, { _spiderTriggered70: false });
                if (bro.state._spiderTriggered40 === undefined) Object.assign(bro.state, { _spiderTriggered40: false });
                Object.assign(bro.state, { _spiderTriggeredThisRound: false });
                const teamHasHorse = hasBuff(A._activeBuffs, BUFF_TYPES.HORSE_FORMATION);
                const hasPermanent = bro.state._permanentBuffs?.some(b => b.key === BUFF_TYPES.HORSE_FORMATION);
                if (!teamHasHorse && hasPermanent) {
                    const xzHorse = spawnHorse(A, log, B, true);
                    if (xzHorse) {
                        log.push({ factType: FACT_TYPES.XIAO_ZHAO_HORSE, data: { pos: xzHorse.pos, horseUid: xzHorse.uid } });
                    }
                }
                const hasTeamCarry = hasBuff(A._activeBuffs, BUFF_TYPES.CARRY);
                // 2026-10-15 永久 carry 改「每回合刷新一轮」（老板拍板）：不再一次性常驻 +3/+4/+20——
                //   层数 = 1 + 2×(上回合己方阵亡数) + 1×(上上回合阵亡数)，每层调用精通参数
                //   （小昭.mastery 的 atkPer/defPer/hpPer，不写死）。ttl:'round' 由回合开始清理、此处重挂
                //   （清理先于蛛变声明，无空窗）。原 V7.0.3 carryApplied 去重门控作废——无限叠加是
                //   permanent 挂法特有问题，round 挂法天然消除。
                if (!hasTeamCarry && bro.state._permanentBuffs?.some(b => b.key === BUFF_TYPES.CARRY)) {
                    const d = bro.state._xiaoCarryDeaths;
                    const layers = 1 + 2 * d.r1 + d.r2;
                    const per = getSkillParams('小昭', 'mastery');
                    if (!per) throw new Error('缺技能参数: 小昭.mastery');
                    addMod(bro, 'atk', { source: '小昭·妹永久carry', value: per.atkPer * layers, ttl: 'round', group: 'xiaoZhaoCarry', op: 'add' });
                    addMod(bro, 'def', { source: '小昭·妹永久carry', value: per.defPer * layers, ttl: 'round', group: 'xiaoZhaoCarry', op: 'add' });
                    addMod(bro, 'maxHp', { source: '小昭·妹永久carry', value: per.hpPer * layers, ttl: 'round', group: 'xiaoZhaoCarry', op: 'add' });
                    refreshMaxHp(bro, null, '小昭·妹永久carry');
                    log.push({ factType: FACT_TYPES.XIAO_ZHAO_CARRY_APPLY, data: { unitName: bro.name, unitUid: bro.uid, camp: bro.camp, layers, atk: per.atkPer * layers, def: per.defPer * layers, maxHp: per.hpPer * layers } });
                }
            }
            // 永久双击：小昭·妹 80% 概率额外攻击一次
            function submitXiaoZhaoDoubleStrikeDeclaration(data) {
                const { unit, target, log } = data;
                if (!unit.isXiaoZhaoBrother || !unit.alive || unit.state._xiaoZhaoDoubleStriked) return;
                if (!unit.state._permanentBuffs || !unit.state._permanentBuffs.some(b => b.key === BUFF_TYPES.DOUBLE_STRIKE)) return;
                if (hasBuff(A._activeBuffs, BUFF_TYPES.DOUBLE_STRIKE)) return;
                const s = getSkillParams('小昭', 'spiderFly');
                if (!s) throw new Error('缺技能参数: 小昭.spiderFly');
                // 概率口径 1 = 100%，比较前 ×100 回到百分点域（骰子仍是 nextInt(1, 100)）
                const chancePct = s.xiaoZhaoDoubleStrikeChance * 100;
                if (getBattleRng().nextInt(1, 100) <= chancePct) {
                    Object.assign(unit.state, { _xiaoZhaoDoubleStriked: true });
                    log.push({ factType: FACT_TYPES.SPIDER_DOUBLE_STRIKE, data: {} });
                    if (!data.extraRequests) data.extraRequests = [];
                    data.extraRequests.push({
                        unit,
                        // 2026-09-22 同 doubleStrike：原目标同击致死后 alive 仍 true，须连 _pendingDeath 一起判，
                        //   否则把待死 uid 锁给第二次攻击 → 白跳
                        targetUid: (target && target.alive && !target.state._pendingDeath) ? target.uid : null,
                        reason: 'xiaoZhaoDoubleMiss',
                        actedMode: 'allow',
                        priority: 30
                    });
                }
            }
            eventBus.on(SIGNAL_TYPES.BEFORE_ACTION_SELECT, L.BEFORE_ACTION.SPIDER_SKIP, (data) => {
                submitSpiderSkipDeclaration(data);
            });
            eventBus.on(SIGNAL_TYPES.BEFORE_SELECT_TARGET, L.BEFORE_SELECT_TARGET.PERMANENT_MIND_CONTROL, (data) => {
                submitSpiderMindControlDeclaration(data);
            });
            eventBus.on(SIGNAL_TYPES.ON_ROUND_END, L.ROUND_END.SPIDER_RETURN, (data) => {
                submitSpiderDescendDeclaration(data);
            });
            // 蜘蛛卵（2026-10-13）：毒/反伤致死 → 结茧续命。正常攻击致死走致死档飞天、到不了这里；
            //   打碎的卵（_spiderEgg）/ 本局结过茧（_spiderEggUsed）/ 致死档已花（_spiderTriggeredDeath）= 真死
            eventBus.on(SIGNAL_TYPES.ON_BEFORE_DEATH, L.ON_BEFORE_DEATH.SPIDER_EGG, (data) => {
                for (const u of data.units) {
                    if (!u.isXiaoZhaoBrother || !u.alive) continue;
                    if (u.state._spiderEgg || u.state._spiderEggUsed || u.state._spiderTriggeredDeath) continue;
                    toSpiderEgg(u, data.log);
                }
            });
            // 卵计时（2026-10-15 V7.1.1 修）：ON_ROUND_END 在 core/11 L459 是「每个单位行动完就发一次」（forced:false），
            //   原先照收会同一回合内凑满 2 → 当回合孵化；改为只认真回合末（forced:true = core/11 L536 finalizeRoundEnd，
            //   每回合恰一次）——结茧当回合末 +1、下一回合末 +2 → 先于蛛落（SPIDER_RETURN:10）孵化
            eventBus.on(SIGNAL_TYPES.ON_ROUND_END, L.ROUND_END.SPIDER_EGG, (data) => {
                if (!data.forced) return;
                const bro = A.find(u => u.isXiaoZhaoBrother && u.alive && u.state._spiderEgg);
                if (!bro) return;
                bro.state._spiderEggRounds = (bro.state._spiderEggRounds || 0) + 1;
                if (bro.state._spiderEggRounds >= 2) hatchSpiderEgg(bro, data.log || log);
            });
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, L.ROUND_START.SPIDER_TRANSFORM, (data) => {
                submitSpiderTransformDeclaration(data);
            });
            eventBus.on(SIGNAL_TYPES.AFTER_MISS, L.AFTER_MISS.PERMANENT_DOUBLE_RETRY, (data) => {
                submitXiaoZhaoDoubleStrikeDeclaration(data);
            });
        },
        executeFly(unit, incomingDmg, A, log) {
            if (!unit.isXiaoZhaoBrother || !unit.alive || unit.state._spiderEgg) return false;
            const fsm = unit._fsm;
            if (!fsm || !fsm.is('normal')) return false;
            const fp = getSkillParams('小昭', 'spiderFly');
            if (!fp) throw new Error('缺技能参数: 小昭.spiderFly');
            // 2026-10-13 与 submitSpiderFlyDeclaration 共用落点判据（顺延语义一致）
            const hpAfter = Math.max(0, unit.hp - (incomingDmg || 0));
            const tier = decideSpiderTier(unit.state, unit.maxHp, hpAfter, fp);
            if (!tier) return false;
            const flyData = { tier, reason: SPIDER_TIER_REASON[tier], incomingDmg, log };
            fsm.transition('flying', flyData);
            if (flyData._flyFactData && log) {
                log.push({ factType: FACT_TYPES.SPIDER_FLY, data: flyData._flyFactData });
            }
            return true;
        },
        executeDescend(unit, A, B, log) {
            const fsm = unit._fsm;
            if (fsm && fsm.is('flying')) {
                fsm.transition('descending', { log });
                if (fsm.is('descending')) fsm.transition('normal');
            }
        },
        onAfterApplyDamage(unit) {
            if (!unit.isXiaoZhaoBrother || !unit.alive) return;
        }
    };
}

// 金毛狮王谢逊（明教 · 站 7 号位）：召唤幼狮 / 幼狮成长 / 雄狮振奋 / 母狮随动
// 2026-09-22 新增；2026-09-23 改版：删「替死 / 集火 / 狮吼」，狮子改为一条成长链——
//   召唤幼狮 → ON_ROUND_START 每回合 prob 概率随机空位 1 只（攻=0 故打不出伤害，轮到它走休息通道回血；
//               被振奋抬到攻>0 后会正常出手，职业是防战 → core/12 走防战公式）
//   幼狮成长 → ON_ROUND_START 上一回合留下的幼狮按所在位置成形（1-6 雄狮 / 7-9 母狮）
//   雄狮振奋 → AFTER_DAMAGE_APPLIED：雄狮命中后，己方全体存活角色永久 +atkPerHit 攻
//   母狮随动 → AFTER_DAMAGE_APPLIED：母狮命中后，其他雄狮/母狮与谢逊各随动攻击一次（目标同母狮）
