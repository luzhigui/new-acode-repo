// fx/89fx-subscriber.js - 光明顶5v5 特效订阅器（player→fx 依赖反转）
// V5.5.0 | ~6200 bytes| 2026-08-23 player 只 emit 信号，本文件统一订阅转调 87/86/88，斩断 player→fx
export const VER = 'fx/89fx-subscriber.js V5.5.0';

import { eventBus } from '../infra/50-event-bus.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { FX_SIGNALS } from '../infra/55-fx-signals.js';
import { _triggerFX } from './88fx-trigger.js';
import {
    showDanmaku, showDamageFloat, showDodgeBubble, showHealFloat, showAtkBuffFloat,
    applyBrushEffect, showBuffBanner, showCriticalBanner, showHeartEffect, showPinkFlash,
    showKuLianEffect, showWindClaw, showSplashArrows, showBoneClaw,
    animatePositionSwap, animatePushBack, animatePushSwap, showDodgeBulletTime
} from './87fx-manager.js';
import {
    showButterflyFlyOut, showButterflyFlyBack,
    showSpiderAscend, showSpiderDescend, showSpiderStrike
} from './86fx-butterfly-spider.js';

// 原写在 player 调用点的快进判断归位于此（表现层职责）
function inFastForward() {
    return !!GlobalStore.get('fastForwardActive');
}

// 特效订阅优先级：fx: 信号空间内单订阅者无顺序要求，取中位
const P = 50;

// 模块加载即注册（ES Module 单例 + eventBus.on 幂等去重）
eventBus.on(FX_SIGNALS.TRIGGER, P, (d) => {
    _triggerFX(d.fxSnapshot, d.unitA, d.unitD, d.isDead, d.isDodge, d.isMiss, d.isBlock, d.dmg, d.waveTaunt, d.waveUnit, d.attackerRole);
});

eventBus.on(FX_SIGNALS.BANNER, P, (d) => showBuffBanner(d.text));
eventBus.on(FX_SIGNALS.CRITICAL_BANNER, P, (d) => showCriticalBanner(d.text));
eventBus.on(FX_SIGNALS.DANMAKU, P, (d) => showDanmaku(d.unit, d.text));

// 伤害飘字多来源混合（导演 stageAction 有快进判断、日志残留链路无），判断留在 emit 侧，此处纯转发
eventBus.on(FX_SIGNALS.DAMAGE_FLOAT, P, (d) => showDamageFloat(d.unit, d.dmg));
// 治疗飘字 / 蛛袭：原调用点整体带快进判断，判断归位到此处
eventBus.on(FX_SIGNALS.HEAL_FLOAT, P, (d) => { if (inFastForward()) return; showHealFloat(d.unit, d.amount); });
eventBus.on(FX_SIGNALS.SPIDER_STRIKE, P, (d) => { if (inFastForward()) return; return showSpiderStrike(d.spiderUnit, d.strikeTarget); });

eventBus.on(FX_SIGNALS.ATK_BUFF_FLOAT, P, (d) => showAtkBuffFloat(d.unit, d.gain));
eventBus.on(FX_SIGNALS.DODGE_BUBBLE, P, (d) => showDodgeBubble(d.unit, d.text));
eventBus.on(FX_SIGNALS.DODGE_BULLET_TIME, P, (d) => showDodgeBulletTime(d.unitD, d.unitA, 0));
eventBus.on(FX_SIGNALS.BRUSH_EFFECT, P, (d) => applyBrushEffect(d.el));
eventBus.on(FX_SIGNALS.HEART_EFFECT, P, (d) => showHeartEffect(d.unit));
eventBus.on(FX_SIGNALS.PINK_FLASH, P, (d) => showPinkFlash(d.unit));
eventBus.on(FX_SIGNALS.KULIAN, P, (d) => showKuLianEffect(d.unit, d.team));
eventBus.on(FX_SIGNALS.WIND_CLAW, P, (d) => showWindClaw(d.unit));
eventBus.on(FX_SIGNALS.BONE_CLAW, P, (d) => showBoneClaw(d.attacker, d.target, d.speed, d.isPausedFn, null, d.opts));
eventBus.on(FX_SIGNALS.SPLASH_ARROWS, P, (d) => showSplashArrows(d.attacker, d.primary, d.targets, d.speed, d.isPausedFn));
eventBus.on(FX_SIGNALS.POSITION_SWAP, P, (d) => animatePositionSwap(d.unitA, d.unitB, d.c, d.opts));
eventBus.on(FX_SIGNALS.PUSH_SWAP, P, (d) => animatePushSwap(d.target, d.behind, d.c, d.opts));
eventBus.on(FX_SIGNALS.PUSH_BACK, P, (d) => animatePushBack(d.target, d.c, d.newPos, d.opts));
eventBus.on(FX_SIGNALS.BUTTERFLY_FLY_OUT, P, (d) => showButterflyFlyOut(d.sister, d.host));
eventBus.on(FX_SIGNALS.BUTTERFLY_FLY_BACK, P, (d) => showButterflyFlyBack(d.host, d.sister));
eventBus.on(FX_SIGNALS.SPIDER_ASCEND, P, (d) => showSpiderAscend(d.unit));
eventBus.on(FX_SIGNALS.SPIDER_DESCEND, P, (d) => showSpiderDescend(d.unit));
