// modules/00reg-mechanics.js — 机制模块统一装配入口
// 注意：tests/health-rules/157 是有意的最小装配（只对账 registry handler 组），不走本入口，勿改。
//   战斗入口一律只 import 本文件；新增机制注册文件在此补一行即可全入口生效。
import './25elite-imperial.js';
import './26elite-sixsects.js';
import './27elite-mingjiao.js';
import './30custom-effects.js';
export const VER = 'modules/00reg-mechanics.js V1.0.0';
