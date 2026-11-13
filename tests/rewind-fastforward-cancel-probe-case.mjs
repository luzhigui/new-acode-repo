// tests/rewind-fastforward-cancel-probe-case.mjs — 倒针「快进收尾与取消」动态探针（318 的取证件）
// 为什么需要这条（上一棒自己列的运行时证据空白之三）：
//   快进（fastForward）是倒针面板里唯一会自己改画面的入口：它把进度一路摆到录制末步，
//   然后在 finally 里 exitReview（真暂停）。这条路径有两处必须被钉死：
//   ① 快进期间必须置 busy（面板据此禁重复操作），快进完成后必须收敛成「已退出回看 + 真暂停 +
//      倍速还原 + 两份账本按引用还原」；
//   ② **快进的尾巴不得越界动真战场**：用户在快进途中关掉面板（取消）时，尾巴仍会跑
//      syncReviewLog —— 而此时 #log 已经被还原成「真战场的战报行」，尾巴那次同步会把它们
//      当成「多出来的行」整块清掉 ⇒ 玩家继续打的时候，战报日志凭空消失。
//      根因：尾巴不知道自己负责的那一回看还在不在（没有会话代次概念），也没有判断
//      「回看已经被换掉了」⇒ 转交主代码修（见 known-transfers + 转交块）。
// 探针怎么跑：复用共用沙箱（DOM/Store 桩 + 变异体工厂），另加 rAF 桩（让时钟走起来）
//   与 log 元素 innerHTML ↔ children 联动（不然「清空真账本」在桩上根本看不见）。
// 反向样本：改坏 ui/727 真源码重跑必须红在对应判据上。
// 运行：node tests/rewind-fastforward-cancel-probe-case.mjs
//   期望末行 RESULT: PASS；任何一条红 → 退出码 1。
// ★ 主代码已在 fcd5dd04 落地会话代次守卫（mySteps）⇒ ③ 转绿；原「修好样本」fix-tail-guard
//   随之失去意义，改配「去掉守卫」样本 no-tail-guard：把两处守卫删掉，③ 必须由绿转红，
//   证明这条判据咬的正是那两行守卫。
import {
    installDom, upgradeLogDomFidelity, installClockShim, makeFakeStore, mkStep,
    loadRewind, runChildWithEnv, envSkipMarker, check, summarize
} from './rewind-probe-sandbox-case.mjs';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);

// ---- 变异体：每条都改 ui/727 真源码，改不到就报错（防「反向样本打空」假绿） ----
const MUTATIONS = {
    'no-busy': (src) => src.replace('    S.busy = true;\n    try {', '    try {'),
    'ff-resume': (src) => src.replace('if (S.steps === mySteps) exitReview({ resume: false });', 'if (S.steps === mySteps) exitReview({ resume: true });'),
    // 「去掉守卫」样本：删掉两处会话代次守卫 ⇒ 取消后尾巴又去 syncReviewLog，③ 必须转红
    'no-tail-guard': (src) => src
        .replace('        if (S.steps !== mySteps) return;   // 回看已被换掉（取消/重开）就整体收手，不再碰画面与日志\n', '')
        .replace('if (S.steps === mySteps) exitReview({ resume: false });', 'exitReview({ resume: false });')
};
// expect: 'red' = 必须红在指定判据上；'green' = 必须整份转绿（当前无此类样本，分支保留）
const MUT_EXPECT = {
    'no-busy': { mode: 'red', at: '① 快进期间必须置 busy（面板据此禁重复操作）' },
    'ff-resume': { mode: 'red', at: '② 快进完成后必须收敛：回看已退出 + 真暂停 + 倍速还原' },
    'no-tail-guard': { mode: 'red', at: '③ 快进被取消时，尾巴不得清空真战场的 #log' }
};

const R = [];

// ---- 装环境 ----
installDom();
upgradeLogDomFidelity();
const clock = await installClockShim();
const { GlobalStore, getPlayerContext } = await import('../infra/104-global-store.js');
const { STATE } = await import('../core/201-config-5v5-test.js');
const { FACT_TYPES } = await import('../infra/106-battle-enums.js');
const { startBattleRecording, feedBattleStep } = await import('../player/513-battle-export.js');
const rw = await loadRewind(process.env.HC_PROBE_MUT || '', MUTATIONS);

const REAL_LOG = '<div>真账本行1</div><div>真账本行2</div>';
const logEl = globalThis.document.getElementById('log');
const MARK_LOG = [{ text: '真账本-日志-哨兵' }];
const MARK_FACTS = [{ factType: FACT_TYPES.ROUND_START, data: { round: 1 } }];

function setupScene() {
    clock.resume();
    const store = makeFakeStore();
    GlobalStore.set('battleStore', store);
    GlobalStore.set('gs', STATE.RUNNING);
    GlobalStore.set('isPaused', false);
    GlobalStore.set('speed', 300);
    GlobalStore.set('activeBuffs', []);
    GlobalStore.set('battleLog', MARK_LOG);
    GlobalStore.set('battleFacts', MARK_FACTS);
    startBattleRecording({ mode: 'probe' });
    for (let r = 1; r <= 3; r++) {
        const uids = ['u1', 'u2', 'u3'].slice(0, r);
        feedBattleStep(mkStep(uids, { log: [{ factType: FACT_TYPES.ROUND_START, data: { round: r } }] }), []);
    }
    const c = getPlayerContext();
    c._removedUids = new Set();
    c._deathTimers = {};
    c._lastLogType = null;
    return { store, c };
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

try {
    // ================= ① 快进期间必须置 busy =================
    {
        setupScene();
        logEl.innerHTML = REAL_LOG;
        await rw.enterReview();
        const p = rw.fastForward();          // 不等它跑完：先看「快进期间」的状态
        check(R, '① 快进期间必须置 busy（面板据此禁重复操作）', rw.getView().busy === true,
            'busy=' + rw.getView().busy);
        await p;
        // ================= ② 快进完成后必须收敛 =================
        check(R, '② 快进完成后必须收敛：回看已退出 + 真暂停 + 倍速还原',
            rw.getView().active === false && GlobalStore.get('gs') === STATE.PAUSED
            && GlobalStore.get('isPaused') === true && GlobalStore.get('speed') === 300,
            'active=' + rw.getView().active + ' gs=' + GlobalStore.get('gs')
            + ' isPaused=' + GlobalStore.get('isPaused') + ' speed=' + GlobalStore.get('speed'));
        check(R, '② 快进完成后两份账本按引用还原',
            GlobalStore.get('battleLog') === MARK_LOG && GlobalStore.get('battleFacts') === MARK_FACTS);
    }

    // ================= ③ 快进被取消 ⇒ 尾巴不得动真战场 =================
    {
        setupScene();
        logEl.innerHTML = REAL_LOG;           // 真战场已经有战报行
        await rw.enterReview();
        const p = rw.fastForward();           // 快进开始（内部有 30ms 的等待窗口）
        rw.exitReview({ resume: false });     // 用户取消：关掉面板
        await p;                               // 等快进的尾巴跑完
        const html = String(logEl.innerHTML || '');
        check(R, '③ 快进被取消时，尾巴不得清空真战场的 #log（真账本必须还在）',
            logEl.children.length > 0 && html.indexOf('真账本行1') >= 0,
            'rows=' + logEl.children.length + ' html=' + JSON.stringify(html.slice(0, 40)));
    }
} catch (e) {
    check(R, '探针执行不抛异常', false, String((e && e.message) || e));
} finally {
    try { rw.exitReview({ resume: false }); } catch (e) { /* ignore */ }
    try { clock.stop(); } catch (e) { /* ignore */ }
}

// ---------- 反向样本自证 ----------
const mutNames = Object.keys(MUTATIONS);
if (!process.env.HC_PROBE_MUT) {
    for (const name of mutNames) {
        const child = runChildWithEnv(SELF, { HC_PROBE_MUT: name });
        if (child.spawnError) {
            console.log(envSkipMarker('变异子进程起不来：' + child.spawnError));
            process.exit(0);
        }
        const crashed = /Error:|没改到任何字符/.test(child.out);
        const red = /RESULT:\s*FAIL/.test(child.out);
        const green = /RESULT:\s*PASS/.test(child.out);
        const which = (child.out.match(/✗\s*(.+)/g) || []).map(s => s.replace(/✗\s*/, '').split(' — ')[0]);
        const exp = MUT_EXPECT[name];
        if (exp.mode === 'red') {
            const hit = which.some(w => w.indexOf(exp.at) >= 0);
            check(R, '反向样本「' + name + '」必须红在指定判据上（' + exp.at + '）',
                red && !crashed && hit,
                red ? ('红在：' + which.join(' / ')) : ('子进程没报红' + (crashed ? '（崩了）' : '') + ' ⇒ 这条判据没咬住'));
        } else {
            // 修好样本：必须整份转绿（证明这条判据咬的正是这个缺陷）
            const stillRed = which.filter(w => w.indexOf(exp.at) >= 0);
            check(R, '修好样本「' + name + '」必须让「' + exp.at + '」由红转绿',
                green && !crashed && stillRed.length === 0,
                '子进程 ' + (green ? '绿' : '红') + '，仍红：' + (stillRed.join(' / ') || '无'));
        }
    }
}

const ok = summarize(R, '倒针快进收尾与取消');
if (process.env.HC_PROBE_MUT) process.exit(ok ? 0 : 1);
process.exit(ok ? 0 : (process.exitCode || 1));
