# 光明顶 5v5 对战 —— AI 开发者项目大纲

版本: V3.1.3 | 更新: 2026-06-26
目标: 让新 AI / 开发者 5 分钟内理解项目结构、核心逻辑、测试体系与已知缺陷

---

## 1. 项目定位

- 类型: 回合制自走棋对战（明教 vs 六大派）
- 核心机制: 九宫格站位、自动战斗、每 3 回合选 1 个海克斯 Buff、精英敌人特殊技能
- 代码规模: 约 40 个 JS 模块，总行数约 8000+

---

## 2. 目录结构（关键文件）

```
├── core/                         # 战斗引擎核心
│   ├── 01config-5v5-test.js      # 全量配置（M值、Buff参数、阵容模板）
│   ├── 02unit.js                 # Unit 类（含克隆、初始化、职业加成）
│   ├── 03battle-utils.js         # 纯函数工具（伤害计算、站位判定、闪避）
│   ├── 04buff-system.js          # Buff 效果统计、攻击前/后钩子
│   ├── 05battle-horse.js         # 拒马生成与销毁
│   ├── 06battle-engine-core.js   # 单回合 + 完整战斗循环（核心）
│   └── 07battle-engine-5v5-test.js # 入口，挂载全局函数
├── modules/
│   └── 23elite-skills.js         # 精英技能（灭绝双剑、九阴、叛逆、玄冥、鹿角、苦练/新婚/性奋）
├── fx/                           # 特效动画（箭头、撞击、换位、击退、子弹时间）
├── player/                       # 玩家 UI（Buff 弹窗、选关、调整站位）
├── tools/                        # 开发工具
│   ├── 30test-runner.html        # 全面体检 + 单元测试 + 答题 + 反馈 一体化页面
│   ├── 25unit-tests.js           # 单元测试（基础函数 + 部分 Buff）
│   ├── 29health-rules.js         # 体检规则库（约 70 条）
│   ├── 37health-core.js          # 体检核心（自动切关、执行规则、生成报告）
│   └── 38health-ui.js            # 体检 UI 交互（标签页、进度、历史、反馈）
├── 27auto-battle-utils.js        # 自动批量战斗（生成快照、自动选 Buff）
├── 35quiz-bank.js                # 题库（默认 30 题 + 自定义存储）
└── mode-5v5-test.html            # 游戏主页面（需暴露 selectStage / doInitBattle）
```

---

## 3. 核心数据流（一回合）

```
runBattleRound(state)
  ├─ 克隆存活单位（A, B）
  ├─ 回合开始：快乐回血、玄冥毒发、生成拒马、授予性奋
  ├─ 计算 Buff 加成（含 Carry 死亡翻倍）
  ├─ 苦练优先行动（宋青书不占行动次数）
  ├─ 交替行动：按 pos 从小到大取未行动单位
  │   ├─ 若被遮挡 → 休息回血
  │   ├─ 否则 → processUnitAttack
  │   │   ├─ 选择目标（近战取前排，远程随机，宋青书取血量最高）
  │   │   ├─ 闪避判定（飞行基础 + Buff）
  │   │   ├─ 伤害计算（含防战特殊公式、精英加成、真伤）
  │   │   ├─ 应用攻击后效果（吸血、回血、溅射、击退、挂毒）
  │   │   ├─ 触发精英反击 / 九阴连击 / 新婚扣血
  │   │   └─ 概率连击 / 性奋 二次攻击
  │   └─ 标记 _acted = true
  ├─ 回合结束：拒马销毁、Buff 剩余回合 -1
  ├─ 判定胜负（一方全灭）或达到最大回合（平局）
  └─ 返回结果（更新状态、日志、胜者）
```

---

## 4. 关键配置速查（01config）

| 配置项 | 说明 |
|--------|------|
| MING_M | 明教角色 M 值（张无忌 115，韦一笑 107，弟子 95） |
| ENEMY_M | 六大派角色 M 值（空闻 104，弟子 95，精英 107~112） |
| FANG_LEVELS / FANG_K | 防战伤害查表（防御/M 值对应 K 系数） |
| BUFF_DURATION | 海克斯持续 4 回合 |
| MAX_ROUND | 35 回合平局 |
| BUFFS | 所有海克斯参数（概率、加成、特效） |
| ENEMY_SQUADS | 每关敌方阵容（含精英对象） |
| ENEMY_POS_TEMPLATES | 每关站位模板（角色→位置列表） |
| ELITE_SKILLS | 精英技能参数（含宋周联动） |

---

## 5. 测试与体检体系（tools/）

### 5.1 单元测试（25unit-tests.js）
- 覆盖：calcDamage, getFronts, isBlocked, getFlyDodgeRate, 位置工具, computeBuffStats（含 Carry 多种场景）
- 缺失：精英技能、拒马、张无忌切换、联动技能 → 待补充

### 5.2 全面体检（30test-runner.html）
- 流程：自动加载游戏 iframe → 等待模块初始化 → 依次切换关卡（1~6） → 执行约 70 条健康规则 → 生成报告（含失败修复建议）
- 规则分组：启动加载、九宫格、血条属性、Buff、状态样式、音效、特效、精英、数据一致性、核心参数/公式、引擎、日志、站位
- 已知缺陷：关卡切换依赖 window.selectStage，若未暴露则只能测第 1 关 → 需主开发配合暴露

### 5.3 历史记录与反馈
- 体检结果存入 localStorage（最多 50 条）
- 反馈记录同样本地存储
- 答题小游戏（题库可扩充）

---

## 6. 当前已知缺陷与待办（按优先级）

### 🔴 严重（阻塞功能）
1. 27auto-battle-utils.js：明教单位除张无忌、韦一笑外 pos 全为 null，导致自动战斗崩溃 → 已提供修复方案
2. 37health-core.js：关卡切换失败（依赖未定义的 window.selectStage） → 需主开发在 mode-5v5-test.html 暴露该函数，或提供 doInitBattle 备选

### 🟡 中等（影响准确性）
3. 04buff-system.js：Carry 日志依赖 window._currentBattleState，异步体检下数据可能错乱 → 改为参数传递
4. 29health-rules.js：部分规则（如 _xuanmingPoison 克隆测试）过于静态，可能误报 → 改为运行时检测或返回 null
5. 25unit-tests.js：缺少精英/拒马/联动测试 → 补充测试用例

### 🟢 低优先级（体验优化）
6. 体检报告可增加"性能"检测组（单回合耗时）
7. 支持自定义规则扩展（localStorage）
8. 战斗日志可导出为 JSON 用于离线分析

---

## 7. AI / 开发者快速上手指南

1. 运行游戏：浏览器打开 mode-5v5-test.html（需支持 ES Module）。
2. 运行体检：浏览器打开 tools/30test-runner.html，点击"全面体检"。
3. 调试战斗：在浏览器控制台执行 `window.runBattle(snapshot, buffs)` 可单次模拟。
4. 修改配置：直接编辑 01config-5v5-test.js，所有数值、阵容、Buff 参数集中管理。
5. 添加新 Buff：在 01config 的 BUFFS 中定义，并在 04buff-system.js 的 computeBuffStats / applyBuffEffects* 中实现效果。
6. 添加新精英：在 01config 的 ELITE_SKILLS 定义参数，在 23elite-skills.js 实现逻辑，并在 06battle-engine-core 中调用。

---

## 8. 关键接口（需主开发配合暴露）

- `window.selectStage(stageNumber)` —— 切换关卡并重置战斗。
- `window.doInitBattle()` —— 重新初始化当前关卡（备选）。
- `window._getPlayerContext()` —— 返回当前游戏上下文（已存在，保持稳定）。

---

## 9. 附录：常用命令（开发）

```bash
# 启动本地服务（任意方式）
python3 -m http.server 8080
# 访问 http://localhost:8080/tools/30test-runner.html
```

---

本大纲旨在让新 AI 或开发者快速定位代码、理解流程、知道哪里需要改。 如需具体修复代码补丁，请告知，可立即提供。