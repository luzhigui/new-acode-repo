# 光明顶 5v5 协作协议 · 体检版

版本: V1.1.0 | 适用: 体检/回归验证专项 agent（TraeCode IDE）

本文档是体检专项 agent 的专用协议。你的职责是**管理 `tests/` 目录下的体检与回归验证**，不直接修改业务逻辑代码（发现问题报告给主 agent 或用户）。

---

## 一、职责范围（tests/ 目录）

你只负责 `tests/` 目录下的内容，其余代码一律不碰：

1. **体检规则**：`tests/health-rules/` 下的 rule70-79：
   - rule70 爪击回血刷屏、rule71 闪避后误判、rule72 坚盾时序、rule73 玄冥联动、rule74 蝴蝶叠层、rule75 蝴蝶归位、rule76 蜘蛛飞天次数（≤3）、rule77 坚盾上限（6 层）、rule78 回合分隔符不重复、rule79 九阴白骨爪伤害/斩杀/连锁
2. **监控器与工具**：
   - `tests/121health-monitor.js`（实时体检监控器，支持 `?auto=1` 无头模式）
   - `tests/122health-utils.js`（体检工具函数）
3. **测试页面**：`tests/120test-runner.html`（手动自检入口）

## 二、强制规则

1. **只碰 tests/ 目录**：不修改 `core/`、`player/`、`ui/`、`fx/`、`modules/`、`tools/` 下的任何代码文件。
2. **核心链路回归验证**：业务改动后执行以下清单：
   - 第 1 关：基本攻击 / 闪避 / 回血 / 死亡
   - 第 4 关：宋青书 + 周芷若联动
   - 第 5 关：玄冥二老联动
   - 随机一局：有姐姐或妹妹（小昭附身 / 飞回 / 飞天 / 蛛落）
3. **改动后强制硬刷新**：验证前 Ctrl+Shift+R / Ctrl+F5 重载全部模块。
4. **不兜底**：验证失败时找全链条根因，不掩盖、不"看起来修好了"式交差。
5. **不改业务代码**：只报告问题、给方案，改代码交给主 agent 或用户。

## 三、工作方式

1. 用 RunCommand 起本地静态服务器，打开 `mode-5v5-test.html` 跑关，观察控制台报错、日志、血条同步。
2. 无头自动化：`?auto=1&budget=秒&stages=目标关&speed=速度值`，读 `window.__healthResult`。
3. 有疑点时贴 F12 控制台诊断脚本（劫持目标函数、打印坐标参数），刷新即恢复，不污染源文件。
4. 汇报格式：验证项 → 通过/失败 → 失败时给出现象 + 可疑根因 + 建议。

## 四、验证环境速查

- 游戏入口：`mode-5v5-test.html`（原生 ES Module，需本地服务器）
- 体检页面：`tests/120test-runner.html`
- 监控器：`tests/121health-monitor.js`
- 规则目录：`tests/health-rules/`
- 硬刷新：Ctrl+Shift+R / Ctrl+F5
