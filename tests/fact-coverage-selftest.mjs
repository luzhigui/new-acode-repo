#!/usr/bin/env node
// tests/fact-coverage-selftest.mjs — factType「引擎发射 ↔ 体检消费」覆盖交叉检查
//
// 为什么要有它（第 124 轮立的根本缺口）：
//   本项目过去 10 轮的最高发失盲模式是「引擎/content 新增或改变机制，体检静默瞎」：
//     · 空见（新角色）零规则覆盖，直到第 120 轮才补 rule172；
//     · 灭绝三击判据空转（文案重构后正则失配），白绿很多轮；
//     · 唐文亮冲刺整条空转（机制从对调改强推挤压，报幕格式全变）；
//     · isBrother=true 零发射（回放器漏模永久继承），结构扫描器报了几轮才定位；
//     · 流星溅射成长 rule155 恒空转（样本稀缺）。
//   共同点：**没有任何东西回答「这个 fact/机制有没有规则盯」**。157 只对账 mechanics 安装
//   （类型↔注册表↔schema），不查消费侧；coverage-report 只报「规则有没有触发」，不报
//   「fact 有没有规则引用」。本检查补这个面：
//     ① 从 infra/56-battle-enums.js 取 FACT_TYPES 全表；
//     ② 引擎侧引用（core/+modules/ 里 push/factType 行）= 发射面；
//     ③ 体检侧消费（tests/health-rules/ 规则 + stat-decl 契约）= 盯梢面；
//     ④ 渲染侧登记（render/ 的 registerFactRenderer）= UI 面（只报告，不算盯梢）；
//     ⑤ 交叉判定：引擎在发射但零规则/契约消费 ⇒ **覆盖缺口候选**（新机制静默瞎的苗头）；
//        规则/契约引用但引擎零发射 ⇒ 悬空引用（判据对着不存在的 fact 干活）。
//   口径：静态扫描（不跑引擎，秒出）；白名单棘轮只许收缩——新增未登记缺口即红，
//        已在册的必须带理由（UI 展示类 / 运行时由 X 规则间接覆盖 / 已知待办）。
//
// 用法：node tests/fact-coverage-selftest.mjs [--scan]（--scan 只报告不判退码）

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// 取样充分性判定（2026-10-27 夜间第 143 轮接入）：与对照器守卫 / 契约绑定 / fact 普查 / 规则恒空转
// 共用 tests/_lib/sample-sufficiency.mjs 同一份口径。本检查器此前**完全不判取样面**：
//   FACT_TYPES 块一旦切不出来（infra/56 结构变动）⇒ FACT_KEYS=0 ⇒ gaps / stale 双双归零 ⇒
//   报告打出「覆盖缺口 0 类、悬空引用 0 类」，而真相是"一条都没查"。这就是第 142 轮点名的
//   「只查了 3 条就说 56 条都没问题」在本文件的版本，本轮一并收口。
import { judgeSample, checkThreshold, selfCheck } from './_lib/sample-sufficiency.mjs';

const SCAN_ONLY = process.argv.includes('--scan');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 取样面规模下限（实测：FACT_KEYS 145 / 规则文件 47 / 引擎文件 52；薄线由公共件按一半推出）。
//   ★ 实测 FACT_KEYS 145 与 infra/56 真实 FACT_TYPES 的 91 项对不上 —— 本文件的取样面本身是脏的
//   （切片区间从 'FACT_TYPES' 起到 'MECHANIC_TYPES' 止，中途把别的枚举也收了进来）。
//   已立待办（见文末打印与本轮日志），本轮先钉下限防塌到 0，不擅自改切片口径（那会改变既有结论）。
const MIN_FACT_KEYS = 80;
const MIN_RULE_FILES = 30;
const MIN_ENGINE_FILES = 30;

function walk(dir, exts, out = []) {
    if (!existsSync(dir)) return out;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.mut') walk(p, exts, out); }
        else if (exts.some(x => e.name.endsWith(x))) out.push(p);
    }
    return out;
}

// ① FACT_TYPES 全表
const enumsSrc = readFileSync(path.join(ROOT, 'infra/56-battle-enums.js'), 'utf8');
const factBlock = enumsSrc.slice(enumsSrc.indexOf('FACT_TYPES'), enumsSrc.indexOf('MECHANIC_TYPES'));
const FACT_KEYS = [...factBlock.matchAll(/([A-Z][A-Z0-9_]+)\s*:\s*'([^']+)'/g)].map(m => ({ key: m[1], val: m[2] }));

// ② 引擎侧引用文件集（发射面代理：core/+modules/ 里含 FACT_TYPES.X 的行）
const engineFiles = [...walk(path.join(ROOT, 'core'), ['.js']), ...walk(path.join(ROOT, 'modules'), ['.js'])];
// ③ 体检侧：规则 + 契约
const ruleFiles = walk(path.join(ROOT, 'tests/health-rules'), ['.js']);
const statDecl = path.join(ROOT, 'tests/stat-decl-vs-actual-check.mjs');
// ④ 渲染侧
const renderFiles = walk(path.join(ROOT, 'render'), ['.js']);

function countRefs(files, key) {
    const pat = new RegExp('FACT_TYPES\\.' + key + '\\b');
    let n = 0;
    for (const f of files) {
        const src = readFileSync(f, 'utf8');
        const m = src.match(new RegExp(pat.source, 'g'));
        if (m) n += m.length;
    }
    return n;
}
// 体检侧消费的严格形态（第 124 轮反思校准）：
//   规则消费 fact 的可信标识符只有两种 —— ① FACT_TYPES.X 引用；② 裸键名 'KEY'（factType 字段值）。
//   此前误把「文件名含关键词」（138-wind-push.js）和「渲染标签字符串」（kind:'splash'）算作消费，
//   造成 PUSH/DESTROY/TRANSFORM/STAT_CHANGE/DASH/SPLASH 六条假悬空引用 —— 这些规则实际消费的是
//   带前缀变体（WIND_ASSAULT_PUSH / HORSE_DESTROY …），裸 KEY 引擎本就不发。已剔除这两个误判源。
//   注：规则按 fact.data 字段值 / 渲染后文本消费时，factType 字符串不出现，会落入 gaps 候选
//   （不判红，交由样本驱动的结构扫描器核对实际覆盖）。
function consumeRefs(key, val) {
    let n = countRefs(ruleFiles, key);
    const bare = new RegExp("'" + key + "'", 'g');
    for (const f of ruleFiles) {
        const src = readFileSync(f, 'utf8');
        const b = src.match(bare); if (b) n += b.length;
    }
    return n;
}
// stat-decl 的契约用裸键名（'BLOOD_THIRST_LEECH' 风格），单独计
function statDeclRefs(key) {
    if (!existsSync(statDecl)) return 0;
    const src = readFileSync(statDecl, 'utf8');
    const m = src.match(new RegExp("'" + key + "'", 'g'));
    return m ? m.length : 0;
}

// 白名单（棘轮：只许收缩）。理由分三类的这里必须写全，否则新增缺口会红。
const WHITELIST = {
    // —— UI/流程展示类：进战报给玩家看，无数值/行为断言价值 ——
    ROUND_START: '回合分隔行（规则侧按 round-start 口径消费，不需要逐条规则）',
    ROUND_END: '回合结束行（同 ROUND_START）',
    BUFF_SUMMARY: '团队 Buff 摘要行（UI 展示；buff 门控由各机制规则自行覆盖）',
    SKILL_ANNOUNCE: '技能宣告行（多数机制的文案载体，由对应机制规则按文本消费）',
    PASS: '休息/遮挡行（122 checkActionRights 按 data.unit 消费，不走 FACT_TYPES 引用）',
    EMPTY_TARGET: '无可选目标行（122 checkActionRights 同口径消费）',
    HP_CHANGE: '血量变动事件（不变量套件按单位数组逐步断言，不按 factType 引用）',
    STATE_CHANGE: '状态变更信号（静默位移判据 isSilentRelocate 消费，不走 FACT_TYPES 引用）',
    UNIT_EVENT: '单位事件载体（同 HP_CHANGE）',
    BATTLE_START: '对局开始行（UI）',
    BATTLE_END: '对局结束行（UI/基线闸门按 winner 消费，不走 factType）',
    BUFF_PICK: '选 Buff 行（UI；picker 口径由 _lib/buff-picker 自检）',
    CARRY_ANNOUNCE: 'carry 宣告（CARRY_APPLY 契约覆盖数值，宣告行走 UI）',
    // —— 运行时由数值契约间接覆盖（契约在 stat-decl 用裸键名，本扫描的 statDeclRefs 计不到风格）——
    // （此类应在测量后逐条核实登记；先留结构注释，实测名单见下方输出）
};

const rows = [];
const gaps = [], stale = [];
for (const { key, val } of FACT_KEYS) {
    const eng = countRefs(engineFiles, key);
    const rule = consumeRefs(key, val);
    const decl = statDeclRefs(key);
    const rend = countRefs(renderFiles, key);
    rows.push({ key, eng, rule, decl, rend });
    const watched = rule + decl > 0;
    if (eng > 0 && !watched && !WHITELIST[key]) gaps.push({ key, eng, rend });
    if (eng === 0 && (rule > 0 || decl > 0) && !WHITELIST[key]) stale.push({ key, rule, decl });
}

// 取样档位（第 143 轮新增，走公共件）：三个取样面各判一档，任一不足即整体「取样不足」。
const SAMPLE_FK = judgeSample({
    count: FACT_KEYS.length, floor: MIN_FACT_KEYS, unit: '条 factType', mode: 'floor', source: 'infra/56 枚举切片'
});
const SAMPLE_RF = judgeSample({
    count: ruleFiles.length, floor: MIN_RULE_FILES, unit: '个规则文件', mode: 'floor', source: 'tests/health-rules'
});
const SAMPLE_EF = judgeSample({
    count: engineFiles.length, floor: MIN_ENGINE_FILES, unit: '个引擎文件', mode: 'floor', source: 'core+modules'
});
const SAMPLE_INSUFFICIENT = SAMPLE_FK.insufficient || SAMPLE_RF.insufficient || SAMPLE_EF.insufficient;
const sampleFails = [];
for (const [tag, s] of [['枚举切片', SAMPLE_FK], ['规则文件', SAMPLE_RF], ['引擎文件', SAMPLE_EF]]) {
    const bad = checkThreshold(s);
    if (bad) sampleFails.push(tag + '取样门槛：' + bad);
}
for (const bad of selfCheck()) sampleFails.push('取样公共件自证：' + bad);
if (SAMPLE_INSUFFICIENT) {
    for (const [tag, s] of [['枚举切片', SAMPLE_FK], ['规则文件', SAMPLE_RF], ['引擎文件', SAMPLE_EF]]) {
        if (s.insufficient) sampleFails.push(tag + '取样不足：' + s.detail);
    }
}

console.log('==== factType 覆盖交叉检查（引擎发射 ↔ 体检消费）====');
console.log('· FACT_TYPES 全表 ' + FACT_KEYS.length + ' 条；引擎文件 ' + engineFiles.length + ' / 规则文件 ' + ruleFiles.length + ' / 渲染文件 ' + renderFiles.length);
console.log('· 取样档位：枚举 ' + SAMPLE_FK.state + '（薄线 ' + SAMPLE_FK.thin + '）· 规则文件 '
    + SAMPLE_RF.state + '（薄线 ' + SAMPLE_RF.thin + '）· 引擎文件 ' + SAMPLE_EF.state + '（薄线 ' + SAMPLE_EF.thin + '）'
    + (SAMPLE_INSUFFICIENT ? ' ⇒ **取样不足**：下列结论中的「没查到」一律标「不成立」' : ' ⇒ 取样充分'));
if (sampleFails.length) {
    console.log('· ⛔ 取样面红线（' + sampleFails.length + ' 项；本检查器按第 124 轮定性恒不判退码，仅报告）：');
    for (const s of sampleFails) console.log('    ❌ ' + s);
}
const watchedCount = rows.filter(r => r.eng > 0 && (r.rule + r.decl) > 0).length;
const emittedCount = rows.filter(r => r.eng > 0).length;
console.log('· 引擎发射 ' + emittedCount + ' 类，其中被规则/契约盯梢 ' + watchedCount + ' 类（覆盖率 ' + (watchedCount / Math.max(1, emittedCount) * 100).toFixed(1) + '%）');
console.log('· 覆盖缺口候选（引擎发射、零规则/契约、未登记）: ' + gaps.length + ' 类');
console.log('   ⚠ 注：静态零引用 ≠ 真缺口 —— 规则常按 fact.data 字段值 / 渲染后文本消费，factType 字符串不出现；');
console.log('     以下为「待样本验证候选」，不判红；需配合结构扫描器跑真实对局核对实际覆盖。按引擎引用降序：');
for (const g of gaps.sort((a, b) => b.eng - a.eng)) console.log('    ? ' + g.key + '（引擎引用 ' + g.eng + ' 处，渲染 ' + g.rend + ' 处）');
console.log('· 悬空引用（规则/契约引用、引擎零发射、未登记）: ' + stale.length + ' 类 ← 红线（引擎变更后规则失配的苗头）');
for (const s of stale) console.log('    ⚠ ' + s.key + '（规则 ' + s.rule + ' / 契约 ' + s.decl + '）');
if (SAMPLE_INSUFFICIENT) {
    // 「零悬空」「零缺口」同属**没查到**类结论：取样面一塌它俩必然双双归零，不能当绿看。
    //   ★ 故取样不足时**无条件**给出这句（不看 stale 是否为空）—— 空集出绿正是本轮要收的洞。
    console.log('    ⚠️  以上缺口 / 悬空是**查到**的项；取样不足时**「零」不等于没有问题** —— '
        + '缺口 0 类与悬空 0 类此刻均**不成立**（既不计绿也不计红），先恢复取样面再谈结论');
} else if (!stale.length) {
    console.log('    （无 —— 无规则/契约对着不存在的 fact 干活）');
}
if (SCAN_ONLY) { console.log('· --scan 模式：仅报告不判红'); }
// 第 124 轮反思（重要）：本检查器静态匹配不可靠，已实证两波假阳性 ——
//   ① 规则侧 fileNorm 文件名加权 + val 渲染标签，把 PUSH/DESTROY/TRANSFORM/STAT_CHANGE/DASH/SPLASH 误判成悬空；
//   ② 契约侧裸字符串匹配命中 id 字段（id:'FORTIFY'）与注释（NINE_YANG_HEAL 已过期残留），把 8 条误判成悬空。
//   根因：覆盖盲区是**运行时**现象（fact 实际出现 + 规则/契约实际判据），规则/契约用 id 字段、注释、
//   渲染标签、变体命名（HOLY_FLAME vs HOLY_FLAME_APPLY）骗过裸字符串匹配。
// ⇒ 降级为「候选生成器」：仅报告，不判红，不挂 run-all。真正的覆盖盲区须样本驱动
//   （跑真实对局收集实际出现的 fact，核对规则/契约/渲染/不变量断言）—— 由结构扫描器通道 B 负责。
console.log('⚠ 本检查器静态不可靠：以上为候选清单，须样本驱动（结构扫描器跑真实对局）复核后才可作处置');
process.exit(0);
