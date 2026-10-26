// tests/fact-emission-census.mjs V1.3.0
// V1.3.0 | 2026-10-27 夜间第 143 轮：接公共取样判定器 —— 本普查是**样本驱动**的，而此前它连
//   「样本还在不在」都不判：对局跑崩 / SEEDS 被调小 ⇒ battles 塌到个位，emitKeys 随之稀，
//   于是 ① 死枚举会暴涨（把"这次没跑到"判成"引擎根本不发"，假红一串），③ 盲区候选会归零并
//   打一句"所有实际发射的 fact 都有人盯"（无罪结论冒充绿）。本轮补两件事：
//     · 规模闸门（battles / facts 各一道）+ 取样不足档：走 tests/_lib/sample-sufficiency.mjs，
//       与对照器守卫、契约绑定共用同一份口径，不另写一份；
//     · 区分两类结论：deadEnum / orphanSpec / contractGaps 均带「全库零发射点 / 实发漏字段」
//       这类**查到了**的静态证据，属有罪证据 —— 取样再薄也照判，不豁免；
//       blind（盲区候选）是「没查到」类，取样不足时一律转「不成立」，不许它冒充"零盲区"。
//   退码：规模闸门命中即与契约腐烂红同列（return 1），绝不因样本塌了而静默放行。
// ───────────────────────────────────────────────────────────────────────────
// 样本驱动 fact 发射普查（第 124 轮·C → 第 125 轮扩为「契约腐烂检测器」）：
//   替代此前站不住的「静态 fact-coverage 检查器」，并新增 spec rot（规约腐烂）检测。
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
//
// 第 125 轮新增 ⑤ spec rot（规约腐烂）：
//   FACT_SPECS 以 factType 值(如 'clawExecute')为键，声明 renderFn:true 表示"引擎应当发射、渲染器必接"。
//   若某 spec 键【从不被发射】且【引擎零发射点】→ 规约腐烂：契约承诺了渲染却永远产不出 = 渲染死代码。
//   这正是此前被漏掉的腐烂形态（enum 没删、spec 留着、render 函数空转）。可靠红线候选。
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
import { judgeSample, checkThreshold, selfCheck } from './_lib/sample-sufficiency.mjs';

const VER = 'tests/fact-emission-census.mjs V1.3.0';

// 取样规模闸门（2026-10-27 夜间第 143 轮新增）。实测基准：210 场 / 101869 条 fact（30 seeds × 7 stages）。
//   下限取实测的约六到八成（对局 180 / fact 60000），薄线由公共件按一半推出（90 场 / 30000 条）。
//   ★ 为什么不设成"只要跑过就算"：SEEDS 是可调参数，SEEDS=1 也能跑完并给出一份"零死枚举、
//   零盲区"的漂亮报告 —— 那正是第 142 轮点名的"只查了 3 条就说 56 条都没问题"。
const MIN_BATTLES = 180;
const MIN_FACTS = 60000;
const argv = process.argv.slice(2);
const JSON_ONLY = argv.includes('--json');
const N_SEEDS = Number(process.env.SEEDS_N || (argv.includes('--seeds') ? argv[argv.indexOf('--seeds') + 1] : 30));
const SEEDS = Array.from({ length: N_SEEDS }, (_, i) => i + 1);
const STAGES = [1, 2, 3, 4, 5, 6, 7];
const MAX_ROUND = CONFIG.MAX_ROUND || 35;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// 必填字段存在性：合同上 requiredFields 是「渲染/特效必须读到」的字段（infra/58 注释），漏了会静默吞或 TypeError。
// 命中口径放宽到 fact 节点及其 data 子对象两层（部分 fact 把字段收在 data 内），任一层有值即算齐。
function hasField(fact, rf) {
    if (fact[rf] !== undefined) return true;
    if (fact.data && fact.data[rf] !== undefined) return true;
    return false;
}

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
    const contractGaps = new Map(); // factType -> Map(必填字段 -> 缺失次数)
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
                        // ⑥ 契约必填字段完整性：引擎发了 fact 却漏了 FACT_SPECS.requiredFields 里的字段
                        //    → 渲染器读到 undefined 静默吞或 TypeError（infra/58 注释明示的失效形态）。此前无守门项抓。
                        const spec = FACT_SPECS[f.factType];
                        if (spec && Array.isArray(spec.requiredFields)) {
                            for (const rf of spec.requiredFields) {
                                if (!hasField(f, rf)) {
                                    if (!contractGaps.has(f.factType)) contractGaps.set(f.factType, new Map());
                                    const g = contractGaps.get(f.factType);
                                    g.set(rf, (g.get(rf) || 0) + 1);
                                }
                            }
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

    // ⑤ spec rot（规约腐烂）：FACT_SPECS 声明 renderFn:true（"引擎应发射、渲染必接"）却从未实际发射。
    //   分两类：零引擎发射点 = 真腐烂（渲染死代码，可靠红）；有发射点但样本未触发 = 稀有/需定向（同 rareEnum 口径）。
    //   另记 renderFn:false 且零发射点 = 全死规约（无渲染无发射，完全僵尸），单列提示不进红。
    const orphanSpec = [], rareSpec = [], deadSilentSpec = [];
    for (const v of Object.keys(FACT_SPECS)) {
        if (emitKeys.has(v)) continue;                  // 实际发射过 → 非腐烂
        const spec = FACT_SPECS[v];
        const k = valToKey[v] || v;                     // 值→枚举键反查（僵尸 spec 可能连枚举键都没了）
        const sites = engineEmitSites(k);
        if (spec && spec.renderFn === false) {
            if (sites === 0) deadSilentSpec.push(v);    // 无渲染且零发射 = 纯僵尸规约
            continue;                                   // 设计静默 + 有发射点 = 仅样本未触发，不报
        }
        if (sites === 0) orphanSpec.push(v);            // 承诺渲染却零发射点 = 真腐烂（可靠红）
        else rareSpec.push({ v, sites });               // 有发射点但样本未触发
    }

    // 取样充分性（第 143 轮新增，走公共件）：两道闸门各判一档，任一不足即整体「取样不足」。
    const SAMPLE_B = judgeSample({
        count: battles, floor: MIN_BATTLES, unit: '场', mode: 'floor', source: '样本对局'
    });
    const SAMPLE_F = judgeSample({
        count: facts, floor: MIN_FACTS, unit: '条 fact', mode: 'floor', source: 'fact 收集器'
    });
    const SAMPLE_INSUFFICIENT = SAMPLE_B.insufficient || SAMPLE_F.insufficient;
    const sampleFails = [];
    for (const s of [SAMPLE_B, SAMPLE_F]) {
        const bad = checkThreshold(s);
        if (bad) sampleFails.push('取样门槛自证：' + bad);
    }
    for (const bad of selfCheck()) sampleFails.push('取样公共件自证：' + bad);
    if (SAMPLE_B.insufficient) {
        sampleFails.push(`样本规模闸门：${SAMPLE_B.detail}`
            + ' —— 取样不足时「没查到」一律不成立，不得冒充"零盲区"；'
            + '本普查的死枚举/死规约两栏也会因样本没跑到而失真，先恢复样本规模再看结论');
    }
    if (SAMPLE_F.insufficient) {
        sampleFails.push(`fact 规模闸门：${SAMPLE_F.detail}`
            + ' —— fact 收集面塌了（walkFacts 失配或对局未推进），本普查结论不可信');
    }

    const out = {
        ver: VER, generatedAt: new Date().toISOString(),
        sample: { battles, facts, seeds: SEEDS.length, stages: STAGES.length },
        sampleGate: {
            battles: SAMPLE_B, facts: SAMPLE_F, insufficient: SAMPLE_INSUFFICIENT, fails: sampleFails
        },
        emittedFactTypes: [...ftCount.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n })),
        deadEnumFactTypes: deadEnum,            // 真·死枚举项（枚举有定义、零发射点）
        rareEnumFactTypes: rareEnum,            // 有发射点但样本未触发（稀有/需定向）
        blindSpotCandidates: blind,             // 实际发射 + 非声明静默 + 无渲染注册 + 无规则引用（候选）
        silentByDesign: silent,                 // 58 renderFn:false，by design 不单列战报行
        orphanSpecFactTypes: orphanSpec,        // ⑤ spec rot：spec 声明 renderFn:true 却零发射点（可靠红线候选）
        rareSpecFactTypes: rareSpec,            // spec 有发射点但样本未触发（稀有待定向）
        deadSilentSpecFactTypes: deadSilentSpec,// renderFn:false 且零发射点（纯僵尸规约，提示）
        contractFieldGaps: [...contractGaps.entries()].map(([k, m]) => ({ k, missing: [...m.entries()].map(([rf, n]) => ({ rf, n })) })),
        note: '诊断工具恒 EXIT 0：deadEnum / orphanSpec 为可靠红线候选（引擎零发射点）；blindSpot 为候选（规则按 data 字段消费时会漏计），须定向用例兜底'
    };
    // JSON_ONLY 同样计取样闸门：机器消费方拿到一份"样本塌了"的 JSON 却 exit 0，比人类报告更危险。
    if (JSON_ONLY) {
        console.log(JSON.stringify(out, null, 2));
        return (deadEnum.length + orphanSpec.length + sampleFails.length > 0) ? 1 : 0;
    }

    console.log('=== 样本驱动 fact 发射普查 ' + VER + ' ===');
    console.log(`样本：${battles} 场 / ${facts} 条 fact / ${SEEDS.length} seeds×${STAGES.length} stages`);
    console.log(`取样档位：对局 ${SAMPLE_B.state}（薄线 ${SAMPLE_B.thin} 场）· fact ${SAMPLE_F.state}（薄线 ${SAMPLE_F.thin} 条）`
        + (SAMPLE_INSUFFICIENT ? ' ⇒ **取样不足**：下列「没查到」类结论一律标「不成立」' : ' ⇒ 取样充分'));
    console.log(`枚举 factType 总数：${enumKeys.length}，样本实际发射：${emitKeys.size}`);
    console.log(`\n--- ① 死枚举项（枚举有定义、全库零发射点，可靠红线候选）：${deadEnum.length} 条 ---`);
    // 有罪证据说明（第 143 轮）：本栏判据是「全库零发射点」这一**静态**信号，不是"这次样本没跑到"，
    //   故取样再薄也照判（不受取样量影响）；反过来，取样塌了会让 ② 稀有栏虚增，那栏才是受取样影响的。
    if (SAMPLE_INSUFFICIENT) {
        console.log('  ※ 取样不足（' + SAMPLE_B.detail + '）：本栏不受影响（判据是静态零发射点），'
            + '但 ② 稀有栏会因样本没跑到而虚增，勿据此去改引擎');
    }
    for (const k of deadEnum) console.log('  ⚠ ' + k);
    if (!deadEnum.length) console.log('  （无）');
    console.log(`\n--- ② 稀有枚举项（有发射点但样本未触发）：${rareEnum.length} 条 ---`);
    for (const r of rareEnum.slice(0, 15)) console.log('  · ' + r.k + '  引擎发射点 ' + r.sites);
    console.log(`\n--- ③ 盲区候选（实际发射 + 非声明静默 + 无渲染注册 + 无规则引用）：${blind.length} 条 ---`);
    for (const b of blind) console.log('  ? ' + b.k + '  样本 ' + b.n + ' 次');
    if (!blind.length && SAMPLE_INSUFFICIENT) {
        // 第 143 轮收口：「零盲区」是**没查到**，不是查过没有 —— 取样不足时它不许冒充绿。
        console.log('  （不成立 —— 取样不足（' + SAMPLE_B.detail + '、' + SAMPLE_F.detail + '），'
            + '没查到盲区 ≠ 没有盲区：只跑了这么点样本，剩下的 fact 根本没进本次普查，'
            + '此栏此刻既不计绿也不计红；先恢复样本规模再谈"零盲区"）');
    } else if (!blind.length) {
        console.log('  （无 —— 所有实际发射的 fact 要么有渲染、要么 58 声明静默、要么被规则盯梢）');
    }
    console.log(`--- ④ 声明静默 fact（58 renderFn:false，by design 不单列战报行）：${silent.length} 条 ---`);
    for (const s of silent.slice(0, 12)) console.log('  · ' + s.k + '  样本 ' + s.n + ' 次');
    console.log(`\n--- ⑤ spec rot（FACT_SPECS 声明 renderFn:true 却从未发射）：${orphanSpec.length} 条 ---`);
    for (const v of orphanSpec) console.log('  ⚠ ' + v + '  （规约承诺渲染但引擎零发射点 = 渲染死代码）');
    if (!orphanSpec.length) console.log('  （无 —— 所有声明渲染的 fact 都实际发射过）');
    console.log(`--- ⑤b 稀有 spec（有发射点但样本未触发）：${rareSpec.length} 条 ---`);
    for (const r of rareSpec.slice(0, 15)) console.log('  · ' + r.v + '  引擎发射点 ' + r.sites);
    if (deadSilentSpec.length) {
        console.log(`--- ⑤c 纯僵尸规约（renderFn:false 且零发射点）：${deadSilentSpec.length} 条 ---`);
        for (const v of deadSilentSpec) console.log('  · ' + v + '  （无渲染无发射，纯死代码，建议删 spec）');
    }
    console.log(`\n--- ⑥ 契约必填字段完整性（引擎发射却漏 requiredFields，可靠红）：${contractGaps.size} 个 factType 命中 ---`);
    for (const [k, m] of contractGaps) {
        const miss = [...m.entries()].map(([rf, n]) => rf + '×' + n).join('、');
        console.log('  ⚠ ' + k + '  缺失 ' + miss);
    }
    if (!contractGaps.size) console.log('  （无 —— 所有实际发射的 fact 都带齐了契约必填字段）');
    console.log(`\n--- 实际发射 factType 计数（Top）---`);
    let i = 0;
    for (const [k, n] of [...ftCount.entries()].sort((a, b) => b[1] - a[1])) {
        if (i++ >= 20) break;
        console.log('  ' + String(n).padStart(5) + '  ' + k);
    }
    // 守门：仅「零发射点」的可靠红（deadEnum + orphanSpec）与「必填字段漏发」的契约失效（contractFieldGaps）
    // 拦构建；rare/silent/blind 仅诊断不拦。
    // ★ 第 143 轮加第三类：取样规模闸门（sampleFails）—— 样本塌了还照出漂亮报告是最危险的一种假绿。
    const rot = deadEnum.length + orphanSpec.length + contractGaps.size;
    if (sampleFails.length) {
        console.log('\n⛔ 取样规模红线（' + sampleFails.length + ' 项）：');
        for (const s of sampleFails) console.log('  ❌ ' + s);
    }
    if (rot > 0) {
        const parts = [];
        if (deadEnum.length) parts.push(deadEnum.length + ' 死枚举');
        if (orphanSpec.length) parts.push(orphanSpec.length + ' 死规约');
        if (contractGaps.size) parts.push(contractGaps.size + ' factType 漏发必填字段');
        console.log('\n⛔ 契约腐烂红线：' + parts.join(' + ') + ' —— 须清理对应枚举键 / 规约条目 / 补发必填字段后重跑');
    }
    return (rot > 0 || sampleFails.length > 0) ? 1 : 0;
}

main().then(c => process.exit(c || 0)).catch(e => { console.error(e); process.exit(1); });
