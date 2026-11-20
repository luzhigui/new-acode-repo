// modules/317-elite-mingjiao.js — 明教精英注册入口（barrel；组件实现在 27elite-mingjiao-*.js）
// 编号 27 = 「明教精英」模块族，不是单文件序号；族内拆文件共享父号、用语义后缀区分。
// 本文件只做集中注册（registerElite × 9 + targetPoolFilter + roundComponent × 2 + holyFlameEnhancer
//   + buffRoundTransformer + stateTransition × 4），不写具体逻辑。
export const VER = 'modules/317-elite-mingjiao.js V7.3.5';

import { registerElite, registerRoundComponent, registerBuffRoundTransformer, registerStateTransition, registerHolyFlameEnhancer } from '../core/208-registry-elite.js';

import { BUFF_TYPES, CAMP_TYPES, MECHANIC_TYPES } from '../infra/106-battle-enums.js';
import { createEagleComponent } from './318-elite-mingjiao-eagle.js';
import { createZhangWujiComponent } from './320-elite-mingjiao-zhangwuji.js';
import { createWeiYixiaoComponent } from './321-elite-mingjiao-weiyixiao.js';
import { createXiaoZhaoSisterComponent } from './322-elite-mingjiao-xiaozhao-sister.js';
import { createXiaoZhaoBrotherComponent } from './323-elite-mingjiao-xiaozhao-brother.js';
import { createXieXunComponent } from './326-elite-mingjiao-xiexun.js';
import { createYangXiaoComponent } from './327-elite-mingjiao-yangxiao.js';
import { createYinTianZhengComponent } from './328-elite-mingjiao-yintianzheng.js';
import { createHanLiSaComponent } from './319-elite-mingjiao-hanlisa.js';
import { bagTrapHandler } from './325-elite-mingjiao-shuobude.js';
import { registerMechanicHandler } from '../core/219-mechanic-registry.js';
import { requireSkillParams } from './305-elite-helpers.js';
import { isControlled } from '../core/218-state-keys.js';

// ========== 精英组件集中注册（core/08 注册表；逐字搬自原文件末尾，顺序严格保持） ==========
registerElite('雄鹰', createEagleComponent);
registerElite('张无忌', createZhangWujiComponent);
registerElite('韦一笑', createWeiYixiaoComponent);
registerElite('小昭·姊', createXiaoZhaoSisterComponent);
registerElite('小昭·妹', createXiaoZhaoBrotherComponent);
registerElite('金毛狮王谢逊', createXieXunComponent);
registerElite('杨逍', createYangXiaoComponent);
// 殷天正（白眉鹰王·明教·防战·弱精英 m104）：补明教「防战精英」空缺，走随机精英轮盘
registerElite('殷天正', createYinTianZhengComponent);
// 寒离飒（明教·战士·弱精英 M107，与韦一笑同池）：九阳/寒冰神掌/蓄力
registerElite('寒离飒', createHanLiSaComponent);

// 说不得·布袋：普通兵数据驱动机制（MECHANIC_TYPES.BAG_TRAP），注册进 core/18 注册表
registerMechanicHandler(MECHANIC_TYPES.BAG_TRAP, bagTrapHandler);

// 杨逍·选敌：2026-11-20 上移到 core/207 的分层策略（①未行动且点穴/截脉不在冷却 ②已行动但冷却中 ③飞行通用），
//   原 pool-filter 只保留「未行动且未被控」一档，会把 ② 直接筛没，已删除。

// ——V7.5.13 回合钩子注册（core/11 特判收口）：小昭的知识搬回小昭家 ——
// 回合组件：姊/妹工厂产的是带相位方法的组件（onFirstAllyTurn/executeAttach/executeFly…），
// 主循环工厂循环按此标记保留实例调度（原 core/11 小昭特判分支的泛化）
registerRoundComponent('小昭·姊', CAMP_TYPES.ALLY);
registerRoundComponent('小昭·妹', CAMP_TYPES.ALLY);

// 圣火令增强判定（数值加成消费，applyHolyFlameBonus 第三参）：姊在场即增强——
//   原 core/11 hasSisterForHolyFlame 变量的泛化，与下行行列重画同一语义
registerHolyFlameEnhancer(A => !(globalThis.MING_ABLATION?.noSisterHex) && A.some(u => u.isXiaoZhaoSister && u.alive));

// 圣火令增强：姊在场时每回合重画覆盖行列（原 core/11 hexEnhance 内联版逐字迁移；
// 同位置同条件画 rng，序不变——140 基线二分保障）
registerBuffRoundTransformer(BUFF_TYPES.HOLY_FLAME, (buff, rng, A, B) => {
    if (!(buff.target === CAMP_TYPES.ALLY || !buff.target)) return buff;
    const hasSisterForHolyFlame = !(globalThis.MING_ABLATION?.noSisterHex) && A.some(u => u.isXiaoZhaoSister && u.alive);
    const hexEnhanceParams = requireSkillParams('小昭', 'hexEnhance');
    const holyFlameEnhance = hasSisterForHolyFlame ? hexEnhanceParams.holyFlame : null;
    if (hasSisterForHolyFlame && !holyFlameEnhance) throw new Error('002-hex-enhance.json 缺 sister.holyFlame');
    const holyColCount = holyFlameEnhance ? holyFlameEnhance.atkCols : 1;
    const holyRowCount = holyFlameEnhance ? holyFlameEnhance.defRows : 2;
    const cols = [];
    while (cols.length < holyColCount) { const c = rng.nextInt(1, 3); if (!cols.includes(c)) cols.push(c); }
    cols.sort((a, b) => a - b);
    const rows = [];
    while (rows.length < holyRowCount) { const r = rng.nextInt(1, 3); if (!rows.includes(r)) rows.push(r); }
    rows.sort((a, b) => a - b);
    return { ...buff, cols, rows };
});

// 状态迁移声明的通用分发（原 core/11 的 sisterComp/brotherComp if-else 链；
// dispatch 闭包适配各方法签名，deferred=攒到下回合/回合末）
registerStateTransition('butterflyAttach', { deferred: false, dispatch(comps, decl, A, B, log) { for (const c of comps) if (typeof c.executeAttach === 'function') { c.executeAttach(A, log); return; } } });
registerStateTransition('butterflyReturn', { deferred: true, dispatch(comps, decl, A, B, log) { for (const c of comps) if (typeof c.executeReturn === 'function') { c.executeReturn(decl.sister, A, log); return; } } });
registerStateTransition('spiderFly', { deferred: false, dispatch(comps, decl, A, B, log) { for (const c of comps) if (typeof c.executeFly === 'function') { c.executeFly(decl.unit, decl.incomingDmg, A, log); return; } } });
registerStateTransition('spiderDescend', { deferred: true, dispatch(comps, decl, A, B, log) { for (const c of comps) if (typeof c.executeDescend === 'function') { c.executeDescend(decl.unit, A, B, log); return; } } });