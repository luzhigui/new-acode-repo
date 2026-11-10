// modules/324-elite-mingjiao-brother-laststand.js — 小昭·妹永久背水一战（专属组件）
// 触发：ON_ROUND_START 时团队背水在场即触发永久效果（每局一次，不看血量、不等团队 buff 过期、不看永久账本）。
// 效果：
//   a. 精通转战士：职业锁战士 + 额外叠 1 次战士加成（精通累积保留）
//   b. 蛛袭：按本局剩余飞天次数（_spiderRemaining）逐次随机打敌方存活单位，可重复同一目标；
//      公式同 modules/20 spiderReturn（穿透 + 精通额外伤害）；剩 0 次不赠送
//   c. 本局永久禁飞天禁变卵（_noFlyNoEgg = true，modules/27 飞天/变卵触发点读它）
//   d. 攻 +10% / 防 -20% / 承伤 +40%（沿用 CONFIG.BUFFS.lastStand 数值）
//   e. 额外 80% 吸血（永久，_brotherLastStandLeech = 0.8）
//   f. 后续每回合开始叠一次战士加成（无限叠）
// V1.1.0 | 2026-11-08 触发时机改为 ON_ROUND_START（团队背水在场即触发，不再看血量/永久账本）；
//   蛛袭由单次改为按 _spiderRemaining 次数逐次随机（可重复同一目标）；brother.lastStand.hpThreshold 废弃
// V1.2.0 | 2026-11-10 每回合战士成长加系统提示+头顶 💪 飘字（老板要求：成长可见化，带累计次数 _brotherLastStandGrowN）
// V1.2.1 | 2026-11-10 重大修复：三钩从顶层裸注册迁 registerRoundHook 每回合重挂（210 每回合 clearAll，
//           顶层注册活不过第一回合=妹背水上线以来从未触发过，老板实测实锤）；触发门扩妹账本路径（对齐 323 全家口径）
export const VER = 'modules/324-elite-mingjiao-brother-laststand.js V1.2.1';

import { CONFIG, getSkillParams } from '../core/201-config-5v5-test.js';
import { getRoleBonus } from '../core/202-unit.js';
import { addMod, getStat, getBattleRng, refreshMaxHp, applyStatChange, emitEvent } from '../core/214-battle-shared.js';
import { registerSettlementHook, EXECUTION_LAYER as L, EFFECT_TYPES } from '../infra/101-event-bus.js';
import { registerRoundHook } from '../core/208-registry-elite.js';
import { SIGNAL_TYPES, FACT_TYPES, BUFF_TYPES, ROLE_TYPES, UNIT_EVENT_TYPES, STATE_CHANGE_TYPES } from '../infra/106-battle-enums.js';
import { emitStateChange } from '../infra/108-state-change.js';
import { pushSkillAnnounce, findAlive, emitHpChange } from './305-elite-helpers.js';

function findBrother(A) {
    return findAlive(A || [], 'isXiaoZhaoBrother');
}

function triggerBrotherLastStand(brother, A, B, log) {
    if (brother.state._brotherLastStandTriggered) return;
    brother.state._brotherLastStandTriggered = true;

    const cfg = CONFIG.BUFFS.lastStand;
    addMod(brother, 'atk', { source: '背水一战·妹', value: cfg.atkBonus, ttl: 'permanent', group: 'brotherLastStand', op: 'mul' });
    addMod(brother, 'def', { source: '背水一战·妹', value: -(cfg.defPenalty ?? 0.2), ttl: 'permanent', group: 'brotherLastStand', op: 'mul' });
    brother.state._lastStandTakenMul = cfg.takenDmgMul ?? 1.4;
    brother.state._brotherLastStandLeech = 0.8;

    brother.role = ROLE_TYPES.WARRIOR;
    const warriorBonus = getRoleBonus(ROLE_TYPES.WARRIOR);
    addMod(brother, 'atk', { source: '背水·精通转战士', value: warriorBonus.atk, ttl: 'permanent', group: 'brotherLastStandWarrior', op: 'add' });
    addMod(brother, 'def', { source: '背水·精通转战士', value: warriorBonus.def, ttl: 'permanent', group: 'brotherLastStandWarrior', op: 'add' });
    addMod(brother, 'maxHp', { source: '背水·精通转战士', value: warriorBonus.maxHp, ttl: 'permanent', group: 'brotherLastStandWarrior', op: 'add' });
    refreshMaxHp(brother, null, '背水·精通转战士');
    emitHpChange(brother, { role: ROLE_TYPES.WARRIOR });
    emitStateChange(brother, STATE_CHANGE_TYPES.ROLE_CHANGED, { newRole: ROLE_TYPES.WARRIOR }, log);

    brother.state._noFlyNoEgg = true;

    // 蛛袭次数 = 剩余飞天次数（剩几次就随机打几次，可重复同一目标）
    const strikeCount = brother.state._spiderRemaining || 0;
    if (strikeCount > 0) {
        const params = getSkillParams('小昭', 'spiderStrike');
        if (!params) throw new Error('缺技能参数: 小昭.spiderStrike');
        const extraDmgMap = params.extraDmgMap;
        const masteryCount = brother.state._masteredRoles?.length || 0;
        const extraDmg = extraDmgMap[Math.min(masteryCount, Object.keys(extraDmgMap).length - 1)] || 0;
        const rng = getBattleRng();
        for (let i = 0; i < strikeCount; i++) {
            const enemies = (B || []).filter(u => u.alive);
            if (enemies.length === 0) break;
            const target = enemies[rng.nextInt(0, enemies.length - 1)];
            const atk = getStat(brother, 'atk');
            const def = getStat(target, 'def');
            const penetrationDmg = Math.floor(atk * (atk / (atk + def)) * 0.5);
            const totalDmg = penetrationDmg + extraDmg;
            applyStatChange(target, 'hp', -totalDmg, brother, '蛛袭（背水触发）');
            if (log) {
                log.push({
                    factType: FACT_TYPES.SPIDER_STRIKE,
                    data: {
                        unitName: brother.name,
                        targetName: target.name,
                        penetrationDmg,
                        extraDmg,
                        totalDmg,
                        isDead: target.hp <= 0,
                        unitUid: brother.uid,
                        targetUid: target.uid
                    }
                });
            }
        }
    }

    if (log) {
        pushSkillAnnounce(log, brother, '背水一战·妹',
            `🩸 妹背水触发：精通转战士 + 蛛袭 + 攻+${Math.round(cfg.atkBonus * 100)}%/防-${Math.round((cfg.defPenalty ?? 0.2) * 100)}%/承伤+${Math.round(((cfg.takenDmgMul ?? 1.4) - 1) * 100)}%/吸血80%/禁飞天禁变卵`,
            { floatText: '🩸背水！', floatUid: brother.uid });
    }
}

// 触发门与三钩：V1.2.1 重大修复——core/210 每回合 eventBus.clearAll() 清光顶层注册（302:319 同款教训），
//   V1.1.0 顶层 registerSettlementHook = 第一回合 installRoundMechanics 后三钩全灭，
//   妹背水自上线起从未真正触发过（老板 bug 模式实测实锤）。改 registerRoundHook 每回合重挂。
// 触发口径对齐 323 全家：团队背水在场 OR 妹账本有背水，任一即触发（每局一次）。
function onRoundStartGate(data) {
    const A = data.A, B = data.B, log = data.log;
    if (!A || !B) return;
    const brother = findBrother(A);
    if (!brother || brother.state._brotherLastStandTriggered) return;
    const teamHas = (A._activeBuffs || []).some(b => b.key === BUFF_TYPES.LAST_STAND);
    const bookHas = (brother.state._permanentBuffs || []).some(b => b.key === BUFF_TYPES.LAST_STAND);
    if (!teamHas && !bookHas) return;
    triggerBrotherLastStand(brother, A, B, log);
}

function onRoundStartGrow(data) {
    const A = data.A;
    if (!A) return;
    const brother = findBrother(A);
    if (!brother || !brother.state._brotherLastStandTriggered) return;
    const warriorBonus = getRoleBonus(ROLE_TYPES.WARRIOR);
    addMod(brother, 'atk', { source: '背水·战士成长', value: warriorBonus.atk, ttl: 'permanent', group: 'brotherLastStandWarriorGrow', op: 'add' });
    addMod(brother, 'def', { source: '背水·战士成长', value: warriorBonus.def, ttl: 'permanent', group: 'brotherLastStandWarriorGrow', op: 'add' });
    addMod(brother, 'maxHp', { source: '背水·战士成长', value: warriorBonus.maxHp, ttl: 'permanent', group: 'brotherLastStandWarriorGrow', op: 'add' });
    refreshMaxHp(brother, null, '背水·战士成长');
    // 系统提示 + 头顶 💪 logo 飘字（2026-11-10 老板要求）：每次成长都可见，带累计次数
    brother.state._brotherLastStandGrowN = (brother.state._brotherLastStandGrowN || 0) + 1;
    if (data.log) {
        pushSkillAnnounce(data.log, brother, '背水·战士成长',
            `💪 妹背水·战士成长第${brother.state._brotherLastStandGrowN}次：攻+${warriorBonus.atk} 防+${warriorBonus.def} 血上限+${warriorBonus.maxHp}`,
            { floatText: '💪', floatUid: brother.uid });
    }
}

function onDamageLeech(data) {
    const unit = data.unit;
    if (!unit || !unit.isXiaoZhaoBrother) return;
    const leechRatio = unit.state._brotherLastStandLeech;
    if (!leechRatio || !data.dmg || data.dmg <= 0) return;
    const rawLeech = Math.floor(data.dmg * leechRatio);
    if (rawLeech <= 0) return;
    if (!data.declarations) data.declarations = [];
    data.declarations.push({ type: EFFECT_TYPES.LEECH, value: rawLeech, source: unit });
}

function installBrotherLastStandHooks() {
    registerSettlementHook({ when: SIGNAL_TYPES.ON_ROUND_START, priority: 10, handler: onRoundStartGate });
    registerSettlementHook({ when: SIGNAL_TYPES.ON_ROUND_START, priority: 55, handler: onRoundStartGrow });
    registerSettlementHook({ when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, priority: L.AFTER_DAMAGE_APPLIED.LEECH, handler: onDamageLeech });
}
registerRoundHook(installBrotherLastStandHooks);