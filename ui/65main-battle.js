// V6.0.0 | 2026-08-19 import 路径合并至 infra/51
export const VER = 'ui/65main-battle.js V6.0.1';

import { CONFIG } from '../core/01config-5v5-test.js';
import { SeededRNG } from '../infra/51-core-utils.js';
import { GlobalStore, getPlayerContext } from '../infra/54-global-store.js';
import { addPermanentBuff } from '../modules/20elite-skills.js';
import { updateUI } from './62ui-render-5v5-test.js';
import { showModal } from './60main-utils.js';
import { getBattleRng, getStat } from '../core/13battle-shared.js';
import { initBattleTeams } from '../modules/29battle-init.js';
import { generateBuffChoices, createBuffObject, tickBuffDurations, getActiveBuffList } from '../modules/28buff-tools.js';
import { resetBattleRuntime } from './69reset-runtime.js';
import { stepBuff } from './71tutorial.js';

const C = CONFIG;

// 阵容生成
// 阵容逻辑已抽至 modules/29battle-init.js，本函数仅组织外围流程
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
    GlobalStore.set('battleLog', []); // V5.7.8 战报累积日志随新局重置（体检规则数据源）
    GlobalStore.set('battleHasZhang', allyTeam.some(u => u.isZhang));
    snapshot._rngSeed = _rng.getState();
    let stageText = currentStage === 1 ? '第一关' : `第${currentStage}关`;
    document.getElementById('labelEnemy').textContent = `六大派\n${stageText}`;
    document.getElementById('labelAlly').textContent = '明 教';
    updateUI();
}

// Buff 选择
/**
 * 弹窗选择姐姐附身方向
 * @param {function} callback - 选完后调用，参数 'right' 或 'left'
 */
// 战斗-弹窗：姐姐附身方向选择（左防御/右攻击）
// V6.1.21 全自动档默认向左：autoLevel='full-auto' 时"向左"预高亮 + 3 秒倒计时自动确认。
//   为什么：全自动是无人值守，弹窗只等人点会把流程卡死；同时保留弹窗让人看得见发生了什么。
//   手动/自动档行为完全不变（无人预高亮、不倒计时、兜底仍为右）。
// 时间层说明：弹窗期间调用方已 c.isPaused=true（42/49），GlobalStore.effect 会 clock.pause()，
//   所以倒计时必须走真实时间 setTimeout——用 clock.wait 会跟着暂停一起冻住。
export function showFlyDirectionPopup(callback) {
    const isFullAuto = GlobalStore.get('autoLevel') === 'full-auto';
    const defaultDir = isFullAuto ? 'left' : 'right';
    // 快进/跳过直接默认
    if (GlobalStore.get('fastForwardActive') || GlobalStore.get('skipBuffPopup')) {
        callback(defaultDir);
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

    const btnRight = document.createElement('button');
    btnRight.textContent = '🦋 向右飞\n（攻+血）';
    btnRight.style.cssText = 'flex:1;padding:12px;border-radius:8px;border:2px solid #ffd700;background:#2a2a4e;color:#ffd700;font-size:13px;cursor:pointer;white-space:pre-line;';

    btnDiv.appendChild(btnLeft);
    btnDiv.appendChild(btnRight);
    box.appendChild(btnDiv);
    // 全自动档：把"向左"做成预选项（描边发光 + 底色提亮），倒计时结束即按它确认
    let hint = null;
    if (isFullAuto) {
        btnLeft.style.boxShadow = '0 0 12px rgba(255,105,180,0.7)';
        btnLeft.style.background = '#3d2a4e';
        btnLeft.style.fontWeight = 'bold';
        hint = document.createElement('div');
        hint.style.cssText = 'color:#ff69b4;font-size:12px;margin-top:12px;text-align:center;';
        box.appendChild(hint);
    }
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    let settled = false, timer = null;
    // 弹窗已显示时快进则自动关闭
    const unsub = GlobalStore.on('fastForwardActive', (val) => {
        if (val) {
            if (overlay.parentNode) overlay.remove();
            wrappedCallback(defaultDir);
        }
    });
    // 包装 callback，确保清理监听；并去重（倒计时 / 点击 / 快进只会生效一次）
    const wrappedCallback = (dir) => {
        if (settled) return;
        settled = true;
        unsub();
        if (timer) clearInterval(timer);
        callback(dir);
    };
    btnLeft.onclick = () => { if (overlay.parentNode) overlay.remove(); wrappedCallback('left'); };
    btnRight.onclick = () => { if (overlay.parentNode) overlay.remove(); wrappedCallback('right'); };
    // 倒计时：全自动档 3 秒后自动按预选项（向左）继续
    if (isFullAuto) {
        let sec = 3;
        hint.textContent = `（全自动）${sec} 秒后自动向左`;
        timer = setInterval(() => {
            sec -= 1;
            if (sec <= 0) {
                if (overlay.parentNode) overlay.remove();
                wrappedCallback('left');
                return;
            }
            hint.textContent = `（全自动）${sec} 秒后自动向左`;
        }, 1000);
    }
}

// 2026-09-14 注册到 UIHandler 通道，供 player/49 调用（消除 player → ui 反向 import）
GlobalStore.setUIHandler('showFlyDirectionPopup', showFlyDirectionPopup);

// Buff-创建：构建Buff对象（含圣火令随机行列）—— 实现已移至 modules/28buff-tools.js
export { createBuffObject } from '../modules/28buff-tools.js';

// Buff-选择：生成可选Buff列表（过滤已激活+角色需求）—— 实现已移至 modules/28buff-tools.js
export { generateBuffChoices } from '../modules/28buff-tools.js';

// Buff-弹窗：显示Buff选择界面（普通模式）
export function showBuffSelection(callback, activeBuffs, selectedBuffIndex, updateBuffSlotsFn, updateUIFn, autoScrollLogFn, allyTeam) {
    // allyTeam 无效则从全局状态获取
    if (!allyTeam || !allyTeam.length || !allyTeam.some(u => u.alive)) {
        const ctx = getPlayerContext();
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
        // 小昭·妹永久海克斯存储（仅妹，见 20 addPermanentBuff 守卫）
        if (allyTeam) {
            const xiaoZhao = allyTeam.find(u => u.isXiaoZhaoBrother);
            if (xiaoZhao) {
                addPermanentBuff(xiaoZhao, key, C.BUFFS[key].name, {});
            }
        }
        updateBuffSlotsFn();
        let logDiv = document.getElementById('log');
        if (logDiv) { logDiv.innerHTML += `<span class="gold">✨ 获得Buff：${C.BUFFS[key].name}（持续${duration}回合）</span><br>`; autoScrollLogFn(); }
        // 2026-09-14 原 window._updateGlowColors 全库从未定义（静默失效），删除无效调用
        updateUIFn();
        callback();
    }, true, false);
    stepBuff();
}

// Buff 槽

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
            let displayPos = u.pos === -1 ? (u.state._originalPos || '?') : u.pos;
            let infoParts = [
                `${u.name}(${u.role} M${u.m})`,
                u.isHorse ? '[拒马]' : '',
                `站位${displayPos}`,
                `攻${Math.floor(getStat(u, 'atk'))} 防${Math.floor(getStat(u, 'def'))}`,
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

// 中止
// 中止战斗：统一收口到 resetBattleRuntime
export function abortAll(abortController, UI, waitingForNextRound, isBattleStarting, adjustMode, selectedAdjustPos, activeBuffs, selectedBuffIndex, currentDoubleStrikeUid, updateBuffSlotsFn) {
    if (abortController) { abortController.abort(); abortController = null; }
    if (UI) UI.currentResult = null;
    GlobalStore.set('battleLog', []); // V5.7.8 中止清场：战报累积一并作废
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