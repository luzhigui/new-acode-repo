// ui/70buff-dialog.js — 海克斯手选弹窗
// 候选门槛与 modules/28 generateBuffChoices、player/49 全自动同口径：众志成城要求本阵营存活 <4 人。
//   本弹窗自建候选列表，门槛必须手动跟上，不能只改一处。
export const VER = 'ui/70buff-dialog.js V6.4.3';

import { CONFIG } from '../core/01config-5v5-test.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { addPermanentBuff } from '../modules/20elite-skills.js';
import { createBuffObject, buffsOfCamp, filterAvailableBuffs } from '../modules/28buff-tools.js';
import { getBattleRng } from '../core/13battle-shared.js';
import { CAMP_TYPES, BUFF_TYPES } from '../infra/56-battle-enums.js';
import { stepBattleBuff } from './71tutorial.js';

const CAMP_LABEL = { [CAMP_TYPES.ALLY]: '明教', [CAMP_TYPES.ENEMY]: '六大派' };

// presetChoices：联网 PVP 阶段3 从机专用——选项由房主用引擎 RNG 统一下发，本机不再自算
export function showBuffPopup(c, camp = CAMP_TYPES.ALLY, presetChoices = null, isFullAuto = false, isBattle = true) {
    return new Promise((resolve) => {
        if (isBattle) stepBattleBuff(); // 战前不弹新手提示
        if (GlobalStore.get('skipBuffPopup')) {
            GlobalStore.set('skipBuffPopup', false);
            resolve(null);
            return;
        }
        
        const activeBuffs = buffsOfCamp(c.activeBuffs, camp);
        const team = c.store ? c.store.getState().units.filter(u => u.camp === camp && u.alive) : [];
        const enemyTeam = c.store ? c.store.getState().units.filter(u => u.camp !== camp && u.alive) : [];
        
        let choices;
        if (Array.isArray(presetChoices) && presetChoices.length > 0) {
            choices = presetChoices.slice();
        } else {
            const available = filterAvailableBuffs(activeBuffs, team, { withFortifyRule: true, enemyTeam });
            if (available.length === 0) { resolve(null); return; }

            const shuffled = [...available];
            const rng = getBattleRng();
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = rng.nextInt(0, i);
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            choices = shuffled.slice(0, CONFIG.BUFF_CHOICES || 3);
        }
        if (choices.length === 0) { resolve(null); return; }

        // ====== 全自动模式：不画 UI，直接内部选完返回 ======
        if (isFullAuto) {
            const rng = getBattleRng();
            const pick = choices[rng.nextInt(0, choices.length - 1)];
            const newBuff = createBuffObject(pick, null, camp, team);
            if (camp === CAMP_TYPES.ALLY) {
                const xz = team.find(u => u.isXiaoZhaoBrother);
                if (xz) addPermanentBuff(xz, pick, newBuff.name, {});
            }
            resolve(newBuff);
            return;
        }

        // ====== 手选模式：接管暂停 ======
        GlobalStore.set('panelPaused', true);
        const fnSync = GlobalStore.getUIHandler('syncPauseState');
        if (fnSync) fnSync();

        let text = '选择海克斯（' + (CAMP_LABEL[camp] || '') + '方）';
        let buttons = choices.map(key => {
            let buff = CONFIG.BUFFS[key] || { name: key, icon: '?' };
            return { text: (buff.icon || '?') + ' ' + (buff.name || key) + '\n' + (buff.desc || ''), value: key, cls: 'buff' };
        });

        let overlay = document.createElement('div'); overlay.className = 'modal-overlay'; overlay.id = 'buffModalOverlay';
        let box = document.createElement('div'); box.className = 'modal-box';
        let inner = `<div class="modal-text">${text}</div><span class="modal-minimize" id="buffModalMinimize">∧</span><div class="modal-buttons"></div>`;
        box.innerHTML = inner;
        let btnsDiv = box.querySelector('.modal-buttons');
        let unsubSkip = null;
        function closeAndResolve(buffObj) {
            if (unsubSkip) unsubSkip();
            if (overlay.parentNode) overlay.remove();
            let floatBtn = document.getElementById('buffFloatBtn');
            if (floatBtn) floatBtn.remove();
            
            // 释放暂停源
            GlobalStore.set('panelPaused', false);
            const fnSync2 = GlobalStore.getUIHandler('syncPauseState');
            if (fnSync2) fnSync2();
            
            resolve(buffObj);
        }

        buttons.forEach(b => {
            let btn = document.createElement('button'); btn.className = 'modal-btn ' + (b.cls || '');
            btn.textContent = b.text;
            btn.addEventListener('click', () => {
                const newBuff = createBuffObject(b.value, null, camp, team);
                // carry 全场只能选一次：记进 usedBuffKeys（跨关不清，整局有效；resetBattleRuntime 时清空）
                if (b.value === 'carry') {
                    const used = GlobalStore.get('usedBuffKeys') || [];
                    if (!used.includes('carry')) GlobalStore.set('usedBuffKeys', [...used, 'carry']);
                }
                if (camp === CAMP_TYPES.ALLY) {
                    const xiaoZhao = team.find(u => u.isXiaoZhaoBrother);
                    if (xiaoZhao) {
                        addPermanentBuff(xiaoZhao, b.value, newBuff.name, {});
                    }
                }
                closeAndResolve(newBuff);
            });
            btnsDiv.appendChild(btn);
        });
        overlay.appendChild(box); document.body.appendChild(overlay);
        unsubSkip = GlobalStore.on('skipBuffPopup', (val) => {
            if (val) {
                GlobalStore.set('skipBuffPopup', false);
                closeAndResolve(null);
            }
        });
        document.querySelectorAll('#buffModalOverlay .modal-box > span').forEach(s => {
            if (s.textContent === '✕') s.remove();
        });
        const existingClose = box.querySelector('span');
        if (existingClose && existingClose.textContent === '✕') {
            existingClose.remove();
        }

        document.getElementById('buffModalMinimize').addEventListener('click', () => {
            overlay.style.display = 'none';
            let floatBtn = document.createElement('div');
            floatBtn.id = 'buffFloatBtn';
            floatBtn.className = 'vote-float';
            floatBtn.style.display = 'flex';
            floatBtn.style.bottom = '60px';
            floatBtn.title = '恢复Buff选择';
            floatBtn.innerHTML = '🛡️';
            floatBtn.addEventListener('click', () => {
                overlay.style.display = 'flex';
                floatBtn.remove();
            });
            document.body.appendChild(floatBtn);
        });

        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                overlay.style.display = 'none';
                let floatBtn = document.createElement('div');
                floatBtn.id = 'buffFloatBtn';
                floatBtn.className = 'vote-float';
                floatBtn.style.display = 'flex';
                floatBtn.style.bottom = '60px';
                floatBtn.title = '恢复Buff选择';
                floatBtn.innerHTML = '🛡️';
                floatBtn.addEventListener('click', () => {
                    overlay.style.display = 'flex';
                    floatBtn.remove();
                });
                const unsubscribe = GlobalStore.on('gs', (newGs) => {
                    if (newGs === 'IDLE') {
                        if (floatBtn.parentNode) floatBtn.remove();
                        unsubscribe();
                    }
                });
                document.body.appendChild(floatBtn);
            }
        });
    });
}
