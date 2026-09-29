// tools/120-param-lab-glossary.js - 参数中文说明表（只读展示用，不参与战斗）
// V2.0.2 | 预估 19600 bytes | 2026-09-29 新增 ENGINE_READ 引擎真读字段表 + skillFieldVerdict()：
//   静态扫描全仓 getSkillParams( 调用点，逐个追踪返回对象的字段使用并固化下来，实验台据此把
//   「需确认」暧昧标签换成确定结论（引擎真读 / 整包动态读 / 仅校验存在 / 仅文案）。
// V2.0.1 | 2026-09-29 韦一笑吸血技能改名：寒冰掌 → 蝠影汲血（技能键 coldPalm → bloodSiphon，同步 TYPE_GLOSSARY 与 PCT100 白名单键）
// V2.0.0 | 2026-09-29 参数实验台批 4：① 补全 skills 表字段中文（原只登记约 20 个，
//   现覆盖 characters.*.skills.*.params 全部字段 + mechanics 全部字段）；② 明确「两套单位口径」——
//   mechanics 是「1 = 100%」（0.12 即 12%），skills.params 里部分字段直接写百分数（10 即 10%），
//   由 PCT100 白名单逐「技能.字段」登记，不再按字段名一刀切；③ 新增 CONFIG / 数据表两层的中文说明
//   （CONFIG_KEY_GLOSSARY / DATA_KEY_GLOSSARY），配合 120-param-lab-core.js 的四层旋钮扫描。
//   V1.0.0 | 2026-09-28 新建：把英文参数路径翻译成中文技能名 + 参数名 + 单位，并附技能原文（getSkillDesc）。
// 判定口径：沿路径逐段下钻，取「最靠内层那个带 type 的对象」的 type —— 因为具体效果类型都写在
//   onHitEffects / beforeDamageEffects / attributeMods 的元素上（如 poison / ignoreDef / bonusLostHp），
//   mechanics[i] 顶层的 type 只是机制大类（如 dotTick / linkAttack）。内层没有才退回顶层。
// 维护：新增 mechanics type、新字段或新 CONFIG 键时在这里补一条，没登记的类型/字段会退化成显示原文，不报错。

import { getSkillDesc } from '../core/01config-5v5-test.js';

// mechanics 里出现的 type → 中文技能名（+ 可选：对应 skills.<key>，用来取原文说明）
export const TYPE_GLOSSARY = {
    chainClaw:                  { skill: 'nineYinClaw',  name: '九阴白骨爪（连锁）' },
    bonusTargetCurrentHp:       { skill: 'rebelStrike',  name: '叛逆突袭' },
    kuLian:                     { skill: 'kuLian',       name: '苦练' },
    xinHun:                     { skill: 'xinHun',       name: '新婚' },
    xingFen:                    { name: '兴奋' },
    followAttack:               { name: '随动攻击' },
    bonusLostHp:                { skill: 'phantomThunder', name: '混元霹雳劲' },
    fortifyIncrementMul:        { name: '坚壁增幅倍率' },
    phantomDisguise:            { skill: 'phantomDisguise', name: '幻影伪装' },
    poison:                     { skill: 'xuanmingPalm', name: '玄冥神掌 · 中毒' },
    dotTick:                    { name: '中毒每回合掉血' },
    linkAttack:                 { name: '联动攻击' },
    ignoreDef:                  { skill: 'hornStrike',   name: '鹿角杖法 · 无视防御' },
    damageMultiplierIfPoisoned: { skill: 'hornStrike',   name: '鹿角杖法 · 对中毒目标增伤' },
    healMaxHpPct:               { skill: 'nineYang',     name: '九阳神功 · 命中回血' },
    leech:                      { skill: 'bloodSiphon', name: '蝠影汲血 · 吸血' },
    lostHpPercent:              { skill: 'bloodDodge',   name: '残血幻影 · 额外闪避' },
    damageReflect:              { name: '反伤' },
};

// 数值的单位口径：
//   pct    = 「1 就是 100%」的比例（mechanics 一律用这个）；
//   pct100 = 「10 就是 10%」的百分数直读（skills.params 的部分字段，见 PCT100 白名单）；
//   mul = 倍率；round = 回合；point = 点数；raw = 原值
const UNIT = { pct: 'pct', pct100: 'pct100', mul: 'mul', round: 'round', point: 'point', raw: 'raw' };
export { UNIT };

// 百分数直读字段白名单，键 = 「上下文.字段」：
//   角色技能表用技能 key（如 nineYang.reducePct）；全局常量用 CONFIG 键（如 WARRIOR_BREAK_DEF_TIERS.chance）。
// 不在表里的 pct 类字段一律按 mechanics 口径（1 = 100%）显示 —— 这是绝大多数情况。
const PCT100 = new Set([
    'nineYang.healPct', 'nineYang.healRatio',
    'bloodSiphon.leechMin', 'bloodSiphon.leechMax',
    'bloodDodge.minRatio', 'bloodDodge.maxRatio',
    'qianKun.reducePct', 'qianKun.reboundPct', 'qianKun.selfDmgPct',
    'qianKunUpgraded.reducePct', 'qianKunUpgraded.reboundPct', 'qianKunUpgraded.selfDmgPct',
    'qianKunDerived.defToAtk', 'qianKunDerived.defToHeal', 'qianKunDerived.defToReduce',
    'spiderFly.xiaoZhaoDoubleStrikeChance', 'rebelStrike.dmgBonus',
    'WARRIOR_BREAK_DEF_TIERS.chance'
]);

// ---------------------------------------------------------------------------
// 引擎真读字段表（2026-09-29 建）：skills.<键>.params.<字段> 里哪些字段被引擎真读。
//
// 为什么要这张表：skills.params 是双用途的——同一个对象既供 desc 占位符插值（{xxx}），
//   也可能被引擎 getSkillParams() 取出来算数；而 tools/120 是浏览器页面，只加载
//   content/200game-data.json，看不到引擎 JS 源码，所以它自己永远无法判断某字段读没读。
//   唯一可靠出处是「代码里怎么用」——本表由静态扫描全仓 getSkillParams( 的调用点、
//   逐个追踪返回对象的字段使用得出，就是把源码里的事实固化下来给工具用。
//
// 值 = 被读的字段路径（点号表示子字段；登记父对象即其子字段一并算被读，
//   因为引擎是整包取子对象后按动态键索引，如 extraDmgMap / grow / cub）。
// 读取点（改本表时同步复核）：
//   core/11:89-91、core/13:187-189、core/14:24 / 121-123
//   modules/20:20 / 39-41 / 67-69 / 132-134 / 176 / 223-225
//   modules/26:151-158 / 167 / 239-251 / 280 / 287-308 / 353 / 400-451 / 492
//   modules/27:136-147 / 215 / 443 / 571 / 673-709 / 721
//   render/34:135、render/39:93
// 不在此表 = 仅供 desc 插值（改了不改变战斗结果）。
const ENGINE_READ = {
    rebelStrike:     ['currentHpRatio'],
    xinHun:          ['healLevels'],
    rageOnHit:       ['atkPerHit'],
    righteousFace:   ['defGain'],
    youngBlood:      ['dmgMultiplier'],
    counterAttack:   ['prob', 'dmgRatio'],
    thirdStrike:     ['interval', 'dmgMultiplier', 'leechRatio'],
    summonZhou:      ['m'],
    summonLion:      ['prob', 'cub', 'grow'],
    lionInspire:     ['atkPerHit'],
    xuanmingPalm:    ['duration'],
    endlessBreath:   ['healPct', 'healAtkDiv', 'healDefDiv', 'overflowAtkDiv', 'overflowDefDiv', 'minBonus'],
    baguaArray:      ['atkFloor', 'procChance', 'atkCost', 'defGain'],
    tenRoundFortify: ['round'],
    qianKun:         ['reducePct', 'reboundPct', 'selfDmgPct'],
    qianKunUpgraded: ['reducePct', 'reboundPct', 'selfDmgPct'],
    qianKunDerived:  ['defToReduce'],
    nearSwitch:      ['atkMul', 'defMul', 'maxHpMul'],
    bloodSiphon:     ['leechMin', 'leechMax'],
    spiderFly:       ['maxTriggers', 'xiaoZhaoDoubleStrikeChance'],
    spiderStrike:    ['extraDmgMap'],
    mastery:         ['atkPer', 'defPer', 'hpPer'],
};

// 整包动态读取：引擎按动态键取子对象，无法逐字段列举（hexEnhance 经 getXiaoZhaoHexEnhance(hexKey) 取用）。
// 已确认被读的子字段：holyFlame.atkCols / holyFlame.defRows / cloudBody.dodgeBonus /
//   mindControl.enemySwapProb / mindControl.allySwapProb / hotBlood.leechPct。
const ENGINE_READ_DYNAMIC = new Set(['hexEnhance']);

// 只有启动期存在性校验、没有任何字段被读。
const ENGINE_READ_NONE = new Set(['lionFollow']);

/**
 * 某个 skills.params 字段到底会不会被引擎读。
 * @returns {'engine'|'dynamic'|'none'|'text'} engine=被读；dynamic=整包动态读；
 *   none=只做存在性校验；text=只供 desc 插值
 */
export function skillFieldVerdict(skillKey, fieldPath) {
    if (ENGINE_READ_NONE.has(skillKey)) return 'none';
    if (ENGINE_READ_DYNAMIC.has(skillKey)) return 'dynamic';
    const fields = ENGINE_READ[skillKey];
    if (fields) {
        for (const f of fields) {
            if (fieldPath === f || fieldPath.startsWith(f + '.')) return 'engine';
        }
    }
    return 'text';
}

// 参数字段名 → 中文含义 + 单位。按「最后一段路径」匹配（数组下标忽略）
export const FIELD_GLOSSARY = {
    // —— 通用/伤害类 ——
    baseDmg:            { name: '基础追击伤害倍率', unit: UNIT.mul },
    mult:               { name: '倍率（相对基础值的倍数）', unit: UNIT.mul },
    reboundDmg:         { name: '反弹伤害基数', unit: UNIT.point },
    dmgMultiplier:      { name: '伤害倍率（打出伤害 × 该值）', unit: UNIT.mul },
    dmgRatio:           { name: '反击伤害比例（按受到的伤害）', unit: UNIT.pct },
    dmgBonus:           { name: '额外伤害加成（%）', unit: UNIT.pct100 },
    lostHpRatio:        { name: '按目标已损失生命的加成比例', unit: UNIT.pct },
    maxHpRatio:         { name: '按目标最大生命的加成比例', unit: UNIT.pct },
    currentHpRatio:     { name: '按目标当前生命的伤害比例', unit: UNIT.pct },
    executeThreshold:   { name: '斩杀阈值（目标血量低于此比例即斩杀）', unit: UNIT.pct },
    defIgnore:          { name: '无视目标防御的比例', unit: UNIT.pct },
    poisonedBonus:      { name: '对中毒目标的额外增伤比例', unit: UNIT.pct },
    bonus:              { name: '额外增伤比例', unit: UNIT.pct },
    pct:                { name: '比例', unit: UNIT.pct },
    ratio:              { name: '比例（具体含义随所在技能）', unit: UNIT.pct },
    extraDmgMap:        { name: '按精通层数取用的额外伤害表', unit: UNIT.point },

    // —— 概率类 ——
    procChance:         { name: '触发概率', unit: UNIT.pct },
    firstProcChance:    { name: '首次触发概率（第 1 次必触发时为 1）', unit: UNIT.pct },
    chainProcChance:    { name: '连锁触发概率（触发后再连一次的概率）', unit: UNIT.pct },
    baseChance:         { name: '基础触发概率', unit: UNIT.pct },
    per10pctLost:       { name: '每损失 10% 生命额外增加的概率', unit: UNIT.pct },
    chance:             { name: '触发概率', unit: UNIT.pct },
    prob:               { name: '触发概率', unit: UNIT.pct },

    // —— 属性增减类 ——
    atkBonus:           { name: '攻击力加成值', unit: UNIT.point },
    defBonus:           { name: '防御力加成值', unit: UNIT.point },
    hpBonus:            { name: '生命上限加成值', unit: UNIT.point },
    defGain:            { name: '触发时永久增加的防御', unit: UNIT.point },
    atkPer:             { name: '每层精通增加的攻击', unit: UNIT.point },
    defPer:             { name: '每层精通增加的防御', unit: UNIT.point },
    hpPer:              { name: '每层精通增加的生命', unit: UNIT.point },
    atkPerHit:          { name: '每次命中永久增加的攻击', unit: UNIT.point },
    atkMul:             { name: '近战切换时「职业加成攻击」的倍数', unit: UNIT.mul },
    defMul:             { name: '近战切换时「职业加成防御」的倍数', unit: UNIT.mul },
    maxHpMul:           { name: '近战切换时「职业加成生命」的倍数', unit: UNIT.mul },
    defToAtk:           { name: '乾坤衍生：每点防御折算的攻击（%）', unit: UNIT.pct100 },
    defToHeal:          { name: '乾坤衍生：每点防御折算的回血（%）', unit: UNIT.pct100 },
    defToReduce:        { name: '乾坤衍生：每点防御折算的减伤（%）', unit: UNIT.pct100 },
    reducePct:          { name: '减伤比例（%）', unit: UNIT.pct100 },
    reboundPct:         { name: '反弹伤害比例（%）', unit: UNIT.pct100 },
    selfDmgPct:         { name: '每次施放自损比例（%）', unit: UNIT.pct100 },
    reflectRatio:       { name: '反弹伤害比例', unit: UNIT.pct },
    atkCost:            { name: '每次攻击自减的攻击力', unit: UNIT.point },
    atkFloor:           { name: '攻击力下限（自减到此值为止）', unit: UNIT.point },
    minBonus:           { name: '每档加成的地板值（至少加这么多）', unit: UNIT.point },
    atk:                { name: '攻击力', unit: UNIT.point },
    def:                { name: '防御力', unit: UNIT.point },
    hp:                 { name: '生命值', unit: UNIT.point },
    maxHp:              { name: '生命上限', unit: UNIT.point },

    // —— 回血/吸血类 ——
    healRatio:          { name: '回血比例', unit: UNIT.pct },
    healPct:            { name: '回血比例', unit: UNIT.pct },
    healLevels:         { name: '各档回血比例（按快乐层数）', unit: UNIT.pct },
    leechRatio:         { name: '吸血倍率（按打出的伤害 × 该值回血）', unit: UNIT.mul },
    leechMin:           { name: '吸血比例下限（满血时，%）', unit: UNIT.pct100 },
    leechMax:           { name: '吸血比例上限（濒死时，%）', unit: UNIT.pct100 },
    xiaoZhaoDoubleStrikeChance: { name: '小昭·妹双连击概率（%）', unit: UNIT.pct100 },
    healAtkDiv:         { name: '每这么多点治疗量 → 攻击 +1', unit: UNIT.point },
    healDefDiv:         { name: '每这么多点治疗量 → 防御 +1', unit: UNIT.point },
    overflowAtkDiv:     { name: '每这么多点溢出治疗 → 攻击 +1', unit: UNIT.point },
    overflowDefDiv:     { name: '每这么多点溢出治疗 → 防御 +1', unit: UNIT.point },
    hpDeduct:           { name: '每次扣除周芷若的生命值', unit: UNIT.point },

    // —— 闪避/流血档位类 ——
    minRatio:           { name: '最低比例（满血时，%）', unit: UNIT.pct100 },
    maxRatio:           { name: '最高比例（濒死时，%）', unit: UNIT.pct100 },
    max:                { name: '上限', unit: UNIT.pct },
    dotPercents:        { name: '每回合持续掉血比例（按第几回合）', unit: UNIT.pct },

    // —— 次数/时序类 ——
    duration:           { name: '持续回合数', unit: UNIT.round },
    round:              { name: '第几回合触发', unit: UNIT.round },
    interval:           { name: '每第 N 次命中/触发', unit: UNIT.round },
    maxTriggers:        { name: '最多触发次数', unit: UNIT.raw },
    maxTriggersPerRound:{ name: '每回合最多触发次数', unit: UNIT.raw },
    maxChain:           { name: '最大连锁次数（∞ = 不限）', unit: UNIT.raw },
    frontMax:           { name: '站位号 ≤ 该值算「前排」', unit: UNIT.point },
    m:                  { name: '生成单位的 M 值（强度预算）', unit: UNIT.point },
    unavoided:          { name: '是否必定命中（true = 不可闪避）', unit: UNIT.raw },

    // —— 附身转移（字符串，如 "1/3"）——
    atkTransfer:        { name: '附身时转移给宿主的攻击比例（如 1/3）', unit: UNIT.raw },
    defTransfer:        { name: '附身时转移给宿主的防御比例（如 1/3）', unit: UNIT.raw },
    hpTransfer:         { name: '附身时转移给宿主的生命比例（如 1/2）', unit: UNIT.raw },

    // —— 海克斯增强表（小昭 hexEnhance，1 = 100%）——
    dodgeBonus:         { name: '额外闪避率', unit: UNIT.pct },
    atkPerSplash:       { name: '流星溅射每次加攻', unit: UNIT.point },
    hitProb:            { name: '命中概率', unit: UNIT.pct },
    pushProb:           { name: '击退概率', unit: UNIT.pct },
    leechPct:           { name: '吸血比例', unit: UNIT.pct },
    critInterval:       { name: '每第 N 次触发（暴击/双倍吸血）', unit: UNIT.raw },
    enemySwapProb:      { name: '对敌方换位成功率', unit: UNIT.pct },
    allySwapProb:       { name: '对友方换位成功率', unit: UNIT.pct },
    atkCols:            { name: '圣火令加攻的列数', unit: UNIT.point },
    defRows:            { name: '圣火令加防的行数', unit: UNIT.point },
    horseAtk:           { name: '拒马攻击', unit: UNIT.point },
    horseDef:           { name: '拒马防御', unit: UNIT.point },
    horseHp:            { name: '拒马生命', unit: UNIT.point },

    // —— 全局常量（CONFIG）专有 ——
    FANG_LEVELS:        { name: '芳华分档概率表（按段位）', unit: UNIT.pct },
    FANG_K:             { name: '芳华分档系数表（按段位）', unit: UNIT.raw },
    ELITE_COUNT_THRESHOLDS: { name: '精英出场人数骰阈值（<0.05 出 3 人 / <0.20 出 2 人 / <0.80 出 1 人）', unit: UNIT.pct },
    XIAO_ZHAO_SISTER_PROB:  { name: '小昭形态骰（选到该角色时成为「小昭·姊」的概率）', unit: UNIT.pct },
    HP_ROLL_RANGE:      { name: '血量掷点区间（× M 值）', unit: UNIT.pct },
    DEFENDER_DEF_ROLL:  { name: '防战防御掷点区间（× 剩余预算）', unit: UNIT.pct },
    DPS_DEF_ROLL:       { name: '非防战防御掷点区间（× 剩余预算）', unit: UNIT.pct },
    DEFENDER_ATK_DEF_MAXGAP: { name: '防战约束：防 − 攻 ≤ 该值', unit: UNIT.point },
    DPS_ATK_DEF_GAP:    { name: '非防战约束：攻 − 防 的取值区间', unit: UNIT.point },
    SPIDER_FLY_HP_THRESHOLDS: { name: '小昭·妹飞天触发的血量占比档', unit: UNIT.pct },
    XIAO_ZHAO_CARRY_MODS: { name: '小昭·妹永久 carry 加成（攻/防/生命）', unit: UNIT.point },
    min:                { name: '档位下限比例（血量占比 ≥ 该值即落此档）', unit: UNIT.pct },
    defMax:             { name: '档位防御上限（null = 兜底档）', unit: UNIT.point },
    reduce:             { name: '破防量（每次扣目标多少防御）', unit: UNIT.point },
    base:               { name: '公式基准值', unit: UNIT.pct },
    atkRef:             { name: '公式参考攻击力（低于它概率变小）', unit: UNIT.point },
    atkDiv:             { name: '公式除数（攻击每高 1 点，概率增加 1/atkDiv）', unit: UNIT.point },
    cap:                { name: '公式上限', unit: UNIT.pct },

    // —— 数据表（buffs/roles/roster 等）专有 ——
    deathMultiplier:    { name: '队友阵亡时的加成倍率', unit: UNIT.mul },
    attackChance:       { name: '防战选择攻击的概率（%）', unit: UNIT.pct100 },
    defendChance:       { name: '防战选择防御的概率（%）', unit: UNIT.pct100 },
    eliteRate:          { name: '该精英被抽中的权重', unit: UNIT.pct },
    power:              { name: '强度预算（power）', unit: UNIT.point },
    targetPower:        { name: '该关目标强度预算', unit: UNIT.point },
    destroyProb:        { name: '拒马阵被击毁的概率', unit: UNIT.pct },
    extraStrike:        { name: '是否额外攻击一次（true/false）', unit: UNIT.raw },
    multiTarget:        { name: '是否多目标（true/false）', unit: UNIT.raw },
    healOnRebound:      { name: '反弹时是否回血（true/false）', unit: UNIT.raw },
};

// CONFIG 键 → 中文名（旋钮标题用）
export const CONFIG_KEY_GLOSSARY = {
    ATK_VAR: '攻击波动幅度', DEF_VAR: '防御波动幅度',
    HP_BONUS_MIN: '血量附加值下限', HP_BONUS_MAX: '血量附加值上限',
    RANGED_MISS_CHANCE: '远程基础未命中率（%）', FLY_MISS_CHANCE: '飞行基础未命中率（%）',
    GROUND_MISS_CHANCE: '地面基础未命中率（%）', FLY_MISS_LOWHP_BONUS: '飞行残血未命中加成（%）',
    FLY_MISS_EMPTYCOL_REDUCE: '飞行空列未命中削减（%）',
    FANG_LEVELS: '芳华分档概率表', FANG_K: '芳华分档系数表',
    HP_DMG_RATIO_TIERS: '防战血量伤害系数分档表', HP_DMG_RATIO_FLOOR: '防战血量伤害系数地板值',
    HP_ROLL_RANGE: '血量掷点区间', HP_TO_MAXHP_MUL: '掷出血量 → 生命上限倍率',
    XIAO_ZHAO_HP_ROLL: '小昭血量分配比例',
    DEFENDER_DEF_ROLL: '防战防御掷点区间', DEFENDER_ATK_DEF_MAXGAP: '防战攻防最大间距',
    DPS_DEF_ROLL: '非防战防御掷点区间', DPS_ATK_DEF_GAP: '非防战攻防间距区间',
    PANG_CLUMSY_FORMULA: '胖远桥二选一阈值公式',
    MAX_ROUND: '最大回合数', HEX_INTERVAL: '海克斯轮换间隔（回合）',
    ELITE_COUNT_THRESHOLDS: '精英出场人数骰阈值', XIAO_ZHAO_SISTER_PROB: '小昭形态骰',
    BASE_DODGE_FLY: '飞行基础闪避率', BASE_DODGE_GROUND: '地面基础闪避率',
    DODGE_REBOUND_RATIO: '闪避反弹伤害比例', WARRIOR_BREAK_DEF: '战士破防基准值',
    WARRIOR_BREAK_DEF_TIERS: '战士破防分档表', WARRIOR_BREAK_CHANCE_PER_DEF: '低防目标破防概率（每点防御 %）',
    RANGED_GROWTH_ATK: '远程成长攻击', FORTIFY_INCREMENT: '坚壁每次增量', FORTIFY_CAP: '坚壁层数上限',
    TOKEN_DROP_RATES: '令牌掉落率表', CHEST_DROP_RATE: '宝箱掉落率',
    BUFF_DURATION: '海克斯持续回合', BUFF_CHOICES: '海克斯候选数量',
    MING_TARGET_POWER_FALLBACK: '关卡目标强度兜底', POWER_FALLBACK: '单卡强度兜底',
    XUANMING_EXTRA_M: '玄冥二老齐出时额外补的普通兵 M 值',
    LOW_HP_THRESHOLD: '低血判据阈值', EXEC_THRESHOLD: '战士斩杀阈值',
    EXEC_THRESHOLD_BLOODTHIRST: '嗜血状态斩杀阈值', HORSE_M: '拒马单位预算 M',
    HOT_BLOOD_CRIT_INTERVAL: '热血奋战双倍吸血间隔', DEF_WAVE_THRESHOLD: '防御波动台词阈值',
    SPIDER_FLY_HP_THRESHOLDS: '小昭·妹飞天触发血量档', SPIDER_MIND_CONTROL_CHANCE: '永久惑心误伤概率',
    XIAO_ZHAO_CARRY_MODS: '小昭·妹永久 carry 加成', ZHANG_NEAR_ATK_LIMIT: '张无忌近战次数上限',
    ZHANG_RONGHUI_RATIO: '融会贯通额外伤害系数', MASTERY_FULL_BONUS_LAYERS: '全精通额外层数',
    WARRIOR_BREAK_DEF_TIERS_EXTRA: '战士破防扩展档'
};

// 数据表顶层键 → 中文名
export const DATA_KEY_GLOSSARY = {
    buffs: '海克斯效果表', roles: '职业与职业加成', encounters: '关卡与阵容',
    roster: '名册与强度预算', hexes: '海克斯池', taunts: '台词库'
};

/** 数值 → 人话。pct 按「1 = 100%」换算，pct100 直接补 % 号 */
export function fmtValue(v, unit) {
    if (unit === UNIT.pct) return `${v}（= ${(v * 100).toFixed(v * 100 % 1 === 0 ? 0 : 1)}%）`;
    if (unit === UNIT.pct100) return `${v}%`;
    if (unit === UNIT.mul) return `${v} 倍`;
    if (unit === UNIT.round) return `${v} 回合`;
    if (unit === UNIT.point) return `${v} 点`;
    return String(v);
}

/** 单位换算的一句话说明（说明区用） */
function unitLine(unit) {
    if (unit === UNIT.pct) return '单位：按「1 = 100%」记 —— 0.12 就是 12%，0.3 就是 30%。';
    if (unit === UNIT.pct100) return '单位：百分数直读 —— 10 就是 10%（注意：这个字段和 mechanics 的口径不同）。';
    if (unit === UNIT.mul) return '单位：倍率 —— 1.5 就是 1.5 倍。';
    if (unit === UNIT.round) return '单位：回合数。';
    if (unit === UNIT.point) return '单位：点数（直接加在属性上的值）。';
    return '';
}

/** 沿路径下钻，取「最靠内层那个带 type 的对象」的 type（数组下标跳过） */
function enclosingType(root, parts) {
    const mechIdx = parts.indexOf('mechanics');
    if (mechIdx < 0) return null;
    let node = root.characters?.[parts[1]]?.mechanics?.[Number(parts[mechIdx + 1])];
    let type = node && node.type ? node.type : null;
    for (let i = mechIdx + 2; i < parts.length - 1; i++) {
        const seg = parts[i];
        if (!node) break;
        if (/^\d+$/.test(seg)) { node = node[Number(seg)]; }
        else { if (node[seg] === undefined) break; node = node[seg]; }
        if (node && typeof node === 'object' && node.type) type = node.type;
    }
    return type;
}

/** 取路径最后一段的有效字段名（跳过数组下标），返回 { field, slot } */
function lastField(parts) {
    const last = parts[parts.length - 1];
    const isIdx = /^\d+$/.test(last);
    return {
        field: isIdx ? (parts[parts.length - 2] || last) : last,
        slot: isIdx ? `（第 ${Number(last) + 1} 项）` : ''
    };
}

/** 单位解析：pct100 白名单优先，其次字段表默认单位 */
function unitOf(field, ctx, layer, owner) {
    if (PCT100.has(`${ctx}.${field}`)) return UNIT.pct100;
    if (layer === 'data' && owner === 'buffs' && (field === 'atkBonus' || field === 'defBonus' || field === 'hpBonus')) return UNIT.pct;
    const fg = FIELD_GLOSSARY[field];
    return fg ? fg.unit : UNIT.raw;
}

/**
 * 描述一个参数路径（结果按 path 缓存，重复调用不重算）。
 * meta 可选 { layer, owner, skill }（来自 listNumericKnobs）；不传则按路径首段自动判定层。
 * 返回 { kind, char, fieldRaw, fieldName, unit, title, lines }
 *   kind='mechanics' 真旋钮；'skill' 技能表参数（改前先确认是否被引擎真读）；
 *   'config' 纯规则常量；'data' 其余数据表
 */
const _cache = new Map();
export function describeKnob(path, root, meta) {
    const key = String(path);
    if (_cache.has(key)) return _cache.get(key);
    const out = build(path, root, meta);
    _cache.set(key, out);
    return out;
}
function build(path, root, meta) {
    const parts = String(path).split('.');
    const layer = (meta && meta.layer)
        || (parts[0] === 'characters' ? 'character'
            : (Object.prototype.hasOwnProperty.call(root, parts[0]) ? 'data' : 'config'));
    if (layer === 'character') return buildCharacter(path, parts, root, meta);
    return buildGeneric(path, parts, root, layer, meta);
}

// ---- 角色技能表：mechanics（真旋钮）/ skills.params（可能只是文案，也可能被引擎真读）----
function buildCharacter(path, parts, root, meta) {
    const char = parts[1] || '';
    const { field, slot } = lastField(parts);
    const fg = FIELD_GLOSSARY[field];
    const skill = (meta && meta.skill) || parts[parts.indexOf('skills') + 1] || '机制';
    const unit = unitOf(field, skill, 'character', char);
    const fieldName = (fg ? fg.name : field) + slot;
    const lines = [];

    const skillIdx = parts.indexOf('skills');
    if (skillIdx >= 0) {
        const key = parts[skillIdx + 1];
        const sName = root.characters?.[char]?.skills?.[key]?.name || key;
        const desc = getSkillDesc(char, key);
        lines.push('⚠️ 这是 skills 表里的字段：它同时用于技能说明文字，也可能被引擎当真实数值读取');
        lines.push('（张无忌·乾坤大挪移、谢逊·召狮、灭绝师太·第三次攻击、张三丰·生生不息等都直接读这里）。'
            + '同一技能在 mechanics 里已有同名字段时，改这里通常不生效；没有时往往真生效 —— 以跑出来的结果为准。');
        const ul = unitLine(unit);
        if (ul) lines.push(ul);
        if (desc) lines.push(`技能原文：${desc}`);
        return { kind: 'skill', char, fieldRaw: field, fieldName, unit,
            title: `[skills 表]${sName} · ${(fg ? fg.name : field)}${slot}`, lines };
    }

    const type = enclosingType(root, parts);
    const tg = TYPE_GLOSSARY[type] || { name: type || '（未登记的类型）' };
    lines.push(`中文含义：${fieldName}`);
    const ul = unitLine(unit);
    if (ul) lines.push(ul);
    if (!fg) lines.push('（这个字段还没登记中文说明，把英文路径贴给我就能补上。）');
    if (parts.includes('jealous')) lines.push('这是「张无忌在场时」的强化档数值（对应 descJealous）。');
    if (tg.skill) {
        const desc = getSkillDesc(char, tg.skill);
        lines.push(desc ? `所属技能：${tg.name} —— ${desc}` : `所属技能：${tg.name}`);
    } else {
        lines.push(`所属机制：${tg.name}`);
    }
    if (type) lines.push(`（原始路径类型：${type}）`);
    return { kind: 'mechanics', char, type, fieldRaw: field, fieldName, unit,
        title: `${tg.name} · ${(fg ? fg.name : field)}${slot}`, lines };
}

// ---- CONFIG（纯规则常量）/ 数据表（buffs、roles...）：中文标题 + 单位 + 归属说明 ----
function buildGeneric(path, parts, root, layer, meta) {
    const { field, slot } = lastField(parts);
    const fg = FIELD_GLOSSARY[field];
    const owner = (meta && meta.owner) || parts[0];
    const isConfig = layer === 'config';
    // 单位白名单的上下文：CONFIG 用常量键（如 WARRIOR_BREAK_DEF_TIERS.chance），数据表用表名（如 buffs.atkBonus）
    const ctx = isConfig ? parts[0] : owner;
    const unit = unitOf(field, ctx, layer, owner);
    const ownerName = isConfig ? (CONFIG_KEY_GLOSSARY[parts[0]] || parts[0]) : (DATA_KEY_GLOSSARY[owner] || owner);
    const relDir = parts.slice(1, -1).join('.');
    const rel = parts.slice(1).join('.');
    // 常量本身就是标量（如 ATK_VAR）时，键名已是中文名，不再拼一遍字段名
    const wholeKey = isConfig && parts.length === 1;
    const fieldName = wholeKey ? ownerName : ((fg ? fg.name : field) + slot);
    const title = isConfig
        ? `[全局常量]${ownerName}${relDir ? ` → ${relDir}` : ''}${wholeKey ? '' : ` · ${fieldName}`}`
        : `[数据表]${ownerName}${relDir ? ` → ${relDir}` : ''} · ${(fg ? fg.name : field) + slot}`;
    const lines = [];

    if (isConfig) {
        lines.push('来源：core/01config-5v5-test.js 的 CONFIG —— 纯规则常量（不随关卡/阵容变），改动全局生效。');
        lines.push(`所属常量：${ownerName}${relDir ? ` → ${relDir}` : ''}`);
    } else {
        lines.push(`来源：content/200game-data.json 的 ${ownerName}（${owner}）—— 数据表，改动全局生效。`);
        lines.push(`所在位置：${owner} → ${rel || '（顶层）'}`);
        lines.push('提示：数据表里的数值语义随表而定（如海克斯加成多为「1 = 100%」的比例，职业加成则是直接相加的点数），'
            + '未登记中文含义时以原始字段名为准。');
    }
    lines.push(`中文含义：${fieldName}`);
    const ul = unitLine(unit);
    if (ul) lines.push(ul);
    if (!fg) lines.push('（这个字段还没登记中文说明；把上面这行路径贴给我就能补上。）');
    lines.push('引擎是否真读：CONFIG 与数据表都是引擎直接读取的取值来源，改这里一定进计算（不确定就改完跑一局看结算）。');
    return { kind: isConfig ? 'config' : 'data', char: ownerName, fieldRaw: field, fieldName, unit, title, lines };
}

/** 角色全部技能的中文原文说明，选中旋钮时一并展示，避免用户只能靠猜 */
export function charSkillLines(root, charName) {
    const ch = root.characters?.[charName];
    if (!ch || !ch.skills) return [];
    const out = [];
    for (const key of Object.keys(ch.skills)) {
        const name = ch.skills[key]?.name || key;
        out.push({ key, name, desc: getSkillDesc(charName, key) });
    }
    return out;
}