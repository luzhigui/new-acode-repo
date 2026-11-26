// ============================================================
// 113-report-scope.js — 战报归组作用域（2026-11-22 规范化，老板拍板）
// V1.0.1 | 2026-11-23 补死亡 / 复活 / 召唤信号（击杀、憋死、召唤、圣火复活各自独立成段，不再粘上一条攻击组）
// ------------------------------------------------------------
// 规则（判断依据是"此刻有没有单位在出手"，不是"谁触发"）：
//   ① 正在某单位出手的结算过程中（含连击/破防/吸血/反弹/反击）→ 粘该单位那一组
//   ② 不在任何单位出手过程中（回合开始 / 回合收尾 / 纯被动事件）→ 该段第一条播报独立成段
//   ③ 被动抢取/转嫁（智取、生生不息溢出）→ 永远跟随触发源，由调用方显式传 needsSeparator: false
// 用法：由 101 event-bus 的 emit 进出自动置位；播报出口（305 pushSkillAnnounce 等）
//      未显式指定 needsSeparator 时调用 consumeBreakFlag() 自动判定，调用方零改动。
// ============================================================
export const VER = 'infra/113-report-scope.js V1.0.1';
import { SIGNAL_TYPES } from './106-battle-enums.js';

// 这些信号属于"非单位出手"段：段内第一条播报独立成段，其余粘住即可
//   死亡/召唤/复活同理：击杀、憋死、召唤、圣火复活都是独立事件，不能粘在上一条攻击组尾巴上
const BREAK_ON = new Set([
    SIGNAL_TYPES.ON_ROUND_START,
    SIGNAL_TYPES.ROUND_SETTLED,
    SIGNAL_TYPES.ON_UNIT_DEATH,
    SIGNAL_TYPES.ON_BEFORE_DEATH,
    SIGNAL_TYPES.BEFORE_STATE_TRANSITION
]);

const stack = [];

/** 进入一次信号派发（支持嵌套 emit，结束后自动恢复上层作用域） */
export function beginSignalScope(signal) {
    stack.push({ signal, breakPending: BREAK_ON.has(signal) });
    return stack.length;
}

/** 退出一次信号派发；token 用于防止异常路径下弹错层 */
export function endSignalScope(token) {
    if (stack.length >= token) stack.length = token - 1;
}

/** 消费"本段需要独立成段"的标记：只有每段第一条播报会拿到 true */
export function consumeBreakFlag() {
    const top = stack[stack.length - 1];
    if (!top || !top.breakPending) return false;
    top.breakPending = false;
    return true;
}

/** 当前信号名（调试/自检用） */
export function currentSignal() {
    const top = stack[stack.length - 1];
    return top ? top.signal : null;
}
