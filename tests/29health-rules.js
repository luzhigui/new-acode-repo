// tests/29health-rules.js - 光明顶5v5 体检规则库
// V4.0.0 | ~15781 bytes | 2026-07-05
export const VER = 'tests/29health-rules.js V4.0.0';

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
        // ========== 格子基础 (4条) ==========
        { group: '🎨 格子', name: '明教格子数量', test: function() {
            var g = doc.getElementById('allyGrid');
            var count = g ? g.children.length : 0;
            if (count !== 9) return { fail: true, msg: '明教格子数量为 ' + count + '，预期 9' };
            return { fail: false };
        }},
        { group: '🎨 格子', name: '六大派格子数量', test: function() {
            var g = doc.getElementById('enemyGrid');
            var count = g ? g.children.length : 0;
            if (count !== 9) return { fail: true, msg: '六大派格子数量为 ' + count + '，预期 9' };
            return { fail: false };
        }},
        { group: '🎨 格子', name: 'data-pos 合法', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return { fail: true, msg: '无法获取游戏上下文' };
            var ally = ctx.UI.allyTeam || [];
            var enemy = ctx.UI.enemyTeam || [];
            for (var i = 0; i < ally.length; i++) {
                var u = ally[i]; if (!u.alive) continue;
                var cell = getCellElement(u); if (!cell) continue;
                var p = parseInt(cell.dataset.pos);
                if (isNaN(p) || p < 1 || p > 9) return { fail: true, msg: u.name + ' 的格子 data-pos=' + cell.dataset.pos + '，不合法' };
            }
            for (var i = 0; i < enemy.length; i++) {
                var u = enemy[i]; if (!u.alive) continue;
                var cell = getCellElement(u); if (!cell) continue;
                var p = parseInt(cell.dataset.pos);
                if (isNaN(p) || p < 1 || p > 9) return { fail: true, msg: u.name + ' 的格子 data-pos=' + cell.dataset.pos + '，不合法' };
            }
            return { fail: false };
        }},
        { group: '🎨 格子', name: '死亡单位标记完整', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return { fail: true, msg: '无法获取游戏上下文' };
            var all = (ctx.UI.allyTeam || []).concat(ctx.UI.enemyTeam || []);
            for (var i = 0; i < all.length; i++) {
                var u = all[i];
                if (!u.alive || u._isDead) {
                    var cell = getCellElement(u);
                    if (!cell) return { fail: true, msg: u.name + ' 已阵亡但找不到对应格子（pos=' + u.pos + '）' };
                    if (!cell.querySelector('.dead-mark')) return { fail: true, msg: u.name + ' 已阵亡但格子缺少 dead-mark' };
                    if (cell.dataset.flash !== 'dead') return { fail: true, msg: u.name + ' 已阵亡但 data-flash 不是 dead，而是 ' + cell.dataset.flash };
                }
            }
            return { fail: false };
        }},

        // ========== 血条与属性 (5条) ==========
        { group: '❤️ 血条', name: '血条高度与血量一致', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return { fail: true, msg: '无法获取游戏上下文' };
            var all = (ctx.UI.allyTeam || []).concat(ctx.UI.enemyTeam || []);
            for (var i = 0; i < all.length; i++) {
                var u = all[i]; if (!u.alive) continue;
                var cell = getCellElement(u); if (!cell) continue;
                var bar = cell.querySelector('.hp-bar-inner'); if (!bar) continue;
                var expected = Math.floor((u.hp / u.maxHp) * 100);
                var actual = parseFloat(bar.style.height);
                if (Math.abs(actual - expected) > 2) {
                    return { fail: true, msg: u.name + ' 血条高度 ' + actual + '%，血量百分比 ' + expected + '%（' + Math.floor(u.hp) + '/' + Math.floor(u.maxHp) + '）' };
                }
            }
            return { fail: false };
        }},
        { group: '❤️ 血条', name: '血条颜色与血量区间一致', test: function() {
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
                    return { fail: true, msg: u.name + ' 血条颜色 ' + actual + '，预期 ' + exp + '（血量 ' + Math.floor(u.hp) + '/' + Math.floor(u.maxHp) + '）' };
                }
            }
            return { fail: false };
        }},
        { group: '❤️ 血条', name: '血量文字颜色与区间一致', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return { fail: true, msg: '无法获取游戏上下文' };
            var all = (ctx.UI.allyTeam || []).concat(ctx.UI.enemyTeam || []);
            for (var i = 0; i < all.length; i++) {
                var u = all[i]; if (!u.alive) continue;
                var cell = getCellElement(u); if (!cell) continue;
                var pct = u.hp / u.maxHp;
                var expCls = pct > 0.7 ? 'hp-text-green' : (pct > 0.4 ? 'hp-text-orange' : 'hp-text-red');
                if (!cell.querySelector('.' + expCls)) {
                    return { fail: true, msg: u.name + ' 血量文字缺少 class ' + expCls + '（血量 ' + Math.floor(u.hp) + '/' + Math.floor(u.maxHp) + '）' };
                }
            }
            return { fail: false };
        }},
        { group: '❤️ 属性', name: '面板攻防含 Buff', test: function() {
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
                    return { fail: true, msg: u.name + ' 面板攻' + am[1] + '防' + dm[1] + '，引擎攻' + expAtk + '防' + expDef };
                }
            }
            return { fail: false };
        }},
        { group: '❤️ 属性', name: '血量不超上限', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return { fail: true, msg: '无法获取游戏上下文' };
            var all = (ctx.UI.allyTeam || []).concat(ctx.UI.enemyTeam || []);
            for (var i = 0; i < all.length; i++) {
                var u = all[i]; if (!u.alive) continue;
                if (u.hp > u.maxHp) return { fail: true, msg: u.name + ' 血量 ' + Math.floor(u.hp) + ' 超过上限 ' + Math.floor(u.maxHp) };
                if (u.hp < 0) return { fail: true, msg: u.name + ' 血量为负数 ' + u.hp };
            }
            return { fail: false };
        }},

        // ========== Buff 图标 (3条) ==========
        { group: '✨ Buff', name: '概率连击单位有⚡', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return { fail: true, msg: '无法获取游戏上下文' };
            var uid = ctx.currentDoubleStrikeUid; if (!uid) return { fail: false };
            var all = (ctx.UI.allyTeam || []).concat(ctx.UI.enemyTeam || []);
            var unit = all.find(function(u) { return u.uid === uid; });
            if (!unit) return { fail: true, msg: '概率连击单位（uid=' + uid + '）在 UI 中找不到' };
            var cell = getCellElement(unit);
            if (!cell) return { fail: true, msg: '概率连击单位 ' + unit.name + ' 找不到对应格子' };
            var cn = cell.querySelector('.cell-name');
            if (cn && cn.textContent.indexOf('⚡') === -1) {
                return { fail: true, msg: unit.name + ' 被选为概率连击单位但格子缺少⚡' };
            }
            return { fail: false };
        }},
        { group: '✨ Buff', name: 'Buff 槽位文本正确', test: function() {
            var ctx = getCtx(); if (!ctx) return { fail: true, msg: '无法获取游戏上下文' };
            var buffs = ctx.activeBuffs || [];
            var s0 = doc.getElementById('buffSlot0'), s1 = doc.getElementById('buffSlot1');
            if (!s0 || !s1) return { fail: true, msg: 'Buff 槽位 DOM 缺失' };
            var exp0 = buffs.length > 0 ? buffs[0].name + '/' + buffs[0].remaining + '回' : 'buff1';
            var exp1 = buffs.length > 1 ? buffs[1].name + '/' + buffs[1].remaining + '回' : 'buff2';
            if (s0.textContent !== exp0) return { fail: true, msg: 'Buff槽0 显示"' + s0.textContent + '" 预期"' + exp0 + '"' };
            if (s1.textContent !== exp1) return { fail: true, msg: 'Buff槽1 显示"' + s1.textContent + '" 预期"' + exp1 + '"' };
            return { fail: false };
        }},
        { group: '✨ Buff', name: 'Buff 图标无脏数据', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return { fail: true, msg: '无法获取游戏上下文' };
            var ally = ctx.UI.allyTeam || [];
            for (var i = 0; i < ally.length; i++) {
                var u = ally[i]; if (!u.alive) continue;
                var cell = getCellElement(u); if (!cell) continue;
                var cn = cell.querySelector('.cell-name');
                if (cn && cn.textContent.indexOf('undefined') !== -1) {
                    return { fail: true, msg: u.name + ' 的格子名称包含 undefined' };
                }
            }
            return { fail: false };
        }},

        // ========== 状态样式 (4条) ==========
        { group: '🎭 状态', name: '攻击闪光正确', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return { fail: true, msg: '无法获取游戏上下文' };
            var all = (ctx.UI.allyTeam || []).concat(ctx.UI.enemyTeam || []);
            for (var i = 0; i < all.length; i++) {
                var u = all[i]; if (u._flash !== 'attack') continue;
                var cell = getCellElement(u);
                if (!cell) return { fail: true, msg: u.name + ' 闪光为 attack 但找不到对应格子' };
                var bg = win.getComputedStyle(cell).backgroundColor;
                if (bg !== 'rgb(30, 110, 184)') return { fail: true, msg: u.name + ' 攻击闪光背景色 ' + bg + '，预期 rgb(30,110,184)' };
            }
            return { fail: false };
        }},
        { group: '🎭 状态', name: '防御闪光正确', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return { fail: true, msg: '无法获取游戏上下文' };
            var all = (ctx.UI.allyTeam || []).concat(ctx.UI.enemyTeam || []);
            for (var i = 0; i < all.length; i++) {
                var u = all[i]; if (u._flash !== 'defend') continue;
                var cell = getCellElement(u);
                if (!cell) return { fail: true, msg: u.name + ' 闪光为 defend 但找不到对应格子' };
                var bg = win.getComputedStyle(cell).backgroundColor;
                if (bg !== 'rgb(241, 196, 15)') return { fail: true, msg: u.name + ' 防御闪光背景色 ' + bg + '，预期 rgb(241,196,15)' };
            }
            return { fail: false };
        }},
        { group: '🎭 状态', name: '休息单位有 zzz', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return { fail: true, msg: '无法获取游戏上下文' };
            var all = (ctx.UI.allyTeam || []).concat(ctx.UI.enemyTeam || []);
            for (var i = 0; i < all.length; i++) {
                var u = all[i];
                if (u._resting && u.alive && !u.isZhang) {
                    var cell = getCellElement(u);
                    if (!cell) return { fail: true, msg: u.name + ' 处于休息状态但找不到对应格子' };
                    if (!cell.querySelector('.zzz-mark')) return { fail: true, msg: u.name + ' 处于休息状态但格子缺少 zzz-mark' };
                }
            }
            return { fail: false };
        }},
        { group: '🎭 状态', name: '无残留 data-flash', test: function() {
            var cells = doc.querySelectorAll('#allyGrid .cell[data-flash], #enemyGrid .cell[data-flash]');
            for (var i = 0; i < cells.length; i++) {
                var c = cells[i];
                if (c.dataset.flash === 'dead' && !c.querySelector('.dead-mark')) {
                    return { fail: true, msg: '格子 ' + c.dataset.pos + ' 有 data-flash="dead" 但无死亡标记' };
                }
            }
            return { fail: false };
        }},

        // ========== 站位调整 (2条) ==========
        { group: '📍 站位', name: '固定单位样式正确', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI || !ctx.adjustMode) return { fail: false };
            var ally = ctx.UI.allyTeam || [];
            for (var i = 0; i < ally.length; i++) {
                var u = ally[i];
                var cell = getCellElement(u); if (!cell) continue;
                if (u.fixed && !cell.classList.contains('fixed-unit')) return { fail: true, msg: u.name + ' 是固定单位但格子缺少 fixed-unit class' };
                if (!u.fixed && !cell.classList.contains('swappable')) return { fail: true, msg: u.name + ' 是可换位单位但格子缺少 swappable class' };
            }
            return { fail: false };
        }},
        { group: '📍 站位', name: '张无忌在5号位', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return { fail: true, msg: '无法获取游戏上下文' };
            var ally = ctx.UI.allyTeam || [];
            var zhang = ally.find(function(u) { return u.isZhang; });
            if (zhang && zhang.pos !== 5) return { fail: true, msg: '张无忌站在 ' + zhang.pos + ' 号位，预期 5 号位' };
            return { fail: false };
        }}
    ];
}

export { createHealthRules };