# 光明顶 5v5 - 更改履历

## V5.0.1 — 2026-07-07
- **版本号统一**：全部代码文件版本号统一为 V5.0.1（详见版本清单）
- **文件复制器优化**：按主题分批发送（核心战斗 → 播放器 → UI → ...），每包前后添加分析提示词
- **文件列表同步**：移除6个不存在文件（00-*前缀），补充6个新增UI文件（39-44）
- **函数替换器同步**：TARGET_FILES 补充 42audio-control/43fx-trigger/44ui-controls

## V4.1.2 — 2026-07-06
- **九阴白骨爪重写**（`modules/23elite-skills.js`）：伤害改为「已损失生命 × 5%（张无忌在场时 8%）」+ 首次必触发、后续 88% 概率 + 连锁触发自己（chainProcChance 88%，最多 3 次）+ 血量 ≤10% 直接斩杀；日志加 `isClawHit` 标记供播放器触发特效
- **配置重写**（`core/01config-5v5-test.js`）：`nineYinClaw` 新增 `firstProcChance/procChance/chainProcChance/maxChain/lostHpRatio/jealousLostHpRatio/executeThreshold`，废弃 `bonusRatio/jealousBonus`
- **播放器接入白骨爪**（`player/10player-core.js`）：`handleInfo` 检测 `isClawHit` 后 fire-and-forget 调用 `showBoneClaw`（不 await、不设 isPaused，避免卡住播放器）
- **叛逆突袭改百分比**（`modules/23elite-skills.js`）：`getRebelTarget` 从绝对 hp 比较改为 `hp/maxHp` 百分比
- **死人不再行动**（`core/06battle-engine-core.js`）：行动循环开头加 `if (!unit.alive) continue;`，防止队列构建后被白骨爪斩杀/玄冥毒/反击打死的单位继续行动
- **拒马阵亡统一清理**（`core/06battle-engine-core.js`）：回合结束统一清理所有死拒马（含 destroyHorse 销毁的 + 被攻击致死的），emit unit-remove 并从 team 移除，避免堆积导致下回合 spawnHorse 同位、UI 残留
- **热血奋战检查 alive/满血**（`core/04buff-system.js`）：加 `unit.alive` 和 `hp < maxHp` 检查，死人不回血、满血不推日志（计数仍累加以保证翻倍节奏）
- **热血奋战 UI 血条同步**（`player/10player-core.js`）：hotBlood 分支补 `healUnit.hp` 更新与 `dispatch(SYNC_UNIT)`，修复飘数字但血条不动的 bug（DeepSeek 79b7bcc 丢失项补回）
- **精英技能 logo**（`ui/14ui-render-5v5-test.js`）：cell-name 加 🐾 周芷若 / 💥 宋青书 精英技能图标
- **白骨爪描述精简**（`ui/14ui-render-5v5-test.js`）：周芷若详情弹窗描述改为新机制一句话
- **分隔符逻辑**：按用户要求本次未改动，单独讨论

### V4.1.2 补记：DeepSeek 分支已重做覆盖的修复（历史履历同步）
> 以下修复原本在 DeepSeek 分支（c1736a1 孤儿覆盖事件中被切断的另一条历史线），经逐一对比确认 main 上已有等价或更好实现，补记于此保持履历完整。
- **carry 计算四处修复**（`core/06`、`core/05`）：删 `_baseMaxHp` 覆盖行修指数级叠加、spawnHorse 补 `_baseMaxHp` + carry 判断加 `!u.isHorse`、`allyTeamWithDead = A.slice()` 保留本回合毒死单位计死亡加成、删无忌豁免让其变身换后排按战士休息
- **惑人心智死锁修复**（`player/10`）：`handleBuffSwap` 改为 `await showBuffBanner` + `await animatePositionSwap` 后直接解 isPaused，不依赖 scheduler，消除死锁
- **战斗结束 mainCtx is not defined**（`player/10`）：循环外 `let mainCtx = window._getPlayerContext ? ...` 并带 null 保护
- **站位预览与实际不一致**（`tools/33`）：先按 ELITE_POOL.pos 画精英、再画模板（跳过已占位），与 generateSnapshot 对齐
- **闪避反击方向修正**（`core/06`）：resolveDodge 改为 `uidA:target.uid, uidD:unit.uid`，攻击者/防御者对调
- **叛逆突袭伤害位置调整**（`core/06`）：`getRebelDmgBonus` 放到 processUnitAttack 作用域，避免重复计算
- **emitEvent 事件系统**（`core/06`）：19 处调用 + helper + `group._events` 快照 + `_isAbsolute` 标记
- **miss 后仍检查连击/性奋**（`core/06`）：miss 分支不再提前 return
- **cloudBody 仅 ally**（`core/04`）：流云身法闪避只对己方生效
- **张无忌近战第 2 次第二句台词**（`core/06`）：`nearAtkCount === 2` 触发
- **删 07 冗余 window 挂载**（`core/07`）：33 个函数挂载移除，仅保留 `ALL_VERS` 版本串
- **站位对齐 config + 一致性检测**（`tools/27`、`tools/33`）：精英读 config pos、跑 generateSnapshot 比对
- **体检修复**（`tools/33`、`tests/`）：多回合状态对比、死亡标记、beforeAllies 时机、攻防公式

## V4.1.1 — 2026-07-06
- **白骨爪利爪对敌人**（`fx/16fx-arrows-5v5-test.js`）：新增 `showBoneClaw`，SVG 三道弯曲细长爪痕，整体 `rotate(angle)` 让爪尖朝向目标；凝结（放大浮现）→ 飞行（飞箭速度，不再旋转）→ 命中触发受击反馈
- **通用受击反馈函数**（`fx/15fx-common-5v5-test.js`）：`applyImpactShrink` 统一缩小+颤动+黄色短闪，飞箭/溅射/白骨爪/飞撞/近身通用
- **飞箭接入受击反馈**（`fx/16fx-arrows-5v5-test.js`）：`showRangedArrow` 受击改用 `applyImpactShrink(defCell, 300, ...)`；`showSplashArrows` 改用 `applyImpactShrink(defCell, 250, ...)`
- **飞撞/近身接入受击反馈**（`fx/17fx-crash-5v5-test.js`）：`showMeleeCrash` 和 `showCloseRangeFX` 受击改用 `applyImpactShrink`
- **虚影蓝色化**（`fx/17fx-crash-5v5-test.js`）：ghost 模式改为 opacity=0.5 + 蓝色背景 `rgba(30,100,255,0.28)` + 蓝色 border + 蓝色 boxShadow，保留明显视觉残留

## V4.0.2 — 2026-07-02
- **README 更新改代码展示规则**：去掉字节数示例括号、删除"改动点多优先贴完整函数"冗余段落，规则更精简
- **CHANGELOG 同步新增 V4.0.2 条目**
- **新增 game-design.md 游戏设计文档**

## V4.0.1 — 2026-06-29
- **修复BGM无声**：`BGM_LOCAL` 路径补上 `assets/` 前缀，`28audio-manager.js` 改用本地路径替代已删除的网络地址
- **README 补充改代码规则**：发代码必须「一组一旧一新」，超过3处询问后发完整文件不准省略
- **CHANGELOG/开发准则/Test Runner Logo 同步更新**

## V4.0.0 — 2026-06-29
- **大版本升级**：所有文件版本号统一为 V4.0.0，清理冗余注释
- **文件结构整理**：`27auto-battle-utils.js` 移入 `tools/`，新增 `36runtime-sampler.js`
- **文件复制器路径修正**：适配最新文件结构
- **README/开发准则/Test Runner Logo 更新**：同步最新版本信息

## V3.1.2 — 2026-06-25
- **第五关玄冥二老拆分**：鹿杖客（远程/玄冥神掌）+ 鹤笔翁（飞行/鹿角杖法）两个独立单位
- ENEMY_SQUADS[5] 人数 5→6，站位模板 random 2→3
- 新增体检规则：第五关敌方单位=6
- **修复新婚扣血 bug**：`applyXinHunDeduction` 传入 `enemySide`→`allySide`，宋青书攻击时能正确找到周芷若
- **精英怪技能描述补充**：鹿杖客/鹤笔翁/成昆详情弹窗改为双行描述
- 确认 `_kuaiLeStack` 在 `02unit.js` 构造函数和 `clone()` 中均已初始化
- 代码复制器更新：路径适配新文件夹结构，加入 35/37/38 新文件

## V3.1 — 2026-06-25
- **项目结构重组**：JS/HTML/资源文件按功能分入 `core/` `player/` `ui/` `fx/` `modules/` `tests/` `tools/` `assets/` 子文件夹
- **优化体检等待逻辑**：取消模拟 btnMain/投票/Buff 流程，改用 `doManualReset`/`window.selectStage` + `waitCtx`，解决超时
- **清空历史记录弹窗修复**：浏览器原生 `confirm` 替换为页面内自定义确认弹窗
- **下掉环境诊断页签**：游戏运行时已有内置报错弹窗，`30test-runner` 中的环境诊断页签移除（代码保留）
- **版本号统一升级**：`00index.html` → V3.1，`30test-runner.html` → V4.3，`37health-core.js` → V2.2，`38health-ui.js` → V2.2

## V3.0 — 2026-06-23
- 修复 `showDanmaku` 安全调用
- 修复 carry 阵亡加成计算
- 修复闪避血量显示

## V3.0 之前 (2026-06-20 ~ 2026-06-22)
- 体检功能上线：全面体检 + 历史记录 + 答题
- 流云身法闪避从 30% 调整为 25%，同步配置/测试/题库
- 环境诊断页签上线（后在 V3.1 下掉）
- 暴露 `window.selectStage`/`window.forceStopGame`/`window.doManualReset` 供 test runner 调用
- 单元测试扩展至 25 条
- 30test-runner 内联 JS 全部移入 38health-ui.js