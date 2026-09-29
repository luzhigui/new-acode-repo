// V6.2.5 | ~10400 bytes | 2026-09-29 参数体系收敛批 3：战斗通用规则常量收进 CONFIG——低血/斩杀阈值、拒马 M、热血奋战间隔、防御波动阈值、小昭飞天档位/次数/惑心概率、张无忌近战上限与融会贯通系数、全精通额外层数
export const VER = 'core/01config-5v5-test.js V6.2.5';

import { ROLE_TYPES } from '../infra/56-battle-enums.js';

// 游戏数据加载
// 游戏数据唯一来源：content/200game-data.json。加载失败直接抛错，不静默回退。
let gameData = null;

async function loadGameData() {
    if (gameData) return gameData;
    const resp = await fetch(new URL('../content/200game-data.json', import.meta.url));
    if (!resp.ok) throw new Error(`游戏数据加载失败：HTTP ${resp.status}`);
    gameData = await resp.json();
    return gameData;
}

// 同步获取（如果还没加载完就返回 null，调用方需要处理）
function getGameData() {
    return gameData;
}

// 从 gameData 读取角色技能参数，取不到返回 null（调用方按需 throw）
function getSkillParams(characterName, skillKey) {
    const ch = gameData?.characters?.[characterName];
    const skill = ch?.skills?.[skillKey];
    return skill?.params || null;
}

function getSkillParamsJealous(characterName, skillKey) {
    const ch = gameData?.characters?.[characterName];
    const skill = ch?.skills?.[skillKey];
    return skill?.paramsJealous || null;
}

function getSkillName(characterName, skillKey) {
    const ch = gameData?.characters?.[characterName];
    const skill = ch?.skills?.[skillKey];
    return skill?.name || skillKey;
}

function getSkillDesc(characterName, skillKey, jealous) {
    const ch = gameData?.characters?.[characterName];
    const skill = ch?.skills?.[skillKey];
    if (!skill) return '';
    const template = jealous ? (skill.descJealous || skill.desc) : skill.desc;
    const params = jealous ? (skill.paramsJealous || skill.params) : (skill.params || {});
    // 替换 {key} 占位符
    return template.replace(/\{(\w+)\}/g, (_, key) => {
        let val = params[key];
        if (val === undefined || val === null) return `{${key}}`;
        if (Array.isArray(val)) return val.map(v => (typeof v === 'number' && v < 1 ? Math.round(v * 1000) / 10 : v) + '%').join('→');
        if (key.toLowerCase().includes('ratio') || key === 'currentHpRatio' || key === 'executeThreshold') {
            if (typeof val === 'number' && val < 1) return String(Math.round(val * 1000) / 10);
            return val;
        }
        return val;
    });
}

// 导出加载函数供外部使用
export { loadGameData, getGameData, getSkillParams, getSkillParamsJealous, getSkillName, getSkillDesc };

// 配置
// 数据型配置全部直读 gameData（单一数据源，缺失即抛错）；此处仅保留纯规则常量。

const CONFIG = {
    get MING_ALL() {
        return getGameData().roster.mingAll;
    },
    get MING_M() {
        return getGameData().roster.mingM;
    },
    get ENEMY_SECTS() {
        return getGameData().roster.enemySects;
    },
    get ENEMY_TITLES() {
        return getGameData().roster.enemyTitles;
    },
    ROLES: [ROLE_TYPES.WARRIOR, ROLE_TYPES.DEFENDER, ROLE_TYPES.RANGED, ROLE_TYPES.FLYER],
    ATK_VAR: 6, DEF_VAR: 4, HP_BONUS_MIN: 0, HP_BONUS_MAX: 5,
    RANGED_MISS_CHANCE: 3,
    FLY_MISS_CHANCE: 6,
    GROUND_MISS_CHANCE: 1,
    FLY_MISS_LOWHP_BONUS: 6,
    FLY_MISS_EMPTYCOL_REDUCE: 12,
    FANG_LEVELS: [0.150, 0.200, 0.240, 0.270, 0.290, 0.310, 0.330, 0.350, 0.370, 0.390, 0.410, 0.430, 0.460, 0.490, 0.530, 0.570, 0.620, 0.670, 0.730, 0.800],
    FANG_K: [0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.11, 0.12, 0.14, 0.16, 0.19, 0.22, 0.26, 0.30, 0.35, 0.46, 0.66, 0.88, 1.16, 2.66],
    // 防战血量伤害系数（z 值）分档表：按初始血量占比锁档，占比越高档位越高（core/02 getHpDmgRatio）
    // 血量生成区间为 [0.4m, 0.6m]，占比达不到 0.57 以上极少，故最高档门槛为 0.57
    HP_DMG_RATIO_TIERS: [
        { min: 0.57, ratio: 0.06 },
        { min: 0.54, ratio: 0.05 },
        { min: 0.51, ratio: 0.04 },
        { min: 0.48, ratio: 0.03 },
        { min: 0.45, ratio: 0.025 },
        { min: 0.43, ratio: 0.02 }
    ],
    HP_DMG_RATIO_FLOOR: 0.015,
    // 属性生成（core/02 Unit.init / initXiaoZhao）
    HP_ROLL_RANGE: [0.4, 0.6],       // 血量掷点区间（× m）
    HP_TO_MAXHP_MUL: 2.5,            // 掷出血量 → 生命上限 倍率
    XIAO_ZHAO_HP_ROLL: 0.5,          // 小昭血量分配比例（floor(m × 该值)），兼作她的 _hpDmgRatio 占比
    DEFENDER_DEF_ROLL: [0.5, 1],     // 防战防御掷点区间（× rem，上界再夹到 rem-1）
    DEFENDER_ATK_DEF_MAXGAP: 20,     // 防战约束：防 - 攻 ≤ 该值
    DPS_DEF_ROLL: [0.3, 0.5],        // 非防战防御掷点区间（× rem）
    DPS_ATK_DEF_GAP: [3, 13],        // 非防战约束：攻 - 防 ∈ 该区间
    // 胖远桥「正义国字脸 / 年轻气盛」二选一阈值（modules/26）：
    //   T = min(cap, base + (atk - atkRef) / atkDiv)；p_打歪 = clamp((1 - 血量比) / (1 - T), 0, 1)
    PANG_CLUMSY_FORMULA: { base: 0.10, atkRef: 30, atkDiv: 200, cap: 0.95 },
    MAX_ROUND: 35,
    HEX_INTERVAL: 3,
    // 精英出场人数骰（29battle-init 用）：<0.05 出 3 人 / <0.20 出 2 人 / <0.80 出 1 人 / 其余 0 人
    ELITE_COUNT_THRESHOLDS: [0.05, 0.20, 0.80],
    // 小昭形态骰（29battle-init 用）：默认 50% 为「小昭·姊」；图鉴选 xz 偏向姊、选 xm 偏向妹
    XIAO_ZHAO_SISTER_PROB: { default: 0.5, xz: 0.85, xm: 0.15 },
    BASE_DODGE_FLY: 0.15,
    BASE_DODGE_GROUND: 0.03,
    DODGE_REBOUND_RATIO: 0.5,
    WARRIOR_BREAK_DEF: 2,
    // 战士破防分档表（2026-09-14 参数三源收敛：原为 03battle-utils 内联魔法数字）
    // 按目标防御值落档：defMax 为档位上限（null = 兜底档），reduce 破防量，chance 触发率(%)
    WARRIOR_BREAK_DEF_TIERS: [
        { defMax: 40,   reduce: 2, chance: null },   // 低防：概率 = 防御 × 2.5
        { defMax: 50,   reduce: 3, chance: 100 },
        { defMax: null, reduce: 4, chance: 100 }
    ],
    WARRIOR_BREAK_CHANCE_PER_DEF: 2.5,
    RANGED_GROWTH_ATK: 2,
    FORTIFY_INCREMENT: 1,
    FORTIFY_CAP: 4,
    TOKEN_DROP_RATES: [0, 1.5, 2, 2.5, 4, 5.5, 6],
    CHEST_DROP_RATE: 0.2,
    BUFF_DURATION: 4,
    BUFF_CHOICES: 3,
    BGM_LOCAL: 'assets/sfx_xinai.mp3',
    // BGM 曲目表：默认仅展示前两首；第三首为隐藏曲目（需弹窗标题连点 5 次解锁）
    BGM_TRACKS: [
        { id: 'bgm_a', name: '中国风武侠', file: 'assets/bgm-wuxia.mp3' },
        { id: 'bgm_b', name: 'China Chinese', file: 'assets/bgm-chinese.mp3' },
        { id: 'bgm_xinai', name: '心爱(隐藏)', file: 'assets/sfx_xinai.mp3' }
    ],
    SFX: {
        [ROLE_TYPES.RANGED]: 'assets/sfx_arrow.mp3',
        [ROLE_TYPES.FLYER]: 'assets/sfx_fly.mp3',
        [ROLE_TYPES.WARRIOR]: 'assets/sfx_melee.mp3',
        [ROLE_TYPES.DEFENDER]: 'hammer'
    },
    get BUFFS() {
        return getGameData().buffs;
    },
    BUFF_ROLE_REQUIREMENTS: {
        bloodthirst: ROLE_TYPES.WARRIOR,
        fortify: ROLE_TYPES.DEFENDER,
        meteorShower: ROLE_TYPES.RANGED,
        windAssault: ROLE_TYPES.FLYER
    },
    get XIAO_ZHAO_PERMANENT_BUFFS() {
        return getGameData().hexes?.permanentBuffKeys || [];
    },
    get MING_SQUADS() {
        return getGameData().encounters.mingSquads;
    },
    get MING_TARGET_POWER() {
        return getGameData().encounters.mingTargetPower;
    },
    get ELITE_POWER() {
        return getGameData().roster.elitePower;
    },
    get ELITE_RATE() {
        return getGameData().roster.eliteRate;
    },
    get NORMAL_POWER() {
        return getGameData().roster.normalPower;
    },
    get ENEMY_M() {
        return getGameData().roster.enemyM;
    },
    get ENEMY_SQUADS() {
        return getGameData().encounters.enemySquads;
    },
    get ENEMY_POS_TEMPLATES() {
        return getGameData().encounters.enemyPosTemplates;
    },
    // 关卡阵容变体：encounters.squadVariants[stage] 存在时，29battle-init 每局随机抽一组（第三关：宋青书 / 胖远桥）
    get ENCOUNTER_VARIANTS() {
        return getGameData().encounters.squadVariants || {};
    },
    ELITE_POS_PRIORITY: {
        [ROLE_TYPES.WARRIOR]: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        [ROLE_TYPES.DEFENDER]: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        [ROLE_TYPES.FLYER]: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        [ROLE_TYPES.RANGED]: [7, 8, 9, 4, 5, 6, 1, 2, 3]
    },
    // 六大派精英按身份覆盖的站位优先表（身份优先于上面的职业表；modules/29 用）
    ENEMY_ELITE_POS_PRIORITY: {
        chengKun: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        mieJueShiTai: [2, 1, 3, 4, 5, 6, 7, 8, 9],
        pangYuanQiao: [2, 1, 3, 4, 5, 6, 7, 8, 9],
        luZhangKe: [7, 8, 9, 4, 5, 6, 1, 2, 3],
        heBiWeng: [3, 4, 5, 6, 7, 8, 9, 1, 2]
    },
    ENEMY_ELITE_POS_FALLBACK: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    // 阵容 power 兜底（modules/29 用）
    MING_TARGET_POWER_FALLBACK: 500,  // 关卡目标 power 兜底（第 1 关未在 encounters.mingTargetPower 列出）
    POWER_FALLBACK: 90,               // 单卡 power 兜底（= roster.normalPower 最低档）
    XUANMING_EXTRA_M: 104,            // 第 5 关玄冥二老齐出时额外补的普通兵 M 值

    // ── 参数体系收敛批 3：战斗通用规则常量 ──
    LOW_HP_THRESHOLD: 0.4,                 // 低血判据阈值（03 攻击未命中残血光环 / hasEnemyLowHp 默认）
    EXEC_THRESHOLD: 0.15,                  // 战士斩杀阈值（03）
    EXEC_THRESHOLD_BLOODTHIRST: 0.20,      // 嗜血状态下战士斩杀阈值（03）
    HORSE_M: 15,                           // 拒马单位预算 M（05 spawnHorse）
    HOT_BLOOD_CRIT_INTERVAL: 3,            // 热血奋战双倍吸血间隔（04）
    DEF_WAVE_THRESHOLD: 7,                 // 攻击波动「防御波动」台词阈值（12，defVar + hpBonus 达标）
    SPIDER_FLY_HP_THRESHOLDS: [0.7, 0.4],  // 小昭·妹飞天触发的血量占比档（27，按序取：70% → 40%）
    SPIDER_MIND_CONTROL_CHANCE: 0.15,      // 永久惑心误伤概率（27）
    XIAO_ZHAO_CARRY_MODS: { atk: 3, def: 4, maxHp: 20 },  // 小昭·妹永久 carry 加成（27）
    ZHANG_NEAR_ATK_LIMIT: 3,               // 张无忌近战次数上限（融会贯通，27 / 03）
    ZHANG_RONGHUI_RATIO: 0.5,              // 融会贯通额外伤害系数（27）
    MASTERY_FULL_BONUS_LAYERS: 2,          // 小昭全精通后额外加的层数（20）

    get ELITE_POOL() {
        return getGameData().encounters.elitePool;
    }
    // 精英技能参数已迁入 gameData
    // 与 characters.*.mechanics，读取统一走 getSkillParams（缺失即配置错误，调用方 throw）
};



const STATE = { IDLE: 'IDLE', RUNNING: 'RUNNING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER', STATS: 'STATS', BUFF_SELECT: 'BUFF_SELECT' };

export { CONFIG, STATE };
