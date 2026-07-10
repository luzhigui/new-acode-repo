// tests/38health-monitor.js - 光明顶5v5 实时体检监控器
// V5.0.7 | ~18000 bytes | 三层检测框架 + 9条规则 + 详细报告
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
    // ==================== DOM 元素 ====================
    const gameArea = document.getElementById('gameArea');
    const reportArea = document.getElementById('reportArea');
    const gameFrame = document.getElementById('gameFrame');
    const btnStartMonitor = document.getElementById('btnStartMonitor');
    const btnStopMonitor = document.getElementById('btnStopMonitor');
    const btnViewReport = document.getElementById('btnViewReport');
    const btnClearReport = document.getElementById('btnClearReport');
    const freqButtons = document.querySelectorAll('#freqGroup button[data-freq]');
    const statusLine = document.getElementById('statusLine');

    // ==================== 状态变量 ====================
    let monitorActive = false;
    let gameLoaded = false;
    let scanInterval = 200;
    let scanTimer = null;
    let detectedIssues = [];
    let issueKeys = new Set();
    let lastSampledStage = 0;
    let battleEnded = false;
    let battleStartTime = 0;

    // ==================== 辅助函数 ====================
    function getGameWin() {
        try { return gameFrame.contentWindow; } catch (e) { return null; }
    }
    function getGameDoc() {
        try { return gameFrame.contentDocument || getGameWin().document; } catch (e) { return null; }
    }
    function getGameCtx() {
        const win = getGameWin();
        if (!win || !win._getPlayerContext) return null;
        try { return win._getPlayerContext(); } catch (e) { return null; }
    }

    function detectStage(doc) {
        if (!doc) return 0;
        const label = doc.getElementById('labelEnemy');
        if (!label) return 0;
        const text = label.textContent || '';
        const match = text.match(/第(\d+)关/);
        return match ? parseInt(match[1]) : 0;
    }

    // ==================== 频率按钮 ====================
    freqButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            freqButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            scanInterval = parseInt(btn.dataset.freq);
            if (monitorActive) {
                stopScanTimer();
                if (scanInterval > 0) startScanTimer();
            }
            updateStatusLine();
        });
    });

    function startScanTimer() {
        if (scanTimer) clearInterval(scanTimer);
        if (scanInterval > 0) scanTimer = setInterval(periodicScan, scanInterval);
    }
    function stopScanTimer() {
        if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
    }

    // ==================== 开始/停止 ====================
    btnStartMonitor.addEventListener('click', () => {
        if (monitorActive) return;
        gameFrame.src = '../mode-5v5-test.html';
        gameArea.classList.add('active');
        reportArea.classList.remove('active');
        btnStartMonitor.disabled = true;
        btnStopMonitor.disabled = false;
        gameLoaded = false;
        monitorActive = true;
        detectedIssues = [];
        issueKeys.clear();
        lastSampledStage = 0;
        battleEnded = false;
        battleStartTime = 0;
        updateReport();
        statusLine.textContent = '正在加载游戏...';

        const waitReady = setInterval(() => {
            const doc = getGameDoc();
            if (doc && doc.getElementById('coverStartBtn')) {
                doc.getElementById('coverStartBtn').click();
            }
            const ctx = getGameCtx();
            if (ctx && ctx.UI && ctx.UI.allyTeam && ctx.UI.allyTeam.length >= 1) {
                clearInterval(waitReady);
                gameLoaded = true;
                if (scanInterval > 0) startScanTimer();
                updateStatusLine();
            }
        }, 500);
    });

    btnStopMonitor.addEventListener('click', () => {
        monitorActive = false;
        gameLoaded = false;
        stopScanTimer();
        btnStartMonitor.disabled = false;
        btnStopMonitor.disabled = true;
        statusLine.textContent = '监控已停止';
    });

    // ==================== 核心扫描 ====================
    function periodicScan() {
        if (!monitorActive || !gameLoaded) return;
        const ctx = getGameCtx();
        const doc = getGameDoc();
        if (!ctx || !doc) return;

        if (ctx.gs === 'RUNNING' && battleStartTime === 0) {
            battleStartTime = Date.now();
            battleEnded = false;
        }

        // 第一层：引擎自检（每200ms跑一次）
        if (ctx.gs === 'RUNNING' || ctx.gs === 'PAUSED') {
            runEngineChecks(ctx);
            // 日志自检（检查当前ctx中的日志）
            runLogChecks(ctx, doc);
            // UI校验
            runUIChecks(ctx, doc);
        }

        // 三层检测完整运行（GAMEOVER时跑一次，拿完整数据）
        if (ctx.gs === 'GAMEOVER' && battleStartTime > 0 && !battleEnded) {
            battleEnded = true;
            battleStartTime = 0;
            runFullChecks(ctx, doc);
        }
    }

    // ==================== 第一层：引擎自检 ====================
    function runEngineChecks(ctx) {
        const allyTeam = (ctx.UI && ctx.UI.allyTeam) ? ctx.UI.allyTeam : [];
        const enemyTeam = (ctx.UI && ctx.UI.enemyTeam) ? ctx.UI.enemyTeam : [];
        const allUnits = allyTeam.concat(enemyTeam);
        const stage = detectStage(getGameDoc()) || (ctx.currentStage || 0);

        for (const u of allUnits) {
            // 血量合法性
            if (u.hp < 0) {
                const detail = '单位【' + u.name + '】血量异常：\n' +
                    '  阵营：' + (u.camp === 'ally' ? '明教' : '六大派') + '\n' +
                    '  职业：' + u.role + '\n' +
                    '  站位：' + u.pos + '号位\n' +
                    '  当前血量：' + Math.floor(u.hp) + '\n' +
                    '  最大血量：' + Math.floor(u.maxHp) + '\n' +
                    '  问题：血量为负数';
                recordIssue(ctx, u.uid, '血量负数', detail, '引擎');
            }
            if (u.maxHp > 0 && u.hp > u.maxHp) {
                const detail = '单位【' + u.name + '】血量溢出：\n' +
                    '  阵营：' + (u.camp === 'ally' ? '明教' : '六大派') + '\n' +
                    '  职业：' + u.role + '\n' +
                    '  站位：' + u.pos + '号位\n' +
                    '  当前血量：' + Math.floor(u.hp) + '\n' +
                    '  最大血量：' + Math.floor(u.maxHp) + '\n' +
                    '  溢出量：' + Math.floor(u.hp - u.maxHp) + '\n' +
                    '  比例：' + Math.floor(u.hp / u.maxHp * 100) + '%';
                recordIssue(ctx, u.uid, '血量溢出', detail, '引擎');
            }
            if (u._baseMaxHp && u._baseMaxHp > 0 && u.maxHp > u._baseMaxHp * 2.5) {
                const expansion = Math.floor(u.maxHp / u._baseMaxHp * 100);
                const detail = '单位【' + u.name + '】血量异常膨胀：\n' +
                    '  阵营：' + (u.camp === 'ally' ? '明教' : '六大派') + '\n' +
                    '  职业：' + u.role + '\n' +
                    '  站位：' + u.pos + '号位\n' +
                    '  初始最大血量(_baseMaxHp)：' + Math.floor(u._baseMaxHp) + '\n' +
                    '  当前最大血量(maxHp)：' + Math.floor(u.maxHp) + '\n' +
                    '  膨胀比例：' + expansion + '%\n' +
                    '  正常上限(2.5倍)：' + Math.floor(u._baseMaxHp * 2.5) + '\n' +
                    '  可能原因：Carry Buff 叠加时 _baseMaxHp 未正确锁定，导致重复加成';
                recordIssue(ctx, u.uid, '血量膨胀', detail, '引擎');
            }
            // 死亡标记
            if (!u.alive && !u._isDead) {
                const detail = '单位【' + u.name + '】死亡标记缺失：\n' +
                    '  阵营：' + (u.camp === 'ally' ? '明教' : '六大派') + '\n' +
                    '  职业：' + u.role + '\n' +
                    '  站位：' + u.pos + '号位\n' +
                    '  alive = false（已阵亡）\n' +
                    '  _isDead = undefined/false（未标记）\n' +
                    '  影响：UI 可能仍显示为存活状态，或被错误清理';
                recordIssue(ctx, u.uid, '死亡标记', detail, '引擎');
            }
        }

        // Carry血量方向检查
        const carryUnit = allyTeam.find(u => u.pos === 5 && u.alive && !u.isHorse);
        if (carryUnit) {
            if (carryUnit.hp > carryUnit.maxHp) {
                const detail = 'Carry单位【' + carryUnit.name + '】(5号位)血量溢出：\n' +
                    '  当前血量：' + Math.floor(carryUnit.hp) + '\n' +
                    '  最大血量：' + Math.floor(carryUnit.maxHp) + '\n' +
                    '  溢出量：' + Math.floor(carryUnit.hp - carryUnit.maxHp) + '\n' +
                    '  _baseMaxHp：' + (carryUnit._baseMaxHp || '未设置') + '\n' +
                    '  可能原因：Carry Buff 的血量加成计算错误';
                recordIssue(ctx, carryUnit.uid, 'Carry溢出', detail, '引擎');
            }
        }
    }

    // ==================== 第二层：日志自检 ====================
    function runLogChecks(ctx, doc) {
        const allyTeam = (ctx.UI && ctx.UI.allyTeam) ? ctx.UI.allyTeam : [];
        const enemyTeam = (ctx.UI && ctx.UI.enemyTeam) ? ctx.UI.enemyTeam : [];
        const stage = detectStage(doc) || (ctx.currentStage || 0);

        // 分隔符缺失检查（用DOM日志）
        const logDiv = doc.getElementById('log');
        if (logDiv) {
            checkSeparatorDom(ctx, doc, logDiv);
        }

        // 倍速按钮检查
        checkSpeedButton(ctx, doc);
    }

    function checkSeparatorDom(ctx, doc, logDiv) {
        const allDivs = logDiv.querySelectorAll('div');
        let prevType = null;
        let prevText = '';
        let issues = [];
        let divIndex = 0;

        for (let i = 0; i < allDivs.length; i++) {
            const div = allDivs[i];
            const html = div.innerHTML || '';
            const text = div.textContent || '';

            // 跳过空行和分隔符本身
            if (html.indexOf('separator') !== -1 || text.trim() === '' || html === '<br>') {
                if (html.indexOf('separator') !== -1) prevType = 'separator';
                continue;
            }

            // 识别当前行的类型
            let currType = 'info';
            if (text.includes('回合开始')) currType = 'round-start';
            else if (text.includes('回合结束')) currType = 'round-end';
            else if ((text.includes('造成') && text.includes('伤害')) || text.includes('闪避') || text.includes('未命中') || text.includes('格挡')) currType = 'attack-group';
            else if (text.includes('Buff') || text.includes('性奋') || text.includes('新婚') || text.includes('严阵以待') || text.includes('嗜血') || text.includes('流云') || text.includes('乘风') || text.includes('流星') || text.includes('圣火') || text.includes('热血') || text.includes('惑心') || text.includes('carry') || text.includes('概率连击') || text.includes('拒马阵')) currType = 'buff-summary';
            else if (text.includes('拒马')) currType = 'buff-summon';
            else if (text.includes('互换位置') || text.includes('击退')) currType = 'buff-swap';
            else if (text.includes('光明顶') && text.includes('5v5')) currType = 'title';
            else if (text.includes('初始阵容')) currType = 'team-info';

            // 检查当前是否是攻击行，且前一行是需要分隔符的类型
            if (currType === 'attack-group' && prevType !== 'attack-group' && prevType !== 'round-start' && prevType !== 'separator' && prevType !== 'title' && prevType !== 'team-info' && prevType !== null) {
                const detail = '日志格式问题：前一条日志后面缺少分隔符\n' +
                    '  前一条日志内容：' + prevText.substring(0, 60) + '\n' +
                    '  前一条日志类型：' + prevType + '\n' +
                    '  当前日志内容：' + text.substring(0, 60) + '\n' +
                    '  当前日志类型：' + currType + '\n' +
                    '  规范要求：非攻击日志后面必须加分隔符才能接攻击动作';
                recordIssue(ctx, null, '分隔符缺失', detail, '日志');
            }

            prevType = currType;
            prevText = text;
        }
    }

    function checkSpeedButton(ctx, doc) {
        if (!ctx || ctx.speed == null) return;
        const speed = ctx.speed;
        const btn2 = doc.getElementById('btnSpeed2');
        const btn7x = doc.getElementById('btnSpeed7x');
        const btn4x = doc.getElementById('btnSpeed4x');
        const speedToBtn = { 500: btn2, 143: btn7x, 250: btn4x };
        const expectedBtn = speedToBtn[speed];
        if (expectedBtn && !expectedBtn.classList.contains('active') && !expectedBtn.classList.contains('semi-active')) {
            const detail = '倍速按钮高亮异常：\n' +
                '  当前速度：' + speed + '\n' +
                '  对应按钮：' + (speed === 500 ? '2x' : speed === 143 ? '7x' : speed === 250 ? '4x' : '未知') + '\n' +
                '  按钮状态：未高亮(active/semi-active)\n' +
                '  期望状态：active 或 semi-active';
            recordIssue(ctx, null, '倍速高亮', detail, 'UI');
        }
    }

    // ==================== 第三层：UI 校验 ====================
    function runUIChecks(ctx, doc) {
        const allyTeam = (ctx.UI && ctx.UI.allyTeam) ? ctx.UI.allyTeam : [];
        const enemyTeam = (ctx.UI && ctx.UI.enemyTeam) ? ctx.UI.enemyTeam : [];
        const allUnits = allyTeam.concat(enemyTeam);

        // 血条高度检查
        for (const unit of allUnits) {
            if (!unit.alive || !unit.maxHp) continue;
            const cell = getCellElement(unit, doc);
            if (!cell) continue;
            const bar = cell.querySelector('.hp-bar-inner');
            if (!bar) continue;
            const actualPct = parseFloat(bar.style.height);
            const expectedPct = Math.floor((unit.hp / unit.maxHp) * 100);
            if (Math.abs(actualPct - expectedPct) > 3) {
                const detail = '单位【' + unit.name + '】血条高度异常：\n' +
                    '  阵营：' + (unit.camp === 'ally' ? '明教' : '六大派') + '\n' +
                    '  站位：' + unit.pos + '号位\n' +
                    '  当前血量：' + Math.floor(unit.hp) + ' / ' + Math.floor(unit.maxHp) + '\n' +
                    '  预期血条高度：' + expectedPct + '%\n' +
                    '  实际血条高度：' + actualPct + '%\n' +
                    '  偏差：' + Math.abs(Math.floor(actualPct - expectedPct)) + '%\n' +
                    '  可能原因：renderGrid 未及时更新，或动画过渡未完成';
                recordIssue(ctx, unit.uid, '血条高度', detail, 'UI');
            }
        }
    }

    function getCellElement(unit, doc) {
        if (!unit || unit.pos == null) return null;
        const gridId = unit.camp === 'ally' ? 'allyGrid' : 'enemyGrid';
        const grid = doc.getElementById(gridId);
        if (!grid) return null;
        const order = unit.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
        const idx = order.indexOf(unit.pos);
        return idx >= 0 ? grid.children[idx] : null;
    }

    // ==================== 完整检测（GAMEOVER） ====================
    function runFullChecks(ctx, doc) {
        const allyTeam = (ctx.UI && ctx.UI.allyTeam) ? ctx.UI.allyTeam : [];
        const enemyTeam = (ctx.UI && ctx.UI.enemyTeam) ? ctx.UI.enemyTeam : [];
        const allUnits = allyTeam.concat(enemyTeam);
        const stage = detectStage(doc) || (ctx.currentStage || 0);
        const activeBuffs = ctx.activeBuffs || [];

        if (stage === lastSampledStage) return;
        lastSampledStage = stage;

        // 尝试从 currentResult 获取完整日志
        let battleLog = [];
        let resultAlly = allyTeam;
        let resultEnemy = enemyTeam;
        if (ctx.UI && ctx.UI.currentResult) {
            battleLog = ctx.UI.currentResult.log || [];
            resultAlly = ctx.UI.currentResult.ally || allyTeam;
            resultEnemy = ctx.UI.currentResult.enemy || enemyTeam;
        }

        // 注入 doc 到 ctx
        ctx._doc = doc;

        // 构造 before 快照（从 result 中还原初始状态）
        const beforeAllies = resultAlly.map(u => ({ ...u }));
        const beforeEnemies = resultEnemy.map(u => ({ ...u }));
        const afterAllies = resultAlly;
        const afterEnemies = resultEnemy;

        // 9条规则
        const rules = [rule60, rule61, rule62, rule63, rule64, rule65, rule66, rule67, rule68];
        const ruleParams = [ctx, battleLog, beforeAllies, beforeEnemies, afterAllies, afterEnemies];

        for (const rule of rules) {
            try {
                const result = rule.test(...ruleParams);
                collectRuleResult(ctx, result);
            } catch (e) {
                const detail = '规则【' + rule.name + '】执行异常：\n' +
                    '  错误信息：' + (e.message || '未知错误') + '\n' +
                    '  错误堆栈：' + (e.stack || '无');
                recordIssue(ctx, null, '规则异常', detail, '系统');
            }
        }

        // UI 规则：血条颜色
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
                if (barColor && barColor !== expColor) {
                    const colorName = hpPct > 0.7 ? '绿色' : (hpPct > 0.4 ? '橙色' : '红色');
                    const detail = '单位【' + unit.name + '】血条颜色异常：\n' +
                        '  站位：' + unit.pos + '号位\n' +
                        '  血量比例：' + Math.floor(hpPct * 100) + '%\n' +
                        '  预期颜色：' + expColor + '（' + colorName + '）\n' +
                        '  实际颜色：' + barColor + '\n' +
                        '  可能原因：血条CSS未同步，或血量处于临界值';
                    recordIssue(ctx, unit.uid, '血条颜色', detail, 'UI');
                }
            } catch (e) {}
        }

        // 特效残留
        const orphans = doc.querySelectorAll('[data-fx="temporary"]');
        if (orphans.length > 5) {
            const detail = '特效残留检查：\n' +
                '  战斗结束后仍有 ' + orphans.length + ' 个标记为临时(temporary)的特效元素未清理\n' +
                '  正常上限：5个\n' +
                '  可能原因：快速战斗或特效动画中断导致清理函数未执行';
            recordIssue(ctx, null, '特效残留', detail, 'UI');
        }
    }

    // ==================== 规则结果收集 ====================
    function collectRuleResult(ctx, result) {
        if (!result || result === 'skip' || result === true || (result && result.fail === false)) return;
        const msg = result.msg || '';
        if (msg) {
            const reasons = msg.split(' | ');
            for (const reason of reasons) {
                if (reason.trim()) {
                    const type = reason.substring(0, 30).replace(/[：:].*/, '');
                    const detail = '规则检测到问题：\n' + '  ' + reason.trim();
                    recordIssue(ctx, null, type, detail, '规则');
                }
            }
        }
    }

    // ==================== 异常记录与报告 ====================
    function recordIssue(ctx, unitUid, type, detail, source) {
        const key = (unitUid || 'global') + '|' + type + '|' + detail.substring(0, 60);
        if (issueKeys.has(key)) return;
        issueKeys.add(key);
        const stage = detectStage(getGameDoc()) || (ctx ? ctx.currentStage : 0) || 0;
        detectedIssues.push({ stage, type, detail, source, timestamp: new Date().toLocaleTimeString() });
        updateReport();
        updateStatusLine();
    }

    function updateStatusLine() {
        if (!monitorActive) { statusLine.textContent = '监控已停止'; return; }
        const freqText = scanInterval > 0 ? scanInterval + 'ms' : '手动';
        statusLine.textContent = '监控运行中 | 频率: ' + freqText + ' | 已发现 ' + detectedIssues.length + ' 项异常';
    }

    function updateReport() { reportArea.innerHTML = buildReportHTML(); }

    function buildReportHTML() {
        if (detectedIssues.length === 0) return '<div class="report-group" style="color:#4caf50;font-size:14px;">✅ 未发现异常，游戏状态良好</div>';
        const grouped = {};
        for (const issue of detectedIssues) {
            const g = '关卡' + issue.stage + ' — ' + issue.source + ' — ' + issue.type;
            if (!grouped[g]) grouped[g] = [];
            grouped[g].push(issue);
        }
        let html = '';
        for (const [group, issues] of Object.entries(grouped)) {
            html += '<div class="report-group" style="color:#ff9800;font-weight:bold;font-size:13px;margin-top:12px;border-bottom:1px solid #333;padding-bottom:4px;">' + group + ' (' + issues.length + '项)</div>';
            for (const iss of issues) {
                const formattedDetail = iss.detail.replace(/\n/g, '<br>');
                html += '<div class="report-line report-fail" style="color:#f44336;margin:4px 0;line-height:1.6;">  ❌ ' + formattedDetail + '</div>';
                html += '<div class="report-line report-detail" style="color:#888;font-size:10px;margin-left:14px;">     ⮑ 时间: ' + iss.timestamp + '</div>';
            }
        }
        html += '<button class="copy-btn" style="margin-top:10px;padding:8px 16px;background:#3a3a6e;border:1px solid #555;border-radius:6px;color:#ccc;font-size:11px;cursor:pointer;" onclick="var t=this.parentElement.innerText;navigator.clipboard.writeText(t).then(function(){this.textContent=\'✅ 已复制\';setTimeout(function(){this.textContent=\'📋 复制报告\';}.bind(this),1500);}.bind(this))">📋 复制报告</button>';
        return html;
    }

    btnViewReport.addEventListener('click', () => { gameArea.classList.remove('active'); reportArea.classList.add('active'); reportArea.scrollTop = 0; });
    btnClearReport.addEventListener('click', () => {
        if (confirm('确定清空所有异常记录吗？')) { detectedIssues = []; issueKeys.clear(); updateReport(); updateStatusLine(); }
    });

    btnStartMonitor.disabled = false;
    btnStopMonitor.disabled = true;
    statusLine.textContent = '点击"开始体检"加载游戏并启动监控';
}