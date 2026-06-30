
光明顶 5v5 对战

版本: V4.0.0 | 更新: 2026-06-29

类型: 5v5 回合制自走棋对战（明教 vs 六大派）| 九宫格站位、自动战斗、海克斯 Buff、精英技能

---

改代码展示规则（给 AI 助手用）

AI 助手在展示代码改动时必须遵守以下规则：

1. 小改动（≤3 处）

必须优先发前后对比。如果有多处改动，必须按「一组一旧一新」的格式展示：

· ✅ 正确：旧A → 新A，旧B → 新B，旧C → 新C
· ❌ 错误：旧A + 旧B + 旧C → 新A + 新B + 新C

2. 改动超过 3 处

先询问用户要不要发完整代码。询问时须告知完整代码的大概字节数（如"完整代码约 1200 字节，要发吗？"）。

3. 发完整文件必须完整，严禁省略

如果用户同意发完整文件，必须发出文件的全部内容，不允许有任何省略表述。既然是完整文件，那就一个字都不能少。

---

快速开始

直接用浏览器打开 mode-5v5-test.html 即可开始游戏。

---

目录结构

```
core/
  01config-5v5-test.js       - 全量配置（数值、角色、技能、BGM路径）
  02unit.js                   - 战斗单位类
  03battle-utils.js           - 战斗工具函数（伤害公式、站位判定等）
  04buff-system.js            - Buff系统（计算加成、触发效果）
  05battle-horse.js           - 拒马逻辑（生成、销毁）
  06battle-engine-core.js     - 战斗核心循环（回合推进、攻击处理）
  07battle-engine-5v5-test.js - 战斗引擎入口（全局函数挂载、导出）

player/
  08player-text.js            - 文字播放器（逐字显示日志）
  09player-buff-ui.js         - Buff弹窗与横幅
  10player-core.js            - 战斗播放器核心（日志解析、动画调度）
  11battle-player-5v5-test.js - 播放器入口（导出汇总）

ui/
  12main-utils.js             - 主控工具函数（弹窗、版本号）
  13main-5v5-test.js          - 主控模块（状态管理、按钮事件、战斗启动）
  14ui-render-5v5-test.js     - UI渲染模块（九宫格、血条、Buff图标）

fx/
  15fx-common-5v5-test.js     - 基础特效池（飘字、弹幕、横幅）
  16fx-arrows-5v5-test.js     - 飞箭特效（远程攻击、流星溅射）
  17fx-crash-5v5-test.js      - 飞撞与格挡特效（近战攻击、闪避、未命中）
  18fx-position-swap.js       - 换位闪烁特效
  19fx-push-back.js           - 击退特效
  20fx-dodge-bullet.js        - 闪避反击子弹时间特效
  21fx-blood-slash.js         - 嗜血狂刀特效
  22fx-fortify-counter.js     - 严阵以待反击特效

modules/
  23elite-skills.js           - 精英技能系统（灭绝、周芷若、宋青书、成昆、玄冥二老）
  24error-capture.js          - 全局错误捕获面板
  28audio-manager.js          - 音频管理器（BGM切换、音效播放）

tests/
  25unit-tests.js             - 核心函数单元测试
  29health-rules.js           - 体检规则库（70+条规则）
  30test-runner.html          - 测试与诊断中心页面
  35quiz-bank.js              - 题库（25道）
  36runtime-sampler.js        - 运行时采样器
  37health-core.js            - 体检核心逻辑
  38health-ui.js              - 体检UI交互

tools/
  00build-5v5.cjs             - 构建脚本（打包为单文件）
  27auto-battle-utils.js      - 自动批量战斗工具
  31-toolkit.html             - 开发工具箱页面
  32-toolkit.js               - 工具箱主逻辑（文件复制器、函数替换器等）
  33-toolkit-more.js          - 工具箱附加工具（急救包、防战计算器、自动战斗）

assets/
  sfx_arrow.mp3               - 远程攻击音效
  sfx_fly.mp3                 - 飞行攻击音效
  sfx_melee.mp3               - 近战攻击音效
  sfx_xinai.mp3               - 背景音乐

根目录
  00index.html                - 开发集成入口
  mode-5v5-test.html          - 主游戏页面
  README.md                   - 项目说明（本文件）
  CHANGELOG.md                - 变更履历
  kaifazhunze.md              - 开发准则
  Test Runnerlogo.md          - Test Runner 迭代变更日志
```

---

测试与体检

打开 tests/30test-runner.html 进入测试与诊断中心。

---

开发工具箱

打开 tools/31-toolkit.html 使用开发工具箱