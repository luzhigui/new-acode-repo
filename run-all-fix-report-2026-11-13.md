# run-all 修复报告（2026-11-13 · 当前真实状态）

> 接手体检模块，按交接 spec 执行：先跑 run-all 存输出 → 逐项分类 A/B/C → 修 A/B/env → 报 C → 恢复门禁。
>
> ⚠️ **本报告是第二轮修订版**。第一轮我写的「8 项行为红 + 1 项 ENV」已**过期**——第一轮跑完后，平行「体检」会话又把 `tests/run-all.mjs` 抬到 V1.54.0（新增 `--jobs N`）、新增/挪动了一批守门、并重录了 `xinhun-death-case.json` 基线、给「寒离飒」加了专属海克斯 `hlsPower1`（core/infra/content/modules 全改）。**当前红项清单与根因都已变化**，以下以本轮（含平行会话 WIP 的工作树）真实 re-run 为准。

## 一、当前真实结果

```
node tests/run-all.mjs  →  EXIT=1
结果：18/27 通过，耗时 440.9s，9 项红（CHECKS）
```

- **ENV 类（我第一轮修的）已清零确认**：`牙口证据链对账 rule-teeth-evidence` 现显示 `✅（仅本地跳过：变异树产物缺失）`，不在 9 红内。修复 commit `3c79bbd7` 双推 `gh-ssh`+`gitee` 有效。

## 二、当前 9 项红 · 分类（按性质）

| # | 检查名 | 分类 | 当前根因（日志实测） | 归属 | 我能动吗 |
|---|---|---|---|---|---|
| 1 | 规则回放(20seed×7关) | **C + B** | 28 条规则失败；转交中 6 条（已知转交不计退码）；其余多为引擎行为漂移 | 引擎 + 规则登记 | 仅 B 部分（规则侧逐条） |
| 2 | 胜负基线闸门(18场) `140-baseline` | **C（渲染真 bug）** | 当前红因 `render/403 renderGrid` 误删 `effectiveFlyMode` 定义行 → 开屏 `ReferenceError`（no-undef 雷） | 渲染层 | ❌ 越界，须主代码/体检修 |
| 3 | 账本对照(声明vs实际) | **B / 待查** | `偏差 0` 但仍红（歧义跳过 6 / 或另有子断言触发；数值口径已归零，非数值偏差类） | 测试侧检查 | ✅ 但需先查具体子断言 |
| 4 | 对照器守卫自检(离线) | **C** | ⑤ 2 颗牙的守卫契约恒空转（A5→`METEOR_GROWTH`、T3→`METEOR_GROWTH`），守的是死契约 | 引擎机制 | ❌ |
| 5 | 契约绑定键漂移自检(离线) | **C** | ③ 契约 `METEOR_GROWTH` 绑定的账本 group `meteorSplashGrowth` 在标准样本账本零出现 → 机制改名/撤除/本场不出场 | 引擎机制 | ❌ |
| 6 | 判据分支级空转自检(离线) | **B + C** | 10 项判据分支掉牙（基线棘轮）：部分因引擎行为变化（规则不再触发）=C，部分因抽取口径/指纹漂移=B | 混合 | 仅 B 部分（指纹/抽取口径） |
| 7 | 版本常量漂移自检(离线) | **B** | 某文件 `VER` 常量 ≠ 版本日志（或冒出无日志新孤儿）。14 项断言全在 `tests/`，纯测试侧 | 测试侧 | ✅ |
| 8 | 覆盖率/空转红线 | **下游级联** | 自身仅 `trig===0` 时红；当前红为 #1 失败的级联 | 随 #1 解 | 随 #1 |
| 9 | 翻译层 golden 对照 | **A / B** | `RESULT: 有差异`，首个差异字节 460（长度 12.0M vs 17.5M）→ golden 过期需重录(A) 或引擎改了输出(B) | 测试侧 + 引擎 | A 部分(重录 golden) 可 |

> 注：spec 原始假设「8 项行为性破坏（尺子旧）+ 1 项环境」不成立——既非纯尺子旧、也非纯引擎错，而是**尺子与引擎都在被平行会话持续演进**的动态状态。红色里：C/引擎渲染类（#1/#2/#4/#5，含 1 个 render 真 bug）、B/测试侧可修类（#3/#6/#7/#9）、下游级联（#8）。

## 三、CI 门禁（health-check.yml）

- **本轮未改 yml**。spec 的恢复前提是「run-all 全绿」；当前 9 红未清，且其中 4 项（#1/#2/#4/#5）是引擎/渲染侧，按硬边界「不许改 core/modules/player/render、发现 C 类就停下报告」**无法由我修绿**。若此刻强行恢复「push 跑全量」，会重新引入 yml 注释里记的「每笔必红、邮件轰炸」旧问题。
- **ready-to-apply diff（待 #1/#2/#4/#5 由引擎侧消解、run-all 全绿后执行）**：
  ```yaml
  # 改前（仅手动触发）
  - name: 跑体检红线（node-only，零浏览器；暂仅手动触发）
    if: github.event_name == 'workflow_dispatch'
    run: node tests/run-all.mjs
  # 改后（push 也跑全量）
  - name: 跑体检红线（node-only，零浏览器；push 门禁全量）
    run: node tests/run-all.mjs
  ```
  验证：push 到临时分支看 Actions 结果（届时应为绿；若仍有红，即真实引擎回归，正是门禁该拦的）。

## 四、已提交

- `3c79bbd7` `test(体检): 牙口证据链对账改为环境缺失显式跳过（ENV 类·交接 spec 选项②）` — 仅 1 文件 `tests/rule-teeth-evidence-selftest.mjs`，已双推 `gh-ssh`+`gitee`。**本轮 re-run 已确认该项不再红。**

## 五、⚠️ 协调冲突（必须让你拍板）

平行「体检」会话当前有**未提交 WIP** 在工作树里（非我产生、我不会动也不会提交）：
- `content/001-game-data.json`、`core/218-state-keys.js`、`infra/106-battle-enums.js`、`modules/319-elite-mingjiao-hanlisa.js`、`modules/329-buff-tools.js` —— 新增「寒离飒强化」专属海克斯 `hlsPower1`（**新功能**，与我的 C 类红项无直接关系）。
- `tests/baselines/xinhun-death-case.json` —— 已被重录（zhouPresent 27→22 等）。
- `tests/run-all.mjs` —— 已被抬到 V1.54.0（+`--jobs N`）。

**影响**：
1. B 类红项（#3/#6/#7/#9）全在 `tests/` 内，而体检正在动 `tests/`（run-all、health-rules、baselines）。我现在改它们会和 WIP 撞车、或把他人未提交改动一起带进提交（第一轮已踩过一次误打包坑）。
2. 当前 9 红的口径本身包含了体检的 WIP，不是「干净基线 + 我的修复」的纯增量。

**需要你的决策**：
- (a) 让体检先把引擎/基线 WIP 提交落地，我再接手测试侧 B 类（#3/#6/#7/#9）一次性清掉、然后恢复 yml；或
- (b) 你明确授权我直接改 `tests/` 下的 B 类检查（不动 core/modules/render），我避开体检正在编辑的具体文件；或
- (c) 把 #1/#2/#4/#5 这些 C 类（含 render 真 bug）直接交主代码/体检处理，我只负责报告。

## 六、红线遵守确认

- 未改 `core/` `modules/` `player/` `render/` 任何文件（#2 的 render bug 仅指出、未动）。
- 未重录任何基线（#2 严守「严禁重录」；xinhun 基线的重录是体检 WIP，非我所为）。
- 未注释断言 / 未放宽阈值 / 未 skip 检查 / 未删测试文件。
- ENV 修复为「缺失即显式跳过 + loud 警告」（spec 选项②），非静默放行。
- 未提交任何平行会话 WIP；本报告为单独 untracked 文件，提交时仅 `git add` 本文件。
