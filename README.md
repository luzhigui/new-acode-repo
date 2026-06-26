# 光明顶 5v5 对战 —— 项目大纲

版本: V3.1.6 | 更新: 2026-06-26
目标: 让新 AI / 开发者 5 分钟内理解项目结构、核心逻辑、测试体系

---

## 1. 项目定位

- 类型: 5v5 回合制自走棋对战（明教 vs 六大派）
- 核心机制: 九宫格站位、自动战斗、每 3 回合选 1 个海克斯 Buff、精英敌人特殊技能
- 代码规模: 33 个 JS 模块，总行数约 7200+

---

## 2. 目录结构

```
├── core/                         # 战斗引擎核心
│   ├── 01config-5v5-test.js      # 全量配置（M值、Buff参数、阵容模板）
│   ├── 02unit.js                 # Unit 类（含克隆、初始化、职业加成）
│   ├── 03battle-utils.js         # 纯函数工具（伤害计算、站位判定、闪避）
│   ├── 04buff-system.js          # Buff 效果统计、攻击前/后钩子
│   ├── 05battle-horse.js         # 拒马生成与销毁
│   ├── 06battle-engine-core.js   # 单回合 + 完整战斗循环（核心）
│   └── 07battle-engine-5v5-test.js # 入口，挂载全局函数
├── player/                       # 玩家 UI 与战斗播放
│   ├── 08player-text.js          # 回合日志文本渲染
│   ├── 09player-buff-ui.js       # Buff 选择弹窗
│   ├── 10player-core.js          # 战斗播放核心（回合播放、胜利动画）
│   └── 11battle-player-5v5-test.js # 播放入口（re-export）
├── ui/                           # 游戏主界面
│   ├── 12main-utils.js           # 封面版本显示、弹窗工具
│   ├── 13main-5v5-test.js        # 主控制器（选关、站位调整、光带）
│   └── 14ui-render-5v5-test.js   # 九宫格渲染、详情弹窗
├── fx/                           # 特效动画
│   ├── 15fx-common-5v5-test.js   # 弹幕、伤害浮动、闪避、治疗
│   ├── 16fx-arrows-5v5-test.js   # 远程箭矢
│   ├── 17fx-crash-5v5-test.js    # 近战撞击、飞行模式
│   ├── 18fx-position-swap.js     # 换位动画
│   ├── 19fx-push-back.js         # 击退动画
│   └── 20fx-dodge-bullet.js      # 子弹时间闪避
├── modules/                      # 独立模块
│   ├── 23elite-skills.js         # 精英技能（灭绝双剑、九阴、玄冥、鹿角、苦练/新婚/性奋）
│   ├── 24error-capture.js        # 全局错误捕获面板
│   └── 28audio-manager.js        # BGM / SFX 音效管理
├── tests/                        # 测试与诊断
│   ├── 25unit-tests.js           # 单元测试（基础函数 + 部分 Buff）
│   ├── 27auto-battle-utils.js    # 自动批量战斗（生成快照、自动选 Buff）
│   ├── 29health-rules.js         # 体检规则库（约 70 条）
│   ├── 35quiz-bank.js            # 题库（问答小游戏）
│   ├── 37health-core.js          # 体检核心（自动切关、执行规则、生成报告）
│   └── 38health-ui.js            # 体检 UI 交互（标签页、进度、历史）
├── tools/                        # 开发工具
│   ├── 00build-5v5.cjs           # 构建脚本
│   ├── 26codex-v2.1.js           # 开发协同标准
│   ├── 30test-runner.html        # 全面体检 + 单元测试 + 答题一体化页面
│   ├── 31function-copier.html    # 函数复制器
│   ├── 32auto-battle.html        # 自动战斗工具
│   ├── 33first-aid-kit.html      # 开发急救包（代码诊断）
│   ├── 34file-copier.html        # 文件复制器
│   └── 35fang-calc.html          # 防战系数计算器
├── assets/                       # 音频资源
├── 00index.html                  # 开发工具箱首页
├── mode-5v5-test.html            # 游戏主页面
├── README.md                     # 本文件
└── CHANGELOG.md                  # 更改履历
```

---

## 3. 核心数据流（一回合）

```
runBattleRound(state)
  ├─ 克隆存活单位（A, B）
  ├─ 回合开始：快乐回血、玄冥毒发、生成拒马、授予性奋
  ├─ 计算 Buff 加成（含 Carry 死亡翻倍，排除拒马）
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
| MING_M | 明教角色 M 值（张无忌 115，韦一笑 107，殷天正/杨逍/范遥 104，弟子 95） |
| ENEMY_M | 六大派角色 M 值（空闻 104，弟子 95，精英 107~112） |
| FANG_LEVELS / FANG_K | 防战伤害查表（防御/M 值对应 K 系数） |
| BUFF_DURATION | 海克斯持续 4 回合 |
| BUFF_CHOICES | 每次可选 3 个 Buff |
| MAX_ROUND | 35 回合平局 |
| BUFFS | 所有海克斯参数（概率、加成、特效） |
| ENEMY_SQUADS | 每关敌方阵容（含精英对象） |
| ENEMY_POS_TEMPLATES | 每关站位模板（角色→位置列表） |
| ELITE_SKILLS | 精英技能参数（含宋周联动） |

---

## 5. 测试与体检体系

### 5.1 单元测试（tests/25unit-tests.js）
- 覆盖: calcDamage, getFronts, isBlocked, getFlyDodgeRate, 位置工具, computeBuffStats（含 Carry 多种场景）
- 缺失: 精英技能、拒马、张无忌切换、联动技能 → 待补充

### 5.2 全面体检（tools/30test-runner.html）
- 流程: 自动加载游戏 iframe → 等待模块初始化 → 点击封面 → 依次切换关卡（1~6） → 执行约 70 条健康规则 → 生成报告
- 规则分组: 启动加载、九宫格、血条属性、Buff、状态样式、音效、特效、精英、数据一致性、核心参数/公式、引擎、日志、站位

### 5.3 开发急救包（tools/33first-aid-kit.html）
- 静态代码扫描，检测常见问题：阵亡站位污染、getElementById 空值检查、var 声明、超大函数等

### 5.4 历史记录
- 体检结果存入 localStorage（最多 50 条）
- 答题小游戏（题库可扩充）

---

## 6. 开发者快速上手

1. 运行游戏: 浏览器打开 `mode-5v5-test.html`（需 Live Server 支持 ES Module）。
2. 运行体检: 浏览器打开 `tools/30test-runner.html`，点击"全面体检"。
3. 调试战斗: 在浏览器控制台执行 `window.runBattle(snapshot, buffs)` 可单次模拟。
4. 修改配置: 直接编辑 `core/01config-5v5-test.js`，所有数值、阵容、Buff 参数集中管理。
5. 添加新 Buff: 在 01config 的 BUFFS 中定义，并在 `04buff-system.js` 中实现效果。
6. 添加新精英: 在 01config 的 ELITE_SKILLS 定义参数，在 `23elite-skills.js` 实现逻辑，在 `06battle-engine-core.js` 中调用。

---

## 7. 已暴露的全局接口

- `window.selectStage(stageNumber)` —— 切换关卡并重置战斗
- `window.doManualReset()` —— 手动重置当前关卡
- `window._getPlayerContext()` —— 返回当前游戏上下文
- `window.runBattle(snapshot, buffs)` —— 单次模拟战斗
- `window._updateGlowColors(stage)` —— 更新光带颜色
- `window._refreshGlowCells()` —— 刷新光带格子

---

## 8. 附录：常用命令

```bash
# 启动本地服务
python3 -m http.server 8080
# 访问 http://localhost:8080/00index.html 进入开发工具箱
# 访问 http://localhost:8080/mode-5v5-test.html 进入游戏
```