// V6.4.7 | 2026-11-07 第 184 轮：① 新增 killUnit —— 死亡收口唯一出口（ignoreCap=true + recordHpAudit
//          group='death' + _pendingDeath），finalizeDeaths / maxHp 变更致死改调它；applyStatChange 的
//          ignoreCap 变成 killUnit 专用。② 飞天/附身判据改调 core/203 isAirborne（本地内联删除）。
export const VER = 'core/214-battle-shared.js V6.4.8';

import { CONFIG } from './201-config-5v5-test.js';   // getSkillParams 随 checkZhangSwitch 迁 modules/27，此处成死 import 已清
import { pushBattleEvent } from '../infra/102-core-utils.js';
import { FACT_TYPES, UNIT_EVENT_TYPES, ROLE_TYPES, STATE_CHANGE_TYPES } from '../infra/106-battle-enums.js';
import { emitStateChange } from '../infra/108-state-change.js';
import { isAirborne } from './203-battle-utils.js';   // 飞天/附身判据全库唯一一份（第 184 轮收口）
const C = CONFIG;

// 战斗统计统一记账入口（唯一入口）。承伤记 rawAmount（减免前全额），
// 输出记 actualAmount（clamp 后）。禁止绕过此函数直接改统计字段。
function recordCombatStat(source, target, type, opts = {}) {
    if (!target || !target.alive) return;
    const rawAmount = opts.rawAmount ?? opts.actualAmount ?? 0;
    const actualAmount = opts.actualAmount ?? 0;

    switch (type) {
        case 'damage':
            // 承伤 = 来袭全额（防御减免前总量）；输出 = 实际损血量（clamp 后）
            target.dmgTaken += Math.abs(rawAmount);
            if (actualAmount > 0 && source) {
                source.dmgDealt = (source.dmgDealt || 0) + actualAmount;
            }
            break;

        case 'heal':
            // 治疗记产出者（source 优先，无 source 记自己），溢出治疗不记
            if (actualAmount > 0) {
                (source || target).healDone += actualAmount;
            }
            break;

        case 'rebound':
            // 反弹：source 记 reboundDone，target 记承伤
            if (source) {
                source.reboundDone = (source.reboundDone || 0) + Math.abs(rawAmount);
            }
            target.dmgTaken += Math.abs(rawAmount);
            break;

        case 'leech':
            // 吸血：治疗记 source，leechDone 也记 source
            if (source) {
                source.healDone += actualAmount;
                source.leechDone = (source.leechDone || 0) + actualAmount;
            }
            break;

        case 'dodge':
            // 闪避：承伤 = 来袭攻击力（rawAmount），无实际输出
            target.dmgTaken += Math.abs(rawAmount);
            break;

        case 'immuneRollback':
            // 免疫回退：承伤已记，只退输出
            if (source && actualAmount > 0) {
                source.dmgDealt = Math.max(0, (source.dmgDealt || 0) - actualAmount);
            }
            break;

        default:
            break;
    }
    if (source && source.uid !== target.uid && (type === 'damage' || type === 'heal' || type === 'rebound' || type === 'leech')) {
        emitCoreEvent(source, UNIT_EVENT_TYPES.HP_CHANGE, {
            hp: source.hp, maxHp: source.maxHp, alive: source.alive,
            atk: source.atk, def: source.def, _isDead: source.state?._isDead || false,
            dmgDealt: source.dmgDealt, healDone: source.healDone,
            reboundDone: source.reboundDone, leechDone: source.leechDone
        });
    }
}

function emitFullUnitState(unit, eventType) {
    emitCoreEvent(unit, eventType, {
        uid: unit.uid,
        name: unit.name,
        role: unit.role,
        camp: unit.camp,
        pos: unit.pos,
        hp: unit.hp,
        maxHp: unit.maxHp,
        atk: unit.atk,
        def: unit.def,
        alive: unit.alive,
        isHorse: unit.isHorse || false,
        _isDead: unit.state._isDead || false,
        _baseAtk: unit.state._baseAtk,
        _baseDef: unit.state._baseDef,
        _baseMaxHp: unit.state._baseMaxHp,
        _initAtk: unit.state._initAtk,
        _initDef: unit.state._initDef,
        _initMaxHp: unit.state._initMaxHp,
        _hpDmgRatio: unit.state._hpDmgRatio,
        _originalPos: unit.state._originalPos
    });
}

let _battleRng = null;
export function setBattleRng(rng) { _battleRng = rng; }
export function getBattleRng() { return _battleRng; }

// 表现 RNG：只服务台词/击杀台词这类纯表演，与战斗 RNG 独立序列。
// 由 createRoundStepper 用同一 seed 派生注入，改台词池大小不再污染战斗随机流。
// 未注入时回退到战斗 RNG，保证老调用路径不崩。
let _presentationRng = null;
export function setPresentationRng(rng) { _presentationRng = rng; }
export function getPresentationRng() { return _presentationRng || _battleRng; }

function finalizeDeaths(team) {
    for (const u of team) {
        if (u.hp <= 0 && u.alive) {
            killUnit(u, null, '死亡结算');
            u.alive = false;
            u.state._isDead = true;
            if (!u.state._deathTime) u.state._deathTime = Date.now();
            emitCoreEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: false, atk: u.atk, def: u.def, _isDead: true });
        }
    }
}

function getNextAvailableUnit(team) {
    return team.filter(c => c.alive && !c.state._acted).sort((a, b) => a.pos - b.pos)[0] || null;
}

function swapUnitPositions(unitA, unitB, log) {
    if (!unitA || !unitB) return false;
    // 控制位移免疫（寒离飒·开局常驻）：惑心换位等一切换位对免疫者不生效——只掉血不动窝
    // 返回布尔：原静默 return 让调用方在换位失败时照发"换位成功"战报（体检 114 家族案）。
    if ((unitA.state && unitA.state._ctrlImmune) || (unitB.state && unitB.state._ctrlImmune)) return false;
    const posA = unitA.pos;
    const posB = unitB.pos;
    unitA.pos = posB;
    unitB.pos = posA;
    // emitEvent 只是导出别名，模块内部必须用真实函数名 emitCoreEvent
    emitCoreEvent(unitA, UNIT_EVENT_TYPES.POS_CHANGE, { pos: posB });
    emitCoreEvent(unitB, UNIT_EVENT_TYPES.POS_CHANGE, { pos: posA });
    emitStateChange(unitA, STATE_CHANGE_TYPES.POSITION, { fromPos: posA, toPos: posB }, log);
    emitStateChange(unitB, STATE_CHANGE_TYPES.POSITION, { fromPos: posB, toPos: posA }, log);
    return true;
}

function moveUnitPosition(unit, newPos, log) {
    if (!unit || newPos == null) return false;
    // 免疫也挡"移动"分支：原只挡 swap，唐文亮拽免疫者且前排空着时走 move 分支 → 硬拽走、免疫破功
    //   （体检 114 家族案的反向洞）。返回布尔供调用方照实报幕。
    if (unit.state && unit.state._ctrlImmune) return false;
    const oldPos = unit.pos;
    unit.pos = newPos;
    // 同上：模块内部用 emitCoreEvent，不用导出别名 emitEvent
    emitCoreEvent(unit, UNIT_EVENT_TYPES.POS_CHANGE, { pos: newPos });
    emitStateChange(unit, STATE_CHANGE_TYPES.POSITION, { fromPos: oldPos, toPos: newPos }, log);
    return true;
}

// 击退 / 眩晕统一判定（乘风突袭、胖远桥·年轻气盛共用）：
//   目标后方一格（pos+3）可用 → 击退：有人则换位、无人则移动；
//   越界（7/8/9 号位往后推）→ 退无可退，改为眩晕一回合（_stunned 回合级，回合开始自动清）。
//   V7.5.15 身后格被「天上/附身单位」占着 → 同样退无可退 → 眩晕（老板定调：飞天/附身
//   期间原格保留、不被换位——旧版 find 只查 pos+alive，会把天上的蝶蛛拽去换位。判据与核心循环
//   getFronts / 惑心换位同口径：_spiderFlying / _flyMode 蝶蛛 / _butterflyHost / FSM attached·flying）。
// team 必须是目标自己那一队（换位/落点判断都在本队内找）。
function resolvePushOrStun(target, team, log, label) {
    if (!target || !target.alive) return;
    // 控制位移免疫（寒离飒·开局常驻）：击退/撞晕都不吃（乘风突袭、胖远桥、拒马蛛同走此门）
    if (target.state && target.state._ctrlImmune) return;
    const behindPos = target.pos + 3;
    const behindUnit = behindPos <= 9 ? team.find(u => u.pos === behindPos && u.alive) : null;
    // 附身占位可被挤开（老板 2026-11 定调）：蝶形态（_flyMode='butterfly' / _butterflyHost 有值）
    //   虽算 isAirborne，但她那一格是「附身占位」不是实心人墙 → 走换位，占位被挤到目标原格，
    //   附身结束飞回正好落在被挤到的位置。其余飞天态（蛛飞 / FSM flying）仍视为实心、不给换位。
    const behindIsAttachPlaceholder = !!(behindUnit && behindUnit.state
        && (behindUnit.state._butterflyHost || behindUnit.state._fsmPhase === 'attached'));
    const behindBlockedByAir = behindPos <= 9 && !!behindUnit && isAirborne(behindUnit) && !behindIsAttachPlaceholder;
    if (behindPos <= 9 && !behindBlockedByAir) {
        const oldPos = target.pos;
        if (behindUnit) {
            const behindOldPos = behindUnit.pos;
            // 身后格站着免疫者 = 推不动 → 与"退无可退"同语义，落到下面眩晕分支，不写假 PUSH 战报
            if (swapUnitPositions(target, behindUnit, log)) {
                log.push({ factType: FACT_TYPES.WIND_ASSAULT_PUSH, data: { label, target: { uid: target.uid, name: target.name }, behindUnit: { uid: behindUnit.uid, name: behindUnit.name }, oldPos, behindPos, behindOldPos } });
                return;
            }
        } else if (moveUnitPosition(target, behindPos, log)) {
            log.push({ factType: FACT_TYPES.WIND_ASSAULT_PUSH, data: { label, target: { uid: target.uid, name: target.name }, behindUnit: null, oldPos, behindPos } });
            return;
        }
    }
    target.state._stunned = true;
    emitCoreEvent(target, UNIT_EVENT_TYPES.HP_CHANGE, { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: getStat(target, 'atk'), def: getStat(target, 'def'), _stunned: true });
    emitStateChange(target, STATE_CHANGE_TYPES.STUNNED, {}, log);
    log.push({ factType: FACT_TYPES.PUSH_STUN, data: { label, target: { uid: target.uid, name: target.name }, pos: target.pos } });
}

function emitCoreEvent(unit, eventType, payload) {
    pushBattleEvent({ unitUid: unit.uid, eventType, payload });
}

// 治疗预演：返回「这次治疗实际能落多少」，口径与 applyStatChange 内部完全一致
//   （截脉 → 寒毒抑疗 → maxHp 溢出夹取）。所有治疗类 factData / 文案 / 飘字都该用它，
//   否则声明值会被打折落地，出现「战报写 +42、血条只跳 +21」的假账。
// 注意：同一帧连续多次治疗时，后一次的可用空间按「前一次已落」计算——调用方按声明顺序调即可。
function previewHeal(target, raw, rawOnly = false) {
    if (!target || !(raw > 0)) return 0;
    let applied = raw;
    const st = target.state;
    if (st && st._jinMai && st._jinMai.rounds > 0) applied = Math.round(applied * st._jinMai.ratio);
    if (st) {
        const xp = st._xuanmingPoison, hd = st._hlsHanDu;
        const poisoned = (xp && xp.remaining > 0 && (xp.stacks || 1) > 0)
            || (hd && hd.remaining > 0 && (hd.stacks || 1) > 0);
        if (poisoned) applied = Math.round(applied * C.XUANMING_POISON_HEAL_REDUCE);
    }
    // rawOnly=true：只打折、不夹 maxHp 溢出——供「满血转护盾」类机制拿应发额度
    if (rawOnly) return Math.max(0, Math.floor(applied));
    return Math.max(0, Math.floor(Math.min(applied, target.maxHp - target.hp)));
}

// isHeal=false：本次 hp 抬升不是「治疗/吸血回复」语义（形态变换、生命上限同步、伤害回退、复活落账），
//   不吃杨逍截脉的减疗。默认 true = 正常治疗语义。
// ignoreCap=true：**只由 killUnit 使用**——死亡收口的「把血归零」不是一次受伤，不吃 _dmgCap
//   （否则被截在 0 以上 → 出现 alive=false 却 hp=97 的分裂状态；fuzz s76/r35 平局清算即此路径）。
//   任何其它直扣血出口都不得传 true，否则 _dmgCap 形同废止。
function applyStatChange(target, field, delta, source, reason, record = true, isHeal = true, ignoreCap = false) {
    if (delta === 0 || !target || !target.alive) return false;
    // 天上无敌：小昭·妹飞天期间免疫一切 hp 伤害（正规攻击另有 BEFORE_DAMAGE_APPLY 免疫声明，
    //   这里兜住毒/反弹/自伤这类直扣血路径）。只挡掉血不挡治疗。
    if (field === 'hp' && delta < 0 && target.state && target.state._spiderFlying) return false;
    // 杨逍·点穴截脉（反治疗）：被点穴目标眩晕解除后 rounds 回合内，受到的治疗/吸血回复按 ratio 打折。
    //   单点收口在所有 hp 正向落账处——全库 10+ 个治疗出口（吸血/回血/生生不息/快乐回血/飞行再生/休息回复/
    //   反弹回复/乾坤衍生…），逐个改必漏；ratio 与 rounds 由 modules 侧从 content 写进 _jinMai，此处只读。
    let applied = delta;
    // 单次受伤上限（庄铮·断锤三式，字段 _dmgCap 单一来源）：收口所有直扣血出口
    //   （毒/反弹/真伤/自伤）。正规攻击路径会先在 core/12 applyAttackResult 截断 hpLoss，
    //   那里必须在死亡标记之前截，故两处都读同一字段、只各截一次。
    if (field === 'hp' && delta < 0 && !ignoreCap && target.state && target.state._dmgCap > 0) {
        applied = Math.max(delta, -target.state._dmgCap);
    }
    // 打折口径收口到 previewHeal（公式单点维护，文案/飘字同源）。
    //   注意这里不夹 maxHp 溢出——applyStatChange 下面本来就会夹，重复夹会改变「溢出前」的中间值。
    if (isHeal && field === 'hp' && delta > 0) {
        applied = delta;
        if (target.state && target.state._jinMai && target.state._jinMai.rounds > 0) {
            applied = applied * target.state._jinMai.ratio;
        }
        if (target.state) {
            const xp = target.state._xuanmingPoison;
            const hd = target.state._hlsHanDu;
            const poisoned = (xp && xp.remaining > 0 && (xp.stacks || 1) > 0)
                || (hd && hd.remaining > 0 && (hd.stacks || 1) > 0);
            if (poisoned) applied = applied * C.XUANMING_POISON_HEAL_REDUCE;
        }
    }
    const oldVal = target[field];
    // 实数累加：内部不再截到 0.1 格（面板只显示取整值，见 infra/102 fmtNum）
    const stepped = target[field] + applied;
    target[field] = field === 'hp' ? Math.min(target.maxHp, Math.max(0, stepped)) : stepped;
    if (field === 'hp' || field === 'maxHp') target[field] = Math.max(0, target[field]);
    if (field === 'hp' && record) {
        // 承伤记全额，输出记实际值；治疗记产出者，溢出不记
        const actualDelta = target.hp - oldVal;
        if (delta < 0) {
            recordCombatStat(source, target, 'damage', {
                rawAmount: Math.abs(delta),
                actualAmount: Math.abs(actualDelta)
            });
        } else if (actualDelta > 0) {
            recordCombatStat(source, target, 'heal', {
                actualAmount: actualDelta
            });
        }
    }
    if (field === 'hp' && target.hp <= 0) {
        target.state._pendingDeath = true;
        if (!target.state._deathTime) target.state._deathTime = Date.now();
        // 击杀者记账（唐文亮·同归于尽反噬击杀者用）：存 uid 不存引用（战报快照深拷/JSON 序列化会炸引用）。
        //   source 为空（死亡结算/自损）不写入；有 source 即覆盖 = 补刀者算最后一击的凶手
        if (source && source.uid) target.state._killerUid = source.uid;
    }
    emitCoreEvent(target, UNIT_EVENT_TYPES.HP_CHANGE, {
        hp: target.hp, maxHp: target.maxHp, alive: target.alive,
        atk: target.atk, def: target.def, _isDead: target.state._isDead || false,
        dmgDealt: target.dmgDealt, dmgTaken: target.dmgTaken,
        healDone: target.healDone, reboundDone: target.reboundDone,
        leechDone: target.leechDone, dodgeCount: target.dodgeCount,
        critCount: target.critCount, survivedRounds: target.survivedRounds,
        _baseAtk: target.state._baseAtk, _baseDef: target.state._baseDef, _baseMaxHp: target.state._baseMaxHp,
        _shield: target.state._shield || 0, _permShield: target.state._permShield || 0
    });
    return target.state._pendingDeath || false;
}

// 死亡收口唯一出口（第 184 轮）：所有「直接把血归零」的调用点都必须走这里，禁止各自
//   applyStatChange(..., ignoreCap=true)（今天已经漏过一处：白骨爪斩杀被 _dmgCap 截成 1 点血）。
// 内部固定三件事：
//   ① ignoreCap=true —— 归零血不是一次受伤，不吃 _dmgCap（庄铮·断锤三式）；
//   ② recordHpAudit(group='death') —— 账本记实际落地值，逐步真值对照可核对「归零」这笔；
//   ③ _pendingDeath=true —— 只标待死，善后（alive=false / 死亡信号）仍由 resolveDeaths /
//      finalizeDeaths 统一裁定（保留「替死」清标记取消死亡的语义）。
// record 沿用旧口径：有击杀者（真伤/斩杀）记战斗统计，无 source（死亡结算清场）不记。
// 飞天无敌（_spiderFlying）会让归零扣血失效：此时 hp 仍 >0，绝不挂 _pendingDeath
//   （否则又造出 alive=false 却 hp>0 的分裂状态）。
function killUnit(target, source, reason) {
    if (!target || !target.alive) return false;
    const before = target.hp;
    if (before > 0) {
        applyStatChange(target, 'hp', -before, source || null, reason || '死亡结算', !!source, true, true);
        if (target.hp > 0) return false;
        recordHpAudit(target, 'death', target.hp - before, reason || '死亡结算');
    }
    target.state._pendingDeath = true;
    return true;
}

// maxHp 词条化：所有 maxHp 变更走 addMod('maxHp')，本函数把 unit.maxHp 从 getStat 同步过来，
// 并按"升则等量加、降则等比降"缩放 hp。addMod 后 / 移除词条后都应调用本函数。
function refreshMaxHp(target, source, reason) {
    if (!target || !target.alive) return;
    const oldMaxHp = target.maxHp;
    if (oldMaxHp <= 0) return;
    // 上限保留实数（旧实现在此 floor 到整数，把 0.3 血上限加成直接抹平）
    const newMaxHp = Math.max(1, getStat(target, 'maxHp'));
    if (newMaxHp === oldMaxHp) return;
    const oldHp = target.hp;
    target.maxHp = newMaxHp;
    let newHp;
    // 等比缩放保留实数；oldMaxHp>0 已由上方守卫，不会除零
    if (newMaxHp > oldMaxHp) {
        newHp = oldHp + (newMaxHp - oldMaxHp);
    } else {
        newHp = oldHp * (newMaxHp / oldMaxHp);
    }
    newHp = Math.min(newHp, target.maxHp);
    const delta = newHp - oldHp;
    if (newHp <= 0) {
        killUnit(target, null, 'maxHp变更致死');
    } else if (delta !== 0) {
        applyStatChange(target, 'hp', delta, source, reason, false, false);
    }
}

// 面板换底唯一出口（形态变换类：336 现原形→成昆；以后的换面板机制同走这里）。
//   只换「底数」——m / _baseAtk / _baseDef / _baseMaxHp / _initAtk / _initDef / _initMaxHp；
//   已有 _mods（addMod/buff/光环）一格不动，新底数由 getStat 现算叠加。
//   血量口径：ratio 是调用方算好的「换底瞬间 hp/maxHp」，换算到新上限，不引入固定百分比常量。
//   _hpDmgRatio 刻意不跟随模板（沿用换底前的比例），与 336 现状逐位一致；要跟随模板须先拍板。
//   不套 applyStatChange：形态换算不是受伤/治疗语义，且它的 floor 落账会把 tenth 差值丢 0.1
//   （实测 13% 的 (旧血, 新血) 组合会少一格），故在同一出口内精确落血 + 记 hp 审计。
function rebasePanel(target, tpl, ratio, reason) {
    if (!target || !tpl || !target.alive) return false;
    const beforeHp = target.hp;
    target.m = tpl.m;
    target.state._baseAtk = tpl.state._baseAtk;
    target.state._baseDef = tpl.state._baseDef;
    target.state._baseMaxHp = tpl.state._baseMaxHp;
    target.state._initAtk = tpl.state._initAtk;
    target.state._initDef = tpl.state._initDef;
    target.state._initMaxHp = tpl.state._initMaxHp;
    target.atk = tpl.state._baseAtk;
    target.def = tpl.state._baseDef;
    target.maxHp = getStat(target, 'maxHp');
    target.hp = Math.max(1, Math.round(ratio * target.maxHp * 10) / 10);
    emitCoreEvent(target, UNIT_EVENT_TYPES.HP_CHANGE, {
        hp: target.hp, maxHp: target.maxHp, alive: target.alive, role: target.role,
        atk: target.atk, def: target.def,
        _baseAtk: target.state._baseAtk, _baseDef: target.state._baseDef, _baseMaxHp: target.state._baseMaxHp
    });
    const delta = target.hp - beforeHp;
    if (delta !== 0) recordHpAudit(target, 'panelRebase', delta, reason || '面板换底');
    return true;
}

const _queries = {};
export function registerQuery(name, fn) { _queries[name] = fn; }
export function query(name, ...args) { return _queries[name] ? _queries[name](...args) : undefined; }

// ========== 属性词条系统 ==========
// 属性只算不存：所有加成登记为词条，getStat 现算。
// 词条结构：{ source, value, ttl, group, op }
//   ttl: 'permanent' | 'round' | 'attached'
//   op:  'add'（默认）| 'mul'（百分比，存 0.3 表示 +30%）
// 计算规则：所有 add 求和，所有 mul 求和后统一乘：(base + addSum) × (1 + mulSum)
export function addMod(unit, stat, mod) {
    if (!unit) return;
    if (!unit._mods) unit._mods = { atk: [], def: [], maxHp: [] };
    if (!unit._mods[stat]) unit._mods[stat] = [];
    unit._mods[stat].push(mod);
}

// hp 审计账本：体检对照器要核对「声明 heal/dot vs 实际落账」，此前这些纯记账条目
//   混在 _mods['hp'] 里（全库无 getStat('hp') 调用点，故零行为副作用），但污染了词条容器——
//   一旦将来 hp 上词条系统，这些审计账会变成真实加成。现物理隔离到 unit._audit.hp：
//   条目形状与 _mods 同构（{source,value,ttl:'permanent',group,op:'add'}），对照器按 group 累加的算法不变。
//   注意：clone() 必须浅拷该数组（共享元素引用），对照器的逐步按引用差集依赖这一点。
export function recordHpAudit(unit, group, value, source) {
    if (!unit || !group) return;
    if (!unit._audit) unit._audit = { hp: [] };
    if (!unit._audit.hp) unit._audit.hp = [];
    unit._audit.hp.push({ source: source || '审计', value, ttl: 'permanent', group, op: 'add' });
}

export function removeModsByTTL(unit, ttl) {
    if (!unit || !unit._mods) return;
    for (const stat of Object.keys(unit._mods)) {
        unit._mods[stat] = unit._mods[stat].filter(m => m.ttl !== ttl);
    }
}

export function removeModsByGroup(unit, group) {
    if (!unit || !unit._mods) return;
    for (const stat of Object.keys(unit._mods)) {
        unit._mods[stat] = unit._mods[stat].filter(m => m.group !== group);
    }
}

export function getStat(unit, stat) {
    if (!unit) return 0;
    const baseKey = '_base' + stat.charAt(0).toUpperCase() + stat.slice(1);
    const base = unit.state?.[baseKey] ?? unit[stat] ?? 0;
    const mods = (unit._mods && unit._mods[stat]) || [];
    let addSum = 0;
    let mulSum = 0;
    for (const m of mods) {
        if (m.op === 'mul') mulSum += m.value;
        else addSum += m.value;
    }
    // 引擎内部一律实数：不在此处截到 0.1 格（旧实现 floor 会吃掉吸取/加成的小数尾巴）。
    //   显示层统一取整见 infra/102 fmtNum；显示结果不回写数据。
    const result = (base + addSum) * (1 + mulSum);
    return Math.max(0, result);
}

// V6.4.8 | 2026-11-08 新增 emitHpChange —— 血量/攻防广播唯一出口，从 modules/305 下移而来：原实作
//          置于 modules 层，core 自身那 22 处永远够不到入口（core→modules 属反向依赖），规则形同虚设。
//          305 改为转口，对外签名与 payload 逐字节不变。守卫见 tests/entry-path-guard.mjs。
// 广播单位数值变化（UI 重画攻防血）：固定 5 字段，extra 追加或覆盖。
//   ★ 单一入口：裸写 emitEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, {...}) 一律应改调本函数。
//   ★ 为何在 core/214 而非 modules/305：core 是业务最低层，modules 以上都能 import；
//     入口若放 modules，core 自己够不到（反向依赖），规则会留 22 处活口。
function emitHpChange(unit, extra) {
    emitCoreEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, {
        hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive,
        atk: getStat(unit, 'atk'), def: getStat(unit, 'def'),
        ...(extra || {})
    });
}

export {
    emitCoreEvent as emitEvent,
    emitHpChange,
    emitFullUnitState,
    finalizeDeaths,
    getNextAvailableUnit,
    swapUnitPositions,
    moveUnitPosition,
    resolvePushOrStun,
    applyStatChange,
    killUnit,
    previewHeal,
    refreshMaxHp,
    rebasePanel,
    recordCombatStat
};