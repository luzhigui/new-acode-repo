// tools/121-param-lab.mjs — 平衡参数对照实验台（固定关卡 × 固定阵容 × 固定海克斯 × 配对 seed）· 命令行薄壳
// V1.1.1 | 预估 13100 bytes | 2026-09-29 路径改名（原 120-param-lab.mjs）；V1.1.0 瘦身：核心逻辑（seed 散列 / 海克斯 / 采样 / 对战 / 补丁 /
//          旋钮扫描）全部搬到 tools/122-param-lab-core.js（浏览器 worker 与本 CLI 共用同一份），
//          本文件只保留命令行解析、node 垫片、--sample 写清单、默认对照模式与 markdown 报告写盘、
//          --json。行为与 V1.0.0 一致（同样的报告字段与措辞）。
// V1.0.0 | 2026-09-28 新建：① --sample 采样明教阵容分布、取最常出现的典型阵容产成清单 JSON；
//          ② 默认模式用清单跑「基线 vs 补丁」配对对照（同一 (阵容,局序) 用同一 seed 各跑一遍，
//          比较翻转局数）。只读 content/200game-data.json：补丁用路径式内存改写，且**先跑完基线
//          再打补丁**，全程不写回磁盘。
export const VER = 'tools/121-param-lab.mjs V1.1.1';
//
// 用法：
//   node tools/121-param-lab.mjs --sample --stage 3 --runs 1000
//   node tools/121-param-lab.mjs --stage 3 --runs 100
//   node tools/121-param-lab.mjs --stage 3 --runs 100 --patch 补丁.json --json
//   node tools/121-param-lab.mjs --stage 3 --runs 100 --lineups tools/output/lineups-stage3.json
//
// 补丁格式（路径式；路径写错会直接报错，避免「补丁没生效」被误读成「参数没影响」）：
//   { "set": [ { "path": "characters.张无忌.mechanics.0.onHitEffects.0.pct", "value": 0.3 } ] }
//   ⚠ 旋钮位置要先确认：很多 skills.*.params.* 只是文案插值（如 张无忌 nineYang.params.healPct），
//     真正生效的是 mechanics 里的同名声明（tests/health-rules/143 有备注）。
//
// 口径（基准是 tests/rules-replay.mjs 的无头跑法，差异都写在下面）：
//   · 明教阵容：按清单重建（职业/站位/属性全部固定 —— 属性用阵容自带的固定 seed 摇一次，
//     各局之间不再变），把「局与局」的差异收窄成纯战斗随机。
//   · 六大派：仍走 initBattleTeams 随机生成；同一 seed 在基线与补丁两遍里完全同源。
//   · 海克斯：固定 —— tickAndPickBuffs 用常量 HEX_SEED（不消耗战斗 RNG），
//     第 1 回合预注入、其后每 3 回合补选（照抄 rules-replay 的节奏）。
//     小昭·妹「永久继承本队海克斯」按 player/49 口径补上（引擎 modules/27、core/12 会读）。
//   · 未复刻：player/49 是用战斗 RNG 抽 Buff（本工具改成确定性轮转，否则谈不上「固定」）；
//     UI/动画/战报 Store 同步均不参与。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- 环境垫片：引擎零 DOM，但 import 链上会碰浏览器 API。必须在 import core 之前装好 ---
globalThis.window = globalThis;
globalThis.localStorage = {
    _d: new Map(),
    getItem(k) { return this._d.has(k) ? this._d.get(k) : null; },
    setItem(k, v) { this._d.set(k, String(v)); },
    removeItem(k) { this._d.delete(k); }
};
globalThis.fetch = async (url) => {
    let p = typeof url === 'string' ? url : (url.pathname || String(url));
    p = decodeURIComponent(p);
    if (/^[A-Za-z]:[\\/]/.test(p)) { /* 已是绝对路径 */ }
    else {
        const m = p.replace(/\\/g, '/').match(/(?:^|\/)(content\/.+)$/);
        p = m ? join(ROOT, m[1]) : join(ROOT, p.replace(/^\/+/, ''));
    }
    const text = readFileSync(p, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
};

// --- 命令行参数 ---
function parseArgs(argv) {
    const o = {
        sample: false, stage: 3, runs: 100, base: null, pick: 15,
        lineups: null, patch: null, out: null, json: false
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--sample') o.sample = true;
        else if (a === '--json') o.json = true;
        else if (a === '--stage') o.stage = Number(argv[++i]) || o.stage;
        else if (a === '--runs') o.runs = Math.max(1, Number(argv[++i]) || o.runs);
        else if (a === '--base') o.base = Number(argv[++i]);
        else if (a === '--pick') o.pick = Math.max(1, Number(argv[++i]) || o.pick);
        else if (a === '--lineups') o.lineups = argv[++i];
        else if (a === '--patch') o.patch = argv[++i];
        else if (a === '--out') o.out = argv[++i];
        else if (a === '--help' || a === '-h') {
            console.log([
                '用法: node tools/121-param-lab.mjs [--sample] [--stage 3] [--runs 100] [--base N] [--pick 15]',
                '                                      [--lineups 清单.json] [--patch 补丁.json] [--out 报告.md] [--json]'
            ].join('\n'));
            process.exit(0);
        }
    }
    // 采样默认从 20000 起（固定，采样结果可复现）；对照实验默认从 1 起
    if (o.base == null) o.base = o.sample ? 20000 : 1;
    return o;
}
const ARGS = parseArgs(process.argv.slice(2));

// --- 核心逻辑（唯一来源：tools/122-param-lab-core.js）---
const { HEX_SEED, ensureGameData, sampleStage, pickTypicals, concreteKey, runLineup, applyPatch, isWin } =
    await import('./122-param-lab-core.js');
const GAME = await ensureGameData();            // 缓存本体，补丁改的就是它

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------
function outPath(name) {
    mkdirSync(join(ROOT, 'tools', 'output'), { recursive: true });
    return join(ROOT, 'tools', 'output', name);
}

const t0 = Date.now();

if (ARGS.sample) {
    const runs = ARGS.runs === 100 ? 1000 : ARGS.runs;     // --sample 默认采样 1000 个
    console.error(`[120] 采样：第 ${ARGS.stage} 关 / ${runs} 个阵容 / seed ${ARGS.base}..${ARGS.base + runs - 1}`);
    const sample = sampleStage(ARGS.stage, runs, ARGS.base);
    const lineups = pickTypicals(sample, ARGS.pick);

    console.log(`\n=== 精英组合（共 ${sample.list.length} 种，理论：0精英20% / 单精英各15% / 双精英各2.5% / 三精英各1.25%）===`);
    for (const l of lineups) {
        console.log(`  ${(l.rosterCount / runs * 100).toFixed(1).padStart(5)}%  重抽 ${String(l.rosterCount).padStart(4)} 次  ${l.label}`
            + `（组内 ${l.variety} 种具体配置；典型度 ${l.avgOverlap.toFixed(2)}/5，即与本组平均样本共享的名字+职业数）`);
    }
    console.log(`\n=== 典型阵容明细 ===`);
    for (const l of lineups) {
        console.log(`  ${l.id} ${l.label}`);
        console.log(`      ${concreteKey(l.spec)}`);
    }

    const file = ARGS.out || outPath(`lineups-stage${ARGS.stage}.json`);
    writeFileSync(file, JSON.stringify({
        ver: VER, stage: ARGS.stage, runs, base: ARGS.base, hexSeed: HEX_SEED,
        groups: sample.list.length, lineups
    }, null, 2), 'utf8');
    console.error(`[120] 清单已写出：${file}（${((Date.now() - t0) / 1000).toFixed(1)}s）`);
    process.exit(0);
}

// --- 对照实验 ---
const lineupFile = ARGS.lineups || outPath(`lineups-stage${ARGS.stage}.json`);
let lineups, sampleRuns = 1000;
try {
    const lf = JSON.parse(readFileSync(lineupFile, 'utf8'));
    lineups = lf.lineups;
    sampleRuns = lf.runs || sampleRuns;
} catch (e) {
    console.error(`[121] 读不到阵容清单 ${lineupFile}\n      先跑：node tools/121-param-lab.mjs --sample --stage ${ARGS.stage}`);
    process.exit(1);
}

let patch = null;
if (ARGS.patch) {
    try { patch = JSON.parse(readFileSync(ARGS.patch, 'utf8')); }
    catch (e) { console.error(`[120] 读不到补丁 ${ARGS.patch}：${e.message}`); process.exit(1); }
}

console.error(`[120] 对照实验：第 ${ARGS.stage} 关 / ${lineups.length} 阵容 × ${ARGS.runs} 局 × 2 遍（基线+补丁）`
    + `\n      海克斯固定 seed=${HEX_SEED}；明教属性固定；六大派随 seed`
    + `\n      补丁：${ARGS.patch || '（无，仅跑基线）'}`);

const baseArm = [];
for (let i = 0; i < lineups.length; i++) {
    const r = runLineup(ARGS.stage, lineups[i], ARGS.runs, ARGS.base);
    baseArm.push(r);
    console.error(`  基线 ${lineups[i].id} ${(i + 1)}/${lineups.length} 明教胜率 ${(r.filter(isWin).length / ARGS.runs * 100).toFixed(1)}%`);
}

let patchArm = null;
if (patch) {
    applyPatch(GAME, patch);                 // 基线跑完才打补丁，无需还原
    patchArm = [];
    for (let i = 0; i < lineups.length; i++) {
        const r = runLineup(ARGS.stage, lineups[i], ARGS.runs, ARGS.base);
        patchArm.push(r);
        console.error(`  补丁 ${lineups[i].id} ${(i + 1)}/${lineups.length} 明教胜率 ${(r.filter(isWin).length / ARGS.runs * 100).toFixed(1)}%`);
    }
}

// --- 报告 ---
const pct = (w, n) => (w / n * 100).toFixed(1) + '%';
function summarize(arm) {
    let w = 0, err = 0, n = 0;
    for (const r of arm) for (const x of r) { n++; if (isWin(x)) w++; if (x && String(x).startsWith('ERROR')) err++; }
    return { w, n, err, rate: w / n };
}
const sb = summarize(baseArm), sp = patchArm ? summarize(patchArm) : null;

// 实际权重加权（权重 = 该阵容在采样里的出现频率，15 组之和 = 1）
let wBase = 0, wPatch = 0;
lineups.forEach((l, i) => {
    const w = l.rosterCount / sampleRuns;
    wBase += w * (baseArm[i].filter(isWin).length / ARGS.runs);
    if (patchArm) wPatch += w * (patchArm[i].filter(isWin).length / ARGS.runs);
});

let md = `# 参数对照实验 · 第 ${ARGS.stage} 关\n\n`;
md += `- 工具：${VER}\n- 阵容清单：${lineupFile}（${lineups.length} 个典型阵容）\n`;
md += `- 每阵容局数：${ARGS.runs}；seed 起点：${ARGS.base}；海克斯：固定 seed=${HEX_SEED}\n`;
md += `- 补丁：${ARGS.patch ? '`' + ARGS.patch + '`' : '无（只跑基线）'}\n`;
md += `- 明教属性固定（每阵容一个 statSeed）；六大派随 seed 生成，基线与补丁同 seed 同源\n\n`;
md += `## 逐阵容\n\n| 阵容 | 名册频率 | 明教胜率(基线) | ${patchArm ? '明教胜率(补丁) | Δ | 翻转 A→B | 翻转 B→A | 净翻转' : ''}\n`;
md += `|---|---|---|${patchArm ? '|---|---|---|---|---' : ''}\n`;
let flipsUp = 0, flipsDown = 0;
lineups.forEach((l, i) => {
    const b = baseArm[i], p = patchArm ? patchArm[i] : null;
    const bw = b.filter(isWin).length;
    let row = `| ${l.id} ${l.label} | ${(l.rosterCount / sampleRuns * 100).toFixed(1)}% | ${pct(bw, ARGS.runs)} |`;
    if (p) {
        const pw = p.filter(isWin).length;
        let up = 0, down = 0;
        for (let k = 0; k < ARGS.runs; k++) {
            if (!isWin(b[k]) && isWin(p[k])) up++;
            else if (isWin(b[k]) && !isWin(p[k])) down++;
        }
        flipsUp += up; flipsDown += down;
        row += ` ${pct(pw, ARGS.runs)} | ${((pw - bw) / ARGS.runs * 100 >= 0 ? '+' : '') + ((pw - bw) / ARGS.runs * 100).toFixed(1)}% | ${up} | ${down} | ${(up - down >= 0 ? '+' : '') + (up - down)} |`;
    }
    md += row + '\n';
});
md += `\n## 汇总\n\n`;
md += `- 等权（15 个阵容一视同仁）：基线 ${(sb.rate * 100).toFixed(1)}%`;
if (sp) md += ` → 补丁 ${(sp.rate * 100).toFixed(1)}%（${((sp.rate - sb.rate) * 100 >= 0 ? '+' : '') + ((sp.rate - sb.rate) * 100).toFixed(2)}%）`;
md += `\n`;
md += `- 实际权重（按各阵容的真实出现频率加权）：基线 ${(wBase * 100).toFixed(1)}%`;
if (sp) md += ` → 补丁 ${(wPatch * 100).toFixed(1)}%（${((wPatch - wBase) * 100 >= 0 ? '+' : '') + ((wPatch - wBase) * 100).toFixed(2)}%）`;
md += `\n`;
md += `- 局数：基线 ${sb.w}/${sb.n}${sb.err ? `（异常 ${sb.err} 局）` : ''}`;
if (sp) md += `；补丁 ${sp.w}/${sp.n}${sp.err ? `（异常 ${sp.err} 局）` : ''}`;
md += `\n`;
if (sp) md += `- 翻转局数：A→B ${flipsUp} 局 / B→A ${flipsDown} 局 / 净 **${flipsUp - flipsDown >= 0 ? '+' : ''}${flipsUp - flipsDown}**（翻转为正 = 补丁把败局变胜局）\n`;
md += `\n> 判读：配对 seed 下「净翻转」比绝对胜率灵敏一个数量级；净翻转与胜率差同时接近 0 = 该参数在本关无显著影响。\n`;

const file = ARGS.out || outPath(`lab-stage${ARGS.stage}${ARGS.patch ? '-patched' : ''}.md`);
writeFileSync(file, md, 'utf8');
console.log(md);
console.error(`[120] 报告已写出：${file}（${((Date.now() - t0) / 1000).toFixed(1)}s）`);

if (ARGS.json) {
    console.log(JSON.stringify({
        stage: ARGS.stage, runs: ARGS.runs, base: ARGS.base, hexSeed: HEX_SEED,
        baseline: sb, patched: sp, flipsUp, flipsDown, weightedBase: wBase, weightedPatch: patchArm ? wPatch : null,
        perLineup: lineups.map((l, i) => ({
            id: l.id, label: l.label,
            baseWins: baseArm[i].filter(isWin).length,
            patchWins: patchArm ? patchArm[i].filter(isWin).length : null
        }))
    }, null, 2));
}