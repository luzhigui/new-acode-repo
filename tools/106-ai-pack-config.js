// V6.0.16 | ~13100 bytes | 2026-09-26 加本表用途口径备注（用户定案）：复制包清单不追求全量，体检脚本/本机工具/构建脚本不纳入属正常、不许补登；判断标准=网页端 DeepSeek 拿到包后运行或阅读是否需要它
// V6.0.48 | 2026-10-31 补登记 2 项：content/201hex-enhance.json（hexEnhance 迁出 200 的新数据文件）、
//           modules/27elite-mingjiao-brother-laststand.js（00reg-mechanics 已 import 的妹永久背水组件）。
export const VER = 'tools/106-ai-pack-config.js V6.0.48';

// AI 复制包踢除清单（103-toolkit.js 的 FILES 过滤会无条件跳过这里的文件）
// 2026-09-04 用户决定不再精简：特效/音效/错误面板/入口页全部随包发送。
// 2026-09-16 73/74 两版备选CG 已从仓库删净（无引用），排除表清空。
export const AI_EXCLUDE = new Set([]);

// AI 上下文契约
export const AI_INTERFACE_NOTE = `// ============================================================
// AI 上下文提示：本项目已全量打包发送。
// 全部运行文件（引擎/播放器/UI/特效/音效/工具箱/体检/入口页）均已含在包中。
// ============================================================`;

// ── 本表用途口径（2026-09-26 用户定案，维护前必读，勿误补）────────────
// 本表服务于「网页端 DeepSeek 复制包」，唯一判断标准：
//   网页端 DeepSeek 拿到包后，运行或阅读是否需要这个文件 —— 需要才登记。
// 本表**不追求全量**：体检脚本（tests/）、本机工具、构建/发布脚本本就不该纳入，
//   不登记属正常，**不许补登**；历史已登记条目保留、无需清理、不因此报错。
// ───────────────────────────────────────────────────────────────

// 项目全部文件清单（全项目唯一数据源）
// 注意：ALL_PROJECT_FILES 是文件复制器（103）与 AI 复制包的唯一来源；
// 新增/删除项目文件时只需改这一处，无需再同步 104。
export const ALL_PROJECT_FILES = [
    // core（核心战斗引擎）
    '../infra/50-event-bus.js',
    '../core/01config-5v5-test.js', '../core/02unit.js',
    '../core/03battle-utils.js', '../core/04buff-system.js', '../core/05battle-horse.js',
    '../infra/51-core-utils.js', '../infra/52-clock.js', '../infra/56-battle-enums.js', '../infra/58-fact-contract.js', '../infra/59-state-change.js', '../infra/60-net-pvp.js', '../infra/61-view-sheet.js',
    '../core/08-registry-elite.js',
    '../core/10battle-attack.js', '../core/11battle-round.js', '../core/12battle-attack-steps.js',
    // 2026-10-21 补登记 12 拆分件：攻击链/攻击边（12battle-attack-steps 的同批产物，包内引用）
    '../core/12battle-attack-chain.js', '../core/12battle-attack-edge.js',
    '../core/13battle-shared.js', '../core/14buff-effects.js', '../core/15-skill-mechanisms.js',
    '../core/16effect-handlers.js', '../core/17-state-keys.js', '../core/18mechanic-registry.js', '../core/19unit-watch.js',
    // 2026-10-16 注册面归位批：闪避规则表 / 计算修饰器表分别迁入 core/20、core/21
    '../core/20-registry-dodge.js', '../core/21-registry-calc.js',
    // 2026-10-25 补登记 23：表现参数表（倍速表现统一配置，core/15、player/40/46、fx/81/82/93、infra/56 等消费；
    // 漏登则包内这些消费点 import 断裂）
    '../core/23perf-params.js',
    '../core/06battle-runner.js',
    '../core/07-target-strategies.js',
    // player（播放器）
    '../player/40player-text.js', '../player/41player-buff-ui.js', '../player/42player-core.js',
    // 2026-10-24 补登记：生涯记录（42player-core 已 import；dev-index 生涯按钮也动态 import）
    '../tools/52-career-log.js',
    // 2026-10-21 补登记 42 拆分件：播放步/阶段动作/步同步（42player-core 的同批产物）
    '../player/42player-play-step.js', '../player/42player-stage-actions.js', '../player/42player-step-sync.js',
    '../player/44battle-player-5v5-test.js', '../player/45event-handlers.js', '../player/46attack-group.js', '../player/47renderer.js',
    '../player/48battle-report.js', '../player/49battle-flow.js',
    // 2026-10-08 补登记 50/51：玩家层战报导出（42/61/64/68 已 import）与战报日志分析（64 已 import）
    '../player/50battle-export.js', '../player/51-battle-log-analyze.js',
    // ui（UI 主控）
    '../ui/60main-utils.js', '../ui/61main-5v5-test.js', '../ui/62ui-render-5v5-test.js',
    '../ui/63main-state.js', '../ui/64main-dialogs.js', '../ui/65main-battle.js',
    '../ui/66audio-control.js', '../ui/67fx-trigger.js', '../ui/68ui-controls.js',
    // 2026-10-04 补登记 69-role-cards：角色名片表（ui/62、ui/65、render/32 已 import）
    '../ui/69-role-cards.js',
    '../ui/74reset-runtime.js', '../ui/70buff-dialog.js',
    '../ui/71tutorial.js', '../ui/72opening-cg.js',
    // 2026-10-11 补登记 75/76：ui/61 减负批拆出的联网会话与战报回放入口（ui/61、ui/68 已 import）
    '../ui/75net-session.js', '../ui/76replay-entry.js',
    // 2026-10-14 补登记 77/78：ui/68 三拆产物（77 倍速系统、78 按钮状态+buff 槽，68 入口 re-export 二者；漏登则包内引用断裂）
    '../ui/77speed-controls.js', '../ui/78button-state.js',
    // 2026-10-19 补登记 79：蓄意轰拳瞄准黑幕（ui/65 已 import；漏登则包内引用断裂）
    '../ui/79hanlisa-aim.js',
    // 2026-10-25 补登记 80：8x 参数面板（表现参数表 core/23 的调参面板；漏登则包内引用断裂）
    '../ui/80perf-panel.js',
    // fx（特效）
    '../fx/80fx-common-5v5-test.js', '../fx/81fx-arrows-5v5-test.js', '../fx/82fx-crash-5v5-test.js',
    '../fx/83fx-position-swap.js', '../fx/84fx-push-back.js', '../fx/85fx-dodge-bullet.js',
    '../fx/86fx-butterfly-spider.js', '../fx/87fx-manager.js', '../fx/88fx-trigger.js', '../fx/89fx-subscriber.js',
    '../fx/90fx-ref-manager.js', '../fx/90-hanlisa-charge.js', '../fx/91fx-lion-roar.js', '../fx/92fx-pang-antics.js', '../fx/93-hanlisa-burst.js', '../fx/94-tangwenliang-dash.js',
    // 2026-10-24 补登记：render/39 动态 import 的空见护罩碎裂特效
    '../fx/95-immune-shield-break.js',
    // modules（通用系统 + 精英角色组件）
    // 2026-10-02 补登记 00reg-mechanics：机制装配统一入口（ui/61 唯一 import 点，25/26/27/30 经它装载）
    '../modules/00reg-mechanics.js',
    '../modules/20elite-skills.js', '../modules/21error-capture.js', '../modules/22audio-manager.js',
    // 2026-10-21 补登记 23：精英通用助手（26/27 组件共用）
    '../modules/23elite-helpers.js',
    '../infra/54-global-store.js', '../infra/55-fx-signals.js', '../modules/29battle-init.js', '../modules/24battle-store.js',
    '../modules/25elite-imperial.js', '../modules/26elite-sixsects.js', '../modules/27elite-mingjiao.js',
    // 2026-10-17 补登记 27 九组件：27elite-mingjiao.js 拆成 barrel + 8 角色文件（V7.2.0 纯搬零行为）后新增
    //   寒离飒（新精英）——27 barrel 逐字 import 它们，漏登则包内明教精英全部引用断裂
    '../modules/27elite-mingjiao-eagle.js', '../modules/27elite-mingjiao-hanlisa.js',
    '../modules/27elite-mingjiao-zhangwuji.js', '../modules/27elite-mingjiao-weiyixiao.js',
    '../modules/27elite-mingjiao-xiaozhao-sister.js', '../modules/27elite-mingjiao-xiaozhao-brother.js',
    // 2026-10-31 补登记：妹永久背水专属组件（00reg-mechanics.js 已 import，漏登则包内装配断链）
    '../modules/27elite-mingjiao-brother-laststand.js',
    '../modules/27elite-mingjiao-xiexun.js', '../modules/27elite-mingjiao-yangxiao.js',
    '../modules/27elite-mingjiao-yintianzheng.js',
    // 2026-10-13 补登记 26 六组件：26elite-sixsects.js 拆分出的组件文件（26 入口 import 它们，漏登则包内引用断裂）
    '../modules/26elite-sixsects-songqingshu.js', '../modules/26elite-sixsects-zhouzhiruo.js',
    '../modules/26elite-sixsects-zhangsanfeng.js', '../modules/26elite-sixsects-pangyuanqiao.js',
    '../modules/26elite-sixsects-miejueshitai.js', '../modules/26elite-sixsects-hetaichong.js',
    // 2026-10-17 补登记：唐文亮组件文件（26 入口已 registerElite，V6.0.23 六组件批时它尚未拆出、后拆时漏登）
    '../modules/26elite-sixsects-tangwenliang.js',
    // 2026-10-24 补登记：空见组件文件（26 入口已 import createKongJianComponent）
    '../modules/26elite-sixsects-kongjian.js',
    '../modules/28buff-tools.js', '../modules/30custom-effects.js',
    '../modules/31-career-log.js',
    // render（渲染层）
    '../render/30-fact-renderer.js', '../render/31-stage-actions.js', '../render/32-grid-render.js',
    // 2026-10-21 补登记 32 拆分件：格徽章/格单元（32-grid-render 的同批产物）
    '../render/32grid-badges.js', '../render/32grid-cells.js',
    '../render/33-fact-registry.js', '../render/34-facts-attack.js', '../render/35-facts-effect.js', '../render/36-generic-renderers.js',
    // 2026-10-21 补登记 35 拆分件：控制/治疗/杂项/属性四族（35-facts-effect 的同批产物）
    '../render/35-facts-control.js', '../render/35-facts-heal.js', '../render/35-facts-misc.js', '../render/35-facts-stat.js',
    // 2026-10-11 补登记 37：角色名片表从 ui/69 迁入 render（消除 render→ui 反向依赖；ui/62、ui/65、render/32 已 import）
    '../render/37-role-cards.js',
    '../render/38-actions-translate.js',
    // 2026-10-13 补登记 38 四族：38-actions-translate.js 拆分出的 fact 族翻译器文件（38 入口 import 它们，漏登则包内引用断裂）
    '../render/38-actions-translate-attack.js', '../render/38-actions-translate-heal.js',
    '../render/38-actions-translate-control.js', '../render/38-actions-translate-stat.js',
    '../render/39-actions-defs.js',
    // content（游戏内容数据）
    '../content/200game-data.json',
    // 2026-10-31 补登记 201：小昭 hexEnhance（姐妹强化/妹永久）已从 200 迁出到独立文件，
    //   core/01 的 getSkillParams / getBrotherHexEnhance 与 modules/27、28 都读它，漏登则包内直接抛「缺 sister 段」。
    '../content/201hex-enhance.json',
    // tests（体检规则与自动测试）
    '../tests/120test-runner.html', '../tests/121health-monitor.js', '../tests/122health-utils.js',
    '../tests/123static-scan.js', '../tests/124rule-recipes.js',
    '../tests/health-rules/123-claw-heal-spam.js',
    '../tests/health-rules/124-aftermiss.js',
    '../tests/health-rules/125-fortify-timing.js',
    '../tests/health-rules/126-xuanming-link.js',
    '../tests/health-rules/127-butterfly-stack.js',
    '../tests/health-rules/128-butterfly-return.js',
    '../tests/health-rules/129-spider-fly-count.js',
    '../tests/health-rules/130-fortify-overflow.js',
    '../tests/health-rules/131-separator-duplicate.js',
    '../tests/health-rules/132-claw-damage.js', '../tests/health-rules/133-death-effect.js',
    '../tests/health-rules/134-zhang-switch.js', '../tests/health-rules/135-break-def-pos.js',
    '../tests/health-rules/136-meteor-atk.js', '../tests/health-rules/137-kulian-prompt.js',
    '../tests/health-rules/138-wind-push.js', '../tests/health-rules/139-spider-butterfly-target.js',
    '../tests/health-rules/140-wei-dodge-cloud.js',
    // 2026-09-21 补登记 141-146：121health-monitor.js 已 import rule88-93、123static-scan.js 已入 SCAN_FILES、124rule-recipes.js 已列规则名，仅打包清单漏登
    '../tests/health-rules/141-zhangsanfeng-fortify-round.js',
    '../tests/health-rules/142-zhangsanfeng-endless-roundstart.js',
    '../tests/health-rules/143-jiuyang-heal-pct.js',
    '../tests/health-rules/144-xinhun-kuaile.js',
    '../tests/health-rules/145-fly-miss-aura.js',
    '../tests/health-rules/146-double-strike.js',
    // 2026-09-22 补登记 147-149：121health-monitor.js 已 import rule94-96，仅打包清单漏登
    '../tests/health-rules/147-horse-destroy.js',
    '../tests/health-rules/148-carry-bonus.js',
    '../tests/health-rules/149-holy-flame-cols-rows.js',
    // 2026-09-22 补登记 150：夜间体检第 7 趟新增（121health-monitor.js 已 import rule97）
    '../tests/health-rules/150-hot-blood-leech.js',
    // 2026-09-22 补登记 151：夜间体检第 8 趟新增（121health-monitor.js 已 import rule98）
    '../tests/health-rules/151-bloodthirst-leech.js',
    // 2026-09-22 补登记 152：夜间体检第 9 趟新增（121health-monitor.js 已 import rule99）
    '../tests/health-rules/152-xingfen-extra-attack.js',
    // 2026-09-29 补登记 153/154/155：夜间体检第 43 轮新增（153 流星成长数值 / 154 生生不息回血加成 / 155 流星成长渲染形态）
    '../tests/health-rules/153-meteor-growth-render.js',
    '../tests/health-rules/154-endless-breath-gain.js',
    '../tests/health-rules/155-meteor-growth-dup.js',
    // 2026-09-29 参数单一真值源收口：156 技能说明数字 == 引擎真值（DESC_TRUTH 单源守卫）
    '../tests/health-rules/156-desc-truth-drift.js',
    // 2026-10-08 补登记 157-159：121health-monitor.js 已 import rule104-106（158 第143轮回填，夜间139重写版）
    '../tests/health-rules/157-mechanic-install-reconcile.js',
    '../tests/health-rules/158-fact-anchor-align.js',
    '../tests/health-rules/159-wei-bloodsiphon.js',
    // 2026-10-13 补登记 160-166：121health-monitor.js 已 import rule107-113、123static-scan.js SCAN_FILES 已列，
    //   仅打包清单漏登 —— 漏登则包内 120test-runner.html 体检页引用断裂（同 153-155 / 157-159 两次补登判据）
    '../tests/health-rules/160-spider-transform-mastery.js',
    '../tests/health-rules/161-lion-grow.js',
    '../tests/health-rules/162-stat-change.js',
    '../tests/health-rules/163-righteous-face.js',
    '../tests/health-rules/164-leech-maxhp.js',
    '../tests/health-rules/165-miejue-redesign.js',
    '../tests/health-rules/166-mind-control-swap.js',
    // 2026-10-17 补登记 170：121health-monitor.js 已 import rule114、123static-scan.js SCAN_FILES 已列（台词池双向一致性，同 160-166 判据）
    '../tests/health-rules/170-taunts-integrity.js',
    // 2026-10-25 补登记 171/172：唐文亮冲刺档位 / 空见金刚不坏覆盖（121health-monitor 已列，同 160-166 判据）
    '../tests/health-rules/171-tangwenliang-dash.js',
    '../tests/health-rules/172-kongjian-jingang.js',
    // （上一行的 121/122 为重复登记，已于 V6.0.16 删除 —— 上方 tests 段已各登记过一次）
    '../tests/140-baseline.js', '../tests/baselines/baseline-v1.json',
    // 2026-09-27 补登记三个 node 直跑入口（V6.0.16：长期漏登，体检的主力命令都靠它们）
    '../tests/rules-replay.mjs', '../tests/smoke-headless.mjs', '../tests/registration-check.mjs',
    // 2026-09-27 再补登两个 node 直跑入口（经用户授权）：覆盖度体检 + 逐步真值对照器
    '../tests/coverage-report.mjs', '../tests/stat-decl-vs-actual-check.mjs',
    // 2026-10-08 补登记：变异测试主力（stat-decl-vs-actual-check 与 153/157 规则注释均引用它）
    '../tests/mutation-teeth.mjs',
    // 2026-09-29 补登记：skills.params 引擎真读字段漂移守卫（import tools/124-param-lab-glossary.js 的 ENGINE_READ 表）
    '../tests/param-read-guard.mjs',
    // 2026-10-25 补登记 5 项：测试单源库 + node 直跑入口（第 122-124 轮体检产物；
    // rules-replay/translate-golden/structure 扫描器等已登记文件 import _lib 两件，漏登则包内 harness 断裂；
    // run-all/fact-dead-field-scan 为文档与 SCAN_FILES 引用的直跑入口，同 rules-replay 先例）
    '../tests/_lib/buff-picker.mjs', '../tests/_lib/rule-branch-extract.mjs',
    '../tests/fact-dead-field-scan.mjs', '../tests/run-all.mjs',
    // 2026-10-27 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/contract-binding-drift-selftest.mjs', '../tests/contract-consistency.mjs', '../tests/contract-guard-selftest.mjs', '../tests/fact-emission-census.mjs',
    '../tests/fuzz-invariants.mjs', '../tests/hit-shapes-consistency.mjs', '../tests/isdead-fix-guard.mjs', '../tests/rule-binding-drift-selftest.mjs',
    '../tests/rule-branch-idle-selftest.mjs', '../tests/rule-idle-selftest.mjs', '../tests/rule-teeth-evidence-selftest.mjs', '../tests/silent-relocate-judge-selftest.mjs',
    '../tests/structural-dead-branch-scan.mjs', '../tests/translate-golden.mjs', '../tests/ver-bump-selftest.mjs', '../tests/xiaozhao-brother-leech-case.mjs',
    '../tests/xinhun-death-targeted-case.mjs',
    // 2026-10-27 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/pack-manifest-check.mjs',
    // 2026-10-27 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/foundation-portability.mjs', '../tests/orphan-selftest-sweep.mjs', '../tests/sandbox-fragility-scan.mjs', '../tests/ver-drift-selftest.mjs',
    // 2026-10-28 补登记 3 个 tests/_lib 公共件：被上方多个已登记体检脚本 import，漏登则包内引用断裂
    //（sample-sufficiency 4 处 / static-truth-slice 6 处 / foundation-scan 2 处，同 V6.0.25 _lib 两件判据）
    '../tests/_lib/sample-sufficiency.mjs', '../tests/_lib/static-truth-slice.mjs', '../tests/_lib/foundation-scan.mjs',
    // 2026-10-30 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/layer-direction-scan.mjs', '../tests/layer-direction-baseline.json',
    // tools（开发工具箱）
    '../tools/102-toolkit.html', '../tools/103-toolkit.js',
    '../tools/105-shop.html', '../tools/106-ai-pack-config.js', '../tools/106b-server.js',
    '../tools/107-battle-log-viewer.js', '../tools/108-hex-dashboard.js',
    '../tools/109-role-balance.js', '../tools/116-role-balance-worker.js', '../tools/117-shared-worker-runner.js', '../tools/110-role-balance-random.html',
    '../tools/112-elite-eval.js', '../tools/113-stats-check.js',
    '../tools/114-baseline-compare.js', '../tools/115-lineup-search.js',
    '../tools/118-import-export-check.mjs',
    '../tools/120-param-lab.html', '../tools/122-param-lab-core.js', '../tools/123-param-lab-worker.js', '../tools/124-param-lab-glossary.js',
    // 2026-10-25 补登记 119/121：TOOL-AI 与工具箱文档引用的 node 直跑入口（参数 A/B 调优器 / 参数实验室主脚本）
    '../tools/119-auto-tuner.mjs', '../tools/121-param-lab.mjs',
    // 2026-10-18 补登记 126：工具箱「🚨 平衡告警」按钮的实现（102 V6.1.3 挂 module 脚本）
    '../tools/126-balance-alert.js',
    // 2026-10-22 补登记 127：工具箱共用名单与文案表（112/126/122/116/108 的单一来源；
    // 漏登则包内这些工具 import 断裂）
    '../tools/127-tool-registry.js',
    // 2026-10-19 补登记 133：dev-index V6.3.17「📖 文档与准则」文本入口的 MD 阅读器
    //（起点读书式阅读页，漏登则包内 dev-index 文档按钮点开 404）
    '../tools/133-md-reader.html',
    // 2026-10-22 补登记 134/135：创意摸奖（自带元素池 + 手动维护的外部词条池）与参数扫描
    //（135 依赖 123 V1.2.0 的 stages 多关支持；134 只读 content，不跑战斗）
    '../tools/134-idea-lab.html', '../tools/134-fetch-pool.mjs', '../tools/134-idea-pool-additions.json',
    '../tools/135-param-scan.html',
    // 2026-10-25 补登记：语音解说从主游戏下线，搬到 tools 存档（136 引擎 / 137 设置面板）
    '../tools/136-voice-commentary.js', '../tools/137-voice-panel.js',
    // 2026-10-28 补登记 138：弱精英机制贡献评估（116 V1.15.0 weakContrib 的消费端）
    '../tools/138-elite-contrib.html',
    // 2026-10-22 补登记：AI 工具借用索引 + 四个历史探针（用户要求留档、且必须让新 AI 能取到；
    // 用途与复用场景见 TOOL-AI.md「四、历史探针」节）
    '../tools/TOOL-AI.md',
    '../tools/probe-lioness.mjs', '../tools/probe-lioness2.mjs',
    '../tools/probe-pang-balance.mjs', '../tools/probe-yangxiao-jump.mjs',
    // 移除了：52-version-calibrator / 53-dead-code-scanner / 54-filelist-checker（这些工作直接问 AI 更高效）
    // 移除了：100build-5v5.cjs（构建脚本已废弃为 .TXT，不再随包复制）
    // assets（音频资源，不参与 fetch 复制）
    '../assets/sfx_arrow.mp3', '../assets/sfx_fly.mp3',
    '../assets/sfx_melee.mp3', '../assets/sfx_xinai.mp3',
    '../assets/bgm-wuxia.mp3', '../assets/bgm-chinese.mp3',
    '../assets/icon-source.webp',
    // 根目录（入口与设计文档）
    // 注意：中文文件名（记录-更改履历.md、待办-bug待修.md）在手机上 fetch 会卡住，已从清单剔除
    '../index.html', '../dev-index.html'
    // 2026-10-19 移除了 126/127/128/129/131 五个寒离飒·瑟提特效 demo 页的登记：
    //   这五页已移出仓库（搬去同级 _仓库外产物\），清单按旧名 fetch 必 404 → 包内 3 组「读取失败(0 字符)」；
    //   用户拍板「不要了」→ 106 清单 + dev-index 入口一并清除，demo 页不再随包复制
    // 备注：README.md 已不再复制（网页端粘贴不需要它）；其余 MD 文档已归档到 文件汇总20260730/，不参与自动复制
];

// 主题分组（合并为 5 大类）
// 引擎：infra/core/modules/render/content + 入口页面（index、dev-index）
// 播放器：player（战斗执行→画面演出的独立子系统）
// UI（画面特效等）：ui + fx
// 工具：tools
// 体检：tests
export const FILE_GROUPS = [
    { name: 'engine', displayName: '引擎', prefixes: ['../infra/', '../core/', '../modules/', '../render/', '../content/', '../index.html', '../dev-index.html'] },
    { name: 'player', displayName: '播放器', prefixes: ['../player/'] },
    { name: 'ui', displayName: 'UI（画面特效等）', prefixes: ['../ui/', '../fx/'] },
    { name: 'tools', displayName: '工具', prefixes: ['../tools/'] },
    { name: 'tests', displayName: '体检', prefixes: ['../tests/'] }
];

// 主题分析提示词
export const GROUP_PROMPTS = {
    '引擎': {
        before: '请深入分析战斗引擎代码（基础设施、核心战斗、播放器、通用模块、渲染层、游戏内容数据、入口页面）。无需输出详细分析，收到全部代码后直接开始协助开发。',
        after: '战斗引擎代码发送完毕。'
    },
    'UI（画面特效等）': {
        before: '请深入分析 UI 与特效代码（血条渲染、弹窗对话框、飘字弹幕、飞箭冲撞、换位击退、子弹时间）。无需输出详细分析，收到全部代码后直接开始协助开发。',
        after: 'UI 与特效代码发送完毕。'
    },
    '播放器': {
        before: '请深入分析战斗播放器层（战斗日志播放、攻击组渲染、事件处理、动画调度、结算渲染）。播放器是战斗引擎与画面演出之间的独立子系统，重点理解事件→事实→渲染的链路。无需输出详细分析，收到全部代码后直接开始协助开发。',
        after: '播放器层代码发送完毕。'
    },
    '工具': {
        before: '请深入分析工具箱代码（自动战斗、工具箱UI、日志复盘、海克斯仪表盘、职业平衡分析、精英评测、商店）。无需输出详细分析，收到全部代码后直接开始协助开发。',
        after: '工具箱代码发送完毕。'
    },
    '体检': {
        before: '请深入分析测试与体检代码（健康检查、单元测试、运行时采样、体检规则）。无需输出详细分析，收到全部代码后直接开始协助开发。',
        after: '体检代码发送完毕。'
    }
};