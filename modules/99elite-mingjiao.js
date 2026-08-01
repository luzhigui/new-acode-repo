// modules/99elite-mingjiao.js - 明教精英组件合集
// V5.3.1 | ~17900 bytes| 2026-07-28 合并张无忌/韦一笑/小昭姐/小昭妹
export const VER = 'modules/99elite-mingjiao.js V5.3.1';

import { CONFIG } from '../core/01config-5v5-test.js';
import { ROLE_BONUS } from '../core/02unit.js';
import { rand, hasBuff } from '../core/03battle-utils.js';
import { checkZhangSwitch, emitEvent } from '../core/50battle-shared.js';
const ES = CONFIG.ELITE_SKILLS;
function getZhangNearTaunt(nearAtkCount) {
    const ZHANG_NEAR_TAUNT = ['还好，还记得七七八八。', '糟糕，只记得一两层了。', '不好，全忘光了！'];
    if (nearAtkCount >= 1 && nearAtkCount <= 3) return ZHANG_NEAR_TAUNT[nearAtkCount - 1];
    return null;
}

// ==================== 张无忌 ====================
export function createZhangWujiComponent() {
    return {
        name: '张无忌',
        register(eventBus, A, B, log) {
            const zhang = A.find(u => u.isZhang && u.alive);
            if (!zhang) return;
            const onAfterApplyDamage = this.onAfterApplyDamage;
            // 九阳回血
            eventBus.on('afterDamageApplied', 40, (data) => {
                if (data.unit.uid !== zhang.uid) return;
                onAfterApplyDamage(data.unit, data.target, { dmg: data.dmg }, data.group, A, data.log);
            });
            // 乾坤大挪移反弹
            eventBus.on('allyDamaged', 40, (data) => {
                if (!zhang || !zhang.alive || !zhang.rangedForm || zhang._stunned) return;
                const { attacker, target, dmg } = data;
                if (target.camp !== 'ally' || (target.pos !== 4 && target.pos !== 6) || dmg <= 0) return;
                const xiaoZhaoActive = A.find(u => u.isXiaoZhao && u.alive);
                if (xiaoZhaoActive) return;
                const rebound = Math.floor(dmg * (CONFIG.ELITE_SKILLS.xiaoZhao.normalReboundPct || 0.15));
                attacker.hp = Math.max(0, attacker.hp - rebound);
                attacker.dmgTaken += rebound;
                zhang.reboundDone += rebound;
                let selfDmg = Math.max(1, Math.floor(rebound * (CONFIG.ELITE_SKILLS.xiaoZhao.normalSelfDmgPct || 0.1)));
                zhang.hp -= selfDmg;
                zhang.dmgTaken += selfDmg;
                emitEvent(attacker, 'hp-change', { hp: attacker.hp, maxHp: attacker.maxHp, alive: attacker.alive, atk: attacker.atk, def: attacker.def, _isDead: attacker._isDead || false });
                emitEvent(zhang, 'hp-change', { hp: zhang.hp, maxHp: zhang.maxHp, alive: zhang.alive, atk: zhang.atk, def: zhang.def });
                data.log.push({type:'info', text:`<span class="gold">✨ 乾坤大挪移反弹${rebound}给${attacker.name}（无忌自伤${selfDmg}）</span>`});
                if (attacker.hp <= 0) { attacker.alive = false; attacker._isDead = true; }
                if (zhang.hp <= 0) { zhang.hp = 0; zhang.alive = false; zhang._isDead = true; if (!zhang._deathTime) zhang._deathTime = Date.now(); }
            });
        },
        onAfterApplyDamage(unit, target, dmgCalc, group, A, log) {
            if (unit.camp !== 'ally' || !unit.isZhang || !unit.alive) return;
            const hpBeforeZhang = Math.floor(unit.hp);
            const heal = Math.floor(unit.maxHp * 0.08);
            unit.hp = Math.min(unit.maxHp, unit.hp + heal);
            unit.healDone += heal;
            group.entries.push({ type:'info', text:`<span class="green">☀️ 九阳神功回复+${heal}，${hpBeforeZhang}→${Math.floor(unit.hp)}</span>`, isHealEntry:true, healAmount:heal, healUnitUid:unit.uid });
            emitEvent(unit, 'hp-change', { hp:unit.hp, maxHp:unit.maxHp, alive:unit.alive, atk:unit.atk, def:unit.def });
            if (!unit.rangedForm) {
                if (unit.nearAtkCount === 0 && !unit._zhangTauntDone) { const firstTaunt = getZhangNearTaunt(1); if (firstTaunt) { group.entries.push({ type:'info', text:`<span class="gold">🗣️ ${unit.name}：${firstTaunt}</span>` }); unit._zhangTauntDone = true; } }
                unit.nearAtkCount++;
                if (unit.nearAtkCount === 2) { const secondTaunt = getZhangNearTaunt(2); if (secondTaunt) group.entries.push({ type:'info', text:`<span class="gold">🗣️ ${unit.name}：${secondTaunt}</span>` }); }
                if (unit.nearAtkCount >= 3) {
                    unit.ronghui = true;
                    const zt = getZhangNearTaunt(3); if (zt) group.entries.push({ type:'info', text:`<span class="gold">🗣️ ${unit.name}：${zt}</span>` });
                    const extra = Math.floor(Math.abs(target.atk - target.def) * 0.5);
                    target.hp -= extra; unit.dmgDealt += extra;
                    if (target.hp <= 0) { target.hp = 0; target.alive = false; target._isDead = true; if (!target._deathTime) target._deathTime = Date.now(); group.isDead = true; group.alive = false; group.hpAfter = 0; }
                    emitEvent(target, 'hp-change', { hp:target.hp, maxHp:target.maxHp, alive:target.alive, atk:target.atk, def:target.def, _isDead:target._isDead||false });
                    group.entries.push({ type:'info', text:`<span class="red">🔥 融会贯通额外+${extra}（目标攻击${Math.floor(target.atk)} 防御${Math.floor(target.def)}，差值绝对值×50%）</span>` });
                }
            }
        }
    };
}

// ==================== 韦一笑 ====================
export function createWeiYixiaoComponent() {
    return {
        name: '韦一笑',
        register(eventBus, A, B, log) {
            const wei = A.find(u => u.isWei && u.alive);
            if (!wei) return;
            const onAfterApplyDamage = this.onAfterApplyDamage;
            eventBus.on('afterDamageApplied', 40, (data) => {
                if (data.unit.uid !== wei.uid) return;
                onAfterApplyDamage(data.unit, data.target, { dmg: data.dmg }, data.group, A, data.log);
            });
        },
        onAfterApplyDamage(unit, target, dmgCalc, group, A, log) {
            if (unit.camp !== 'ally' || !unit.isWei || !unit.alive || dmgCalc.dmg <= 0) return;
            const lostPct = (unit.maxHp - unit.hp) / unit.maxHp;
            const leechRate = 0.20 + (0.40 - 0.20) * lostPct;
            const healWei = Math.floor(dmgCalc.dmg * leechRate);
            const wasFullHpWei = (unit.hp >= unit.maxHp);
            const newMaxHpWei = Math.min(unit.maxHp + healWei, unit._baseMaxHp * 2);
            const hpDeltaWei = newMaxHpWei - unit.maxHp;
            unit.maxHp = newMaxHpWei; unit._baseMaxHp = Math.max(unit._baseMaxHp, newMaxHpWei);
            unit.hp = Math.min(unit.hp + hpDeltaWei, unit.maxHp);
            if (wasFullHpWei) { unit.hp = unit.maxHp; }
            unit.healDone += healWei; unit.leechDone += healWei;
            emitEvent(unit, 'hp-change', { hp:unit.hp, maxHp:unit.maxHp, alive:unit.alive, atk:unit.atk, def:unit.def });
            group.entries.push({ type:'info', text:`<span class="green">🦇 青翼蝠王·吸血+${healWei}，上限→${Math.floor(unit.maxHp)}</span>`, isHealEntry:true, healAmount:healWei, healUnitUid:unit.uid });
        }
    };
}

// ==================== 小昭·姊 ====================
export function createXiaoZhaoSisterComponent() {
    return {
        name: '小昭·姊',
        register(eventBus, A, B, log) {
            const sister = A.find(u => u.isXiaoZhaoSister && u.alive && !u._stunned);
            if (!sister) return;
            const comp = this;
            eventBus.on('allyDamaged', 50, (data) => {
                const xiaoZhao = A.find(u => u.isXiaoZhaoSister && u.alive && !u._stunned);
                if (!xiaoZhao) return;
                const zhang = A.find(u => u.isZhang && u.alive);
                if (zhang) return;
                comp.onAllyDamaged(data.target, data.dmg, A, data.log);
            });
        },
        onBeforeFirstAttack(A, log) {
            const sister = A.find(u => u.isXiaoZhaoSister && u.alive && u.pos === 4 && !u._stunned);
            if (!sister || sister._butterflyHost) return null;
            const order = [5,6,7,8,9,1,2,3]; let host = null;
            for (const p of order) { const u = A.find(a => a.pos === p && a.alive && !a.isHorse && a.uid !== sister.uid); if (u) { host = u; break; } }
            if (!host) { sister.hp = 0; sister.alive = false; sister._isDead = true; if (!sister._deathTime) sister._deathTime = Date.now(); emitEvent(sister, 'hp-change', { hp:0, maxHp:sister.maxHp, alive:false, atk:sister.atk, def:sister.def, _isDead:true }); log.push({ type:'info', text:`<span class="red">🦋 蝶变：${sister.name} 无队友可附身，香消玉殒！</span>` }); return null; }
            const atkTransfer = Math.floor(sister._baseAtk/3);
            const defTransfer = Math.floor(sister._baseDef/3);
            const hpTransfer = Math.floor(sister.hp/3);
            sister._butterflyHpTransfer = hpTransfer;
            sister._butterflyHpTransfer = hpTransfer;
            host._butterflyAtkBonus += atkTransfer; host._butterflyDefBonus += defTransfer;
            host.atk += atkTransfer; host.def += defTransfer; host.maxHp += hpTransfer; host.hp = Math.min(host.maxHp, host.hp + hpTransfer);
            emitEvent(host, 'hp-change', { hp:host.hp, maxHp:host.maxHp, alive:host.alive, atk:host.atk, def:host.def, _phantomTarget:sister.uid });
            const aliveAllies = A.filter(a => a.alive && !a.isHorse && a.uid !== sister.uid);
            const totalHp = aliveAllies.reduce((sum,a) => sum + a.hp, 0); const totalMaxHp = aliveAllies.reduce((sum,a) => sum + a.maxHp, 0);
            if (totalMaxHp > 0) { sister.hp = Math.floor(sister.maxHp * (totalHp/totalMaxHp)); }
            sister._butterflyHost = host.uid; sister._flyMode = 'butterfly'; sister._untargetable = true;
            emitEvent(sister, 'hp-change', { hp:sister.hp, maxHp:sister.maxHp, alive:sister.alive, atk:sister.atk, def:sister.def, _flyMode:'butterfly', _butterflyHost:sister._butterflyHost });
            log.push({ type:'info', text:`<span class="gold">🦋 蝶变：${sister.name} 化为蝴蝶附身于 ${host.name}！攻+${atkTransfer} 防+${defTransfer} 血上限+${hpTransfer}</span>` });
            return sister;
        },
        onAllyDamaged(target, dmg, allyTeam, log) {
            const sister = allyTeam.find(u => u.isXiaoZhaoSister && u.alive && !u._stunned);
            if (!sister) return; const zhang = allyTeam.find(u => u.isZhang && u.alive); if (zhang) return;
            const s = ES.xiaoZhao; if (!s) return;
            let reduce = Math.max(s.minReduce||1, Math.floor(dmg * target.def / (s.defToReduce||100)));
            target.hp = Math.min(target.maxHp, target.hp + reduce); target.dmgTaken -= reduce;
            const aliveAllies = allyTeam.filter(u => u.alive && !u.isHorse);
            if (aliveAllies.length > 0) {
                const healTarget = aliveAllies[Math.floor(Math.random()*aliveAllies.length)];
                let heal = Math.max(s.minHeal||1, Math.floor(healTarget.def/(s.defToHeal||5)));
                healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + heal); healTarget.healDone += heal;
                emitEvent(healTarget, 'hp-change', { hp:healTarget.hp, maxHp:healTarget.maxHp, alive:healTarget.alive, atk:healTarget.atk, def:healTarget.def });
                const atkTarget = aliveAllies[Math.floor(Math.random()*aliveAllies.length)];
                let atkGain = Math.max(s.minAtk||1, Math.floor(atkTarget.def/(s.defToAtk||10)));
                atkTarget.atk += atkGain; if (atkTarget._baseAtk !== undefined) atkTarget._baseAtk += atkGain;
                emitEvent(atkTarget, 'hp-change', { hp:atkTarget.hp, maxHp:atkTarget.maxHp, alive:atkTarget.alive, atk:atkTarget.atk, def:atkTarget.def });
                if (log) { log.push({ type:'info', text:`<span class="gold">🦋 乾坤衍生：${target.name}减伤${reduce}，${healTarget.name}治疗+${heal}，${atkTarget.name}攻击+${atkGain}</span>`, isHealEntry:true, healAmount:heal, healUnitUid:healTarget.uid }); }
            }
        }
    };
}

// ==================== 小昭·妹 ====================
export function createXiaoZhaoBrotherComponent() {
    return {
        name: '小昭·妹',
        register(eventBus, A, B, log) {
            const brother = A.find(u => u.isXiaoZhaoBrother && u.alive);
            if (!brother) return;
            const onBeforeDeath = this.onBeforeDeath;
            eventBus.on('beforeDamageApply', 100, (data) => {
                if (data.target.uid !== brother.uid || !data.A) return;
                const immune = onBeforeDeath(data.target, data.dmg, data.A, data.log);
                if (immune) data.result.immune = true;
            });
            // 永久概率连击
            eventBus.on('afterMiss', 60, (data) => {
                const { unit, target, log } = data;
                if (!unit.isXiaoZhaoBrother || !unit.alive || unit._xiaoZhaoDoubleStriked) return;
                if (!unit._permanentBuffs || !unit._permanentBuffs.some(b => b.key === 'doubleStrike')) return;
                if (hasBuff(A._activeBuffs, 'doubleStrike')) return;
                const chance = (CONFIG.ELITE_SKILLS.xiaoZhaoDoubleStrike && CONFIG.ELITE_SKILLS.xiaoZhaoDoubleStrike.chance) ? CONFIG.ELITE_SKILLS.xiaoZhaoDoubleStrike.chance * 100 : 80;
                if (rand(1, 100) <= chance) {
                    unit._xiaoZhaoDoubleStriked = true;
                    unit._acted = false;
                    log.push({type:'info', text:`<span class="gold">🦋 蝶击：小昭永久概率连击触发！</span>`, isDoubleStrikeBanner:true});
                    data.retry = true;
                    data.retryTargetUid = (target && target.alive) ? target.uid : null;
                }
            });
        },
        onBeforeDeath(unit, incomingDmg, A, log) {
            if (!unit.isXiaoZhaoBrother || !unit.alive || unit._spiderFlying || unit._flyMode === 'spider') return false;
            const hpBefore = unit.hp; const hpAfter = incomingDmg !== undefined ? hpBefore - incomingDmg : hpBefore;
            const maxHp = unit.maxHp; let reason = '';
            // 先标记所有已触发的阈值
            if (!unit._spiderTriggered70 && hpBefore > maxHp*0.7 && hpAfter <= maxHp*0.7) { unit._spiderTriggered70 = true; if (!reason) reason = '血量即将低于70%'; }
            if (!unit._spiderTriggered40 && hpBefore <= maxHp*0.7 && hpBefore > maxHp*0.4 && hpAfter <= maxHp*0.4) { unit._spiderTriggered40 = true; if (!reason) reason = '血量即将低于40%'; }
            if (!unit._spiderTriggeredDeath && hpAfter <= 0) { unit._spiderTriggeredHit = true; if (!reason) reason = '即将阵亡'; }
            if (!reason) return false;
            unit._spiderRemaining = (unit._spiderRemaining||3)-1; unit._spiderFlying = true; unit._flyMode = 'spider'; unit._spiderAttacked = unit._acted;
            emitEvent(unit, 'hp-change', { hp:unit.hp, maxHp:unit.maxHp, alive:unit.alive, atk:unit.atk, def:unit.def, _flyMode:'spider', _spiderFlying:true });
            log.push({ type:'info', text:`<span class="gold">🕷️ 飞天：${unit.name} ${reason}，免疫本次攻击的 ${incomingDmg||0} 点伤害，化为蜘蛛遁走！剩余次数：${unit._spiderRemaining}</span>` });
            return true;
        },
        onAfterApplyDamage(unit) {
            if (!unit.isXiaoZhaoBrother || !unit.alive) return;
        }
    };
}

// ==================== 姐姐蝶变飞回 ====================
export function butterflyReturn(sister, allyTeam, log) {
    if (!sister._butterflyHost) return;
    const host = allyTeam.find(u => u.uid === sister._butterflyHost);
    
    // 宿主已死，直接恢复姐姐本体，不转移属性
    if (!host || !host.alive) {
        sister._flyMode = null; sister._untargetable = false;
        sister._butterflyHost = null;
        sister._butterflyAtk = 0;
        sister._butterflyDef = 0;
        sister._butterflyHp = 0;
        sister._butterflyHpTransfer = 0;
        emitEvent(sister, 'hp-change', {
            hp: sister.hp, maxHp: sister.maxHp, alive: sister.alive,
            atk: sister.atk, def: sister.def, _flyMode: null, _butterflyHost: null
        });
        log.push({
            type: 'info',
            text: `<span class="gold">🦋 蝶变：宿主已阵亡，${sister.name} 被迫返回！</span>`
        });
        return;
    }
    
    // 计算姐姐血量：按所有队友（含阵亡）的总血量 / 总血上限比例，死亡队友计为 0 血
    const allAllies = allyTeam.filter(a => !a.isHorse && a.uid !== sister.uid);
    const totalHp = allAllies.reduce((sum, a) => sum + (a.alive ? a.hp : 0), 0);
    const totalMaxHp = allAllies.reduce((sum, a) => sum + a.maxHp, 0);
    if (totalMaxHp > 0) {
        sister.hp = Math.floor(sister.maxHp * (totalHp / totalMaxHp));
    } else {
        sister.hp = 0;
        sister.alive = false;
        sister._isDead = true;
        if (!sister._deathTime) sister._deathTime = Date.now();
    }
    
    // 恢复姐姐的攻防（基于基础值，不保留 Buff，下回合重新计算）
    sister.atk = sister._baseAtk;
    sister.def = sister._baseDef;
    sister._flyMode = null; sister._untargetable = false;
    
    // 移除宿主身上的附身加成
    if (host && host.alive) {
        host.atk = Math.max(0, host.atk - (host._butterflyAtkBonus || 0));
        host.def = Math.max(0, host.def - (host._butterflyDefBonus || 0));
        host._butterflyAtkBonus = 0;
        host._butterflyDefBonus = 0;
        const hpTransfer = sister._butterflyHpTransfer || 0;
        const oldHostMaxHp = host.maxHp;
        host.maxHp = Math.max(1, host.maxHp - hpTransfer);
        host.hp = Math.floor(host.hp * (host.maxHp / oldHostMaxHp));
        emitEvent(host, 'hp-change', {
            hp: host.hp, maxHp: host.maxHp, alive: host.alive,
            atk: host.atk, def: host.def
        });
    }
    
    // 清理附身状态
    sister._butterflyHost = null;
    sister._butterflyAtk = 0;
    sister._butterflyDef = 0;
    sister._butterflyHp = 0;
    sister._butterflyHpTransfer = 0;

    // 确保姐姐在队伍数组中
    if (!allyTeam.find(a => a.uid === sister.uid)) {
        allyTeam.push(sister);
    }
    
    emitEvent(sister, 'hp-change', {
        hp: sister.hp, maxHp: sister.maxHp, alive: sister.alive,
        atk: sister.atk, def: sister.def, _flyMode: null, _butterflyHost: null
    });
    
    log.push({
        type: 'info',
        text: `<span class="gold">🦋 蝶变：${sister.name} 从 ${host ? host.name : '宿主'} 飞回，恢复原形！攻 ${sister.atk} 防 ${sister.def} 血 ${sister.hp}</span>`
    });
}