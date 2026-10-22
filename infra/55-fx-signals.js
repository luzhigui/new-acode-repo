// V6.1.5 | 2026-10-20 | ~2700 bytes
export const VER = 'infra/55-fx-signals.js V6.1.5';

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
    BRUSH_EFFECT: 'fx:brushEffect',      // 死亡画笔渐隐
    HORSE_DISSOLVE: 'fx:horseDissolve',  // 拒马沙化消散
    DEF_BUFF_FLOAT: 'fx:defBuffFloat',   // 防御加成飘字（钢蓝🛡，与攻击飘字镜像位）
    // 位移动画
    PUSH_SWAP: 'fx:pushSwap',            // 推挤换位
    PUSH_BACK: 'fx:pushBack',            // 击退
    // 蝶变/蛛变
    BUTTERFLY_FLY_OUT: 'fx:butterflyFlyOut',   // 蝶变飞出
    BUTTERFLY_FLY_BACK: 'fx:butterflyFlyBack', // 蝶变飞回
    SPIDER_ASCEND: 'fx:spiderAscend',    // 蛛变升空
    SPIDER_DESCEND: 'fx:spiderDescend',  // 蛛变降落
    SPIDER_STRIKE: 'fx:spiderStrike',    // 蛛袭扑击（快进跳过）
    MEDITATE: 'fx:meditate',             // 生生不息太极印（三处触发共用，视觉层去抖）
    LION_ROAR: 'fx:lionRoar',            // 雄狮振奋咆哮（快进跳过）
    MIEJUE_COUNT: 'fx:miejueCount',      // 灭绝师太出手计数飘字（快进跳过）
    // 胖远桥（六大派精英）
    PANG_TAUNT: 'fx:pangTaunt',          // 正义国字脸：扇形金锥 + 台词气泡 + 被嘲讽者红闪（快进跳过）
    PANG_CLUMSY: 'fx:pangClumsy',        // 年轻气盛：出手前侧倾甩歪 + 😵（快进跳过）
    SKILL_FLOAT: 'fx:skillFloat',        // 何太冲技能任意文本头顶飘字（破甲箭🛡-N% / 昆仑合击🎯×N；快进跳过）
    HANLISA_BURST: 'fx:hanlisaBurst'     // 寒离飒蓄力轰拳爆发：扇形冲击波 + 真伤碎冰 + 半伤冲击（快进跳过）
};
