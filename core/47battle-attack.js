// core/47battle-attack.js - 光明顶5v5 攻击流程模块
// V5.2.0 | ~20000 bytes | 2026-07-18 拆分步骤至49battle-attack-steps
export const VER = 'core/47battle-attack.js V5.2.0';

import { CONFIG, DEF_TAUNT, HP_TAUNT } from './01config-5v5-test.js';
import { rand, calcDamage, getFangLevel, isMelee, getFronts, isBlocked, getFlyDodgeRate, getRandomTaunt, getZhangNearTaunt, makeFXSnapshot, hasBuff, getUnitCol, getUnitRow, hasAnyEnemyEmptyCol, getBloodAuraBonus } from './03battle-utils.js';
import { computeBuffStats, applyBuffEffectsBeforeAttack, applyBuffEffectsAfterAttack } from './04buff-system.js';
import { showDamageFloat } from '../fx/15fx-common-5v5-test.js';
import {
    checkExtinctionCounter, checkNineYinClaw, getRebelTarget, getRebelDmgBonus, getRebelTrueDmg,
    getPhantomThunderBonus, applyXuanmingPalm, getHornStrikeBonus,
    checkKuLian, applyXingFenGrant, applyXinHunDeduction, applyXingFenPenalty,
    applyXiaoZhaoDerived, applyDamageModifiers, isXiaoZhaoPermanentActive,
    applyPhantomDisguise, applyXiaoZhaoMindControl, checkXiaoZhaoPermanentDoubleStrike,
    canXingFenTrigger, consumeXingFen,
    butterflyAttach, spiderFlyCheck,
    getXiaoZhaoHexEnhance
} from '../modules/23elite-skills.js';
import {
    selectAttackTarget,
    resolveAttackHit,
    calcFinalDamage,
    applyAttackResult,
    buildAttackGroup
} from './49battle-attack-steps.js';

const C = CONFIG, DT = DEF_TAUNT, HT = HP_TAUNT;

function emitEvent(unit, eventType, payload) {
    if (typeof window._emitEvent === 'function') window._emitEvent(unit, eventType, payload);
}

// ==================== 攻击后效果钩子 ====================

/**
 * 远程成长 + 飞行闪避栈 + 嗜血狂刀额外砍
 */
function applyRoleGrowth(unit, target, dmgCalc, group, unitActiveBuffs, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid) {
    if (unit.role === '远程' && dmgCalc.dmg > 0) {
        unit.atk += 2;
        emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def });
        group.entries.push({type:'detail', text:`<span class="blue small">🏹 ${unit.name} 远程熟练：攻击 +2 → ${Math.floor(unit.atk)}</span>`});
    }
    if (unit.role === '飞行' && dmgCalc.dmg > 0) {
        if (!unit._dodgeStack) unit._dodgeStack = 0;
        unit._dodgeStack += 2;
    }
    if (unit.role === '战士' && hasBuff(unitActiveBuffs, 'bloodthirst') && dmgCalc.dmg > 0 && target.alive && getXiaoZhaoHexEnhance(allySide, unitActiveBuffs, 'bloodthirst') && !unit._bloodthirstStriked) {
        unit._bloodthirstStriked = true;
        processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, target.uid);
    }
}

/**
 * 张无忌：九阳回血 + 近战台词 + 融会贯通 + 乾坤反弹
 */
function applyZhangEffects(unit, target, dmgCalc, group, A, log) {
    if (unit.camp !== 'ally' || !unit.isZhang || !unit.alive) return;
    const hpBeforeZhang = Math.floor(unit.hp);
    let heal = Math.floor(unit.maxHp * 0.05);
    unit.hp = Math.min(unit.maxHp, unit.hp + heal);
    unit.healDone += heal;
    group.entries.push({type:'info', text:`<span class="green">☀️ 九阳神功回复+${heal}，${hpBeforeZhang}→${Math.floor(unit.hp)}</span>`, isHealEntry:true, healAmount:heal, healUnitUid:unit.uid});
    emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def });
    if (!unit.rangedForm) {
        if (unit.nearAtkCount === 0 && !unit._zhangTauntDone) {
            let firstTaunt = getZhangNearTaunt(1);
            if (firstTaunt) { group.entries.push({type:'info', text:`<span class="gold">🗣️ ${unit.name}：${firstTaunt}</span>`}); unit._zhangTauntDone = true; }
        }
        unit.nearAtkCount++;
        if (unit.nearAtkCount === 2) {
            let secondTaunt = getZhangNearTaunt(2);
            if (secondTaunt) group.entries.push({type:'info', text:`<span class="gold">🗣️ ${unit.name}：${secondTaunt}</span>`});
        }
        if (unit.nearAtkCount >= 3) unit.ronghui = true;
        if (unit.nearAtkCount >= 3) {
            let zt = getZhangNearTaunt(3); if (zt) group.entries.push({type:'info', text:`<span class="gold">🗣️ ${unit.name}：${zt}</span>`});
            let extra = Math.floor(target.atk * 0.15); target.hp -= extra; unit.dmgDealt += extra;
            if (target.hp <= 0) {
                target.hp = 0; target.alive = false; target._isDead = true;
                if (!target._deathTime) target._deathTime = Date.now();
                group.isDead = true; group.alive = false; group.hpAfter = 0;
            }
            emitEvent(target, 'hp-change', { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: target.def, _isDead: target._isDead || false });
            group.entries.push({type:'info', text:`<span class="red">🔥 融会贯通额外+${extra}（目标攻击${Math.floor(target.atk)}×15%）</span>`});
        }
    }

    // 乾坤大挪移反弹
    if (target.camp === 'ally' && (target.pos === 4 || target.pos === 6) && dmgCalc.dmg > 0) {
        let xiaoZhaoActive = A.find(u => u.isXiaoZhao && u.alive);
        if (!xiaoZhaoActive) {
            let zhang = A.find(c => c.isZhang && c.alive && c.rangedForm && !c._stunned);
            if (zhang) {
                let rebound = Math.floor(dmgCalc.dmg * (CONFIG.ELITE_SKILLS.xiaoZhao.normalReboundPct || 0.15));
                unit.hp = Math.max(0, unit.hp - rebound);
                unit.dmgTaken += rebound;
                zhang.reboundDone += rebound;
                showDamageFloat(unit, rebound);
                if (unit.hp <= 0) {
                    unit.alive = false; unit._isDead = true; unit._flash = 'dead';
                    if (!unit._deathTime) unit._deathTime = Date.now();
                }
                let selfDmg = Math.max(1, Math.floor(rebound * (CONFIG.ELITE_SKILLS.xiaoZhao.normalSelfDmgPct || 0.1)));
                zhang.hp -= selfDmg;
                zhang.dmgTaken += selfDmg;
                emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _isDead: unit._isDead || false });
                emitEvent(zhang, 'hp-change', { hp: zhang.hp, maxHp: zhang.maxHp, alive: zhang.alive, atk: zhang.atk, def: zhang.def });
                group.entries.push({type:'info', text:`<span class="gold">✨ 乾坤大挪移反弹${rebound}给${unit.name}（无忌自伤${selfDmg}）</span>`, buffType:'rebound'});
                if (unit.hp <= 0) { unit.alive = false; unit._isDead = true; }
                if (zhang.hp <= 0) { zhang.hp = 0; zhang.alive = false; zhang._isDead = true; if (!zhang._deathTime) zhang._deathTime = Date.now(); }
            }
        }
    }
}

/**
 * 小昭衍生 + 韦一笑吸血
 */
function applyAllyEffects(unit, target, dmgCalc, group, A) {
    if (target.camp === 'ally' && dmgCalc.dmg > 0) {
        applyXiaoZhaoDerived(A, target, dmgCalc.dmg, group);
    }
    if (unit.camp === 'ally' && unit.isWei && dmgCalc.dmg > 0) {
        let healWei = Math.floor(dmgCalc.dmg * 0.18);
        let wasFullHpWei = (unit.hp >= unit.maxHp);
        let newMaxHpWei = Math.min(unit.maxHp + healWei, unit._baseMaxHp * 2);
        let hpDeltaWei = newMaxHpWei - unit.maxHp;
        unit.maxHp = newMaxHpWei;
        unit._baseMaxHp = Math.max(unit._baseMaxHp, newMaxHpWei);
        unit.hp = Math.min(unit.hp + hpDeltaWei, unit.maxHp);
        if (wasFullHpWei) { unit.hp = unit.maxHp; }
        unit.healDone += healWei; unit.leechDone += healWei;
        emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def });
        group.entries.push({type:'info', text:`<span class="green">🦇 韦一笑吸血+${healWei}，上限→${Math.floor(unit.maxHp)}</span>`, isHealEntry:true, healAmount:healWei, healUnitUid:unit.uid});
    }
}

/**
 * 玄冥二老联动 + 概率连击 + 小昭永久连击 + 性奋额外攻击
 */
function applyExtraAttacks(unit, target, dmgCalc, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid) {
    // 玄冥二老联动
    if (!unit._isLinkAttack && dmgCalc.dmg > 0 && target.alive) {
        if (unit.name === '鹤笔翁') {
            const lu = allySide.find(u => u.name === '鹿杖客' && u.alive && !u._acted);
            if (!lu) {
                const luActed = allySide.find(u => u.name === '鹿杖客' && u.alive && u._acted);
                if (luActed && !luActed._linkTriggered) {
                    luActed._isLinkAttack = true;
                    luActed._linkTriggered = true;
                    log.push({type:'info', text:`<span class="gold">🔗 ${luActed.name} 跟随 ${unit.name} 发动联动攻击！</span>`});
                    processUnitAttack(luActed, allySide, enemySide, log, A, B, state, null, target.uid);
                    luActed._isLinkAttack = false;
                    luActed._acted = false;
                    emitEvent(luActed, 'hp-change', { hp: luActed.hp, maxHp: luActed.maxHp, alive: luActed.alive, atk: luActed.atk, def: luActed.def });
                }
            } else if (!lu._linkTriggered) {
                lu._isLinkAttack = true;
                lu._linkTriggered = true;
                log.push({type:'info', text:`<span class="gold">🔗 ${lu.name} 跟随 ${unit.name} 发动联动攻击！</span>`});
                processUnitAttack(lu, allySide, enemySide, log, A, B, state, null, target.uid);
                lu._isLinkAttack = false;
                lu._acted = false;
                emitEvent(lu, 'hp-change', { hp: lu.hp, maxHp: lu.maxHp, alive: lu.alive, atk: lu.atk, def: lu.def });
            }
        } else if (unit.name === '鹿杖客') {
            const he = allySide.find(u => u.name === '鹤笔翁' && u.alive && !u._acted);
            if (!he) {
                const heActed = allySide.find(u => u.name === '鹤笔翁' && u.alive && u._acted);
                if (heActed && !heActed._linkTriggered) {
                    heActed._isLinkAttack = true;
                    heActed._linkTriggered = true;
                    log.push({type:'info', text:`<span class="gold">🔗 ${heActed.name} 跟随 ${unit.name} 发动联动攻击！</span>`});
                    applyXuanmingPalm(unit, target);
                    processUnitAttack(heActed, allySide, enemySide, log, A, B, state, null, target.uid);
                    heActed._isLinkAttack = false;
                    heActed._acted = false;
                    emitEvent(heActed, 'hp-change', { hp: heActed.hp, maxHp: heActed.maxHp, alive: heActed.alive, atk: heActed.atk, def: heActed.def });
                }
            } else if (!he._linkTriggered) {
                he._isLinkAttack = true;
                he._linkTriggered = true;
                log.push({type:'info', text:`<span class="gold">🔗 ${he.name} 跟随 ${unit.name} 发动联动攻击！</span>`});
                applyXuanmingPalm(unit, target);
                processUnitAttack(he, allySide, enemySide, log, A, B, state, null, target.uid);
                he._isLinkAttack = false;
                he._acted = false;
                emitEvent(he, 'hp-change', { hp: he.hp, maxHp: he.maxHp, alive: he.alive, atk: he.atk, def: he.def });
            }
        }
    }

    // 概率连击
    if (doubleStrikeUnitUid && unit.uid === doubleStrikeUnitUid && unit.alive && unit.camp === 'ally' && !unit._doubleStriked) {
        if (rand(1,100) <= 80) {
            log.push({type:'info', text:`<span class="gold">⚡ 概率连击触发！</span>`, isDoubleStrikeBanner:true});
            unit._doubleStriked = true; unit._acted = false;
            const lockedTargetUid = (target && target.alive) ? target.uid : null;
            processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, lockedTargetUid);
        } else {
            log.push({type:'info', text:`<span class="gray">⚡ 概率连击触发失败，${unit.name} 未能再次攻击</span>`});
        }
    }

    // 小昭永久概率连击
    if (unit.isXiaoZhao && unit.alive && !unit._xiaoZhaoDoubleStriked && unit._permanentBuffs && unit._permanentBuffs.some(b => b.key === 'doubleStrike') && !hasBuff(A._activeBuffs, 'doubleStrike')) {
        const chance = (CONFIG.ELITE_SKILLS.xiaoZhaoDoubleStrike && CONFIG.ELITE_SKILLS.xiaoZhaoDoubleStrike.chance) ? CONFIG.ELITE_SKILLS.xiaoZhaoDoubleStrike.chance * 100 : 80;
        if (rand(1, 100) <= chance) {
            unit._xiaoZhaoDoubleStriked = true;
            unit._acted = false;
            log.push({type:'info', text:`<span class="gold">🦋 蝶击：小昭永久概率连击触发！</span>`, isDoubleStrikeBanner:true});
            const lockedTargetUid = (target && target.alive) ? target.uid : null;
            processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, lockedTargetUid);
        } else {
            log.push({type:'info', text:`<span class="gray">🦋 蝶击：小昭永久概率连击触发失败</span>`});
        }
    }

    // 性奋额外攻击
    if (canXingFenTrigger(unit) && enemySide.some(u => u.alive)) {
        consumeXingFen(unit);
        log.push({type:'info', text:`<span class="gold">💗 性奋：${unit.name} 获得额外攻击机会！</span>`});
        processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid);
    }
}

// ==================== 主攻击流程 ====================

export function processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, lockedTargetUid) {
    // 🦋 小昭·姊 蝶变附身：明教首个攻击者出手前触发
    if (unit.camp === 'ally' && A && !A._butterflyTriggered) {
        A._butterflyTriggered = true;
        const sister = A.find(u => u.isXiaoZhaoSister && u.alive && u.pos === 4 && !u._stunned);
        if (sister && !sister._butterflyHost) {
            butterflyAttach(sister, A, log);
            if (unit.uid === sister.uid) {
                unit._acted = true;
                return true;
            }
        }
    }

    // 步骤1：选择目标
    let target, phantomLog;
    if (lockedTargetUid) {
        target = enemySide.find(u => u.uid === lockedTargetUid && u.alive) || null;
        phantomLog = null;
        if (!target) {
            let emptyGroup = { type:'attack-group', uidA:unit.uid, uidD:null, entries:[], isMiss:true, _fxSnapshot:null, waveTaunt:null, waveUnit:null, buffEffects: [] };
            emptyGroup.entries.push({type:'combat-text', text:`<span class="${unit.camp==='ally'?'blue':'orange'}">${unit.camp==='ally'?'明教':'六大派'} ${unit.name}</span> 无法选择目标`});
            emptyGroup.entries.push({type:'info', text:`<span class="gray">锁定目标已阵亡，跳过行动</span>`});
            emptyGroup._events = [...window._battleEvents];
            window._battleEvents = [];
            if (window.GlobalStore) window.GlobalStore.flushBattleEvents();
            log.push(emptyGroup);
            unit._acted = true;
            return false;
        }
    } else {
        let targetResult = selectAttackTarget(unit, enemySide, allySide);
        target = targetResult.target;
        phantomLog = targetResult.phantomLog;

    }

    if (!target) {
        let emptyGroup = { type:'attack-group', uidA:unit.uid, uidD:null, entries:[], isMiss:true, _fxSnapshot:null, waveTaunt:null, waveUnit:null, buffEffects: [] };
        emptyGroup.entries.push({type:'combat-text', text:`<span class="${unit.camp==='ally'?'blue':'orange'}">${unit.camp==='ally'?'明教':'六大派'} ${unit.name}</span> 无法选择目标`});
        emptyGroup.entries.push({type:'info', text:`<span class="gray">无可选目标，跳过行动</span>`});
        emptyGroup._events = [...window._battleEvents];
        window._battleEvents = [];
        if (window.GlobalStore) window.GlobalStore.flushBattleEvents();
        log.push(emptyGroup);
        unit._acted = true;
        return false;
    }

    // 计算 Buff 加成
    let unitActiveBuffs = unit.camp === 'ally' ? A._activeBuffs : B._activeBuffs;
    let unitAllyTeam = unit.camp === 'ally' ? A : B;
    if (hasBuff(unitActiveBuffs, 'carry') && unit.camp === 'ally') {
        unitAllyTeam = unitAllyTeam.concat((state.allAllies || state.ally).filter(c => !c.alive));
        unitAllyTeam = unitAllyTeam.filter((u, i, arr) => arr.findIndex(v => v.uid === u.uid) === i);
    }
    let attackerBuffStats = computeBuffStats(unit, unitActiveBuffs, unitAllyTeam);
    unit.buffAtkBonus = attackerBuffStats.atkBonus;
    unit.buffDefBonus = attackerBuffStats.defBonus;
    unit.buffDodgeBonus = attackerBuffStats.dodgeBonus;
    unit.buffHpBonus = attackerBuffStats.hpBonus;

    let targetActiveBuffs = target.camp === 'ally' ? A._activeBuffs : B._activeBuffs;
    let targetAllyTeam = target.camp === 'ally' ? A : B;
    let defenderBuffStats = computeBuffStats(target, targetActiveBuffs, targetAllyTeam);
    target.buffAtkBonus = defenderBuffStats.atkBonus;
    target.buffDefBonus = defenderBuffStats.defBonus;
    target.buffDodgeBonus = defenderBuffStats.dodgeBonus;
    target.buffHpBonus = defenderBuffStats.hpBonus;

    // 攻击前清除成昆的模仿状态（恢复真身）
    if (unit.name === '成昆' && unit._phantomTarget) {
        delete unit._phantomTarget;
    }

    // 步骤2：未命中+闪避判定
    let hitResult = resolveAttackHit(unit, target, attackerBuffStats, defenderBuffStats, log, A, B, doubleStrikeUnitUid);
    if (hitResult.skipped) {
        if (hitResult.retry) {
            const retryUid = hitResult.lockedTargetUid || null;
            processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, retryUid);
        }
        return true;
    }

    // 步骤3：伤害计算
    let dmgCalc = calcFinalDamage(unit, target, attackerBuffStats, defenderBuffStats, allySide, enemySide, log);

    // 🐾 九阴白骨爪：提前触发，避免被飞天免疫拦截
    checkNineYinClaw(unit, target, dmgCalc.dmg, log);

    // 🕷️ 小昭·妹 飞天免疫伤害检查
    if (A && target.isXiaoZhaoBrother && target.alive && !target._spiderFlying && spiderFlyCheck(target, A, log, dmgCalc.dmg)) {
        let flyImmuneGroup = { type:'attack-group', uidA:unit.uid, uidD:target.uid, entries:[], hpAfter:target.hp, alive:target.alive, isDead:false, _fxSnapshot:makeFXSnapshot(unit,target), _dmg:0, waveTaunt:null, waveUnit:null, buffEffects:[], _events:[] };
        flyImmuneGroup.entries.push({type:'combat-text', text:`<span class="${unit.camp==='ally'?'blue':'orange'}">${unit.camp==='ally'?'明教':'六大派'} ${unit.name}</span> 的攻击被免疫`});
        flyImmuneGroup.entries.push({type:'info', text:`<span class="gold">🕷️ 飞天：${target.name} 免疫本次攻击的 ${dmgCalc.dmg} 点伤害！</span>`});
        flyImmuneGroup._events = [...window._battleEvents]; window._battleEvents = [];
        if (window.GlobalStore) window.GlobalStore.flushBattleEvents();
        log.push(flyImmuneGroup);
        unit._acted = true;
        applyXinHunDeduction(unit, allySide, log);
        applyXingFenPenalty(unit, log);
        return true;
    }

    // 步骤4：应用伤害结果
    let dmgResult = applyAttackResult(unit, target, dmgCalc, attackerBuffStats, defenderBuffStats, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid);

    // 步骤5：构建攻击组日志
    let group = buildAttackGroup(unit, target, dmgCalc, dmgResult, attackerBuffStats, defenderBuffStats, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, phantomLog);

    // ★ 攻击后效果（钩子化）
    applyRoleGrowth(unit, target, dmgCalc, group, unitActiveBuffs, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid);
    applyZhangEffects(unit, target, dmgCalc, group, A, log);
    applyAllyEffects(unit, target, dmgCalc, group, A);
    if (!unit._isLinkAttack) unit._acted = true;
    applyXinHunDeduction(unit, allySide, log);
    applyXingFenPenalty(unit, log);
    applyExtraAttacks(unit, target, dmgCalc, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid);

    // 空列检测 + 残血光环：每次行动后重新判定
    const allUnits = A.concat(B);
    const allyFlyers = A.filter(u => u.role === '飞行' && u.alive && !u.isHorse);
    const enemyFlyers = B.filter(u => u.role === '飞行' && u.alive && !u.isHorse);
    const allyHasEmpty = hasAnyEnemyEmptyCol(B);
    const enemyHasEmpty = hasAnyEnemyEmptyCol(A);
    const bloodAuraBonus = getBloodAuraBonus(allUnits);
    if (allyHasEmpty) {
        log.push({ type:'info', text:`<span class="gold">🔍 空列检测：敌方有空列，己方飞行单位+5攻击</span>`, fastEntry: true });
    }
    if (enemyHasEmpty) {
        log.push({ type:'info', text:`<span class="gold">🔍 空列检测：己方有空列，敌方飞行单位+5攻击</span>`, fastEntry: true });
    }
    if (bloodAuraBonus > 0) {
        log.push({ type:'info', text:`<span class="gold">🩸 残血光环：全场低血量单位触发了+${bloodAuraBonus}攻击加成</span>`, fastEntry: true });
    }
    allyFlyers.forEach(u => {
        const prevColBonus = u._emptyColBonus || 0;
        const newColBonus = allyHasEmpty ? 5 : 0;
        if (prevColBonus !== newColBonus) {
            u.atk += newColBonus - prevColBonus;
            u._emptyColBonus = newColBonus;
            emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def });
        }
        const prevBloodBonus = u._bloodAuraBonus || 0;
        if (prevBloodBonus !== bloodAuraBonus) {
            u.atk += bloodAuraBonus - prevBloodBonus;
            u._bloodAuraBonus = bloodAuraBonus;
            emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def });
        }
    });
    enemyFlyers.forEach(u => {
        const prevColBonus = u._emptyColBonus || 0;
        const newColBonus = enemyHasEmpty ? 5 : 0;
        if (prevColBonus !== newColBonus) {
            u.atk += newColBonus - prevColBonus;
            u._emptyColBonus = newColBonus;
            emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def });
        }
        const prevBloodBonus = u._bloodAuraBonus || 0;
        if (prevBloodBonus !== bloodAuraBonus) {
            u.atk += bloodAuraBonus - prevBloodBonus;
            u._bloodAuraBonus = bloodAuraBonus;
            emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def });
        }
    });

    return true;
}