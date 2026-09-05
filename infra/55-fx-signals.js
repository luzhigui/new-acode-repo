// V5.5.0 | ~2200 bytes | 2026-08-23 信号名单一数据源：player emit 与 fx/89 订阅两侧各自 import，方向均为 X→infra
export const VER = 'infra/55-fx-signals.js V5.5.0';

// 特效信号：player 只 emit，fx/89 订阅；fx: 前缀与战斗信号隔离
export const FX_SIGNALS = {
    // 通用派发，内部含快进判断
    TRIGGER: 'fx:trigger',
    // 横幅与飘字
    BANNER: 'fx:banner',                 // Buff 横幅
    CRITICAL_BANNER: 'fx:criticalBanner',// 暴击/闪避反击横幅
    DAMAGE_FLOAT: 'fx:damageFloat',      // 伤害飘字
    HEAL_FLOAT: 'fx:healFloat',          // 治疗飘字（快进跳过）
    ATK_BUFF_FLOAT: 'fx:atkBuffFloat',   // 攻击加成飘字
    DODGE_BUBBLE: 'fx:dodgeBubble',      // 闪避/未命中气泡
    // 单位状态特效
    DANMAKU: 'fx:danmaku',               // 弹幕
    HEART_EFFECT: 'fx:heartEffect',      // 爱心
    PINK_FLASH: 'fx:pinkFlash',          // 粉红闪屏
    KULIAN: 'fx:kulian',                 // 苦练蓄力
    WIND_CLAW: 'fx:windClaw',            // 风爪
    BONE_CLAW: 'fx:boneClaw',            // 白骨爪
    // 攻击演出
    SPLASH_ARROWS: 'fx:splashArrows',    // 流星箭雨
    DODGE_BULLET_TIME: 'fx:dodgeBulletTime', // 闪避子弹时间
    BRUSH_EFFECT: 'fx:brushEffect',      // 死亡画笔渐隐
    // 位移动画
    POSITION_SWAP: 'fx:positionSwap',    // 换位
    PUSH_SWAP: 'fx:pushSwap',            // 推挤换位
    PUSH_BACK: 'fx:pushBack',            // 击退
    // 蝶变/蛛变
    BUTTERFLY_FLY_OUT: 'fx:butterflyFlyOut',   // 蝶变飞出
    BUTTERFLY_FLY_BACK: 'fx:butterflyFlyBack', // 蝶变飞回
    SPIDER_ASCEND: 'fx:spiderAscend',    // 蛛变升空
    SPIDER_DESCEND: 'fx:spiderDescend',  // 蛛变降落
    SPIDER_STRIKE: 'fx:spiderStrike'     // 蛛袭扑击（快进跳过）
};
