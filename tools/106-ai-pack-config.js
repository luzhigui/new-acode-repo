// tools/106-ai-pack-config.js - 光明顶5v5 AI 复制包配置（清单/分组/提示词/精简踢除）
// V5.5.0 | ~10500 bytes| 2026-08-15 从 103-toolkit.js 拆出静态数据，新增 AI_EXCLUDE
export const VER = 'tools/106-ai-pack-config.js V5.5.0';

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

// ==================== 项目全部文件清单 ====================
export const ALL_PROJECT_FILES = [
    // core（核心战斗引擎）
    '../core/00-event-bus.js',
    '../core/01config-5v5-test.js', '../core/02unit.js',
    '../core/03battle-utils.js', '../core/04buff-system.js', '../core/05battle-horse.js',
    '../core/06-fsm.js', '../core/07-rng.js',
    '../core/08-elite-registry.js', '../core/09-battle-event-store.js',
    '../core/10battle-attack.js', '../core/11battle-round.js', '../core/12battle-attack-steps.js',
    '../core/13battle-shared.js', '../core/14buff-effects.js',
    // player（播放器）
    '../player/40player-text.js', '../player/41player-buff-ui.js', '../player/43animation-scheduler.js', '../player/42player-core.js',
    '../player/44battle-player-5v5-test.js', '../player/45event-handlers.js', '../player/46attack-group.js', '../player/47renderer.js',
    // ui（UI 主控）
    '../ui/60main-utils.js', '../ui/61main-5v5-test.js', '../ui/62ui-render-5v5-test.js',
    '../ui/63main-state.js', '../ui/64main-dialogs.js', '../ui/65main-battle.js',
    '../ui/66audio-control.js', '../ui/67fx-trigger.js', '../ui/68ui-controls.js',
    '../ui/69reset-runtime.js',
    // fx（特效）
    '../fx/80fx-common-5v5-test.js', '../fx/81fx-arrows-5v5-test.js', '../fx/82fx-crash-5v5-test.js',
    '../fx/83fx-position-swap.js', '../fx/84fx-push-back.js', '../fx/85fx-dodge-bullet.js',
    '../fx/86fx-butterfly-spider.js', '../fx/87fx-manager.js',
    // modules（通用系统 + 精英角色组件）
    '../modules/20elite-skills.js', '../modules/21error-capture.js', '../modules/22audio-manager.js',
    '../modules/23global-store.js', '../modules/29battle-init.js', '../modules/24battle-store.js',
    '../modules/25elite-imperial.js', '../modules/26elite-sixsects.js', '../modules/27elite-mingjiao.js',
    '../modules/28buff-tools.js',
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
    '../tests/health-rules/132-claw-damage.js',
    '../tests/121health-monitor.js', '../tests/122health-utils.js',
    // tools（开发工具箱）
    '../tools/102-toolkit.html', '../tools/103-toolkit.js', '../tools/104-toolkit-more.js',
    '../tools/105-shop.html',
    // 移除了：52-version-calibrator / 53-dead-code-scanner / 54-filelist-checker（这些工作直接问 AI 更高效）
    '../tools/101auto-battle-utils.js', '../tools/100build-5v5.cjs',
    // assets（音频资源，不参与 fetch 复制）
    '../assets/sfx_arrow.mp3', '../assets/sfx_fly.mp3',
    '../assets/sfx_melee.mp3', '../assets/sfx_xinai.mp3',
    // 根目录（入口与设计文档）
    // 注意：中文文件名（记录-更改履历.md、待办-bug待修.md）在手机上 fetch 会卡住，已从清单剔除
    '../index.html', '../mode-5v5-test.html',
    '../README.md'
    // 备注：其余 MD 文档已归档到 文件汇总20260730/，不参与自动复制
];

// ==================== 主题分组 ====================
export const FILE_GROUPS = [
    { name: 'core', displayName: '战斗引擎核心', prefix: '../core/' },
    { name: 'player', displayName: '播放器', prefix: '../player/' },
    { name: 'ui', displayName: 'UI 主控', prefix: '../ui/' },
    { name: 'fx', displayName: '特效', prefix: '../fx/' },
    { name: 'modules', displayName: '模块', prefix: '../modules/' },
    { name: 'content', displayName: '游戏内容数据', prefix: '../content/' },
    { name: 'tests', displayName: '测试与体检', prefix: '../tests/' },
    { name: 'tools', displayName: '工具箱自身', prefix: '../tools/' },
    { name: 'root', displayName: '根目录页面', prefix: null }
];

// ==================== 主题分析提示词 ====================
export const GROUP_PROMPTS = {
    '战斗引擎核心': {
        before: '请深入分析核心战斗引擎代码（伤害计算、Buff系统、闪避机制、事件总线、特殊角色、拒马海克斯）。无需输出详细分析，收到全部代码后直接开始协助开发。',
        after: '核心引擎代码发送完毕。'
    },
    '播放器': {
        before: '请深入分析播放器代码（事件→动画转换、状态同步、动画调度、文字播放、暂停恢复加速）。无需输出详细分析，收到全部代码后直接开始协助开发。',
        after: '播放器代码发送完毕。'
    },
    'UI 主控': {
        before: '请深入分析UI渲染代码（血条渲染、攻防显示、战斗状态UI、弹窗对话框）。无需输出详细分析，收到全部代码后直接开始协助开发。',
        after: 'UI渲染代码发送完毕。'
    },
    '特效': {
        before: '请深入分析特效代码（飘字弹幕、飞箭冲撞、换位击退、子弹时间）。无需输出详细分析，收到全部代码后直接开始协助开发。',
        after: '特效代码发送完毕。'
    },
    '模块': {
        before: '请深入分析模块代码（精英技能、错误捕获、音频管理）。无需输出详细分析，收到全部代码后直接开始协助开发。',
        after: '模块代码发送完毕。'
    },
    '游戏内容数据': {
        before: '请深入分析游戏内容数据（角色、技能、Buff、台词等配置）。无需输出详细分析，收到全部代码后直接开始协助开发。',
        after: '游戏内容数据发送完毕。'
    },
    '测试与体检': {
        before: '请深入分析测试与体检代码（健康检查、单元测试、运行时采样）。无需输出详细分析，收到全部代码后直接开始协助开发。',
        after: '测试代码发送完毕。'
    },
    '工具箱自身': {
        before: '请深入分析工具箱代码（自动战斗、构建脚本、工具箱UI）。无需输出详细分析，收到全部代码后直接开始协助开发。',
        after: '工具箱代码发送完毕。'
    },
    '根目录页面': {
        before: '请深入分析入口页面和文档（index、mode-5v5、README、CHANGELOG、开发准则、游戏设计）。无需输出详细分析，收到全部代码后直接开始协助开发。',
        after: '入口页面和文档发送完毕。'
    }
};