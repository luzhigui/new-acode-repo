# 体检 · FACT_TYPES 覆盖矩阵（阶段二 fact 类型全覆盖）

> 生成：2026-10-11 · 只读静态分析，未改动任何文件。

## 总览

- **FACT_TYPES 总数**：87
- **有渲染器（infra/58 FACT_SPECS 注册）**：87 / 87 —— 全部注册 ⇒ `rules-replay.mjs` 的渲染器注册检查（L298-304）对**所有** factType 观测“发出但未注册渲染”类回归。
- **对照器数值契约覆盖**（数值真值网，阶段一闭环）：22 个 factType 携带“属性增减”载荷，均有契约盯着（显式枚举 12 + 形状锁定 12，去重后 22）。
- **无数值契约的渲染 fact**：65 个 —— 均为非数值的战报/事件类 fact。
  - 其中 **携带可量化数据**（治疗/伤害/击退等，扩展数值网候选）：24 个（原 28，剔除 4 个纯事件标志 CLAW_EXECUTE / XING_FEN_GRANT / XING_FEN_EXTRA_ATTACK / XING_FEN_RETRY——它们只带 `{unitName}` 等，无数值字段）
  - 其中 **纯事件/文案**（roundStart、pass、immune… 接受不补契约）：37 个

## 三维口径说明

1. **数值契约（对照器）**：fact 携带 atk/def/maxHp 增减量，且引擎有 `_mods` group 可隔离自身贡献 ⇒ 有契约。这是阶段一已闭环的网。
2. **回放规则（rules-replay）**：该文件对**每个** battle-log fact 做 `FACT_SPECS[f.factType]` + 渲染器注册校验（通用观测），不按 factType 枚举。故“有渲染器”即被它观测到注册合规。其**特定不变量规则**另针对个别 fact 数据。
3. **变异牙齿（mutation-teeth）**：以代码注入（from→to）方式制造已知缺陷，再由体检套件报红。多数牙齿按机制注入而非按 factType 字符串，故下方“牙齿提及”列仅作弱参考（源码中出现了该 factType 名/值）。

## 全集矩阵（KEY | VALUE | 渲染 | 数值契约 | 牙齿提及）

| KEY | VALUE | 渲染 | 数值契约 | 牙齿提及 |
|-----|-------|------|----------|----------|
| ATTACK | attack | ✅ | ✅ | ✅ | 🔢
| AURA_APPLY | auraApply | ✅ | ✅ | — | 🔢
| BAGUA_ARRAY | baguaArray | ✅ | ✅ | ✅ | 🔢
| BREAK_DEF | breakDef | ✅ | ✅ | ✅ | 🔢
| BUTTERFLY_ATTACH | butterflyAttach | ✅ | ✅ | — | 🔢
| CARRY_APPLY | carryApply | ✅ | ✅ | ✅ | 🔢
| DODGE | dodge | ✅ | ✅ | — | 🔢
| ENDLESS_BREATH | endlessBreath | ✅ | ✅ | — | 🔢
| FORTIFY_SHIELD | fortifyShield | ✅ | ✅ | — | 🔢
| HOLY_FLAME_APPLY | holyFlameApply | ✅ | ✅ | — | 🔢
| KU_LIAN | kuLian | ✅ | ✅ | ✅ | 🔢
| LION_GROW | lionGrow | ✅ | ✅ | ✅ | 🔢
| LION_INSPIRE | lionInspire | ✅ | ✅ | — | 🔢
| METEOR_SPLASH_GROWTH | meteorSplashGrowth | ✅ | ✅ | ✅ | 🔢
| RAGE_ON_HIT | rageOnHit | ✅ | ✅ | ✅ | 🔢
| RANGED_GROWTH | rangedGrowth | ✅ | ✅ | ✅ | 🔢
| SOUL_DRAIN_APPLY | soulDrainApply | ✅ | ✅ | ✅ | 🔢
| SPIDER_TRANSFORM | spiderTransform | ✅ | ✅ | ✅ | 🔢
| STAT_CHANGE_APPLY | statChangeApply | ✅ | ✅ | — | 🔢
| WEI_LEECH | weiLeech | ✅ | ✅ | ✅ | 🔢
| XING_FEN_COST | xingFenCost | ✅ | ✅ | ✅ | 🔢
| ZHANG_SWITCH | zhangSwitch | ✅ | ✅ | — | 🔢
| BLOOD_THIRST_LEECH | bloodthirstLeech | ✅ | — | — | 📊
| CLAW_EXECUTE | clawExecute | ✅ | — | — | 📊
| CLAW_HEAL | clawHeal | ✅ | — | — | 📊
| CLAW_HIT | clawHit | ✅ | — | — | 📊
| FLYER_REGEN | flyerRegen | ✅ | — | — | 📊
| FORTIFY_REBOUND | fortifyRebound | ✅ | — | — | 📊
| HORSE_DESTROY | horseDestroy | ✅ | — | — | 📊
| HORSE_REBOUND | horseRebound | ✅ | — | — | 📊
| HOT_BLOOD_HEAL | hotBloodHeal | ✅ | — | — | 📊
| KUAI_LE_HEAL | kuaiLeHeal | ✅ | — | — | 📊
| METEOR_SHOWER_SPLASH | meteorShowerSplash | ✅ | — | — | 📊
| MIND_CONTROL_SWAP | mindControlSwap | ✅ | — | — | 📊
| NINE_YANG_HEAL | nineYangHeal | ✅ | — | — | 📊
| PHANTOM_CONFUSE | phantomConfuse | ✅ | — | — | 📊
| PHANTOM_DISGUISE_HEAL | phantomDisguiseHeal | ✅ | — | — | 📊
| PUSH_STUN | pushStun | ✅ | — | — | 📊
| SPIDER_STRIKE | spiderStrike | ✅ | — | — | 📊
| WARRIOR_EXECUTE | warriorExecute | ✅ | — | — | 📊
| WEI_DODGE_LEECH | weiDodgeLeech | ✅ | — | — | 📊
| WIND_ASSAULT_PUSH | windAssaultPush | ✅ | — | — | 📊
| WIND_ASSAULT_SPLASH | windAssaultSplash | ✅ | — | — | 📊
| XING_FEN_EXTRA_ATTACK | xingFenExtraAttack | ✅ | — | — | 📊
| XING_FEN_GRANT | xingFenGrant | ✅ | — | — | 📊
| XING_FEN_RETRY | xingFenRetry | ✅ | — | — | 📊
| XUAN_MING_DOT | xuanmingDot | ✅ | — | — | 📊
| XUAN_MING_LINK_ATTACK | xuanmingLinkAttack | ✅ | — | — | 📊
| XUAN_MING_POISONED | xuanmingPoisoned | ✅ | — | — | 📊
| ZHANG_TAUNT | zhangTaunt | ✅ | — | — | 📊
| BUFF_SUMMARY | buffSummary | ✅ | — | — | 📝
| BUTTERFLY_HOST_DEAD | butterflyHostDead | ✅ | — | — | 📝
| BUTTERFLY_NO_HOST | butterflyNoHost | ✅ | — | — | 📝
| BUTTERFLY_RETURN | butterflyReturn | ✅ | — | — | 📝
| CLAW_NO_HEAL | clawNoHeal | ✅ | — | — | 📝
| DOUBLE_STRIKE | doubleStrike | ✅ | — | — | 📝
| DOUBLE_STRIKE_SUMMARY | doubleStrikeSummary | ✅ | — | — | 📝
| DROP | drop | ✅ | — | — | 📝
| EMPTY_TARGET | emptyTarget | ✅ | — | — | 📝
| FLY_SKIP | flySkip | ✅ | — | — | 📝
| HORSE_SUMMON | horseSummon | ✅ | — | — | 📝
| IMMUNE | immune | ✅ | — | — | 📝
| KU_LIAN_PRIORITY | kuLianPriority | ✅ | — | — | 📝
| METEOR_SHOWER_MAIN | meteorShowerMain | ✅ | — | — | 📝
| MIND_CONTROL_BANNER | mindControlBanner | ✅ | — | — | 📝
| MIND_CONTROL_FAIL | mindControlFail | ✅ | — | — | 📝
| MISS | miss | ✅ | — | ✅ | 📝
| NO_CONTEND | noContend | ✅ | — | — | 📝
| PASS | pass | ✅ | — | ✅ | 📝
| PHANTOM_REVEAL | phantomReveal | ✅ | — | — | 📝
| QIAN_KUN_BASIC | qianKunBasic | ✅ | — | — | 📝
| QIAN_KUN_DERIVED | qianKunDerived | ✅ | — | — | 📝
| QIAN_KUN_UPGRADED | qianKunUpgraded | ✅ | — | — | 📝
| RONG_HUI_BONUS | rongHuiBonus | ✅ | — | — | 📝
| ROUND_END | roundEnd | ✅ | — | — | 📝
| ROUND_START | roundStart | ✅ | — | — | 📝
| SKILL_ANNOUNCE | skillAnnounce | ✅ | — | — | 📝
| SPIDER_DEAD_TARGET | spiderDeadTarget | ✅ | — | — | 📝
| SPIDER_DOUBLE_STRIKE | spiderDoubleStrike | ✅ | — | — | 📝
| SPIDER_FLY | spiderFly | ✅ | — | — | 📝
| SPIDER_RETURN | spiderReturn | ✅ | — | — | 📝
| STUN_SKIP | stunSkip | ✅ | — | — | 📝
| SUMMON_UNIT | summonUnit | ✅ | — | — | 📝
| WIND_ASSAULT_FAIL | windAssaultFail | ✅ | — | — | 📝
| XIAO_ZHAO_HORSE | xiaoZhaoHorse | ✅ | — | — | 📝
| XIN_HUN | xinHun | ✅ | — | — | 📝
| XIN_HUN_DEATH | xinHunDeath | ✅ | — | — | 📝

图例：🔢 数值契约覆盖 · 📊 量化数据候选（无契约） · 📝 纯事件/文案。

## 阶段二盲区分析

### 📊 量化数据候选（24 个，扩展数值网的潜在靶点）

这些 fact 携带数值（治疗量/伤害/击退距离等）且由引擎计算后展示给用户；若引擎算错（如治疗翻倍）数值网目前不盯。
补契约可行性（**第 73 轮取证修正：原"基本 test-only"判断不成立**）：28 候选全部为**即时效果**（HP 治疗/吸血、伤害、斩杀、击退换位、DoT、减防），**不进面板属性账本** `unit._mods`（现有数值网仅覆盖 `LEDGER_STATS=['atk','def','maxHp']`，且 HP 当前血量不在账本内——它是即时变更，治疗/伤害直接改 `unit.hp`）。要真正加牙（治"声明对、做错"核心洞），普遍需主代码配合——把即时效果贡献以独立 group 纳入可观测账本（重点 `_mods['hp']` 扩展）。个别 fact 虽已带数值字段，但那只是"绝对值"，隔离贡献仍需主代码。详见下方「28 候选加牙可行性判定」。

- `BLOOD_THIRST_LEECH` (`bloodthirstLeech`)
- `CLAW_EXECUTE` (`clawExecute`)
- `CLAW_HEAL` (`clawHeal`)
- `CLAW_HIT` (`clawHit`)
- `FLYER_REGEN` (`flyerRegen`)
- `FORTIFY_REBOUND` (`fortifyRebound`)
- `HORSE_DESTROY` (`horseDestroy`)
- `HORSE_REBOUND` (`horseRebound`)
- `HOT_BLOOD_HEAL` (`hotBloodHeal`)
- `KUAI_LE_HEAL` (`kuaiLeHeal`)
- `METEOR_SHOWER_SPLASH` (`meteorShowerSplash`)
- `MIND_CONTROL_SWAP` (`mindControlSwap`)
- `NINE_YANG_HEAL` (`nineYangHeal`)
- `PHANTOM_CONFUSE` (`phantomConfuse`)
- `PHANTOM_DISGUISE_HEAL` (`phantomDisguiseHeal`)
- `PUSH_STUN` (`pushStun`)
- `SPIDER_STRIKE` (`spiderStrike`)
- `WARRIOR_EXECUTE` (`warriorExecute`)
- `WEI_DODGE_LEECH` (`weiDodgeLeech`)
- `WIND_ASSAULT_PUSH` (`windAssaultPush`)
- `WIND_ASSAULT_SPLASH` (`windAssaultSplash`)
- `XING_FEN_EXTRA_ATTACK` (`xingFenExtraAttack`)
- `XING_FEN_GRANT` (`xingFenGrant`)
- `XING_FEN_RETRY` (`xingFenRetry`)
- `XUAN_MING_DOT` (`xuanmingDot`)
- `XUAN_MING_POISONED` (`xuanmingPoisoned`)
- `ZHANG_TAUNT` (`zhangTaunt`)

### 28 候选加牙可行性判定（第 73 轮取证修正）

> **本矩阵此前（阶段二）的"基本 test-only"判断不成立，本节是读码取证后的订正。**
> 逐项读 emit 源 + 比对 `stat-decl-vs-actual-check.mjs` 账本模型（L910 `LEDGER_STATS=['atk','def','maxHp']`、L1079 净增量兜底）后结论：
> 28 候选**全部为即时效果**（HP 治疗/吸血、伤害、斩杀、击退换位、中毒 DoT、减防），不进面板属性账本 `unit._mods`。
> 唯一已加牙的即时类参考 `LEECH_MAXHP`（L616）之所以能比对，是因为它比的是 **maxHp** 面板属性、且主代码把吸血上限提升以 `group:'leechMaxHp'` 写进 `_mods['maxHp']` 可被账本隔离（V3.0.2 注释 L619）。
> **HP 当前血量不在账本内**（即时变更，`unit.hp` 直接 ±），若照搬"净增量 hp 比对"必重蹈第 39 轮 `def` 多来源误报（同一步治疗+伤害/DoT 并发，净增量分不清份额）。
>
> **结论**：28 候选要真正加牙（治"声明对、做错"核心洞），普遍需主代码配合——把即时效果贡献以独立 group 纳入可观测账本（重点 `_mods['hp']` 扩展 + 治疗/伤害走带 group 的 hp 变更账本）。在此之前 test-only 只能做"声明内部一致性"弱校验，治不了核心洞。
>
> **补充（第 73 轮订正后新增）**：`extract(stepLog)` 当前只收"本步 fact 数组"，不收 `data.declarations`。故"比对 `XUAN_MING_DOT.dot` vs `ROUND_STAT_GRANT field:'hp' delta`"这类声明一致性校验，需先把 `declarations` 传入 `extract`（**纯 test-only 改检查器**，零主代码），可作加牙前的轻量占位；是否真要治"核心洞"（核对 hp 实际落地）仍取决于 `_mods['hp']` 基建。**决定转交主代码前，先验证这条 test-only 路径**，避免无谓的主代码改动。

| 分组 | 候选（emit 源不在用户 WIP 者打✓） | 加牙可行性 |
|------|----------------------------------|-----------|
| **HP 治疗/吸血**（贡献进 `_mods['hp']` 隔离，mirror WEI_LEECH） | NINE_YANG_HEAL✓(core/15:281,data.heal → 记账已落地 · 严格态 303/303 偏差 0，见第 75 轮) · PHANTOM_DISGUISE_HEAL✓(core/15:328,data.heal → 记账已落地 · 严格态 106/106 偏差 0，见第 79 轮) · HOT_BLOOD_HEAL✓(core/04:148,data.leech → 记账待补 · 警告态 436 条，见第 80 轮) · BLOOD_THIRST_LEECH✓(core/04:106/117,data.leechVal → 记账待补 · 警告态 201 条，见第 80 轮) · FLYER_REGEN✓(core/04:277,data.heal → 记账待补 · 警告态 541 条，见第 80 轮) · WEI_DODGE_LEECH✓(core/12 → 另见平行会话 WEI_DODGE_HEAL 契约，第 80 轮) · KUAI_LE_HEAL(modules/26·WIP暂跳) | **需主代码补 `_mods['hp']` group**；fact 已带 heal/leech 数值绝对值，但引擎即时 hp 变更、HP 多来源 → 净增量误报 |
| **即时伤害/斩杀/溅射** | WARRIOR_EXECUTE✓(core/03) · SPIDER_STRIKE✓(modules/20) · METEOR_SHOWER_SPLASH✓(core/04,减def+splashDmg) · CLAW_EXECUTE/HEAL/HIT(modules/26·WIP) · XING_FEN_* (modules/26·WIP) | 需主代码：伤害贡献进 `_mods['hp']` 或独立伤害账本 |
| **击退/换位**（声明位移量 vs 实际 pos 差） | PUSH_STUN✓(core/13) · WIND_ASSAULT_PUSH✓(core/13) · WIND_ASSAULT_SPLASH✓(core/04) · MIND_CONTROL_SWAP✓(core/14) · HORSE_DESTROY✓(core/05) · HORSE_REBOUND✓(core/12) · ZHANG_TAUNT(modules/27·WIP) | 需主代码：pos 变更机制账本，或声明位移量 vs 实际 pos 差比对 |
| **中毒 DoT/链接** | XUAN_MING_POISONED✓(core/15:285) · XUAN_MING_LINK_ATTACK(无数值字段 {partnerName,unitName}，第 77 轮移入纯事件类) · **XUAN_MING_DOT✓(modules/30:47 → 记账已落地 · 严格态 112/112 偏差 0，见第 75 轮)** · PHANTOM_CONFUSE(core/15+modules/27·WIP) | ✅ 已闭环（DoT 贡献进 `_mods['hp']` group 隔离） |
| **减防**（def 是账本属性，但 `STAT_CHANGE field:'def'` 走通用 group） | FORTIFY_REBOUND(core/12+modules/26·WIP) · METEOR_SHOWER_SPLASH 减防部分(core/04) | 待确认：能否用独立 group 隔离减防贡献；不能则随上组需主代码 |

### 第 74 轮更新（XUAN_MING_DOT 契约落地 + 主代码转交 concretized）

> 本轮把"HP 类加牙"从猜测落地为**已验证的可复用模式**，并写出**明确起止的主代码转交**（见 `tests/体检迭代日志.md` 第 74 轮「主代码改动 START/END」）。
>
> 1. **XUAN_MING_DOT 契约已写**（test-only，`tests/stat-decl-vs-actual-check.mjs` V3.0.3）：`group='xuanMingDot'`、`stat='hp'`、`dir=-1`（声明 `dot` 为正、hp 下降），extract 抓 `data.dot`。`LEDGER_STATS` 扩 `['atk','def','maxHp','hp']`；`STAGES` 加 `5`（玄冥中毒只在 stage 5 出现，否则契约零触发）。
> 2. **验证**（临时补主代码记账条目跑、再回滚）：激活后严格比对 **116 条 / 偏差 0**；把 `addMod value` 故意翻倍 → **命中 116 处、EXIT=1**。证明契约有牙、引擎正确。
> 3. **主代码改动极简且零行为副作用**：在 `modules/30custom-effects.js` dotTick 处额外 `addMod(u,'hp',{source:'玄冥中毒',value:-dot,ttl:'permanent',group:'xuanMingDot',op:'add'})` —— `core/13 addMod` 只 push 到 `_mods` 纯记账，真实扣血仍由既有 `ROUND_STAT_GRANT` 负责。其余 23 个 HP/pos 候选照此模式逐站点补 `_mods` 记账条目即可批量 test-only 落地。

### 第 75 轮更新（NINE_YANG_HEAL 契约落地 + 发现主代码 hp 浮点根因）

> 1. **NINE_YANG_HEAL 契约已写**（test-only，`stat-decl-vs-actual-check.mjs` V3.0.4）：`group='nineYangHeal'`、`stat='hp'`、**`dir=+1`**（治疗，hp 上升），extract 抓 `data.heal`（factData 字段 `unitName/heal/unitUid`）。与 XUAN_MING_DOT 的 `dir=-1` 形成正负双向对照，验证模式普适。
> 2. **验证**（临时补 `core/15` 记账条目跑、再回滚）：激活后严格比对 **303 条 / 偏差 0**（基线样本张无忌常驻明教阵营，九阳每击非满血即触发）；把 `addMod value` 故意翻倍 → **命中 303 处、EXIT=1**。证明契约有牙、引擎正确。
> 3. **⚠ 根因发现（主代码潜在 bug，非契约问题）**：验证中发现 NINE_YANG_HEAL 的 `heal` 是浮点（如 15.8、17.5），追到 `core/15` L278 `heal = Math.min(Math.floor(maxHp*pct), maxHp - hp)`——`floorRes` 恒为整数，但 `unit.hp` **在战斗中是浮点**（实测 176.2 / 207.3 / …），`Math.min(整数, 浮点)` 返回浮点。即**主代码 `unit.hp` 出现了非整数**（疑似某按比例扣血/治疗路径未取整）。契约本身因 `声明 heal` 与 `addMod value=heal` **同源精确相等**仍稳健（303/偏差 0），不阻塞落地；但 hp 浮点本身建议主代码排查取整（属独立问题，见下方「需主代码配合」第二项）。
> 4. 主代码转交（NINE_YANG_HEAL 记账条目）见 `tests/体检迭代日志.md` 第 75 轮「主代码改动 START/END」。
> 5. **已落地（第 77 轮）**：主代码 `core/15-skill-mechanisms.js` V6.6.0 已提交 —— 重跑红线：`NINE_YANG_HEAL 声明 362 条 · 严格比对 354 条 / 偏差 0`、EXIT=0（全契约偏差 0，含 XUAN_MING_DOT 109/109）。

### 第 77 轮更新（PHANTOM_DISGUISE_HEAL 契约落地 + XUAN_MING_LINK_ATTACK 重分类）

> 1. **PHANTOM_DISGUISE_HEAL 契约已写**（test-only，`stat-decl-vs-actual-check.mjs` V3.0.5）：成昆·幻影伪装治疗，`group='phantomDisguiseHeal'`、`stat='hp'`、`dir=+1`，extract 抓 `data.heal`（floor 整数）。
> 2. **STAGES 扩 [1-6]**：成昆只在 **stage 6** 出场（content L547），否则契约零触发致命（重蹈 XUAN_MING_DOT 需 stage 5）。
> 3. **验证**（临时补 `core/15` 记账条目跑、再回滚）：激活态严格比对 **106 条 / 偏差 0**；翻倍 `addMod value` → **命中 104 处、EXIT=1**。证明契约有牙、引擎正确。已回滚，当前警告态（声明 109 条）。
> 4. **XUAN_MING_LINK_ATTACK 重分类**：读码确认其 factData 仅 `{partnerName, unitName}`（`core/15` L436），**无任何数值字段**，是纯事件通知（非伤害）——从「量化候选」移入「纯事件/文案」类，订正此前误列。
> 5. 主代码转交（成昆幻影伪装记账条目）见 `tests/体检迭代日志.md` 第 77 轮「主代码改动 START/END」。
> 6. **已落地（第 79 轮）**：主代码 `core/15-skill-mechanisms.js` V6.7.0 已提交 —— 重跑红线：`PHANTOM_DISGUISE_HEAL 声明 109 条 · 严格比对 106 条 / 偏差 0`、EXIT=0（全契约偏差 0；NINE_YANG_HEAL 369/369、XUAN_MING_DOT 106/106 不变）。

### 第 80 轮更新（HP 治疗/吸血组 3 契约落地〔BLOOD_THIRST_LEECH / HOT_BLOOD_HEAL / FLYER_REGEN〕· 警告态）

> 1. **3 条契约已写**（test-only，`tests/stat-decl-vs-actual-check.mjs` V3.0.6）：`BLOOD_THIRST_LEECH`（group `bloodthirstLeech`、`dir=+1`、extract `data.leechVal` 带 `>0` 守卫——主代码分支 B 无零值守卫）· `HOT_BLOOD_HEAL`（group `hotBloodHeal`、`dir=+1`、extract `data.leech`，声明侧已 clamp）· `FLYER_REGEN`（group `flyerRegen`、`dir=+1`、extract `data.heal` = 实际落地值 `u.hp - before`）。
> 2. **STAGES[1-6] 无需扩**：三条均可在 stage 1-6 内触发（嗜血/热血走 Buff 轮转门控、飞行再生常驻）。
> 3. **验证**（临时补 `core/04` 四处记账条目跑、再回滚）：激活态严格比对 **193 / 436 / 541 条 / 偏差 0**、EXIT=0；咬牙（×2）→ **偏差 193 / 436 / 541 全命中、EXIT=1**。已回滚，当前警告态（声明 201 / 436 / 541 条）。
> 4. 主代码转交（`core/04` 四处记账条目）见 `tests/体检迭代日志.md` 第 80 轮「主代码改动 START/END」。
> 5. **WEI_DODGE_LEECH 边界**：韦一笑闪避吸血的 hp 回血由 `refreshMaxHp` 上限抬升路径产生（非直接回血），已由平行会话以 `WEI_DODGE_HEAL` 契约（group `weiDodgeHeal`）另行覆盖，不在本批。

### 📝 纯事件/文案（37 个，接受不补契约）

roundStart / roundEnd / pass / immune / miss / buffSummary 等只承担战报可读性，无数值正确性风险，规则层已按文案校验。

- `BUFF_SUMMARY` (`buffSummary`)
- `BUTTERFLY_HOST_DEAD` (`butterflyHostDead`)
- `BUTTERFLY_NO_HOST` (`butterflyNoHost`)
- `BUTTERFLY_RETURN` (`butterflyReturn`)
- `CLAW_NO_HEAL` (`clawNoHeal`)
- `DOUBLE_STRIKE` (`doubleStrike`)
- `DOUBLE_STRIKE_SUMMARY` (`doubleStrikeSummary`)
- `DROP` (`drop`)
- `EMPTY_TARGET` (`emptyTarget`)
- `FLY_SKIP` (`flySkip`)
- `HORSE_SUMMON` (`horseSummon`)
- `IMMUNE` (`immune`)
- `KU_LIAN_PRIORITY` (`kuLianPriority`)
- `METEOR_SHOWER_MAIN` (`meteorShowerMain`)
- `MIND_CONTROL_BANNER` (`mindControlBanner`)
- `MIND_CONTROL_FAIL` (`mindControlFail`)
- `MISS` (`miss`)
- `NO_CONTEND` (`noContend`)
- `PASS` (`pass`)
- `PHANTOM_REVEAL` (`phantomReveal`)
- `QIAN_KUN_BASIC` (`qianKunBasic`)
- `QIAN_KUN_DERIVED` (`qianKunDerived`)
- `QIAN_KUN_UPGRADED` (`qianKunUpgraded`)
- `RONG_HUI_BONUS` (`rongHuiBonus`)
- `ROUND_END` (`roundEnd`)
- `ROUND_START` (`roundStart`)
- `SKILL_ANNOUNCE` (`skillAnnounce`)
- `SPIDER_DEAD_TARGET` (`spiderDeadTarget`)
- `SPIDER_DOUBLE_STRIKE` (`spiderDoubleStrike`)
- `SPIDER_FLY` (`spiderFly`)
- `SPIDER_RETURN` (`spiderReturn`)
- `STUN_SKIP` (`stunSkip`)
- `SUMMON_UNIT` (`summonUnit`)
- `WIND_ASSAULT_FAIL` (`windAssaultFail`)
- `XIAO_ZHAO_HORSE` (`xiaoZhaoHorse`)
- `XIN_HUN` (`xinHun`)
- `XIN_HUN_DEATH` (`xinHunDeath`)
- `XUAN_MING_LINK_ATTACK` (`xuanmingLinkAttack`) ← 第 77 轮从量化候选移入（无数值字段）

## 结论与下一步

- 阶段一“数值真值网”对 **22/87** 个属性类 fact 已闭环（其余 65 个本就不是数值 fact）。
- rules-replay 的渲染器注册检查已对**全部** 87 个 factType 兜底“发出但未渲染”回归。
- 阶段二真正的硬骨头（第 73 轮取证订正）：24 个量化数据 fact（原 28，剔除 4 个纯事件标志）是否纳入数值网——**不是“直接补 24 条契约”，而是先推动主代码基建**（把即时 hp 变更以独立 group 纳入 `_mods['hp']`）。因为它们全部是即时效果（HP 治疗/吸血、伤害、斩杀、击退换位、DoT、减防），不进 `atk/def/maxHp` 面板账本，照搬净增量比对必误报（重蹈第 39 轮 def 多来源）。建议优先级：先攻 **HP 治疗/吸血类基建**（HP 直接变更、易翻倍、风险最高）→ 再击退/换位 → 再伤害类。
- **主代码配合（第 73 轮订正 → 第 74 轮 concretized）**：现有 22 个契约零主代码，是因为它们全是 `atk/def/maxHp` **面板账本类**；24 候选则普遍需主代码基建——**把即时 hp 变更以独立 group 纳入 `_mods['hp']`**。第 74 轮已用 XUAN_MING_DOT 跑通该模式（临时补记账条目→严格比对 116 条偏差 0→翻倍咬牙命中 116→回滚），证明**这是可复用、零行为副作用**的改动，其余 HP 候选照此逐站点补 `_mods` 记账条目即可批量 test-only 落地（具体转交见迭代日志第 74 轮「主代码改动 START/END」，约 2 行/候选）。

> 注：本矩阵原（阶段二）为静态只读分析；第 73 轮据读码取证订正了「基本 test-only」判断，新增「28 候选加牙可行性判定」节；第 74 轮把 XUAN_MING_DOT 契约落地（`tests/stat-decl-vs-actual-check.mjs` V3.0.3，LEDGER_STATS 扩 'hp'、STAGES 加 5）并 concretized 主代码转交（明确 START/END）。
