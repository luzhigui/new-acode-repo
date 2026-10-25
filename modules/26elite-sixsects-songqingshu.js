// modules/26elite-sixsects-songqingshu.js — 宋青书（叛逆突袭 / 苦练 / 新婚 / 性奋 / 白骨爪连锁）
// 白骨爪连锁概率：基础 0.80，按周芷若自身已损血比线性升到 1.00，无存活宋青书再 +0.10（可超 1.00，等价「保底必连几爪」）；
//   链条内每多连一爪概率 −0.01，累减到 ≤0 必断——这是「不会无限连」的唯一保证，不要改成固定概率。
// V6.28.2 | 2026-10-22 | ~17900 bytes
export const VER = 'modules/26elite-sixsects-songqingshu.js V6.28.2';
import { getGameData } from '../core/01config-5v5-test.js';
import { applyStatChange, addMod, getBattleRng, refreshMaxHp, recordHpAudit, previewHeal } from '../core/13battle-shared.js';
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
            // 飘字取实际落地值（截脉/寒毒打折后）
            const actualHeal = previewHeal(unit, totalHeal);
            const hpAfterPredicted = hpBefore + actualHeal;
            if (declarations) {
                declarations.push({ type: EFFECT_TYPES.ROUND_STAT_GRANT, field: 'hp', delta: totalHeal, target: unit, source: null, reason: '快乐回血' });
                // 审计账本：快乐回血自身 hp 贡献记进 unit._audit.hp，供体检按 group='kuaiLeHeal' 比对
                recordHpAudit(unit, 'kuaiLeHeal', actualHeal, '快乐回血'); // 账本记实际落地值（与 fact heal 同口径）
            } else {
                applyStatChange(unit, 'hp', totalHeal, null, '快乐回血');
            }
            log.push({ factType: FACT_TYPES.KUAI_LE_HEAL, data: { unitName: unit.name, unitUid: unit.uid, heal: actualHeal, hpBefore: fmtHp(hpBefore), hpAfter: fmtHp(hpAfterPredicted), layers: unit.state._kuaiLeStack.length } });
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
        baseDmg: 'number', chainProcChance: 'number', chainProcMax: 'number',
        chainProcRampAt: 'number', songDeadBonus: 'number', chainProcDecay: 'number',
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
            // 首爪必发（老板拍板）：取消「每回合首次出手」的进入门槛，每次出手第一爪都必发，
            //   只有后续每爪才掷骰（见下方 while 循环）。
            // 连锁概率终版（老板拍板）：满血基准 chainProcChance(0.80)，按周芷若**自身**已损失血量
            //   线性升到 0 血时的 chainProcMax(1.00)——已损失比达到 chainProcRampAt(1.00) 到顶；
            //   场上无存活宋青书再 +songDeadBonus(0.10)，理论上可超 1.00（超过的部分等价「保底必连几爪」）；
            //   链条内每多连一爪概率 −chainProcDecay(0.01)，累减到 ≤0 必断（天然保证不会无限连）；
            //   chainProb 每次出手现算，故她下次出手自动回复原值。
            const selfLostRatio = unit.maxHp > 0 ? Math.max(0, (unit.maxHp - unit.hp) / unit.maxHp) : 0;
            const rampT = s.chainProcRampAt > 0 ? Math.min(selfLostRatio / s.chainProcRampAt, 1) : 1;
            const song = allySide.find(u => u.isSongQingshu && u.alive);
            let chainProb = s.chainProcChance + (s.chainProcMax - s.chainProcChance) * rampT;
            if (!song) chainProb += s.songDeadBonus;

            const hits = [];
            let executeInfo = null;
            let totalHeal = 0;
            let simulatedTargetHp = target.hp;
            let simulatedSongHp = song ? song.hp : 0;
            let depth = 0;

            while (simulatedTargetHp > 0 && !target.state._pendingDeath && depth < 100) {
                if (depth > 0 && rng.next() > chainProb - (depth - 1) * s.chainProcDecay) break;
                const lostHp = target.maxHp - simulatedTargetHp;
                const ratioDmg = Math.floor((lostHp * s.lostHpRatio + target.maxHp * s.maxHpRatio) * 10) / 10;
                const bonusDmg = Math.floor((baseHit + Math.max(0, ratioDmg)) * 10) / 10;
                simulatedTargetHp -= bonusDmg;
                const isDeadByHit = simulatedTargetHp <= 0;
                const hpPctAfter = simulatedTargetHp / target.maxHp;
                const execThreshold = s.executeThreshold;
                const isExecute = !isDeadByHit && hpPctAfter <= execThreshold && simulatedTargetHp > 0;
                // hpAfter 出口洗一位小数：连锁是「累减→重算」循环，simulatedTargetHp 浮点减法会攒尾巴（7.8000…001），
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
                    // 斩杀那一刀同样回血给宋青书（老板拍板）：斩杀伤害=目标残血（设计值，
                    //   core/16 落地时取扣减后同口径），按每爪同公式计入 totalHeal
                    if (song && song.alive) {
                        const execHeal = Math.min(Math.round(simulatedTargetHp), song.maxHp - simulatedSongHp);
                        if (execHeal > 0) { totalHeal += execHeal; simulatedSongHp += execHeal; }
                    }
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
                // 审计账本：爪击回血自身 hp 贡献记进 unit._audit.hp，供体检按 group='clawHeal' 比对
                recordHpAudit(song, 'clawHeal', totalHeal, '爪击回血');
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
            // 苦练受益池收编 getBenefitTargets 裁判：原写法只排死人和拒马，
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
            log.push({ factType: FACT_TYPES.XIN_HUN, data: { attackerName: unit.name, targetName: zhou.name, hpDeduct, healPct: healLevels[0], stackCount: zhou.state._kuaiLeStack.length, zhouUid: zhou.uid, zhouHpAfter: zhou.hp } });
            if (zhou.state._pendingDeath) log.push({ factType: FACT_TYPES.XIN_HUN_DEATH, data: { unitName: zhou.name, uidD: zhou.uid } });
            Object.assign(unit.state, { _xingFenPenaltyCount: (unit.state._xingFenPenaltyCount || 0) + 1 });
            // 首攻免扣（老板拍板）：本次减上限 = 累计攻击次数 − 1（第 1 次不扣、第 2 次 -1、第 3 次 -2…）
            const penalty = unit.state._xingFenPenaltyCount - 1;
            if (penalty > 0 && unit.maxHp > 1) {
                const oldMaxHp = unit.maxHp;
                addMod(unit, 'maxHp', { source: '性奋代价', value: -penalty, ttl: 'permanent', group: 'xingFenCost', op: 'add' });
                refreshMaxHp(unit, null, '性奋代价');
                log.push({ factType: FACT_TYPES.XING_FEN_COST, data: { unitName: unit.name, oldMaxHp, newMaxHp: Math.floor(unit.maxHp), penalty } });
            }
        });
    }
};

// 性奋额外攻击的出手体（命中后 / 本击被免疫后共用）：重新选敌打第二下
function xingFenExtraAttack(data, decl) {
    const { unit, allySide, enemySide, log } = data;
    if (!unit || unit.name !== decl.name || !unit.isSongQingshu || !unit.alive || unit.state._xingFenExtraAttacking) return;
    if (!canXingFenTrigger(unit)) return;
    consumeXingFen(unit);
    log.push({ factType: FACT_TYPES.XING_FEN_EXTRA_ATTACK, data: { unitName: unit.name } });
    unit.state._xingFenExtraAttacking = true;
    processUnitAttack(unit, allySide, enemySide, log, data.A, data.B, data.state, null, null);
    unit.state._xingFenExtraAttacking = false;
}

// 机制④ 性奋：回合开始授予；命中后额外攻击；本击被免疫（妹妹飞天）同样算一次出手；未命中重试
export const xingFenHandler = {
    install({ eventBus, decl }) {
        eventBus.on(SIGNAL_TYPES.ON_ROUND_START, L.ROUND_START.XINGFEN_GRANT, (data) => {
            applyXingFenGrant(data.B, data.log);
            tickKuaiLeHeal(data.A.concat(data.B), data.log, data.declarations);
        });
        eventBus.on(SIGNAL_TYPES.AFTER_ATTACK, L.AFTER_ATTACK.XINGFEN_EXTRA, (data) => xingFenExtraAttack(data, decl));
        // 本击被免疫（AFTER_ATTACK_IMMUNE）也算一次出手：免疫分支不广播 AFTER_ATTACK，
        //   走专用信号让性奋额外攻击照发并重新选敌——第一下打妹妹飞天 → 第二下改打别人
        eventBus.on(SIGNAL_TYPES.AFTER_ATTACK_IMMUNE, L.AFTER_ATTACK_IMMUNE.XINGFEN_EXTRA, (data) => xingFenExtraAttack(data, decl));
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
