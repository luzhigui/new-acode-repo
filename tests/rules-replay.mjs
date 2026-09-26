// V6.3.0 | 2026-09-26 生死/血量一致性改为按 `_pendingDeath` 对齐设计内中间态（依据见 assertInvariants 注释）：
//          引擎致死统一挂 _pendingDeath 交 resolveDeaths 结算，「hp<=0 且 alive 仍 true」是**设计内中间态**
//          而非缺陷，旧判据把该窗口当回归 → 5 条误报；现判据与引擎同源（alive && !state._pendingDeath），
//          并新增「回合末仍存活但血空」兜底断言，覆盖"该结算的没结算"一类（不是放宽，覆盖面反而更准）。
//          另修正头/码矛盾：此前这里写了"hp 整数"，但该断言早已因 11901 条假阳性被删除（自述见下）。
// V6.2.0 | 2026-09-25 新增「不变量套件」：hp∈[0,maxHp] / maxHp>0 / pos 唯一 / facts 映射完整，
//          逐步断言（非终局快照），与机制规则分开报告并计入退出码。理由：中期越界后被修回的漂移
//          终局快照抓不到，且不变量本就与具体机制无关、成本极低覆盖面最大。
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

// 补 VER（第 21 轮）：此前本文件无 export const VER，tools/118 的版本头对账会漏掉它
export const VER = 'tests/rules-replay.mjs V6.3.0';

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
// 不变量用：查询某 factType 是否**注册了**渲染器（render/33:72）。
// 注意别用"本次渲染有没有产出"当映射缺口判据 —— buffSummary/mindControlBanner 都有注册渲染器
// （render/35:498/511），只是在无 buff / 无条件时合法地渲染为空（首版据此误报 929 条）。
const { getFactRenderer } = await import('../render/33-fact-registry.js');
// 不变量单一真值源：血量类不变量的唯一实现在 122 的 checkUnitHpValidity（含「maxHp 相对
// _baseMaxHp 膨胀」判据与 isWei 豁免）。回放侧直接复用，不再另写一份 —— 两处各写一份等于
// 同一批单位在浏览器体检和回放里跑出两套结论（第 21 轮统一）。
const { checkUnitHpValidity } = await import('./122health-utils.js');

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

// --- 不变量套件（V6.2.0）：与具体机制无关的低成本断言，逐步跑 ---
// ① 根因：过去体检只做"终局快照"比对 —— 中期越界后被自行修回的漂移，终局快照看不到；
//    且 hp 钳制/位置唯一这类不变量原先散落在各机制规则里，没有独立、每步都跑的断言。
// ② 口径/证据：引擎每次血量变动都 emit HP_CHANGE{hp,maxHp}（core/12:171/188/253/382），
//    回放里每一步都能拿到真实单位数组，故逐步断言几乎零成本、覆盖面最大。
// ③ 影响范围：不针对任何单一机制 —— 任何机制写坏了血量或占位都会在这里现形。
//    违规去重后汇总（同一步重复报没有意义），取不到字段时跳过而非伪造。
const invIssues = new Set();
const invUnmappedTypes = new Set();
let invUnmappedCount = 0;

function assertInvariants(units, round, seed, stage) {
    if (!Array.isArray(units)) return;
    const seenPos = new Map();
    for (const u of units) {
        if (!u) continue;
        const tag = `[seed=${seed} stage=${stage} round=${round}] `;
        // 血量类不变量直接复用 122 的唯一实现（钳制 + 膨胀 + isWei 豁免），此处不再复制一份。
        // 踩坑备忘（2026-09-25）：**不要**在这里另加"hp 必须为整数" —— 引擎内部 hp/maxHp 本就是
        //   浮点（maxHp 可 112.5，百分比治疗天然带小数），取整只在显示层 fmtHp。首版加了误报 11901 条。
        for (const msg of checkUnitHpValidity(u)) invIssues.add(tag + msg);
        // 注意（踩坑 2026-09-25）：**不要**断言 hp 为整数。引擎内部 hp/maxHp 本就是浮点
        //   （maxHp 可为 112.5，百分比治疗天然带小数），取整只发生在显示层 fmtHp 与伤害结算
        //   `hpAfter = Math.floor(target.hp) - dmg`。首版加了这条 → 120 场误报 11901 条，纯假阳性。
        // 生死与血量一致（第 23 轮加）：存活者 hp 应 >0、已阵亡者 hp 应 <=0。
        //   "活死人"（alive 但血空）与"带血尸体"（已死却还有血）都是明确的回归信号。
        // 生死与血量一致（第 23 轮加，第 24 轮按 _pendingDeath 对齐设计内中间态）。
        //   取证：此前 5 条违规经探针核证 **全部** `state._pendingDeath === true`（探针 _tmp-pending.mjs）。
        //   成因（业务侧 V7.4.5 / core/10 V6.3.3）：致死不再当场 `alive=false`，统一挂 `_pendingDeath`
        //   交 core/12 L413 `resolveDeaths` 结算（修「带血尸体」hp 不清零 + DEATH 信号不发两个洞）。
        //   于是「hp<=0 且 alive 仍 true」是**设计内中间态**——逐步断言恰落在这个窗口里，不是缺陷。
        //   这是口径对齐、不是放宽：引擎自己判"还能不能被选/被打"就是 `u.alive && !u.state._pendingDeath`
        //   （core/03 L63/L290、core/10 L59/L88、modules/27 L573/L737），体检沿用同一契约，不另立一套。
        //   故真正的红线收窄为：**血已空、却既没标记待死也没结算** → 死亡结算链路断了。
        const isPendingDeath = !!(u.state && u.state._pendingDeath);
        if (u.alive === true && !(u.hp > 0) && !isPendingDeath) {
            invIssues.add(tag + (u.name || u.uid) + ' 空血却未标记待死（死亡结算断链）：hp=' + u.hp);
        }
        if (u.alive === false && u.hp > 0) {
            invIssues.add(tag + (u.name || u.uid) + ' 已阵亡但 hp>0：' + u.hp);
        }
        // 累计统计不得为负（第 23 轮）。注意**不能**写成"单调不减"：core/13:55-59 有
        //   `case 'immuneRollback'`（免疫回退：承伤已记、只退输出），会刻意把 dmgDealt
        //   `Math.max(0, x - amount)` 减回去 —— 首版按"单调不减"写，120 场误报 **44 条**，已作废。
        //   作者既已用 Math.max(0,..) 兜底，真正成立的不变量就是"不为负"：
        //   一旦兜底被撤，统计就会漏出负值，这条能抓住。
        for (const k of ['dmgDealt', 'dmgTaken', 'healDone']) {
            if (typeof u[k] === 'number' && u[k] < 0) {
                invIssues.add(tag + (u.name || u.uid) + ' 累计 ' + k + ' 为负：' + u[k]);
            }
        }

        // pos 唯一：同阵营内两个活人不能占同一格
        if (u.pos != null && u.alive !== false) {
            const key = (u.camp || '?') + '#pos' + u.pos;
            if (seenPos.has(key)) invIssues.add(tag + (u.name || u.uid) + ' pos 冲突: 格 ' + u.pos + ' 与 ' + seenPos.get(key) + ' 重叠');
            else seenPos.set(key, u.name || u.uid);
        }
    }
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
                try {
                    const e = renderLog(f.factType, f.data);
                    // 不变量：factType 声明并发射了，但压根**没注册渲染器** = facts 映射缺口。
                    // 只看注册与否，不看本次产出（有注册器但本次渲染为空是合法的条件性产出）。
                    if (!getFactRenderer(f.factType)) {
                        invUnmappedCount++;
                        invUnmappedTypes.add(f.factType);
                    }
                    // 渲染函数可能返回「数组」（如 renderZhangSwitchFact 返回 [切换行, 台词行] 两件套）：
                    // 旧版直接 log.push(e) 会把数组当单条目压入，数组元素自身既无 .text 也无标记位，
                    // 导致所有"锚点落在数组元素上"的规则恒空转（134/143 同款病）。此处摊平后再压入。
                    if (Array.isArray(e)) { for (const one of e) { if (one) log.push(one); } }
                    else if (e) log.push(e);
                } catch (e) { /* 单条渲染失败不阻断 */ }
            }
            // 不变量：每步断言一次（比"每回合末"更细 —— 中期越界后被修回也能抓到）
            assertInvariants([...(step.ally || []), ...(step.enemy || [])], battleState.round, seed, stage);
            if (step.winner) winner = step.winner;
        }
        // 回合末兜底断言（第 24 轮）：本回合**正常打完**（无胜者、即将进入下一回合）时，不应再有
        //   「存活但血空」单位——连仍挂 _pendingDeath 的也不该留下：core/12 有"回合循环内 + 回合结束兜底"
        //   双路径，待死单位到回合末必被结算。这条补回"标记了却没人结算"那一类，避免上面按 _pendingDeath
        //   放行后该情形就此失去覆盖。
        //   有胜者时跳过：胜负已分即战斗终止，最后一击的待死单位本就不再结算，属正常收尾而非缺陷。
        if (!winner && lastStep) {
            for (const u of [...(lastStep.ally || []), ...(lastStep.enemy || [])]) {
                if (!u) continue;
                if (u.alive === true && !(u.hp > 0)) {
                    invIssues.add(`[seed=${seed} stage=${stage} round=${battleState.round}] `
                        + (u.name || u.uid) + ' 回合末仍存活但血空（结算未兜底）：hp=' + u.hp
                        + (u.state && u.state._pendingDeath ? ' [_pendingDeath=true]' : ''));
                }
            }
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
        // 开局快照：语义务必取自 ui/61main-5v5-test.js:392-393 的注释 ——
        //   「战斗进行中 snapshot 不反映当前态」、snapshot.enemy 是 Object.freeze 的定稿。
        //   故这里喂**开战定稿**（beforeA/beforeE），**不是**终局单位 —— 喂终局会伪造口径。
        //   补充动机：回放原先根本没造 snapshot，导致 134/139 里依赖它的判据全程静默不执行
        //   （回放侧假绿），覆盖率缺口不可见。补上后这部分判据才真正参与。
        snapshot: { ally: beforeA, enemy: beforeE },
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

// --- 不变量报告（与机制规则分开报，不混进规则 pass/fail 计数）---
console.log('=== 不变量（逐步断言）===');
if (invUnmappedCount) {
    console.log(`  ❌ facts 映射缺口：${invUnmappedCount} 条声明渲染无产出，涉及类型：${[...invUnmappedTypes].join(', ')}`);
}
if (invIssues.size) {
    const arr = [...invIssues];
    for (const m of arr.slice(0, 12)) console.log('  ❌ ' + m);
    if (arr.length > 12) console.log(`  … 另有 ${arr.length - 12} 条同类`);
} else {
    console.log('  ✅ hp∈[0,maxHp] / hp 整数 / maxHp>0 / pos 唯一 / facts 映射完整 —— 全部通过');
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
const invFail = invIssues.size + (invUnmappedCount ? 1 : 0);
console.log(`RESULT: ${fails === 0 ? '无失败规则' : fails + ' 条规则报失败'}；恒 skip(空转)规则 ${dead} 条` +
    `；不变量违规 ${invIssues.size} 类${invUnmappedCount ? ' / facts 映射缺口 ' + invUnmappedCount + ' 条' : ''}`);
process.exit((fails === 0 && invFail === 0) ? 0 : 1);
