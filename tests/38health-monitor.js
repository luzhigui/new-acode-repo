// tests/38health-monitor.js - 光明顶5v5 实时体检监控器
// V5.0.7 | ~18000 bytes | 移除自研分隔符检测，增强换位UI检测，完整引用9条规则
export const VER = 'tests/38health-monitor.js V5.0.7';

import { rule60 } from './37health-rules/60-separator.js';
import { rule61 } from './37health-rules/61-boneclaw.js';
import { rule62 } from './37health-rules/62-speed-button.js';
import { rule63 } from './37health-rules/63-carry-hp.js';
import { rule64 } from './37health-rules/64-horse.js';
import { rule65 } from './37health-rules/65-swap.js';
import { rule66 } from './37health-rules/66-victory.js';
import { rule67 } from './37health-rules/67-cloud-dodge.js';
import { rule68 } from './37health-rules/68-dodge-rebound.js';

export function initMonitor() {
    const gameArea = document.getElementById('gameArea');
    const reportArea = document.getElementById('reportArea');
    const gameFrame = document.getElementById('gameFrame');
    const btnStartMonitor = document.getElementById('btnStartMonitor');
    const btnStopMonitor = document.getElementById('btnStopMonitor');
    const btnViewReport = document.getElementById('btnViewReport');
    const btnClearReport = document.getElementById('btnClearReport');
    const freqButtons = document.querySelectorAll('#freqGroup button[data-freq]');
    const statusLine = document.getElementById('statusLine');

    let monitorActive = false, gameLoaded = false, scanInterval = 200, scanTimer = null;
    let detectedIssues = [], issueKeys = new Set(), lastSampledStage = 0;
    let battleEnded = false, battleStartTime = 0;

    function getGameWin() { try { return gameFrame.contentWindow; } catch (e) { return null; } }
    function getGameDoc() { try { return gameFrame.contentDocument || getGameWin().document; } catch (e) { return null; } }
    function getGameCtx() { const win = getGameWin(); if (!win || !win._getPlayerContext) return null; try { return win._getPlayerContext(); } catch (e) { return null; } }
    function detectStage(doc) { if (!doc) return 0; const label = doc.getElementById('labelEnemy'); if (!label) return 0; const m = (label.textContent || '').match(/第(\d+)关/); return m ? parseInt(m[1]) : 0; }
    function getCellElement(unit, doc) {
        if (!unit || unit.pos == null) return null;
        const gridId = unit.camp === 'ally' ? 'allyGrid' : 'enemyGrid';
        const grid = doc.getElementById(gridId);
        if (!grid) return null;
        const order = unit.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
        const idx = order.indexOf(unit.pos);
        return idx >= 0 ? grid.children[idx] : null;
    }

    freqButtons.forEach(btn => btn.addEventListener('click', () => {
        freqButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        scanInterval = parseInt(btn.dataset.freq);
        if (monitorActive) { stopScanTimer(); if (scanInterval > 0) startScanTimer(); }
        updateStatusLine();
    }));
    function startScanTimer() { if (scanTimer) clearInterval(scanTimer); if (scanInterval > 0) scanTimer = setInterval(periodicScan, scanInterval); }
    function stopScanTimer() { if (scanTimer) { clearInterval(scanTimer); scanTimer = null; } }

    btnStartMonitor.addEventListener('click', () => {
        if (monitorActive) return;
        gameFrame.src = '../mode-5v5-test.html';
        gameArea.classList.add('active'); reportArea.classList.remove('active');
        btnStartMonitor.disabled = true; btnStopMonitor.disabled = false;
        gameLoaded = false; monitorActive = true;
        detectedIssues = []; issueKeys.clear(); lastSampledStage = 0;
        battleEnded = false; battleStartTime = 0;
        updateReport();
        statusLine.textContent = '正在加载游戏...';
        const waitReady = setInterval(() => {
            const doc = getGameDoc();
            if (doc && doc.getElementById('coverStartBtn')) doc.getElementById('coverStartBtn').click();
            const ctx = getGameCtx();
            if (ctx && ctx.UI && ctx.UI.allyTeam && ctx.UI.allyTeam.length >= 1) {
                clearInterval(waitReady); gameLoaded = true;
                if (scanInterval > 0) startScanTimer();
                updateStatusLine();
            }
        }, 500);
    });
    btnStopMonitor.addEventListener('click', () => {
        monitorActive = false; gameLoaded = false; stopScanTimer();
        btnStartMonitor.disabled = false; btnStopMonitor.disabled = true;
        statusLine.textContent = '监控已停止';
    });

    function periodicScan() {
        if (!monitorActive || !gameLoaded) return;
        const ctx = getGameCtx(), doc = getGameDoc();
        if (!ctx || !doc) return;
        if (ctx.gs === 'RUNNING' && battleStartTime === 0) { battleStartTime = Date.now(); battleEnded = false; }
        if (ctx.gs === 'RUNNING' || ctx.gs === 'PAUSED') {
            runEngineChecks(ctx);
            runUIChecks(ctx, doc);
        }
        if (ctx.gs === 'GAMEOVER' && battleStartTime > 0 && !battleEnded) {
            battleEnded = true; battleStartTime = 0;
            runFullChecks(ctx, doc);
        }
    }

    function runEngineChecks(ctx) {
        const allyTeam = (ctx.UI && ctx.UI.allyTeam) || [];
        const enemyTeam = (ctx.UI && ctx.UI.enemyTeam) || [];
        const allUnits = allyTeam.concat(enemyTeam);
        for (const u of allUnits) {
            if (u.hp < 0) recordIssue(ctx, u.uid, '血量负数', u.name + '血量负数：' + Math.floor(u.hp), '引擎');
            if (u.maxHp > 0 && u.hp > u.maxHp) recordIssue(ctx, u.uid, '血量溢出', u.name + '血量溢出：' + Math.floor(u.hp) + '/' + Math.floor(u.maxHp), '引擎');
            if (u._baseMaxHp && u._baseMaxHp > 0 && u.maxHp > u._baseMaxHp * 2.5) recordIssue(ctx, u.uid, '血量膨胀', u.name + '血量膨胀：maxHp=' + Math.floor(u.maxHp) + '，初始=' + Math.floor(u._baseMaxHp) + '，膨胀' + Math.floor(u.maxHp / u._baseMaxHp * 100) + '%', '引擎');
            if (!u.alive && !u._isDead) recordIssue(ctx, u.uid, '死亡标记', u.name + '已阵亡但 _isDead 未标记', '引擎');
        }
        const carryUnit = allyTeam.find(u => u.pos === 5 && u.alive && !u.isHorse);
        if (carryUnit && carryUnit.hp > carryUnit.maxHp) recordIssue(ctx, carryUnit.uid, 'Carry溢出', carryUnit.name + '(5号位)血量溢出：' + Math.floor(carryUnit.hp) + '/' + Math.floor(carryUnit.maxHp), '引擎');
    }

    function runUIChecks(ctx, doc) {
        const allyTeam = (ctx.UI && ctx.UI.allyTeam) || [];
        const enemyTeam = (ctx.UI && ctx.UI.enemyTeam) || [];
        const allUnits = allyTeam.concat(enemyTeam);
        for (const unit of allUnits) {
            if (!unit.alive || !unit.maxHp) continue;
            const cell = getCellElement(unit, doc);
            if (!cell) continue;
            const bar = cell.querySelector('.hp-bar-inner');
            if (!bar) continue;
            const actualPct = parseFloat(bar.style.height);
            const expectedPct = Math.floor((unit.hp / unit.maxHp) * 100);
            if (Math.abs(actualPct - expectedPct) > 3) recordIssue(ctx, unit.uid, '血条高度', unit.name + '血条高度异常：当前' + actualPct + '%, 预期' + expectedPct + '%', 'UI');
        }
    }

    function runFullChecks(ctx, doc) {
        const allyTeam = (ctx.UI && ctx.UI.allyTeam) || [];
        const enemyTeam = (ctx.UI && ctx.UI.enemyTeam) || [];
        const allUnits = allyTeam.concat(enemyTeam);
        const stage = detectStage(doc) || (ctx.currentStage || 0);
        if (stage === lastSampledStage) return;
        lastSampledStage = stage;

        // 1. 换位稳定性与回弹检测
        checkSwapStability(ctx, doc, allyTeam, enemyTeam);

        // 2. 血条颜色（仅战斗结束检查）
        for (const unit of allUnits) {
            if (!unit.alive || !unit.maxHp) continue;
            const cell = getCellElement(unit, doc);
            if (!cell) continue;
            const bar = cell.querySelector('.hp-bar-inner');
            if (!bar) continue;
            try {
                const barColor = getGameWin().getComputedStyle(bar).backgroundColor;
                const hpPct = unit.hp / unit.maxHp;
                const expColor = hpPct > 0.7 ? 'rgb(76, 175, 80)' : (hpPct > 0.4 ? 'rgb(255, 152, 0)' : 'rgb(244, 67, 54)');
                if (barColor && barColor !== expColor) recordIssue(ctx, unit.uid, '血条颜色', unit.name + '血条颜色异常：当前' + barColor + ', 预期' + expColor, 'UI');
            } catch (e) {}
        }

        // 3. 特效残留
        const orphans = doc.querySelectorAll('[data-fx="temporary"]');
        if (orphans.length > 5) recordIssue(ctx, null, '特效残留', '战斗结束后' + orphans.length + '个特效未清理', 'UI');

        // 4. 倍速按钮
        checkSpeedButton(ctx, doc);

        // 5. 调用9条规则（传入完整的战斗日志，如果可用）
        let battleLog = [];
        if (ctx.UI && ctx.UI.currentResult && ctx.UI.currentResult.log) {
            battleLog = ctx.UI.currentResult.log;
        }
        ctx._doc = doc;
        const rules = [rule60, rule61, rule62, rule63, rule64, rule65, rule66, rule67, rule68];
        // 为规则准备 before/after 数据（简化为当前状态）
        const beforeAllies = allyTeam.map(u => ({ ...u }));
        const beforeEnemies = enemyTeam.map(u => ({ ...u }));
        for (const rule of rules) {
            try {
                const result = rule.test(ctx, battleLog, beforeAllies, beforeEnemies, allyTeam, enemyTeam);
                collectRuleResult(ctx, result);
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

            const unitA = findUnitByName(allUnits, swapEvent._swapNameA);
            const unitB = findUnitByName(allUnits, swapEvent._swapNameB);
            if (!unitA || !unitB) continue;

            [unitA, unitB].forEach(u => {
                if (u.alive) {
                    const cell = getCellElement(u, doc);
                    if (!cell) {
                        recordIssue(ctx, u.uid, '换位UI丢失', u.name + '换位后在队伍中存活(pos=' + u.pos + ')，但九宫格中找不到对应格子', 'UI');
                    }
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
        if (attackEntry.uidA === unit.uid) {
            actualPos = attackEntry._atkPos;
        }
        if (attackEntry.uidD === unit.uid) {
            actualPos = attackEntry._defPos;
        }
        
        if (actualPos !== null && actualPos !== undefined && actualPos !== expectedPos) {
            const detail = '【换位回弹】单位' + unit.name + '在换位后立刻攻击时位置错误：\n' +
                '  换位目标位置：' + expectedPos + '号位\n' +
                '  攻击时实际位置：' + actualPos + '号位\n' +
                '  说明：单位在换位动画中可能弹回了原位，导致攻击时站位与预期不符';
            recordIssue(ctx, unit.uid, '换位回弹', detail, 'UI');
        }
    }

    function findUnitByName(units, name) {
        return units.find(u => u.name === name) || null;
    }

    function checkSpeedButton(ctx, doc) {
        if (!ctx || ctx.speed == null) return;
        const speed = ctx.speed;
        const btn2 = doc.getElementById('btnSpeed2');
        const btn7x = doc.getElementById('btnSpeed7x');
        const btn4x = doc.getElementById('btnSpeed4x');
        const map = { 500: btn2, 143: btn7x, 250: btn4x };
        const expected = map[speed];
        if (expected && !expected.classList.contains('active') && !expected.classList.contains('semi-active'))
            recordIssue(ctx, null, '倍速高亮', '速度' + speed + '对应按钮未高亮', 'UI');
    }

    function collectRuleResult(ctx, result) {
        if (!result || result === 'skip' || result === true || (result && result.fail === false)) return;
        const msg = result.msg || '';
        if (msg) {
            const reasons = msg.split(' | ');
            for (const r of reasons) if (r.trim()) recordIssue(ctx, null, r.substring(0, 30), r.trim(), '规则');
        }
    }

    function recordIssue(ctx, unitUid, type, detail, source) {
        const key = (unitUid || 'global') + '|' + type + '|' + detail.substring(0, 60);
        if (issueKeys.has(key)) return;
        issueKeys.add(key);
        const stage = detectStage(getGameDoc()) || (ctx ? ctx.currentStage : 0) || 0;
        detectedIssues.push({ stage, type, detail, source, timestamp: new Date().toLocaleTimeString() });
        updateReport(); updateStatusLine();
    }

    function updateStatusLine() {
        if (!monitorActive) { statusLine.textContent = '监控已停止'; return; }
        statusLine.textContent = `监控运行中 | 频率:${scanInterval > 0 ? scanInterval + 'ms' : '手动'} | 异常:${detectedIssues.length}项`;
    }
    function updateReport() {
    // 获取最后一条已记录的问题
    const lastIssue = detectedIssues[detectedIssues.length - 1];
    if (!lastIssue) return;

    // 构造新问题的HTML
    const iss = lastIssue;
    const g = `关卡${iss.stage} - ${iss.source} - ${iss.type}`;
    
    // 查找或创建分组
    let groupDiv = Array.from(reportArea.children).find(el => el.dataset.group === g);
    if (!groupDiv) {
        groupDiv = document.createElement('div');
        groupDiv.dataset.group = g;
        groupDiv.style.cssText = 'color:#ff9800;font-weight:bold;margin-top:8px;';
        groupDiv.textContent = g + ' (0项)';
        reportArea.appendChild(groupDiv);
    }
    
    // 更新分组计数
    const count = (detectedIssues.filter(i => {
        const ig = `关卡${i.stage} - ${i.source} - ${i.type}`;
        return ig === g;
    })).length;
    groupDiv.textContent = g + ' (' + count + '项)';

    // 创建新条目
    const issueDiv = document.createElement('div');
    issueDiv.style.cssText = 'color:#f44336;margin-left:10px;animation:fadeIn 0.5s;';
    issueDiv.innerHTML = `  ❌ ${iss.detail.replace(/\n/g, '<br>')}`;
    
    const timeDiv = document.createElement('div');
    timeDiv.style.cssText = 'color:#888;font-size:10px;margin-left:24px;';
    timeDiv.textContent = `     ⮑ ${iss.timestamp}`;

    // 检查"复制报告"按钮，如果存在则移除
    const existingBtn = reportArea.querySelector('button');
    if (existingBtn) existingBtn.remove();

    // 插入新条目到按钮之前
    reportArea.appendChild(issueDiv);
    reportArea.appendChild(timeDiv);
    
    // 重新添加复制按钮
    const copyBtn = document.createElement('button');
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

    // 自动滚动到底部
    reportArea.scrollTop = reportArea.scrollHeight;
}
    function buildReportHTML() {
        if (detectedIssues.length === 0) return '<div style="color:#4caf50;">✅ 未发现异常</div>';
        const grouped = {};
        for (const iss of detectedIssues) {
            const g = `关卡${iss.stage} - ${iss.source} - ${iss.type}`;
            if (!grouped[g]) grouped[g] = [];
            grouped[g].push(iss);
        }
        let html = '';
        for (const [g, items] of Object.entries(grouped)) {
            html += `<div style="color:#ff9800;font-weight:bold;margin-top:8px;">${g} (${items.length}项)</div>`;
            for (const iss of items) {
                html += `<div style="color:#f44336;">  ❌ ${iss.detail}</div>`;
                html += `<div style="color:#888;font-size:10px;margin-left:14px;">     ⮑ ${iss.timestamp}</div>`;
            }
        }
        html += `<button style="margin-top:10px;padding:8px 16px;background:#3a3a6e;border:1px solid #555;border-radius:6px;color:#ccc;font-size:11px;cursor:pointer;" onclick="var t=this.parentElement.innerText;navigator.clipboard.writeText(t).then(function(){this.textContent='✅ 已复制';setTimeout(function(){this.textContent='📋 复制报告';}.bind(this),1500);}.bind(this))">📋 复制报告</button>`;
        return html;
    }

    btnViewReport.addEventListener('click', () => { gameArea.classList.remove('active'); reportArea.classList.add('active'); reportArea.scrollTop = 0; });
    btnClearReport.addEventListener('click', () => { if (confirm('确定清空所有异常记录吗？')) { detectedIssues = []; issueKeys.clear(); updateReport(); updateStatusLine(); } });
    btnStartMonitor.disabled = false; btnStopMonitor.disabled = true;
    statusLine.textContent = '点击"开始体检"加载游戏并启动监控';
}