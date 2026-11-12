// 倒针推进闸门 + 停泊放行（运行时探针）：回看期间战斗必须被钉在步首，退出后必须能放行。
// 为什么需要：倒针是唯一允许「把战斗推进钉住」的地方。钉住靠 player/503 的步首闸门
//   `if (c._rewindGate) await c._rewindGate();`（player/503-player-core.js:142）——ui/727 挂上闸门，
//   主循环就停在步首；不挂，战斗就在回看面板背后偷跑（玩家看着回看，棋盘已经变了）。
//   退出这块有三条互斥分支，任一条错了都出真故障：
//     A. 退出并「继续播」⇒ 闸门必须拆（否则战斗永远卡在步首）；
//     B. 退出并「停住」  ⇒ 闸门必须保留（画面钉住），点主按钮「继续」时由停泊监听放行；
//     C. 退出时已不在战斗中 ⇒ 闸门必须拆、停泊监听必须撤。
//   现有静态规则只到「源码里出现过 _rewindGate 这个词」（258/265），盖不住「挂了没挂、保留没保留、
//   放行没放行」这三件事的运行时真相 ⇒ 本规则调用合成探针
//   tests/rewind-gate-park-probe-case.mjs：最小 DOM/Store 桩 + 真 player/513 录制接口，真跑
//   enterReview → exitReview(停住) → 点「继续」→ enterReview → exitReview(继续播)，逐条断言：
//     ① 进场必须挂闸门，且闸门 promise 仍 pending（主循环真停在步首）；
//     ② 停住退出：闸门保留 + isPaused=true + gs=PAUSED；
//     ③ 点「继续」：闸门 promise 被放行、句柄被清；
//     ④ 「继续播」退出：闸门拆掉 + gs=RUNNING + isPaused=false。
//   探针自带 4 条反向样本（改坏 ui/727 真源码重跑必须红），保证上面每条判据都真会咬。
// 为什么是子进程：探针要自建 document/window/localStorage 桩，不能污染本 runner 的运行时；
//   进程隔离 + 结果缓存（156 场只跑一次），失败信息原样带回。
export const VER = 'tests/health-rules/315-rewind-gate-park-runtime.js V1.0.0';

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PROBE = fileURLToPath(new URL('../rewind-gate-park-probe-case.mjs', import.meta.url));
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
let _cached = null;

function runProbe() {
    if (_cached) return _cached;
    try {
        const out = execFileSync(process.execPath, [PROBE], {
            cwd: ROOT,
            encoding: 'utf8',
            timeout: 180000,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        _cached = { ok: /RESULT:\s*PASS/.test(out), out: out };
    } catch (e) {
        _cached = {
            ok: false,
            out: String((e && (e.stdout || '')) || '') + String((e && (e.stderr || '')) || '') + ' [exit=' + (e && e.status) + ']'
        };
    }
    return _cached;
}

export const rule315 = {
    group: '战报与渲染一致性',
    name: '倒针推进闸门与停泊放行(运行时)',
    test: function(ctx, log) {
        const r = runProbe();
        if (!r.ok) {
            const tail = (r.out || '').split('\n').filter(l => /✗|RESULT|Error/i.test(l)).slice(-6).join(' | ');
            return { fail: true, msg: '倒针闸门/停泊探针未通过（战斗可能在回看背后偷跑，或退出后卡在步首）：' + (tail || '无输出') };
        }
        return { fail: false, msg: '运行时探针 PASS：进场挂闸门且主循环停在步首 / 停住退出保留闸门 / 点「继续」放行 / 「继续播」退出拆闸门（4 条反向样本全红）' };
    }
};
