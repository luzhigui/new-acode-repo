# 体检命令速查

## 浏览器整跑（最真实，约 4min/7 关）
```
"<python>" tools/health_auto_check.py 600 7 100
```
- 用系统 Edge 驱动；报告打印终端，`issues` 数组即异常。
- 并行：分进程跑不同关段（或不同 `SEEDS`）。

## Node 守门全套（快）
```
node tests/run-all.mjs                  # 全量（含重型采样）
node tests/run-all.mjs --quick          # 跳过重型采样
node tests/run-all.mjs --quick --jobs 4 # 并发跑，实测最快（默认 1=顺序，行为不变）
```
- `CHECKS` 任一红 → `exit 1`；`OBSERVES` 只显形不计退码。
- 环境变量透传：`SEEDS=1,2 STAGES=2 node tests/run-all.mjs`。

### `--jobs` 实测（2026-11-14，干净 detached worktree @6a68c095，同一棵树两次 `--quick`）
| 口径 | `--jobs 1` | `--jobs 4` | 提速 |
|---|---|---|---|
| CHECKS 段（脚本自报） | 422.3s | 107.6s | **3.92×** |
| 整体墙钟（含 OBSERVES） | 772s | 282s | **2.74×** |

- 结论行（两种模式逐字相同）：`结果：15/23 通过，X 8 项红`；退码均 `EXIT=1`。
- **稳定性判据（别比错）**：只比**末尾按原顺序的汇总表**（`=========================================================` 之后、`结果：` 之前的 `  ✅/❌` 行），剥掉 `Nms` / `exit=N` 后 23 项逐行一致 ⇒ `--jobs` 不改变任何结论。
- ⚠ 两个已踩的坑：① 别用 `grep ❌` 逐行比全文——并发输出**按完成序打印**，`▶ 名 …` 前缀与结论行会串位，且顺序模式 `❌ (ms)`、并发模式 `❌ exit=1 (ms)` 格式不同，逐行比必然假 DIFFER；② 别把 OBSERVES 行混进汇总表（顺序模式 `  ❌ exit=N 名`、并发模式 `▶ 名 … ❌ exit=N`，格式不同）。
- 全量 `--quick --jobs 1` 约 13 分钟（含观察项），**别为"完整"干等**；日常直接用 `--quick --jobs 4`。

## 手动 / 手机端
打开 `tests/120test-runner.html` → 🏥 → 选模式（静态体检已拆独立入口，手机端即时响应）。

## 单条守门复跑（定位某条红时）
```
node tests/<脚本名>.mjs            # 多数守门脚本自带 --self-test
```

## 看板
```
# 读
cat tests/_registry/HEALTH_BOARD.md
# 改完单独提交
git add tests/_registry/HEALTH_BOARD.md && git commit -m "board: 领#N / 补#M" && git push ...
```
