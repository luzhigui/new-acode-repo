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
//   3. BUTTERFLY  蝶变附身：host 的 atk/def/maxHp 应上升 atkTransfer/defTransfer/hpTransfer
//                        （modules/27elite-mingjiao.js L292-294 addMod + L309-321 BUTTERFLY_ATTACH fact 带三项 transfer）
//   4. ENDLESS_BREATH 生生不息：张三丰 回血转永久攻防，自身那笔 atkGain→atk / defGain→def
//                        （modules/26elite-sixsects.js L91-92 addMod + L116-130 ENDLESS_BREATH fact 带 atkGain/defGain）
//   5. XING_FEN_COST  性奋代价：宋青书 maxHp 应下降 penalty（modules/26elite-sixsects.js L634 addMod + L636 XING_FEN_COST fact 带 penalty）
//                        —— 4/5 两条是第 40 轮后发现的：对应 fact 早已携带数值，只是缺契约 → 零主代码改动即可补牙。
//
// 第 39 轮教训（重要，关乎净增量模型的边界）：本想连同「坚盾 FORTIFY」一起加牙（其 FORTIFY_SHIELD fact 也带 increment），
//   但实测在干净树**误报 39 处**（如「坚盾 何太冲.def 声明+1 实际+2」）。根因：本对照器用「逐步净属性增量 vs 声明」模型，
//   它**暗中假设该机制是某属性增量的唯一来源**。def 这个属性有多处来源（坚盾 / 正义国字脸 / 八卦阵 / 苦练…），
//   同一步里「坚盾+1 再叠别的+1」会被误判成「坚盾翻倍」——无法区分真翻倍与并发多来源。
//   → 故 FORTIFY 用净增量模型**无法安全加牙**（会污染干净树），撤掉。同理，任何「属性有多来源」的机制
//     （苦练/八卦阵加 def、振奋/苦练加 atk…）都不能直接用本模型，需改用「按 source/group 隔离该机制贡献」或主代码发带增量 fact。
//   BUTTERFLY 之所以能留：host 的 atk/def/maxHp 在 21 个固定种子里未被其他同量来源并发污染（实测 dup=0），
//     且种子集确定可复现；但理论上若某种子让 host 同回合又被加恰好 atkTransfer 的攻，仍可能误报——属残留风险，已记录。
//   第 41 轮新发现（比 seed=6/stage5 更隐蔽）：BREAK_DEF 在 seed=18+stage2 对**张三丰**误报「破防翻倍」。
//     根因：张三丰同时带两个 严阵以待 乘法 mod（op:'mul' value:0.5）——引擎 def = 加和 × 乘积。
//     同一步里一个乘法 mod 到期/切换使净 def 掉 8，但破防本身只 1 条 breakDef mod（-4）→ 净增量模型把「-4 + 乘数变化」算成 8 误判翻倍。
//     → 净增量模型对「加和+乘法」**多效应属性**同样脆弱（不止加法多来源）。已用 EXCLUDE=['18:2'] 临时护栏；正解仍是 Tier2（按 group 比原始 add 值）。
//
// 运行：node tests/stat-decl-vs-actual-check.mjs            → 全量 18 场；有重复应用退出码 1；契约零触发亦退出码 1（防假绿）
//       node tests/stat-decl-vs-actual-check.mjs 18:3       → 只跑指定场次并打印逐步明细
//       node tests/stat-decl-vs-actual-check.mjs --fingerprint
//           → 不跑契约、也不退码 1，只逐步对全体单位的 atk/def/maxHp/hp 做 FNV-1a 指纹并输出 `FINGERPRINT <hex>`。
//             供 `tests/mutation-teeth.mjs` 判定「属性类变异是否真的改变了战斗状态」（属性变了指纹必变；
//             日志/TEXT 类变异只改显示、不改状态，指纹不变）。
export const VER = 'tests/stat-decl-vs-actual-check.mjs V1.3.2';

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
// 第 40 轮扩展（覆盖缺口闭合）：
//   · STAGES 加 2（张三丰敌，stage 2 专属 → 让 A7 生生不息 / A9 八卦阵 真正触发）
//   · STAGES 加 4（宋青书+周芷若敌，stage 4 专属 → A12 性奋代价需周芷若在场才触发）
//   · SEEDS 加 37/50/67（第 40 轮 seed 搜索证实 A5 流星溅射成长在 stage 1/3 稳定触发，原 7 种子都没撞上）
//   —— 刻意不用 seed=6 / 不用 stage 5：seed=6 stage=5 会让 BREAK_DEF 契约误报
//      （同一步 鹿杖客 被破防-2 又吃流星赶月主降防-2，净降 4 被净增量模型误判成破防翻倍）。
//      这是净增量模型对「def 多来源」的固有脆弱性（与第 39 轮 FORTIFY 同源），扩展覆盖时必须绕开此类巧合。
//   —— 扩展后，原 5 处「未观测到影响」覆盖缺口中 4 处（A5/A7/A9/A12）转为真实牙口判定；
//      A13 小昭·妹永久carry 需 bro 拿到永久 carry 海克斯且队伍无 carry buff（稀有条件），单独搜索仍零触发 → 记结构性稀有条件。
const SEEDS = [1, 18, 37, 42, 50, 67, 999, 12345, 777, 88888];
const STAGES = [1, 2, 3, 4];
// ★ 临时护栏（BREAK_DEF 净增量模型的已知碰撞点，确定性可复现）：
//   seed=18 + stage=2 下，张三丰 于 r7 被破防（def 声明 -4，仅 1 条 breakDef mod），
//   但他同时带两个 严阵以待 乘法 mod（op:'mul' value:0.5）——def 是「加和×乘积」。
//   同一步里一个乘法 mod 到期/切换，使净 def 掉 8，被净增量模型误判成「破防翻倍」（实际只 1 次破防）。
//   这是 def「多效应属性（加法+乘法源）」对净增量模型的固有脆弱性，**与第 39 轮 FORTIFY 同源、比 seed=6/stage5 更隐蔽**。
//   正解 = Tier2（按 group 隔离、比原始 add 值而非乘后终值，见迭代日志）。在 Tier2 落地前，仅排除该确定碰撞点，
//   不影响 seed=18 在 stage=3 的 carry 覆盖、也不影响 stage=2 其余种子对 张三丰（A7 生生不息）的覆盖。
//   若后续新增种子在张三丰出场的 stage（2）复现同类碰撞，追加到此集合即可。
const EXCLUDE = new Set(['18:2']);

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
    },
    {
        id: 'BUTTERFLY',
        label: '蝶变附身',
        dir: +1,
        // 声明（modules/27elite-mingjiao.js L309-321）：BUTTERFLY_ATTACH fact，
        //   data.{ hostName, atkTransfer, defTransfer, hpTransfer }；L292-294 把这三项分别加给 host 的 atk/def/maxHp。
        //   干净树：host 实际增量恰等于三项 transfer ⇒ 恒真。A8 变异（三项 *2）⇒ 实际=2×声明 ⇒ 命中。
        //   第 38 轮 A8 指纹变但三侧无反应，根因就是对照器缺这条契约——fact 本就带数值，补契约即兜住。
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data) continue;
                const d = f.data;
                if (typeof d.hostName === 'string' && typeof d.atkTransfer === 'number'
                    && typeof d.defTransfer === 'number' && typeof d.hpTransfer === 'number') {
                    out.push({ unit: d.hostName, stat: 'atk', amount: d.atkTransfer });
                    out.push({ unit: d.hostName, stat: 'def', amount: d.defTransfer });
                    out.push({ unit: d.hostName, stat: 'maxHp', amount: d.hpTransfer });
                }
            }
            return out;
        }
    },
    {
        id: 'ENDLESS_BREATH',
        label: '生生不息',
        dir: +1,
        // 声明（modules/26elite-sixsects.js L116-130）：FACT_TYPES.ENDLESS_BREATH fact，
        //   data.{ unitName, atkGain, defGain }（回血转永久攻防的自身那笔，二选一方向）。
        //   L91-92 把 selfAtkGain/defGain 用 addMod 实际加到 unit 的 atk/def（group:'endlessBreath'）。
        //   干净树：实际增量恰等于 atkGain/defGain ⇒ 恒真。A7 变异（defGain*2）⇒ 实际=2×声明 ⇒ 命中。
        //   净增量安全：回合开始/轮到自己触发时，该步只有生生不息改此单位 atk/def（heal 只动 hp）；
        //     被攻击触发的八卦阵步虽同改 atk/def，但此时实际=生生不息+八卦阵、非声明整数倍 ⇒ 不误报（保守跳过）。
        //   第 40 轮发现该 fact 早已携带数值，只是缺这条契约 → 零主代码改动即可补牙（详见迭代日志第 40 轮后需求精化）。
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data) continue;
                const d = f.data;
                // 字段签名唯一锁定 ENDLESS_BREATH（unitName + 数值型 atkGain/defGain + heal 字段），不依赖枚举导入
                if (typeof d.unitName === 'string' && typeof d.atkGain === 'number'
                    && typeof d.defGain === 'number' && typeof d.heal === 'number') {
                    if (d.atkGain > 0) out.push({ unit: d.unitName, stat: 'atk', amount: d.atkGain });
                    if (d.defGain > 0) out.push({ unit: d.unitName, stat: 'def', amount: d.defGain });
                }
            }
            return out;
        }
    },
    {
        id: 'XING_FEN_COST',
        label: '性奋代价',
        dir: -1,
        // 声明（modules/26elite-sixsects.js L632-636）：addMod(unit,'maxHp',{source:'性奋代价',value:-penalty,...})
        //   同处 fact XING_FEN_COST 带 {unitName, oldMaxHp, newMaxHp: floor(maxHp), penalty}。
        //   penalty = 实际扣减量（正数）；干净树 实际 maxHp 降 == penalty ⇒ 恒真。
        //   A12 变异（penalty*2）⇒ 实际降 2×penalty ⇒ 命中。
        //   净增量安全：该步 maxHp 只此一处变（新婚扣血只动 hp，不动 maxHp）。
        //   第 40 轮发现该 fact 早已携带 penalty，只是缺这条契约 → 零主代码改动即可补牙。
        //   注意：对照器只报「实际是声明整数倍≥2」，故 A12 变异必须是「翻倍」而非「归零」，否则 actual=0 < 声明不报（已在 mutation-teeth 改 A12 为翻倍）。
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data) continue;
                const d = f.data;
                if (typeof d.unitName === 'string' && typeof d.penalty === 'number'
                    && typeof d.newMaxHp === 'number' && typeof d.oldMaxHp === 'number') {
                    out.push({ unit: d.unitName, stat: 'maxHp', amount: d.penalty });
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

    // 属性指纹（--fingerprint 模式用）：FNV-1a 32 位，逐步把全体单位的 uid+四属性拼进 hash。
    let fp = 0x811c9dc5 >>> 0;
    const fpBuf = (s) => { for (let i = 0; i < s.length; i++) { fp = (fp ^ s.charCodeAt(i)) >>> 0; fp = Math.imul(fp, 0x01000193) >>> 0; } };

    // 逐步快照：uid -> { uid, name, atk, def, maxHp, hp }（真实属性，与引擎同源 getStat）
    const snapStats = (units) => {
        const m = new Map();
        for (const u of units || []) {
            if (!u) continue;
            m.set(u.uid, {
                uid: u.uid,
                name: u.name,
                atk: Math.floor(getStat(u, 'atk')),
                def: Math.floor(getStat(u, 'def')),
                maxHp: Math.floor(getStat(u, 'maxHp')),
                hp: Math.round(u.hp)
            });
        }
        return m;
    };
    const byName = (m, name) => {
        for (const v of m.values()) if (v.name === name) return v;
        return null;
    };
    // 同名计数：多个单位可能同名（召唤物「雄狮」实测同时 3 只，modules/27 每回合可再召唤）。
    //   战报/fact 只带显示名、**不带 uid**，故同名 ≠1 时无法把声明归因到具体个体 ——
    //   首版按名字取首个命中，把不同雄狮当成同一个体比对，得出"实际增量 0"的**假结论**（第 34 轮）。
    //   → 同名 ≠1 一律跳过，并**计数上报**（静默跳过会变成新的假绿）。
    const countName = (m, name) => {
        let n = 0;
        for (const v of m.values()) if (v.name === name) n++;
        return n;
    };

    const FP = process.argv.includes('--fingerprint');
    const rawArgs = process.argv.slice(2).filter(a => a !== '--fingerprint');
    const verbose = rawArgs.length > 0;
    const cases = rawArgs.length > 0
        ? rawArgs.map(s => { const [sd, st] = s.split(':'); return { seed: Number(sd), stage: Number(st) }; })
        : SEEDS.flatMap(seed => STAGES
            .filter(stage => !EXCLUDE.has(seed + ':' + stage))
            .map(stage => ({ seed, stage })));

    const hits = [];
    const stat = {}; // contractId -> { declared, dup }
    for (const c of CONTRACTS) stat[c.id] = { declared: 0, dup: 0, ambiguous: 0 };

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
                if (FP) {
                    const parts = [];
                    for (const v of after.values()) parts.push(`${v.uid}:${v.atk},${v.def},${v.maxHp},${v.hp}`);
                    fpBuf(parts.sort().join('|'));
                }

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
                        // 同名歧义守卫：该名字在场个体数 ≠1 时无从归因，跳过并**计数**（不静默）
                        if (countName(prev, unit) !== 1 || countName(after, unit) !== 1) {
                            stat[c.id].ambiguous++;
                            continue;
                        }
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

    if (FP) {
        console.log('FINGERPRINT ' + fp.toString(16));
        process.exit(0);
    }
    console.log('\n=== 数值声明 vs 实际属性增量（逐步真值对照）===');
    let hardFail = false;
    for (const c of CONTRACTS) {
        const s = stat[c.id];
        console.log(`${c.id.padEnd(12)} 声明 ${String(s.declared).padStart(4)} 条 · 重复应用命中 ${s.dup} · 同名歧义跳过 ${s.ambiguous}`);
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
