// V1.1.0 | ~6600 bytes | 2026-09-25 补 export const VER（此前全库唯一无 VER 的体检 js，tools/118 的
//          VER 对账会漏掉本文件）；删除死常量 TAG_PREFIX 与 getRuleGroups 里未使用的 prefix 变量。
// V1.0.0 | 每场体检按"目标规则"裁剪执行集：只跑能触发的规则，其余不参与统计(消除海量skip噪音)
// tag 语义: hero=我方英雄(部分可强制) / enemy=敌方精英(随机出阵) / mechanic=通用机制(双方都可能) / generic=通用
export const VER = 'tests/124rule-recipes.js V1.1.0';

export const RULE_META = {
    '张无忌九阳神功回复量(回归)': { tag: 'hero:张无忌', force: 'forceZhang' },
    '宋青书新婚快乐链路(回归)': { tag: 'enemy:宋青书', note: '需宋青书+周芷若同场，敌方随机出阵，需连打多局碰出' },
    '张无忌近身切换时机(回归)': { tag: 'hero:张无忌', force: 'forceZhang' },
    '流云身法闪避面板不生效(回归)': { tag: 'hero:韦一笑', force: 'forceWei' },
    '小昭妹飞天免疫次数超限(回归)': { tag: 'hero:小昭', note: '小昭为随机精英，无法强制，需连打多局碰出' },
    '小昭妹/姐不可选期被打(回归)': { tag: 'hero:小昭', note: '小昭为随机精英，无法强制，需连打多局碰出' },
    '姐姐附身叠加(回归)': { tag: 'hero:小昭', note: '小昭为随机精英，无法强制，需连打多局碰出' },
    '姐姐飞回血量(回归)': { tag: 'hero:小昭', note: '小昭为随机精英，无法强制，需连打多局碰出' },
    '宋青书未命中重试(回归)': { tag: 'enemy:宋青书', note: '敌方随机出阵，需连打多局碰出' },
    '白骨爪回血刷屏(回归)': { tag: 'enemy:宋青书', note: '敌方随机出阵，需连打多局碰出' },
    '九阴白骨爪伤害(回归)': { tag: 'enemy:周芷若', note: '敌方随机出阵，需连打多局碰出' },
    '玄冥联动吞回合(回归)': { tag: 'enemy:玄冥二老', note: '敌方随机出阵，需连打多局碰出' },
    '坚盾计数时序(回归)': { tag: 'mechanic:坚盾' },
    '坚盾叠加超上限(回归)': { tag: 'mechanic:坚盾' },
    '流星赶月溅射加攻量(回归)': { tag: 'mechanic:流星赶月' },
    '飞行未命中光环数值(回归)': { tag: 'mechanic:飞行未命中' },
    '拒马阵生成销毁判据(回归)': { tag: 'mechanic:拒马阵', note: '团队 Buff，需本局选到「巨马阵」才会生成拒马' },
    'carry五号位队友加成量(回归)': { tag: 'mechanic:carry', note: '团队 Buff，需本局选到「你就是carry」且 5 号位有人才会应用' },
    '圣火令行列选取(回归)': { tag: 'mechanic:圣火令', note: '团队 Buff，需本局选到「圣火令」才会每回合重掷攻击列/防御行' },
    '热血奋战攻击回血(回归)': { tag: 'mechanic:热血奋战', note: '团队 Buff，需本局选到「热血奋战」且单位掉过血才会回血' },
    '嗜血狂刀吸血(回归)': { tag: 'mechanic:嗜血狂刀', note: '团队 Buff（或小昭·弟永久海克斯），需本局选到且战士出手才会吸血' },
    '宋青书性奋额外攻击配额(回归)': { tag: 'enemy:宋青书', note: '需宋青书+周芷若同场（敌方随机出阵），且要打满若干回合才有授予/消耗样本' },
    '概率连击触发越界/重复(回归)': { tag: 'mechanic:概率连击', note: '团队 Buff，需本局选到「概率连击」才会触发' },
    '苦练提示数值错误/异常高频(回归)': { tag: 'mechanic:苦练' },
    '乘风击退换位异常(回归)': { tag: 'mechanic:乘风破浪' },
    '破防显示位置/破防量(回归)': { tag: 'mechanic:破防' },
    // 张三丰（V6.1.7/V6.1.9 机制回归）：六大派精英，随机出阵不可强制
    '张三丰核心机制回归(严阵以待/如沐春风/生生不息)': { tag: 'enemy:张三丰', note: '张三丰为六大派随机精英，无法强制，需连打多局碰出' },
    '张三丰生生不息回合开始触发缺失(回归)': { tag: 'enemy:张三丰', note: '同上，张三丰需随机出阵才会触发' },
    '死亡特效缺失(回归)': { tag: 'generic:通用' },
    '回合分隔符重复(回归)': { tag: 'generic:通用' }
};

// tag 分组（体检中心面板按此渲染；key 顺序即展示顺序）
const GROUP_KEYS = ['我方英雄', '敌方精英', '通用机制', '通用'];
// （第 21 轮删除）原 TAG_PREFIX 常量定义后全库零引用，getRuleGroups 用的是下面内联三元，属死常量。

export function getRuleGroups() {
    const groups = GROUP_KEYS.map(k => ({ key: k, label: k, rows: [] }));
    const byKey = Object.create(null);
    for (const g of groups) byKey[g.key] = g;
    for (const name of Object.keys(RULE_META)) {
        const meta = RULE_META[name];
        const g = byKey[meta.tag.split(':')[0] === 'hero' ? '我方英雄'
            : meta.tag.split(':')[0] === 'enemy' ? '敌方精英'
            : meta.tag.split(':')[0] === 'mechanic' ? '通用机制' : '通用'];
        if (g) g.rows.push({ name, tag: meta.tag, note: meta.note || '' });
    }
    return groups;
}

// 按选中的 tag 集合过滤规则：未选中=全部
export function filterRulesByTags(rules, tags) {
    if (!tags || tags.size === 0) return rules;
    return rules.filter(r => {
        const meta = RULE_META[r.name];
        return !!(meta && tags.has(meta.tag));
    });
}

// 从选中 tags 收集可强制的精英 hook（借游戏侧现有 forceZhang/forceWei 机制）
export function collectForceFlags(tags) {
    const flags = {};
    if (!tags || tags.size === 0) return flags;
    for (const name of Object.keys(RULE_META)) {
        const meta = RULE_META[name];
        if (meta.force && tags.has(meta.tag)) flags[meta.force] = true;
    }
    return flags;
}

// 解析 URL 的 rules= 参数 → tag 集合（逗号分隔，如 rules=hero:张无忌,mechanic:破防）
export function parseRecipeTags(search) {
    try {
        const p = new URLSearchParams(search);
        const raw = p.get('rules');
        if (!raw) return null;
        const tags = new Set();
        for (const t of raw.split(',')) {
            const s = t.trim();
            if (s && RULE_TAG_SET.has(s)) tags.add(s);
        }
        return tags.size > 0 ? tags : null;
    } catch (e) { return null; }
}

const RULE_TAG_SET = new Set(Object.values(RULE_META).map(m => m.tag));