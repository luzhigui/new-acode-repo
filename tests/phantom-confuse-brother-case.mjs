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
//     棘轮：① 探针本体自检必过（不过 ⇒ 计数属测量错误，不许下任何结论）；
//           ② 命中 > 0 ⇒ 链条成立，phantomConfuse 须从 ⑤b-2 挪进 ⑤b-3（本件只点名，不代改 census）；
//           ③ 命中 = 0 且信号通道确认通 ⇒ **不许提核销**：先把进次数走到下限再说（见 V1.1.0 结论逻辑）。
//
// V1.1.0 | 2026-10-31 夜间第 163 轮：★ 段三重写 —— 上轮的「疑点乙」是**测量口径错误**，本轮证伪。
//   上轮段三在 import 阶段 eventBus.on 注册一次，读出 BEFORE_SELECT_TARGET 零触发。
//   但引擎 installRoundMechanics 每回合 eventBus.clearAll()（core/11battle-round.js:142；core/06battle-runner.js
//   顶部注释明写「页面级 eventBus 监听器活不过第一回合」）⇒ 探针在**第一次攻击之前**就被清掉，计数恒为 0。
//   换成 tests/_lib/signal-probe.mjs 的跨回合存活探针（每 step ensure 重登，on 自带去重）后：
//   42 场实测该信号**发 3443 次**（均 82 次/场），探针被重登 566 次 —— 信号一直在发，被清掉的是探针自己。
//   ⇒ 疑点乙不成立，撤回：node 侧回放通道正常发 BEFORE_SELECT_TARGET，⑤b 覆盖面口径不必重估。
//   同一套装新增「逐层剥前置」计数（①②③⑤ 四道前置各数一层），于是首次能量化一个关键矛盾：
//   全前置就绪 N 次而期望命中 ≈ 0.2N 次却恒 0 ⇒ 这是「该发没发」，不是「结构不可达」，
//   **结论方向反转**：由「可提核销（当死代码删）」改为「疑似隐匿失效（疑点甲）」，
//   删掉一条还在服役的发射点比留着它危险得多，故本件在这个最容易被误判的档位上选择把它**按住不核销**。
export const VER = 'tests/phantom-confuse-brother-case.mjs V1.1.0';

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

// 段三探针 —— 第 163 轮用 tests/_lib/signal-probe.mjs 重写（★ 第 162 轮这一段的写法是错的）：
//   ★ 老写法在开头 eventBus.on 一次。但引擎 installRoundMechanics 里每回合 eventBus.clearAll()
//     （core/11battle-round.js:142，且 core/06battle-runner.js 顶部注释明写「页面级监听器活不过第一回合」）
//     ⇒ 探针在第一次攻击之前就被清掉，计数**恒为 0**，于是读出「BEFORE_SELECT_TARGET 零触发」
//     并推断「node 侧回放通道根本不发该信号」（第 162 轮疑点乙）。本轮已在 signal-channel-guard 里证伪：同一写法换成
//     「每 step 重登」后实测 42 场发 3443 次（均 82 次/场）——信号一直在发，被清掉的是探针自己。
//   现写法：每 step probe.ensure() 重登（on 自带按 priority+key 去重，同回合重复调用不堆积），主代码一行不改。
const { createSignalProbe, isAliveProbe } = await import('./_lib/signal-probe.mjs');
let curBro = null;   // 本回合的兄单位（每回合 clone，故每回合重指）—— 段二回合计数的兜底
const cnt = { enemy: 0, permLive: 0, noEnemyMc: 0, hasFakeTarget: 0 };
// 疑点甲的机制验证（本轮新增）：install 期捕获的引用 = 回合**开始时**那批对象里的兄。
//   若信号时刻（同回合内）拿到的兄不是同一个对象 ⇒ 闭包读的确实是另一个对象的 _permanentBuffs。
let roundStartBro = null;
const idc = { refMismatch: 0, startNoPermButLiveYes: 0, startHasPerm: 0 };
function permHas(u, key) {
    return !!(u && Array.isArray(u.state && u.state._permanentBuffs)
        && u.state._permanentBuffs.some(b => b.key === key));
}
const probe = createSignalProbe({
    bus: eventBus, SIGNAL_TYPES,
    signal: SIGNAL_TYPES.BEFORE_SELECT_TARGET,
    priority: 9999, key: 'PHANTOM_CONFUSE_PROBE_V2',
    onData: (data) => {
        if (!data || !data.unit || data.unit.camp !== CAMP_TYPES.ENEMY) return;
        cnt.enemy++;
        // 现场按发射点五道前置逐条数（用信号带出来的存活对象，**不复用 install 期闭包**）
        //   发点源码 modules/27elite-mingjiao-xiaozhao-brother.js submitSpiderMindControlDeclaration：
        //   ① data.unit.camp === ENEMY  ② brother.alive && _permanentBuffs 含 MIND_CONTROL
        //   ③ 目标方 _activeBuffs 无 MIND_CONTROL  ④ rng.next() < hitChance(0.2)  ⑤ allySide 有误伤候选
        const enemyTeamSide = data.enemySide || [];      // 兄所在方（敌方攻击时的"敌方"... 即受攻击的一方）
        const bro = enemyTeamSide.find(u => u.isXiaoZhaoBrother && u.alive);
        const perm = !!(bro && Array.isArray(bro.state && bro.state._permanentBuffs)
            && bro.state._permanentBuffs.some(b => b.key === BUFF_TYPES.MIND_CONTROL));
        if (!perm) return;
        cnt.permLive++;
        // 机制取证：同回合内的兄 与 回合开始那批对象里的兄，是不是同一个对象？
        if (bro && roundStartBro && bro !== roundStartBro) idc.refMismatch++;
        if (bro && roundStartBro && !permHas(roundStartBro, BUFF_TYPES.MIND_CONTROL)) idc.startNoPermButLiveYes++;
        if (bro && roundStartBro && permHas(roundStartBro, BUFF_TYPES.MIND_CONTROL)) idc.startHasPerm++;
        if (hasActiveBuff(enemyTeamSide, BUFF_TYPES.MIND_CONTROL)) return;
        cnt.noEnemyMc++;
        const fakeTarget = (data.allySide || []).find(u => u.alive && !u.isHorse && u.uid !== data.unit.uid);
        if (!fakeTarget) return;
        cnt.hasFakeTarget++;   // ★ ①②③⑤ 全过，只差 ④ 那一掷
    }
});
// 反向自检：探针本体能不能收到信号。收不到 ⇒ 下面任何「零触发」都属测量错误，不可采信。
const probeAlive = isAliveProbe(eventBus, '__PHANTOM_CONFUSE_PROBE_SELFTEST__', 'PHANTOM_CONFUSE_PROBE_SELFTEST');

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
        roundStartBro = bro;   // install 期捕获的就是这一批对象里的兄（每回合装机一次）
        const perm = !!(bro && Array.isArray(bro.state._permanentBuffs)
            && bro.state._permanentBuffs.some(b => b.key === BUFF_TYPES.MIND_CONTROL));
        if (perm && !hasActiveBuff(battleState.enemy, BUFF_TYPES.MIND_CONTROL)) {
            enter += 1;
            if (permBattles === 0) permBattles = 1;
        }
        for (const step of createRoundStepper(battleState)) {
            probe.ensure();          // ★ 每 step 重登，躲过引擎每回合的 eventBus.clearAll()
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
                    if (f && f.factType === FT.ATTACK && f.data) {
                        // ★ 第 163 轮补的洞：幻影 fact 挂在 attackFact.data.phantomFact，
                        //   **不在 data.entries 里**（core/12battle-attack-chain.js buildAttackGroup）。
                        //   老口径只扫 log 顶层 + data.entries ⇒ phantom 类命中根本看不见，
                        //   「兄分支 0 次 / 成昆分支 0 次」很可能是**没看到**，不是**没发生**。
                        collect(f.data.phantomFact);
                        if (Array.isArray(f.data.entries)) for (const e of f.data.entries) collect(e);
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
console.log('--- 段三 信号通道取证（第 163 轮改用跨回合存活探针）---');
console.log('  探针本体自检 ' + (probeAlive ? '✅ 可用' : '❌ 收不到自检信号 —— 下列计数全部不可采信'));
console.log('  BEFORE_SELECT_TARGET 信号 ' + probe.count + ' 次（探针跨回合重登 ' + probe.registrations + ' 次 ⇒ 引擎每回合 clearAll 属实）');
console.log('  逐层剥前置：敌方攻击 ' + cnt.enemy + ' 次 → 兄持永久惑心 ' + cnt.permLive
    + ' 次 → 目标方无生效惑心 ' + cnt.noEnemyMc + ' 次 → 误伤候选存在（全前置就绪）' + cnt.hasFakeTarget + ' 次');
console.log('  ★ 全前置就绪后只差 rng.next() < hitChance(0.2) 那一掷 ⇒ 期望命中约 '
    + (cnt.hasFakeTarget * 0.2).toFixed(1) + ' 次，实测 ' + hitsSpider + ' 次');
console.log('  疑点甲机制取证：信号时刻的兄与回合开始对象**不同引用** ' + idc.refMismatch + ' 次；'
    + '回调时刻有永久惑心而回合开始对象**没有** ' + idc.startNoPermButLiveYes + ' 次；两边都有 ' + idc.startHasPerm + ' 次');

if (SCAN_ONLY) {
    console.log('（--scan 模式：不做棘轮断言）');
} else {
    const fails = [];
    if (!sp.ok) fails.push('段一 静态自证未通过（结论前提失效，须人工复核）：' + sp.reasons.join('；'));
    if (!probeAlive) fails.push('段三 探针本体自检不过 ⇒ 信号计数属测量错误，不可据此下任何结论（先把探针接上再谈）');

    console.log('--- 结论 ---');
    if (probe.count === 0) {
        console.log('  ⚠️ UNKNOWN（通道缺口，不提核销）：本扫描里 BEFORE_SELECT_TARGET 一次没观测到 ⇒ 发射点从未被走到。');
        console.log('     ★ 注意：若探针本体自检已过而计数仍 0，则这是**真的**通道缺口（与第 162 轮的不是一回事）。');
    } else if (hitsSpider > 0) {
        console.log('  ✅ 兄分支链条成立：全前置就绪 ' + cnt.hasFakeTarget + ' 次 / 命中 ' + hitsSpider + ' 次');
        console.log('     ⇒ phantomConfuse **不是死代码**，须从 fact-emission-census 的 ⑤b-2 挪进 ⑤b-3（本件只点名，不代改）');
    } else if (cnt.hasFakeTarget >= MIN_ENTER) {
        // ★★ 前置全服却零命中：与 0.2 的概率严重矛盾（期望 ' + n*0.2 + ' 次）
        fails.push('★ 疑似隐匿失效，不是结构不可达：信号走到 ' + cnt.hasFakeTarget + ' 次且①②③⑤四道前置'
            + '全部就绪，期望命中约 ' + (cnt.hasFakeTarget * 0.2).toFixed(1) + ' 次却恒为 0'
            + ' ⇒ 只有两解：(甲) 发射点闭包用的是 install 期捕获的 brother 引用，其 _permanentBuffs 恒为空'
            + '（即第 162 轮疑点甲成立）；(乙) 上游在更早处短路。**两解都禁止按死代码核销**，须先定位。');
        console.log('  ❌ 见上：本是「该发没发」，不是「不可达」。详见 fail 明细。');
    } else {
        fails.push('覆盖棘轮未达下限：全前置就绪 ' + cnt.hasFakeTarget + ' 次 < ' + MIN_ENTER
            + ' ⇒ 零命中不构成任何结论，须先补样本（第 161 轮立的规矩：不许拿零命中当结论）');
    }
    for (const f of fails) console.log('  ❌ ' + f);
    if (fails.length) process.exitCode = 1;
}
