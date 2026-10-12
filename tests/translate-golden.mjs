// tests/translate-golden.mjs — 翻译层 golden 输出对照器（render/38 拆分护栏）
// V1.0.0 | ~12200 bytes | 2026-10-13 新建：真跑引擎（SeededRNG + initBattleTeams + createRoundStepper）
//          收集每一步日志，逐条走 translateFactsToStageActions（经 render/31 转出口取，顺带守住 re-export 契约），
//          产出规范化 JSON 快照与 golden 基线逐字节比对。翻译器是纯函数（log → stageActions），
//          拆分 render/38 前后输出必须零差异 —— 本文件就是那把尺子。
// 用法：node tests/translate-golden.mjs            → 与 tests/golden-translate-stage-actions.json 比对（一致退 0，差异退 1）
//       node tests/translate-golden.mjs --update   → 重录基线（翻译层有意变更后使用）
//       SEEDS=1,2,3 STAGES=2 node tests/translate-golden.mjs   → 只跑小样本（先验证用）
// 关键口径：对象键**递归排序**后再序列化 —— 拆文件后对象字面量键序可能变化，但字段值不变，
//          不排序会制造假差异；数组顺序（fact 顺序 / 动作顺序）是行为本体，原样保留、绝不排序。
export const VER = 'tests/translate-golden.mjs V1.0.0';

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

async function main() {
    const update = process.argv.includes('--update');
    // 引擎 import 放 main 内：垫片必须先就绪（同 tests/140-baseline.js 的做法）
    const [{ CONFIG, loadGameData }, { SeededRNG }, { createRoundStepper }, { initBattleTeams },
        { CAMP_TYPES, BUFF_TYPES }, { translateFactsToStageActions }] = await Promise.all([
        import('../core/01config-5v5-test.js'),
        import('../infra/51-core-utils.js'),
        import('../core/11battle-round.js'),
        import('../modules/29battle-init.js'),
        import('../infra/56-battle-enums.js'),
        import('../render/31-stage-actions.js')
    ]);
    const { hasCarryTarget } = await import('../modules/28buff-tools.js');
    // 精英组件 + custom-effects 靠模块顶层副作用注册（漏 import 则 initBattleTeams/装配期即崩）
    await import('../modules/25elite-imperial.js');
    await import('../modules/26elite-sixsects.js');
    await import('../modules/27elite-mingjiao.js');
    await import('../modules/30custom-effects.js');
    await loadGameData();

    const MAX_ROUND = CONFIG.MAX_ROUND || 35;
    const SEEDS = process.env.SEEDS ? process.env.SEEDS.split(',').map(Number) : [1, 2, 3, 4, 5];
    const STAGES = process.env.STAGES ? process.env.STAGES.split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7];

    // 团队 Buff 确定性注入：复刻 tests/140-baseline.js 的 tickAndPickBuffs（seed/round 轮转、
    // 不消耗战斗 RNG → 战斗随机序列可复现）。不注入则流星/乘风/连击/巨马这一批由 Buff 门控的
    // fact 一场都跑不到，翻译器覆盖就是空的。GOLDEN_NOBUFFS=1 可关掉做对照。
    const NO_BUFFS = process.env.GOLDEN_NOBUFFS === '1';
    const tickAndPickBuffs = (activeBuffs, ally, enemy, round, seed, pickNew) => {
        var next = (activeBuffs || []).map(function (b) { return { ...b, remaining: b.remaining - 1 }; })
            .filter(function (b) { return b.remaining > 0; });
        if (NO_BUFFS || !pickNew) return next;
        var turn = Math.floor(round / 3);
        var sides = [{ camp: CAMP_TYPES.ALLY, team: ally, off: 0 }, { camp: CAMP_TYPES.ENEMY, team: enemy, off: 1 }];
        for (var i = 0; i < sides.length; i++) {
            var s = sides[i];
            var mine = next.filter(function (b) { return (b.target || CAMP_TYPES.ALLY) === s.camp; });
            var existing = mine.map(function (b) { return b.key; });
            var alive = (s.team || []).filter(function (u) { return u && u.alive; });
            var avail = Object.keys(CONFIG.BUFFS).sort().filter(function (k) {
                if (existing.indexOf(k) !== -1) return false;
                if (k === BUFF_TYPES.CARRY && !hasCarryTarget(s.team)) return false;
                var req = CONFIG.BUFF_ROLE_REQUIREMENTS ? CONFIG.BUFF_ROLE_REQUIREMENTS[k] : null;
                if (req && !alive.some(function (u) { return u.role === req; })) return false;
                return true;
            });
            if (!avail.length) continue;
            var pick = avail[(seed + turn + s.off) % avail.length];
            var def = CONFIG.BUFFS[pick] || {};
            var nb = { key: pick, target: s.camp, remaining: def.duration || CONFIG.BUFF_DURATION || 4, name: def.name || pick };
            if (pick === BUFF_TYPES.HOLY_FLAME) {
                var c1 = ((seed + round + s.off) % 3) + 1, c2 = ((seed + round * 3 + s.off) % 3) + 1;
                nb.cols = c1 === c2 ? [c1, (c1 % 3) + 1] : [c1, c2].sort(function (a, b) { return a - b; });
                nb.rows = [((seed * 2 + round + s.off) % 3) + 1, ((seed * 3 + round + s.off) % 3) + 1].sort(function (a, b) { return a - b; });
            }
            next.push(nb);
        }
        return next;
    };

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
    console.log('=== 翻译层 golden 对照 ===');
    console.log(`  ${cases.length} 场（seeds=${SEEDS.join(',')} × stages=${STAGES.join(',')}）/ 步 ${stepCount} / fact ${factCount} / 动作 ${actionCount}（${actionKinds.size} 种 kind）`);
    if (golden === text) {
        console.log('RESULT: 零差异 ✅ 与 tests/golden-translate-stage-actions.json 逐字节一致');
        return 0;
    }
    // 定位首个差异：字节偏移 → 行号 → 打印两侧上下文
    const a = Buffer.from(golden, 'utf8');
    const b = Buffer.from(text, 'utf8');
    let pos = 0;
    while (pos < Math.min(a.length, b.length) && a[pos] === b[pos]) pos++;
    const lineOf = (buf, i) => buf.toString('utf8', 0, i).split('\n').length;
    const gLines = golden.split('\n');
    const tLines = text.split('\n');
    const ln = Math.min(lineOf(a, pos), gLines.length);
    console.log(`RESULT: 有差异 ❌ 首个差异在字节 ${pos}（golden 第 ${ln} 行，长度 ${a.length} vs ${b.length}）`);
    for (let i = Math.max(0, ln - 3); i < Math.min(gLines.length, ln + 2); i++) {
        console.log(`  [基线] ${i + 1}: ${gLines[i]}`);
    }
    for (let i = Math.max(0, ln - 3); i < Math.min(tLines.length, ln + 2); i++) {
        console.log(`  [本次] ${i + 1}: ${tLines[i]}`);
    }
    console.log('  → 若为翻译层有意变更：node tests/translate-golden.mjs --update 重录后复查');
    return 1;
}

process.exit(await main());
