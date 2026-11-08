// tests/buff-ttl-contract.mjs | V1.0.0 | 2026-11-08（Buff 时长与叠加域）
// 目的：ttl 语义「配置 ↔ 实现」全覆盖对账。之前 227 只在 fact 层看 remaining 递减，回放夹具又只模拟了
//   姊的 extraDuration 三键 ⇒ permanent 若退回 Infinity、姊版流星时长接线断、妹误改时长，全都没有一条规则会红。
// 覆盖四类语义（全部离线、只调导出函数，不跑战局）：
//   ① permanent：remaining = CONFIG.MAX_ROUND（35，有限、会递减；**不是 Infinity**），
//      与 getActiveBuffList 显示「整局」属显示语义分层（35 回合 = 整局上限，实战不会超）；
//   ② 回合数：cfg.duration；无 duration → CONFIG.BUFF_DURATION（4）；
//   ③ 姊强化时长：流星读 002 sister.meteorShower.duration；热血/乘风/众志 = base + extraDuration；
//      其余键（含嗜血/严阵/圣火/摄魂/背水…）不受姊影响；
//   ④ 妹（brother）：002 无任何时长键 ⇒ 所有键时长不变。
// 另有两条结构不变量：CONFIG.XIAO_ZHAO_PERMANENT_BUFFS 必须覆盖所有 permanent 键、且每键都在 CONFIG.BUFFS；
//   tickBuffDurations 逐键「一次 −1、满时长后淘汰」，permanent 不豁免。
// 铁律：只读配置 + 调导出函数，不改主代码；出问题只点名。
export const VER = 'tests/buff-ttl-contract.mjs V1.0.0';

import { fileURLToPath } from 'node:url';

globalThis.fetch = async (url) => {
    const fs = await import('node:fs');
    const p = fileURLToPath(new URL(url));
    const text = fs.readFileSync(p, 'utf8');
    return { ok: true, json: async () => JSON.parse(text) };
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.self = globalThis;

const cfgMod = await import('../core/201-config-5v5-test.js');
await cfgMod.loadGameData();
await cfgMod.loadHexEnhanceData();
const { CONFIG, getSisterHexEnhance } = cfgMod;
const { BUFF_TYPES } = await import('../infra/106-battle-enums.js');
const { setBattleRng } = await import('../core/214-battle-shared.js');
const { createBuffObject, tickBuffDurations, getActiveBuffList } = await import('../modules/329-buff-tools.js');

// 圣火令创建时会抽 cols/rows，给个确定性桩（按序号递增，避免抽到重复列/行导致循环）；
//   仅本离线契约器使用，不影响战局 RNG。
let rngCursor = 0;
setBattleRng({ next: () => 0.5, nextInt: (a, b) => a + ((rngCursor++) % (b - a + 1)) });

const problems = [];
const notes = [];
const EPS = 1e-9;
const MAX_ROUND = CONFIG.MAX_ROUND;
const DEFAULT_DUR = CONFIG.BUFF_DURATION;

// 002 里带 sister.extraDuration 的三个键（与 modules/329 分支逐字一致）
const SISTER_EXTRA = [BUFF_TYPES.HOT_BLOOD, BUFF_TYPES.WIND_ASSAULT, BUFF_TYPES.UNITY];

const sisterTeam = [{ name: '小昭·姊', isXiaoZhaoSister: true, alive: true }];
const brotherTeam = [{ name: '小昭·妹', isXiaoZhaoBrother: true, alive: true }];
const emptyTeam = [];

function baseDuration(cfg) {
    return typeof cfg.duration === 'number' ? cfg.duration : DEFAULT_DUR;
}
function expectNoSister(key, cfg) {
    return cfg.permanent ? MAX_ROUND : baseDuration(cfg);
}
function expectSister(key, cfg) {
    if (cfg.permanent) return MAX_ROUND;
    if (key === BUFF_TYPES.METEOR_SHOWER) {
        const enh = getSisterHexEnhance('meteorShower');
        return enh && typeof enh.duration === 'number' ? enh.duration : null;
    }
    if (SISTER_EXTRA.indexOf(key) !== -1) {
        const enhKey = key === BUFF_TYPES.HOT_BLOOD ? 'hotBlood'
            : (key === BUFF_TYPES.WIND_ASSAULT ? 'windAssault' : 'unity');
        const enh = getSisterHexEnhance(enhKey);
        return (enh && typeof enh.extraDuration === 'number') ? baseDuration(cfg) + enh.extraDuration : null;
    }
    return baseDuration(cfg);
}

// ── ⓪ 数据面 ──────────────────────────────────────────────────────────────
const buffKeys = Object.keys(CONFIG.BUFFS || {});
if (!buffKeys.length) problems.push('⓪ CONFIG.BUFFS 为空（数据未加载）');
if (typeof MAX_ROUND !== 'number' || MAX_ROUND <= 0) problems.push(`⓪ CONFIG.MAX_ROUND 非正数（${String(MAX_ROUND)}）`);
notes.push(`⓪ 配置面：${buffKeys.length} 个 buff 键 / MAX_ROUND=${MAX_ROUND} / BUFF_DURATION=${DEFAULT_DUR}`);

// ① 妹永久白名单 ↔ permanent 键
const white = CONFIG.XIAO_ZHAO_PERMANENT_BUFFS || [];
for (const key of buffKeys) {
    if (CONFIG.BUFFS[key].permanent && white.indexOf(key) === -1) {
        problems.push(`① permanent 键 ${key} 不在 XIAO_ZHAO_PERMANENT_BUFFS（妹账本漏键）`);
    }
}
for (const key of white) {
    if (buffKeys.indexOf(key) === -1) problems.push(`① 白名单键 ${key} 在 CONFIG.BUFFS 里不存在`);
}

// ②③④ 初值：无姊 / 有姊 / 有妹
for (const key of buffKeys) {
    const cfg = CONFIG.BUFFS[key];

    const b0 = createBuffObject(key, null, 'ally', emptyTeam);
    const e0 = expectNoSister(key, cfg);
    if (Math.abs(b0.remaining - e0) > EPS) {
        problems.push(`② ${key} 无姊初值 ${b0.remaining}，配置应为 ${e0}`);
    }
    if (!!b0.permanent !== !!cfg.permanent) problems.push(`② ${key} permanent 标记 ${String(b0.permanent)} 与配置 ${String(cfg.permanent)} 不符`);
    if (cfg.permanent && !isFinite(b0.remaining)) {
        problems.push(`② ${key} permanent 初值必须是有限数（MAX_ROUND=${MAX_ROUND}），实测 ${String(b0.remaining)}`);
    }

    const bS = createBuffObject(key, null, 'ally', sisterTeam);
    const eS = expectSister(key, cfg);
    if (eS == null) {
        problems.push(`③ ${key} 姊强化时长配置缺键（002 应有 duration/extraDuration）`);
    } else if (Math.abs(bS.remaining - eS) > EPS) {
        problems.push(`③ ${key} 有姊初值 ${bS.remaining}，配置应为 ${eS}`);
    }

    const bB = createBuffObject(key, null, 'ally', brotherTeam);
    if (Math.abs(bB.remaining - e0) > EPS) {
        problems.push(`④ ${key} 有妹初值 ${bB.remaining}，002 brother 段无时长键，应保持 ${e0}`);
    }
}

// ⑤ tick 语义：一次 −1、满时长后淘汰；permanent 不豁免
for (const key of buffKeys) {
    const cfg = CONFIG.BUFFS[key];
    const start = expectNoSister(key, cfg);
    let list = [createBuffObject(key, null, 'ally', emptyTeam)];
    let cur = list[0].remaining;
    let steps = 0;
    const guard = start + 5;
    while (list.length && steps < guard) {
        const r = tickBuffDurations(list, -1, () => {});
        list = r.activeBuffs;
        steps++;
        if (list.length) {
            const now = list[0].remaining;
            if (!(now < cur) || Math.abs((cur - now) - 1) > EPS) {
                problems.push(`⑤ ${key} 第${steps}次 tick 剩余 ${cur}→${now}（应恰好 −1）`);
                break;
            }
            cur = now;
        }
    }
    if (steps !== start) {
        problems.push(`⑤ ${key} 从满值 ${start} 起 tick ${steps} 次才淘汰（应恰好 ${start} 次）`);
    }
}

// ⑥ 显示语义：permanent 显示「整局」，但对象值仍是有限的 MAX_ROUND（记录为 note）
const permKeys = buffKeys.filter(k => CONFIG.BUFFS[k].permanent);
for (const key of permKeys) {
    const b = createBuffObject(key, null, 'ally', emptyTeam);
    const text = getActiveBuffList([b]);
    if (!text.includes('整局')) problems.push(`⑥ ${key} 显示语义丢了「整局」（${text}）`);
    if (!isFinite(b.remaining)) problems.push(`⑥ ${key} 显示为整局但 remaining 非有限值（${String(b.remaining)}）`);
}
notes.push(`⑥ 显示语义分层：${permKeys.length} 个 permanent 键显示「整局」，对象 remaining 恒为 ${MAX_ROUND}（有限递减，不是 Infinity）`);

// ── 输出 ─────────────────────────────────────────────────────────────────
console.log(`=== ${VER} ===`);
for (const n of notes) console.log('  ' + n);
if (problems.length) {
    console.log(`\n问题 ${problems.length} 条：`);
    for (const p of problems.slice(0, 20)) console.log('  ✗ ' + p);
    if (problems.length > 20) console.log(`  …（其余 ${problems.length - 20} 条略）`);
    console.log('\nRESULT: FAIL');
    process.exit(1);
}
console.log(`\n${buffKeys.length} 键 ×（无姊 / 有姊 / 有妹 / tick / 显示）全部与配置一致 → RESULT: PASS`);
process.exit(0);
