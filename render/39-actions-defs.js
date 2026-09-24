// render/39-actions-defs.js — 舞台动作演出定义（演出域）
// V1.0.0 | ~22200 bytes | 2026-09-22 从 render/31 拆出：STAGE_ACTION_DEFS 全表 + 单位查找
//
// 加新 stageAction：在本文件 STAGE_ACTION_DEFS 加一条（键=STAGE_ACTION_TYPES.xxx），
// 并在 infra/56 的 STAGE_ACTION_TYPES 登记。
import { clock } from '../infra/52-clock.js';
import { eventBus } from '../infra/50-event-bus.js';
import { FX_SIGNALS } from '../infra/55-fx-signals.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { AudioManager } from '../modules/22audio-manager.js';
import { STAGE_ACTION_TYPES, STORE_ACTION_TYPES, UNIT_EVENT_TYPES, ROLE_TYPES, BUFF_EFFECT_TYPES, BUFF_SUBTYPES, FLY_MODE_TYPES } from '../infra/56-battle-enums.js';
export const VER = 'render/39-actions-defs.js V1.0.0';

// 先查 store 权威单位，再回退 UI 快照
function findUnitByUidLocal(c, uid) {
    if (!uid) return null;
    if (c && c.store) {
        const su = c.store.getState().units.find(u => u.uid === uid);
        if (su) return su;
    }
    const ui = (c && c.UI) || {};
    const all = (ui.allyTeam || []).concat(ui.enemyTeam || []);
    return all.find(u => u.uid === uid) || null;
}

// 舞台动作唯一调度表；新增 stageAction 只需在此登记 + 31 翻译器产出
export const STAGE_ACTION_DEFS = {
    [STAGE_ACTION_TYPES.ATTACK]: {
        grid: 'sync', log: 'sync', timing: 'beforeText',
        store: (c, action, pendingDeaths) => {
            // 死亡标记收集后由 playStep 在日志播完统一落地
            if (action.dead && action.targetUid && pendingDeaths) pendingDeaths.push(action.targetUid);
        },
        fx: async (c, action) => {
            const attacker = findUnitByUidLocal(c, action.actorUid);
            const target = findUnitByUidLocal(c, action.targetUid);
            // 苦练蓄力特效
            if (action.isKuLianAttack && attacker) {
                const team = c.store.getState().units.filter(u => u.camp === attacker.camp);
                eventBus.emit(FX_SIGNALS.KULIAN, { unit: attacker, team });
                await clock.wait(1200);
            }
            // 飞撞/箭矢/台词弹幕（统一由 fx/88 的 _triggerFX 消费）
            // 联动攻击必须等主攻动画播完再起手（emit 同步不发 Promise，需显式等待）
            if (action.isLinkAttack && attacker && target && action.attackerRole) {
                await clock.wait(1400);
            }
            if (attacker && target && action.attackerRole) {
                eventBus.emit(FX_SIGNALS.TRIGGER, {
                    fxSnapshot: action.fx,
                    unitA: attacker,
                    unitD: target,
                    isDead: action.dead,
                    isDodge: false,
                    isMiss: false,
                    isBlock: false,
                    dmg: action.dmg,
                    waveTaunt: action.waveTaunt || null,
                    waveUnitUid: action.waveUnitUid || null,
                    waveUnit: action.waveUnit || null,
                    attackerRole: action.attackerRole
                });
            }
        }
    },
    [STAGE_ACTION_TYPES.REBOUND]: {
        grid: 'none', log: 'sync', timing: 'afterText',
        fx: async (c, action) => {
            // 反伤：只飘字，不触发飞撞/箭矢/音效；严阵以待带横幅（fortifyRebound）
            if (action.bannerText && !GlobalStore.get('fastForwardActive')) {
                await eventBus.emit(FX_SIGNALS.BANNER, { text: action.bannerText });
            }
            const target = findUnitByUidLocal(c, action.targetUid);
            if (target && action.dmg && !GlobalStore.get('fastForwardActive')) {
                eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: target, dmg: action.dmg });
            }
        }
    },
    [STAGE_ACTION_TYPES.HEAL]: {
        grid: 'sync', log: 'sync',
        timing: (action) => (action && action.timing === 'afterText') ? 'afterText' : 'anchor',
        fx: (c, action) => {
            const healUnit = findUnitByUidLocal(c, action.targetUid);
            if (healUnit && action.amount) {
                eventBus.emit(FX_SIGNALS.HEAL_FLOAT, { unit: healUnit, amount: action.amount });
            }
        }
    },
    [STAGE_ACTION_TYPES.DEATH]: { grid: 'sync', log: 'sync', timing: 'afterText' },
    [STAGE_ACTION_TYPES.DODGE]: {
        grid: 'sync', log: 'sync', timing: 'beforeText',
        store: (c, action, pendingDeaths) => {
            // 闪避反击后攻击者进入眩晕态并清除 flash；华丽模式子弹时间结束后才显示 😵
            if (action.actorUid) {
                c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: action.actorUid, _acted: true });
                c.store.dispatch({ type: STORE_ACTION_TYPES.CLEAR_UNIT_FLASH, uid: action.actorUid });
                // 简单模式无子弹时间，立即显示眩晕
                if (!c.dodgeEffectEnabled) {
                    c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: action.actorUid, _stunned: true });
                }
            }
            if (action.dead && action.actorUid && pendingDeaths) pendingDeaths.push(action.actorUid);
        },
        fx: async (c, action) => {
            const attacker = findUnitByUidLocal(c, action.actorUid);
            const dodger = findUnitByUidLocal(c, action.targetUid);
            if (attacker && action.reboundDmg && !GlobalStore.get('fastForwardActive')) {
                eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: attacker, dmg: action.reboundDmg });
            }
            // 华丽模式：子弹时间；简单模式：气泡
            if (c.dodgeEffectEnabled && attacker && dodger) {
                await eventBus.emit(FX_SIGNALS.CRITICAL_BANNER, { text: '✨闪避反击✨' });
                // 必须直接 await，不能走 eventBus（emit 同步不等待 Promise），否则动画并行战斗推进会踩踏
                const { showDodgeBulletTime } = await import('../fx/85fx-dodge-bullet.js');
                await showDodgeBulletTime(attacker, dodger, action.reboundDmg || 0);
            } else if (attacker) {
                eventBus.emit(FX_SIGNALS.DODGE_BUBBLE, { unit: attacker, text: '闪避！' });
                // 简单模式闪避反击：近战攻击者需补发 TRIGGER 信号，触发飞撞击退动画。
                //    _triggerFX 里 isDodge=true 且 dodgeEffectEnabled=false 时，会调用 showMeleeDodge(闪避者, 攻击者)，
                //    实现"飞撞过去 → 被击退回来"的完整动画。远程攻击者不走飞撞，只保持气泡提示。
                if (attacker.role !== ROLE_TYPES.RANGED && dodger) {
                    eventBus.emit(FX_SIGNALS.TRIGGER, {
                        fxSnapshot: action.fx || null,
                        unitA: attacker,
                        unitD: dodger,
                        isDead: false,
                        isDodge: true,
                        isMiss: false,
                        isBlock: false,
                        dmg: action.reboundDmg || 0,
                        waveTaunt: null,
                        waveUnitUid: null,
                        waveUnit: null,
                        attackerRole: attacker.role
                    });
                }
            }
        }
    },
    [STAGE_ACTION_TYPES.POS_SWAP]: {
        grid: 'sync', log: 'sync', timing: 'beforeText',
        // 2026-09-23 修换位剧透：原先 store 前置段先把位置换掉（格子瞬移）再播闪烁换位动画，特效纯属重播。
        // 改为与 PUSH 同款：删 store 段与 skipDataChange，位置由 fx/83 动画落定后自 dispatch POS_CHANGE。
        fx: async (c, action) => {
            const unitA = findUnitByUidLocal(c, action.actorUid);
            const unitB = findUnitByUidLocal(c, action.targetUid);
            if (unitA && unitB) {
                const { animatePositionSwap } = await import('../fx/87fx-manager.js');
                await animatePositionSwap(unitA, unitB, c, {
                    oldPositions: (action.oldPosA != null && action.oldPosB != null) ? [action.oldPosA, action.oldPosB] : null
                });
            }
        }
    },
    [STAGE_ACTION_TYPES.PUSH]: {
        grid: 'sync', log: 'sync', timing: 'beforeText',
        // 2026-09-16 位置变更交给 fx 内的动画收尾（原先 store 先改位置 → 格子瞬移后才播拱动画）
        fx: async (c, action) => {
            const target = findUnitByUidLocal(c, action.actorUid);
            if (!target) return;
            await eventBus.emit(FX_SIGNALS.BANNER, { text: `${action.label || '🦅 乘风突袭'}！` });
            if (action.targetUid) {
                const behind = findUnitByUidLocal(c, action.targetUid);
                if (behind) {
                    await eventBus.emit(FX_SIGNALS.PUSH_SWAP, { target, behind, c, opts: {} });
                }
            } else {
                await eventBus.emit(FX_SIGNALS.PUSH_BACK, { target, c, newPos: action.newPos, opts: {} });
            }
        }
    },
    [STAGE_ACTION_TYPES.SUMMON]: {
        grid: 'sync', log: 'sync', timing: 'beforeText',
        store: (c, action, pendingDeaths) => {
            if (action.actorUid) {
                const unit = c.store.getState().units.find(u => u.uid === action.actorUid);
                if (unit) {
                    c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unit.uid, _acted: false });
                }
            }
        },
        fx: async (c, action) => {
            const horse = findUnitByUidLocal(c, action.actorUid);
            if (horse) {
                await eventBus.emit(FX_SIGNALS.BANNER, { text: '🐴 拒马阵！' + (action.taunt || '') });
            }
        }
    },
    [STAGE_ACTION_TYPES.DESTROY]: {
        grid: 'sync', log: 'sync', timing: 'afterText',
        store: (c, action, pendingDeaths) => {
            if (action.success && action.actorUid) {
                c.store.dispatch({ type: STORE_ACTION_TYPES.REMOVE_UNIT, uid: action.actorUid });
            }
        },
        fx: async (c, action) => {
            if (action.success && action.actorUid) {
                await eventBus.emit(FX_SIGNALS.BANNER, { text: '🐴 拒马已销毁' });
            }
        }
    },
    [STAGE_ACTION_TYPES.TRANSFORM]: {
        grid: 'sync', log: 'sync', timing: 'beforeText',
        store: (c, action, pendingDeaths) => {
            // 张无忌切近战：解除休息态（SPIDER_TRANSFORM 无副作用）
            if (action.actorUid && action.danmaku) {
                c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: action.actorUid, _resting: false });
            }
        },
        fx: (c, action) => {
            // 变身/切形态：张无忌弹幕（zhangSwitch），蛛变无特效
            const unit = findUnitByUidLocal(c, action.actorUid);
            if (action.danmaku && unit && !GlobalStore.get('fastForwardActive')) {
                eventBus.emit(FX_SIGNALS.DANMAKU, { unit, text: action.danmaku });
            }
        }
    },
    [STAGE_ACTION_TYPES.FLY_MODE]: {
        grid: 'sync', log: 'sync', timing: 'beforeText',
        fx: (c, action) => {
            const unit = findUnitByUidLocal(c, action.actorUid);
            if (!unit) return;
            // 特效按 originalFactType 区分
            if (action.originalFactType === FLY_MODE_TYPES.BUTTERFLY_ATTACH) {
                const host = findUnitByUidLocal(c, action.hostUid);
                if (host) eventBus.emit(FX_SIGNALS.BUTTERFLY_FLY_OUT, { sister: unit, host });
            } else if (action.originalFactType === FLY_MODE_TYPES.BUTTERFLY_RETURN) {
                const host = findUnitByUidLocal(c, action.hostUid);
                if (host) eventBus.emit(FX_SIGNALS.BUTTERFLY_FLY_BACK, { host, sister: unit });
            } else if (action.originalFactType === FLY_MODE_TYPES.SPIDER_FLY) {
                eventBus.emit(FX_SIGNALS.SPIDER_ASCEND, { unit });
            } else if (action.originalFactType === FLY_MODE_TYPES.SPIDER_RETURN) {
                eventBus.emit(FX_SIGNALS.SPIDER_DESCEND, { unit });
            }
        }
    },
    [STAGE_ACTION_TYPES.ROUND_START]: {
        grid: 'sync', log: 'sync', timing: 'beforeText',
        store: (c, action, pendingDeaths) => {
            c.store.getState().units.forEach(u => {
                if (u.alive) c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: u.uid, _acted: false });
            });
        }
    },
    [STAGE_ACTION_TYPES.ROUND_END]: { grid: 'sync', log: 'sync', timing: 'afterText' },
    [STAGE_ACTION_TYPES.REST]: { grid: 'sync', log: 'sync', timing: 'beforeText' },
    [STAGE_ACTION_TYPES.DOT]: {
        grid: 'sync', log: 'sync', timing: 'anchor',
        store: (c, action, pendingDeaths) => {
            if (action.dead && action.targetUid && pendingDeaths) pendingDeaths.push(action.targetUid);
        },
        fx: (c, action) => {
            const target = findUnitByUidLocal(c, action.targetUid);
            if (target && action.dmg && !GlobalStore.get('fastForwardActive')) {
                eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: target, dmg: action.dmg });
            }
        }
    },
    [STAGE_ACTION_TYPES.EXECUTE]: {
        grid: 'sync', log: 'sync', timing: 'afterText',
        store: (c, action, pendingDeaths) => {
            if (action.dead && action.targetUid && pendingDeaths) pendingDeaths.push(action.targetUid);
        },
        fx: (c, action) => {
            const target = findUnitByUidLocal(c, action.targetUid);
            if (target && action.dmg && !GlobalStore.get('fastForwardActive')) {
                eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: target, dmg: action.dmg });
            }
        }
    },
    [STAGE_ACTION_TYPES.MISS]: {
        grid: 'none', log: 'sync', timing: 'beforeText',
        fx: async (c, action) => {
            const attacker = findUnitByUidLocal(c, action.actorUid);
            const target = findUnitByUidLocal(c, action.targetUid);
            if (attacker && !GlobalStore.get('fastForwardActive')) {
                // 近战/飞行 → 飞撞（撞到一半弹气泡）；远程 → 射偏箭（箭飞到一半偏出去）。
                // 两者都由 88 的 _triggerFX 按 attackerRole 分派，此处只需把信号发出去。
                // 2026-09-16 之前远程走的是单独的气泡分支，导致 showRangedArrow 的 isMiss 轨迹无人调用。
                if (target) {
                    // await：近战飞撞播完再推下一组，避免动画没完、下一组已开始
                    // （远程的 showRangedArrow 不返回 Promise，await 对它等于立即通过）
                    await eventBus.emit(FX_SIGNALS.TRIGGER, {
                        fxSnapshot: action.fx || null,
                        unitA: attacker,
                        unitD: target,
                        isDead: false,
                        isDodge: false,
                        isMiss: true,
                        isBlock: false,
                        dmg: 0,
                        waveTaunt: null,
                        waveUnitUid: null,
                        waveUnit: null,
                        attackerRole: attacker.role
                    });
                } else {
                    eventBus.emit(FX_SIGNALS.DODGE_BUBBLE, { unit: attacker, text: '未命中' });
                }
            }
        }
    },
    [STAGE_ACTION_TYPES.IMMUNE]: { grid: 'none', log: 'sync', timing: 'beforeText' },
    [STAGE_ACTION_TYPES.STAT_CHANGE]: { grid: 'sync', log: 'sync', timing: 'afterText' },
    [STAGE_ACTION_TYPES.BANNER]: {
        grid: 'none', log: 'sync',
        timing: (action) => (action && action.timing) || 'beforeText',
        fx: async (c, action) => {
            // 阻塞横幅：等待横幅播放完成，日志和动画按序推进
            if (action.text && !GlobalStore.get('fastForwardActive')) {
                const { showBuffBanner } = await import('../fx/87fx-manager.js');
                await showBuffBanner(action.text);
            }
        }
    },
    [STAGE_ACTION_TYPES.EMPTY_TARGET]: { grid: 'none', log: 'sync', timing: 'beforeText' },
    [STAGE_ACTION_TYPES.STUN]: { grid: 'sync', log: 'sync', timing: 'beforeText' },
    [STAGE_ACTION_TYPES.SPLASH]: {
        grid: 'sync', log: 'sync', timing: 'afterText',
        fx: (c, action) => {
            if (action.splashUids && action.splashDmg && !GlobalStore.get('fastForwardActive')) {
                action.splashUids.forEach(uid => {
                    const t = findUnitByUidLocal(c, uid);
                    if (t) eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: t, dmg: action.splashDmg });
                });
            }
        }
    },
    [STAGE_ACTION_TYPES.SPIDER_STRIKE]: {
        grid: 'sync', log: 'sync', timing: 'beforeText',
        store: (c, action, pendingDeaths) => {
            if (action.dead && action.targetUid && pendingDeaths) pendingDeaths.push(action.targetUid);
        },
        fx: async (c, action) => {
            const spiderUnit = findUnitByUidLocal(c, action.actorUid);
            const strikeTarget = findUnitByUidLocal(c, action.targetUid);
            if (spiderUnit && strikeTarget) {
                await eventBus.emit(FX_SIGNALS.SPIDER_STRIKE, { spiderUnit, strikeTarget });
            }
        }
    },
    [STAGE_ACTION_TYPES.BUFF_EFFECT]: {
        grid: 'none', log: 'sync',
        timing: (action) => {
            if (!action) return 'afterText';
            // 子效果显式标记 afterText 时优先（ATTACK 内的衍生效果不能走 anchor）
            if (action.timing === 'afterText') return 'afterText';
            const t = action.effectType;
            if (t === BUFF_EFFECT_TYPES.XIN_HUN) return 'beforeText';
            if (t === BUFF_EFFECT_TYPES.ATK_BUFF) return 'anchor';
            return 'afterText';
        },
        fx: async (c, action) => {
            const attacker = findUnitByUidLocal(c, action.attackerUid);
            const target = findUnitByUidLocal(c, action.targetUid);
            const primary = findUnitByUidLocal(c, action.primaryUid);
            if (action.effectType === BUFF_EFFECT_TYPES.SPLASH && attacker && primary && action.splashUids && action.splashUids.length > 0) {
                const splashTargets = action.splashUids.map(uid => findUnitByUidLocal(c, uid)).filter(u => u);
                if (splashTargets.length > 0) {
                    // 乘风突袭：风爪 + 专属横幅，不放箭、不延时；否则走流星箭雨
                    if (action.buffType === BUFF_SUBTYPES.WIND_ASSAULT) {
                        await eventBus.emit(FX_SIGNALS.BANNER, { text: '🦅 乘风突袭！' });
                        splashTargets.forEach(u => eventBus.emit(FX_SIGNALS.WIND_CLAW, { unit: u }));
                    } else {
                        await eventBus.emit(FX_SIGNALS.BANNER, { text: '☄️ 流星赶月！' });
                        await eventBus.emit(FX_SIGNALS.SPLASH_ARROWS, { attacker, primary, targets: splashTargets });
                        splashTargets.forEach((st, i) => { clock.wait(i * 60).then(() => AudioManager.playSfx(attacker.role || ROLE_TYPES.RANGED)); });
                        await clock.wait(600);
                    }
                }
            } else if (action.effectType === BUFF_EFFECT_TYPES.BONE_CLAW && attacker && target) {
                if (action.dmg && !GlobalStore.get('fastForwardActive')) {
                    eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: target, dmg: action.dmg });
                }
                // 2026-09-16 不再白等 600ms：日志每行 500ms 已与单爪动画同步，此处纯浪费
                eventBus.emit(FX_SIGNALS.BONE_CLAW, { attacker, target, opts: { isExecute: action.isExecute } });
            } else if (action.effectType === BUFF_EFFECT_TYPES.ATK_BUFF && target && action.gain) {
                // 加攻飘字比回血稍晚 200ms 冒出，形成"先回血、顿一下、再加攻"的层次
                await clock.wait(200);
                eventBus.emit(FX_SIGNALS.ATK_BUFF_FLOAT, { unit: target, gain: action.gain });
            } else if (action.effectType === BUFF_EFFECT_TYPES.XIN_HUN) {
                // 新婚：宋青书/周芷若爱心 + 扣血飘字
                const song = c.store ? c.store.getState().units.find(u => u.isSongQingshu) : null;
                const zhou = findUnitByUidLocal(c, action.targetUid);
                if (song) eventBus.emit(FX_SIGNALS.HEART_EFFECT, { unit: song });
                if (zhou) eventBus.emit(FX_SIGNALS.HEART_EFFECT, { unit: zhou });
                if (zhou && zhou.alive) eventBus.emit(FX_SIGNALS.PINK_FLASH, { unit: zhou });
                if (zhou && action.dmg && !GlobalStore.get('fastForwardActive')) {
                    eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: zhou, dmg: action.dmg });
                }
            }
        }
    },
    [STAGE_ACTION_TYPES.HP_PCT_DANMAKU]: {
        grid: 'none', log: 'sync', timing: 'afterText',
        fx: (c, action) => {
            const target = findUnitByUidLocal(c, action.targetUid);
            if (target && action.text && !GlobalStore.get('fastForwardActive')) {
                eventBus.emit(FX_SIGNALS.DANMAKU, { unit: target, text: action.text });
            }
        }
    }
};
