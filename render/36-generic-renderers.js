﻿// V1.0.2 | 2026-10-22 | ~3600 bytes
// 设计约束：
//   ① 58 契约保持显式（requiredFields / renderFn 名不变）——体检对账粒度不降（外部AI 第四节第3条：此弊端可消）
//   ② 工厂零依赖（纯函数，node 探针可直接 import 做金样对比）
//   ③ 锚点逐字对齐（SKILL-飘字血泪：「回复+N」≠「回复 N 点」，子串匹配不上=飘字哑火）——anchorVerb 显式传参，
//     模板产物与手写版逐字节一致，golden 探针保障
//   ④ 加攻/加防族预留位：现无手写同款（飘字走 render/38 STAT_CHANGE 通道），出现第三遍再进工厂
// V1.1.0 | 2026-10-26 | 去锚定化：回血族 fxAnchors → fx: [{ kind:'heal', amount }]，特效由播放器按行触发
export const VER = 'render/36-generic-renderers.js V1.1.0';

// —— 回血族：三种版式对应历史文案 ——
// mode 'plusTrail'  ：`{icon} {label}+{heal}，{hpBefore}→{hpAfter}`（九阳：label 含动词，如「九阳神功回复」）
// mode 'plusMaxHp'  ：`{icon} {label}+{heal}，上限→{newMaxHp}`（韦一笑吸血：label 含「青翼蝠王·吸血」）
// mode 'colonPlain' ：`{icon} {label}：{unitName} 回复 {heal} 点生命{suffix}`（飞行再生/幻影伪装）
// anchorVerb：plusX 两式的锚点动词（九阳传「回复」、吸血传「吸血」）——锚点 = `${anchorVerb}+${heal}`，须与正文逐字一致
// isHealEntry：true = 战报行参与「回血飘字锚点」链（isHealEntry/healAmount/healUnitUid 三件套）
export function makeHealRenderer({ icon, label, mode, anchorVerb = null, isHealEntry = true, suffix = null }) {
    return function renderHealFact(fact) {
        const heal = fact.heal;
        if (mode === 'plusTrail') {
            return { type: 'info', text: `<span class="green">${icon} ${label}+${heal}，${fact.hpBefore}→${fact.hpAfter}</span>`, fx: [{ kind: 'heal', amount: heal }], isHealEntry: true, healAmount: heal, healUnitUid: fact.unitUid };
        }
        if (mode === 'plusMaxHp') {
            return { type: 'info', text: `<span class="green">${icon} ${label}+${heal}，上限→${fact.newMaxHp}</span>`, fx: [{ kind: 'heal', amount: heal }], isHealEntry: true, healAmount: heal, healUnitUid: fact.unitUid };
        }
        // colonPlain：效果由 fx 数据字段驱动（不再靠文字锚点匹配）
        const tail = suffix ? suffix(fact) : '';
        const out = { type: 'info', text: `<span class="green">${icon} ${label}：${fact.unitName} 回复 ${heal} 点生命${tail}</span>`, fx: [{ kind: 'heal', amount: heal }] };
        if (isHealEntry) { out.isHealEntry = true; out.healAmount = heal; out.healUnitUid = fact.unitUid; }
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
