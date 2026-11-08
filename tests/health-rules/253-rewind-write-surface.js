// 回放写入面唯一入口（静态）：ui/727 只有 enterReview / exitReview 允许改真实账本
//   （battleLog / battleFacts），player/504 只许往「当前账本」的即时引用 push，禁止 set 换账本。
// 为什么需要：回看不许污染本局记录 —— 隔离靠「进场换临时数组、退出按引用还原」。
//   只要回看路径上有第二处 set / 原地清空，真账本就会被截断或串场（日志少行、体检读错事实）。
//   这类写入发生在浏览器运行时，回放日志看不见 → 本规则读整文件源码做结构断言（不跑 DOM）。
// 判据：
//   ① ui/727 全文 `GlobalStore.set('battleLog'` 恰好 2 处、`battleFacts` 恰好 2 处（进场清空 + 退出还原）；
//   ② 这 4 处写入必须分别落在 enterReview / exitReview 的源码体内（其他导出不得改账本）；
//   ③ enterReview 必须先换临时空数组，再 paintAt（否则首屏会拿真账本画日志）；
//   ④ exitReview 必须按「快照引用」还原（S.snap.battleLog / S.snap.battleFacts），不是拷贝副本；
//   ⑤ player/504 全文不得 set 两份账本；它的 push 源必须是 GlobalStore.get(...) 的即时引用
//      （两处 push 存在 = 零锚点，防止 push 被删后规则假绿）。
export const VER = 'tests/health-rules/253-rewind-write-surface.js V1.0.0';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { enterReview, exitReview, startPlay, resumePlay, pausePlay, prevStep, nextStep, prevCue, nextCue, fastForward } from '../../ui/727-rewind-core.js';

function srcOf(fn) { return String(fn); }
function read(rel) { return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'); }
function count(s, re) { return (s.match(re) || []).length; }

export const rule253 = {
    group: '战报与渲染一致性',
    name: '回放写入面唯一入口(进场清空/退出按引用还原)',
    test: function(ctx, log) {
        let src727 = '', src504 = '';
        try {
            src727 = read('../../ui/727-rewind-core.js');
            src504 = read('../../player/504-player-play-step.js');
        } catch (e) {
            return { fail: true, msg: '读不到 ui/727 或 player/504 源码：' + (e && e.message || e) };
        }

        const SET_LOG = /GlobalStore\.set\('battleLog'/g;
        const SET_FACTS = /GlobalStore\.set\('battleFacts'/g;
        const nLog = count(src727, SET_LOG);
        const nFacts = count(src727, SET_FACTS);
        if (nLog !== 2 || nFacts !== 2) {
            return { fail: true, msg: '727 账本写入面应为 2+2（进场清空/退出还原），实际 battleLog=' + nLog + ' battleFacts=' + nFacts + ' —— 回看路径上多出/少了换账本入口' };
        }

        // ② 只许出现在 enterReview / exitReview
        const enter = srcOf(enterReview);
        const exitS = srcOf(exitReview);
        const others = {
            startPlay: srcOf(startPlay), resumePlay: srcOf(resumePlay), pausePlay: srcOf(pausePlay),
            prevStep: srcOf(prevStep), nextStep: srcOf(nextStep),
            prevCue: srcOf(prevCue), nextCue: srcOf(nextCue), fastForward: srcOf(fastForward)
        };
        const enterWrites = count(enter, SET_LOG) + count(enter, SET_FACTS);
        const exitWrites = count(exitS, SET_LOG) + count(exitS, SET_FACTS);
        if (enterWrites !== 2 || exitWrites !== 2) {
            return { fail: true, msg: '写入面位置不对：enterReview 内 ' + enterWrites + ' 处、exitReview 内 ' + exitWrites + ' 处（各应为 2）' };
        }
        for (const k of Object.keys(others)) {
            if (SET_LOG.test(others[k])) { SET_LOG.lastIndex = 0; return { fail: true, msg: k + ' 里出现 GlobalStore.set(\'battleLog\')：回看动作会改写真实账本' }; }
            SET_LOG.lastIndex = 0;
            if (SET_FACTS.test(others[k])) { SET_FACTS.lastIndex = 0; return { fail: true, msg: k + ' 里出现 GlobalStore.set(\'battleFacts\')：回看动作会改写真实事实账本' }; }
            SET_FACTS.lastIndex = 0;
        }

        // ③ 进场：先换临时数组，再 paintAt
        const iClear = enter.indexOf("GlobalStore.set('battleFacts', [])");
        const iPaint = enter.indexOf('paintAt(');
        if (iClear < 0 || iPaint < 0 || iClear > iPaint) {
            return { fail: true, msg: 'enterReview 未在 paintAt 之前换临时空数组：首屏会拿真实账本画日志' };
        }

        // ④ 退出：按快照引用还原
        if (!/GlobalStore\.set\('battleLog',\s*S\.snap\.battleLog\)/.test(exitS)) {
            return { fail: true, msg: 'exitReview 还原 battleLog 不是快照引用（S.snap.battleLog）—— 拷贝副本会让真账本轮为死对象' };
        }
        if (!/GlobalStore\.set\('battleFacts',\s*S\.snap\.battleFacts\)/.test(exitS)) {
            return { fail: true, msg: 'exitReview 还原 battleFacts 不是快照引用（S.snap.battleFacts）' };
        }

        // ⑤ 504 只 push 即时引用，不换账本
        if (/GlobalStore\.set\('battleLog'/.test(src504) || /GlobalStore\.set\('battleFacts'/.test(src504)) {
            return { fail: true, msg: '504 播放层直接 set 账本：回看/真播切换时账本会被播放层接管' };
        }
        if (!/const\s+_battleLog\s*=\s*GlobalStore\.get\('battleLog'\)/.test(src504) || !/_battleLog\.push\(/.test(src504)) {
            return { fail: true, msg: '504 的日志 push 通道缺失或未从当前账本取引用（零写入锚点丢失）' };
        }
        if (!/const\s+_bf\s*=\s*GlobalStore\.get\('battleFacts'\)/.test(src504) || !/_bf\.push\(/.test(src504)) {
            return { fail: true, msg: '504 的事实 push 通道缺失或未从当前账本取引用（零写入锚点丢失）' };
        }

        return { fail: false, msg: '写入面收口：727 仅进场/退出各 2 处，504 只 push 当前账本引用' };
    }
};
