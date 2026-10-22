// modules/26elite-sixsects.js — 六大派精英注册入口（组件实现拆在 26elite-sixsects-*.js）
// V6.26.1 | 2026-10-15 | ~2400 bytes
export const VER = 'modules/26elite-sixsects.js V6.26.1';
import { registerElite, registerLinkPartners } from '../core/08-registry-elite.js';
import { registerMechanicHandler } from '../core/18mechanic-registry.js';
import { MECHANIC_TYPES } from '../infra/56-battle-enums.js';
import { createSongQingshuComponent, chainClawHandler, kuLianHandler, xinHunHandler, xingFenHandler } from './26elite-sixsects-songqingshu.js';
import { createZhouZhiruoComponent } from './26elite-sixsects-zhouzhiruo.js';
import { createZhangSanfengComponent } from './26elite-sixsects-zhangsanfeng.js';
import { createPangYuanQiaoComponent } from './26elite-sixsects-pangyuanqiao.js';
import { createMieJueShiTaiComponent, followAttackHandler } from './26elite-sixsects-miejueshitai.js';
import { createHeTaichongComponent } from './26elite-sixsects-hetaichong.js';
// 唐文亮（崆峒·战士·精英 m107）：七伤拳自损增伤 / 同归于尽反噬
import { createTangWenLiangComponent } from './26elite-sixsects-tangwenliang.js';

// ========== 机制 handler 集中注册（core/18 注册表；handler 对象实现分别在各角色文件） ==========
registerMechanicHandler(MECHANIC_TYPES.CHAIN_CLAW, chainClawHandler);
registerMechanicHandler(MECHANIC_TYPES.KU_LIAN, kuLianHandler);
registerMechanicHandler(MECHANIC_TYPES.XIN_HUN, xinHunHandler);
registerMechanicHandler(MECHANIC_TYPES.XING_FEN, xingFenHandler);
// core/15 迁移：跟随攻击（灭绝师太）改走注册表
registerMechanicHandler(MECHANIC_TYPES.FOLLOW_ATTACK, followAttackHandler);

// ========== 精英组件集中注册（core/08 注册表） ==========
registerElite('宋青书', createSongQingshuComponent);
registerElite('周芷若', createZhouZhiruoComponent);
// 搭档连线注册（core/11 特判收口）：白骨爪连锁配对知识住在英雄家
registerLinkPartners('宋青书', '周芷若');
registerElite('张三丰', createZhangSanfengComponent);
registerElite('胖远桥', createPangYuanQiaoComponent);
registerElite('灭绝师太', createMieJueShiTaiComponent);
registerElite('何太冲', createHeTaichongComponent);
// 唐文亮（崆峒·战士·精英 m107）
registerElite('唐文亮', createTangWenLiangComponent);
