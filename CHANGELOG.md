# 光明顶 5v5 - 更改履历

## V3.1.4 — 2026-06-25
- **00index 开发工具箱默认收起**：工具箱按钮网格默认折叠，点击标题展开/收起
- **封面页模块版本显示修复**：`12main-utils.js` 动态导入路径补充子目录前缀，显示全部 25 个模块
- **防战攻击音效修复**：`28audio-manager.js` BGM 加载失败不再禁用所有音效，`sfxEnabled` 独立开关
- **Carry 日志显示加成数值**：`04buff-system.js` 日志摘要显示实际攻/防/血加成数值
- **Carry UI 立即更新**：`10player-core.js` carry buff-summary 处理时立即更新 UI 中 carry 单位属性
- **Buff 跑马灯效果修复**：`13main-5v5-test.js` 实现 drawLight/animate 函数，修复 lightsOn 永不激活的 bug
- **子弹时间多项修复**：黑幕加深至 0.92、攻击者/被攻击者增加光晕、跳过按钮定位右下角、超时延长至 30s、漫画气泡中文字体
- **胜利后格子台词**：`10player-core.js` 存活单位依次说出胜利台词
- **虚影/飞走模式修复**：飞走模式不留"空"字、虚影模式留下半透明虚影
- **日志滑动灵敏度提高**：`13main-5v5-test.js` 手动滚动阈值从 10px 降至 2px

## V3.1.3 — 2026-06-25
- **修复 Carry Buff 两大 Bug**：
  - 敌方吃到 Carry 加成：`01config-5v5-test.js` carry 配置加 `target: 'ally'`，仅己方可用
  - 张无忌血量无限叠加：`06battle-engine-core.js` Carry HP 加成改为基于 `_baseMaxHp` 计算，防止每回合膨胀
  - `06battle-engine-core.js` `allyTeamWithDead` 去重改为兼容写法（`findIndex` → `seen` 对象）
  - `04buff-system.js` `computeBuffStats` 中 carry 增加 `unit.camp === 'ally'` 防御性检查
- **修复体检路径**：`30test-runner.html` 移入 `tools/` 后，`37health-core.js` 游戏页面路径从 `tools/` 往根目录找

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