// V1.0.0 | 每场体检按"目标规则"裁剪执行集：只跑能触发的规则，其余不参与统计(消除海量skip噪音)
// tag 语义: hero=我方英雄(部分可强制) / enemy=敌方精英(随机出阵) / mechanic=通用机制(双方都可能) / generic=通用
export const RULE_META = {
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
    '流星赶月普通溅射加攻缺失(回归)': { tag: 'mechanic:流星赶月' },
    '苦练提示重复/数值错误(回归)': { tag: 'mechanic:苦练' },
    '乘风击退换位异常(回归)': { tag: 'mechanic:乘风破浪' },
    '破防显示位置(回归)': { tag: 'mechanic:破防' },
    '死亡特效缺失(回归)': { tag: 'generic:通用' },
    '回合分隔符重复(回归)': { tag: 'generic:通用' }
};

// tag 分组（体检中心面板按此渲染；key 顺序即展示顺序）
const GROUP_KEYS = ['我方英雄', '敌方精英', '通用机制', '通用'];
const TAG_PREFIX = { '我方英雄': 'hero:', '敌方精英': 'enemy:', '通用机制': 'mechanic:', '通用': 'generic:' };

export function getRuleGroups() {
    const groups = GROUP_KEYS.map(k => ({ key: k, label: k, rows: [] }));
    const byKey = Object.create(null);
    for (const g of groups) byKey[g.key] = g;
    for (const name of Object.keys(RULE_META)) {
        const meta = RULE_META[name];
        const prefix = meta.tag.split(':')[0] + ':';
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