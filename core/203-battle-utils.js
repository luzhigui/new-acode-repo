// V6.4.0 | 2026-11-09 斩杀无效判定收口 export getExecuteBlockReason：寒离飒 _immuneExecute 之外， 补上庄铮·断锤三式 _dmgCap（hp 高于上限时斩杀不能一次性归零，与血量判死同口径）。
export const VER = 'core/203-battle-utils.js V6.4.0';

import { CONFIG, getGameData, getSkillParams } from './201-config-5v5-test.js';
import { getRoleBonus, baseHeroName } from './202-unit.js';
import { emitEvent, applyStatChange, query, getBattleRng, getPresentationRng, addMod, getStat } from './214-battle-shared.js';
import { EXECUTION_LAYER as L, EFFECT_TYPES, registerSettlementHook } from '../infra/101-event-bus.js';
import { FACT_TYPES, BUFF_TYPES, UNIT_EVENT_TYPES, ROLE_TYPES, SIGNAL_TYPES } from '../infra/106-battle-enums.js';
import {
    calcDamage,
    getFangLevelPure,
    makeFXSnapshot,
    getUnitRow,
    getUnitCol,
    getAdjacentPositions,
    countEnemyEmptyCols,
    getBloodAuraBonus,
    getAuraBonuses
} from '../infra/102-core-utils.js';

const C = CONFIG;

export { calcDamage, makeFXSnapshot, getUnitRow, getUnitCol, getAdjacentPositions, countEnemyEmptyCols, getBloodAuraBonus, getAuraBonuses };

export function getFangLevel(def, m) {
    return getFangLevelPure(def, m, C.FANG_LEVELS);
}

export function isMelee(role) { return role === ROLE_TYPES.WARRIOR || role === ROLE_TYPES.DEFENDER || role === ROLE_TYPES.FLYER; }

// 飞天/附身统一判据（第 184 轮收口）：全库只此一份，禁止模块再内联。
// 口径与 214/315 原实现逐字一致（蝶/蛛飞行 + 蛛飞天 + 附身宿主 + FSM attached/flying）；
// 203 原来两处内联漏了 _butterflyHost，但蝶附身必然同时置 _flyMode='butterfly'，实际行为不变。
export function isAirborne(unit) {
    if (!unit) return false;
    const st = unit.state || {};
    if (st._flyMode === 'butterfly' || st._flyMode === 'spider') return true;
    if (st._spiderFlying) return true;
    if (st._butterflyHost) return true;
    if (unit._fsm && (unit._fsm.is('attached') || unit._fsm.is('flying'))) return true;
    return false;
}

export function getFronts(units) {
    let fronts = [];
    for (let col = 0; col < 3; col++) {
        let poses = [1+col, 4+col, 7+col];
        let chars = units.filter(c => poses.includes(c.pos) && c.alive && !isAirborne(c)).sort((a, b) => a.pos - b.pos);
        if (chars.length > 0) fronts.push(chars[0]);
    }
    if (fronts.length === 0) {
        let alive = units.filter(c => c.alive);
        if (alive.length > 0) fronts = [alive[getBattleRng().nextInt(0, alive.length - 1)]];
    }
    return fronts;
}

export function isBlocked(unit, allies) {
    if (!isMelee(unit.role)) return false;
    if (unit.role === ROLE_TYPES.FLYER) return false;
    if (unit.state._flyMode === 'butterfly') return false;
    if (unit.state._flyMode === 'spider') return false;
    if (unit._fsm && (unit._fsm.is('attached') || unit._fsm.is('flying'))) return false;
    let col = (unit.pos - 1) % 3;
    let poses = [1+col, 4+col, 7+col];
    // 前排口径必须与 getFronts 完全同源：飞天/附身的队友不算「前排占位」，
    //   否则近战会被一个根本打不到也挡不住的队友判成「被遮挡」而整回合不出手（getFronts 已排除这几种）
    let front = poses.find(p => allies.some(a => a.pos === p && a.alive && !a.isHorse && !a.isLionCub && !isAirborne(a)));
    if (!front) return false;
    if (unit.pos === front) return false;
    return unit.pos > front;
}

// 能否被选中：存活 + 未被标记不可选 + 不处于飞天/附身状态
// 供成昆模仿有效性、混乱目标校验、锁定目标校验等共用
export function canBeTargeted(unit) {
    if (!unit || !unit.alive) return false;
    // 加 _pendingDeath：血量归零到正式死亡之间不该再被选为目标
    if (unit.state && unit.state._pendingDeath) return false;
    if (unit.state && unit.state._untargetable) return false;
    if (unit.state && (unit.state._flyMode === 'butterfly' || unit.state._flyMode === 'spider')) return false;
    if (unit.state && unit.state._spiderFlying) return false;
    if (unit._fsm && (unit._fsm.is('attached') || unit._fsm.is('flying'))) return false;
    return true;
}

// ── 受益池裁判（2026-10-07 老板拍板，与打人门禁 canBeTargeted 成对）────────────────
// 所有「发好处」技能（治疗/加攻防/鼓舞/接盘）挑候选统一走这里，不再各写各的 filter。
// 口径与打人门禁完全同源：死的/垂死的/标记不可选的/天上蝶蛛/附身中 → 一律不进池。
// 跟打人的差异只有拒马一条：拒马默认不进池（不发加成），像生生不息溢出这种
// 「拒马也算友方」的传 includeHorse:true。以后新增「不在地面」类形态只改
// canBeTargeted 一处，打人和发好处自动同步跟上——不用指望写新技能的人记得。
// opts.includeHorse：拒马是否进池（默认 false）
// opts.excludeUids：额外排除的 uid 列表（如「不选自己」传 [unit.uid]）
export function getBenefitTargets(team, opts = {}) {
    const includeHorse = opts.includeHorse === true;
    const excludeUids = opts.excludeUids || [];
    return (team || []).filter(u =>
        canBeTargeted(u)
        && (includeHorse || !u.isHorse)
        && !excludeUids.includes(u.uid)
    );
}

// 攻击未命中率：唯一算法源（12battle-attack-steps 与详情弹窗同源调用，改算法只改这里）
// 返回 { total, sources }，total 为百分点，sources 为 { label, value } 明细
// V6.5.0 口径统一：CONFIG 里未命中率改按「1 = 100%」存（0.06 = 6%），本函数在此 ×100 还原，
//   对外契约（total / sources.value 均为百分点）不变，日志、详情弹窗、体检 145 无需跟改。
// 形参语义（2026-11-05 修正）：mySide = 本队，oppSide = 对方队。
//   原形参名为 allySide/enemySide，弹窗调用时写死传 (明教, 六大派)，
//   导致六大派单位的未命中永远按「六大派的空列」算。
export function getMissBreakdown(unit, mySide, oppSide) {
    if (!unit) return { total: 0, sources: [] };
    if (unit.state && unit.state._neverMiss) return { total: 0, sources: [{ label: '必中', value: 0 }] };
    const sources = [];
    let total = 0;
    const PCT = 100;   // 比例 → 百分点
    if (unit.role === ROLE_TYPES.RANGED || unit.role === ROLE_TYPES.BUTTERFLY) {
        const base = C.RANGED_MISS_CHANCE * PCT;
        total = base;
        sources.push({ label: '远程基础', value: base });
    } else if (unit.role === ROLE_TYPES.FLYER) {
        const base = C.FLY_MISS_CHANCE * PCT;
        total = base;
        sources.push({ label: '飞行基础', value: base });
        const allUnits = [...(mySide || []), ...(oppSide || [])];
        const lowHpCount = allUnits.filter(u => u.alive && u.hp / u.maxHp < C.LOW_HP_THRESHOLD).length;
        if (lowHpCount > 0) {
            const v = lowHpCount * (C.FLY_MISS_LOWHP_BONUS * PCT);
            total += v;
            sources.push({ label: '残血光环×' + lowHpCount, value: v });
        }
    } else {
        const base = C.GROUND_MISS_CHANCE * PCT;
        total = base;
        sources.push({ label: '地面基础', value: base });
    }
    // 飞行击杀惩罚（_missChanceBonus，单位=百分点）：每击杀 1 名敌人 +6 个百分点未命中
    const killBonus = unit.state ? (unit.state._missChanceBonus || 0) : 0;
    if (killBonus > 0) {
        total += killBonus;
        sources.push({ label: '飞行杀劫', value: killBonus });
    }
    // 空列光环：看对方队伍空列；每空一列 −FLY_MISS_EMPTYCOL_REDUCE 个百分点（0.06）
    const emptyCols = countEnemyEmptyCols(oppSide || []);
    if (emptyCols > 0) {
        const v = -emptyCols * (C.FLY_MISS_EMPTYCOL_REDUCE * PCT);
        total += v;
        sources.push({ label: '空列×' + emptyCols, value: v });
    }
    // 杨逍·鹰眼被动
    if (unit.isYangXiao) {
        const ee = getSkillParams('杨逍', 'eagleEye');
        if (ee && ee.missReduce) {
            const v = -ee.missReduce * PCT;
            total += v;
            sources.push({ label: '鹰眼', value: v });
        }
    }
    return { total: Math.max(0, Math.round(total * 10) / 10), sources };
}

export function getRandomTaunt(unit) {
    const rng = getPresentationRng();
    const taunts = getGameData().taunts;
    // 优先按角色名查专用池（如 taunts['张无忌']）；无专用池则回退职业通用池。
    // 加新角色只要在 content.taunts 里加一个同名 key，不动 core。
    const byName = taunts[unit.name] || taunts[baseHeroName(unit.name)];
    const pool = (byName && byName.attack && byName.attack.length > 0) ? byName.attack : (taunts[unit.role] && taunts[unit.role].attack);
    if (!pool || pool.length === 0) throw new Error(`台词池缺失: ${unit.name || unit.role}`);
    return pool[rng.nextInt(0, pool.length - 1)];
}
export function getKillTaunt(unit) {
    const rng = getPresentationRng();
    const taunts = getGameData().taunts;
    // 与 getRandomTaunt 同口径：按角色名查专用池，miss 回退职业通用池
    const byName = taunts[unit.name] || taunts[baseHeroName(unit.name)];
    const pool = (byName && byName.kill && byName.kill.length > 0) ? byName.kill : (taunts[unit.role] && taunts[unit.role].kill);
    if (!pool || pool.length === 0) throw new Error(`击杀台词池缺失: ${unit.name || unit.role}`);
    return pool[rng.nextInt(0, pool.length - 1)];
}
export function getZhangNearTaunt(nearAtkCount) {
    if (nearAtkCount < 1 || nearAtkCount > C.ZHANG_NEAR_ATK_LIMIT) return null;
    const pool = getGameData().taunts.zhangNear;
    return pool[nearAtkCount - 1] || null;
}

export function hasBuff(buffs, buffKey) { return buffs.some(b => b.key === buffKey); }

// 职业能力判据：默认「本职业才具备」，
//   被授予 _dualSchools 的单位额外获得对应职业能力（连接搭档由 modules/26 打标）。
//   core 只读字段、不 import 英雄模块 —— 链路仍单向。
export function hasCombatSchool(unit, role) {
    if (!unit) return false;
    if (unit.role === role) return true;
    const extra = unit.state && unit.state._dualSchools;
    return Array.isArray(extra) && extra.includes(role);
}

// 战士破防：只提交声明，由 core/16 的裁定器统一 addMod（见 V6.1.3：本处原有一次直改，与裁定重复导致双扣）
function submitWarriorBreakDefenseDeclaration(data) {
    const { unit, target, declarations } = data;
    if (!declarations) return;
    if (!hasCombatSchool(unit, ROLE_TYPES.WARRIOR) || getStat(target, 'def') <= 0) return;
    // 参数三源收敛：分档表移入 CONFIG.WARRIOR_BREAK_DEF_TIERS（原先内联魔法数字）
    const targetDef = getStat(target, 'def');
    const tier = (C.WARRIOR_BREAK_DEF_TIERS || []).find(t => t.defMax === null || targetDef <= t.defMax)
        || { reduce: C.WARRIOR_BREAK_DEF, chance: null };
    let defReduced = tier.reduce;
    // 两档 chance 口径统一「1 = 100%」，比较前都 ×100 回百分点域：
    //   分档档 → tier.chance * 100（如 0.5 → 50）
    //   兜底档 → 防御 × (WARRIOR_BREAK_CHANCE_PER_DEF * 100)（如 30 × 2.5 = 75）
    let breakChance = tier.chance === null ? targetDef * (C.WARRIOR_BREAK_CHANCE_PER_DEF * 100) : tier.chance * 100;
    if (getBattleRng().nextInt(1, 100) > breakChance) return;
    // 破防口径：取整后再夹到当前防御（不取整会发出 2.5 这类小数破防，面板按整数记 → 对账差）；
    //   取整后归零则该次不声明（0 破防只挂空事实）。
    defReduced = Math.min(defReduced, Math.floor(getStat(target, 'def')));
    if (defReduced <= 0) return;
    declarations.push({ type: EFFECT_TYPES.BREAK_DEF, value: defReduced, source: unit, target: target, factData: { attackerName: unit.name, targetName: target.name, reduce: defReduced } });
}

export function registerWarriorBreakDefense(eventBus) {
    registerSettlementHook({
        when: SIGNAL_TYPES.BEFORE_DAMAGE_CALC,
        priority: L.BEFORE_DAMAGE_CALC.WARRIOR_BREAK,
        handler: (data) => {
            submitWarriorBreakDefenseDeclaration(data);
        }
    });
}

// 远程成长：每次攻击后攻击 +2，走永久词条
function submitRangedGrowthDeclaration(data) {
    const { unit, target, dmg, group } = data;
    // 蝴蝶（小昭·姊）沿用远程成长：只改身份职业，不改打人方式
    if ((!hasCombatSchool(unit, ROLE_TYPES.RANGED) && unit.role !== ROLE_TYPES.BUTTERFLY) || dmg <= 0) return;
    const growth = C.RANGED_GROWTH_ATK;
    addMod(unit, 'atk', { source: '远程成长', value: growth, ttl: 'permanent', group: 'rangedGrowth', op: 'add' });
    if (group && group.data && group.data.entries) {
        group.data.entries.push({ factType: FACT_TYPES.RANGED_GROWTH, data: { unitName: unit.name, growth, newAtk: Math.floor(getStat(unit, 'atk')) } });
    }
}

export function registerRangedGrowth(eventBus) {
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
        priority: L.AFTER_DAMAGE_APPLIED.RANGED_GROWTH,
        handler: (data) => {
            submitRangedGrowthDeclaration(data);
        }
    });
}

// 斩杀无效判定（与「血量判死」同口径）：目标当前状态能否被一次性斩杀。
//   ① _immuneExecute（寒离飒）：明面免疫斩杀；
//   ② _dmgCap（庄铮·断锤三式）：血量判死会先把本击截到上限，hp 仍高于上限时任何一击都打不死；
//      斩杀是一次性归零，绕过上限 = 越过血量判死（实机：庄铮 3→2 后被战士斩杀直接带走）。
//   返回 null = 可斩杀；否则返回原因（用于播报）。
export function getExecuteBlockReason(unit) {
    if (!unit || !unit.state) return null;
    if (unit.state._immuneExecute) return 'immuneExecute';
    if (unit.state._dmgCap > 0 && unit.hp > unit.state._dmgCap) return 'dmgCap';
    return null;
}

// 战士斩杀：目标血量低于阈值时直接击杀（不涉及属性词条）
function submitWarriorExecuteDeclaration(data) {
    const { unit, target, allySide, declarations } = data;
    if (!hasCombatSchool(unit, ROLE_TYPES.WARRIOR) || !unit.alive) return;
    if (!target || !target.alive || target.hp <= 0) return;
    
    const unitBuffs = (allySide && allySide._activeBuffs) || [];
    const hasBloodthirst = hasBuff(unitBuffs, BUFF_TYPES.BLOODTHIRST);
    const threshold = hasBloodthirst ? C.EXEC_THRESHOLD_BLOODTHIRST : C.EXEC_THRESHOLD;
    // 斩杀判定后置（修正版）：把张无忌融会贯通的额外伤害先算进有效血量再判阈值。
    //   监听器按 priority 升序执行：本监听 45（infra/50），融会 JIUYANG=40 先跑、BONUS_DMG 已在数组里；
    //   结算（core/16 resolveAfterDamageEffects）按声明入数组顺序执行：BONUS_DMG 先扣血、EXECUTE 再清零，
    //   落地顺序天然 =「普攻 → 融会 → 斩杀」。上版把升序误当降序（20 vs 40），判定实际在融会之前，已修。
    const ronghuiDecl = Array.isArray(declarations)
        ? declarations.find(d => d && d.type === EFFECT_TYPES.BONUS_DMG && d.target === target)
        : null;
    // 护盾算进有效血量：只比 hp 会让 17 血 + 43 盾的单位被一刀处决，盾完全白给。
    //   临时（蓄力 _shield）+ 永久（九阳溢出 _permShield）两个池都算。
    const shieldHp = (target.state._shield || 0) + (target.state._permShield || 0);
    const effHp = target.hp + shieldHp - (ronghuiDecl ? ronghuiDecl.value : 0);
    if (effHp <= target.maxHp * threshold) {
        // 免疫斩杀拦截（只在真正进入斩杀线时才报，避免满血也弹免疫斩杀）
        const blockReason = getExecuteBlockReason(target);
        if (blockReason) {
            if (data.log) {
                const note = blockReason === 'dmgCap'
                    ? `🛡️ ${target.name} 断锤不倒，斩杀无效！`
                    : `🛡️ ${target.name} 无视了斩杀！`;
                data.log.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: { unitName: target.name, unitUid: target.uid, camp: target.camp, skillName: '免疫斩杀', note, line: false, floatText: '🛡️免疫斩杀', floatUid: target.uid } });
            }
            return;
        }
        if (!declarations) return;
        declarations.push({
            type: EFFECT_TYPES.EXECUTE,
            target: target,
            source: unit,
            threshold: threshold,
            factType: FACT_TYPES.WARRIOR_EXECUTE,
            factData: { unitName: unit.name, targetName: target.name, unitUid: unit.uid, targetUid: target.uid }
        });
    }
}

export function registerWarriorExecute(eventBus) {
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
        priority: L.AFTER_DAMAGE_APPLIED.WARRIOR_EXECUTE,
        handler: (data) => {
            submitWarriorExecuteDeclaration(data);
        }
    });
}

export function registerFortifyShield(eventBus) {
    // chanceRatio = 触发概率（口径 1 = 100%，来自 roles.防战.fortify）；比较前 ×100 回到百分点域
    function tryFortify(unit, chanceRatio, group, log, label) {
        if (!unit.alive || unit.role !== ROLE_TYPES.DEFENDER) return;
        const fortifyThisRound = unit.state._fortifyThisRound || 0;
        const increment = unit.state._fortifyIncrement || C.FORTIFY_INCREMENT;
        const cap = unit.state._fortifyCap || C.FORTIFY_CAP;
        if (fortifyThisRound + increment > cap) return;
        if (getBattleRng().nextInt(1, 100) > chanceRatio * 100) return;
        Object.assign(unit.state, { _fortifyStacks: unit.state._fortifyStacks + increment, _fortifyThisRound: fortifyThisRound + increment });
        addMod(unit, 'def', { source: '坚盾', value: increment, ttl: 'permanent', group: 'fortify', op: 'add' });
        const entry = { factType: FACT_TYPES.FORTIFY_SHIELD, data: { unitName: unit.name, unitUid: unit.uid, label, increment, current: fortifyThisRound + increment, cap } };
        if (group && group.data && group.data.entries) {
            group.data.entries.push(entry);
        } else if (log) {
            log.push(entry);
        }
    }

    const fortifyCfg = getGameData().roles[ROLE_TYPES.DEFENDER].fortify;

    function submitFortifyShieldDefend(data) {
        const { target, dmg, group } = data;
        if (dmg <= 0) return;
        tryFortify(target, fortifyCfg.defendChance, group, null, '坚盾');
    }

    function submitFortifyShieldAttack(data) {
        const { unit, group, log } = data;
        tryFortify(unit, fortifyCfg.attackChance, group, log, '攻盾');
    }

    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
        priority: L.AFTER_DAMAGE_APPLIED.SHIELD_DEFEND,
        handler: (data) => { submitFortifyShieldDefend(data); }
    });

    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_ATTACK,
        priority: L.AFTER_ATTACK.SHIELD_ATTACK,
        handler: (data) => { submitFortifyShieldAttack(data); }
    });
}

export function registerDoubleStrike(eventBus, doubleStrikeUnitUids, allyTeam, activeBuffs) {
    if (!Array.isArray(doubleStrikeUnitUids) || doubleStrikeUnitUids.length === 0) return;
    function submitDoubleStrikeDeclaration(data) {
        const { unit, target, log } = data;
        // 连击转移：若轮盘选中的两人中有姊，而她已经蝶变附身，则连击归宿主（此时宿主、姊、另一人共3人触发）。
        let matched = doubleStrikeUnitUids.includes(unit.uid);
        if (!matched) {
            const sis = allyTeam.find(u => doubleStrikeUnitUids.includes(u.uid) && u.isXiaoZhaoSister);
            if (sis && sis.state._butterflyHost === unit.uid) {
                matched = true;
            }
        }
        if (!matched || !unit.alive || unit.state._doubleStriked) return;
        const xiaoDoubleEnhance = query('xiaoHexEnhance', allyTeam, activeBuffs, BUFF_TYPES.DOUBLE_STRIKE);
        // 002 才是真源：旧版这里写死 1.0，配置里的 chance 从未被读过（死键）。缺键显式抛错，不回落。
        if (xiaoDoubleEnhance && xiaoDoubleEnhance.chance == null) {
            throw new Error('002-hex-enhance.json 缺 sister.doubleStrike.chance');
        }
        const missChainChance = xiaoDoubleEnhance ? xiaoDoubleEnhance.chance : C.BUFFS.doubleStrike.prob;
        // AFTER_MISS 期间有 deferredFacts（暂存，待 MISS fact 落账后再出，顺序才对）；
        //   AFTER_ATTACK 期间没有该字段，直接进 log（原行为）
        const sink = Array.isArray(data.deferredFacts) ? data.deferredFacts : log;
        if (getBattleRng().next() < missChainChance) {
            // 补 unitName：原成功分支不带单位，而渲染出的 banner 也没有单位字段，
            //   体检 146 只能靠「banner 之后第一条 attack-group 的攻击者」反推触发者 ——
            //   母狮随动链、其他单位自己的回合插在 banner 之后时必然误报（seed=10 stage=2 实测）。
            //   失败分支本就带 unitName，这里补齐对称，判据即可直接读单位、不再推断。
            sink.push({ factType: FACT_TYPES.DOUBLE_STRIKE, data: { success: true, unitName: unit.name } });
            Object.assign(unit.state, { _doubleStriked: true });
            if (!data.extraRequests) data.extraRequests = [];
            data.extraRequests.push({
                unit,
                // 补 _pendingDeath：原目标同击致死后 alive 仍是 true（死亡结算才清），
                //   只判 alive 会把"待死"的 uid 锁给第二次攻击 → 消费端按严判据找不到人 → 白跳一次。
                //   判 null 后走正常选目标流程（概率连击改打别人）。
                targetUid: (target && target.alive && !target.state._pendingDeath) ? target.uid : null,
                reason: 'doubleStrike',
                actedMode: 'allow',
                priority: 10,
                // 定案：拥有概率连击者（团队版/妹永久）连击一律无视遮挡，不再唯一限姊强化
                ignoreBlock: true
            });
        } else {
            sink.push({ factType: FACT_TYPES.DOUBLE_STRIKE, data: { success: false, unitName: unit.name } });
        }
    }
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_ATTACK,
        priority: L.AFTER_ATTACK.DOUBLE_STRIKE,
        handler: (data) => { submitDoubleStrikeDeclaration(data); }
    });
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_MISS,
        priority: L.AFTER_MISS.PERMANENT_DOUBLE_RETRY,
        handler: (data) => { submitDoubleStrikeDeclaration(data); }
    });
}

// 清死码：registerEmptyColBonus 空壳（光环已改纯函数实时计算，外部AI清单#5）连同 core/11 调用点一并删除