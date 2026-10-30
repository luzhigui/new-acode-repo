// V1.0.0 | 2026-10-31 夜间第 162 轮：PHANTOM_CONFUSE 的「小昭·兄」分支定向取证（新增观察项）
//   承接第 161 轮【最高·下轮】：⑤b-2「非样本缺口」那 5 条要逐个配定向用例，phantomReveal /
//   phantomConfuse 优先（两条都被记成「要成昆在队，而 29battle-init 无 forceChengKun」）。
//   ★ 本轮先在源码里翻出一件被漏掉的事：PHANTOM_CONFUSE 有**两个**发射点 —— 除了成昆那条
//     （modules/25elite-imperial.js L196），还有「小昭·兄永久惑心」这条
//     （modules/27elite-mingjiao-xiaozhao-brother.js L203，fact 带 deceiverIsSpider 标记）。
//     ⇒ 也就是说第 160 轮给 phantomConfuse 下的「要成昆在队 ⇒ 干净树本就不发射」这个结论
//       **只看了一个发射点**，而另一条发射点走的是 forceXiaoZhao='brother' —— 现成的定向通道，
//       根本不需要 forceChengKun。若这条能打出 fact，phantomConfuse 就不是死代码，
//       按第 161 轮立的规矩应立刻从 ⑤b-2 挪进 ⑤b-3「定向已覆盖·严禁按死代码核销」。
//   ★ 这正是第 161 轮那条教训的复发面：「稀有 = 死」的想当然不止会误判自然流零命中，
//     还会因为**只数了一个发射点**就把活代码判死。故本件两条腿：
//     段一 静态自证：把兄分支的四道前置（兄存活 / 持永久惑心 / 敌方无生效惑心 / rng < hitChance）
//       与「误伤候选存在」在源码里逐条点名，并核 201 brother.mindControl.hitChance 真有值；
//       源码形状一变就红，不许静默沿用旧结论。
//     段二 定向扫描：forceXiaoZhao='brother' 跑满场次，只数「兄真持永久惑心的回合」当进入次数
//       （下界口径：一整回合只计 1 次，真实触发远多于此，故它是保守下界，不是上界），
//       命中数分两桶记（deceiverIsSpider=兄分支 / 其余=成昆分支）。
//     ★ 段三（本轮实测逼出来的）：光数回合还不够 —— 若 BEFORE_SELECT_TARGET 这个信号在 node 侧
//       回放通道里**一次都不发**，那么"进入 455 回合、命中 0"根本不是不可达证据，而是**通道缺口**：
//       发射点压根没被走到，零命中既不能证死也不能证活（第 161 轮立的规矩：不许拿零命中当结论）。
//       故段三独立数信号次数；信号为 0 时结论一律判 UNKNOWN（不提核销），并把两处疑点交人工拍板：
//         疑点甲 —— 兄组件在 L157 `const brother = A.find(...)` 是**安装期捕获的引用**，而回放/引擎
//                    每回合 clone 单位（本件实测跨回合非同一对象）⇒ L192 读的 _permanentBuffs 是旧对象，
//                    即使信号真发了也恒假（与挂账一「兄永久海克斯」同源，属主代码待拍板项，本件不代改）。
//         疑点乙 —— node 侧回放通道是否根本不发 BEFORE_SELECT_TARGET（若是，则所有走该信号的分支
//                    在 node 侧都无法取证，覆盖面口径要重新评估）。
//     棘轮：① 信号 > 0 且进入次数 ≥ 下限、命中 = 0 ⇒ 才允许下「不可达」结论（红，提核销）；
//           ② 命中 > 0 ⇒ 链条成立，phantomConfuse 须从 ⑤b-2 挪进 ⑤b-3（本件只点名，不代改 census）。
export const VER = 'tests/phantom-confuse-brother-case.mjs V1.0.0';

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

const SEEDS_N = Number(process.env.SEEDS_N || 20);      // seed 1..20
const STAGES = [1, 2, 3, 4, 5, 6, 7];
const MIN_ENTER = 10;                                    // 进入（兄持永久惑心的回合）下限，低于即不许下结论
const SCAN_ONLY = process.argv.includes('--scan');

// ── 段一 静态自证（不跑战斗，直接读源码）────────────────────────────────
const SRC = path.join(root, 'modules/27elite-mingjiao-xiaozhao-brother.js');
const src = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);
const reasons = [];
const idxFact = src.findIndex(l => l.includes('PHANTOM_CONFUSE'));
if (idxFact < 0) {
    reasons.push('modules/27elite-mingjiao-xiaozhao-brother.js 里找不到 PHANTOM_CONFUSE 发射点（分支被删 / 改名）');
} else {
    const win = src.slice(Math.max(0, idxFact - 14), idxFact + 1).join('\n');
    const need = [
        ['兄存活且有永久 buff 数组', /!brother\s*\|\|\s*!brother\.alive\s*\|\|\s*!brother\.state\._permanentBuffs/.test(win)],
        ['永久 list 含 MIND_CONTROL', /_permanentBuffs\.some\(b\s*=>\s*b\.key\s*===\s*BUFF_TYPES\.MIND_CONTROL\)/.test(win)],
        ['敌方无生效惑心（同键不重复生效）', /hasBuff\(data\.enemySide\._activeBuffs,\s*BUFF_TYPES\.MIND_CONTROL\)/.test(win)],
        ['概率读 201 brother.mindControl.hitChance', /getBrotherHexEnhance\('mindControl'\)[\s\S]{0,200}hitChance/.test(win)],
        ['误伤候选存在才发 fact', /fakeTarget/.test(win)],
        ['兄分支标记 deceiverIsSpider', /deceiverIsSpider:\s*true/.test(src[idxFact])]
    ];
    for (const [name, ok] of need) if (!ok) reasons.push('兄分支前置「' + name + '」在源码里对不上（形状已变，旧结论作废）');
    console.log('--- 段一 静态自证（modules/27elite-mingjiao-xiaozhao-brother.js L' + (idxFact + 1) + ' 兄分支发射点）---');
    for (const [name, ok] of need) console.log('  ' + (ok ? '✅' : '❌') + ' ' + name);
}
// 疑点甲（只点名不下结论）：发射点用的是安装期捕获的 brother 引用，还是每次 data 里现取
const idxCap = src.findIndex(l => /const\s+brother\s*=\s*A\.find\(/.test(l));
const usesCaptured = idxFact >= 0 && src.slice(Math.max(0, idxFact - 14), idxFact + 1).some(l => /\bbrother\b/.test(l));
if (idxCap >= 0 && usesCaptured) {
    console.log('  ⚠️ 疑点甲：发射点用安装期捕获的 brother 引用（L' + (idxCap + 1) + '），而单位每回合 clone ⇒ _permanentBuffs 可能读到旧对象（主代码待拍板，本件不代改）');
}
// 数据面：201 brother.mindControl.hitChance 必须有值（缺则主代码直接抛错，不是"概率为 0"）
try {
    const hex201 = JSON.parse(fs.readFileSync(path.join(root, 'content/201hex-enhance.json'), 'utf8'));
    const hc = hex201?.brother?.mindControl?.hitChance;
    if (hc == null) reasons.push('content/201hex-enhance.json 缺 brother.mindControl.hitChance（主代码会直接抛错）');
    else console.log('  ✅ 201 brother.mindControl.hitChance = ' + hc);
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
const { CAMP_TYPES } = await import('../infra/56-battle-enums.js');
const { eventBus } = await import('../infra/50-event-bus.js');
const { SIGNAL_TYPES } = await import('../infra/56-battle-enums.js');
const { tickAndPickBuffs } = await import('./_lib/buff-picker.mjs');
await import('../modules/25elite-imperial.js');
await import('../modules/26elite-sixsects.js');
await import('../modules/27elite-mingjiao.js');
await import('../modules/30custom-effects.js');
await loadGameData();
// 第 162 轮：小昭.hexEnhance 已迁到 content/201hex-enhance.json，启动链一并 loadHexEnhanceData（缺口由 tests/hex-boot-chain-guard.mjs 点名）
await loadHexEnhanceData();

const MAX_ROUND = CONFIG.MAX_ROUND || 35;

// 段三探针：独立数 BEFORE_SELECT_TARGET 信号（晚于兄组件注册 ⇒ 只观测，不干扰它的判定）
let sigCount = 0, sigEnemy = 0, sigEnemyWithPerm = 0;
let curBro = null;   // 本回合的兄单位（可能每回合 clone，故每回合重指）
eventBus.on(SIGNAL_TYPES.BEFORE_SELECT_TARGET, 'PHANTOM_CONFUSE_PROBE', (data) => {
    sigCount++;
    if (data && data.unit && data.unit.camp === CAMP_TYPES.ENEMY) {
        sigEnemy++;
        const perm = !!(curBro && Array.isArray(curBro.state && curBro.state._permanentBuffs)
            && curBro.state._permanentBuffs.some(b => b.key === BUFF_TYPES.MIND_CONTROL));
        if (perm) sigEnemyWithPerm++;
    }
});

function hasActiveBuff(side, key) {
    const arr = side && side._activeBuffs;
    return !!(arr && arr.some(b => b && b.key === key));
}

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
    let enter = 0, hitsSpider = 0, hitsOther = 0, permBattles = 0;
    const samples = [];
    let lastStep = null, winner = null;
    while (battleState.round <= MAX_ROUND) {
        // 进入次数（保守下界）：本回合「兄存活 + 持永久惑心 + 敌方无生效惑心」整回合只计 1 次
        const bro = battleState.ally.find(u => u.isXiaoZhaoBrother && u.alive);
        curBro = bro;
        const perm = !!(bro && Array.isArray(bro.state._permanentBuffs)
            && bro.state._permanentBuffs.some(b => b.key === BUFF_TYPES.MIND_CONTROL));
        if (perm && !hasActiveBuff(battleState.enemy, BUFF_TYPES.MIND_CONTROL)) {
            enter += 1;
            if (permBattles === 0) permBattles = 1;
        }
        for (const step of createRoundStepper(battleState)) {
            lastStep = step;
            const collect = (f) => {
                if (!f || !f.factType || !f.data) return;
                if (f.factType === FT.PHANTOM_CONFUSE) {
                    if (f.data.deceiverIsSpider === true) {
                        hitsSpider++;
                        if (samples.length < 6) samples.push({ seed, stage, round: battleState.round, target: f.data.targetName });
                    } else {
                        hitsOther++;
                    }
                }
            };
            for (const f of (step.log || [])) {
                collect(f);
                if (f && f.factType === FT.ATTACK && f.data && Array.isArray(f.data.entries)) {
                    for (const e of f.data.entries) collect(e);
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
    return { enter, hitsSpider, hitsOther, permBattles, samples };
}

const seeds = Array.from({ length: SEEDS_N }, (_, i) => i + 1);
let battles = 0, enter = 0, hitsSpider = 0, hitsOther = 0, permBattles = 0;
const allSamples = [];
for (const seed of seeds) {
    for (const stage of STAGES) {
        battles++;
        const r = runBattle(seed, stage);
        enter += r.enter; hitsSpider += r.hitsSpider; hitsOther += r.hitsOther; permBattles += r.permBattles;
        for (const s of r.samples) allSamples.push(s);
    }
}

console.log('--- 段二 定向扫描（forceXiaoZhao=brother，' + battles + ' 场）---');
console.log('  进入「兄持永久惑心且敌方无生效惑心」回合 ' + enter + ' 次（其中 ' + permBattles + ' 场真的拿到永久惑心）');
console.log('  PHANTOM_CONFUSE：兄分支（deceiverIsSpider）命中 ' + hitsSpider + ' 次；其余（成昆分支）' + hitsOther + ' 次');
if (allSamples.length) console.log('  兄分支样例 ' + JSON.stringify(allSamples.slice(0, 4)));
console.log('--- 段三 信号通道取证 ---');
console.log('  BEFORE_SELECT_TARGET 信号 ' + sigCount + ' 次（敌方攻击 ' + sigEnemy + ' 次，其中兄正持永久惑心 ' + sigEnemyWithPerm + ' 次）');

if (SCAN_ONLY) {
    console.log('（--scan 模式：不做棘轮断言）');
} else {
    const fails = [];
    if (!sp.ok) fails.push('段一 静态自证未通过（结论前提失效，须人工复核）：' + sp.reasons.join('；'));

    console.log('--- 结论 ---');
    if (sigCount === 0) {
        // ★ 通道缺口：发射点压根没被走到，零命中不构成任何结论（不许拿它当"不可达"证据）
        console.log('  ⚠️ UNKNOWN（通道缺口，不提核销）：node 侧回放通道一次都没发 BEFORE_SELECT_TARGET，');
        console.log('     兄分支发射点在本次扫描里**从未被走到** ⇒ 命中 0 既不能证死也不能证活（第 161 轮立的规矩）。');
        console.log('     ★ 但第 160 轮给 phantomConfuse 下的「要成昆在队 ⇒ 干净树本就不发射」结论**已不成立一半**：');
        console.log('       它有两个发射点，兄分支走 forceXiaoZhao=brother，不需要 forceChengKun —— 结论须订正为「双发射点」。');
        console.log('     待拍板：疑点甲（安装期捕获 brother 引用，跨回合 clone ⇒ 判据可能恒假）；疑点乙（node 回放通道是否发此信号）。');
    } else if (hitsSpider > 0) {
        console.log('  ✅ 兄分支链条成立：进入 ' + enter + ' 回合 / 敌方攻击 ' + sigEnemy + ' 次，命中 ' + hitsSpider + ' 次');
        console.log('     ⇒ phantomConfuse **不是死代码**，须从 fact-emission-census 的 ⑤b-2 挪进 ⑤b-3（本件只点名，不代改）');
    } else if (sigEnemyWithPerm >= MIN_ENTER) {
        fails.push('兄分支信号已走到（兄持永久惑心的敌方攻击 ' + sigEnemyWithPerm + ' 次 ≥ ' + MIN_ENTER
            + '）却恒零命中 ⇒ 该发射点不可达成立，可按死代码提核销（只许删这一处，须拍板）');
    } else {
        fails.push('覆盖棘轮未达下限：兄持永久惑心的敌方攻击 ' + sigEnemyWithPerm + ' 次 < ' + MIN_ENTER
            + ' ⇒ 零命中不构成「不可达」证据，须先补样本（不许拿零命中当结论）');
    }
    for (const f of fails) console.log('  ❌ ' + f);
    if (fails.length) process.exitCode = 1;
}
