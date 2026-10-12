// modules/26elite-sixsects-songqingshu.js — 六大派精英「宋青书」：组件工厂 + 四大机制 handler 对象
// V6.25.0 | ~15800 bytes | 2026-10-13 自 modules/26elite-sixsects.js V6.24.2 拆出（纯搬移，数值/日志/fact 顺序零变化）：
//   createSongQingshuComponent + 苦练/快乐回血/性奋五助手 + chainClaw/kuLian/xinHun/xingFen 四个机制 handler 对象；
//   handler 由 modules/26elite-sixsects.js（注册入口）集中 registerMechanicHandler 注册（全项目统一集中注册口径）
export const VER = 'modules/26elite-sixsects-songqingshu.js V6.25.0';
import { getGameData } from '../core/01config-5v5-test.js';
import { applyStatChange, addMod, getBattleRng, refreshMaxHp } from '../core/13battle-shared.js';
import { getBenefitTargets } from '../core/03battle-utils.js';
import { processUnitAttack } from '../core/10battle-attack.js';
import { EFFECT_TYPES, EXECUTION_LAYER as L } from '../infra/50-event-bus.js';
import { SIGNAL_TYPES, FACT_TYPES, MECHANIC_TYPES } from '../infra/56-battle-enums.js';
import { fmtHp } from '../infra/51-core-utils.js';

// 宋青书
export function createSongQingshuComponent() {
    return {
        name: '宋青书',
        register(eventBus, A, B, log) {}
    };
}
// ========== 宋青书机制（从 core/15 搬出，走 registerMechanicHandler 注册） ==========

// 苦练前置：场上无周芷若时，宋青书成为受益者
function checkKuLian(allyTeam) {
    const song = allyTeam.find(u => u.isSongQingshu && u.alive);
    if (!song) return null;
    const zhou = allyTeam.find(u => u.isZhouZhiruo && u.alive);
    if (zhou) return null;
    return song;
}

// 快乐回血：每层按 healPct 回一次，层数推进到下一档。
// levels 真值唯一来源：宋青书 mechanics 里 type=MECHANIC_TYPES.XIN_HUN 的 healLevels（批 1 已删 skills.params 死副本）。
function tickKuaiLeHeal(allUnits, log, declarations) {
    const xinHunMech = (getGameData()?.characters?.['宋青书']?.mechanics || []).find(m => m && m.type === MECHANIC_TYPES.XIN_HUN);
    const levels = xinHunMech?.healLevels;
    if (!levels) throw new Error('缺技能参数: 宋青书.mechanics.xinHun.healLevels');
    allUnits.forEach(unit => {
        if (!unit.state._kuaiLeStack || unit.state._kuaiLeStack.length === 0) return;
        if (!unit.alive) return;
        let totalHeal = 0;
        const newStack = [];
        unit.state._kuaiLeStack.forEach(layer => {
            const healAmount = Math.floor(unit.maxHp * layer.healPct);
            totalHeal += healAmount;
            const currentIdx = levels.indexOf(layer.healPct);
            if (currentIdx >= 0 && currentIdx < levels.length - 1) newStack.push({ healPct: levels[currentIdx + 1] });
        });
        if (totalHeal > 0) {
            const hpBefore = Math.floor(unit.hp);
            const hpAfterPredicted = Math.min(unit.maxHp, unit.hp + totalHeal);
            if (declarations) {
                declarations.push({ type: EFFECT_TYPES.ROUND_STAT_GRANT, field: 'hp', delta: totalHeal, target: unit, source: null, reason: '快乐回血' });
                // 【临时验证用，验证后回滚】纯记账：快乐回血自身 hp 贡献以独立 group 隔离，供体检按 group='kuaiLeHeal' 比对
                addMod(unit, 'hp', { source: '快乐回血', value: totalHeal, ttl: 'permanent', group: 'kuaiLeHeal', op: 'add' });
            } else {
                applyStatChange(unit, 'hp', totalHeal, null, '快乐回血');
            }
            log.push({ factType: FACT_TYPES.KUAI_LE_HEAL, data: { unitName: unit.name, unitUid: unit.uid, heal: totalHeal, hpBefore: fmtHp(hpBefore), hpAfter: fmtHp(hpAfterPredicted), layers: unit.state._kuaiLeStack.length } });
        }
        Object.assign(unit.state, { _kuaiLeStack: newStack });
    });
}

// 性奋状态授予：周芷若存活时，宋青书本回合获得额外攻击机会
function applyXingFenGrant(allyTeam, log) {
    const zhou = allyTeam.find(u => u.isZhouZhiruo && u.alive);
    const song = allyTeam.find(u => u.isSongQingshu && u.alive);
    if (!zhou || !song) return;
    Object.assign(song.state, { _xingFenActive: true });
    log.push({ factType: FACT_TYPES.XING_FEN_GRANT, data: { zhouName: zhou.name, songName: song.name } });
}

function canXingFenTrigger(attacker) {
    if (!attacker.isSongQingshu) return false;
    if (!attacker.state._xingFenActive) return false;
    if (!attacker.alive) return false;
    return true;
}

function consumeXingFen(attacker) {
    Object.assign(attacker.state, { _xingFenActive: false });
}

// 机制① 九阴白骨爪连锁
export const chainClawHandler = {
    // jealous 为可选嫉妒态覆盖对象（张三丰在场时用），不进必需字段
    fields: {
        baseDmg: 'number', procChance: 'number', chainProcChance: 'number',
        lostHpRatio: 'number', maxHpRatio: 'number', executeThreshold: 'number'
    },
    install({ eventBus, decl }) {
        eventBus.on(SIGNAL_TYPES.AFTER_ATTACK, L.AFTER_ATTACK.CLAW, (data) => {
            const { unit, target, dmg, log, allySide, enemySide } = data;
            if (!unit || unit.name !== decl.name) return;
            if (!target || !target.alive) return;
            const rng = getBattleRng();
            const zhangAlive = enemySide && enemySide.some(u => u.isZhang && u.alive);
            const baseHit = zhangAlive ? decl.jealous?.baseDmg : decl.baseDmg;
            const s = zhangAlive ? { ...decl, ...(decl.jealous || {}) } : decl;
            if (!unit.state._nineYinFirstDone) Object.assign(unit.state, { _nineYinFirstDone: true });
            else if (rng.next() > s.procChance) return;

            const hits = [];
            let executeInfo = null;
            let totalHeal = 0;
            const song = allySide.find(u => u.isSongQingshu && u.alive);
            let simulatedTargetHp = target.hp;
            let simulatedSongHp = song ? song.hp : 0;
            let depth = 0;

            while (simulatedTargetHp > 0 && !target.state._pendingDeath && depth < 100) {
                if (depth > 0 && rng.next() > s.chainProcChance) break;
                const lostHp = target.maxHp - simulatedTargetHp;
                const ratioDmg = Math.floor((lostHp * s.lostHpRatio + target.maxHp * s.maxHpRatio) * 10) / 10;
                const bonusDmg = Math.floor((baseHit + Math.max(0, ratioDmg)) * 10) / 10;
                simulatedTargetHp -= bonusDmg;
                const isDeadByHit = simulatedTargetHp <= 0;
                const hpPctAfter = simulatedTargetHp / target.maxHp;
                const execThreshold = s.executeThreshold;
                const isExecute = !isDeadByHit && hpPctAfter <= execThreshold && simulatedTargetHp > 0;
                // hpAfter 出口洗一位小数：爪雨是「累减→重算」循环，simulatedTargetHp 浮点减法会攒尾巴（7.8000…001），
                //   不洗会渗进血条同步（player/46 HP_CHANGE）和下一爪的 lostHp 输入
                const hpAfterClean = Math.round(simulatedTargetHp * 10) / 10;
                hits.push({ dmg: bonusDmg, factType: FACT_TYPES.CLAW_HIT, data: { unitName: unit.name, targetName: target.name, dmg: bonusDmg, isExecute, jealous: zhangAlive, depth, hpAfter: hpAfterClean, targetUid: target.uid }, isClawHit: true, clawAttackerUid: unit.uid, clawTargetUid: target.uid, isExecute });
                if (song && song.alive) {
                    const healAmount = Math.min(bonusDmg, song.maxHp - simulatedSongHp);
                    totalHeal += healAmount;
                    simulatedSongHp += healAmount;
                }
                if (isDeadByHit) break;
                if (isExecute) {
                    executeInfo = { factType: FACT_TYPES.CLAW_EXECUTE, data: { unitName: unit.name, targetName: target.name, unitUid: unit.uid, targetUid: target.uid }, isClawHit: true, clawAttackerUid: unit.uid, clawTargetUid: target.uid, isExecute: true };
                    break;
                }
                depth++;
            }

            if (hits.length > 0 && data && data.declarations) {
                data.declarations.push({ type: EFFECT_TYPES.CLAW_CHAIN, source: unit, target, hits, execute: executeInfo });
            }
            if (totalHeal > 0 && song && song.alive && data && data.declarations) {
                data.declarations.push({ type: EFFECT_TYPES.HEAL, value: totalHeal, source: song, factType: FACT_TYPES.CLAW_HEAL, factData: { totalHeal, unitUid: song.uid } });
                // 【临时验证用，验证后回滚】纯记账：爪击回血自身 hp 贡献以独立 group 隔离，供体检按 group='clawHeal' 比对
                addMod(song, 'hp', { source: '爪击回血', value: totalHeal, ttl: 'permanent', group: 'clawHeal', op: 'add' });
            } else if (song && song.alive) {
                log.push({ factType: FACT_TYPES.CLAW_NO_HEAL, data: {} });
            }
        });
    }
};

// 机制② 苦练：全队永久属性加成，宋青书双倍；周芷若缺席时享有优先出手
export const kuLianHandler = {
    fields: { atkBonus: 'number', defBonus: 'number', hpBonus: 'number' },
    install({ eventBus, decl }) {
        const s = { atkBonus: decl.atkBonus, defBonus: decl.defBonus, hpBonus: decl.hpBonus };
        eventBus.on(SIGNAL_TYPES.ON_ROUND_START, L.ROUND_START.KULIAN_BUFF, (data) => {
            const B = data.B;
            const kuLianSong = checkKuLian(B);
            if (!kuLianSong) return;
            Object.assign(kuLianSong.state, { _kuLianActive: true });
            // 2026-10-07 苦练受益池收编 getBenefitTargets 裁判：原写法只排死人和拒马，
            // 垂死、天上蝶蛛、附身中的都能白吃加成——与乾坤衍生/振奋/生生不息溢出同口径
            const targets = getBenefitTargets(B);
            const kuLianTargets = [];
            for (const u of targets) {
                const mult = u.uid === kuLianSong.uid ? 2 : 1;
                // 实际增量提到变量：既给 addMod 也给下方 targets 名单，保证「声明 == 实际」逐人一致
                const atkDelta = s.atkBonus * mult;
                const defDelta = s.defBonus * mult;
                const maxHpDelta = s.hpBonus * mult;
                addMod(u, 'atk', { source: '苦练', value: atkDelta, ttl: 'permanent', group: 'kuLian', op: 'add' });
                addMod(u, 'def', { source: '苦练', value: defDelta, ttl: 'permanent', group: 'kuLian', op: 'add' });
                addMod(u, 'maxHp', { source: '苦练', value: maxHpDelta, ttl: 'permanent', group: 'kuLian', op: 'add' });
                refreshMaxHp(u, null, '苦练');
                kuLianTargets.push({ unitName: u.name, atkDelta, defDelta, maxHpDelta });
            }
            data.log.push({ factType: FACT_TYPES.KU_LIAN_PRIORITY, data: { unitName: kuLianSong.name } });
            // 数值声明 fact：原字段（unitName/atkBonus/defBonus/hpBonus）保留给渲染不动画面；
            // 新增 targets 名单——每人实际已乘 mult 的增量，供体检对照器按 group='kuLian' 逐人比对。
            // 坑点：原来只发未乘 mult 的原始值，本人那一份（×2）会被对照器判成翻倍，故必须走 targets。
            data.log.push({ factType: FACT_TYPES.KU_LIAN, data: { unitName: kuLianSong.name, atkBonus: s.atkBonus, defBonus: s.defBonus, hpBonus: s.hpBonus, targets: kuLianTargets } });
        });
        eventBus.on(SIGNAL_TYPES.BEFORE_ACTION_SELECT, L.BEFORE_ACTION.KULIAN_PRIORITY, (data) => {
            if (!data.unit.isSongQingshu || !data.unit.alive) return;
            const zhou = data.allySide && data.allySide.find(u => u.isZhouZhiruo && u.alive);
            if (!zhou) data.declaration.priority = 1;
        });
    }
};

// 机制③ 新婚：宋青书攻击后扣周芷若血、叠快乐层、自身永久减上限（性奋代价）
export const xinHunHandler = {
    fields: { hpDeduct: 'number', healLevels: 'numberArray' },
    install({ eventBus, decl }) {
        eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.XINGFEN, (data) => {
            const { unit, allySide, log } = data;
            if (!unit || unit.name !== decl.name || !unit.alive) return;
            const zhou = allySide.find(u => u.isZhouZhiruo && u.alive);
            if (!zhou) return;
            const hpDeduct = decl.hpDeduct;
            const healLevels = decl.healLevels;
            applyStatChange(zhou, 'hp', -hpDeduct, unit, '新婚扣血', false);
            zhou.state._kuaiLeStack.push({ healPct: healLevels[0] });
            if (zhou.hp <= 0) { if (!zhou.state._deathTime) zhou.state._deathTime = Date.now(); }
            log.push({ factType: FACT_TYPES.XIN_HUN, data: { attackerName: unit.name, targetName: zhou.name, hpDeduct, healPct: healLevels[0], stackCount: zhou.state._kuaiLeStack.length, zhouUid: zhou.uid, zhouHpAfter: zhou.hp, isDead: !!zhou._pendingDeath } });
            if (zhou.state._pendingDeath) log.push({ factType: FACT_TYPES.XIN_HUN_DEATH, data: { unitName: zhou.name, uidD: zhou.uid } });
            Object.assign(unit.state, { _xingFenPenaltyCount: (unit.state._xingFenPenaltyCount || 0) + 1 });
            // 本次减上限 = 当前累计攻击次数（第 1 次 -1、第 2 次 -2、第 3 次 -3…）
            const penalty = unit.state._xingFenPenaltyCount;
            if (penalty > 0 && unit.maxHp > 1) {
                const oldMaxHp = unit.maxHp;
                addMod(unit, 'maxHp', { source: '性奋代价', value: -penalty, ttl: 'permanent', group: 'xingFenCost', op: 'add' });
                refreshMaxHp(unit, null, '性奋代价');
                log.push({ factType: FACT_TYPES.XING_FEN_COST, data: { unitName: unit.name, oldMaxHp, newMaxHp: Math.floor(unit.maxHp), penalty } });
            }
        });
    }
};

// 机制④ 性奋：回合开始授予；命中后额外攻击；未命中重试
export const xingFenHandler = {
    install({ eventBus, decl }) {
        eventBus.on(SIGNAL_TYPES.ON_ROUND_START, L.ROUND_START.XINGFEN_GRANT, (data) => {
            applyXingFenGrant(data.B, data.log);
            tickKuaiLeHeal(data.A.concat(data.B), data.log, data.declarations);
        });
        eventBus.on(SIGNAL_TYPES.AFTER_ATTACK, L.AFTER_ATTACK.XINGFEN_EXTRA, (data) => {
            const { unit, allySide, enemySide, log } = data;
            if (!unit || unit.name !== decl.name || !unit.isSongQingshu || !unit.alive || unit.state._xingFenExtraAttacking) return;
            if (!canXingFenTrigger(unit)) return;
            consumeXingFen(unit);
            log.push({ factType: FACT_TYPES.XING_FEN_EXTRA_ATTACK, data: { unitName: unit.name } });
            unit.state._xingFenExtraAttacking = true;
            processUnitAttack(unit, allySide, enemySide, log, data.A, data.B, data.state, null, null);
            unit.state._xingFenExtraAttacking = false;
        });
        eventBus.on(SIGNAL_TYPES.AFTER_MISS, L.AFTER_MISS.XINGFEN_RETRY, (data) => {
            const { unit, allySide, enemySide, log } = data;
            if (!unit || unit.name !== decl.name || !unit.isSongQingshu || !unit.alive) return;
            if (canXingFenTrigger(unit)) {
                consumeXingFen(unit);
                log.push({ factType: FACT_TYPES.XING_FEN_RETRY, data: { unitName: unit.name } });
                processUnitAttack(unit, allySide, enemySide, log, data.A, data.B, data.state, null, null);
            }
        });
    }
};
