// V6.9.6 | ~9550 bytes | 2026-10-16 时序修正二则（老板拍板）：AFTER_ATTACK 增 YIN_COUNTER_FIRE:25——殷天正反击出手
//   从 AFTER_DAMAGE_APPLIED 推迟到 AFTER_ATTACK，避开「本击白骨爪连锁斩杀后仍反击」；新增相位
//   AFTER_ATTACK_IMMUNE：{ XINGFEN_EXTRA: 40 }——免疫分支（妹妹飞天）专用广播，宋青书性奋第二下照发
// V6.9.5 | ~8250 bytes | 2026-10-15 第二批内容钩子登记：AFTER_DAMAGE_APPLIED 增 YIN_COUNTER:16 / YIN_PRESSURE:18 / YIN_GROW:21
//   （殷天正·鹰爪功反击 / 鹰王威压削敌）、BEFORE_DAMAGE_CALC 增 QISHANG:20（唐文亮·七伤拳自损增伤）、
//   ON_UNIT_DEATH 增 TONG_GUI:25（唐文亮·同归于尽反噬）
// V6.9.4 | ~7950 bytes | 2026-10-15 新增相位 AFTER_SELECT_TARGET：{ PANG_DECLARE: 10 }（core/10 选敌完成、命中/闪避判定前带 log 广播；胖远桥出手声明据此早于 DODGE 落行）
// V6.9.3 | 2026-10-15 ON_UNIT_DEATH 增 XIAO_CARRY_COUNT:30（妹永久 carry 死亡计数钩子，modules/27）
// V6.9.2 | 2026-10-14 AFTER_DAMAGE_APPLIED 增 EAGLE_RESTORE:27（carry 雄鹰命中后恢复队友行动力 / 无人可恢复召雌鹰）
// V6.9.1 | ~7500 bytes | 2026-10-13 杨逍重做：BEFORE_DAMAGE_CALC 增 YANGXIAO_ALL_ACTED:17（敌方全行动→追击×1.3 声明槽）
// V6.9.0 | 2026-10-13 何太冲红血触发挪位：HE_TAICHONG_RED_BLOOD 从 BEFORE_DAMAGE_APPLY:90
//   移到 ON_UNIT_ACTED:30（行动结束判定——先挨打成红血、演出完再换位，不再「先换位后挨打」）
// ── 更早版本见 记录-更改履历.md
import { GlobalStore } from './54-global-store.js';
export const VER = 'infra/50-event-bus.js V6.9.6';

// debug 模式在日志追加信号记录，非战斗路径
function appendDebugSignalLog(signal, data) {
    if (!data || !data.log || !data.unit) return;
    const logLevel = GlobalStore.get('playerContext')?.logLevel;
    if (logLevel !== 'debug') return;
    const name = data.unit ? data.unit.name : '?';
    const targetName = data.target ? data.target.name : '';
    const dmgStr = data.dmg !== undefined ? ` 伤害=${data.dmg}` : '';
    data.log.push({ type: 'signal', text: `<span class="gray">[信号] ${signal} → ${name}${targetName ? '→' + targetName : ''}${dmgStr}</span>` });
}

class EventBus {
    constructor() {
        this._listeners = {};
        // 运行时监听器错误追踪（DOM 无关）：页面端有 modules/21 劫持 console.error 的错误面板，
        // 但 worker 跑批无 DOM、那条链路整段断掉。这里另维护可读计数，体检/批量工具每局读取、重置。
        this._errorCount = 0;
        this._lastError = null;
        this._recentErrors = [];
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

    emit(signal, data) {
        appendDebugSignalLog(signal, data);
        const listeners = this._listeners[signal];
        if (!listeners || listeners.length === 0) return Promise.resolve();
        const promises = [];
        for (const { callback } of listeners) {
            try {
                const result = callback(data);
                // 异步监听器（返回 Promise）会被收集并等待
                if (result && typeof result.then === 'function') promises.push(result);
            } catch (e) {
                this._recordError(signal, e);
                console.error(`[EventBus] 信号 "${signal}" 的监听器执行出错:`, e);
            }
        }
        return Promise.all(promises);
    }

    /** 记录一次监听器运行时错误（计数 + 最近 20 条明细，供无 DOM 环境读取） */
    _recordError(signal, e) {
        this._errorCount++;
        const entry = { signal, message: (e && e.message) ? e.message : String(e), time: Date.now() };
        this._lastError = entry;
        this._recentErrors.push(entry);
        if (this._recentErrors.length > 20) this._recentErrors.shift();
    }

    /** 本进程累计的监听器错误数（跑批每局开局可 resetErrorTracker 后读增量） */
    getErrorCount() { return this._errorCount; }
    getLastError() { return this._lastError; }
    getRecentErrors() { return this._recentErrors.slice(); }
    resetErrorTracker() {
        this._errorCount = 0;
        this._lastError = null;
        this._recentErrors = [];
    }

    clear(signal) {
        delete this._listeners[signal];
    }

    clearAll() {
        // fx: 前缀为页面级信号，不随回合清空
        for (const signal of Object.keys(this._listeners)) {
            if (signal.startsWith('fx:')) continue;
            delete this._listeners[signal];
        }
    }
}

export const eventBus = new EventBus();

/**
 * 相位表（执行时序约定）：
 * - priority 数值越小越先执行（升序）
 * - 同一 phase 内所有监听器按 priority 升序同步串行，
 *   前一个（含 await 完成）完成后才执行下一个
 * - 监听器不得在异步回调里修改战斗状态（会跨相位逃逸），
 *   状态写入必须在本监听器主流程内完成
 */
export const EXECUTION_LAYER = {
    ROUND_START:      { RANGE_CHECK: 5, SPIDER_TRANSFORM: 10, XUANMING_POISON: 10, XINGFEN_GRANT: 10, KULIAN_BUFF: 10, LION_GROW: 15, XIE_SUMMON: 16, MIEJUE_SUMMON: 20, HE_TAICHONG_LINK: 30, JIN_MAI: 35, HOLY_FIRE: 40 },
    ROUND_END:        { SPIDER_EGG: 5, BUTTERFLY_RETURN: 10, SPIDER_RETURN: 10 },
    BEFORE_ACTION:    { BUTTERFLY_SKIP: 10, SPIDER_SKIP: 10, KULIAN_PRIORITY: 10 },
    BEFORE_ATTACK:     {},
    BEFORE_SELECT_TARGET: { PANG_CLUMSY: 15, PANG_TAUNT_FORCE: 18, PHANTOM_CLEAR: 25, DISGUISE: 30, REBEL: 20, PERMANENT_MIND_CONTROL: 40 },
    AFTER_SELECT_TARGET: { PANG_DECLARE: 10 },
    BEFORE_DAMAGE_CALC: { WARRIOR_BREAK: 10, MIEJUE_NORMAL_MULT: 14, MIEJUE_THIRD_MULT: 15, PANG_YOUNG_MULT: 16, YANGXIAO_ALL_ACTED: 17, QISHANG: 20, HE_TAICHONG_MARK: 22, TRUE_DMG: 30 },
    BEFORE_DAMAGE_APPLY: { SPIDER_IMMUNE: 100 },
    ON_DODGE:          {},
    ON_UNIT_ACTED:     { HE_TAICHONG_RED_BLOOD: 30 },
    AFTER_DAMAGE_APPLIED: {
        BLOODTHIRST: 20,
        // 2026-10-02 斩杀挪到 45：升序执行，必须晚于 JIUYANG=40 的融会 BONUS_DMG 声明（以及 PANG_CLUMSY_LOG=42），斩杀才能把融会伤害计入有效血量
        WARRIOR_EXECUTE: 45,
        MIEJUE_COUNTER: 15,
        YIN_COUNTER: 16,        // 殷天正·鹰爪功反击（modules/27）
        MIEJUE_CHASE: 17,
        YIN_PRESSURE: 18,       // 殷天正·鹰王威压：命中后永久削目标攻防（modules/27）
        HE_TAICHONG_MARK: 19,
        YIN_GROW: 21,           // 殷天正·老当益壮：每次命中后自身永久成长 + 反击概率累计（modules/27）
        PANG_RAGE: 22,
        LION_INSPIRE: 23,
        LION_FOLLOW: 24,
        MIEJUE_THIRD_LEECH: 26,
        EAGLE_RESTORE: 27,
        DIAN_XUE: 28,
        HOT_BLOOD: 25,
        WIND_ASSAULT: 25,
        METEOR_SHOWER: 25,
        RANGED_GROWTH: 20,
        SHIELD_DEFEND: 30,
        REBOUND: 35,
        DISGUISE: 40,
        XINGFEN: 40,
        LEECH: 40,
        JIUYANG: 40,
        PANG_CLUMSY_LOG: 42
    },
    AFTER_ATTACK: {
        YIN_COUNTER_FIRE: 25,   // 殷天正·鹰爪功反击出手（modules/27）：把 AFTER_DAMAGE_APPLIED 暂存的反击转成本次出手的额外攻击
        PHANTOM_REROLL: 20,
        SHIELD_ATTACK: 30,
        PANG_TAUNT: 35,
        XINGFEN_EXTRA: 40,
        CLAW: 40,
        FOLLOW_ATTACK: 45,
        XUANMING_LINK: 10,
        DOUBLE_STRIKE: 40,
        MIND_CONTROL: 40
    },
    // 本击被免疫（飞天）：core/10 免疫分支的专用广播（不牵连 AFTER_ATTACK 下十余条监听）
    AFTER_ATTACK_IMMUNE: { XINGFEN_EXTRA: 40 },
    AFTER_MISS: {
        PHANTOM_REROLL: 20,
        PANG_CLEAR: 30,
        XINGFEN_RETRY: 50,
        PERMANENT_DOUBLE_RETRY: 60
    },
    ON_BEFORE_DEATH: { SPIDER_EGG: 10 },
    // 白骨爪连锁逐爪广播：CLAW_CHAIN 处理器每结算一爪发一次（爪击不走伤害计算管线）
    CLAW_HIT_APPLIED: { XIAOZHAO_QIAN_KUN: 10 },
    ON_UNIT_DEATH: { SWITCH: 10, MIEJUE_RECORD: 20, TONG_GUI: 25, XIAO_CARRY_COUNT: 30, HOLY_FIRE: 40 },
    ON_POSITION_SWAP: { SWITCH: 10 },
    BEFORE_STATE_TRANSITION: { MIEJUE_SUMMON: 20, HOLY_FIRE: 30 }
};

/**
 * 结算时机注册入口：统一替代手写 eventBus.on(signal, L.X, fn)。
 * 内部透传 eventBus.on，行为零变化。
 */
export function registerSettlementHook({ when, priority, handler }) {
    eventBus.on(when, priority, handler);
}

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
    CLAW_CHAIN: 'clawChain',
    ROUND_STAT_GRANT: 'roundStatGrant'
};