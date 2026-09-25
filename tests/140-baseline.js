// V1.3.0 | ~10200 bytes | 2026-09-25 --check 的 DIFF 改为二分：winner 翻转＝回归（红线，硬失败）；winner 未变
//          且基线后业务侧确有提交可解释＝预期变更（单列提示重录，不硬失败）。旧版任何 DIFF 一律退码 1，
//          导致每次有意调数值都被红线拦死，红线反而失去意义。
// V1.2.0 | ~7600 bytes | 2026-09-22 修复 Windows 下 fetch file:// 路径（new URL(url).pathname → fileURLToPath）；新增 --check 模式（与基线逐场比对 winner/rounds/facts，有差异退出码 1）；吸收并取代临时 runner baseline-check.mjs / baseline-diff.mjs
// V1.1.0 | 2026-09-上旬 曾短暂带 check 能力后回退（baseline-v1.json 内残留 version 字段为证），功能由临时 runner baseline-check.mjs 承担
// V1.0.0 | 2026-08-26 建立 18 场（6 种子 × 3 关）确定性基线，供"零行为变化"重构做机器 diff
// 运行：node tests/140-baseline.js                → 全量 18 场并重录基线文件 baseline-v1.json（业务代码有意变更后使用）
//       node tests/140-baseline.js --check       → 全量重跑并与基线比对，全部一致退出码 0，任一差异退出码 1（回归红线）
//       node tests/140-baseline.js 1:1 42:3      → 只跑指定场次打印结果，不写基线（先验证用）
// 注意：引擎文件顶层访问浏览器全局（window/self），必须在任何引擎 import 之前 mock，
//       故全部引擎 import 改为动态（在 main 内、mock 之后执行）。
export const VER = 'tests/140-baseline.js V1.3.0';

import { fileURLToPath } from 'node:url';

// 环境 mock（不改引擎源码，Node 补浏览器能力）
// loadGameData 用 fetch(file://...)，Node fetch 不支持 file 协议 → 换成读文件。
// Windows 下 new URL(url).pathname 会得到 "/C:/..."，必须走 fileURLToPath
globalThis.fetch = async (url) => {
    const path = fileURLToPath(new URL(url));
    const fs = await import('node:fs');
    const text = fs.readFileSync(path, 'utf8');
    return { ok: true, json: async () => JSON.parse(text) };
};
// initBattleTeams 会读 localStorage（forceZhang/forceWei 等）
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
// 54-global-store 顶层挂 window.GlobalStore
globalThis.window = globalThis;
globalThis.self = globalThis;

// 取基线生成之后的提交说明，用于把 DIFF 归类为「预期变更」还是「回归」（方向④）。
// 取不到 git（非仓库环境 / 无权限）时返回空数组 —— 此时非 winner 差异一律归回归，宁严勿松。
async function commitsSince(isoDate) {
    try {
        const cp = await import('node:child_process');
        const out = cp.execSync(`git log --since="${isoDate}" --pretty=format:%s`,
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        return (out || '').split('\n').map(s => s.trim()).filter(Boolean);
    } catch (e) { return []; }
}

const SEEDS = [1, 42, 999, 12345, 777, 88888];
const STAGES = [1, 3, 5];

async function main() {
    // mock 已就绪，动态加载引擎（顶层 import 会先于 mock 求值，故不能用静态 import）
    const [{ CONFIG, loadGameData }, { SeededRNG }, { createRoundStepper }, { initBattleTeams }] = await Promise.all([
        import('../core/01config-5v5-test.js'),
        import('../infra/51-core-utils.js'),
        import('../core/11battle-round.js'),
        import('../modules/29battle-init.js')
    ]);
    // 精英模块副作用注册（createRoundStepper 的 getEliteFactories 依赖）
    await import('../modules/25elite-imperial.js');
    await import('../modules/26elite-sixsects.js');
    await import('../modules/27elite-mingjiao.js');
    await loadGameData(); // CONFIG getter/精英机制都依赖 gameData

    const MAX_ROUND = CONFIG.MAX_ROUND || 35;

    async function runBaselineCase(seed, stage) {
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
        const facts = [];
        let winner = null;
        let rounds = 1;

        while (battleState.round <= MAX_ROUND) {
            const stepper = createRoundStepper(battleState);
            let lastStep = null;
            for (const step of stepper) {
                lastStep = step;
                // 只存 factType 字符串，不存 HTML
                for (const e of step.log || []) {
                    if (e && e.factType) facts.push(e.factType);
                }
                if (step.winner) winner = step.winner;
            }
            if (winner) { rounds = battleState.round; break; }
            if (!lastStep) { rounds = battleState.round; break; }
            // 跨回合：activeBuffs 取 step.ally._activeBuffs（finalizeRoundEnd 已递减），
            // 不要再基于旧 state.activeBuffs 自减（会双递减）
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
            rounds = battleState.round;
        }
        return { seed, stage, winner: winner || '平局', rounds, factCount: facts.length, facts };
    }

    const rawArgs = process.argv.slice(2);
    const checkMode = rawArgs.includes('--check');
    const caseArgs = rawArgs.filter(a => a !== '--check');
    const cases = caseArgs.length > 0
        ? caseArgs.map(s => { const [sd, st] = s.split(':'); return { seed: Number(sd), stage: Number(st) }; })
        : SEEDS.flatMap(seed => STAGES.map(stage => ({ seed, stage })));

    const results = [];
    for (const { seed, stage } of cases) {
        const r = await runBaselineCase(seed, stage);
        results.push(r);
        console.log(`seed=${seed} stage=${stage} winner=${r.winner} rounds=${r.rounds} facts=${r.factCount}`);
    }

    if (checkMode) {
        const fs = await import('node:fs');
        const base = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./baselines/baseline-v1.json', import.meta.url)), 'utf8'));
        // —— 方向④：DIFF 二分，不再一律退码 1 ——
        // ①「回归」：winner 翻转（胜负变了不是"有意调数值"，是行为回归，红线：报红不重录）
        //    + 基线之后业务侧**没有任何提交**、差异无从用有意变更解释的场次。这两类硬失败。
        // ②「预期变更」：winner 未变、且基线之后业务侧确有提交（平衡/机制/重构）可解释 ——
        //    单列提示人工核对后重录基线，不硬失败（否则每次有意改数值都被红线拦死，红线就失去意义）。
        const since = await commitsSince(base.generatedAt);
        const intended = [], regressions = [];
        for (const cur of results) {
            const ref = base.cases.find(c => c.seed === cur.seed && c.stage === cur.stage);
            if (!ref) { regressions.push(`seed=${cur.seed} stage=${cur.stage}：基线中无此场`); continue; }
            const sameWinner = ref.winner === cur.winner;
            const sameRounds = ref.rounds === cur.rounds;
            const sameFacts = JSON.stringify(ref.facts) === JSON.stringify(cur.facts);
            if (sameWinner && sameRounds && sameFacts) continue;
            const line = `seed=${cur.seed} stage=${cur.stage} winner=${ref.winner}->${cur.winner} `
                + `rounds=${ref.rounds}->${cur.rounds} factsSame=${sameFacts}`;
            if (!sameWinner) regressions.push(line + '  【winner 翻转＝回归】');
            else if (since.length) intended.push(line);
            else regressions.push(line + '  【基线后无业务提交，无法用有意变更解释】');
        }

        if (!intended.length && !regressions.length) {
            console.log(`BASELINE-MATCH ${results.length} 场与基线一致`);
            return;
        }
        if (intended.length) {
            console.log(`\n[预期变更] ${intended.length} 场（winner 未变，基线后业务侧有提交可解释 —— 人工核对后重录基线）`);
            for (const l of intended) console.log('  · ' + l);
            console.log('  基线生成于 ' + base.generatedAt + '，之后的提交：');
            for (const s of since.slice(0, 10)) console.log('    - ' + s);
            if (since.length > 10) console.log(`    … 另有 ${since.length - 10} 条`);
        }
        if (regressions.length) {
            console.log(`\n[回归] ${regressions.length} 场（红线：报红，严禁重录基线）`);
            for (const l of regressions) console.log('  ✗ ' + l);
        }
        // 只有「回归」才退码 1
        if (regressions.length) process.exit(1);
        return;
    }

    if (caseArgs.length === 0) {
        // 全量运行才写基线文件；带参数验证（如 1:1 42:3）只打印，不覆盖基线
        const fs = await import('node:fs');
        const outDir = new URL('./baselines/', import.meta.url);
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(
            new URL('baseline-v1.json', outDir),
            JSON.stringify({ generatedAt: new Date().toISOString(), version: VER, cases: results }, null, 2)
        );
        console.log(`基线已写入 tests/baselines/baseline-v1.json（${results.length} 场）`);
    }
}

main().catch(e => { console.error('[baseline] 失败：', e); process.exit(1); });
