// core/01config-5v5-test.js - 光明顶5v5 全量配置
// V5.1.0 | ~11322 bytes | 2026-07-05
export const VER = 'core/01config-5v5-test.js V5.1.0';

const CONFIG = {
    MING_ALL: ['张无忌', '韦一笑', '殷天正', '杨逍', '范遥', '庄铮', '颜垣', '吴劲草', '周颠', '张中', '说不得', '冷谦', '彭莹玉', '明教·洪午', '明教·岳山', '明教·石虎', '明教弟子1', '明教弟子2', '明教弟子3'],
    MING_M: {
        '张无忌': 115, '韦一笑': 107,
        '殷天正': 104, '杨逍': 104, '范遥': 104,
        '庄铮': 100, '颜垣': 100, '吴劲草': 100,
        '周颠': 100, '张中': 100, '说不得': 100, '冷谦': 100, '彭莹玉': 100,
        '明教·洪午': 97, '明教·岳山': 97, '明教·石虎': 97,
        '明教弟子1': 95, '明教弟子2': 95, '明教弟子3': 95
    },
    ENEMY_SECTS: ['少林', '武当', '峨眉', '昆仑', '崆峒'],
    ENEMY_TITLES: {
        '少林': ['空闻', '空智', '空性', '少林·圆真', '少林·圆音', '少林·圆业', '少林·慧轮', '少林·慧净', '少林·虚竹', '少林·虚清', '少林弟子'],
        '武当': ['清虚', '清风', '明月', '武当·凌云', '武当·松溪', '武当·莲舟', '武当·岱岩', '武当·声谷', '武当弟子'],
        '峨眉': ['静玄', '静虚', '静照', '峨眉·慧静', '峨眉·慧心', '峨眉·慧明', '峨眉·妙清', '峨眉·妙音', '峨眉·素问', '峨眉·灵枢', '峨眉弟子'],
        '昆仑': ['何太冲', '班淑娴', '昆仑·白鹿子', '昆仑·灵宝', '昆仑·玉清', '昆仑·紫阳', '昆仑弟子'],
        '崆峒': ['宗维侠', '常敬之', '崆峒·唐文亮', '崆峒·胡豹', '崆峒·简捷', '崆峒·赵明', '崆峒弟子'],
        'default': ['少林弟子', '武当弟子', '峨眉弟子', '昆仑弟子', '崆峒弟子']
    },
    ROLES: ['战士', '防战', '远程', '飞行'],
    ATK_VAR: 6, DEF_VAR: 4, HP_BONUS_MIN: 0, HP_BONUS_MAX: 5,
    FANG_LEVELS: [0.244, 0.264, 0.279, 0.292, 0.306, 0.322, 0.342, 0.373, 0.445, 0.520, 0.600],
    FANG_K: [0, 0.02, 0.05, 0.09, 0.13, 0.20, 0.28, 0.37, 0.50, 0.66, 0.86, 1.20],
    MAX_ROUND: 35,
    HP_DMG_RATIO: 0.03,
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
        carry: { name: '你就是carry', desc: '5号位获得队友基础加成，死亡队友加成翻倍（持续3回合）', atkBonus: 0.08, defBonus: 0.08, hpBonus: 0.1, deathMultiplier: 3, duration: 3, icon: '👑' },
        cloudBody: { name: '流云身法', desc: '己方全体闪避概率+25%（持续4回合）', dodgeBonus: 0.25, icon: '💨' },
        horseFormation: { name: '巨马阵', desc: '每回合开始生成巨马(20血/0攻/5防)，回合结束50%概率销毁（持续4回合）', horseHp: 20, horseAtk: 0, horseDef: 5, spawnProb: 1.0, destroyProb: 0.5, icon: '🐴' },
        meteorShower: { name: '流星赶月', desc: '己方远程对目标造成40%额外伤害，对周围溅射30%，主箭降2防，小箭降1防（持续4回合）', bonusRatio: 0.4, splashRatio: 0.3, mainDefReduce: 2, splashDefReduce: 1, icon: '☄️' },
        bloodthirst: { name: '嗜血狂刀', desc: '己方战士攻击吸血80%伤害值（持续4回合）', leechRatio: 0.8, icon: '🗡️' },
        fortify: { name: '严阵以待', desc: '己方防战防御+50%，反弹50%伤害差值（持续4回合）', defBonus: 0.5, reboundRatio: 0.5, icon: '🛡️' },
        windAssault: { name: '乘风突袭', desc: '飞行单位80%概率对同行敌人造成100%伤害，60%击退一格（持续3回合）', hitProb: 0.8, pushProb: 0.6, duration: 3, icon: '🦅' },
        holyFlame: { name: '圣火令', desc: '随机一列+30%攻击，随机一行+30%防御（持续4回合）', atkBonus: 0.3, defBonus: 0.3, icon: '🔥' },
        hotBlood: { name: '热血奋战', desc: '攻击时回复15%已损失生命值，每第3次攻击回血翻倍（持续4回合）', leechRatio: 0.15, critRatio: 0.3, critInterval: 3, icon: '❤️' },
        mindControl: { name: '惑人心智', desc: '最前排单位攻击时：80%扰乱敌方换位，40%扰乱己方换位（持续2回合）', enemySwapProb: 0.8, allySwapProb: 0.4, duration: 2, icon: '🌀' }
    },
    BUFF_ROLE_REQUIREMENTS: {
        bloodthirst: '战士',
        fortify: '防战',
        meteorShower: '远程',
        windAssault: '飞行'
    },
    // 小昭永久海克斯列表（除了职业限定的，她也能永久享有）
    XIAO_ZHAO_PERMANENT_BUFFS: ['fortify', 'bloodthirst', 'meteorShower', 'windAssault', 'cloudBody', 'hotBlood', 'carry', 'doubleStrike', 'mindControl', 'horseFormation', 'holyFlame'],
    // 各关定制阵容（M值总和约束）
    MING_SQUADS: {
        1: [['张无忌', 100, 97, 97, 95], ['韦一笑', 104, 100, 97, 95], ['小昭', 104, 100, 97, 95], [104, 104, 104, 104, 95]]
    },
    // 各关明教目标总战斗力（第1关走模板，不参与约束）
    MING_TARGET_POWER: { 2: 500, 3: 520, 4: 540, 5: 560, 6: 580 },
    // 精英战斗力
    ELITE_POWER: { '张无忌': 140, '韦一笑': 120, '小昭': 140 },
    // 精英出场概率
    ELITE_RATE: { '张无忌': 0.40, '韦一笑': 0.30, '小昭': 0.30 },
    // 普通角色战斗力
    NORMAL_POWER: { 95: 90, 97: 95, 100: 100, 104: 110 },
    ENEMY_SQUADS: {
        1: [104,104,100,97,95],
        2: [104,104,100,100,97],
        3: [{ name: '宋青书', role: '飞行', m: 107 }, 104, 104, 100, 97],
        4: [{ name: '宋青书', role: '飞行', m: 107 }, { name: '周芷若', role: '战士', m: 107 }, 104, 104, 100],
        5: [{ name: '鹿杖客', role: '远程', m: 112, skill: 'xuanmingPalm' }, { name: '鹤笔翁', role: '飞行', m: 112, skill: 'hornStrike' }, 104, 104, 100],
        6: [{ name: '成昆', role: '防战', m: 112 }, 104, 104, 104, 100]
    },
    // 各关普通敌人站位模板
    ENEMY_POS_TEMPLATES: {
        1: { '防战': [3], '战士': [1, 5], '远程': [8], random: 2 },
        2: { '防战': [1, 3], '战士': [5], '飞行': [4, 6], '远程': [8, 9], random: 2 },
        3: { '防战': [1, 3], '战士': [2], '远程': [8], random: 1 },
        4: { '防战': [1], '远程': [7], random: 3 },
        5: { '防战': [1], '战士': [2], '远程': [8], random: 3 },
        6: { '防战': [1], '战士': [2], '远程': [7], '飞行': [8], random: 1 }
    },
    // 精英怪按职业的优先站位顺序
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
    // 精英怪技能参数 (V3.1.0 新增宋青书/周芷若联动技能)
    ELITE_SKILLS: {
        extinctionCounter: { name: '灭绝双剑', hpThreshold: 0.5, counterRatio: 0.8, maxPerRound: 1 },
        nineYinClaw: {
            name: '九阴白骨爪',
            firstProcChance: 1.0,
            procChance: 0.80,
            chainProcChance: 0.80,
            maxChain: Infinity,       // 无连锁上限
            unavoidable: true,
            baseDmg: 1.5,             // 无无忌：基础1.5
            lostHpRatio: 0.015,       // +已损失生命×1.5%
            maxHpRatio: 0.01,         // +对方最大生命×1%
            jealousBaseDmg: 2,        // 有无忌：基础2
            jealousLostHpRatio: 0.015,// +已损失生命×1.5%
            jealousMaxHpRatio: 0.015, // +对方最大生命×1.5%
            executeThreshold: 0.15,   // 无无忌斩杀线15%
            jealousExecuteThreshold: 0.18 // 有无忌斩杀线18%
        },
        rebelStrike: { 
            name: '叛逆突袭', dmgBonus: 0,  // 取消伤害加成
            currentHpRatio: 0.1
        },
        phantomThunder: { name: '混元霹雳劲', lostHpRatio: 0.3 },
        phantomDisguise: { name: '幻影伪装', baseChance: 0.30, per10pctLost: 0.06 },
        xuanmingPalm: { name: '玄冥神掌', dotPercents: [0.04, 0.02, 0.01], duration: 3 },
        hornStrike: { name: '鹿角杖法', defIgnore: 0.3, poisonedBonus: 0.3 },
        // ===== V3.1.0 新增联动技能 =====
        kuLian: {
            name: '苦练',
            icon: '💪',
            desc: '场上无周芷若时每回合最先行动；每次行动前给全体队友+1攻+1防+2生命上限，自身翻倍',
            atkBonus: 1,
            defBonus: 1,
            hpBonus: 2
        },
        xiaoZhao: {
            name: '蝶变乾坤',
            icon: '🦋',
            desc: '每回合随机变换职业，继承队友遗志。无张无忌时，队友受伤触发减伤、治疗和攻击加成。张无忌在场时，升级乾坤大挪移为全队减伤30%并反弹。',
            defToReduce: 200,
            defToHeal: 10,
            defToAtk: 20,
            minReduce: 1,
            minHeal: 1,
            minAtk: 1,
            upgradedReducePct: 0.3,
            horseSpawnLimit: 1
        },
        xinHun: {
            name: '新婚',
            hpDeduct: 1,
            healLevels: [0.16, 0.10, 0.06, 0.03]  // 4层后消失
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
    '少林·圆真': 97, '少林·圆音': 97, '少林·圆业': 97, '少林·慧轮': 97, '少林·慧净': 97, '少林·虚竹': 97, '少林·虚清': 97,
    '武当·凌云': 97, '武当·松溪': 97, '武当·莲舟': 97, '武当·岱岩': 97, '武当·声谷': 97,
    '峨眉·慧静': 97, '峨眉·慧心': 97, '峨眉·慧明': 97, '峨眉·妙清': 97, '峨眉·妙音': 97, '峨眉·素问': 97, '峨眉·灵枢': 97,
    '昆仑·白鹿子': 97, '昆仑·灵宝': 97, '昆仑·玉清': 97, '昆仑·紫阳': 97,
    '崆峒·唐文亮': 97, '崆峒·胡豹': 97, '崆峒·简捷': 97, '崆峒·赵明': 97,
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