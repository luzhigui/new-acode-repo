// render/35-facts-stat.js — 效果域·属性召唤族 fact 渲染器
// V1.0.1 | 2026-10-21 | ~14000 bytes
export const VER = 'render/35-facts-stat.js V1.0.1';

import { registerFactRenderer } from './33-fact-registry.js';
import { FACT_TYPES, BUFF_SUBTYPES } from '../infra/56-battle-enums.js';

export function renderZhangSwitchFact(fact) {
    return [
        { type:'info', text:`<span class="gold">⚔️ 张无忌切换近战形态！攻+${fact.atkGain}、防+${fact.defGain}、生命上限+${fact.maxHpGain}</span>`, isZhangSwitch:true, unitUid: fact.zhang.uid },
        { type:'info', text:`<span class="gold">🗣️ 张无忌：不好，要顶上去了！</span>`, isZhangTaunt:true }
    ];
}

export function renderMeteorShowerMainFact(fact) {
    return { type:'info', text:`<span class="gold">${fact.label}伤害加深：${fact.targetName} 额外-${fact.bonusDmg}，防御-${fact.defReduce}</span>` };
}

export function renderMeteorShowerSplashFact(fact) {
    const details = fact.targets.map(t => t.name).join('、');
    const word = fact.targets.length > 1 ? '各-' : '-';
    let text = `<span class="orange">${fact.label}溅射：${details}，${word}${fact.splashDmg}，防御-${fact.defReduce}</span>`;
    // 成长段由 METEOR_SPLASH_GROWTH fact 独立渲染，不在此追加（否则重复渲染两遍）
    // 胖远桥莽撞：吃了溅射也 +攻，文本由 modules/26 随 fact 下发
    if (fact.rageText) text += ' ' + fact.rageText;
    return { type:'buff-splash', text };
}

// Carry 应用
export function renderCarryApplyFact(fact) {
    return { type:'info', text:`<span class="gold">👑 carry：${fact.unitName} 获得队友属性加成 攻+${fact.atk} 防+${fact.def} 血上限+${fact.hp}</span>` };
}

// Buff 召唤
export function renderHorseSummonFact(fact) {
    return {type:'buff-summon', text:`<span class="gold">🐴 拒马阵：拒马出现在${fact.pos}号位！</span>`, buffType: BUFF_SUBTYPES.SUMMON, horsePos: fact.pos, horseUid: fact.horseUid, horseTaunt: fact.horseTaunt || '嘶——！'};
}

// 苦练
export function renderKuLianPriorityFact(fact) {
    return { type:'info', text:`<span class="gold">⚡ 苦练勤学：${fact.unitName} 率先行动！</span>` };
}
export function renderKuLianFact(fact) {
    return { type:'info', text:`<span class="gold">🏋️ 苦练强化：${fact.unitName} 激励全体队友+${fact.atkBonus}攻+${fact.defBonus}防+${fact.hpBonus}血上限（自身双倍）！</span>` };
}

// 概率连击
export function renderDoubleStrikeFact(fact) {
    if (fact.success) {
        // 透传 doubleStrikeName：banner 文案不带单位，判据（tests/health-rules/146）
        //   此前只能反推「banner 后第一条 attack-group 的攻击者」→ 母狮随动链插入即误报。
        //   字段名不用 unitName，避免与「文案里可读到的单位名」混淆；文案保持原样不动（不改 UI）。
        return {type:'info', text:`<span class="gold">⚡ 概率连击触发！</span>`, isDoubleStrikeBanner:true, doubleStrikeName: fact.unitName || null};
    }
    return {type:'info', text:`<span class="gray">⚡ 概率连击触发失败，${fact.unitName} 未能再次攻击</span>`};
}

// 远程成长
export function renderRangedGrowthFact(fact) {
    return {type:'detail', text:`<span class="blue small">🏹 ${fact.unitName} 远程熟练：攻击 +${fact.growth} → ${fact.newAtk}</span>`};
}

// 坚盾
export function renderFortifyShieldFact(fact) {
    return {type:'detail', text:`<span class="blue small">🛡️ ${fact.unitName} ${fact.label}：防御+${fact.increment}（已叠${fact.current}/${fact.cap}）</span>`};
}

// 乾坤大挪移
export function renderQianKunUpgradedFact(fact) {
    return {
        type:'info',
        text:`<span class="gold">🦋 乾坤大挪移（升级版）：减伤${Math.round(fact.reducePct * 100)}%，反弹${fact.rebound}给${fact.attackerName}（${fact.zhangName}自伤${fact.selfDmg}）</span>`,
        reboundDmg: fact.rebound,
        reboundTargetUid: fact.attackerUid,
        selfDmg: fact.selfDmg,
        selfDmgUid: fact.zhangUid
    };
}
export function renderQianKunBasicFact(fact) {
    return {
        type:'info',
        text:`<span class="gold">✨ 乾坤大挪移：减伤${Math.round(fact.reducePct * 100)}%，反弹${fact.rebound}给${fact.attackerName}（${fact.zhangName}自伤${fact.selfDmg}）</span>`,
        reboundDmg: fact.rebound,
        reboundTargetUid: fact.attackerUid,
        selfDmg: fact.selfDmg,
        selfDmgUid: fact.zhangUid
    };
}

// 小昭蛛变
export function renderSpiderTransformFact(fact) {
    const gain = fact.masteryGain ? `，精通+${fact.masteryGain.atk}攻+${fact.masteryGain.def}防+${fact.masteryGain.hp}血` : '';
    return { type:'info', text:`<span class="gold">🕷️ 蛛变：${fact.unitName} 变换为<span class="gold">${fact.newRole}</span>（已精通${fact.mastered}/4${gain}）</span>` };
}

export function renderSpiderStrikeFact(fact) {
    // 补文字行：特效仍由 stageAction 驱动（不重复），这里只写「打谁、掉多少、是否击杀」。
    const detail = fact.extraDmg ? `（穿透${fact.penetrationDmg} + 精通${fact.extraDmg}）` : '';
    const dead = fact.isDead ? ' 💀击杀' : '';
    return { type:'info', text:`<span class="gold">🕷️ 蛛袭：${fact.unitName} 对 ${fact.targetName} 造成 ${fact.totalDmg} 伤害${detail}${dead}</span>` };
}

// 宋青书新婚 / 性奋
export function renderXingFenRetryFact(fact) {
    return { type:'info', text:`<span class="gold">💗 性奋：${fact.unitName} 获得额外攻击机会！</span>` };
}
export function renderXinHunFact(fact) {
    return {
        type:'info',
        text:`<span class="gold">💒 新婚：${fact.attackerName}攻击，${fact.targetName}被扣除${fact.hpDeduct}点血量，叠加一层快乐(${Math.round(fact.healPct*100)}%)！当前快乐层数：${fact.stackCount}</span>`,
        buffType: BUFF_SUBTYPES.ELITE_XINHUN,
        zhouUid: fact.zhouUid,
        zhouHpAfter: fact.zhouHpAfter,
        hpDeduct: fact.hpDeduct
    };
}
export function renderXingFenCostFact(fact) {
    return { type:'info', text:`<span class="red">💗 性奋代价：${fact.unitName} 血量上限 ${fact.oldMaxHp} → ${fact.newMaxHp}（-${fact.penalty}）</span>` };
}

// 融会贯通
export function renderRongHuiBonusFact(fact) {
    return { type:'info', text:`<span class="red">🔥 融会贯通额外+${fact.extra}（目标攻击${fact.targetAtk} 防御${fact.targetDef}，差值绝对值×50%）</span>` };
}

// 小昭·妹 拒马 / 连击
export function renderXiaoZhaoHorseFact(fact) {
    return {type:'buff-summon', text:`<span class="gold">🐴 小昭·妹的拒马在${fact.pos}号位出现！</span>`, buffType: BUFF_SUBTYPES.SUMMON, horsePos: fact.pos, horseUid: fact.horseUid, horseTaunt: '嗷——！'};
}
export function renderSpiderDoubleStrikeFact(fact) {
    return {type:'info', text:`<span class="gold">🕷️ 蝶击：小昭·妹永久概率连击触发！</span>`, isDoubleStrikeBanner:true};
}

// 战士斩杀
// 斩杀图标顺序：伤害行（render/34）斩杀时不再提前标 💀，阵亡标记由本行统一出。
export function renderWarriorExecuteFact(fact) {
    return { type:'info', text:`<span class="red">⚔️ 战士斩杀！${fact.unitName} 直接击杀 ${fact.targetName}！💀阵亡💀</span>` };
}

// 巨马反伤 / 严阵以待反弹
export function renderHorseReboundFact(fact) {
    return { type:'info', text:`<span class="red">🐴 巨马反伤：${fact.unitName} 受到 ${fact.rebound} 点反伤</span>` };
}
export function renderFortifyReboundFact(fact) {
    if (fact.hasSister) {
        const heal = Math.floor(fact.reboundDmg / 3);
        return { type:'info', text:`<span class="gold">🛡️ 严阵以待反弹${fact.reboundDmg}给${fact.unitName}（姐姐强化：回复${heal}）</span>` };
    }
    return { type:'info', text:`<span class="gold">🛡️ 严阵以待反弹${fact.reboundDmg}给${fact.unitName}</span>` };
}

// 召唤：谢逊狮子 / 灭绝召唤周芷若
export function renderSummonUnitFact(fact) {
    const by = fact.byName ? `（${fact.byName} 召唤）` : '';
    return { type:'info', text:`<span class="gold">🐾 ${fact.summonName} 出现在 ${fact.pos} 号位${by}</span>` };
}

// 谢逊幼狮成长（一回合后按位置成形为雄狮 / 母狮）
export function renderLionGrowFact(fact) {
    return { type:'info', text:`<span class="gold">🦁 幼狮成长为${fact.name}（${fact.pos} 号位）：攻 ${fact.atk} / 防 ${fact.def} / 血 ${fact.maxHp}</span>` };
}

// 流星溅射成长
export function renderMeteorSplashGrowthFact(fact) {
    return { type:'info', text:`<span class="gold">⚡ ${fact.unitName} 攻击+${fact.growth}</span>` };
}

// 附录：raw HTML → factType 渲染
export function renderXingFenExtraAttackFact(fact) {
    return { type:'info', text:`<span class="gold">💗 性奋：${fact.unitName} 获得额外攻击机会！</span>` };
}

export function renderClawNoHealFact(fact) {
    return { type:'info', text:`<span class="gray">💚 宋青书已满血，白骨爪未能回复生命</span>` };
}

export function renderSpiderDeadTargetFact(fact) {
    return { type:'info', text:`<span class="gray">🕷️ 蛛袭：目标已死亡，攻击取消</span>` };
}

export function renderXingFenGrantFact(fact) {
    return { type:'buff-summary', text:`<span class="gold">💗 性奋：${fact.songName} 受${fact.zhouName}激励，本回合每次攻击后可再次攻击！</span>`, buffType: BUFF_SUBTYPES.ELITE_XINGFEN };
}

export function renderClawHitFact(fact) {
    // 爪伤一位小数出口兜底：爪雨是「累减→重算」循环，浮点尾巴（0.6000…01）会在爪间渗透，
    //   无论源头哪条缝渗的，显示出口统一洗成一位小数（0.6→0.6、13→13、尾巴全截）。
    const fmt1 = (v) => (typeof v === 'number' && isFinite(v)) ? Math.round(v * 10) / 10 : v;
    // designedDmg 透传：设计值随条目带出（core/16 回填），体检规则可还原「设计下限」守护
    //   （落地值 dmg 被减伤后可为 0~设计值，不能再当设计值用）
    return { type:'info', hpAfter: fmt1(fact.hpAfter), clawTargetUid: fact.targetUid, dmg: fmt1(fact.dmg), designedDmg: fact.designedDmg, text:`<span style="color:#222">🐾 九阴白骨爪${fact.depth>0?'连锁':'追击'}！${fact.unitName} 对 ${fact.targetName} 造成 ${fmt1(fact.dmg)} 点伤害${fact.jealous?'【嫉妒】':''}</span>` };
}

export function renderClawExecuteFact(fact) {
    const fmt1 = (v) => (typeof v === 'number' && isFinite(v)) ? Math.round(v * 10) / 10 : v;
    const dmgText = fact.dmg !== undefined ? `造成 <span class="red">${fmt1(fact.dmg)}</span> 点伤害` : '造成致命一击';
    return { type:'info', text:`<span style="color:#222">🐾 九阴白骨爪斩杀！${fact.unitName} 对 ${fact.targetName} ${dmgText}【斩杀】</span>` };
}

// ── 注册 ────────────────────────────────────────────────
registerFactRenderer(FACT_TYPES.ZHANG_SWITCH, renderZhangSwitchFact);
registerFactRenderer(FACT_TYPES.METEOR_SHOWER_MAIN, renderMeteorShowerMainFact);
registerFactRenderer(FACT_TYPES.METEOR_SHOWER_SPLASH, renderMeteorShowerSplashFact);
registerFactRenderer(FACT_TYPES.CARRY_APPLY, renderCarryApplyFact);
registerFactRenderer(FACT_TYPES.HORSE_SUMMON, renderHorseSummonFact);
registerFactRenderer(FACT_TYPES.KU_LIAN_PRIORITY, renderKuLianPriorityFact);
registerFactRenderer(FACT_TYPES.KU_LIAN, renderKuLianFact);
registerFactRenderer(FACT_TYPES.DOUBLE_STRIKE, renderDoubleStrikeFact);
registerFactRenderer(FACT_TYPES.RANGED_GROWTH, renderRangedGrowthFact);
registerFactRenderer(FACT_TYPES.FORTIFY_SHIELD, renderFortifyShieldFact);
registerFactRenderer(FACT_TYPES.QIAN_KUN_UPGRADED, renderQianKunUpgradedFact);
registerFactRenderer(FACT_TYPES.QIAN_KUN_BASIC, renderQianKunBasicFact);
registerFactRenderer(FACT_TYPES.SPIDER_TRANSFORM, renderSpiderTransformFact);
registerFactRenderer(FACT_TYPES.SPIDER_STRIKE, renderSpiderStrikeFact);
registerFactRenderer(FACT_TYPES.XING_FEN_RETRY, renderXingFenRetryFact);
registerFactRenderer(FACT_TYPES.XIN_HUN, renderXinHunFact);
registerFactRenderer(FACT_TYPES.XING_FEN_COST, renderXingFenCostFact);
registerFactRenderer(FACT_TYPES.RONG_HUI_BONUS, renderRongHuiBonusFact);
registerFactRenderer(FACT_TYPES.XIAO_ZHAO_HORSE, renderXiaoZhaoHorseFact);
registerFactRenderer(FACT_TYPES.SPIDER_DOUBLE_STRIKE, renderSpiderDoubleStrikeFact);
registerFactRenderer(FACT_TYPES.WARRIOR_EXECUTE, renderWarriorExecuteFact);
registerFactRenderer(FACT_TYPES.HORSE_REBOUND, renderHorseReboundFact);
registerFactRenderer(FACT_TYPES.FORTIFY_REBOUND, renderFortifyReboundFact);
registerFactRenderer(FACT_TYPES.SUMMON_UNIT, renderSummonUnitFact);
registerFactRenderer(FACT_TYPES.LION_GROW, renderLionGrowFact);
registerFactRenderer(FACT_TYPES.METEOR_SPLASH_GROWTH, renderMeteorSplashGrowthFact);
registerFactRenderer(FACT_TYPES.XING_FEN_EXTRA_ATTACK, renderXingFenExtraAttackFact);
registerFactRenderer(FACT_TYPES.CLAW_NO_HEAL, renderClawNoHealFact);
registerFactRenderer(FACT_TYPES.SPIDER_DEAD_TARGET, renderSpiderDeadTargetFact);
registerFactRenderer(FACT_TYPES.XING_FEN_GRANT, renderXingFenGrantFact);
registerFactRenderer(FACT_TYPES.CLAW_HIT, renderClawHitFact);
registerFactRenderer(FACT_TYPES.CLAW_EXECUTE, renderClawExecuteFact);