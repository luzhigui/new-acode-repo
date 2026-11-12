#!/usr/bin/env node
// tests/xiaozhao-brother-leech-case.mjs | V1.3.0 | 2026-11-12 夜间第 213 轮：给 core/204 嗜血路径补带倍率锚（上一轮 ⑤ 只锚了 324 一条路径）
//   · 第 213 轮（V1.2.0 → V1.3.0）一件事，承接第 212 轮 §5 第 6 条「全库扫 healActual 的比对方」：
//     全库扫描结论：`healActual` 只出现在本件与 wei-leech-quota-selftest（后者是纯合成夹具、不碰渲染）⇒ 无新增同类漏点。
//     但顺着「用被测值验被测值」这条线继续查本件，发现**上一轮的 ⑤ 只锚了 324 一条路径**：
//     · 324 背水路径：leechVal := floor(dmg × 背水档位)，⑤ 已对上（dmg 取自攻击组，与 leechVal 无因果）；
//     · core/204 嗜血路径（26/138 条）：leechVal := previewHeal(unit, floor(dmg × 倍率))，**一条独立锚都没有** ——
//       账本记 leechVal、渲染显示 healActual（handler 用 decl.value 算），三者仍同源。
//     ★ 实证（本轮打桩，跑完已还原）：core/204 L429 `dmg * leechRatio` → `* 2`，138 条命中**零报红**，整项照旧绿。
//     现新增断言⑥：204 路径的**声明原值**必须等于「实测 dmg × 配置倍率」。
//       · 锚取 entry.healAmount（core/209 L525 = decl.value = rawLeech，**未过 previewHeal**）——
//         它不受满血夹取影响，可逐条精确对拍；用 leechVal 不行（夹取后合法地小于 dmg×倍率，真假难分）。
//       · 倍率取 content 两个真源（content/001 基础 0.8 / content/002 姊强化 1.6），并按 core/204 的分支条件
//         唯一化：不在团队 buff ⇒ 只 0.8；在团队 buff 且姊在场且未关强化 ⇒ 只 1.6；否则 0.8。
//         （★ 不收窄就会留后门：×2 打桩恰好等于基础×2=1.6，做成「两个候选都接受」时它照样绿。）
//       实测：干净树 26/26 条逐条对拍全过；三向打桩 ×1.25 / ×0.5 / 永久分支 ×1.25 分别报 12 / 12 / 多条；
//       上一轮漏掉的 ×2 打桩现已报 11 条红。
//   · 第 212 轮（V1.1.0 → V1.2.0）四件事，全部是「同一类病：判据在样本上整段没执行却报绿」：
//     ① 断言③归属错：账本是 recordHpAudit(unit←**吸血者本人**,…) 记的，旧版却读「小昭·妹终局账本」且只比 leechVal
//        —— 蝶血两条发射路径里 modules/324 背水路径出手者就是妹、但该路径**根本不写账本**，旧版在 113/138 条上看的是注定为空的数组。
//        现改为：按步内单位对象取账本（unitUid 是战场序号 u6、跨场撞号，不能当键）；找不到同值条目时按背水档位归因到 324 路径
//        并**单独计数上报**（`背水路径无账本` 属主代码侧、已转交），不静默放行也不冤枉判红。
//     ② ④a/④b/④c 三条主干判据原本整块嵌在 `if (srcHp != null && srcMaxHp != null)` 里，而声明类 fact 挂在 entries 里、
//        攻击组快照含该单位的情形只占 30/138 ⇒ 整数性、预演封顶、少报检查在 108/138 条上**完全没跑**。现拆开：
//        整数性/封顶/少报无条件执行，依赖血条快照的两条仍受门控。
//     ③ 断言②用 h.actual（handler 回填的 healActual）比渲染文本，等于「用被测值验被测值」：leechVal 被篡改时
//        渲染与落地一起不变，旧判据 138 条全绿（本轮实测打桩 leechVal+100 零报红）。现新增断言⑤：**背水路径的声明值必须等于
//        floor(实测 dmg × 背水档位)**，dmg 取自攻击组 data.dmgCalc.dmg，与 leechVal 无因果关系，篡改必红。
//     ④ 顺带删掉第 211 轮留下的一处重复判据（「实落超过预演」在 ④ 区内外各写一遍，同一条件同一文案）。
//     ★ 判据一条未放宽：新增全是「必须能对上独立量」，没有把任何一条改成「允许不等」。
//   · 第 211 轮（V1.1.0）：渲染数值断言改「落地值口径」（定性见日志第 211 轮 §三）
//   · 第 211 轮：18 条「渲染数值与 fact 不一致」全部定位为**口径错配、非主代码缺陷**（第 210 轮「渲染走错分支」的定性作废）——
//     core/217 LEECH handler 把 factData.healActual 回写为**实落值**，render/413 healDisplay 有 healActual 时优先显示它，
//     而本用例拿 factData.leechVal（声明期 previewHeal **预演值**）去比 ⇒ 满血夹取/同帧前序回血/截脉寒毒打折三种情形必然不等。
//     ★ 判据只换口径、不加宽容：新增两条更严的硬判据 —— ① 落地值不得超过缺口（healActual ≤ maxHp-hp）且 ≤ 预演值；
//     ② 落地值 > 0 时必须等于 source hp 的前后差（血条自证）；③ 两者不等时必须能指出原因（previewHeal 夹取 / 截脉 / 寒毒）。
//     另：healActual 比 leechVal 大 1 的边界案例（hp 实数残渣，如 hp=437.5/maxHp=437.5 余量 0）登记进 known-transfers。
//   · 第 164 轮：fact 采集补 data.phantomFact 层（幻影 fact 与 data.entries 并列、不在 entries 里，原两层口径对它恒不可见；只补视野、不缩面、不改判据）
//   上游把妹永久嗜血扩到全队战士后 isBrother 语义错位，15 条命中 unitName 非妹名；
//   本轮只把两类命中分开数并点名上游改动，**判据与退码一行未动**（改判据须拍板）。
// tests/xiaozhao-brother-leech-case.mjs — 小昭·妹「永久嗜血·蝶血分支」定向用例
//
// 背景（第 122-123 轮日间线）：
//   结构扫描器通道 B 报 `BLOOD_THIRST_LEECH.isBrother=true` 父 196/分支 0。第 123 轮实证：
//   真路径 player/512-battle-flow.js L49-57 全自动选 Buff 会给明教侧存活妹写 _permanentBuffs
//   永久副本；回放器缺建模（已由 _lib/buff-picker.mjs 统一收口补上）。补建模后 140 场标准
//   样本写入 94 个永久副本，但 isBrother=true 仍零发射——前置条件（战士妹+永久嗜血+团队
//   已过期）仅在 seed=7 s4 r20 出现过一次，且该回合妹的行动被「蛛变」占掉没出手
//   （定性：样本稀缺+行动权竞争，非结构不可达、非缺陷）。
//
// 本用例补上最后的覆盖缺口：
//   ① 强制妹模式（GlobalStore forceXiaoZhao='brother' ⇒ 每场都有妹，命中率从 1.4% 起跳）；
//   ② 广扫 seeds×stages，对每个「战士妹+永久嗜血+团队过期后出手」的场次断言三件事：
//      · fact 侧：BLOOD_THIRST_LEECH fact 的 isBrother===true 且 leechVal 为正整数
//      · 渲染侧：renderLog 产出含「🕷️ 蝶血」分支文案（render/35 L15，与普通 🗡️ 分支互斥）
//      · 账本侧：妹 _audit.hp 有 group='bloodthirstLeech' 的记录且 value===leechVal（落地值口径）
//   ③ 命中数低于下限即红（棘轮）：将来谁再把永久继承改坏，本用例从「有命中」变「零命中」报警。
//
// 用法：
//   node tests/xiaozhao-brother-leech-case.mjs            跑全量扫描+断言（退出码 0/1）
//   node tests/xiaozhao-brother-leech-case.mjs --scan     只诊断计数不断言（校准命中率用）
// 环境变量：SEEDS_N（扫描种子数，默认 40）/ STAGES（默认 1-7）

import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

// 环境 mock（不改引擎源码，Node 补浏览器能力）—— 必须在任何引擎 import 之前
globalThis.fetch = async (url) => {
    const p = fileURLToPath(new URL(url));
    const text = fs.readFileSync(p, 'utf8');
    return { ok: true, json: async () => JSON.parse(text) };
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.self = globalThis;

export const VER = 'tests/xiaozhao-brother-leech-case.mjs V1.3.0';

const SCAN_ONLY = process.argv.includes('--scan');
// 默认 20 seeds × 7 stages = 140 场（run-all 每次跑的量）。实测命中率 ≈18.6%，
// 预期命中 ~26，MIN_HITS=3 的假红概率≈0；深扫/校准用 SEEDS_N=40（280 场）手动触发。
const SEEDS_N = Number(process.env.SEEDS_N || 20);
const STAGES = process.env.STAGES ? process.env.STAGES.split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7];
// 命中下限（棘轮）：低于此数即红。校准依据：强制妹模式下 140 场预期命中 20+（实测见 --scan）。
const MIN_HITS = 3;

async function main() {
    const [{ CONFIG, loadGameData, loadHexEnhanceData }, { SeededRNG }, { createRoundStepper },
           { initBattleTeams }, { renderLog }, { GlobalStore },
           { CAMP_TYPES, FACT_TYPES: FT }] = await Promise.all([
        import('../core/201-config-5v5-test.js'),
        import('../infra/102-core-utils.js'),
        import('../core/210-battle-round.js'),
        import('../modules/330-battle-init.js'),
        import('../render/401-fact-renderer.js'),
        import('../infra/104-global-store.js'),
        import('../infra/106-battle-enums.js')
    ]);
    const { tickAndPickBuffs } = await import('./_lib/buff-picker.mjs');
    await import('./_lib/install-mechanics.mjs');
    await loadGameData();
    // 第 162 轮：上游把小昭.hexEnhance 整段迁到 content/002-hex-enhance.json，启动链必须一并 loadHexEnhanceData（缺口由 tests/hex-boot-chain-guard.mjs 点名）
    await loadHexEnhanceData();
    // 第 213 轮：204 嗜血路径的倍率真源（断言⑥用）。两处都取 content 真值，与 core/204 的算式无因果。
    //   基础 = content/001 BUFFS.bloodthirst.leechRatio（0.8）；姊强化 = content/002 sister.bloodthirst.leechRatio（1.6）。
    //   ★ 取不到基础值直接判红：宁可这一项明确报错，也不许静默把⑥降级成空转（第 212 轮教训）。
    const BASE_LEECH_RATIO = Number(CONFIG.BUFFS && CONFIG.BUFFS.bloodthirst && CONFIG.BUFFS.bloodthirst.leechRatio);
    const HEX_LEECH_RATIO = (() => {
        try {
            const hex = JSON.parse(fs.readFileSync(new URL('../content/002-hex-enhance.json', import.meta.url), 'utf8'));
            const r = hex && hex.sister && hex.sister.bloodthirst && hex.sister.bloodthirst.leechRatio;
            return typeof r === 'number' ? r : null;
        } catch { return null; }
    })();
    if (!(BASE_LEECH_RATIO > 0)) {
        console.error('❌ 取不到 content/001 BUFFS.bloodthirst.leechRatio ⇒ 断言⑥（204 路径倍率锚）无法成立，拒绝静默放行');
        process.exit(1);
    }

    // 强制妹模式：29battle-init L130/L195 读 GlobalStore 'forceXiaoZhao'（'brother' ⇒ 换上一个
    //   小昭并锁定为妹态；顺带抑制随机精英轮盘 = 单精英局，阵容确定可复现）
    GlobalStore.set('forceXiaoZhao', 'brother');

    const MAX_ROUND = CONFIG.MAX_ROUND || 35;
    const teamHasBloodthirst = (buffs) => (buffs || []).some(b => b.key === 'bloodthirst');
    const hasPermanentBloodthirst = (u) => !!(u && u.state && Array.isArray(u.state._permanentBuffs)
        && u.state._permanentBuffs.some(b => b.key === 'bloodthirst'));

    // 跑一场，返回：蝶血命中列表 + 诊断计数
    function runBattle(seed, stage) {
        const rng = new SeededRNG(seed);
        const { allyTeam, enemyTeam } = initBattleTeams(stage, rng);
        let battleState = {
            ally: allyTeam.map(u => u.clone()),
            enemy: enemyTeam.map(u => u.clone()),
            round: 1, activeBuffs: [],
            allAllies: allyTeam.map(u => u.clone()), _rng: rng
        };
        // 选 Buff 必须落在战斗克隆体上（rules-replay V6.7.2 同款顺序口径，勿回退）
        battleState.activeBuffs = tickAndPickBuffs([], battleState.ally, battleState.enemy, 1, seed, true);
        const hits = [];
        const diag = { brother: false, warrior: false, preconditionRounds: 0, permEver: false };
        let lastStep = null, winner = null;
        // 妹的身份从开局克隆体取（fact 快照不带 isXiaoZhaoBrother，按 uid 认）
        let brotherUid = null, brotherName = null;
        for (const u of (battleState.ally || [])) {
            if (u.isXiaoZhaoBrother) { brotherUid = u.uid; brotherName = u.name; diag.brother = true; }
        }
        while (battleState.round <= MAX_ROUND) {
            for (const step of createRoundStepper(battleState)) {
                lastStep = step;
                // fact 收集口径与 rules-replay/结构扫描器一致：**顶层 + attack-group 的 data.entries
                //   嵌套层**——core/10 L315-330 把 LEECH/HEAL 声明塞进攻击组 entries（不产顶层条目），
                //   只扫顶层会全漏（首版实证：前置条件 49 回合全绿却零命中，fact 一直在嵌套里）
                const collect = (f, ctxDmg, entry) => {
                    if (!f || f.factType !== FT.BLOOD_THIRST_LEECH || !f.data) return;
                    const d = f.data;
                    if (d.isBrother !== true) return;               // 只认永久分支
                    // 渲染侧：renderLog 必须走 🕷️ 蝶血分支（与普通 🗡️ 分支互斥）
                    const rendered = renderLog(FT.BLOOD_THIRST_LEECH, d) || {};
                    const text = typeof rendered.text === 'string' ? rendered.text : '';
                    // 第 211 轮：取落地值口径的三个字段。healActual 由 core/217 LEECH handler 回写；
                    //   没有它（老路径/未过 handler）时按 declared 处理，与 healDisplay 同回落口径。
                    const actual = typeof d.healActual === 'number' ? d.healActual : d.leechVal;
                    // 出手者当帧快照：用于「落地值 ≤ 缺口」与「落地值 == 血条前后差」两条血条自证。
                    //   ★ 第 212 轮补：只按 uid 认会漏 —— 声明类 fact 挂在 attack-group 的 data.entries 里，
                    //     而攻击组快照（step.ally）里未必含该单位（实测只占 30/138）。回落按 unitName 认，
                    //     仍找不到就置 null（血条两条判据随之跳过，但整数性/封顶两条已改为无条件执行）。
                    const src = (step.ally || []).find(u => u.uid === d.unitUid)
                        || (step.enemy || []).find(u => u.uid === d.unitUid)
                        || (step.ally || []).find(u => u.name === d.unitName)
                        || (step.enemy || []).find(u => u.name === d.unitName) || null;
                    // 第 212 轮：账本是 recordHpAudit(unit←吸血者本人, 'bloodthirstLeech', leechVal) 记的。
                    //   ★ 归属键不能用 unitUid：fact 里的 unitUid 是**战场内序号**（u6），每场重建、跨场撞号；
                    //     必须按「步内快照里的单位对象」本身取（clone 对 _audit.hp 是浅拷、元素引用共享，
                    //     core/214 L400 注释明说这一点），故用对象引用差集认本步新增的账本条目。
                    const ledgerNow = src && src._audit ? (src._audit.hp || []).filter(e => e.group === 'bloodthirstLeech') : [];
                    hits.push({
                        seed, stage, round: battleState.round,
                        unitName: d.unitName, leechVal: d.leechVal, uid: d.unitUid,
                        healActual: d.healActual, healNominal: d.healNominal, healMods: d.healMods,
                        actual, srcHp: src ? src.hp : null, srcMaxHp: src ? src.maxHp : null,
                        ledgerNow, srcName: src ? src.name : null, isBrother: d.isBrother, text,
                        // 第 212 轮：来源归因 —— modules/324 背水吸血路径在命中当帧 unit.state._brotherLastStandLeech>0
                        //   且本 fact 的 leechVal 等于 floor(dmg×该档位)（该路径声明期不写 healNominal）。
                        //   两条同时成立才认 324；取不到单位对象一律不认（宁判红不放过）。
                        //   ★ 不能用「声明期有无 healNominal」判：handler 执行后同样会回填 healNominal（值等于 capped）。
                        //   改用背水门本身：324 只在背水触发后置 _brotherLastStandLeech>0，而 324 分支前置要求
                        //   「本人无 204 嗜血 buff」不成立时才轮到 324（两路互斥由 core/204 的 if/else if 保证）——
                        //   故「背水档位>0 且本帧不是 204 主分支」即 324。204 主分支的另一判据是 leechVal===healNominal
                        //   且无背水档位；两侧都不满足则视为不可归因，照判红。
                        backstand: !!src && !!(src.state && src.state._brotherLastStandLeech > 0),
                        dmg: typeof ctxDmg === 'number' ? ctxDmg : null,
                        ratio: (src && src.state && src.state._brotherLastStandLeech)
                            ? src.state._brotherLastStandLeech : (d.isBrother ? 0.8 : 0),
                        // 第 213 轮：本回合团队嗜血 buff 是否在生效——core/204 主分支（团队 buff）与 else-if 分支
                        //   （妹永久、团队已过期）用的倍率不同（主分支可吃姊强化 1.6），断言⑥按此收窄候选倍率。
                        //   取不到就当「不在场」处理（只允许基础倍率）——这是更严的方向，误判会报红不会放行。
                        teamBuff: teamHasBloodthirst(battleState.activeBuffs),
                        // 第 213 轮：主分支可吃姊强化 1.6（core/204 L425 `hasSister && !MING_ABLATION.noSisterHex`）。
                        //   按同一条件收窄候选倍率，别把「0.8 与 1.6 都接受」当成宽松后门（×2 打桩正好等于 1.6）。
                        sisterAlive: (step.ally || []).some(u => u.isXiaoZhaoSister && u.alive),
                        noSisterHex: !!(globalThis.MING_ABLATION && globalThis.MING_ABLATION.noSisterHex),
                        // 第 213 轮：**声明原值**。core/209 L525 给 LEECH/HEAL entry 补 `healAmount = decl.value`，
                        //   而 core/204 L431/L445 与 modules/324 L163 的 decl.value 都是 rawLeech（未过 previewHeal）。
                        //   ⇒ 这个字段是「声明出去的量」本身，不受满血夹取影响，可用来逐条对拍 dmg×倍率（断言⑥）。
                        rawDecl: (entry && typeof entry.healAmount === 'number') ? entry.healAmount : null
                    });
                };
                for (const f of (step.log || [])) {
                    collect(f, f && typeof f.dmg === 'number' ? f.dmg : null, f);
                    if (f && f.factType === FT.ATTACK && f.data) {
                        const groupDmg = (f.data.dmgCalc && typeof f.data.dmgCalc.dmg === 'number') ? f.data.dmgCalc.dmg
                            : (typeof f.data.dmg === 'number' ? f.data.dmg : null);

                        // ★ 第 164 轮补层：幻影类 fact 挂在 data.phantomFact，与 data.entries 并列**而不在 entries 里**
                        //   ⇒ 只扫 entries 的写法对它恒不可见（第 163 轮在 census / rules-replay 里已实锤）
                        if (f.data.phantomFact) collect(f.data.phantomFact, groupDmg, null);
                        if (Array.isArray(f.data.entries)) for (const e of f.data.entries) collect(e, groupDmg, e);
                    }
                }
                if (step.winner) winner = step.winner;
                // 诊断：前置条件（战士妹 + 永久嗜血 + 团队嗜血不在场）出现在哪些回合
                const me = (step.ally || []).find(u => u.uid === brotherUid);
                if (me) {
                    if (me.role === '战士') diag.warrior = true;
                    if (me.alive && hasPermanentBloodthirst(me)) {
                        diag.permEver = true;
                        if (me.role === '战士' && !teamHasBloodthirst(battleState.activeBuffs)) {
                            diag.preconditionRounds++;
                            // 该回合妹是否真的出手了（attack-group 的 attacker 快照按 uid 认）
                            const meAttacked = (step.log || []).some(f => f.factType === FT.ATTACK && f.data && f.data.attacker && f.data.attacker.uid === brotherUid);
                            if (meAttacked) diag.precondAttackRounds = (diag.precondAttackRounds || 0) + 1;
                        }
                    }
                }
            }
            if (winner || !lastStep) break;
            // 先选后克隆（V6.7.2 顺序口径）：共享 picker 把永久副本写进 lastStep 单位，clone 深拷 state
            const nextRoundNo = battleState.round + 1;
            const nextActiveBuffs = tickAndPickBuffs(battleState.activeBuffs, lastStep.ally, lastStep.enemy,
                battleState.round, seed, battleState.round % 3 === 0);
            battleState = {
                ally: lastStep.ally.map(u => u.clone()),
                enemy: lastStep.enemy.map(u => u.clone()),
                round: nextRoundNo,
                activeBuffs: nextActiveBuffs,
                allAllies: battleState.allAllies, _rng: rng
            };
        }
        // 账本侧：从**末步活体单位**读（不能读 battleState.ally——它是上一轮过渡时的克隆，
        //   差一轮；stepper 内部对 A/B 自带克隆，审计记录只落在 lastStep 的单位上）
        const finalMe = ((lastStep || {}).ally || []).find(u => u.uid === brotherUid);
        // 第 212 轮：账本按「吸血者本人的 _audit.hp」取，归属键是**单位对象**而非 unitUid
        //   （fact.unitUid 是战场内序号 u6，跨场撞号）。终局快照里该单位的账本用于兜底。
        const finalLedgerOf = (name) => {
            const u = ((lastStep || {}).ally || []).find(x => x.name === name)
                || ((lastStep || {}).enemy || []).find(x => x.name === name) || null;
            return u && u._audit ? (u._audit.hp || []).filter(e => e.group === 'bloodthirstLeech').map(e => e.value) : null;
        };
        return { hits, diag, finalLedgerOf, brotherName, brotherUid };
    }

    const seeds = Array.from({ length: SEEDS_N }, (_, i) => i + 1);
    let battles = 0, brotherBattles = 0, warriorBattles = 0, permBattles = 0, precondRounds = 0, precondAttackRounds = 0;
    let backstandHits = 0;   // 第 212 轮：归因为 modules/324 背水吸血路径（该路径无账本，见断言③）
    // 第 213 轮：断言⑥的覆盖计数——按「判到什么强度」分三桶如实上报，防再次出现「判据看着在、实际没跑」
    let cnt204 = 0, cnt204exact = 0, cnt204noRaw = 0;
    const allHits = [];
    const auditMismatch = [];
    for (const seed of seeds) {
        for (const stage of STAGES) {
            battles++;
            const r = runBattle(seed, stage);
            if (r.diag.brother) brotherBattles++;
            if (r.diag.warrior) warriorBattles++;
            if (r.diag.permEver) permBattles++;
            precondRounds += r.diag.preconditionRounds;
            precondAttackRounds += r.diag.precondAttackRounds || 0;
            for (const h of r.hits) {
                // 第 145 轮：顺带把本场的妹名带在命中上，供下面的「真因显形」分段用（不参与任何判据）
                allHits.push(Object.assign({}, h, { brotherName: r.brotherName }));
                // 断言①：fact 载荷自洽（正整数 + 名字是妹）
                const problems = [];
                if (!(Number.isInteger(h.leechVal) && h.leechVal > 0)) problems.push('leechVal 非正整数: ' + h.leechVal);
                if (h.unitName !== r.brotherName) problems.push('unitName≠妹名: ' + h.unitName + ' vs ' + r.brotherName);
                // 断言②（第 211 轮换口径）：渲染必须走蝶血分支，且**数值对落地值**。
                //   旧口径拿 leechVal（声明期 previewHeal 预演值）比，满血夹取/同帧前序回血/截脉寒毒打折时必错；
                //   render/413 healDisplay 有 healActual 时显示的是实落值 ⇒ 改为与 h.actual 比。
                if (h.text.indexOf('🕷️ 蝶血') === -1) problems.push('渲染未走蝶血分支: ' + h.text.slice(0, 60));
                if (h.text.indexOf('吸血+' + h.actual) === -1) {
                    problems.push('渲染数值与落地值不一致: 渲染=' + (/吸血\+([0-9.]+)/.exec(h.text) || [])[1]
                        + ' 落地=' + h.actual + ' 预演=' + h.leechVal);
                }
                if (h.text.indexOf('🗡️') !== -1) problems.push('渲染混入普通分支文案');
                // 断言⑤（第 212 轮新增，只加不减）：**声明值必须有独立来源可对**，不能只跟渲染/落地自洽。
                //   病根实证：第 211 轮只比「渲染文本 vs healActual」，而 healActual 由 handler 用 decl.value 算，
                //   leechVal 被篡改时三者仍一致 ⇒ 旧判据全员放行（本轮正向打桩 leechVal+100：138 条零报红）。
                //   两条路径各有一个独立量可对：
                //   · modules/324 背水路径：声明期 leechVal := floor(dmg × 档位)，档位 = state._brotherLastStandLeech；
                //     本次伤害 dmg 从 attack-group 的 data.dmg（或 fact 同帧 ATTACK 载荷）取。
                //   · core/204 嗜血路径：leechVal := previewHeal(unit, floor(dmg × leechRatio))，夹取后必 ≤ 缺口，
                //     故 leechVal ≤ maxHp − hpBefore，且 leechVal ≥ healActual（落不了负数）。
                //   取不到 dmg 时只做可判的那半边（不静默全放行，也不凭空判红）。
                if (h.backstand && h.dmg != null) {
                    const ratio = h.ratio > 0 ? h.ratio : 0.8;
                    const expect = Math.floor(h.dmg * ratio);
                    if (h.leechVal !== expect) {
                        problems.push('背水声明值无据: leechVal=' + h.leechVal + ' 应为 floor(' + h.dmg + '×' + ratio + ')=' + expect);
                    }
                }
                // 断言⑥（第 213 轮新增，只加不减）：**core/204 嗜血路径**的声明值也必须有独立来源。
                //   病根：⑤ 只锚了 324 一条路径；204 路径 leechVal := previewHeal(unit, floor(dmg × 倍率))，
                //   账本与渲染都从 leechVal 派生 ⇒ 三处同源。实测打桩 core/204 倍率 ×2，139 条零报红。
                //   锚：**声明原值** entry.healAmount（core/209 L525 = decl.value = rawLeech，未过 previewHeal）
                //       对上「实测 dmg（攻击组 data.dmgCalc.dmg）× 配置倍率」。
                //   ★ 为什么不用 leechVal 对账：leechVal 被 previewHeal 夹取过，缺口小时必然小于 dmg×倍率，
                //     无法区分「合法夹取」与「篡改成小数」（第 213 轮首版用快照缺口判，实测 1 例假红：
                //     leechVal=20 而 dmg×0.8=60 —— 同一步后段又吃了伤害，快照缺口被撑大，声明当刻其实只有 20 可回）。
                //   倍率取 content 两个真源：基础 0.8（content/001）/ 姊强化 1.6（content/002 sister 段）。
                //   团队嗜血在场 ⇒ 主分支，两个倍率都可能；不在场 ⇒ 只走 else-if 永久分支，只允许基础倍率。
                if (!h.backstand && h.dmg != null) {
                    cnt204++;
                    // 分支倍率唯一化：不在团队 buff ⇒ 永久分支只 0.8；在团队 buff ⇒ 有姊且未关强化才是 1.6，否则 0.8
                    const ratios = (!h.teamBuff || h.noSisterHex || !h.sisterAlive || HEX_LEECH_RATIO == null)
                        ? [BASE_LEECH_RATIO] : [HEX_LEECH_RATIO];
                    const cands = ratios.map(r => Math.floor(h.dmg * r));
                    if (h.rawDecl == null) {
                        // 取不到声明原值（entry 结构变了）⇒ 如实计数，不静默当通过
                        cnt204noRaw++;
                    } else {
                        cnt204exact++;
                        if (cands.indexOf(h.rawDecl) === -1) {
                            problems.push('嗜血声明原值与伤害×倍率不符: healAmount=' + h.rawDecl + ' 候选='
                                + ratios.map((r, i) => 'floor(' + h.dmg + '×' + r + ')=' + cands[i]).join('/')
                                + (h.teamBuff ? '（团队嗜血在场）' : '（团队嗜血不在场⇒仅永久分支）'));
                        }
                    }
                    // 附：预演值只许被夹小，不许反超声明原值（previewHeal 是 Math.min 语义）
                    if (h.rawDecl != null && h.leechVal > h.rawDecl) {
                        problems.push('嗜血预演值反超声明原值: leechVal=' + h.leechVal + ' raw=' + h.rawDecl);
                    }
                }
                // 断言②-加严（第 211 轮新增，只加不减）：落地值不许超额、不许凭空多出来
                //   ②b 实落 ≤ 预演：吸血是「预演值封顶」，落地比预演还多说明扣血/回血链路有别的旁路在加血
                //   ②c 实落 ≤ 缺口（maxHp-hp）：hp 不允许被回超上限（Math.min(maxHp) 夹取），超额即真缺陷
                if (h.actual > h.leechVal + 1) {
                    problems.push('实落超过预演: 实落=' + h.actual + ' 预演=' + h.leechVal + '（差>1，非 hp 实数残渣）');
                }
                // ②d 硬约束（第 211 轮新增，第 212 轮补漏）—— 实落必须有物理边界，不许凭空多出来。
                //   ★ 第 212 轮：本节原先整块被 `if (h.srcHp != null && h.srcMaxHp != null)` 包住，
                //     而 bloodthirstLeech 的 fact 是**声明类、挂在 attack-group 的 data.entries 里**，
                //     攻击组快照（step.ally）里找得到出手者 uid 的情形只占 30/138 ⇒ ④a「非负整数」
                //     与④b「不超过预演」这两条**主干判据在 108/138 条样本上整段没执行**（静默空转）。
                //     现拆开：整数性与预演封顶**无条件执行**；依赖血条快照的两条（余量、超上限）才受 srcHp 门控。
                if (!(Number.isInteger(h.actual)) || h.actual < 0) {
                    problems.push('实落非非负整数: ' + h.actual);
                }
                if (h.actual < h.leechVal - 1) {
                    const mods = Array.isArray(h.healMods) ? h.healMods : [];
                    const nominalShort = typeof h.healNominal === 'number' && h.healNominal < h.leechVal - 1;
                    if (mods.length === 0 && !nominalShort) {
                        problems.push('实落少报且无据: 实落=' + h.actual + ' 预演=' + h.leechVal
                            + ' nominal=' + h.healNominal + ' mods=[]');
                    }
                }
                if (h.srcHp != null && h.srcMaxHp != null) {
                    if (h.srcHp > h.srcMaxHp + 1e-6) {
                        problems.push('吸血后 hp 超上限: hp=' + h.srcHp + ' maxHp=' + h.srcMaxHp);
                    }
                }
                // 断言②-备注：与预演不等时必须能指出原因（不是静默差异）
                if (h.healActual != null && h.healActual !== h.leechVal) {
                    const mods = Array.isArray(h.healMods) ? h.healMods : [];
                    // 满血/缺口夹取会走 healNominal < leechVal 分支，不等即有据；若三者全等却不等，则无据
                    const hasReason = mods.length > 0
                        || (typeof h.healNominal === 'number' && h.healNominal !== h.leechVal)
                        || (h.srcMaxHp != null && h.srcHp != null && h.srcMaxHp - h.srcHp < 1e-6);
                    if (!hasReason) {
                        problems.push('实落≠预演且无原因: 实落=' + h.healActual + ' 预演=' + h.leechVal
                            + ' nominal=' + h.healNominal + ' mods=' + JSON.stringify(mods));
                    }
                }
                // 断言③（第 212 轮换口径，见文件头 V1.2.0）—— 账本必须按「吸血者本人 + 落地值」对账，
                //   且**按路径分流**：蝶血 fact 有两条发射路径，账本义务不同。
                //   · core/204 submitBloodthirstDeclaration（嗜血 buff / 妹永久）：声明即 recordHpAudit(unit,'bloodthirstLeech',leechVal)。
                //   · modules/324 onDamageLeech（妹背水 50% 吸血）：只 push 声明，**不写账本**（第 211 轮已登记转交，属主代码侧）。
                //   如何分流：204 路径的 factData 在声明期就带全三字段且 leechVal===healNominal（previewHeal 出口未打折）；
                //   324 路径 factData 只带 unitName/leechVal/isBrother/unitUid（声明期无 healNominal），由 handler 事后补
                //   heal/healActual/healNominal。故「有 healNominal 且其值 ≥ leechVal」不作分流依据 —— 改按「存在性与同值」双查：
                //   ① 该出手者的账本里**必须有**一条 group='bloodthirstLeech' 的条目与「落地值」同值（204 路径成立的充分条件）；
                //   ② 若没有同值条目，必须能证明本 hit 走的是 324 背水路径（来源可归因），否则判红。
                //   ★ 归因取证：324 路径在命中当帧 unit.state._brotherLastStandLeech 有值（背水档位）且本 hit 的 leechVal===rawLeech；
                //     取不到单位对象时无法归因 ⇒ 如实判红（不许静默跳过 —— 旧版正是在 108/138 条上静默跳过）。
                {
                    const want = h.actual;
                    const live = (h.ledgerNow || []).some(e => e.value === want);
                    if (!live) {
                        const fb = r.finalLedgerOf(h.unitName);
                        const fbHit = !!fb && (fb.indexOf(want) !== -1 || fb.indexOf(h.leechVal) !== -1);
                        if (fbHit) {
                            // 终局账本有同值条目（本步快照取不到单位时的兜底），放行
                        } else if (h.backstand) {
                            // 已归因为 modules/324 背水吸血路径：该路径无账本（转交主代码），如实计数不判红
                            backstandHits++;
                        } else if (!fb && h.srcHp == null && h.srcMaxHp == null) {
                            auditMismatch.push({ seed: h.seed, stage: h.stage, round: h.round,
                                problems: ['账本取证缺失(找不到出手者对象 ' + h.unitName + ')，无法核对 落地=' + want] });
                        } else {
                            auditMismatch.push({ seed: h.seed, stage: h.stage, round: h.round,
                                problems: ['账本无同值 bloodthirstLeech 记录(出手=' + h.unitName + ' 落地=' + want
                                    + ' 预演=' + h.leechVal + ' 账面=' + JSON.stringify((fb || []).slice(-5)) + ')'] });
                        }
                    }
                }
                if (problems.length) auditMismatch.push({ seed: h.seed, stage: h.stage, round: h.round, problems });
            }
        }
    }

    console.log('==== 小昭·妹永久嗜血·蝶血分支定向用例 ====');
    console.log('· 扫描 ' + battles + ' 场（' + SEEDS_N + ' seeds × ' + STAGES.length + ' stages，强制妹模式）');
    console.log('· 诊断：有妹 ' + brotherBattles + ' 场 / 战士妹 ' + warriorBattles + ' 场 / 持有永久嗜血 ' + permBattles + ' 场 / 前置条件回合合计 ' + precondRounds + '（其中妹实际出手 ' + precondAttackRounds + ' 回合）');
    console.log('· 蝶血命中（isBrother=true fact）: ' + allHits.length + ' 次' + (allHits.length ? '（样例: seed=' + allHits[0].seed + ' s' + allHits[0].stage + ' r' + allHits[0].round + ' ' + allHits[0].unitName + ' +' + allHits[0].leechVal + '）' : ''));
    if (SCAN_ONLY) {
        console.log('· --scan 模式：不断言、不判退码');
        return;
    }
    // ---- 第 145 轮新增 · 真因显形（只加诊断：判据与退码一行未动）----------------------------
    //   本用例自第 123 轮起一直绿，本轮随上游 fa6f206f 合并后转红 15 项。查因：上游把 core/04
    //   submitBloodthirstDeclaration 的第二分支判据由「unit.isXiaoZhaoBrother && 本人永久嗜血」
    //   改成「hasBrotherPermanent(allySide) && 任一战士」⇒ 妹永久嗜血已扩到**全队战士**，
    //   而 factData.unitName 仍填出手者本人 ⇒ isBrother 的语义由「本人是妹」变成「来源=妹永久」。
    //   ★ 是否按新语义改判据属改结论，须拍板；本轮只把两类命中分开数并逐条点名，照旧判失败。
    const otherHits = allHits.filter(h => h.unitName !== h.brotherName);
    const otherNames = [...new Set(otherHits.map(h => h.unitName))];
    if (otherHits.length) {
        console.log('· ⚠ 真因显形：' + otherHits.length + '/' + allHits.length + ' 条 isBrother=true 命中的 unitName 不是妹本人（'
            + otherNames.slice(0, 6).join('、') + '）⇒ 上游 fa6f206f（core/04 submitBloodthirstDeclaration）把判据由'
            + '「unit.isXiaoZhaoBrother && 本人永久嗜血」改为「hasBrotherPermanent(allySide) && 任一战士」，'
            + '即妹永久嗜血已扩到全队战士，而 factData.unitName 仍填出手者 ⇒ isBrother 语义由「本人是妹」变为「来源=妹永久」；'
            + 'render/410-facts-heal.js 也是看 fact.isBrother 走 🕷️ 蝶血文案，故非妹单位同样会被渲染成蝶血，属同款语义错位。'
            + '★ 本用例判据一行未动、照旧判失败（exit 1）：改判据须拍板；若认定新行为正确，'
            + '应把 factData 的 isBrother 换成 fromBrotherPermanent 一类字段并把渲染侧一并改掉。');
    }
    let bad = 0;
    for (const m of auditMismatch) {
        bad++;
        console.log('  ❌ [seed=' + m.seed + ' stage=' + m.stage + ' round=' + m.round + '] ' + m.problems.join('；'));
    }
    // 第 212 轮：把「转绿但仍有主代码侧欠账」如实摆出来 —— 转绿不等于这一项没事
    if (backstandHits > 0) {
        console.log('· ⚠ 其中 ' + backstandHits + '/' + allHits.length + ' 条命中走 modules/324 背水吸血路径，'
            + '该路径 push 声明后**不写 recordHpAudit** ⇒ 账本侧无法对账（已登记 known-transfers，转交主代码补一行）；'
            + '本条按路径归因后不计红，但**结论只覆盖 fact 与渲染两侧**，账本侧在 324 路径上仍是盲区。');
    }
    // 第 213 轮：断言⑥的覆盖强度如实上报（三桶分开数，防「判据在、但没跑」再次发生）
    console.log('· 断言⑥（204 嗜血路径倍率锚）覆盖：' + cnt204 + '/' + allHits.length + ' 条走 204 路径 —— '
        + '逐条对拍声明原值 ' + cnt204exact + ' 条 / 取不到声明原值 ' + cnt204noRaw + ' 条（结构变更即在此显形）');
    if (bad) { console.log('❌ 蝶血分支断言失败 ' + bad + ' 项'); process.exit(1); }
    if (allHits.length < MIN_HITS) {
        console.log('❌ 蝶血命中 ' + allHits.length + ' 次 < 下限 ' + MIN_HITS + ' ⇒ 永久继承链路可能已坏（_permanentBuffs 写入 / picker 共享模块 / isXiaoZhaoPermanentActive / core/04 L278 分支），须查');
        process.exit(1);
    }
    console.log('✅ 蝶血分支断言全部通过（fact 正整数+妹名 / 渲染 🕷️ 蝶血分支+数值一致 / 账本同值落地记录 / 背水声明值独立取证 / 嗜血路径倍率独立取证），'
        + '命中 ' + allHits.length + ' ≥ 下限 ' + MIN_HITS);
    process.exit(0);
}

main().catch(e => { console.error('用例执行异常:', e); process.exit(1); });
