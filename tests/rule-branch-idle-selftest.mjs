#!/usr/bin/env node
// tests/rule-branch-idle-selftest.mjs | V1.1.5 | 2026-11-07 第 189 棒（体检侧·MiniMax）：订正「142 是否登记回 BITTEN_BASELINE」的误解 + 补 A30 变异语义逐行核对
// V1.1.5 | 2026-11-07 第 189 棒（体检侧·MiniMax）：两件事，**基线值一字未动**（仍是 141 一条）：
//   ① 订正第 187 棒的一处误解（下方留痕里已写清）：第 187 棒交接说「全量刷新后再把 142
//      登记回 BITTEN_BASELINE」——这句是错的。断言③（:206-214）拿基线每条去 `bitten` 里查，
//      而 `bitten` 来自**干净树** rules-replay 落的 fired msg；142 的缺陷只存在于变异树里，
//      干净树里它一次都不报 ⇒ 登记进去会当场判「掉牙」红。142 的有牙证据归牙口证据链
//      （teeth-results.txt 的 A30 格 + 牙口矩阵.md），不归本基线。
//   ② 补 A30 的变异语义核对结论（modules/311 三处生生不息触发 + 严阵以待另一个注册，
//      A30 锚含 `, 12, ` ⇒ 只命中「回合开始」那一次；另外两处与严阵以待照旧）。
// V1.1.4 | 2026-11-07 第 187 棒：142 盲区补牙后留痕更新（基线值一字未动）
// V1.1.4 | 2026-11-07 第 187 棒（WorkBuddy）：第 186 棒留的「142 无牙证据、须补触发点牙」已由
//   mutation-teeth.mjs V2.9.27 的 A30 闭合，下方留痕同步换成「已补 + 待全量刷新」的真实状态。
//   ★ BITTEN_BASELINE 仍是 1 条（141），142 未重新登记：佐证来自 teeth-results.txt，而该产物
//     当前仍是 V2.9.25 / HEAD 6535f8a3（--report 四项指纹全不符）⇒ 现在登记等于让有牙基线
//     失去证据支撑。待全量重跑刷新后再登记，不许拿陈旧证据凑绿。
// V1.1.3 | 2026-11-07 第 186 棒（体检侧·MiniMax）：收缩 142 的「有牙」基线（证据见 BITTEN_BASELINE 下方留痕）
//
//
//   而两边都报绿，谁都看不出来）。属第 122 轮「收口为唯一来源」通规的同款应用。
//
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

export const VER = 'tests/rule-branch-idle-selftest.mjs V1.1.5';

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
    }
    // 2026-11-07 第二棒显式收缩：移除原「142-zhangsanfeng-endless-roundstart.js /
    //   复发：张三丰存活到终局，但第」条目（该条目 why 写的是「本分支持续报错 ⇒ 确实在咬」）。
    //   ★ 它当初登记的「持续报错」**全是假阳性**——不是缺陷复现，是规则自己的口径错。
    //   证据（仓库外独立 worktree D:/_hc_probe_20261107 实测，与主仓零接触）：
    //     ① 旧版 142（e5db701e 之前，V6.1.9，无 activeFrom）在本样本里报出的 msg 全是
    //        「第1/2/3/4/5/6/7回合开始环节缺少生生不息」「第1/2/3/4/5/6/7/8回合…」这一类，
    //        **缺席回合一律从第 1 回合起算**；
    //     ② 新版 142（e5db701e V6.1.11 补了在场起算回合 activeFrom）**同一份样本一条都不报**；
    //     ③ 两者唯一差别就是「排除 curRoundNo < activeFrom 的回合」⇒ 那批缺席回合 100% 是
    //        张三丰**进场前**的回合（众志成城可中途召唤，content characters 带 summon:true）。
    //        他还没上场，自然没有「回合开始即回血」可缺 ⇒ 报「缺少生生不息」是**误报**。
    //   ⇒ 这条分支在样本里从来没有过真牙：真缺陷（进场后仍缺生生不息）从未出现过。
    //     本基线自述「缺陷不再触发须显式收缩」，故移除；判定口径一字未改（missing>0 仍只对进场后回合计）。
    //   ★ 盲区已闭合（2026-11-07 第 187 棒补牙 + 第 189 棒全量刷新实证），两步 + 实证：
    //     ① 补牙：mutation-teeth.mjs V2.9.27 增 A30（ATTR），锚定 modules/311 的
    //        `eventBus.on(SIGNAL_TYPES.ON_ROUND_START, 12, (data) => {`，注入 `{ return;`
    //        ⇒ 回合开始那次生生不息不再推 fact，等价于 V6.1.8 删触发点的历史回归 bug。
    //        --verify 48 条锚全有效；锚串全文件恰好 1 处；替换后 node --check exit=0。
    //        ★ 语义核对（第 189 棒逐行核过）：modules/311 的生生不息共**三处**触发
    //          （:30 注释写明）—— 回合开始[免费]（ON_ROUND_START priority 12，:121-124）
    //          / 轮到自己[付费攻]（ON_UNIT_ACTED 50，:129-139）/ 八卦阵[付费攻]（:141 起）；
    //          严阵以待是另一个注册（ON_ROUND_START priority 45，:173）。
    //          A30 的锚含 `, 12, ` ⇒ 只命中第一处 ⇒ 另外两处照旧、严阵以待不受影响。
    //          即：只删掉「回合开始」那一次触发，正是 V6.1.8 的回归形态，变异语义正确。
    //     ② 撤过期豁免：本文件 L79 明规「收缩基线须同步 tests/known-transfers.md」，第 186 棒只
    //        收缩了 BITTEN_BASELINE、漏了同步 ⇒ 142 仍挂在 10-17 第 97 轮的转交清单里，变异树上
    //        它报红被标 ⚠️ 而**排除作证**。A30 首跑的「规则有牙」其实是别的规则顺带红凑的
    //        （作证名单里没有 142），差点把假牙当成闭环。今按规矩撤销该条豁免，
    //        141 根因未销、登记保留；判定阈值一字未改，只去掉一条过期豁免。
    //     ③ 实证（ONLY=A30 单树增量，约 40 秒）：_base 干净树 142 零报；m-A30 树
    //        142 ❌ fail=18（「第1回合开始环节缺少生生不息」）；
    //        --report 判「A30 ATTR 规则有牙」，且**142 已列进作证规则名单** ⇒ 这颗牙证的是 142 本身。
    //   ★★ 142 为什么**永远不该登记回 BITTEN_BASELINE**（第 189 棒订正第 187 棒的一处误解）：
    //     第 187 棒交接写的是「全量刷新后再把 142 登记回来」，**这句是错的，照做会把本自检弄红**。
    //     本基线的语义 = 「这条分支在**干净树**的本次样本里就会报红」——
    //     断言③（:206-214）拿基线每条去 `bitten` 里查，而 `bitten` 来自**干净树** rules-replay 落的
    //     fired msg（:146-152 spawn 的是主仓 rules-replay，不是变异树）。
    //     142 的缺陷（回合开始触发点被删）只存在于**变异树**里；干净树里它一次都不报
    //     （实测 142 在干净样本 pass=25 fail=0，规则本身照跑、不误报）。
    //     ⇒ 登记进去 = 断言③ 当场判「判据分支掉牙」红。
    //     ⇒ 142 的「有牙」证据该落在**牙口证据链**（tests/.mut/teeth-results.txt 的 A30 那一格 +
    //       tests/牙口矩阵.md），不落在这个基线。本基线只收「当前干净样本里真实存在缺陷的分支」
    //       （现仅 141 一条）。
    //   规则 142 本体仍照跑（未禁跑）；若真缺陷复现，分支会重新咬住，本自检无「禁止新增有牙」上限，届时不会误红。
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
