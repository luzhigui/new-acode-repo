// core/00-event-bus.js - 光明顶5v5 事件总线
// V5.4.0 | ~5200 bytes| 2026-07-28 信号系统基础设施
export const VER = 'core/00-event-bus.js V5.4.0';

class EventBus {
    constructor() {
        this._listeners = {};
    }

    /**
     * 注册监听器
     * @param {string} signal - 信号名
     * @param {number} priority - 优先级，数字越小越先执行
     * @param {function} callback - 回调函数
     */
    on(signal, priority, callback) {
        if (!this._listeners[signal]) {
            this._listeners[signal] = [];
        }
        // 去重：同一个回调函数不重复注册
        if (this._listeners[signal].some(l => l.callback === callback)) return;
        this._listeners[signal].push({ priority, callback });
        this._listeners[signal].sort((a, b) => a.priority - b.priority);
    }

    /**
     * 发射信号
     * @param {string} signal - 信号名
     * @param {object} data - 传递给监听器的数据
     */
    async emit(signal, data) {
        const listeners = this._listeners[signal];
        // 调试日志：信号发射时自动生成
        if (data && data.log && data.unit) {
            const logLevel = window._getPlayerContext?.()?.logLevel;
            if (logLevel === 'debug') {
                const name = data.unit ? data.unit.name : '?';
                const targetName = data.target ? data.target.name : '';
                const dmgStr = data.dmg !== undefined ? ` 伤害=${data.dmg}` : '';
                data.log.push({ type: 'signal', text: `<span class="gray">[信号] ${signal} → ${name}${targetName ? '→' + targetName : ''}${dmgStr}</span>` });
            }
        }
        if (!listeners || listeners.length === 0) return;
        const promises = [];
        for (const { callback } of listeners) {
            try {
                promises.push(callback(data));
            } catch (e) {
                console.error(`[EventBus] 信号 "${signal}" 的监听器执行出错:`, e);
            }
        }
        if (promises.length > 0) await Promise.all(promises);
    }

    /**
     * 清除某个信号上的所有监听器（用于调试或重置）
     */
    clear(signal) {
        delete this._listeners[signal];
    }

    /**
     * 清除所有信号上的所有监听器
     */
    clearAll() {
        this._listeners = {};
    }
}

export const eventBus = new EventBus();

// ==================== 执行层级定义 ====================
// 所有 eventBus.on 的 priority 参数必须使用此枚举，禁止魔法数字。
// 层级按数字从小到大依次执行。同层级内按注册顺序执行。
export const EXECUTION_LAYER = {
    // ── 回合生命周期 ──
    ROUND_START:      { SPIDER_TRANSFORM: 10, XUANMING_POISON: 10, XINGFEN_GRANT: 10, KULIAN_BUFF: 10, PERMANENT_CARRY: 10 },
    ROUND_END:        { BUTTERFLY_RETURN: 10, SPIDER_RETURN: 10 },

    // ── 行动调度 ──
    BEFORE_ACTION:    { BUTTERFLY_SKIP: 10, SPIDER_SKIP: 10, KULIAN_PRIORITY: 10 },

    // ── 攻击前 ──
    BEFORE_FIRST_ALLY_ATTACK: { BUTTERFLY_ATTACH: 10 },
    BEFORE_ATTACK:     { MIND_CONTROL: 10 },
    BEFORE_SELECT_TARGET: { CHENGKUN_DISGUISE: 30, SONG_REBEL: 20, FLY_TARGET: 30, PERMANENT_MIND_CONTROL: 40 },
    BEFORE_DAMAGE_CALC: { WARRIOR_BREAK: 10, CHENGKUN_THUNDER: 15, HE_HORN: 25, SONG_TRUE_DMG: 30 },
    BEFORE_DAMAGE_APPLY: { SPIDER_IMMUNE: 100 },

    // ── 闪避后 ──
    ON_DODGE:          { WEI_HEAL: 10 },

    // ── 攻击后 ──
    AFTER_DAMAGE_APPLIED: {
        BLOODTHIRST: 20,    // 嗜血狂刀（吸血）
        WARRIOR_EXECUTE: 20, // 战士斩杀
        HOT_BLOOD: 25,      // 热血奋战（回血）
        WIND_ASSAULT: 25,   // 乘风突袭（溅射）
        METEOR_SHOWER: 25,  // 流星赶月（溅射）
        RANGED_GROWTH: 20,  // 远程成长
        SHIELD_DEFEND: 30,  // 坚盾（被攻击）
        CHENGKUN_DISGUISE: 40, // 成昆伪装
        LU_XUANMING: 40,    // 鹿杖客玄冥
        SONG_XINGFEN: 40,   // 宋青书新婚
        WEI_LEECH: 40,      // 韦一笑吸血
        ZHANG_JIUYANG: 40   // 张无忌九阳
    },
    AFTER_ATTACK: {
        SHIELD_ATTACK: 30,  // 坚盾（攻击触发）
        SONG_XINGFEN_EXTRA: 40, // 宋青书性奋额外攻击
        ZHOU_CLAW: 40,      // 周芷若白骨爪
        XUANMING_LINK: 10,  // 玄冥联动
        DOUBLE_STRIKE: 40,  // 概率连击
        XIAOZHAO_DOUBLE: 40 // 小昭永久连击
    },
    AFTER_MISS: {
        SONG_XINGFEN_RETRY: 50, // 宋青书性奋重试
        XIAOZHAO_DOUBLE_RETRY: 60 // 小昭永久连击重试
    },
    ALLY_DAMAGED: {
        QIANKUN_REBOUND: 40, // 乾坤反弹
        QIANKUN_DERIVED: 50  // 乾坤衍生
    },

    // ── 死亡 ──
    ON_BEFORE_DEATH: {},
    ON_UNIT_DEATH: { ZHANG_SWITCH: 10 }, // 单位死亡后（张无忌被动检测前排）

    // ── 换位 ──
    ON_POSITION_SWAP: { ZHANG_SWITCH: 10 }, // 换位后（张无忌被动检测前排）

    // ── 额外攻击请求 ──
    REQUEST_EXTRA_ATTACK: { DEFAULT: 10 }
};