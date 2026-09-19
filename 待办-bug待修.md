# 光明顶 5v5 · Bug 待修

> 状态：待修 / 待讨论 / 待补信息 / 已修留档。
> 本文件只收 Bug；功能需求类待办见 `文件汇总20260730/待办-事项待办.md`。
> 已修项由 `tests/health-rules/` 对应回归规则持续监控，复发会被全身体检自动捕获。

| 编号 | 状态 | Bug | 说明 |
|------|------|-----|------|
| 1 | 待讨论 | 所有分隔符逻辑 | 按用户要求单独讨论、暂不动；双分隔符复发已有 rule78（131-separator-duplicate.js）监控 |
| 2 | 已修 | 闪避反击击杀无死亡特效（尸体一直赖在场上） | rule80（133-death-effect.js）监控战士斩杀/白骨爪/闪避反击三条复发路径 |
| 3 | 待补信息 | 算式核对：9 + 31×0.09 + 140×0.013 = 13 | 原文仅此算式，待补：涉及哪个机制、预期值与实际值的偏差 |
| 4 | 已修 | 玄冥二老联动攻击后"动"变灰色 | 用户 2026-09-19 实机确认已修（行保护 3f7fb94 在位）。补充静态说明（2026-09-19 核对）：`_acted` **双源写入**——模拟层 `core/` 写 `unit.state._acted`（`10battle-attack.js:31/36/54`、`12battle-attack-steps.js:132/194`、`11battle-round.js:381`），表现层又各自向 store `dispatch({ type: SET_VISUAL, _acted: true })`（`player/46attack-group.js:42/127`、`fx/82fx-crash-5v5-test.js:14/104/190/272`、`fx/85fx-dodge-bullet.js:213/214`）；`core/10battle-attack.js:292-294` 的 `actedMode==='restore'` **只恢复模拟层对象、不回灌 store**。**但影响极小**：`player/42player-core.js:233` 每步末调 `syncStoreFromStep`，用模拟层真值整体覆盖 store（`modules/24battle-store.js:44-47`），表现层那份 `_acted:true` 在同一步结束即被冲掉——灰色只在该步播放期间短暂出现，**自愈**，非永久残留。仅留结构建议（表现层不应写语义字段），详见 `文件汇总20260730/优化-想法和优化.md` 附录「玄冥二老联动体系梳理」 |
| 5 | 待修 | 拒马消失判定 | 待定位，暂无回归规则 |
| 6 | 已修 | 乾坤大挪移减伤/反弹提示不显示 | 根因（2026-09-14）：`core/12` 的 `buildAttackGroup` 从 `dmgResult` 取出 `bonusEntries` 后从未使用，伤害修饰器（乾坤减伤/反弹）产出的 fact 被静默丢弃 → 玩家看不到提示。已并入 `entries`。注意：`calcFinalDamage` 形参名 `allySide/enemySide` 与实参语义相反，`query('damageModifiers', ...)` 处的互换写法是**有意抵消**，改动时勿单独"修正"。 |
| 7 | 待修 | 资产登记红线失真：player 仍直接 import fx | `player/46attack-group.js:7-8` 导入 `../fx/81fx-arrows-5v5-test.js`（showBoneClaw）、`../fx/80fx-common-5v5-test.js`（showDamageFloat），与登记资产「player→fx 依赖反转：player 禁止 import fx」冲突；该文件头自称"特效已全部移交 stageActions"。处置：清 import 或收回调用，属代码侧裁决。见 `文件汇总20260730/资产-核心资产清单.md`「首次核对发现」 |
| 8 | 待修 | 死 import：`markGridShake` 两处残留 | `fx/81fx-arrows-5v5-test.js:4`、`fx/82fx-crash-5v5-test.js:6` 均只 import 未调用（颤动实际已由 `fx/88fx-trigger.js` 的 `shakeTarget` 统一发起）；同时资产描述"82 无 markGridShake import"已失真，需一并更正 |

当前已收尾的部分：技能声明化（阶段 1/2a/2b）、buff 声明化、台词数据驱动、62/32 去重。

剩余大块需要你输入或拍板：

ENEMY_SQUADS / MING_M / ENEMY_POS_TEMPLATES 等静态阵容数据迁入 JSON —— 我之前建议暂缓，但如果你要现在做，可以开始。

清单单一数据源 —— 需要你发 tools/106-ai-pack-config.js 和 tools/104-toolkit-more.js 原文。

窗口桥收尾 —— 需要你指定范围，或先放着