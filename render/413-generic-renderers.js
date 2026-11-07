﻿// 设计约束：
//   ① 58 契约保持显式（requiredFields / renderFn 名不变）——体检对账粒度不降（外部AI 第四节第3条：此弊端可消）
//   ② 工厂零依赖（纯函数，node 探针可直接 import 做金样对比）
//   ③ 锚点逐字对齐（SKILL-飘字血泪：「回复+N」≠「回复 N 点」，子串匹配不上=飘字哑火）——anchorVerb 显式传参，
//     模板产物与手写版逐字节一致，golden 探针保障
//   ④ 加攻/加防族预留位：现无手写同款（飘字走 render/38 STAT_CHANGE 通道），出现第三遍再进工厂
export const VER = 'render/413-generic-renderers.js V1.2.0';

import { fmtNum } from '../infra/102-core-utils.js';

// 回血/吸血显示口径（只改文案，不改数值）：被点穴截脉/寒毒打折时，factData 由 core/217 回写
//   healActual / healNominal / healMods → 显示「实际值（原因，原 N）」；无修正保持原样，不给正常回血加噪音。
//   declared = 该渲染器原本要显示的数值（各 fact 字段名不同：heal / leechVal / leech / totalHeal）。
export function healDisplay(fact, declared) {
    const mods = Array.isArray(fact.healMods) ? fact.healMods : [];
    const nominal = typeof fact.healNominal === 'number' ? fact.healNominal : declared;
    const actual = typeof fact.healActual === 'number' ? fact.healActual : declared;
    // 有修正时必须让玩家看见「被砍掉了多少」：按 0.1 精度显示（19.5 不能按整数口径吞成 20）；
    //   无修正沿用全局显示口径 fmtNum。
    const text = mods.length > 0
        ? (Number.isInteger(actual) ? String(actual) : String(Math.round(actual * 10) / 10))
        : fmtNum(actual);
    return {
        num: actual,
        text,
        note: mods.length > 0 ? `（${mods.join('+')}，原 ${fmtNum(nominal)}）` : ''
    };
}

// —— 回血族：三种版式对应历史文案 ——
// mode 'plusTrail'  ：`{icon} {label}+{heal}，{hpBefore}→{hpAfter}`（九阳：label 含动词，如「九阳神功回复」）
// mode 'plusMaxHp'  ：`{icon} {label}+{heal}，上限→{newMaxHp}`（韦一笑吸血：label 含「青翼蝠王·吸血」）
// mode 'colonPlain' ：`{icon} {label}：{unitName} 回复 {heal} 点生命{suffix}`（飞行再生/幻影伪装）
// anchorVerb：plusX 两式的锚点动词（九阳传「回复」、吸血传「吸血」）——锚点 = `${anchorVerb}+${heal}`，须与正文逐字一致
// isHealEntry：true = 战报行参与「回血飘字锚点」链（isHealEntry/healAmount/healUnitUid 三件套）
export function makeHealRenderer({ icon, label, mode, anchorVerb = null, isHealEntry = true, suffix = null }) {
    return function renderHealFact(fact) {
        // 有截脉/寒毒修正 → 显示实落值 + 原因（note），无修正时 heal 与原显示值等价、note 为空
        const d = healDisplay(fact, fact.heal);
        const heal = d.text;
        const healNum = d.num;
        const note = d.note;
        if (mode === 'plusTrail') {
            return { type: 'info', text: `<span class="green">${icon} ${label}+${heal}${note}，${fact.hpBefore}→${fact.hpAfter}</span>`, fx: [{ kind: 'heal', amount: healNum }], isHealEntry: true, healAmount: healNum, healUnitUid: fact.unitUid };
        }
        if (mode === 'plusMaxHp') {
            return { type: 'info', text: `<span class="green">${icon} ${label}+${heal}${note}，上限→${fact.newMaxHp}</span>`, fx: [{ kind: 'heal', amount: healNum }], isHealEntry: true, healAmount: healNum, healUnitUid: fact.unitUid };
        }
        // colonPlain：效果由 fx 数据字段驱动（不再靠文字锚点匹配）
        const tail = suffix ? suffix(fact) : '';
        const out = { type: 'info', text: `<span class="green">${icon} ${label}：${fact.unitName} 回复 ${heal} 点生命${note}${tail}</span>`, fx: [{ kind: 'heal', amount: healNum }] };
        if (isHealEntry) { out.isHealEntry = true; out.healAmount = healNum; out.healUnitUid = fact.unitUid; }
        return out;
    };
}

// —— dot 族：`{icon} {attackerName} 的{skillName}使 {targetName} 中毒！每回合损失最大生命 {pct}[×N层]` ——
// 2026-10-22 起寒毒不衰减、可叠层：dotPercents 取首档换算百分数，层数读 fact.stacks
export function makeDotRenderer({ icon, skillName }) {
    return function renderDotFact(fact) {
        // 寒毒改「不衰减 + 可叠加」：dotPercents 只取首档，层数信息读 fact.stacks
        const pct = fact.dotPercents && fact.dotPercents[0];
        const pctText = (typeof pct === 'number' && pct < 1 ? Math.round(pct * 1000) / 10 : pct) + '%';
        const stackText = (fact.stacks || 1) > 1 ? `×${fact.stacks}层` : '';
        return { type: 'info', text: `<span class="purple">${icon} ${fact.attackerName} 的${skillName}使 ${fact.targetName} 中毒！每回合损失最大生命 ${pctText}${stackText}（持续 3 回合，可叠加）</span>` };
    };
}
