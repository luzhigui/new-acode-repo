// render/38-actions-translate.js — fact → stageAction 翻译器（翻译域）
// V1.1.9 | ~33500 bytes | 2026-10-07 飞行再生飘字改走 afterText 通道（不再依赖锚文本与正文逐字匹配——该链 10-06 空格案已静默断过一次，今日机器复跑 16/16 信号全发仍不飘，锚点通道结构性扬弃；与生生不息同通道）
// V1.1.8 | ~33100 bytes | 2026-10-02 胖远桥·莽撞补飘字：ATTACK fact 的 pangAtkGain（被攻击加攻）→ STAT_CHANGE(atk) 飘「⚔+N」（此前只有金色战报行）
// V1.1.7 | ~32900 bytes | 2026-10-02 流星赶月减防补飘字：主目标 METEOR_SHOWER_MAIN 增 STAT_CHANGE(def,-mainDefReduce)、溅射 BUFF_EFFECT 带 splashDefReduce（render/39 每个存活溅射目标飘🛡-N）；加深掉血飘字为 V1.1.6
//   承接 V1.1.5：entries 扫描补 BREAK_DEF → STAT_CHANGE(def) 飘「🛡-N」（战士破防此前零飘字）；胖远桥·正义国字脸加防借同一通道飘「🛡+N」
//
// 加新 fact 的舞台动作：在本文件 FACT_TRANSLATORS 加一条（键=factType），
// 并在 infra/58 的 translateFn 登记函数名；漏加会在本文件末尾校验循环里报错。
import { makeFXSnapshot } from '../infra/51-core-utils.js';
import { STAGE_ACTION_TYPES, FACT_TYPES, CAMP_TYPES, BUFF_EFFECT_TYPES, FLY_MODE_TYPES } from '../infra/56-battle-enums.js';
import { FACT_SPECS } from '../infra/58-fact-contract.js';
export const VER = 'render/38-actions-translate.js V1.1.9';

// 把 fact 列表翻译成舞台动作；导演只读 stageActions；timing=beforeText/afterText
export function translateFactsToStageActions(log) {
    const actions = [];
    for (let i = 0; i < log.length; i++) {
        const entry = log[i];
        if (!entry || !entry.factType) continue;
        const made = translateFact(entry, i);
        if (Array.isArray(made)) actions.push(...made.filter(Boolean));
        else if (made) actions.push(made);
    }
    return actions;
}

const FACT_TRANSLATORS = {
    [FACT_TYPES.ROUND_START]: (data, index) => ({ kind: STAGE_ACTION_TYPES.ROUND_START, round: data.round, factIndex: index, timing: 'beforeText' }),
    [FACT_TYPES.ROUND_END]: (data, index) => ({ kind: STAGE_ACTION_TYPES.ROUND_END, round: data.round, factIndex: index, timing: 'afterText' }),
    [FACT_TYPES.PASS]: (data, index) => {
        const actions = [{
            kind: STAGE_ACTION_TYPES.REST,
            actorUid: data.unit?.uid ?? data.unitUid ?? null,
            reason: data.reason,
            factIndex: index,
            timing: 'beforeText'
        }];
        if (data.actualHeal > 0) {
            actions.push({
                kind: STAGE_ACTION_TYPES.HEAL,
                actorUid: data.unit?.uid ?? data.unitUid ?? null,
                targetUid: data.unit?.uid ?? data.unitUid ?? null,
                amount: data.actualHeal,
                factIndex: index,
                // 2026-09-16 必须显式 afterText：HEAL 的 timing 函数只认 afterText，写 beforeText 会被当 anchor 且无 fxAnchors → 静默丢弃
                timing: 'afterText'
            });
        }
        return actions;
    },
    [FACT_TYPES.ATTACK]: (data, index) => makeAttackAction(data, index),
    [FACT_TYPES.MISS]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.MISS,
        actorUid: data.attacker?.uid ?? null,
        targetUid: data.target?.uid ?? null,
        fx: data.fxSnapshot || null,
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.DODGE]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.DODGE,
        actorUid: data.attacker?.uid ?? null,
        targetUid: data.dodger?.uid ?? null,
        reboundDmg: data.reboundDmg,
        dead: data.attackerHpAfter <= 0,
        // 2026-09-24 韦一笑闪避反击吸血带给演出层，用于补吸血飘字（原先只有日志文本）
        weiHeal: data.weiHeal || null,
        fx: data.fxSnapshot || null,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.IMMUNE]: (data, index) => {
        const actions = [{
            kind: STAGE_ACTION_TYPES.IMMUNE,
            actorUid: data.attacker?.uid ?? null,
            targetUid: data.target?.uid ?? null,
            factIndex: index,
            timing: 'beforeText'
        }];
        // 免疫附带 flyData（小昭·妹飞天）时，额外生成 FLY_MODE 特效动作
        if (data.flyData) {
            actions.push({
                kind: STAGE_ACTION_TYPES.FLY_MODE,
                actorUid: data.flyData.spiderUid ?? data.attacker?.uid ?? null,
                originalFactType: FLY_MODE_TYPES.SPIDER_FLY,
                factIndex: index,
                timing: 'beforeText'
            });
        }
        return actions;
    },
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
    [FACT_TYPES.KUAI_LE_HEAL]: (data, index) => makeHealAction(data, index),
    [FACT_TYPES.NINE_YANG_HEAL]: (data, index) => makeHealAction(data, index),
    [FACT_TYPES.WEI_LEECH]: (data, index) => makeHealAction(data, index),
    [FACT_TYPES.PHANTOM_DISGUISE_HEAL]: (data, index) => makeHealAction(data, index),
    [FACT_TYPES.CLAW_HEAL]: (data, index) => makeHealAction(data, index),
    // 2026-09-27 生生不息：一个 fact 可能两口回血（自身 + 溢出接盘者），故单独翻译
    [FACT_TYPES.ENDLESS_BREATH]: (data, index) => translateEndlessBreath(data, index),
    [FACT_TYPES.HOT_BLOOD_HEAL]: (data, index) => makeHealAction(data, index),
    [FACT_TYPES.BLOOD_THIRST_LEECH]: (data, index) => makeHealAction(data, index),
    // 2026-10-07 飞行再生飘字改走 afterText（老板屏幕上仍不飘的终修）：
    // 原走 makeHealAction（不带 timing）→ HEAL 被 timing 函数判为 'anchor' → 飘字靠
    // 「锚文本与正文逐字匹配」触发——这条链已静默断过一次（10-06 空格案），今日机器复跑
    // 全链 16/16 信号全发（代码本体无病），但老板实测仍不飘，剩浏览器模块混搭/APK 旧包
    // 两种环境态。锚点通道的本质缺陷：任何一环文案漂移/缓存旧模块=无声哑火。
    // 改为显式 afterText：飘字跟张三丰生生不息同通道（老板 10-05 亲眼见过能飘），
    // 不再依赖任何文本匹配，本类故障从结构上消灭。
    [FACT_TYPES.FLYER_REGEN]: (data, index) => ({ ...makeHealAction(data, index), timing: 'afterText' }),
    [FACT_TYPES.MIND_CONTROL_BANNER]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.BANNER,
        text: '🌀 惑人心智',
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.MIND_CONTROL_SWAP]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.POS_SWAP,
        actorUid: data.unitA?.uid ?? null,
        targetUid: data.unitB?.uid ?? null,
        oldPosA: data.posA,
        oldPosB: data.posB,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.WIND_ASSAULT_PUSH]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.PUSH,
        actorUid: data.target?.uid ?? null,
        targetUid: data.behindUnit?.uid ?? null,
        oldPos: data.oldPos,
        newPos: data.behindPos,
        behindOldPos: data.behindOldPos ?? null,
        label: data.label ?? null,
        factIndex: index,
        timing: 'beforeText'
    }),
    // 击退退无可退 → 眩晕（乘风突袭 / 胖远桥·年轻气盛共用）
    [FACT_TYPES.PUSH_STUN]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.STUN,
        actorUid: data.target?.uid ?? null,
        label: data.label ?? null,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.KU_LIAN]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.STAT_CHANGE,
        actorUid: data.unitUid ?? data.unit?.uid ?? null,
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.RANGED_GROWTH]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.STAT_CHANGE,
        actorUid: data.unitUid ?? data.unit?.uid ?? null,
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.FORTIFY_SHIELD]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.STAT_CHANGE,
        statKind: 'def',
        targetUid: data.unitUid ?? data.unit?.uid ?? null,
        gain: data.increment ?? 0,
        actorUid: data.unitUid ?? data.unit?.uid ?? null,
        factIndex: index,
        timing: 'afterText'
    }),
    // 2026-10-05 八卦阵飘字（老板拍板「第二拍」）：减攻+加防两条，紧跟其后的 ENDLESS_BREATH（❤+二选一）
    //   也是 afterText 连续落 → 视觉上凑成第二拍（掉血/坚盾是第一拍，靠攻击动画天然隔开）。
    //   此前 modules/26 只手动 push 文本行，fact 无翻译器 → 无飘字。
    [FACT_TYPES.BAGUA_ARRAY]: (data, index) => {
        const acts = [];
        if (data.atkDelta) acts.push({ kind: STAGE_ACTION_TYPES.STAT_CHANGE, statKind: 'atk', targetUid: data.unitUid ?? null, gain: Math.round(data.atkDelta), actorUid: data.unitUid ?? null, factIndex: index, timing: 'afterText' });
        if (data.defDelta) acts.push({ kind: STAGE_ACTION_TYPES.STAT_CHANGE, statKind: 'def', targetUid: data.unitUid ?? null, gain: Math.round(data.defDelta), actorUid: data.unitUid ?? null, factIndex: index, timing: 'afterText' });
        return acts;
    },
    [FACT_TYPES.CARRY_APPLY]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.STAT_CHANGE,
        actorUid: data.unitUid ?? data.unit?.uid ?? null,
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.METEOR_SHOWER_MAIN]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.STAT_CHANGE,
        actorUid: data.unitUid ?? data.unit?.uid ?? null,
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.METEOR_SPLASH_GROWTH]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.STAT_CHANGE,
        actorUid: data.unitUid ?? data.unit?.uid ?? null,
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.QIAN_KUN_UPGRADED]: (data, index) => {
        const actions = [];
        if (data.attackerUid && data.rebound) {
            actions.push({
                kind: STAGE_ACTION_TYPES.REBOUND,
                actorUid: data.attackerUid,
                targetUid: data.attackerUid,
                dmg: Math.round(data.rebound),
                factIndex: index,
                timing: 'afterText'
            });
        }
        if (data.zhangUid && data.selfDmg) {
            actions.push({
                kind: STAGE_ACTION_TYPES.REBOUND,
                actorUid: data.zhangUid,
                targetUid: data.zhangUid,
                dmg: Math.round(data.selfDmg),
                factIndex: index,
                timing: 'afterText'
            });
        }
        return actions;
    },
    [FACT_TYPES.QIAN_KUN_BASIC]: (data, index) => {
        const actions = [];
        if (data.attackerUid && data.rebound) {
            actions.push({
                kind: STAGE_ACTION_TYPES.REBOUND,
                actorUid: data.attackerUid,
                targetUid: data.attackerUid,
                dmg: Math.round(data.rebound),
                factIndex: index,
                timing: 'afterText'
            });
        }
        if (data.zhangUid && data.selfDmg) {
            actions.push({
                kind: STAGE_ACTION_TYPES.REBOUND,
                actorUid: data.zhangUid,
                targetUid: data.zhangUid,
                dmg: Math.round(data.selfDmg),
                factIndex: index,
                timing: 'afterText'
            });
        }
        return actions;
    },
    [FACT_TYPES.QIAN_KUN_DERIVED]: (data, index) => {
        const actions = [];
        // 先回血后加攻：heal 挂锚点0（治疗文本），atk 挂锚点1（攻击文本）
        if (data.healTargetUid && data.heal) {
            actions.push({
                kind: STAGE_ACTION_TYPES.HEAL,
                actorUid: data.healTargetUid,
                targetUid: data.healTargetUid,
                amount: Math.round(data.heal),
                anchorIndex: 0,
                factIndex: index
            });
        }
        if (data.atkTargetUid && data.atkGain) {
            actions.push({
                kind: STAGE_ACTION_TYPES.BUFF_EFFECT,
                effectType: BUFF_EFFECT_TYPES.ATK_BUFF,
                targetUid: data.atkTargetUid,
                gain: data.atkGain,
                anchorIndex: 1,
                factIndex: index
            });
        }
        return actions;
    },
    [FACT_TYPES.HORSE_SUMMON]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.SUMMON,
        actorUid: data.horseUid ?? null,
        pos: data.pos ?? data.horsePos,
        taunt: data.horseTaunt ?? null,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.XIAO_ZHAO_HORSE]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.SUMMON,
        actorUid: data.horseUid ?? null,
        pos: data.pos ?? data.horsePos,
        taunt: data.horseTaunt ?? null,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.HORSE_DESTROY]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.DESTROY,
        actorUid: data.horseUid ?? null,
        success: data.success,
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.ZHANG_SWITCH]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.TRANSFORM,
        actorUid: data.zhang?.uid ?? data.unitUid ?? null,
        danmaku: '不好，要顶上去了！',
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.SPIDER_TRANSFORM]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.TRANSFORM,
        actorUid: data.unitUid ?? data.zhang?.uid ?? null,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.SPIDER_FLY]: (data, index) => ({
        // 飞行类 fact（蛛化/蝶变）均由本表翻译为 FLY_MODE 动作，特效在 DEFS.FLY_MODE.fx 按 originalFactType 处理
        kind: STAGE_ACTION_TYPES.FLY_MODE,
        actorUid: data.spiderUid ?? data.unitUid ?? null,
        originalFactType: FLY_MODE_TYPES.SPIDER_FLY,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.SPIDER_RETURN]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.FLY_MODE,
        actorUid: data.spiderUid ?? data.unitUid ?? null,
        originalFactType: FLY_MODE_TYPES.SPIDER_RETURN,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.BUTTERFLY_ATTACH]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.FLY_MODE,
        actorUid: data.sisterUid ?? null,
        hostUid: data.hostUid ?? null,
        originalFactType: FLY_MODE_TYPES.BUTTERFLY_ATTACH,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.BUTTERFLY_RETURN]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.FLY_MODE,
        actorUid: data.sisterUid ?? null,
        hostUid: data.hostUid ?? null,
        originalFactType: FLY_MODE_TYPES.BUTTERFLY_RETURN,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.BUTTERFLY_HOST_DEAD]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.FLY_MODE,
        actorUid: data.unitUid ?? data.spiderUid ?? data.sisterUid ?? data.unit?.uid ?? null,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.BUTTERFLY_NO_HOST]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.FLY_MODE,
        actorUid: data.unitUid ?? data.spiderUid ?? data.sisterUid ?? data.unit?.uid ?? null,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.FLY_SKIP]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.FLY_MODE,
        actorUid: data.unitUid ?? data.spiderUid ?? data.sisterUid ?? data.unit?.uid ?? null,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.STUN_SKIP]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.STUN,
        actorUid: data.unitUid ?? data.unit?.uid ?? null,
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
    [FACT_TYPES.DOUBLE_STRIKE_SUMMARY]: () => null,
    [FACT_TYPES.XIN_HUN]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.BUFF_EFFECT,
        effectType: BUFF_EFFECT_TYPES.XIN_HUN,
        targetUid: data.zhouUid ?? null,
        dmg: data.hpDeduct ?? 0,
        factIndex: index,
        timing: 'beforeText'
    })
};

// 校验：FACT_SPECS 中声明了 translateFn 的 factType 必须在 FACT_TRANSLATORS 里有对应条目，
// 漏加会立即报错，不会静默丢特效
for (const type of Object.keys(FACT_SPECS)) {
    const spec = FACT_SPECS[type];
    if (spec.translateFn && !FACT_TRANSLATORS[type]) {
        console.error(`[31] 缺翻译器: ${type}（${spec.translateFn}）`);
    }
}

function translateFact(entry, index) {
    const { factType, data } = entry;
    const translator = FACT_TRANSLATORS[factType];
    return translator ? translator(data, index) : null;
}

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
        // 2026-09-24 灭绝师太：出手计数文本（壹/貳/參）与三击吸血量，由 render/39 在她出手演出帧消费
        miejueCountText: data.miejueCountText ?? null,
        miejueLeech: data.miejueLeech ?? 0,
        // 2026-09-26 胖远桥：两技能演出标记（由 modules/26 写进本击 fact），render/39 出手帧据此发信号
        pangTaunt: data.pangTaunt ?? false,
        pangClumsy: data.pangClumsy ?? false
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
        } else if (e.factType && [FACT_TYPES.BLOOD_THIRST_LEECH, FACT_TYPES.HOT_BLOOD_HEAL, FACT_TYPES.NINE_YANG_HEAL, FACT_TYPES.WEI_LEECH, FACT_TYPES.PHANTOM_DISGUISE_HEAL, FACT_TYPES.CLAW_HEAL].includes(e.factType)) {
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

function makeHealAction(data, index) {
    return {
        kind: STAGE_ACTION_TYPES.HEAL,
        actorUid: data.healUnitUid ?? data.unitUid ?? data.sourceUid ?? null,
        targetUid: data.healUnitUid ?? data.unitUid ?? data.sourceUid ?? null,
        amount: Math.round(data.heal ?? data.leechVal ?? data.leech ?? data.totalHeal ?? 0),
        anchorIndex: 0,
        factIndex: index
    };
}

// 张三丰·生生不息：自身与溢出接盘者各一条回血动作，timing 显式 afterText —— 弹幕跟在日志文字之后，
// 与 PASS 休息回血同款（不写 afterText 会被 HEAL 的 timing 函数当 anchor 处理）。
function translateEndlessBreath(data, index) {
    const actions = [];
    const selfHeal = Math.round(data.heal || 0);
    if (selfHeal > 0 && data.unitUid) {
        actions.push({
            kind: STAGE_ACTION_TYPES.HEAL,
            actorUid: data.unitUid, targetUid: data.unitUid, amount: selfHeal,
            anchorIndex: 0, factIndex: index, timing: 'afterText'
        });
    }
    const overflowHeal = Math.round(data.overflowHealed || 0);
    if (overflowHeal > 0 && data.overflowToUid) {
        actions.push({
            kind: STAGE_ACTION_TYPES.HEAL,
            actorUid: data.overflowToUid, targetUid: data.overflowToUid, amount: overflowHeal,
            anchorIndex: 0, factIndex: index, timing: 'afterText'
        });
    }
    // 2026-10-01 攻防二选一的加成飘字（用户定调：该加攻加攻、该加防加防，随回血同时升）：
    //   atkGain→ATK_BUFF_FLOAT（橙⚔ 左上，原通道）、defGain→DEF_BUFF_FLOAT（钢蓝🛡 右上，新通道）。
    //   翻译器只派动作，emit 由 39 的 STAT_CHANGE 演出帧发——与回血弹幕同帧，不抢日志文字。
    const selfAtk = Math.round(data.atkGain || 0), selfDef = Math.round(data.defGain || 0);
    if (selfAtk > 0 && data.unitUid) {
        actions.push({ kind: STAGE_ACTION_TYPES.STAT_CHANGE, statKind: 'atk', targetUid: data.unitUid, gain: selfAtk, factIndex: index, timing: 'afterText' });
    }
    if (selfDef > 0 && data.unitUid) {
        actions.push({ kind: STAGE_ACTION_TYPES.STAT_CHANGE, statKind: 'def', targetUid: data.unitUid, gain: selfDef, factIndex: index, timing: 'afterText' });
    }
    const recvAtk = Math.round(data.overflowAtkGain || 0), recvDef = Math.round(data.overflowDefGain || 0);
    if (recvAtk > 0 && data.overflowToUid) {
        actions.push({ kind: STAGE_ACTION_TYPES.STAT_CHANGE, statKind: 'atk', targetUid: data.overflowToUid, gain: recvAtk, factIndex: index, timing: 'afterText' });
    }
    if (recvDef > 0 && data.overflowToUid) {
        actions.push({ kind: STAGE_ACTION_TYPES.STAT_CHANGE, statKind: 'def', targetUid: data.overflowToUid, gain: recvDef, factIndex: index, timing: 'afterText' });
    }
    return actions.length > 0 ? actions : null;
}
