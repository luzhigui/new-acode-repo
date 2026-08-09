﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// ui/40main-dialogs.js - 光明顶5v5 弹窗模块
// V5.4.0 | ~16100 bytes| 2026-07-06
export const VER = 'ui/40main-dialogs.js V5.4.0';

import { showModal, showAlert } from './12main-utils.js';
import { AudioManager } from '../modules/28audio-manager.js';

// ==================== 战报弹窗 ====================
export function showBattleReport(UI, battleResultForInfo) {
    // ★ 防残留：如果游戏已不在 GAMEOVER 状态，不创建弹窗
    if (window._getPlayerContext && window._getPlayerContext().gs !== 'GAMEOVER') return;
    // 刷新积分显示
    if (typeof window.updateScoreBadge === 'function') window.updateScoreBadge();

    // 优先使用 battleResultForInfo（包含已被 3 秒清理机制移除的死单位快照），
    // 否则回退到 UI.allyTeam/enemyTeam
    let ally = (battleResultForInfo && battleResultForInfo.ally) ? battleResultForInfo.ally : UI.allyTeam;
    let enemy = (battleResultForInfo && battleResultForInfo.enemy) ? battleResultForInfo.enemy : UI.enemyTeam;
    let allUnits = [...ally, ...enemy];
    let winner = battleResultForInfo.winner;

    let overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.background = 'rgba(0,0,0,0.85)';
    overlay.id = 'battleReportOverlay';

    let box = document.createElement('div');
    box.className = 'modal-box';
    box.style.cssText = 'background:#1a1a2e;border:2px solid #ffd700;border-radius:12px;padding:20px;max-width:580px;color:#eee;position:relative;';

    // 最小化按钮挂在 box 内右上角（而非 overlay 上），避免出现在屏幕右上角
    let minimizeBtn = document.createElement('span');
    minimizeBtn.innerHTML = '∧';
    minimizeBtn.style.cssText = 'position:absolute;top:6px;right:10px;cursor:pointer;font-size:18px;color:#ffd700;z-index:10;font-weight:bold;';
    minimizeBtn.onclick = () => {
        overlay.style.display = 'none';
        let floatBtn = document.createElement('div');
        floatBtn.id = 'battleReportFloat';
        floatBtn.className = 'vote-float';
        floatBtn.style.display = 'flex';
        floatBtn.style.right = '20px';
        floatBtn.style.bottom = '60px';
        floatBtn.title = '恢复战报';
        floatBtn.innerHTML = '📊';
        floatBtn.addEventListener('click', () => {
            overlay.style.display = 'flex';
            floatBtn.remove();
        });
        document.body.appendChild(floatBtn);
    };
    box.appendChild(minimizeBtn);
    
    let title = document.createElement('div');
    title.style.cssText = 'color:#ffd700;font-size:18px;font-weight:bold;text-align:center;margin-bottom:12px;';
    title.textContent = '战斗结束 · ' + winner + '获胜';
    box.appendChild(title);
    
    let switchBtn = document.createElement('button');
    switchBtn.textContent = '按输出排序';
    switchBtn.style.cssText = 'background:#3a3a6e;color:#eee;border:1px solid #555;padding:6px 14px;border-radius:4px;cursor:pointer;margin-bottom:8px;';
    let sortBy = 'dmgDealt';
    switchBtn.onclick = () => {
        sortBy = sortBy === 'dmgDealt' ? 'dmgTaken' : 'dmgDealt';
        switchBtn.textContent = sortBy === 'dmgDealt' ? '按输出排序' : '按承伤排序';
        renderTable();
    };
    box.appendChild(switchBtn);
    
    let tableDiv = document.createElement('div');
    tableDiv.style.maxHeight = '60vh';
    tableDiv.style.overflowY = 'auto';
    box.appendChild(tableDiv);
    
    function renderTable() {
        tableDiv.innerHTML = '';
        let sorted = [...allUnits].sort((a,b) => (b[sortBy]||0) - (a[sortBy]||0));
        let table = document.createElement('table');
        table.style.cssText = 'width:100%;font-size:12px;color:#ddd;border-collapse:collapse;';
        table.innerHTML = `
            <tr style="background:#2a2a4e;color:#ffd700;">
                <th style="min-width:120px;">名称（阵营·职业）</th><th>输出</th><th>承伤</th><th>治疗</th><th>闪避</th><th>暴击</th><th>存活回合</th><th>状态</th>
            </tr>`;
        sorted.forEach(u => {
            let row = document.createElement('tr');
            row.style.borderBottom = '1px solid #333';
            row.innerHTML = `
                <td style="font-size:11px;">${u.camp==='ally'?'🔵':''}${u.name}${u.isZhang?'·无忌':''}${u.isWei?'·蝠王':''} <span style="color:#888;">${u.role}</span></td>
                <td>${u.dmgDealt||0}</td>
                <td>${u.dmgTaken||0}</td>
                <td>${u.healDone||0}</td>
                <td>${u.dodgeCount||0}</td>
                <td>${u.critCount||0}</td>
                <td>${u.survivedRounds||0}</td>
                <td>${u.alive?'✅存活':'💀阵亡'}</td>`;
            table.appendChild(row);
        });
        tableDiv.appendChild(table);
    }
    renderTable();
    
    let btnDiv = document.createElement('div');
    btnDiv.style.cssText = 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;';
    
    let copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 复制战报';
    copyBtn.style.cssText = 'background:#4caf50;color:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;font-weight:bold;';
    copyBtn.onclick = () => {
        let text = '战斗结果：' + winner + '获胜\n\n';
        text += '--- 明教 ---\n';
        ally.forEach(u => {
            text += `${u.name}(${u.role}) 输出${u.dmgDealt||0} 承伤${u.dmgTaken||0} 治疗${u.healDone||0} 闪避${u.dodgeCount||0} 暴击${u.critCount||0} ${u.alive?'存活':'阵亡'}\n`;
        });
        text += '\n--- 六大派 ---\n';
        enemy.forEach(u => {
            text += `${u.name}(${u.role}) 输出${u.dmgDealt||0} 承伤${u.dmgTaken||0} 治疗${u.healDone||0} 闪避${u.dodgeCount||0} 暴击${u.critCount||0} ${u.alive?'存活':'阵亡'}\n`;
        });
        navigator.clipboard.writeText(text).then(() => showAlert('战报已复制'));
    };
    btnDiv.appendChild(copyBtn);
    
    let exportBtn = document.createElement('button');
    exportBtn.textContent = '📤 导出 JSON';
    exportBtn.style.cssText = 'background:#1565c0;color:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;font-weight:bold;';
    exportBtn.onclick = () => {
        const header = '阵营,名称,角色,输出,承伤,治疗,闪避,暴击,存活回合,状态';
        const rows = [];
        ally.forEach(u => {
            rows.push(`明教,${u.name},${u.role},${u.dmgDealt||0},${u.dmgTaken||0},${u.healDone||0},${u.dodgeCount||0},${u.critCount||0},${u.survivedRounds||0},${u.alive?'存活':'阵亡'}`);
        });
        enemy.forEach(u => {
            rows.push(`六大派,${u.name},${u.role},${u.dmgDealt||0},${u.dmgTaken||0},${u.healDone||0},${u.dodgeCount||0},${u.critCount||0},${u.survivedRounds||0},${u.alive?'存活':'阵亡'}`);
        });
        const csv = header + '\n' + rows.join('\n');
        const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'battle_report_' + Date.now() + '.csv';
        a.click();
    };
    btnDiv.appendChild(exportBtn);
    
    let closeBtn = document.createElement('button');
    closeBtn.textContent = '关闭';
    closeBtn.style.cssText = 'background:#666;color:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;font-weight:bold;';
    closeBtn.onclick = () => {
        overlay.style.display = 'none';
        // 已有浮动按钮则复用
        let floatBtn = document.getElementById('battleReportFloat');
        if (!floatBtn) {
            floatBtn = document.createElement('div');
            floatBtn.id = 'battleReportFloat';
            floatBtn.className = 'vote-float';
            floatBtn.style.display = 'flex';
            floatBtn.style.right = '20px';
            floatBtn.style.bottom = '100px';
            floatBtn.title = '恢复战报';
            floatBtn.innerHTML = '📊';
            floatBtn.addEventListener('click', () => {
                overlay.style.display = 'flex';
                floatBtn.remove();
            });
            // 游戏重置时自动销毁
            const unsubscribe = GlobalStore.on('gs', (newGs) => {
                if (newGs === 'IDLE') {
                    if (floatBtn.parentNode) floatBtn.remove();
                    unsubscribe();
                }
            });
            document.body.appendChild(floatBtn);
        }
    };
    btnDiv.appendChild(closeBtn);
    
    box.appendChild(btnDiv);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

// ==================== 音乐设置弹窗 ====================
export function showMusicPanel() {
    const existing = document.getElementById('musicPanelOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'musicPanelOverlay';
    overlay.className = 'modal-overlay';
    overlay.style.background = 'rgba(0,0,0,0.7)';

    const box = document.createElement('div');
    box.className = 'modal-box';
    box.style.cssText = 'max-width:380px;background:#1a1a2e;color:#eee;padding:20px;position:relative;';

    const title = document.createElement('div');
    title.textContent = '🎵 音乐设置';
    title.style.cssText = 'color:#ffd700;font-size:16px;font-weight:bold;margin-bottom:16px;';
    box.appendChild(title);

    const muteRow = document.createElement('div');
    muteRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
    muteRow.innerHTML = '<span>🔇 全局静音</span>';
    const muteCheck = document.createElement('input');
    muteCheck.type = 'checkbox';
    muteCheck.checked = false;
    muteCheck.style.width = '20px'; muteCheck.style.height = '20px';
    muteCheck.onchange = () => {
        if (muteCheck.checked) {
            AudioManager.pause();
            AudioManager.enabled = false;
        } else {
            AudioManager.enabled = true;
            if (AudioManager.audio && AudioManager.audio.paused) AudioManager.play();
        }
    };
    muteRow.appendChild(muteCheck);
    box.appendChild(muteRow);

    const bgmRow = document.createElement('div');
    bgmRow.style.marginBottom = '12px';
    bgmRow.innerHTML = '<span>🎼 背景音乐：<span id="musicBgmLabel">50%</span></span>';
    const bgmSlider = document.createElement('input');
    bgmSlider.id = 'musicBgmSlider';
    bgmSlider.type = 'range'; bgmSlider.min = '0'; bgmSlider.max = '100';
    bgmSlider.value = 50;
    bgmSlider.style.width = '100%';
    bgmSlider.oninput = () => {
        const vol = parseInt(bgmSlider.value) / 100;
        AudioManager.setVolume(vol);
        document.getElementById('musicBgmLabel').textContent = Math.round(vol * 100) + '%';
    };
    bgmRow.appendChild(bgmSlider);
    box.appendChild(bgmRow);

    const sfxRow = document.createElement('div');
    sfxRow.style.marginBottom = '12px';
    sfxRow.innerHTML = '<span>💥 音效：<span id="musicSfxLabel">30%</span></span>';
    const sfxSlider = document.createElement('input');
    sfxSlider.type = 'range'; sfxSlider.min = '0'; sfxSlider.max = '100';
    sfxSlider.value = 30;
    sfxSlider.style.width = '100%';
    sfxSlider.oninput = () => {
        AudioManager.sfxVolume = parseInt(sfxSlider.value) / 100;
        document.getElementById('musicSfxLabel').textContent = Math.round(AudioManager.sfxVolume * 100) + '%';
    };
    sfxRow.appendChild(sfxSlider);
    box.appendChild(sfxRow);

    const sourceRow = document.createElement('div');
    sourceRow.style.marginBottom = '12px';
    sourceRow.innerHTML = '<span style="display:block;margin-bottom:6px;">📻 音源选择</span>';
    const sources = ['local', 'mute'];
    const labels = ['本地', '静音'];
    sources.forEach((src, idx) => {
        const label = document.createElement('label');
        label.style.marginRight = '12px';
        const radio = document.createElement('input');
        radio.type = 'radio'; radio.name = 'musicSource'; radio.value = src;
        radio.checked = (AudioManager.currentSource === src);
        radio.onchange = () => {
            if (radio.checked) {
                AudioManager.switchSource(src);
                if (src === 'mute') {
                    muteCheck.checked = true;
                    AudioManager.enabled = false;
                } else {
                    muteCheck.checked = false;
                    AudioManager.enabled = true;
                }
            }
        };
        label.appendChild(radio);
        label.appendChild(document.createTextNode(' ' + labels[idx]));
        sourceRow.appendChild(label);
    });
    box.appendChild(sourceRow);

    const bottomClose = document.createElement('button');
    bottomClose.textContent = '关闭';
    bottomClose.style.cssText = 'display:block;width:100%;margin-top:12px;padding:10px;background:#444;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;';
    bottomClose.onclick = () => overlay.remove();
    box.appendChild(bottomClose);

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

// ==================== 投票弹窗 ====================
export function showVoteDialog(callback, battleHasZhang) {
    let hasZhang = battleHasZhang || false;
    let text = '你看好哪边？' + (hasZhang ? ' (张无忌在场，猜对双倍积分!)' : '');
    let mainBtn = document.getElementById('btnMain');
    if (mainBtn) mainBtn.disabled = true;
    showModal(text, [
        {text:'六大派', value:'六大派', cls:'enemy'},
        {text:'明教', value:'明教', cls:'ming'},
        {text:'放弃', value:'skip', cls:'skip'}
    ], (choice) => {
        GlobalStore.set('voteChoice', choice);
        if (choice === '明教') document.getElementById('labelAlly').textContent = '🚩明 教';
        else if (choice === '六大派') document.getElementById('labelEnemy').textContent = '🚩六大派';
        document.getElementById('voteModalOverlay')?.remove();
        if (callback) callback(choice);
    }, true, false);
}

// ==================== 倒计时 ====================
export async function showCountdown(trashTalkAlly, trashTalkEnemy, randFn, showDanmakuFn, autoScrollLogFn) {
    let nums = ['3', '2', '1'];
    let mainBtn = document.getElementById('btnMain');
    mainBtn.disabled = true;
    for (let i = 0; i < nums.length; i++) {
        let div = document.createElement('div');
        div.className = 'countdown-num';
        div.textContent = nums[i];
        document.body.appendChild(div);
        await new Promise(r => setTimeout(r, 700));
        if (div.parentNode) div.parentNode.removeChild(div);
        if (i === 0) {
            let t = trashTalkAlly[randFn(0, trashTalkAlly.length - 1)];
            showDanmakuFn({camp:'ally', pos:5}, t);
            let l = document.getElementById('log');
            let d = document.createElement('div');
            d.innerHTML = `<span class="blue">🗯️ 明教：${t}</span><br>`;
            l.appendChild(d);
            autoScrollLogFn();
        }
        if (i === 1) {
            let t = trashTalkEnemy[randFn(0, trashTalkEnemy.length - 1)];
            showDanmakuFn({camp:'enemy', pos:5}, t);
            let l = document.getElementById('log');
            let d = document.createElement('div');
            d.innerHTML = `<span class="orange">🗯️ 六大派：${t}</span><br>`;
            l.appendChild(d);
            autoScrollLogFn();
        }
        await new Promise(r => setTimeout(r, 500));
    }
}