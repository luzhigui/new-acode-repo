// tests/rewind-snapshot-restore-probe-case.mjs — 倒针「回看快照语义 + 退出还原终点」动态探针（316 的取证件）
// 为什么需要这条：倒针进场时对「战场」做了一份快照（步数 / 账本 / 倍速 / 暂停态 / 尸格名单），
//   退出时按快照逐项还原。这里有两个最容易出真故障、又最难静态看出来的点：
//   ① 步数必须**定格在进场那一刻**：回看期间真播还在往前走（战斗没停，只是被闸门钉在步首），
//      若回看拿着「活数组」而不是快照，玩家会在回看里看到进场之后的内容 —— 进度条、段拨、
//      「快进到底」的终点全跟着错，而且错得很自然（看起来像回放正常）。
//   ② 退出还原的终点必须是**真实战场那一步**（c._rewindLastStep，player/503 记的「最后播完的一步」），
//      不能是玩家在回看里最后拨到的那一步。否则退出后画面留在回看位置 —— 玩家以为退出了倒针，
//      其实棋盘停在几百回合前，真打起来全错位。
//   现有静态规则只到「源码里出现过 _rewindLastStep」（265 判据④），盖不住「运行时到底还原到了哪一步」。
// 探针怎么跑：最小 DOM/Store 桩 + 真 player/513 录制接口（见 rewind-probe-sandbox-case.mjs），
//   三步各有不同阵容（u1 / u1u2 / u1u2u3），用「store 里有哪些单位」当「现在停在第几步」的指纹。
// 反向样本（每条硬判据都有）：把 ui/727 真源码改坏后重跑同一套断言，必须红。
//   M1 steps-live              步数不定格（拿活数组）  → ② 红
//   M2 restore-to-player-step   退出还原到玩家拨到的那步 → ③ 红
//   M3 no-clear-steps          退出不清步数            → ④ 红
//   M4 snapshot-no-speed       快照漏存倍速            → ⑤/⑥ 红（退出时 set(speed, undefined) 直接抛）
// 运行：node tests/rewind-snapshot-restore-probe-case.mjs
//   期望末行 RESULT: PASS（含反向样本全红）；任何一条红 → 退出码 1。
import {
    installDom, makeFakeStore, mkStep, loadRewind, runMutantChild, check, summarize, REPO
} from './rewind-probe-sandbox-case.mjs';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);

// ---- 变异体：每条都改 ui/727 真源码，改不到就报错（防「反向样本打空」假绿） ----
const MUTATIONS = {
    'steps-live': (src) => src.replace(
        "S.steps = steps.slice();",
        "S.steps = steps;  // 故意不定格：拿活数组"),
    'restore-to-player-step': (src) => src.replace(
        "const last = c._rewindLastStep || S.steps[S.steps.length - 1];",
        "const last = S.steps[Math.max(0, S.stepIdx)];  // 故意还原到玩家拨到的那一步"),
    'no-clear-steps': (src) => src.replace(
        "    S.steps = [];\n    S.cueCache.clear();",
        "    /* 故意不清步数 */\n    S.cueCache.clear();"),
    'snapshot-no-speed': (src) => src.replace(
        "        speed: GlobalStore.get('speed'),",
        "        /* 故意漏存倍速 */")
};

const R = [];

// ---- 装环境 ----
installDom();
const { GlobalStore, getPlayerContext } = await import('../infra/104-global-store.js');
const { STATE } = await import('../core/201-config-5v5-test.js');
const { FACT_TYPES } = await import('../infra/106-battle-enums.js');
const { startBattleRecording, feedBattleStep, getLiveRecordedSteps } = await import('../player/513-battle-export.js');
const rw = await loadRewind(process.env.HC_PROBE_MUT || '', MUTATIONS);

const store = makeFakeStore();
const MARK_LOG = [{ text: '真账本-日志-哨兵' }];
const MARK_FACTS = [{ factType: FACT_TYPES.ROUND_START, data: { round: 1 } }];
GlobalStore.set('battleStore', store);
GlobalStore.set('gs', STATE.RUNNING);
GlobalStore.set('isPaused', false);
GlobalStore.set('speed', 300);
GlobalStore.set('activeBuffs', []);
GlobalStore.set('battleLog', MARK_LOG);
GlobalStore.set('battleFacts', MARK_FACTS);

// 三步各有不同阵容：用「store 里有哪些单位」当「现在停在第几步」的指纹
startBattleRecording({ mode: 'probe' });
feedBattleStep(mkStep(['u1']), []);
feedBattleStep(mkStep(['u1', 'u2']), []);
feedBattleStep(mkStep(['u1', 'u2', 'u3']), []);

const c = getPlayerContext();
c._removedUids = new Set();
c._deathTimers = {};
c._lastLogType = null;

const uids = () => (store.getState().units || []).map(u => u.uid).sort().join(',');

try {
    // ---------- ① 进场定格步数 ----------
    const r1 = await rw.enterReview();
    check(R, '进场成功（gs=RUNNING 且已录 3 步）', !!(r1 && r1.ok), (r1 && r1.msg) || '');
    check(R, '① 进场后回看总步数 = 进场时的已录步数（3）', rw.getView().stepCount === 3,
        'stepCount=' + rw.getView().stepCount);

    // ---------- ② 回看期间真播再录一步 ⇒ 回看不得看到它 ----------
    feedBattleStep(mkStep(['u1', 'u2', 'u3', 'u4']), []);
    check(R, '② 回看期间真播新增的步不得进入回看（进度定格在进场那一刻）',
        rw.getView().stepCount === 3, 'stepCount=' + rw.getView().stepCount);

    // ---------- ③ 退出还原终点 = 真实战场那一步，不是玩家拨到的那一步 ----------
    rw.prevStep();   // 第 2 步 → 第 1 步
    rw.prevStep();   // 第 1 步 → 第 0 步
    check(R, '（前置）玩家已把进度拨到第 0 步', rw.getView().stepIdx === 0,
        'stepIdx=' + rw.getView().stepIdx);
    check(R, '（前置）拨到第 0 步后 store 落在第 0 步的阵容', uids() === 'u1', 'units=' + uids());
    // 真实战场停在第 2 步（player/503 每播完一步记 c._rewindLastStep）
    c._rewindLastStep = getLiveRecordedSteps()[2];

    // ---------- ④⑤⑥ 退出：还原终点 / 全清 / 倍速还原 / 不抛异常 ----------
    GlobalStore.set('speed', 999);           // 回看期间外部改了倍速（模拟用户滑速）
    let exitErr = null;
    try { rw.exitReview({ resume: false }); } catch (e) { exitErr = e; }
    check(R, '⑥ 退出回看不抛异常', !exitErr, exitErr ? String((exitErr && exitErr.message) || exitErr) : '');
    check(R, '③ 退出后画面还原到真实战场那一步（第 2 步阵容 u1,u2,u3），不是玩家拨到的第 0 步',
        uids() === 'u1,u2,u3', 'units=' + uids());
    check(R, '④ 退出后回看态全清（active=false / 步数归零 / 静默关）',
        rw.getView().active === false && rw.getView().stepCount === 0 && c.isRewinding === false,
        'active=' + rw.getView().active + ' stepCount=' + rw.getView().stepCount + ' isRewinding=' + c.isRewinding);
    check(R, '④ 退出后两份账本按引用还原', GlobalStore.get('battleLog') === MARK_LOG
        && GlobalStore.get('battleFacts') === MARK_FACTS);
    check(R, '⑤ 退出后倍速回到进场快照值（300），不能留回看期间的 999',
        GlobalStore.get('speed') === 300, 'speed=' + GlobalStore.get('speed'));
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
        const child = runMutantChild(SELF, name);
        const crashed = /Error:|没改到任何字符/.test(child.out);
        const red = /RESULT:\s*FAIL/.test(child.out);
        const which = (child.out.match(/✗\s*(.+)/g) || []).map(s => s.replace(/✗\s*/, '').split(' — ')[0]);
        check(R, '反向样本「' + name + '」必须让本用例报红', red && !crashed,
            red ? ('红在：' + which.join(' / ')) : ('子进程没报红' + (crashed ? '（崩了）' : '') + ' ⇒ 这条判据没咬住'));
    }
}

const ok = summarize(R, '倒针回看快照语义 + 退出还原终点');
if (process.env.HC_PROBE_MUT) process.exit(ok ? 0 : 1);
process.exit(ok ? 0 : (process.exitCode || 1));
