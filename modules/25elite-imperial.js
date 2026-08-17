// modules/25elite-imperial.js - 朝廷精英组件合集
// V5.5.0 | ~8500 bytes| 2026-08-17 事实化重构：日志HTML走render/30
export const VER = 'modules/25elite-imperial.js V5.5.0';

import { registerElite } from '../core/08-elite-registry.js';
import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { getBattleRng, emitEvent } from '../core/13battle-shared.js';
import { tickXuanmingPoison } from './20elite-skills.js';
import { processUnitAttack } from '../core/10battle-attack.js';
import { EXECUTION_LAYER as L, EFFECT_TYPES } from '../core/00-event-bus.js';
import {
    renderXuanmingDotFact,
    renderXuanmingPoisonedFact,
    renderPhantomDisguiseHealFact
} from '../render/30-fact-renderer.js';
const ES = CONFIG.ELITE_SKILLS;

// ==================== 成昆 ====================
export function createChengKunComponent() {
    return {
        name: '成昆',
        register(eventBus, A, B, log) {
            const cheng = B.find(u => u.name === '成昆' && u.alive);
            if (!cheng) return;
            const onAfterApplyDamage = this.onAfterApplyDamage;
            const onDamageCalc = this.onDamageCalc;
            eventBus.on('beforeSelectTarget', L.BEFORE_SELECT_TARGET.CHENGKUN_DISGUISE, (data) => {
                if (data.unit.name === '成昆' && data.unit.state._phantomTarget) {
                    delete data.unit.state._phantomTarget;
                }
                if (data.unit.camp !== 'ally') return;
                const chengkun = data.enemySide.find(u => u.name === '成昆' && u.alive && u.state._phantomTarget);
                if (!chengkun) return;

                const isPhantomTarget = (chengkun.state._phantomTarget === data.unit.uid);
                if (isPhantomTarget) {
                    data.declaration.targetResult = chengkun;
                    data.declaration.phantomLog = `🎭 ${data.unit.name}识破成昆伪装，锁定真正的成昆！`;
                    return;
                }

                const params = getSkillParams('成昆', 'phantomDisguise') || ES.phantomDisguise;
                const lostHpPct = (chengkun.maxHp - chengkun.hp) / chengkun.maxHp;
                const confuseChance = (params.baseChance || 0.30) + (params.per10pctLost || 0.06) * (lostHpPct * 10);
                if (getBattleRng().next() >= confuseChance) return;

                const phantomTarget = data.allySide.find(u => u.alive && !u.isHorse && !u._untargetable && u.uid === chengkun.state._phantomTarget && u.uid !== data.unit.uid);
                if (phantomTarget) {
                    data.declaration.targetResult = phantomTarget;
                    data.declaration.phantomLog = `🎭 幻影伪装！${data.unit.name}被成昆迷惑，误攻队友${phantomTarget.name}！`;
                }
            });
            eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.CHENGKUN_DISGUISE, (data) => {
                if (data.unit.name !== '成昆') return;
                onAfterApplyDamage(data.unit, data.target, { dmg: data.dmg }, data.group, A, data.log, data);
            });
            eventBus.on('beforeDamageCalc', L.BEFORE_DAMAGE_CALC.CHENGKUN_THUNDER, (data) => {
                if (data.unit.name !== '成昆' || !data.declarations) return;
                const lostHp = data.unit.maxHp - data.unit.hp;
                const params = getSkillParams('成昆', 'phantomThunder') || ES.phantomThunder;
                const bonus = Math.floor(lostHp * (params.lostHpRatio / 100));
                if (bonus > 0) {
                    data.declarations.push({ type: EFFECT_TYPES.BONUS_DMG, value: bonus, source: data.unit, label: '混元霹雳劲' });
                }
            });
        },
        onAfterApplyDamage(unit, target, dmgCalc, group, enemySide, log, data) {
            if (unit.name !== '成昆' || dmgCalc.dmg <= 0) return;
            const enemyAlive = enemySide.filter(u => u.alive && !u.isHorse && !u._untargetable);
            if (enemyAlive.length > 0) {
                unit.state._phantomTarget = enemyAlive[getBattleRng().nextInt(0, enemyAlive.length - 1)].uid;
                const lostHp = unit.maxHp - unit.hp;
                if (lostHp > 0) {
                    const aliveCount = enemySide.filter(u => u.alive).length;
                    const heal = Math.floor(lostHp * 0.06 * aliveCount);
                    if (!data.declarations) data.declarations = [];
                    data.declarations.push({
                        type: EFFECT_TYPES.HEAL,
                        value: heal,
                        source: unit,
                        logText: renderPhantomDisguiseHealFact({ unitName: unit.name, heal }).text
                    });
                }
                emitEvent(unit, 'hp-change', { hp:unit.hp, maxHp:unit.maxHp, alive:unit.alive, atk:unit.atk, def:unit.def, _phantomTarget:unit.state._phantomTarget });
            }
        },
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
            eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.LU_XUANMING, (data) => {
                if (data.unit.name !== '鹿杖客') return;
                onAfterApplyDamage(data.unit, data.target, { dmg: data.dmg }, data.group, B, data.log);
            });
            eventBus.on('onRoundStart', L.ROUND_START.XUANMING_POISON, (data) => {
                const { A, B, log } = data;
                A.concat(B).forEach(u => {
                    if (!u.alive) return;
                    const dot = tickXuanmingPoison(u);
                    if (dot > 0) {
                        log.push(renderXuanmingDotFact({ unitName: u.name, dot, uidD: u.uid, isDead: !u.alive }));
                    }
                });
            });
        },
        onAfterApplyDamage(unit, target, dmgCalc, group, allySide, log) {
            if (unit.name !== '鹿杖客') return;
            const s = getSkillParams('鹿杖客', 'xuanmingPalm') || ES.xuanmingPalm;
            target._xuanmingPoison = { remaining:s.duration, dotPercents:[...s.dotPercents] };
            log.push(renderXuanmingPoisonedFact({ attackerName: unit.name, targetName: target.name, dotPercents: s.dotPercents }));
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
            eventBus.on('beforeDamageCalc', L.BEFORE_DAMAGE_CALC.HE_HORN, (data) => {
                if (data.unit.name !== '鹤笔翁' || !data.declarations) return;
                const s = getSkillParams('鹤笔翁', 'hornStrike') || ES.hornStrike;
                const poisoned = data.target._xuanmingPoison && data.target._xuanmingPoison.remaining > 0;
                data.declarations.push({ type: EFFECT_TYPES.IGNORE_DEF, value: s.defIgnore / 100, source: data.unit });
                if (poisoned) {
                    data.declarations.push({ type: EFFECT_TYPES.DMG_MULTIPLIER, value: 1 + s.poisonedBonus / 100, source: data.unit, label: '鹿角杖法' });
                }
            });
        },
    };
}

export function registerXuanmingLink(eventBus) {
    eventBus.on('afterAttack', L.AFTER_ATTACK.XUANMING_LINK, async (data) => {
        const { unit, target, dmg, allySide, enemySide, log, A, B, state } = data;
        if (!unit || unit._isLinkAttack || dmg <= 0 || !target || !target.alive) return;
        const isLuOrHe = (unit.name === '鹿杖客' || unit.name === '鹤笔翁');
        if (!isLuOrHe) return;
        const partnerName = unit.name === '鹿杖客' ? '鹤笔翁' : '鹿杖客';
        const partner = allySide.find(u => u.name === partnerName && u.alive && !u._linkTriggered);
        if (!partner) return;
        const wasActed = partner.state._acted;
        partner._isLinkAttack = true;
        partner._linkTriggered = true;
        partner.state._acted = false;
        log.push({type:'info', text:`<span class="gold">🔗 ${partner.name} 跟随 ${unit.name} 发动联动攻击！</span>`});
        if (typeof processUnitAttack === 'function') {
            await processUnitAttack(partner, allySide, enemySide, log, A, B, state, null, target.uid);
        }
        partner._isLinkAttack = false;
        partner.state._acted = wasActed;
    });
}

registerElite('成昆', createChengKunComponent);
registerElite('鹿杖客', createLuZhangKeComponent);
registerElite('鹤笔翁', createHeBiWengComponent);
registerElite('玄冥联动', registerXuanmingLink);