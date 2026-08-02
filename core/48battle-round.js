﻿﻿﻿﻿﻿﻿﻿﻿﻿// core/48battle-round.js - 光明顶5v5 回合循环与生成器
// V5.3.1 | ~26800 bytes| 2026-07-28 迁移光环和联动至事件总线
export const VER = 'core/48battle-round.js V5.3.1';

import { CONFIG } from './01config-5v5-test.js';
import { rand, isMelee, isBlocked, makeFXSnapshot, hasBuff, getUnitCol, getUnitRow, hasAnyEnemyEmptyCol, countEnemyEmptyCols, getBloodAuraBonus, registerWarriorBreakDefense, registerRangedGrowth, registerFortifyShield, selectFlyTarget, registerEmptyColBonus, registerDoubleStrike } from './03battle-utils.js';
import { computeBuffStats, logBuffSummary, applyHolyFlameBonus, applyFortifyBonus, registerBloodthirst, registerHotBlood, registerWindAssault, registerMeteorShower, registerMindControl } from './04buff-system.js';
import { spawnHorse, destroyHorse } from './05battle-horse.js';
import { Unit } from './02unit.js';

import { createZhangWujiComponent, createWeiYixiaoComponent, createXiaoZhaoSisterComponent, createXiaoZhaoBrotherComponent } from '../modules/99elite-mingjiao.js';
import { createSongQingshuComponent, createZhouZhiruoComponent } from '../modules/98elite-sixsects.js';
import { createChengKunComponent, createLuZhangKeComponent, createHeBiWengComponent, registerXuanmingLink } from '../modules/97elite-imperial.js';
import { processUnitAttack } from './47battle-attack.js';
import { eventBus } from './00-event-bus.js';
import { getNextAvailableUnit, finalizeDeaths, emitFullUnitState, checkZhangSwitch, emitEvent } from './50battle-shared.js';

const C = CONFIG;





// ==================== 回合生成器 ====================

export async function* createRoundStepper(state) {
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

    GlobalStore.set('currentBattleState', null);
    GlobalStore.flushBattleEvents();

    log.push({ type:'round-start', text:`<div class="separator">———— 第${round}回合开始 ————</div>` });

    // 发射回合开始信号，精英组件自行处理快乐回血、性奋、苦练等回合开始逻辑
    eventBus.emit('onRoundStart', { A, B, log });

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

    // 圣火令每回合重新随机行列
    A._activeBuffs.forEach(b => {
        if (b.key === 'holyFlame') {
            const cols = [];
            while (cols.length < 2) { const c = rand(1, 3); if (!cols.includes(c)) cols.push(c); }
            cols.sort((a, b) => a - b);
            const rows = [];
            while (rows.length < 2) { const r = rand(1, 3); if (!rows.includes(r)) rows.push(r); }
            rows.sort((a, b) => a - b);
            b.cols = cols;
            b.rows = rows;
        }
    });
    // 提前生成圣火令行列，确保 UI 渲染时 cols/rows 已存在
    A.forEach(u => {
        if (u.alive && u.camp === 'ally') {
            applyHolyFlameBonus(u, A._activeBuffs || []);
        }
    });

    eventBus.clearAll();
    A.forEach(u => {
        if (u.isXiaoZhaoBrother && u.alive) createXiaoZhaoBrotherComponent().register(eventBus, A, B, log);
    });

    // 注册所有监听器
    registerWarriorBreakDefense(eventBus);
    registerRangedGrowth(eventBus);
    registerFortifyShield(eventBus);
    registerBloodthirst(eventBus);
    registerHotBlood(eventBus);
    registerWindAssault(eventBus);
    registerMeteorShower(eventBus);
    registerMindControl(eventBus);
    // 飞行突进目标选择（⚠️ 预留给未来飞行精英角色使用，当前普通飞行单位不触发此逻辑）
    eventBus.on('beforeSelectTarget', 30, (data) => {
        if (data.unit.role !== '飞行' || data.unit.isWei) return;
        const flyTarget = selectFlyTarget(data.unit, data.enemySide);
        if (flyTarget) data.targetResult = flyTarget;
    });
    registerDoubleStrike(eventBus, doubleStrikeUnitUid, A, A._activeBuffs);
    registerEmptyColBonus(eventBus);
    registerXuanmingLink(eventBus);

    // 注册精英组件钩子
    A.forEach(u => {
        if (!u.alive) return;
        if (u.isZhang) createZhangWujiComponent().register(eventBus, A, B, log);
        if (u.isWei) createWeiYixiaoComponent().register(eventBus, A, B, log);
        if (u.isXiaoZhaoBrother) createXiaoZhaoBrotherComponent().register(eventBus, A, B, log);
        if (u.isXiaoZhaoSister) {
            createXiaoZhaoSisterComponent().register(eventBus, A, B, log);
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
        emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def, _stunned: false });
        let allyTeamWithDead = A.slice();
        let hasCarryActive = hasBuff(A._activeBuffs, 'carry');
        if (hasCarryActive) {
            allyTeamWithDead = allyTeamWithDead.concat((state.allAllies || state.ally).filter(c => !c.alive));
            allyTeamWithDead = allyTeamWithDead.filter((u, i, arr) => arr.findIndex(v => v.uid === u.uid) === i);
        }
        let stats = computeBuffStats(u, A._activeBuffs || [], allyTeamWithDead);

        applyHolyFlameBonus(u, A._activeBuffs || []);
        applyFortifyBonus(u, A._activeBuffs || []);

        emitEvent(u, 'stat-bonus-change', {
            buffAtkBonus: stats.atkBonus,
            buffDefBonus: stats.defBonus,
            buffDodgeBonus: stats.dodgeBonus,
            buffHpBonus: stats.hpBonus
        });
        emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def, buffAtkBonus: u.buffAtkBonus, buffDefBonus: u.buffDefBonus, _holyAtkBonus: u._holyAtkBonus, _holyDefBonus: u._holyDefBonus, _fortifyDefBonus: u._fortifyDefBonus, _emptyColBonus: u._emptyColBonus, _bloodAuraBonus: u._bloodAuraBonus, _carryAtkBonus: u._carryAtkBonus, _carryDefBonus: u._carryDefBonus });
        emitEvent(u, 'stat-bonus-change', {
            buffAtkBonus: stats.atkBonus,
            buffDefBonus: stats.defBonus,
            buffDodgeBonus: stats.dodgeBonus,
            buffHpBonus: stats.hpBonus
        });

        const sister = A.some(a => a.isXiaoZhaoSister && a.alive);
        const carryPositions = sister ? [4, 5, 6] : [5];
        if (hasCarryActive && carryPositions.includes(u.pos) && u._baseMaxHp !== undefined && !u.isHorse && !u.isZhang && !u.isXiaoZhaoSister && !u.isXiaoZhaoBrother) {
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
            emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def, buffAtkBonus: u.buffAtkBonus, buffDefBonus: u.buffDefBonus, _holyAtkBonus: u._holyAtkBonus, _holyDefBonus: u._holyDefBonus, _fortifyDefBonus: u._fortifyDefBonus, _emptyColBonus: u._emptyColBonus, _bloodAuraBonus: u._bloodAuraBonus, _carryAtkBonus: u._carryAtkBonus, _carryDefBonus: u._carryDefBonus });
            if (stats.carryAtkAbs || stats.carryDefAbs || stats.carryHpAbs) {
                log.push({ type:'info', text:`<span class="gold">👑 carry：${u.name} 获得队友属性加成 攻+${stats.carryAtkAbs} 防+${stats.carryDefAbs} 血上限+${stats.carryHpAbs}</span>` });
            }
        } else if (!u.isHorse && !hasCarryActive && !u.isXiaoZhaoSister && !u.isXiaoZhaoBrother && !u.isZhang) {
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
                emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def, buffAtkBonus: u.buffAtkBonus, buffDefBonus: u.buffDefBonus, _holyAtkBonus: u._holyAtkBonus, _holyDefBonus: u._holyDefBonus, _fortifyDefBonus: u._fortifyDefBonus, _emptyColBonus: u._emptyColBonus, _bloodAuraBonus: u._bloodAuraBonus, _carryAtkBonus: u._carryAtkBonus, _carryDefBonus: u._carryDefBonus });
            }
        }

        u.atk = (u._baseAtk || u.atk) + (u._carryAtkBonus || 0) + (u._butterflyAtkBonus || 0) + (u._holyAtkBonus || 0) + (u._emptyColBonus || 0) + (u._bloodAuraBonus || 0);
        u.def = (u._baseDef || u.def) + (u._carryDefBonus || 0) + (u._butterflyDefBonus || 0) + (u._holyDefBonus || 0) + (u._fortifyDefBonus || 0);

        // 圣火令等加成生效后，立即推送最终攻防到 Store 刷新格子显示
        emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def });

        u._acted = false;
        u._resting = false;
        if (u._restingTimer) { clearTimeout(u._restingTimer); u._restingTimer = null; }
        u._doubleStriked = false;
        u._stunned = false;
        u._nineYinFirstDone = false;
        u._xingFenActive = false;
        u._xingFenExtraAttacking = false;
        u._xiaoZhaoDoubleStriked = false;
        u._bloodthirstStriked = false;
        u._linkTriggered = false;
        u._fortifyThisRound = 0;
    });

    B.forEach(u => {
        if (!u.alive) return;
        emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def, _stunned: false });
        u._acted = false;
        u._resting = false;
        u._doubleStriked = false;
        u._stunned = false;
        u._nineYinFirstDone = false;
        u._xingFenActive = false;
        u._xingFenExtraAttacking = false;
        u._xiaoZhaoDoubleStriked = false;
        u._bloodthirstStriked = false;
        u._linkTriggered = false;
        u._fortifyThisRound = 0;
    });

    logBuffSummary(A, log, doubleStrikeUnitUid);

    const roundStartEvents = GlobalStore.flushBattleEvents();
    yield { log: [...log], events: roundStartEvents, ally: A, enemy: B, winner: null, done: false, doubleStrikeUid: doubleStrikeUnitUid };
    log = [];

    let currentSide = 'enemy';
    let kuLianDone = false;

    while (A.some(u => u.alive && !u._acted) || B.some(u => u.alive && !u._acted)) {
        let actingUnit = null;
        // ⚠️ 优先级行动标记：高优先级单位（如苦练）抢先行动不占队伍回合
        // 行动后不能切换 currentSide，否则会打乱正常轮次顺序
        // 历史教训：V5.3.1 删除 kuLianUnit 后曾漏掉此判断，导致苦练后阵营错误切换
        let isPriorityAction = false;

        // 收集所有行动优先级声明，同时过滤 skip 单位（如小昭姐妹飞天/附身）
        // pass: true = 单位存在但无法攻击（预留给被遮挡休息、眩晕等），行动后不切换阵营
        const currentTeamCheck = currentSide === 'ally' ? A : B;
        const remainingCheck = currentTeamCheck.filter(u => u.alive && !u._acted);
        const priorityDeclarations = [];
        for (const u of remainingCheck) {
            const decl = { priority: 0, skip: false, pass: false };
            eventBus.emit('beforeActionSelect', { unit: u, declaration: decl });
            if (decl.skip) continue; // 单位不在战场（附身/飞天），不进入候选池
            priorityDeclarations.push({ unit: u, priority: decl.priority, pass: decl.pass });
        }
        priorityDeclarations.sort((a, b) => b.priority - a.priority);
        const topPriority = priorityDeclarations[0]?.priority || 0;

        if (topPriority > 0) {
            isPriorityAction = true;
            const validTopUnits = priorityDeclarations.filter(d => d.priority === topPriority && !d.pass);
            for (const d of validTopUnits) {
                if (d.unit._kuLianActive) {
                    log.push({ type:'info', text:`<span class="gold">🏋️ 苦练：${d.unit.name} 每回合最先行动！</span>` });
                    kuLianDone = true;
                }
            }
            if (validTopUnits.length > 0) {
                actingUnit = validTopUnits[0].unit;
                if (validTopUnits[0].pass) isPriorityAction = true;
            }
        } else {
            // 复用已过滤 skip 的候选列表，引擎只问一次，不重复 emit
            const remaining = priorityDeclarations
                .map(d => d.unit)
                .sort((a, b) => a.pos - b.pos);

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
                            emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def, _resting: false });
                        }, 3000);
                        let bg = {type:'attack-group', uidA:u.uid, uidD:null, entries:[], isBlock:true, _fxSnapshot:makeFXSnapshot(u,null), waveTaunt:null, waveUnit:null, buffEffects:[], healAmount: 15, healUnitUid: u.uid};
                        bg.entries.push({type:'combat-text', text:`<span class="${u.camp==='ally'?'blue':'orange'}">${u.camp==='ally'?'明教':'六大派'} ${u.name}</span> 无法攻击`});
                        bg.entries.push({type:'info', text:`<span class="green">🐴 拒马休息回复15点生命（${hpBefore} → ${hpAfter}）</span>`});
                        bg._events = GlobalStore.flushBattleEvents();
                        log.push(bg);
                        continue;
                    }

                    if (u._stunned) {
                        // 眩晕单位存在但无法行动，设 pass 标记，行动后不切换阵营
                        u._acted = true;
                        let bg = {type:'attack-group', uidA:u.uid, uidD:null, entries:[], isBlock:true, _fxSnapshot:makeFXSnapshot(u,null), waveTaunt:null, waveUnit:null, buffEffects:[]};
                        bg.entries.push({type:'info', text:`<span class="gray">💫 ${u.name} 被眩晕，无法行动</span>`});
                        bg._events = GlobalStore.flushBattleEvents();
                        log.push(bg);
                        isPriorityAction = true;
                        continue;
                    }

                    if (blocked && isMelee(u.role)) {
                        // 被遮挡的单位存在但无法攻击，设 pass 标记，行动后不切换阵营
                        u._acted = true;
                        let hpBefore = Math.floor(u.hp);
                        u.hp = Math.min(u.maxHp, u.hp + 15);
                        let hpAfter = Math.floor(u.hp);
                        u._resting = true;
                        if (u._restingTimer) clearTimeout(u._restingTimer);
                        u._restingTimer = setTimeout(() => {
                            u._resting = false;
                            emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def, _resting: false });
                        }, 3000);
                        let bg = {type:'attack-group', uidA:u.uid, uidD:null, entries:[], isBlock:true, _fxSnapshot:makeFXSnapshot(u,null), waveTaunt:null, waveUnit:null, buffEffects:[], healAmount: 15, healUnitUid: u.uid};
                        bg.entries.push({type:'combat-text', text:`<span class="${u.camp==='ally'?'blue':'orange'}">${u.camp==='ally'?'明教':'六大派'} ${u.name}</span> 被遮挡`});
                        bg.entries.push({type:'info', text:`<span class="green">休息回复15点生命（${hpBefore} → ${hpAfter}）</span>`});
                        bg._events = GlobalStore.flushBattleEvents();
                        log.push(bg);
                        isPriorityAction = true;
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

        unit._blocked = isBlocked(unit, allySide);
        unit.survivedRounds++;

        await processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid);

        // 普通行动结束后切换行动方；高优先级抢动的单位（苦练等）跳过切换，让本队继续出人
        if (!isPriorityAction) {
            currentSide = currentSide === 'ally' ? 'enemy' : 'ally';
        }

        finalizeDeaths(A);
        finalizeDeaths(B);
        // 发射回合结束信号，由组件自行处理附身飞回、变身检查等
        eventBus.emit('onRoundEnd', { A, B, log, forced: false });
        const stepEvents = GlobalStore.flushBattleEvents();
        const allyAlive = A.some(u => u.alive);
        const enemyAlive = B.some(u => u.alive);
        let winner = null;
        let done = false;
        if (!allyAlive) { winner = '六大派'; done = true; }
        else if (!enemyAlive) { winner = '明教'; done = true; }

        // 胜利时先发射回合结束信号，再 yield，防止播放器提前重入
        if (winner) {
            eventBus.emit('onRoundEnd', { A, B, log, forced: true });
        }

        yield { log: [...log], events: stepEvents, ally: A, enemy: B, winner, done };
        log = [];

        if (done) return;
    }

    [A, B].forEach(team => {
        for (let i = team.length - 1; i >= 0; i--) {
            const u = team[i];
            u._resting = false;
            if (u._restingTimer) { clearTimeout(u._restingTimer); u._restingTimer = null; }
            if (u.isHorse && !u.alive) {
                emitEvent(u, 'unit-remove', { uid: u.uid });
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

    // 战斗结束，发射回合结束信号（forced），组件自行处理飞回/蛛落
    eventBus.emit('onRoundEnd', { A, B, log, forced: true });

    if (winner) {
        let losers = winner === '明教' ? B : A;
        losers.forEach(u => {
            u.hp = 0;
            u.alive = false;
            u._isDead = true;
            emitEvent(u, 'hp-change', { hp: 0, maxHp: u.maxHp, alive: false, atk: u.atk, def: u.def, _isDead: true });
        });
    }

    log.push({type:'round-end', text:`<div class="separator">———— 第${round}回合结束 ————</div>`});

    const endEvents = GlobalStore.flushBattleEvents();
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