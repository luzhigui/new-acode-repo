// modules/25elite-imperial.js - 朝廷精英组件合集
// V5.5.0 | ~8700 bytes| 2026-08-04 技能参数接入 game-data
export const VER = 'modules/25elite-imperial.js V5.5.0';

import { registerElite } from '../core/08-elite-registry.js';
import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { getBattleRng, emitEvent } from '../core/13battle-shared.js';
import { tickXuanmingPoison } from './20elite-skills.js';
import { processUnitAttack } from '../core/10battle-attack.js';
import { EXECUTION_LAYER as L, EFFECT_TYPES } from '../core/00-event-bus.js';
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
            // 成昆-幻影伪装：攻击前清除旧伪装；被模仿者强制攻成昆，其他明教概率混乱误攻队友
            eventBus.on('beforeSelectTarget', L.BEFORE_SELECT_TARGET.CHENGKUN_DISGUISE, (data) => {
                // 成昆攻击前清除旧伪装（恢复真身）
                if (data.unit.name === '成昆' && data.unit.state._phantomTarget) {
                    delete data.unit.state._phantomTarget;
                }
                if (data.unit.camp !== 'ally') return;
                const chengkun = data.enemySide.find(u => u.name === '成昆' && u.alive && u.state._phantomTarget);
                if (!chengkun) return;

                // 被模仿者：100% 强制攻击成昆
                const isPhantomTarget = (chengkun.state._phantomTarget === data.unit.uid);
                if (isPhantomTarget) {
                    data.declaration.targetResult = chengkun;
                    data.declaration.phantomLog = `🎭 幻影伪装！${data.unit.name}被成昆迷惑，强制攻击成昆！`;
                    return;
                }

                // 其他明教单位：概率混乱误攻队友（基于成昆已损失血量）
                const params = getSkillParams('成昆', 'phantomDisguise') || ES.phantomDisguise;
                const lostHpPct = (chengkun.maxHp - chengkun.hp) / chengkun.maxHp;
                const confuseChance = (params.baseChance || 0.30) + (params.per10pctLost || 0.06) * (lostHpPct * 10);
                if (getBattleRng().next() >= confuseChance) return;

                const fakeList = data.allySide.filter(u => u.alive && !u.isHorse && !u._untargetable && u.uid !== data.unit.uid);
                if (fakeList.length > 0) {
                    const fakeTarget = fakeList[getBattleRng().nextInt(0, fakeList.length - 1)];
                    data.declaration.targetResult = fakeTarget;
                    data.declaration.phantomLog = `🎭 幻影伪装！${data.unit.name}被祸乱心智，误攻队友${fakeTarget.name}！`;
                }
            });
            // 成昆-幻影伪装：攻击后随机选择敌方伪装目标+按损失生命回血
            eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.CHENGKUN_DISGUISE, (data) => {
                if (data.unit.name !== '成昆') return;
                onAfterApplyDamage(data.unit, data.target, { dmg: data.dmg }, data.group, A, data.log, data);
            });
            // 成昆-混元霹雳劲：已损失生命值比例转化为额外伤害声明
            eventBus.on('beforeDamageCalc', L.BEFORE_DAMAGE_CALC.CHENGKUN_THUNDER, (data) => {
                if (data.unit.name !== '成昆' || !data.declarations) return;
                const lostHp = data.unit.maxHp - data.unit.hp;
                const params = getSkillParams('成昆', 'phantomThunder') || ES.phantomThunder;
                const bonus = Math.floor(lostHp * (params.lostHpRatio / 100));
                if (bonus > 0) {
                    data.declarations.push({ type: EFFECT_TYPES.BONUS_DMG, value: bonus, source: data.unit });
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
                    // 改为提交 heal 声明，由裁判统一处理
                    if (!data.declarations) data.declarations = [];
                    data.declarations.push({
                        type: EFFECT_TYPES.HEAL,
                        value: heal,
                        source: unit,
                        logText: `<span class="green">🎭 幻影伪装：${unit.name} 回复 ${heal} 点生命</span>`
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
            // 鹿杖客-玄冥神掌：攻击后施加中毒dot（逐回合衰减伤害）
            eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.LU_XUANMING, (data) => {
                if (data.unit.name !== '鹿杖客') return;
                onAfterApplyDamage(data.unit, data.target, { dmg: data.dmg }, data.group, B, data.log);
            });
            // 鹿杖客-寒毒发作：回合开始结算所有单位玄冥寒毒伤害
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
            // 鹤笔翁-鹿角杖法：无视防御+对中毒目标额外伤害加成声明
            eventBus.on('beforeDamageCalc', L.BEFORE_DAMAGE_CALC.HE_HORN, (data) => {
                if (data.unit.name !== '鹤笔翁' || !data.declarations) return;
                const s = getSkillParams('鹤笔翁', 'hornStrike') || ES.hornStrike;
                const poisoned = data.target._xuanmingPoison && data.target._xuanmingPoison.remaining > 0;
                data.declarations.push({ type: EFFECT_TYPES.IGNORE_DEF, value: s.defIgnore / 100, source: data.unit });
                if (poisoned) {
                    data.declarations.push({ type: EFFECT_TYPES.DMG_MULTIPLIER, value: 1 + s.poisonedBonus / 100, source: data.unit });
                }
            });
        },
    };
}

export function registerXuanmingLink(eventBus) {
    // 玄冥二老-联动攻击：鹿杖客/鹤笔翁攻击后另一方跟随联动攻击
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