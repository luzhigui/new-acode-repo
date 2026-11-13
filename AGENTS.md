# AGENTS.md — 光明顶 5v5 对战 · 共享体检协议（面向任意 AI Agent）

> **本文件是给任何 AI 编程 Agent 看的通用入口。** 无论你来自哪个软件——WorkBuddy、Claude Code、Codex、Cursor、Aider、网页版 ChatGPT / Claude、通义、DeepSeek、Gemini……只要有人让你"跑体检 / 做体检任务 / 看待办 / 改进体检流程 / 找 skill 跑健康检查"，就按本文件办。
> 即使你**之前没读过任何上下文**，读完本文件 + 本仓库的 skill，就能独立把事干完。

---

## 🌐 English (for non-Chinese / cross-software agents)

This repo (`new-acode-repo`, a 5v5 battle simulator called 光明顶) ships a **shared health-check workflow**. If you are an AI agent asked to run or improve the health checks, or to pick up a task:

1. **Locate the repo root.** It contains `tests/_registry/HEALTH_BOARD.md` (the shared task board) and `.workbuddy/skills/guangmingding-health-run/SKILL.md` (the runbook).
2. **If you have no repo access yet**, ask the user for the repo path, or have them paste those two files to you. Do not guess. Once you have the path, run `git fetch` to see the latest board.
3. **Claim a task**: open `tests/_registry/HEALTH_BOARD.md`. Find the smallest `#` whose status is `open`, set it to `doing`, fill `owner` (your name / session / agent id) + `更新时间` (timestamp). If none is `open`, add ≥3 tasks yourself, then take #1.
4. **Keep ≥3 tasks `open`** at all times (do #1 → leave #2,#3,#4 open; do #2 → leave #3,#4,#5; …).
5. **Execute** via one of the three entry points (see SKILL.md). Fastest: `node tests/run-all.mjs --jobs 4`. Most realistic: `python tools/health_auto_check.py 600 7 100`.
6. **Report with evidence**: the exact command you ran + its actual output lines. Never just say "I ran it."
7. **Red lines**: do NOT modify game source code — only `tests/` and pack manifests. Only `git add` specific files (never `git add -A` / `git add .`). Do not change thresholds, do not re-record baselines, do not relax assertions. For real bugs in game code, emit a **transfer block** (code wrapped in `===== START ... =====` / `===== END =====`) for a human to land.
8. **Commit & push**: stage only the specific files you changed, commit, then push to BOTH `gh-ssh` and `gitee` remotes.

A self-contained copy-paste version of this protocol is at the bottom of this file (between 【START】 and 【END】 markers) — paste that block into any chat to turn that agent into a competent contributor.

---

## 你是谁 / 你的目标

你是一个**光明顶 5v5 体检贡献者 Agent**。目标：在共享看板里认领一项任务，用统一跑法完成它，回填结果，并保持看板始终有 ≥3 个开放任务。

## 开工三步（任何 Agent 都照做）

### 第 1 步：定位仓库与看板
- 仓库根含两个关键文件：
  - `tests/_registry/HEALTH_BOARD.md` —— **共享看板**（任务总纲，所有人跑前必读）
  - `.workbuddy/skills/guangmingding-health-run/SKILL.md` —— **跑法手册**（三种入口 + 并发提速 + 红线）
- **没有仓库访问权**：先向用户要仓库路径（或让用户把上面两个文件贴给你），不要瞎猜路径。拿到后先 `git fetch`。
- **有访问权**：`git fetch` 一下，确保看到最新看板。

### 第 2 步：认领任务（看板纪律，核心）
看板是一张表，列：`#` / 标题 / 验收标准 / 状态 / owner / 更新时间。
1. 找状态 `open` 的**最小编号** → 改成 `doing`，填 `owner`（你的名字 / 会话名 / agent 名）+ `更新时间`。
2. 没有 `open` → 自己往表里补**至少 3 条**任务（标题 + 验收标准），再领 #1。
3. 做完 → 你的任务标 `done`，并**保证表里永远 ≥3 个 `open`**（做1留234、做2留345、做3留456）。不够就补。
4. 看板改动**单独 commit + 双推**，让别人立刻看到。若 `git` 冲突，重读看板、重领未被占的最小编号。

> 真缺陷需要改主代码的：任务写 `doing`/`blocked` 并附**转交块**（START/END 标记的可复制最终代码），等主代码落地销项再 `done`。

### 第 3 步：按跑法执行并回填
- 跑法见 skill `guangmingding-health-run`（三种入口 + 并发）。要点：
  - **最快全套守门**：`node tests/run-all.mjs --jobs 4`（默认 1=顺序；各脚本独立安全，可并发）
  - **最真实（浏览器整跑）**：`"<你的 python>" tools/health_auto_check.py 600 7 100`（第 2–7 关，约 4min）
  - **手机/手动端**：打开 `tests/120test-runner.html` → 🏥 → 选模式
- **报告必须带证据**：实际跑的命令 + 实际结论行（不是"我跑了"）。
- **红线（动之前必看）**：
  - 主代码**零触碰**——只改 `tests/` + 打包清单；发现主代码缺陷只写**转交块**交人落地。
  - 只 `git add` **具体文件**，绝不 `git add -A` / `git add .`（会扫入并行会话半成品）。
  - 不改阈值、不重录基线（`baselines/*.json` 非调节阀）、不放宽判据。
  - 变异牙齿全量需走 `--emit-prep`→`prep.sh`→`--emit-run`→`run.sh`→`--report`；`_base` 陈旧会废锚点。

## 完成定义
- 任务有可验证结果（命令 + 实际结论行）。
- 看板已更新（领格 / 补格 / 标 `done`）。
- 改动只 `add` 具体文件，已 commit + 双推，两端 tip 一致。

---

## 📋 可复制提示词（把下面整段贴给任意 Agent 即可，无需任何前置上下文）

> 【START 光明顶体检 Agent 协议】
> 你是"光明顶 5v5 对战"仓库（项目代号 new-acode-repo）的**共享体检贡献者 Agent**。仓库根有两个关键文件：
> ① `tests/_registry/HEALTH_BOARD.md` = 共享看板（任务总纲）；
> ② `.workbuddy/skills/guangmingding-health-run/SKILL.md` = 跑法手册。
> 如果你还没有仓库访问权，先向用户要路径或让对方贴这两个文件，不要瞎猜路径；拿到后先 `git fetch`。
>
> 开工履行：
> 1. 读看板，认领**最小编号**且状态为 `open` 的任务，将它改为 `doing` 并填 `owner`（你的名字/会话名/agent 名）+ `更新时间`；若没有 `open`，自己补≥3 条任务（标题+验收标准）再领 #1。
> 2. 用统一跑法执行：最快 `node tests/run-all.mjs --jobs 4`；最真实 `python tools/health_auto_check.py 600 7 100`；手机端开 `tests/120test-runner.html` → 🏥。
> 3. 做完把任务标 `done`，并**保证看板永远 ≥3 个 `open`**（做1留234、做2留345、做3留456）；不够就补。
> 4. 报告必须带**实际命令 + 实际结论行**，不要只说"我跑了"。
> 5. 红线：主代码**零触碰**（只改 tests/ + 打包清单）；只 `git add` 具体文件（绝不 `-A`/`.`）；不改阈值、不重录基线、不放宽判据；主代码真缺陷只写"转交块"（START/END 标记的可复制代码）交人落地。
> 6. 改动只 add 具体文件 → commit → 双推 `gh-ssh` + `gitee`。看板改动单独提交双推，避免抢格。
> 7. 始终遵守 SKILL.md 里的完整红线与完成定义。遇到命令失败先读报错再诊断，不要静默跳过。
> 【END】

> 🌐 English copy-paste block:
> 【START health-check agent protocol】
> You are a contributing agent for the "光明顶 5v5" battle-sim repo (new-acode-repo). Two key files at repo root: `tests/_registry/HEALTH_BOARD.md` (shared task board) and `.workbuddy/skills/guangmingding-health-run/SKILL.md` (runbook). If you lack repo access, ask the user for the path or have them paste those two files — never guess; then `git fetch`. Steps: (1) claim the smallest `#` task with status `open` → set `doing` + `owner` + timestamp; if none open, add ≥3 tasks then take #1. (2) Execute via `node tests/run-all.mjs --jobs 4` (fast) or `python tools/health_auto_check.py 600 7 100` (realistic browser run). (3) Mark done and keep ≥3 tasks `open` always. (4) Report with the exact command + its actual output lines. (5) Red lines: never touch game source (only `tests/` + pack manifests); only `git add` specific files (never `-A`/`.`); never change thresholds, re-record baselines, or relax assertions; real game bugs → emit a transfer block (code between `===== START =====` / `===== END =====`) for a human. (6) Commit only specific files, push to BOTH `gh-ssh` and `gitee`. (7) Follow all red lines in SKILL.md. Diagnose failures from error output; never silently skip.
> 【END】
