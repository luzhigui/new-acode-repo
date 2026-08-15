// fx/87fx-manager.js - 光明顶5v5 特效统一管理器
// V5.5.0 | ~2200 bytes| 2026-08-14 集中特效出口，统一注册/查询/清理
export const VER = 'fx/87fx-manager.js V5.5.0';

import {
    showDanmaku,
    showDamageFloat,
    showDodgeBubble,
    showHealFloat,
    showAtkBuffFloat,
    applyBrushEffect,
    showBuffBanner,
    showCriticalBanner,
    showHeartEffect,
    showPinkFlash,
    showKuLianEffect,
    showWindClaw
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

// 特效注册表：新增特效在这里加一个 key
const registry = {
    damageFloat: showDamageFloat,
    healFloat: showHealFloat,
    dodgeBubble: showDodgeBubble,
    danmaku: showDanmaku,
    splash: showSplashArrows,
    claw: showBoneClaw,
    butterflyFlyOut: showButterflyFlyOut,
    butterflyFlyBack: showButterflyFlyBack,
    spiderAscend: showSpiderAscend,
    spiderDescend: showSpiderDescend,
    spiderStrike: showSpiderStrike
};

/**
 * 按名称调用特效
 * @param {string} name - 特效名
 * @param {...any} args - 透传给特效函数
 */
export function playEffect(name, ...args) {
    const fn = registry[name];
    if (!fn) {
        console.warn(`[FX] 未注册特效: ${name}`);
        return undefined;
    }
    return fn(...args);
}

/**
 * 注册新特效
 * @param {string} name
 * @param {Function} fn
 */
export function registerEffect(name, fn) {
    registry[name] = fn;
}

export {
    showDanmaku,
    showDamageFloat,
    showDodgeBubble,
    showHealFloat,
    showAtkBuffFloat,
    applyBrushEffect,
    showBuffBanner,
    showCriticalBanner,
    showHeartEffect,
    showPinkFlash,
    showKuLianEffect,
    showWindClaw,
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
    showSpiderDescend
};