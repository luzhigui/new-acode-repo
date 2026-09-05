// V5.5.1 | 2026-08-19 import 路径合并至 infra/51
export const VER = 'ui/65main-battle.js V5.5.1';

import { CONFIG } from '../core/01config-5v5-test.js';
import { SeededRNG } from '../infra/51-core-utils.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { addPermanentBuff } from '../modules/20elite-skills.js';
import { updateUI } from './62ui-render-5v5-test.js';
import { showModal } from './60main-utils.js';
import { getBattleRng } from '../core/13battle-shared.js';
import { initBattleTeams } from '../modules/29battle-init.js';
import { generateBuffChoices, createBuffObject, tickBuffDurations, getActiveBuffList } from '../modules/28buff-tools.js';
import { resetBattleRuntime } from './69reset-runtime.js';

const C = CONFIG;

// ==================== 阵容生成 ====================
// 薄壳：阵容逻辑在 modules/29battle-init.js
export function doInitBattle(currentStage, UI, snapshot, activeBuffs, selectedBuffIndex, currentDoubleStrikeUid) {
    if (!UI || !snapshot) return;
    const _rng = snapshot._rngSeed ? new SeededRNG(snapshot._rngSeed) : new SeededRNG(Date.now());
    const { allyTeam, enemyTeam } = initBattleTeams(currentStage, _rng);
    
    snapshot.ally = allyTeam.map(u => Object.freeze(u.clone()));
    snapshot.enemy = enemyTeam.map(u => Object.freeze(u.clone()));
    UI.allyTeam = allyTeam.map(u => u.clone());
    UI.enemyTeam = enemyTeam.map(u => u.clone());
    UI.currentResult = null;
    UI.round = 0;
    GlobalStore.set('battleLog', []); // ★ V5.7.8 战报累积日志随新局重置（体检规则数据源）
    GlobalStore.set('battleHasZhang', allyTeam.some(u => u.isZhang));
    window._lastBattleSeed = Date.now();
    snapshot._rngSeed = _rng.getState();
    let stageText = currentStage === 1 ? '第一关' : `第${currentStage}关`;
    document.getElementById('labelEnemy').textContent = `六大派\n${stageText}`;
    document.getElementById('labelAlly').textContent = '明 教';
    updateUI();
}

// ==================== Buff 选择 ====================
/**
 * 弹窗选择姐姐附身方向
 * @param {function} callback - 选完后调用，参数 'right' 或 'left'
 */
// 战斗-弹窗：姐姐附身方向选择（左防御/右攻击）
export function showFlyDirectionPopup(callback) {
    // 快进/跳过直接默认
    if (GlobalStore.get('fastForwardActive') || GlobalStore.get('skipBuffPopup')) {
        callback('right');
        return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'flyDirectionModalOverlay';

    const box = document.createElement('div');
    box.className = 'modal-box';
    box.style.cssText = 'max-width:340px;background:#1a1a2e;color:#eee;padding:20px;position:relative;';

    const title = document.createElement('div');
    title.textContent = '🦋 姐姐附身方向';
    title.style.cssText = 'color:#ffd700;font-size:16px;font-weight:bold;margin-bottom:12px;text-align:center;';
    box.appendChild(title);

    const desc = document.createElement('div');
    desc.textContent = '选择本回合蝴蝶飞行方向';
    desc.style.cssText = 'color:#aaa;font-size:12px;margin-bottom:16px;text-align:center;';
    box.appendChild(desc);

    const btnDiv = document.createElement('div');
    btnDiv.style.cssText = 'display:flex;gap:10px;justify-content:center;';

    const btnLeft = document.createElement('button');
    btnLeft.textContent = '🦋 向左飞\n（防+血）';
    btnLeft.style.cssText = 'flex:1;padding:12px;border-radius:8px;border:2px solid #ff69b4;background:#2a2a4e;color:#ff69b4;font-size:13px;cursor:pointer;white-space:pre-line;';
    btnLeft.onclick = () => {
        document.body.removeChild(overlay);
        callback('left');
    };

    const btnRight = document.createElement('button');
    btnRight.textContent = '🦋 向右飞\n（攻+血）';
    btnRight.style.cssText = 'flex:1;padding:12px;border-radius:8px;border:2px solid #ffd700;background:#2a2a4e;color:#ffd700;font-size:13px;cursor:pointer;white-space:pre-line;';
    btnRight.onclick = () => {
        document.body.removeChild(overlay);
        callback('right');
    };

    btnDiv.appendChild(btnLeft);
    btnDiv.appendChild(btnRight);
    box.appendChild(btnDiv);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    // 弹窗已显示时快进则自动关闭
    const unsub = GlobalStore.on('fastForwardActive', (val) => {
        if (val) {
            unsub();
            if (overlay.parentNode) overlay.remove();
            callback('right');
        }
    });
    // 包装 callback，确保清理监听
    const wrappedCallback = (dir) => { unsub(); callback(dir); };
    btnLeft.onclick = () => { if (overlay.parentNode) overlay.remove(); wrappedCallback('left'); };
    btnRight.onclick = () => { if (overlay.parentNode) overlay.remove(); wrappedCallback('right'); };
}

// Buff-创建：构建Buff对象（含圣火令随机行列）—— 实现已移至 modules/28buff-tools.js
export { createBuffObject } from '../modules/28buff-tools.js';

// Buff-选择：生成可选Buff列表（过滤已激活+角色需求）—— 实现已移至 modules/28buff-tools.js
export { generateBuffChoices } from '../modules/28buff-tools.js';

// Buff-弹窗：显示Buff选择界面（普通模式）
export function showBuffSelection(callback, activeBuffs, selectedBuffIndex, updateBuffSlotsFn, updateUIFn, autoScrollLogFn, allyTeam) {
    // allyTeam 无效则从全局状态获取
    if (!allyTeam || !allyTeam.length || !allyTeam.some(u => u.alive)) {
        const ctx = window._getPlayerContext?.();
        allyTeam = ctx?.UI?.allyTeam || [];
    }
    const allKeys = Object.keys(C.BUFFS || {});
    const existingKeys = activeBuffs.map(b => b.key);
    const available = allKeys.filter(k => !existingKeys.includes(k));
    const choices = (GlobalStore.get('bugMode'))
        ? available
        : generateBuffChoices(activeBuffs, allyTeam, getBattleRng());
    const text = '选择 Buff（持续 ' + C.BUFF_DURATION + ' 回合）';
    const buttons = choices.map(key => ({
        text: (C.BUFFS[key]?.icon || '?') + ' ' + (C.BUFFS[key]?.name || key) + '\n' + (C.BUFFS[key]?.desc || ''),
        value: key,
        cls: 'buff'
    }));
    showModal(text, buttons, (key) => {
        let duration = C.BUFFS[key].duration || C.BUFF_DURATION;
        if (activeBuffs.length >= 2) {
            let shortest = activeBuffs.reduce((a, b) => a.remaining < b.remaining ? a : b);
            activeBuffs.splice(activeBuffs.indexOf(shortest), 1);
        }
        // 圣火令仅作为标记，实际行列由回合引擎每回合生成
        activeBuffs.push(createBuffObject(key, duration));
        // 小昭永久海克斯存储
        if (allyTeam) {
            const xiaoZhao = allyTeam.find(u => u.isXiaoZhaoBrother);
            if (xiaoZhao) {
                addPermanentBuff(xiaoZhao, key, C.BUFFS[key].name, {});
            }
        }
        updateBuffSlotsFn();
        let logDiv = document.getElementById('log');
        if (logDiv) { logDiv.innerHTML += `<span class="gold">✨ 获得Buff：${C.BUFFS[key].name}（持续${duration}回合）</span><br>`; autoScrollLogFn(); }
        if (window._updateGlowColors) window._updateGlowColors(selectedBuffIndex);
        updateUIFn();
        callback();
    }, true, false);
}

// ==================== Buff 槽 ====================

// Buff-计时：回合结束后递减Buff持续时间 —— 实现已移至 modules/28buff-tools.js
export { tickBuffDurations } from '../modules/28buff-tools.js';

// Buff-列表：格式化当前激活Buff摘要 —— 实现已移至 modules/28buff-tools.js
export { getActiveBuffList } from '../modules/28buff-tools.js';

// 战斗日志
// 日志-阵容：输出双方阵容详情到日志区
export function logTeamInfo(label, UI, gs, battleResultForInfo, activeBuffs, hasLoggedTeam) {
    let ally = UI.allyTeam, enemy = UI.enemyTeam;
    if (!ally.length || !enemy.length) return;
    let logDiv = document.getElementById('log');
    let appendDiv = (html) => { let d = document.createElement('div'); d.innerHTML = html + '<br>'; logDiv.appendChild(d); };
    let lbl = label || '阵容详情', contextNote = '';
    if (gs === 'RUNNING' || gs === 'PAUSED') contextNote = `（当前：第${UI.round||'?'}回合${gs==='PAUSED'?' 已暂停':''}）`;
    else if (gs === 'GAMEOVER') contextNote = '（当前：战斗已结束）';
    else contextNote = '（当前：准备阶段）';
    appendDiv(`<div class="separator">📋 ${lbl} ${contextNote}</div>`);
    appendDiv(`<span class="gold">[Buff: ${getActiveBuffList(activeBuffs)}]</span>`);
    let hasStats = (gs === 'GAMEOVER' && battleResultForInfo) || gs === 'RUNNING' || gs === 'PAUSED';
    [
        {name:'明教', color:'blue', data:ally},
        {name:'六大派', color:'orange', data:enemy}
    ].forEach(camp => {
        appendDiv(`<span class="${camp.color}">【${camp.name}】</span>`);
        camp.data.forEach(u => {
            let aliveText = u.alive ? '存活' : '💀阵亡';
            let displayPos = u.pos === -1 ? (u._originalPos || '?') : u.pos;
            let infoParts = [
                `${u.name}(${u.role} M${u.m})`,
                u.isHorse ? '[拒马]' : '',
                `站位${displayPos}`,
                `攻${Math.floor(u.atk)} 防${Math.floor(u.def)}`,
                `血${Math.floor(u.hp)}/${Math.floor(u.maxHp)}`,
                aliveText,
                u.isZhang ? '[无忌]' : '',
                u.isWei ? '[韦一笑]' : ''
            ].filter(Boolean);
            appendDiv('  ' + infoParts.join(' '));
            let statParts = [];
            if (hasStats) {
                if (u.dmgDealt !== undefined && u.dmgDealt > 0) statParts.push(`输出${u.dmgDealt}`);
                if (u.dmgTaken !== undefined && u.dmgTaken > 0) statParts.push(`承伤${u.dmgTaken}`);
            }
            if (u.dodgeCount > 0) statParts.push(`闪避${u.dodgeCount}次`);
            if (u.healDone > 0) statParts.push(`治疗${u.healDone}`);
            if (u.reboundDone > 0) statParts.push(`反弹${u.reboundDone}`);
            if (u.leechDone > 0) statParts.push(`吸血${u.leechDone}`);
            if (u.critCount > 0) statParts.push(`暴击${u.critCount}次`);
            if (u.survivedRounds > 0) statParts.push(`存活${u.survivedRounds}回合`);
            if (statParts.length > 0) appendDiv('    └ ' + statParts.join(' | '));
        });
    });
    logDiv.scrollTop = logDiv.scrollHeight;
    return true;
}

// ==================== 中止 ====================
// 中止战斗：统一收口到 resetBattleRuntime
export function abortAll(abortController, UI, waitingForNextRound, isBattleStarting, adjustMode, selectedAdjustPos, activeBuffs, selectedBuffIndex, currentDoubleStrikeUid, updateBuffSlotsFn) {
    if (abortController) { abortController.abort(); abortController = null; }
    if (UI) UI.currentResult = null;
    GlobalStore.set('battleLog', []); // ★ V5.7.8 中止清场：战报累积一并作废
    resetBattleRuntime();
    updateBuffSlotsFn();
    return {
        abortController: null,
        waitingForNextRound: false,
        isBattleStarting: false,
        adjustMode: false,
        selectedAdjustPos: null,
        activeBuffs: [],
        selectedBuffIndex: -1,
        currentDoubleStrikeUid: null
    };
}