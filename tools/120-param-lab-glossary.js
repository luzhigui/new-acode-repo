// tools/120-param-lab-glossary.js - 参数中文说明表（只读展示用，不参与战斗）
// V1.0.0 | 预估 10200 bytes | 2026-09-28 新建。给参数实验台用：把英文参数路径翻译成人能看懂的
//   中文技能名 + 参数名 + 单位，并附上 content/200game-data.json 里该角色的技能原文说明（getSkillDesc 渲染）。
// 为什么要它：旋钮原来是 `mechanics[0].onHitEffects[0].pct = 0.12` 这种，用户只能瞎选。
// 口径说明：mechanics 下的比例类数值一律按「1 = 100%」记（0.12 即 12%），单位换算由 UNIT 表负责；
//   技能原文说明复用 core/01 的 getSkillDesc，不另写一份占位符替换逻辑。
// 判定口径：沿路径逐段下钻，取「最靠内层那个带 type 的对象」的 type —— 因为具体效果类型都写在
//   onHitEffects / beforeDamageEffects / attributeMods 的元素上（如 poison / ignoreDef / bonusLostHp），
//   mechanics[i] 顶层的 type 只是机制大类（如 dotTick / linkAttack）。内层没有才退回顶层。
// 维护：新增 mechanics type 或新字段时在这里补一条，没登记的类型会退化成只显示 type 原文，不报错。
// 【待办 2026-09-28】FIELD_GLOSSARY 只登记了 skills 表 78 个字段键里的约 20 个，剩下约 58 个
//   （firstProcChance / maxChain / currentHpRatio / leechMin·leechMax / overflowAtkDiv·overflowDefDiv /
//   healAtkDiv·healDefDiv / selfDmgPct / reducePct / reboundPct / dmgRatio / hitsPerRound 等）在勾
//   「展开全部字段」时仍只显示英文。待补。
// 【待办 2026-09-28】还想给每个字段标「引擎是否真读」：真被算伤害/概率/属性的标 ✅，只被 getSkillDesc
//   拼说明文字的标 ⚠️——靠全库 getSkillParams('角色','技能') 的调用点反查，省得用户靠猜或跑一局试。
//   两条待办的完整说明见 文件汇总20260730/优化-想法和优化.md「工具链优化待办」。

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
    leech:                      { skill: 'coldPalm',     name: '寒冰掌 · 吸血' },
    lostHpPercent:              { skill: 'bloodDodge',   name: '残血幻影 · 额外闪避' },
    damageReflect:              { name: '反伤' },
};

// 数值的单位口径：pct = 「1 就是 100%」的比例；mul = 倍率；round = 回合；point = 点数；raw = 原值
const UNIT = { pct: 'pct', mul: 'mul', round: 'round', point: 'point', raw: 'raw' };
export { UNIT };

// 参数字段名 → 中文含义 + 单位。按「最后一段路径」匹配（数组下标忽略）
export const FIELD_GLOSSARY = {
    baseDmg:            { name: '基础追击伤害倍率', unit: UNIT.mul },
    lostHpRatio:        { name: '按目标已损失生命的加成比例', unit: UNIT.pct },
    maxHpRatio:         { name: '按目标最大生命的加成比例', unit: UNIT.pct },
    executeThreshold:   { name: '斩杀阈值（目标血量低于此比例即斩杀）', unit: UNIT.pct },
    procChance:         { name: '触发概率', unit: UNIT.pct },
    chainProcChance:    { name: '连锁触发概率（触发后再连一次的概率）', unit: UNIT.pct },
    ratio:              { name: '比例（具体含义随所在技能）', unit: UNIT.pct },
    atkBonus:           { name: '攻击力加成值', unit: UNIT.point },
    defBonus:           { name: '防御力加成值', unit: UNIT.point },
    hpBonus:            { name: '生命上限加成值', unit: UNIT.point },
    hpDeduct:           { name: '每次扣除周芷若的生命值', unit: UNIT.point },
    healLevels:         { name: '各档回血比例（按快乐层数）', unit: UNIT.pct },
    chance:             { name: '触发概率', unit: UNIT.pct },
    mult:               { name: '倍率（相对基础值的倍数）', unit: UNIT.mul },
    baseChance:         { name: '基础触发概率', unit: UNIT.pct },
    per10pctLost:       { name: '每损失 10% 生命额外增加的概率', unit: UNIT.pct },
    healRatio:          { name: '回血比例', unit: UNIT.pct },
    duration:           { name: '持续回合数', unit: UNIT.round },
    dotPercents:        { name: '每回合持续掉血比例（按第几回合）', unit: UNIT.pct },
    bonus:              { name: '额外增伤比例', unit: UNIT.pct },
    pct:                { name: '比例', unit: UNIT.pct },
    minRatio:           { name: '最低比例（满血时）', unit: UNIT.pct },
    maxRatio:           { name: '最高比例（濒死时）', unit: UNIT.pct },
    max:                { name: '上限', unit: UNIT.pct },
    reflectRatio:       { name: '反弹伤害比例', unit: UNIT.pct },
};

/** 把 mechanics 的比例数值写成「0.12 = 12%」这种一眼能懂的形态 */
export function fmtValue(v, unit) {
    if (unit === UNIT.pct) return `${v}（= ${(v * 100).toFixed(v * 100 % 1 === 0 ? 0 : 1)}%）`;
    if (unit === UNIT.mul) return `${v} 倍`;
    if (unit === UNIT.round) return `${v} 回合`;
    if (unit === UNIT.point) return `${v} 点`;
    return String(v);
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
 * 描述一个参数路径（结果按 path 缓存，重复调用不重算）。
 * 返回 { kind, char, fieldRaw, fieldName, unit, title, lines }
 *   kind='mechanics' 真旋钮；kind='skill' 文案参数（改了通常不出效果）
 */
const _cache = new Map();
export function describeKnob(path, root) {
    const key = String(path);
    if (_cache.has(key)) return _cache.get(key);
    const out = build(path, root);
    _cache.set(key, out);
    return out;
}
function build(path, root) {
    const parts = String(path).split('.');
    const char = parts[1] || '';
    const last = parts[parts.length - 1];
    const isIdx = /^\d+$/.test(last);
    const field = isIdx ? (parts[parts.length - 2] || last) : last;
    const fg = FIELD_GLOSSARY[field];
    const fieldName = fg ? fg.name : field;
    const slot = isIdx ? `（第 ${Number(last) + 1} 项）` : '';
    const jealous = parts.includes('jealous');
    const lines = [];

    // ---- skills.<key>.params.<field>：既供文案插值，也可能被引擎当真实数值读取 ----
    const skillIdx = parts.indexOf('skills');
    if (skillIdx >= 0) {
        const key = parts[skillIdx + 1];
        const sName = root.characters?.[char]?.skills?.[key]?.name || key;
        const desc = getSkillDesc(char, key);
        lines.push('⚠️ 这是 skills 表里的字段（不是 mechanics）：它同时用于技能说明文字，也可能被引擎当真实数值读取');
        lines.push('（张无忌·乾坤大挪移、谢逊·召狮、灭绝师太·第三次攻击等都直接读这里）。'
            + '同一技能在 mechanics 里已有同名字段时，改这里通常不生效；没有时往往真生效 —— 以跑出来的结果为准。');
        if (desc) lines.push(`技能原文：${desc}`);
        return { kind: 'skill', char, fieldRaw: field, fieldName: fieldName + slot, unit: fg ? fg.unit : UNIT.raw,
            title: `[skills 表]${sName} · ${fieldName}${slot}`, lines };
    }

    // ---- characters.<角色>.mechanics...：真旋钮 ----
    const type = enclosingType(root, parts);
    const tg = TYPE_GLOSSARY[type] || { name: type || '（未登记的类型）' };
    lines.push(`中文含义：${fieldName}${slot}`);
    if (fg && fg.unit === UNIT.pct) lines.push('单位：按「1 = 100%」记 —— 0.12 就是 12%，0.3 就是 30%。');
    else if (fg && fg.unit === UNIT.mul) lines.push('单位：倍率 —— 1.5 就是 1.5 倍。');
    else if (fg && fg.unit === UNIT.round) lines.push('单位：回合数。');
    else if (fg && fg.unit === UNIT.point) lines.push('单位：点数（直接加在属性上的值）。');
    if (!fg) lines.push('（这个字段还没登记中文说明，把英文路径贴给我就能补上。）');
    if (jealous) lines.push('这是「张无忌在场时」的强化档数值（对应 descJealous）。');
    if (tg.skill) {
        const desc = getSkillDesc(char, tg.skill);
        lines.push(desc ? `所属技能：${tg.name} —— ${desc}` : `所属技能：${tg.name}`);
    } else {
        lines.push(`所属机制：${tg.name}`);
    }
    if (skillIdx < 0 && type) lines.push(`（原始路径类型：${type}）`);
    return { kind: 'mechanics', char, type, fieldRaw: field, fieldName: fieldName + slot,
        unit: fg ? fg.unit : UNIT.raw, title: `${tg.name} · ${fieldName}${slot}`, lines };
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
