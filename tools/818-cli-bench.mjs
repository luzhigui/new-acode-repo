// tools/818-cli-bench.mjs V1.0.0 | 2026-11-21
// 命令行版跑批器：不开浏览器、不点按钮，直接在本机用同一套 816 引擎跑评测出结果。
//
// 用法（在 new-acode-repo 目录下）：
//   node tools/818-cli-bench.mjs weak  --runs 100                  # 弱精英：M104/M100/M97 同种子 A/B 替换
//   node tools/818-cli-bench.mjs weak  --runs 100 --stages 2,3     # 只跑第2、3关
//   node tools/818-cli-bench.mjs weak  --runs 100 --units 唐文亮,素问
//   node tools/818-cli-bench.mjs solo  --runs 100                  # 强精英单核（张无忌/韦一笑/小昭姐妹/谢逊/寒离飒）
//   node tools/818-cli-bench.mjs elite --runs 100                  # 主表·自然出场（六名精英谁在场记给谁）
//   node tools/818-cli-bench.mjs none  --runs 100                  # 无精英基线（明教胜率）
//
// 可选参数：--seed 123456（复现同一批随机流）、--jobs 6（并行子进程数，默认核数-1）、--enemy-hex（六大派也选海克斯）
//
// 实现：每个子进程各自 import 816 worker（用 Node 侧 shim 顶掉 window/self/localStorage/fetch），
//   按关分片跑，父进程收齐后打印表格。与网页端同引擎、同 job 口径，数值可直接对照。

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fork } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const M_TIERS = [104, 100, 97];
const CHUNK = 50;
const ALL_STAGES = [1, 2, 3, 4, 5, 6, 7];
const SOLO_LIST = ['张无忌', '韦一笑', '小昭·姊', '小昭·妹', '金毛狮王谢逊', '寒离飒'];

const isChild = process.argv.includes('--child');

// ================================ 子进程：跑一批 job，逐条打印 JSON ================================
if (isChild) {
    const cfg = JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--child') + 1], 'utf8'));
    await runChild(cfg);
    process.exit(0);
}

async function runChild(cfg) {
    globalThis.window = globalThis;
    globalThis.self = globalThis;
    let readyMsg = null;
    let onReady = null;
    let onJob = null;
    globalThis.postMessage = (m) => {
        if (process.env.MF818_DEBUG) console.error('[child msg]', JSON.stringify(m).slice(0, 200));
        if (m && m.kind === 'worker-ready') { readyMsg = m; onReady && onReady(m); return; }
        onJob && onJob(m);
    };
    globalThis.fetch = async (u) => {
        const s = String(u);
        const rel = s.includes('002-hex') ? 'content/002-hex-enhance.json' : 'content/001-game-data.json';
        const body = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    };

    await import(pathToFileURL(path.join(HERE, '816-role-balance-worker.js')).href);
    if (!readyMsg) {
        await new Promise((resolve, reject) => {
            onReady = (m) => (m.ok ? resolve() : reject(new Error('worker 载入失败: ' + m.error)));
            setTimeout(() => reject(new Error('worker 60s 未就绪')), 60000);
        });
    } else if (!readyMsg.ok) {
        throw new Error('worker 载入失败: ' + readyMsg.error);
    }

    const send = (msg) => new Promise((resolve, reject) => {
        onJob = (m) => {
            if (!m || m.jobId !== msg.jobId) return;
            onJob = null;
            m.ok === false ? reject(new Error(m.error)) : resolve(m.result);
        };
        self.onmessage({ data: msg });
    });

    for (const job of cfg.jobs) {
        const t0 = Date.now();
        try {
            const result = await send(job.msg);
            console.log('@@RESULT ' + JSON.stringify({ key: job.key, stage: job.stage, result, ms: Date.now() - t0 }));
        } catch (e) {
            console.log('@@RESULT ' + JSON.stringify({ key: job.key, stage: job.stage, error: String(e && e.message || e) }));
        }
    }
}

// ================================ 父进程 ================================
const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
if (!['weak', 'solo', 'elite', 'none'].includes(cmd)) {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 20).join('\n'));
    process.exit(cmd ? 1 : 0);
}

const RUNS = Number(args.runs || 100);
const SEED = Number(args.seed || Date.now());
const ENEMY_HEX = !!args['enemy-hex'];
const STAGES = parseStages(args.stages);
const POOL = Math.max(1, Math.min(Number(args.jobs || (os.cpus().length - 1) || 2), STAGES.length));

// 弱精英候选：与 846 同口径——M104/M100/M97 且有技能，side 由阵营派生
const gameData = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/001-game-data.json'), 'utf8'));
const weakUnits = (() => {
    const want = args.units && args.units !== 'all' ? String(args.units).split(/[,，]/).map(s => s.trim()) : null;
    const out = [];
    for (const [name, c] of Object.entries(gameData.characters || {})) {
        if (c.camp !== '明教' && c.camp !== '六大派') continue;
        if (Object.keys(c.skills || {}).length === 0) continue;
        if (!M_TIERS.includes(c.m)) continue;
        if (want && !want.includes(name)) continue;
        out.push({ name, side: c.camp === '明教' ? 'ally' : 'enemy' });
    }
    return out;
})();

// 按关分片，一个子进程负责一段连续的关
const stageBatches = [];
for (let i = 0; i < POOL; i++) {
    const slice = STAGES.filter((_, idx) => idx % POOL === i);
    if (slice.length) stageBatches.push(slice);
}

console.log(`# ${cmd} ｜ 每格 ${RUNS} 场 ｜ 关卡 ${STAGES.join(',')} ｜ seed=${SEED} ｜ 并行 ${stageBatches.length} 进程${ENEMY_HEX ? ' ｜ 双海克斯' : ''}`);
const t0 = Date.now();

const jobsByBatch = stageBatches.map((stages) => {
    const jobs = [];
    for (const stage of stages) {
        if (cmd === 'weak') {
            for (let u = 0; u < weakUnits.length; u++) {
                const unit = weakUnits[u];
                for (let c = 0; c < Math.ceil(RUNS / CHUNK); c++) {
                    const runs = Math.min(CHUNK, RUNS - c * CHUNK);
                    if (runs <= 0) continue;
                    jobs.push({
                        key: unit.name, stage,
                        msg: {
                            jobId: jobs.length + 1, kind: 'unitAB', stage,
                            seed: SEED + stage * 131 + u * 7717,
                            startIndex: c * CHUNK, runs, elite: unit.name, side: unit.side, enemyHex: ENEMY_HEX
                        }
                    });
                }
            }
        } else if (cmd === 'solo') {
            for (let u = 0; u < SOLO_LIST.length; u++) {
                for (let c = 0; c < Math.ceil(RUNS / CHUNK); c++) {
                    const runs = Math.min(CHUNK, RUNS - c * CHUNK);
                    if (runs <= 0) continue;
                    jobs.push({
                        key: SOLO_LIST[u], stage,
                        msg: {
                            jobId: jobs.length + 1, kind: 'soloElite', stage,
                            seed: SEED + stage * 131 + u * 7717,
                            startIndex: c * CHUNK, runs, elite: SOLO_LIST[u], enemyHex: ENEMY_HEX
                        }
                    });
                }
            }
        } else {
            for (let c = 0; c < Math.ceil(RUNS / CHUNK); c++) {
                const runs = Math.min(CHUNK, RUNS - c * CHUNK);
                if (runs <= 0) continue;
                jobs.push({
                    key: '*', stage,
                    msg: {
                        jobId: jobs.length + 1, kind: cmd === 'none' ? 'noElite' : 'elite', stage,
                        seed: SEED + stage * 131, startIndex: c * CHUNK, runs, enemyHex: ENEMY_HEX
                    }
                });
            }
        }
    }
    return jobs;
});

const results = [];
await Promise.all(jobsByBatch.map((jobs, i) => new Promise((resolve, reject) => {
    const cfgFile = path.join(os.tmpdir(), `mf818-${process.pid}-${i}.json`);
    fs.writeFileSync(cfgFile, JSON.stringify({ jobs }));
    const child = fork(fileURLToPath(import.meta.url), ['--child', cfgFile], { stdio: ['ignore', 'pipe', 'inherit', 'ipc'] });
    let buf = '';
    child.stdout.on('data', (d) => {
        buf += d.toString();
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
            if (line.startsWith('@@RESULT ')) results.push(JSON.parse(line.slice(9)));
        }
    });
    child.on('exit', (code) => {
        try { fs.unlinkSync(cfgFile); } catch (e) { /* 临时文件，忽略 */ }
        code === 0 ? resolve() : reject(new Error(`子进程退出码 ${code}`));
    });
})));

printTable(cmd, results);
console.log(`# 总耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// ---------------- 聚合与输出 ----------------
function sumVariants(result) {
    // solo/elite 返回 { 变体桶: {runs,wins,...} }；none 是 { variants: {...} }
    const out = { runs: 0, wins: 0, draws: 0 };
    const src = result && result.variants ? result.variants : result;
    for (const v of Object.values(src || {})) {
        if (!v || typeof v.runs !== 'number') continue;
        out.runs += v.runs || 0; out.wins += v.wins || 0; out.draws += v.draws || 0;
    }
    return out;
}

function printTable(cmd, results) {
    const errs = results.filter(r => r.error);
    for (const e of errs.slice(0, 5)) console.log(`! ${e.key}·第${e.stage}关 出错：${e.error}`);

    if (cmd === 'weak') {
        const agg = new Map();
        for (const r of results) {
            if (r.error) continue;
            const k = r.key + '|' + r.stage;
            const a = agg.get(k) || { runs: 0, nat: 0, force: 0, fw: 0, fl: 0 };
            a.runs += r.result.runs || 0;
            a.nat += r.result.natWins || 0;
            a.force += r.result.forceWins || 0;
            a.fw += r.result.flipWin || 0;
            a.fl += r.result.flipLose || 0;
            agg.set(k, a);
        }
        console.log('\n| 关卡 | 单位 | 阵营 | 自然胜率 | 换入胜率 | Δ | 翻盘↑/↓ | 场次 |');
        console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
        const rows = [...agg.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh')).map(([k, a]) => {
            const [name, stage] = k.split('|');
            const unit = weakUnits.find(u => u.name === name) || { side: '?' };
            const nr = a.runs ? a.nat / a.runs * 100 : 0;
            const fr = a.runs ? a.force / a.runs * 100 : 0;
            return { name, stage: Number(stage), side: unit.side, nr, fr, d: fr - nr, fw: a.fw, fl: a.fl, runs: a.runs };
        }).sort((a, b) => a.stage - b.stage || b.d - a.d);
        for (const r of rows) {
            const sign = r.d >= 0 ? '+' : '';
            const nr = r.runs ? r.nr.toFixed(1) + '%' : '—';
            const fr = r.runs ? r.fr.toFixed(1) + '%' : '—';
            const d = r.runs ? `${sign}${r.d.toFixed(1)}pp` : '—';
            console.log(`| ${r.stage} | ${r.name} | ${r.side === 'ally' ? '明教' : '六大派'} | ${nr} | ${fr} | ${d} | ${r.fw}/${r.fl} | ${r.runs} |`);
        }
        return;
    }

    if (cmd === 'solo') {
        const agg = new Map();
        for (const r of results) {
            if (r.error) continue;
            const s = sumVariants(r.result);
            const k = r.key + '|' + r.stage;
            const a = agg.get(k) || { runs: 0, wins: 0, draws: 0 };
            a.runs += s.runs; a.wins += s.wins; a.draws += s.draws;
            agg.set(k, a);
        }
        console.log('\n| 关卡 | 单核精英 | 胜率 | 场次 |');
        console.log('| --- | --- | --- | --- |');
        for (const [k, a] of [...agg.entries()].sort((x, y) => Number(x[0].split('|')[1]) - Number(y[0].split('|')[1]) || x[0].localeCompare(y[0], 'zh'))) {
            const [name, stage] = k.split('|');
            console.log(`| ${stage} | ${name} | ${a.runs ? (a.wins / a.runs * 100).toFixed(1) : '0.0'}% | ${a.runs} |`);
        }
        return;
    }

    // elite：结果是「变体桶 → { 精英名: agg }」两层，按精英名汇总；none：变体桶一层
    const agg = new Map();
    for (const r of results) {
        if (r.error) continue;
        const src = r.result && r.result.variants ? r.result.variants : r.result;
        for (const [outer, bucket] of Object.entries(src || {})) {
            if (cmd === 'none') {
                if (!bucket || typeof bucket.runs !== 'number') continue;
                const k = '明教|' + r.stage;
                const a = agg.get(k) || { runs: 0, wins: 0 };
                a.runs += bucket.runs; a.wins += bucket.wins;
                agg.set(k, a);
                continue;
            }
            if (!bucket || typeof bucket !== 'object') continue;
            for (const [name, v] of Object.entries(bucket)) {
                if (!v || typeof v.runs !== 'number' || v.runs === 0) continue;
                const k = name + '|' + r.stage;
                const a = agg.get(k) || { runs: 0, wins: 0 };
                a.runs += v.runs; a.wins += v.wins;
                agg.set(k, a);
            }
        }
    }
    console.log(cmd === 'none' ? '\n| 关卡 | 明教胜率 | 场次 |' : '\n| 关卡 | 在场精英 | 胜率 | 场次 |');
    console.log(cmd === 'none' ? '| --- | --- | --- |' : '| --- | --- | --- | --- |');
    for (const [k, a] of agg.entries()) {
        const [name, stage] = k.split('|');
        const rate = a.runs ? (a.wins / a.runs * 100).toFixed(1) + '%' : '0.0%';
        console.log(cmd === 'none' ? `| ${stage} | ${rate} | ${a.runs} |` : `| ${stage} | ${name} | ${rate} | ${a.runs} |`);
    }
}

// ---------------- 参数 ----------------
function parseArgs(argv) {
    const out = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const k = a.slice(2);
            const next = argv[i + 1];
            if (next && !next.startsWith('--')) { out[k] = next; i++; } else out[k] = true;
        } else out._.push(a);
    }
    return out;
}

function parseStages(v) {
    if (!v || v === 'all') return ALL_STAGES;
    return String(v).split(/[,，]/).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 7);
}
