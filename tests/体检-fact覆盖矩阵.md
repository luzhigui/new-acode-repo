# 体检 · FACT_TYPES 覆盖矩阵（阶段二 fact 类型全覆盖）

> 生成：2026-10-11 · 只读静态分析，未改动任何文件。

## 总览

- **FACT_TYPES 总数**：87
- **有渲染器（infra/58 FACT_SPECS 注册）**：87 / 87 —— 全部注册 ⇒ `rules-replay.mjs` 的渲染器注册检查（L298-304）对**所有** factType 观测“发出但未注册渲染”类回归。
- **对照器数值契约覆盖**（数值真值网，阶段一闭环）：22 个 factType 携带“属性增减”载荷，均有契约盯着（显式枚举 12 + 形状锁定 12，去重后 22）。
- **无数值契约的渲染 fact**：65 个 —— 均为非数值的战报/事件类 fact。
  - 其中 **携带可量化数据**（治疗/伤害/击退等，扩展数值网候选）：28 个
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

### 📊 量化数据候选（28 个，扩展数值网的潜在靶点）

这些 fact 携带数值（治疗量/伤害/击退距离等）且由引擎计算后展示给用户；若引擎算错（如治疗翻倍）数值网目前不盯。
补契约可行性：**基本为 test-only**（fact 已带数值字段，像 BUTTERFLY/SOUL_DRAIN 那样零主代码补契约）；
个别若 fact 缺所需字段则需主代码补发一个数值字段（先逐条核对再决定）。

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
- `XUAN_MING_LINK_ATTACK` (`xuanmingLinkAttack`)
- `XUAN_MING_POISONED` (`xuanmingPoisoned`)
- `ZHANG_TAUNT` (`zhangTaunt`)

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

## 结论与下一步

- 阶段一“数值真值网”对 **22/87** 个属性类 fact 已闭环（其余 65 个本就不是数值 fact）。
- rules-replay 的渲染器注册检查已对**全部** 87 个 factType 兜底“发出但未渲染”回归。
- 阶段二真正待决定的只有 **28 个量化数据 fact** 是否纳入数值网：
  它们目前只被“展示”，不被“核对数值”。建议优先级：治疗/吸血类（HP 直接变更、易翻倍）> 击退/换位类 > 直接伤害类（伤害已有基线/不变量间接盯）。
- **主代码配合**：现有 22 个契约**零主代码**；扩展这 28 个的契约预计也以零主代码为主（fact 已带数据），仅少数需主代码补字段——逐条核对时再标记。

> 注：本矩阵为静态只读分析。`tests/stat-decl-vs-actual-check.mjs` 当前有并行会话未提交的 round-72 改动（BREAK_DEF 修 + `.diag-bd2/3.mjs`），故本轮只产出分析、未改契约文件。
