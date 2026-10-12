// tests/contract-consistency.mjs — 静态一致性契约网：①门槛一致性 ②翻译器契约
// V1.0.0 | ~9000 bytes | 2026-10-13 体检第 84 轮新建（补「写了不跑」类静默失效的三张契约网之二）
//   定位：【静态一致性检查，非运行时体检】——不跑战斗、不产战报，只对源码/表做结构对账。
//   检查① 门槛一致性：player/42player-core.js 的 hasStageWork(action) 执行门槛
//     （fx / store / storeAfter 任一有活）vs render/39-actions-defs.js 的 STAGE_ACTION_DEFS 全表 ——
//     凡带 store / storeAfter 的动作定义必须被门槛放行，凡 fx/store/storeAfter 全空的定义必须被挡。
//     player 层是浏览器代码、node 测不进，故做源码级校验：从 player/42 源码**抽出 hasStageWork
//     函数本体原文求值**（直接调被测函数，不复刻门槛实现——「规则不许复制产品旧实现」），
//     对 39 真表（node 可 import）逐条对跑。背景 bug：ROUND_START 清场只有 store 无 fx，
//     被只认 fx 的旧门槛整体跳过 5 周没人发现（player/42 V6.8.5 已修，本检查防复发）。
//   检查② 翻译器契约：infra/58-fact-contract.js 的 FACT_SPECS.translateFn 登记 ↔
//     render/38 家族 FACT_TRANSLATORS 表，双向对账（38 末尾校验循环只覆盖
//     「58 登记 → 表内有」单向、且只 console.error 不硬红）：
//     A. 58 登记 translateFn（非 null）→ 表内必须有条目（缺 = 静默丢动作）；
//     B. 表内有产动作条目 → 58 必须登记（漏登记 = 契约说谎「不产生 stageAction」）；
//     C. 58 登记 → 表内条目不许是 `() => null` 恒空形态（登记说产、表里恒空）。
//     显式空转条目（`() => null`）与 58 translateFn:null 合法共存，不报。
//   零触发守卫（防假绿）：defs / FACT_SPECS / 翻译表 任一为 0、或门槛源码抽取失败、或求值抛错，
//     一律硬红——「解析失效 = 空跑出绿」不许有。
// 退出码：任一硬红 exit 1。用法：node tests/contract-consistency.mjs
export const VER = 'tests/contract-consistency.mjs V1.0.0';

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// ---- 检查①：门槛一致性 ----
// 从源码抽出 `function <name>(...) {...}` 的完整原文（括号配平），抽不到返回 null（调用方硬红）。
export function extractFunctionSource(src, name) {
    const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(src);
    if (!m) return null;
    const start = m.index;
    const braceStart = src.indexOf('{', start);
    if (braceStart < 0) return null;
    let depth = 0;
    for (let i = braceStart; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(start, i + 1);
        }
    }
    return null;
}

// defs：STAGE_ACTION_DEFS 真表（39 import 得到）；gateSrc：hasStageWork 函数原文。
// 返回 { problems: string[], stats }：逐 def 对比「门槛放行与否」vs「该 def 有没有活干」。
export function checkGate(defs, gateSrc) {
    const problems = [];
    const keys = Object.keys(defs || {});
    if (keys.length === 0) problems.push('STAGE_ACTION_DEFS 解析出 0 条定义（39 表解析失效，检查空跑=假绿）');
    if (!gateSrc) problems.push('hasStageWork 源码抽取失败（player/42 改名/重构后判据失效，检查空跑=假绿）');
    if (problems.length) return { problems, stats: { defs: keys.length, gate: !!gateSrc } };

    let gate;
    try {
        // 函数原文在带 STAGE_ACTION_DEFS 形参的闭包里求值——用的是门槛本体，不是复刻品
        gate = new Function('STAGE_ACTION_DEFS', 'return (' + gateSrc + ');')(defs);
    } catch (e) {
        problems.push('hasStageWork 求值失败：' + (e && e.message || e));
        return { problems, stats: { defs: keys.length, gate: true } };
    }

    let workDefs = 0, storeOnly = 0, emptyDefs = 0;
    for (const k of keys) {
        const def = defs[k] || {};
        const hasWork = !!(def.fx || def.store || def.storeAfter);
        let passed;
        try { passed = !!gate({ kind: k }); } catch (e) {
            problems.push(`门槛求值抛错 kind=${k}：${e && e.message || e}`);
            continue;
        }
        if (hasWork) workDefs++;
        if (def.store && !def.fx && !def.storeAfter) storeOnly++;
        if (!hasWork) emptyDefs++;
        // 判据核心：带活的必须放行（store/storeAfter 是活，别再只认 fx）；全空的必须挡住
        if (hasWork && !passed) {
            problems.push(`kind=${k}：有活（fx=${!!def.fx} store=${!!def.store} storeAfter=${!!def.storeAfter}）但门槛不放行 —— 该动作会被整体跳过（ROUND_START 清场就是这么丢了 5 周）`);
        }
        if (!hasWork && passed) {
            problems.push(`kind=${k}：fx/store/storeAfter 全空但门槛放行 —— 门槛不再是「任一有活」口径`);
        }
    }
    if (workDefs === 0) problems.push('带 store/storeAfter 的定义为 0 条 —— 门槛判据失去对照物（空转嫌疑）');
    return { problems, stats: { defs: keys.length, workDefs, storeOnly, emptyDefs } };
}

// ---- 检查②：翻译器契约 ----
// translators：Set<factType>（38 家族 4 表 + 38 入口内联合成）；stubKeys：`() => null` 显式空转条目；
// specs：FACT_SPECS（58）。双向 + 恒空三判据。
export function checkTranslators(specs, translators, stubKeys) {
    const problems = [];
    const specKeys = Object.keys(specs || {});
    const trKeys = [...(translators || [])];
    if (specKeys.length === 0) problems.push('FACT_SPECS 解析出 0 条（58 契约读取失效，检查空跑=假绿）');
    if (trKeys.length === 0) problems.push('FACT_TRANSLATORS 合成出 0 条（38 翻译表读取失效，检查空跑=假绿）');
    if (problems.length) return { problems, stats: { specs: specKeys.length, translators: trKeys.length } };

    const stubs = stubKeys || new Set();
    for (const k of specKeys) {
        const spec = specs[k] || {};
        if (spec.translateFn && !translators.has(k)) {
            problems.push(`方向A 缺翻译器：58 登记 translateFn=${spec.translateFn} 但 38 表内无 ${k} 条目（静默丢动作）`);
        }
        if (spec.translateFn && stubs.has(k)) {
            problems.push(`方向C 恒空：58 登记 translateFn=${spec.translateFn} 但 38 表内 ${k} 是 () => null 恒空条目（登记说产、表里不产）`);
        }
    }
    for (const k of trKeys) {
        if (stubs.has(k)) continue; // 显式空转 = 「不产生 stageAction」，与 translateFn:null 合法共存
        const spec = specs[k];
        if (!spec) {
            problems.push(`方向B 契约缺失：38 表内有产动作翻译器 ${k}，但 58 FACT_SPECS 无该 spec`);
        } else if (!spec.translateFn) {
            problems.push(`方向B 漏登记：38 表内有产动作翻译器 ${k}，但 58 translateFn=null（契约谎称「不产生 stageAction」）`);
        }
    }
    return { problems, stats: { specs: specKeys.length, translators: trKeys.length, stubs: stubs.size } };
}

// ---- 组装：读真源码/真表，跑两项检查 ----
async function main() {
    // 环境垫片必须先于引擎 import（同 tests/translate-golden.mjs 口径）
    globalThis.fetch = async (url) => {
        const text = readFileSync(fileURLToPath(new URL(url)), 'utf8');
        return { ok: true, json: async () => JSON.parse(text) };
    };
    globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    globalThis.window = globalThis;
    globalThis.self = globalThis;

    const [{ STAGE_ACTION_DEFS }, { FACT_SPECS }, { FACT_TYPES }, { ATTACK_TRANSLATORS },
        { HEAL_TRANSLATORS }, { CONTROL_TRANSLATORS }, { STAT_TRANSLATORS }] = await Promise.all([
            import('../render/39-actions-defs.js'),
            import('../infra/58-fact-contract.js'),
            import('../infra/56-battle-enums.js'),
            import('../render/38-actions-translate-attack.js'),
            import('../render/38-actions-translate-heal.js'),
            import('../render/38-actions-translate-control.js'),
            import('../render/38-actions-translate-stat.js')
        ]);

    console.log('=== 静态一致性契约网（静态检查，非运行时体检）===');

    // ① 门槛一致性
    const p42 = read('../player/42player-core.js');
    const gateSrc = extractFunctionSource(p42, 'hasStageWork');
    const r1 = checkGate(STAGE_ACTION_DEFS, gateSrc);
    console.log(`[门槛一致性] STAGE_ACTION_DEFS ${r1.stats.defs} 条 · hasStageWork ${gateSrc ? '源码抽取成功' : '抽取失败'}`
        + (r1.stats.workDefs !== undefined ? ` · 带活定义 ${r1.stats.workDefs} 条（其中纯 store 无 fx ${r1.stats.storeOnly} 条）/ 全空定义 ${r1.stats.emptyDefs} 条` : ''));
    for (const p of r1.problems) console.log('  ✗ ' + p);

    // ② 翻译器契约
    const translators = new Set([...Object.keys(ATTACK_TRANSLATORS), ...Object.keys(HEAL_TRANSLATORS),
        ...Object.keys(CONTROL_TRANSLATORS), ...Object.keys(STAT_TRANSLATORS)]);
    const famSrc = ['38-actions-translate-attack', '38-actions-translate-heal',
        '38-actions-translate-control', '38-actions-translate-stat', '38-actions-translate']
        .map(f => read('../render/' + f + '.js')).join('\n');
    // 38 入口的回合族三条是内联 [FACT_TYPES.X]: 键，文本提取补进合成表；恒空条目同源识别
    const stubKeys = new Set();
    for (const m of famSrc.matchAll(/\[FACT_TYPES\.(\w+)\]:\s*\(\s*\)\s*=>\s*null/g)) {
        stubKeys.add(FACT_TYPES[m[1]]);
    }
    for (const m of read('../render/38-actions-translate.js').matchAll(/\[FACT_TYPES\.(\w+)\]:/g)) {
        translators.add(FACT_TYPES[m[1]]);
    }
    const r2 = checkTranslators(FACT_SPECS, translators, stubKeys);
    console.log(`[翻译器契约] 58 FACT_SPECS ${r2.stats.specs} 条 · 38 翻译表合成 ${r2.stats.translators} 条`
        + (r2.stats.stubs !== undefined ? `（含 () => null 显式空转 ${r2.stats.stubs} 条）` : ''));
    for (const p of r2.problems) console.log('  ✗ ' + p);

    const problems = r1.problems.length + r2.problems.length;
    if (problems) {
        console.log(`RESULT: 静态一致性检查失败 ❌ 共 ${problems} 条（门槛 ${r1.problems.length} / 翻译器 ${r2.problems.length}）`);
        return 1;
    }
    console.log('RESULT: 静态一致性检查通过 ✅ 门槛一致性 + 翻译器契约均一致');
    return 0;
}

// CLI 入口守卫：被 import（牙齿探针复用 checkGate/checkTranslators 纯函数）时只导出不执行
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.exit(await main());
}
