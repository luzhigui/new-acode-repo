// modules/97elite-imperial.js - 朝廷精英组件合集
// V5.4.0 | ~8600 bytes| 2026-08-04 技能参数接入 game-data
export const VER = 'modules/97elite-imperial.js V5.4.0';

import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { rand } from '../core/03battle-utils.js';
import { tickXuanmingPoison } from './23elite-skills.js';
import { processUnitAttack } from '../core/47battle-attack.js';
import { EXECUTION_LAYER as L } from '../core/00-event-bus.js';
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
            // 幻影伪装：被模仿者攻击时误伤队友
            eventBus.on('beforeSelectTarget', L.BEFORE_SELECT_TARGET.CHENGKUN_DISGUISE, (data) => {
                // 成昆攻击前清除旧伪装（恢复真身）
                if (data.unit.name === '成昆' && data.unit._phantomTarget) {
                    delete data.unit._phantomTarget;
                }
                if (data.unit.camp !== 'ally') return;
                const chengkun = data.enemySide.find(u => u.name === '成昆' && u.alive && u._phantomTarget);
                if (!chengkun || chengkun._phantomTarget !== data.unit.uid) return;
                const fakeList = data.allySide.filter(u => u.alive && !u.isHorse && !u._untargetable && u.uid !== data.unit.uid);
                if (fakeList.length > 0) {
                    const fakeTarget = fakeList[rand(0, fakeList.length - 1)];
                    data.declaration.targetResult = fakeTarget;
                    data.declaration.phantomLog = `🎭 幻影伪装！${data.unit.name}被混乱，误攻队友${fakeTarget.name}！`;
                }
            });
            // 幻影伪装：攻击后更新伪装目标
            eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.CHENGKUN_DISGUISE, (data) => {
                if (data.unit.name !== '成昆') return;
                onAfterApplyDamage(data.unit, data.target, { dmg: data.dmg }, data.group, A, data.log, data);
            });
            // 混元霹雳劲 → 提交伤害声明
            eventBus.on('beforeDamageCalc', L.BEFORE_DAMAGE_CALC.CHENGKUN_THUNDER, (data) => {
                if (data.unit.name !== '成昆' || !data.declarations) return;
                const lostHp = data.unit.maxHp - data.unit.hp;
                const params = getSkillParams('成昆', 'phantomThunder') || ES.phantomThunder;
                const bonus = Math.floor(lostHp * (params.lostHpRatio / 100));
                if (bonus > 0) {
                    data.declarations.push({ type: 'bonusDmg', value: bonus, source: data.unit });
                }
            });
        },
        onAfterApplyDamage(unit, target, dmgCalc, group, enemySide, log, data) {
            if (unit.name !== '成昆' || dmgCalc.dmg <= 0) return;
            const enemyAlive = enemySide.filter(u => u.alive && !u.isHorse && !u._untargetable);
            if (enemyAlive.length > 0) {
                unit._phantomTarget = enemyAlive[rand(0, enemyAlive.length - 1)].uid;
                const lostHp = unit.maxHp - unit.hp;
                if (lostHp > 0) {
                    const aliveCount = enemySide.filter(u => u.alive).length;
                    const heal = Math.floor(lostHp * 0.06 * aliveCount);
                    // 改为提交 heal 声明，由裁判统一处理
                    if (!data.declarations) data.declarations = [];
                    data.declarations.push({
                        type: 'heal',
                        value: heal,
                        source: unit,
                        logText: `<span class="green">🎭 幻影伪装：${unit.name} 回复 ${heal} 点生命</span>`
                    });
                }
                emitEvent(unit, 'hp-change', { hp:unit.hp, maxHp:unit.maxHp, alive:unit.alive, atk:unit.atk, def:unit.def, _phantomTarget:unit._phantomTarget });
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
            // 玄冥神掌中毒
            eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.LU_XUANMING, (data) => {
                if (data.unit.name !== '鹿杖客') return;
                onAfterApplyDamage(data.unit, data.target, { dmg: data.dmg }, data.group, B, data.log);
            });
            // 回合开始：玄冥神掌寒毒发作
            eventBus.on('onRoundStart', L.ROUND_START.XUANMING_POISON, (data) => {
                const { A, B, log } = data;
                A.concat(B).forEach(u => {
                    if (!u.alive) return;
                    const dot = tickXuanmingPoison(u);
                    if (dot > 0) {
                        log.push({ type:'info', text:`<span class="purple">❄️ 玄冥神掌寒毒发作，${u.name} 受到 ${dot} 点伤害</span>`, uidD: u.uid, isDead: !u.alive, dmg: dot });
                    }
                });
            });
        },
        onAfterApplyDamage(unit, target, dmgCalc, group, allySide, log) {
            if (unit.name !== '鹿杖客') return;
            const s = getSkillParams('鹿杖客', 'xuanmingPalm') || ES.xuanmingPalm;
            target._xuanmingPoison = { remaining:s.duration, dotPercents:[...s.dotPercents] };
            log.push({ type:'info', text:`<span class="purple">❄️ ${unit.name} 的玄冥神掌使 ${target.name} 中毒！每回合损失生命（${s.dotPercents.join('%→')}%→消失）</span>` });
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
            // 鹿角杖法 → 提交伤害声明
            eventBus.on('beforeDamageCalc', L.BEFORE_DAMAGE_CALC.HE_HORN, (data) => {
                if (data.unit.name !== '鹤笔翁' || !data.declarations) return;
                const s = getSkillParams('鹤笔翁', 'hornStrike') || ES.hornStrike;
                const poisoned = data.target._xuanmingPoison && data.target._xuanmingPoison.remaining > 0;
                data.declarations.push({ type: 'ignoreDef', value: s.defIgnore / 100, source: data.unit });
                if (poisoned) {
                    data.declarations.push({ type: 'dmgMultiplier', value: 1 + s.poisonedBonus / 100, source: data.unit });
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