// tests/isdead-fix-guard.mjs V1.0.5 | 2026-11-20 第191轮（豆包体检会话）：移植夜间第243轮 exit=2 证据块（首个栈落点进结论行），保留 V1.0.4 EventBus 陷阱判红与 #9 脏树守卫；判据/门禁一字未动。
// tests/isdead-fix-guard.mjs V1.0.4 | 2026-11-19 第30轮：引擎信号处理抛错必须判红——
//   挂 _lib/eventbus-error-guard 陷阱；实测本护栏在 core/216:271 `ReferenceError: A is not defined` 时仍判 ✅
//   （异常被 EventBus try/catch 吞掉，只 console.error），样本可信度被高估。MIN_HITS 与门禁/诊断口径一字未动。
// tests/isdead-fix-guard.mjs V1.0.2 | 2026-11-08 体检迭代：删掉 helper 之前重复手抄装配 302
//   （总入口 301 已装载，装配收口守门 V1.0.2 当场点名）；功能代码与判据一字未动。
// tests/isdead-fix-guard.mjs V1.0.1 （第 164 轮：fact 采集补 data.phantomFact 层 —— 幻影 fact 与 data.entries 并列、不在 entries 里，原两层口径对它恒不可见；只补视野、不缩面、不改判据）
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
import { CONFIG, loadGameData, loadHexEnhanceData } from '../core/201-config-5v5-test.js';
import { SeededRNG } from '../infra/102-core-utils.js';
import { createRoundStepper } from '../core/210-battle-round.js';
import { initBattleTeams } from '../modules/330-battle-init.js';
import { tickAndPickBuffs } from './_lib/buff-picker.mjs';
import { installEventBusErrorTrap, formatEventBusErrors } from './_lib/eventbus-error-guard.mjs';
import { FACT_TYPES } from '../infra/106-battle-enums.js';

const VER = 'tests/isdead-fix-guard.mjs V1.0.5';
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

        // ★ 第 164 轮补层：幻影类 fact 挂在 data.phantomFact，与 data.entries 并列**而不在 entries 里**
        //   ⇒ 只扫 entries 的写法对它恒不可见（第 163 轮在 census / rules-replay 里已实锤）
        if (n.data && n.data.phantomFact) yield* walkFacts([n.data.phantomFact]);
        const inner = (n.data && Array.isArray(n.data.entries)) ? n.data.entries
            : (Array.isArray(n.entries) ? n.entries : null);
        if (inner) yield* walkFacts(inner);
    }
}

function uidOf(fact) {
    return fact.factType === FACT_TYPES.SPIDER_STRIKE ? fact.data.targetUid : fact.data.uidD;
}

async function main() {
    await import('./_lib/install-mechanics.mjs');
    await loadGameData();
    // 第 162 轮：上游把小昭.hexEnhance 整段迁到 content/002-hex-enhance.json，启动链必须一并 loadHexEnhanceData（缺口由 tests/hex-boot-chain-guard.mjs 点名）
    await loadHexEnhanceData();

    const busTrap = installEventBusErrorTrap();   // 第30轮：捞被 EventBus 吞掉的监听器异常
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
    // 第30轮：引擎级异常优先报红——异常被吞掉时下面的命中数/诊断都不可信
    const busErrs = busTrap.drain();
    if (busErrs.length) {
        console.log(formatEventBusErrors(busErrs));
        console.log(`RESULT: isDead护栏 引擎信号处理抛错${busErrs.length}次（异常被 EventBus 吞掉，样本结论不可信）`);
        process.exit(1);
    }

    if (trueCount < MIN_HITS) {
        console.log(`RESULT: isDead回归 真值命中${trueCount} < 下限${MIN_HITS}（修复可能已退回恒false）`);
        process.exit(1);
    }
    console.log(`RESULT: isDead修复护栏通过 真值命中${trueCount} ≥ 下限${MIN_HITS}（蛛袭${byType[FACT_TYPES.SPIDER_STRIKE] || 0}/寒毒${byType[FACT_TYPES.XUAN_MING_DOT] || 0}）`);
    process.exit(0);
}

// V1.0.5（第191轮移植夜间第243轮）：exit=2 的证据要活到汇总层。
//   病：run-all 的 pickKeyLine 只取一行且截 100 字，栈帧行（"    at …"）不含负向关键词被丢弃
//   ⇒ 汇总层只看到「护栏运行异常」，不知道挂在哪个文件哪一行。
//   修法：把首个栈落点压进结论行（@ x.js:行:列），message 压单行、栈尾 6 行打进证据块。
//   ★ 纯呈现：退码仍 2；#9 脏树守卫与第30轮 EventBus 陷阱判红全部保留，一字未动。
main().catch(e => {
    const msg = (e && e.message) ? String(e.message) : String(e);
    const msgOne = msg.replace(/\s*\r?\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
    const stackLines = String((e && e.stack) || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const firstFrame = stackLines.find(l => /^at\s/.test(l)) || '';
    const frameShort = (firstFrame.match(/([\w.-]+\.js:\d+:\d+)/) || [])[1]
        || (firstFrame ? firstFrame.replace(/^at\s+/, '').slice(0, 40) : '无栈帧（非 Error 抛出）');
    console.error('护栏运行异常:', e);
    console.error('   ↳ 证据块（message + 栈尾 6 行，相邻重复行已折叠）：');
    console.error('    ' + msgOne.slice(0, 200));
    const tail = [];
    for (const l of stackLines.slice(-6)) {
        if (tail.length && tail[tail.length - 1] === l) continue;
        tail.push(l);
    }
    if (tail.length) console.error(tail.map(l => '    ' + l.slice(0, 200)).join('\n'));
    // 落点放前面：run-all 只留 100 字，长 message 会把落点顶出窗口。
    console.error(`RESULT: isDead护栏异常(exit=2) @ ${frameShort.slice(0, 30)} ${msgOne.slice(0, 40)}`);
    process.exit(2);
});
