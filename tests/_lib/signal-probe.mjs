// tests/_lib/signal-probe.mjs | V1.0.0 | 2026-10-31 夜间第 163 轮
// 跨回合存活的信号探针（供「定向用例」段三信号通道取证复用）
//
// 为什么需要这个探针（第 162 轮的教训，本轮已证实为测量口径错误）：
//   ★ 关键约束：引擎在 installRoundMechanics 里每回合调用 eventBus.clearAll()，
//   把上一回合的裁判登记连同**我们自己的观测探针**一起清掉。这一点主代码里是白纸黑字写着的：
//     - core/06battle-runner.js 顶部注释：「引擎每回合会 eventBus.clearAll()，页面级 eventBus
//       监听器活不过第一回合，所以『读日志』必须走本回调，不能自己在页面里 eventBus.on。」
//     - core/11battle-round.js:142 就是那句 eventBus.clearAll()。
//   ⇒ 探针若在 import 阶段「注册一次」，它在第一回合 any attack 之前就已被清掉，计数恒为 0。
//   第 162 轮的 phantom-confuse-brother-case 段三正是这么写的，于是读出「BEFORE_SELECT_TARGET
//   零触发」，进而推断「node 侧回放通道根本不发该信号」，并把「所有走该信号的分支在 node 侧都
//   无法取证、⑤b 结论都要重估」交给了拍板。★ 那个结论是假的：信号其实发了成千上万次，
//   被清掉的是探针自己。
//
// 本探针的正确姿势：**每个 step 开端重新登记**（eventBus.on 自带按 priority+key 去重，
// 同回合内重复调用不会堆积监听器）。这样就能跨过 clearAll 的窗口，且不改一行主代码。
//
// 用法：
//   const probe = createSignalProbe({ bus: eventBus, SIGNAL_TYPES, signal: 'beforeSelectTarget',
//                                     priority: 9999, key: 'MY_PROBE_V1' });
//   for (const step of createRoundStepper(state)) {
//       probe.ensure();          // 关键：每 step 调一次，躲过每回合的 clearAll
//       ...跑行情...
//   }
//   probe.count                 // 累计收到次数
//
// 防呆（测量层）：本探针提供 isAliveProbe()，用于反过来验证「探针本身真的接上了」。
//   ★ 任何定向用例在下「某信号零触发」的结论之前，必须先自用自检信号验证探针活着 ——
//     探针自己没接上却得出「通道不通」，就是把测量错误当成产品缺陷。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VER = 'tests/_lib/signal-probe.mjs V1.0.0';

/**
 * 建一个跨回合存活的信号探针。
 * @param {object} o
 * @param {object} o.bus           eventBus 实例
 * @param {object} o.SIGNAL_TYPES  56-battle-enums 的 SIGNAL_TYPES
 * @param {string} o.signal        信号名（取 SIGNAL_TYPES 里的字面量值）
 * @param {number} [o.priority]    优先级，默认 9999（排在业务监听器之后 ⇒ 只观测不干扰）
 * @param {string} [o.key]         监听器身份键（去重依据，必填-empty 时退回源码文本比较，易误判重复）
 * @param {(data:any)=>void} [o.onData] 每次收到信号的回调（可选，用于二次筛选计数）
 */
export function createSignalProbe(o) {
    const bus = o.bus;
    const signal = o.signal;
    const priority = o.priority === undefined ? 9999 : o.priority;
    const key = o.key || 'SIGNAL_PROBE_' + signal;
    const onData = o.onData || null;

    const state = { count: 0, registrations: 0, ensureCalls: 0, lastData: null };

    const listener = (data) => {
        state.count++;
        state.lastData = data;
        if (onData) onData(data);
    };

    function ensure() {
        state.ensureCalls++;
        // eventBus.on 自带去重（同 priority + 同 key ⇒ 直接 return），故每 step 调不会堆积。
        const before = bus._listeners && bus._listeners[signal] ? bus._listeners[signal].length : -1;
        bus.on(signal, priority, listener, key);
        const after = bus._listeners && bus._listeners[signal] ? bus._listeners[signal].length : -1;
        if (after > before) state.registrations++;
    }

    return {
        ensure,
        get count() { return state.count; },
        get registrations() { return state.registrations; },   // > 1 即证明确实被 clearAll 清过
        get ensureCalls() { return state.ensureCalls; },
        get lastData() { return state.lastData; },
        state
    };
}

/**
 * 反向自检：发一个自定义信号，验证我们的登记姿势本身能收到。
 * ★ 若自检收不到 ⇒ 探针没接上（姿势错了 / 总线被换实例），此时「业务信号零触发」不可采信。
 * @returns {boolean} true = 探针本体可用
 */
export function isAliveProbe(bus, probeSignal, key) {
    let got = 0;
    bus.on(probeSignal, 9999, () => { got++; }, key);
    bus.emit(probeSignal, { __probeSelfTest: true });
    return got === 1;
}

/**
 * 静态自证：主代码里「每回合 clearAll」这条约束还在不在。
 * 不在了（比如引擎改成增量重登）探针的登记姿势要跟着变，本函数会点出来。
 * @returns {{ok:boolean, reasons:string[], files:object}}
 */
export function verifyClearAllContract(root) {
    const out = { ok: true, reasons: [], files: {} };
    const runnerpy = path.join(root, 'core', '11battle-round.js');
    const runner = path.join(root, 'core', '06battle-runner.js');
    if (!fs.existsSync(runnerpy)) {
        out.ok = false; out.reasons.push('找不到 core/11battle-round.js，无法核对 clearAll 契约');
        return out;
    }
    const src = fs.readFileSync(runnerpy, 'utf8');
    const hasClearAll = /eventBus\.clearAll\(\s*\)/.test(src);
    out.files['core/11battle-round.js'] = { clearAll: hasClearAll };
    if (!hasClearAll) {
        out.ok = false;
        out.reasons.push('core/11battle-round.js 里找不到 eventBus.clearAll() —— 每回合清监听器的契约已变，探针登记姿势须复核');
    }
    if (fs.existsSync(runner)) {
        const rs = fs.readFileSync(runner, 'utf8');
        out.files['core/06battle-runner.js'] = { documented: /clearAll/.test(rs) };
    }
    return out;
}

const _here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(_here, '..', '..');
