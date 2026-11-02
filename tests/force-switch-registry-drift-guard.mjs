// tests/force-switch-registry-drift-guard.mjs | V1.0.0 | 2026-11-02 夜间第 177 轮
//
// 「定向覆盖场次能按哪些强制开关」这份白名单，与主代码真正读的开关面，差多少 —— 每天自动报一次。
//
// ═══ 由来：这份清单在 tools 侧已经漂移过三次，每次都是人手翻出来的 ═══
//   tools/122-param-lab-core.js L47-49 的注释自己写着：
//     「2026-10-22 V1.2.4：清单对齐 116-clearBattleGlobals 的完整 8 项 —— 原缺
//       forceHanLiSa / forceWeakElite / forceSoloWeakElite（116 V1.9.1 / V1.12.0 / V1.12.2
//       各补一项时这里没跟着同步）。现状下 122/123 都不设这三项，暂不暴发；但 param-lab 一旦
//       加寒离飒/弱精英实验，残留 force 会污染后续基线跑批。」
//   ⇒ 同一份清单，**漂移了三次、每次都靠人读注释时顺手发现**，且「暂不暴发」四个字说明
//     它是**潜伏**的：不炸是因为当前没人用那条通道，不是因为清单对。
//
// ★ 而 tests 侧这份（tests/_lib/forced-case-normalize.mjs 的 FORCE_KEYS）现在停在 **3 条**，
//   主代码 modules/330-battle-init.js 剥注释后实读 **8 条** —— 同样的漂移，在 tests 侧
//   **没有任何机制会报**。第 172 轮把它收口成唯一来源时已经在文件头如实写了：
//     「剩 forceZhang / forceHanLiSa / forceSoloWeak 三个主代码里有、tests 侧从未登记，
//       本轮不顺手加（那是扩能力，属请拍板），如实列为下轮待办。」
//   到第 177 轮，这条待办挂了五轮，**仍然是靠人翻日志才看得见**。
//
// ═══ 本件做什么 / 不做什么 ═══
//   做：把「主代码读的面」与「tests 登记的面」两端各自机械抽出来，差集逐条点名，每轮自动报。
//   不做：
//     · **不改 FORCE_KEYS 一个字** —— 补登记 = 扩能力（会改结论），须拍板，本件不替人拍；
//     · 不替任何体检项改判据、不放宽任何门槛、不重录任何基线；
//     · 不抄第二份剥注释实现 —— 转发公共件 tests/_lib/static-truth-slice.mjs 的 stripComments
//       （第 146 轮「三份口径早晚分叉」的教训，第 173 轮又犯过一次）。
//   ⇒ 它把「谁记得谁去翻」变成「每轮清单上都有」，而不改变任何一条既有结论。
//
// ═══ 四个视图，各管一个失效面 ═══
//   ① 读取面：modules/330-battle-init.js 剥注释后 GlobalStore.get('force*') 与
//      localStorage.getItem('_force*') 的全集（实测 8 条）。★ 双通道归一：
//      `_forceXxx` 与 `forceXxx` 是同一个开关的两条读法，只算一条（否则虚高一倍）。
//   ② 轮盘抑制面：anyForce 表达式实际认的开关（实测 6 条 —— forceWeakElite / forcePang
//      各走自己的分支，不进 anyForce，这是主代码的既有分工，本件照抄不合并）。
//   ③ 登记面：tests 侧 FORCE_KEYS（3 条，**import 唯一来源，不抄副本**）。
//   ④ 写入面：ui/701-main-utils.js 里 GlobalStore.set('force*') 的键（dev 面板通道）。
//      ★ 只报不判：dev 通道该不该存在属拍板，本件不替它定性，只把数字摆出来。
//      ★ 边界如实写：tools/122-param-lab-core.js 与 tools/116-role-balance-worker.js
//        是「循环变量」写法（GlobalStore.set(k, null)），静态字面扫不到，本栏不假装看见了。
//
// ═══ 两个差集，只有一条判红 ═══
//   未登记（读取面 − 登记面，实测 5 条）：**能力缺口**，不判红，逐条点名 + 棘轮上限 5
//     （只许降不许升）⇒ 主代码再加一个开关、tests 还没登记，下一轮立刻 6 > 5 变 TRIP。
//   幽灵（登记面 − 读取面，实测 0 条）：**判红**。这一条最要命 —— 白名单里躺着一个主代码
//     根本不读的键，等于拿 GlobalStore 当后门改引擎行为，且喂进定向场次**静默无效**：
//     不报错、不变红，只是悄悄变成没看见（与第 167 轮「只改生产者漏改消费者 ⇒ 解析出 0 行」
//     同一款假绿）。文件头那句「不许拿 GlobalStore 当后门改引擎行为」此前只有人话在守。
//
export const VER = 'tests/force-switch-registry-drift-guard.mjs V1.0.0';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './_lib/static-truth-slice.mjs';
import { FORCE_KEYS } from './_lib/forced-case-normalize.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// 主代码「强制精英」的落点；写入面通道所在文件
export const MAIN_REL = 'modules/330-battle-init.js';
export const WRITER_REL = 'ui/701-main-utils.js';

// 规模闸门：主代码读取面至少几条。低于它 ⇒ 要么解析秃了、要么文件搬走了，
// ★ 一律不放行（不许拿「0 条」当「没问题」，这是本件最容易自产的假绿）。
export const MIN_MAIN_KEYS = 8;

// 棘轮上限：允许「主代码读而 tests 未登记」的条数。**首次实测值 5**，只许降不许升。
export const UNREG_RATCHET = 5;

// 抽取用正则（只认 force 前缀的键；双引号也认；下划线通道前缀可省）
const RE_GS_GET = /GlobalStore\s*\.\s*get\s*\(\s*(['"])(force[A-Za-z0-9_]*)\1\s*\)/g;
const RE_LS_GET = /localStorage\s*\.\s*getItem\s*\(\s*(['"])_?(force[A-Za-z0-9_]*)\1\s*\)/g;
const RE_GS_SET = /GlobalStore\s*\.\s*set\s*\(\s*(["'])(force[A-Za-z0-9_]*)\1\s*,/g;
// ★ 单发版（无 /g）：声明体里取键名必须用 match() 的**捕获组**。
//   带 /g 时 String.match() 只回完整匹配数组、没有分组 ⇒ g[2] 恒为 undefined ⇒ 键名取空，
//   静默回退成变量名（实测把 forceSoloWeakElite 报成 forceSoloWeak）。这处坑当场由牙 Z1/Z7 逼出。
const RE_GS_GET_ONE = /GlobalStore\s*\.\s*get\s*\(\s*(['"])(force[A-Za-z0-9_]*)\1\s*\)/;
const RE_LS_GET_ONE = /localStorage\s*\.\s*getItem\s*\(\s*(['"])_?(force[A-Za-z0-9_]*)\1\s*\)/;
const RE_ANYFORCE = /const\s+anyForce\s*=([^;]*);/;
const RE_IDENT = /[A-Za-z_$][\w$]*/g;

const sorted = (arr) => [...new Set(arr)].sort();

/**
 * 从主代码源码里机械抽「读取面 / 轮盘抑制面」。
 * ★ 全程在剥注释后的代码上做：注释里写一个 forceXxx 不算开关（牙 Z6 钉死）。
 * @returns {{ok:boolean, reason:string, readKeys:string[], anyForceKeys:string[], unresolved:string[]}}
 */
export function parseForceSwitches(src) {
    const code = stripComments(src || '');
    const read = [];
    for (const m of code.matchAll(RE_GS_GET)) read.push(m[2]);
    for (const m of code.matchAll(RE_LS_GET)) read.push(m[2]);   // `_forceX` 归一成 `forceX`

    const am = code.match(RE_ANYFORCE);
    if (!am) {
        return { ok: false, reason: `源码里找不到 anyForce 表达式 ⇒ 无法判断轮盘抑制面（不许假装 0 条）`, readKeys: sorted(read), anyForceKeys: [], unresolved: [] };
    }
    const vars = (am[1].match(RE_IDENT) || []).filter(v => v !== 'true' && v !== 'false' && v !== 'null' && v !== 'undefined');
    const keys = [];
    const unresolved = [];
    for (const v of vars) {
        const decl = code.match(new RegExp('const\\s+' + v.replace(/\$/g, '\\$') + '\\s*=([^;]*);'));
        let key = null;
        if (decl) {
            const g = decl[1].match(RE_GS_GET_ONE) || decl[1].match(RE_LS_GET_ONE);
            if (g) key = g[2];
        }
        if (!key && /^force/.test(v)) key = v;
        if (key) keys.push(key); else unresolved.push(v);
    }
    const readKeys = sorted(read);
    const anyForceKeys = sorted(keys);
    if (readKeys.length === 0 || anyForceKeys.length === 0) {
        return { ok: false, reason: `解析出 0 条开关（读取面 ${readKeys.length} / 抑制面 ${anyForceKeys.length}）⇒ 不放行`, readKeys, anyForceKeys, unresolved };
    }
    return { ok: true, reason: '', readKeys, anyForceKeys, unresolved };
}

/** 抽写入面（dev 面板通道）：GlobalStore.set('force*', ...) 的键 */
export function parseForceWriters(src) {
    const out = [];
    for (const m of stripComments(src || '').matchAll(RE_GS_SET)) out.push(m[2]);
    return sorted(out);
}

/**
 * 四面合账。
 * @param {{mainSrc:string, writerSrc:string|null, registry:string[]}} p
 */
export function assess(p) {
    const parsed = parseForceSwitches(p.mainSrc);
    if (!parsed.ok) return { ok: false, reason: parsed.reason, trips: [`解析不放行：${parsed.reason}`] };

    const registry = sorted(p.registry || []);
    const readKeys = parsed.readKeys;
    const unregistered = readKeys.filter(k => !registry.includes(k));
    const phantom = registry.filter(k => !readKeys.includes(k));
    const scaleOk = readKeys.length >= MIN_MAIN_KEYS;

    const trips = [];
    if (phantom.length) trips.push(`幽灵登记 ${phantom.length} 条（主代码根本不读）：${phantom.join(' / ')}`);
    if (unregistered.length > UNREG_RATCHET) trips.push(`未登记 ${unregistered.length} 条 > 棘轮上限 ${UNREG_RATCHET}`);
    if (!scaleOk) trips.push(`读取面 ${readKeys.length} 条 < 规模闸门 ${MIN_MAIN_KEYS}`);

    const writers = p.writerSrc == null ? null : parseForceWriters(p.writerSrc);
    const writeOnly = writers == null ? null : writers.filter(k => !readKeys.includes(k));
    const readOnly = writers == null ? null : readKeys.filter(k => !writers.includes(k));

    return {
        ok: true, reason: '', readKeys, anyForceKeys: parsed.anyForceKeys, unresolved: parsed.unresolved,
        registry, unregistered, phantom, scaleOk, writers, writeOnly, readOnly,
        trips, pass: trips.length === 0
    };
}

function report(a) {
    const L = [];
    L.push(`强制开关登记漂移守门（登记面唯一来源 tests/_lib/forced-case-normalize.mjs）`);
    if (!a.ok) {
        L.push(`  ❌ 不放行：${a.reason}`);
        L.push(`RESULT: TRIP —— ${a.reason}`);
        return L.join('\n');
    }
    L.push(`  ① 主代码读取面 ${MAIN_REL}：${a.readKeys.length} 条 —— ${a.readKeys.join(' / ')}`);
    L.push(`  ② 轮盘抑制面 anyForce：${a.anyForceKeys.length} 条 —— ${a.anyForceKeys.join(' / ')}`);
    L.push(`  ③ tests 登记面 FORCE_KEYS：${a.registry.length} 条 —— ${a.registry.join(' / ')}`);
    if (a.writers == null) {
        L.push(`  ④ 写入面 ${WRITER_REL}：文件缺失 ⇒ 本栏留空（不假装 0 条）`);
    } else {
        L.push(`  ④ 写入面 ${WRITER_REL}：${a.writers.length} 条 —— ${a.writers.join(' / ')}`);
        L.push(`     设了没人读 ${a.writeOnly.length} 条 / 读了没 dev 通道 ${a.readOnly.length} 条${a.readOnly.length ? '：' + a.readOnly.join(' / ') : ''}`);
    }
    L.push(`  ★ 未登记（主代码读而 tests 不认）${a.unregistered.length} 条${a.unregistered.length ? ' —— ' + a.unregistered.join(' / ') : ''}`);
    L.push(`     不判红：补登记属扩能力须拍板；棘轮上限 ${UNREG_RATCHET}（只许降不许升），主代码再加一条立刻 TRIP`);
    L.push(`  ★ 幽灵（tests 认而主代码根本不读）${a.phantom.length} 条${a.phantom.length ? ' —— ' + a.phantom.join(' / ') : ''}${a.phantom.length ? ' ⇒ 静默无效的后门/假绿，判红' : ''}`);
    if (a.unresolved.length) L.push(`  · 未解析标识符 ${a.unresolved.length} 条：${a.unresolved.join(' / ')}（如实报，不猜）`);
    if (a.pass) {
        L.push(`RESULT: PASS —— 登记面无幽灵键（读取 ${a.readKeys.length} / 登记 ${a.registry.length} / 未登记 ${a.unregistered.length} ≤ ${UNREG_RATCHET}）`);
    } else {
        L.push(`RESULT: TRIP —— ${a.trips.join('；')}`);
    }
    return L.join('\n');
}

// ── 自证牙：全部喂合成源码，不碰真实主代码 ──────────────────────────────
function mkSrc(keys, opts = {}) {
    const lines = keys.map((k, i) => `    const v${i} = GlobalStore.get('${k}') || localStorage.getItem('_${k}') === '1';`);
    if (opts.noAnyForce) return lines.join('\n');
    lines.push(`    const anyForce = ${keys.map((_, i) => 'v' + i).join(' || ')};`);
    return lines.join('\n');
}

function selftest() {
    const fails = [];
    const ok = (cond, msg) => { if (!cond) fails.push(msg); };
    const FULL = ['forceZhang', 'forceWei', 'forceXieXun', 'forceHanLiSa', 'forceXiaoZhao', 'forceSoloWeakElite', 'forceWeakElite', 'forcePang'];

    // Z1 主代码多读一个开关 ⇒ 未登记里必须有它
    const z1 = assess({ mainSrc: mkSrc(['forceXiaoZhao', 'forceWei', 'forceZhang']), writerSrc: null, registry: ['forceXiaoZhao'] });
    ok(z1.ok && z1.unregistered.includes('forceWei') && z1.unregistered.includes('forceZhang'), 'Z1 主代码多读的开关应进未登记');

    // Z2 登记表里有主代码根本不读的键 ⇒ 判幽灵且 TRIP（后门/假绿方向）
    const z2 = assess({ mainSrc: mkSrc(FULL), writerSrc: null, registry: ['forceXiaoZhao', 'forceGhost'] });
    ok(z2.ok && z2.phantom.length === 1 && z2.phantom[0] === 'forceGhost', 'Z2 主代码不读的登记键应判幽灵');
    ok(z2.pass === false, 'Z2 幽灵键应判红 TRIP');

    // Z3 两边完全一致 ⇒ PASS 且两差集皆空
    const z3 = assess({ mainSrc: mkSrc(FULL), writerSrc: null, registry: FULL });
    ok(z3.ok && z3.pass === true && z3.unregistered.length === 0 && z3.phantom.length === 0, 'Z3 两面一致应 PASS 且无差集');

    // Z4 缺 anyForce 行 ⇒ 不放行（不许假装 0 条）
    const z4 = assess({ mainSrc: mkSrc(FULL, { noAnyForce: true }), writerSrc: null, registry: FULL });
    ok(z4.ok === false && z4.trips.length > 0, 'Z4 缺 anyForce 应不放行');

    // Z5 解析出 0 条 ⇒ 不放行
    const z5 = assess({ mainSrc: 'const anyForce = someOtherFlag;', writerSrc: null, registry: FULL });
    ok(z5.ok === false, 'Z5 解析出 0 条开关应不放行');

    // Z6 注释里的 forceXxx 不算开关（剥注释）
    const z6src = `    // const x = GlobalStore.get('forceCommentOnly');\n` + mkSrc(FULL);
    const z6 = assess({ mainSrc: z6src, writerSrc: null, registry: FULL });
    ok(z6.ok && !z6.readKeys.includes('forceCommentOnly'), 'Z6 注释里的 force 键不得算数');

    // Z7 双通道归一：GlobalStore 与 localStorage 读同一个键只算一条
    const z7 = assess({ mainSrc: mkSrc(['forceXiaoZhao']), writerSrc: null, registry: [] });
    ok(z7.ok && z7.readKeys.length === 1 && z7.readKeys[0] === 'forceXiaoZhao', 'Z7 双通道应归一成一条（实测 ' + (z7.ok ? z7.readKeys.length : 'n/a') + '）');

    // Z8 棘轮：未登记超过上限 ⇒ TRIP
    const z8 = assess({ mainSrc: mkSrc(FULL), writerSrc: null, registry: [] });
    ok(z8.ok && z8.unregistered.length === FULL.length && z8.pass === false, 'Z8 未登记超棘轮上限应 TRIP');

    // Z9 规模闸门：真实读取面缩水 ⇒ 不放行方向的 TRIP
    const z9 = assess({ mainSrc: mkSrc(['forceXiaoZhao', 'forceWei']), writerSrc: null, registry: ['forceXiaoZhao', 'forceWei'] });
    ok(z9.ok === false || z9.pass === false, 'Z9 读取面低于规模闸门应不放行或 TRIP');

    // Z10 写入面：设了没人读要能算出来（只报不判，但数字得对）
    const z10 = assess({ mainSrc: mkSrc(FULL), writerSrc: "GlobalStore.set('forceZhang', true); GlobalStore.set('forceGhost2', true);", registry: FULL });
    ok(z10.ok && z10.writeOnly && z10.writeOnly.includes('forceGhost2'), 'Z10 写入面「设了没人读」应算出');
    ok(z10.pass === true, 'Z10 写入面只报不判，不得拖累结论');

    if (fails.length) {
        console.log('自证牙失败 ' + fails.length + ' 条：');
        for (const f of fails) console.log('  ❌ ' + f);
        return 1;
    }
    console.log('自证牙 10 条全咬住（Z1 多读必进未登记 / Z2 幽灵必判红 / Z3 一致必 PASS / Z4 缺 anyForce 不放行 / Z5 零解析不放行 / Z6 注释不算数 / Z7 双通道归一 / Z8 超棘轮必 TRIP / Z9 规模缩水必报 / Z10 写入面只报不判）');
    return 0;
}

function main() {
    if (process.argv.includes('--selftest')) return selftest();

    const pMain = path.join(root, MAIN_REL);
    const pWriter = path.join(root, WRITER_REL);
    if (!fs.existsSync(pMain)) {
        console.log(`RESULT: TRIP —— 主代码 ${MAIN_REL} 不存在 ⇒ 不放行（不许假装 0 条）`);
        return 0;
    }
    const a = assess({
        mainSrc: fs.readFileSync(pMain, 'utf8'),
        writerSrc: fs.existsSync(pWriter) ? fs.readFileSync(pWriter, 'utf8') : null,
        registry: FORCE_KEYS
    });
    console.log(report(a));
    return 0;   // 观察项：结论供人工研判，不计退码（与变异树绊线同一取舍）
}

// 只有被直接执行时才跑正文（被 import 时保持沉默，便于自证与调试取样）
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exit(main());
}
