// eslint.config.mjs — ESLint 扁平配置（2026-10-13 立）
// ─────────────────────────────────────────────────────────────────────────────
// 定位（与体检的分工，别混为一谈）：
//   体检（tests/123static-scan.js 那套）名字里的「静态」= 不跑游戏、只扫文件，扫的是**本项目自己的规矩**
//     （字节数登记 / 锚点行号 / 文件头规范 + import 三类），且只扫 SCAN_FILES 内的文件。
//   ESLint 扫的是 **JavaScript 语言本身写没写错**：删了定义还留着引用 / 未用变量 / 永不执行的代码。
//   两者互补、各管一层：
//     · 体检管「游戏数值 + 项目规矩」——契约全是战斗数值，UI 按钮不在射程。
//     · ESLint 管「代码本身是不是胡写的」——2026-10-03 走势分析按钮点击即炸（定义被删、引用还在），
//       体检跑 84 轮没抓到，这类错 ESLint 一秒就红。
//   ⇒ 别把「静态快检绿」当成「代码没写错」。
//
// 用法：
//   npm run lint          只报 error（CI 口径；warn 不进退出码）
//   npm run lint:warn     连 warn 一起看（未用变量等，收口用）
//   主代码零依赖不受影响：ESLint 只作开发/CI 工具，不进运行时。
// ─────────────────────────────────────────────────────────────────────────────
import globals from 'globals';

export default [
    {
        // 只扫源码；构建产物 / 原生工程 / 打包中间物 / 体检临时探针不入镜
        ignores: [
            'node_modules/**',
            'android/**',
            'dist/**',
            'build/**',
            'web/**',
            'resources/**',
            '文件汇总20260730/**',
            'tests/_tmp-*',
            '**/*.min.js'
        ]
    },
    {
        files: ['**/*.js', '**/*.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
                // Capacitor / WebView 宿主注入（打包运行时用，非 npm 依赖）
                Capacitor: 'readonly',
                cordova: 'readonly'
            }
        },
        linterOptions: {
            reportUnusedDisableDirectives: 'warn'
        },
        rules: {
            // ── 10-03 那类「删了定义引用还在」：硬门禁 ──
            'no-undef': 'error',
            // ── 写错必炸的低级错：硬门禁 ──
            'no-const-assign': 'error',
            'no-dupe-keys': 'error',
            'no-dupe-args': 'error',
            'no-dupe-class-members': 'error',
            'no-unreachable': 'error',
            'no-func-assign': 'error',
            'no-obj-calls': 'error',
            'no-self-assign': 'error',
            'no-sparse-arrays': 'error',
            'no-cond-assign': 'error',
            'no-irregular-whitespace': 'error',
            // ── 未用变量：先 warn（老代码存量噪音大，分批收口，不阻塞 CI）──
            'no-unused-vars': ['warn', {
                args: 'none',
                caughtErrors: 'none',
                varsIgnorePattern: '^_'
            }]
        }
    },
    // ── 分层单向（2026-11-26 立）：`ui/fx → player → render/modules → core → infra` ──
    // 现状实测七层越界 import = 0（infra/core/modules/player/render/fx 反向上层全为 0），
    //   但在加这条规则之前，0 违规全靠人自觉：一次误 import 就破防且不报错（架构铁律第 6 条）。
    // 口径：每条用相对路径 '../<层>/...' 越过本层即报 error。core 额外禁 modules（铁律第 5 条：
    //   核心不得直接 import 精英模块，必须走 core/208 registerElite）。
    {
        files: ['infra/**/*.js'],
        rules: { 'no-restricted-imports': ['error', { patterns: [{
            group: ['../core/*', '../modules/*', '../player/*', '../render/*', '../ui/*', '../fx/*'],
            message: '分层单向：infra 是最底层，不许反向 import 任何上层。'
        }] }] }
    },
    {
        files: ['core/**/*.js'],
        rules: { 'no-restricted-imports': ['error', { patterns: [{
            group: ['../modules/*', '../player/*', '../render/*', '../ui/*', '../fx/*'],
            message: '分层单向：core 只能向下依赖 infra；精英模块必须经 core/208 registerElite 注册，不得直接 import。'
        }] }] }
    },
    {
        files: ['modules/**/*.js'],
        rules: { 'no-restricted-imports': ['error', { patterns: [{
            group: ['../player/*', '../render/*', '../ui/*', '../fx/*'],
            message: '分层单向：modules 只可依赖 core/infra，不许反向 import 视图与演出层。'
        }] }] }
    },
    {
        files: ['player/**/*.js', 'render/**/*.js'],
        rules: { 'no-restricted-imports': ['error', { patterns: [{
            group: ['../ui/*', '../fx/*'],
            message: '分层单向：player/render 不许反向 import ui/fx（跨层通信走 GlobalStore + UIHandler）。'
        }] }] }
    },
    {
        files: ['fx/**/*.js'],
        rules: { 'no-restricted-imports': ['error', { patterns: [{
            group: ['../ui/*'],
            message: '分层单向：fx 不许反向 import ui。'
        }] }] }
    }
];