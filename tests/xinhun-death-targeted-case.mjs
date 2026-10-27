// tests/xinhun-death-targeted-case.mjs | V1.0.2 | 2026-10-21 第 112 轮
// V1.0.2 | 2026-10-25 第 123 轮：构造 battleState 时不再直接调用 tickAndPickBuffs 预置 activeBuffs，
//        | 改为空数组起步、由 GlobalStore 的 forceXiaoZhao='brother' 驱动走标准选 buff 流程，
//        | 与 xiaozhao-brother-leech-case 的强制妹模式同口径。
//        | ★ 本行由第 138 轮补登记当时只抬了常量、没留日志行，且旧写法不被版本漂移自检认得，故长期未被比对。
// XIN_HUN_DEATH（宋青书·新婚致死）定向最小触发用例 —— 依据第 113 轮沙箱交接规格在主线重写。
//
// 背景（112 轮把 XIN_HUN_DEATH 定为「条件稀有」但只有定性；113 轮沙箱用定向用例把动作项做完）：
//   自然流里 XIN_HUN_DEATH 几乎不可能命中——content 新婚扣血 hpDeduct 恒为 1，周芷若满血 155，
//   单靠新婚扣血要连扣 155 次；而默认战斗流宋青书场均出手约 2.7~10 次。⇒「扩大样本」在这条 fact 上
//   永远无效，必须定向构造。触发条件由此点名：**周芷若血量 ≤ hpDeduct 档位时宋青书发动攻击**。
//
// 三段式，全程只改 tests/、不动主代码：
//   段一 baseline：10 seed × 7 stage 共 70 场自然流，只量化稀有度（周芷若在场场次、宋青书出手数、
//     XIN_HUN 触发数、XIN_HUN_DEATH 命中数、周芷若历史最低血、XIN_HUN 载荷最低 zhouHpAfter）。
//   段二 targeted：自动探测「宋青书 + 周芷若同队」的关卡，把周芷若血量钳到 hpDeduct 档位。
//     ★ V1.0.1 钳血时机教训（首版 10 场 XIN_HUN 触发 0 次）：**不能每回合开始就钳** —— 1 血的
//     周芷若会成全场集火目标，往往撑不到宋青书出手就被别人打死（她死于普攻，链条不成立）。
//     改为「**宋青书本回合尚未出手前**才钳」：stepper 每步下发的 step.ally/step.enemy 就是活体
//     单位数组（core/11 makeStep 直接返回 A/B 引用），两步之间写 hp 对本回合后续生效。
//     前置状态本身自然可达（残血 1 点），注入只写 hp、不动 alive/state ⇒ 不碰随机流，可复现。
//   段三 载荷自证对撞（D1 软判据主线版）：XIN_HUN fact 的 isDead 字段读的是顶层 unit._pendingDeath
//     （modules/26 L235），而真值在 unit.state._pendingDeath（core/13 L226 写、core/17 登记）——
//     顶层从未被写入 ⇒ 该字段恒 false。取证不读外部单位状态（克隆深拷 + 死亡结算会清标记，
//     外部观测必然错过 → 假阴性），只用同一条 fact 自带的两个字段互证：
//     **zhouHpAfter ≤ 0 且 isDead === false** 即矛盾。矛盾命中 = 死字段实证（已挂主代码待转交）。
//
// 判据取向：本脚本是**观察项/取证用例**，不参与红线退码；产物落 tests/baselines/xinhun-death-case.json。
// 用法：node tests/xinhun-death-targeted-case.mjs [--json]
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

// 环境 mock（不改引擎源码，Node 补浏览器能力）—— 必须在任何引擎 import 之前
globalThis.fetch = async (url) => {
    const p = fileURLToPath(new URL(url));
    const text = fs.readFileSync(p, 'utf8');
    return { ok: true, json: async () => JSON.parse(text) };
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.self = globalThis;

export const VER = 'tests/xinhun-death-targeted-case.mjs V1.0.2';

// 与 stat-decl-vs-actual-check.mjs 同口径的 10 种子（含 12345：沙箱实测矛盾命中种子）
const SEEDS = [1, 18, 37, 42, 50, 67, 999, 12345, 777, 88888];
const STAGES = [1, 2, 3, 4, 5, 6, 7];
const JSON_ONLY = process.argv.includes('--json');

async function main() {
    const [{ CONFIG, loadGameData, getGameData }, { SeededRNG }, { createRoundStepper },
           { initBattleTeams }, { FACT_TYPES: FT, MECHANIC_TYPES: MT }] = await Promise.all([
        import('../core/01config-5v5-test.js'),
        import('../infra/51-core-utils.js'),
        import('../core/11battle-round.js'),
        import('../modules/29battle-init.js'),
        import('../infra/56-battle-enums.js')
    ]);
    const { tickAndPickBuffs } = await import('./_lib/buff-picker.mjs');
    // carry 候选判据与主代码同口径（tickAndPickBuffs 需要，否则 buff 门控机制一场都跑不到）
    const { hasCarryTarget } = await import('../modules/28buff-tools.js');
    
    await import('../modules/25elite-imperial.js');
    await import('../modules/26elite-sixsects.js');
    await import('../modules/27elite-mingjiao.js');
    await import('../modules/30custom-effects.js');
    await loadGameData();

    // content 真值：新婚扣血档位（宋青书 mechanics XIN_HUN.hpDeduct，当前恒 1）与周芷若满血
    const song = (getGameData()?.characters || {})['宋青书'] || {};
    const xinHunDecl = (song.mechanics || []).find(m => m && m.type === MT.XIN_HUN) || {};
    const hpDeduct = (typeof xinHunDecl.hpDeduct === 'number' && xinHunDecl.hpDeduct > 0) ? xinHunDecl.hpDeduct : 1;
    const zhouChar = (getGameData()?.characters || {})['周芷若'] || {};
    const zhouMaxHp = typeof zhouChar.hp === 'number' ? zhouChar.hp : 155;

    const MAX_ROUND = CONFIG.MAX_ROUND || 35;

    // 跑一场。clampZhouHp>0 = targeted 模式：每回合开始把周芷若血量钳到该值（只改血量，不碰 RNG）。
    // 返回：facts（原始 fact 流）、宋青书出手数、周芷若最低血/是否死过、胜者。
    function runBattle(seed, stage, clampZhouHp) {
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
        // V1.0.2 修同款顺序 bug（rules-replay V6.7.2 同型）：选 Buff 必须落在**战斗克隆体**上——
        //   旧写法传 allyTeam（原型），共享 picker 的永久副本全写进不被战斗使用的对象。
        //   pick 输入只看 alive/role，原型与克隆体等价，pick 结果不变。
        battleState.activeBuffs = tickAndPickBuffs([], battleState.ally, battleState.enemy, 1, seed, true);
        const facts = [];
        let songAttacks = 0, zhouMinHp = Infinity, zhouEverDead = false, winner = null;
        let songUid = null, zhouUid = null;
        // 宋青书 uid 从开局队伍直接取（attack fact 的 attacker 快照不带 isSongQingshu，
        //   snapshotUnitForFact 只带 uid/name/camp/pos/role/属性，见 core/12 L37-54 ⇒ 按 uid 数出手）
        for (const team of [battleState.ally, battleState.enemy]) {
            for (const u of (team || [])) {
                if (u.isSongQingshu) songUid = u.uid;
                if (u.isZhouZhiruo) zhouUid = u.uid;
            }
        }
        const findNamed = (team, pred) => (team || []).find(pred) || null;
        while (battleState.round <= MAX_ROUND) {
            const stepper = createRoundStepper(battleState);
            let lastStep = null;
            let songActedThisRound = false;
            for (const step of stepper) {
                lastStep = step;
                for (const f of (step.log || [])) {
                    facts.push(f);
                    if (f.factType === FT.ATTACK && f.data && f.data.attacker && f.data.attacker.uid === songUid) {
                        songAttacks++;
                        songActedThisRound = true;
                    }
                }
                for (const team of [step.ally, step.enemy]) {
                    for (const u of (team || [])) {
                        if (!u) continue;
                        if (u.isZhouZhiruo) {
                            if (zhouUid == null) zhouUid = u.uid;
                            if (u.hp < zhouMinHp) zhouMinHp = u.hp;
                            if (!u.alive) zhouEverDead = true;
                        }
                    }
                }
                if (step.winner) winner = step.winner;
                // targeted 注入点（V1.0.1 口径）：**只在宋青书本回合尚未出手前**，把周芷若钳到残血档位。
                //   为什么不能每回合开始就钳：1 血的周芷若会成全场集火目标，往往撑不到宋青书出手就被
                //   别人打死（首版实测 10 场 XIN_HUN 触发 0 次——她根本没活到宋青书攻击）。
                //   stepper 每步返回的 step.ally/step.enemy 就是活体单位数组（makeStep 直接下发 A/B
                //   引用，core/11 L329-348），故在两步之间写 hp 对本回合后续生效。
                //   只写 hp、不动 alive/state ⇒ 不碰随机流，可复现。
                if (clampZhouHp > 0 && !songActedThisRound) {
                    for (const team of [step.ally, step.enemy]) {
                        const song = findNamed(team, u => u.isSongQingshu);
                        if (!song || !song.alive) continue;
                        const zhou = findNamed(team, u => u.isZhouZhiruo && u.alive);
                        if (zhou && zhou.hp > clampZhouHp) zhou.hp = clampZhouHp;
                    }
                }
            }
            if (winner) break;
            if (!lastStep) break;
            // V1.0.2 修同款顺序 bug（rules-replay V6.7.2 同型）：先选 Buff（共享 picker 会把永久副本
            //   写进 lastStep 单位的 state._permanentBuffs）后 clone——clone 深拷 state，顺序反了副本
            //   全落进随后被丢弃的旧单位。round/pickNew 参数仍用旧 battleState.round，语义不变。
            const nextRoundNo = battleState.round + 1;
            const nextActiveBuffs = tickAndPickBuffs(battleState.activeBuffs, lastStep.ally, lastStep.enemy,
                battleState.round, seed, battleState.round % 3 === 0);
            battleState = {
                ally: lastStep.ally.map(u => u.clone()),
                enemy: lastStep.enemy.map(u => u.clone()),
                round: nextRoundNo,
                activeBuffs: nextActiveBuffs,
                allAllies: battleState.allAllies,
                _rng: rng
            };
        }
        return { facts, songAttacks, zhouMinHp: zhouMinHp === Infinity ? null : zhouMinHp, zhouEverDead, winner, songUid, zhouUid };
    }

    // 从一场的 fact 流里统计 XIN_HUN / XIN_HUN_DEATH 与载荷矛盾
    function tallyFacts(facts) {
        let xinHun = 0, death = 0, minZhouHpAfter = Infinity;
        const contradictions = [];
        for (const f of facts) {
            if (f.factType === FT.XIN_HUN) {
                xinHun++;
                const d = f.data || {};
                if (typeof d.zhouHpAfter === 'number' && d.zhouHpAfter < minZhouHpAfter) minZhouHpAfter = d.zhouHpAfter;
                // 载荷自证对撞：血量已扣到 ≤0 却报未死 ⇒ isDead 死字段实证
                if (typeof d.zhouHpAfter === 'number' && d.zhouHpAfter <= 0 && d.isDead === false) {
                    contradictions.push({ zhouHpAfter: d.zhouHpAfter, isDead: d.isDead, stackCount: d.stackCount });
                }
            } else if (f.factType === FT.XIN_HUN_DEATH) {
                death++;
            }
        }
        return { xinHun, death, minZhouHpAfter: minZhouHpAfter === Infinity ? null : minZhouHpAfter, contradictions };
    }

    // ---------- 段一 baseline：自然流量化稀有度 ----------
    const base = { battles: 0, zhouPresent: 0, songWithZhou: 0, songAttacks: 0, xinHun: 0, death: 0, zhouMinHp: null, minZhouHpAfter: null, zhouEverDead: false, contradictions: [] };
    const stageHit = {};   // stage -> 周芷若+宋青书同队场次（用于 targeted 选关）
    for (const seed of SEEDS) {
        for (const stage of STAGES) {
            const r = runBattle(seed, stage, 0);
            const t = tallyFacts(r.facts);
            base.battles++;
            if (r.zhouUid != null) {
                base.zhouPresent++;
                if (r.songUid != null) { base.songWithZhou++; stageHit[stage] = (stageHit[stage] || 0) + 1; }
            }
            base.songAttacks += r.songAttacks;
            base.xinHun += t.xinHun;
            base.death += t.death;
            if (r.zhouEverDead) base.zhouEverDead = true;
            if (r.zhouMinHp != null) base.zhouMinHp = base.zhouMinHp == null ? r.zhouMinHp : Math.min(base.zhouMinHp, r.zhouMinHp);
            if (t.minZhouHpAfter != null) base.minZhouHpAfter = base.minZhouHpAfter == null ? t.minZhouHpAfter : Math.min(base.minZhouHpAfter, t.minZhouHpAfter);
            for (const c of t.contradictions) base.contradictions.push(Object.assign({ seed, stage }, c));
        }
    }

    // ---------- 段二 targeted：钳血注入（发射点是否真的会发射） ----------
    const targetStages = Object.keys(stageHit).map(Number).sort((a, b) => a - b);
    const tgt = { stages: targetStages, battles: 0, xinHun: 0, death: 0, contradictions: [] };
    for (const seed of SEEDS) {
        for (const stage of targetStages) {
            const r = runBattle(seed, stage, hpDeduct);
            const t = tallyFacts(r.facts);
            tgt.battles++;
            tgt.xinHun += t.xinHun;
            tgt.death += t.death;
            for (const c of t.contradictions) tgt.contradictions.push(Object.assign({ seed, stage }, c));
        }
    }

    const artifact = {
        ver: VER,
        generatedAt: new Date().toISOString(),
        config: { seeds: SEEDS, stages: STAGES, hpDeduct, zhouMaxHp, note: '触发条件=周芷若血量≤hpDeduct档位时宋青书发动攻击' },
        baseline: {
            battles: base.battles, zhouPresent: base.zhouPresent, songWithZhou: base.songWithZhou,
            songAttacks: base.songAttacks,
            songAttacksAvg: base.songWithZhou ? Math.round((base.songAttacks / base.songWithZhou) * 100) / 100 : 0,
            xinHunTriggers: base.xinHun, xinHunDeathHits: base.death,
            zhouMinHpOverall: base.zhouMinHp, zhouEverDeadByOtherDamage: base.zhouEverDead,
            xinHunMinZhouHpAfter: base.minZhouHpAfter,
            contradictions: base.contradictions.length
        },
        targeted: {
            stages: tgt.stages, battles: tgt.battles,
            xinHunTriggers: tgt.xinHun, xinHunDeathHits: tgt.death,
            contradictionSamples: tgt.contradictions.slice(0, 8),
            contradictions: tgt.contradictions.length
        },
        conclusion: {
            rootCause: `新婚扣血 hpDeduct=${hpDeduct} 恒定、周芷若满血 ${zhouMaxHp}，自然流需连扣 ${zhouMaxHp} 次才致死；宋青书场均出手 ${base.songWithZhou ? (Math.round((base.songAttacks / base.songWithZhou) * 100) / 100) : 0} 次 ⇒ 自然条件永远扣不死`,
            emissionPointProven: tgt.death > 0,
            deadFieldDefect: (base.contradictions.length + tgt.contradictions.length) > 0,
            deadFieldDetail: 'XIN_HUN fact 的 isDead 读顶层 unit._pendingDeath（modules/26 L235），真值在 unit.state._pendingDeath（core/13 L226 写、core/17 登记）⇒ 恒 false。已挂主代码待转交，体检侧不代改。'
        }
    };

    const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'baselines');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, 'xinhun-death-case.json');
    fs.writeFileSync(outFile, JSON.stringify(artifact, null, 2) + '\n', 'utf8');

    if (!JSON_ONLY) {
        console.log('=== XIN_HUN_DEATH 定向最小触发用例 ' + VER + ' ===');
        console.log(`配置：hpDeduct=${hpDeduct}（content 真值） 周芷若满血=${zhouMaxHp} seeds=${SEEDS.length} stages=${STAGES.length}`);
        console.log('--- 段一 baseline（自然流 ' + base.battles + ' 场）---');
        console.log(`  周芷若在场 ${base.zhouPresent} 场；其中宋青书同队 ${base.songWithZhou} 场`);
        console.log(`  宋青书出手合计 ${base.songAttacks} 次（场均 ${artifact.baseline.songAttacksAvg} 次/场，仅计同队场）`);
        console.log(`  XIN_HUN 触发 ${base.xinHun} 次；XIN_HUN_DEATH 命中 ${base.death} 次`);
        console.log(`  周芷若全场最低血 ${base.zhouMinHp}（死过=${base.zhouEverDead ? '是（死于其他伤害，非新婚扣血）' : '否'}）；XIN_HUN 载荷最低 zhouHpAfter=${base.minZhouHpAfter}`);
        console.log(`  载荷矛盾（zhouHpAfter≤0 且 isDead=false）：${base.contradictions.length} 次`);
        console.log('--- 段二 targeted（钳血注入 ' + tgt.battles + ' 场 @ stage ' + targetStages.join(',') + '）---');
        console.log(`  XIN_HUN 触发 ${tgt.xinHun} 次；XIN_HUN_DEATH 命中 ${tgt.death} 次 ⇒ 发射点${tgt.death > 0 ? '确实会发射（链条成立）' : '未发射（需复查）'}`);
        console.log(`  载荷矛盾：${tgt.contradictions.length} 次（样例 ${JSON.stringify(tgt.contradictions.slice(0, 3))}）`);
        console.log('--- 结论 ---');
        console.log('  根因：' + artifact.conclusion.rootCause);
        console.log('  死字段缺陷：' + (artifact.conclusion.deadFieldDefect ? '实证成立（见上）——' + artifact.conclusion.deadFieldDetail : '本轮未抓到'));
        console.log('  产物：' + outFile);
    } else {
        console.log(JSON.stringify(artifact));
    }
    return 0;
}

main().then(code => process.exit(code || 0)).catch(e => { console.error('XIN_HUN 定向用例运行异常：', e); process.exit(2); });
