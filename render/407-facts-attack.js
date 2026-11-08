// render/407-facts-attack.js — fact 渲染域：攻击流程
// 归属判据：这条 fact 描述「一次攻击的经过与结果」，不含 buff / 精英技能衍生。
// 加新攻击类 fact：在本文件写函数 + registerFactRenderer 一行，不碰 render/30。

import { makeFXSnapshot, fmtHp, fmtHpText, fmt1, fmtNum, fmtAtk } from '../infra/102-core-utils.js';
import { getStat } from '../core/214-battle-shared.js';
import { FACT_TYPES, CAMP_TYPES, DROP_TYPES } from '../infra/106-battle-enums.js';
import { registerFactRenderer, getFactRenderer, renderLog, projectFactEntry } from './406-fact-registry.js';
// V1.5.7 | 2026-11-08 计算明细负攻口径：公式项与 baseRaw 打印前过 fmtAtk（<0 显示 0），与格子/波动行一致
// V1.5.8 | 2026-11-08 破防行防御减数值走 fmtNum（reduce 是实数，裸插值会出浮点尾巴）
// V1.5.9 | 2026-11-08 体检转交：计算行支持负项明细（core/217 DMG_REDUCTION 以负值入列）；
//         | 移除死渲染分支（dmgCalc.thunderBonus / trueDmg 全仓无赋值、hornDefIgnore/hornDmgMultiplier 恒 0/1，
//         | 鹤笔翁金句里写死的 +50% 与配置 +30% 也对不上）。
// V1.5.10 | 2026-11-08 体检转交：伤害/护盾吸收行补 unitUid + hpBefore + hpAfterReal（护盾与扣血可归账）
// V1.5.11 | 2026-11-08 体检转交：未命中/闪避渲染补挂 phantomFact（幻影改目标那击可查）；
//         | 免疫组 hpAfter 改取事实里的实数 fact.targetHp（原来取 target.hp，而 immune 事实只带 uid/name/camp）
// V1.5.12 | 2026-11-08 伤害行与血条对不上：波动减伤 hpBonus 在扣血时已抵掉，显示 dmg 却仍按原值印
//         | （「造成 18」血条只掉 13）→ 伤害行/飘字/语音 _dmg 统一改印 dmg−hpBonus（下限 0）；
//         | fact 里的 dmgCalc.dmg/dmgResult.dmg 不动（吸血/反伤/破防与体检 180 仍按原值）。
export const VER = 'render/407-facts-attack.js V1.5.12';

// 攻击流程
export function renderMissFact(fact) {
    const ac = fact.attacker.camp === CAMP_TYPES.ALLY ? 'blue' : 'orange';
    const dc = fact.target.camp === CAMP_TYPES.ALLY ? 'blue' : 'orange';
    const campA = fact.attacker.camp === CAMP_TYPES.ALLY ? '明教' : '六大派';
    const campD = fact.target.camp === CAMP_TYPES.ALLY ? '明教' : '六大派';
    const missEntries = [
        // 格式对齐命中：带攻/防/血，不再只写"XXX 的攻击"
        {type:'combat-text', text:`<span class="${ac}">${campA} ${fact.attacker.name}</span>(攻${fmtAtk(fmtNum(fact.attacker.atk))} 血${fmtHpText(fact.attacker.hp)}) → <span class="${dc}">${campD} ${fact.target.name}</span>(防${fmtNum(fact.target.def)} 血${fmtHpText(fact.target.hp)})`},
        {type:'info', text:`<span class="gray">未命中！</span>`}
    ];
    // 幻影/迷心改目标的那一击被闪避/打空时，命中组不生成，phantomFact 由 core/209 挂在 MISS 上，这里补渲染
    if (fact.phantomFact) { const _pf = renderLog(fact.phantomFact.factType, fact.phantomFact.data); if (_pf) missEntries.push(_pf); }
    return {
        type:'attack-group',
        uidA: fact.attacker.uid,
        uidD: fact.target.uid,
        entries: missEntries,
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

    dodgeGroup.entries.push({type:'combat-text', text:`<span class="${ac}">${campA} ${unit.name}</span>(攻${fmtAtk(fact.attackerAtk)} 血${fmtHpText(fact.attackerHpBefore)}) → <span class="${dc}">${campD} ${target.name}</span>(防${fmtNum(fact.dodgerDef)} 血${fmtHpText(fact.dodgerHp)})`});
    // 幻影/迷心改目标的那一击被闪避时同样补渲染（core/209 把 phantomFact 挂在 DODGE 数据上）
    if (fact.phantomFact) { const _pf = renderLog(fact.phantomFact.factType, fact.phantomFact.data); if (_pf) dodgeGroup.entries.push(_pf); }
    dodgeGroup.entries.push({type:'damage-text', deadFlag: dodgeGroup.isDead, text:`<span class="red">🦅 ${target.name}闪避并反击 → ${unit.name} 造成 ${fmtNum(fact.reboundDmg)} 真实伤害（${fmtHpText(fact.attackerHpBefore)} → ${fmtHpText(fact.attackerHpAfter)}）</span>`});

    if (fact.weiHeal) {
        const healText = fact.weiHeal.oldMaxHp !== undefined
            ? `<span class="green">🦇 青翼蝠王·闪避反击吸血+${fmtNum(fact.weiHeal.heal)}，上限${fmtNum(fact.weiHeal.oldMaxHp)}→${fmtNum(fact.weiHeal.newMaxHp)}</span>`
            : `<span class="green">🦇 青翼蝠王·闪避反击吸血+${fmtNum(fact.weiHeal.heal)}，上限→${fmtNum(fact.weiHeal.newMaxHp)}</span>`;
        dodgeGroup.entries.push({type:'info', text:healText, isHealEntry:true, healAmount:fact.weiHeal.heal, healUnitUid:target.uid});
    }

    if (dodgeGroup.isDead) {
        dodgeGroup.hpAfter = 0;
        // 出手前血量就已 <= 0（待死单位被额外攻击请求带进来，或上一击已致死）：
        //   他不是被这次反击打死的，写「被反击击杀」会读成「0 血还能被反杀」。
        //   fact.attackerHpBefore 是闪避判定那一刻的血量，用它区分「本来就没血」与「反击致死」。
        const wasAlreadyDown = typeof fact.attackerHpBefore === 'number' && fact.attackerHpBefore <= 0;
        dodgeGroup.entries.push({type:'info', text: wasAlreadyDown
            ? `<span class="gray">${unit.name} 已无余力，反击未及落下便已倒下</span>`
            : `${unit.name}被反击击杀！`});
    } else if (fact.stunned === false) {
        // 控制免疫（寒离飒）实际没被眩晕，不再写「本回合无法行动」的假账
        dodgeGroup.entries.push({type:'info', text:`<span class="gray">${unit.name} 被反击（免疫眩晕，可正常行动）</span>`});
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
    // 波动减伤 hpBonus 在扣血时抵掉（core/12 hpLoss=max(0,dmg-hpBonus)），但 dmg 本身留给吸血/反伤/破防用。
    //   显示口径必须跟着掉血走，否则出现「造成 18」而血条只掉 13；扣到 0 为止，不出现负伤害。
    const shownDmg = Math.max(0, (dmgResult.dmg || 0) - (dmgCalc.hpBonus || 0));
    const ac = unit.camp === CAMP_TYPES.ALLY ? 'blue' : 'orange';
    const dc = target.camp === CAMP_TYPES.ALLY ? 'blue' : 'orange';
    const campA = unit.camp === CAMP_TYPES.ALLY ? '明教' : '六大派';
    const campD = target.camp === CAMP_TYPES.ALLY ? '明教' : '六大派';
    const displayAtk = fmtAtk(snap.attackerAtkDisplay !== undefined ? snap.attackerAtkDisplay : Math.floor(getStat(unit, 'atk')));
    const displayDef = snap.targetDefDisplay !== undefined ? snap.targetDefDisplay : Math.floor(getStat(target, 'def'));
    const unitHpBefore = snap.attackerHp !== undefined ? snap.attackerHp : fmtHp(unit.hp);
    const targetHpAfter = snap.targetHpAfter !== undefined ? snap.targetHpAfter : fmtHp(target.hp);
    const targetAlive = snap.targetAlive !== undefined ? snap.targetAlive : target.alive;
    const unitRole = snap.attackerRole || unit.role;
    const isZhangNear = snap.attackerIsZhangNear !== undefined ? snap.attackerIsZhangNear : (unit.isZhang && !unit.rangedForm);
    const nearAtkCount = snap.attackerNearAtkCount !== undefined ? snap.attackerNearAtkCount : unit.nearAtkCount;
    const isKuLianAttack = snap.isKuLianAttack !== undefined ? snap.isKuLianAttack : !!(unit.isSongQingshu && unit.state._kuLianActive);
    const isLinkAttack = snap.isLinkAttack !== undefined ? snap.isLinkAttack : !!unit.state._isLinkAttack;
    // 被动出手徽章：反击/跟随/随动/联动/追击在战报行内加金色标签，一眼区分普攻
    const linkReason = snap.linkReason !== undefined ? snap.linkReason : (unit.state ? unit.state._linkReason : null) || null;
    const fxSnapshot = snap.attackerPos !== undefined && snap.targetPos !== undefined
        ? { attackerPos: snap.attackerPos, defenderPos: snap.targetPos }
        : makeFXSnapshot(unit, target);
    const killLine = dmgResult.dead || dmgResult.executeKill;
    // 斩杀图标顺序：伤害行的 💀 只认「本击直接打死」（dmgResult.dead）。
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
        _dmg: shownDmg,
        _isZhangNear: isZhangNear,
        _nearAtkCount: nearAtkCount,
        hpPctBefore: fact.hpPctBefore,
        hpPctAfter: fact.hpPctAfter,
        isMiss:false, isDodge:false, buffEffects:[], needsSeparator: true,
        isKuLianAttack,
        isLinkAttack,
        linkReason,
        isDashStrikeFx: fact.isDashStrikeFx
    };
    // 被动出手行内徽章：普攻无前缀，反击/跟随等带金色【标签】——不用翻日志也知道这一手是什么
    const LINK_TAGS = { counterAttack: '反击', followAttack: '跟随', lionFollow: '随动', xuanmingLink: '联动', chaseAttack: '追击', doubleStrike: '连击', bloodthirst: '嗜血', xiaoZhaoDoubleMiss: '双击' };
    const linkTag = LINK_TAGS[linkReason] ? `<span class="gold">【${LINK_TAGS[linkReason]}】</span>` : '';
    group.entries.push({type:'combat-text', text:`${linkTag}<span class="${ac}">${campA} ${unit.name}</span>(攻${displayAtk} 血${fmtHpText(unitHpBefore)}) → <span class="${dc}">${campD} ${target.name}</span>(防${displayDef} 血${fmtHpText(dmgResult.hpBefore)})`});
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
    group.entries.push({type:'detail', text:`<span class="gray small">波动：攻${fmtAtk(dmgCalc.atkBase)}→${fmtAtk(dmgCalc.atkAct)} 防${fmtNum(dmgCalc.defBase)}→${fmtNum(dmgCalc.defAct)} 减伤${fmtNum(dmgCalc.hpBonus)}</span>`});
    // 公式明细由引擎输出（core/12 calcFinalDamage 的 formula 字段），此处只排版。
    // 不再自己调 calcDamage / 查 FANG_K / 反推 baseRaw —— 那会和引擎的实时值打架。
    let formulaText = '';
    // 加成明细：正项「+」、负项「-」（DMG_REDUCTION 减伤以负值入列，此前只保留 >0 会把减伤吞掉）
    const fmtBonusEntries = (dmgCalc.bonusDmgEntries || []).filter(e => e.value !== 0);
    // 乘数不再只显示 >1：嘲讽减伤（×0.4）也必须落在计算行上，否则玩家看不到伤害为何变小
    const fmtMultiplierEntries = (dmgCalc.dmgMultiplierEntries || []).filter(e => e.value !== 1);
    const fm = dmgCalc.formula;
    let runningRaw = fm ? fm.baseRaw : 0;
    // 计算明细与格子/波动行同口径（fmtAtk）：负攻真值（<0）一律印成 0，
    //   否则会出现「攻-5 → 防20 → 伤害1」这种自相矛盾的明细。只改显示，不动 baseRaw/各项 value。
    const fmtTermText = (text) => String(text).replace(/-?\d+(?:\.\d+)?/g, n => (Number(n) < 0 ? '0' : n));
    if (fm) formulaText = `${fm.terms.map(t => fmtTermText(t.text)).join(' + ')} = ${fmt1(fmtAtk(fm.baseRaw))}`;
    for (const e of fmtBonusEntries) {
        runningRaw += e.value;
        const op = e.value > 0 ? '+' : '-';
        formulaText += ` ${op} ${e.label}${fmt1(Math.abs(e.value))} = ${fmt1(runningRaw)}`;
    }
    for (const e of fmtMultiplierEntries) {
        runningRaw = Math.round(runningRaw * e.value * 10) / 10;
        formulaText += ` ×${e.value} ${e.label}=${fmt1(runningRaw)}`;
    }
    // 乾坤减伤进计算行（老板拍板格式「19.44-30% 减伤=14」）：乾坤走 query 通道
    // 不进上面两条链（不加成、不乘数，直接改最终值），此前公式与实际掉血对不上、中间差一块看不见。
    // 减伤档（reducePct）和减后值都在乾坤 entry 里，从 dmgResult.bonusEntries 取；
    // 多条乾坤同时命中时逐条追加（每条按上一条结果继续减），与引擎实际计算顺序一致。
    const qkEntries = ((dmgResult && dmgResult.bonusEntries) || []).filter(e => e && (e.factType === FACT_TYPES.QIAN_KUN_UPGRADED || e.factType === FACT_TYPES.QIAN_KUN_BASIC));
    for (const e of qkEntries) {
        const pct = Math.round((e.data && e.data.reducePct || 0) * 100);
        if (pct <= 0) continue;
        runningRaw = Math.round(runningRaw * (1 - pct / 100) * 10) / 10;
        formulaText += ` -${pct}% 减伤=${fmt1(runningRaw)}`;
    }
    group.entries.push({type:'detail', isDamageCalc:true, text:`<span class="gray small">计算：${formulaText}</span>`});
    const damageText = directKill
        ? renderKillLineFact({
            ac, dc, campA, campD,
            unitName: unit.name,
            dmg: fmt1(shownDmg),
            targetName: target.name,
            hpBefore: fmtHpText(dmgResult.hpBefore),
            hpNow: fmtHpText(targetHpAfter)
        }).text
        : `<span class="damage-line ${ac}">${campA} ${unit.name}</span> 造成 <span class="red">${fmt1(shownDmg)}</span> 伤害，<span class="${dc}">${campD} ${target.name}</span> ${fmtHpText(dmgResult.hpBefore)} → ${fmtHpText(targetHpAfter)} ${dmgResult.dead?'💀阵亡':''}`;
    // 灭绝师太：出手计数提示挂在伤害行末（hint 文本由 modules/26 随 fact 下发）
    // dmg：player/46 播到这行时用它弹伤害飘字（原先飘字由 fx/88 在命中后 1100ms 打，
    //   已改为「播到伤害行同帧打」，所以这里必须把数值带出来）。
    //   取值与上面 damageText 里显示的完全同源（都是 shownDmg＝dmg−hpBonus），数字与文案一致。
    group.entries.push({
        type:'damage-text',
        deadFlag: directKill,
        dmg: fmtNum(shownDmg),
        // 2026-11-04 补丢字段：player/46 发飘字与血条预演的门槛是 dmg>0 且 hpAfter!==undefined——
        //   飘字从 fx 层搬到 player 层时只带出了 dmg，hpAfter 忘带 → 全仓普攻掉血飘字集体哑火（老板实锤三轮）
        hpAfter: targetHpAfter,
        // 护盾吸收行可归账（体检转交）：补目标 uid + 减伤/护盾前的实数血量与结算后实数血量，
        //   hpAfter 保持显示口径（规则 199 要求与组 hpAfter 严格同源，不能改成实数）。
        unitUid: target.uid,
        hpBefore: dmgResult.hpBefore,
        hpAfterReal: snap.targetHpAfterReal !== undefined ? snap.targetHpAfterReal : targetHpAfter,
        _shield: dmgResult._shield,
        _permShield: dmgResult._permShield,
        text: damageText + (fact.miejueHint || '')
    });
    if (fact.entries) {
        const leadEntries = [];   // 组内报幕（周颠·癫的出手开场白）：压到组首 → 分隔线之后、攻击头行之前
        for (const e of fact.entries) {
            if (e && e.factType === FACT_TYPES.BREAK_DEF) continue; // 已前置到攻击组开头
            // 无渲染声明的 fact（58 显式 renderFn:false）→ projectFactEntry 返回 null，跳过，避免 null 流入 entries 在 player/46 崩
            if (e && e.factType) {
                const _re = projectFactEntry(e);
                if (!_re) continue;
                if (e.factType === FACT_TYPES.SKILL_ANNOUNCE) leadEntries.push(_re);
                else group.entries.push(_re);
            }
            else group.entries.push(e);
        }
        if (leadEntries.length) group.entries.unshift(...leadEntries);
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
            text:`<span class="${ac}">${campA} ${unit.name}</span>(攻${fmtAtk(fact.attackerAtk)} 血${fmtHpText(fact.attackerHp)}) → <span class="${dc}">${campD} ${target.name}</span>(防${fact.targetDef} 血${fmtHpText(fact.targetHp)})`
        }],
        hpAfter: fact.targetHp,
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
    // 把波动行、伤害行照样补全（与命中战斗同款，只是结果被免疫）
    if (fact.dmgCalc) {
        const calc = fact.dmgCalc;
        immuneGroup.entries.push({type:'detail', text:`<span class="gray small">波动：攻${fmtAtk(calc.atkBase)}→${fmtAtk(calc.atkAct)} 防${fmtNum(calc.defBase)}→${fmtNum(calc.defAct)} 减伤${fmtNum(calc.hpBonus)}</span>`});
        immuneGroup.entries.push({
            type: 'damage-text',
            dmg: 0,
            // 护盾吸收/完全免疫行同样补归账字段（体检转交）：命中目标 uid + 结算前后血量（未掉血，两者相同）
            unitUid: target.uid,
            hpBefore: fact.targetHp,
            hpAfter: fact.targetHp,
            text: `<span class="damage-line ${ac}">${campA} ${unit.name}</span> 造成 <span class="red">0</span> 伤害（原本可造成 ${Math.round(calc.dmg)} 伤害被吸收），<span class="${dc}">${campD} ${target.name}</span> ${fmtNum(fact.targetHp)} → ${fmtNum(fact.targetHp)}`
        });
    }

    if (fact.flyData) {
        // 跨域取小昭·妹飞天渲染器（实现住在精英域），走注册表查表以免 34 ↔ 37 互相 import
        immuneGroup.entries.push(getFactRenderer(FACT_TYPES.SPIDER_FLY)(fact.flyData));
    } else if (fact.reason) {
        immuneGroup.entries.push({type:'info', text:`<span class="gold">🛡️ ${unit.name} 的攻击被 ${target.name} 完全挡下：${fact.reason}</span>`});
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
    // 补 fx 标记：破防有头顶飘字特效（🛡-2），应在播放时被认定为“效果行”，走较慢的停留时间
    return { type: 'detail', text: `<span class="purple small">🗡️ ${fact.attackerName} 破防：${fact.targetName} 防御 -${fmtNum(fact.reduce)}</span>`, fx: [{ kind: 'def', amount: fact.reduce }] };
}

// 何太冲技能报幕（连环箭·补射 / 昆仑合击 ×N）：note 为战报文本整行。
//   line===false（破甲箭：只做伤害行后缀 + 目标格飘字）时返回 null → renderLog 返回 null，
//   该 fact 的 stageAction（SKILL_FLOAT 飘字）仍由 player/42 在「无渲染」分支照常播放。
export function renderSkillAnnounceFact(fact) {
    if (!fact || fact.line === false) return null;
    // needsSeparator 由发射方按需声明（当前仅标枪·突进 true）：播放层 shouldStartNewGroup 读它画「- - - - -」，
    //   让这条播报自成一段、不与上一单位的攻击组粘连。其余 SKILL_ANNOUNCE（何太冲/灭绝/鹰王报幕）不带此字段，行为不变。
    return { type:'info', text:`<span class="gold">${fact.note}</span>`, needsSeparator: fact.needsSeparator === true };
}

// 击杀行
export function renderKillLineFact(fact) {
    return { text:`<span class="damage-line brush-red ${fact.ac}">💀击杀💀 ${fact.campA} ${fact.unitName}</span> 造成 <span class="red">${fmtNum(fact.dmg)}</span> 伤害，<span class="${fact.dc}">${fact.campD} ${fact.targetName}</span> ${fact.hpBefore} → ${fact.hpNow} 💀阵亡` };
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
