#!/usr/bin/env node
// 对话花费统计 —— 看每个对话（以及每轮）花了多少钱
//
// 用法（在仓库任意位置执行）：
//   node tools/117-chat-cost.mjs                 # 统计当前仓库的对话
//   node tools/117-chat-cost.mjs --turns 12      # 只看最近 12 轮
//   node tools/117-chat-cost.mjs --all           # 列出所有工作区的对话
//
// 数据来源：~/.dsh/sessions/<工作区>/<会话id>/session.v3.jsonl.zstd
//   （每行一个 zstd 帧；assistant/message 行带 usage，turn/start 行标轮次）
// 计价：与 dsh-api-balance 插件同一张官方价目表，按每步时间戳分峰谷，
//   USD→CNY 按 7.2。改价只需改下面 PRICING / FX。

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import zlib from 'node:zlib';

// ---------- 计价（与 dsh-api-balance 一致）----------
const PRICING = {
    flash: {
        old: { hit: 0.0028, miss: 0.14, out: 0.28 },
        peak: { hit: 0.014, miss: 0.44, out: 1.32 },
        offPeak: { hit: 0.007, miss: 0.22, out: 0.66 }
    },
    pro: {
        old: { hit: 0.003625, miss: 0.435, out: 0.87 },
        peak: { hit: 0.044, miss: 1.32, out: 3.96 },
        offPeak: { hit: 0.022, miss: 0.66, out: 1.98 }
    }
};
const FX = 7.2;                              // USD → CNY
const NEW_PRICE_UTC = Date.UTC(2026, 7, 16, 16); // 2026-08-16 16:00 UTC 起峰谷计价

function modelKey(model) {
    const m = String(model || '').toLowerCase();
    if (m.includes('pro')) return 'pro';
    return 'flash';
}
function priceFor(model, ms) {
    const p = PRICING[modelKey(model)];
    if (ms < NEW_PRICE_UTC) return p.old;
    const h = new Date(ms).getUTCHours();
    const isPeak = (h >= 1 && h < 4) || (h >= 6 && h < 10);
    return isPeak ? p.peak : p.offPeak;
}
// 与插件公式完全一致：未命中输入按 miss、命中按 hit、输出按 out
function costCny(usage, model, ms) {
    const p = priceFor(model, ms);
    const miss = usage.inputTokens || 0;
    const hit = usage.cacheReadTokens || 0;
    const out = usage.outputTokens || 0;
    return ((miss * p.miss + hit * p.hit + out * p.out) / 1e6) * FX;
}

// ---------- 读会话 ----------
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
function decompressFrames(buf) {
    const parts = [];
    let off = 0;
    while (off < buf.length) {
        const idx = buf.indexOf(MAGIC, off);
        if (idx < 0) break;
        const next = buf.indexOf(MAGIC, idx + 4);
        const end = next < 0 ? buf.length : next;
        try { parts.push(zlib.zstdDecompressSync(buf.subarray(idx, end))); } catch { /* 坏帧跳过 */ }
        off = end;
    }
    return Buffer.concat(parts).toString('utf8');
}

const SESSIONS_ROOT = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'sessions');

// 目录名解码：Dsh 把路径里的非 ASCII/特殊字符转成 ~XXXX（UTF-16 码元的十六进制）
function decodeWsName(dir) {
    return dir
        .replace(/~([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/^-|-$/g, '');
}

// 找当前工作区对应的会话目录：解码所有目录名，取路径完全匹配的那个
function workspaceDir(wsPath) {
    if (!existsSync(SESSIONS_ROOT)) return null;
    const abs = resolve(wsPath);
    const dirs = readdirSync(SESSIONS_ROOT);
    const exact = dirs.find((d) => decodeWsName(d) === abs);
    if (exact) return join(SESSIONS_ROOT, exact);
    // 兜底：路径结尾匹配
    const tail = abs.slice(-20);
    const near = dirs.find((d) => decodeWsName(d).endsWith(tail));
    if (near) return join(SESSIONS_ROOT, near);
    // 再兜底：最近有活动的那个工作区
    let best = null;
    for (const d of dirs) {
        const p = join(SESSIONS_ROOT, d);
        try {
            const newest = Math.max(...readdirSync(p).map((s) => {
                try { return statSync(join(p, s)).mtimeMs; } catch { return 0; }
            }));
            if (!best || newest > best.t) best = { p, t: newest };
        } catch { /* skip */ }
    }
    return best ? best.p : null;
}

function listSessions(dir) {
    return readdirSync(dir)
        .map((s) => ({ id: s, file: join(dir, s, 'session.v3.jsonl.zstd') }))
        .filter((x) => existsSync(x.file))
        .map((x) => ({ ...x, size: statSync(x.file).size, mtime: statSync(x.file).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
}

function analyze(file) {
    const text = decompressFrames(readFileSync(file));
    const turns = [];
    let cur = null;
    let firstTime = null, lastTime = null;

    for (const line of text.split('\n')) {
        if (!line) continue;
        let o; try { o = JSON.parse(line); } catch { continue; }
        const t = o.time;
        if (typeof t === 'number') {
            if (firstTime === null || t < firstTime) firstTime = t;
            if (lastTime === null || t > lastTime) lastTime = t;
        }
        if (o.type === 'turn/start') {
            cur = { turn: (o.data && o.data.turn) || turns.length + 1, start: t, cost: 0, miss: 0, hit: 0, out: 0, steps: 0 };
            turns.push(cur);
            continue;
        }
        if (o.type === 'assistant/message') {
            const u = o.data && o.data.usage;
            if (!u || !cur) continue;
            const model = (o.data && o.data.source && o.data.source.model) || 'deepseek-flash';
            cur.cost += costCny(u, model, t || Date.now());
            cur.miss += u.inputTokens || 0;
            cur.hit += u.cacheReadTokens || 0;
            cur.out += u.outputTokens || 0;
            cur.steps++;
        }
    }
    const total = turns.reduce((s, x) => s + x.cost, 0);
    const sum = (k) => turns.reduce((s, x) => s + x[k], 0);
    return { turns, total, miss: sum('miss'), hit: sum('hit'), out: sum('out'), steps: sum('steps'), firstTime, lastTime };
}

function fmtTok(n) {
    if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿';
    if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
    return String(n);
}
function fmtY(n) { return '¥' + n.toFixed(n < 1 ? 3 : 2); }
function fmtTime(ms) {
    if (!ms) return '—';
    const d = new Date(ms);
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------- 主流程 ----------
const args = process.argv.slice(2);
const allMode = args.includes('--all');
const turnsIdx = args.indexOf('--turns');
const lastN = turnsIdx >= 0 ? parseInt(args[turnsIdx + 1], 10) || 0 : 0;

if (!existsSync(SESSIONS_ROOT)) {
    console.log('没找到会话目录：' + SESSIONS_ROOT);
    process.exit(1);
}

if (allMode) {
    console.log('所有工作区的对话（按最近修改排序）：\n');
    for (const ws of readdirSync(SESSIONS_ROOT)) {
        const dir = join(SESSIONS_ROOT, ws);
        let sessions;
        try { sessions = listSessions(dir); } catch { continue; }
        if (!sessions.length) continue;
        // 解码后再截断（否则会把 ~XXXX 转义切一半，显示成乱码）
        const full = decodeWsName(ws);
        const label = full.length > 46 ? '…' + full.slice(-45) : full;
        for (const s of sessions) {
            const a = analyze(s.file);
            console.log(`  ${fmtTime(s.mtime)}  ${fmtY(a.total).padStart(9)}  ${String(a.turns.length).padStart(3)}轮  ${label}`);
        }
    }
    process.exit(0);
}

const dir = workspaceDir(process.cwd());
if (!dir) { console.log('没找到本工作区的会话目录'); process.exit(1); }
const sessions = listSessions(dir);
if (!sessions.length) { console.log('本工作区还没有会话记录'); process.exit(1); }

const target = sessions[0];
const a = analyze(target.file);

console.log('对话花费统计');
console.log('─'.repeat(58));
console.log('工作区   : ' + process.cwd());
console.log('会话     : ' + target.id);
console.log('时间     : ' + fmtTime(a.firstTime) + '  →  ' + fmtTime(a.lastTime));
console.log('轮数     : ' + a.turns.length + ' 轮 / ' + a.steps + ' 步');
console.log('─'.repeat(58));
console.log(`未命中输入 ${fmtTok(a.miss).padStart(8)}  命中输入 ${fmtTok(a.hit).padStart(8)}  输出 ${fmtTok(a.out).padStart(8)}`);
console.log('─'.repeat(58));

const show = lastN > 0 ? a.turns.slice(-lastN) : a.turns;
if (lastN > 0 && a.turns.length > lastN) console.log(`（只显示最近 ${lastN} 轮，共 ${a.turns.length} 轮）`);
console.log('轮次   花费        未命中输入   命中输入    输出    步数');
for (const t of show) {
    console.log(
        String(t.turn).padStart(4) + '   ' +
        fmtY(t.cost).padStart(8) + '   ' +
        fmtTok(t.miss).padStart(9) + '   ' +
        fmtTok(t.hit).padStart(8) + '   ' +
        fmtTok(t.out).padStart(7) + '   ' +
        String(t.steps).padStart(4)
    );
}
console.log('─'.repeat(58));
console.log('本对话合计：' + fmtY(a.total) + `   （约 $${(a.total / FX).toFixed(4)}）`);
if (a.turns.length) {
    const avg = a.total / a.turns.length;
    console.log('平均每轮  ：' + fmtY(avg));
    console.log('最贵一轮  ：' + fmtY(Math.max(...a.turns.map((t) => t.cost))));
}
