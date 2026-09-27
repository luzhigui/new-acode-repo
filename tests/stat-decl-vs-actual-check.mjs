// V1.0.0 | 2026-09-27 第 34 轮 | 「数值声明 vs 实际属性增量」逐步对照器（通用）
//
// 立它的原因（第 33 轮的教训，务必先读）：
//   用户实报的「破防双扣」（core/03 直改 + core/16 裁定各一次，日志写 -4 实际 -8）体检全程查不出。
//   根因是**规则只校验日志文本的声明值，从不核对实际状态**——声明本身合法（4∈{2,3,4}）就恒绿。
//   第 33 轮先试过两条文本判据，全都失败并已撤回：
//     ① 跨攻击的波动行 defBase 差值 → 已修复代码上误报 27 场（两次破防间夹增益到期等非破防变动，无法归因）；
//     ② 组内「首行 displayDef vs 波动 defBase」→ displayDef 是渲染时 getStat（render/34 L87），是攻击后值。
//   → 结论：这类洞只能拿**逐步真实状态**填，文本侧补不出可靠判据。
//
// 统一判据（两条契约共用一把尺子）：
//   逐步快照每个单位的真实属性（core/13 getStat，与引擎同源），与同一步发出的数值声明逐条比对。
//   **实际增量 > 声明值 ⇒ 该效果被重复应用**；且只在"增量恰为声明值的整数倍（≥2 倍）"时才报，
//   非整数倍说明同一步还夹了其他来源（坚盾/成长/穿透…），不归因、跳过 —— 宁可漏报不可误报。
//   依据：core/13 L288-293 `addMod` 只做 `_mods[stat].push(mod)`、**不去重不覆盖**，
//   而 getStat 把该 stat 全部 mod 的 value 累加 ⇒ 同一 stat 被应用两次，属性必然翻倍。
//
// 覆盖契约（新增机制＝往 CONTRACTS 加一条，不改主体）：
//   1. BREAK_DEF  破防：目标 def 应下降 reduce（core/16 L76-81 裁定器 addMod permanent）
//   2. CARRY_APPLY carry：单位 atk/def/maxHp 应上升声明值（core/04 L37-42，ttl:'round'）
//
// 运行：node tests/stat-decl-vs-actual-check.mjs            → 全量 18 场；有重复应用退出码 1；契约零触发亦退出码 1（防假绿）
//       node tests/stat-decl-vs-actual-check.mjs 18:3       → 只跑指定场次并打印逐步明细
export const VER = 'tests/stat-decl-vs-actual-check.mjs V1.0.0';

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

// 含 18：148 报的 carry 重复应用发生在 seed=18 stage=3，纳入默认集才能实证（首版用 baseline 的 6 种子，漏了它）
const SEEDS = [1, 18, 42, 999, 12345, 777, 88888];
const STAGES = [1, 3, 5];

// dir: +1=声明使该属性上升，-1=声明使该属性下降
const CONTRACTS = [
    {
        id: 'BREAK_DEF',
        label: '破防',
        dir: -1,
        // 声明挂法（core/12 L503-505 → L549）：attackFact.data.entries 里 { factType, data:{targetName, reduce} }
        extract(stepLog) {
            const out = [];
            const scan = (e) => {
                if (e && e.data && typeof e.data.reduce === 'number' && e.data.targetName) {
                    out.push({ unit: e.data.targetName, stat: 'def', amount: e.data.reduce });
                }
            };
            for (const f of stepLog || []) {
                if (!f) continue;
                scan(f);
                if (f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        id: 'CARRY_APPLY',
        label: 'carry',
        dir: +1,
        // 与破防不同：carry 每单位每回合**至多应用一次**（core/04 L37 门控 + ttl:'round'）。
        //   同一步出现 2 条声明即重复应用；而破防同一步多条是合法的（连击/性奋额外攻击两次破防）。
        //   故本契约定 expectSingle —— 聚合比对会把"两条声明 + 属性也真叠加两份"判成正常（首版就栽在这里）。
        expectSingle: true,
        // 声明（core/04 L42）：顶层 fact { factType: CARRY_APPLY, data:{ unitName, atk, def, hp } }
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data) continue;
                const d = f.data;
                if (typeof d.unitName === 'string' && typeof d.atk === 'number'
                    && typeof d.def === 'number' && typeof d.hp === 'number') {
                    out.push({ unit: d.unitName, stat: 'atk', amount: d.atk });
                    out.push({ unit: d.unitName, stat: 'def', amount: d.def });
                    out.push({ unit: d.unitName, stat: 'maxHp', amount: d.hp });
                }
            }
            return out;
        }
    }
];

async function main() {
    const [{ CONFIG, loadGameData }, { SeededRNG }, { createRoundStepper },
           { initBattleTeams }, { getStat }, { CAMP_TYPES, BUFF_TYPES }] = await Promise.all([
        import('../core/01config-5v5-test.js'),
        import('../infra/51-core-utils.js'),
        import('../core/11battle-round.js'),
        import('../modules/29battle-init.js'),
        import('../core/13battle-shared.js'),
        import('../infra/56-battle-enums.js')
    ]);

    // 团队 Buff 注入 —— 必须有它，否则 buff 门控机制（carry/流星赶月/乘风突袭…）一场都跑不到。
    // 复刻自 tests/rules-replay.mjs L113-143 的 tickAndPickBuffs（该函数是回放器本地函数、不可导入；
    // rules-replay.mjs 属他人并行维护，不改它）。口径一致：seed/round 确定性轮转，**不消耗战斗 RNG**，
    // 故不改变战斗随机序列、可复现。首版漏了这段 → CARRY_APPLY 契约 18 场零触发（假绿），已修。
    const tickAndPickBuffs = (activeBuffs, ally, enemy, round, seed, pickNew) => {
        var next = (activeBuffs || []).map(function (b) { return { ...b, remaining: b.remaining - 1 }; })
            .filter(function (b) { return b.remaining > 0; });
        if (!pickNew) return next;
        var turn = Math.floor(round / 3);
        var sides = [{ camp: CAMP_TYPES.ALLY, team: ally, off: 0 }, { camp: CAMP_TYPES.ENEMY, team: enemy, off: 1 }];
        for (var i = 0; i < sides.length; i++) {
            var s = sides[i];
            var mine = next.filter(function (b) { return (b.target || CAMP_TYPES.ALLY) === s.camp; });
            var existing = mine.map(function (b) { return b.key; });
            var alive = (s.team || []).filter(function (u) { return u && u.alive; });
            var avail = Object.keys(CONFIG.BUFFS).sort().filter(function (k) {
                if (existing.indexOf(k) !== -1) return false;
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
    await import('../modules/25elite-imperial.js');
    await import('../modules/26elite-sixsects.js');
    await import('../modules/27elite-mingjiao.js');
    await loadGameData();

    const MAX_ROUND = CONFIG.MAX_ROUND || 35;

    // 逐步快照：uid -> { name, atk, def, maxHp }（真实属性，与引擎同源 getStat）
    const snapStats = (units) => {
        const m = new Map();
        for (const u of units || []) {
            if (!u) continue;
            m.set(u.uid, {
                name: u.name,
                atk: Math.floor(getStat(u, 'atk')),
                def: Math.floor(getStat(u, 'def')),
                maxHp: Math.floor(getStat(u, 'maxHp'))
            });
        }
        return m;
    };
    const byName = (m, name) => {
        for (const v of m.values()) if (v.name === name) return v;
        return null;
    };

    const rawArgs = process.argv.slice(2);
    const verbose = rawArgs.length > 0;
    const cases = rawArgs.length > 0
        ? rawArgs.map(s => { const [sd, st] = s.split(':'); return { seed: Number(sd), stage: Number(st) }; })
        : SEEDS.flatMap(seed => STAGES.map(stage => ({ seed, stage })));

    const hits = [];
    const stat = {}; // contractId -> { declared, dup }
    for (const c of CONTRACTS) stat[c.id] = { declared: 0, dup: 0 };

    for (const { seed, stage } of cases) {
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
        let prev = snapStats([...battleState.ally, ...battleState.enemy]);
        let winner = null;

        while (battleState.round <= MAX_ROUND) {
            const stepper = createRoundStepper(battleState);
            let lastStep = null;
            for (const step of stepper) {
                lastStep = step;
                const after = snapStats([...(step.ally || []), ...(step.enemy || [])]);

                for (const c of CONTRACTS) {
                    // 同一步可能对同一目标发多条声明（连击/性奋额外攻击/多段），
                    // 必须按「单位 + 属性」汇总声明量再与总增量比对，否则会把多次合法应用误判成重复应用。
                    const agg = new Map(); // "unit|stat" -> { sum, count }
                    for (const d of c.extract(step.log)) {
                        stat[c.id].declared++;
                        const key = d.unit + '|' + d.stat;
                        const cur = agg.get(key) || { unit: d.unit, statName: d.stat, sum: 0, count: 0, amounts: [] };
                        cur.sum += d.amount;
                        cur.count += 1;
                        cur.amounts.push(d.amount);
                        agg.set(key, cur);
                    }
                    for (const { unit, statName, sum, count, amounts } of agg.values()) {
                        const p = byName(prev, unit);
                        const a = byName(after, unit);
                        if (!p || !a) continue;
                        // 实际增量（按契约方向折算为"声明应有的正向幅度"）
                        const actual = (a[statName] - p[statName]) * c.dir;
                        if (verbose) {
                            console.log(`  [${c.id}] r${battleState.round} ${unit}.${statName} 声明=${sum}(${count}条) 实际=${actual}`);
                        }
                        // 判据：实际 > 声明，且恰为声明的整数倍（≥2 倍）⇒ 重复应用
                        if (sum > 0 && actual > sum && actual % sum === 0) {
                            const k = actual / sum;
                            stat[c.id].dup++;
                            const msg = `[seed=${seed} stage=${stage} r${battleState.round}] ${c.label} ${unit}.${statName} 声明+${sum}(${count}条) 实际${c.dir > 0 ? '+' : '-'}${actual}（${k}倍）`;
                            if (hits.length < 12) hits.push(msg);
                        }
                        // 「至多一条」契约却出现多条 ⇒ 重复应用。附实际增量证据：
                        //   若实际增量 == count × 单条量，证明属性确实被叠加了 count 份（不是只多打了一条日志）。
                        if (c.expectSingle && count >= 2) {
                            const single = amounts[0];
                            let evidence = '';
                            if (single > 0 && actual % single === 0) {
                                evidence = `，实际增量 ${actual} = ${actual / single} × 单条 ${single}（属性${actual > single ? '确实被叠加' : '未叠加'}）`;
                            } else {
                                evidence = `，实际增量 ${actual}（无法按单条量整除，可能夹了其他来源）`;
                            }
                            stat[c.id].dup++;
                            const msg = `[seed=${seed} stage=${stage} r${battleState.round}] ${c.label} ${unit}.${statName} 同一步出现 ${count} 条声明（应为 1 条）${evidence}`;
                            if (hits.length < 12) hits.push(msg);
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
                activeBuffs: tickAndPickBuffs(battleState.activeBuffs, lastStep.ally, lastStep.enemy,
                    battleState.round, seed, battleState.round % 3 === 0),
                allAllies: battleState.allAllies,
                _rng: rng
            };
            prev = snapStats([...battleState.ally, ...battleState.enemy]);
        }
        if (verbose) console.log(`seed=${seed} stage=${stage} winner=${winner || '平局'}`);
    }

    console.log('\n=== 数值声明 vs 实际属性增量（逐步真值对照）===');
    let hardFail = false;
    for (const c of CONTRACTS) {
        const s = stat[c.id];
        console.log(`${c.id.padEnd(12)} 声明 ${String(s.declared).padStart(4)} 条 · 重复应用命中 ${s.dup}`);
        // 防假绿：某个契约一次都没跑到 = 该契约空转，必须报出来而不是默认"通过"
        if (s.declared === 0) {
            console.log(`  ✗ 零触发：${c.id} 在 18 场未产生任何声明，本契约空转（覆盖度缺口）`);
            hardFail = true;
        }
    }
    if (hits.length > 0) {
        console.log('命中明细（最多列 12 条）：');
        for (const m of hits) console.log('  ✗ ' + m);
    }
    if (hardFail || CONTRACTS.some(c => stat[c.id].dup > 0)) {
        const total = CONTRACTS.reduce((n, c) => n + stat[c.id].dup, 0);
        console.log(`\n✗ 检出重复应用 ${total} 处${hardFail ? '（另有契约零触发）' : ''}`);
        process.exit(1);
    }
    console.log('\n✅ 全部数值声明的实际属性增量均 == 声明值（无重复应用）');
    process.exit(0);
}

main().catch(e => { console.error('对照器异常：', e); process.exit(1); });
