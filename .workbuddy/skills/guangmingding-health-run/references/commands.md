# 体检命令速查

## 浏览器整跑（最真实，约 4min/7 关）
```
"<python>" tools/health_auto_check.py 600 7 100
```
- 用系统 Edge 驱动；报告打印终端，`issues` 数组即异常。
- 并行：分进程跑不同关段（或不同 `SEEDS`）。

## Node 守门全套（快）
```
node tests/run-all.mjs              # 全量（含重型采样）
node tests/run-all.mjs --quick      # 跳过重型采样
node tests/run-all.mjs --jobs 4     # 并发跑，提速（默认 1=顺序，行为不变）
```
- `CHECKS` 任一红 → `exit 1`；`OBSERVES` 只显形不计退码。
- 环境变量透传：`SEEDS=1,2 STAGES=2 node tests/run-all.mjs`。

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
