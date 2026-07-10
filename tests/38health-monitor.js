// tests/38health-monitor.js - 光明顶5v5 实时体检监控器
// V5.0.9 | 延迟结束检查、分隔符白名单、引擎伤害校验、拒马/白骨爪专项
export const VER = 'tests/38health-monitor.js V5.0.9';

import { rule60 } from './37health-rules/60-separator.js';
import { rule61 } from './37health-rules/61-boneclaw.js';
import { rule62 } from './37health-rules/62-speed-button.js';
import { rule63 } from './37health-rules/63-carry-hp.js';
import { rule64 } from './37health-rules/64-horse.js';
import { rule65 } from './37health-rules/65-swap.js';
import { rule66 } from './37health-rules/66-victory.js';
import { rule67 } from './37health-rules/67-cloud-dodge.js';
import { rule68 } from './37health-rules/68-dodge-rebound.js';
import { getCellElement, checkUnitHpValidity, checkDeathMark, checkHpBarSync, checkHpBarColor, checkFxOrphans, checkDeathFxRetention } from './46health-utils.js';

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
    statusLine = document.getElementById('statusLine');

    const getWin = () => { try { return gameFrame.contentWindow; } catch (e) { return null; } };
    const getDoc = () => { try { return gameFrame.contentDocument || getWin().document; } catch (e) { return null; } };
    const getCtx = () => { const w = getWin(); if (!w || !w._getPlayerContext) return null; try { return w._getPlayerContext(); } catch (e) { return null; } };
    const detectStage = (doc) => { if (!doc) return 0; const l = doc.getElementById('labelEnemy'); if (!l) return 0; const m = (l.textContent || '').match(/第(\d+)关/); return m ? parseInt(m[1]) : 0; };

    const startScanTimer = () => { if (scanTimer) clearInterval(scanTimer); scanTimer = setInterval(periodicScan, 1000); };
    const stopScanTimer = () => { if (scanTimer) { clearInterval(scanTimer); scanTimer = null; } };

    if (!document.getElementById('btnBackToGame')) {
        const backBtn = document.createElement('button');
        backBtn.id = 'btnBackToGame';
        backBtn.textContent = '↩️ 返回游戏';
        backBtn.style.cssText = 'padding:6px 10px;border-radius:4px;border:1px solid #555;background:#2a2a4e;color:#eee;font-size:11px;cursor:pointer;margin-top:6px;';
        backBtn.addEventListener('click', () => { reportArea.classList.remove('active'); gameArea.classList.add('active'); });
        reportArea.appendChild(backBtn);
    }

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

    btnViewReport.addEventListener('click', () => { gameArea.classList.remove('active'); reportArea.classList.add('active'); reportArea.scrollTop = 0; });
    btnClearReport.addEventListener('click', () => { if (confirm('确定清空所有异常记录吗？')) { detectedIssues = []; issueKeys.clear(); updateReport(); updateStatusLine(); } });
    btnStartMonitor.disabled = false; btnStopMonitor.disabled = true;
    statusLine.textContent = '点击"开始体检"加载游戏并启动监控';
}

function periodicScan() {
    if (!monitorActive || !gameLoaded || isPaused) return;
    const win = gameFrame.contentWindow;
    const doc = gameFrame.contentDocument || win.document;
    const ctx = win._getPlayerContext ? win._getPlayerContext() : null;
    if (!ctx || !doc) return;

    // 战斗中持续扫描引擎和UI
    if (ctx.gs === 'RUNNING' || ctx.gs === 'PAUSED') {
        if (battleStartTime === 0) { battleStartTime = Date.now(); battleEnded = false; }
        runEngineChecks(ctx);
        runUIChecks(ctx, doc);
    }
    // 战斗结束延迟 3 秒，等 UI 渲染完毕再扫
    if (ctx.gs === 'GAMEOVER' && battleStartTime > 0 && !battleEnded) {
        battleEnded = true;
        setTimeout(() => {
            if (!monitorActive) return;
            const ctx2 = getCtx();
            const doc2 = getDoc();
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
        for (const msg of checkDeathMark(u)) recordIssue(ctx, u.uid, '死亡标记', msg, '引擎');
    }
    // 伤害公式校验：从日志中对比 rawFormula 和实际血量变化
    if (ctx.UI && ctx.UI.currentResult && ctx.UI.currentResult.log) {
        const log = ctx.UI.currentResult.log;
        for (const entry of log) {
            if (entry.type === 'attack-group' && !entry.isMiss && !entry.isBlock && !entry.isDodge && entry._dmg !== undefined) {
                // 通过 events 中的 hp-change 找到实际扣除量
                if (entry._events) {
                    const hpEvents = entry._events.filter(e => e.eventType === 'hp-change' && e.unitUid === entry.uidD);
                    if (hpEvents.length > 0) {
                        const hpBefore = findPreviousHp(entry, log, entry.uidD);
                        const hpAfter = hpEvents[hpEvents.length - 1].payload.hp;
                        const actualDmg = hpBefore !== null ? hpBefore - hpAfter : entry._dmg;
                        if (Math.abs(actualDmg - entry._dmg) > 1 && entry._dmg > 5) {
                            recordIssue(ctx, entry.uidD, '伤害公式', '伤害不一致：日志记录' + entry._dmg + '，实际血量变化' + actualDmg, '引擎');
                        }
                    }
                }
            }
        }
    }
}

function findPreviousHp(entry, log, uid) {
    for (let i = log.indexOf(entry) - 1; i >= 0; i--) {
        const e = log[i];
        if (e.type === 'attack-group' && e.uidD === uid && e.hpAfter !== undefined) return e.hpAfter;
        if (e._events) {
            const hpEv = e._events.find(ev => ev.eventType === 'hp-change' && ev.unitUid === uid);
            if (hpEv) return hpEv.payload.hp;
        }
    }
    return null;
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
    const stage = detectStage(doc) || (ctx.currentStage || 0);
    if (stage === lastSampledStage) return;
    lastSampledStage = stage;

    // 血条颜色（UI已稳定）
    const win = gameFrame.contentWindow;
    for (const unit of allUnits) {
        for (const msg of checkHpBarColor(unit, win, doc)) recordIssue(ctx, unit.uid, '血条颜色', msg, 'UI');
    }

    // 特效残留
    for (const msg of checkFxOrphans(doc)) recordIssue(ctx, null, '特效残留', msg, 'UI');

    // 胜利弹幕（延迟后已生成）
    for (const msg of checkVictoryDanmaku(doc, allyTeam, enemyTeam)) recordIssue(ctx, null, '胜利弹幕', msg, 'UI');

    // 换位稳定性
    checkSwapStability(ctx, doc, allyTeam, enemyTeam);

    // 死亡特效检查：3s保留/消失、赖场残留
    const deathFxIssues = checkDeathFxRetention(allUnits, doc);
    for (const msg of deathFxIssues) recordIssue(ctx, null, '死亡特效', msg, 'UI');

    // 执行9条规则（包含修复后的分隔符规则）
    let battleLog = [];
    if (ctx.UI && ctx.UI.currentResult && ctx.UI.currentResult.log) battleLog = ctx.UI.currentResult.log;
    ctx._doc = doc;
    const rules = [rule60, rule61, rule62, rule63, rule64, rule65, rule66, rule67, rule68];
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
            if (u.alive && !getCellElement(u, doc)) recordIssue(ctx, u.uid, '换位UI丢失', u.name + '换位后存活但格子丢失', 'UI');
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
        recordIssue(ctx, unit.uid, '换位回弹', unit.name + '换位后立刻攻击位置=' + actualPos + '预期=' + expectedPos, 'UI');
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
    updateReport(); updateStatusLine();
}

function updateStatusLine() {
    if (!statusLine) return;
    if (!monitorActive) { statusLine.textContent = '监控已停止'; return; }
    if (isPaused) { statusLine.textContent = '监控已暂停'; return; }
    statusLine.textContent = `监控运行中 | 异常:${detectedIssues.length}项`;
}

function updateReport() {
    if (!reportArea) return;
    const lastIssue = detectedIssues[detectedIssues.length - 1];
    if (!lastIssue) return;
    const g = `关卡${lastIssue.stage} - ${lastIssue.source} - ${lastIssue.type}`;
    let groupDiv = Array.from(reportArea.children).find(el => el.dataset.group === g);
    if (!groupDiv) {
        groupDiv = document.createElement('div');
        groupDiv.dataset.group = g;
        groupDiv.style.cssText = 'color:#ff9800;font-weight:bold;margin-top:8px;';
        groupDiv.textContent = g + ' (1项)';
        reportArea.appendChild(groupDiv);
    } else {
        const count = detectedIssues.filter(i => {
            const ig = `关卡${i.stage} - ${i.source} - ${i.type}`;
            return ig === g;
        }).length;
        groupDiv.textContent = g + ' (' + count + '项)';
    }
    const issueDiv = document.createElement('div');
    issueDiv.style.cssText = 'color:#f44336;margin-left:10px;';
    issueDiv.innerHTML = `  ❌ ${lastIssue.detail.replace(/\n/g, '<br>')}`;
    const timeDiv = document.createElement('div');
    timeDiv.style.cssText = 'color:#888;font-size:10px;margin-left:24px;';
    timeDiv.textContent = `     ⮑ ${lastIssue.timestamp}`;
    const existingBtn = reportArea.querySelector('button.copy-btn');
    if (existingBtn) existingBtn.remove();
    reportArea.appendChild(issueDiv);
    reportArea.appendChild(timeDiv);
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.style.cssText = 'margin-top:10px;padding:8px 16px;background:#3a3a6e;border:1px solid #555;border-radius:6px;color:#ccc;font-size:11px;cursor:pointer;';
    copyBtn.textContent = '📋 复制报告';
    copyBtn.onclick = () => {
        let text = '';
        for (const iss of detectedIssues) {
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

// 补充 checkVictoryDanmaku（为避免循环引用，直接内联）
function checkVictoryDanmaku(doc, allyTeam, enemyTeam) {
    const issues = [];
    const allyAlive = allyTeam.filter(u => u.alive);
    const enemyAlive = enemyTeam.filter(u => u.alive);
    let winner = null, aliveCount = 0;
    if (allyAlive.length > 0 && enemyAlive.length === 0) { winner = '明教'; aliveCount = allyAlive.length; }
    else if (enemyAlive.length > 0 && allyAlive.length === 0) { winner = '六大派'; aliveCount = enemyAlive.length; }
    else return issues;
    const bubbles = doc.querySelectorAll('.danmaku-bubble');
    if (bubbles.length === 0) {
        issues.push('UI问题：' + winner + '获胜（' + aliveCount + '人存活），但没有任何胜利弹幕');
    } else if (bubbles.length < aliveCount) {
        issues.push('UI问题：' + winner + '获胜，' + aliveCount + '人存活但只有' + bubbles.length + '条弹幕，缺少' + (aliveCount - bubbles.length) + '条');
    }
    return issues;
}