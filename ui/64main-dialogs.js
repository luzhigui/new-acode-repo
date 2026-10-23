// ui/64main-dialogs.js — 主界面弹窗（战报 / 音乐 / 投票 / 倒计时 / 日志工具）
// V6.5.0 | 2026-10-14 | ~30600 bytes
// 「📂 播放战报文件」经 GlobalStore.getUIHandler('startReplayFromFile') 取，不 import 76——
//   本文件已被 63 import，再 import 76 会让 63→64→76→63 成环。
export const VER = 'ui/64main-dialogs.js V6.5.0';

import { showModal, showAlert, copyLogToClipboard } from './60main-utils.js';
import { AudioManager } from '../modules/22audio-manager.js';
import { GlobalStore, getPlayerContext } from '../infra/54-global-store.js';
import { CAMP_TYPES } from '../infra/56-battle-enums.js';
import { CONFIG } from '../core/01config-5v5-test.js';
import { stepVoteOpen, stepCountdown } from './71tutorial.js';
import { getBattleRecording, attachSaveBattleReportButton } from '../player/50battle-export.js';
import { injectLogAnalyzeStyle, analyzeBattleFacts } from '../player/51-battle-log-analyze.js';
import { buildVoiceControls } from './73voice-panel.js';

// 战报弹窗
// 弹窗-战报：战斗结束统计数据展示+导出
export function showBattleReport(battleResultForInfo) {
    // 不在 GAMEOVER 状态不弹窗
    if (getPlayerContext().gs !== 'GAMEOVER') return;
    // 清理旧战报残留，避免旧 overlay 拦截
    const oldOverlay = document.getElementById('battleReportOverlay');
    if (oldOverlay) oldOverlay.remove();
    const oldFloat = document.getElementById('battleReportFloat');
    if (oldFloat) oldFloat.remove();
    // 去 window 桥：直接走 playerContext
    const _pc = getPlayerContext();
    if (_pc && _pc.updateScoreBadge) _pc.updateScoreBadge();

    // 数据源统一走 battleResultForInfo（含已被 3 秒清理机制移除的死单位快照）
    // c.UI 是开局前快照，GAMEOVER 时已过时，不再作为 fallback
    if (!battleResultForInfo || !battleResultForInfo.ally || !battleResultForInfo.enemy) {
        console.error('[showBattleReport] battleResultForInfo 缺失，无法生成战报');
        return;
    }
    let ally = battleResultForInfo.ally;
    let enemy = battleResultForInfo.enemy;
    let allUnits = [...ally, ...enemy];
    let winner = battleResultForInfo.winner;

    let overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.background = 'rgba(0,0,0,0.85)';
    overlay.id = 'battleReportOverlay';

    let box = document.createElement('div');
    box.className = 'modal-box';
    box.style.cssText = 'background:#1a1a2e;border:2px solid #ffd700;border-radius:12px;padding:20px;max-width:min(580px,94vw);max-height:90vh;box-sizing:border-box;color:#eee;position:relative;display:flex;flex-direction:column;overflow:hidden;';

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
    title.style.cssText = 'color:#ffd700;font-size:18px;font-weight:bold;text-align:center;margin-bottom:12px;flex-shrink:0;';
    title.textContent = '战斗结束 · ' + winner + '获胜';
    box.appendChild(title);
    
    // 排序按钮横排三枚：输出 / 承伤 / 治疗，点击即按该列排序
    let sortBy = 'dmgDealt';
    const sortBtns = {};
    const sortBtnDiv = document.createElement('div');
    sortBtnDiv.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;flex-shrink:0;';
    [['dmgDealt', '按输出排序'], ['dmgTaken', '按承伤排序'], ['healDone', '按治疗排序']].forEach(([key, label]) => {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.cssText = 'background:#3a3a6e;color:#eee;border:1px solid #555;padding:6px 14px;border-radius:4px;cursor:pointer;';
        btn.onclick = () => { sortBy = key; renderTable(); };
        sortBtns[key] = btn;
        sortBtnDiv.appendChild(btn);
    });
    box.appendChild(sortBtnDiv);
    
    let tableDiv = document.createElement('div');
    tableDiv.style.cssText = 'flex:1 1 auto;min-height:0;min-width:0;overflow:auto;';
    box.appendChild(tableDiv);

    // 走势分析容器（默认隐藏，点「📊 走势分析」后渲染内存 battleLog，与工具箱 107 共用 player/51）
    // 挂 hex-log-box 类以复用其表格/卡片样式，内联覆盖外观融入战报弹窗
    let analysisDiv = document.createElement('div');
    analysisDiv.className = 'hex-log-box';
    analysisDiv.style.cssText = 'display:none;background:transparent;border:none;padding:0;width:100%;max-height:none;min-width:0;flex:1 1 auto;min-height:0;overflow:auto;font-size:12px;';
    box.appendChild(analysisDiv);

    function renderTable() {
        tableDiv.innerHTML = '';
        let sorted = [...allUnits].sort((a,b) => (b[sortBy]||0) - (a[sortBy]||0));
        // 当前排序按钮高亮，其余恢复默认色
        Object.entries(sortBtns).forEach(([key, btn]) => {
            btn.style.background = key === sortBy ? '#6a5acd' : '#3a3a6e';
        });
        let table = document.createElement('table');
        table.style.cssText = 'width:100%;font-size:12px;color:#ddd;border-collapse:collapse;';
        table.innerHTML = `
            <tr style="background:#2a2a4e;color:#ffd700;">
                <th style="min-width:120px;padding:3px 10px;">名称（阵营·职业）</th><th style="padding:3px 10px;">输出</th><th style="padding:3px 10px;">承伤</th><th style="padding:3px 10px;">治疗</th><th style="padding:3px 10px;">闪避</th><th style="padding:3px 10px;">暴击</th><th style="padding:3px 10px;">存活回合</th><th style="padding:3px 10px;">状态</th>
            </tr>`;
        sorted.forEach(u => {
            let row = document.createElement('tr');
            row.style.borderBottom = '1px solid #333';
            row.innerHTML = `
                <td style="font-size:11px;padding:3px 10px;">${u.camp===CAMP_TYPES.ALLY?'🔵':''}${u.name}${u.isZhang?'·无忌':''}${u.isWei?'·蝠王':''} <span style="color:#888;">${u.role}</span></td>
                <td style="padding:3px 10px;white-space:nowrap;">${Math.round(u.dmgDealt||0)}</td>
                <td style="padding:3px 10px;white-space:nowrap;">${Math.round(u.dmgTaken||0)}</td>
                <td style="padding:3px 10px;white-space:nowrap;">${Math.round(u.healDone||0)}</td>
                <td style="padding:3px 10px;white-space:nowrap;">${Math.round(u.dodgeCount||0)}</td>
                <td style="padding:3px 10px;white-space:nowrap;">${Math.round(u.critCount||0)}</td>
                <td style="padding:3px 10px;white-space:nowrap;">${Math.round(u.survivedRounds||0)}</td>
                <td style="padding:3px 10px;white-space:nowrap;">${u.alive?'✅存活':'💀阵亡'}</td>`;
            table.appendChild(row);
        });
        tableDiv.appendChild(table);
    }
    renderTable();
    
    let btnDiv = document.createElement('div');
    btnDiv.style.cssText = 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;flex-shrink:0;';

    // 整场回放文件：取本局录制（GAMEOVER 时 finishBattleRecording 已定稿）
    attachSaveBattleReportButton(btnDiv, () => getBattleRecording());

    // 一键走势分析：把内存 battleLog 拍平喂给 player/51（与工具箱 107 同一套解析/叙事/图表）
    let analyzeBtn = document.createElement('button');
    analyzeBtn.textContent = '📊 走势分析';
    analyzeBtn.style.cssText = 'background:#6a3de0;color:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;font-weight:bold;';
    let analysisShown = false;
    let analysisRendered = false;
    analyzeBtn.onclick = () => {
        analysisShown = !analysisShown;
        if (analysisShown) {
            if (!analysisRendered) {
                injectLogAnalyzeStyle();
                const facts = GlobalStore.get('battleFacts') || [];
                const r = analyzeBattleFacts(facts, { winner });
                analysisDiv.innerHTML = `<div class="hex-log-summary" style="display:flex">${r.summaryHtml}</div>` + r.bodyHtml;
                analysisRendered = true;
            }
            tableDiv.style.display = 'none';
            sortBtnDiv.style.display = 'none';
            analysisDiv.style.display = 'block';
            analyzeBtn.textContent = '↩️ 返回数据表';
            copyAnalysisBtn.style.display = '';
        } else {
            tableDiv.style.display = 'block';
            sortBtnDiv.style.display = 'flex';
            analysisDiv.style.display = 'none';
            analyzeBtn.textContent = '📊 走势分析';
            copyAnalysisBtn.style.display = 'none';
        }
    };
    btnDiv.appendChild(analyzeBtn);

    let copyAnalysisBtn = document.createElement('button');
    copyAnalysisBtn.textContent = '📋 复制分析';
    copyAnalysisBtn.style.cssText = 'background:#37474f;color:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;font-weight:bold;display:none;';
    copyAnalysisBtn.onclick = () => {
        const text = analysisDiv.innerText;
        navigator.clipboard.writeText(text).then(() => {
            copyAnalysisBtn.textContent = '✅ 已复制';
            setTimeout(() => { copyAnalysisBtn.textContent = '📋 复制分析'; }, 2000);
        }).catch(() => alert('复制失败，请手动选择文本'));
    };
    btnDiv.appendChild(copyAnalysisBtn);

    let copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 复制战报';
    copyBtn.style.cssText = 'background:#4caf50;color:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;font-weight:bold;';
    copyBtn.onclick = () => {
        let text = '战斗结果：' + winner + '获胜\n\n';
        text += '--- 明教 ---\n';
        ally.forEach(u => {
            text += `${u.name}(${u.role}) 输出${Math.round(u.dmgDealt||0)} 承伤${Math.round(u.dmgTaken||0)} 治疗${Math.round(u.healDone||0)} 闪避${Math.round(u.dodgeCount||0)} 暴击${Math.round(u.critCount||0)} ${u.alive?'存活':'阵亡'}\n`;
        });
        text += '\n--- 六大派 ---\n';
        enemy.forEach(u => {
            text += `${u.name}(${u.role}) 输出${Math.round(u.dmgDealt||0)} 承伤${Math.round(u.dmgTaken||0)} 治疗${Math.round(u.healDone||0)} 闪避${Math.round(u.dodgeCount||0)} 暴击${Math.round(u.critCount||0)} ${u.alive?'存活':'阵亡'}\n`;
        });
        navigator.clipboard.writeText(text).then(() => showAlert('战报已复制'));
    };
    btnDiv.appendChild(copyBtn);
    

    

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

// 音乐设置弹窗
// 弹窗-音乐：BGM/音效音量+音源选择
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
    // 手机竖屏溢出修复：塞入解说区后面板超一屏，底部按钮被浏览器地址栏挡住——限高+内部滚动
    box.style.maxHeight = '82vh';
    box.style.overflowY = 'auto';
    box.style.webkitOverflowScrolling = 'touch';

    const title = document.createElement('div');
    title.textContent = '🎵 音乐设置';
    title.style.cssText = 'color:#ffd700;font-size:16px;font-weight:bold;margin-bottom:16px;cursor:pointer;user-select:none;';
    box.appendChild(title);

    // BGM 曲目选择（默认仅展示前两首；标题连点 5 次解锁隐藏曲目）
    let trackRow = document.createElement('div');
    trackRow.style.marginBottom = '12px';
    let hiddenUnlocked = false;
    let titleClicks = 0;

    function renderTracks() {
        const tracks = CONFIG.BGM_TRACKS || [];
        const shown = hiddenUnlocked ? tracks : tracks.slice(0, 2);
        trackRow.innerHTML = '<span style="display:block;margin-bottom:6px;">🎶 背景音乐曲目</span>';
        shown.forEach(t => {
            const label = document.createElement('label');
            label.style.display = 'block';
            label.style.margin = '4px 0';
            label.style.cursor = 'pointer';
            const radio = document.createElement('input');
            radio.type = 'radio'; radio.name = 'musicTrack'; radio.value = t.id;
            radio.checked = (AudioManager.currentBgmId === t.id);
            radio.onchange = () => {
                if (radio.checked) AudioManager.switchBgm(t.id);
            };
            label.appendChild(radio);
            label.appendChild(document.createTextNode(' ' + t.name));
            trackRow.appendChild(label);
        });
    }
    title.addEventListener('click', () => {
        titleClicks++;
        if (titleClicks >= 5 && !hiddenUnlocked) {
            hiddenUnlocked = true;
            renderTracks();
        }
    });
    renderTracks();
    box.appendChild(trackRow);

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
            AudioManager.play();
        }
    };
    muteRow.appendChild(muteCheck);
    box.appendChild(muteRow);

    const bgmRow = document.createElement('div');
    bgmRow.style.marginBottom = '12px';
    const savedVolText = Math.round(parseFloat(localStorage.getItem('ming_bgm_volume') || '0.5') * 100) + '%';
    bgmRow.innerHTML = '<span>🎼 背景音乐：<span id="musicBgmLabel">' + savedVolText + '</span></span>';
    const bgmSlider = document.createElement('input');
    bgmSlider.id = 'musicBgmSlider';
    bgmSlider.type = 'range'; bgmSlider.min = '0'; bgmSlider.max = '100';
    const savedVol = parseFloat(localStorage.getItem('ming_bgm_volume') || '0.5');
    bgmSlider.value = Math.round(savedVol * 100);
    bgmSlider.style.width = '100%';
    bgmSlider.oninput = () => {
        const vol = parseInt(bgmSlider.value) / 100;
        // 优先操作 AudioManager 节点
        if (AudioManager && AudioManager.bgmGainNode) {
            const ctx = AudioManager.bgmGainNode.context;
            AudioManager.bgmGainNode.gain.setValueAtTime(vol, ctx.currentTime);
        } else if (AudioManager.setVolume) {
            AudioManager.setVolume(vol);
        }
        // 兜底：操作全局 bgmGainNode
        if (typeof window.bgmGainNode !== 'undefined' && window.bgmGainNode) {
            try {
                const ctx = window.bgmGainNode.context;
                window.bgmGainNode.gain.setValueAtTime(vol, ctx.currentTime);
            } catch (e) {}
        }
        try { localStorage.setItem('ming_bgm_volume', String(vol)); } catch (e) {}
        const label = document.getElementById('musicBgmLabel');
        if (label) label.textContent = Math.round(vol * 100) + '%';
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

    // 语音解说设置区嵌入音乐面板（原独立 🎙️ 按钮撤掉，声音相关收进一个面板）
    buildVoiceControls(box);

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

// 投票弹窗
// 弹窗-投票：战斗前预测胜负（张无忌双倍）
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
    stepVoteOpen();
}

// 倒计时
// 弹窗-倒计时：3-2-1动画+垃圾话弹幕
export async function showCountdown(trashTalkAlly, trashTalkEnemy, randFn, showDanmakuFn, autoScrollLogFn) {
    stepCountdown();
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
            showDanmakuFn({camp:CAMP_TYPES.ALLY, pos:5}, t);
            let l = document.getElementById('log');
            let d = document.createElement('div');
            d.innerHTML = `<span class="blue">🗯️ 明教：${t}</span><br>`;
            l.appendChild(d);
            autoScrollLogFn();
        }
        if (i === 1) {
            let t = trashTalkEnemy[randFn(0, trashTalkEnemy.length - 1)];
            showDanmakuFn({camp:CAMP_TYPES.ENEMY, pos:5}, t);
            let l = document.getElementById('log');
            let d = document.createElement('div');
            d.innerHTML = `<span class="orange">🗯️ 六大派：${t}</span><br>`;
            l.appendChild(d);
            autoScrollLogFn();
        }
        await new Promise(r => setTimeout(r, 500));
    }
}

// 日志工具弹窗（从 ui/68 迁入，2026-10-14）：68↔76 的循环引用就断在这里——
//   68 不再 import 76（本函数搬走后 68 里没人用 startReplayFromFile），
//   本文件也不 import 76（回放入口经 UIHandler 通道取，见下方 onclick），
//   61 的 bindCopyLogButton 改从本文件引（见 61 的 import 改动）。
export function bindCopyLogButton(showModal, copyLogToClipboard) {
    document.getElementById('copyLog').addEventListener('click', () => {
        // 移除已有弹窗
        const existing = document.getElementById('logPanelOverlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'logPanelOverlay';
        overlay.className = 'modal-overlay';
        overlay.style.background = 'rgba(0,0,0,0.7)';

        const box = document.createElement('div');
        box.className = 'modal-box';
        box.style.cssText = 'max-width:340px;background:var(--c-dark);color:#eee;padding:20px;position:relative;border:2px solid var(--c-gold-bright);border-radius:12px;';

        // 标题
        const title = document.createElement('div');
        title.textContent = '📋 日志工具';
        title.style.cssText = 'color:var(--c-gold-bright);font-size:16px;font-weight:bold;margin-bottom:16px;text-align:center;';
        box.appendChild(title);

        // ── 日志复制区 ──
        const copySection = document.createElement('div');
        copySection.style.cssText = 'margin-bottom:12px;';
        copySection.innerHTML = '<div style="color:#aaa;font-size:11px;margin-bottom:6px;">📝 日志复制</div>';

        const copyBtns = [
            { text: '📋 普通日志', value: 'normal', desc: '不含体检/版本信息' },
            { text: '📋 全部日志', value: 'all', desc: '包含所有内容' },
            { text: '📋 最新15行', value: 'recent15', desc: '最近15条记录' }
        ];
        copyBtns.forEach(b => {
            const btn = document.createElement('button');
            btn.textContent = b.text;
            btn.title = b.desc;
            btn.style.cssText = 'display:block;width:100%;margin-bottom:4px;padding:8px;background:#2a2a4e;color:#eee;border:1px solid #555;border-radius:6px;font-size:12px;cursor:pointer;text-align:left;';
            btn.onclick = () => {
                overlay.remove();
                copyLogToClipboard(b.value);
            };
            copySection.appendChild(btn);
        });
        box.appendChild(copySection);

        // ── 战报区 ──
        const replaySection = document.createElement('div');
        replaySection.style.cssText = 'margin-bottom:12px;';
        replaySection.innerHTML = '<div style="color:#aaa;font-size:11px;margin-bottom:6px;">🎬 战报回放</div>';

        const replayBtnRow = document.createElement('div');
        replayBtnRow.style.cssText = 'display:flex;gap:4px;align-items:stretch;';
        attachSaveBattleReportButton(replayBtnRow, () => getBattleRecording());
        // attach 出来的按钮自带大按钮样式，压成面板小号
        const saveBtn = replayBtnRow.querySelector('button');
        if (saveBtn) saveBtn.style.cssText = 'flex:1;padding:8px;background:#6a1b9a;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-weight:bold;';

        const playFileBtn = document.createElement('button');
        playFileBtn.textContent = '📂 播放战报文件';
        playFileBtn.style.cssText = 'flex:1;padding:8px;background:#2a2a4e;color:#eee;border:1px solid #6a1b9a;border-radius:6px;font-size:12px;cursor:pointer;';
        playFileBtn.onclick = () => {
            overlay.remove();
            // 回放入口走 UIHandler 通道（76 顶层注册）：本文件不 import 76，避免 63→64→76→63 成环
            const fn = GlobalStore.getUIHandler('startReplayFromFile');
            if (typeof fn === 'function') fn();
        };
        replayBtnRow.appendChild(playFileBtn);
        replaySection.appendChild(replayBtnRow);
        box.appendChild(replaySection);

        // ── 分隔线 ──
        const divider = document.createElement('div');
        divider.style.cssText = 'border-top:1px solid #444;margin:12px 0;';
        box.appendChild(divider);

        // ── 关闭按钮 ──
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '关闭';
        closeBtn.style.cssText = 'display:block;width:100%;padding:8px;background:#444;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;';
        closeBtn.onclick = () => overlay.remove();
        box.appendChild(closeBtn);

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
    });
}