// core/01config-5v5-test.js - 光明顶5v5 全量配置
// V5.5.2 | ~9450 bytes| 2026-08-24 坚盾每回合上限 3→4（成昆倍率联动变 8）
export const VER = 'core/01config-5v5-test.js V5.5.2';

// ==================== 游戏数据加载 ====================
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

// ==================== 配置 ====================
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
    ROLES: ['战士', '防战', '远程', '飞行'],
    ATK_VAR: 6, DEF_VAR: 4, HP_BONUS_MIN: 0, HP_BONUS_MAX: 5,
    RANGED_MISS_CHANCE: 3,
    FLY_MISS_CHANCE: 6,
    GROUND_MISS_CHANCE: 1,
    FLY_MISS_LOWHP_BONUS: 3,
    FANG_LEVELS: [0.150, 0.200, 0.240, 0.270, 0.290, 0.310, 0.330, 0.350, 0.370, 0.390, 0.410, 0.430, 0.460, 0.490, 0.530, 0.570, 0.620, 0.670, 0.730, 0.800],
    FANG_K: [0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.11, 0.12, 0.14, 0.16, 0.19, 0.22, 0.26, 0.30, 0.35, 0.46, 0.66, 0.88, 1.16, 6.66],
    MAX_ROUND: 35,
    BASE_DODGE_FLY: 0.15,
    BASE_DODGE_GROUND: 0.03,
    DODGE_REBOUND_RATIO: 0.5,
    WARRIOR_BREAK_DEF: 2,
    RANGED_GROWTH_ATK: 2,
    FORTIFY_INCREMENT: 1,
    FORTIFY_CAP: 4,
    TOKEN_DROP_RATES: [0, 1.5, 2, 2.5, 4, 5.5, 6],
    CHEST_DROP_RATE: 0.2,
    BUFF_DURATION: 4,
    BUFF_CHOICES: 3,
    BGM_LOCAL: 'assets/sfx_xinai.mp3',
    SFX: {
        '远程': 'assets/sfx_arrow.mp3',
        '飞行': 'assets/sfx_fly.mp3',
        '战士': 'assets/sfx_melee.mp3',
        '防战': 'hammer'
    },
    get BUFFS() {
        return getGameData().buffs;
    },
    BUFF_ROLE_REQUIREMENTS: {
        bloodthirst: '战士',
        fortify: '防战',
        meteorShower: '远程',
        windAssault: '飞行'
    },
    XIAO_ZHAO_PERMANENT_BUFFS: ['fortify', 'bloodthirst', 'meteorShower', 'windAssault', 'cloudBody', 'hotBlood', 'carry', 'doubleStrike', 'mindControl', 'horseFormation', 'holyFlame'],
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
    ELITE_POS_PRIORITY: {
        '战士': [1, 2, 3, 4, 5, 6, 7, 8, 9],
        '防战': [1, 2, 3, 4, 5, 6, 7, 8, 9],
        '飞行': [1, 2, 3, 4, 5, 6, 7, 8, 9],
        '远程': [7, 8, 9, 4, 5, 6, 1, 2, 3]
    },

    get ELITE_POOL() {
        return getGameData().encounters.elitePool;
    }
    // 精英技能参数已全部迁入 content/200game-data.json 的 characters.*.skills.*.params
    // 与 characters.*.mechanics，读取统一走 getSkillParams（缺失即配置错误，调用方 throw）
};



const STATE = { IDLE: 'IDLE', RUNNING: 'RUNNING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER', STATS: 'STATS', BUFF_SELECT: 'BUFF_SELECT' };

export { CONFIG, STATE };
