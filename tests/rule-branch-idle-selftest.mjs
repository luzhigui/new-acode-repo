#!/usr/bin/env node
// tests/rule-branch-idle-selftest.mjs | V1.1.2 | 2026-10-28 第 143 轮续6
//
// V1.1.2 变更（第 143 轮续6，**显式收缩有牙基线，判定口径一行未动**）：
//   移除 141 的「复发：张三丰存活到第」分支——它与「复发：严阵以待首次出现在第」互斥，
//   上游引擎变更后样本里严阵以待总会触发（只是回合数不对），「机制整个消失」不再出现 ⇒ 按基线自述收缩。
//   详见 BITTEN_BASELINE 内注释。
//
// V1.1.1 变更（第 133 轮，**纯重构，判定口径一行未动**）：
//   把静态抽取（stripCommentsKeepStrings / extractBranches / keyOf / bittenKeyOf / 命中判定）
//   搬到共享模块 tests/_lib/rule-branch-extract.mjs，本自检改为 import 它。
//   动因：第 133 轮新增的 rule-teeth-evidence-selftest（牙口证据链对账）必须用**同一套**口径，
//   若各自抄一份，两处口径必然分叉（一处收紧另一处没跟 ⇒ 同一分支在两个自检里结论不同，
//   而两边都报绿，谁都看不出来）。属第 122 轮「收口为唯一来源」通规的同款应用。
//
// V1.1.0 变更（第 132 轮，两处都是**收紧**，不是放宽）：
//   1) 抽取口径收紧：msg 表达式只取到本语句结束（含 msg 的那条 return 语句的第一个分号前）。
//      旧口径在 msg 是变量（如 `msg: bad`）时会向后多看几行、把**后续代码里的别的字符串**误当作
//      本分支的指纹 ⇒ 造出假指纹（第 132 轮实测：149 的 `msg: bad` 曾被误配成「复发：第」）。
//      假指纹比无指纹危险得多：它会让本自检**以为**自己能裁定这条分支，实际裁定的是别人的分支。
//   2) 新增断言⑥「指纹可区分性」：同一规则内任意两条分支的指纹不得相同、不得互为前缀。
//      命中判定是「fired msg 以某分支指纹为前缀则算该分支命中」，若两条分支指纹相同或互为前缀，
//      匹配会被先命中者抢走 ⇒ 分支级判定**静默退化成规则级**，而报告里照样写"分支级自检通过"。
//      （第 132 轮实测：改前 11 组重复 + 11 组前缀包含，涉及约 35 条分支，半数以上的分支级结论是假的。）
//   3) 无指纹分支白名单**清零**：第 132 轮给全部 10 条无指纹分支补上可区分的静态前缀后，
//      158 条分支指纹可抽取率 100%、盲区归零。白名单保留为空数组作棘轮：任何新增无指纹分支 ⇒ 立即判红，
//      **不得靠重新登记让它静默**（登记 = 承认盲区，补前缀 = 消灭盲区，后者才是对的做法）。
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
//   本自检                       盯「判据分支掉没掉牙」（运行时·分支级）；
//   rule-teeth-evidence-selftest 盯「牙口取证结论配不配得上当前代码」（证据链·分支级）
//   —— 四者互补，缺一都可能漏。
//
// ★ 判据分支的静态抽取口径**只有一个来源**：tests/_lib/rule-branch-extract.mjs（第 133 轮抽出来的）。
//   本自检与牙口证据链自检共用它 —— 各自抄一份必然分叉，一处收紧另一处没跟，
//   会出现「同一分支在两个自检里结论不同」而两边都报绿的幽灵事件。
//
// 用法：node tests/rule-branch-idle-selftest.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanAllBranches, keyOf, bittenKeyOf, findBranchByMsg } from './_lib/rule-branch-extract.mjs';

export const VER = 'tests/rule-branch-idle-selftest.mjs V1.1.2';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

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
export const BITTEN_BASELINE = [
    // V1.1.2（2026-10-28 第143轮续6）显式收缩：移除原「复发：张三丰存活到第」条目。
    //   该分支与「复发：严阵以待首次出现在第」**互斥**——前者=严阵以待整个没触发（机制消失），
    //   后者=触发了但回合数不对。上游引擎变更后，本 140 场样本里严阵以待**总会触发**（只是回合数不对 ⇒ 走后者），
    //   「机制整个消失」这个缺陷当前样本里不再出现 ⇒ 该分支持续不触发，按本基线自述「缺陷不再触发须显式收缩本基线」移除。
    //   规则 141 本体仍转交中（「严阵以待首次出现在第」分支仍在咬）；若将来「机制消失」缺陷复现，该分支会重新触发，
    //   本自检无「禁止新增有牙」上限，届时不会误红，需人工再评估是否重新登记。
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

// --- 无指纹分支白名单（棘轮：**恒空**，只许保持空）---
// 第 132 轮已把最后 10 条无指纹分支全部补上可区分的静态前缀（123 / 131 / 135 / 139 / 145×2 /
// 149 / 150 / 156 / 157）⇒ 158 条分支**全部可建立指纹**，盲区归零，本白名单随之清空。
// ★ 此后若再出现无指纹分支：**不要在下面登记**（那等于承认盲区并让它静默），
//   正确做法是给该分支的 msg 补一个可定位的静态前缀（见断言②的报错提示），让它变成可裁定的分支。
// ★ 本白名单保留为空数组，是为让断言②的「恰好相等」继续生效：任何新增无指纹分支都会立刻判红。
export const NO_FP_WHITELIST = [];

function fail(msg) {
    console.log('  ❌ ' + msg);
    return msg;
}

function main() {
    // --- 静态抽取（唯一来源：_lib/rule-branch-extract.mjs） ---
    const { files, branches } = scanAllBranches();

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
            const hit = findBranchByMsg(cands, m);
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

    // ⑥ 指纹可区分性（第 132 轮新增）：同一规则内，任意两条分支的指纹不得相同、不得互为前缀。
    //    命中判定是「fired msg 以某分支指纹为前缀 ⇒ 该分支命中」，指纹撞车或互为前缀时匹配会被
    //    先命中者抢走 ⇒ 分支级判定**静默退化成规则级**，而报告照样写"分支级自检通过"——这类假绿
    //    比无指纹更隐蔽，故单列一条断言常驻。
    const fpsByRule = new Map();
    for (const b of branches) {
        if (!b.fp) continue;
        if (!fpsByRule.has(b.rule)) fpsByRule.set(b.rule, []);
        fpsByRule.get(b.rule).push(b.fp);
    }
    let dupGroups = 0, prefixGroups = 0;
    for (const [rule, fps] of fpsByRule) {
        const uniq = [...new Set(fps)];
        const cnt = new Map();
        for (const fpx of fps) cnt.set(fpx, (cnt.get(fpx) || 0) + 1);
        for (const [fpx, c] of cnt) {
            if (c > 1) {
                dupGroups++;
                problems.push(fail('同规则内指纹重复：' + rule + ' 有 ' + c + ' 条分支共用指纹「' + fpx +
                    '」⇒ 命中判定只会记到其中一条，被抢的那条永久不可判定，须给它们各补可区分的静态前缀'));
            }
        }
        for (const a of uniq) {
            for (const b2 of uniq) {
                if (a === b2 || !b2.startsWith(a)) continue;
                prefixGroups++;
                problems.push(fail('同规则内指纹互为前缀：' + rule + ' 中「' + a + '」是「' + b2 +
                    '」的前缀 ⇒ 长那条分支永远匹配不到（被短的抢先），须把分叉点提前到静态前缀里'));
            }
        }
    }

    // --- 报告 ---
    console.log('  · 本次命中（有牙）分支 ' + bitten.size + ' 条：');
    for (const k of bitten) console.log('      ✅ ' + k);
    console.log('  · 有牙基线 ' + BITTEN_BASELINE.length + ' 条（棘轮只许收缩）');
    console.log('  · 未命中分支 ' + (branches.length - noFp.length - bitten.size) +
        ' 条 —— 绝大多数是**回归哨兵本就不该触发**的正确形态，本自检刻意不把它们刷成噪声；' +
        '要证明「哨兵有牙」靠的是变异树取证（牙口矩阵），不是本自检');
    console.log('  · 无指纹（本自检裁定不到）' + noFp.length + ' 条 / 白名单 ' + NO_FP_WHITELIST.length +
        ' 条（★ 第 132 轮已清零，此后新增无指纹分支即判红，不得重新登记）');
    for (const w of NO_FP_WHITELIST) console.log('      - ' + w.file + ' · ' + w.rule + '  ' + w.why);
    console.log('  · 指纹可区分性：重复 ' + dupGroups + ' 组 / 前缀包含 ' + prefixGroups + ' 组（均须为 0，' +
        '撞车会让分支级判定静默退化成规则级）');
    console.log('  · fired msg ' + firedTotal + ' 条，匹配上静态指纹 ' + firedMatched + ' 条（' + (matchRate * 100).toFixed(1) + '%）');

    if (problems.length) {
        console.log('❌ 判据分支级空转自检失败（' + problems.length + ' 项）');
        process.exit(1);
    }
    console.log('✅ 判据分支级空转自检通过（6 项断言：规模闸门 3 / 无指纹白名单恰好相等 + 抽取率 / 有牙棘轮 / 基线在册 / 匹配率 / 指纹可区分性）');
    process.exit(0);
}

// 被 import 时（第 133 轮的 rule-teeth-evidence-selftest 要复用 BITTEN_BASELINE / NO_FP_WHITELIST，
// 避免第二套登记 ⇒ 两套基线分叉）**不得执行 main**：否则会连带跑一遍回放、并提前 exit(0) 吞掉对方结论。
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
