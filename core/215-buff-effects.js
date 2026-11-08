// V6.2.3 | 2026-11-08 体检转交：applyHolyFlame_Sister 前置显式校验 sister.holyFlame.atkBonus/defBonus
//        | （Normal 对 bonuses 缺键回落普通版 0.3，摘键会静默算错；缺哪键报哪键）。
// V6.2.5 | 2026-11-08 状态标签化：惑心换位候选池与两处血量结算的「存活+非待死+非免控」
//        | 改问 isPendingDeath/isCCImmune（core/218 标签表）；逐项等价。
export const VER = '215-buff-effects.js V6.2.5';
// V6.2.2（2026-11-08）：applyCloudBodyDodge_Sister 缺子键显式报错（原直链 .cloudBody.dodgeBonus，
//   缺键直接 TypeError，与「缺哪键报哪键」口径不符）。
// V6.1.11（2026-11-07）：惑心换位改「保证有效」——抽格必含存活单位、参与单位全员必挪位、
//   控制免疫单位不进候选（删除免疫 50% 拦截与「洗完回原位」两条空结果路径）。
// V6.1.10（2026-11-02 收尾）：撤销 applyMindControlCore 内三处 MCDEBUG 临时诊断（MCSIDE/MC_E/MC_A），
//   排查惑心换位回放误报用，已确认引擎换位真实生效、属规则166 误报，诊断代码无保留价值。

import { CONFIG, getSkillParams, getBrotherHexEnhance } from './201-config-5v5-test.js';
import { getUnitRow, getUnitCol } from './203-battle-utils.js';
import { eventBus } from '../infra/101-event-bus.js';
import { getBattleRng, addMod, getStat, applyStatChange, emitEvent } from './214-battle-shared.js';
import { emitStateChange } from '../infra/108-state-change.js';
import { FACT_TYPES, CAMP_TYPES, SIGNAL_TYPES, BUFF_TYPES, UNIT_EVENT_TYPES, STATE_CHANGE_TYPES } from '../infra/106-battle-enums.js';
import { isPendingDeath, isCCImmune } from './218-state-keys.js';   // 待死/免控语义（标签表单一真源）
const C = CONFIG;

// 严阵以待：防御 +50%（mul 词条）
// 清死重：原 _Normal/_Sister/_Brother 三函数体逐字相同（外部AI清单#2），
//   且 04 只调 _Normal——收口成一个，_Sister/_Brother 全库无调用
export function applyFortifyDef(unit) {
    // 去重：同一单位本回合只挂一条严阵以待（团队 buff 与张三丰自挂版不叠加）
    const mods = (unit._mods && unit._mods.def) || [];
    if (mods.some(m => m.group === 'fortify' && m.ttl === 'round')) return;
    addMod(unit, 'def', { source: '严阵以待', value: CONFIG.BUFFS.fortify.defBonus, ttl: 'round', op: 'mul', group: 'fortify' });
}

// 流云身法：闪避 +25%（闪避不走属性词条，返回比率给 computeBuffStats 用）
export function applyCloudBodyDodge_Normal() { return CONFIG.BUFFS.cloudBody.dodgeBonus; }
// 姊版闪避：读 002 sister.cloudBody.dodgeBonus；缺哪键报哪键，不靠 TypeError
export function applyCloudBodyDodge_Sister() {
    const enh = getSkillParams('小昭', 'hexEnhance').cloudBody;
    if (!enh || enh.dodgeBonus == null) {
        throw new Error('002-hex-enhance.json 缺 sister.cloudBody.dodgeBonus');
    }
    return enh.dodgeBonus;
}
// 妹永久流云身法：普通版闪避 × brother.cloudBody.dodgeRatio（唯一真源 201，缺则炸）
export function applyCloudBodyDodge_Brother() {
    const enh = getBrotherHexEnhance('cloudBody');
    if (!enh || enh.dodgeRatio == null) {
        throw new Error('002-hex-enhance.json 缺 brother.cloudBody.dodgeRatio');
    }
    return CONFIG.BUFFS.cloudBody.dodgeBonus * enh.dodgeRatio;
}

// 圣火令：命中列 +30% 攻击，命中行 +30% 防御（mul 词条）
// 数值声明 fact：乘法词条共享 getStat 的 (1+mulSum) 乘区、无独立增量，故只发乘率 ratio，供体检按乘率口径核对
function pushHolyFlameFact(log, unit, field, ratio) {
    if (!log) return;
    log.push({ factType: FACT_TYPES.HOLY_FLAME_APPLY, data: { unitName: unit.name, unitUid: unit.uid, camp: unit.camp, field, op: 'mul', ratio } });
}

/**
 * 圣火令本体。bonuses 可选：传 { atkBonus, defBonus } 即用该组数值，缺字段回落 CONFIG.BUFFS.holyFlame
 *   —— 姊/妹强化共用本实现，避免复制「按列加攻 / 按行加防 + fact」这套逻辑。
 */
export function applyHolyFlame_Normal(unit, allyTeam, activeBuffs, log, bonuses = null) {
    const holyFlameBuff = activeBuffs.find(b => b.key === BUFF_TYPES.HOLY_FLAME);
    if (!holyFlameBuff) return;
    const atkBonus = (bonuses && bonuses.atkBonus != null) ? bonuses.atkBonus : CONFIG.BUFFS.holyFlame.atkBonus;
    const defBonus = (bonuses && bonuses.defBonus != null) ? bonuses.defBonus : CONFIG.BUFFS.holyFlame.defBonus;
    const cols = holyFlameBuff.cols || (holyFlameBuff.col != null ? [holyFlameBuff.col] : []);
    const rows = holyFlameBuff.rows || (holyFlameBuff.row != null ? [holyFlameBuff.row] : []);
    if (cols.includes(getUnitCol(unit.pos))) {
        addMod(unit, 'atk', { source: '圣火令', value: atkBonus, ttl: 'round', op: 'mul', group: 'holyFlame' });
        pushHolyFlameFact(log, unit, 'atk', atkBonus);
    }
    if (rows.includes(getUnitRow(unit.pos))) {
        addMod(unit, 'def', { source: '圣火令', value: defBonus, ttl: 'round', op: 'mul', group: 'holyFlame' });
        pushHolyFlameFact(log, unit, 'def', defBonus);
    }
}

// 姊强化：行列判定与 Normal 完全一致（读团队 buff 实例的 cols/rows），只把加成值换成
//   sister.holyFlame（0.25）。此前直接转调 Normal，实际吃的是普通版 0.3。
//   前置显式校验：Normal 对 bonuses 缺键是「回落普通版」，姊键被摘掉会静默按 0.3 算（不 throw 不告警），
//   故在这里逐键校验，缺哪键报哪键。
export function applyHolyFlame_Sister(unit, allyTeam, activeBuffs, log) {
    const enh = getSkillParams('小昭', 'hexEnhance').holyFlame;
    if (!enh) throw new Error('002-hex-enhance.json 缺 sister.holyFlame');
    if (enh.atkBonus == null) throw new Error('002-hex-enhance.json 缺 sister.holyFlame.atkBonus');
    if (enh.defBonus == null) throw new Error('002-hex-enhance.json 缺 sister.holyFlame.defBonus');
    applyHolyFlame_Normal(unit, allyTeam, activeBuffs, log, enh);
}

// 妹永久圣火令改「画行列、判命中」（老板拍板）：不再无条件双加成——回合初蛛变按全局同口径
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
// 拒马双向全开（老板拍板）：① 计入队友池——活 1 份 / 死 deathMultiplier 份，与狮子同口径；
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

// 惑心 3 格重排（保证有效）：抽中的 3 格至少 1 格有存活单位，且参与换位的单位全部必然挪位。
//   控制免疫单位不进候选（不再出现「被挡住 → 无变化」）；飞天/附身可换。
//   返回实际发生变化的单位 [{ unit, fromPos, toPos }]（正常路径长度 ≥1，且每个单位 toPos ≠ fromPos）。
function shuffleThreeSlots(team, rng) {
    const allPos = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    // 候选 = 存活、非待死、非控制免疫；全灭/全免疫时保持空结果（保留分支，正常路径不命中）
    const cands = team.filter(u => u.alive && !isPendingDeath(u) && !isCCImmune(u));
    if (cands.length === 0) return { swaps: [], pick3: [] };

    const pick3 = [];
    const take = (pool) => {
        const idx = rng.nextInt(0, pool.length - 1);
        pick3.push(pool[idx]);
        pool.splice(idx, 1);
    };
    if (cands.length >= 2) {
        // 抽 2 个有候选的格子 + 1 个杂格：候选 ≥2 ⇒ 至少 2 个单位参与，且必然互换成环
        const candPos = cands.map(u => u.pos);
        take(candPos);
        take(candPos);
        take(allPos.filter(p => !pick3.includes(p)));
    } else {
        // 只剩 1 个候选：它必须挪去空格（第 2 格取空格，第 3 格随便补）
        pick3.push(cands[0].pos);
        const emptyPos = allPos.filter(p => !team.some(u => u.pos === p));
        if (emptyPos.length === 0) return { swaps: [], pick3 };   // 九格全占（保留分支，正常路径不命中）
        take(emptyPos);
        take(allPos.filter(p => !pick3.includes(p)));
    }

    const units = cands.filter(u => pick3.includes(u.pos));
    if (units.length >= 2) {
        // 随机顺序串成环：每个单位挪到下一个单位的原位 ⇒ 全员必动、来源/目标互不冲突、无定点
        const order = units.slice();
        for (let i = order.length - 1; i > 0; i--) {
            const j = rng.nextInt(0, i);
            [order[i], order[j]] = [order[j], order[i]];
        }
        const fromPositions = order.map(u => u.pos);
        const result = order.map((u, i) => ({
            unit: u,
            fromPos: fromPositions[i],
            toPos: fromPositions[(i + 1) % order.length]
        }));
        for (const s of result) s.unit.pos = s.toPos;
        return { swaps: result, pick3 };
    }
    // 单个候选：直接挪到那个空格（位置必然不同）
    const u = units[0];
    const fromPos = u.pos;
    const toPos = pick3.find(p => !team.some(x => x.pos === p));
    u.pos = toPos;
    // 返回 pick3（被选中的 3 个格子）：fx 层落定时需要用它完整遍历 3 个格子，
    //   否则「原本空着但被分配了人」和「原本有人但被移空」两种情况都会演错。
    return { swaps: [{ unit: u, fromPos, toPos }], pick3 };
}

function applyMindControlCore(unit, allySide, enemySide, log, swapChanceEnemy, swapChanceAlly, enhance = null) {
    const rng = getBattleRng();
    // side 相对持有者视角派生（原写死 ENEMY/ALLY 只对明教持有正确）：
    //   明教持有 → 第一次 oppSide=ENEMY（六大派）、第二次 selfSide=ALLY（明教）；
    //   六大派持有 → 第一次 oppSide=ALLY（明教）、第二次 selfSide=ENEMY（六大派）。
    //   该值直接翻成 MIND_SWAP 的 camp（render/417）→ 604 animateMindSwap 的 getCellByPos 用。
    //   allySide 恒为持有者队伍（core/204 事件信号的 buff 挂在 allySide._activeBuffs 上），
    //   故 unit.camp 与 allySide 阵营一致，派生成立。
    const oppSide = unit.camp === CAMP_TYPES.ALLY ? CAMP_TYPES.ENEMY : CAMP_TYPES.ALLY;
    const selfSide = unit.camp;
    let frontUnit = allySide.filter(u => u.alive && !u.isHorse).sort((a,b) => a.pos - b.pos)[0];
    if (!frontUnit || frontUnit.uid !== unit.uid) return;

    log.push({ factType: FACT_TYPES.MIND_CONTROL_BANNER, data: { side: oppSide } });
    if (rng.nextInt(1,100) <= swapChanceEnemy) {
        const { swaps, pick3 } = shuffleThreeSlots(enemySide, rng);
        if (swaps.length > 0) {
            const hpPct = (enhance && enhance.hpPctSwap) || 0;
            if (hpPct > 0) {
                for (const s of swaps) {
                    if (s.unit.alive && !isPendingDeath(s.unit)) {
                        // 敌方：按当前生命比例扣血（逐单位各自算，不共用同一刀）
                        s.dmgAmt = Math.max(1, Math.floor(s.unit.hp * hpPct));
                        applyStatChange(s.unit, 'hp', -s.dmgAmt, null, '惑心换位');
                    }
                }
            }
            if (enhance && enhance.stunOnSwap) {
                for (const s of swaps) {
                    if (s.unit.alive && !isPendingDeath(s.unit)) {
                        s.unit.state._stunned = true;
                        emitEvent(s.unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp: s.unit.hp, maxHp: s.unit.maxHp, alive: s.unit.alive, atk: getStat(s.unit, 'atk'), def: getStat(s.unit, 'def'), _stunned: true });
                        emitStateChange(s.unit, STATE_CHANGE_TYPES.STUNNED, {}, log);
                    }
                }
            }
            for (const s of swaps) {
                emitEvent(s.unit, UNIT_EVENT_TYPES.POS_CHANGE, { pos: s.toPos });
                emitStateChange(s.unit, STATE_CHANGE_TYPES.POSITION, { fromPos: s.fromPos, toPos: s.toPos }, log);
            }
            log.push({ factType: FACT_TYPES.MIND_CONTROL_SWAP, data: { side: oppSide, swaps: swaps.map(s => ({ uid: s.unit.uid, name: s.unit.name, fromPos: s.fromPos, toPos: s.toPos, dmgAmt: s.dmgAmt || 0 })), allPositions: pick3, hpPct } });
        } else {
            log.push({ factType: FACT_TYPES.MIND_CONTROL_FAIL, data: { side: oppSide, reason: '无变化' } });
        }
    } else {
        log.push({ factType: FACT_TYPES.MIND_CONTROL_FAIL, data: { side: oppSide, reason: '未触发' } });
    }
    log.push({ factType: FACT_TYPES.MIND_CONTROL_BANNER, data: { side: selfSide } });
    if (rng.nextInt(1,100) <= swapChanceAlly) {
        const { swaps, pick3 } = shuffleThreeSlots(allySide, rng);
        if (swaps.length > 0) {
            const hpPct = (enhance && enhance.hpPctSwap) || 0;
            if (hpPct > 0) {
                for (const s of swaps) {
                    if (s.unit.alive && !isPendingDeath(s.unit)) {
                        // 己方：按最大生命比例回血（D5 口径，不看当前血）
                        s.healAmt = Math.max(1, Math.floor(s.unit.maxHp * hpPct));
                        applyStatChange(s.unit, 'hp', s.healAmt, unit, '惑心换位');
                    }
                }
            }
            for (const s of swaps) {
                emitEvent(s.unit, UNIT_EVENT_TYPES.POS_CHANGE, { pos: s.toPos });
                emitStateChange(s.unit, STATE_CHANGE_TYPES.POSITION, { fromPos: s.fromPos, toPos: s.toPos }, log);
            }
            log.push({ factType: FACT_TYPES.MIND_CONTROL_SWAP, data: { side: selfSide, swaps: swaps.map(s => ({ uid: s.unit.uid, name: s.unit.name, fromPos: s.fromPos, toPos: s.toPos, healAmt: s.healAmt || 0 })), allPositions: pick3, hpPct } });
        } else {
            log.push({ factType: FACT_TYPES.MIND_CONTROL_FAIL, data: { side: selfSide, reason: '无变化' } });
        }
    } else {
        log.push({ factType: FACT_TYPES.MIND_CONTROL_FAIL, data: { side: selfSide, reason: '未触发' } });
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