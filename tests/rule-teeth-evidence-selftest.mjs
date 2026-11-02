#!/usr/bin/env node
// tests/rule-teeth-evidence-selftest.mjs | V1.0.5 | 2026-11-02（聚合型分支报告增强：对「需拆/严重」分支逐类列出结构模板与代表样本，使「拆哪几条」有凭有据；修正 V1.0.4 报告里残留的「166 仅 1 类换单位」错误旧注；新增 fmtAggBranch 共用打印，主路径与陈旧诊断段形态统一 · 前版 V1.0.4）
// tests/rule-teeth-evidence-selftest.mjs | V1.0.4 | 2026-11-02（断言⑧ 证据陈旧时也打印「聚合型分支清单」诊断：此前一陈旧就 EXIT 1、看不到哪 12 条在聚合/最严重那条塞 19 种子病因，用户无从拍板拆；四张表抽成 computeTeethMaps 与主判定共用，杜绝两处复算漂移 · 前版 V1.0.3@第173轮）
// tests/rule-teeth-evidence-selftest.mjs | V1.0.3 | 2026-11-01（断言⑦加单条聚合度峰值硬上限 SINGLE_AGG_CAP，堵“合并分支骗过总数”绕过；报告增严重度标注 · 前版 V1.0.2@第142轮）
// 补断言⑧结果新鲜度闸门：直接调 mutation-teeth --report 人机关口，陈旧即 EXIT 1，七条断言全绿也拦下
//
// 盯的是**牙口取证结论配不配得上当前代码**（证据链 · 分支级）。
//
// 为什么要有它（第 132 轮点名的下轮目标，动机务必先读）：
//   rule-branch-idle-selftest 只钉住「曾经咬过的分支」—— 158 条判据分支里只有 4 条在日常样本里命中，
//   其余 154 条是**回归哨兵本就不该触发**的正确形态，本自检按第 131 轮的取舍不把它们刷成噪声。
//   那这 154 条哨兵「有牙还是没牙」靠什么证明？靠**变异树取证**（46 颗牙，牙口矩阵）。
//   ⇒ 牙口矩阵是这 154 条哨兵唯一的牙口证据来源，是整个分支级判定体系的**证据地基**。
//
// 缺口（第 133 轮取证实测，非常隐蔽）：
//   这份证据地基正在悄悄腐烂，而**没有任何东西在盯它**：
//     · 牙口证据文件 teeth-results.txt 是第 127 轮（HEAD=e93c6e7）的产物；
//     · 之后 129 轮、132 轮各改了 21 个规则文件（132 轮把 147 拒马、148 carry 等的 msg 文案
//       分叉点提前到静态前缀里）；
//     · 后果：证据里记录的那些 msg 在**当前**规则文件里已经找不到对应的分支指纹 ⇒ 牙口结论不可复现；
//     · 而 mutation-teeth 自带的新鲜度守卫四项检查（判据文件 mtime / VER / MUTFP / 覆盖 / 树 mtime）
//       **一项都盯不到规则文件被改** ⇒ 牙口矩阵文档顶上至今写着「新鲜度守卫：通过」。
//   ★ 这是第 128 轮立的通规「白名单型 / 静默判据都是回放盲区」的又一次应验，且这次烂的是证据本身。
//
// 本自检不做 mtime 比较（mtime 会被 touch / git checkout 刷新 ⇒ 假阳性；且 mtime 只能说"可能变了"，
//   说不出"哪条结论作废了"）。改做**实质对账**：拿证据里的每条 msg 到当前规则文件里找对应分支指纹，
//   找不到就是这条牙口结论**真的对不上号了**，能精确到"哪条规则、哪个子病因"。
//
// 口径（复用，不另造）：
//   · 静态分支抽取：与 rule-branch-idle-selftest 共用 tests/_lib/rule-branch-extract.mjs（唯一来源）；
//   · 有牙基线 / 无指纹白名单：直接 import 那边的 BITTEN_BASELINE / NO_FP_WHITELIST，不抄第二份；
//   · 证据解析：读 tests/.mut/teeth-results.txt 的 REPLAY 段（机器可读，格式由 rules-replay.mjs 产出）。
//
// 七条断言：
//   ① 证据规模闸门（变异体块数 / fail>0 条目数 / 证据 msg 条数）—— 防证据文件被裁后自检恒绿
//   ② 证据可解析率闸门：证据 msg 能匹配到当前静态分支指纹的比例下限
//   ③ **牙口证据腐烂棘轮（本自检的核心）**：对不上号的证据（按 规则|归一化msg 去重登记）
//      **恰好等于**白名单集合，只许收缩 —— 新增腐烂即红，白名单里已复通的也要红（提示收缩）
//   ④ 牙口覆盖面棘轮：变异树证出有牙的分支数下限（防牙口取证退化后"证不出牙"还照样绿）
//   ⑤ 牙口证据涉及的**规则名**必须仍在当前规则集合中（防规则改名 / 被删后证据整体悬空）。
//      与③分工：③逐条查指纹（规则还在但串对不上），⑤查规则名本身（规则整个没了）——互不重叠。
//      ★ 本条最初写成了「遍历证出有牙的分支、检查它是否在静态集合里」⇒ 那是**死断言**
//        （键就是从静态集合里 find 出来的，必然在册，永远报不了）。第 133 轮验牙时抓出来改掉了。
//   ⑥ 运行时 ↔ 牙口 交叉验证：日常有牙基线的每条都必须得到牙口证据佐证
//      （咬着的 4 条若牙口没证过 ⇒ 两套口径已经分叉，必有一套是假的）
//   ⑦ **聚合型分支棘轮（本轮新发现的盲区类型）**：一条指纹承载 ≥2 种子病因的分支数有上限。
//      这类分支是分支级判定的**黑洞**：166 一条指纹下挤了 7 种子病因，其中 6 种的判据掉了牙，
//      只要还有 1 种在报，rule-branch-idle 就照旧判定它有牙 ⇒ 假绿，且比第 132 轮的
//      指纹撞车更隐蔽（撞车是退化到规则级，这个是**退化到"还有别的在报"**）。
//      棘轮方向：只许收缩，新增一条即红（提示必须把子病因拆成独立分支）。
//
// 用法：node tests/rule-teeth-evidence-selftest.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { scanAllBranches, bittenKeyOf, findBranchByMsg } from './_lib/rule-branch-extract.mjs';
import { BITTEN_BASELINE, NO_FP_WHITELIST } from './rule-branch-idle-selftest.mjs';

// ★ V1.0.3 的 VER 常量由本轮（夜间第 173 轮）补齐：上游 dd099cb0「全仓文件按目录重编号」把本件
//   头版本日志抬到 V1.0.3（加了断言⑦单条聚合度峰值硬上限 SINGLE_AGG_CAP），却漏抬本 VER 常量，
//   于是「版本常量漂移自检」与「版本号遗忘抬升绊线」双双报红。★ 这与本线第 172 轮自踩同款
//   （抬了日志漏了常量），区别只是这次是上游会话犯的 —— 绊线照样当场咬住，不是只盯自己人。
export const VER = 'tests/rule-teeth-evidence-selftest.mjs V1.0.5';

const here = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE = path.join(here, '.mut', 'teeth-results.txt');

// --- 规模闸门（低于下限 ⇒ 证据已被裁剪，自检结论不可信）---
const MIN_MUT_BLOCKS = 40;    // 变异体块数（46 颗牙 + _base，这里只数 m-* 变异体）
const MIN_FAIL_ENTRIES = 150; // fail>0 的规则条目数
const MIN_EVID_MSGS = 400;    // 证据 msg 条数
const MIN_PARSE_RATE = 0.95;  // 证据可解析率（能匹配到当前静态指纹的比例）
const MIN_TEETH_BITTEN = 15;  // 变异树证出有牙的分支数
const MAX_AGG_BRANCHES = 6;   // 聚合型分支数（棘轮：只许收缩，详见断言⑦）
const SINGLE_AGG_CAP = 20;    // 单条聚合度硬上限（防“合并分支骗过总数”的绕过：把多条聚合分支并成 1 条超大分支，
                              //   总数可降到 6 以内转绿，但单条黑洞反而更严重；166 当前已 19，留 1 档缓冲）

// --- 牙口证据腐烂白名单（棘轮：只许收缩）---
// 每条 = 证据里**对不上当前静态分支指纹**的 (规则名|归一化msg)。
// 第 133 轮首次取证实测 3 条，成因分两类，都已逐条坐实：
//   A 文案被改型（143 九阳、154 生生不息加攻）：129/132 轮把分支 msg 的分叉点提前到静态前缀里，
//     证据里留的是旧文案 ⇒ 旧串不再以任何现行指纹开头。判据本身没变，变的是**文案**，
//     于是牙口结论（"T10 咬住了 143 的落地期望分支"）在当前代码上**无法复现**。
//   B 聚合外壳型（135 破防）：135 用 msgs.join(' | ') 把多条子明细合成一条 msg，
//     分支级只看到 1 个聚合外壳指纹，证据里的 3 条子明细一条都定位不到 ⇒ 子病因不可分辨。
// ★ 处置口径：**不修数据、不重录证据**（那等于把证据改成配得上代码，方向反了）。
//   正确处置是**重跑变异树取证**（46 颗牙重新跑一遍），复通后本白名单自然收缩。
// ★ 白名单的意义是让腐烂**可见且不新增**：第 4 条一出现立刻判红，不许让它悄悄烂过去。
const ROTTEN_WHITELIST = [
    // 2026-10-25 第 122 轮·日间线：收缩到 0 条。
    //   第 133 轮登记的 3 条（143 九阳 / 154 生生不息 / 135 破防，成因 A 文案被改型×2 + B 聚合外壳×1）
    //   在本轮「重跑变异树取证」后**全部复通**——本轮日间线修了回放器「妹永久海克斯继承」保真度缺口
    //   （rules-replay V6.7.2），战斗样本行为随之改变，重跑生成的证据全部能以现行指纹定位，
    //   自检③复通棘轮如设计预期报警（「白名单条目已复通 ⇒ 必须同步收缩」）⇒ 按第 133 轮注释
    //   「重跑变异树后须收缩本条」清空。沿革：3 条（第 133 轮）→ 0 条（第 122 轮·日间线）。
    //   ★ 若日后再出现「新增对不上号」，按 133 轮口径三选一：改回文案 / 拆聚合外壳 / 重跑变异树；
    //     重申：不修数据、不重录证据（那等于把证据改成配得上代码，方向反了）。
];

// 连续数字归一化（26/22/190/12% 等实测值差异不应造成多条重复登记）
function normMsg(m) { return m.replace(/\d+/g, '#'); }
function rottenKey(e) { return e.rule + '|' + normMsg(e.msg); }

// V1.0.4：结构模板归一 —— 中文串与数字都抹成占位符，用来区分「多种子病因」到底是哪一种：
//   · 抹完只剩 1 类 = 同一句话换了单位/数量（疑似实例差异，拆了也只多几条无关分支）；
//   · 抹完仍多类 = 真的结构不同的病因（该拆）。
//   典型 166：19 种按 structKey 归并后是 **7 类**（真多种病因，该拆；不是「换单位」造成的虚高）—— 详见报告段逐类输出。
function structKey(m) { return m.replace(/[\u4e00-\u9fa5]+/g, '◆').replace(/\d+/g, '#'); }

// V1.0.5：把一个聚合分支的「结构模板类」渲染成多行文本 —— main 报告段与「陈旧诊断」段共用，避免两处各写一套导致输出形态分叉。
//   对「需拆/严重」(sset>=3) 分支：逐类列出结构模板 + 代表样本（此前只混排 3 条，看不出 166 的 7 类各自长什么样，拆哪条无据可依）；
//   其余（观察/实例差异）：仍给 3 条混排样本。marker 默认 ⚠️，陈旧诊断段传 '·' 以区别主路径。
function fmtAggBranch(k, s, indent, marker) {
    marker = marker || '⚠️';
    const ss = [...s];
    const structMap = new Map(); // structKey 模板 -> 代表样本（取首次出现）
    for (const m of ss) { const t = structKey(m); if (!structMap.has(t)) structMap.set(t, m); }
    const sset = new Set(structMap.keys());
    const sev = sset.size >= 10 ? '严重黑洞·优先拆' : (sset.size >= 3 ? '需拆' : (sset.size >= 2 ? '观察' : '实例差异·不必拆'));
    const lines = [];
    lines.push(indent + marker + ' ' + k + ' —— ' + s.size + ' 种子病因 [结构模板 ' + sset.size + ' 类] [' + sev + ']');
    if (sset.size >= 3) {
        let i = 0;
        for (const [t, m] of structMap) {
            i++;
            lines.push(indent + '   类' + i + ' [' + t + '] ← 「' + m.slice(0, 50) + (m.length > 50 ? '…' : '') + '」');
        }
    } else if (ss.length) {
        lines.push(indent + '   样本：' + ss.slice(0, 3).map(x => '「' + x.slice(0, 42) + (x.length > 42 ? '…' : '') + '」').join(' / '));
    }
    return lines.join('\n');
}

// 从证据 msg 算出四张表 —— main 与「陈旧诊断」共用（提取出来避免两处复刻漂移）。
// ★ V1.0.4（2026-11-02）：抽出来是为了让断言⑧（结果新鲜度闸门）在**证据陈旧**时也能把
//   「聚合型分支清单」打印出来。此前证据一陈旧，断言⑧ 直接 EXIT 1，连哪 12 条在聚合、
//   最严重那条塞了 19 种子病因都看不到 ⇒ 用户无从拍板拆哪条，只能先花 30 分钟重跑取证。
//   诊断与主判定共用同一份计算，杜绝「两处各算一套、结论分叉」。（提取自 main 原 L183-209，逻辑逐字照搬）
function computeTeethMaps(evid, branches) {
    const byRuleFp = new Map();   // 证出有牙的分支 (file|rule|fp) -> 证据条数
    const rotten = new Map();     // 对不上号的证据 (规则|归一化msg) -> {rule,msg,n}
    const aggLoad = new Map();    // 聚合型分支 (file|rule|fp) -> 承载的归一化子病因集合
    let totalMsg = 0, parsedMsg = 0;
    for (const e of evid) {
        const cands = branches.filter(b => b.rule === e.rule);
        for (const raw of e.msgs) {
            totalMsg++;
            const msg = stripLoc(raw);
            const hit = findBranchByMsg(cands, msg);
            if (hit) {
                parsedMsg++;
                const k = bittenKeyOf(hit);
                byRuleFp.set(k, (byRuleFp.get(k) || 0) + 1);
                // 聚合型检测：同一条分支指纹承载了多条**不同**的归一化子病因
                if (!aggLoad.has(k)) aggLoad.set(k, new Set());
                aggLoad.get(k).add(normMsg(msg));
            } else {
                const rk = rottenKey({ rule: e.rule, msg });
                if (!rotten.has(rk)) rotten.set(rk, { rule: e.rule, msg, norm: normMsg(msg), n: 0 });
                rotten.get(rk).n++;
            }
        }
    }
    const aggBranches = [...aggLoad.entries()].filter(([, s]) => s.size >= 2);
    return { byRuleFp, rotten, aggLoad, aggBranches, totalMsg, parsedMsg };
}

// ⑧ 结果新鲜度闸门（第139轮 item ③ 延伸 / 第138轮夜检点名）：
//    本自检七条断言对账的"证据地基" teeth-results.txt，若比当前判据/引擎源码陈旧，
//    则七条全绿也是假的（证据是旧的）。mutation-teeth --report 自带 ENGFP/MUTFP 鲜度守卫，
//    陈旧即 EXIT 1 —— 直接调这个人机出口，陈旧就在这里拦下，逼着重跑变异树取证刷新。
//    不 import checkFreshness：import 会改本判据文件 mtime ⇒ 新鲜度检查第①项反而当场判陈旧 ⇒ 死循环。
//    --allow-stale：陈旧时只告警不拦（供临时看旧结论；run-all 不传，--quick 也要保持严格）。
function checkEvidenceFreshness() {
    const allowStale = process.argv.includes('--allow-stale');
    const reportArgv = [path.join(here, 'mutation-teeth.mjs'), '--report'];
    try {
        execFileSync('node', reportArgv, {
            cwd: path.resolve(here, '..'), encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return; // 新鲜，放行
    } catch (e) {
        const errTxt = ((e.stdout || '') + '\n' + (e.stderr || '')).trim();
        if (allowStale && /陈旧|stale|ENGFP|MUTFP/i.test(errTxt)) {
            console.log('  ⚠️ 牙口证据结果已陈旧（引擎/变异表已变），因 --allow-stale 放行——七条断言即便全绿也基于过期证据，须重跑变异树取证刷新');
            return;
        }
        console.log('❌ 牙口证据结果已陈旧，须重跑变异树取证刷新 ' + EVIDENCE + '：');
        console.log(errTxt.split('\n').slice(0, 14).map(l => '    ' + l).join('\n'));
        // V1.0.4 诊断增强：即使证据陈旧，也把「聚合型分支清单」打出来——否则断言⑧ 一拦就看不到哪几条该拆。
        //   只在陈旧路径额外算一遍（证据仍可读，只是配不上当前代码），不污染主路径；算不出就静默跳过，不阻断闸门。
        try {
            const evid = parseEvidence(fs.readFileSync(EVIDENCE, 'utf8')).filter(e => e.mut && e.mut !== '_base' && e.fail > 0);
            const { branches } = scanAllBranches();
            const { aggBranches } = computeTeethMaps(evid, branches);
            const sorted = [...aggBranches].sort((a, b) => b[1].size - a[1].size);
            if (sorted.length) {
                console.log('    [诊断·陈旧证据下仍可用] 聚合型分支（一条指纹承载多种病因，掉任一种都看不出）共 ' + sorted.length + ' 条：');
                for (const [k, s] of sorted.slice(0, 20)) {
                    console.log(fmtAggBranch(k, s, '      ', '·'));
                }
            }
        } catch (_) { /* 证据不可读/结构异常时跳过诊断，不阻断主闸门 */ }
        console.log('    处置：node tests/mutation-teeth.mjs --emit-prep > tests/.mut/prep.sh && bash tests/.mut/prep.sh && node tests/mutation-teeth.mjs --emit-run > tests/.mut/run.sh && bash tests/.mut/run.sh');
        process.exit(1);
    }
}

// --- 解析证据文件（格式由 rules-replay.mjs 产出，见其 tag 行与 msgs 行）---
//   ⚠️ |❌|✅|⏭  <规则名>  pass=N fail=M skip=K  【已转交·等主代码】(可选)
//         <msg 行，6 空格缩进，形如 [seed=S stage=G] 复发：…>
function parseEvidence(txt) {
    const lines = txt.split('\n');
    const entries = [];
    let curMut = null;
    for (let i = 0; i < lines.length; i++) {
        const L = lines[i];
        const mm = L.match(/^#####\s+MUT\s+(\S+)\s+#####/);
        if (mm) { curMut = mm[1]; continue; }
        const m = L.match(/^(?:❌|⚠️\s|✅|⏭\s)\s*(.+?)\s+pass=(\d+)\s+fail=(\d+)\s+skip=(\d+)/);
        if (!m) continue;
        const msgs = [];
        for (let j = i + 1; j < lines.length && /^\s{6}\S/.test(lines[j]); j++) msgs.push(lines[j].trim());
        entries.push({ mut: curMut, rule: m[1], pass: +m[2], fail: +m[3], skip: +m[4], msgs });
        i += msgs.length;
    }
    return entries;
}

// 剥掉证据 msg 的 [seed=.. stage=..] 定位前缀（定位信息不参与指纹匹配）
function stripLoc(raw) {
    const m = raw.match(/^\[seed=\d+\s+stage=\d+\]\s*(.*)$/);
    return m ? m[1] : raw;
}

function fail(msg) {
    console.log('  ❌ ' + msg);
    return msg;
}

function main() {
    // --- 静态抽取（唯一来源）---
    const { files, branches } = scanAllBranches();

    // --- 证据解析 ---
    if (!fs.existsSync(EVIDENCE)) {
        console.log('❌ 牙口证据链对账失败：找不到变异树结果文件 ' + EVIDENCE +
            ' ⇒ 46 颗牙的牙口结论无据可查，分支级判定失去证据地基（须先跑变异树取证）');
        process.exit(1);
    }
    const txt = fs.readFileSync(EVIDENCE, 'utf8');
    // ⑧ 结果新鲜度闸门：必须在七条断言之前——结果若陈旧，七条对的内容也是假的
    checkEvidenceFreshness();
    const all = parseEvidence(txt);
    const mutBlocks = new Set(all.filter(e => e.mut && e.mut !== '_base').map(e => e.mut));
    // 有牙证据 = 变异体（排除干净树 _base）下 fail>0 的条目。
    // _base 报的红是"本来就有"的红（转交中规则），不证明"变异能被咬住"，故不计入有牙证据。
    const evid = all.filter(e => e.mut && e.mut !== '_base' && e.fail > 0);

    // --- 逐条对账：证据 msg -> 当前静态分支指纹（四张表由 computeTeethMaps 统一算，与陈旧诊断共用） ---
    const { byRuleFp, rotten, aggLoad, aggBranches, totalMsg, parsedMsg } = computeTeethMaps(evid, branches);
    const parseRate = totalMsg ? parsedMsg / totalMsg : 0;

    console.log('=== 牙口证据链对账（' + mutBlocks.size + ' 变异体 / ' + evid.length + ' 条有牙证据 / ' +
        totalMsg + ' 条证据 msg ⇒ 证出有牙分支 ' + byRuleFp.size + ' 条，对不上号 ' + rotten.size + ' 条）===');

    const problems = [];

    // ① 证据规模闸门（3 项）
    if (mutBlocks.size < MIN_MUT_BLOCKS) problems.push(fail('变异体块数掉到 ' + mutBlocks.size + '（下限 ' +
        MIN_MUT_BLOCKS + '）⇒ 牙口取证已被裁剪，本自检与牙口结论双双失去地基'));
    if (evid.length < MIN_FAIL_ENTRIES) problems.push(fail('有牙证据条目数掉到 ' + evid.length + '（下限 ' +
        MIN_FAIL_ENTRIES + '）⇒ 变异体大面积证不出牙，取证结果疑似被裁'));
    if (totalMsg < MIN_EVID_MSGS) problems.push(fail('证据 msg 条数掉到 ' + totalMsg + '（下限 ' +
        MIN_EVID_MSGS + '）⇒ 结果文件疑似被截断'));

    // ② 证据可解析率闸门
    if (parseRate < MIN_PARSE_RATE) problems.push(fail('证据可解析率掉到 ' + (parseRate * 100).toFixed(1) +
        '%（' + parsedMsg + '/' + totalMsg + '，下限 ' + (MIN_PARSE_RATE * 100) + '%）⇒ ' +
        '证据与当前规则文件大面积脱节，牙口结论整体可疑，须重跑变异树'));

    // ③ 牙口证据腐烂棘轮（核心）：对不上号的集合 恰好等于 白名单，只许收缩
    const rottenKeys = new Set(rotten.keys());
    const wlKeys = new Set(ROTTEN_WHITELIST.map(w => w.rule + '|' + w.norm));
    for (const k of rottenKeys) {
        if (!wlKeys.has(k)) problems.push(fail('新增对不上号的牙口证据（不在白名单）：' + k +
            ' ⇒ 这条牙口结论在当前代码上无法复现。三选一：改回文案 / 拆掉聚合外壳 / 重跑变异树，**不许静默放行**'));
    }
    for (const k of wlKeys) {
        if (!rottenKeys.has(k)) problems.push(fail('白名单条目已复通：' + k +
            ' ⇒ 它又有指纹可定位了，白名单必须同步收缩，防腐烂条目挂着骗人'));
    }

    // ④ 牙口覆盖面棘轮
    if (byRuleFp.size < MIN_TEETH_BITTEN) problems.push(fail('变异树证出有牙的分支掉到 ' + byRuleFp.size +
        ' 条（下限 ' + MIN_TEETH_BITTEN + '）⇒ 牙口取证退化，154 条哨兵的牙口失去证据'));

    // ⑤ 牙口证据涉及的**规则名**必须仍在当前规则集合中（防规则改名 / 被删后证据整体悬空）。
    //    ★ 注意与断言③的分工：③ 逐条 msg 查指纹（"规则还在，但这条串对不上号了"）；
    //      ⑤ 查规则名本身（"这条规则整个没了"）。二者互不重叠，缺一都会漏。
    //    ★ 第 133 轮验牙时这里曾写成「遍历 byRuleFp 检查是否在静态集合中」—— 那是**死断言**：
    //      byRuleFp 的键就是从当前静态集合里 find 出来的，必然在册，永远不可能报。
    //      一个永远绿的断言比没有断言更坏（它让"7 项断言"这个数字掺水，且属于典型的假绿）。
    const staticRuleNames = new Set(branches.map(b => b.rule).filter(Boolean));
    const evidRuleNames = new Set(evid.map(e => e.rule));
    for (const rn of evidRuleNames) {
        if (!staticRuleNames.has(rn)) problems.push(fail('牙口证据指向的规则已消失：' + rn +
            ' ⇒ 变异树证过它有牙，但当前规则文件里已没有这条规则（被删 / 改名）⇒ 它的牙口结论整体作废'));
    }

    // ⑥ 运行时 ↔ 牙口 交叉验证：日常咬着的分支，牙口也必须证过
    for (const b of BITTEN_BASELINE) {
        const k = bittenKeyOf(b);
        if (!byRuleFp.has(k)) problems.push(fail('运行时有牙但牙口没证过：' + k +
            ' ⇒ 日常样本里它在咬，变异树却没证到它 ⇒ 两套口径已分叉，必有一套是假的'));
    }

    // ★ 单条聚合度峰值（最严重那条）先算：断言⑦双闸与报告段都要用（须置于断言⑦之前，避免 TDZ）
    const worstAgg = [...aggBranches].sort((a, b) => b[1].size - a[1].size)[0];

    // ⑦ 聚合型分支棘轮（只许收缩）：本轮实测 6 条，最严重的 166 一条指纹承载 7 种子病因
    //   ★ 双闸：总数超限 OR 单条峰值超限。后者堵“合并分支骗过总数”的绕过——
    //     有人把多条聚合分支并成 1 条超大分支，总数可降到 6 以内转绿，但单条黑洞反而更严重。
    const aggTotalOver = aggBranches.length > MAX_AGG_BRANCHES;
    const aggPeakOver = worstAgg && worstAgg[1].size > SINGLE_AGG_CAP;
    if (aggTotalOver || aggPeakOver) {
        let why = '聚合型分支';
        if (aggTotalOver) why += '数涨到 ' + aggBranches.length + ' 条（上限 ' + MAX_AGG_BRANCHES + '，棘轮只许收缩）';
        if (aggPeakOver) why += (aggTotalOver ? '；' : '') + '单条聚合度峰值达 ' + worstAgg[1].size
            + ' 种（上限 ' + SINGLE_AGG_CAP + '，堵“合并分支骗过总数”的绕过：把多条并成 1 条超大分支，总数可压到 6 内转绿但黑洞更严重）';
        problems.push(fail(why + ' ⇒ 多种子病因塞进一条指纹，掉其中任何一种都看不出来。须把子病因拆成各自独立的 fail 分支'));
    }
    // ★ 单条聚合度原则上只作取证信息输出；仅当超过硬上限 SINGLE_AGG_CAP 时才作为防绕过双闸判红。
    //   拆不拆、怎么拆属规则设计决策，须由用户拍板（拆了会改动 158 条分支的计数口径与既有基线的键，本自检不擅自替用户做这个决定）。

    // --- 报告 ---
    console.log('  · 证出有牙分支 ' + byRuleFp.size + ' 条（棘轮下限 ' + MIN_TEETH_BITTEN + '）：');
    for (const [k, n] of [...byRuleFp.entries()].sort((a, b) => b[1] - a[1])) {
        console.log('      ✅ ' + k + '  （' + n + ' 条证据）');
    }
    console.log('  · 对不上号的牙口证据 ' + rotten.size + ' 条 / 白名单 ' + ROTTEN_WHITELIST.length + ' 条（棘轮只许收缩）：');
    for (const r of rotten.values()) {
        console.log('      ⚠️ ' + r.rule + '  「' + r.norm.slice(0, 60) + (r.norm.length > 60 ? '…' : '') + '」×' + r.n);
    }
    console.log('  · 聚合型分支（一条指纹承载 ≥2 种子病因 ⇒ 掉其中任何一种都看不出来）' + aggBranches.length +
        ' 条 / 棘轮总数上限 ' + MAX_AGG_BRANCHES + ' / 单条峰值上限 ' + SINGLE_AGG_CAP +
        (worstAgg ? '，最严重 ' + worstAgg[1].size + ' 种：' + worstAgg[0] : '') + '：');
    const sortedAgg = [...aggBranches].sort((a, b) => b[1].size - a[1].size);
    for (const [k, s] of sortedAgg) {
        // V1.0.5：需拆/严重分支逐类列结构模板与代表样本（此前只混排 3 条，看不出 166 的 7 类各自长什么样，拆哪条无据可依）。
        console.log(fmtAggBranch(k, s, '      '));
    }
    console.log('  · 证据规模：变异体 ' + mutBlocks.size + ' / 有牙证据条目 ' + evid.length + ' / 证据 msg ' + totalMsg +
        '；可解析 ' + parsedMsg + ' 条（' + (parseRate * 100).toFixed(1) + '%）');
    console.log('  · 运行时有牙基线 ' + BITTEN_BASELINE.length + ' 条，其中被牙口证据佐证 ' +
        BITTEN_BASELINE.filter(b => byRuleFp.has(bittenKeyOf(b))).length + ' 条');
    console.log('  · 本自检只做静态证据对账，不跑变异树、不改任何判据、不重录任何证据');

    if (problems.length) {
        console.log('❌ 牙口证据链对账失败（' + problems.length + ' 项）');
        process.exit(1);
    }
    console.log('✅ 牙口证据链对账通过（7 项断言：证据规模 3 / 可解析率 / 腐烂棘轮 / 覆盖面 / 在册 / 运行时交叉验证 / 聚合型棘轮）· ' +
        files.length + ' 规则文件');
    process.exit(0);
}

main();
