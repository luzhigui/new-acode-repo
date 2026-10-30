export const VER = 'fx/89fx-subscriber.js V6.1.5';

import { eventBus } from '../infra/50-event-bus.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { FX_SIGNALS } from '../infra/55-fx-signals.js';
import { _triggerFX, shakeTarget } from './88fx-trigger.js';
import {
    showDanmaku, showDamageFloat, showDodgeBubble, showHealFloat, showAtkBuffFloat, showDefBuffFloat,
    applyBrushEffect, showBuffBanner, showCriticalBanner, showHeartEffect, showPinkFlash,
    showKuLianEffect, showWindClaw, showSplashArrows, showBoneClaw, showMeditateEffect,
    animatePushBack, animatePushSwap, showMiejueCountFloat,
    showHorseDissolve
} from './87fx-manager.js';
import {
    showButterflyFlyOut, showButterflyFlyBack,
    showSpiderAscend, showSpiderDescend, showSpiderStrike
} from './86fx-butterfly-spider.js';
import { showLionRoar } from './91fx-lion-roar.js';
import { showPangTaunt, showPangClumsy } from './92fx-pang-antics.js';
import { showHanLiSaBurst } from './93-hanlisa-burst.js';
import { updateHanLiSaChargeFx } from './90-hanlisa-charge.js';
import { AudioManager } from '../modules/22audio-manager.js';
import { isFxSkipped as inFastForward } from '../infra/62-fx-gate.js';

// 快进判断归位于表现层：统一走 infra/62 的 isFxSkipped（顶部以同名别名 inFastForward 引入，
//   本文件十几处 inFastForward() 调用点零改动）

// fx: 信号空间内单订阅者，优先级取中位
const P = 50;

// ES Module 单例 + eventBus.on 幂等去重
eventBus.on(FX_SIGNALS.TRIGGER, P, (d) => {
    // return：eventBus.emit 会 Promise.all 收集异步监听器，调用方才能 await
    return _triggerFX(d.fxSnapshot, d.unitA, d.unitD, d.isDead, d.isDodge, d.isMiss, d.isBlock, d.dmg, d.waveTaunt, d.waveUnit, d.attackerRole, d.markBurst);
});

eventBus.on(FX_SIGNALS.BANNER, P, (d) => showBuffBanner(d.text));
eventBus.on(FX_SIGNALS.CRITICAL_BANNER, P, (d) => showCriticalBanner(d.text));
eventBus.on(FX_SIGNALS.DANMAKU, P, (d) => showDanmaku(d.unit, d.text));

// 伤害飘字快进判断留在 emit 侧，此处纯转发
eventBus.on(FX_SIGNALS.DAMAGE_FLOAT, P, (d) => showDamageFloat(d.unit, d.dmg));
// 治疗飘字快进判断归位到此处
eventBus.on(FX_SIGNALS.HEAL_FLOAT, P, (d) => { if (inFastForward()) return; showHealFloat(d.unit, d.amount); });
eventBus.on(FX_SIGNALS.MEDITATE, P, (d) => { if (inFastForward()) return; showMeditateEffect(d.unit); });
eventBus.on(FX_SIGNALS.SPIDER_STRIKE, P, (d) => { if (inFastForward()) return; return showSpiderStrike(d.spiderUnit, d.strikeTarget); });

eventBus.on(FX_SIGNALS.ATK_BUFF_FLOAT, P, (d) => showAtkBuffFloat(d.unit, d.gain));
eventBus.on(FX_SIGNALS.DEF_BUFF_FLOAT, P, (d) => showDefBuffFloat(d.unit, d.gain));   // 钢蓝🛡，镜像位
eventBus.on(FX_SIGNALS.HORSE_DISSOLVE, P, (d) => showHorseDissolve(d.unit));          // 拒马沙化消散
eventBus.on(FX_SIGNALS.DODGE_BUBBLE, P, (d) => showDodgeBubble(d.unit, d.text));
eventBus.on(FX_SIGNALS.BRUSH_EFFECT, P, (d) => applyBrushEffect(d.el));
eventBus.on(FX_SIGNALS.HEART_EFFECT, P, (d) => showHeartEffect(d.unit));
eventBus.on(FX_SIGNALS.PINK_FLASH, P, (d) => showPinkFlash(d.unit));
eventBus.on(FX_SIGNALS.KULIAN, P, (d) => showKuLianEffect(d.unit, d.team));
eventBus.on(FX_SIGNALS.WIND_CLAW, P, (d) => showWindClaw(d.unit));
eventBus.on(FX_SIGNALS.BONE_CLAW, P, (d) => showBoneClaw(d.attacker, d.target, null, d.opts));
eventBus.on(FX_SIGNALS.SPLASH_ARROWS, P, (d) => showSplashArrows(d.attacker, d.primary, d.targets, (st) => shakeTarget(st.uid, 300)));
eventBus.on(FX_SIGNALS.PUSH_SWAP, P, (d) => animatePushSwap(d.target, d.behind, d.c, d.opts));
eventBus.on(FX_SIGNALS.PUSH_BACK, P, (d) => animatePushBack(d.target, d.c, d.newPos, d.opts));
eventBus.on(FX_SIGNALS.BUTTERFLY_FLY_OUT, P, (d) => showButterflyFlyOut(d.sister, d.host));
eventBus.on(FX_SIGNALS.BUTTERFLY_FLY_BACK, P, (d) => showButterflyFlyBack(d.host, d.sister));
eventBus.on(FX_SIGNALS.SPIDER_ASCEND, P, (d) => showSpiderAscend(d.unit));
eventBus.on(FX_SIGNALS.SPIDER_DESCEND, P, (d) => showSpiderDescend(d.unit));
// 雄狮振奋：音效 + 冲击波视觉（快进跳过）
eventBus.on(FX_SIGNALS.LION_ROAR, P, (d) => {
    if (inFastForward()) return;
    AudioManager.playSfxByName('lionRoar');
    return showLionRoar(d.unit, d.team);
});
// 灭绝师太出手计数：头顶飘出「壹/貳/參」气泡消散（快进跳过）
eventBus.on(FX_SIGNALS.MIEJUE_COUNT, P, (d) => {
    if (inFastForward()) return;
    return showMiejueCountFloat(d.unit, d.text);
});
// 胖远桥：正义国字脸（扇形金锥 + 台词气泡 + 被嘲讽者红闪）/ 年轻气盛（侧倾甩歪 + 😵）
eventBus.on(FX_SIGNALS.PANG_TAUNT, P, (d) => {
    if (inFastForward()) return;
    return showPangTaunt(d.unit, d.foes);
});
eventBus.on(FX_SIGNALS.PANG_CLUMSY, P, (d) => {
    if (inFastForward()) return;
    return showPangClumsy(d.unit);
});
// 何太冲技能任意文本头顶飘字（破甲箭🛡-N% / 昆仑合击🎯×N）：
//   复用「灭绝计数」的任意文本飘字通道 showMiejueCountFloat（头顶放大上浮消散），不另造字形（快进跳过）
eventBus.on(FX_SIGNALS.SKILL_FLOAT, P, (d) => {
    if (inFastForward()) return;
    return showMiejueCountFloat(d.unit, d.text);
});
// 寒离飒·蓄力轰拳爆发：扇形冲击波 + 真伤碎冰 + 半伤冲击（快进跳过）
eventBus.on(FX_SIGNALS.HANLISA_BURST, P, (d) => {
    if (inFastForward()) return;
    return showHanLiSaBurst(d);
});
// 九宫格渲完（render/32 在两网格渲染后 emit）：重算寒离飒蓄力扇形。
//   原先由 render/32 直接 import fx/90 调用，属 render → fx 反向依赖（铁律第 6 条），
//   2026-10-29 改为发信号。这里不做快进拦截——扇形是常驻指示物（蓄力期间要一直显示），
//   与一次性演出不同，快进时也应保持可见。
eventBus.on(FX_SIGNALS.GRID_RENDERED, P, (d) => { updateHanLiSaChargeFx(d.units); });
