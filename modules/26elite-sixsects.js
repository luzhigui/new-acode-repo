// modules/26elite-sixsects.js — 六大派精英注册入口（组件实现拆在 26elite-sixsects-*.js）
// V6.26.1 | ~3000 bytes | 2026-10-15 第二批内容：新增唐文亮（崆峒·战士·精英 m107）——import 组件 + registerElite
// V6.26.0 | ~2840 bytes | 2026-10-14 core/15 瘦身批 2：followAttack（灭绝）在 -miejueshitai.js 改造成 core/18
//   handler 后在此集中注册（registerMechanicHandler ×5）；core/15 同批瘦身（V6.8.0），旧的本地安装器已删
// V6.25.0 | ~2400 bytes | 2026-10-13 拆分（纯搬移，数值/日志文本/fact 顺序零变化）：原 998 行单文件按角色拆成
//   6 个组件文件（-songqingshu/-zhouzhiruo/-zhangsanfeng/-pangyuanqiao/-miejueshitai/-hetaichong），
//   本文件只做集中注册（全项目统一口径）：registerMechanicHandler ×4 + registerElite ×6 + registerLinkPartners ×1；
//   所有既有 import 点（modules/00reg-mechanics、tests/*、tools/*）一行不改照常工作
export const VER = 'modules/26elite-sixsects.js V6.26.1';
import { registerElite, registerLinkPartners } from '../core/08-elite-registry.js';
import { registerMechanicHandler } from '../core/18mechanic-registry.js';
import { MECHANIC_TYPES } from '../infra/56-battle-enums.js';
import { createSongQingshuComponent, chainClawHandler, kuLianHandler, xinHunHandler, xingFenHandler } from './26elite-sixsects-songqingshu.js';
import { createZhouZhiruoComponent } from './26elite-sixsects-zhouzhiruo.js';
import { createZhangSanfengComponent } from './26elite-sixsects-zhangsanfeng.js';
import { createPangYuanQiaoComponent } from './26elite-sixsects-pangyuanqiao.js';
import { createMieJueShiTaiComponent, followAttackHandler } from './26elite-sixsects-miejueshitai.js';
import { createHeTaichongComponent } from './26elite-sixsects-hetaichong.js';
// 2026-10-15 唐文亮（崆峒·战士·精英 m107）：七伤拳自损增伤 / 同归于尽反噬
import { createTangWenLiangComponent } from './26elite-sixsects-tangwenliang.js';

// ========== 机制 handler 集中注册（core/18 注册表；handler 对象实现分别在各角色文件） ==========
registerMechanicHandler(MECHANIC_TYPES.CHAIN_CLAW, chainClawHandler);
registerMechanicHandler(MECHANIC_TYPES.KU_LIAN, kuLianHandler);
registerMechanicHandler(MECHANIC_TYPES.XIN_HUN, xinHunHandler);
registerMechanicHandler(MECHANIC_TYPES.XING_FEN, xingFenHandler);
// 2026-10-14 core/15 迁移：跟随攻击（灭绝师太）改走注册表
registerMechanicHandler(MECHANIC_TYPES.FOLLOW_ATTACK, followAttackHandler);

// ========== 精英组件集中注册（core/08 注册表） ==========
registerElite('宋青书', createSongQingshuComponent);
registerElite('周芷若', createZhouZhiruoComponent);
// 2026-10-08 搭档连线注册（core/11 特判收口）：白骨爪连锁配对知识住在英雄家
registerLinkPartners('宋青书', '周芷若');
registerElite('张三丰', createZhangSanfengComponent);
registerElite('胖远桥', createPangYuanQiaoComponent);
registerElite('灭绝师太', createMieJueShiTaiComponent);
registerElite('何太冲', createHeTaichongComponent);
// 2026-10-15 唐文亮（崆峒·战士·精英 m107）
registerElite('唐文亮', createTangWenLiangComponent);
