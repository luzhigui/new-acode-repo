// 倒针回看快照语义 + 退出还原终点（运行时探针）：回看定格在进场那一刻，退出还原到真实战场那一步。
// 为什么需要：倒针进场对战场做了一份快照（步数 / 账本 / 倍速 / 暂停态 / 尸格名单），退出时逐项还原。
//   这里有两个最容易出真故障、又最难静态看出来的点：
//     ① 步数必须**定格在进场那一刻**。回看期间真播还在往前走（战斗没停，只是被闸门钉在步首），
//        若回看拿着活数组，玩家会在回看里看到进场之后的内容 —— 进度条、段拨、「快进到底」的终点
//        全跟着错，而且错得很自然（看起来像回放正常）。
//     ② 退出还原的终点必须是**真实战场那一步**（c._rewindLastStep，player/503 记的「最后播完的一步」），
//        不能是玩家在回看里最后拨到的那一步。否则退出后画面留在回看位置 —— 玩家以为退出了倒针，
//        其实棋盘停在几百回合前，真打起来全错位。
//   现有静态规则只到「源码里出现过 _rewindLastStep」（265 判据④），盖不住「运行时到底还原到了哪一步」；
//   274 只静态查了「退出必须无条件还原 speed」，盖不住「快照里根本没存 speed ⇒ 退出时 set(undefined) 直接抛」。
//   ⇒ 本规则调用合成探针 tests/rewind-snapshot-restore-probe-case.mjs：最小 DOM/Store 桩 +
//   真 player/513 录制接口，三步各有不同阵容（u1 / u1u2 / u1u2u3），用「store 里有哪些单位」
//   当「现在停在第几步」的指纹，真跑 enterReview → 拨回第 0 步 → 退出，逐条断言：
//     ① 进场后回看总步数 = 进场时的已录步数；
//     ② 回看期间真播新增的步不得进入回看（进度定格）；
//     ③ 退出后画面还原到真实战场那一步，不是玩家拨到的那一步；
//     ④ 退出后回看态全清（active=false / 步数归零 / 静默关 / 两份账本按引用还原）；
//     ⑤ 退出后倍速回到进场快照值；
//     ⑥ 退出回看不抛异常。
//   探针自带 4 条反向样本（改坏 ui/727 真源码重跑必须红），保证上面每条判据都真会咬。
// 为什么是子进程：探针要自建 document/window/localStorage 桩，不能污染本 runner 的运行时；
//   进程隔离 + 结果缓存（156 场只跑一次），失败信息原样带回。
export const VER = 'tests/health-rules/316-rewind-snapshot-restore-runtime.js V1.0.0';

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PROBE = fileURLToPath(new URL('../rewind-snapshot-restore-probe-case.mjs', import.meta.url));
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

export const rule316 = {
    group: '战报与渲染一致性',
    name: '倒针回看快照与退出还原终点(运行时)',
    test: function(ctx, log) {
        const r = runProbe();
        if (!r.ok) {
            const tail = (r.out || '').split('\n').filter(l => /✗|RESULT|Error/i.test(l)).slice(-6).join(' | ');
            return { fail: true, msg: '倒针快照/还原探针未通过（回看看到进场后的内容，或退出后停在回看位置/倍速没还原）：' + (tail || '无输出') };
        }
        return { fail: false, msg: '运行时探针 PASS：回看进度定格在进场那一刻 / 退出还原到真实战场那一步 / 回看态与倍速全还原（4 条反向样本全红）' };
    }
};
