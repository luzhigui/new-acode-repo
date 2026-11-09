// render/411-facts-misc.js — 效果域·系统/离散项 fact 渲染器
//   系统行（回合开始/结束/台词/不争/连击摘要）+ 离散精英项（幻影识破迷惑/新婚死亡/玄冥 dot 与联动/拒马销毁/buff 摘要）13 条整块迁入。
//   「misc」不是垃圾桶：它是「不归回血/控制位移/属性召唤三族」的剩余——系统行与跨族离散事件。
//   若未来 misc 涨到 20KB+，再按 elite/system 二次拆（判据见拆分方案）。
// V1.1.2 | 2026-11-07 第 184 轮：幻影迷惑来源词按 fact.sourceSkill 取（幻影伪装 / 蝶舞迷心 / 双面观音），
//         | 成昆文案逐字不变；旧 fact 仍按 deceiverIsSpider 兜底。
// V1.1.4 | 2026-11-08 buff 摘要按实际生效档读数：小昭·姊存活在场时用 002 sister 段覆盖普通版，
//         | 覆盖 圣火令/摄魂/背水一战/众志成城/热血奋战/流云身法/乘风突袭/惑人心智/圣火不熄/概率连击。
// V1.1.5 | 2026-11-08 体检转交：圣火不熄摘要带复活账（复活单位 uid / 第几次 / 档位比例 / 实际回复量），
//         | 不再只印一句通用文案；结构化字段同步挂到渲染条目上供体检归账。
// V1.1.6 | 2026-11-08 体检转交：UNIT_DEATH 死亡登记注册隐藏渲染器（只记账不上屏，避免战报重复死亡行）
// V1.1.7 | 2026-11-08 体检转交：ABSORB_SUMMARY 吸星汇总注册隐藏渲染器（只记账不上屏，行仍由 SKILL_ANNOUNCE 出）
// V1.1.8 | 2026-11-08 摘要与事实同源：严阵以待「反弹50%」改读 cfg.reboundRatio、流星赶月「降2/1防」改读
//         | cfg.mainDefReduce/splashDefReduce——不再写死数字，配置一改摘要立即跟上
// V1.1.9 | 2026-11-09 SUMMON_DEAD 注册隐藏渲染（召唤物阵亡只供体检归账，不进画面）
export const VER = 'render/411-facts-misc.js V1.1.9';

import { CONFIG, getSisterHexEnhance } from '../core/201-config-5v5-test.js';
import { registerFactRenderer, findUnitSnapshotByUid } from './406-fact-registry.js';
import { makeDotRenderer } from './413-generic-renderers.js';
import { fmtNum } from '../infra/102-core-utils.js';
import { FACT_TYPES, BUFF_TYPES, BUFF_SUBTYPES, ROLE_TYPES } from '../infra/106-battle-enums.js';

// 拒马 / 张无忌
export function renderHorseDestroyFact(fact) {
    if (fact.success) {
        return {
            type:'buff-destroy',
            text:`<span class="gray">🐴 拒马阵：${fact.pos}号位拒马消散（成功率${fmtNum(fact.prob)}%，${fmtNum(fact.roll)}）</span>`,
            buffType: BUFF_SUBTYPES.DESTROY,
            horseUid: fact.horseUid,
            needsSeparator: true
        };
    }
    return {
        type:'info',
        text:`<span class="gray">🐴 拒马阵：${fact.pos}号位拒马未消散（成功率${fmtNum(fact.prob)}%，${fmtNum(fact.roll)}）</span>`,
        horseUid: fact.horseUid
    };
}

// Buff 摘要
// 按「实际生效档」取配置：小昭·姊存活在场 → 002 sister.<key> 覆盖普通版数值；缺段缺键显式报错，不回落。
//   否则摘要按普通版读数（如圣火令 +30%，实际姊版 +25%），与玩家看到的加成对不上。
function withSisterValues(key, cfg, allyTeam) {
    const hasSister = (allyTeam || []).some(u => u.alive && u.isXiaoZhaoSister);
    if (!hasSister) return cfg;
    const enh = getSisterHexEnhance(key);
    if (!enh) throw new Error(`002-hex-enhance.json 缺 sister.${key}`);
    return { ...cfg, ...enh };
}

// 统一的海克斯摘要规则表
const BUFF_SUMMARY_CFG = {
    [BUFF_TYPES.BLOODTHIRST]: { role: ROLE_TYPES.WARRIOR, desc: (cfg) => `攻击吸血${fmtNum(cfg.leechRatio*100)}%` },
    [BUFF_TYPES.HOT_BLOOD]: { role: 'all', desc: (cfg) => {
        // 姊版 leechPct/critPattern（每 3 次里的第 2、3 次翻倍）；普通版按每 3 次翻倍
        const pct = cfg.leechPct != null ? cfg.leechPct : cfg.leechRatio;
        const crit = Array.isArray(cfg.critPattern)
            ? `每3次攻击的第${cfg.critPattern.join('、')}次翻倍`
            : '每3次翻倍';
        return `攻击回血${fmtNum(pct*100)}%（${crit}）`;
    }},
    [BUFF_TYPES.FORTIFY]: { role: ROLE_TYPES.DEFENDER, desc: (cfg) => `防御+${fmtNum(cfg.defBonus*100)}% 反弹${fmtNum(cfg.reboundRatio*100)}%` },
    [BUFF_TYPES.CLOUD_BODY]: { role: 'all', desc: (cfg) => `闪避+${fmtNum(cfg.dodgeBonus*100)}%` },
    [BUFF_TYPES.WIND_ASSAULT]: { role: ROLE_TYPES.FLYER, desc: (cfg) => `${fmtNum(cfg.hitProb*100)}%波及同行 ${fmtNum(cfg.pushProb*100)}%击退` },
    [BUFF_TYPES.METEOR_SHOWER]: { role: ROLE_TYPES.RANGED, desc: (cfg) => `伤害加深${fmtNum(cfg.bonusRatio*100)}% 溅射${fmtNum(cfg.splashRatio*100)}%（主箭降${fmtNum(cfg.mainDefReduce)}防，小箭降${fmtNum(cfg.splashDefReduce)}防）` },
    [BUFF_TYPES.CARRY]: { role: 'carry', desc: () => `获得队友属性加成` },
    [BUFF_TYPES.MIND_CONTROL]: { role: 'none', desc: (cfg) => `最前排${fmtNum(cfg.enemySwapProb*100)}%扰乱敌方换位，${fmtNum(cfg.allySwapProb*100)}%扰乱己方换位` },
    [BUFF_TYPES.SOUL_DRAIN]: { role: 'none', desc: (cfg) => `敌方全体攻击力${fmtNum(cfg.atkBonus*100)}%，敌方每多1个存活单位再+${fmtNum(cfg.perUnitBonus*100)}%，防御递减` },
    [BUFF_TYPES.LAST_STAND]: { role: 'none', desc: (cfg) => `生命低于${fmtNum(cfg.hpThreshold*100)}%时攻击+${fmtNum(cfg.atkBonus*100)}%防御-${fmtNum(cfg.defPenalty*100)}%且受易伤` },
    [BUFF_TYPES.UNITY]: { role: 'none', desc: (cfg) => `按存活人数阶梯提供攻防加成（首回合补满${fmtNum(cfg.recruitTarget)}人）` },
    [BUFF_TYPES.HOLY_FIRE]: { role: 'none', desc: (cfg) => `每局${cfg.reviveCount != null ? `前${cfg.reviveCount}次` : '首次'}阵亡单位原地复活` },
    [BUFF_TYPES.HOLY_FLAME]: { role: 'none', desc: (cfg, buff) => {
        const cols = buff.cols || [];
        const rows = buff.rows || [];
        const colText = cols.length ? `第${cols.join('、')}列` : '无';
        const rowText = rows.length ? `第${rows.join('、')}行` : '无';
        return `攻击${colText} +${fmtNum(cfg.atkBonus*100)}%，防御${rowText} +${fmtNum(cfg.defBonus*100)}%`;
    }},
};

export function renderBuffSummaryFact(buff, allyTeamUids, doubleStrikeUids, revives) {
    const baseCfg = CONFIG.BUFFS?.[buff.key];
    if (!baseCfg) return null;

    const allyTeam = (allyTeamUids || []).map(uid => findUnitSnapshotByUid(uid)).filter(u => u);
    // 实际生效档：小昭·姊在场时用姊版数值，否则普通版
    const cfg = withSisterValues(buff.key, baseCfg, allyTeam);

    // 圣火不熄：有复活账时按实际复活记录出账（复活单位 / 第几次 / 档位百分比 / 实际回复量），
    //   不再只印「每局首次阵亡单位原地复活」一句通用文案；全量记录随条目下发给体检逐 uid 归账。
    if (buff.key === BUFF_TYPES.HOLY_FIRE && Array.isArray(revives) && revives.length) {
        const last = revives[revives.length - 1];
        const pct = typeof last.ratio === 'number' ? fmtNum(last.ratio * 100) : '?';
        const body = last.slot === 'self'
            ? `${last.name}（妹名额·${pct}%档·回复${fmtNum(last.heal)}）`
            : `${last.name}（第${last.tier}次复活·${pct}%档·回复${fmtNum(last.heal)}）`;
        return {
            type: 'buff-summary',
            text: `<span class="gold">${cfg.icon} ${cfg.name}：${body}</span>`,
            buffType: BUFF_SUBTYPES.BUFF_STAT,
            reviveUid: last.uid, reviveHeal: last.heal, reviveTier: last.tier,
            reviveRatio: last.ratio, reviveSlot: last.slot,
            revives
        };
    }

    // 概率连击统一在此处理
    if (buff.key === BUFF_TYPES.DOUBLE_STRIKE) {
        if (!doubleStrikeUids || doubleStrikeUids.length === 0) return null;
        const units = allyTeam.filter(u => doubleStrikeUids.includes(u.uid));
        if (units.length === 0) return null;
        // doubleStrikeNames：结构化宣告名单（原始单位名，未经任何别名/展示替换），供体检按名字核对，
        //   不必再从下面这行中文拼串里按「、」反解。text 保持原样，只加字段、不改既有语义。
        //   明教（里侧）与六大派（外侧）都走本函数，故两侧都带。
        // 概率取实际档：普通版 prob 0.8，姊版 sister.doubleStrike.chance 1.0
        const chance = cfg.chance != null ? cfg.chance : cfg.prob;
        return { type: 'buff-summary', text: `<span class="gold">⚡ 概率连击：${units.map(u=>u.name).join('、')} ${fmtNum(chance*100)}%概率额外攻击一次</span>`, buffType: BUFF_SUBTYPES.BUFF_STAT, doubleStrikeNames: units.map(u => u.name) };
    }

    const rule = BUFF_SUMMARY_CFG[buff.key];
    if (!rule) return null;

    let names = '';
    if (rule.role === 'all') {
        const units = allyTeam.filter(u => u.alive);
        if (units.length === 0) return null;
        names = units.map(u=>u.name).join('、') + ' ';
    } else if (rule.role === 'carry') {
        const unit = allyTeam.find(u => u.alive && (u.pos === 5 || u.isCarryEagle));
        if (!unit) return null;
        names = unit.name + ' ';
    } else if (rule.role !== 'none') {
        const units = allyTeam.filter(u => u.alive && u.role === rule.role);
        if (units.length === 0) return null;
        names = units.map(u=>u.name).join('、') + ' ';
    }

    const desc = rule.desc(cfg, buff);
    return { type: 'buff-summary', text: `<span class="gold">${cfg.icon} ${cfg.name}：${names}${desc}</span>`, buffType: BUFF_SUBTYPES.BUFF_STAT };
}

// 玄冥神掌
export function renderXuanmingDotFact(fact) {
    const stackText = (fact.stacks || 1) > 1 ? `（${fact.stacks} 层）` : '';
    return { type:'info', text:`<span class="purple">❄️ 玄冥神掌寒毒发作${stackText}，${fact.unitName} 受到 ${fmtNum(fact.dot)} 点伤害</span>`, fx: [{ kind: 'dmg', amount: fact.dot }], uidD: fact.uidD, isDead: fact.isDead, dmg: fact.dot };
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
export function renderZhangTauntFact(fact) {
    return { type:'info', text:`<span class="gold">🗣️ ${fact.unitName}：${fact.taunt}</span>` };
}

// 张三丰：不争（仅剩一人判负）
export function renderNoContendFact(fact) {
    return { type:'info', text:`<span class="gold">☯ 不争：六大派仅剩 ${fact.unitName} 一人，明教获胜</span>` };
}

// 成昆幻影伪装
const PHANTOM_CONFUSE_TITLES = {
    '幻影伪装': '🎭 幻影伪装！',
    '蝶舞迷心': '🕷️ 蝶舞迷心！',
    '双面观音': '🎭 双面观音！'
};
export function renderPhantomRevealFact(fact) {
    return { type:'info', text:`<span class="gold">🎭 ${fact.unitName}识破${fact.deceiver}伪装，锁定真正的${fact.deceiver}！</span>`, phantomFlashUid: fact.deceiverUid };
}
export function renderPhantomConfuseFact(fact) {
    // 来源词按事实自带的 sourceSkill 取（每个发射点必须打标），渲染层不猜英雄名：
    //   成昆「幻影伪装」/ 小昭·兄「蝶舞迷心」/ 彭莹玉「双面观音」——同一条 PHANTOM_CONFUSE 三个来源，
    //   战绩与体检也按 sourceSkill 区分归因，不再统统算到成昆头上。
    //   兜底保留旧行为：只带 deceiverIsSpider 的旧 fact → 蝶舞迷心；其余 → 幻影伪装（成昆文案逐字不变）。
    const title = PHANTOM_CONFUSE_TITLES[fact.sourceSkill]
        || (fact.deceiverIsSpider === true ? PHANTOM_CONFUSE_TITLES['蝶舞迷心'] : PHANTOM_CONFUSE_TITLES['幻影伪装']);
    return { type:'info', text:`<span class="gold">${title}${fact.unitName}被${fact.deceiver}迷惑，误攻队友${fact.targetName}！</span>` };
}

// ── 注册 ────────────────────────────────────────────────
registerFactRenderer(FACT_TYPES.HORSE_DESTROY, renderHorseDestroyFact);
registerFactRenderer(FACT_TYPES.BUFF_SUMMARY, (data) => renderBuffSummaryFact(data.buff, data.allyTeamUids, data.doubleStrikeUids, data.revives));
registerFactRenderer(FACT_TYPES.XUAN_MING_DOT, renderXuanmingDotFact);
registerFactRenderer(FACT_TYPES.XUAN_MING_POISONED, renderXuanmingPoisonedFact);
registerFactRenderer(FACT_TYPES.XUAN_MING_LINK_ATTACK, renderXuanmingLinkAttackFact);
registerFactRenderer(FACT_TYPES.XIN_HUN_DEATH, renderXinHunDeathFact);
registerFactRenderer(FACT_TYPES.ROUND_START, renderRoundStartFact);
registerFactRenderer(FACT_TYPES.ROUND_END, renderRoundEndFact);
// 死亡登记只供体检归账，不进画面（死亡行由攻击组/其它 fact 负责），返回 null 让 renderLog 跳过
registerFactRenderer(FACT_TYPES.UNIT_DEATH, () => null);
// 吸星汇总只供体检归账（group absorbed/absorbGain 逐单位对账）；SKILL_ANNOUNCE 已负责「🌀 发动吸星」行，此处显式声明隐藏
registerFactRenderer(FACT_TYPES.ABSORB_SUMMARY, () => null);
// 召唤物阵亡登记只供体检归账（规则 260 不再从 ATTACK dead 反推）；战报死亡行由攻击组负责，此处显式隐藏
registerFactRenderer(FACT_TYPES.SUMMON_DEAD, () => null);
registerFactRenderer(FACT_TYPES.ZHANG_TAUNT, renderZhangTauntFact);
registerFactRenderer(FACT_TYPES.NO_CONTEND, renderNoContendFact);
registerFactRenderer(FACT_TYPES.PHANTOM_REVEAL, renderPhantomRevealFact);
registerFactRenderer(FACT_TYPES.PHANTOM_CONFUSE, renderPhantomConfuseFact);