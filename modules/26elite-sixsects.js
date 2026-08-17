// modules/26elite-sixsects.js - 六大派精英组件合集
// V5.5.0 | ~12000 bytes| 2026-08-17 事实化重构：简单日志走render/30
export const VER = 'modules/26elite-sixsects.js V5.5.0';
import { registerElite } from '../core/08-elite-registry.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { eventBus, EXECUTION_LAYER as L, EFFECT_TYPES } from '../infra/50-event-bus.js';
import { canXingFenTrigger, consumeXingFen, applyXingFenGrant, tickKuaiLeHeal, checkKuLian } from './20elite-skills.js';
import { emitEvent, applyStatChange, applyMaxHpChange, getBattleRng } from '../core/13battle-shared.js';
import {
    renderXingFenRetryFact,
    renderXinHunFact,
    renderXingFenCostFact,
    renderKuLianFact
} from '../render/30-fact-renderer.js';
const ES = CONFIG.ELITE_SKILLS;

// ==================== 宋青书 ====================
export function createSongQingshuComponent() {
    return {
        name: '宋青书',
        register(eventBus, A, B, log) {
            const song = B.find(u => u.name === '宋青书' && u.alive);
            if (!song) { return; }
            const onAfterApplyDamage = this.onAfterApplyDamage;
            const onAfterAttack = this.onAfterAttack;
            eventBus.on('afterMiss', L.AFTER_MISS.SONG_XINGFEN_RETRY, (data) => {
                const { unit, log } = data;
                if (unit.name !== '宋青书' || !unit.alive) return;
                if (!B || !B.some(u => u.alive)) return;
                if (canXingFenTrigger(unit)) {
                    consumeXingFen(unit);
                    log.push(renderXingFenRetryFact({ unitName: unit.name }));
                    data.retry = true;
                    data.retryTargetUid = null;
                }
            });
            eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.SONG_XINGFEN, (data) => {
                if (data.unit.name !== '宋青书') return;
                onAfterApplyDamage(data.unit, data.target, { dmg: data.dmg }, data.group, B, data.log);
            });
            eventBus.on('beforeDamageCalc', L.BEFORE_DAMAGE_CALC.SONG_TRUE_DMG, (data) => {
                if (data.unit.name !== '宋青书' || !data.target || !data.target.alive || !data.declarations) return;
                const trueDmg = Math.floor(data.target.hp * (CONFIG.ELITE_SKILLS.rebelStrike.currentHpRatio || 0.10));
                if (trueDmg > 0) {
                    data.declarations.push({ type: EFFECT_TYPES.BONUS_DMG, value: trueDmg, source: data.unit, label: '叛逆突袭' });
                }
            });
            eventBus.on('afterAttack', L.AFTER_ATTACK.SONG_XINGFEN_EXTRA, async (data) => {
                if (data.unit.name !== '宋青书') { return; }
                if (data.unit._xingFenExtraAttacking) { return; }
                await onAfterAttack(data.unit, data.target, B, A, data.log, B, A, data.state);
            });
            
            eventBus.on('beforeSelectTarget', L.BEFORE_SELECT_TARGET.SONG_REBEL, (data) => {
                if (data.unit.name !== '宋青书' || !data.unit.alive || !data.validTargets || data.validTargets.length === 0) return;
                const rebelTarget = data.validTargets.reduce((a, b) => (a.hp / a.maxHp) > (b.hp / b.maxHp) ? a : b);
                if (rebelTarget) {
                    data.declaration.targetResult = rebelTarget;
                    data.declaration.phantomLog = null;
                }
            });
            eventBus.on('onRoundStart', L.ROUND_START.XINGFEN_GRANT, (data) => {
                const { A, B, log } = data;
                applyXingFenGrant(B, log);

                const kuLianSong = checkKuLian(B);
                if (kuLianSong) {
                    kuLianSong._kuLianActive = true;
                    const kuLianParams = getSkillParams('宋青书', 'kuLian') || CONFIG.ELITE_SKILLS.kuLian;
                    const s = {
                        atkBonus: kuLianParams.atkBonus || 1,
                        defBonus: kuLianParams.defBonus || 1,
                        hpBonus: kuLianParams.hpBonus || 2.5
                    };
                    B.forEach(u => {
                        if (!u.alive || u.isHorse) return;
                        const mult = u.uid === kuLianSong.uid ? 2 : 1;
                        applyStatChange(u, 'atk', s.atkBonus * mult, null, '苦练');
                        applyStatChange(u, 'def', s.defBonus * mult, null, '苦练');
                        applyMaxHpChange(u, u.maxHp + s.hpBonus * mult, null, '苦练血上限');
                        u._baseAtk = (u._baseAtk || u.atk) + s.atkBonus * mult;
                        u._baseDef = (u._baseDef || u.def) + s.defBonus * mult;
                        u._baseMaxHp = Math.max(u._baseMaxHp || u.maxHp, u.maxHp);
                    });
                    log.push(renderKuLianFact({ unitName: kuLianSong.name, atkBonus: s.atkBonus, defBonus: s.defBonus, hpBonus: s.hpBonus }));
                }
            });
        },
        onAfterApplyDamage(unit, target, dmgCalc, group, allySide, log) {
            if (unit.name !== '宋青书' || !unit.alive) return;
            const zhou = allySide.find(u => u.name === '周芷若' && u.alive);
            const xinHunParams = getSkillParams('宋青书', 'xinHun') || ES.xinHun;
            const hpDeduct = xinHunParams.hpDeduct || 1;
            const healLevels = xinHunParams.healLevels || [0.16, 0.10, 0.06, 0.03];
            if (zhou) {
                applyStatChange(zhou, 'hp', -hpDeduct, unit, '新婚扣血');
                zhou.dmgTaken += hpDeduct;
                zhou._kuaiLeStack.push({ healPct: healLevels[0] });
                if (zhou.hp <= 0) { if (!zhou._deathTime) zhou._deathTime = Date.now(); }
                log.push(renderXinHunFact({
                    attackerName: unit.name,
                    targetName: zhou.name,
                    hpDeduct,
                    healPct: healLevels[0],
                    stackCount: zhou._kuaiLeStack.length,
                    zhouUid: zhou.uid,
                    zhouHpAfter: zhou.hp,
                    isDead: !!zhou._pendingDeath
                }));
                if (zhou._pendingDeath) { log.push({ type:'info', text:`<span class="red">💀 ${zhou.name} 因新婚扣血而阵亡！</span>`, uidD:zhou.uid, isDead:true }); }
            }
            if (zhou) {
                if (!unit._xingFenPenaltyCount) unit._xingFenPenaltyCount = 0;
                unit._xingFenPenaltyCount = (unit._xingFenPenaltyCount||0)+1;
                const penalty = unit._xingFenPenaltyCount;
                if (penalty > 0 && unit.maxHp > 1) {
                    const oldMaxHp = unit.maxHp;
                    applyMaxHpChange(unit, Math.max(1, unit.maxHp - penalty), null, '性奋代价');
                    if (unit.hp <= 0) { if (!unit._deathTime) unit._deathTime = Date.now(); }
                    log.push(renderXingFenCostFact({ unitName: unit.name, oldMaxHp, newMaxHp: unit.maxHp, penalty }));
                }
            }
        },
        async onAfterAttack(unit, target, allySide, enemySide, log, A, B, state) {
            if (unit.name !== '宋青书' || !unit.alive || !enemySide.some(u => u.alive)) return;
            if (!unit._xingFenPenaltyCount || unit._xingFenPenaltyCount <= 0) return;
            if (unit._xingFenExtraAttacking) return;
            log.push({ type:'info', text:`<span class="gold">💗 性奋：${unit.name} 获得额外攻击机会！</span>` });
            unit._xingFenExtraAttacking = true;
            const { processUnitAttack } = await import('../core/10battle-attack.js');
            await processUnitAttack(unit, allySide, enemySide, log, B, A, state, null, null);
            unit._xingFenExtraAttacking = false;
        }
    };
}

// ==================== 周芷若 ====================
export function createZhouZhiruoComponent() {
    return {
        name: '周芷若',
        register(eventBus, A, B, log) {
            const zhou = B.find(u => u.name === '周芷若' && u.alive);
            if (!zhou) return;
            const onAfterDamageCalc = this.onAfterDamageCalc;
            eventBus.on('afterAttack', L.AFTER_ATTACK.ZHOU_CLAW, (data) => {
                if (data.unit.name !== '周芷若') return;
                onAfterDamageCalc(data.unit, data.target, data.dmg, data.log, B, A, data);
            });
            eventBus.on('onRoundStart', L.ROUND_START.XINGFEN_GRANT, (data) => {
                const { A, B, log } = data;
                tickKuaiLeHeal(A.concat(B), log);
            });
        },
        onAfterDamageCalc(unit, target, dmg, log, allySide, enemySide, data) {
            if (unit.name !== '周芷若' || !target || !target.alive) return 0;
            const rng = getBattleRng();
            const battleState = window.GlobalStore?.get('currentBattleState');
            const zhangAlive = battleState && battleState.ally && battleState.ally.some(u => u.isZhang && u.alive);
            const s = ES.nineYinClaw;
            const baseHit = zhangAlive ? (s.jealousBaseDmg||5) : (s.baseDmg||3);
            if (!unit._nineYinFirstDone) { unit._nineYinFirstDone = true; }
            else { if (rng.next() > s.procChance) return 0; }

            const hits = [];
            let executeInfo = null;
            let totalHeal = 0;
            const song = allySide.find(u => u.name === '宋青书' && u.alive);
            let simulatedTargetHp = target.hp;
            let simulatedSongHp = song ? song.hp : 0;
            let depth = 0;

            while (simulatedTargetHp > 0 && !target._pendingDeath && depth < 100) {
                if (depth > 0 && rng.next() > s.chainProcChance) break;
                const lostHp = target.maxHp - simulatedTargetHp;
                const ratio = zhangAlive ? s.jealousLostHpRatio : s.lostHpRatio;
                const ratioDmg = Math.floor(lostHp*ratio + target.maxHp*(zhangAlive?(s.jealousMaxHpRatio||0.02):(s.maxHpRatio||0.01)));
                const bonusDmg = baseHit + Math.max(0, ratioDmg);
                simulatedTargetHp -= bonusDmg;
                const isDeadByHit = simulatedTargetHp <= 0;
                const hpPctAfter = simulatedTargetHp / target.maxHp;
                const execThreshold = zhangAlive ? (s.jealousExecuteThreshold||0.15) : (s.executeThreshold||0.12);
                const isExecute = !isDeadByHit && hpPctAfter <= execThreshold && simulatedTargetHp > 0;
                const hitLogText = `<span style="color:#222">🐾 九阴白骨爪${depth>0?'连锁':'追击'}！${unit.name} 对 ${target.name} 造成 ${bonusDmg} 点伤害${isExecute?'（斩杀）':(zhangAlive?'【嫉妒】':'')}</span>`;
                hits.push({ dmg: bonusDmg, logText: hitLogText, isClawHit: true, clawAttackerUid: unit.uid, clawTargetUid: target.uid, isExecute });
                if (song && song.alive) {
                    const healAmount = Math.min(bonusDmg, song.maxHp - simulatedSongHp);
                    totalHeal += healAmount;
                    simulatedSongHp += healAmount;
                }
                if (isDeadByHit) break;
                if (isExecute) {
                    executeInfo = { logText: `<span style="color:#222">🐾 九阴白骨爪斩杀！${unit.name} 对 ${target.name} 造成致命一击</span>`, isClawHit: true, clawAttackerUid: unit.uid, clawTargetUid: target.uid, isExecute: true };
                    break;
                }
                depth++;
            }

            if (hits.length > 0 && data && data.declarations) {
                data.declarations.push({
                    type: EFFECT_TYPES.CLAW_CHAIN,
                    source: unit,
                    target: target,
                    hits: hits,
                    execute: executeInfo
                });
            }
            if (totalHeal > 0 && song && song.alive && data && data.declarations) {
                data.declarations.push({
                    type: EFFECT_TYPES.HEAL,
                    value: totalHeal,
                    source: song,
                    logText: `<span class="green">💚 宋青书因九阴白骨爪共回复${totalHeal}点生命</span>`
                });
            } else if (song && song.alive) {
                log.push({ type:'info', text:`<span class="gray">💚 宋青书已满血，白骨爪未能回复生命</span>` });
            }

            return hits.reduce((sum, h) => sum + h.dmg, 0);
        }
    };
}

registerElite('宋青书', createSongQingshuComponent);
registerElite('周芷若', createZhouZhiruoComponent);