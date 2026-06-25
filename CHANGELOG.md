# 光明顶 5v5 - 更改履历

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