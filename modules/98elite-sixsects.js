// modules/98elite-sixsects.js - 六大派精英组件合集
// V5.2.2 | ~4000 bytes | 2026-07-28 合并宋青书/周芷若
export const VER = 'modules/98elite-sixsects.js V5.2.2';

import { CONFIG } from '../core/01config-5v5-test.js';
const ES = CONFIG.ELITE_SKILLS;

function emitEvent(unit, eventType, payload) {
    if (typeof window._emitEvent === 'function') window._emitEvent(unit, eventType, payload);
}

// ==================== 宋青书 ====================
export function createSongQingshuComponent() {
    return {
        name: '宋青书',
        register(eventBus, A, B, log) {
            const song = B.find(u => u.name === '宋青书' && u.alive);
            if (!song) return;
            // 新婚扣血 + 性奋代价
            eventBus.on('afterDamageApplied', 40, (data) => {
                if (data.unit.name !== '宋青书') return;
                song.onAfterApplyDamage(data.unit, data.target, { dmg: data.dmg }, data.group, B, data.log);
            });
            // 性奋额外攻击
            eventBus.on('afterAttack', 40, (data) => {
                if (data.unit.name !== '宋青书') return;
                song.onAfterAttack(data.unit, data.target, B, A, data.log, B, A, data.state);
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
            if (zhou && !unit._xingFenPenaltyCount) unit._xingFenPenaltyCount = 0;
            if (zhou) {
                unit._xingFenPenaltyCount = (unit._xingFenPenaltyCount||0)+1;
                const penalty = unit._xingFenPenaltyCount;
                if (penalty > 0 && unit.maxHp > 1) {
                    const oldMaxHp = unit.maxHp;
                    unit.maxHp = Math.max(1, unit.maxHp - penalty);
                    unit.hp = Math.min(unit.hp, unit.maxHp);
                    emitEvent(unit, 'hp-change', { hp:unit.hp, maxHp:unit.maxHp, alive:unit.alive, atk:unit.atk, def:unit.def });
                    log.push({ type:'info', text:`<span class="red">💗 性奋代价：${unit.name} 血量上限 ${oldMaxHp} → ${unit.maxHp}（-${penalty}）</span>` });
                }
            }
        },
        onAfterAttack(unit, target, allySide, enemySide, log, A, B, state) {
            if (unit.name !== '宋青书' || !unit.alive || !unit._xingFenActive || !enemySide.some(u => u.alive)) return;
            unit._xingFenActive = false;
            log.push({ type:'info', text:`<span class="gold">💗 性奋：${unit.name} 获得额外攻击机会！</span>` });
            if (typeof processUnitAttack === 'function') { processUnitAttack(unit, allySide, enemySide, log, A, B, state, null); }
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
            // 九阴白骨爪追击
            eventBus.on('afterAttack', 40, (data) => {
                if (data.unit.name !== '周芷若') return;
                zhou.onAfterDamageCalc(data.unit, data.target, data.dmg, data.log, B, A);
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
                const clawEvents = [...window._battleEvents]; window._battleEvents = [];
                if (window.GlobalStore) window.GlobalStore.flushBattleEvents();
                log.push({ type:'info', text:`<span style="color:#222">🐾 九阴白骨爪${depth>0?'连锁':'追击'}！${unit.name} 对 ${target.name} 造成 ${bonusDmg} 点伤害${isExecute?'（斩杀）':(zhangAlive?'【嫉妒】':'')}</span>`, buffType:'elite_bonus', isClawHit:true, clawAttackerUid:unit.uid, clawTargetUid:target.uid, clawTargetHpAfter:target.hp, clawTargetAlive:target.alive, clawTargetIsDead:target._isDead, isExecute:isExecute, uidD:target.uid, isDead:!target.alive, _events:clawEvents });
                if (battleState) {
                    const allUnits = [...(battleState.ally||[]), ...(battleState.enemy||[])];
                    const song = allUnits.find(u => u.name === '宋青书' && u.alive);
                    if (song) {
                        const healAmount = Math.min(bonusDmg, song.maxHp - song.hp);
                        if (healAmount > 0) { song.hp += healAmount; song.healDone += healAmount; }
                        emitEvent(song, 'hp-change', { hp:song.hp, maxHp:song.maxHp, alive:song.alive, atk:song.atk, def:song.def });
                        log.push({ type:'info', text:`<span class="green">💚 宋青书因九阴白骨爪回复${healAmount}点生命${healAmount===0?'（已满血）':''}</span>`, isHealEntry:true, healAmount:healAmount>0?healAmount:bonusDmg, healUnitUid:song.uid });
                    }
                }
                depth++; if (isExecute) break;
            }
            return totalBonus;
        }
    };
}