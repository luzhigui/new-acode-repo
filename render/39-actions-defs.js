// render/39-actions-defs.js — 舞台动作演出定义（演出域）
// V1.5.7 | 2026-10-22 | ~33000 bytes
//
// 加新 stageAction：在本文件 STAGE_ACTION_DEFS 加一条（键=STAGE_ACTION_TYPES.xxx），
// 并在 infra/56 的 STAGE_ACTION_TYPES 登记。
import { clock } from '../infra/52-clock.js';
import { eventBus } from '../infra/50-event-bus.js';
import { FX_SIGNALS } from '../infra/55-fx-signals.js';
import { GlobalStore } from '../infra/54-global-store.js';
// markGridShake 从它的真身模块直取（不走 32-grid-render 全链，避开 37/90 依赖链——任务书坑1的稳妥解）
import { markGridShake } from './32grid-cells.js';
import { getSkillParams } from '../core/01config-5v5-test.js';
import { AudioManager } from '../modules/22audio-manager.js';
import { STAGE_ACTION_TYPES, STORE_ACTION_TYPES, UNIT_EVENT_TYPES, ROLE_TYPES, BUFF_EFFECT_TYPES, BUFF_SUBTYPES, FLY_MODE_TYPES } from '../infra/56-battle-enums.js';
export const VER = 'render/39-actions-defs.js V1.7.2';   // V1.7.2 IMMUNE 破罩演出改不 await 并行加载（真机首载阻塞实锤）

// 被动出手徽章文案（ATTACK/MISS/DODGE 三处出手帧共用）。reason 由 core/10 runExtraAttackRequests
//   写进 state._linkReason → core/12 attack fact → render/38 透传 → 此处按 reason 出头顶飘字。
const LINK_FX_TEXT = {
    counterAttack: '⚔️反击！', followAttack: '👣跟随', lionFollow: '🦁随动',
    xuanmingLink: '☯️联动', chaseAttack: '⚡追击',
    doubleStrike: '⚡连击！', bloodthirst: '🗡️嗜血！', xiaoZhaoDoubleMiss: '🕷️双击！'
};

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
            // 被动出手徽章：反击/跟随/随动/联动/追击出手前头顶飘字，一眼区分普攻。
            //   联动类先飘再等 1400ms（等待期正好展示）；追击等非联动类让开灭绝计数飘字 300ms 再飘
            if (attacker && action.linkReason && LINK_FX_TEXT[action.linkReason]) {
                const badge = { unit: attacker, text: LINK_FX_TEXT[action.linkReason] };
                if (action.isLinkAttack) eventBus.emit(FX_SIGNALS.SKILL_FLOAT, badge);
                else clock.wait(300).then(() => eventBus.emit(FX_SIGNALS.SKILL_FLOAT, badge));
            }
            // 联动攻击必须等主攻动画播完再起手（emit 同步不发 Promise，需显式等待）
            if (action.isLinkAttack && attacker && target && action.attackerRole) {
                await clock.wait(1400);
            }
            // 灭绝师太出手计数（壹/貳/參）：锚在她真正出手的这一帧之前（生成步 emit 会抢在画面前）。
            if (attacker && action.miejueCountText) {
                eventBus.emit(FX_SIGNALS.MIEJUE_COUNT, { unit: attacker, text: action.miejueCountText });
            }
            // 胖远桥·正义国字脸：朝对手张开的扇形金锥 + 「你过来啊！～」气泡 + 全体被嘲讽者红闪😤，
            //   锚在出手帧（标记由 modules/26 写进本击 fact，生成步不发，否则特效会抢在画面前）
            if (attacker && action.pangTaunt && !GlobalStore.get('fastForwardActive')) {
                const foes = (c.store ? c.store.getState().units : [])
                    .filter(u => u.camp !== attacker.camp && u.alive && !u.isHorse);
                eventBus.emit(FX_SIGNALS.PANG_TAUNT, { unit: attacker, foes });
            }
            // 胖远桥·年轻气盛（打歪）：出手前上半身侧倾甩歪 + 😵
            if (attacker && action.pangClumsy && !GlobalStore.get('fastForwardActive')) {
                eventBus.emit(FX_SIGNALS.PANG_CLUMSY, { unit: attacker });
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
                    attackerRole: action.attackerRole,
                    markBurst: action.markBurst === true
                });
            }
            // 雄狮振奋：狮吼 + 全体「+2 攻」飘字，锚在雄狮真正出手的这一帧（随动出手同样是雄狮命中，照发）。
            //   生成步 emit 会抢在画面前（随动出手演出被延后 1400ms、苦练 1200ms）。
            if (attacker && attacker.isLionMale && action.dmg > 0 && !GlobalStore.get('fastForwardActive')) {
                const team = (c.store ? c.store.getState().units : []).filter(u => u.camp === attacker.camp && u.alive);
                eventBus.emit(FX_SIGNALS.LION_ROAR, { unit: attacker, team });
                const gain = getSkillParams('金毛狮王谢逊', 'lionInspire')?.atkPerHit ?? 0;
                if (gain > 0) {
                    // 逐个错帧冒出「+N」，形成一层自雄狮向外扩散的涟漪
                    team.forEach((m, i) => clock.wait(i * 90).then(() => eventBus.emit(FX_SIGNALS.ATK_BUFF_FLOAT, { unit: m, gain })));
                }
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
                // 简单模式无子弹时间，立即显示眩晕（控制免疫单位不置灰）
                if (!c.dodgeEffectEnabled && action.stunned !== false) {
                    c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: action.actorUid, _stunned: true });
                }
            }
            if (action.dead && action.actorUid && pendingDeaths) pendingDeaths.push(action.actorUid);
        },
        fx: async (c, action) => {
            const attacker = findUnitByUidLocal(c, action.actorUid);
            const dodger = findUnitByUidLocal(c, action.targetUid);
            // 苦练蓄力特效：被闪避（含闪避反击）同样算宋青书本回合出手（DODGE fact 带 isKuLianAttack）
            if (action.isKuLianAttack && attacker) {
                const team = c.store.getState().units.filter(u => u.camp === attacker.camp);
                eventBus.emit(FX_SIGNALS.KULIAN, { unit: attacker, team });
                await clock.wait(1200);
            }
            // 被动出手徽章：反击/跟随被闪避也认得出（锚在攻击者头顶）
            if (attacker && action.linkReason) {
                const t = LINK_FX_TEXT[action.linkReason];
                if (t) clock.wait(300).then(() => eventBus.emit(FX_SIGNALS.SKILL_FLOAT, { unit: attacker, text: t }));
            }
            // 简单模式：等冲撞演出（飞 700 + 回弹 900 = 1600ms）撤走克隆体后再发掉血飘字，
            //   否则被 z-index 99999 的克隆体压在攻击者格内看不见。华丽模式维持原帧。
            const emitReboundFloat = () => {
                if (attacker && action.reboundDmg && !GlobalStore.get('fastForwardActive')) {
                    eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: attacker, dmg: action.reboundDmg });
                }
            };
            if (c.dodgeEffectEnabled) emitReboundFloat();
            // 华丽模式：子弹时间；简单模式：气泡
            if (c.dodgeEffectEnabled && attacker && dodger) {
                await eventBus.emit(FX_SIGNALS.CRITICAL_BANNER, { text: '✨闪避反击✨' });
                // 必须直接 await，不能走 eventBus（emit 同步不等待 Promise），否则动画并行战斗推进会踩踏
                const { showDodgeBulletTime } = await import('../fx/85fx-dodge-bullet.js');
                await showDodgeBulletTime(attacker, dodger, action.reboundDmg || 0);
            } else if (attacker) {
                eventBus.emit(FX_SIGNALS.DODGE_BUBBLE, { unit: attacker, text: '闪避！' });
                // 简单模式闪避反击：补发 TRIGGER 给 fx/88 —— 远程与近战同款「冲过去被挡回」，
                //   不再按攻击者职业分派（原先远程会演成"箭射偏"，读作未命中，不是闪避）。
                if (dodger) {
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
                // 简单模式：等冲撞演出（飞 700 + 回弹 900 = 1600ms）撤走克隆体后再发掉血飘字，
                //   否则被 z-index 99999 的克隆体压在攻击者格内看不见
                clock.wait(1600).then(emitReboundFloat);
            }
            // 韦一笑闪避反击吸血：补吸血弹幕。华丽模式的子弹时间飘字会被黑幕盖住，所以放在整段演出之后发
            if (dodger && action.weiHeal && action.weiHeal.heal > 0) {
                eventBus.emit(FX_SIGNALS.HEAL_FLOAT, { unit: dodger, amount: action.weiHeal.heal });
            }
        }
    },
    [STAGE_ACTION_TYPES.POS_SWAP]: {
        grid: 'sync', log: 'sync', timing: 'beforeText',
        // 位置由 fx/83 动画落定后自 dispatch POS_CHANGE（store 先改位置 = 格子瞬移后才播动画，特效纯属重播）。
        fx: async (c, action) => {
            const unitA = findUnitByUidLocal(c, action.actorUid);
            const unitB = findUnitByUidLocal(c, action.targetUid);
            if (unitA && unitB) {
                const { animatePositionSwap } = await import('../fx/87fx-manager.js');
                await animatePositionSwap(unitA, unitB, c, {
                    oldPositions: (action.oldPosA != null && action.oldPosB != null) ? [action.oldPosA, action.oldPosB] : null,
                    connectLine: action.connectLine === true   // 红血两仪互换：走「连线→互换」专属演出
                });
            }
        }
    },
    [STAGE_ACTION_TYPES.PUSH]: {
        grid: 'sync', log: 'sync', timing: 'beforeText',
        // 位置变更交给 fx 内的动画收尾（store 先改 = 格子瞬移后才播拱动画）
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
    // 雄鹰·恢复行动力（modules/27elite-mingjiao-eagle 报幕 → render/38 翻出）：引擎只写账本 pick.state._acted=false，
    //   UI 判灰是「账本 _acted」或「视图镜像 _renderActed」双路取或——镜像残留仍判灰。此处按 uid 双清。
    [STAGE_ACTION_TYPES.RESTORE_ACTED]: {
        grid: 'sync', log: 'sync', timing: 'afterText',
        store: (c, action) => {
            if (c.store && action.actorUid) {
                c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: action.actorUid, _acted: false, _renderActed: null });
            }
        }
    },
    [STAGE_ACTION_TYPES.DESTROY]: {
        grid: 'sync', log: 'sync', timing: 'afterText',
        // 消散与死亡分家：引擎侧消散的马已从队伍直接移除（core/05 不设 _isDead），此处补双轨——
        //   store 立即摘格子（REMOVE_UNIT + _removedUids 防 syncStoreFromStep 灌回），fx 发「沙化消散」；
        //   被打死路径仍走 ATTACK dead 的死亡管线。
        store: (c, action, pendingDeaths) => {
            if (action.success && action.actorUid) {
                if (c._removedUids) c._removedUids.add(action.actorUid);
                if (c.store) c.store.dispatch({ type: STORE_ACTION_TYPES.REMOVE_UNIT, uid: action.actorUid });
            }
        },
        fx: async (c, action) => {
            if (action.success && action.actorUid) {
                const unit = findUnitByUidLocal(c, action.actorUid);
                if (unit && !GlobalStore.get('fastForwardActive')) {
                    eventBus.emit(FX_SIGNALS.HORSE_DISSOLVE, { unit });
                }
                await eventBus.emit(FX_SIGNALS.BANNER, { text: '🐴 拒马化沙消散' });
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
        // fx 必须 await emit（emit 汇聚异步监听器的 Promise）——同步发射即走会让主线不等演出完就继续，
        //   与独立时间线的缩放动画叠出「缩小→变大→顿一下才继续」。
        fx: async (c, action) => {
            const unit = findUnitByUidLocal(c, action.actorUid);
            if (!unit) return;
            // 特效按 originalFactType 区分
            if (action.originalFactType === FLY_MODE_TYPES.BUTTERFLY_ATTACH) {
                const host = findUnitByUidLocal(c, action.hostUid);
                if (host) await eventBus.emit(FX_SIGNALS.BUTTERFLY_FLY_OUT, { sister: unit, host });
            } else if (action.originalFactType === FLY_MODE_TYPES.BUTTERFLY_RETURN) {
                const host = findUnitByUidLocal(c, action.hostUid);
                if (host) await eventBus.emit(FX_SIGNALS.BUTTERFLY_FLY_BACK, { host, sister: unit });
            } else if (action.originalFactType === FLY_MODE_TYPES.SPIDER_FLY) {
                await eventBus.emit(FX_SIGNALS.SPIDER_ASCEND, { unit });
            } else if (action.originalFactType === FLY_MODE_TYPES.SPIDER_RETURN) {
                await eventBus.emit(FX_SIGNALS.SPIDER_DESCEND, { unit });
            }
        },
        // 演出收尾即交棒占位格：起飞/附身写 _renderFlyMode（纯渲染态，fx/82·85 同口径），render/32 紧接着重绘 🦋/🕷️ 占位；
        //   返程/宿亡/无宿/飞免等其余 FLY_MODE 一律清标记，回退 state._flyMode 权威源。fx/86 不再自愈格子样式（状态源唯一）。
        storeAfter: (c, action) => {
            if (!c.store || !action.actorUid) return;
            const flyVal = action.originalFactType === FLY_MODE_TYPES.BUTTERFLY_ATTACH ? 'butterfly'
                : action.originalFactType === FLY_MODE_TYPES.SPIDER_FLY ? 'spider' : null;
            c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: action.actorUid, _renderFlyMode: flyVal });
        }
    },
    [STAGE_ACTION_TYPES.ROUND_START]: {
        grid: 'sync', log: 'sync', timing: 'beforeText',
        store: (c, action, pendingDeaths) => {
            c.store.getState().units.forEach(u => {
                // 镜像同清：_renderActed 由 fx 动画起跳写 true（立即变灰），其余收尾只写 true 不清 null，
                //   仅扑空/子弹时间两路会写 null → 镜像跨回合残留，render/32 判灰双路取或把未行动单位判成已行动（非绿）。
                //   回合开始=人人未行动，随账本一并归零。
                if (u.alive) c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: u.uid, _acted: false, _renderActed: null });
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
            // 苦练蓄力特效：打空也算宋青书本回合出手（MISS fact 带 isKuLianAttack），💪 不能因命中判定 skipped 而整段消失；
            //   节奏与 ATTACK 一致（先蓄力 1200ms 再演出）
            if (action.isKuLianAttack && attacker) {
                const team = c.store.getState().units.filter(u => u.camp === attacker.camp);
                eventBus.emit(FX_SIGNALS.KULIAN, { unit: attacker, team });
                await clock.wait(1200);
            }
            // 被动出手徽章：反击/跟随打空也认得出（锚在攻击者头顶）
            if (attacker && action.linkReason) {
                const t = LINK_FX_TEXT[action.linkReason];
                if (t) clock.wait(300).then(() => eventBus.emit(FX_SIGNALS.SKILL_FLOAT, { unit: attacker, text: t }));
            }
            if (attacker && !GlobalStore.get('fastForwardActive')) {
                // 近战/飞行 → 飞撞（撞到一半弹气泡）；远程 → 射偏箭（箭飞到一半偏出去）。
                // 两者都由 88 的 _triggerFX 按 attackerRole 分派，此处只需把信号发出去。
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
    [STAGE_ACTION_TYPES.IMMUNE]: {
        grid: 'none', log: 'sync',
        // 函数式：动作自带 timing 优先（溅射破罩要 afterText，跟箭雨同步）；不带的维持 beforeText 原行为
        timing: (action) => (action && action.timing) || 'beforeText',
        fx: async (c, action) => {
            if (GlobalStore.get('fastForwardActive')) return;
            // 金刚不坏：飞撞照常，撞上瞬间罩子碎裂（不飘伤害、不闪红——免疫分支本就走不到受击特效）
            if (action.reason && action.reason.indexOf('金刚不坏') >= 0) {
                const target = findUnitByUidLocal(c, action.targetUid);
                if (!target) return;
                // 真机实锤（2026-10-23 手机端）：首次 await import 在慢网络下阻塞播放主循环——「卡一下才继续」。
                //   所以这里一律不 await：双模块并行加载，加载完再播；首载期间碎裂晚一拍可接受，卡场不可接受
                if (action.splashBreak) {
                    // 溅射破罩：箭雨演出已由 fx/81 播完（同组 afterText），只补碎裂不叠飞撞
                    import('../fx/95-immune-shield-break.js').then((m) => {
                        m.showImmuneShieldBreak(target);
                        markGridShake(target.uid, 160);
                    }).catch(() => {});
                    return;
                }
                const attacker = findUnitByUidLocal(c, action.actorUid);
                if (!attacker) return;
                Promise.all([
                    import('../fx/82fx-crash-5v5-test.js'),
                    import('../fx/95-immune-shield-break.js')
                ]).then(([crash, shield]) => {
                    crash.showMeleeCrash(attacker, target, () => {
                        shield.showImmuneShieldBreak(target);
                        markGridShake(target.uid, 160);
                    });
                }).catch(() => {});
            }
            // 飞天（flyData）走 core/10 原有分支：文本由 render/34 的 SPIDER_FLY 渲染，特效由飞行态 stageAction 负责
        }
    },
    [STAGE_ACTION_TYPES.STAT_CHANGE]: {
        grid: 'sync', log: 'sync',
        // 函数式：action 可自带 timing 覆盖（破防=beforeText，赶在箭矢/💥 前）；不带的维持 afterText 原行为
        timing: (action) => (action && action.timing) || 'afterText',
        // 生生不息攻防二选一加成飘字：atk=橙⚔左上、def=钢蓝🛡右上
        fx: (c, action) => {
            if (GlobalStore.get('fastForwardActive')) return;
            const unit = findUnitByUidLocal(c, action.targetUid);
            if (!unit || !action.gain) return;
            if (action.statKind === 'atk') eventBus.emit(FX_SIGNALS.ATK_BUFF_FLOAT, { unit, gain: action.gain });
            else if (action.statKind === 'def') eventBus.emit(FX_SIGNALS.DEF_BUFF_FLOAT, { unit, gain: action.gain });
        }
    },
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
    [STAGE_ACTION_TYPES.DAMAGE_FLOAT]: {
        // 纯掉血飘字：用于「伤害已由裁定器实扣、但没有自己的攻击演出动作」的场景（流星赶月 40% 加深）。
        // grid/log 都不碰——战报文本由原 fact 渲染行负责，这里只在头顶补一个 💥-N。
        grid: 'none', log: 'sync', timing: 'afterText',
        fx: (c, action) => {
            if (GlobalStore.get('fastForwardActive')) return;
            const unit = findUnitByUidLocal(c, action.targetUid);
            if (unit && action.dmg > 0) eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit, dmg: action.dmg });
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
                        splashTargets.forEach(u => {
                            eventBus.emit(FX_SIGNALS.WIND_CLAW, { unit: u });
                            // 乘风溅射掉血飘字：伤害 core/16 SPLASH 已实扣，与流星同口径；乘风不延时，同帧飘
                            if (u.alive && !GlobalStore.get('fastForwardActive')) eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: u, dmg: action.splashDmg });
                            // 溅射减防（乘风配置无 defReduce 时为 null，不飘）
                            if (u.alive && action.splashDefReduce > 0 && !GlobalStore.get('fastForwardActive')) eventBus.emit(FX_SIGNALS.DEF_BUFF_FLOAT, { unit: u, gain: -action.splashDefReduce });
                        });
                    } else {
                        await eventBus.emit(FX_SIGNALS.BANNER, { text: '☄️ 流星赶月！' });
                        await eventBus.emit(FX_SIGNALS.SPLASH_ARROWS, { attacker, primary, targets: splashTargets });
                        splashTargets.forEach((st, i) => {
                            clock.wait(i * 60).then(() => AudioManager.playSfx(attacker.role || ROLE_TYPES.RANGED));
                            // 溅射掉血飘字：伤害 core/16 SPLASH 已实扣。随箭矢节奏错层飘；播放时已死的不飘。
                            if (st.alive) clock.wait(600 + i * 80).then(() => {
                                if (GlobalStore.get('fastForwardActive')) return;
                                eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: st, dmg: action.splashDmg });
                                // 溅射减防🛡与掉血💥同帧：右上镜像位 vs 右侧，天然错开不重叠
                                if (action.splashDefReduce > 0) eventBus.emit(FX_SIGNALS.DEF_BUFF_FLOAT, { unit: st, gain: -action.splashDefReduce });
                            });
                        });
                        await clock.wait(600);
                    }
                }
            } else if (action.effectType === BUFF_EFFECT_TYPES.BONE_CLAW && attacker && target) {
                if (action.dmg && !GlobalStore.get('fastForwardActive')) {
                    eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: target, dmg: action.dmg });
                }
                // 日志每行 500ms 已与单爪动画同步，此处不再白等 600ms
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
    },
    [STAGE_ACTION_TYPES.SKILL_FLOAT]: {
        // 何太冲技能任意文本头顶飘字（破甲箭🛡-N% 飘目标格 / 昆仑合击🎯×N 飘何太冲格）：
        //   fx/89 复用「灭绝计数」的任意文本头顶上飘通道（showMiejueCountFloat），不另造字形。
        grid: 'none', log: 'sync', timing: 'afterText',
        fx: (c, action) => {
            if (GlobalStore.get('fastForwardActive')) return;
            const unit = findUnitByUidLocal(c, action.targetUid);
            if (unit && action.text) eventBus.emit(FX_SIGNALS.SKILL_FLOAT, { unit, text: action.text });
        }
    },
    // 唐文亮冲刺：纯装饰演出（引擎侧位置已由 doDash 经 moveUnitPosition 落定，POS_CHANGE/STATE_CHANGE
    //   事件走 core/13 既有链，这里不碰位置数据）。多人版：遍历 moves 全部 uid 设/清 fly。
    [STAGE_ACTION_TYPES.DASH]: {
        grid: 'none', log: 'sync', timing: 'beforeText',
        // 演出顺序（老板口径 2026-10-23）：①先把位置写进 store（供克隆体取终点格内容）→
        //   ②再设 fly 让终点格隐身 → fx 播克隆体从旧格飞向新格 → storeAfter 清 fly 显格。
        //   此前只设 fly 不写位置：makeGhost 取终点格是空壳、返回 null，整个动画跳过，
        //   位置更新延后到 step 末尾 → 表现为「先攻击后瞬移」（老板实机指出的病根）。
        store: (c, action) => {
            if (!c.store || !action.dash) return;
            const moves = (Array.isArray(action.dash.moves) && action.dash.moves.length > 0)
                ? action.dash.moves
                : [
                    action.dash.fromUid != null ? { uid: action.dash.fromUid, to: action.dash.toPos } : null,
                    action.dash.targetUid != null ? { uid: action.dash.targetUid, to: action.dash.targetToPos } : null
                ].filter(Boolean);
            if (moves.length === 0) return;
            // ① 先把位置写进 store（APPLY_EVENTS 走 reducer 正规通道）
            const events = moves
                .filter(m => m.uid != null && m.to != null && m.to !== undefined)
                .map(m => ({ eventType: UNIT_EVENT_TYPES.POS_CHANGE, uid: m.uid, pos: m.to }));
            if (events.length > 0) c.store.dispatch({ type: STORE_ACTION_TYPES.APPLY_EVENTS, events });
            // ② 再让新位置格隐身（等 storeAfter 清 fly 让真格显出来）
            for (const m of moves) if (m.uid != null) c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: m.uid, _renderFlyMode: 'fly' });
        },
        storeAfter: (c, action) => {
            if (!c.store || !action.dash) return;
            const ids = (Array.isArray(action.dash.moves) && action.dash.moves.length > 0)
                ? action.dash.moves.map(m => m.uid)
                : [action.dash.fromUid, action.dash.targetUid];
            for (const uid of ids) if (uid != null) c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid, _renderFlyMode: null });
            // 交棒顺序（fx/82 口径）：先清 fly 让真格子显出来（在克隆体下面），克隆体随后才淡出——
            //   顺序反了会出现「旧格闪回一帧」
            if (action._dashGhosts && action._dashGhosts.length > 0) {
                import('../fx/94-tangwenliang-dash.js').then(m => m.fadeOutDashGhosts(action._dashGhosts)).catch(() => {});
            }
        },
        fx: async (c, action) => {
            if (GlobalStore.get('fastForwardActive')) return;
            if (!action.dash) return;
            const fx94 = await import('../fx/94-tangwenliang-dash.js');
            // 克隆体引用交给 storeAfter：落定 → storeAfter 清 fly 显格 → 克隆体才淡出
            action._dashGhosts = await fx94.showTangWenLiangDash(action.dash);
        }
    },
    [STAGE_ACTION_TYPES.HANLISA_BURST]: {
        // 蓄意轰拳爆发（回放/从机补触发通道）：主机单机由 modules/27 引擎直发同一信号，
        //   fx/93 按 seq 去重取先到者——此处只为战报回放/联机从机补上同款演出。
        //   载荷全 uid+数值（可序列化），fx/93 内部自查 DOM。
        grid: 'sync', log: 'sync', timing: 'afterText',
        fx: (c, action) => {
            if (GlobalStore.get('fastForwardActive')) return;
            if (action.hlsBurst) eventBus.emit(FX_SIGNALS.HANLISA_BURST, action.hlsBurst);
        }
    }
};
