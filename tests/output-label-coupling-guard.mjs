// tests/output-label-coupling-guard.mjs | V1.0.0 | 2026-11-01 夜间第 167 轮
//
// ★ 立它的由头（第 166 轮留的备忘，本轮动手时才发现它不是小事）：
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
// ★ 本件做什么（三段，挂 OBSERVES 不改分母）：
//   段一 机械抽取生产者的列名模板，与**扫出来的全部消费者正则**逐个对账：
//        ① 真样本行（按生产者当前列名拼的）每个消费者正则都须匹配得上；
//        ② 反向：换了列名的样本行每个消费者正则都须**匹配不上**（正则过宽 ⇒ 它根本没在核列名）；
//        ③ 合成样本行（如 contract-guard 的 synthLine）列名也须与生产者一致（防自检样本过期）；
//        ④ 规模棘轮：消费者不得少于下限（少一个即报，不许「少一个也照跑」）。
//   段二 真跑一次账本对照，用「按生产者列名现造的正则」解析，断言：
//        ① 解析行数 ≥ 下限（防「两边都归零于是相等」的假绿）；
//        ② 逐行 dup 求和 == 汇总行「检出重复应用 N 处」的 N（无汇总行则求和须为 0）
//           ⇒ 这一条把「解析漏行」与「真没有」区分开；
//        ③ 每个消费者解析到的行数 == 生产者侧真值行数。
//   段三 自证（八牙 + 牙零），全部在合成源码上跑同一套函数，证明本件不是恒红也不是恒绿。
//
// 用法：node tests/output-label-coupling-guard.mjs
//   RESULT: PASS = 生产者列名与全部消费者正则已同步｜FAIL = 有消费者会静默归零
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stripComments, selfCheck as truthSelfCheck } from './_lib/static-truth-slice.mjs';

export const VER = 'tests/output-label-coupling-guard.mjs V1.0.0';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const F_PRODUCER = 'tests/stat-decl-vs-actual-check.mjs';
const SELF = 'tests/output-label-coupling-guard.mjs';

// 已知消费者下限（mutation-teeth + contract-guard-selftest）。少了即报：不是少了就没事，
// 是少掉的那一件的结论从此没人兜（第 147 轮「孤儿普查」同一口气）。
const MIN_CONSUMERS = 2;
// 段二解析行数下限：账本对照当前 101 条契约，取 50 作闸门（防双方同时归零却"相等"）
const MIN_ROWS = 50;

// 列名抽取：形如 `... 条 · 命中 ${s.dup} ·` 或 `条 · 命中 8 ·`
//   ${s.dup} 也要认 —— 生产者那行是模板字面量，列名后面跟的是插值不是数字。
const RE_LABEL = /条\s+·\s+(\S+)\s+(?:\d+|\$\{s\.dup\})/;

// 正则字面量粗扫（够用即可：只挑含「声明 + 条 + ·」的那些，即契约行解析器）
const RE_LITERAL = /\/(?:\\.|\[(?:\\.|[^\]\n])*\]|[^/\\\n])+\/([gimsuy]*)/g;

function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

// 按生产者当前列名现造一条全字段正则（段二用它当"真值解析器"）
function truthRegex(label) {
    return new RegExp('^([A-Z][A-Z_0-9]*)\\s+声明\\s+(\\d+)\\s+条\\s+·\\s+' + escapeRe(label)
        + '\\s+(\\d+)\\s+·\\s+歧义跳过\\s+(\\d+)\\s+·\\s+严格比对\\s+(\\d+)\\s+条\\s*/\\s*偏差\\s+(\\d+)');
}

// ---------- 段一：静态耦合对账（纯函数，真跑与自证共用） ----------
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

// ---------- 段二：真跑对账（纯函数：给定输出文本 + 列名 + 消费者列表） ----------
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
                + ' 行 ⇒ 该consumer漏行，其结论基于残缺集合');
        }
    }
    return { fails: f, rows, sum, total: sm ? Number(sm[1]) : null };
}

// ---------- 段三：自证（牙）----------
const PRO_OK = '        console.log(`${c.id.padEnd(12)} 声明 ${String(s.declared).padStart(4)} 条 · 重复应用 ${s.dup} · 歧义跳过 ${s.ambiguous} · 严格比对 ${String(s.checked).padStart(4)} 条 / 偏差 ${s.mismatch}`);';
const CON_OK = "        const mc = line.match(/^([A-Z][A-Z_0-9]*)\\s+声明\\s+\\d+\\s+条\\s+·\\s+重复应用\\s+(\\d+)/);";
// 全字段版（contract-guard-selftest 那一条的等价物）—— 自证必须凑满 MIN_CONSUMERS 个消费者，
//   否则「消费者不足」这条棘轮会在自证里恒亮，把真信号淹掉。
const CON_FULL = "        const m = line.match(/^([A-Z][A-Z_0-9]*)\\s+声明\\s+(\\d+)\\s+条\\s+·\\s+重复应用\\s+(\\d+)\\s+·\\s+歧义跳过\\s+(\\d+)\\s+·\\s+严格比对\\s+(\\d+)\\s+条\\s*\\/\\s*偏差\\s+(\\d+)/);";

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

    // 牙H：段二对账 —— 汇总行 N 与逐行求和不等
    const proH = extractProducer(PRO_OK);
    const outH = 'CLAW_HIT  声明  1029 条 · 重复应用 8 · 歧义跳过 6 · 严格比对  178 条 / 偏差 8\n'
        + '\n✗ 检出重复应用 99 处\n';
    t('牙H', crossCheck(outH, proH, std).fails.some(x => x.indexOf('对不上') >= 0),
        '汇总数与逐行求和不符 ⇒ 段二须报（解析漏行 ≠ 真没有）');

    // 牙I：段二 —— 消费者在真输出上解析出 0 行
    const outI = 'CLAW_HIT  声明  1029 条 · 重复应用 8 · 歧义跳过 6 · 严格比对  178 条 / 偏差 8\n'
        + '\n✗ 检出重复应用 8 处\n';
    t('牙I', crossCheck(outI, proH, [{ file: 'X.mjs', src: CON_OK.replace('重复应用', '命中') }])
        .fails.some(x => x.indexOf('静默归零') >= 0),
        '消费者在真实输出上解析出 0 行 ⇒ 段二须报静默归零');
    return res;
}

function main() {
    const fails = [];
    console.log('--- 段一 输出标签耦合对账（生产者列名 vs 全部消费者正则）---');

    let proSrc = '';
    if (!fs.existsSync(path.join(root, F_PRODUCER))) {
        fails.push('段一 缺 ' + F_PRODUCER + ' —— 生产者不存在，耦合无从对账');
    } else {
        proSrc = stripCommentLines(fs.readFileSync(path.join(root, F_PRODUCER), 'utf8'));
    }

    // 消费者：tests/ 下全部 .mjs，排除本件与生产者自身
    const consumers = [];
    for (const f of fs.readdirSync(here)) {
        if (!f.endsWith('.mjs')) continue;
        const rel = 'tests/' + f;
        if (rel === SELF || rel === F_PRODUCER) continue;
        consumers.push({ file: rel, src: stripCommentLines(fs.readFileSync(path.join(here, f), 'utf8')) });
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

    console.log('--- 段二 真跑账本对照并对账 ---');
    if (!v.prod) {
        fails.push('段二 生产者列名未取到 ⇒ 真跑对账跳过（不静默放行，已在段一报出）');
    } else {
        const r = spawnSync(process.execPath, [F_PRODUCER], {
            cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
        });
        const out = (r.stdout || '') + '\n' + (r.stderr || '');
        const cc = crossCheck(out, v.prod, consumers);
        console.log('  解析契约行        ' + cc.rows.length + ' 条（下限 ' + MIN_ROWS + '）');
        console.log('  逐行 dup 求和     ' + cc.sum);
        console.log('  汇总行            ' + (cc.total === null ? '(无)' : '检出重复应用 ' + cc.total + ' 处'));
        for (const x of cc.fails) fails.push('段二 ' + x);
        if (!cc.fails.length) {
            console.log('  ★ 逐行求和与汇总行一致 ⇒ 上下游解析的是同一批行，无静默漏行');
        }
    }

    console.log('--- 段三 自证（九牙 + 牙零）---');
    const ts = teeth();
    for (const r of ts) {
        console.log('  ' + (r.ok ? '✅' : '❌') + ' ' + r.id + ' ' + r.desc);
        if (!r.ok) fails.push('自证 ' + r.id + ' 未咬住：' + r.desc);
    }
    const tsc = truthSelfCheck();
    if (!tsc || tsc.ok === false) fails.push('公共件 static-truth-slice 自证未通过');

    console.log('--- 结论 ---');
    if (fails.length === 0) {
        console.log('  RESULT: PASS —— 生产者列名与全部消费者正则已同步，真跑对账一致，自证 '
            + ts.length + ' 条全咬住');
    } else {
        console.log('  RESULT: FAIL —— ' + fails.length + ' 条：');
        for (const f of fails) console.log('     · ' + f);
        console.log('  ★ 定性：改一行「给人看的文案」会让写死正则的消费者**静默解析出 0 行** ——'
            + ' 不是报错、不是变红，是悄悄变成没看见。本件把这个耦合钉成机械契约。');
    }
    if (fails.length) process.exitCode = 1;
}

main();
