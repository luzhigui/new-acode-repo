# 光明顶 5v5 - 更改履历

## V5.1.0 — 2026-07-13 ~ 2026-07-20

### 版本与文档
- **版本号统一升级到 V5.1.0**：00index.html、mode-5v5-test.html、README.md、kaifazhunze.md、game-design.md 以及 core/01-07/47/48/49、fx/15-20、modules/23/24/28/46、player/08-11、tests/25/30/37/38/45/46/60-68、tools/27/32/33、ui/12-14/39-44 等 58 个文件全部从 V5.0.x 升级到 V5.1.0，覆盖战斗引擎、播放器、UI、特效、体检、工具链全链路
- **新增核心模块文件**
  - `core/47battle-attack.js`：攻击流程编排模块，负责按步骤调用目标选择、命中判定、伤害计算、结果应用、日志构建，并处理连击/性奋/联动等递归攻击
  - `core/48battle-round.js`：回合循环与生成器模块，从 `core/06battle-engine-core.js` 拆分，负责整回合的 buff 结算、拒马召唤、单位行动轮询与胜负判定
  - `core/49battle-attack-steps.js`：攻击步骤拆分模块，从 `core/47battle-attack.js` 拆分，提供 `selectAttackTarget`、`resolveAttackHit`、`calcFinalDamage`、`applyAttackResult`、`buildAttackGroup` 等纯步骤函数
  - `modules/46global-store.js`：新增全局状态管理模块，统一收敛原先散落在 `window._*` 上的全局变量
- **`game-design.md` 大更新**：新增小昭专属体系（蝶变、永久海克斯、海克斯强化对比表）、全局状态管理章节、行动规则补充 `_stunned` 处理、严阵以待/圣火令/热血奋战/巨马阵/流星赶月/乘風突袭等 Buff 数值与规则同步 V5.1.0
- **README.md 同步**：补充 V5.1.0 版本说明与开发准则更新

### 全局状态管理收敛（modules/46global-store.js）
- 新增 `GlobalStore`：`getState` / `setState` / `subscribe` / `on(key, fn)` / `effect(key, fn)` / `get(key)` / `set(key, value)`，支持按 key 订阅与副作用
- 收敛的全局变量包括：`fastForwardActive`、`voteScore`、`voteChoice`、`battleHasZhang`、`bugMode`、`crashMode`、`currentBattleState`、`battleStore`、`forceXiaoZhao`、`skipBuffPopup`、`battleEvents`、`gs`
- 兼容层已移除，统一通过 `GlobalStore.get/set` 读写状态；`window.GlobalStore = GlobalStore` 保留供旧代码无缝迁移
- 涉及文件：`modules/46global-store.js`、`ui/13main-5v5-test.js`、`ui/39main-state.js`、`ui/40main-dialogs.js`、`ui/41main-battle.js`、`ui/43fx-trigger.js`、`ui/44ui-controls.js`、`player/08player-text.js`、`player/09player-buff-ui.js`、`player/10player-core.js`、`fx/15fx-common-5v5-test.js`、`fx/16fx-arrows-5v5-test.js`、`fx/17fx-crash-5v5-test.js`、`modules/23elite-skills.js`、`core/04buff-system.js`、`core/48battle-round.js`、`core/49battle-attack-steps.js`

### 战斗引擎拆分（core/47/48/49）
- `core/47battle-attack.js` 职责收窄为“攻击流程编排”：不再内含具体步骤实现，改为 `import` `core/49battle-attack-steps.js` 中的 5 个步骤函数，并负责连击/性奋/玄冥二老联动/小昭永久连击等递归调用
- `core/49battle-attack-steps.js` 新增并导出：
  - `selectAttackTarget`：目标选择（含成昆幻影伪装、小昭永久惑人心智）
  - `resolveAttackHit`：未命中 + 闪避判定（含韦一笑吸血、眩晕、反击致死）
  - `calcFinalDamage`：伤害计算（战士破防、防战坚盾、混元霹雳、叛逆突袭、鹿角杖法、伤害修正）
  - `applyAttackResult`：应用伤害结果（击杀、战士斩杀、成昆幻影变身、拒马反伤、严阵以待反弹）
  - `buildAttackGroup`：构建 `attack-group` 日志并触发攻击后效果
- `core/48battle-round.js` 从 `core/06battle-engine-core.js` 拆出完整回合生成器 `createRoundStepper`，包含回合开始 buff 结算、玄冥毒、拒马召唤、苦练、概率连击、行动轮询、回合结束清理
- `core/06battle-engine-core.js` 与 `core/07battle-engine-5v5-test.js` 移除 `runBattle` 导出，播放器改为直接使用 `createRoundStepper` 逐步推进战斗
- 涉及文件：`core/47battle-attack.js`、`core/48battle-round.js`、`core/49battle-attack-steps.js`、`core/06battle-engine-core.js`、`core/07battle-engine-5v5-test.js`、`tools/27auto-battle-utils.js`、`ui/13main-5v5-test.js`、`ui/41main-battle.js`

### 海克斯系统大更新（2026-07-17）
- **新增「小昭海克斯强化」机制**：小昭在场时，部分团队海克斯会获得强化效果；团队海克斯过期后，小昭可继承对应的永久弱化版。强化参数统一收敛到 `CONFIG.ELITE_SKILLS.xiaoZhao.hexEnhance`
  - 概率连击：普通 80% → 小昭强化 100% 必连击，且被遮挡单位可无视遮挡进攻
  - 你就是 carry：普通仅 5 号位 → 小昭强化 4/5/6 号位同步享受；过期后小昭自身固定两层精通加成
  - 流云身法：普通仅未行动单位闪避 → 小昭强化无视行动状态均闪避；过期后小昭自身永久闪避且无视职业
  - 圣火令：普通随机两列攻 + 两行防 → 小昭强化额外给自己 +30% 攻防；过期后每回合仅给自己 +30% 攻防
  - 巨马阵：普通 0/5/25 巨马 → 小昭强化 0/30/30 巨马，且攻击巨马者受 5 点反伤；过期后小昭每回合自己召一匹普通巨马
  - 流星赶月：普通溅射 50% → 小昭强化溅射命中后攻击者每命中 1 人额外 +2 攻；过期后小昭远程且拥有普通流星赶月时生效
  - 嗜血狂刀：普通战士吸血 80% → 小昭强化吸血后再补一刀，斩杀线 15% → 20%；过期后小昭战士且拥有普通嗜血时生效
  - 严阵以待：普通反弹 50% 伤害差 → 小昭强化反弹同时恢复等量生命；过期后小昭防战且拥有普通严阵时生效
  - 乘風突袭：普通飞行 80% 波及 / 60% 击退 → 小昭强化 100% 波及 / 80% 击退；过期后小昭飞行且拥有普通乘風时生效
  - 热血奋战：普通恢复已损失 15%、每 3 次翻倍 → 小昭强化 20%、每 2 次翻倍；过期后小昭单独拥有强化版
  - 惑人心智：普通 80% 乱敌方 / 40% 乱己方、持续 2 回合 → 小昭强化 95% / 50%、持续 3 回合；过期后小昭自身 15% 永久惑心
- **圣火令重构**：从原来的单 `col`/`row` 改为 `cols`/`rows` 数组（随机两列攻 + 两行防），`logBuffSummary` 与 `computeBuffStats` 同步支持多列多行；选择海克斯时 `holyFlame` 自动生成不重复的 `cols`/`rows`
- **严阵以待**：首次选择海克斯时不再出现，必须等待已有 Buff 剩余回合 > 0 后才可刷出
- **巨马阵**：属性改为 0 攻 / 5 防 / 25 血；小昭强化时改为 0/30/30；召唤位置不再考虑敌方站位，使用 Fisher-Yates 洗牌保证真随机
- **热血奋战**：普通版恢复已损失生命 15%，每 3 次翻倍；小昭强化版 20%，每 2 次翻倍
- **乘風突袭/流星赶月/惑人心智/严阵以待/你就是 carry**：全部接入 `getXiaoZhaoHexEnhance` 读取强化参数
- 涉及文件：`core/01config-5v5-test.js`、`core/04buff-system.js`、`core/05battle-horse.js`、`modules/23elite-skills.js`、`ui/41main-battle.js`、`ui/14ui-render-5v5-test.js`

### 倍速逻辑调整
- 速度档位数值全面调整（延迟值）：原 `500/250/71/125/1800` → 新 `1000/600/100/300/1600`
  - 0.5x：`1800ms` → `1600ms`
  - 1x：`500ms` → `1000ms`（取消高亮任何按钮）
  - 2x：`250ms` → `600ms`（默认进入战斗后自动锁定 2x 高亮）
  - 4x：`125ms` → `300ms`
  - 7x 按钮改名为 8x，延迟 `71ms` → `100ms`
- 快进状态统一走 `GlobalStore.get/set('fastForwardActive')`，替换所有 `window._fastForwardActive` 直接读取
- 滚动降速逻辑同步新阈值：`1800` → `1600`
- 涉及文件：`ui/44ui-controls.js`、`player/10player-core.js`、`player/08player-text.js`、`fx/15fx-common-5v5-test.js`、`fx/16fx-arrows-5v5-test.js`、`ui/43fx-trigger.js`、`ui/13main-5v5-test.js`

### 攻击弹窗位置确认与优化
- 新增/优化 `showAtkBuffFloat`（`fx/15fx-common-5v5-test.js`）：飘字内容从「攻+N」改为「+N」，水平位置左移、zIndex 提升到 `10004`，解决加攻弹幕被遮挡问题
- 播放器 `handleInfo` 识别「乾坤衍生：攻击+」日志，延迟 180ms 触发 `showAtkBuffFloat`；同时识别白骨爪触发的衍生加攻也弹出加攻弹幕
- 涉及文件：`fx/15fx-common-5v5-test.js`、`player/10player-core.js`

### UI 渲染优化（ui/13、ui/14、ui/39-44）
- **`ui/14ui-render-5v5-test.js`**
  - 角色图标增加眩晕状态 `💫`（未死亡时优先显示）
  - 防御显示改为基于 `_baseDef` 计算加成，解决坚盾叠加后防御显示异常
  - 成昆幻影伪装新增 `_phantomFlash` 闪烁动画
  - 详情弹窗宋青书技能描述改为读取 `CONFIG.ELITE_SKILLS` 实时数值
  - `spawnVictoryEffects` 胜利弹幕只在 `ctx.gs === 'GAMEOVER'` 时写入日志，修复战斗结束后错误追加台词
- **`ui/40main-dialogs.js`**
  - 战报弹窗增加防残留：游戏不在 `GAMEOVER` 状态时不创建弹窗
  - 关闭战报后改为隐藏并生成右下角浮动 📊 按钮，可恢复查看；游戏重置为 `IDLE` 时自动销毁
  - 投票选择改用 `GlobalStore.set('voteChoice', choice)`
- **`ui/41main-battle.js`**
  - 移除 `runBattle` 导入，战斗由播放器逐步驱动
  - `forceXiaoZhao`、`bugMode`、`battleHasZhang` 统一走 `GlobalStore`
  - 强制小昭替换入队时继承被替换单位的 `pos`，不再置为 `null`
  - 新增 `showBugModeBuffSelection`，Bug 模式下可选全部 Buff
  - 圣火令选择时生成 `cols`/`rows`
- **`ui/39main-state.js`**：`setState.gs` 写入时同步到 `GlobalStore.set('gs', v)`
- **`ui/43fx-trigger.js`**：`fastForwardActive` 走 `GlobalStore`
- **`ui/13main-5v5-test.js`**
  - 导入 `modules/46global-store.js`，移除 `runBattle` 导入
  - 所有 `window._voteScore`、`_voteChoice`、`_battleHasZhang`、`_debugMode`、`_crashMode`、`_forceXiaoZhao`、`_fastForwardActive`、`_skipBuffPopup` 改为 `GlobalStore`
  - 新增 `initBugAndXiaoZhaoModes` 并在 DOM 就绪前/后双保险执行
  - `GAMEOVER` 与重置时清理战报弹窗、浮动按钮、投票浮动按钮、Buff 浮动按钮、所有弹幕
  - 复制日志时支持 innerText 兜底、Buff 获取日志保留、过滤规则优化
- 涉及文件：`ui/13main-5v5-test.js`、`ui/14ui-render-5v5-test.js`、`ui/39main-state.js`、`ui/40main-dialogs.js`、`ui/41main-battle.js`、`ui/42audio-control.js`、`ui/43fx-trigger.js`、`ui/44ui-controls.js`

### Buff 系统修复（core/04）
- `computeBuffStats` 圣火令计算改为基于 `cols`/`rows` 数组，并接入小昭强化
- `carry` 加成位置条件放宽：原仅 5 号位，现当小昭在场时 4/5/6 号位均可享受
- 严阵以待防御加成仅对友方生效，避免敌方也吃到
- 流云身法闪避仅对友方生效
- `applyBuffEffectsBeforeAttack` 惑人心智概率在小昭在场且无 `mindControl_xiaoZhao` 标记时提升为 95% / 50%
- `applyBuffEffectsAfterAttack` 热血奋战、乘風突袭、流星赶月全部接入小昭强化参数
- 流星赶月溅射目标侧修正：当目标因惑心等效果与我方同阵营时，溅射正确作用到对应阵营
- 小昭永久圣火令直接给自己加攻防
- `logBuffSummary` 支持多列多行圣火令展示，并识别团队与小昭圣火令重叠
- 涉及文件：`core/04buff-system.js`

### 精英技能调整（modules/23）
- **九阴白骨爪**：使用 `GlobalStore.get('currentBattleState')` 判断张无忌是否存活；触发后调用 `GlobalStore.flushBattleEvents()`；无张无忌时小昭衍生技仅在小昭未眩晕时触发；攻击增益同时更新 `_baseAtk`
- **宋青书回血**：每次白骨爪触发时，宋青书恢复等量的生命（敌方阵营时找宋青书）
- **叛逆突袭**：真实伤害比例从 `10%` 提升到 `12%`（`CONFIG.ELITE_SKILLS.rebelStrike.currentHpRatio`）
- **性奋惩罚**：仅在 `_xingFenActive` 激活时扣减最大生命，且从第 1 次攻击就开始计数扣减
- **苦练**：属性加成改为 `+1.5 攻 / +0.5 防 / +2 血上限`（配置化）
- **新婚快乐**：回血百分比序列从 `[0.16, 0.08, 0.04, 0.02, 0.01]` 调整为 `[0.16, 0.10, 0.06, 0.03]`
- **小昭蝶变**：每回合随机变职业，但不会与上回合重复；记录精通职业并修正变身加成；每次变身 +5 生命上限
- **小昭衍生技**：张无忌在场时失效；小昭眩晕时不再触发；攻击增益更新 `_baseAtk`
- **成昆幻影伪装**：修复目标查找逻辑——被混淆的目标应在攻击者自己的阵营（`allySide`）中查找；被模仿者自身免疫该次伪装；攻击前清除旧的 `_phantomTarget`
- **小昭永久惑人心智**：触发概率从 `20%` 下调到 `15%`
- 新增 `getXiaoZhaoHexEnhance(allyTeam, activeBuffs, hexKey)` 统一读取海克斯强化配置
- 涉及文件：`modules/23elite-skills.js`、`core/01config-5v5-test.js`、`core/02unit.js`、`core/04buff-system.js`

### 单位与战斗状态
- `core/02unit.js`：新增 `_stunned` 字段标识本回合被闪避反击眩晕；`clone()` 同步拷贝
- `core/48battle-round.js`：行动轮询跳过 `_stunned` 单位并输出「被眩晕，无法行动」；被遮挡近战单位休息回血从 `10` 提升到 `20`；回合结束清理休息状态与定时器
- `core/49battle-attack-steps.js`：闪避反击成功后给攻击者设置 `_stunned = true`、`_acted = true`
- 涉及文件：`core/02unit.js`、`core/48battle-round.js`、`core/49battle-attack-steps.js`

### 播放器修复（player/09、player/10）
- `player/10player-core.js`
  - 恢复 `GAME_STATE_FIELDS` 常量，Store 同步 UI 时改为字段级 `syncFields`，不再整对象替换，解决状态字段遗漏
  - `playBattle` 改为基于 `c.snapshot` 启动，不再依赖 `c.UI.currentResult`
  - 注册 `GlobalStore.effect('fastForwardActive', ...)`，快进时把播放器速度提到 1ms、调度器 50 倍速；恢复时回到原速
  - `handleAttackGroup` 重要文本（战斗行、伤害行）保底常速 600ms，次要文本（波动、计算）按倍速 ×0.8；波动/计算/info/buff 行间增加 120ms 间隔防止连冲
  - 休息回血判断从「恢复 10」改为「恢复 20」
  - 闪避时不再把攻击者 `_acted` 强制设为 true，避免闪避后单位被错误标记为已行动
  - 战斗结束写日志、投票结算均增加 `c.gs === 'GAMEOVER'` 保护，防止战斗重开后残留写入
  - 投票积分、voteChoice、fastForwardActive 全部走 `GlobalStore`
- `player/09player-buff-ui.js`
  - `bugMode` 读取改为 `GlobalStore.get('bugMode')`
  - Buff 弹窗关闭后生成的浮动按钮在 `gs === 'IDLE'` 时自动销毁
  - `handleBuffLeech` 可在敌我双方中查找 `healUnitUid`
- `player/08player-text.js`
  - `playLineText` 增加 `forcedSpeed` 参数
  - 分隔符、系统信息、small 类提示文本直接显示不走逐字动画
  - 速度阈值调整为新倍速档位
  - 快进判断走 `GlobalStore`
- 涉及文件：`player/08player-text.js`、`player/09player-buff-ui.js`、`player/10player-core.js`

### 特效修复（fx/17、fx/19、fx/20、fx/15、fx/16、fx/18）
- `fx/17fx-crash-5v5-test.js`：`flyMode` 从 `window._crashMode` 改为 `GlobalStore.get('crashMode')`
- `fx/18fx-position-swap.js`、`fx/19fx-push-back.js`、`fx/20fx-dodge-bullet.js`：把原本依赖 `fx/15` 的 `getCellElement`、`wait` 改为本地定义，解除循环依赖；`wait` 的快进判断保留 `window._fastForwardActive` 本地兼容
- `fx/15fx-common-5v5-test.js`
  - 移除 `getCellElement` 与 `wait` 公共导出
  - `applyImpactShrink`、`showBoneClaw` 等使用 `GlobalStore.get('fastForwardActive')`
  - 加攻飘字位置、层级、文案优化
- `fx/16fx-arrows-5v5-test.js`：`showBoneClaw` 通过 `GlobalStore` 读取战场状态判断小昭是否在场
- 涉及文件：`fx/15fx-common-5v5-test.js`、`fx/16fx-arrows-5v5-test.js`、`fx/17fx-crash-5v5-test.js`、`fx/18fx-position-swap.js`、`fx/19fx-push-back.js`、`fx/20fx-dodge-bullet.js`

### 文件复制器与函数替换器路径同步
- `tools/32-toolkit.js`：ALL_PROJECT_FILES 增加 `core/49battle-attack-steps.js`、`modules/46global-store.js`、`to do list.md`；用户可选文件列表排除带空格的文件名
- `tools/33-toolkit-more.js`：TARGET_FILES 同步增加 `core/49battle-attack-steps.js`、`modules/46global-store.js`
- 涉及文件：`tools/32-toolkit.js`、`tools/33-toolkit-more.js`

### 其他修复
- **spawnVictoryEffects 变量修复**：`ui/14ui-render-5v5-test.js` 中 `spawnVictoryEffects` 原本错误使用未定义的 `c.gs`，改为 `ctx.gs`，避免 GAMEOVER 判断失效
- **`core/05battle-horse.js`**：巨马属性改为 0 攻 / 5 防 / 25 血；小昭强化时 0/30/30；召唤位置使用 Fisher-Yates 洗牌；不再把敌方位置计入占用
- **`tests/25unit-tests.js` / `tests/46health-utils.js`**：新增/同步小昭相关测试与健康检查规则
- **`00index.html` / `mode-5v5-test.html`**：版本号、脚本引用同步 V5.1.0

## V5.0.3 — 2026-07-09 ~ 2026-07-12
- **事件链路重构**（`core/06battle-engine-core.js`）：所有数据修改必发 emitEvent，击杀路径补齐 uidD/isDead，败方清零/拒马销毁/新婚扣血/Buff 效果全部补 emitEvent，确保 Store 与引擎状态同步
- **连击系统修复**（`core/06` + `core/04`）：K 值索引错位修正、连击每回合复位、连击 logo 改 🔗 与闪避 ⚡ 区分、连击 uid 同步 Store
- **闪避子弹时间重写**（`fx/20fx-dodge-bullet.js`）：大幅重写闪避特效，修复子弹时间触发与恢复逻辑
- **近身碰撞优化**（`fx/17fx-crash-5v5-test.js`）：重写碰撞检测与虚影蓝色化，修复手机端位置推算
- **击退特效改走 Store**（`fx/19fx-push-back.js`）：animatePushBack 不再直接操作 DOM，统一通过 Store 读取 alive 状态
- **播放器精简**（`player/10player-core.js`）：playBattle 大幅瘦身，移除冗余逻辑，胜利弹幕改用 Store 读取
- **体检系统大改**（`tests/`）：37health-rules/ 拆分为 60-68 独立规则文件；新增 38health-monitor.js（监控器）、45health-auto.js（自动体检）、46health-utils.js（工具函数）；删除旧 29health-rules.js、36runtime-sampler.js、38health-ui.js 答题部分
- **删除未使用特效**：移除 `fx/21fx-blood-slash.js`、`fx/22fx-fortify-counter.js`
- **删除 Test Runnerlogo.md**：00index.html 按钮事件一并清除
- **文件复制器优化**：一键序列发送第一包直接复制（无需再点一次）、弹窗显示当前包序号（非下一个）、GROUP_PROMPTS 精简提示词
- **新增文件**：`成功经验.md`、`to do list.md`

## V5.0.2 — 2026-07-08
- **统一 Store 状态管理**（多文件）：修复闪避/自动手动/重玩等 7 个 Bug，动画/换位/击退统一走 Store dispatch
- **击杀路径补齐字段**（`core/06` + `modules/23`）：所有击杀路径补 uidD 和 isDead，防止 Store 残留死单位
- **删除体检答题功能**：移除 `35quiz-bank.js`、`38health-ui.js` 答题部分、`30test-runner.html` 答题页签
- **文件复制器序列发送**（`tools/32-toolkit.js`）：一键序列发送改用 GROUP_PROMPTS 提示词，按主题分批
- **版本号升级**：全部代码文件统一为 V5.0.2

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