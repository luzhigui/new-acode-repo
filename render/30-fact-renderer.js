// render/30-fact-renderer.js - 光明顶5v5 事实渲染器
// V5.6.3 | ~34000 bytes| 2026-08-17 全部事实渲染函数统一入口
import { CONFIG } from '../core/01config-5v5-test.js';
import { calcDamage, getFangLevel, makeFXSnapshot } from '../core/03battle-utils.js';
export const VER = 'render/30-fact-renderer.js V5.6.3';

// ==================== 攻击流程 ====================
export function renderMissFact(fact) {
    const ac = fact.attacker.camp === 'ally' ? 'blue' : 'orange';
    const campA = fact.attacker.camp === 'ally' ? '明教' : '六大派';
    return {
        type:'attack-group',
        uidA: fact.attacker.uid,
        uidD: fact.target.uid,
        entries: [
            {type:'combat-text', text:`<span class="${ac}">${campA} ${fact.attacker.name}</span> 的攻击`},
            {type:'info', text:`<span class="gray">未命中！</span>`}
        ],
        isMiss:true,
        _fxSnapshot: fact.fxSnapshot,
        waveTaunt:null,
        waveUnit:null,
        buffEffects: [],
        needsSeparator: true,
        _events: fact.events || []
    };
}

export function renderDodgeFact(fact) {
    const unit = fact.attacker;
    const target = fact.dodger;
    const ac = unit.camp === 'ally' ? 'blue' : 'orange';
    const dc = target.camp === 'ally' ? 'blue' : 'orange';
    const campA = unit.camp === 'ally' ? '明教' : '六大派';
    const campD = target.camp === 'ally' ? '明教' : '六大派';

    const dodgeGroup = {
        type:'attack-group', uidA:target.uid, uidD:unit.uid, entries:[], isDodge:true,
        hpAfter: fact.attackerHpAfter, alive: fact.attackerAlive,
        _fxSnapshot: fact.fxSnapshot, waveTaunt:null, waveUnit:null,
        buffEffects:[], _atkBonus:0, _defBonus:0, needsSeparator: true,
        isDead: fact.attackerHpAfter <= 0,
        _events: fact.events || []
    };

    dodgeGroup.entries.push({type:'combat-text', text:`<span class="${ac}">${campA} ${unit.name}</span>(攻${fact.attackerAtk} 血${fact.attackerHpBefore}) → <span class="${dc}">${campD} ${target.name}</span>(防${fact.dodgerDef} 血${fact.dodgerHp})`});
    dodgeGroup.entries.push({type:'damage-text', deadFlag: dodgeGroup.isDead, text:`<span class="red">🦅 ${target.name}闪避并反击 → ${unit.name} 造成 ${fact.reboundDmg} 真实伤害（${fact.attackerHpBefore} → ${fact.attackerHpAfter}）</span>`});

    if (fact.weiHeal) {
        const healText = fact.weiHeal.oldMaxHp !== undefined
            ? `<span class="green">🦇 青翼蝠王·闪避反击吸血+${fact.weiHeal.heal}，上限${fact.weiHeal.oldMaxHp}→${fact.weiHeal.newMaxHp}</span>`
            : `<span class="green">🦇 青翼蝠王·闪避反击吸血+${fact.weiHeal.heal}，上限→${fact.weiHeal.newMaxHp}</span>`;
        dodgeGroup.entries.push({type:'info', text:healText, isHealEntry:true, healAmount:fact.weiHeal.heal, healUnitUid:target.uid});
    }

    if (dodgeGroup.isDead) {
        dodgeGroup.hpAfter = 0;
        dodgeGroup.entries.push({type:'info', text:`${unit.name}被反击击杀！`});
    }
    dodgeGroup.entries.push({type:'info', text:`<span class="gray">😵 ${unit.name} 被反击眩晕，本回合无法行动！</span>`});

    return dodgeGroup;
}

export function renderAttackFact(fact) {
    const unit = fact.attacker;
    const target = fact.target;
    const dmgCalc = fact.dmgCalc;
    const dmgResult = fact.dmgResult;
    const ac = unit.camp === 'ally' ? 'blue' : 'orange';
    const dc = target.camp === 'ally' ? 'blue' : 'orange';
    const campA = unit.camp === 'ally' ? '明教' : '六大派';
    const campD = target.camp === 'ally' ? '明教' : '六大派';
    const displayAtk = Math.floor(unit.atk + unit.atk * fact.attackerBuffStats.atkBonus);
    const displayDef = Math.floor(target.def + target.def * fact.defenderBuffStats.defBonus);
    const unitHpBefore = Math.floor(unit.hp);
    const group = {
        type:'attack-group', uidA:unit.uid, uidD:target.uid, entries:[],
        hpAfter: target.hp, alive: target.alive, isDead: dmgResult.dead,
        waveTaunt: dmgCalc.waveTaunt, waveUnit: dmgCalc.waveUnit,
        unitRole: unit.role,
        _fxSnapshot: makeFXSnapshot(unit, target),
        _dmg: dmgResult.dmg,
        _isZhangNear: unit.isZhang && !unit.rangedForm,
        _nearAtkCount: unit.nearAtkCount,
        hpPctBefore: fact.hpPctBefore,
        hpPctAfter: fact.hpPctAfter,
        isMiss:false, isDodge:false, buffEffects:[], needsSeparator: true,
        _atkBonus: Math.floor(unit.atk * fact.attackerBuffStats.atkBonus),
        _defBonus: Math.floor(target.def * fact.defenderBuffStats.defBonus),
        isKuLianAttack: !!(unit.name === '宋青书' && unit._kuLianActive),
        isLinkAttack: !!unit._isLinkAttack
    };
    group.entries.push({type:'combat-text', text:`<span class="${ac}">${campA} ${unit.name}</span>(攻${displayAtk} 血${unitHpBefore}) → <span class="${dc}">${campD} ${target.name}</span>(防${displayDef} 血${dmgResult.hpBefore})`});
    if (fact.phantomLog) group.entries.push({type:'info', text:`<span class="gold">${fact.phantomLog}</span>`});
    group.entries.push({type:'detail', text:`<span class="gray small">波动：攻${dmgCalc.atkBase}→${dmgCalc.atkAct} 防${dmgCalc.defBase}→${dmgCalc.defAct} 血${dmgCalc.hpBonus >= 0 ? '+' + dmgCalc.hpBonus : dmgCalc.hpBonus}</span>`});
    if (dmgCalc.thunderBonus > 0) group.entries.push({type:'detail', text:`<span class="red small">💥 混元霹雳劲+${dmgCalc.thunderBonus}真实伤害</span>`});
    if (dmgCalc.hornDefIgnore > 0 && dmgCalc.hornDmgMultiplier > 1) group.entries.push({type:'info', text:`<span class="gold">🦌 目标已中毒（玄冥神掌），鹤笔翁 鹿角杖法伤害+50%！</span>`});
    if (dmgCalc.trueDmg > 0) group.entries.push({type:'detail', text:`<span class="red small">⚔️ 叛逆真伤+${dmgCalc.trueDmg}（目标当前生命${Math.round((CONFIG.ELITE_SKILLS?.rebelStrike?.currentHpRatio || 0.12) * 100)}%）</span>`});
    let formulaText = '';
    const fmtBonusEntries = (dmgCalc.bonusDmgEntries || []).filter(e => e.value > 0);
    const fmtMultiplierEntries = (dmgCalc.dmgMultiplierEntries || []).filter(e => e.value > 1);
    if (unit.role === '防战') {
        const penPart = calcDamage(dmgCalc.atkAct, dmgCalc.defAct);
        const lv = getFangLevel(Math.floor(unit.def), unit.m);
        const k = CONFIG.FANG_K[lv] !== undefined ? CONFIG.FANG_K[lv] : CONFIG.FANG_K[CONFIG.FANG_K.length - 1];
        const z = dmgCalc.hpRatio !== undefined ? dmgCalc.hpRatio : CONFIG.HP_DMG_RATIO;
        const baseRaw = Math.floor(dmgCalc.raw - dmgCalc.bonusDmgTotal);
        formulaText = `${Math.floor(penPart)} + ${Math.floor(unit.def)}×${k} + ${Math.floor(unit.maxHp)}×${z} = ${baseRaw}`;
    } else {
        const baseRaw = Math.floor(dmgCalc.raw - dmgCalc.bonusDmgTotal);
        formulaText = `${dmgCalc.atkAct}×(${dmgCalc.atkAct}/(${dmgCalc.atkAct}+${dmgCalc.defAct})) = ${baseRaw}`;
    }
    for (const e of fmtBonusEntries) formulaText += ` + ${e.label}${e.value} = ${Math.floor(dmgCalc.raw)}`;
    for (const e of fmtMultiplierEntries) formulaText += ` ×${e.label}${e.value} = ${Math.floor(dmgCalc.raw)}`;
    if (dmgResult.dmg !== Math.floor(dmgCalc.raw)) {
        const reduction = Math.floor(dmgCalc.raw) - dmgResult.dmg;
        formulaText += ` → 减伤${reduction} = ${dmgResult.dmg}`;
    }
    group.entries.push({type:'detail', text:`<span class="gray small">计算：${formulaText}</span>`});
    group.entries.push({type:'damage-text', deadFlag:dmgResult.dead, text:`<span class="damage-line ${dmgResult.dead?'brush-red':''} ${ac}">${dmgResult.dead?'💀击杀💀 ':''}${campA} ${unit.name}</span> 造成 <span class="red">${dmgResult.dmg}</span> 伤害，<span class="${dc}">${campD} ${target.name}</span> ${dmgResult.hpBefore} → ${Math.floor(target.hp)} ${dmgResult.dead?'💀阵亡':''}`});
    for (const entry of dmgResult.bonusEntries) group.entries.push(entry);
    if (fact.entries) for (const e of fact.entries) group.entries.push(e);
    return group;
}

export function renderEmptyTargetFact(fact) {
    const ac = fact.attacker.camp === 'ally' ? 'blue' : 'orange';
    const campA = fact.attacker.camp === 'ally' ? '明教' : '六大派';
    return {
        type:'attack-group',
        uidA: fact.attacker.uid,
        uidD: null,
        entries: [
            {type:'combat-text', text:`<span class="${ac}">${campA} ${fact.attacker.name}</span> 无法选择目标`},
            {type:'info', text:`<span class="gray">${fact.reason}</span>`}
        ],
        isMiss:true,
        _fxSnapshot: null,
        waveTaunt:null,
        waveUnit:null,
        buffEffects: [],
        needsSeparator: true,
        _events: fact.events || []
    };
}

export function renderImmuneFact(fact) {
    const unit = fact.attacker;
    const target = fact.target;
    const ac = unit.camp === 'ally' ? 'blue' : 'orange';
    const dc = target.camp === 'ally' ? 'blue' : 'orange';
    const campA = unit.camp === 'ally' ? '明教' : '六大派';
    const campD = target.camp === 'ally' ? '明教' : '六大派';
    const immuneGroup = {
        type:'attack-group',
        uidA:unit.uid,
        uidD:target.uid,
        entries:[{
            type:'combat-text',
            text:`<span class="${ac}">${campA} ${unit.name}</span>(攻${fact.attackerAtk} 血${fact.attackerHp}) → <span class="${dc}">${campD} ${target.name}</span>(防${fact.targetDef} 血${fact.targetHp})`
        }],
        hpAfter: target.hp,
        alive: target.alive,
        isDead:false,
        isImmune:true,
        waveTaunt:null,
        waveUnit:null,
        unitRole: unit.role,
        _fxSnapshot: makeFXSnapshot(unit, target),
        _dmg:0,
        hpPctBefore: fact.hpPctBefore,
        hpPctAfter: fact.hpPctAfter,
        isMiss:false,
        isDodge:false,
        buffEffects:[],
        needsSeparator: true,
        _events: fact.events || []
    };
    if (fact.reason) {
        immuneGroup.entries.push({type:'info', text:`<span class="gold">${fact.reason}</span>`});
    }
    return immuneGroup;
}

// ==================== 掉落 / 破防 ====================
export function renderDropFact(fact) {
    if (!fact) return null;
    if (fact.kind === 'token') {
        return { type:'info', text:`<span class="gold">🔥 圣火令掉落！${fact.killerName} 击杀 ${fact.victimName}，获得1枚圣火令！当前总数：${fact.total}</span>`, fastEntry: true, unitUid: fact.unitUid };
    }
    if (fact.kind === 'chest') {
        return { type:'info', text:`<span class="gold">🎁 宝箱掉落！${fact.killerName} 击杀 ${fact.victimName}，获得1个宝箱！当前总数：${fact.total}</span>`, fastEntry: true, unitUid: fact.unitUid };
    }
    return null;
}

export function renderBreakDefFact(fact) {
    return {type:'detail', text:`<span class="purple small">🗡️ ${fact.attackerName} 破防：${fact.targetName} 防御 -${fact.reduce}</span>`};
}

// ==================== 拒马 / 张无忌 ====================
export function renderHorseDestroyFact(fact) {
    if (fact.success) {
        return {
            type:'buff-destroy',
            text:`<span class="gray">🐴 拒马阵：${fact.pos}号位拒马消散（成功率${fact.prob}%，${fact.roll}）</span>`,
            buffType:'destroy',
            horseUid: fact.horseUid,
            needsSeparator: true
        };
    }
    return {
        type:'info',
        text:`<span class="gray">🐴 拒马阵：${fact.pos}号位拒马未消散（成功率${fact.prob}%，${fact.roll}）</span>`
    };
}

export function renderZhangSwitchFact(fact) {
    return [
        { type:'info', text:`<span class="gold">⚔️ 张无忌切换近战形态！攻+${fact.atkGain}、防+${fact.defGain}、生命上限+${fact.maxHpGain}</span>`, isZhangSwitch:true, unit: fact.zhang },
        { type:'info', text:`<span class="gold">🗣️ 张无忌：不好，要顶上去了！</span>`, isZhangTaunt:true }
    ];
}

// ==================== Buff 摘要 ====================
export function renderBuffSummaryFact(buff, allyTeam, doubleStrikeUid) {
    switch (buff.key) {
        case 'bloodthirst':
            let btUnits = allyTeam.filter(u => u.alive && u.role === '战士');
            if (btUnits.length > 0) return {type:'buff-summary', text:`<span class="gold">🗡️ 嗜血狂刀：${btUnits.map(u=>u.name).join('、')} 攻击吸血${Math.round(CONFIG.BUFFS.bloodthirst.leechRatio*100)}%</span>`, buffType:'buff_stat'};
            break;
        case 'hotBlood':
            let hbUnits = allyTeam.filter(u => u.alive);
            if (hbUnits.length > 0) return {type:'buff-summary', text:`<span class="gold">❤️ 热血奋战：${hbUnits.map(u=>u.name).join('、')} 攻击回血${Math.round(CONFIG.BUFFS.hotBlood.leechRatio*100)}%（每3次翻倍）</span>`, buffType:'buff_stat'};
            break;
        case 'fortify':
            let ftUnits = allyTeam.filter(u => u.alive && u.role === '防战');
            if (ftUnits.length > 0) return {type:'buff-summary', text:`<span class="gold">🛡️ 严阵以待：${ftUnits.map(u=>u.name).join('、')} 防御+${Math.round(CONFIG.BUFFS.fortify.defBonus*100)}% 反弹50%</span>`, buffType:'buff_stat'};
            break;
        case 'cloudBody':
            let cbUnits = allyTeam.filter(u => u.alive);
            if (cbUnits.length > 0) return {type:'buff-summary', text:`<span class="gold">💨 流云身法：${cbUnits.map(u=>u.name).join('、')} 闪避+${Math.round(CONFIG.BUFFS.cloudBody.dodgeBonus*100)}%</span>`, buffType:'buff_stat'};
            break;
        case 'windAssault':
            let waUnits = allyTeam.filter(u => u.alive && u.role === '飞行');
            if (waUnits.length > 0) return {type:'buff-summary', text:`<span class="gold">🦅 乘风突袭：${waUnits.map(u=>u.name).join('、')} 80%波及同行 60%击退（持续3回合）</span>`, buffType:'buff_stat'};
            break;
        case 'meteorShower':
            let msUnits = allyTeam.filter(u => u.alive && u.role === '远程');
            if (msUnits.length > 0) return {type:'buff-summary', text:`<span class="gold">☄️ 流星赶月：${msUnits.map(u=>u.name).join('、')} 伤害加深${Math.round(CONFIG.BUFFS.meteorShower.bonusRatio*100)}% 溅射${Math.round(CONFIG.BUFFS.meteorShower.splashRatio*100)}%（主箭降2防，小箭降1防）</span>`, buffType:'buff_stat'};
            break;
        case 'holyFlame':
            // 复杂 holyFlame 摘要逻辑，返回 null 避免报错，后续按需补充
            return null;
        case 'doubleStrike':
            break;
        case 'mindControl':
            return {type:'buff-summary', text:`<span class="gold">🌀 惑人心智：最前排80%扰乱敌方换位，40%扰乱己方换位</span>`, buffType:'buff_stat'};
        case 'carry':
            let carryUnit = allyTeam.find(u => u.pos === 5 && u.alive);
            if (carryUnit) {
                let desc = `👑 你就是carry：${carryUnit.name} 获得队友属性加成`;
                return {type:'buff-summary', text:`<span class="gold">${desc}</span>`, buffType:'buff_stat'};
            }
            break;
    }
    return null;
}

// ==================== Buff 衍生效果（嗜血/热血/乘风/流星） ====================
export function renderBloodthirstLeechFact(fact) {
    if (fact.isBrother) {
        return { text:`<span class="green">🕷️ 蝶血：${fact.unitName} 嗜血狂刀吸血+${fact.leechVal}</span>` };
    }
    return { text:`<span class="green">🗡️ ${fact.unitName} 的嗜血狂刀吸血+${fact.leechVal}</span>` };
}

export function renderHotBloodHealFact(fact) {
    return { text:`<span class="green">${fact.tag}：${fact.unitName} 回复+${fact.leech}</span>` };
}

export function renderWindAssaultSplashFact(fact) {
    const details = fact.targets.map(t => t.name).join('、');
    return { text:`<span class="orange">${fact.label}波及${details}，各 -${fact.splashDmg}</span>` };
}

export function renderWindAssaultPushFact(fact) {
    if (fact.behindUnit) {
        return {type:'buff-push', pushTargetUid: fact.target.uid, behindUid: fact.behindUnit.uid, oldPos: fact.oldPos, newPos: fact.behindPos, behindOldPos: fact.behindOldPos, buffType:'push', text:`<span class="gold" style="font-size:1.1em;">${fact.label}击退！${fact.target.name}从${fact.oldPos}号位击退至${fact.behindPos}号位，${fact.behindUnit.name}被迫从${fact.behindOldPos}号位移至${fact.oldPos}号位</span>`};
    }
    return {type:'buff-push', pushTargetUid: fact.target.uid, behindUid: null, oldPos: fact.oldPos, newPos: fact.behindPos, buffType:'push', text:`<span class="gold" style="font-size:1.1em;">${fact.label}击退！${fact.target.name}从${fact.oldPos}号位被击退至${fact.behindPos}号位</span>`};
}

export function renderWindAssaultFailFact(fact) {
    return {type:'info', text:`<span class="gray">${fact.label}${fact.reason}</span>`};
}

export function renderMeteorShowerMainFact(fact) {
    return { text:`<span class="gold">${fact.label}伤害加深：${fact.targetName} 额外-${fact.bonusDmg}，防御-${fact.defReduce}</span>` };
}

export function renderMeteorShowerSplashFact(fact) {
    const details = fact.targets.map(t => t.name).join('、');
    return { text:`<span class="orange">${fact.label}溅射：${details}，各-${fact.splashDmg}，防御-${fact.defReduce}</span>` };
}

// ==================== Carry 应用 ====================
export function renderCarryApplyFact(fact) {
    return { type:'info', text:`<span class="gold">👑 carry：${fact.unitName} 获得队友属性加成 攻+${fact.atk} 防+${fact.def} 血上限+${fact.hp}</span>` };
}

// ==================== Buff 召唤 ====================
export function renderHorseSummonFact(fact) {
    return {type:'buff-summon', text:`<span class="gold">🐴 拒马阵：拒马出现在${fact.pos}号位！</span>`, buffType:'summon', horsePos: fact.pos, horseUid: fact.horseUid, horseTaunt: fact.horseTaunt || '嘶——！'};
}

// ==================== 行动跳过 ====================
export function renderPassFact(fact) {
    const { unit, reason } = fact;
    if (reason === '被遮挡') {
        return {
            type:'attack-group', uidA:unit.uid, uidD:null, entries:[], isBlock:true,
            _fxSnapshot: makeFXSnapshot(unit,null), waveTaunt:null, waveUnit:null,
            buffEffects:[], needsSeparator: true, healAmount: 15, healUnitUid: unit.uid,
            _events: fact.events || []
        };
    }
    return {
        type:'attack-group', uidA:unit.uid, uidD:null, entries:[], isBlock:true,
        _fxSnapshot: makeFXSnapshot(unit,null), waveTaunt:null, waveUnit:null,
        buffEffects:[], needsSeparator: true,
        _events: fact.events || []
    };
}

// ==================== 苦练 ====================
export function renderKuLianFact(fact) {
    return { type:'info', text:`<span class="gold">🏋️ 苦练：${fact.unitName} 激励全体队友+${fact.atkBonus}攻+${fact.defBonus}防+${fact.hpBonus}血上限（自身翻倍）！</span>` };
}

// ==================== 概率连击 ====================
export function renderDoubleStrikeFact(fact) {
    if (fact.success) {
        return {type:'info', text:`<span class="gold">⚡ 概率连击触发！</span>`, isDoubleStrikeBanner:true};
    }
    return {type:'info', text:`<span class="gray">⚡ 概率连击触发失败，${fact.unitName} 未能再次攻击</span>`};
}

// ==================== 远程成长 ====================
export function renderRangedGrowthFact(fact) {
    return {type:'detail', text:`<span class="blue small">🏹 ${fact.unitName} 远程熟练：攻击 +${fact.growth} → ${fact.newAtk}</span>`};
}

// ==================== 坚盾 ====================
export function renderFortifyShieldFact(fact) {
    return {type:'detail', text:`<span class="blue small">🛡️ ${fact.unitName} ${fact.label}：防御+${fact.increment}（已叠${fact.current}/${fact.cap}）</span>`};
}

// ==================== 惑心换位 ====================
export function renderMindControlSwapFact(fact) {
    return {type:'buff-swap', uidA: fact.unitA.uid, uidB: fact.unitB.uid, oldPosA: fact.posA, oldPosB: fact.posB, buffType:'swap', text:`<span class="gold">🌀 惑人心智：${fact.posA}号位${fact.unitA.name}与${fact.posB}号位${fact.unitB.name}互换位置！</span>`};
}
export function renderMindControlFailFact(fact) {
    return {type:'info', text:`<span class="gray">🌀 惑人心智${fact.side === 'enemy' ? '敌方' : '己方'}换位失败（${fact.reason}）</span>`};
}

// ==================== 乾坤大挪移 ====================
export function renderQianKunUpgradedFact(fact) {
    return {
        type:'info',
        text:`<span class="gold">🦋 乾坤大挪移（升级版）：减伤${fact.reducePct}%，反弹${fact.rebound}给${fact.attackerName}（${fact.zhangName}自伤${fact.selfDmg}）</span>`,
        reboundDmg: fact.rebound,
        reboundTargetUid: fact.attackerUid,
        selfDmg: fact.selfDmg,
        selfDmgUid: fact.zhangUid
    };
}
export function renderQianKunBasicFact(fact) {
    return {
        type:'info',
        text:`<span class="gold">✨ 乾坤大挪移：减伤${fact.reducePct}%，反弹${fact.rebound}给${fact.attackerName}（${fact.zhangName}自伤${fact.selfDmg}）</span>`,
        reboundDmg: fact.rebound,
        reboundTargetUid: fact.attackerUid,
        selfDmg: fact.selfDmg,
        selfDmgUid: fact.zhangUid
    };
}

// ==================== 快乐回血 ====================
export function renderKuaiLeHealFact(fact) {
    return {
        type:'info',
        text:`<span class="green">💚 快乐回血：${fact.unitName} 回复${fact.heal}点生命（${fact.layers}层触发），血量 ${fact.hpBefore} → ${fact.hpAfter}</span>`,
        buffType: 'elite_kuaile_heal',
        zhouUid: fact.unitUid,
        zhouHpAfter: fact.hpAfter,
        isHealEntry: true,
        healAmount: fact.heal,
        healUnitUid: fact.unitUid
    };
}

// ==================== 小昭蛛变 ====================
export function renderSpiderTransformFact(fact) {
    return { type:'info', text:`<span class="gold">🕷️ 蛛变：${fact.unitName} 变换为<span class="gold">${fact.newRole}</span>（已精通${fact.mastered}/4）</span>` };
}
export function renderSpiderReturnFact(fact) {
    return { type:'info', text:`<span class="gold">🕷️ 蛛落：${fact.unitName} 从天而降，落在${fact.pos}号位！</span>` };
}
export function renderSpiderStrikeFact(fact) {
    return { type:'info', text:`<span class="gold">🕷️ 蛛袭：${fact.unitName} 落地攻击 ${fact.targetName}，穿透${fact.penetrationDmg} + 精通${fact.extraDmg} = ${fact.totalDmg} 伤害！</span>`, uidA: fact.unitUid, uidD: fact.targetUid, isDead: fact.isDead, isSpiderStrike: true, needsSeparator: true };
}

// ==================== 玄冥神掌 ====================
export function renderXuanmingDotFact(fact) {
    return { type:'info', text:`<span class="purple">❄️ 玄冥神掌寒毒发作，${fact.unitName} 受到 ${fact.dot} 点伤害</span>`, uidD: fact.uidD, isDead: fact.isDead, dmg: fact.dot };
}
export function renderXuanmingPoisonedFact(fact) {
    return { type:'info', text:`<span class="purple">❄️ ${fact.attackerName} 的玄冥神掌使 ${fact.targetName} 中毒！每回合损失生命（${fact.dotPercents.join('%→')}%→消失）</span>` };
}

// ==================== 成昆幻影伪装 ====================
export function renderPhantomDisguiseHealFact(fact) {
    return { type:'info', text:`<span class="green">🎭 幻影伪装：${fact.unitName} 回复 ${fact.heal} 点生命</span>` };
}

// ==================== 宋青书新婚 / 性奋 ====================
export function renderXingFenRetryFact(fact) {
    return { type:'info', text:`<span class="gold">💗 性奋：${fact.unitName} 获得额外攻击机会！</span>` };
}
export function renderXinHunFact(fact) {
    return {
        type:'info',
        text:`<span class="gold">💒 新婚：${fact.attackerName}攻击，${fact.targetName}被扣除${fact.hpDeduct}点血量，叠加一层快乐(${Math.round(fact.healPct*100)}%)！当前快乐层数：${fact.stackCount}</span>`,
        buffType:'elite_xinhun',
        zhouUid: fact.zhouUid,
        zhouHpAfter: fact.zhouHpAfter
    };
}
export function renderXingFenCostFact(fact) {
    return { type:'info', text:`<span class="red">💗 性奋代价：${fact.unitName} 血量上限 ${fact.oldMaxHp} → ${fact.newMaxHp}（-${fact.penalty}）</span>` };
}

// ==================== 张无忌九阳 / 融会贯通 ====================
export function renderNineYangHealFact(fact) {
    return { type:'info', text:`<span class="green">☀️ 九阳神功回复+${fact.heal}，${fact.hpBefore}→${fact.hpAfter}</span>`, isHealEntry:true, healAmount:fact.heal, healUnitUid:fact.unitUid };
}
export function renderRongHuiBonusFact(fact) {
    return { type:'info', text:`<span class="red">🔥 融会贯通额外+${fact.extra}（目标攻击${fact.targetAtk} 防御${fact.targetDef}，差值绝对值×50%）</span>` };
}

// ==================== 韦一笑吸血 ====================
export function renderWeiLeechFact(fact) {
    return { type:'info', text:`<span class="green">🦇 青翼蝠王·吸血+${fact.heal}，上限→${fact.newMaxHp}</span>`, isHealEntry:true, healAmount:fact.heal, healUnitUid:fact.unitUid };
}

// ==================== 小昭·姊 乾坤衍生 / 蝶变 ====================
export function renderQianKunDerivedFact(fact) {
    return {
        type:'info',
        text:`<span class="gold">🦋 乾坤衍生：${fact.targetName}减伤${fact.reduce}，${fact.healTargetName}治疗+${fact.heal}，${fact.atkTargetName}攻击+${fact.atkGain}</span>`,
        isHealEntry: true,
        healAmount: fact.heal,
        healUnitUid: fact.healTargetUid,
        buffType: 'qiankun_atk',
        atkGain: fact.atkGain,
        atkTargetUid: fact.atkTargetUid
    };
}
export function renderButterflyAttachFact(fact) {
    return { type:'info', text:`<span class="gold">🦋 蝶变：${fact.sisterName} 化为蝴蝶附身于 ${fact.hostName}！方向：${fact.flyDirection === 'left' ? '←左' : '右→'} 攻+${fact.atkTransfer} 防+${fact.defTransfer} 血上限+${fact.hpTransfer}</span>`, needsSeparator: true };
}
export function renderButterflyNoHostFact(fact) {
    return { type:'info', text:`<span class="red">🦋 蝶变：${fact.unitName} 无队友可附身，香消玉殒！</span>` };
}
export function renderButterflyReturnFact(fact) {
    return { type:'info', text:`<span class="gold">🦋 蝶变：${fact.sisterName} 从 ${fact.hostName} 飞回，恢复原形！攻 ${fact.sisterAtk} 防 ${fact.sisterDef} 血 ${fact.sisterHp}</span>`, needsSeparator: true };
}
export function renderButterflyHostDeadFact(fact) {
    return { type:'info', text:`<span class="gold">🦋 蝶变：宿主已阵亡，${fact.sisterName} 被迫返回！</span>`, uidD: fact.sisterUid, isDead: fact.isDead };
}

// ==================== 小昭·妹 飞天 / 拒马 / 连击 ====================
export function renderSpiderFlyFact(fact) {
    return { type:'info', text:`<span class="gold">🕷️ 飞天：${fact.unitName} ${fact.reason}，免疫本次攻击的 ${fact.incomingDmg||0} 点伤害，化为蜘蛛遁走！剩余次数：${fact.remaining}</span>` };
}
export function renderXiaoZhaoHorseFact(fact) {
    return {type:'buff-summon', text:`<span class="gold">🐴 小昭·妹的拒马在${fact.pos}号位出现！</span>`, buffType:'summon', horsePos: fact.pos, horseUid: fact.horseUid, horseTaunt: '嗷——！'};
}
export function renderSpiderDoubleStrikeFact(fact) {
    return {type:'info', text:`<span class="gold">🕷️ 蝶击：小昭·妹永久概率连击触发！</span>`, isDoubleStrikeBanner:true};
}

// ==================== 行动跳过（眩晕/飞天） ====================
export function renderStunSkipFact(fact) {
    return { type:'info', text:`<span class="gray">💫 ${fact.unitName} 被眩晕，无法响应攻击指令</span>` };
}
export function renderFlySkipFact(fact) {
    return { type:'info', text:`<span class="gray">🕷️ ${fact.unitName} 正在飞天，无法行动</span>` };
}

// ==================== 战士斩杀 ====================
export function renderWarriorExecuteFact(fact) {
    return { text:`<span class="red">⚔️ 战士斩杀！${fact.unitName} 直接击杀 ${fact.targetName}！</span>` };
}

// ==================== 击杀行 ====================
export function renderKillLineFact(fact) {
    return { text:`<span class="damage-line brush-red ${fact.ac}">💀击杀💀 ${fact.campA} ${fact.unitName}</span> 造成 <span class="red">${fact.dmg}</span> 伤害，<span class="${fact.dc}">${fact.campD} ${fact.targetName}</span> ${fact.hpBefore} → ${fact.hpNow} 💀阵亡` };
}

// ==================== 巨马反伤 / 严阵以待反弹 ====================
export function renderHorseReboundFact(fact) {
    return { text:`<span class="red">🐴 巨马反伤：${fact.unitName} 受到 ${fact.rebound} 点反伤</span>` };
}
export function renderFortifyReboundFact(fact) {
    if (fact.hasSister) {
        return { text:`<span class="gold">🛡️ 严阵以待反弹${fact.reboundDmg}给${fact.unitName}（姐姐强化：回复${fact.reboundDmg}）</span>` };
    }
    return { text:`<span class="gold">🛡️ 严阵以待反弹${fact.reboundDmg}给${fact.unitName}</span>` };
}

// ==================== 流星溅射成长 ====================
export function renderMeteorSplashGrowthFact(fact) {
    return { text:`<span class="gold">⚡ ${fact.unitName} 攻击+${fact.growth}</span>` };
}

// ==================== 回合分隔线 / 概率连击摘要 ====================
export function renderRoundStartFact(fact) {
    return { type:'round-start', text:`<div class="separator">———— 第${fact.round}回合开始 ————</div>` };
}
export function renderRoundEndFact(fact) {
    return { type:'round-end', text:`<div class="separator">———— 第${fact.round}回合结束 ————</div>` };
}
export function renderDoubleStrikeSummaryFact(fact) {
    return { type:'buff-summary', text:`<span class="gold">⚡ 概率连击：${fact.unitName} 80%概率额外攻击一次</span>`, buffType:'buff_stat' };
}

// ==================== 通用渲染入口 ====================
export function renderLog(type, data) {
    switch(type) {
        case 'miss': return renderMissFact(data);
        case 'dodge': return renderDodgeFact(data);
        case 'attack': return renderAttackFact(data);
        case 'emptyTarget': return renderEmptyTargetFact(data);
        case 'immune': return renderImmuneFact(data);
        case 'drop': return renderDropFact(data);
        case 'breakDef': return renderBreakDefFact(data);
        case 'horseDestroy': return renderHorseDestroyFact(data);
        case 'zhangSwitch': return renderZhangSwitchFact(data);
        case 'buffSummary': return renderBuffSummaryFact(data.buff, data.allyTeam, data.doubleStrikeUid);
        case 'carryApply': return renderCarryApplyFact(data);
        case 'horseSummon': return renderHorseSummonFact(data);
        case 'pass': return renderPassFact(data);
        case 'kuLian': return renderKuLianFact(data);
        case 'doubleStrike': return renderDoubleStrikeFact(data);
        case 'rangedGrowth': return renderRangedGrowthFact(data);
        case 'fortifyShield': return renderFortifyShieldFact(data);
        case 'mindControlSwap': return renderMindControlSwapFact(data);
        case 'mindControlFail': return renderMindControlFailFact(data);
        case 'qianKunUpgraded': return renderQianKunUpgradedFact(data);
        case 'qianKunBasic': return renderQianKunBasicFact(data);
        case 'kuaiLeHeal': return renderKuaiLeHealFact(data);
        case 'spiderTransform': return renderSpiderTransformFact(data);
        case 'spiderReturn': return renderSpiderReturnFact(data);
        case 'spiderStrike': return renderSpiderStrikeFact(data);
        case 'xuanmingDot': return renderXuanmingDotFact(data);
        case 'xuanmingPoisoned': return renderXuanmingPoisonedFact(data);
        case 'phantomDisguiseHeal': return renderPhantomDisguiseHealFact(data);
        case 'xingFenRetry': return renderXingFenRetryFact(data);
        case 'xinHun': return renderXinHunFact(data);
        case 'xingFenCost': return renderXingFenCostFact(data);
        case 'nineYangHeal': return renderNineYangHealFact(data);
        case 'rongHuiBonus': return renderRongHuiBonusFact(data);
        case 'weiLeech': return renderWeiLeechFact(data);
        case 'qianKunDerived': return renderQianKunDerivedFact(data);
        case 'butterflyAttach': return renderButterflyAttachFact(data);
        case 'butterflyNoHost': return renderButterflyNoHostFact(data);
        case 'butterflyReturn': return renderButterflyReturnFact(data);
        case 'butterflyHostDead': return renderButterflyHostDeadFact(data);
        case 'spiderFly': return renderSpiderFlyFact(data);
        case 'xiaoZhaoHorse': return renderXiaoZhaoHorseFact(data);
        case 'spiderDoubleStrike': return renderSpiderDoubleStrikeFact(data);
        default: throw new Error(`未知渲染类型: ${type}`);
    }
}