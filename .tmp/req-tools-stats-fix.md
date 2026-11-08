# 需求清单（转万能）· 跑批统计口径修正

来源：体检侧第 230 轮审计（`tests/stats-pipeline-audit.mjs` 的 S10/S11/S12/S14 + D8）。
体检铁律不改 tools/，以下由万能在 tools 落盘；**不要动主代码**（infra/core/modules 等）。

## P0-1 809 池化重复计算（统计结果直接错）

**根因**：`tools/809-role-balance.js` 用同一批 4×4 对局同时累加两本账：
- 我方视角：`allyStats[ai].total += roundsPerGroup`
- 敌方视角：`enemyStats[ei].total += roundsPerGroup`
- 汇总：`poolW = aw + (et - ew)`、`poolN = at + et`

同一场对局（ai, ei）在「我方职业 ai」账里算一次、在「敌方职业 ei」账里又算一次。
默认 4 敌 × 100 场 = 400 场真实对局，`poolN` 却是 800 → Wilson CI 按 800 算，宽度约被低估 √2；
页面又写「配对后样本正相关、区间偏保守」，方向是反的：配对共享随机使池内样本正相关，正确做法是**减少 n**，不是加 n。

**修法（二选一，推荐 A）**
- A. 只保留我方视角：`poolW = aw + (et - ew)` 不变，`poolN = at`（at = 4×roundsPerGroup = 400）。
  `(et - ew)` 仍然把「该职业在敌方时的敌胜场」翻成「该职业所在方胜场」，但 n 不再翻倍。
- B. 若坚持两视角，`poolN = (at + et) / 2`，并在页面注明「同一对局计两次，n 已折半」。

**验收**：同一份 4×4 数据，修复前后点估计不变、CI 变宽约 √2；表头/说明删掉「偏保守」改为「n=独立对局数」。

## P0-2 809 / 812 结果不可复现

**根因**：
- `tools/809-role-balance.js`：`const masterSeed = Date.now()`，只用于派发 worker，**不进结果对象、不显示**。
- `tools/812-elite-eval.js`：`masterSeed = Date.now()`，`latest.elite = { stages, runs: RUNS, byStage, hero }` 无 seed；
  `snap_*` 也只有 `{id, ts, parts}`。
- `tools/813-stats-check.js`、`tools/808-hex-dashboard.js` 同类（808 每记录只有 ts）。
- `tools/815-lineup-search.js` 每场 `SeededRNG(Date.now())`。

**修法**：
1. 809：把 `masterSeed` 放进结果/导出对象并在界面显示（例如表脚「masterSeed=…（点复制可复现）」）；重跑入口接受 `masterSeed` 参数，缺省才用 `Date.now()`。
2. 812：`latest.elite` 与快照都加 `masterSeed`、`ver: VER`、逐表 `tableTs`；快照 `parts` 不再用一个 ts 覆盖多表。
3. 808：每条记录加 `seed`/`ver`（战斗入口能拿到 seed 的写 seed；拿不到就写 `seed:null` 明确不可复现）。
4. 815：主种子改为可传入/显示，禁止纯 `Date.now()` 匿名采样。

**验收**：给定显示的 masterSeed 重跑，809 的 4×4 每格 wins/total 逐条一致；812 的同 seed 快照逐字段一致。

## P1 阈值收成一处（812/809/826/852/814）

**现状（体检侧台账已建：`tests/_lib/stats-thresholds.mjs`）**

| 口径 | 当前值 | 持有位置 |
|---|---|---|
| 812 单格最少场次 | 200 | `tools/812-elite-eval.js` 4 处 `d.runs < 200` |
| 809 整体胜率下限/上限 | 35 / 65 | `tools/809-role-balance.js` `overall > 65 \|\| overall < 35` |
| 826 单对象最少场次 | 300 | `tools/826-balance-alert.js` `TH.MIN_SAMPLE` |
| 826 组合最少场次 | 150 | 同上 `TH.PAIR_MIN` |
| 826 快照过期天数 | 14 | 同上 `TH.FRESH_DAYS` |
| 852 英雄/单海克斯最少场次 | 8 / 8 | `tools/852-career-log.js` `HERO_MIN_GAMES`、`HEX_MIN_GAMES` |
| 814 A/B 着色线 | 5pp | `tools/814-baseline-compare.js` `diff >= 5` |

**修法（推荐）**：
- 在 `tools/827-tool-registry.js`（已是各工具共享的登记处）新增 `STATS_TH` 导出：
  `{ THIN_SAMPLE: 200, OVERALL_LOW: 35, OVERALL_HIGH: 65, MIN_SAMPLE: 300, PAIR_MIN: 150, FRESH_DAYS: 14, HERO_MIN_GAMES: 8, HEX_MIN_GAMES: 8, AB_BAND: 5 }`
- 812/809/826/852/814 全部改成 `import { STATS_TH } from './827-tool-registry.js'` 引用，删除本地字面量。
- `tests/_lib/stats-thresholds.mjs` 继续按同一数值对账；两处数值若不一致，体检 S14 报红，禁止静默漂移。

**验收**：`tests/stats-pipeline-audit.mjs` 的 S14 从「工具侧未按台账」变为 ✅；改任一阈值只改 827 一处，其他工具自动跟随。

## P1 826 判读线（顺带）

`TH.BAND = 0.05` 在 n=300、cluster≈3 时只相当于 z≈1.05（噪声区）。建议仪表盘同时显示
「最小可辨差异 ≈ 9pp（cluster=3）」或把告警线抬到 9pp；`base` 改为按场次加权的整批胜率，
`diffSum` 自检（Σ(p−base)≡0）删掉或换成「实际整体胜率 vs 加权 base」的真实对账。

## 附：体检侧已固化的证据
- S11：poolN=2×场次、masterSeed 不落盘、极值选择偏差、35/65 硬编码。
- D8：同 seed 下只换我方第 6 人职业，3/3 个 seed 的敌方阵容都变化 → 配对只到种子层，
  如需真·逐场配对，建队顺序需固定（先建双方基础 5 人，再各自补第 6 人）或改用独立 RNG 流。
