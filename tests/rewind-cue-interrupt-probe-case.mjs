// tests/rewind-cue-interrupt-probe-case.mjs — 倒针「段拨打断收敛 + 连续播放停点释放」动态探针（317 的取证件）
// 为什么需要这条（上一棒自己列的运行时证据空白之二）：
//   ① 段拨被新段拨打断时的状态收敛：ui/727 的 scrubToCue 用 `token = ++S.cueToken` 做打断守卫，
//      被打断的那一次应当在 await 之后**立刻收手**（`if (token !== S.cueToken) return;`）。
//      守卫一旦失效，被打断的旧段拨会在事后把自己的日志行补回来 —— 玩家停在第 1 步，
//      日志里却出现了第 2 步的行：画面/日志与位置对不上，而且下次同步才会被悄悄抹掉。
//      静态规则（273/265）只查「源码里有没有那个 token 判断」，盖不住「守卫真的生效吗」。
//   ② 连续播放的停点释放：pausePlay 只打「到下一个停点就停」的标记，resumePlay 必须把停点
//      那个挂起的等待**真的放行**（`S.playRelease` 兑现）；不放行 ⇒ 播放永久卡在停点，
//      面板上「继续」按钮点了没反应。258 只静态查了这两句的存在。
// 探针怎么跑：复用共用沙箱（DOM/Store 桩 + 变异体工厂），另加两样保真：
//   · rAF 桩 + 启动 infra/103 的时钟（不然 clock.wait() 永不 resolve，播放路径会挂死）；
//   · log 元素的 innerHTML ↔ children 联动（真 DOM 里 innerHTML='' 会清空子节点，不联动就看不见日志行数）。
// 反向样本（每条硬判据都有）：改坏 ui/727 真源码重跑必须红在对应那条判据上。
//   M1 no-token-guard  去掉段拨的打断守卫        → ① 红
//   M2 pause-no-flag   pausePlay 不打停点标记    → ② 红
//   M3 no-play-release resumePlay 不放行停点      → ③ 红
// 运行：node tests/rewind-cue-interrupt-probe-case.mjs
//   期望末行 RESULT: PASS（含反向样本全红）；任何一条红 → 退出码 1。
import {
    installDom, upgradeLogDomFidelity, installClockShim, makeFakeStore, mkStep,
    loadRewind, runChildWithEnv, envSkipMarker, check, summarize
} from './rewind-probe-sandbox-case.mjs';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);

// ---- 变异体：每条都改 ui/727 真源码，改不到就报错（防「反向样本打空」假绿） ----
const MUTATIONS = {
    'no-token-guard': (src) => src.replace(/if \(token !== S\.cueToken\) return;/g, '/* 故意去掉打断守卫 */'),
    'pause-no-flag': (src) => src.replace('    S.stopPlay = true;\n    S.playing = false;', '    S.playing = false;'),
    'no-play-release': (src) => src.replace('        r();\n        return;', '        /* 故意不放行停点 */\n        return;')
};
// 每条变异必须红在哪条判据上（子进程输出的 ✗ 行里要能对上）
const MUT_EXPECT = {
    'no-token-guard': '① 被打断的旧段拨不得在事后把自己的日志行补回来',
    'pause-no-flag': '②b 停住时播放仍在运行态（busy=true）⇒ 是停在停点，不是已经播完了',
    'no-play-release': '③ 「继续」必须真放行停点（播放继续推进）'
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
    clock.resume();                                   // 上一场留下的 isPaused=true 会把时钟冻住
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
const pos = () => rw.getView().stepIdx + ':' + rw.getView().cueIdx;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

try {
    // ================= ① 段拨被新段拨打断 → 状态收敛 =================
    {
        const { store } = setupScene();
        logEl.innerHTML = REAL_LOG;
        await rw.enterReview();
        // 初始位置 = 最后一步最后一段；第一次 prevCue 落「整步落账」（同步），
        // 第二次落「日志段」（要等 clock.wait ⇒ 有 await 窗口），第三次把它打断。
        rw.prevCue();
        rw.prevCue();
        rw.prevCue();
        await sleep(900);
        const v = rw.getView();
        const rows = logEl.children.length;
        check(R, '① 被打断后最终位置必须是最后一次操作的目标（第 1 步 / 死亡特效段）',
            v.stepIdx === 1 && v.cueIdx === 2, 'stepIdx=' + v.stepIdx + ' cueIdx=' + v.cueIdx);
        check(R, '① 被打断的旧段拨不得在事后把自己的日志行补回来',
            rows === v.stepIdx + 1, '日志行数=' + rows + '，按最终位置应为 ' + (v.stepIdx + 1));
        rw.exitReview({ resume: false });
        await sleep(50);
    }

    // ================= ②③ 连续播放的停点释放 =================
    {
        setupScene();
        logEl.innerHTML = REAL_LOG;
        await rw.enterReview();
        rw.startPlay();                       // 连续播放（不等它跑完）
        await sleep(60);
        rw.pausePlay();                       // 只打「到下一个停点就停」的标记
        await sleep(600);                     // 等它跑到停点并挂住
        const p1 = pos();
        const b1 = rw.getView().busy;
        await sleep(400);
        const p2 = pos();
        check(R, '② 连续播放必须在停点停住（进度不再前进）', p1 === p2, '停住于 ' + p1 + '，400ms 后 ' + p2);
        check(R, '②b 停住时播放仍在运行态（busy=true）⇒ 是停在停点，不是已经播完了',
            b1 === true, 'busy=' + b1);
        check(R, '② 停住后 playing 必须为 false', rw.getView().playing === false,
            'playing=' + rw.getView().playing);
        rw.resumePlay();                      // 必须真放行那个挂起的等待
        await sleep(800);
        const p3 = pos();
        const b3 = rw.getView().busy;
        check(R, '③ 「继续」必须真放行停点（播放继续推进）', p3 !== p1, '停住于 ' + p1 + '，继续后 ' + p3);
        check(R, '③b 继续后播放必须走完（busy 归 false）⇒ 不是卡在停点',
            b3 === false, 'busy=' + b3);
        let dupThrew = null;
        try { rw.resumePlay(); } catch (e) { dupThrew = String((e && e.message) || e); }
        check(R, '③ 重复点「继续」不得抛异常', !dupThrew, dupThrew || '');
        rw.exitReview({ resume: false });
        await sleep(50);
    }
} catch (e) {
    check(R, '探针执行不抛异常', false, String((e && e.message) || e));
} finally {
    try { rw.exitReview({ resume: false }); } catch (e) { /* ignore */ }
    try { clock.stop(); } catch (e) { /* ignore */ }
}

// ---------- 反向样本自证：每条变异必须红在指定判据上 ----------
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
        const which = (child.out.match(/✗\s*(.+)/g) || []).map(s => s.replace(/✗\s*/, '').split(' — ')[0]);
        const hit = which.some(w => w.indexOf(MUT_EXPECT[name]) >= 0);
        check(R, '反向样本「' + name + '」必须红在指定判据上（' + MUT_EXPECT[name] + '）',
            red && !crashed && hit,
            red ? ('红在：' + which.join(' / ')) : ('子进程没报红' + (crashed ? '（崩了）' : '') + ' ⇒ 这条判据没咬住'));
    }
}

const ok = summarize(R, '倒针段拨打断收敛 + 连续播放停点释放');
if (process.env.HC_PROBE_MUT) process.exit(ok ? 0 : 1);
process.exit(ok ? 0 : (process.exitCode || 1));
