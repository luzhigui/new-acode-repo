// render/38-actions-translate-attack.js — fact → stageAction 翻译器·攻击族（38 拆分）
// V1.0.4 | 2026-10-18 灭绝师太三击吸血回血飘字改走 HEAL 动作（afterText）：原先在 render/39 ATTACK.fx
//          出手帧同步补发 HEAL_FLOAT，被攻击动画/闪光盖住实机看不见撒；并回与其他治疗相同的已验证通道
// V1.0.3 | 2026-10-16 新增读本击 data.qiShangBanner → 组内 BANNER 演出（唐文亮「💢 七伤齐发！」满 7 档横幅）：
//          老板口径——单位自己产生的攻击前置/特效必须落在**自己的攻击组**里，故横幅不再走组外扁平
//          SKILL_ANNOUNCE + render/38-stat.bannerText 通道，改为挂本组 data、锚本组 factIndex 出演出
// V1.0.2 | 2026-10-16 两改（老板报的实机现象）：①MISS/DODGE 翻译器补 isKuLianAttack 透传——宋青书苦练 💪
//   在「未命中/被闪避」路径也要播（原先唯一发信点在 ATTACK 动作 fx，命中判定 skipped 时无 ATTACK 动作 →
//   苦练特效整段消失；attacker 快照 state 块本就带 _kuLianActive，无需改引擎）；②makeAttackAction 读本击
//   data.qiShangSelfDmg（modules/26 写进攻击组）→ 唐文亮七伤拳自损在自己头顶补 💥-N 掉血弹幕
// V1.0.1 | 2026-10-16 ATTACK/MISS/DODGE 翻译器加 linkReason 透传（render/39 出手帧据此发被动出手徽章飘字）
// V1.0.0 | ~20500 bytes | 2026-10-13 从 render/38-actions-translate.js 纯搬移：攻击/命中/闪避/处决/反伤/
//          溅射/连击类 FACT_TRANSLATORS 条目 + makeAttackAction，翻译逻辑零改动。表由 38 入口合成进 FACT_TRANSLATORS。
import { makeFXSnapshot } from '../infra/51-core-utils.js';
import { STAGE_ACTION_TYPES, FACT_TYPES, CAMP_TYPES, BUFF_EFFECT_TYPES } from '../infra/56-battle-enums.js';
import { makeHealAction } from './38-actions-translate-heal.js';
// 2026-10-15 攻击组内回血名单改从契约层引（原先硬编码在本文件 L205，新增回血忘加 = 攻击组内飘字静默漏掉）
import { ATTACK_GROUP_HEAL_FACTS } from '../infra/58-fact-contract.js';
export const VER = 'render/38-actions-translate-attack.js V1.0.3';

// 攻击族翻译器表（键=factType）
export const ATTACK_TRANSLATORS = {
    [FACT_TYPES.ATTACK]: (data, index) => makeAttackAction(data, index),
    [FACT_TYPES.MISS]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.MISS,
        actorUid: data.attacker?.uid ?? null,
        targetUid: data.target?.uid ?? null,
        // 2026-10-16 苦练蓄力：打空同样算宋青书本回合出手，💪 不被命中判定吞掉（快照 state 块带 _kuLianActive）
        isKuLianAttack: data.attacker?.state?._kuLianActive === true,
        // 2026-10-16 被动出手原因：反击/跟随打空也能认出来（attacker 快照 state 块携带）
        linkReason: data.attacker?.state?._linkReason ?? null,
        fx: data.fxSnapshot || null,
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.DODGE]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.DODGE,
        actorUid: data.attacker?.uid ?? null,
        targetUid: data.dodger?.uid ?? null,
        // 2026-10-16 苦练蓄力：被闪避（含闪避反击）同样算宋青书本回合出手，💪 照播
        isKuLianAttack: data.attacker?.state?._kuLianActive === true,
        reboundDmg: data.reboundDmg,
        dead: data.attackerHpAfter <= 0,
        linkReason: data.attacker?.state?._linkReason ?? null,
        // 2026-09-24 韦一笑闪避反击吸血带给演出层，用于补吸血飘字（原先只有日志文本）
        weiHeal: data.weiHeal || null,
        fx: data.fxSnapshot || null,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.EMPTY_TARGET]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.EMPTY_TARGET,
        actorUid: data.attacker?.uid ?? null,
        reason: data.reason,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.WARRIOR_EXECUTE]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.EXECUTE,
        actorUid: data.unitUid ?? data.unit?.uid ?? null,
        targetUid: data.targetUid ?? data.uidD ?? data.target?.uid ?? null,
        dmg: data.dmg ?? null,
        dead: data.isDead ?? true,
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.CLAW_EXECUTE]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.EXECUTE,
        actorUid: data.unitUid ?? data.unit?.uid ?? null,
        targetUid: data.targetUid ?? data.uidD ?? data.target?.uid ?? null,
        dmg: data.dmg ?? null,
        dead: data.isDead ?? true,
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.XIN_HUN_DEATH]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.DEATH,
        actorUid: data.uidD ?? null,
        targetUid: data.uidD ?? null,
        dead: true,
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.SPIDER_STRIKE]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.SPIDER_STRIKE,
        actorUid: data.unitUid ?? null,
        targetUid: data.targetUid ?? null,
        dmg: data.totalDmg,
        dead: data.isDead,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.HORSE_REBOUND]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.REBOUND,
        actorUid: data.attackerUid ?? null,
        targetUid: data.unitUid ?? null,
        dmg: Math.round(data.rebound ?? 0),
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.FORTIFY_REBOUND]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.REBOUND,
        actorUid: data.attackerUid ?? null,
        targetUid: data.unitUid ?? null,
        dmg: Math.round(data.reboundDmg ?? 0),
        bannerText: '🛡️ 严阵以待！',
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.XUAN_MING_DOT]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.DOT,
        targetUid: data.uidD ?? null,
        dmg: data.dot,
        dead: data.isDead,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.WIND_ASSAULT_SPLASH]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.SPLASH,
        actorUid: data.attackerUid ?? data.unitUid ?? null,
        targetUid: data.primaryUid ?? null,
        splashUids: data.splashUids ?? data.targets?.map(t => t.uid) ?? [],
        splashDmg: data.splashDmg ?? null,
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.METEOR_SHOWER_SPLASH]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.SPLASH,
        actorUid: data.attackerUid ?? data.unitUid ?? null,
        targetUid: data.primaryUid ?? null,
        splashUids: data.splashUids ?? data.targets?.map(t => t.uid) ?? [],
        splashDmg: data.splashDmg ?? null,
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.DOUBLE_STRIKE]: (data, index) => data.success
        ? { kind: STAGE_ACTION_TYPES.BANNER, text: '⚡ 概率连击！', factIndex: index, timing: 'beforeText', nonBlocking: true }
        : null,
    [FACT_TYPES.SPIDER_DOUBLE_STRIKE]: (data, index) => ({ kind: STAGE_ACTION_TYPES.BANNER, text: '⚡ 概率连击！', factIndex: index, timing: 'beforeText' }),
    [FACT_TYPES.XING_FEN_GRANT]: () => null,
    [FACT_TYPES.DOUBLE_STRIKE_SUMMARY]: () => null
};

function makeAttackAction(data, index) {
    const attacker = data.attacker;
    const target = data.target;
    const dmgResult = data.dmgResult;
    const dmg = Math.round(dmgResult?.dmg ?? 0);
    const dead = !!(dmgResult?.dead || dmgResult?.executeKill);
    const hpAfter = data.snap?.targetHpAfter !== undefined
        ? data.snap.targetHpAfter
        : Math.floor(target?.hp ?? 0);
    const hpBefore = dmgResult?.hpBefore ?? Math.floor(target?.hp ?? 0);

    const baseAction = {
        kind: STAGE_ACTION_TYPES.ATTACK,
        actorUid: attacker?.uid ?? null,
        targetUid: target?.uid ?? null,
        dmg,
        hpBefore,
        hpAfter,
        dead,
        fx: makeFXSnapshot(attacker, target),
        factIndex: index,
        timing: 'beforeText',
        // 演出字段（从 fact 携带到 stageAction，供 applyStageActionToFX 消费）
        attackerRole: data.snap?.attackerRole ?? attacker?.role ?? null,
        waveTaunt: data.dmgCalc?.waveTaunt ?? null,
        waveUnitUid: data.dmgCalc?.waveUnit?.uid ?? null,
        waveUnit: data.dmgCalc?.waveUnit ?? null,
        isKuLianAttack: data.snap?.isKuLianAttack ?? false,
        isLinkAttack: data.snap?.isLinkAttack ?? false,
        // 2026-10-16 被动出手原因：render/39 出手帧据此发头顶飘字徽章
        linkReason: data.snap?.linkReason ?? null,
        // 2026-09-24 灭绝师太：出手计数文本（壹/貳/參）与三击吸血量，由 render/39 在她出手演出帧消费
        miejueCountText: data.miejueCountText ?? null,
        miejueLeech: data.miejueLeech ?? 0,
        // 2026-09-26 胖远桥：两技能演出标记（由 modules/26 写进本击 fact），render/39 出手帧据此发信号
        pangTaunt: data.pangTaunt ?? false,
        pangClumsy: data.pangClumsy ?? false,
        // 2026-10-12 箭靶标记碎裂：本击消费了 🎯 时由 modules/26 写进本击 fact → 命中帧（伤害弹幕之前）播碎裂
        markBurst: data.markBurst ?? false
    };

    // 从 attack fact 的 entries 提取 afterText 特效，靠 e.type/e.factType 区分：溅射 / 白骨爪 / 乾坤飘字 / 死亡画笔
    const afterTextEffects = [];
    const beforeEffects = [];   // 2026-10-05 破防等「攻击前」效果：引擎序在伤害计算前，飘字赶在箭矢/💥 之前
    const entries = data.entries || [];
    for (const e of entries) {
        if (!e) continue;
        if (e.type === 'buff-splash' || (e.factType && [FACT_TYPES.METEOR_SHOWER_SPLASH, FACT_TYPES.WIND_ASSAULT_SPLASH].includes(e.factType))) {
            afterTextEffects.push({
                kind: STAGE_ACTION_TYPES.BUFF_EFFECT,
                effectType: BUFF_EFFECT_TYPES.SPLASH,
                attackerUid: e.attackerUid ?? attacker?.uid ?? null,
                primaryUid: e.primaryUid ?? target?.uid ?? null,
                splashUids: e.splashUids ?? (e.data?.targets?.map(t => t.uid) ?? []),
                splashDmg: e.splashDmg ?? null,
                // 2026-10-02 溅射减防（流星 splashDefReduce，core/04 对每个溅射目标 STAT_CHANGE 已实改）；
                //   buff-splash/乘风等无此字段为 null，render/39 有值才飘「🛡-N」
                splashDefReduce: e.data?.defReduce ?? null,
                buffType: e.buffType ?? null,
                factIndex: index,
                timing: 'afterText'
            });
        } else if (e.buffType === 'qiankun_atk' && e.atkTargetUid && e.atkGain) {
            afterTextEffects.push({
                kind: STAGE_ACTION_TYPES.BUFF_EFFECT,
                effectType: BUFF_EFFECT_TYPES.ATK_BUFF,
                targetUid: e.atkTargetUid,
                gain: e.atkGain,
                factIndex: index,
                timing: 'afterText'
            });
        } else if (e.factType === FACT_TYPES.FORTIFY_SHIELD) {
            // 2026-10-05 坚盾/攻盾飘字（老板 demo 定稿）：与 💥 同拍（本行 afterText，箭矢落点后紧跟）。
            //   fact 走组内 entries（tryFortify 优先推 group），此前白名单没它 → 只有日志行没有 🛡️ 飘字。
            afterTextEffects.push({
                kind: STAGE_ACTION_TYPES.STAT_CHANGE,
                statKind: 'def',
                targetUid: e.data?.unitUid ?? null,
                gain: e.data?.increment ?? 0,
                factIndex: index,
                timing: 'afterText'
            });
        } else if (e.factType && ATTACK_GROUP_HEAL_FACTS.includes(e.factType)) {
            const healAction = makeHealAction(e.data || {}, index);
            if (healAction && healAction.amount) {
                healAction.timing = 'afterText';
                afterTextEffects.push(healAction);
            }
            // 热血奋战：附一条 nonBlocking 横幅，翻倍时文案不同
            if (e.factType === FACT_TYPES.HOT_BLOOD_HEAL) {
                afterTextEffects.push({
                    kind: STAGE_ACTION_TYPES.BANNER,
                    text: e.data && e.data.isDouble ? '❤️‍🔥 热血奋战（翻倍）' : '❤️ 热血奋战',
                    factIndex: index,
                    timing: 'afterText',
                    nonBlocking: true
                });
            }
        } else if (e.factType === FACT_TYPES.QIAN_KUN_DERIVED) {
            const derivedData = e.data || {};
            if (derivedData.healTargetUid && derivedData.heal) {
                afterTextEffects.push({
                    kind: STAGE_ACTION_TYPES.HEAL,
                    actorUid: derivedData.healTargetUid,
                    targetUid: derivedData.healTargetUid,
                    amount: Math.round(derivedData.heal),
                    factIndex: index,
                    timing: 'afterText'
                });
            }
            if (derivedData.atkTargetUid && derivedData.atkGain) {
                afterTextEffects.push({
                    kind: STAGE_ACTION_TYPES.BUFF_EFFECT,
                    effectType: BUFF_EFFECT_TYPES.ATK_BUFF,
                    targetUid: derivedData.atkTargetUid,
                    gain: derivedData.atkGain,
                    factIndex: index,
                    timing: 'afterText'
                });
            }
        } else if (e.factType === FACT_TYPES.FORTIFY_REBOUND) {
            // 严阵以待反伤：飘在攻击者（受伤者）头上；横幅 nonBlocking，不阻塞主流程
            afterTextEffects.push({
                kind: STAGE_ACTION_TYPES.REBOUND,
                actorUid: e.data?.unitUid ?? null,
                targetUid: e.data?.attackerUid ?? null,
                dmg: Math.round(e.data?.reboundDmg ?? 0),
                factIndex: index,
                timing: 'afterText'
            });
            afterTextEffects.push({
                kind: STAGE_ACTION_TYPES.BANNER,
                text: '🛡️ 严阵以待！',
                factIndex: index,
                timing: 'afterText',
                nonBlocking: true
            });
        } else if (e.factType === FACT_TYPES.QIAN_KUN_UPGRADED || e.factType === FACT_TYPES.QIAN_KUN_BASIC) {
            // 2026-09-16 乾坤大挪移：翻译器永远不会被调用（fact 藏在 attack.data.entries 里，不在 log 顶层），
            // 飘字只能在这里扫 entries 产出。自伤与反弹各一条。
            const kd = e.data || {};
            if (kd.zhangUid && kd.selfDmg > 0) {
                afterTextEffects.push({
                    kind: STAGE_ACTION_TYPES.REBOUND,
                    actorUid: kd.zhangUid,
                    targetUid: kd.zhangUid,
                    dmg: Math.round(kd.selfDmg),
                    factIndex: index,
                    timing: 'afterText'
                });
            }
            if (kd.attackerUid && kd.rebound > 0) {
                afterTextEffects.push({
                    kind: STAGE_ACTION_TYPES.REBOUND,
                    actorUid: kd.attackerUid,
                    targetUid: kd.attackerUid,
                    dmg: Math.round(kd.rebound),
                    factIndex: index,
                    timing: 'afterText'
                });
            }
        } else if (e.factType === FACT_TYPES.HORSE_REBOUND) {
            // 拒马反伤：同上，飘在攻击者头上
            afterTextEffects.push({
                kind: STAGE_ACTION_TYPES.REBOUND,
                actorUid: e.data?.unitUid ?? null,
                targetUid: e.data?.attackerUid ?? null,
                dmg: Math.round(e.data?.rebound ?? 0),
                factIndex: index,
                timing: 'afterText'
            });
        } else if (e.factType === FACT_TYPES.BREAK_DEF) {
            // 2026-10-05 破防改攻击前飘（老板拍板正序：🛡-2 先 → 箭矢+💥 → 坚盾🛡+1）：
            //   引擎里破防在伤害计算**之前**（伤害公式用减过的防），飘字跟随引擎序才不怪；
            //   此前挂 afterText = 破防跑到伤害后面，与坚盾挤同拍。fact 无 uid 但作用对象恒为本击目标，
            //   借 target.uid；本击打死目标不飘（别在尸体格子上跳数字，与 RONG_HUI_BONUS 同口径）。
            const bd = e.data || {};
            if (target?.uid && bd.reduce > 0 && !dead) {
                beforeEffects.push({
                    kind: STAGE_ACTION_TYPES.STAT_CHANGE,
                    statKind: 'def',
                    targetUid: target.uid,
                    gain: -Math.round(bd.reduce),
                    factIndex: index,
                    timing: 'beforeText'
                });
            }
        } else if (e.factType === FACT_TYPES.METEOR_SHOWER_MAIN) {
            // 2026-10-02 流星赶月 40% 加深：BONUS_DMG 在主伤害之后由 core/16 裁定器单独实扣（不在主攻击 dmg 里），
            //   此前只有金色战报行、头顶零飘字。目标恒为本击主目标；本击打死目标时裁定器对死目标不扣血（同 RONG_HUI 口径），故 !dead 才飘。
            const mm = e.data || {};
            const mmUid = mm.targetUid ?? target?.uid ?? null;
            if (mmUid && mm.bonusDmg > 0 && !dead) {
                afterTextEffects.push({
                    kind: STAGE_ACTION_TYPES.DAMAGE_FLOAT,
                    targetUid: mmUid,
                    dmg: Math.round(mm.bonusDmg),
                    factIndex: index,
                    timing: 'afterText'
                });
            }
            // 2026-10-02 主目标减防（mainDefReduce，core/04 STAT_CHANGE 已实改）：走 STAT_CHANGE(def) 飘「🛡-N」，
            //   与加深同组 afterText；目标已死则减防无意义不飘。减防飘字在头顶镜像位，与掉血数字不重叠。
            if (mmUid && mm.defReduce > 0 && !dead) {
                afterTextEffects.push({
                    kind: STAGE_ACTION_TYPES.STAT_CHANGE,
                    statKind: 'def',
                    targetUid: mmUid,
                    gain: -Math.round(mm.defReduce),
                    factIndex: index,
                    timing: 'afterText'
                });
            }
        } else if (e.factType === FACT_TYPES.WIND_ASSAULT_SPLASH || e.factType === FACT_TYPES.METEOR_SHOWER_SPLASH) {
            // 2026-10-02 胖远桥·莽撞的溅射分支：他被流星/乘风溅射到时同样 +攻（modules/26 在 SPLASH_DAMAGED 把
            //   加攻量与本人 uid 写进本溅射 fact 的 data），与主路径同口径飘「⚔+N」——加攻对象是胖远桥本人（被溅射者）。
            const sp = e.data || {};
            if (sp.pangAtkUid && sp.pangAtkGain > 0) {
                afterTextEffects.push({
                    kind: STAGE_ACTION_TYPES.STAT_CHANGE,
                    statKind: 'atk',
                    targetUid: sp.pangAtkUid,
                    gain: Math.round(sp.pangAtkGain),
                    factIndex: index,
                    timing: 'afterText'
                });
            }
        } else if (e.factType === FACT_TYPES.RONG_HUI_BONUS) {
            // 2026-09-27 张无忌融会贯通：这笔额外伤害由 BONUS_DMG 声明在主攻击结算之后单独扣血，
            // 不在主攻击的 dmg 里（主弹幕只有主伤害），此前只有一行文字、一点飘字都没有。
            // targetAlive=false（已被主攻击打死，裁定器不会再扣这笔）时不飘，免得在尸体格子上跳数字。
            const rh = e.data || {};
            if (rh.targetUid && rh.extra > 0 && rh.targetAlive !== false) {
                afterTextEffects.push({
                    kind: STAGE_ACTION_TYPES.REBOUND,
                    actorUid: attacker?.uid ?? null,
                    targetUid: rh.targetUid,
                    dmg: Math.round(rh.extra),
                    factIndex: index,
                    timing: 'afterText'
                });
            }
        }
    }

    // 2026-10-02 胖远桥·正义国字脸：嘲讽那一下就永久加防（modules/26 在 AFTER_ATTACK 把加防量写进本击 fact），
    //   此前只有一行日志文字、无飘字。加防对象是胖远桥自己（= 本击攻击者），走 STAT_CHANGE(def) 通道。
    if (data.pangDefGain > 0 && attacker?.uid) {
        afterTextEffects.push({
            kind: STAGE_ACTION_TYPES.STAT_CHANGE,
            statKind: 'def',
            targetUid: attacker.uid,
            gain: Math.round(data.pangDefGain),
            factIndex: index,
            timing: 'afterText'
        });
    }

    // 2026-10-02 胖远桥·莽撞（被动：被攻击后攻击永久+N）：modules/26 在 AFTER_DAMAGE_APPLIED 把加攻量写进本击 fact，
    //   此前只有金色战报行、头顶零飘字。加攻对象是胖远桥自己（= 本击**目标**，他被打了才涨攻），走 STAT_CHANGE(atk) → fx/80 飘「⚔+N」。
    if (data.pangAtkGain > 0 && target?.uid && !dead) {
        afterTextEffects.push({
            kind: STAGE_ACTION_TYPES.STAT_CHANGE,
            statKind: 'atk',
            targetUid: target.uid,
            gain: Math.round(data.pangAtkGain),
            factIndex: index,
            timing: 'afterText'
        });
    }

    // 2026-10-16 唐文亮·七伤拳自损掉血弹幕：自损量由 modules/26 写进本击攻击组 data（同 pangTaunt/pangClumsy
    //   的组标记口径）。自损恒不致死（引擎侧留 1 血），锚在出手者自己头顶飘 💥-N——此前只有战报行
    if (data.qiShangSelfDmg > 0 && attacker?.uid) {
        afterTextEffects.push({
            kind: STAGE_ACTION_TYPES.DAMAGE_FLOAT,
            targetUid: attacker.uid,
            dmg: Math.round(data.qiShangSelfDmg),
            factIndex: index,
            timing: 'afterText'
        });
    }

    // 2026-10-18 灭绝师太三击吸血：回血飘字改走 HEAL 动作（timing:afterText），与其他角色（九阳/热血/韦一笑/
    //   乾坤）完全同一条已验证通道。此前在 render/39 ATTACK.fx 出手帧同步补发 HEAL_FLOAT，紧贴飞撞/闪光
    //   之后，1.2s 的池化小字（z-index 10003）全程被攻击动画与闪光盖住 → 实机看不到 ❤+N。
    if (data.miejueLeech > 0 && attacker?.uid) {
        afterTextEffects.push({
            kind: STAGE_ACTION_TYPES.HEAL,
            targetUid: attacker.uid,
            amount: data.miejueLeech,
            factIndex: index,
            timing: 'afterText'
        });
    }

    // 2026-10-16 唐文亮·七伤齐发（满 7 档）组内横幅：满 7 的横幅文案由 modules/26 写进本击攻击组 data
    //   （qiShangBanner），这里翻成 BANNER 演出、锚本组 factIndex → 与七伤拳那个攻击块同组播放
    if (data.qiShangBanner) {
        afterTextEffects.push({
            kind: STAGE_ACTION_TYPES.BANNER,
            text: data.qiShangBanner,
            factIndex: index,
            timing: 'afterText'
        });
    }

    // 血量线弹幕（文本后）
    const hpPctEffects = [];
    if (data.hpPctBefore !== undefined && data.hpPctAfter !== undefined) {
        if (data.hpPctBefore > 40 && data.hpPctAfter <= 40 && data.hpPctAfter > 20) {
            hpPctEffects.push({
                kind: STAGE_ACTION_TYPES.HP_PCT_DANMAKU,
                targetUid: target?.uid ?? null,
                text: target?.camp === CAMP_TYPES.ALLY ? '不好，必须反击了！' : '小儿安敢伤我！',
                factIndex: index,
                timing: 'afterText'
            });
        } else if (data.hpPctBefore > 20 && data.hpPctAfter <= 20) {
            hpPctEffects.push({
                kind: STAGE_ACTION_TYPES.HP_PCT_DANMAKU,
                targetUid: target?.uid ?? null,
                text: target?.camp === CAMP_TYPES.ALLY ? '撑住！' : '已是强弩之末！',
                factIndex: index,
                timing: 'afterText'
            });
        }
    }

    return [...beforeEffects, baseAction, ...afterTextEffects, ...hpPctEffects];
}
