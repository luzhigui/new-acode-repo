// render/409-facts-control.js — 效果域·控制位移族 fact 渲染器
//   控制位移族（乘风波及/击退/眩晕/行动跳过/惑心换位/蝶变/蛛飞）16 条整块迁入。
//   与 render/417-actions-translate-control.js 同族名——加新控制 fact 时「翻译器去 38c、渲染器来 35c」一眼对上。
export const VER = 'render/409-facts-control.js V1.0.2';

import { registerFactRenderer } from './406-fact-registry.js';
import { makeFXSnapshot, fmtHpText, fmtNum } from '../infra/102-core-utils.js';
import { FACT_TYPES, BUFF_SUBTYPES, CAMP_TYPES } from '../infra/106-battle-enums.js';

// 乘风突袭波及 / 击退 / 失败
export function renderWindAssaultSplashFact(fact) {
    const details = fact.targets.map(t => t.name).join('、');
    const word = fact.targets.length > 1 ? '各-' : '-';
    let text = `<span class="orange">${fact.label}波及${details}，${word}${fmtNum(fact.splashDmg)}</span>`;
    // 胖远桥莽撞：吃了溅射也 +攻，文本由 modules/26 随 fact 下发
    if (fact.rageText) text += ' ' + fact.rageText;
    return { type:'buff-splash', text };
}

export function renderWindAssaultPushFact(fact) {
    if (fact.behindUnit) {
        return {type:'buff-push', pushTargetUid: fact.target.uid, behindUid: fact.behindUnit.uid, oldPos: fact.oldPos, newPos: fact.behindPos, behindOldPos: fact.behindOldPos, buffType: BUFF_SUBTYPES.PUSH, text:`<span class="gold" style="font-size:1.1em;">${fact.label}击退！${fact.target.name}从${fact.oldPos}号位击退至${fact.behindPos}号位，${fact.behindUnit.name}被迫从${fact.behindOldPos}号位移至${fact.oldPos}号位</span>`};
    }
    return {type:'buff-push', pushTargetUid: fact.target.uid, behindUid: null, oldPos: fact.oldPos, newPos: fact.behindPos, buffType: BUFF_SUBTYPES.PUSH, text:`<span class="gold" style="font-size:1.1em;">${fact.label}击退！${fact.target.name}从${fact.oldPos}号位被击退至${fact.behindPos}号位</span>`};
}

export function renderWindAssaultFailFact(fact) {
    return {type:'info', text:`<span class="gray">${fact.label}${fact.reason}</span>`};
}

// 击退退无可退 → 眩晕（乘风突袭 / 胖远桥·年轻气盛共用）
export function renderPushStunFact(fact) {
    return {type:'info', text:`<span class="gold" style="font-size:1.1em;">${fact.label}退无可退！${fact.target.name}已在${fact.pos}号位，被震得头晕目眩（本回合无法行动）</span>`};
}

// 行动跳过
export function renderPassFact(fact) {
    const { unit, reason } = fact;
    // 张三丰：生生不息走独立文案（回血数值由组件层触发，这里只标记行动）
    if (reason === '生生不息') {
        const campName = unit.camp === CAMP_TYPES.ALLY ? '明教' : '六大派';
        return {
            type:'attack-group', uidA:unit.uid, uidD:null,
            entries:[
                {type:'info', text:`<span class="gray">${campName} ${unit.name} 生生不息</span>`}
            ],
            // 不设 isBlock（否则被标"被遮挡"→显示 😴），走专属 isEndlessBreath
            isEndlessBreath:true,
            _fxSnapshot: makeFXSnapshot(unit,null), waveTaunt:null, waveUnit:null,
            buffEffects:[], needsSeparator: true,
            _events: fact.events || []
        };
    }
    if (reason === '被遮挡' || reason === '拒马休息' || reason === '幼狮休息' || reason === '无力攻击') {
        const hpBefore = fmtHpText(fact.hpBefore !== undefined ? fact.hpBefore : unit.hp, unit.alive);
        const hpAfter = fmtHpText(fact.hpAfter !== undefined ? fact.hpAfter : unit.hp, unit.alive);
        const actualHeal = fact.actualHeal !== undefined ? fact.actualHeal : 15;
        const campName = unit.camp === CAMP_TYPES.ALLY ? '明教' : '六大派';
        const headText = reason === '幼狮休息'
            ? `🐱 ${campName} ${unit.name} 尚幼，无法攻击`
            : (reason === '无力攻击'
                ? `${campName} ${unit.name} 攻击力不足，无法出手`
                : `${campName} ${unit.name} ${reason}`);
        return {
            type:'attack-group', uidA:unit.uid, uidD:null,
            entries:[
                {type:'info', text:`<span class="gray">${headText}</span>`},
                // actualHeal 现在是实数差值（可能 14.999999999999998）：文本走 fmtNum，动效 healAmount 仍用原值
                {type:'info', text:`<span class="green">😴 休息回复 ${fmtNum(actualHeal)} 点生命（${fmtNum(hpBefore)} → ${fmtNum(hpAfter)}）</span>`, isHealEntry:true, healAmount:actualHeal, healUnitUid:unit.uid}
            ],
            isBlock:true, isRest:true,
            _fxSnapshot: makeFXSnapshot(unit,null), waveTaunt:null, waveUnit:null,
            buffEffects:[], needsSeparator: true, healAmount: actualHeal, healUnitUid: unit.uid,
            _events: fact.events || []
        };
    }
    return {
        type:'attack-group', uidA:unit.uid, uidD:null, entries:[], isBlock:true,
        _fxSnapshot: makeFXSnapshot(unit,null), waveTaunt:null, waveUnit:null,
        buffEffects:[],
        // 去掉 needsSeparator：眩晕/附身 pass 渲染空 attack-group（entries=[] 无文本），
        //   带 SEP 会打出一条"纯分隔符"；回合末紧挨蝶变飞回（也带 SEP）就是用户看到的双分隔符。
        //   眩晕/附身提示已由 PUSH_STUN / FLY_SKIP 文本承担，此处完全静默（格子置灰仍生效）。
        _events: fact.events || []
    };
}

// 惑心换位
export function renderMindControlSwapFact(fact) {
    const sideLabel = fact.side === CAMP_TYPES.ENEMY ? '敌方' : '己方';
    const swaps = fact.swaps || [];
    if (swaps.length === 0) return null;
    const parts = swaps.map(s => `${s.fromPos}号位${s.name}→${s.toPos}号位`).join('、');
    return { type: 'buff-swap', swaps, buffType: BUFF_SUBTYPES.SWAP, text: `<span class="gold">🌀 惑人心智${sideLabel}：${parts} 位置重排！</span>` };
}
export function renderMindControlFailFact(fact) {
    const sideLabel = fact.side === CAMP_TYPES.ENEMY ? '敌方' : '己方';
    const text = `🌀 惑人心智${sideLabel}：换位失败（${fact.reason}）`;
    // 「无变化」只剩引擎保留分支（全灭/全免疫/九格全占）才会发；core/215 已改成保证有效，
    //   正常路径必定有单位换位。真走到保留分支时也别刷屏（体检 166 靠条目做配对，照发）：
    //   标记 quiet，player/504 不把它落进战斗日志。
    if (fact.reason === '无变化') return { type:'info', text:`<span class="gray">${text}</span>`, quiet:true };
    return {type:'info', text:`<span class="gray">${text}</span>`};
}
export function renderMindControlBannerFact(fact) {
    return null; // 横幅特效已在 stageAction 中显示，此处不再输出冗余日志
}

// 小昭蛛变·蛛落 / 飞天
export function renderSpiderReturnFact(fact) {
    return { type:'info', spiderAction:'return', spiderUid: fact.spiderUid, text:`<span class="gold">🕷️ 蛛落：${fact.unitName} 从天而降，落在${fact.pos}号位！</span>`, needsSeparator: true };
}
export function renderSpiderFlyFact(fact) {
    return { type:'info', spiderAction:'fly', spiderUid: fact.spiderUid, text:`<span class="gold">🕷️ 飞天：${fact.unitName} ${fact.reason}，免疫本次攻击的 ${fmtNum(fact.incomingDmg||0)} 点伤害，化为蜘蛛遁走！剩余次数：${fact.remaining}</span>` };
}

// 蝶变
export function renderButterflyAttachFact(fact) {
    return { type:'info', butterflyAction:'attach', sisterUid: fact.sisterUid, hostUid: fact.hostUid, text:`<span class="gold">🦋 蝶变：${fact.sisterName} 化为蝴蝶附身于 ${fact.hostName}！方向：${fact.flyDirection === 'left' ? '←左' : '右→'} 攻+${fmtNum(fact.atkTransfer)} 防+${fmtNum(fact.defTransfer)} 血上限+${fmtNum(fact.hpTransfer)}</span>`, needsSeparator: true };
}
export function renderButterflyNoHostFact(fact) {
    return { type:'info', butterflyAction:'noHost', sisterUid: fact.sisterUid, text:`<span class="red">🦋 蝶变：${fact.unitName} 无队友可附身，香消玉殒！</span>` };
}
export function renderButterflyReturnFact(fact) {
    return { type:'info', butterflyAction:'return', sisterUid: fact.sisterUid, hostUid: fact.hostUid, text:`<span class="gold">🦋 蝶变：${fact.sisterName} 从 ${fact.hostName} 飞回，恢复原形！攻 ${fmtNum(fact.sisterAtk)} 防 ${fmtNum(fact.sisterDef)} 血 ${fmtNum(fact.sisterHp)}</span>`, needsSeparator: true };
}
export function renderButterflyHostDeadFact(fact) {
    return { type:'info', text:`<span class="gold">🦋 蝶变：宿主已阵亡，${fact.sisterName} 被迫返回！</span>`, uidD: fact.sisterUid };
}

// 行动跳过（眩晕/飞天）
export function renderStunSkipFact(fact) {
    return { type:'info', text:`<span class="gray">💫 ${fact.unitName} 被眩晕，无法响应攻击指令</span>` };
}
export function renderFlySkipFact(fact) {
    return { type:'info', text:`<span class="gray">🕷️ ${fact.unitName} 正在飞天，无法行动</span>` };
}

// ── 注册 ────────────────────────────────────────────────
registerFactRenderer(FACT_TYPES.WIND_ASSAULT_SPLASH, renderWindAssaultSplashFact);
registerFactRenderer(FACT_TYPES.WIND_ASSAULT_PUSH, renderWindAssaultPushFact);
registerFactRenderer(FACT_TYPES.WIND_ASSAULT_FAIL, renderWindAssaultFailFact);
registerFactRenderer(FACT_TYPES.PUSH_STUN, renderPushStunFact);
registerFactRenderer(FACT_TYPES.PASS, renderPassFact);
registerFactRenderer(FACT_TYPES.MIND_CONTROL_SWAP, renderMindControlSwapFact);
registerFactRenderer(FACT_TYPES.MIND_CONTROL_FAIL, renderMindControlFailFact);
registerFactRenderer(FACT_TYPES.MIND_CONTROL_BANNER, renderMindControlBannerFact);
registerFactRenderer(FACT_TYPES.SPIDER_RETURN, renderSpiderReturnFact);
registerFactRenderer(FACT_TYPES.SPIDER_FLY, renderSpiderFlyFact);
registerFactRenderer(FACT_TYPES.BUTTERFLY_ATTACH, renderButterflyAttachFact);
registerFactRenderer(FACT_TYPES.BUTTERFLY_NO_HOST, renderButterflyNoHostFact);
registerFactRenderer(FACT_TYPES.BUTTERFLY_RETURN, renderButterflyReturnFact);
registerFactRenderer(FACT_TYPES.BUTTERFLY_HOST_DEAD, renderButterflyHostDeadFact);
registerFactRenderer(FACT_TYPES.STUN_SKIP, renderStunSkipFact);
registerFactRenderer(FACT_TYPES.FLY_SKIP, renderFlySkipFact);