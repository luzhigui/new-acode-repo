// V6.1.3 | 2026-10-20 删死代码：registry + playEffect + registerEffect（零调用；「按名调特效」旧设计残留，
//   39/88/89 一律直 import 函数名，不经名称分派）
// V6.1.1 | 2026-09-24 转出 showMiejueCountFloat（灭绝计数飘字）｜ 预估 2.6 KB
export const VER = 'fx/87fx-manager.js V6.1.3';

import {
    showDanmaku,
    showDamageFloat,
    showDodgeBubble,
    showHealFloat,
    showAtkBuffFloat,
    showDefBuffFloat,
    showHorseDissolve,
    applyBrushEffect,
    showBuffBanner,
    showCriticalBanner,
    showHeartEffect,
    showPinkFlash,
    showKuLianEffect,
    showWindClaw,
    showMeditateEffect,
    showMiejueCountFloat
} from './80fx-common-5v5-test.js';

import {
    showRangedArrow,
    showSplashArrows,
    showBoneClaw
} from './81fx-arrows-5v5-test.js';

import {
    showMeleeCrash,
    showMeleeDodge,
    showMeleeMiss
} from './82fx-crash-5v5-test.js';

import { animatePositionSwap } from './83fx-position-swap.js';
import { animatePushBack, animatePushSwap } from './84fx-push-back.js';
import { showDodgeBulletTime } from './85fx-dodge-bullet.js';

import {
    showButterflyFlyOut,
    showButterflyFlyBack,
    showSpiderAscend,
    showSpiderDescend,
    showSpiderStrike
} from './86fx-butterfly-spider.js';

import { showLionRoar } from './91fx-lion-roar.js';
import { showHanLiSaBurst } from './93-hanlisa-burst.js';

export {
    showDanmaku,
    showDamageFloat,
    showDodgeBubble,
    showHealFloat,
    showAtkBuffFloat,
    showDefBuffFloat,
    showHorseDissolve,
    applyBrushEffect,
    showBuffBanner,
    showCriticalBanner,
    showHeartEffect,
    showPinkFlash,
    showKuLianEffect,
    showWindClaw,
    showMeditateEffect,
    showMiejueCountFloat,
    showRangedArrow,
    showSplashArrows,
    showBoneClaw,
    showMeleeCrash,
    showMeleeDodge,
    showMeleeMiss,
    animatePositionSwap,
    animatePushBack,
    animatePushSwap,
    showDodgeBulletTime,
    showSpiderStrike,
    showButterflyFlyOut,
    showButterflyFlyBack,
    showSpiderAscend,
    showSpiderDescend,
    showLionRoar,
    showHanLiSaBurst
};