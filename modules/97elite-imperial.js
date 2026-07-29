// modules/97elite-imperial.js - 朝廷精英组件合集
// V5.2.2 | ~4000 bytes | 2026-07-28 合并成昆/鹿杖客/鹤笔翁
export const VER = 'modules/97elite-imperial.js V5.2.2';

import { CONFIG } from '../core/01config-5v5-test.js';
import { rand } from '../core/03battle-utils.js';
import { processUnitAttack } from '../core/47battle-attack.js';
const ES = CONFIG.ELITE_SKILLS;

function emitEvent(unit, eventType, payload) {
    if (typeof window._emitEvent === 'function') window._emitEvent(unit, eventType, payload);
}

// ==================== 成昆 ====================
export function createChengKunComponent() {
    return {
        name: '成昆',
        register(eventBus, A, B, log) {
            const cheng = B.find(u => u.name === '成昆' && u.alive);
            if (!cheng) return;
            const onAfterApplyDamage = this.onAfterApplyDamage;
            const onDamageCalc = this.onDamageCalc;
            // 幻影伪装
            eventBus.on('afterDamageApplied', 40, (data) => {
                if (data.unit.name !== '成昆') return;
                onAfterApplyDamage(data.unit, data.target, { dmg: data.dmg }, data.group, A, data.log);
            });
            // 混元霹雳劲
            eventBus.on('beforeDamageCalcFinal', 10, (data) => {
                if (data.unit.name === '成昆') {
                    data.dmgResult.thunderBonus = onDamageCalc(data.unit, data.target, data.dmgResult.value);
                }
            });
        },
        onAfterApplyDamage(unit, target, dmgCalc, group, enemySide, log) {
            if (unit.name !== '成昆' || dmgCalc.dmg <= 0) return;
            const enemyAlive = enemySide.filter(u => u.alive && !u.isHorse);
            if (enemyAlive.length > 0) {
                unit._phantomTarget = enemyAlive[rand(0, enemyAlive.length - 1)].uid;
                const lostHp = unit.maxHp - unit.hp;
                if (lostHp > 0) {
                    const aliveCount = enemySide.filter(u => u.alive).length;
                    const heal = Math.floor(lostHp * 0.06 * aliveCount);
                    unit.hp = Math.min(unit.maxHp, unit.hp + heal);
                    unit.healDone += heal;
                    log.push({ type:'info', text:`<span class="green">🎭 幻影伪装：${unit.name} 回复 ${heal} 点生命</span>`, isHealEntry:true, healAmount:heal, healUnitUid:unit.uid });
                }
                emitEvent(unit, 'hp-change', { hp:unit.hp, maxHp:unit.maxHp, alive:unit.alive, atk:unit.atk, def:unit.def, _phantomTarget:unit._phantomTarget });
            }
        },
        onDamageCalc(unit, target, rawDmg) {
            if (unit.name !== '成昆') return 0;
            const lostHp = unit.maxHp - unit.hp;
            return Math.floor(lostHp * ES.phantomThunder.lostHpRatio);
        }
    };
}

// ==================== 鹿杖客 ====================
export function createLuZhangKeComponent() {
    return {
        name: '鹿杖客',
        register(eventBus, A, B, log) {
            const lu = B.find(u => u.name === '鹿杖客' && u.alive);
            if (!lu) return;
            const onAfterApplyDamage = this.onAfterApplyDamage;
            // 玄冥神掌中毒
            eventBus.on('afterDamageApplied', 40, (data) => {
                if (data.unit.name !== '鹿杖客') return;
                onAfterApplyDamage(data.unit, data.target, { dmg: data.dmg }, data.group, B, data.log);
            });
        },
        onAfterApplyDamage(unit, target, dmgCalc, group, allySide, log) {
            if (unit.name !== '鹿杖客') return;
            const s = ES.xuanmingPalm;
            target._xuanmingPoison = { remaining:s.duration, dotPercents:[...s.dotPercents] };
            log.push({ type:'info', text:`<span class="purple">❄️ ${unit.name} 的玄冥神掌使 ${target.name} 中毒！每回合损失生命（4%→2%→1%→消失）</span>` });
        }
    };
}

// ==================== 鹤笔翁 ====================
export function createHeBiWengComponent() {
    return {
        name: '鹤笔翁',
        register(eventBus, A, B, log) {
            const he = B.find(u => u.name === '鹤笔翁' && u.alive);
            if (!he) return;
            const onDamageCalc = this.onDamageCalc;
            // 鹿角杖法
            eventBus.on('beforeDamageCalcFinal', 20, (data) => {
                if (data.unit.name === '鹤笔翁') {
                    const result = onDamageCalc(data.unit, data.target, data.dmgResult.value);
                    if (result && result.defIgnore) {
                        data.dmgResult.hornDefIgnore = result.defIgnore;
                        data.dmgResult.hornDmgMultiplier = result.dmgMultiplier || 1;
                    }
                }
            });
        },
        onDamageCalc(unit, target, rawDmg) {
            if (unit.name !== '鹤笔翁') return { defIgnore:0, dmgMultiplier:1, rawDmg };
            const s = ES.hornStrike;
            const poisoned = target._xuanmingPoison && target._xuanmingPoison.remaining > 0;
            return { defIgnore:s.defIgnore, dmgMultiplier:poisoned ? 1+s.poisonedBonus : 1, rawDmg };
        }
    };
}

export function registerXuanmingLink(eventBus) {
    eventBus.on('afterAttack', 10, async (data) => {
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
        if (typeof processUnitAttack === 'function') {
            await processUnitAttack(partner, allySide, enemySide, log, A, B, state, null, target.uid);
        }
        partner._isLinkAttack = false;
        partner._acted = wasActed;
    });
}