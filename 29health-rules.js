// 29health-rules.js - 光明顶 5v5 全身体检规则库 V3.1
// 预估字节数: 3000, 发送时间: 20260623 09:30, 版本: V3.1.0
// 联动: 被 test-runner.html 加载，可被游戏内调试面板调用
// 规则格式: { group: '分组名', name: '检测名', test: () => true/false/null, fix: '修复建议' }
// 新增规则只需在 HEALTH_RULES 数组中追加对象，无需改动任何其他文件

const HEALTH_RULES = [
    // ---- 启动与加载 ----
    { group: '🚀 启动与加载', name: '游戏上下文可获取', test: () => { const w = window._getPlayerContext || window.parent?._getPlayerContext; return !!w; }, fix: '检查 13main-5v5-test.js 是否正确初始化。' },
    { group: '🚀 启动与加载', name: '核心模块已挂载', test: () => { const w = window.parent || window; return typeof w.VER_CORE !== 'undefined' && typeof w.VER_PLAYER_CORE !== 'undefined' && typeof w.VER_UI !== 'undefined'; }, fix: '检查模块导入和 Live Server 加载。' },
    { group: '🚀 启动与加载', name: '错误捕获面板存在', test: () => { const doc = window.parent ? window.parent.document : document; return !!doc.getElementById('errorCapturePanel'); }, fix: '确认 24error-capture.js 已加载。' },
    { group: '🚀 启动与加载', name: '封面开始按钮可点击', test: () => { const doc = window.parent ? window.parent.document : document; const btn = doc.getElementById('coverStartBtn'); return btn && !btn.disabled; }, fix: '检查 mode-5v5-test.html 中按钮状态。' },

    // ---- UI 渲染 ----
    { group: '🎨 UI 渲染', name: '明教格子数量 = 5', test: () => { const w = window._getPlayerContext?.() || window.parent?._getPlayerContext?.(); if (!w?.UI?.allyTeam) return null; return w.UI.allyTeam.filter(u => u.pos >= 1 && u.pos <= 9).length === 5; }, fix: '检查 doInitBattle 明教生成和站位逻辑。' },
    { group: '🎨 UI 渲染', name: '六大派格子数量 = 5', test: () => { const w = window._getPlayerContext?.() || window.parent?._getPlayerContext?.(); if (!w?.UI?.enemyTeam) return null; return w.UI.enemyTeam.filter(u => u.pos >= 1 && u.pos <= 9).length === 5; }, fix: '检查 doInitBattle 六大派生成和站位逻辑。' },
    { group: '🎨 UI 渲染', name: '明教单位 pos 均合法', test: () => { const w = window._getPlayerContext?.() || window.parent?._getPlayerContext?.(); if (!w?.UI?.allyTeam) return null; return w.UI.allyTeam.every(u => u.pos >= 1 && u.pos <= 9); }, fix: '检查站位分配逻辑是否正常执行。' },
    { group: '🎨 UI 渲染', name: '六大派单位 pos 均合法', test: () => { const w = window._getPlayerContext?.() || window.parent?._getPlayerContext?.(); if (!w?.UI?.enemyTeam) return null; return w.UI.enemyTeam.every(u => u.pos >= 1 && u.pos <= 9); }, fix: '检查站位分配逻辑是否正常执行。' },
    { group: '🎨 UI 渲染', name: '暂停按钮存在且初始禁用', test: () => { const doc = window.parent ? window.parent.document : document; const btn = doc.getElementById('btnPause'); return btn && btn.disabled; }, fix: '检查按钮初始状态是否正确设置。' },
    { group: '🎨 UI 渲染', name: '下一回合按钮初始禁用', test: () => { const doc = window.parent ? window.parent.document : document; const btn = doc.getElementById('btnNext'); return btn && btn.disabled; }, fix: '检查按钮初始状态是否正确设置。' },
    { group: '🎨 UI 渲染', name: '自动/手动按钮存在', test: () => { const doc = window.parent ? window.parent.document : document; return !!doc.getElementById('btnAuto'); }, fix: '检查 HTML 中按钮 ID 是否匹配。' },
    { group: '🎨 UI 渲染', name: 'Buff 槽位存在两个', test: () => { const doc = window.parent ? window.parent.document : document; return !!doc.getElementById('buffSlot0') && !!doc.getElementById('buffSlot1'); }, fix: '检查 HTML 中槽位 ID 是否匹配。' },
    { group: '🎨 UI 渲染', name: '无残留蓝色/绿色格子', test: () => { const doc = window.parent ? window.parent.document : document; const cells = doc.querySelectorAll('#allyGrid .cell, #enemyGrid .cell'); const bad = []; cells.forEach(c => { const bg = c.style.background || ''; if (bg && (bg.includes('1e6bb8') || bg.includes('5a9e6f'))) bad.push(c.dataset.pos || '?'); }); return bad.length === 0; }, fix: '检查飞撞/闪避动画结束后的样式清理。' },
    { group: '🎨 UI 渲染', name: '日志区在战斗后应有内容', test: () => { const doc = window.parent ? window.parent.document : document; const logDiv = doc.getElementById('log'); if (!logDiv) return false; return (logDiv.textContent || '').trim().length > 0; }, fix: '检查 playBattle 是否正确启动。' },

    // ---- 核心功能 ----
    { group: '⚙️ 核心功能', name: '暂停/继续逻辑正常', test: () => { const w = window._getPlayerContext?.() || window.parent?._getPlayerContext?.(); if (!w) return null; const orig = w.isPaused; w.isPaused = !orig; const ok = w.isPaused !== orig; w.isPaused = orig; return ok; }, fix: '检查 13main 中 isPaused 的 getter/setter 逻辑。' },
    { group: '⚙️ 核心功能', name: '音效模块可访问', test: () => { const w = window.parent || window; return !!w.AudioManager; }, fix: '确认 28audio-manager.js 已加载并在 13main 中导入。' },
    { group: '⚙️ 核心功能', name: '防战合成音函数存在', test: () => { const w = window.parent || window; return typeof w.AudioManager?.playSfx === 'function'; }, fix: '检查 AudioManager 是否完整包含 playSfx 方法。' },
    { group: '⚙️ 核心功能', name: '海克斯选择函数存在', test: () => { const w = window.parent || window; return typeof w.showBuffSelection === 'function'; }, fix: '检查 13main 中 showBuffSelection 是否正确定义。' },
    { group: '⚙️ 核心功能', name: '战斗引擎可调用', test: () => { const w = window.parent || window; return typeof w.runBattle === 'function' || typeof w.VER_ENGINE !== 'undefined'; }, fix: '检查 07battle-engine-5v5-test.js 是否正确导出 runBattle。' },

    // ---- 数据一致性 ----
    { group: '🔗 数据一致性', name: '阵亡不修改 pos 字段', test: async () => { try { return !(await (await fetch('./06battle-engine-core.js')).text()).includes('u.pos = -1'); } catch (e) { return null; } }, fix: '删除 losers.forEach 中的 u.pos = -1。' },
    { group: '🔗 数据一致性', name: '玄冥神掌属性可 clone', test: async () => { try { return (await (await fetch('./02unit.js')).text()).includes('_xuanmingPoison'); } catch (e) { return null; } }, fix: '在 clone() 方法中增加 c._xuanmingPoison = ...' },
    { group: '🔗 数据一致性', name: '闪避反击日志含攻击者血量', test: async () => { try { const c = await (await fetch('./06battle-engine-core.js')).text(); return c.includes('血${Math.floor(unit.hp)}') && c.includes('isDodge'); } catch (e) { return null; } }, fix: '在 resolveDodge 的 combat-text 条目中补上攻击者血量显示。' },
    { group: '🔗 数据一致性', name: '严阵以待日志含反弹详情', test: async () => { try { return (await (await fetch('./04buff-system.js')).text()).includes('fortify_rebound'); } catch (e) { return null; } }, fix: '确认 04buff-system.js 中 fortify 反弹日志正确输出。' },
    { group: '🔗 数据一致性', name: 'Carry 日志引用完整队友列表', test: async () => { try { return (await (await fetch('./04buff-system.js')).text()).includes('window._currentBattleState'); } catch (e) { return null; } }, fix: '在 logBuffSummary 中使用 window._currentBattleState?.ally 获取完整队友列表。' },
    { group: '🔗 数据一致性', name: '休息回血后 UI 实时更新', test: async () => { try { return (await (await fetch('./10player-core.js')).text()).includes('if(blockDelay) await new Promise(r=>setTimeout(r, c.speed/2));\nc.updateUI(c.UI);'); } catch (e) { return null; } }, fix: '在 10player-core.js 中休息回血后立即调用 c.updateUI(c.UI)。' }
];

// 支持多种执行环境：游戏内直接测，独立页面通过 iframe 测
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HEALTH_RULES };
}