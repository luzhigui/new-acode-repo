// tests/fact-emission-census.mjs V1.0.0
// ───────────────────────────────────────────────────────────────────────────
// 样本驱动 fact 发射普查（第 124 轮·C）：替代此前站不住的「静态 fact-coverage 检查器」。
//
// 为什么是样本驱动、不是静态扫描：
//   覆盖/空转盲区本质是**运行时**现象（fact 实际出现 + 规则/渲染实际消费）。规则按 data 字段值、
//   渲染标签、变体命名（HOLY_FLAME vs HOLY_FLAME_APPLY）消费 fact，裸字符串静态匹配会被骗过——
//   第 124 轮实证静态版两波假阳性（把文件名/渲染标签/契约 id 字段误判成「消费了裸 fact」）。
//   所以这里：① 跑真实对局收集「引擎实际发射的 factType 真集」；② 用「引擎侧发射点是否存在」
//   这个可靠信号判定死 factType（枚举有定义但全库零发射点 = 真死枚举项）；③ 盲区候选 = 实际发射
//   却既无渲染注册又无规则引用的 factType（带诚实标注：规则可能按 data 字段消费，故为候选非红）。
//
// 本工具为**诊断/普查**，恒 EXIT 0（不判红）——盲区候选需人工/定向用例兜底（如蝶血用例）。
// ───────────────────────────────────────────────────────────────────────────

// 环境 mock（不改引擎源码；Node 补浏览器能力）—— 必须在任何引擎 import 之前
globalThis.fetch = async (url) => {
    const { fileURLToPath } = await import('node:url');
    const { readFileSync } = await import('node:fs');
    const p = fileURLToPath(new URL(url));
    const text = readFileSync(p, 'utf8');
    return { ok: true, json: async () => JSON.parse(text) };
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.self = globalThis;

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG, loadGameData } from '../core/01config-5v5-test.js';
import { SeededRNG } from '../infra/51-core-utils.js';
import { createRoundStepper } from '../core/11battle-round.js';
import { initBattleTeams } from '../modules/29battle-init.js';
import { tickAndPickBuffs } from './_lib/buff-picker.mjs';
import { FACT_TYPES } from '../infra/56-battle-enums.js';
import { FACT_SPECS } from '../infra/58-fact-contract.js';

const VER = 'tests/fact-emission-census.mjs V1.0.0';
const argv = process.argv.slice(2);
const JSON_ONLY = argv.includes('--json');
const N_SEEDS = Number(process.env.SEEDS_N || (argv.includes('--seeds') ? argv[argv.indexOf('--seeds') + 1] : 30));
const SEEDS = Array.from({ length: N_SEEDS }, (_, i) => i + 1);
const STAGES = [1, 2, 3, 4, 5, 6, 7];
const MAX_ROUND = CONFIG.MAX_ROUND || 35;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// 递归收集 fact（顶层 + attack-group data.entries 嵌套层 —— 与死字段扫描器同口径，LEECH 声明在嵌套层）
function* walkFacts(nodes) {
    for (const n of (nodes || [])) {
        if (!n || typeof n !== 'object') continue;
        if (n.factType) yield n;
        const inner = (n.data && Array.isArray(n.data.entries)) ? n.data.entries
            : (Array.isArray(n.entries) ? n.entries : null);
        if (inner) yield* walkFacts(inner);
    }
}

// 读取某目录下所有 .js 文件内容（用于发射点/引用计数）
function readDirFiles(dir) {
    let files = [];
    try { files = readdirSync(dir); } catch { return []; }
    const out = [];
    for (const f of files) {
        if (!f.endsWith('.js')) continue;
        try { out.push({ p: join(dir, f), txt: readFileSync(join(dir, f), 'utf8') }); } catch {}
    }
    return out;
}
function countHits(files, re) {
    let n = 0;
    for (const f of files) { const m = f.txt.match(new RegExp(re.source, 'g')); if (m) n += m.length; }
    return n;
}
// 引擎发射点：core/ + modules/ 里 `FACT_TYPES.KEY` 出现次数（emit 区）
function engineEmitSites(key) {
    const eng = readDirFiles(join(root, 'core')).concat(readDirFiles(join(root, 'modules')));
    return countHits(eng, new RegExp('FACT_TYPES\\.' + key + '\\b'));
}
// 渲染注册引用：render/ 里 FACT_TYPES.KEY 或 registerFactRenderer(FACT_TYPES.KEY
function renderRefs(key) {
    const r = readDirFiles(join(root, 'render'));
    return countHits(r, new RegExp('FACT_TYPES\\.' + key + '\\b'));
}
// 规则/契约引用：health-rules 里 FACT_TYPES.KEY 或裸 'KEY'
function ruleRefs(key) {
    const rs = readDirFiles(join(root, 'tests', 'health-rules'));
    let n = countHits(rs, new RegExp('FACT_TYPES\\.' + key + '\\b'));
    const bare = countHits(rs, new RegExp("'" + key + "'", 'g'));
    return n + bare;
}

async function main() {
    await import('../modules/25elite-imperial.js');
    await import('../modules/26elite-sixsects.js');
    await import('../modules/27elite-mingjiao.js');
    await import('../modules/30custom-effects.js');
    await loadGameData();

    const ftCount = new Map();   // factType -> 出现次数（含嵌套）
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
                        ftCount.set(f.factType, (ftCount.get(f.factType) || 0) + 1);
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

    const emitKeys = new Set(ftCount.keys());           // 已发射的 factType 值（camelCase，如 'clawExecute'）
    const enumKeys = Object.keys(FACT_TYPES);           // 枚举键（UPPER_SNAKE，如 'CLAW_EXECUTE'）
    const valToKey = {};                                // 值 -> 键 反查
    for (const k of enumKeys) valToKey[FACT_TYPES[k]] = k;

    // ① 死 factType：枚举有定义（值未在实际发射集合里），且全库引擎零发射点
    const deadEnum = [], rareEnum = [];
    for (const k of enumKeys) {
        if (emitKeys.has(FACT_TYPES[k])) continue;       // 该 factType 值实际发射过 → 非死
        const sites = engineEmitSites(k);                 // 按枚举键查发射点（FACT_TYPES.K）
        if (sites === 0) deadEnum.push(k);
        else rareEnum.push({ k, sites });
    }

    // ② 盲区候选：实际发射，但既非「58 声明静默」(renderFn:false) 又无渲染注册、无规则引用。
    //   FACT_SPECS 以 factType 值(如 'auraApply')为键；renderFn 为假 = 58 显式声明"无渲染"——by design 静默
    //   （效果走光环/单位状态显示，不单列战报行），不计入盲区。
    const blind = [], silent = [];
    for (const [v, n] of [...ftCount.entries()].sort((a, b) => b[1] - a[1])) {
        const spec = FACT_SPECS[v];
        if (spec && !spec.renderFn) { silent.push({ k: v, n }); continue; }
        const k = valToKey[v] || v;
        const rr = renderRefs(k), rl = ruleRefs(k);
        if (rr === 0 && rl === 0) blind.push({ k: v, n });
    }

    const out = {
        ver: VER, generatedAt: new Date().toISOString(),
        sample: { battles, facts, seeds: SEEDS.length, stages: STAGES.length },
        emittedFactTypes: [...ftCount.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n })),
        deadEnumFactTypes: deadEnum,            // 真·死枚举项（枚举有定义、零发射点）
        rareEnumFactTypes: rareEnum,            // 有发射点但样本未触发（稀有/需定向）
        blindSpotCandidates: blind,             // 实际发射 + 非声明静默 + 无渲染注册 + 无规则引用（候选）
        silentByDesign: silent,                 // 58 renderFn:false，by design 不单列战报行
        note: '诊断工具恒 EXIT 0：deadEnum 为可靠红线候选（引擎零发射点）；blindSpot 为候选（规则按 data 字段消费时会漏计），须定向用例兜底'
    };
    if (JSON_ONLY) { console.log(JSON.stringify(out, null, 2)); return 0; }

    console.log('=== 样本驱动 fact 发射普查 ' + VER + ' ===');
    console.log(`样本：${battles} 场 / ${facts} 条 fact / ${SEEDS.length} seeds×${STAGES.length} stages`);
    console.log(`枚举 factType 总数：${enumKeys.length}，样本实际发射：${emitKeys.size}`);
    console.log(`\n--- ① 死枚举项（枚举有定义、全库零发射点，可靠红线候选）：${deadEnum.length} 条 ---`);
    for (const k of deadEnum) console.log('  ⚠ ' + k);
    if (!deadEnum.length) console.log('  （无）');
    console.log(`\n--- ② 稀有枚举项（有发射点但样本未触发）：${rareEnum.length} 条 ---`);
    for (const r of rareEnum.slice(0, 15)) console.log('  · ' + r.k + '  引擎发射点 ' + r.sites);
    console.log(`\n--- ③ 盲区候选（实际发射 + 非声明静默 + 无渲染注册 + 无规则引用）：${blind.length} 条 ---`);
    for (const b of blind) console.log('  ? ' + b.k + '  样本 ' + b.n + ' 次');
    if (!blind.length) console.log('  （无 —— 所有实际发射的 fact 要么有渲染、要么 58 声明静默、要么被规则盯梢）');
    console.log(`--- ④ 声明静默 fact（58 renderFn:false，by design 不单列战报行）：${silent.length} 条 ---`);
    for (const s of silent.slice(0, 12)) console.log('  · ' + s.k + '  样本 ' + s.n + ' 次');
    console.log(`\n--- 实际发射 factType 计数（Top）---`);
    let i = 0;
    for (const [k, n] of [...ftCount.entries()].sort((a, b) => b[1] - a[1])) {
        if (i++ >= 20) break;
        console.log('  ' + String(n).padStart(5) + '  ' + k);
    }
    return 0;
}

main().then(c => process.exit(c || 0)).catch(e => { console.error(e); process.exit(1); });
