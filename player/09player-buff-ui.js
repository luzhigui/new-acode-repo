// player/09player-buff-ui.js - 光明顶5v5 Buff弹窗与横幅
// V5.1.0 | ~8171 bytes | 2026-07-05
export const VER = 'player/09player-buff-ui.js V5.1.0';

import { CONFIG } from '../core/01config-5v5-test.js';
import { Unit } from '../core/07battle-engine-5v5-test.js';
import { showDamageFloat, showHealFloat, showBuffBanner } from '../fx/15fx-common-5v5-test.js';
import { addPermanentBuff } from '../modules/23elite-skills.js';


let ctx = null;
function getCtx() {
    if (!ctx) ctx = window._getPlayerContext();
    return ctx;
}

export function setBuffUIContext(c) { ctx = c; }

export function showBuffPopup(c) {
    return new Promise((resolve) => {
        let activeBuffs = c.activeBuffs || [];
        let existingKeys = activeBuffs.map(b => b.key);
        let allKeys = Object.keys(CONFIG.BUFFS || {});
        let available = allKeys.filter(k => !existingKeys.includes(k));
        if (available.length === 0) { resolve(null); return; }

        let shuffled = [...available].sort(() => Math.random() - 0.5);
        let choices = shuffled.slice(0, CONFIG.BUFF_CHOICES || 3);
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
        buttons.forEach(b => {
            let btn = document.createElement('button'); btn.className = 'modal-btn ' + (b.cls || '');
            btn.textContent = b.text;
            btn.addEventListener('click', () => {
                document.body.removeChild(overlay);
                let floatBtn = document.getElementById('buffFloatBtn');
                if (floatBtn) floatBtn.remove();
                let duration = CONFIG.BUFFS[b.value]?.duration || CONFIG.BUFF_DURATION || 4;
                const newBuff = { key: b.value, target: 'ally', remaining: duration, name: CONFIG.BUFFS[b.value]?.name || b.value };
                // 小昭永久海克斯存储
                const ctx = window._getPlayerContext?.();
                if (ctx && ctx.UI && ctx.UI.allyTeam) {
                    const xiaoZhao = ctx.UI.allyTeam.find(u => u.isXiaoZhao);
                    if (xiaoZhao) {
                        addPermanentBuff(xiaoZhao, b.value, newBuff.name, b.value === 'holyFlame' ? { col: newBuff.col, row: newBuff.row } : {});
                        // 同步回 snapshot，确保引擎 clone 时拿到最新 _permanentBuffs
                        if (ctx.snapshot && ctx.snapshot.ally) {
                            const snapXz = ctx.snapshot.ally.find(u => u.isXiaoZhao);
                            if (snapXz) snapXz._permanentBuffs = xiaoZhao._permanentBuffs.map(b => ({...b}));
                        }
                    }
                }
                resolve(newBuff);
            });
            btnsDiv.appendChild(btn);
        });
        overlay.appendChild(box); document.body.appendChild(overlay);
        // 清理可能残留的关闭按钮（来自投票弹窗等）
        document.querySelectorAll('#buffModalOverlay .modal-box > span').forEach(s => {
            if (s.textContent === '✕') s.remove();
        });
        // 移除可能残留的关闭按钮（来自之前的弹窗）
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
                document.body.appendChild(floatBtn);
            }
        });
    });
}

export async function handleBuffSummon(c, entry, prevEntry) {
    // 构建拒马单位数据（纯对象，非 Unit 实例，供 Store 使用）
    const horseData = {
        uid: entry.horseUid,
        name: '拒马',
        role: '防战',
        camp: 'ally',
        pos: entry.horsePos,
        alive: true,
        hp: 20,
        maxHp: 20,
        atk: 0,
        def: 5,
        isHorse: true,
        _originalPos: entry.horsePos,
        _baseMaxHp: 20,
        _isDead: false,
        _flash: null,
        _acted: false,
        _resting: false,
        _blocked: false,
        dmgDealt: 0, dmgTaken: 0, healDone: 0, reboundDone: 0, leechDone: 0,
        dodgeCount: 0, critCount: 0, survivedRounds: 0,
        buffAtkBonus: 0, buffDefBonus: 0, buffDodgeBonus: 0, buffHpBonus: 0
    };
    // 通过 Store dispatch 添加单位，subscribe 会自动同步到 c.UI.allyTeam
    if (c.store) {
        c.store.dispatch({ type: 'ADD_UNIT', unit: horseData });
    } else {
        // 兜底：如果没有 Store（极端情况），保留直接操作
        let horse = new Unit('拒马', 20, '防战', 'ally');
        horse.uid = entry.horseUid;
        horse.pos = entry.horsePos;
        horse.alive = true;
        horse.hp = 20; horse.maxHp = 20; horse.atk = 0; horse.def = 5;
        horse.isHorse = true; horse._originalPos = entry.horsePos;
        if (!c.UI.allyTeam.some(u => u.uid === horse.uid)) {
            c.UI.allyTeam.push(horse);
        }
    }
    // 保留 lastSnapshot 快照，后续可改为从 Store 计算，暂时保留直接赋值
    c.UI.lastSnapshot = { ally: c.UI.allyTeam.map(u => ({...u})), enemy: c.UI.enemyTeam.map(u => ({...u})) };
    if (entry.horseTaunt) {
        // 连续出拒马时稍作停顿，避免两匹同时弹幕太突兀
        if (prevEntry && prevEntry.type === 'buff-summon' && prevEntry.horseTaunt) {
            await new Promise(r => setTimeout(r, 600));
        }
        // 先让格子渲染出来
        c.updateUI(c.UI);
        // 再暂停播弹幕，弹幕结束后格子已经在了
        c.isPaused = true;
        await showBuffBanner('🐴 拒马阵！' + entry.horseTaunt);
        c.isPaused = false;
    }
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
    document.getElementById('log').appendChild(div);
    c.autoScrollLog();
}

export async function handleBuffDestroy(c, entry, prevEntry) {
    // 通过 Store dispatch 移除单位
    if (c.store) {
        c.store.dispatch({ type: 'REMOVE_UNIT', uid: entry.horseUid });
    } else {
        let idx = c.UI.allyTeam.findIndex(u => u.uid === entry.horseUid);
        if (idx >= 0) {
            c.UI.allyTeam.splice(idx, 1);
        }
    }
    // 保留 lastSnapshot 快照
    c.UI.lastSnapshot = { ally: c.UI.allyTeam.map(u => ({...u})), enemy: c.UI.enemyTeam.map(u => ({...u})) };
    c.isPaused = true;
    await showBuffBanner('🐴 拒马已销毁');
    c.isPaused = false;
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
    document.getElementById('log').appendChild(div);
    c.autoScrollLog();
}

export async function handleBuffLeech(c, entry) {
    // 只负责飘字和横幅，不修改血量（血量已由引擎事件同步到 Store）
    let healUnit = c.UI.allyTeam.find(u => u.uid === entry.healUnitUid) || c.UI.allyTeam.find(u => u.alive);
    if (healUnit && entry.healAmount) {
        showHealFloat(healUnit, entry.healAmount);
    }
    let bannerText = '🗡️ 嗜血狂刀！';
    if (entry.buffType === 'hotBlood') {
        bannerText = entry.text.includes('翻倍') ? '❤️‍🔥 热血奋战(翻倍)！' : '❤️ 热血奋战！';
    }
    c.isPaused = true;
    await showBuffBanner(bannerText);
    c.isPaused = false;
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
    document.getElementById('log').appendChild(div);
    c.autoScrollLog();
}