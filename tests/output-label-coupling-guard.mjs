// tests/output-label-coupling-guard.mjs | V2.0.0 | 2026-11-01 夜间第 168 轮
//
// ★ 立它的由头（第 166 轮留的备忘，第 167 轮动手时才发现它不是小事）：
//   第 166 轮记下一条「只补标签不改判据」的备忘：账本对照（tests/stat-decl-vs-actual-check.mjs
//   L2198）逐契约打印的那一行里，列名写的是「命中」，但它装的其实是 s.dup（**重复应用**数），
//   建议下轮改成「重复应用 N」。
//   ★ 真去改的时候才发现：这一行不是「给人看的文案」，它是**一条机械契约** —— 仓库里有两个
//   脚本各自写死了一条正则去解析这一行的列：
//     · tests/mutation-teeth.mjs L1124  `^([A-Z][A-Z_0-9]*)\s+声明\s+\d+\s+条\s+·\s+命中\s+(\d+)`
//       → 解析出的 statByContract 决定「哪条契约在变异树上兜住了」，是牙口矩阵「有牙/装饰品」
//         判定的输入之一；
//     · tests/contract-guard-selftest.mjs L103（同一行的全字段版）
//       → 解析出的 hit 列决定「干净树上哪条契约算脏」，脏契约的命中**不计入有牙**，
//         还会开红（② 干净树上有 N 条契约命中>0）。
//   ⇒ 只改生产者、漏改一个消费者，那一个就会**静默解析出 0 行**：
//     不是报错、不是变红，是**悄悄变成没看见** —— mutation-teeth 会少算归属、
//     contract-guard 会因「0 条 = 没问题」而把脏契约放过（正是牙 G 那款「0 条 ≠ 没问题」的病）。
//
// ★ 这不是假设，这仓库已经栽过两次：
//     · mutation-teeth L1113 自己记着：旧正则 `重复应用命中\s+(\d+)` 与实际文案不匹配
//       ⇒ 严格命中的契约（A20/A21/A22）被错算成 0、误判成「仅基线兜底」；
//     · 第 162 轮：上游把数据迁出 content/200，无一消费方补钥匙 ⇒ 16 项体检以同一个 Error 崩掉。
//   ⇒ 同一款病：**一边改了，另一边没接上，而没人负责喊**。
//
// ★ V2.0.0 扩口径（承接第 167 轮【新·请拍板·★】「别再靠人记哪两边是配对的」）：
//   第 167 轮只钉了账本对照这一条线。本轮把它泛化成**认领表 + 普查**：
//     · 线一（沿用）：账本对照契约汇总行的**列名** ⇄ 两个写死正则的消费者；
//     · 线二（新增）：**结论行挑选口径** pickKeyLine —— run-all.mjs 与 orphan-selftest-sweep.mjs
//       各存一份逐字相同的实现，orphan 那份的注释白纸黑字写着「口径照抄 run-all 的 pickKeyLine，
//       两处保持一致」。★ 这就是「配对靠人记」的活样本：哪天有人给 run-all 的结论关键词表加一个
//       词而没同步，孤儿自检展示的结论行口径就静默漂移 —— 与本件线一同款，只是它不解析数字，
//       它解析的是「哪一行算结论」。
//     · 段零（新增）：**未认领耦合普查** —— 机械扫出 tests/ 里跨文件逐字相同的中文正则，
//       凡不在认领表里的逐条点名（观察，不开红）⇒ 下一条线不用等人想起来，机器会先列出来。
//
// ★ 本件做什么（四段 + 普查，挂 OBSERVES 不改分母）：
//   段零 普查：扫全部 .mjs 的正则字面量，挑**含中文且跨文件逐字相同**的，扣掉认领表已覆盖的，
//        剩下的逐条点名（规模上限只截断打印，不截断判定）；一条都扫不到须报扫描器空转。
//   段一 线一：机械抽取生产者的列名模板，与**扫出来的全部消费者正则**逐个对账：
//        ① 真样本行（按生产者当前列名拼的）每个消费者正则都须匹配得上；
//        ② 反向：换了列名的样本行每个消费者正则都须**匹配不上**（正则过宽 ⇒ 它根本没在核列名）；
//        ③ 合成样本行（如 contract-guard 的 synthLine）列名也须与生产者一致（防自检样本过期）；
//        ④ 规模棘轮：消费者不得少于下限（少一个即报，不许「少一个也照跑」）。
//   段二 线二：机械抽取每份 pickKeyLine 实现的三要素（结论关键词正则 / 取行策略 / 截断长度），
//        逐份与基准逐字比对；实现份数不得少于下限（少一份即报：比对面没了，不许「合并了就省事」）。
//   段三 真跑对账：真跑一次账本对照，用「按生产者列名现造的正则」解析，断言：
//        ① 解析行数 ≥ 下限（防「两边都归零于是相等」的假绿）；
//        ② 逐行 dup 求和 == 汇总行「检出重复应用 N 处」的 N（无汇总行则求和须为 0）
//           ⇒ 这一条把「解析漏行」与「真没有」区分开；
//        ③ 每个消费者解析到的行数 == 生产者侧真值行数。
//   段四 自证（牙），全部在合成源码上跑同一套函数，证明本件不是恒红也不是恒绿。
//
// 用法：node tests/output-label-coupling-guard.mjs
//   RESULT: PASS = 已认领的两条耦合线两边同步、未认领的已点名｜FAIL = 有消费者会静默归零
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stripComments, selfCheck as truthSelfCheck } from './_lib/static-truth-slice.mjs';

export const VER = 'tests/output-label-coupling-guard.mjs V2.0.0';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const F_PRODUCER = 'tests/stat-decl-vs-actual-check.mjs';
const SELF = 'tests/output-label-coupling-guard.mjs';

// 已知消费者下限（mutation-teeth + contract-guard-selftest）。少了即报：不是少了就没事，
// 是少掉的那一件的结论从此没人兜（第 147 轮「孤儿普查」同一口气）。
const MIN_CONSUMERS = 2;
// 段三解析行数下限：账本对照当前 101 条契约，取 50 作闸门（防双方同时归零却"相等"）
const MIN_ROWS = 50;
// 段二：pickKeyLine 重复实现份数下限（当前 run-all + orphan-selftest-sweep）
const MIN_PICK_IMPL = 2;
// 段二：CRASH_RE 重复实现份数下限（当前 contract-binding-drift-selftest + contract-guard-selftest）
const MIN_CRASH_IMPL = 2;
// 段零：跨文件同文正则的最小长度（太短的通用正则不含信息，会刷屏）
const MIN_SHARED_LEN = 24;
// 段零：tests/ 下 .mjs 规模闸门（读得太少 ⇒ 普查面不完整，扫出的「没有耦合」不可采信）
const MIN_TESTS_FILES = 20;
// 段零：点名清单打印上限（只截断打印，不截断内部判定）
const MAX_CENSUS_PRINT = 20;

// 列名抽取：形如 `... 条 · 命中 ${s.dup} ·` 或 `条 · 命中 8 ·`
//   ${s.dup} 也要认 —— 生产者那行是模板字面量，列名后面跟的是插值不是数字。
const RE_LABEL = /条\s+·\s+(\S+)\s+(?:\d+|\$\{s\.dup\})/;

// 正则字面量粗扫（够用即可：只挑含「声明 + 条 + ·」的那些，即契约行解析器）
const RE_LITERAL = /\/(?:\\.|\[(?:\\.|[^\]\n])*\]|[^/\\\n])+\/([gimsuy]*)/g;

function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 把一个正则字面量（含首尾斜杠与 flags）还原成 body（与 pickParsers / 段零同一口径）
function literalBody(lit) {
    const m = new RegExp(RE_LITERAL.source, 'g').exec(String(lit));
    if (!m) return null;
    return m[0].slice(1, m[0].length - 1 - (m[1] || '').length);
}

// ---------- 生产者侧：机械抽取列名 ----------
function extractProducer(src) {
    for (const ln of String(src).split('\n')) {
        // 只认真正打印契约行的那一行：同时带「声明」「歧义跳过」「${s.dup}」
        if (ln.indexOf('声明') < 0) continue;
        if (ln.indexOf('歧义跳过') < 0) continue;
        if (ln.indexOf('${s.dup}') < 0) continue;
        const m = ln.match(RE_LABEL);
        if (m) return { label: m[1], line: ln };
    }
    return null;
}

// ★ 只按行剔「整行注释」，不动行内代码：公共件的 stripComments 会把注释正文留在原处
//   （实测 `//   行形如 \`BREAK_DEF 声明 610 条 · 命中 0 …\`` 被整段保留），
//   若照单全收，这类旧注释会被当成"又一个解析器" —— 扫描器自己以偏概全（第 166 轮牙 J 那款病）。
function stripCommentLines(src) {
    return String(src).split('\n').filter(l => {
        const t = l.trim();
        return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
    }).join('\n');
}

// ---------- 消费者侧：扫正则字面量与合成样本行 ----------
function pickParsers(src) {
    const out = [];
    const re = new RegExp(RE_LITERAL.source, 'g');
    let m;
    while ((m = re.exec(String(src)))) {
        const body = m[0].slice(1, m[0].length - 1 - (m[1] || '').length);
        if (body.indexOf('声明') < 0) continue;
        if (body.indexOf('条') < 0) continue;
        if (body.indexOf('·') < 0) continue;
        // ★ 必须是真正则（含 \s / \d 这类元字符）：否则注释正文里那句
        //   「行形如 BREAK_DEF 声明 610 条 · 命中 0 …」也会被当成一条解析器。
        if (!/\\[sd]\+?/.test(body)) continue;
        out.push({ body, flags: m[1] || '', index: m.index });
    }
    return out;
}

function pickSynthSamples(src) {
    const out = [];
    const re = /`([^`\n]*)`|'([^'\n]*)'|"([^"\n]*)"/g;
    let m;
    while ((m = re.exec(String(src)))) {
        const s = m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]);
        if (s.indexOf('声明') < 0) continue;
        if (s.indexOf('条') < 0) continue;
        if (s.indexOf('偏差') < 0) continue;
        out.push(s);
    }
    return out;
}

function sampleLine(label, id, dup) {
    return String(id) + '  声明  185 条 · ' + label + ' ' + dup + ' · 歧义跳过 0 · 严格比对  185 条 / 偏差 0';
}

// 按生产者当前列名现造一条全字段正则（段三用它当"真值解析器"）
function truthRegex(label) {
    return new RegExp('^([A-Z][A-Z_0-9]*)\\s+声明\\s+(\\d+)\\s+条\\s+·\\s+' + escapeRe(label)
        + '\\s+(\\d+)\\s+·\\s+歧义跳过\\s+(\\d+)\\s+·\\s+严格比对\\s+(\\d+)\\s+条\\s*/\\s*偏差\\s+(\\d+)');
}

// ---------- 段一：线一 静态耦合对账（纯函数，真跑与自证共用） ----------
function verifyCoupling(proSrc, consumers) {
    const f = [];
    const prod = extractProducer(proSrc);
    if (!prod) {
        f.push('生产者（' + F_PRODUCER + '）里找不到契约汇总行模板（含「声明 / 歧义跳过 / ${s.dup}」的那行）'
            + ' ⇒ 无从对账，不许拿「没找到 = 没问题」当结论');
        return { fails: f, prod: null, nParsers: 0 };
    }
    const sample = sampleLine(prod.label, 'LEECH_MAXHP', 8);
    // 反向样本：换一个列名（用「命中 / 重复应用」互为反向，二者都是这个仓里真出现过的写法）
    const other = prod.label === '命中' ? '重复应用' : '命中';
    const wrong = sampleLine(other, 'LEECH_MAXHP', 8);
    let nParsers = 0;
    const files = [];
    for (const c of consumers) {
        let has = false;
        for (const rx of pickParsers(c.src)) {
            has = true;
            nParsers++;
            let re = null;
            try { re = new RegExp(rx.body, rx.flags); } catch {
                f.push(c.file + ' 有一条无法编译的契约行正则 ⇒ 解析器已腐坏');
                continue;
            }
            const okTrue = re.test(sample);
            const okWrong = re.test(wrong);
            if (!okTrue) {
                f.push(c.file + ' 的契约行正则匹配不上生产者当前样本行（列名「' + prod.label + '」）'
                    + ' ⇒ 该消费者会**静默解析出 0 行**，不是报错、是没看见');
            } else if (okWrong) {
                // ★ 只在「真样本也匹配」时才判过宽：若真样本都匹配不上，那是失配（上面已报），
                //   再叠一条"过宽"只会让人以为正则太松，实则是它认的是旧列名。
                f.push(c.file + ' 的契约行正则过宽：列名写成「' + other + '」的样本行也匹配'
                    + ' ⇒ 它根本没在核列名，对账形同虚设');
            }
        }
        if (has) files.push(c.file);
        for (const s of pickSynthSamples(c.src)) {
            const m = s.match(RE_LABEL);
            if (m && m[1] !== prod.label) {
                f.push(c.file + ' 的合成契约行样本列名是「' + m[1] + '」，与生产者「' + prod.label
                    + '」不一致 ⇒ 自检样本已过期（它自己会假绿/假红）');
            }
        }
    }
    if (files.length < MIN_CONSUMERS) {
        f.push('消费者只剩 ' + files.length + ' 个（下限 ' + MIN_CONSUMERS + '）'
            + ' ⇒ 有解析器被删/改写后扫不到了，或有新消费者还没被本件认领；两边都要人工确认');
    }
    return { fails: f, prod, nParsers, files, sample, wrong };
}

// ---------- 段二：线二 结论行挑选口径（pickKeyLine 的重复实现） ----------
// ★ 为什么钉这一条：orphan-selftest-sweep.mjs L74 的注释自己写着「口径照抄 run-all 的 pickKeyLine，
//   两处保持一致」—— 「两处保持一致」这句话目前**只有人话在守**，没有机器在守。
const RE_PICK_DECL = /function\s+pickKeyLine\s*\([^)]*\)\s*\{/;

function extractPickBody(src) {
    const m = RE_PICK_DECL.exec(String(src));
    if (!m) return null;
    const rest = String(src).slice(m.index);
    const end = rest.search(/^\}/m);
    return end < 0 ? rest : rest.slice(0, end + 1);
}

// 三要素：结论关键词正则 / 取行策略 / 截断长度。
//   ★ 只比三要素而非整段函数体：两份实现的形参写法（(s) => 与 s =>）不同，
//     整段比对会把无害差异报成失配 —— 那是「扫描器自己以偏概全」（第 166 轮牙 J）的复现路径。
function pickFacets(body) {
    const b = stripComments(String(body));
    let kw = null;
    const re = new RegExp(RE_LITERAL.source, 'g');
    let m;
    while ((m = re.exec(b))) {
        if (m[0].indexOf('RESULT') >= 0) { kw = m[0]; break; }
    }
    const pick = b.match(/hit\[([^\]]*)\]/);
    const slice = b.match(/\.slice\(\s*(\d+)/);
    return {
        kw: kw,
        pick: pick ? String(pick[1]).replace(/\s/g, '') : null,
        slice: slice ? Number(slice[1]) : null
    };
}

// ---- 线三：崩溃判定口径（CRASH_RE + synthCrash 的重复实现） ----
// ★ 这条不是人想出来的，是段零普查自己扫出来的：contract-binding-drift-selftest.mjs L151 与
//   contract-guard-selftest.mjs L135 各存一份逐字相同的 CRASH_RE，连合成样本 synthCrash 都
//   逐字相同（L333 / L271）。它判定的是「子进程到底算不算崩了」—— 比线二更危险：
//   线二分叉只是展示的行不同，这条分叉是**一边判崩（红）、一边判没崩（绿）**。
const RE_CRASH_DECL = /const\s+CRASH_RE\s*=/;

function crashFacets(src) {
    const b = stripComments(String(src));
    // 两个锚点（正则与合成样本）跨行，故从整份源码取，与线二取函数体不同
    const rm = /const\s+CRASH_RE\s*=\s*(\/(?:\\.|\[(?:\\.|[^\]\n])*\]|[^/\\\n])+\/[gimsuy]*)/.exec(b);
    const sm = /const\s+synthCrash\s*=\s*(['"`])([\s\S]*?)\1/.exec(b);
    return { kw: rm ? rm[1] : null, synth: sm ? sm[2] : null };
}

// 自洽：合成样本必须被自己的正则咬住，否则那条「我能识别崩溃」的自检是空转的假绿
function crashSelfConsistent(fc) {
    if (!fc.kw || !fc.synth) return null;
    const body = literalBody(fc.kw);
    if (!body) return 'CRASH_RE 解析不出来 ⇒ 无从判定';
    try {
        if (!new RegExp(body).test(fc.synth)) {
            return 'synthCrash 合成样本不被自己的 CRASH_RE 匹配 ⇒ 那条「能识别崩溃」的自检是空转的假绿';
        }
    } catch {
        return 'CRASH_RE 无法编译 ⇒ 崩溃判定已腐坏';
    }
    return null;
}

// ---- 认领表里的两条「重复实现族」：同一份口径在 tests/ 里落了两遍，靠人记不如靠机器比 ----
const FAM_PICK = {
    id: '线二 结论行挑选口径',
    min: MIN_PICK_IMPL,
    exists: (src) => RE_PICK_DECL.test(String(src)),
    block: extractPickBody,
    facets: pickFacets,
    labels: { kw: '结论关键词正则', pick: '取行策略', slice: '截断起点' },
    why: '两边挑的「哪一行算结论」已经分叉，孤儿自检与一键体检展示的不是同一口径',
    selfConsistent: null
};
const FAM_CRASH = {
    id: '线三 崩溃判定口径',
    min: MIN_CRASH_IMPL,
    exists: (src) => RE_CRASH_DECL.test(String(src)),
    block: (src) => String(src),
    facets: crashFacets,
    labels: { kw: 'CRASH_RE 正则', synth: 'synthCrash 合成样本' },
    why: '两边判的「什么算崩了」已经分叉：同一份子进程输出会一边判红、一边判绿',
    selfConsistent: crashSelfConsistent
};
const FAMILIES = [FAM_PICK, FAM_CRASH];

function verifyFamily(files, fam) {
    const f = [];
    const impls = [];
    for (const c of files) {
        if (!fam.exists(c.src)) continue;
        impls.push({ file: c.file, facets: fam.facets(fam.block(c.src)) });
    }
    if (impls.length === 0) {
        f.push('tests/ 里找不到任何 ' + fam.id + ' 的实现 ⇒ 该口径整体消失，'
            + ' 本件的比对面也没了，不许拿「找不到 = 不用管」当结论');
        return { fails: f, impls };
    }
    if (impls.length < fam.min) {
        f.push(fam.id + ' 只剩 ' + impls.length + ' 份实现（下限 ' + fam.min + '）'
            + ' ⇒ 要么重复实现已合并（本件的比对面消失，须更新认领表），要么有一份被删；'
            + ' 两种都要人工确认，不许静默放行');
    }
    const base = impls[0];
    for (const im of impls.slice(1)) {
        for (const k of Object.keys(base.facets)) {
            if (im.facets[k] !== base.facets[k]) {
                f.push(im.file + ' 的【' + (fam.labels[k] || k) + '】与 ' + base.file + ' 不一致（'
                    + String(im.facets[k]) + ' vs ' + String(base.facets[k]) + '）⇒ ' + fam.why);
            }
        }
    }
    if (fam.selfConsistent) {
        for (const im of impls) {
            const x = fam.selfConsistent(im.facets);
            if (x) f.push(im.file + ' ' + x);
        }
    }
    return { fails: f, impls, base };
}

function verifyPickKeyLine(files) {
    return verifyFamily(files, FAM_PICK);
}

// ---------- 段零：未认领耦合普查（纯函数） ----------
// ★ 目的：把「哪两边是配对的」从人记改成机器列。扫 tests/ 里跨文件逐字相同的**中文**正则，
//   扣掉认领表已覆盖的，其余逐条点名。含中文是刻意的：本仓的耦合几乎都发生在「面向文案的行」
//   上（第 167 轮线一、本轮线二都是），纯 ASCII 的通用正则不含信息、只会刷屏。
function censusSharedRegexes(files, claimed) {
    const map = new Map();
    for (const c of files) {
        const src = stripCommentLines(c.src);
        const re = new RegExp(RE_LITERAL.source, 'g');
        let m;
        while ((m = re.exec(src))) {
            const body = m[0].slice(1, m[0].length - 1 - (m[1] || '').length);
            if (body.length < MIN_SHARED_LEN) continue;
            if (!/[一-鿿]/.test(body)) continue;
            if (claimed.has(body)) continue;
            if (!map.has(body)) map.set(body, new Set());
            map.get(body).add(c.file);
        }
    }
    const rows = [];
    for (const [body, set] of map) {
        if (set.size >= 2) rows.push({ body, files: Array.from(set).sort() });
    }
    rows.sort((a, b) => (b.files.length - a.files.length) || (b.body.length - a.body.length));
    return rows;
}

// ---------- 段三：真跑对账（纯函数：给定输出文本 + 列名 + 消费者列表） ----------
function crossCheck(out, prod, consumers) {
    const f = [];
    const re = truthRegex(prod.label);
    const rows = [];
    for (const ln of String(out).split('\n')) {
        const m = ln.match(re);
        if (m) rows.push({ id: m[1], decl: +m[2], dup: +m[3], skip: +m[4], strict: +m[5], mismatch: +m[6] });
    }
    if (rows.length < MIN_ROWS) {
        f.push('按生产者列名「' + prod.label + '」只解析出 ' + rows.length + ' 行契约（下限 ' + MIN_ROWS
            + '）⇒ 生产者的行格式变了或本件真值解析器腐烂，不许据此下任何结论');
    }
    const sum = rows.reduce((n, r) => n + r.dup, 0);
    const sm = String(out).match(/检出重复应用\s+(\d+)\s+处/);
    if (sm) {
        const total = Number(sm[1]);
        if (sum !== total) {
            f.push('逐行求和（' + sum + '）与汇总行「检出重复应用 ' + total + ' 处」对不上'
                + ' ⇒ 有契约行没被解析到（解析漏行）或汇总口径变了，两边不许各说各话');
        }
    } else if (sum !== 0) {
        f.push('输出里没有汇总行「检出重复应用 N 处」，但逐行求和是 ' + sum
            + ' ⇒ 汇总行消失或改了文案，而 dup 仍有值，属对账断裂');
    }
    for (const c of consumers) {
        // ★ 只对**真有契约行解析器**的文件核（其余文件本来就不解析这行，
        //   把它们算进来就是第 149 轮「自证样本自指」那款病：拿无关者凑数）
        if (!pickParsers(c.src).length) continue;
        let n = 0;
        for (const rx of pickParsers(c.src)) {
            let re = null;
            try { re = new RegExp(rx.body, rx.flags); } catch { continue; }
            for (const ln of String(out).split('\n')) if (re.test(ln)) n++;
        }
        if (n === 0) {
            f.push(c.file + ' 在真实输出上解析出 0 行 ⇒ 静默归零（本件存在的全部理由）');
        } else if (rows.length >= MIN_ROWS && n !== rows.length) {
            f.push(c.file + ' 解析到 ' + n + ' 行，生产者侧真值是 ' + rows.length
                + ' 行 ⇒ 该消费者漏行，其结论基于残缺集合');
        }
    }
    return { fails: f, rows, sum, total: sm ? Number(sm[1]) : null };
}

// ---------- 段四：自证（牙）----------
const PRO_OK = '        console.log(`${c.id.padEnd(12)} 声明 ${String(s.declared).padStart(4)} 条 · 重复应用 ${s.dup} · 歧义跳过 ${s.ambiguous} · 严格比对 ${String(s.checked).padStart(4)} 条 / 偏差 ${s.mismatch}`);';
const CON_OK = "        const mc = line.match(/^([A-Z][A-Z_0-9]*)\\s+声明\\s+\\d+\\s+条\\s+·\\s+重复应用\\s+(\\d+)/);";
// 全字段版（contract-guard-selftest 那一条的等价物）—— 自证必须凑满 MIN_CONSUMERS 个消费者，
//   否则「消费者不足」这条棘轮会在自证里恒亮，把真信号淹掉。
const CON_FULL = "        const m = line.match(/^([A-Z][A-Z_0-9]*)\\s+声明\\s+(\\d+)\\s+条\\s+·\\s+重复应用\\s+(\\d+)\\s+·\\s+歧义跳过\\s+(\\d+)\\s+·\\s+严格比对\\s+(\\d+)\\s+条\\s*\\/\\s*偏差\\s+(\\d+)/);";

// 线二自证素材：两份口径相同的 pickKeyLine（形参写法刻意不同）
const PICK_A = 'function pickKeyLine(out) {\n'
    + '    const lines = out.split(/\\r?\\n/).map(s => s.trim()).filter(Boolean);\n'
    + '    const hit = lines.filter(l =>\n'
    + '        /RESULT|MATCH|通过|失败|Error/i.test(l));\n'
    + '    return (hit[hit.length - 1] || lines[lines.length - 1] || \'\').slice(0, 100);\n'
    + '}';
const PICK_B = PICK_A.replace('s => s.trim()', '(s) => s.trim()'); // 形参写法不同但口径相同（须不报）

// 段零自证素材：一条含中文的长正则
const SHARED = '/结果：(\\d+)\\/(\\d+) 通过，耗时 [\\d.]+s/';

function teeth() {
    const res = [];
    const t = (id, ok, desc) => res.push({ id, ok, desc });
    const std = [{ file: 'M.mjs', src: CON_OK }, { file: 'G.mjs', src: CON_FULL }];

    t('牙零', verifyCoupling(PRO_OK, std).fails.length === 0,
        '正常态（生产者与消费者同为「重复应用」）必须零报，不得把判据写成恒红');

    // 牙A：只改生产者列名，消费者没跟（本件要抓的头号形态）
    const proA = PRO_OK.replace('条 · 重复应用 ${s.dup}', '条 · 命中 ${s.dup}');
    t('牙A', verifyCoupling(proA, std).fails.some(x => x.indexOf('匹配不上') >= 0),
        '生产者改列名、消费者没跟 ⇒ 须报「静默解析出 0 行」');

    // 牙B：只改消费者正则，生产者没变（反方向同样要抓）
    const conB = [{ file: 'X.mjs', src: CON_OK.replace('重复应用', '命中') }];
    t('牙B', verifyCoupling(PRO_OK, conB).fails.some(x => x.indexOf('匹配不上') >= 0),
        '消费者正则改列名、生产者没变 ⇒ 同样须报失配');

    // 牙C：正则写得过宽（列名后面用 .* 吃掉）⇒ 反向样本也匹配，须由反向棘轮报
    const conC = [{ file: 'X.mjs', src: 'const m = line.match(/^([A-Z][A-Z_0-9]*)\\s+声明\\s+(\\d+)\\s+条\\s+·.*$/);' }];
    t('牙C', verifyCoupling(PRO_OK, conC).fails.some(x => x.indexOf('过宽') >= 0),
        '正则过宽（换了列名也匹配）⇒ 须报，不许拿「能匹配上」当已同步');

    // 牙D：生产者汇总行整段删掉 ⇒ 须报解析失败，不许「0 条 = 没事」
    t('牙D', verifyCoupling('console.log("hello");', std).fails.some(x => x.indexOf('找不到') >= 0),
        '生产者模板行消失 ⇒ 须报无从对账（0 条不等于没问题）');

    // 牙E：注释里写着已改成新列名、真代码仍是旧的 ⇒ 剥注释后照样报
    const proE = '// 已统一改为「重复应用」列名\n'
        + PRO_OK.replace('条 · 重复应用 ${s.dup}', '条 · 命中 ${s.dup}');
    t('牙E', verifyCoupling(stripComments(proE), std).fails.some(x => x.indexOf('匹配不上') >= 0),
        '注释里声称已同步、真代码没改 ⇒ 剥注释后照样报（注释兑不了声称）');

    // 牙F：合成样本行过期（contract-guard 的 synthLine 那种）
    const conF = [{ file: 'X.mjs', src: CON_OK + "\nconst synthLine = 'LEECH_MAXHP  声明  185 条 · 命中 0 · 歧义跳过 0 · 严格比对  185 条 / 偏差 0';" }];
    t('牙F', verifyCoupling(PRO_OK, conF).fails.some(x => x.indexOf('合成契约行样本') >= 0),
        '消费者自带的合成样本行列名过期 ⇒ 须报（它自己的自检会假绿/假红）');

    // 牙G：消费者数量少于下限
    t('牙G', verifyCoupling(PRO_OK, []).fails.some(x => x.indexOf('消费者只剩') >= 0),
        '消费者少于下限 ⇒ 须报（少一个不是省事，是那件的结论没人兜）');

    // 牙H：段三对账 —— 汇总行 N 与逐行求和不等
    const proH = extractProducer(PRO_OK);
    const outH = 'CLAW_HIT  声明  1029 条 · 重复应用 8 · 歧义跳过 6 · 严格比对  178 条 / 偏差 8\n'
        + '\n✗ 检出重复应用 99 处\n';
    t('牙H', crossCheck(outH, proH, std).fails.some(x => x.indexOf('对不上') >= 0),
        '汇总数与逐行求和不符 ⇒ 段三须报（解析漏行 ≠ 真没有）');

    // 牙I：段三 —— 消费者在真输出上解析出 0 行
    const outI = 'CLAW_HIT  声明  1029 条 · 重复应用 8 · 歧义跳过 6 · 严格比对  178 条 / 偏差 8\n'
        + '\n✗ 检出重复应用 8 处\n';
    t('牙I', crossCheck(outI, proH, [{ file: 'X.mjs', src: CON_OK.replace('重复应用', '命中') }])
        .fails.some(x => x.indexOf('静默归零') >= 0),
        '消费者在真实输出上解析出 0 行 ⇒ 段三须报静默归零');

    // ---- 线二（结论行挑选口径）的牙 ----
    const pickStd = [{ file: 'run-all.mjs', src: PICK_A }, { file: 'orphan-selftest-sweep.mjs', src: PICK_B }];
    t('牙J', verifyPickKeyLine(pickStd).fails.length === 0,
        '线二 正常态（两份实现口径相同，仅形参写法不同）须零报，不许把无害差异报成失配');

    const pickDiff = [{ file: 'run-all.mjs', src: PICK_A },
    { file: 'orphan-selftest-sweep.mjs', src: PICK_B.replace('|Error/i', '|Error|崩溃/i') }];
    t('牙K', verifyPickKeyLine(pickDiff).fails.some(x => x.indexOf('结论关键词正则') >= 0),
        '线二 一边给结论关键词表加词、另一边没跟 ⇒ 须报口径分叉（本轮新增的认领线）');

    const pickPick = [{ file: 'run-all.mjs', src: PICK_A },
    { file: 'orphan-selftest-sweep.mjs', src: PICK_B.replace('hit[hit.length - 1]', 'hit[0]') }];
    t('牙L', verifyPickKeyLine(pickPick).fails.some(x => x.indexOf('取行策略') >= 0),
        '线二 一边取最后一条、一边取第一条 ⇒ 须报');

    t('牙M', verifyPickKeyLine([{ file: 'run-all.mjs', src: PICK_A }]).fails.some(x => x.indexOf('只剩') >= 0),
        '线二 实现只剩一份 ⇒ 须报（比对面消失，不许「合并了就省事」）');

    t('牙N', verifyPickKeyLine([{ file: 'x.mjs', src: 'console.log(1);' }]).fails.some(x => x.indexOf('找不到任何') >= 0),
        '线二 一份实现都找不到 ⇒ 须报（0 份不等于不用管）');

    // 牙O：注释声称两处已同步、真代码没同步 ⇒ 剥注释后照样报
    const pickClaim = '// 口径已与 run-all 的 pickKeyLine 保持一致\n' + PICK_B.replace('|Error/i', '|Error|崩溃/i');
    t('牙O', verifyPickKeyLine([{ file: 'run-all.mjs', src: PICK_A },
    { file: 'orphan-selftest-sweep.mjs', src: pickClaim }]).fails.some(x => x.indexOf('结论关键词正则') >= 0),
        '线二 注释声称已同步、真代码没改 ⇒ 剥注释后照样报');

    // ---- 线三（崩溃判定口径）的牙 ----
    const CRASH_A = 'const CRASH_RE = /对照器异常|^\\s*Error:|throw |台词池缺失|击杀台词池缺失/;\n'
        + "const synthCrash = '对照器异常： Error: 台词池缺失: 小昭·姊';\n"
        + 'if (CRASH_RE.test(synthCrash)) console.log(1);';
    const crashStd = [{ file: 'binding.mjs', src: CRASH_A }, { file: 'guard.mjs', src: CRASH_A }];
    t('牙T', verifyFamily(crashStd, FAM_CRASH).fails.length === 0,
        '线三 正常态（两份 CRASH_RE 与 synthCrash 逐字相同）须零报');

    const crashDiff = [{ file: 'binding.mjs', src: CRASH_A },
    { file: 'guard.mjs', src: CRASH_A.replace('|throw ', '|throw |超时') }];
    t('牙U', verifyFamily(crashDiff, FAM_CRASH).fails.some(x => x.indexOf('CRASH_RE') >= 0),
        '线三 一边给崩溃关键词加词、另一边没跟 ⇒ 须报（同一份输出会一边判红一边判绿）');

    const crashSynth = [{ file: 'binding.mjs', src: CRASH_A },
    { file: 'guard.mjs', src: CRASH_A.replace('对照器异常： Error: 台词池缺失: 小昭·姊', '一切正常，没有异常') }];
    const fs2 = verifyFamily(crashSynth, FAM_CRASH).fails;
    t('牙V', fs2.some(x => x.indexOf('空转的假绿') >= 0) && fs2.some(x => x.indexOf('synthCrash 合成样本') >= 0),
        '线三 合成样本不被自己的 CRASH_RE 匹配 ⇒ 须报空转假绿，同时报两边样本不一致');

    t('牙W', verifyFamily([{ file: 'binding.mjs', src: CRASH_A }], FAM_CRASH).fails.some(x => x.indexOf('只剩') >= 0),
        '线三 实现只剩一份 ⇒ 须报（比对面消失）');

    t('牙X', verifyFamily([{ file: 'x.mjs', src: 'console.log(1);' }], FAM_CRASH).fails.some(x => x.indexOf('找不到任何') >= 0),
        '线三 一份实现都找不到 ⇒ 须报（0 份不等于不用管）');

    // ---- 段零（未认领耦合普查）的牙 ----
    const none = new Set();
    t('牙P', censusSharedRegexes([{ file: 'a.mjs', src: 'const r = ' + SHARED + ';' },
    { file: 'b.mjs', src: 'const r = ' + SHARED + ';' }], none).length === 1,
        '段零 两个文件含同一条中文正则 ⇒ 须扫出 1 条待认领耦合');

    t('牙Q', censusSharedRegexes([{ file: 'a.mjs', src: 'const r = ' + SHARED + ';' }], none).length === 0,
        '段零 只有一个文件含该正则 ⇒ 不算跨文件耦合，须 0 条（不许拿单文件凑数）');

    t('牙R', censusSharedRegexes([{ file: 'a.mjs', src: 'const r = ' + SHARED + ';' },
    { file: 'b.mjs', src: 'const r = ' + SHARED + ';' }], new Set([literalBody(SHARED)])).length === 0,
        '段零 已在认领表内的正则 ⇒ 不重复点名（认领过的不刷屏）');

    t('牙S', censusSharedRegexes([{ file: 'a.mjs', src: 'const r = /^\\s*$/g;' },
    { file: 'b.mjs', src: 'const r = /^\\s*$/g;' }], none).length === 0,
        '段零 短且不含中文的通用正则 ⇒ 不算耦合（防刷屏、防以偏概全）');
    return res;
}

function main() {
    const fails = [];

    // ---------- 素材：tests/ 下全部 .mjs（段零/段一/段二共用） ----------
    const all = [];
    for (const f of fs.readdirSync(here)) {
        if (!f.endsWith('.mjs')) continue;
        const rel = 'tests/' + f;
        if (rel === SELF) continue;
        all.push({ file: rel, src: stripCommentLines(fs.readFileSync(path.join(here, f), 'utf8')) });
    }

    // ---------- 段一 线一 ----------
    console.log('--- 段一 线一：输出标签耦合对账（生产者列名 vs 全部消费者正则）---');
    const consumers = all.filter(c => c.file !== F_PRODUCER);
    let proSrc = '';
    if (!fs.existsSync(path.join(root, F_PRODUCER))) {
        fails.push('段一 缺 ' + F_PRODUCER + ' —— 生产者不存在，耦合无从对账');
    } else {
        proSrc = stripCommentLines(fs.readFileSync(path.join(root, F_PRODUCER), 'utf8'));
    }
    const v = verifyCoupling(proSrc, consumers);
    if (v.prod) {
        console.log('  生产者列名        「' + v.prod.label + '」（' + F_PRODUCER + ' 契约汇总行）');
        console.log('  扫到消费者正则     ' + v.nParsers + ' 条 / ' + (v.files || []).length + ' 个文件：'
            + (v.files || []).join('、'));
        console.log('  真样本行          ' + v.sample);
        console.log('  反向样本行        ' + v.wrong);
    }
    for (const x of v.fails) fails.push('段一 ' + x);

    // ---------- 段二 线二 ----------
    console.log('--- 段二 重复实现族：同一份口径在 tests/ 里落了两遍，逐字比对 ---');
    const famRes = [];
    for (const fam of FAMILIES) {
        const pv = verifyFamily(all, fam);
        famRes.push({ fam, pv });
        console.log('  【' + fam.id + '】实现 ' + (pv.impls ? pv.impls.length : 0) + ' 份（下限 ' + fam.min + '）'
            + (pv.impls && pv.impls.length ? '：' + pv.impls.map(x => x.file).join('、') : ''));
        if (pv.base) {
            for (const k of Object.keys(pv.base.facets)) {
                const val = String(pv.base.facets[k]);
                console.log('     ' + (fam.labels[k] || k) + ' ' + val.slice(0, 110));
            }
        }
        for (const x of pv.fails) fails.push('段二 ' + x);
    }

    // ---------- 段零 未认领耦合普查 ----------
    // 认领表 = 线一已认领的消费者正则 + 线二的结论关键词正则（已认领的不重复点名）
    const claimed = new Set();
    for (const c of consumers) for (const rx of pickParsers(c.src)) claimed.add(rx.body);
    for (const fr of famRes) {
        if (!fr.pv.base) continue;
        const b = literalBody(fr.pv.base.facets.kw);
        if (b) claimed.add(b);
    }
    console.log('--- 段零 未认领跨文件同文正则普查（含中文 / 长度≥' + MIN_SHARED_LEN + ' / 跨≥2 文件）---');
    // ★ 规模闸门（不是「0 条就报空转」）：扫描器**能不能咬**由段四的牙 P~S 证明（同一套函数），
    //   段零真跑扫出 0 条是合法状态 —— 说明当前没有未认领的候选。这里只防「普查面本身不完整」。
    if (all.length < MIN_TESTS_FILES) {
        fails.push('段零 tests/ 只读到 ' + all.length + ' 个 .mjs（规模闸门 ' + MIN_TESTS_FILES + '）'
            + ' ⇒ 普查面不完整，扫出的「没有耦合」不可采信');
    }
    const cen = censusSharedRegexes(all, claimed);
    if (cen.length === 0) {
        console.log('  当前无未认领候选（已认领 ' + claimed.size + ' 条，全部对上了）'
            + ' ★ 这不是空转：扫描器还能不能咬，由段四牙 P~S 用合成样本单独证明');
    } else {
        console.log('  待认领 ' + cen.length + ' 条，打印前 ' + Math.min(cen.length, MAX_CENSUS_PRINT) + ' 条：');
        for (const r of cen.slice(0, MAX_CENSUS_PRINT)) {
            console.log('   · ' + r.files.length + ' 文件 ' + r.files.join('、') + '  ⇒  ' + r.body.slice(0, 90));
        }
        console.log('  ★ 观察项：这一栏是「机器列出来、人去认领」的候选，不是红；'
            + ' 下一条耦合线不必等人想起来。');
    }
    console.log('  （认领表已覆盖 ' + claimed.size + ' 条：线一消费者正则 + 线二结论关键词正则）');

    // ---------- 段三 真跑 ----------
    console.log('--- 段三 真跑账本对照并对账 ---');
    if (!v.prod) {
        fails.push('段三 生产者列名未取到 ⇒ 真跑对账跳过（不静默放行，已在段一报出）');
    } else {
        const r = spawnSync(process.execPath, [F_PRODUCER], {
            cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
        });
        const out = (r.stdout || '') + '\n' + (r.stderr || '');
        const cc = crossCheck(out, v.prod, consumers);
        console.log('  解析契约行        ' + cc.rows.length + ' 条（下限 ' + MIN_ROWS + '）');
        console.log('  逐行 dup 求和     ' + cc.sum);
        console.log('  汇总行            ' + (cc.total === null ? '(无)' : '检出重复应用 ' + cc.total + ' 处'));
        for (const x of cc.fails) fails.push('段三 ' + x);
        if (!cc.fails.length) {
            console.log('  ★ 逐行求和与汇总行一致 ⇒ 上下游解析的是同一批行，无静默漏行');
        }
    }

    // ---------- 段四 自证 ----------
    console.log('--- 段四 自证（牙）---');
    const ts = teeth();
    for (const r of ts) {
        console.log('  ' + (r.ok ? '✅' : '❌') + ' ' + r.id + ' ' + r.desc);
        if (!r.ok) fails.push('自证 ' + r.id + ' 未咬住：' + r.desc);
    }
    const tsc = truthSelfCheck();
    if (!tsc || tsc.ok === false) fails.push('公共件 static-truth-slice 自证未通过');

    console.log('--- 结论 ---');
    if (fails.length === 0) {
        console.log('  RESULT: PASS —— 三条已认领耦合线两边同步（线一列名 / 线二结论行口径 / 线三崩溃判定），'
            + '真跑对账一致，未认领候选 ' + cen.length + ' 条已点名，自证 ' + ts.length + ' 条全咬住');
    } else {
        console.log('  RESULT: FAIL —— ' + fails.length + ' 条：');
        for (const f of fails) console.log('     · ' + f);
        console.log('  ★ 定性：改一行「给人看的文案」会让写死正则的消费者**静默解析出 0 行** ——'
            + ' 不是报错、不是变红，是悄悄变成没看见。本件把这个耦合钉成机械契约。');
    }
    if (fails.length) process.exitCode = 1;
}

main();
