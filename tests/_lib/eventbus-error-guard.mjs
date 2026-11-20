// tests/_lib/eventbus-error-guard.mjs | V1.0.0 | 2026-11-19 第30轮
// 干什么：把「引擎在处理信号时抛错、却由 EventBus 自己 catch 掉」这类**吞掉的异常**抓出来。
//
// 为什么要有它（第30轮实证）：干净树 `node tests/run-all.mjs --jobs 4` 里
//   `[EventBus] 信号 "afterDamageApplied" 的监听器执行出错: ReferenceError: A is not defined`
//   在「无头冒烟」「蝶血分支定向用例」「isDead修复回归护栏」三项里都出现了，
//   而这三项**全部判 ✅** —— 异常被 infra/101-event-bus.js L48/L54 的 try/catch 吞掉，
//   只 console.error 一行，用例自己的断言当然不响（机制静默没跑，结果照样"通过"）。
//   ⇒ 这就是用户反复问的「为什么体检查不到问题」的又一形态：**引擎级异常不算失败**。
//
// 用法（三步，不动用例断言）：
//   const trap = installEventBusErrorTrap();     // 开跑前
//   ... 跑批 ...
//   const errs = trap.drain();                   // 跑完取（取走即清空，便于分段）
//   console.log(formatEventBusErrors(errs));     // 打印证据
//   if (errs.length) fail(...)                   // 计入本用例的失败
// 注意：不吞原输出（透传给原 console.error），不影响任何既有日志格式。
// 第33轮补 VER 常量（原文件版本史写在头注释第一行、没有 export const VER，ver-drift 断言⑩判为无版本孤儿）。
export const VER = 'tests/_lib/eventbus-error-guard.mjs V1.0.1';

const MARK_BUS = '[EventBus]';
const MARK_THROW = '监听器执行出错';

function toLine(args) {
    return args.map(a => {
        if (a instanceof Error) return `${a.name}: ${a.message}`;
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a); } catch { return String(a); }
    }).join(' ');
}

// 纯函数：判断一条已拼好的日志行是不是「EventBus 监听器抛错」
export function isEventBusListenerError(line) {
    if (typeof line !== 'string') return false;
    return line.includes(MARK_BUS) && line.includes(MARK_THROW);
}

// 纯函数：把错误行整理成可读证据（去重保序、截断过长行、计数分组）
export function summarizeEventBusErrors(lines) {
    const seen = new Set();
    const uniq = [];
    for (const raw of lines || []) {
        const line = String(raw).replace(/\s*\r?\n\s*/g, ' ').trim();
        if (!line || seen.has(line)) continue;
        seen.add(line);
        uniq.push(line);
    }
    return { count: (lines || []).length, unique: uniq };
}

export function formatEventBusErrors(lines) {
    const { count, unique } = summarizeEventBusErrors(lines);
    if (count === 0) return '';
    const head = `❌ 引擎信号处理抛错 ${count} 次（${unique.length} 种，被 EventBus 吞掉、未计入失败前）：`;
    const body = unique.slice(0, 6).map(l => '   ↳ ' + (l.length > 160 ? l.slice(0, 160) + '…' : l));
    if (unique.length > 6) body.push(`   ↳ …另 ${unique.length - 6} 种`);
    return [head, ...body].join('\n');
}

// 安装陷阱：只拦 console.error，记录含 EventBus 抛错标记的行，原样透传
export function installEventBusErrorTrap(sink = console) {
    const errors = [];
    const origError = sink.error ? sink.error.bind(sink) : console.error.bind(console);
    sink.error = (...args) => {
        const line = toLine(args);
        if (isEventBusListenerError(line)) errors.push(line);
        return origError(...args);
    };
    return {
        get count() { return errors.length; },
        drain() { return errors.splice(0, errors.length); },
        peek() { return errors.slice(); },
        restore() { sink.error = origError; }
    };
}

// 离线自证：node tests/_lib/eventbus-error-guard.mjs --selftest
export function runSelfTest() {
    const fails = [];
    const ok = (cond, desc) => { if (!cond) fails.push(desc); };

    // ① 认得住真样本（run-all 实测原文）
    const real = `${MARK_BUS} 信号 "afterDamageApplied" 的监听器执行出错: ReferenceError: A is not defined`;
    ok(isEventBusListenerError(real) === true, '① 真样本应命中');
    ok(isEventBusListenerError(`[EventBus] 信号 "afterDamageApplied" 的异步监听器执行出错: Error: x`) === true, '② 异步变体应命中');

    // ② 不误咬：普通日志 / 别的 EventBus 日志 / 空输入
    ok(isEventBusListenerError('[EventBus] 已注册 12 个信号') === false, '③ 普通 EventBus 日志不得命中');
    ok(isEventBusListenerError('ReferenceError: A is not defined') === false, '④ 裸异常行不得命中（必须带 EventBus 标记）');
    ok(isEventBusListenerError('') === false, '⑤ 空串不得命中');
    ok(isEventBusListenerError(null) === false, '⑥ null 不得命中');

    // ③ 总结：去重保序 + 计数保留原始次数
    const sum = summarizeEventBusErrors([real, real, 'other']);
    ok(sum.count === 3, '⑦ 原始次数按传入条数统计');
    ok(sum.unique.length === 2, '⑧ 去重后 2 条');
    ok(sum.unique[0] === real, '⑨ 保序（首条仍是真样本）');

    // ④ 陷阱：捕获、透传、drain 清空、restore 还原
    const logs = [];
    const fakeSink = { error: (...a) => logs.push(a.join(' ')) };
    const trap = installEventBusErrorTrap(fakeSink);
    fakeSink.error('[EventBus] 信号 "x" 的监听器执行出错: ReferenceError: A is not defined');
    fakeSink.error('[EventBus] 无关日志');
    ok(trap.count === 1, '⑩ 陷阱只记抛错行');
    ok(logs.length === 2, '⑪ 原输出透传（不吞日志）');
    const drained = trap.drain();
    ok(drained.length === 1 && trap.count === 0, '⑫ drain 取走即清空');
    trap.restore();
    fakeSink.error('[EventBus] 信号 "y" 的监听器执行出错: Error: z');
    ok(trap.count === 0, '⑬ restore 后不再记录');

    // ⑤ 空输入不伪造证据
    ok(formatEventBusErrors([]) === '', '⑭ 无错误时不出证据块');
    ok(formatEventBusErrors([real]).startsWith('❌ 引擎信号处理抛错 1 次'), '⑮ 有错误时证据块带计数');

    if (fails.length) {
        console.error('❌ eventbus-error-guard 自证失败：\n  ' + fails.join('\n  '));
        return { total: 15, fails };
    }
    console.log('✅ eventbus-error-guard 自证 15/15（真样本/异步变体/不误咬/去重保序/透传/drain/restore/空输入）');
    return { total: 15, fails };
}

const isDirect = process.argv[1] && process.argv[1].endsWith('eventbus-error-guard.mjs');
if (isDirect) {
    if (process.argv.includes('--selftest')) {
        const { fails } = runSelfTest();
        process.exit(fails.length ? 1 : 0);
    }
    console.log('用法: node tests/_lib/eventbus-error-guard.mjs --selftest');
    process.exit(0);
}
