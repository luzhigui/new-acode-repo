// tests/_lib/fact-collect.mjs | V1.0.0 | 2026-10-31 夜间第 163 轮
// 战报 fact 递归采集的唯一收口 —— 顺手补掉「phantomFact 不在 entries 里」这个全仓库漏看洞
//
// 由来（本轮主线二，两处洞一起挖出来）：
//   洞一（位置）：幻影类 fact（PHANTOM_CONFUSE / PHANTOM_REVEAL）不是塞进 attack-group 的
//     `data.entries`，而是挂在 **attackFact.data.phantomFact** 这个独立字段上
//     （core/12battle-attack-chain.js buildAttackGroup：attackFact.data 里有 phantomFact 与 entries 并列）。
//     全仓库的采集口径一律只走「step.log 顶层 + data.entries 嵌套」⇒ **一条幻影 fact 都没看见过**。
//     后果：详见本次 commit message 与迭代日志 —— 它一度把一条活得好好的发射点读成「零命中」，
//     再往上就可能被写成「结构不可达 ⇒ 可按死代码核销」。删活代码比留着误导严重得多。
//   洞二（顺序）：第 162 轮的信号探针被每回合 clearAll 清掉（见 _lib/signal-probe.mjs），
//     与本件是同一款病：不是产品没有，是我们没接到。
//
// 用法：
//   import { collectFacts } from './_lib/fact-collect.mjs';
//   collectFacts(step.log, arr);          // arr 里拿到展平后的全部 fact
//   collectFacts(step.log, arr, (f) => {...});  // 也可传每条回调
//
// ★ 本件只做「看得更全」，不做任何判定：不改任何判据、不改任何基线、不替任何核销建议站台。
export const VER = 'tests/_lib/fact-collect.mjs V1.0.0';

/**
 * 递归采集一支 step.log 里的全部 fact。
 * 覆盖三处藏匿点：① log 顶层 ② fact.data.entries / fact.entries 嵌套层 ③ ★ fact.data.phantomFact
 * @param {any[]|undefined} log      step.log
 * @param {any[]} out                输出数组（会被就地填充）
 * @param {(f:any)=>void} [each]     可选的逐条回调（在 push 之前调用）
 * @returns {any[]} out
 */
export function collectFacts(log, out, each) {
    if (!Array.isArray(log)) return out;
    for (const node of log) {
        walk(node, out, each, 0);
    }
    return out;
}

function walk(n, out, each, depth) {
    if (!n || !n.factType) return;
    if (each) each(n);
    out.push(n);
    if (depth > 8) return;                       // 防御：极端畸形数据不打爆栈
    const d = n.data;
    if (!d) return;
    // ★ 本轮补的位置：幻影 fact 挂在 data.phantomFact，与 entries 并列，不在 entries 里
    if (d.phantomFact) walk(d.phantomFact, out, each, depth + 1);
    const inner = Array.isArray(d.entries) ? d.entries : (Array.isArray(n.entries) ? n.entries : null);
    if (inner) for (const e of inner) walk(e, out, each, depth + 1);
}
