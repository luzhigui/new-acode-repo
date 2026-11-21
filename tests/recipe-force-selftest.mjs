// recipe-force-selftest.mjs V1.0.0 | 2026-11-17 第23轮
// 用途：给 tests/124rule-recipes.js 的「按规则体检强制上场开关」提供独立 CLI 自证入口。
//   124 是浏览器 import 的纯模块（无 process/import.meta 依赖），故自证逻辑导出为
//   selftestRecipeForce()，本 wrapper 只负责在 Node 侧调用 + 定退码，不污染浏览器端。
// 判据全在 124.selftestRecipeForce()（布尔/带值/旧开关不回归/空/null/混合 六路）。
// V1.0.0 | 2026-11-21 第36轮：补 VER 常量与版本日志行（原文件无 VER，ver-drift 断言⑩判为无版本孤儿）。
export const VER = 'tests/recipe-force-selftest.mjs V1.0.0';

import { selftestRecipeForce } from './124rule-recipes.js';

const ok = selftestRecipeForce();
process.exit(ok ? 0 : 1);
