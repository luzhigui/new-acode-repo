// tests/fact-dead-field-scan.mjs | V1.3.0 | 2026-10-27 夜间第 145 轮：接入静态真值口径公共件（tests/_lib/static-truth-slice.mjs V1.0.0），
//   新增「取样面口径审计」段：①「值→常量名」平铺映射的所有权审计（实测收 213 条，真属 FACT_TYPES 仅 91 条、
//   外来 122 条占 57.3%）②跨枚举同值冲突检测（今天 0 条，但同文件已有 24 个跨枚举同名键，属运气不是担保）
//   ③候选常量名是否真落在 FACT_TYPES 名下（60 条逐条核对，全在）④注释驱动的假「多写法」：
//   原口径 10/50/0 与干净口径（剔除注释）11/49/0 并列打印，差异 1 条 unityApply.op。
//   ★ 四个数字全部**只标注不切换** —— 切换即改既有三桶结论，须拍板。原分桶判据一行未动。
// tests/fact-dead-field-scan.mjs | V1.2.0 | 2026-10-21 第 112 轮 · 2026-10-23 第 123 轮扩层
// V1.2.0 | 2026-10-23 第 124 轮：新增 --triage 证据驱动分流，把「恒定 / 永假候选」自动切成
//        | A 结构常量 / B 需人工复核 / C 未定位 三桶（挂账②人工复核的前置第一刀）。
//        | ★ 本行由第 138 轮补登记：这次抬 VER 时没留机器可读日志行，而本文件头部的旧写法
//        | 「文件名 | V1.1.1 | 日期」不被版本漂移自检的抽取器认得，故这次漂移此前一直没被任何线盯住。
// V1.1.0（第 123 轮）：fact 收集**递归进 attack-group 的 data.entries**。
//   声明类 fact（嗜血狂刀 / 热血奋战 / 溅射 / 反弹 …）由 core/10 L303-305、L382-384 塞进
//   `group.data.entries`，**不在 step.log 顶层**；V1.0.0 只读顶层 ⇒ 整批嵌套声明全漏，
//   （实证：bloodthirstLeech 顶层 0 条、递归后 222 条）。漏层的直接后果是「死字段候选名单」
//   少一大块，且会把「未收集到」误读成「字段不存在」。
// 通用载荷死字段扫描（D1 软判据主线版）—— 第 113 轮沙箱交接列的「下一轮目标二」。
//
// 要抓的假绿形态：fact 照常发射、契约字段照常齐、覆盖矩阵全绿，但某个载荷字段**从来不变**——
//   消费它的渲染/翻译层永远拿到同一个结果。实证样例：XIN_HUN 的 data.isDead 恒 false
//   （modules/26 L235 读顶层 unit._pendingDeath，真值在 unit.state._pendingDeath ⇒ 永远读不到）。
//   这类缺陷覆盖率查不到（「字段在不在」一直答在），必须查「字段会不会变」。
//
// 判据（软，只出候选名单，不自动改判据、不自动转红）：
//   ① 布尔字段：样本 ≥ MIN_SAMPLES 且**永不为真** ⇒ 死字段候选（isDead 永假最典型）；
//   ② 任意字段：样本 ≥ MIN_SAMPLES 且**取值唯一** ⇒ 恒定候选（可能是配置常量，须人工复核）。
//   白名单 EXEMPT：已知合法的常量/标识字段（attackerName 这类按设计恒定的不进候选②）。
//
// ★ 首扫实录（2026-10-21 第 112 轮，140 场 / 54281 条 fact）——5 条永假布尔，定性如下：
//   · xinHun.isDead（194 次永假）**确认死字段**：modules/26 L235 读顶层 unit._pendingDeath，
//     真值在 unit.state._pendingDeath（core/13 L226 写）⇒ 恒 false。与第 113 轮沙箱同一处。
//   · xuanmingDot.isDead（280 次永假）**时序性死字段**：modules/30 L46 读 `!u.alive`，而 dot 伤害
//     刚经 applyStatChange 落下、死亡结算（core/13 finalizeDeaths）尚未跑 ⇒ 读取时点恒早于死亡定稿。
//   · spiderStrike.isDead（62 次永假）**时序性死字段**：modules/20 L241 同款 `!target.alive`。
//   · butterflyHostDead.isDead（35 次永假）**语义错位**：modules/27-sister L262 读 `!sister.alive`，
//     但该 fact 描述「宿主已阵亡、sister 被迫返回」——sister 本人是活的；渲染端 render/35 L120 又把它
//     透传成条目 isDead ⇒ UI 侧对飞回的 sister 永远判「未死」。
//   · skillAnnounce.line（867 次永假）**合法设计**（infra/58 L33 注释：line:false 只走飘字不落行）⇒ 已入豁免。
//   前四条已挂主代码待转交（体检侧只出结论，不代改）；消费侧软判据由 xinhun 定向用例的载荷对撞实证首条。
//
// 与定向用例的分工：xinhun-death-targeted-case.mjs 用「载荷自证对撞」**实证**具体某一条；
//   本脚本做**全 fact 载荷的普查**，把候选名单交人工复核（宁漏勿误：候选 ≠ 缺陷）。
//
// 用法：node tests/fact-dead-field-scan.mjs [--json] [--seeds 20] [--min 20]
//       node tests/fact-dead-field-scan.mjs --triage        （第 124 轮新增：候选自动分流，见下）
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
// 第 145 轮接入 · 静态真值口径审计公共件（tests/_lib/static-truth-slice.mjs V1.0.0）：
//   本文件的 `factConstMap()` 用一条**平铺正则扫 infra/56 全文**建「factType 值 → 常量名」映射，
//   是典型的"账号切片冒充静态真值"（与第 144 轮在 fact-coverage-selftest 抓到的是同一款病，第三次发作）。
//   本轮不切换它（切换 = 改三桶结论 = 须拍板），只接入同一套审计件把它的取样面讲清楚。
import { parseEnumBlocks, auditValueMap, codeMask, selfCheck as truthSelfCheck } from './_lib/static-truth-slice.mjs';

// === 第 124 轮新增 --triage：给「恒定 / 永假候选」做证据驱动的第一刀分流（挂账②人工复核前置）===
// 背景：恒定候选一路涨到 59~64 条（第 123 轮递归扩层所致），全靠人逐条看不动；
//   其中绝大多数按设计就是常量（type: 'breakDef'、ratio: 0.3），真正要人看的是
//   「值来自变量却恒不变」那一类（第 112 / 123 轮 xinHun.isDead、xuanmingDot.isDead 就是这类）。
// 三分类（软结论：只降优先级，**不改判据、不删候选、不自动转红**）：
//   A 结构常量 —— 发射该 fact 的源码文件里，字段是**字面量**写死的 ⇒ 恒值即设计，可整批降级；
//   B 需人工复核 —— 发射文件里该字段来自变量 / 表达式 ⇒ 时序性恒值或样本不足，优先看这一类；
//   C 未定位发射点 —— 源码里找不到该 fact 常量（动态拼装 / 枚举未直用），保留待查。
//   只在**发射侧**（core / modules）找发射文件：render / ui / player 是消费侧，
//   那里出现 `isDead: false` 只是渲染默认值或动作定义（实证：xinHun.isDead 会被 render/39
//   的 `isDead: false` 误判成 A 类，而真发射点在 modules/26 且是表达式 ⇒ 实为 B 类）。
const SRC_DIRS = ['core', 'modules'];
function readSrc() {
    const files = [];
    const walk = (d) => {
        let ents = [];
        try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
        for (const e of ents) {
            const p = d + '/' + e.name;
            if (e.isDirectory()) walk(p);
            else if (e.name.endsWith('.js')) {
                try { files.push({ p, txt: fs.readFileSync(p, 'utf8') }); } catch (e2) { /* 读不到跳过 */ }
            }
        }
    };
    for (const d of SRC_DIRS) walk(d);
    return files;
}
const upperSnake = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
// factType 字符串 → FACT_TYPES 常量名：直接读 infra/56 建值→名映射（不靠 camel→UPPER_SNAKE 猜，
//   实测猜错两例：xuanmingDot 的常量是 XUAN_MING_DOT、bloodthirstLeech 是 BLOOD_THIRST_LEECH，
//   猜成 XUANMING_DOT / BLOODTHIRST_LEECH 会落进「未定位」桶 ⇒ 分流失真）。
// 第 145 轮新增 · 行长亭分行 + 逐行代码/注释标注的缓存（干净口径要用，避免每个候选重算一遍）
const _lineCache = new Map();
const _maskCache = new Map();
function linesOf(f) {
    if (!_lineCache.has(f.p)) _lineCache.set(f.p, f.txt.split('\n'));
    return _lineCache.get(f.p);
}
function maskOf(f) {
    if (!_maskCache.has(f.p)) _maskCache.set(f.p, codeMask(f.txt));
    return _maskCache.get(f.p);
}
function factConstMap() {
    const m = new Map();
    try {
        const txt = fs.readFileSync('infra/56-battle-enums.js', 'utf8');
        for (const mm of txt.matchAll(/([A-Z0-9_]+)\s*:\s*'([A-Za-z0-9_]+)'/g)) m.set(mm[2], mm[1]);
    } catch (e) { /* 读不到则退回猜名 */ }
    return m;
}
// 第 145 轮新增 · 上面那份映射的**所有权审计**：它扫的是 infra/56 全文（16 个枚举），
//   而它要的其实是 FACT_TYPES 那一段。混进来的外来条目今天恰好不影响结论（实测值冲突 0 条），
//   但"恰好"不是"保证" —— 本函数把这两个数钉在报告里，一旦哪天不为 0 就会被字面看见。
function truthCaliberAudit(infraSrc, constMap, items) {
    const blocks = parseEnumBlocks(infraSrc);
    const v = auditValueMap(blocks, 'FACT_TYPES');
    const ownMap = v.own;
    // 每条候选：constName 是不是真属 FACT_TYPES（不属 ⇒ 它的证据可能指向别的枚举的同名常量）
    const misrouted = [];
    for (const it of items) {
        const key = it.key || it.field;
        const ft = key.slice(0, key.indexOf('.'));
        const nm = constMap.get(ft);
        if (!nm) continue;                       // 走 upperSnake 兜底的不算被映射，属既有行为
        if (!v.ownerNames.has(nm)) misrouted.push({ ft, nm });
    }
    const ownCount = blocks.blocks.get('FACT_TYPES') ? blocks.blocks.get('FACT_TYPES').keys.length : 0;
    return { blocks, v, ownMap, ownCount, misrouted };
}
function literalRe(v) {
    if (typeof v === 'string') return '[\'"`]' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\'"`]';
    if (typeof v === 'boolean') return '\\b' + String(v) + '\\b';
    return String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function triageOne(key, value, src, constMap, clean = false) {
    const dot = key.indexOf('.');
    const ft = key.slice(0, dot), field = key.slice(dot + 1);
    const constName = constMap.get(ft) || upperSnake(ft);
    // clean = 干净口径（第 145 轮新增，仅供对照）：发射文件认定时**不认注释里的提及**。
    //   原口径一行未改；干净口径与原口径并列打印，差异交拍板。
    const emitFiles = clean
        ? src.filter(f => linesOf(f).some((ln, i) => maskOf(f)[i] === 'code' && ln.indexOf(constName) !== -1))
        : src.filter(f => f.txt.indexOf(constName) !== -1);
    if (!emitFiles.length) return { cls: 'C', why: '源码未出现 ' + constName + '，发射点未定位' };
    // 只看**发射点附近**（fact 常量所在行 ±12 行）的同名字段写法，避免把文件里别处的
    //   `type:` / `op:` 算进来（实测会把 dodge.type、unityApply.op 这类真常量错判成 B）。
    //   同一发射文件里该字段有 ≥2 种写法 ⇒ 不是结构常量（多分支 / 变量），一律进 B：
    //   实证 core/04buff-system.js 的 isBrother 有 `false`（主分支 L266）与 `true`（兄线 L284）两支，
    //   兄线永不触发 ⇒ 这正是挂账①「小昭兄永久海克斯从未转移」，绝不能按 A 降级放走。
    const near = [];
    const nearAll = [];   // 第 145 轮：含注释行的全量写法（用于标注"多写法是否来自注释"）
    for (const f of emitFiles) {
        const lines = linesOf(f);
        const mask = maskOf(f);
        const marks = [];
        for (let i = 0; i < lines.length; i++) if (lines[i].indexOf(constName) !== -1) marks.push(i);
        if (!marks.length) continue;
        const reNear = new RegExp('\\b' + field + '\\s*:\\s*([^,}\\n]+)');
        for (let i = 0; i < lines.length; i++) {
            if (!marks.some(m => Math.abs(m - i) <= 12)) continue;
            const mm = lines[i].match(reNear);
            if (!mm) continue;
            if (clean && mask[i] !== 'code') continue;   // 干净口径：注释不是代码，不得算成第二种写法
            nearAll.push({ file: f.p, snippet: mm[1].trim(), comment: mask[i] !== 'code' });
            near.push({ file: f.p, snippet: mm[1].trim() });
        }
    }
    const distinct = new Set(near.map(x => x.snippet));
    // 原口径下"含注释"也能算出的一组（第 145 轮：只看不作判据，用于标注"这份多写法是不是注释撑出来的"）
    const formsAll = new Set(nearAll.map(x => x.snippet));
    const commentForms = nearAll.filter(x => x.comment).length;
    const hit = near.find(x => x.snippet.indexOf(JSON.stringify(value)) !== -1
        || x.snippet.replace(/^['"`]|['"`]$/g, '') === String(value));
    if (hit && distinct.size === 1) return { cls: 'A', formsAll: formsAll.size, commentForms, why: hit.file + ' 发射点字面量写死 ' + field + ': ' + hit.snippet };
    if (distinct.size > 1) {
        return { cls: 'B', formsAll: formsAll.size, commentForms, why: emitFiles.slice(0, 2).map(f => f.p).join(' / ') + ' 内 ' + field
            + ' 有 ' + distinct.size + ' 种写法（' + [...distinct].slice(0, 3).join(' | ').slice(0, 60) + '）' };
    }
    return { cls: 'B', formsAll: formsAll.size, commentForms, why: emitFiles.slice(0, 2).map(f => f.p).join(' / ') + ' 内 ' + field + ' 非字面量（变量/表达式）' };
}

// 环境 mock（不改引擎源码，Node 补浏览器能力）—— 必须在任何引擎 import 之前
globalThis.fetch = async (url) => {
    const p = fileURLToPath(new URL(url));
    const text = fs.readFileSync(p, 'utf8');
    return { ok: true, json: async () => JSON.parse(text) };
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.self = globalThis;

export const VER = 'tests/fact-dead-field-scan.mjs V1.3.0';

const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return (i !== -1 && argv[i + 1]) ? Number(argv[i + 1]) : d; };
const JSON_ONLY = argv.includes('--json');
const TRIAGE = argv.includes('--triage');
const N_SEEDS = argOf('--seeds', 20);
const MIN_SAMPLES = argOf('--min', 20);
const SEEDS = Array.from({ length: N_SEEDS }, (_, i) => i + 1);
const STAGES = [1, 2, 3, 4, 5, 6, 7];

// 候选② 白名单：按设计恒定的标识/名称/层数字段（进候选②只会制造噪音）
const EXEMPT_CONST = new Set([
    'attackerName', 'targetName', 'unitName', 'name', 'taunt', 'label', 'reason',
    'hpDeduct', 'healPct', 'stackCount', 'layers', 'depth', 'source', 'skill'
]);

// 候选① 白名单（永假布尔）：已知合法设计字段。
//   skillAnnounce.line —— infra/58-fact-contract.js L33 明注「line:false 时不落行、只走 floatText 飘字」，
//   当前样本全是飘字形态 ⇒ 永假是设计使然，不是死字段（第 112 轮首扫定性后登记）。
const EXEMPT_BOOL = new Set(['skillAnnounce.line']);

// 递归收集 fact（V1.1.0）：顶层 + attack-group 的 data.entries 嵌套层。
function* walkFacts(nodes) {
    for (const n of (nodes || [])) {
        if (!n || typeof n !== 'object') continue;
        if (n.factType) yield n;
        const inner = (n.data && Array.isArray(n.data.entries)) ? n.data.entries
            : (Array.isArray(n.entries) ? n.entries : null);
        if (inner) yield* walkFacts(inner);
    }
}

async function main() {
    const [{ CONFIG, loadGameData }, { SeededRNG }, { createRoundStepper },
           { initBattleTeams }] = await Promise.all([
        import('../core/01config-5v5-test.js'),
        import('../infra/51-core-utils.js'),
        import('../core/11battle-round.js'),
        import('../modules/29battle-init.js')
    ]);
    const { tickAndPickBuffs } = await import('./_lib/buff-picker.mjs');
    const { hasCarryTarget } = await import('../modules/28buff-tools.js');

    
    await import('../modules/25elite-imperial.js');
    await import('../modules/26elite-sixsects.js');
    await import('../modules/27elite-mingjiao.js');
    await import('../modules/30custom-effects.js');
    await loadGameData();
    const MAX_ROUND = CONFIG.MAX_ROUND || 35;

    // factType.field -> { n, boolN, boolTrue, distinct:Set, sample }
    const stat = new Map();
    const bump = (ft, field, value) => {
        const key = ft + '.' + field;
        let s = stat.get(key);
        if (!s) { s = { n: 0, boolN: 0, boolTrue: 0, distinct: new Set(), sample: value }; stat.set(key, s); }
        s.n++;
        if (typeof value === 'boolean') { s.boolN++; if (value) s.boolTrue++; }
        if (s.distinct.size < 60) s.distinct.add(JSON.stringify(value));
    };

    let battles = 0, facts = 0;
    for (const seed of SEEDS) {
        for (const stage of STAGES) {
            const rng = new SeededRNG(seed);
            const { allyTeam, enemyTeam } = initBattleTeams(stage, rng);
            let battleState = {
                ally: allyTeam.map(u => u.clone()),
                enemy: enemyTeam.map(u => u.clone()),
                round: 1,
                activeBuffs: tickAndPickBuffs([], allyTeam, enemyTeam, 1, seed, true),
                allAllies: allyTeam.map(u => u.clone()),
                _rng: rng
            };
            let winner = null;
            while (battleState.round <= MAX_ROUND) {
                const stepper = createRoundStepper(battleState);
                let lastStep = null;
                for (const step of stepper) {
                    lastStep = step;
                    for (const f of walkFacts(step.log)) {
                        facts++;
                        const d = f.data;
                        if (d && typeof d === 'object') {
                            for (const k of Object.keys(d)) bump(f.factType, k, d[k]);
                        }
                    }
                    if (step.winner) winner = step.winner;
                }
                if (winner) break;
                if (!lastStep) break;
                battleState = {
                    ally: lastStep.ally.map(u => u.clone()),
                    enemy: lastStep.enemy.map(u => u.clone()),
                    round: battleState.round + 1,
                    activeBuffs: tickAndPickBuffs(battleState.activeBuffs, lastStep.ally, lastStep.enemy,
                        battleState.round, seed, battleState.round % 3 === 0),
                    allAllies: battleState.allAllies,
                    _rng: rng
                };
            }
            battles++;
        }
    }

    const neverTrue = [], constant = [];
    for (const [key, s] of stat) {
        if (s.n < MIN_SAMPLES) continue;
        const field = key.slice(key.indexOf('.') + 1);
        if (EXEMPT_BOOL.has(key)) continue;
        if (s.boolN >= MIN_SAMPLES && s.boolTrue === 0) neverTrue.push({ field: key, n: s.n });
        if (s.distinct.size === 1 && !EXEMPT_CONST.has(field)) constant.push({ field: key, n: s.n, value: s.sample });
    }
    neverTrue.sort((a, b) => b.n - a.n);
    constant.sort((a, b) => b.n - a.n);

    const out = {
        ver: VER, generatedAt: new Date().toISOString(),
        sample: { battles, facts, seeds: SEEDS.length, stages: STAGES.length, minSamples: MIN_SAMPLES },
        neverTrueBoolean: neverTrue, constantFields: constant,
        note: '候选≠缺陷：neverTrueBoolean 优先人工复核（isDead 永假即死字段）；constantFields 多系配置常量'
    };
    if (JSON_ONLY) { console.log(JSON.stringify(out)); return 0; }
    console.log('=== 通用载荷死字段扫描 ' + VER + ' ===');
    console.log(`样本：${battles} 场 / ${facts} 条 fact / 阈值 ${MIN_SAMPLES}`);
    console.log(`--- 永不为真的布尔字段（死字段候选，优先复核）：${neverTrue.length} 条 ---`);
    for (const c of neverTrue.slice(0, 20)) console.log('  ⚠ ' + c.field + '  样本 ' + c.n + ' 次、true 0 次');
    console.log(`--- 取值唯一的字段（恒定候选，多系配置常量）：${constant.length} 条 ---`);
    for (const c of constant.slice(0, 20)) console.log('  · ' + c.field + '  样本 ' + c.n + ' 次、唯一值 ' + JSON.stringify(c.value).slice(0, 60));
    if (neverTrue.length === 0 && constant.length === 0) console.log('（无候选）');

    // --- 分流（--triage）：替人工复核做第一刀，输出 A/B/C 三桶 ---
    if (TRIAGE) {
        const src = readSrc();
        const constMap = factConstMap();
        const buckets = { A: [], B: [], C: [] };
        const candidates = [...neverTrue.map(c => ({ field: c.field, n: c.n, kind: '永假布尔', value: false })),
            ...constant.map(c => ({ field: c.field, n: c.n, kind: '取值唯一', value: c.value }))];
        const push = (key, value, n, kind) => {
            const t = triageOne(key, value, src, constMap);
            buckets[t.cls].push({ key, value, n, kind, why: t.why, formsAll: t.formsAll, commentForms: t.commentForms });
        };
        for (const c of neverTrue) push(c.field, false, c.n, '永假布尔');
        for (const c of constant) push(c.field, c.value, c.n, '取值唯一');
        console.log(`\n--- 分流（源码文件 ${src.length} 个；A 结构常量 / B 需人工复核 / C 未定位）---`);
        for (const k of ['B', 'A', 'C']) {
            const list = buckets[k];
            const label = k === 'B' ? 'B 需人工复核（值来自变量/表达式）' : (k === 'A' ? 'A 结构常量（字面量写死，可整批降级）' : 'C 未定位发射点');
            console.log(`【${label}】${list.length} 条`);
            for (const x of list) {
                console.log('  · ' + x.key + '  ' + x.n + ' 次 · ' + x.kind + ' · ' + x.why.slice(0, 110));
            }
        }
        printTruthCaliber(src, constMap, candidates, buckets);
    }
    return 0;
}

// ==== 第 145 轮新增 · 取样面口径审计报告 ============================================
// 为什么要有这一段（承接第 144 轮结论）：本文件的 factConstMap 与 triageOne 都是"用文本当真值"，
//   与第 144 轮在 fact-coverage-selftest 抓到的切片错位是**同一款病的第三次发作**：
//     ① factConstMap 平铺扫 infra/56 全文（16 个枚举 237 行）取"值→常量名"，却只想要 FACT_TYPES 那 91 行；
//     ② triageOne 把**注释里出现的同名写法**也算成"第二种写法" ⇒ 本该 A 的候选被推去 B；
//   两处都不修改既有分桶（切换 = 改既有结论 = 须拍板），只把口径、占比、差额摆到桌面上。
function printTruthCaliber(src, constMap, candidates, buckets) {
    const infraSrc = fs.readFileSync('infra/56-battle-enums.js', 'utf8');
    const A = truthCaliberAudit(infraSrc, constMap, candidates);
    const selfFails = truthSelfCheck();
    console.log('\n--- 取样面口径审计（第 145 轮新增 · 走 tests/_lib/static-truth-slice.mjs V1.0.0）---');
    if (selfFails.length) {
        console.log('· ⛔ 静态真值口径公共件自证 ' + selfFails.length + ' 项：');
        for (const s of selfFails) console.log('    ❌ ' + s);
    } else {
        console.log('· ✅ 静态真值口径公共件自证通过（注释清除 / 逐行标注 / 所有权分块 / 独立第三路径 / 值冲突识别）');
    }
    console.log(`· 「值→常量名」映射面：既有的平铺口径收 ${A.v.flat.size} 条，其中真属 FACT_TYPES ${A.ownCount} 条、`
        + `外来枚举 ${A.v.foreign.length} 条（占 ${(A.v.foreign.length / Math.max(1, A.v.flat.size) * 100).toFixed(1)}%）`);
    const byOwner = {};
    for (const f of A.v.foreign) byOwner[f.realOwner] = (byOwner[f.realOwner] || 0) + 1;
    if (A.v.foreign.length) {
        console.log('    ❌ 外来条目（不是 FACT_TYPES 却被收进映射）逐条点名：'
            + A.v.foreign.slice(0, 6).map(f => f.val + '→' + f.name + '@' + f.realOwner).join('、')
            + ' …共 ' + A.v.foreign.length + ' 条；归属构成：'
            + Object.entries(byOwner).map(([k, n]) => k + ' ' + n + ' 条').join(' / '));
    }
    if (A.v.collisions.length) {
        console.log('    ❌ 跨枚举同值冲突 ' + A.v.collisions.length + ' 条 —— 同一字面值被多个常量认领，'
            + 'constMap.get() 只留最后写的那个 ⇒ 该 fact 的证据会指向**错误的发射文件**（A 类可被错误签发）：'
            + A.v.collisions.slice(0, 6).map(c => "'" + c.val + "'=" + c.detail.join(' / ')).join('、'));
    } else {
        console.log('    ✅ 今天跨枚举同值冲突为 0 条 ⇒ 既有 A/B/C 分桶**未**被错误指向；'
            + '但同一文件内已有 ' + crossDupKeys(A.blocks).length + ' 个跨枚举同名键，'
            + '「0 冲突」是运气不是担保 —— 本行即担保：哪天变非 0，这里会先红。');
    }
    if (A.misrouted.length) {
        console.log('    ❌ 候选里 ' + A.misrouted.length + ' 条的常量名不在 FACT_TYPES 名下（规矩：一律禁止按 A 降级）：'
            + A.misrouted.slice(0, 8).map(m => m.ft + '→' + m.nm).join('、'));
    } else {
        console.log('    ✅ 候选的常量名全部落在 FACT_TYPES 名下（' + candidates.length + ' 条逐条核对）');
    }
    // ---- 注释驱动的假"多写法"：只看不说的前提下重算一遍（干净口径，与原口径并列）----
    const noisy = [...buckets.B].filter(x => x.commentForms > 0);
    console.log(`· 注释污染：B 桶 ${buckets.B.length} 条里 ${noisy.length} 条的"多写法"里含注释得出的份`
        + '（例：' + (noisy[0] ? noisy[0].key + ' 写法集 ' + noisy[0].formsAll + ' 种、其中注释 ' + noisy[0].commentForms + ' 种' : '无') + '）');
    const cleanBuckets = { A: [], B: [], C: [] };
    for (const c of candidates) {
        const t = triageOne(c.field, c.value, src, constMap, true);
        cleanBuckets[t.cls].push({ key: c.field, cls: t.cls });
    }
    const cnt = (b) => b.A.length + '/' + b.B.length + '/' + b.C.length;
    console.log(`· 两套口径并列对照（A/B/C）：原口径 ${cnt(buckets)} → 干净口径（剔除注释后）${cnt(cleanBuckets)}`);
    const moved = cleanBuckets.A.filter(x => buckets.B.some(b => b.key === x.key));
    if (moved.length) {
        console.log('    ⇒ 差异来自 ' + moved.length + ' 条「多写法其实是注释」的候选：' + moved.slice(0, 8).map(x => x.key).join('、')
            + ' —— **未切换**（切换即改既有结论，须拍板）；'
            + '★ 但请留意这批入口：A 类意味着"可整批降级"，若注释行实际记录的是旧写法，放行前仍需人工确认。');
    } else {
        console.log('    ⇒ 两套口径结论一致，注释未造成分桶差异。');
    }
}

// 跨枚举同名键清单（复用公共件的块归属，不另抄一份统计）
function crossDupKeys(blocks) {
    const ownerOf = new Map();
    for (const name of blocks.order) for (const k of blocks.blocks.get(name).keys) {
        if (!ownerOf.has(k.key)) ownerOf.set(k.key, new Set());
        ownerOf.get(k.key).add(name);
    }
    return [...ownerOf.entries()].filter(([, s]) => s.size > 1).map(([k, s]) => k + '（' + [...s].join(' + ') + '）');
}

main().then(code => process.exit(code || 0)).catch(e => { console.error('死字段扫描运行异常：', e); process.exit(2); });
