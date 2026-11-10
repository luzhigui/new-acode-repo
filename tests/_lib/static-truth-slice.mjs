// tests/_lib/static-truth-slice.mjs | V1.1.0 | 2026-10-28 夜间第 146 轮：新增第五样东西
//   ⑤ auditAnchorSites —— 给「在源文件里正则抠锚点」这一类取样做同一个体检：
//      这个锚点到底落在真代码里，还是只活在注释里？
//      背景（本轮第三/第四个受体的发现点）：param-read-guard 报「命中 getSkillParams 的文件 N 个」，
//      这个 N 是用 `code.replace(/\/\/.*$/gm,'')` 算的 —— 一条只认行注释、不认块注释、也不认字符串
//      里 // 的野路子。它与同文件真正做抽取的 maskLiterals 是**两套口径**：同一个文件，可能被算进
//      「命中」却在抽取侧一个读取点都提取不出来。
//      ★ 这正是第 144 轮那条病换了个皮：不是"文本切片混进別的枚举"，而是
//        "报告口径掺进了注释这种第二种写法"。本轮牙B2 已实证：给一个无关文件加一行块注释，
//        旧口径立刻从 21 虚高到 22，而没人能从报告里看出那一处是假的。
//
// 为什么要抽（第 144 轮自己点名的下轮优先，本轮兑现）：
//   第 144 轮在 fact-coverage-selftest 里抓到：它号称取的是 infra/56 的 FACT_TYPES，
//   实际用 `src.slice(src.indexOf('FACT_TYPES'), src.indexOf('MECHANIC_TYPES'))` 切——
//   这两个标识之间隔着 BUFF_TYPES / STAGE_ACTION_TYPES / BUFF_EFFECT_TYPES / FLY_MODE_TYPES
//   四个别的枚举，于是 145 条里有 54 条是外来的，其中 16 条还与 FACT_TYPES 同名 ⇒ 同一条被计两次。
//   结论：长期被引用的「悬空引用 7 类」里只有 1 类是真的。
//   ★ 同一款病在别处也在（本轮第二个受体 fact-dead-field-scan 已实证）：凡**用两段锚点切文本**
//     或**用一条平铺正则扫全文件**去取"某个枚举的真值面"的自检，都活得在"下一个同名枚举出现"
//     的风险里。三处各写一份就是三份口径，将来改一处忘两处 = 新分叉。故抽成唯一来源，
//     判据一字不改，只换存放位置（行为等价性由本轮的验牙反证）。
//
// 本件提供的四样东西：
//   ① stripComments / codeMask    —— 把注释从"写法=证据"的取样面里剔出去（保字符串与模板串不被误删）；
//   ② parseEnumBlocks             —— **按所有权**解析 `export const X = Object.freeze({...})` 块；
//   ③ attributeSlice / auditSlice —— 给"文本切片"做体检：构成归属、外来者、同名重复、与真值口径的差集、独立第三路径；
//   ④ auditValueMap               —— 给"值→常量名"平铺映射做体检：跨枚举值冲突、外来条目、所有权真值表。
//
// 用法：
//   const blocks = parseEnumBlocks(src);
//   const a = auditSlice({ src, from: 'FACT_TYPES', to: 'MECHANIC_TYPES', owner: 'FACT_TYPES', truthKeys: Object.keys(FACT_TYPES) });
//   const v = auditValueMap(blocks, 'FACT_TYPES');
//   for (const bad of selfCheck()) fails.push('静态真值口径公共件自证：' + bad);
// V1.3.0 | 2026-10-29 夜间第 152 轮：★ 收口判据**真正落盘**（isClosedOnTruth + RE_IMPORT_TRUTH）
//   —— 第 151 轮在日志里写下"判据收紧为只认 import 语句"，但收紧**没进提交**：本轮开场
//     git show d1dd14a0 复核，RE_IMPORT_TRUTH 只存在于日志散文，代码里仍是第一版宽口径
//     /static-truth-slice/.test(src)（它自己诊断出的"形同虚设"那一版）。
//     本轮开场牙A 复现：删掉受体A 的真 import、只在注释里留公共件路径 ⇒ 普查仍报
//     "已收口 2 条 / PASS"，机制确实一路漏着。收紧后同一口牙报 4 项。
//   ★ 判据 = 在**剥掉注释之后的源码**里存在 import ... from '...static-truth-slice...' 语句。
//     两个条件各咬一款病：① 必须是 import 语句（不能只是"文件里出现过这个字样"）；
//     ② 必须在剥注释之后匹配（否则注释里抄一句完整 import 照样骗过去）。
//   ★ 并给判据本身加了自证⑯⑰⑱ —— 因为这一款的病不是"没想收紧"，而是"以为收紧了"：
//     把口径钉进自证，谁把它退回宽口径，自证立刻报。
// V1.2.0 | 2026-10-28 夜间第 151 轮：新增 ⑥ stripCommentsMapped / auditStripCopies
//   —— 收「手写第二份去注释」这一款病（本仓库第四次发作）：
//     tests 下曾同时存在三份各写一遍的剥注释实现（_lib/rule-branch-extract 的
//     stripCommentsKeepStrings、rule-binding-drift-selftest 的 stripComments（带行号映射）、
//     123static-scan.js 的 stripComments）。三份口径互不相同：
//       · rule-branch-extract 那份会把**多行块注释连同换行一起吃掉**（行结构塌陷）；
//       · 只有 rule-binding-drift 那份识别**正则字面量**（公共件 stripComments 的已知边界）。
//     ⇒ 一处收紧、另一处没跟，就是"同一份源码在两个自检里取样面不同"的幽灵事件，
//       而两边都报绿，谁也看不出来。本轮把带映射+正则感知那一版上提为公共件唯一来源，
//       两个 .mjs 受体改为复用；123static-scan.js 因被浏览器页面直接 import（121health-monitor
//       跑在页面里），改 import 会影响线上页面，故**点名挂账待拍板**，不擅自收口。
//   ★ 为什么不动 stripComments 让它也带正则感知：那会一次性改变 5 个既有受体的取样面，
//     属"顺手改判据"。本轮只做收口，stripComments 一字未动（差异已实测并点名，见 audit 输出）。
//
// 本件提供的五样东西：
//   ① stripComments / codeMask    —— 把注释从"写法=证据"的取样面里剔出去（保字符串与模板串不被误删）；
//   ② parseEnumBlocks             —— **按所有权**解析 `export const X = Object.freeze({...})` 块；
//   ③ attributeSlice / auditSlice —— 给"文本切片"做体检：构成归属、外来者、同名重复、与真值口径的差集、独立第三路径；
//   ④ auditValueMap               —— 给"值→常量名"平铺映射做体检：跨枚举值冲突、外来条目、所有权真值表；
//   ⑤ auditAnchorSites            —— 锚点落在真代码里还是只活在注释里；
//   ⑥ stripCommentsMapped / auditStripCopies —— 带行号映射的剥注释（含正则字面量感知）+「第二份快照」点名与棘轮。
// V1.4.0 | 2026-10-31 夜间第 162 轮：⑲ 跨文件重复函数自证**由单向改双向**。
//   老写法只盯「该点出的没点出 ⇒ 检测失灵」一个方向，本轮实测就栽在这上面：collectFacts 的第二份
//   （tests/121health-monitor.js）被上游清掉、重复真消失了，老写法仍报「检测失灵」—— 拿一条已经
//   不成立的前提当铁证，红得没有真因（与"地基缺失被读成代码退步"同一款病）。改为双向：仍在册的
//   必须被点出；已核销的必须不被点出（又被点出 ⇒ 重复回归或当初核销是误判）。核销须写明理由与轮次。
// V1.4.1 | 2026-10-31 第 165 轮(续)：⑲ 探针 readIfAbs 由 expect:true 翻为 expect:false —— 本轮把
//   contract-binding-drift / rule-binding-drift 两处内联 readIfAbs 收口为 tests/_lib/read-if-abs.mjs
//   唯一来源（消除 second-source-scan 棘轮越界），重复真消失，故翻面守卫：今后 tests 下若再冒出
//   第二份同体 readIfAbs 即判回归（与 collectFacts 同款双向核销）。
// V1.5.0 | 2026-11-01 夜间第 171 轮：DUP_WITNESS 增两条「已核销」登记（hasActiveBuff / permHas）
//   —— 第 171 轮把这两个函数收口为 tests/_lib/buff-state-query.mjs 唯一来源，两个 case 文件的
//      内联副本真消失 ⇒ 登记为 expect:false：今后 tests 下若再冒出第二份同体实现即判回归
//      （与第 165 轮 readIfAbs 同一写法）。★ 只增凭证、不动判据：DUP_FN_RATCHET 仍为 4 未抬。
// V1.6.0 | 2026-11-01 夜间第 172 轮：DUP_WITNESS 增三条「已核销」登记（normalizeForces / resetForces /
//   forcesOfEntry）—— 第 172 轮把这三件套收口为 tests/_lib/forced-case-normalize.mjs 唯一来源，
//   fact-emission-census / stat-decl-vs-actual-check / rules-replay 三处内联副本真消失 ⇒ expect:false。
//   ★ 与第 171 轮 hasActiveBuff 同一写法：只增凭证、不动判据，DUP_FN_RATCHET 仍为 4 未抬。
// V1.7.0 | 2026-11-01 夜间第 172 轮(吸收后)：⑲ DUP_WITNESS 自证下界从「identical ≥ 2」收到「≥ 1」。
//   原下界是 nightly 收口前的旧假设（hasActiveBuff/permHas/normalizeForces 等还在册，真实 identical ≥2 组）；
//   171/172 收口核销后 tests 下逐字相同副本只剩 fail×3 一组，硬 ≥2 假红。新下界与「仍在册 expect:true
//   的逐字重复组数」对齐：至少点出 1 组证明检测器没失灵，0 组才判覆盖面塌（届时须把 fail 也翻 expect:false）。
// V2.0.0 | 2026-11-09 迭代：新增 stripCommentsPreserving（保长度剥注释，供按字符索引定位的
//   调用方使用），把 hook-order-check / rng-discipline-check 两份手写实现真收口到公共件。
//   ★ 不是加一行 import 洗红：两个脚本的本地函数已删除，改前改后输出逐字一致另存证据。
//   公共件自证新增 ㉒ 五条（长度/换行/注释覆盖/真代码保留 + 删除式不等长的反向证明）。
// V1.9.0 | 2026-11-09 合入夜间 195–199 后：修 DUP_WITNESS 里 parentDmgOf 的过期证人（第二份早已不在盘，
//   全 tests 仅 1 处定义，却还被当成「必须点出两处」的铁证，误报成「检测失灵」——第 162 轮 collectFacts
//   同款病第二次复发）；新增 ㉑ 证人保鲜断言 + 两条纯内存正负路径自证，用定义数把「证人过期」
//   与「检测器失灵」分开，不再诱使后人去改本来没坏的检测器。未动 auditDupFnNames 一行判据。
// V1.8.0 | 2026-11-01 夜间第 173 轮：新增第三条线索 auditSharedLiteralSets（补第 172 轮点名的结构性盲区）。
//   ★ 病根：原两把尺子是「同名 ∪ 同体」，盖不住「换个名字重写一遍」—— 第 172 轮第三份强制开关白名单
//     叫 forcesOfEntry、用 indexOf 不用 includes，两把尺子同时漏掉它，最后是人工翻出来的。本条换尺子：
//     看**元素取值**（共享 ≥2 且重叠度 ≥50% 即进网），与名字、写法都无关。只点名不收口（改覆盖面＝改行为，
//     须拍板）。自证 ㉑ 双向必查：已知仍在册的 MAIN_DIRS ⇄ SCAN_DIRS 这一对必须被点出（缺 ⇒ 检测器失灵）。
// V2.1.0 | 2026-11-10 夜间第 201 轮：㉑ 的反向闸门从「全等**对数** > 12」改成「全等**族数** > 12」，
//   另加一道「单族最多抄几份 > 8」。病根是纯笛卡尔积：7 个主代码目录的清单在 6 个文件里各抄一遍，
//   两两配对就是 C(6,2)=15 对，主代码一个字没多却把闸门刷爆、每轮都报红。族数按取值集合签名去重，
//   抄 6 遍仍是 1 族 ⇒ 才真正对应「检测器是否退化成什么都算重复」。
//   ★ LITERAL_MIN_SHARED / LITERAL_MIN_JACCARD 一字未动（判"是否重复"的口径不变），12 这个上限值也原样沿用，
//     只换计数对象。新增 renamedFamilies 只在返回值里追加，不动原有 renamed / divergent 语义。
// V2.2.0 | 2026-11-10 夜间第 202 轮：「一事一源」收口第一批。第 201 轮把 27 对收敛成 8 族后，族清单本身
//   就是欠账单，本轮按「先收最大的两个」口径收掉族 #1 与族 #2：
//   ① mainSourceDirs —— 7 个主代码目录的清单原本 5 份，全部裸数组零语义、纯手抄。四份可收口的
//      （contract-binding-drift-selftest / entry-path-guard / hp-death-exit-guard / structural-dead-branch-scan）
//      改成从本件 import；第五份 123static-scan.js 是浏览器双用模块（121health-monitor.js 在页面里 import 它），
//      动它就牵动线上页面加载路径，**故不动**，已在 STRIP_COPY_ALLOWLIST 同口径下点名挂账。
//      收口后本数组的**元素顺序不可再随意改**：原先五份顺序各不相同（fx 有的在首有的在尾），
//      只靠「集合相同」不报红；现在只剩一份真源，顺序即全局顺序。这不影响任何扫描结果（全是 for-of 遍历），
//      但注释在这里写死一句，免得后人以为顺序无关又去重排。
//   ② FACT_TYPE_MISS —— attack/dodge/immune/miss 这张 fact 类型表原本 4 份（182/183/184/188 四条规则各写一遍），
//      全部改为 import；名字保留各自语义（TARGET_/TURN_/HIT_/SEG_FACT_TYPES 仍是本文件里的导出名），
//      只把取值来源统一到一处。
//   ★ 判据一字未动：LITERAL_MIN_SHARED / LITERAL_MIN_JACCARD / 族数上限 12 / 单族上限 8 全部原样。
// V2.3.0 | 2026-11-10 夜间第 203 轮：「一事一源」收口第二批，族 #1（STATS，原本最大族 4 份）。
//   ③ STAT_MOD_KEYS —— atk/def/maxHp 这张属性键清单，237/242/mod-source-closure 三处各写一遍
//      `const STATS = ['atk','def','maxHp']`（第四处 271 是函数体内的 `var stats = [...]`，不是模块级常量声明，
//      不在 auditSharedLiteralSets 的取样面内，本轮**不动它**，单列为本轮记录的边界，见日志）。
//      三处改为 import STAT_MOD_KEYS，各自保留原局部名 STATS（导出名/调用处一字未改）。
//   ★ 判据一字未动：LITERAL_MIN_SHARED / LITERAL_MIN_JACCARD / 族数上限 12 / 单族上限 8 全部原样。
// V2.4.0 | 2026-11-10 白天合入夜间 200–203 后：给第 201 轮新换的「族数 / 单族份数」两道闸门补负路径自证。
//   夜间只改了计数口径（全等对数 → 族数）却没证明新口径还能咬住真泛滥，等于无法排除「把红洗掉」。
//   本轮抽出唯一判定函数 auditFamilyGate，真实扫描与自证共用；4 条纯内存正负路径
//   （13 族 / 一族 9 份 / 12 族各 8 份边界 / 空集合）。阈值 12 与 8、LITERAL_MIN_* 一字未动。
export const VER = 'tests/_lib/static-truth-slice.mjs V2.4.0';

// ---------------------------------------------------------------------------
// ⓪ 主代码目录清单（唯一来源，2026-11-10 第 202 轮收口）
//   ★ 只放「扫哪些主代码目录」这件事，不含任何扫描口径。要挪目录名来这里改一次，五处调用自动跟随。
// ---------------------------------------------------------------------------
export const mainSourceDirs = Object.freeze(['core', 'infra', 'modules', 'player', 'render', 'ui', 'fx']);

// ---------------------------------------------------------------------------
// ⓪ fact 类型表（唯一来源，2026-11-10 第 202 轮收口）
//   182/183/184/188 四条规则原先各抄一份同样的 attack/dodge/immune/miss。
// ---------------------------------------------------------------------------
export const FACT_TYPE_MISS = Object.freeze(['attack', 'dodge', 'immune', 'miss']);

// ---------------------------------------------------------------------------
// ⓪ 属性键清单（唯一来源，2026-11-10 第 203 轮收口）
//   237 / 242 / mod-source-closure 三处原先各抄一份同样的 atk/def/maxHp。
//   ★ 顺序即 getStat(setStat) 遍历属性时的全局顺序，收口后不可再随意重排。
// ---------------------------------------------------------------------------
export const STAT_MOD_KEYS = Object.freeze(['atk', 'def', 'maxHp']);

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// ① 注释清除：把注释原文清掉，但**保住字符串 / 模板串里长得像注释的东西**。
//    为什么必须自己写而不是去找已有实现：123static-scan 里有一份同类函数，但它是浏览器模块的一部分，
//    tests 侧暂无可复用的导出。更重要的是本件要能自证，故连同自证件一起放进同一个文件。
//    ★ 已知边界：正则字面量里的 // 或 /* 会被误判成注释起点（本仓自检消费的源码里尚无此写法；
//      真出现时表现为"某行被整行判成注释"，属**少收**而非**错判**，且只影响"干净口径"这一路对照，
//      不影响任何既有原口径结论）。
// ---------------------------------------------------------------------------
export function stripComments(code) {
    const out = [];
    let mode = 'code'; // code | line | block | sq | dq | tpl
    for (let i = 0; i < code.length; i++) {
        const c = code[i], d = code[i + 1];
        if (mode === 'code') {
            if (c === '/' && d === '/') { mode = 'line'; i++; continue; }
            if (c === '/' && d === '*') { mode = 'block'; i++; out.push(' '); continue; }
            if (c === "'") { mode = 'sq'; out.push(c); continue; }
            if (c === '"') { mode = 'dq'; out.push(c); continue; }
            if (c === '`') { mode = 'tpl'; out.push(c); continue; }
            out.push(c); continue;
        }
        if (mode === 'line') {
            if (c === '\n') { mode = 'code'; out.push(c); }
            continue;
        }
        if (mode === 'block') {
            if (c === '*' && d === '/') { mode = 'code'; i++; out.push(' '); continue; }
            if (c === '\n') out.push(c);
            continue;
        }
        out.push(c);
        if (c === '\\') { if (i + 1 < code.length) { out.push(code[i + 1]); i++; } continue; }
        if (mode === 'sq' && c === "'") { mode = 'code'; continue; }
        if (mode === 'dq' && c === '"') { mode = 'code'; continue; }
        if (mode === 'tpl' && c === '`') { mode = 'code'; continue; }
    }
    return out.join('');
}

// 逐行标注：'code' = 该行有非空白的真代码；'comment' = 该行除注释外无代码。
//   用途：不必在"要不要整篇 stripComments"上赌——整篇 strip 会改动列偏移与行结构，
//   而取回原文件里的"证据片段"需要**行号对齐**，故这里只按行打标签，由调用方决定要不要跳过注释行。
export function codeMask(code) {
    const lines = code.split('\n');
    const marks = new Array(lines.length).fill('comment');
    let mode = 'code';
    let li = 0;
    const note = (t) => { if (marks[li] === 'comment' || t === 'code') marks[li] = t; };
    for (let i = 0; i < code.length; i++) {
        const c = code[i], d = code[i + 1];
        if (c === '\n') { li++; if (mode === 'line') mode = 'code'; continue; }
        if (mode === 'code') {
            if (c === '/' && d === '/') { mode = 'line'; i++; continue; }
            if (c === '/' && d === '*') { mode = 'block'; i++; continue; }
            if (c === "'") { mode = 'sq'; note('code'); continue; }
            if (c === '"') { mode = 'dq'; note('code'); continue; }
            if (c === '`') { mode = 'tpl'; note('code'); continue; }
            if (c.trim() !== '') note('code');
            continue;
        }
        if (mode === 'line') { continue; }
        if (mode === 'block') { if (c === '*' && d === '/') { mode = 'code'; i++; } continue; }
        if (c === '\\') { i++; continue; }
        if (mode === 'sq' && c === "'") mode = 'code';
        if (mode === 'dq' && c === '"') mode = 'code';
        if (mode === 'tpl' && c === '`') mode = 'code';
    }
    // 单 '\n' 分支里 mode 重置发生在下一次循环，这里补齐最后一行的边界
    return marks;
}

// ---------------------------------------------------------------------------
// ⑥-a 带映射的剥注释（唯一来源）：与 stripComments 只差两点
//   ① 返回 { code, owner, lineOf }：调用方要按**原文行号**回指（报错行号、抽取行上下文窗口靠它）；
//   ② 额外识别**正则字面量**，避免把正则里的 // 或 /* 当注释起点（stripComments 的已知边界）。
//   ★ 来源 = tests/rule-binding-drift-selftest.mjs 那份手写实现，本轮原样上提、行为一字不变；
//     该文件改为 import 本函数，手写第二份随之消失（由 auditStripCopies 守着不许再长回来）。
//   ★ 保行结构：块注释里的换行**逐个保留**（out 里按原下标 push '\n'），
//     这与 rule-branch-extract 旧手写版"连换行一起吃掉"不同 —— 那版会让多行块注释之后
//     的行号整体塌陷一截，抽取侧按行号回指时就会指错行。
/**
 * 保长度剥注释（2026-11-09：第 151 轮「第二份快照」收口剩下的最后一块）。
 *
 * 与 stripComments / stripCommentsMapped 的区别：那两个是**删除式**（输出比输入短），
 * 本函数是**替换式**——把注释字符逐个换成空格、换行原样留着，输出长度与输入严格相等。
 * 为什么必须留这第二种口径：hook-order-check.mjs 的 matchParen 靠字符下标在剥注释后的
 * 源码里定位括号区间，删除式会让下标整体左移 ⇒ 直接换过去等于改坏它的取样面。
 *   ⇒ 之前那两份手写实现不全是「抄了一份」，其中一份是**不同语义**，硬收口才会坏事；
 *     正解是把这个口径也做成公共能力，让调用方真删本地实现、改 import。
 *
 * ★ 实现逐字照搬 tests/hook-order-check.mjs 收口前的手写版，纯搬迁零行为变化。
 *   已知边界（原实现就有）：正则式会误判字符串/正则字面量里的 `//`，属少收方向；
 *   调用方扫的是 registerSettlementHook( 注册点，实测全仓输出一致。想修这个边界
 *   要换 stripCommentsMapped，但那会改变长度语义，须另行拍板，不在本轮范围内。
 *
 * ★ auditStripCopies 的「已收口」判据只看有没有 import 本公共件 —— 因此调用方必须
 *   **真的删掉本地实现**，光补一行 import 洗红是自欺欺人（第 149 轮同款病）。
 */
export function stripCommentsPreserving(src) {
    return String(src)
        .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
        .replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length));
}

export function stripCommentsMapped(src) {
    let out = '';
    const owner = [];
    let i = 0; const n = src.length;
    let state = 'code'; let prevSig = '';
    const push = (ch, idx) => { out += ch; owner.push(idx); };
    while (i < n) {
        const c = src[i], d = src[i + 1];
        if (state === 'code') {
            if (c === '/' && d === '/') { state = 'line'; i += 2; continue; }
            if (c === '/' && d === '*') { state = 'block'; i += 2; continue; }
            if (c === "'" || c === '"' || c === '`') {
                const q = c; push(c, i); i++;
                while (i < n) {
                    const ch = src[i];
                    if (ch === '\\') { push(ch, i); if (i + 1 < n) push(src[i + 1], i + 1); i += 2; continue; }
                    push(ch, i); i++;
                    if (ch === q) break;
                }
                prevSig = ')';
                continue;
            }
            if (c === '/' && '(,=:[!&|?{;'.includes(prevSig)) {
                let j = i + 1; let inClass = false;
                while (j < n) {
                    const ch = src[j];
                    if (ch === '\\') { j += 2; continue; }
                    if (ch === '[') inClass = true;
                    else if (ch === ']') inClass = false;
                    else if (ch === '/' && !inClass) break;
                    else if (ch === '\n') break;
                    j++;
                }
                for (let k = i; k <= j && k < n; k++) push(src[k], k);
                i = j + 1; prevSig = ')';
                continue;
            }
            push(c, i); i++;
            if (!' \t\r\n'.includes(c)) prevSig = c;
            continue;
        }
        if (state === 'line') { if (c === '\n') { state = 'code'; push('\n', i); } i++; continue; }
        if (c === '*' && d === '/') { state = 'code'; i += 2; continue; }
        if (c === '\n') push('\n', i);
        i++;
    }
    const lineStart = [0];
    for (let k = 0; k < src.length; k++) if (src[k] === '\n') lineStart.push(k + 1);
    const lineOf = (idx) => {
        let lo = 0, hi = lineStart.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStart[mid] <= idx) lo = mid; else hi = mid - 1; }
        return lo + 1;
    };
    return { code: out, owner, lineOf };
}

// ---------------------------------------------------------------------------
// ⑥-b 「第二份快照」点名与棘轮：把"以后还会不会再写一份"这件事关掉
//   规则（机械可验，不靠自觉）：
//     扫 tests/ 下所有 .js/.mjs，找**剥注释/串掩码类的本地函数定义**（按函数名匹配）；
//     · 命中文件 == 本公共件 ⇒ 唯一来源本身，不计；
//     · 命中文件 import 了本公共件 ⇒ 视为已收口（转发/复用），计入"已收口"；
//     · 其余 ⇒ **第二份快照（未收口）**，逐条点名；条数受棘轮上限约束，新增即报。
//   ★ 与第 150 轮同一句话：机制负责关掉污染，点名负责把关掉了什么（以及还剩什么）打印出来 ——
//     否则哪天又抄一份，报告依旧绿，那就是静默复发。
// ---------------------------------------------------------------------------
const RE_STRIP_DEF = /^\s*(?:export\s+)?(?:async\s+)?function\s+(stripComments\w*|stripComment\w*|maskStrings\w*)\s*\(/gm;

// ---------------------------------------------------------------------------
// ⑥-c 「已收口」判据（★ 第 152 轮收紧；第 151 轮**声称**已收紧、代码里却没落盘，见下）
//   判据 = 在**剥掉注释之后的源码**里，存在 import ... from '...static-truth-slice...' 语句。
//   两个条件缺一不可，各咬一款病：
//     ① 必须是 import 语句，不能只是"文件里出现过这个字样"
//        —— 否则注释里提一句公共件路径就被判成"已收口"（第 151 轮牙A 实证，本轮复现）；
//     ② 必须在**剥注释之后**匹配
//        —— 否则注释里抄一句完整 import 照样被判成"已收口"（同款病的变体）。
//   ★ 这正是本件自己的老本行：第 149 轮立的规矩就是"注释里的东西不算真值"，
//     而 auditStripCopies 第一版偏偏没给自己用上 —— 机制自己踩了机制要防的那款病。
//   ★ 已知边界：剥注释用的是 stripCommentsMapped（带正则感知，公共件内的唯一来源）。
//     若某文件的正则里含 // 且其后真 import 被误判进注释，本判据会判成"未收口"
//     —— **少收不是错收**：表现为该收口的没计入 closed，属安全方向；
//     绝不会把未收口误判成已收口（后者才是机制失效）。
// ---------------------------------------------------------------------------
const RE_IMPORT_TRUTH = /(?:^|\n)[ \t]*import\s[\s\S]{0,300}?\bfrom\s*['"][^'"]*static-truth-slice[^'"]*['"]/;
/** 是否已在剥注释后的源码里 import 了本公共件（收口判据的唯一来源，改这里要同步改自证⑯⑰⑱） */
export function isClosedOnTruth(src) {
    return RE_IMPORT_TRUTH.test(stripCommentsMapped(src).code);
}

/** 已收口/豁免登记表（唯一来源）：改这里必须写 why，且条数只减不增 */
export const STRIP_COPY_ALLOWLIST = [
    { file: '123static-scan.js', why: '浏览器双用：tests/121health-monitor.js 在页面里 import 它，改成 import 本公共件会牵动线上页面加载路径，故点名挂账待拍板（第 151 轮）' }
];
/** 未收口条数棘轮上限（只降不抬；要抬须拍板并写明理由） */
export const STRIP_COPY_RATCHET = 1;

export function auditStripCopies(dir) {
    const self = path.basename(fileURLToPath(import.meta.url));
    const names = fs.readdirSync(dir).filter(f => f.endsWith('.js') || f.endsWith('.mjs'));
    const closed = [], open = [];
    for (const f of names) {
        const src = fs.readFileSync(path.join(dir, f), 'utf8');
        const hits = [...src.matchAll(RE_STRIP_DEF)].map(m => m[1]);
        if (hits.length === 0) continue;
        const rec = { file: f, fns: hits };
        if (f === self) continue;
        if (isClosedOnTruth(src)) { closed.push(rec); continue; }
        open.push(rec);
    }
    for (const d of [dir + '/_lib', dir + '/health-rules']) {
        if (!fs.existsSync(d)) continue;
        for (const f of fs.readdirSync(d).filter(x => x.endsWith('.js') || x.endsWith('.mjs'))) {
            const src = fs.readFileSync(path.join(d, f), 'utf8');
            const hits = [...src.matchAll(RE_STRIP_DEF)].map(m => m[1]);
            if (hits.length === 0) continue;
            const rel = path.basename(d) + '/' + f;
            if (rel === '_lib/' + self) continue;
            const rec = { file: rel, fns: hits };
            if (isClosedOnTruth(src)) closed.push(rec); else open.push(rec);
        }
    }
    const allow = new Set(STRIP_COPY_ALLOWLIST.map(a => a.file));
    const unnamed = open.filter(o => !allow.has(o.file));
    const fails = [];
    if (unnamed.length > 0) {
        for (const o of unnamed) fails.push('发现未登记的第二份剥注释实现：' + o.file + '（' + o.fns.join('/') + '）—— 请改为复用本公共件，或登记进 STRIP_COPY_ALLOWLIST 并写 why');
    }
    if (open.length > STRIP_COPY_RATCHET) {
        fails.push('第二份剥注释实现 ' + open.length + ' 条 > 棘轮上限 ' + STRIP_COPY_RATCHET + '（只降不抬；要抬须拍板）');
    }
    return { closed, open, allowlisted: open.filter(o => allow.has(o.file)), fails };
}

// ---------------------------------------------------------------------------
// ⑦ 跨文件同名 / 逐字重复函数点名（第 152 轮新增）
//   第 151 轮只盯"剥注释"一款。本轮把"第二份"的检测**扩面**到机械可验的一般形态：
//   同一函数名在 ≥2 个文件里各定义一遍。★ 分两桶，判据不同、处置不同：
//     · identical     —— 函数体**逐字相同** ⇒ 铁证如山的第二份，须收口；
//     · sameNameOnly  —— 同名但函数体不同 ⇒ 只点名、待人工判定。★ 后者比前者更值得看：
//       "抄了一份又改了一点"，改的那一点就是**口径分叉**本身（一处收紧另一处没跟，
//       两个自检都报绿，谁也看不出来 —— 第 133 轮立的原话）。
//   ★ 排除名单里的不是"豁免第二份"，而是"本来就该各写一份"：
//     main 是每个可执行脚本的入口；selfCheck / runSelfChecks 是各件自证 ——
//     第 143 轮立的设计原则就是"一处坏多处喊"，刻意各写一份，收口反而违背设计。
//   ★ 边界：extractFnSource 按花括号配对切函数体，不解析字符串/正则里的花括号。
//     命中时会取到**偏大**的一段（多取不会误判成"不同"，只会让 identical 变难命中，
//     属安全方向）；取不到时该处记为 null，按"无法判定"处理，不进 identical。
// ---------------------------------------------------------------------------
export const DUP_FN_ALLOWLIST = [
    { name: 'main', why: '每个可执行脚本的入口函数，属命名约定而非重复实现（实测 22 处）' },
    { name: 'selfCheck', why: '各件自证入口 —— 第 143 轮立的设计原则是「一处坏多处喊」，刻意各写一份，收口反而违背设计（3 处）' },
    { name: 'runSelfChecks', why: 'selfCheck 的实现体，同上（3 处）' },
];
/**
 * 逐字重复条数棘轮上限（只降不抬；要抬须拍板并写明理由）。
 * ★ 4 = 第 152 轮**首次点名**的实测基线（fail×3 / collectFacts×2 / parentDmgOf×2 / readIfAbs×2）。
 *   与第 151 轮同一取舍：**先点名、再谈收口** —— 首次普查不追求"一上来就红"，
 *   先把"还剩什么"如实打印出来，收口一条棘轮就降一格。本轮一条没收（其中 fail /
 *   parentDmgOf 两组落在 health-rules 规则文件里，收口须拍板），如实挂账。
 */
export const DUP_FN_RATCHET = 4;
const RE_FN_DEF = /^[ \t]*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm;

/** 从 `function name(` 的定义起点切出整个函数体（花括号配对；取不到返回 null） */
function extractFnSource(src, idx) {
    const open = src.indexOf('{', idx);
    if (open === -1) return null;
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(idx, i + 1).replace(/\s+$/, ''); }
    }
    return null;
}

export function auditDupFnNames(dir) {
    const dirs = [dir, dir + '/_lib', dir + '/health-rules'];
    const groups = new Map();
    for (const d of dirs) {
        if (!fs.existsSync(d)) continue;
        for (const f of fs.readdirSync(d).filter(x => x.endsWith('.js') || x.endsWith('.mjs'))) {
            const rel = (d === dir ? '' : path.basename(d) + '/') + f;
            const src = fs.readFileSync(path.join(d, f), 'utf8');
            const seen = new Set();
            for (const m of src.matchAll(RE_FN_DEF)) {
                const name = m[1];
                if (seen.has(name)) continue; // 同文件内重名只取第一处，避免把重载误算成"第二份"
                seen.add(name);
                if (!groups.has(name)) groups.set(name, []);
                groups.get(name).push({ file: rel, body: extractFnSource(src, m.index) });
            }
        }
    }
    const skip = new Set(DUP_FN_ALLOWLIST.map(a => a.name));
    const identical = [], sameNameOnly = [];
    for (const [name, list] of groups) {
        if (skip.has(name)) continue;
        const files = list.map(x => x.file);
        if (files.length < 2) continue;
        const bodies = list.map(x => x.body);
        const rec = {
            name, files, copies: files.length,
            why: bodies.every(b => b === null) ? '无法判定' : ''
        };
        const comparable = bodies.filter(b => b !== null);
        const allSame = comparable.length === bodies.length && new Set(comparable).size === 1;
        if (allSame) {
            rec.why = '函数体逐字相同 —— 铁证如山的第二份，须收口为唯一来源';
            identical.push(rec);
        } else {
            rec.why = '同名但函数体不同 —— 待人工判定：可能是巧合同名，也可能是「抄了一份又改了一点」（后者更危险：改的那点就是口径分叉）';
            sameNameOnly.push(rec);
        }
    }
    identical.sort((a, b) => b.copies - a.copies || a.name.localeCompare(b.name));
    sameNameOnly.sort((a, b) => b.copies - a.copies || a.name.localeCompare(b.name));
    const fails = [];
    if (identical.length > DUP_FN_RATCHET) {
        fails.push('逐字重复函数 ' + identical.length + ' 组 > 棘轮上限 ' + DUP_FN_RATCHET + '（只降不抬；要抬须拍板）');
    }
    return { identical, sameNameOnly, fails };
}

// ---------------------------------------------------------------------------
// ⓷ 第三条线索：换个名字重写一遍（第 173 轮新增，补第 172 轮点名的结构性盲区）
//    ★ 病根：重复普查原有的两把尺子是「同名 ∪ 同体」，盖不住**换个名字重写一遍**。
//      第 172 轮第三份强制开关白名单就是活证：它叫 forcesOfEntry、用 indexOf 不用
//      includes —— 既不同名也不同体，两把尺子**同时漏掉它**，最后是人工翻出来的。
//      那轮备忘写的是「机器没兜住，今天这条是人工翻出来的」，本条线索就是来兜它的。
//    ⇒ 换一把尺子：不看名字、不看函数体，看**元素取值**。
//      两个常量若共享同一批字符串字面量（共享 ≥ LITERAL_MIN_SHARED 且重叠度
//      ≥ LITERAL_MIN_JACCARD），八成就是同一份口径的各写一遍 —— 无论叫什么名字、
//      用什么写法（includes 还是 indexOf 都不影响它进网）。
//    ★ 与 auditDupFnNames 的关系：它抓「抄函数」，本条抓「抄清单」，互补不重叠。
//    ★ 只点名、不收口（沿用第 152 轮取舍）：改覆盖面＝改行为，须拍板。
//      本件负责让「还有几份、各自写了什么」每周自动打印出来，别再靠人翻。
// ---------------------------------------------------------------------------
export const LITERAL_MIN_SHARED = 2;    // 至少共享几个元素才进网（1 个太容易巧合）
export const LITERAL_MIN_JACCARD = 0.5; // 元素重叠度下限（交集 / 并集）
export const LITERAL_MAX_LEN = 12;      // 单条常量元素数上限：更长的属"大名单"，按设计各异，不进普查
const RE_ARR_DECL = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[/g;
const RE_QUOTED_ELEM = /^\s*(['"])([^'"]*)\1\s*$/;

/** 从 `[` 处按配对切出数组字面量内容（取不到返回 null） */
function extractArrBody(src, openIdx) {
    let depth = 0;
    for (let i = openIdx; i < src.length; i++) {
        if (src[i] === '[') depth++;
        else if (src[i] === ']') { depth--; if (depth === 0) return src.slice(openIdx + 1, i); }
    }
    return null;
}

/**
 * 第三条线索普查：tests 下所有**取值相同的 / 高度重叠的字符串清单常量**。
 * 返回 renamed（取值全等但名字不同 = 铁证的"换个名字重写一遍"）
 *   与 divergent（部分重叠 = 疑似同一题材各写一遍，且口径已经分叉）。
 */
export function auditSharedLiteralSets(dir) {
    const dirs = [dir, dir + '/_lib', dir + '/health-rules'];
    const items = [];
    for (const d of dirs) {
        if (!fs.existsSync(d)) continue;
        for (const f of fs.readdirSync(d).filter(x => x.endsWith('.js') || x.endsWith('.mjs'))) {
            const rel = (d === dir ? '' : path.basename(d) + '/') + f;
            // ★ 先剥注释：注释里的示例清单不是真代码，混进来会产出假候选
            const src = stripComments(fs.readFileSync(path.join(d, f), 'utf8'));
            for (const m of src.matchAll(RE_ARR_DECL)) {
                const body = extractArrBody(src, m.index + m[0].length - 1);
                if (body === null) continue;
                const parts = body.split(',');
                if (parts.length < 2 || parts.length > LITERAL_MAX_LEN) continue;
                const vals = [];
                let pure = true;
                for (const p of parts) {
                    const t = p.trim();
                    if (!t) continue;
                    const mm = RE_QUOTED_ELEM.exec(t);
                    if (!mm) { pure = false; break; }
                    vals.push(mm[2]);
                }
                // 只收**纯字符串字面量**清单：掺了变量/表达式的取值静态定不了，按"无法判定"跳过（同 extractFnSource 的安全方向）
                if (!pure || vals.length < 2) continue;
                items.push({ file: rel, name: m[1], vals: [...new Set(vals)] });
            }
        }
    }
    const renamed = [], divergent = [];
    for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
            const a = items[i], b = items[j];
            const sa = new Set(a.vals), sb = new Set(b.vals);
            let shared = 0;
            for (const v of sa) if (sb.has(v)) shared++;
            if (shared < LITERAL_MIN_SHARED) continue;
            const jac = shared / new Set([...sa, ...sb]).size;
            if (jac < LITERAL_MIN_JACCARD) continue;
            const exact = sa.size === sb.size && shared === sa.size;
            const rec = {
                a: { file: a.file, name: a.name, vals: a.vals },
                b: { file: b.file, name: b.name, vals: b.vals },
                shared, jac: Math.round(jac * 100) / 100, exact,
                // ★ 差异面写清楚：不写"两边差不多"，要写"多/少了哪几个" —— 口径分叉的伤口就在这几个上
                onlyA: a.vals.filter(v => !sb.has(v)),
                onlyB: b.vals.filter(v => !sa.has(v)),
            };
            (exact ? renamed : divergent).push(rec);
        }
    }
    const bySize = (x, y) => y.shared - x.shared || y.jac - x.jac
        || (x.a.name + x.a.file).localeCompare(y.a.name + y.a.file);
    renamed.sort(bySize);
    divergent.sort(bySize);
    // V2.1.0（第 201 轮）：把「改名对」按**取值集合签名**聚成族。
    //   ★ 为什么：同一份清单（例如 7 个主代码目录）被 6 个文件各抄一遍时，两两配对会炸成
    //     C(6,2)=15 对，全等对数随「抄了几份」平方增长，根本反映不了「检测器是否退化成噪音」。
    //     族数才是一件事的个数：抄 6 遍仍是 1 族。判据改看族数，比对数的阈值不再被副本数量绑架。
    //     ⚠️ 注意这不改 LITERAL_MIN_SHARED / LITERAL_MIN_JACCARD（判定某两对是否"重复"的口径一字未动），
    //        只改「聚合成多少件事来计数」。
    const famMap = new Map();
    for (const r of renamed) {
        const sig = [...new Set(r.a.vals)].slice().sort().join('\u0001');
        if (!famMap.has(sig)) famMap.set(sig, { vals: r.a.vals.slice().sort(), decls: [] });
        const fam = famMap.get(sig);
        for (const d of [r.a, r.b]) {
            if (!fam.decls.some(x => x.file === d.file && x.name === d.name)) {
                fam.decls.push({ file: d.file, name: d.name });
            }
        }
    }
    const renamedFamilies = [...famMap.values()]
        .map(f => ({ vals: f.vals, decls: f.decls.sort((x, y) => (x.file + x.name).localeCompare(y.file + y.name)) }))
        // ★ 只留下"真的抄了多份"的族（≥2 处声明）；单份声明的清单不构成重复
        .filter(f => f.decls.length >= 2)
        .sort((x, y) => y.decls.length - x.decls.length || y.vals.length - x.vals.length);
    return { items, renamed, divergent, renamedFamilies, fails: [] };
}

// ---------------------------------------------------------------------------
// ② 按所有权解析枚举块：每段以 `export const <NAME> = Object.freeze({` 起，以其闭合 `});` 止。
//    ★ 与"两锚点切文本"的根本区别：切出来的每一行都**知道它属于哪个枚举**，
//      于是"混进来別的枚举"这件事从"看不见"变成"一条数组"。
// ---------------------------------------------------------------------------
const RE_BLOCK_HEAD = /^export\s+const\s+([A-Z][A-Z0-9_]*)\s*=\s*Object\.freeze\(\{\s*$/;
const RE_BLOCK_TAIL = /^\}\);/;
const RE_KV = /([A-Z][A-Z0-9_]+)\s*:\s*'([^']+)'/g;

export function parseEnumBlocks(src) {
    const lines = src.split('\n');
    const order = [];
    const blocks = new Map();
    let cur = null;
    for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        if (!cur) {
            const h = RE_BLOCK_HEAD.exec(ln);
            if (h) cur = { name: h[1], startLine: i, endLine: -1, keys: [] };
            continue;
        }
        if (RE_BLOCK_TAIL.test(ln)) { cur.endLine = i; order.push(cur.name); blocks.set(cur.name, cur); cur = null; continue; }
        let m;
        RE_KV.lastIndex = 0;
        while ((m = RE_KV.exec(ln)) !== null) cur.keys.push({ key: m[1], val: m[2], line: i + 1 });
    }
    return { order, blocks };
}

// ---------------------------------------------------------------------------
// ③ 给"文本切片"做体检
//   attributeSlice：把切片逐行归属到它真正所属的枚举（第 144 轮原逻辑，一字不改搬过来）。
//   soloBlockKeys ：独立第三路径 —— 只截 <owner> 那一段（从它的 Object.freeze 起到本段闭合止），
//                   专门咬"真值口径被偷偷换成文本重建"（第 144 轮牙一实证：没有这条自证，
//                   掉包就是一次完美的静默假绿）。
//   auditSlice    ：三合一，返回可直接打印的对象 + 红线清单 fails。
// ---------------------------------------------------------------------------
export function attributeSlice(sliceText, defaultOwner) {
    const lines = sliceText.split('\n');
    const rows = [];
    let owner = defaultOwner;
    for (const line of lines) {
        const decl = /^export const ([A-Z][A-Z0-9_]*) = Object\.freeze/.exec(line);
        if (decl) { owner = decl[1]; continue; }
        let m;
        RE_KV.lastIndex = 0;
        while ((m = RE_KV.exec(line)) !== null) rows.push({ owner, key: m[1], val: m[2] });
    }
    const ownerCount = {};
    const keyCount = {};
    for (const r of rows) { ownerCount[r.owner] = (ownerCount[r.owner] || 0) + 1; keyCount[r.key] = (keyCount[r.key] || 0) + 1; }
    return {
        rows,
        ownerCount,
        keyCount,
        foreignOwners: Object.keys(ownerCount).filter(o => o !== defaultOwner),
        foreignRows: rows.filter(r => r.owner !== defaultOwner),
        dupKeys: Object.keys(keyCount).filter(k => keyCount[k] > 1).sort(),
        dupDetail: Object.keys(keyCount).filter(k => keyCount[k] > 1).sort()
            .map(k => k + '（' + rows.filter(r => r.key === k).map(r => r.owner).join(' + ') + '）'),
    };
}

export function soloBlockKeys(src, owner) {
    const lines = src.split('\n');
    let s = -1, e = -1;
    const headRe = new RegExp(owner + '\\s*=\\s*Object\\.freeze\\(\\{');
    for (let i = 0; i < lines.length; i++) {
        if (s < 0) { if (headRe.test(lines[i])) s = i; continue; }
        if (/^\}\);/.test(lines[i])) { e = i; break; }
    }
    if (s < 0 || e <= s) return [];
    const seg = lines.slice(s, e).join('\n');
    return [...seg.matchAll(new RegExp(RE_KV.source, 'g'))].map(m => m[1]);
}

// opts: { src, from, to, owner, truthKeys }
//   行为等价第 144 轮：不改变任何既有判据，只把"这套值到底干不干净"算明白。
export function auditSlice(opts) {
    const src = opts.src;
    const from = src.indexOf(opts.from);
    const to = src.indexOf(opts.to);
    const slice = (from >= 0 && to > from) ? src.slice(from, to) : '';
    const attr = attributeSlice(slice, opts.owner);
    const truthKeys = opts.truthKeys || [];
    const soloKeys = soloBlockKeys(src, opts.owner);
    const extraKeys = attr.rows.map(r => r.key).filter(k => !truthKeys.includes(k));
    const missingKeys = truthKeys.filter(k => !attr.rows.some(r => r.key === k));
    const all = [...slice.matchAll(new RegExp(RE_KV.source, 'g'))].map(m => m[1]);
    return {
        slice,
        rawCount: all.length,
        ...attr,
        truthKeys,
        soloKeys,
        extraKeys: [...new Set(extraKeys)],
        missingKeys,
    };
}


// ---------------------------------------------------------------------------
// ④ 给"值→常量名"平铺映射做体检（本轮第二个受体的发现点）：
//   fact-dead-field-scan 用一条平铺正则扫 infra/56 全文建 值→常量名 映射，再拿它去找 fact 的发射点。
//   它暗含一个没人担保的前提：**同一个字面值不会出现在两个枚举里**。今天恰好成立（实测冲突 0 条），
//   但同一文件里已有 24 个跨枚举同名键 —— 哪天某个值也撞上，映射会把某个 fact 指到**别的枚举的同名常量**上，
//   于是"证据"指向错误的发射文件，A 类（可整批降级）可能就此被错误签发。
// ---------------------------------------------------------------------------
export function auditValueMap(blocks, owner) {
    const flat = new Map();      // 值 → 常量名（平铺口径，既有行为）
    const own = new Map();       // 值 → 常量名（只认 owner 段）
    const collisions = [];       // 同一值被多个常量认领
    const foreign = [];          // 值根本不属于 owner 却进了 flat
    const byVal = new Map();
    for (const name of blocks.order) {
        const b = blocks.blocks.get(name);
        for (const k of b.keys) {
            if (!byVal.has(k.val)) byVal.set(k.val, []);
            byVal.get(k.val).push({ name: k.key, owner: name, line: k.line });
        }
    }
    for (const [val, list] of byVal) {
        const names = [...new Set(list.map(x => x.name))];
        if (names.length > 1) collisions.push({ val, detail: list.map(x => x.owner + '.' + x.name).sort() });
        for (const x of list) flat.set(val, x.name); // 平铺口径：后写覆盖前写（还原既有行为）
    }
    const ownerRows = blocks.blocks.get(owner) ? blocks.blocks.get(owner).keys : [];
    const ownerVals = new Set(ownerRows.map(k => k.val));
    for (const k of ownerRows) own.set(k.val, k.key);
    const ownerNames = new Set(ownerRows.map(k => k.key));
    for (const [val, name] of flat) {
        if (ownerVals.has(val)) continue;
        const src = [...blocks.order].find(n => [...(blocks.blocks.get(n)?.keys || [])].some(k => k.val === val));
        foreign.push({ val, name, realOwner: src || '?' });
    }
    return { flat, own, collisions, foreign, ownerNames, ownerRows };
}

// ---------------------------------------------------------------------------
// ⑤ 给「正则抠锚点」做体检：这个锚点落在真代码里，还是只活在注释里？
//   opts: { src, anchors }   anchors = [{ id, re }]，re 必须带 g；函数内部每次都重置 lastIndex
//   三份取样面，逐份数同一批锚点：
//     rawView   原样源码                       —— 最宽松，注释也算，容易虚高
//     lineView  codeMask 逐行屏蔽「纯注释行」   —— 挡得住整行注释，挡不住行尾注释
//     stripView stripComments 精细剔注释文本   —— 唯一被认作真值的一份（行内注释也不留）
//   两类差值即两类骗局：
//     phantomLine = raw - line   —— 锚点只出现在整行注释里
//     phantomTail = line - strip —— 锚点出现在「代码行的行尾注释」里（★ 逐行 mask 的结构性盲区）
//   ★ 为什么必须三份而不是直接上 stripView：只有一个数字时，你无法知道它和历史报告差在哪；
//     三个数字并列，"掺了多少水"才是看得见的量。
// ---------------------------------------------------------------------------
function countOf(text, re) {
    re.lastIndex = 0;
    let n = 0;
    while (re.exec(text) !== null) n++;
    return n;
}

export function auditAnchorSites(opts) {
    const src = opts.src || '';
    const anchors = opts.anchors || [];
    const marks = codeMask(src);
    const lines = src.split('\n');
    const lineView = lines.map((ln, i) => (marks[i] === 'code' ? ln : '')).join('\n');
    const stripView = stripComments(src);
    const rows = anchors.map(a => {
        const raw = countOf(src, a.re);
        const line = countOf(lineView, a.re);
        const strip = countOf(stripView, a.re);
        return {
            id: a.id,
            raw, line, strip,
            phantomLine: raw - line,
            phantomTail: line - strip,
        };
    });
    return {
        rows,
        lines: lines.length,
        commentLines: marks.filter(m => m === 'comment').length,
        phantomTotal: rows.reduce((s, r) => s + r.phantomLine + r.phantomTail, 0),
    };
}

// ---------------------------------------------------------------------------
// 自证：本件自己腐烂了要能被听见。四条 +
//   ⒌ 独立第三路径自证（soloBlockKeys 必须数与真值口径同一份）。
//   ⒍⒎ 锚点取样三视图自证（整行注释 / 行尾注释 两种假写法必须各自能被数出来）。
//   ★ 设计原则照抄第 143 轮 sample-sufficiency：每个新受体挂一条 selfCheck()，一处坏多处喊。
// ---------------------------------------------------------------------------
// ㉑ 证人保鲜（2026-11-09）：把「证人过期」与「检测失灵」分开。
//   第 162 轮 collectFacts、本轮 parentDmgOf 都是上游把第二份收口了，自证里那条
//   「仍在册的重复」前提已不成立，旧口径却一律报「检测失灵」—— 红得没有真因，
//   还诱使后人去改本来没坏的检测器。数一下定义数即可定因，不用猜。
/** 数某符号在 tests/ 下有多少个文件里写了函数定义（只看定义，不看调用/注释）。 */
function countDefFiles(name) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const re = new RegExp('\\b(?:function\\s+' + name + '\\b|(?:const|let|var)\\s+' + name + '\\s*=)');
    let n = 0;
    const walk = (dir) => {
        for (const st of fs.readdirSync(dir, { withFileTypes: true })) {
            if (st.name.startsWith('.') || st.name === 'node_modules') continue;
            const p = path.join(dir, st.name);
            if (st.isDirectory()) { walk(p); continue; }
            if (!/\.(js|mjs)$/.test(st.name)) continue;
            try { if (re.test(fs.readFileSync(p, 'utf8'))) n++; } catch (_) { /* 读不到不计入 */ }
        }
    };
    walk(root);
    return n;
}

/** 纯逻辑，注入 countFn 即可做负路径自证（不碰磁盘）。 */
export function checkWitnessFreshness(witnesses, countFn) {
    const out = [];
    for (const w of witnesses) {
        if (!w.expect) continue;
        const n = countFn(w.name);
        if (n < 2) {
            out.push('DUP_WITNESS 证人已过期：' + w.name + ' 全 tests 仅 ' + n
                + ' 处函数定义 ⇒ 「仍在册的重复」前提不成立，请把 expect 改 false 并写清核销依据与轮次（'
                + w.why + '）；不要去改 auditDupFnNames，它没坏');
        }
    }
    return out;
}

export function selfCheck() {
    const fails = [];
    // ㉒ 保长度剥注释自证：长度/换行不变、注释被空格覆盖、真代码保留；
    //    并反向证明「删除式」确实不等长，否则这两种口径就没必要并存。
    try {
        const probe = 'const a = 1; // 行注释\n/* 块\n注释 */ const b = 2;\n';
        const kept = stripCommentsPreserving(probe);
        if (kept.length !== probe.length) fails.push('㉒ 保长度剥注释输出长度变了 ⇒ 按索引定位的调用方会错位');
        if (kept.split('\n').length !== probe.split('\n').length) fails.push('㉒ 保长度剥注释吃掉换行 ⇒ 行号会错位');
        if (kept.includes('行注释') || kept.includes('块') || kept.includes('注释 */')) fails.push('㉒ 注释没被空格覆盖 ⇒ 注释里的字样会被当成真代码');
        if (!kept.includes('const a = 1;') || !kept.includes('const b = 2;')) fails.push('㉒ 真代码被误删 ⇒ 剥注释取样面塌陷');
        if (stripComments(probe).length === probe.length) fails.push('㉒ 负路径：删除式剥注释竟与输入等长 ⇒ 两种口径没差别，保长度版没有存在理由');
    } catch (e) {
        fails.push('㉒ 保长度剥注释自证抛异常（' + (e && e.message ? e.message : String(e)) + '）');
    }
    // ㉓ 族数闸门负路径（2026-11-10）：第 201 轮换了计数口径却没配自证，本组证明新口径仍能咬住真泛滥。
    try {
        const fam = (n, decls) => ({ vals: ['v' + n], decls: Array.from({ length: decls }, (_, i) => ({ file: 'f' + i + '.mjs', name: 'C' + n })) });
        const many = Array.from({ length: 13 }, (_, i) => fam(i, 2));
        if (!auditFamilyGate(many).some(x => x.includes('族（> 12）'))) fails.push('㉓ 负路径 A：13 个互不相同的重复族竟没报族数超限 ⇒ 新口径把红洗掉了');
        if (!auditFamilyGate([fam(1, 9)]).some(x => x.includes('单族清单被复制到 9 份'))) fails.push('㉓ 负路径 B：一族抄 9 份竟没报单族超限 ⇒ 只看族数会漏');
        const edge = Array.from({ length: 12 }, (_, i) => fam(i, 8));
        if (auditFamilyGate(edge).length) fails.push('㉓ 正路径：12 族 / 单族 8 份（正好在边界）竟报红 ⇒ 假红');
        if (auditFamilyGate([]).length) fails.push('㉓ 正路径：空族集合竟报红 ⇒ 假红');
    } catch (e) {
        fails.push('㉓ 族数闸门自证抛异常（' + (e && e.message ? e.message : String(e)) + '）');
    }
    // ★ 自证自己必须"全函数不抛"：它一旦抛异常，两个受体会**直接崩掉**而不是报红
    //   （本轮牙三实证：把块头正则改坏后 fact-coverage-selftest 与 fact-dead-field-scan 双双
    //   TypeError 退出，报错信息写的是公共件的行号，反而把真因藏了）。
    //   故这里兜一层：异常也要转成一条 selfCheck 失败项，让受体继续跑完并把它打出来。
    try {
        runSelfChecks(fails);
    } catch (e) {
        fails.push('静态真值口径公共件自证自身抛异常（' + (e && e.message ? e.message : String(e)) + '）⇒ 本件已不可信，用它得到的任何"口径"结论一并作废');
    }
    return fails;
}

/**
 * 「重复清单族」两道闸门的唯一判定处（真实扫描与自证共用）。
 * V2.4.0：第 201 轮把计数对象从「对」换成「族」时只改了调用点、没配负路径自证 ——
 *   改了判据却没证明新口径还能咬住真泛滥，等于无法排除「换口径是为了洗红」。
 *   ★ 单族份数取所有族的最大值，不再依赖 renamedFamilies 已排序这个隐含前提。
 */
export function auditFamilyGate(families, maxFamilies = 12, maxFan = 8) {
    const list = Array.isArray(families) ? families : [];
    const out = [];
    if (list.length > maxFamilies) {
        out.push('auditSharedLiteralSets 取值全等的重复清单聚成 ' + list.length
            + ' 族（> ' + maxFamilies + '）⇒ 重复来源确实泛滥到没法点名，请复核 LITERAL_MIN_SHARED / LITERAL_MIN_JACCARD，'
            + '并优先把「一事一源」收口：' + list.slice(0, 3)
                .map(f => (f.decls || []).map(x => x.name + '@' + x.file).join('/')).join(' ; '));
    }
    const sizes = list.map(f => (f.decls || []).length);
    const worst = sizes.length ? Math.max(...sizes) : 0;
    if (worst > maxFan) {
        const f0 = list[sizes.indexOf(worst)];
        out.push('auditSharedLiteralSets 单族清单被复制到 ' + worst + ' 份（> ' + maxFan + '）⇒ 同一份清单抄得太散，'
            + '应收成唯一来源；首族：' + (f0.decls || []).map(x => x.name + '@' + x.file).join(' / '));
    }
    return out;
}

function runSelfChecks(fails) {
    const keysOf = (blocks, name) => (blocks.blocks.get(name) ? blocks.blocks.get(name).keys : []);
    // ① 注释清除：字符串里的 // 与 块注释里的 /* 都必须保住 / 删掉
    const fx1 = "const a = 'http://x.example/p'; // 行注释\nconst b = 'X';";
    const s1 = stripComments(fx1);
    if (!s1.includes("http://x.example/p")) fails.push('stripComments 把字符串里的 // 误删了（会伤及取值/URL 类的字面量证据）');
    if (s1.includes('行注释')) fails.push('stripComments 没删掉行注释（注释会被当成第二种"写法"）');
    const fx2 = "const c = 1; /* 块注释里也有 'X' */\nconst d = 2;";
    const s2 = stripComments(fx2);
    if (s2.includes('块注释里')) fails.push('stripComments 没删掉块注释（注释会被当成第二种"写法"）');
    if (!s2.includes('const d = 2;')) fails.push('stripComments 连注释后面的真代码也删了（过度清除 ⇒ 真写法被整行吞掉）');
    if (!s2.includes('const c = 1;')) fails.push('stripComments 把注释前面的真代码删了（过度清除 ⇒ 真写法被整行吞掉）');
    // ② codeMask：整行注释必须被标成 comment，含代码的行必须标成 code
    const mask = codeMask("// 纯注释行\nconst x = 1; // 尾巴注释\n/* 块 */");
    if (mask[0] !== 'comment') fails.push('codeMask 把纯注释行标成了代码行（去注释口径会失效）');
    if (mask[1] !== 'code') fails.push('codeMask 把含代码的行标成了注释（会漏掉真写法）');
    if (mask[2] !== 'comment') fails.push('codeMask 没识别出整块注释');
    // ③ 所有权解析：两个相邻枚举必须各归各的，且同一条不串门
    const fx3 = [
        "export const A_TYPES = Object.freeze({",
        "    K1: 'v1',",
        "});",
        "export const B_TYPES = Object.freeze({",
        "    K2: 'v2',",
        "});",
        "",
    ].join('\n');
    const b3 = parseEnumBlocks(fx3);
    if (b3.order.length !== 2) fails.push('parseEnumBlocks 没能按所有权切出两个枚举块（结构断言失效）');
    if (!b3.blocks.get('A_TYPES').keys.some(k => k.key === 'K1')) fails.push('parseEnumBlocks 漏收了 A_TYPES.K1');
    if (b3.blocks.get('A_TYPES').keys.some(k => k.key === 'K2')) fails.push('parseEnumBlocks 把 B_TYPES 的键算进了 A_TYPES（所有权串门）');
    // ④ 独立第三路径：必须与 block 口径数出同一份
    const solo3 = soloBlockKeys(fx3, 'A_TYPES');
    if (solo3.length !== 1 || solo3[0] !== 'K1') fails.push('soloBlockKeys 独立路径失灵（真值口径掉包就再也咬不住了）');
    // ⑤ 值冲突：同一字面值出现在两个枚举必须被报出来
    const fx5 = [
        "export const A_TYPES = Object.freeze({",
        "    SAME: 'dup',",
        "});",
        "export const B_TYPES = Object.freeze({",
        "    OTHER: 'dup',",
        "    ONLY_B: 'onlyb',",
        "});",
        "",
    ].join('\n');
    const v5 = auditValueMap(parseEnumBlocks(fx5), 'A_TYPES');
    if (v5.collisions.length !== 1) fails.push('auditValueMap 没报出跨枚举同值冲突（值→名映射会被静默带错）');
    if (!v5.foreign.some(f => f.realOwner === 'B_TYPES')) fails.push('auditValueMap 没标出外来条目（flat 映射的外来占比无从得知）');
    // ⑥ 切片审计必须识别"混进来別的枚举"与"同名重复"
    const fx6 = "export const A_TYPES = Object.freeze({\n  K1: 'v1',\n});\nexport const B_TYPES = Object.freeze({\n  K1: 'vx',\n});\nexport const ZZZ_MARK = Object.freeze({\n  K9: 'v9',\n});\n";
    const a6 = auditSlice({ src: fx6, from: 'A_TYPES', to: 'ZZZ_MARK', owner: 'A_TYPES', truthKeys: ['K1'] });
    if (a6.foreignOwners.length !== 1) fails.push('auditSlice 没识别出切片里混进来的外来枚举（这是第 144 轮那条病的本体）');
    if (a6.dupKeys.length !== 1) fails.push('auditSlice 没识别出跨枚举同名重复（重复会让分母虚增）');
    // ⑦ 锚点三视图：注释里的锚点一个都不许被算进真值
    const ANCH = [{ id: 'NSX hooked', re: /\bhooked\b/g }];
    const fx7 = [
        "const real = 1; // hooked 只在行尾注释里",
        "// hooked 整行都是注释",
        "const real2 = hookedFn();",
        "",
    ].join('\n');
    const a7 = auditAnchorSites({ src: fx7, anchors: ANCH });
    if (a7.rows[0].strip !== 0) {
        fails.push('auditAnchorSites 把注释里的锚点算成了真值（stripView 应为 0，说明注释没被剔干净）');
    }
    if (a7.rows[0].phantomLine !== 1) {
        fails.push('auditAnchorSites 没数出「整行注释里的锚点」（phantomLine 应为 1，实为 ' + a7.rows[0].phantomLine + '）');
    }
    if (a7.rows[0].phantomTail !== 1) {
        fails.push('auditAnchorSites 没数出「行尾注释里的锚点」（phantomTail 应为 1，实为 ' + a7.rows[0].phantomTail + '）—— 这正是逐行 mask 的结构性盲区');
    }
    // ⑧ 锚点三视图：反过来也不许误伤 —— 真代码里的锚点一个都不能少
    const fx8 = "/* 注释里也提一次 hooked */\nconst x = hooked;\n";
    const a8 = auditAnchorSites({ src: fx8, anchors: ANCH });
    if (a8.rows[0].strip !== 1) {
        fails.push('auditAnchorSites 把真代码里的锚点误删了（stripView 应为 1，实为 ' + a8.rows[0].strip + '）');
    }
    if (a8.rows[0].raw !== 2) {
        fails.push('auditAnchorSites 的 raw 视图漏数（应为 2，实为 ' + a8.rows[0].raw + '），三视图差值就失真了');
    }

    // ---- ⑥ stripCommentsMapped / auditStripCopies 自证（第 151 轮新增，五条） ----
    // ⑪ 正则字面量里的 // 不能被当注释起点（本函数相对 stripComments 的核心增量，
    //    牙一就是咬这里：删掉正则分支它会立刻报）
    // ★ 样本取 /a\/*b/：正则字面量里不可能出现未转义的 //（那会先把正则终止掉，不构成风险），
    //   真正会把剥注释带沟里的是正则里的 /* —— 无正则感知时被当块注释起点，一路吃到文件尾。
    //   （第 151 轮牙B 实证：第一版样本写的是 \/\/，压根没有相邻的 //，断言形同虚设、咬不动）
    const m1 = stripCommentsMapped("const re = /a\\/*b/; const x = 1;");
    if (!m1.code.includes('/a\\/*b/')) {
        fails.push('stripCommentsMapped 把正则字面量里的 // 当成了注释起点（正则会被整段吞掉 ⇒ 取样面少一大块）');
    }
    if (!m1.code.includes('const x = 1;')) {
        fails.push('stripCommentsMapped 连正则后面的真代码也吞了（正则识别越界）');
    }
    // ⑫ 保行结构：多行块注释里的换行必须逐个保留（旧手写版会连换行一起吃掉 ⇒ 行号塌陷）
    const m2 = stripCommentsMapped("const a = 1;\n/* 块注释\n   第二行\n   第三行 */\nconst b = 2;");
    if ((m2.code.match(/\n/g) || []).length !== 4) {
        fails.push('stripCommentsMapped 没有保留多行块注释里的换行（行数 ' + ((m2.code.match(/\n/g) || []).length + 1) + '，应为 5）⇒ 行号回指会整体错位');
    }
    if (!m2.code.includes('const b = 2;')) {
        fails.push('stripCommentsMapped 把块注释后面的真代码删了（过度清除）');
    }
    // ⑬ lineOf 映射：剥注释后剩余字符必须能回指到原文的真实行号（受体靠它报"第几行"）
    const m3 = stripCommentsMapped("// 注释行\nconst a = 'x';\n");
    const at = m3.code.indexOf("const a");
    if (at === -1 || m3.lineOf(m3.owner[at]) !== 2) {
        fails.push('stripCommentsMapped 的 lineOf 回指错位（"const a" 应在第 2 行，实为 ' + (at === -1 ? '未找到' : m3.lineOf(m3.owner[at])) + '）⇒ 报出来的行号不可信');
    }
    // ⑭ 字符串里的 // 与转义引号不能被误伤（与 stripComments 同源的硬要求）
    const m4 = stripCommentsMapped("const u = 'http://x.example/p'; const q = 'a\\'b//c';");
    if (!m4.code.includes("http://x.example/p")) {
        fails.push('stripCommentsMapped 把字符串里的 // 误删了（URL 类字面量会被切断）');
    }
    if (!m4.code.includes("a\\'b//c")) {
        fails.push('stripCommentsMapped 没正确跳过转义引号（字符串边界判错 ⇒ 后面整段错位）');
    }
    // ⑮ auditStripCopies 必须能在"给一个无关文件加一份手写实现"时把它点出来
    //    （牙二就是咬这里：把受体 A 改回手写版，本条必须报，否则机制形同虚设）
    const testsDir = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // tests/_lib -> tests
    try {
        const a9 = auditStripCopies(testsDir);
        if (!Array.isArray(a9.closed) || a9.closed.length === 0) {
            fails.push('auditStripCopies 一条"已收口"都没点出来（两个受体都已改用公共件，closed 应 ≥ 1；实为 0 说明 import 检测失灵）');
        }
        if (a9.open.length > STRIP_COPY_RATCHET) {
            fails.push('auditStripCopies 未收口条数 ' + a9.open.length + ' 已超棘轮上限 ' + STRIP_COPY_RATCHET + '（有人在公共件之外又写了第二份）');
        }
        for (const o of a9.open) {
            if (!STRIP_COPY_ALLOWLIST.some(x => x.file === o.file)) {
                fails.push('auditStripCopies 发现未登记的第二份：' + o.file + '（' + o.fns.join('/') + '）');
            }
        }
    } catch (e) {
        fails.push('auditStripCopies 自身抛异常（' + (e && e.message ? e.message : String(e)) + '）⇒ 第二份快照的守卫已失效');
    }

    // ---- ⑥-c 收口判据自证（第 152 轮新增，三条）----
    // ★ 为什么必须给"判据"本身写自证：第 151 轮已经在日志里写下"判据收紧为只认 import 语句"，
    //   但代码里落盘的仍是第一版宽口径 —— 收紧**没有进提交**（本轮开场 git show d1dd14a0 复核：
    //   RE_IMPORT_TRUTH 四个字只存在于日志散文里，代码一处于 _lib/static-truth-slice.mjs 一处也没有）。
    //   ⇒ 日志写了、报告也 PASS、牙A 也"报了 4 项"，可机制一直是漏的。这就是**验证态与交付态混淆**：
    //     牙A 是在收紧后的工作区里咬出来的，而最后从备份还原时把收紧一起覆盖掉了，
    //     日志撰写者把"验证时看到的现象"当成了"已落盘的改动"。
    //   ⇒ 机制守护机制只有一条路可走：**把判据口径钉进自证**，谁把它退回宽口径，自证立刻报。
    //     否则下一轮还会再"声称收紧一次"，再漏一次。
    // ⑯ 只在注释里提到公共件路径、没有真 import ⇒ 必须判「未收口」
    const c16 = 'function stripCommentsFake(src) { return src; }\n// 注释里提一句 tests/_lib/static-truth-slice.mjs 不算收口\n';
    if (isClosedOnTruth(c16)) {
        fails.push('收口判据把「注释里提到的公共件路径」当成了已收口（第 151 轮那款病原样复发：注释里的东西被当成真值）');
    }
    // ⑰ 注释里抄一句**完整 import 语句**、没有真 import ⇒ 必须判「未收口」
    //    （这条专咬"只认 import 字样、但不剥注释"的退化 —— 那样的判据照样会被注释骗过去）
    // ★ ★ 样本必须是**真风险形态**（第 151 轮牙B 的教训，本轮当场又踩一次）：
    //     第一版写成 `// import { ... } from '...'` —— 行首是 // 不是 import，
    //     而 RE_IMPORT_TRUTH 要求行首紧邻 import，(?:^|\n)[ \t]*import 压根匹配不到，
    //     于是"不剥注释"的退化版本也照样判它未收口 ⇒ 断言形同虚设、牙B 咬不动。
    //     真风险形态是**块注释内部换行后行首就是 import**：那种写法下
    //     (?:^|\n) 之后正好紧邻 import，不剥注释必然误判成已收口。
    const c17 = 'function stripCommentsFake(src) { return src; }\n/* 举个反例：\nimport { stripComments } from \'./static-truth-slice.mjs\';\n*/\n';
    if (isClosedOnTruth(c17)) {
        fails.push('收口判据把「注释里抄的完整 import 语句」当成了已收口（只认 import 字样却不剥注释，等于没收紧）');
    }
    // ⑱ 有真 import、且注释里也提 ⇒ 必须判「已收口」（反向，防剥注释误伤真 import）
    const c18 = '// 参考 tests/_lib/static-truth-slice.mjs\nimport { stripComments } from \'./static-truth-slice.mjs\';\nfunction stripCommentsFake(src) { return stripComments(src); }\n';
    if (!isClosedOnTruth(c18)) {
        fails.push('收口判据把「真 import」漏判成未收口（剥注释过度 ⇒ 真 import 被一起删了，已收口的会凭空变红）');
    }

    // ---- ⑦ 跨文件重复函数点名自证（第 152 轮新增，两条）----
    // ★ 与⑯⑰⑱同一句话：点名件自己也会腐烂（正则改坏、排除名单被删、目录不扫了），
    //   它一坏就表现为"一条都不点名"，而报告依旧 PASS —— 那正是它存在的意义被静默抹掉。
    // ⑲ 真实 tests 目录上必须点出已知的逐字重复（双向棘轮，第 162 轮由单向改双向）
    // ★ 单向的老写法只盯一个方向「该点出的没点出 = 检测失灵」，于是另一侧烂掉没人管：
    //    第 162 轮实测 collectFacts 的第二份（tests/121health-monitor.js）被上游清掉，重复真消失了，
    //    老写法却报「检测失灵」—— 拿一条**已经不成立的前提**当铁证，红得没有真因（同"假退步"那款病）。
    //   ⇒ 改双向：仍在册的必须被点出（缺 ⇒ 检测失灵）；已核销的必须**不被**点出（又被点出 ⇒ 重复回归，
    //     或当初的核销依据失效）。两侧都要写清理由与轮次，谁改谁留痕。
    const DUP_WITNESS = [
        { name: 'readIfAbs', expect: false, why: '第 165 轮(续) 收口为 tests/_lib/read-if-abs.mjs 唯一来源（contract-binding-drift / rule-binding-drift 两处内联副本消除，重复真消失；今后 tests 下若再冒出第二份同体 readIfAbs 即判回归）' },
        { name: 'parentDmgOf', expect: false, why: '2026-11-09 核销：第 152 轮点名的两份（health-rules/151 与 159）里 151 那份已不在盘，实测全 tests 仅 159 一处定义 ⇒ 重复真消失，不是检测失灵；今后若再冒出第二份同体定义，本条按「重复回归」报红' },
        { name: 'fail', expect: true, why: '第 152 轮点名至今仍在（三份自检入口）' },
{ name: 'collectFacts', expect: false, why: '第 163 轮立 tests/_lib/fact-collect.mjs 为唯一收口；本轮消除 121health-monitor.js / rules-replay.mjs 内联副本（含 121 漏 phantomFact 的口径分叉），重复真消失（不是检测失灵）' },
{ name: 'hasActiveBuff', expect: false, why: '第 171 轮立 tests/_lib/buff-state-query.mjs 为唯一收口；消除 phantom-confuse-brother-case.mjs / xiaozhao-horse-carry-case.mjs 两处内联副本（逐字相同，纯搬迁零行为变化），重复真消失（不是检测失灵）' },
{ name: 'permHas', expect: false, why: '第 171 轮立 tests/_lib/buff-state-query.mjs 为唯一收口；消除 phantom-confuse-brother-case.mjs / xiaozhao-horse-carry-case.mjs 两处内联副本（逐字相同，纯搬迁零行为变化），重复真消失（不是检测失灵）' },
{ name: 'normalizeForces', expect: false, why: '第 172 轮立 tests/_lib/forced-case-normalize.mjs 为唯一收口；消除 fact-emission-census.mjs / stat-decl-vs-actual-check.mjs 两处逐字相同副本，重复真消失（不是检测失灵）' },
{ name: 'resetForces', expect: false, why: '第 172 轮同上：三处内联副本（fact-emission-census / stat-decl-vs-actual-check / rules-replay）一并消除；★ 第三处 rules-replay 那份连函数名与实现都不同体，重复普查的两把尺子（同名 ∪ 同体）都漏，已在本轮写进文件头作为结构性盲区备忘' }
    ];
    try {
        const d9 = auditDupFnNames(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
        const names9 = new Set(d9.identical.concat(d9.sameNameOnly).map(x => x.name));
        for (const w of DUP_WITNESS) {
            if (w.expect && !names9.has(w.name)) {
                fails.push('auditDupFnNames 没点出已知的逐字重复函数 ' + w.name + '（' + w.why + ' ⇒ 重复检测已失灵，报告会静默变绿）');
            }
            if (!w.expect && names9.has(w.name)) {
                fails.push('auditDupFnNames 又把已核销的重复函数 ' + w.name + ' 点出来了（核销依据：' + w.why + ' ⇒ 要么重复回归、要么当初核销是误判，两边都要查）');
            }
        }
        // ㉑ 证人保鲜：expect:true 的每一项必须在盘上真有 ≥2 处定义，否则是证人过期而非检测失灵。
        //    放在「检测失灵」判定之后，两条红互不遮蔽；判定本身不让自证静默变绿。
        fails.push(...checkWitnessFreshness(DUP_WITNESS, countDefFiles));
        // ㉑ 负/正路径（纯内存注入，不碰磁盘）：过期证人必报、定义数够 2 不许报。
        const stale = [{ name: '__no_such_fn__', expect: true, why: '自证合成' }];
        const neg = checkWitnessFreshness(stale, () => 0);
        if (neg.length !== 1 || !neg[0].includes('证人已过期')) {
            fails.push('㉑ 负路径：合成一个已过期的证人竟没被点出 ⇒ 证人保鲜断言失效');
        }
        if (checkWitnessFreshness(stale, () => 2).length) {
            fails.push('㉑ 正路径：定义数够 2 的证人竟被报过期 ⇒ 假红');
        }
        // ★ 下界与「仍在册 expect:true 的逐字重复」对齐：nightly 171/172 收口后 tests 下真实 identical
        //   只剩 fail×3 一组。0 组才判覆盖面塌。
        if (d9.identical.length < 1) {
            fails.push('auditDupFnNames 逐字重复只点出 ' + d9.identical.length + ' 组（应 ≥ 1）⇒ 重复检测覆盖面塌了');
        }
    } catch (e) {
        fails.push('auditDupFnNames 自身抛异常（' + (e && e.message ? e.message : String(e)) + '）⇒ 跨文件重复函数的守卫已失效');
    }
    // ⑳ 排除名单必须生效：main / selfCheck / runSelfChecks 一个都不许出现在两桶里。
    // ★ ★ 必查清单必须**硬编码在这里**，绝不能写成遍历 DUP_FN_ALLOWLIST 本身 ——
    //    本轮牙F 实证：第一版就是遍历 ALLOWLIST，于是"把 main 从名单里删掉"这个动作
    //    同时把"检查 main"这件事也删掉了，自证一声不吭（牙F 咬不动）。
    //    ⇒ 与 auditStripCopies 第一版"用注释里的字样证明已收口"是**同一款病**：
    //      拿被检查的东西自己来证明自己，证据来源不可靠，机制必然形同虚设。
    //    修法只有一条：自证持有**独立于被检查对象**的那份清单，两边互相盯着。
    const MUST_SKIP = ['main', 'selfCheck', 'runSelfChecks'];
    try {
        const d10 = auditDupFnNames(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
        const seen = [...d10.identical, ...d10.sameNameOnly].map(x => x.name);
        for (const n of MUST_SKIP) {
            if (seen.includes(n)) {
                fails.push('auditDupFnNames 把「本来就该各写一份」的 ' + n + ' 点成了第二份（排除名单失效 ⇒ 报告会被噪音淹没）');
            }
        }
        // ⑳-b 反向：硬编码清单与 ALLOWLIST 必须一一对应（防两边漂移：
        //   有人往 ALLOWLIST 加了一条而自证不知道，或删了一条而自证还在查 —— 两边都盯住）
        const allowNames = DUP_FN_ALLOWLIST.map(x => x.name);
        for (const n of MUST_SKIP) {
            if (!allowNames.includes(n)) {
                fails.push('DUP_FN_ALLOWLIST 缺登记 ' + n + '（自证必查清单与排除名单已漂移，请同步并写明 why）');
            }
        }
        for (const n of allowNames) {
            if (!MUST_SKIP.includes(n)) {
                fails.push('DUP_FN_ALLOWLIST 多出未受自证保护的条目 ' + n + '（新增排除项必须同步进本件 MUST_SKIP，否则它不受任何断言约束）');
            }
        }
    } catch (e) {
        fails.push('auditDupFnNames 排除名单校验抛异常（' + (e && e.message ? e.message : String(e)) + '）');
    }
    // ㉑ 第三条线索（auditSharedLiteralSets）双向自证 —— 与 ⑲ 同一款双向写法。
    //   ★ 单向的老写法只盯「该点出的没点出」，于是另一侧（检测器把什么都算成重复）烂掉没人管。
    //   ⇒ 两侧都要：仍在册的已知改名对**必须**被点出（缺 ⇒ 检测器失灵，盲区又回来了）；
    //     检测器又必须**不是**把全部 36 条清单都判成重复（那等于噪音淹没，点名没人看）。
    const LITERAL_WITNESS = [
        { a: 'MAIN_DIRS', b: 'CORPUS_DIRS', why: '第 202 轮实测仍在册：relay-drift-guard 的 MAIN_DIRS 与 rule-binding-drift-selftest 的 CORPUS_DIRS 都写全 8 个目录（含 content/tests，比主代码扫面多两个），取值全等却各叫各的名字 —— 第三条线索要兜的就是这一款' },
    ];
    try {
        const d11 = auditSharedLiteralSets(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
        const pairKey = r => r.a.name + '|' + r.b.name;
        const hit = new Set(d11.renamed.concat(d11.divergent).map(pairKey));
        for (const w of LITERAL_WITNESS) {
            if (!hit.has(w.a + '|' + w.b) && !hit.has(w.b + '|' + w.a)) {
                fails.push('auditSharedLiteralSets 没点出已知的改名重复常量 ' + w.a + ' ⇄ ' + w.b
                    + '（' + w.why + ' ⇒ 第三条线索的检测已失灵，第 172 轮那个盲区又回来了）');
            }
        }
        // 反向：检测器不许退化成"什么都算重复"。
        // V2.1.0（第 201 轮）：从「对数 > 12」改为「**族数** > 12」。
        //   老写法用全等对数当闸门，实测被"同一份清单抄 N 遍"刷爆：本轮 27 对里
        //   有 15 对只是 7 个目录清单在 6 个文件里的两两组合，主代码一个字没多。
        //   那不是"阈值放宽成噪音"，是笛卡尔积。族数（按取值集合签名去重）才是"多少件事"。
        // ★ 判据没放宽：12 这个上限值原样沿用，只是计数的对象从"对"换成"族"。
        //   若真有 13 份**互不相同**的清单各自重复，照样报红。
        fails.push(...auditFamilyGate(d11.renamedFamilies));
        // 单族份数上限同走 auditFamilyGate（不再只看已排序的第 0 族），自证 ㉓ 覆盖两条边界。
        // 反向的第二道（V2.1.0 新增）：光看族数会被"一族抄 30 份"掩掉 —— 那照样是点名没人看得下去。
        //   所以再对「单族最多抄几份」设上限。8 这个值取自现状：本轮最大族是 7 个目录清单抄 6 份，
        //   留 2 份余量给后续新增的扫描脚本；一旦冲到 9 份就说明有人又在复制粘贴清单，该收口了。
        if (d11.items.length < 10) {
            fails.push('auditSharedLiteralSets 只扫到 ' + d11.items.length
                + ' 条字符串清单常量（应 ≥ 10）⇒ 扫描覆盖面塌了，第三条线索等于没装');
        }
        // 正向的第三道（V2.2.0 第 202 轮新增）：收口不许把「欠账」洗成「没账」。
        //   ★ 病根：本轮把两族收口后族数 8 → 6，光看「族数 ≤ 12」会以为一直很健康；
        //     真正的回归风险是**有人把收口偷偷还原成手抄**——那时族数回升不会报红（8 也 ≤ 12），
        //     检测器和欠账一起退回去，没人看得见。
        //   ⇒ 钉一条**收口棘轮**：从 mainSourceDirs / FACT_TYPE_MISS 导入的四个文件必须仍在册，
        //     且这两个常量本身必须仍以纯字面量导出（被改成拼串/条件构造就等于收口失效）。
        const CLOSED_RATCHET = [
            { file: 'contract-binding-drift-selftest.mjs', key: 'mainSourceDirs', vals: 'core,infra,modules,player,render,ui,fx' },
            { file: 'entry-path-guard.mjs', key: 'mainSourceDirs', vals: 'core,infra,modules,player,render,ui,fx' },
            { file: 'hp-death-exit-guard.mjs', key: 'mainSourceDirs', vals: 'core,infra,modules,player,render,ui,fx' },
            { file: 'structural-dead-branch-scan.mjs', key: 'mainSourceDirs', vals: 'core,infra,modules,player,render,ui,fx' },
            { file: 'health-rules/182-target-validity.js', key: 'FACT_TYPE_MISS', vals: 'attack,dodge,immune,miss' },
            { file: 'health-rules/183-action-order.js', key: 'FACT_TYPE_MISS', vals: 'attack,dodge,immune,miss' },
            { file: 'health-rules/184-death-revive-rights.js', key: 'FACT_TYPE_MISS', vals: 'attack,dodge,immune,miss' },
            { file: 'health-rules/188-multi-attack-count.js', key: 'FACT_TYPE_MISS', vals: 'attack,dodge,immune,miss' },
            { file: 'health-rules/237-mod-entry-shape.js', key: 'STAT_MOD_KEYS', vals: 'atk,def,maxHp' },
            { file: 'health-rules/242-stat-closure.js', key: 'STAT_MOD_KEYS', vals: 'atk,def,maxHp' },
            { file: 'health-rules/271-absorb-summary-same-source.js', key: 'STAT_MOD_KEYS', vals: 'atk,def,maxHp' },
            { file: 'mod-source-closure.mjs', key: 'STAT_MOD_KEYS', vals: 'atk,def,maxHp' },
        ];
        const testsDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
        for (const c of CLOSED_RATCHET) {
            const p = path.join(testsDir, c.file);
            if (!fs.existsSync(p)) {
                fails.push('「一事一源」收口棘轮：' + c.file + ' 已不在盘（' + c.why + '），无法核对是否被还原成手抄');
                continue;
            }
            const src = stripComments(fs.readFileSync(p, 'utf8'));
            if (!/static-truth-slice\.mjs['"]/.test(src) || !new RegExp('\\b' + c.key + '\\b').test(src)) {
                fails.push('「一事一源」收口棘轮：' + c.file + ' 已不再 import 公共件的 ' + c.key
                    + ' ⇒ 有人把手抄还原回来了，族数会悄悄回升而闸门不报红');
            }
            // ★ V2.3.0 第 203 轮新增（本轮实测发现上一版漏了这一格）：
            //   上一版只查"文件里出现过常量名字样"，于是**同时 import 又另抄一份字面量**照样全绿 ——
            //   本轮验牙实证：给 mod-source-closure.mjs 加回 `const STATS2 = ['atk','def','maxHp']`，
            //   import 语句还在，棘轮一声不响，族数只是从 5 涨回 6（≤12 不报红）。
            //   现改成：在该文件**剥注释后的真代码**里，不得再出现这份清单的裸字面量。
            //   判据按元素全等匹配（容忍引号/空格差异），不认变量名 —— 换个名字抄也照样咬住。
            {
                const want = c.vals.split(',');
                const QUOTES = '["' + String.fromCharCode(39) + ']';
                const SEP = '[\\s]*,[\\s]*';
                const reLit = new RegExp(want.map(v => QUOTES + v + QUOTES).join(SEP), 'g');
                const hits = src.match(reLit);
                if (hits) {
                    fails.push('「一事一源」收口棘轮：' + c.file + ' 里仍有一份 ' + c.key
                        + ' 的裸字面量（' + hits[0] + '）⇒ 已 import 公共件却又手抄一遍，重复源回归');
                }
            }
        }
        // 唯一来源本身也钉住：这两个常量必须仍以**纯字面量数组**直接导出。
        if (!/export\s+const\s+mainSourceDirs\s*=\s*Object\.freeze\(\s*\[[^\]]*\]\s*\)/.test(stripComments(
            fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')))) {
            fails.push('「一事一源」收口棘轮：mainSourceDirs 不再以纯字面量冻结数组导出 ⇒ 唯一来源被改成运行期构造，'
                + '静态取值定不下来，第三条线索对这份清单的覆盖等于失效');
        }
        if (!/export\s+const\s+FACT_TYPE_MISS\s*=\s*Object\.freeze\(\s*\[[^\]]*\]\s*\)/.test(stripComments(
            fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')))) {
            fails.push('「一事一源」收口棘轮：FACT_TYPE_MISS 不再以纯字面量冻结数组导出 ⇒ 同上，唯一来源被改成运行期构造');
        }
        if (!/export\s+const\s+STAT_MOD_KEYS\s*=\s*Object\.freeze\(\s*\[[^\]]*\]\s*\)/.test(stripComments(
            fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')))) {
            fails.push('「一事一源」收口棘轮：STAT_MOD_KEYS 不再以纯字面量冻结数组导出 ⇒ 同上，唯一来源被改成运行期构造');
        }
        // 正向的第四道（V2.3.0 第 203 轮新增）：**族数不许被"收口假象"骗过**。
        //   ★ 病根与上一道同源但方向相反：上一道盯"有人把手抄还原回来"，这一道盯"收口时把清单悄悄改写"。
        //     若有人把 STAT_MOD_KEYS 里的 maxHp 挪成 hp（或增删一项），三处 import 的文件照样全绿、
        //     族数照样是 0，而规则从此扫的是另一组属性 —— 静默丢覆盖面，没有任何闸门报红。
        //   ⇒ 把三份收口前的取值钉成字面量：少了/多了任何一项都报红。这不是放宽，是收口的另一半。
        {
            // ★ 这里刻意不写成数组字面量：auditSharedLiteralSets 会扫本文件，一个 `const want = [...]`
            //   会被当成第五条手抄清单进网，既虚增族数，也把「唯一来源」自己变成了重复源。
            //   （第 203 轮实测踩到：加上这一句后族数 6→6 但 STATS 族从"已收口"变成 want ⇄ stats 一对。）
            const want = 'atk,def,maxHp'.split(',');
            const got = Array.isArray(STAT_MOD_KEYS) ? STAT_MOD_KEYS.slice() : [];
            if (got.length !== want.length || got.some((v, i) => v !== want[i])) {
                fails.push('「一事一源」收口棘轮：STAT_MOD_KEYS 取值被改写为 [' + got.join(', ')
                    + ']，收口前的四份手抄均为 [' + want.join(', ') + '] ⇒ 各处 import 全绿但覆盖面已静默改变');
            }
        }
    } catch (e) {
        fails.push('auditSharedLiteralSets 自身抛异常（' + (e && e.message ? e.message : String(e)) + '）⇒ 第三条线索的守卫已失效');
    }
    return fails;
}
