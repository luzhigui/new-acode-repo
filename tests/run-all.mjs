//   动因：牙口矩阵是 154 条哨兵分支**唯一**的牙口证据来源，而这份证据正在悄悄腐烂且无人盯守
// tests/run-all.mjs | ~4100 bytes | V1.3.0 | 2026-10-22 CHECKS 新增「蓄意轰拳数值口径对账」
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

export const VER = 'tests/run-all.mjs V1.19.0';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const node = process.execPath;

// 十项红线（V1.1.0 起），顺序 = 从快到慢、从结构到数值
const CHECKS = [
    { name: '静态扫描(import/枚举)', script: 'tests/123static-scan.js', args: [] },
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
    { name: '地基可携化', script: 'tests/foundation-portability.mjs', args: [] }
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
