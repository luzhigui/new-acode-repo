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
export const VER = 'tests/run-all.mjs V1.25.0';

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
    //   自动帮「工具文件复制器」(tools/106-ai-pack-config.js 的 ALL_PROJECT_FILES) 检测漏登：
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
    // V1.24.0 | 2026-10-31 夜间第 162 轮：海克斯分库启动链守门（content/201hex-enhance.json 迁出 200 后，
    //   ★ 上游迁移时没有任何消费方补 loadHexEnhanceData ⇒ 本轮开场 25 项体检里 16 项以同一个
    //     「201 缺 sister 段」崩掉，红因看起来像数据丢了，实际是启动链没跟上迁移。本件三段取证：
    //     ⓪ 数据面（201 两段键数棘轮 + 200 无副本）、① 启动链成对点名、② 运行期真取一次。
    //     挂观察项不改分母（与孤儿普查同一取舍）—— 是否升 CHECKS 开红，留待拍板。
    { name: '海克斯分库启动链守门', script: 'tests/hex-boot-chain-guard.mjs', args: [] },
    // V1.24.0 | 2026-10-31 夜间第 162 轮：兄分支惑心定向取证（承接【最高·下轮】⑤b-2 逐个配定向用例）。
    //   ★ 实测逼出一件被漏掉的事：phantomConfuse 有**两个**发射点，第 160 轮只数了成昆那个就下了
    //     「干净树本就不发射」的结论；兄分支走 forceXiaoZhao=brother，根本不需要 forceChengKun。
    //     本件三段：静态自证发射点 + 定向扫描 + ★ 信号通道取证（信号零触发时结论一律判 UNKNOWN，
    //     不许拿零命中当"不可达"证据）。挂观察项不改分母，同上。
    { name: '兄分支惑心定向取证', script: 'tests/phantom-confuse-brother-case.mjs', args: [] },
    // V1.25.0 | 2026-10-31 夜间第 163 轮：node 侧信号通道守门 + fact 藏匿点体检（新增）。
    //   ★ 本轮连挖两个「测量口径错误」，两个都差点变成「按死代码核销」的依据：
    //     (1) 信号探针：上一次版在开头 eventBus.on 一次，而引擎每回合 eventBus.clearAll()
    //         （core/11battle-round.js:142 + core/06battle-runner.js 顶部注释）⇒ 计数恒 0，
    //         上轮据此推断「node 回放通道不发 BEFORE_SELECT_TARGET」（疑点乙）。本轮换成
    //         tests/_lib/signal-probe.mjs 的跨回合存活探针后实测 42 场发 3443 次 ⇒ 疑点乙证伪、撤回。
    //     (2) fact 藏匿点：幻影 fact 挂在 attackFact.data.phantomFact，与 data.entries 并列、
    //         不在 entries 里 ⇒ 全仓库扫 fact 的脚本一条都没看见（本件 ③ 点名四个扫描器）。
    //         补上前：兄分支/成昆分支皆「0 次」；补上后实测 **107 / 96 次** ⇒ 发射点活得好好的，
    //         phantomConfuse 须由 ⑤b-2 挪进 ⑤b-3「定向已覆盖·严禁按死代码核销」。
    //   本件防的是同一款病的复发面：**不是产品没有，是我们没接到**。挂观察项不改分母，同上。
    { name: '信号通道守门(探针/fact藏匿点)', script: 'tests/signal-channel-guard.mjs', args: [] }
];

// 从一大段输出里挑一行最能代表结论的：优先命中结论关键词的最后一行，否则最后一个非空行
function pickKeyLine(out) {
    const lines = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const hit = lines.filter(l =>
        /RESULT|MATCH|✅|❌|通过|无失败|issue|偏差|未覆盖|未触发|全过|失败|Error|exit/i.test(l));
    return (hit[hit.length - 1] || lines[lines.length - 1] || '').slice(0, 100);
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
    const key = pickKeyLine((r.stdout || '') + '\n' + (r.stderr || ''));
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

// 观察项（V1.2.0）：只跑只报，不计退码
if (OBSERVES.length) {
    console.log('---------------------------------------------------------');
    console.log('观察项（取证类探针，结果供人工研判、不计退码）：');
    for (const c of OBSERVES) {
        const t0 = Date.now();
        let r;
        try {
            r = spawnSync(node, [path.join(root, c.script), ...c.args],
                { cwd: root, encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024 });
        } catch (e) {
            r = { status: 1, stdout: '', stderr: String(e && e.message || e) };
        }
        const key = pickKeyLine((r.stdout || '') + '\n' + (r.stderr || ''));
        console.log('  🔎 ' + c.name.padEnd(22) + ' ' + (Date.now() - t0) + 'ms  ' + key);
    }
}
process.exit(failed ? 1 : 0);
