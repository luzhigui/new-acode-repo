// V6.1.11 | 规则回放自检（开发用 runner，不参与游戏运行）
// 用法：node tests/rules-replay.mjs           （默认 20 个种子 × 1~6 关 = 120 场）
//      SEEDS=1,2,3 STAGES=2,4 node tests/rules-replay.mjs
//      KEYWORDS=新婚|苦练 node tests/rules-replay.mjs   （额外统计战报文本关键字命中数）
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
    { STORE_ACTION_TYPES, CAMP_TYPES, BUFF_TYPES }] = await Promise.all([
        import('../core/01config-5v5-test.js'),
        import('../infra/51-core-utils.js'),
        import('../core/11battle-round.js'),
        import('../modules/29battle-init.js'),
        import('../render/30-fact-renderer.js'),
        import('../modules/24battle-store.js'),
        import('../core/17-state-keys.js'),
        import('../infra/54-global-store.js'),
        import('../infra/56-battle-enums.js')
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

// --- 团队海克斯 Buff 注入（V6.1.12）---
// 为什么要有它：回放器此前 activeBuffs 恒为 []，而流星赶月/乘风突袭/流云身法/概率连击/巨马阵
//   这一整批机制全部由团队 Buff 门控，于是 11 条规则 120 场一次都跑不到（恒 skip 空转）。
// 口径来源：tools/116-role-balance-worker.js 的跑批写法 + player/49battle-flow.js 的全自动选 Buff
//   口径（过滤已有 key 与 BUFF_ROLE_REQUIREMENTS 的职业要求，duration 取 buff 自带或 BUFF_DURATION）。
//   每回合递减 remaining（过期淘汰），每 3 回合为明教/六大派各补选一个（与 player/42 的
//   `round % 3 === 0` 补选节奏一致），并按「已选轮次」轮转键名，让 11 个 Buff 都能轮到。
// 注意：这里用 seed/round 确定性轮转，不消耗战斗 RNG —— 否则会改变战斗随机序列，破坏可复现性。
function tickAndPickBuffs(activeBuffs, ally, enemy, round, seed, pickNew) {
    var next = (activeBuffs || []).map(function (b) { return { ...b, remaining: b.remaining - 1 }; })
        .filter(function (b) { return b.remaining > 0; });
    if (NOBUFFS || !pickNew) return next;
    var turn = Math.floor(round / 3); // 第几次补选（round=1 预注入时为 0，其后 3/6/9… 递增）
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
        round: 1, activeBuffs: tickAndPickBuffs([], allyTeam, enemyTeam, 1, seed, true),
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
                try { const e = renderLog(f.factType, f.data); if (e) log.push(e); } catch (e) { /* 单条渲染失败不阻断 */ }
            }
            if (step.winner) winner = step.winner;
        }
        if (winner || !lastStep) break;
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
for (const name of Object.keys(agg)) {
    const a = agg[name];
    if (a.fail > 0) fails++;
    else if (a.pass === 0) dead++; // 恒 skip = 空转规则，值得单独盯
    const tag = a.fail > 0 ? '❌' : (a.pass > 0 ? '✅' : '⏭ ');
    console.log(`${tag} ${name}  pass=${a.pass} fail=${a.fail} skip=${a.skip}`);
    for (const m of a.msgs) console.log(`      ${m}`);
}
if (KEYWORDS.length) {
    console.log('=== 关键字命中 ===');
    for (const kw of KEYWORDS) console.log(`  ${kw}: ${kwHit[kw] || 0}`);
}
console.log(`RESULT: ${fails === 0 ? '无失败规则' : fails + ' 条规则报失败'}；恒 skip(空转)规则 ${dead} 条`);
process.exit(fails === 0 ? 0 : 1);
