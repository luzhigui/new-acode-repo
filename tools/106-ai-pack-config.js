// tools/106-ai-pack-config.js - 光明顶5v5 AI 复制包配置（清单/分组/提示词/精简踢除）
// V5.9.2 | ~11700 bytes| 2026-08-24 Worker 独立编号：109 战斗端 → 116-role-balance-worker.js
export const VER = 'tools/106-ai-pack-config.js V5.9.2';

// ==================== AI 精简模式踢除清单（第一批） ====================
// 这些文件不参与战斗逻辑/状态同步/数值结算，默认不随包发送。
// 改动画实现/音效/错误面板/入口页时，需向用户单独索取原文。
export const AI_EXCLUDE = new Set([
    // fx 特效实现（统一入口 fx/87fx-manager.js 保留）
    '../fx/80fx-common-5v5-test.js',
    '../fx/81fx-arrows-5v5-test.js',
    '../fx/82fx-crash-5v5-test.js',
    '../fx/83fx-position-swap.js',
    '../fx/84fx-push-back.js',
    '../fx/85fx-dodge-bullet.js',
    '../fx/86fx-butterfly-spider.js',
    // 纯工具
    '../modules/21error-capture.js',
    '../modules/22audio-manager.js',
    '../ui/66audio-control.js',
    // 开发入口页
    '../index.html'
]);

// ==================== AI 上下文契约 ====================
export const AI_INTERFACE_NOTE = `// ============================================================
// AI 上下文提示：本包已启用精简模式，省略部分纯实现文件。
// 被省略：fx 特效实现 7 个、modules/21error-capture.js、
// modules/22audio-manager.js、ui/66audio-control.js、index.html。
// 特效统一入口 fx/87fx-manager.js 已包含，接口签名以该文件为准。
// 改动画/音效/错误面板/入口页实现时，请向用户索取对应文件原文。
// ============================================================`;

// ==================== 项目全部文件清单（全项目唯一数据源） ====================
// 注意：104-toolkit-more.js 的 TARGET_FILES 已改为从本清单派生（自动排除入口页/工具箱页/音频），
// 新增/删除项目文件时只需改这一处，无需再同步 104。
export const ALL_PROJECT_FILES = [
    // core（核心战斗引擎）
    '../infra/50-event-bus.js',
    '../core/01config-5v5-test.js', '../core/02unit.js',
    '../core/03battle-utils.js', '../core/04buff-system.js', '../core/05battle-horse.js',
    '../infra/51-core-utils.js', '../infra/56-battle-enums.js', '../infra/57-calc-modifier-registry.js',
    '../core/08-elite-registry.js',
    '../core/10battle-attack.js', '../core/11battle-round.js', '../core/12battle-attack-steps.js',
    '../core/13battle-shared.js', '../core/14buff-effects.js', '../core/15-skill-mechanisms.js',
    '../core/16effect-handlers.js', '../core/17-state-keys.js', '../core/18-elite-state.js',
    // player（播放器）
    '../player/40player-text.js', '../player/41player-buff-ui.js', '../player/43animation-scheduler.js', '../player/42player-core.js',
    '../player/44battle-player-5v5-test.js', '../player/45event-handlers.js', '../player/46attack-group.js', '../player/47renderer.js',
    // ui（UI 主控）
    '../ui/60main-utils.js', '../ui/61main-5v5-test.js', '../ui/62ui-render-5v5-test.js',
    '../ui/63main-state.js', '../ui/64main-dialogs.js', '../ui/65main-battle.js',
    '../ui/66audio-control.js', '../ui/67fx-trigger.js', '../ui/68ui-controls.js',
    '../ui/69reset-runtime.js', '../ui/70buff-dialog.js',
    // fx（特效）
    '../fx/80fx-common-5v5-test.js', '../fx/81fx-arrows-5v5-test.js', '../fx/82fx-crash-5v5-test.js',
    '../fx/83fx-position-swap.js', '../fx/84fx-push-back.js', '../fx/85fx-dodge-bullet.js',
    '../fx/86fx-butterfly-spider.js', '../fx/87fx-manager.js', '../fx/88fx-trigger.js', '../fx/89fx-subscriber.js',
    // modules（通用系统 + 精英角色组件）
    '../modules/20elite-skills.js', '../modules/21error-capture.js', '../modules/22audio-manager.js',
    '../infra/54-global-store.js', '../infra/55-fx-signals.js', '../modules/29battle-init.js', '../modules/24battle-store.js',
    '../modules/25elite-imperial.js', '../modules/26elite-sixsects.js', '../modules/27elite-mingjiao.js',
    '../modules/28buff-tools.js', '../modules/30custom-effects.js',
    // render（渲染层）
    '../render/30-fact-renderer.js', '../render/31-stage-actions.js', '../render/32-grid-render.js',
    // content（游戏内容数据）
    '../content/200game-data.json',
    // tests（体检规则与自动测试）
    '../tests/120test-runner.html',
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
    '../tests/121health-monitor.js', '../tests/122health-utils.js',
    '../tests/140-baseline.js', '../tests/baselines/baseline-v1.json',
    // tools（开发工具箱）
    '../tools/102-toolkit.html', '../tools/103-toolkit.js', '../tools/104-toolkit-more.js',
    '../tools/105-shop.html', '../tools/106-ai-pack-config.js',
    '../tools/107-battle-log-viewer.js', '../tools/108-hex-dashboard.js',
    '../tools/109-role-balance.js', '../tools/116-role-balance-worker.js', '../tools/117-shared-worker-runner.js', '../tools/110-role-balance-random.html',
    '../tools/112-elite-eval.js', '../tools/113-stats-check.js',
    '../tools/114-baseline-compare.js', '../tools/115-lineup-search.js',
    // 移除了：52-version-calibrator / 53-dead-code-scanner / 54-filelist-checker（这些工作直接问 AI 更高效）
    // 移除了：100build-5v5.cjs（构建脚本已废弃为 .TXT，不再随包复制）
    '../tools/101auto-battle-utils.js',
    // assets（音频资源，不参与 fetch 复制）
    '../assets/sfx_arrow.mp3', '../assets/sfx_fly.mp3',
    '../assets/sfx_melee.mp3', '../assets/sfx_xinai.mp3',
    // 根目录（入口与设计文档）
    // 注意：中文文件名（记录-更改履历.md、待办-bug待修.md）在手机上 fetch 会卡住，已从清单剔除
    '../index.html', '../mode-5v5-test.html'
    // 备注：README.md 已不再复制（网页端粘贴不需要它）；其余 MD 文档已归档到 文件汇总20260730/，不参与自动复制
];

// ==================== 主题分组（合并为 4 大类） ====================
// 引擎：infra/core/player/modules/render/content + 入口页面（index、mode-5v5）
// UI（画面特效等）：ui + fx
// 工具：tools
// 体检：tests
export const FILE_GROUPS = [
    { name: 'engine', displayName: '引擎', prefixes: ['../infra/', '../core/', '../player/', '../modules/', '../render/', '../content/', '../index.html', '../mode-5v5-test.html'] },
    { name: 'ui', displayName: 'UI（画面特效等）', prefixes: ['../ui/', '../fx/'] },
    { name: 'tools', displayName: '工具', prefixes: ['../tools/'] },
    { name: 'tests', displayName: '体检', prefixes: ['../tests/'] }
];

// ==================== 主题分析提示词 ====================
export const GROUP_PROMPTS = {
    '引擎': {
        before: '请深入分析战斗引擎代码（基础设施、核心战斗、播放器、通用模块、渲染层、游戏内容数据、入口页面）。无需输出详细分析，收到全部代码后直接开始协助开发。',
        after: '战斗引擎代码发送完毕。'
    },
    'UI（画面特效等）': {
        before: '请深入分析 UI 与特效代码（血条渲染、弹窗对话框、飘字弹幕、飞箭冲撞、换位击退、子弹时间）。无需输出详细分析，收到全部代码后直接开始协助开发。',
        after: 'UI 与特效代码发送完毕。'
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