// modules/23elite-skills.js - 光明顶5v5 精英技能系统
// V5.1.0 | ~10585 bytes | 2026-07-11 补全 emitEvent 调用
export const VER = 'modules/23elite-skills.js V5.1.0';

import { CONFIG } from '../core/01config-5v5-test.js';
import { hasBuff } from '../core/03battle-utils.js';
import { showHealFloat, showAtkBuffFloat } from '../fx/15fx-common-5v5-test.js';
const ES = CONFIG.ELITE_SKILLS;

function emitEvent(unit, eventType, payload) {
    if (typeof window._emitEvent === 'function') {
        window._emitEvent(unit, eventType, payload);
    }
}

/**
 * 灭绝师太 - 灭绝双剑：残血反击
 */
export function checkExtinctionCounter(defender, dmg) {
    if (defender.name !== '灭绝师太') return 0;
    const s = ES.extinctionCounter;
    if (defender.hp / defender.maxHp >= s.hpThreshold) return 0;
    if (defender._extinctionUsed) return 0;
    defender._extinctionUsed = true;
    return Math.floor(defender.atk * s.counterRatio);
}

/**
 * 周芷若 - 九阴白骨爪：基础伤害 + 已损失生命追击 + 连锁触发自己 + 低血斩杀
 * 嫉妒：张无忌在场时基础伤害与比例提升
 * 斩杀：本次伤害打完后若剩余血量 ≤ 15% 直接斩杀（带走剩余血量）
 */
export function checkNineYinClaw(attacker, target, baseDmg, log) {
    if (attacker.name !== '周芷若') return 0;
    if (!target || !target.alive) return 0;
    const s = ES.nineYinClaw;

    // 嫉妒联动：张无忌在场 → 基础5+3%，否则 基础3+2%
    const zhangAlive = window._currentBattleState && window._currentBattleState.ally &&
        window._currentBattleState.ally.some(u => u.isZhang && u.alive);
    const baseHit = zhangAlive ? (s.jealousBaseDmg || 5) : (s.baseDmg || 3);
    const ratio = zhangAlive ? s.jealousLostHpRatio : s.lostHpRatio;

    // 首次必定触发，后续按 procChance
    if (!attacker._nineYinFirstDone) {
        attacker._nineYinFirstDone = true;
    } else {
        if (Math.random() > s.procChance) return 0;
    }

    let totalBonus = 0;
    let depth = 0;
    while (target.alive) {
        if (depth > 0 && Math.random() > s.chainProcChance) break;

        const lostHp = target.maxHp - target.hp;
        const ratioDmg = Math.floor(lostHp * ratio + target.maxHp * (zhangAlive ? (s.jealousMaxHpRatio || 0.02) : (s.maxHpRatio || 0.01)));
        let bonusDmg = baseHit + Math.max(0, ratioDmg);

        target.hp = Math.max(0, target.hp - bonusDmg);
        totalBonus += bonusDmg;
        attacker.dmgDealt += bonusDmg;
        target.dmgTaken += bonusDmg;

        const hpPctAfter = target.hp / target.maxHp;
        const execThreshold = zhangAlive ? (s.jealousExecuteThreshold || 0.15) : (s.executeThreshold || 0.12);
        let isExecute = false;
        if (hpPctAfter <= execThreshold && target.hp > 0) {
            bonusDmg += target.hp;
            target.hp = 0;
            isExecute = true;
        }

        if (target.hp <= 0) {
            target.hp = 0;
            target.alive = false;
            target._isDead = true;
            if (!target._deathTime) target._deathTime = Date.now();
        }

        // 追击触发乾坤衍生（直接调用飘字）
        const zhang = window._currentBattleState && window._currentBattleState.ally ? window._currentBattleState.ally.find(u => u.isZhang && u.alive) : null;
        if (!zhang) {
            const allyTeam = window._currentBattleState?.ally || [];
            if (allyTeam.length > 0) {
                const xiaoZhao = allyTeam.find(u => u.isXiaoZhao && u.alive);
                if (xiaoZhao) {
                    let reduce = Math.max(1, Math.floor(bonusDmg * target.def / (ES.xiaoZhao.defToReduce || 100)));
                    target.hp = Math.min(target.maxHp, target.hp + reduce);
                    target.dmgTaken -= reduce;
                    const aliveAllies = allyTeam.filter(u => u.alive && !u.isHorse);
                    if (aliveAllies.length > 0) {
                        const lucky = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
                        let heal = Math.max(1, Math.floor(lucky.def / (ES.xiaoZhao.defToHeal || 5)));
                        let atkGain = Math.max(1, Math.floor(lucky.def / (ES.xiaoZhao.defToAtk || 10)));
                        lucky.hp = Math.min(lucky.maxHp, lucky.hp + heal);
                        lucky.atk += atkGain;
                        lucky.healDone += heal;
                        emitEvent(lucky, 'hp-change', { hp: lucky.hp, maxHp: lucky.maxHp, alive: lucky.alive, atk: lucky.atk, def: lucky.def });
                        log.push({
                            type: 'info',
                            text: `<span class="gold">🦋 乾坤衍生：${target.name}减伤${reduce}，${lucky.name}治疗+${heal} 攻击+${atkGain}</span>`,
                            isHealEntry: true,
                            healAmount: heal,
                            healUnitUid: lucky.uid
                        });
                    }
                }
            }
        }

        // 每次追击/斩杀后发射事件，播放器实时同步血量
        emitEvent(target, 'hp-change', {
            hp: target.hp,
            maxHp: target.maxHp,
            alive: target.alive,
            atk: target.atk,
            def: target.def,
            _isDead: target._isDead || false,
            _isAbsolute: true
        });

        // 抓取本击事件快照，播放器逐次 apply 实现逐击刷新
        const clawEvents = [...window._battleEvents];
        window._battleEvents = [];

        log.push({
            type: 'info',
            text: `<span style="color:#222">🐾 九阴白骨爪${depth > 0 ? '连锁' : '追击'}！${attacker.name} 对 ${target.name} 造成 ${bonusDmg} 点伤害${isExecute ? '（斩杀）' : (zhangAlive ? '【嫉妒】' : '')}</span>`,
            buffType: 'elite_bonus',
            isClawHit: true,
            clawAttackerUid: attacker.uid,
            clawTargetUid: target.uid,
            clawTargetHpAfter: target.hp,
            clawTargetAlive: target.alive,
            clawTargetIsDead: target._isDead,
            isExecute: isExecute,
            uidD: target.uid,
            isDead: !target.alive,
            _events: clawEvents
        });

        depth++;
        if (isExecute) break;
    }
    return totalBonus;
}

/**
 * 宋青书 - 叛逆突袭：锁定血量百分比最高目标
 */
export function getRebelTarget(attacker, enemySide) {
    if (attacker.name !== '宋青书') return null;
    const alive = enemySide.filter(u => u.alive);
    if (alive.length === 0) return null;
    return alive.reduce((a, b) => (a.hp / a.maxHp) > (b.hp / b.maxHp) ? a : b);
}

/**
 * 宋青书增伤比例
 */
export function getRebelDmgBonus(attacker) {
    if (attacker.name !== '宋青书') return 0;
    return ES.rebelStrike.dmgBonus;
}

/**
 * 宋青书 - 真实伤害
 */
export function getRebelTrueDmg(attacker, target) {
    if (attacker.name !== '宋青书') return 0;
    return Math.floor(target.hp * ES.rebelStrike.currentHpRatio);
}

/**
 * 成昆 - 混元霹雳劲
 */
export function getPhantomThunderBonus(attacker) {
    if (attacker.name !== '成昆') return 0;
    const lostHp = attacker.maxHp - attacker.hp;
    return Math.floor(lostHp * ES.phantomThunder.lostHpRatio);
}

/**
 * 鹿杖客 - 玄冥神掌
 */
export function applyXuanmingPalm(attacker, target) {
    if (attacker.name !== '鹿杖客') return null;
    const s = ES.xuanmingPalm;
    target._xuanmingPoison = {
        remaining: s.duration,
        dotPercents: [...s.dotPercents]
    };
    const firstDot = Math.floor(target.maxHp * s.dotPercents[0]);
    return {
        type: 'info',
        text: `<span class="purple">❄️ ${attacker.name} 的玄冥神掌使 ${target.name} 中毒！每回合损失生命（4%→2%→1%→消失）</span>`
    };
}

export function tickXuanmingPoison(unit) {
    if (!unit._xuanmingPoison || unit._xuanmingPoison.remaining <= 0) return 0;
    unit._xuanmingPoison.remaining--;
    const idx = Math.min(unit._xuanmingPoison.dotPercents.length - 1, ES.xuanmingPalm.duration - 1 - unit._xuanmingPoison.remaining);
    const pct = unit._xuanmingPoison.dotPercents[idx] || 0;
    const dot = Math.floor(unit.maxHp * pct);
    unit.hp -= dot;
    if (unit.hp <= 0) {
        unit.hp = 0;
        unit.alive = false;
        unit._isDead = true;
        if (!unit._deathTime) unit._deathTime = Date.now();
    }
    emitEvent(unit, 'hp-change', {
        hp: unit.hp,
        maxHp: unit.maxHp,
        alive: unit.alive,
        atk: unit.atk,
        def: unit.def,
        _isDead: unit._isDead || false,
        _isAbsolute: true
    });
    return dot;
}

/**
 * 鹤笔翁 - 鹿角杖法
 */
export function getHornStrikeBonus(attacker, target) {
    if (attacker.name !== '鹤笔翁') return { defIgnore: 0, dmgMultiplier: 1 };
    const s = ES.hornStrike;
    const poisoned = target._xuanmingPoison && target._xuanmingPoison.remaining > 0;
    return {
        defIgnore: s.defIgnore,
        dmgMultiplier: poisoned ? 1 + s.poisonedBonus : 1
    };
}

/**
 * 伤害修正钩子：在伤害计算完成后、应用前调用
 * 返回修正后的 dmg 和附加日志条目
 * 各精英技能的伤害修正统一在此处理
 */
export function applyDamageModifiers(unit, target, dmg, allySide, enemySide, log) {
    let modifiedDmg = dmg;
    const entries = [];
    const ES = CONFIG.ELITE_SKILLS;

    // 乾坤大挪移升级版：张无忌+小昭同时在场，保护2/4/6/8号位，减伤30%，反弹原伤害20%，无忌自伤原伤害10%
    const xiaoZhao = allySide.find(u => u.isXiaoZhao && u.alive);
    const zhangUpgraded = allySide.find(c => c.isZhang && c.alive);
    if (target.camp === 'ally' && xiaoZhao && zhangUpgraded && [2, 4, 6, 8].includes(target.pos)) {
        const reducedDmg = Math.round(dmg * (1 - ES.xiaoZhao.upgradedReducePct));
        const rebound = Math.floor(dmg * 0.20); // 反弹原伤害的20%
        const selfDmg = Math.max(1, Math.floor(dmg * 0.10)); // 无忌自伤原伤害的10%

        // 反弹给攻击者
        unit.hp = Math.max(0, unit.hp - rebound);
        unit.dmgTaken += rebound;
        zhangUpgraded.reboundDone += rebound;
        if (unit.hp <= 0) {
            unit.alive = false;
            unit._isDead = true;
            if (!unit._deathTime) unit._deathTime = Date.now();
        }

        // 张无忌自伤
        zhangUpgraded.hp -= selfDmg;
        zhangUpgraded.dmgTaken += selfDmg;

        emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _isDead: unit._isDead || false });
        emitEvent(zhangUpgraded, 'hp-change', { hp: zhangUpgraded.hp, maxHp: zhangUpgraded.maxHp, alive: zhangUpgraded.alive, atk: zhangUpgraded.atk, def: zhangUpgraded.def });

        entries.push({
            type: 'info',
            text: `<span class="gold">🦋 乾坤大挪移（升级版）：减伤30%，反弹${rebound}给${unit.name}（无忌自伤${selfDmg}）</span>`,
            buffType: 'rebound',
            reboundDmg: rebound,
            reboundUid: unit.uid,
            selfDmg: selfDmg,
            selfDmgUid: zhangUpgraded.uid
        });

        modifiedDmg = reducedDmg;
    }

    return { modifiedDmg, entries };
}

// ==================== V3.1.0 新增：宋青书/周芷若联动技能 ====================

/**
 * 苦练判定
 */
export function checkKuLian(allyTeam) {
    const song = allyTeam.find(u => u.name === '宋青书' && u.alive);
    if (!song) return null;
    const zhou = allyTeam.find(u => u.name === '周芷若' && u.alive);
    if (zhou) return null;
    return song;
}

/**
 * 性奋授予
 */
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

/**
 * 新婚扣血+叠快乐
 */
export function applyXinHunDeduction(attacker, allyTeam, log) {
    if (attacker.name !== '宋青书') return;
    const zhou = allyTeam.find(u => u.name === '周芷若' && u.alive);
    if (!zhou) return;
    zhou.hp = Math.max(0, zhou.hp - ES.xinHun.hpDeduct);
    zhou.dmgTaken += ES.xinHun.hpDeduct;
    emitEvent(zhou, 'hp-change', {
        hp: zhou.hp,
        maxHp: zhou.maxHp,
        alive: zhou.alive,
        atk: zhou.atk,
        def: zhou.def,
        _isAbsolute: true
    });
    zhou._kuaiLeStack.push({ healPct: ES.xinHun.healLevels[0] });
    log.push({
        type: 'info',
        text: `<span class="gold">💒 新婚：${attacker.name}攻击，${zhou.name}被扣除${ES.xinHun.hpDeduct}点血量，叠加一层快乐(16%)！当前快乐层数：${zhou._kuaiLeStack.length}</span>`,
        buffType: 'elite_xinhun',
        zhouUid: zhou.uid,
        zhouHpAfter: zhou.hp
    });
    if (zhou.hp <= 0) {
        zhou.hp = 0;
        zhou.alive = false;
        zhou._isDead = true;
        if (!zhou._deathTime) zhou._deathTime = Date.now();
        emitEvent(zhou, 'hp-change', {
            hp: 0,
            maxHp: zhou.maxHp,
            alive: false,
            atk: zhou.atk,
            def: zhou.def,
            _isDead: true,
            _isAbsolute: true
        });
        log.push({
            type: 'info',
            text: `<span class="red">💀 ${zhou.name} 因新婚扣血而阵亡！</span>`,
            uidD: zhou.uid,
            isDead: true
        });
    }
}

/**
 * 快乐回血+降级
 */
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
            const hpBefore = unit.hp;
            unit.hp = Math.min(unit.maxHp, unit.hp + totalHeal);
            unit.healDone += totalHeal;
            emitEvent(unit, 'hp-change', {
                hp: unit.hp,
                maxHp: unit.maxHp,
                alive: unit.alive,
                atk: unit.atk,
                def: unit.def,
                _isAbsolute: true
            });
            log.push({
                type: 'info',
                text: `<span class="green">💚 快乐回血：${unit.name} 回复${totalHeal}点生命（${unit._kuaiLeStack.length}层触发），血量 ${Math.floor(hpBefore)} → ${Math.floor(unit.hp)}</span>`,
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

// 性奋 maxHp 惩罚：每次宋青书攻击后调用（含性奋额外攻击）。
// 第1次攻击不扣，之后每次扣递增值（1,2,3...），使每回合2次攻击对应2次扣减。
export function applyXingFenPenalty(attacker, log) {
    if (attacker.name !== '宋青书') return;
    if (!attacker._xingFenPenaltyCount) attacker._xingFenPenaltyCount = 0;
    attacker._xingFenPenaltyCount++;
    const penalty = attacker._xingFenPenaltyCount - 1; // 第1次攻击penalty=0不扣
    if (penalty > 0 && attacker.maxHp > 1) {
        const oldMaxHp = attacker.maxHp;
        attacker.maxHp = Math.max(1, attacker.maxHp - penalty);
        attacker.hp = Math.min(attacker.hp, attacker.maxHp);
        if (typeof window._emitEvent === 'function') {
            window._emitEvent(attacker, 'hp-change', { hp: attacker.hp, maxHp: attacker.maxHp, alive: attacker.alive, atk: attacker.atk, def: attacker.def });
        }
        if (log) log.push({ type:'info', text:`<span class="red">💗 性奋代价：${attacker.name} 血量上限 ${oldMaxHp} → ${attacker.maxHp}（-${penalty}）</span>` });
    }
}

/**
 * 小昭 - 蝶变：每回合随机变换职业，职业修正累加（不移除），
 * 记录精通职业，每次变身+10生命上限（等比缩放血量）
 */
export function transformXiaoZhao(unit, log) {
    if (!unit.isXiaoZhao || !unit.alive) return;
    const roles = ['战士', '防战', '远程', '飞行'];
    const newRole = roles[Math.floor(Math.random() * roles.length)];

    // 记录精通职业（去重）
    if (!unit._masteredRoles) unit._masteredRoles = [];
    if (!unit._masteredRoles.includes(newRole)) {
        unit._masteredRoles.push(newRole);
    }

    // 职业修正参数（绝对值，累加不移除）
    const roleStats = {
        '战士': { atk: 3, def: 2, maxHp: 25 },
        '防战': { atk: -6, def: 0, maxHp: 50 },
        '远程': { atk: 6, def: -2, maxHp: -25 },
        '飞行': { atk: 2, def: -2, maxHp: -25 }
    };

    const newStats = roleStats[newRole] || { atk: 0, def: 0, maxHp: 0 };

    // 职业修正累加（不移除旧修正），但不修改 base 值
    unit.role = newRole;
    unit.atk += newStats.atk;
    unit.def += newStats.def;

    // 防战形态：初始防御+1（基础加成，不叠入 _fortifyStacks）
    if (newRole === '防战') {
        if (!unit._baseFangDef) unit._baseFangDef = 0;
        unit._baseFangDef += 1;
        unit.def += 1;
    }

    // 生命上限变化：上限加多少，当前血量同步加多少；上限减则血量不超过新上限
    let hpDelta = newStats.maxHp + 5;  // 角色修正 + 额外+5
    unit.maxHp += hpDelta;
    if (hpDelta > 0) {
        unit.hp += hpDelta;
    } else {
        unit.hp = Math.min(unit.hp, unit.maxHp);
    }

    emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, role: unit.role, _masteredRoles: unit._masteredRoles });
    log.push({ type:'info', text:`<span class="gold">🦋 蝶变：小昭变换为<span class="gold">${newRole}</span>（已精通${unit._masteredRoles.length}/4）</span>` });
}

/**
 * 小昭 - 变身精通加成
 * 每精通一个职业：+2攻击 +3防御 +12.5血量上限
 * 四职业精通额外+一次：+2攻 +3防 +12.5血
 * 最多精通4个职业：+10攻击 +15防御 +62.5血量上限
 */
export function computeButterflyMastery(unit) {
    if (!unit.isXiaoZhao || !unit._masteredRoles) return { atk: 0, def: 0, hp: 0 };
    const count = unit._masteredRoles.length;
    const extra = count >= 4 ? 1 : 0;
    return {
        atk: (count + extra) * 2,
        def: (count + extra) * 3,
        hp: (count + extra) * 12.5
    };
}

/**
 * 小昭 - 永久海克斯存储
 * 统一入口：将海克斯 Buff 存入小昭的永久海克斯列表
 * 调用方：选 Buff 弹窗、全自动选 Buff、showBuffSelection
 */
export function addPermanentBuff(xiaoZhao, buffKey, buffName, extraFields = {}) {
    if (!xiaoZhao || !xiaoZhao.isXiaoZhao) return;
    if (!xiaoZhao._permanentBuffs) xiaoZhao._permanentBuffs = [];
    xiaoZhao._permanentBuffs.push({
        key: buffKey,
        target: 'ally',
        remaining: Infinity,
        name: buffName,
        ...extraFields
    });
}

/**
 * 检查小昭的永久海克斯是否应该激活
 * 规则：团队海克斯还在时用团队的，团队消失后小昭单独续上
 */
export function isXiaoZhaoPermanentActive(unit, activeBuffs, buffKey) {
    if (!unit || !unit.isXiaoZhao || !unit._permanentBuffs) return false;
    if (activeBuffs && hasBuff(activeBuffs, buffKey)) return false; // 团队还有，不用小昭的
    return unit._permanentBuffs.some(b => b.key === buffKey);
}

/**
 * 小昭 - 乾坤大挪移（衍生版）：队友受伤时触发减伤/治疗/加攻
 * 仅在张无忌不在场时生效
 */
export function applyXiaoZhaoDerived(allyTeam, target, dmg, group) {
    const xiaoZhao = allyTeam.find(u => u.isXiaoZhao && u.alive);
    if (!xiaoZhao) return;
    const zhang = allyTeam.find(u => u.isZhang && u.alive);
    if (zhang) return; // 张无忌在场时，衍生技失效
    const s = ES.xiaoZhao;
    if (!s) return;

    // 减伤
    let reduce = Math.max(s.minReduce || 1, Math.floor(dmg * target.def / (s.defToReduce || 100)));
    target.hp = Math.min(target.maxHp, target.hp + reduce);
    target.dmgTaken -= reduce;

    // 随机一名队友获得治疗
    const aliveAllies = allyTeam.filter(u => u.alive && !u.isHorse);
    if (aliveAllies.length > 0) {
        const healTarget = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
        let heal = Math.max(s.minHeal || 1, Math.floor(healTarget.def / (s.defToHeal || 5)));
        healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + heal);
        healTarget.healDone += heal;
        emitEvent(healTarget, 'hp-change', { hp: healTarget.hp, maxHp: healTarget.maxHp, alive: healTarget.alive, atk: healTarget.atk, def: healTarget.def });
        // 随机另一名队友获得攻击（独立随机，可能和治疗同一人）
    let atkGainText = '';
    if (aliveAllies.length > 0) {
        const atkTarget = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
        let atkGain = Math.max(s.minAtk || 1, Math.floor(atkTarget.def / (s.defToAtk || 10)));
        atkTarget.atk += atkGain;
        emitEvent(atkTarget, 'hp-change', { hp: atkTarget.hp, maxHp: atkTarget.maxHp, alive: atkTarget.alive, atk: atkTarget.atk, def: atkTarget.def });
        atkGainText = `，${atkTarget.name}攻击+${atkGain}`;
    }

    // 合并日志：减伤+治疗+攻击
    if (group && group.entries) {
        group.entries.push({
            type: 'info',
            text: `<span class="gold">🦋 乾坤衍生：${target.name}减伤${reduce}，${healTarget.name}治疗+${heal}${atkGainText}</span>`,
            isHealEntry: true,
            healAmount: heal,
            healUnitUid: healTarget.uid
        });
    }
}
}