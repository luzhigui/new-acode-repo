﻿﻿﻿﻿﻿// tests/45health-auto.js - 光明顶5v5 体检自动控制
// V5.2.0 | ~14000 bytes | 注入游戏窗口的浮动按钮、全自动操作、跨窗口通信
export const VER = 'tests/45health-auto.js V5.2.0';

(function() {
    'use strict';

    var mode = 'manual';
    var currentStage = 4;
    var healthActive = false;
    var collectedSamples = [];
    var autoTimer = null;
    var fullAutoPhase = 'init'; // init | waiting | running | gameover
    var stageSwitchRetries = 0;

    // ==================== 监听体检页面发来的初始化消息 ====================
    window.addEventListener('message', function(e) {
        if (e.data && e.data.type === 'health-init' && e.data.source === 'test-runner') {
            if (!healthActive) {
                healthActive = true;
                waitForGameReady();
            }
        }
    });

    function waitForGameReady() {
        var attempts = 0;
        var check = setInterval(function() {
            attempts++;
            var coverOverlay = document.getElementById('coverOverlay');
            // 封面还在，先点掉
            if (coverOverlay && coverOverlay.style.display !== 'none') {
                var coverBtn = document.getElementById('coverStartBtn');
                if (coverBtn) coverBtn.click();
            }

            var ctx = window._getPlayerContext ? window._getPlayerContext() : null;
            if (ctx && ctx.UI && ctx.UI.allyTeam && ctx.UI.allyTeam.length >= 1 && ctx.UI.enemyTeam && ctx.UI.enemyTeam.length >= 1) {
                clearInterval(check);
                injectControlPanel();
                if (mode === 'fullauto') {
                    switchToStage(currentStage);
                    setTimeout(function() { startFullAuto(); }, 2000);
                }
            } else if (attempts > 120) {
                clearInterval(check);
                console.log('[体检] 等待游戏就绪超时，仍尝试注入控制面板');
                injectControlPanel();
            }
        }, 500);
    }

    // ==================== 浮动按钮 ====================
    function injectControlPanel() {
        if (document.getElementById('healthFloatBtn')) return;

        var floatBtn = document.createElement('div');
        floatBtn.id = 'healthFloatBtn';
        floatBtn.style.cssText = 'position:fixed;bottom:100px;right:16px;width:48px;height:48px;background:rgba(76,175,80,0.9);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;cursor:pointer;z-index:99990;box-shadow:0 2px 12px rgba(0,0,0,0.4);';
        floatBtn.title = '体检控制';
        floatBtn.innerHTML = '🩺';
        floatBtn.addEventListener('click', showControlDialog);
        document.body.appendChild(floatBtn);

        // 如果游戏封面还在，关掉
        var coverOverlay = document.getElementById('coverOverlay');
        if (coverOverlay && coverOverlay.style.display !== 'none') {
            var coverBtn = document.getElementById('coverStartBtn');
            if (coverBtn) coverBtn.click();
        }
    }

    function showControlDialog() {
        var existing = document.getElementById('healthDialog');
        if (existing) existing.remove();

        var overlay = document.createElement('div');
        overlay.id = 'healthDialog';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;justify-content:center;align-items:center;z-index:99999;';
        
        var box = document.createElement('div');
        box.style.cssText = 'background:#1a1a2e;border:2px solid #4caf50;border-radius:12px;padding:20px;text-align:center;color:#eee;min-width:220px;';
        
        var title = document.createElement('div');
        title.textContent = '🩺 体检控制';
        title.style.cssText = 'font-size:16px;font-weight:bold;color:#4caf50;margin-bottom:16px;';
        box.appendChild(title);

        var buttons = [
            { text: '👆 手动', mode: 'manual' },
            { text: '🤖 自动', mode: 'auto' },
            { text: '⚡ 全自动', mode: 'fullauto' },
            { text: '🚪 退出体检', mode: 'exit' }
        ];

        for (var i = 0; i < buttons.length; i++) {
            (function(m) {
                var btn = document.createElement('button');
                btn.textContent = buttons[i].text;
                btn.style.cssText = 'display:block;width:100%;padding:12px;margin:6px 0;border:1px solid #555;border-radius:8px;background:#2a2a4e;color:#eee;font-size:14px;cursor:pointer;';
                btn.addEventListener('click', function() {
                    document.body.removeChild(overlay);
                    handleModeSwitch(m);
                });
                box.appendChild(btn);
            })(buttons[i].mode);
        }

        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    function handleModeSwitch(newMode) {
        if (newMode === 'exit') {
            exitHealth();
            return;
        }

        mode = newMode;
        stopAutoTimer();
        fullAutoPhase = 'init';

        if (mode === 'fullauto') {
            currentStage = 4;
            switchToStage(4);
            setTimeout(function() { startFullAuto(); }, 2000);
        }

        updateFloatBtnStyle();
    }

    function updateFloatBtnStyle() {
        var btn = document.getElementById('healthFloatBtn');
        if (!btn) return;
        if (mode === 'fullauto') {
            btn.style.background = 'rgba(255,152,0,0.9)';
        } else if (mode === 'auto') {
            btn.style.background = 'rgba(33,150,243,0.9)';
        } else {
            btn.style.background = 'rgba(76,175,80,0.9)';
        }
    }

    // ==================== 全自动逻辑 ====================
    function startFullAuto() {
        if (mode !== 'fullauto') return;

        closeVoteDialog();
        closeBuffDialog();
        closeBattleReport();

        var ctx = window._getPlayerContext ? window._getPlayerContext() : null;
        if (!ctx) {
            autoTimer = setTimeout(startFullAuto, 500);
            return;
        }

        var gs = ctx.gs || '';
        var btnMain = document.getElementById('btnMain');
        var btnNext = document.getElementById('btnNext');
        var btnSettle = document.getElementById('btnSettle');

        if (gs === 'IDLE' && btnMain && !btnMain.disabled) {
            fullAutoPhase = 'running';
            btnMain.click();
        } else if (gs === 'RUNNING' && btnNext && !btnNext.disabled) {
            btnNext.click();
        } else if (gs === 'GAMEOVER' && fullAutoPhase === 'running') {
            fullAutoPhase = 'gameover';
            sampleCurrentBattle(ctx);
            if (btnSettle && !btnSettle.disabled) {
                btnSettle.click();
            }
            // 循环：第6关打完回第1关，否则进入下一关
            setTimeout(function() {
                var newCtx = window._getPlayerContext ? window._getPlayerContext() : null;
                if (newCtx) {
                    var newStage = newCtx.currentStage || 1;
                    if (newStage !== currentStage) {
                        currentStage = newStage;
                    }
                }
                // 如果又回到 IDLE，说明结算成功进入下一关了
                fullAutoPhase = 'init';
            }, 1500);
        } else if (gs === 'GAMEOVER' && fullAutoPhase === 'gameover') {
            // 还在 GAMEOVER，结算按钮可能还没亮
            if (btnSettle && !btnSettle.disabled) {
                btnSettle.click();
            }
        }

        autoTimer = setTimeout(startFullAuto, 700);
    }

    function stopAutoTimer() {
        if (autoTimer) {
            clearTimeout(autoTimer);
            autoTimer = null;
        }
    }

    function closeVoteDialog() {
        var overlay = document.getElementById('voteModalOverlay');
        if (overlay && overlay.offsetParent !== null) {
            // 点放弃
            var skipBtns = overlay.querySelectorAll('.modal-btn.skip');
            if (skipBtns.length > 0) {
                skipBtns[0].click();
                return;
            }
            // 没有放弃按钮，点明教
            var mingBtns = overlay.querySelectorAll('.modal-btn.ming');
            if (mingBtns.length > 0) {
                mingBtns[0].click();
                return;
            }
            // 都没有，点第一个按钮
            var anyBtn = overlay.querySelector('.modal-btn');
            if (anyBtn) anyBtn.click();
        }
        // 浮动恢复按钮
        var floatBtn = document.getElementById('voteFloat');
        if (floatBtn && floatBtn.style.display !== 'none') {
            floatBtn.click();
            setTimeout(function() { closeVoteDialog(); }, 300);
        }
    }

    function closeBuffDialog() {
        var overlay = document.getElementById('buffModalOverlay');
        if (overlay && overlay.offsetParent !== null) {
            var btns = overlay.querySelectorAll('.modal-btn.buff');
            if (btns.length > 0) {
                var idx = Math.floor(Math.random() * btns.length);
                btns[idx].click();
                return;
            }
        }
        // Buff 浮动恢复按钮
        var floatBtn = document.getElementById('buffFloatBtn');
        if (floatBtn && floatBtn.style.display !== 'none') {
            floatBtn.click();
            setTimeout(function() { closeBuffDialog(); }, 300);
        }
    }

    function closeBattleReport() {
        var overlay = document.getElementById('battleReportOverlay');
        if (overlay && overlay.offsetParent !== null) {
            var closeBtns = overlay.querySelectorAll('button');
            for (var i = 0; i < closeBtns.length; i++) {
                if (closeBtns[i].textContent === '关闭') {
                    closeBtns[i].click();
                    return;
                }
            }
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }
        // 战报浮动按钮
        var floatBtn = document.getElementById('battleReportFloat');
        if (floatBtn) floatBtn.remove();
    }

    function switchToStage(stage) {
        if (typeof window.selectStage === 'function') {
            window.selectStage(stage);
            currentStage = stage;
            stageSwitchRetries = 0;
        } else {
            // selectStage 还没挂载，等一等
            stageSwitchRetries++;
            if (stageSwitchRetries < 20) {
                setTimeout(function() { switchToStage(stage); }, 500);
            }
        }
    }

    // ==================== 采样 ====================
    function sampleCurrentBattle(ctx) {
        if (!ctx || !ctx.UI) return;

        var allyTeam = ctx.UI.allyTeam || [];
        var enemyTeam = ctx.UI.enemyTeam || [];
        var allUnits = allyTeam.concat(enemyTeam);

        var failures = [];

        // 血量合法性
        for (var i = 0; i < allUnits.length; i++) {
            var u = allUnits[i];
            if (u.hp < 0) failures.push({ fix: u.name + '血量为负数' + u.hp });
            if (u.maxHp > 0 && u.hp > u.maxHp) failures.push({ fix: u.name + '血量溢出：' + Math.floor(u.hp) + '/' + Math.floor(u.maxHp) });
            if (!u.alive && !u._isDead) failures.push({ fix: u.name + '已阵亡但 _isDead 未标记' });
        }

        // 人数检查
        var stageExpected = (currentStage === 5) ? 6 : 5;
        if (enemyTeam.length !== stageExpected) failures.push({ fix: '第' + currentStage + '关敌方人数为' + enemyTeam.length + '，预期' + stageExpected });

        // 胜利弹幕
        var allyAlive = allyTeam.filter(function(u) { return u.alive; });
        var enemyAlive = enemyTeam.filter(function(u) { return u.alive; });
        if (allyAlive.length > 0 && enemyAlive.length === 0) {
            var bubbles = document.querySelectorAll('.danmaku-bubble');
            if (bubbles.length === 0) failures.push({ fix: '明教获胜但无胜利弹幕' });
        }

        var sample = {
            stage: currentStage,
            group: '战斗采样',
            name: '第' + currentStage + '关 战斗数据',
            failures: failures
        };

        collectedSamples.push(sample);

        if (window.opener && !window.opener.closed) {
            try {
                window.opener.postMessage({ type: 'health-report', payload: sample }, '*');
            } catch (e) {}
        }
    }

    function exitHealth() {
        stopAutoTimer();
        mode = 'manual';
        fullAutoPhase = 'init';
        updateFloatBtnStyle();

        // 汇总
        var summary = {
            totalBattles: collectedSamples.length,
            totalFailures: 0,
            samples: collectedSamples
        };
        for (var i = 0; i < collectedSamples.length; i++) {
            summary.totalFailures += (collectedSamples[i].failures || []).length;
        }

        if (window.opener && !window.opener.closed) {
            try {
                window.opener.postMessage({ type: 'health-exit', payload: summary }, '*');
            } catch (e) {}
        }

        var btn = document.getElementById('healthFloatBtn');
        if (btn) btn.remove();

        healthActive = false;
        collectedSamples = [];
    }
})();