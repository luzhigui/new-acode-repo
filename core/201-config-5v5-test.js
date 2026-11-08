// V6.9.5 | 2026-11-08 体检转交：删除 MING_SQUADS getter（对应 content.encounters.mingSquads 废配置，无读取方）。
// V6.9.6 | 2026-11-08 体检转交：PCT_PARAM_KEYS 补布袋参数（说不得 bagTrap.params 占位符按 % 输出）。
// V6.9.7 | 2026-11-08 体检转交：导出 getContentVersion()，供生涯记录/跑批判混版本（单一真源 = 001.version）。
export const VER = 'core/201-config-5v5-test.js V6.9.7';
// V6.9.4 | 2026-11-07 性能回归修复：getHeroPools() 结果缓存 + BUFFS 缓存（每场 300~450 次重复推导 → 单场 93 ms 降到 ~11 ms）；
//        | 运行期改写 characters/buffs 时必须调用 invalidateConfigCache()，否则读到旧派生结果。
// V6.9.3 | 2026-11-07 named 收成「每条必填」契约：characters 82 条全部显式写（30 具名 true / 52 杂兵 false），
//        | 缺字段不再靠默认值兜着，改由 tests/smoke-headless.mjs 的数据卫生断言报错。
//        | roster 旧表已于 7f04f450 删除，角色池唯一派生口 = getHeroPools()。
// V6.9.2 | 2026-11-07 修 {prob} 残留：DESC_TRUTH 补登 absorb→statAbsorb.prob（scale 100）。
//        | 俞莲舟 absorb 技能无 params，概率只存 mechanics，getSkillDesc 回落 params 取不到 ⇒ 说明原样
//        | 印出 {prob}（规则回放 150/150 全红）；PCT_PARAM_KEYS 早已含 prob，缺的是真值入口，不是注册。
// V6.9.1 | 2026-11-07 修复杂兵刷蓝回归：isNamedCharacter 不再靠「键在不在 characters 里」反推，
//        | 改读 characters[name].named 显式标记（27 条具名=true / 5 条原无名 104 杂兵=false）。
// V6.9.0 | 2026-11-07 优化二·B 方案落地：角色池（mingM/enemyM/mingAll/eliteConfigs/enemyTitles/recruitPool）
//        | 全部改由 characters 运行时推导，roster 旧表仅作对账快照（tools/829-verify-pools.mjs），不再被读取。

import { ROLE_TYPES, MECHANIC_TYPES, MECHANIC_EFFECT_TYPES } from '../infra/106-battle-enums.js';

// 游戏数据加载
// 游戏数据唯一来源：content/001-game-data.json。加载失败直接抛错，不静默回退。
let gameData = null;

async function loadGameData() {
    if (gameData) return gameData;
    const resp = await fetch(new URL('../content/001-game-data.json', import.meta.url));
    if (!resp.ok) throw new Error(`游戏数据加载失败：HTTP ${resp.status}`);
    gameData = await resp.json();
    invalidateConfigCache();  // 数据整体替换后，派生缓存必须作废（防「改了配置读到旧结果」）
    return gameData;
}

// 同步获取（如果还没加载完就返回 null，调用方需要处理）
function getGameData() {
    return gameData;
}

// content 版本（content/001-game-data.json 的 version 字段）：生涯记录/跑批据此判「混版本榜」，
//   不再靠记录时间猜。未加载返回 null（浏览器实战路径此时必已加载）。
function getContentVersion() {
    return gameData?.version || null;
}

// 海克斯强化数据（姊妹/妹永久），单独文件 content/002-hex-enhance.json。
//   缺 sister / brother 段直接抛错；段内缺子键由各消费方「缺哪键报哪键」显式抛错，不回落到 CONFIG.BUFFS 普通版。
let hexEnhanceData = null;

async function loadHexEnhanceData() {
    if (hexEnhanceData) return hexEnhanceData;
    const resp = await fetch(new URL('../content/002-hex-enhance.json', import.meta.url));
    if (!resp.ok) throw new Error(`海克斯强化数据加载失败：HTTP ${resp.status}`);
    hexEnhanceData = await resp.json();
    return hexEnhanceData;
}

function getHexEnhanceData() { return hexEnhanceData; }
// 姊强化：团队 buff 生效中。返回 null 表示该海克斯没强化配置
function getSisterHexEnhance(key) { return (hexEnhanceData && hexEnhanceData.sister && hexEnhanceData.sister[key]) || null; }
// 妹永久：团队 buff 过期后生效。返回 null 表示没配置（消费方须显式抛错，不回落普通版）
function getBrotherHexEnhance(key) { return (hexEnhanceData && hexEnhanceData.brother && hexEnhanceData.brother[key]) || null; }

// 从 gameData 读取角色技能参数，取不到返回 null（调用方按需 throw）
function getSkillParams(characterName, skillKey) {
    // 小昭.hexEnhance（姊强化）已整段迁出 200 → content/002-hex-enhance.json 的 sister 段。
    //   不设回落：201 缺失 = 启动加载失败，整个游戏本就起不来；运行期这里缺失说明有人绕过启动流程，必须炸。
    if (characterName === '小昭' && skillKey === 'hexEnhance') {
        if (!hexEnhanceData || !hexEnhanceData.sister) {
            throw new Error('[getSkillParams] 002-hex-enhance.json 缺 sister 段（小昭.hexEnhance 已迁出 200，不允许回落）');
        }
        return hexEnhanceData.sister;
    }
    const ch = gameData?.characters?.[characterName];
    const skill = ch?.skills?.[skillKey];
    return skill?.params || null;
}

function getSkillParamsJealous(characterName, skillKey) {
    const ch = gameData?.characters?.[characterName];
    const skill = ch?.skills?.[skillKey];
    return skill?.paramsJealous || null;
}

// 是否「具名角色」：唯一真源 = characters[name].named（每条必填的显式布尔，不从「键在不在 characters 里」反推）。
//   用途：名字颜色分档里「蓝=弱精英（104 档具名）」的唯一判据——只按 m 值判会把所有 104 无名兵一起涂蓝。
//   契约：characters 每条都必须写 "named"（具名 true / 杂兵 false）；缺失即数据缺陷，由
//   tests/smoke-headless.mjs「数据 + 契约」段的数据卫生断言报错——不靠默认值兜底，也不按「键在不在表里」猜。
//   新增角色照字段表填即可，本文件不用改。
function isNamedCharacter(name) {
    return gameData?.characters?.[name]?.named === true;
}

// 是否带有技能/机制（用来判定 M100 普通兵里的「特殊角色」）
function hasSkills(name) {
    const ch = gameData?.characters?.[name];
    return !!(ch && (Array.isArray(ch.mechanics) || ch.skills));
}

function getSkillName(characterName, skillKey) {
    const ch = gameData?.characters?.[characterName];
    const skill = ch?.skills?.[skillKey];
    return skill?.name || skillKey;
}

// ─────────────────────────────────────────────────────────────────────────
// 文案占位符 → 引擎真值出处
//
// 背景：skills.<键>.params 与 characters.<角色>.mechanics 曾各存一份同一个数（技能说明的
//   {占位符} 从前者取、引擎战斗从后者读），改一处另一处不跟 → 面板数字与实战漂移。
//   收口后：mechanics（引擎实际读的那份）是**唯一真值**，技能说明里的这些占位符一律到这里查表，
//   params 里的死副本已从 content/001-game-data.json 删除。
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
        baseDmg:          { type: MECHANIC_TYPES.CHAIN_CLAW, field: 'baseDmg',          scale: 1 },
        lostHpRatio:      { type: MECHANIC_TYPES.CHAIN_CLAW, field: 'lostHpRatio',      scale: 100 },
        maxHpRatio:       { type: MECHANIC_TYPES.CHAIN_CLAW, field: 'maxHpRatio',       scale: 100 },
        executeThreshold: { type: MECHANIC_TYPES.CHAIN_CLAW, field: 'executeThreshold', scale: 100 }
    } },
    rebelStrike: { character: '宋青书', fields: {
        currentHpRatio:   { type: MECHANIC_EFFECT_TYPES.BEFORE_DAMAGE.BONUS_TARGET_CURRENT_HP, field: 'ratio', scale: 100 }
    } },
    kuLian: { character: '宋青书', fields: {
        atkBonus: { type: MECHANIC_TYPES.KU_LIAN, field: 'atkBonus', scale: 1 },
        defBonus: { type: MECHANIC_TYPES.KU_LIAN, field: 'defBonus', scale: 1 },
        hpBonus:  { type: MECHANIC_TYPES.KU_LIAN, field: 'hpBonus',  scale: 1 }
    } },
    xinHun: { character: '宋青书', fields: {
        hpDeduct:   { type: MECHANIC_TYPES.XIN_HUN, field: 'hpDeduct',   scale: 1 },
        healLevels: { type: MECHANIC_TYPES.XIN_HUN, field: 'healLevels', scale: 100 }
    } },
    phantomThunder: { character: '成昆', fields: {
        lostHpRatio: { type: MECHANIC_EFFECT_TYPES.BEFORE_DAMAGE.BONUS_LOST_HP, field: 'ratio', scale: 100 }
    } },
    phantomDisguise: { character: '成昆', fields: {
        baseChance:   { type: MECHANIC_TYPES.PHANTOM_DISGUISE, field: 'baseChance',   scale: 100 },
        per10pctLost: { type: MECHANIC_TYPES.PHANTOM_DISGUISE, field: 'per10pctLost', scale: 100 }
    } },
    hornStrike: { character: '鹤笔翁', fields: {
        defIgnore:     { type: MECHANIC_EFFECT_TYPES.BEFORE_DAMAGE.IGNORE_DEF, field: 'ratio', scale: 100 },
        poisonedBonus: { type: MECHANIC_EFFECT_TYPES.BEFORE_DAMAGE.DAMAGE_MULTIPLIER_IF_POISONED, field: 'bonus', scale: 100 }
    } },
    xuanmingPalm: { character: '鹿杖客', fields: {
        duration:    { type: MECHANIC_EFFECT_TYPES.ON_HIT.POISON, field: 'duration',    scale: 1 },
        dotPercents: { type: MECHANIC_EFFECT_TYPES.ON_HIT.POISON, field: 'dotPercents', scale: 100 }
    } },
    nineYang: { character: '张无忌', fields: {
        healPct: { type: MECHANIC_EFFECT_TYPES.ON_HIT.HEAL_MAX_HP_PCT, field: 'pct', scale: 100 }
    } },
    bloodSiphon: { character: '韦一笑', fields: {
        leechMin: { type: MECHANIC_EFFECT_TYPES.ON_HIT.LEECH, field: 'minRatio', scale: 100 },
        leechMax: { type: MECHANIC_EFFECT_TYPES.ON_HIT.LEECH, field: 'maxRatio', scale: 100 }
    } },
    bloodDodge: { character: '韦一笑', fields: {
        maxRatio: { type: MECHANIC_EFFECT_TYPES.DODGE_RULES.LOST_HP_PERCENT, field: 'max', scale: 100 }
    } },
    // 武当俞莲舟·吸星大法：absorb 技能无 params，概率只存在于 mechanics(statAbsorb).prob，
    //   故必须走 DESC_TRUTH 取真值；否则 desc 原样渲染出 {prob}（156 卫生扫描会红）。
    absorb: { character: '俞莲舟', fields: {
        prob: { type: MECHANIC_TYPES.STAT_ABSORB, field: 'prob', scale: 100 }
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
//   V6.5.0：登记口径从「字段名里含 ratio 就换算」的猜测，改为**显式白名单**——
//   猜测分支把倍率字段 dmgRatio（0.6）误当成百分数，面板显示成「伤害×60」。现只认本表：
//     · 带 % 的百分数占位符 → 登记在此（未登记的新字段请补进来，否则会显示 0.xx%）
//     · 倍率/点数/回合数一类 → 不登记，原样输出（如 dmgRatio 0.6 → 「伤害×0.6」）
//     · 需要显示 mechanics 真值的 → 走上面的 DESC_TRUTH，与本表无关
const PCT_PARAM_KEYS = new Set(['reducePct', 'reboundPct', 'selfDmgPct', 'leechMin', 'leechMax',
    'procChance', 'healPct', 'prob',
    'atkRatioRight', 'defRatioLeft', 'hpRatio',           // 小昭·蝶变附身三项
    'landHealRatio', 'landHealRatioDeath', 'eggHatchHpRatio',   // 小昭·飞天落地回血档位比（70/40 1% / 致死 5%）+ 孵化保留血量比 30%
    'lostHpRatio', 'maxHpRatio', 'executeThreshold',
    'openChance', 'hitChance', 'disguiseChance', 'openingChance',   // 周芷若九阴白骨爪（强化档走 paramsJealous 回落，模板自带 %）；本轮圆真/彭莹玉的触发概率
    'triggerChance', 'protectBranchChance', 'redHpThreshold', 'captureMaxHpPct']);   // 说不得·布袋（content/001 skills.bagTrap.params）

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
export { loadGameData, getGameData, getContentVersion, loadHexEnhanceData, getHexEnhanceData, getSisterHexEnhance, getBrotherHexEnhance, getSkillParams, getSkillParamsJealous, getSkillName, getSkillDesc, getMechanicField, resolveDescValue, isNamedCharacter, hasSkills, invalidateConfigCache };

// 配置
// 数据型配置全部直读 gameData（单一数据源，缺失即抛错）；此处仅保留纯规则常量。

// ── 角色池推导：characters 是唯一真源（B 方案，2026-11-07）──
//   规则/字段口径见 tools/829-verify-pools.mjs 与 05 迁移清单；roster 旧表不再被运行期读取。
const HERO_ROLE_TAGS = [ROLE_TYPES.WARRIOR, ROLE_TYPES.DEFENDER, ROLE_TYPES.RANGED, ROLE_TYPES.FLYER,
    ROLE_TYPES.JAVELIN, ROLE_TYPES.BUTTERFLY];

// 派生结果缓存：每场战斗要读几百次池表（330 建队 + 204 每回合读 BUFFS），
//   不缓存就是每次重扫一遍 characters 82 条（实测 0.15 ms/次 → 单场 90 ms）。
//   content 运行期不可变；若外部（故障注入 / 参数实验）原地改写 characters 或 buffs，
//   必须调用 invalidateConfigCache()，否则会读到旧结果。
let heroPoolsCache = null;
let buffsCache = null;

function invalidateConfigCache() {
    heroPoolsCache = null;
    buffsCache = null;
}

function getHeroPools() {
    if (heroPoolsCache) return heroPoolsCache;
    const data = getGameData();
    if (!data) throw new Error('gameData 未加载：角色池为 characters 推导，不能为空');
    const H = data.characters;
    const names = Object.keys(H);
    const order = (key) => (a, b) => ((H[a][key] ?? 1e9) - (H[b][key] ?? 1e9));
    const pick = (fn) => names.filter(fn);
    const roleOf = (n) => (H[n].tags || []).find(t => HERO_ROLE_TAGS.includes(t)) || null;
    const mapOf = (list) => Object.fromEntries(list.map(n => [n, H[n].m]));
    // 池档与数值档分离：入池资格只看 poolTier（= 拆字段时冻结的原 m 值），面板数值仍走 m。
    //   everyday 角色缺 poolTier 直接抛错——不做「缺了就用 m」的静默回落，否则等于没拆。
    const poolTierOf = (n) => {
        const t = H[n].poolTier;
        if (typeof t !== 'number') throw new Error(`characters.${n} 缺 poolTier（everyday 入池角色必填，与数值档 m 解耦）`);
        return t;
    };
    const poolTierMap = (list) => Object.fromEntries(list.map(n => [n, poolTierOf(n)]));
    const mingEveryday = pick(n => H[n].camp === '明教' && H[n].everyday).sort(order('mingOrder'));
    const enemyEveryday = pick(n => H[n].camp === '六大派' && H[n].everyday).sort(order('enemyOrder'));
    const titles = {};
    for (const sect of data.roster.enemySects) {
        // 门派名册 = enemyTitles 原成员（含何太冲这类「在名册里的弱精英」）；靠 titleOrder 标记，不按 tier 猜
        titles[sect] = enemyEveryday.filter(n => H[n].sect === sect && H[n].titleOrder != null).sort(order('titleOrder'));
    }
    titles.default = data.roster.enemySects.map(s => `${s}弟子`);
    const recruit = (camp) => pick(n => H[n].camp === camp && H[n].summon)
        .sort(order('recruitOrder')).map(n => ({ name: n, role: roleOf(n) }));
    heroPoolsCache = {
        mingAll: pick(n => H[n].mingAll).sort(order('mingOrder')),
        mingM: mapOf(mingEveryday),
        enemyM: mapOf(enemyEveryday),
        mingPoolTier: poolTierMap(mingEveryday),
        enemyPoolTier: poolTierMap(enemyEveryday),
        eliteConfigs: pick(n => H[n].camp === '明教' && (H[n].tier === 'boss' || H[n].tier === 'strong'))
            .sort(order('eliteOrder'))
            .map(n => ({ name: n, m: H[n].m, role: roleOf(n), flag: H[n].flag ?? H[n].forms?.brother?.flag ?? null, tier: H[n].tier })),
        enemyTitles: titles,
        recruitPool: { ally: recruit('明教'), enemy: recruit('六大派') }
    };
    return heroPoolsCache;
}

const CONFIG = {
    get MING_ALL() {
        return getHeroPools().mingAll;
    },
    get MING_M() {
        return getHeroPools().mingM;
    },
    // 池档（入池资格）与 MING_M（数值档）分离；不要拿 MING_M 的值当筛池条件
    get MING_POOL_TIER() {
        return getHeroPools().mingPoolTier;
    },
    get ENEMY_SECTS() {
        return getGameData().roster.enemySects;
    },
    get ENEMY_TITLES() {
        return getHeroPools().enemyTitles;
    },
    ROLES: [ROLE_TYPES.WARRIOR, ROLE_TYPES.DEFENDER, ROLE_TYPES.RANGED, ROLE_TYPES.FLYER],
    ATK_VAR: 6, DEF_VAR: 4, HP_BONUS_MIN: 0, HP_BONUS_MAX: 5,
    // 未命中率统一「1 = 100%」：读点 core/03 getMissBreakdown 内 ×100 转百分点域。
    //   该函数对外契约仍是百分点（日志、详情弹窗、体检 145 均按 % 比对），只在"存储 → 计算"这一步换算。
    //   注：×100 写在同一括号内（如 C.X * 100），与旧值逐位一致（0.06*100 === 6，无 ulp 漂移）。
    // 2026-11-05 老板拍板：地面 / 远程（含蝴蝶）未命中率与飞行对齐，统一提升到 6%。
    RANGED_MISS_CHANCE: 0.06,
    FLY_MISS_CHANCE: 0.06,
    GROUND_MISS_CHANCE: 0.06,
    FLY_MISS_LOWHP_BONUS: 0.12,
    // 空列未命中减免：2026-11-02 起全局所有职业生效（原飞行专属），0.12 → 0.06。
    //   键名保留 FLY_ 前缀：改名会断 core/03 引用与体检 145 断言，语义看本注释
    FLY_MISS_EMPTYCOL_REDUCE: 0.06,
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
    // 精英出场人数骰（29battle-init 用，重定）：<0 出 3 人（已禁用）/ <0.05 出 2 人（5%）/
    //   <0.95 出 1 人（90%）/ 其余 0 人（5%）——即「九成必有 1 个，5% 两个，5% 一个都没有，不出三个」
    ELITE_COUNT_THRESHOLDS: [0, 0.05, 0.95],
    // 小昭形态骰（29battle-init 用）：默认 50% 为「小昭·姊」；图鉴选 xz 偏向姊、选 xm 偏向妹
    XIAO_ZHAO_SISTER_PROB: { default: 0.5, xz: 0.85, xm: 0.15 },
    // 弱精英混入率（29battle-init 用）：
    //   ① 明教侧——固定精英轮盘只留张无忌/韦一笑/小昭/谢逊，其余具名身份（杨逍/殷天正/寒离飒）按本率
    //      随机替换一个普通位混入正常阵容；② 六大派侧——何太冲/唐文亮同按本率锁定一处 M104 数字空位。
    //   两侧均「每局至多一名」，共用一个率值（老板拍板同值）
    WEAK_ELITE_MIX_RATE: 0.30,
    BASE_DODGE_FLY: 0.15,
    BASE_DODGE_GROUND: 0.05,
    DODGE_REBOUND_RATIO: 0.5,
    WARRIOR_BREAK_DEF: 2,
    // 战士破防分档表
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
    TOKEN_DROP_RATES: [0, 1.5, 2, 2.5, 4, 5.5, 6, 7], // 索引=关卡号，1.5→7 递增。统一口径：对齐 player/48 通关奖励的 10-02 定案表（此前两张表各修一半方向相反：core 头补0[0,0,1.5,...,6] vs 48 尾补7；统一后 s1 局内击杀也掉令1.5%，s7=7%）
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
        [ROLE_TYPES.WARRIOR]: 'assets/sfx_melee.mp3'
    },
    get BUFFS() {
        if (buffsCache) return buffsCache;
        const b = getGameData().buffs;
        if (!b || !b.unity) return b;
        // 众志召唤池由 characters.summon 推导；其余 buff 配置原样透传
        buffsCache = { ...b, unity: { ...b.unity, recruitPool: getHeroPools().recruitPool } };
        return buffsCache;
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
    get MING_TARGET_POWER() {
        return getGameData().encounters.mingTargetPower;
    },
    get ELITE_POWER() {
        return getGameData().roster.elitePower;
    },
    get ELITE_RATE() {
        return getGameData().roster.eliteRate;
    },
    // 明教精英出场配置（name/m/role/flag/tier）——由 characters 推导（tier=boss/strong）
    get ELITE_CONFIGS() {
        return getHeroPools().eliteConfigs;
    },
    // 六大派精英身份 → 站位优先数组（{ flag: [优先级数组] }）——数据源 content.roster.enemyElitePos
    // 加新精英：若需要固定站位就在 content 加一行
    get ENEMY_ELITE_POS_FLAGS_MAP() {
        return getGameData().roster.enemyElitePos || {};
    },
    get NORMAL_POWER() {
        return getGameData().roster.normalPower;
    },
    get ENEMY_M() {
        return getHeroPools().enemyM;
    },
    // 池档（入池资格）与 ENEMY_M（数值档）分离；槽位筛池一律读本表，不再比对 ENEMY_M 的 m 值
    get ENEMY_POOL_TIER() {
        return getHeroPools().enemyPoolTier;
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
    // 六大派精英站位优先表已数据化到 content.roster.enemyElitePos（getter = ENEMY_ELITE_POS_FLAGS_MAP）
    // 未命中身份时的兜底表
    ENEMY_ELITE_POS_FALLBACK: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    // 阵容 power 兜底（modules/29 用）
    MING_TARGET_POWER_FALLBACK: 500,  // 关卡目标 power 兜底（第 1 关未在 encounters.mingTargetPower 列出）
    POWER_FALLBACK: 90,               // 单卡 power 兜底（= roster.normalPower 最低档）
    XUANMING_EXTRA_M: 104,            // 第 5 关玄冥二老齐出时额外补的普通兵 M 值

    // ── 参数体系收敛批 3：战斗通用规则常量 ──
    LOW_HP_THRESHOLD: 0.4,                 // 低血判据阈值（03 攻击未命中残血光环）
    EXEC_THRESHOLD: 0.15,                  // 战士斩杀阈值（03）
    EXEC_THRESHOLD_BLOODTHIRST: 0.20,      // 嗜血状态下战士斩杀阈值（03）
    HORSE_M: 15,                           // 拒马单位预算 M（05 spawnHorse）
    HOT_BLOOD_CRIT_INTERVAL: 3,            // 热血奋战双倍吸血间隔（04）
    DEF_WAVE_THRESHOLD: 7,                 // 攻击波动「防御波动」台词阈值（12，defVar + hpBonus 达标）

    SPIDER_MIND_CONTROL_CHANCE: 0.20,      // 永久惑心误伤概率（27）
    ZHANG_NEAR_ATK_LIMIT: 3,               // 张无忌近战次数上限（融会贯通，27 / 03）
    ZHANG_RONGHUI_RATIO: 0.5,              // 融会贯通额外伤害系数（27）
    XUANMING_POISON_HEAL_REDUCE: 0.5,      // 寒毒抑疗：带寒毒目标受到的治疗再乘该系数（core/13，2026-10-22）
    MASTERY_FULL_BONUS_LAYERS: 2,          // 小昭全精通后额外加的层数（20）

    get ELITE_POOL() {
        return getGameData().encounters.elitePool;
    }
    // 精英技能参数在 gameData.characters.*.mechanics，读取统一走 getSkillParams（缺失即配置错误，调用方 throw）
};



const STATE = { IDLE: 'IDLE', RUNNING: 'RUNNING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER' };

export { CONFIG, STATE };
