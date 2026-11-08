// V1.2.5 | 2026-10-30 夜间第 159 轮：订正四条小昭规则的 note —— 原文「随机精英，**无法强制**，
//   需连打多局碰出」是**过期 know-how**：主代码 modules/330-battle-init.js L245-262 的 GlobalStore
//   'forceXiaoZhao'（'brother' / 'sister'）一直在，只是此前没人拿来回放。这句判断失误直接让
//   129 飞天免疫 / 160 蛛变精通两条规则在 140 场里 pass=0 恒空转。同轮 rules-replay 升 V6.8.0
//   补了定向覆盖场次后，两条规则均已真正执行并通过。
//   ⚠️ 本轮**未给这些条目补 force 字段**：force 字段会被 collectForceFlags 当作布尔强开关下发，
//     而 forceXiaoZhao 取值是 'brother'/'sister' 字符串（下发 true 会被当作不强制，静默失效）。
//     要不要给它加一个字符串取值的下发通道，属主代码/工具侧改造，留给白天拍板。
// V1.2.4 | 2026-10-30 夜间第 157 轮：**只补登记，本文件逻辑一字未动**。
//   ver-bump-selftest 抓到「头注最高 V1.1.0 ≠ VER 常量 V1.2.4」——VER 已被抬到 V1.2.4，
//   而头注版本行没跟上，属「漏补登记」而非「漏抬 VER」。按双向棘轮「登记必须等于真值」补齐，
//   方向是**把登记追到真值**，不是把 VER 降回旧值（降 VER 会让依赖它判陈旧的结果文件被误判）。
//   ⚠️ 本行不含改动说明：V1.2.4 对应的实质改动由抬升方完成，本轮未改动本文件任何逻辑，
//   也**不臆造**改动内容 —— 具体改了什么以抬升时的提交为准，待其补记。
// V1.1.0 | ~6600 bytes | 2026-09-25 补 export const VER（此前全库唯一无 VER 的体检 js，tools/118 的
// tag 语义: hero=我方英雄(部分可强制) / enemy=敌方精英(随机出阵) / mechanic=通用机制(双方都可能) / generic=通用
export const VER = 'tests/124rule-recipes.js V1.2.5';

export const RULE_META = {
    '张无忌九阳神功回复量(回归)': { tag: 'hero:张无忌', force: 'forceZhang' },
    '宋青书新婚快乐链路(回归)': { tag: 'enemy:宋青书', note: '需宋青书+周芷若同场，敌方随机出阵，需连打多局碰出' },
    '张无忌近身切换时机(回归)': { tag: 'hero:张无忌', force: 'forceZhang' },
    '流云身法闪避面板不生效(回归)': { tag: 'hero:韦一笑', force: 'forceWei' },
    '小昭妹飞天免疫次数超限(回归)': { tag: 'hero:小昭', note: '小昭为随机精英，但**可强制**：GlobalStore forceXiaoZhao=brother/sister（主代码 29battle-init L245-262）；第 159 轮起 rules-replay 已加定向覆盖场次，本规则不再恒空转' },
    '小昭妹/姐不可选期被打(回归)': { tag: 'hero:小昭', note: '小昭为随机精英，但**可强制**：GlobalStore forceXiaoZhao=brother/sister（主代码 29battle-init L245-262）；第 159 轮起 rules-replay 已加定向覆盖场次，本规则不再恒空转' },
    '姐姐附身叠加(回归)': { tag: 'hero:小昭', note: '小昭为随机精英，但**可强制**：GlobalStore forceXiaoZhao=brother/sister（主代码 29battle-init L245-262）；第 159 轮起 rules-replay 已加定向覆盖场次，本规则不再恒空转' },
    '姐姐飞回血量(回归)': { tag: 'hero:小昭', note: '小昭为随机精英，但**可强制**：GlobalStore forceXiaoZhao=brother/sister（主代码 29battle-init L245-262）；第 159 轮起 rules-replay 已加定向覆盖场次，本规则不再恒空转' },
    '宋青书未命中重试(回归)': { tag: 'enemy:宋青书', note: '敌方随机出阵，需连打多局碰出' },
    '白骨爪回血刷屏(回归)': { tag: 'enemy:宋青书', note: '敌方随机出阵，需连打多局碰出' },
    '九阴白骨爪伤害(回归)': { tag: 'enemy:周芷若', note: '敌方随机出阵，需连打多局碰出' },
    '玄冥联动吞回合(回归)': { tag: 'enemy:玄冥二老', note: '敌方随机出阵，需连打多局碰出' },
    '坚盾计数时序(回归)': { tag: 'mechanic:坚盾' },
    '坚盾叠加超上限(回归)': { tag: 'mechanic:坚盾' },
    // 第 44 轮：原「流星赶月溅射加攻量(回归)」随主代码渲染收口**重锚**为「来源合法性」
    //   （加攻量的数值校验交给 153），故 key 与备注同步改。
    '流星溅射成长来源合法性(回归)': { tag: 'mechanic:流星赶月', note: '团队 Buff 门控；判的是「无小昭·姊（增强来源）却加了攻」，数值校验见 153' },
    '飞行未命中光环数值(回归)': { tag: 'mechanic:飞行未命中' },
    '拒马阵生成销毁判据(回归)': { tag: 'mechanic:拒马阵', note: '团队 Buff，需本局选到「巨马阵」才会生成拒马' },
    'carry五号位队友加成量(回归)': { tag: 'mechanic:carry', note: '团队 Buff，需本局选到「你就是carry」且 5 号位有人才会应用' },
    '圣火令行列选取(回归)': { tag: 'mechanic:圣火令', note: '团队 Buff，需本局选到「圣火令」才会每回合重掷攻击列/防御行' },
    '热血奋战攻击回血(回归)': { tag: 'mechanic:热血奋战', note: '团队 Buff，需本局选到「热血奋战」且单位掉过血才会回血' },
    '嗜血狂刀吸血(回归)': { tag: 'mechanic:嗜血狂刀', note: '团队 Buff（或小昭·弟永久海克斯），需本局选到且战士出手才会吸血' },
    '宋青书性奋额外攻击配额(回归)': { tag: 'enemy:宋青书', note: '需宋青书+周芷若同场（敌方随机出阵），且要打满若干回合才有授予/消耗样本' },
    '流星溅射成长渲染(单位名/唯一性/成长量)': { tag: 'mechanic:流星赶月', note: '团队 Buff 门控；且需远程单位触发溅射成长（小昭·姊海克斯增强），120 场约 52 场有样本' },
    '张三丰生生不息回血转攻防量(回归)': { tag: 'hero:张三丰', note: '张三丰为随机精英，无法强制；参数是 content 硬编码口径，改动需同步本规则' },
    '流星溅射成长渲染形态(单位名/重复)': { tag: 'mechanic:流星赶月', note: '干净树即红（主代码既有 bug：⚡ undefined + 重复渲染），修复后应转绿' },
    '概率连击触发越界/重复(回归)': { tag: 'mechanic:概率连击', note: '团队 Buff，需本局选到「概率连击」才会触发' },
    '苦练提示数值错误/异常高频(回归)': { tag: 'mechanic:苦练' },
    '乘风击退换位异常(回归)': { tag: 'mechanic:乘风破浪' },
    // 2026-10-13 第 87 轮新增：惑人心智换位链路（138 只管乘风击退，惑心的敌方/己方配对、
    //   SWAP 自洽、宣告位置落地此前无规则盯）
    '惑心换位配对与落地(回归)': { tag: 'mechanic:惑人心智', note: '团队 Buff，需本局选到「惑人心智」且最前排单位出手过才会触发' },
    // 第 114 轮新增：171 唐文亮冲刺落地。冲刺需唐文亮出手满 7 次（content chongCi.cycle），
    //   且唐文亮是六大派弱精英随机混入 ⇒ 条件稀有，未抽到即 skip（实测 140 场回放有命中，非恒空转）。
    '唐文亮冲刺落地(回归)': { tag: 'enemy:唐文亮', note: '唐文亮为弱精英随机混入，且需出手满7次才冲刺，条件稀有需连打多局碰出' },
    // 第 120 轮新增（第 121 轮补登）：172 空见金刚不坏次数与升级。空见为六大派精英随机混入，
    //   加持计数需满 5 次才升级 ⇒ 条件稀有，未抽到/未打满即 skip（实测 140 场回放命中 25 场）。
    '空见金刚不坏次数与升级(回归)': { tag: 'enemy:空见', note: '空见为精英随机混入，且金刚不坏需加持满5次才升级，条件稀有需连打多局碰出' },
    // 第 186 轮新增：回合时序 / 目标选择 / 行动顺序。三条都是全阵容结构不变量，每场都有样本、不恒空转。
    '回合时序连续性(回归)': { tag: 'generic:通用' },
    '目标选择合法性(回归)': { tag: 'generic:通用' },
    '阵亡者不得再出手(回归)': { tag: 'generic:通用' },
    // 血量/判死/复活：圣火不熄是团队 Buff（随机选到才触发），但回血账目判据在 heal 家族常驻触发，
    //   不会恒 skip；圣火不熄部分未选到即静默不判（宁漏勿误）。
    '血量/判死/复活闭环(回归)': { tag: 'mechanic:死亡结算', note: '复活判据需本局选到「圣火不熄」；回血账目判据每场都有样本，不恒空转' },
    // Buff/Debuff 专项：227 逐回合核对 BUFF_SUMMARY 的 remaining（-1/回合、到期消失、同回合重复挂载）
    'buff时长递减与到期清理(回归)': { tag: 'mechanic:buff', note: '团队 Buff 每回合都发摘要，常驻有样本；无限时长条目（严阵以待假摘要）不做递减判据' },
    // Buff/Debuff 专项：228 四类乘率加成声明对配置真值（含小昭·姊强化路径）
    'buff加成声明与配置真值(回归)': { tag: 'mechanic:buff', note: '圣火令/摄魂/背水一战/众志成城均为团队 Buff，150 场回放四类都有样本；姊强化分支在定向姊场次中未被命中（真值已由 tests/buff-rules-case.mjs 合成用例覆盖）' },
    '破防显示位置/破防量(回归)': { tag: 'mechanic:破防' },
    // 张三丰（V6.1.7/V6.1.9 机制回归）：六大派精英，随机出阵不可强制
    '张三丰核心机制回归(严阵以待/如沐春风/生生不息)': { tag: 'enemy:张三丰', note: '张三丰为六大派随机精英，无法强制，需连打多局碰出' },
    '张三丰生生不息回合开始触发缺失(回归)': { tag: 'enemy:张三丰', note: '同上，张三丰需随机出阵才会触发' },
    '死亡特效缺失(回归)': { tag: 'generic:通用' },
    '回合分隔符重复(回归)': { tag: 'generic:通用' },
    // 第 50 轮补登：156 此前只在 123 的 SCAN_FILES 里登记过，121/124 两处都漏了。
    //   它与战报无关（读 content/core 真值渲染技能说明），恒有结论、不依赖出阵角色，故归「通用」。
    '技能说明数字==引擎真值(单源守卫)': { tag: 'generic:通用', note: '不依赖本局战报；改 content 数值或 core/01 的 DESC_TRUTH 时立刻现形' },
    // 2026-10-02 补登：157 mechanics 安装对账（type↔注册表↔字段 schema），直接复用 core/15 安装期校验。
    //   不读战报、只读 content，漏注册/字段缺失/未知 targetRule 立刻现形，归「通用」。
    'mechanics安装对账(类型↔注册表↔字段)': { tag: 'generic:通用', note: '不依赖本局战报；改 mechanics type/字段或漏注册 handler 时立刻现形' },
    // 2026-10-16 第 97 轮新增：170 台词池双向一致性（唐文亮线上事故：taunts 配在 characters 里引擎不读、
    //   role 自定义职业兜底不到 ⇒ 运行时 throw 崩 worker）。只读 content，归「通用」。
    '台词池双向一致性(taunts)': { tag: 'generic:通用', note: '不依赖本局战报；新角色 taunts 配错层/配空池/自定义职业无兜底时立刻现形' },
    // 2026-11-08 新增：179 海克斯强化配置（content/002-hex-enhance.json 姊/妹两段）完整性。
    //   只读 002+001，不依赖战报也不依赖出阵角色，恒有结论 ⇒ 归「通用」。
    '海克斯强化配置完整性(姊/妹两段)': { tag: 'generic:通用', note: '不依赖本局战报；002 少键/拼错字段/概率越界时立刻现形（是否被代码消费由 hex-enhance-wiring-guard 静态对账）' },
    // 2026-10-07 新增：韦一笑蝠影汲血专属吸血链路（150/151 只覆盖团队 Buff 的热血奋战/嗜血狂刀，管不到它）
    // 2026-10-07 补登：158 飘字锚点对齐（上一轮只补 121 import+allRules，漏 123/124，registration-check 红）
    '飘字fx数值对账(契约)': { tag: 'generic:通用', note: 'fx 结构判据：kind 合法 + amount 有限正数 + 数值⊂正文（第143轮吸收夜间139重写版，原名「飘字锚点对齐」）' },
    '韦一笑蝠影汲血吸血(回归)': { tag: 'hero:韦一笑', force: 'forceWei', note: '韦一笑永久闪避，每次出手走闪避反击路径必触发吸血；基线 18/35 场大多有样本' },
    '蛛变/精通数值(回归)': { tag: 'hero:小昭', note: '小昭为随机精英，但**可强制**：GlobalStore forceXiaoZhao=brother/sister（主代码 29battle-init L245-262）；第 159 轮起 rules-replay 已加定向覆盖场次，本规则不再恒空转' },
    '幼狮成长数值(回归)': { tag: 'mechanic:幼狮成长', note: '明教幼狮成长永久词条；小昭·姊海克斯增强时才触发，需连打多局碰出' },
    '属性变更数值(回归)': { tag: 'generic:通用', note: '不依赖本局出阵角色；STAT_CHANGE_APPLY 此前在规则视野外（renderFn:null），Step 0 后可见' },
    '正义国字脸叠防数值(回归)': { tag: 'hero:胖远桥', note: '胖远桥招牌；落点 pangDefGain == 配置 defGain，规则侧此前看不到（嵌套在 ATTACK fact），Step 0 后可见' },
    '吸血上限提升数值(回归)': { tag: 'hero:韦一笑', note: '韦一笑蝠影汲血永久抬上限；maxHpDelta/newMaxHp 良好 + 同单位相邻单调，与对照器互补' },
    '灭绝重设计行为数值(回归)': { tag: 'hero:灭绝师太', note: '2026-10-09 重设计：反击×dmgRatio / 三击吸血×leechRatio / 死亡召唤周芷若(SUM MON_UNIT)；行为与渲染文案对配置真值' },
    // 第 185 轮：角色技能模块（modules/3xx）补盲
    '周颠癫传染链一致性(回归)': { tag: 'hero:周颠', note: '明教普通单位，癫会传给敌我；无强制开关，未出场即 skip' },
    '唐文亮七伤拳自损与增伤(回归)': { tag: 'enemy:唐文亮', note: '唐文亮为六大派弱精英随机混入，需命中才有七伤拳报幕，需连打多局碰出' },
    '彭莹玉双面观音假身真值(回归)': { tag: 'hero:彭莹玉', note: '明教普通单位，首回合必进假身；未出场即 skip' },
    '鹤笔翁鹿角杖法中毒增伤(回归)': { tag: 'enemy:鹤笔翁', note: '鹤笔翁为六大派精英随机混入，且目标需带玄冥毒才走增伤分支' },
    '成昆混元霹雳劲与幻影治疗(回归)': { tag: 'enemy:成昆', note: '成昆为六大派精英随机混入，需掉血才有霹雳真伤/幻影治疗样本' },
    '说不得布袋阵营与放出数值(回归)': { tag: 'hero:说不得', note: '明教普通单位，需命中触发布袋才有播报；未出场即 skip' },
    '唐文亮回春术逐层回血(回归)': { tag: 'enemy:唐文亮', note: '唐文亮为六大派弱精英随机混入，4% 概率叠层；需连打多局碰出回血样本' },
    '唐文亮同归于尽阵亡反噬(回归)': { tag: 'enemy:唐文亮', note: '唐文亮为六大派弱精英随机混入，需本场阵亡才有反噬播报' },
    '张无忌乾坤减伤与反弹(回归)': { tag: 'hero:张无忌', note: '张无忌远程形态+队友站四邻格才有乾坤样本；小昭在场走升级版' },
    // 战报与渲染一致性三件套（只读渲染后的 log，不依赖出阵角色 ⇒ 通用）
    '战报分组一致性(组归属/结果同源)': { tag: 'generic:通用', note: '组结构不变量：孤儿伤害行/组内套组/名字不成对/空组带结算结果/组结果不一致；140 场 0 误报' },
    '显示数值单一出口(浮点尾巴)': { tag: 'generic:通用', note: '渲染正文 ≥4 位小数即报；合法公式行最多 2 位（3 位系数值不算）' },
    '飘字伤害数值与正文同源': { tag: 'generic:通用', note: 'damage-text.dmg 必须等于正文 fmtNum 值；2026-11-08 实测 500 条 Math.round 口径转交中' },
    '血量链四处同源(正文/伤害行/格子/组)': { tag: 'generic:通用', note: '同一结算的 hp 在报幕/伤害链/伤害行字段/组字段四处同源；链前值与报幕快照比对可抓演出层反推历史值；150 场 0 误报' },
    '组内条目顺序(时序改写不错位)': { tag: 'generic:通用', note: '组内顺序钉死：金色报幕/破防 → 报幕 → 波动 → 计算 → 结算；报幕与结算各唯一；150 场 0 误报' },
    // 第 187 轮：框架公共层补登记（并行会话已建文件、未登记，避免 124 侧登记缺失硬失败）
    '明教阵容规模与分层(回归)': { tag: 'generic:阵容', note: '阵容结构不变量；不依赖具体出阵，读开局 roster' },
    '六大派关卡固定精英必到(回归)': { tag: 'generic:阵容', note: '关卡固定精英必到；读 stage 配置与开局 roster' },
    '额外混入不增员·不重名(回归)': { tag: 'generic:阵容', note: '额外混入不增员/不重名；读开局 roster' },
    '关卡变体可辨识性(回归)': { tag: 'generic:阵容', note: '关卡变体可辨识；读 stage 配置' },
    '伤害下限与实数精度(回归)': { tag: 'generic:通用', note: '伤害下限与实数精度；不依赖出阵角色' },
    'buff时长递减与到期清理(回归)': { tag: 'generic:buff', note: 'buff 时长递减与到期清理；通用生命周期' },
    'buff加成声明与配置真值(回归)': { tag: 'generic:buff', note: 'buff 加成声明与配置真值；通用生命周期' }
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