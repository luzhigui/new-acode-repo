// V1.1.0 | 2026-10-31 夜间第 164 轮（③ 名单由 4 个扩到全量 14 个 + kind 分类 + 反向棘轮）：node 侧信号通道守门 —— 防「探针自己没接上，却下定论的通道不通」
//   由来：第 162 轮 phantom-confuse-brother-case 的段三在 import 阶段注册了一次 BEFORE_SELECT_TARGET
//   探针，读出「零触发」，据此推断「node 侧回放通道根本不发该信号」，并把「所有走该信号的分支在
//   node 侧都无法取证、⑤b 那几条非样本缺口的结论都要重估」交人工拍板。
//   ★ 本轮查证：这个结论是假的。引擎在 installRoundMechanics 里**每回合 eventBus.clearAll()**
//   （core/11battle-round.js:142，且 core/06battle-runner.js 顶部注释白纸黑字写了「页面级监听器
//   活不过第一回合」）。探针只在开头注册一次 ⇒ 它在第一次攻击之前就被清掉了，计数**恒为 0**。
//   而 BEFORE_SELECT_TARGET 本身在 core/12battle-attack-chain.js:29 无条件发射，且有 6 处真实订阅方
//   （胖笨拙 / 胖嘲讽 / 幻影清除 / 伪装 / 反贼 / 兄永久惑心）—— 它们天天在跑，信号不可能不发。
//
//   本件守两件事：
//     ① 反向自检（isAliveProbe）：先证明**探针本体能收到信号**，证不了 ⇒ 任何「零触发」不可采信。
//     ② 正向实证（跨回合存活探针：每个 step 重登一次）：真跑几场，把关键信号的发射次数打出来，
//        低于棘轮下限即报「通道缺口 ⇒ 该信号的定向用例结论一律判 UNKNOWN」。
//   ★ 这条红线是「测量方法」的红线，不是产品红线：它防的是**拿测量错误当产品缺陷**，
//     与本轮是否放行任何核销建议无关——它决定的是「我们有没有资格下结论」。
//   口径：只取证不放宽 —— 本件不改任何判据、不改任何基线、不替任何核销建议站台。
export const VER = 'tests/signal-channel-guard.mjs V1.1.0';

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

const SCAN_ONLY = process.argv.includes('--scan');
const SEEDS_N = Number(process.env.SEEDS_N || 6);
const STAGES = [1, 2, 3, 4, 5, 6, 7];

// 棘轮下限（第 163 轮首跑实测：42 场共 3443 次，单场 36~119 次）：
//   ① 总量下限 500 —— 场次长短天然不一，单场次波动大，用总量判「通道是不是活的」更稳；
//   ② 每场下限 1 —— 某一场收 0 次而别场动辄上百，说明探针在那一局被别的东西清掉了（重登姿势仍不够硬）。
const MIN_EMIT_TOTAL = 500;
const MIN_EMIT_PER_BATTLE = 1;

// ── ④ 藏匿点穷尽性普查（第 164 轮新增）──────────────────────────────────
//   第 163 轮补了 phantomFact 一处，第 164 轮把另外 7 个脚本也补了。
//   但「补了已知的两处」不等于「没有第三处」——★ 这正是同一款病复发的位置：
//   每补一次都以为补完了，直到某个分支又被读成零命中。
//   做法：不再假定字段名，运行期遍历每条 fact 的 data 的**每一个 key**，
//   凡是值里藏着 factType 的（对象 / 数组元素），就把字段名记下来。
//   ⇒ 若集合里出现 entries / phantomFact 之外的新名字 ⇒ 第三处藏匿点，当场报红点名。
const KNOWN_SPOTS = new Set(['entries', 'phantomFact']);
const spotHits = new Map();      // 字段名 -> 命中次数
const spotSamples = new Map();   // 字段名 -> 样例 factType

function scanHidingSpots(nodes, depth) {
    if (!Array.isArray(nodes) || depth > 6) return;
    for (const n of nodes) {
        if (!n || typeof n !== 'object') continue;
        const d = n.data;
        if (d && typeof d === 'object') {
            for (const k of Object.keys(d)) {
                const v = d[k];
                if (!v || typeof v !== 'object') continue;
                const inner = Array.isArray(v) ? v : [v];
                let got = 0, sample = '';
                for (const e of inner) {
                    if (e && typeof e === 'object' && e.factType) { got++; if (!sample) sample = String(e.factType); }
                }
                if (got > 0) {
                    spotHits.set(k, (spotHits.get(k) || 0) + got);
                    if (!spotSamples.has(k)) spotSamples.set(k, sample);
                }
            }
        }
        // 顺着已知两层继续往下翻，才有机会看见更深处的挂点
        const next = [];
        if (d && Array.isArray(d.entries)) next.push(...d.entries);
        if (d && d.phantomFact) next.push(d.phantomFact);
        if (next.length) scanHidingSpots(next, depth + 1);
    }
}

const problems = [];
const notes = [];

async function main() {
    console.log('=== node 侧信号通道守门 ' + VER + ' ===');

    // ── ⓪ 静态自证：契约还在不在（变了探针姿势要跟着变）──────────────────
    console.log('--- ⓪ 静态自证（clearAll 契约 + 发射点 + 订阅点）---');
    const contract = await (async () => {
        const m = await import('./_lib/signal-probe.mjs');
        return m.verifyClearAllContract(root);
    })();
    for (const f of Object.keys(contract.files)) {
        const v = contract.files[f];
        console.log('  ' + (v.clearAll !== false ? '✅' : '❌') + ' ' + f + ' ' + JSON.stringify(v));
    }
    for (const r of contract.reasons) { problems.push('⓪ ' + r); console.log('  ❌ ' + r); }

    const signals = [
        { name: 'BEFORE_SELECT_TARGET', src: 'core/12battle-attack-chain.js' },
        { name: 'AFTER_SELECT_TARGET', src: null },
        { name: 'BEFORE_DAMAGE_CALC', src: null }
    ];
    for (const s of signals) {
        let emitters = 0;
        const files = walkAll(root).filter(f => /\.(m?js)$/.test(f));
        for (const f of files) {
            const txt = fs.readFileSync(f, 'utf8');
            if (txt.includes('SIGNAL_TYPES.' + s.name)) emitters++;
        }
        if (emitters === 0) problems.push('⓪ 信号 ' + s.name + ' 在主代码里已经没有任何引用（发射点被删）⇒ 相关定向用例的前提已作废');
        else console.log('  ✅ 信号 ' + s.name + ' 在 ' + emitters + ' 个文件里出现（含发射与订阅）');
    }
    if (fs.existsSync(path.join(root, 'core/12battle-attack-chain.js'))) {
        const t = fs.readFileSync(path.join(root, 'core/12battle-attack-chain.js'), 'utf8');
        const ok = /eventBus\.emit\(SIGNAL_TYPES\.BEFORE_SELECT_TARGET/.test(t);
        console.log('  ' + (ok ? '✅' : '❌') + ' BEFORE_SELECT_TARGET 发射点仍在 core/12battle-attack-chain.js（selectAttackTarget 内无条件发射）');
        if (!ok) problems.push('⓪ BEFORE_SELECT_TARGET 发射点消失 ⇒ 第 162 轮那条「通道不通」由假变态真，须立刻重估所有走该信号的分支');
    }

    // ── ① 反向自检：探针本体能不能收到信号 ─────────────────────────────
    const { eventBus } = await import('../infra/50-event-bus.js');
    const { SIGNAL_TYPES } = await import('../infra/56-battle-enums.js');
    const { isAliveProbe } = await import('./_lib/signal-probe.mjs');
    console.log('--- ① 探针本体自检（收不到 ⇒ 任何「零触发」结论不可采信）---');
    const selfSig = '__SIGNAL_PROBE_SELFTEST__';
    const alive = isAliveProbe(eventBus, selfSig, 'SIGNAL_CHANNEL_GUARD_SELFTEST');
    console.log('  ' + (alive ? '✅' : '❌') + ' 探针本体' + (alive ? '确认可用（登记姿势正确，总线响应正常）' : '收不到自己发出的自检信号 —— 登记姿势错了或总线被换实例'));
    if (!alive) problems.push('① 探针本体自检不过 ⇒ 本件及所有定向用例的信号计数一律不可采信');

    // ── ② 正向实证：真跑几场，数 BEFORE_SELECT_TARGET 到底发不发 ──────────
    console.log('--- ② 运行期实证（跨回合存活探针，' + SEEDS_N + ' seed × 7 stage）---');
    const [{ CONFIG, loadGameData, loadHexEnhanceData }, { SeededRNG }, { createRoundStepper },
           { initBattleTeams }, { GlobalStore }] = await Promise.all([
        import('../core/01config-5v5-test.js'),
        import('../infra/51-core-utils.js'),
        import('../core/11battle-round.js'),
        import('../modules/29battle-init.js'),
        import('../infra/54-global-store.js')
    ]);
    const { tickAndPickBuffs } = await import('./_lib/buff-picker.mjs');
    const { createSignalProbe } = await import('./_lib/signal-probe.mjs');
    await import('../modules/25elite-imperial.js');
    await import('../modules/26elite-sixsects.js');
    await import('../modules/27elite-mingjiao.js');
    await import('../modules/30custom-effects.js');
    await loadGameData();
    await loadHexEnhanceData();

    const MAX_ROUND = CONFIG.MAX_ROUND || 35;
    const probe = createSignalProbe({
        bus: eventBus, SIGNAL_TYPES,
        signal: SIGNAL_TYPES.BEFORE_SELECT_TARGET,
        priority: 9999, key: 'SIGNAL_CHANNEL_GUARD_V1'
    });

    let total = 0, lowSeeds = [], battles = 0;
    for (let seed = 1; seed <= SEEDS_N; seed++) {
        for (const stage of STAGES) {
            const before = probe.count;
            GlobalStore.set('forceXiaoZhao', 'brother');
            const rng = new SeededRNG(seed);
            const { allyTeam, enemyTeam } = initBattleTeams(stage, rng);
            let battleState = {
                ally: allyTeam.map(u => u.clone()), enemy: enemyTeam.map(u => u.clone()),
                round: 1, activeBuffs: [],
                allAllies: allyTeam.map(u => u.clone()), _rng: rng
            };
            battleState.activeBuffs = tickAndPickBuffs([], battleState.ally, battleState.enemy, 1, seed, true);
            let lastStep = null, winner = null;
            while (battleState.round <= MAX_ROUND) {
                for (const step of createRoundStepper(battleState)) {
                    probe.ensure();                 // ★ 躲过每回合 clearAll 的关键一行
                    scanHidingSpots(step.log, 0);   // ④ 顺路普查 fact 藏匿点
                    lastStep = step;
                    if (step.winner) winner = step.winner;
                }
                if (winner || !lastStep) break;
                const nextRoundNo = battleState.round + 1;
                const nextActiveBuffs = tickAndPickBuffs(battleState.activeBuffs, lastStep.ally, lastStep.enemy,
                    battleState.round, seed, battleState.round % 3 === 0);
                battleState = {
                    ally: lastStep.ally.map(u => u.clone()), enemy: lastStep.enemy.map(u => u.clone()),
                    round: nextRoundNo, activeBuffs: nextActiveBuffs,
                    allAllies: battleState.allAllies, _rng: rng
                };
            }
            GlobalStore.set('forceXiaoZhao', null);
            const got = probe.count - before;
            total += got;
            battles++;
            if (got < MIN_EMIT_PER_BATTLE) lowSeeds.push('seed ' + seed + ' stage ' + stage + ' 只收到 ' + got + ' 次（别场动辄上百 ⇒ 探针在该局被非预期清除）');
        }
    }
    console.log('  BEFORE_SELECT_TARGET 合计 ' + total + ' 次（' + battles + ' 场，均 ' + Math.round(total / battles) + ' 次/场）');
    console.log('  探针重登 ' + probe.registrations + ' 次 / ensure 调用 ' + probe.ensureCalls + ' 步 ⇒ '
        + (probe.registrations > 1 ? '确认每回合被 clearAll 清过（这正是第 162 轮读成零触发的原因）' : '尚未观察到跨回合清理'));

    if (total === 0) {
        problems.push('② BEFORE_SELECT_TARGET 在 node 侧零触发 ⇒ 通道真缺口，⑤b 那几条「非样本缺口」结论须重估');
    } else if (total < MIN_EMIT_TOTAL) {
        problems.push('② BEFORE_SELECT_TARGET 总量 ' + total + ' < 下限 ' + MIN_EMIT_TOTAL + ' ⇒ 通道疑似退化，走该信号的取证结论须降级为 UNKNOWN');
    } else if (lowSeeds.length) {
        for (const s of lowSeeds.slice(0, 8)) problems.push('② ' + s + '（单场低于下限 ' + MIN_EMIT_PER_BATTLE + '）');
    } else {
        notes.push('② node 侧 BEFORE_SELECT_TARGET 实发 ' + total + ' 次 ⇒ 第 162 轮疑点乙（怀疑 node 通道不发该信号）本轮证伪：零触发是探针未跨回合重登所致，非产品缺陷');
    }

    // ── ③ fact 藏匿点体检：补了 phantomFact 这一层不能再漏 ─────────────────
    //   本轮主线二挖出的第二个洞：幻影类 fact 挂在 attackFact.data.phantomFact，
    //   与 data.entries **并列**、不在 entries 里 ⇒ 全仓库扫 Fact 的脚本一条都没看见过。
    //   这里把「藏匿点还在」与「扫描脚本都认这一层」做成闸门，防它改回来。
    console.log('--- ③ fact 藏匿点（phantomFact 是否还在各位扫描器的视野里）---');
    const CHAIN_SRC = path.join(root, 'core/12battle-attack-chain.js');
    if (fs.existsSync(CHAIN_SRC)) {
        const t = fs.readFileSync(CHAIN_SRC, 'utf8');
        const ok = /data:\s*\{[\s\S]{0,400}?phantomFact,/.test(t) || /phantomFact,\s*\n\s*entries:/.test(t);
        console.log('  ' + (ok ? '✅' : '❌') + ' attackFact.data 里仍有 phantomFact 字段（与 entries 并列）');
        if (!ok) problems.push('③ core/12 buildAttackGroup 里找不到 attackFact.data.phantomFact ⇒ 幻影 fact 换了挂点，全仓库扫描口径须同步改');
        else notes.push('③ phantomFact 挂点仍未移位');
    }
    // ★ 第 164 轮：名单由 4 个扩到全量。第 163 轮只修了四个 fact 扫描器，tests/ 下还有一批
    //   同样只走「log 顶层 + data.entries」两层的脚本没核对（正是上轮留的【最高·下轮】）。
    //   做法：把所有可能消费 fact 的脚本全部登记并标 kind，由守门自己判定，而不是靠人记：
    //     · fact-input  ⇒ 必须认 phantomFact 层，或已接入 _lib/fact-collect 公共件，否则点名；
    //     · static-only ⇒ 不消费战报（纯静态 / 纯加载），豁免，但须写清理由；
    //     · ★ 反向棘轮：登记为 static-only 的脚本若其实在消费 step.log ⇒ 报「分类过期」，
    //       与 census ⑤b-3 那条同款 —— 防「我随手标个豁免，把洞藏起来」。
    const SCANNERS = [
        { rel: 'tests/fact-emission-census.mjs',         kind: 'fact-input',  why: 'fact 发射普查，全量采集' },
        { rel: 'tests/structural-dead-branch-scan.mjs',  kind: 'fact-input',  why: '结构不可达判定的唯一依据，漏层即误判死代码' },
        { rel: 'tests/rules-replay.mjs',                 kind: 'fact-input',  why: '喂给规则的 facts，少一层即规则恒不命中' },
        { rel: 'tests/phantom-confuse-brother-case.mjs', kind: 'fact-input',  why: '兄分支惑心定向取证' },
        { rel: 'tests/fuzz-invariants.mjs',              kind: 'fact-input',  why: '大样本不变量，逐条查 fact 数值' },
        { rel: 'tests/isdead-fix-guard.mjs',             kind: 'fact-input',  why: 'isDead 修复回归护栏' },
        { rel: 'tests/fact-dead-field-scan.mjs',         kind: 'fact-input',  why: '载荷死字段普查（A/B 桶人工复核的上游）' },
        { rel: 'tests/stat-decl-vs-actual-check.mjs',    kind: 'fact-input',  why: '声明 vs 实际账本对照' },
        { rel: 'tests/spider-dead-target-case.mjs',      kind: 'fact-input',  why: '蛛袭死目标定向取证' },
        { rel: 'tests/xiaozhao-brother-leech-case.mjs',  kind: 'fact-input',  why: '兄分支吸血定向取证' },
        { rel: 'tests/xinhun-death-targeted-case.mjs',   kind: 'fact-input',  why: 'XIN_HUN_DEATH 定向用例' },
        { rel: 'tests/mutation-teeth.mjs',               kind: 'static-only', why: '改源码注入变异、只看体检退码，不消费战报' },
        { rel: 'tests/smoke-headless.mjs',               kind: 'static-only', why: '只加载合同与渲染器验证导出，不扫 fact' },
        { rel: 'tests/contract-guard-selftest.mjs',      kind: 'static-only', why: '纯静态自检' }
    ];
    const missLayer = [];
    for (const s of SCANNERS) {
        const p = path.join(root, s.rel);
        if (!fs.existsSync(p)) { problems.push('③ 目标脚本不存在：' + s.rel); continue; }
        const t = fs.readFileSync(p, 'utf8');
        const consumes = /(step\.log|stepLog|walkFacts|collectFacts)/.test(t);
        const ok = t.includes('phantomFact') || t.includes('fact-collect');
        if (s.kind === 'fact-input') {
            console.log('  ' + (ok ? '✅' : '❌') + ' ' + s.rel + (ok ? ' 已认 phantomFact 层' : ' **不认** phantomFact ⇒ 幻影 fact 对它恒不可见'));
            if (!ok) {
                missLayer.push(s.rel);
                problems.push('③ ' + s.rel + '（' + s.why + '）fact 采集没覆盖 data.phantomFact ⇒ 幻影 fact 恒读成零命中，可能误导核销建议');
            }
        } else {
            if (consumes) {
                console.log('  ❌ ' + s.rel + ' 登记为 static-only 却在消费 step.log ⇒ 分类过期');
                problems.push('③ ' + s.rel + ' 登记为 static-only（理由：' + s.why + '）但源码里在消费 step.log ⇒ 分类过期，须改判 fact-input 并补 phantomFact 层');
            } else {
                console.log('  ⚪ ' + s.rel + ' 非 fact 输入（' + s.why + '），豁免');
            }
        }
    }
    if (missLayer.length) {
        console.log('  ★ 本轮漏网 ' + missLayer.length + ' 个：' + missLayer.join(' / '));
    }

    // ── ④ 的样本先补自然流 ────────────────────────────────────────────
    //   ★ 只用 ② 那批 forceXiaoZhao=brother 的样本做普查，本身就是「以偏概全」复发：
    //     万一某个藏匿点只在别的模式出现，在这批样本里根本看不见，普查就会给出假的「已穷尽」。
    //     所以这里再跑一批**不强制小昭模式的自然流**，两种样本合起来才敢说穷尽。
    console.log('--- ④a 补采自然流样本（不强制 forceXiaoZhao，防止普查自己以偏概全）---');
    GlobalStore.set('forceXiaoZhao', null);
    let naturalBattles = 0;
    for (let seed = 1; seed <= 3; seed++) {
        for (const stage of STAGES) {
            const rng = new SeededRNG(seed + 500);
            const { allyTeam, enemyTeam } = initBattleTeams(stage, rng);
            let bs = {
                ally: allyTeam.map(u => u.clone()), enemy: enemyTeam.map(u => u.clone()),
                round: 1, activeBuffs: [],
                allAllies: allyTeam.map(u => u.clone()), _rng: rng
            };
            bs.activeBuffs = tickAndPickBuffs([], bs.ally, bs.enemy, 1, seed + 500, true);
            let lastStep = null, winner = null;
            while (bs.round <= MAX_ROUND) {
                for (const step of createRoundStepper(bs)) {
                    scanHidingSpots(step.log, 0);
                    lastStep = step;
                    if (step.winner) winner = step.winner;
                }
                if (winner || !lastStep) break;
                const nextRoundNo = bs.round + 1;
                const nextActiveBuffs = tickAndPickBuffs(bs.activeBuffs, lastStep.ally, lastStep.enemy,
                    bs.round, seed + 500, bs.round % 3 === 0);
                bs = {
                    ally: lastStep.ally.map(u => u.clone()), enemy: lastStep.enemy.map(u => u.clone()),
                    round: nextRoundNo, activeBuffs: nextActiveBuffs,
                    allAllies: bs.allAllies, _rng: rng
                };
            }
            naturalBattles++;
        }
    }
    console.log('  自然流补采 ' + naturalBattles + ' 场完成，与 ② 的 ' + battles + ' 场 brother 样本合并统计');

    // ── ④ 藏匿点穷尽性：还有没有第三处？ ──────────────────────────────
    console.log('--- ④ fact 藏匿点穷尽性普查（不再假定字段名，逐 key 翻）---');
    const spots = [...spotHits.entries()].sort((a, b) => b[1] - a[1]);
    for (const [k, n] of spots) {
        const known = KNOWN_SPOTS.has(k);
        console.log('  ' + (known ? '✅' : '❌') + ' data.' + k + ' 里藏着 ' + n + ' 条 fact（样例 ' + spotSamples.get(k) + '）'
            + (known ? ' —— 已知挂点，采集已覆盖' : ' —— ★ 第三处藏匿点'));
        if (!known) problems.push('④ 发现新的 fact 藏匿点 data.' + k + '（样例 ' + spotSamples.get(k) + '，共 ' + n + ' 条）⇒ 全仓库扫描口径须再补一层，否则该处 fact 恒读成零命中');
    }
    if (spots.length === 0) {
        console.log('  ❌ 一场都没扫到嵌套 fact ⇒ 普查本身可能没跑起来，结论不可采信');
        problems.push('④ 藏匿点普查零结果 ⇒ 扫描没接上，本段结论不可采信（与 ① 同源的「测量本身先自证」要求）');
    } else {
        notes.push('④ 藏匿点普查覆盖 ' + spots.length + ' 个挂点字段（' + spots.map(s => s[0]).join(' / ')
            + '）⇒ 未见第三处藏匿点，第 163/164 两轮的补层对当前样本是完备的');
    }

    // ── 结论 ─────────────────────────────────────────────────────────
    console.log('---------------------------------------------------------');
    if (problems.length === 0) {
        console.log('✅ 信号通道守门通过：探针本体可用、clearAll 契约在位、node 侧 ' + SIGNAL_TYPES.BEFORE_SELECT_TARGET
            + ' 实发 ' + total + ' 次 ⇒ 走该信号的定向用例具备取证能力');
        if (SCAN_ONLY) console.log('（--scan 模式：只打印计数，不做棘轮断言）');
        process.exit(0);
    }
    console.log('❌❌ 信号通道守门失败 ' + problems.length + ' 条：');
    for (const p of problems) console.log('   · ' + p);
    if (SCAN_ONLY) { console.log('（--scan 模式：只打印，不改退码）'); process.exit(0); }
    process.exit(1);
}

function walkAll(dir) {
    const out = [];
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name === 'node_modules' || ent.name === '.mut' || ent.name === '.git') continue;
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) out.push(...walkAll(p));
        else out.push(p);
    }
    return out;
}

main().catch(e => { console.error('❌ 信号通道守门异常：', e); process.exit(1); });
