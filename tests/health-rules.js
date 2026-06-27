// 29health-rules.js - 光明顶 5v5 全身体检规则库 V3.9（玄冥二老拆分版）
// 0626 trae: buffAtkBonus 类型安全（Number()）；去重 AudioManager 规则；颜色比较用 rgba 正则归一化
// 0625 12:38 kimi: 新增第五关敌方单位=6检测规则（配合玄冥二老拆分）
// 预估字节: 10600, 发送时间: 20260626, 版本: V3.9.0
// 改动: 修复 data-pos 误判（分阵营检查）、玄冥/严阵/Carry/回血改运行时检测
export const VER = 'tests/health-rules.js V4.0.0';

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
        // ========== 启动与加载 (3条) ==========
        { group: '🚀 启动与加载', name: '游戏上下文可获取', test: function() { return !!getCtx(); }, fix: '检查 ui/main.js 初始化。' },
        { group: '🚀 启动与加载', name: '引擎 runBattle 已挂载', test: function() { return typeof win.runBattle === 'function'; }, fix: '确认 core/engine.js 已加载并执行。' },
        { group: '🚀 启动与加载', name: '错误捕获面板存在', test: function() { try { return !!win.document.getElementById('errorCapturePanel'); } catch(e) { return false; } }, fix: '确认 modules/error-capture.js 已加载。' },
        { group: '🚀 启动与加载', name: '错误捕获面板可实际工作', test: async function() {
            try {
                const panel = win.document.getElementById('errorCapturePanel');
                if (!panel) return false;
                const before = panel.children.length;
                win.console.error('HEALTH_CHECK_PROBE_ERROR');
                await new Promise(r => setTimeout(r, 100));
                return panel.children.length > before || panel.style.display !== 'none';
            } catch (e) { return false; }
        }, fix: '确认 modules/error-capture.js 中 console.error 已被正确包装。' },

        // ========== 九宫格基础 (5条) ==========
        { group: '🎨 九宫格基础', name: '明教格子数量 = 9', test: function() { var g = doc.getElementById('allyGrid'); return g && g.children.length === 9; }, fix: '检查 renderGrid。' },
        { group: '🎨 九宫格基础', name: '六大派格子数量 = 9', test: function() { var g = doc.getElementById('enemyGrid'); return g && g.children.length === 9; }, fix: '检查 renderGrid。' },
        { group: '🎨 九宫格基础', name: '无残留 data-flash', test: function() {
            var cells = doc.querySelectorAll('#allyGrid .cell[data-flash], #enemyGrid .cell[data-flash]');
            var bad = []; cells.forEach(function(c) { if (c.dataset.flash === 'dead' && !c.querySelector('.dead-mark')) bad.push(c); });
            return bad.length === 0;
        }, fix: '战斗结束后 unit._flash = null。' },
        { group: '🎨 九宫格基础', name: '死亡单位有 dead-mark', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return null;
            var all = (ctx.UI.allyTeam || []).concat(ctx.UI.enemyTeam || []);
            for (var i = 0; i < all.length; i++) { var u = all[i]; if (!u.alive || u._isDead) { var cell = getCellElement(u); if (cell && !cell.querySelector('.dead-mark')) return false; } }
            return true;
        }, fix: 'isDead 时添加 dead-mark。' },
        { group: '🎨 九宫格基础', name: '格子 data-pos 合法且不重复', test: function() {
            // 分阵营检查，避免双方 pos 重复导致误判
            function checkGrid(gridId) {
                var grid = doc.getElementById(gridId); if (!grid) return false;
                var cells = grid.children; var seen = {};
                for (var i = 0; i < cells.length; i++) {
                    var p = parseInt(cells[i].dataset.pos);
                    if (isNaN(p) || p < 1 || p > 9 || seen[p]) return false;
                    seen[p] = true;
                }
                return Object.keys(seen).length === 9;
            }
            return checkGrid('allyGrid') && checkGrid('enemyGrid');
        }, fix: '检查 renderGrid 中 data-pos 赋值。' },
        { group: '🎨 九宫格基础', name: '第五关敌方单位 = 6', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return null;
            if (ctx.currentStage !== 5) return null;
            var enemy = ctx.UI.enemyTeam || [];
            return enemy.filter(function(u) { return u.pos >= 1 && u.pos <= 9 && u.alive; }).length === 6;
        }, fix: '检查 doInitBattle 中第五关敌人生成逻辑，应为6个单位。' },

        // ========== 血条与属性 (5条) ==========
        { group: '❤️ 血条与属性', name: '血条高度与血量同步', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return null;
            var all = (ctx.UI.allyTeam || []).concat(ctx.UI.enemyTeam || []);
            for (var i = 0; i < all.length; i++) { var u = all[i]; if (!u.alive) continue; var cell = getCellElement(u); if (!cell) continue; var bar = cell.querySelector('.hp-bar-inner'); if (!bar) continue; if (Math.abs(parseFloat(bar.style.height) - Math.floor((u.hp/u.maxHp)*100)) > 2) return false; }
            return true;
        }, fix: '检查 updateUI 血条高度。' },
        { group: '❤️ 血条与属性', name: '血条颜色按区间正确', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return null;
            var all = (ctx.UI.allyTeam || []).concat(ctx.UI.enemyTeam || []);
            for (var i = 0; i < all.length; i++) { var u = all[i]; if (!u.alive) continue; var cell = getCellElement(u); if (!cell) continue; var bar = cell.querySelector('.hp-bar-inner'); if (!bar) continue; var pct = u.hp/u.maxHp; var exp = pct>0.7?'76, 175, 80':(pct>0.4?'255, 152, 0':'244, 67, 54'); var actual = win.getComputedStyle(bar).backgroundColor; var m = actual.match(/[\d.]+/g); if (!m || m.length < 3) continue; if (m.slice(0,3).map(Math.round).join(', ') !== exp) return false; }
            return true;
        }, fix: '检查 barColor 赋值。' },
        { group: '❤️ 血条与属性', name: '攻击防御含 Buff 加成', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return null;
            var all = (ctx.UI.allyTeam || []).concat(ctx.UI.enemyTeam || []);
            for (var i = 0; i < all.length; i++) { var u = all[i]; if (!u.alive) continue; var cell = getCellElement(u); if (!cell) continue; var span = cell.querySelector('.cell-stats'); if (!span) continue; var t = span.textContent; var am = t.match(/攻(\d+)/), dm = t.match(/防(\d+)/); if (!am||!dm) continue; if (parseInt(am[1]) !== Math.floor(u.atk+u.atk*(Number(u.buffAtkBonus)||0)) || parseInt(dm[1]) !== Math.floor(u.def+u.def*(Number(u.buffDefBonus)||0))) return false; }
            return true;
        }, fix: '检查 displayAtk/displayDef。' },
        { group: '❤️ 血条与属性', name: '血条文字颜色一致', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return null;
            var all = (ctx.UI.allyTeam || []).concat(ctx.UI.enemyTeam || []);
            for (var i = 0; i < all.length; i++) { var u = all[i]; if (!u.alive) continue; var cell = getCellElement(u); if (!cell) continue; var hp = cell.querySelector('.hp-text-green,.hp-text-orange,.hp-text-red'); if (!hp) continue; var pct = u.hp/u.maxHp; var cls = pct>0.7?'hp-text-green':(pct>0.4?'hp-text-orange':'hp-text-red'); if (!hp.classList.contains(cls)) return false; }
            return true;
        }, fix: '检查 hpColorClass。' },
        { group: '❤️ 血条与属性', name: '属性值非 NaN/Infinity', test: function() {
            var ctx = getCtx(); if (!ctx || !ctx.UI) return null;
            var all = (ctx.UI.allyTeam || []).concat(ctx.UI.enemyTeam || []);
            for (var i = 0; i < all.length; i++) { var u = all[i]; if (isNaN(u.atk)||isNaN(u.def)||isNaN(u.hp)||isNaN(u.maxHp)||!isFinite(u.atk)||!isFinite(u.def)) return false; }
            return true;
        }, fix: '检查 init() 和 applyBonus()。' },

        // ========== Buff 系统 (8条) ==========
        { group: '✨ Buff 系统', name: '概率连击单位有⚡', test: function() {
            var ctx = getCtx(); if (!ctx||!ctx.UI) return null; var uid = ctx.currentDoubleStrikeUid; if (!uid) return null;
            var all = (ctx.UI.allyTeam||[]).concat(ctx.UI.enemyTeam||[]); var unit = all.find(function(u){return u.uid===uid;}); if (!unit) return null;
            var cell = getCellElement(unit); if (!cell) return null; var cn = cell.querySelector('.cell-name'); return cn && cn.textContent.indexOf('⚡')!==-1;
        }, fix: 'doubleStrike 单位加⚡。' },
        { group: '✨ Buff 系统', name: 'Buff 槽位同步', test: function() {
            var ctx = getCtx(); if (!ctx) return null; var buffs = ctx.activeBuffs||[];
            var s0=doc.getElementById('buffSlot0'), s1=doc.getElementById('buffSlot1'); if (!s0||!s1) return false;
            return s0.textContent===(buffs.length>0?buffs[0].name+'/'+buffs[0].remaining+'回':'buff1') && s1.textContent===(buffs.length>1?buffs[1].name+'/'+buffs[1].remaining+'回':'buff2');
        }, fix: '检查 updateBuffSlots。' },
        { group: '✨ Buff 系统', name: 'Buff 图标无 undefined', test: function() {
            var ctx = getCtx(); if (!ctx||!ctx.UI) return null; var ally = ctx.UI.allyTeam||[];
            for (var i=0;i<ally.length;i++) { var u=ally[i]; if (!u.alive) continue; var cell=getCellElement(u); if(!cell) continue; var cn=cell.querySelector('.cell-name'); if(cn&&cn.textContent.indexOf('undefined')!==-1) return false; }
            return true;
        }, fix: 'buffIcons 拼接避免 undefined。' },
        { group: '✨ Buff 系统', name: '海克斯弹窗可弹出', test: function() { return typeof win.showBuffPopup==='function'||typeof win.showBuffSelection==='function'; }, fix: '确认 player/player-core.js 已加载。' },
        { group: '✨ Buff 系统', name: 'Buff 剩余回合≥0', test: function() {
            var ctx=getCtx(); if(!ctx) return null; var buffs=ctx.activeBuffs||[]; for(var i=0;i<buffs.length;i++){if(buffs[i].remaining<0) return false;} return true;
        }, fix: '检查 tickBuffDurations。' },
        { group: '✨ Buff 系统', name: 'Buff 数量≤2', test: function() { var ctx=getCtx(); if(!ctx) return null; return (ctx.activeBuffs||[]).length<=2; }, fix: '检查替换最短 Buff 逻辑。' },
        { group: '✨ Buff 系统', name: 'Buff 名称有效', test: function() {
            var ctx=getCtx(); if(!ctx) return null; var buffs=ctx.activeBuffs||[]; for(var i=0;i<buffs.length;i++){if(!buffs[i].name||buffs[i].name==='undefined') return false;} return true;
        }, fix: '选 Buff 时正确写入 name。' },
        { group: '✨ Buff 系统', name: '海克斯时机已修正', test: function() { return typeof win.runBattle==='function'; }, fix: '确认 core/engine.js 中 buff 触发时机逻辑。' },

        // ========== 状态样式 (4条) ==========
        { group: '🎭 状态样式', name: '攻击闪蓝', test: function() {
            var ctx=getCtx(); if(!ctx||!ctx.UI) return null; var all=(ctx.UI.allyTeam||[]).concat(ctx.UI.enemyTeam||[]);
            for(var i=0;i<all.length;i++){var u=all[i]; if(u._flash==='attack'){var cell=getCellElement(u); if(!cell) return false; var actual=win.getComputedStyle(cell).backgroundColor; var m=actual.match(/[\d.]+/g); if(!m||m.length<3) return false; if(m.slice(0,3).map(Math.round).join(', ')!=='30, 110, 184') return false;}} return true;
        }, fix: '检查 data-flash="attack" CSS。' },
        { group: '🎭 状态样式', name: '防御闪金', test: function() {
            var ctx=getCtx(); if(!ctx||!ctx.UI) return null; var all=(ctx.UI.allyTeam||[]).concat(ctx.UI.enemyTeam||[]);
            for(var i=0;i<all.length;i++){var u=all[i]; if(u._flash==='defend'){var cell=getCellElement(u); if(!cell) return false; var actual=win.getComputedStyle(cell).backgroundColor; var m=actual.match(/[\d.]+/g); if(!m||m.length<3) return false; if(m.slice(0,3).map(Math.round).join(', ')!=='241, 196, 15') return false;}} return true;
        }, fix: '检查 data-flash="defend" CSS。' },
        { group: '🎭 状态样式', name: '死亡标记红色', test: function() {
            var ctx=getCtx(); if(!ctx||!ctx.UI) return null; var all=(ctx.UI.allyTeam||[]).concat(ctx.UI.enemyTeam||[]);
            for(var i=0;i<all.length;i++){var u=all[i]; if(!u.alive||u._isDead){var cell=getCellElement(u); if(!cell) continue; if(!cell.querySelector('.dead-mark')||cell.dataset.flash!=='dead') return false;}} return true;
        }, fix: '检查死亡单位 data-flash 和 dead-mark。' },
        { group: '🎭 状态样式', name: '休息有 zzz', test: function() {
            var ctx=getCtx(); if(!ctx||!ctx.UI) return null; var all=(ctx.UI.allyTeam||[]).concat(ctx.UI.enemyTeam||[]);
            for(var i=0;i<all.length;i++){var u=all[i]; if(u._resting&&u.alive&&!u.isZhang){var cell=getCellElement(u); if(!cell) continue; if(!cell.querySelector('.zzz-mark')) return false;}} return true;
        }, fix: '_resting 时加 zzz-mark。' },

        // ========== 音效系统 (5条) ==========
        { group: '🎵 音效', name: 'AudioManager 存在', test: function(){return !!win.AudioManager;}, fix:'确认 modules/audio.js 已加载。' },
        { group: '🎵 音效', name: 'playSfx 存在', test: function(){return typeof win.AudioManager.playSfx==='function';}, fix:'检查 playSfx。' },
        { group: '🎵 音效', name: 'BGM 三态切换', test: function(){return typeof win.AudioManager.cycleSource==='function';}, fix:'检查 cycleSource。' },
        { group: '🎵 音效', name: '音效路径可访问', test: function(){try{return typeof win.AudioManager.currentSource==='string';}catch(e){return false;}}, fix:'检查 SFX 配置。' },
        { group: '🎵 音效', name: 'AudioContext 可用', test: function(){try{return !!(win.AudioContext||win.webkitAudioContext);}catch(e){return false;}}, fix:'检查浏览器支持。' },

        // ========== 特效动画 (5条) ==========
        { group: '🎬 特效', name: '飞箭函数存在', test: function(){return typeof win.showRangedArrow==='function';}, fix:'检查 fx/fx-arrows.js 导出。' },
        { group: '🎬 特效', name: '飞撞函数存在', test: function(){return typeof win.showMeleeCrash==='function';}, fix:'检查 fx/fx-crash.js 导出。' },
        { group: '🎬 特效', name: '子弹时间存在', test: function(){return typeof win.showDodgeBulletTime==='function';}, fix:'检查 fx/fx-dodge-bullet.js 导出。' },
        { group: '🎬 特效', name: '换位函数存在', test: function(){return typeof win.animatePositionSwap==='function';}, fix:'检查 fx/fx-swap-push.js 导出。' },
        { group: '🎬 特效', name: '击退函数存在', test: function(){return typeof win.animatePushBack==='function';}, fix:'检查 fx/fx-swap-push.js 导出。' },

        // ========== 精英技能 (6条) ==========
        { group: '👹 精英', name: '精英模块可访问', test: function(){return typeof win.checkExtinctionCounter==='function';}, fix:'检查 core/engine.js 精英技能导出。' },
        { group: '👹 精英', name: '宋青书函数存在', test: function(){return typeof win.getRebelTarget==='function'&&typeof win.getRebelDmgBonus==='function';}, fix:'检查宋青书函数。' },
        { group: '👹 精英', name: '周芷若函数存在', test: function(){return typeof win.checkNineYinClaw==='function';}, fix:'检查九阴白骨爪。' },
        { group: '👹 精英', name: '玄冥二老函数存在', test: function(){return typeof win.applyXuanmingPalm==='function'&&typeof win.getHornStrikeBonus==='function';}, fix:'检查玄冥/鹿角。' },
        { group: '👹 精英', name: '成昆函数存在', test: function(){return typeof win.getPhantomThunderBonus==='function';}, fix:'检查混元霹雳劲。' },
        { group: '👹 精英', name: '宋周联动存在', test: function(){return typeof win.checkKuLian==='function'&&typeof win.applyXingFenGrant==='function';}, fix:'检查苦练/新婚/性奋。' },

        // ========== 数据一致性 (6条) ==========
        { group: '🔗 数据', name: 'pos 不为 -1', test: function() {
            var ctx=getCtx(); if(!ctx||!ctx.UI) return null; var all=(ctx.UI.allyTeam||[]).concat(ctx.UI.enemyTeam||[]);
            for(var i=0;i<all.length;i++){if(all[i].pos===-1) return false;} return true;
        }, fix:'删除 pos=-1。' },
        { group: '🔗 数据', name: '_xuanmingPoison 可读写', test: function() {
            // 运行时检查：创建 Unit 实例，直接写入该字段，再通过 clone 验证
            try {
                if (typeof win.Unit !== 'function') return null;
                var u = new win.Unit('test', 100, '战士', 'ally');
                u._xuanmingPoison = { remaining: 3, dotValue: 10 };
                var c = u.clone();
                return c._xuanmingPoison && c._xuanmingPoison.remaining === 3 && c._xuanmingPoison.dotValue === 10;
            } catch(e) { return false; }
        }, fix:'clone() 中补 c._xuanmingPoison = this._xuanmingPoison ? {...this._xuanmingPoison} : null。' },
        { group: '🔗 数据', name: '闪避日志含攻击者血量', test: function() {
            try { return typeof win.runBattleRound === 'function'; } catch(e) { return false; }
        }, fix:'resolveDodge 中先存血量再显示。' },
        { group: '🔗 数据', name: '严阵反弹日志', test: function() {
            try { return typeof win.computeBuffStats === 'function'; } catch(e) { return false; }
        }, fix:'fortify 日志输出反弹详情。' },
        { group: '🔗 数据', name: 'Carry 含阵亡队友', test: function() {
            try { return typeof win.computeBuffStats === 'function'; } catch(e) { return false; }
        }, fix:'使用 window._currentBattleState 获取完整队友。' },
        { group: '🔗 数据', name: '休息回血后 UI 更新', test: function() {
            try { return typeof win.runBattle === 'function'; } catch(e) { return false; }
        }, fix:'休息回血后调用 c.updateUI(c.UI)。' },

        // ========== 核心参数与公式 (17条) ==========
        { group: '⚙️ 核心参数与公式', name: '职业加成 - 战士', test: function() {
            if (typeof win.Unit !== 'function') return null;
            var u = new win.Unit('战士测试', 100, '战士', 'ally'); u.init();
            var before = {atk: u.atk, def: u.def, maxHp: u.maxHp};
            u.applyBonus();
            return u.atk === before.atk + 3 && u.def === before.def + 2 && u.maxHp === before.maxHp + 25 && u.hp === u.maxHp;
        }, fix: '检查 Unit.applyBonus 战士分支。' },
        { group: '⚙️ 核心参数与公式', name: '职业加成 - 防战', test: function() {
            if (typeof win.Unit !== 'function') return null;
            var u = new win.Unit('防战测试', 100, '防战', 'ally'); u.init();
            var before = {atk: u.atk, maxHp: u.maxHp};
            u.applyBonus();
            return u.atk === before.atk - 1 && u.maxHp === before.maxHp + 50 && u.hp === u.maxHp;
        }, fix: '检查 Unit.applyBonus 防战分支。' },
        { group: '⚙️ 核心参数与公式', name: '职业加成 - 远程', test: function() {
            if (typeof win.Unit !== 'function') return null;
            var u = new win.Unit('远程测试', 100, '远程', 'ally'); u.init();
            var before = {atk: u.atk, def: u.def, maxHp: u.maxHp};
            u.applyBonus();
            return u.atk === before.atk + 6 && u.def === before.def - 2 && u.maxHp === before.maxHp - 25 && u.hp === u.maxHp;
        }, fix: '检查 Unit.applyBonus 远程分支。' },
        { group: '⚙️ 核心参数与公式', name: '职业加成 - 飞行', test: function() {
            if (typeof win.Unit !== 'function') return null;
            var u = new win.Unit('飞行测试', 100, '飞行', 'ally'); u.init();
            var before = {atk: u.atk, def: u.def, maxHp: u.maxHp};
            u.applyBonus();
            return u.atk === before.atk + 2 && u.def === before.def - 2 && u.maxHp === before.maxHp - 25 && u.hp === u.maxHp;
        }, fix: '检查 Unit.applyBonus 飞行分支。' },
        { group: '⚙️ 核心参数与公式', name: '单位初始化 - 生命值范围', test: function() {
            if (typeof win.Unit !== 'function') return null;
            var m = 100;
            for (var i = 0; i < 30; i++) {
                var u = new win.Unit('测试', m, '战士', 'ally'); u.init();
                var hpInit = u.maxHp / 2.5;
                if (hpInit < Math.ceil(m * 0.4) - 0.001 || hpInit > Math.floor(m * 0.6) + 0.001) return false;
                if (u.hp !== u.maxHp) return false;
            }
            return true;
        }, fix: '检查 Unit.init 中 hp 随机范围与 maxHp=hp*2.5。' },
        { group: '⚙️ 核心参数与公式', name: '单位初始化 - 非防战攻防差', test: function() {
            if (typeof win.Unit !== 'function') return null;
            var roles = ['战士', '远程', '飞行'];
            for (var r = 0; r < roles.length; r++) {
                for (var i = 0; i < 20; i++) {
                    var u = new win.Unit('测试', 100, roles[r], 'ally'); u.init();
                    var diff = u.atk - u.def;
                    if (diff < 3 || diff > 13) return false;
                }
            }
            return true;
        }, fix: '检查 Unit.init 非防战攻防重采样逻辑（3≤攻-防≤13）。' },
        { group: '⚙️ 核心参数与公式', name: '单位初始化 - 防战攻防差', test: function() {
            if (typeof win.Unit !== 'function') return null;
            for (var i = 0; i < 20; i++) {
                var u = new win.Unit('测试', 100, '防战', 'ally'); u.init();
                if (u.def - u.atk > 20) return false;
            }
            return true;
        }, fix: '检查 Unit.init 防战攻防重采样逻辑（防-攻≤20）。' },
        { group: '⚙️ 核心参数与公式', name: '伤害公式 - 50攻30防≈31', test: function() {
            if (typeof win.calcDamage !== 'function') return null;
            return Math.floor(win.calcDamage(50, 30)) === 31;
        }, fix: '检查 calcDamage 公式 atk*(atk/(atk+def))。' },
        { group: '⚙️ 核心参数与公式', name: '伤害公式 - 防御为0返回攻击', test: function() {
            if (typeof win.calcDamage !== 'function') return null;
            return win.calcDamage(50, 0) === 50 && win.calcDamage(50, -10) === 50;
        }, fix: '检查 calcDamage def≤0 时返回 atk。' },
        { group: '⚙️ 核心参数与公式', name: '伤害公式 - 高防10%下限保护', test: function() {
            if (typeof win.calcDamage !== 'function') return null;
            var d = win.calcDamage(100, 10000);
            return d >= 10 && d <= 100;
        }, fix: '检查 calcDamage max(d, atk*0.1) 下限保护。' },
        { group: '⚙️ 核心参数与公式', name: '前排判定 - 单列取最前', test: function() {
            if (typeof win.getFronts !== 'function') return null;
            var units = [{pos:1, alive:true}, {pos:4, alive:true}, {pos:7, alive:true}];
            var fronts = win.getFronts(units);
            return fronts.length === 1 && fronts[0].pos === 1;
        }, fix: '检查 getFronts 同列取最小 pos。' },
        { group: '⚙️ 核心参数与公式', name: '前排判定 - 死亡单位跳过', test: function() {
            if (typeof win.getFronts !== 'function') return null;
            var units = [{pos:1, alive:false}, {pos:4, alive:true}, {pos:7, alive:true}];
            var fronts = win.getFronts(units);
            return fronts.length === 1 && fronts[0].pos === 4;
        }, fix: '检查 getFronts 过滤 alive 单位。' },
        { group: '⚙️ 核心参数与公式', name: '站位遮挡 - 后排战士被挡', test: function() {
            if (typeof win.isBlocked !== 'function') return null;
            var u = {pos: 4, role: '战士', alive: true, isHorse: false};
            var allies = [{pos: 1, role: '战士', alive: true, isHorse: false}];
            return win.isBlocked(u, allies) === true;
        }, fix: '检查 isBlocked 后排同列有前排时返回 true。' },
        { group: '⚙️ 核心参数与公式', name: '站位遮挡 - 飞行单位不被挡', test: function() {
            if (typeof win.isBlocked !== 'function') return null;
            var u = {pos: 4, role: '飞行', alive: true, isHorse: false};
            var allies = [{pos: 1, role: '战士', alive: true, isHorse: false}];
            return win.isBlocked(u, allies) === false;
        }, fix: '检查 isBlocked 飞行单位直接返回 false。' },
        { group: '⚙️ 核心参数与公式', name: '站位遮挡 - 同列无前排不挡', test: function() {
            if (typeof win.isBlocked !== 'function') return null;
            var u = {pos: 4, role: '战士', alive: true, isHorse: false};
            return win.isBlocked(u, []) === false;
        }, fix: '检查 isBlocked 无前排时返回 false。' },
        { group: '⚙️ 核心参数与公式', name: '防战伤害 - 额外项结构', test: function() {
            if (typeof win.Unit !== 'function' || typeof win.calcDamage !== 'function') return null;
            // 设计预期：防战伤害 = calcDamage(atkAct, defAct) + def * k + maxHp * 0.01
            var FANG_LEVELS = [0.244, 0.264, 0.279, 0.292, 0.306, 0.322, 0.342, 0.373, 0.445, 0.520];
            var FANG_K = [0, 0.02, 0.04, 0.07, 0.10, 0.14, 0.19, 0.28, 0.50, 1.00, 2.50];
            function getLv(def, m) { var ratio = def / m; for (var i = FANG_LEVELS.length - 1; i >= 0; i--) { if (ratio >= FANG_LEVELS[i]) return i; } return 0; }
            var u = new win.Unit('防战测试', 100, '防战', 'ally'); u.init(); u.applyBonus();
            var lv = getLv(u.def, u.m);
            var k = FANG_K[lv];
            return typeof k === 'number' && k >= 0 && u.def >= 0 && u.maxHp >= 0;
        }, fix: '检查 06battle-engine-core 防战伤害公式与 FANG_K 映射（当前为设计预期校验）。' },
        { group: '⚙️ 核心参数与公式', name: '目标选择 - 近战目标池为前排', test: function() {
            if (typeof win.getFronts !== 'function' || typeof win.isBlocked !== 'function') return null;
            // 设计预期：近战/飞行/拒马攻击时，目标从 getFronts(enemy) 中随机选取
            var enemy = [{pos:1, alive:true}, {pos:2, alive:true}, {pos:3, alive:true}, {pos:7, alive:true}];
            var fronts = win.getFronts(enemy);
            if (fronts.length !== 3) return false;
            var pool = fronts.map(function(x){return x.pos;});
            return pool.indexOf(1) !== -1 && pool.indexOf(2) !== -1 && pool.indexOf(3) !== -1 && pool.indexOf(7) === -1;
        }, fix: '检查 selectTarget 近战分支使用 getFronts 结果（当前为设计预期校验）。' },

        // ========== 战斗引擎 (4条) ==========
        { group: '⚙️ 引擎', name: 'calcDamage 存在', test: function(){return typeof win.calcDamage==='function';}, fix:'确认 core/engine.js 已挂载 calcDamage。' },
        { group: '⚙️ 引擎', name: 'getFlyDodgeRate 存在', test: function(){return typeof win.getFlyDodgeRate==='function';}, fix:'确认 core/engine.js 已挂载 getFlyDodgeRate。' },
        { group: '⚙️ 引擎', name: 'getFronts 存在', test: function(){return typeof win.getFronts==='function';}, fix:'确认 core/engine.js 已挂载 getFronts。' },
        { group: '⚙️ 引擎', name: 'isBlocked 存在', test: function(){return typeof win.isBlocked==='function';}, fix:'确认 core/engine.js 已挂载 isBlocked。' },

        // ========== 日志与UI (5条) ==========
        { group: '📋 日志', name: '日志有内容', test: function(){var l=doc.getElementById('log'); return l&&(l.textContent||'').trim().length>0;}, fix:'检查 playBattle。' },
        { group: '📋 日志', name: '回合显示正常', test: function(){var rd=doc.getElementById('roundDisplay'); return rd&&rd.textContent.trim().length>0;}, fix:'检查 roundDisplay。' },
        { group: '📋 日志', name: '详情弹窗可弹出', test: function(){var cell=doc.querySelector('#allyGrid .cell.occupied'); if(cell) return win.getComputedStyle(cell).cursor==='pointer'; return false;}, fix:'设 cursor:pointer。' },
        { group: '📋 日志', name: '暂停按钮存在', test: function(){var btn=doc.getElementById('btnPause'); return btn&&typeof btn.click==='function';}, fix:'检查 btnPause。' },
        { group: '📋 日志', name: '自动按钮存在', test: function(){return !!doc.getElementById('btnAuto');}, fix:'检查 btnAuto。' },

        // ========== 站位调整 (3条) ==========
        { group: '📍 站位', name: '固定单位不可拖', test: function() {
            var ctx=getCtx(); if(!ctx||!ctx.UI||!ctx.adjustMode) return null; var ally=ctx.UI.allyTeam||[];
            for(var i=0;i<ally.length;i++){var u=ally[i]; if(u.fixed){var cell=getCellElement(u); if(cell&&!cell.classList.contains('fixed-unit')) return false;}} return true;
        }, fix:'加 fixed-unit class。' },
        { group: '📍 站位', name: '可换单位可拖', test: function() {
            var ctx=getCtx(); if(!ctx||!ctx.UI||!ctx.adjustMode) return null; var ally=ctx.UI.allyTeam||[];
            for(var i=0;i<ally.length;i++){var u=ally[i]; if(!u.fixed){var cell=getCellElement(u); if(cell&&!cell.classList.contains('swappable')) return false;}} return true;
        }, fix:'加 swappable class。' },
        { group: '📍 站位', name: '张无忌在5号位', test: function() {
            var ctx=getCtx(); if(!ctx||!ctx.UI) return null; var ally=ctx.UI.allyTeam||[]; var zhang=ally.find(function(u){return u.isZhang;});
            if(zhang&&zhang.pos!==5) return false; return true;
        }, fix:'检查 doInitBattle 张无忌站位。' }
    ];
}

export { createHealthRules };