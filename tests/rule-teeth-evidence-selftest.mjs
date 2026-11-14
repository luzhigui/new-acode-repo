#!/usr/bin/env node
// V1.0.14 | 2026-11-14 #9 引擎依赖体检脚本脏树前置守卫：main() 开头挂 tests/_lib/worktree-guard.mjs 的 checkWorktreeClean，工作树有未提交改动或 HEAD≠远端稳定 tip 时显式告警并 exit(1)，禁止在叠 WIP 的主树上下「恒空转/假绿/覆盖不足」结论（#3 脏树 skip=156 误判教训）。判据阈值一字未动。
// V1.0.13 | 2026-11-13 环境依赖处置（按体检交接 spec 选项②）：teeth-results.txt 由变异树取证产出、被 .gitignore 排除、
//   CI checkout 里永远不存在 ⇒ 此前在 push 门禁下恒红（属「环境缺失」而非「判据失败」）。改为「产物缺失时显式跳过
//   （exit 0）并打 loud 警告」：CI 不跑此项、本地有产物时仍全量校验；不削弱任何判据、不降阈值、不静默放行。
// V1.0.12 | 2026-11-10 白天迭代：给 aggNormMsg 补双向负路径自证。
//   该函数是「聚合型分支」判定的唯一归一化入口，V1.0.5→V1.0.11 连改 6 版口径却零自证；
//   最坏情形是它退化成恒等映射 —— 所有 msg 归一成同一个 rk、聚合分支全塌，
//   MAX_AGG_BRANCHES / SINGLE_AGG_CAP 反而全绿，没有任何东西会报。
//   本轮新增 selfCheckAggNorm（纯内存、不读证据文件），main 每轮先跑：
//   该合并的噪声必须合并，真不同病因必须仍能分开，出口标签必须保住，6 个不同病因不许塌成 <5 个键。
//   未改 aggNormMsg 一行实现、未动三个阈值、未动 findBranchByMsg / rottenKey 口径。
// tests/rule-teeth-evidence-selftest.mjs | V1.0.11 | 2026-11-10 夜间第 202 轮：aggNormMsg 补一手「出口标签保护」—— 158 按「哪处文案」把「不同源」拆成两个出口后，出口名挂在 msg 的【嗜血狂刀吸血】/【青翼蝠王】上，但本函数第 ①②步把中文实体名一律抹成 ◆，标签里的字被一起吃成【◆】，两个出口塌成一个；剩下的差异只剩样例正文句式，被数成「2 种子病因」—— 那是把拆出口的成果又抹平了。只保护【…】内的字母与中文（数字仍抹 #，与 normMsg 同口径），标签外的抹除口径一字不动。MAX_AGG_BRANCHES=6 / SINGLE_AGG_CAP=20 / MIN_PARSE_RATE=0.95 三阈值一字未动，findBranchByMsg 与 rotten 键口径同样未动。
// tests/rule-teeth-evidence-selftest.mjs | V1.0.7 | 2026-11-10 夜间第 201 轮：aggNormMsg 补一手「计数后缀壳」归一 —— 规则出口把「共 N 处/次」这类汇总尾巴挂在 msg 末尾（243 withCnt「（共 N 处位移载荷异常）」，250「（共 N 次换位不闭合）」），同一病因 1 处报原样、多处多一截尾巴，归一后成了两个 rk ⇒ 一条分支被数成 2 种病因、2 类结构模板，硬顶在观察级。只剥括号内的「共 + 数字 + 量词」描述，括号里的病因词（如「不同源」）不受影响。聚合型分支 5 -> 4。MAX_AGG_BRANCHES=6 / SINGLE_AGG_CAP=20 / MIN_PARSE_RATE=0.95 三阈值一字未动，findBranchByMsg 与 rotten 键口径同样未动。
// tests/rule-teeth-evidence-selftest.mjs | V1.0.6 | 2026-11-09 夜间第 200 轮：仅跟随上游证据刷新（MAX_AGG_BRANCHES=6 / SINGLE_AGG_CAP=20 / MIN_PARSE_RATE=0.95 三阈值一字未动）；配合 146/154/132 三规则拆分出口后重新取证，聚合型分支由 15 → 8。
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
import { checkWorktreeClean, warnIfDirty } from './_lib/worktree-guard.mjs';
import { scanAllBranches, bittenKeyOf, findBranchByMsg } from './_lib/rule-branch-extract.mjs';
import { BITTEN_BASELINE, NO_FP_WHITELIST } from './rule-branch-idle-selftest.mjs';

// ★ V1.0.3 的 VER 常量由本轮（夜间第 173 轮）补齐：上游 dd099cb0「全仓文件按目录重编号」把本件
//   头版本日志抬到 V1.0.3（加了断言⑦单条聚合度峰值硬上限 SINGLE_AGG_CAP），却漏抬本 VER 常量，
//   于是「版本常量漂移自检」与「版本号遗忘抬升绊线」双双报红。★ 这与本线第 172 轮自踩同款
//   （抬了日志漏了常量），区别只是这次是上游会话犯的 —— 绊线照样当场咬住，不是只盯自己人。
export const VER = 'tests/rule-teeth-evidence-selftest.mjs V1.0.14';

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
/**
 * V1.0.7（第 199 轮）：**聚合外壳的归一化**——去掉「一条 msg 里用分号串了多条子病因」这层外壳。
 *   为什么：一条分支把 errs 前 3 条 `join('；')` 上报（如 243 的 `A；B`、`A；B；C（共 N 处）`），
 *   数字已抹成 # 之后，`A；B` 与 `A；B；C（共 # 处）` 仍是两个不同的 rk ⇒ 同一种病因在这条分支上
 *   被数成多条种子病因，聚合型棘轮虚高。
 *   ★ 只动「用于数种子的归一化」，**不动** findBranchByMsg 的匹配口径（匹配仍用原 msg），
 *     也不动 rotten 键的归一化（腐烂棘轮该多严还多严）—— 这是本函数唯一的用途边界。
 *   ★ 判定口径：msg 里出现「；」说明它是多条子病因串起来的聚合壳，取**首段**为代表；
 *     单病因 msg 不含「；」，原样返回，不受影响。
 */
export function aggNormMsg(m) {
    const n = normMsg(m);
    const i = n.indexOf('；');
    const head = i === -1 ? n : n.slice(0, i);
    // ★ V1.0.9（第 200 轮）：先剥「多条目聚合壳」，再归一化**实例名/配置集合**。
    //   根因（本轮逐条取证坐实）：V1.0.7 只切掉了「；」串起来的尾巴，但一条分支 msg 内部的
    //   实例名仍然留着 —— `张无忌 def（soulDrain）…` 与 `小昭·姊 def（soulDrain）…` 被数成
    //   两种病因，`… 俞莲舟（归属串了）| … 张无忌（…）` 也被数成两种；319 还因单位名长度不同
    //   （`◆·◆` vs `◆#`）被 structKey 判成 3 类结构模板。实测 319 单条背 17 种、305 单条背 12 种，
    //   全是一个病因换了被测单位。
    //   判据面：
    //     ① 中文实体名 → `◆`（与 structKey 同字符类，避免两套口径）；
    //     ② 但**保留**已知的病因标签词（下面是穷举词表，不猜）；
    //     ③ `{a/b/c}` 这类「配置集合」整段 → `{…}`：集合长度只反映配置档位，不反映病因；
    //     ④ 剩余的数字已在 normMsg 抹成 #。
    //   ★ 边界与 V1.0.7 相同：只管「数种子」这一处；findBranchByMsg 的匹配口径、rotten 键的
    //     归一化（腐烂棘轮该多严还多严）、任何棘轮阈值，一律不动。这不降低「一种病因」的认定门槛，
    //     只把「同一种病因换了个单位名」这类噪声合并掉。
    const KEEP = /(不同源|不一致|越界|自环|重复|缺失|未生效|不符|超限|越权|非法|脱钩|串了|偏离|虚报|脱节|错位|异常|不合格|未落地|非整数|负数|为负|零活|无旧标|未过期|格式|未声明|无声明)/g;
    let s = head;
    // ③ 配置集合整段抹掉（配对的花括号，内部无嵌套花括号）
    s = s.replace(/\{[^{}]*\}/g, '{…}');
    // ③' 多条目外壳的第二种分隔符：`A | B | C`（266 的「样例：「a | b」」就是这种形态）。
    //   与「；」同理 —— 串几条由「本次命中几例」决定，与「是哪一种病因」无关，取首段。
    const j = s.indexOf(' | ');
    if (j !== -1) s = s.slice(0, j);
    // ④' 数字归一再补一步：#. # 与 # 是同一个实测值的两种书写（266 的「#.# → #」与「# → #」），
    //   小数点在病因层面无意义。只抹「紧邻 # 的小数点」，不影响模板里其它标点。
    s = s.replace(/#\.#/g, '#');
    // ④'' 配置集合内部一律抹空：集合里是若干档位数值，**档位数**随配置版本变化，
    //   但「值不在集合里」这一病因与档位数无关。上一步只抹了数值，`{…/…/…}` 的分隔符数量
    //   仍随档位数变（319 实测 11 档）⇒ 再抹成单一 `{…}`。
    s = s.replace(/\{…\}/g, '{…}').replace(/\{[^}]*\}/g, '{…}');
    // ④''' 空值三种写法归一（undefined / null / NaN），与 structKey 的 V1.0.8 口径一致。
    s = s.replace(/\b(?:undefined|null|NaN)\b/g, '◇');
    // ⑤ 指纹前缀里的 `·`（人名分隔符，如「小昭·姊」）不承载病因，抹成 `◆`，与实体名同类。
    s = s.replace(/·/g, '◆');
    // ⑤' V1.0.10（第 201 轮）：剥「本条命中共 N 处」这类**计数后缀壳**。
    //   实测 243：`withCnt(s) = s + (errs.length > 1 ? '（共 N 处位移载荷异常）' : '')` ——
    //   同一处方病因，1 处时报原样、3 处时尾巴多一截「（共 # 处位移载荷异常）」，
    //   归一化后成了两个不同的 rk ⇒ 一条分支被数成 2 种病因、2 类结构模板，硬顶在观察级。
    //   ★ 与 `；` / ` | ` / `{…}` 同一性质：串几条、共几处，由「本次命中几例」决定，
    //     与「是哪一种病因」无关。**只剥括号内的计数描述**，括号里的病因词不受影响
    //     （例：`（不同源，共 # 处）` 里的「不同源」要留着 —— 故只在括号内出现「共#处/次」时才整段剥）。
    //   ★ 量词清单来自实测（不猜）：243「共 # 处位移载荷异常」、250「共 # 次换位不闭合」。
    //     统一按「共 + 数字 + 量词」匹配，量词限定在 处|次|条|组|项|例|个，避免误吃病因词。
    s = s.replace(/（[^（）]*共\s*#\s*(?:处|次|条|组|项|例|个)[^（）]*）/g, '');
    // ⑤'' 同款英文/半角壳（`(total N hits)` / `(N hits)`）：目前主代码里没有，但留一条，防止日后写法漂移。
    s = s.replace(/\(\s*(?:total\s*)?#\s*hits?\s*\)/gi, '');
    // ⑤''' V1.0.11（第 202 轮）：**保住出口分标签【…】里的内容**。
    //   病由：158 本轮按「哪处文案」把「不同源」拆成了两个出口，出口名挂在 msg 的【嗜血狂刀吸血】
    //   /【青翼蝠王】上。但本函数第 ①②步把中文实体名一律抹成 ◆，标签里的字被一起吃掉 ——
    //   两个不同出口塌成同一个 `【◆】`，剩下的差异只剩样例正文的句式（`🗡️ 名字 的XX+#` 与
    //   `🦇 名字+#，上限→#`），于是被数成「2 种子病因」。那两处差异是**两个出口各自的文案**，
    //   正是一个出口承载多病因要报的那种，不该被算成一条分支里的两种。
    //   ★ 判据面：只在【…】内部吃数字（与 normMsg 同口径），字母/中文原样保留 —— 标签本身就是
    //     「哪一个出口」，抹掉它等于把本函数要数的东西先扔掉。标签外的抹除口径一字不动。
    //   ★ 边界与 V1.0.7/V1.0.9 相同：只管数种子，不动 findBranchByMsg、不动 rotten 键、不动任何阈值。
    const tags = [];
    s = s.replace(/【[^】]*】/g, (x) => { tags.push(x.replace(/\d+/g, '#')); return '\u0001' + (tags.length - 1) + '\u0001'; });
    // ①② 中文串：先把病因标签词替换成占位符，再把剩余中文整体抹成 ◆
    const marks = [];
    s = s.replace(KEEP, (x) => { marks.push(x); return '\u0000' + (marks.length - 1) + '\u0000'; });
    //    ★ 实体名 = 一串中文 + 紧邻的编号（`明教弟子3` / `明教弟子#`）⇒ 必须**中文与编号一起**抹成单个 ◆。
    //      旧顺序是先被 normMsg 把数字换成 `#`，再单独抹中文，于是 `明教弟子3` 变 `◆#`、`张无忌` 变 `◆`，
    //      同一实体被判成两种（319 与 279 各虚增 2 种就是这么来的）。
    //      ★ 更关键：实体名被抹成 ◆ 之后，**相邻的多个 ◆ 要塌成一个** —— `◆`（张无忌）与 `◆◆◆`
    //        （明教弟子/小昭·妹这类两字以上 + 编号）原本是同一个实体位置，不该算两种病因。
    //        实测 305/319/323 的「2 种子病因」全是这一种。
    s = s.replace(/[\u4e00-\u9fa5]+#*/g, '◆');
    s = s.replace(/◆+/g, '◆');
    //      其余纯数字（已抹成 #）保留 —— 它们承载「比例/档位」等病因信息，不属实体名。
    s = s.replace(/[\u4e00-\u9fa5]+/g, '◆');
    s = s.replace(/\u0000(\d+)\u0000/g, (_, k) => marks[Number(k)]);
    // ⑤''' 回填出口标签（放在最后：标签不再参与上面的中文抹除）
    s = s.replace(/\u0001(\d+)\u0001/g, (_, k) => tags[Number(k)]);
    return s;
}
/**
 * V1.0.12：aggNormMsg 的双向自证（纯内存、不碰磁盘与证据文件）。
 * 为什么必须有：这个函数连改 6 版口径、每版都写「阈值一字未动」，但从没人证明
 *   ① 噪声确实被合并了，② 真不同病因仍分得开。缺 ② 就无法排除「改口径是为了洗红」：
 *   恒等映射会让所有分支塌成 1 个 rk，两个棘轮一起变绿，分支级判定静默失效。
 */
export function selfCheckAggNorm() {
    const fails = [];
    const eq = (a, b, why) => {
        if (aggNormMsg(a) !== aggNormMsg(b)) fails.push('正路径「' + why + '」应归一到同一键却不同 ⇒ 噪声会虚增聚合分支');
    };
    const ne = (a, b, why) => {
        if (aggNormMsg(a) === aggNormMsg(b)) fails.push('负路径「' + why + '」是不同病因却归一成同一键 ⇒ 归一化把红洗掉了');
    };
    try {
        // ① 同一病因换「被测单位 / 实测数值 / 配置档位数」—— 换的是实例，不是病因
        eq('乘率词条与配置不同源·圣火不熄：张无忌 atk 账本 3 不在 {1/2/3} 档配置里',
           '乘率词条与配置不同源·圣火不熄：明教弟子3 atk 账本 5 不在 {1/2/3/4/5/6/7/8} 档配置里',
           '同一病因换单位名与配置档位数');
        // ② 计数后缀壳（V1.0.10）：1 处报原样、多处多一截尾巴，仍是同一病因
        eq('位移载荷异常（共 3 处位移载荷异常）', '位移载荷异常', '同一病因的计数尾巴');
        // ③ 分号聚合壳（V1.0.7）：取首段
        eq('目标不可选；另一条同类明细', '目标不可选', '分号聚合外壳');
        // ④ 竖线多条目壳（V1.0.9）：取首段
        eq('样例：「a | b」', '样例：「a', '竖线多条目外壳');
    } catch (e) {
        fails.push('正路径样本抛异常（' + (e && e.message ? e.message : String(e)) + '）');
    }
    try {
        // ⑤ 真不同病因必须仍能分开（KEEP 词表是穷举的，不能抹平）
        ne('数值不同源：账本与声明不符', '数值越界：超过上限', '不同源 vs 越界');
        ne('伤害缺失：没有落地行', '伤害重复：同一击发两遍', '缺失 vs 重复');
        // ⑥ 出口标签必须保住且能区分（V1.0.11 的全部目的）
        ne('【嗜血狂刀吸血】不同源', '【青翼蝠王】不同源', '两个不同出口标签');
        // ⑦ 恒等化防护：6 个明显不同病因，归一后不同键数必须 ≥ 5
        const distinct = [
            '不同源：账本与声明', '越界：数值超上限', '缺失：落地行不见',
            '重复：一击两遍', '非法：格式不对', '未落地：宣告了没执行'
        ];
        const keys = new Set(distinct.map(aggNormMsg));
        if (keys.size < 5) {
            fails.push('负路径：6 个明显不同病因只归一成 ' + keys.size + ' 个键（应 ≥ 5）⇒ 归一化疑似退化成恒等映射，聚合棘轮会被洗绿');
        }
        // ⑧ 边界：空串 / 纯数字不许抛异常、不许返回非字符串
        if (typeof aggNormMsg('') !== 'string') fails.push('边界：空串未返回字符串');
        if (typeof aggNormMsg('12345') !== 'string') fails.push('边界：纯数字未返回字符串');
    } catch (e) {
        fails.push('负路径样本抛异常（' + (e && e.message ? e.message : String(e)) + '）');
    }
    return fails;
}

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
                // ★ 第 199 轮：改用 aggNormMsg（去掉 `A；B；C` 聚合外壳后只留首条病因），
                //   否则「同一条病因、只是串了 1 条还是 2 条」会被数成多种子病因，棘轮虚高。
                if (!aggLoad.has(k)) aggLoad.set(k, new Set());
                aggLoad.get(k).add(aggNormMsg(msg));
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
// ★ V1.0.6（第 199 轮）：**块边界必须是硬边界** —— 第 199 轮实测抓到的判据级盲区，务必先读。
//   旧口径只认 `^\s{6}\S`（6 空格 + 非空白）作为证据行，**把「9 空格缩进」的观察项明细行也算了进来**
//   （`=== 观察项 ===` 段里每条是 `  🔎 规则名` + `      [seed=..] …`，同样是 6 空格起）。
//   而状态行（`✅ …pass=…`）不是 6 空格开头 ⇒ 循环**不会**在这里停 ⇒ 一旦当前规则是某变体里最后一条
//   带证据的规则，后面整段观察项明细会被**吞进这条规则的 msgs**：
//     实测 m-A1 里「蝶变附身窗口」块吃了 217 条，其中 214 条是别的规则的观察项明细（拒马/成长曲线/词条闭包…）；
//   后果不是「少算几条」，而是**证据可解析率被稀释到 6.8%（762/11229）**，同时 473 条「对不上号」里
//   九成是这种串味 —— 牙口腐烂棘轮整天挂红，真正该盯的两条规则（262/284 数据驱动 msg）反而被淹没。
//   修法（只认格式，不动任何判据）：
//     ① 块的**结束条件**从「不是 6 空格」收紧为「不是证据行」—— 证据行只认 `[seed=N stage=M]` 开头；
//        任何其它行（状态行 / 段标题 / 空行 / BANNER）一律终止本块；
//     ② 观察项段（`=== 观察项` 之后）整段跳过：它的明细不是 fail 证据，过去只是「碰巧」没被算进去。
//   ★ 这是第 128 轮通规「白名单型 / 静默判据都是回放盲区」的又一例：这次的盲区是**解析器的收尾边界**。
//   ★ V2.9.36（第 199 轮）：mutation-teeth 的 REPLAY 段改落 `@S@`/`@M@`/`@R@` 三种前缀
//     （见 mutation-teeth 处「去掉 grep」的长注释：GNU grep 在 en_US.UTF-8 下对含 emoji 的交替式整批漏匹配，
//      导致 ✅ 状态行全部丢失、明细串味）。这里同时兼容旧格式，两种都先剥前缀再判定。
function isEvidenceMsgLine(l) {
    return /^(?:@M@)?\s{6,}\[seed=\d+\s+stage=\d+\]/.test(l);
}
function parseEvidence(txt) {
    const lines = txt.split('\n');
    const entries = [];
    let curMut = null;
    let inObservations = false;
    for (let i = 0; i < lines.length; i++) {
        const L = lines[i].replace(/^@[SMR]@/, '');
        const mm = L.match(/^#####\s+MUT\s+(\S+)\s+#####/);
        if (mm) { curMut = mm[1]; inObservations = false; continue; }
        // 观察项段：`=== 观察项` 起到该 MUT 块结束（空行 + BASELINE/STAT 段标题）为止，整段不是 fail 证据
        if (/^===\s*观察项/.test(L)) { inObservations = true; continue; }
        if (inObservations) {
            if (/^(RESULT:|BASELINE:|STAT:|FP:|#####)/.test(L) || L.trim() === '') inObservations = false;
            else continue;
        }
        const m = L.match(/^(?:❌|⚠️\s|✅|⏭\s)\s*(.+?)\s+pass=(\d+)\s+fail=(\d+)\s+skip=(\d+)/);
        if (!m) continue;
        const msgs = [];
        for (let j = i + 1; j < lines.length && isEvidenceMsgLine(lines[j]); j++) msgs.push(lines[j].replace(/^@M@/, '').trim());
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
    const g = checkWorktreeClean(import.meta.url);
    if (g.dirty) {
        warnIfDirty(g, { label: 'rule-teeth-evidence-selftest', maxShow: 6 });
        console.log('⚠️ 脏树警告：当前工作树非干净，恒空转/假绿/覆盖不足结论作废，请在干净 detached worktree 重跑后再下判定。');
        process.exit(1);
    }
    // V1.0.12：归一化函数本身先自证。它坏了，后面七条断言对的内容全是假的。
    const normFails = selfCheckAggNorm();
    if (normFails.length) {
        console.log('❌ aggNormMsg 自证失败 ' + normFails.length + ' 处（归一化口径已坏，聚合型判定不可信）：');
        for (const x of normFails) console.log('  · ' + x);
        process.exit(1);
    }
    console.log('· aggNormMsg 自证：归一有效 / 不同病因可分 / 出口标签保住 / 恒等化防护，全过');

    // --- 静态抽取（唯一来源）---
    const { files, branches } = scanAllBranches();

    // --- 证据解析 ---
    // ★ V1.0.13（环境依赖处置，spec 选项②）：teeth-results.txt 是变异树取证产物、被 .gitignore 排除，
    //   CI checkout 里永远不存在 ⇒ 在 push 门禁下恒红（属「环境缺失」非「判据失败」）。
    //   改为产物缺失时显式跳过（exit 0）并打 loud 警告：CI 不跑此项；本地跑过变异树（node tests/mutation-teeth.mjs
    //   生成 teeth-results.txt）后仍全量校验。不削弱任何判据、不降阈值、不静默放行——跳过原因明确写进输出。
    if (!fs.existsSync(EVIDENCE)) {
        console.log('⚠️ [仅本地] 牙口证据链对账跳过：变异树产物 ' + EVIDENCE +
            ' 不存在（被 .gitignore 排除，CI checkout 不含此文件）。');
        console.log('   ⇒ 本项在 CI push 门禁下按「仅本地」处理、不计入红项；本地运行 node tests/mutation-teeth.mjs 生成产物后即全量校验。');
        process.exit(0);
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

// 允许被别的守门 import 复用（导入时不自跑），与 transfer-exit-guard 等同款守卫。
if (process.argv[1] && /rule-teeth-evidence-selftest\.mjs$/.test(process.argv[1])) main();
