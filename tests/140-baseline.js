// tests/140-baseline.js - 无 UI 行为基线（种子随机批量模拟）
// V1.0.0 | ~4300 bytes| 2026-08-26 建立 18 场（6 种子 × 3 关）确定性基线，供"零行为变化"重构做机器 diff
// 运行：node tests/140-baseline.js [seed:stage ...]
//   不带参数跑全量 18 场；传参如 "1:1 1:3 1:5" 只跑指定场次（先验证用）
// 注意：引擎文件顶层访问浏览器全局（window/self），必须在任何引擎 import 之前 mock，
//       故全部引擎 import 改为动态（在 main 内、mock 之后执行）。Node v24 默认 detect-module 自动按 ESM 加载。
export const VER = 'tests/140-baseline.js V1.0.0';

// ==================== 环境 mock（不改引擎源码，Node 补浏览器能力） ====================
// loadGameData 用 fetch(file://...)，Node fetch 不支持 file 协议 → 换成读文件
globalThis.fetch = async (url) => {
    const path = new URL(url).pathname;
    const fs = await import('node:fs');
    const text = fs.readFileSync(path, 'utf8');
    return { ok: true, json: async () => JSON.parse(text) };
};
// initBattleTeams 会读 localStorage（forceZhang/forceWei 等）
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
// 54-global-store 顶层挂 window.GlobalStore
globalThis.window = globalThis;
globalThis.self = globalThis;

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
            for await (const step of stepper) {
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
                activeBuffs: (lastStep.ally._activeBuffs || []).map(b => ({ ...b })),
                allAllies: battleState.allAllies,
                _rng: rng
            };
            rounds = battleState.round;
        }
        return { seed, stage, winner: winner || '平局', rounds, factCount: facts.length, facts };
    }

    const args = process.argv.slice(2);
    const cases = args.length > 0
        ? args.map(s => { const [sd, st] = s.split(':'); return { seed: Number(sd), stage: Number(st) }; })
        : SEEDS.flatMap(seed => STAGES.map(stage => ({ seed, stage })));

    const results = [];
    for (const { seed, stage } of cases) {
        const r = await runBaselineCase(seed, stage);
        results.push(r);
        console.log(`seed=${seed} stage=${stage} winner=${r.winner} rounds=${r.rounds} facts=${r.factCount}`);
    }

    const fs = await import('node:fs');
    const outDir = new URL('./baselines/', import.meta.url);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
        new URL('baseline-v1.json', outDir),
        JSON.stringify({ generatedAt: new Date().toISOString(), version: VER, cases: results }, null, 2)
    );
    console.log(`基线已写入 tests/baselines/baseline-v1.json（${results.length} 场）`);
}

main().catch(e => { console.error('[baseline] 失败：', e); process.exit(1); });