// player/49battle-flow.js — 回合间流程（选 Buff / 联网双向选 / 蝶变方向 / 蓄意轰拳瞄准窗口）
// 全自动选 buff 的候选门槛必须与 modules/28 generateBuffChoices、tools 同口径：众志成城要求本阵营存活 <4 人。
// permanent:true 的海克斯（背水/圣火）duration 取 Infinity，整局持有不过期；显示文案为「整局」。
// V6.4.5 | 2026-10-29 | ~9.0 KB | 蓄意轰拳瞄准去掉联网限制（原 !netLinked 写死「联机不弹黑幕」）：
//        本函数只在房主的引擎主循环里被调（player/42 L147），从机不跑引擎、不会弹窗；形参 netLinked 一并删除
// V6.4.4 | 2026-10-28 | ~9.0 KB | handlePvpBuffSelection：六大派选卡补传「对方阵营(明教)存活」给
//        generateBuffChoices，修惑人心智恒被剔除
// V6.4.3 | 2026-10-19 | ~10600 bytes
export const VER = 'player/49battle-flow.js V6.4.5';

import { CONFIG } from '../core/01config-5v5-test.js';
import { GlobalStore, getPlayerContext } from '../infra/54-global-store.js';
import { getBattleRng, getStat } from '../core/13battle-shared.js';
import { CAMP_TYPES, BUFF_TYPES } from '../infra/56-battle-enums.js';
import { createBuffObject, buffsOfCamp, generateBuffChoices } from '../modules/28buff-tools.js';
import { appendLogHTML } from './47renderer.js';
import * as net from '../infra/60-net-pvp.js';
// 去反向依赖：player 层不再 import ui 层，弹窗经 GlobalStore UIHandler 通道调用
// （注册方见 ui/63main-state.js；对应 rules 原则 6：依赖方向 ui/fx → player → render/modules → core → infra）

const CAMP_LABEL = { [CAMP_TYPES.ALLY]: '明教', [CAMP_TYPES.ENEMY]: '六大派' };

// buff 选择（第3回合倍数时调用），返回更新后的 nextActiveBuffs
// camp 决定给谁选：单机固定明教；联网 PVP 下房主先给自己选、再代六大派发起
export async function handleBuffSelection(c, nextActiveBuffs, camp = CAMP_TYPES.ALLY) {
    const mainCtx2 = getPlayerContext();
    const isFullAuto = mainCtx2 && mainCtx2.autoLevel === 'full-auto';
    const label = CAMP_LABEL[camp] || '';
    appendLogHTML(`<span class="gold">✨ ${label}方请选择新的Buff</span><br>`);
    
    let newBuff = null;
    const showBuffPopup = GlobalStore.getUIHandler('showBuffPopup');
    if (typeof showBuffPopup === 'function') {
        // 统一走弹窗（战中），根据 isFullAuto 决定是否静默抽取
        newBuff = await showBuffPopup(c, camp, null, isFullAuto, true);
    }
    
    if (isFullAuto) {
        appendLogHTML(`<span class="gold">🤖 ${label}方自动选择Buff：${newBuff ? newBuff.name : '无'}</span><br>`);
    }
    
    if (newBuff) {
        nextActiveBuffs = [...(nextActiveBuffs || []), newBuff];
        appendLogHTML(`<span class="gold">✨ ${label}方获得Buff：${newBuff.name}（${newBuff.permanent ? '整局' : '持续' + newBuff.remaining + '回合'}）</span><br>`);
        const mainCtx = getPlayerContext();
        if (mainCtx) {
            mainCtx.activeBuffs = nextActiveBuffs;
            if (mainCtx.updateBuffSlots) mainCtx.updateBuffSlots();
        }
    }
    return nextActiveBuffs;
}

// 联网 PVP 阶段3：双方各选各的海克斯（房主权威）。
// 房主先用引擎 RNG 算好六大派选项下发（选项单源，双方看到同一批），
// 再并发「本地弹窗选明教」+「等从机回传 buffPick」，最后把两条合并进 activeBuffs。
export async function handlePvpBuffSelection(c, nextActiveBuffs) {
    const duration = CONFIG.BUFF_DURATION || 4;
    const enemyTeam = c.store
        ? c.store.getState().units.filter(u => u.camp === CAMP_TYPES.ENEMY && u.alive)
        : ((c.UI && c.UI.enemyTeam) || []);
    // 六大派选卡时「对方阵营」是明教：28 的惑人心智门槛要它，不传等于恒剔除该项
    const allyTeam = c.store
        ? c.store.getState().units.filter(u => u.camp === CAMP_TYPES.ALLY && u.alive)
        : ((c.UI && c.UI.allyTeam) || []);
    const enemyChoices = generateBuffChoices(buffsOfCamp(nextActiveBuffs, CAMP_TYPES.ENEMY), enemyTeam, getBattleRng(), allyTeam);
    appendLogHTML(`<span class="gold">✨ 双方请选择新的Buff（持续${duration}回合）</span><br>`);
    net.sendBuffAsk(enemyChoices, duration);

    c.isPaused = true;
    const showBuffPopup = GlobalStore.getUIHandler('showBuffPopup');
    const [allyBuff, pickMsg] = await Promise.all([
        typeof showBuffPopup === 'function' ? showBuffPopup(c, CAMP_TYPES.ALLY) : Promise.resolve(null),
        net.waitForMsg('buffPick')
    ]);
    c.isPaused = false;

    let merged = nextActiveBuffs || [];
    if (allyBuff) {
        merged = [...merged, allyBuff];
        appendLogHTML(`<span class="gold">✨ ${CAMP_LABEL[CAMP_TYPES.ALLY]}方获得Buff：${allyBuff.name}（${allyBuff.permanent ? '整局' : '持续' + allyBuff.remaining + '回合'}）</span><br>`);
    }
    const pickKey = pickMsg && pickMsg.key;
    if (pickKey && CONFIG.BUFFS[pickKey]) {
        const enemyBuff = createBuffObject(pickKey, null, CAMP_TYPES.ENEMY, enemyTeam);
        merged = [...merged, enemyBuff];
        appendLogHTML(`<span class="gold">✨ ${CAMP_LABEL[CAMP_TYPES.ENEMY]}方获得Buff：${enemyBuff.name}（${enemyBuff.permanent ? '整局' : '持续' + enemyBuff.remaining + '回合'}）</span><br>`);
    }
    const mainCtx = getPlayerContext();
    if (mainCtx) {
        mainCtx.activeBuffs = merged;
        if (mainCtx.updateBuffSlots) mainCtx.updateBuffSlots();
    }
    return merged;
}

// 蝶变方向弹窗（回合结束后、下一回合开始前调用）
export async function handleFlyDirection(c, lastStep, currentRound) {
    const nextRound = currentRound + 1;
    if (GlobalStore.get('fastForwardActive') || nextRound % 3 !== 1 || !lastStep) return;
    const hasSister = lastStep.ally && lastStep.ally.some(u => u.isXiaoZhaoSister && u.alive);
    if (!hasSister) return;
    c.isPaused = true;
    const showFlyDirectionPopup = GlobalStore.getUIHandler('showFlyDirectionPopup');
    const direction = typeof showFlyDirectionPopup === 'function'
        ? await new Promise(resolve => { showFlyDirectionPopup(resolve); })
        : 'left';
    if (!lastStep.ally._flyDirection) lastStep.ally._flyDirection = 'left';
    lastStep.ally._flyDirection = direction;
    c.isPaused = false;
}

// 蓄意轰拳瞄准窗口。
//   旧版两个病根一并修掉：①华丽开关误读 c.dodgeEffectEnabled（不存在，恒 undefined）→ 改 GlobalStore.get；
//   ②旧钩子搜 battleState（上一回合的旧克隆，_hlsCharging 停在 1）→ 弹窗永不触发 → 改搜 step.ally/enemy
//   （本回合克隆，与引擎 generator 的 A/B 同引用——写入直达随后的 ON_ROUND_END 结算）。
//   只在「华丽模式 + 玩家操控明教侧 + 非全自动/快进」弹黑幕；联网不再排除——只有房主跑引擎才进本函数，
//   从机只播 step，瞄准结果随房主的 step 下发。其余一概跳过，引擎随机前排兜底。
export async function handleHanlisaAimWindow(c, step) {
    try {
        if (!step || !step.hanlisaAimWindow) return;
        const pool = [...(step.ally || []), ...(step.enemy || [])];
        const hls = pool.find(u => u && u.isHanLiSa && u.alive && u.state && u.state._hlsCharging === 2);
        if (!hls) return;
        const interactive = hls.camp === CAMP_TYPES.ALLY
            && !!GlobalStore.get('fxHanlisaAim')
            && !GlobalStore.get('fastForwardActive')
            && c.autoLevel !== 'full-auto'
            && GlobalStore.get('autoLevel') !== 'full-auto';
        if (!interactive) return; // 引擎侧结算自动随机前排（modules/27 兜底）
        const showAim = GlobalStore.getUIHandler('showHanlisaAim');
        if (typeof showAim !== 'function') return; // UI 未挂（异常环境）→ 引擎兜底
        // V3（demo 舞台照搬）：传敌我双方真值（卡面攻防血/血条 + 施术者格），图标/分档色由 ui/79 从战场活格现查
        const enemyTeam = hls.camp === CAMP_TYPES.ALLY ? step.enemy : step.ally;
        const allyTeam = hls.camp === CAMP_TYPES.ALLY ? step.ally : step.enemy;
        const mk = (u) => ({ pos: u.pos, hp: u.hp, maxHp: u.maxHp, name: u.name, atk: Math.round(getStat(u, 'atk')), def: Math.round(getStat(u, 'def')) });
        const enemies = (enemyTeam || []).filter(u => u && u.alive && u.pos >= 1 && u.pos <= 9).map(mk);
        const allies = (allyTeam || []).filter(u => u && u.alive && u.pos >= 1 && u.pos <= 9).map(mk);
        const choice = await new Promise(resolve => { showAim(c, hls, { enemies, allies }, resolve); });
        if (choice && typeof choice === 'object') {
            hls.state._hlsAimChosen = true;
            hls.state._hlsAim = Math.min(9, Math.max(0, choice.aim | 0));
            hls.state._hlsAimHoldMs = Math.max(0, choice.holdMs | 0);
        }
    } catch (e) {
        console.warn('[蓄意轰拳] 瞄准窗口异常，走引擎自动兜底', e);
    }
}