// infra/50-event-bus.js - 光明顶5v5 事件总线
// V5.5.2 | ~5500 bytes| 2026-08-26 emit 监听器由 Promise.all 并发改为按相位优先级严格串行
export const VER = 'infra/50-event-bus.js V5.5.2';

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
    ROUND_START:      { ZHANG_RANGE_CHECK: 5, SPIDER_TRANSFORM: 10, XUANMING_POISON: 10, XINGFEN_GRANT: 10, KULIAN_BUFF: 10, PERMANENT_CARRY: 10 },
    ROUND_END:        { BUTTERFLY_RETURN: 10, SPIDER_RETURN: 10 },
    BEFORE_ACTION:    { BUTTERFLY_SKIP: 10, SPIDER_SKIP: 10, KULIAN_PRIORITY: 10 },
    BEFORE_ATTACK:     { MIND_CONTROL: 10 },
    BEFORE_SELECT_TARGET: { CHENGKUN_DISGUISE: 30, SONG_REBEL: 20, FLY_TARGET: 30, PERMANENT_MIND_CONTROL: 40 },
    BEFORE_DAMAGE_CALC: { WARRIOR_BREAK: 10, CHENGKUN_THUNDER: 15, HE_HORN: 25, SONG_TRUE_DMG: 30 },
    BEFORE_DAMAGE_APPLY: { SPIDER_IMMUNE: 100 },
    ON_DODGE:          { WEI_HEAL: 10 },
    AFTER_DAMAGE_APPLIED: {
        BLOODTHIRST: 20,
        WARRIOR_EXECUTE: 20,
        HOT_BLOOD: 25,
        WIND_ASSAULT: 25,
        METEOR_SHOWER: 25,
        RANGED_GROWTH: 20,
        SHIELD_DEFEND: 30,
        CHENGKUN_DISGUISE: 40,
        LU_XUANMING: 40,
        SONG_XINGFEN: 40,
        WEI_LEECH: 40,
        ZHANG_JIUYANG: 40
    },
    AFTER_ATTACK: {
        SHIELD_ATTACK: 30,
        SONG_XINGFEN_EXTRA: 40,
        ZHOU_CLAW: 40,
        XUANMING_LINK: 10,
        DOUBLE_STRIKE: 40,
        XIAOZHAO_DOUBLE: 40,
        MIND_CONTROL: 40
    },
    AFTER_MISS: {
        SONG_XINGFEN_RETRY: 50,
        XIAOZHAO_DOUBLE_RETRY: 60
    },
    ALLY_DAMAGED: {
        QIANKUN_REBOUND: 40,
        QIANKUN_DERIVED: 50
    },
    ON_BEFORE_DEATH: {},
    ON_UNIT_DEATH: { ZHANG_SWITCH: 10 },
    ON_POSITION_SWAP: { ZHANG_SWITCH: 10 }
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