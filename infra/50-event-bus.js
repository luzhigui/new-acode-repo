// infra/50-event-bus.js - 光明顶5v5 事件总线
// V5.5.4 | ~5500 bytes| 2026-08-26 清理死键（THUNDER/HORN/XUANMING/DOUBLE/PERMANENT_CARRY/BEFORE_ATTACK.MIND_CONTROL）
export const VER = 'infra/50-event-bus.js V5.5.4';

class EventBus {
    constructor() {
        this._listeners = {};
    }

    on(signal, priority, callback) {
        if (!this._listeners[signal]) {
            this._listeners[signal] = [];
        }
        const cbKey = callback.toString();
        if (this._listeners[signal].some(l => l.priority === priority && l.callback.toString() === cbKey)) return;
        this._listeners[signal].push({ priority, callback });
        this._listeners[signal].sort((a, b) => a.priority - b.priority);
    }

    async emit(signal, data) {
        const listeners = this._listeners[signal];
        if (data && data.log && data.unit) {
            const logLevel = GlobalStore.get('playerContext')?.logLevel;
            if (logLevel === 'debug') {
                const name = data.unit ? data.unit.name : '?';
                const targetName = data.target ? data.target.name : '';
                const dmgStr = data.dmg !== undefined ? ` 伤害=${data.dmg}` : '';
                data.log.push({ type: 'signal', text: `<span class="gray">[信号] ${signal} → ${name}${targetName ? '→' + targetName : ''}${dmgStr}</span>` });
            }
        }
        if (!listeners || listeners.length === 0) return;
        for (const { callback } of listeners) {
            try {
                // 按优先级严格串行：每个监听器完全执行完才进下一个。
                // 同步监听器行为不变；异步监听器的状态写入被相位约束，不再并发逃逸
                await callback(data);
            } catch (e) {
                console.error(`[EventBus] 信号 "${signal}" 的监听器执行出错:`, e);
            }
        }
    }

    clear(signal) {
        delete this._listeners[signal];
    }

    clearAll() {
        // fx: 前缀为页面级特效信号（fx/89 页面加载时一次性注册，随页面存活），
        // 每回合的战斗监听清空重注册（core/11 prepareRoundStart）不波及它们
        for (const signal of Object.keys(this._listeners)) {
            if (signal.startsWith('fx:')) continue;
            delete this._listeners[signal];
        }
    }
}

export const eventBus = new EventBus();

export const EXECUTION_LAYER = {
    ROUND_START:      { RANGE_CHECK: 5, SPIDER_TRANSFORM: 10, XUANMING_POISON: 10, XINGFEN_GRANT: 10, KULIAN_BUFF: 10 },
    ROUND_END:        { BUTTERFLY_RETURN: 10, SPIDER_RETURN: 10 },
    BEFORE_ACTION:    { BUTTERFLY_SKIP: 10, SPIDER_SKIP: 10, KULIAN_PRIORITY: 10 },
    BEFORE_ATTACK:     {},
    BEFORE_SELECT_TARGET: { DISGUISE: 30, REBEL: 20, FLY_TARGET: 30, PERMANENT_MIND_CONTROL: 40 },
    BEFORE_DAMAGE_CALC: { WARRIOR_BREAK: 10, TRUE_DMG: 30 },
    BEFORE_DAMAGE_APPLY: { SPIDER_IMMUNE: 100 },
    ON_DODGE:          {},
    AFTER_DAMAGE_APPLIED: {
        BLOODTHIRST: 20,
        WARRIOR_EXECUTE: 20,
        HOT_BLOOD: 25,
        WIND_ASSAULT: 25,
        METEOR_SHOWER: 25,
        RANGED_GROWTH: 20,
        SHIELD_DEFEND: 30,
        DISGUISE: 40,
        XINGFEN: 40,
        LEECH: 40,
        JIUYANG: 40
    },
    AFTER_ATTACK: {
        SHIELD_ATTACK: 30,
        XINGFEN_EXTRA: 40,
        CLAW: 40,
        XUANMING_LINK: 10,
        DOUBLE_STRIKE: 40,
        MIND_CONTROL: 40
    },
    AFTER_MISS: {
        XINGFEN_RETRY: 50,
        DOUBLE_RETRY: 60
    },
    ON_UNIT_DEATH: { SWITCH: 10 },
    ON_POSITION_SWAP: { SWITCH: 10 }
};

export const EFFECT_TYPES = {
    BONUS_DMG: 'bonusDmg',
    LEECH: 'leech',
    HEAL: 'heal',
    SPLASH: 'splash',
    REBOUND: 'rebound',
    STAT_CHANGE: 'statChange',
    EXECUTE: 'execute',
    STUN: 'stun',
    WEI_HEAL: 'weiHeal',
    BREAK_DEF: 'breakDef',
    IGNORE_DEF: 'ignoreDef',
    DMG_MULTIPLIER: 'dmgMultiplier',
    DMG_REDUCTION: 'dmgReduction',
    CLAW_CHAIN: 'clawChain'
};