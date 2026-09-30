// V6.5.0 | ~18600 bytes | 2026-09-30 参数单位口径统一（收尾）：miss 系 5 个未命中率常量与 WARRIOR_BREAK_CHANCE_PER_DEF 改按「1 = 100%」存（读点 core/03 ×100 还原，对外契约仍是百分点）；getSkillDesc 回落分支删「字段名含 ratio 就换算」的猜测，改显式白名单 PCT_PARAM_KEYS（修反击 dmgRatio 0.6 被显示成「伤害×60」、周芷若强化档 lostHpRatio 0.015 被显示成 0.015%）。承接 V6.4.0 参数单一真值源收口（DESC_TRUTH 映射表 + resolveDescValue，技能说明 {占位符} 一律取 mechanics 真值）。
export const VER = 'core/01config-5v5-test.js V6.5.0';

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

// ─────────────────────────────────────────────────────────────────────────
// 文案占位符 → 引擎真值出处（2026-09-29 单一真值源收口）
//
// 背景：skills.<键>.params 与 characters.<角色>.mechanics 曾各存一份同一个数（技能说明的
//   {占位符} 从前者取、引擎战斗从后者读），改一处另一处不跟 → 面板数字与实战漂移。
//   收口后：mechanics（引擎实际读的那份）是**唯一真值**，技能说明里的这些占位符一律到这里查表，
//   params 里的死副本已从 content/200game-data.json 删除。
//
// 结构：skillKey → { character, fields: { 占位符名: { type, field, scale } } }
//   · type  = mechanics 里承载该数值的对象类型。可能是顶层条目（如 chainClaw / kuLian / xinHun /
//             phantomDisguise 的 type 就写在这一层），也可能是 onHitEffects / beforeDamageEffects /
//             dodgeRules 等**数组内层元素**的 type（如 healMaxHpPct / poison / ignoreDef）。
//   · field = 该对象上承载数值的字段名。
//   · scale = 换算口径：100 = 「1 就是 100%」的比例 → 百分数（0.12→12、0.015→1.5、0.01→1）；
//             1   = 原样输出（倍率/回合数/点数一类）。
//   数组（如 dotPercents）一律按「每项 ×scale 后拼 %，用 → 连接」（4%→2%→1%）。
//
// 维护：新增「一句话里要显示 mechanics 真值」的技能时，在此补一行；登记后由
//   tests/health-rules/156-desc-truth-drift.js 守护（技能说明数字必须等于引擎真值）。
export const DESC_TRUTH = {
    nineYinClaw: { character: '周芷若', fields: {
        baseDmg:          { type: 'chainClaw', field: 'baseDmg',          scale: 1 },
        lostHpRatio:      { type: 'chainClaw', field: 'lostHpRatio',      scale: 100 },
        maxHpRatio:       { type: 'chainClaw', field: 'maxHpRatio',       scale: 100 },
        executeThreshold: { type: 'chainClaw', field: 'executeThreshold', scale: 100 }
    } },
    rebelStrike: { character: '宋青书', fields: {
        currentHpRatio:   { type: 'bonusTargetCurrentHp', field: 'ratio', scale: 100 }
    } },
    kuLian: { character: '宋青书', fields: {
        atkBonus: { type: 'kuLian', field: 'atkBonus', scale: 1 },
        defBonus: { type: 'kuLian', field: 'defBonus', scale: 1 },
        hpBonus:  { type: 'kuLian', field: 'hpBonus',  scale: 1 }
    } },
    xinHun: { character: '宋青书', fields: {
        hpDeduct:   { type: 'xinHun', field: 'hpDeduct',   scale: 1 },
        healLevels: { type: 'xinHun', field: 'healLevels', scale: 100 }
    } },
    phantomThunder: { character: '成昆', fields: {
        lostHpRatio: { type: 'bonusLostHp', field: 'ratio', scale: 100 }
    } },
    phantomDisguise: { character: '成昆', fields: {
        baseChance:   { type: 'phantomDisguise', field: 'baseChance',   scale: 100 },
        per10pctLost: { type: 'phantomDisguise', field: 'per10pctLost', scale: 100 }
    } },
    hornStrike: { character: '鹤笔翁', fields: {
        defIgnore:     { type: 'ignoreDef', field: 'ratio', scale: 100 },
        poisonedBonus: { type: 'damageMultiplierIfPoisoned', field: 'bonus', scale: 100 }
    } },
    xuanmingPalm: { character: '鹿杖客', fields: {
        duration:    { type: 'poison', field: 'duration',    scale: 1 },
        dotPercents: { type: 'poison', field: 'dotPercents', scale: 100 }
    } },
    nineYang: { character: '张无忌', fields: {
        healPct: { type: 'healMaxHpPct', field: 'pct', scale: 100 }
    } },
    bloodSiphon: { character: '韦一笑', fields: {
        leechMin: { type: 'leech', field: 'minRatio', scale: 100 },
        leechMax: { type: 'leech', field: 'maxRatio', scale: 100 }
    } },
    bloodDodge: { character: '韦一笑', fields: {
        maxRatio: { type: 'lostHpPercent', field: 'max', scale: 100 }
    } }
};

/**
 * 在 mechanics 里按对象 type 找字段真值。
 * 先在顶层条目上找（type 与字段同层，如 chainClaw.baseDmg），再下钻各数组元素
 * （onHitEffects / beforeDamageEffects / dodgeRules 等，如 healMaxHpPct.pct）。
 * 找不到返回 undefined。**刻意不递归**进任意嵌套对象，避免误取 chainClaw.jealous 里的强化档同名字段。
 */
function getMechanicField(characterName, type, field) {
    const mechs = gameData?.characters?.[characterName]?.mechanics || [];
    for (const m of mechs) {
        if (!m) continue;
        if (m.type === type && m[field] !== undefined) return m[field];
        for (const k of Object.keys(m)) {
            const arr = m[k];
            if (!Array.isArray(arr)) continue;
            for (const el of arr) {
                if (el && el.type === type && el[field] !== undefined) return el[field];
            }
        }
    }
    return undefined;
}

/** 真值 → 技能说明里的显示文本（scale 见 DESC_TRUTH 注释） */
function formatDescValue(raw, scale) {
    const one = v => (typeof v === 'number' && scale === 100) ? Math.round(v * 1000) / 10 : v;
    if (Array.isArray(raw)) return raw.map(v => one(v) + '%').join('→');
    return String(one(raw));
}

/**
 * 解一个已收口占位符的真值文本；未登记（或真值缺失）返回 undefined，交调用方回落 params。
 */
function resolveDescValue(characterName, skillKey, key) {
    const entry = DESC_TRUTH[skillKey];
    if (!entry) return undefined;
    const spec = entry.fields[key];
    if (!spec) return undefined;
    const raw = getMechanicField(characterName, spec.type, spec.field);
    if (raw === undefined) return undefined;
    return formatDescValue(raw, spec.scale);
}

// 技能说明里的百分数占位符：这些字段的模板自己带 %，params 一律按「1 = 100%」存储，
//   下落分支按 ×100 输出人话（0.1 → 10）。与 DESC_TRUTH 的 scale:100 同一口径。
//   2026-09-30 V6.5.0：登记口径从「字段名里含 ratio 就换算」的猜测，改为**显式白名单**——
//   猜测分支把倍率字段 dmgRatio（0.6）误当成百分数，面板显示成「伤害×60」。现只认本表：
//     · 带 % 的百分数占位符 → 登记在此（未登记的新字段请补进来，否则会显示 0.xx%）
//     · 倍率/点数/回合数一类 → 不登记，原样输出（如 dmgRatio 0.6 → 「伤害×0.6」）
//     · 需要显示 mechanics 真值的 → 走上面的 DESC_TRUTH，与本表无关
const PCT_PARAM_KEYS = new Set(['reducePct', 'reboundPct', 'selfDmgPct', 'leechMin', 'leechMax',
    'procChance', 'healPct', 'prob',
    'atkRatioRight', 'defRatioLeft', 'hpRatio',           // 小昭·蝶变附身三项
    'lostHpRatio', 'maxHpRatio', 'executeThreshold']);    // 周芷若九阴白骨爪（强化档走 paramsJealous 回落，模板自带 %）

function getSkillDesc(characterName, skillKey, jealous) {
    const ch = gameData?.characters?.[characterName];
    const skill = ch?.skills?.[skillKey];
    if (!skill) return '';
    const template = jealous ? (skill.descJealous || skill.desc) : skill.desc;
    const params = jealous ? (skill.paramsJealous || skill.params) : (skill.params || {});
    // 替换 {key} 占位符：key 支持点路径（如 grow.prob），逐段下钻 params。
    //   非强化档一律「真值优先」——命中 DESC_TRUTH 走 mechanics，未命中回落 params
    return template.replace(/\{([\w.]+)\}/g, (_, key) => {
        if (!jealous) {
            const truth = resolveDescValue(characterName, skillKey, key);
            if (truth !== undefined) return truth;
        }
        // 点路径逐段下钻；单段直接取
        let val = params;
        for (const seg of key.split('.')) { val = val == null ? undefined : val[seg]; }
        if (val === undefined || val === null) return `{${key}}`;
        // 单位口径按末段字段名判断（父级点路径不影响）：数组 → 逐项换算拼 %；白名单 → ×100；其余原样
        const lastKey = key.includes('.') ? key.slice(key.lastIndexOf('.') + 1) : key;
        if (Array.isArray(val)) return val.map(v => (typeof v === 'number' && v < 1 ? Math.round(v * 1000) / 10 : v) + '%').join('→');
        if (PCT_PARAM_KEYS.has(lastKey)) return typeof val === 'number' ? String(Math.round(val * 1000) / 10) : val;
        return val;
    });
}

// 导出加载函数供外部使用
export { loadGameData, getGameData, getSkillParams, getSkillParamsJealous, getSkillName, getSkillDesc, getMechanicField, resolveDescValue };

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
    // 未命中率统一「1 = 100%」（2026-09-30 口径统一 V6.5.0）：读点 core/03 getMissBreakdown 内 ×100 转百分点域。
    //   该函数对外契约仍是百分点（日志、详情弹窗、体检 145 均按 % 比对），只在"存储 → 计算"这一步换算。
    //   注：×100 写在同一括号内（如 C.X * 100），与旧值逐位一致（0.06*100 === 6，无 ulp 漂移）。
    RANGED_MISS_CHANCE: 0.03,
    FLY_MISS_CHANCE: 0.06,
    GROUND_MISS_CHANCE: 0.01,
    FLY_MISS_LOWHP_BONUS: 0.06,
    FLY_MISS_EMPTYCOL_REDUCE: 0.12,
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
    // 按目标防御值落档：defMax 为档位上限（null = 兜底档），reduce 破防量，chance 触发率（口径 1 = 100%）
    WARRIOR_BREAK_DEF_TIERS: [
        { defMax: 40,   reduce: 2, chance: null },   // 低防：概率 = 防御 × WARRIOR_BREAK_CHANCE_PER_DEF（比例，读点 ×100 回百分点域）
        { defMax: 50,   reduce: 3, chance: 1 },
        { defMax: null, reduce: 4, chance: 1 }
    ],
    // 每点防御的破防概率（口径 1 = 100%：0.025 = 2.5%）。读点 core/03 写成 × (该值 * 100)，与旧值 2.5 逐位一致
    WARRIOR_BREAK_CHANCE_PER_DEF: 0.025,
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
