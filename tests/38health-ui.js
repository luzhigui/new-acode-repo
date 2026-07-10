// tests/38health-ui.js - 光明顶5v5 体检UI交互
// V5.0.7 | ~11000 bytes | 修复关卡识别、血量异常、人数误报
export const VER = 'tests/38health-ui.js V5.0.7';

export function initHealthUI() {
    const gameArea = document.getElementById('gameArea');
    const reportArea = document.getElementById('reportArea');
    const gameFrame = document.getElementById('gameFrame');
    const btnStartGame = document.getElementById('btnStartGame');
    const btnManualSample = document.getElementById('btnManualSample');
    const btnAutoSample = document.getElementById('btnAutoSample');
    const sampleCount = document.getElementById('sampleCount');
    const btnClearReport = document.getElementById('btnClearReport');
    const btnExitHealth = document.getElementById('btnExitHealth');

    let collectedSamples = [];
    let autoSampleActive = false;
    let autoSampleTimer = null;
    let gameLoaded = false;

    function getGameCtx() {
        try {
            var win = gameFrame.contentWindow;
            if (!win) return null;
            return win._getPlayerContext ? win._getPlayerContext() : null;
        } catch (e) { return null; }
    }

    function getGameDoc() {
        try {
            return gameFrame.contentDocument || gameFrame.contentWindow.document;
        } catch (e) { return null; }
    }

    // 获取当前关卡：从 labelEnemy 文本里读
    function getCurrentStage(doc) {
        if (!doc) return 0;
        var label = doc.getElementById('labelEnemy');
        if (!label) return 0;
        var text = label.textContent || '';
        var match = text.match(/第(\d+)关/);
        return match ? parseInt(match[1]) : 0;
    }

    btnStartGame.addEventListener('click', function() {
        if (gameLoaded) {
            gameFrame.src = '';
            setTimeout(function() { gameFrame.src = '../mode-5v5-test.html'; }, 200);
        } else {
            gameFrame.src = '../mode-5v5-test.html';
        }
        gameArea.classList.add('active');
        reportArea.classList.remove('active');
        btnStartGame.textContent = '🔄 重载游戏';
        btnManualSample.disabled = false;
        btnAutoSample.disabled = false;
        btnExitHealth.disabled = false;
        btnClearReport.disabled = false;
        gameLoaded = true;

        var waitCover = setInterval(function() {
            var doc = getGameDoc();
            if (doc) {
                var coverBtn = doc.getElementById('coverStartBtn');
                if (coverBtn) { coverBtn.click(); clearInterval(waitCover); }
            }
        }, 800);
    });

    btnManualSample.addEventListener('click', function() {
        var ctx = getGameCtx();
        if (!ctx || !ctx.UI) {
            alert('游戏未就绪，请等游戏加载完成并开始战斗后再采样');
            return;
        }
        doSample(ctx);
    });

    btnAutoSample.addEventListener('click', function() {
        if (autoSampleActive) {
            autoSampleActive = false;
            if (autoSampleTimer) clearInterval(autoSampleTimer);
            btnAutoSample.textContent = '🔁 自动采样';
            btnAutoSample.classList.remove('warn');
        } else {
            autoSampleActive = true;
            btnAutoSample.textContent = '⏹️ 停止自动';
            btnAutoSample.classList.add('warn');
            runAutoSample();
        }
    });

    function runAutoSample() {
        if (!autoSampleActive) return;
        var ctx = getGameCtx();
        var doc = getGameDoc();
        if (ctx && ctx.gs === 'GAMEOVER' && ctx.UI) {
            var stage = getCurrentStage(doc);
            var alreadySampled = false;
            for (var i = 0; i < collectedSamples.length; i++) {
                if (collectedSamples[i]._stage === stage && collectedSamples[i]._timestamp && Date.now() - collectedSamples[i]._timestamp < 30000) {
                    alreadySampled = true;
                    break;
                }
            }
            if (!alreadySampled) {
                doSample(ctx);
            }
        }
        autoSampleTimer = setTimeout(runAutoSample, 2000);
    }

    function doSample(ctx) {
        var doc = getGameDoc();
        var allyTeam = ctx.UI.allyTeam || [];
        var enemyTeam = ctx.UI.enemyTeam || [];
        var allUnits = allyTeam.concat(enemyTeam);
        var stage = getCurrentStage(doc);
        var gs = ctx.gs || '';
        var battleEnded = (gs === 'GAMEOVER');
        var allyAllDead = allyTeam.every(function(u) { return !u.alive; });
        var enemyAllDead = enemyTeam.every(function(u) { return !u.alive; });
        var oneSideWiped = allyAllDead || enemyAllDead;
        var failures = [];

        // 1. 血量合法性 + 异常膨胀检测
        for (var i = 0; i < allUnits.length; i++) {
            var u = allUnits[i];
            if (u.hp < 0) failures.push({ fix: u.name + '血量负数：' + Math.floor(u.hp) });
            if (u.maxHp > 0 && u.hp > u.maxHp) failures.push({ fix: u.name + '血量溢出：' + Math.floor(u.hp) + '/' + Math.floor(u.maxHp) });
            // 血量膨胀检测：maxHp 超过初始 _baseMaxHp 的 2.5 倍
            if (u._baseMaxHp && u._baseMaxHp > 0 && u.maxHp > u._baseMaxHp * 2.5) {
                failures.push({ fix: u.name + '血量异常膨胀：maxHp=' + Math.floor(u.maxHp) + '，初始=' + Math.floor(u._baseMaxHp) + '，膨胀了' + Math.floor(u.maxHp / u._baseMaxHp * 100) + '%' });
            }
        }

        // 2. 死亡标记检查
        for (var j = 0; j < allUnits.length; j++) {
            var u2 = allUnits[j];
            if (!u2.alive && !u2._isDead) failures.push({ fix: u2.name + '已阵亡但 _isDead 未标记' });
        }

        // 3. 人数检查（仅在战斗进行中或刚结束时检查，一方全灭后不检查）
        if (!oneSideWiped) {
            var stageExpected = (stage === 5) ? 6 : 5;
            var enemyAlive = enemyTeam.filter(function(u) { return u.alive; });
            if (enemyTeam.length < stageExpected) failures.push({ fix: '第' + stage + '关敌方人数为' + enemyTeam.length + '，预期' + stageExpected });
            if (allyTeam.length < 5) failures.push({ fix: '第' + stage + '关我方人数为' + allyTeam.length + '，预期5' });
        }

        // 4. 血条颜色和高度检查（仅检查存活单位）
        if (doc) {
            for (var k = 0; k < allUnits.length; k++) {
                var u3 = allUnits[k];
                if (!u3.alive) continue;
                var cell = getCellElement(u3, doc);
                if (!cell) continue;
                var bar = cell.querySelector('.hp-bar-inner');
                if (!bar) continue;
                try {
                    var barColor = gameFrame.contentWindow.getComputedStyle(bar).backgroundColor;
                    var pct = u3.hp / u3.maxHp;
                    var expColor = pct > 0.7 ? 'rgb(76, 175, 80)' : (pct > 0.4 ? 'rgb(255, 152, 0)' : 'rgb(244, 67, 54)');
                    if (barColor && barColor !== expColor) {
                        failures.push({ fix: u3.name + '血条颜色异常：当前' + barColor + '，预期' + expColor });
                    }
                } catch (e) {}
                var barH = parseFloat(bar.style.height);
                var expH = Math.floor(u3.hp / u3.maxHp * 100);
                if (Math.abs(barH - expH) > 3) {
                    failures.push({ fix: u3.name + '血条高度异常：当前' + barH + '%，预期' + expH + '%' });
                }
            }
        }

        // 5. 胜利弹幕检查（仅在战斗结束且有一方全灭时检查）
        if (battleEnded && oneSideWiped && doc) {
            var allyAliveCount = allyTeam.filter(function(u) { return u.alive; }).length;
            var enemyAliveCount = enemyTeam.filter(function(u) { return u.alive; }).length;
            if (allyAliveCount > 0 && enemyAliveCount === 0) {
                var bubbles = doc.querySelectorAll('.danmaku-bubble');
                if (bubbles.length === 0) failures.push({ fix: '明教获胜但无胜利弹幕' });
            }
        }

        // 6. 特效残留检查（战斗结束后超过3秒才检查，给清理机制时间）
        if (battleEnded && doc) {
            var orphans = doc.querySelectorAll('[data-fx="temporary"]');
            if (orphans.length > 5) failures.push({ fix: '发现' + orphans.length + '个特效残留元素' });
        }

        var sample = {
            _stage: stage,
            _timestamp: Date.now(),
            stage: stage,
            group: '战斗采样',
            name: '第' + stage + '关 战斗数据',
            failures: failures
        };

        collectedSamples.push(sample);
        updateSampleCount();
        renderReport();
        btnManualSample.textContent = '✅ 已采样';
        setTimeout(function() { btnManualSample.textContent = '📊 手动采样'; }, 800);
    }

    function getCellElement(unit, doc) {
        if (!unit || unit.pos == null) return null;
        var gridId = unit.camp === 'ally' ? 'allyGrid' : 'enemyGrid';
        var grid = doc.getElementById(gridId);
        if (!grid) return null;
        var order = unit.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
        var idx = order.indexOf(unit.pos);
        return idx >= 0 ? grid.children[idx] : null;
    }

    function updateSampleCount() {
        var totalFail = 0;
        for (var i = 0; i < collectedSamples.length; i++) {
            totalFail += (collectedSamples[i].failures || []).length;
        }
        sampleCount.style.display = 'inline';
        sampleCount.textContent = collectedSamples.length + '条 / ' + totalFail + '项失败';
    }

    function renderReport() {
        var html = '';
        if (collectedSamples.length === 0) {
            html = '<div class="report-group" style="color:#888;">暂无采样数据</div>';
        } else {
            var groupMap = {};
            for (var i = 0; i < collectedSamples.length; i++) {
                var s = collectedSamples[i];
                var g = s.group || '其他';
                if (!groupMap[g]) groupMap[g] = [];
                groupMap[g].push(s);
            }
            for (var group in groupMap) {
                html += '<div class="report-group">' + group + '</div>';
                var items = groupMap[group];
                for (var j = 0; j < items.length; j++) {
                    var item = items[j];
                    if (item.failures && item.failures.length > 0) {
                        html += '<div class="report-line report-fail">  ❌ ' + item.name + '：' + item.failures.length + ' 项失败</div>';
                        for (var k = 0; k < Math.min(item.failures.length, 5); k++) {
                            html += '<div class="report-line report-detail">     ⮑ ' + (item.failures[k].fix || item.failures[k].error || '未知') + '</div>';
                        }
                    } else {
                        html += '<div class="report-line report-pass">  ✅ ' + item.name + '：通过</div>';
                    }
                }
            }
            html += '<button class="copy-btn" onclick="var t=this.parentElement.innerText;navigator.clipboard.writeText(t).then(function(){this.textContent=\'✅ 已复制\';setTimeout(function(){this.textContent=\'📋 复制报告\';}.bind(this),1500);}.bind(this))">📋 复制报告</button>';
        }
        reportArea.innerHTML = html;
    }

    btnClearReport.addEventListener('click', function() {
        if (confirm('确定清空所有采样数据吗？')) {
            collectedSamples = [];
            updateSampleCount();
            renderReport();
            sampleCount.style.display = 'none';
        }
    });

    btnExitHealth.addEventListener('click', function() {
        if (autoSampleActive) {
            autoSampleActive = false;
            if (autoSampleTimer) clearInterval(autoSampleTimer);
            btnAutoSample.textContent = '🔁 自动采样';
            btnAutoSample.classList.remove('warn');
        }
        gameArea.classList.remove('active');
        reportArea.classList.add('active');
        reportArea.scrollTop = 0;
        renderReport();
        updateSampleCount();
        btnStartGame.textContent = '▶ 开始游戏';
        gameLoaded = false;
        btnManualSample.disabled = true;
        btnAutoSample.disabled = true;
        btnExitHealth.disabled = true;
    });
}