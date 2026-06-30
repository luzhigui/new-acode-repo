# Test Runner 迭代变更日志

记录测试与体检体系的版本迭代、新增检测项、功能优化、Bug修复等变更。

---

## 快速入口

- **测试与诊断中心**: 打开 `tests/30test-runner.html`
- **核心测试**: 5个自动化测试（引擎、伤害、Buff、日志、站位）
- **全面体检**: 约70条健康规则，覆盖6个关卡，按12个分组执行
- **答题模式**: 25道光明顶知识题，即时反馈

---

## 体检规则分组（12组）

| 分组 | 数量 | 说明 |
|------|------|------|
| 启动与加载 | 3条 | 引擎挂载、音效模块、错误捕获面板 |
| 九宫格基础 | 6条 | 格子数量、data-pos、阵营归属 |
| 血条与属性 | 8条 | 血量显示、攻击/防御值、等级颜色 |
| Buff 系统 | 5条 | Buff属性加成、槽位显示、时效扣减 |
| 状态样式 | 4条 | 攻击闪蓝、防御闪金、阵亡灰度、锁定灰色 |
| 音效 | 3条 | AudioManager、职业音效、BGM切换 |
| 特效 | 5条 | 伤害数字、治疗数字、闪避、连击、溅射箭头 |
| 精英 | 6条 | 玄冥毒、宋青书、周芷若、成昆、灭绝双剑、韦一笑 |
| 数据一致性 | 5条 | 单位数、存活数、回合数、dmg统计、恢复回血 |
| 核心参数/公式 | 10条 | rand、calcDamage、isMelee、Unit.init、防战、applyBonus、行列、前排、遮挡、相邻 |
| 战斗引擎 | 4条 | runBattle、海克斯、restAfterRound、站位调整 |
| 日志与UI | 6条 | 日志输出、战斗日志、闪避日志、严阵日志、Carry日志、结算按钮 |

---

## 常见问题排查

| 问题 | 原因 | 解决 |
|------|------|------|
| 体检全红/视觉规则全失败 | iframe 隐藏导致 DOM 不渲染 | 确认 `37health-core.js` 中 `iframe.style.display = 'block'` |
| 体检一直"等待阵容初始化" | `waitCtx` 检查 `allyTeam.length >= 5`；`forceStopGame` 空阵容提前返回 | 确认 `forceStopGame` 空阵容时也重置了 `isPaused` |
| 第一关体检通过但其他关失败 | `safeSelectStage` 降级路径不触发 `doInitBattle` | 确认降级路径中调用了 `selectStage` |
| 答题快速连点重复计分 | `pointerEvents='none'` 设置太晚 | 确认在 class 检查之前就禁用点击 |
| 历史记录删除后索引错位 | 使用 `data-i` 索引，splice 后索引变化 | 改为使用 `data-id` 匹配 |

---

## 技术架构

```
tools/30test-runner.html        ← 测试入口页面（HTML骨架）
  ├── tests/38health-ui.js      ← UI交互逻辑（标签页、按钮、答题、历史）
  ├── tests/37health-core.js    ← 体检核心逻辑（iframe加载、关卡切换、规则执行）
  └── tests/29health-rules.js   ← 体检规则库（12组约70条规则）
```

### 关键全局接口

- `window._getPlayerContext()` — 返回当前游戏上下文（含 getter/setter 代理）
- `window.selectStage(n)` — 切换关卡并重置战斗
- `window.doManualReset()` — 手动重置当前关卡
- `window.runBattle(snapshot, buffs)` — 单次模拟战斗

---

## V4.0.1 — 2026-06-29

### 更新
- 同步版本号为 V4.0.1

## V4.0.0 — 2026-06-29

### 更新
- 入口路径修正为 `tests/30test-runner.html`
- 版本号统一为 V4.0.0

---

## V0.1.0 - 2026-06-25

### 新增
- 新增「核心数值校验」检测分组，共10项底层核心逻辑检测：
  1. rand() 随机数范围校验（闭区间整数）
  2. 基础伤害公式 calcDamage 正确性校验
  3. isMelee() 近战职业判断校验
  4. Unit.init() 单位属性分配范围校验
  5. 防战 init() 防御占比校验
  6. Unit.applyBonus() 职业属性加成校验
  7. 位置转行列函数（getUnitRow/getUnitCol）校验
  8. getFronts() 前排判定逻辑校验
  9. isBlocked() 遮挡判定逻辑校验
  10. getAdjacentPositions() 相邻位置计算校验

### 说明
- 所有检测项兼容现有体检框架，支持分组筛选、失败自动带修复建议
- 检测逻辑均基于代码设计预期反向推导，无主观误判，失败项均带可复现测试用例
- 本批次检测项需将 `03battle-utils.js` 核心工具函数挂载到 `window.BattleUtils` 后生效