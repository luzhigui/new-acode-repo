// ui/70buff-dialog.js — 海克斯手选弹窗
// V6.4.3 | 2026-10-28 | ~8500 bytes | 修 fa6f206f 同族雷：createBuffObject 的 team 参数引用了不存在的
//   allyUnits（块内 const 对块外不可见），点确认即 ReferenceError——改 camp 自己的队伍（与 L34/49 同口径）
// V6.4.2 | 2026-10-16 | ~8400 bytes
// 候选门槛与 modules/28 generateBuffChoices、player/49 全自动同口径：众志成城要求本阵营存活 <4 人。
//   本弹窗自建候选列表，门槛必须手动跟上，不能只改一处。
export const VER = 'ui/70buff-dialog.js V6.4.3';

import { CONFIG } from '../core/01config-5v5-test.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { addPermanentBuff } from '../modules/20elite-skills.js';
import { createBuffObject, buffsOfCamp } from '../modules/28buff-tools.js';
import { getBattleRng } from '../core/13battle-shared.js';
import { CAMP_TYPES, BUFF_TYPES } from '../infra/56-battle-enums.js';
import { stepBattleBuff } from './71tutorial.js';

const CAMP_LABEL = { [CAMP_TYPES.ALLY]: '明教', [CAMP_TYPES.ENEMY]: '六大派' };

// presetChoices：联网 PVP 阶段3 从机专用——选项由房主用引擎 RNG 统一下发，本机不再自算
export function showBuffPopup(c, camp = CAMP_TYPES.ALLY, presetChoices = null) {
    return new Promise((resolve) => {
        stepBattleBuff(); // 战中首次海克斯一次性提示（自带完成检查，71tutorial）
        if (GlobalStore.get('skipBuffPopup')) {
            GlobalStore.set('skipBuffPopup', false);
            resolve(null);
            return;
        }
        let choices;
        if (Array.isArray(presetChoices) && presetChoices.length > 0) {
            choices = presetChoices.slice();
        } else {
            // 只取本阵营的 buff：各阵营独立去重，明教与六大派互不影响
            let activeBuffs = buffsOfCamp(c.activeBuffs, camp);
            let existingKeys = activeBuffs.map(b => b.key);
            let allKeys = Object.keys(CONFIG.BUFFS || {});
            const team = c.store ? c.store.getState().units.filter(u => u.camp === camp && u.alive) : [];
            let available = allKeys.filter(k => {
                if (existingKeys.includes(k)) return false;
                if (k === BUFF_TYPES.FORTIFY && !activeBuffs.some(b => b.remaining > 0)) return false;
                // 众志成城门槛（老板拍板，与 modules/28、player/49 同口径）：本阵营存活 ≥4 人不进候选
                //   上面 team 已按存活过滤（L33），此处直接比长度
                if (k === BUFF_TYPES.UNITY && team.length >= 4) return false;
                const requiredRole = CONFIG.BUFF_ROLE_REQUIREMENTS?.[k];
                if (requiredRole && !team.some(u => u.alive && u.role === requiredRole)) return false;
                return true;
            });
            if (available.length === 0) { resolve(null); return; }

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
        }
        let text = '选择 Buff（' + (CAMP_LABEL[camp] || '') + '方 · 持续 ' + (CONFIG.BUFF_DURATION || 4) + ' 回合）';
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
                if (overlay.parentNode) overlay.remove();
                let floatBtn = document.getElementById('buffFloatBtn');
                if (floatBtn) floatBtn.remove();
                // fa6f206f 给 createBuffObject 加 team 参数时引用了不存在的 allyUnits（下方 if 块的 const
                // 对块外不可见）——点确认按钮即 ReferenceError（与 65 同族雷）。修：camp 自己的队伍，
                // 与 L34 候选过滤、player/49 自动路径同口径——敌方拿敌方队，流星雨姊强化判定不串阵营
                const myTeam = c.store ? c.store.getState().units.filter(u => u.camp === camp && u.alive) : [];
                const newBuff = createBuffObject(b.value, null, camp, myTeam);
                // 小昭·妹永久海克斯仅明教适用（见 20 addPermanentBuff 守卫）
                if (camp === CAMP_TYPES.ALLY) {
                    const xiaoZhao = myTeam.find(u => u.isXiaoZhaoBrother);
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
