// V6.1.0 | ~4700 bytes | 2026-09-17 新增张三丰组件：生生不息、如沐春风、八卦阵、第十回合严阵以待
export const VER = 'modules/26elite-sixsects.js V6.1.0';
import { registerElite } from '../core/08-elite-registry.js';
import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { SIGNAL_TYPES, FACT_TYPES, CAMP_TYPES, BUFF_TYPES } from '../infra/56-battle-enums.js';
import { applyStatChange, addMod, getStat, getBattleRng } from '../core/13battle-shared.js';
import { EFFECT_TYPES } from '../infra/50-event-bus.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { FX_SIGNALS } from '../infra/55-fx-signals.js';

// 宋青书
export function createSongQingshuComponent() {
    return {
        name: '宋青书',
        register(eventBus, A, B, log) {}
    };
}

// 周芷若
export function createZhouZhiruoComponent() {
    return {
        name: '周芷若',
        register(eventBus, A, B, log) {}
    };
}

// 张三丰（六大派·防战）：不攻击的续航核心
// 技能1 生生不息 / 技能2 如沐春风 / 技能3 八卦阵 / 技能5 第十回合严阵以待
// 技能4 不争（仅剩一人判负）在 core/11 的胜负判定里
export function createZhangSanfengComponent() {
    return {
        name: '张三丰',
        register(eventBus, A, B, log) {
            const zhang = B.find(u => u.isZhangSanfeng && u.alive);
            if (!zhang) return;

            const s = getSkillParams('张三丰', 'endlessBreath');
            if (!s) throw new Error('缺技能参数: 张三丰.endlessBreath');
            const sb = getSkillParams('张三丰', 'springBreeze');
            if (!sb) throw new Error('缺技能参数: 张三丰.springBreeze');
            const ba = getSkillParams('张三丰', 'baguaArray');
            if (!ba) throw new Error('缺技能参数: 张三丰.baguaArray');
            const tf = getSkillParams('张三丰', 'tenRoundFortify');
            if (!tf) throw new Error('缺技能参数: 张三丰.tenRoundFortify');

            // 生生不息：回 healPct 上限 + 防御 + defGain（三处触发共用）
            function triggerEndlessBreath(unit, log) {
                if (!unit || !unit.alive) return;
                const heal = Math.floor(unit.maxHp * s.healPct);
                applyStatChange(unit, 'hp', heal, null, '生生不息');
                addMod(unit, 'def', { source: '生生不息', value: s.defGain, ttl: 'permanent', group: 'endlessBreath', op: 'add' });
                // 2026-09-17 飘字：三处触发共用（回合开始 / 轮到自己 / 八卦阵）
                if (!GlobalStore.get('fastForwardActive')) {
                    eventBus.emit(FX_SIGNALS.HEAL_FLOAT, { unit, amount: heal });
                }
                // 2026-09-17 日志：走 fact（三处触发都进主 log，随 step 渲染）
                if (log) {
                    log.push({
                        factType: FACT_TYPES.ENDLESS_BREATH,
                        data: { unitName: unit.name, unitUid: unit.uid, heal, defGain: s.defGain }
                    });
                }
            }

            // 技能1a：回合开始触发
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, 12, (data) => {
                triggerEndlessBreath(zhang, data && data.log);
            });

            // 技能1b + 技能2：单位行动完成广播
            eventBus.on(SIGNAL_TYPES.ON_UNIT_ACTED, 50, (data) => {
                const actor = data.unit;
                if (!actor || !actor.alive) return;
                if (actor.camp !== CAMP_TYPES.ENEMY) return;
                if (actor.isZhangSanfeng) {
                    // 轮到自己：生生不息
                    triggerEndlessBreath(actor, data.log);
                    return;
                }
                // 如沐春风：六大派队友行动后，该队友回 8% 已损失生命
                const lost = actor.maxHp - actor.hp;
                if (lost <= 0) return;
                const heal = Math.floor(lost * sb.healPct);
                if (heal > 0) applyStatChange(actor, 'hp', heal, null, '如沐春风');
            });

            // 技能3：八卦阵——被攻击时 50% 概率削自身攻 1（攻 > atkFloor 才触发）+ 生生不息
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, 45, (data) => {
                if (data.target !== zhang || !zhang.alive) return;
                if (!data.dmg || data.dmg <= 0) return;
                if (getStat(zhang, 'atk') <= ba.atkFloor) return;
                const rng = getBattleRng();
                if (rng.nextInt(1, 100) > ba.procChance * 100) return;
                addMod(zhang, 'atk', { source: '八卦阵', value: -ba.atkCost, ttl: 'permanent', group: 'baguaArray', op: 'add' });
                triggerEndlessBreath(zhang, data.log);
                if (data.group && data.group.data && data.group.data.entries) {
                    data.group.data.entries.push({ type: 'info', text: `<span class="gold">☯ 八卦阵：张三丰攻击-${ba.atkCost}，触发生生不息</span>` });
                }
            });

            // 技能5：第 10 回合结束后仍未分胜负 → 张三丰获得严阵以待（仅限自身）
            // 2026-09-17 不走 B._activeBuffs：那条会让六大派全体防战都吃到；改为直接挂词条 + 组件自算反弹
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, 45, (data) => {
                if (!zhang.state._tenRoundFired) {
                    zhang.state._roundCountForFortify = (zhang.state._roundCountForFortify || 0) + 1;
                    if (zhang.state._roundCountForFortify <= tf.round) return;
                    zhang.state._tenRoundFired = true;
                }
                // 防御 +50%（ttl: round，每回合开始重挂，跟明教同源参数）
                addMod(zhang, 'def', { source: '严阵以待', value: CONFIG.BUFFS.fortify.defBonus, ttl: 'round', op: 'mul', group: 'fortify' });
                if (data.log) {
                    data.log.push({
                        factType: FACT_TYPES.BUFF_SUMMARY,
                        data: {
                            buff: { key: BUFF_TYPES.FORTIFY, name: '严阵以待', remaining: Infinity },
                            allyTeamUids: [zhang.uid]
                        }
                    });
                }
            });

            // 严阵以待反弹：仅张三丰自身（不走 camp buff 检查，故不受 core/12 那条影响）
            // 原版公式在 core/12 = floor((atkAct - 格挡量)/2)，此处按"实际伤害的一半"近似
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, 46, (data) => {
                if (!zhang.state._tenRoundFired || !zhang.alive) return;
                if (data.target !== zhang) return;
                if (!data.dmg || data.dmg <= 0) return;
                const attacker = data.unit;
                if (!attacker || !attacker.alive || attacker === zhang) return;
                const rebound = Math.max(1, Math.floor(data.dmg / 2));
                if (!data.declarations) data.declarations = [];
                data.declarations.push({
                    type: EFFECT_TYPES.REBOUND,
                    value: rebound,
                    source: zhang,
                    target: attacker,
                    hasSister: false,
                    factType: FACT_TYPES.FORTIFY_REBOUND,
                    factData: { reboundDmg: rebound, unitName: attacker.name, hasSister: false, attackerUid: attacker.uid, unitUid: zhang.uid }
                });
            });
        }
    };
}

registerElite('宋青书', createSongQingshuComponent);
registerElite('周芷若', createZhouZhiruoComponent);
registerElite('张三丰', createZhangSanfengComponent);