// V6.3.0 | ~6700 bytes | 2026-09-19 联网PVP阶段3：handlePvpBuffSelection 房主统一发选项、双方各选后合并
// V6.2.0 | ~3400 bytes | 2026-09-19 联网PVP：handleBuffSelection 加 camp 参数，按阵营取队伍与已有 buff
export const VER = 'player/49battle-flow.js V6.3.0';

import { CONFIG } from '../core/01config-5v5-test.js';
import { GlobalStore, getPlayerContext } from '../infra/54-global-store.js';
import { getBattleRng } from '../core/13battle-shared.js';
import { CAMP_TYPES, BUFF_TYPES } from '../infra/56-battle-enums.js';
import { createBuffObject, buffsOfCamp, generateBuffChoices } from '../modules/28buff-tools.js';
import { appendLogHTML } from './47renderer.js';
import * as net from '../infra/60-net-pvp.js';
// 2026-09-14 去反向依赖：player 层不再 import ui 层，弹窗经 GlobalStore UIHandler 通道调用
// （注册方见 ui/63main-state.js；对应 rules 原则 6：依赖方向 ui/fx → player → render/modules → core → infra）

const CAMP_LABEL = { [CAMP_TYPES.ALLY]: '明教', [CAMP_TYPES.ENEMY]: '六大派' };

// buff 选择（第3回合倍数时调用），返回更新后的 nextActiveBuffs
// camp 决定给谁选：单机固定明教；联网 PVP 下房主先给自己选、再代六大派发起
export async function handleBuffSelection(c, nextActiveBuffs, camp = CAMP_TYPES.ALLY) {
    const mainCtx2 = getPlayerContext();
    const isFullAuto = mainCtx2 && mainCtx2.autoLevel === 'full-auto';
    const label = CAMP_LABEL[camp] || '';
    appendLogHTML(`<span class="gold">✨ ${label}方请选择新的Buff（持续${CONFIG.BUFF_DURATION || 4}回合）</span><br>`);
    let newBuff = null;
    if (isFullAuto) {
        const allKeys = Object.keys(CONFIG.BUFFS);
        const existing = buffsOfCamp(nextActiveBuffs, camp).map(b => b.key);
        const team = c.store.getState().units.filter(u => u.camp === camp && u.alive);
        const available = allKeys.filter(k => {
            if (existing.includes(k)) return false;
            const requiredRole = CONFIG.BUFF_ROLE_REQUIREMENTS?.[k];
            if (requiredRole && !team.some(u => u.alive && u.role === requiredRole)) return false;
            return true;
        });
        if (available.length > 0) {
            const rng = getBattleRng();
            const pick = available[rng.nextInt(0, available.length - 1)];
            const duration = CONFIG.BUFFS[pick].duration || CONFIG.BUFF_DURATION || 4;
            newBuff = createBuffObject(pick, duration, camp);
            // 小昭·妹永久海克斯仅明教适用
            if (camp === CAMP_TYPES.ALLY && c.store) {
                const xiaoZhao = c.store.getState().units.find(u => u.isXiaoZhaoBrother && u.alive);
                if (xiaoZhao) {
                    if (!xiaoZhao.state._permanentBuffs) Object.assign(xiaoZhao.state, { _permanentBuffs: [] });
                    xiaoZhao.state._permanentBuffs.push({ ...newBuff, remaining: Infinity });
                }
            }
        }
        appendLogHTML(`<span class="gold">🤖 ${label}方自动选择Buff：${newBuff ? newBuff.name : '无'}</span><br>`);
    } else {
        c.isPaused = true;
        const showBuffPopup = GlobalStore.getUIHandler('showBuffPopup');
        newBuff = typeof showBuffPopup === 'function' ? await showBuffPopup(c, camp) : null;
    }
    if (newBuff) {
        nextActiveBuffs = [...(nextActiveBuffs || []), newBuff];
        appendLogHTML(`<span class="gold">✨ ${label}方获得Buff：${newBuff.name}（持续${newBuff.remaining}回合）</span><br>`);
        const mainCtx = getPlayerContext();
        if (mainCtx) {
            mainCtx.activeBuffs = nextActiveBuffs;
            if (mainCtx.updateBuffSlots) mainCtx.updateBuffSlots();
        }
    }
    c.isPaused = false;
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
    const enemyChoices = generateBuffChoices(buffsOfCamp(nextActiveBuffs, CAMP_TYPES.ENEMY), enemyTeam, getBattleRng());
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
        appendLogHTML(`<span class="gold">✨ ${CAMP_LABEL[CAMP_TYPES.ALLY]}方获得Buff：${allyBuff.name}（持续${allyBuff.remaining}回合）</span><br>`);
    }
    const pickKey = pickMsg && pickMsg.key;
    if (pickKey && CONFIG.BUFFS[pickKey]) {
        const enemyBuff = createBuffObject(pickKey, duration, CAMP_TYPES.ENEMY);
        merged = [...merged, enemyBuff];
        appendLogHTML(`<span class="gold">✨ ${CAMP_LABEL[CAMP_TYPES.ENEMY]}方获得Buff：${enemyBuff.name}（持续${enemyBuff.remaining}回合）</span><br>`);
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
        : 'right';
    if (!lastStep.ally._flyDirection) lastStep.ally._flyDirection = 'right';
    lastStep.ally._flyDirection = direction;
    c.isPaused = false;
}