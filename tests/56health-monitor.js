﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// tests/56health-monitor.js - 光明顶5v5 实时体检监控器
// V5.5.0 | 新增 ?auto=1 无头后台模式：后台自动跑完整关卡，结束时在 window.__healthResult 输出完整报告
export const VER = 'tests/56health-monitor.js V5.5.0';

import { rule70 } from './58health-rules/58-claw-heal-spam.js';
import { rule71 } from './58health-rules/59-aftermiss.js';
import { rule72 } from './58health-rules/60-fortify-timing.js';
import { rule73 } from './58health-rules/61-xuanming-link.js';
import { rule74 } from './58health-rules/62-butterfly-stack.js';
import { rule75 } from './58health-rules/63-butterfly-return.js';
import { rule76 } from './58health-rules/64-spider-fly-count.js';
import { rule77 } from './58health-rules/65-fortify-overflow.js';
import { rule78 } from './58health-rules/66-separator-duplicate.js';
import { rule79 } from './58health-rules/67-claw-damage.js';
import { rule80 } from './58health-rules/70-death-effect.js';
import {
    getCellElement, checkUnitHpValidity,
    checkHpBarSync, checkHpBarColor, checkFxOrphans,
    checkDeathFxRetention, checkVictoryDanmaku,
    checkMeleeFxState, checkBuffIcons, locateLogEntry,
    checkBottomButtonStates, checkModeButtonStates
} from './57health-utils.js';

let monitorActive = false, gameLoaded = false, scanTimer = null, isPaused = false;
let detectedIssues = [], issueKeys = new Set(), lastSampledStage = 0;
let battleEnded = false, battleStartTime = 0;
let rulePassCount = 0, ruleSkipCount = 0;
let gameFrame, gameArea, reportArea, statusLine;

// UI 类异常去抖：full-auto 快进下状态机切换极快，渲染常有滞后一拍。
// 同一异常需连续 UI_CONFIRM_TIMES 次采样确认才上报，过滤瞬时时序误报（按钮态/血条/弹幕等）。
const UI_CONFIRM_TIMES = 3;
let pendingIssueCounts = {};

// ==================== 自动/无头后台模式参数 (?auto=1&budget=秒&stages=目标关&speed=速度值) ====================
// 与手动自检模式（55test-runner.html 交互）并行：auto=1 时无人值守自动跑完整关卡，
// 结束（跑完目标关或超时）后在 window.__healthResult 暴露完整报告，供自动化工具快速读取
let autoMode = false, autoBudgetMs = 240000, autoStageTarget = 6, autoSpeedVal = 300;
let autoStartedAt = 0, autoTargetReached = false, autoDone = false, maxStageSeen = 0, autoTargetDoneAt = 0;
try {
    const _p = new URLSearchParams(window.location.search);
    autoMode = _p.get('auto') === '1' || _p.get('auto') === 'true';
    if (autoMode) {
        autoBudgetMs = (parseInt(_p.get('budget'), 10) || 240) * 1000;
        autoStageTarget = parseInt(_p.get('stages'), 10) || 6;
        autoSpeedVal = parseInt(_p.get('speed'), 10) || 300; // 游戏 speed 值：100=8x, 300=4x, 500=默认
    }
} catch (e) {}

// 工具函数 (模块顶层，可在任何地方使用)
function getWin() { try { return gameFrame.contentWindow; } catch (e) { return null; } }
function getDoc() { try { return gameFrame.contentDocument || getWin().document; } catch (e) { return null; } }
function getCtx() { const w = getWin(); if (!w || !w._getPlayerContext) return null; try { return w._getPlayerContext(); } catch (e) { return null; } }
function detectStage(doc) {
    if (!doc) return 0;
    const l = doc.getElementById('labelEnemy');
    if (!l) return 0;
    const m = (l.textContent || '').match(/第(\d+)关/);
    return m ? parseInt(m[1]) : 0;
}

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

    const startScanTimer = () => { if (scanTimer) clearInterval(scanTimer); scanTimer = setInterval(periodicScan, scanInterval); };
    const stopScanTimer = () => { if (scanTimer) { clearInterval(scanTimer); scanTimer = null; } };

    // ==================== 手动记录弹窗 ====================
    function showManualInput() {
        manualOverlay.style.display = 'flex';
        manualText.value = '';
        manualText.focus();
    }

    function hideManualInput() {
        manualOverlay.style.display = 'none';
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
    let confirmCallback = null;
    function showConfirm(text, onOk) {
        confirmText.textContent = text;
        confirmOverlay.style.display = 'flex';
        confirmCallback = onOk;
    }

    function hideConfirm() {
        confirmOverlay.style.display = 'none';
        confirmCallback = null;
    }

    confirmOk.addEventListener('click', () => {
        if (confirmCallback) confirmCallback();
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
        detectedIssues = []; issueKeys.clear(); pendingIssueCounts = {}; lastSampledStage = 0;
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
                // 开启全自动模式：自动选Buff、自动开战、自动推进关卡，实现无人值守实时体检
                try { if (w && w.GlobalStore) w.GlobalStore.set('autoLevel', 'full-auto'); } catch (e) {}
                // 同步模式按钮显示：体检直接改 GlobalStore 的 autoLevel，调用游戏自带的 updateAutoModeButton
                // 让按钮如实显示"全自动"（这是真 UI 缺陷的修复，不是掩盖问题）
                try { if (w && w.updateAutoModeButton) w.updateAutoModeButton(); } catch (e) {}
                // 自动后台模式：快进(1ms/步) + 计时，结束后输出报告，保证快速出结果
                if (autoMode && w) {
                    try {
                        if (w.GlobalStore) {
                            w.GlobalStore.set('speed', autoSpeedVal);
                            w.GlobalStore.set('fastForwardActive', true);
                        }
                    } catch (e) {}
                    autoStartedAt = Date.now(); autoDone = false; autoTargetReached = false; maxStageSeen = 0; autoTargetDoneAt = 0;
                }
                // 等关卡就绪(IDLE)后自动点击"开始战斗"，避免 selectStage 尚未完成时误点
                const tryStart = setInterval(() => {
                    const c = getCtx();
                    const d = getDoc();
                    if (!c || !d) return;
                    if (c.gs === 'IDLE') {
                        clearInterval(tryStart);
                        const btn = d.getElementById('btnMain');
                        if (btn) btn.click();
                    }
                }, 400);
                // 超时保护：6秒后若仍未开战则强制点击一次
                setTimeout(() => {
                    clearInterval(tryStart);
                    const c = getCtx();
                    const d = getDoc();
                    const btn = d && d.getElementById('btnMain');
                    if (btn && c && c.gs === 'IDLE') btn.click();
                }, 6000);
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
    statusLine.textContent = '正在启动自动体检...';
    // 自动启动体检，无需手动点击
    btnStartMonitor.click();
}

// ==================== 定时扫描 ====================
function periodicScan() {
    if (!monitorActive || !gameLoaded || isPaused) return;
    const win = getWin();
    const doc = getDoc();
    const ctx = getCtx();
    if (!ctx || !doc) return;

    if (ctx.UI && ctx.UI.currentResult && ctx.UI.currentResult.log && ctx.UI.currentResult.log.length > 0) {
        ctx._enhancedBattleLog = ctx.UI.currentResult.log;
    }

    // 实时按钮状态检查
    // - checkModeButtonStates(模式按钮)：静态真值检查"按钮是否如实反映模式"，任何模式都必须跑。
    //   体检改 autoLevel 后已调 updateAutoModeButton 同步，full-auto 下按钮应显示"全自动"。
    // - checkBottomButtonStates(底部控制按钮)：期望模型按手动流程校验(IDLE可点/RUNNING禁用...)；
    //   full-auto 自动接管并飞快切换状态，按钮瞬时态必然滞后 → 该期望模型不适用，故仍跳过，避免时序误报。
    for (const msg of checkModeButtonStates(ctx, doc)) recordIssue(ctx, null, '模式按钮', msg, 'UI');
    if (ctx.autoLevel !== 'full-auto') {
        for (const msg of checkBottomButtonStates(ctx, doc)) recordIssue(ctx, null, '按钮状态', msg, 'UI');
    }

    if (ctx.gs === 'RUNNING' || ctx.gs === 'PAUSED') {
        if (battleStartTime === 0) { battleStartTime = Date.now(); battleEnded = false; }
        runEngineChecks(ctx);
        runUIChecks(ctx, doc);
    }
    if (ctx.gs === 'GAMEOVER' && battleStartTime > 0 && !battleEnded) {
        battleEnded = true;
        setTimeout(() => {
            if (!monitorActive) return;
            const ctx2 = getCtx();
            const doc2 = getDoc();
            if (ctx2 && doc2) runFullChecks(ctx2, doc2);
        }, 3000);
    }

    // ============ 自动后台模式：推进关卡 / 超时判定，结束后输出报告 ============
    if (autoMode && !autoDone) {
        // 每场战斗结束会把 fastForwardActive 复位为 false，这里持续保持快进，确保后续关卡也快速打完
        try { if (win && win.GlobalStore && !win.GlobalStore.get('fastForwardActive')) win.GlobalStore.set('fastForwardActive', true); } catch (e) {}
        const stage = ctx.currentStage || detectStage(doc) || 0;
        if (stage > maxStageSeen) maxStageSeen = stage;
        if (stage >= autoStageTarget) autoTargetReached = true;
        const overBudget = autoStartedAt > 0 && (Date.now() - autoStartedAt > autoBudgetMs);
        // 快速出结果：跑到目标关且该关战斗已结束(GAMEOVER)即完成，无需等一整圈
        const targetBattleDone = autoTargetReached && stage >= autoStageTarget && ctx.gs === 'GAMEOVER';
        if (targetBattleDone && !autoTargetDoneAt) autoTargetDoneAt = Date.now();
        const settleDone = autoTargetDoneAt > 0 && (Date.now() - autoTargetDoneAt > 3000); // 留3s让最终检查跑完
        const loopDone = autoTargetReached && stage <= 1; // 兼容旧逻辑：跑完目标关卡后回到第1关 = 一圈完成
        if (overBudget || loopDone || settleDone) {
            finalizeAutoReport(ctx, doc, overBudget ? 'timeout' : (autoTargetDoneAt ? 'target-reached' : 'loop-complete'));
        } else {
            updateAutoProgress(stage);
        }
    }
}

function runEngineChecks(ctx) {
    const allyTeam = (ctx.UI && ctx.UI.allyTeam) || [];
    const enemyTeam = (ctx.UI && ctx.UI.enemyTeam) || [];
    const allUnits = allyTeam.concat(enemyTeam);
    for (const u of allUnits) {
        for (const msg of checkUnitHpValidity(u)) recordIssue(ctx, u.uid, '血量异常', msg, '引擎');
    }
}

function runUIChecks(ctx, doc) {
    const allyTeam = (ctx.UI && ctx.UI.allyTeam) || [];
    const enemyTeam = (ctx.UI && ctx.UI.enemyTeam) || [];
    const allUnits = allyTeam.concat(enemyTeam);

    for (const unit of allUnits) {
        for (const msg of checkHpBarSync(unit, doc)) recordIssue(ctx, unit.uid, '血条同步', msg, 'UI');
    }

    for (const msg of checkDeathFxRetention(allUnits, doc)) recordIssue(ctx, null, '死亡特效', msg, 'UI');
    for (const msg of checkMeleeFxState(ctx, doc)) recordIssue(ctx, null, '攻击特效', msg, 'UI');
    for (const msg of checkBuffIcons(ctx, doc)) recordIssue(ctx, null, 'Buff图标', msg, 'UI');
}

function runFullChecks(ctx, doc) {
    const allyTeam = (ctx.UI && ctx.UI.allyTeam) || [];
    const enemyTeam = (ctx.UI && ctx.UI.enemyTeam) || [];
    const allUnits = allyTeam.concat(enemyTeam);
    const stage = detectStage(doc) || (ctx.currentStage || 0);
    if (stage === lastSampledStage) return;
    lastSampledStage = stage;

    const win = getWin();
    for (const unit of allUnits) {
        for (const msg of checkHpBarColor(unit, win, doc)) recordIssue(ctx, unit.uid, '血条颜色', msg, 'UI');
    }

    for (const msg of checkFxOrphans(doc)) recordIssue(ctx, null, '特效残留', msg, 'UI');

    setTimeout(() => {
        const doc2 = getDoc();
        if (doc2) {
            // 弹幕仅存活 3.5s（acquireFromPool 3500ms），须在存活窗口内检查；5s 时弹幕已消失必然误报
            for (const msg of checkVictoryDanmaku(doc2, allyTeam, enemyTeam)) recordIssue(ctx, null, '胜利弹幕', msg, 'UI');
        }
    }, 2000);

    checkSwapStability(ctx, doc, allyTeam, enemyTeam);

    for (const msg of checkDeathFxRetention(allUnits, doc)) recordIssue(ctx, null, '死亡特效', msg, 'UI');
    for (const msg of checkMeleeFxState(ctx, doc)) recordIssue(ctx, null, '攻击特效', msg, 'UI');
    for (const msg of checkBuffIcons(ctx, doc)) recordIssue(ctx, null, 'Buff图标', msg, 'UI');

    let battleLog = ctx._enhancedBattleLog || [];
    if (battleLog.length === 0 && ctx.UI && ctx.UI.currentResult && ctx.UI.currentResult.log) {
        battleLog = ctx.UI.currentResult.log;
    }

    for (const entry of battleLog) {
        entry._locate = locateLogEntry(battleLog, entry);
    }

    ctx._doc = doc;
    const rules = [rule70, rule71, rule72, rule73, rule74, rule75, rule76, rule77, rule78, rule79, rule80];
    const beforeAllies = allyTeam.map(u => ({ ...u }));
    const beforeEnemies = enemyTeam.map(u => ({ ...u }));
    for (const rule of rules) {
        try {
            const result = rule.test(ctx, battleLog, beforeAllies, beforeEnemies, allyTeam, enemyTeam);
            if (result && result.fail) {
                const msgs = (result.msg || '').split(' | ');
                for (const m of msgs) if (m.trim()) recordIssue(ctx, null, m.substring(0, 30), m.trim(), '规则');
            } else if (result === 'skip') {
                ruleSkipCount++;
            } else {
                rulePassCount++;
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
                const loc = swapEvent._locate || '';
                recordIssue(ctx, u.uid, '换位UI丢失', u.name + '换位后格子丢失 ' + loc, 'UI');
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
        const loc = attackEntry._locate || '';
        recordIssue(ctx, unit.uid, '换位回弹', unit.name + '换位后位置=' + actualPos + '预期=' + expectedPos + ' ' + loc, 'UI');
    }
}

function recordIssue(ctx, unitUid, type, detail, source) {
    const key = (unitUid || 'global') + '|' + type + '|' + detail.substring(0, 60);
    if (issueKeys.has(key)) return;
    // UI 类异常先进入待确认状态，需连续采样命中才正式上报，避免渲染时序/状态机切换导致的瞬时误报
    if (source === 'UI') {
        const n = (pendingIssueCounts[key] || 0) + 1;
        pendingIssueCounts[key] = n;
        if (n < UI_CONFIRM_TIMES) return;
        delete pendingIssueCounts[key];
    }
    issueKeys.add(key);
    const stage = detectStage(getDoc()) || (ctx ? ctx.currentStage : 0) || 0;
    detectedIssues.push({ stage, type, detail, source, timestamp: new Date().toLocaleTimeString() });
    updateReport();
    updateStatusLine();
}

function updateStatusLine() {
    if (!statusLine) return;
    if (!monitorActive) { statusLine.textContent = '监控已停止'; return; }
    if (isPaused) { statusLine.textContent = '监控已暂停'; return; }
    statusLine.textContent = `监控运行中 | 异常:${detectedIssues.length}项 | 规则:✅${rulePassCount} ⏭️${ruleSkipCount}`;
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

// ==================== 自动模式：进度更新 ====================
function updateAutoProgress(stage) {
    const elapsed = (Date.now() - autoStartedAt) / 1000;
    try {
        const progress = { stage, maxStageSeen, target: autoStageTarget, elapsed: Math.round(elapsed), budget: Math.round(autoBudgetMs / 1000), flag: maxStageSeen >= autoStageTarget ? '✓目标达成' : '→推进中' };
        window.__healthProgress = progress;
        statusLine.textContent = `自动模式 | 关${stage}/${autoStageTarget} | ${Math.round(elapsed)}s`;
    } catch (e) {}
}

// ==================== 自动模式：最终报告 ====================
function finalizeAutoReport(ctx, doc, reason) {
    if (autoDone) return;
    autoDone = true;
    const elapsed = (Date.now() - autoStartedAt) / 1000;
    try {
        const finalIssues = detectedIssues.map(i => ({ stage: i.stage, type: i.type, detail: i.detail, source: i.source }));
        const report = {
            status: 'completed',
            reason: reason,
            elapsed: Math.round(elapsed),
            maxStageSeen: maxStageSeen,
            targetStage: autoStageTarget,
            issues: finalIssues,
            issueCount: finalIssues.length,
            rulePass: rulePassCount,
            ruleSkip: ruleSkipCount
        };
        window.__healthResult = report;
        statusLine.textContent = `自动模式 ✅ | ${Math.round(elapsed)}s | 异常${finalIssues.length}项 | 规则✅${rulePassCount} ⏭️${ruleSkipCount}`;
        console.log('===== [AUTO-HEALTH-DONE] =====');
        console.log(JSON.stringify(report, null, 2));
        console.log('===== [AUTO-HEALTH-END] =====');
        // 页面级傻瓜展示：切到报告视图 + 顶部完成横幅
        try {
            const rep = document.getElementById('reportArea');
            const gameA = document.getElementById('gameArea');
            if (gameA) gameA.classList.remove('active');
            if (rep) rep.classList.add('active');
            const banner = document.createElement('div');
            banner.style.cssText = 'color:#4caf50;font-weight:bold;padding:10px 12px;border:1px solid #4caf50;border-radius:8px;margin-bottom:10px;background:rgba(76,175,80,0.08);';
            banner.textContent = `✅ 自动体检完成（${reason}）| 耗时 ${Math.round(elapsed)}s | 目标关${autoStageTarget} 到达${maxStageSeen} | 异常 ${finalIssues.length} 项 | 规则 ✅${rulePassCount} ⏭️${ruleSkipCount}`;
            rep.prepend(banner);
        } catch (e) {}
    } catch (e) {
        window.__healthResult = { status: 'error', reason: 'finalize-fail', error: String(e) };
    }
}