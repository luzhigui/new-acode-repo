// tests/46health-utils.js - 光明顶5v5 体检公共检查函数库
// V5.0.2 | 新增攻击特效检测、Buff图标检测、报告定位辅助
export const VER = 'tests/46health-utils.js V5.0.2';

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
 * [核心] UI层死亡特效检查
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

        // 2. 引擎里活着，但格子有死亡特效残留
        if (u.alive && (hasDeadFlash || hasDeadMark)) {
            issues.push(u.name + ' UI异常：alive=true，但格子上残留死亡特效');
        }

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
 * @param {object} ctx - 播放器上下文
 * @param {Document} doc
 * @returns {string[]}
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

        const isFlyMode = u._flyMode === 'fly';
        const isGhostMode = u._flyMode === 'ghost';

        if (isFlyMode) {
            // 飞走模式：原格子应完全清空（opacity=0 或 display=none）
            const opacity = parseFloat(cell.style.opacity);
            if (opacity > 0.1) {
                issues.push(u.name + ' 飞走模式下原格子未清空，opacity=' + opacity);
            }
        } else if (isGhostMode) {
            // 虚影模式：原格子应有半透明蓝色虚影
            const opacity = parseFloat(cell.style.opacity);
            const bg = cell.style.background || '';
            if (opacity > 0.6 || opacity < 0.2) {
                issues.push(u.name + ' 虚影模式下透明度异常：' + opacity + '（预期0.3-0.55）');
            }
            if (bg.indexOf('rgba') === -1 && bg.indexOf('blue') === -1 && bg.indexOf('30,100') === -1) {
                issues.push(u.name + ' 虚影模式下原格子缺少蓝色半透明背景');
            }
        }

        // 攻击闪光持续时间检测（蓝色attack/黄色defend）
        if (cell.getAttribute('data-flash') === 'attack' || cell.getAttribute('data-flash') === 'defend') {
            // 闪光正常应在0.3-1.5秒内结束，如果持续超过3秒视为异常
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
 * @param {object} ctx - 播放器上下文
 * @param {Document} doc
 * @returns {string[]}
 */
export function checkBuffIcons(ctx, doc) {
    const issues = [];
    const allyTeam = (ctx.UI && ctx.UI.allyTeam) || [];
    const activeBuffs = ctx.activeBuffs || [];
    const doubleStrikeUid = ctx.currentDoubleStrikeUid;

    // Buff key 到图标的映射（与 renderGrid 中的逻辑一致）
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

    // Buff key 的生效条件判定（与 isUnitBenefitedByBuff 逻辑一致）
    function isBenefited(unit, buffKey) {
        switch (buffKey) {
            case 'carry': return unit.pos === 5 && unit.alive;
            case 'meteorShower': return unit.role === '远程';
            case 'bloodthirst': return unit.role === '战士';
            case 'fortify': return unit.role === '防战';
            case 'windAssault': return unit.role === '飞行';
            case 'cloudBody': return true;
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
            if (isBenefited(unit, buff.key)) {
                if (nameText.indexOf(icon) === -1) {
                    issues.push(unit.name + ' 有' + buff.name + 'Buff，但格子上缺少图标 ' + icon);
                }
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
 * [新增] 为体检规则提供日志上下文定位
 * @param {object[]} log - 战斗日志数组
 * @param {object} entry - 当前日志条目
 * @returns {string} 类似 "(第3回合, 第12条日志, 殷天正→静虚)"
 */
export function locateLogEntry(log, entry) {
    const idx = log.indexOf(entry);
    if (idx === -1) return '';
    // 往前找最近的回合开始
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