// V2.7.0 | 2026-10-02 第 57 轮：修 judge 判定顺序缺陷 —— `kind==='TEXT'` 的「装饰品」判定排在 `S.total>0` 之前，
//   使 TEXT 类变异无条件判装饰品、完全无视对照器实际命中。实测反例：T7 对照器命中 223 处、T2 命中 1308 处，
//   两者都被误报成「装饰品(真盲区)」。改为与 ATTR 同序（规则 → 对照器 → 装饰品），并新增「fact 文本有牙」分类段落。
//   修后真盲区 2 处 → 0 处（两个 TEXT 盲区都是假盲区，契约本来就有牙）。
// V2.6.0 | 2026-10-02 第 55 轮：git archive 基树排除 .dsh/.trae（AI CLI 的 skill 目录被 git 跟踪，会随基树复制进每棵变异树，32 棵 × 4 文件纯白占空间）。
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
export const VER = 'tests/mutation-teeth.mjs V2.7.0';

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
// 临时树放仓库内，跑完由本 runner（--emit-prep 不删；--single 也不删；由 Bash 手动 rm）或 .gitignore 排除。
const MUT_ROOT = process.env.MUT_ROOT || path.join(REPO, 'tests', '.mut');

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
    { id: 'A4', kind: 'ATTR', desc: '张无忌近战切换加攻翻倍',
      file: 'core/13battle-shared.js',
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
      file: 'modules/26elite-sixsects.js',
      from: "{ source: '苦练', value: atkDelta,",
      to:   "{ source: '苦练', value: atkDelta * 2," },
    { id: 'A7', kind: 'ATTR', desc: '生生不息转防翻倍',
      file: 'modules/26elite-sixsects.js',
      from: "{ source: '生生不息', value: defGain,",
      to:   "{ source: '生生不息', value: defGain * 2," },
    { id: 'A8', kind: 'ATTR', desc: '蝶变附身攻击转移翻倍',
      file: 'modules/27elite-mingjiao.js',
      from: "{ source: '蝶变附身', value: atkTransfer,",
      to:   "{ source: '蝶变附身', value: atkTransfer * 2," },
    { id: 'A9', kind: 'ATTR', desc: '八卦阵防御增益翻倍',
      file: 'modules/26elite-sixsects.js',
      from: "{ source: '八卦阵', value: ba.defGain,",
      to:   "{ source: '八卦阵', value: ba.defGain * 2," },
    { id: 'A10', kind: 'ATTR', desc: '莽撞每次挨打加攻翻倍（主目标+溅射两处都改）',
      file: 'modules/26elite-sixsects.js',
      from: "{ source: '莽撞', value: rage.atkPerHit, ttl: 'permanent', group: 'rageOnHit', op: 'add' });",
      to:   "{ source: '莽撞', value: rage.atkPerHit * 2, ttl: 'permanent', group: 'rageOnHit', op: 'add' });",
      multi: true },
    { id: 'A11', kind: 'ATTR', desc: '韦一笑吸血上限提升翻倍',
      file: 'core/12battle-attack-steps.js',
      from: "{ source: '韦一笑吸血', value: delta,",
      to:   "{ source: '韦一笑吸血', value: delta * 2," },
    { id: 'A12', kind: 'ATTR', desc: '性奋代价翻倍（多扣上限）',
      file: 'modules/26elite-sixsects.js',
      from: "{ source: '性奋代价', value: -penalty,",
      to:   "{ source: '性奋代价', value: -penalty * 2," },
    // 第 44 轮改锚点：原为写死的 `value: 3`，主代码把三项收敛成 `carryMods.atk/def/maxHp` 后写法变了。
    //   （A13 仍属结构性稀有条件 —— 需 bro 拿到永久 carry 海克斯且队伍无 carry buff，历史上 560 场零触发）
    { id: 'A13', kind: 'ATTR', desc: '小昭·妹永久carry 加攻 ×10',
      file: 'modules/27elite-mingjiao.js',
      from: "{ source: '小昭·妹永久carry', value: carryMods.atk,",
      to:   "{ source: '小昭·妹永久carry', value: carryMods.atk * 10," },
    { id: 'A14', kind: 'ATTR', desc: '雄狮振奋加攻翻倍',
      file: 'modules/27elite-mingjiao.js',
      from: "{ source: '振奋', value: gain,",
      to:   "{ source: '振奋', value: gain * 2," },
    // 2026-10-02 审核线修锚点：modules/27 V6.4.4 成长差值先落变量（L704 defDelta），旧内联串 0 匹配、变异静默失效。
    //   新锚点只改 addMod 实际侧（L707）；不能改 L704 的 defDelta——L717 fact 同源引用它，改了声明/实际一起翻、对照器看不出。
    { id: 'A15', kind: 'ATTR', desc: '幼狮成长防御增量翻倍',
      file: 'modules/27elite-mingjiao.js',
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
      file: 'modules/26elite-sixsects.js',
      from: "{ source: '苦练', value: atkDelta,",
      to:   "{ source: '苦练', value: atkDelta + 1," },
    { id: 'A19', kind: 'ATTR', desc: '蝶变附身攻击加成完全失效（改 0，旧判据必漏）',
      file: 'modules/27elite-mingjiao.js',
      from: "{ source: '蝶变附身', value: atkTransfer,",
      to:   "{ source: '蝶变附身', value: 0," },
    { id: 'T1', kind: 'TEXT', desc: '破防日志写 -（reduce+5）（实际仍只扣 reduce）',
      file: 'core/16effect-handlers.js',
      from: "targetName: target.name, reduce }",
      to:   "targetName: target.name, reduce: reduce + 5 }" },
    { id: 'T2', kind: 'TEXT', desc: '坚盾日志 increment 多写 5（实际未变）',
      file: 'core/03battle-utils.js',
      from: "data: { unitName: unit.name, label, increment, current: fortifyThisRound + increment, cap }",
      to:   "data: { unitName: unit.name, label, increment: increment + 5, current: fortifyThisRound + increment, cap }" },
    // --- 第 43 轮新增：专测「fact 已发、数值写错」—— 检验规则侧（而非对照器）对这些 fact 有没有牙 ---
    //   背景：主代码 V6.0.3 补发了 METEOR_SPLASH_GROWTH（此前枚举/渲染/翻译链接好却零 emit）。
    //   补发之后，真正的风险变成「fact 发了但没人校验它的数值」—— 只有 TEXT 变异能证伪这件事：
    //   把 fact 里声明的数值改错（实际属性不动），规则若报红⇒有牙；不报⇒这条 fact 是纯装饰。
    { id: 'T3', kind: 'TEXT', desc: '流星溅射成长 fact 的 growth 多写 5（实际未变）',
      file: 'core/16effect-handlers.js',
      from: "data: { unitName: ctx.unit.name, growth } }",
      to:   "data: { unitName: ctx.unit.name, growth: growth + 5 } }" },
    { id: 'T4', kind: 'TEXT', desc: '生生不息 fact 的 atkGain 多写 5（实际未变）',
      file: 'modules/26elite-sixsects.js',
      from: "atkGain: selfAtkGain,",
      to:   "atkGain: selfAtkGain + 5," },
    { id: 'T5', kind: 'TEXT', desc: '性奋代价 fact 的 penalty 多写 5（实际未变）',
      file: 'modules/26elite-sixsects.js',
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
      file: 'modules/26elite-sixsects.js',
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
      file: 'modules/26elite-sixsects.js',
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
      from: "        addMod(unit, 'atk', { source: '圣火令', value: CONFIG.BUFFS.holyFlame.atkBonus, ttl: 'round', op: 'mul', group: 'holyFlame' });",
      to:   "        addMod(unit, 'atk', { source: '圣火令', value: CONFIG.BUFFS.holyFlame.atkBonus * 2, ttl: 'round', op: 'mul', group: 'holyFlame' });" },
];

function toPosix(p) {
    return p.replace(/^([A-Za-z]):/, (m, d) => '/' + d.toLowerCase()).replace(/\\/g, '/');
}

// BRE 转义：sed 基本正则里这些字符需反斜杠转义才能按字面匹配。
// 注意 `(` `)` `{` `}` 在 BRE 里本就是字面量，不要转义；只转 `. * ^ $ [ ] \`。
// 早期用 \Q...\E（Perl/PCRE 语法）在 GNU sed 下完全不生效，导致变异静默未注入（树木=干净树）。
function breEscape(s) {
    return s.replace(/[.*^$[\]\\]/g, m => '\\' + m);
}

// 解析：见下方 parseBlock（逐行切分 REPLAY/BASELINE/STAT/FP 四段）。

// 本环境约束：node 内 spawn 子进程（bash / node）一律被 broker 静默禁用，且同一进程顺序 import 多份「末尾 process.exit 的引擎脚本」会挂起/收集为空。
// 故牙齿测试的执行一律交给 Bash 工具：--emit-run 产出 Bash 循环脚本，每条变异由独立 node 进程跑三件套并落盘；
// --report 再解析落盘结果套用判据。工具本身不 spawn、不 import 业务脚本。

// ★ 第 43 轮判据升级：**以 _base 为对照做「增量」判定，而不是看绝对红数**。
//   起因：干净树可能本就有红（153 实测主代码「⚡ undefined / 重复渲染」是真 bug，120 场 fail=7）。
//   此时「这条变异有没有报红」毫无意义 —— 基线本来就红，红与不红都一样。
//   必须比对**报红明细文本**：同一条规则若因本次变异报出了基线里没有的新文案/新场次，才算真有牙。
function judge(mut, FP0, R, B, S, stf, baseRed, baseDetails) {
    const baselineChanged = B.changed || (B.match !== null && B.match < 18);
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
    const effective = mut.kind === 'TEXT' || newDetail.length > 0 || newRed.length > 0
        || baselineChanged || fpChanged || S.total > 0;
    if (R.crash) return { verdict: '回放器异常', effective, baselineChanged, fpChanged, newDetail, newRed, masked };
    if (!effective) return { verdict: '未观测到影响', effective, baselineChanged, fpChanged, newDetail, newRed, masked };
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
        if (S.total > 0) {
            const via = `(+对照器命中 ${S.total})`;
            if (baselineChanged) return { verdict: '规则无牙·对照器兜底' + via, effective, baselineChanged, fpChanged, newDetail, newRed, masked };
            return { verdict: '对照器有牙' + via, effective, baselineChanged, fpChanged, newDetail, newRed, masked };
        }
        if (baselineChanged) return { verdict: '❌装饰品(仅基线能察觉)', effective, baselineChanged, fpChanged, newDetail, newRed, masked };
        return { verdict: '❌装饰品(真盲区)', effective, baselineChanged, fpChanged, newDetail, newRed, masked };
    }
    if (S.total > 0) return { verdict: '规则无牙·对照器兜住', effective, baselineChanged, fpChanged, newDetail, newRed };
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
        for (const m of MUTATIONS) {
            // `cp -r src/. dst/` 复制**内容**到已存在的目录（直接覆盖），等价于重建且不需要先删 ——
            // 这一句同时保证了「重复 prep 时变异不会叠加两次」：先把干净的 _base 内容盖回去，再 sed 注入。
            lines.push(`mkdir -p "$MUTROOT/m-${m.id}"`);
            lines.push(`cp -r "$MUTROOT/_base/." "$MUTROOT/m-${m.id}/"`);
            lines.push(`sed -i "s#${breEscape(m.from)}#${m.to}#g" "$MUTROOT/m-${m.id}/${m.file}"`);
        }
        console.log(lines.join('\n'));
        return;
    }

    // 产出「Bash 循环运行脚本」：每条变异（含 _base 基准）由独立 node 进程跑三件套并落盘到 teeth-results.txt。
    // 本工具不 spawn / 不 import 业务脚本 —— 本环境两者都被 broker 禁用。
    if (argv.includes('--emit-run')) {
        const ids = ['_base', ...MUTATIONS.map(m => m.id)];
        const lines = [
            '#!/usr/bin/env bash', 'set -e',
            `MUTROOT="${toPosix(MUT_ROOT)}"`,
            'OUT="$MUTROOT/teeth-results.txt"',
            ': > "$OUT"',
            'for id in ' + ids.map(i => i === '_base' ? '_base' : 'm-' + i).join(' ') + '; do',
            '  d="$MUTROOT/$id"',
            '  [ -d "$d" ] || { echo "跳过缺失树 $d"; continue; }',
            '  echo "##### MUT $id #####" >> "$OUT"',
            '  echo "REPLAY:" >> "$OUT"',
            // 第 43 轮：grep 追加 `^\s+\[seed=` —— 把规则报红的**逐场明细行**一起落盘。
            //   原因：干净树可能本就有红（如 153 实测的「⚡ undefined」真 bug），此时只看「哪条规则红」
            //   完全没有分辨力（基线红会把变异红掩盖掉）。改为比对**明细文本**才能分辨
            //   「同一条规则是否因本次变异报出了新的红」。
            '  ( cd "$d" && node tests/rules-replay.mjs 2>/dev/null | grep -E "RESULT:|❌|^\\s+\\[seed=" ) >> "$OUT" || true',
            '  echo "BASELINE:" >> "$OUT"',
            '  ( cd "$d" && node tests/140-baseline.js --check 2>/dev/null | grep -E "BASELINE-MATCH|回归|场与基线不一致|DIFF" ) >> "$OUT" || true',
            '  echo "STAT:" >> "$OUT"',
            '  ( cd "$d" && node tests/stat-decl-vs-actual-check.mjs 2>/dev/null | grep -E "重复应用命中|命中明细|✅|✗" ) >> "$OUT" || true',
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

    // 解析 teeth-results.txt，套用判据输出牙口矩阵。
    if (argv.includes('--report')) {
        const rp = argv.find(a => a.startsWith('--results='));
        const resultsPath = rp ? rp.slice('--results='.length) : path.join(MUT_ROOT, 'teeth-results.txt');
        if (!fs.existsSync(resultsPath)) {
            console.log(`❌ 找不到结果文件 ${resultsPath} —— 请先跑 \`node tests/mutation-teeth.mjs --emit-run\` 输出的 Bash 脚本`);
            process.exit(1);
        }
        const txt = fs.readFileSync(resultsPath, 'utf8');
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
            BASE_RED = b.red || []; BASE_DETAILS = b.details || [];
            console.log(`[对照·未变异 _base] 规则报红 ${b.red.length} 条（明细 ${BASE_DETAILS.length} 条）· 基线 ${b.match === 18 ? 'MATCH 18' : (b.changed ? '已变' : '?')} · 对照器命中 ${b.statTotal} · 指纹 ${b.fp}`);
            if (b.red.length || b.statTotal > 0 || b.changed || !b.fp) {
                // 第 43 轮：不再一票否决。干净树有红时改走「增量判定」—— 用 _base 的红/明细做底噪扣除，
                // 结论仍可用（且能顺带证明这条红是**既有 bug**而非变异引入），只是必须显式标注。
                console.log('  ⚠ 干净树本身就有红/不绿 —— 已切换为「增量判定」：只认 _base 里没有的新规则/新明细');
                console.log('    （这些红是既有问题的实证，须同步提主代码需求；不要把它算成某条变异的功劳）');
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
            const B = { match: p.match, changed: p.changed };
            const S = { total: p.statTotal };
            const stf = { fp: p.fp };
            const j = judge(m, FP0, R, B, S, stf, BASE_RED, BASE_DETAILS);
            rows.push({ mut: m, red: p.red, ...j });
        }
        summarize(rows);
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
    let curRule = null;
    for (const line of replay.split('\n')) {
        const m = line.match(/^❌\s+(.+?)\s+pass=\d+\s+fail=\d+\s+skip=\d+/);
        if (m) { curRule = m[1].trim(); red.push(curRule); continue; }
        const dm = line.match(/^\s+\[seed=\d+\s+stage=\d+\]\s+(.+)$/);
        if (dm) {
            details.push(dm[1].trim());
            if (curRule) pairs.push({ rule: curRule, detail: dm[1].trim() });
        }
    }
    const crash = /不变量违规/.test(replay) && !/RESULT:/.test(replay) ? (replay.split('\n').filter(Boolean).slice(-2).join(' | ') || 'no RESULT') : null;
    const matchM = baseline.match(/BASELINE-MATCH\s+(\d+)/);
    const match = matchM ? Number(matchM[1]) : null;
    const changed = !!baseline.match(/回归|场与基线不一致/) || (match !== null && match < 18);
    let statTotal = 0;
    for (const line of stat.split('\n')) {
        // stat-decl 汇总行：命中时 `✗ 检出重复应用 N 处`（N>0）；干净树为 `✅ 全部数值声明…（无重复应用）`（无此行）。
        // ⚠️ 旧正则 `重复应用命中\s+(\d+)` 与 stat-decl 实际文案「检出重复应用 N 处」不匹配，导致严格命中的契约
        //   （如 A20/A21/A22）在 harness 里被错算成 0、误判为「仅基线兜底」—— 此 bug 会让「有牙」结论失真，故改之。
        const m = line.match(/检出重复应用\s+(\d+)\s+处/);
        if (m) statTotal += Number(m[1]);
    }
    const fpM = fp.match(/FINGERPRINT\s+([0-9a-f]+)/);
    return { red, details, pairs, crash, match, changed, statTotal, fp: fpM ? fpM[1] : null };
}

function summarize(rows) {
    console.log('\n=== 牙口矩阵 ===');
    console.log('ID   类型   判定                     报红规则');
    for (const r of rows) {
        const red = (r.red || []).length ? r.red.map(s => s.replace('(回归)', '')).join('、') : '—';
        // [掩盖×N]：该变异让「基线已红的规则」冒出了 N 条新明细 —— 属噪声，**不可**当成有牙的证据
        const mk = (r.masked || []).length ? ` [掩盖×${(r.masked || []).length}]` : '';
        console.log(`${r.mut.id.padEnd(5)} ${r.mut.kind.padEnd(6)} ${(r.verdict || '').padEnd(30)} ${red}${mk}`);
    }
    const has = (r, k) => r.verdict && r.verdict.indexOf(k) >= 0;
    const blind = rows.filter(r => has(r, '装饰品'));
    const contractor = rows.filter(r => has(r, '对照器兜住'));
    const baselineOnly = rows.filter(r => has(r, '仅基线兜底'));
    const confirmed = rows.filter(r => has(r, '待确认盲区'));
    const noEffect = rows.filter(r => has(r, '未观测到影响'));
    // 第 57 轮：TEXT 类有牙单列一段（fact 文本被对照器抓到，与 ATTR 的"规则无牙·对照器兜住"是两回事：
    //   ATTR 是规则本该管但让给了对照器；TEXT 是专测 fact 文本，对照器抓到就是真有牙）。
    const textHasTeeth = rows.filter(r => has(r, '对照器有牙'));
    if (textHasTeeth.length) {
        console.log(`\n🔵 fact 文本有牙（对照器命中）${textHasTeeth.length} 处 —— TEXT 类变异被stat-decl 对照器抓住了：`);
        for (const r of textHasTeeth) console.log(`   · ${r.mut.id} ${r.mut.desc}`);
    }
    if (blind.length) {
        console.log(`\n❌ 真盲区（装饰品）${blind.length} 处 —— TEXT 类变异已生效，但规则侧+对照器侧+基线侧都没反应：`);
        for (const r of blind) console.log(`   · ${r.mut.id} ${r.mut.desc}`);
    }
    if (contractor.length) {
        console.log(`\n🟢 规则无牙·对照器兜住 ${contractor.length} 处 —— 规则抓不到，但 stat-decl 对照器（BREAK_DEF/CARRY_APPLY 契约）抓住了：`);
        for (const r of contractor) console.log(`   · ${r.mut.id} ${r.mut.desc}`);
    }
    if (baselineOnly.length) {
        console.log(`\n🟡 规则无牙·仅基线兜底 ${baselineOnly.length} 处 —— 规则+对照器都抓不到，只有 140-baseline 回归闸门（18 场种子）能兜底：`);
        for (const r of baselineOnly) console.log(`   · ${r.mut.id} ${r.mut.desc}`);
    }
    if (confirmed.length) {
        console.log(`\n🔴 完全无反应（待确认盲区）${confirmed.length} 处 —— 属性变了，但规则+对照器+基线全无反应（无论 18 场种子还是指纹都没动）：`);
        for (const r of confirmed) console.log(`   · ${r.mut.id} ${r.mut.desc}`);
    }
    if (noEffect.length) {
        console.log(`\n⚪ 未观测到影响 ${noEffect.length} 处 —— 变异未改变 18 场种子的战斗状态（指纹≡基线），可能是该机制在此 18 场未被触发，属测试覆盖缺口：`);
        for (const r of noEffect) console.log(`   · ${r.mut.id} ${r.mut.desc}`);
    }
}

main().catch(e => { console.error('runner 异常：', e); process.exit(1); });
