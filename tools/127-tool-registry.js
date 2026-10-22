// tools/127-tool-registry.js — 工具箱共用名单与文案表（只读常量，不跑逻辑）
// V1.1.0 | 2026-10-22 新增 ELITE_UNIT_META（flag/stdPos/tag/role），114 基线对比与 115 阵容采样改从这里取，
//   补谢逊/寒离飒时不再各自手抄；配合 29 V7.6.x 寒离飒进强精英池
// V1.0.0 | 预估 3300 bytes | 2026-10-22 新建：精英名单 / 敌方变体 / 海克斯中文名 / force 键与单位标记
//   原先散在 112（4 组名单）、126（4 组名单 + 中文名）、116（newAgg 硬编码 6 人 + keyMap + 两个 flagMap）、
//   122（ELITE_LABELS）、108（HEX_NAME_MAP）共 5 个文件里，加新精英/新海克斯要人工同步 3~5 处——
//   2026-10-21 加寒离飒时 126 跟了、122 漏了，就是这套重复的直接代价。
//   本文件为单一来源；各工具 import 这里的常量，不再自建副本。
// 维护：新增精英/海克斯时只改本文件；各工具的表头、判读、force 通道会自动跟上。
export const VER = 'tools/127-tool-registry.js V1.1.0';

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
    { name: '唐文亮', side: 'enemy' }
];

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
    '唐文亮': 'isTangWenLiang'
};

// 精英单位元数据（114 基线对比 / 115 阵容采样共用）：flag = unit 身份标记；stdPos = 29 固定站位；
// tag = 组合缩写；role = 基准职业（中文枚举值，替换时作初始职业）。加新精英只改这里。
export const ELITE_UNIT_META = {
    '张无忌': { flag: 'isZhang', stdPos: 5, tag: '张', role: '远程' },
    '韦一笑': { flag: 'isWei', stdPos: 6, tag: '韦', role: '飞行' },
    '小昭·姊': { flag: 'isXiaoZhaoSister', stdPos: 4, tag: '昭姊', role: '远程' },
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
    unity: '众志成城'
};