#!/usr/bin/env node
// tests/rule-teeth-evidence-selftest.mjs | V1.0.1 | 2026-10-25 第 133 轮
// V1.0.1 | 2026-10-25 第 122 轮·日间线：腐烂白名单收缩到 0（三条对不上号的证据全部复通）。
//        | ★ 本行由第 138 轮补登记：这次抬 VER 时没留机器可读日志行，而文件头部的旧写法
//        | 「文件名 | V1.0.0 | 日期」不被版本漂移自检认得 ⇒ 本文件的版本长期无人比对。
// V1.0.2 | 2026-10-26 第 138 轮：新增断言⑧「变异树结果新鲜度闸门」——详见下方第八章。
//        | 起因：第 137 轮开头发现结果文件比判据文件旧（源头是第 135 轮加 VER-HOLD-DECL），
//        | 也就是说「牙口结论配不上当前判据」长达数轮，而本自检的七条断言一条都没响，
//        | 体检单照样全绿。「陈旧」此前只有人工直连 `mutation-teeth.mjs --report` 才会硬失败，
//        | 自动化的对账项根本没接这根线。本轮把这道闸门接进体检的日常环路。
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
//   ⑧ **变异树结果新鲜度闸门（第 138 轮接上）**：上面七条**只查已 parse 出来的证据内容**，
//      一条都不查「这份证据配不配得上当前判据」。若结果文件变陈旧（判据文件被改 / 规则文件指纹变了
//      / 变异树重建过 / 覆盖不全），①到⑦照样可以对着一堆旧字符串核对得严丝合缝 ⇒ 全绿，
//      而结论讲的是上一版代码。复用 mutation-teeth 自己的新鲜度守卫（五项：判据 mtime / VER /
//      MUTFP / 规则指纹 RULEFP / 覆盖与树 mtime）—— **不复制它的判定逻辑**，直接跑它的人机出口
//      `--report`（陈旧即硬失败退 1），保证两边永远同一口径。第 137 轮实测的正是这个洞：
//      结果比判据旧了数轮，七条断言无一条有反应。
//
// 用法：node tests/rule-teeth-evidence-selftest.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanAllBranches, bittenKeyOf, findBranchByMsg } from './_lib/rule-branch-extract.mjs';
import { BITTEN_BASELINE, NO_FP_WHITELIST } from './rule-branch-idle-selftest.mjs';

export const VER = 'tests/rule-teeth-evidence-selftest.mjs V1.0.2';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(here);   // /workspace/repo（跑子进程时用，保证相对路径同样成立）
const EVIDENCE = path.join(here, '.mut', 'teeth-results.txt');

// --- 规模闸门（低于下限 ⇒ 证据已被裁剪，自检结论不可信）---
const MIN_MUT_BLOCKS = 40;    // 变异体块数（46 颗牙 + _base，这里只数 m-* 变异体）
const MIN_FAIL_ENTRIES = 150; // fail>0 的规则条目数
const MIN_EVID_MSGS = 400;    // 证据 msg 条数
const MIN_PARSE_RATE = 0.95;  // 证据可解析率（能匹配到当前静态指纹的比例）
const MIN_TEETH_BITTEN = 15;  // 变异树证出有牙的分支数
const MAX_AGG_BRANCHES = 6;   // 聚合型分支数（棘轮：只许收缩，详见断言⑦）

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

// --- 新鲜度闸门（断言⑧用）---
// 直接跑 mutation-teeth.mjs --report（读结果 + 套判据，不带 --out 故不写任何文件）：
//   退 0 = 结果配得上当前判据；退 1 = 已陈旧（退出前会把具体原因逐条打到 stdout）。
// ★ 为什么是「跑子进程」而不是「import 它的 checkFreshness」：
//   后者本文件一度考虑过，但要给 mutation-teeth.mjs 加 export ⇒ 改动判据文件本体
//   ⇒ 它的 mtime 立刻新于结果文件 ⇒ 新鲜度检查第①项当场判陈旧 ⇒ 反而得先重跑变异树才能收场；
//   而且 --report 是人自己复核时跑的同一个入口，用它等于把「体检看到的」与「人跑看到的」锁成一条。
function checkEvidenceFreshness() {
    const JUDGE = path.join(here, 'mutation-teeth.mjs');
    let r;
    try {
        r = spawnSync(process.execPath, [JUDGE, '--report'], {
            cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024
        });
    } catch (e) {
        return { ok: false, why: ['跑 mutation-teeth --report 失败：' + (e && e.message)] };
    }
    const out = ((r.stdout || '') + (r.stderr || '')).split('\n');
    if (r.status === 0) return { ok: true, why: [] };
    const why = out.filter(l => /陈旧|判据|指纹|覆盖|未重跑|重跑/.test(l)).slice(0, 6).map(l => l.trim());
    return { ok: false, why: why.length ? why : ['mutation-teeth --report 退 ' + r.status + '（原因行未捕获，见其原始输出）'] };
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
    const all = parseEvidence(txt);
    const mutBlocks = new Set(all.filter(e => e.mut && e.mut !== '_base').map(e => e.mut));
    // 有牙证据 = 变异体（排除干净树 _base）下 fail>0 的条目。
    // _base 报的红是"本来就有"的红（转交中规则），不证明"变异能被咬住"，故不计入有牙证据。
    const evid = all.filter(e => e.mut && e.mut !== '_base' && e.fail > 0);

    // --- 逐条对账：证据 msg -> 当前静态分支指纹 ---
    const byRuleFp = new Map();   // 证出有牙的分支 (file|rule|fp) -> 证据条数
    const rotten = new Map();     // 对不上号的证据 (规则|归一化msg) -> {rule,msg,n}
    const aggLoad = new Map();    // 聚合型分支 (file|rule|fp) -> 承载的归一化子病因数
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
                const gk = k;
                if (!aggLoad.has(gk)) aggLoad.set(gk, new Set());
                aggLoad.get(gk).add(normMsg(msg));
            } else {
                const rk = rottenKey({ rule: e.rule, msg });
                if (!rotten.has(rk)) rotten.set(rk, { rule: e.rule, msg, norm: normMsg(msg), n: 0 });
                rotten.get(rk).n++;
            }
        }
    }
    const parseRate = totalMsg ? parsedMsg / totalMsg : 0;
    const aggBranches = [...aggLoad.entries()].filter(([, s]) => s.size >= 2);

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

    // ⑧ 变异树结果新鲜度闸门：证据必须配得上当前判据，否则①到⑦核对得再齐也是过期结论。
    //    走 mutation-teeth 自己的 --report 出口（陈旧即退 1），不复制其判定，口径天然同源。
    const fres = checkEvidenceFreshness();
    if (!fres.ok) {
        problems.push(fail('变异树结果已陈旧（mutation-teeth --report 判陈旧）—— ①到⑦核对的是'
            + '上一版代码的牙口证据，其结论不代表当前代码：' + fres.why.join(' ▸ ') + '。'
            + '处置：重跑变异树取证（`--emit-prep` / `--emit-run` 三步），不许放宽本条或用 --allow-stale 蒙混'));
    }

    // ⑦ 聚合型分支棘轮（只许收缩）：本轮实测 6 条，最严重的 166 一条指纹承载 7 种子病因
    if (aggBranches.length > MAX_AGG_BRANCHES) problems.push(fail('聚合型分支数涨到 ' + aggBranches.length +
        ' 条（上限 ' + MAX_AGG_BRANCHES + '，棘轮只许收缩）⇒ 新出现的聚合型判据会把多种子病因' +
        '塞进一条指纹，掉其中任何一种都看不出来。须把子病因拆成各自独立的 fail 分支'));
    // ★ 单条聚合度只作**取证信息**输出、不判红：拆不拆、怎么拆属规则设计决策，须由用户拍板
    //   （拆了会改动 158 条分支的计数口径与既有基线的键，本自检不擅自替用户做这个决定）。
    const worstAgg = [...aggBranches].sort((a, b) => b[1].size - a[1].size)[0];

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
        ' 条 / 棘轮上限 ' + MAX_AGG_BRANCHES +
        (worstAgg ? '，最严重 ' + worstAgg[1].size + ' 种：' + worstAgg[0] : '') + '：');
    for (const [k, s] of aggBranches) console.log('      ⚠️ ' + k + '  承载 ' + s.size + ' 种子病因');
    console.log('  · 证据规模：变异体 ' + mutBlocks.size + ' / 有牙证据条目 ' + evid.length + ' / 证据 msg ' + totalMsg +
        '；可解析 ' + parsedMsg + ' 条（' + (parseRate * 100).toFixed(1) + '%）');
    console.log('  · 运行时有牙基线 ' + BITTEN_BASELINE.length + ' 条，其中被牙口证据佐证 ' +
        BITTEN_BASELINE.filter(b => byRuleFp.has(bittenKeyOf(b))).length + ' 条');
    console.log('  · 本自检只做静态证据对账，不跑变异树、不改任何判据、不重录任何证据');

    if (problems.length) {
        console.log('❌ 牙口证据链对账失败（' + problems.length + ' 项）');
        process.exit(1);
    }
    console.log('✅ 牙口证据链对账通过（8 项断言：证据规模 3 / 可解析率 / 腐烂棘轮 / 覆盖面 / 在册 / 运行时交叉验证 / 聚合型棘轮 / 结果新鲜度）· ' +
        files.length + ' 规则文件');
    process.exit(0);
}

main();
