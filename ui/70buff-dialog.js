// ui/70buff-dialog.js - 光明顶5v5 Buff弹窗
// V5.6.0 | ~8800 bytes| 2026-08-21 从player/41拆出，弹窗归ui
export const VER = 'ui/70buff-dialog.js V5.6.0';

import { CONFIG } from '../core/01config-5v5-test.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { addPermanentBuff } from '../modules/20elite-skills.js';
import { createBuffObject } from '../modules/28buff-tools.js';
import { getBattleRng } from '../core/13battle-shared.js';

export function showBuffPopup(c) {
    return new Promise((resolve) => {
        if (GlobalStore.get('skipBuffPopup')) {
            GlobalStore.set('skipBuffPopup', false);
            resolve(null);
            return;
        }
        let activeBuffs = c.activeBuffs || [];
        let existingKeys = activeBuffs.map(b => b.key);
        let allKeys = Object.keys(CONFIG.BUFFS || {});
        const allyTeam = c.store ? c.store.getState().units.filter(u => u.camp === 'ally' && u.alive) : [];
        let available = allKeys.filter(k => {
            if (existingKeys.includes(k)) return false;
            if (k === BUFF_TYPES.FORTIFY && !activeBuffs.some(b => b.remaining > 0)) return false;
            const requiredRole = CONFIG.BUFF_ROLE_REQUIREMENTS?.[k];
            if (requiredRole && !allyTeam.some(u => u.alive && u.role === requiredRole)) return false;
            return true;
        });
        if (available.length === 0) { resolve(null); return; }

        let choices;
        if (GlobalStore.get('bugMode')) {
            choices = available;
        } else {
            const shuffled = [...available];
            const rng = getBattleRng();
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = rng.nextInt(0, i);
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            choices = shuffled.slice(0, CONFIG.BUFF_CHOICES || 3);
        }
        let text = '选择 Buff（持续 ' + (CONFIG.BUFF_DURATION || 4) + ' 回合）';
        let buttons = choices.map(key => {
            let buff = CONFIG.BUFFS[key] || { name: key, icon: '?' };
            return { text: (buff.icon || '?') + ' ' + (buff.name || key) + '\n' + (buff.desc || ''), value: key, cls: 'buff' };
        });
        if (buttons.length === 0) { resolve(null); return; }

        let overlay = document.createElement('div'); overlay.className = 'modal-overlay'; overlay.id = 'buffModalOverlay';
        let box = document.createElement('div'); box.className = 'modal-box';
        let inner = `<div class="modal-text">${text}</div><span class="modal-minimize" id="buffModalMinimize">∧</span><div class="modal-buttons"></div>`;
        box.innerHTML = inner;
        let btnsDiv = box.querySelector('.modal-buttons');
        let unsubSkip = null;
        buttons.forEach(b => {
            let btn = document.createElement('button'); btn.className = 'modal-btn ' + (b.cls || '');
            btn.textContent = b.text;
            btn.addEventListener('click', () => {
                if (unsubSkip) unsubSkip();
                document.body.removeChild(overlay);
                let floatBtn = document.getElementById('buffFloatBtn');
                if (floatBtn) floatBtn.remove();
                let duration = CONFIG.BUFFS[b.value]?.duration || CONFIG.BUFF_DURATION || 4;
                const newBuff = createBuffObject(b.value, duration);
                const ctx = GlobalStore.get('playerContext');
                if (ctx && ctx.UI && ctx.UI.allyTeam) {
                    const xiaoZhao = ctx.UI.allyTeam.find(u => u.isXiaoZhaoBrother);
                    if (xiaoZhao) {
                        addPermanentBuff(xiaoZhao, b.value, newBuff.name, {});
                    }
                }
                resolve(newBuff);
            });
            btnsDiv.appendChild(btn);
        });
        overlay.appendChild(box); document.body.appendChild(overlay);
        unsubSkip = GlobalStore.on('skipBuffPopup', (val) => {
            if (val) {
                unsubSkip();
                if (overlay.parentNode) overlay.remove();
                let floatBtn = document.getElementById('buffFloatBtn');
                if (floatBtn) floatBtn.remove();
                GlobalStore.set('skipBuffPopup', false);
                resolve(null);
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
