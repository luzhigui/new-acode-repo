﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// core/01config-5v5-test.js - 光明顶5v5 全量配置
// V5.4.0 | ~16700 bytes| 2026-07-05 → V5.3.2 | 接入 content/200game-data.json
export const VER = 'core/01config-5v5-test.js V5.4.0';

// ==================== 游戏数据加载 ====================
let gameData = null;

async function loadGameData() {
    if (gameData) return gameData;
    try {
        const resp = await fetch('./content/200game-data.json');
        gameData = await resp.json();
        return gameData;
    } catch (e) {
        console.warn('游戏数据加载失败，使用内置默认值', e);
        return null;
    }
}

// 同步获取（如果还没加载完就返回 null，调用方需要处理）
function getGameData() {
    return gameData;
}

// 从 gameData 读取角色技能参数，如果没加载完就回退到硬编码默认值
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

// ==================== 原配置内容（不变） ====================

const CONFIG = {
    MING_ALL: ['张无忌', '韦一笑', '殷天正', '杨逍', '范遥', '庄铮', '颜垣', '吴劲草', '周颠', '张中', '说不得', '冷谦', '彭莹玉', '明教洪午', '明教岳山', '明教石虎', '明教弟子1', '明教弟子2', '明教弟子3'],
    MING_M: {
        '张无忌': 115, '韦一笑': 107,
        '殷天正': 104, '杨逍': 104, '范遥': 104,
        '庄铮': 100, '颜垣': 100, '吴劲草': 100,
        '周颠': 100, '张中': 100, '说不得': 100, '冷谦': 100, '彭莹玉': 100,
        '明教洪午': 97, '明教岳山': 97, '明教石虎': 97,
        '明教弟子1': 95, '明教弟子2': 95, '明教弟子3': 95
    },
    ENEMY_SECTS: ['少林', '武当', '峨眉', '昆仑', '崆峒'],
    ENEMY_TITLES: {
        '少林': ['空闻', '空智', '空性', '少林圆真', '少林圆音', '少林圆业', '少林慧轮', '少林慧净', '少林虚竹', '少林虚清', '少林弟子'],
        '武当': ['清虚', '清风', '明月', '武当凌云', '武当松溪', '武当莲舟', '武当岱岩', '武当声谷', '武当弟子'],
        '峨眉': ['静玄', '静虚', '静照', '峨眉慧静', '峨眉慧心', '峨眉慧明', '峨眉妙清', '峨眉妙音', '峨眉素问', '峨眉灵枢', '峨眉弟子'],
        '昆仑': ['何太冲', '班淑娴', '昆仑白鹿子', '昆仑灵宝', '昆仑玉清', '昆仑紫阳', '昆仑弟子'],
        '崆峒': ['宗维侠', '常敬之', '崆峒唐文亮', '崆峒胡豹', '崆峒简捷', '崆峒赵明', '崆峒弟子'],
        'default': ['少林弟子', '武当弟子', '峨眉弟子', '昆仑弟子', '崆峒弟子']
    },
    ROLES: ['战士', '防战', '远程', '飞行'],
    ATK_VAR: 6, DEF_VAR: 4, HP_BONUS_MIN: 0, HP_BONUS_MAX: 5,
    FANG_LEVELS: [0.150, 0.200, 0.240, 0.270, 0.290, 0.310, 0.330, 0.350, 0.370, 0.390, 0.410, 0.430, 0.460, 0.490, 0.530, 0.570, 0.620, 0.670, 0.730, 0.800],
    FANG_K: [0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.11, 0.12, 0.14, 0.16, 0.19, 0.22, 0.26, 0.30, 0.35, 0.46, 0.66, 0.88, 1.16, 6.66],
    MAX_ROUND: 35,
    HP_DMG_RATIO: 0.04,
    BASE_DODGE_FLY: 0.15,
    BASE_DODGE_GROUND: 0.03,
    DODGE_REBOUND_RATIO: 0.5,
    WARRIOR_BREAK_DEF: 2,
    RANGED_GROWTH_ATK: 2,
    FORTIFY_INCREMENT: 1,
    FORTIFY_CAP: 3,
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
    BUFFS: {
        doubleStrike: { name: '概率连击', desc: '己方随机一人80%概率额外攻击一次（持续4回合）', prob: 0.8, icon: '⚡' },
        carry: { name: '你就是carry', desc: '5号位获得队友基础加成，死亡队友加成双倍（持续4回合）', atkBonus: 0.08, defBonus: 0.08, hpBonus: 0.1, deathMultiplier: 2, duration: 4, icon: '👑' },
        cloudBody: { name: '流云身法', desc: '己方全体闪避概率+25%（持续4回合）', dodgeBonus: 0.25, icon: '💨' },
        horseFormation: { name: '巨马阵', desc: '每回合开始生成巨马(25血/0攻/5防)，回合结束50%概率销毁（持续4回合）', horseHp: 25, horseAtk: 0, horseDef: 5, spawnProb: 1.0, destroyProb: 0.5, icon: '🐴' },
        meteorShower: { name: '流星赶月', desc: '己方远程对目标造成40%额外伤害，对周围溅射30%，主箭降2防，小箭降1防（持续4回合）', bonusRatio: 0.4, splashRatio: 0.3, mainDefReduce: 2, splashDefReduce: 1, icon: '☄️' },
        bloodthirst: { name: '嗜血狂刀', desc: '己方战士攻击吸血80%伤害值（持续4回合）', leechRatio: 0.8, icon: '🗡️' },
        fortify: { name: '严阵以待', desc: '己方防战防御+50%，反弹50%伤害差值（持续4回合）', defBonus: 0.5, reboundRatio: 0.5, icon: '🛡️' },
        windAssault: { name: '乘风突袭', desc: '飞行单位80%概率对同行敌人造成100%伤害，60%击退一格（持续3回合）', hitProb: 0.8, pushProb: 0.6, duration: 3, icon: '🦅' },
        holyFlame: { name: '圣火令', desc: '随机1列+30%攻击，随机2行+30%防御（持续4回合）', atkBonus: 0.3, defBonus: 0.3, icon: '🔥' },
        hotBlood: { name: '热血奋战', desc: '攻击时回复15%已损失生命值，每第3次攻击回血翻倍（持续4回合）', leechRatio: 0.15, critRatio: 0.3, critInterval: 3, icon: '❤️' },
        mindControl: { name: '惑人心智', desc: '最前排单位攻击时：80%扰乱敌方换位，40%扰乱己方换位（持续2回合）', enemySwapProb: 0.8, allySwapProb: 0.4, duration: 2, icon: '🌀' }
    },
    BUFF_ROLE_REQUIREMENTS: {
        bloodthirst: '战士',
        fortify: '防战',
        meteorShower: '远程',
        windAssault: '飞行'
    },
    XIAO_ZHAO_PERMANENT_BUFFS: ['fortify', 'bloodthirst', 'meteorShower', 'windAssault', 'cloudBody', 'hotBlood', 'carry', 'doubleStrike', 'mindControl', 'horseFormation', 'holyFlame'],
    MING_SQUADS: {
        1: [['张无忌', 100, 97, 97, 95], ['韦一笑', 104, 100, 97, 95], ['小昭', 104, 100, 97, 95], [104, 104, 104, 104, 95]]
    },
    MING_TARGET_POWER: { 2: 500, 3: 520, 4: 540, 5: 560, 6: 580 },
    ELITE_POWER: { '张无忌': 130, '韦一笑': 120, '小昭': 135 },
    ELITE_RATE: { '张无忌': 0.40, '韦一笑': 0.30, '小昭': 0.30 },
    NORMAL_POWER: { 95: 90, 97: 95, 100: 100, 104: 110 },
    ENEMY_SQUADS: {
        1: [104,104,100,97,95],
        2: [104,104,100,100,97],
        3: [{ name: '宋青书', role: '飞行', m: 107 }, 104, 104, 100, 97],
        4: [{ name: '宋青书', role: '飞行', m: 107 }, { name: '周芷若', role: '战士', m: 107 }, 104, 104, 100],
        5: [{ name: '鹿杖客', role: '远程', m: 112, skill: 'xuanmingPalm' }, { name: '鹤笔翁', role: '飞行', m: 112, skill: 'hornStrike' }, 104, 104, 100],
        6: [{ name: '成昆', role: '防战', m: 112 }, 104, 104, 104, 100]
    },
    ENEMY_POS_TEMPLATES: {
        1: { '防战': [3], '战士': [1, 5], '远程': [8], random: 2 },
        2: { '防战': [1, 3], '战士': [5], '飞行': [4, 6], '远程': [8, 9], random: 2 },
        3: { '防战': [1, 3], '战士': [2], '远程': [8], random: 1 },
        4: { '防战': [1], '远程': [7], random: 3 },
        5: { '防战': [1], '战士': [2], '远程': [8], random: 3 },
        6: { '防战': [1], '战士': [2], '远程': [7], '飞行': [8], random: 1 }
    },
    ELITE_POS_PRIORITY: {
        '战士': [1, 2, 3, 4, 5, 6, 7, 8, 9],
        '防战': [1, 2, 3, 4, 5, 6, 7, 8, 9],
        '飞行': [1, 2, 3, 4, 5, 6, 7, 8, 9],
        '远程': [7, 8, 9, 4, 5, 6, 1, 2, 3]
    },

    ELITE_POOL: {
        3: [{ name: '宋青书', role: '飞行', m: 107, skill: 'rebelStrike', pos: 5 }],
        4: [
            { name: '宋青书', role: '飞行', m: 107, skill: 'rebelStrike', pos: 5 },
            { name: '周芷若', role: '战士', m: 107, skill: 'nineYinClaw', pos: 2 }
        ],
        5: [
            { name: '鹿杖客', role: '远程', m: 112, skill: 'xuanmingPalm', pos: 7 },
            { name: '鹤笔翁', role: '飞行', m: 112, skill: 'hornStrike', pos: 4 }
        ],
        6: [
            { name: '成昆', role: '防战', m: 112, skill: 'phantomThunder', pos: 1 }
        ]
    },
    // 精英怪技能参数 — 宋青书/周芷若已迁移至 content/200game-data.json，
    // 此处保留的键名仍用于代码引用，但数值由 gameData 覆盖
    ELITE_SKILLS: {
        weiBloodDodge: { name: '残血幻影', maxRatio: 0.70 },
        coldPalm: { name: '寒冰掌', leechMin: 15, leechMax: 45 },
        nineYinClaw: {
            name: '九阴白骨爪',
            firstProcChance: 1.0,
            procChance: 0.80,
            chainProcChance: 0.80,
            maxChain: Infinity,
            unavoidable: true,
            baseDmg: 1.5,
            lostHpRatio: 0.015,
            maxHpRatio: 0.01,
            jealousBaseDmg: 2,
            jealousLostHpRatio: 0.015,
            jealousMaxHpRatio: 0.015,
            executeThreshold: 0.15,
            jealousExecuteThreshold: 0.18
        },
        rebelStrike: { 
            name: '叛逆突袭', dmgBonus: 0,
            currentHpRatio: 0.10
        },
        phantomThunder: { name: '混元霹雳劲', lostHpRatio: 0.2 },
        phantomDisguise: { name: '幻影伪装', baseChance: 0.30, per10pctLost: 0.06 },
        xuanmingPalm: { name: '玄冥神掌', dotPercents: [0.04, 0.02, 0.01], duration: 3 },
        hornStrike: { name: '鹿角杖法', defIgnore: 0.3, poisonedBonus: 0.3 },
        kuLian: {
            name: '苦练',
            icon: '💪',
            desc: '场上无周芷若时每回合最先行动；每次行动前给全体队友+1攻+1防+2.5生命上限，自身翻倍',
            atkBonus: 1,
            defBonus: 1,
            hpBonus: 2.5
        },
        xiaoZhaoDoubleStrike: { chance: 0.80 },
        xiaoZhao: {
            name: '蝶变乾坤',
            icon: '🦋',
            desc: '每回合随机变换职业，继承队友遗志。无张无忌时，队友受伤触发减伤、治疗和攻击加成。张无忌在场时，升级乾坤大挪移为全队减伤30%并反弹。',
            defToReduce: 150,
            defToHeal: 8,
            defToAtk: 16,
            minReduce: 0.5,
            minHeal: 0.5,
            minAtk: 0.5,
            upgradedReducePct: 0.30,
            normalReducePct: 0.10,
            normalReboundPct: 0.10,
            normalSelfDmgPct: 0.10,
            upgradedReboundPct: 0.20,
            upgradedSelfDmgPct: 0.10,
            horseSpawnLimit: 1,
            hexEnhance: {
                bloodthirst: { extraStrike: true },
                hotBlood: { leechPct: 0.20, critInterval: 2 },
                windAssault: { hitProb: 1.0, pushProb: 0.80 },
                meteorShower: { atkPerSplash: 2 },
                mindControl: { enemySwapProb: 0.95, allySwapProb: 0.50 },
                fortify: { healOnRebound: true },
                horseFormation: { horseAtk: 0, horseDef: 30, horseHp: 30, reboundDmg: 5 },
                carry: { multiTarget: true, targetPositions: [4, 5, 6] },
                holyFlame: { atkCols: 2, defRows: 2, atkBonus: 0.3, defBonus: 0.3, xiaoZhaoAtkCols: [1, 2], xiaoZhaoDefRows: [1, 2], xiaoZhaoPermanentSelf: true }
            }
        },
        xinHun: {
            name: '新婚',
            hpDeduct: 1,
            healLevels: [0.16, 0.10, 0.06, 0.03]
        },
        xingFen: {
            name: '性奋',
            desc: '每次攻击后可再次攻击，每次攻击后自身减少递增生命上限（第1次0，第2次1，第3次2...），上限最低为1',
            maxTriggersPerRound: 1
        }
    }
};

const ENEMY_M = {
    '空闻': 104, '空智': 104, '空性': 104,
    '清虚': 104, '清风': 104, '明月': 104,
    '静玄': 104, '静虚': 104, '静照': 104,
    '何太冲': 104, '班淑娴': 104,
    '宗维侠': 104, '常敬之': 104,
    '少林圆真': 97, '少林圆音': 97, '少林圆业': 97, '少林慧轮': 97, '少林慧净': 97, '少林虚竹': 97, '少林虚清': 97,
    '武当凌云': 97, '武当松溪': 97, '武当莲舟': 97, '武当岱岩': 97, '武当声谷': 97,
    '峨眉慧静': 97, '峨眉慧心': 97, '峨眉慧明': 97, '峨眉妙清': 97, '峨眉妙音': 97, '峨眉素问': 97, '峨眉灵枢': 97,
    '昆仑白鹿子': 97, '昆仑灵宝': 97, '昆仑玉清': 97, '昆仑紫阳': 97,
    '崆峒唐文亮': 97, '崆峒胡豹': 97, '崆峒简捷': 97, '崆峒赵明': 97,
    '少林弟子': 95, '武当弟子': 95, '峨眉弟子': 95, '昆仑弟子': 95, '崆峒弟子': 95,
    '宋青书': 107, '周芷若': 107, '成昆': 112, '鹿杖客': 112, '鹤笔翁': 112
};

const STATE = { IDLE: 'IDLE', RUNNING: 'RUNNING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER', STATS: 'STATS', BUFF_SELECT: 'BUFF_SELECT' };

const TAUNT_LIB = {
    '张无忌': ['看招！太极拳！', '乾坤大挪移！', '少林武当，也不过如此！'],
    '韦一笑': ['青翼蝠王，来去如风！', '哈哈哈，抓不到我！', '让你尝尝寒冰掌！'],
    '宋青书': ['让你见识武当绝学！', '哼，不过如此！', '就这点本事？'],
    '周芷若': ['九阴白骨爪！', '看招！', '峨眉可不是好惹的！'],
    '成昆': ['混元霹雳劲！', '受死吧！', '哈哈哈，无人能挡！'],
    '鹿杖客': ['玄冥神掌！', '尝尝这滋味！', '你们这些蝼蚁！'],
    '鹤笔翁': ['鹿角杖法！', '看招！', '敢接我一杖吗？'],
    '战士': ['看剑！', '接招吧！', '这一剑你可接得住？'],
    '防战': ['不动如山！', '放马过来！', '就这点本事吗？'],
    '远程': ['看箭！', '中！', '雕虫小技！'],
    '飞行': ['来去如风！', '追得上我吗？', '鹰击长空！']
};

const KILL_TAUNT = {
    '张无忌': ['这就是太极拳的精髓！', '乾坤大挪移之下，无人能敌！', '魔教张无忌在此！'],
    '韦一笑': ['哼，不自量力！', '寒冰掌下无活口！', '想抓我？下辈子吧！'],
    '战士': ['一剑封喉！', '受死吧！', '剑下亡魂又多一个！'],
    '防战': ['螳臂当车！', '不过如此！', '谁能突破我的防御？'],
    '远程': ['百步穿杨！', '箭无虚发！', '取你性命如探囊取物！'],
    '飞行': ['鹰击长空，一击必杀！', '天上地下，唯我独尊！', '你的死期到了！']
};

const ZHANG_NEAR_TAUNT = ['还好，还记得七七八八。', '糟糕，只记得一两层了。', '不好，全忘光了！'];
const DEF_TAUNT = ['就这点攻击力？', '花拳绣腿！', '根本不够看！'];
const HP_TAUNT = ['撑住，必须撑住！', '这点小伤不算什么！', '还没完呢！'];

export { CONFIG, STATE, TAUNT_LIB, KILL_TAUNT, ZHANG_NEAR_TAUNT, DEF_TAUNT, HP_TAUNT, ENEMY_M };