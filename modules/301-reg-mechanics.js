// modules/301-reg-mechanics.js — 机制模块统一装配入口
// 注意：tests/health-rules/157 是有意的最小装配（只对账 registry handler 组），不走本入口，勿改。
//   战斗入口一律只 import 本文件；新增机制注册文件在此补一行即可全入口生效。
import './307-elite-imperial.js';
import './308-elite-sixsects.js';
import './317-elite-mingjiao.js';
import './331-custom-effects.js';
import './324-elite-mingjiao-brother-laststand.js';
export const VER = 'modules/301-reg-mechanics.js V1.0.1';
