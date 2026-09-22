// V6.1.24 | 规则回放自检（开发用 runner，不参与游戏运行）
// 用法：node tests/rules-replay.mjs           （默认 20 个种子 × 1~6 关 = 120 场）
//      SEEDS=1,2,3 STAGES=2,4 node tests/rules-replay.mjs
//      KEYWORDS=新婚|苦练 node tests/rules-replay.mjs   （额外统计战报文本关键字命中数）
//      DEAD=1 node tests/rules-replay.mjs              （严格模式：有恒 skip 空转规则即非 0 退出）
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
import { readdir } from 'node:fs/promises';
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
    { STORE_ACTION_TYPES, CAMP_TYPES, BUFF_TYPES }, { FACT_SPECS }] = await Promise.all([
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
                factHist[f.factType] = (factHist[f.factType] || 0) + 1;
                try {
                    const e = renderLog(f.factType, f.data);
                    // 与生产侧 player/42player-core.js L316-319 同口径：renderLog 可返回**条目数组**
                    // （如 ZHANG_SWITCH 一次返回"切换形态 + 语音"两条），必须展开后逐条入日志。
                    // 旧实现 `if (e) log.push(e)` 把整条数组当成**一个**条目塞进 log —— 该条目既无
                    // text 也无 entries，任何按文本/子条目扫描的规则都看不见它（静默丢失、假绿）。
                    if (Array.isArray(e)) { for (const one of e) { if (one) log.push(one); } }
                    else if (e) log.push(e);
                } catch (e) { /* 单条渲染失败不阻断 */ }
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
// fact 产出直方图：本批次每个 factType 实际进入 step.log 的条数。
// 用途 —— 恒 skip 规则归因：规则空转有两种完全不同的根因，"规则逻辑写死 skip"（体检侧 bug，要改规则）
//   和"业务侧压根没把 fact 写进日志"（数据源缺失，改规则没用，得去 core/ 查）。没有这个直方图，
//   两者都只呈现为一句"恒 skip N 条"，无法定位。
const factHist = {};
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
// V6.1.17 fact 覆盖归因（V6.1.23 修正归因口径）：把"按原始 factType 统计为 0"的项单独列出来。
//   ⚠ 这不是"业务侧数据源缺失"的同义词：本表统计的是渲染前 factType，规则消费的是渲染后条目。
//   四类成因（①走 data.declarations 通道 / ②嵌在 entries 子层级 / ③规则扫错层级 / ④业务侧真未产出）
//   必须先取证分开，① ② ③ 都属体检侧或回放侧问题，改规则/改回放就能修，误移交业务侧只会空转。
const registered = Object.keys(FACT_SPECS || {});
const produced = Object.keys(factHist);
const zeroFacts = registered.filter(t => !factHist[t]);
const unknownFacts = produced.filter(t => registered.indexOf(t) === -1);
console.log(`=== fact 覆盖：本批次产出 ${produced.length} 种 / 契约登记 ${registered.length} 种 ===`);
if (zeroFacts.length) {
    console.log(`   零产出 factType（${zeroFacts.length} 种 · 按原始 factType 统计为 0，≠ 业务侧数据源缺失）：`);
    console.log(`     ↳ 成因四类：① data.declarations 等非 step.log 通道 ② 嵌在 group.entries 子层级 ③ 规则扫错层级 ④ 业务侧真未产出`);
    console.log(`     ↳ 先用 KEYWORDS=文本 探针排除 ①②③，全排除后才归 ④ 去 core/ 查产出点，勿直接移交业务侧`);
    for (const t of zeroFacts) console.log('      ⚠ ' + t);
} else {
    console.log('   全部登记 factType 均有产出');
}
if (unknownFacts.length) {
    console.log(`   契约外 factType（${unknownFacts.length} 种，未登记进 FACT_SPECS）：`);
    for (const t of unknownFacts) console.log('      ? ' + t + ' ×' + factHist[t]);
}
console.log(`RESULT: ${fails === 0 ? '无失败规则' : fails + ' 条规则报失败'}；恒 skip(空转)规则 ${dead} 条`);
process.exit(fails === 0 ? (STRICT_DEAD && dead ? 1 : 0) : 1);
