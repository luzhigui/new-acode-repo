// tests/isdead-fix-guard.mjs V1.0.0
// ───────────────────────────────────────────────────────────────────────────
// isDead 修复回归护栏（第 125 轮·A 落地闭环）：
//
// 背景：A 转交块的 5 处 isDead 改动已落主代码——蛛袭/玄冥毒由「恒 false 的 !alive」改为
//   正确的「target.hp<=0 / (u.hp-dot)<=0」，新婚/蝶变宿主死删掉无死亡语义的死字段。
//   修复前 isDead 永远为 false（发射点死亡结算未落地），蛛袭 💀击杀 文字与击杀统计从不出现。
//
// 本护栏锁定「修复活着」这条不变量，防回归：
//   ① 门禁（硬）：样本内 SPIDER_STRIKE / XUAN_MING_DOT 出现 isDead===true 的命中数 ≥ MIN_HITS。
//      —— 若有人把 isDead 改回 `!target.alive`（恒 false），命中数归零 ⇒ 立刻红。
//   ② 诊断（软，仅告警）：每个 isDead===true 的目标 uid，在战斗结束时必须确为死亡态
//      （alive=false 或 state._isDead）。若不匹配 = 可能是「飞天免疫却预测致死」的边界误判
//      （见 A 转交块提醒），打印明细供人工研判，但不拦门（避免低概率边界导致套件抖动）。
//
// 复用 fact-emission-census.mjs 的引擎驱动循环（core/11 + modules/29battle-init + _lib/buff-picker）。
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

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG, loadGameData, loadHexEnhanceData } from '../core/01config-5v5-test.js';
import { SeededRNG } from '../infra/51-core-utils.js';
import { createRoundStepper } from '../core/11battle-round.js';
import { initBattleTeams } from '../modules/29battle-init.js';
import { tickAndPickBuffs } from './_lib/buff-picker.mjs';
import { FACT_TYPES } from '../infra/56-battle-enums.js';

const VER = 'tests/isdead-fix-guard.mjs V1.0.0';
const argv = process.argv.slice(2);
const N_SEEDS = Number(process.env.SEEDS_N || (argv.includes('--seeds') ? argv[argv.indexOf('--seeds') + 1] : 30));
const SEEDS = Array.from({ length: N_SEEDS }, (_, i) => i + 1);
const STAGES = [1, 2, 3, 4, 5, 6, 7];
const MIN_HITS = Number(process.env.MIN_HITS || (argv.includes('--min') ? argv[argv.indexOf('--min') + 1] : 2));
const MAX_ROUND = CONFIG.MAX_ROUND || 35;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = [FACT_TYPES.SPIDER_STRIKE, FACT_TYPES.XUAN_MING_DOT];

// 递归收集 fact（顶层 + attack-group data.entries 嵌套层，与死字段扫描器同口径）
function* walkFacts(nodes) {
    for (const n of (nodes || [])) {
        if (!n || typeof n !== 'object') continue;
        if (n.factType) yield n;
        const inner = (n.data && Array.isArray(n.data.entries)) ? n.data.entries
            : (Array.isArray(n.entries) ? n.entries : null);
        if (inner) yield* walkFacts(inner);
    }
}

function uidOf(fact) {
    return fact.factType === FACT_TYPES.SPIDER_STRIKE ? fact.data.targetUid : fact.data.uidD;
}

async function main() {
    await import('../modules/20elite-skills.js');
    await import('../modules/25elite-imperial.js');
    await import('../modules/26elite-sixsects.js');
    await import('../modules/27elite-mingjiao.js');
    await import('../modules/30custom-effects.js');
    await loadGameData();
    // 第 162 轮：上游把小昭.hexEnhance 整段迁到 content/201hex-enhance.json，启动链必须一并 loadHexEnhanceData（缺口由 tests/hex-boot-chain-guard.mjs 点名）
    await loadHexEnhanceData();

    const trueHits = [];                 // isDead===true 的命中明细
    const deadUids = new Set();          // 跨所有 step 累积的死亡 uid（一旦死即记）
    let battles = 0, scanned = 0;

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
            let winner = null, lastStep = null;
            while (battleState.round <= MAX_ROUND) {
                const stepper = createRoundStepper(battleState);
                for (const step of stepper) {
                    lastStep = step;
                    for (const u of (step.ally || []).concat(step.enemy || [])) {
                        if (!u.alive || (u.state && u.state._isDead)) deadUids.add(u.uid);
                    }
                    for (const f of walkFacts(step.log)) {
                        if (!TYPES.includes(f.factType)) continue;
                        scanned++;
                        if (f.data && f.data.isDead === true) {
                            trueHits.push({ type: f.factType, uid: uidOf(f), seed, stage, round: battleState.round });
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

    // ② 诊断：isDead===true 但目标在战斗结束时仍存活 = 疑似误判（如飞天免疫）
    const mismatch = trueHits.filter(h => !deadUids.has(h.uid));

    const trueCount = trueHits.length;
    const byType = {};
    for (const h of trueHits) byType[h.type] = (byType[h.type] || 0) + 1;

    console.log(`[${VER}] 样本 ${battles} 场 / 扫描 ${scanned} 条蛛袭·寒毒事实`);
    console.log(`  isDead===true 命中：${trueCount}（下限 MIN_HITS=${MIN_HITS}） ` +
        `蛛袭=${byType[FACT_TYPES.SPIDER_STRIKE] || 0} 寒毒=${byType[FACT_TYPES.XUAN_MING_DOT] || 0}`);

    if (mismatch.length > 0) {
        console.log(`  ⚠ 诊断告警：isDead===true 但目标未死亡 ${mismatch.length} 例（疑似飞天免疫误判边界）：`);
        for (const m of mismatch.slice(0, 5)) {
            console.log(`    - ${(m.type === FACT_TYPES.SPIDER_STRIKE ? '蛛袭' : '寒毒')} seed=${m.seed} stage=${m.stage} r${m.round} uid=${m.uid}`);
        }
    } else {
        console.log('  ✅ 诊断：所有 isDead===true 的目标确认死亡态，无误判');
    }

    // ① 门禁：修复必须活着（命中数达标）
    if (trueCount < MIN_HITS) {
        console.log(`RESULT: isDead回归 真值命中${trueCount} < 下限${MIN_HITS}（修复可能已退回恒false）`);
        process.exit(1);
    }
    console.log(`RESULT: isDead修复护栏通过 真值命中${trueCount} ≥ 下限${MIN_HITS}（蛛袭${byType[FACT_TYPES.SPIDER_STRIKE] || 0}/寒毒${byType[FACT_TYPES.XUAN_MING_DOT] || 0}）`);
    process.exit(0);
}

main().catch(e => { console.error('护栏运行异常:', e); process.exit(2); });
