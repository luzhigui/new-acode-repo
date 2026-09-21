// render/35-facts-effect.js — 效果域 fact 渲染器
// V1.0.0 | ~27500 bytes | 2026-09-22 从 render/30 拆出：除攻击域(34)外的 67 条 fact 渲染实现
//
// 加新 fact 渲染：在本文件写函数 + 尾部 registerFactRenderer 一行（键=factType）。
// 跨域取别的渲染器一律走 getFactRenderer(FACT_TYPES.X)(data)，禁止 import 其它域文件（免环）。
import { CONFIG } from '../core/01config-5v5-test.js';
import { makeFXSnapshot, fmtHp } from '../infra/51-core-utils.js';
import { BUFF_TYPES, BUFF_SUBTYPES, CAMP_TYPES, ROLE_TYPES, FACT_TYPES } from '../infra/56-battle-enums.js';
import { registerFactRenderer, findUnitSnapshotByUid } from './33-fact-registry.js';
export const VER = 'render/35-facts-effect.js V1.0.0';

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
        text:`<span class="gray">🐴 拒马阵：${fact.pos}号位拒马未消散（成功率${fact.prob}%，${fact.roll}）</span>`
    };
}

export function renderZhangSwitchFact(fact) {
    return [
        { type:'info', text:`<span class="gold">⚔️ 张无忌切换近战形态！攻+${fact.atkGain}、防+${fact.defGain}、生命上限+${fact.maxHpGain}</span>`, isZhangSwitch:true, unitUid: fact.zhang.uid },
        { type:'info', text:`<span class="gold">🗣️ 张无忌：不好，要顶上去了！</span>`, isZhangTaunt:true }
    ];
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
        case BUFF_TYPES.DOUBLE_STRIKE:
            break;
        case BUFF_TYPES.MIND_CONTROL:
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

// Buff 衍生效果（嗜血/热血/乘风/流星）
export function renderBloodthirstLeechFact(fact) {
    const anchors = [`吸血+${fact.leechVal}`];
    if (fact.isBrother) {
        return { type:'info', text:`<span class="green">🕷️ 蝶血：${fact.unitName} 嗜血狂刀吸血+${fact.leechVal}</span>`, fxAnchors: anchors };
    }
    return { type:'info', text:`<span class="green">🗡️ ${fact.unitName} 的嗜血狂刀吸血+${fact.leechVal}</span>`, fxAnchors: anchors };
}

export function renderHotBloodHealFact(fact) {
    return { type:'info', text:`<span class="green">${fact.tag}：${fact.unitName} 回复+${fact.leech}</span>`, fxAnchors: [`回复+${fact.leech}`] };
}

export function renderWindAssaultSplashFact(fact) {
    const details = fact.targets.map(t => t.name).join('、');
    const word = fact.targets.length > 1 ? '各-' : '-';
    return { type:'buff-splash', text:`<span class="orange">${fact.label}波及${details}，${word}${fact.splashDmg}</span>` };
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

export function renderMeteorShowerMainFact(fact) {
    return { type:'info', text:`<span class="gold">${fact.label}伤害加深：${fact.targetName} 额外-${fact.bonusDmg}，防御-${fact.defReduce}</span>` };
}

export function renderMeteorShowerSplashFact(fact) {
    const details = fact.targets.map(t => t.name).join('、');
    const word = fact.targets.length > 1 ? '各-' : '-';
    let text = `<span class="orange">${fact.label}溅射：${details}，${word}${fact.splashDmg}，防御-${fact.defReduce}</span>`;
    if (fact.growth) text += ` <span class="gold">⚡ ${fact.unitName} 攻击+${fact.growth}</span>`;
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

// 行动跳过
export function renderPassFact(fact) {
    const { unit, reason } = fact;
    // 2026-09-17 张三丰：生生不息走独立文案（回血数值由组件层触发，这里只标记行动）
    if (reason === '生生不息') {
        const campName = unit.camp === CAMP_TYPES.ALLY ? '明教' : '六大派';
        return {
            type:'attack-group', uidA:unit.uid, uidD:null,
            entries:[
                {type:'info', text:`<span class="gray">${campName} ${unit.name} 生生不息</span>`}
            ],
            // 2026-09-17 不设 isBlock（否则被标"被遮挡"→显示 😴），走专属 isEndlessBreath
            isEndlessBreath:true,
            _fxSnapshot: makeFXSnapshot(unit,null), waveTaunt:null, waveUnit:null,
            buffEffects:[], needsSeparator: true,
            _events: fact.events || []
        };
    }
    if (reason === '被遮挡' || reason === '拒马休息') {
        const hpBefore = fact.hpBefore !== undefined ? fact.hpBefore : fmtHp(unit.hp);
        const hpAfter = fact.hpAfter !== undefined ? fact.hpAfter : fmtHp(unit.hp);
        const actualHeal = fact.actualHeal !== undefined ? fact.actualHeal : 15;
        const campName = unit.camp === CAMP_TYPES.ALLY ? '明教' : '六大派';
        return {
            type:'attack-group', uidA:unit.uid, uidD:null,
            entries:[
                {type:'info', text:`<span class="gray">${campName} ${unit.name} ${reason}</span>`},
                {type:'info', text:`<span class="green">😴 休息回复 ${actualHeal} 点生命（${hpBefore} → ${hpAfter}）</span>`, isHealEntry:true, healAmount:actualHeal, healUnitUid:unit.uid}
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
        buffEffects:[], needsSeparator: true,
        _events: fact.events || []
    };
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
        return {type:'info', text:`<span class="gold">⚡ 概率连击触发！</span>`, isDoubleStrikeBanner:true};
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

// 惑心换位
export function renderMindControlSwapFact(fact) {
    const sideLabel = fact.side === CAMP_TYPES.ENEMY ? '敌方' : '己方';
    return {type:'buff-swap', uidA: fact.unitA.uid, uidB: fact.unitB.uid, oldPosA: fact.posA, oldPosB: fact.posB, buffType: BUFF_SUBTYPES.SWAP, text:`<span class="gold">🌀 惑人心智${sideLabel}：${fact.posA}号位${fact.unitA.name}与${fact.posB}号位${fact.unitB.name}互换位置！</span>`};
}
export function renderMindControlFailFact(fact) {
    const sideLabel = fact.side === CAMP_TYPES.ENEMY ? '敌方' : '己方';
    return {type:'info', text:`<span class="gray">🌀 惑人心智${sideLabel}：换位失败（${fact.reason}）</span>`};
}
export function renderMindControlBannerFact(fact) {
    return null; // 横幅特效已在 stageAction 中显示，此处不再输出冗余日志
}

// 乾坤大挪移
export function renderQianKunUpgradedFact(fact) {
    return {
        type:'info',
        text:`<span class="gold">🦋 乾坤大挪移（升级版）：减伤${fact.reducePct}%，反弹${fact.rebound}给${fact.attackerName}（${fact.zhangName}自伤${fact.selfDmg}）</span>`,
        reboundDmg: fact.rebound,
        reboundTargetUid: fact.attackerUid,
        selfDmg: fact.selfDmg,
        selfDmgUid: fact.zhangUid
    };
}
export function renderQianKunBasicFact(fact) {
    return {
        type:'info',
        text:`<span class="gold">✨ 乾坤大挪移：减伤${fact.reducePct}%，反弹${fact.rebound}给${fact.attackerName}（${fact.zhangName}自伤${fact.selfDmg}）</span>`,
        reboundDmg: fact.rebound,
        reboundTargetUid: fact.attackerUid,
        selfDmg: fact.selfDmg,
        selfDmgUid: fact.zhangUid
    };
}

// 快乐回血
export function renderKuaiLeHealFact(fact) {
    return {
        type:'info',
        text:`<span class="green">💚 快乐回血：${fact.unitName} 回复${fact.heal}点生命（${fact.layers}层触发），血量 ${fact.hpBefore} → ${fact.hpAfter}</span>`,
        fxAnchors: [`回复${fact.heal}点`],
        buffType: BUFF_SUBTYPES.ELITE_KUAILE_HEAL,
        zhouUid: fact.unitUid,
        zhouHpAfter: fact.hpAfter,
        isHealEntry: true,
        healAmount: fact.heal,
        healUnitUid: fact.unitUid
    };
}

// 小昭蛛变
export function renderSpiderTransformFact(fact) {
    const gain = fact.masteryGain ? `，精通+${fact.masteryGain.atk}攻+${fact.masteryGain.def}防+${fact.masteryGain.hp}血` : '';
    return { type:'info', text:`<span class="gold">🕷️ 蛛变：${fact.unitName} 变换为<span class="gold">${fact.newRole}</span>（已精通${fact.mastered}/4${gain}）</span>` };
}
export function renderSpiderReturnFact(fact) {
    return { type:'info', spiderAction:'return', spiderUid: fact.spiderUid, text:`<span class="gold">🕷️ 蛛落：${fact.unitName} 从天而降，落在${fact.pos}号位！</span>`, needsSeparator: true };
}
export function renderSpiderStrikeFact(fact) {
    // 蛛袭不再产生日志文本，由导演 stageAction 直接驱动特效与掉血
    return null;
}

// 玄冥神掌
export function renderXuanmingDotFact(fact) {
    return { type:'info', text:`<span class="purple">❄️ 玄冥神掌寒毒发作，${fact.unitName} 受到 ${fact.dot} 点伤害</span>`, fxAnchors: [`受到 ${fact.dot} 点`], uidD: fact.uidD, isDead: fact.isDead, dmg: fact.dot };
}
export function renderXuanmingPoisonedFact(fact) {
    return { type:'info', text:`<span class="purple">❄️ ${fact.attackerName} 的玄冥神掌使 ${fact.targetName} 中毒！每回合损失生命（${fact.dotPercents.join('%→')}%→消失）</span>` };
}

// 成昆幻影伪装
export function renderPhantomDisguiseHealFact(fact) {
    return { type:'info', text:`<span class="green">🎭 幻影伪装：${fact.unitName} 回复 ${fact.heal} 点生命</span>`, fxAnchors: [`回复 ${fact.heal} 点`] };
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

// 张无忌九阳 / 融会贯通
export function renderNineYangHealFact(fact) {
    return { type:'info', text:`<span class="green">☀️ 九阳神功回复+${fact.heal}，${fact.hpBefore}→${fact.hpAfter}</span>`, fxAnchors: [`回复+${fact.heal}`], isHealEntry:true, healAmount:fact.heal, healUnitUid:fact.unitUid };
}
export function renderRongHuiBonusFact(fact) {
    return { type:'info', text:`<span class="red">🔥 融会贯通额外+${fact.extra}（目标攻击${fact.targetAtk} 防御${fact.targetDef}，差值绝对值×50%）</span>` };
}

// 韦一笑吸血
export function renderWeiLeechFact(fact) {
    return { type:'info', text:`<span class="green">🦇 青翼蝠王·吸血+${fact.heal}，上限→${fact.newMaxHp}</span>`, fxAnchors: [`吸血+${fact.heal}`], isHealEntry:true, healAmount:fact.heal, healUnitUid:fact.unitUid };
}

// 小昭·姊 乾坤衍生 / 蝶变
export function renderQianKunDerivedFact(fact) {
    return {
        type:'info',
        text:`<span class="gold">🦋 乾坤衍生：${fact.targetName}减伤${fact.reduce}，${fact.healTargetName}治疗+${fact.heal}，${fact.atkTargetName}攻击+${fact.atkGain}</span>`,
        fxAnchors: [`治疗+${fact.heal}`, `攻击+${fact.atkGain}`],
        isHealEntry: true,
        healAmount: fact.heal,
        healUnitUid: fact.healTargetUid,
        buffType: BUFF_SUBTYPES.QIAN_KUN_ATK,
        atkGain: fact.atkGain,
        atkTargetUid: fact.atkTargetUid
    };
}
export function renderButterflyAttachFact(fact) {
    return { type:'info', butterflyAction:'attach', sisterUid: fact.sisterUid, hostUid: fact.hostUid, text:`<span class="gold">🦋 蝶变：${fact.sisterName} 化为蝴蝶附身于 ${fact.hostName}！方向：${fact.flyDirection === 'left' ? '←左' : '右→'} 攻+${fact.atkTransfer} 防+${fact.defTransfer} 血上限+${fact.hpTransfer}</span>`, needsSeparator: true };
}
export function renderButterflyNoHostFact(fact) {
    return { type:'info', butterflyAction:'noHost', sisterUid: fact.sisterUid, text:`<span class="red">🦋 蝶变：${fact.unitName} 无队友可附身，香消玉殒！</span>` };
}
export function renderButterflyReturnFact(fact) {
    return { type:'info', butterflyAction:'return', sisterUid: fact.sisterUid, hostUid: fact.hostUid, text:`<span class="gold">🦋 蝶变：${fact.sisterName} 从 ${fact.hostName} 飞回，恢复原形！攻 ${fact.sisterAtk} 防 ${fact.sisterDef} 血 ${fact.sisterHp}</span>`, needsSeparator: true };
}
export function renderButterflyHostDeadFact(fact) {
    return { type:'info', text:`<span class="gold">🦋 蝶变：宿主已阵亡，${fact.sisterName} 被迫返回！</span>`, uidD: fact.sisterUid, isDead: fact.isDead };
}

// 小昭·妹 飞天 / 拒马 / 连击
export function renderSpiderFlyFact(fact) {
    return { type:'info', spiderAction:'fly', spiderUid: fact.spiderUid, text:`<span class="gold">🕷️ 飞天：${fact.unitName} ${fact.reason}，免疫本次攻击的 ${fact.incomingDmg||0} 点伤害，化为蜘蛛遁走！剩余次数：${fact.remaining}</span>` };
}
export function renderXiaoZhaoHorseFact(fact) {
    return {type:'buff-summon', text:`<span class="gold">🐴 小昭·妹的拒马在${fact.pos}号位出现！</span>`, buffType: BUFF_SUBTYPES.SUMMON, horsePos: fact.pos, horseUid: fact.horseUid, horseTaunt: '嗷——！'};
}
export function renderSpiderDoubleStrikeFact(fact) {
    return {type:'info', text:`<span class="gold">🕷️ 蝶击：小昭·妹永久概率连击触发！</span>`, isDoubleStrikeBanner:true};
}

// 行动跳过（眩晕/飞天）
export function renderStunSkipFact(fact) {
    return { type:'info', text:`<span class="gray">💫 ${fact.unitName} 被眩晕，无法响应攻击指令</span>` };
}
export function renderFlySkipFact(fact) {
    return { type:'info', text:`<span class="gray">🕷️ ${fact.unitName} 正在飞天，无法行动</span>` };
}

// 战士斩杀
export function renderWarriorExecuteFact(fact) {
    return { type:'info', text:`<span class="red">⚔️ 战士斩杀！${fact.unitName} 直接击杀 ${fact.targetName}！</span>` };
}

// 巨马反伤 / 严阵以待反弹
export function renderHorseReboundFact(fact) {
    return { type:'info', text:`<span class="red">🐴 巨马反伤：${fact.unitName} 受到 ${fact.rebound} 点反伤</span>` };
}
export function renderFortifyReboundFact(fact) {
    if (fact.hasSister) {
        return { type:'info', text:`<span class="gold">🛡️ 严阵以待反弹${fact.reboundDmg}给${fact.unitName}（姐姐强化：回复${fact.reboundDmg}）</span>` };
    }
    return { type:'info', text:`<span class="gold">🛡️ 严阵以待反弹${fact.reboundDmg}给${fact.unitName}</span>` };
}

// 张三丰：生生不息（2026-09-20 纯回血 + 溢出转嫁；加防不在此，归八卦阵）
// 溢出文案分三种：无人可接（无其他存活队友）/ 接盘者回了血 / 接盘者已满血（本次溢出作废）
export function renderEndlessBreathFact(fact) {
    const self = fact.heal > 0 ? `回复${fact.heal}点生命` : '生命已满';
    let tail = '';
    if (fact.overflow > 0) {
        // 2026-09-21 溢出目标改为随机（满血也可被选中）后，三种情况要分开写：
        // ① 无人可接（除张三丰外无存活友方）② 接盘者确实回了血 ③ 接盘者已满血，本次溢出作废
        if (!fact.overflowToName) {
            tail = `，溢出${fact.overflow}点（无其他存活队友）`;
        } else if (fact.overflowHealed > 0) {
            tail = `，溢出${fact.overflow}点转给${fact.overflowToName}（其回复${fact.overflowHealed}点）`;
        } else {
            tail = `，溢出${fact.overflow}点转给${fact.overflowToName}（其已满血，未生效）`;
        }
    }
    return { type:'info', text:`<span class="green">☯ 生生不息：${fact.unitName} ${self}${tail}</span>` };
}

// 张三丰：不争（仅剩一人判负）
export function renderNoContendFact(fact) {
    return { type:'info', text:`<span class="gold">☯ 不争：六大派仅剩 ${fact.unitName} 一人，明教获胜</span>` };
}

// 流星溅射成长
export function renderMeteorSplashGrowthFact(fact) {
    return { type:'info', text:`<span class="gold">⚡ ${fact.unitName} 攻击+${fact.growth}</span>` };
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

// 附录：raw HTML → factType 渲染
export function renderXingFenExtraAttackFact(fact) {
    return { type:'info', text:`<span class="gold">💗 性奋：${fact.unitName} 获得额外攻击机会！</span>` };
}
export function renderXinHunDeathFact(fact) {
    return { type:'info', text:`<span class="red">💀 ${fact.unitName} 因新婚扣血而阵亡！</span>`, uidD: fact.uidD, isDead:true };
}
export function renderClawNoHealFact(fact) {
    return { type:'info', text:`<span class="gray">💚 宋青书已满血，白骨爪未能回复生命</span>` };
}
export function renderXuanmingLinkAttackFact(fact) {
    return { type:'info', text:`<span class="gold">🔗 ${fact.partnerName} 跟随 ${fact.unitName} 发动联动攻击！</span>` };
}
export function renderSpiderDeadTargetFact(fact) {
    return { type:'info', text:`<span class="gray">🕷️ 蛛袭：目标已死亡，攻击取消</span>` };
}
export function renderXingFenGrantFact(fact) {
    return { type:'buff-summary', text:`<span class="gold">💗 性奋：${fact.songName} 受${fact.zhouName}激励，本回合每次攻击后可再次攻击！</span>`, buffType: BUFF_SUBTYPES.ELITE_XINGFEN };
}
export function renderClawHitFact(fact) {
    return { type:'info', hpAfter: fact.hpAfter, clawTargetUid: fact.targetUid, dmg: fact.dmg, text:`<span style="color:#222">🐾 九阴白骨爪${fact.depth>0?'连锁':'追击'}！${fact.unitName} 对 ${fact.targetName} 造成 ${fact.dmg} 点伤害${fact.jealous?'【嫉妒】':''}</span>` };
}
export function renderClawExecuteFact(fact) {
    const dmgText = fact.dmg !== undefined ? `造成 <span class="red">${fact.dmg}</span> 点伤害` : '造成致命一击';
    return { type:'info', text:`<span style="color:#222">🐾 九阴白骨爪斩杀！${fact.unitName} 对 ${fact.targetName} ${dmgText}</span>` };
}
export function renderClawHealFact(fact) {
    return { type:'info', text:`<span class="green">💚 宋青书因九阴白骨爪共回复${Math.round(fact.totalHeal)}点生命</span>`, fxAnchors: [`共回复${Math.round(fact.totalHeal)}点`] };
}
export function renderPhantomRevealFact(fact) {
    return { type:'info', text:`<span class="gold">🎭 ${fact.unitName}识破${fact.deceiver}伪装，锁定真正的${fact.deceiver}！</span>` };
}
export function renderPhantomConfuseFact(fact) {
    const isButterfly = fact.deceiver === '小昭·妹';
    return { type:'info', text:`<span class="gold">${isButterfly ? '🕷️ 蝶舞迷心！' : '🎭 幻影伪装！'}${fact.unitName}被${fact.deceiver}迷惑，误攻队友${fact.targetName}！</span>` };
}

// ── 注册（本域 67 条）────────────────────────────────────
registerFactRenderer(FACT_TYPES.HORSE_DESTROY, renderHorseDestroyFact);
registerFactRenderer(FACT_TYPES.ZHANG_SWITCH, renderZhangSwitchFact);
registerFactRenderer(FACT_TYPES.BUFF_SUMMARY, (data) => renderBuffSummaryFact(data.buff, data.allyTeamUids, data.doubleStrikeUid));
registerFactRenderer(FACT_TYPES.CARRY_APPLY, renderCarryApplyFact);
registerFactRenderer(FACT_TYPES.HORSE_SUMMON, renderHorseSummonFact);
registerFactRenderer(FACT_TYPES.XIAO_ZHAO_HORSE, renderXiaoZhaoHorseFact);
registerFactRenderer(FACT_TYPES.PASS, renderPassFact);
registerFactRenderer(FACT_TYPES.KU_LIAN_PRIORITY, renderKuLianPriorityFact);
registerFactRenderer(FACT_TYPES.KU_LIAN, renderKuLianFact);
registerFactRenderer(FACT_TYPES.DOUBLE_STRIKE, renderDoubleStrikeFact);
registerFactRenderer(FACT_TYPES.RANGED_GROWTH, renderRangedGrowthFact);
registerFactRenderer(FACT_TYPES.FORTIFY_SHIELD, renderFortifyShieldFact);
registerFactRenderer(FACT_TYPES.DOUBLE_STRIKE_SUMMARY, renderDoubleStrikeSummaryFact);
registerFactRenderer(FACT_TYPES.MIND_CONTROL_SWAP, renderMindControlSwapFact);
registerFactRenderer(FACT_TYPES.MIND_CONTROL_FAIL, renderMindControlFailFact);
registerFactRenderer(FACT_TYPES.MIND_CONTROL_BANNER, renderMindControlBannerFact);
registerFactRenderer(FACT_TYPES.QIAN_KUN_UPGRADED, renderQianKunUpgradedFact);
registerFactRenderer(FACT_TYPES.QIAN_KUN_BASIC, renderQianKunBasicFact);
registerFactRenderer(FACT_TYPES.KUAI_LE_HEAL, renderKuaiLeHealFact);
registerFactRenderer(FACT_TYPES.SPIDER_TRANSFORM, renderSpiderTransformFact);
registerFactRenderer(FACT_TYPES.SPIDER_RETURN, renderSpiderReturnFact);
registerFactRenderer(FACT_TYPES.SPIDER_STRIKE, renderSpiderStrikeFact);
registerFactRenderer(FACT_TYPES.SPIDER_FLY, renderSpiderFlyFact);
registerFactRenderer(FACT_TYPES.SPIDER_DOUBLE_STRIKE, renderSpiderDoubleStrikeFact);
registerFactRenderer(FACT_TYPES.SPIDER_DEAD_TARGET, renderSpiderDeadTargetFact);
registerFactRenderer(FACT_TYPES.XUAN_MING_DOT, renderXuanmingDotFact);
registerFactRenderer(FACT_TYPES.XUAN_MING_POISONED, renderXuanmingPoisonedFact);
registerFactRenderer(FACT_TYPES.XUAN_MING_LINK_ATTACK, renderXuanmingLinkAttackFact);
registerFactRenderer(FACT_TYPES.PHANTOM_DISGUISE_HEAL, renderPhantomDisguiseHealFact);
registerFactRenderer(FACT_TYPES.PHANTOM_REVEAL, renderPhantomRevealFact);
registerFactRenderer(FACT_TYPES.PHANTOM_CONFUSE, renderPhantomConfuseFact);
registerFactRenderer(FACT_TYPES.XING_FEN_RETRY, renderXingFenRetryFact);
registerFactRenderer(FACT_TYPES.XIN_HUN, renderXinHunFact);
registerFactRenderer(FACT_TYPES.XING_FEN_COST, renderXingFenCostFact);
registerFactRenderer(FACT_TYPES.XING_FEN_EXTRA_ATTACK, renderXingFenExtraAttackFact);
registerFactRenderer(FACT_TYPES.XING_FEN_GRANT, renderXingFenGrantFact);
registerFactRenderer(FACT_TYPES.XIN_HUN_DEATH, renderXinHunDeathFact);
registerFactRenderer(FACT_TYPES.NINE_YANG_HEAL, renderNineYangHealFact);
registerFactRenderer(FACT_TYPES.RONG_HUI_BONUS, renderRongHuiBonusFact);
registerFactRenderer(FACT_TYPES.WEI_LEECH, renderWeiLeechFact);
registerFactRenderer(FACT_TYPES.QIAN_KUN_DERIVED, renderQianKunDerivedFact);
registerFactRenderer(FACT_TYPES.BUTTERFLY_ATTACH, renderButterflyAttachFact);
registerFactRenderer(FACT_TYPES.BUTTERFLY_NO_HOST, renderButterflyNoHostFact);
registerFactRenderer(FACT_TYPES.BUTTERFLY_RETURN, renderButterflyReturnFact);
registerFactRenderer(FACT_TYPES.BUTTERFLY_HOST_DEAD, renderButterflyHostDeadFact);
registerFactRenderer(FACT_TYPES.HORSE_REBOUND, renderHorseReboundFact);
registerFactRenderer(FACT_TYPES.FORTIFY_REBOUND, renderFortifyReboundFact);
registerFactRenderer(FACT_TYPES.WIND_ASSAULT_SPLASH, renderWindAssaultSplashFact);
registerFactRenderer(FACT_TYPES.WIND_ASSAULT_PUSH, renderWindAssaultPushFact);
registerFactRenderer(FACT_TYPES.WIND_ASSAULT_FAIL, renderWindAssaultFailFact);
registerFactRenderer(FACT_TYPES.METEOR_SHOWER_MAIN, renderMeteorShowerMainFact);
registerFactRenderer(FACT_TYPES.METEOR_SHOWER_SPLASH, renderMeteorShowerSplashFact);
registerFactRenderer(FACT_TYPES.METEOR_SPLASH_GROWTH, renderMeteorSplashGrowthFact);
registerFactRenderer(FACT_TYPES.WARRIOR_EXECUTE, renderWarriorExecuteFact);
registerFactRenderer(FACT_TYPES.BLOOD_THIRST_LEECH, renderBloodthirstLeechFact);
registerFactRenderer(FACT_TYPES.HOT_BLOOD_HEAL, renderHotBloodHealFact);
registerFactRenderer(FACT_TYPES.ROUND_START, renderRoundStartFact);
registerFactRenderer(FACT_TYPES.ROUND_END, renderRoundEndFact);
registerFactRenderer(FACT_TYPES.ZHANG_TAUNT, renderZhangTauntFact);
registerFactRenderer(FACT_TYPES.CLAW_NO_HEAL, renderClawNoHealFact);
registerFactRenderer(FACT_TYPES.CLAW_HIT, renderClawHitFact);
registerFactRenderer(FACT_TYPES.CLAW_EXECUTE, renderClawExecuteFact);
registerFactRenderer(FACT_TYPES.CLAW_HEAL, renderClawHealFact);
registerFactRenderer(FACT_TYPES.STUN_SKIP, renderStunSkipFact);
registerFactRenderer(FACT_TYPES.FLY_SKIP, renderFlySkipFact);
registerFactRenderer(FACT_TYPES.ENDLESS_BREATH, renderEndlessBreathFact);
registerFactRenderer(FACT_TYPES.NO_CONTEND, renderNoContendFact);
