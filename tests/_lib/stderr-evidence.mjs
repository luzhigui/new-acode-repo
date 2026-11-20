// tests/_lib/stderr-evidence.mjs | V1.1.0 | 2026-11-20 第31轮移植夜间第242轮成果 + 补 EventBus 缺口
// V1.1.0 | 2026-11-20 第31轮：★ 补一条 main 侧专属口径——剥噪掉的 [EventBus] 监听器抛错行先留底，
//        | 若剥噪后找不到更深真因，就退回它当真因（夜间语境里它是噪声、main 语境里它常就是真凶：
//        | core/216 裸 A/B 的 ReferenceError）。两套护栏不打架：有更深异常仍优先取更深的，没有就别把真凶当噪声扔掉。
// V1.0.1 | 2026-11-19 夜间第 242 轮：尾部加「相邻重复行折叠」（异常 msg 与栈首行常撞车，实测重复一行）。
// 干什么：把「子进程 stderr」整理成可读的**证据块** —— 先剥噪，再点出最后一条终止原因，最后给尾部若干行。
//
// 为什么要有它（第 241～242 两轮的同一根病，收口成唯一来源）：
//   第 241 轮立了口径 —— stderr 里混着两类东西：**终止原因**（对照器异常 / Error / 状态字段未注册 /
//   Cannot find module）与**噪声**（[EventBus] 监听器执行出错、node 的 MODULE_TYPELESS 告警、
//   Reparsing as ES module、To eliminate this warning…）。判崩溃前必须先剥噪，否则被测对象的运行期错误
//   会被当成"工具挂了"；而且"取首行"常常正好取到 node 告警，真因被顶出屏幕。
//   第 241 轮只在 output-label-coupling-guard 里单点实现了一份（V3.4.2），第 242 轮发现同款需求
//   出现在 coverage-report 与 rule-branch-idle-selftest 两处 —— 按「收口为唯一来源」的通规抽到这里。
//
// ★ 本文件只做**呈现**：不判定红绿、不改任何退码、不放行任何结论。调用方仍按原判据与退码行事。
//
// 用法：
//   import { stripNoise, pickCause, tailLines, evidenceBlock, selftestEvidence } from './_lib/stderr-evidence.mjs';
//   console.log(evidenceBlock(res.stderr, { n: 8 }));
export const VER = 'tests/_lib/stderr-evidence.mjs V1.1.0';

// 噪声：整行以这两类标记开头，或与这些关键词沾边。判定顺序无关，全部丢弃。
const NOISE_HEAD = /^\[EventBus\]|^\(node:\d+\)/;
const NOISE_ANY = [
    'MODULE_TYPELESS_PACKAGE_JSON',
    'Reparsing as ES module',
    'ExperimentalWarning',
    'DeprecationWarning',
    '--trace-warnings',
    'UnhandledPromiseRejectionWarning',
    'To eliminate this warning'
];

// 终止原因：命中即认为这行说清了"为什么停"。取**最后一条**（链式异常里最内层才是真因）。
const CAUSE_RE = /(^|:\s*)(Error|TypeError|ReferenceError|RangeError|SyntaxError|EvalError):|状态字段未注册|对照器异常|Cannot find module|MODULE_NOT_FOUND|未在 core\/218/;
// EventBus 监听器异常：夜间当噪声、main 侧常是真凶（#47 的 eventbus-error-guard 同族）。剥噪时留底，
// 剥噪后若无更深真因则回退用它——这样"事件循环把引擎异常吞掉"的场景不会变成"无可用 stderr"。
const EVENTBUS_THROW_RE = /^\[EventBus\].*监听器执行出错/;

/** 剥噪：逐行 trim，丢空行与噪声行。**顺序保持不重排**（栈帧先后的语义要留住）。 */
export function stripNoise(text) {
    return String(text == null ? '' : text).split(/\r?\n/)
        .map(s => s.trim())
        .filter(s => s && !NOISE_HEAD.test(s) && !NOISE_ANY.some(k => s.includes(k)));
}

/** 被剥掉的 EventBus 监听器抛错行（留底，可能回退为真因）。 */
export function eventBusThrowLines(text) {
    return String(text == null ? '' : text).split(/\r?\n/)
        .map(s => s.trim())
        .filter(s => EVENTBUS_THROW_RE.test(s));
}

/** 最后一条终止原因行；剥噪后无真因时回退到 [EventBus] 监听器抛错行；都没有返回空串（不伪造证据）。 */
export function pickCause(text) {
    const kept = stripNoise(text);
    for (let i = kept.length - 1; i >= 0; i--) {
        if (CAUSE_RE.test(kept[i])) return kept[i];
    }
    // ★ V1.1.0 回退：剥噪后没有更深真因，但 EventBus 抛错行在——它本身就够格当终止原因
    const busLines = eventBusThrowLines(text);
    if (busLines.length) return busLines[busLines.length - 1];
    return '';
}

/** 尾部 n 行（剥噪之后），每行缩进四格、单行截 200 字。相邻重复行折叠（异常消息与栈首行常撞车）。 */
export function tailLines(text, n = 8) {
    const kept = [];
    for (const l of stripNoise(text)) {
        if (kept.length && kept[kept.length - 1] === l) continue; // 只折相邻重复，不改顺序
        kept.push(l);
    }
    return kept.slice(-n).map(s => '    ' + s.slice(0, 200)).join('\n');
}

/**
 * 组装证据块（多行字符串，调用方直接 console.log）。
 * 有真因就先点名真因，再给尾部；全噪声时明确说"无可用 stderr"，别让人以为没证据。
 */
export function evidenceBlock(text, opts = {}) {
    const n = opts.n || 8;
    const label = opts.label || '回放';
    const cause = pickCause(text);
    const tail = tailLines(text, n);
    const out = [];
    if (cause) out.push('   ↳ 真因（已剥噪，取最后一条终止原因）：', '    ' + cause.slice(0, 200));
    if (tail) out.push('   ↳ ' + label + ' stderr 尾部 ' + n + ' 行（已剥噪' + (cause ? '，含真因' : '') + '）：', tail);
    if (!cause && !tail) out.push('   ↳ ' + label + ' 无可用 stderr —— 崩溃点在 stdout 侧或信号终止，需人工复查');
    return out.join('\n');
}

// 纯内存自证（零 IO）：钉住「剥噪不剥真因」「取最后一条不出头一条」「不伪造证据」「EventBus 回退」四条。
export function selftestEvidence(log = console.log) {
    const teeth = [];
    const T = (name, ok) => teeth.push({ name, ok: !!ok });
    const fx = [
        '[EventBus] 信号 "afterDamageApplied" 的监听器执行出错: ReferenceError: A is not defined',
        '(node:31587) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file is not specified',
        'To eliminate this warning, add "type": "module" to /workspace/repo/package.json.',
        'Error: [core/218] 状态字段未注册（小昭·姊）：_butterflyEverAttached',
        '    at assertStateFullyRegistered (file:///workspace/repo/core/218-state-keys.js:504:15)',
        'Error: Cannot find module /workspace/repo/modules/999-missing.js'
    ].join('\n');
    const kept = stripNoise(fx);
    const has = s => kept.some(l => l.includes(s));

    T('A1 [EventBus] 行被剥', !has('[EventBus]'));
    T('A2 (node:N) 告警行被剥', !has('(node:31587)'));
    T('A3 告警续行（To eliminate this warning）被剥', !has('To eliminate this warning'));
    T('A4 真因行保留', has('状态字段未注册'));
    T('A5 栈帧保留（真因落点）', has('218-state-keys.js:504'));
    T('A6 empty / null 不抛且为空', stripNoise('').length === 0 && stripNoise(null).length === 0);
    T('A7 pickCause 取最后一条终止原因（不是头一条）', pickCause(fx).includes('Cannot find module'));
    T('A8 纯 node 噪声时 pickCause 返回空串（不伪造）', pickCause('(node:1) [MODULE_TYPELESS_PACKAGE_JSON] Warning: y') === '');
    T('A9 tailLines 取尾不取头且顺序保持', tailLines(['l1', 'l2', 'l3', 'l4'].join('\n'), 2) === '    l3\n    l4');
    T('A10 tailLines 超长行截 200 字', tailLines('x'.repeat(500), 1) === '    ' + 'x'.repeat(200));
    T('A11 evidenceBlock 纯噪声时明确说无可用', evidenceBlock('(node:1) [MODULE_TYPELESS_PACKAGE_JSON] Warning: y').includes('无可用 stderr'));
    T('A12 evidenceBlock 有真因时先点名真因', /真因（已剥噪/.test(evidenceBlock(fx)));
    T('A13 相邻重复行折叠（不折非相邻）', (() => {
        const src = ['a', 'a', 'b', 'a'].join('\n');
        return tailLines(src, 8) === '    a\n    b\n    a';
    })());
    // ★ V1.1.0 新增：EventBus 抛错行在、但无更深真因时，回退当真因（#47 场景）
    const onlyBus = '[EventBus] 信号 "afterDamageApplied" 的监听器执行出错: ReferenceError: A is not defined\n    at submitOnHitEffects (core/216:271)';
    T('A14 只有 EventBus 抛错行时回退为真因（不让真凶变噪声）', pickCause(onlyBus).includes('A is not defined'));
    T('A15 有更深真因时不回退 EventBus 行（夜间口径仍优先）', pickCause(fx).includes('Cannot find module') && !pickCause(fx).includes('A is not defined'));

    const bad = teeth.filter(t => !t.ok);
    for (const t of teeth) log((t.ok ? '  ✓ ' : '  ✗ ') + t.name);
    log(bad.length ? '结论：' + bad.length + ' 项自证失败'
        : '结论：' + teeth.length + '/' + teeth.length + ' 自证通过（剥噪四类 / 取最后一条真因 / 空与纯噪声不伪造 / 取尾有序 / 超长截断 / 相邻重复折叠 / EventBus 回退兜底）');
    return bad.length ? 1 : 0;
}

const isDirect = process.argv[1] && process.argv[1].endsWith('stderr-evidence.mjs');
if (isDirect) {
    process.exit(selftestEvidence() ? 1 : 0);
}
