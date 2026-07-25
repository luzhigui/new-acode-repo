// modules/23elite-skills.js - 光明顶5v5 精英技能系统
// V5.2.0 | ~25000 bytes | 2026-07-16 收敛成昆幻影、小昭永久惑心/连击等判定逻辑
export const VER = 'modules/23elite-skills.js V5.2.0';

import { CONFIG } from '../core/01config-5v5-test.js';
import { ROLE_BONUS } from '../core/02unit.js';
import { hasBuff, rand } from '../core/03battle-utils.js';
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


/**
 * 周芷若 - 九阴白骨爪：基础伤害 + 已损失生命追击 + 连锁触发自己 + 低血斩杀
 * 嫉妒：张无忌在场时基础伤害与比例提升
 * 斩杀：本次伤害打完后若剩余血量 ≤ 15% 直接斩杀（带走剩余血量）
 */
export function checkNineYinClaw(attacker, target, baseDmg, log) {
    if (attacker.name !== '周芷若') return 0;
    if (!target || !target.alive) return 0;
    const s = ES.nineYinClaw;

    const battleState = GlobalStore.get('currentBattleState');
    const zhangAlive = battleState && battleState.ally &&
        battleState.ally.some(u => u.isZhang && u.alive);
    const baseHit = zhangAlive ? (s.jealousBaseDmg || 5) : (s.baseDmg || 3);
    const ratio = zhangAlive ? s.jealousLostHpRatio : s.lostHpRatio;

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

        emitEvent(target, 'hp-change', {
            hp: target.hp,
            maxHp: target.maxHp,
            alive: target.alive,
            atk: target.atk,
            def: target.def,
            _isDead: target._isDead || false,
            _isAbsolute: true
        });

        const clawEvents = [...window._battleEvents];
        window._battleEvents = [];
        if (window.GlobalStore) window.GlobalStore.flushBattleEvents();

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

        // 乾坤衍生（只有姐姐有）
        const zhang = battleState && battleState.ally ? battleState.ally.find(u => u.isZhang && u.alive) : null;
        if (!zhang) {
            const allyTeam = GlobalStore.get('currentBattleState')?.ally || [];
            applyXiaoZhaoDerived(allyTeam, target, bonusDmg, null);
        }

        // 宋青书回血
        const songQingShu = battleState?.ally ? null : null;
        const allUnitsForClaw = [...(battleState?.ally || []), ...(battleState?.enemy || [])];
        const song = allUnitsForClaw.find(u => u.name === '宋青书' && u.alive);
        if (song && bonusDmg > 0) {
            const healAmount = Math.min(bonusDmg, song.maxHp - song.hp);
            if (healAmount > 0) {
                song.hp += healAmount;
                song.healDone += healAmount;
            }
            emitEvent(song, 'hp-change', { hp: song.hp, maxHp: song.maxHp, alive: song.alive, atk: song.atk, def: song.def });
            log.push({
                type: 'info',
                text: `<span class="green">💚 宋青书因九阴白骨爪回复${healAmount > 0 ? healAmount : 0}点生命${healAmount === 0 ? '（已满血）' : ''}</span>`,
                isHealEntry: true,
                healAmount: healAmount > 0 ? healAmount : bonusDmg,
                healUnitUid: song.uid,
                fastEntry: true
            });
        }

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

export function getRebelDmgBonus(attacker) {
    if (attacker.name !== '宋青书') return 0;
    return ES.rebelStrike.dmgBonus;
}

export function getRebelTrueDmg(attacker, target) {
    if (attacker.name !== '宋青书') return 0;
    return Math.floor(target.hp * ES.rebelStrike.currentHpRatio);
}

export function getPhantomThunderBonus(attacker) {
    if (attacker.name !== '成昆') return 0;
    const lostHp = attacker.maxHp - attacker.hp;
    return Math.floor(lostHp * ES.phantomThunder.lostHpRatio);
}

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

export function getHornStrikeBonus(attacker, target) {
    if (attacker.name !== '鹤笔翁') return { defIgnore: 0, dmgMultiplier: 1 };
    const s = ES.hornStrike;
    const poisoned = target._xuanmingPoison && target._xuanmingPoison.remaining > 0;
    return {
        defIgnore: s.defIgnore,
        dmgMultiplier: poisoned ? 1 + s.poisonedBonus : 1
    };
}

export function applyDamageModifiers(unit, target, dmg, allySide, enemySide, log) {
    let modifiedDmg = dmg;
    const entries = [];
    const ES = CONFIG.ELITE_SKILLS;

    const xiaoZhao = allySide.find(u => (u.isXiaoZhaoSister || u.isXiaoZhaoBrother) && u.alive);
    const zhangUpgraded = allySide.find(c => c.isZhang && c.alive);
    if (target.camp === 'ally' && xiaoZhao && zhangUpgraded && [2, 4, 6, 8].includes(target.pos)) {
        const reducedDmg = Math.round(dmg * (1 - ES.xiaoZhao.upgradedReducePct));
        const rebound = Math.floor(dmg * (ES.xiaoZhao.upgradedReboundPct || 0.20));
        const selfDmg = Math.max(1, Math.floor(dmg * (ES.xiaoZhao.upgradedSelfDmgPct || 0.10)));

        unit.hp = Math.max(0, unit.hp - rebound);
        unit.dmgTaken += rebound;
        zhangUpgraded.reboundDone += rebound;
        if (unit.hp <= 0) {
            unit.alive = false;
            unit._isDead = true;
            if (!unit._deathTime) unit._deathTime = Date.now();
        }

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

// ==================== 宋青书/周芷若联动技能 ====================

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

export function applyXingFenPenalty(attacker, log) {
    if (attacker.name !== '宋青书') return;
    if (!attacker._xingFenPenaltyCount) attacker._xingFenPenaltyCount = 0;
    attacker._xingFenPenaltyCount++;
    const penalty = attacker._xingFenPenaltyCount;
    if (penalty > 0 && attacker.maxHp > 1) {
        const oldMaxHp = attacker.maxHp;
        attacker.maxHp = Math.max(1, attacker.maxHp - penalty);
        attacker.hp = Math.min(attacker.hp, attacker.maxHp);
        emitEvent(attacker, 'hp-change', { hp: attacker.hp, maxHp: attacker.maxHp, alive: attacker.alive, atk: attacker.atk, def: attacker.def });
        if (log) log.push({ type:'info', text:`<span class="red">💗 性奋代价：${attacker.name} 血量上限 ${oldMaxHp} → ${attacker.maxHp}（-${penalty}）</span>` });
    }
}

// ==================== 🦋 小昭·姊 — 蝶变附身 ====================

/**
 * 明教第一个攻击者出手前触发。姊附身到4号位后面最近的队友。
 */
export function butterflyAttach(unit, allyTeam, log) {
    if (!unit.isXiaoZhaoSister || !unit.alive || unit._butterflyHost) return;
    if (unit.pos !== 4) return;

    const order = [5, 6, 7, 8, 9, 1, 2, 3];
    let host = null;
    for (const p of order) {
        const u = allyTeam.find(a => a.pos === p && a.alive && !a.isHorse && a.uid !== unit.uid);
        if (u) { host = u; break; }
    }
    if (!host) {
        unit.hp = 0; unit.alive = false; unit._isDead = true;
        if (!unit._deathTime) unit._deathTime = Date.now();
        emitEvent(unit, 'hp-change', { hp: 0, maxHp: unit.maxHp, alive: false, atk: unit.atk, def: unit.def, _isDead: true });
        log.push({ type:'info', text:`<span class="red">🦋 蝶变：${unit.name} 无队友可附身，香消玉殒！</span>` });
        return;
    }

    unit._butterflyAtk = unit.atk;
    unit._butterflyDef = unit.def;
    unit._butterflyHp = unit.hp;

    const atkTransfer = Math.floor(unit.atk / 2);
    const defTransfer = Math.floor(unit.def / 2);
    const hpTransfer = Math.floor(unit.hp / 2);
    host._butterflyAtkBonus += atkTransfer;
    host._butterflyDefBonus += defTransfer;
    host.atk += atkTransfer;
    host.def += defTransfer;
    host.maxHp += hpTransfer;
    host.hp = Math.min(host.maxHp, host.hp + hpTransfer);
    emitEvent(host, 'hp-change', { hp: host.hp, maxHp: host.maxHp, alive: host.alive, atk: host.atk, def: host.def, _phantomTarget: unit.uid });

    const aliveAllies = allyTeam.filter(a => a.alive && !a.isHorse && a.uid !== unit.uid);
    const totalHp = aliveAllies.reduce((sum, a) => sum + a.hp, 0);
    const totalMaxHp = aliveAllies.reduce((sum, a) => sum + a.maxHp, 0);
    if (totalMaxHp > 0) {
        unit.hp = Math.floor(unit.maxHp * (totalHp / totalMaxHp));
    }
    unit._butterflyHost = host.uid;
    unit._flyMode = 'butterfly';

    emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _flyMode: 'butterfly', _butterflyHost: unit._butterflyHost });
    log.push({ type:'info', text:`<span class="gold">🦋 蝶变：${unit.name} 化为蝴蝶附身于 ${host.name}！攻+${atkTransfer} 防+${defTransfer} 血上限+${hpTransfer}</span>` });

    // ★ 立即刷新 Store，让 UI 瞬间更新宿主的攻防血和蝴蝶 logo
    const ctx = window._getPlayerContext?.();
    if (ctx && ctx.store) {
        const events = [...window._battleEvents];
        window._battleEvents = [];
        if (window.GlobalStore) window.GlobalStore.flushBattleEvents();
        if (events.length > 0) ctx.store.dispatch({ type: 'APPLY_EVENTS', events });
    }
}

export function butterflyReturn(unit, allyTeam, log) {
    if (!unit.isXiaoZhaoSister || !unit._butterflyHost) return;

    unit.atk = unit._butterflyAtk;
    unit.def = unit._butterflyDef;
    // 收回加给宿主的攻防血
    const host = allyTeam.find(a => a.uid === unit._butterflyHost);
    if (host) {
        const atkTransfer = host._butterflyAtkBonus;
        const defTransfer = host._butterflyDefBonus;
        const hpTransfer = Math.floor(unit._butterflyHp / 2);
        host._butterflyAtkBonus = 0;
        host._butterflyDefBonus = 0;
        host.atk = Math.max(0, host.atk - atkTransfer);
        host.def = Math.max(0, host.def - defTransfer);
        const prevMaxHp = host.maxHp;
        host.maxHp = Math.max(1, host.maxHp - hpTransfer);
        host._baseMaxHp = Math.max(1, (host._baseMaxHp || prevMaxHp) - hpTransfer);
        const hpRatio = prevMaxHp > 0 ? host.hp / prevMaxHp : 1;
        host.hp = Math.floor(host.maxHp * hpRatio);
        host._phantomTarget = null;
        emitEvent(host, 'hp-change', { hp: host.hp, maxHp: host.maxHp, alive: host.alive, atk: host.atk, def: host.def, _phantomTarget: null });
    }

    unit._butterflyAtk = 0; unit._butterflyDef = 0; unit._butterflyHp = 0;
    unit._flyMode = null;
    unit._butterflyHost = null;

    // 根据全体队友（含已阵亡）的总生命值比例计算当前血量
    const allies = allyTeam.filter(a => !a.isHorse && a.uid !== unit.uid);
    const totalHp = allies.reduce((sum, a) => sum + (a.alive ? a.hp : 0), 0);
    const totalMaxHp = allies.reduce((sum, a) => sum + a.maxHp, 0);
    const ratio = totalMaxHp > 0 ? totalHp / totalMaxHp : 0;
    unit.hp = Math.floor(unit.maxHp * ratio);
    if (unit.hp <= 0) {
        unit.hp = 0;
        unit.alive = false;
        unit._isDead = true;
        if (!unit._deathTime) unit._deathTime = Date.now();
    }

    const order = [4, 5, 6, 7, 8, 9, 1, 2, 3];
    const occupied = new Set(allyTeam.filter(a => a.alive && !a.isHorse && a.uid !== unit.uid).map(a => a.pos));
    for (const p of order) {
        if (!occupied.has(p)) { unit.pos = p; break; }
    }

    emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _flyMode: null, _butterflyHost: null, _isDead: unit._isDead || false });
    log.push({ type:'info', text:`<span class="gold">🦋 蝶变：${unit.name} 飞回，落在${unit.pos}号位！${Math.floor(unit.hp)}/${Math.floor(unit.maxHp)}</span>` });
}

// ==================== 🕷️ 小昭·妹 — 蛛变 + 飞天 ====================

export function spiderTransform(unit, log) {
    if (!unit.isXiaoZhaoBrother || !unit.alive) return;
    const roles = ['战士', '防战', '远程', '飞行'];
    let availableRoles = unit._lastRole ? roles.filter(r => r !== unit._lastRole) : roles;
    if (availableRoles.length === 0) availableRoles = roles;
    const newRole = availableRoles[Math.floor(Math.random() * availableRoles.length)];
    unit._lastRole = newRole;

    if (!unit._masteredRoles) unit._masteredRoles = [];
    if (!unit._masteredRoles.includes(newRole)) {
        unit._masteredRoles.push(newRole);
    }

    const newStats = ROLE_BONUS[newRole] || { atk: 0, def: 0, maxHp: 0 };
    unit.role = newRole;
    unit.atk += newStats.atk;
    unit.def += newStats.def;
    unit._baseAtk = (unit._baseAtk || unit.atk) + newStats.atk;
    unit._baseDef = (unit._baseDef || unit.def) + newStats.def;
    unit._baseAtk = (unit._baseAtk || unit.atk) + newStats.atk;
    unit._baseDef = (unit._baseDef || unit.def) + newStats.def;

    const prevMaxHp = unit.maxHp;
    let hpDelta = newStats.maxHp + 5;
    unit.maxHp += hpDelta;
    if (hpDelta > 0) {
        unit.hp += hpDelta;
    } else {
        const hpRatio = prevMaxHp > 0 ? unit.hp / prevMaxHp : 1;
        unit.hp = Math.floor(unit.maxHp * hpRatio);
    }

    emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, role: unit.role, _masteredRoles: unit._masteredRoles });
    log.push({ type:'info', text:`<span class="gold">🕷️ 蛛变：${unit.name} 变换为<span class="gold">${newRole}</span>（已精通${unit._masteredRoles.length}/4）</span>` });
}

export function spiderFlyCheck(unit, allyTeam, log, incomingDmg) {
    if (!unit.isXiaoZhaoBrother || !unit.alive || unit._spiderFlying) return false;
    if (unit._flyMode === 'spider') return false;

    const hpBefore = unit.hp;
    const hpAfter = incomingDmg !== undefined ? hpBefore - incomingDmg : hpBefore;
    const maxHp = unit.maxHp;

    let reason = '';

    if (!unit._spiderTriggered70 && hpBefore > maxHp * 0.7 && hpAfter <= maxHp * 0.7) {
        reason = '血量即将低于70%';
        unit._spiderTriggered70 = true;
    } else if (!unit._spiderTriggered40 && hpBefore > maxHp * 0.4 && hpAfter <= maxHp * 0.4) {
        reason = '血量即将低于40%';
        unit._spiderTriggered40 = true;
    } else if (!unit._spiderTriggeredDeath && hpAfter <= 0) {
        reason = '即将阵亡';
        unit._spiderTriggeredHit = true;
    }

    if (!reason) return false;

    unit._spiderRemaining = (unit._spiderRemaining || 3) - 1;
    unit._spiderFlying = true;
    unit._flyMode = 'spider';
    unit._spiderAttacked = unit._acted;
    emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _flyMode: 'spider', _spiderFlying: true });

    // 立即刷新 Store，确保格子瞬间消失
    const ctx = window._getPlayerContext?.();
    if (ctx && ctx.store) {
        const events = [...window._battleEvents];
        window._battleEvents = [];
        if (window.GlobalStore) window.GlobalStore.flushBattleEvents();
        if (events.length > 0) ctx.store.dispatch({ type: 'APPLY_EVENTS', events });
    }

    log.push({ type:'info', text:`<span class="gold">🕷️ 飞天：${unit.name} ${reason}，免疫本次攻击的 ${incomingDmg || 0} 点伤害，化为蜘蛛遁走！剩余次数：${unit._spiderRemaining}</span>` });
    return true;
}

export function spiderReturn(unit, allyTeam, enemySide, log) {
    if (!unit.isXiaoZhaoBrother || !unit._spiderFlying) return;

    unit._spiderFlying = false;
    unit._flyMode = null;
    unit._acted = false;

    const order = [4, 5, 6, 7, 8, 9, 1, 2, 3];
    const occupied = new Set(allyTeam.filter(a => a.alive && !a.isHorse && a.uid !== unit.uid).map(a => a.pos));
    for (const p of order) {
        if (!occupied.has(p)) { unit.pos = p; break; }
    }

    emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _flyMode: null, _spiderFlying: false });
    log.push({ type:'info', text:`<span class="gold">🕷️ 蛛落：${unit.name} 从天而降，落在${unit.pos}号位！</span>` });

    // 落地攻击随机敌人（攻击前再次确认目标存活）
    const aliveEnemies = enemySide.filter(u => u.alive);
    if (aliveEnemies.length > 0) {
        const target = aliveEnemies[rand(0, aliveEnemies.length - 1)];
        if (!target.alive) { log.push({ type:'info', text:`<span class="gray">🕷️ 蛛袭：目标已死亡，攻击取消</span>` }); return; }
        const penetrationDmg = Math.floor(unit.atk * (unit.atk / (unit.atk + target.def)));
        const masteryCount = unit._masteredRoles?.length || 0;
        const extraDmgMap = [0, 5, 10, 15, 30];
        const extraDmg = extraDmgMap[Math.min(masteryCount, 4)] || 0;
        const totalDmg = penetrationDmg + extraDmg;
        target.hp = Math.max(0, target.hp - totalDmg);
        unit.dmgDealt += totalDmg;
        target.dmgTaken += totalDmg;
        if (target.hp <= 0) { target.hp = 0; target.alive = false; target._isDead = true; if (!target._deathTime) target._deathTime = Date.now(); }
        emitEvent(target, 'hp-change', { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: target.def, _isDead: target._isDead || false });
        log.push({ type:'info', text:`<span class="gold">🕷️ 蛛袭：${unit.name} 落地攻击 ${target.name}，穿透${penetrationDmg} + 精通${extraDmg} = ${totalDmg} 伤害！</span>`, uidA: unit.uid, uidD: target.uid, isDead: !target.alive, isSpiderStrike: true });
    }
}

// ==================== 小昭共通 — 精通 + 永久海克斯 ====================

export function computeButterflyMastery(unit) {
    if (!unit.isXiaoZhaoBrother || !unit._masteredRoles) return { atk: 0, def: 0, hp: 0 };
    const count = unit._masteredRoles.length;
    const extra = count >= 4 ? 1 : 0;
    return {
        atk: (count + extra) * 1.5,
        def: (count + extra) * 2,
        hp: (count + extra) * 10
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

export function applyXiaoZhaoDerived(allyTeam, target, dmg, group) {
    const xiaoZhao = allyTeam.find(u => u.isXiaoZhaoSister && u.alive);
    if (!xiaoZhao || xiaoZhao._stunned) return;
    const zhang = allyTeam.find(u => u.isZhang && u.alive);
    if (zhang) return;
    const s = ES.xiaoZhao;
    if (!s) return;

    let reduce = Math.max(s.minReduce || 1, Math.floor(dmg * target.def / (s.defToReduce || 100)));
    target.hp = Math.min(target.maxHp, target.hp + reduce);
    target.dmgTaken -= reduce;

    const aliveAllies = allyTeam.filter(u => u.alive && !u.isHorse);
    if (aliveAllies.length > 0) {
        const healTarget = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
        let heal = Math.max(s.minHeal || 1, Math.floor(healTarget.def / (s.defToHeal || 5)));
        healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + heal);
        healTarget.healDone += heal;
        emitEvent(healTarget, 'hp-change', { hp: healTarget.hp, maxHp: healTarget.maxHp, alive: healTarget.alive, atk: healTarget.atk, def: healTarget.def });

        const atkTarget = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
        let atkGain = Math.max(s.minAtk || 1, Math.floor(atkTarget.def / (s.defToAtk || 10)));
        atkTarget.atk += atkGain;
        if (atkTarget._baseAtk !== undefined) atkTarget._baseAtk += atkGain;
        emitEvent(atkTarget, 'hp-change', { hp: atkTarget.hp, maxHp: atkTarget.maxHp, alive: atkTarget.alive, atk: atkTarget.atk, def: atkTarget.def });

        if (group && group.entries) {
            group.entries.push({
                type: 'info',
                text: `<span class="gold">🦋 乾坤衍生：${target.name}减伤${reduce}，${healTarget.name}治疗+${heal}，${atkTarget.name}攻击+${atkGain}</span>`,
                isHealEntry: true,
                healAmount: heal,
                healUnitUid: healTarget.uid
            });
        }
    }
}

// ==================== 成昆幻影 / 小昭惑心 / 连击 ====================

export function applyPhantomDisguise(unit, enemySide, allySide = null) {
    if (unit.camp !== 'ally') return null;
    const chengkun = enemySide.find(u => u.name === '成昆' && u.alive && u._phantomTarget);
    if (!chengkun || unit._isLinkAttack) return null;
    if (chengkun._phantomTarget === unit.uid) return null;
    const lostPct = (chengkun.maxHp - chengkun.hp) / chengkun.maxHp;
    const chance = ES.phantomDisguise.baseChance + Math.floor(lostPct * 10) * ES.phantomDisguise.per10pctLost;
    if (Math.random() < chance) {
        const fakeTarget = allySide ? allySide.find(u => u.uid === chengkun._phantomTarget && u.alive && !u.isHorse) : null;
        if (fakeTarget) {
            return { target: fakeTarget, log: `🎭 幻影伪装！${unit.name}被混乱，误攻队友${fakeTarget.name}！` };
        }
    }
    return null;
}

export function applyXiaoZhaoMindControl(unit, allySide, enemySide) {
    if (unit.camp !== 'enemy') return null;
    const xiaoZhao = enemySide.find(u => (u.isXiaoZhaoSister || u.isXiaoZhaoBrother) && u.alive);
    if (!xiaoZhao || !xiaoZhao._permanentBuffs || !xiaoZhao._permanentBuffs.some(b => b.key === 'mindControl')) return null;
    if (hasBuff(enemySide._activeBuffs, 'mindControl')) return null;
    if (Math.random() < 0.15) {
        const xzFakeTarget = allySide.find(u => u.uid !== unit.uid && u.alive && !u.isHorse);
        if (xzFakeTarget) {
            return { target: xzFakeTarget, log: `🦋 蝶舞迷心！${unit.name}被小昭迷惑，误攻队友${xzFakeTarget.name}！` };
        }
    }
    return null;
}

export function checkXiaoZhaoPermanentDoubleStrike(unit, activeBuffs) {
    if (!(unit.isXiaoZhaoSister || unit.isXiaoZhaoBrother) || !unit.alive || !unit._permanentBuffs) return false;
    if (!unit._permanentBuffs.some(b => b.key === 'doubleStrike')) return false;
    if (unit._xiaoZhaoDoubleStriked) return false;
    if (hasBuff(activeBuffs, 'doubleStrike')) return false;
    const chance = ES.xiaoZhaoDoubleStrike ? ES.xiaoZhaoDoubleStrike.chance * 100 : 80;
    return rand(1, 100) <= chance;
}

export function getXiaoZhaoHexEnhance(allyTeam, activeBuffs, hexKey) {
    const xiaoZhao = allyTeam.find(u => u.isXiaoZhaoSister && u.alive);
    if (!xiaoZhao) return null;
    if (!hasBuff(activeBuffs, hexKey)) return null;
    const s = ES.xiaoZhao;
    if (!s || !s.hexEnhance || !s.hexEnhance[hexKey]) return null;
    return s.hexEnhance[hexKey];
}

// 旧的 transformXiaoZhao 已删除，由 butterflyAttach（姐）和 spiderTransform（妹）替代