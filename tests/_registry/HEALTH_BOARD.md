# 光明顶体检共享看板 HEALTH_BOARD

> **纪律**：领最小编号 `open` 任务 → 改 `doing` + `owner` + `更新时间` → 做完标 `done` → **永远保持 ≥3 个 `open`**（做1留234、做2留345、做3留456）。
> 每次动看板前先 `git fetch`；`owner` 写你的标识（会话名 / 人名 / agent 名）。
> 看板改动**单独 commit + 双推**，避免两人抢同一格。
> 用法见 skill：`guangmingding-health-run`（`.workbuddy/skills/guangmingding-health-run/`）。

## 任务列表
| # | 标题 | 验收标准（done 长啥样） | 状态 | owner | 更新时间 |
|---|------|------------------------|------|-------|----------|
| 1 | 通用化回流通道：手测 15 条 Bug 逐条归位 | `tests/bug-backlog.md` 建好，每条有"有规则盯 / 明确不在射程"结论，对应规则或标注补齐 | doing | zhong(主会话) | 2026-11-13 |
| 2 | 318 判据③主代码修复落地 | 转交块（ui/727 fastForward 尾巴守卫）已落地，`rewind-fastforward-cancel-probe-case.mjs` 由红转绿；撤销 318 的"转交中"豁免登记 | open | - | - |
| 3 | rule-idle 恒空转红取证 | 庄铮断锤三式保命与承伤上限(回归) skip=156：判真空转还是判据误报；修或显式登记，守门转绿 | open | - | - |
| 4 | fact-coverage-selftest 恒绿线补真退码 | 该脚本不再全文 `process.exit(0)`；补至少 1 条会变红的断言（D12 一轮遗留） | open | - | - |
| 5 | 元守卫 297–300 归属梳理 | 确认哪些是"槽位"（指向扫描脚本本身）、哪些待回填；更新 `requests/D12.json` 登记口径，消除 registration 误报 | open | - | - |
| 6 | 体检 Node 守门并行化实测 | `run-all --jobs N` 已实现；实测提速比与稳定性，写进命令速查 | open | - | - |

## 状态约定
- `open`：待领；`doing`：进行中（同一时刻建议仅 1 人占）；`done`：已闭环（含验证结论）。
- 真缺陷需主代码的，状态写 `doing`/`blocked` 并附转交块，等主代码落地再 `done`。
- 永远 ≥3 个 `open`：做 N 的人至少留 N+1、N+2、N+3 开放。
