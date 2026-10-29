// V2.9.16 | 2026-10-29 夜间第 156 轮：A8 / A19 蝶变附身防御变异改为 multi。
//   --verify 实测同一 addMod 已有宿主 + 额外队友两条真实路径，旧单点锚点各报「2 处、非 multi」而失效；
//   两处同改才保持「蝶变附身防御 universally 翻倍/失效」的原牙语义（单场额外队友路径可能同时生效）。
//   本轮会全量重建 47 棵变异树并重跑结果，故判据 VER 同步升 V2.9.16，旧 hold 正式核销。
// V2.9.15 | 2026-10-24 第 126 轮：修「转交中（⚠️）规则 = 证据黑洞」—— 第 126 轮 46 颗牙全量重算时由 T16 暴露。
//   现象：run.sh 的 REPLAY 过滤只抓 `❌`，而回放器把「已登记转交」的失败规则标 `⚠️`（rules-replay L476：
//   fail>0 且命中 KNOWN_TRANSFERS ⇒ ⚠️ 不染退码）。于是这类规则的**规则头行与全部报红明细都进不了结果文件**，
//   而 parseBlock 的 curRule 又只由 ❌ 行设置 ⇒ 它们的明细**无归属**，既不进 newDetail 也不进 masked。
//   后果（两面都坏）：① 判据其实咬住了，却显示「未观测到影响」（T16 实证：变异让 164 报出
//   「newMaxHp=132.5 应为正整数目标上限」3 条新明细，屏幕上却一行不显）；② 反之若日后有人靠它们混进
//   cleanPairs，又会拿「基线已红」的规则给变异作伪证（第 43 轮 153 那次教训）。
//   修法（只补证据通道，判据一行未改）：
//     a) --emit-run 的 grep 补 `⚠️`，让转交中规则的头行与明细一起落盘；
//     b) parseBlock 识别 `⚠️` 规则行，设 curRule 并记入 warn（**不进 red**，转交态本就不计退码）；
//     c) report 把 _base 的 warn 与 red 合并成「失去作证资格」集合传给 judge ⇒ 转交中规则与基线已红规则
//        同等待遇：不能作证，但其新明细照旧记入 masked（[掩盖×N]）显式呈现，不静默吞掉。
// V2.9.12 | 2026-10-24 第 126 轮：新增 `--matrix-out=<path>` —— 牙口矩阵 Markdown 落盘。
//   起因：46 颗牙的结论此前**只活在 stdout**（--report 打印完即散），而 teeth-results.txt 一旦被新鲜度
//   守卫判陈旧，矩阵就只剩零星几条 ⇒ 白天会话看不到「规则到底有没有牙」的全貌，也无法逐轮对照变化。
//   本次仅新增**输出通道**（多写一个 md 文件），**判据口径一行未改**，故 VER（判据版本）不升 ——
//   VER 只钉判据，判据一改必须升，见 V2.9.0 新鲜度守卫。
// V2.9.11 | 2026-10-18 第 100 轮：faa6068 大拆分联动锚点重修（5 处 file 路径，from/to 文本未动）——
//   core/12 拆 chain/edge ⇒ A11（韦一笑吸血上限提升）from 行随 weiLeech addMod 迁至
//   core/12battle-attack-chain.js L479；render/35 拆 stat/heal 等 ⇒ T8/T9（坚盾已叠 current/cap，
//   35-facts-stat.js L68）、T12（九阴白骨爪 fmt1 伤害，35-facts-stat.js L194）、
//   T13（嗜血狂刀 leechVal，35-facts-heal.js L18）迁户。不修即「树内没有该行 ⇒ 变异静默失效、
//   树木=干净树」= 假绿制造机（同 V2.9.4 拆分联动模式）。
// V2.9.10 | 2026-10-15 第 94 轮：修 --merge-results 输出 bug（合并功能首次实际使用即暴露）——
//   块拼接行 `[..., ...[...main.blocks.values()].join('\n'), ...]` 多写一个展开符：join 出来的大字符串被
//   逐字符拆成数组元素，写出的结果文件整片逐字符换行 = 全损（本轮 29 棵旧结果被冲掉，靠重建树重跑恢复）。
//   修法：去掉多余的 `...`。另补记：ONLY 模式每批跑完必须 `cp teeth-results-inc.txt <批次备份>`——
//   inc 文件每次跑都会被覆盖（本轮 T18 的第 93 轮结果就是这样丢的）。
// V2.9.9 | 2026-10-15 第 93 轮：T18 变异重修——旧版 `{ posA, posB }`→`{ posB, posA }` 是 ES6 简写
//   换键顺序不换值的**空操作**（sed 注入成功但对象一模一样，树仍干净 ⇒ 首测 0 命中误导"规则没牙"）；
//   改为真换值 `posA: posB, posB: posA`。教训入 skill：变异必须改变**行为/数值**，文本差异≠行为差异。
// V2.9.8 | 2026-10-15 第 92 轮：新增 ONLY 增量过滤 + --merge-results 合并（用户立规"新增几颗牙只跑
//   几棵树，别为 2 颗新牙跑 20-40 分钟全量"的落地）——ONLY=T17,T18 时 prep/run 只伺候这几棵树、
//   结果落 teeth-results-inc.txt，--merge-results 按 id 合并回主文件并刷新 META（NOTE 记录来源）。
// V2.9.7 | 2026-10-15 第 91 轮：A25 锚点重校（multi）—— 主代码 6f4c103/8073bbe 把圣火令拆成
//   两条路径（基础 buff cols/rows + 妹永久 draw.cols/rows），atk addMod 行两处全同 ⇒ 单点锚点
//   不再唯一。sed 单行替换不支持多行锚点，A25 改 multi（两处一起翻倍，语义不变）。
// V2.9.5 | 2026-10-13 体检第 84 轮：A11 锚点重校（唯一性）—— 旧 from `"{ source: '韦一笑吸血', value: delta,"`
// 方法论首立于第 37/38 轮：变异牙齿测试（mutation teeth）—— 回答「规则到底有没有牙」。
// 干什么：在**仓库内临时树** tests/.mut 里，对业务代码注入一处**已知的人工缺陷（变异）**，
//   跑「规则回放 + 基线 + 逐步真值对照」，看体检套件**能不能报红**。
// 为什么要有它：
//   pass=120 / fail=0 **不等于有牙**。一条规则可能因判据写错、字段路径错、正则永不命中而
//   「恒绿但什么都不测」（第 22 轮 127 的 `_baseAtk` 路径错就是此类，只是那次表现为恒 skip 才被发现）。
//   `coverage-report` 只查「有没有触发」，查不出「触发了但判据空转」—— 这层只能靠变异测：
//   **注入一个真缺陷，规则若不报红，它就是装饰品。**
// 环境铁律（第 37 轮踩坑，别重趟）：
//   · 本沙箱里，**任何由 node 进程派生的子进程（bash / node）都被 broker 静默禁用**（spawnSync 返回 status:null、out 空）；
//     且同一进程顺序 import 多份「末尾 process.exit 的引擎脚本」会挂起 / 收集为空。
//   · 故牙齿测试的执行**一律交给 Bash 工具**：本 runner 只负责①生成准备脚本 ②生成运行脚本 ③解析结果，不 spawn / 不 import 业务代码。
//   · 临时树放仓库内 tests/.mut（gitignore，不入库）。准备用 `git archive HEAD` 导出基树 + sed 注入变异 + 叠加当前工作树 tests/。
// 三类变异：
//   ATTR —— 实际属性变、日志声明不变（如破防实际扣两倍）。规则判的是文本，理论上抓不到，
//           靠 `stat-decl-vs-actual-check.mjs` 兜；规则不报红属**已知分工**，不算装饰品。
//   TEXT —— 日志声明的数值写错、实际不变（如破防文本写 -7 实际 -2）。**规则就该报红**，
//           不报红 = 该规则判据无牙（硬发现）。
// 判定口径（保守，宁可标「未观测」也不乱扣装饰品帽子）：
//   · 生效证据 = TEXT 必然生效 / 有规则报红 / 基线 MATCH 数下降 / 属性指纹变 / 数值对照器命中
//   · 【装饰品】= TEXT 变异已证实生效，但规则侧 + 对照器侧 + 基线侧都没反应 —— 真盲区
//   · 【规则无牙·对照器兜住】= ATTR 变异已生效（对照器命中），但规则侧不报红（已知分工）
//   · 【规则无牙·仅基线兜底】= ATTR 变异已生效（指纹变 + 基线回归），但规则 + 对照器都抓不到，只有 140-baseline 回归闸门能兜底
//   · 【待确认盲区】= 属性变了，但规则 + 对照器 + 基线全无反应
//   · 【未观测到影响】= 变异未改变 18 场种子的战斗状态（指纹≡基线）—— 测试覆盖缺口，非牙齿结论
// 运行（三步）：
//   1) node tests/mutation-teeth.mjs --emit-prep  > /tmp/prep.sh  &&  bash /tmp/prep.sh
//   2) node tests/mutation-teeth.mjs --emit-run   > /tmp/run.sh   &&  bash /tmp/run.sh
//   3) node tests/mutation-teeth.mjs --report
// V2.9.15 | 2026-10-25 第 134 轮：新鲜度守卫补第⑤项「判据（规则）文件指纹 RULEFP」——
//   补的是第 129 / 132 轮各改 21 个规则文件、而四项守卫**一项都没响**那个洞（第 133 轮实测
//   已有 3 条牙口结论对不上当前代码，牙口矩阵顶上却仍写着「新鲜度守卫：通过」⇒ 守卫在说谎）。
//   ① 新增 ruleFingerprint()：tests/health-rules/*.js（47 个）+ tests/122health-utils.js 的**内容**哈希；
//   ② --emit-run / --merge-results 把 RULEFP 写进 #META 头；③ --report 比对，不符即判陈旧（硬失败退 1）。
//   用内容哈希而非 mtime：mtime 会被 touch / git checkout 刷新 ⇒ 假阳性，且说不出哪条结论作废。
//   与 rule-teeth-evidence-selftest 分工：本项是粗粒度预警（判据整体变过没），后者是细粒度实质对账。
//   ★ VER 不升：只加守卫/证据通道，判据口径一行未动（同 V2.9.12「VER 只钉判据」先例）。
// V2.9.14 | 2026-10-24 第 127 轮：对照器侧补「归属 + 不得作证」两道闸门（只补证据通道，判据不放松）。
//   背景：V2.9.13 及以前，对照器证据只有一个**汇总数**（grep「检出重复应用 N 处」），既不知道
//   是哪条契约抓的，也没有「干净树本就命中 ⇒ 不得作证」这道闸门——与第 43 轮（153）、第 126 轮
//   （转交中规则）在**规则侧**修的是同一类洞，只是对照器侧一直没补。
//   ① 归属：STAT 段本来就逐条打印 `CONTRACT 声明 N 条 · 命中 M · …`，此前被丢弃。改为解析成
//     statByContract，把「对照器兜住」写成「对照器兜住(LEECH_MAXHP×199)」——18 颗 ATTR 牙各自
//     由哪条契约守着，从此可审计（第 126 轮下轮目标点名的 A20/A11/A5 分别对应
//     LEECH_MAXHP / WEI_HEAL / METEOR_GROWTH，已实测 1:1 对应、无错配）。
//   ② 不得作证：干净树 _base 里 命中>0 的契约（若有）列入 BASE_DIRTY_CONTRACTS，其命中不计入
//     「有牙」证据，改记对照器侧 [掩盖×N]——道理同「基线已红的规则不得作证」。
//     实测当前 _base 全部 56 条契约命中皆 0 ⇒ 本闸门当下为空操作（零判定迁移），纯属加固。
// ★ VER 只钉**判据口径与变异表语义**：纯守卫 / 输出通道 / 证据通道升级可不升，
//   但锚点、多路径注入范围或判定逻辑一改必须升，并重跑结果使新鲜度元数据归位。
//   V2.9.12 / V2.9.15 属输出或守卫升级，历史上未单独抬 VER；本轮 A8 / A19 从单点改为
//   宿主 + 额外队友双路径注入，直接改变两颗牙的生效面，故升到 V2.9.16 并核销旧 hold。
export const VER = 'tests/mutation-teeth.mjs V2.9.16';

import { spawnSync, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
// 临时树放仓库内，跑完由本 runner（--emit-prep 不删；--single 也不删；由 Bash 手动 rm）或 .gitignore 排除。
const MUT_ROOT = process.env.MUT_ROOT || path.join(REPO, 'tests', '.mut');
// 第 92 轮：ONLY=T17,T18 增量过滤（2026-10-15 用户立规"新增几颗牙只跑几棵树，别跑全量"的落地）——
//   prep 只建过滤到的树、run 只跑过滤到的树，结果落独立文件 teeth-results-inc.txt（不冲掉主结果），
//   事后用 --merge-results 合并回主文件并刷新 META。未设 ONLY 时行为与从前完全一致（全量）。
const ONLY = process.env.ONLY ? process.env.ONLY.split(',').map(s => s.trim()).filter(Boolean) : null;
const pickMuts = () => (ONLY ? MUTATIONS.filter(m => ONLY.includes(m.id)) : MUTATIONS);

// --- 变异表：一处替换 = 一个已知缺陷。from 必须在文件中唯一（multi:true 允许同串多处都改）---
const MUTATIONS = [
    { id: 'A1', kind: 'ATTR', desc: '破防实际扣两倍（第33轮真实事故复现）',
      file: 'core/16effect-handlers.js',
      from: "value: -reduce, ttl: 'permanent', group: 'breakDef', op: 'add' }",
      to:   "value: -reduce * 2, ttl: 'permanent', group: 'breakDef', op: 'add' }" },
    { id: 'A2', kind: 'ATTR', desc: '坚盾防御增量翻倍',
      file: 'core/03battle-utils.js',
      from: "value: increment, ttl: 'permanent', group: 'fortify', op: 'add' }",
      to:   "value: increment * 2, ttl: 'permanent', group: 'fortify', op: 'add' }" },
    { id: 'A3', kind: 'ATTR', desc: 'carry 攻击加成翻倍',
      file: 'core/04buff-system.js',
      from: "{ source: 'carry', value: bonus.atkAbs, ttl: 'round', op: 'add', group: 'carry' }",
      to:   "{ source: 'carry', value: bonus.atkAbs * 2, ttl: 'round', op: 'add', group: 'carry' }" },
    // 第 44 轮改锚点：原为 `{ source: '近战切换', value: warriorBonus.atk * 3,`，
    //   主代码 V6.2.0（core/13）把 ×3 系数收敛进内容表 skills.nearSwitch.params → atkMul/defMul/maxHpMul，
    //   此处变成先算好的 `atkGain`。锚点失效期间 A4 是**静默失效**（树=干净树），由 --verify 查出。
    //   2026-10-09 第 64 轮再锚：张无忌近战切换组件已从 core/13battle-shared.js 迁到
    //   modules/27elite-mingjiao.js（L45 addMod atk，与 def/maxHp 同源），故 file 改指新位置；
    //   `{ source: '近战切换', value: atkGain,` 在该文件唯一（defGain/maxHpGain 变量名不同）。
    { id: 'A4', kind: 'ATTR', desc: '张无忌近战切换加攻翻倍',
      file: 'modules/27elite-mingjiao-zhangwuji.js',
      from: "{ source: '近战切换', value: atkGain,",
      to:   "{ source: '近战切换', value: atkGain * 2," },
    { id: 'A5', kind: 'ATTR', desc: '流星赶月溅射成长翻倍',
      file: 'core/16effect-handlers.js',
      from: "{ source: '流星溅射成长', value: growth,",
      to:   "{ source: '流星溅射成长', value: growth * 2," },
    // 第 47 轮改锚点：主代码批 3 把苦练三档增量抽成局部变量（atkDelta/defDelta/maxHpDelta）后再交给 addMod，
    //   原锚点 `value: s.atkBonus * mult` 已被改写 → --verify 报 0 处（不修就是假绿制造机）。
    //   只改 addMod 那一份、fact 的 targets 仍用原变量 ⇒ 实际=2×声明，由整数倍判据兜。
    { id: 'A6', kind: 'ATTR', desc: '苦练攻击加成翻倍',
      file: 'modules/26elite-sixsects-songqingshu.js',
      from: "{ source: '苦练', value: atkDelta,",
      to:   "{ source: '苦练', value: atkDelta * 2," },
    { id: 'A7', kind: 'ATTR', desc: '生生不息转防翻倍',
      file: 'modules/26elite-sixsects-zhangsanfeng.js',
      from: "{ source: '生生不息', value: defGain,",
      to:   "{ source: '生生不息', value: defGain * 2," },
    // 第 58 轮修锚点：A8 原锚在 **atk** 那行，但 flyDirection 恒为 'left'（core/11 只写 `A._flyDirection = A._flyDirection || 'left'`，
    //   全仓无处设 'right'）⇒ atkRatio=0 ⇒ atkTransfer 恒 0 ⇒ `value: atkTransfer * 2` 是个 no-op，
    //   baseline 与 _base 逐字节相同。改锚 **def** 那行：left 时 defRatio=bp.defRatioLeft=0.5，值非零，变异真正生效。
    { id: 'A8', kind: 'ATTR', desc: '蝶变附身防御转移翻倍（宿主+额外队友两条路径都改）',
      file: 'modules/27elite-mingjiao-xiaozhao-sister.js',
      from: "{ source: '蝶变附身', value: defTransfer,",
      to:   "{ source: '蝶变附身', value: defTransfer * 2,",
      multi: true },
    // V2.9.1 | 2026-10-08 第 60 轮：A9 锚点因 八卦阵机制重写（defGain 防御增益 → 付费触发扣 atkCost 攻击力）失效，
    //   旧 from 串 0 处 ⇒ 树=干净树 ⇒ 此前「待确认盲区」是假阴性。重新对准到现行机制：扣攻翻倍，
    //   声明 fact(BAGUA_ARRAY.atkDelta=-ba.atkCost) 不变 ⇒ BAGUA_ATK 契约出现偏差，真有牙。
    { id: 'A9', kind: 'ATTR', desc: '八卦阵攻击消耗翻倍（付费触发扣攻翻倍 → BAGUA_ATK 契约偏差）',
      file: 'modules/26elite-sixsects-zhangsanfeng.js',
      from: "{ source: '八卦阵', value: -ba.atkCost, ttl: 'permanent', group: 'baguaArray', op: 'add' }",
      to:   "{ source: '八卦阵', value: -ba.atkCost * 2, ttl: 'permanent', group: 'baguaArray', op: 'add' }" },
    { id: 'A10', kind: 'ATTR', desc: '莽撞每次挨打加攻翻倍（主目标+溅射两处都改）',
      file: 'modules/26elite-sixsects-pangyuanqiao.js',
      from: "{ source: '莽撞', value: rage.atkPerHit, ttl: 'permanent', group: 'rageOnHit', op: 'add' });",
      to:   "{ source: '莽撞', value: rage.atkPerHit * 2, ttl: 'permanent', group: 'rageOnHit', op: 'add' });",
      multi: true },
    { id: 'A11', kind: 'ATTR', desc: '韦一笑吸血上限提升翻倍',
      file: 'core/12battle-attack-chain.js',
      from: "{ source: '韦一笑吸血', value: delta, ttl: 'permanent', group: 'weiLeech',",
      to:   "{ source: '韦一笑吸血', value: delta * 2, ttl: 'permanent', group: 'weiLeech'," },
    { id: 'A12', kind: 'ATTR', desc: '性奋代价翻倍（多扣上限）',
      file: 'modules/26elite-sixsects-songqingshu.js',
      from: "{ source: '性奋代价', value: -penalty,",
      to:   "{ source: '性奋代价', value: -penalty * 2," },
    // 第 44 轮改锚点：原为写死的 `value: 3`，主代码把三项收敛成 `carryMods.atk/def/maxHp` 后写法变了。
    //   （A13 仍属结构性稀有条件 —— 需 bro 拿到永久 carry 海克斯且队伍无 carry buff，历史上 560 场零触发）
    // 第 58 轮改锚点：A13 原打 `xiaoZhaoCarry`（小昭·妹永久carry），但该机制需特定海克斯（CARRY 永久 buff），
    //   stat-decl 全场次（10 seed × 4 stage）扫描里 **零出现** ⇒ 变异恒 no-op，baseline 与 _base 逐字节相同。
    // 第 58 轮改靶子（第二次）：先试 rageOnHit 的 multi 版，与 A10 完全重复（同文件同锚点同 multi）⇒ 无意义。
    //   最终改打 `xingFenCost`（性奋代价，95 词条，maxHp **负值**且逐次递减 -1/-2/-3…）——
    //   专测「负值 + 非整数倍」判据：旧判据只认 sum>0 与整数倍超应用，这类负值递减词条最容易漏。
    { id: 'A13', kind: 'ATTR', desc: '性奋代价扣血上限翻倍（负值词条 ×2）',
      file: 'modules/26elite-sixsects-songqingshu.js',
      from: "addMod(unit, 'maxHp', { source: '性奋代价', value: -penalty, ttl: 'permanent', group: 'xingFenCost', op: 'add' });",
      to:   "addMod(unit, 'maxHp', { source: '性奋代价', value: -penalty * 2, ttl: 'permanent', group: 'xingFenCost', op: 'add' });" },
    { id: 'A14', kind: 'ATTR', desc: '雄狮振奋加攻翻倍',
      file: 'modules/27elite-mingjiao-xiexun.js',
      from: "{ source: '振奋', value: gain,",
      to:   "{ source: '振奋', value: gain * 2," },
    // 2026-10-02 审核线修锚点：modules/27 V6.4.4 成长差值先落变量（L704 defDelta），旧内联串 0 匹配、变异静默失效。
    //   新锚点只改 addMod 实际侧（L707）；不能改 L704 的 defDelta——L717 fact 同源引用它，改了声明/实际一起翻、对照器看不出。
    { id: 'A15', kind: 'ATTR', desc: '幼狮成长防御增量翻倍',
      file: 'modules/27elite-mingjiao-xiexun.js',
      from: "{ source: '幼狮成长', value: defDelta, ttl: 'permanent', group: 'lionGrow', op: 'add' }",
      to:   "{ source: '幼狮成长', value: defDelta * 2, ttl: 'permanent', group: 'lionGrow', op: 'add' }" },
    // 第 48 轮新增：--scan-groups 查出 rangedGrowth 是「词条数第 6 多的未覆盖 group」（540 条），
    //   此前体检完全没有变异在测它 —— 属于「既没契约也没变异」的双重盲区。补此变异证明新契约有牙。
    { id: 'A16', kind: 'ATTR', desc: '远程成长加攻翻倍',
      file: 'core/03battle-utils.js',
      from: "{ source: '远程成长', value: growth,",
      to:   "{ source: '远程成长', value: growth * 2," },
    // 第 48 轮新增：精通（spiderMastery）此前同样是「无契约 + 无变异」的双重盲区，
    //   本轮靠它战报里自带的 masteryGain 补上了契约，这条变异用来证明契约真能咬住。
    { id: 'A17', kind: 'ATTR', desc: '小昭·弟精通攻击加成翻倍',
      file: 'modules/20elite-skills.js',
      from: "{ source: '精通', value: gAtk,",
      to:   "{ source: '精通', value: gAtk * 2," },
    // ============ 第 49 轮新增：专门验证「判据从整数倍升级为严格相等」带来的增量能力 ============
    //   A18/A19 的杀伤在这类好莱坞式 bug：不是翻倍，**只错一点点 / 直接失效**。
    //   旧判据（整数倍 + 仅 SAME_STEP 虚报）对这两种**都必定漏报**：
    //     A18：实际=声明+1，非整数倍 ⇒ 整数倍判据不报；实际>声明 ⇒ 虚报分支不开 ⇒ 漏。
    //     A19：实际=0 ⇒ `actual > sum` 为假 ⇒ 整数倍不报；但 butterfly 不在 SAME_STEP_GROUPS ⇒ 虚报分支不开 ⇒ 漏。
    //   这两条若升级后仍是 0 命中，就说明严格判据没真正生效。
    { id: 'A18', kind: 'ATTR', desc: '苦练攻击加成手抖多加 1 点（非整数倍，旧判据必漏）',
      file: 'modules/26elite-sixsects-songqingshu.js',
      from: "{ source: '苦练', value: atkDelta,",
      to:   "{ source: '苦练', value: atkDelta + 1," },
    { id: 'A19', kind: 'ATTR', desc: '蝶变附身防御加成完全失效（宿主+额外队友两条路径都改 0，非整数倍判据必漏）',
      file: 'modules/27elite-mingjiao-xiaozhao-sister.js',
      from: "{ source: '蝶变附身', value: defTransfer,",
      to:   "{ source: '蝶变附身', value: 0,",
      multi: true },
    { id: 'T1', kind: 'TEXT', desc: '破防日志写 -（reduce+5）（实际仍只扣 reduce）',
      file: 'core/16effect-handlers.js',
      from: "targetName: target.name, reduce }",
      to:   "targetName: target.name, reduce: reduce + 5 }" },
    { id: 'T2', kind: 'TEXT', desc: '坚盾日志 increment 多写 5（实际未变）',
      file: 'core/03battle-utils.js',
      // V2.9.0：锚点已失效（主代码给 fact 补了 unitUid，原 from 串 0 处 ⇒ sed 注入了个寂寞、树=干净树），
      //   而 judge 对 TEXT 无条件判 effective ⇒ 「没注入」被当成「规则没牙」⇒ T2 长期挂着假真盲区。锚点同步到现行串。
      from: "data: { unitName: unit.name, unitUid: unit.uid, label, increment, current: fortifyThisRound + increment, cap }",
      to:   "data: { unitName: unit.name, unitUid: unit.uid, label, increment: increment + 5, current: fortifyThisRound + increment, cap }" },
    // --- 第 43 轮新增：专测「fact 已发、数值写错」—— 检验规则侧（而非对照器）对这些 fact 有没有牙 ---
    //   背景：主代码 V6.0.3 补发了 METEOR_SPLASH_GROWTH（此前枚举/渲染/翻译链接好却零 emit）。
    //   补发之后，真正的风险变成「fact 发了但没人校验它的数值」—— 只有 TEXT 变异能证伪这件事：
    //   把 fact 里声明的数值改错（实际属性不动），规则若报红⇒有牙；不报⇒这条 fact 是纯装饰。
    { id: 'T3', kind: 'TEXT', desc: '流星溅射成长 fact 的 growth 多写 5（实际未变）',
      file: 'core/16effect-handlers.js',
      from: "data: { unitName: ctx.unit.name, growth } }",
      to:   "data: { unitName: ctx.unit.name, growth: growth + 5 } }" },
    { id: 'T4', kind: 'TEXT', desc: '生生不息 fact 的 atkGain 多写 5（实际未变）',
      file: 'modules/26elite-sixsects-zhangsanfeng.js',
      from: "atkGain: selfAtkGain,",
      to:   "atkGain: selfAtkGain + 5," },
    { id: 'T5', kind: 'TEXT', desc: '性奋代价 fact 的 penalty 多写 5（实际未变）',
      file: 'modules/26elite-sixsects-songqingshu.js',
      from: "oldMaxHp, newMaxHp: Math.floor(unit.maxHp), penalty }",
      to:   "oldMaxHp, newMaxHp: Math.floor(unit.maxHp), penalty: penalty + 5 }" },
    // 第 44 轮新增：把流星加攻的**来源**写死（不再依赖小昭·姊的海克斯增强）→ 无增强来源的场次也会加攻。
    //   专为验证 136（第 44 轮重锚后只剩「来源合法性」一条信号）**是否真有牙** ——
    //   重锚后的规则若没有变异能触发它，就只是又一次「看起来有覆盖、实际恒绿」。
    //   kind 取 ATTR：它确实会让单位攻击真正上涨（addMod 生效），指纹会变。
    { id: 'T6', kind: 'ATTR', desc: '流星加攻来源写死（无小昭·姊增强也加攻）',
      file: 'core/16effect-handlers.js',
      from: "const perSplash = enhance ? (enhance.atkPerSplash || 0) : 0;",
      to:   "const perSplash = 2;" },
    // 第 47 轮新增：验证「虚报校验」从 fortify 扩到新 group 后是否真有牙（而不是死代码）。
    //   苦练 fact 的 targets.atkDelta 多写 5，而 addMod 用的仍是原 atkDelta（实际未变）
    //   ⇒ 声明 > 实际，只有 SAME_STEP_GROUPS 的「sum > actual」分支能抓（整数倍判据抓不到这个方向）。
    { id: 'T7', kind: 'TEXT', desc: '苦练 fact targets 的 atkDelta 多写 5（实际未变）',
      file: 'modules/26elite-sixsects-songqingshu.js',
      from: "kuLianTargets.push({ unitName: u.name, atkDelta, defDelta, maxHpDelta });",
      to:   "kuLianTargets.push({ unitName: u.name, atkDelta: atkDelta + 5, defDelta, maxHpDelta });" },
    // 第 52 轮新增：验证新补契约 SPIDER_TRANSFORM / LEECH_MAXHP 是否真有牙（而非死代码）。
    //   把 addMod 实际侧 value 翻倍，fact 增量（atkDelta / maxHpDelta）不动 ⇒ 实际=2×声明，严格判据必抓。
    { id: 'A20', kind: 'ATTR', desc: '吸血上限提升 maxHp 增量翻倍（LEECH 处理器）',
      file: 'core/16effect-handlers.js',
      from: "addMod(decl.source, 'maxHp', { source: '吸血上限提升', value: delta, ttl: 'permanent', group: 'leechMaxHp', op: 'add' });",
      to:   "addMod(decl.source, 'maxHp', { source: '吸血上限提升', value: delta * 2, ttl: 'permanent', group: 'leechMaxHp', op: 'add' });" },
    { id: 'A21', kind: 'ATTR', desc: '蛛变加攻增量翻倍',
      file: 'modules/20elite-skills.js',
      from: "addMod(unit, 'atk', { source: '蛛变·' + newRole, value: newStats.atk, ttl: 'permanent', group: 'spiderTransform', op: 'add' });",
      to:   "addMod(unit, 'atk', { source: '蛛变·' + newRole, value: newStats.atk * 2, ttl: 'permanent', group: 'spiderTransform', op: 'add' });" },
    // 第 53 轮新增：验证新补契约 STAT_CHANGE / RIGHTEOUS_FACE 是否真有牙（而非死代码）。
    //   A22 把 STAT_CHANGE 的 def 分支 addMod 实际侧 value 翻倍（fact 的 delta 不动）⇒ 实际=2×声明；
    //     STAT_CHANGE 是 allowNeg 契约（降防声明为负），严格闸门放开负值，翻倍后 actual=-2×delta ≠ sum=-delta ⇒ 命中。
    //   A23 把正义国字脸叠防 addMod 实际侧 defGain 翻倍（fact 的 pangDefGain 不动）⇒ 实际=2×声明；
    //     RIGHTEOUS_FACE 走保守判据（跨步同 BREAK_DEF），翻倍 ⇒ 整数倍超应用 ⇒ 命中。
    { id: 'A22', kind: 'ATTR', desc: '属性裁定 def 增量翻倍（STAT_CHANGE def 分支 addMod）',
      file: 'core/16effect-handlers.js',
      from: "addMod(decl.target, 'def', { source: decl.reason || '属性变更', value: decl.delta, ttl: 'permanent', group: 'statChange', op: 'add' });",
      to:   "addMod(decl.target, 'def', { source: decl.reason || '属性变更', value: decl.delta * 2, ttl: 'permanent', group: 'statChange', op: 'add' });" },
    { id: 'A23', kind: 'ATTR', desc: '正义国字脸叠防 defGain 翻倍',
      file: 'modules/26elite-sixsects-pangyuanqiao.js',
      from: "addMod(pang, 'def', { source: '正义国字脸', value: face.defGain, ttl: 'permanent', group: 'righteousFace', op: 'add' });",
      to:   "addMod(pang, 'def', { source: '正义国字脸', value: face.defGain * 2, ttl: 'permanent', group: 'righteousFace', op: 'add' });" },
    // ===== 第 54 轮：覆盖率收官 22/22，给AURA / HOLY_FLAME 两条新契约加牙 =====
    //   A24 把空列光环 addMod 实际侧 value 翻倍（fact 的 emptyCol 不动）⇒ 实际=2×声明；
    //     AURA 走严格判据（fact 与 addMod 同循环同一步 + round 续期口径已修）⇒ actual≠sum 命中。
    //     ⚠️ core/11 双方阵营（A/B 队）循环里该行出现 2 次，用 multi:true 两处同改（等价于"光环 universally 翻倍"）。
    //   A25 把圣火令攻方**实际侧 addMod** 的 value 翻倍、**fact 的 ratio 保持不动**（ratio 若同翻则无偏差），
    //     制造 mulSum=2×ratio ≠ sum ⇒ HOLY_FLAME 严格判据命中。
    //     锚点用 8 空格缩进锁定 applyHolyFlame_Normal 分支（L40）；_Brother 分支同语句是 4 缩进（L54），故唯一。
    { id: 'A24', kind: 'ATTR', desc: '空列光环 atk 增量翻倍（AURA 严格判据）',
      file: 'core/11battle-round.js',
      from: "value: auraBonuses.emptyCol, ttl: 'round', group: 'aura', op: 'add' });",
      to:   "value: auraBonuses.emptyCol * 2, ttl: 'round', group: 'aura', op: 'add' });",
      multi: true },
    { id: 'A25', kind: 'ATTR', desc: '圣火令攻方乘率翻倍（HOLY_FLAME mul 判据）',
      file: 'core/14buff-effects.js',
      // 2026-10-15 第 91 轮重校：主代码 6f4c103/8073bbe「妹永久圣火令改画行列命中制」把圣火令拆成
      //   两条路径（基础 buff 的 cols/rows 检查 + 妹永久的 draw.cols/draw.rows 检查），atk addMod 行
      //   两处完全相同 ⇒ 单点锚点不再唯一（--verify 报「出现 2 次」）。sed 单行替换不支持多行锚点，
      //   改 multi：两处一起翻倍——单场只有一条路径生效，语义与原牙一致，HOLY_FLAME_ATK 契约照样应咬。
      from: "        addMod(unit, 'atk', { source: '圣火令', value: CONFIG.BUFFS.holyFlame.atkBonus, ttl: 'round', op: 'mul', group: 'holyFlame' });",
      to:   "        addMod(unit, 'atk', { source: '圣火令', value: CONFIG.BUFFS.holyFlame.atkBonus * 2, ttl: 'round', op: 'mul', group: 'holyFlame' });",
      multi: true },
    // ===== 第 64 轮新增：验证 rule112（灭绝重设计行为数值回归）真有牙，而非恒绿 =====
    //   关键设计：rule112 是「渲染文本 vs 配置真值」的漂移/一致性规则 —— 它读 getSkillParams('灭绝师太',…)
    //   取到的配置值，与引擎渲染进战报的数字比对。若直接改 JSON 配置，规则「预期值」会跟着一起动，
    //   永远咬不到（目标自己跑了）。要让它有牙，必须**只污染渲染代码**、保留配置真值不动：
    //   引擎渲染出 ×2 的系数、规则仍按配置 0.8/100% 比对 ⇒ 数字不符 ⇒ 报红。
    //   这两条专打 rule112 的两个数值判据（反击系数 / 三击吸血比例），证明「渲染数字一旦偏离配置即被抓」。
    { id: 'A26', kind: 'ATTR', desc: '灭绝反击渲染系数×2（污染渲染，配置0.8不动 → rule112 反击判据应咬）',
      file: 'modules/26elite-sixsects-miejueshitai.js',
      // 第 64 轮修锚点：原 from 含「🗡 灭绝师太反击 ${attacker.name}！」前缀，GNU sed BRE 在
      //   全角「！」/emoji 衔接处静默失配（各子串单独都能匹配、拼接却 0 命中）。改锚到**纯系数包裹段**
      //   `（伤害×${counter.dmgRatio}）`（已实测 sed 可命中且全仓唯一——其余 3 处「（伤害×」无此完整 token），
      //   只污染渲染数字、配置真值 0.8 不动 ⇒ rule112 比对不符报红。
      from: "（伤害×${counter.dmgRatio}）",
      to:   "（伤害×${counter.dmgRatio * 2}）" },
    { id: 'A27', kind: 'ATTR', desc: '灭绝三击吸血报值×2（渲染污染 → rule165 判据3 落地值自洽 K==H2-H1 应咬）',
      file: 'modules/26elite-sixsects-miejueshitai.js',
      from: "回复 ${actualHeal} 点${mutedTag}",
      to:   "回复 ${actualHeal * 2} 点${mutedTag}" },
    // ===== 第 65 轮新增：验证坚盾双规则（125 计数时序 / 130 叠加超上限）真有牙，而非恒绿 =====
    //   两条都扫渲染后战报里的「🛡️ X 坚盾：防御+N（已叠C/Y）」detail 文案（render/35-facts-stat.js L68，
//   2026-10-18 第 100 轮随 render/35 拆分由 -facts-effect.js 迁入）。
    //   污染渲染数字、引擎实际侧不动 ⇒ 规则一旦读不到异常就证明是死代码。
    //   T8：把显示 current 写死成 0 ⇒ 每场坚盾都现「已叠0/Y」⇒ rule125（已叠0/ 复发信号）应咬。
    //   T9：把显示 current 写成 cap+1 ⇒ 永远 cur>cap ⇒ rule130（X>Y 溢出信号）应咬。
    { id: 'T8', kind: 'TEXT', desc: '坚盾渲染 current 写死 0（⇒已叠0/Y → rule125 计数时序应咬）',
      file: 'render/35-facts-stat.js',
      from: "（已叠${fact.current}/${fact.cap}）",
      to:   "（已叠0/${fact.cap}）" },
    { id: 'T9', kind: 'TEXT', desc: '坚盾渲染 current 写成 cap+1（⇒已叠Y+1/Y → rule130 叠加超上限应咬）',
      file: 'render/35-facts-stat.js',
      from: "（已叠${fact.current}/${fact.cap}）",
      to:   "（已叠${fact.cap + 1}/${fact.cap}）" },
    // ===== 第 65 轮新增：验证 rule143（张无忌九阳神功回复量=12%）真有牙 =====
    //   九阳 pct 的唯一真值源是 content/200game-data.json 张无忌 mechanics[0].onHitEffects[0].pct（=0.12），
    //   rule143 硬编码期望 floor(maxHp×0.12)。2026-10-23 落地值口径后 pct 调小与折扣不可区分，
    //   rule143 改抓「调大」：pct→0.15 ⇒ 实回 floor(maxHp×0.15) > floor(maxHp×0.12) ⇒ 命中
    //   rule143 超上限分支(heal>expect)报「超出公式上限」⇒ 有牙（调小方向已弃，见 rule143 V6.2.2 注释）。
    //   锚点 { "type": "healMaxHpPct", "pct": 0.12 } 全仓唯一（Grep 确认仅 1 处）。
    { id: 'T10', kind: 'TEXT', desc: '九阳 healMaxHpPct.pct 0.12→0.15（调大 → heal>expect 超上限 → rule143 应咬）',
      file: 'content/200game-data.json',
      from: "{ \"type\": \"healMaxHpPct\", \"pct\": 0.12 }",
      to:   "{ \"type\": \"healMaxHpPct\", \"pct\": 0.15 }" },
    { id: 'T11', kind: 'ATTR', desc: '乘风/年轻气盛击退距离 target.pos+3 → +2（⇒ 击退距离≠+3 → rule138 应咬）',
      file: 'core/13battle-shared.js',
      from: "const behindPos = target.pos + 3;",
      to:   "const behindPos = target.pos + 2;" },
    // T12/T13/T14：污染渲染数字（引擎真值不动），对应规则比对父伤害/固定下限必咬，绕开单源陷阱。
    // T12 原为「渲染伤害×0.3 → 触发旧判据『伤害<1.5』」；2026-10-09 引擎 V6.0.8 起 fact.dmg 回填
    //   减伤后落地值（合法 <1.5），rule132 判据1 已改为「有限数且≥0」，×0.3 不再触发。
    //   改打**负数**（新判据的守卫点：Math.max(0,…) 下限被破坏）。
// T12：2026-10-11 第 68 轮修锚点 —— 爪击伤害渲染由 `造成 ${fact.dmg} 点伤害`
//   改为 `造成 ${fmt1(fact.dmg)} 点伤害`（fmt1 取整包裹），旧 from 0 处 ⇒ 树木=干净树（假绿制造机）。
//   锚点改指 `造成 ${fmt1(fact.dmg)} 点伤害`，to 取负 ⇒ 渲染出负伤害 ⇒ rule132 判据1（dmg<0）应咬。
//   （2026-10-18 第 100 轮：该行随 render/35 拆分迁至 render/35-facts-stat.js L194，仅换 file 路径。）
    { id: 'T12', kind: 'TEXT', desc: '九阴白骨爪渲染伤害取负（fmt1 包裹后⇒ 落地伤害<0 → rule132 判据1 应咬）',
      file: 'render/35-facts-stat.js',
      from: "造成 ${fmt1(fact.dmg)} 点伤害",
      to:   "造成 ${fmt1(fact.dmg * -1)} 点伤害" },
    { id: 'T13', kind: 'TEXT', desc: '嗜血狂刀吸血渲染量×2（⇒ 吸血>伤害×0.85 → rule151 判据2应咬）',
      file: 'render/35-facts-heal.js',
      from: "的嗜血狂刀吸血+${fact.leechVal}",
      to:   "的嗜血狂刀吸血+${fact.leechVal * 2}" },
    { id: 'T14', kind: 'TEXT', desc: '韦一笑吸血(plusMaxHp)渲染heal×2（⇒ 吸血>伤害×maxRatio余量 → rule159 判据3应咬）',
      file: 'render/36-generic-renderers.js',
      from: "${label}+${heal}，上限→${fact.newMaxHp}",
      to:   "${label}+${heal * 2}，上限→${fact.newMaxHp}" },
    // 第 68 轮新增：验证 rule163（正义国字脸叠防数值回归）真有牙，而非恒绿。
    //   rule163 读 ATTACK fact 的 data.pangDefGain，与配置 getSkillParams('胖远桥','righteousFace').defGain 对账；
    //   写事实那行在 modules/26 L368（pangDefGain = face.defGain）。把写入值×2 ⇒ 事实≠配置 ⇒ rule163 判据2 应咬。
    //   注意：addMod 实际加防（L337）仍用 face.defGain（正确），只有事实字段被污染 ⇒ 游戏真值不变、仅体检抓到，
    //   且**不是单源陷阱**（配置与事实写入分属两处，污染写入代码≠污染配置）。
    { id: 'T15', kind: 'ATTR', desc: '正义国字脸 pangDefGain 写入×2（⇒ 事实≠配置defGain → rule163 判据2应咬）',
      file: 'modules/26elite-sixsects-pangyuanqiao.js',
      from: "data.group.data.pangDefGain = face.defGain;",
      to:   "data.group.data.pangDefGain = face.defGain * 2;" },
    // 第 68 轮新增：验证 rule164（吸血上限提升数值回归）真有牙，而非恒绿。
    //   rule164 读 WEI_LEECH fact 的 data.newMaxHp，要求其为有限正整数（判据2）；写入点在 core/15 L276
    //   `newMaxHp: Math.floor(newMaxHp)`（取整保整数）。把取整结果+0.5 ⇒ 事实变非整数 ⇒ rule164 判据2 应咬。
    //   同样非单源陷阱：newMaxHp 由「unit.maxHp+heal」算出、取整后入 fact，规则只验整数性，配置不参与。
    { id: 'T16', kind: 'ATTR', desc: '吸血上限 newMaxHp 取整后+0.5（⇒ 非整数 → rule164 判据2应咬）',
      file: 'core/15-skill-mechanisms.js',
      from: "newMaxHp: Math.floor(newMaxHp),",
      to:   "newMaxHp: Math.floor(newMaxHp) + 0.5," },
    // ===== 第 71 轮新增：验证 SOUL_DRAIN（摄魂·削弱型海克斯）严格契约真有牙，而非恒绿 =====
    //   背景：第 71 轮主代码 2424621 给 core/04 applySoulDrain 补发 SOUL_DRAIN_APPLY fact，
    //   体检契约由「警告态（零声明·非空转）」升为严格判据（stat-decl-vs-actual-check V3.0.1）。
    //   本牙 mirror A25（HOLY_FLAME mul 判据）：把 addMod 实际侧 value 翻倍、**fact 的 ratio 保持不动**
    //   （ratio 若同翻则无偏差）⇒ mulSum=2×ratio ≠ sum ⇒ SOUL_DRAIN 严格判据命中；
    //   ATTR 类变异规则侧无责，预期判定 =「规则无牙·对照器兜住」。
    { id: 'A28', kind: 'ATTR', desc: '摄魂乘率翻倍（SOUL_DRAIN 严格 mul 判据）',
      file: 'core/04buff-system.js',
      from: "addMod(unit, 'atk', { source: '摄魂', value: ratio, ttl: 'round', op: 'mul', group: 'soulDrain' });",
      to:   "addMod(unit, 'atk', { source: '摄魂', value: ratio * 2, ttl: 'round', op: 'mul', group: 'soulDrain' });" },
    // ===== 第 88 轮新增：rule113 惑心换位（第 87 轮落地，tests/health-rules/166）零变异牙 =====
    //   背景：A28 史（第 82 轮）——新规则没有牙 ⇒ 主代码改写法时规则静默死亡，"恒绿但什么都不测"。
    //   rule113 五判据里判据1（配对完整性）与判据5（宣告位置生效）此前无任何牙齿覆盖。
    //   T17：敌方 SWAP fact 的 side 常量漂移 ENEMY→ALLY —— 敌方分支结果被贴上前台标签，
    //     文本流变成「己方,己方」相邻 ⇒ 判据1「首条惑心（己方）之前不是敌方条目」应咬。
    //     敌方侧 roll 失败时该条不产生（FAIL 分支不动）⇒ 样本里需至少一次敌方 SWAP（概率 80%/95%，覆盖充足）。
    { id: 'T17', kind: 'TEXT', desc: '敌方惑心换位 fact 的 side 漂移成己方（⇒ 配对断链 → rule113 判据1应咬）',
      file: 'core/14buff-effects.js',
      from: "data: { side: CAMP_TYPES.ENEMY, unitA: { uid: a.uid, name: a.name }, unitB: { uid: b.uid, name: b.name }, posA, posB, dmg: dmgOnSwap } });",
      to:   "data: { side: CAMP_TYPES.ALLY, unitA: { uid: a.uid, name: a.name }, unitB: { uid: b.uid, name: b.name }, posA, posB, dmg: dmgOnSwap } });" },
    //   T18：SWAP fact 把两个旧位置报反（posA/posB 对调，multi 两分支同改）—— 实际换位照常发生，
    //     但宣告的 oldPosA/oldPosB 与真相对调 ⇒ 判据5「A 应落到 oldPosB」永远不命中 ⇒ 应咬。
    //     判据2（自洽）抓不到（uid/位置仍合法且相异）—— 正是要单独验证判据5 有牙。
    { id: 'T18', kind: 'TEXT', desc: '惑心换位 fact 报反新旧位置（⇒ 宣告位置未生效 → rule113 判据5应咬）',
      file: 'core/14buff-effects.js',
      // 2026-10-15 第 93 轮重修（原设计是空操作！）：旧 from/to 把简写属性 `{ ..., posA, posB }` 换成
      //   `{ ..., posB, posA }` —— ES6 简写只换**键顺序**不换值，生成的对象一模一样 ⇒ sed 注入成功
      //   但行为零变化，树仍是干净树 ⇒ 第 92 轮首测 0 命中还害我误判"规则没牙"。真变异必须换**值**：
      //   `posA: posB, posB: posA`（fact 的 posA 字段装 posB 的值、反之亦然）⇒ 渲染文本位置对调
      //   ⇒ 判据5（含第 93 轮终局兜底）应咬。
      from: "unitB: { uid: b.uid, name: b.name }, posA, posB",
      to:   "unitB: { uid: b.uid, name: b.name }, posA: posB, posB: posA",
      multi: true },
    { id: 'A29', kind: 'ATTR', desc: '空见金刚不坏加持计数器 +1→+2（跳号 → rule172 判据1「严格1,2,3」应咬）',
      file: 'modules/26elite-sixsects-kongjian.js',
      from: "kj.state._kongJianUsed = (kj.state._kongJianUsed || 0) + 1;",
      to:   "kj.state._kongJianUsed = (kj.state._kongJianUsed || 0) + 2;" },
];

function toPosix(p) {
    return p.replace(/^([A-Za-z]):/, (m, d) => '/' + d.toLowerCase()).replace(/\\/g, '/');
}

// 新鲜度守卫（V2.9.0，第 139 轮起扩为六项）：返回陈旧原因数组；空数组 = 结果配得上当前代码。
// 六项检查，任一项命中即判陈旧：
//   ① 判据文件（本文件）mtime 晚于结果文件 ⇒ 判定代码已更新，结果没重跑
//   ② 结果头部的 VER / 变异表指纹 MUTFP 与当前不符
//   ③ 当前 MUTATIONS 里有条目在结果里没有结果块（覆盖不全）
//   ④ 任一变异树目录 mtime 晚于结果文件 ⇒ 树已重建（叠加了新工作树/新注入）却没重跑
//   ⑤ （V2.9.15 第 134 轮新增）判据（规则）文件指纹 RULEFP 与当前不符 ⇒ 规则改过，牙口结论配不上
//      —— 补的正是第 129/132 轮各改 21 个规则文件而守卫全程沉默那个洞，详见 ruleFingerprint 注释。
//   ⑥ （第 139 轮并入上游同号改动）引擎源码指纹 ENGFP 与当前引擎源码不符 ⇒ 引擎代码改过，
//      而变异表 MUTFP 没变 ⇒ 旧结果照样渲染，属"旧结果配新引擎"的假结论，详见 engineFingerprint 注释。
//      ★ 与⑤互补而非重复：⑤盯判据（tests/health-rules + 122health-utils），⑥盯被测（core/modules/… 主代码）。
//      两边第 134 / 139 轮各补了一项、都编为⑤，本轮合并时按"两个盲区都真、都要守"并成⑤⑥，不删任何一边。
function checkFreshness(txt, resultsPath) {
    const why = [];
    const meta = {};
    for (const line of txt.split('\n')) {
        const m = line.match(/^#META\s+(\w+)=(.*)$/);
        if (m) meta[m[1]] = m[2].trim();
    }
    const resMtime = fs.statSync(resultsPath).mtimeMs;
    // ① 判据文件比结果新
    try {
        const selfMtime = fs.statSync(fileURLToPath(import.meta.url)).mtimeMs;
        if (selfMtime > resMtime) {
            why.push(`判据文件 mutation-teeth.mjs 比结果文件新（${fmt(selfMtime)} > ${fmt(resMtime)}）—— 判定逻辑改过，结果没重跑`);
        }
    } catch (e) { /* 拿不到 mtime 不拦 */ }
    // ② VER / MUTFP
    if (!meta.VER) why.push('结果文件缺少 #META VER 头（V2.9.0 之前的旧结果，无法证明配得上当前判据）');
    else if (meta.VER !== VER) why.push(`判据版本不符：结果由 ${meta.VER} 生成，当前 ${VER}`);
    const fpNow = mutFingerprint();
    if (!meta.MUTFP) why.push('结果文件缺少 #META MUTFP 头（无法证明变异表未变）');
    else if (meta.MUTFP !== fpNow) why.push(`变异表指纹不符：结果侧 ${meta.MUTFP}，当前 ${fpNow} —— 变异改过，结果没重跑`);
    // ⑤ 判据（规则）文件内容指纹（V2.9.15）：规则文件一改，"某规则有牙"的结论就可能整条作废。
    //    缺头 = V2.9.15 之前生成的结果，无法证明规则未变 ⇒ 同样判陈旧（本轮本地证据正是这种情况）。
    const rfpNow = ruleFingerprint();
    if (!meta.RULEFP) why.push(`结果文件缺少 #META RULEFP 头（V2.9.15 之前的结果，无法证明规则文件未变；当前规则指纹 ${rfpNow}）——重跑变异树后自动生成`);
    else if (meta.RULEFP !== rfpNow) why.push(`规则文件指纹不符：结果侧 ${meta.RULEFP}，当前 ${rfpNow} —— 判据（规则）文件改过，牙口结论可能已配不上当前代码`);
    // ⑥ 引擎源码指纹（第 139 轮并入上游改动：引擎改了但变异表 MUTFP 没变，旧结果仍会假绿）
    const engFp = engineFingerprint();
    if (!meta.ENGFP) why.push(`结果文件缺少 #META ENGFP 头（无法证明引擎源码未变；当前引擎指纹 ${engFp}）——重跑变异树后自动生成`);
    else if (meta.ENGFP !== engFp) why.push(`引擎源码指纹不符：结果侧 ${meta.ENGFP}，当前 ${engFp} —— 引擎代码改过（即便变异表没变），结果没重跑`);
    // ③ 覆盖不全
    const missing = MUTATIONS.filter(m => !txt.includes(`##### MUT m-${m.id} #####`)).map(m => m.id);
    if (!txt.includes('##### MUT _base #####')) missing.unshift('_base');
    if (missing.length) why.push(`结果覆盖不全（${missing.length} 条缺结果块）：${missing.join('、')}`);
    // ④ 树比结果新
    const newerTrees = [];
    for (const id of ['_base', ...MUTATIONS.map(m => 'm-' + m.id)]) {
        const d = path.join(MUT_ROOT, id);
        try {
            if (fs.existsSync(d) && fs.statSync(d).mtimeMs > resMtime) newerTrees.push(id);
        } catch (e) { /* ignore */ }
    }
    if (newerTrees.length) why.push(`变异树已重建但未重跑（${newerTrees.length} 棵 mtime 晚于结果）：${newerTrees.slice(0, 8).join('、')}${newerTrees.length > 8 ? '…' : ''}`);
    return why;
}

// 实证「变异串是否真落进那棵树」（V2.9.0）。--verify 只查**当前仓库**有没有 from，
//   查的是"现在能不能注入"；这里查的是"当时那棵树里到底有没有 to" —— 只有后者能证明跑的是变异树而非干净树。
//   （prep 之后主代码又被改过、或 from 在 prep 时已被改写，都只有这一步能抓到。）
function checkInjected(mut) {
    const fp = path.join(MUT_ROOT, 'm-' + mut.id, mut.file);
    if (!fs.existsSync(fp)) return { ok: false, why: `树内没有 ${mut.file}（prep 未跑或树缺失）` };
    let src = '';
    try { src = fs.readFileSync(fp, 'utf8'); } catch (e) { return { ok: false, why: `读不到 ${fp}` }; }
    let n = 0, idx = 0;
    while ((idx = src.indexOf(mut.to, idx)) !== -1) { n++; idx += mut.to.length; }
    if (n === 0) {
        return { ok: false, why: `变异串在树内 0 处 —— 锚点失效，sed 没替换成功，这棵树=干净树（结论全部作废）` };
    }
    return { ok: true, n };
}

function fmt(ms) {
    // 用本地时间（ISO 会显示成 UTC，与用户看到的「文件修改时间」差 8 小时，容易误判谁更新）
    try {
        const d = new Date(ms), p2 = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
    } catch (e) { return String(ms); }
}

// 变异表指纹（V2.9.0）：结果文件必须记录**生成它时的变异表**，否则变异改了、结果没重跑，
// 报告照样渲染 ⇒ 又一次"旧结果配新判据"。只取会影响注入结果的字段（顺序+内容）。
function mutFingerprint() {
    const sig = MUTATIONS.map(m => [m.id, m.kind, m.file, m.from, m.to, !!m.multi].join('\u0001')).join('\u0002');
    return crypto.createHash('sha1').update(sig).digest('hex').slice(0, 12);
}

// 判据（规则）文件指纹（V2.9.15 | 第 134 轮）：结果文件必须记录**生成它时的判据文件内容**。
//   动因（本轮真事故）：第 129 / 132 轮各改了 21 个规则文件，而 V2.9.0 的四项新鲜度守卫
//   只盯「判据文件（本文件 mutation-teeth.mjs）mtime / VER / MUTFP / 变异树 mtime」，
//   **一项都不盯规则文件被改** ⇒ 牙口矩阵文档顶上至今写着「新鲜度守卫：通过」，
//   而它那些"某规则有牙"的结论里已有 3 条对不上当前代码（第 133 轮 rule-teeth-evidence-selftest 实测）。
//   守卫说谎比没有守卫更坏：它让人以为结论还配得上代码。
//   为什么不用 mtime：mtime 会被 touch / git checkout / 重新 clone 刷新 ⇒ 假阳性；且 mtime 只能说
//   "可能变了"，说不出"哪条结论作废了"。改用**内容哈希**：内容没变指纹就不变，不受任何文件操作影响。
//   与 rule-teeth-evidence-selftest 分工：本守卫是**粗粒度快速预警**（判据整体变过没），
//   后者是**细粒度实质对账**（究竟哪条结论作废）。两者互补，不是替代。
//   口径（只钉判据，不含被测主代码）：tests/health-rules/*.js（47 个规则文件）+ tests/122health-utils.js
//   （判据宿主，V6.x 系列判据都在里头）。改名 / 增删文件同样会改指纹 —— 按设计如此。
function ruleFingerprint() {
    const h = crypto.createHash('sha1');
    const dir = path.join(HERE, 'health-rules');
    let files = [];
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort(); } catch (e) { /* 目录不在记空集 */ }
    h.update('health-rules\u0001' + files.join('\u0002') + '\u0003');
    for (const f of files) {
        h.update(f + '\u0001');
        try { h.update(fs.readFileSync(path.join(dir, f))); } catch (e) { h.update('\u0002READ_FAIL'); }
    }
    // 122health-utils.js：静默位移判据 / 行动权不变量等判据的宿主文件，改动同样会让牙口结论作废。
    try {
        h.update('122health-utils.js\u0001');
        h.update(fs.readFileSync(path.join(HERE, '122health-utils.js')));
    } catch (e) { h.update('\u0002READ_FAIL'); }
    return h.digest('hex').slice(0, 12);
}

// 引擎源码指纹（上游 V2.9.15 / item ③，第 139 轮合并并入为守卫第⑥项）：记录**生成结果时的引擎源码**，
// 否则引擎代码改了（即便变异表 MUTFP 没变）、结果没重跑，报告照样渲染 ⇒ "旧结果配新引擎"假结论
// （正是 rule-teeth-evidence-selftest 第 128 轮点出的盲区：鲜度守卫盯不到引擎被改）。
// 只哈希 mutation 树实际叠加的战斗相关源码目录（与第 42 轮叠加口径一致：core/modules/infra/player/render/content），
// 路径取相对 REPO 保证跨 worktree 稳定。★ 与上方 ruleFingerprint 互补：一个盯判据、一个盯被测，缺一个都是盲区。
function engineFingerprint() {
    const dirs = ['core', 'modules', 'infra', 'player', 'render', 'content'];
    let sig = '';
    for (const d of dirs) {
        const full = path.join(REPO, d);
        if (!fs.existsSync(full)) continue;
        const files = [];
        (function walk(p) {
            let ents;
            try { ents = fs.readdirSync(p, { withFileTypes: true }); } catch { return; }
            for (const e of ents) {
                if (e.isDirectory()) {
                    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
                    walk(path.join(p, e.name));
                } else if (e.name.endsWith('.js')) {
                    files.push(path.join(p, e.name));
                }
            }
        })(full);
        files.sort();
        for (const fp of files) {
            let c;
            try { c = fs.readFileSync(fp, 'utf8'); } catch { continue; }
            sig += path.relative(REPO, fp) + '\u0001' + crypto.createHash('sha1').update(c).digest('hex').slice(0, 10) + '\u0002';
        }
    }
    return crypto.createHash('sha1').update(sig).digest('hex').slice(0, 12);
}

// BRE 转义：sed 基本正则里这些字符需反斜杠转义才能按字面匹配。
// 注意 `(` `)` `{` `}` 在 BRE 里本就是字面量，不要转义；只转 `. * ^ $ [ ] \`。
// 早期用 \Q...\E（Perl/PCRE 语法）在 GNU sed 下完全不生效，导致变异静默未注入（树木=干净树）。
function breEscape(s) {
    // 同时转义 " —— sed 命令整体包在 bash 双引号里，from/to 若含字面 "（如 JSON 锚点
    // `{ "type": "healMaxHpPct"... }`）会被 bash 当引号配对吃掉，致 sed 模式失配、注入 0 处。
    return s.replace(/[.*^$[\]\\"]/g, m => '\\' + m);
}

// 解析：见下方 parseBlock（逐行切分 REPLAY/BASELINE/STAT/FP 四段）。

// 本环境约束：node 内 spawn 子进程（bash / node）一律被 broker 静默禁用，且同一进程顺序 import 多份「末尾 process.exit 的引擎脚本」会挂起/收集为空。
// 故牙齿测试的执行一律交给 Bash 工具：--emit-run 产出 Bash 循环脚本，每条变异由独立 node 进程跑三件套并落盘；
// --report 再解析落盘结果套用判据。工具本身不 spawn、不 import 业务脚本。

// ★ 第 43 轮判据升级：**以 _base 为对照做「增量」判定，而不是看绝对红数**。
//   起因：干净树可能本就有红（153 实测主代码「⚡ undefined / 重复渲染」是真 bug，120 场 fail=7）。
//   此时「这条变异有没有报红」毫无意义 —— 基线本来就红，红与不红都一样。
//   必须比对**报红明细文本**：同一条规则若因本次变异报出了基线里没有的新文案/新场次，才算真有牙。
// ★ 第 58 轮：_base 干净树的 baseline 段指纹（整段文本归一化排序后拼接）。judge 用它做增量判定。
let BASE_SIG = null;
// V2.9.0：干净树自己的「偏差」条数基准（实测 BREAK_DEF 跨子步 2 条）。偏差只看增量，不看绝对值。
let BASE_MISMATCH = 0;
// V2.9.14：干净树里「命中>0」的契约集合 —— 与 BASE_RED 同理，这些契约失去作证资格。
//   实测当前为空（56 条契约在 _base 上命中皆 0），故本闸门当下不改变任何判定，只防未来假绿。
let BASE_DIRTY_CONTRACTS = {};

function judge(mut, FP0, R, B, S, stf, baseRed, baseDetails, baseDirtyContracts) {
    // ★ 第 58 轮：baselineChanged 改为**相对 _base 干净树的增量**判定。
    //   旧口径 `B.changed || match<18` 是「与录制基线比」，而主代码进行中的 dotTick 让干净树自己就报红线，
    //   ⇒ 任何变异的 changed 恒 true ⇒ no-op 变异（A8/A19/A13，baseline 输出与 _base 逐字节相同）
    //   也被算成「基线能察觉」⇒ 把「变异没生效」误报成「仅基线兜底」。改为增量后这批会正确落到「未观测到影响」。
    const baselineChanged = B.baseSig !== undefined && B.baseSig !== null
        ? B.baseSig !== BASE_SIG
        : (B.changed || (B.match !== null && B.match < 18));
    const fpChanged = FP0 !== null && stf.fp !== null && stf.fp !== FP0;
    const bRed = new Set(baseRed || []);
    const bDet = new Set(baseDetails || []);
    // ★★ 「基线已红的规则失去作证资格」（第 43 轮实测被迫加的第二道闸门）：
    //   153 在干净树就有红（主代码真 bug），于是**任何**改变战斗轨迹的变异都会让它冒出一条新明细
    //   —— A2/A4/A7 因此被误判成「规则有牙」，而它们实际只改了坚盾/近战切换/生生息的属性。
    //   一条在基线就不绿的规则，它的红无法区分「抓到了本次变异」与「战斗轨迹变了顺带红一下」。
    //   → 只有**基线不红**的规则在变异树上新红，才算真有牙；基线已红规则的明细变化单独记为 masked（仅提示）。
    const cleanPairs = (R.pairs || []).filter(p => !bRed.has(p.rule));
    const newRed = [...new Set(cleanPairs.map(p => p.rule))];
    const newDetail = cleanPairs.map(p => p.detail).filter(d => !bDet.has(d));
    const masked = (R.pairs || []).filter(p => bRed.has(p.rule) && !bDet.has(p.detail));
    // V2.9.0：对照器「偏差」方向命中（TEXT 变异的"声明写大 ⇒ 少加/多报"落在这里，statTotal 恒 0）。
    //   同样取**相对干净树的增量**，避免把干净树固有的 2 条 BREAK_DEF 偏差当成有牙。
    const mismatchDelta = (typeof S.statMismatch === 'number' ? S.statMismatch : 0) - BASE_MISMATCH;
    // ★★ V2.9.14：对照器侧「归属 + 不得作证」——与上面规则侧两道闸门同一条道理，只是对象换成契约：
    //   一条在干净树就命中的契约，它的命中无法区分「抓到了本次变异」与「战斗轨迹变了顺带命中」。
    //   ⇒ 只有**干净树命中为 0** 的契约，其在变异树上的新命中才算真有牙；脏契约的命中改记 statMasked。
    //   实测当前 _base 56 条契约命中皆 0 ⇒ 本闸门当下为空操作（零判定迁移），属纯加固。
    const dirtyC = baseDirtyContracts || {};
    const byC = S.statByContract || {};
    const guardians = [];
    let statClean = 0, statMasked = 0;
    for (const k of Object.keys(byC).sort()) {
        if (dirtyC[k]) statMasked += byC[k];
        else { statClean += byC[k]; guardians.push(k + '×' + byC[k]); }
    }
    // 兼容旧结果文件（无逐契约列）：退回归总数口径，不因解析缺口把「有牙」误判成「没牙」。
    if (Object.keys(byC).length === 0 && S.total > 0) { statClean = S.total; guardians.push('(未归属)×' + S.total); }
    const statHit = statClean > 0 || mismatchDelta > 0;
    const effective = mut.kind === 'TEXT' || newDetail.length > 0 || newRed.length > 0
        || baselineChanged || fpChanged || statHit;
    // V2.9.14：把守到它的契约名写进判定 —— 「对照器兜住」从此可审计（谁兜的、兜了几处）。
    const gbit = guardians.length ? `(${guardians.join('、')})` : '';
    if (R.crash) return { verdict: '回放器异常', effective, baselineChanged, fpChanged, newDetail, newRed, masked, statMasked };
    if (!effective) return { verdict: '未观测到影响', effective, baselineChanged, fpChanged, newDetail, newRed, masked, statMasked };
    // 规则侧：只认「基线不红的规则」报出的新红
    const bit = newDetail.length > 0 ? `(+${newDetail.length}条新明细)` : '';
    if (newRed.length > 0) {
        return { verdict: '规则有牙' + bit, effective, baselineChanged, fpChanged, newDetail, newRed, masked };
    }
    if (mut.kind === 'TEXT') {
        // 第 57 轮修判定顺序缺陷：原逻辑 `if (kind==='TEXT') return 装饰品` 排在 `S.total>0` **之前**，
        //   使 TEXT 类变异**无条件**判「装饰品」，完全无视 stat-decl 的实际命中。
        //   实测反例：T7（苦练 fact 的 targets[].atkDelta 多写 5）在变异树上对照器明确报红 223 处
        //   （`✗ 检出重复应用 223 处` + 逐条「少加 5」），却被判成「装饰品(真盲区)」。
        //   TEXT 类本就是「专测 fact 文本有没有牙」（第 43 轮立意），对照器抓到却当没抓到，
        //   是最坏的假盲区 —— 会让人误以为该机制完全没人管。正确顺序同 ATTR：规则 → 对照器 → 装饰品。
        if (statHit) {
            const via = statClean > 0 ? `(+对照器命中 ${statClean}${gbit})`
                                      : `(+对照器偏差 ${mismatchDelta})`;
            if (baselineChanged) return { verdict: '规则无牙·对照器兜底' + via, effective, baselineChanged, fpChanged, newDetail, newRed, masked, statMasked };
            return { verdict: '对照器有牙' + via, effective, baselineChanged, fpChanged, newDetail, newRed, masked, statMasked };
        }
        if (baselineChanged) return { verdict: '❌装饰品(仅基线能察觉)', effective, baselineChanged, fpChanged, newDetail, newRed, masked, statMasked };
        return { verdict: '❌装饰品(真盲区)', effective, baselineChanged, fpChanged, newDetail, newRed, masked, statMasked };
    }
    if (statClean > 0) return { verdict: '规则无牙·对照器兜住' + gbit, effective, baselineChanged, fpChanged, newDetail, newRed, statMasked };
    if (baselineChanged) return { verdict: '规则无牙·仅基线兜底', effective, baselineChanged, fpChanged, newDetail, newRed };
    // 属性变了(fpChanged) 但规则+对照器+基线都没反应
    return { verdict: '⚠属性已变但规则+对照器+基线均未反应(待确认盲区)', effective, baselineChanged, fpChanged, newDetail, newRed };
}

async function main() {
    const argv = process.argv.slice(2);

    if (argv.includes('--emit-prep')) {
        const lines = ['#!/usr/bin/env bash', 'set -e',
            '# 变异牙齿测试 —— 准备脚本（由仓库外 Bash 运行；node 内 spawn bash 在本环境持续 EBUSY）',
            'REPO="$(git rev-parse --show-toplevel)"', `MUTROOT="${toPosix(MUT_ROOT)}"`,
            // 第 43 轮：去掉 `rm -rf "$MUTROOT"` —— 沙箱对「单次会话内删除文件数 >50」有硬拦截，
            //   21 棵树 ≈4600 文件会被判 SAFE_DELETE_BULK_CONFIRM_REQUIRED 直接中止（实测触发）。
            //   改为**零删除的覆盖式重建**：tar -x / cp -r 都是覆盖同名文件，残留的旧文件不影响判定
            //   （--emit-run 只按当前 MUTATIONS 列表跑，多余目录不会被读）。
            'mkdir -p "$MUTROOT/_base"',
            // 第 55 轮：排除 .dsh/.trae —— AI CLI 的 skill 目录（含 SKILL.md）被 git 跟踪，
            //   会随基树复制到每棵变异树（32 棵 × 4 文件），纯白占空间且与变异判定无关。
            //   ⚠️ 排除必须加在 **tar 侧**：本机 git 2.55 的 `archive` 不支持 `--exclude`（实测报 unknown option）。
            'git -C "$REPO" archive HEAD | tar --exclude=.dsh --exclude=.trae -x -C "$MUTROOT/_base"'];
        // ★ 叠加当前工作树（未提交改动）—— **必须在注入变异之前**做完，否则叠加会覆盖掉刚 sed 注入的变异。
        //   两处都必须叠加（基树 _base 叠加一次即可，变异树由 _base 拷贝而来，自动继承）：
        //   ① tests/：否则树木用 git archive HEAD 的旧测试脚本，--fingerprint 会被旧码当普通参数→NaN→死循环（第 38 轮）。
        //   ② 主代码（core/modules/infra/player/render/content）：第 42 轮起因——
        //      A5 的 METEOR_SPLASH_GROWTH fact 发射是**未提交的主代码改动**；若只拿 HEAD 树，临时树里是旧 core/16，
        //      新 fact 根本不发 ⇒ 契约永远零触发（假绿）。变异牙齿测的必须是「当前这份代码」而非上次提交。
        //   排除 .mut 避免把当前 .mut 递归拷进树木。
        lines.push(`tar --exclude=.mut -C "$REPO/tests" -cf - . | tar -x -C "$MUTROOT/_base/tests"`);
        lines.push('for dir in core modules infra player render content; do');
        lines.push('    if [ -d "$REPO/$dir" ]; then tar -C "$REPO/$dir" -cf - . | tar -x -C "$MUTROOT/_base/$dir"; fi');
        lines.push('done');
        for (const m of pickMuts()) {
            // `cp -r src/. dst/` 复制**内容**到已存在的目录（直接覆盖），等价于重建且不需要先删 ——
            // 这一句同时保证了「重复 prep 时变异不会叠加两次」：先把干净的 _base 内容盖回去，再 sed 注入。
            lines.push(`mkdir -p "$MUTROOT/m-${m.id}"`);
            lines.push(`cp -r "$MUTROOT/_base/." "$MUTROOT/m-${m.id}/"`);
            // 第 64 轮修：to（sed 替换串）也必须对 $ 转义，否则含 ${...} 的 to（如 A26/A27 的
            //   `（伤害×${counter.dmgRatio * 2}）`）在双引号 sed 参数里被 bash 当变量展开 ⇒ bad substitution。
            //   对替换串 breEscape 是安全的：. * ^ $ [ ] \ 在 sed 替换侧转义后仍是字面量（非特殊字符前的 \ 被丢弃）。
            lines.push(`sed -i "s#${breEscape(m.from)}#${breEscape(m.to)}#g" "$MUTROOT/m-${m.id}/${m.file}"`);
        }
        console.log(lines.join('\n'));
        return;
    }

    // 产出「Bash 循环运行脚本」：每条变异（含 _base 基准）由独立 node 进程跑三件套并落盘到 teeth-results.txt。
    // 本工具不 spawn / 不 import 业务脚本 —— 本环境两者都被 broker 禁用。
    if (argv.includes('--emit-run')) {
        const ids = ['_base', ...pickMuts().map(m => m.id)];
        const lines = [
            '#!/usr/bin/env bash', 'set -e',
            'REPO="$(git rev-parse --show-toplevel)"',
            `MUTROOT="${toPosix(MUT_ROOT)}"`,
            // 增量模式（ONLY 设定）落独立文件，不冲掉主结果；事后再 --merge-results 合并。
            `OUT="$MUTROOT/${ONLY ? 'teeth-results-inc.txt' : 'teeth-results.txt'}"`,
            ': > "$OUT"',
            // V2.9.0 新鲜度守卫的结果侧：把「生成这份结果时的判据版本 / 变异表指纹 / HEAD / 时间」写进头部。
            //   --report 端据此判断结果是否还配得上当前代码 —— 旧结果配新判据 = 假结论，必须拦。
            `echo "#META VER=${VER}" >> "$OUT"`,
            `echo "#META MUTFP=${mutFingerprint()}" >> "$OUT"`,
            `echo "#META RULEFP=${ruleFingerprint()}" >> "$OUT"`,
            `echo "#META ENGFP=${engineFingerprint()}" >> "$OUT"`,
            'echo "#META HEAD=$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo unknown)" >> "$OUT"',
            'echo "#META AT=$(date -Iseconds)" >> "$OUT"',
            'for id in ' + ids.map(i => i === '_base' ? '_base' : 'm-' + i).join(' ') + '; do',
            '  d="$MUTROOT/$id"',
            '  [ -d "$d" ] || { echo "跳过缺失树 $d"; continue; }',
            '  echo "##### MUT $id #####" >> "$OUT"',
            '  echo "REPLAY:" >> "$OUT"',
            // 第 43 轮：grep 追加 `^\s+\[seed=` —— 把规则报红的**逐场明细行**一起落盘。
            //   原因：干净树可能本就有红（如 153 实测的「⚡ undefined」真 bug），此时只看「哪条规则红」
            //   完全没有分辨力（基线红会把变异红掩盖掉）。改为比对**明细文本**才能分辨
            //   「同一条规则是否因本次变异报出了新的红」。
            // V2.9.13：grep 补 `⚠️` —— 转交中规则的头行此前被过滤掉，其明细在 parseBlock 里无归属（见头部 V2.9.13）。
            '  ( cd "$d" && node tests/rules-replay.mjs 2>/dev/null | grep -E "RESULT:|❌|⚠️|^\\s+\\[seed=" ) >> "$OUT" || true',
            '  echo "BASELINE:" >> "$OUT"',
            '  ( cd "$d" && node tests/140-baseline.js --check 2>/dev/null | grep -E "BASELINE-MATCH|回归|场与基线不一致|DIFF" ) >> "$OUT" || true',
            '  echo "STAT:" >> "$OUT"',
            // V2.9.0：STAT 段补抓「偏差」汇总行 —— TEXT 变异（声明写大 ⇒ 少加/多报）在对照器里
            //   落的是**偏差**计数，不打「检出重复应用」；旧 grep 没抓它 ⇒ 命中恒 0 ⇒ 误判装饰品。
            '  ( cd "$d" && node tests/stat-decl-vs-actual-check.mjs 2>/dev/null | grep -E "重复应用命中|命中明细|✅|✗|偏差" ) >> "$OUT" || true',
            '  echo "FP:" >> "$OUT"',
            '  ( cd "$d" && node tests/stat-decl-vs-actual-check.mjs --fingerprint 2>/dev/null | grep -E "FINGERPRINT" ) >> "$OUT" || true',
            '  echo "" >> "$OUT"',
            'done',
            'echo ALL DONE >> "$OUT"',
        ];
        console.log(lines.join('\n'));
        return;
    }

    // --- 变异锚点自检（第 44 轮新增）---
    //   背景：主代码收口流星渲染（V1.0.10/V6.0.4）时删掉了 T3 变异依赖的那行代码，
    //   于是 T3 **静默失效** —— 树注入了个寂寞，跑出来还是干净树，判成「规则有牙」的假象。
    //   这是「靠 commit 保证锚点」必然踩的坑：主代码一动，测试就不再测它声称在测的东西，
    //   而且**没有任何报错**。故做成常驻命令，每次改主代码后跑一次。
    //   判据：from 串必须在目标文件里出现；非 multi 的必须**恰好 1 次**（否则替换歧义或没替换到）。
    if (argv.includes('--verify')) {
        const repo = REPO;
        let bad = 0;
        console.log('=== 变异锚点自检（from 串是否仍存在于当前代码）===');
        for (const m of MUTATIONS) {
            const fp = path.join(repo, m.file);
            if (!fs.existsSync(fp)) { console.log(`❌ ${m.id} 目标文件不存在：${m.file}`); bad++; continue; }
            const src = fs.readFileSync(fp, 'utf8');
            let n = 0, idx = 0;
            while ((idx = src.indexOf(m.from, idx)) !== -1) { n++; idx += m.from.length; }
            let ok = n >= 1;
            let why = '';
            if (n === 0) { ok = false; why = '该行已被删除/改写 → 变异静默失效，树木=干净树'; }
            else if (!m.multi && n > 1) { ok = false; why = `出现 ${n} 次，非 multi 变异要求唯一`; }
            else if (m.multi && n > 1) why = `multi：${n} 处都改`;
            console.log(`${ok ? '✅' : '❌'} ${m.id.padEnd(4)} ${m.file.padEnd(32)} ${n} 处${why ? ' —— ' + why : ''}`);
            if (!ok) bad++;
        }
        console.log(bad === 0 ? `\n✅ ${MUTATIONS.length} 条变异锚点全部有效`
                             : `\n❌ ${bad} 条变异锚点失效 —— 不修就是「假绿制造机」，请更新 MUTATIONS 里的 from/to`);
        return;
    }

    // 第 92 轮：--merge-results=<inc文件> —— 把增量跑（ONLY 模式）的结果块按 id 替换合并回主结果文件，
    //   并刷新 META（VER/MUTFP/HEAD/AT + NOTE 记录增量来源）。其余块原样保留。
    if (argv.includes('--merge-results') || argv.some(a => a.startsWith('--merge-results='))) {
        const mp = argv.find(a => a.startsWith('--merge-results='));
        const incPath = mp ? mp.slice('--merge-results='.length) : path.join(MUT_ROOT, 'teeth-results-inc.txt');
        const mainPath = path.join(MUT_ROOT, 'teeth-results.txt');
        if (!fs.existsSync(incPath)) { console.log(`❌ 找不到增量结果文件 ${incPath}`); return; }
        const splitBlocks = (txt) => {
            const head = [], blocks = new Map();
            const lines = txt.split(/\r?\n/);
            let cur = null, buf = [];
            for (const ln of lines) {
                const m = ln.match(/^##### MUT (\S+) #####$/);
                if (m) { if (cur) blocks.set(cur, buf.join('\n')); cur = m[1]; buf = [ln]; }
                else if (cur) buf.push(ln);
                else head.push(ln);
            }
            if (cur) blocks.set(cur, buf.join('\n'));
            return { head, blocks };
        };
        const inc = splitBlocks(fs.readFileSync(incPath, 'utf8'));
        const main = fs.existsSync(mainPath) ? splitBlocks(fs.readFileSync(mainPath, 'utf8')) : { head: [], blocks: new Map() };
        let n = 0;
        for (const [id, blk] of inc.blocks) { main.blocks.set(id, blk); n++; }
        const freshMeta = [
            `#META VER=${VER}`,
            `#META MUTFP=${mutFingerprint()}`,
            `#META RULEFP=${ruleFingerprint()}`,
            `#META ENGFP=${engineFingerprint()}`,
            `#META HEAD=${execSync('git rev-parse --short HEAD', { cwd: REPO, encoding: 'utf8' }).trim()}`,
            `#META AT=${new Date().toISOString()}`,
            `#META NOTE=含增量合并 ${n} 块（${[...inc.blocks.keys()].join(',')}，ONLY 模式跑于当前 HEAD）；其余块为此前全量结果，锚点已经 --verify 复核`,
        ].join('\n');
        const oldHead = main.head.filter(l => !l.startsWith('#META '));
        // 第 94 轮修 bug：块拼接串是字符串，数组里不能再 `...` 展开（会把字符串逐字符拆成数组元素，
        //   写出的结果文件整片逐字符换行 = 全损）。第一次实际使用 merge 时暴露（此前只跑过 ONLY 未合并）。
        const out = [freshMeta, ...oldHead.filter(l => l.trim() !== ''), [...main.blocks.values()].join('\n'), 'ALL DONE'].join('\n') + '\n';
        fs.writeFileSync(mainPath, out);
        console.log(`✅ 已合并 ${n} 个增量块回 ${mainPath}（现有 ${main.blocks.size} 块）`);
        return;
    }

    // 解析 teeth-results.txt，套用判据输出牙口矩阵。
    if (argv.includes('--report')) {
        const rp = argv.find(a => a.startsWith('--results='));
        const resultsPath = rp ? rp.slice('--results='.length) : path.join(MUT_ROOT, 'teeth-results.txt');
        if (!fs.existsSync(resultsPath)) {
            console.log(`❌ 找不到结果文件 ${resultsPath} —— 请先跑 \`node tests/mutation-teeth.mjs --emit-run\` 输出的 Bash 脚本`);
            process.exit(1);
        }
        const txt = fs.readFileSync(resultsPath, 'utf8');
        // ===== V2.9.0 新鲜度守卫 =====
        // 旧结果 + 新判据 = 假结论（本轮实例：9-29 的结果配 10-02 的判据，屏幕上仍写着
        // 「T2 ❌装饰品(真盲区)」，而那根本不是当前代码跑出来的）。宁可硬失败，也不让陈旧结论冒充真值。
        const stale = checkFreshness(txt, resultsPath);
        if (stale.length) {
            console.log('❌❌ 结果文件已陈旧 —— 下述结论**不代表当前代码**，请勿据此下判断：');
            for (const s of stale) console.log('   · ' + s);
            if (!argv.includes('--allow-stale')) {
                console.log('\n处置：重跑 `node tests/mutation-teeth.mjs --emit-prep` / `--emit-run` 生成新结果；'
                    + '确需先看旧结论请加 `--allow-stale`（仍会打横幅）。');
                process.exit(1);
            }
            console.log('   （--allow-stale 已放行：以下为陈旧结果，仅供参考）\n');
        }
        const blocks = txt.split(/^##### MUT (\S+) #####$/m).slice(1); // [id, body, id, body, ...]
        const parsed = {};
        for (let i = 0; i < blocks.length; i += 2) {
            const id = blocks[i].trim();
            const body = blocks[i + 1] || '';
            parsed[id] = parseBlock(body);
        }
        const FP0 = parsed._base ? parsed._base.fp : null;
        // 干净树自检
        const b = parsed._base;
        let BASE_RED = [], BASE_DETAILS = [];
        if (b) {
            BASE_SIG = b.baselineSig ?? null;
            BASE_MISMATCH = (typeof b.statMismatch === 'number' ? b.statMismatch : 0);
            BASE_RED = b.red || []; BASE_DETAILS = b.details || [];
            // V2.9.14：干净树里已命中的契约 ⇒ 失去作证资格（对照器侧「不得作证」闸门）。
            BASE_DIRTY_CONTRACTS = Object.fromEntries(
                Object.entries(b.statByContract || {}).filter(([, v]) => v > 0));
            if (Object.keys(BASE_DIRTY_CONTRACTS).length) {
                console.log(`  ⚠ 干净树里已命中的契约 ${Object.keys(BASE_DIRTY_CONTRACTS).length} 条（${Object.keys(BASE_DIRTY_CONTRACTS).join('、')}）`);
                console.log('    按第 43 轮同一口径，它们失去作证资格 —— 其命中不计入「有牙」，改记 [对照器掩盖×N]。');
            }
            // V2.9.13：干净树里「转交中（⚠️）」的规则同样是**基线就已红**（fail>0，只是不计退码），
            //   按第 43 轮同一条道理，它们也失去作证资格 —— 否则变异改了战斗轨迹，顺带让 164 多报几条
            //   就会被误判成「规则有牙」。与 BASE_RED 合并后，其新明细改记 masked（[掩盖×N]）显式呈现。
            const baseWarn = (b.warn || []).filter(w => !BASE_RED.includes(w));
            if (baseWarn.length) {
                console.log(`  ⚠ 干净树里「转交中」的规则 ${baseWarn.length} 条（${baseWarn.join('、')}）—— fail>0 但已登记转交、不计退码；`);
                console.log('    按「基线已红不得作证」同一口径，一并列入失去作证资格集合（其新明细仍记 [掩盖×N] 显式呈现）。');
                BASE_RED = [...BASE_RED, ...baseWarn];
            }
            console.log(`[对照·未变异 _base] 规则报红 ${b.red.length} 条（明细 ${BASE_DETAILS.length} 条）· 基线 ${b.match === 18 ? 'MATCH 18' : (b.changed ? '已变' : '?')} · 对照器命中 ${b.statTotal} · 偏差 ${BASE_MISMATCH} · 指纹 ${b.fp}`);
            if (b.red.length || b.statTotal > 0 || b.changed || !b.fp) {
                // 第 43 轮：不再一票否决。干净树有红时改走「增量判定」—— 用 _base 的红/明细做底噪扣除，
                // 结论仍可用（且能顺带证明这条红是**既有 bug**而非变异引入），只是必须显式标注。
                console.log('  ⚠ 干净树本身就有红/不绿 —— 已切换为「增量判定」：只认 _base 里没有的新规则/新明细');
                console.log('    （这些红是既有问题的实证，须同步提主代码需求；不要把它算成某条变异的功劳）');
                if (b.changed) {
                    console.log('    · baseline 段同样改增量判定（第 58 轮）：干净树已报红线 ⇒ 任何变异的「基线兜底」都不再作数，');
                    console.log('      只有相对本树的 baseline 输出发生变化才算「基线真兜住了」。');
                }
                if (BASE_RED.length) {
                    console.log(`    ✗ 基线已红的规则（本轮**失去作证资格**，它们的明细变化一律不计入「有牙」）：`);
                    for (const r of BASE_RED) console.log(`        - ${r}`);
                    console.log('      → 修好这些既有问题后，这些规则才能重新为「规则有牙」作证；在那之前本档判定整体降级。');
                }
                console.log('');
            }
        } else {
            console.log('⚠ 缺少 _base 基准块，无法判定指纹是否变化（fpChanged 全部按「未知」处理）\n');
        }
        const rows = [];
        for (const m of MUTATIONS) {
            const p = parsed['m-' + m.id];
            if (!p) { console.log(`⏭ 缺 ${m.id} 结果`); continue; }
            const R = { red: p.red, details: p.details || [], pairs: p.pairs || [], crash: p.crash };
            const B = { match: p.match, changed: p.changed, baseSig: p.baselineSig };
            const S = { total: p.statTotal, statMismatch: p.statMismatch, statByContract: p.statByContract };
            const stf = { fp: p.fp };
            const j = judge(m, FP0, R, B, S, stf, BASE_RED, BASE_DETAILS, BASE_DIRTY_CONTRACTS);
            // V2.9.0：实证「变异到底注进树里没有」。锚点失效时（主代码改写了 from 串）sed 替换 0 处，
            //   树 = 干净树，跑出来的一切都是「没变化」——而 judge 对 TEXT 无条件判 effective，
            //   于是「没注入」被渲染成「规则没牙 / 装饰品(真盲区)」，是最坏的假结论（T2 挂了好几轮就是这么来的）。
            const inj = checkInjected(m);
            if (!inj.ok) {
                rows.push({ mut: m, red: p.red, verdict: '⚠锚点失效·结论作废', effective: false,
                    baselineChanged: j.baselineChanged, fpChanged: j.fpChanged, newDetail: [], newRed: [], masked: [],
                    why: inj.why });
                continue;
            }
            rows.push({ mut: m, red: p.red, ...j });
        }
        // V2.9.12：--matrix-out=<path> 把同一份结论写成 Markdown 落盘（stdout 之外的新出口，判定逻辑不变）。
        const mo = argv.find(a => a.startsWith('--matrix-out='));
        const outPath = mo ? mo.slice('--matrix-out='.length) : null;
        const metaLines = txt.split('\n').filter(l => l.startsWith('#META'));
        summarize(rows, outPath, metaLines, stale.length);
        return;
    }

    // 默认：打印三步工作流
    console.log('变异牙齿测试 · 三步工作流（本环境 node 不能 spawn，故跑树交给 Bash 工具）：');
    // 第 43 轮：脚本落点改到 tests/.mut/（已 gitignore）—— 放仓库根会变成未跟踪文件污染 git status。
    //   另：prep 是**零删除的覆盖式重建**（无 rm -rf），可反复重跑，不必手工清树。
    console.log('  1) node tests/mutation-teeth.mjs --emit-prep  > tests/.mut/prep.sh  &&  bash tests/.mut/prep.sh');
    console.log('  2) node tests/mutation-teeth.mjs --emit-run   > tests/.mut/run.sh   &&  bash tests/.mut/run.sh');
    console.log('  3) node tests/mutation-teeth.mjs --report');
    console.log('（全程约 2~3 分钟；21 棵树 × 三件套）');
    console.log('（--emit-prep 生成基树+变异；--emit-run 产出 Bash 循环脚本跑三件套落盘；--report 解析出牙口矩阵）');
}

// 解析单个变异块（REPLAY/BASELINE/STAT/FP 四段）—— 逐行切分，稳健。
function parseBlock(body) {
    const secs = { REPLAY: [], BASELINE: [], STAT: [], FP: [] };
    let cur = null;
    for (const line of body.split('\n')) {
        const h = line.match(/^(REPLAY|BASELINE|STAT|FP):$/);
        if (h) { cur = h[1]; continue; }
        if (cur) secs[cur].push(line);
    }
    const replay = secs.REPLAY.join('\n'), baseline = secs.BASELINE.join('\n'), stat = secs.STAT.join('\n'), fp = secs.FP.join('\n');
    const red = [];
    // 报红明细（第 43 轮新增）：形如 `      [seed=6 stage=1] 复发：…`
    //   与 red（规则名）配套 —— 规则名相同但报红场次/文案不同，说明是**本次变异新引入**的红。
    //   pairs 保留「明细 ↔ 所属规则」的归属关系：判定有牙时必须知道这条明细是哪条规则报的，
    //   否则一条在基线就已报红的规则（如 153 实测的主代码真 bug）会用自己的明细给任意变异"作伪证"。
    const details = [];
    const pairs = [];
    // V2.9.13：转交中（⚠️，fail>0 但已登记转交、不计退码）规则的报红明细**同样存在**，此前被整段丢弃。
    const warn = [];
    let curRule = null;
    for (const line of replay.split('\n')) {
        const m = line.match(/^❌\s+(.+?)\s+pass=\d+\s+fail=\d+\s+skip=\d+/);
        if (m) { curRule = m[1].trim(); red.push(curRule); continue; }
        // ⚠️ 行：只设 curRule（让后续明细有归属）+ 记入 warn，**不进 red**（转交态不是新红，不作证）。
        const wm = line.match(/^⚠️\s+(.+?)\s+pass=\d+\s+fail=\d+\s+skip=\d+/);
        if (wm) { curRule = wm[1].trim(); warn.push(curRule); continue; }
        const dm = line.match(/^\s+\[seed=\d+\s+stage=\d+\]\s+(.+)$/);
        if (dm) {
            details.push(dm[1].trim());
            if (curRule) pairs.push({ rule: curRule, detail: dm[1].trim() });
        }
    }
    const crash = /不变量违规/.test(replay) && !/RESULT:/.test(replay) ? (replay.split('\n').filter(Boolean).slice(-2).join(' | ') || 'no RESULT') : null;
    const matchM = baseline.match(/BASELINE-MATCH\s+(\d+)/);
    const match = matchM ? Number(matchM[1]) : null;
    // ★ 第 58 轮：baseline 段也改「增量判定」—— 指纹化整段文本，供 report 与 _base 逐字比。
    //   起因（第 4 次栽在 harness）：`changed` 原是「与**录制基线**比」，但主代码进行中的 dotTick 改动
    //   让**干净树自己**就报 3 场 winner 翻转红线 ⇒ 干净树 changed=true ⇒ 任何变异的 changed 恒为 true
    //   ⇒ 全部被判成「至少仅基线兜底」，把「变异根本没生效（no-op）」和「基线真的变了」混为一谈。
    //   A8/A19/A13 就是这么被误报的：baseline 输出与 _base **逐字节相同**，变异压根没生效。
    //   正确口径：baseline 是否**相对 _base 干净树**发生变化 —— 没变 ⇒ 变异无效，不构成任何兜底证据。
    const baselineSig = baseline.split('\n').map(s => s.trim()).filter(Boolean).sort().join('\n');
    const changed = !!baseline.match(/回归|场与基线不一致/) || (match !== null && match < 18);
    let statTotal = 0;
    // V2.9.0：对照器「偏差」方向（声明 > 实际 ⇒ 少加 / 多报）的**总条数**。
    //   行形如 `BREAK_DEF    声明  610 条 · 命中 0 · 歧义跳过 8 · 严格比对  539 条 / 偏差 2`。
    //   与 statTotal（重复应用）互补：超应用抓 statTotal，少加/多报抓 statMismatch。
    //   ⚠️ 只看**相对 _base 的增量**（干净树本身就有 2 条 BREAK_DEF 跨子步偏差），绝对值无分辨力。
    let statMismatch = 0;
    // V2.9.14：逐契约归属。STAT 段每行形如
    //   `LEECH_MAXHP  声明  185 条 · 命中 199 · 歧义跳过 0 · 严格比对  185 条 / 偏差 0`
    //   此前只取汇总数、丢弃归属 ⇒ 「对照器兜住」不显示是谁兜的，无从审计。
    //   只收 命中>0 的契约（0 命中的契约不构成证据，收进来只会稀释归属）。
    const statByContract = {};
    for (const line of stat.split('\n')) {
        // stat-decl 汇总行：命中时 `✗ 检出重复应用 N 处`（N>0）；干净树为 `✅ 全部数值声明…（无重复应用）`（无此行）。
        // ⚠️ 旧正则 `重复应用命中\s+(\d+)` 与 stat-decl 实际文案「检出重复应用 N 处」不匹配，导致严格命中的契约
        //   （如 A20/A21/A22）在 harness 里被错算成 0、误判为「仅基线兜底」—— 此 bug 会让「有牙」结论失真，故改之。
        const m = line.match(/检出重复应用\s+(\d+)\s+处/);
        if (m) statTotal += Number(m[1]);
        // ⚠️ 别在「声明」后加 ：JS 的  只在 \w([A-Za-z0-9_]) 边界成立，中文两侧恒无边界
        //   ⇒ `声明` 永远匹配不上 ⇒ 偏差恒 0（首版就栽这：_base 明明 BREAK_DEF 偏差 2 却显示 0）。
        const mm = line.match(/^([A-Z][A-Z_0-9]*)\s+声明.*?偏差\s+(\d+)/);
        if (mm) statMismatch += Number(mm[2]);
        // V2.9.14：逐契约「命中」列（重复应用命中数）。注意与上面的「偏差」列是同一行的两个不同字段，
        //   正则必须锚到 `声明\s+(\d+)\s+条\s+·\s+命中\s+(\d+)`，不能只写 `命中\s+(\d+)`——
        //   汇总行「检出重复应用 199 处」里没有「命中」二字，但「歧义跳过」行等其他文案可能撞车。
        const mc = line.match(/^([A-Z][A-Z_0-9]*)\s+声明\s+\d+\s+条\s+·\s+命中\s+(\d+)/);
        if (mc) {
            const n = Number(mc[2]);
            if (n > 0) statByContract[mc[1]] = (statByContract[mc[1]] || 0) + n;
        }
    }
    const fpM = fp.match(/FINGERPRINT\s+([0-9a-f]+)/);
    return { red, warn, details, pairs, crash, match, changed, baselineSig, statTotal, statMismatch, statByContract, fp: fpM ? fpM[1] : null };
}

function summarize(rows, outPath, metaLines, staleCount) {
    // V2.9.12：md 与 stdout 同步产出 —— 控制台照旧给人看，md 落盘给下一轮/白天会话看。
    const md = [];
    console.log('\n=== 牙口矩阵 ===');
    console.log('ID   类型   判定                     报红规则');
    md.push('| ID | 类型 | 判定 | 报红规则 | 变异描述 |');
    md.push('|---|---|---|---|---|');
    for (const r of rows) {
        const red = (r.red || []).length ? r.red.map(s => s.replace('(回归)', '')).join('、') : '—';
        // [掩盖×N]：该变异让「基线已红的规则」冒出了 N 条新明细 —— 属噪声，**不可**当成有牙的证据
        const mk = (r.masked || []).length ? ` [掩盖×${(r.masked || []).length}]` : '';
        // V2.9.14：对照器侧被「已命中契约」吃掉的部分（同规则侧 [掩盖×N]，只提示、不作证据）
        const cmk = r.statMasked > 0 ? ` [对照器掩盖×${r.statMasked}]` : '';
        console.log(`${r.mut.id.padEnd(5)} ${r.mut.kind.padEnd(6)} ${(r.verdict || '').padEnd(30)} ${red}${mk}${cmk}`);
        md.push(`| ${r.mut.id} | ${r.mut.kind} | ${r.verdict || ''} | ${red}${mk}${cmk} | ${r.mut.desc} |`);
    }
    const has = (r, k) => r.verdict && r.verdict.indexOf(k) >= 0;
    const blind = rows.filter(r => has(r, '装饰品'));
    const contractor = rows.filter(r => has(r, '对照器兜住'));
    const baselineOnly = rows.filter(r => has(r, '仅基线兜底'));
    const confirmed = rows.filter(r => has(r, '待确认盲区'));
    const noEffect = rows.filter(r => has(r, '未观测到影响'));
    // V2.9.0：锚点失效的树 = 干净树，它的一切结论都作废，**且不许混进真盲区**（否则又会造出 T2 那种假盲区）。
    const deadAnchor = rows.filter(r => has(r, '锚点失效'));
    if (deadAnchor.length) {
        console.log(`\n⚠⚠ 锚点失效·结论作废 ${deadAnchor.length} 处 —— 树=干净树，跑的不是变异（**必须修锚点后重跑**，不可据此判"没牙"）：`);
        md.push(`\n### ⚠⚠ 锚点失效·结论作废 ${deadAnchor.length} 处`);
        md.push('树=干净树，跑的不是变异，**必须修锚点后重跑**，不可据此判「没牙」。');
        for (const r of deadAnchor) {
            console.log(`   · ${r.mut.id} ${r.mut.desc} —— ${r.why || ''}`);
            md.push(`- ${r.mut.id} ${r.mut.desc} —— ${r.why || ''}`);
        }
    }
    // 第 57 轮：TEXT 类有牙单列一段（fact 文本被对照器抓到，与 ATTR 的"规则无牙·对照器兜住"是两回事：
    //   ATTR 是规则本该管但让给了对照器；TEXT 是专测 fact 文本，对照器抓到就是真有牙）。
    const textHasTeeth = rows.filter(r => has(r, '对照器有牙'));
    if (textHasTeeth.length) {
        console.log(`\n🔵 fact 文本有牙（对照器命中）${textHasTeeth.length} 处 —— TEXT 类变异被stat-decl 对照器抓住了：`);
        md.push(`\n### 🔵 fact 文本有牙（对照器命中）${textHasTeeth.length} 处`);
        md.push('TEXT 类变异被 stat-decl 对照器抓住 —— 与 ATTR「规则无牙·对照器兜住」不同，TEXT 专测 fact 文本，抓到就是真有牙。');
        for (const r of textHasTeeth) {
            console.log(`   · ${r.mut.id} ${r.mut.desc}`);
            md.push(`- ${r.mut.id} ${r.mut.desc}`);
        }
    }
    if (blind.length) {
        console.log(`\n❌ 真盲区（装饰品）${blind.length} 处 —— TEXT 类变异已生效，但规则侧+对照器侧+基线侧都没反应：`);
        md.push(`\n### ❌ 真盲区（装饰品）${blind.length} 处`);
        md.push('**= 立待办上报的对象**：变异已生效，规则侧 + 对照器侧 + 基线侧全无反应，规则形同装饰品。');
        for (const r of blind) {
            console.log(`   · ${r.mut.id} ${r.mut.desc}`);
            md.push(`- ${r.mut.id} ${r.mut.desc}`);
        }
    }
    if (contractor.length) {
        console.log(`\n🟢 规则无牙·对照器兜住 ${contractor.length} 处 —— 规则抓不到，但 stat-decl 对照器（BREAK_DEF/CARRY_APPLY 契约）抓住了：`);
        md.push(`\n### 🟢 规则无牙·对照器兜住 ${contractor.length} 处`);
        md.push('规则抓不到，但 stat-decl 对照器（BREAK_DEF / CARRY_APPLY 契约）抓住 —— 属已知分工，不算盲区。');
        for (const r of contractor) {
            console.log(`   · ${r.mut.id} ${r.mut.desc}`);
            md.push(`- ${r.mut.id} ${r.mut.desc}`);
        }
    }
    if (baselineOnly.length) {
        console.log(`\n🟡 规则无牙·仅基线兜底 ${baselineOnly.length} 处 —— 规则+对照器都抓不到，只有 140-baseline 回归闸门（18 场种子）能兜底：`);
        md.push(`\n### 🟡 规则无牙·仅基线兜底 ${baselineOnly.length} 处`);
        md.push('规则 + 对照器都抓不到，只有 140-baseline 回归闸门（18 场种子）能兜底 —— 兜底面窄，属待加强。');
        for (const r of baselineOnly) {
            console.log(`   · ${r.mut.id} ${r.mut.desc}`);
            md.push(`- ${r.mut.id} ${r.mut.desc}`);
        }
    }
    if (confirmed.length) {
        console.log(`\n🔴 完全无反应（待确认盲区）${confirmed.length} 处 —— 属性变了，但规则+对照器+基线全无反应（无论 18 场种子还是指纹都没动）：`);
        md.push(`\n### 🔴 完全无反应（待确认盲区）${confirmed.length} 处`);
        md.push('属性变了，规则 + 对照器 + 基线全无反应 —— **= 立待办上报的对象**（与「装饰品」同列最高优先）。');
        for (const r of confirmed) {
            console.log(`   · ${r.mut.id} ${r.mut.desc}`);
            md.push(`- ${r.mut.id} ${r.mut.desc}`);
        }
    }
    if (noEffect.length) {
        console.log(`\n⚪ 未观测到影响 ${noEffect.length} 处 —— 变异未改变 18 场种子的战斗状态（指纹≡基线），可能是该机制在此 18 场未被触发，属测试覆盖缺口：`);
        md.push(`\n### ⚪ 未观测到影响 ${noEffect.length} 处`);
        md.push('变异未改变 18 场种子的战斗状态（指纹 ≡ 基线）—— 该机制在此 18 场未被触发，属**样本覆盖缺口**，不等于没牙也不等于有牙。');
        for (const r of noEffect) {
            console.log(`   · ${r.mut.id} ${r.mut.desc}`);
            md.push(`- ${r.mut.id} ${r.mut.desc}`);
        }
    }
    // V2.9.12 落盘：头部带判据版本 / 结果 META / 覆盖条数，保证「这份矩阵是哪次跑出来的」可回溯。
    if (outPath) {
        const head = [
            '# 牙口矩阵（变异牙齿测试 · 结论快照）',
            '',
            `> 生成：${new Date().toISOString()} · 判据版本 ${VER}`,
            `> 结果文件：tests/.mut/teeth-results.txt（新鲜度守卫：${staleCount === 0 ? '通过' : '⚠ 陈旧 ' + staleCount + ' 项，结论不代表当前代码'}）`,
            ...(metaLines || []).map(l => '> ' + l),
            '',
            `覆盖 **${rows.length}** 颗牙（A1–A28 / T1–T18）。口径见 \`tests/mutation-teeth.mjs\` 头部方法论；`,
            '判定共七类：锚点失效 / fact 文本有牙 / 真盲区(装饰品) / 对照器兜住 / 仅基线兜底 / 待确认盲区 / 未观测到影响。',
            '',
            '## 全集矩阵',
            '',
        ];
        fs.writeFileSync(outPath, head.join('\n') + md.join('\n') + '\n', 'utf8');
        console.log(`\n💾 牙口矩阵已落盘：${outPath}（${rows.length} 行）`);
    }
}

main().catch(e => { console.error('runner 异常：', e); process.exit(1); });
