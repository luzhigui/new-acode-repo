// tests/hls-playback-ownership-guard.mjs — 蓄意轰拳「一次爆发只能有一个演出者」
// V1.0.0 | 2026-11-01 | 用户实报：玩家亲自操作时，79 演黑幕 → 引擎发信号 → 93 演战场，两个都演了；
//   回放/从机/自动时 79 不弹、只有 93，观感正好。根因不是「93 轻量版太重」，而是**演出没有唯一负责人**：
//   79 演完只写 hlsAimPlayedAt 时间戳，93 靠「3.5 秒内算轻量」猜；时序一偏就恢复全套，双演。
//
// 本件守的是**归属**，不是时长：
//   玩家完整演完：79 全套，93 必须 0（不是「轻一点」，是直接 return）；
//   玩家中途跳过：79 未完整演完，93 全套；
//   回放/从机/自动：79 不弹，93 全套。
//   每条路径的演出者数量必须恰好 = 1，且「是否完整演完」必须随本轮载荷传递，
//   不允许再用 Date.now / hlsAimPlayedAt 这类墙钟时间窗来猜。
//
// 为什么是静态守门：79/93 都是浏览器 DOM 演出，node 侧没有真实布局；但「谁负责演」是代码结构，
//   可以在源码层机械核对。本件不 import 主代码、不跑战斗、不改任何主代码文件。
// 口径：只报告，不改判据；默认 exit 1 表示当前结构不满足唯一归属，挂 run-all OBSERVES 时不计退码。
export const VER = 'tests/hls-playback-ownership-guard.mjs V1.0.0';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// 剥注释口径只有一份：复用公共件，禁止在本件手写第二份（由 tests/_lib 的 auditStripCopies 机械守着）。
import { stripComments } from './_lib/static-truth-slice.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const SCAN_ONLY = process.argv.includes('--scan');

const FILES = {
    ui79: 'ui/720-hanlisa-aim.js',
    player49: 'player/512-battle-flow.js',
    modules27: 'modules/319-elite-mingjiao-hanlisa.js',
    fx93: 'fx/615-fx-hanlisa-burst.js',
    render38: 'render/419-actions-translate-stat.js',
    render39: 'render/420-actions-defs.js',
    fx89: 'fx/610-fx-subscriber.js'
};

// 轻量分支里只要还出现这些调用之一，就说明「93 只是演得轻」，不是「93 不演」
const EFFECT_CALLS = [
    'shakeScreen', 'shatterTrue', 'impactHalf', 'impactFar',
    'bigDamageFloat', 'shockwave', 'particles', 'wordAndCore', 'vampFloat'
];

function read(rel) {
    return fs.readFileSync(path.join(root, rel), 'utf8');
}

// 剥注释：复用 tests/_lib/static-truth-slice.mjs 的 stripComments（口径只许一份，见文件头 import 注释）。
// 保留字符串内容与原换行，避免「注释里写了 return」骗过判据。

// 从 openIdx 指向的 { 开始，返回配对完整的 {...}（忽略注释与字符串里的括号）
function braceBlock(src, openIdx) {
    if (openIdx < 0 || src[openIdx] !== '{') return null;
    let depth = 0, quote = null, lineComment = false, blockComment = false;
    for (let i = openIdx; i < src.length; i++) {
        const c = src[i], n = src[i + 1];
        if (lineComment) { if (c === '\n') lineComment = false; continue; }
        if (blockComment) {
            if (c === '*' && n === '/') { blockComment = false; i++; }
            continue;
        }
        if (quote) {
            if (c === '\\') { i++; continue; }
            if (c === quote) quote = null;
            continue;
        }
        if (c === '/' && n === '/') { lineComment = true; i++; continue; }
        if (c === '/' && n === '*') { blockComment = true; i++; continue; }
        if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) return src.slice(openIdx, i + 1);
        }
    }
    return null;
}

function findFunctionBlock(src, name) {
    const re = new RegExp('(?:export\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
    const m = re.exec(src);
    if (!m) return null;
    return braceBlock(src, src.indexOf('{', m.index));
}

function findIfBlock(src, condWord) {
    const re = new RegExp('if\\s*\\(\\s*' + condWord + '\\s*\\)\\s*\\{');
    const m = re.exec(src);
    if (!m) return null;
    return braceBlock(src, src.indexOf('{', m.index));
}

function objectKeys(block) {
    if (!block) return [];
    const m = /resolve\s*\(\s*\{([\s\S]*?)\}\s*\)/.exec(block);
    if (!m) return [];
    const keys = [];
    const re = /(?:^|,)\s*([A-Za-z_$][\w$]*)\s*:/g;
    let x;
    while ((x = re.exec(m[1])) !== null) keys.push(x[1]);
    return keys;
}

function countCall(block, name) {
    if (!block) return 0;
    const re = new RegExp('\\b' + name + '\\s*\\(', 'g');
    return (block.match(re) || []).length;
}

function countMatch(src, re) {
    return (src.match(re) || []).length;
}

// 机械核对一组源码（真实文件或自检样本）
function analyze(s) {
    const problems = [];
    const notes = [];
    const ui79 = stripComments(s.ui79 || '');
    const player = stripComments(s.player49 || '');
    const modules = stripComments(s.modules27 || '');
    const fx93 = stripComments(s.fx93 || '');
    const render38 = stripComments(s.render38 || '');
    const render39 = stripComments(s.render39 || '');
    const fx89 = stripComments(s.fx89 || '');

    // ① 入口门：79 只能在「玩家操控 + 华丽 + 非快进 + 非全自动」时弹
    const gateOk = /fxHanlisaAim/.test(player)
        && /fastForwardActive/.test(player)
        && /full-auto/.test(player);
    if (!gateOk) problems.push('① player/49 的手动门缺条件：必须同时有 fxHanlisaAim / fastForwardActive / full-auto 三处，否则回放或自动也会弹 79');

    // ② 79 是否完整演完，以及有没有把「完整演完」交给后续
    const finish = findFunctionBlock(ui79, 'finish');
    const ui79Full = !!finish && /if\s*\(\s*!skipped\s*&&\s*APP\.state\s*!==\s*'idle'\s*\)/.test(finish);
    const ui79Keys = objectKeys(finish);
    const ui79Flag = ui79Keys.find(k => /play|manual|full/i.test(k)) || null;
    const ui79Time = /hlsAimPlayedAt|Date\.now\s*\(/.test(ui79);

    // ③ 93 的抑制：必须是确定性标记驱动，且早于任何演出调用。
    //   先找函数体里第一次真正调用特效的位置；early return 必须在它之前。
    const burstFn = findFunctionBlock(fx93, 'showHanLiSaBurst');
    const effectPos = EFFECT_CALLS
        .map(name => (burstFn || '').search(new RegExp('\\b' + name + '\\s*\\(')))
        .filter(i => i >= 0);
    const firstEffectIdx = effectPos.length ? Math.min(...effectPos) : Infinity;

    // 路径 A：载荷标记 d.fullPlayed
    const early = /if\s*\(\s*d\.([A-Za-z_$][\w$]*)\s*(?:===\s*true)?\s*\)\s*\{?\s*return\b/.exec(burstFn || '');
    const fxFlag = early ? early[1] : null;
    const payloadSuppress = !!fxFlag && !!early && early.index < firstEffectIdx;

    // 路径 B：全局布尔（并行会话已把 93 从时间戳迁到 hlsAimPlayedThisTurn）：也接受，
    //   但必须 ① 79 真的把它置 true；② 93 命中后直接 return；③ 消费即清。
    const globalGet = /GlobalStore\.get\(\s*'([^']*(?:Played|played)[^']*)'\s*\)/.exec(burstFn || '');
    const globalFlag = globalGet ? globalGet[1] : null;
    let globalSuppress = false;
    let globalVar = null;
    let ui79SetGlobalTrue = false;
    if (globalFlag) {
        const assign = new RegExp("(?:const\\s+|let\\s+|var\\s+)?([A-Za-z_$][\\w$]*)\\s*=\\s*(?:!!\\s*)?GlobalStore\\.get\\(\\s*'"
            + globalFlag + "'\\s*\\)").exec(burstFn || '');
        globalVar = assign ? assign[1] : null;
        const globalEarly = globalVar
            ? new RegExp('if\\s*\\(\\s*' + globalVar + '\\s*(?:===\\s*true)?\\s*\\)\\s*\\{?\\s*return\\b').exec(burstFn || '')
            : null;
        globalSuppress = !!globalEarly && globalEarly.index < firstEffectIdx;
        ui79SetGlobalTrue = new RegExp("GlobalStore\\.set\\(\\s*'" + globalFlag + "'\\s*,\\s*true\\s*\\)").test(ui79);
        if (!ui79SetGlobalTrue) problems.push('③ 93 读全局标记 ' + globalFlag + '，但 79 没有把它置 true（只置 false 或仍在写旧键）⇒ 标记永远读不到');
        if (!globalSuppress) problems.push('③ 93 读了全局标记 ' + globalFlag + ' 但没有在演出前直接 return；仍会走 lite/full 演出');
        if (!new RegExp("GlobalStore\\.set\\(\\s*'" + globalFlag + "'\\s*,\\s*false\\s*\\)").test(fx93)) {
            problems.push('③ 93 读完全局标记 ' + globalFlag + ' 没有消费清零；下一发可能误判');
        }
    }
    const suppress = payloadSuppress || globalSuppress;

    const fx93Time = /hlsAimPlayedAt|Date\.now\s*\(/.test(fx93);
    if (fx93Time) problems.push('③ fx/93 仍靠 hlsAimPlayedAt / Date.now 时间窗决定降不降级；时序一偏就恢复全套，必须改成确定性标记');
    if (!fxFlag && !globalFlag) problems.push('③ fx/93 没有「本轮已由 79 完整演出」的短路；手动路径会再演一次');
    if (ui79Full && !ui79Flag && !ui79SetGlobalTrue) {
        problems.push('② ui/79 会完整演完，但没有交接「完整演完」（resolve 标记或全局布尔置 true 二者皆无）；跳过与完整演完无法区分');
    }
    if (ui79Time && globalFlag) {
        notes.push('② 79 仍在写旧时间戳 hlsAimPlayedAt，而 93 已改读 ' + globalFlag + '；旧标记是死键');
    } else if (ui79Time) {
        notes.push('② ui/79 仍在写 hlsAimPlayedAt 墙钟标记；它只能当过渡，不能作为唯一判据');
    }

    const liteBlock = findIfBlock(burstFn, 'lite');
    const liteEffects = liteBlock
        ? EFFECT_CALLS.filter(name => countCall(liteBlock, name) > 0)
        : [];
    if (liteEffects.length) {
        problems.push('③ fx/93 的 lite 分支仍在演出：' + liteEffects.join(' / ') + '；手动路径应直接 return，不是「轻一点」');
    }

    // ④ 标记链：79 resolve → player/49 写入 → modules/27 载荷 → 93 读取
    let stateKey = null;
    if (fxFlag && ui79Flag) {
        if (fxFlag !== ui79Flag) {
            problems.push('④ 79 的标记名 ' + ui79Flag + ' 与 93 读取的 d.' + fxFlag + ' 不一致；跨层改名会断链');
        }
        const stateM = new RegExp('hls\\.state\\.([A-Za-z_$][\\w$]*)\\s*=\\s*(?:!!\\s*)?choice\\.' + ui79Flag + '\\b').exec(player);
        stateKey = stateM ? stateM[1] : null;
        if (!stateKey) {
            problems.push('④ player/49 没有把 choice.' + ui79Flag + ' 写进 hls.state._hlsAim*；引擎拿不到「79 已完整演完」');
        }
        const payloadM = /const\s+burstPayload\s*=\s*\{([\s\S]*?)\};/.exec(modules);
        const payload = payloadM ? payloadM[1] : '';
        // 允许两种干净写法：载荷里直接读 state，或先 const fullPlayed = hls.state._hlsAimFullPlayed 再放进载荷
        const localAlias = stateKey
            ? new RegExp('const\\s+' + fxFlag + '\\s*=\\s*hls\\.state\\.' + stateKey + '\\b').test(modules)
            : false;
        if (!payloadM) {
            problems.push('④ modules/27 找不到 burstPayload 对象；93 的载荷没有来源');
        } else {
            if (stateKey && !payload.includes(stateKey) && !localAlias) {
                problems.push('④ modules/27 的 burstPayload 没带 ' + stateKey + '（也没有同名本地变量承接）；标记在引擎出口丢了');
            }
            if (!new RegExp('\\b' + fxFlag + '\\s*:').test(payload)) {
                problems.push('④ modules/27 的 burstPayload 没有 ' + fxFlag + ' 字段；93 永远收不到抑制标记');
            }
        }
    } else if (fxFlag && !ui79Flag) {
        problems.push('④ 93 读取 d.' + fxFlag + '，但 79 没有产出同名标记；载荷链断在源头');
    }

    // ⑤ 回放/从机/自动：38 补 1 条舞台动作 → 39 发 1 次信号 → 89 订阅 1 次；且全库只能有这一处 emit
    const stageActions = countMatch(render38, /kind\s*:\s*STAGE_ACTION_TYPES\.HANLISA_BURST/g);
    const bridgeEmits = countMatch(render39, /eventBus\.emit\(\s*FX_SIGNALS\.HANLISA_BURST/g);
    const subscriptions = countMatch(fx89, /eventBus\.on\(\s*FX_SIGNALS\.HANLISA_BURST/g);
    let emitTotal = 0;
    const emitSites = [];
    for (const [k, v] of Object.entries(s)) {
        if (typeof v !== 'string') continue;
        const code = stripComments(v);
        const n = countMatch(code, /eventBus\.emit\(\s*FX_SIGNALS\.HANLISA_BURST/g);
        if (n) { emitTotal += n; emitSites.push(k + '×' + n); }
    }
    if (stageActions !== 1) problems.push('⑤ render/38 为一份 hlsBurst 载荷补了 ' + stageActions + ' 条舞台动作（应为 1）');
    if (bridgeEmits !== 1) problems.push('⑤ render/39 的 HANLISA_BURST 发射点 ' + bridgeEmits + ' 处（应为 1）');
    if (subscriptions !== 1) problems.push('⑤ fx/89 的 HANLISA_BURST 订阅 ' + subscriptions + ' 处（应为 1）');
    if (emitTotal !== 1) problems.push('⑤ 主代码 HANLISA_BURST 发射点共 ' + emitTotal + ' 处（' + (emitSites.join(' / ') || '无') + '），应只有 render/39 一处');

    // ⑥ 归属计数：手动与回放各恰好 1 个演出者
    const manualOwners = (ui79Full ? 1 : 0) + (suppress ? 0 : 1);
    const replayOwners = (emitTotal === 1 && subscriptions === 1) ? 1 : 0;
    if (manualOwners !== 1) {
        problems.push('⑥ 手动路径演出者 = ' + manualOwners + '（79 ' + (ui79Full ? '全套' : '未完整') + ' + 93 '
            + (suppress ? '静默' : (liteEffects.length ? '轻量演出' : '全套')) + '），必须恰好 1');
    }
    if (replayOwners !== 1) {
        problems.push('⑥ 回放/从机/自动路径演出者 = ' + replayOwners + '（应只有 93 全套 1 个）');
    }

    return {
        gateOk, ui79Full, ui79Flag, ui79Time, ui79SetGlobalTrue, fxFlag, globalFlag, globalVar,
        payloadSuppress, globalSuppress, suppress, fx93Time,
        liteEffects, stageActions, bridgeEmits, subscriptions, emitTotal, emitSites,
        manualOwners, replayOwners, problems, notes
    };
}

function selftest() {
    const good = {
        ui79: "function finish(skipped) { if (!skipped && APP.state !== 'idle') { set(); } resolve({ aim: 1, holdMs: 2, fullPlayed: !skipped }); }",
        player49: "if (GlobalStore.get('fxHanlisaAim') && !GlobalStore.get('fastForwardActive') && c.autoLevel !== 'full-auto') {} hls.state._hlsAimFullPlayed = !!choice.fullPlayed;",
        modules27: "const burstPayload = { seq: 1, fullPlayed: hls.state._hlsAimFullPlayed === true, hits };",
        fx93: "export function showHanLiSaBurst(d) { if (d.fullPlayed) return; const lite = false; }",
        render38: "kind: STAGE_ACTION_TYPES.HANLISA_BURST, hlsBurst: data.hlsBurst",
        render39: "eventBus.emit(FX_SIGNALS.HANLISA_BURST, action.hlsBurst);",
        fx89: "eventBus.on(FX_SIGNALS.HANLISA_BURST, P, (d) => {});"
    };
    const cases = [];
    const base = analyze(good);
    cases.push(['牙零 干净样本', base.manualOwners === 1 && base.replayOwners === 1 && base.problems.length === 0]);

    const noReturn = analyze({ ...good, fx93: "export function showHanLiSaBurst(d) { const lite = false; }" });
    cases.push(['牙A 93 无载荷短路', noReturn.manualOwners === 2 && noReturn.problems.length > 0]);

    const liteFx = analyze({ ...good, fx93: "export function showHanLiSaBurst(d) { if (d.fullPlayed) return; const lite = true; if (lite) { shakeScreen(); return; } }" });
    cases.push(['牙B 93 轻量分支仍在演', liteFx.liteEffects.includes('shakeScreen') && liteFx.problems.length > 0]);

    const timeWindow = analyze({ ...good, fx93: "export function showHanLiSaBurst(d) { const playedAt = GlobalStore.get('hlsAimPlayedAt') || 0; const lite = (Date.now() - playedAt) < 3500; }" });
    cases.push(['牙C 93 仍靠时间窗', timeWindow.fx93Time === true && timeWindow.problems.length > 0]);

    const noFlag = analyze({ ...good, ui79: "function finish(skipped) { if (!skipped && APP.state !== 'idle') { set(); } resolve({ aim: 1, holdMs: 2 }); }" });
    cases.push(['牙D 79 没交接完整标记', noFlag.problems.some(p => p.indexOf('没有交接「完整演完」') >= 0)]);

    const noPayload = analyze({ ...good, modules27: "const burstPayload = { seq: 1, hits };" });
    cases.push(['牙E 载荷丢标记', noPayload.problems.some(p => p.indexOf('没有 fullPlayed 字段') >= 0)]);

    const noBridge = analyze({ ...good, render39: "const x = 1;" });
    cases.push(['牙F 回放桥断', noBridge.replayOwners === 0 && noBridge.problems.some(p => p.indexOf('发射点 0 处') >= 0)]);

    const globalGap = analyze({
        ...good,
        fx93: "export function showHanLiSaBurst(d) { const played = !!GlobalStore.get('hlsAimPlayedThisTurn'); GlobalStore.set('hlsAimPlayedThisTurn', false); const lite = played; if (lite) { shakeScreen(); return; } }"
    });
    cases.push(['牙G 全局标记断链', globalGap.problems.some(p => p.indexOf('没有把它置 true') >= 0)
        && globalGap.problems.some(p => p.indexOf('没有在演出前直接 return') >= 0)]);

    return cases;
}

function main() {
    console.log('=== 蓄意轰拳演出归属守门 ' + VER + ' ===');

    const teeth = selftest();
    let badTeeth = 0;
    for (const [name, ok] of teeth) {
        console.log('  ' + (ok ? '✅' : '❌') + ' ' + name);
        if (!ok) badTeeth++;
    }
    if (badTeeth) {
        console.log('❌ 守门自身失效 ' + badTeeth + ' 条（抽取器坏了，下面关于主代码的结论不可采信）');
        process.exit(SCAN_ONLY ? 0 : 1);
    }

    const sources = {};
    const missing = [];
    for (const [k, rel] of Object.entries(FILES)) {
        try { sources[k] = read(rel); } catch (e) { missing.push(rel); }
    }
    if (missing.length) {
        console.log('❌ 主代码文件缺失：' + missing.join('、') + '；归属无从核对');
        process.exit(SCAN_ONLY ? 0 : 1);
    }

    const r = analyze(sources);
    console.log('--- 路径与归属 ---');
    console.log('  ' + (r.gateOk ? '✅' : '❌') + ' 入口门：79 只在玩家操控 + 华丽 + 非快进 + 非全自动时弹');
    const handoff = r.ui79Flag || (r.ui79SetGlobalTrue ? r.globalFlag : null);
    console.log('  ' + (r.ui79Full ? '✅' : '⚪') + ' 79：' + (r.ui79Full ? '会完整演出' : '不承担完整演出')
        + (handoff ? '，交接标记 ' + handoff : '，无交接标记'));
    console.log('  ' + (r.suppress ? '✅' : '❌') + ' 93：' + (r.suppress ? '命中标记即 return（0 演出）' : '没有短路，会再演一次')
        + (r.liteEffects.length ? '；lite 分支仍在演 ' + r.liteEffects.join('/') : ''));
    const markerText = r.payloadSuppress
        ? '本轮载荷 d.' + r.fxFlag
        : (r.globalFlag ? '全局布尔 ' + r.globalFlag + (r.globalSuppress ? '（已短路）' : '（只读未短路）') : (r.fx93Time ? '墙钟时间窗' : '无'));
    console.log('  ' + ((r.payloadSuppress || r.globalSuppress) && !r.fx93Time ? '✅' : '❌') + ' 93 抑制依据：' + markerText);
    console.log('--- 回放/从机/自动 ---');
    console.log('  ' + (r.stageActions === 1 ? '✅' : '❌') + ' 38 舞台动作 ' + r.stageActions + ' 条');
    console.log('  ' + (r.bridgeEmits === 1 ? '✅' : '❌') + ' 39 发射 ' + r.bridgeEmits + ' 处');
    console.log('  ' + (r.subscriptions === 1 ? '✅' : '❌') + ' 89 订阅 ' + r.subscriptions + ' 处');
    console.log('  ' + (r.emitTotal === 1 ? '✅' : '❌') + ' 全库 HANLISA_BURST 发射点 ' + r.emitTotal + ' 处'
        + (r.emitSites.length ? '（' + r.emitSites.join(' / ') + '）' : ''));
    console.log('--- 归属计数（应各为 1）---');
    console.log('  手动完整路径：' + r.manualOwners + (r.manualOwners === 1 ? ' ✅' : ' ❌'));
    console.log('  回放/从机/自动：' + r.replayOwners + (r.replayOwners === 1 ? ' ✅' : ' ❌'));

    if (r.notes.length) {
        console.log('--- 备注 ---');
        for (const n of r.notes) console.log('  · ' + n);
    }
    if (r.problems.length) {
        console.log('--- 红因 ---');
        for (const p of r.problems) console.log('  ❌ ' + p);
        console.log('❌ 演出归属不唯一：' + r.problems.length + ' 条');
        process.exit(SCAN_ONLY ? 0 : 1);
    }
    console.log('✅ 演出归属唯一：手动 79 / 跳过与回放 93，路径互不重叠');
    process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

export { stripComments, analyze, selftest };
