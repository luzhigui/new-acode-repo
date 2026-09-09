// V6.1.0 | ~2600 bytes | 2026-09-09 从 42player-core 拆出：buff 选择、蝶变方向弹窗（交互流程）
export const VER = 'player/49battle-flow.js V6.1.0';

import { CONFIG } from '../core/01config-5v5-test.js';
import { GlobalStore, getPlayerContext } from '../infra/54-global-store.js';
import { getBattleRng } from '../core/13battle-shared.js';
import { CAMP_TYPES, BUFF_TYPES } from '../infra/56-battle-enums.js';
import { appendLogHTML } from './47renderer.js';
import { showBuffPopup } from '../ui/70buff-dialog.js';

// buff 选择（第3回合倍数时调用），返回更新后的 nextActiveBuffs
export async function handleBuffSelection(c, nextActiveBuffs) {
    const mainCtx2 = getPlayerContext();
    const isFullAuto = mainCtx2 && mainCtx2.autoLevel === 'full-auto';
    appendLogHTML(`<span class="gold">✨ 请选择新的Buff（持续${CONFIG.BUFF_DURATION || 4}回合）</span><br>`);
    let newBuff = null;
    if (isFullAuto) {
        const allKeys = Object.keys(CONFIG.BUFFS);
        const existing = (nextActiveBuffs || []).map(b => b.key);
        const allyTeam = c.store.getState().units.filter(u => u.camp === CAMP_TYPES.ALLY && u.alive);
        const available = allKeys.filter(k => {
            if (existing.includes(k)) return false;
            const requiredRole = CONFIG.BUFF_ROLE_REQUIREMENTS?.[k];
            if (requiredRole && !allyTeam.some(u => u.alive && u.role === requiredRole)) return false;
            return true;
        });
        if (available.length > 0) {
            const rng = getBattleRng();
            const pick = available[rng.nextInt(0, available.length - 1)];
            const duration = CONFIG.BUFFS[pick].duration || CONFIG.BUFF_DURATION || 4;
            newBuff = { key: pick, target: CAMP_TYPES.ALLY, remaining: duration, name: CONFIG.BUFFS[pick].name };
            if (c.store) {
                const xiaoZhao = c.store.getState().units.find(u => u.isXiaoZhaoBrother && u.alive);
                if (xiaoZhao) {
                    if (!xiaoZhao.state._permanentBuffs) Object.assign(xiaoZhao.state, { _permanentBuffs: [] });
                    xiaoZhao.state._permanentBuffs.push({ ...newBuff, remaining: Infinity });
                }
            }
            if (pick === BUFF_TYPES.HOLY_FLAME) {
                newBuff.col = getBattleRng().nextInt(1, 3);
                newBuff.row = getBattleRng().nextInt(1, 3);
            }
        }
        appendLogHTML(`<span class="gold">🤖 自动选择Buff：${newBuff ? newBuff.name : '无'}</span><br>`);
    } else {
        c.isPaused = true;
        newBuff = await showBuffPopup(c);
    }
    if (newBuff) {
        nextActiveBuffs = [...(nextActiveBuffs || []), newBuff];
        appendLogHTML(`<span class="gold">✨ 获得Buff：${newBuff.name}（持续${newBuff.remaining}回合）</span><br>`);
        const mainCtx = getPlayerContext();
        if (mainCtx) {
            mainCtx.activeBuffs = nextActiveBuffs;
            if (mainCtx.updateBuffSlots) mainCtx.updateBuffSlots();
        }
    }
    c.isPaused = false;
    return nextActiveBuffs;
}

// 蝶变方向弹窗（回合结束后、下一回合开始前调用）
export async function handleFlyDirection(c, lastStep, currentRound) {
    const nextRound = currentRound + 1;
    if (GlobalStore.get('fastForwardActive') || nextRound % 3 !== 1 || !lastStep) return;
    const hasSister = lastStep.ally && lastStep.ally.some(u => u.isXiaoZhaoSister && u.alive);
    if (!hasSister) return;
    c.isPaused = true;
    const { showFlyDirectionPopup } = await import('../ui/65main-battle.js');
    const direction = await new Promise(resolve => { showFlyDirectionPopup(resolve); });
    if (!lastStep.ally._flyDirection) lastStep.ally._flyDirection = 'right';
    lastStep.ally._flyDirection = direction;
    c.isPaused = false;
}