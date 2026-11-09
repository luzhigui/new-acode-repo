// V1.48.0 | 2026-11-09 合入夜间第 195–199 轮：新增两项离线断言（韦一笑吸血额度 / 流星成长渲染）
//   进 CHECKS，清单 63 条全唯一；顺手归位版本漂移——上一版头注已抬 V1.47.0、VER 仍停 V1.46.0
//   （ver-drift / ver-bump 会报红），本次两端同步抬到 V1.48.0。未改任何既有判据、未动 CHECKS 口径。
// V1.47.0 | 2026-11-08 迭代：挂「入口路径强制」tests/entry-path-guard.mjs（新建 V1.0.0）。
//   由头：现有闸门管的是「目录怎么依赖」「版本有没升」「字段有没有登记」，没有一条管
//   「公共出口已提供、代码却绕过它自己手写」。实测骨架铺开率极不均：findAlive 39/50、
//   requireSkillParams 48/65 尚可，pushFact 却只有 1/95、emitHpChange 14/42 —— 可选就等于没有。
//   本件按「规则 × 文件」冻结存量上限（146 处 113+33），只拦新增；14 条自证牙（注释/字符串/
//   entries 容器三路负路径）＋端到端实测（注入 1 处裸写 → EXIT=1 且精确指向新增行；还原 → 0）。
//   配套主代码：emitHpChange 实作从 modules/305 下移 core/214（否则 core 自身 22 处永远够不到，
//   规则会留 79% 活口），305 改转口，行为与 payload 逐字节不变。
//   挂 OBSERVES + hard: true，不改 CHECKS 分母、不改退码口径。
// V1.46.0 | 2026-11-08 迭代：挂「变异指纹换行等价自证」tests/mutation-fp-eol-selftest.mjs（新建 V1.0.0）。
//   配套 mutation-teeth.mjs V2.9.32：指纹生成侧改为逐文件统一 LF、比较侧认 raw/LF/CRLF 三态，
//   顺手修掉 VER 一刀切误报并给陈旧红加 git 归因。自证 23 条牙（双向换行互认、混合换行、
//   真实字节改动/文件增删改名必红），挂 OBSERVES + hard: true，不改 CHECKS 分母。
// V1.45.0 | 2026-11-08 合并轮：挂「夜间成果合入守门」tests/nightly-merge-guard.mjs（新建 V1.0.0）。
//   由头：夜间自动化每天 23/1/3/5/7 点推一轮 Gitee nightly 分支，成果不会自动进白天工作树；
//   今早实测本地 refs 还停 184、远端已有 185–189 五轮实质成果，白天却看不见、还误判「夜里没跑」。
//   新守门四路信号（日志夜间轮 / 合入登记 / 本地 refs / 远端实时）只点名不收口，
//   15 条自证牙（含防自命中）；挂 OBSERVES + hard: true，不改 CHECKS 分母、不改退码口径。
// V1.44.0 | 2026-11-07 迭代（并行接力第一棒）：挂「并行接力漂移守门」tests/relay-drift-guard.mjs（新建 V1.0.0）。
//   用户引入 MiniMax 同为体检方，两边接力改同一套 tests/：下午它提交 5 笔（含 150/151 回血判据、
//   121/122/141/142/148）并留有自己的未提交改动，我上一轮 16 个改动也未提交 ⇒ 两份成果混在
//   同一份工作树，而 25 项体检无一喊「有人改过但没交接」/「合并冲突没解干净」。
//   本守门两面：① 冲突标记残留、git 未解决冲突 → 硬红（确定性缺陷）；
//   ② 列出 tests/ 未提交改动并算一枚「工作树指纹」RELAY-xxxxxxxx → 显形不判红，交下一棒核对，
//      变了就说明有人动过同一批文件，须先对齐再动手。不抄 ver-bump/ver-drift/orphan 任何判据。
//   带 6 条 --selftest 正负路径。挂 OBSERVES + hard: true，不改 CHECKS 分母、不改退码口径。
//   ★ 本轮起工作方式：不直接改主仓，在独立 detached 副本里改完、比对基线 hash 无冲突再灌回。
// V1.43.0 | 2026-11-07 迭代：融合夜间第 180~184 轮成果 + 挂「变异锚点有效性绊线」。
//   ① 融合（只取夜间 tests/ 侧、本地未动过的文件）：9 条规则的报错聚合拆解（136/138/142/143/
//      151/158/159/166/171，夜间第184轮把「一条指纹装 12 种病因」拆成各归各位）、mutation-teeth
//      的 T17 第三次重锚 + T18 收紧锚（夜间第183轮）、体检迭代日志 180~184 轮正文。
//      ★ 不取夜间的「16 个文件各补一行 301 import」点修：本地已收口到 _lib 唯一来源 + 常驻守门，
//        两套修法只保留一套，避免同一处出现两个真相源。
//   ② 白天实跑取证：融合前 `node mutation-teeth.mjs --verify` 报 T17 0 处、EXIT=1（假绿制造机），
//      但 25 项 CHECKS + 全部 OBSERVES 无一跑它 ⇒ 锚点可静默失效若干轮无人喊（夜间潜伏 3 轮）。
//      挂 tests/mutation-anchor-tripwire.mjs（新建 V1.0.0）：每轮 0.1s 调一次 --verify，
//      不抄判据、只摊结论；stdout 零输出/无汇总/汇总 0 条一律判红（防「0 行当列名失配」旧坑）。
//      带 7 条 --selftest 正负路径。挂 OBSERVES + hard: true，不改 CHECKS 分母、不改退码口径。
// V1.42.0 | 2026-11-06 迭代：挂「机制装配收口守门」tests/mechanics-install-selftest.mjs（新建 V1.0.0）。
//   上游 4230eb9a 新增 333/334/335 + content 的 statAbsorb 后，tests/ 下 15 个宿主各自手抄
//   307/308/317/331 四行装配集体漏装 ⇒ 开局抛「未在 core/18 注册」、stdout 全 0 字节，
//   下游消费者解析 0 行（极易被误读成「列名失配、对齐正则就好」）。本轮全部收口到
//   tests/_lib/install-mechanics.mjs（→ 生产唯一总入口 modules/301-reg-mechanics.js），
//   并常驻守门：动态读 301 清单递归扫 tests/、覆盖逐行 import 与字符串表两种形态、
//   真装配验 handler 齐全、待迁移清单自收敛、负路径自证。守门首跑即抓出人工清单漏掉的
//   smoke-headless.mjs（字符串表驱动），已一并收口。
//   ★ 零主代码改动、零既有判据变化；rules-replay.mjs 属他人并行维护，登记待迁移不擅改。
//   挂 OBSERVES + hard: true，不改 CHECKS 分母、不改退码口径。
// V1.41.0 | 2026-11-06 迭代：挂「结论行挑选口径行为守门」tests/pick-key-line-selftest.mjs（新建 V1.0.0）。
//   V1.40.0 的修复只是「调用点多传一个 known-red 参数」，删掉就静默退回红说成绿；
//   线二只比三要素（正则/取行/截断），比不出参数在不在、行为对不对。本守门真身抽两处
//   pickKeyLine 喂合成输出（红 3 样本 / 绿 2 样本）+ 扫调用点实参数 + 负路径自证，
//   正负路径均已实测（删参→报第 462 行、删负向分支→报 4 条、恢复→绿）。
//   挂 OBSERVES + hard: true，不改 CHECKS 分母、不改退码口径。
// V1.40.0 | 2026-11-06 迭代：修 pickKeyLine「把变红的检查显示成通过」。
//   根因：调用方已算出 code（子进程退出码），却没告诉 pickKeyLine，它只取「最后一条命中词行」。
//   真实红脚本常先打 ❌ 明细行、末尾再打统计尾巴（「统计 100 项全过」/「exit=0」/「✅ 子项通过」），
//   而关键词表含 通过/全过/exit ⇒ 末条命中词行反倒是报喜行 ⇒ 夜间只看摘要行时红被说成绿。
//   真身负路径实测：喂「❌ 规则123 致命 + ✅ 子项通过 + exit=0」旧口径挑出「exit=0」。
//   修法：新增可选第二参 failed（=code!==0），为 true 时优先从命中词行里挑负向结论行；
//   绿路径（含一切不传参的旧调用）行为一字不变。★ 只改「显示哪一行」，不动 failed 计数 /
//   process.exit / CHECKS 分母 / 任何判据。两处实现（本件 + orphan-sweep）三要素保持同步，
//   供 output-label-coupling-guard 线二继续对账。
// V1.39.0 | 2026-11-06 迭代：挂「编排器自身完整性守门」tests/run-all-integrity-selftest.mjs（新建 V1.0.0）。
//   盲区（由 11-04/11-05 两晚夜间失败引出）：云端沙箱 /workspace/repo 被回收，任务连着两轮
//   在开头读日志就挂；任务书 11-06 实测「以 GitHub main 为基底只有 9/25、以 nightly/第179轮 为基底 22/25」
//   ⇒ 基底不对时体检会静默跑出一大片红，而整套体检没有任何一条守门检查「编排器自己还完不完整」。
//   本件三面：① 清单→磁盘断链（orphan-sweep 只盯反向）② V1.38.0 观察项显形不腐烂
//   ③ 拍板边界不被越（OBSERVES 段不许自增 failed）。★ 段内不变量必须在 OBSERVES 段内命中：
//   首版在全文里找 `typeof r.status` 被 CHECKS 段顶成假绿，真身负路径当场抓到并修，已固化为自证负路径 F。
//   挂 OBSERVES + hard: true（exit 1 = 体检域确定性缺陷），不改 CHECKS 分母，开红与否仍待拍板。
// V1.38.0 | 2026-11-05 迭代：修 run-all 观察项(OBSERVES)执行段的「假绿」——此前该段只 pickKeyLine
//   一行文字、把 r.status（退出码）整个丢掉，任一项 exit≠0 也统一打 🔎、汇总不点名，
//   等于「看得见但不拦」还看不清：确定型守门（如语法扫描 exit 1）被静默吞成噪声。
//   现补：读退出码 → 非 0 打 ❌ exit=N、收进 observeFails、末尾汇总点名；
//   确定型守门由条目自带 hard: true 声明（不另列名单，防第二份清单漂移），汇总时额外标注「建议升 CHECKS」。
//   ★ 边界：failed / process.exit / CHECKS 分母一律不动 —— 「拦不拦（计不计退码）」是拍板权，
//     本修复只补「看不看得见」，不擅自把观察项升红线、不改既有结论。
// V1.37.0 | 2026-11-05 迭代：挂「体检模块语法扫描守门」tests/health-rules-syntax-sweep.mjs（新建 V1.0.0）。
//   盲区：单个体检文件（尤其 health-rules/ 下 47 条浏览器运行时规则）若写出语法/解析错误，
//   整个 120/121 harness 会加载即崩、47 条规则全灭，而 registration-check 只核对登记不解析内容——
//   此前没有任何自检提前发现。本件 node --check 递归扫 tests/ 下所有 .js/.mjs（排除 .mut），零执行只解析，
//   负路径已实测（故意写坏文件→exit=1 报出）。挂 OBSERVES 不改分母，是否升 CHECKS 开红待拍板。
// V1.36.0 | 2026-11-05 迭代：补齐编排器漏接的三件真·node 自检（手写清单制盲区）。
//   程序化比对 run-all 登记清单(45) vs 磁盘 tests/*.mjs/*.js(54 候选) → 9 个在盘不在册；
//   其中 121/122/124 是浏览器 harness/工具、mutation-teeth 按注释故意单列、param-read-guard
//   历史上故意不接、run-all 自身——这 6 个排除合理；剩 3 个真·node 自检被漏在调度外：
//     · fact-coverage-selftest —— 引擎发射 factType ↔ 体检消费侧交叉覆盖（防新增机制静默瞎）
//     · manifest-fresh-selftest —— manifest.json 指纹新鲜度（防改代码忘跑 manifest-gen）
//     · registry-cross-check —— 三本中央登记簿交叉对账（只报不改）
//   三者 node 直跑均 exit=0（已验证），挂 OBSERVES 而非 CHECKS：不改分母（CHECKS 26 不变），
//   是否升 CHECKS 开红待拍板。本件让这三件守卫自此随体检秒级自动跑，不再靠人记得手动跑。
// V1.35.0 | 2026-11-02 夜间第 177 轮：OBSERVES 挂「强制开关登记漂移守门」
//     tests/force-switch-registry-drift-guard.mjs（新增 V1.0.0）。
//   ★ 立它的由头是同一份清单在 tools 侧已经漂移过三次、每次都靠人读注释时顺手发现：
//     tools/122-param-lab-core.js L47-49 注释自陈「原缺 forceHanLiSa / forceWeakElite /
//     forceSoloWeakElite（116 各补一项时这里没跟着同步）…暂不暴发」⇒ 不炸是因为当前没人走
//     那条通道，不是因为清单对。而 tests 侧这份（FORCE_KEYS）停在 3 条、主代码实读 8 条，
//     第 172 轮收口时就如实列为待办，挂了五轮仍是靠人翻日志才看得见。
//   ★ 四面：① 主代码读取面（剥注释后 GlobalStore.get / localStorage.getItem 双通道归一，8 条）
//     ② 轮盘抑制面 anyForce（6 条）③ tests 登记面 FORCE_KEYS（3 条，import 唯一来源不抄副本）
//     ④ 写入面 ui/701-main-utils.js（7 条，只报不判）。
//   ★ 两个差集只有一条判红：未登记（读而不认，5 条）= 能力缺口，逐条点名 + 棘轮上限 5 只许降；
//     幽灵（认而不读，0 条）= 拿 GlobalStore 当后门、喂进定向场次静默无效，判红。
//   ★ 本件不改 FORCE_KEYS 一个字（补登记=扩能力会改结论，须拍板），不抄第二份剥注释实现。
//     挂观察项不改分母（分母恒 25），理由同前几轮；是否升 CHECKS 开红待拍板。
// V1.34.0 | 2026-11-02 夜间第 176 轮：OBSERVES 挂「变异树新鲜度绊线」
//     tests/mutation-freshness-tripwire.mjs（新增 V1.0.0）。
//   ★ 立它的由头是第 174 轮那条备忘、第 175 轮原样沿用的：「变异树每四轮没跑就没人喊 —— 它是
//     观察项、不进分母、也不进体检调度，只有人记得才会跑。」
//   ★ 病根是 mutation-teeth 的 V2.9.0 新鲜度守卫**只在 --report 时才跑**：不跑变异树 ⇒ 不进那个
//     函数 ⇒ 陈旧结论静静躺着，体检 25 项一项不喊（第 170~173 轮连续四轮如此）。本件把「人记得
//     才跑」变成**每轮随体检秒级自动喊**。
//   ★ 分工刻意不重叠：守卫管「结果对不对」（指纹级，被动），本件管「多久没产出」（时间维度，
//     主动）。本件不抄一份指纹逻辑 —— 抄了就有两处判据，两处早晚分叉（第 173 轮第二份快照教训）。
//     挂观察项不改分母（分母恒 25），理由同前几轮；是否升 CHECKS 开红待拍板。
// V1.33.0 | 2026-11-01 专项：OBSERVES 挂「蓄意轰拳演出归属守门」tests/hls-playback-ownership-guard.mjs。
//   用户实报「玩家手动时 79 黑幕与 93 战场两个都演，回放/从机/自动只有 93 正好」。本件不判时长，
//   机械核对每条路径的演出者必须恰好 1：手动完整由 79 负责且 93 载荷短路，跳过/回放由 93 全套。
//   当前主代码仍是时间窗降级（79 全套 + 93 轻量 = 2），故本件如实报红；挂观察项不改分母。
// V1.32.0 | 2026-11-01 夜间第 172 轮：三份定向开关白名单收口为 tests/_lib/forced-case-normalize.mjs
//     唯一来源（fact-emission-census V1.4.0 / stat-decl-vs-actual-check V3.14.0 / rules-replay V6.11.0
//     三处内联副本消除；此前 rules-replay 那份缺 forceXieXun、两本账本那份缺 forceWei，三条挂账被这条
//     分叉卡住）。纯搬迁零行为变化，未动 CHECKS 一条判据、未放宽一项门槛。
// V1.31.0 | 2026-11-01 夜间第 170 轮：输出标签耦合守门 V3.0.0 → V3.1.0（段零解析侧地基换 scanRegexLiterals：
//     跳注释 + 跳字符串后抽真正则 ⇒ 剔除 153 条自产假正则、消掉第 169 轮那条「201hex 读取/解析失败」假候补；
//     自证牙 34 → 37 条）。仍然只为观察项，未动 CHECKS 一条判据、未放宽一项门槛。
// V1.30.0 | 2026-11-01 夜间第 169 轮：输出标签耦合守门 V2.0.0 → V3.0.0（段零配对口径由「逐字相同」升级为「骨架归一后子串包含」，据此认领线四「规则回放自检行场次标签 ⇄ coverage-report 正则」；自证牙 25 → 34 条）
//     tests/output-label-coupling-guard.mjs（见 OBSERVES 末项注释）。分母恒 25 不变：
//     新增为观察项，未动 CHECKS 一条判据、未放宽一项门槛。
//     ★ 起因是第 166 轮那条「只补标签不改判据」的备忘（账本对照里写「命中」的列其实是重复应用数），
//       本轮真去改才发现：**那一行是机械契约，不是给人看的文案** —— 两个脚本各写死一条正则解析它。
//       漏改一边，那一边**静默解析出 0 行**：不报错、不变红，只是悄悄没看见。
// V1.27.0 | 2026-10-31 夜间第 166 轮：OBSERVES 挂「小昭命名指称守门」tests/xiaozhao-naming-guard.mjs
//     ＋「九阴白骨爪三值同源取证」tests/claw-hit-shield-split.mjs（见 OBSERVES 末两项注释）。
//     分母恒 25 不变：新增均为观察项，未动 CHECKS 一条判据、未放宽一项门槛。
// V1.26.0 | 2026-10-31 夜间第 165 轮：OBSERVES 挂「巨马/carry 定向取证」
//     tests/xiaozhao-horse-carry-case.mjs（见 OBSERVES 末项注释）。分母恒 25 不变：
//     新增/订正均为观察项，未动 CHECKS 一条判据、未放宽一项门槛。
// V1.25.0 | 2026-10-31 夜间第 163 轮：OBSERVES 挂「信号通道守门（探针存活 + fact 藏匿点）」
//     tests/signal-channel-guard.mjs（见 OBSERVES 末项注释）。分母恒 25 不变：
//     新增/订正均为观察项，未动 CHECKS 一条判据、未放宽一项门槛。
// V1.24.0 | 2026-10-31 夜间第 162 轮：OBSERVES 挂「海克斯分库启动链守门」tests/hex-boot-chain-guard.mjs
//   （★ 上游把小昭.hexEnhance 从 content/200 整段迁到 content/201，并把 getSkillParams 改成
//     「只认 201、缺段即抛、不允许回落」，但**没给任何消费方补 loadHexEnhanceData** —— 本轮开场
//     25 项体检里 16 项以同一个 Error 崩掉（回放/基线/账本/fact普查/golden/fuzz…），红因一律写成
//     「201 缺 sister 段」，看着像数据文件丢了，实则是启动链没跟上迁移。本轮在 tests/ 与 tools/
//     共 20 个消费方补齐启动链，并立本件守门防复发：数据换了家、消费方没换钥匙这件事，从此有人点名。
//     挂观察项不改分母（同孤儿普查取舍）；是否升 CHECKS 开红待拍板）。
//     同轮一并挂「兄分支惑心定向取证」tests/phantom-confuse-brother-case.mjs（见 OBSERVES 末项注释）。
// V1.23.0 | 2026-10-31 夜间第 161 轮：OBSERVES 挂「蛛袭死目标定向取证」tests/spider-dead-target-case.mjs
//   （第 160 轮把稀有 spec 收口成 ⑤b-2「非样本缺口」6 条并点名 spiderDeadTarget / xinHunDeath
//     「最容易被误判成死代码」—— 而挂账一正等着拍板核销。★ 光有「自然流零命中」不能下结论：
//     零命中既可能是结构不可达，也可能是没喂样本，两者处置完全相反（一个可删、一个绝不能删）。
//     本件双向取证：① 静态自证目标池过滤式含 u.alive 且取值与判空之间无人改 alive；② 定向
//     扫描证明发射点真被走到（进入目标池次数可数，低于下限即红，不许拿零命中当结论）。
//     挂观察项不改分母，理由同前几轮）。
// V1.22.0 | 2026-10-29 夜间第 155 轮：OBSERVES 挂「守门人的守门人」tests/guard-presence-scan.mjs
//   （★ 第 154 轮给端到端断言补上了咬点（两通道 + 第三处 guardCheck），但那三处全在
//     commit-claim-audit.mjs 同一个文件里 —— 改这个文件的人顺手就能连 guardCheck 一起关掉，
//     关掉后本件自己也一起没了、谁也不报，正是第 153 轮牙K 那款病在上一层复发。本件把守门人的
//     守门人放到**另一个文件**：不调用它的函数、不读它的结果，只把它的源码当文本静态点名七条
//     不变量（定义 / 通道名单 / 两处登记 / 被调用 / 计进退码 / 结论行打印），且只在剥注释后的
//     真代码里认 ⇒ 注释里写一句兑不了声称。★ 它把第 154 轮牙C2 实证的"退码计入是承重件"
//     从挂账变成机械点名：维持现状口径不变，但谁也不许悄悄摘掉。挂观察项不改分母，理由同前几轮）。
// V1.21.0 | 2026-10-29 夜间第 153 轮：OBSERVES 挂「提交声称 vs 落盘对账」tests/commit-claim-audit.mjs
//   （★ 把第 152 轮人工发现的那款病 —— 第 151 轮声称"判据收紧为 RE_IMPORT_TRUTH"却没进提交、
//     验证态与交付态混淆 —— 变成机械点名：逐笔回溯夜间轮提交，把提交信息里点名的代码符号
//     与该笔 diff 的新增代码行对账。只点名不改退码，挂观察项不改分母，理由同前几轮）。
// V1.20.0 | 2026-10-28 夜间第 151 轮：OBSERVES 挂「第二份快照普查」tests/second-source-scan.mjs
//   （tests 下手写第二份剥注释实现的点名 + 棘轮；与第 147/148/149 轮同一取舍：挂观察项不改分母）。
// V1.19.0 | 2026-10-28 夜间第 149 轮：OBSERVES 挂「地基可携化」tests/foundation-portability.mjs。
//   第 148 轮只做到「地基缺失即报」，本件补上「缺失了能一键拿回来」：把地基分成有依赖方的可携化面
//   与无人认领的纯产物（后者实测 1.8GB，不分级就谈导出等于打包 1.8GB，那件事谁也不会去做）。
// V1.18.0 | 2026-10-28 夜间第 148 轮：OBSERVES 挂「沙箱易碎地基普查」tests/sandbox-fragility-scan.mjs。
//   由来见该脚本头注释：本轮开场沙箱工作区被整体重置，从 Gitee 重新克隆后体检由 13/24 变 12/24，
//   少的那一项是「牙口证据链对账」—— 不是代码退步，是它的证据地基 tests/.mut/teeth-results.txt
//   被 .gitignore 排除、不进 patch、换沙箱即归零。★ 挂它防的不是这一项红，而是「红得没有真因
//   却看起来像真因」：只看总数会读成夜间轮把体检搞退步了，于是去查一个不存在的代码回归。
//   与第 147 轮孤儿普查同一取舍：挂 OBSERVES 不改分母（24 不变），拍板开红再挪到 CHECKS。
// V1.17.0 | 2026-10-28 夜间第 147 轮：OBSERVES 挂「孤儿自检普查」tests/orphan-selftest-sweep.mjs。
//   由来见该脚本头注释：第 146 轮发现 tests/param-read-guard.mjs 今天是红的却不在本清单里
//   ⇒ 它红了多久无人知晓。★ 挂在 OBSERVES 而非 CHECKS 是刻意的：挂 CHECKS 会让体检分母由
//   24 变 25，属改既有结论须拍板（第 146 轮原话）；挂观察项则既不改分母、又天天在跑、结果可见。
//   哪天拍板要开红，把它从 OBSERVES 挪到 CHECKS 即可，该脚本逻辑一个字不用改。
// V1.16.1 | 2026-10-27 第143轮(续)：挂「打包清单完整性自检+自动补全」tests/pack-manifest-check.mjs（自动帮 106 补漏登的 tests 脚本，防包内套件缺文件）
// V1.16.0 | 2026-10-26 第 142 轮：退役规则 158（去锚定化后恒 skip 假绿），158 的 import/allRules/静态注册/打包清单四处摘除，由 123static-scan 的 deadFxAnchors 槽位代防回归；rule-teeth-evidence-selftest 吸收夜检138 增断言⑧结果新鲜度门（牙口证据停更即退码 1）
// V1.15.0 | 2026-10-26 第 140 轮：新增「版本号遗忘抬升绊线」tests/ver-bump-selftest.mjs（静态检查，防头注释与 VER 常量漂移，落下即退码 1）；fact 发射普查升为 CHECKS 守门项（第125轮）
// V1.13.0 | 2026-10-26 第 135 轮：CHECKS 新增第 20 项「版本常量漂移自检」（tests/ver-drift-selftest.mjs，
//   计退码）。动因：「头注释已写 Vx 而 VER 常量仍停在 Vy」这个漏改在本仓库已复发三次
//   （第 130 轮 V1.7.0/V1.6.0、第 132 轮顺手归位、第 134 轮点名留办），本轮实测又抓出两处真漏改
//   （本文件 V1.12.0 vs VER V1.10.0、translate-golden V1.0.1 vs VER V1.0.0）。
//   ★ 性质：VER 不是装饰 —— mutation-teeth 拿它当结果文件新鲜度键、多份自检对外自报版本，
//   数字说谎会让「我用的是哪一版判据」这个问题失去答案。故不再靠人眼，立自动绊线。
//   （本轮一并归位：VER 常量 V1.10.0 → V1.12.0 → V1.13.0。）
// V1.13.0 | 2026-10-25 第 125 轮：isDead 修复回归护栏（A 转交块落地闭环，heavy 采样项）
// V1.11.0 | 2026-10-25 第 123 轮：挂蝶血分支定向用例（第19项，计退码，带 MIN_HITS 棘轮）
// V1.10.0 | 2026-10-25 第 133 轮：CHECKS 新增第 15 项「牙口证据链对账」
//   （tests/rule-teeth-evidence-selftest.mjs），体检项 17 → 18。
//   动因：牙口矩阵是 154 条哨兵分支**唯一**的牙口证据来源，而这份证据正在悄悄腐烂且无人盯守
// tests/run-all.mjs | ~4400 bytes | V1.20.0 | 2026-10-31 CHECKS 新增「分层依赖方向(新增闸门)」
//   （tests/hit-shapes-consistency.mjs，新检查，放在静态契约一致性之后——秒级、纯静态对账）
// 一键全量体检：串行跑齐 node 侧全套红线（七项常规 + 大样本 fuzz），最后出一页「谁绿谁红」汇总，任一红则退出码 1。
// 背景：浏览器 120test-runner.html 的「一键体检」只覆盖浏览器那一层（UI/规则/不变量）；
//       node 侧回放/账本/基线/覆盖率/fuzz 此前要手敲多条命令、没有总入口，本脚本补上这个总入口。
// 用法：node tests/run-all.mjs
//   不含变异牙齿（mutation-teeth 全量约 8 分钟、会生成 tests/.mut 临时树），需要时单独跑。
//   子脚本的环境变量可透传，例如 SEEDS=1,2 STAGES=2 node tests/run-all.mjs（影响回放）。
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 第 161 轮冲突裁决：上游 V1.20.0 与本线 V1.22.0 各自独立演进，取本地更高版本 V1.22.0；
//   上游新增的 CHECKS 项「分层依赖方向(新增闸门)」作为新红线**保留**（非放宽，不删上游闸门）。
export const VER = 'tests/run-all.mjs V1.48.0';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const node = process.execPath;

// 十项红线（V1.1.0 起），顺序 = 从快到慢、从结构到数值
const CHECKS = [
    { name: '静态扫描(import/枚举)', script: 'tests/123static-scan.js', args: [] },
    { name: '分层依赖方向(新增闸门)', script: 'tests/layer-direction-scan.mjs', args: ['--enforce'] },
    { name: '静态契约一致性(门槛/翻译器)', script: 'tests/contract-consistency.mjs', args: [] },
    { name: '蓄意轰拳数值口径对账', script: 'tests/hit-shapes-consistency.mjs', args: [] },
    // V1.15.0 | 2026-10-26 第 140 轮：挂「版本号遗忘抬升绊线」tests/ver-bump-selftest.mjs。
    //   头注释 Vx 与 export const VER 的 Vx 不一致（只抬一头）是体检代码反复踩的坑（夜检 135 立线前已复发 ≥3 次，
    //   本轮初扫出 tests/ 下 16 处漂移）。此线静态扫全部 tests/*.mjs/*.js，两端声明不一致即退码 1，落下即咬。
    //   140-baseline.js 因 VER 耦合入库基线 JSON（用户挂 hold 待拍板）被豁免，不拦门。
    { name: '版本号遗忘抬升绊线', script: 'tests/ver-bump-selftest.mjs', args: [] },
    { name: '精英注册一致性', script: 'tests/registration-check.mjs', args: [] },
    { name: '规则回放(20seed×7关)', script: 'tests/rules-replay.mjs', args: [] },
    { name: '胜负基线闸门(18场)', script: 'tests/140-baseline.js', args: ['--check'] },
    { name: '无头冒烟', script: 'tests/smoke-headless.mjs', args: [] },
    { name: '账本对照(声明vs实际)', script: 'tests/stat-decl-vs-actual-check.mjs', args: [] },
    { name: '静默位移判据自检(离线断言)', script: 'tests/silent-relocate-judge-selftest.mjs', args: [] },
    // V1.39.0 | 2026-11-08 夜间第 195 轮：挂「韦一笑吸血额度判据自检」tests/wei-leech-quota-selftest.mjs。
    //   159 的判据 A2 本轮由「heal ≤ 出手快照缺口」改为「heal ≤ nominal ≤ actual」额度自洽链
    //   （快照 hp 是 fmtHp 取整值、且同帧前序吸血已抬 maxHp，快照缺口不是落账缺口）。
    //   ★ 放宽必须同时证明仍能咬住 —— 否则就是拿改判据换绿灯。回放里修前 fail=1 / 修后 fail=0，
    //     看不出「报大数」这类回归是否还被咬住，故离线补 12 条（正向 5 / 反向 7）。
    { name: '韦一笑吸血额度判据自检(离线断言)', script: 'tests/wei-leech-quota-selftest.mjs', args: [] },
    // V1.39.0 | 2026-11-08 夜间第 195 轮：挂「流星成长渲染判据自检」tests/meteor-growth-render-selftest.mjs。
    //   155 曾因只认「攻击+N」而在 156 场里恒空转（主代码 negative 成长写「攻击-N」），
    //   而 153 头注称「单位名缺失/渲染两遍已拆到 155」、实现里却只剩成长量一条 ⇒ 两块覆盖双重失守。
    //   修正则后必须证明仍能咬住，故离线补 7 条（反向 3 / 正向 3 / skip 1）。
    { name: '流星成长渲染判据自检(离线断言)', script: 'tests/meteor-growth-render-selftest.mjs', args: [] },
    // V1.4.0 | 2026-10-24 第 127 轮：挂「对照器守卫自检」tests/contract-guard-selftest.mjs。
    //   18 颗 ATTR 变异牙的判定是「规则无牙·对照器兜住」——对照器是它们**唯一**的证据来源，
    //   却一直没配离线自检（第 125 轮立的通规：白名单型判据都是回放盲区，须逐个补自检）。
    //   自检五条：契约表可解析 / 干净树零命中 / 恒空转契约棘轮 / 牙→契约归属表存在 / 守卫非死契约。
    { name: '对照器守卫自检(离线断言)', script: 'tests/contract-guard-selftest.mjs', args: [] },
    // V1.5.0 | 2026-10-24 第 128 轮：挂「契约绑定键漂移自检」tests/contract-binding-drift-selftest.mjs。
    //   盯的是"契约跟主代码之间的接线"：绑定键字面量在主代码全库是否存在（防契约过期）、
    //   FACT_TYPES 引用是否仍在枚举里、契约绑定的账本 group 是否在标准样本里真的有词条。
    //   本轮就是靠这条口径挖出 HLS_JIUYANG_HEAL 的真·假绿（旧键零命中）。
    { name: '契约绑定键漂移自检(离线断言)', script: 'tests/contract-binding-drift-selftest.mjs', args: [] },
    // V1.6.0 | 2026-10-24 第 129 轮：挂「规则绑定键漂移自检」tests/rule-binding-drift-selftest.mjs。
    //   第 128 轮在契约侧立了"绑定键漂移"口径并留了下轮目标：把它横向铺到规则侧。本轮交的是
    //   低噪声抽取口径 —— 先剥注释，再只取**判据匹配位**（比较/包含/分支/正则片段）上的中文字面量，
    //   配三类免检（模板拼装 / 规则自身文案 / 反向哨兵白名单·棘轮），把 416 条原始字面量压到
    //   154 条真判据键、11 条留痕免检，避免误报刷屏。盯的是"规则跟主代码之间的接线"：
    //   规则靠哪个中文字面量认领战报，主代码改名而规则没跟上 ⇒ 判据恒不命中（恒空转或恒绿）。
    { name: '规则绑定键漂移自检(离线断言)', script: 'tests/rule-binding-drift-selftest.mjs', args: [] },
    // V1.7.0 | 2026-10-25 第 130 轮：挂「规则恒空转自检」tests/rule-idle-selftest.mjs。
    //   契约侧早有「恒空转契约」棘轮（contract-guard-selftest 第③条），规则侧一直没有同款 ⇒ 本项补上。
    //   口径：跑标准样本（20seed×7关=140 场）回放取逐条 pass/fail/skip，恒空转 = pass=0 且 fail=0；
    //   该集合必须**恰好等于**白名单（只许收缩：新增恒空转 ⇒ 红，白名单条目被激活 ⇒ 红），
    //   再加白名单名/文件在册两道腐烂检测与样本规模、规则条数两道闸门（防自检静默恒绿）。
    { name: '规则恒空转自检(离线断言)', script: 'tests/rule-idle-selftest.mjs', args: [] },
    // V1.8.0 | 2026-10-25 第 131 轮：挂「判据分支级空转自检」tests/rule-branch-idle-selftest.mjs。
    //   第 130 轮补的是**规则级**（整条规则判定过没有），本项补**分支级**（判据分支掉没掉牙）。
    //   为什么必须补：「规则 pass=140」不代表它的 fail 分支判据被验证过 —— 第 44 轮 136 号规则
    //   正是这一款（锚点行被主代码删了 ⚡，规则照样 pass=51，复发信号分支永久沉默）。而**掉牙是
    //   静默事件**：分支不再触发只会让回放从"有失败"变"无失败"，越变越绿，没有任何东西会报警。
    //   口径：静态抽取每个 fail 分支的 msg 静态前缀作指纹，跑真实回放落盘 fired msg 做前缀匹配；
    //   把**已咬过的分支钉成基线**（只许收缩），配规模闸门 / 无指纹白名单 / 基线在册 / 匹配率五条。
    //   V1.1.0 | 第 132 轮收紧：指纹抽取只取到 msg 语句结束（防变量 msg 误取后续字符串造假指纹），
    //   并新增断言⑥「同规则内指纹不得相同/互为前缀」——撞车会让分支级判定静默退化成规则级，
    //   报告却照样写"分支级自检通过"。配套把 158 条分支指纹全修成可区分，无指纹盲区 10 条清零。
    //   ★ 刻意不把 145 条未命中分支刷成噪声：它们绝大多数是回归哨兵本就不该触发的正确形态，
    //     要证明"哨兵有牙"靠的是变异树取证（牙口矩阵），不是本自检。
    { name: '判据分支级空转自检(离线断言)', script: 'tests/rule-branch-idle-selftest.mjs', args: [] },
    // V1.10.0 | 2026-10-25 第 133 轮：挂「牙口证据链对账」tests/rule-teeth-evidence-selftest.mjs。
    //   第 14 项只钉住**曾经咬过的分支**（158 条里只有 4 条在日常样本命中），其余 154 条哨兵
    //   "有牙还是没牙"靠的是**变异树取证**（46 颗牙，牙口矩阵）——那是整个分支级判定的证据地基。
    //   本项盯的就是**这份证据地基配不配得上当前代码**：
    //     · 证据文件是第 127 轮（HEAD=e93c6e7）的产物，之后 129/132 轮各改了 21 个规则文件；
    //     · 实测已有 3 条牙口结论对不上号（143 九阳、154 生生不息加攻属「文案被改型」，
    //       135 破防属「聚合外壳型」），而 mutation-teeth 自带的新鲜度守卫四项**一项都盯不到
    //       规则文件被改** ⇒ 牙口矩阵文档顶上至今写着「新鲜度守卫：通过」。
    //   做法：不做 mtime 比较（会被 touch / git checkout 刷新 ⇒ 假阳性，且说不出"哪条作废"），
    //   改做**实质对账**——拿证据里每条 msg 到当前规则文件里找分支指纹，找不到就是真对不上号了。
    //   七条断言：证据规模 3 / 可解析率 / 腐烂棘轮 / 覆盖面 / 规则名在册 / 运行时交叉验证 / 聚合型棘轮。
    //   ★ 本轮实测还钉出 6 条**聚合型分支**（166 一条指纹承载 7 种子病因、158 承载 5 种）：
    //     掉其中任何一种都看不出来，属分支级判定的黑洞，已逐条列出请用户拍板是否拆分。
    //   ★ 处置口径：不修数据、不重录证据 —— 那等于把证据改成配得上代码，方向反了；
    //     正确处置是重跑变异树，复通后腐烂白名单自然收缩。
    { name: '牙口证据链对账(离线断言)', script: 'tests/rule-teeth-evidence-selftest.mjs', args: [] },
    // V1.11.0 | 2026-10-25 第 123 轮：挂「小昭·妹永久嗜血·蝶血分支定向用例」——
    //   结构扫描器报 isBrother=true 父196/分支0 的最后一环覆盖缺口（第122轮定性：样本稀缺+
    //   行动权竞争）。本用例强制妹模式广扫，实测命中 52 次，断言 fact/渲染/账本三对照；
    //   带 MIN_HITS=3 棘轮 + 咬牙实证（打断 picker 永久继承即红）。tier=heavy（采样项，--quick 跳过）。
    { name: '蝶血分支定向用例(妹永久嗜血)', script: 'tests/xiaozhao-brother-leech-case.mjs', args: [], tier: 'heavy' },
    // V1.13.0 | 2026-10-26 第 135 轮：挂「版本常量漂移自检」tests/ver-drift-selftest.mjs（第 20 项，计退码）。
    //   盯的是「头注释版本日志已写到 Vx，脚下 VER 常量还停在 Vy」这个漏改 —— 已复发三次，本轮实测
    //   抓出两处真漏改（本文件、translate-golden）。秒级、纯静态，放在采样项之前。
    { name: '版本常量漂移自检(离线断言)', script: 'tests/ver-drift-selftest.mjs', args: [] },
    // V1.13.0 | 2026-10-25 第 125 轮：isDead 修复回归护栏（A 转交块落地闭环）。
    //   蛛袭/寒毒由「恒false的!alive」改为正确致死判定；护栏跑样本对局断言 isDead===true 至少命中
    //   MIN_HITS 次（退回恒false会归零变红），并诊断 true 目标是否确死（防飞天免疫误判）。tier=heavy。
    //   ★ 第 139 轮合并时与本地第 20 项同位置冲突，两条都保留（盯的是两件事：版本常量漂移 / isDead 回归）。
    { name: 'isDead修复回归护栏(蛛袭/寒毒)', script: 'tests/isdead-fix-guard.mjs', args: [], tier: 'heavy' },
    { name: '覆盖率/空转红线', script: 'tests/coverage-report.mjs', args: [] },
    // V1.14.0 | 2026-10-25 第 125 轮·续：fact 发射普查升级为**守门项**——deadEnum / orphanSpec（零发射点可靠红）
    //   直接 EXIT 1 拦构建；rare/silent/blind 仅诊断不拦。NINE_YANG_HEAL 清理后即全绿，回归再引入僵尸 fact 立即咬。
    { name: 'fact 发射普查(契约腐烂守门)', script: 'tests/fact-emission-census.mjs', args: [] },
    // V1.12.0 | 2026-10-25 第 124 轮：fuzz(2100场) 与 翻译golden(35场/13MB) 是耗时主因，
    //   标记 tier=heavy —— --quick 模式下跳过，仅守门项跑（每次开发迭代不必重跑大样本）；
    //   nightly 自动化不带 --quick 仍跑全量，不漏回归。
    { name: '大样本fuzz(300seed×7关)', script: 'tests/fuzz-invariants.mjs', args: [], tier: 'heavy' },
    { name: '翻译层golden对照', script: 'tests/translate-golden.mjs', args: [], tier: 'heavy' },
    // V1.16.1 | 2026-10-27 第143轮(续)：挂「打包清单完整性自检+自动补全」tests/pack-manifest-check.mjs。
    //   自动帮「工具文件复制器」(tools/806-ai-pack-config.js 的 ALL_PROJECT_FILES) 检测漏登：
    //     ① 全部 tests/health-rules/*.js（rules-replay 走 readdir 自动加载，漏登=包内静默丢弃该规则）
    //     ② run-all CHECKS/OBSERVES 里 script: 指向的 tests/*（spawnSync 直跑，漏登=包内找不到文件即跳过/报错）
    //   任何磁盘有、清单漏登的，它自行补进 106 的 tests 段并抬版本号；反向陈旧条目仅告警不删。
    { name: '打包清单完整性(自动补全106)', script: 'tests/pack-manifest-check.mjs', args: [] }
];

// V1.2.0 | 2026-10-21 第 112 轮：挂观察项（不影响退码）——第 113 轮沙箱交接规格的主线重写产物。
//   观察项 = 取证类探针：结论供人工研判，暂不开红（死字段缺陷本身待主代码转交，开了就永远红）。
//   实测合计约 5 秒（定向用例 1.9s + 死字段普查 3.1s）。
const OBSERVES = [
    { name: 'XIN_HUN_DEATH定向用例', script: 'tests/xinhun-death-targeted-case.mjs', args: [] },
    { name: '载荷死字段普查', script: 'tests/fact-dead-field-scan.mjs', args: [] },
    // 第 123 轮新增：结构不可达分支扫描（静态层级错位 + 动态分支指纹零命中），同样不计退码
    { name: '结构不可达分支扫描', script: 'tests/structural-dead-branch-scan.mjs', args: [] },
    // V1.17.0 | 2026-10-28 夜间第 147 轮：孤儿自检普查（磁盘有、本清单无的 tests 脚本逐个跑一遍，
    //   报出"红了但没人盯"的盲区）。挂观察项不改分母，理由见头顶 V1.17.0 日志行。
    { name: '孤儿自检普查(不在清单里的)', script: 'tests/orphan-selftest-sweep.mjs', args: [] },
    // V1.18.0 | 2026-10-28 夜间第 148 轮：沙箱易碎地基普查（体检项依赖的被 .gitignore 排除的产物，
    //   缺了就让体检项以「假退步」的面目转红）。挂观察项不改分母，理由见头顶 V1.18.0 日志行。
    { name: '沙箱易碎地基普查', script: 'tests/sandbox-fragility-scan.mjs', args: [] },
    // V1.19.0 | 2026-10-28 夜间第 149 轮：地基可携化（认领分级 + 快照导出/回灌/对账 + 枚举面三视图）。
    //   挂观察项不改分母，与孤儿普查、地基普查同一取舍（挂 CHECKS 会让分母 24 变 25，须拍板）。
    { name: '地基可携化', script: 'tests/foundation-portability.mjs', args: [] },
    // V1.20.0 | 2026-10-28 夜间第 151 轮：第二份快照普查（tests 下手写第二份「剥注释/串掩码」实现
    //   的点名 + 棘轮；本轮已把 _lib/rule-branch-extract 与 rule-binding-drift-selftest 两份收口为
    //   公共件唯一来源，123static-scan.js 因浏览器双用点名挂账）。挂观察项不改分母，理由同上。
    { name: '第二份快照普查', script: 'tests/second-source-scan.mjs', args: [] },
    // V1.21.0 | 2026-10-29 夜间第 153 轮：提交声称 vs 落盘对账（提交信息里点名的代码符号 vs
    //   该笔提交实际 diff 的新增代码行；证据只认剥注释后的 .js/.mjs 代码，不认 .md 散文 ——
    //   否则日志里写一句就把声称"兑现"了，正是第 149/151/152 三轮反复发作的那款病）。
    //   挂观察项不改分母，与孤儿普查、地基普查、第二份快照同一取舍。
    { name: '提交声称vs落盘对账', script: 'tests/commit-claim-audit.mjs', args: [] },
    // V1.22.0 | 2026-10-29 夜间第 155 轮：守门人的守门人（静态点名第 154 轮那套端到端守门人还在不在）。
    //   ★ 关键在"另一个文件"：本件不调用 commit-claim-audit 的任何函数、不读它的运行结果，只把它的
    //     源码当文本扫一遍 ⇒ 那边被整段关掉，本件照样独立复现并报出来（第 154 轮残余边界的解法）。
    //     七条不变量里第⑥条（guardFails 必须计进退码）即第 154 轮牙C2 实证的承重件，本轮从挂账变机械点名。
    //     挂观察项不改分母，与孤儿普查 / 地基普查 / 第二份快照 / 提交对账同一取舍。
    { name: '守门人的守门人', script: 'tests/guard-presence-scan.mjs', args: [] },
    // 第 161 轮冲突裁决：上游 V1.20.0 的闸门说明文字保留在注释里，实际闸门项已在 CHECKS 第 2 项
    //   （tests/layer-direction-scan.mjs --enforce）落地，本线 V1.21.0/V1.22.0 三项观察一个不丢。
    //   上游原注：存量基线 tests/layer-direction-baseline.json 目前为空；只拦新增反向边/环。
    // V1.23.0 | 2026-10-31 夜间第 161 轮：蛛袭死目标定向取证（SPIDER_DEAD_TARGET 到底是不可达
    //   还是没喂样本）。挂观察项不改分母，理由见头顶 V1.23.0 日志行。
    { name: '蛛袭死目标定向取证', script: 'tests/spider-dead-target-case.mjs', args: [] },
    // V1.24.0 | 2026-10-31 夜间第 162 轮：海克斯分库启动链守门（content/002-hex-enhance.json 迁出 200 后，
    //   ★ 上游迁移时没有任何消费方补 loadHexEnhanceData ⇒ 本轮开场 25 项体检里 16 项以同一个
    //     「201 缺 sister 段」崩掉，红因看起来像数据丢了，实际是启动链没跟上迁移。本件三段取证：
    //     ⓪ 数据面（201 两段键数棘轮 + 200 无副本）、① 启动链成对点名、② 运行期真取一次。
    //     挂观察项不改分母（与孤儿普查同一取舍）—— 是否升 CHECKS 开红，留待拍板。
    { name: '海克斯分库启动链守门', script: 'tests/hex-boot-chain-guard.mjs', args: [] },
    // 2026-11-08：海克斯强化接线守门（002 配置键 ↔ 代码消费方 ↔ 运行期派发 + 缺键语义 + 单/双档位）
    { name: '海克斯强化接线守门', script: 'tests/hex-enhance-wiring-guard.mjs', args: [] },
    // 2026-11-08：双海克斯效应哨兵（新建 V1.0.0）。
    //   接线守门只证明"敌方也能选到 buff"，rules-replay 的 ENEMY_HEX 统计只证明"buff 挂到了敌方身上"，
    //   两者都证明不了"敌方海克斯对战斗结果有任何影响" —— 阵营取值错、快照重建丢 buff、加成只读己方，
    //   计数照样漂亮。本件同一批场次跑双档/单档两遍，逐场比胜负+回合数+双方总损血，零差异即判红。
    //   子进程跑 rules-replay（STATS=1 指纹行），不看其退出码（其红来自其他规则）；hard: true。
    { name: '双海克斯效应哨兵', script: 'tests/hex-dual-effect-check.mjs', args: [], hard: true },
    // 2026-11-08：海克斯三边闭环（配置值 → 消费方 → 实际生效值）。
    //   改 live 配置值，302 派发必须原样返回、215 实际加成必须跟着变；同时扫死键与反向缺口。
    //   内存内改值立即还原，不碰 content/；hard: true（闭环断裂即是确定性事实）。
    { name: '海克斯配置三边闭环', script: 'tests/hex-config-closure-check.mjs', args: [], hard: true },
    // 2026-11-08：逐条目双档覆盖（CONFIG.BUFFS 全键，敌方定向挂载 vs 零 buff 基线）。
    //   默认哨兵只证"双档整体有影响"，本项补"每个条目单独都能改变战局"；零差异只记录不判红。
    { name: '海克斯逐键双档覆盖', script: 'tests/hex-dual-effect-check.mjs', args: ['--keys'], hard: true },
    // V1.24.0 | 2026-10-31 夜间第 162 轮：兄分支惑心定向取证（承接【最高·下轮】⑤b-2 逐个配定向用例）。
    //   ★ 实测逼出一件被漏掉的事：phantomConfuse 有**两个**发射点，第 160 轮只数了成昆那个就下了
    //     「干净树本就不发射」的结论；兄分支走 forceXiaoZhao=brother，根本不需要 forceChengKun。
    //     本件三段：静态自证发射点 + 定向扫描 + ★ 信号通道取证（信号零触发时结论一律判 UNKNOWN，
    //     不许拿零命中当"不可达"证据）。挂观察项不改分母，同上。
    { name: '兄分支惑心定向取证', script: 'tests/phantom-confuse-brother-case.mjs', args: [] },
    // V1.25.0 | 2026-10-31 夜间第 163 轮：node 侧信号通道守门 + fact 藏匿点体检（新增）。
    //   ★ 本轮连挖两个「测量口径错误」，两个都差点变成「按死代码核销」的依据：
    //     (1) 信号探针：上一次版在开头 eventBus.on 一次，而引擎每回合 eventBus.clearAll()
    //         （core/210-battle-round.js:142 + core/206-battle-runner.js 顶部注释）⇒ 计数恒 0，
    //         上轮据此推断「node 回放通道不发 BEFORE_SELECT_TARGET」（疑点乙）。本轮换成
    //         tests/_lib/signal-probe.mjs 的跨回合存活探针后实测 42 场发 3443 次 ⇒ 疑点乙证伪、撤回。
    //     (2) fact 藏匿点：幻影 fact 挂在 attackFact.data.phantomFact，与 data.entries 并列、
    //         不在 entries 里 ⇒ 全仓库扫 fact 的脚本一条都没看见（本件 ③ 点名四个扫描器）。
    //         补上前：兄分支/成昆分支皆「0 次」；补上后实测 **107 / 96 次** ⇒ 发射点活得好好的，
    //         phantomConfuse 须由 ⑤b-2 挪进 ⑤b-3「定向已覆盖·严禁按死代码核销」。
    //   本件防的是同一款病的复发面：**不是产品没有，是我们没接到**。挂观察项不改分母，同上。
    { name: '信号通道守门(探针/fact藏匿点)', script: 'tests/signal-channel-guard.mjs', args: [] },
    // V1.26.0 | 2026-10-31 夜间第 165 轮：xiaoZhaoHorse / xiaoZhaoCarryApply 定向取证（新增，
    //   承接第 164 轮【最高·下轮】⑤b-2 剩 3 条逐个配定向用例；spiderDeadTarget 已由上上轮件覆盖）。
    //   ★ 动手前先纠正登记口径：census 把这两条记成「要**妹**永久…」，读源码却都在**兄模块**
    //     （modules/323-elite-mingjiao-xiaozhao-brother.js L249 / L274）且读**兄**的 _permanentBuffs
    //     ⇒ forceXiaoZhao=brother 这条现成通道即可取证，当初「需变异树」的定性不成立。
    //     实测 140 场：巨马 454 就绪 / 211 命中，carry 167 就绪 / 101 命中 ⇒ 双双由 ⑤b-2 移入 ⑤b-3。
    //     新增别处没有的**白名单自证**：addPermanentBuff 只认 CONFIG.XIAO_ZHAO_PERMANENT_BUFFS，
    //     键不在白名单 ⇒ 永久表永不会有它 ⇒ 那才是**真·结构死代码**；这一条此前从没被数过。
    //   挂观察项不改分母，同上。
    //   （第 166 轮勘误：上面「登记写妹、源码都在兄模块」这半句说反了 —— 见下条守门的头注释，
    //    游戏侧叫「小昭·妹」的单位代码侧就是 Brother，两者同一实体，谁也没记错；
    //    摘牌结论成立、归因更正，详见 tests/xiaozhao-naming-guard.mjs。）
    { name: '巨马/carry定向取证', script: 'tests/xiaozhao-horse-carry-case.mjs', args: [] },
    // V1.27.0 | 2026-10-31 夜间第 166 轮：挂两个件，都起因于「同一个东西有两个名字/两个值」。
    //   ① 小昭命名指称守门（新增）—— 承接第 165 轮【最高·下轮】「回头重扫 ⑤b 登记文案里有没有
    //     同款『妹/兄』记错的」。扫出来的答案是：**不存在谁记错，是这游戏对小昭用双轨命名**
    //     （游戏名 小昭·妹 ≡ 代码标志位 isXiaoZhaoBrother；modules/317-elite-mingjiao.js L28 的
    //     registerElite 与 modules/330-battle-init.js L261 的显示名三元可互证）。
    //     ★ 双轨命名改不掉（要动主代码与全部文案，须拍板），但**它能造出来的误判可以机械拦住**：
    //       段一从主代码机械抽取映射并交叉对账（哪天上游改了命名，本件立刻报 ⇒ 全库旧文案须重扫）；
    //       段二逐条核 ⑤b 登记文案必须带机械指称（isXiaoZhaoBrother|Sister / forceXiaoZhao 取值 /
    //       modules 路径+L行号），不许只写「妹/兄」口语指称。
    //   ② 九阴白骨爪三值同源取证（新增）—— 本轮 merge 上游后**凭空多出两项红**（账本对照 CLAW_HIT
    //     ＋ 对照器守卫 ②），追进去是同一根因：上游给九阴白骨爪加了护盾抵扣（core/16 L276-285），
    //     只把结算与账本改成 hpLoss，**没同步 fact**（L292 仍是 applied）⇒ fact ≠ 账本 = 实际。
    //     而 render/412-facts-stat.js L192 正拿 fact.dmg 拼玩家看到的伤害文本
    //     ⇒ **玩家看到的伤害 ≠ 目标实际掉血**。这是产品对外承诺的数字与落地数字分叉，
    //     不是体检测量口径问题（若 fact 只被体检读，改契约即可；它被对外显示读 ⇒ 须拍板）。
    //   挂观察项不改分母（分母恒 25），理由同前几轮；是否升 CHECKS 开红待拍板。
    { name: '小昭命名指称守门', script: 'tests/xiaozhao-naming-guard.mjs', args: [] },
    { name: '九阴白骨爪三值同源取证', script: 'tests/claw-hit-shield-split.mjs', args: [] },
    // V1.31.0 | 2026-11-01 夜间第 170 轮：输出标签耦合守门 V3.0.0 → V3.1.0
    //   —— 段零的**解析侧地基**换新：原先拿 RE_LITERAL 粗扫，源码里任意两个斜杠都当正则，于是
    //      注释正文和字符串里的路径斜杠能自产「解析侧」。第 169 轮留下的那条待认领候补
    //      （content/002-hex-enhance.json 读取/解析失败）就是这么来的：**打印侧自己配对自己**。
    //       ⇒ 本轮给它判了无罪：那不是耦合，是扫描器的假候补（已由牙 Z5/Z6/Z7 三种形态钉死）。
    //   挂观察项不改分母（分母恒 25），理由同前几轮；是否升 CHECKS 开红待拍板。
    // V1.30.0 | 2026-11-01 夜间第 169 轮：输出标签耦合守门 V2.0.0 → V3.0.0（段零口径升级 + 认领线四）。
    //   ★ 起因（第 167 轮）：第 166 轮留下一条「只补标签不改判据」的备忘 —— 账本对照逐契约打印的
    //     那一行里列名写「命中」，装的却是 s.dup（**重复应用**数）。照办时才发现**那一行是机械
    //     契约**：tests/mutation-teeth.mjs（取 statByContract 供牙口归属）与
    //     tests/contract-guard-selftest.mjs（取 hit 列判「干净树脏契约」）各写死一条正则解析它。
    //     ⇒ 只改生产者、漏改消费者，那一个就**静默解析出 0 行**：不是报错、不是变红，
    //       是悄悄变成没看见（contract-guard 会因此把脏契约放过 = 真·假绿）。
    //   ★ 第 167 轮只钉了这一条线，并留话「同款耦合在 tests/ 里大概率不止一处，别再靠人记哪两边
    //     是配对的」。第 168 轮照办，把它泛化成**认领表 + 普查**：
    //     · 线一（沿用）账本对照列名 ⇄ 两个写死正则的消费者；
    //     · 线二（新增）结论行挑选口径 pickKeyLine —— run-all 与 orphan-selftest-sweep 各存一份
    //       逐字相同的实现，orphan 那份注释自己写着「口径照抄 run-all，两处保持一致」，而这句话
    //       此前**只有人话在守**；
    //     · 线三（新增，★ 由段零普查自己扫出来的）崩溃判定口径 CRASH_RE —— contract-binding-drift
    //       -selftest 与 contract-guard-selftest 各存一份逐字相同，连合成样本 synthCrash 都一样；
    //       它判的是「子进程算不算崩了」，分叉即**一边判红、一边判绿**，比线二更危险；
    //     · 段零（新增）未认领耦合普查：机械扫 tests/ 里跨文件逐字相同的中文正则，扣掉认领表后
    //       逐条点名 ⇒ 下一条线不用等人想起来。★ 认领线三后本轮扫出 0 条，已如实打印并说明
    //       「扫描器还能不能咬由段四牙 P~S 单独证明」，不把「0 条」当空转也不当没事。
    //   挂观察项不改分母（分母恒 25），理由同前几轮；是否升 CHECKS 开红待拍板。
    { name: '输出标签耦合守门', script: 'tests/output-label-coupling-guard.mjs', args: [] },
    // V1.33.0 | 2026-11-01 专项：蓄意轰拳「一次爆发只能有一个演出者」。
    //   ① 手动完整：79 全套、93 必须 0（不是轻量）；② 跳过/回放/从机/自动：只有 93 全套。
    //   只读源码、不 import 主代码；当前是「79 + 93轻量=2」故报红，挂观察项不计退码。
    { name: '蓄意轰拳演出归属守门', script: 'tests/hls-playback-ownership-guard.mjs', args: [] },
    // V1.34.0 | 2026-11-02 夜间第 176 轮：变异树新鲜度绊线（新增 V1.0.0），详见头顶 V1.34.0 日志行。
    //   ① 本地实时：结果文件 #META HEAD 落后当前 HEAD 几笔提交（.mut 被 gitignore ⇒ 换机器后必然
    //      无迹可寻，如实报，不假装新鲜）；② 跨机器：日志里最后一次跑变异树的轮次 vs 最新轮次，
    //      并把匹配到的原文行摊出来供人工核验（启发式认错了人一眼能看出来）。
    //   带双向牙 Z1~Z7（老 HEAD 必报 / 当前 HEAD 不报 / 缺 HEAD 不放行 / 空文件不放行 /
    //   日志轮差大必报 / 「未跑」不得认成产出 / 正负同现取负面），跑 --selftest 可复核。
    //   V1.1.0 | 2026-11-08 夜间第 189 轮：识别器补三条独立正字面（树数计量词 / --emit-prep 与
    //      --emit-run 三连同现），牙扩到 Z1~Z13。由头是真漏报：第 186/188 轮都全量重跑过 48 棵树，
    //      但日志写作「全量重跑 48 棵树」不含「变异树」紧邻动作词 ⇒ 认不出 ⇒ 第 189 轮开场误报轮差 5。
    //      同时定死边界：只跑 --report 不算产出（只读旧结果，不产新证据），Z13 反向咬住。
    //   挂观察项不改分母，理由同前几轮。
    { name: '变异树新鲜度绊线', script: 'tests/mutation-freshness-tripwire.mjs', args: [] },
    // V1.35.0 | 2026-11-02 夜间第 177 轮：强制开关登记漂移守门（新增 V1.0.0），详见头顶 V1.35.0 日志行。
    //   四面：① 主代码读取面（双通道归一，8 条）② 轮盘抑制面 anyForce（6 条）③ tests 登记面
    //   FORCE_KEYS（3 条）④ 写入面 dev 通道（7 条，只报不判）。
    //   未登记 5 条不判红（补登记属扩能力须拍板）+ 棘轮上限 5 只许降不许升；幽灵（认而不读）判红。
    //   带双向牙 Z1~Z10（多读必进未登记 / 幽灵必判红 / 一致必 PASS / 缺 anyForce 不放行 / 零解析
    //   不放行 / 注释不算数 / 双通道归一 / 超棘轮必 TRIP / 规模缩水必报 / 写入面只报不判），
    //   跑 --selftest 可复核。挂观察项不改分母，理由同前几轮。
    { name: '强制开关登记漂移守门', script: 'tests/force-switch-registry-drift-guard.mjs', args: [] },
    // V1.36.0 | 2026-11-05 迭代：补编排器漏接的三件真·node 自检（详见头顶 V1.36.0 日志行）。
    //   三者纯 node、exit=0、不依赖浏览器；挂观察项不改分母，是否升 CHECKS 开红待拍板。
    { name: 'fact 覆盖交叉自检', script: 'tests/fact-coverage-selftest.mjs', args: [] },
    { name: '清单新鲜度自检', script: 'tests/manifest-fresh-selftest.mjs', args: [] },
    { name: '中央登记簿交叉对账', script: 'tests/registry-cross-check.mjs', args: [] },
    // V1.37.0 | 2026-11-05 迭代：挂「体检模块语法扫描守门」（详见头顶 V1.37.0 日志行）。
    //   纯 node、零执行只解析；单文件坏→整 harness 崩溃这类盲区自此随体检秒级自动扫，不再靠人开浏览器才发现。
    // hard: true = 确定型守门：exit≠0 即 100% 是体检域自身的确定性缺陷（语法错/解析失败），无「待主代码转交」
    //   的研判灰度。由条目作者自称，汇总时额外标注「建议升 CHECKS 开红」；默认不写 = 取证项，红了供人工研判。
    //   ★ 不开第二份名单：属性跟条目走，新增守门不会再有「名单与清单失同步」的漂移面。
    { name: '体检模块语法扫描守门', script: 'tests/health-rules-syntax-sweep.mjs', args: [], hard: true },
    // V1.39.0 | 2026-11-06 迭代：编排器自身完整性守门（详见头顶 V1.39.0 日志行）。
    //   纯 node 只读、零执行被扫脚本；正反路径均已实测（含真身源码副本），不是纸面文章。
    { name: '编排器自身完整性守门', script: 'tests/run-all-integrity-selftest.mjs', args: [], hard: true },
    // V1.41.0 | 2026-11-06 迭代：结论行挑选口径行为守门（详见头顶 V1.41.0 日志行）。
    //   真身抽函数 + 合成输出，纯 node 零子进程；防 V1.40.0 修复被重构时静默删掉。
    { name: '结论行挑选口径守门', script: 'tests/pick-key-line-selftest.mjs', args: [], hard: true },
    // V1.42.0 | 2026-11-06 迭代：机制装配收口守门（详见头顶 V1.42.0 日志行）。
    //   纯 node 只读 + 一次轻量装配；防「上游增机制模块 ⇒ 体检宿主从开局就整片静默崩」重演。
    { name: '机制装配收口守门', script: 'tests/mechanics-install-selftest.mjs', args: [], hard: true },
    // V1.43.0 | 2026-11-07 迭代：变异锚点有效性绊线（详见头顶 V1.43.0 日志行）。
    //   纯子进程 0.1s + 一个纯判定函数；不重复实现锚点匹配，只把 --verify 的结论每轮摊出来。
    // hard: true = 锚点失效/生产者零输出是体检域确定性缺陷，非「待主代码转交」的研判灰度。
    { name: '变异锚点有效性绊线', script: 'tests/mutation-anchor-tripwire.mjs', args: [], hard: true },
    // V1.44.0 | 2026-11-07：并行接力漂移守门（详见头顶 V1.44.0 日志行）。
    //   纯只读 + 一次 git status；冲突残留/未解决冲突是确定性缺陷，故 hard: true。
    { name: '并行接力漂移守门', script: 'tests/relay-drift-guard.mjs', args: [], hard: true },
    // V1.45.0 | 2026-11-08：夜间成果合入守门（详见头顶 V1.45.0 日志行）。
    //   纯只读 + 两次轻量 git（远端探测 8s 超时，拿不到只提示不判红）；
    // hard: true = 「有夜间成果没取回/没登记」是确定性事实，不是待主代码转交的研判灰度。
    { name: '夜间成果合入守门', script: 'tests/nightly-merge-guard.mjs', args: [], hard: true },
    // V1.46.0 | 2026-11-08：变异指纹换行等价自证（详见头顶 V1.46.0 日志行）。
    //   纯 node 沙箱、零子进程、23 条牙；防「等价集合被放宽成永远放行」或「生成侧口径漂移」。
    { name: '变异指纹换行等价自证', script: 'tests/mutation-fp-eol-selftest.mjs', args: [], hard: true },
    // V1.47.0 | 2026-11-08：入口路径强制（详见头顶 V1.47.0 日志行）。
    //   新增裸写是确定性事实（不是待研判的灰度），故 hard: true；
    //   存量 146 处已冻结进基线，--update-baseline 只在还清旧账后跑（棘轮只降不抬）。
    { name: '入口路径强制', script: 'tests/entry-path-guard.mjs', args: ['--enforce'], hard: true }
];

// 从一大段输出里挑一行最能代表结论的：优先命中结论关键词的最后一行，否则最后一个非空行。
// V1.40.0：failed=true（调用方已知子进程退出码非 0）时改为优先挑「负向结论行」——
//   红脚本常先打 ❌ 明细、末尾再打报喜统计行，旧取法会把红显示成绿。绿路径行为一字不变。
function pickKeyLine(out, failed) {
    const lines = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const hit = lines.filter(l =>
        /RESULT|MATCH|✅|❌|通过|无失败|issue|偏差|未覆盖|未触发|全过|失败|Error|exit/i.test(l));
    let chosen = hit[hit.length - 1] || lines[lines.length - 1] || '';
    if (failed === true) {
        const neg = hit.filter(l =>
            /❌|\bFAIL\b|Error|异常|致命|偏差|未覆盖|未触发|未通过|不一致|漂移|断链|红项|失败/i.test(l)
            && !/无失败|零失败/.test(l));
        if (neg.length) chosen = neg[neg.length - 1];
    }
    return chosen.slice(0, 100);
}

const QUICK = process.argv.includes('--quick');
const activeChecks = QUICK ? CHECKS.filter(c => c.tier !== 'heavy') : CHECKS;
const skippedHeavy = QUICK ? CHECKS.filter(c => c.tier === 'heavy') : [];
console.log('================ 光明顶 5v5 · 一键全量体检 ================');
if (QUICK) console.log('· --quick：跳过 ' + skippedHeavy.length + ' 项重型采样（' + skippedHeavy.map(c => c.name).join('、') + '）');
const rows = [];
let failed = 0;
const tStart = Date.now();
for (const c of activeChecks) {
    process.stdout.write('▶ ' + c.name + ' ... ');
    const t0 = Date.now();
    let r;
    try {
        r = spawnSync(node, [path.join(root, c.script), ...c.args],
            { cwd: root, encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024 });
    } catch (e) {
        r = { status: 1, stdout: '', stderr: String(e && e.message || e) };
    }
    const ms = Date.now() - t0;
    const code = (typeof r.status === 'number') ? r.status : 1;
    const ok = code === 0;
    if (!ok) failed++;
    const key = pickKeyLine((r.stdout || '') + '\n' + (r.stderr || ''), !ok);
    rows.push({ ok, name: c.name, ms, code, key });
    console.log((ok ? '✅' : '❌') + ' (' + ms + 'ms)  ' + key);
}

console.log('=========================================================');
const pass = activeChecks.length - failed;
for (const r2 of rows) {
    console.log((r2.ok ? '  ✅ ' : '  ❌ ') + r2.name.padEnd(22) + ' ' + r2.ms + 'ms' + (r2.ok ? '' : '  exit=' + r2.code + '  ' + r2.key));
}
console.log('---------------------------------------------------------');
console.log('结果：' + pass + '/' + activeChecks.length + ' 通过，耗时 ' + ((Date.now() - tStart) / 1000).toFixed(1) + 's'
    + (failed ? '，X ' + failed + ' 项红（见上方对应行）' : (QUICK ? '（--quick 精简态）' : '，全套全绿')));

// 观察项（V1.2.0）：只跑只报，不计退码。
// V1.38.0：补「显形」——不再丢弃 r.status。非 0 项打 ❌ exit=N 并收进 observeFails，末尾汇总点名。
//   ★ 仍不计入 failed / 不改 process.exit / 不动 CHECKS 分母：开红与否留待拍板（见头顶 V1.38.0）。
// 确定型守门由条目自带 hard: true 声明（见 OBSERVES 末项注释），不在本处再列名单，避免第二份清单漂移。
if (OBSERVES.length) {
    console.log('---------------------------------------------------------');
    console.log('观察项（取证类探针，结果供人工研判、不计退码）：');
    const observeFails = [];
    for (const c of OBSERVES) {
        const t0 = Date.now();
        let r;
        try {
            r = spawnSync(node, [path.join(root, c.script), ...c.args],
                { cwd: root, encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024 });
        } catch (e) {
            r = { status: 1, stdout: '', stderr: String(e && e.message || e) };
        }
        const code = (typeof r.status === 'number') ? r.status : 1;
        const key = pickKeyLine((r.stdout || '') + '\n' + (r.stderr || ''), code !== 0);
        const ms = Date.now() - t0;
        if (code !== 0) observeFails.push({ name: c.name, code, key, hard: !!c.hard });
        console.log('  ' + (code === 0 ? '🔎' : '❌ exit=' + code) + ' ' + c.name.padEnd(22) + ' ' + ms + 'ms  ' + key);
    }
    if (observeFails.length) {
        console.log('---------------------------------------------------------');
        console.log('⚠ 观察项 ' + observeFails.length + ' 项退出非 0（按现行 OBSERVES 口径不计退码，待人工研判）：');
        for (const f of observeFails) {
            console.log('   · ' + (f.hard ? '[确定型守门·建议升 CHECKS 开红] ' : '') + f.name + '  exit=' + f.code + '  ' + f.key);
        }
    }
}
process.exit(failed ? 1 : 0);
