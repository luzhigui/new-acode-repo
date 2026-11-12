// tests/rewind-gate-park-probe-case.mjs — 倒针「推进闸门 + 停泊放行」动态探针（315 的取证件）
// 为什么需要这条：倒针回看是唯一允许「把战斗推进钉住」的地方。钉住靠 player/503 的步首闸门
//   `if (c._rewindGate) await c._rewindGate();`（player/503-player-core.js:142）——ui/727 挂上闸门，
//   主循环就停在步首；不挂，战斗就在回看面板背后偷跑（玩家看着回看，棋盘已经变了）。
//   退出时这块有三条互斥分支，任一条错了都出真故障：
//     A. 退出并「继续播」 ⇒ 闸门必须拆掉（否则战斗永远卡在步首）；
//     B. 退出并「停住」   ⇒ 闸门必须**保留**（画面钉住），且点主按钮「继续」时由停泊监听放行；
//     C. 退出时已不在战斗中 ⇒ 闸门必须拆掉、停泊监听必须撤。
//   现有静态规则只覆盖到「源码里有 _rewindGate 这个词」（265/258），盖不住「挂了没挂、保留没保留、
//   放行没放行」这三件事的运行时真相 ⇒ 本探针把 ui/727 真跑起来验。
// 探针怎么跑：最小 DOM/Store 桩 + 真 player/513 录制接口（见 rewind-probe-sandbox-case.mjs）。
//   进场时模拟 503 主循环走到步首 await 闸门（c._rewindGate()）：闸门 promise 保持 pending
//   ⇒ 这正是「战斗被钉住」的运行时形态；waitForGate 也会因此立刻返回，不用干等 2.5 秒。
// 反向样本（每条硬判据都有）：把 ui/727 真源码改坏后重跑同一套断言，必须红。
//   M1 no-gate        进场不挂闸门            → ① 红
//   M2 no-park-listen 停泊不注册 isPaused 监听 → ③ 红（点「继续」永远不放行 ⇒ 战斗卡死）
//   M3 no-release-gate 放行时不清闸门句柄     → ③b 红
//   M4 resume-no-clear 「继续播」不拆闸门      → ④ 红（战斗永远卡在步首）
// 运行：node tests/rewind-gate-park-probe-case.mjs
//   期望末行 RESULT: PASS（含反向样本全红）；任何一条红 → 退出码 1。
import {
    installDom, makeFakeStore, mkStep, loadRewind, runChildWithEnv, envSkipMarker, check, summarize, REPO
} from './rewind-probe-sandbox-case.mjs';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);

// ---- 变异体：每条都改 ui/727 真源码，改不到就报错（防「反向样本打空」假绿） ----
const MUTATIONS = {
    'no-gate': (src) => src.replace(
        "if (!wasParked) c._rewindGate = () => new Promise((resolve) => { S.gateResolve = resolve; });",
        "if (false) c._rewindGate = () => new Promise((resolve) => { S.gateResolve = resolve; });"),
    'no-park-listen': (src) => src.replace(
        "if (inBattle) armPark();",
        "if (inBattle) unarmPark();  // 故意不注册停泊监听"),
    'no-release-gate': (src) => src.replace(
        "if (c && c._rewindGate) c._rewindGate = null;",
        "if (c && c._rewindGate) { /* 故意不清闸门句柄 */ }"),
    'resume-no-clear': (src) => src.replace(
        "        unarmPark();\n        c._rewindGate = null;",
        "        unarmPark();  // 故意不拆闸门")
};

const R = [];

// ---- 装环境 ----
installDom();
const { GlobalStore, getPlayerContext } = await import('../infra/104-global-store.js');
const { STATE } = await import('../core/201-config-5v5-test.js');
const { FACT_TYPES } = await import('../infra/106-battle-enums.js');
const { startBattleRecording, feedBattleStep } = await import('../player/513-battle-export.js');
const rw = await loadRewind(process.env.HC_PROBE_MUT || '', MUTATIONS);

const store = makeFakeStore();
GlobalStore.set('battleStore', store);
GlobalStore.set('gs', STATE.RUNNING);
GlobalStore.set('isPaused', false);
GlobalStore.set('speed', 300);
GlobalStore.set('activeBuffs', []);
GlobalStore.set('battleLog', [{ text: '真账本-哨兵' }]);
GlobalStore.set('battleFacts', [{ factType: FACT_TYPES.ROUND_START, data: { round: 1 } }]);
startBattleRecording({ mode: 'probe' });
feedBattleStep(mkStep(['u1']), []);
feedBattleStep(mkStep(['u1', 'u2']), []);

const c = getPlayerContext();
c._removedUids = new Set();
c._deathTimers = {};
c._lastLogType = null;

// 进场：同步段已挂闸门；随后模拟 503 主循环走到步首 await 它（promise 保持 pending = 战斗被钉住）
let gatePromise = null;
async function enter() {
    const p = rw.enterReview();
    if (typeof c._rewindGate === 'function') {
        try { gatePromise = c._rewindGate(); } catch (e) { /* ignore */ }
    }
    return await p;
}

try {
    // ---------- ① 进场必须挂闸门 ----------
    const r1 = await enter();
    check(R, '进场成功（gs=RUNNING 且已有录制步）', !!(r1 && r1.ok), (r1 && r1.msg) || '');
    check(R, '① 进场必须挂推进闸门 c._rewindGate（战斗不得在回看面板背后偷跑）',
        typeof c._rewindGate === 'function', '类型=' + typeof c._rewindGate);
    let gateSettled = false;
    if (gatePromise && typeof gatePromise.then === 'function') gatePromise.then(() => { gateSettled = true; });
    await new Promise(r => setTimeout(r, 20));
    check(R, '① 闸门 promise 仍 pending（主循环停在步首，没偷跑）', gateSettled === false,
        'settled=' + gateSettled);

    // ---------- ② 退出并停住 ⇒ 闸门保留 + 真暂停 ----------
    rw.exitReview({ resume: false });
    check(R, '② 停泊退出后闸门保留（画面钉住，等用户点「继续」）',
        typeof c._rewindGate === 'function', '类型=' + typeof c._rewindGate);
    check(R, '② 停泊退出后 isPaused=true', GlobalStore.get('isPaused') === true);
    check(R, '② 停泊退出后 gs=PAUSED', GlobalStore.get('gs') === STATE.PAUSED);

    // ---------- ③ 点主按钮「继续」⇒ 停泊监听放行闸门 ----------
    let released = false;
    if (gatePromise && typeof gatePromise.then === 'function') gatePromise.then(() => { released = true; });
    GlobalStore.set('isPaused', false);
    await new Promise(r => setTimeout(r, 30));
    check(R, '③ 点「继续」后闸门 promise 被放行（主循环能接着走）', released === true,
        'released=' + released);
    check(R, '③ 点「继续」后闸门句柄被清（c._rewindGate=null）', c._rewindGate === null,
        '类型=' + typeof c._rewindGate);

    // ---------- ④ 退出并「继续播」⇒ 闸门必须拆 ----------
    await enter();
    rw.exitReview({ resume: true });
    check(R, '④ 「继续播」退出后闸门必须拆掉（否则战斗永远卡在步首）', c._rewindGate === null,
        '类型=' + typeof c._rewindGate);
    check(R, '④ 「继续播」退出后 gs=RUNNING', GlobalStore.get('gs') === STATE.RUNNING);
    check(R, '④ 「继续播」退出后 isPaused=false', GlobalStore.get('isPaused') === false);
} catch (e) {
    check(R, '探针执行不抛异常', false, String((e && e.message) || e));
} finally {
    try { rw.exitReview({ resume: false }); } catch (e) { /* ignore */ }
}

// ---------- 反向样本自证：每条变异必须让本用例红 ----------
// 判定口径：子进程必须自己报出「RESULT: FAIL」（退出码非 0 但没报红 = 崩了，不算有效反向样本）
const mutNames = Object.keys(MUTATIONS);
if (!process.env.HC_PROBE_MUT) {
    for (const name of mutNames) {
        const child = runChildWithEnv(SELF, { HC_PROBE_MUT: name });
        // 环境压根起不来子进程 ⇒ 不是主代码缺陷，宣告前提失效（规则据此 skip，不报红）
        if (child.spawnError) {
            console.log(envSkipMarker('变异子进程起不来：' + child.spawnError));
            process.exit(0);
        }
        const crashed = /Error:|没改到任何字符/.test(child.out);
        const red = /RESULT:\s*FAIL/.test(child.out);
        const which = (child.out.match(/✗\s*(.+)/g) || []).map(s => s.replace(/✗\s*/, '').split(' — ')[0]);
        check(R, '反向样本「' + name + '」必须让本用例报红', red && !crashed,
            red ? ('红在：' + which.join(' / ')) : ('子进程没报红' + (crashed ? '（崩了）' : '') + ' ⇒ 这条判据没咬住'));
    }
}

const ok = summarize(R, '倒针推进闸门 + 停泊放行');
// 变异子进程自己跑时：期望它红（退出码 1），父进程据此判定「反向样本有效」
if (process.env.HC_PROBE_MUT) process.exit(ok ? 0 : 1);
process.exit(ok ? 0 : (process.exitCode || 1));
