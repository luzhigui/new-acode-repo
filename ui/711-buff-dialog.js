// ui/711-buff-dialog.js — 海克斯手选弹窗
// 候选门槛与 modules/329 generateBuffChoices、player/512 全自动同口径：统一走 filterAvailableBuffs
//   + pickBuffChoices（家族折叠在此单点实现），本弹窗不再自建洗牌逻辑。
// V6.5.0 | 2026-11-17 专属海克斯改制：删开局三选一弹窗（showZhangExclusivePopup），
//   专属改与普通海克斯等概率进普通池；抽中家族任一成员即整族一起进候选；选完整族终身不再出现。详见 modules/329。
// V6.5.1 | 2026-11-18 专属家族抽取套旧版专属弹窗皮肤（金字深蓝底+金卡，普通抽取不变）
// V6.5.2 | 2026-11-18 修esc作用域雷(块外不可见,线上ReferenceError)
// V6.5.3 | 2026-11-19 全自动/评测档专属家族默认只选「快来护驾」（我命由我/武学奇才自动档无意义）
export const VER = 'ui/711-buff-dialog.js V6.5.3';

import { CONFIG } from '../core/201-config-5v5-test.js';
import { GlobalStore } from '../infra/104-global-store.js';
import { addPermanentBuff } from '../modules/302-elite-skills.js';
import { createBuffObject, buffsOfCamp, filterAvailableBuffs, recordUsedBuffKey, pickBuffChoices, familyOf } from '../modules/329-buff-tools.js';
import { getBattleRng } from '../core/214-battle-shared.js';
import { CAMP_TYPES, BUFF_TYPES } from '../infra/106-battle-enums.js';
// 2026-11-10 下线存档：新手引导已搬 archive/712-tutorial.js（恢复见 archive/README.md）；空实现保调用点不动
const stepBattleBuff = () => {};

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

            if (GlobalStore.get('bugMode')) {
                // 🐛 Bug 模式：真·全开——不吃 filterAvailableBuffs（已持有/一次性用完/人数职业门槛全不看），
                //   基础海克斯全表可选（含重复拿；姊妹强化版走各自分库不在此列）。2026-11-10 老板点名"怎么那么少"
                choices = Object.keys(CONFIG.BUFFS);
            } else {
                // 候选抽样统一走 modules/329 的 pickBuffChoices：家族折叠（抽中一个专属
                //   ⇒ 整族一起进候选）在此单点实现，与引擎侧 generateBuffChoices 同口径。
                choices = pickBuffChoices(available, getBattleRng());
            }
        }
        if (choices.length === 0) { resolve(null); return; }

        // ====== 全自动模式：不画 UI，直接内部选完返回 ======
        if (isFullAuto) {
            const rng = getBattleRng();
            // 专属家族三选一：全自动/评测档默认只选「快来护驾」（2026-11-19 老板拍板）——
            //   我命由我（要拖目标）、武学奇才（要人挑招）在自动档都没意义，选了等于白占名额。
            const pick = choices.find(k => k === BUFF_TYPES.ZHANG_RESCUE)
                || choices[rng.nextInt(0, choices.length - 1)];
            const newBuff = createBuffObject(pick, null, camp, team);
            recordUsedBuffKey(pick);
            if (camp === CAMP_TYPES.ALLY) {
                // 「快来护驾」的召唤**不在这里做**：引擎每回合用 state.ally.map(clone) 重建队伍，
                //   本函数的 team 是 .filter() 副本，往它 push 的新单位下一回合就会被丢掉 = 白选。
                //   召唤统一由引擎 core/210 回合开头的 spawnZhangRescueIfNeeded 完成。
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

        // 专属家族抽取（2026-11-18 老板要求）：候选含专属家族成员时套旧版专属弹窗皮肤（金字深蓝底），普通抽取仍走通用皮肤
        const isExclusive = choices.some(k => familyOf(k));
        // esc 必须与按钮循环同层（2026-11-18 线上 ReferenceError 教训：藏在 if 块内 = 块外不可见）
        const esc = (x) => String(x == null ? '' : x).replace(/</g, '&lt;');
        let text = '选择海克斯（' + (CAMP_LABEL[camp] || '') + '方）';
        let buttons = choices.map(key => {
            let buff = CONFIG.BUFFS[key] || { name: key, icon: '?' };
            return { text: (buff.icon || '?') + ' ' + (buff.name || key) + '\n' + (buff.desc || ''), value: key, cls: 'buff', buff };
        });
        if (isExclusive) {
            text = '⭐ 专属海克斯 · 三选一（' + (CAMP_LABEL[camp] || '') + '方）<br><span style="color:#aaa;font-size:11px;">选定后本局锁定此路线，整族终身不再出现</span>';
        }

        let overlay = document.createElement('div'); overlay.className = 'modal-overlay'; overlay.id = 'buffModalOverlay';
        let box = document.createElement('div'); box.className = 'modal-box';
        let inner = `<div class="modal-text">${text}</div><span class="modal-minimize" id="buffModalMinimize">∧</span><div class="modal-buttons"></div>`;
        box.innerHTML = inner;
        if (isExclusive) {
            box.style.cssText += ';max-width:380px;background:#1a1a35;border:1px solid #b8860b;box-shadow:0 0 24px rgba(255,215,0,0.35),0 8px 30px rgba(0,0,0,0.6);';
            const titleEl = box.querySelector('.modal-text');
            if (titleEl) titleEl.style.cssText = 'color:#ffd700;font-size:16px;font-weight:bold;text-align:center;margin-bottom:12px;';
        }
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
            if (isExclusive) {
                // 旧版专属卡同款（c356e2c4 删掉的 showZhangExclusivePopup）：金名 + 灰描述，深蓝底金边
                btn.style.cssText = 'display:block;width:100%;margin-bottom:8px;padding:10px 12px;text-align:left;background:#2a2a4e;color:#eee;border:1px solid #b8860b;border-radius:8px;font-size:12px;line-height:1.5;cursor:pointer;';
                btn.innerHTML = '<div style="color:#ffd700;font-weight:bold;font-size:13px;margin-bottom:2px;">' + esc(b.buff.icon) + ' ' + esc(b.buff.name || b.value) + '</div><div style="color:#bbb;font-size:11px;">' + esc(b.buff.desc) + '</div>';
            } else {
                btn.textContent = b.text;
            }
            btn.addEventListener('click', () => {
                const newBuff = createBuffObject(b.value, null, camp, team);
                recordUsedBuffKey(b.value);
                if (camp === CAMP_TYPES.ALLY) {
                    // 召唤同上：不在 UI 层做，由引擎 core/210 回合开头统一处理
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

