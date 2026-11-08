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
    '吸星汇总账实同源且屏上有出处': { tag: 'mechanic:吸星大法', note: '账本 absorbedTotal/beneficiaries 求和自洽；屏上必须有一条同数字吸星报幕行（ABSORB_SUMMARY 无渲染器，账有屏无即红）' },
    '隐藏渲染器出口逐类登记': { tag: 'generic:通用', note: '静态守卫：infra/107 里 renderFn:null 的 fact 必须在白名单登记屏上出口；新增隐藏渲染器不登记出口即红' },
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
    // 第 191 轮：死亡/复活行动权归属（同回合口径）+ 同回合多段出手计数口径
    '死亡与复活的行动权归属(回归)': { tag: 'generic:通用', note: '同回合口径：阵亡未复活后不得再命中出手、不得收 PASS；复活后同回合出手次数不设上限（实测 0~2 次）' },
    '同回合多段出手计数口径(观察项)': { tag: 'generic:通用', note: '段数阈值 6 是实测拟合（引擎无硬上限，core/209 只按 extraRequests 追加），超阈值只进「观察项」不计红；硬判据只有同 uid 段间 name/camp 漂移与空目标段' },
    // 血量/判死/复活：圣火不熄是团队 Buff（随机选到才触发），但回血账目判据在 heal 家族常驻触发，
    //   不会恒 skip；圣火不熄部分未选到即静默不判（宁漏勿误）。
    '血量/判死/复活闭环(回归)': { tag: 'mechanic:死亡结算', note: '复活判据需本局选到「圣火不熄」；回血账目判据每场都有样本，不恒空转' },
    // Buff/Debuff 专项：227 逐回合核对 BUFF_SUMMARY 的 remaining（-1/回合、到期消失、同回合重复挂载）
    'buff时长递减与到期清理(回归)': { tag: 'mechanic:buff', note: '团队 Buff 每回合都发摘要，常驻有样本；无限时长条目（严阵以待假摘要）不做递减判据' },
    // Buff/Debuff 专项：228 四类乘率加成声明对配置真值（含小昭·姊强化路径）
    'buff加成声明与配置真值(回归)': { tag: 'mechanic:buff', note: '圣火令/摄魂/背水一战/众志成城均为团队 Buff，150 场回放四类都有样本；姊强化分支在定向姊场次中未被命中（真值已由 tests/buff-rules-case.mjs 合成用例覆盖）' },
    // 第 191 轮补登：229 由并行会话建文件但未登记（逻辑未动）
    '妹永久海克斯整局不消失(回放建模)': { tag: 'generic:buff', note: '小昭·妹永久词条整局不递减；回放建模口径，未选到即空转' },
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
    '彭莹玉双面观音女装真值(回归)': { tag: 'hero:彭莹玉', note: '明教普通单位，首回合必进女装；未出场即 skip' },
    '鹤笔翁鹿角杖法中毒增伤(回归)': { tag: 'enemy:鹤笔翁', note: '鹤笔翁为六大派精英随机混入，且目标需带玄冥毒才走增伤分支' },
    '成昆混元霹雳劲与幻影治疗(回归)': { tag: 'enemy:成昆', note: '成昆为六大派精英随机混入，需掉血才有霹雳真伤/幻影治疗样本' },
    '说不得布袋阵营与放出数值(回归)': { tag: 'hero:说不得', note: '明教普通单位，需命中触发布袋才有播报；未出场即 skip' },
    '唐文亮回春术逐层回血(回归)': { tag: 'enemy:唐文亮', note: '唐文亮为六大派弱精英随机混入，4% 概率叠层；需连打多局碰出回血样本' },
    '唐文亮同归于尽阵亡反噬(回归)': { tag: 'enemy:唐文亮', note: '唐文亮为六大派弱精英随机混入，需本场阵亡才有反噬播报' },
    '张无忌乾坤减伤与反弹(回归)': { tag: 'hero:张无忌', note: '张无忌远程形态+队友站四邻格才有乾坤样本；小昭在场走升级版' },
    '玄冥毒叠加与DOT跳数(回归)': { tag: 'enemy:鹿杖客', note: '鹿杖客为六大派远程精英，需命中挂毒才有样本；毒量真值缺口见需求清单' },
    '谢逊幼狮成长成形(回归)': { tag: 'hero:谢逊', note: '谢逊每回合 50% 召幼狮、下回合 80% 成长；站位决定雄/母狮' },
    '谢逊雄狮振奋加攻(回归)': { tag: 'hero:谢逊', note: '雄狮命中后触发；需幼狮先长成雄狮并命中' },
    '庄铮断锤三式保命与承伤上限(回归)': { tag: 'hero:庄铮', note: '明教普通单位，需吃到首次致死伤害才触发；未触发即 skip' },
    // 战报与渲染一致性三件套（只读渲染后的 log，不依赖出阵角色 ⇒ 通用）
    '战报分组一致性(组归属/结果同源)': { tag: 'generic:通用', note: '组结构不变量：孤儿伤害行/组内套组/名字不成对/空组带结算结果/组结果不一致；140 场 0 误报' },
    '显示数值单一出口(浮点尾巴)': { tag: 'generic:通用', note: '渲染正文 ≥4 位小数即报；合法公式行最多 2 位（3 位系数值不算）' },
    '飘字伤害数值与正文同源': { tag: 'generic:通用', note: 'damage-text.dmg 必须等于正文 fmtNum 值；2026-11-08 实测 500 条 Math.round 口径转交中' },
    '血量链四处同源(正文/伤害行/格子/组)': { tag: 'generic:通用', note: '同一结算的 hp 在报幕/伤害链/伤害行字段/组字段四处同源；链前值与报幕快照比对可抓演出层反推历史值；150 场 0 误报' },
    '组内条目顺序(时序改写不错位)': { tag: 'generic:通用', note: '组内顺序钉死：金色报幕/破防 → 报幕 → 波动 → 计算 → 结算；报幕与结算各唯一；150 场 0 误报' },
    '同回合多段出手计数口径(回归)': { tag: 'generic:通用', note: '同一单位同回合的多段出手按事实计数（双击/冲刺/连锁攻击），不依赖出阵角色' },
    '同回合相邻同目标血量链连续性': { tag: 'generic:通用', note: '日志里紧挨着的两击只接受两种起点（前击链前=同 step 快照 / 前击链后=顺序结算）；实测 156 场 75 过 / 41 断点 / 40 无可判对，断点明细全部是静默回血，转交主代码' },
    // 第 187 轮：框架公共层补登记（并行会话已建文件、未登记，避免 124 侧登记缺失硬失败）
    '明教阵容规模与分层(回归)': { tag: 'generic:阵容', note: '阵容结构不变量；不依赖具体出阵，读开局 roster' },
    '六大派关卡固定精英必到(回归)': { tag: 'generic:阵容', note: '关卡固定精英必到；读 stage 配置与开局 roster' },
    '额外混入不增员·不重名(回归)': { tag: 'generic:阵容', note: '额外混入不增员/不重名；读开局 roster' },
    '关卡变体可辨识性(回归)': { tag: 'generic:阵容', note: '关卡变体可辨识；读 stage 配置' },
    '伤害下限与实数精度(回归)': { tag: 'generic:通用', note: '伤害下限与实数精度；不依赖出阵角色' },
    'buff时长递减与到期清理(回归)': { tag: 'generic:buff', note: 'buff 时长递减与到期清理；通用生命周期' },
    'buff加成声明与配置真值(回归)': { tag: 'generic:buff', note: 'buff 加成声明与配置真值；通用生命周期' },
    '词条形态合法性(加成账本)': { tag: 'generic:通用', note: '加成账本词条形态合法性；通用结构检查（并行会话新增，登记同步）' },
    '加成声明与账本落地同源(回归)': { tag: 'generic:通用', note: '加成声明与账本落地同源；通用结构检查（并行会话新增，登记同步）' },
    '乾坤衍生声明与账本落地同源(回归)': { tag: 'generic:通用', note: '乾坤衍生声明与账本落地同源；通用结构检查（并行会话新增，登记同步）' },
    '乾坤衍生累积曲线量化(观测)': { tag: 'generic:通用', note: '乾坤衍生单场累积量化；只报数字不设上限（并行会话新增，登记同步）' },
    '回合词条同源重复(复活残留)(回归)': { tag: 'generic:通用', note: 'round 词条同源重复；阵亡跳过清理、复活叠加（并行会话新增，登记同步）' },
    '头尾属性闭环(加成账本)(回归)': { tag: 'generic:通用', note: '开战初值与终局属性逐单位重算闭环（并行会话新增，登记同步）' },
    '成长声明与账本同源(加成账本)(回归)': { tag: 'generic:通用', note: '成长类 fact 声明增量与终局账本同名 group 合计逐单位对账（并行会话新增）' },
    '成长曲线量化(加成账本)': { tag: 'generic:通用', note: '按击杀/受击/回合/命中分类统计成长次数与总量，观察项不判红（并行会话新增）' },
    '面板存值与账本一致(加成账本)(回归)': { tag: 'generic:通用', note: 'atk/def 存值==基准、maxHp 存值==getStat，抓绕过账本直写（并行会话新增）' },
    '词条过期闭包盘点(加成账本)': { tag: 'generic:通用', note: 'ttl 三档分布与阵亡单位 round 残留量化，观察项不判红（并行会话新增）' },
    // 第 192 轮·演出/倒针/回放状态机域（255-258 + 撞号顺延 265-266）：读导出函数源码做结构断言，不依赖出阵角色
    '倒针静默开关完整性(进场/定位/退出)': { tag: 'generic:通用', note: '727 静默开关 5 处 + 504 演出调用点全部带 !c.isRewinding 守卫；回看不放历史死亡红墨、连续播放不误静默' },
    '回看不写真实账本(快照隔离)': { tag: 'generic:通用', note: '进场快照/清空 battleLog+battleFacts、退出整块还原、504 只 get/push 不 set；回看不污染本局战报' },
    '连续播放只从当前步往后(不重演)': { tag: 'generic:通用', note: 'startPlay 从 S.stepIdx 起播、起播前回摆本步之前、resumePlay 不重进 enterReview、跳步夹区间' },
    '播放状态机切换清理(无悬挂演出)': { tag: 'generic:通用', note: '粗拨 cancelRun、细拨 token、startPlay finally 清句柄、exitReview 清 watchdog/playRelease/_rewindCue' },
    '定格与真播同一落账顺序(单一权威)': { tag: 'generic:通用', note: '504 整步落账 2 处（复活+权威），顺序「落账→settle→死亡闪→death→红墨」；定格不落半结算态' },
    '治疗演出数值与血量迁移同源(观测)': { tag: 'generic:通用', note: '观察项：isHealEntry 的 healAmount 必须有限非负；正文显示值与血量迁移偏离 >1 点只报样例供研判；实测 156 场 69 例偏离，多数为名义治疗量≠有效治疗量' },
    // 第 193 轮·存活/胜负/回合结算链域（号段 231-236，只吃原始 fact 流）。全部先在 140 场回放量基线，
    //   候选判据 0 误报才升硬判；做不到 0 的降观察项（如复活缺死亡前置）。
    '圣火复活链完整性(回归)': { tag: 'mechanic:死亡结算', note: '死亡→复活→血量/档位一条链；档位/血量已按 reviveTier/reviveRatio/reviveRaw/healAmount 结构化精确核对，缺死亡前置已升硬判（UNIT_DEATH 上线）' },
    '复活当回合出手额度(回归)': { tag: 'mechanic:死亡结算', note: '复活后本回合出手 >2 次才判红（140 场实测包络 0~2）；与 184 的「不设上限」口径互补' },
    '胜负终局形态一致性(回归)': { tag: 'generic:通用', note: '全灭即结束/平局口径/结束后不再跑回合结算；每场都有样本，不恒空转' },
    '回合开始结算链顺序(回归)': { tag: 'generic:通用', note: 'roundStart→DOT/摘要→首次出手；140 场约千回合实测 0 反例，每场都有样本' },
    '终局单位存活与名单一致性(回归)': { tag: 'generic:通用', note: '开局名单↔终局快照一一对应 + alive↔hp 互证；存活统计的唯一数据源，每场都有样本' },
    '回合末结算链与边界衔接(回归)': { tag: 'generic:通用', note: '原始 fact 视角：结束符位置/唯一性/跨回合无夹层；131 读渲染文本、181 判序号配对，本条补位置与衔接' },
    // 第 194 轮·存活/胜负/结算链域续（号段 283-288）
    '死后不得再出手(回归)': { tag: 'mechanic:死亡结算', note: 'UNIT_DEATH 之后到复活公告之前不得再有该 uid 的 ATTACK；覆盖「最后一个死的人算不算出手」' },
    '终局全链与复活判死竞争(回归)': { tag: 'mechanic:死亡结算', note: '一侧名单清空后不得继续结算（全灭即结束）；复活公告必须落到终局快照（不得被判死覆盖）' },
    '帧内结算链顺序(死亡→复活→反弹→再生)(回归)': { tag: 'mechanic:死亡结算', note: '同帧内再生必须在死亡之后、反弹不得落在已死单位、复活不得早于同帧死亡' },
    // 第 195 轮修正：rewind 挪号 253/254（D5）
    '回放写入面唯一入口(进场清空/退出按引用还原)': { tag: 'generic:通用', note: '回放写入面只允许一个入口；进场清空、退出按引用还原（D5）' },
    '回看静默期账本零写入(动态探针)': { tag: 'generic:通用', note: '回看静默期不得写账本（动态探针，D5）' },
    // 第 195 轮·D10 续 + D11 控制与意识类（286-293）
    '关卡变体抽签真值与阵容互证(回归)': { tag: 'generic:阵容', note: '读 stage 配置真值：变体抽签结果与实到阵容互证；每场都有样本' },
    '每关敌方名字来源合法(回归)': { tag: 'generic:阵容', note: '敌方单位名必须来自该关固定精英/混入池，不得出现跨关串名' },
    '精英站位不跳位·周芷若宋青书底线(回归)': { tag: 'generic:阵容', note: '固定精英站位按关卡配置，不得与混入单位互换底线位' },
    '控制改目标事实留痕(回归)': { tag: 'generic:通用', note: '惑心/改目标类 fact 必须带原目标与改后目标；缺失先观察（D11）' },
    '改目标后攻击者身份与加成原样(回归)': { tag: 'generic:通用', note: '改目标不得改写攻击者 uid/阵营/加成来源（D11）' },
    '改目标一击边裁分支留痕不丢(回归)': { tag: 'generic:通用', note: '改目标攻击的命中/闪避/暴击分支必须留痕，不得只剩结果（D11）' },
    '控制叠加一致性·癫必中与报幕(回归)': { tag: 'mechanic:惑心', note: '控制叠加口径与癫必中/报幕一致，不重复计数（D11）' },
    '控制解除后状态清理(回归)': { tag: 'mechanic:惑心', note: '控制结束必须清理目标/宿主状态，不得残留 _untargetable 等窗口（D11）' },
    // 第 192 轮·选目标 / 站位 / 落位（号段 243-248，只吃原始 fact 流）
    '位移载荷越界与自环(回归)': { tag: 'generic:通用', note: '位移载荷 from/to 必须 1~9 且 from≠to；换位落点不得重复；156 场 0 误报' },
    '击退换位载荷自洽(回归)': { tag: 'generic:通用', note: '击退落 behindPos、后方单位落 oldPos，两者不得同格且换位来源必须对上；156 场 0 误报' },
    '标枪选靶射程(观测)': { tag: 'generic:通用', note: '标枪按 rangeByRow 选靶；实测 63 次可判出手 2 次射程外（唐文亮带 skillAnnounce 的攻击组，待定位），先观察' },
    '空目标显式落账(回归)': { tag: 'generic:通用', note: '攻击类事实必须带目标 uid；emptyTarget 必须带攻击者+原因；156 场 0 误报' },
    '攻击目标可选性(回归)': { tag: 'generic:通用', note: '跨机制一条口径：快照即时态(存活/蝶蛛/附身) + 女装窗口 + 布袋 _untargetable 窗口；156 场 0 误报' },
    '位移落位后快照一致(观测)': { tag: 'generic:通用', note: '宣告位移后该单位下次露面应在落点；实测 94 次核对 11 次不一致，先观察' },
    // 第 193 轮·选目标与站位（249~252）
    '站位快照在界与同格双占(回归)': { tag: 'generic:通用', note: '出场位置必须 1~9；同阵营同格双占先观察（快照稀疏）' },
    '换位置换闭合(回归)': { tag: 'generic:通用', note: '惑心 ≥2 人换位必须是闭合环（来源集合=落点集合、uid/格唯一）；单人挪空位不判闭合' },
    '换位后同回合追打连通(观测)': { tag: 'generic:通用', note: '位移参与者在本回合后续是否还出场（追打覆盖率），只统计不染红' },
    '改目标事实完整性(回归)': { tag: 'generic:通用', note: 'phantomConfuse 四字段硬判；同阵营误攻按 attack/miss/dodge 分支数归因缺口，缺失先观察' },
    // 第 D6 域·召唤物/附身/占格（号段 259-264，只吃原始 fact 流）
    '召唤物 uid 唯一与落点合法(回归)': { tag: 'generic:召唤物', note: 'SUMMON_UNIT 带 summonUid/落点 1~9/召唤者名；谢逊幼狮、张中蹦蹦、众志成城、灭绝周芷若常驻有样本' },
    '召唤物阵亡后不再参与结算(回归)': { tag: 'generic:召唤物', note: '判死取自 ATTACK 的 dmgResult.dead；156 场 525 只召唤里 361 只阵亡、阵亡后违规引用 0 次' },
    '拒马占格生命周期闭环(回归)': { tag: 'mechanic:拒马阵', note: '拒马每回合落位、回合末概率消散；需本局选到「巨马阵」才有样本，未选到即 skip（不报红）' },
    '蝶变附身窗口成对与宿主归属(回归)': { tag: 'hero:小昭', note: '小昭·姊强制上阵即有样本；HOST_DEAD 的 hostUid 缺口已由主代码修正（进函数先存 hostUidBeforeClear），本条留作回归护栏' },
    '附身窗口内小昭不参战(回归)': { tag: 'hero:小昭', note: '窗口内以她 uid 的攻击结算必须为 0（她 _acted/_untargetable），156 场 364 个窗口 0 违规' },
    '幼狮成长时机与形态口径(回归)': { tag: 'hero:谢逊', note: '数值本身由 161 负责；本条只管时机（晚于召唤一回合）、每只一次、pos→雄/母狮映射（frontMax 取 content 真值）' }
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