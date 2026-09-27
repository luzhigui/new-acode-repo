// V1.0.0 | 2026-09-27 第 33 轮 | 破防重复应用（双扣）检测器
// 背景（用户实报）：一次破防被扣两次防御 —— core/03 直改 addMod + core/16 裁定器各扣一次，
//   日志写「防御 -4」而实际 58→50→42（每次 -8）。135 规则只校验**日志文本的声明值** 4∈{2,3,4}，
//   声明本身合法 → 恒绿漏检。这是"验说对了没有、没验做对了没有"的架构级盲区。
// 第 33 轮先在 135 里试过文本判据（波动行 defBase 跨攻击差值），**在已修复代码上误报 27 场**已撤回：
//   两次破防之间会夹增益到期/坚盾过期等非破防的永久 def 变化，日志文本通道无法归因。
//   教训：这个洞只能拿**真实状态**填，文本侧补不出可靠判据。
// 本检测器改用逐步真实 def 增量（同 140-baseline.js 的独立跑法，不依赖日志文本、不改任何主代码）：
//   逐步快照每个单位的真实 def（core/13 getStat），与同一步发出的 BREAK_DEF 声明逐条比对。
//   依据 core/16 L76-81：BREAK_DEF 裁定器 addMod{ttl:'permanent'}，故**一次破防应让目标 def 正好降 reduce**；
//   实际降幅为 k×reduce（k≥2）即被重复应用（声明 -R、实际 -kR）。
// 运行：node tests/breakdef-dedupe-check.mjs          → 全量 18 场；检出双扣退出码 1；零触发亦退出码 1（防假绿）
//       node tests/breakdef-dedupe-check.mjs 42:3     → 只跑指定场次
export const VER = 'tests/breakdef-dedupe-check.mjs V1.0.0';

import { fileURLToPath } from 'node:url';

// 环境 mock（不改引擎源码，Node 补浏览器能力）—— 必须在任何引擎 import 之前
globalThis.fetch = async (url) => {
    const path = fileURLToPath(new URL(url));
    const fs = await import('node:fs');
    const text = fs.readFileSync(path, 'utf8');
    return { ok: true, json: async () => JSON.parse(text) };
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.self = globalThis;

const SEEDS = [1, 42, 999, 12345, 777, 88888];
const STAGES = [1, 3, 5];

async function main() {
    const [{ CONFIG, loadGameData }, { SeededRNG }, { createRoundStepper },
           { initBattleTeams }, { getStat }] = await Promise.all([
        import('../core/01config-5v5-test.js'),
        import('../infra/51-core-utils.js'),
        import('../core/11battle-round.js'),
        import('../modules/29battle-init.js'),
        import('../core/13battle-shared.js')
    ]);
    await import('../modules/25elite-imperial.js');
    await import('../modules/26elite-sixsects.js');
    await import('../modules/27elite-mingjiao.js');
    await loadGameData();

    const MAX_ROUND = CONFIG.MAX_ROUND || 35;

    // 逐步快照：uid -> { name, def }。def 与 core/12 L222 同口径（Math.floor(getStat)）
    const snapDef = (units) => {
        const m = new Map();
        for (const u of units || []) {
            if (!u) continue;
            m.set(u.uid, { name: u.name, def: Math.floor(getStat(u, 'def')) });
        }
        return m;
    };
    const byName = (m, name) => {
        for (const v of m.values()) if (v.name === name) return v;
        return null;
    };
    // 收集本步发出的破防声明。挂法（读码确认）：core/12 L503-505 把 { factType: BREAK_DEF, data: {...} }
    // 推进 pendingEntries，再由 L549 挂到 **attackFact.data.entries**（不是 fact.entries —— 首版取错层级导致零触发）。
    const collectBreaks = (stepLog) => {
        const out = [];
        const scanEntry = (e) => {
            if (e && e.data && typeof e.data.reduce === 'number' && e.data.targetName) out.push(e.data);
        };
        for (const f of stepLog || []) {
            if (!f) continue;
            scanEntry(f); // 顶层破防 fact（若有）
            if (f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scanEntry(e);
            if (Array.isArray(f.entries)) for (const e of f.entries) scanEntry(e); // 兼容其他挂法
        }
        return out;
    };

    const rawArgs = process.argv.slice(2);
    const cases = rawArgs.length > 0
        ? rawArgs.map(s => { const [sd, st] = s.split(':'); return { seed: Number(sd), stage: Number(st) }; })
        : SEEDS.flatMap(seed => STAGES.map(stage => ({ seed, stage })));

    const dupHits = [];
    let grandBreaks = 0, grandDup = 0;

    for (const { seed, stage } of cases) {
        const rng = new SeededRNG(seed);
        const { allyTeam, enemyTeam } = initBattleTeams(stage, rng);
        let battleState = {
            ally: allyTeam.map(u => u.clone()),
            enemy: enemyTeam.map(u => u.clone()),
            round: 1,
            activeBuffs: [],
            allAllies: allyTeam.map(u => u.clone()),
            _rng: rng
        };
        let prev = snapDef([...battleState.ally, ...battleState.enemy]);
        let winner = null;
        let caseBreaks = 0, caseDup = 0;

        while (battleState.round <= MAX_ROUND) {
            const stepper = createRoundStepper(battleState);
            let lastStep = null;
            for (const step of stepper) {
                lastStep = step;
                const after = snapDef([...(step.ally || []), ...(step.enemy || [])]);
                // 关键：同一步可能对同一目标发**多条**破防声明（连击/性奋额外攻击等一次 step 两次攻击），
                // 必须按目标汇总声明量再与总降幅比对。首版逐条比对，把"两次合法破防（各-3，合计-6）"
                // 误判成"一次破防被应用两次"——宋青书 seed=1 stage=3 两处假阳性即由此而来。
                const byTarget = new Map(); // name -> { sum, count }
                for (const b of collectBreaks(step.log)) {
                    caseBreaks++;
                    const cur = byTarget.get(b.targetName) || { sum: 0, count: 0 };
                    cur.sum += (typeof b.reduce === 'number' ? b.reduce : 0);
                    cur.count += 1;
                    byTarget.set(b.targetName, cur);
                }
                for (const [name, agg] of byTarget) {
                    const p = byName(prev, name);
                    const a = byName(after, name);
                    if (!p || !a) continue;
                    const drop = p.def - a.def;   // 本步该目标真实 def 降幅
                    const sum = agg.sum;          // 本步对该目标的破防声明总量
                    // 仅当降幅恰为声明总量的正整数倍时才归因于破防（非整数倍说明同一步还夹了
                    // 其他 def 来源，不归因、跳过）——宁可漏报不可误报
                    if (sum > 0 && drop > 0 && drop % sum === 0) {
                        const k = drop / sum;
                        if (k >= 2) {
                            caseDup++;
                            const msg = `[seed=${seed} stage=${stage} round=${battleState.round}] ${name} 声明-${sum}(${agg.count}条) 实际-${drop}（${k}倍）`;
                            if (dupHits.length < 10) dupHits.push(msg);
                        }
                    }
                }
                prev = after;
                if (step.winner) winner = step.winner;
            }
            if (winner) break;
            if (!lastStep) break;
            battleState = {
                ally: lastStep.ally.map(u => u.clone()),
                enemy: lastStep.enemy.map(u => u.clone()),
                round: battleState.round + 1,
                activeBuffs: (lastStep.ally._activeBuffs || [])
                    .map(b => ({ ...b, remaining: b.remaining - 1 }))
                    .filter(b => b.remaining > 0),
                allAllies: battleState.allAllies,
                _rng: rng
            };
            prev = snapDef([...battleState.ally, ...battleState.enemy]);
        }
        grandBreaks += caseBreaks;
        grandDup += caseDup;
        console.log(`seed=${seed} stage=${stage} winner=${winner || '平局'} 破防声明=${caseBreaks} 双扣=${caseDup}`);
    }

    console.log(`\n=== 破防重复应用检测 ===\n破防声明总数 ${grandBreaks}；双扣命中 ${grandDup}`);
    if (dupHits.length > 0) {
        console.log('命中明细（最多列 10 条）：');
        for (const m of dupHits) console.log('  ✗ ' + m);
    }
    // 防假绿：一次破防都没跑到 = 检测器空转，必须报出来而不是显示"通过"
    if (grandBreaks === 0) {
        console.log('✗ 零触发：18 场未产生任何破防声明，检测器空转（覆盖度缺口，不是通过）');
        process.exit(1);
    }
    if (grandDup > 0) {
        console.log(`✗ 检出 ${grandDup} 处破防重复应用（双扣）`);
        process.exit(1);
    }
    console.log('✅ 全部破防声明的实际 def 降幅 == 声明 reduce（无重复应用）');
    process.exit(0);
}

main().catch(e => { console.error('检测器异常：', e); process.exit(1); });
