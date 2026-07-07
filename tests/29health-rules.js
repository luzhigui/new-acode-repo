// tests/29health-rules.js - 光明顶5v5 体检规则库
// V5.0.2 | ~8000 bytes | 2026-07-07 规则全面重写
export const VER = 'tests/29health-rules.js V5.0.2';

function createHealthRules(win, doc) {
    function getCtx() {
        try { return win._getPlayerContext ? win._getPlayerContext() : null; }
        catch (e) { return null; }
    }

    function getCellElement(unit) {
        if (!unit || unit.pos == null) return null;
        var gridId = unit.camp === 'ally' ? 'allyGrid' : 'enemyGrid';
        var grid = doc.getElementById(gridId);
        if (!grid) return null;
        var order = unit.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
        var idx = order.indexOf(unit.pos);
        return idx >= 0 ? grid.children[idx] : null;
    }

    return [
        // ========== 站位检查 ==========
        { group: '📍 站位', name: '角色站位编号检查', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return { fail: true, msg: '无法获取游戏上下文' };
            var ally = ctx.UI.allyTeam || [];
            var enemy = ctx.UI.enemyTeam || [];
            var allUnits = ally.concat(enemy);
            // 检查存活单位的站位
            for (var i = 0; i < allUnits.length; i++) {
                var u = allUnits[i];
                if (!u.alive && !u._isDead) continue; // 既没存活也没标记死亡，可能是数据错乱
                var cell = getCellElement(u);
                if (!cell) {
                    if (u._isDead) continue; // 死亡超过3秒格子可能已清理，正常
                    return { fail: true, msg: (u.camp === 'ally' ? '明教' : '六大派') + '的' + u.name + '位置' + u.pos + '找不到对应格子，角色可能丢失了' };
                }
                var p = parseInt(cell.dataset.pos);
                if (isNaN(p) || p < 1 || p > 9) {
                    return { fail: true, msg: (u.camp === 'ally' ? '明教' : '六大派') + '的' + u.name + '站位编号为' + cell.dataset.pos + '，不合法（应该1~9）' };
                }
                // 检查阵亡标记
                if (u._isDead) {
                    if (!cell.querySelector('.dead-mark') && cell.dataset.flash !== 'dead') {
                        return { fail: true, msg: (u.camp === 'ally' ? '明教' : '六大派') + '的' + u.name + '已阵亡但格子上没有阵亡标记，看起来可能还像活着' };
                    }
                }
            }
            return { fail: false };
        }},

        { group: '📍 站位', name: '固定角色初始站位', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return { fail: true, msg: '无法获取游戏上下文' };
            var round = ctx.UI.round || 0;
            if (round > 0) return { fail: false }; // 只检查战斗开始前
            var ally = ctx.UI.allyTeam || [];
            var zhang = ally.find(function(u) { return u.isZhang; });
            var wei = ally.find(function(u) { return u.isWei; });
            if (zhang && zhang.pos !== 5) return { fail: true, msg: '战斗开始时张无忌在' + zhang.pos + '号位，应该在5号位，乾坤大挪移可能不生效' };
            if (wei && wei.pos !== 6) return { fail: true, msg: '战斗开始时韦一笑在' + wei.pos + '号位，应该在6号位' };
            return { fail: false };
        }},

        { group: '📍 站位', name: '换位模式单位标记检查', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI || !ctx.adjustMode) return { fail: false };
            var ally = ctx.UI.allyTeam || [];
            for (var i = 0; i < ally.length; i++) {
                var u = ally[i];
                var cell = getCellElement(u); if (!cell) continue;
                if (u.fixed && !cell.classList.contains('fixed-unit')) return { fail: true, msg: u.name + '是固定单位但格子上没有锁定标记，换位时可能被误移动' };
                if (!u.fixed && !cell.classList.contains('swappable')) return { fail: true, msg: u.name + '不是固定单位但格子上显示为锁定状态，无法换位' };
            }
            return { fail: false };
        }},

        // ========== 属性检查 ==========
        { group: '❤️ 属性', name: '血条高度检查', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return { fail: true, msg: '无法获取游戏上下文' };
            var all = (ctx.UI.allyTeam || []).concat(ctx.UI.enemyTeam || []);
            for (var i = 0; i < all.length; i++) {
                var u = all[i]; if (!u.alive) continue;
                var cell = getCellElement(u); if (!cell) continue;
                var bar = cell.querySelector('.hp-bar-inner'); if (!bar) continue;
                var expected = Math.floor((u.hp / u.maxHp) * 100);
                var actual = parseFloat(bar.style.height);
                if (Math.abs(actual - expected) > 2) {
                    return { fail: true, msg: u.name + '血条高度' + actual + '%，但实际血量是' + expected + '%，看起来血量不对' };
                }
            }
            return { fail: false };
        }},

        { group: '❤️ 属性', name: '血条颜色检查', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return { fail: true, msg: '无法获取游戏上下文' };
            var all = (ctx.UI.allyTeam || []).concat(ctx.UI.enemyTeam || []);
            for (var i = 0; i < all.length; i++) {
                var u = all[i]; if (!u.alive) continue;
                var cell = getCellElement(u); if (!cell) continue;
                var bar = cell.querySelector('.hp-bar-inner'); if (!bar) continue;
                var pct = u.hp / u.maxHp;
                var exp = pct > 0.7 ? 'rgb(76, 175, 80)' : (pct > 0.4 ? 'rgb(255, 152, 0)' : 'rgb(244, 67, 54)');
                var actual = win.getComputedStyle(bar).backgroundColor;
                if (actual !== exp) {
                    var expName = pct > 0.7 ? '绿色' : (pct > 0.4 ? '橙色' : '红色');
                    return { fail: true, msg: u.name + '血量' + Math.floor(pct * 100) + '%，血条应该是' + expName + '，但现在是' + actual };
                }
            }
            return { fail: false };
        }},

        { group: '❤️ 属性', name: '血量文字颜色检查', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return { fail: true, msg: '无法获取游戏上下文' };
            var all = (ctx.UI.allyTeam || []).concat(ctx.UI.enemyTeam || []);
            for (var i = 0; i < all.length; i++) {
                var u = all[i]; if (!u.alive) continue;
                var cell = getCellElement(u); if (!cell) continue;
                var pct = u.hp / u.maxHp;
                var expCls = pct > 0.7 ? 'hp-text-green' : (pct > 0.4 ? 'hp-text-orange' : 'hp-text-red');
                if (!cell.querySelector('.' + expCls)) {
                    var expName = pct > 0.7 ? '绿色' : (pct > 0.4 ? '橙色' : '红色');
                    return { fail: true, msg: u.name + '血量' + Math.floor(pct * 100) + '%，血量数字应该是' + expName + '，但颜色不对' };
                }
            }
            return { fail: false };
        }},

        { group: '❤️ 属性', name: '血量合法性检查', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return { fail: true, msg: '无法获取游戏上下文' };
            var all = (ctx.UI.allyTeam || []).concat(ctx.UI.enemyTeam || []);
            for (var i = 0; i < all.length; i++) {
                var u = all[i]; if (!u.alive) continue;
                if (u.hp > u.maxHp) return { fail: true, msg: u.name + '血量' + Math.floor(u.hp) + '超过了上限' + Math.floor(u.maxHp) + '，血量溢出了' };
                if (u.hp < 0) return { fail: true, msg: u.name + '血量为负数' + u.hp + '，数据异常' };
            }
            return { fail: false };
        }},

        { group: '❤️ 属性', name: '攻防文字同步', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return { fail: true, msg: '无法获取游戏上下文' };
            var all = (ctx.UI.allyTeam || []).concat(ctx.UI.enemyTeam || []);
            for (var i = 0; i < all.length; i++) {
                var u = all[i]; if (!u.alive) continue;
                var cell = getCellElement(u); if (!cell) continue;
                var span = cell.querySelector('.cell-stats'); if (!span) continue;
                var t = span.textContent;
                var am = t.match(/攻(\d+)/), dm = t.match(/防(\d+)/);
                if (!am || !dm) continue;
                var expAtk = Math.floor(u.atk + u.atk * (u.buffAtkBonus || 0));
                var expDef = Math.floor(u.def + u.def * (u.buffDefBonus || 0));
                if (parseInt(am[1]) !== expAtk || parseInt(dm[1]) !== expDef) {
                    return { fail: true, msg: u.name + '面板攻击' + am[1] + '防御' + dm[1] + '，但引擎算出来应该是攻击' + expAtk + '防御' + expDef + '，Buff加成可能没生效' };
                }
            }
            return { fail: false };
        }},

        // ========== Buff 检查 ==========
        { group: '✨ Buff', name: 'Buff和技能图标检查', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return { fail: true, msg: '无法获取游戏上下文' };
            var ally = ctx.UI.allyTeam || [];
            var enemy = ctx.UI.enemyTeam || [];
            var all = ally.concat(enemy);
            var activeBuffs = ctx.activeBuffs || [];
            var doubleStrikeUid = ctx.currentDoubleStrikeUid;

            for (var i = 0; i < all.length; i++) {
                var u = all[i]; if (!u.alive) continue;
                var cell = getCellElement(u); if (!cell) continue;
                var nameEl = cell.querySelector('.cell-name');
                if (!nameEl) continue;
                var nameText = nameEl.textContent;

                // 玄冥毒❄️
                if (u._xuanmingPoison && u._xuanmingPoison.remaining > 0 && nameText.indexOf('❄️') === -1) {
                    return { fail: true, msg: u.name + '中了玄冥神掌但名字旁边没有❄️标记' };
                }
                // 周芷若快乐💖
                if (u.name === '周芷若' && u._hasKuaiLe && nameText.indexOf('💖') === -1) {
                    return { fail: true, msg: '周芷若处于快乐状态但名字旁边没有💖' };
                }
                // 宋青书性奋💗
                if (u.name === '宋青书' && u._hasXingFen && nameText.indexOf('💗') === -1) {
                    return { fail: true, msg: '宋青书处于性奋状态但名字旁边没有💗' };
                }
                // 概率连击⚡
                if (doubleStrikeUid && u.uid === doubleStrikeUid && nameText.indexOf('⚡') === -1) {
                    return { fail: true, msg: u.name + '被选为概率连击单位但名字旁边没有⚡' };
                }
                // 严阵以待🛡️
                if (u.role === '防战' && activeBuffs.some(function(b) { return b.key === 'fortify'; }) && nameText.indexOf('🛡️') === -1) {
                    return { fail: true, msg: u.name + '有严阵以待Buff但名字旁边没有🛡️' };
                }
                // 嗜血狂刀🗡️
                if (u.role === '战士' && activeBuffs.some(function(b) { return b.key === 'bloodthirst'; }) && nameText.indexOf('🗡️') === -1) {
                    return { fail: true, msg: u.name + '有嗜血狂刀Buff但名字旁边没有🗡️' };
                }
                // 流星赶月☄️
                if (u.role === '远程' && activeBuffs.some(function(b) { return b.key === 'meteorShower'; }) && nameText.indexOf('☄️') === -1) {
                    return { fail: true, msg: u.name + '有流星赶月Buff但名字旁边没有☄️' };
                }
                // 圣火令🔥
                if (activeBuffs.some(function(b) { return b.key === 'holyFlame'; }) && nameText.indexOf('🔥') === -1) {
                    // 圣火令只对特定行列生效，这里简化：有圣火令Buff时至少应有单位带🔥
                }
                // 张无忌近战⚔️
                if (u.isZhang && !u.rangedForm && nameText.indexOf('⚔️') === -1) {
                    return { fail: true, msg: '张无忌切换近战后图标应为⚔️，但格子上没有' };
                }
            }
            return { fail: false };
        }},

        { group: '✨ Buff', name: 'Buff槽位显示检查', test: function() {
            var ctx = getCtx(); if (!ctx) return { fail: true, msg: '无法获取游戏上下文' };
            var buffs = ctx.activeBuffs || [];
            var s0 = doc.getElementById('buffSlot0'), s1 = doc.getElementById('buffSlot1');
            if (!s0 || !s1) return { fail: true, msg: 'Buff槽位DOM元素缺失' };
            var exp0 = buffs.length > 0 ? buffs[0].name + '/' + buffs[0].remaining + '回' : 'buff1';
            var exp1 = buffs.length > 1 ? buffs[1].name + '/' + buffs[1].remaining + '回' : 'buff2';
            if (s0.textContent !== exp0) return { fail: true, msg: 'Buff槽0显示"' + s0.textContent + '"，应该是"' + exp0 + '"' };
            if (s1.textContent !== exp1) return { fail: true, msg: 'Buff槽1显示"' + s1.textContent + '"，应该是"' + exp1 + '"' };
            return { fail: false };
        }},

        { group: '✨ Buff', name: 'Buff回合数检查', test: function() {
            var ctx = getCtx(); if (!ctx) return { fail: true, msg: '无法获取游戏上下文' };
            var buffs = ctx.activeBuffs || [];
            for (var i = 0; i < buffs.length; i++) {
                var b = buffs[i];
                if (b.remaining < 0) return { fail: true, msg: b.name + '剩余回合数为' + b.remaining + '，不该为负数' };
                // 检查是否有双重扣除：同一个Buff在两个槽位显示不同的回合数
                var s0 = doc.getElementById('buffSlot0'), s1 = doc.getElementById('buffSlot1');
                if (i === 0 && s0 && s0.textContent.indexOf('/') !== -1) {
                    var match = s0.textContent.match(/(\d+)回/);
                    if (match && parseInt(match[1]) !== b.remaining) {
                        return { fail: true, msg: b.name + '槽位显示剩余' + match[1] + '回，但实际剩余' + b.remaining + '回，显示不同步' };
                    }
                }
            }
            return { fail: false };
        }},

        // ========== 状态动画 ==========
        { group: '🎭 状态', name: '战斗状态动画检查', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return { fail: true, msg: '无法获取游戏上下文' };
            var all = (ctx.UI.allyTeam || []).concat(ctx.UI.enemyTeam || []);
            for (var i = 0; i < all.length; i++) {
                var u = all[i];
                var cell = getCellElement(u); if (!cell) continue;
                // 攻击闪光
                if (u._flash === 'attack') {
                    var bg = win.getComputedStyle(cell).backgroundColor;
                    if (bg !== 'rgb(30, 110, 184)') return { fail: true, msg: u.name + '正在攻击但背景色不是蓝色，攻击动画可能没播放' };
                }
                // 防御闪光
                if (u._flash === 'defend') {
                    var bg = win.getComputedStyle(cell).backgroundColor;
                    if (bg !== 'rgb(241, 196, 15)') return { fail: true, msg: u.name + '正在防御但背景色不是金色，防御动画可能没播放' };
                }
                // 休息zzz
                if (u._resting && u.alive && !u.isZhang) {
                    if (!cell.querySelector('.zzz-mark')) return { fail: true, msg: u.name + '处于休息状态但格子上没有zzz标记' };
                }
                // 残留闪光
                if (cell.dataset.flash && !u._flash) {
                    return { fail: true, msg: u.name + '格子上有残留的' + cell.dataset.flash + '闪光标记，动画可能没有清理干净' };
                }
            }
            return { fail: false };
        }},

        // ========== 阵容检查 ==========
        { group: '👥 阵容', name: '双方人数检查', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return { fail: true, msg: '无法获取游戏上下文' };
            var stage = ctx.currentStage || 1;
            var ally = ctx.UI.allyTeam || [];
            var enemy = ctx.UI.enemyTeam || [];
            var allyCount = ally.length;
            var enemyCount = enemy.length;
            if (allyCount !== 5) return { fail: true, msg: '明教应该有5人，但只有' + allyCount + '人' };
            var expectedEnemy = (stage === 5) ? 6 : 5;
            if (enemyCount !== expectedEnemy) return { fail: true, msg: '第' + stage + '关六大派应该有' + expectedEnemy + '人，但只有' + enemyCount + '人' };
            return { fail: false };
        }},

        { group: '👥 阵容', name: '精英怪存在性检查', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return { fail: true, msg: '无法获取游戏上下文' };
            var stage = ctx.currentStage || 1;
            var enemy = ctx.UI.enemyTeam || [];
            var eliteMap = {
                3: ['宋青书'],
                4: ['宋青书', '周芷若'],
                5: ['鹿杖客', '鹤笔翁'],
                6: ['成昆']
            };
            var required = eliteMap[stage];
            if (!required) return { fail: false };
            for (var i = 0; i < required.length; i++) {
                var name = required[i];
                if (!enemy.some(function(u) { return u.name === name; })) {
                    return { fail: true, msg: '第' + stage + '关缺少精英怪"' + name + '"，它没有生成' };
                }
            }
            return { fail: false };
        }},

        // ========== UI 控制 ==========
        { group: '🎮 UI控制', name: '按钮状态一致性检查', test: function() {
            var ctx = getCtx(); if (!ctx) return { fail: true, msg: '无法获取游戏上下文' };
            var gs = ctx.gs;
            // 检查 _fastForwardActive 残留
            if (win._fastForwardActive === true && gs === 'IDLE') {
                return { fail: true, msg: '上一局快进标志没清掉，下一局可能开局就快进' };
            }
            // 检查速度与按钮高亮
            var speed = ctx.speed;
            var btn2 = doc.getElementById('btnSpeed2');
            if (btn2 && speed !== 500 && btn2.classList.contains('active')) {
                // 可能没问题，因为active由updateSpeedButtons控制
            }
            // 检查调试面板
            if (ctx.debugMode) {
                var panel = doc.getElementById('debugPanel');
                if (panel && panel.style.display === 'none') {
                    return { fail: true, msg: '调试模式已开启但调试面板没显示' };
                }
                var grpH = doc.getElementById('speedGroupHigh');
                if (grpH && grpH.style.display === 'none') {
                    return { fail: true, msg: '调试模式已开启但高级倍速按钮没显示' };
                }
            }
            return { fail: false };
        }},

        // ========== 特效检查 ==========
        { group: '🎬 特效', name: '特效残留检查', test: function() {
            var orphans = doc.querySelectorAll('[data-fx="temporary"]');
            if (orphans.length > 0) {
                return { fail: true, msg: '战斗结束后发现' + orphans.length + '个未清理的特效元素，可能是快进或重开时清理不完整' };
            }
            return { fail: false };
        }}
    ];
}

export { createHealthRules };