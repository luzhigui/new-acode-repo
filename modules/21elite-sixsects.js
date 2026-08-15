// modules/21elite-sixsects.js - 六大派精英组件合集
// V5.4.0 | ~12900 bytes| 2026-08-04 宋青书苦练/新婚接入 game-data
export const VER = 'modules/21elite-sixsects.js V5.4.0';
import { registerElite } from '../core/08-elite-registry.js';
import { GlobalStore } from './18global-store.js';
import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { eventBus, EXECUTION_LAYER as L, EFFECT_TYPES } from '../core/00-event-bus.js';
import { canXingFenTrigger, consumeXingFen, applyXingFenGrant, tickKuaiLeHeal, checkKuLian } from './15elite-skills.js';
import { emitEvent, applyStatChange, applyMaxHpChange, getBattleRng } from '../core/13battle-shared.js';
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
                // 宋青书-性奋：miss后获得额外攻击机会
                const { unit, log } = data;
                if (unit.name !== '宋青书' || !unit.alive) return;
                if (!B || !B.some(u => u.alive)) return;
                if (canXingFenTrigger(unit)) {
                    consumeXingFen(unit);
                    log.push({type:'info', text:`<span class="gold">💗 性奋：${unit.name} 获得额外攻击机会！</span>`});
                    data.retry = true;
                    data.retryTargetUid = null;
                }
            });
            eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.SONG_XINGFEN, (data) => {
                // 宋青书-性奋：攻击后扣血+降最大生命上限（周芷若存活时触发）
                if (data.unit.name !== '宋青书') return;
                onAfterApplyDamage(data.unit, data.target, { dmg: data.dmg }, data.group, B, data.log);
            });
            eventBus.on('beforeDamageCalc', L.BEFORE_DAMAGE_CALC.SONG_TRUE_DMG, (data) => {
                // 宋青书-叛逆突袭：目标当前生命值10%作为额外真伤（bonusDmg声明）
                if (data.unit.name !== '宋青书' || !data.target || !data.target.alive || !data.declarations) return;
                const trueDmg = Math.floor(data.target.hp * (CONFIG.ELITE_SKILLS.rebelStrike.currentHpRatio || 0.10));
                if (trueDmg > 0) {
                    data.declarations.push({ type: EFFECT_TYPES.BONUS_DMG, value: trueDmg, source: data.unit });
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
                    log.push({ type:'info', text:`<span class="gold">🏋️ 苦练：${kuLianSong.name} 激励全体队友+${s.atkBonus}攻+${s.defBonus}防+${s.hpBonus}血上限（自身翻倍）！</span>` });
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
                log.push({ type:'info', text:`<span class="gold">💒 新婚：${unit.name}攻击，${zhou.name}被扣除${hpDeduct}点血量，叠加一层快乐(${Math.round(healLevels[0]*100)}%)！当前快乐层数：${zhou._kuaiLeStack.length}</span>`, buffType:'elite_xinhun', zhouUid:zhou.uid, zhouHpAfter:zhou.hp });
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
                    log.push({ type:'info', text:`<span class="red">💗 性奋代价：${unit.name} 血量上限 ${oldMaxHp} → ${unit.maxHp}（-${penalty}）</span>` });
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
            // 周芷若-九阴白骨爪：攻击后触发白骨爪追击/斩杀/宋青书联动回血
            eventBus.on('afterAttack', L.AFTER_ATTACK.ZHOU_CLAW, (data) => {
                if (data.unit.name !== '周芷若') return;
                onAfterDamageCalc(data.unit, data.target, data.dmg, data.log, B, A);
            });
            // 周芷若-快乐回血：回合开始结算快乐层数回血
            eventBus.on('onRoundStart', L.ROUND_START.XINGFEN_GRANT, (data) => {
                const { A, B, log } = data;
                tickKuaiLeHeal(A.concat(B), log);
            });
        },
        // 白骨爪：首击必触发，后续连锁由 chainProcChance 控制深度；目标血量降到斩杀阈值后触发斩杀，防止无限连锁
        onAfterDamageCalc(unit, target, dmg, log, allySide, enemySide) {
            if (unit.name !== '周芷若' || !target || !target.alive) return 0;
            const rng = getBattleRng();
            const battleState = window.GlobalStore?.get('currentBattleState');
            const zhangAlive = battleState && battleState.ally && battleState.ally.some(u => u.isZhang && u.alive);
            const s = ES.nineYinClaw;
            const baseHit = zhangAlive ? (s.jealousBaseDmg||5) : (s.baseDmg||3);
            if (!unit._nineYinFirstDone) { unit._nineYinFirstDone = true; }
            else { if (rng.next() > s.procChance) return 0; }
            let totalBonus = 0; let depth = 0;
            const healDeclarations = [];
            while (target.alive && !target._pendingDeath) {
                if (depth > 0 && rng.next() > s.chainProcChance) break;
                const lostHp = target.maxHp - target.hp;
                const ratio = zhangAlive ? s.jealousLostHpRatio : s.lostHpRatio;
                const ratioDmg = Math.floor(lostHp*ratio + target.maxHp*(zhangAlive?(s.jealousMaxHpRatio||0.02):(s.maxHpRatio||0.01)));
                let bonusDmg = baseHit + Math.max(0, ratioDmg);
                applyStatChange(target, 'hp', -bonusDmg, unit, '九阴白骨爪');
                totalBonus += bonusDmg;
                // 目标已死亡，立即停止追击/连锁
                if (!target.alive || target._pendingDeath) break;
                const hpPctAfter = target.hp/target.maxHp;
                const execThreshold = zhangAlive ? (s.jealousExecuteThreshold||0.15) : (s.executeThreshold||0.12);
                let isExecute = false;
                if (hpPctAfter <= execThreshold && target.hp > 0) {
                    isExecute = true;
                    applyStatChange(target, 'hp', -target.hp, unit, '白骨爪斩杀');
                }
                const clawEvents = GlobalStore.flushBattleEvents();
                log.push({ type:'info', text:`<span style="color:#222">🐾 九阴白骨爪${depth>0?'连锁':'追击'}！${unit.name} 对 ${target.name} 造成 ${bonusDmg} 点伤害${isExecute?'（斩杀）':(zhangAlive?'【嫉妒】':'')}</span>`, buffType:'elite_bonus', isClawHit:true, clawAttackerUid:unit.uid, clawTargetUid:target.uid, clawTargetHpAfter:target.hp, clawTargetAlive:target.alive, clawTargetIsDead:target.state._isDead, isExecute:isExecute, uidD:target.uid, isDead:!target.alive, _events:clawEvents });
                // 从 allySide 实时查找，不用 currentBattleState 快照
                const song = allySide.find(u => u.name === '宋青书' && u.alive);
                if (song) {
                    const healAmount = Math.min(bonusDmg, song.maxHp - song.hp);
                    if (healAmount > 0) {
                        healDeclarations.push({ type: EFFECT_TYPES.HEAL, value: healAmount, source: song });
                    }
                }
                depth++; if (isExecute || !target.alive || target._pendingDeath) break;
            }
            let songForSummary = allySide.find(u => u.name === '宋青书' && u.alive);
            if (totalBonus > 0) {
                if (!songForSummary) songForSummary = allySide.find(u => u.name === '宋青书' && u.alive);
                if (songForSummary) {
                    const totalHeal = Math.min(totalBonus, songForSummary.maxHp - songForSummary.hp);
                    if (totalHeal > 0) {
                        healDeclarations.push({ type: EFFECT_TYPES.HEAL, value: totalHeal, source: songForSummary });
                        log.push({ type:'info', text:`<span class="green">💚 宋青书因九阴白骨爪共回复${totalHeal}点生命</span>`, isHealEntry:true, healAmount:totalHeal, healUnitUid:songForSummary.uid });
                    } else {
                        log.push({ type:'info', text:`<span class="gray">💚 宋青书已满血，白骨爪未能回复生命</span>` });
                    }
                }
            }
            // 统一执行回血
            for (const decl of healDeclarations) {
                if (decl.source && decl.source.alive) {
                    applyStatChange(decl.source, 'hp', decl.value, unit, '九阴白骨爪联动');
                }
            }
            return totalBonus;
        }
    };
}

registerElite('宋青书', createSongQingshuComponent);
registerElite('周芷若', createZhouZhiruoComponent);