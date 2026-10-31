// tests/registry-cross-check.mjs — 三个中央登记簿的交叉对账（只报不改）
//
// 背景：主代码有三处「全局登记簿」，加机制必须三处同步，而 JS 是动态的，
//   漏登记不会编译报错，只在运行时表现为「某机制悄悄不生效」。本脚本把三处对不上
//   的地方一次性列出来，交给人工判断。**本文件不 import 主代码、不改任何文件。**
//
// 三本账：
//   ① 状态字段  core/17 的 ROUND/BATTLE_STATE_SCHEMA  ←→  core|modules|render|player 里读写的 unit._xxx
//   ② 执行顺序  infra/50 的 EXECUTION_LAYER            ←→  eventBus.on / registerSettlementHook 的 priority
//   ③ 渲染契约  infra/58 的 FACT_SPECS(renderFn)       ←→  render/ 里的 registerFactRenderer
//
// 判据说明（为什么不按名字硬比）：
//   EXECUTION_LAYER 的阶段名与 SIGNAL_TYPES 的信号名并非同名——ROUND_START↔ON_ROUND_START、
//   BEFORE_ACTION↔BEFORE_ACTION_SELECT，靠 PHASE_TO_SIGNAL 显式映射，不猜。
//
// 用法：
//   node tests/registry-cross-check.mjs            # 报告模式（恒退出 0）
//   node tests/registry-cross-check.mjs --json     # 机器可读
//   node tests/registry-cross-check.mjs --strict   # 自证失败或「确定缺登记」非空时退出 1
//
// 自证断言：解析结果低于下限视为解析器腐烂，直接判红——防止哪天正则失效后恒报 0 条被当成干净。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VER = 'tests/registry-cross-check.mjs V1.0.3';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');

const SKIP_DIRS = new Set([
    'node_modules', '.git', 'vendor', 'assets',
    '展示与CG', '文件汇总20260730', '.workbuddy'
]);

const SCAN_LAYERS = ['core', 'modules', 'render', 'player'];

// ---------------------------------------------------------------- 基础工具

function walk(dir, acc) {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
    for (const e of ents) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (SKIP_DIRS.has(e.name)) continue;
            if (e.name.startsWith('.')) continue;      // 跳过 .mut 变异沙箱等点目录
            walk(full, acc);
        } else if (e.name.endsWith('.js') || e.name.endsWith('.mjs')) {
            acc.push(full);
        }
    }
    return acc;
}

const rel = p => path.relative(ROOT, p).replace(/\\/g, '/');

function lineOf(src, index) {
    let n = 1;
    for (let i = 0; i < index && i < src.length; i++) if (src.charCodeAt(i) === 10) n++;
    return n;
}

/** 命中位置是否落在注释行（行首是 // 或 *）——避免把文件头的用法示例当成真注册 */
function isCommentLine(src, index) {
    const lineStart = src.lastIndexOf('\n', index) + 1;
    const head = src.slice(lineStart, index).trimStart();
    return head.startsWith('//') || head.startsWith('*') || head.startsWith('/*');
}

/** 取 `marker` 之后的第一个 {...} 花括号体（不处理字符串里的花括号，本仓这三处都没有） */
function extractObjectBody(src, marker) {
    const i = src.indexOf(marker);
    if (i < 0) return null;
    const j = src.indexOf('{', i);
    if (j < 0) return null;
    let depth = 0;
    for (let k = j; k < src.length; k++) {
        if (src[k] === '{') depth++;
        else if (src[k] === '}') {
            depth--;
            if (depth === 0) return src.slice(j + 1, k);
        }
    }
    return null;
}

/** 从块体里按 `^\s{4}NAME: {` 切段，段内抓 NAME2: 数字 */
function parseExecutionLayer(body) {
    const out = {};
    let cur = null;
    for (const raw of body.split('\n')) {
        const line = raw.replace(/\/\/.*$/, '');
        const start = line.match(/^\s{4}([A-Z_]+)\s*:\s*\{(.*)$/);
        if (start) {
            cur = start[1];
            out[cur] = {};
            for (const kv of start[2].matchAll(/([A-Z_]+)\s*:\s*(\d+)/g)) out[cur][kv[1]] = Number(kv[2]);
            continue;
        }
        if (/^\s{4}\}\s*,?\s*$/.test(line)) { cur = null; continue; }
        if (cur) {
            for (const kv of line.matchAll(/([A-Z_]+)\s*:\s*(\d+)/g)) out[cur][kv[1]] = Number(kv[2]);
        }
    }
    return out;
}

function parseEnum(src, marker) {
    const body = extractObjectBody(src, marker);
    if (body === null) return null;
    const out = {};
    for (const m of body.matchAll(/([A-Z_0-9]+)\s*:\s*'([^']*)'/g)) out[m[1]] = m[2];
    return out;
}

// 阶段名 → 信号名（命名不一致，显式映射，不猜）
const PHASE_TO_SIGNAL = {
    ROUND_START: 'ON_ROUND_START',
    ROUND_END: 'ON_ROUND_END',
    BEFORE_ACTION: 'BEFORE_ACTION_SELECT'
};
const signalOf = phase => PHASE_TO_SIGNAL[phase] || phase;

// registerSettlementHook 的 when 可能是字符串字面量（'afterDamageApplied'）而非 SIGNAL_TYPES.X；
//   转成 UPPER_SNAKE 才能对上 SIGNAL_TYPES 的键（AFTER_DAMAGE_APPLIED）。
function signalFromWhenLiteral(lit) {
    return lit.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
}

// 变量名白名单：这些接收者几乎必然是「单位对象」，其 _xxx 必须在 schema 里
//   刻意不含 a/b/x/y/t/cur 这类通用名——本仓里 A/B 常是「整队数组」，误判会淹掉真问题
const UNIT_RECEIVERS = new Set([
    'u', 'unit', 'self',
    'target', 'targetUnit', 'attacker', 'attackerUnit', 'defender', 'defenderUnit',
    'def', 'atk', 'caster', 'victim', 'hero', 'src', 'dst',
    'ally', 'enemy'
]);

// ---------------------------------------------------------------- 采集

// 统一换行：Windows 工作树是 CRLF，逐行正则里 `.` 不匹配 \r 会让 `(.*)$` 全线失配
const readNorm = p => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

function collect() {
    const files = [];
    for (const layer of SCAN_LAYERS) walk(path.join(ROOT, layer), files);
    return files.map(f => ({ abs: f, rel: rel(f), src: readNorm(f) }));
}

function loadRegistries() {
    const src17 = readNorm(path.join(ROOT, 'core/17-state-keys.js'));
    const src50 = readNorm(path.join(ROOT, 'infra/50-event-bus.js'));
    const src56 = readNorm(path.join(ROOT, 'infra/56-battle-enums.js'));
    const src58 = readNorm(path.join(ROOT, 'infra/58-fact-contract.js'));

    // ① 状态 schema：两个块，key 一律 _ 开头
    const schemas = {};
    for (const [name, marker] of [
        ['ROUND_STATE_SCHEMA', 'export const ROUND_STATE_SCHEMA'],
        ['BATTLE_STATE_SCHEMA', 'export const BATTLE_STATE_SCHEMA']
    ]) {
        const body = extractObjectBody(src17, marker);
        const keys = new Set();
        if (body) {
            for (const line of body.split('\n')) {
                const m = line.replace(/\/\/.*$/, '').match(/^\s{4}(_[A-Za-z]\w*)\s*:/);
                if (m) keys.add(m[1]);
            }
        }
        schemas[name] = keys;
    }
    const allStateKeys = new Set([...schemas.ROUND_STATE_SCHEMA, ...schemas.BATTLE_STATE_SCHEMA]);

    // ② 执行层 + 信号枚举
    const layerBody = extractObjectBody(src50, 'export const EXECUTION_LAYER');
    const layer = layerBody ? parseExecutionLayer(layerBody) : {};
    const signals = parseEnum(src56, 'export const SIGNAL_TYPES') || {};

    // ③ fact 契约 + 渲染器注册
    const specs = {};
    const specBody = extractObjectBody(src58, 'export const FACT_SPECS');
    if (specBody) {
        for (const m of specBody.matchAll(/\[FACT_TYPES\.([A-Z_0-9]+)\]\s*:\s*\{([^}]*)\}/g)) {
            const name = m[1];
            const rf = m[2].match(/renderFn\s*:\s*(?:'([^']+)'|(null))/);
            specs[name] = { renderFn: rf ? (rf[2] ? null : rf[1]) : undefined };
        }
    }

    return { schemas, allStateKeys, layer, signals, specs };
}

// ---------------------------------------------------------------- 三本账

/** ① 状态字段：代码在用、schema 没登记 */
function checkStateFields(files, allStateKeys) {
    const hits = new Map();     // field → [{rel, line, receiver}]（只装未登记字段）
    const allUsed = new Set();  // 全部被读写的字段名（用于反向对账）
    for (const f of files) {
        // 只认 unit.state._xxx（落在 state schema 上的访问）；顶层 unit._xxx（由 core/02unit.js
        //   构造函数直接管理的字段，如 _mods/_audit/_fsm/_frozen）刻意不在 schema 里，误报成「漏登」会误导。
        for (const m of f.src.matchAll(/\b([A-Za-z_$][\w$]*)\.state\.(_[A-Za-z]\w*)\b/g)) {
            const receiver = m[1];
            const field = m[2];
            allUsed.add(field);
            if (allStateKeys.has(field)) continue;      // 已登记，不报
            if (!hits.has(field)) hits.set(field, []);
            hits.get(field).push({ rel: f.rel, line: lineOf(f.src, m.index), receiver });
        }
        // Object.assign(unit.state, { _xxx: ... }) 动态键也计入「已读写」，否则 _butterflyHp
        //   等经动态键写入的字段会被误判为死字段（2026-10-31 复核：_butterflyHp/_butterflyHpTransfer/
        //   _linkedPartnerUid 均经此路径，确为活字段，非死残留）。
        for (const m of f.src.matchAll(/Object\.assign\(\s*[^,]+,\s*\{([^}]*)\}/g)) {
            for (const km of m[1].matchAll(/\b(_[A-Za-z]\w*)\s*:/g)) allUsed.add(km[1]);
        }
    }

    // 本扫描只匹配 `X.state._xxx` —— `.state.` 前缀本身就是「落在 state 账本（core/17）上」的权威信号，
    // 不依赖接收者变量名。任何不在 schema 的 `.state._xxx` 都是确定漏登（不受 UNIT_RECEIVERS 白名单影响，
    // 否则像 `hls`（寒离飒）这类模块内局部单位变量会被误丢进「待确认」而漏报；2026-10-31 实测漏掉 3 个真实字段）。
    const sure = [];
    const unsure = [];
    for (const [field, list] of hits) sure.push({ field, sites: list });
    const byCount = (a, b) => b.sites.length - a.sites.length;
    sure.sort(byCount);
    unsure.sort(byCount);

    // 反向：schema 登记了但从没被读写（可能是历史残留）
    const unused = [...allStateKeys].filter(k => !allUsed.has(k)).sort();

    return { sure, unsure, unused, scannedFields: allUsed.size };
}

/** ② 执行顺序：注册的 priority 与 EXECUTION_LAYER 是否对得上 */
function checkPriorities(files, layer, signals) {
    // 反向索引：事件名 → 出现的阶段与优先级
    const eventIndex = new Map();
    for (const [phase, map] of Object.entries(layer)) {
        for (const [ev, pr] of Object.entries(map)) {
            if (!eventIndex.has(ev)) eventIndex.set(ev, []);
            eventIndex.get(ev).push({ phase, priority: pr });
        }
    }

    const entries = [];     // 全部注册点
    for (const f of files) {
        // 入口一：eventBus.on(SIGNAL_TYPES.X, PRIORITY, ...)
        for (const m of f.src.matchAll(/eventBus\.on\(\s*SIGNAL_TYPES\.([A-Z_]+)\s*,\s*([^,\n]+)/g)) {
            entries.push({
                via: 'eventBus.on', signal: m[1], priorityRaw: m[2].trim(),
                rel: f.rel, line: lineOf(f.src, m.index)
            });
        }
        // 入口二：registerSettlementHook({ when, priority, ... })
        for (const m of f.src.matchAll(/registerSettlementHook\(\s*\{/g)) {
            const from = m.index;
            const window = f.src.slice(from, from + 600);
            const whenSig = window.match(/when\s*:\s*SIGNAL_TYPES\.([A-Z_]+)/);
            const whenLit = window.match(/when\s*:\s*'([a-zA-Z]+)'/);
            const when = whenSig ? whenSig : (whenLit ? { 1: signalFromWhenLiteral(whenLit[1]) } : null);
            const pr = window.match(/priority\s*:\s*([^,\n]+)/);
            if (when) {
                entries.push({
                    via: 'registerSettlementHook', signal: when[1],
                    priorityRaw: pr ? pr[1].trim() : '(缺 priority)',
                    rel: f.rel, line: lineOf(f.src, from)
                });
            }
        }
    }

    // crossSignal：跨信号复用优先级「数值」——合法定序手法，降级为软提示，不计入「确定需要处理」。
    const problems = { bareNumber: [], badRef: [], crossSignal: [], unknownSignal: [] };
    const usedEvents = new Set();

    for (const e of entries) {
        if (!(e.signal in signals)) problems.unknownSignal.push(e);

        const raw = e.priorityRaw;
        const ref = raw.match(/^L\.([A-Z_]+)\.([A-Z_]+)$/);
        if (ref) {
            const [, phase, ev] = ref;
            usedEvents.add(phase + '.' + ev);
            const expect = signalOf(phase);
            if (!layer[phase]) {
                problems.badRef.push({ ...e, why: `L.${phase} 阶段不存在` });
            } else if (!(ev in layer[phase])) {
                problems.badRef.push({ ...e, why: `L.${phase}.${ev} 未登记` });
            } else if (expect !== e.signal) {
                // 跨信号复用优先级常量：把 L.PHASE.EVENT 的「数值」借用到另一个信号上做相对定序，
                // 本仓常见（如 weiyixiao 在 ON_DODGE 上复用 L.AFTER_DAMAGE_APPLIED.LEECH 的优先级值 40）。
                // 这是合法做法，不是 bug —— 降级为「待确认」软提示，不计入硬数，避免误报狼来了。
                problems.crossSignal.push({ ...e, why: `跨信号复用 L.${phase}.${ev} 的优先级数值（本应由 ${expect} 消费），实际挂在 ${e.signal}——疑似故意定序，需人工确认` });
            }
            continue;
        }
        if (/^\d+$/.test(raw)) {
            // 裸数字：合法但绕开了中央表；同阶段同值 = 执行次序取决于模块 import 顺序
            const phase = Object.keys(layer).find(p => signalOf(p) === e.signal) || null;
            const sameNum = phase
                ? Object.entries(layer[phase]).filter(([, v]) => v === Number(raw)).map(([k]) => k)
                : [];
            problems.bareNumber.push({ ...e, phase, sameNum });
            continue;
        }
        // 其余形态：自定义常量（如 kongjian 的 TRIGGER_PRIORITY）——不在中央表内
        problems.bareNumber.push({ ...e, phase: null, sameNum: [], custom: true });
    }

    // 反向：表里登记了、但从没有任何注册点使用（改机制后忘了删）
    const orphans = [];
    for (const [phase, map] of Object.entries(layer)) {
        for (const ev of Object.keys(map)) {
            if (!usedEvents.has(phase + '.' + ev)) orphans.push({ phase, event: ev, priority: map[ev] });
        }
    }

    // 同阶段重复优先级（执行次序靠 import 顺序，隐式依赖）
    const dupPriority = [];
    for (const [phase, map] of Object.entries(layer)) {
        const byNum = {};
        for (const [ev, pr] of Object.entries(map)) (byNum[pr] = byNum[pr] || []).push(ev);
        for (const [pr, evs] of Object.entries(byNum)) {
            if (evs.length > 1) dupPriority.push({ phase, priority: Number(pr), events: evs });
        }
    }

    return { entries, problems, orphans, dupPriority };
}

/** ③ 渲染契约：FACT_SPECS.renderFn ←→ registerFactRenderer */
function checkRenderers(files, specs) {
    const registered = new Map();   // factType → [{rel, line}]
    for (const f of files) {
        for (const m of f.src.matchAll(/registerFactRenderer\(\s*FACT_TYPES\.([A-Z_0-9]+)/g)) {
            if (isCommentLine(f.src, m.index)) continue;
            if (!registered.has(m[1])) registered.set(m[1], []);
            registered.get(m[1]).push({ rel: f.rel, line: lineOf(f.src, m.index) });
        }
    }

    const missingRenderer = [];   // 声明了 renderFn 但没注册 → renderLog 可能返回 undefined
    const undeclared = [];        // 注册了但 FACT_SPECS 没这条 → 缺 requiredFields 校验
    const contradicted = [];      // 声明 renderFn: null 却注册了

    for (const [name, spec] of Object.entries(specs)) {
        if (spec.renderFn === undefined) continue;
        if (spec.renderFn && !registered.has(name)) missingRenderer.push({ factType: name, renderFn: spec.renderFn });
        if (spec.renderFn === null && registered.has(name)) {
            contradicted.push({ factType: name, sites: registered.get(name) });
        }
    }
    for (const [name, sites] of registered) {
        if (!(name in specs)) undeclared.push({ factType: name, sites });
    }
    // 声明里没写 renderFn 字段的（契约不全）
    const noRenderFnField = Object.entries(specs)
        .filter(([, s]) => s.renderFn === undefined).map(([n]) => n);

    return { missingRenderer, undeclared, contradicted, noRenderFnField, registeredCount: registered.size };
}

// ---------------------------------------------------------------- 自证

function selfCheck(reg, prio, rend) {
    const issues = [];
    const totalState = reg.allStateKeys.size;
    if (totalState < 40) issues.push(`状态 schema 只解析出 ${totalState} 个字段（下限 40）——解析器可能失效`);
    const phases = Object.keys(reg.layer).length;
    if (phases < 15) issues.push(`EXECUTION_LAYER 只解析出 ${phases} 个阶段（下限 15）`);
    const sigs = Object.keys(reg.signals).length;
    if (sigs < 15) issues.push(`SIGNAL_TYPES 只解析出 ${sigs} 个信号（下限 15）`);
    const specCount = Object.keys(reg.specs).length;
    if (specCount < 60) issues.push(`FACT_SPECS 只解析出 ${specCount} 条（下限 60）`);
    if (rend.registeredCount < 60) issues.push(`registerFactRenderer 只解析出 ${rend.registeredCount} 处（下限 60）`);
    if (prio.entries.length < 80) issues.push(`监听器只解析出 ${prio.entries.length} 处（下限 80）`);
    return issues;
}

// ---------------------------------------------------------------- 输出

function main() {
    const asJson = process.argv.includes('--json');
    const strict = process.argv.includes('--strict');

    const files = collect();
    const reg = loadRegistries();

    const state = checkStateFields(files, reg.allStateKeys);
    const prio = checkPriorities(files, reg.layer, reg.signals);
    const rend = checkRenderers(files, reg.specs);
    const selfIssues = selfCheck(reg, prio, rend);

    const sureCount = state.sure.length;
    // 硬问题只算「表项不存在 / 未知信号」；crossSignal 是合法复用，不计入硬数。
    const prioProblemCount = prio.problems.badRef.length + prio.problems.unknownSignal.length;
    const rendProblemCount = rend.missingRenderer.length + rend.contradicted.length;

    if (asJson) {
        console.log(JSON.stringify({
            ver: VER,
            files: files.length,
            selfIssues,
            state: {
                sure: state.sure,
                unsure: state.unsure,
                unused: state.unused,
                scannedFields: state.scannedFields,
                schemaCount: reg.allStateKeys.size
            },
            priority: {
                totalEntries: prio.entries.length,
                problems: prio.problems,
                orphans: prio.orphans,
                dupPriority: prio.dupPriority,
                layerPhases: Object.keys(reg.layer).length
            },
            render: { ...rend, specsCount: Object.keys(reg.specs).length }
        }, null, 2));
    } else {
        console.log('=== ' + VER + ' ===');
        console.log(`扫描 ${files.length} 个主代码文件；登记簿：状态字段 ${reg.allStateKeys.size} / 执行阶段 ${Object.keys(reg.layer).length} / 信号 ${Object.keys(reg.signals).length} / fact 契约 ${Object.keys(reg.specs).length} / 渲染器 ${rend.registeredCount}`);
        console.log('口径：只报不改。三本账分别对应「状态存哪 / 何时跑 / 产出什么」。');

        console.log(`\n=== ① 状态字段 ===`);
        console.log(`代码读写但 schema 未登记：确定 ${state.sure.length} 个 / 待确认 ${state.unsure.length} 个`);
        if (!state.sure.length) console.log('  （无确定漏登）');
        for (const { field, sites } of state.sure) {
            console.log(`  ✗ ${field}  ${sites.length} 处`);
            for (const s of sites.slice(0, 3)) console.log(`      ${s.rel}:${s.line}`);
            if (sites.length > 3) console.log(`      …另 ${sites.length - 3} 处`);
        }
        if (state.unsure.length) {
            console.log(`  ── 待确认（接收者不是单位变量名，可能是 data._x 等内部字段）${state.unsure.length} 个`);
            for (const { field, sites } of state.unsure.slice(0, 12)) {
                console.log(`    ? ${field}  ${sites.length} 处  首个 ${sites[0].rel}:${sites[0].line}（接收者 ${sites[0].receiver}）`);
            }
            if (state.unsure.length > 12) console.log(`    …另 ${state.unsure.length - 12} 个`);
        }
        if (state.unused.length) {
            console.log(`  ── schema 登记但代码从不读写 ${state.unused.length} 个：${state.unused.join(', ')}`);
        }

        console.log(`\n=== ② 执行顺序 ===`);
        console.log(`监听器注册点 ${prio.entries.length} 处（eventBus.on + registerSettlementHook）`);
        const bn = prio.problems.bareNumber;
        const bnCustom = bn.filter(e => e.custom);
        const bnNumber = bn.filter(e => !e.custom);
        console.log(`  ✗ 引用不存在的表项 ${prio.problems.badRef.length} 处 / 未知信号 ${prio.problems.unknownSignal.length} 处`);
        for (const e of prio.problems.badRef) console.log(`      ${e.rel}:${e.line}  ${e.via}(${e.signal}, ${e.priorityRaw}) — ${e.why}`);
        for (const e of prio.problems.unknownSignal) console.log(`      ${e.rel}:${e.line}  ${e.signal} 不在 SIGNAL_TYPES`);
        if (prio.problems.crossSignal.length) {
            console.log(`  · 跨信号复用优先级（合法定序，需人工确认，不计入硬数）${prio.problems.crossSignal.length} 处`);
            for (const e of prio.problems.crossSignal) console.log(`      ${e.rel}:${e.line}  ${e.via}(${e.signal}, ${e.priorityRaw}) — ${e.why}`);
        }
        console.log(`  · 裸数字优先级 ${bnNumber.length} 处（绕开中央表）`);
        for (const e of bnNumber.slice(0, 20)) {
            const extra = e.sameNum && e.sameNum.length ? `  同值: ${e.sameNum.join('/')}` : '';
            console.log(`      ${e.rel}:${e.line}  ${e.signal} = ${e.priorityRaw}${extra}`);
        }
        if (bnNumber.length > 20) console.log(`      …另 ${bnNumber.length - 20} 处`);
        if (bnCustom.length) {
            console.log(`  · 自定义优先级常量 ${bnCustom.length} 处（不在表内，需人工确认是否应登记）`);
            for (const e of bnCustom) console.log(`      ${e.rel}:${e.line}  ${e.signal} = ${e.priorityRaw}`);
        }
        console.log(`  · 同阶段重复优先级 ${prio.dupPriority.length} 组（同值并列，次序取决于模块 import 顺序）`);
        for (const d of prio.dupPriority) console.log(`      ${d.phase} = ${d.priority}: ${d.events.join(' / ')}`);
        console.log(`  · 表内登记但无注册点 ${prio.orphans.length} 条（改机制后可能忘了删表项）`);
        for (const o of prio.orphans) console.log(`      ${o.phase}.${o.event} = ${o.priority}`);

        console.log(`\n=== ③ 渲染契约 ===`);
        console.log(`  ✗ 声明了 renderFn 但没注册 ${rend.missingRenderer.length} 条  注册了但契约没声明 ${rend.undeclared.length} 条  声明 null 却注册 ${rend.contradicted.length} 条`);
        for (const m of rend.missingRenderer) console.log(`      ✗ ${m.factType} 声明 renderFn=${m.renderFn}，render/ 里无 registerFactRenderer`);
        for (const u of rend.undeclared) console.log(`      ? ${u.factType} 已在 ${u.sites[0].rel}:${u.sites[0].line} 注册，FACT_SPECS 无此条`);
        for (const c of rend.contradicted) console.log(`      ✗ ${c.factType} 契约声明 renderFn:null，却在 ${c.sites[0].rel}:${c.sites[0].line} 注册了`);
        if (rend.noRenderFnField.length) {
            console.log(`  · 契约条目缺 renderFn 字段 ${rend.noRenderFnField.length} 条：${rend.noRenderFnField.join(', ')}`);
        }

        console.log(`\n=== 自证断言 ===`);
        if (!selfIssues.length) console.log('  （通过：各登记簿解析数量均在下限之上）');
        for (const s of selfIssues) console.log('  ✗ ' + s);

        const total = sureCount + prioProblemCount + rendProblemCount;
        console.log(`\n确定需要处理：${total} 项（状态漏登 ${sureCount} / 执行顺序 ${prioProblemCount} / 渲染契约 ${rendProblemCount}）`);
        console.log(strict
            ? '\n模式：STRICT（自证失败或上述确定项非空即退出 1）'
            : '\n模式：报告（只报不改，退出码 0）——看清清单后再决定要不要修');
    }

    if (strict && (selfIssues.length || sureCount + prioProblemCount + rendProblemCount > 0)) process.exit(1);
}

main();
