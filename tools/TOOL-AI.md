# TOOL-AI — 给 AI 的工具借用索引

> **写给后续 AI 助手**：本目录的工具有两类受众——给人用的浏览器页面、给你（AI）用的 node 直跑工具。
> 动手造轮子之前，**先查这张表**；多数「跑一批战斗看数据」的需求都有现成口径可借，别自写骨架。
> 借用原则：**口径必须与既有工具逐字对齐**（清场、种子公式、海克斯开关、归因方式），跑出来的数字才和已有报表可比。
> 最后核对：**2026-11-10**（全目录实物对账：补 826/829/830/831/852 与四个 .mjs 脚本，改 `verify:tools` 口径，改跑批骨架为 `runBattle` 收口，补 force 通道现值，新增「六、AI 包」节。表内命令均在仓库根目录实测，标注「红」的是当日已知失效项）。
>
> **编号纪律**：2026-11-01 全目录重编号，旧 1XX → 新 8XX（同号尾：108→808、112→812、116→816、122→822…）。
> 部分文件头注释里仍留着旧号（820/823/826/828 等），那是同义残留，**以 8XX 为准**；
> 另注意 `tests/` 也有自己的 1XX（如 `tests/123static-scan.js`），看路径前缀别混。

---

## 一、AI 直接可跑（node，无需浏览器）

| 工具 | 干什么 | 怎么跑 | 借用注意 |
|---|---|---|---|
| `818-import-export-check.mjs` | 静态对账：每个 `import { 名字 }` 的具名绑定，目标文件是否真的导出 | `node tools/818-import-export-check.mjs` | 改完 import/export 后必跑，秒级。只查「有没有导出」，路径存在性归 `tests/123static-scan.js` |
| `828-verify-registry.mjs` | 数据护栏：主代码精英池/数值 vs 工具名单（`827`）与 `805` HERO_META 是否漂移 | `node tools/828-verify-registry.mjs`（纯只读） | 加精英、改 m 值、改出场方式后必跑；已知差异走白名单（当日：10 处，全绿） |
| `829-verify-pools.mjs` | 池子推导对账：`characters` 单一真源，11 组池用「生产 getter」与「脚本独立重算」双口径互校，并断言 roster 旧表已删 | `node tools/829-verify-pools.mjs`（纯只读） | 改 `core/201` 派生逻辑或 `content/001` 名单后跑；当日 11/11 一致 |
| `check-manifest.mjs` | 静态对账：`806` 的 ALL_PROJECT_FILES ↔ 磁盘（断链 + `--strict` 下「有文件没登记」） | `node tools/check-manifest.mjs --strict` | 当日曾红（`806` 留着已搬 `archive/` 的 `ui/712`/`ui/713` 死登记），**2026-11-10 已清、现 444 项全绿**。它再报红就是新断链：先分清「文件搬走没删登记」还是「新建没登记」 |
| `830-manifest-gen.mjs` | 生成 `manifest.json`（SW 整套预装清单 + SHA-256 指纹） | `node tools/830-manifest-gen.mjs` | 改完代码、推送前跑一次；漏跑 `tests/manifest-fresh-selftest.mjs` 报红（它 import 本文件的 `collectFiles`/`hashFiles`）。范围不含 `tools/`，只动根散件与 8 个运行目录 |
| `819-auto-tuner.mjs` | 平衡参数敏感度分析（单参数扰动排行榜） | `node tools/819-auto-tuner.mjs [--stages 2,3 --seeds 60 --delta 0.25]` | 动 content 数值前后跑。**全崩退 1 / 部分崩退 2**，异常带首个栈留档（V1.1.0 起，静默失效已修） |
| `821-param-lab.mjs` | 参数对照实验台（固定关×固定阵容×固定海克斯×配对 seed） | 先 `node tools/821-param-lab.mjs --sample --stage 3 --runs 1000` 出阵容清单，再 `--stage 3 --runs 100 [--patch 补丁.json --json]` | 逻辑在 `822-param-lab-core.js`（浏览器/node 共用），CLI 只是薄壳；补丁路径写错直接报错，防「补丁没生效」被读成「参数没影响」 |
| `834-fetch-pool.mjs` | 创意摸奖外部词条池维护（写 `834-idea-pool-additions.json`） | `node tools/834-fetch-pool.mjs --keywords` / `--add "..." --dim effect` / `--promote` / `--archive` | 手动跑；新词条默认 `tag='待确认'`，人工过目再转正 |
| `build-versioned-site.mjs` | 产出 `_site/` 版本化部署副本（给 import / script src / new URL 加 `?v=<sha>`） | `BUILD_V=<版本号> node tools/build-versioned-site.mjs` | 源码零改动；GitHub Pages 10 分钟缓存的解法，只在发布线用 |
| `health_auto_check.py` | 自动体检一键（后台拉起、按预算秒/关卡/轮数扫覆盖率） | `python3 tools/health_auto_check.py 180 7 100 1` | 属体检线，判据与账本口径看 `tests/` 与 `体检条目.md`，不要拿它的数字当胜率 |
| `806b-server.js` | 工具链本地静态服务器（零依赖，端口 8765，起了才有 secure context） | `node tools/806b-server.js` 或双击 `启动工具箱.bat` | 浏览器工具页的本地宿主；`file://` 双击开会让 `showDirectoryPicker` 等 API 失效 |

> **一键护栏**：`npm run verify:tools` = `828` → `829` → `818` → `check-manifest --strict` 四步串（**不再等于单独跑 828**）。
> `npm run test:health` = `tests/run-all.mjs` + `verify:tools`。当日状态：前三步全绿，第四步因 806 断链红。
>
> **产物落盘处**：`tools/output/`（`821 --sample` 出的阵容清单与报告 md 由脚本自动建目录写这里，现有 `lineups-stage3.json`）。
> 自己写的探针要留数据也丢这儿，别在仓库根目录乱吐文件。

> ⚠️ **机制装配铁律（2026-11-03 修 819 时确立，816 V1.3.1 同源教训）**：node 侧任何要跑战斗的脚本，机制注册
> **只 import `modules/301-reg-mechanics.js` 这一行**，不要手装 307/308/317/331 ——
> 手装必漏。819 当年手装三行漏了 331（dotTick/damageReflect），鹿杖客一出场就抛
> `未知顶层机制 type "dotTick"`，异常被 `catch` 吞成「异常局=280」，表现为全关基线 0.0%、
> 参数项 0、看起来像「没有敏感参数」——整台工具静默失效且没人发现。

## 二、AI 写探针 / 跑批的标准骨架（抄这几处，别从零写）

1. **跑一整场战斗**：直接调 `core/206-battle-runner.js` 的 `runBattle({ ally, enemy, seed, hexPicker, enemyHexPicker, onStep, ... })`。
   **不要再抄 while 回合循环**——`816` 文件头写明历史上这里有 3 份副本（`runWholeBattle`/`runBalanceJob`/`runHexStageJob`），
   现已全部收口到 `runBattle`；新脚本可抄的是外围四件事（活样本：四个 `probe-*.mjs` 与 `815` 全是这套骨架）：
   ① 清场 `clearBattleGlobals()`（见 `816:64`：`eventBus.clearAll()` + 8 个 force 逐个置 null + `flushBattleEvents()`）；
   ② 建队 `initBattleTeams()`（`modules/330-battle-init.js`）；
   ③ 数据要拉两份：`loadGameData()`（`content/001`）**＋** `loadHexEnhanceData()`（`content/002`）——
      小昭 hexEnhance 已迁到 002，`modules/317` 每回合建队就读它，缺了带海克斯的 job 全炸（照 `822:ensureGameData` 抄）；
   ④ 分片与种子：`battleSeed = baseSeed + (startIndex + i) * 7919`，关卡基准 `masterSeed + stage*131`，精英臂再 `+ eliteIdx*7717`。
2. **局序 → seed 必须过散列**：用 `822:mixSeed(i)`，**不要直接把 `20000+i` 这种连续小整数当种子**。
   xorshift32 的首个随机数与 seed 强相关，连续 seed 会让第一抽（`330` 的精英人数骰）永远挤在窄带里——
   实测 raw `827:173:0:0` vs hashed `599:151:50:200`，后者才对得上 60/15/5/20 的设计分布。
   症状是「阵容分布失真 / 某个精英死活不出现」，不是报错，极易被当成参数没生效。
3. **node 侧环境垫片**：抄 `822-param-lab-core.js` 头部（`window` 指向 `globalThis` + 内存版 `localStorage`）——
   引擎 import 链在无浏览器全局时要读它们，缺了会在模块体就炸；`probe-*.mjs` 头部还有一段把
   `content/001` 的相对 fetch 映射成 `file://` 的补丁，node 里要读数据就一起抄。
   **浏览器侧清场另加一手**：`localStorage` 里的 `_forceXxx` 会被 `ui/701-main-utils.js:initDevFlags()` 一次性读回 GlobalStore
   （dev-index 按钮就是这么注 flags 的），所以页面工具清场要像 `822`/`815` 那样连 `_` 前缀一起 `removeItem`。
4. **强制上场口径**：force 通道的**唯一真源是 `infra/112-store-schema.js`**（键名/类型都登记在那），消费点在 `modules/330-battle-init.js`。现值（2026-11-10）：
   - `forceZhang` / `forceWei` / `forceXieXun` / `forceHanLiSa`（寒离飒 V7.6.1 起独立通道，走 `forceWeakElite` 会撞入池校验抛错）；
   - `forceXiaoZhao` 传 `'sister' | 'brother'`（**不是 true！**）；
   - `forceSoloWeakElite = true`：强精英单挑，只抑制轮盘、不产生第二个精英（V7.5.26）；
   - `forceWeakElite = 名字`：明教弱精英池或 `roster.enemyM`，两者都不在会直接抛错；
   - `forceMingUnit` / `forceSectUnit = 名字`：按名塞进明教 / 六大派的通用通道（`dev-index` 🧪 按钮在用，工具侧暂未接）；
   - `forcePang`：第三关强制定位到含胖远桥的阵容变体（先抽后判，保证 RNG 流不变）。
   **注意别一概而论**：`330:199` 的 `anyForce`（= 抑制随机轮盘、组成真·单精英局）只含
   `forceZhang / forceWei / forceXieXun / forceHanLiSa / forceXiaoZhao(sister|brother) / forceSoloWeakElite` 六路；
   `forceWeakElite` / `forceMingUnit` / `forceSectUnit` / `forcePang` 不进这个判断，各自走自己的分支，轮盘行为要回 `330` 对应段看。
   **新增/改名 force 键必须同步 `816` 的清场清单**——历史上 V1.7.1/V1.9.1/V1.12.0/V1.12.2 四次「漏清导致下一场被污染」都栽在这。
5. **确定性回放/断言**：抄 `tests/rules-replay.mjs` 头部的环境垫片（fetch/localStorage/window mock），以及 `tests/140-baseline.js` 的 buff 注入口径（`tickAndPickBuffs` 本地版，`822` 也有一份）。
   - 已验证示例：`node tests/140-baseline.js --check`（18 场二分红线）、`node tests/rules-replay.mjs`（120 场规则+不变量）。

## 三、浏览器页面（人用，AI 只读逻辑别执行）

- `802-toolkit.html` 工具箱主页：页面本体是文件复制器（`803` + `806` 清单），顶部 4 个入口按钮（📊 海克斯仪表盘 808 / ⚖️ 职业平衡 809 / ⚖️ 全随机站位 810 / 🚨 平衡告警 826）+ 底部「🧰 备用工具」折叠区 **11 张卡片**（统计一致性体检 813 / 精英基线对比 814 / 阵容分布搜索 815 / 创意摸奖 834 / 参数扫描 835 / 语音解说存档 836+837 / 日志复盘 807 / 参数实验台 820 / 弱精英机制贡献 838 / **消融实验室 831**（2026-11-10 新增）/ 工具数据总览（各工具 localStorage 占用 + 分项清空，只碰工具结果不动游戏存档））。
- `805-shop.html`：圣火令商店 demo。**828 会拿它的 `HERO_META` 对账主代码 m 值**，改这里等于改契约。
- `807-battle-log-viewer.js`：战报文件复盘，只吃「🎬 保存战报」导出的 .json（含 steps），与游戏内走势分析共用 `player/514-battle-log-analyze.js` 的 `analyzeBattleFacts`。粘贴文本入口已删——正则反推精度差且认不出新机制。
- `808-hex-dashboard.js`：海克斯看板，四模式分键存 localStorage；长期榜每条落 seed + 版本，跨版本合并会显式告警。
- `809-role-balance.js` / `810-role-balance-random.html`：职业平衡（固定站位 / 全随机站位）。默认**关海克斯**，开海克斯时自动勾双海克斯保证对称；总胜率离 50% 多远才是结论。
- `812-elite-eval.js`：精英评测，四张表 = 主表(`elite`) / 单英雄(`soloElite`) / 无精英基线(`noElite`) / 弱精英(`weakElite`)，结果进快照库（`ming_elite_eval_snaps`）。`⚔ 强精英胜率` 按钮走 `soloElite`；`weakContrib` 不是本页的，是 `838` 的观测通道。
- `813-stats-check.js`：承伤/治疗对账（承伤=来袭全额含减免溢出，治疗=产出侧记账）。自伤、附身搬血、`record=false` 的单位标 `unrec*` 跳过，判红是假红。
- `814-baseline-compare.js`：同 seed 两套精英配置 A/B 逐关对照。
- `815-lineup-search.js`：阵容分布搜索（`masterSeed + run*7919 + stage*131`）。
- `820-param-lab.html` + `824-param-lab-glossary.js`：参数实验室 UI 与「参数中文说明表」。
  **新增 mechanics type / 新 CONFIG 字段要补 824**，否则页面退化成显示原文，且 `tests/param-read-guard.mjs` 会报引擎真读字段漂移。
- `826-balance-alert.js`：把既有工具的落盘结果（808 榜、812 快照）自动判读成告警清单，**自己不重跑批**；要看新数据得先去 808/812 跑。
- `831-ablation-lab.html`：消融实验室（姊三因素归因：关姐姐海克斯 / 关乾坤衍生 / 关附身）。
  跑批在 `816 kind:'ablation'`，开关走 `globalThis.MING_ABLATION`，**只改「是否应用」不改种子公式**；分桶目前只拆第 3 关的胖远桥/宋青书（第 4 关敌方也带宋青书旗标，别乱扩，V1.22.1 崩过）。
- `833-md-reader.html`：MD 阅读器，dev-index「文档与准则」的文本入口，用法 `?f=<仓库根相对路径>`，手机上看长文档不缩字。
- `834-idea-lab.html`：创意摸奖，四类创意 × 三种摸法，合法性按 `content/001` 的 mechanics.type + 824 的 TYPE_GLOSSARY 判定。纯前端不跑战斗。
- `835-param-scan.html`：参数扫描（A 敏感度含死参数清单 / B 贪心定向搜索），复用 822/823，不写新跑批逻辑。
- `846-weak-elite-eval.js`：弱精英评测（工具箱「🐦 弱精英评测」页签，2026-11-11 从 812 拆出）。算法/口径/渲染 1:1 沿用 812 的弱精英表（`kind:'weakElite'`，natural 对照臂 + 每个弱精英一条臂，同 (关,分片) 同种子），跑完自动往 `ming_elite_eval_snaps` 写一条只含 `parts.weak` 的快照，826 照旧可读。
- `852-career-log.js`：生涯记录报表与导出。运行时记账在 `modules/332-career-log.js`（**唯一真源，`player/503` 直接 import 它，不再经 tools**）；本页只读摘要，单局 2~3KB、上限 200 局，不存 steps。

**跑批真身都在 worker 里**——`822`/`827` 是纯逻辑，node 侧可直接 import；`816`/`817`/`823` 是浏览器 worker 脚本，
node 里 import 不起来（也没有 export），要跑批照第二节骨架自己组，别硬套：
- `816-role-balance-worker.js`：多 kind 分发，现有 `balance / elite / soloElite / noElite / weakElite / weakContrib / stats / hex / random / paired / ablation / baseline` 12 种。**它没有 export**（worker 脚本），node 侧要跑批请照第 2 节自己组，或直接借 `822`。
- `817-shared-worker-runner.js`：SharedWorker 池调度，`runParallel({ jobs, kind, nextJobMsg, onJobDone, onAllDone, poolSize, workerUrl })`。默认吃满全部逻辑核；想给系统留核：控制台 `localStorage.setItem('battle_pool_size', 6)`，下次点击生效。
- `822`/`823`：参数实验室的纯逻辑层与专属 worker（`823` 走 `817` 的 `workerUrl` 覆盖，不改 `816`）。
- `827-tool-registry.js`：**工具箱共用名单与文案表单一真源**（`NATURAL_ELITES / SOLO_ELITES / BOSS_ELITES / WEAK_ELITES / ENEMY_VARIANTS / SOLO_FORCE_KEY / WEAK_UNIT_FLAG / ELITE_UNIT_META / HEX_NAMES / STATS_TH`）。加精英/海克斯只改这里，812/813/814/815/816/826/808 自动跟上，改完跑 828 验漂移。

## 四、历史探针（留档，遇到同类症状先读再用）

> 这些是过去定位具体 bug 时写的一次性探针，**已定位并修复的问题不要重复调研**；但遇到同类症状（同一角色/同一机制/同样的「报幕与实际不符」）时，先读对应探针，按它的 dump 口径继续跑，能省一大圈。

| 探针 | 当时查什么 | 现状 | 复用时怎么改 |
|---|---|---|---|
| `probe-lioness.mjs` | 母狮（灭绝师太召唤物）联动死亡是否提前剧透：逐步 dump fact 序列与目标死活状态 | 机制已修，探针保留作回归参考 | `node tools/probe-lioness.mjs [关] [起始seed] [场数]`，改 dump 条件即可查新的「死亡时序」问题 |
| `probe-lioness2.mjs` | 母狮联动第二版：换成按事件流统计死亡/复活的先后关系 | 同上 | 同上，参数一致 |
| `probe-pang-balance.mjs` | 胖远桥（第3关变体）整体强度是否偏离：固定 baseSeed 跑 N 场出胜率 | 平衡已调，留作同 seed 对照基线 | `node tools/probe-pang-balance.mjs [场数] [baseSeed]`；改 content 后可用同一 baseSeed 复测 |
| `probe-yangxiao-jump.mjs` | 杨逍「先机」抢夺概率实测：数掷骰次数与命中次数，验证标称 40% 是否真生效（文件名里的 jump 是历史遗留，本体早就改成查概率了） | 已验证，留作概率类基线 | `node tools/probe-yangxiao-jump.mjs [stage] [battles]`；改任何「标称概率 vs 实际触发」的机制（概率类 buff / 抢夺 / 闪避）先照它的计数口径跑一遍 |

借用纪律：探针是**取证工具**，不要当正式统计口径——要出胜率报表请用 `812`/`816` 的种子公式与样本量。

## 五、给 AI 的五条纪律

1. **数字口径先对齐再跑**：胜率类统计默认「胜 = 明教，平局只进分母、不丢场」（2026-11-08 起 812/813/816/852 统一成这把尺子，写 `if (!res.winner) continue` 就是退回旧口径），海克斯默认关（开则成对开双海克斯），种子 `baseSeed + i*7919`，与 812/816 一致；改口径必须在汇报里说明。
2. **样本量要够**：N<200 的胜率只能当方向参考（812 界面同款「样本少」提示）。
3. **跑完清场**：`clearBattleGlobals()` 每场之间必调（force 标志、事件总线），否则上一场的监听器会污染下一场。
4. **可复现是底线**：跑批留 `masterSeed` / 版本戳 / 完成时间（808/812/813 已带种子框）；跨版本或跨 seed 的榜**不可直接比较**，宁可显式告警也不要合并。
5. **改完要过三道登记**：① 新增/改名**运行目录**（core/ui/modules/player/fx/render/infra/content）里的文件 → 补 `806` 的 ALL_PROJECT_FILES；`tools/` 里的**页面**（被 802 卡片直接点开的那种）也要登记——`check-manifest` 的 `SCAN_DIRS` 不扫 `tools/`，漏了没护栏会报；但 `tools/` 下的本机 node 脚本按 806 定案**不必登记、不许补登**（见第六节）；② 动了运行目录里的代码 → 跑 `node tools/830-manifest-gen.mjs`；③ 收尾跑 `npm run verify:tools`。

## 六、「AI 包」这条线（复制包 = 本项目和网页端 AI 之间唯一的传输层）

- **是什么**：把仓库代码打成**一摞纯文本**、逐包粘进网页端 AI（DeepSeek 网页）对话框，让它读完再当「大脑」出「旧→新」清单。不是 zip、不是插件、不走网络上传——就是排好版的文本。
- **唯一真源**：`806-ai-pack-config.js` 的 `ALL_PROJECT_FILES`（当日 442 项）。`803-toolkit.js`（打包器）与目录索引都只读这张表；表里写了磁盘却没有 → 包里那个文件显示 `[读取失败: ...]`，网页端就等于没看见这块代码。
- **怎么发**：`node tools/806b-server.js`（或双击 `启动工具箱.bat`）→ 开 `802-toolkit.html` → 勾分组 → 逐包点「复制」→ 去网页端粘贴。
- **分组**：`FILE_GROUPS` 六组 = 引擎 / 播放器 / UI（画面特效等）/ 工具 / 体检 / 📦存档（2026-11-10 新增，**默认不勾**，必须排最后：803 按「第一个前缀命中即归组」，兜底会把没命中的塞进引擎组）。每组自带 `GROUP_PROMPTS` 主题提示词（包眉「请深入分析…收到全部代码后直接开始协助开发」+ 包尾「××代码发送完毕」）。
- **包格式**（`803:526-558` 的实际输出）：包眉 `📦 引擎 包 3/12（共 N 个文件，合计 X 字符）` + 文件清单 → 每个文件 `// ===== 路径 =====` 紧跟原文 → 超上限的文件切 `[第 i/n 片·共 X 字符]` → 包尾要求网页端回一句「收到，引擎 包 3 已完成」，**你靠这句回执数包有没有发漏**。
- **切片阈值**：单次复制上限默认 160000 字符（802 V6.4.8 / 803 V6.2.8），「填多少切多少」，超过该值的文件独占一包并按上限继续切。
- **剔除层**：`AI_EXCLUDE` 装「**还在主代码里、还在被 import**，只是不想随包发」的纯演出件；目录索引里打 `⊘`、头部计数改「随包 N / 剔除 M」，并注明**包内 import 指向缺失文件属预期，网页端不必追问补发**，真要读按 `raw.githubusercontent.com/.../<路径>` 单取。
  **当日此集合已清空**（2026-11-10 撤出 `ui/710`/`render/414` 角色名片——它是格子图标/文本归一/技能栏/日志标签的共同依赖，判「纯演出」是误判；此前 3 件改归 `ARCHIVE_FILES`）。集合结构留着，将来再有此类文件往这里加。
  与 `ARCHIVE_FILES` 的区分（最容易混）：**排除表 = 还在运行链上**；**存档 = 已下线不在链上**，单开「📦 存档」组、默认不勾、必须排最后。
- **另一条互斥路线**：`803` 的「🔗 仓库网址 + 目录索引」按钮（`buildRepoInfo`）只发一张地图，让网页端按 raw / jsDelivr 自己抓原文，省对话长度。说「发复制包」走上面那条，说「发索引/brief」走这条。
- **登记口径（2026-09-26 用户定案，`806` 内原文，维护前必读）**：唯一标准是「网页端拿到包后**运行或阅读是否需要**这个文件」；本表**不追求全量**——体检脚本、本机工具、构建/发布脚本本就不该纳入，**不登记属正常，不许补登**；历史已登记条目保留、无需清理。

---

*本文件由 AI 助手维护（冯罗伊曼，2026-10-08 建；2026-11-10 全目录对账刷新）。工具增删后请同步更新本表；表与实物不符时以实物为准并随手修正。*
