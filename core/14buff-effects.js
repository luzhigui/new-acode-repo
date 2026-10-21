// V6.1.7 | 2026-10-21 姊强化·惑心换位加血差：敌方换位两人各扣 dmgOnSwap、己方换位两人各回 healOnSwap
//   （参数走 hexEnhance.mindControl；applyStatChange 补进 core/13 import；SWAP fact 带 dmg/heal 供 render/38 飘字）
// V6.1.6 | ~9460 bytes | 2026-10-19 惑心换位候选池排除控制免疫者（寒离飒·开局常驻 _ctrlImmune）：
//   免疫者被选中后 swapUnitPositions（core/13 L135）静默 return 不换位，但 SWAP 宣告照发 ⇒ 战报说谎
//   （"互换位置！"而谁都没动，tests/166 判据5 误报 3 场即此根因）。候选池与既有 _flyMode 过滤同款
//   追加 !u.state._ctrlImmune ⇒ 要么选不到 2 人走 FAIL(可用单位不足)、要么选到的都真换位，宣告与实物一致。
// V6.1.5 | ~9430 bytes | 2026-10-15 妹永久圣火令改画行列命中制（掷骰在 modules/27 回合初，读 state._xiaoHolyFlame）
// V6.1.4 | 2026-10-12 拒马双向参与 carry（老板拍板）：① 队友池去 !u.isHorse（活 1 份/死 2 份，与狮子同口径）；② 受益门控也去 isHorse——拒马站受益位（5；小昭·姊在场 4/5/6）时也能吃到，攻加成>0 后拒马不再休息、会出手
export const VER = 'core/14buff-effects.js V6.1.7';

import { CONFIG, getSkillParams } from './01config-5v5-test.js';
import { getUnitRow, getUnitCol } from './03battle-utils.js';
import { eventBus } from '../infra/50-event-bus.js';
import { getBattleRng, swapUnitPositions, addMod, getStat, applyStatChange } from './13battle-shared.js';
import { FACT_TYPES, CAMP_TYPES, SIGNAL_TYPES, BUFF_TYPES } from '../infra/56-battle-enums.js';
const C = CONFIG;

// 严阵以待：防御 +50%（mul 词条）
// 2026-10-08 清死重：原 _Normal/_Sister/_Brother 三函数体逐字相同（外部AI清单#2），
//   且 04 只调 _Normal——收口成一个，_Sister/_Brother 全库无调用
export function applyFortifyDef(unit) {
    addMod(unit, 'def', { source: '严阵以待', value: CONFIG.BUFFS.fortify.defBonus, ttl: 'round', op: 'mul', group: 'fortify' });
}

// 流云身法：闪避 +25%（闪避不走属性词条，返回比率给 computeBuffStats 用）
export function applyCloudBodyDodge_Normal() { return CONFIG.BUFFS.cloudBody.dodgeBonus; }
export function applyCloudBodyDodge_Sister() { return getSkillParams('小昭', 'hexEnhance').cloudBody.dodgeBonus; }
// 2026-10-21 老板拍板：妹永久流云身法取团队版原值的 70%（content.buffs.cloudBody.brotherRatio），不再按「减惩罚值」计算
export function applyCloudBodyDodge_Brother() { return CONFIG.BUFFS.cloudBody.dodgeBonus * CONFIG.BUFFS.cloudBody.brotherRatio; }

// 圣火令：命中列 +30% 攻击，命中行 +30% 防御（mul 词条）
// 数值声明 fact：乘法词条共享 getStat 的 (1+mulSum) 乘区、无独立增量，故只发乘率 ratio，供体检按乘率口径核对
function pushHolyFlameFact(log, unit, field, ratio) {
    if (!log) return;
    log.push({ factType: FACT_TYPES.HOLY_FLAME_APPLY, data: { unitName: unit.name, unitUid: unit.uid, camp: unit.camp, field, op: 'mul', ratio } });
}

export function applyHolyFlame_Normal(unit, allyTeam, activeBuffs, log) {
    const holyFlameBuff = activeBuffs.find(b => b.key === BUFF_TYPES.HOLY_FLAME);
    if (!holyFlameBuff) return;
    const cols = holyFlameBuff.cols || (holyFlameBuff.col != null ? [holyFlameBuff.col] : []);
    const rows = holyFlameBuff.rows || (holyFlameBuff.row != null ? [holyFlameBuff.row] : []);
    if (cols.includes(getUnitCol(unit.pos))) {
        addMod(unit, 'atk', { source: '圣火令', value: CONFIG.BUFFS.holyFlame.atkBonus, ttl: 'round', op: 'mul', group: 'holyFlame' });
        pushHolyFlameFact(log, unit, 'atk', CONFIG.BUFFS.holyFlame.atkBonus);
    }
    if (rows.includes(getUnitRow(unit.pos))) {
        addMod(unit, 'def', { source: '圣火令', value: CONFIG.BUFFS.holyFlame.defBonus, ttl: 'round', op: 'mul', group: 'holyFlame' });
        pushHolyFlameFact(log, unit, 'def', CONFIG.BUFFS.holyFlame.defBonus);
    }
}

export function applyHolyFlame_Sister(unit, allyTeam, activeBuffs, log) {
    applyHolyFlame_Normal(unit, allyTeam, activeBuffs, log);
}

// 2026-10-15 妹永久圣火令改「画行列、判命中」（老板拍板）：不再无条件双加成——回合初蛛变按全局同口径
//   掷 defRows 行 + atkCols 列存 state._xiaoHolyFlame（modules/27），妹落位命中行→吃防加成、命中列→吃攻加成。
//   3×3 宫格下等价 2/3 概率加防、1/3 概率加攻（独立判定），但逻辑是命中判定而非写死概率，未来扩宫格自适应。
export function applyHolyFlame_Brother(unit, allyTeam, activeBuffs, log) {
    const draw = unit.state._xiaoHolyFlame;
    if (!draw) return;
    if ((draw.rows || []).includes(getUnitRow(unit.pos))) {
        addMod(unit, 'def', { source: '圣火令', value: CONFIG.BUFFS.holyFlame.defBonus, ttl: 'round', op: 'mul', group: 'holyFlame' });
        pushHolyFlameFact(log, unit, 'def', CONFIG.BUFFS.holyFlame.defBonus);
    }
    if ((draw.cols || []).includes(getUnitCol(unit.pos))) {
        addMod(unit, 'atk', { source: '圣火令', value: CONFIG.BUFFS.holyFlame.atkBonus, ttl: 'round', op: 'mul', group: 'holyFlame' });
        pushHolyFlameFact(log, unit, 'atk', CONFIG.BUFFS.holyFlame.atkBonus);
    }
}

// carry：5 号位按队友属性百分比加成，死亡队友加成翻倍
// 2026-10-12 拒马双向全开（老板拍板）：① 计入队友池——活 1 份 / 死 deathMultiplier 份，与狮子同口径；
//   ② 受益面也放开——拒马站受益位（无小昭·姊=5 号位，有小昭·姊=4/5/6）时同样吃到加成（门控已去 isHorse）
export function calcCarryBonus_Normal(unit, allyTeam) {
    if (unit.pos !== 5 || !unit.alive) return { atkAbs: 0, defAbs: 0, hpAbs: 0 };
    let carryAtkAbs = 0, carryDefAbs = 0, carryHpAbs = 0;
    let allAllies = allyTeam.filter(u => u.uid !== unit.uid);
    allAllies.forEach(a => {
        let mult = a.alive ? 1 : CONFIG.BUFFS.carry.deathMultiplier;
        carryAtkAbs += Math.floor(getStat(a, 'atk') * CONFIG.BUFFS.carry.atkBonus * mult);
        carryDefAbs += Math.floor(getStat(a, 'def') * CONFIG.BUFFS.carry.defBonus * mult);
        if (CONFIG.BUFFS.carry.hpBonus) carryHpAbs += Math.floor(a.state._baseMaxHp ? a.state._baseMaxHp * CONFIG.BUFFS.carry.hpBonus * mult : 0);
    });
    return { atkAbs: carryAtkAbs, defAbs: carryDefAbs, hpAbs: carryHpAbs };
}

export function calcCarryBonus_Sister(unit, allyTeam) {
    if ((unit.pos < 4 || unit.pos > 6) || !unit.alive) return { atkAbs: 0, defAbs: 0, hpAbs: 0 };
    let carryAtkAbs = 0, carryDefAbs = 0, carryHpAbs = 0;
    let allAllies = allyTeam.filter(u => u.uid !== unit.uid);
    allAllies.forEach(a => {
        let mult = a.alive ? 1 : CONFIG.BUFFS.carry.deathMultiplier;
        carryAtkAbs += Math.floor(getStat(a, 'atk') * CONFIG.BUFFS.carry.atkBonus * mult);
        carryDefAbs += Math.floor(getStat(a, 'def') * CONFIG.BUFFS.carry.defBonus * mult);
        if (CONFIG.BUFFS.carry.hpBonus) carryHpAbs += Math.floor(a.state._baseMaxHp ? a.state._baseMaxHp * CONFIG.BUFFS.carry.hpBonus * mult : 0);
    });
    return { atkAbs: carryAtkAbs, defAbs: carryDefAbs, hpAbs: carryHpAbs };
}

function applyMindControlCore(unit, allySide, enemySide, log, swapChanceEnemy, swapChanceAlly, enhance = null) {
    const rng = getBattleRng();
    let frontUnit = allySide.filter(u => u.alive && !u.isHorse).sort((a,b) => a.pos - b.pos)[0];
    if (!frontUnit || frontUnit.uid !== unit.uid) return;

    log.push({ factType: FACT_TYPES.MIND_CONTROL_BANNER, data: { side: CAMP_TYPES.ENEMY } });
    if (rng.nextInt(1,100) <= swapChanceEnemy) {
        let enemies = enemySide.filter(u => u.alive && u.state._flyMode !== 'butterfly' && u.state._flyMode !== 'spider' && !u.state._spiderFlying && !u.state._ctrlImmune);
        if (enemies.length >= 2) {
            let a = enemies[rng.nextInt(0, enemies.length-1)];
            let b; do { b = enemies[rng.nextInt(0, enemies.length-1)]; } while (b.uid === a.uid);
            let posA = a.pos, posB = b.pos;
            swapUnitPositions(a, b, log);
            // 2026-10-21 姊强化：敌方换位两人各扣 dmgOnSwap 点血（source 传 null = 不记击杀者，走死亡结算由 core/10 统一处理）
            let dmgOnSwap = 0;
            if (enhance && enhance.dmgOnSwap) {
                dmgOnSwap = enhance.dmgOnSwap;
                applyStatChange(a, 'hp', -dmgOnSwap, null, '惑心换位');
                applyStatChange(b, 'hp', -dmgOnSwap, null, '惑心换位');
            }
            log.push({ factType: FACT_TYPES.MIND_CONTROL_SWAP, data: { side: CAMP_TYPES.ENEMY, unitA: { uid: a.uid, name: a.name }, unitB: { uid: b.uid, name: b.name }, posA, posB, dmg: dmgOnSwap } });
        } else {
            log.push({ factType: FACT_TYPES.MIND_CONTROL_FAIL, data: { side: CAMP_TYPES.ENEMY, reason: '可用单位不足' } });
        }
    } else {
        log.push({ factType: FACT_TYPES.MIND_CONTROL_FAIL, data: { side: CAMP_TYPES.ENEMY, reason: '未触发' } });
    }
    log.push({ factType: FACT_TYPES.MIND_CONTROL_BANNER, data: { side: CAMP_TYPES.ALLY } });
    if (rng.nextInt(1,100) <= swapChanceAlly) {
        let allies = allySide.filter(u => u.alive && u.state._flyMode !== 'butterfly' && u.state._flyMode !== 'spider' && !u.state._spiderFlying && !u.state._ctrlImmune);
        if (allies.length >= 2) {
            let a = allies[rng.nextInt(0, allies.length-1)];
            let b; do { b = allies[rng.nextInt(0, allies.length-1)]; } while (b.uid === a.uid);
            let posA = a.pos, posB = b.pos;
            swapUnitPositions(a, b, log);
            // 2026-10-21 姊强化：己方换位两人各回 healOnSwap 点血（治疗语义，吃杨逍截脉打折）
            let healOnSwap = 0;
            if (enhance && enhance.healOnSwap) {
                healOnSwap = enhance.healOnSwap;
                applyStatChange(a, 'hp', healOnSwap, null, '惑心换位');
                applyStatChange(b, 'hp', healOnSwap, null, '惑心换位');
            }
            log.push({ factType: FACT_TYPES.MIND_CONTROL_SWAP, data: { side: CAMP_TYPES.ALLY, unitA: { uid: a.uid, name: a.name }, unitB: { uid: b.uid, name: b.name }, posA, posB, heal: healOnSwap } });
        } else {
            log.push({ factType: FACT_TYPES.MIND_CONTROL_FAIL, data: { side: CAMP_TYPES.ALLY, reason: '可用单位不足' } });
        }
    } else {
        log.push({ factType: FACT_TYPES.MIND_CONTROL_FAIL, data: { side: CAMP_TYPES.ALLY, reason: '未触发' } });
    }

    eventBus.emit(SIGNAL_TYPES.ON_POSITION_SWAP, { allySide, enemySide, log });
}

export function applyMindControl_Normal(unit, allySide, enemySide, log) {
    applyMindControlCore(unit, allySide, enemySide, log, CONFIG.BUFFS.mindControl.enemySwapProb * 100, CONFIG.BUFFS.mindControl.allySwapProb * 100);
}

export function applyMindControl_Sister(unit, allySide, enemySide, log) {
    const s = getSkillParams('小昭', 'hexEnhance').mindControl;
    if (!s) throw new Error('缺技能参数: 小昭.hexEnhance.mindControl');
    applyMindControlCore(unit, allySide, enemySide, log, s.enemySwapProb * 100, s.allySwapProb * 100, s);
}