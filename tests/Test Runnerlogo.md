# Test Runner 迭代变更日志
记录测试与体检体系的版本迭代、新增检测项、功能优化、Bug修复等变更。

---

## V0.1.0 - 2026-06-25
### 新增
- 新增「🧮 核心数值校验」检测分组，共10项底层核心逻辑检测：
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
