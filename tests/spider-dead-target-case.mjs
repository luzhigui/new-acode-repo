// tests/spider-dead-target-case.mjs | V1.1.0 | 2026-10-31 夜间第 161 轮 · 第 164 轮补层 （第 164 轮：fact 采集补 data.phantomFact 层 —— 幻影 fact 与 data.entries 并列、不在 entries 里，原两层口径对它恒不可见；只补视野、不缩面、不改判据）
// SPIDER_DEAD_TARGET（蛛袭时目标已死 · 收尾帧竞态分支）定向取证用例
//
// 为什么单独为它写一个用例（第 160 轮的【最高·下轮】交办）：
//   第 160 轮把 fact 发射普查的「稀有 spec」做了成因二分，⑤b-2「非样本缺口」收口 6 条，其中
//   `spiderDeadTarget` 与 `xinHunDeath` 被点名**最容易被误判成死代码**——这两条一旦误判，
//   后果是主代码把一条还在用的发射点当死代码删掉（挂账一的三条核销建议正等拍板）。
//   ⇒ 光有「自然流零命中」不能下结论：零命中既可能是「结构性不可达」，也可能是「没喂样本」。
//   本用例把这两者分开：先证明**发射点确实被走到了**（进入目标池的次数可数），再看它发没发。
//
// 判据（两条棘轮，都只许收紧不许放宽）：
//   ① 覆盖棘轮：进入「落地蛛袭目标池非空」分支的次数 ≥ MIN_ENTER。
//      进不去 ⇒ 本用例失去证据能力（结论不可信），必须红，不许拿「零命中」当结论。
//   ② 不可达棘轮：SPIDER_DEAD_TARGET 命中数必须**恰好等于** DEAD_TARGET_BASELINE（当前 0）。
//      ★ 等于 0 ⇒ 结构不可达成立（可提核销）；**一旦大于 0 ⇒ 链条成立，须立刻把它从
//      fact-emission-census 的 NON_SAMPLE_SPECS 白名单里摘除**，不得继续按死代码对待。
//      这条是双向的：既不许把活的说成死的，也不许把死的表现成活的。
//
// 段一 静态自证（不跑战斗）：直接读 modules/20elite-skills.js 源码，断言三件事仍成立——
//   目标池过滤式里带 `u.alive`、判空分支紧跟其后、判的就是同一个 target 的 alive。
//   源码形状一变（比如过滤式去掉 alive、或中间插入了会改 alive 的调用），本用例**立刻红**，
//   因为「结构不可达」这个结论的前提没了，必须人工复核，不许静默沿用旧结论。
//
// 用法：
//   node tests/spider-dead-target-case.mjs           跑静态自证 + 定向扫描（退出码 0/1）
//   node tests/spider-dead-target-case.mjs --scan    只打印计数，不做棘轮断言
// 环境变量：SEEDS_N（默认 20）/ STAGES（默认 1-7）
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

export const VER = 'tests/spider-dead-target-case.mjs V1.1.0';

const SCAN_ONLY = process.argv.includes('--scan');
const SEEDS_N = Number(process.env.SEEDS_N || 20);
const STAGES = process.env.STAGES ? process.env.STAGES.split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7];
// 覆盖棘轮下限：定向（forceXiaoZhao='brother'）140 场下实测进入目标池 30+ 次，取 5 留足余量。
const MIN_ENTER = 5;
// 不可达棘轮：当前干净树恒 0（第 160 轮普查实测）。命中数一旦上升即红，方向只允许「摘白名单」。
const DEAD_TARGET_BASELINE = 0;

const here = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_SRC = path.join(here, '..', 'modules', '20elite-skills.js');

// ---------- 段一：静态自证 ----------
function staticSelfProof() {
    const src = fs.readFileSync(SKILLS_SRC, 'utf8');
    const lines = src.split(/\r?\n/);
    // 找目标池过滤式所在行：形如 `enemySide.filter(u => u.alive && ...)`（含 canBeTargeted）
    const filterIdx = lines.findIndex(l => /\.filter\(\s*u\s*=>\s*u\.alive\b/.test(l) && /canBeTargeted/.test(l));
    // 找判空分支所在行：形如 `if (!target.alive)`
    const guardIdx = lines.findIndex(l => /if\s*\(\s*!target\.alive\s*\)/.test(l));
    // 找两者之间的取值行：形如 `const target = aliveEnemies[`
    const pickIdx = lines.findIndex(l => /const\s+target\s*=\s*\w+\[/.test(l));
    const out = { ok: false, filterIdx, guardIdx, pickIdx, reasons: [] };
    if (filterIdx < 0) out.reasons.push('未找到带 u.alive 与 canBeTargeted 的目标池过滤式');
    if (pickIdx < 0) out.reasons.push('未找到目标取值行');
    if (guardIdx < 0) out.reasons.push('未找到 !target.alive 判空分支');
    if (out.reasons.length) return out;
    if (!(filterIdx < pickIdx && pickIdx < guardIdx)) {
        out.reasons.push('三行顺序异常（应为 过滤 → 取值 → 判空）');
        return out;
    }
    // 判空分支必须与过滤式作用于同一个数组变量
    const arrName = (lines[filterIdx].match(/const\s+(\w+)\s*=/) || [])[1];
    if (!arrName || !new RegExp('\\b' + arrName + '\\b').test(lines[pickIdx])) {
        out.reasons.push('取值行用的不是过滤式产出的数组');
        return out;
    }
    // 判空与取值之间不得再出现可能改写 alive 的调用（applyStatChange / 伤害结算等）
    for (let i = pickIdx + 1; i < guardIdx; i++) {
        if (/applyStatChange|dealDamage|refreshHp|settleDeath|_pendingDeath/.test(lines[i])) {
            out.reasons.push('取值与判空之间出现会改写 alive 的调用（第 ' + (i + 1) + ' 行）⇒ 竞态可能真实存在');
            return out;
        }
    }
    out.ok = true;
    out.arrName = arrName;
    return out;
}

async function main() {
    console.log('=== SPIDER_DEAD_TARGET 定向取证用例 ' + VER + ' ===');
    // ---------- 段一 ----------
    const sp = staticSelfProof();
    console.log('--- 段一 静态自证（modules/20elite-skills.js）---');
    if (sp.ok) {
        console.log('  ✅ 过滤式第 ' + (sp.filterIdx + 1) + ' 行（含 u.alive）→ 取值第 ' + (sp.pickIdx + 1)
            + ' 行 → 判空第 ' + (sp.guardIdx + 1) + ' 行；三者之间无改写 alive 的调用');
        console.log('  ⇒ 静态上：目标取自「已过滤 alive」的数组，且中途无人改 alive ⇒ !target.alive 不可达');
    } else {
        console.log('  ❌ 静态自证未通过（结论前提已失效，须人工复核）：');
        for (const r of sp.reasons) console.log('     · ' + r);
    }

    const [{ CONFIG, loadGameData, loadHexEnhanceData }, { SeededRNG }, { createRoundStepper },
           { initBattleTeams }, { GlobalStore }, { FACT_TYPES: FT }] = await Promise.all([
        import('../core/01config-5v5-test.js'),
        import('../infra/51-core-utils.js'),
        import('../core/11battle-round.js'),
        import('../modules/29battle-init.js'),
        import('../infra/54-global-store.js'),
        import('../infra/56-battle-enums.js')
    ]);
    const { tickAndPickBuffs } = await import('./_lib/buff-picker.mjs');
    await import('../modules/25elite-imperial.js');
    await import('../modules/26elite-sixsects.js');
    await import('../modules/27elite-mingjiao.js');
    await import('../modules/30custom-effects.js');
    await loadGameData();
    // 第 162 轮：上游把小昭.hexEnhance 整段迁到 content/201hex-enhance.json，启动链必须一并 loadHexEnhanceData（缺口由 tests/hex-boot-chain-guard.mjs 点名）
    await loadHexEnhanceData();

    const MAX_ROUND = CONFIG.MAX_ROUND || 35;

    function runBattle(seed, stage) {
        // 强制小昭·兄：29battle-init 的 forceXiaoZhao='brother' ⇒ 蛛变/落地蛛袭链路稳定上场
        GlobalStore.set('forceXiaoZhao', 'brother');
        const rng = new SeededRNG(seed);
        const { allyTeam, enemyTeam } = initBattleTeams(stage, rng);
        let battleState = {
            ally: allyTeam.map(u => u.clone()),
            enemy: enemyTeam.map(u => u.clone()),
            round: 1, activeBuffs: [],
            allAllies: allyTeam.map(u => u.clone()), _rng: rng
        };
        battleState.activeBuffs = tickAndPickBuffs([], battleState.ally, battleState.enemy, 1, seed, true);
        let enter = 0, dead = 0, spiderStrike = 0;
        const deadHits = [];
        let lastStep = null, winner = null;
        while (battleState.round <= MAX_ROUND) {
            for (const step of createRoundStepper(battleState)) {
                lastStep = step;
                // fact 收集口径与 rules-replay / 结构扫描器一致：顶层 + attack-group 的 data.entries 嵌套层
                const collect = (f) => {
                    if (!f || !f.factType || !f.data) return;
                    if (f.factType === FT.SPIDER_DEAD_TARGET) {
                        dead++;
                        if (deadHits.length < 8) deadHits.push({ seed, stage, round: battleState.round });
                        return;
                    }
                    if (f.factType === FT.SPIDER_STRIKE) { spiderStrike++; enter++; }
                };
                for (const f of (step.log || [])) {
                    collect(f);
                    if (f && f.factType === FT.ATTACK && f.data) {

                        // ★ 第 164 轮补层：幻影类 fact 挂在 data.phantomFact，与 data.entries 并列**而不在 entries 里**
                        //   ⇒ 只扫 entries 的写法对它恒不可见（第 163 轮在 census / rules-replay 里已实锤）
                        if (f.data.phantomFact) collect(f.data.phantomFact);
                        if (Array.isArray(f.data.entries)) for (const e of f.data.entries) collect(e);
                    }
                }
                if (step.winner) winner = step.winner;
            }
            if (winner || !lastStep) break;
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
        GlobalStore.set('forceXiaoZhao', null);
        return { enter, dead, spiderStrike, deadHits };
    }

    const seeds = Array.from({ length: SEEDS_N }, (_, i) => i + 1);
    let battles = 0, enter = 0, dead = 0, spiderStrike = 0;
    const allDead = [];
    for (const seed of seeds) {
        for (const stage of STAGES) {
            battles++;
            const r = runBattle(seed, stage);
            enter += r.enter; dead += r.dead; spiderStrike += r.spiderStrike;
            for (const h of r.deadHits) allDead.push(h);
        }
    }

    console.log('--- 段二 定向扫描（forceXiaoZhao=brother，' + battles + ' 场）---');
    console.log('  进入「落地蛛袭目标池非空」分支 ' + enter + ' 次（SPIDER_STRIKE ' + spiderStrike + ' 次）');
    console.log('  SPIDER_DEAD_TARGET 命中 ' + dead + ' 次' + (allDead.length ? '，样例 ' + JSON.stringify(allDead.slice(0, 4)) : ''));

    if (SCAN_ONLY) {
        console.log('（--scan 模式：不做棘轮断言）');
        return;
    }

    const fails = [];
    if (!sp.ok) fails.push('段一 静态自证未通过（结论前提失效，须人工复核）：' + sp.reasons.join('；'));
    if (enter < MIN_ENTER) {
        fails.push('覆盖棘轮未达下限：进入目标池 ' + enter + ' 次 < ' + MIN_ENTER
            + ' ⇒ 零命中不构成「不可达」证据，须先补样本（不许拿零命中当结论）');
    }
    if (dead !== DEAD_TARGET_BASELINE) {
        fails.push('不可达棘轮被打破：SPIDER_DEAD_TARGET 命中 ' + dead + ' 次 ≠ 基线 '
            + DEAD_TARGET_BASELINE + ' ⇒ 链条成立，须立刻把它从 fact-emission-census 的 NON_SAMPLE_SPECS 摘除');
    }

    console.log('--- 结论 ---');
    if (fails.length === 0) {
        console.log('  ✅ 结构不可达成立：' + enter + ' 次进入目标池，SPIDER_DEAD_TARGET 恒 ' + dead
            + ' 次 ⇒ modules/20elite-skills.js L225 的收尾帧竞态分支在干净树下不可达，可提核销（主代码改动仍待拍板）');
        console.log('  ★ 核销口径：只许删这一处判空分支及其 fact 枚举，不许顺手放宽落地蛛袭的任何判据');
    } else {
        console.log('  ❌ ' + fails.length + ' 条未过：');
        for (const f of fails) console.log('     · ' + f);
    }
    if (fails.length) process.exitCode = 1;
}

main().catch(e => { console.error('❌ 用例异常：' + (e && e.message ? e.message : e)); process.exitCode = 1; });
