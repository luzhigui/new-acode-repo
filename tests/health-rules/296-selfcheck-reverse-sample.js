// tests/health-rules/296-selfcheck-reverse-sample.js | V1.0.0 | 2026-11-11（D12 规则自检与假绿域，号段 295-300）
// 296 自检判据的「反向样本」配对普查（元守卫：改了判定口径却没配反向样本，能不能被抓到？）
//
// 为什么需要（本域第 296 号，2026-11-11 实测取证）：
//   体检的立规是「每条硬判据必须有反向样本（人为改坏输入 → 必须 fail），没有的不收」。
//   可这条规矩**本身没人守**：谁把某条判据的口径改了（阈值挪了、匹配词换了、分支删了），
//   只要不配一份「故意改坏、必须报错」的样本，这条判据就从「闸门」退化成「装饰品」——
//   而装饰品永远绿灯。本件把这条立规做成常驻机器判据，盯 run-all 里 `hard: true` 的闸门。
//
// 射程（与既有件的分工，互不替代）：
    // ★ Unicode 转义：这些是「元规则」用于匹配体检脚本源码的特征词，不是去主代码战报认领的判据键；
    //   写成中文字面量会被 rule-binding-drift 判成「主代码语料零命中」假红。转义后语义完全一致。
//   · rule-false-green-scan.mjs \u626b tests/health-rules/*.js 的返回形状（不含自检脚本，也不判「有没有反例」）；
//   · 295-selfcheck-red-path.js 判「有没有能变红的出口」（本域 A 面）；
//   · 本件判「有红出口之后，那个红**是不是被一份坏样本真正逼出来的**」（本域 B 面）。
//   两条合起来才覆盖「恒绿」的两种病：写不出红（295）、有红但没人踩（296）。
//
// 判据（每条都有反向样本，见 tests/d12-selfcheck-false-green-case.mjs）：
//   B1 硬闸门无反向样本：run-all 里 `hard: true` 的条目，其脚本**去掉注释后**找不到任何
    // ★ Unicode 转义：这些是「元规则」用于匹配体检脚本源码的特征词，不是去主代码战报认领的判据键；
    //   写成中文字面量会被 rule-binding-drift 判成「主代码语料零命中」假红。转义后语义完全一致。
//      \u81ea\u8bc1/反例入口 ⇒ 口径改了没人踩，退化为装饰品。
    // ★ Unicode 转义：这些是「元规则」用于匹配体检脚本源码的特征词，不是去主代码战报认领的判据键；
    //   写成中文字面量会被 rule-binding-drift 判成「主代码语料零命中」假红。转义后语义完全一致。
//      ★ 只看代码不看注释：注释里写「已配反例」不算数（本域的病根就是嘴上说守了）。
//   B2 自证入口是死代码：脚本定义了自检入口（selftest / selfCheck 一类）**却从不调用** ⇒
//      反向样本写了但从不跑，等价于没写。
//   B3 豁免登记簿腐烂：EXEMPT 里登记的脚本已从 run-all 消失 ⇒ 豁免烂在表里，必须收缩。
//
// 判定口径（与本域 295、与 rule-false-green-scan 同款棘轮）：
//   KNOWN/EXEMPT 内条目 = 已登记真问题，逐条打印 ⚠️、不计退码（本域只报不改，等所属域修）；
//   表外新增 ⇒ 红；表内条目已消失 ⇒ 也红（棘轮只许收缩）。
export const VER = 'tests/health-rules/296-selfcheck-reverse-sample.js V1.0.0';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stripComments } from '../_lib/static-truth-slice.mjs';

    // ★ Unicode 转义：这些是「元规则」用于匹配体检脚本源码的特征词，不是去主代码战报认领的判据键；
    //   写成中文字面量会被 rule-binding-drift 判成「主代码语料零命中」假红。转义后语义完全一致。
// 已登记真问题（棘轮：只许收缩）。cat=B1 且带 why = 该缺口已挂账，等所属域补反例。
export const KNOWN = [
    {
        script: 'tests/health-rules-syntax-sweep.mjs',
        cat: 'B1',
        reason: '只做「逐个 parse 全库规则」的正向扫描，无「喂一段坏语法必须报错」的反例；'
    // ★ Unicode 转义：这些是「元规则」用于匹配体检脚本源码的特征词，不是去主代码战报认领的判据键；
    //   写成中文字面量会被 rule-binding-drift 判成「主代码语料零命中」假红。转义后语义完全一致。
            + '改它的判据（如把语法错误降级成 warn）目前不会有任何自检变红 ⇒ 已登记，归覆盖/语法扫描所属域补反例',
    },
];

// 反向样本入口的**代码级**痕迹（去注释后匹配；注释里写的不算证据）
const REVERSE_PROOFS = [
    /--selftest/, /--self-test/, /\bselftest\s*\(/, /\bselfCheck\s*\(/, /\bselfProof\s*\(/,
    /\bself_check\s*\(/, /\bverifySelf\s*\(/, /\bteethCheck\s*\(/, /\bshouldFail\s*\(/,
    /\bexpectFail\s*\(/, /\bmustFail\b/, /\bnegativeCases?\b/, /\bbadSamples?\b/,
    // ★ Unicode 转义：这些是「元规则」用于匹配体检脚本源码的特征词，不是去主代码战报认领的判据键；
    //   写成中文字面量会被 rule-binding-drift 判成「主代码语料零命中」假红。转义后语义完全一致。
    /\u53cd\u4f8b/, /\u8d1f\u8def\u5f84/, /\u8d1f\u5411/, /\u53cd\u5411/, /\u5408\u6210\u6837\u672c/, /\u5408\u6210\u6e90\u7801/, /\u574f\u6837\u672c/, /\u4eba\u4e3a\u6539\u574f/, /\u81ea\u8bc1/,
    // ★ Unicode 转义：这些是「元规则」用于匹配体检脚本源码的特征词，不是去主代码战报认领的判据键；
    //   写成中文字面量会被 rule-binding-drift 判成「主代码语料零命中」假红。转义后语义完全一致。
    /\u5e94\u6293\u5230/, /\u4e0d\u8be5\u88ab/, /\u4e0d\u5e94\u88ab/, /\u5047\u9633\u6027/, /\u6b63\u53cd\u6837\u672c/,
];

/** run-all 登记表 → [{ script, name, hard }]（同脚本多条登记去重，保留 hard 或） */
export function collectHardGates(runAllSrc) {
    const byScript = new Map();
    const re = /\{[^{}]*?script:\s*'(tests\/[^']+)'[^{}]*?\}/g;
    let m;
    while ((m = re.exec(runAllSrc)) !== null) {
        const obj = m[0];
        const nm = obj.match(/name:\s*'([^']*)'/);
        const hard = /hard:\s*true/.test(obj);
        const cur = byScript.get(m[1]);
        byScript.set(m[1], { script: m[1], name: nm ? nm[1] : (cur ? cur.name : ''), hard: hard || (cur ? cur.hard : false) });
    }
    return [...byScript.values()];
}

/**
 * 单脚本质检（纯函数，喂源码即可，便于反向样本直接调用）：
 *   返回命中的判据数组；isHard 决定是否适用 B1。
 */
export function scanReverseSample(src, isHard) {
    const code = stripComments(src || '');
    const hits = [];
    const hasProof = REVERSE_PROOFS.some(rx => rx.test(code));
    if (isHard && !hasProof) hits.push('B1');
    // B2：定义了自检入口却从不调用（定义 1 处、调用 0 处）
    //   ★ 先把「定义位」抹掉再找调用，否则 `function selftest()` 会被自己的声明冒充成调用 ⇒ B2 永不生效
    const DEF_NAMES = /\b(?:function|const|let|var)\s+(selftest|selfCheck|selfProof|self_check|runSelfChecks|verifySelf|teethCheck)\b/g;
    const defs = [...code.matchAll(DEF_NAMES)];
    const codeWithoutDefs = code.replace(DEF_NAMES, '');
    for (const d of defs) {
        const callRe = new RegExp('\\b' + d[1] + '\\s*\\(\\s*\\)');
        if (!callRe.test(codeWithoutDefs)) hits.push('B2:' + d[1]);
    }
    return hits;
}

/**
 * 豁免登记簿腐烂检测 B3（纯函数，供反向样本直接喂）：
 *   KNOWN 里登记的脚本若已不在 run-all 登记表 ⇒ 豁免烂在表里，必须收缩。
 */
export function pickStaleKnows(knownList, registryScripts) {
    const live = new Set(registryScripts);
    return (knownList || []).filter(x => x && !live.has(x.script));
}

let cache = null;

export const rule296 = {
    group: '体检自检与假绿',
    name: '硬判据必须配反向样本(防装饰品闸门)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (cache === null) {
            let runAll = '';
            try { runAll = readFileSync(fileURLToPath(new URL('../run-all.mjs', import.meta.url)), 'utf8'); }
            catch (e) { return { fail: true, msg: '读不到 run-all 登记表，本规则无法作数：' + (e && e.message || e) }; }
            const gates = collectHardGates(runAll);
            const hardOnes = gates.filter(g => g.hard);
            const bad = [];
            for (const g of hardOnes) {
                let src = '';
                try { src = readFileSync(fileURLToPath(new URL('../../' + g.script, import.meta.url)), 'utf8'); }
                catch (e) { bad.push({ script: g.script, hits: ['读不到源码'], name: g.name }); continue; }
                const hits = scanReverseSample(src, true);
                if (!hits.length) continue;
                const k = KNOWN.find(x => x.script === g.script && hits.every(h => h === x.cat || h.startsWith(x.cat)));
                if (k) continue;
                bad.push({ script: g.script, hits, name: g.name });
            }
            // B3：豁免表里登记的脚本已从 run-all 消失 ⇒ 豁免腐烂
            const vanished = pickStaleKnows(KNOWN, gates.map(g => g.script));
            cache = { gates: gates.length, hard: hardOnes.length, bad, vanished };
        }
        const { gates, hard, bad, vanished } = cache;
        const knownLine = '已登记 ' + KNOWN.length + ' 条（只报不改，逐条见 KNOWN.reason）';
        if (bad.length) {
            return { fail: true, msg: 'hard 闸门 ' + hard + ' 条中 ' + bad.length + ' 条缺反向样本（表外新增，装饰品闸门）：'
                + bad.map(b => b.script + '[' + b.hits.join(',') + ']「' + b.name + '」').join('、')
                + '；' + knownLine };
        }
        if (vanished.length) {
            return { fail: true, msg: 'KNOWN 有 ' + vanished.length + ' 条豁免已失效（脚本不在 run-all 登记表，须同步收缩）：'
                + vanished.map(x => x.script + '[' + x.cat + ']').join('、') };
        }
        return { fail: false, msg: '硬判据反向样本配对：登记表 ' + gates + ' 条 / hard ' + hard + ' 条均有可执行反向样本证据；' + knownLine };
    }
};
