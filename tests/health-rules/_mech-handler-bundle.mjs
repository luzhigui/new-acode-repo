// tests/health-rules/_mech-handler-bundle.mjs
// 单一真相源：本文件 import 生产机制装配总入口 modules/301-reg-mechanics.js，
// 即 ui/702-main-5v5-test.js 加载全部机制 handler 的总入口（307/308/317/331/324，
// 其中 308 再拉 310）。全部 registerMechanicHandler 调用点（307/308/317/331）都在这条链上。
//   自检规则（157）一律 import 本文件，而非手工罗列模块 —— 今后新增机制注册模块
//   只要在 301 补一行，自检上下文自动同步，根除「漏导某模块 ⇒ 误报『未在 core/18 注册』」
//   这一族假阳（第 132 轮 dotTick 漏 331、第 177 轮 bagTrap 漏 317 同族）。
//   仅导入副作用、不导出任何 rule，体检运行器不会把它当作一条规则加载。
import '../../modules/301-reg-mechanics.js';
export const VER = 'tests/health-rules/_mech-handler-bundle.mjs V1.0.0';
