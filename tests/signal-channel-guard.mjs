// V1.0.0 | 2026-10-31 夜间第 163 轮：node 侧信号通道守门 —— 防「探针自己没接上，却下定论的通道不通」
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
export const VER = 'tests/signal-channel-guard.mjs V1.0.0';

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
    const SCANNERS = [
        'tests/fact-emission-census.mjs',
        'tests/structural-dead-branch-scan.mjs',
        'tests/rules-replay.mjs',
        'tests/phantom-confuse-brother-case.mjs'
    ];
    for (const rel of SCANNERS) {
        const p = path.join(root, rel);
        if (!fs.existsSync(p)) { problems.push('③ 目标脚本不存在：' + rel); continue; }
        const t = fs.readFileSync(p, 'utf8');
        const ok = t.includes('phantomFact');
        console.log('  ' + (ok ? '✅' : '❌') + ' ' + rel + (ok ? ' 已认 phantomFact 层' : ' **不认** phantomFact ⇒ 本体型 fact 对它不可见'));
        if (!ok) problems.push('③ ' + rel + ' 的 fact 采集没覆盖 data.phantomFact ⇒ 幻影 fact 恒读成零命中，可能误导核销建议');
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
