// render/30-fact-renderer.js — fact 渲染入口（装配 + 出口）
// V7.1.0 | ~900 bytes | 2026-09-22 拆出效果域(35)：本文件只做装配与出口
//
// 加新 fact 渲染：改对应域文件（34 攻击 / 35 效果），本文件不用动。
// renderLog / projectFactEntry / findUnitSnapshotByUid 已下沉 render/33（各域都要调，留在本文件会成环）。
export const VER = 'render/30-fact-renderer.js V7.1.0';

import { validateRegistry } from './33-fact-registry.js';

// 副作用导入：域文件在模块顶层调 registerFactRenderer 完成注册
import './34-facts-attack.js';
import './35-facts-effect.js';

// 对外出口（保持与拆分前一致，外部引用不断）
export { renderLog, projectFactEntry, findUnitSnapshotByUid } from './33-fact-registry.js';
export * from './34-facts-attack.js';
export * from './35-facts-effect.js';

// 装配校验：必须在全部 registerFactRenderer 之后（含两个域文件的顶层注册），否则会误报漏注册
validateRegistry('renderer');
