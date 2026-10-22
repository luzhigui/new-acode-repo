// tests/hit-shapes-consistency.mjs — 寒离飒「蓄意轰拳」数值口径对账（静态检查，非运行时体检）
// V1.0.0 | ~9000 bytes | 2026-10-22 体检第 116 轮新建
//   背景（一次真事故）：蓄意轰拳的伤害分母有三份副本——content 真值、modules/27 结算、ui/79 引擎 UI。
//     2026-10-22 发现 ui/79 与 modules/27 里各留了「兜底字面量」{direct:2, near:4, far:6} / eightDen:3，
//     那是 v29 定稿（direct=1.25 / eightDen=2.5）之前的旧口径。content 有值时走不到兜底 → 平时无感；
//     但 content 一旦缺字段，就静默按旧口径算伤害，且没人会发现（假绿）。
//     同期 132 预览页（root，非引擎路径）整份参数快照过期，直接档显示 N/2（真值 N/1.25），已按老板拍板删除。
//   本检查盯三件事（任一红即退出码 1）：
//     ① 数值对账：真值（content）↔ 引擎结算（modules/27）↔ 引擎 UI（ui/79），同一 N 同一瞄位逐格比伤害。
//        —— 直接求值引擎侧真实源码里的分档/伤害函数，不复刻实现（规则不许复制产品旧实现）。
//     ② 形状对账：九位九形 hitShapes 逐格比对，且每格必须落在「瞄位自身 + 相邻 + 更远」三档之内。
//     ③ 兜底扫描：modules/27 与 ui/79 里不得再出现 xuLi 相关字段的字面量兜底（`?? 数字` / `|| {字面量}`）。
//        缺参数就该报错（老板口径：有错误就让他暴露出来，不要静默兜底）。
//   零触发守卫：真值/引擎源码任一读取失败、或对账格子数为 0 → 硬红（解析失效 = 空跑出绿，不许有）。
// 用法：node tests/hit-shapes-consistency.mjs
export const VER = 'tests/hit-shapes-consistency.mjs V1.0.0';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// ---- 真值源：content/200game-data.json ----
function loadTruth() {
    const raw = JSON.parse(read('../content/200game-data.json'));
    const ch = raw?.characters?.['寒离飒'];
    const skill = ch?.skills?.['xuLi'];
    if (!skill || !skill.params) throw new Error('真值读取失败：content/200game-data.json 里找不到 寒离飒.skills.xuLi.params');
    return { params: skill.params, desc: skill.desc || '' };
}

// ---- 从引擎源码里抽函数原文并求值（不复刻实现，用的是引擎本体） ----
// 抽 `function <name>(...) {...}` 完整原文；抽不到返回 null（调用方硬红）。
export function extractFunctionSource(src, name) {
    const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(src);
    if (!m) return null;
    const braceStart = src.indexOf('{', m.index);
    if (braceStart < 0) return null;
    let depth = 0;
    for (let i = braceStart; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(m.index, i + 1);
        }
    }
    return null;
}

// ---- 从 modules/27 的结算块里抽「取格分档」原文并求值 ----
// modules/27 的分档逻辑是一段内联块（tierOf + shapes/tierDen/eightDen/fullDen 组 cells），不是独立函数。
// 抽取策略：按锚点切出该块原文，包成函数体后求值——求值的是引擎源码本身，不是本检查复刻的版本。
// 锚点要点：起点必须含 else 分支里 `cells = [[...]]` 的赋值头（flatMap 是它的续行，切断会缺左值）；
//           终点取 flatMap 整行（含结尾 `));`）。
export function extractSettlementBlock(src) {
    const startAnchor = 'const tierOf = (a, p) => {';
    // else 分支是「赋值头 + 换行 + .flatMap(...)」两行，起点必须含赋值头，否则抽出的表达式缺左值；
    // 终点必须含 if/else 的收尾 `}`，否则整块少一个花括号、无法求值（用正则以兼容 CRLF/LF 两种行尾）。
    const endRe = /\.flatMap\(\(\[a, b, c, d, t\]\) => \[a, b, c\]\.map\(p => \(\{ pos: p, tier: t, den: d \}\)\)\);[\r\n\s]*\}/;
    const s = src.indexOf(startAnchor);
    const em = endRe.exec(src);
    if (s < 0 || !em || em.index <= s) return null;
    return src.slice(s, em.index + em[0].length);
}

// 结算块求值 → 返回 { cellsByAim, fullCells }：cellsByAim[aim] = [{pos,tier,den}]
// （整段当脚本在 vm 沙箱里跑，注入 xl/aim；跑的是引擎源码本体，不复刻实现）
function evalCells(blockSrc, xl, aim) {
    const sandbox = { xl, aim, __cells: undefined };
    vm.createContext(sandbox);
    new vm.Script(blockSrc + '\n;this.__cells = cells;', { filename: 'hanlisa-settle-block.js' }).runInContext(sandbox);
    return sandbox.__cells;
}

// ---- 引擎结算侧：全屏兜底 + 9 个瞄位，逐格取 (pos,tier,den) ----
function settlementCells(blockSrc, xl) {
    const byAim = {};
    for (let aim = 1; aim <= 9; aim++) byAim[aim] = evalCells(blockSrc, xl, aim);
    byAim[0] = evalCells(blockSrc, xl, 0); // 0 = 不瞄（引擎走全屏兜底）
    return byAim;
}

// ---- 引擎 UI 侧：求值 ui/79 的 dmgMapFor + HIT_MAP ----
export function extractHitMap(src) {
    const m = /const\s+HIT_MAP\s*=\s*\{([\s\S]*?)\n\};/.exec(src);
    if (!m) return null;
    try {
        // eslint-disable-next-line no-new-func
        return new Function('return {' + m[1] + '};')();
    } catch (e) {
        return null;
    }
}

function evalDmgMapFor(src, xl) {
    const fnSrc = extractFunctionSource(src, 'dmgMapFor');
    const tierSrc = extractFunctionSource(src, 'tierOf');
    const hitMap = extractHitMap(src);
    if (!fnSrc || !tierSrc || !hitMap) return null;
    const fn = new Function('HIT_MAP', 'tierOf', 'return (' + fnSrc + ');');
    const tierFn = new Function('return (' + tierSrc + ');')();
    return { dmgMapFor: fn(hitMap, tierFn), hitMap };
}

// ---- 兜底扫描：xuLi 字段的字面量兜底 ----
const FALLBACK_PATTERNS = [
    /xl\.tierDen\s*\|\|\s*\{/,
    /xl\.eightDen\s*\?\?/,
    /xl\.fullDen\s*\|\|\s*\{/,
    /xl\.shieldPct\s*\?\?/,
    /xl\.vampDiv\s*\?\?/,
    /xl\.hitShapes\s*\|\|\s*\{\s*\}/
];

function scanFallbacks(src) {
    const hits = [];
    FALLBACK_PATTERNS.forEach(re => {
        const m = re.exec(src);
        if (m) hits.push(m[0].replace(/\s+/g, ' '));
    });
    return hits;
}

// ---- 主检查 ----
export function checkConsistency({ truth, settleBlock, uiSrc, settleSrc }) {
    const problems = [];
    const stats = {};

    // 零触发守卫
    if (!truth || !truth.params) problems.push('真值读取失败（content 里找不到 寒离飒.skills.xuLi.params）');
    if (!settleBlock) problems.push('modules/27 结算块抽取失败（tierOf/取格分档 锚点变了或代码被重构）');
    if (!uiSrc) problems.push('ui/79hanlisa-aim.js 读取失败');
    if (problems.length) return { problems, stats };

    const xl = truth.params;
    const desc = truth.desc || '';
    const shapes = xl.hitShapes || {};
    const shapeKeys = Object.keys(shapes);
    if (shapeKeys.length !== 9) problems.push(`真值 hitShapes 应有 9 个瞄位，实为 ${shapeKeys.length} 个`);
    for (const f of ['tierDen', 'eightDen', 'fullDen', 'shieldPct', 'vampDiv']) {
        if (xl[f] == null) problems.push(`真值 xuLi.params 缺字段 ${f}`);
    }
    if (problems.length) return { problems, stats };

    // ---- ① 引擎结算侧求值 ----
    let cellsByAim;
    try {
        cellsByAim = settlementCells(settleBlock, xl);
    } catch (e) {
        problems.push('modules/27 结算块求值抛错：' + (e && e.message || e));
        return { problems, stats };
    }
    // ---- ② 引擎 UI 侧求值 ----
    const ui = evalDmgMapFor(uiSrc, xl);
    if (!ui) {
        problems.push('ui/79 的 HIT_MAP / tierOf / dmgMapFor 抽取或求值失败');
        return { problems, stats };
    }

    // ---- 检查①：九位九形形状对账 ----
    // 结算侧 cellsByAim[aim] 的 pos 集合 === 真值 shapes[aim] === UI 侧 HIT_MAP[aim]
    const shapeMismatch = [];
    for (let aim = 1; aim <= 9; aim++) {
        const truthCells = [...(shapes[String(aim)] || [])].map(Number).sort((a, b) => a - b);
        const settleCells = (cellsByAim[aim] || []).map(c => c.pos).sort((a, b) => a - b);
        const uiCells = [...(ui.hitMap[aim] || [])].map(Number).sort((a, b) => a - b);
        const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
        if (!eq(truthCells, settleCells)) shapeMismatch.push(`瞄${aim}：结算侧取格 {${settleCells}} ≠ 真值 {${truthCells}}`);
        if (!eq(truthCells, uiCells)) shapeMismatch.push(`瞄${aim}：UI 侧 HIT_MAP {${uiCells}} ≠ 真值 {${truthCells}}`);
    }
    problems.push(...shapeMismatch);

    // ---- 检查②：逐格伤害对账（同一 N，三方必须一致） ----
    const N = 90;
    const dmgMismatch = [];
    let compared = 0;
    for (let aim = 1; aim <= 9; aim++) {
        // 结算侧：dmg = floor(N / den)
        const settleMap = {};
        for (const c of (cellsByAim[aim] || [])) settleMap[c.pos] = Math.floor(N / c.den);
        // UI 侧：dmgMapFor
        const uiMap = ui.dmgMapFor(aim, N, xl);
        // 真值参考：按真值 tierDen/eightDen 独立算一次（只作对照基准，不参与实现）
        const refMap = {};
        for (const p of (shapes[String(aim)] || [])) {
            const pos = Number(p);
            const isEight = (aim === 8 && pos !== 8);
            const t = tierOfRef(aim, pos);
            const den = isEight ? xl.eightDen : xl.tierDen[t];
            refMap[pos] = Math.floor(N / den);
        }
        const posSet = [...new Set([...Object.keys(settleMap), ...Object.keys(uiMap), ...Object.keys(refMap)])].map(Number).sort((a, b) => a - b);
        for (const pos of posSet) {
            compared++;
            const s = settleMap[pos], u = uiMap[pos] && uiMap[pos].dmg, r = refMap[pos];
            if (s !== r || u !== r) {
                dmgMismatch.push(`瞄${aim} 位${pos}（N=${N}）：结算侧 ${s} / UI 侧 ${u} / 真值参考 ${r} 不一致`);
            }
        }
    }
    problems.push(...dmgMismatch);

    // ---- 检查③：全屏兜底（不瞄）对账 ----
    const fullSettle = (cellsByAim[0] || []);
    const fullUi = ui.dmgMapFor(0, N, xl);
    let fullCompared = 0;
    for (const c of fullSettle) {
        fullCompared++;
        const s = Math.floor(N / c.den), u = fullUi[c.pos] && fullUi[c.pos].dmg;
        const rowDen = c.pos <= 3 ? xl.fullDen.row123 : (c.pos <= 6 ? xl.fullDen.row456 : xl.fullDen.row789);
        const r = Math.floor(N / rowDen);
        if (s !== r || u !== r) problems.push(`全屏 位${c.pos}（N=${N}）：结算侧 ${s} / UI 侧 ${u} / 真值参考 ${r} 不一致`);
    }

    // ---- 检查④：兜底扫描 ----
    const settleFallbacks = scanFallbacks(settleSrc);
    const uiFallbacks = scanFallbacks(uiSrc);
    if (settleFallbacks.length) problems.push(`modules/27 仍有字面量兜底：${settleFallbacks.join('、')} —— 缺参数应报错，不该静默按旧口径算`);
    if (uiFallbacks.length) problems.push(`ui/79 仍有字面量兜底：${uiFallbacks.join('、')} —— 缺参数应报错，不该静默按旧口径算`);

    // ---- 检查⑤：desc 口径交叉验证（独立的第二真值基准）----
    // desc 是给玩家看的技能说明，它写死了各档倍率（"该格吃基数 0.8 倍、相邻格 1/4、更远格 1/6"、
    // "瞄 8 号位特例：8 号吃 0.4 倍"、"全屏：1/2/3 号位各 1/3、4/5/6 各 1/4、7/8/9 各 1/5"、
    // "获最大生命 50% 护盾"、"吸血 = 总伤害的 1/3"、"生命低于 40% 时 50% 概率"）。
    // 三方对账只能抓「某一方脱离 content 单独变」；本项抓「content 自身被改歪却没同步 desc」——
    // 因为 desc 与 params 是两处独立书写，改一处不改另一处本身就是 bug。
    problems.push(...checkDescCrossTruth(desc, xl));

    Object.assign(stats, {
        shapes: shapeKeys.length,
        aims: 9,
        dmgCells: compared,
        fullCells: fullCompared,
        settleFallbacks: settleFallbacks.length,
        uiFallbacks: uiFallbacks.length,
        tierDen: JSON.stringify(xl.tierDen),
        eightDen: xl.eightDen
    });
    return { problems, stats };
}

// ---- desc 口径交叉验证：desc 文字里写死的倍率/比例 ↔ params 数值 ----
// 从 desc 里抠出「X 倍」「1/Y」形式的数字，与 params 换算出的倍率逐条对账。
export function checkDescCrossTruth(desc, xl) {
    const problems = [];
    if (!desc) return ['技能说明（desc）为空 —— 无法做口径交叉验证（检查空跑=假绿）'];

    // desc 里的倍率是固定表述，泛泛地抓「A/Z」会把「1/2/3 号位」「7/8/9」这类格位列表误当倍率。
    // 故按**已知措辞**精确抠：谁吃多少倍 / 哪几档各多少 / 8 号特例 / 全屏各档。
    const foundFrac = [];
    const push = (a, b) => foundFrac.push([Number(a), Number(b)]);
    // ① 「该格吃基数 X 倍」「相邻格 A/B」「更远格 A/B」
    let m;
    const directRe = /该格吃基数\s*([\d.]+)\s*倍/;
    if ((m = directRe.exec(desc))) foundFrac.push(['1', String(1 / Number(m[1]))]);
    // 相邻/更远：A/B 或 X 倍
    const adjRe = /相邻格\s*(\d+)\s*\/\s*(\d+)\s*(?:、|$|，|,)/;
    if ((m = adjRe.exec(desc))) push(m[1], m[2]);
    const farRe = /更远格\s*(\d+)\s*\/\s*(\d+)/;
    if ((m = farRe.exec(desc))) push(m[1], m[2]);
    // ② 「全屏：敌方 1/2/3 号位各 1/3、4/5/6 各 1/4、7/8/9 各 1/5」——只抠「各 1/X」里的分母
    //    （不用 [^。]*? 惰性：那样第一次匹配会把整句吃掉，后面两档漏抓）
    const fullRe = /各\s*1\s*\/\s*(\d+)/g;
    while ((m = fullRe.exec(desc)) !== null) push(1, m[1]);
    // ③ 「8 号吃 0.4 倍」
    const eightRe = /8\s*号吃\s*([\d.]+)\s*倍/;
    if ((m = eightRe.exec(desc))) foundFrac.push(['1', String(1 / Number(m[1]))]);

    // 期望集合：直击 1/direct、相邻 1/near、更远 1/far、8号特例 1/eightDen、全屏 1/row123 1/row456 1/row789
    const expected = [
        { key: 'tierDen.direct', ratio: 1 / xl.tierDen.direct },
        { key: 'tierDen.near', ratio: 1 / xl.tierDen.near },
        { key: 'tierDen.far', ratio: 1 / xl.tierDen.far },
        { key: 'eightDen', ratio: 1 / xl.eightDen },
        { key: 'fullDen.row123', ratio: 1 / xl.fullDen.row123 },
        { key: 'fullDen.row456', ratio: 1 / xl.fullDen.row456 },
        { key: 'fullDen.row789', ratio: 1 / xl.fullDen.row789 }
    ];
    // desc 里出现的每条倍率都该能在期望集合里找到同值（允许 1/4 同时匹配 near 与 row456）
    for (const [a, z] of foundFrac) {
        const ratio = Number(a) / Number(z);
        const hit = expected.some(e => Math.abs(e.ratio - ratio) < 1e-6);
        if (!hit) problems.push(`技能说明里的「${a}/${z}」与 params 算出的任何档位倍率都对不上（${expected.map(e => e.key + '=' + e.ratio.toFixed(4)).join('、')}）——说明与数值脱节`);
    }
    // 期望集合里每一条都该在 desc 里出现过（否则说明漏写了某档）
    for (const e of expected) {
        const inDesc = foundFrac.some(([a, z]) => Math.abs(Number(a) / Number(z) - e.ratio) < 1e-6);
        if (!inDesc) problems.push(`params 的 ${e.key}（= ${e.ratio.toFixed(4)} 倍）在技能说明里找不到对应写法——数值改了但说明没同步`);
    }

    // 护盾比例：desc 写「获最大生命 50% 护盾」
    const shieldPctInDesc = /最大生命\s*(\d+(?:\.\d+)?)\s*%\s*护盾/.exec(desc);
    if (shieldPctInDesc) {
        const want = Number(shieldPctInDesc[1]) / 100;
        if (Math.abs(xl.shieldPct - want) > 1e-9) {
            problems.push(`技能说明写「最大生命 ${shieldPctInDesc[1]}% 护盾」，但 params.shieldPct=${xl.shieldPct} —— 说明与数值脱节`);
        }
    }
    // 吸血除数：desc 写「吸血 = 总伤害的 1/3」
    const vampInDesc = /吸血[^。]*?总伤害的\s*(\d+)\s*\/\s*(\d+)/.exec(desc);
    if (vampInDesc) {
        const want = Number(vampInDesc[2]) / Number(vampInDesc[1]);
        if (Math.abs(xl.vampDiv - want) > 1e-9) {
            problems.push(`技能说明写「吸血 = 总伤害的 ${vampInDesc[1]}/${vampInDesc[2]}」，但 params.vampDiv=${xl.vampDiv} —— 说明与数值脱节`);
        }
    }
    // 双拳阈值与概率：desc 写「生命低于 40% 时 50% 概率追加一拳」
    const dblInDesc = /生命低于\s*(\d+(?:\.\d+)?)\s*%.*?(\d+(?:\.\d+)?)\s*%.*?概率/.exec(desc);
    if (dblInDesc) {
        const wantHp = Number(dblInDesc[1]) / 100, wantProb = Number(dblInDesc[2]) / 100;
        if (Math.abs(xl.doublePunchHpPct - wantHp) > 1e-9) problems.push(`技能说明写「生命低于 ${dblInDesc[1]}%」，但 params.doublePunchHpPct=${xl.doublePunchHpPct} —— 说明与数值脱节`);
        if (Math.abs(xl.doublePunchProb - wantProb) > 1e-9) problems.push(`技能说明写「${dblInDesc[2]}% 概率」，但 params.doublePunchProb=${xl.doublePunchProb} —— 说明与数值脱节`);
    }
    return problems;
}

// 真值参考用的分档（与引擎同口径：3×3 网格曼哈顿距离）
function tierOfRef(aim, pos) {
    const r1 = Math.ceil(aim / 3), c1 = aim - (r1 - 1) * 3;
    const r2 = Math.ceil(pos / 3), c2 = pos - (r2 - 1) * 3;
    const d = Math.abs(r1 - r2) + Math.abs(c1 - c2);
    return d <= 0 ? 'direct' : (d === 1 ? 'near' : 'far');
}

// ---- 组装 ----
function main() {
    console.log('=== 寒离飒·蓄意轰拳 数值口径对账（静态检查）===');
    let truth = null;
    try {
        truth = loadTruth();
    } catch (e) {
        console.error('✗ ' + (e && e.message || e));
        process.exit(1);
    }

    const settleSrc = read('../modules/27elite-mingjiao-hanlisa.js');
    const uiSrc = read('../ui/79hanlisa-aim.js');
    const settleBlock = extractSettlementBlock(settleSrc);

    const { problems, stats } = checkConsistency({ truth, settleBlock, uiSrc, settleSrc });

    if (!problems.length) {
        console.log(`✅ 三方一致：真值(content) ↔ 结算(modules/27) ↔ 引擎UI(ui/79)；且与技能说明口径交叉验证通过`);
        console.log(`   九位九形 ${stats.shapes} 形 · 逐格伤害对账 ${stats.dmgCells} 格 · 全屏兜底 ${stats.fullCells} 格`);
        console.log(`   分档口径 tierDen=${stats.tierDen} · 8号特例除数=${stats.eightDen} · 字面量兜底 ${stats.settleFallbacks + stats.uiFallbacks} 处`);
        process.exit(0);
    }
    console.log(`\n✗ 发现 ${problems.length} 项口径漂移：`);
    for (const p of problems) console.log('  ✗ ' + p);
    process.exit(1);
}

main();
