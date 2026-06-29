// core/06battle-engine-core.js - 光明顶5v5 战斗核心循环
// V4.0.0 | ~24800 bytes | 2026-06-29 09:29
export const VER = 'core/06battle-engine-core.js V4.0.0';

import { CONFIG, DEF_TAUNT, HP_TAUNT } from './01config-5v5-test.js';
import { rand, calcDamage, getFangLevel, isMelee, getFronts, isBlocked, getFlyDodgeRate, getRandomTaunt, getZhangNearTaunt, makeFXSnapshot, hasBuff } from './03battle-utils.js';
import { computeBuffStats, applyBuffEffectsBeforeAttack, applyBuffEffectsAfterAttack, logBuffSummary } from './04buff-system.js';
import { spawnHorse, destroyHorse } from './05battle-horse.js';
import { Unit } from './02unit.js';
import {
    checkExtinctionCounter, checkNineYinClaw, getRebelTarget, getRebelDmgBonus, getRebelTrueDmg,
    getPhantomThunderBonus, applyXuanmingPalm, tickXuanmingPoison, getHornStrikeBonus,
    checkKuLian, applyXingFenGrant, applyXinHunDeduction, tickKuaiLeHeal, canXingFenTrigger, consumeXingFen
} from '../modules/23elite-skills.js';
const C = CONFIG, DT = DEF_TAUNT, HT = HP_TAUNT;

export function runBattleRound(state) {
    let A = state.ally.filter(u => u.alive).map(u => u.clone());
    let B = state.enemy.filter(u => u.alive).map(u => u.clone());
    let log = [];
    let round = state.round;
    
    A._activeBuffs = state.activeBuffs.filter(b => b.target === 'ally' || !b.target);
    B._activeBuffs = state.activeBuffs.filter(b => b.target === 'enemy');
    
    log.push({ type:'round-start', text:`<div class="separator">———— 第${round}回合开始 ————</div>` });
    
    // ===== V3.1.0 快乐回血+降级（所有存活单位） =====
    tickKuaiLeHeal(A.concat(B), log);
    
    // 玄冥神掌每回合毒发
    A.concat(B).forEach(u => {
        if (!u.alive) return;
        const dot = tickXuanmingPoison(u);
        if (dot > 0) {
            log.push({ type:'info', text:`<span class="purple">❄️ 玄冥神掌寒毒发作，${u.name} 受到 ${dot} 点伤害</span>` });
        }
    });
    
    spawnHorse(A, log);
    spawnHorse(B, log);
    
    // ===== V3.1.0 性奋授予（每回合开始） =====
    applyXingFenGrant(B, log);  // 周芷若给宋青书性奋，均在敌方队伍
    
    let doubleStrikeUnitUid = null;
    if (hasBuff(A._activeBuffs, 'doubleStrike')) {
        let candidates = A.filter(u => u.alive && !u.isHorse);
        if (candidates.length > 0) {
            let chosen = candidates[rand(0, candidates.length - 1)];
            doubleStrikeUnitUid = chosen.uid;
        }
    }
    
    window._currentBattleState = { ally: state.ally, enemy: state.enemy };
    logBuffSummary(A, log, doubleStrikeUnitUid);
    
    A.forEach(u => {
        if (!u.alive) return;
        let allyTeamWithDead = A.filter(c => c.alive);
        if (hasBuff(A._activeBuffs, 'carry')) {
            allyTeamWithDead = allyTeamWithDead.concat(state.ally.filter(c => !c.alive));
allyTeamWithDead = allyTeamWithDead.filter((u, i, arr) => arr.findIndex(v => v.uid === u.uid) === i);
        }
        let stats = computeBuffStats(u, A._activeBuffs || [], allyTeamWithDead);
        u.buffAtkBonus = stats.atkBonus;
        u.buffDefBonus = stats.defBonus;
        u.buffDodgeBonus = stats.dodgeBonus;
        u.buffHpBonus = stats.hpBonus;
        if (hasBuff(A._activeBuffs, 'carry') && u.pos === 5 && u._baseMaxHp !== undefined) {
            let oldMaxHp = u.maxHp, oldHp = u.hp;
            let extraHp = Math.floor(u._baseMaxHp * stats.hpBonus);
            let newMaxHp = u._baseMaxHp + extraHp;
            if (newMaxHp > oldMaxHp) { u.maxHp = newMaxHp; u.hp = Math.min(u.maxHp, u.hp + (newMaxHp - oldMaxHp)); }
            else if (newMaxHp < oldMaxHp && oldMaxHp > 0) { u.maxHp = newMaxHp; u.hp = Math.floor(u.hp * (newMaxHp / oldMaxHp)); }
        }
        u._extinctionUsed = false;
        u._acted = false;
    });
    B.forEach(u => { u._extinctionUsed = false; u._acted = false; });
    
    // ===== V3.1.0 苦练优先行动 =====
    const kuLianUnit = checkKuLian(B);
    if (kuLianUnit) {
        kuLianUnit._kuLianActive = true;
        log.push({ type:'info', text:`<span class="gold">🏋️ 苦练：${kuLianUnit.name} 每回合最先行动！</span>` });
        processUnitAttack(kuLianUnit, B, A, log);
        kuLianUnit._acted = true; // 不参与后续正常轮次
    }
    
    let currentSide = 'enemy';
    
    function getNextAvailableUnit(team) {
        return team.filter(c => c.alive && !c._acted).sort((a, b) => a.pos - b.pos)[0] || null;
    }

    function checkZhangSwitch() {
        let zhang = A.find(c => c.isZhang && c.alive && !c._zhangSwitched);
        if (!zhang) return;
        let col = (zhang.pos - 1) % 3;
        let hasFrontAlly = A.some(c => c.alive && !c.isHorse && c.pos === 1 + col && c.uid !== zhang.uid);
        if (!hasFrontAlly) {
            zhang.rangedForm = false; zhang.atk += 3; zhang.def += 2; zhang.maxHp += 50;
            zhang.hp = Math.min(zhang.hp + 50, zhang.maxHp); zhang.role = '战士';
            zhang._blocked = false; zhang._resting = false; zhang._zhangSwitched = true;
            zhang._baseMaxHp = zhang.maxHp;
            log.push({ type:'info', text:`<span class="gold">⚔️ 张无忌切换近战形态！攻+3、防+2、生命上限+50</span>`, isZhangSwitch:true, unit: zhang });
            log.push({ type:'info', text:`<span class="gold">🗣️ 张无忌：不好，要顶上去了！</span>`, isZhangTaunt:true });
        }
    }

    function selectTarget(unit, enemySide) {
        let targets = enemySide.filter(c => c.alive);
        if (targets.length === 0) return null;
        let target = null;
        const rebelTarget = getRebelTarget(unit, enemySide);
        if (rebelTarget) {
            target = rebelTarget;
        } else if (unit.isWei) {
            target = targets.reduce((a,b) => a.hp < b.hp ? a : b);
        } else if (isMelee(unit.role) || unit.isHorse) {
            let fronts = getFronts(targets);
            if (fronts.length === 0) return null;
            target = fronts[rand(0, fronts.length - 1)];
        } else {
            target = targets[rand(0, targets.length - 1)];
        }
        return target;
    }

    function resolveDodge(unit, target, attackerBuffStats) {
        if (!target.alive || (!target.isWei && target._acted)) return false;
        let baseDodge = getFlyDodgeRate(target, unit);
        let buffDodge = attackerBuffStats.dodgeBonus;
        if (baseDodge + buffDodge <= 0) return false;
        let finalHit = (1 - baseDodge) * (1 - buffDodge);
        let totalDodge = 1 - finalHit;
        if (rand(1,100) > totalDodge * 100) return false;
        target.dodgeCount++;
        let reboundDmg = Math.floor((target.atk + target.def) * 0.5);
        let unitHpBeforeRebound = Math.floor(unit.hp);
        unit.hp -= reboundDmg; target.dmgDealt += reboundDmg; unit.dmgTaken += reboundDmg;
        let dg = {type:'attack-group', uidA:unit.uid, uidD:target.uid, entries:[], isDodge:true, hpAfter:target.hp, alive:target.alive, _fxSnapshot:makeFXSnapshot(unit,target), waveTaunt:null, waveUnit:null, buffEffects:[], _atkBonus:0, _defBonus:0};
        if (target.isWei) {
            let heal = Math.floor(reboundDmg * 0.15);
            target.maxHp += heal;
            target.hp = Math.min(target.hp + heal, target.maxHp);
            target.healDone += heal;
            target.leechDone += heal;
            dg.entries.push({type:'info', text:`<span class="green">🦇 韦一笑闪避反击吸血+${heal}，上限→${Math.floor(target.maxHp)}</span>`, isHealEntry:true, healAmount:heal, healUnitUid:target.uid});
        }
        dg.entries.push({type:'combat-text', text:`<span class="${unit.camp==='ally'?'blue':'orange'}">${unit.camp==='ally'?'明教':'六大派'} ${unit.name}</span>(攻${Math.floor(unit.atk)} 血${unitHpBeforeRebound}) → <span class="${target.camp==='ally'?'blue':'orange'}">${target.camp==='ally'?'明教':'六大派'} ${target.name}</span>(防${Math.floor(target.def)} 血${Math.floor(target.hp)})`});
        dg.entries.push({type:'info', text:`<span class="gray">🦅 ${target.name}闪避了攻击！</span>`});
        dg.entries.push({type:'damage-text', text:`<span class="red">🦅 ${target.name}反击 → ${unit.name} 造成 ${reboundDmg} 真实伤害</span>`});
        if (unit.hp <= 0) { unit.alive = false; unit._flash = 'dead'; unit._isDead = true; dg.entries.push({type:'info', text:`${unit.name}被反击击杀！`}); }
        log.push(dg);
        unit._acted = true;
        return true;
    }

    function calcAttackDamage(unit, target, attackerBuffStats, defenderBuffStats) {
        let atkBase = Math.floor(unit.atk) + Math.floor(unit.atk * attackerBuffStats.atkBonus);
        let defBase = Math.floor(target.def) + Math.floor(target.def * defenderBuffStats.defBonus);
        const hornBonus = getHornStrikeBonus(unit, target);
        if (hornBonus.defIgnore > 0) defBase = Math.floor(defBase * (1 - hornBonus.defIgnore));
        let atkVar = rand(0, C.ATK_VAR), defVar = rand(0, C.DEF_VAR), hpBonus = rand(C.HP_BONUS_MIN, C.HP_BONUS_MAX);
        let atkAct = atkBase + atkVar, defAct = defBase + defVar;
        let hpBefore = Math.floor(target.hp);
        target.hp += hpBonus;
        let waveTaunt = null, waveUnit = null;
        if (atkVar === C.ATK_VAR) { waveTaunt = getRandomTaunt(unit); waveUnit = unit; unit.critCount++; }
        else if (defVar === C.DEF_VAR) { waveTaunt = DT[rand(0, DT.length - 1)]; waveUnit = target; }
        else if (hpBonus === C.HP_BONUS_MAX) { waveTaunt = HT[rand(0, HT.length - 1)]; waveUnit = target; }
        if (unit.isZhang && !unit.rangedForm && unit.nearAtkCount < 3) {
            let zt = getZhangNearTaunt(unit.nearAtkCount + 1);
            if (zt && !waveTaunt) { waveTaunt = zt; waveUnit = unit; }
        }
        let raw, rawFormula;
        if (unit.role === '防战') {
            let lv = getFangLevel(unit.def, unit.m), k = C.FANG_K[lv];
            let penPart = calcDamage(atkAct, defAct);
            raw = penPart + unit.def * k + unit.maxHp * 0.01;
            rawFormula = `${Math.floor(penPart)} + ${Math.floor(unit.def)}×${k} + ${Math.floor(unit.maxHp)}×0.01 = ${Math.floor(raw)}`;
        } else {
            raw = calcDamage(atkAct, defAct);
            rawFormula = `伤害 = ${atkAct}×(${atkAct}/(${atkAct}+${defAct})) = ${Math.floor(raw)}`;
        }
        const thunderBonus = getPhantomThunderBonus(unit);
        raw += thunderBonus;
        if (thunderBonus > 0) rawFormula += ` + 混元霹雳劲${thunderBonus}`;
        const rebelBonus = getRebelDmgBonus(unit);
        if (rebelBonus > 0) raw *= (1 + rebelBonus);
        if (hornBonus.dmgMultiplier > 1) raw *= hornBonus.dmgMultiplier;
        
        // V3.1.0 宋青书真实伤害
        const trueDmg = getRebelTrueDmg(unit, target);
        raw += trueDmg;
        if (trueDmg > 0) rawFormula += ` + 叛逆真伤${trueDmg}`;
        
        return { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, raw, rawFormula, thunderBonus, hornBonus, trueDmg };
    }

    function applyPostAttackEffects(unit, target, dmg, atkAct, defAct, reboundEntry, allySide, enemySide) {
        if (unit.camp === 'ally') {
            applyBuffEffectsBeforeAttack(unit, target, allySide, enemySide, log);
            checkZhangSwitch();
        } else {
            applyBuffEffectsBeforeAttack(unit, target, enemySide, allySide, log);
        }
        if (unit.camp === 'ally') {
            applyBuffEffectsAfterAttack(unit, target, dmg, allySide, enemySide, log);
        }
        checkNineYinClaw(unit, dmg, log);
        const counterDmg = checkExtinctionCounter(target, dmg);
        if (counterDmg > 0) {
            unit.hp -= counterDmg; target.dmgDealt += counterDmg; unit.dmgTaken += counterDmg;
            if (unit.hp <= 0) { unit.alive = false; unit._isDead = true; }
            log.push({type:'info', text:`<span class="red">⚔️ 灭绝双剑反击！${target.name} 对 ${unit.name} 造成 ${counterDmg} 点反击伤害</span>`, buffType:'elite_counter'});
        }
        const poisonLog = applyXuanmingPalm(unit, target);
        if (poisonLog) { log.push(poisonLog); }
        if (reboundEntry) { log.push(reboundEntry); }
        let dead = !target.alive;
        if (dead && target.camp === 'ally') { checkZhangSwitch(); }
    }

    function processUnitAttack(unit, allySide, enemySide, logRef) {
        let target = selectTarget(unit, enemySide);
        if (!target) { unit._acted = true; return false; }

        let miss = false;
        let missChance = 0;
        if (!unit.isWei && (unit.role === '远程' || unit.role === '飞行')) {
            missChance = 5;
        }
        if (missChance > 0 && rand(1,100) <= missChance) {
            miss = true;
            let mg = {type:'attack-group', uidA:unit.uid, uidD:target.uid, entries:[], isMiss:true, _fxSnapshot:makeFXSnapshot(unit,target), waveTaunt:null, waveUnit:null, buffEffects: []};
            mg.entries.push({type:'combat-text', text:`<span class="${unit.camp==='ally'?'blue':'orange'}">${unit.camp==='ally'?'明教':'六大派'} ${unit.name}</span> 的攻击`});
            mg.entries.push({type:'info', text:`<span class="gray">未命中！</span>`});
            log.push(mg);
            unit._acted = true;
            return false;
        }

        let unitActiveBuffs = unit.camp === 'ally' ? allySide._activeBuffs : enemySide._activeBuffs;
        let unitAllyTeam = unit.camp === 'ally' 
    ? (window._currentBattleState?.ally || allySide) 
    : (window._currentBattleState?.enemy || enemySide);
        // 如果有 carry buff，攻击时也需要包含已阵亡队友（死亡加成翻倍）
        if (hasBuff(unitActiveBuffs, 'carry') && unit.camp === 'ally') {
            unitAllyTeam = unitAllyTeam.concat(state.ally.filter(c => !c.alive));
            unitAllyTeam = unitAllyTeam.filter((u, i, arr) => arr.findIndex(v => v.uid === u.uid) === i);
        }
        let attackerBuffStats = computeBuffStats(unit, unitActiveBuffs, unitAllyTeam);
        unit.buffAtkBonus = attackerBuffStats.atkBonus;
        unit.buffDefBonus = attackerBuffStats.defBonus;
        unit.buffDodgeBonus = attackerBuffStats.dodgeBonus;
        unit.buffHpBonus = attackerBuffStats.hpBonus;

        let targetActiveBuffs = target.camp === 'ally' ? A._activeBuffs : B._activeBuffs;
        let targetAllyTeam = target.camp === 'ally' ? allySide : enemySide;
        let defenderBuffStats = computeBuffStats(target, targetActiveBuffs, targetAllyTeam);
        target.buffAtkBonus = defenderBuffStats.atkBonus;
        target.buffDefBonus = defenderBuffStats.defBonus;
        target.buffDodgeBonus = defenderBuffStats.dodgeBonus;
        target.buffHpBonus = defenderBuffStats.hpBonus;

        if (resolveDodge(unit, target, attackerBuffStats)) return false;

        let dmgCalc = calcAttackDamage(unit, target, attackerBuffStats, defenderBuffStats);
        let { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, raw, rawFormula, thunderBonus, hornBonus, trueDmg } = dmgCalc;

        let dmg = Math.floor(raw), dead = target.hp - dmg <= 0;
        if (dead) { target.hp = 0; target.alive = false; target._isDead = true; }
        else { target.hp -= dmg; }
        unit.dmgDealt += dmg; target.dmgTaken += dmg;

        let allyBuffs_fortify = (target.camp === 'ally' ? A._activeBuffs : B._activeBuffs) || [];
        let reboundEntry = null;
        if (hasBuff(allyBuffs_fortify, 'fortify') && target.role === '防战' && dmg > 0) {
            let reboundDmg = Math.floor((atkAct - Math.floor(calcDamage(atkAct, defAct))) / 2);
            if (reboundDmg > 0) {
                let attHpBefore = Math.floor(unit.hp);
                unit.hp -= reboundDmg; target.reboundDone += reboundDmg;
                if (unit.hp <= 0) { unit.alive = false; unit._isDead = true; }
                reboundEntry = {
                    type: 'buff-rebound-fortify',
                    text: `<span class="gold">🛡️ 严阵以待反弹${reboundDmg}给${unit.name}，${unit.name}血量 ${attHpBefore} → ${Math.floor(unit.hp)}</span>`,
                    buffType: 'fortify_rebound', reboundDmg: reboundDmg, attackerUid: unit.uid, defenderUid: target.uid
                };
            }
        }

        let hpPctBefore = Math.floor((hpBefore / target.maxHp) * 100), hpPctAfter = Math.floor((target.hp / target.maxHp) * 100);
        let campA = unit.camp === 'ally' ? '明教' : '六大派', campD = target.camp === 'ally' ? '明教' : '六大派';
        let ac = unit.camp === 'ally' ? 'blue' : 'orange', dc = target.camp === 'ally' ? 'blue' : 'orange';
        let displayAtk = Math.floor(unit.atk + unit.atk * attackerBuffStats.atkBonus);
        let displayDef = Math.floor(target.def + target.def * defenderBuffStats.defBonus);
        let unitHpBefore = Math.floor(unit.hp);
        let group = { type:'attack-group', uidA:unit.uid, uidD:target.uid, entries:[], hpAfter:target.hp, alive:target.alive, isDead:dead, waveTaunt, waveUnit, unitRole:unit.role, _fxSnapshot:makeFXSnapshot(unit,target), _dmg:dmg, _isZhangNear:unit.isZhang && !unit.rangedForm, _nearAtkCount:unit.nearAtkCount, hpPctBefore, hpPctAfter, isMiss:miss, isDodge:false, buffEffects:[], _atkBonus:Math.floor(unit.atk * attackerBuffStats.atkBonus), _defBonus:Math.floor(target.def * defenderBuffStats.defBonus) };
        group.entries.push({type:'combat-text', text:`<span class="${ac}">${campA} ${unit.name}</span>(攻${displayAtk} 血${unitHpBefore}) → <span class="${dc}">${campD} ${target.name}</span>(防${displayDef} 血${hpBefore})`});
        group.entries.push({type:'detail', text:`<span class="gray small">波动：攻${atkBase}→${atkAct} 防${defBase}→${defAct} 血${hpBonus >= 0 ? '+' + hpBonus : hpBonus}</span>`});
        if (thunderBonus > 0) group.entries.push({type:'detail', text:`<span class="red small">💥 混元霹雳劲+${thunderBonus}真实伤害</span>`});
        if (hornBonus.defIgnore > 0) group.entries.push({type:'detail', text:`<span class="purple small">🦌 鹿角杖法忽略防御${Math.round(hornBonus.defIgnore*100)}%</span>`});
        if (trueDmg > 0) group.entries.push({type:'detail', text:`<span class="red small">⚔️ 叛逆真伤+${trueDmg}（目标当前生命10%）</span>`});
        group.entries.push({type:'detail', text:`<span class="gray small">计算：${rawFormula}</span>`});
        group.entries.push({type:'damage-text', deadFlag:dead, text:`<span class="damage-line ${dead?'brush-red':''} ${ac}">${dead?'💀击杀💀 ':''}${campA} ${unit.name}</span> 造成 <span class="red">${dmg}</span> 伤害，<span class="${dc}">${campD} ${target.name}</span> ${hpBefore} → ${Math.floor(target.hp)} ${dead?'💀阵亡':''}`});

        if (unit.camp === 'ally' && unit.isZhang && unit.alive) {
            let heal = Math.floor(unit.maxHp * 0.05); unit.hp = Math.min(unit.maxHp, unit.hp + heal); unit.healDone += heal;
            group.entries.push({type:'info', text:`<span class="green">☀️ 九阳神功回复${heal}</span>`, isHealEntry:true});
            if (!unit.rangedForm) {
                if (unit.nearAtkCount === 0 && !unit._zhangTauntDone) {
                    let firstTaunt = getZhangNearTaunt(1);
                    if (firstTaunt) { group.entries.push({type:'info', text:`<span class="gold">🗣️ ${unit.name}：${firstTaunt}</span>`}); unit._zhangTauntDone = true; }
                }
                unit.nearAtkCount++;
                if (unit.nearAtkCount === 3) unit.ronghui = true;
                if (unit.nearAtkCount === 3) {
                    let zt = getZhangNearTaunt(3); if (zt) group.entries.push({type:'info', text:`<span class="gold">🗣️ ${unit.name}：${zt}</span>`});
                    let extra = Math.floor(target.atk * 0.15); target.hp -= extra; unit.dmgDealt += extra;
                    if (target.hp <= 0) { target.hp = 0; target.alive = false; target._isDead = true; }
                    group.entries.push({type:'info', text:`<span class="red">🔥 融会贯通额外+${extra}（目标攻击${Math.floor(target.atk)}×15%）</span>`});
                }
            }
        }
        if (target.camp === 'ally' && (target.pos === 4 || target.pos === 6) && dmg > 0) {
            let zhang = allySide.find(c => c.isZhang && c.alive && c.rangedForm);
            if (zhang) {
                let rebound = Math.floor(dmg * 0.15); unit.hp -= rebound; zhang.reboundDone += rebound;
                zhang.hp -= Math.floor(rebound * 0.1); zhang.dmgTaken += Math.floor(rebound * 0.1);
                group.entries.push({type:'info', text:`<span class="gold">✨ 乾坤大挪移反弹${rebound}给${unit.name}（无忌自伤${Math.floor(rebound*0.1)}）</span>`, buffType:'rebound'});
                if (unit.hp <= 0) { unit.alive = false; unit._isDead = true; }
                if (zhang.hp <= 0) { zhang.hp = 0; zhang.alive = false; zhang._isDead = true; }
            }
        }
        if (unit.camp === 'ally' && unit.isWei && dmg > 0) {
            let heal = Math.floor(dmg * 0.15); unit.maxHp += heal; unit.hp = Math.min(unit.hp + heal, unit.maxHp);
            unit.healDone += heal; unit.leechDone += heal;
            group.entries.push({type:'info', text:`<span class="green">🦇 韦一笑吸血+${heal}，上限→${Math.floor(unit.maxHp)}</span>`, isHealEntry:true, healAmount:heal, healUnitUid:unit.uid});
        }
        unit._acted = true;
        log.push(group);
        
        // ===== V3.1.0 新婚扣血叠快乐（宋青书攻击触发） =====
        applyXinHunDeduction(unit, allySide, log);
        
        applyPostAttackEffects(unit, target, dmg, atkAct, defAct, reboundEntry, allySide, enemySide);

        if (doubleStrikeUnitUid && unit.uid === doubleStrikeUnitUid && unit.alive && target.alive && unit.camp === 'ally' && !unit._doubleStriked) {
            if (rand(1,100) <= 80) {
                log.push({type:'info', text:`<span class="gold">⚡ 概率连击触发！</span>`, isDoubleStrikeBanner:true});
                unit._doubleStriked = true; unit._acted = false;
                processUnitAttack(unit, allySide, enemySide, log);
            } else {
                log.push({type:'info', text:`<span class="gray">⚡ 概率连击触发失败，${unit.name} 未能再次攻击</span>`});
            }
        }

        // ===== V3.1.0 性奋二次攻击 =====
        if (canXingFenTrigger(unit)) {
            consumeXingFen(unit);
            log.push({type:'info', text:`<span class="gold">💗 性奋：${unit.name} 获得额外攻击机会！</span>`});
            // 不占用正常轮次，直接再攻击一次
            processUnitAttack(unit, allySide, enemySide, log);
        }

        return true;
    }

    while (true) {
        let team = currentSide === 'ally' ? A : B;
        let otherTeam = currentSide === 'ally' ? B : A;
        let unit = getNextAvailableUnit(team);

        if (unit) {
            if (unit.isZhang && !unit._zhangSwitched) checkZhangSwitch();
            unit._blocked = isBlocked(unit, team);
            unit.survivedRounds++;
            
            if ((unit.isHorse && unit.atk <= 0) || (unit._blocked && isMelee(unit.role) && !unit.isZhang)) {
                if (unit._blocked && isMelee(unit.role)) {
                    let hpBefore = Math.floor(unit.hp);
                    unit.hp = Math.min(unit.maxHp, unit.hp + 10);
                    let hpAfter = Math.floor(unit.hp);
                    unit._resting = true;
                    let bg = {type:'attack-group', uidA:unit.uid, uidD:null, entries:[], isBlock:true, _fxSnapshot:makeFXSnapshot(unit,null), waveTaunt:null, waveUnit:null, buffEffects:[], healAmount: 10, healUnitUid: unit.uid};
                    bg.entries.push({type:'combat-text', text:`<span class="${unit.camp==='ally'?'blue':'orange'}">${unit.camp==='ally'?'明教':'六大派'} ${unit.name}</span> 被遮挡`});
                    bg.entries.push({type:'info', text:`<span class="green">休息回复10点生命（${hpBefore} → ${hpAfter}）</span>`});
                    log.push(bg);
                } else if (unit.isHorse) {
                    log.push({type:'info', text:`<span class="gray">🐴 拒马无法攻击，自动跳过</span>`});
                }
                unit._acted = true;
                continue;
            }
            
            let allySide = unit.camp === 'ally' ? A : B;
            let enemySide = unit.camp === 'ally' ? B : A;
            processUnitAttack(unit, allySide, enemySide, log);
            currentSide = currentSide === 'ally' ? 'enemy' : 'ally';
        } else {
            if (getNextAvailableUnit(otherTeam) === null) break;
            currentSide = currentSide === 'ally' ? 'enemy' : 'ally';
        }

        if (B.every(c => !c.alive) || A.every(c => !c.alive)) break;
    }

    destroyHorse(A, log); destroyHorse(B, log);
    A._activeBuffs = (A._activeBuffs || []).map(b => ({...b, remaining: b.remaining - 1})).filter(b => b.remaining > 0);
    B._activeBuffs = (B._activeBuffs || []).map(b => ({...b, remaining: b.remaining - 1})).filter(b => b.remaining > 0);

    let winner = null;
    if (B.every(c => !c.alive) || A.every(c => !c.alive)) {
        winner = A.some(c => c.alive) ? '明教' : '六大派';
        let losers = winner === '明教' ? B : A;
        losers.forEach(u => { u.hp = 0; u.alive = false; u._isDead = true; });
    }
    if (round >= C.MAX_ROUND) { winner = '平局'; }
    
    log.push({type:'round-end', text:`<div class="separator">———— 第${round}回合结束 ————</div>`});

    return {
        ally: A, enemy: B, round: round, log: log, winner: winner,
        activeBuffs: A._activeBuffs, doubleStrikeUid: doubleStrikeUnitUid
    };
}

export function runBattle(snapshot, activeBuffs = [], buffData = {}) {
    let state = {
        ally: snapshot.ally.map(u => u.clone()),
        enemy: snapshot.enemy.map(u => u.clone()),
        round: 1, activeBuffs: activeBuffs
    };
    let fullLog = [];
    let finalWinner = null;
    let doubleStrikeUids = [];
    while (true) {
        let result = runBattleRound(state);
        fullLog = fullLog.concat(result.log);
        doubleStrikeUids.push(result.doubleStrikeUid);
        if (result.winner) {
            finalWinner = result.winner;
            return {
                winner: finalWinner, rounds: state.round, log: fullLog,
                ally: result.ally, enemy: result.enemy,
                activeBuffs: { ally: result.activeBuffs, enemy: [] },
                doubleStrikeUids
            };
        }
        state = {
            ally: result.ally, enemy: result.enemy,
            round: state.round + 1, activeBuffs: result.activeBuffs
        };
    }
}