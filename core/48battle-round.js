// core/48battle-round.js - 光明顶5v5 回合循环与生成器
// V5.2.0 | ~16000 bytes | 2026-07-16 从06battle-engine-core拆分
export const VER = 'core/48battle-round.js V5.2.0';

import { CONFIG } from './01config-5v5-test.js';
import { rand, isMelee, isBlocked, makeFXSnapshot, hasBuff, getUnitCol, getUnitRow } from './03battle-utils.js';
import { computeBuffStats, logBuffSummary } from './04buff-system.js';
import { spawnHorse, destroyHorse } from './05battle-horse.js';
import { Unit } from './02unit.js';
import {
    checkKuLian, applyXingFenGrant, tickXuanmingPoison, tickKuaiLeHeal,
    butterflyAttach, butterflyReturn, spiderTransform, spiderFlyCheck, spiderReturn,
    canXingFenTrigger, consumeXingFen, applyXingFenPenalty, isXiaoZhaoPermanentActive
} from '../modules/23elite-skills.js';
import { processUnitAttack } from './47battle-attack.js';
// selectTarget 已移除，无替代导入
import { getNextAvailableUnit, finalizeDeaths, emitFullUnitState, checkZhangSwitch } from './50battle-shared.js';

const C = CONFIG;

// 从47battle-attack和06battle-engine-core中需要的辅助函数
// 这些函数在06中定义，但回合模块也需要，为避免循环引用，在此处声明后由外部注入
// 实际使用时将通过参数传入或从window获取
// 已移至 06battle-engine-core.js，通过 import 使用

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

    const xiaoZhao = A.find(u => u.isXiaoZhao && u.alive);

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

    // 清理死马，腾出位置
    [A, B].forEach(team => {
        for (let i = team.length - 1; i >= 0; i--) {
            const u = team[i];
            if (u.isHorse && !u.alive) {
                team.splice(i, 1);
            }
        }
    });
    // 团队拒马 A
    const teamHorseA = spawnHorse(A, log, B);
    if (teamHorseA) {
        log.push({type:'buff-summon', text:`<span class="gold">🐴 拒马阵：拒马出现在${teamHorseA.pos}号位！</span>`, buffType:'summon', horsePos: teamHorseA.pos, horseUid: teamHorseA.uid, horseTaunt: '嘶——！'});
    }
    // 团队拒马 B
    const teamHorseB = spawnHorse(B, log, A);
    if (teamHorseB) {
        log.push({type:'buff-summon', text:`<span class="gold">🐴 拒马阵：拒马出现在${teamHorseB.pos}号位！</span>`, buffType:'summon', horsePos: teamHorseB.pos, horseUid: teamHorseB.uid, horseTaunt: '嘶——！'});
    }

    applyXingFenGrant(B, log);

    // 小昭蝶变：每回合随机变换职业
    A.forEach(u => {
        if (u.isXiaoZhaoSister && u.alive) { /* 姐的附身在明教首次攻击前触发，由47处理 */ }
        if (u.isXiaoZhaoBrother && u.alive) {
            spiderTransform(u, log);
            if (u._spiderTriggeredHit === undefined) u._spiderTriggeredHit = false;
            if (u._spiderTriggered70 === undefined) u._spiderTriggered70 = false;
            if (u._spiderTriggered40 === undefined) u._spiderTriggered40 = false;
        }
    });

    // 小昭永久拒马（xiaoZhao 已在上方定义）
    let teamHasHorse = hasBuff(A._activeBuffs, 'horseFormation');
    let hasPermanentHorse = xiaoZhao && xiaoZhao.isXiaoZhaoBrother && !teamHasHorse && xiaoZhao._permanentBuffs && xiaoZhao._permanentBuffs.some(b => b.key === 'horseFormation');
    if (!hasPermanentHorse) {
        const ctx = window._getPlayerContext?.();
        const uiXz = ctx?.UI?.allyTeam?.find(u => u.isXiaoZhao);
        if (uiXz && !teamHasHorse) {
            hasPermanentHorse = uiXz._permanentBuffs && uiXz._permanentBuffs.some(b => b.key === 'horseFormation');
        }
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

    // 苦练：宋青书每次行动前给全体队友+1攻+1防+2生命上限，自身翻倍
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

    A._butterflyTriggered = false;
    A.forEach(u => {
        if (!u.alive) return;
        let allyTeamWithDead = A.slice();
        let hasCarryActive = hasBuff(A._activeBuffs, 'carry') || (u.isXiaoZhao && isXiaoZhaoPermanentActive(u, A._activeBuffs, 'carry'));
        if (hasCarryActive) {
            allyTeamWithDead = allyTeamWithDead.concat((state.allAllies || state.ally).filter(c => !c.alive));
            allyTeamWithDead = allyTeamWithDead.filter((u, i, arr) => arr.findIndex(v => v.uid === u.uid) === i);
        }
        let stats = computeBuffStats(u, A._activeBuffs || [], allyTeamWithDead);
        // emit stat-bonus-change
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
        if (hasCarryActive && carryPositions.includes(u.pos) && u._baseMaxHp !== undefined && !u.isHorse && !u.isZhang) {
            // 先回退旧加成
            if (u.maxHp > 0 && u._baseMaxHp > 0) {
                u.hp = Math.floor(u.hp * (u._baseMaxHp / u.maxHp));
            }
            u.maxHp = u._baseMaxHp;
            if (u._baseAtk !== undefined) u.atk = u._baseAtk + (u._carryAtkBonus || 0) + (u._butterflyAtkBonus || 0);
            if (u._baseDef !== undefined) u.def = u._baseDef + (u._carryDefBonus || 0) + (u._butterflyDefBonus || 0);
            // 再应用新加成
            // ★ Carry 加成存入独立字段，不污染基础属性
            u._carryAtkBonus = Math.floor(stats.carryAtkAbs);
            u._carryDefBonus = Math.floor(stats.carryDefAbs);
            u._carryHpBonus = Math.floor(stats.carryHpAbs);
            const holyAtkBonus = Math.floor((u._baseAtk || u.atk) * stats.atkBonus);
            const holyDefBonus = Math.floor((u._baseDef || u.def) * stats.defBonus);
            u.atk = (u._baseAtk || u.atk) + u._carryAtkBonus + (u._butterflyAtkBonus || 0) + holyAtkBonus;
            u.def = (u._baseDef || u.def) + u._carryDefBonus + (u._butterflyDefBonus || 0) + holyDefBonus;
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
        } else if (!u.isHorse && !hasCarryActive && !u.isXiaoZhao && !u.isZhang) {
            const sister = A.some(a => a.isXiaoZhaoSister && a.alive);
            const carryPositions = sister ? [4, 5, 6] : [5];
            if (carryPositions.includes(u.pos) && (u._carryAtkBonus || u._carryDefBonus || u._carryHpBonus)) {
                // Carry 过期，只清零 Carry 字段，不动自身成长和附身加成
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
        } else if (u.isXiaoZhao && isXiaoZhaoPermanentActive(u, A._activeBuffs, 'carry') && u._baseMaxHp !== undefined) {
            // 小昭永久carry：固定两层精通加成（+3攻 +4防 +20血上限）
            u.atk += 3;
            u.def += 4;
            u.maxHp += 20;
            u._baseMaxHp = u.maxHp;
            u.hp = Math.min(u.hp + 20, u.maxHp);
            if (typeof window._emitEvent === 'function') {
                window._emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def });
            }
        }
        u._extinctionUsed = false;
        u._acted = false;
        u._resting = false;
        if (u._restingTimer) { clearTimeout(u._restingTimer); u._restingTimer = null; }
        if (typeof window._emitEvent === 'function') {
            window._emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def, _resting: false });
        }
        u._doubleStriked = false;
        u._stunned = false;
        u._xiaoZhaoDoubleStriked = false;
        u._bloodthirstStriked = false;
        u._linkTriggered = false;
        if (u._xingFenPenaltyCount === undefined) u._xingFenPenaltyCount = 0;
    });

    B.forEach(u => {
        if (!u.alive) return;
        let stats = computeBuffStats(u, B._activeBuffs || [], B);
        if (typeof window._emitEvent === 'function') {
            window._emitEvent(u, 'stat-bonus-change', {
                buffAtkBonus: stats.atkBonus,
                buffDefBonus: stats.defBonus,
                buffDodgeBonus: stats.dodgeBonus,
                buffHpBonus: stats.hpBonus
            });
        }
        u._extinctionUsed = false;
        u._acted = false;
        u._resting = false;
        if (u._restingTimer) { clearTimeout(u._restingTimer); u._restingTimer = null; }
        if (typeof window._emitEvent === 'function') {
            window._emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def, _resting: false });
        }
        u._doubleStriked = false;
        u._stunned = false;
        u._xiaoZhaoDoubleStriked = false;
        u._bloodthirstStriked = false;
        u._linkTriggered = false;
        if (u._xingFenPenaltyCount === undefined) u._xingFenPenaltyCount = 0;
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
                        // 5秒后自动清除休息状态，防止绿色特效一直显示
                        if (u._restingTimer) clearTimeout(u._restingTimer);
                        u._restingTimer = setTimeout(() => {
                            u._resting = false;
                            if (typeof window._emitEvent === 'function') {
                                window._emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def, _resting: false });
                            }
                            // 强制触发UI刷新，清除绿色休息特效
                            const ctx = window._getPlayerContext?.();
                            if (ctx && ctx.updateUI) ctx.updateUI();
                        }, 3000);
                        if (typeof window._emitEvent === 'function') {
                            window._emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def });
                        }
                        let bg = {type:'attack-group', uidA:u.uid, uidD:null, entries:[], isBlock:true, _fxSnapshot:makeFXSnapshot(u,null), waveTaunt:null, waveUnit:null, buffEffects:[], healAmount: 15, healUnitUid: u.uid};
                        bg.entries.push({type:'combat-text', text:`<span class="${u.camp==='ally'?'blue':'orange'}">${u.camp==='ally'?'明教':'六大派'} ${u.name}</span> 无法攻击`});
                        bg.entries.push({type:'info', text:`<span class="green">🐴 拒马休息回复20点生命（${hpBefore} → ${hpAfter}）</span>`});
                        bg._events = [...window._battleEvents];
                        window._battleEvents = [];
                        log.push(bg);
                        continue;
                    }

                    if (u._spiderFlying || u._flyMode) {
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
                    const xiaoZhaoActive = A.some(u => u.isXiaoZhao && u.alive);
                    if (blocked && isMelee(u.role) && !(xiaoZhaoActive && hasBuff(A._activeBuffs, 'doubleStrike') && u.uid === doubleStrikeUnitUid)) {
                        u._acted = true;
                        let hpBefore = Math.floor(u.hp);
                        u.hp = Math.min(u.maxHp, u.hp + 15);
                        let hpAfter = Math.floor(u.hp);
                        u._resting = true;
                        // 5秒后自动清除休息状态，防止绿色特效一直显示
                        if (u._restingTimer) clearTimeout(u._restingTimer);
                        u._restingTimer = setTimeout(() => {
                            u._resting = false;
                            if (typeof window._emitEvent === 'function') {
                                window._emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def, _resting: false });
                            }
                            // 强制触发UI刷新，清除绿色休息特效
                            const ctx = window._getPlayerContext?.();
                            if (ctx && ctx.updateUI) ctx.updateUI();
                        }, 3000);
                        if (typeof window._emitEvent === 'function') {
                            window._emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def });
                        }
                        let bg = {type:'attack-group', uidA:u.uid, uidD:null, entries:[], isBlock:true, _fxSnapshot:makeFXSnapshot(u,null), waveTaunt:null, waveUnit:null, buffEffects:[], healAmount: 15, healUnitUid: u.uid};
                        bg.entries.push({type:'combat-text', text:`<span class="${u.camp==='ally'?'blue':'orange'}">${u.camp==='ally'?'明教':'六大派'} ${u.name}</span> 被遮挡`});
                        bg.entries.push({type:'info', text:`<span class="green">休息回复20点生命（${hpBefore} → ${hpAfter}）</span>`});
                        bg._events = [...window._battleEvents];
                        window._battleEvents = [];
                        log.push(bg);
                        continue;
                    }

                    found = u;
                    break;
                }

                if (found) {
                    actingUnit = found;
                }
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

        // 苦练不占用行动次数，不切换阵营
        if (unit !== kuLianUnit) {
            currentSide = currentSide === 'ally' ? 'enemy' : 'ally';
        }

        finalizeDeaths(A);
        finalizeDeaths(B);
        // 妹妹飞天检查（被攻击后触发）
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

    destroyHorse(A, log); destroyHorse(B, log);

    // 小昭·姊 回合结束飞回 / 小昭·妹 回合结束落下
    A.forEach(u => {
        if (u.isXiaoZhaoSister && u.alive && u._butterflyHost) butterflyReturn(u, A, log);
    });
    A.forEach(u => {
        if (u.isXiaoZhaoBrother && u.alive && u._spiderFlying) spiderReturn(u, A, B, log);
    });

    [A, B].forEach(team => {
        for (let i = team.length - 1; i >= 0; i--) {
            const u = team[i];
            // 回合结束清除休息状态和定时器
            u._resting = false;
            if (u._restingTimer) { clearTimeout(u._restingTimer); u._restingTimer = null; }
            if (typeof window._emitEvent === 'function') {
                window._emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def, _resting: false });
            }
            if (u.isHorse && !u.alive) {
                if (typeof window._emitEvent === 'function') {
                    window._emitEvent(u, 'unit-remove', { uid: u.uid });
                }
                team.splice(i, 1);
            }
        }
    });

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
            if (!u._deathTime) u._deathTime = Date.now();
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

// runBattle 已移除，播放器直接使用 createRoundStepper 逐步计算