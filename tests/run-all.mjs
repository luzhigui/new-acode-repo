// V1.10.0 | 2026-10-25 第 133 轮：CHECKS 新增第 15 项「牙口证据链对账」
//   （tests/rule-teeth-evidence-selftest.mjs），体检项 17 → 18。
//   动因：牙口矩阵是 154 条哨兵分支**唯一**的牙口证据来源，而这份证据正在悄悄腐烂且无人盯守
//   （证据停在第 127 轮，129/132 轮各改了 21 个规则文件，mutation-teeth 的四项新鲜度守卫
//   全都不盯规则文件 ⇒ 文档顶上至今写着「新鲜度守卫：通过」）。实测已有 3 条牙口结论对不上号。
//   本项只做静态证据对账（拿证据 msg 到当前规则文件找分支指纹），不跑变异树、不重录证据。
// V1.9.0 | 2026-10-25 第 132 轮：第 14 项「判据分支级空转自检」随 rule-branch-idle-selftest 升 V1.1.0
//   （口径收紧 + 新增断言⑥指纹可区分性），本文件只同步版本号与注释，未改任何判定逻辑、体检项仍 17。
//   收紧的两处（详见该脚本头注释）：① 指纹抽取只取到 msg 语句结束，不再越过语句边界误取后续代码里的
//   字符串（旧口径会给 `msg: bad` 这类变量 msg 造出**假指纹** —— 比无指纹更危险，自检会以为自己裁定
//   得了这条分支）；② 新增断言⑥：同一规则内分支指纹不得相同/互为前缀，撞车会让分支级判定**静默退化
//   成规则级**（改前实测 11 组重复 + 11 组前缀包含、涉及约 35 条分支，半数分支级结论是假的）。
//   配套把 158 条分支的指纹全部修成可区分（10 条原无指纹分支补静态前缀，盲区清零、白名单清空）。
// V1.8.0 | 2026-10-25 第 131 轮：CHECKS 新增「判据分支级空转自检」（tests/rule-branch-idle-selftest.mjs，
//   第 14 项，计退码）。由来：第 130 轮点名的下轮目标 —— 规则恒空转自检只裁定「有没有判定过」
//   （规则级），补「判据分支级空转」。★ 关键取舍：158 条分支里只有 4 条命中，若按"空转即红"
//   会把 145 条正常回归哨兵刷成噪声 ⇒ 改为把**已咬过的分支钉成基线、只许收缩**，专门抓
//   「判据分支掉牙」这个静默事件（掉牙只会让回放越变越绿，无人报警）。体检项 16→17。
//   （另修正第 130 轮遗留：头注释已写 V1.7.0 而 VER 常量仍停在 V1.6.0，本轮一并归位。）
// V1.7.0 | 2026-10-25 第 130 轮：CHECKS 新增「规则恒空转自检」（tests/rule-idle-selftest.mjs，第 13 项，
//   计退码）。由来：第 129 轮交付「规则绑定键漂移自检」时点名的下轮最高优先 —— 那条只保证"键还在"，
//   不能证明规则真的判定过。规则侧恒空转（pass=0 fail=0 全 skip）在回放汇总里只打一个 ⏭ 就过去了，
//   而「样本未覆盖 / 判据键过期 / 数据源错位」三种病因表现完全一样、回放数字一模一样、肉眼撞不见。
//   本项复用 rules-replay 的真实统计（新增 RULE_STATS_OUT 落盘口径，默认零副作用），按契约侧恒空转
//   棘轮的同款口径：恒空转集合必须**恰好等于**白名单（只许收缩），配规模闸门防自检恒绿，体检项 15→16。
// V1.6.0 | 2026-10-24 第 129 轮：CHECKS 新增「规则绑定键漂移自检」（tests/rule-binding-drift-selftest.mjs，
//   第 12 项，计退码）。由来：第 128 轮立的下轮目标 —— 把契约侧的「绑定键漂移」口径横向铺到规则侧。
//   难点是 health-rules 里 416 条中文字面量绝大多数是注释/规则名/报错文案，照单全收必误报刷屏；
//   故先做抽取口径：剥注释 → 只取判据匹配位 → 三类免检（模板拼装 / 规则自身文案 / 反向哨兵白名单·棘轮），
//   压到 154 条真判据键 + 11 条留痕免检。盯的是"规则靠哪个中文键认领战报"，键漂移即恒空转或恒绿。
// V1.5.0 | 2026-10-24 第 128 轮：CHECKS 新增「契约绑定键漂移自检」（tests/contract-binding-drift-selftest.mjs，
//   第 11 项，计退码）。由来：第 127 轮把「恒空转契约 2 条」定性为"样本未覆盖"、立待办等拍板；
//   本轮取证发现其中一条（HLS_JIUYANG_HEAL）是**契约绑定键过期**——绑的 label 在主代码里零命中，
//   属真·假绿（与第 99 轮 NINE_YANG_HEAL 同款）⇒ 已按实际 label 重绑并修复。
//   为防这类别再次复发，新增本项：静态扫出每条契约靠哪些字面量认领声明，逐个到主代码全库核存在性，
//   再运行时核对契约绑定的账本 group 真的有词条 ⇒ 任一"接线松了"即转红。
// V1.4.0 | 2026-10-24 第 127 轮：CHECKS 新增「对照器守卫自检」（tests/contract-guard-selftest.mjs，第 10 项，计退码）
// tests/run-all.mjs | ~4100 bytes | V1.3.0 | 2026-10-22 CHECKS 新增「蓄意轰拳数值口径对账」
//   （tests/hit-shapes-consistency.mjs，新检查，放在静态契约一致性之后——秒级、纯静态对账）
// V1.0.1 | 2026-10-13 CHECKS 末尾挂「翻译层golden对照」（tests/translate-golden.mjs，render/38 拆分护栏）
// 一键全量体检：串行跑齐 node 侧全套红线（七项常规 + 大样本 fuzz），最后出一页「谁绿谁红」汇总，任一红则退出码 1。
// 背景：浏览器 120test-runner.html 的「一键体检」只覆盖浏览器那一层（UI/规则/不变量）；
//       node 侧回放/账本/基线/覆盖率/fuzz 此前要手敲多条命令、没有总入口，本脚本补上这个总入口。
// 用法：node tests/run-all.mjs
//   不含变异牙齿（mutation-teeth 全量约 8 分钟、会生成 tests/.mut 临时树），需要时单独跑。
//   子脚本的环境变量可透传，例如 SEEDS=1,2 STAGES=2 node tests/run-all.mjs（影响回放）。
// V1.1.0 | 2026-10-13 体检第 84 轮：挂「静态契约一致性」tests/contract-consistency.mjs（新检查，放静态扫描之后）——
//   ①门槛一致性：player/42 hasStageWork 门槛 vs render/39 STAGE_ACTION_DEFS 全表（带 store/storeAfter 的定义必须被放行）；
//   ②翻译器契约：infra/58 FACT_SPECS.translateFn 登记 vs render/38 家族 FACT_TRANSLATORS 表（双向对账）。
//   均为源码级静态检查（浏览器代码 node 测不进运行时），判据与牙齿见该文件头。
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const VER = 'tests/run-all.mjs V1.10.0';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const node = process.execPath;

// 十项红线（V1.1.0 起），顺序 = 从快到慢、从结构到数值
const CHECKS = [
    { name: '静态扫描(import/枚举)', script: 'tests/123static-scan.js', args: [] },
    { name: '静态契约一致性(门槛/翻译器)', script: 'tests/contract-consistency.mjs', args: [] },
    { name: '蓄意轰拳数值口径对账', script: 'tests/hit-shapes-consistency.mjs', args: [] },
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
    { name: '覆盖率/空转红线', script: 'tests/coverage-report.mjs', args: [] },
    { name: '大样本fuzz(300seed×7关)', script: 'tests/fuzz-invariants.mjs', args: [] },
    { name: '翻译层golden对照', script: 'tests/translate-golden.mjs', args: [] }
];

// V1.2.0 | 2026-10-21 第 112 轮：挂观察项（不影响退码）——第 113 轮沙箱交接规格的主线重写产物。
//   观察项 = 取证类探针：结论供人工研判，暂不开红（死字段缺陷本身待主代码转交，开了就永远红）。
//   实测合计约 5 秒（定向用例 1.9s + 死字段普查 3.1s）。
const OBSERVES = [
    { name: 'XIN_HUN_DEATH定向用例', script: 'tests/xinhun-death-targeted-case.mjs', args: [] },
    { name: '载荷死字段普查', script: 'tests/fact-dead-field-scan.mjs', args: [] },
    // 第 123 轮新增：结构不可达分支扫描（静态层级错位 + 动态分支指纹零命中），同样不计退码
    { name: '结构不可达分支扫描', script: 'tests/structural-dead-branch-scan.mjs', args: [] }
];

// 从一大段输出里挑一行最能代表结论的：优先命中结论关键词的最后一行，否则最后一个非空行
function pickKeyLine(out) {
    const lines = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const hit = lines.filter(l =>
        /RESULT|MATCH|✅|❌|通过|无失败|issue|偏差|未覆盖|未触发|全过|失败|Error|exit/i.test(l));
    return (hit[hit.length - 1] || lines[lines.length - 1] || '').slice(0, 100);
}

console.log('================ 光明顶 5v5 · 一键全量体检 ================');
const rows = [];
let failed = 0;
const tStart = Date.now();
for (const c of CHECKS) {
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
const pass = CHECKS.length - failed;
for (const r2 of rows) {
    console.log((r2.ok ? '  ✅ ' : '  ❌ ') + r2.name.padEnd(22) + ' ' + r2.ms + 'ms' + (r2.ok ? '' : '  exit=' + r2.code + '  ' + r2.key));
}
console.log('---------------------------------------------------------');
console.log('结果：' + pass + '/' + CHECKS.length + ' 通过，耗时 ' + ((Date.now() - tStart) / 1000).toFixed(1) + 's'
    + (failed ? '，X ' + failed + ' 项红（见上方对应行）' : '，全套全绿'));

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
