#!/usr/bin/env node
// tests/hex-config-closure-check.mjs | V1.0.0 | 2026-11-08
//
// 干什么：把海克斯强化做成「配置键 → 消费方 → 实际生效值」的三边闭环检测。
//   179 守的是「002 配置自身完整」，接线守门守的是「键有人读」，本件补最后一环：
//   **改配置值，消费方与效果层必须跟着变** —— 防的是「代码里另抄一份硬编码」这类静默分叉
//   （配置改 0.25→0.40，实战仍按 0.25 算，两边都绿）。
//
// 三段判据：
//   ① 死键/反向（静态）：002 里的键在 core/modules/player/ui/render/infra/fx 是否真的被读；
//      代码读的键（getSister/BrotherHexEnhance('K')）是否都在 002 里。
//      死键 → 提示；反向（读了配置里没有）→ 判红（运行期会拿到 undefined 走回落/TypeError）。
//   ② 派发闭环（运行期）：内存里改 002 的 live 对象值，modules/302 派发必须**原样返回改动后的值**
//      （返回旧值 = 派发层做了深拷贝/缓存，配置热改不生效）。
//   ③ 效果值闭环（运行期）：有数值出口的键（流云身法姊/妹、圣火令姊）改值后，215 实际算出的
//      加成必须等于改动后的值（不等于 = 效果层硬编码，配置不生效）。
//
// 边界：只读代码 + 只在内存里改配置对象（改完立即还原，不碰 content/），不跑整局、不依赖战报。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanHexKeyRefs } from './_lib/hex-key-refs.mjs';

export const VER = 'tests/hex-config-closure-check.mjs V1.0.0';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const P002 = path.join(root, 'content', '002-hex-enhance.json');
const P001 = path.join(root, 'content', '001-game-data.json');

const problems = [];
const notes = [];

const hex = JSON.parse(fs.readFileSync(P002, 'utf8'));
const game = JSON.parse(fs.readFileSync(P001, 'utf8'));
const baseKeys = Object.keys(game.buffs || {});
const sisterKeys = Object.keys(hex.sister || {});
const brotherKeys = Object.keys(hex.brother || {});
notes.push(`⓪ 配置面：普通 ${baseKeys.length} 键 / sister ${sisterKeys.length} 键 / brother ${brotherKeys.length} 键`);

// ── ① 静态：死键与反向（扫描口径与接线守门共用 tests/_lib/hex-key-refs.mjs） ──
const { refs, problems: scanProblems } = scanHexKeyRefs({
    root,
    relDirs: ['core', 'modules', 'player', 'ui', 'render', 'infra', 'fx'],
    baseKeys
});
for (const p of scanProblems) problems.push(p);

const deadSister = sisterKeys.filter(k => !refs.sister[k]);
const deadBrother = brotherKeys.filter(k => !refs.brother[k]);
if (deadSister.length) notes.push('① 死键（002 sister 有、代码不读）：' + deadSister.join(', '));
if (deadBrother.length) notes.push('① 死键（002 brother 有、代码不读）：' + deadBrother.join(', '));
if (!deadSister.length && !deadBrother.length) notes.push('① 死键扫描：0 条（sister/brother 全部有消费方）');

// 反向：代码显式读的键，002 里没有
for (const sec of ['sister', 'brother']) {
    const cfgKeys = sec === 'sister' ? sisterKeys : brotherKeys;
    for (const k of Object.keys(refs[sec])) {
        if (!cfgKeys.includes(k)) problems.push(`① 反向缺口：代码读 ${sec}.${k}，但 002 里没有这个键（运行期拿到 undefined）`);
    }
}

// ── 运行期垫片 ───────────────────────────────────────────────────
globalThis.fetch = async (url) => {
    const p = fileURLToPath(url);
    const text = fs.readFileSync(p, 'utf8');
    return { ok: true, json: async () => JSON.parse(text) };
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.self = globalThis;

const cfg = await import('../core/201-config-5v5-test.js');
await cfg.loadGameData();
await cfg.loadHexEnhanceData();
const eff = await import('../core/215-buff-effects.js');
const m302 = await import('../modules/302-elite-skills.js');
const siteA = [{ isXiaoZhaoSister: true, alive: true }];

// ── ② 派发闭环：改 live 值 → 302 必须返回改动后的值 ─────────────
let dispatchChecked = 0, dispatchSkipped = [];
for (const k of sisterKeys) {
    const live = cfg.getSkillParams('小昭', 'hexEnhance')[k];
    if (!live || typeof live !== 'object') { dispatchSkipped.push(k + ':非对象'); continue; }
    const numKey = Object.keys(live).find(kk => typeof live[kk] === 'number');
    if (!numKey) { dispatchSkipped.push(k + ':无标量值'); continue; }
    const original = live[numKey];
    live[numKey] = original + 0.137;
    const got = m302.getXiaoZhaoHexEnhance(siteA, [{ key: k }], k);
    const seen = got && got[numKey];
    live[numKey] = original;
    if (seen !== original + 0.137) {
        problems.push(`② 派发闭环断：改 sister.${k}.${numKey} 后 302 返回 ${JSON.stringify(seen)}（应 ${original + 0.137}）—— 配置改动不生效`);
    } else dispatchChecked++;
}
notes.push(`② 派发闭环：${dispatchChecked}/${sisterKeys.length} 键实测通过` + (dispatchSkipped.length ? '（跳过：' + dispatchSkipped.join('；') + '）' : ''));

// ── ③ 效果值闭环：改值 → 215 实际加成必须等于新值 ───────────────
function withMut(obj, key, val, fn) {
    const orig = obj[key];
    obj[key] = val;
    try { return fn(); } finally { obj[key] = orig; }
}
const sisterLive = cfg.getSkillParams('小昭', 'hexEnhance');

// ③-1 流云身法（姊）：返回值必须是 002 的直接值
{
    const sentinel = 0.4219;
    const got = withMut(sisterLive.cloudBody, 'dodgeBonus', sentinel, () => eff.applyCloudBodyDodge_Sister());
    if (Math.abs(got - sentinel) > 1e-9) problems.push(`③ 效果值闭环断：sister.cloudBody.dodgeBonus=${sentinel} 时姊闪避返回 ${got}（硬编码或读别的键）`);
    else notes.push(`③ 流云身法(姊)：改 ${sentinel} → 实际 ${got} ✓`);
}
// ③-2 流云身法（妹）：普通闪避 × brother.cloudBody.dodgeRatio
{
    const brotherLive = cfg.getBrotherHexEnhance('cloudBody');
    const sentinel = 0.137;
    const base = game.buffs.cloudBody.dodgeBonus;
    const got = withMut(brotherLive, 'dodgeRatio', sentinel, () => eff.applyCloudBodyDodge_Brother());
    const want = base * sentinel;
    if (Math.abs(got - want) > 1e-9) problems.push(`③ 效果值闭环断：brother.cloudBody.dodgeRatio=${sentinel} 时妹闪避返回 ${got}（应 ${want}）`);
    else notes.push(`③ 流云身法(妹)：改 ${sentinel} → 实际 ${got}（=普通 ${base} × 比值）✓`);
}
// ③-3 圣火令（姊）：atkBonus / defBonus 改值后挂的乘率必须跟着变
{
    const sentinel = 0.3137;
    const unit = { name: '闭环测试甲', pos: 1, camp: 'ming', state: {}, _mods: { atk: [], def: [] } };
    const buff = [{ key: 'holyFlame', cols: [1], rows: [1] }];
    const atk = withMut(sisterLive.holyFlame, 'atkBonus', sentinel, () => {
        unit._mods.atk = [];
        eff.applyHolyFlame_Sister(unit, [unit], buff, []);
        return (unit._mods.atk[0] || {}).value;
    });
    if (Math.abs(atk - sentinel) > 1e-9) problems.push(`③ 效果值闭环断：sister.holyFlame.atkBonus=${sentinel} 时实际加攻 ${atk}`);
    else notes.push(`③ 圣火令(姊)加攻：改 ${sentinel} → 实际 ${atk} ✓`);
    const def = withMut(sisterLive.holyFlame, 'defBonus', sentinel, () => {
        unit._mods.def = [];
        eff.applyHolyFlame_Sister(unit, [unit], buff, []);
        return (unit._mods.def[0] || {}).value;
    });
    if (Math.abs(def - sentinel) > 1e-9) problems.push(`③ 效果值闭环断：sister.holyFlame.defBonus=${sentinel} 时实际加防 ${def}`);
    else notes.push(`③ 圣火令(姊)加防：改 ${sentinel} → 实际 ${def} ✓`);
}
notes.push('③ 覆盖说明：有数值出口的键已实测（流云身法姊/妹、圣火令姊）；其余键经 ② 派发闭环 + 回放规则取证，本件不重复整局。');

// ── 汇总 ─────────────────────────────────────────────────────────
for (const n of notes) console.log(n);
if (problems.length) {
    for (const p of problems) console.log('❌ ' + p);
    console.log('RESULT: FAIL — ' + problems.length + ' 项');
    process.exit(1);
}
console.log('RESULT: PASS');
