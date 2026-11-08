// 回看静默期账本零写入（动态探针）：把 ui/727 真跑起来，验证回看期间真实账本一笔都不动。
// 静态规则 289 只能证明「源码上只有 enter/exit 会换账本」；它无法证明运行时真的没写到旧数组
//   （例如某处 cache 了旧引用再 push、或退出时机错位）。本规则调用合成探针
//   tests/rewind-write-probe-case.mjs：最小 DOM/Store 桩 + 真录制接口，真跑
//   enterReview → 步进/段拨 → startPlay → exitReview → 二次进场 fastForward，逐条断言：
//     ① 回看期间 battleLog/battleFacts 已换成临时数组（引用不等于真账本）；
//     ② 定位/播放期间真账本内容与长度不变、且没有任何 set 写账本键；
//     ③ 退出后两份账本按「引用」还原、isRewinding 复位 false、重复进出不抛异常。
// 为什么是子进程：探针要自建 document/window/localStorage 桩，不能污染本 runner 的运行时；
//   进程隔离 + 结果缓存（156 场只跑一次，约 6 秒），失败信息原样带回。
export const VER = 'tests/health-rules/254-rewind-write-dynamic.js V1.0.0';

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PROBE = fileURLToPath(new URL('../rewind-write-probe-case.mjs', import.meta.url));
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
let _cached = null;

function runProbe() {
    if (_cached) return _cached;
    try {
        const out = execFileSync(process.execPath, [PROBE], {
            cwd: ROOT,
            encoding: 'utf8',
            timeout: 60000,
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

export const rule254 = {
    group: '战报与渲染一致性',
    name: '回看静默期账本零写入(动态探针)',
    test: function(ctx, log) {
        const r = runProbe();
        if (!r.ok) {
            const tail = (r.out || '').split('\n').filter(l => /✗|RESULT|Error/i.test(l)).slice(-6).join(' | ');
            return { fail: true, msg: '倒针写入探针未通过（回看期间真实账本被写/还原失效）：' + (tail || '无输出') };
        }
        return { fail: false, msg: '动态探针 PASS：回看期间真账本零 set、退出按引用还原、静默态复位' };
    }
};
