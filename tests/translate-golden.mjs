// tests/translate-golden.mjs — 翻译层 golden 输出对照器（render/38 拆分护栏）
// V1.1.0 | 2026-10-28 夜间第 150 轮：新增「差异形态分类」诊断段（★ 只补诊断，判据/退码/结论一行未改）。
//   起因是本轮实测：报告说「首个差异在字节 8735，长度 15304144 vs 14035467」，
//   读者必然读成"有 1.27MB 的内容变了"，而真实差异只是**多了一个字段**导致后续整体错位一行。
//   ★ 这正是第 148 轮那句话的同类病：红得没有真因，却看起来像真因（而且看起来很严重）。
//   本段不回答"有没有差异"（那是原判据的事，一行未动），只回答"差异长什么样"，
//   免得人按 1.27MB 的错觉去查一个字段的洞。分类逻辑另挂三条自证（插入/同行/无关文本）。
// V1.0.1 | ~12200 bytes | 2026-10-25 第 123 轮：tickAndPickBuffs 收口至 tests/_lib/buff-picker.mjs 唯一来源（拷贝缺永久继承，与 rules-replay 口径分叉）；golden 输出随样本变化待业务侧重录
// 用法：node tests/translate-golden.mjs            → 与 tests/golden-translate-stage-actions.json 比对（一致退 0，差异退 1）
//       node tests/translate-golden.mjs --update   → 重录基线（翻译层有意变更后使用）
//       SEEDS=1,2,3 STAGES=2 node tests/translate-golden.mjs   → 只跑小样本（先验证用）
// 关键口径：对象键**递归排序**后再序列化 —— 拆文件后对象字面量键序可能变化，但字段值不变，
//          不排序会制造假差异；数组顺序（fact 顺序 / 动作顺序）是行为本体，原样保留、绝不排序。
//   tests/_lib/buff-picker.mjs 唯一来源），而 VER 常量一直停在 V1.0.0 —— 属漏改，本轮由
//   ver-drift-selftest 自动绊线抓出后归位。VER 只归位到日志已有的 V1.0.1，未擅自升版。
export const VER = 'tests/translate-golden.mjs V1.1.0';

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const GOLDEN_PATH = fileURLToPath(new URL('./golden-translate-stage-actions.json', import.meta.url));

// --- 环境垫片：引擎零 DOM，但 import 链上会碰浏览器 API（必须在任何引擎 import 之前垫好）---
globalThis.fetch = async (url) => {
    const fs = await import('node:fs');
    const text = fs.readFileSync(fileURLToPath(new URL(url)), 'utf8');
    return { ok: true, json: async () => JSON.parse(text) };
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.self = globalThis;

// --- 规范化：递归键排序 + JSON 语义裁剪 ---
// undefined/function/symbol 与 JSON.stringify 同款丢弃（对象属性）或置 null（数组元素）；
// NaN/Infinity 落成稳定字符串；循环引用落 '[Circular]' 标记（键序确定 → 标记位置确定）。
// 墙钟字段归一：unit.state._deathTime = Date.now()（core/10:151、core/12:353、core/13:116/205、
//   modules/26:206），waveUnit 整个单位对象进 ATTACK 动作时会把它带进快照 —— 跨运行必漂
//   （首跑即实测到 1791837538785 vs 1791837639453 的假差异）。键保留、值归一为固定标记，
//   「有没有这个字段」仍在比，只是不比墙钟读数。
const VOLATILE_KEYS = new Set(['_deathTime']);

function normalize(value, seen) {
    if (value === null) return null;
    const t = typeof value;
    if (t === 'number') return Number.isFinite(value) ? value : String(value);
    if (t === 'string' || t === 'boolean') return value;
    if (t === 'bigint') return String(value);
    if (t !== 'object') return undefined;
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    let out;
    if (Array.isArray(value)) {
        out = value.map(v => {
            const n = normalize(v, seen);
            return n === undefined ? null : n;
        });
    } else {
        out = {};
        for (const k of Object.keys(value).sort()) {
            if (VOLATILE_KEYS.has(k)) { out[k] = '[volatile]'; continue; }
            const n = normalize(value[k], seen);
            if (n !== undefined) out[k] = n;
        }
    }
    seen.delete(value);
    return out;
}

const norm = (v) => normalize(v, new Set());

// --- 第 150 轮新增：差异形态分类 -------------------------------------------
//   从首个差异行开始，试探"基线第 i 行 == 本次第 i+offset 行"，取匹配率最高的 offset。
//   offset = 0  ⇒ 同行内容差异（真变更）；offset ≠ 0 ⇒ 整体错位（实为插入/删除若干行）。
//   ★ 为什么还要卡 0.9 匹配率：两份毫无共同行的文本，任何 offset 的匹配率都是 0，
//     不卡阈值就会随便挑一个 offset 然后宣布"只是错位了" —— 那等于给所有差异发免罪牌。
function classifyDiffShape(gLines, tLines, fromLine) {
    const W = 200;
    const start = Math.max(0, fromLine - 1);
    let best = { offset: 0, hit: -1 };
    for (let off = -5; off <= 5; off++) {
        let hit = 0;
        let tot = 0;
        for (let k = 0; k < W; k++) {
            const g = gLines[start + k];
            const t = tLines[start + k + off];
            if (g === undefined && t === undefined) continue;
            tot++;
            if (g === t) hit++;
        }
        const rate = tot ? hit / tot : 0;
        if (rate > best.hit) best = { offset: off, hit: rate };
    }
    if (best.offset === 0 || best.hit < 0.9) return { kind: 'inline', offset: 0, onlyInOld: [], onlyInNew: [] };
    // 点名"多出来 / 少掉的那一行"：先按**同索引**扫到第一个不等的位置，再按 offset 的方向
    //   判定是本次多（插入）还是基线多（删除）。★ 只点名首处：多处插入时后续由人按上下文核对。
    const slim = (s) => String(s).trim().replace(/,$/, '').replace(/"/g, '').slice(0, 60);
    let onlyInOld = [];
    let onlyInNew = [];
    if (best.offset !== 0) {
        let i = Math.max(0, start);
        while (i < gLines.length && i < tLines.length && gLines[i] === tLines[i]) i++;
        if (best.offset > 0 && tLines[i] !== undefined) onlyInNew = [slim(tLines[i])];
        else if (best.offset < 0 && gLines[i] !== undefined) onlyInOld = [slim(gLines[i])];
    }
    return { kind: 'offset', offset: best.offset, onlyInOld, onlyInNew };
}

// 自证（第 143 轮规矩：新逻辑挂自证；★ 自证不过必须喊出来 —— 只打印不计退码就是假绿）
function selfCheckShape() {
    const fails = [];
    try {
        // ① 纯插入一行 ⇒ 必须判成整体错位，且能把插入的那行点名
        const s1 = classifyDiffShape(['a', 'b', 'c'], ['a', 'b', 'X', 'c'], 3);
        if (s1.kind !== 'offset') {
            fails.push('① 差异形态分类失位：纯插入一行没被判成整体错位（实判 ' + s1.kind + '）');
        } else if (s1.onlyInNew.indexOf('X') < 0) {
            fails.push('①b 新增行点名失位：插入的那一行没被点名（实得 ' + JSON.stringify(s1.onlyInNew) + '）');
        }
        // ② 同行内容差异 ⇒ 必须判成 inline；误判成错位会把真内容变更说成"只是错位"
        const s2 = classifyDiffShape(['a', 'b', 'c', 'd'], ['a', 'b', 'Z', 'd'], 3);
        if (s2.kind !== 'inline') {
            fails.push('② 差异形态分类失位：同行内容差异被误判成整体错位（实判 offset=' + s2.offset + '）');
        }
        // ③ 毫无共同行的两份文本 ⇒ 不许判成错位（否则分类器变成"什么都说是错位"的假绿）
        const s3 = classifyDiffShape(['1', '2', '3', '4', '5', '6'], ['甲', '乙', '丙', '丁', '戊', '己'], 1);
        if (s3.kind !== 'inline') {
            fails.push('③ 差异形态分类失位：毫无共同行的两份文本被判成整体错位 —— 分类器会给所有差异发免罪牌');
        }
    } catch (e) {
        fails.push('差异形态分类自证自身抛异常（' + (e && e.message ? e.message : String(e)) + '）⇒ 形态结论一并作废');
    }
    return fails;
}

async function main() {
    const update = process.argv.includes('--update');
    // 引擎 import 放 main 内：垫片必须先就绪（同 tests/140-baseline.js 的做法）
    const [{ CONFIG, loadGameData, loadHexEnhanceData }, { SeededRNG }, { createRoundStepper }, { initBattleTeams },
        { CAMP_TYPES, BUFF_TYPES }, { translateFactsToStageActions }] = await Promise.all([
        import('../core/01config-5v5-test.js'),
        import('../infra/51-core-utils.js'),
        import('../core/11battle-round.js'),
        import('../modules/29battle-init.js'),
        import('../infra/56-battle-enums.js'),
        import('../render/31-stage-actions.js')
    ]);
    const { tickAndPickBuffs } = await import('./_lib/buff-picker.mjs');
    const { hasCarryTarget } = await import('../modules/28buff-tools.js');
    // 精英组件 + custom-effects 靠模块顶层副作用注册（漏 import 则 initBattleTeams/装配期即崩）
    await import('../modules/25elite-imperial.js');
    await import('../modules/26elite-sixsects.js');
    await import('../modules/27elite-mingjiao.js');
    await import('../modules/30custom-effects.js');
    await loadGameData();
    // 第 162 轮：上游把小昭.hexEnhance 整段迁到 content/201hex-enhance.json，启动链必须一并 loadHexEnhanceData（缺口由 tests/hex-boot-chain-guard.mjs 点名）
    await loadHexEnhanceData();

    const MAX_ROUND = CONFIG.MAX_ROUND || 35;
    const SEEDS = process.env.SEEDS ? process.env.SEEDS.split(',').map(Number) : [1, 2, 3, 4, 5];
    const STAGES = process.env.STAGES ? process.env.STAGES.split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7];

    // 团队 Buff 确定性注入：复刻 tests/140-baseline.js 的 tickAndPickBuffs（seed/round 轮转、
    // 不消耗战斗 RNG → 战斗随机序列可复现）。不注入则流星/乘风/连击/巨马这一批由 Buff 门控的
    // fact 一场都跑不到，翻译器覆盖就是空的。GOLDEN_NOBUFFS=1 可关掉做对照。
    const NO_BUFFS = process.env.GOLDEN_NOBUFFS === '1';

    

    // 跑一场：引擎逐步产出日志 → 每步调 translateFactsToStageActions → 记「fact 序列 + 动作序列」。
    // fact 序列一并入 golden：铁律「fact 顺序不许变」也归这把尺子管。
    function runCase(seed, stage) {
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
        const steps = [];
        let winner = null;
        while (battleState.round <= MAX_ROUND) {
            let lastStep = null;
            for (const step of createRoundStepper(battleState)) {
                lastStep = step;
                const facts = (step.log || []).filter(e => e && e.factType).map(e => e.factType);
                steps.push({ round: battleState.round, facts, actions: norm(translateFactsToStageActions(step.log || [])) });
                if (step.winner) winner = step.winner;
            }
            if (winner || !lastStep) break;
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
        return { seed, stage, steps };
    }

    const cases = [];
    for (const seed of SEEDS) for (const stage of STAGES) cases.push(runCase(seed, stage));

    const snapshot = {
        meta: {
            note: '翻译层 golden 基线：translateFactsToStageActions 输出（键递归排序后序列化）；--update 重录',
            seeds: SEEDS, stages: STAGES
        },
        cases
    };
    const text = JSON.stringify(snapshot, null, 2);

    // 统计（报告用）
    let stepCount = 0, actionCount = 0, factCount = 0;
    const actionKinds = new Set();
    for (const c of cases) for (const s of c.steps) {
        stepCount++;
        factCount += s.facts.length;
        for (const a of s.actions || []) { actionCount++; if (a && a.kind) actionKinds.add(a.kind); }
    }

    if (update) {
        writeFileSync(GOLDEN_PATH, text, 'utf8');
        console.log(`=== 翻译层 golden 基线已重录 ===`);
        console.log(`  ${cases.length} 场（seeds=${SEEDS.join(',')} × stages=${STAGES.join(',')}）/ 步 ${stepCount} / fact ${factCount} / 动作 ${actionCount}（${actionKinds.size} 种 kind）`);
        console.log(`  基线：tests/golden-translate-stage-actions.json（${Buffer.byteLength(text, 'utf8')} bytes）`);
        console.log('RESULT: 基线已更新（仅在翻译层有意变更后使用）');
        return 0;
    }

    let golden;
    try {
        golden = readFileSync(GOLDEN_PATH, 'utf8');
    } catch (e) {
        console.log('❌ 读不到 golden 基线 tests/golden-translate-stage-actions.json —— 先跑 node tests/translate-golden.mjs --update 生成');
        return 1;
    }
    // 2026-10-21 第 112 轮：行尾归一化后再比。git autocrlf 会把签出的 golden 转成 CRLF、
    //   而本脚本生成的 text 是 LF ⇒ 按原始字节比时"整文件皆差异"（首个差异恒在字节 1），
    //   正确重录后的基线在下次签出也会假红。归一化 CRLF→LF 后只报真实内容差异。
    const goldenN = golden.replace(/\r\n/g, '\n');
    console.log('=== 翻译层 golden 对照 ===');
    console.log(`  ${cases.length} 场（seeds=${SEEDS.join(',')} × stages=${STAGES.join(',')}）/ 步 ${stepCount} / fact ${factCount} / 动作 ${actionCount}（${actionKinds.size} 种 kind）`);
    if (goldenN === text) {
        console.log('RESULT: 零差异 ✅ 与 tests/golden-translate-stage-actions.json 一致（行尾归一化后）');
        return 0;
    }
    // 定位首个差异：字节偏移 → 行号 → 打印两侧上下文（用归一化后的文本定位，行号才对准）
    const a = Buffer.from(goldenN, 'utf8');
    const b = Buffer.from(text, 'utf8');
    let pos = 0;
    while (pos < Math.min(a.length, b.length) && a[pos] === b[pos]) pos++;
    const gLines = goldenN.split('\n');
    const tLines = text.split('\n');
    // 行号 = 首个差异字节之前的换行数 + 1
    // ★ 第 150 轮修一个定位 bug：pos 是**字节**偏移，而 slice(0, pos) 是**字符**索引 ——
    //   golden 里有中文（单位名等），两者并不对齐，直接用字符索引数换行会把行号算大
    //   （本轮实测：真实首差在第 294 行，旧算式报 296 行，偏 2 行）⇒ 按行号去查会查错地方。
    const gBuf = Buffer.from(goldenN, 'utf8');
    let nlCount = 0;
    for (let k = 0; k < pos && k < gBuf.length; k++) if (gBuf[k] === 0x0a) nlCount++;
    const ln2 = nlCount + 1;
    console.log(`RESULT: 有差异 ❌ 首个差异在字节 ${pos}（第 ${ln2} 行，长度 ${a.length} vs ${b.length}）`);
    for (let i = Math.max(0, ln2 - 3); i < Math.min(gLines.length, ln2 + 2); i++) {
        console.log(`  [基线] ${i + 1}: ${gLines[i]}`);
    }
    for (let i = Math.max(0, ln2 - 3); i < Math.min(tLines.length, ln2 + 2); i++) {
        console.log(`  [本次] ${i + 1}: ${tLines[i]}`);
    }
    // --- 第 150 轮新增：差异形态分类（★ 只补诊断，判据/退码/结论一行未改） ---
    //   起因就是本轮这个数字：字节 8735 / 长度 15304144 vs 14035467 —— 看着像 1.27MB 的内容都变了，
    //   真身却是「多了一个字段 ⇒ 后面整体错位一行」。不分类就会有人按 1.27MB 去查一个字段的洞。
    const shape = classifyDiffShape(gLines, tLines, ln2);
    if (shape.kind === 'offset') {
        console.log(`  ★ 差异形态 = 整体错位（基线→本次偏移 ${shape.offset > 0 ? '+' : ''}${shape.offset} 行）：`
            + `实为插入/删除 ${Math.abs(shape.offset)} 行，不是内容整体变更 —— `
            + `长度差 ${b.length - a.length > 0 ? '+' : ''}${b.length - a.length} 字节是错位累积出来的假象，别按它估改动量`);
        if (shape.onlyInOld.length) console.log('    [基线有/本次无] ' + shape.onlyInOld.join(' / '));
        if (shape.onlyInNew.length) console.log('    [本次有/基线无] ' + shape.onlyInNew.join(' / '));
    } else {
        console.log('  · 差异形态 = 同行内容差异（非整体错位）：同一位置上的值变了，按上方上下文核对');
    }
    const shapeFails = selfCheckShape();
    for (const bad of shapeFails) console.log('  ✗ ' + bad);
    if (shapeFails.length) console.log('  ⇒ 自证未过 —— 上述差异形态分类不可信（有无差异的结论仍成立）');

    console.log('  → 若为翻译层有意变更：node tests/translate-golden.mjs --update 重录后复查');
    return 1;
}

process.exit(await main());
