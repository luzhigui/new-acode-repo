// tools/827-tool-registry.js — 工具箱共用名单与文案表（只读常量，不跑逻辑）
// 维护：新增精英/海克斯时只改本文件；各工具的表头、判读、force 通道会自动跟上。
// 数据护栏：本文件名单与主代码精英池是否同步，跑 `node tools/828-verify-registry.mjs` 自动比对。
//
// ── 覆盖边界声明（主代码 registerElite 共 20 个精英，本文件精选覆盖）──
//   明教自然核心(6，NATURAL_ELITES + ELITE_UNIT_META)：张无忌 / 韦一笑 / 小昭·姊 / 小昭·妹 / 金毛狮王谢逊 / 寒离飒
//   强精英单挑(5，SOLO_ELITES)：韦一笑 / 小昭·姊 / 小昭·妹 / 金毛狮王谢逊 / 寒离飒
//   Boss(1，BOSS_ELITES)：张无忌
//   弱精英(5，WEAK_ELITES + WEAK_UNIT_FLAG)：杨逍(ally) / 殷天正(ally) / 何太冲(enemy) / 唐文亮(enemy) / 空见(enemy)
//   敌方阵容变体(ENEMY_VARIANTS)：胖远桥 / 宋青书 / 标准（基线）
//   —— 以下为「设计性不单列」，非遗漏：
//      · 随敌方阵容出场的六大派/朝廷强精英（112 评测以明教侧为核心、敌方为基线，不强求单列）：
//        周芷若 / 张三丰 / 灭绝师太 / 成昆 / 鹿杖客 / 鹤笔翁
//      · carry 海克斯召唤物（由 108 海克斯仪表盘覆盖，不单列于精英评测）：雄鹰
//   若主代码新增精英，按上述归类补入对应名单即可；跑 828 校验脚本可发现本文件与主代码漂移。
//   明教侧 M100 普通兵·带技能（绿档，非精英，纳入「英雄跨局表现」与精英同列）：说不得 / 周颠 / 反伤弟子。
//     注意：武当莲舟(俞莲舟)/峨眉素问(素问)虽带技能、也被网格标绿，但属六大派侧（进 r.enemy），
//     不在明教英雄表内；冷谦/彭莹玉等无 mechanics/skills 的纯 M100 杂兵不算「带技能」，亦不纳入。
export const VER = 'tools/827-tool-registry.js V1.5.0';

// ==================== 统计口径阈值（唯一真源） ====================
// 812/809/826/852/814 一律从这里取，禁止再各写字面量；改阈值只改这一处。
// 体检侧 tests/_lib/stats-thresholds.mjs 按同一数值对账，漂移由 S14 报红。
export const STATS_TH = {
    THIN_SAMPLE: 200,     // 812 单格最少场次
    OVERALL_LOW: 35,      // 809 整体胜率下限（低于此值判「不可判平衡」）
    OVERALL_HIGH: 65,     // 809 整体胜率上限
    MIN_SAMPLE: 300,      // 826 单对象最少场次
    PAIR_MIN: 150,        // 826 海克斯两两组合最少场次
    FRESH_DAYS: 14,       // 826 快照过期天数
    HERO_MIN_GAMES: 8,    // 852 英雄最少场次
    HEX_MIN_GAMES: 8,     // 852 单海克斯最少场次
    AB_BAND: 5            // 814 A/B 着色线（百分点）
};

// 自然出场归因表的列（112 主表 / 126 判读），顺序即表头顺序
export const NATURAL_ELITES = ['张无忌', '韦一笑', '小昭·姊', '小昭·妹', '金毛狮王谢逊', '寒离飒'];

// 强精英单挑（M107）：张无忌（M115）属 boss 档，拆到 BOSS_ELITES
export const SOLO_ELITES = ['韦一笑', '小昭·姊', '小昭·妹', '金毛狮王谢逊', '寒离飒'];

// Boss 单表（M115）
export const BOSS_ELITES = ['张无忌'];

// 弱精英（side: ally=明教侧 / enemy=六大派侧）
export const WEAK_ELITES = [
    { name: '杨逍', side: 'ally' },
    { name: '殷天正', side: 'ally' },
    { name: '何太冲', side: 'enemy' },
    { name: '唐文亮', side: 'enemy' },
    { name: '空见', side: 'enemy' }
];

// 明教侧 M100 普通兵·带技能角色（绿档）。生涯记录「英雄跨局表现」纳入，与精英同列统计。
//   不含六大派侧的俞莲舟(武当莲舟)/素问(峨眉素问)（敌方，进 r.enemy 不进 r.ally）；
//   不含冷谦/彭莹玉等无 mechanics/skills 的纯 M100 杂兵。名单需随战斗初始化强制出场名单同步（见 modules/330）。
export const M100_SKILL_ALLIES = ['说不得', '周颠', '反伤弟子'];

// 弱精英名字 → 所属侧（126 判读「过强方向」用，由 WEAK_ELITES 派生，勿另建副本）
export const WEAK_SIDE = Object.fromEntries(WEAK_ELITES.map(w => [w.name, w.side]));

// 敌方阵容变体（第3关在胖远桥/宋青书间轮换，按「本局敌方是谁」拆行）
export const ENEMY_VARIANTS = ['胖远桥', '宋青书', '标准'];

// 122 的阵容分组 key = 自然出场精英名单（别名导出，避免两处定义）
export const ELITE_LABELS = NATURAL_ELITES;

// 单精英 force 键（116 runSoloEliteJob 用）：名字 → GlobalStore 键
export const SOLO_FORCE_KEY = {
    '张无忌': 'forceZhang',
    '韦一笑': 'forceWei',
    '金毛狮王谢逊': 'forceXieXun',
    '寒离飒': 'forceHanLiSa'
};

// 弱精英单位标记（116 runWeakEliteJob 用）：名字 → unit 上的布尔字段
export const WEAK_UNIT_FLAG = {
    '杨逍': 'isYangXiao',
    '殷天正': 'isYinTianZheng',
    '何太冲': 'isHeTaichong',
    '唐文亮': 'isTangWenLiang', '空见': 'isKongJian'
};

// 精英单位元数据（114 基线对比 / 115 阵容采样共用）：flag = unit 身份标记；stdPos = 29 固定站位；
// tag = 组合缩写；role = 基准职业（中文枚举值，替换时作初始职业）。加新精英只改这里。
export const ELITE_UNIT_META = {
    '张无忌': { flag: 'isZhang', stdPos: 5, tag: '张', role: '远程' },
    '韦一笑': { flag: 'isWei', stdPos: 6, tag: '韦', role: '飞行' },
    '小昭·姊': { flag: 'isXiaoZhaoSister', stdPos: 4, tag: '昭姊', role: '蝴蝶' },
    '小昭·妹': { flag: 'isXiaoZhaoBrother', stdPos: 4, tag: '昭妹', role: '远程' },
    '金毛狮王谢逊': { flag: 'isXieXun', stdPos: 7, tag: '谢', role: '战士' },
    '寒离飒': { flag: 'isHanLiSa', stdPos: 2, tag: '寒', role: '战士' }
};

// 海克斯中文名（108 表头 / 126 告警文案共用）
export const HEX_NAMES = {
    doubleStrike: '概率连击',
    horseFormation: '巨马阵',
    carry: '你就是carry',
    windAssault: '乘风突袭',
    cloudBody: '流云身法',
    mindControl: '惑人心智',
    fortify: '严阵以待',
    hotBlood: '热血奋战',
    meteorShower: '流星赶月',
    bloodthirst: '嗜血狂刀',
    holyFlame: '圣火令',
    soulDrain: '摄魂',
    holyFire: '圣火不熄',
    lastStand: '背水一战',
    unity: '众志成城',
    // 2026-11-14 补专属海克斯：之前漏登，108表头/852报告会退化成英文 key
    hlsPower1: '寒离飒强化',
    weiExclusive: '韦一笑强化1',
    zhangDestiny: '我命由我不由天',
    zhangRescue: '快来护驾',
    zhangProdigy: '武学奇才'
};