// V6.0.68 | 2026-11-12 工作区清理（零引用大件归档，包内容不变）：
//           ① ARCHIVE_FILES 追加 archive/141voice-commentary-demo.html（830 KB）与
//              archive/142voice-audition.html（1.5 MB）——原在 tests/，全库零引用、不在打包清单；
//              语音工具本体 tools/836、837 仍在用，搬走的只是演示/试听页；
//           ② archive/lab-stage3.md、lab-stage3-patched.md（原 tools/output/ 的 2026-09-28 旧报告）
//              有意**不登记**，理由见 ARCHIVE_FILES 处注释；
//           ③ tools/output/lineups-stage3.json **未动** —— 它是 821-param-lab 的默认输入。
// V6.0.67 | 2026-11-11 主代码「📊 走势分析」下线、分析代码搬进工具箱：
//           ① 清单删 player/514-battle-log-analyze.js（文件已删，改由 tools/845-battle-log-analyze.js 承接，
//              845 按老板要求归 ARCHIVE_FILES「📦 存档」组，不随主代码包/工具包发出）；
//           ② 删 tools/839-reflect-eval.html（「🛡️ 弱精英测评」已并入 802「🐦 弱精英评测」页签 = 846）。
export const VER = 'tools/806-ai-pack-config.js V6.0.68';

// AI 复制包踢除清单（803-toolkit.js 的 FILES 过滤会无条件跳过这里的文件）
// 2026-09-04 用户决定不再精简：特效/音效/错误面板/入口页全部随包发送。
// 2026-09-16 73/74 两版备选CG 已从仓库删净（无引用），排除表清空。
// 2026-10-31 用户拍板：新手引导 / 开场CG / 角色名片（图鉴）/ 海克斯手选弹窗属纯演出层，
//   网页端改战斗逻辑用不上 → 剔出复制包（共省约 42 KB）。游戏运行不受影响（只影响发包）。
//   ⚠️ 这些文件被主控 import（ui/702/703/704/705/706/716/717、render/414），包内会出现「import 指向缺失文件」，
//   属预期而非 bug；AI_INTERFACE_NOTE 与 103 的索引/路径清单都从本集合自动生成说明，改这里不用改文案。
// ❌ 2026-11-10 复核：上述「剔 5 件」的判定**已全部推翻**，本表现为空。逐件去向——
//   · 712-tutorial / 713-opening-cg → 已真正断链并搬 archive/（改归 ARCHIVE_FILES，独立「📦 存档」组）；
//   · 711-buff-dialog → 误判（player/512 每次选海克斯都调它，属核心玩法），已加回；
//   · 710 / 414-role-cards → 误判（被 render/403、406、ui/703、706、fx/616 五处依赖、历史改动 39 笔仍在动），已加回。
//   教训：「纯演出层」不等于「AI 用不上」——显示层恰恰是 AI 改内容（加精英/换图标/改短名）时的必改项。
//   判据应是「改动频率 + 被依赖数」，不是「看起来像不像画面」。详见 AI_EXCLUDE 定义处的完整说明。
export const AI_EXCLUDE = new Set([
    // 2026-11-10 下线存档：712-tutorial / 713-opening-cg 已搬 archive/（真正断链，不在主代码里了），
    //   故从本排除表移出——它们现在归 ARCHIVE_FILES 管（独立「📦 存档」组，默认不勾，不随包）。
    //   排除表只装「仍在主代码里、但不想随包」的文件，两者语义不同，别混。
    //
    // 2026-11-10 撤出 711-buff-dialog：它被 ui/704 注册成 UIHandler、player/512 战斗流程每次选海克斯都调用，
    //   属核心玩法不是纯演出层。原先被剔出包是误判——发给网页端的包里若缺它，512 的 showBuffPopup 调用
    //   会指向缺失文件，AI 读代码会以为海克斯手选不存在。
    //
    // 2026-11-10 撤出 710/414-role-cards（原注释误标为「角色名片（图鉴）」，老板核对后确认是**漏**不是有意）：
    //   ① 它是 render/403 格子图标、render/406 文本归一、ui/703 技能栏、ui/706 日志标签、fx/616 的共同依赖，
    //      缺了它 AI 读这 5 个文件的 import 全是断的，根本读不懂格子渲染怎么出图标；
    //   ② 改动频率实测 **39 笔**且仍在动（金毛狮王短名、金刚不坏飘字、反伤弟子图标…），
    //      历次「新增精英」提交都把它列为必改的 7 处之一（如空见：content+02unit+17schema+16护罩+26组件+注册+37名片）。
    //      即它跟「加内容」强绑定，不是「几乎不改」的死文件。
    //   ③ 原先判「纯演出层」不准确：图标/短名/技能说明确实是显示用途，但显示层正是 AI 改内容时要动的地方。
    //
    // 本表当前为空（保留集合结构：将来再有「还在主代码里但确实不想随包」的纯演出件，往这里加）。
    //   ⚠️ 2026-10-31 那轮「剔出 5 件省 42 KB」的判定已基本推翻：4 件已移出（3 件归 archive/、1 件是误判），
    //      剩下 0 件。发主代码包时不再有静默缺失的 import 目标。
]);

// ── 存档层清单（archive/）：下线了但留着以防将来要用 ──────────────────────────
// 和 AI_EXCLUDE 的区别（这条最容易混，写清楚）：
//   AI_EXCLUDE = 文件**还在主代码里、还在被 import**，只是不想让它随包发（纯演出层）。
//   ARCHIVE_FILES = 文件**已经不在主代码链上了**（搬进 archive/），复制器给它们单开一组，
//     **默认不勾选**，所以正常发主代码包时它们不会被带进去。
//
// 为什么单独开一组、不塞进「工具」组：老板明确要求——工具组本来就大，
//   给网页端发工具包时不该再额外背上这些不用的存档件。
//   要发的时候在这一组里手动勾，不想要就当它不存在。
//
// 维护：新增存档件时在这里加一行 + archive/README.md 的表格加一行 + 在那里写清「怎么捡回来」。
export const ARCHIVE_FILES = [
    '../archive/712-tutorial.js',   // 新手引导（原 ui/712-tutorial.js，2026-11-10 下线）
    '../archive/713-opening-cg.js', // 开场 CG（原 ui/713-opening-cg.js，2026-11-10 下线）
    // 2026-11-11 主代码「📊 走势分析」下线：分析模块从 player/514 搬进工具箱。
    //   老板要求「复制包不要复制它，但复制器里要能看到、归到存档」→ 登记在这里（存档组默认不勾、
    //   不随主代码包/工具包发出），803 的分组逻辑另有 ARCHIVE_ONLY 覆盖，把它从「工具」组挪进本组。
    '../tools/845-battle-log-analyze.js',
    // 2026-11-12 工作区清理：零引用的大件演示页从 tests/ 搬进 archive/（830 KB / 1.5 MB）。
    //   语音解说本体（tools/836-voice-commentary.js、837-voice-panel.js）仍在用、不受影响；
    //   搬走的只是演示/试听页，全库零引用、也不在打包清单里。
    '../archive/141voice-commentary-demo.html',
    '../archive/142voice-audition.html'
    // 另外两件存档**有意不列**（列了就会出现在复制器里，徒增勾选的诱惑）：
    //   · archive/展示与CG/精英展示-04-…html  —— 524 KB，图鉴嵌页。列表里出现它只会诱导误勾，把包撑爆；
    //     要恢复照 archive/README.md 表格搬回 展示与CG/ 即可。
    //   · archive/tutorial-styles.css         —— 复制器只收 .js/.mjs/.html/.cjs/.md/.json，.css 本就不在可选面内。
    //   · archive/702-showEliteGallery.snippet.js —— 参考代码片段，非可运行模块，同样不列。
    //   · archive/lab-stage3.md / lab-stage3-patched.md —— 2026-09-28 的历史实验报告，纯文本存档
    //     （2026-11-12 同批从 tools/output/ 搬入）；注意 tools/output/lineups-stage3.json **没搬**，
    //     它是 821-param-lab 的默认输入，搬走会让工具少个默认样本。
];
// AI 上下文契约
// 「已剔除」段随 AI_EXCLUDE 自动生成（不手写，避免集合与文案双源漂移）
export const AI_INTERFACE_NOTE = `// ============================================================
// AI 上下文提示：本项目按主题打包发送。
// 运行文件（引擎/播放器/UI/特效/音效/工具箱/体检/入口页）均已含在包中。
// ============================================================${AI_EXCLUDE.size ? `

// ============================================================
// ⚠️ 已按用户要求剔除 ${AI_EXCLUDE.size} 个纯演出层文件（不在包内）：
${[...AI_EXCLUDE].map(f => `//   ⊘ ${f.replace(/^\.\.\//, '')}`).join('\n')}
// 这些只做画面展示，不含战斗逻辑。
// 主控里对它们的 import 仍写在源码中 → 包内看到「找不到该文件」属预期，不是代码 bug，
// 不要追问「请补发」。确实需要时按 raw 单读：
//   https://raw.githubusercontent.com/luzhigui/new-acode-repo/main/<上面路径去掉 ../ 后>
// ============================================================` : ''}`;

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
    '../infra/101-event-bus.js',
    '../core/201-config-5v5-test.js', '../core/202-unit.js',
    '../core/203-battle-utils.js', '../core/204-buff-system.js', '../core/205-battle-horse.js',
    '../infra/102-core-utils.js', '../infra/103-clock.js', '../infra/106-battle-enums.js', '../infra/107-fact-contract.js', '../infra/108-state-change.js', '../infra/109-net-pvp.js', '../infra/110-view-sheet.js',
    // 2026-10-31 补登记 62：特效门控（订阅链改造产物，fx 层统一入口判定；漏登则包内 import 断裂）
    '../infra/111-fx-gate.js',
    '../core/208-registry-elite.js',
    '../core/209-battle-attack.js', '../core/210-battle-round.js', '../core/211-battle-attack-steps.js',
    // 2026-10-21 补登记 12 拆分件：攻击链/攻击边（211-battle-attack-steps 的同批产物，包内引用）
    '../core/212-battle-attack-chain.js', '../core/213-battle-attack-edge.js',
    '../core/214-battle-shared.js', '../core/215-buff-effects.js', '../core/216-skill-mechanisms.js',
    '../core/217-effect-handlers.js', '../core/218-state-keys.js', '../core/219-mechanic-registry.js', '../core/220-unit-watch.js',
    // 2026-10-16 注册面归位批：闪避规则表 / 计算修饰器表分别迁入 core/221-registry-dodge、core/222-registry-calc
    '../core/221-registry-dodge.js', '../core/222-registry-calc.js',
    // 2026-10-25 补登记 23：表现参数表（倍速表现统一配置，core/216-skill-mechanisms、player/501-player-text、player/509-attack-group、fx/602-fx-arrows-5v5-test、fx/603-fx-crash-5v5-test、fx/615-fx-hanlisa-burst、infra/106-battle-enums 等消费；
    // 漏登则包内这些消费点 import 断裂）
    '../core/223-perf-params.js',
    '../core/206-battle-runner.js',
    '../core/207-target-strategies.js',
    // player（播放器）
    '../player/501-player-text.js', '../player/502-player-buff-ui.js', '../player/503-player-core.js',
    // 2026-10-24 补登记：生涯记录（42player-core 已 import；dev-index 生涯按钮也动态 import）
    '../tools/852-career-log.js',
    // 2026-10-21 补登记 42 拆分件：播放步/阶段动作/步同步（42player-core 的同批产物）
    '../player/504-player-play-step.js', '../player/505-player-stage-actions.js', '../player/506-player-step-sync.js',
    '../player/507-battle-player-5v5-test.js', '../player/508-event-handlers.js', '../player/509-attack-group.js', '../player/510-renderer.js',
    '../player/511-battle-report.js', '../player/512-battle-flow.js',
    // 2026-10-08 补登记 50：玩家层战报导出（42/61/64/68 已 import）
    // 2026-11-11 51（战报日志分析）已从 player 迁入工具箱 tools/845-battle-log-analyze.js，
    //   按老板要求归「📦 存档」组、不随包 —— 见 ARCHIVE_FILES，不在此处登记
    '../player/513-battle-export.js',
    // ui（UI 主控）
    '../ui/701-main-utils.js', '../ui/702-main-5v5-test.js', '../ui/703-ui-render-5v5-test.js',
    '../ui/704-main-state.js', '../ui/705-main-dialogs.js', '../ui/706-main-battle.js',
    '../ui/707-audio-control.js', '../ui/708-fx-trigger.js', '../ui/709-ui-controls.js',
    // 2026-10-04 补登记 69-role-cards：角色名片表（ui/703-ui-render-5v5-test、ui/706-main-battle、render/403-grid-render 已 import）
    '../ui/710-role-cards.js',
    '../ui/715-reset-runtime.js', '../ui/711-buff-dialog.js',
    // 2026-11-10 清除死登记：ui/712-tutorial / ui/713-opening-cg 已搬进 archive/（登记改走 ARCHIVE_FILES +
    //   「📦 存档」组），这两行是搬走时该删未删留下的 → check-manifest --strict 报「清单指向不存在的文件」。
    //   **勿补回**：文件已不在主代码链上。
    // 2026-10-11 补登记 75/76：ui/702-main-5v5-test 减负批拆出的联网会话与战报回放入口（ui/702-main-5v5-test、ui/709-ui-controls 已 import）
    '../ui/716-net-session.js', '../ui/717-replay-entry.js',
    // 2026-10-14 补登记 77/78：ui/709-ui-controls 三拆产物（77 倍速系统、78 按钮状态+buff 槽，709 入口 re-export 二者；漏登则包内引用断裂）
    '../ui/718-speed-controls.js', '../ui/719-button-state.js',
    // 2026-10-19 补登记 79：蓄意轰拳瞄准黑幕（ui/706-main-battle 已 import；漏登则包内引用断裂）
    '../ui/720-hanlisa-aim.js',
    // 2026-10-25 补登记 80：8x 参数面板（表现参数表 core/223-perf-params 的调参面板；漏登则包内引用断裂）
    '../ui/721-perf-panel.js',
    // 2026-10-31 补登记 81：buff 提示浮层（漏登则包内 import 断裂）
    '../ui/722-buff-tooltip.js',
    // 2026-11-01 补登记 714：联网从机 / 战报回放共用的会话初始化件（716、717 已 import，漏登则包内断链）
    '../ui/714-session-common.js',
    // fx（特效）
    '../fx/601-fx-common-5v5-test.js', '../fx/602-fx-arrows-5v5-test.js', '../fx/603-fx-crash-5v5-test.js',
    '../fx/604-fx-position-swap.js', '../fx/605-fx-push-back.js', '../fx/606-fx-dodge-bullet.js',
    '../fx/607-fx-butterfly-spider.js', '../fx/608-fx-manager.js', '../fx/609-fx-trigger.js', '../fx/610-fx-subscriber.js',
    '../fx/611-fx-ref-manager.js', '../fx/612-hanlisa-charge.js', '../fx/613-fx-lion-roar.js', '../fx/614-fx-pang-antics.js', '../fx/615-fx-hanlisa-burst.js', '../fx/616-tangwenliang-dash.js',
    // 2026-10-24 补登记：render/420-actions-defs 动态 import 的空见护罩碎裂特效
    '../fx/617-immune-shield-break.js',
    // modules（通用系统 + 精英角色组件）
    // 2026-10-02 补登记 00reg-mechanics：机制装配统一入口（ui/702-main-5v5-test 唯一 import 点，307~328、331 经它装载）
    '../modules/301-reg-mechanics.js',
    '../modules/302-elite-skills.js', '../modules/303-error-capture.js', '../modules/304-audio-manager.js',
    // 2026-10-21 补登记 23：精英通用助手（26/27 组件共用）
    '../modules/305-elite-helpers.js',
    '../infra/104-global-store.js', '../infra/105-fx-signals.js', '../modules/330-battle-init.js', '../modules/306-battle-store.js',
    '../modules/307-elite-imperial.js', '../modules/308-elite-sixsects.js', '../modules/317-elite-mingjiao.js',
    // 2026-10-17 补登记 27 九组件：317-elite-mingjiao.js 拆成 barrel + 8 角色文件（V7.2.0 纯搬零行为）后新增
    //   寒离飒（新精英）——27 barrel 逐字 import 它们，漏登则包内明教精英全部引用断裂
    '../modules/318-elite-mingjiao-eagle.js', '../modules/319-elite-mingjiao-hanlisa.js',
    '../modules/320-elite-mingjiao-zhangwuji.js', '../modules/321-elite-mingjiao-weiyixiao.js',
    '../modules/322-elite-mingjiao-xiaozhao-sister.js', '../modules/323-elite-mingjiao-xiaozhao-brother.js',
    // 2026-10-31 补登记：妹永久背水专属组件（301-reg-mechanics.js 已 import，漏登则包内装配断链）
    '../modules/324-elite-mingjiao-brother-laststand.js',
    // 2026-10-31 补登记说不得：明教精英（26/27 同批落地，漏登则包内 import 断裂）
    '../modules/325-elite-mingjiao-shuobude.js',
    '../modules/326-elite-mingjiao-xiexun.js', '../modules/327-elite-mingjiao-yangxiao.js',
    '../modules/328-elite-mingjiao-yintianzheng.js',
    // 2026-10-13 补登记 26 六组件：308-elite-sixsects.js 拆分出的组件文件（26 入口 import 它们，漏登则包内引用断裂）
    '../modules/310-elite-sixsects-songqingshu.js', '../modules/309-elite-sixsects-zhouzhiruo.js',
    '../modules/311-elite-sixsects-zhangsanfeng.js', '../modules/312-elite-sixsects-pangyuanqiao.js',
    '../modules/313-elite-sixsects-miejueshitai.js', '../modules/314-elite-sixsects-hetaichong.js',
    // 2026-10-17 补登记：唐文亮组件文件（26 入口已 registerElite，V6.0.23 六组件批时它尚未拆出、后拆时漏登）
    '../modules/315-elite-sixsects-tangwenliang.js',
    // 2026-10-24 补登记：空见组件文件（26 入口已 import createKongJianComponent）
    '../modules/316-elite-sixsects-kongjian.js',
    '../modules/329-buff-tools.js', '../modules/331-custom-effects.js',
    '../modules/332-career-log.js',
    // 2026-11-06 补登记：新普通兵三机制（301-reg-mechanics.js L9-11 已 import，漏登则包内装配断链）
    '../modules/333-elite-mingjiao-crazy.js', '../modules/334-common-absorb.js', '../modules/335-common-heal-ally.js',
    // render（渲染层）
    '../render/401-fact-renderer.js', '../render/402-stage-actions.js', '../render/403-grid-render.js',
    // 2026-10-21 补登记 32 拆分件：格徽章/格单元（403-grid-render 的同批产物）
    '../render/404-grid-badges.js', '../render/405-grid-cells.js',
    '../render/406-fact-registry.js', '../render/407-facts-attack.js', '../render/408-facts-effect.js', '../render/413-generic-renderers.js',
    // 2026-10-21 补登记 35 拆分件：控制/治疗/杂项/属性四族（35-facts-effect 的同批产物）
    '../render/409-facts-control.js', '../render/410-facts-heal.js', '../render/411-facts-misc.js', '../render/412-facts-stat.js',
    // 2026-10-11 补登记 37：角色名片表从 ui/710 转口迁入 render（消除 render→ui 反向依赖；ui/703、ui/706、render/403 已 import）
    '../render/414-role-cards.js',
    '../render/415-actions-translate.js',
    // 2026-10-13 补登记 38 四族：415-actions-translate.js 拆分出的 fact 族翻译器文件（38 入口 import 它们，漏登则包内引用断裂）
    '../render/416-actions-translate-attack.js', '../render/418-actions-translate-heal.js',
    '../render/417-actions-translate-control.js', '../render/419-actions-translate-stat.js',
    '../render/420-actions-defs.js',
    // content（游戏内容数据）
    '../content/001-game-data.json',
    // 2026-10-31 补登记 201：小昭 hexEnhance（姐妹强化/妹永久）已从 200 迁出到独立文件，
    //   core/201-config-5v5-test 的 getSkillParams / getBrotherHexEnhance 与 modules/317-328、329-buff-tools 都读它，漏登则包内直接抛「缺 sister 段」。
    '../content/002-hex-enhance.json',
    // 2026-11-11 补登记：805-shop.html 运行时 fetch 商店配置，漏登则包内商店页读不到配置
    '../content/003-shop-config.json',
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
    // 2026-09-29 补登记：skills.params 引擎真读字段漂移守卫（import tools/824-param-lab-glossary.js 的 ENGINE_READ 表）
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
    // 2026-10-28 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/second-source-scan.mjs',
    // 2026-10-28 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/commit-claim-audit.mjs',
    // 2026-10-28 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/guard-presence-scan.mjs',
    // 第 161 轮冲突裁决：上游登记的两个文件一并保留，两侧登记不删。
    // 2026-10-30 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/layer-direction-scan.mjs', '../tests/layer-direction-baseline.json',
    // 2026-10-30 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/spider-dead-target-case.mjs',
    // 2026-10-30 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/hex-boot-chain-guard.mjs',
    // 2026-10-30 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/phantom-confuse-brother-case.mjs',
    // 2026-10-30 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/signal-channel-guard.mjs',
    // 2026-10-30 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/xiaozhao-horse-carry-case.mjs',
    // 2026-10-31 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/claw-hit-shield-split.mjs', '../tests/xiaozhao-naming-guard.mjs',
    // 2026-10-31 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/output-label-coupling-guard.mjs',
    // 2026-11-01 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/hls-playback-ownership-guard.mjs',
    // 2026-11-01 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/mutation-freshness-tripwire.mjs',
    // 2026-11-01 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/force-switch-registry-drift-guard.mjs',
    // 2026-11-05 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/fact-coverage-selftest.mjs', '../tests/health-rules-syntax-sweep.mjs', '../tests/manifest-fresh-selftest.mjs', '../tests/registry-cross-check.mjs',
    // 2026-11-06 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/mechanics-install-selftest.mjs', '../tests/pick-key-line-selftest.mjs', '../tests/run-all-integrity-selftest.mjs',
    // 2026-11-07 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/mutation-anchor-tripwire.mjs',
    // 2026-11-07 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/relay-drift-guard.mjs',
    // 2026-11-08 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/nightly-merge-guard.mjs',
    // 2026-11-08 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/mutation-fp-eol-selftest.mjs',
    // 2026-11-09：转交队列出口守门 + 其存量基线（基线不进包则守门报「基线缺失」）
    '../tests/transfer-exit-guard.mjs', '../tests/transfer-exit-baseline.json',
    // 2026-11-10：多会话文件所有权（守门 + 唯一真值表 + 启动提示词生成）
    '../tests/_registry/session-scope.json', '../tests/session-scope-guard.mjs', '../tests/session-start.mjs',
    // 2026-11-11 合入夜间 207：飞天三档跨档判定守卫（已挂 OBSERVES，夜间漏登）
    '../tests/spider-tier-leap-guard.mjs',
    // 2026-11-08 自动补全：health-rules 173–266 被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/health-rules/173-hp-death-revive.js', '../tests/health-rules/174-ally-roster.js', '../tests/health-rules/175-ally-anchor-pos.js', '../tests/health-rules/176-enemy-stage-roster.js',
    '../tests/health-rules/177-enemy-mix-integrity.js', '../tests/health-rules/178-stage3-variant.js', '../tests/health-rules/179-hex-enhance-contract.js', '../tests/health-rules/180-damage-precision.js',
    '../tests/health-rules/181-round-sequence.js', '../tests/health-rules/182-target-validity.js', '../tests/health-rules/183-action-order.js', '../tests/health-rules/184-death-revive-rights.js',
    '../tests/health-rules/185-log-group-consistency.js', '../tests/health-rules/186-display-single-exit.js', '../tests/health-rules/187-damage-float-same-source.js', '../tests/health-rules/188-multi-attack-count.js',
    '../tests/health-rules/190-zhou-dian-crazy-chain.js', '../tests/health-rules/191-tangwenliang-qishang.js', '../tests/health-rules/192-pengyingyu-doubleface.js', '../tests/health-rules/193-hebiweng-hornstrike.js',
    '../tests/health-rules/194-chengkun-phantom.js', '../tests/health-rules/195-shuobude-bag.js', '../tests/health-rules/196-tangwenliang-huichun.js', '../tests/health-rules/197-tangwenliang-tonggui.js',
    '../tests/health-rules/198-zhangwuji-qiankun.js', '../tests/health-rules/199-hp-chain-same-source.js', '../tests/health-rules/200-group-entry-order.js', '../tests/health-rules/202-xuanming-poison-dot.js',
    '../tests/health-rules/203-xiexun-lion-grow.js', '../tests/health-rules/204-xiexun-lion-inspire.js', '../tests/health-rules/205-zhuangzheng-duanchui.js', '../tests/health-rules/227-buff-lifecycle.js',
    '../tests/health-rules/228-buff-effect-decl.js', '../tests/health-rules/229-buff-permanent.js', '../tests/health-rules/230-cross-group-hp-trajectory.js', '../tests/health-rules/231-revive-chain.js',
    '../tests/health-rules/232-revive-action-quota.js', '../tests/health-rules/233-battle-end-state.js', '../tests/health-rules/234-round-settlement-order.js', '../tests/health-rules/235-final-unit-consistency.js',
    '../tests/health-rules/236-round-boundary.js', '../tests/health-rules/237-mod-entry-shape.js', '../tests/health-rules/238-decl-vs-ledger.js', '../tests/health-rules/239-qiankun-decl-vs-ledger.js',
    '../tests/health-rules/240-qiankun-accumulation.js', '../tests/health-rules/241-round-entry-duplicate.js', '../tests/health-rules/242-stat-closure.js', '../tests/health-rules/243-move-payload-validity.js',
    '../tests/health-rules/244-push-payload-selfconsistent.js', '../tests/health-rules/245-javelin-range-select.js', '../tests/health-rules/246-empty-target-explicit.js', '../tests/health-rules/247-target-selectable-state.js',
    '../tests/health-rules/248-landing-snapshot-consistency.js', '../tests/health-rules/255-rewind-silent-switch.js', '../tests/health-rules/256-rewind-account-isolation.js', '../tests/health-rules/257-rewind-play-from-current.js',
    '../tests/health-rules/258-rewind-state-cleanup.js', '../tests/health-rules/259-summon-uid-trace.js', '../tests/health-rules/260-summon-death-closure.js', '../tests/health-rules/261-horse-slot-lifecycle.js',
    '../tests/health-rules/262-butterfly-window-pairing.js', '../tests/health-rules/263-butterfly-window-no-action.js', '../tests/health-rules/264-lion-grow-timing.js', '../tests/health-rules/265-rewind-settle-same-authority.js',
    '../tests/health-rules/266-heal-amount-same-source.js', '../tests/hex-dual-effect-check.mjs', '../tests/hex-enhance-wiring-guard.mjs',
    // 2026-11-09 合并夜间 195–199：补登夜间新增/白天未登记的体检脚本
    '../tests/health-rules/267-growth-decl-vs-ledger.js', '../tests/health-rules/268-growth-curve-quantity.js', '../tests/health-rules/269-panel-stored-vs-ledger.js', '../tests/health-rules/270-ttl-expiry-closure.js', '../tests/health-rules/283-post-death-action.js', '../tests/health-rules/284-battle-end-race.js', '../tests/health-rules/285-settlement-order.js', '../tests/hex-config-closure-check.mjs', '../tests/meteor-growth-render-selftest.mjs', '../tests/wei-leech-quota-selftest.mjs',
    // 2026-11-10 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错
    '../tests/entry-path-guard.mjs', '../tests/health-rules/249-position-bounds-unique.js', '../tests/health-rules/250-swap-permutation-closure.js', '../tests/health-rules/251-post-swap-followup.js',
    '../tests/health-rules/252-phantom-fact-completeness.js', '../tests/health-rules/253-rewind-write-surface.js', '../tests/health-rules/254-rewind-write-dynamic.js', '../tests/health-rules/271-absorb-summary-same-source.js',
    '../tests/health-rules/272-hidden-renderer-outlets.js', '../tests/health-rules/273-rewind-progress-boundary.js', '../tests/health-rules/274-rewind-speed-boundary.js', '../tests/health-rules/277-d9-holy-fire-enhance.js',
    '../tests/health-rules/278-d9-fortify-enhance.js', '../tests/health-rules/279-d9-mind-control-enhance.js', '../tests/health-rules/280-d9-horse-formation-enhance.js', '../tests/health-rules/286-stage-variant-truth.js',
    '../tests/health-rules/287-stage-name-source.js', '../tests/health-rules/288-enemy-elite-pos.js', '../tests/health-rules/289-control-target-trace.js', '../tests/health-rules/290-control-attacker-identity.js',
    '../tests/health-rules/291-control-trace-on-edge.js', '../tests/health-rules/292-control-stacking-crazy.js', '../tests/health-rules/293-control-cleanup-on-release.js', '../tests/health-rules/294-double-face-retarget.js',
    '../tests/health-rules/301-disciple-rebound-account.js', '../tests/health-rules/302-control-window-consistency.js', '../tests/health-rules/303-damage-printed-vs-hp.js', '../tests/health-rules/304-break-def-order-and-zero.js',
    '../tests/health-rules/305-true-splash-display-source.js', '../tests/health-rules/306-damage-rounding-granularity.js', '../tests/health-rules/307-hetaichong-liangyi-pair.js', '../tests/health-rules/308-hetaichong-mark-lifecycle.js',
    '../tests/health-rules/309-hetaichong-red-swap-account.js', '../tests/health-rules/319-d10-mod-mul-truth.js', '../tests/health-rules/320-d10-decl-ledger-mul.js', '../tests/health-rules/321-d10-mod-lifecycle.js',
    '../tests/health-rules/322-d10-brother-laststand-ledger.js', '../tests/health-rules/323-d10-flyer-kill-growth.js', '../tests/health-rules/325-d6-butterfly-host-cleanup.js', '../tests/health-rules/326-d6-butterfly-window-payload.js',
    '../tests/health-rules/327-d6-summon-authorship.js', '../tests/health-rules/328-d6-summon-death-exit.js', '../tests/health-rules/329-d6-roster-stats-purity.js',
    // tools（开发工具箱）
    '../tools/802-toolkit.html', '../tools/803-toolkit.js',
    '../tools/805-shop.html', '../tools/806-ai-pack-config.js', '../tools/806b-server.js',
    '../tools/807-battle-log-viewer.js', '../tools/808-hex-dashboard.js',
    '../tools/809-role-balance.js', '../tools/816-role-balance-worker.js', '../tools/817-shared-worker-runner.js', '../tools/810-role-balance-random.html',
    '../tools/812-elite-eval.js', '../tools/813-stats-check.js',
    '../tools/814-baseline-compare.js', '../tools/815-lineup-search.js',
    '../tools/818-import-export-check.mjs',
    '../tools/820-param-lab.html', '../tools/822-param-lab-core.js', '../tools/823-param-lab-worker.js', '../tools/824-param-lab-glossary.js',
    // 2026-10-25 补登记 119/121：TOOL-AI 与工具箱文档引用的 node 直跑入口（参数 A/B 调优器 / 参数实验室主脚本）
    '../tools/819-auto-tuner.mjs', '../tools/821-param-lab.mjs',
    // 2026-10-18 补登记 126：工具箱「🚨 平衡告警」按钮的实现（102 V6.1.3 挂 module 脚本）
    '../tools/826-balance-alert.js',
    // 2026-10-22 补登记 127：工具箱共用名单与文案表（112/126/122/116/108 的单一来源；
    // 漏登则包内这些工具 import 断裂）
    '../tools/827-tool-registry.js',
    // 2026-10-19 补登记 133：dev-index V6.3.17「📖 文档与准则」文本入口的 MD 阅读器
    //（起点读书式阅读页，漏登则包内 dev-index 文档按钮点开 404）
    '../tools/833-md-reader.html',
    // 2026-10-22 补登记 134/135：创意摸奖（自带元素池 + 手动维护的外部词条池）与参数扫描
    //（135 依赖 123 V1.2.0 的 stages 多关支持；134 只读 content，不跑战斗）
    '../tools/834-idea-lab.html', '../tools/834-fetch-pool.mjs', '../tools/834-idea-pool-additions.json',
    '../tools/835-param-scan.html',
    // 2026-10-25 补登记：语音解说从主游戏下线，搬到 tools 存档（136 引擎 / 137 设置面板）
    '../tools/836-voice-commentary.js', '../tools/837-voice-panel.js',
    // 2026-11-11 弱精英评测从 812 拆出，独立成 802「🐦 弱精英评测」页签（838 弱精英机制贡献单页已下线删除）
    '../tools/846-weak-elite-eval.js',
    // 2026-11-10 补登记 831：消融实验室单页（802 备用工具卡片「🧪 消融实验室」直接打开，跑批走 816 V1.22.0
    //   kind:'ablation'，开关 globalThis.MING_ABLATION）。与 833/834/835/838 同类的**页面件**，
    //   属「网页端阅读需要」——漏登则包内工具箱点开这张卡 404。（对照：828/829/830 是本机 node 脚本，
    //   按本表 2026-09-26 定案不纳入、不补登。）
    '../tools/831-ablation-lab.html',
    // 2026-11-11 删 tools/839-reflect-eval.html：原「🛡️ 弱精英测评」单页已并入 802「🐦 弱精英评测」页签（846）
    // 2026-11-01 补登记：GitHub Pages 版本化构建 + 复制包清单自检（都是纯 Node 脚本，随包供网页端核对清单完整性）
    '../tools/build-versioned-site.mjs', '../tools/check-manifest.mjs',
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
    // 有意不收录：debug-dash.html / hanlisa-grapple-demo.html（本地调试页）、tools/output/*（脚本产物）
    '../index.html', '../dev-index.html',
    // 2026-11-08 补登记 10 个主代码新文件（check-manifest --strict 报出的未登记项）。
    //   漏登 = AI 复制包里这些文件「读取失败(0 字符)」；今后引擎目录新增文件必须同步登记，
    //   verify:tools 已切严格模式，没登记会直接报红。
    '../ui/726-rewind-panel.js', '../ui/727-rewind-core.js',
    '../modules/336-elite-sixsects-yuanzhen.js', '../modules/337-elite-mingjiao-zhuangzheng.js',
    '../modules/338-elite-mingjiao-pengyingyu.js', '../modules/339-elite-mingjiao-zhangzhong.js',
    '../fx/618-fx-timeline.js', '../fx/619-skill-cues.js', '../fx/620-sword-rain.js',
    '../infra/112-store-schema.js',
    // 2026-11-10 下线存档层：这些文件已从主代码链断开（搬进 archive/），登记在此只为让复制器
    //   能列出「📦 存档」独立组（默认不勾）。不登记则复制器里根本看不到它们，想捡回来时无从下手。
    //   注意：它们**不在**引擎/UI/工具/体检任何一组里，不会随正常包发出。
    ...ARCHIVE_FILES
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
    { name: 'tests', displayName: '体检', prefixes: ['../tests/'] },
    // 2026-11-10 第六类：下线存档层。老板要求——这些「不用了但怕以后要」的东西
    //   既不该进主代码包（拖大），也不该进工具包（工具组本来就太大、更没必要），
    //   所以单开一组，**默认不勾选**，要用时手动勾上发。
    //   必须排在最后：803 的分组循环是「第一个前缀命中即归组」，而兜底逻辑会把
    //   没匹配上的文件塞进第一组（引擎）——本组前缀写死 ../archive/，不参与兜底。
    { name: 'archive', displayName: '📦 存档（不随包）', prefixes: ['../archive/'] }
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
    },
    // 2026-11-10 下线存档组专用提示词：只有老板手动勾选这一组发出去时才会用到
    '📦 存档（不随包）': {
        before: '以下是本项目**已下线但保留存档**的代码（新手引导 / 开场CG 等，见 archive/README.md 的清单与捡回方法）。这些文件当前**不在运行链上**，请勿据此判断游戏功能存在缺失，也不要主动把它们接回主代码。仅在我明确要求恢复时才使用。',
        after: '存档代码发送完毕。'
    }
};