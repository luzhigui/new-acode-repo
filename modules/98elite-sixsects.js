// modules/98elite-sixsects.js - 六大派精英组件合集
// V5.3.1 | ~10000 bytes| 2026-07-28 合并宋青书/周芷若
export const VER = 'modules/98elite-sixsects.js V5.3.1';
import { GlobalStore } from './46global-store.js';
import { CONFIG } from '../core/01config-5v5-test.js';
import { eventBus } from '../core/00-event-bus.js';
import { canXingFenTrigger, consumeXingFen, applyXingFenGrant, tickKuaiLeHeal, checkKuLian } from './23elite-skills.js';
import { emitEvent } from '../core/50battle-shared.js';
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
            // 未命中后性奋重试
            eventBus.on('afterMiss', 50, (data) => {
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
            // 新婚扣血 + 性奋代价
            eventBus.on('afterDamageApplied', 40, (data) => {
                if (data.unit.name !== '宋青书') return;
                onAfterApplyDamage(data.unit, data.target, { dmg: data.dmg }, data.group, B, data.log);
            });
            // 性奋额外攻击
            eventBus.on('afterAttack', 40, async (data) => {
                if (data.unit.name !== '宋青书') { return; }
                await onAfterAttack(data.unit, data.target, B, A, data.log, B, A, data.state);
            });
            // 苦练优先行动
            eventBus.on('beforeActionSelect', 10, (data) => {
                if (data.unit.name !== '宋青书' || !data.unit.alive || !data.unit._kuLianActive) return;
                data.declaration.priority = 1;
            });
            // 回合开始：性奋授予 + 苦练 buff（⚠️ 必须同步执行，后续属性计算依赖此加成）
            eventBus.on('onRoundStart', 10, (data) => {
                const { A, B, log } = data;
                applyXingFenGrant(B, log);

                // 苦练：场上无周芷若时，全体队友获得属性加成（自身翻倍）
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
                        emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def });
                    });
                    log.push({ type:'info', text:`<span class="gold">🏋️ 苦练：${kuLianSong.name} 激励全体队友+${s.atkBonus}攻+${s.defBonus}防+${s.hpBonus}血上限（自身翻倍）！</span>` });
                }
            });
        },
        onAfterApplyDamage(unit, target, dmgCalc, group, allySide, log) {
            if (unit.name !== '宋青书' || !unit.alive) return;
            const zhou = allySide.find(u => u.name === '周芷若' && u.alive);
            if (zhou) {
                zhou.hp = Math.max(0, zhou.hp - ES.xinHun.hpDeduct);
                zhou.dmgTaken += ES.xinHun.hpDeduct;
                emitEvent(zhou, 'hp-change', { hp:zhou.hp, maxHp:zhou.maxHp, alive:zhou.alive, atk:zhou.atk, def:zhou.def, _isAbsolute:true });
                zhou._kuaiLeStack.push({ healPct:ES.xinHun.healLevels[0] });
                log.push({ type:'info', text:`<span class="gold">💒 新婚：${unit.name}攻击，${zhou.name}被扣除${ES.xinHun.hpDeduct}点血量，叠加一层快乐(16%)！当前快乐层数：${zhou._kuaiLeStack.length}</span>`, buffType:'elite_xinhun', zhouUid:zhou.uid, zhouHpAfter:zhou.hp });
                if (zhou.hp <= 0) { zhou.hp = 0; zhou.alive = false; zhou._isDead = true; if (!zhou._deathTime) zhou._deathTime = Date.now(); emitEvent(zhou, 'hp-change', { hp:0, maxHp:zhou.maxHp, alive:false, atk:zhou.atk, def:zhou.def, _isDead:true, _isAbsolute:true }); log.push({ type:'info', text:`<span class="red">💀 ${zhou.name} 因新婚扣血而阵亡！</span>`, uidD:zhou.uid, isDead:true }); }
            }
            if (zhou) {
                if (!unit._xingFenPenaltyCount) unit._xingFenPenaltyCount = 0;
                unit._xingFenPenaltyCount = (unit._xingFenPenaltyCount||0)+1;
                const penalty = unit._xingFenPenaltyCount;
                if (penalty > 0 && unit.maxHp > 1) {
                    const oldMaxHp = unit.maxHp;
                    unit.maxHp = Math.max(1, unit.maxHp - penalty);
                    unit.hp = Math.floor(unit.hp * (unit.maxHp / oldMaxHp));
                    emitEvent(unit, 'hp-change', { hp:unit.hp, maxHp:unit.maxHp, alive:unit.alive, atk:unit.atk, def:unit.def });
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
            // 改为发射信号，由 04buff-system.js 统一调度额外攻击
            eventBus.emit('requestExtraAttack', { unit, target, allySide, enemySide, log });
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
            // 九阴白骨爪追击
            eventBus.on('afterAttack', 40, (data) => {
                if (data.unit.name !== '周芷若') return;
                onAfterDamageCalc(data.unit, data.target, data.dmg, data.log, B, A);
            });
            // 回合开始：快乐回血
            eventBus.on('onRoundStart', 10, (data) => {
                const { A, B, log } = data;
                tickKuaiLeHeal(A.concat(B), log);
            });
        },
        onAfterDamageCalc(unit, target, dmg, log, allySide, enemySide) {
            if (unit.name !== '周芷若' || !target || !target.alive) return 0;
            const battleState = window.GlobalStore?.get('currentBattleState');
            const zhangAlive = battleState && battleState.ally && battleState.ally.some(u => u.isZhang && u.alive);
            const s = ES.nineYinClaw;
            const baseHit = zhangAlive ? (s.jealousBaseDmg||5) : (s.baseDmg||3);
            if (!unit._nineYinFirstDone) { unit._nineYinFirstDone = true; }
            else { if (Math.random() > s.procChance) return 0; }
            let totalBonus = 0; let depth = 0;
            while (target.alive) {
                if (depth > 0 && Math.random() > s.chainProcChance) break;
                const lostHp = target.maxHp - target.hp;
                const ratio = zhangAlive ? s.jealousLostHpRatio : s.lostHpRatio;
                const ratioDmg = Math.floor(lostHp*ratio + target.maxHp*(zhangAlive?(s.jealousMaxHpRatio||0.02):(s.maxHpRatio||0.01)));
                let bonusDmg = baseHit + Math.max(0, ratioDmg);
                target.hp = Math.max(0, target.hp - bonusDmg); totalBonus += bonusDmg;
                unit.dmgDealt += bonusDmg; target.dmgTaken += bonusDmg;
                const hpPctAfter = target.hp/target.maxHp;
                const execThreshold = zhangAlive ? (s.jealousExecuteThreshold||0.15) : (s.executeThreshold||0.12);
                let isExecute = false;
                if (hpPctAfter <= execThreshold && target.hp > 0) { bonusDmg += target.hp; target.hp = 0; isExecute = true; }
                if (target.hp <= 0) { target.hp = 0; target.alive = false; target._isDead = true; if (!target._deathTime) target._deathTime = Date.now(); }
                emitEvent(target, 'hp-change', { hp:target.hp, maxHp:target.maxHp, alive:target.alive, atk:target.atk, def:target.def, _isDead:target._isDead||false, _isAbsolute:true });
                const clawEvents = GlobalStore.flushBattleEvents();
                log.push({ type:'info', text:`<span style="color:#222">🐾 九阴白骨爪${depth>0?'连锁':'追击'}！${unit.name} 对 ${target.name} 造成 ${bonusDmg} 点伤害${isExecute?'（斩杀）':(zhangAlive?'【嫉妒】':'')}</span>`, buffType:'elite_bonus', isClawHit:true, clawAttackerUid:unit.uid, clawTargetUid:target.uid, clawTargetHpAfter:target.hp, clawTargetAlive:target.alive, clawTargetIsDead:target._isDead, isExecute:isExecute, uidD:target.uid, isDead:!target.alive, _events:clawEvents });
                if (battleState) {
                    const allUnits = [...(battleState.ally||[]), ...(battleState.enemy||[])];
                    const song = allUnits.find(u => u.name === '宋青书' && u.alive);
                    if (song) {
                        const healAmount = Math.min(bonusDmg, song.maxHp - song.hp);
                        if (healAmount > 0) { song.hp += healAmount; song.healDone += healAmount; }
                        emitEvent(song, 'hp-change', { hp:song.hp, maxHp:song.maxHp, alive:song.alive, atk:song.atk, def:song.def });
                    }
                }
                depth++; if (isExecute) break;
            }
            // 汇总宋青书回血
            if (totalBonus > 0) {
                const battleState2 = window.GlobalStore?.get('currentBattleState');
                if (battleState2) {
                    const allUnits2 = [...(battleState2.ally||[]), ...(battleState2.enemy||[])];
                    const song2 = allUnits2.find(u => u.name === '宋青书' && u.alive);
                    if (song2) {
                        const totalHeal = Math.min(totalBonus, song2.maxHp - song2.hp + (song2.healDone || 0));
                        if (totalHeal > 0) {
                            log.push({ type:'info', text:`<span class="green">💚 宋青书因九阴白骨爪共回复${totalHeal}点生命</span>`, isHealEntry:true, healAmount:totalHeal, healUnitUid:song2.uid });
                        } else {
                            log.push({ type:'info', text:`<span class="gray">💚 宋青书已满血，白骨爪未能回复生命</span>` });
                        }
                    }
                }
            }
            return totalBonus;
        }
    };
}