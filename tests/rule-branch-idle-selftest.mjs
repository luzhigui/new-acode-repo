#!/usr/bin/env node
// tests/rule-branch-idle-selftest.mjs | V1.0.0 | 2026-10-25 第 131 轮
//
// 背景（为什么要有它，务必先读）：
//   第 130 轮的 rule-idle-selftest 补齐了**规则级**恒空转棘轮（pass=0 fail=0 ⇒ 规则压根没判定过）。
//   但「规则判定过」≠「规则的判据分支真的咬过」：一条规则跑 140 场 pass=140、fail 分支一次没触发，
//   规则级自检给的是**绿**，而这绿有两种完全不同的成因，回放数字一模一样、肉眼撞不见：
//     A 回归哨兵本就不该触发（正确形态）—— 绝大多数分支属此类；
//     B 分支判据键漂移 / 数据源错位，分支已经死了 —— 真·假绿，属缺陷（第 44 轮 136 号规则
//       正是这一款：锚点行被主代码删了 ⚡，规则照样 pass=51，复发信号分支永久沉默）。
//   本自检不试图区分 A/B（那需要变异树取证，属牙口矩阵的活），而是**把已经咬过的分支钉成基线**：
//   判据分支掉牙（曾经会响的分支突然不响了）是**静默事件**——回放只会从"有失败"变成"无失败"，
//   越变越绿，没有任何东西会报警。本自检就是这条常驻绊线（第 128 轮立的通规又一次应验：
//   「白名单型 / 静默判据都是回放盲区」）。
//
// 口径（与规则级恒空转棘轮对齐，棘轮只许收缩）：
//   ① 静态抽取：扫 tests/health-rules/*.js，每个 `fail: true` 的 return 记为一个**判据分支**；
//      指纹 = 该分支 msg 里**首个静态字符串字面量**的前缀（遇模板插值 ${ 处截断；≥4 字才算）。
//   ② 运行时：跑标准样本（20seed × 7 关 = 140 场）回放，落盘每条规则**真的报出过**的 msg 全集；
//      同规则名下 fired msg 以某分支指纹为前缀 ⇒ 该分支本次**命中（有牙）**。
//   ③ 棘轮方向是「有牙分支不许掉牙」而非「空转分支不许存在」——后者会把 150 条正常哨兵刷成
//      噪声（本轮实测：158 分支里只有 4 条命中），故只钉住命中集合（基线仅 4 条，可维护）。
//
// 五条断言：
//   ① 规模闸门：样本场次 / 规则文件数 / 分支总数 三项下限 —— 防样本或规则被批量裁剪后自检恒绿
//   ② 无指纹分支白名单：无法建立指纹的分支（msg 由变量拼接、或多个分支共用 '复发：' 这类短前缀
//      ⇒ 无法定位到具体分支）属**本自检裁定不到的盲区**，必须登记在册、只许收缩
//   ③ 有牙棘轮：基线中的每条分支本次必须仍命中，掉了即红（★ 如确系缺陷已修复，则收缩基线）
//   ④ 基线在册：基线每条的 (文件|规则|指纹) 必须仍在静态分支集合中 —— 防规则改名 / 分支被删后基线腐烂
//   ⑤ 匹配率闸门：本次 fired msg 至少 90% 能匹配到静态指纹 —— 防抽取口径与运行时脱节后自检假绿
//
// 数据来源：复用 tests/rules-replay.mjs 的真实回放（第 131 轮加了 RULE_MSGS_OUT 落盘口径，
//   仅在该环境变量显式设置时才写文件，默认零副作用），**不另造一套判据**，避免两套口径分叉。
//
// 与既有自检的分工：
//   rule-binding-drift-selftest 盯「判据键还在不在」（静态·中文键）；
//   rule-idle-selftest          盯「规则判定过没有」（运行时·规则级）；
//   本自检                       盯「判据分支掉没掉牙」（运行时·分支级）—— 三者互补，缺一都可能漏。
//
// 用法：node tests/rule-branch-idle-selftest.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const VER = 'tests/rule-branch-idle-selftest.mjs V1.0.0';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const RULE_DIR = path.join(here, 'health-rules');

// --- 规模闸门（低于下限 ⇒ 自检结论不可信，防静默恒绿）---
const MIN_CASES = 140;
const MIN_RULE_FILES = 45;
const MIN_BRANCHES = 150;
const MIN_FP_RATE = 0.9;      // 可抽取指纹的分支占比下限
const MIN_MATCH_RATE = 0.9;   // fired msg 能匹配到静态指纹的比例下限

// --- 有牙分支基线（棘轮：只许收缩）---
// 每条 = 本次样本里**真的报出过 msg** 的判据分支。掉了牙 ⇒ 红。
// ★ 若某条确因「缺陷已被主代码修复」而不再触发，那是好消息，但也必须**显式收缩本基线**
//   （并同步 tests/known-transfers.md），不许让它挂着变腐烂。
const BITTEN_BASELINE = [
    {
        file: '141-zhangsanfeng-fortify-round.js',
        rule: '张三丰核心机制回归(严阵以待/如沐春风/生生不息)',
        fp: '复发：张三丰存活到第',
        why: '转交中（挂账③）：张三丰严阵以待时序，本分支在标准样本里持续报错，fail>0 ⇒ 确实在咬'
    },
    {
        file: '141-zhangsanfeng-fortify-round.js',
        rule: '张三丰核心机制回归(严阵以待/如沐春风/生生不息)',
        fp: '复发：严阵以待首次出现在第',
        why: '转交中（挂账③）：同上规则的另一条分支（触发回合数不符），两条分支各自独立，须各登记一条'
    },
    {
        file: '142-zhangsanfeng-endless-roundstart.js',
        rule: '张三丰生生不息回合开始触发缺失(回归)',
        fp: '复发：张三丰存活到终局，但第',
        why: '转交中（挂账③）：ON_ROUND_START 触发点缺失，本分支持续报错 ⇒ 确实在咬'
    },
    {
        file: '164-leech-maxhp.js',
        rule: '吸血上限提升数值(回归)',
        fp: '复发：吸血上限 heal=+',
        why: '转交中（挂账③）：吸血上限 maxHp 增量与声明值不符，本分支持续报错 ⇒ 确实在咬'
    }
];

// --- 无指纹分支白名单（只许收缩）---
// 这些分支的 msg 由运行时变量拼出、或以 '复发：' 这类**多分支共用短前缀**开头 ⇒ 无法建立可定位的
// 静态指纹 ⇒ 本自检对它们**既不能证明有牙、也不能证明掉牙**，属登记在册的分支级盲区。
// ★ 待办（建议后续轮次做）：给这些分支补上可区分的静态前缀（如 '复发：白骨爪回血刷屏：'），
//   补一条就应把对应条目从本白名单移出（收缩），把盲区换成可裁定的分支。
const NO_FP_WHITELIST = [
    { file: '123-claw-heal-spam.js', rule: '白骨爪回血刷屏(回归)', why: 'msg 为 issues.slice().join()，整体由运行时数组拼出，无静态前缀' },
    { file: '131-separator-duplicate.js', rule: '回合分隔符重复(回归)', why: 'msg 以共用短前缀「复发：」开头后直接接变量 dup，无法定位到分支' },
    { file: '135-break-def-pos.js', rule: '破防显示位置/破防量(回归)', why: 'msg 为「复发：」+ msgs.join()，整体动态' },
    { file: '139-spider-butterfly-target.js', rule: '小昭妹/姐不可选期被打(回归)', why: 'msg 为「复发：」+ problems.slice().join()，整体动态' },
    { file: '145-fly-miss-aura.js', rule: '飞行未命中光环数值(回归)', why: '本规则两条分支均以「复发：」开头后接单位名变量，两条分支指纹不可区分' },
    { file: '150-hot-blood-leech.js', rule: '热血奋战攻击回血(回归)', why: 'msg 以「复发：」开头后接单位名变量 w，无静态可定位前缀' },
    { file: '156-desc-truth-drift.js', rule: '技能说明数字==引擎真值(单源守卫)', why: 'msg 整体由 problems 数组拼出，无静态前缀' },
    { file: '157-mechanic-install-reconcile.js', rule: 'mechanics安装对账(类型↔注册表↔字段)', why: 'msg 为「复发：」+ problems[0]，直接取数组首项，无静态前缀' }
];

// --- 静态抽取：剥注释但保留字符串/正则字面量原样 ---
function stripCommentsKeepStrings(src) {
    let out = '';
    let i = 0;
    const n = src.length;
    while (i < n) {
        const ch = src[i];
        if (ch === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
        if (ch === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
        if (ch === '"' || ch === "'" || ch === '`') {
            const q = ch;
            let j = i + 1;
            while (j < n) {
                if (src[j] === '\\') { j += 2; continue; }
                if (src[j] === q) { j++; break; }
                j++;
            }
            out += src.slice(i, j);
            i = j;
            continue;
        }
        out += ch;
        i++;
    }
    return out;
}

// 抽取一个规则文件里的全部判据分支
function extractBranches(src, file) {
    const lines = stripCommentsKeepStrings(src).split('\n');
    const out = [];
    let curRule = null;
    for (let li = 0; li < lines.length; li++) {
        const L = lines[li];
        const nm = L.match(/name:\s*(['"])(.*?)\1/);
        if (nm) curRule = nm[2];
        if (!/fail:\s*true/.test(L)) continue;
        // msg 可能换行书写，向后多看 6 行拼成片段再找
        let seg = L;
        for (let k = 1; k <= 6 && li + k < lines.length; k++) seg += '\n' + lines[li + k];
        const mi = seg.indexOf('msg:');
        let fp = null;
        if (mi !== -1) {
            const m = seg.slice(mi + 4, mi + 404).match(/(['"`])((?:\\.|(?!\1).)*)\1/);
            if (m) {
                let v = m[2];
                const d = v.indexOf('${');       // 模板插值处截断，只取静态前缀
                if (d !== -1) v = v.slice(0, d);
                v = v.trim();
                if (v.length >= 4) fp = v;      // 短于 4 字视为"多分支共用前缀"，不可定位
            }
        }
        out.push({ file, rule: curRule, fp });
    }
    return out;
}

function keyOf(b) { return b.file + '|' + b.rule; }
function bittenKeyOf(b) { return b.file + '|' + b.rule + '|' + b.fp; }

function fail(msg) {
    console.log('  ❌ ' + msg);
    return msg;
}

function main() {
    // --- 静态抽取 ---
    const files = fs.readdirSync(RULE_DIR).filter(f => f.endsWith('.js')).sort();
    const branches = [];
    for (const f of files) branches.push(...extractBranches(fs.readFileSync(path.join(RULE_DIR, f), 'utf8'), f));

    // --- 运行时：真实回放落盘 fired msg ---
    const tmp = path.join(os.tmpdir(), 'rule-branch-msgs-' + process.pid + '.json');
    const res = spawnSync(process.execPath, [path.join(here, 'rules-replay.mjs')], {
        cwd: root,
        env: { ...process.env, RULE_MSGS_OUT: tmp },
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024
    });
    if (!fs.existsSync(tmp)) {
        console.log('❌ 判据分支级空转自检失败：回放未产出分支 msg 落盘（exit=' + res.status + '），无法判定');
        process.exit(1);
    }
    let dump;
    try {
        dump = JSON.parse(fs.readFileSync(tmp, 'utf8'));
    } catch (e) {
        console.log('❌ 判据分支级空转自检失败：落盘解析失败 ' + (e && e.message ? e.message : e));
        process.exit(1);
    } finally {
        try { fs.unlinkSync(tmp); } catch (e) { /* 清理失败不影响结论 */ }
    }

    const cases = dump.cases || 0;
    const firedByRule = dump.branchMsgs || {};
    const problems = [];

    // 命中判定：同规则名下，fired msg 以分支指纹为前缀 ⇒ 该分支本次有牙
    const bitten = new Set();
    let firedTotal = 0, firedMatched = 0;
    for (const [rule, msgs] of Object.entries(firedByRule)) {
        const cands = branches.filter(b => b.rule === rule && b.fp);
        for (const m of msgs) {
            firedTotal++;
            const hit = cands.find(b => m.startsWith(b.fp));
            if (hit) { firedMatched++; bitten.add(bittenKeyOf(hit)); }
        }
    }

    const noFp = branches.filter(b => !b.fp);
    console.log('=== 判据分支级空转自检（' + cases + ' 场 / ' + files.length + ' 规则文件 / ' +
        branches.length + ' 分支 ⇒ 本次命中 ' + bitten.size + ' 条）===');

    // ① 规模闸门（3 项）
    if (cases < MIN_CASES) problems.push(fail('样本场次掉到 ' + cases + '（下限 ' + MIN_CASES + '）⇒ 结论不可信（样本被裁会让自检恒绿）'));
    if (files.length < MIN_RULE_FILES) problems.push(fail('规则文件数掉到 ' + files.length + '（下限 ' + MIN_RULE_FILES + '）⇒ 结论不可信（规则被批量删除会让自检恒绿）'));
    if (branches.length < MIN_BRANCHES) problems.push(fail('判据分支总数掉到 ' + branches.length + '（下限 ' + MIN_BRANCHES + '）⇒ 结论不可信（分支被批量删除会让自检恒绿）'));

    // ② 无指纹分支白名单（恰好相等，只许收缩）
    const noFpKeys = new Set(noFp.map(keyOf));
    const wlKeys = new Set(NO_FP_WHITELIST.map(keyOf));
    for (const k of noFpKeys) {
        if (!wlKeys.has(k)) problems.push(fail('新增无可抽取指纹的分支（不在白名单）：' + k +
            ' ⇒ 本自检无法为它裁定有牙/掉牙，须补静态前缀或显式登记，不得静默放行'));
    }
    for (const k of wlKeys) {
        if (!noFpKeys.has(k)) problems.push(fail('白名单条目已可抽取指纹：' + k +
            ' ⇒ 它已不再是盲区，白名单必须同步收缩，防腐烂'));
    }
    const fpRate = branches.length ? (branches.length - noFp.length) / branches.length : 0;
    if (fpRate < MIN_FP_RATE) problems.push(fail('指纹可抽取率掉到 ' + (fpRate * 100).toFixed(1) + '%（下限 ' +
        (MIN_FP_RATE * 100) + '%）⇒ 抽取口径可能已失效，自检会大面积失去裁定力'));

    // ③ 有牙棘轮：基线每条本次必须仍命中
    for (const b of BITTEN_BASELINE) {
        const k = bittenKeyOf(b);
        if (!bitten.has(k)) {
            problems.push(fail('判据分支掉牙：' + b.rule + ' 的分支「' + b.fp +
                '」本次样本里一次都没报出（基线登记它有牙）⇒ 三种可能：缺陷已被修复（则收缩基线）、' +
                '分支判据被改软（则回滚）、样本被裁或数据源错位（则修）。★ 掉牙是静默事件，回放只会越变越绿，不许放过'));
        }
    }
    // ④ 基线在册：基线条目的指纹必须仍在静态分支集合里
    const staticKeys = new Set(branches.filter(b => b.fp).map(bittenKeyOf));
    for (const b of BITTEN_BASELINE) {
        const k = bittenKeyOf(b);
        if (!staticKeys.has(k)) {
            problems.push(fail('有牙基线腐烂：' + b.rule + ' 的指纹「' + b.fp +
                '」已不在静态分支集合中（规则改名 / msg 文案被改 / 分支被删）⇒ 基线静默失效，须同步更新'));
        }
    }
    // ⑤ 匹配率闸门
    const matchRate = firedTotal ? firedMatched / firedTotal : 1;
    if (firedTotal && matchRate < MIN_MATCH_RATE) {
        problems.push(fail('fired msg 匹配率掉到 ' + (matchRate * 100).toFixed(1) + '%（' + firedMatched + '/' +
            firedTotal + '，下限 ' + (MIN_MATCH_RATE * 100) + '%）⇒ 抽取口径与运行时 msg 已脱节，命中判定失真'));
    }

    // --- 报告 ---
    console.log('  · 本次命中（有牙）分支 ' + bitten.size + ' 条：');
    for (const k of bitten) console.log('      ✅ ' + k);
    console.log('  · 有牙基线 ' + BITTEN_BASELINE.length + ' 条（棘轮只许收缩）');
    console.log('  · 未命中分支 ' + (branches.length - noFp.length - bitten.size) +
        ' 条 —— 绝大多数是**回归哨兵本就不该触发**的正确形态，本自检刻意不把它们刷成噪声；' +
        '要证明「哨兵有牙」靠的是变异树取证（牙口矩阵），不是本自检');
    console.log('  · 无指纹（本自检裁定不到）' + noFp.length + ' 条 / 白名单 ' + NO_FP_WHITELIST.length + ' 条（只许收缩）');
    for (const w of NO_FP_WHITELIST) console.log('      - ' + w.file + ' · ' + w.rule + '  ' + w.why);
    console.log('  · fired msg ' + firedTotal + ' 条，匹配上静态指纹 ' + firedMatched + ' 条（' + (matchRate * 100).toFixed(1) + '%）');

    if (problems.length) {
        console.log('❌ 判据分支级空转自检失败（' + problems.length + ' 项）');
        process.exit(1);
    }
    console.log('✅ 判据分支级空转自检通过（5 项断言：规模闸门 3 / 无指纹白名单恰好相等 + 抽取率 / 有牙棘轮 / 基线在册 / 匹配率）');
    process.exit(0);
}

main();
