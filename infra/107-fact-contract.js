// V1.5.23 | 2026-11-09 新增 SUMMON_DEAD 契约（召唤物阵亡隐藏只供体检归账）；SUMMON_UNIT 审计字段补 camp
export const VER = 'infra/107-fact-contract.js V1.5.23';

import { FACT_TYPES } from './106-battle-enums.js';

/**
 * FACT_SPECS —— fact 唯一事实源。
 * 每条包含：
 *   - requiredFields: 渲染/特效必须读到的字段（漏了会静默吞或 TypeError）
 *   - renderFn: 401-fact-renderer.js 中的渲染函数名（null 表示无渲染，renderLog 返回 null）
 *   - translateFn: 402-stage-actions.js 中的翻译函数名（null 表示不产生 stageAction）
 *
 * 新增 factType 只需在此登记一条（本表供契约校验 / 体检对账用）。
 * 实际映射：render/30 走副作用 import + registerFactRenderer 自注册；render/38 手工合成 FACT_TRANSLATORS。
 * buildRendererMap 仅供 tests/smoke-headless.mjs 对账；buildTranslatorMap 已删（零调用）。
 */
export const FACT_SPECS = Object.freeze({
    // 攻击/闪避核心
    [FACT_TYPES.ATTACK]: { requiredFields: ['attacker', 'target', 'dmgResult'], renderFn: 'renderAttackFact', translateFn: 'makeAttackAction' },
    [FACT_TYPES.DODGE]: { requiredFields: ['attacker', 'dodger', 'reboundDmg'], renderFn: 'renderDodgeFact', translateFn: 'translateDodge' },
    [FACT_TYPES.MISS]: { requiredFields: ['attacker', 'target'], renderFn: 'renderMissFact', translateFn: 'translateMiss' },
    [FACT_TYPES.IMMUNE]: { requiredFields: ['attacker', 'target'], renderFn: 'renderImmuneFact', translateFn: 'translateImmune' },
    [FACT_TYPES.EMPTY_TARGET]: { requiredFields: ['attacker'], renderFn: 'renderEmptyTargetFact', translateFn: 'translateEmptyTarget' },

    // 掉落 / 破防
    [FACT_TYPES.DROP]: { requiredFields: ['kind'], renderFn: 'renderDropFact', translateFn: null },
    [FACT_TYPES.BREAK_DEF]: { requiredFields: ['attackerName'], renderFn: 'renderBreakDefFact', translateFn: null },

    // 何太冲三技能报幕/飘字（显性化）：note 为战报文本（line:false 时不落行，只走 floatText/floatUid 飘字）
    [FACT_TYPES.SKILL_ANNOUNCE]: { requiredFields: ['unitName', 'unitUid', 'camp', 'skillName', 'note'], renderFn: 'renderSkillAnnounceFact', translateFn: 'translateSkillAnnounce' },

    // 拒马 / 张无忌
    [FACT_TYPES.HORSE_DESTROY]: { requiredFields: ['success'], renderFn: 'renderHorseDestroyFact', translateFn: 'translateHorseDestroy' },
    [FACT_TYPES.ZHANG_SWITCH]: { requiredFields: ['zhang'], renderFn: 'renderZhangSwitchFact', translateFn: 'translateZhangSwitch' },

    // Buff 摘要 / carry
    [FACT_TYPES.BUFF_SUMMARY]: { requiredFields: ['buff'], renderFn: 'renderBuffSummaryFact', translateFn: null },
    [FACT_TYPES.CARRY_APPLY]: { requiredFields: ['unitName'], renderFn: 'renderCarryApplyFact', translateFn: 'translateStatChange' },

    // 召唤
    [FACT_TYPES.HORSE_SUMMON]: { requiredFields: ['horseUid', 'pos'], renderFn: 'renderHorseSummonFact', translateFn: 'translateHorseSummon' },
    [FACT_TYPES.XIAO_ZHAO_HORSE]: { requiredFields: ['horseUid', 'pos'], renderFn: 'renderXiaoZhaoHorseFact', translateFn: 'translateHorseSummon' },

    // 行动跳过 / 苦练 / 连击 / 成长
    [FACT_TYPES.PASS]: { requiredFields: ['unit'], renderFn: 'renderPassFact', translateFn: 'translatePass' },
    [FACT_TYPES.KU_LIAN_PRIORITY]: { requiredFields: ['unitName'], renderFn: 'renderKuLianPriorityFact', translateFn: null },
    [FACT_TYPES.KU_LIAN]: { requiredFields: ['unitName'], renderFn: 'renderKuLianFact', translateFn: 'translateStatChange' },
    [FACT_TYPES.DOUBLE_STRIKE]: { requiredFields: ['success', 'unitName'], renderFn: 'renderDoubleStrikeFact', translateFn: 'translateDoubleStrike' },
    [FACT_TYPES.RANGED_GROWTH]: { requiredFields: ['unitName'], renderFn: 'renderRangedGrowthFact', translateFn: 'translateStatChange' },
    [FACT_TYPES.FORTIFY_SHIELD]: { requiredFields: ['unitName'], renderFn: 'renderFortifyShieldFact', translateFn: 'translateStatChange' },

    // 惑心
    [FACT_TYPES.MIND_CONTROL_SWAP]: { requiredFields: ['swaps'], renderFn: 'renderMindControlSwapFact', translateFn: 'translateMindControlSwap' },
    [FACT_TYPES.MIND_CONTROL_FAIL]: { requiredFields: ['side'], renderFn: 'renderMindControlFailFact', translateFn: null },
    [FACT_TYPES.MIND_CONTROL_BANNER]: { requiredFields: ['side'], renderFn: 'renderMindControlBannerFact', translateFn: 'translateMindControlBanner' },

    // 乾坤大挪移（modules/302 恒发 reducePct=转移比例、absorbed=盾吸收量，dmg=减伤前原始伤害，体检按这三项复算净伤）
    [FACT_TYPES.QIAN_KUN_UPGRADED]: { requiredFields: ['rebound', 'zhangUid', 'reducePct', 'absorbed', 'dmg'], renderFn: 'renderQianKunUpgradedFact', translateFn: 'translateQianKunUpgraded' },
    [FACT_TYPES.QIAN_KUN_BASIC]: { requiredFields: ['rebound', 'zhangUid', 'reducePct', 'absorbed', 'dmg'], renderFn: 'renderQianKunBasicFact', translateFn: 'translateQianKunBasic' },

    // 通用回血：字段固定 {unitUid, heal, hpBefore, hpAfter, label, icon}，
    // 引擎侧统一走 emitHeal() 发射；新增回血机制只需登记这一条 + 调一行 emitHeal，无需各自建 fact 类型
    [FACT_TYPES.HEAL]: { requiredFields: ['unitUid', 'heal'], renderFn: 'renderHealFact', translateFn: 'makeHealAction' },

    // 快乐回血
    [FACT_TYPES.KUAI_LE_HEAL]: { requiredFields: ['unitUid', 'heal'], renderFn: 'renderKuaiLeHealFact', translateFn: 'makeHealAction' },

    // 小昭蛛变
    [FACT_TYPES.SPIDER_TRANSFORM]: { requiredFields: ['unitName'], renderFn: 'renderSpiderTransformFact', translateFn: 'translateSpiderTransform' },
    [FACT_TYPES.SPIDER_RETURN]: { requiredFields: ['spiderUid', 'pos'], renderFn: 'renderSpiderReturnFact', translateFn: 'translateFlyMode' },
    [FACT_TYPES.SPIDER_STRIKE]: { requiredFields: ['unitName', 'targetName', 'totalDmg'], renderFn: 'renderSpiderStrikeFact', translateFn: 'translateSpiderStrike' },
    [FACT_TYPES.SPIDER_FLY]: { requiredFields: ['spiderUid'], renderFn: 'renderSpiderFlyFact', translateFn: 'translateFlyMode' },
    [FACT_TYPES.SPIDER_DOUBLE_STRIKE]: { requiredFields: [], renderFn: 'renderSpiderDoubleStrikeFact', translateFn: 'translateDoubleStrike' },
    [FACT_TYPES.SPIDER_DEAD_TARGET]: { requiredFields: [], renderFn: 'renderSpiderDeadTargetFact', translateFn: null },

    // 玄冥神掌
    [FACT_TYPES.XUAN_MING_DOT]: { requiredFields: ['uidD', 'dot'], renderFn: 'renderXuanmingDotFact', translateFn: 'translateXuanmingDot' },
    [FACT_TYPES.XUAN_MING_POISONED]: { requiredFields: ['dotPercents'], renderFn: 'renderXuanmingPoisonedFact', translateFn: null },
    [FACT_TYPES.XUAN_MING_LINK_ATTACK]: { requiredFields: ['partnerName', 'unitName'], renderFn: 'renderXuanmingLinkAttackFact', translateFn: null },

    // 幻影伪装
    [FACT_TYPES.PHANTOM_DISGUISE_HEAL]: { requiredFields: ['unitName', 'unitUid', 'heal'], renderFn: 'renderPhantomDisguiseHealFact', translateFn: 'makeHealAction' },
    [FACT_TYPES.PHANTOM_REVEAL]: { requiredFields: ['unitName', 'deceiver', 'deceiverUid'], renderFn: 'renderPhantomRevealFact', translateFn: null },
    // sourceSkill：被惑心者正在读条的技能名；targetName：被迷惑目标的展示名（体检按这两键核对惑心归属）
    [FACT_TYPES.PHANTOM_CONFUSE]: { requiredFields: ['unitName', 'deceiver', 'sourceSkill', 'targetName'], renderFn: 'renderPhantomConfuseFact', translateFn: null },

    // 宋青书新婚 / 性奋
    [FACT_TYPES.XING_FEN_RETRY]: { requiredFields: ['unitName'], renderFn: 'renderXingFenRetryFact', translateFn: null },
    [FACT_TYPES.XIN_HUN]: { requiredFields: ['stackCount', 'zhouUid'], renderFn: 'renderXinHunFact', translateFn: 'translateXinHun' },
    [FACT_TYPES.XING_FEN_COST]: { requiredFields: ['unitName'], renderFn: 'renderXingFenCostFact', translateFn: null },
    [FACT_TYPES.XING_FEN_EXTRA_ATTACK]: { requiredFields: ['unitName'], renderFn: 'renderXingFenExtraAttackFact', translateFn: null },
    [FACT_TYPES.XING_FEN_GRANT]: { requiredFields: ['songName', 'zhouName'], renderFn: 'renderXingFenGrantFact', translateFn: null },
    [FACT_TYPES.XIN_HUN_DEATH]: { requiredFields: ['uidD'], renderFn: 'renderXinHunDeathFact', translateFn: 'translateXinHunDeath' },

    // targetDef：真伤公式 floor(|目标攻-目标防|×比例) 的入参之一，体检按攻/防两项复算（modules/320 恒发）
    [FACT_TYPES.RONG_HUI_BONUS]: { requiredFields: ['extra', 'targetAtk', 'targetDef', 'targetUid'], renderFn: 'renderRongHuiBonusFact', translateFn: null },

    // 韦一笑吸血
    [FACT_TYPES.WEI_LEECH]: { requiredFields: ['unitUid', 'heal'], renderFn: 'renderWeiLeechFact', translateFn: 'makeHealAction' },

    // 飞行再生（角色阵亡→全场存活飞行回 baseRegen）
    [FACT_TYPES.FLYER_REGEN]: { requiredFields: ['unitUid', 'heal'], renderFn: 'renderFlyerRegenFact', translateFn: 'makeHealAction' },

    // 小昭·姊 乾坤衍生 / 蝶变
    [FACT_TYPES.QIAN_KUN_DERIVED]: { requiredFields: ['healTargetUid', 'atkTargetUid'], renderFn: 'renderQianKunDerivedFact', translateFn: 'translateAtkBuff' },
    [FACT_TYPES.BUTTERFLY_ATTACH]: { requiredFields: ['sisterUid', 'hostUid'], renderFn: 'renderButterflyAttachFact', translateFn: 'translateFlyMode' },
    [FACT_TYPES.BUTTERFLY_NO_HOST]: { requiredFields: ['sisterUid'], renderFn: 'renderButterflyNoHostFact', translateFn: 'translateFlyMode' },
    [FACT_TYPES.BUTTERFLY_RETURN]: { requiredFields: ['sisterUid', 'hostUid'], renderFn: 'renderButterflyReturnFact', translateFn: 'translateFlyMode' },
    [FACT_TYPES.BUTTERFLY_HOST_DEAD]: { requiredFields: ['sisterUid', 'hostUid'], renderFn: 'renderButterflyHostDeadFact', translateFn: 'translateFlyMode' },

    // 巨马反伤 / 严阵以待反弹
    [FACT_TYPES.HORSE_REBOUND]: { requiredFields: ['unitName', 'rebound'], renderFn: 'renderHorseReboundFact', translateFn: 'translateRebound' },
    [FACT_TYPES.FORTIFY_REBOUND]: { requiredFields: ['unitName', 'reboundDmg'], renderFn: 'renderFortifyReboundFact', translateFn: 'translateFortifyRebound' },
    // 反伤弟子·反伤护盾（飘字落点=攻击者本人，与巨马同款 REBOUND 舞台）
    [FACT_TYPES.DISCIPLE_REBOUND]: { requiredFields: ['unitName', 'sourceName', 'rebound'], renderFn: 'renderDiscipleReboundFact', translateFn: 'translateDiscipleRebound' },

    // 乘风 / 流星溅射
    [FACT_TYPES.WIND_ASSAULT_SPLASH]: { requiredFields: ['targets', 'splashDmg'], renderFn: 'renderWindAssaultSplashFact', translateFn: 'translateSplash' },
    [FACT_TYPES.WIND_ASSAULT_PUSH]: { requiredFields: ['target'], renderFn: 'renderWindAssaultPushFact', translateFn: 'translateWindAssaultPush' },
    [FACT_TYPES.WIND_ASSAULT_FAIL]: { requiredFields: ['reason'], renderFn: 'renderWindAssaultFailFact', translateFn: null },
    [FACT_TYPES.PUSH_STUN]: { requiredFields: ['target'], renderFn: 'renderPushStunFact', translateFn: 'translatePushStun' },
    [FACT_TYPES.METEOR_SHOWER_MAIN]: { requiredFields: ['targetName', 'defReduce'], renderFn: 'renderMeteorShowerMainFact', translateFn: 'translateStatChange' },
    [FACT_TYPES.METEOR_SHOWER_SPLASH]: { requiredFields: ['targets'], renderFn: 'renderMeteorShowerSplashFact', translateFn: 'translateSplash' },
    [FACT_TYPES.METEOR_SPLASH_GROWTH]: { requiredFields: ['unitName', 'growth'], renderFn: 'renderMeteorSplashGrowthFact', translateFn: 'translateStatChange' },

    // 战士斩杀
    [FACT_TYPES.WARRIOR_EXECUTE]: { requiredFields: ['unitName', 'targetName'], renderFn: 'renderWarriorExecuteFact', translateFn: 'translateExecute' },

    // 嗜血 / 热血
    [FACT_TYPES.BLOOD_THIRST_LEECH]: { requiredFields: ['unitUid', 'leechVal'], renderFn: 'renderBloodthirstLeechFact', translateFn: 'makeHealAction' },
    [FACT_TYPES.HOT_BLOOD_HEAL]: { requiredFields: ['unitUid', 'leech'], renderFn: 'renderHotBloodHealFact', translateFn: 'makeHealAction' },

    // 回合分隔线 / 台词
    [FACT_TYPES.ROUND_START]: { requiredFields: ['round'], renderFn: 'renderRoundStartFact', translateFn: 'translateRoundStart' },
    [FACT_TYPES.ROUND_END]: { requiredFields: ['round'], renderFn: 'renderRoundEndFact', translateFn: 'translateRoundEnd' },

    // 死亡登记（core/213 resolveDeaths 唯一真实死亡出口；隐藏只供体检按 uid 归账，render/411 注册了 () => null 的显式空渲染）
    [FACT_TYPES.UNIT_DEATH]: { requiredFields: ['uid', 'name', 'camp', 'reason', 'hpBefore', 'hpAfter'], renderFn: 'renderUnitDeathHidden', translateFn: null },
    // 召唤物阵亡（resolveDeaths 与 UNIT_DEATH 同出口）：只给体检归账，render/411 注册显式隐藏渲染
    [FACT_TYPES.SUMMON_DEAD]: { requiredFields: ['summonUid', 'summonName', 'camp', 'cause'], renderFn: 'renderSummonDeadHidden', translateFn: null },
    [FACT_TYPES.ZHANG_TAUNT]: { requiredFields: ['taunt'], renderFn: 'renderZhangTauntFact', translateFn: null },

    // 白骨爪
    [FACT_TYPES.CLAW_NO_HEAL]: { requiredFields: [], renderFn: 'renderClawNoHealFact', translateFn: null },
    [FACT_TYPES.CLAW_HIT]: { requiredFields: ['dmg', 'targetName'], renderFn: 'renderClawHitFact', translateFn: null },
    [FACT_TYPES.CLAW_EXECUTE]: { requiredFields: ['unitName', 'targetName'], renderFn: 'renderClawExecuteFact', translateFn: 'translateExecute' },
    [FACT_TYPES.CLAW_HEAL]: { requiredFields: ['unitUid', 'totalHeal'], renderFn: 'renderClawHealFact', translateFn: 'makeHealAction' },

    // 行动跳过
    [FACT_TYPES.STUN_SKIP]: { requiredFields: ['unitName'], renderFn: 'renderStunSkipFact', translateFn: 'translateStunSkip' },
    [FACT_TYPES.FLY_SKIP]: { requiredFields: ['unitName'], renderFn: 'renderFlySkipFact', translateFn: 'translateFlyMode' },

    // 张三丰：生生不息（日志渲染 + 回血弹幕随文本行播出，2026-09-27 起不再由组件层直发）
    [FACT_TYPES.ENDLESS_BREATH]: { requiredFields: ['unitName', 'heal'], renderFn: 'renderEndlessBreathFact', translateFn: 'translateEndlessBreath' },
    // 张三丰：不争
    [FACT_TYPES.NO_CONTEND]: { requiredFields: ['unitName'], renderFn: 'renderNoContendFact', translateFn: null },

    // 召唤 / 幼狮成长（谢逊狮子、灭绝召唤周芷若）
    // 召唤物必须带 uid（体检侧按 uid 认个体，同场两只同名幼狮/雄鹰靠名字分不开）
    // byUid：具名召唤者的 uid（modules/313 灭绝师太、318 殷天正、326 谢逊、339 张中已带；core/204 的
    //   副将雄鹰与众志补员没有单一召唤者，只有 byName）——可选字段，登记在 FACT_AUDIT_FIELDS
    // 演出：render/415 对带 cue 的召唤出 SKILL_CUE（张中·蹦蹦），cue 缺省则不出动作——登记非 null，避免契约谎称「不产动作」
    [FACT_TYPES.SUMMON_UNIT]: { requiredFields: ['summonName', 'summonUid', 'pos'], renderFn: 'renderSummonUnitFact', translateFn: 'translateSummonUnitCue' },
    [FACT_TYPES.LION_GROW]: { requiredFields: ['name', 'unitUid', 'pos'], renderFn: 'renderLionGrowFact', translateFn: null },

    // 数值声明 fact（体检对照器专用；renderFn:null = 无渲染，不进画面）
    [FACT_TYPES.BAGUA_ARRAY]:  { requiredFields: ['unitName', 'atkDelta', 'defDelta'], renderFn: null, translateFn: 'translateBaguaArray' },
    [FACT_TYPES.RAGE_ON_HIT]:  { requiredFields: ['unitName', 'atkDelta'], renderFn: null, translateFn: null },
    [FACT_TYPES.LION_INSPIRE]: { requiredFields: ['unitName', 'targets'], renderFn: null, translateFn: null },
    // STAT_CHANGE 通用裁定落地（流星赶月/流星溅射降防）：delta 与 addMod 入参同值，field 为 atk/def
    [FACT_TYPES.STAT_CHANGE_APPLY]: { requiredFields: ['unitName', 'unitUid', 'field', 'delta'], renderFn: null, translateFn: null },
    // 光环（ttl:round 加法词条）：emptyCol/bloodAura 与 addMod 入参同值，为 0 也发（零值词条也要有账）
    [FACT_TYPES.AURA_APPLY]: { requiredFields: ['unitName', 'unitUid', 'emptyCol', 'bloodAura'], renderFn: null, translateFn: null },
    // 圣火令（乘法共享乘区，无独立增量）：ratio 与 addMod value 同值（0.3=+30%），field 为 atk/def；camp/op 供体检按阵营+乘率口径核对
    [FACT_TYPES.HOLY_FLAME_APPLY]: { requiredFields: ['unitName', 'unitUid', 'camp', 'op', 'field', 'ratio'], renderFn: null, translateFn: null },
    // 摄魂（core/04 applySoulDrain，op:mul 削弱型）：ratio 与 addMod value 同值——atk 为 atkBonus(-0.30) 随人数差更深（每多 1 人 -0.05），def 为乘法累积 (1+defBonus)×(1+perRoundBonus)^(N-1)-1（×0.9 起步、每回合再 ×0.95）；field 为 atk/def，体检按乘率（mulSum）口径核对
    [FACT_TYPES.SOUL_DRAIN_APPLY]: { requiredFields: ['unitName', 'unitUid', 'camp', 'op', 'field', 'ratio'], renderFn: null, translateFn: null },
    // 背水一战（core/04 applyLastStandBonus，op:mul 残血增伤）：ratio 与 addMod value 同值（atkBonus），field='atk'，体检按乘率（mulSum）口径核对
    [FACT_TYPES.LAST_STAND_APPLY]: { requiredFields: ['unitName', 'unitUid', 'camp', 'op', 'field', 'ratio'], renderFn: null, translateFn: null },
    // 众志成城（core/04 applyUnityBonus，op:mul 人数阶梯攻防同乘）：ratio 与 addMod value 同值（tier.atkBonus/defBonus），field='atk'|'def'，体检按乘率（mulSum）口径核对
    [FACT_TYPES.UNITY_APPLY]: { requiredFields: ['unitName', 'unitUid', 'camp', 'op', 'field', 'ratio'], renderFn: null, translateFn: null },
    // 唐文亮冲刺·转战士（modules/26 addRoleBonus，op:add 永久职业加成）：atk/def/maxHp 与 addMod value 同值（getRoleBonus(WARRIOR)），体检按加法增量口径核对
    [FACT_TYPES.TW_DASH_APPLY]: { requiredFields: ['unitName', 'unitUid', 'atk', 'def', 'maxHp'], renderFn: null, translateFn: null },
    [FACT_TYPES.XIAO_ZHAO_CARRY_APPLY]: { requiredFields: ['unitName', 'unitUid', 'atk', 'def', 'maxHp'], renderFn: null, translateFn: null },
    // 韦一笑闪避反击吸血：heal 回血量、newMaxHp 新上限绝对值、maxHpDelta 上限增量；演出走 dodgeFact.weiHeal，此 fact 纯账本
    [FACT_TYPES.WEI_DODGE_LEECH]: { requiredFields: ['unitUid', 'heal', 'maxHpDelta'], renderFn: null, translateFn: null },

    // 吸星结算汇总（modules/334 一次结算一条）：beneficiaries 里同时含被吸方（负增量，group 'absorbed'）
    //   与施术者（正增量，group 'absorbGain'），每条 {uid, name, stat, before, after}；
    //   render/411 显式注册了 () => null 的隐藏渲染（只供体检归账），故 renderFn 非 null
    [FACT_TYPES.ABSORB_SUMMARY]: {
        requiredFields: ['casterUid', 'skillName', 'source', 'absorbedTotal', 'beneficiaries'],
        renderFn: 'renderAbsorbSummaryHidden', translateFn: null
    },
});

/**
 * FACT_AUDIT_FIELDS —— 体检对账用的嵌套字段清单（点路径）。
 * 只做「登记」，不参与 validateFactContract（那边只管平铺顶层键），缺字段不阻断引擎、不拉红。
 * 体检规则按这里列的路径读 fact.data；字段新增/改名必须两边同步。
 *
 * 攻击 fact（core/212 buildAttackGroup）的血量快照是两套口径：
 *   attacker.hp / attacker.maxHp / snap.attackerHp / snap.targetHpAfter —— 显示口径（≥10 取整）
 *   snap.attackerHpReal / snap.targetHpAfterReal —— 实数口径（未取整，供体检核 0.x 级扣血）
 */
export const FACT_AUDIT_FIELDS = Object.freeze({
    [FACT_TYPES.ATTACK]: Object.freeze([
        'attacker.uid', 'attacker.name', 'attacker.hp', 'attacker.maxHp',
        'snap.attackerHp', 'snap.targetHpAfter', 'snap.targetAlive',
        'snap.attackerHpReal', 'snap.targetHpAfterReal',
        'dmgCalc.hpBonus', 'dmgCalc.thunderBonus',
        'dmgCalc.dmgMultiplierEntries', 'dmgCalc.bonusDmgEntries',
        'dmgResult.hpBefore', 'dmgResult.dead', 'dmgResult._shield', 'dmgResult._permShield',
        // 死亡登记（体检 184）：本帧结算前是否已归零/待死；deaths = 本帧结算的死亡 uid 清单（毒/反伤/自伤/斩杀统一认领）
        'dmgResult.attackerDead', 'snap.attackerDeadAtSettle', 'snap.targetDeadAtSettle', 'deaths'
    ]),
    [FACT_TYPES.BUFF_SUMMARY]: Object.freeze([
        'buff.key', 'buff.target', 'buff.remaining',
        // 圣火不熄复活账（core/204 随摘要下发）：revives 全量记录；平铺字段 = 最近一次复活
        'revives', 'reviveUid', 'reviveHeal', 'reviveRaw', 'reviveMaxHp',
        'reviveTier', 'reviveRatio', 'reviveSlot'
    ]),
    // 圣火不熄复活公告（core/204 reviveHolyFireUnit）：血量/回复量为引擎实数，档位便于体检反推 70% / 40%
    // 飞行·猎杀（modules/302 registerFlyerKillGrowth）：atkBefore/atkAfter 为 getStat 实数，
    //   missChance 为成长后累计百分点、missDelta 本条增量、neverMiss 为免疫分支（此时 missDelta=0），
    //   deadUid/deadName 指被击杀者——体检按 group 'flyerKill' 的加法增量口径核对。
    [FACT_TYPES.SKILL_ANNOUNCE]: Object.freeze([
        'unitUid', 'skillName', 'healUnitUid', 'healAmount', 'hpBefore', 'hpAfter',
        'reviveTier', 'reviveRatio', 'reviveSlot', 'reviveMaxHp', 'reviveRaw',
        'atkBefore', 'atkAfter', 'missChance', 'missDelta', 'neverMiss', 'deadUid', 'deadName'
    ]),
    // 免疫 fact（core/209 免疫分支）：attackerHp / targetHp 已是引擎实数（显示层自行取整）
    [FACT_TYPES.IMMUNE]: Object.freeze([
        'attacker.uid', 'target.uid', 'attackerHp', 'targetHp', 'dmgCalc.hpBefore', 'dmgCalc.dmg'
    ]),
    // 死亡登记（core/213 resolveDeaths）：hpBefore/hpAfter 为引擎实数；复活前补账也复用本类型
    [FACT_TYPES.UNIT_DEATH]: Object.freeze([
        'uid', 'name', 'camp', 'reason', 'hpBefore', 'hpAfter'
    ]),
    // 吸星汇总（modules/334）：absorbedTotal 为本次吸到总量（按属性分项），beneficiaries 为逐单位逐属性 before/after
    [FACT_TYPES.ABSORB_SUMMARY]: Object.freeze([
        'casterUid', 'casterName', 'skillName', 'source',
        'absorbedTotal.atk', 'absorbedTotal.def', 'absorbedTotal.maxHp', 'beneficiaries'
    ]),
    // 召唤者归属（体检 259 观察位）：byUid = 具名召唤者 uid（313/318/326/339）；core/204 两处无单一召唤者只有 byName
    [FACT_TYPES.SUMMON_UNIT]: Object.freeze(['byUid', 'byName', 'camp']),
    // 召唤物阵亡（体检 260 归账）：summonUid 与 SUMMON_UNIT.summonUid 对齐；cause 为死亡来源文本
    [FACT_TYPES.SUMMON_DEAD]: Object.freeze(['summonUid', 'summonName', 'camp', 'pos', 'cause', 'hpBefore', 'hpAfter'])
});

/**
 * 攻击组内回血名单（2026-10-15 从 render/38-actions-translate-attack 的硬编码数组搬来契约层）。
 * 出现在攻击组 entries 里的回血 fact —— 需在伤害飘字旁「同拍」弹血字（timing: afterText）。
 * 此前这份名单硬编码在渲染层，新增回血常忘记加 → 攻击组内回血只有日志行、没有飘字（静默漏掉）。
 * 现在唯一真源在这里：新回血若要落在攻击组内，只在本数组加一行；渲染层查表，不再硬编码。
 */
export const ATTACK_GROUP_HEAL_FACTS = Object.freeze([
    FACT_TYPES.BLOOD_THIRST_LEECH,
    FACT_TYPES.HOT_BLOOD_HEAL,
    FACT_TYPES.WEI_LEECH,
    FACT_TYPES.PHANTOM_DISGUISE_HEAL,
    FACT_TYPES.CLAW_HEAL,
    // 通用回血：由 emitHeal() 在攻击链内发射时走同一路径
    FACT_TYPES.HEAL
]);

/**
 * 校验 fact 是否满足字段契约。缺字段 → console.error 红字，不阻断流程。
 */
export function validateFactContract(type, data) {
    const spec = FACT_SPECS[type];
    if (!spec || !spec.requiredFields || spec.requiredFields.length === 0) return;
    for (const key of spec.requiredFields) {
        if (data[key] === undefined || data[key] === null) {
            console.error(`[fact契约] ${type} 缺字段: ${key}`, data);
        }
    }
}

/**
 * 从 FACT_SPECS 生成渲染映射表。
 * 生产渲染走 render/30 的副作用 import + registerFactRenderer 自注册；
 * 本函数现仅被 tests/smoke-headless.mjs 用于「FACT_SPECS → 渲染器映射完整性」对账。
 * @param {Object<string, Function>} rendererFns - 渲染函数集合（key 为函数名，value 为函数）
 * @returns {Object<string, Function>} factType → 渲染函数
 */
export function buildRendererMap(rendererFns) {
    const map = {};
    for (const [type, spec] of Object.entries(FACT_SPECS)) {
        if (!spec.renderFn) { map[type] = () => null; continue; }
        const fn = rendererFns[spec.renderFn];
        if (typeof fn !== 'function') {
            console.error(`[58] 渲染函数未注册: ${spec.renderFn}（factType ${type}）`);
            map[type] = () => null;
            continue;
        }
        map[type] = fn;
    }
    return map;
}