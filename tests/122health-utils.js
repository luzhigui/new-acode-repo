﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// tests/122health-utils.js - 光明顶5v5 体检公共检查函数库
// V5.6.0 | 新增战报黑幕/随机重开状态/特效DOM池实时检查（对应已报Bug：战报需关两次/随机重开跳关/弹幕多局卡顿）
export const VER = 'tests/122health-utils.js V5.6.0';

/**
 * 获取单位对应的格子 DOM 元素
 */
export function getCellElement(unit, doc) {
    if (!unit || unit.pos == null) return null;
    const gridId = unit.camp === 'ally' ? 'allyGrid' : 'enemyGrid';
    const grid = doc.getElementById(gridId);
    if (!grid) return null;
    const order = unit.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
    const idx = order.indexOf(unit.pos);
    return idx >= 0 ? grid.children[idx] : null;
}

/**
 * 检查单位血量合法性（负数、溢出、膨胀）
 */
export function checkUnitHpValidity(unit) {
    const issues = [];
    if (unit.hp < 0) issues.push(unit.name + '血量负数：' + Math.floor(unit.hp));
    if (unit.maxHp > 0 && unit.hp > unit.maxHp) {
        issues.push(unit.name + '血量溢出：' + Math.floor(unit.hp) + '/' + Math.floor(unit.maxHp));
    }
    if (unit._baseMaxHp && unit._baseMaxHp > 0 && unit.maxHp > unit._baseMaxHp * 2.5) {
        issues.push(unit.name + '血量异常膨胀：maxHp=' + Math.floor(unit.maxHp) +
            '，初始=' + Math.floor(unit._baseMaxHp) + '，膨胀' + Math.floor(unit.maxHp / unit._baseMaxHp * 100) + '%');
    }
    return issues;
}

/**
 * 检查血条高度与引擎 hp/maxHp 是否同步
 */
export function checkHpBarSync(unit, doc) {
    const issues = [];
    if (!unit.alive || !unit.maxHp) return issues;
    const cell = getCellElement(unit, doc);
    if (!cell) return issues;
    const bar = cell.querySelector('.hp-bar-inner');
    if (!bar) return issues;
    const actualPct = parseFloat(bar.style.height);
    const expectedPct = Math.floor((unit.hp / unit.maxHp) * 100);
    if (Math.abs(actualPct - expectedPct) > 5) {
        issues.push(unit.name + '血条高度异常：当前' + actualPct + '%, 预期' + expectedPct + '%');
    }
    return issues;
}

/**
 * 检查血条颜色是否匹配血量百分比
 */
export function checkHpBarColor(unit, win, doc) {
    const issues = [];
    if (!unit.alive || !unit.maxHp) return issues;
    const cell = getCellElement(unit, doc);
    if (!cell) return issues;
    const bar = cell.querySelector('.hp-bar-inner');
    if (!bar) return issues;
    try {
        const barColor = win.getComputedStyle(bar).backgroundColor;
        const hpPct = unit.hp / unit.maxHp;
        const expColor = hpPct > 0.7 ? 'rgb(76, 175, 80)' : (hpPct > 0.4 ? 'rgb(255, 152, 0)' : 'rgb(244, 67, 54)');
        if (barColor && barColor !== expColor) {
            issues.push(unit.name + '血条颜色异常：当前' + barColor + ', 预期' + expColor);
        }
    } catch (e) {}
    return issues;
}

/**
 * 检查特效残留元素数量
 */
export function checkFxOrphans(doc) {
    const issues = [];
    const orphans = doc.querySelectorAll('[data-fx="temporary"]');
    if (orphans.length > 5) {
        issues.push('战斗结束后' + orphans.length + '个特效未清理');
    }
    return issues;
}

/**
 * [核心] UI层死亡特效检查：
 * 1. 应死未死：血量已清零，但格子上没有死亡特效
 * 2. 诈尸还魂：alive=true，但格子上却有死亡特效残留
 * 3. 阴魂不散：单位已阵亡超过4秒，死亡特效还未正确清除
 * 4. 血条残留：单位已阵亡，但血条高度不为0
 */
export function checkDeathFxRetention(allUnits, doc) {
    const issues = [];
    const now = Date.now();

    for (const u of allUnits) {
        const cell = getCellElement(u, doc);
        const hasDeadFlash = cell && cell.getAttribute('data-flash') === 'dead';
        const hasDeadMark = cell && cell.querySelector('.dead-mark');

        // 1. 血量清零，但格子没任何死亡特效
        if (u.hp <= 0 && u.alive === false && cell && !hasDeadFlash && !hasDeadMark) {
            if (u._deathTime && (now - u._deathTime) > 1000) {
                issues.push(u.name + ' UI异常：hp=' + Math.floor(u.hp) + ' alive=false，但格子上没有死亡特效');
            }
        }

        // 2. 格子已渲染死亡 → 说明 UI 是正确的，引擎状态可能未同步，不报
        // 只有当 alive=true 且 _deathTime 超过 4 秒但格子依然活着没有死亡标记时，才说明死亡特效缺失

        // 3. 死亡特效赖场超过4秒
        if (!u.alive && u._deathTime && (now - u._deathTime > 4000)) {
            if (cell && (hasDeadFlash || hasDeadMark)) {
                issues.push(u.name + ' UI异常：死亡超过4秒但死亡特效未清除');
            }
        }

        // 4. 已阵亡但血条不为0
        if (!u.alive && u.hp <= 0 && cell) {
            const bar = cell.querySelector('.hp-bar-inner');
            if (bar) {
                const barPct = parseFloat(bar.style.height);
                if (barPct > 0) {
                    issues.push(u.name + ' UI异常：已阵亡但血条残留，高度=' + barPct + '%');
                }
            }
        }
    }
    return issues;
}

/**
 * [新增] 近战攻击特效检测：飞走/虚影模式下原格子状态
 * 检查近战单位发起攻击后，原位置的视觉残留是否符合预期
 */
export function checkMeleeFxState(ctx, doc) {
    const issues = [];
    const allyTeam = (ctx.UI && ctx.UI.allyTeam) || [];
    const enemyTeam = (ctx.UI && ctx.UI.enemyTeam) || [];
    const allUnits = allyTeam.concat(enemyTeam);

    for (const u of allUnits) {
        if (!u.alive || u.isHorse) continue;
        if (u.role !== '战士' && u.role !== '防战' && u.role !== '飞行') continue;

        const cell = getCellElement(u, doc);
        if (!cell) continue;

        const isFlyMode = u.state._flyMode === 'fly';
        const isGhostMode = u.state._flyMode === 'ghost';

        if (isFlyMode) {
            const opacity = parseFloat(cell.style.opacity);
            if (opacity > 0.1) {
                issues.push(u.name + ' 飞走模式下原格子未清空，opacity=' + opacity);
            }
        } else if (isGhostMode) {
            const opacity = parseFloat(cell.style.opacity);
            const bg = cell.style.background || '';
            if (opacity > 0.6 || opacity < 0.2) {
                issues.push(u.name + ' 虚影模式下透明度异常：' + opacity + '（预期0.3-0.55）');
            }
            if (bg.indexOf('rgba') === -1 && bg.indexOf('blue') === -1 && bg.indexOf('30,100') === -1) {
                issues.push(u.name + ' 虚影模式下原格子缺少蓝色半透明背景');
            }
        }

        // 攻击闪光持续时间检测
        if (cell.getAttribute('data-flash') === 'attack' || cell.getAttribute('data-flash') === 'defend') {
            if (cell._flashStartTime && Date.now() - cell._flashStartTime > 3000) {
                issues.push(u.name + ' 攻击/防御闪光持续超过3秒未消失');
            }
        }
    }
    return issues;
}

/**
 * [新增] 海克斯Buff图标检测
 * 检查有Buff生效的单位，格子上是否正确显示了对应的图标
 * 渲染时序容错：图标缺失需持续超过 ICON_BUFFER_MS 才上报，避免 Buff 刚生效、
 * 格子尚未重绘时误报。
 */
const ICON_BUFFER_MS = 1000;
const _missingBuffIconSince = {};
export function checkBuffIcons(ctx, doc) {
    const issues = [];
    const allyTeam = (ctx.UI && ctx.UI.allyTeam) || [];
    const activeBuffs = ctx.activeBuffs || [];
    const doubleStrikeUid = ctx.currentDoubleStrikeUid;

    const BUFF_ICONS = {
        'doubleStrike': '⚡',
        'carry': '👑',
        'cloudBody': '💨',
        'horseFormation': '🐴',
        'meteorShower': '☄️',
        'bloodthirst': '🗡️',
        'fortify': '🛡️',
        'windAssault': '🦅',
        'holyFlame': '🔥',
        'hotBlood': '❤️',
        'mindControl': '🌀'
    };

    function isBenefited(unit, buffKey) {
        switch (buffKey) {
            case 'carry': {
                // 从格子 DOM 读取实际站位，避免换位后 pos 不一致
                const cell = getCellElement(unit, doc);
                const actualPos = cell ? parseInt(cell.dataset.pos) : unit.pos;
                return actualPos === 5 && unit.alive;
            }
            case 'meteorShower': return unit.role === '远程';
            case 'bloodthirst': return unit.role === '战士';
            case 'fortify': return unit.role === '防战';
            case 'windAssault': return unit.role === '飞行';
            case 'cloudBody': return true;
        case 'holyFlame': {
            if (!activeBuffs) return false;
            const holyBuffs = activeBuffs.filter(b => b.key === 'holyFlame');
            return holyBuffs.some(b => {
                const cols = b.cols || (b.col != null ? [b.col] : []);
                const rows = b.rows || (b.row != null ? [b.row] : []);
                return cols.includes(getUnitCol(unit.pos)) || rows.includes(getUnitRow(unit.pos));
            });
        }
            case 'hotBlood': return true;
            case 'holyFlame': {
                const holyBuff = activeBuffs.find(b => b.key === 'holyFlame');
                if (!holyBuff || holyBuff.col == null || holyBuff.row == null) return false;
                const unitCol = (unit.pos - 1) % 3 + 1;
                const unitRow = Math.ceil(unit.pos / 3);
                return unitCol === holyBuff.col || unitRow === holyBuff.row;
            }
            case 'doubleStrike': return unit.uid === doubleStrikeUid;
            case 'horseFormation': return false;
            case 'mindControl': {
                const frontUnit = allyTeam.filter(u => u.alive && !u.isHorse).sort((a, b) => a.pos - b.pos)[0];
                return frontUnit && unit.uid === frontUnit.uid;
            }
            default: return false;
        }
    }

    for (const unit of allyTeam) {
        if (!unit.alive) continue;
        const cell = getCellElement(unit, doc);
        if (!cell) continue;
        const nameEl = cell.querySelector('.cell-name');
        if (!nameEl) continue;
        const nameText = nameEl.textContent || '';

        for (const buff of activeBuffs) {
            const icon = BUFF_ICONS[buff.key];
            if (!icon) continue;
            if (!isBenefited(unit, buff.key)) continue;
            const missKey = unit.uid + '|' + buff.key;
            if (nameText.indexOf(icon) === -1) {
                // 图标缺失：记录首次缺失时间，持续超过缓冲(给渲染留时间)才上报，避免渲染时序误报
                if (!_missingBuffIconSince[missKey]) {
                    _missingBuffIconSince[missKey] = Date.now();
                } else if (Date.now() - _missingBuffIconSince[missKey] > ICON_BUFFER_MS) {
                    issues.push(unit.name + ' 有' + buff.name + 'Buff，但格子上缺少图标 ' + icon +
                        '（持续' + Math.round((Date.now() - _missingBuffIconSince[missKey]) / 1000) + '秒）');
                    delete _missingBuffIconSince[missKey];
                }
            } else {
                delete _missingBuffIconSince[missKey];
            }
        }
    }
    return issues;
}

/**
 * 检查胜利弹幕是否存在
 */
export function checkVictoryDanmaku(doc, allyTeam, enemyTeam) {
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

/**
 * [新增] 底部控制按钮状态检查 — 随游戏状态机(IDLE/RUNNING/PAUSED/GAMEOVER)校验按钮的启用/禁用与文本
 * 主按钮 btnMain 的 4 种状态：IDLE+adjustMode="开始(投票)"、IDLE+非adjustMode="调整站位"、
 * 战斗中禁用(变灰无作用)、GAMEOVER="下一关/重新开始"。
 * 下一回合 btnNext：IDLE 禁用、GAMEOVER="原班再战"、自动模式战斗中禁用。
 * 结算 btnSettle：IDLE 禁用"快进到底"、RUNNING/PAUSED 启用"快进到底"、GAMEOVER 启用"随机重开"。
 * 暂停 btnPause：RUNNING="暂停"、PAUSED="继续"(高亮)、IDLE/GAMEOVER 禁用。
 */
export function checkBottomButtonStates(ctx, doc) {
    const issues = [];
    if (!doc || !ctx) return issues;
    const win = doc.defaultView || null;
    const gs = ctx.gs;
    const btnMain = doc.getElementById('btnMain');
    const btnNext = doc.getElementById('btnNext');
    const btnSettle = doc.getElementById('btnSettle');
    const btnPause = doc.getElementById('btnPause');
    const txt = (el) => el ? (el.textContent || '').replace(/\s+/g, '') : '';
    const stage = ctx.currentStage || 0;
    const adjustMode = !!ctx.adjustMode;
    const autoMode = !!ctx.autoMode;
    const bulletTime = !!(win && win.GlobalStore && win.GlobalStore.get('bulletTimeActive'));

    function expectDisabled(el, name, want) {
        if (!el) return;
        const isD = !!el.disabled;
        if (isD !== want) issues.push(name + '按钮 disabled 异常：当前' + (isD ? '禁用(灰)' : '启用') + '，预期' + (want ? '禁用(灰)' : '启用'));
    }
    function expectText(el, name, keyword, not) {
        if (!el) return;
        const t = txt(el);
        const has = t.indexOf(keyword) !== -1;
        if (not ? has : !has) issues.push(name + '按钮文本异常：当前"' + t + '"，' + (not ? '不应含"' + keyword + '"' : '应含"' + keyword + '"'));
    }

    if (gs === 'IDLE') {
        // 主按钮：adjustMode 时显示"开始(投票)"，否则"调整站位"，均可点击
        expectDisabled(btnMain, '主按钮', false);
        expectText(btnMain, '主按钮', adjustMode ? '开始' : '调整');
        expectDisabled(btnNext, '下一回合', true);
        expectDisabled(btnSettle, '结算', true);
        expectText(btnSettle, '结算', '快进到底');
        expectDisabled(btnPause, '暂停', true);
    } else if (gs === 'RUNNING') {
        expectDisabled(btnMain, '主按钮', true);
        expectDisabled(btnSettle, '结算', false);
        expectText(btnSettle, '结算', '快进到底');
        if (!bulletTime) {
            expectDisabled(btnPause, '暂停', false);
            expectText(btnPause, '暂停', '暂停');
        }
        if (autoMode) expectDisabled(btnNext, '下一回合', true);
    } else if (gs === 'PAUSED') {
        expectDisabled(btnMain, '主按钮', true);
        expectDisabled(btnSettle, '结算', false);
        expectText(btnSettle, '结算', '快进到底');
        expectDisabled(btnPause, '暂停', false);
        expectText(btnPause, '暂停', '继续');
        if (btnPause && !btnPause.classList.contains('active')) issues.push('暂停按钮在PAUSED状态应高亮(active)');
    } else if (gs === 'GAMEOVER') {
        expectDisabled(btnMain, '主按钮', false);
        expectText(btnMain, '主按钮', stage >= 6 ? '重新' : '下一关');
        expectDisabled(btnNext, '下一回合', false);
        expectText(btnNext, '下一回合', '原班再战');
        expectDisabled(btnSettle, '结算', false);
        expectText(btnSettle, '结算', '随机重开');
        expectDisabled(btnPause, '暂停', true);
        if (btnPause && btnPause.classList.contains('active')) issues.push('暂停按钮在GAMEOVER状态不应高亮');
    }
    return issues;
}

/**
 * [新增] 模式按钮状态检查 — 校验顶部/底部那排切换按钮是否符合当前模式
 * 华丽/简单、详细、自动/全自动、调试、虚影/飞走
 */
export function checkModeButtonStates(ctx, doc) {
    const issues = [];
    if (!doc || !ctx) return issues;
    const win = doc.defaultView || null;
    const gs = win && win.GlobalStore;

    const dodgeBtn = doc.getElementById('btnDodgeToggle');
    if (dodgeBtn) {
        const wantActive = !!ctx.dodgeEffectEnabled;
        const isActive = dodgeBtn.classList.contains('active');
        const wantText = wantActive ? '华丽' : '简单';
        const t = (dodgeBtn.textContent || '').trim();
        if (isActive !== wantActive) issues.push('华丽/简单按钮状态异常：active=' + isActive + '，预期=' + wantActive);
        if (t !== wantText) issues.push('华丽/简单按钮文本异常：当前"' + t + '"，预期"' + wantText + '"');
    }

    const detailBtn = doc.getElementById('btnDetail');
    if (detailBtn) {
        const wantActive = (ctx.logLevel !== 'brief');
        const isActive = detailBtn.classList.contains('active');
        if (isActive !== wantActive) issues.push('详细按钮状态异常：active=' + isActive + '，预期=' + wantActive + '（logLevel=' + ctx.logLevel + '）');
    }

    const autoBtn = doc.getElementById('btnAuto');
    if (autoBtn) {
        const lvl = ctx.autoLevel;
        const expectMap = { manual: ['手动', false], auto: ['自动', true], 'full-auto': ['全自动', true] };
        const want = expectMap[lvl] || ['自动', true];
        const t = (autoBtn.textContent || '').trim();
        const isActive = autoBtn.classList.contains('active');
        if (isActive !== want[1]) issues.push('自动按钮状态异常：active=' + isActive + '，预期=' + want[1] + '（模式=' + lvl + '）');
        if (t !== want[0]) issues.push('自动按钮文本异常：当前"' + t + '"，预期"' + want[0] + '"（模式=' + lvl + '）');
    }

    const debugBtn = doc.getElementById('debugToggle');
    if (debugBtn && gs) {
        const wantActive = !!gs.get('debugMode');
        const isActive = debugBtn.classList.contains('active');
        if (isActive !== wantActive) issues.push('调试按钮状态异常：active=' + isActive + '，预期=' + wantActive);
    }

    const crashBtn = doc.getElementById('btnCrashMode');
    if (crashBtn && gs) {
        const mode = gs.get('crashMode');
        const wantText = mode === 'fly' ? '🕊️飞走' : '👻虚影';
        const t = (crashBtn.textContent || '').trim();
        if (t !== wantText) issues.push('虚影按钮文本异常：当前"' + t + '"，预期"' + wantText + '"');
    }
    return issues;
}

/**
 * [新增] 战报黑幕检查 — 战报"关闭"后黑幕应真正消失
 * 复发信号：battleReportOverlay 重复创建（getElementById 只取第一个，关闭一次只藏一个→需关两次）/
 *          已最小化（浮动按钮在）但仍有可见黑幕 / 新局开始后黑幕残留（resetBattleRuntime 未清理）
 * 对应已报 Bug：战报需要关闭俩次，首次黑幕，第二次真的关掉
 */
export function checkBattleReportOverlay(ctx, doc) {
    const issues = [];
    if (!doc) return issues;
    const overlays = doc.querySelectorAll('#battleReportOverlay');
    if (overlays.length > 1) {
        issues.push('战报弹窗重复创建' + overlays.length + '个（关闭一次仅隐藏一个→黑幕需关两次）');
    }
    const floatBtn = doc.getElementById('battleReportFloat');
    if (floatBtn) {
        for (const ov of overlays) {
            if (ov.style.display !== 'none' && ov.parentNode) {
                issues.push('战报已关闭（浮动按钮存在）但黑幕仍显示（关闭未真正生效）');
                break;
            }
        }
    }
    const gs = ctx ? ctx.gs : '';
    if (gs === 'RUNNING' || gs === 'PAUSED' || gs === 'IDLE') {
        for (const ov of overlays) {
            if (ov.style.display !== 'none' && ov.parentNode) {
                issues.push('战斗已重新开始但战报黑幕残留（重置未清理战报弹窗）');
                break;
            }
        }
    }
    return issues;
}

/**
 * [新增] 随机重开状态复位检查 —
 * 随机重开（btnSettle GAMEOVER 分支）调用 doInitBattle 重新生成阵容，但不复位 gs：
 * 新局已生成（currentResult=null/round=0/全员存活）时 gs 仍为 GAMEOVER，
 * 主按钮显示"下一关"，点击将跳关而非开始重开的新局。
 * 对照：原班再战（btnNext）正确 setState.gs('IDLE')。
 * 对应已报 Bug：随机重开后点击左边按钮成了下一关
 */
export function checkRandomRestartState(ctx, doc) {
    const issues = [];
    if (!doc || !ctx || !ctx.UI) return issues;
    const UI = ctx.UI;
    const freshBattle = UI.currentResult === null && (!UI.round || UI.round === 0) &&
        Array.isArray(UI.allyTeam) && UI.allyTeam.length > 0 && UI.allyTeam.every(u => u && u.alive);
    if (freshBattle && ctx.gs === 'GAMEOVER') {
        const btnMain = doc.getElementById('btnMain');
        const t = btnMain ? (btnMain.textContent || '').replace(/\s+/g, '') : '';
        issues.push('随机重开后状态未复位：新局已生成但gs=GAMEOVER' +
            (t.indexOf('下一关') !== -1 ? '，主按钮显示"下一关"（点击将跳关）' : ''));
    }
    return issues;
}

/**
 * [新增] 特效DOM/弹幕池检查 — 对象池容量泄漏与池失效
 * 池容量（fx/80fx-common-5v5-test.js POOL_SIZES）：danmaku 8 / dmgFloat 6 / dodge 4 / healFloat+atkBuffFloat 8（共用 heal-float 类）
 * 复发信号：元素数超池容量（泄漏累积→多局后弹幕卡顿）/
 *          RUNNING 中弹幕DOM为0（ui/69reset-runtime.js 重置时移除弹幕DOM，但对象池仍持有游离引用→弹幕永久失效）
 * 对应已报 Bug：多打几局，弹幕特别卡
 */
export function checkFxDomAccumulation(ctx, doc) {
    const issues = [];
    if (!doc) return issues;
    const danmaku = doc.querySelectorAll('.danmaku-bubble').length;
    const dmgFloat = doc.querySelectorAll('.dmg-float').length;
    const dodgeBubble = doc.querySelectorAll('.dodge-bubble').length;
    const healFloat = doc.querySelectorAll('.heal-float').length;
    if (danmaku > 8) issues.push('弹幕元素' + danmaku + '个超池容量8（对象池泄漏，多局后卡顿）');
    if (dmgFloat > 6) issues.push('伤害飘字' + dmgFloat + '个超池容量6（对象池泄漏）');
    if (dodgeBubble > 4) issues.push('闪避气泡' + dodgeBubble + '个超池容量4（对象池泄漏）');
    if (healFloat > 8) issues.push('治疗/加攻飘字' + healFloat + '个超池容量8（对象池泄漏）');
    const total = danmaku + dmgFloat + dodgeBubble + healFloat;
    if (total > 30) issues.push('特效DOM总量' + total + '个异常累积（弹幕卡顿来源）');
    if (ctx && ctx.gs === 'RUNNING' && danmaku === 0) {
        issues.push('战斗进行中弹幕DOM为0（重置摧毁弹幕池：DOM被移除但对象池仍持有游离引用，弹幕已失效）');
    }
    return issues;
}

/**
 * [新增] 为体检规则提供日志上下文定位
 * @returns {string} 类似 "(第3回合, 第12条日志, 殷天正→静虚)"
 */
export function locateLogEntry(log, entry) {
    const idx = log.indexOf(entry);
    if (idx === -1) return '';
    let round = '?';
    for (let i = idx; i >= 0; i--) {
        const e = log[i];
        if (e.type === 'round-start') {
            const m = (e.text || '').match(/第(\d+)回合/);
            if (m) { round = m[1]; break; }
        }
    }
    let who = '';
    if (entry._atkName && entry._defName) {
        who = entry._atkName + '→' + entry._defName;
    } else if (entry._atkName) {
        who = entry._atkName + '攻击';
    } else if (entry.horseUid) {
        who = '拒马(' + entry.horsePos + '号位)';
    }
    return '(第' + round + '回合, 第' + (idx + 1) + '条日志' + (who ? ', ' + who : '') + ')';
}