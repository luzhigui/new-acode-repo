// V1.0.0 | 2026-11-06 新建：离线宿主机制装配唯一来源（绑 modules/301，替代各宿主手抄四行）
// tests/_lib/install-mechanics.mjs | V1.0.0 | 2026-11-06（离线宿主机制装配唯一来源）
// 只做一件事：把生产机制装配总入口 modules/301-reg-mechanics.js 的副作用绑进当前测试宿主。
//
// 为什么必须收口（2026-11-06 实跑取证）：上游 4230eb9a 新增 333/334/335 三个机制模块，
//   并在 content 给俞莲舟加了 type:"statAbsorb"；301 已同步 import 334，但 tests/ 下十几个
//   回放宿主仍各自手抄 307/308/317/331 四行 ⇒ 开局 installDeclaredSkills 抛
//   「未知顶层机制 type "statAbsorb"：未在 core/18 注册」⇒ 宿主 stdout 全 0 字节，
//   下游消费者解析出 0 行，极易被误读成「列名失配、改正则就好」（实为生产者根本没产出）。
//   ★ 一个宿主点修没用：只要还有别处手抄，上游再增一个注册模块就会重演同一场静默全崩。
//
// 用法：宿主一律 `await import('./_lib/install-mechanics.mjs')`（health-rules/ 下用相对路径换算）。
//   ★ 必须用动态 import 引用本件：多数回放宿主先装 DOM mock 再加载引擎，静态顶层 import 会抢跑。
//     本件内部的静态 import 会在动态加载那一刻求值，时机与原先四行动态 import 完全一致。
//   ★ 零判据变化，只补齐装载面；新增机制模块只改 301 一行，全部宿主自动同步。
//   禁止再在宿主里直接 import 307/308/317/331/324/333/334/335，
//   由 tests/mechanics-install-selftest.mjs 常驻扫描守门（含待迁移清单自收敛）。
import '../../modules/301-reg-mechanics.js';
export const VER = 'tests/_lib/install-mechanics.mjs V1.0.0';
