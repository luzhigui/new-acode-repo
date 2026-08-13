// modules/15elite-skills.js - 光明顶5v5 精英技能系统
// V5.4.0 | ~13400 bytes| 2026-08-04 白骨爪/叛逆突袭接入 game-data
export const VER = 'modules/15elite-skills.js V5.4.0';

import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { ROLE_BONUS } from '../core/02unit.js';
import { hasBuff } from '../core/03battle-utils.js';
import { emitEvent, applyStatChange, applyMaxHpChange, registerQuery, getBattleRng } from '../core/13battle-shared.js';
const ES = CONFIG.ELITE_SKILLS;

// ==================== 玄冥二老 — 中毒/鹿角 ====================

export function tickXuanmingPoison(unit) {
    if (!unit._xuanmingPoison || unit._xuanmingPoison.remaining <= 0) return 0;
    unit._xuanmingPoison.remaining--;
    const s = getSkillParams('鹿杖客', 'xuanmingPalm') || ES.xuanmingPalm;
    const idx = Math.min(unit._xuanmingPoison.dotPercents.length - 1, s.duration - 1 - unit._xuanmingPoison.remaining);
    const pct = unit._xuanmingPoison.dotPercents[idx] || 0;
    const dot = Math.floor(unit.maxHp * pct);
    applyStatChange(unit, 'hp', -dot, null, '玄冥中毒');
    return dot;
}

// ==================== 乾坤大挪移升级版减伤 ====================

export function applyDamageModifiers(unit, target, dmg, allySide, enemySide, log) {
    let modifiedDmg = dmg;
    const entries = [];
    const ES = CONFIG.ELITE_SKILLS;

    const xiaoZhao = allySide.find(u => (u.isXiaoZhaoSister || u.isXiaoZhaoBrother) && u.alive);
    const zhang = allySide.find(c => c.isZhang && c.alive && c.rangedForm && !c.state._stunned);
    if (target.camp !== 'ally' || !zhang) return { modifiedDmg, entries };

    if (xiaoZhao && [2, 4, 6, 8].includes(target.pos)) {
        // 升级版：减伤30%，反弹20%，自伤原始伤害10%
        const s = getSkillParams('小昭', 'qianKunUpgraded') || ES.xiaoZhao;
        const reducePct = s.reducePct || 30;
        const reboundPct = s.reboundPct || 20;
        const selfDmgPct = s.selfDmgPct || 10;
        const reducedDmg = Math.round(dmg * (1 - reducePct / 100));
        const rebound = Math.floor(dmg * (reboundPct / 100));
        const selfDmg = Math.max(1, Math.floor(dmg * (selfDmgPct / 100)));

        zhang.reboundDone += rebound;
        applyStatChange(unit, 'hp', -rebound, zhang, '乾坤反弹');
        applyStatChange(zhang, 'hp', -selfDmg, unit, '乾坤自伤');

        entries.push({
            type: 'info',
            text: `<span class="gold">🦋 乾坤大挪移（升级版）：减伤${reducePct}%，反弹${rebound}给${unit.name}（无忌自伤${selfDmg}）</span>`,
            reboundDmg: rebound,
            reboundTargetUid: unit.uid,
            selfDmg: selfDmg,
            selfDmgUid: zhang.uid
        });

        modifiedDmg = reducedDmg;
    } else if (!xiaoZhao && (target.pos === 4 || target.pos === 6)) {
        // 基础版：减伤10%，反弹10%，自伤原始伤害10%
        const s = getSkillParams('张无忌', 'qianKun') || { reducePct: 10, reboundPct: 10, selfDmgPct: 10 };
        const reducePct = s.reducePct || 10;
        const reboundPct = s.reboundPct || 10;
        const selfDmgPct = s.selfDmgPct || 10;
        const reducedDmg = Math.round(dmg * (1 - reducePct / 100));
        const rebound = Math.floor(dmg * (reboundPct / 100));
        const selfDmg = Math.max(1, Math.floor(dmg * (selfDmgPct / 100)));

        zhang.reboundDone += rebound;
        applyStatChange(unit, 'hp', -rebound, zhang, '乾坤反弹');
        applyStatChange(zhang, 'hp', -selfDmg, unit, '乾坤自伤');

        entries.push({
            type: 'info',
            text: `<span class="gold">✨ 乾坤大挪移：减伤${reducePct}%，反弹${rebound}给${unit.name}（无忌自伤${selfDmg}）</span>`,
            reboundDmg: rebound,
            reboundTargetUid: unit.uid,
            selfDmg: selfDmg,
            selfDmgUid: zhang.uid
        });

        modifiedDmg = reducedDmg;
    }

    return { modifiedDmg, entries };
}

// ==================== 宋青书/周芷若联动 — 回合级 ====================

export function checkKuLian(allyTeam) {
    const song = allyTeam.find(u => u.name === '宋青书' && u.alive);
    if (!song) return null;
    const zhou = allyTeam.find(u => u.name === '周芷若' && u.alive);
    if (zhou) return null;
    return song;
}

export function applyXingFenGrant(allyTeam, log) {
    const zhou = allyTeam.find(u => u.name === '周芷若' && u.alive);
    const song = allyTeam.find(u => u.name === '宋青书' && u.alive);
    if (!zhou || !song) return;
    song._xingFenActive = true;
    log.push({
        type: 'buff-summary',
        text: `<span class="gold">💗 性奋：${song.name} 受${zhou.name}激励，本回合每次攻击后可再次攻击！</span>`,
        buffType: 'elite_xingfen'
    });
}

export function tickKuaiLeHeal(allUnits, log) {
    allUnits.forEach(unit => {
        if (!unit._kuaiLeStack || unit._kuaiLeStack.length === 0) return;
        if (!unit.alive) return;
        let totalHeal = 0;
        const newStack = [];
        unit._kuaiLeStack.forEach(layer => {
            const healAmount = Math.floor(unit.maxHp * layer.healPct);
            totalHeal += healAmount;
            const levels = ES.xinHun.healLevels;
            const currentIdx = levels.indexOf(layer.healPct);
            if (currentIdx >= 0 && currentIdx < levels.length - 1) {
                newStack.push({ healPct: levels[currentIdx + 1] });
            }
        });
        if (totalHeal > 0) {
            const hpBefore = Math.floor(unit.hp);
            applyStatChange(unit, 'hp', totalHeal, null, '快乐回血');
            log.push({
                type: 'info',
                text: `<span class="green">💚 快乐回血：${unit.name} 回复${totalHeal}点生命（${unit._kuaiLeStack.length}层触发），血量 ${hpBefore} → ${Math.floor(unit.hp)}</span>`,
                buffType: 'elite_kuaile_heal',
                zhouUid: unit.uid,
                zhouHpAfter: unit.hp
            });
        }
        unit._kuaiLeStack = newStack;
    });
}

export function canXingFenTrigger(attacker) {
    if (attacker.name !== '宋青书') return false;
    if (!attacker._xingFenActive) return false;
    if (!attacker.alive) return false;
    return true;
}

export function consumeXingFen(attacker) {
    attacker._xingFenActive = false;
}

// ==================== 小昭·妹 — 蛛变/飞天/蛛落 ====================

/**
 * 小昭妹妹每回合随机变换职业（不重复），记录精通职业，叠加对应属性加成
 * @param {Unit} unit - 小昭妹妹单位
 * @param {Array} log - 日志数组
 */
export function spiderTransform(unit, log) {
    if (!unit.isXiaoZhaoBrother || !unit.alive) return;
    const rng = getBattleRng();
    const roles = ['战士', '防战', '远程', '飞行'];
    let availableRoles = roles.filter(r => r !== unit.role);
    if (availableRoles.length === 0) availableRoles = roles;
    const newRole = availableRoles[rng.nextInt(0, availableRoles.length - 1)];
    unit._lastRole = newRole;

    if (!unit._masteredRoles) unit._masteredRoles = [];
    if (!unit._masteredRoles.includes(newRole)) {
        unit._masteredRoles.push(newRole);
    }

    const newStats = ROLE_BONUS[newRole] || { atk: 0, def: 0, maxHp: 0 };
    unit.role = newRole;
    applyStatChange(unit, 'atk', newStats.atk, null, '蛛变');
    applyStatChange(unit, 'def', newStats.def, null, '蛛变');
    unit._baseAtk = (unit._baseAtk || unit.atk) + newStats.atk;
    unit._baseDef = (unit._baseDef || unit.def) + newStats.def;

    const st = getSkillParams('小昭', 'spiderTransform') || { hpBonus: 5 };
    let hpDelta = newStats.maxHp + (st.hpBonus || 5);
    unit._baseMaxHp = (unit._baseMaxHp || unit.maxHp) + hpDelta;
    applyMaxHpChange(unit, unit.maxHp + hpDelta, null, '蛛变');

    emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, role: newRole });
    log.push({ type:'info', text:`<span class="gold">🕷️ 蛛变：${unit.name} 变换为<span class="gold">${newRole}</span>（已精通${unit._masteredRoles.length}/4）</span>` });
}

/**
 * 小昭妹妹回合结束蛛落：解除飞天状态 → 找空位落地 → 随机攻击一个敌人（穿透 + 精通加成）
 * @param {Unit} unit - 小昭妹妹单位
 * @param {Array} allyTeam - 己方单位数组
 * @param {Array} enemySide - 敌方单位数组
 * @param {Array} log - 日志数组
 */
export function spiderReturn(unit, allyTeam, enemySide, log) {
    if (!unit.isXiaoZhaoBrother) return;
    const rng = getBattleRng();

    unit.state._spiderFlying = false;
    unit.state._flyMode = null;
    unit.state._acted = false;

    const order = [4, 5, 6, 7, 8, 9, 1, 2, 3];
    const occupied = new Set(allyTeam.filter(a => a.alive && !a.isHorse && a.uid !== unit.uid).map(a => a.pos));
    for (const p of order) {
        if (!occupied.has(p)) { unit.pos = p; break; }
    }

    log.push({ type:'info', text:`<span class="gold">🕷️ 蛛落：${unit.name} 从天而降，落在${unit.pos}号位！</span>` });

    const aliveEnemies = enemySide.filter(u => u.alive);
    if (aliveEnemies.length > 0) {
        const target = aliveEnemies[rng.nextInt(0, aliveEnemies.length - 1)];
        if (!target.alive) { log.push({ type:'info', text:`<span class="gray">🕷️ 蛛袭：目标已死亡，攻击取消</span>` }); return; }
        const penetrationDmg = Math.floor(unit.atk * (unit.atk / (unit.atk + target.def)));
        const masteryCount = unit._masteredRoles?.length || 0;
        const params = getSkillParams('小昭', 'spiderStrike') || { extraDmgMap: [0, 5, 10, 15, 30] };
        const extraDmgMap = params.extraDmgMap || [0, 5, 10, 15, 30];
        const extraDmg = extraDmgMap[Math.min(masteryCount, 4)] || 0;
        const totalDmg = penetrationDmg + extraDmg;
        applyStatChange(target, 'hp', -totalDmg, unit, '蛛袭');
        log.push({ type:'info', text:`<span class="gold">🕷️ 蛛袭：${unit.name} 落地攻击 ${target.name}，穿透${penetrationDmg} + 精通${extraDmg} = ${totalDmg} 伤害！</span>`, uidA: unit.uid, uidD: target.uid, isDead: !target.alive, isSpiderStrike: true, needsSeparator: true });
    }
}

// ==================== 小昭共通 — 精通 + 永久海克斯 ====================

/**
 * 计算小昭妹妹的精通加成（攻/防/血），精通 4 个职业后额外 +2 层
 * @param {Unit} unit - 小昭妹妹单位
 * @returns {{ atk: number, def: number, hp: number }} 精通加成的绝对值
 */
export function computeButterflyMastery(unit) {
    if (!unit.isXiaoZhaoBrother || !unit._masteredRoles) return { atk: 0, def: 0, hp: 0 };
    const count = unit._masteredRoles.length;
    let layers = count;
    if (count >= 4) layers = count + 2;
    const m = getSkillParams('小昭', 'mastery') || { atkPer: 2, defPer: 2, hpPer: 5 };
    return {
        atk: layers * (m.atkPer || 2),
        def: layers * (m.defPer || 2),
        hp: layers * (m.hpPer || 5)
    };
}

export function addPermanentBuff(xiaoZhao, buffKey, buffName, extraFields = {}) {
    if (!xiaoZhao || !xiaoZhao.isXiaoZhaoBrother) return;
    if (!xiaoZhao._permanentBuffs) xiaoZhao._permanentBuffs = [];
    xiaoZhao._permanentBuffs.push({
        key: buffKey,
        target: 'ally',
        remaining: Infinity,
        name: buffName,
        ...extraFields
    });
}

export function isXiaoZhaoPermanentActive(unit, activeBuffs, buffKey) {
    if (!unit || !unit.isXiaoZhaoBrother || !unit._permanentBuffs) return false;
    if (activeBuffs && hasBuff(activeBuffs, buffKey)) return false;
    return unit._permanentBuffs.some(b => b.key === buffKey);
}

export function getXiaoZhaoHexEnhance(allyTeam, activeBuffs, hexKey) {
    const xiaoZhao = allyTeam.find(u => u.isXiaoZhaoSister && u.alive);
    if (!xiaoZhao) return null;
    if (!hasBuff(activeBuffs, hexKey)) return null;
    const s = ES.xiaoZhao;
    if (!s || !s.hexEnhance || !s.hexEnhance[hexKey]) return null;
    return s.hexEnhance[hexKey];
}

// ==================== 查询注册 ====================
// 注册到 core 的查询注册表，让 core 层通过 query() 调用，不直接 import 本文件
registerQuery('xiaoHexEnhance', getXiaoZhaoHexEnhance);
registerQuery('xiaoPermanentActive', isXiaoZhaoPermanentActive);
registerQuery('butterflyMastery', computeButterflyMastery);
registerQuery('damageModifiers', applyDamageModifiers);