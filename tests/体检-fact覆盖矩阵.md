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
| **HP 治疗/吸血**（贡献进 `_mods['hp']` 隔离，mirror WEI_LEECH） | NINE_YANG_HEAL✓(core/15:281,data.heal → 记账已落地 · 严格态 303/303 偏差 0，见第 75 轮) · PHANTOM_DISGUISE_HEAL✓(core/15:328,data.heal → 记账已落地 · 严格态 106/106 偏差 0，见第 79 轮) · HOT_BLOOD_HEAL✓(core/04:163,data.leech → 记账已落地 V6.3.6 · 严格态 394 偏差 0，见第 80 轮) · BLOOD_THIRST_LEECH✓(core/04:114/128,data.leechVal → 记账已落地 V6.3.6 · 严格态 168 偏差 0，见第 80 轮) · FLYER_REGEN✓(core/04:296,data.heal → 记账已落地 V6.3.6 · 严格态 531 偏差 0，见第 80 轮) · WEI_DODGE_LEECH✓(core/12 → 另见平行会话 WEI_DODGE_HEAL 契约，第 80 轮) · KUAI_LE_HEAL(modules/26·WIP暂跳) | **需主代码补 `_mods['hp']` group**；fact 已带 heal/leech 数值绝对值，但引擎即时 hp 变更、HP 多来源 → 净增量误报 |
| **即时伤害/斩杀/溅射** | WARRIOR_EXECUTE✓(core/03) · **SPIDER_STRIKE✓(modules/20:203 → 记账已落地 V6.1.1 · 严格态 40 偏差 0，见第 81 轮)** · METEOR_SHOWER_SPLASH✓(core/04,减def+splashDmg) · CLAW_EXECUTE(modules/26·重分类纯事件) · CLAW_HEAL✓/CLAW_HIT✓(记账已落地 · 严格态 27/71) · XING_FEN_* (modules/26·WIP) | 需主代码：伤害贡献进 `_mods['hp']` 或独立伤害账本 |
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

---

## 第 79 轮追加（2026-10-12 深夜 · 反弹伤害与吸血回血盲区 + 嗜血狂刀 +0 根因）

> 1. **WEI_DODGE_HEAL 契约已写**（`stat-decl-vs-actual-check.mjs`）：韦一笑闪避吸血的 **hp 实际增量盲区**——WEI_HEAL 契约只盯 maxHp 账本（group weiLeech），但 `refreshMaxHp`（core/13 L233）会把 hp 同步抬升同样增量（`applyStatChange('hp', delta)`），该 hp 变更无 group 记账。契约读 `WEI_DODGE_LEECH` fact 的 **`maxHpDelta`**（不用 `data.heal`：heal 是 27 传的毛估值、floor 前，与实际 hp 增量差舍入会误报；实际 hp 增量 = delta = maxHpDelta 同源）。验证：临时补记账条目 → 严格比对 **79/79 偏差 0**；翻倍咬牙 → **命中 79、EXIT=1**；已回滚。当时警告态（声明 79）→ **已落地转严格态（第 83 轮，`core/12` V6.3.10 记账 group weiDodgeHeal：声明 71 · 严格 71 · 偏差 0）**。
> 2. **HORSE_REBOUND / FORTIFY_REBOUND 两条契约已写**：反弹伤害盲区——REBOUND handler（core/16 L189-199）对 hp 伤害无 group 记账。两个声明源共用同一 handler：小昭马形阵反弹（core/12 L387，`factData.rebound`）与张无忌反击（core/12 L397 + modules/26 L243，`factData.reboundDmg`，⚠️ 嵌套子 fact、递归扫）。`dir=-1`（声明为正伤害、hp 下降）。验证：HORSE_REBOUND 激活态 6/6 偏差 0、咬牙翻倍命中 6；FORTIFY_REBOUND 激活态 220/偏差 0（声明 264 vs 比对 220 的差 = 目标已死被 handler `continue` 跳过的合理损耗）；已回滚。当时均警告态（6 / 264）→ **已落地转严格态（第 83 轮，`core/16` V6.1.0 REBOUND handler 按 decl.factType 分组记账 horseRebound/fortifyRebound：HORSE 6/6、FORTIFY 227/202 · 偏差 0，差额=目标离场损耗）**。
> 3. **rules-replay 报 1 例真实失败并已定根因（主代码缺陷，非体检误报）**：`嗜血狂刀吸血(回归)` rule151 seed=18 stage=2「吸血量 +0」。探针实证：该例 **isBrother=false（分支 1）**，`dmg>0` 守卫通过，但 `Math.floor(dmg×0.8)=0`（**dmg=1 时 floor(0.8)=0**）仍登记 ⇒ 战报多一行「吸血+0」噪声。rule151 注释原判"+0 只来自分支 2 dmg=0"不完整——分支 1 低伤害同样产 +0（r13-r15 大量出现：雄狮/谢逊 dmg=1 频繁）。**修法见下方主代码转交**（分支 1 push 前加 `leechVal > 0` 守卫，语义无损；分支 2 的 dmg=0 问题规则注释已述、同批可修）。
> 4. **本轮三条契约均未提交**：工作区被并行会话第 80 轮（BLOOD_THIRST_LEECH/HOT_BLOOD_HEAL/FLYER_REGEN 三条即时治疗契约，V3.0.6）占用中（其 22:46 仍在跑红线收尾），为避免提交撞车，本批契约留在工作区（已验证 EXIT=0），待其收尾后随下一笔 tests 提交一并落库。迭代日志第 80 轮章节亦留待并行会话写毕再补第 81 轮，避免锚点冲突。

===== 主代码改动 START（core/04buff-system.js L104-108，submitBloodthirstDeclaration 分支 1）=====
// 现状（dmg>0 但 dmg=1 时 floor(1×0.8)=0 ⇒ 登记「吸血+0」噪声行）：
//     if (hasBuff(unitBuffs, BUFF_TYPES.BLOODTHIRST) && unit.role === ROLE_TYPES.WARRIOR && dmg > 0) {
//         const leechVal = Math.floor(dmg * C.BUFFS.bloodthirst.leechRatio);
//         const decl = { type: EFFECT_TYPES.LEECH, value: leechVal, source: unit, factType: FACT_TYPES.BLOOD_THIRST_LEECH, factData: { unitName: unit.name, leechVal, isBrother: false, unitUid: unit.uid } };
//         if (!data.declarations) data.declarations = [];
//         data.declarations.push(decl);
// 改为（仅包住 decl 登记一行；extraRequests 追击逻辑不动——dmg>0 已保证打出过伤害）：
//     if (hasBuff(unitBuffs, BUFF_TYPES.BLOODTHIRST) && unit.role === ROLE_TYPES.WARRIOR && dmg > 0) {
//         const leechVal = Math.floor(dmg * C.BUFFS.bloodthirst.leechRatio);
//         const decl = { type: EFFECT_TYPES.LEECH, value: leechVal, source: unit, factType: FACT_TYPES.BLOOD_THIRST_LEECH, factData: { unitName: unit.name, leechVal, isBrother: false, unitUid: unit.uid } };
//         if (!data.declarations) data.declarations = [];
//         if (leechVal > 0) data.declarations.push(decl);
===== 主代码改动 END =====

说明：`leechRatio=0.8`（content L514），dmg=1 时 floor 得 0；吸 0 血 = 不吸血，加 `>0` 守卫后 rule151 判据 1 恢复绿（当前 62 pass/1 fail）。分支 2（L114-117，小昭·弟永久海克斯、无 dmg 守卫）建议同批处理：把 `const leechVal = Math.floor(dmg * C.BUFFS.bloodthirst.leechRatio);` 后的 push 也加 `if (leechVal > 0)`（分支 2 的 push 是单行 `data.declarations.push({...})`，把整行包进 if 即可）。

> ✅ **第 80 轮已核销**：主代码 `core/04buff-system.js` V6.3.6（commit `c5fca17`）已落地双分支 `leechVal>0` 守卫 + 热血奋战/飞行再生记账——rule151 复跑 **pass=61 fail=0**，BLOOD_THIRST_LEECH/HOT_BLOOD_HEAL/FLYER_REGEN 三契约转严格态（168/394/531 · 偏差 0）。

---

## 第 81 轮更新（2026-10-12 深夜 · 宋青书爪系 + 小昭蛛袭 4 契约落地 · WARRIOR_EXECUTE 重分类）

> 1. **SPIDER_STRIKE 契约已写**（test-only，`stat-decl-vs-actual-check.mjs` V3.0.7）：小昭蛛袭（蛛落落地打击），`modules/20` L203-212 直推 fact，`data.totalDmg = penetrationDmg + extraDmg`，同函数 `applyStatChange(target,'hp',-totalDmg)` 即时扣血。`dir=-1`、`group='spiderStrike'`、读 `data.totalDmg`（>0 守卫）。验证：临时补 `modules/20` 记账 → 激活态严格比对 **42/42 偏差 0**；翻倍记账 → **命中 42、EXIT=1**（明细"多加 X"精确）。**已正式落地 2026-10-13（`modules/20` V6.1.1，记账条目在实读 L201 之后）**：严格态 **40 条 / 偏差 0 · EXIT=0**（40 vs 41 = 1 条目标离场/聚合损耗，非缺口）；转交块见下方 START/END（存档）。
> 2. **CLAW_HIT 契约已写并已激活**：九阴白骨爪链式多爪（CLAW_CHAIN），fact 经 `core/10` L294-295 以嵌套子 fact 落进攻击组 entries（递归扫）。读 **回填后的 `data.dmg`**（core/16 L263，减伤后实际落地值——不用 `designedDmg`，那是减伤前设计值，会被小昭·姊乾坤衍生 reduce 拉开）。记账点在 **core/16 CLAW_CHAIN handler 应用点**（每次应用一条 ⇒ 双应用可被抓）。激活态 **71 个比对条目 / 覆盖 316 条声明 / 偏差 0**（316= hits 数，71=按单位聚合条目，平均 4.4 爪/链，**非缺口**）；咬牙翻倍 → 命中 71、EXIT=1。
> 3. **KUAI_LE_HEAL 契约已写并已激活**：快乐回血（周芷若快乐层数结算），`modules/26` L627 推 `ROUND_STAT_GRANT{field:'hp',delta:totalHeal}` 声明 + L635 直推 `data.heal`。`dir=+1` mirror NINE_YANG_HEAL。激活态 **80/80 偏差 0**；咬牙翻倍 → 命中 80。
> 4. **CLAW_HEAL 契约已写并已激活**：爪击回血（宋青书吸血段），`modules/26` L719 推 `HEAL{value:totalHeal, source:song}` 声明，factData 仅 `{totalHeal, unitUid}`（**无 unitName**）⇒ 走 **uid 精确归因**（主循环 L1413-1417 支持，命中明细显示 `null.hp` 即此因，功能正确）。激活态 **27/偏差 0**（28 声明 vs 27 比对：1 条为宋青书当场阵亡，HEAL handler `!source.alive` 跳过、无记账无比对，合理损耗）；咬牙翻倍 → 命中 27。
> 5. **⚠ 并行会话全量提交扫入事件**：上述三条主代码记账条目（core/16 + modules/26 两处）在本轮临时验证期间被并行会话的"工作区全量入库"提交 `8544c03`（23:24）扫入 HEAD——**内容正是转交的记账条目（值正确、group 正确），三契约由此直接转激活态**；但注释仍带着"【临时验证用，验证后回滚】"字样（ cosmetic 问题，建议主代码侧找机会清一下措辞，见下方可选清理）。modules/20 的 SPIDER_STRIKE 记账当时**未**被扫入（本轮已回滚）→ **后于 2026-10-13 经正式转交落地（`modules/20` V6.1.1）**，四契约现全部激活。
> 6. **WARRIOR_EXECUTE 重分类为纯事件**：读码确认其 factData 仅 `{unitName, targetName, unitUid, targetUid}`（core/03 L260），**无任何数值字段**——斩杀伤害量不在 fact 里（EXECUTE 声明本身也不带 value），是事件标记。从「量化候选」移出。
> 7. **量化候选覆盖进度**：24 个候选中已落地 **13 条契约**（XUAN_MING_DOT / NINE_YANG_HEAL / PHANTOM_DISGUISE_HEAL / WEI_DODGE_HEAL / HORSE_REBOUND / FORTIFY_REBOUND / BLOOD_THIRST_LEECH / HOT_BLOOD_HEAL / FLYER_REGEN / SPIDER_STRIKE / CLAW_HIT / KUAI_LE_HEAL / CLAW_HEAL，其中 **10 条当时已激活**（SPIDER_STRIKE 于 2026-10-13 随 `modules/20` V6.1.1 落地）；**【第 83 轮订正】**原写「13 条全部已激活」不实——WEI_DODGE_HEAL / HORSE_REBOUND / FORTIFY_REBOUND 三条当时仍是警告态（账本空、严格比对 0 非真比对），至第 83 轮记账落地才转严格；重分类纯事件 5 个（WARRIOR_EXECUTE / XUAN_MING_LINK_ATTACK / CLAW_EXECUTE / XING_FEN_GRANT / XING_FEN_EXTRA_ATTACK / XING_FEN_RETRY——后三个第 79 轮已判定、量化列表条目待清理）；**剩余待攻**：METEOR_SHOWER_SPLASH（伤害+减防，减防部分或已被 STAT_CHANGE 契约覆盖，下轮核）、HORSE_DESTROY（prob/roll 概率一致性，非属性增量）、pos/状态类 5 个（MIND_CONTROL_SWAP / PUSH_STUN / WIND_ASSAULT_PUSH / WIND_ASSAULT_SPLASH / ZHANG_TAUNT——位移/嘲讽无可账本化属性，需另设计检验法）、PHANTOM_CONFUSE / XUAN_MING_POISONED（状态施加事件）。
> 8. **本轮未跑全量红线外的改动**：仅 tests/ 三文件（检查器 V3.0.7 + 本矩阵 + 迭代日志）。当前红线快照（23:57）：stat-decl EXIT=0（12 契约激活偏差 0 + SPIDER_STRIKE 警告态）；static-scan EXIT=0；rules-replay **1 条失败**（`carry五号位队友加成量(回归)` pass=39 fail=1——并行会话 23:36 carry 改动 `86de191` 引入，非本轮范围，已在其收尾视野内）；baseline 5 场 winner 翻转（何太冲重做预期项，待用户拍板重录）。

### ===== 主代码改动 START（modules/20elite-skills.js，蛛落落地打击段）=====
// import 区已含 addMod（L5），无需改 import。
// 在 L203 `applyStatChange(target, 'hp', -totalDmg, unit, '蛛袭');` 之后加一条纯记账：
addMod(target, 'hp', { source: '蛛袭', value: -totalDmg, ttl: 'permanent', group: 'spiderStrike', op: 'add' });
===== 主代码改动 END =====

说明：`core/13 addMod` 只 push 到 `_mods['hp']` 纯记账，真实扣血仍由上方 `applyStatChange` 负责，零游戏逻辑副作用。**已应用（2026-10-13，`modules/20` V6.1.1）**：实测 `SPIDER_STRIKE 声明 41 条 · 严格比对 40 条 / 偏差 0 · EXIT=0`（激活态）。

### 可选清理 START（core/16effect-handlers.js + modules/26elite-sixsects.js，注释措辞）=====
// 8544c03 扫入的 3 条记账条目注释带着"【临时验证用，验证后回滚】"字样，建议改为正式措辞，例如：
//   core/16 L260：// 体检记账（V6.x.x）：爪击自身 hp 贡献以独立 group 隔离进账本，供 stat-decl 对照器按 group='clawHit' 比对「声明 dmg vs 实际扣血」
//   modules/26 L631 后：// 体检记账（V6.x.x）：快乐回血自身 hp 贡献以独立 group 隔离进账本，供 stat-decl 对照器按 group='kuaiLeHeal' 比对
//   modules/26 L719 后：// 体检记账（V6.x.x）：爪击回血自身 hp 贡献以独立 group 隔离进账本，供 stat-decl 对照器按 group='clawHeal' 比对
// （纯注释改动，零行为影响；顺手把文件头版本号 +0.1）
===== 主代码改动 END =====

> 9. **第 82 轮（2026-10-13）——carry 同名假阳性根治 + A28 锚点重校准（纯体检侧，主代码零改动）**：
>    `rules-replay` 遗留 1 fail「carry五号位队友加成量」定位为**规则假阳性**：rule95 信号5 队友池按显示名
>    剔自己，把同名个体一并剔除（引擎只按 uid 剔 self）——seed=9 stage=7 终局 3 只「雄狮」致上界算小
>    （cap 防 5.52 < 真值 6）。修法（148 V6.1.22）：名字唯一才剔自己，**同名时 mates 取整池**（上界判据
>    只会更松：actual ≤ cap/2 恒成立；信号3 min 更保守；信号1 同名仍跳过）。咬牙：引擎侧 atk 比例 ×3 ⇒
>    rule95 16 处命中 ⇒ 回滚干净。另修 `mutation-teeth` A28 锚点（主代码摄魂改 `value: ratio` 后旧锚点
>    0 匹配 = 变异静默失效假阴性），V2.9.3 重对准后 44/44 锚点有效并重跑全量。红线：rules-replay（含
>    DEAD=1）全绿 0 fail；static-scan / smoke / stat-decl（**【第 83 轮订正】**原写「13 契约全激活」不实：WEI_DODGE_HEAL / HORSE_REBOUND /
>    FORTIFY_REBOUND 三条当时为警告态，非全激活）EXIT=0；baseline 仍 5 场 winner
>    翻转（何太冲三改，于第 84 轮核实后**已直接重录基线**，无需拍板）。

> 10. **第 83 轮（2026-10-13）——第 79-82 轮综合审核 + 三契约记账落地收尾（主代码授权直改）**：
>    审核实证面扎实（static-scan 0、teeth 44/44、38 契约偏差 0、10 条 HP 契约判据成立），揪出 1 中（假绿
>    措辞：三条警告态被记作「全部激活偏差 0」）+3 低（临时注释未清 / SPIDER_STRIKE 缺 0 值守卫可选 / 探针
>    残留在途）+1 挂起（baseline 5 场 winner 翻转，其核销见第 84 轮：核实即重录）。落地：`core/16` V6.1.0 REBOUND 分组记账
>    （horseRebound/fortifyRebound）+ `core/12` V6.3.10 WEI_HEAL 补 hp 记账（weiDodgeHeal）+ 检查器
>    V3.0.8「声明>0 严格比对 0」⚠ 显式行。三契约**警告态→严格态**：WEI_DODGE_HEAL 71/71、HORSE_REBOUND 6/6、
>    FORTIFY_REBOUND 227/202 · 偏差全 0；rules-replay 0 fail / smoke 全过 / baseline 无新增翻转。

> 11. **第 84 轮（2026-10-13）——溅射双契约 + 乾坤衍生双契约，scan-groups 盲区扫地（纯体检侧，主代码零改动）**：
>     矩阵「剩余待攻」首项 METEOR_SHOWER_SPLASH 本轮核掉：**伤害部分**落地契约（group 'meteorSplash'，hp，dir=-1，
>     读 factData.splashDmg，targets 逐目标 uid 归因），**减防部分**证实已由 STAT_CHANGE 契约覆盖（core/04 L238 的
>     def decl 无 factType、走通用 group 'statChange'）——矩阵当年「或已被覆盖」的猜测坐实。同轮的
>     WIND_ASSAULT_SPLASH（乘风溅射）读码证实被矩阵误归「击退/换位」组，实为溅射伤害、与流星共用同一 SPLASH
>     handler ⇒ 一行记账转交同时激活两条（group 'windSplash'）。另：`--scan-groups` 盲区扫描（39 真实 group）
>     挖出 **qianKunDerived 268 条 atk 词条无契约盯**——乾坤衍生加攻/治疗双契约落地：QIAN_KUN_ATK
>     （group 'qianKunDerived'，addMod 与 fact 同 handler 同值）**零主代码依赖、落地即严格态** 249/偏差 0；
>     QIAN_KUN_HEAL（group 'qianKunHeal'，治疗走即时 hp）警告态待转交。四条全部走完「临时记账→严格比对→
>     咬牙→回滚」闭环（133/68/236/248 命中，EXIT=1）。剩余盲区：heTaichongRed（两仪互换 48 词条，下轮攻）；
>     乾坤衍生 reduce（减伤值）无属性账本，归伤害侧检测。转交 2 处见下方 START/END 块。

### ===== 主代码改动 START（core/16effect-handlers.js，SPLASH handler 逐目标循环内，applyStatChange 那一行之后）=====
// 激活 METEOR_SHOWER_SPLASH + WIND_ASSAULT_SPLASH 两条契约（第 84 轮转交）。原样保留第一行，在它后面插入：
            applyStatChange(st, 'hp', -(decl.value || 0), ctx.unit, '溅射');
            // 纯记账（体检对照 meteorSplash/windSplash group，2026-10-13 第 84 轮）：只 push _mods['hp']，零行为副作用；
            //   按 decl.buffType 分组（流星赶月 METEOR_SPLASH / 乘风突袭 WIND_ASSAULT），无 buffType 的其他溅射不进契约、不记账
            const splashGroup = decl.buffType === BUFF_SUBTYPES.METEOR_SPLASH ? 'meteorSplash' : decl.buffType === BUFF_SUBTYPES.WIND_ASSAULT ? 'windSplash' : null;
            if (splashGroup) addMod(st, 'hp', { source: '溅射', value: -(decl.value || 0), ttl: 'permanent', group: splashGroup, op: 'add' });
// 依赖均已 import（core/16 头部：addMod ← 13battle-shared；BUFF_SUBTYPES ← 56-battle-enums），无需加 import。
// 预期效果：两契约警告态→严格态（临时记账实测 METEOR 133 条 / WIND 68 条偏差 0；本改动落地后红线 stat-decl EXIT=0）。
===== 主代码改动 END =====

**已应用（2026-10-13，`core/16effect-handlers.js` V6.1.1）**：实测 `METEOR_SHOWER_SPLASH 139 声明 · 严格比对 133`、
`WIND_ASSAULT_SPLASH 71 声明 · 严格比对 68` · **偏差 0 · EXIT=0**（警告态→严格态；缺口 = 目标离场未记账的合理损耗）。

### ===== 主代码改动 START（modules/27elite-mingjiao.js，乾坤衍生治疗两处 applyStatChange 之后）=====
// 激活 QIAN_KUN_HEAL 契约（第 84 轮转交）。共两处，缩进不同，逐处插入：
// 处一（常规路径，submitXiaoZhaoQianKunDerivedDeclaration 内，20 空格缩进）：
                    applyStatChange(healTarget, 'hp', heal, xiaoZhao, '乾坤衍生治疗');
                    // 纯记账（体检对照 qianKunHeal group，2026-10-13 第 84 轮）：只 push _mods['hp']，零行为副作用
                    addMod(healTarget, 'hp', { source: '乾坤衍生治疗', value: heal, ttl: 'permanent', group: 'qianKunHeal', op: 'add' });
// 处二（白骨爪路径 submitClawQianKunDerived 内，16 空格缩进）：
                applyStatChange(healTarget, 'hp', heal, xiaoZhao, '乾坤衍生治疗');
                // 纯记账（体检对照 qianKunHeal group，2026-10-13 第 84 轮）：只 push _mods['hp']，零行为副作用
                addMod(healTarget, 'hp', { source: '乾坤衍生治疗', value: heal, ttl: 'permanent', group: 'qianKunHeal', op: 'add' });
// addMod 已在 modules/27 头部 import，无需加。预期效果：QIAN_KUN_HEAL 警告态→严格态（临时记账实测 248 条偏差 0）。
===== 主代码改动 END =====

**已应用（2026-10-13，`modules/27elite-mingjiao.js` V6.7.4）**：实测 `QIAN_KUN_HEAL 268 声明 · 严格比对 248 条 · 偏差 0`、
`QIAN_KUN_ATK 268 声明 · 严格比对 249 条 · 偏差 0` · EXIT=0（前者警告态→严格态；后者本就零主代码依赖）。
回归：`rules-replay` 0 fail / 0 空转、`smoke-headless` 全过。

> **第 84 轮订正（矩阵旧条目）**：①「剩余待攻」METEOR_SHOWER_SPLASH 已核（伤害部分契约化、减防部分归 STAT_CHANGE）；
>   ② WIND_ASSAULT_SPLASH 从「击退/换位」组移入「即时伤害/溅射」组（读码证实是溅射伤害，factData 带 splashDmg）；
>   ③ 量化候选覆盖进度：24 候选已落地 **17 条契约**（原 13 + 溅射 2 + 乾坤衍生 2），重分类纯事件 5 个，
>   **剩余待攻**：HORSE_DESTROY（prob/roll 概率一致性）、pos/状态类 4 个（MIND_CONTROL_SWAP / PUSH_STUN /
>   WIND_ASSAULT_PUSH / ZHANG_TAUNT）、PHANTOM_CONFUSE / XUAN_MING_POISONED（状态施加事件）；
>   ④ 新增剩余盲区 1 个：**heTaichongRed**（两仪互换，scan-groups 实测 48 条 atk/def/maxHp 词条无契约）。

> 12. **第 85 轮（2026-10-13）——heTaichongRed 盲区契约化（HE_TAICHONG_RED，纯体检侧，主代码零改动，转交 1 处）**：
>    scan-groups 第 84 轮挖出的属性盲区 `heTaichongRed`（两仪互换/单人红血，48 条 atk/def/maxHp 词条快照）本轮契约化。
>    **关键设计决策**：红血机制唯一 fact 是 3 条 SKILL_ANNOUNCE（skillName 两仪互换/红血）且不带数值；
>    `emitStateChange(ROLE_CHANGED)` 只发 eventBus 信号**不产 fact**（infra/59 文件头明示「日志 fact 由各源头 log.push 负责」）
>    ⇒ 纯 test-side 推职业信息路线证死 ⇒ 走 `data.grants` 数值载荷转交（同 weiHeal.maxHpDelta / pangDefGain 先例；
>    `refreshMaxHp` 不走 addMod（core/13 L221-242 只同步 maxHp+缩放 hp），maxHp 账本无双算源）。
>    验证闭环：零触发警告态（声明 0/账本 48）→ 临时转交严格比对 **32/32 偏差 0**（48 词条扣 16 个 0 值 stat，
>    与 `>0` 守卫吻合）→ 咬牙引擎 atk×2 **命中 16 处 EXIT=1** → 回滚干净（git status 验证、无「临时验证用」残留）。
>    **补丁态全红线绿**（rules-replay 0 fail / static-scan 0 issue / smoke 全过 / mutation 44/44）——fact 加字段
>    对渲染/翻译/规则零影响。附带侦查：另一条零触发 **BAGUA_DEF** 定性为**历史契约残留非缺陷**——2026-10-08
>    改版有意删除「-1攻+1防」对冲（defDelta 恒 0），atk 侧本就有 BAGUA_ATK（dir:-1）盯；已在契约补注释防误读、
>    保留作回归哨兵。契约总数 42→**43**；scan-groups 属性盲区清零（heTaichongRed 契约已建，转交后转严格）。

### ===== 主代码改动 START（modules/26elite-sixsects-hetaichong.js，红血机制③，激活 HE_TAICHONG_RED 契约）=====
// 第 85 轮转交。共 3 处插入 + 3 行替换，全部为纯记账/挂载，零行为副作用（战报文本与渲染输出不变）。
// ── 插入①：addRoleBonus 定义前（「只登记职业加成」注释行与 function 行之间），加收集器声明 ──
            // 红血加成 grants 收集器（2026-10-13 第 85 轮体检转交）：每套加成记一条 {uid, atk, def, maxHp}，
            //   由下方 announce fact 的 data.grants 带给体检契约 HE_TAICHONG_RED 对账；只读 bonus 原值，零行为副作用
            let pendingGrants = null;
// ── 插入②：addRoleBonus 函数体内，refreshMaxHp(unit, null, label); 那一行之后 ──
                if (pendingGrants) pendingGrants.push({ uid: unit.uid, atk: bonus.atk, def: bonus.def, maxHp: bonus.maxHp });
// ── 插入③：tryRedBlood 内，if (hpAfter > subject.maxHp * redThreshold) return; 那一行之后 ──
                pendingGrants = [];   // 本次红血事件的加成收集起点（两仪互换/单人红血各算一轮）
// ── 替换④（红血·撤退 announce，原行尾 floatUid: u.uid } }); 改为挂 grants）──
                    if (outLog) outLog.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: { unitName: u.name, unitUid: u.uid, camp: u.camp, skillName: '红血', note: `🩸 ${u.name} 红血：撤退至 ${retreatPos} 号位、转远程`, floatText: '🩸', floatUid: u.uid, grants: pendingGrants } });
// ── 替换⑤（红血·转战士 announce，同样在行尾挂 grants）──
                    if (outLog) outLog.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: { unitName: u.name, unitUid: u.uid, camp: u.camp, skillName: '红血', note: `🩸 ${u.name} 红血：退无可退、转战士`, floatText: '🩸', floatUid: u.uid, grants: pendingGrants } });
// ── 替换⑥（两仪互换 announce，swap 对象之后挂 grants）──
                    if (outLog) outLog.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: { unitName: subject.name, unitUid: subject.uid, camp: subject.camp, skillName: '两仪互换', note: `☯ 两仪互换：${subject.name} ⇄ ${partner.name}（互换职业与位置）`, floatText: '☯', floatUid: subject.uid, swap: { aUid: subject.uid, bUid: partner.uid, posA: myPos, posB: hisPos }, grants: pendingGrants } });
// 无需加 import（bonus/pendingGrants 均在本闭包内）。预期效果：HE_TAICHONG_RED 零触发警告态 → 严格态
// （临时转交实测 32 声明全命中/偏差 0；落地后红线 stat-decl EXIT=0 维持）。
===== 主代码改动 END =====
