// render/34-facts-attack.js — fact 渲染域：攻击流程
// V1.5.0 | 2026-10-16 被动出手行内徽章：反击/跟随/随动/联动/追击的攻击行前缀金色【标签】（普攻无前缀），
//   group 新增 linkReason 透传；数据来自 core/10 → core/12 的 _linkReason 链路
// V1.4.1 | ~16600 bytes | 2026-10-13 斩杀图标顺序修正：伤害行的 💀击杀/💀阵亡 与 brush-red 底改判 dmgResult.dead
//   （本击直接打死），战士斩杀（executeKill）时血线未归零 → 伤害行不标 💀，阵亡标记由 render/35 斩杀行统一出；
//   group.isDead 仍取 killLine（dead||executeKill），死亡特效/尸体清理不受影响（133 规则依赖）。
//
// 归属判据：这条 fact 描述「一次攻击的经过与结果」，不含 buff / 精英技能衍生。
// 加新攻击类 fact：在本文件写函数 + registerFactRenderer 一行，不碰 render/30。

import { makeFXSnapshot, fmtHp } from '../infra/51-core-utils.js';
import { getStat } from '../core/13battle-shared.js';
import { getMechanicField } from '../core/01config-5v5-test.js';
import { FACT_TYPES, CAMP_TYPES, DROP_TYPES, MECHANIC_EFFECT_TYPES } from '../infra/56-battle-enums.js';
import { registerFactRenderer, getFactRenderer, renderLog, projectFactEntry } from './33-fact-registry.js';
export const VER = 'render/34-facts-attack.js V1.5.0';

// 攻击流程
export function renderMissFact(fact) {
    const ac = fact.attacker.camp === CAMP_TYPES.ALLY ? 'blue' : 'orange';
    const dc = fact.target.camp === CAMP_TYPES.ALLY ? 'blue' : 'orange';
    const campA = fact.attacker.camp === CAMP_TYPES.ALLY ? '明教' : '六大派';
    const campD = fact.target.camp === CAMP_TYPES.ALLY ? '明教' : '六大派';
    return {
        type:'attack-group',
        uidA: fact.attacker.uid,
        uidD: fact.target.uid,
        entries: [
            // 2026-09-16 格式对齐命中：带攻/防/血，不再只写"XXX 的攻击"
            {type:'combat-text', text:`<span class="${ac}">${campA} ${fact.attacker.name}</span>(攻${Math.floor(fact.attacker.atk)} 血${fmtHp(fact.attacker.hp)}) → <span class="${dc}">${campD} ${fact.target.name}</span>(防${Math.floor(fact.target.def)} 血${fmtHp(fact.target.hp)})`},
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
    const ac = unit.camp === CAMP_TYPES.ALLY ? 'blue' : 'orange';
    const dc = target.camp === CAMP_TYPES.ALLY ? 'blue' : 'orange';
    const campA = unit.camp === CAMP_TYPES.ALLY ? '明教' : '六大派';
    const campD = target.camp === CAMP_TYPES.ALLY ? '明教' : '六大派';

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
    } else {
        dodgeGroup.entries.push({type:'info', text:`<span class="gray">😵 ${unit.name} 被反击眩晕，本回合无法行动！</span>`});
    }

    return dodgeGroup;
}

export function renderAttackFact(fact) {
    const unit = fact.attacker;
    const target = fact.target;
    const dmgCalc = fact.dmgCalc;
    const dmgResult = fact.dmgResult;
    const snap = fact.snap || {};
    const ac = unit.camp === CAMP_TYPES.ALLY ? 'blue' : 'orange';
    const dc = target.camp === CAMP_TYPES.ALLY ? 'blue' : 'orange';
    const campA = unit.camp === CAMP_TYPES.ALLY ? '明教' : '六大派';
    const campD = target.camp === CAMP_TYPES.ALLY ? '明教' : '六大派';
    const displayAtk = snap.attackerAtkDisplay !== undefined ? snap.attackerAtkDisplay : Math.floor(getStat(unit, 'atk'));
    const displayDef = snap.targetDefDisplay !== undefined ? snap.targetDefDisplay : Math.floor(getStat(target, 'def'));
    const unitHpBefore = snap.attackerHp !== undefined ? snap.attackerHp : fmtHp(unit.hp);
    const targetHpAfter = snap.targetHpAfter !== undefined ? snap.targetHpAfter : fmtHp(target.hp);
    const targetAlive = snap.targetAlive !== undefined ? snap.targetAlive : target.alive;
    const unitRole = snap.attackerRole || unit.role;
    const isZhangNear = snap.attackerIsZhangNear !== undefined ? snap.attackerIsZhangNear : (unit.isZhang && !unit.rangedForm);
    const nearAtkCount = snap.attackerNearAtkCount !== undefined ? snap.attackerNearAtkCount : unit.nearAtkCount;
    const isKuLianAttack = snap.isKuLianAttack !== undefined ? snap.isKuLianAttack : !!(unit.isSongQingshu && unit.state._kuLianActive);
    const isLinkAttack = snap.isLinkAttack !== undefined ? snap.isLinkAttack : !!unit.state._isLinkAttack;
    // 2026-10-16 被动出手徽章：反击/跟随/随动/联动/追击在战报行内加金色标签，一眼区分普攻
    const linkReason = snap.linkReason !== undefined ? snap.linkReason : (unit.state ? unit.state._linkReason : null) || null;
    const fxSnapshot = snap.attackerPos !== undefined && snap.targetPos !== undefined
        ? { attackerPos: snap.attackerPos, defenderPos: snap.targetPos }
        : makeFXSnapshot(unit, target);
    const killLine = dmgResult.dead || dmgResult.executeKill;
    // 2026-10-13 斩杀图标顺序：伤害行的 💀 只认「本击直接打死」（dmgResult.dead）。
    //   战士斩杀（executeKill）时本击血量未到 0，💀 由后续「⚔️ 战士斩杀」行统一标（render/35），
    //   避免「84 → 43 💀阵亡」这种图标与血线矛盾的行。group.isDead 仍取 killLine，死亡特效不受影响。
    const directKill = !!dmgResult.dead;
    const group = {
        type:'attack-group', uidA:unit.uid, uidD:target.uid,
        attackerName:unit.name, targetName:target.name,
        entries:[],
        hpAfter: targetHpAfter, alive: targetAlive, isDead: killLine,
        waveTaunt: dmgCalc.waveTaunt, waveUnit: dmgCalc.waveUnit,
        unitRole,
        _fxSnapshot: fxSnapshot,
        _dmg: dmgResult.dmg,
        _isZhangNear: isZhangNear,
        _nearAtkCount: nearAtkCount,
        hpPctBefore: fact.hpPctBefore,
        hpPctAfter: fact.hpPctAfter,
        isMiss:false, isDodge:false, buffEffects:[], needsSeparator: true,
        isKuLianAttack,
        isLinkAttack,
        linkReason
    };
    // 被动出手行内徽章：普攻无前缀，反击/跟随等带金色【标签】——不用翻日志也知道这一手是什么
    const LINK_TAGS = { counterAttack: '反击', followAttack: '跟随', lionFollow: '随动', xuanmingLink: '联动', chaseAttack: '追击' };
    const linkTag = LINK_TAGS[linkReason] ? `<span class="gold">【${LINK_TAGS[linkReason]}】</span>` : '';
    group.entries.push({type:'combat-text', text:`${linkTag}<span class="${ac}">${campA} ${unit.name}</span>(攻${displayAtk} 血${unitHpBefore}) → <span class="${dc}">${campD} ${target.name}</span>(防${displayDef} 血${dmgResult.hpBefore})`});
    // 破防日志前置到攻击组最前
    const breakDefEntries = [];
    if (fact.entries) {
        for (const e of fact.entries) {
            if (e && e.factType === FACT_TYPES.BREAK_DEF) breakDefEntries.push(projectFactEntry(e));
        }
    }
    for (const b of breakDefEntries) {
        if (b) group.entries.unshift(b);
    }
    if (fact.phantomFact) { const _pf = renderLog(fact.phantomFact.factType, fact.phantomFact.data); if (_pf) group.entries.push(_pf); }
    group.entries.push({type:'detail', text:`<span class="gray small">波动：攻${dmgCalc.atkBase}→${dmgCalc.atkAct} 防${dmgCalc.defBase}→${dmgCalc.defAct} 减伤${dmgCalc.hpBonus}</span>`});
    if (dmgCalc.thunderBonus > 0) group.entries.push({type:'detail', text:`<span class="red small">💥 混元霹雳劲+${dmgCalc.thunderBonus}真实伤害</span>`});
    if (dmgCalc.hornDefIgnore > 0 && dmgCalc.hornDmgMultiplier > 1) group.entries.push({type:'info', text:`<span class="gold">🦌 目标已中毒（玄冥神掌），鹤笔翁 鹿角杖法伤害+50%！</span>`});
    if (dmgCalc.trueDmg > 0) {
        // 2026-09-29 单一真值源收口：比例取 mechanics 真值（引擎实际读的那份），不读 skills.params 副本
        const rebelRatio = getMechanicField('宋青书', MECHANIC_EFFECT_TYPES.BEFORE_DAMAGE.BONUS_TARGET_CURRENT_HP, 'ratio');
        if (rebelRatio === undefined) throw new Error('缺机制真值: 宋青书.bonusTargetCurrentHp.ratio');
        group.entries.push({type:'detail', text:`<span class="red small">⚔️ 叛逆真伤+${dmgCalc.trueDmg}（目标当前生命${Math.round(rebelRatio * 100)}%）</span>`});
    }
    // 公式明细由引擎输出（core/12 calcFinalDamage 的 formula 字段），此处只排版。
    // 不再自己调 calcDamage / 查 FANG_K / 反推 baseRaw —— 那会和引擎的实时值打架。
    let formulaText = '';
    const fmtBonusEntries = (dmgCalc.bonusDmgEntries || []).filter(e => e.value > 0);
    // 2026-09-23 乘数不再只显示 >1：嘲讽减伤（×0.4）也必须落在计算行上，否则玩家看不到伤害为何变小
    const fmtMultiplierEntries = (dmgCalc.dmgMultiplierEntries || []).filter(e => e.value !== 1);
    const fm = dmgCalc.formula;
    let runningRaw = fm ? fm.baseRaw : 0;
    if (fm) formulaText = `${fm.terms.map(t => t.text).join(' + ')} = ${fm.baseRaw}`;
    for (const e of fmtBonusEntries) {
        runningRaw += e.value;
        formulaText += ` + ${e.label}${e.value} = ${Math.round(runningRaw)}`;
    }
    for (const e of fmtMultiplierEntries) {
        runningRaw = Math.round(runningRaw * e.value);
        formulaText += ` ×${e.value} ${e.label}=${runningRaw}`;
    }
    // 2026-10-07 乾坤减伤进计算行（老板拍板格式「19.44-30% 减伤=14」）：乾坤走 query 通道
    // 不进上面两条链（不加成、不乘数，直接改最终值），此前公式与实际掉血对不上、中间差一块看不见。
    // 减伤档（reducePct）和减后值都在乾坤 entry 里，从 dmgResult.bonusEntries 取；
    // 多条乾坤同时命中时逐条追加（每条按上一条结果继续减），与引擎实际计算顺序一致。
    const qkEntries = ((dmgResult && dmgResult.bonusEntries) || []).filter(e => e && (e.factType === FACT_TYPES.QIAN_KUN_UPGRADED || e.factType === FACT_TYPES.QIAN_KUN_BASIC));
    for (const e of qkEntries) {
        const pct = Math.round((e.data && e.data.reducePct || 0) * 100);
        if (pct <= 0) continue;
        runningRaw = Math.round(runningRaw * (1 - pct / 100));
        formulaText += ` -${pct}% 减伤=${runningRaw}`;
    }
    group.entries.push({type:'detail', isDamageCalc:true, text:`<span class="gray small">计算：${formulaText}</span>`});
    const damageText = directKill
        ? renderKillLineFact({
            ac, dc, campA, campD,
            unitName: unit.name,
            dmg: Math.round(dmgResult.dmg),
            targetName: target.name,
            hpBefore: dmgResult.hpBefore,
            hpNow: targetHpAfter
        }).text
        : `<span class="damage-line ${ac}">${campA} ${unit.name}</span> 造成 <span class="red">${Math.round(dmgResult.dmg)}</span> 伤害，<span class="${dc}">${campD} ${target.name}</span> ${dmgResult.hpBefore} → ${targetHpAfter} ${dmgResult.dead?'💀阵亡':''}`;
    // 2026-09-24 灭绝师太：出手计数提示挂在伤害行末（hint 文本由 modules/26 随 fact 下发）
    group.entries.push({
        type:'damage-text',
        deadFlag: directKill,
        text: damageText + (fact.miejueHint || '')
    });
    if (fact.entries) {
        for (const e of fact.entries) {
            if (e && e.factType === FACT_TYPES.BREAK_DEF) continue; // 已前置到攻击组开头
            // 无渲染声明的 fact（58 显式 renderFn:false）→ projectFactEntry 返回 null，跳过，避免 null 流入 entries 在 player/46 崩
            if (e && e.factType) { const _re = projectFactEntry(e); if (_re) group.entries.push(_re); }
            else group.entries.push(e);
        }
    }
    return group;
}

export function renderEmptyTargetFact(fact) {
    const ac = fact.attacker.camp === CAMP_TYPES.ALLY ? 'blue' : 'orange';
    const campA = fact.attacker.camp === CAMP_TYPES.ALLY ? '明教' : '六大派';
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
    const ac = unit.camp === CAMP_TYPES.ALLY ? 'blue' : 'orange';
    const dc = target.camp === CAMP_TYPES.ALLY ? 'blue' : 'orange';
    const campA = unit.camp === CAMP_TYPES.ALLY ? '明教' : '六大派';
    const campD = target.camp === CAMP_TYPES.ALLY ? '明教' : '六大派';
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
    if (fact.flyData) {
        // 跨域取小昭·妹飞天渲染器（实现住在精英域），走注册表查表以免 34 ↔ 37 互相 import
        immuneGroup.entries.push(getFactRenderer(FACT_TYPES.SPIDER_FLY)(fact.flyData));
    } else if (fact.reason) {
        immuneGroup.entries.push({type:'info', text:`<span class="gold">${fact.reason}</span>`});
    }
    return immuneGroup;
}

// 掉落 / 破防
export function renderDropFact(fact) {
    if (!fact) return null;
    if (fact.kind === DROP_TYPES.TOKEN) {
        return { type:'info', text:`<span class="gold">🔥 圣火令掉落！${fact.killerName} 击杀 ${fact.victimName}，获得1枚圣火令！当前总数：${fact.total}</span>`, fastEntry: true, unitUid: fact.unitUid, dropKind: DROP_TYPES.TOKEN };
    }
    if (fact.kind === DROP_TYPES.CHEST) {
        return { type:'info', text:`<span class="gold">🎁 宝箱掉落！${fact.killerName} 击杀 ${fact.victimName}，获得1个宝箱！当前总数：${fact.total}</span>`, fastEntry: true, unitUid: fact.unitUid, dropKind: DROP_TYPES.CHEST };
    }
    return null;
}

export function renderBreakDefFact(fact) {
    return {type:'detail', text:`<span class="purple small">🗡️ ${fact.attackerName} 破防：${fact.targetName} 防御 -${fact.reduce}</span>`};
}

// 何太冲技能报幕（连环箭·补射 / 昆仑合击 ×N）：note 为战报文本整行。
//   line===false（破甲箭：只做伤害行后缀 + 目标格飘字）时返回 null → renderLog 返回 null，
//   该 fact 的 stageAction（SKILL_FLOAT 飘字）仍由 player/42 在「无渲染」分支照常播放。
export function renderSkillAnnounceFact(fact) {
    if (!fact || fact.line === false) return null;
    return { type:'info', text:`<span class="gold">${fact.note}</span>` };
}

// 击杀行
export function renderKillLineFact(fact) {
    return { text:`<span class="damage-line brush-red ${fact.ac}">💀击杀💀 ${fact.campA} ${fact.unitName}</span> 造成 <span class="red">${fact.dmg}</span> 伤害，<span class="${fact.dc}">${fact.campD} ${fact.targetName}</span> ${fact.hpBefore} → ${fact.hpNow} 💀阵亡` };
}

// ── 注册 ────────────────────────────────────────────────
registerFactRenderer(FACT_TYPES.MISS, renderMissFact);
registerFactRenderer(FACT_TYPES.DODGE, renderDodgeFact);
registerFactRenderer(FACT_TYPES.ATTACK, renderAttackFact);
registerFactRenderer(FACT_TYPES.EMPTY_TARGET, renderEmptyTargetFact);
registerFactRenderer(FACT_TYPES.IMMUNE, renderImmuneFact);
registerFactRenderer(FACT_TYPES.DROP, renderDropFact);
registerFactRenderer(FACT_TYPES.BREAK_DEF, renderBreakDefFact);
registerFactRenderer(FACT_TYPES.SKILL_ANNOUNCE, renderSkillAnnounceFact);
