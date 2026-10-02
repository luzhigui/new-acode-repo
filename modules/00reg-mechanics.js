// modules/00reg-mechanics.js — 机制模块统一装配入口
// V1.0.0 | ~600 bytes | 2026-10-02 收口：机制 handler 靠模块顶层副作用注册（25/26/27 精英监听、30 dotTick/damageReflect 等），
//   此前各战斗入口各自散装 import，新增机制文件或新开入口必漏（tools/116 worker 曾漏 30 → 模拟报"未知顶层机制 type dotTick"）。
//   今后战斗入口一律只 import 本文件；新增机制注册文件在此补一行即可全入口生效。
//
// 注意：tests/health-rules/157 是有意的最小装配（只对账 registry handler 组），不走本入口，勿改。
import './25elite-imperial.js';
import './26elite-sixsects.js';
import './27elite-mingjiao.js';
import './30custom-effects.js';
export const VER = 'modules/00reg-mechanics.js V1.0.0';
