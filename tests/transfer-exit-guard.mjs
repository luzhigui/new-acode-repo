#!/usr/bin/env node
// tests/transfer-exit-guard.mjs | V1.0.0 | 2026-11-09
// 「转交队列出口守门」：把「只进不出」从一句抱怨变成有收缩机制、可点名、不许洗红的队列。
//
// 由头（2026-11-09 高视角盘点实测）：tests/known-transfers.md 有 170 条表格行、
//   31 条已划掉、**139 条待销项，带销项条件标记的 0 条**；而 rules-replay 对转交规则
//   不计退出码 ⇒ 登记即长期免检。文档头写着「落地后立即划掉、不会烂尾」，靠的是自觉。
//
// ★ 取舍（与 layer-direction-scan / entry-path-guard 同一套）：
//   ① 存量 139 条冻结进 transfer-exit-baseline.json，**逐条不判红** —— 一次性要求全部补
//      销项条件会刷出 139 条噪声，且多半要改措辞，属于把队列洗成另一副样子而不是给出口；
//   ② 新增待销项只**点名**（提示补 EXIT 条件），不判红 —— 推广期不拦别人正常登记；
//   ③ 真正咬的是三种确定性缺陷：抽取器失位 / 基线被删改坏 / 借 --update-baseline 把
//      队列偷偷洗长（基线只降不抬，防「非调节阀」红线被绕）。
//
// EXIT 条件标记（可选、推荐）：在表格行内或紧邻下一行写
//   <!-- EXIT: 主代码哪笔改动落地后可销项 -->
//   内容去空白后须 ≥ 8 字；写了空标记属于「假装写了条件」，判红。
//
// 用法：
//   node tests/transfer-exit-guard.mjs                       报告 + 硬判据
//   node tests/transfer-exit-guard.mjs --update-baseline    还清旧账后收缩基线（只许变短）
//   node tests/transfer-exit-guard.mjs --src=<path>         指定文档副本（自证/夜间基底）
//   node tests/transfer-exit-guard.mjs --selftest            只跑纯内存自证
//
// 退码：1 = 队列守门自身失守（抽取器/基线/标记/收缩口径），属体检域确定性缺陷。
//   挂 run-all 的 OBSERVES（不改 CHECKS 分母、不改退码口径）。
//
// 本件与主代码的关系：只读 tests/ 下文档与基线，不改任何主代码文件。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VER = 'tests/transfer-exit-guard.mjs V1.0.0';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DOC = 'tests/known-transfers.md';
const BASELINE = 'tests/transfer-exit-baseline.json';

const EXIT_RE = /<!--\s*EXIT:\s*([^>]*?)-->/;
const MIN_EXIT_LEN = 8;

/** 规范化 key：去掉 Markdown 强调/删除线/空白与常见标点，截断到 80 字，防改空格就换身份。 */
export function normalizeKey(s) {
    return String(s || '')
        .replace(/[~*`_#[\]()（）【】]/g, '')
        .replace(/[\s，,。.；;：:、/\\|"'“”‘’\-—]/g, '')
        .slice(0, 80);
}

/**
 * 条目 key 的唯一构造处（守门与自证共用，防两边各算一套）。
 * ★ 只用标题会撞车：实测 138 条待销项按标题归一化后只剩 74 个不同 key ——
 *   同一根因被反复登记，光看标题会让「新增」检测漏掉一半。故拼上根因片段。
 */
export function entryKey(first, root) {
    return normalizeKey(first).slice(0, 60) + '|' + normalizeKey(String(root || '').slice(0, 60)).slice(0, 30);
}

/**
 * 解析转交文档。只认真表格数据行（第一列非空、非表头、非分隔行）。
 * @returns {{rows:number, closed:number, open:{key:string,line:number,hasExit:boolean}[], invalidExit:{line:number,why:string}[]}}
 */
export function parseTransfers(md) {
    const lines = String(md || '').split(/\r?\n/);
    const res = { rows: 0, closed: 0, open: [], invalidExit: [] };
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!/^\s*\|/.test(line)) continue;
        if (/^\s*\|[\s|:-]+\|?\s*$/.test(line)) continue;      // |---|---|
        const cells = line.split('|').map(x => x.trim());
        const first = cells[1] || '';
        if (!first || /规则\/检查项|根因|转交块位置|^项$/.test(first)) continue;
        res.rows++;
        if (/~~/.test(first) && /已闭环|登记撤销|销项|已落地/.test(line)) { res.closed++; continue; }

        // EXIT 标记：本行或紧邻下一行。内容太短 = 假装写了条件。
        const near = line + '\n' + (lines[i + 1] || '');
        const hit = EXIT_RE.exec(near);
        let hasExit = false;
        if (hit) {
            const text = (hit[1] || '').trim();
            if (text.length >= MIN_EXIT_LEN) hasExit = true;
            else res.invalidExit.push({ line: i + 1, why: 'EXIT 标记内容仅 ' + text.length + ' 字（须 ≥ ' + MIN_EXIT_LEN + '），等于没写销项条件' });
        }
        res.open.push({ key: entryKey(first, cells[2]), line: i + 1, hasExit });
    }
    return res;
}

/**
 * 审计（纯逻辑，文档与基线都注入，便于不碰磁盘做自证）。
 * @param {string} md 文档文本
 * @param {{keys?:string[]}|null} baseline 基线对象
 * @param {{updateBaseline?:boolean}} opts
 */
export function audit(md, baseline, opts = {}) {
    const fails = [], warns = [];
    const p = parseTransfers(md);
    const keys = [...new Set(p.open.map(x => x.key))];

    if (p.rows === 0) fails.push('一条表格数据行都没抠出来 ⇒ 抽取器失位（或文档结构被改），不许把「没查」当「没问题」');
    if (!baseline || !Array.isArray(baseline.keys) || baseline.keys.length === 0) {
        fails.push('转交队列基线缺失/为空 ⇒ 收缩口径无从比较，请先生成 ' + BASELINE);
    }
    for (const x of p.invalidExit) fails.push('L' + x.line + ' ' + x.why);

    const baseKeys = new Set((baseline && Array.isArray(baseline.keys)) ? baseline.keys : []);
    const added = keys.filter(k => !baseKeys.has(k));
    const shrinkable = [...baseKeys].filter(k => !keys.includes(k));

    if (opts.updateBaseline) {
        // ★ 基线只降不抬：借「更新」把新条目塞进基线 = 把队列洗成合规，方向反了。
        if (keys.length > baseKeys.size) {
            fails.push('--update-baseline 拒绝：待销项 ' + keys.length + ' 条 > 基线 ' + baseKeys.size
                + ' 条（只许收缩）。请先销掉旧账，或给新增条目补 EXIT 条件后单独拍板');
        }
        for (const k of added) {
            if (!p.open.some(x => x.key === k && x.hasExit)) {
                fails.push('--update-baseline 拒绝：新增待销项「' + k.slice(0, 30) + '」没有 EXIT 条件');
            }
        }
    } else {
        if (added.length) warns.push('新增待销项 ' + added.length + ' 条（建议补 <!-- EXIT: ... --> 销项条件）：'
            + added.slice(0, 5).map(k => k.slice(0, 24)).join('、') + (added.length > 5 ? ' …' : ''));
    }
    if (shrinkable.length) warns.push('可收缩基线 ' + shrinkable.length + ' 条（已有条目被销项，可跑 --update-baseline）');

    return {
        fails, warns, keys,
        stats: {
            rows: p.rows, closed: p.closed, open: p.open.length,
            withExit: p.open.filter(x => x.hasExit).length,
            baseline: baseKeys.size, added: added.length, shrinkable: shrinkable.length
        }
    };
}

// ---------------------------------------------------------------------------
// 自证：负路径必须真咬。全部纯内存注入，不读磁盘、不写文件。
// ---------------------------------------------------------------------------
export function selfCheck() {
    const fails = [];
    const DOC_OK = [
        '# 转交清单',
        '| 规则/检查项 | 根因 | 转交块位置 |',
        '|---|---|---|',
        '| 甲缺陷 | 根因甲 | 日志第 1 轮 |',
        '| ~~乙缺陷~~ **【已闭环 第 2 轮】** | 已修 | 日志第 2 轮 |'
    ].join('\n');
    const base = { keys: [entryKey('甲缺陷', '根因甲')] };
    const good = audit(DOC_OK, base);
    if (good.fails.length) fails.push('正路径：干净样本本应全绿，实得 ' + good.fails.join(' / '));
    if (good.stats.open !== 1 || good.stats.closed !== 1) fails.push('正路径：已销项条目不该计入待销项（open=' + good.stats.open + ' closed=' + good.stats.closed + '）');

    // 负路径 A：抽取器失位
    if (!audit('（什么都没有）', base).fails.some(x => x.includes('抽取器失位'))) fails.push('负路径 A：空文档竟没报抽取器失位 ⇒ 假绿');
    // 负路径 B：基线缺失
    if (!audit(DOC_OK, null).fails.some(x => x.includes('基线缺失'))) fails.push('负路径 B：基线缺失竟没报 ⇒ 假绿');
    // 负路径 C：写了空 EXIT 标记 = 假装写了条件
    const emptyExit = DOC_OK.replace('| 甲缺陷 | 根因甲 | 日志第 1 轮 |', '| 甲缺陷 | 根因甲 | 日志第 1 轮 | <!-- EXIT:   -->');
    if (!audit(emptyExit, base).fails.some(x => x.includes('EXIT 标记内容'))) fails.push('负路径 C：空 EXIT 标记竟没报 ⇒ 假绿');
    // 负路径 D：借更新把队列洗长（基线只降不抬）
    const growth = DOC_OK + '\n| 丙缺陷 | 根因丙 | 日志第 3 轮 |';
    if (!audit(growth, base, { updateBaseline: true }).fails.some(x => x.includes('只许收缩'))) fails.push('负路径 D：更新时队列变长竟没被拒 ⇒ 基线可被当调节阀');
    // 负路径 E：新增缺 EXIT 只点名、不判红（推广期不制造噪声，本条防有人把 warn 偷改成 fail）
    const addedNoExit = audit(growth, base);
    if (addedNoExit.fails.length || !addedNoExit.warns.some(x => x.includes('新增待销项'))) {
        fails.push('负路径 E：新增条目要么被误判红、要么没被点名 ⇒ 显形口径坏了');
    }
    // 负路径 F：合规 EXIT 标记要被认出来（withExit 计数不许恒 0）
    const withMark = DOC_OK.replace('| 甲缺陷 | 根因甲 | 日志第 1 轮 |', '| 甲缺陷 | 根因甲 | 日志第 1 轮 | <!-- EXIT: core/209 落地后可销项 -->');
    const rF = audit(withMark, base);
    if (rF.stats.withExit !== 1 || rF.fails.length) fails.push('负路径 F：合规 EXIT 标记没被认出（withExit=' + rF.stats.withExit + '） ⇒ 出口机制形同虚设');
    return fails;
}

function main() {
    const argv = process.argv.slice(2);
    const srcArg = argv.find(a => a.startsWith('--src='));
    const update = argv.includes('--update-baseline');
    const selftestOnly = argv.includes('--selftest');

    console.log('=== 转交队列出口守门 ' + VER + ' ===');
    const sFails = selfCheck();
    if (sFails.length) {
        console.log('⛔ 本件自证失败 ' + sFails.length + ' 处（自身判据先坏了）：');
        for (const x of sFails) console.log('  · ' + x);
        return 1;
    }
    console.log('· 自证：正路径全绿 + 6 条负路径（抽取器失位/基线缺失/空标记/更新洗长/新增显形/合规标记）全部咬住');
    if (selftestOnly) { console.log('RESULT: PASS（--selftest 只跑自证）'); return 0; }

    const docPath = srcArg ? path.resolve(ROOT, srcArg.slice('--src='.length)) : path.join(ROOT, DOC);
    if (srcArg) console.log('· 指定文档：' + docPath);
    if (!fs.existsSync(docPath)) { console.log('⛔ ' + DOC + ' 不在盘 ⇒ 队列取证空转'); return 1; }
    const md = fs.readFileSync(docPath, 'utf8');

    const basePath = path.join(ROOT, BASELINE);
    let baseline = null;
    if (fs.existsSync(basePath)) {
        try { baseline = JSON.parse(fs.readFileSync(basePath, 'utf8')); }
        catch (e) { console.log('⛔ 基线 JSON 解析失败：' + e.message); return 1; }
    }
    const r = audit(md, baseline, { updateBaseline: update });

    const s = r.stats;
    console.log('· 队列：表格行 ' + s.rows + ' 条 / 已销项 ' + s.closed + ' 条 / 待销项 ' + s.open
        + ' 条（带销项条件 ' + s.withExit + ' 条）· 基线 ' + s.baseline + ' 条');
    for (const w of r.warns) console.log('  ℹ ' + w);
    for (const f of r.fails) console.log('  ❌ ' + f);

    if (update && !r.fails.length) {
        const next = {
            '$comment': '转交队列存量基线：只登记生成时已存在的待销项，规范化 key 冻结上限。新增由 transfer-exit-guard 点名；还清旧账后跑 --update-baseline 收缩（只降不抬）。',
            version: VER,
            generatedAt: new Date().toISOString().slice(0, 10),
            count: r.keys.length,
            keys: r.keys
        };
        fs.writeFileSync(basePath, JSON.stringify(next, null, 2) + '\n', 'utf8');
        console.log('· 基线已收缩：' + s.baseline + ' → ' + next.count + ' 条');
    }

    console.log(r.fails.length ? ('RESULT: FAIL（' + r.fails.length + ' 处失守）') : 'RESULT: PASS（队列守门未失守）');
    return r.fails.length ? 1 : 0;
}

if (process.argv[1] && /transfer-exit-guard\.mjs$/.test(process.argv[1])) process.exit(main());
