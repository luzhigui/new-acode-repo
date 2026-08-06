﻿// core/48battle-round.js - 光明顶5v5 回合循环与生成器
// V5.3.2 | ~27200 bytes| 2026-08-06 小昭姐妹状态转换纳入声明→裁定模式
export const VER = 'core/48battle-round.js V5.3.2';

import { CONFIG } from './01config-5v5-test.js';
import { rand, isMelee, isBlocked, makeFXSnapshot, hasBuff, getUnitCol, getUnitRow, hasAnyEnemyEmptyCol, countEnemyEmptyCols, getBloodAuraBonus, getAuraBonuses, registerWarriorBreakDefense, registerRangedGrowth, registerFortifyShield, selectFlyTarget, registerEmptyColBonus, registerDoubleStrike } from './03battle-utils.js';
import { computeBuffStats, logBuffSummary, applyHolyFlameBonus, applyFortifyBonus, applyCarryBonus, registerBloodthirst, registerHotBlood, registerWindAssault, registerMeteorShower, registerMindControl } from './04buff-system.js';
import { spawnHorse, destroyHorse } from './05battle-horse.js';
import { Unit } from './02unit.js';

import { createZhangWujiComponent, createWeiYixiaoComponent, createXiaoZhaoSisterComponent, createXiaoZhaoBrotherComponent } from '../modules/99elite-mingjiao.js';
import { createSongQingshuComponent, createZhouZhiruoComponent } from '../modules/98elite-sixsects.js';
import { createChengKunComponent, createLuZhangKeComponent, createHeBiWengComponent, registerXuanmingLink } from '../modules/97elite-imperial.js';
import { processUnitAttack } from './47battle-attack.js';
import { eventBus, EXECUTION_LAYER as L } from './00-event-bus.js';
import { getNextAvailableUnit, finalizeDeaths, emitFullUnitState, checkZhangSwitch, emitEvent, applyStatChange } from './50battle-shared.js';
import { resolveDeaths } from './49battle-attack-steps.js';

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

    // 清除上回合精英注册的动态闪避规则，保留两条通用规则
    import('../core/49battle-attack-steps.js').then(mod => mod.clearEliteDodgeRules());

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
    eventBus.on('beforeSelectTarget', L.BEFORE_SELECT_TARGET.FLY_TARGET, (data) => {
        if (data.unit.role !== '飞行' || data.unit.isWei) return;
        const flyTarget = selectFlyTarget(data.unit, data.enemySide);
        if (flyTarget) data.targetResult = flyTarget;
    });
    registerDoubleStrike(eventBus, doubleStrikeUnitUid, A, A._activeBuffs);
    registerEmptyColBonus(eventBus);
    registerXuanmingLink(eventBus);

    // 注册精英组件钩子，并保存小昭姐妹组件引用供裁判调用
    const sisterComp = createXiaoZhaoSisterComponent();
    const brotherComp = createXiaoZhaoBrotherComponent();
    A.forEach(u => {
        if (!u.alive) return;
        if (u.isZhang) createZhangWujiComponent().register(eventBus, A, B, log);
        if (u.isWei) createWeiYixiaoComponent().register(eventBus, A, B, log);
        if (u.isXiaoZhaoBrother) brotherComp.register(eventBus, A, B, log);
        if (u.isXiaoZhaoSister) sisterComp.register(eventBus, A, B, log);
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

        applyCarryBonus(u, A, state, log, stats);

        const auraBonuses = getAuraBonuses(u, A, B);
        const targetAtk = (u._baseAtk || u.atk) + (u._carryAtkBonus || 0) + (u._butterflyAtkBonus || 0) + (u._holyAtkBonus || 0) + auraBonuses.emptyCol + auraBonuses.bloodAura;
        const targetDef = (u._baseDef || u.def) + (u._carryDefBonus || 0) + (u._butterflyDefBonus || 0) + (u._holyDefBonus || 0) + (u._fortifyDefBonus || 0);
        applyStatChange(u, 'atk', targetAtk - u.atk, null, '光环加成');
        applyStatChange(u, 'def', targetDef - u.def, null, '光环加成');

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

    /**
     * 行动调度边裁 — 裁定本轮行动者
     * 三步：裁判感知 → 声明收集 → 冲突裁决
     * 输入候选单位列表，输出 { actingUnit, isPriorityAction, passUnits }
     * 裁决标准：priority 高优先，同 priority 按 pos 排
     */
    /**
     * 状态转换边裁 — 收集声明并裁定执行
     */
    function resolveStateTransitions() {
        const stateTransitions = [];
        if (A._pendingStateTransitions) {
            stateTransitions.push(...A._pendingStateTransitions);
            A._pendingStateTransitions = [];
        }
        if (B._pendingStateTransitions) {
            stateTransitions.push(...B._pendingStateTransitions);
            B._pendingStateTransitions = [];
        }
        eventBus.emit('beforeStateTransition', { A, B, log, declarations: stateTransitions });
        for (const decl of stateTransitions) {
            if (decl.type === 'butterflyAttach') {
                sisterComp.executeAttach(A, log);
            } else if (decl.type === 'butterflyReturn') {
                sisterComp.executeReturn(decl.sister, A, log);
            } else if (decl.type === 'spiderFly') {
                brotherComp.executeFly(decl.unit, decl.incomingDmg, A, log);
            } else if (decl.type === 'spiderDescend') {
                brotherComp.executeDescend(decl.unit, A, B, log);
            }
        }
    }

    /**
     * 行动调度边裁 — 裁定本轮行动者
     * 两步：裁判感知 → 声明收集与冲突裁决
     */
    function resolveActionOrder(candidates, log) {
        resolveStateTransitions();
        // 第一步：按站位排序，逐个判定
        const sortedByPos = [...candidates].filter(u => u.alive && !u._isDead).sort((a, b) => a.pos - b.pos);
        const priorityDeclarations = [];
        const passUnits = [];

        for (const u of sortedByPos) {
            if (u._stunned) {
                passUnits.push({ unit: u, reason: '眩晕' });
                continue;
            }
            if (u.isHorse) {
                passUnits.push({ unit: u, reason: '拒马休息' });
                continue;
            }
            if (u._flyMode === 'butterfly' || u._flyMode === 'spider' || u._spiderFlying) {
                passUnits.push({ unit: u, reason: '飞天/附身' });
                continue;
            }
            const allySide = u.camp === 'ally' ? candidates.filter(c => c.camp === 'ally') : candidates.filter(c => c.camp === 'enemy');
            if (isBlocked(u, allySide) && isMelee(u.role)) {
                passUnits.push({ unit: u, reason: '被遮挡' });
                continue;
            }
            const decl = { priority: 0, skip: false, pass: false };
            eventBus.emit('beforeActionSelect', { unit: u, declaration: decl });
            if (decl.skip) continue;
            if (decl.pass) {
                passUnits.push({ unit: u, reason: '组件声明pass' });
                continue;
            }
            priorityDeclarations.push({ unit: u, priority: decl.priority });
        }

        // 第二步：优先行动声明（如苦练）
        const hasPriority = priorityDeclarations.filter(d => d.priority > 0);
        if (hasPriority.length > 0) {
            hasPriority.sort((a, b) => b.priority - a.priority || a.unit.pos - b.unit.pos);
            const winner = hasPriority[0];
            if (winner.unit._kuLianActive) {
                log.push({ type:'info', text:`<span class="gold">🏋️ 苦练：${winner.unit.name} 每回合最先行动！</span>` });
            }
            return { actingUnit: winner.unit, isPriorityAction: true, passUnits };
        }

        // 第三步：无优先声明，按站位取第一个
        priorityDeclarations.sort((a, b) => a.unit.pos - b.unit.pos);
        if (priorityDeclarations.length > 0) {
            return { actingUnit: priorityDeclarations[0].unit, isPriorityAction: false, passUnits };
        }

        return { actingUnit: null, isPriorityAction: false, passUnits };
    }

    let currentSide = 'enemy';
    let kuLianDone = false;

    while (A.some(u => u.alive && !u._acted) || B.some(u => u.alive && !u._acted)) {
        const currentTeam = currentSide === 'ally' ? A : B;
        const candidates = currentTeam.filter(u => u.alive && !u._acted).sort((a, b) => a.pos - b.pos);
        const orderResult = resolveActionOrder(candidates, log);

        if (orderResult.passUnits.length > 0) {
            for (const { unit, reason } of orderResult.passUnits) {
                unit._acted = true;
                unit._blocked = isBlocked(unit, currentTeam);
                if (reason === '被遮挡') {
                    let hpBefore = Math.floor(unit.hp);
                    unit.hp = Math.min(unit.maxHp, unit.hp + 15);
                    let hpAfter = Math.floor(unit.hp);
                    unit._resting = true;
                    if (unit._restingTimer) clearTimeout(unit._restingTimer);
                    unit._restingTimer = setTimeout(() => {
                        unit._resting = false;
                        emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _resting: false });
                    }, 3000);
                    let bg = {type:'attack-group', uidA:unit.uid, uidD:null, entries:[], isBlock:true, _fxSnapshot:makeFXSnapshot(unit,null), waveTaunt:null, waveUnit:null, buffEffects:[], needsSeparator: true, healAmount: 15, healUnitUid: unit.uid};
                    bg.entries.push({type:'combat-text', text:`<span class="${unit.camp==='ally'?'blue':'orange'}">${unit.camp==='ally'?'明教':'六大派'} ${unit.name}</span> 被遮挡`});
                    bg.entries.push({type:'info', text:`<span class="green">休息回复15点生命（${hpBefore} → ${hpAfter}）</span>`});
                    bg._events = GlobalStore.flushBattleEvents();
                    log.push(bg);
                } else if (reason === '眩晕') {
                    let bg = {type:'attack-group', uidA:unit.uid, uidD:null, entries:[], isBlock:true, _fxSnapshot:makeFXSnapshot(unit,null), waveTaunt:null, waveUnit:null, buffEffects:[], needsSeparator: true};
                    bg.entries.push({type:'info', text:`<span class="gray">💫 ${unit.name} 被眩晕，无法行动</span>`});
                    bg._events = GlobalStore.flushBattleEvents();
                    log.push(bg);
                } else if (reason === '拒马休息') {
                    let hpBefore = Math.floor(unit.hp);
                    unit.hp = Math.min(unit.maxHp, unit.hp + 15);
                    let hpAfter = Math.floor(unit.hp);
                    unit._resting = true;
                    if (unit._restingTimer) clearTimeout(unit._restingTimer);
                    unit._restingTimer = setTimeout(() => {
                        unit._resting = false;
                        emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _resting: false });
                    }, 3000);
                    let bg = {type:'attack-group', uidA:unit.uid, uidD:null, entries:[], isBlock:true, _fxSnapshot:makeFXSnapshot(unit,null), waveTaunt:null, waveUnit:null, buffEffects:[], needsSeparator: true, healAmount: 15, healUnitUid: unit.uid};
                    bg.entries.push({type:'combat-text', text:`<span class="${unit.camp==='ally'?'blue':'orange'}">${unit.camp==='ally'?'明教':'六大派'} ${unit.name}</span> 无法攻击`});
                    bg.entries.push({type:'info', text:`<span class="green">🐴 拒马休息回复15点生命（${hpBefore} → ${hpAfter}）</span>`});
                    bg._events = GlobalStore.flushBattleEvents();
                    log.push(bg);
                } else {
                    let bg = {type:'attack-group', uidA:unit.uid, uidD:null, entries:[], isBlock:true, _fxSnapshot:makeFXSnapshot(unit,null), waveTaunt:null, waveUnit:null, buffEffects:[], needsSeparator: true};
                    bg.entries.push({type:'info', text:`<span class="gray">${unit.name} 无法行动</span>`});
                    bg._events = GlobalStore.flushBattleEvents();
                    log.push(bg);
                }
            }
            if (!orderResult.actingUnit) {
                currentSide = currentSide === 'ally' ? 'enemy' : 'ally';
                continue;
            }
        }

        if (!orderResult.actingUnit) {
            currentSide = currentSide === 'ally' ? 'enemy' : 'ally';
            continue;
        }

        let actingUnit = orderResult.actingUnit;
        let isPriorityAction = orderResult.isPriorityAction;

        let unit = actingUnit;
        let allySide = unit.camp === 'ally' ? A : B;
        let enemySide = unit.camp === 'ally' ? B : A;

        unit._blocked = isBlocked(unit, allySide);
        unit.survivedRounds++;

        // 姐姐附身不占明教攻击轮次
        if (unit.camp === 'ally' && unit.isXiaoZhaoSister && !unit._butterflyHost && !A._butterflyTriggered) {
            isPriorityAction = true;
        }

        await processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid);

        // 死亡结算：覆盖所有路径（连击、白骨爪、乾坤反弹等）
        resolveDeaths(A, B, log);

        // 普通行动结束后切换行动方；高优先级抢动的单位（苦练等）跳过切换，让本队继续出人
        if (!isPriorityAction) {
            currentSide = currentSide === 'ally' ? 'enemy' : 'ally';
        }

        finalizeDeaths(A);
        finalizeDeaths(B);
        // 发射回合结束信号，收集状态转换声明，由裁判统一裁定执行
        const endStateTransitions = [];
        eventBus.emit('onRoundEnd', { A, B, log, forced: false, declarations: endStateTransitions });
        for (const decl of endStateTransitions) {
            if (decl.type === 'butterflyReturn') {
                sisterComp.executeReturn(decl.sister, A, log);
            } else if (decl.type === 'spiderDescend') {
                brotherComp.executeDescend(decl.unit, A, B, log);
            }
        }
        // 兜底：回合结束阶段产生的死亡标记
        resolveDeaths(A, B, log);
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