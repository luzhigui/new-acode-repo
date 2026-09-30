// tools/124-param-lab-glossary.js - 参数中文说明表（只读展示用，不参与战斗）
// V2.6.1 | 预估 43700 bytes | 2026-09-30 按 tests/param-read-guard.mjs 实测再清一条：ENGINE_READ 删 xinHun ——
//   healLevels 已改从 mechanics 读、skills.xinHun 无读取点（守卫报「表陈旧」）。删完守卫退出码 0。
// V2.6.0 | 预估 42900 bytes | 2026-09-30 韦一笑吸血收口后清尾：ENGINE_READ 删 bloodSiphon（skills 侧副本已删、
//   只剩 mechanics 一处真值），同步删掉两张「同一数值只显示一份 / 提示两处一起改」的表
//   （MECHANICS_HIDDEN_BY_TYPE 与 DUAL_REGISTER_NOTES）及 isMechanicsRowHidden() / dualRegisterNote()
//   两个导出 —— 它们服务的 skills 侧副本已全删（leech 本次、xinHun.healLevels 更早），留着反而会把
//   唯一那份真值也藏起来。另：export const VER 长期滞后在 V2.4.0（V2.5.0/V2.5.1 漏更），本次一并对齐。
// V2.5.1 | 预估 44700 bytes | 2026-09-30 按 tests/param-read-guard.mjs 实测补登记 ENGINE_READ（表 = 源码真读了什么的快照）：
//   ① spiderFly 补 'hpThresholds' —— modules/27 的 3 处 getSkillParams('小昭','spiderFly') 拿
//      hpThresholds[0]/[1] 当飞天血量阈值（口径已改 1 = 100%，content 里是 0.7 / 0.4）；
//   ② 新增整键 butterflyAttach: ['atkRatioRight', 'defRatioLeft', 'hpRatio'] —— modules/27:289 读这三个比例
//      做「小昭·姊」蝶变附身的攻/防/血转移。补完后与源码双向一致（守卫退出码 0）。
// V2.5.0 | 预估 44100 bytes | 2026-09-30 参数单位口径跟改（比例域收尾）：
//   ① CONFIG 的 miss 系 5 个常量与 WARRIOR_BREAK_CHANCE_PER_DEF 存储值已改比例域（0.03/0.06/0.01/0.06/0.12/0.025），
//      中文名补上换算说明（如「远程基础未命中率（比例，0.03 = 3%）」），免得实验台上看到 0.03 以为变小了；
//   ② 新增字段说明 hpThresholds（小昭·妹飞天，[0.7,0.4]）：「血量阈值（比例：0.7 = 70%）」；
//   ③ 新增导出 isUnreadSkillGroup(skillKey)：整组参数引擎不读（ENGINE_READ_NONE）的判定，供实验台在技能下拉里
//      把「随动」这类技能标成「引擎不读」。行级灰显仍复用 skillFieldVerdict 的 'none' 与 isOrphanField 的 'orphan'；
//      本版未动三张表（表与源码的同步补登记见 V2.5.1）。
// V2.4.0 | 预估 42600 bytes | 2026-09-29 参数单位口径统一为「1 = 100%」：原先按「10 = 10%」直读的
//   那批字段（skills.params 的 qianKun/qianKunUpgraded/qianKunDerived/bloodSiphon/spiderFly、
//   CONFIG.WARRIOR_BREAK_DEF_TIERS.chance、roles.防战.fortify）已全部 ÷100 改写、读取点同步改，
//   本表的 PCT100 白名单与 UNIT.pct100 随之退役 —— 显示只剩一种口径（0.12 → 12%），
//   「改成」输入框填人话值、落盘一律 ÷100，不再有「填 15 存 15」的第二套。
// V2.3.1 | 预估 38600 bytes | 2026-09-29 路径改名（原 120-param-lab-glossary.js）；V2.3.0 参数单一真值源收口（配合 content/200 + core/01 DESC_TRUTH）：
//   ① MIRRORED_SKILL_FIELDS **退役为空表** —— 原先它登记的是「skills.params 与 mechanics 各存一份、
//      只显示一份」的镜像字段；这些死副本已从 content/200game-data.json 删除，同一数值不再有两处登记，
//      表因此清空（保留空表+说明；若将来又出现两处登记，本表会重新长出条目，156 规则也会报警）；
//   ② ENGINE_READ 去掉 rebelStrike —— render/34 的「目标当前生命 X%」改读 mechanics 真值
//      （getMechanicField('宋青书','bonusTargetCurrentHp','ratio')），skills 侧已无读取点；
//   ③ MECHANICS_HIDDEN_BY_TYPE 保留：xinHun.healLevels、leech.minRatio/maxRatio 是**两侧都活、都真读**
//      的字段（非死副本），隐藏其中一份只为避免实验台同一数值显示两行。
// V2.2.0 | 预估 39200 bytes | 2026-09-29 参数实验台收尾批（仍只改呈现，不动战斗）：
//   ① 新增 ENGINE_READ_ORPHAN：源码里确实存在读取点、但所在函数全仓无调用点（孤儿/死代码）的登记；
//      与 tests/param-read-guard.mjs 双向对齐（登记在案不算漂移，读取点消失则报「孤儿登记失效」），
//      界面标签改说「读取这段的代码已废弃，改它不影响战斗」；
//   ② 百分数显示口径统一成人话：比例字段一律显示 12%（不再出现 0.12 或 0.12（= 12%）），
//      新增 humanToStored()/inputHint()，把「改成」输入框里填的人话值按该字段的存储口径落盘
//      （1 = 100% 的字段除以 100；10 = 10% 的字段原样写入）；
//   ③ 战斗参数侧的隐藏改为按「效果类型」配置（MECHANICS_HIDDEN_BY_TYPE）—— 类型取「最靠内层带
//      type 的对象」，所以 onHitEffects / beforeDamageEffects / dodgeRules 内层的 type 同样生效；
//      韦一笑蝠影汲血因此只留技能面板那两行（leechMin / leechMax）；
//   ④ 数组类数值标出档位（如「回血档位（第 1/4 档）」），不再像几个互不相干的独立参数；
//   ⑤ 补 export const VER（本文件原先缺该导出）。
// V2.1.0 | 预估 37800 bytes | 2026-09-29 「说人话」改造：新增 MIRRORED_SKILL_FIELDS（同一数值两处登记只显示一份）、
//   charSkillGroups()/charGroupKeyOf()（按技能归组，取消「机制」伪组）、knobWhatIf()/dualRegisterNote()；
//   界面文字全部去英文键名与文件路径，并移除 ENGINE_READ 的 xuanmingPalm.duration。
// 判定口径：沿路径逐段下钻，取「最靠内层那个带 type 的对象」的 type —— 因为具体效果类型都写在
//   onHitEffects / beforeDamageEffects / attributeMods 的元素上（如 poison / ignoreDef / bonusLostHp），
//   mechanics[i] 顶层的 type 只是机制大类（如 dotTick / linkAttack）。内层没有才退回顶层。
// 维护：新增 mechanics type、新字段或新 CONFIG 键时在这里补一条，没登记的类型/字段会退化成显示原文，不报错。

import { getSkillDesc } from '../core/01config-5v5-test.js';

export const VER = 'tools/124-param-lab-glossary.js V2.6.1';

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
//   pct    = 「1 就是 100%」的比例（全项目唯一口径：0.12 = 12%）；
//   mul = 倍率；round = 回合；point = 点数；raw = 原值
const UNIT = { pct: 'pct', mul: 'mul', round: 'round', point: 'point', raw: 'raw' };
export { UNIT };

// 退役（2026-09-29）：此处原有一张 PCT100 白名单，登记按「10 = 10%」直读的百分数字段：
//   nineYang.healPct/healRatio、bloodSiphon.leechMin/leechMax、bloodDodge.minRatio/maxRatio、
//   qianKun.*、qianKunUpgraded.*、qianKunDerived.*、spiderFly.xiaoZhaoDoubleStrikeChance、
//   rebelStrike.dmgBonus、WARRIOR_BREAK_DEF_TIERS.chance，以及 FIELD_GLOSSARY 里 roles.fortify 的两项。
//   这批数据已按 ÷100 改写（content/200 + core/01 CONFIG），引擎读取点同步改成直接使用或 ×100 还原，
//   白名单因此删除 —— 现在任何百分数字段都按 pct（1 = 100%）显示、按 ÷100 落盘。
//   若将来又冒出「10 = 10%」的字段，就在此处重建白名单，并让 unitOf 重新查它。

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
//   render/39:93（render/34 原先的 rebelStrike 读取点已于 2026-09-29 收口改读 mechanics 真值，故移除）
// 不在此表 = 仅供 desc 插值（改了不改变战斗结果）。
// 注：鹿杖客 xuanmingPalm 的 duration 不登记在本表（实际不生效），但源码里确实有读取点 ——
//   挪到下面的 ENGINE_READ_ORPHAN（孤儿登记），供守卫双向对齐，不假装它不存在。
export const ENGINE_READ = {
    rageOnHit:       ['atkPerHit'],
    righteousFace:   ['defGain'],
    youngBlood:      ['dmgMultiplier'],
    counterAttack:   ['prob', 'dmgRatio'],
    thirdStrike:     ['interval', 'dmgMultiplier', 'leechRatio'],
    summonZhou:      ['m'],
    summonLion:      ['prob', 'cub', 'grow'],
    lionInspire:     ['atkPerHit'],
    endlessBreath:   ['healPct', 'healAtkDiv', 'healDefDiv', 'overflowAtkDiv', 'overflowDefDiv', 'minBonus'],
    baguaArray:      ['atkFloor', 'procChance', 'atkCost', 'defGain'],
    tenRoundFortify: ['round'],
    qianKun:         ['reducePct', 'reboundPct', 'selfDmgPct'],
    qianKunUpgraded: ['reducePct', 'reboundPct', 'selfDmgPct'],
    qianKunDerived:  ['defToReduce', 'defToHeal', 'defToAtk'],
    nearSwitch:      ['atkMul', 'defMul', 'maxHpMul'],
    spiderFly:       ['maxTriggers', 'xiaoZhaoDoubleStrikeChance', 'hpThresholds'],
    butterflyAttach: ['atkRatioRight', 'defRatioLeft', 'hpRatio'],
    spiderStrike:    ['extraDmgMap'],
    mastery:         ['atkPer', 'defPer', 'hpPer'],
};

// 整包动态读取：引擎按动态键取子对象，无法逐字段列举（hexEnhance 经 getXiaoZhaoHexEnhance(hexKey) 取用）。
// 已确认被读的子字段：holyFlame.atkCols / holyFlame.defRows / cloudBody.dodgeBonus /
//   mindControl.enemySwapProb / mindControl.allySwapProb / hotBlood.leechPct。
export const ENGINE_READ_DYNAMIC = new Set(['hexEnhance']);

// 只有启动期存在性校验、没有任何字段被读。
export const ENGINE_READ_NONE = new Set(['lionFollow']);

// 孤儿登记（2026-09-29 建）：源码里**确实存在**读取点，但那个读取点所在的函数全仓没有任何调用点
//   （孤儿函数 / 死代码），所以实际不生效、改了战斗结果不会变。
//   与 ENGINE_READ 分开登记的理由：守卫 tests/param-read-guard.mjs 扫得到这段源码，若假装它不存在
//   会报「表遗漏」；登记在 ENGINE_READ 里又等于谎报「引擎真读」。故单列一张表：
//     · 登记在案 → 守卫不算漂移；
//     · 源码里这个读取点消失（例如以后有人删掉那个孤儿函数）→ 守卫报「孤儿登记已失效」，请从本表删掉。
// 鹿杖客 xuanmingPalm.duration：唯一读取点 modules/20:18 tickXuanmingPoison（读 s.duration 算 dot 索引），
//   该函数全仓无调用点 —— 中毒 tick 实际走 modules/30 读 mechanics 写进 state 的数据。
export const ENGINE_READ_ORPHAN = {
    xuanmingPalm: ['duration'],
};

/** 某技能键的这个字段是否属于「孤儿读取点」（源码有、但所在函数没人调用 → 实际不生效） */
export function isOrphanField(skillKey, field) {
    const fields = ENGINE_READ_ORPHAN[skillKey];
    if (!fields || field === undefined || field === null) return false;
    return fields.some(f => field === f || String(field).startsWith(f + '.'));
}

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

/**
 * 整个技能组的参数引擎都不读（ENGINE_READ_NONE，如谢逊 lionFollow「随动」）。
 * 供实验台在技能下拉里给这类技能标「引擎不读」——它们整组都不生效，不必逐个字段看。
 * @returns {boolean}
 */
export function isUnreadSkillGroup(skillKey) {
    return ENGINE_READ_NONE.has(skillKey);
}

// ---------------------------------------------------------------------------
// 镜像对照表（2026-09-29 建，同日收口后退役为空表）。
//   历史用途：skills.<键>.params 里这些字段与战斗参数（mechanics）里的等价数值是同一个数，
//   渲染层只显示战斗参数那一份、技能面板那份跳过，免得同一数值在表里出现两行。
//   为什么清空：这批「两处登记」的死副本已从 content/200game-data.json 整个删除 —— 同一数值现在
//   只有一处真值（mechanics），不再需要跳过任何一份。本表留空；将来若又出现两处登记，就在此重新
//   登记，tests/health-rules/156-desc-truth-drift.js 与 tests/param-read-guard.mjs 会同步报警。
export const MIRRORED_SKILL_FIELDS = {};

// 退役（2026-09-30）：此处原有两张表 —— MECHANICS_HIDDEN_BY_TYPE（隐藏战斗参数侧那份、只显示技能面板）
//   与 DUAL_REGISTER_NOTES（提示同一数值两处一起改）。它们服务的 skills 侧副本已全部删除
//   （leech 2026-09-30、xinHun.healLevels 更早），留着会把唯一那份真值也藏起来、还给出「两处一起改」的
//   错误提示。将来若又出现两处登记，参照 MIRRORED_SKILL_FIELDS 的做法重建，156 规则会报警。

/** 技能面板里的这个字段是否已有战斗参数那份显示（是则跳过，不重复显示） */
export function isMirroredSkillField(skillKey, fieldPath) {
    const fields = MIRRORED_SKILL_FIELDS[skillKey];
    if (!fields || !fieldPath) return false;
    return fields.some(f => fieldPath === f || fieldPath.startsWith(f + '.'));
}



// 角色里没有归入任何技能的战斗数值，统一落到这个组。
export const OTHER_PASSIVE_GROUP = '__other__';
const OTHER_PASSIVE_LABEL = '其他被动';

/** 技能面板参数路径在表里的相对字段名（去掉 characters.<角色>.skills.<技能>.params. 前缀） */
export function paramsFieldPath(path) {
    const parts = String(path).split('.');
    const i = parts.indexOf('params');
    return i >= 0 ? parts.slice(i + 1).join('.') : '';
}

/**
 * 角色层某条数值属于哪个技能组，返回技能键或 OTHER_PASSIVE_GROUP。
 * 技能面板的字段 → 键即技能键；战斗参数的字段 → 按效果类型归到对应技能（没有则「其他被动」）。
 */
export function charGroupKeyOf(root, owner, path) {
    const parts = String(path).split('.');
    const si = parts.indexOf('skills');
    if (si >= 0) return parts[si + 1] || OTHER_PASSIVE_GROUP;
    const tg = TYPE_GLOSSARY[enclosingType(root, parts)];
    const key = tg && tg.skill;
    return (key && root.characters?.[owner]?.skills?.[key]) ? key : OTHER_PASSIVE_GROUP;
}

// 数值叶子路径遍历（只用于判断某组有没有可改数字）
function eachNumberPath(node, parts, hit) {
    if (typeof node === 'number') { if (Number.isFinite(node)) hit(parts.join('.')); return; }
    if (Array.isArray(node)) { node.forEach((n, i) => eachNumberPath(n, parts.concat(String(i)), hit)); return; }
    if (node && typeof node === 'object') { for (const k of Object.keys(node)) eachNumberPath(node[k], parts.concat(k), hit); }
}

/**
 * 把某角色身上所有能改的数字按技能归组，供下拉用。
 * @returns [{ key, label, note? }] key = 技能键（或 OTHER_PASSIVE_GROUP），label = 中文技能名。
 *   技能面板的每个技能键各一组；战斗参数里没归到任何技能的数字，统一进「其他被动」。
 */
export function charSkillGroups(root, owner) {
    const ch = root.characters?.[owner];
    if (!ch) return [];
    const out = [];
    for (const key of Object.keys(ch.skills || {})) {
        out.push({ key, label: ch.skills[key]?.name || key });
    }
    let hasOther = false;
    for (let i = 0; i < (ch.mechanics || []).length && !hasOther; i++) {
        eachNumberPath(ch.mechanics[i], ['characters', owner, 'mechanics', String(i)],
            p => { if (charGroupKeyOf(root, owner, p) === OTHER_PASSIVE_GROUP) hasOther = true; });
    }
    if (hasOther) out.push({ key: OTHER_PASSIVE_GROUP, label: OTHER_PASSIVE_LABEL, note: '没有归入具体技能的战斗数值' });
    return out;
}

/**
 * 字段表「改了会怎样」一列的一句话 —— 复用 describeKnob() 的中文技能名 / 字段名 / 单位。
 * 不出现英文键名与文件路径。
 */
export function knobWhatIf(path, root, meta) {
    const info = describeKnob(path, root, meta);
    const name = info.fieldName;
    if (info.kind === 'mechanics') {
        // 孤儿子段：源码里那处读取点所在函数没有任何地方调用，实际不生效
        if (info.char && isOrphanField(charGroupKeyOf(root, info.char, path), info.fieldRaw)) {
            return '读这个数的代码已经废弃（没有任何地方调用它），改它不影响战斗。';
        }
        return `战斗会直接读「${name}」这个数，改了战斗结果就跟着变。`;
    }
    if (info.kind === 'skill') {
        const verdict = skillFieldVerdict(meta && meta.skill, paramsFieldPath(path));
        if (verdict === 'text') return '只改技能面板上的说明文字，战斗结果不变。';
        if (verdict === 'none') return '战斗只拿它检查有没有填，改了不影响战斗。';
        return `战斗会直接读「${name}」，改了战斗结果就跟着变。`;
    }
    if (info.kind === 'config') return `这是全局规则常量「${name}」，改完所有对局都跟着变。`;
    return `这是数据表里的数字「${name}」，改完全局生效。`;
}

// 参数字段名 → 中文含义 + 单位。按「最后一段路径」匹配（数组下标忽略）
export const FIELD_GLOSSARY = {
    // —— 通用/伤害类 ——
    baseDmg:            { name: '基础追击伤害倍率', unit: UNIT.mul },
    mult:               { name: '倍率（相对基础值的倍数）', unit: UNIT.mul },
    reboundDmg:         { name: '反弹伤害基数', unit: UNIT.point },
    dmgMultiplier:      { name: '伤害倍率（打出伤害 × 该值）', unit: UNIT.mul },
    dmgRatio:           { name: '反击伤害比例（按受到的伤害）', unit: UNIT.pct },
    dmgBonus:           { name: '额外伤害加成（%）', unit: UNIT.pct },
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
    defToAtk:           { name: '乾坤衍生：每点防御折算的攻击（%）', unit: UNIT.pct },
    defToHeal:          { name: '乾坤衍生：每点防御折算的回血（%）', unit: UNIT.pct },
    defToReduce:        { name: '乾坤衍生：每点防御折算的减伤（%）', unit: UNIT.pct },
    reducePct:          { name: '减伤比例（%）', unit: UNIT.pct },
    reboundPct:         { name: '反弹伤害比例（%）', unit: UNIT.pct },
    selfDmgPct:         { name: '每次施放自损比例（%）', unit: UNIT.pct },
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
    healLevels:         { name: '回血档位（按快乐层数）', unit: UNIT.pct },
    leechRatio:         { name: '吸血倍率（按打出的伤害 × 该值回血）', unit: UNIT.mul },
    leechMin:           { name: '吸血比例下限（满血时）', unit: UNIT.pct },
    leechMax:           { name: '吸血比例上限（濒死时）', unit: UNIT.pct },
    xiaoZhaoDoubleStrikeChance: { name: '小昭·妹双连击概率（%）', unit: UNIT.pct },
    healAtkDiv:         { name: '每这么多点治疗量 → 攻击 +1', unit: UNIT.point },
    healDefDiv:         { name: '每这么多点治疗量 → 防御 +1', unit: UNIT.point },
    overflowAtkDiv:     { name: '每这么多点溢出治疗 → 攻击 +1', unit: UNIT.point },
    overflowDefDiv:     { name: '每这么多点溢出治疗 → 防御 +1', unit: UNIT.point },
    hpDeduct:           { name: '每次扣除周芷若的生命值', unit: UNIT.point },

    // —— 闪避/流血档位类 ——
    minRatio:           { name: '最低比例（满血时）', unit: UNIT.pct },
    maxRatio:           { name: '最高比例（濒死时）', unit: UNIT.pct },
    max:                { name: '上限', unit: UNIT.pct },
    dotPercents:        { name: '每回合持续掉血比例（按第几回合）', unit: UNIT.pct },
    hpThresholds:       { name: '血量阈值（比例：0.7 = 70%）', unit: UNIT.pct },

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
    attackChance:       { name: '防战选择攻击的概率（%）', unit: UNIT.pct },
    defendChance:       { name: '防战选择防御的概率（%）', unit: UNIT.pct },
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
    RANGED_MISS_CHANCE: '远程基础未命中率（比例，0.03 = 3%）', FLY_MISS_CHANCE: '飞行基础未命中率（比例，0.06 = 6%）',
    GROUND_MISS_CHANCE: '地面基础未命中率（比例，0.01 = 1%）', FLY_MISS_LOWHP_BONUS: '飞行残血未命中加成（比例，0.06 = 6%/个）',
    FLY_MISS_EMPTYCOL_REDUCE: '飞行空列未命中削减（比例，0.12 = 12%/列）',
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
    WARRIOR_BREAK_DEF_TIERS: '战士破防分档表', WARRIOR_BREAK_CHANCE_PER_DEF: '低防目标破防概率（每点防御，比例：0.025 = 2.5%）',
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

/** 比例数值 → 人话百分数（0.12 → 「12」、0.015 → 「1.5」），最多保留 1 位小数 */
function pctText(v) {
    return String(Math.round(v * 1000) / 10);
}

/** 数值 → 人话。显示口径统一：比例一律是 12% 这种，不再露出 0.12 这类存储形态 */
export function fmtValue(v, unit) {
    if (unit === UNIT.pct) return `${pctText(v)}%`;
    if (unit === UNIT.mul) return `${v} 倍`;
    if (unit === UNIT.round) return `${v} 回合`;
    return String(v);
}

/**
 * 「改成」输入框里填的人话值 → 落盘存储值。
 * 比例字段的存储口径只有一种（1 = 100%），填 15 就落 0.15。
 */
export function humanToStored(v, unit) {
    if (unit === UNIT.pct) return v / 100;
    return v;
}

/** 「改成」输入框的填写提示：按该字段的单位说清楚填什么 */
export function inputHint(unit) {
    if (unit === UNIT.pct) return '填 12 表示 12%';
    if (unit === UNIT.mul) return '填 1.5 表示 1.5 倍';
    if (unit === UNIT.round) return '填回合数，如 3';
    if (unit === UNIT.point) return '填点数，如 3';
    return '';
}

/** 单位换算的一句话说明（说明区用） */
function unitLine(unit) {
    if (unit === UNIT.pct) return '单位：百分数 —— 填 12 就表示 12%。';
    if (unit === UNIT.mul) return '单位：倍率 —— 填 1.5 就表示 1.5 倍。';
    if (unit === UNIT.round) return '单位：回合数。';
    if (unit === UNIT.point) return '单位：点数（直接加在属性上的数值）。';
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

/**
 * 取路径最后一段的有效字段名（跳过数组下标），返回 { field, slot }。
 * 数组项带档位序号（如「回血档位（第 1/4 档）」），免得几个数看起来互不相干。
 */
function lastField(parts, root) {
    const last = parts[parts.length - 1];
    if (!/^\d+$/.test(last)) return { field: last, slot: '' };
    const field = parts[parts.length - 2] || last;
    let node = root;
    for (let i = 0; i < parts.length - 1 && node != null; i++) node = node[parts[i]];
    const total = Array.isArray(node) ? node.length : 0;
    return { field, slot: total ? `（第 ${Number(last) + 1}/${total} 档）` : `（第 ${Number(last) + 1} 项）` };
}

/** 单位解析：全项目只有一套口径，直接按字段表默认单位（未登记 = raw 原值） */
function unitOf(field, layer, owner) {
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

// ---- 角色技能表：战斗参数（引擎真读）/ 技能面板参数（可能只是文案，也可能被引擎真读）----
function buildCharacter(path, parts, root, meta) {
    const char = parts[1] || '';
    const { field, slot } = lastField(parts, root);
    const fg = FIELD_GLOSSARY[field];
    const skill = (meta && meta.skill) || parts[parts.indexOf('skills') + 1] || '战斗参数';
    const unit = unitOf(field, 'character', char);
    const fieldName = (fg ? fg.name : field) + slot;

    const skillIdx = parts.indexOf('skills');
    if (skillIdx >= 0) {
        const key = parts[skillIdx + 1];
        const sName = root.characters?.[char]?.skills?.[key]?.name || key;
        const desc = getSkillDesc(char, key);
        const lines = ['这是技能面板上的数字，技能说明文字里也会用到它；如果战斗也读它，改了就真生效。',
            '同一数值在战斗参数里已有登记时，改这里通常不生效 —— 以跑出来的结果为准。'];
        const ul = unitLine(unit);
        if (ul) lines.push(ul);
        if (desc) lines.push(`技能原文：${desc}`);
        return { kind: 'skill', char, fieldRaw: field, fieldName, unit, qualifier: '',
            title: `${sName} · ${(fg ? fg.name : field)}${slot}`, lines };
    }

    const type = enclosingType(root, parts);
    const tg = TYPE_GLOSSARY[type] || { name: type || '（未登记的效果）' };
    const jealous = parts.includes('jealous');
    const lines = [`中文含义：${fieldName}`];
    const ul = unitLine(unit);
    if (ul) lines.push(ul);
    if (!fg) lines.push('（这个数字还没登记中文说明，把英文原名贴给我就能补上。）');
    if (jealous) lines.push('这是「张无忌在场时」的强化档数值。');
    if (tg.skill) {
        const desc = getSkillDesc(char, tg.skill);
        lines.push(desc ? `所属技能：${tg.name} —— ${desc}` : `所属技能：${tg.name}`);
    } else {
        lines.push(`所属被动：${tg.name}`);
    }
    const qualifier = [tg.name, jealous ? '张无忌在场时强化档' : ''].filter(Boolean).join(' · ');
    return { kind: 'mechanics', char, type, fieldRaw: field, fieldName, unit, qualifier,
        title: `${tg.name} · ${(fg ? fg.name : field)}${slot}`, lines };
}

// ---- CONFIG（纯规则常量）/ 数据表（buffs、roles...）：中文标题 + 单位 + 归属说明 ----
function buildGeneric(path, parts, root, layer, meta) {
    const { field, slot } = lastField(parts, root);
    const fg = FIELD_GLOSSARY[field];
    const owner = (meta && meta.owner) || parts[0];
    const isConfig = layer === 'config';
    const unit = unitOf(field, layer, owner);
    const ownerName = isConfig ? (CONFIG_KEY_GLOSSARY[parts[0]] || parts[0]) : (DATA_KEY_GLOSSARY[owner] || owner);
    const relParts = parts.slice(1);
    // 数据表里带中文名的层级用中文名（如 buffs.carry → 你就是carry），避免英文键名露在界面上
    const cn = seg => (root[owner]?.[seg]?.name) || seg;
    const relCn = relParts.map(cn).join(' → ');
    const relDirCn = relParts.slice(0, -1).map(cn).join(' → ');
    // 常量本身就是标量（如 ATK_VAR）时，键名已是中文名，不再拼一遍字段名
    const wholeKey = isConfig && parts.length === 1;
    const fieldName = wholeKey ? ownerName : ((fg ? fg.name : field) + slot);
    const title = isConfig
        ? `全局规则常量 · ${ownerName}${relDirCn ? ` → ${relDirCn}` : ''}${wholeKey ? '' : ` · ${fieldName}`}`
        : `${ownerName}${relDirCn ? ` → ${relDirCn}` : ''} · ${(fg ? fg.name : field) + slot}`;
    const lines = [];

    if (isConfig) {
        lines.push('这是全局规则常量，不随关卡、阵容变化，改了所有对局都生效。');
        lines.push(`所属规则：${ownerName}${relDirCn ? ` → ${relDirCn}` : ''}`);
    } else {
        lines.push(`这是「${ownerName}」数据表里的数字，改了全局生效。`);
        lines.push(`所在位置：${ownerName} → ${relCn || '（顶层）'}`);
        lines.push('数据表里数值的含义随表而定：海克斯加成多为「1 = 100%」的比例，职业加成则是直接相加的点数。');
    }
    lines.push(`中文含义：${fieldName}`);
    const ul = unitLine(unit);
    if (ul) lines.push(ul);
    if (!fg) lines.push('（这个数字还没登记中文说明，把英文原名贴给我就能补上。）');
    return { kind: isConfig ? 'config' : 'data', char: ownerName, fieldRaw: field, fieldName, unit, qualifier: '', title, lines };
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