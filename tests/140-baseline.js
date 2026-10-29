// 运行：node tests/140-baseline.js --check       → 全量重跑并与基线比对，全部一致退出码 0，任一差异退出码 1（回归红线）
//       node tests/140-baseline.js --update      → 全量重跑并重录基线文件 baseline-v1.json（业务有意变更后使用，需显式）
//       node tests/140-baseline.js 1:1 42:3      → 只跑指定场次打印结果，不写基线（先验证用）
//       （无参数运行已禁止：exit 2 并打印用法——旧口径无参数即写基线，曾因少打 --check 毁过基准）
// 注意：引擎文件顶层访问浏览器全局（window/self），必须在任何引擎 import 之前 mock，
//       故全部引擎 import 改为动态（在 main 内、mock 之后执行）。
// VER-HOLD-DECL 第 136 轮：VER 刻意保持 V1.7.1，不追到版本日志已有的 V1.7.2 —— 本文件的 VER 会被写进
//       入库产物 tests/baselines/baseline-v1.json 的 version 字段，单抬 VER 会让「已入库基线的 version」与
//       「脚本自报的 VER」脱节；是否允许连带刷新该字段属动基线范畴，须先拍板。故此处登记 hold，不做归位。
export const VER = 'tests/140-baseline.js V1.7.1';

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

// 只有触达这些目录的提交，才可能解释**战斗结果**的差异
const BATTLE_PATHS = ['content', 'core', 'modules', 'render', 'fx', 'player', 'infra'];
// 数值平衡类：动 content/（游戏数据）—— 这正是"胜率 / 回合数漂移"最常见的正当来源
const BALANCE_PATHS = ['content'];

// 取基线生成之后的「战斗相关」提交说明，用于把 DIFF 归类为「预期变更」还是「回归」（方向④）。
// 第 23 轮修正（修本工具自己的缺陷）：原实现取**全部**提交 —— 连 `test(体检)` / `docs` / `chore`
//   都被当成战斗 DIFF 的"预期变更"依据，等于用体检提交给战斗变化发通行证。基线后 266 条提交
//   使该判据恒真，"预期变更"这栏失去意义。现在只取触达战斗代码的提交，并单列其中的数值平衡类。
// 取不到 git（非仓库环境 / 无权限）时返回空 —— 此时非 winner 差异一律归回归，宁严勿松。
async function commitsSince(isoDate) {
    const out = { battle: [], balance: [] };
    try {
        const cp = await import('node:child_process');
        const run = (paths) => {
            const s = cp.execSync(`git log --since="${isoDate}" --pretty=format:%s -- ${paths.join(' ')}`,
                { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
            return (s || '').split('\n').map(x => x.trim()).filter(Boolean);
        };
        out.battle = run(BATTLE_PATHS);
        out.balance = run(BALANCE_PATHS);
    } catch (e) { /* 取不到就保持空 */ }
    return out;
}

const SEEDS = [1, 42, 999, 12345, 777, 88888];
const STAGES = [1, 3, 5, 7];

async function main() {
    // mock 已就绪，动态加载引擎（顶层 import 会先于 mock 求值，故不能用静态 import）
    const [{ CONFIG, loadGameData }, { SeededRNG }, { createRoundStepper }, { initBattleTeams },
           { CAMP_TYPES, BUFF_TYPES }] = await Promise.all([
        import('../core/01config-5v5-test.js'),
        import('../infra/51-core-utils.js'),
        import('../core/11battle-round.js'),
        import('../modules/29battle-init.js'),
        import('../infra/56-battle-enums.js')
    ]);
    const { tickAndPickBuffs } = await import('./_lib/buff-picker.mjs');

    // carry 候选判据与主代码同口径：直接 import modules/28buff-tools.js 的 hasCarryTarget 复用，
    //   不另写一份（避免与主代码漂移）。「carry 位」= 5 号；小昭·姊在场放宽 4/5/6；全空则 carry 不进候选。
    const { hasCarryTarget } = await import('../modules/28buff-tools.js');
    // 团队 Buff 注入（V1.5.0 新增）—— 复刻自 tests/rules-replay.mjs L113-143 的 tickAndPickBuffs。
    //   该函数是回放器本地函数、不可导入（rules-replay.mjs 属他人并行维护，不改它）。
    //   口径一致：seed/round 确定性轮转，**不消耗战斗 RNG**，故不改变战斗随机序列、结果可复现。
    //   BASELINE_NOBUFFS=1 可整体关掉，用于「注入前后」对照同一批战报。
    const NO_BUFFS = process.env.BASELINE_NOBUFFS === '1';

    
    // 精英模块副作用注册（createRoundStepper 的 getEliteFactories 依赖）
    await import('../modules/25elite-imperial.js');
    await import('../modules/26elite-sixsects.js');
    await import('../modules/27elite-mingjiao.js');
    // 第 56 轮：装配口径对齐 —— dotTick/damageReflect 靠 modules/30 模块顶层副作用注册进 core/18，
    //   漏 import ⇒ core/15 安装期校验对鹿杖客 dotTick 抛错，基线开局即崩（同 tools/116 的坑）。
    await import('../modules/30custom-effects.js');
    await loadGameData(); // CONFIG getter/精英机制都依赖 gameData

    const MAX_ROUND = CONFIG.MAX_ROUND || 35;

    async function runBaselineCase(seed, stage) {
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
                activeBuffs: tickAndPickBuffs(battleState.activeBuffs, lastStep.ally, lastStep.enemy,
                    battleState.round, seed, battleState.round % 3 === 0),
                allAllies: battleState.allAllies,
                _rng: rng
            };
            rounds = battleState.round;
        }
        return { seed, stage, winner: winner || '平局', rounds, factCount: facts.length, facts };
    }

    const rawArgs = process.argv.slice(2);
    const checkMode = rawArgs.includes('--check');
    const updateMode = rawArgs.includes('--update');
    const caseArgs = rawArgs.filter(a => a !== '--check' && a !== '--update');

    // —— 参数护栏（V1.7.0，同步夜间值班第 106 轮规格）——
    // 事故源：旧口径「无参数 = 全量重跑 + 写基线」。全量重跑恰是 --check 的日常用法，少打一个 --check
    //   就把基线整盘重写（第 106 轮实损 401 增/670 删，靠 git checkout 复原）。写基线必须显式 --update。
    // 护栏在跑战斗之前Fail-fast：拒绝就不浪费那 24 场的算力。
    if (checkMode && updateMode) {
        console.error('[baseline] --check 与 --update 互斥：前者只读比对，后者覆写基线，不能同时给。');
        process.exit(2);
    }
    if (!checkMode && !updateMode && caseArgs.length === 0) {
        console.error('[baseline] 无参数运行已禁止 —— 旧口径会把基线整盘重写。请显式指定模式：');
        console.error('  node tests/140-baseline.js --check     只读比对（日常红线用法，退出码 0/1）');
        console.error('  node tests/140-baseline.js --update    业务有意变更后重录基线（覆写 baseline-v1.json，退出码 0）');
        console.error('  node tests/140-baseline.js 1:1 42:3    只跑指定场次打印，不写基线（先验证用）');
        process.exit(2);
    }
    if (updateMode && caseArgs.length > 0) {
        console.error('[baseline] --update 不支持搭配场次过滤（会写出只有几场的不完整基线）。重录请全量跑（不带场次参数）。');
        process.exit(2);
    }

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
            else if (since.battle.length) intended.push(line);
            else regressions.push(line + '  【基线后无业务提交，无法用有意变更解释】');
        }

        if (!intended.length && !regressions.length) {
            console.log(`BASELINE-MATCH ${results.length} 场与基线一致`);
            return;
        }
        if (intended.length) {
            console.log(`\n[预期变更] ${intended.length} 场（winner 未变，基线后业务侧有提交可解释 —— 人工核对后重录基线）`);
            for (const l of intended) console.log('  · ' + l);
            console.log('  基线生成于 ' + base.generatedAt + '；之后触达战斗代码的提交 '
                + since.battle.length + ' 条（其中数值平衡类 ' + since.balance.length + ' 条）：');
            for (const s of since.battle.slice(0, 10)) console.log('    - ' + s);
            if (since.battle.length > 10) console.log(`    … 另有 ${since.battle.length - 10} 条`);
        }
        if (regressions.length) {
            console.log(`\n[回归] ${regressions.length} 场（红线：报红，严禁重录基线）`);
            for (const l of regressions) console.log('  ✗ ' + l);
        }
        // V1.7.2 | 2026-10-25 第 124 轮：机器可读汇总行（RESULT 前缀进 run-all pickKeyLine 关键词表）。
        //   此前失败态下本闸门没有任何一行含 RESULT/失败 等关键词 ⇒ run-all 回退挑「最后一行」
        //   （任意 ✗ 明细）⇒ 失败总数不可见——第 123 轮我因此把「10+ 场红」误读成「只有 seed777 一条」，
        //   并写下错误归因（已纠正）。汇总行必须最后打印，确保 pickKeyLine 取到的是总数而非明细。
        const total = results.length;
        if (regressions.length) {
            console.log(`RESULT: 基线回归 ${regressions.length}/${total} 场（红线，严禁重录；明细见上）`);
        } else {
            console.log(`RESULT: 基线预期变更 ${intended.length}/${total} 场（winner 未变，待人工核对后重录）`);
        }
        // 只有「回归」才退码 1
        if (regressions.length) process.exit(1);
        return;
    }

    if (updateMode) {
        // 只有显式 --update 才写基线文件（V1.7.0 护栏：无参数/--check 都到不了这里）；
        // 带场次参数的验证运行只打印、不覆盖基线（上方护栏已挡掉 --update + 场次过滤的组合）
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
