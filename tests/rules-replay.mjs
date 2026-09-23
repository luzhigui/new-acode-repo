// V6.1.28 | ~54700 bytes | 2026-09-23 规则回放自检（开发用 runner，不参与游戏运行）
// 用法：node tests/rules-replay.mjs           （默认 20 个种子 × 1~6 关 = 120 场）
//      SEEDS=1,2,3 STAGES=2,4 node tests/rules-replay.mjs
//      KEYWORDS=新婚|苦练 node tests/rules-replay.mjs   （额外统计战报文本关键字命中数）
//      DEAD=1 node tests/rules-replay.mjs              （严格模式：有恒 skip 空转规则即非 0 退出）
//      PROBE_ZERO=a,b,c  node tests/rules-replay.mjs   （产出点取证自检：对任意名字跑一遍分类，可传合成名做负向测试）
//      PROBE_RENDER=a,b  node tests/rules-replay.mjs   （渲染产出自检：对任意名字按同一判据跑一遍"渲染器给没给条目"）
//
// V6.1.28 修复：零产出清单补第三级分类【不可达 emit 点】——V6.1.26 的机检把"全仓有
//   `factType: FACT_TYPES.X` 赋值"直接等同于"有产出点"，进而归入【本批次未触发】并建议
//   "加 SEEDS/STAGES 或针对该分支构造场景"。但"有赋值"只说明**代码里写了这行**，不说明
//   **这行还活着**：本批次实测 spiderFly（modules/27:604）、butterflyNoHost（modules/27:273）
//   两条 emit 点所在的 executeFly / _executeAttach，唯一调用者是 core/11:321 与 core/11:323，
//   两条都被 `decl.type === 'butterflyAttach'|'spiderFly'` 门控，而全仓**没有任何位置** push
//   这两个 type —— 无论加多少 SEEDS/STAGES 都永远碰不到，V6.1.26 给出的补救是**不可能完成的**。
//   这与第 4~6 轮"把体检侧问题甩给业务侧"是同一失效形态，且更隐蔽（建议本身看起来可执行）。
//   现补静态可达性分析：回溯 emit 点所在函数 → 查全仓调用点 → 调用点为 0 判【无调用者】、
//   调用点**全部**被 `type === 'X'` 门控且全仓无 `type: 'X'` 产出方判【门控无产出方】。
//   判据经过负向自检：真实有产出的 clawHit / xinHunDeath 仍落【本批次未触发】，
//   死通道 spiderFly / butterflyNoHost 落【不可达 emit 点】，未出现"一律判不可达"的一刀切。
//
// V6.1.27 修复：fact 覆盖直方图补「渲染产出口径」——补齐复盘报告第 3 轮问题 A 的另一半。
//   V6.1.25/1.26 解决的是「引擎有没有把 fact 写进日志」（fact 树口径），但规则消费的既不是
//   原始 fact 也不是 fact 树，而是 **render/30 渲染出来的条目**。中间还隔着一道 renderLog：
//   render/30 L827-836 未知 factType 直接 `console.error` + `return null`、渲染器缺失则 throw、
//   渲染器也可能返回 null/空数组 —— 这几种情况**引擎明明产出了，规则却一条都看不见**，
//   表现和"业务侧没产出"完全一样，正是第 4/5 轮把 129/134/141/143 误判成交业务侧的最后一环。
//   现对每个 fact 节点（顶层 + 嵌套）**逐一调 renderLog 取证**，统计三个口径：
//   引擎产出(factHist) / 渲染条目数(renderOk) / 渲染返回空(renderNull) / 渲染抛错(renderErr)，
//   并新增【渲染未产出条目】清单。至此"零产出"只剩"引擎或渲染器真没给"这一类，人工四类自查成为历史。
//   为什么不给条目打 `_factType` 标签（复盘原建议）：① 嵌套子条目由 render/30 内部
//   `projectFactEntry` 渲染（L200-204），回放侧拿不到「子条目 ↔ 子 fact」的对应关系，
//   只能拿父 factType 顶包 → 归因反而更假；② 给条目加字段等于给规则开一个**生产环境不存在**的依赖口子，
//   规则一旦读了它，浏览器里恒不命中 → 制造新的恒 skip。按 fact 节点逐个探测则两者都避开了。
//
// V6.1.26 修复：零产出清单**自动归因**——旧口径把 zeroFacts 一律打成 ⚠ 并附一段"四类成因自查"的文字，
//   但那四类里偏偏漏了最常见的一类：**本批次回放没跑到该分支**（120 场的阵容/条件没触发）。
//   实测本批次 10 项零产出中 9 项属于此类（xinHunDeath ← core/15 L454、flySkip ← core/10 L35、
//   spiderFly ← modules/27 L604、butterflyNoHost ← modules/27 L273 … 都有明确 emit 点），
//   只有 meteorSplashGrowth 是全仓无 emit 点的孤儿登记。缺了这一类 + 每轮靠人工 KEYWORDS 探针定性，
//   正是第 4/5 轮把 129/134/141/143 错判成"业务侧数据源缺失"写进待修清单的直接来源。
//   现改为机检：反查 FACT_TYPES 常量名 → 只认 `factType: FACT_TYPES.KEY` 形态的 emit 赋值
//   （渲染映射 `[FACT_TYPES.KEY]:` 不算），分成【本批次未触发（附 file:line）】与【孤儿登记】两类输出。
//   判据已过正对照：64 个有产出的 factType 全部检出 emit 点（0 假阴性）；负向用例（合成名、
//   仅有渲染映射的 meteorSplashGrowth）均正确落入【孤儿登记】，未出现"一律判有产出点"的一刀切。
//
// V6.1.25 修复：fact 覆盖直方图的**计数口径**——旧实现只数 `step.log` 顶层 fact 的 `f.factType`，
//   但引擎还把 16 类 fact 作为**子 fact** 嵌进父 fact 的 data 里（`data.entries[]` / `data.phantomFact` /
//   `data.dmgCalc.bonusEntries[]`），render/30 L200-204 会逐条 `projectFactEntry` 渲染进
//   attack-group.entries（规则实际消费的就是这些条目）。于是这批子 fact 全部被误报成"零产出"：
//   实测 fortifyRebound ×21、zhangTaunt ×36、nineYangHeal ×216、clawHit ×98、fortifyShield ×563、
//   qianKunUpgraded ×1104 …。后果不止是清单不准——`fortifyRebound`、`zhangTaunt` 已被当成
//   "业务侧真未产出"写进业务侧待修清单（履历 V6.1.20 / V6.1.24、复盘报告第 1~3 轮），
//   业务侧照单去 core/ 查产出点必然白跑。现改为递归统计（顶层 + 嵌套），并单独列出"仅嵌套出现"的一批。
//
// V6.1.24 修复：Buff 注入阵营保真度——旧实现给明教/六大派**双方**各补选一个，但生产单机口径是
//   只给明教注入（player/49battle-flow.js handleBuffSelection 默认 camp=CAMP_TYPES.ALLY，player/42
//   L455-456 调用时也不传 camp；双方各选是联网 PVP 专属 handlePvpBuffSelection）。双方注入让回放
//   出现生产单机不可能出现的场景——六大派拿到 FORTIFY 后，render/30 L325 的 buff-summary 与
//   张三丰自身组件（modules/26）产出的「🛡️ 严阵以待：张三丰 防御+50% 反弹50%」**完全同形**
//   （张三丰是六大派唯一防战），141 号规则的"严阵以待"存在性判据因此无法区分来源（假绿风险）。
//   改为只注入 ALLY 后，该文案唯一产出点 = 张三丰自身组件，141 判据随之可落地。
//   注意：140-baseline.js 不受影响（其基线重放恒 activeBuffs:[]，不走本函数）。
//
// V6.1.22 修复：渲染条目为**数组**的 fact 被整条吞掉（与生产侧口径不一致）。
//   player/42player-core.js L316-319 对 `renderLog` 返回数组的 factType 用 `log.splice(i,1,...rendered)`
//   展开成多条；本 runner 旧实现 `if (e) log.push(e)` 只推一个元素，于是该条目是个"数组对象"——
//   没有 text、没有 entries。实测 120 场里 zhangSwitch 触发 58 次全部如此丢失，直接导致
//   134(张无忌近身切换时机) 恒 skip 假绿、143(九阳) 的"变身前条目"失稳判据失效而误报 29 条。
//
// V6.1.23 复盘修正：V6.1.17 起把"零产出 factType"一律标注成「数据源缺失 · 改规则没用 · 去 core 查」，
//   **该归因是错的**，并已连续误导三轮迭代：第 4/5 轮据此把 129/134/141/143 判为业务侧数据源缺失、
//   写进业务侧待修清单移交，第 6 轮实测推翻——129/143/134 全是规则侧扫错层级 / 回放口径不一致，
//   业务侧产出一直在。真实成因有四类，必须先取证分开查：
//     ① 该 fact 走非 step.log 通道（如 nineYangHeal 经 core/15 的 data.declarations）→ 渲染条目其实在日志里；
//     ② 该 fact 的渲染条目嵌在 group 的 entries 子层级（如 spiderFly / zhangTaunt）→ 只扫顶层就看不见；
//     ③ 规则扫错层级，或读了渲染时已被剥离的 e.factType / e.data（如 141）→ 规则侧 bug，改规则才对症；
//     ④ 业务侧真的没把 fact 写进日志 → 唯一真正意义上的"数据源缺失"。
//   即"零产出"只等于**按原始 factType 统计为 0**，不能推断业务侧没产出。
//   ⚠ V6.1.25 后注：上表成因 ②（嵌在 group.entries 子层级）现已由计数口径修正消化——这类 fact
//     实测就是嵌在 `attack.entries[]` 里（nineYangHeal/clawHit/zhangTaunt/fortifyRebound 等 16 类），
//     按新口径均计入产出，不再出现在零产出清单。故现存零产出只剩 ①③④ 三类，取证时按三类分查。
//
// V6.1.17 新增：fact 覆盖归因。恒 skip 规则分两种根因——规则逻辑写死 skip（改规则）vs
//   业务侧 fact 没写进 step.log（改 core）。此前两者都只显示"恒 skip N 条"，无法区分，
//   导致排查空转规则时只能逐条肉眼看规则源码。现在按 FACT_SPECS 全量登记项统计批次产出，
//   输出"零产出 factType"清单，便于定位（⚠ 归因口径按 V6.1.23 修正，勿直接判成数据源缺失）。
//
// 干什么：真跑引擎（core/11 stepper）→ 收集 fact → 走 render/30 渲染成战报条目 → 依次执行
//         tests/health-rules/ 下的全部规则，统计每条规则 pass / fail / skip。
// 为什么要有它：规则靠"本场阵容刚好触发机制"才跑得到，浏览器里跑一趟体检只能看到当轮结果；
//   这里能一次性喂 100+ 场真实战报，用来验证「改规则没改坏」「新规则真跑得起来」以及
//   揪出"恒 skip 的空转规则"（数据源错位、扫不到 entries 子条目这类）。
// 注意：渲染 buff 阵营摘要依赖 GlobalStore.battleStore，本 runner 已按真实流程建 store 并每回合
//       SET_UNITS 同步（否则所有 buff-summary 渲染不出来，会让 140/141 之类的规则假红）。
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// --- 环境垫片：引擎零 DOM，但 import 链上会碰浏览器 API ---
globalThis.fetch = async (url) => {
    const fs = await import('node:fs');
    const p = fileURLToPath(new URL(url));
    const text = fs.readFileSync(p, 'utf8');
    return { ok: true, json: async () => JSON.parse(text) };
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.self = globalThis;

const HERE = new URL('.', import.meta.url);
const [{ CONFIG, loadGameData }, { SeededRNG }, { createRoundStepper }, { initBattleTeams },
    { renderLog }, { createStore, battleReducer }, { createInitialState }, { GlobalStore },
    { STORE_ACTION_TYPES, CAMP_TYPES, BUFF_TYPES, FACT_TYPES, FLY_MODE_TYPES }, { FACT_SPECS }] = await Promise.all([
        import('../core/01config-5v5-test.js'),
        import('../infra/51-core-utils.js'),
        import('../core/11battle-round.js'),
        import('../modules/29battle-init.js'),
        import('../render/30-fact-renderer.js'),
        import('../modules/24battle-store.js'),
        import('../core/17-state-keys.js'),
        import('../infra/54-global-store.js'),
        import('../infra/56-battle-enums.js'),
        import('../infra/58-fact-contract.js')
    ]);
// 精英组件需先注册（initBattleTeams 依赖其组件安装）
await import('../modules/25elite-imperial.js');
await import('../modules/26elite-sixsects.js');
await import('../modules/27elite-mingjiao.js');
await loadGameData();

// 自动装载 health-rules 下全部规则（文件名序 = 编号序），新增规则无需改本文件
const ruleDir = fileURLToPath(new URL('./health-rules/', import.meta.url));
const files = (await readdir(ruleDir)).filter(f => f.endsWith('.js')).sort();
const rules = [];
for (const f of files) {
    const mod = await import(new URL('./health-rules/' + f, HERE).href);
    for (const k of Object.keys(mod)) {
        if (/^rule\d+$/.test(k) && mod[k] && typeof mod[k].test === 'function') rules.push(mod[k]);
    }
}

const MAX_ROUND = CONFIG.MAX_ROUND || 35;
const SEEDS = process.env.SEEDS ? process.env.SEEDS.split(',').map(Number)
    : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const STAGES = process.env.STAGES ? process.env.STAGES.split(',').map(Number) : [1, 2, 3, 4, 5, 6];
const KEYWORDS = process.env.KEYWORDS ? process.env.KEYWORDS.split('|') : [];
// NOBUFFS=1 可关掉 Buff 注入，用于「注入前后」对比同一批战报
const NOBUFFS = process.env.NOBUFFS === '1';
// DEAD=1 严格模式：出现恒 skip(空转)规则即以非 0 退出——空转规则一次都没真断言，属"假绿"（V6.1.16）
const STRICT_DEAD = process.env.DEAD === '1';

// --- 团队海克斯 Buff 注入（V6.1.12）---
// 为什么要有它：回放器此前 activeBuffs 恒为 []，而流星赶月/乘风突袭/流云身法/概率连击/巨马阵
//   这一整批机制全部由团队 Buff 门控，于是 11 条规则 120 场一次都跑不到（恒 skip 空转）。
// 口径来源：player/49battle-flow.js 的全自动选 Buff 口径（过滤已有 key 与 BUFF_ROLE_REQUIREMENTS
//   的职业要求，duration 取 buff 自带或 BUFF_DURATION），且**只给明教注入**——handleBuffSelection
//   默认 camp=CAMP_TYPES.ALLY，player/42 单机调用不传 camp；双方各选是联网 PVP 专属
//   （handlePvpBuffSelection），回放模拟的是单机口径（V6.1.24 修正，此前误给六大派也注入）。
//   每回合递减 remaining（过期淘汰），每 3 回合补选一个（与 player/42 的
//   `round % 3 === 0` 补选节奏一致），并按「已选轮次」轮转键名，让 11 个 Buff 都能轮到。
// 注意：这里用 seed/round 确定性轮转，不消耗战斗 RNG —— 否则会改变战斗随机序列，破坏可复现性。
function tickAndPickBuffs(activeBuffs, ally, round, seed, pickNew) {
    var next = (activeBuffs || []).map(function (b) { return { ...b, remaining: b.remaining - 1 }; })
        .filter(function (b) { return b.remaining > 0; });
    if (NOBUFFS || !pickNew) return next;
    var turn = Math.floor(round / 3); // 第几次补选（round=1 预注入时为 0，其后 3/6/9… 递增）
    // V6.1.24 阵营保真度：单机生产只给明教注入（player/49 handleBuffSelection 默认 ALLY），
    //   不再给六大派注入——否则六大派拿 FORTIFY 时其 buff-summary 与张三丰自身组件文案同形，
    //   141 号"严阵以待"判据无法区分来源（假绿），且整体制造生产单机不存在的战斗场景。
    var sides = [{ camp: CAMP_TYPES.ALLY, team: ally, off: 0 }];
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
            // 圣火令需要 cols/rows；核心引擎只给明教重算，敌方快照得自带，否则面板取不到值
            var c1 = ((seed + round + s.off) % 3) + 1, c2 = ((seed + round * 3 + s.off) % 3) + 1;
            nb.cols = c1 === c2 ? [c1, (c1 % 3) + 1] : [c1, c2].sort(function (a, b) { return a - b; });
            nb.rows = [((seed * 2 + round + s.off) % 3) + 1, ((seed * 3 + round + s.off) % 3) + 1].sort(function (a, b) { return a - b; });
        }
        next.push(nb);
    }
    return next;
}

function runCase(seed, stage) {
    const rng = new SeededRNG(seed);
    const store = createStore({ ...createInitialState(), units: [] }, battleReducer);
    GlobalStore.set('battleStore', store);
    const { allyTeam, enemyTeam } = initBattleTeams(stage, rng);
    const beforeA = allyTeam.map(u => ({ ...u }));
    const beforeE = enemyTeam.map(u => ({ ...u }));
    let battleState = {
        ally: allyTeam.map(u => u.clone()),
        enemy: enemyTeam.map(u => u.clone()),
        // 第 1 回合预注入一轮：真实流程要等到第 3 回合才选 Buff，体检为覆盖机制提前一拍
        round: 1, activeBuffs: tickAndPickBuffs([], allyTeam, 1, seed, true),
        allAllies: allyTeam.map(u => u.clone()), _rng: rng
    };
    const log = [];
    let winner = null, lastStep = null;
    while (battleState.round <= MAX_ROUND) {
        try {
            store.dispatch({ type: STORE_ACTION_TYPES.SET_UNITS, units: [...battleState.ally, ...battleState.enemy].map(u => ({ ...u })) });
            store.dispatch({ type: STORE_ACTION_TYPES.SET_ROUND, round: battleState.round });
        } catch (e) { /* 状态同步失败不影响回放 */ }
        for (const step of createRoundStepper(battleState)) {
            lastStep = step;
            for (const f of step.log || []) {
                if (!f || !f.factType) continue;
                noteFact(f.factType, false);
                // V6.1.27：顶层 fact 的渲染产出由 probeRender 取证并**复用其返回值**拼日志，
                //   避免同一 fact 渲染两次（一次取证一次入日志）导致耗时翻倍。
                //   顺序上有讲究：**先渲顶层再探嵌套**——嵌套子 fact 的探测是"多渲一遍"，
                //   放在顶层渲染之后，保证拼日志那次渲染看到的 data 与旧实现完全一致
                //   （万一某个渲染器会改写 data，也不会污染战报本身；诊断不该反过来影响被测对象）。
                try {
                    const e = probeRender(f.factType, f.data);
                    // 与生产侧 player/42player-core.js L316-319 同口径：renderLog 可返回**条目数组**
                    // （如 ZHANG_SWITCH 一次返回"切换形态 + 语音"两条），必须展开后逐条入日志。
                    // 旧实现 `if (e) log.push(e)` 把整条数组当成**一个**条目塞进 log —— 该条目既无
                    // text 也无 entries，任何按文本/子条目扫描的规则都看不见它（静默丢失、假绿）。
                    if (Array.isArray(e)) { for (const one of e) { if (one) log.push(one); } }
                    else if (e) log.push(e);
                } catch (e) { /* 单条渲染失败不阻断 */ }
                // 嵌套子 fact 只取证、不入日志（它们本就由父 fact 的渲染器经 projectFactEntry
                // 装进 attack-group.entries，再入一次就重复了）
                collectNestedFacts(f.data, 0, new WeakSet(), probeRender);
            }
            if (step.winner) winner = step.winner;
        }
        if (winner || !lastStep) break;
        battleState = {
            ally: lastStep.ally.map(u => u.clone()),
            enemy: lastStep.enemy.map(u => u.clone()),
            round: battleState.round + 1,
            activeBuffs: tickAndPickBuffs(battleState.activeBuffs, lastStep.ally,
                battleState.round, seed, battleState.round % 3 === 0),
            allAllies: battleState.allAllies,
            _rng: rng
        };
    }
    const afterA = (lastStep ? lastStep.ally : battleState.ally).map(u => ({ ...u }));
    const afterE = (lastStep ? lastStep.enemy : battleState.enemy).map(u => ({ ...u }));
    const ctx = {
        gs: 'GAMEOVER', currentStage: stage,
        activeBuffs: battleState.activeBuffs || [],
        UI: { allyTeam: afterA, enemyTeam: afterE },
        _enhancedBattleLog: log
    };
    return { seed, stage, ctx, log, beforeA, beforeE, afterA, afterE };
}

const agg = {}, kwHit = {};
// fact 产出直方图：本批次每个 factType 实际进入日志的条数（顶层 fact + 嵌套子 fact）。
// 用途 —— 恒 skip 规则归因：规则空转有两种完全不同的根因，"规则逻辑写死 skip"（体检侧 bug，要改规则）
//   和"业务侧压根没把 fact 写进日志"（数据源缺失，改规则没用，得去 core/ 查）。没有这个直方图，
//   两者都只呈现为一句"恒 skip N 条"，无法定位。
// V6.1.25 修正计数口径：引擎除 push 顶层 fact 外，还把大量 fact 作为**子 fact** 嵌进父 fact 的 data 里
//   （`data.entries[]` / `data.phantomFact` / `data.dmgCalc.bonusEntries[]` 等），render/30 L200-204
//   对这些子条目逐条 `projectFactEntry` 渲染进 attack-group.entries —— 它们是**真实产出**、规则也真消费
//   得到。旧实现只数顶层 `f.factType`，把 16 类子 fact 误报成"零产出"，并据此把 `fortifyRebound`
//   （实产 21 条）、`zhangTaunt`（实产 36 条）当成"业务侧真未产出"写进待修清单移交（履历 V6.1.20 /
//   V6.1.24、复盘报告第 1~3 轮），业务侧照单去 core/ 查产出点必然白跑。现按"出现即计数"统计。
const factHist = {};        // factType -> 出现总条数（顶层 + 嵌套）
const factHistTop = {};     // factType -> 顶层 fact 条数
const factHistNested = {};  // factType -> 嵌套子 fact 条数
function noteFact(t, nested) {
    factHist[t] = (factHist[t] || 0) + 1;
    if (nested) factHistNested[t] = (factHistNested[t] || 0) + 1;
    else factHistTop[t] = (factHistTop[t] || 0) + 1;
}
// --- V6.1.27 渲染产出口径：引擎写了 fact ≠ 规则看得见条目 ---
// 三个口径分得很清，混在一起就是第 4~6 轮连续误判的根源：
//   factHist   —— 引擎有没有把 fact 写进 step.log（V6.1.25 起含嵌套子 fact）
//   renderOk   —— renderLog 真正给出了几条条目（规则能看见的量）
//   renderNull —— renderLog 返回 null/undefined/空数组（render/30 L828-830 未知类型即此路）
//   renderErr  —— renderLog 抛错（渲染器缺失 / 契约字段缺失）
// 注意：嵌套子 fact 会被渲染**两次**（父 fact 的渲染器内部 projectFactEntry 一次、本探测一次）。
//   这是刻意的——父渲染器对子条目有选择权（如 render/30 L200 单独处理 BREAK_DEF），
//   本口径问的是"渲染器**能不能**为这个 fact 产出条目"，与父渲染器这次用没用它无关，
//   所以两边计数不等属于正常，不是 bug；但因此 renderOk 会高于最终日志里的条目数，看绝对值时要记住。
const renderOk = {};    // factType -> renderLog 给出的条目总数
const renderNull = {};  // factType -> renderLog 返回空的 fact 次数（引擎产出但规则一条都看不见）
const renderErr = {};   // factType -> renderLog 抛错次数
const renderErrMsg = {};// factType -> 首条抛错原文（取证用：只给现象不给原因的清单等于没查，第 8 轮教训）
// 对单个 fact 节点取证渲染产出，返回 renderLog 原值（顶层 fact 要用它拼日志）。
// 抛错按"渲染未产出"计入，但不吞掉——顶层 fact 的调用方仍需拿到 null 走原有兜底。
function probeRender(t, data) {
    let out;
    try {
        out = renderLog(t, data);
    } catch (e) {
        renderErr[t] = (renderErr[t] || 0) + 1;
        if (!renderErrMsg[t]) renderErrMsg[t] = (e && e.message ? e.message : String(e)).slice(0, 160);
        return null;
    }
    const arr = Array.isArray(out) ? out.filter(Boolean) : (out ? [out] : []);
    if (arr.length) renderOk[t] = (renderOk[t] || 0) + arr.length;
    else renderNull[t] = (renderNull[t] || 0) + 1;
    return out;
}
// 递归收集父 fact 里内嵌的子 fact。三个守卫，各自必要性已用对照变体实测（第 8 轮探针）：
//   ① WeakSet 防环 —— **已被证明是必需的**：去掉后 120 场里 qianKunUpgraded 1531→4593、
//      qianKunBasic 6→18（同一子 fact 从多条路径可达 → 重复计数）。战斗数据里单位对象互相引用，
//      无此守卫不仅虚增，还可能在密集引用图上爆栈。
//   ② 跳过 `log` 键 —— 本批次实测**未生效**（去掉后 23 项计数逐条相同），但保留：这是仓库里
//      真实存在的形状而非猜测——`data.declarations` 会带着声明对象进 fact data（core/04 L194/L200），
//      而声明对象里直接挂着 step.log 本体的引用（modules/27 L256/L485 `{ …, log: data.log }`）……
//      一旦跟着它走，整条 step.log 会被当成"子 fact"重复计入。
//   ③ depth ≤ 8 —— 同样实测未生效（计数逐条相同），作为遍历深度上界保留。
function collectNestedFacts(node, depth, seen, onFact) {
    if (!node || typeof node !== 'object' || depth > 8) return;
    if (Array.isArray(node)) {
        for (const v of node) collectNestedFacts(v, depth + 1, seen, onFact);
        return;
    }
    if (seen.has(node)) return;
    seen.add(node);
    if (typeof node.factType === 'string') {
        // V6.1.27 判据修正：**声明（declaration）不是 fact**，旧判据 `typeof node.factType === 'string'`
        //   把两者混为一谈，导致同一个 rebound 被数两遍。证据（120 场路径探针实测）：
        //     core/12 L349-380 产出的是扁平声明 `{ type: EFFECT_TYPES.REBOUND, ..., factType, factData }`
        //     —— 注意字段叫 **factData 不叫 data**；core/10 L194-196 才把它转成真正的 fact
        //     `{ factType: decl.factType, data: decl.factData }` 并 push 进 group.data.entries。
        //   于是同一条巨马反伤在 fact 树里同时以"声明"和"fact"两种形态存在：
        //     horseRebound 144 = 72 声明 + 72 fact、fortifyRebound 190 = 30 声明 + 160 fact。
        //   而 renderLog / projectFactEntry 消费的永远是 `{factType, data}` 形态
        //   （render/30 L21、player/42 L316），故以「有没有 data」为界：有 data 才算 fact。
        //   全批次取证：无 data 的 factType 节点**只有**这两类声明，没有真 fact 被误伤。
        if (node.data && typeof node.data === 'object') {
            noteFact(node.factType, true);
            // 把找到的**每个 fact 节点**交给上层做渲染产出取证（嵌套子 fact 也逐个探测，
            //   否则"渲染器没给条目"这一类会整类漏报——顶层 fact 只是全部 fact 的一小部分）
            if (onFact) onFact(node.factType, node.data);
        }
        collectNestedFacts(node.data, depth + 1, seen, onFact);
        return;
    }
    for (const k of Object.keys(node)) {
        if (k === 'log') continue;
        collectNestedFacts(node[k], depth + 1, seen, onFact);
    }
}
let cases = 0;
for (const seed of SEEDS) {
    for (const stage of STAGES) {
        const c = runCase(seed, stage);
        cases++;
        // DUMP=seed:stage 单场调试：打印该场 buff-push/buff-swap 及相邻的攻击快照位置
        if (process.env.DUMP && process.env.DUMP === seed + ':' + stage) {
            console.log('--- DUMP ' + process.env.DUMP + ' 共 ' + c.log.length + ' 条 ---');
            c.log.forEach(function (e, i) {
                if (!e) return;
                if (e.type === 'buff-push') console.log(i + ' [push] ' + (e.text || '').replace(/<[^>]+>/g, '') + ' || pushUid=' + e.pushTargetUid + ' behindUid=' + e.behindUid + ' old=' + e.oldPos + ' new=' + e.newPos + ' behindOld=' + e.behindOldPos);
                else if (e.type === 'buff-swap') console.log(i + ' [swap] ' + (e.text || '').replace(/<[^>]+>/g, '') + ' || A=' + e.uidA + ' B=' + e.uidB + ' posA=' + e.oldPosA + ' posB=' + e.oldPosB);
                else if (e.type === 'attack-group' && e._fxSnapshot) console.log(i + ' [atk ] A=' + e.uidA + '@' + e._fxSnapshot.attackerPos + ' D=' + e.uidD + '@' + e._fxSnapshot.defenderPos);
            });
        }
        for (const kw of KEYWORDS) {
            for (const e of c.log) {
                if (e && typeof e.text === 'string' && e.text.indexOf(kw) !== -1) kwHit[kw] = (kwHit[kw] || 0) + 1;
            }
        }
        for (const r of rules) {
            let res;
            try {
                res = r.test(c.ctx, c.log, c.beforeA, c.beforeE, c.afterA, c.afterE);
            } catch (e) {
                res = { fail: true, msg: '规则抛异常: ' + (e.message || e) };
            }
            const st = (res === 'skip') ? 'skip' : (res && res.fail ? 'fail' : 'pass');
            const a = agg[r.name] || (agg[r.name] = { pass: 0, fail: 0, skip: 0, msgs: [] });
            a[st]++;
            if (st === 'fail' && a.msgs.length < 3) a.msgs.push(`[seed=${seed} stage=${stage}] ${(res.msg || '').slice(0, 160)}`);
        }
    }
}

console.log(`=== 规则回放自检：${cases} 场 / ${rules.length} 条规则 ===`);
let fails = 0, dead = 0;
const deadNames = [];
for (const name of Object.keys(agg)) {
    const a = agg[name];
    if (a.fail > 0) fails++;
    else if (a.pass === 0) { dead++; deadNames.push(name); } // 恒 skip = 空转规则，值得单独盯
    const tag = a.fail > 0 ? '❌' : (a.pass > 0 ? '✅' : '⏭ ');
    console.log(`${tag} ${name}  pass=${a.pass} fail=${a.fail} skip=${a.skip}`);
    for (const m of a.msgs) console.log(`      ${m}`);
}
if (KEYWORDS.length) {
    console.log('=== 关键字命中 ===');
    for (const kw of KEYWORDS) console.log(`  ${kw}: ${kwHit[kw] || 0}`);
}
// V6.1.16 恒 skip 名单化：此前只打印"恒 skip N 条"这个数字且退出码恒 0，
//   空转规则（120 场一次都没真正断言）照样显示"无失败规则"——体检自己假绿。
//   现在把名单列全，便于逐轮排查"回放覆盖不到"还是"规则逻辑写死 skip"；
//   DEAD=1 进入严格模式：存在空转规则即以非 0 退出，供 CI/自动化当红线用。
if (deadNames.length) {
    console.log('=== 恒 skip(空转)规则名单 ===');
    for (const n of deadNames) console.log('   ⏭ ' + n);
}
// V6.1.17 fact 覆盖归因（V6.1.23 修正归因口径 / V6.1.25 修正计数口径 / V6.1.26 改为机检归因）：
//   把"一次都没出现"的项单独列出来，并由 collectEmitSites 自动分成【本批次未触发】与【孤儿登记】两类。
//   ⚠ 这不是"业务侧数据源缺失"的同义词：本表统计的是**渲染前 fact**（含嵌在父 fact 里的子 fact），
//   而规则消费的是渲染后条目，两者不是同一个数据模型（复盘报告第 3 轮问题 A 的根因）。
//   V6.1.26 起归因由机器给出（附 file:line 证据），不再需要人工跑 KEYWORDS 探针逐条定性；
//   此前那段"四类成因自查"文字反而漏了占比最高的一类（回放没跑到该分支），是第 4/5 轮误判的源头，
//   已由下面的 V6.1.26 取证步骤取代。

// --- V6.1.26 产出点取证：把"零产出"清单从"待排查疑点"变成"已分好类的结论" ---
// 为什么必须有它：V6.1.23 已警告"零产出 ≠ 业务侧数据源缺失"并列了四类成因，但那是一段**给人读的文字**，
//   每轮都要人工重跑 KEYWORDS 探针才能定性，且清单里缺了最常见的一类——**本批次回放没跑到该分支**。
//   实测本批次 10 项零产出里 9 项属于这一类（如 xinHunDeath ← core/15 L454、flySkip ← core/10 L35、
//   spiderFly ← modules/27 L604 都有明确 emit 点，只是 120 场的阵容/条件没触发），
//   只有 meteorSplashGrowth 是全仓检索不到 emit 点的孤儿登记。此前遗漏这一类，正是第 4/5 轮把
//   129/134/141/143 错判成"业务侧数据源缺失"写进待修清单的直接来源。
// 判据（已做正对照验证，勿改成更宽的匹配）：
//   把 factType 值反查成 FACT_TYPES / FLY_MODE_TYPES 的常量名（代码写的是 FACT_TYPES.CLAW_HIT
//   而不是裸值 'clawHit'——按裸值搜会大面积漏判），再只认 **emit 赋值** `factType: FACT_TYPES.KEY`
//   （形如 log.push({ factType: … }) / { factType: …, data: … } 多行写法；渲染映射
//   `[FACT_TYPES.KEY]: (data)=>…` **不算**产出点，否则孤儿登记会被误判成"有产出点"）。
//   正对照：64 个本批次有产出的 factType 全部检出 emit 点（0 假阴性）。
// 返回 null = 源码读不到（目录布局不符），上层如实标注"取证跳过"，不猜不归类。
const SRC_DIRS = ['core', 'modules', 'infra', 'render', 'player', 'ui', 'fx'];
// 枚举定义处与契约登记处本身不是产出点，必须排除，否则"孤儿登记"永远查不出来
const SRC_SKIP = new Set(['infra/56-battle-enums.js', 'infra/58-fact-contract.js']);
let _srcTexts;
// 生产源码一次性读入并缓存：V6.1.26 的 emit 点检索与 V6.1.28 的可达性分析共用同一份，
//   避免同一批 79 个文件被读两遍（实测量级虽小，但两处各读一次容易出现"两处口径不一致"的隐患）
async function loadSourceTexts() {
    if (_srcTexts) return _srcTexts;
    const ROOT = fileURLToPath(new URL('../', import.meta.url));
    const texts = [];
    for (const d of SRC_DIRS) {
        let list = [];
        try { list = await readdir(ROOT + d + '/'); } catch (e) { _srcTexts = null; return null; }
        for (const f of list) {
            if (!f.endsWith('.js')) continue;
            const rel = d + '/' + f;
            if (SRC_SKIP.has(rel)) continue;
            try { texts.push([rel, await readFile(ROOT + rel, 'utf8')]); } catch (e) { _srcTexts = null; return null; }
        }
    }
    _srcTexts = texts.length ? texts : null;
    return _srcTexts;
}

async function collectEmitSites(names) {
    const texts = await loadSourceTexts();
    if (!texts) return null;
    const enums = [FACT_TYPES, FLY_MODE_TYPES];
    const out = {};
    for (const t of names) {
        const keys = [];
        for (const e of enums) for (const k of Object.keys(e || {})) if (e[k] === t) keys.push(k);
        const hits = [];
        for (const k of keys) {
            const re = new RegExp('factType:\\s*(?:FACT_TYPES|FLY_MODE_TYPES)\\.' + k + '\\b');
            for (const [rel, txt] of texts) {
                txt.split('\n').forEach(function (line, i) { if (re.test(line)) hits.push(rel + ':' + (i + 1)); });
            }
        }
        out[t] = hits;
    }
    return out;
}

// --- V6.1.28 emit 点可达性分析 ---
// 判据三级，从严到宽，**任一命中即判不可达**，全部落空才算"有产出点但本批次没跑到"：
//   ① 无调用者：emit 点所在函数在全仓没有任何调用点（`fn(` 形式，排除自身定义行）；
//   ② 门控无产出方：调用点存在，但**每一个**调用点都由 `X.type === '字面量'` 门控
//      （向上取最近的一条 === 字面量 判断），而该字面量在全仓检索不到 `type: '字面量'` 的产出方。
// 为什么只做这两级而不做完整调用图：完整静态可达性在 JS 上无解（高阶函数、事件总线、
//   动态派发），硬做会引入大量假阳性、反而制造新的"假红"。这两级的共同点是**证据可打印**——
//   输出里带函数名 / 调用点 file:line / 门控字面量，人工一眼可复核，不靠猜。
// 不作为（deliberately 不做）：不因为"某函数没被 import"就判死——ESM 动态 import、
//   eventBus.on(...) 注册都是合法可达路径，误判代价远高于漏判。

// 回溯 emit 行所在函数名：向上找最近一条函数/方法定义行，最多回溯 80 行（够覆盖仓库里最长的函数）
function enclosingFnName(lines, idx) {
    for (let i = idx; i >= 0 && i > idx - 80; i--) {
        const L = lines[i] || '';
        let m = L.match(/^\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/);
        if (m) return m[1];
        // 对象方法简写 `executeFly(unit, A, log) {` —— 排除 if/for/while 等控制结构误匹配
        m = L.match(/^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/);
        if (m && !/^(if|else|for|while|switch|catch|return|typeof|new|do)$/.test(m[1])) return m[1];
        m = L.match(/([A-Za-z_$][\w$]*)\s*:\s*(?:async\s+)?function\b/);
        if (m) return m[1];
        m = L.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\()/);
        if (m) return m[1];
    }
    return null;
}

// 查某个函数名在全仓的调用点（file:line）。同时试 "带下划线原名" 与 "去下划线名"：
//   仓库里 `_executeAttach` 定义、`executeAttach` 调用是同一对（core/11:321），只按原名搜会漏。
function findCallSites(fnName, texts, defRel, defIdx) {
    const names = [fnName, fnName.replace(/^_+/, '')].filter(Boolean);
    const out = [];
    for (const n of names) {
        const re = new RegExp('(?:^|[^A-Za-z_$])' + n.replace(/\$/g, '\\$') + '\\s*\\(');
        const declRe = new RegExp('function\\s*\\*?\\s*' + n.replace(/\$/g, '\\$') + '\\s*\\(');
        for (const [rel, txt] of texts) {
            const lines = txt.split('\n');
            lines.forEach(function (L, i) {
                if (rel === defRel && i === defIdx) return;      // 自身定义行
                if (declRe.test(L)) return;                       // `function name(` 声明
                if (re.test(L)) out.push(rel + ':' + (i + 1));
            });
        }
    }
    return out.filter(function (v, i, a) { return a.indexOf(v) === i; });
}

// 取调用点**向上最近**的一条 `type === '字面量'` 门控（window 行内）。
//   只向上、只取最近：core/11:319-323 是 if/else if 链，向下取整条链会同时抓到
//   'butterflyAttach'（无产出方）与 'butterflyReturn'（有产出方），从而误判为可达。
function gateLiteralAbove(lines, idx, window) {
    for (let i = idx; i >= Math.max(0, idx - window); i--) {
        const m = (lines[i] || '').match(/\.\s*type\s*===\s*['"]([^'"]+)['"]/);
        if (m) return m[1];
    }
    return null;
}

// 声明 type 的产出方有两种载体，缺一个就会大面积假阳性（第 11 轮实测踩到）：
//   ① JS 里 `type: 'chainClaw'` / `type: EFFECT_TYPES.X` —— 引擎内部补的声明；
//   ② **content/*.json 里 `"type": "chainClaw"`** —— 技能声明本来就是配置数据，
//      core/15 L390/L466 的 `declarations.filter(d => d.type === 'chainClaw'|'xinHun')`
//      消费的全是这一路。首版只搜 JS，把实产 421 条的 clawHit、20 场 pass 的 xinHunDeath
//      全误判成"不可达"（假红），加上 JSON 口径后二者正确回落【本批次未触发】。
let _jsonTexts;
async function loadJsonTexts() {
    if (_jsonTexts !== undefined) return _jsonTexts;
    const ROOT = fileURLToPath(new URL('../', import.meta.url));
    const out = [];
    try {
        const list = await readdir(ROOT + 'content/');
        for (const f of list) {
            if (!f.endsWith('.json')) continue;
            try { out.push(['content/' + f, await readFile(ROOT + 'content/' + f, 'utf8')]); } catch (e) { /* 单文件读不到不阻断 */ }
        }
    } catch (e) { /* content 目录不存在时按"无 JSON 产出方"处理，由调用方如实标注 */ }
    _jsonTexts = out;
    return out;
}

function hasTypeProducer(texts, lit) {
    const esc = lit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const reJs = new RegExp("type\\s*:\\s*['\"]" + esc + "['\"]");
    const reJson = new RegExp('"type"\\s*:\\s*"' + esc + '"');
    for (const [, txt] of texts) if (reJs.test(txt)) return true;
    for (const [, txt] of (_jsonTexts || [])) if (reJson.test(txt)) return true;
    return false;
}

// 对一组 factType 的 emit 点做可达性分析；返回 { t: { fn, sites, callSites, gate, verdict, detail } }
async function analyzeReachability(evidence) {
    const texts = await loadSourceTexts();
    if (!texts) return null;
    await loadJsonTexts();
    const byRel = {};
    for (const [rel, txt] of texts) byRel[rel] = txt.split('\n');
    const out = {};
    for (const t of Object.keys(evidence)) {
        const sites = evidence[t] || [];
        const res = { fn: null, sites: sites, callSites: [], gate: null, verdict: 'reachable', detail: '' };
        out[t] = res;
        if (!sites.length) continue;                       // 无 emit 点 = 孤儿登记，不归本层管
        const [rel, ln] = sites[0].split(':');
        const lines = byRel[rel];
        if (!lines) { res.detail = 'emit 点所在文件不可读'; continue; }
        const idx = parseInt(ln, 10) - 1;
        const fn = enclosingFnName(lines, idx);
        res.fn = fn;
        if (!fn) { res.detail = '回溯不到所在函数（取证不足，不作判定）'; continue; }
        const fnIdx = (function () { for (let i = idx; i >= 0; i--) { const L = lines[i] || ''; if (L.indexOf(fn + '(') !== -1 || L.indexOf('function ' + fn) !== -1) return i; } return -1; })();
        const callSites = findCallSites(fn, texts, rel, fnIdx);
        res.callSites = callSites;
        if (!callSites.length) {
            res.verdict = 'no-caller';
            res.detail = '所在函数 ' + fn + ' 全仓无调用点';
            continue;
        }
        // 逐个调用点查门控；只要有一个调用点不被"无产出方的门控"挡住，就判可达
        const gateHits = [];
        let anyOpen = false;
        for (const cs of callSites) {
            const [cRel, cLn] = cs.split(':');
            const cLines = byRel[cRel];
            if (!cLines) { anyOpen = true; continue; }
            const g = gateLiteralAbove(cLines, parseInt(cLn, 10) - 1, 5);
            if (!g) { anyOpen = true; continue; }
            gateHits.push(g + '@' + cs);
            if (hasTypeProducer(texts, g)) { anyOpen = true; }
        }
        if (!anyOpen) {
            res.verdict = 'gate-unreachable';
            res.gate = gateHits.map(function (h) { return h.split('@')[0]; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
            res.detail = '所在函数 ' + fn + ' 的 ' + callSites.length + ' 个调用点全部被 '
                + res.gate.join(' / ') + ' 门控，且全仓检索不到该 type 的产出方';
        } else {
            res.detail = '所在函数 ' + fn + ' 有可达调用点 ' + callSites.slice(0, 2).join(' , ');
        }
    }
    return out;
}

const registered = Object.keys(FACT_SPECS || {});
const produced = Object.keys(factHist);
const onlyNested = produced.filter(t => !factHistTop[t]);
const zeroFacts = registered.filter(t => !factHist[t]);
// PROBE_ZERO=a,b,c 取证自检：对任意名字跑一遍产出点分类（允许传合成名/已产出名），验证判据不是"一律有产出点"
//   负向用例约定：不存在的名字必须落进【孤儿登记】；真实有产出的名字必须落进【本批次未触发】；
//   已确认的死通道（spiderFly / butterflyNoHost）必须落进【不可达 emit 点】——三者互换即判据失效
const zeroFactsList = process.env.PROBE_ZERO ? process.env.PROBE_ZERO.split(',') : zeroFacts;
const unknownFacts = produced.filter(t => registered.indexOf(t) === -1);
console.log(`=== fact 覆盖：本批次引擎产出 ${produced.length} 种 / 契约登记 ${registered.length} 种 / 渲染出条目 ${Object.keys(renderOk).length} 种 ===`);
console.log(`   引擎计数口径：顶层 fact + 嵌在父 fact data 里的子 fact（V6.1.25）；其中仅以嵌套形式出现的 ${onlyNested.length} 种`);
console.log('   渲染计数口径（V6.1.27）：对每个 fact 节点单独调 renderLog 取证，与"引擎有没有产出"分列——两者不等号才说明渲染器吞了');
if (zeroFactsList.length) {
    const probeMode = !!process.env.PROBE_ZERO;
    console.log(`   零产出 factType（${zeroFactsList.length} 种 · 本批次 fact 树上一次未出现，≠ 业务侧数据源缺失${probeMode ? ' · PROBE_ZERO 取证自检模式' : ''}）：`);
    const evidence = await collectEmitSites(zeroFactsList);
    if (evidence === null) {
        // 源码不可读（非标准目录布局）时不猜，如实说明取证未做
        console.log('     ↳ 产出点取证跳过：未能读取生产源码目录，本清单不作归因，请勿据此下结论');
        for (const t of zeroFacts) console.log('      ⚠ ' + t);
    } else {
        const withEmit = zeroFactsList.filter(t => (evidence[t] || []).length > 0);
        const orphan = zeroFactsList.filter(t => !evidence[t] || evidence[t].length === 0);
        // V6.1.28：有 emit 点 ≠ 这行代码还活着。先过一遍可达性，把死通道从"覆盖不足"里剔出去，
        //   否则会给出"加 SEEDS/STAGES"这种**永远做不到**的补救（spiderFly / butterflyNoHost 就是）。
        const reach = await analyzeReachability(withEmit.reduce(function (acc, t) { acc[t] = evidence[t]; return acc; }, {}));
        const uncovered = [];
        const unreachable = [];
        for (const t of withEmit) {
            const r = reach && reach[t];
            if (r && (r.verdict === 'no-caller' || r.verdict === 'gate-unreachable')) unreachable.push(t);
            else uncovered.push(t);
        }
        if (unreachable.length) {
            console.log(`     【不可达 emit 点】${unreachable.length} 种 —— 有 emit 赋值，但该函数在现行调用链上跑不到：`);
            console.log('       → **不是覆盖不足**，加再多 SEEDS/STAGES 也永远碰不到；报业务侧：补产出方让门控成立，或删死通道及其契约登记');
            for (const t of unreachable) {
                const r = reach[t];
                console.log('       ✗ ' + t + ' ← ' + evidence[t].slice(0, 1).join(''));
                console.log('           取证：' + r.detail
                    + (r.callSites.length ? '（调用点 ' + r.callSites.slice(0, 3).join(' , ') + '）' : ''));
            }
        }
        if (uncovered.length) {
            console.log(`     【本批次未触发】${uncovered.length} 种 —— 全仓有**可达** emit 点，120 场只是没跑到该分支：`);
            console.log('       → 属**回放覆盖不足**（阵容/条件未触发），补救是加 SEEDS/STAGES 或针对该分支构造场景；不是业务侧缺失，勿移交');
            for (const t of uncovered) console.log('       • ' + t + ' ← ' + evidence[t].slice(0, 2).join(' , '));
        }
        if (orphan.length) {
            console.log(`     【孤儿登记】${orphan.length} 种 —— FACT_SPECS 有登记、全仓检索不到任何 emit 点：`);
            console.log('       → 属 infra/58 契约登记的数据卫生问题（可能已被别的通道取代），由 infra 侧核对增删，规则侧无从补产');
            for (const t of orphan) console.log('       ✗ ' + t);
        }
    }
} else {
    console.log('   全部登记 factType 均有产出');
}
// --- V6.1.27【渲染未产出条目】：引擎给了、渲染器没给 —— 规则真正看不见的那一类 ---
// 与上面的【本批次未触发】/【孤儿登记】是并列的三类，且这一类**优先级最高**：
//   前两类规则至少还可能在别的批次/别的场景下跑到，这一类无论跑多少场都恒为 0 条。
//   render/30 L828-830 对未知 factType 直接 `console.error` + `return null`、L834 渲染器缺失 throw、
//   渲染器自身也可能返回 null/空数组 —— 三种都在这里现形。
const renderZero = produced.filter(t => (renderNull[t] || 0) + (renderErr[t] || 0) > 0)
    .sort((a, b) => ((renderNull[b] || 0) + (renderErr[b] || 0)) - ((renderNull[a] || 0) + (renderErr[a] || 0)));
// 静音原因取证：光报"渲染没给条目"是把皮球踢回人工（第 4~6 轮就是这么栽的），必须由机器给出证据。
//   反查 FACT_SPECS[t].renderFn → 在 render/ 里定位该函数体 → 看有没有显式 `return null`：
//   有 = 渲染器**有意静音**（如 mindControlBanner "横幅由 stageAction 显示"、spiderStrike "由导演驱动特效"），
//   这类不是 bug，但对规则侧是**永久盲区**——谁想基于它写规则都会恒 skip；
//   没有 = 走 switch/条件分支自然落空（如 buffSummary 某 buff 本轮无适用存活单位），属条件性静音。
async function collectRenderSilence(types) {
    const ROOT = fileURLToPath(new URL('../', import.meta.url));
    let list = [];
    try { list = await readdir(ROOT + 'render/'); } catch (e) { return null; }
    const texts = [];
    for (const f of list) {
        if (!f.endsWith('.js')) continue;
        try { texts.push(['render/' + f, await readFile(ROOT + 'render/' + f, 'utf8')]); } catch (e) { return null; }
    }
    if (!texts.length) return null;
    const out = {};
    for (const t of types) {
        const fnName = (FACT_SPECS[t] || {}).renderFn;
        if (!fnName) { out[t] = { fn: null, retNull: null }; continue; }
        let hit = null;
        for (const [rel, txt] of texts) {
            const lines = txt.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (!new RegExp('function\\s+' + fnName + '\\s*\\(').test(lines[i])) continue;
                for (let j = i + 1; j < lines.length; j++) {
                    if (/^}/.test(lines[j])) break;                 // 函数体结束（顶格 }）
                    if (/return\s+null\b/.test(lines[j])) { hit = rel + ':' + (j + 1); break; }
                }
                if (hit) break;
            }
            if (hit) break;
        }
        out[t] = { fn: fnName, retNull: hit };
    }
    return out;
}
if (renderZero.length) {
    console.log(`   【渲染未产出条目】${renderZero.length} 种 —— 引擎写进日志了，renderLog 却没给出条目：`);
    console.log('       → 这是**规则真正看不见**的一类；下面是机器取证出的静音性质，先看清再定性，别再当"业务侧缺失"往外甩');
    const silence = await collectRenderSilence(renderZero);
    for (const t of renderZero) {
        const okN = renderOk[t] || 0, nullN = renderNull[t] || 0, errN = renderErr[t] || 0;
        const kind = okN === 0 ? '渲染器恒无输出' : `条件性静音（${nullN}/${factHist[t]} = ${Math.round(nullN / factHist[t] * 100)}%）`;
        console.log(`       ✗ ${t}（引擎 ${factHist[t]} 条 · 渲染出条目 ${okN} · 返回空 ${nullN} · 抛错 ${errN}）→ ${kind}`);
        if (errN > 0) console.log(`           抛错原文：${renderErrMsg[t] || '（未捕获）'}`);
        const s = silence && silence[t];
        const alwaysMuted = okN === 0;
        if (s && s.fn && s.retNull && alwaysMuted) {
            console.log(`           取证：${s.fn} 恒 return null（${s.retNull}）+ 本批次 0 条产出 —— **有意不落日志**，对规则是永久盲区，别基于它写规则`);
        } else if (s && s.fn && s.retNull) {
            console.log(`           取证：${s.fn} 兜底分支 return null（${s.retNull}）—— 属条件性落空（默认分支/适用单位为空），不是恒盲区`);
        } else if (s && s.fn) {
            console.log(`           取证：${s.fn} 无显式 return null —— 条件分支自然落空${alwaysMuted ? '，但本批次 0 条产出，需查渲染器' : '，属正常'}`);
        } else if (s) {
            console.log('           取证：FACT_SPECS 未登记 renderFn（infra/58 L162 会填 () => null）');
        } else {
            console.log('           取证跳过：未能读取 render/ 源码');
        }
    }
} else {
    console.log('   【渲染未产出条目】0 种 —— 本批次凡引擎产出的 fact 都渲染出了条目');
}
// PROBE_RENDER=a,b 渲染产出自检：对任意名字按**同一判据**跑一遍，验证判据不是"一律算有产出"也不是"一律算没产出"。
//   约定用例：不存在/伪造的名字必须落进"返回空"；真实有产出的名字必须落进"渲染出条目"。
if (process.env.PROBE_RENDER) {
    const probeRenderList = process.env.PROBE_RENDER.split(',');
    console.log(`   PROBE_RENDER 渲染产出自检（${probeRenderList.length} 项）：`);
    // 每个名字探两次：`{}` 与 `undefined`。后者是**声明（declaration）形态**——V6.1.27 已把声明排除在
    //   fact 之外，所以正常跑 renderErr 恒 0；这里用 `undefined` 是为了确认**抛错分支本身是通的**
    //   （不是被吞掉的死代码）：渲染器拿到空 data 会 throw，必须落进 renderErr 而不是静默当 pass。
    for (const t of probeRenderList) {
        for (const [label, arg] of [['data={}', {}], ['data=undefined', undefined]]) {
            const okBefore = renderOk[t] || 0, nullBefore = renderNull[t] || 0, errBefore = renderErr[t] || 0;
            probeRender(t, arg);
            const dOk = (renderOk[t] || 0) - okBefore, dNull = (renderNull[t] || 0) - nullBefore, dErr = (renderErr[t] || 0) - errBefore;
            const verdict = dOk > 0 ? '渲染出条目' : (dErr > 0 ? '抛错' : '返回空');
            console.log(`       • ${t} [${label}] → ${verdict}（条目 ${dOk} · 返回空 ${dNull} · 抛错 ${dErr}）`);
        }
    }
}
if (onlyNested.length) {
    console.log(`   仅嵌套出现（${onlyNested.length} 种，顶层 0 条 · 曾被旧口径误报为零产出）：`);
    for (const t of onlyNested) console.log('      ↳ ' + t + ' ×' + factHist[t]);
}
if (unknownFacts.length) {
    console.log(`   契约外 factType（${unknownFacts.length} 种，未登记进 FACT_SPECS）：`);
    for (const t of unknownFacts) console.log('      ? ' + t + ' ×' + factHist[t]);
}
console.log(`RESULT: ${fails === 0 ? '无失败规则' : fails + ' 条规则报失败'}；恒 skip(空转)规则 ${dead} 条`);
process.exit(fails === 0 ? (STRICT_DEAD && dead ? 1 : 0) : 1);
