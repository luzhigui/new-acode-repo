﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// core/48battle-round.js - 光明顶5v5 回合循环与生成器
// V5.4.0 | ~28000 bytes| 2026-08-06 小昭姐妹状态转换纳入声明→裁定模式
export const VER = 'core/48battle-round.js V5.4.0';

import { CONFIG } from './01config-5v5-test.js';
import { rand, isMelee, isBlocked, makeFXSnapshot, hasBuff, getUnitCol, getUnitRow, hasAnyEnemyEmptyCol, countEnemyEmptyCols, getBloodAuraBonus, getAuraBonuses, registerWarriorBreakDefense, registerRangedGrowth, registerFortifyShield, registerWarriorExecute, selectFlyTarget, registerEmptyColBonus, registerDoubleStrike } from './03battle-utils.js';
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

/**
 * 回合推进生成器 — 逐步 yield 每个行动步骤，供播放器逐帧消费
 * 每回合流程：回合开始（Buff结算/拒马召唤/精英注册）→ 行动调度（按站位轮流攻击）→ 回合结束（Buff过期/拒马销毁/胜负判定）
 * @param {object} state - 战斗状态 { ally, enemy, round, activeBuffs, allAllies }
 * @yields {{ log: Array, events: Array, ally: Array, enemy: Array, winner: string|null, done: boolean }}
 *   每步产生日志、事件、当前双方状态，winner 非空表示战斗结束
 */
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
    let A = state.ally.map(u => u.clone());
    let B = state.enemy.map(u => u.clone());
    let log = [];
    let round = state.round;

    A._activeBuffs = state.activeBuffs.filter(b => b.target === 'ally' || !b.target);
    B._activeBuffs = state.activeBuffs.filter(b => b.target === 'enemy');

    const xiaoZhao = A.find(u => (u.isXiaoZhaoSister || u.isXiaoZhaoBrother) && u.alive);

    GlobalStore.set('currentBattleState', null);
    GlobalStore.flushBattleEvents();

    log.push({ type:'round-start', text:`<div class="separator">———— 第${round}回合开始 ————</div>` });

    // 死马不再删除，保留在数组中供战报统计承伤
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
    registerWarriorExecute(eventBus);
    registerBloodthirst(eventBus);
    registerHotBlood(eventBus);
    registerWindAssault(eventBus);
    registerMeteorShower(eventBus);
    registerMindControl(eventBus);
    // 苦练优先行动（通用注册，不依赖 onRoundStart 后的精英注册）
    eventBus.on('beforeActionSelect', L.BEFORE_ACTION.KULIAN_PRIORITY, (data) => {
        if (data.unit.name !== '宋青书' || !data.unit.alive || !data.unit._kuLianActive) return;
        data.declaration.priority = 1;
    });
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
        if (u.name === '成昆') {
            u._fortifyIncrement = CONFIG.FORTIFY_INCREMENT * 2;
            u._fortifyCap = CONFIG.FORTIFY_CAP * 2;
            createChengKunComponent().register(eventBus, A, B, log);
        }
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

    // 发射回合开始信号（在所有监听器注册完成后）
    eventBus.emit('onRoundStart', { A, B, log });

    A._butterflyTriggered = false;
            A._mindControlTriggered = false;
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
        u._butterflyHpBonus = 0;
        u._butterflyAtkBonus = 0;
        u._butterflyDefBonus = 0;
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

    // 第一回合开始前弹出姐姐附身方向选择（后续回合在 playBattle 的 Buff 弹窗后处理）
    if (round === 1 && A.some(u => u.isXiaoZhaoSister && u.alive)) {
        const { showFlyDirectionPopup } = await import('../ui/41main-battle.js');
        const direction = await new Promise(resolve => {
            showFlyDirectionPopup(resolve);
        });
        A._flyDirection = direction || 'right';
    }

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
        const delayedDecls = [];
        for (const decl of stateTransitions) {
            if (decl.type === 'butterflyAttach') {
                sisterComp.executeAttach(A, log);
            } else if (decl.type === 'butterflyReturn') {
                // 飞回只在回合结束时处理，跳过并暂存
                delayedDecls.push(decl);
                continue;
            } else if (decl.type === 'spiderFly') {
                brotherComp.executeFly(decl.unit, decl.incomingDmg, A, log);
            } else if (decl.type === 'spiderDescend') {
                // 蛛落也只在回合结束时处理，跳过并暂存
                delayedDecls.push(decl);
                continue;
            }
        }
        // 将跳过的延迟声明放回队列，供回合结束时消费
        if (delayedDecls.length > 0) {
            if (!A._pendingStateTransitions) A._pendingStateTransitions = [];
            A._pendingStateTransitions.push(...delayedDecls);
        }
    }

    /**
     * 行动调度边裁 — 裁定本轮行动者
     * 两步：裁判感知 → 声明收集与冲突裁决
     */
    function resolveActionOrder(candidates, log) {
        resolveStateTransitions();
        const sortedByPos = [...candidates].filter(u => u.alive && !u._isDead).sort((a, b) => a.pos - b.pos);
        const passUnits = [];
        const priorityDeclarations = [];

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
            const fullAllySide = u.camp === 'ally' ? A : B;
            if (isBlocked(u, fullAllySide) && isMelee(u.role)) {
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

        // 将 pass 单位也放入排序队列，按站位插入
        // 构造一个统一的排队序列：priority > 0 优先排在前面，同 priority 按 pos 排
        const queue = [];
        for (const d of priorityDeclarations) {
            queue.push({ unit: d.unit, isPass: false, priority: d.priority, reason: null });
        }
        for (const p of passUnits) {
            queue.push({ unit: p.unit, isPass: true, priority: 0, reason: p.reason });
        }
        // 排序：priority 高优先，同 priority 按 pos
        queue.sort((a, b) => {
            if (a.priority !== b.priority) return b.priority - a.priority;
            return a.unit.pos - b.unit.pos;
        });

        // 取出排在最前面的
        if (queue.length === 0) return { actingUnit: null, passEntry: null, isPriorityAction: false };
        const head = queue[0];
        if (head.isPass) {
            if (head.unit._kuLianActive) {
                log.push({ type:'info', text:`<span class="gold">🏋️ 苦练：${head.unit.name} 每回合最先行动！</span>` });
            }
            return { actingUnit: null, passEntry: { unit: head.unit, reason: head.reason }, isPriorityAction: false };
        }
        // 普通或优先行动单位
        if (head.priority > 0 && head.unit._kuLianActive) {
            log.push({ type:'info', text:`<span class="gold">🏋️ 苦练：${head.unit.name} 每回合最先行动！</span>` });
        }
        return { actingUnit: head.unit, passEntry: null, isPriorityAction: head.priority > 0 };
    }

    let currentSide = 'enemy';

    while (A.some(u => u.alive && !u._acted) || B.some(u => u.alive && !u._acted)) {
        const currentTeam = currentSide === 'ally' ? A : B;
        // 姐姐附身：明教第一次被调度时触发，先于任何明教单位行动
        if (currentSide === 'ally' && !A._butterflyTriggered) {
            A._butterflyTriggered = true;
            const sisterForAttach = A.find(u => u.isXiaoZhaoSister && u.alive && u.pos === 4 && !u._stunned && !u._butterflyHost);
            if (sisterForAttach) {
                sisterComp.executeAttach(A, log);
                // 附身完后 yield 一次，让事件出队刷新 UI
                const attachEvents = GlobalStore.flushBattleEvents();
                yield { log: [...log], events: attachEvents, ally: A, enemy: B, winner: null, done: false, doubleStrikeUid: doubleStrikeUnitUid };
                log = [];
                // 重新拉取候选人列表（附身可能改变 _acted 状态）
            }
        }
        const candidates = currentTeam.filter(u => u.alive && !u._acted).sort((a, b) => a.pos - b.pos);
        if (candidates.length === 0) {
            currentSide = currentSide === 'ally' ? 'enemy' : 'ally';
            continue;
        }
        const orderResult = resolveActionOrder(candidates, log);

        // 被跳过单位（遮挡/眩晕/拒马）：轮到它时才执行休息回血和日志
        if (orderResult.passEntry) {
            const { unit, reason } = orderResult.passEntry;
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
            // pass 单位不切换阵营，当前阵营继续出下一个
            continue;
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
        // 飞回和蛛落只在真正回合结束时执行，攻击循环内暂存
        for (const decl of endStateTransitions) {
            if (decl.type === 'butterflyReturn') {
                if (!A._pendingStateTransitions) A._pendingStateTransitions = [];
                A._pendingStateTransitions.push(decl);
            } else if (decl.type === 'spiderDescend') {
                if (!A._pendingStateTransitions) A._pendingStateTransitions = [];
                A._pendingStateTransitions.push(decl);
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

        // 胜利时先执行飞回/蛛落，让姐姐归队后再展示胜利画面
        if (winner) {
            eventBus.emit('onRoundEnd', { A, B, log, forced: true });
            // 消费本次 onRoundEnd 产生的飞回/蛛落声明
            const winPendingDecls = [];
            if (A._pendingStateTransitions) { winPendingDecls.push(...A._pendingStateTransitions); A._pendingStateTransitions = []; }
            if (B._pendingStateTransitions) { winPendingDecls.push(...B._pendingStateTransitions); B._pendingStateTransitions = []; }
            for (const decl of winPendingDecls) {
                if (decl.type === 'butterflyReturn') {
                    sisterComp.executeReturn(decl.sister, A, log);
                } else if (decl.type === 'spiderDescend') {
                    brotherComp.executeDescend(decl.unit, A, B, log);
                }
            }
        }

        yield { log: [...log], events: stepEvents, ally: A, enemy: B, winner, done };
        log = [];

        if (done) return;
    }

    // 回合真正结束时，执行暂存的飞回和蛛落声明
    const allPendingDecls = [];
    if (A._pendingStateTransitions) { allPendingDecls.push(...A._pendingStateTransitions); A._pendingStateTransitions = []; }
    if (B._pendingStateTransitions) { allPendingDecls.push(...B._pendingStateTransitions); B._pendingStateTransitions = []; }
    for (const decl of allPendingDecls) {
        if (decl.type === 'butterflyReturn') {
            sisterComp.executeReturn(decl.sister, A, log);
        } else if (decl.type === 'spiderDescend') {
            brotherComp.executeDescend(decl.unit, A, B, log);
        }
    }

    [A, B].forEach(team => {
        for (let i = team.length - 1; i >= 0; i--) {
            const u = team[i];
            u._resting = false;
            if (u._restingTimer) { clearTimeout(u._restingTimer); u._restingTimer = null; }
            // 死马不再删除，保留在数组中供战报统计承伤
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