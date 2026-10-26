// render/35-facts-heal.js — 效果域·回血族 fact 渲染器
// V1.0.0 | 2026-10-18 | ~8500 bytes
//   回血族（吸血/回血/九阳/飞行再生/乾坤衍生/生生不息/白骨爪回复）11 条整块迁入。
//   makeHealRenderer 工厂产物与本族手动版放在一起——「加新回血 = 工厂一行 / 手写」，对照更近。
//   dot 工厂产物（玄冥中毒）不在本族：中毒不是回血，放 misc。
// V1.1.0 | 2026-10-26 | 去锚定化：吸血/热血/快活/乾坤/白骨爪回血 fxAnchors → fx: [{ kind:'heal'|'atk', amount }]
export const VER = 'render/35-facts-heal.js V1.1.0';

import { registerFactRenderer } from './33-fact-registry.js';
import { makeHealRenderer } from './36-generic-renderers.js';
import { FACT_TYPES, BUFF_SUBTYPES } from '../infra/56-battle-enums.js';

// Buff 衍生效果（嗜血/热血）
export function renderBloodthirstLeechFact(fact) {
    const fx = [{ kind: 'heal', amount: fact.leechVal }];
    if (fact.isBrother) {
        return { type:'info', text:`<span class="green">🕷️ 蝶血：${fact.unitName} 嗜血狂刀吸血+${fact.leechVal}</span>`, fx };
    }
    return { type:'info', text:`<span class="green">🗡️ ${fact.unitName} 的嗜血狂刀吸血+${fact.leechVal}</span>`, fx };
}

export function renderHotBloodHealFact(fact) {
    return { type:'info', text:`<span class="green">${fact.tag}：${fact.unitName} 回复+${fact.leech}</span>`, fx: [{ kind: 'heal', amount: fact.leech }] };
}

// 快乐回血
export function renderKuaiLeHealFact(fact) {
    return {
        type:'info',
        text:`<span class="green">💚 快乐回血：${fact.unitName} 回复${fact.heal}点生命（${fact.layers}层触发），血量 ${fact.hpBefore} → ${fact.hpAfter}</span>`,
        fx: [{ kind: 'heal', amount: fact.heal }],
        buffType: BUFF_SUBTYPES.ELITE_KUAILE_HEAL,
        zhouUid: fact.unitUid,
        zhouHpAfter: fact.hpAfter,
        isHealEntry: true,
        healAmount: fact.heal,
        healUnitUid: fact.unitUid
    };
}

// 通用回血：字段 {unitUid, heal, hpBefore/hpAfter 或 newMaxHp, label, icon, mode, anchorVerb}
// 委托 36 的 makeHealRenderer 工厂（三种历史版式）——迁移时按原 mode/icon/label/anchorVerb 传参即逐字节同原样，
// 不传则回落 plusTrail；text 与 fxAnchors 由工厂同源产出，锚点永不哑火（不重造文案模板）
export function renderHealFact(fact) {
    // 第 97 轮修锚点静默失效：fallback 原写死 '回复'——HEAL fact 不传 anchorVerb 时
    //   （如唐文亮回春术）锚点「回复+N」与正文「🌿 回春术+N」不符，飘字永不触发（体检实证 9 处）。
    //   改按 render/36 工厂原设计 anchorVerb || label 兜底（label 与正文同源，锚点恒为正文子串）。
    return makeHealRenderer({
        icon: fact.icon || '💚',
        label: fact.label || '回血',
        mode: fact.mode || 'plusTrail',
        anchorVerb: fact.anchorVerb || fact.label || '回复'
    })(fact);
}

// 成昆幻影伪装
export const renderPhantomDisguiseHealFact = makeHealRenderer({ icon: '🎭', label: '幻影伪装', mode: 'colonPlain', isHealEntry: false });

// 飞行再生（V6.3.3 | 补回血弹幕：角色阵亡→全场飞行回 baseRegen，此前只有数值没有日志行和飘字）
// 文案回滚：老板否掉「食腐」命名（不好听），弹幕走正常回血款（❤+N），日志用低调版
export const renderFlyerRegenFact = makeHealRenderer({ icon: '🕊️', label: '飞行再生', mode: 'colonPlain', isHealEntry: true, suffix: f => `（${f.deadCount} 名角色阵亡）` });

// 韦一笑吸血
export const renderWeiLeechFact = makeHealRenderer({ icon: '🦇', label: '青翼蝠王·吸血', mode: 'plusMaxHp', anchorVerb: '吸血' });

// 小昭·姊 乾坤衍生 / 蝶变
export function renderQianKunDerivedFact(fact) {
    // 减伤半可选：常规乾坤衍生与白骨爪逐爪都带 reduce；斩杀那一刀照杀不减（noReduce），reduce 缺省时不吐「减伤N」
    const reducePart = fact.reduce != null ? `${fact.targetName}减伤${fact.reduce}，` : '';
    return {
        type:'info',
        text:`<span class="gold">🦋 乾坤衍生：${reducePart}${fact.healTargetName}治疗+${fact.heal}，${fact.atkTargetName}攻击+${fact.atkGain}</span>`,
        fx: [{ kind: 'heal', amount: fact.heal }, { kind: 'atk', amount: fact.atkGain }],
        isHealEntry: true,
        healAmount: fact.heal,
        healUnitUid: fact.healTargetUid,
        buffType: BUFF_SUBTYPES.QIAN_KUN_ATK,
        atkGain: fact.atkGain,
        atkTargetUid: fact.atkTargetUid
    };
}

// 张三丰：生生不息（回血 + 溢出转嫁 + 回血转永久攻防）
// 溢出文案分两种：无人可接（无其他存活队友）/ 有人接（再区分接盘者是否真回了血）
export function renderEndlessBreathFact(fact) {
    // 付费触发配套：攻不足未触发 → 灰字明示（此前静默，玩家看不出燃料耗尽）
    if (fact.failReason === 'atk') {
        const via = fact.via ? `${fact.via}想触发` : '';
        return { type:'info', text:`<span class="gray">☯ ${via}生生不息：${fact.unitName} 攻击力不足${fact.atkCost}点，未能触发</span>` };
    }
    // 攻防明细：回血同时按「实际回血/溢出」两档转永久攻防
    // 二选一：每次触发攻/防只有一边>0，零的那边不显示（「攻+2.6 防+0」→「攻+2.6」）
    const num = (v) => Math.round((v || 0) * 10) / 10;
    const bonus = (atk, def) => {
        const parts = [];
        if (atk > 0) parts.push(`攻+${num(atk)}`);
        if (def > 0) parts.push(`防+${num(def)}`);
        return parts.length > 0 ? parts.join(' ') : '';
    };
    const wrap = (t) => t ? `（${t}）` : '';
    // 付费触发：付费路径句首带「消耗N点攻击力」（回合开始免费无此前缀）
    const costTag = fact.cost ? `消耗${fact.cost}点攻击力，` : '';
    const self = `${costTag}${fact.heal > 0 ? `回复${fact.heal}点生命` : '生命已满'}${wrap(bonus(fact.atkGain, fact.defGain))}`;
    let tail = '';
    if (fact.overflow > 0) {
        // 溢出目标改为随机（满血也可被选中）后，三种情况要分开写：
        // ① 无人可接（除张三丰外无存活友方）② 接盘者确实回了血 ③ 接盘者已满血，本次溢出作废
        if (!fact.overflowToName) {
            tail = `，溢出${fact.overflow}点（无其他存活队友）`;
        } else {
            const recv = fact.overflowHealed > 0 ? `回复${fact.overflowHealed}点` : '已满血未回血';
            const b = bonus(fact.overflowAtkGain, fact.overflowDefGain);
            tail = `，溢出${fact.overflow}点转给${fact.overflowToName}（${recv}${b ? '，' + b : ''}）`;
        }
    }
    return { type:'info', text:`<span class="green">☯ 生生不息：${fact.unitName} ${self}${tail}</span>` };
}

export function renderClawHealFact(fact) {
    return { type:'info', text:`<span class="green">💚 宋青书因九阴白骨爪共回复${Math.round(fact.totalHeal)}点生命</span>`, fx: [{ kind: 'heal', amount: Math.round(fact.totalHeal) }] };
}

// ── 注册 ────────────────────────────────────────────────
registerFactRenderer(FACT_TYPES.BLOOD_THIRST_LEECH, renderBloodthirstLeechFact);
registerFactRenderer(FACT_TYPES.HOT_BLOOD_HEAL, renderHotBloodHealFact);
registerFactRenderer(FACT_TYPES.KUAI_LE_HEAL, renderKuaiLeHealFact);
registerFactRenderer(FACT_TYPES.HEAL, renderHealFact);
    registerFactRenderer(FACT_TYPES.PHANTOM_DISGUISE_HEAL, renderPhantomDisguiseHealFact);
    registerFactRenderer(FACT_TYPES.FLYER_REGEN, renderFlyerRegenFact);
registerFactRenderer(FACT_TYPES.WEI_LEECH, renderWeiLeechFact);
registerFactRenderer(FACT_TYPES.QIAN_KUN_DERIVED, renderQianKunDerivedFact);
registerFactRenderer(FACT_TYPES.ENDLESS_BREATH, renderEndlessBreathFact);
registerFactRenderer(FACT_TYPES.CLAW_HEAL, renderClawHealFact);