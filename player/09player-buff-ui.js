// 09player-buff-ui.js - 光明顶对战 5v5 Buff 弹窗与横幅 (修复持续时间)
// 预估行数: 296, 发送时间: 20260621 14:30, 版本: V1.0.9
export const VER = '09player-buff-ui.js V1.0.9';

import { CONFIG } from '../core/01config-5v5-test.js';
import { Unit } from '../core/07battle-engine-5v5-test.js';
import { showDamageFloat, showHealFloat, showBuffBanner } from '../fx/15fx-common-5v5-test.js';

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
                resolve({ key: b.value, target: 'ally', remaining: duration, name: CONFIG.BUFFS[b.value]?.name || b.value });
            });
            btnsDiv.appendChild(btn);
        });
        overlay.appendChild(box); document.body.appendChild(overlay);

        // 30秒超时兜底，防止游戏卡死
        let timeoutId = setTimeout(() => {
            if (document.body.contains(overlay)) {
                try { document.body.removeChild(overlay); } catch(e) {}
            }
            let floatBtn = document.getElementById('buffFloatBtn');
            if (floatBtn) floatBtn.remove();
            resolve(null);
        }, 30000);

        // 按钮点击时清除超时
        btnsDiv.querySelectorAll('.modal-btn').forEach(btn => {
            btn.addEventListener('click', () => clearTimeout(timeoutId));
        });

        document.getElementById('buffModalMinimize').addEventListener('click', () => {
            overlay.style.display = 'none';
            let floatBtn = document.createElement('div');
            floatBtn.id = 'buffFloatBtn';
            floatBtn.className = 'vote-float';
            floatBtn.style.display = 'flex';
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
    if (prevEntry && (prevEntry.type === 'attack-group' || prevEntry.type === 'buff-leech' || prevEntry.type === 'buff-splash')) {
        let sepDiv = document.createElement('div');
        sepDiv.innerHTML = '<span class="separator">- - - - -</span><br>';
        document.getElementById('log').appendChild(sepDiv);
        c.autoScrollLog();
        await new Promise(r=>setTimeout(r, c.speed/4));
    }
    let horse = new Unit('拒马', 20, '防战', 'ally');
    horse.uid = entry.horseUid;
    horse.pos = entry.horsePos;
    horse.alive = true;
    horse.hp = 20;
    horse.maxHp = 20;
    horse.atk = 0;
    horse.def = 5;
    horse.isHorse = true;
    horse._originalPos = entry.horsePos;
    if (!c.UI.allyTeam.some(u => u.uid === horse.uid)) {
        c.UI.allyTeam.push(horse);
    }
    c.updateUI(c.UI, c.UI.lastSnapshot);
    c.UI.lastSnapshot = { ally: c.UI.allyTeam.map(u => u.clone()), enemy: c.UI.enemyTeam.map(u => u.clone()) };
    if (entry.horseTaunt) {
        c.isPaused = true;
        await showBuffBanner('🐴 拒马阵！' + entry.horseTaunt);
        c.isPaused = false;
    }
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
    document.getElementById('log').appendChild(div);
    c.autoScrollLog();
    let sepAfter = document.createElement('div');
    sepAfter.innerHTML = '<span class="separator">- - - - -</span><br>';
    document.getElementById('log').appendChild(sepAfter);
    c.autoScrollLog();
    await new Promise(r=>setTimeout(r, c.speed/4));
}

export async function handleBuffDestroy(c, entry, prevEntry) {
    if (prevEntry && (prevEntry.type === 'attack-group' || prevEntry.type === 'buff-leech' || prevEntry.type === 'buff-splash')) {
        let sepDiv = document.createElement('div');
        sepDiv.innerHTML = '<span class="separator">- - - - -</span><br>';
        document.getElementById('log').appendChild(sepDiv);
        c.autoScrollLog();
        await new Promise(r=>setTimeout(r, c.speed/4));
    }
    let idx = c.UI.allyTeam.findIndex(u => u.uid === entry.horseUid);
    if (idx >= 0) {
        c.UI.allyTeam.splice(idx, 1);
        c.updateUI(c.UI, c.UI.lastSnapshot);
        c.UI.lastSnapshot = { ally: c.UI.allyTeam.map(u => u.clone()), enemy: c.UI.enemyTeam.map(u => u.clone()) };
    }
    c.isPaused = true;
    await showBuffBanner('🐴 拒马已销毁');
    c.isPaused = false;
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
    document.getElementById('log').appendChild(div);
    c.autoScrollLog();
}

export async function handleBuffLeech(c, entry) {
    let healUnit = c.UI.allyTeam.find(u => u.uid === entry.healUnitUid) || c.UI.allyTeam.find(u => u.alive);
    if (healUnit && entry.healAmount) {
        showHealFloat(healUnit, entry.healAmount);
        healUnit.hp = Math.min(healUnit.maxHp, healUnit.hp + entry.healAmount);
        c.updateUI(c.UI);
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

export async function handleBuffSplash(c, entry) {
    let match = entry.text.match(/-(\d+)/);
    if (match) {
        let targetName = entry.text.match(/溅射(.+?) -/) || entry.text.match(/波及(.+?) -/);
        let targetUnit = targetName ? c.UI.enemyTeam.find(u => u.name === targetName[1] && u.alive) : null;
        if (targetUnit) showDamageFloat(targetUnit, parseInt(match[1]));
    }
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
    document.getElementById('log').appendChild(div);
    c.autoScrollLog();
    if (entry.buffType === 'wind_assault') {
        c.isPaused = true;
        await showBuffBanner('🦅 乘风突袭！');
        c.isPaused = false;
    } else {
        c.isPaused = true;
        await showBuffBanner('☄️ 流星赶月！');
        c.isPaused = false;
    }
}