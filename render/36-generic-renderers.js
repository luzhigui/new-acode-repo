// V1.0.0 | 2026-10-08 第一刀：通用语义默认渲染器工厂（外部AI修正靶，老板 21:27 拍板执行）
//          背景：core/15 安装层已把声明原语统一处理，但渲染器仍每条手写（韦一笑吸血/张无忌九阳/玄冥中毒/
//          飞行再生/幻影伪装五条 fact 的渲染函数都是模板复制品）。本文件把「回血族 / dot 族」收敛成工厂，
//          以后声明原语类技能的渲染 = 一行工厂调用，不再手写整函数。
// 设计约束：
//   ① 58 契约保持显式（requiredFields / renderFn 名不变）——体检对账粒度不降（外部AI 第四节第3条：此弊端可消）
//   ② 工厂零依赖（纯函数，node 探针可直接 import 做金样对比）
//   ③ 锚点逐字对齐（SKILL-飘字血泪：「回复+N」≠「回复 N 点」，子串匹配不上=飘字哑火）——anchorVerb 显式传参，
//     模板产物与手写版逐字节一致，golden 探针保障
//   ④ 加攻/加防族预留位：现无手写同款（飘字走 render/38 STAT_CHANGE 通道），出现第三遍再进工厂
export const VER = 'render/36-generic-renderers.js V1.0.0';

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
            return { type: 'info', text: `<span class="green">${icon} ${label}+${heal}，${fact.hpBefore}→${fact.hpAfter}</span>`, fxAnchors: [`${anchorVerb || label}+${heal}`], isHealEntry: true, healAmount: heal, healUnitUid: fact.unitUid };
        }
        if (mode === 'plusMaxHp') {
            return { type: 'info', text: `<span class="green">${icon} ${label}+${heal}，上限→${fact.newMaxHp}</span>`, fxAnchors: [`${anchorVerb || label}+${heal}`], isHealEntry: true, healAmount: heal, healUnitUid: fact.unitUid };
        }
        // colonPlain：锚点固定「回复 N 点」（带空格版，飞行再生/幻影伪装历史口径）
        const tail = suffix ? suffix(fact) : '';
        const out = { type: 'info', text: `<span class="green">${icon} ${label}：${fact.unitName} 回复 ${heal} 点生命${tail}</span>`, fxAnchors: [`回复 ${heal} 点`] };
        if (isHealEntry) { out.isHealEntry = true; out.healAmount = heal; out.healUnitUid = fact.unitUid; }
        return out;
    };
}

// —— dot 族：`{icon} {attackerName} 的{skillName}使 {targetName} 中毒！每回合损失生命（{dots}%→消失）` ——
// dotPercents 数组渲染为「4%→3%→2%→1%→消失」衰减链（历史口径 join('%→')）
export function makeDotRenderer({ icon, skillName }) {
    return function renderDotFact(fact) {
        return { type: 'info', text: `<span class="purple">${icon} ${fact.attackerName} 的${skillName}使 ${fact.targetName} 中毒！每回合损失生命（${fact.dotPercents.join('%→')}%→消失）</span>` };
    };
}
