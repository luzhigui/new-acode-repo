// modules/25elite-imperial.js - 朝廷精英组件合集
// V5.5.0 | ~8500 bytes| 2026-08-17 事实化重构：日志HTML走render/30
export const VER = 'modules/25elite-imperial.js V5.5.0';

import { registerElite } from '../core/08-elite-registry.js';
import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { getBattleRng, emitEvent } from '../core/13battle-shared.js';
import { tickXuanmingPoison } from './20elite-skills.js';
import { EXECUTION_LAYER as L, EFFECT_TYPES } from '../infra/50-event-bus.js';
import {
    renderXuanmingDotFact,
    renderPhantomDisguiseHealFact
} from '../render/30-fact-renderer.js';
const ES = CONFIG.ELITE_SKILLS;

// ==================== 成昆 ====================
export function createChengKunComponent() {
    return {
        name: '成昆',
        declarations: [{
            name: '成昆',
            camp: 'enemy',
            beforeDamageEffects: [{ type: 'bonusLostHp', ratio: 0.20, label: '混元霹雳劲' }],
            attributeMods: [{ type: 'fortifyIncrementMul', mult: 2 }]
        }],
        register(eventBus, A, B, log) {
            const cheng = B.find(u => u.name === '成昆' && u.alive);
            if (!cheng) return;
            const onAfterApplyDamage = this.onAfterApplyDamage;
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
        },
        onAfterApplyDamage(unit, target, dmgCalc, group, enemySide, log, data) {
            if (unit.name !== '成昆' || dmgCalc.dmg <= 0) return;
            const enemyAlive = enemySide.filter(u => u.alive && !u.isHorse && !u._untargetable);
            if (enemyAlive.length > 0) {
                unit.state._phantomTarget = enemyAlive[getBattleRng().nextInt(0, enemyAlive.length - 1)].uid;
                const lostHp = unit.maxHp - unit.hp;
                if (lostHp > 0) {
                    const aliveCount = enemySide.filter(u => u.alive).length;
                    const heal = Math.floor(lostHp * (ES.phantomDisguise.healRatio || 0.06) * aliveCount);
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
        declarations: [{
            name: '鹿杖客',
            onHitEffects: [{ type: 'poison', duration: 3, dotPercents: [0.04, 0.02, 0.01] }]
        }],
        register(eventBus, A, B, log) {
            const lu = B.find(u => u.name === '鹿杖客' && u.alive);
            if (!lu) return;
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
        }
    };
}

// ==================== 鹤笔翁 ====================
export function createHeBiWengComponent() {
    return {
        name: '鹤笔翁',
        declarations: [{
            name: '鹤笔翁',
            beforeDamageEffects: [
                { type: 'ignoreDef', ratio: 0.30 },
                { type: 'damageMultiplierIfPoisoned', bonus: 0.30 }
            ]
        }],
        register(eventBus, A, B, log) {
            const he = B.find(u => u.name === '鹤笔翁' && u.alive);
            if (!he) return;
        },
    };
}

export function registerXuanmingLink(eventBus) {
    eventBus.on('afterAttack', L.AFTER_ATTACK.XUANMING_LINK, async (data) => {
        const { unit, target, dmg, allySide, log } = data;
        if (!unit || unit._isLinkAttack || dmg <= 0 || !target || !target.alive) return;
        const isLuOrHe = (unit.name === '鹿杖客' || unit.name === '鹤笔翁');
        if (!isLuOrHe) return;
        const partnerName = unit.name === '鹿杖客' ? '鹤笔翁' : '鹿杖客';
        const partner = allySide.find(u => u.name === partnerName && u.alive && !u._linkTriggered);
        if (!partner) return;
        partner._linkTriggered = true;
        log.push({type:'info', text:`<span class="gold">🔗 ${partner.name} 跟随 ${unit.name} 发动联动攻击！</span>`});
        if (!data.extraRequests) data.extraRequests = [];
        data.extraRequests.push({
            unit: partner,
            targetUid: target.uid,
            reason: 'xuanmingLink',
            actedMode: 'restore',
            actedSnapshot: partner.state._acted,
            priority: 40
        });
    });
}

registerElite('成昆', createChengKunComponent);
registerElite('鹿杖客', createLuZhangKeComponent);
registerElite('鹤笔翁', createHeBiWengComponent);
registerElite('玄冥联动', registerXuanmingLink);