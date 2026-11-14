# 光明顶体检共享看板 HEALTH_BOARD

> **纪律**：领最小编号 `open` 任务 → 改 `doing` + `owner` + `更新时间` → 做完标 `done` → **永远保持 ≥3 个 `open`**（做1留234、做2留345、做3留456）。
> 每次动看板前先 `git fetch`；`owner` 写你的标识（会话名 / 人名 / agent 名）。
> 看板改动**单独 commit + 双推**，避免两人抢同一格。
> 用法见 skill：`guangmingding-health-run`（`.workbuddy/skills/guangmingding-health-run/`）。
> **跨软件通用入口**：仓库根 `AGENTS.md` 含一份可复制粘贴到任意聊天 Agent 的自包含提示词（中英双语），别的软件/别的会话的 Agent 读它即可认领并跑体检，无需本仓库上下文。
> **跨线融合口径（2026-11-14 立，因 #10 分叉）**：main 与夜检 `nightly/第N轮` 分叉期间，夜间看板/日志里的 `done` **只代表「在该分支代码上完成」**。融合进 main 时只登记**缺陷线索**，须逐条在 main 侧代码复核是否仍成立，未落地前一律 `open`/`blocked`——杜绝「看板说 done、代码没改」的假绿。例：夜间 #12 的快照相减 main `core/217:185` 仍在；夜间 #4 的 done 不等于 main 的 `fact-coverage-selftest.mjs` 已改。

## 任务列表
| # | 标题 | 验收标准（done 长啥样） | 状态 | owner | 更新时间 |
|---|------|------------------------|------|-------|----------|
| 1 | 通用化回流通道：手测 15 条 Bug 逐条归位 | `tests/bug-backlog.md` 建好，每条有"有规则盯 / 明确不在射程"结论，对应规则或标注补齐 | doing | zhong(主会话) | 2026-11-13 |
| 2 | 318 判据③主代码修复落地 | 转交块（ui/727 fastForward 尾巴守卫）已落地，`rewind-fastforward-cancel-probe-case.mjs` 由红转绿；撤销 318 的"转交中"豁免登记 | done | AI编程助手 | 2026-11-13 · 证据：`node tests/rewind-fastforward-cancel-probe-case.mjs` 干净树 ①②③ 全绿（快进置 busy / 收敛退出+倍速还原 / 取消时尾巴不清真账本）EXIT=0；变异反向样本侧 SKIP-ENV（沙箱 EPERM 子进程起不来，环境阻塞非脚本红） |
| 3 | rule-idle 恒空转红取证 | 庄铮断锤三式保命与承伤上限(回归)：干净树实测 pass=16/fail=0（非恒空转，规则健康）；脏树 skip=156 为并行 WIP 失真。V1.5.0 误登记已撤回(V1.5.1)，守门转绿，无需豁免 | done | 钟老师/贡献者轮 | 2026-11-13 |
| 4 | fact-coverage-selftest 恒绿线补真退码 | 该脚本不再全文 `process.exit(0)`；补至少 1 条会变红的断言（D12 一轮遗留） | done | AI编程助手 | 2026-11-13 |
| 5 | 元守卫 297–300 归属梳理 | 确认哪些是"槽位"（指向扫描脚本本身）、哪些待回填；更新 `requests/D12.json` 登记口径，消除 registration 误报 | doing | AI编程助手 | 2026-11-13 |
| 6 | 体检 Node 守门并行化实测 | 干净 detached worktree @6a68c095 同树两次 `node tests/run-all.mjs --quick --jobs 1` / `--quick --jobs 4`：CHECKS 段 422.3s→107.6s(**3.92×**)、整体墙钟 772s→282s(**2.74×**)；末尾汇总表剥 ms/exit 后 23 项**逐项状态一致**，结论行逐字同为「结果：15/23 通过，X 8 项红」，退码均 **EXIT=1** ⇒ 并发不改结论。提速比+稳定性判据已写入 `references/commands.md`。⚠ 判据坑已记：别 `grep ❌` 逐行比全文（并发按完成序打印会串位、格式不同），别把 OBSERVES 混进汇总表 | done | 钟老师/贡献者轮(11-14) | 2026-11-14 |
| 7 | D12 扫描器 acorn 依赖守卫 + 反向样本补齐 | `rule-false-green-scan.mjs` 缺 acorn 时打印「守卫前提失效：acorn 缺失」并 exit(1)；六类反例各有夹具；定向用例通过 | open | - | - |
| 8 | rule-idle 自检分支死码清理 | 经核查已满足（销项）：selfCheck()/checkThreshold() 自 L219/224 起已是真调用（d0fa0ad5·第143轮引 sample-sufficiency 公共件时落地）；全文 exit(1) 仅 119/127/232 三处真实错误分支，无「注释里的 exit(1)」死码 ⇒ 死码清理早完成，本条为过时任务 | done | 钟老师/贡献者轮 | 2026-11-13 |
| 9 | 引擎依赖体检脚本加脏树前置守卫 | `rules-replay` 系脚本（rule-idle-selftest / fact-coverage-selftest / 变异牙等）跑前检测运行环境是否干净：若工作树有未提交主代码改动、或 HEAD≠远端稳定 tip，打印「脏树警告」并**不准下"恒空转/假绿/覆盖不足"结论**（参考本会话 #3 脏树 skip=156 误判教训）；干净 detached worktree 跑法不受影响。验收：在叠了 WIP 的主树上跑此类脚本会显式告警而非静默失真 | open | - | - |
| 11 | 九阳系治疗「fact.heal 与账本不同源」 | 来源夜间第220轮；main 侧复核仍成立：`core/216:263` 声明期 `recordHpAudit('nineYangHeal', heal)` 记**预演值**，而 `core/217:185` HEAL handler 结算时把 `factData.heal` 覆盖成**落地值** `actual` ⇒ 同帧 hp 先被回过血即分叉（夜间实测 seed777 stage1 r4 声明17/账本7）。验收：主代码让两者取同一「应用后实落量」，且 `stat-decl` 的 NINE_YANG_HEAL 0 重复应用、`contract-guard-selftest ②` 转 0 条脏契约。属主代码缺陷→只写转交块、等授权落地 | open | - | - |
| 12 | 结算钩子 `fact.heal` 回写口径（跨契约共性） | 来源夜间第220轮；main 侧复核仍在：`core/217:185`（及 L156 吸血分支）用 `Math.max(0, source.hp - hpBefore)` **快照相减**回写，同帧另有伤害/吸血时差值被带偏；main 已多出 `healActual/healNominal/healMods` 字段但根因未消。验收：回写取 `applyStatChange` 实际增量、不再快照相减。属主代码缺陷→只写转交块、等授权落地 | open | - | - |
| 13 | 变异牙口「同源结论不可审计」：同源判定认文本不认所属规则 | 来源夜间第221轮（夜间明言「改判据夜间不动，等白天拍板」）；main 侧复核仍在：`tests/mutation-teeth.mjs:984 sameSourceHits` 按 `SUBJECT_KEYS` 文本关键词判同源、不认「明细出自哪条规则」，与 `RULE_DOMAIN` 口径未打通 ⇒ A19 把「另一机制」的顺带红判成同源、A10 内部键 `rageOnHit` 明细从不出现恒判△。验收：同源判定改走「明细→所属规则→RULE_DOMAIN→MUT_DOMAIN」，A19/A10 两颗给前后对照与影响面清单（预估受影响≥3颗）。★ 属**改判据**、会改变结论，须 zhong 拍板后再动 | open | - | - |
| 10 | 夜间分支(第218轮及36个)与 main 分叉收口 | 根因：夜间自动化只推 `nightly/第N轮` 永不并 main；03:00 复盘自动化(58a7cc1a)据记忆 PAUSED；白天 main 又独立改 tests/ ⇒ 自 cfae6145(11-11)分叉。`git merge-tree` 实测 `main<-nightly/218` 有 **23 处文本冲突**(15 content+7 add/add+1 modify/delete)，其中 **4 个是主代码**(content/001,core/214,modules/302,modules/337)+1 文档 modify/delete ⇒ 吸收 nightly **非纯 tests 操作**，撞主代码红线，需 zhong 显式授权+专用合并会话。验收：选定策略后 tests/ 回单一真源、双端一致、体检可在单树跑通 | open | - | - |

## 状态约定
- `open`：待领；`doing`：进行中（同一时刻建议仅 1 人占）；`done`：已闭环（含验证结论）。
- 真缺陷需主代码的，状态写 `doing`/`blocked` 并附转交块，等主代码落地再 `done`。
- 永远 ≥3 个 `open`：做 N 的人至少留 N+1、N+2、N+3 开放。

(End of file - total 25 lines)