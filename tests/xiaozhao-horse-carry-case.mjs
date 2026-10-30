// V1.0.0 | 2026-10-31 夜间第 165 轮：xiaoZhaoHorse / xiaoZhaoCarryApply 两条 ⑤b-2 的定向取证（新增观察项）
//   承接第 164 轮【最高·下轮】：⑤b-2 剩 3 条（xiaoZhaoHorse / spiderDeadTarget / xiaoZhaoCarryApply）
//   逐个配定向用例。spiderDeadTarget 上轮已由 spider-dead-target-case 实证（338 进池 / 0 命中），
//   本件接手剩下两条。
//
//   ★ 动手前先纠正登记口径本身的一处错（这正是第 162 轮那款「只数了一个发射点」的近亲）：
//     fact-emission-census 把这两条记成「要**妹**永久巨马阵 / 妹永久 carry」，
//     易读成「得先让小昭·妹在队 ⇒ 干净树里没有 ⇒ 归 ⑤b-2 非样本缺口」。
//     但读源码：两个发射点都在 **modules/27elite-mingjiao-xiaozhao-brother.js**（L249 / L274 附近），
//     判据读的是 **bro.state._permanentBuffs**（兄自己的永久表），而 addPermanentBuff
//     （modules/20elite-skills.js L258）的门槛也是 `xiaoZhao.isXiaoZhaoBrother`。
//     ⇒ 也就是说这两条**不需要妹在队**，forceXiaoZhao='brother' 这条第 162 轮就在用的现成通道
//     直接适用，**根本不必等变异树**。⇒ 它们当初被归进 ⑤b-2 的理由，很可能是没找对通道。
//
//   ★ 本件因此新加一道别处没有的**白名单自证**（段一 ③）：
//     addPermanentBuff 有 `CONFIG.XIAO_ZHAO_PERMANENT_BUFFS.includes(buffKey)` 这道闸，
//     键不在白名单里 ⇒ 永久表**永远**不可能有它 ⇒ 发射点是**真·结构死代码**（可提核销）；
//     键在白名单里 ⇒ 属「样本/概率问题」，按 ⑤b-2 的规矩不许核销。
//     ⇒ 这一条决定了 ⑤b-2 的定性，而它此前从没被任何脚本数过。
//
//   三段结构沿用 phantom-confuse-brother-case（段一静态自证 / 段二定向扫描 / 段三通道取证）：
//     段一 静态自证：逐个点名两处发射点的前置；核 201 配置真有值；核白名单含不含这两个键。
//     段二 定向扫描：forceXiaoZhao='brother' 跑满场次，逐层剥前置计数
//       ① 兄在队且存活  ② 兄 _permanentBuffs 含该键  ③ 团队 _activeBuffs 无该键（!teamHasX）
//       （④ 那一掷 rng 在主代码内部，外部不可见 ⇒ 只能给期望值，不给结论）
//     段三 通道取证与反向棘轮：
//       · ② 恒 0 ⇒ UNKNOWN，不许核销（永久 buff 压根没抽到，零命中既不能证死也不能证活）；
//       · ②③ 就绪 N 次而观测 0 且 N ≥ 下限 ⇒ **疑似隐匿失效**（该发没发），按第 163 轮立的规矩
//         禁止提核销（删一条还在服役的发射点比留着危险）；
//       · 观测 > 0 ⇒ 链条成立，须从 ⑤b-2 挪进 ⑤b-3（本件只点名，不代改 census）。
export const VER = 'tests/xiaozhao-horse-carry-case.mjs V1.0.0';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 环境 mock（不改引擎源码，Node 补浏览器能力）—— 必须在任何引擎 import 之前
globalThis.fetch = async (url) => {
    const p = fileURLToPath(new URL(url));
    const text = fs.readFileSync(p, 'utf8');
    return { ok: true, json: async () => JSON.parse(text) };
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.self = globalThis;

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const SEEDS_N = Number(process.env.SEEDS_N || 20);
const STAGES = [1, 2, 3, 4, 5, 6, 7];
const MIN_ENTER = 10;                                    // 全前置就绪下限，低于即不许下结论
const SCAN_ONLY = process.argv.includes('--scan');

// ── 段一 静态自证（不跑战斗，直接读源码）────────────────────────────────
const SRC = path.join(root, 'modules/27elite-mingjiao-xiaozhao-brother.js');
const src = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);
const reasons = [];

function auditPoint(label, factConst, buffConst, cfgPath, extraNeed) {
    const out = { label, line: -1, need: [] };
    const idx = src.findIndex(l => l.includes(factConst));
    if (idx < 0) {
        reasons.push('modules/27elite-mingjiao-xiaozhao-brother.js 里找不到 ' + factConst + ' 发射点（分支被删 / 改名）');
        return out;
    }
    out.line = idx + 1;
    const win = src.slice(Math.max(0, idx - 16), idx + 1).join('\n');
    const need = [
        ['团队无该 buff 才进（!teamHasX）', new RegExp('!' + buffConst.replace('teamHas', 'teamHas')).test(win)
            || /!teamHas|!hasTeam/.test(win)],
        ['永久表判据走 bro.state._permanentBuffs', /bro\.state\._permanentBuffs\?\.some\(b\s*=>\s*b\.key\s*===\s*BUFF_TYPES\./.test(win)],
        ['概率/层数读 201 ' + cfgPath, /getBrotherHexEnhance\(/.test(win)]
    ];
    for (const extra of (extraNeed || [])) need.push(extra);
    out.need = need;
    for (const [name, ok] of need) if (!ok) reasons.push('「' + label + '」前置「' + name + '」在源码里对不上（形状已变，旧结论作废）');
    return out;
}

const aHorse = auditPoint('妹永久巨马阵', 'FACT_TYPES.XIAO_ZHAO_HORSE', 'teamHasHorse', 'brother.horseFormation.spawnChance', [
    ['召马成功后才发 fact（spawnHorse 非空）', /spawnHorse\(/.test(src.join('\n'))]
]);
const aCarry = auditPoint('妹永久carry', 'FACT_TYPES.XIAO_ZHAO_CARRY_APPLY', 'hasTeamCarry', 'brother.carry.layersBase', [
    ['层数按 r1/r2 阵亡数换算', /layersPerR1/.test(src.join('\n'))]
]);

console.log('--- 段一 静态自证（modules/27elite-mingjiao-xiaozhao-brother.js）---');
for (const a of [aHorse, aCarry]) {
    console.log('  [' + a.label + '] 发射点 L' + a.line);
    for (const [name, ok] of a.need) console.log('    ' + (ok ? '✅' : '❌') + ' ' + name);
}
// ★ 本轮新增：白名单自证 —— 决定这两条到底是「真死代码」还是「样本问题」
let whitelist = [];
try {
    const gd = JSON.parse(fs.readFileSync(path.join(root, 'content/200game-data.json'), 'utf8'));
    whitelist = (gd && gd.hexes && gd.hexes.permanentBuffKeys) || [];
} catch (e) {
    reasons.push('content/200game-data.json 读取/解析失败: ' + e.message);
}
const wlHas = { horseFormation: whitelist.includes('horseFormation'), carry: whitelist.includes('carry') };
console.log('  ③ 永久 buff 白名单（addPermanentBuff 的唯一入口，共 ' + whitelist.length + ' 键）：'
    + ' horseFormation ' + (wlHas.horseFormation ? '✅ 在白名单' : '❌ 不在')
    + ' / carry ' + (wlHas.carry ? '✅ 在白名单' : '❌ 不在'));
if (!wlHas.horseFormation) reasons.push('horseFormation 不在永久白名单 ⇒ 永久表永不会有它 ⇒ xiaoZhaoHorse 属真·结构死代码（可提核销）');
if (!wlHas.carry) reasons.push('carry 不在永久白名单 ⇒ 永久表永不会有它 ⇒ xiaoZhaoCarryApply 属真·结构死代码（可提核销）');
// 数据面：201 配置必须有值（缺则主代码直接抛错，不是"概率为 0"）
let spawnChance = null, carryCfg = null;
try {
    const hex201 = JSON.parse(fs.readFileSync(path.join(root, 'content/201hex-enhance.json'), 'utf8'));
    spawnChance = hex201?.brother?.horseFormation?.spawnChance;
    carryCfg = hex201?.brother?.carry || null;
    if (spawnChance == null) reasons.push('content/201hex-enhance.json 缺 brother.horseFormation.spawnChance（主代码会直接抛错）');
    else console.log('  ✅ 201 brother.horseFormation.spawnChance = ' + spawnChance);
    if (!carryCfg || carryCfg.layersBase == null) reasons.push('content/201hex-enhance.json 缺 brother.carry.layersBase');
    else console.log('  ✅ 201 brother.carry.layersBase = ' + carryCfg.layersBase);
} catch (e) {
    reasons.push('content/201hex-enhance.json 读取/解析失败: ' + e.message);
}
const sp = { ok: reasons.length === 0, reasons };

// ── 段二 定向扫描 ────────────────────────────────────────────────────────
const [{ CONFIG, loadGameData, loadHexEnhanceData }, { SeededRNG }, { createRoundStepper },
    { initBattleTeams }, { GlobalStore }, { FACT_TYPES: FT }, { BUFF_TYPES }] = await Promise.all([
    import('../core/01config-5v5-test.js'),
    import('../infra/51-core-utils.js'),
    import('../core/11battle-round.js'),
    import('../modules/29battle-init.js'),
    import('../infra/54-global-store.js'),
    import('../infra/56-battle-enums.js'),
    import('../infra/56-battle-enums.js')
]);
await import('../modules/25elite-imperial.js');
await import('../modules/26elite-sixsects.js');
await import('../modules/27elite-mingjiao.js');
await import('../modules/30custom-effects.js');
await loadGameData();
await loadHexEnhanceData();

// ★ 第 163/164 轮教训：fact 采集一律走公共件，覆盖 log 顶层 + data.entries + data.phantomFact 三层，
//   自己再手写一遍只会再造一个新洞（第 164 轮守门点名过 7 个漏网脚本）。
const { collectFacts } = await import('./_lib/fact-collect.mjs');

const { createSignalProbe } = await import('./_lib/signal-probe.mjs');
void createSignalProbe;
const { tickAndPickBuffs } = await import('./_lib/buff-picker.mjs');
const MAX_ROUND = CONFIG.MAX_ROUND || 35;

function hasActiveBuff(side, key) {
    const arr = side && side._activeBuffs;
    return !!(arr && arr.some(b => b && b.key === key));
}
function permHas(u, key) {
    return !!(u && Array.isArray(u.state && u.state._permanentBuffs)
        && u.state._permanentBuffs.some(b => b.key === key));
}

// 逐层剥前置（回合级保守下界：一整回合只计 1 次）
const L = {
    horse: { bro: 0, perm: 0, ready: 0, readyNoEgg: 0, hit: 0 },
    carry: { bro: 0, perm: 0, ready: 0, readyNoEgg: 0, hit: 0 }
};
const samples = { horse: [], carry: [] };

function runBattle(seed, stage) {
    GlobalStore.set('forceXiaoZhao', 'brother');
    const rng = new SeededRNG(seed);
    const { allyTeam, enemyTeam } = initBattleTeams(stage, rng);
    let battleState = {
        ally: allyTeam.map(u => u.clone()),
        enemy: enemyTeam.map(u => u.clone()),
        round: 1, activeBuffs: [],
        allAllies: allyTeam.map(u => u.clone()), _rng: rng
    };
    battleState.activeBuffs = tickAndPickBuffs([], battleState.ally, battleState.enemy, 1, seed, true);
    let lastStep = null, winner = null;
    while (battleState.round <= MAX_ROUND) {
        const bro = battleState.ally.find(u => u.isXiaoZhaoBrother && u.alive);
        if (bro) {
            // ① 兄在队且存活
            L.horse.bro++; L.carry.bro++;
            // ③b 早退闸：L234 `if (bro.state._spiderEgg) return;` 在两条发射点**之前**，
            //   兄处于蛛卵态时整段直接返回 ⇒ 此时外面看着「前置全齐」，里面其实根本没走到。
            //   ★ 不数这一层就会把「早退」误报成「该发没发」（第 163 轮教训：先查测量口径）。
            const noEgg = !bro.state._spiderEgg;
            // ② 永久表含该键
            if (permHas(bro, BUFF_TYPES.HORSE_FORMATION)) {
                L.horse.perm++;
                // ③ 团队无该 buff
                if (!hasActiveBuff(battleState.ally, BUFF_TYPES.HORSE_FORMATION)) {
                    L.horse.ready++;
                    if (noEgg) L.horse.readyNoEgg++;
                }
            }
            if (permHas(bro, BUFF_TYPES.CARRY)) {
                L.carry.perm++;
                if (!hasActiveBuff(battleState.ally, BUFF_TYPES.CARRY)) {
                    L.carry.ready++;
                    if (noEgg) L.carry.readyNoEgg++;
                }
            }
        }
        for (const step of createRoundStepper(battleState)) {
            lastStep = step;
            const facts = [];
            collectFacts(step.log || [], facts);
            for (const f of facts) {
                if (f.factType === FT.XIAO_ZHAO_HORSE) {
                    L.horse.hit++;
                    if (samples.horse.length < 5) samples.horse.push({ seed, stage, round: battleState.round });
                } else if (f.factType === FT.XIAO_ZHAO_CARRY_APPLY) {
                    L.carry.hit++;
                    if (samples.carry.length < 5) samples.carry.push({ seed, stage, round: battleState.round, layers: f.data && f.data.layers });
                }
            }
            if (step.winner) winner = step.winner;
        }
        if (winner || !lastStep) break;
        const nextRoundNo = battleState.round + 1;
        const nextActiveBuffs = tickAndPickBuffs(battleState.activeBuffs, lastStep.ally, lastStep.enemy,
            battleState.round, seed, battleState.round % 3 === 0);
        battleState = {
            ally: lastStep.ally.map(u => u.clone()),
            enemy: lastStep.enemy.map(u => u.clone()),
            round: nextRoundNo,
            activeBuffs: nextActiveBuffs,
            allAllies: battleState.allAllies, _rng: rng
        };
    }
    GlobalStore.set('forceXiaoZhao', null);
}

const seeds = Array.from({ length: SEEDS_N }, (_, i) => i + 1);
let battles = 0;
for (const seed of seeds) {
    for (const stage of STAGES) {
        battles++;
        await runBattle(seed, stage);
    }
}

console.log('--- 段二 定向扫描（forceXiaoZhao=brother，' + battles + ' 场）---');
for (const k of ['horse', 'carry']) {
    const name = k === 'horse' ? 'xiaoZhaoHorse' : 'xiaoZhaoCarryApply';
    const d = L[k];
    console.log('  [' + name + '] ①兄存活 ' + d.bro + ' 回合 → ②永久表含该键 ' + d.perm
        + ' → ③团队无该 buff ' + d.ready + ' → ③b再过蛛卵早退闸 ' + d.readyNoEgg
        + ' → 观测到 fact ' + d.hit + ' 次');
    if (samples[k].length) console.log('    样例 ' + JSON.stringify(samples[k].slice(0, 3)));
}

// ── 段三 通道取证与反向棘轮 ──────────────────────────────────────────────
console.log('--- 段三 通道取证（反向棘轮：不许拿零命中当核销依据）---');
const fails = [];
if (!sp.ok) fails.push('段一 静态自证未通过（结论前提失效，须人工复核）：' + sp.reasons.join('；'));

const verdict = {};
for (const k of ['horse', 'carry']) {
    const name = k === 'horse' ? 'xiaoZhaoHorse' : 'xiaoZhaoCarryApply';
    const wlOk = k === 'horse' ? wlHas.horseFormation : wlHas.carry;
    const d = L[k];
    console.log('  [' + name + ']');
    if (!wlOk) {
        verdict[k] = 'DEAD_BY_WHITELIST';
        console.log('    ⚠️ 该键不在永久白名单 ⇒ addPermanentBuff 永不写入 ⇒ 发射点**结构上恒不可达**'
            + '（与 ⑤b-2「非样本缺口」不是一回事，属真死代码，可提核销 —— 但须人工拍板）');
    } else if (d.perm === 0) {
        verdict[k] = 'UNKNOWN_NO_PERM';
        console.log('    ⚠️ UNKNOWN（不许提核销）：' + battles + ' 场里兄**一次都没拿到**该永久 buff'
            + ' ⇒ 发射点从未被走到，零命中既不能证死也不能证活（第 161 轮立的规矩）');
    } else if (d.readyNoEgg === 0 && d.ready > 0) {
        verdict[k] = 'UNKNOWN_ALL_EGG';
        console.log('    ⚠️ UNKNOWN（不许提核销）：全部 ' + d.ready + ' 次就绪回合都卡在 L234 的蛛卵早退闸上'
            + ' ⇒ 发射点一次都没被走到，零命中既不能证死也不能证活（第 161 轮立的规矩）');
    } else if (d.hit > 0) {
        verdict[k] = 'ALIVE';
        console.log('    ✅ 链条成立：过蛛卵闸后全前置就绪 ' + d.readyNoEgg + ' 次 / 命中 ' + d.hit + ' 次'
            + ' ⇒ **不是死代码**，须从 fact-emission-census 的 ⑤b-2 挪进 ⑤b-3（本件只点名，不代改）');
        // ★ 差额观察（只报不判）：carry 那一条没有概率门槛，就绪数应等于命中数；
        //   若不相等说明还有一道本件没枚举到的内闸（主代码待拍板，本件不代改、不据此开红）。
        if (k === 'carry' && d.readyNoEgg > d.hit) {
            console.log('    🔎 差额观察（不计退码，交人工）：carry 无概率门槛，就绪 ' + d.readyNoEgg
                + ' 次却只命中 ' + d.hit + ' 次 ⇒ 之间还有一道本件没枚举到的内闸。'
                + '按第 163 轮教训先疑**测量口径**再疑产品，故只点名不开红。'
                + '最可能同源**疑点甲**（第 162 轮挂账、仍待拍板）：发射点取的 bro 来自 data.A 的 find，'
                + '而单位每回合 clone ⇒ 其 _permanentBuffs 可能是**旧对象**（判据读到空表），'
                + '本件外层的 ③ 用的是本回合新克隆，故两边对不上。**不据此改主代码，只交拍板。**');
        }
    } else if (d.readyNoEgg >= MIN_ENTER) {
        verdict[k] = 'SUSPECT_SILENT';
        fails.push('★ 疑似隐匿失效，不是结构不可达：' + name + ' 过蛛卵闸后全前置就绪 ' + d.readyNoEgg + ' 次，'
            + (k === 'horse' ? '按 spawnChance ' + spawnChance + ' 期望约 ' + (d.readyNoEgg * (spawnChance || 0)).toFixed(1) + ' 次' : '无概率门槛（层数换算后必发）')
            + ' 却恒为 0 ⇒ 该发没发，两解：(甲) 永久 buff 挂在别的对象上、(乙) 上游更早处短路。'
            + '**两解都禁止按死代码核销**，须先定位。');
        console.log('    ❌ 见上：本是「该发没发」，不是「不可达」。详见 fail 明细。');
    } else {
        verdict[k] = 'BELOW_FLOOR';
        fails.push('覆盖棘轮未达下限：' + name + ' 过蛛卵闸后全前置就绪 ' + d.readyNoEgg + ' 次 < ' + MIN_ENTER
            + ' ⇒ 样本不足以判定，不许下任何结论（要扩样本，不是放宽判据）');
        console.log('    ❌ 见上：样本不足。详见 fail 明细。');
    }
}

console.log('--- 结论 ---');
console.log('  xiaoZhaoHorse = ' + verdict.horse + ' ；xiaoZhaoCarryApply = ' + verdict.carry);
console.log('  ⑤b-2 定性纠正：两条发射点都在**兄模块**、判据读**兄的永久表** ⇒ forceXiaoZhao=brother'
    + ' 这条现成通道即可取证，当初归进「非样本缺口、需变异树」的理由不成立。');

if (SCAN_ONLY) {
    console.log('（--scan 模式：不做棘轮断言）');
    process.exit(0);
}
if (fails.length) {
    console.log('RESULT: FAIL');
    for (const f of fails) console.log('  ❌ ' + f);
    process.exit(1);
}
console.log('RESULT: PASS');
