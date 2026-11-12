// tests/health-rules/295-selfcheck-red-path.js | V1.0.0 | 2026-11-11（D12 规则自检与假绿域，号段 295-300）
// 295 自检脚本的「变红出口」普查（元守卫：体检自检自身的假绿）
// 主题：某条自检恒返回通过，能不能被抓到？——能，且只能在写的时候抓、不能等它「跑出绿」。
//
// 为什么需要（本域第 295 号，2026-11-11 实测取证）：
//   run-all 的登记表里躺着一条 `tests/fact-coverage-selftest.mjs`：全文只有 `process.exit(0)`，
//   既没有非零退码、也没有 `process.exitCode = 1`、更没有 throw ⇒ **它在结构上不可能报红**。
//   而它自己的文件头写着「降级为候选生成器：仅报告，不判红，**不挂 run-all**」，
//   登记表里却仍挂着它（run-all「fact 覆盖交叉自检」）——于是一键体检每轮都多一条**恒绿的绿**，
//   看板上是 N 项检查、实际兜底的是 N-1 项。这类「自检自己不咬人」正是体检最贵的假绿：
//   它不会漏报某一场战斗，它漏报的是**整套防线正在失效**这件事本身。
//
// 与既有件的分工（互不替代）：
//   · rule-false-green-scan.mjs 判 tests/health-rules/*.js 的**返回形状**（A/B/C/D 四类），射程不含自检脚本；
//   · orphan-selftest-sweep.mjs 判「有没有被挂进 run-all」，判不出「挂进去了但永远绿」；
//   · 本件只看一件事实：**被 run-all 挂名的每个脚本，有没有一条能让自己变红的出口**。
//
// 判据（每条都有反向样本，见 tests/d12-selfcheck-false-green-case.mjs）：
//   R1 无任何变红出口：全文找不到 非零 process.exit / 非零 process.exitCode / throw 三者之一。
//   R2 出口被写死成绿：有 process.exit 调用，但**实参清一色是字面量 0**，且无 exitCode 赋值、无 throw。
//   R3（不作机器判据，只作证据陈述）：本域实测的那条恒绿线，自己文件里写着「仅报告，不判红，
//      不挂 run-all」，登记表里却仍挂着它。这句话是**散文**，且 stripComments 在含未配对引号的
//      注释块上会把后续注释当字符串留下（本仓库实测：fact-coverage-selftest.mjs 即如此），
//      拿散文当判据＝可被一句话洗绿的脆判据 ⇒ 故只由 R1/R2 出红，本条证据写进红消息与转交清单。
//
// 豁免（EXEMPT）：唯一来源在本文件，**必须写 why**；已消失的豁免条目仍会被点名（防豁免烂在表里）。
export const VER = 'tests/health-rules/295-selfcheck-red-path.js V1.0.0';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stripComments } from '../_lib/static-truth-slice.mjs';

// 已登记豁免（棘轮：只许收缩，不许无 why 新增）
export const EXEMPT = [];

const RUN_ALL = '../run-all.mjs';
const SELF = 'tests/health-rules/295-selfcheck-red-path.js';

/** 解析 run-all 登记表：返回 [{ script, name, hard, args }]（花括号内无嵌套，故 [^{}] 足够） */
export function parseRunAllRegistry(text) {
    const out = [];
    const re = /\{[^{}]*?script:\s*'(tests\/[^']+)'[^{}]*?\}/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const obj = m[0];
        const nameM = obj.match(/name:\s*'([^']*)'/);
        const argsM = obj.match(/args:\s*\[([^\]]*)\]/);
        out.push({
            script: m[1],
            name: nameM ? nameM[1] : '',
            hard: /hard:\s*true/.test(obj),
            args: argsM ? argsM[1].trim() : '',
        });
    }
    return out;
}

/**
 * 单脚本质检：喂「去注释后的源码」，返回命中的判据数组。
 * src 为空串视为「读不到」，由调用方定性质疑，本函数不替它编结论。
 */
export function scanRedPath(src) {
    const hits = [];
    const code = stripComments(src || '');
    const exits = [...code.matchAll(/process\.exit\s*\(([^)]*)\)/g)].map(m => m[1].trim());
    const hasNonZeroLiteral = exits.some(a => /^[1-9]\d*$/.test(a));
    const hasDelegated = exits.some(a => a !== '' && a !== '0' && !/^[1-9]\d*$/.test(a));
    const hasExitCodeSet = /process\.exitCode\s*=\s*[1-9]\d*/.test(code);
    const hasThrow = /(^|[^.\w$'"`])throw[\s]+/.test(code);
    const canRed = hasNonZeroLiteral || hasDelegated || hasExitCodeSet || hasThrow;
    if (!canRed) hits.push(exits.length > 0 ? 'R2' : 'R1');
    return hits;
}

/**
 * 豁免表腐烂检测（纯函数，供反向样本直接喂）：
 *   EXEMPT 里登记的脚本若已不在 run-all 登记表 ⇒ 豁免烂在表里，必须收缩。
 */
export function scanExemptDrift(exemptList, registryScripts) {
    const inRegistry = new Set(registryScripts);
    return (exemptList || []).filter(x => x && !inRegistry.has(x.script));
}

// 进程级缓存：登记表 + 逐脚本源码只在第一次调用时读盘（本规则会被逐场回放反复调用）
let cache = null;

export const rule295 = {
    group: '体检自检与假绿',
    name: '自检脚本必须有变红出口(防恒返回通过)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (cache === null) {
            let runAll = '';
            try { runAll = readFileSync(fileURLToPath(new URL(RUN_ALL, import.meta.url)), 'utf8'); }
            catch (e) { return { fail: true, msg: '读不到 run-all 登记表，本规则无法作数：' + (e && e.message || e) }; }
            const items = parseRunAllRegistry(runAll);
            const bad = [];
            for (const it of items) {
                if (it.script === SELF) continue;
                let src = '';
                try { src = readFileSync(fileURLToPath(new URL('../../' + it.script, import.meta.url)), 'utf8'); }
                catch (e) { bad.push({ script: it.script, hits: ['读不到源码'], name: it.name }); continue; }
                const hits = scanRedPath(src);
                if (!hits.length) continue;
                if (EXEMPT.some(x => x.script === it.script && hits.every(h => x.cats.includes(h)))) continue;
                bad.push({ script: it.script, hits, name: it.name });
            }
            const dead = scanExemptDrift(EXEMPT, items.map(i => i.script));
            cache = { total: items.length, bad, dead };
        }
        const { total, bad, dead } = cache;
        if (bad.length) {
            const lines = bad.map(b => b.script + '[' + b.hits.join(',') + ']「' + b.name + '」');
            return { fail: true, msg: 'run-all 登记的 ' + total + ' 条自检/守门脚本中 ' + bad.length + ' 条没有可达的变红出口（恒绿线，每轮白占一个名额）：' + lines.join('、') + ' —— 修法二选一：补真能变红的退码，或从登记表摘掉（挂观察项就别占闸门位）' };
        }
        if (dead.length) {
            return { fail: true, msg: 'EXEMPT 有 ' + dead.length + ' 条豁免已失效（对应脚本不再登记于 run-all，须同步收缩）：' + dead.map(x => x.script).join('、') };
        }
        return { fail: false, msg: '自检变红出口普查：' + total + ' 条登记脚本均有可达的红路径，豁免在册 ' + EXEMPT.length + ' 条' };
    }
};
