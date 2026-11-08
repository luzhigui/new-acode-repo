// V1.0.0 | 2026-11-08：海克斯强化「配置 ↔ 消费方 ↔ 运行期」三段对账守门（新增）
//   由来：content/002-hex-enhance.json 是小昭·姊（团队 buff 生效中）/小昭·妹（永久）强化的唯一真源，
//   但此前只有 hex-boot-chain-guard 盯「文件加载链路」，没有一件盯「配置里的每个键到底有没有被代码读」。
//   本件回答三个问题（全部静态/离线，不跑战局）：
//     ① 接线：每个 sister/brother 键是否至少有一个消费方？消费方引用的键是否都在 002 里？
//     ② 缺键语义：002 缺 sister 段 → getSkillParams 必须抛；缺 brother 段 → 返回 null 回落普通版；
//        缺子键时哪些路径有显式 throw、哪些只会 TypeError（后者的静默风险记入报告）。
//     ③ 档位：双海克斯体检默认（121）与主游戏按钮（702）/跑批入口（206）的接线是否还在。
//   铁律：只读文件 + 只调用导出函数，绝不改主代码；有问题只点名，不自动修。
export const VER = 'tests/hex-enhance-wiring-guard.mjs V1.0.0';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const P002 = path.join(root, 'content', '002-hex-enhance.json');
const P001 = path.join(root, 'content', '001-game-data.json');

const problems = [];
const notes = [];

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}
function walk(dir, out) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name === 'node_modules' || ent.name === '.mut' || ent.name === '.git' || ent.name === '.tmp') continue;
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p, out);
        else if (/\.(js|mjs)$/.test(ent.name)) out.push(p);
    }
    return out;
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// ── ⓪ 数据面 ───────────────────────────────────────────────────────────
let hex, game;
try { hex = JSON.parse(fs.readFileSync(P002, 'utf8')); } catch (e) { problems.push('⓪ 002 解析失败：' + e.message); }
try { game = JSON.parse(fs.readFileSync(P001, 'utf8')); } catch (e) { problems.push('⓪ 001 解析失败：' + e.message); }
const baseKeys = (game && game.buffs) ? Object.keys(game.buffs) : [];
const sisterKeys = (hex && hex.sister) ? Object.keys(hex.sister) : [];
const brotherKeys = (hex && hex.brother) ? Object.keys(hex.brother) : [];
if (!baseKeys.length) problems.push('⓪ 001 buffs 键集为空');
notes.push(`⓪ 配置面：普通海克斯 ${baseKeys.length} 键 / sister ${sisterKeys.length} 键 / brother ${brotherKeys.length} 键`);

// ── ① 接线对账：配置键 ↔ 代码引用 ──────────────────────────────────────
const scanDirs = ['core', 'modules', 'player', 'ui', 'render', 'infra', 'fx']
    .map(d => path.join(root, d)).filter(d => fs.existsSync(d));
const sources = [];
for (const d of scanDirs) walk(d, sources);

// BUFF_TYPES 枚举名 → 值（query('xiaoHexEnhance', …, BUFF_TYPES.X) 的动态派发也算消费）
const enumMap = {};
try {
    const src = read('infra/106-battle-enums.js');
    const mm = src.match(/export const BUFF_TYPES\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/);
    if (mm) for (const m of mm[1].matchAll(/([A-Z_]+)\s*:\s*'([^']+)'/g)) enumMap[m[1]] = m[2];
} catch (e) { /* 枚举文件缺失由其他规则点名 */ }

const refs = { sister: {}, brother: {} };
function addRef(section, key, where) {
    if (!key) return;
    if (!refs[section][key]) refs[section][key] = [];
    refs[section][key].push(where);
}
for (const f of sources) {
    const rel = path.relative(root, f).replace(/\\/g, '/');
    const src = stripComments(fs.readFileSync(f, 'utf8'));
    for (const m of src.matchAll(/getSisterHexEnhance\s*\(\s*'([A-Za-z0-9_]+)'/g)) addRef('sister', m[1], rel);
    for (const m of src.matchAll(/getBrotherHexEnhance\s*\(\s*'([A-Za-z0-9_]+)'/g)) addRef('brother', m[1], rel);
    // getSkillParams('小昭','hexEnhance').key / ?.key
    for (const m of src.matchAll(/getSkillParams\s*\(\s*'小昭'\s*,\s*'hexEnhance'\s*\)\s*[?.]*\.\s*([A-Za-z_$][\w$]*)/g)) {
        addRef('sister', m[1], rel);
    }
    // const hexEnhanceParams = getSkillParams(...)  → hexEnhanceParams.key
    // 只认「键名属于 15 个真实海克斯」的属性，避免把同名变量的无关字段（.js/.find/.length…）算成消费方
    for (const m of src.matchAll(/([A-Za-z_$][\w$]*)\s*=\s*getSkillParams\s*\(\s*'小昭'\s*,\s*'hexEnhance'\s*\)/g)) {
        const varName = m[1];
        const re = new RegExp(varName.replace(/[$]/g, '\\$&') + '\\s*[?.]*\\.\\s*([A-Za-z_$][\\w$]*)', 'g');
        for (const k of src.matchAll(re)) {
            if (baseKeys.indexOf(k[1]) >= 0) addRef('sister', k[1], rel);
        }
    }
    // query('xiaoHexEnhance', …, BUFF_TYPES.X)
    for (const m of src.matchAll(/query\s*\(\s*'xiaoHexEnhance'[\s\S]{0,240}?BUFF_TYPES\.([A-Z_]+)/g)) {
        const v = enumMap[m[1]];
        if (v) addRef('sister', v, rel);
        else problems.push('① ' + rel + ' 传了未登记的 BUFF_TYPES.' + m[1] + '（无法对账海克斯键）');
    }
}

for (const section of ['sister', 'brother']) {
    const cfgKeys = section === 'sister' ? sisterKeys : brotherKeys;
    cfgKeys.forEach(k => {
        if (!refs[section][k]) notes.push(`⚠ ${section}.${k} 没有任何代码消费方（改配置不会改变战局，属"形同虚设"项）`);
    });
}
for (const section of ['sister', 'brother']) {
    const cfgKeys = section === 'sister' ? sisterKeys : brotherKeys;
    Object.keys(refs[section]).forEach(k => {
        if (cfgKeys.indexOf(k) < 0) problems.push(`① 代码引用 ${section}.${k}，但 002 里没有该键（消费方会拿到 undefined）`);
    });
}

// ── ② 缺键语义（运行期实证，fresh 201 实例 + fetch shim） ───────────────
const realFetch = globalThis.fetch;
let MUTATE = 'none';
globalThis.fetch = async (url) => {
    const p = fileURLToPath(url);
    if (/002-hex-enhance\.json$/.test(p)) {
        let data = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (MUTATE === 'no-sister') delete data.sister;
        else if (MUTATE === 'no-brother') delete data.brother;
        else if (MUTATE === 'no-holyFlame') delete data.sister.holyFlame;
        return { ok: true, status: 200, json: async () => data };
    }
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) };
};

// 2a 正常接线：每个 sister/brother 键都能被 201 取到
try {
    const cfg = await import('../core/201-config-5v5-test.js');
    await cfg.loadGameData();
    await cfg.loadHexEnhanceData();
    const s = cfg.getSkillParams('小昭', 'hexEnhance');
    if (!s || !Object.keys(s).length) problems.push('② 正常配置下 getSkillParams(小昭,hexEnhance) 返回空');
    sisterKeys.forEach(k => {
        const v = cfg.getSisterHexEnhance(k);
        if (!v || !same(v, hex.sister[k])) problems.push(`② getSisterHexEnhance(${k}) 与 002 不一致或取不到`);
    });
    brotherKeys.forEach(k => {
        const v = cfg.getBrotherHexEnhance(k);
        if (!v || !same(v, hex.brother[k])) problems.push(`② getBrotherHexEnhance(${k}) 与 002 不一致或取不到`);
    });
    notes.push('② 正常配置：sister/brother 全部键运行期可取、内容一致');
} catch (e) {
    problems.push('② 正常配置加载失败：' + e.message);
}

// 2b 缺 sister 段 → getSkillParams 必须抛（不许回落普通版）
MUTATE = 'no-sister';
try {
    const cfg2 = await import('../core/201-config-5v5-test.js?mut=no-sister');
    await cfg2.loadHexEnhanceData();
    let threw = false, msg = '';
    try { cfg2.getSkillParams('小昭', 'hexEnhance'); } catch (e) { threw = true; msg = e.message; }
    if (!threw) problems.push('② 002 缺 sister 段时 getSkillParams(小昭,hexEnhance) 未抛错 —— 静默回落普通版，强化失效无告警');
    else if (!/缺 sister/.test(msg)) problems.push('② 缺 sister 段抛错信息不含「缺 sister」（无法归因）：' + msg);
    else notes.push('② 缺 sister 段：getSkillParams 抛错（显式护栏在）');
} catch (e) {
    problems.push('② 缺 sister 段场景加载失败：' + e.message);
}

// 2c 缺 brother 段 → 返回 null（设计为回落普通版，不抛）
MUTATE = 'no-brother';
try {
    const cfg3 = await import('../core/201-config-5v5-test.js?mut=no-brother');
    await cfg3.loadHexEnhanceData();
    let threw = false;
    try { cfg3.getSkillParams('小昭', 'hexEnhance'); } catch (e) { threw = true; }
    if (threw) problems.push('② 002 缺 brother 段时 getSkillParams 抛错 —— 妹永久缺失会整局崩，应按设计回落');
    if (cfg3.getBrotherHexEnhance('cloudBody') !== null) problems.push('② 缺 brother 段时 getBrotherHexEnhance 未返回 null');
    notes.push('② 缺 brother 段：getSkillParams 不抛、getBrotherHexEnhance 返回 null（回落到普通版=设计行为）');
} catch (e) {
    problems.push('② 缺 brother 段场景加载失败：' + e.message);
}

// 2d 缺子键（sister.holyFlame）→ 201 层不抛，消费方读 .atkCols 只会 TypeError（显式护栏缺口，记报告）
MUTATE = 'no-holyFlame';
try {
    const cfg4 = await import('../core/201-config-5v5-test.js?mut=no-holyFlame');
    await cfg4.loadHexEnhanceData();
    const s4 = cfg4.getSkillParams('小昭', 'hexEnhance');
    if (s4 && s4.holyFlame === undefined) {
        notes.push('⚠ 缺子键语义：sister.holyFlame 缺失时 201 不抛、返回 undefined；215/317 直接读 .atkCols/.atkBonus 只会 TypeError（非显式报错）');
    } else {
        problems.push('② 缺子键场景与预期不符（holyFlame 仍存在）');
    }
} catch (e) {
    problems.push('② 缺子键场景加载失败：' + e.message);
} finally {
    MUTATE = 'none';
    globalThis.fetch = realFetch;
}

// 2e 运行期派发实证：姊在场 + 该海克斯生效 → getXiaoZhaoHexEnhance 必须吐出 002 里对应的强化段
try {
    const m302 = await import('../modules/302-elite-skills.js');
    const withSister = [{ isXiaoZhaoSister: true, alive: true }];
    baseKeys.forEach(k => {
        let got = null;
        try { got = m302.getXiaoZhaoHexEnhance(withSister, [{ key: k }], k); }
        catch (e) { problems.push('② getXiaoZhaoHexEnhance(' + k + ') 抛错：' + e.message); return; }
        if (!hex.sister[k]) { notes.push('⚠ 002 缺 sister.' + k + '，姊强化对该海克斯不生效（返回 null）'); return; }
        if (!same(got, hex.sister[k])) problems.push('② 姊在场+海克斯生效时，' + k + ' 取到的强化段与 002 不一致');
    });
    const noSister = m302.getXiaoZhaoHexEnhance([{ isXiaoZhaoSister: false, alive: true }], [{ key: 'hotBlood' }], 'hotBlood');
    if (noSister !== null) problems.push('② 姊不在场时 getXiaoZhaoHexEnhance 仍返回强化段（强化会无条件生效）');
    if (baseKeys.length && baseKeys.every(k => refs.sister[k] || !hex.sister[k])) {
        notes.push('② 姊强化派发实证：' + Object.keys(hex.sister).length + ' 个海克斯逐键取到、无姊时返回 null');
    }
} catch (e) {
    problems.push('② 姊强化派发链路加载失败：' + e.message);
}

// 2g 效果层实证：强化参数是否真的落到「加成的数值」上（不只看数据取得到）
try {
    const eff = await import('../core/215-buff-effects.js');
    const s = hex.sister, b = hex.brother;
    // 流云身法：姊闪避加成必须等于 002 声明值（普通版是 0.25）
    if (!same(eff.applyCloudBodyDodge_Sister(), s.cloudBody.dodgeBonus)) {
        problems.push('② 姊·流云身法实际闪避加成 ≠ 002 声明的 ' + s.cloudBody.dodgeBonus);
    }
    // 妹永久流云身法：闪避率 = 普通加成 × brother.cloudBody.dodgeRatio（倍率口径，不是绝对值）
    const expectBrotherDodge = game.buffs.cloudBody.dodgeBonus * b.cloudBody.dodgeRatio;
    if (!same(eff.applyCloudBodyDodge_Brother(), expectBrotherDodge)) {
        problems.push('② 妹·流云身法实际闪避率 ≠ 普通加成×' + b.cloudBody.dodgeRatio + '（期望 ' + expectBrotherDodge + '）');
    }
    // 圣火令：姊在场时按列加攻必须吃 sister.holyFlame.atkBonus（不是普通版 0.3）
    const unit = { name: '测试甲', pos: 1, camp: 'ming', state: {}, _mods: { atk: [], def: [] } };
    const log = [];
    eff.applyHolyFlame_Sister(unit, [unit], [{ key: 'holyFlame', cols: [1], rows: [] }], log);
    const mod = (unit._mods.atk || [])[0];
    if (!mod || !same(mod.value, s.holyFlame.atkBonus)) {
        problems.push('② 圣火令·姊命中攻击列后，实际加成 = ' + JSON.stringify(mod && mod.value) + '，002 声明 ' + s.holyFlame.atkBonus);
    } else {
        notes.push('② 效果层实证：姊流云身法 ' + s.cloudBody.dodgeBonus + ' / 圣火令 ' + s.holyFlame.atkBonus + ' 已落到实际加成');
    }
} catch (e) {
    problems.push('② 效果层调用失败：' + e.message);
}

// 2f 显式 throw 护栏是否仍在（静态点名）
const guardFiles = [
    ['modules/329-buff-tools.js', '002-hex-enhance.json 缺 sister.', 'sister.<key>.extraDuration 显式 throw'],
    ['modules/302-elite-skills.js', "缺技能参数: 小昭.hexEnhance", '缺整段显式 throw'],
    ['modules/317-elite-mingjiao.js', "缺技能参数: 小昭.hexEnhance", '缺整段显式 throw']
];
for (const [rel, needle, label] of guardFiles) {
    if (!exists(rel)) { problems.push('② 护栏文件缺失：' + rel); continue; }
    if (!read(rel).includes(needle)) problems.push('② ' + rel + ' 的「' + label + '」护栏被删（缺键将静默失效/TypeError）');
}

// ── ③ 单/双海克斯档位接线 ──────────────────────────────────────────────
const tier = [
    ['tests/121health-monitor.js', "let hexModeResolved = 'dual'", '体检默认双海克斯'],
    ['tests/121health-monitor.js', "hexMode=single", '保留 ?hexMode=single 单档入口'],
    ['ui/702-main-5v5-test.js', 'btnGameEnemyHex', '主游戏双海克斯按钮'],
    ['ui/702-main-5v5-test.js', "enemyAutoHex', true", '按钮置 enemyAutoHex=true'],
    ['core/206-battle-runner.js', 'enemyHexPicker', '跑批双海克斯入口'],
    ['player/503-player-core.js', 'enemyAutoHex', '主流程读 enemyAutoHex']
];
for (const [rel, needle, label] of tier) {
    if (!exists(rel)) { problems.push('③ 档位文件缺失：' + rel); continue; }
    if (!read(rel).includes(needle)) problems.push('③ ' + rel + ' 缺「' + label + '」（<' + needle + '>）—— 双海克斯链路被拆/默认退回单档');
}
if (!exists('tests/rules-replay.mjs') || !read('tests/rules-replay.mjs').includes('enemyHexPicker')) {
    notes.push('⚠ 回放器（rules-replay）只跑单海克斯：enemyHexPicker 未接，双档仅由浏览器体检 121 覆盖');
}

// ── ④ 文案/注释漂移（只记报告，不判红） ────────────────────────────────
try {
    if (read('core/201-config-5v5-test.js').includes('缺字段代码回落到 CONFIG.BUFFS')) {
        notes.push('⚠ 201 顶部注释仍写「缺字段回落到 CONFIG.BUFFS」，但 getSkillParams 缺 sister 段实际是**抛错**（注释过时）');
    }
} catch (e) { /* 文件缺失已由别处点名 */ }

// ── 结论 ────────────────────────────────────────────────────────────────
for (const n of notes) console.log('  · ' + n);
if (problems.length) {
    console.log(`\n❌ 海克斯强化接线守门失败：${problems.length} 条`);
    problems.forEach(p => console.log('  ✗ ' + p));
    console.log('RESULT: FAIL');
    process.exit(1);
}
console.log('\n✅ 海克斯强化接线守门通过（配置↔消费方↔运行期三段一致）');
console.log('RESULT: PASS');
