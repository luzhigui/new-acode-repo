// tests/38health-monitor.js - 光明顶5v5 实时体检监控器
// V5.0.9 | 交互元素移至HTML、手动不影响频率、报告手动置顶、死亡原因、胜利弹幕5s
export const VER = 'tests/38health-monitor.js V5.0.9';

import { rule60 } from './37health-rules/60-separator.js';
import { rule61 } from './37health-rules/61-boneclaw.js';
import { rule62 } from './37health-rules/62-speed-button.js';
import { rule63 } from './37health-rules/63-carry-hp.js';
import { rule64 } from './37health-rules/64-horse.js';
import { rule65 } from './37health-rules/65-swap.js';

import { rule67 } from './37health-rules/67-cloud-dodge.js';
import { rule68 } from './37health-rules/68-dodge-rebound.js';
import {
    getCellElement, checkUnitHpValidity, checkDeathMark,
    checkHpBarSync, checkHpBarColor, checkFxOrphans,
    checkDeathFxRetention, checkVictoryDanmaku
} from './46health-utils.js';

let monitorActive = false, gameLoaded = false, scanTimer = null, isPaused = false;
let detectedIssues = [], issueKeys = new Set(), lastSampledStage = 0;
let battleEnded = false, battleStartTime = 0;
let gameFrame, gameArea, reportArea, statusLine;

export function initMonitor() {
    gameArea = document.getElementById('gameArea');
    reportArea = document.getElementById('reportArea');
    gameFrame = document.getElementById('gameFrame');
    const btnStartMonitor = document.getElementById('btnStartMonitor');
    const btnStopMonitor = document.getElementById('btnStopMonitor');
    const btnViewReport = document.getElementById('btnViewReport');
    const btnClearReport = document.getElementById('btnClearReport');
    const freqButtons = document.querySelectorAll('#freqGroup button[data-freq]');
    const manualOverlay = document.getElementById('healthManualOverlay');
    const manualText = document.getElementById('healthManualText');
    const manualOk = document.getElementById('healthManualOk');
    const manualCancel = document.getElementById('healthManualCancel');
    const confirmOverlay = document.getElementById('healthConfirmOverlay');
    const confirmText = document.getElementById('healthConfirmText');
    const confirmOk = document.getElementById('healthConfirmOk');
    const confirmCancel = document.getElementById('healthConfirmCancel');
    const backBtn = document.getElementById('btnBackToGame');
    statusLine = document.getElementById('statusLine');

    let scanInterval = 200;

    const getWin = () => { try { return gameFrame.contentWindow; } catch (e) { return null; } };
    const getDoc = () => { try { return gameFrame.contentDocument || getWin().document; } catch (e) { return null; } };
    const getCtx = () => { const w = getWin(); if (!w || !w._getPlayerContext) return null; try { return w._getPlayerContext(); } catch (e) { return null; } };
    const detectStage = (doc) => { if (!doc) return 0; const l = doc.getElementById('labelEnemy'); if (!l) return 0; const m = (l.textContent || '').match(/第(\d+)关/); return m ? parseInt(m[1]) : 0; };

    const startScanTimer = () => { if (scanTimer) clearInterval(scanTimer); scanTimer = setInterval(periodicScan, scanInterval); };
    const stopScanTimer = () => { if (scanTimer) { clearInterval(scanTimer); scanTimer = null; } };

    // ==================== 手动记录弹窗 ====================
    let manualConfirmCallback = null;

    function showManualInput() {
        manualOverlay.style.display = 'flex';
        manualText.value = '';
        manualText.focus();
    }

    function hideManualInput() {
        manualOverlay.style.display = 'none';
        // 恢复频率按钮高亮
        freqButtons.forEach(b => b.classList.remove('active'));
        const currentActive = document.querySelector(`#freqGroup button[data-freq="${scanInterval}"]`);
        if (currentActive) currentActive.classList.add('active');
        else {
            const def = document.querySelector('#freqGroup button[data-freq="200"]');
            if (def) def.classList.add('active');
        }
    }

    manualOk.addEventListener('click', () => {
        const text = (manualText.value || '').trim();
        if (text) {
            const ctx = getCtx();
            const stage = detectStage(getDoc()) || (ctx ? ctx.currentStage : 0) || 0;
            detectedIssues.push({ stage, type: '手动', detail: text, source: '手动', timestamp: new Date().toLocaleTimeString() });
            issueKeys.add('manual_' + Date.now());
            updateReport(); updateStatusLine();
        }
        hideManualInput();
    });

    manualCancel.addEventListener('click', hideManualInput);

    // ==================== 清空确认弹窗 ====================
    function showConfirm(text, onOk) {
        confirmText.textContent = text;
        confirmOverlay.style.display = 'flex';
        manualConfirmCallback = onOk;
    }

    function hideConfirm() {
        confirmOverlay.style.display = 'none';
        manualConfirmCallback = null;
    }

    confirmOk.addEventListener('click', () => {
        if (manualConfirmCallback) manualConfirmCallback();
        hideConfirm();
    });

    confirmCancel.addEventListener('click', hideConfirm);

    // ==================== 返回游戏按钮 ====================
    backBtn.addEventListener('click', () => {
        reportArea.classList.remove('active');
        gameArea.classList.add('active');
    });

    // ==================== 频率按钮 ====================
    freqButtons.forEach(btn => btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.freq);
        if (val === 0) {
            showManualInput();
            return;
        }
        freqButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        scanInterval = val;
        if (monitorActive) { stopScanTimer(); startScanTimer(); }
        updateStatusLine();
    }));

    // ==================== 主要按钮 ====================
    btnStartMonitor.addEventListener('click', () => {
        if (monitorActive) return;
        gameFrame.src = '../mode-5v5-test.html';
        gameArea.classList.add('active'); reportArea.classList.remove('active');
        btnStartMonitor.disabled = true; btnStartMonitor.textContent = '体检中...';
        btnStopMonitor.disabled = false; btnStopMonitor.textContent = '⏸️ 暂停';
        isPaused = false; monitorActive = true; gameLoaded = false;
        detectedIssues = []; issueKeys.clear(); lastSampledStage = 0;
        battleEnded = false; battleStartTime = 0;
        updateReport(); statusLine.textContent = '正在加载游戏...';
        const waitReady = setInterval(() => {
            const doc = getDoc();
            if (doc && doc.getElementById('coverStartBtn')) doc.getElementById('coverStartBtn').click();
            const ctx = getCtx();
            if (ctx && ctx.UI && ctx.UI.allyTeam && ctx.UI.allyTeam.length >= 1) {
                clearInterval(waitReady); gameLoaded = true;
                const w = getWin();
                if (w && typeof w.selectStage === 'function') w.selectStage(4);
                startScanTimer();
                updateStatusLine();
            }
        }, 500);
    });

    btnStopMonitor.addEventListener('click', () => {
        if (!monitorActive) return;
        if (isPaused) {
            isPaused = false; btnStopMonitor.textContent = '⏸️ 暂停';
            startScanTimer(); statusLine.textContent = '监控运行中...';
        } else {
            isPaused = true; btnStopMonitor.textContent = '▶️ 继续';
            stopScanTimer(); statusLine.textContent = '监控已暂停';
        }
    });

    btnViewReport.addEventListener('click', () => {
        gameArea.classList.remove('active');
        reportArea.classList.add('active');
        backBtn.style.display = 'inline-block';
        reportArea.scrollTop = 0;
    });

    btnClearReport.addEventListener('click', () => {
        showConfirm('确定清空所有异常记录吗？', () => {
            detectedIssues = []; issueKeys.clear(); updateReport(); updateStatusLine();
        });
    });

    btnStartMonitor.disabled = false; btnStopMonitor.disabled = true;
    statusLine.textContent = '点击"开始体检"加载游戏并启动监控';
}

// ==================== 定时扫描 ====================
function periodicScan() {
    if (!monitorActive || !gameLoaded || isPaused) return;
    const win = gameFrame.contentWindow;
    const doc = gameFrame.contentDocument || win.document;
    const ctx = win._getPlayerContext ? win._getPlayerContext() : null;
    if (!ctx || !doc) return;

    if (ctx.gs === 'RUNNING' || ctx.gs === 'PAUSED') {
        if (battleStartTime === 0) { battleStartTime = Date.now(); battleEnded = false; }
        runEngineChecks(ctx);
        runUIChecks(ctx, doc);
    }
    if (ctx.gs === 'GAMEOVER' && battleStartTime > 0 && !battleEnded) {
        battleEnded = true;
        setTimeout(() => {
            if (!monitorActive) return;
            const ctx2 = (() => { const w = gameFrame.contentWindow; return w && w._getPlayerContext ? w._getPlayerContext() : null; })();
            const doc2 = gameFrame.contentDocument || gameFrame.contentWindow.document;
            if (ctx2 && doc2) runFullChecks(ctx2, doc2);
        }, 3000);
    }
}

function runEngineChecks(ctx) {
    const allyTeam = (ctx.UI && ctx.UI.allyTeam) || [];
    const enemyTeam = (ctx.UI && ctx.UI.enemyTeam) || [];
    const allUnits = allyTeam.concat(enemyTeam);
    for (const u of allUnits) {
        for (const msg of checkUnitHpValidity(u)) recordIssue(ctx, u.uid, '血量异常', msg, '引擎');
        for (const msg of checkDeathMark(u)) {
            let detail = msg;
            if (ctx.UI && ctx.UI.currentResult && ctx.UI.currentResult.log) {
                const log = ctx.UI.currentResult.log;
                for (let i = log.length - 1; i >= 0; i--) {
                    const e = log[i];
                    if (e.type === 'attack-group' && e.uidD === u.uid && e.isDead) {
                        detail += '（被' + (e._atkName || '未知') + '击杀）';
                        break;
                    }
                    if (e.type === 'info' && e.uidD === u.uid && e.isDead) {
                        detail += '（致死来源：' + (e.text || '未知').replace(/<[^>]+>/g, '').substring(0, 40) + '）';
                        break;
                    }
                }
            }
            recordIssue(ctx, u.uid, '死亡标记', detail, '引擎');
        }
    }
}

function runUIChecks(ctx, doc) {
    const allyTeam = (ctx.UI && ctx.UI.allyTeam) || [];
    const enemyTeam = (ctx.UI && ctx.UI.enemyTeam) || [];
    const allUnits = allyTeam.concat(enemyTeam);
    for (const unit of allUnits) {
        for (const msg of checkHpBarSync(unit, doc)) recordIssue(ctx, unit.uid, '血条同步', msg, 'UI');
    }
}

function runFullChecks(ctx, doc) {
    const allyTeam = (ctx.UI && ctx.UI.allyTeam) || [];
    const enemyTeam = (ctx.UI && ctx.UI.enemyTeam) || [];
    const allUnits = allyTeam.concat(enemyTeam);
    const stage = (() => { const label = doc.getElementById('labelEnemy'); if (!label) return 0; const m = (label.textContent || '').match(/第(\d+)关/); return m ? parseInt(m[1]) : 0; })() || (ctx.currentStage || 0);
    if (stage === lastSampledStage) return;
    lastSampledStage = stage;

    const win = gameFrame.contentWindow;
    for (const unit of allUnits) {
        for (const msg of checkHpBarColor(unit, win, doc)) recordIssue(ctx, unit.uid, '血条颜色', msg, 'UI');
    }

    for (const msg of checkFxOrphans(doc)) recordIssue(ctx, null, '特效残留', msg, 'UI');

    setTimeout(() => {
        const doc2 = gameFrame.contentDocument || gameFrame.contentWindow.document;
        if (doc2) {
            for (const msg of checkVictoryDanmaku(doc2, allyTeam, enemyTeam)) recordIssue(ctx, null, '胜利弹幕', msg, 'UI');
        }
    }, 5000);

    checkSwapStability(ctx, doc, allyTeam, enemyTeam);

    const deathFxIssues = checkDeathFxRetention(allUnits, doc);
    for (const msg of deathFxIssues) recordIssue(ctx, null, '死亡特效', msg, 'UI');

    let battleLog = [];
    if (ctx.UI && ctx.UI.currentResult && ctx.UI.currentResult.log) {
        battleLog = ctx.UI.currentResult.log;
    }
    ctx._doc = doc;
    const rules = [rule60, rule61, rule62, rule63, rule64, rule65, rule67, rule68];
    const beforeAllies = allyTeam.map(u => ({ ...u }));
    const beforeEnemies = enemyTeam.map(u => ({ ...u }));
    for (const rule of rules) {
        try {
            const result = rule.test(ctx, battleLog, beforeAllies, beforeEnemies, allyTeam, enemyTeam);
            if (result && result.fail) {
                const msgs = (result.msg || '').split(' | ');
                for (const m of msgs) if (m.trim()) recordIssue(ctx, null, m.substring(0, 30), m.trim(), '规则');
            }
        } catch (e) {
            recordIssue(ctx, null, '规则异常', rule.name + ': ' + (e.message || '未知错误'), '系统');
        }
    }
}

function checkSwapStability(ctx, doc, allyTeam, enemyTeam) {
    if (!ctx.UI || !ctx.UI.currentResult || !ctx.UI.currentResult.log) return;
    const battleLog = ctx.UI.currentResult.log;
    const allUnits = allyTeam.concat(enemyTeam);
    const swapEvents = battleLog.filter(e => e.type === 'buff-swap' || e.type === 'buff-push');
    for (const swapEvent of swapEvents) {
        const swapIndex = battleLog.indexOf(swapEvent);
        if (swapIndex === -1) continue;
        const unitA = allUnits.find(u => u.name === swapEvent._swapNameA);
        const unitB = allUnits.find(u => u.name === swapEvent._swapNameB);
        if (!unitA || !unitB) continue;
        [unitA, unitB].forEach(u => {
            if (u.alive && !getCellElement(u, doc)) {
                recordIssue(ctx, u.uid, '换位UI丢失', u.name + '换位后在队伍中存活(pos=' + u.pos + ')，但九宫格中找不到对应格子', 'UI');
            }
        });
        const nextAttacks = battleLog.slice(swapIndex + 1).filter(e => e.type === 'attack-group');
        if (nextAttacks.length > 0) {
            const firstAttack = nextAttacks[0];
            checkPositionAfterSwap(ctx, firstAttack, unitA, swapEvent._swapEnginePosA);
            checkPositionAfterSwap(ctx, firstAttack, unitB, swapEvent._swapEnginePosB);
        }
    }
}

function checkPositionAfterSwap(ctx, attackEntry, unit, expectedPos) {
    if (!unit || expectedPos === undefined) return;
    let actualPos = null;
    if (attackEntry.uidA === unit.uid) actualPos = attackEntry._atkPos;
    if (attackEntry.uidD === unit.uid) actualPos = attackEntry._defPos;
    if (actualPos !== null && actualPos !== undefined && actualPos !== expectedPos) {
        recordIssue(ctx, unit.uid, '换位回弹', '单位' + unit.name + '换位后立刻攻击位置=' + actualPos + '预期=' + expectedPos, 'UI');
    }
}

function recordIssue(ctx, unitUid, type, detail, source) {
    const key = (unitUid || 'global') + '|' + type + '|' + detail.substring(0, 60);
    if (issueKeys.has(key)) return;
    issueKeys.add(key);
    const stage = (() => {
        const doc = gameFrame.contentDocument || gameFrame.contentWindow.document;
        const label = doc.getElementById('labelEnemy');
        if (!label) return 0;
        const m = (label.textContent || '').match(/第(\d+)关/);
        return m ? parseInt(m[1]) : 0;
    })() || (ctx ? ctx.currentStage : 0) || 0;
    detectedIssues.push({ stage, type, detail, source, timestamp: new Date().toLocaleTimeString() });
    updateReport();
    updateStatusLine();
}

function updateStatusLine() {
    if (!statusLine) return;
    if (!monitorActive) { statusLine.textContent = '监控已停止'; return; }
    if (isPaused) { statusLine.textContent = '监控已暂停'; return; }
    statusLine.textContent = `监控运行中 | 异常:${detectedIssues.length}项`;
}

function updateReport() {
    if (!reportArea) return;
    const backBtn = document.getElementById('btnBackToGame');
    if (backBtn) backBtn.remove();
    reportArea.innerHTML = '';
    const order = { '手动': 0, '规则': 1, '引擎': 2, 'UI': 3 };
    const sorted = [...detectedIssues].sort((a, b) => {
        const oa = order[a.source] ?? 99;
        const ob = order[b.source] ?? 99;
        if (oa !== ob) return oa - ob;
        return (a.timestamp || '').localeCompare(b.timestamp || '');
    });
    const grouped = {};
    for (const iss of sorted) {
        const g = `关卡${iss.stage} - ${iss.source} - ${iss.type}`;
        if (!grouped[g]) grouped[g] = [];
        grouped[g].push(iss);
    }
    for (const [g, items] of Object.entries(grouped)) {
        const groupDiv = document.createElement('div');
        groupDiv.dataset.group = g;
        groupDiv.style.cssText = 'color:#ff9800;font-weight:bold;margin-top:8px;';
        groupDiv.textContent = g + ' (' + items.length + '项)';
        reportArea.appendChild(groupDiv);
        for (const iss of items) {
            const issueDiv = document.createElement('div');
            issueDiv.style.cssText = 'color:#f44336;margin-left:10px;';
            issueDiv.innerHTML = `  ❌ ${iss.detail.replace(/\n/g, '<br>')}`;
            reportArea.appendChild(issueDiv);
            const timeDiv = document.createElement('div');
            timeDiv.style.cssText = 'color:#888;font-size:10px;margin-left:24px;';
            timeDiv.textContent = `     ⮑ ${iss.timestamp}`;
            reportArea.appendChild(timeDiv);
        }
    }
    if (backBtn) {
        backBtn.style.display = 'inline-block';
        reportArea.appendChild(backBtn);
    }
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.style.cssText = 'margin-top:10px;padding:8px 16px;background:#3a3a6e;border:1px solid #555;border-radius:6px;color:#ccc;font-size:11px;cursor:pointer;';
    copyBtn.textContent = '📋 复制报告';
    copyBtn.onclick = () => {
        let text = '';
        for (const iss of sorted) {
            text += `关卡${iss.stage} - ${iss.source} - ${iss.type}\n  ❌ ${iss.detail.replace(/<br>/g, '\n  ')}\n\n`;
        }
        navigator.clipboard.writeText(text).then(() => {
            copyBtn.textContent = '✅ 已复制';
            setTimeout(() => { copyBtn.textContent = '📋 复制报告'; }, 1500);
        });
    };
    reportArea.appendChild(copyBtn);
    reportArea.scrollTop = reportArea.scrollHeight;
}