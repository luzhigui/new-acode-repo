// tests/fact-dead-field-scan.mjs | V1.1.1 | 2026-10-21 第 112 轮 · 2026-10-23 第 123 轮扩层
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
function factConstMap() {
    const m = new Map();
    try {
        const txt = fs.readFileSync('infra/56-battle-enums.js', 'utf8');
        for (const mm of txt.matchAll(/([A-Z0-9_]+)\s*:\s*'([A-Za-z0-9_]+)'/g)) m.set(mm[2], mm[1]);
    } catch (e) { /* 读不到则退回猜名 */ }
    return m;
}
function literalRe(v) {
    if (typeof v === 'string') return '[\'"`]' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\'"`]';
    if (typeof v === 'boolean') return '\\b' + String(v) + '\\b';
    return String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function triageOne(key, value, src, constMap) {
    const dot = key.indexOf('.');
    const ft = key.slice(0, dot), field = key.slice(dot + 1);
    const constName = constMap.get(ft) || upperSnake(ft);
    const emitFiles = src.filter(f => f.txt.indexOf(constName) !== -1);
    if (!emitFiles.length) return { cls: 'C', why: '源码未出现 ' + constName + '，发射点未定位' };
    // 只看**发射点附近**（fact 常量所在行 ±12 行）的同名字段写法，避免把文件里别处的
    //   `type:` / `op:` 算进来（实测会把 dodge.type、unityApply.op 这类真常量错判成 B）。
    //   同一发射文件里该字段有 ≥2 种写法 ⇒ 不是结构常量（多分支 / 变量），一律进 B：
    //   实证 core/04buff-system.js 的 isBrother 有 `false`（主分支 L266）与 `true`（兄线 L284）两支，
    //   兄线永不触发 ⇒ 这正是挂账①「小昭兄永久海克斯从未转移」，绝不能按 A 降级放走。
    const near = [];
    for (const f of emitFiles) {
        const lines = f.txt.split('\n');
        const marks = [];
        for (let i = 0; i < lines.length; i++) if (lines[i].indexOf(constName) !== -1) marks.push(i);
        if (!marks.length) continue;
        const reNear = new RegExp('\\b' + field + '\\s*:\\s*([^,}\\n]+)');
        for (let i = 0; i < lines.length; i++) {
            if (!marks.some(m => Math.abs(m - i) <= 12)) continue;
            const mm = lines[i].match(reNear);
            if (mm) near.push({ file: f.p, snippet: mm[1].trim() });
        }
    }
    const distinct = new Set(near.map(x => x.snippet));
    const hit = near.find(x => x.snippet.indexOf(JSON.stringify(value)) !== -1
        || x.snippet.replace(/^['"`]|['"`]$/g, '') === String(value));
    if (hit && distinct.size === 1) return { cls: 'A', why: hit.file + ' 发射点字面量写死 ' + field + ': ' + hit.snippet };
    if (distinct.size > 1) {
        return { cls: 'B', why: emitFiles.slice(0, 2).map(f => f.p).join(' / ') + ' 内 ' + field
            + ' 有 ' + distinct.size + ' 种写法（' + [...distinct].slice(0, 3).join(' | ').slice(0, 60) + '）' };
    }
    return { cls: 'B', why: emitFiles.slice(0, 2).map(f => f.p).join(' / ') + ' 内 ' + field + ' 非字面量（变量/表达式）' };
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

export const VER = 'tests/fact-dead-field-scan.mjs V1.2.0';

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
        const push = (key, value, n, kind) => {
            const t = triageOne(key, value, src, constMap);
            buckets[t.cls].push({ key, value, n, kind, why: t.why });
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
    }
    return 0;
}

main().then(code => process.exit(code || 0)).catch(e => { console.error('死字段扫描运行异常：', e); process.exit(2); });
