﻿/// core/48battle-round.js - 光明顶5v5 回合循环与生成器
// V5.2.2 | ~22000 bytes | 2026-07-28 迁移光环和联动至事件总线
export const VER = 'core/48battle-round.js V5.2.2';

import { CONFIG } from './01config-5v5-test.js';
import { rand, isMelee, isBlocked, makeFXSnapshot, hasBuff, getUnitCol, getUnitRow, hasAnyEnemyEmptyCol, countEnemyEmptyCols, getBloodAuraBonus, registerWarriorBreakDefense, registerRangedGrowth, registerFortifyShield, selectFlyTarget } from './03battle-utils.js';
import { computeBuffStats, logBuffSummary, applyHolyFlameBonus, applyFortifyBonus, registerBloodthirst, registerHotBlood, registerWindAssault, registerMeteorShower, registerMindControl } from './04buff-system.js';
import { spawnHorse, destroyHorse } from './05battle-horse.js';
import { Unit } from './02unit.js';
import {
    checkKuLian, applyXingFenGrant, tickXuanmingPoison, tickKuaiLeHeal,
    butterflyAttach, butterflyReturn, spiderTransform, spiderFlyCheck, spiderReturn,
    canXingFenTrigger, consumeXingFen, applyXingFenPenalty, isXiaoZhaoPermanentActive,
    getXiaoZhaoHexEnhance
} from '../modules/23elite-skills.js';
import { createZhangWujiComponent, createWeiYixiaoComponent, createXiaoZhaoSisterComponent, createXiaoZhaoBrotherComponent } from '../modules/99elite-mingjiao.js';
import { createSongQingshuComponent, createZhouZhiruoComponent } from '../modules/98elite-sixsects.js';
import { createChengKunComponent, createLuZhangKeComponent, createHeBiWengComponent } from '../modules/97elite-imperial.js';
import { processUnitAttack } from './47battle-attack.js';
import { eventBus } from './00-event-bus.js';
import { getNextAvailableUnit, finalizeDeaths, emitFullUnitState, checkZhangSwitch } from './50battle-shared.js';

const C = CONFIG;

// ==================== 回合级监听器 ====================

function registerEmptyColBonus(eventBus) {
    eventBus.on('afterAttack', 100, (data) => {
        const { allySide, enemySide, log } = data;
        const A = allySide, B = enemySide;
        if (!A || !B) return;
        const allyEmptyCols = countEnemyEmptyCols(B);
        const enemyEmptyCols = countEnemyEmptyCols(A);
        const allUnits = A.concat(B);
        const bloodBonus = getBloodAuraBonus(allUnits);
        const allyFlyers = A.filter(u => u.role === '飞行' && u.alive && !u.isHorse);
        const enemyFlyers = B.filter(u => u.role === '飞行' && u.alive && !u.isHorse);
        allyFlyers.forEach(u => {
            u._emptyColBonus = allyEmptyCols * 5;
            u._bloodAuraBonus = bloodBonus;
            u.atk = (u._baseAtk || u.atk) + (u._emptyColBonus || 0) + (u._bloodAuraBonus || 0);
        });
        enemyFlyers.forEach(u => {
            u._emptyColBonus = enemyEmptyCols * 5;
            u._bloodAuraBonus = bloodBonus;
            u.atk = (u._baseAtk || u.atk) + (u._emptyColBonus || 0) + (u._bloodAuraBonus || 0);
        });
    });
}

function registerXuanmingLink(eventBus) {
    eventBus.on('afterAttack', 10, (data) => {
        const { unit, target, dmg, allySide, enemySide, log, A, B, state } = data;
        if (!unit || unit._isLinkAttack || dmg <= 0 || !target || !target.alive) return;
        const isLuOrHe = (unit.name === '鹿杖客' || unit.name === '鹤笔翁');
        if (!isLuOrHe) return;
        const partnerName = unit.name === '鹿杖客' ? '鹤笔翁' : '鹿杖客';
        const partner = allySide.find(u => u.name === partnerName && u.alive && !u._linkTriggered);
        if (!partner) return;
        const wasActed = partner._acted;
        partner._isLinkAttack = true;
        partner._linkTriggered = true;
        partner._acted = false;
        log.push({type:'info', text:`<span class="gold">🔗 ${partner.name} 跟随 ${unit.name} 发动联动攻击！</span>`});
        processUnitAttack(partner, allySide, enemySide, log, A, B, state, null, target.uid);
        partner._isLinkAttack = false;
        if (wasActed) partner._acted = true;
    });
}

// ==================== 回合生成器 ====================

export function* createRoundStepper(state) {
    if (!state.allAllies) {
        state.allAllies = state.ally.map(u => u.clone());
    } else {
        const allyById = new Map(state.ally.map(u => [u.uid, u]));
        state.allAllies.forEach(full => {
            const cur = allyById.get(full.uid);
            if (cur) {
                full.hp = cur.hp; full.maxHp = cur.maxHp; full.alive = cur.alive;
                full.atk = cur.atk; full.def = cur.def;
                if (cur._isDead !== undefined) full._isDead = cur._isDead;
            } else {
                full.alive = false; full._isDead = true;
            }
        });
    }
    let A = state.ally.filter(u => u.alive).map(u => u.clone());
    let B = state.enemy.filter(u => u.alive).map(u => u.clone());
    let log = [];
    let round = state.round;

    A._activeBuffs = state.activeBuffs.filter(b => b.target === 'ally' || !b.target);
    B._activeBuffs = state.activeBuffs.filter(b => b.target === 'enemy');

    const xiaoZhao = A.find(u => (u.isXiaoZhaoSister || u.isXiaoZhaoBrother) && u.alive);

    window._battleEvents = [];
    GlobalStore.set('currentBattleState', null);
    if (window.GlobalStore) { window.GlobalStore.flushBattleEvents(); }

    log.push({ type:'round-start', text:`<div class="separator">———— 第${round}回合开始 ————</div>` });

    tickKuaiLeHeal(A.concat(B), log);

    A.concat(B).forEach(u => {
        if (!u.alive) return;
        const dot = tickXuanmingPoison(u);
        if (dot > 0) {
            log.push({ type:'info', text:`<span class="purple">❄️ 玄冥神掌寒毒发作，${u.name} 受到 ${dot} 点伤害</span>`, uidD: u.uid, isDead: !u.alive });
        }
    });

    [A, B].forEach(team => {
        for (let i = team.length - 1; i >= 0; i--) {
            const u = team[i];
            if (u.isHorse && !u.alive) {
                team.splice(i, 1);
            }
        }
    });
    const teamHorseA = spawnHorse(A, log, B);
    if (teamHorseA) {
        log.push({type:'buff-summon', text:`<span class="gold">🐴 拒马阵：拒马出现在${teamHorseA.pos}号位！</span>`, buffType:'summon', horsePos: teamHorseA.pos, horseUid: teamHorseA.uid, horseTaunt: '嘶——！'});
    }
    const teamHorseB = spawnHorse(B, log, A);
    if (teamHorseB) {
        log.push({type:'buff-summon', text:`<span class="gold">🐴 拒马阵：拒马出现在${teamHorseB.pos}号位！</span>`, buffType:'summon', horsePos: teamHorseB.pos, horseUid: teamHorseB.uid, horseTaunt: '嘶——！'});
    }

    applyXingFenGrant(B, log);

    A.forEach(u => {
        if (u.isXiaoZhaoSister && u.alive) { /* 姐的附身在明教首次攻击前触发，由47处理 */ }
        if (u.isXiaoZhaoBrother && u.alive) {
            spiderTransform(u, log);
            if (u._spiderTriggeredHit === undefined) u._spiderTriggeredHit = false;
            if (u._spiderTriggered70 === undefined) u._spiderTriggered70 = false;
            if (u._spiderTriggered40 === undefined) u._spiderTriggered40 = false;
        }
    });

    let teamHasHorse = hasBuff(A._activeBuffs, 'horseFormation');
    let hasPermanentHorse = xiaoZhao && xiaoZhao.isXiaoZhaoBrother && !teamHasHorse && xiaoZhao._permanentBuffs && xiaoZhao._permanentBuffs.some(b => b.key === 'horseFormation');
    if (!hasPermanentHorse) {
        hasPermanentHorse = xiaoZhao && xiaoZhao.isXiaoZhaoBrother && !teamHasHorse && xiaoZhao._permanentBuffs && xiaoZhao._permanentBuffs.some(b => b.key === 'horseFormation');
    }
    if (hasPermanentHorse) {
        const xzHorse = spawnHorse(A, log, B, true);
        if (xzHorse) {
            xzHorse.atk = 0;
            xzHorse.def = 25;
            xzHorse.maxHp = 25;
            xzHorse.hp = 25;
            log.push({type:'buff-summon', text:`<span class="gold">🐴 小昭的拒马在${xzHorse.pos}号位出现！</span>`, buffType:'summon', horsePos: xzHorse.pos, horseUid: xzHorse.uid, horseTaunt: '嗷——！'});
        }
    }

    const kuLianSong = checkKuLian(B);
    if (kuLianSong) {
        kuLianSong._kuLianActive = true;
        const s = CONFIG.ELITE_SKILLS.kuLian;
        B.forEach(u => {
            if (!u.alive || u.isHorse) return;
            const mult = u.uid === kuLianSong.uid ? 2 : 1;
            u.atk += s.atkBonus * mult;
            u.def += s.defBonus * mult;
            u.maxHp += s.hpBonus * mult;
            u._baseAtk = (u._baseAtk || u.atk) + s.atkBonus * mult;
            u._baseDef = (u._baseDef || u.def) + s.defBonus * mult;
            u._baseMaxHp = Math.max(u._baseMaxHp || u.maxHp, u.maxHp);
            u.hp = Math.min(u.hp + s.hpBonus * mult, u.maxHp);
            if (typeof window._emitEvent === 'function') {
                window._emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def });
            }
        });
        log.push({ type:'info', text:`<span class="gold">🏋️ 苦练：${kuLianSong.name} 激励全体队友+${s.atkBonus}攻+${s.defBonus}防+${s.hpBonus}血上限（自身翻倍）！</span>` });
    }

    let doubleStrikeUnitUid = null;
    if (hasBuff(A._activeBuffs, 'doubleStrike')) {
        let candidates = A.filter(u => u.alive && !u.isHorse);
        if (candidates.length > 0) {
            let chosen = candidates[rand(0, candidates.length - 1)];
            doubleStrikeUnitUid = chosen.uid;
        }
    }

    GlobalStore.set('currentBattleState', { ally: state.allAllies, enemy: state.enemy });

    if (doubleStrikeUnitUid) {
        const dsUnit = A.find(u => u.uid === doubleStrikeUnitUid);
        if (dsUnit) log.push({type:'buff-summary', text:`<span class="gold">⚡ 概率连击：${dsUnit.name} 80%概率额外攻击一次</span>`, buffType:'buff_stat'});
    }

    log.filter(l => l.type === 'buff-summon').forEach(hl => {
        const team = hl.buffType === 'summon' ? A : B;
        const horse = team.find(u => u.uid === hl.horseUid);
        if (horse) {
            emitFullUnitState(horse, 'unit-add');
        }
    });

    // 提前生成圣火令行列，确保 UI 渲染时 cols/rows 已存在
    A.forEach(u => {
        if (u.alive && u.camp === 'ally') {
            applyHolyFlameBonus(u, A._activeBuffs || []);
        }
    });

    eventBus.clearAll();
    const xiaoBrother = A.find(u => u.isXiaoZhaoBrother && u.alive);
    if (xiaoBrother) {
        const brotherComp = createXiaoZhaoBrotherComponent();
        eventBus.on('beforeDamageApply', 100, (data) => {
            if (data.target.uid === xiaoBrother.uid && data.A) {
                const immune = brotherComp.onBeforeDeath(data.target, data.dmg, data.A, data.log);
                if (immune) data.result.immune = true;
            }
        });
    }

    // 注册所有监听器
    registerWarriorBreakDefense(eventBus);
    registerRangedGrowth(eventBus);
    registerFortifyShield(eventBus);
    registerBloodthirst(eventBus);
    registerHotBlood(eventBus);
    registerWindAssault(eventBus);
    registerMeteorShower(eventBus);
    registerMindControl(eventBus);
    // 飞行突进目标选择
    eventBus.on('beforeSelectTarget', 30, (data) => {
        if (data.unit.role !== '飞行' || data.unit.isWei) return;
        const flyTarget = selectFlyTarget(data.unit, data.enemySide);
        if (flyTarget) data.targetResult = flyTarget;
    });
    // 概率连击监听器
    if (doubleStrikeUnitUid) {
        eventBus.on('afterMiss', 40, (data) => {
            const { unit, target, log } = data;
            if (unit.uid !== doubleStrikeUnitUid || !unit.alive || unit.camp !== 'ally' || unit._doubleStriked) return;
            const xiaoDoubleEnhance = getXiaoZhaoHexEnhance(A, A._activeBuffs, 'doubleStrike');
            const missChainChance = xiaoDoubleEnhance ? 1.0 : 0.8;
            if (Math.random() < missChainChance) {
                log.push({type:'info', text:`<span class="gold">⚡ 概率连击触发！</span>`, isDoubleStrikeBanner:true});
                unit._doubleStriked = true; unit._acted = false;
                data.retry = true; data.retryTargetUid = (target && target.alive) ? target.uid : null;
            } else {
                log.push({type:'info', text:`<span class="gray">⚡ 概率连击触发失败，${unit.name} 未能再次攻击</span>`});
            }
        });
    }
    // 宋青书未命中后性奋重试
    eventBus.on('afterMiss', 50, (data) => {
        const { unit, log } = data;
        if (unit.name !== '宋青书' || !unit.alive) return;
        const B = unit.camp === 'enemy' ? A : null;
        if (!B || !B.some(u => u.alive)) return;
        if (canXingFenTrigger(unit)) {
            consumeXingFen(unit);
            log.push({type:'info', text:`<span class="gold">💗 性奋：${unit.name} 获得额外攻击机会！</span>`});
            data.retry = true;
            data.retryTargetUid = null;
        }
    });
    // 小昭永久概率连击
    eventBus.on('afterMiss', 60, (data) => {
        const { unit, target, log } = data;
        if (!unit.isXiaoZhaoBrother || !unit.alive || unit._xiaoZhaoDoubleStriked) return;
        if (!unit._permanentBuffs || !unit._permanentBuffs.some(b => b.key === 'doubleStrike')) return;
        if (hasBuff(A._activeBuffs, 'doubleStrike')) return;
        const chance = (CONFIG.ELITE_SKILLS.xiaoZhaoDoubleStrike && CONFIG.ELITE_SKILLS.xiaoZhaoDoubleStrike.chance) ? CONFIG.ELITE_SKILLS.xiaoZhaoDoubleStrike.chance * 100 : 80;
        if (rand(1, 100) <= chance) {
            unit._xiaoZhaoDoubleStriked = true;
            unit._acted = false;
            log.push({type:'info', text:`<span class="gold">🦋 蝶击：小昭永久概率连击触发！</span>`, isDoubleStrikeBanner:true});
            data.retry = true;
            data.retryTargetUid = (target && target.alive) ? target.uid : null;
        }
    });
    registerEmptyColBonus(eventBus);
    registerXuanmingLink(eventBus);

    // 注册精英组件钩子
    A.forEach(u => {
        if (!u.alive) return;
        if (u.isZhang) createZhangWujiComponent().register(eventBus, A, B, log);
        if (u.isWei) createWeiYixiaoComponent().register(eventBus, A, B, log);
        if (u.isXiaoZhaoBrother) createXiaoZhaoBrotherComponent().register(eventBus, A, B, log);
        if (u.isXiaoZhaoSister) {
            const sisterComp = createXiaoZhaoSisterComponent();
            A._sisterComp = sisterComp;
            eventBus.on('allyDamaged', 50, (data) => {
                const xiaoZhao = A.find(u => u.isXiaoZhaoSister && u.alive && !u._stunned);
                if (!xiaoZhao) return;
                const zhang = A.find(u => u.isZhang && u.alive);
                if (zhang) return;
                sisterComp.onAllyDamaged(data.target, data.dmg, A, null);
            });
        }
    });
    B.forEach(u => {
        if (!u.alive) return;
        if (u.name === '宋青书') createSongQingshuComponent().register(eventBus, A, B, log);
        if (u.name === '周芷若') createZhouZhiruoComponent().register(eventBus, A, B, log);
        if (u.name === '成昆') createChengKunComponent().register(eventBus, A, B, log);
        if (u.name === '鹿杖客') createLuZhangKeComponent().register(eventBus, A, B, log);
        if (u.name === '鹤笔翁') createHeBiWengComponent().register(eventBus, A, B, log);
    });

    // 建立精英联动引用（替代硬搜名字）
    const song = B.find(u => u.name === '宋青书' && u.alive);
    const zhou = B.find(u => u.name === '周芷若' && u.alive);
    if (song && zhou) { song._linkedPartnerUid = zhou.uid; zhou._linkedPartnerUid = song.uid; }
    const lu = B.find(u => u.name === '鹿杖客' && u.alive);
    const he = B.find(u => u.name === '鹤笔翁' && u.alive);
    if (lu && he) { lu._linkedPartnerUid = he.uid; he._linkedPartnerUid = lu.uid; }

    A._butterflyTriggered = false;
    A.forEach(u => {
        if (!u.alive) return;
        let allyTeamWithDead = A.slice();
        let hasCarryActive = hasBuff(A._activeBuffs, 'carry') || (u.isXiaoZhaoBrother && isXiaoZhaoPermanentActive(u, A._activeBuffs, 'carry'));
        if (hasCarryActive) {
            allyTeamWithDead = allyTeamWithDead.concat((state.allAllies || state.ally).filter(c => !c.alive));
            allyTeamWithDead = allyTeamWithDead.filter((u, i, arr) => arr.findIndex(v => v.uid === u.uid) === i);
        }
        let stats = computeBuffStats(u, A._activeBuffs || [], allyTeamWithDead);

        applyHolyFlameBonus(u, A._activeBuffs || []);
        applyFortifyBonus(u, A._activeBuffs || []);

        if (typeof window._emitEvent === 'function') {
            window._emitEvent(u, 'stat-bonus-change', {
                buffAtkBonus: stats.atkBonus,
                buffDefBonus: stats.defBonus,
                buffDodgeBonus: stats.dodgeBonus,
                buffHpBonus: stats.hpBonus
            });
        }

        const sister = A.some(a => a.isXiaoZhaoSister && a.alive);
        const carryPositions = sister ? [4, 5, 6] : [5];
        if (hasCarryActive && carryPositions.includes(u.pos) && u._baseMaxHp !== undefined && !u.isHorse && !u.isZhang && !u.isXiaoZhao) {
            if (u.maxHp > 0 && u._baseMaxHp > 0) {
                u.hp = Math.floor(u.hp * (u._baseMaxHp / u.maxHp));
            }
            u.maxHp = u._baseMaxHp;
            if (u._baseAtk !== undefined) u.atk = u._baseAtk + (u._carryAtkBonus || 0) + (u._butterflyAtkBonus || 0);
            if (u._baseDef !== undefined) u.def = u._baseDef + (u._carryDefBonus || 0) + (u._butterflyDefBonus || 0);

            u._carryAtkBonus = Math.floor(stats.carryAtkAbs);
            u._carryDefBonus = Math.floor(stats.carryDefAbs);
            u._carryHpBonus = Math.floor(stats.carryHpAbs);

            u.atk = (u._baseAtk || u.atk) + u._carryAtkBonus + (u._butterflyAtkBonus || 0);
            u.def = (u._baseDef || u.def) + u._carryDefBonus + (u._butterflyDefBonus || 0);

            if (u._carryHpBonus) {
                let newMaxHp = Math.min(u._baseMaxHp + u._carryHpBonus, u._baseMaxHp * 2);
                let extraHp = newMaxHp - u.maxHp;
                if (extraHp > 0) u.hp += extraHp;
                u.maxHp = newMaxHp;
            }
            if (typeof window._emitEvent === 'function') {
                window._emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def });
            }
            if (stats.carryAtkAbs || stats.carryDefAbs || stats.carryHpAbs) {
                log.push({ type:'info', text:`<span class="gold">👑 carry：${u.name} 获得队友属性加成 攻+${stats.carryAtkAbs} 防+${stats.carryDefAbs} 血上限+${stats.carryHpAbs}</span>` });
            }
        } else if (!u.isHorse && !hasCarryActive && !u.isXiaoZhao && !u.isZhang && !u.isXiaoZhao) {
            const sister = A.some(a => a.isXiaoZhaoSister && a.alive);
            const carryPositions = sister ? [4, 5, 6] : [5];
            if (carryPositions.includes(u.pos) && (u._carryAtkBonus || u._carryDefBonus || u._carryHpBonus)) {
                if (u._carryHpBonus && u._baseMaxHp > 0 && u.maxHp > 0) {
                    u.hp = Math.floor(u.hp * (u._baseMaxHp / u.maxHp));
                }
                if (u._carryHpBonus) u.maxHp = u._baseMaxHp;
                u._carryAtkBonus = 0;
                u._carryDefBonus = 0;
                u._carryHpBonus = 0;
                u.atk = (u._baseAtk || u.atk) + (u._butterflyAtkBonus || 0);
                u.def = (u._baseDef || u.def) + (u._butterflyDefBonus || 0);
                if (typeof window._emitEvent === 'function') {
                    window._emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def });
                }
            }
        } else if (u.isXiaoZhaoBrother && isXiaoZhaoPermanentActive(u, A._activeBuffs, 'carry') && u._baseMaxHp !== undefined) {
            u.atk += 3;
            u.def += 4;
            u.maxHp += 20;
            u._baseMaxHp = u.maxHp;
            u.hp = Math.min(u.hp + 20, u.maxHp);
            if (typeof window._emitEvent === 'function') {
                window._emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def });
            }
        }

        u.atk = (u._baseAtk || u.atk) + (u._carryAtkBonus || 0) + (u._butterflyAtkBonus || 0) + (u._holyAtkBonus || 0) + (u._emptyColBonus || 0) + (u._bloodAuraBonus || 0);
        u.def = (u._baseDef || u.def) + (u._carryDefBonus || 0) + (u._butterflyDefBonus || 0) + (u._holyDefBonus || 0) + (u._fortifyDefBonus || 0);

        u._acted = false;
        u._resting = false;
        if (u._restingTimer) { clearTimeout(u._restingTimer); u._restingTimer = null; }
        u._doubleStriked = false;
        u._stunned = false;
        u._nineYinFirstDone = false;
        u._xingFenActive = false;
        u._xiaoZhaoDoubleStriked = false;
        u._bloodthirstStriked = false;
        u._linkTriggered = false;
        u._fortifyThisRound = 0;
    });

    B.forEach(u => {
        if (!u.alive) return;
        u._acted = false;
        u._resting = false;
        u._doubleStriked = false;
        u._stunned = false;
        u._nineYinFirstDone = false;
        u._xingFenActive = false;
        u._xiaoZhaoDoubleStriked = false;
        u._bloodthirstStriked = false;
        u._linkTriggered = false;
    });

    logBuffSummary(A, log, doubleStrikeUnitUid);

    const roundStartEvents = [...window._battleEvents];
    window._battleEvents = [];
    if (window.GlobalStore) window.GlobalStore.flushBattleEvents();
    yield { log: [...log], events: roundStartEvents, ally: A, enemy: B, winner: null, done: false, doubleStrikeUid: doubleStrikeUnitUid };
    window._battleEvents = [];
    log = [];

    let currentSide = 'enemy';
    const kuLianUnit = kuLianSong;
    let kuLianDone = false;

    while (A.some(u => u.alive && !u._acted) || B.some(u => u.alive && !u._acted)) {
        let actingUnit = null;

        if (!kuLianDone && kuLianUnit && kuLianUnit.alive && !kuLianUnit._acted) {
            actingUnit = kuLianUnit;
            kuLianDone = true;
            log.push({ type:'info', text:`<span class="gold">🏋️ 苦练：${kuLianUnit.name} 每回合最先行动！</span>` });
        } else {
            const currentTeam = currentSide === 'ally' ? A : B;
            const remaining = currentTeam.filter(u => u.alive && !u._acted).sort((a, b) => a.pos - b.pos);

            if (remaining.length > 0) {
                let found = null;
                for (const u of remaining) {
                    const allySide = u.camp === 'ally' ? A : B;
                    const blocked = isBlocked(u, allySide);
                    u._blocked = blocked;

                    if (u.isHorse && u.atk <= 0) {
                        u._acted = true;
                        let hpBefore = Math.floor(u.hp);
                        u.hp = Math.min(u.maxHp, u.hp + 15);
                        let hpAfter = Math.floor(u.hp);
                        u._resting = true;
                        if (u._restingTimer) clearTimeout(u._restingTimer);
                        u._restingTimer = setTimeout(() => {
                            u._resting = false;
                            if (typeof window._emitEvent === 'function') {
                                window._emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def, _resting: false });
                            }
                        }, 3000);
                        let bg = {type:'attack-group', uidA:u.uid, uidD:null, entries:[], isBlock:true, _fxSnapshot:makeFXSnapshot(u,null), waveTaunt:null, waveUnit:null, buffEffects:[], healAmount: 15, healUnitUid: u.uid};
                        bg.entries.push({type:'combat-text', text:`<span class="${u.camp==='ally'?'blue':'orange'}">${u.camp==='ally'?'明教':'六大派'} ${u.name}</span> 无法攻击`});
                        bg.entries.push({type:'info', text:`<span class="green">🐴 拒马休息回复15点生命（${hpBefore} → ${hpAfter}）</span>`});
                        bg._events = [...window._battleEvents];
                        window._battleEvents = [];
                        log.push(bg);
                        continue;
                    }

                    if (u._spiderFlying || (u._flyMode && u._flyMode !== 'butterfly')) {
                        u._acted = true;
                        continue;
                    }

                    if (u._stunned) {
                        u._acted = true;
                        let bg = {type:'attack-group', uidA:u.uid, uidD:null, entries:[], isBlock:true, _fxSnapshot:makeFXSnapshot(u,null), waveTaunt:null, waveUnit:null, buffEffects:[]};
                        bg.entries.push({type:'info', text:`<span class="gray">💫 ${u.name} 被眩晕，无法行动</span>`});
                        bg._events = [...window._battleEvents];
                        window._battleEvents = [];
                        if (window.GlobalStore) window.GlobalStore.flushBattleEvents();
                        log.push(bg);
                        continue;
                    }

                    if (blocked && isMelee(u.role)) {
                        u._acted = true;
                        let hpBefore = Math.floor(u.hp);
                        u.hp = Math.min(u.maxHp, u.hp + 15);
                        let hpAfter = Math.floor(u.hp);
                        u._resting = true;
                        if (u._restingTimer) clearTimeout(u._restingTimer);
                        u._restingTimer = setTimeout(() => {
                            u._resting = false;
                            if (typeof window._emitEvent === 'function') {
                                window._emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def, _resting: false });
                            }
                        }, 3000);
                        let bg = {type:'attack-group', uidA:u.uid, uidD:null, entries:[], isBlock:true, _fxSnapshot:makeFXSnapshot(u,null), waveTaunt:null, waveUnit:null, buffEffects:[], healAmount: 15, healUnitUid: u.uid};
                        bg.entries.push({type:'combat-text', text:`<span class="${u.camp==='ally'?'blue':'orange'}">${u.camp==='ally'?'明教':'六大派'} ${u.name}</span> 被遮挡`});
                        bg.entries.push({type:'info', text:`<span class="green">休息回复15点生命（${hpBefore} → ${hpAfter}）</span>`});
                        bg._events = [...window._battleEvents];
                        window._battleEvents = [];
                        log.push(bg);
                        continue;
                    }

                    found = u;
                    break;
                }
                if (found) actingUnit = found;
            }

            if (!actingUnit) {
                currentSide = currentSide === 'ally' ? 'enemy' : 'ally';
                continue;
            }
        }

        if (!actingUnit) {
            currentSide = currentSide === 'ally' ? 'enemy' : 'ally';
            continue;
        }

        let unit = actingUnit;
        let allySide = unit.camp === 'ally' ? A : B;
        let enemySide = unit.camp === 'ally' ? B : A;

        if (unit.isZhang && !unit._zhangSwitched) checkZhangSwitch(A, log);
        unit._blocked = isBlocked(unit, allySide);
        unit.survivedRounds++;

        processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid);

        if (unit !== kuLianUnit) {
            currentSide = currentSide === 'ally' ? 'enemy' : 'ally';
        }

        finalizeDeaths(A);
        finalizeDeaths(B);
        A.forEach(u => { if (u.isXiaoZhaoBrother && u.alive) spiderFlyCheck(u, A, log); });
        const stepEvents = [...window._battleEvents];
        window._battleEvents = [];
        if (window.GlobalStore) window.GlobalStore.flushBattleEvents();
        const allyAlive = A.some(u => u.alive);
        const enemyAlive = B.some(u => u.alive);
        let winner = null;
        let done = false;
        if (!allyAlive) { winner = '六大派'; done = true; }
        else if (!enemyAlive) { winner = '明教'; done = true; }

        yield { log: [...log], events: stepEvents, ally: A, enemy: B, winner, done };
        log = [];

        if (done) return;
    }

    A.forEach(u => {
        if (u.isXiaoZhaoSister && u.alive && u._butterflyHost) butterflyReturn(u, A, log);
    });
    A.forEach(u => {
        if (u.isXiaoZhaoBrother && u.alive && u._spiderFlying) spiderReturn(u, A, B, log);
    });

    [A, B].forEach(team => {
        for (let i = team.length - 1; i >= 0; i--) {
            const u = team[i];
            u._resting = false;
            if (u._restingTimer) { clearTimeout(u._restingTimer); u._restingTimer = null; }
            if (u.isHorse && !u.alive) {
                if (typeof window._emitEvent === 'function') {
                    window._emitEvent(u, 'unit-remove', { uid: u.uid });
                }
                team.splice(i, 1);
            }
        }
    });

    destroyHorse(A, log); destroyHorse(B, log);
    A._activeBuffs = (A._activeBuffs || []).map(b => ({...b, remaining: b.remaining - 1})).filter(b => b.remaining > 0);
    B._activeBuffs = (B._activeBuffs || []).map(b => ({...b, remaining: b.remaining - 1})).filter(b => b.remaining > 0);

    let winner = null;
    let done = false;
    if (B.every(c => !c.alive)) { winner = '明教'; done = true; }
    else if (A.every(c => !c.alive)) { winner = '六大派'; done = true; }
    if (round >= C.MAX_ROUND && !done) { winner = '平局'; done = true; }

    if (winner) {
        let losers = winner === '明教' ? B : A;
        losers.forEach(u => {
            u.hp = 0;
            u.alive = false;
            u._isDead = true;
            if (typeof window._emitEvent === 'function') {
                window._emitEvent(u, 'hp-change', { hp: 0, maxHp: u.maxHp, alive: false, atk: u.atk, def: u.def, _isDead: true });
            }
        });
    }

    log.push({type:'round-end', text:`<div class="separator">———— 第${round}回合结束 ————</div>`});

    const endEvents = [...window._battleEvents];
    window._battleEvents = [];
    if (window.GlobalStore) window.GlobalStore.flushBattleEvents();
    finalizeDeaths(A);
    finalizeDeaths(B);
    yield { log: [...log], events: endEvents, ally: A, enemy: B, winner, done };
}

export function runBattleRound(state) {
    const stepper = createRoundStepper(state);
    let finalResult = null;
    for (const step of stepper) {
        finalResult = step;
    }
    return {
        ally: finalResult.ally,
        enemy: finalResult.enemy,
        round: state.round,
        log: [],
        winner: finalResult.winner,
        activeBuffs: finalResult.ally._activeBuffs || [],
        doubleStrikeUid: null
    };
}