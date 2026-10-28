#!/usr/bin/env node
// tests/commit-claim-audit.mjs | V1.0.0 | 2026-10-29 夜间第 153 轮
//
// 「提交声称 vs 实际落盘」对账：把第 152 轮那款病从"人工发现"变成"机械点名"。
//
// 背景（第 152 轮实证，本轮照抄其第一节）：
//   第 151 轮在日志与提交信息里写下「判据收紧为只认 import 语句 RE_IMPORT_TRUTH」，
//   但**收紧没进提交** —— 代码里落盘的仍是它自己诊断出的"形同虚设"那一版宽口径。
//   第 152 轮靠人工 grep 才抓到：全仓 RE_IMPORT_TRUTH 只有一条命中，且在日志散文里。
//   ★ 那款病的名字叫**验证态与交付态混淆**：牙是在收紧后的工作区里咬出来的，
//     最后从备份还原时把收紧一起覆盖掉了，撰写者把"验证时看到的现象"当成"已落盘的改动"。
//     日志写了、牙也报了、报告也 PASS，机制却一路漏到第 152 轮。
//
// 本件干什么（只**点名**，不改提交习惯、不改退码口径）：
//   逐笔回溯夜间轮提交，把提交信息里点名的**代码符号**与该笔提交的**实际 diff**对账：
//     · 该符号在本笔 diff 的 .js/.mjs **新增代码行**（剥注释后）里出现 ⇒ 已落盘，不报；
//     · 在本笔 diff 的**删除行**里出现 ⇒ 删除侧命中（声称的是"删掉/改掉"），单列不报；
//     · 在本笔的**父提交** tests 代码里已存在 ⇒ 引用既有符号（不是"本轮新增物"），单列不报；
//     · 其余 ⇒ **声称未落盘**，逐条点名。
//
// ★ 两条降噪判据各自咬一款假红（都是先实测再定的，不是拍脑袋）：
//   ① 不收**文件路径**类声称：日志里提到某个文件，往往是"它被自动改动、本轮已还原"或
//      "点名挂账、故意不改"（实测 xinhun-death-case.js / 106-ai-pack-config.js /
//      123static-scan.js 全属此类）⇒ 收了就是纯噪音，把真信号淹掉。
//   ② 必须在**剥注释之后**的代码里找，且不认 .md：否则日志散文里写一句 RE_IMPORT_TRUTH
//      就把声称"兑现"了 —— 这正是第 149 轮立的老规矩（注释里的东西不算真值）与
//      第 151 轮牙A、第 152 轮那款病的同一处伤口。证据来源必须可靠，否则机制形同虚设。
//
// 挂 OBSERVES 而非 CHECKS：与第 147/148/149/151 轮同一取舍 —— 挂 CHECKS 会让体检分母
//   24 变 25，须拍板；挂观察项不改分母，结论照常打出来供研判。哪天拍板开红，挪进
//   CHECKS 即可，本件逻辑一个字不用改（退码已在自证失败时为 1）。
//
// 棘轮 CLAIM_MISS_RATCHET = 1：首次点名的实测基线（第 151 轮那笔 RE_IMPORT_TRUTH）。
//   ★ 只降不抬：新增一笔"声称未落盘"立刻报超棘轮。要抬须拍板并写明理由。
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    VER as TRUTH_VER, selfCheck as truthSelfCheck, stripCommentsMapped
} from './_lib/static-truth-slice.mjs';

const VER = 'tests/commit-claim-audit.mjs V1.0.0';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

/** 回溯基线：第 99 轮（git log 里能找到的最早夜间轮提交） */
const BASE = '8fc478e1';

/** 声称点提取：全大写常量（必须含下划线）与 camelCase 标识符 —— 只收"代码符号"这一形态。
 *  ★ 常量必须含下划线（RE_IMPORT_TRUTH / DUP_FN_RATCHET 命中，而 "PASS159" 这类
 *    "英文大写词 + 数字"的粘连不命中）：实测这类粘连占噪音的多数，且从不指向真声称。 */
const RE_CONST = /\b[A-Z][A-Z0-9]*_[A-Z0-9_]{3,}\b/g;
const RE_CAMEL = /\b[a-z][a-zA-Z0-9]{3,}[A-Z][A-Za-z0-9]{2,}\b/g;

/**
 * 「真漏」条数棘轮上限（只降不抬；要抬须拍板并写明理由）。
 * ★ 只约束真漏桶（该符号当前 HEAD 代码里存在 ⇒ 它本该落盘却漏了），
 *   不约束"疑似打桩样本"桶：打桩是每轮验牙的常态（牙E 的 dupProbeFn152、牙的探针函数
 *   还原后本就不该留在代码里），给它设棘轮等于天天被顶穿，属自找假红。
 */
export const CLAIM_MISS_RATCHET = 1;

const RE_NIGHT = /夜间第(\d+)轮/;
const RE_PLAIN = /第(\d+)轮/;

/**
 * ★ 已知真相（ground truth）：第 151 轮那笔提交声称"判据收紧为 RE_IMPORT_TRUTH"却没进提交，
 *   第 152 轮人工 grep 才发现，本件的存在理由就是它。把它钉成端到端断言：
 *   扫描 → 提取 → 落盘判据 → 豁免 → 分桶 → 棘轮这条链**任何一环**被改坏（放宽、改恒值、
 *   改成不调用），这一条都会在真漏桶里消失 ⇒ 立刻报。
 *   ★ 为什么必须在真数据上钉一条，而不是只咬单个函数：只咬函数咬不住"调用方到底有没有
 *   真的调用它"（第 152 轮牙F 那款病："拿被检查的东西自己来证明自己"的邻近形态）。
 */
export const KNOWN_TRUTH = { round: 151, token: 'RE_IMPORT_TRUTH' };

/** 从提交信息里提取"声称点"（去重、排序） */
export function extractClaims(msg, opts) {
    const o = opts || {};
    const rc = o.reConst || RE_CONST;
    const rm = o.reCamel || RE_CAMEL;
    const set = new Set();
    for (const m of String(msg || '').matchAll(rc)) set.add(m[0]);
    for (const m of String(msg || '').matchAll(rm)) set.add(m[0]);
    return [...set].sort();
}

function isCodeFile(p) {
    return p.endsWith('.js') || p.endsWith('.mjs');
}

/**
 * 单笔提交的对账（纯函数，自证直接喂样本，不需要真 git）。
 * opts = { msg, files:[{path, added:[], removed:[]}], isPreExisting: (token)=>bool,
 *          strip: 是否剥注释（默认 true，关掉=退化成"注释也算落盘"的宽口径）,
 *          usePre: 是否认"既有符号"豁免（默认 true） }
 * 返回 { miss:[], removedHit:[], preHit:[], landed:[] }
 */
export function auditCommitClaims(opts) {
    const o = opts || {};
    const files = o.files || [];
    const strip = o.strip !== false;
    const usePre = o.usePre !== false;
    const isPre = typeof o.isPreExisting === 'function' ? o.isPreExisting : () => false;

    const addedCode = files.filter(f => isCodeFile(f.path)).map(f => (f.added || []).join('\n')).join('\n');
    const removedCode = files.filter(f => isCodeFile(f.path)).map(f => (f.removed || []).join('\n')).join('\n');
    const truth = strip ? stripCommentsMapped(addedCode).code : addedCode;

    const claims = extractClaims(o.msg, o);
    const miss = [], removedHit = [], preHit = [], landed = [];
    for (const t of claims) {
        if (truth.includes(t)) { landed.push(t); continue; }
        if (removedCode.includes(t)) { removedHit.push(t); continue; }
        if (usePre && isPre(t)) { preHit.push(t); continue; }
        miss.push(t);
    }
    return { miss, removedHit, preHit, landed };
}

/** 解析 `git show --unified=0` 的输出为 { msg, files:[{path,added,removed}] } */
export function parseShow(out) {
    const lines = out.split('\n');
    let i = 0;
    const msgLines = [];
    const files = [];
    let cur = null;
    for (; i < lines.length; i++) {
        const ln = lines[i];
        if (ln.startsWith('diff --git ')) break;
        msgLines.push(ln);
    }
    for (; i < lines.length; i++) {
        const ln = lines[i];
        if (ln.startsWith('diff --git ')) {
            if (cur) files.push(cur);
            const m = / b\/(.*)$/.exec(ln);
            cur = { path: m ? m[1] : '?', added: [], removed: [] };
        } else if (ln.startsWith('+++') || ln.startsWith('---')) {
            continue;
        } else if (ln.startsWith('+')) {
            if (cur) cur.added.push(ln.slice(1));
        } else if (ln.startsWith('-')) {
            if (cur) cur.removed.push(ln.slice(1));
        }
    }
    if (cur) files.push(cur);
    return { msg: msgLines.join('\n'), files };
}

function git(args) {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
}

/** 取夜间轮提交清单（每轮只取最新一笔，跳过 merge 提交） */
function listNightCommits() {
    const raw = git(['log', '--format=%H%x09%s', BASE + '..HEAD']).split('\n');
    const chosen = new Map();
    for (const line of raw) {
        if (!line.includes('\t')) continue;
        const tab = line.indexOf('\t');
        const hs = line.slice(0, tab);
        const subj = line.slice(tab + 1);
        const m = RE_NIGHT.exec(subj) || RE_PLAIN.exec(subj);
        if (!m) continue;
        const n = Number(m[1]);
        if (n < 99 || chosen.has(n)) continue;
        const parents = git(['rev-list', '--parents', '-n', '1', hs]).trim().split(/\s+/);
        if (parents.length > 2) continue; // merge 提交：第一父 diff 会把整段上游改动卷进来
        chosen.set(n, { hash: hs, subject: subj });
    }
    return [...chosen.entries()].sort((a, b) => a[0] - b[0]).map(([n, v]) => ({ round: n, ...v }));
}

/**
 * 该符号在指定 tree-ish 的代码文件里是否已存在（带缓存）。
 * ★ 范围是全仓 .js/.mjs 而不只是 tests/：提交信息里点名的既有符号常常住在主代码
 *   （实测 butterflyHostDead / xuanmingDot / previewHeal / auraApply / emitEvent /
 *   unityApplyOp 全在 core/、modules/ 一侧）—— 只查 tests/ 会把"引用既有主代码符号"
 *   误报成"声称未落盘"，噪音一多真信号就被淹了。
 */
function makeExisting(treeish) {
    const cache = new Map();
    return (token) => {
        if (cache.has(token)) return cache.get(token);
        let hit = false;
        try {
            const out = git(['grep', '-l', '-F', '-e', token, treeish]);
            hit = out.split('\n').filter(Boolean).some(p => isCodeFile(p));
        } catch (e) {
            hit = false; // grep 无命中会退码 1，属正常
        }
        cache.set(token, hit);
        return hit;
    };
}

// ---------------------------------------------------------------------------
// 自证：本件的判据本身必须被咬过（第 152 轮立的规矩：机制守护机制，只有把口径钉进自证一条路）
// ---------------------------------------------------------------------------
export function selfCheck() {
    const fails = [];
    const md = (t) => ({ path: 'tests/体检迭代日志.md', added: ['（散文里提到 ' + t + '）'], removed: [] });
    const code = (t) => ({ path: 'tests/x.mjs', added: ['export const ' + t + ' = 1;'], removed: [] });
    const cmt = (t) => ({ path: 'tests/x.mjs', added: ['// 收紧为 ' + t + '，只认 import'], removed: [] });
    const blk = (t) => ({ path: 'tests/x.mjs', added: ['/* 收紧为', '   ' + t + ' 只认 import', '*/'], removed: [] });

    // ① 声称新增、但只写在 .md 散文里 ⇒ 必须报（本件存在的全部理由）
    let r = auditCommitClaims({ msg: '收紧为 ZZZ_CLAIM_A，已落盘', files: [md('ZZZ_CLAIM_A')] });
    if (!r.miss.includes('ZZZ_CLAIM_A')) fails.push('自证①失效：只在 .md 散文里出现的声称未被点名');

    // ② 声称新增、只写在 .mjs 的行注释里 ⇒ 必须报（剥注释必须生效，否则注释抄一句就"兑现"）
    r = auditCommitClaims({ msg: '收紧为 ZZZ_CLAIM_B，已落盘', files: [cmt('ZZZ_CLAIM_B')] });
    if (!r.miss.includes('ZZZ_CLAIM_B')) fails.push('自证②失效：行注释里的声称被当成已落盘（第 149 轮那款病原样复发）');

    // ③ 声称新增、只写在 .mjs 的块注释里 ⇒ 必须报（同款病的第二种写法）
    r = auditCommitClaims({ msg: '收紧为 ZZZ_CLAIM_G，已落盘', files: [blk('ZZZ_CLAIM_G')] });
    if (!r.miss.includes('ZZZ_CLAIM_G')) fails.push('自证③失效：块注释里的声称被当成已落盘');

    // ④ 声称新增、且真在 .mjs 代码里 ⇒ 必须不报（防剥注释误伤真代码）
    r = auditCommitClaims({ msg: '收紧为 ZZZ_CLAIM_C，已落盘', files: [code('ZZZ_CLAIM_C')] });
    if (r.miss.includes('ZZZ_CLAIM_C')) fails.push('自证④失效：真代码里的声称被误报未落盘（剥注释误伤）');

    // ⑤ 引用既有符号（父提交已有）⇒ 必须不报，且归到 preHit
    const pre = (t) => t === 'ZZZ_CLAIM_D';
    r = auditCommitClaims({ msg: '改前改后 ZZZ_CLAIM_D 输出逐字一致', files: [md('ZZZ_CLAIM_D')], isPreExisting: pre });
    if (r.miss.includes('ZZZ_CLAIM_D')) fails.push('自证⑤失效：引用既有符号被误报未落盘');
    if (!r.preHit.includes('ZZZ_CLAIM_D')) fails.push('自证⑤失效：既有符号未归入 preHit 桶（透明度缺失）');

    // ⑥ 咬"既有符号豁免"：把它关掉 ⇒ ⑤ 必须立刻报（否则豁免形同虚设）
    r = auditCommitClaims({ msg: '改前改后 ZZZ_CLAIM_D 输出逐字一致', files: [md('ZZZ_CLAIM_D')], isPreExisting: pre, usePre: false });
    if (!r.miss.includes('ZZZ_CLAIM_D')) fails.push('自证⑥失效：关掉既有符号豁免后仍未报 ⇒ 豁免未被咬住');

    // ⑦ 咬"剥注释"：把它关掉 ⇒ ② 必须不报（宽口径复活，正是第 151 轮那款病）
    r = auditCommitClaims({ msg: '收紧为 ZZZ_CLAIM_B，已落盘', files: [cmt('ZZZ_CLAIM_B')], strip: false });
    if (r.miss.includes('ZZZ_CLAIM_B')) fails.push('自证⑦失效：剥注释关掉后反而报了 ⇒ 咬的方向反了');
    r = auditCommitClaims({ msg: '收紧为 ZZZ_CLAIM_B，已落盘', files: [code('ZZZ_CLAIM_B')], strip: false });
    if (r.miss.includes('ZZZ_CLAIM_B')) fails.push('自证⑦失效：宽口径下真代码里的声称被误报');

    // ⑧ 咬"声称点提取"：提取环节必须是承重的 —— 改坏（要求 ≥30 字符）就提不出来 ⇒ 本条自证立刻报
    const msgA = '收紧为 ZZZ_CLAIM_A，已落盘';
    if (!extractClaims(msgA).includes('ZZZ_CLAIM_A')) {
        fails.push('自证⑧失效：声称点提取正则没抓到样本 ⇒ 提取环节退化未被发现');
    }
    if (extractClaims(msgA, { reConst: /\b[A-Z][A-Z0-9_]{29,}\b/g }).includes('ZZZ_CLAIM_A')) {
        fails.push('自证⑧失效：提取正则改坏后照样抓到样本 ⇒ 本条咬不住退化（样本不构成风险）');
    }

    // ⑫ 咬"常量必须含下划线"这条降噪判据：退回宽口径（只要 ≥6 位大写）⇒ "PASS159" 这类
    //    "英文大写词 + 数字"的粘连会被当成声称点 ⇒ 实测它会凭空多报一条假红，真信号被淹。
    if (extractClaims('实测 PASS159 条判据分支逐字一致').includes('PASS159')) {
        fails.push('自证⑫失效：无下划线的粘连词（PASS159）被当成声称点 ⇒ 噪音判据被放宽');
    }

    // ⑨ 咬"删除侧命中"：声称的是删掉某符号 ⇒ 归 removedHit，不报未落盘
    r = auditCommitClaims({ msg: '删除 ZZZ_CLAIM_E 手写第二份', files: [{ path: 'tests/x.mjs', added: [], removed: ['function ZZZ_CLAIM_E() {'] }] });
    if (r.miss.includes('ZZZ_CLAIM_E')) fails.push('自证⑨失效：删除侧命中的声称被误报未落盘');
    if (!r.removedHit.includes('ZZZ_CLAIM_E')) fails.push('自证⑨失效：删除侧命中未单独成桶');

    // ⑪ 咬"分桶依据"（HEAD 侧存在性）：这一条决定真漏会不会被静默归进打桩桶（第 152 轮那款病的同一处伤口）
    //    两端都要咬：恒判"不存在" ⇒ 真漏全被洗掉；恒判"存在" ⇒ 打桩桶形同虚设、棘轮天天被顶穿。
    const headHas = makeExisting('HEAD');
    if (!headHas('DUP_FN_RATCHET')) {
        fails.push('自证⑪失效：HEAD 侧存在性判据说「HEAD 代码里没有 DUP_FN_RATCHET」⇒ 真漏会被静默归进打桩桶');
    }
    if (headHas('ZZZ_NOT_EXIST_153')) {
        fails.push('自证⑪失效：HEAD 侧存在性判据说「HEAD 代码里有 ZZZ_NOT_EXIST_153」⇒ 打桩桶形同虚设');
    }

    // ⑩ 咬"代码文件限定"：.md 之外的非代码文件（如 .json）新增行命中不算落盘（少收不是错收）
    r = auditCommitClaims({ msg: '收紧为 ZZZ_CLAIM_F，已落盘', files: [{ path: 'tests/baselines/x.json', added: ['"ZZZ_CLAIM_F": 1'], removed: [] }] });
    if (!r.miss.includes('ZZZ_CLAIM_F')) fails.push('自证⑩失效：非代码文件里的字样被当成已落盘');

    return fails;
}

function main() {
    // 公共件自证：本件的"剥注释"全部建立在它的口径上，它自己歪了则本件结论一并作废
    const scFails = selfCheck();
    for (const f of scFails) console.log('❌ 本件自证：' + f);
    const truthFails = truthSelfCheck();
    for (const f of truthFails) console.log('❌ 公共件自证：' + f);

    const commits = listNightCommits();
    const atHead = makeExisting('HEAD');
    const missAll = [];
    let preCount = 0, removedCount = 0;
    for (const c of commits) {
        let out = '';
        try {
            out = git(['show', '--format=%B', '--unified=0', c.hash, '--', 'tests/', 'tools/']);
        } catch (e) {
            console.log('⚠ 第' + c.round + '轮 ' + c.hash.slice(0, 8) + ' 取 diff 失败，跳过');
            continue;
        }
        const parsed = parseShow(out);
        if (!parsed.files.length) continue;
        const isPre = makeExisting(c.hash + '^');
        const r = auditCommitClaims({ msg: parsed.msg, files: parsed.files, isPreExisting: isPre });
        preCount += r.preHit.length;
        removedCount += r.removedHit.length;
        for (const t of r.miss) {
            // ★ 分桶依据 = 当前 HEAD 侧是否还存在（自证⑪ 咬住这个判据，两端都咬）
            missAll.push({ round: c.round, hash: c.hash.slice(0, 8), token: t, real: atHead(t) });
        }
    }
    const real = missAll.filter(x => x.real);
    const stub = missAll.filter(x => !x.real);
    console.log('【真漏 · 该符号当前 HEAD 代码里存在 ⇒ 本该落盘却漏了】' + real.length + ' 条 / 棘轮上限 ' + CLAIM_MISS_RATCHET + '：');
    for (const x of real) {
        console.log('  ✗ 第' + x.round + '轮 ' + x.hash + ' 声称「' + x.token + '」未落盘'
            + '（本笔 diff 的 .js/.mjs 新增代码行无、父提交代码里也没有）');
    }
    console.log('【疑似打桩样本 / 有意未采纳 · HEAD 里也没有】' + stub.length + ' 条（只点名，不设棘轮）：');
    for (const x of stub) {
        console.log('  ⚠ 第' + x.round + '轮 ' + x.hash + ' 声称「' + x.token + '」未落盘'
            + ' —— 当前 HEAD 代码里也不存在，疑似验牙打桩样本或"点名挂账故意不改"，待人工确认');
    }

    console.log('提交声称 vs 落盘对账：扫描夜间轮提交 ' + commits.length + ' 笔'
        + '；真漏 ' + real.length + ' 条 / 棘轮上限 ' + CLAIM_MISS_RATCHET
        + '；疑似打桩 ' + stub.length + ' 条'
        + '；引用既有符号 ' + preCount + ' 条；删除侧命中 ' + removedCount + ' 条（后二者均非漏落盘）');
    // ★ 端到端断言：已知真漏必须仍在真漏桶里（钉住整条链，见 KNOWN_TRUTH 注释）
    const knownHit = real.some(x => x.round === KNOWN_TRUTH.round && x.token === KNOWN_TRUTH.token);
    if (!knownHit) {
        console.log('❌ 端到端对账失效：已知真漏「第' + KNOWN_TRUTH.round + '轮 ' + KNOWN_TRUTH.token
            + '」没落在真漏桶 ⇒ 扫描/提取/落盘判据/豁免/分桶任一环断了，本件等于没在抓它');
    }

    let bad = scFails.length + truthFails.length + (knownHit ? 0 : 1);
    if (real.length > CLAIM_MISS_RATCHET) {
        bad++;
        console.log('❌ 真漏 ' + real.length + ' 条 > 棘轮上限 ' + CLAIM_MISS_RATCHET + '（只降不抬，要抬须拍板）');
    }
    if (bad === 0) {
        console.log('RESULT: PASS —— 真漏 ' + real.length + ' 条 / 棘轮上限 ' + CLAIM_MISS_RATCHET
            + '（历史基线即第 151 轮 RE_IMPORT_TRUTH 那一笔）＋ 疑似打桩 ' + stub.length + ' 条待人工确认');
    } else {
        console.log('RESULT: FAIL —— ' + bad + ' 项');
    }
    console.log('VER: ' + VER + ' | ' + TRUTH_VER);
    return bad === 0 ? 0 : 1;
}

process.exit(main());
