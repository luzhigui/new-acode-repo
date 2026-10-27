#!/usr/bin/env node
// tests/xiaozhao-brother-leech-case.mjs | V1.0.1 | 2026-10-27 夜间第 145 轮：新增「真因显形」诊断段——
//   上游把妹永久嗜血扩到全队战士后 isBrother 语义错位，15 条命中 unitName 非妹名；
//   本轮只把两类命中分开数并点名上游改动，**判据与退码一行未动**（改判据须拍板）。
// tests/xiaozhao-brother-leech-case.mjs — 小昭·妹「永久嗜血·蝶血分支」定向用例
//
// 背景（第 122-123 轮日间线）：
//   结构扫描器通道 B 报 `BLOOD_THIRST_LEECH.isBrother=true` 父 196/分支 0。第 123 轮实证：
//   真路径 player/49battle-flow.js L49-57 全自动选 Buff 会给明教侧存活妹写 _permanentBuffs
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

export const VER = 'tests/xiaozhao-brother-leech-case.mjs V1.0.1';

const SCAN_ONLY = process.argv.includes('--scan');
// 默认 20 seeds × 7 stages = 140 场（run-all 每次跑的量）。实测命中率 ≈18.6%，
// 预期命中 ~26，MIN_HITS=3 的假红概率≈0；深扫/校准用 SEEDS_N=40（280 场）手动触发。
const SEEDS_N = Number(process.env.SEEDS_N || 20);
const STAGES = process.env.STAGES ? process.env.STAGES.split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7];
// 命中下限（棘轮）：低于此数即红。校准依据：强制妹模式下 140 场预期命中 20+（实测见 --scan）。
const MIN_HITS = 3;

async function main() {
    const [{ CONFIG, loadGameData }, { SeededRNG }, { createRoundStepper },
           { initBattleTeams }, { renderLog }, { GlobalStore },
           { CAMP_TYPES, FACT_TYPES: FT }] = await Promise.all([
        import('../core/01config-5v5-test.js'),
        import('../infra/51-core-utils.js'),
        import('../core/11battle-round.js'),
        import('../modules/29battle-init.js'),
        import('../render/30-fact-renderer.js'),
        import('../infra/54-global-store.js'),
        import('../infra/56-battle-enums.js')
    ]);
    const { tickAndPickBuffs } = await import('./_lib/buff-picker.mjs');
    await import('../modules/25elite-imperial.js');
    await import('../modules/26elite-sixsects.js');
    await import('../modules/27elite-mingjiao.js');
    await import('../modules/30custom-effects.js');
    await loadGameData();

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
                const collect = (f) => {
                    if (!f || f.factType !== FT.BLOOD_THIRST_LEECH || !f.data) return;
                    const d = f.data;
                    if (d.isBrother !== true) return;               // 只认永久分支
                    // 渲染侧：renderLog 必须走 🕷️ 蝶血分支（与普通 🗡️ 分支互斥）
                    const rendered = renderLog(FT.BLOOD_THIRST_LEECH, d) || {};
                    const text = typeof rendered.text === 'string' ? rendered.text : '';
                    hits.push({
                        seed, stage, round: battleState.round,
                        unitName: d.unitName, leechVal: d.leechVal,
                        isBrother: d.isBrother, text
                    });
                };
                for (const f of (step.log || [])) {
                    collect(f);
                    if (f && f.factType === FT.ATTACK && f.data && Array.isArray(f.data.entries)) {
                        for (const e of f.data.entries) collect(e);
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
        const auditVals = finalMe && finalMe._audit ? (finalMe._audit.hp || []).filter(e => e.group === 'bloodthirstLeech').map(e => e.value) : [];
        return { hits, diag, auditVals, brotherName };
    }

    const seeds = Array.from({ length: SEEDS_N }, (_, i) => i + 1);
    let battles = 0, brotherBattles = 0, warriorBattles = 0, permBattles = 0, precondRounds = 0, precondAttackRounds = 0;
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
                // 断言②：渲染走蝶血分支且数值一致
                if (h.text.indexOf('🕷️ 蝶血') === -1) problems.push('渲染未走蝶血分支: ' + h.text.slice(0, 60));
                if (h.text.indexOf('吸血+' + h.leechVal) === -1) problems.push('渲染数值与 fact 不一致');
                if (h.text.indexOf('🗡️') !== -1) problems.push('渲染混入普通分支文案');
                // 断言③：账本有同值落地记录（auditVals 是终局快照，逐 hit 验「存在同值条目」）
                if (r.auditVals.indexOf(h.leechVal) === -1) problems.push('账本无同值 bloodthirstLeech 记录: ' + JSON.stringify(r.auditVals.slice(-5)));
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
            + 'render/35-facts-heal.js 也是看 fact.isBrother 走 🕷️ 蝶血文案，故非妹单位同样会被渲染成蝶血，属同款语义错位。'
            + '★ 本用例判据一行未动、照旧判失败（exit 1）：改判据须拍板；若认定新行为正确，'
            + '应把 factData 的 isBrother 换成 fromBrotherPermanent 一类字段并把渲染侧一并改掉。');
    }
    let bad = 0;
    for (const m of auditMismatch) {
        bad++;
        console.log('  ❌ [seed=' + m.seed + ' stage=' + m.stage + ' round=' + m.round + '] ' + m.problems.join('；'));
    }
    if (bad) { console.log('❌ 蝶血分支断言失败 ' + bad + ' 项'); process.exit(1); }
    if (allHits.length < MIN_HITS) {
        console.log('❌ 蝶血命中 ' + allHits.length + ' 次 < 下限 ' + MIN_HITS + ' ⇒ 永久继承链路可能已坏（_permanentBuffs 写入 / picker 共享模块 / isXiaoZhaoPermanentActive / core/04 L278 分支），须查');
        process.exit(1);
    }
    console.log('✅ 蝶血分支断言全部通过（fact 正整数+妹名 / 渲染 🕷️ 蝶血分支+数值一致 / 账本同值落地记录），命中 ' + allHits.length + ' ≥ 下限 ' + MIN_HITS);
    process.exit(0);
}

main().catch(e => { console.error('用例执行异常:', e); process.exit(1); });
