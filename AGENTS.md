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
8. **Commit & push — DO IT IMMEDIATELY (highest priority)**: stage only the specific files you changed, commit, then push to BOTH `gh-ssh` and `gitee` remotes right away. NEVER leave work staged or committed-but-unpushed — this is a SHARED working tree and other sessions will wipe it. Do NOT stall over "remote has new commits from someone else": fetch, fast-forward or resolve, then push anyway and verify both tips. Never say "I won't push yet to avoid affecting others" — pushing protects the work; leaving it local loses it.

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

## 🚨 推送铁律（最高优先级 · 所有 Agent 必读 · 不许打折扣）
**改完立即 commit + 双推，绝不留在暂存区 / 本地不推。**
- 这是**共享单工作树**：你 `git add` 了但没 commit/push 的改动，会被别的会话 `reset` / `clean` / 顺手提交时清掉——**暂存 = 白干**。所以：**add 具体文件 → commit → 立刻 push gh-ssh + gitee**，一气呵成，不要中途停下来等确认。
- **不要拿"远端被别人改了"当理由不推 / 暂停 / 长篇纠结。** 发现远端有新提交：先 `git fetch` 看清楚，是快进就快进推；真分叉就在你自己的提交上处理后**照样推上去**。推完核对三端 tip。别把"可能影响别人"当作拖延或暂存的借口——**推上去才是保护成果，留在本地才会丢。**
- **禁止话术**："怕覆盖别人所以先不推" / "先暂存等确认" / "未提交未推送" —— 这些在本仓库一律视为未完成。

## 完成定义
- 任务有可验证结果（命令 + 实际结论行）。
- 看板已更新（领格 / 补格 / 标 `done`）。
- 改动只 `add` 具体文件，**已 commit + 双推 gh-ssh + gitee，两端 tip 一致**；没有任何"暂存 / 本地未推"的残留。

---

## 📋 可复制提示词（把下面整段贴给任意 Agent 即可，无需任何前置上下文）

> 【START 光明顶体检 Agent 协议 V2】
> 你是"光明顶 5v5 对战"仓库（new-acode-repo）的共享体检贡献者。仓库根两个关键文件：
> `tests/_registry/HEALTH_BOARD.md`（共享看板）与 `.workbuddy/skills/guangmingding-health-run/SKILL.md`（跑法手册，含全部红线与完成定义）。
> 没有仓库访问权就向用户要路径或让他贴这两份，不要瞎猜；拿到后先 `git fetch`。
>
> 开工三步（每轮必做）：
> 1. 先融合夜间：读最新 `nightly/第N轮` 的 `tests/体检迭代日志`，把线索逐条拿到 main 侧代码复核——夜间说 done 不等于 main 已改；仍成立的登记为线索，已消失的注明，不许照搬 done。
> 2. 认领：读看板，认领最小编号且 `open` 的任务 → 改 `doing` + `owner` + 时间，改完立即单独 commit + 双推占位，防别的会话抢同一格；没有 `open` 就自己补 ≥3 条（编号取当前最大+1，先查有无同号）再领。push 被拒先 fetch：快进就推、分叉处理完照样推，不许拿"远端被改"当理由不推。
> 3. 执行（★ 不要跑久，按档位选，别每次全量）：
>    - **改一行、验一个判据** → 只跑那一个脚本（如 `node tests/transfer-block-guard.mjs`），单项 0.1~0.2 秒；
>    - **改完一批 tests/** → `node tests/run-all.mjs --quick --jobs 4`（自动跳过 heavy：大样本 fuzz 300seed×7关、翻译 golden 等），这是日常迭代默认档；
>    - **只有夜检 / 发版前回归** 才跑不带 `--quick` 的全量（十几分钟起）；变异牙重刷 49 树另算，不进日常迭代。
>    - 最真实浏览器入口 `python tools/health_auto_check.py 600 7 100`、手机端 `tests/120test-runner.html` → 🏥，按需。
>    - 凡依赖引擎回放的结论必须在仓库外干净 detached worktree 跑（主树有并行 WIP 会被脏树守卫判结论作废）；worktree 里改过脚本要先 commit 再跑，node_modules 用目录联接指回主仓。
>
> 判断纪律（别把问题推给用户）：
> - 默认自己判断、自己动手。只有"会改变判定结论/阈值/基线/退码口径"的才标待确认，并附判断依据、影响面、推荐方案——不许只写"须拍板/等授权"。
> - 发现主代码缺陷，当轮就把可复制转交块（START/END 包住、块内放完整最终代码）贴进对话；只写"要主代码配合"却没块 = 本轮未完成。
> - 移植别的分支/别人的成果前先 diff 审查有无夹带判据或退码变化；会改结论的不搬，拆出来写清楚。
>
> 收尾：任务标 `done`，看板永远 ≥3 个 `open`（做1留234…）。报告先说人话——发现了什么、要不要管、结论是什么，再给实际命令 + 实际结论行（含 EXIT 码）；内部编号要配一句大白话解释。
>
> 红线：主代码零触碰（只改 tests/ + 打包清单）；只 `git add` 具体文件（绝不 `-A`/`.`）；不改阈值、不重录基线、不放宽判据。
>
> ★ 推送（别磨叽，推完就走）：改动 → add 具体文件 → commit → **立即双推** gh-ssh + gitee → 核对两端 tip → 结束。
>   - 推被拒（远端被并行会话改了）就 `git fetch`，快进就推、分叉处理完照样推，**推完不要反复 fetch/分析别人推了什么**，一句"三端一致 + tip"即可收工。
>   - 绝不暂存、绝不留在本地（共享工作树会被别的会话清掉）；禁用"怕覆盖别人所以先不推 / 先暂存等确认 / 未提交未推送"这类话术。
>
> 始终遵守 SKILL.md 完整红线与完成定义；命令失败先读报错再诊断，不静默跳过。
> 【END】

> 🌐 English copy-paste block:
> 【START health-check agent protocol V2】
> You are a contributing agent for the "光明顶 5v5" battle-sim repo (new-acode-repo). Root keys: `tests/_registry/HEALTH_BOARD.md` (shared board) and `.workbuddy/skills/guangmingding-health-run/SKILL.md` (runbook). If you lack repo access, ask for the paths — never guess; then `git fetch`.
> Every round: (1) read the latest `nightly/第N轮` log and re-verify each clue against main code — nightly `done` does NOT mean main is fixed; (2) claim the smallest `open` task → `doing` + owner + time, commit + push the board change immediately to block races; if none open, add ≥3 tasks (max+1, check duplicates) then claim; (3) execution — **NEVER run the slow full suite by default**: single script for one check (~0.2s), `node tests/run-all.mjs --quick --jobs 4` (skips heavy fuzz/golden) as the daily default, full run ONLY for nightly/release; browser `python tools/health_auto_check.py 600 7 100` and phone `tests/120test-runner.html` → 🏥 as needed. Engine-replay conclusions must come from a clean detached worktree OUTSIDE the repo; commit script edits in that worktree before running; junction `node_modules` back to main. Judge yourself — only flag "needs decision" if it changes verdict/threshold/baseline/exit-code, with evidence and a recommendation. Real game bugs → paste a copy-paste transfer block (START/END, complete final code) in the same reply. Keep ≥3 `open` tasks. Report in plain language first, then exact commands + actual output lines with EXIT codes. Red lines: never touch game source (only `tests/` + pack manifests); `git add` specific files only; never change thresholds/re-record baselines/relax assertions. **PUSH — no dithering**: add specific files → commit → immediately push BOTH `gh-ssh` and `gitee` → verify tips → done. If push is rejected, `git fetch` and push again (fast-forward or resolve); after pushing do NOT keep re-fetching/analyzing what others pushed — one line "tips match" and finish. Never leave work staged/local. Follow SKILL.md red lines; diagnose errors from output, never skip silently.
> 【END】
