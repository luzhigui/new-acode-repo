// modules/26elite-sixsects.js - 六大派精英组件合集
// V5.6.0 | ~12000 bytes| 2026-08-21 fact化完成：不再import render/30
export const VER = 'modules/26elite-sixsects.js V5.6.0';
import { registerElite } from '../core/08-elite-registry.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { CONFIG, getSkillParams, getSkillParamsJealous } from '../core/01config-5v5-test.js';
import { eventBus, EXECUTION_LAYER as L, EFFECT_TYPES } from '../infra/50-event-bus.js';
import { canXingFenTrigger, consumeXingFen, applyXingFenGrant, tickKuaiLeHeal, checkKuLian } from './20elite-skills.js';
import { emitEvent, applyStatChange, applyMaxHpChange, getBattleRng } from '../core/13battle-shared.js';
const ES = CONFIG.ELITE_SKILLS;

// ==================== 宋青书 ====================
export function createSongQingshuComponent() {
    return {
        name: '宋青书',
        declarations: [{
            name: '宋青书',
            targetRule: 'highestHpPct',
            beforeDamageEffects: [{ type: 'bonusTargetCurrentHp', ratio: 0.10, label: '叛逆突袭' }]
        }],
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
                    log.push({ factType: 'xingFenRetry', data: { unitName: unit.name } });
                    if (!data.extraRequests) data.extraRequests = [];
                    data.extraRequests.push({
                        unit,
                        targetUid: null,
                        reason: 'xingFenMiss',
                        actedMode: 'allow',
                        priority: 30
                    });
                }
            });
            eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.SONG_XINGFEN, (data) => {
                if (data.unit.name !== '宋青书') return;
                onAfterApplyDamage(data.unit, data.target, { dmg: data.dmg }, data.group, B, data.log);
            });
            eventBus.on('afterAttack', L.AFTER_ATTACK.SONG_XINGFEN_EXTRA, async (data) => {
                if (data.unit.name !== '宋青书') { return; }
                if (data.unit._xingFenExtraAttacking) { return; }
                await onAfterAttack(data.unit, data.target, B, A, data.log, B, A, data.state);
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
                    log.push({ factType: 'kuLian', data: { unitName: kuLianSong.name, atkBonus: s.atkBonus, defBonus: s.defBonus, hpBonus: s.hpBonus } });
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
                log.push({
                    factType: 'xinHun',
                    data: {
                        attackerName: unit.name,
                        targetName: zhou.name,
                        hpDeduct,
                        healPct: healLevels[0],
                        stackCount: zhou._kuaiLeStack.length,
                        zhouUid: zhou.uid,
                        zhouHpAfter: zhou.hp,
                        isDead: !!zhou._pendingDeath
                    }
                });
                if (zhou._pendingDeath) { log.push({ factType: 'xinHunDeath', data: { unitName: zhou.name, uidD: zhou.uid } }); }
            }
            if (zhou) {
                unit._xingFenPenaltyCount = (unit._xingFenPenaltyCount || 0) + 1;
                const penalty = unit._xingFenPenaltyCount + 1;
                if (penalty > 0 && unit.maxHp > 1) {
                    const oldMaxHp = unit.maxHp;
                    applyMaxHpChange(unit, Math.max(1, unit.maxHp - penalty), null, '性奋代价');
                    if (unit.hp <= 0) { if (!unit._deathTime) unit._deathTime = Date.now(); }
                    log.push({ factType: 'xingFenCost', data: { unitName: unit.name, oldMaxHp, newMaxHp: unit.maxHp, penalty } });
                }
            }
        },
        async onAfterAttack(unit, target, allySide, enemySide, log, A, B, state) {
            if (unit.name !== '宋青书' || !unit.alive || !enemySide.some(u => u.alive)) return;
            if (!unit._xingFenPenaltyCount || unit._xingFenPenaltyCount <= 0) return;
            if (unit._xingFenExtraAttacking) return;
            log.push({ factType: 'xingFenExtraAttack', data: { unitName: unit.name } });
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
            const sNormal = getSkillParams('周芷若', 'nineYinClaw') || ES.nineYinClaw;
            const sJealous = getSkillParamsJealous('周芷若', 'nineYinClaw') || ES.nineYinClaw;
            const s = zhangAlive ? sJealous : sNormal;
            const baseHit = zhangAlive ? (s.baseDmg||5) : (s.baseDmg||3);
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
                const ratio = s.lostHpRatio;
                const ratioDmg = Math.floor((lostHp*ratio + target.maxHp*(s.maxHpRatio||0.01)) * 10) / 10;
                const bonusDmg = Math.floor((baseHit + Math.max(0, ratioDmg)) * 10) / 10;
                simulatedTargetHp -= bonusDmg;
                const isDeadByHit = simulatedTargetHp <= 0;
                const hpPctAfter = simulatedTargetHp / target.maxHp;
                const execThreshold = s.executeThreshold || 0.15;
                const isExecute = !isDeadByHit && hpPctAfter <= execThreshold && simulatedTargetHp > 0;
                hits.push({ dmg: bonusDmg, factType: 'clawHit', data: { unitName: unit.name, targetName: target.name, dmg: bonusDmg, isExecute, jealous: zhangAlive, depth }, isClawHit: true, clawAttackerUid: unit.uid, clawTargetUid: target.uid, isExecute });
                if (song && song.alive) {
                    const healAmount = Math.min(bonusDmg, song.maxHp - simulatedSongHp);
                    totalHeal += healAmount;
                    simulatedSongHp += healAmount;
                }
                if (isDeadByHit) break;
                if (isExecute) {
                    executeInfo = { factType: 'clawExecute', data: { unitName: unit.name, targetName: target.name }, isClawHit: true, clawAttackerUid: unit.uid, clawTargetUid: target.uid, isExecute: true };
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
                    factType: 'clawHeal',
                    factData: { totalHeal }
                });
            } else if (song && song.alive) {
                log.push({ factType: 'clawNoHeal', data: {} });
            }

            return hits.reduce((sum, h) => sum + h.dmg, 0);
        }
    };
}

registerElite('宋青书', createSongQingshuComponent);
registerElite('周芷若', createZhouZhiruoComponent);