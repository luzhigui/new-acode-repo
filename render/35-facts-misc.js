// render/35-facts-misc.js — 效果域·系统/离散项 fact 渲染器
// V1.0.0 | ~7400 bytes | 2026-10-18 自 render/35-facts-effect.js V1.0.21 拆出（纯搬移，函数体逐字不动）：
//   系统行（回合开始/结束/台词/不争/连击摘要）+ 离散精英项（幻影识破迷惑/新婚死亡/玄冥 dot 与联动/拒马销毁/buff 摘要）13 条整块迁入。
//   「misc」不是垃圾桶：它是「不归回血/控制位移/属性召唤三族」的剩余——系统行与跨族离散事件。
//   若未来 misc 涨到 20KB+，再按 elite/system 二次拆（判据见拆分方案）。
export const VER = 'render/35-facts-misc.js V1.0.1';

import { CONFIG } from '../core/01config-5v5-test.js';
import { registerFactRenderer, findUnitSnapshotByUid } from './33-fact-registry.js';
import { makeDotRenderer } from './36-generic-renderers.js';
import { FACT_TYPES, BUFF_TYPES, BUFF_SUBTYPES, ROLE_TYPES } from '../infra/56-battle-enums.js';

// 拒马 / 张无忌
export function renderHorseDestroyFact(fact) {
    if (fact.success) {
        return {
            type:'buff-destroy',
            text:`<span class="gray">🐴 拒马阵：${fact.pos}号位拒马消散（成功率${fact.prob}%，${fact.roll}）</span>`,
            buffType: BUFF_SUBTYPES.DESTROY,
            horseUid: fact.horseUid,
            needsSeparator: true
        };
    }
    return {
        type:'info',
        text:`<span class="gray">🐴 拒马阵：${fact.pos}号位拒马未消散（成功率${fact.prob}%，${fact.roll}）</span>`,
        horseUid: fact.horseUid
    };
}

// Buff 摘要
export function renderBuffSummaryFact(buff, allyTeamUids, doubleStrikeUid) {
    const allyTeam = (allyTeamUids || []).map(uid => findUnitSnapshotByUid(uid)).filter(u => u);
    switch (buff.key) {
        case BUFF_TYPES.BLOODTHIRST:
            let btUnits = allyTeam.filter(u => u.alive && u.role === ROLE_TYPES.WARRIOR);
            if (btUnits.length > 0) return {type:'buff-summary', text:`<span class="gold">🗡️ 嗜血狂刀：${btUnits.map(u=>u.name).join('、')} 攻击吸血${Math.round(CONFIG.BUFFS.bloodthirst.leechRatio*100)}%</span>`, buffType: BUFF_SUBTYPES.BUFF_STAT};
            break;
        case BUFF_TYPES.HOT_BLOOD:
            let hbUnits = allyTeam.filter(u => u.alive);
            if (hbUnits.length > 0) return {type:'buff-summary', text:`<span class="gold">❤️ 热血奋战：${hbUnits.map(u=>u.name).join('、')} 攻击回血${Math.round(CONFIG.BUFFS.hotBlood.leechRatio*100)}%（每3次翻倍）</span>`, buffType: BUFF_SUBTYPES.BUFF_STAT};
            break;
        case BUFF_TYPES.FORTIFY:
            let ftUnits = allyTeam.filter(u => u.alive && u.role === ROLE_TYPES.DEFENDER);
            if (ftUnits.length > 0) return {type:'buff-summary', text:`<span class="gold">🛡️ 严阵以待：${ftUnits.map(u=>u.name).join('、')} 防御+${Math.round(CONFIG.BUFFS.fortify.defBonus*100)}% 反弹50%</span>`, buffType: BUFF_SUBTYPES.BUFF_STAT};
            break;
        case BUFF_TYPES.CLOUD_BODY:
            let cbUnits = allyTeam.filter(u => u.alive);
            if (cbUnits.length > 0) return {type:'buff-summary', text:`<span class="gold">💨 流云身法：${cbUnits.map(u=>u.name).join('、')} 闪避+${Math.round(CONFIG.BUFFS.cloudBody.dodgeBonus*100)}%</span>`, buffType: BUFF_SUBTYPES.BUFF_STAT};
            break;
        case BUFF_TYPES.WIND_ASSAULT:
            let waUnits = allyTeam.filter(u => u.alive && u.role === ROLE_TYPES.FLYER);
            if (waUnits.length > 0) return {type:'buff-summary', text:`<span class="gold">🦅 乘风突袭：${waUnits.map(u=>u.name).join('、')} 80%波及同行 60%击退（持续3回合）</span>`, buffType: BUFF_SUBTYPES.BUFF_STAT};
            break;
        case BUFF_TYPES.METEOR_SHOWER:
            let msUnits = allyTeam.filter(u => u.alive && u.role === ROLE_TYPES.RANGED);
            if (msUnits.length > 0) return {type:'buff-summary', text:`<span class="gold">☄️ 流星赶月：${msUnits.map(u=>u.name).join('、')} 伤害加深${Math.round(CONFIG.BUFFS.meteorShower.bonusRatio*100)}% 溅射${Math.round(CONFIG.BUFFS.meteorShower.splashRatio*100)}%（主箭降2防，小箭降1防）</span>`, buffType: BUFF_SUBTYPES.BUFF_STAT};
            break;
        case BUFF_TYPES.HOLY_FLAME:
            {
                const cols = buff.cols || [];
                const rows = buff.rows || [];
                if (cols.length > 0 || rows.length > 0) {
                    const colText = cols.length ? `第${cols.join('、')}列` : '无';
                    const rowText = rows.length ? `第${rows.join('、')}行` : '无';
                    const atkPct = Math.round(CONFIG.BUFFS.holyFlame.atkBonus * 100);
                    const defPct = Math.round(CONFIG.BUFFS.holyFlame.defBonus * 100);
                    return {
                        type:'buff-summary',
                        text:`<span class="gold">🔥 圣火令：攻击${colText} +${atkPct}%，防御${rowText} +${defPct}%</span>`,
                        buffType: BUFF_SUBTYPES.BUFF_STAT
                    };
                }
            }
            break;
        case BUFF_TYPES.MIND_CONTROL:   // 2026-10-08 清死码：DOUBLE_STRIKE 空分支删（连击无 buff 概要行，外部AI清单#6）
            return {type:'buff-summary', text:`<span class="gold">🌀 惑人心智：最前排80%扰乱敌方换位，40%扰乱己方换位</span>`, buffType: BUFF_SUBTYPES.BUFF_STAT};
        case BUFF_TYPES.CARRY:
            let carryUnit = allyTeam.find(u => u.pos === 5 && u.alive);
            if (carryUnit) {
                let desc = `👑 你就是carry：${carryUnit.name} 获得队友属性加成`;
                return {type:'buff-summary', text:`<span class="gold">${desc}</span>`, buffType: BUFF_SUBTYPES.BUFF_STAT};
            }
            break;
    }
    return null;
}

// 玄冥神掌
export function renderXuanmingDotFact(fact) {
    const stackText = (fact.stacks || 1) > 1 ? `（${fact.stacks} 层）` : '';
    return { type:'info', text:`<span class="purple">❄️ 玄冥神掌寒毒发作${stackText}，${fact.unitName} 受到 ${fact.dot} 点伤害</span>`, fxAnchors: [`受到 ${fact.dot} 点`], uidD: fact.uidD, isDead: fact.isDead, dmg: fact.dot };
}
export const renderXuanmingPoisonedFact = makeDotRenderer({ icon: '❄️', skillName: '玄冥神掌' });

export function renderXuanmingLinkAttackFact(fact) {
    return { type:'info', text:`<span class="gold">🔗 ${fact.partnerName} 跟随 ${fact.unitName} 发动联动攻击！</span>` };
}

// 宋青书新婚死亡
export function renderXinHunDeathFact(fact) {
    return { type:'info', text:`<span class="red">💀 ${fact.unitName} 因新婚扣血而阵亡！</span>`, uidD: fact.uidD, isDead:true };
}

// 回合分隔线 / 概率连击摘要
export function renderRoundStartFact(fact) {
    return { type:'round-start', text:`<div class="separator">———— 第${fact.round}回合开始 ————</div>` };
}
export function renderRoundEndFact(fact) {
    return { type:'round-end', text:`<div class="separator">———— 第${fact.round}回合结束 ————</div>` };
}
export function renderDoubleStrikeSummaryFact(fact) {
    return { type:'buff-summary', text:`<span class="gold">⚡ 概率连击：${fact.unitName} 80%概率额外攻击一次</span>`, buffType: BUFF_SUBTYPES.BUFF_STAT };
}

// 张无忌台词
export function renderZhangTauntFact(fact) {
    return { type:'info', text:`<span class="gold">🗣️ ${fact.unitName}：${fact.taunt}</span>` };
}

// 张三丰：不争（仅剩一人判负）
export function renderNoContendFact(fact) {
    return { type:'info', text:`<span class="gold">☯ 不争：六大派仅剩 ${fact.unitName} 一人，明教获胜</span>` };
}

// 成昆幻影伪装
export function renderPhantomRevealFact(fact) {
    return { type:'info', text:`<span class="gold">🎭 ${fact.unitName}识破${fact.deceiver}伪装，锁定真正的${fact.deceiver}！</span>`, phantomFlashUid: fact.deceiverUid };
}
export function renderPhantomConfuseFact(fact) {
    // 2026-10-11 去名字字面量：来源由 modules/27 显式打标（deceiverIsSpider），渲染层不再比英雄名。
    //   变量名同时纠偏：原 isButterfly 装的其实是「是蛛」，改成 isSpider 与事实一致
    const isSpider = fact.deceiverIsSpider === true;
    return { type:'info', text:`<span class="gold">${isSpider ? '🕷️ 蝶舞迷心！' : '🎭 幻影伪装！'}${fact.unitName}被${fact.deceiver}迷惑，误攻队友${fact.targetName}！</span>` };
}

// ── 注册 ────────────────────────────────────────────────
registerFactRenderer(FACT_TYPES.HORSE_DESTROY, renderHorseDestroyFact);
registerFactRenderer(FACT_TYPES.BUFF_SUMMARY, (data) => renderBuffSummaryFact(data.buff, data.allyTeamUids, data.doubleStrikeUid));
registerFactRenderer(FACT_TYPES.XUAN_MING_DOT, renderXuanmingDotFact);
registerFactRenderer(FACT_TYPES.XUAN_MING_POISONED, renderXuanmingPoisonedFact);
registerFactRenderer(FACT_TYPES.XUAN_MING_LINK_ATTACK, renderXuanmingLinkAttackFact);
registerFactRenderer(FACT_TYPES.XIN_HUN_DEATH, renderXinHunDeathFact);
registerFactRenderer(FACT_TYPES.ROUND_START, renderRoundStartFact);
registerFactRenderer(FACT_TYPES.ROUND_END, renderRoundEndFact);
registerFactRenderer(FACT_TYPES.DOUBLE_STRIKE_SUMMARY, renderDoubleStrikeSummaryFact);
registerFactRenderer(FACT_TYPES.ZHANG_TAUNT, renderZhangTauntFact);
registerFactRenderer(FACT_TYPES.NO_CONTEND, renderNoContendFact);
registerFactRenderer(FACT_TYPES.PHANTOM_REVEAL, renderPhantomRevealFact);
registerFactRenderer(FACT_TYPES.PHANTOM_CONFUSE, renderPhantomConfuseFact);