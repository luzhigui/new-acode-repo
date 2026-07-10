// tests/46health-utils.js - 光明顶5v5 体检公共检查函数库
// V5.0.2 | ~4000 bytes | 提取血量/血条/死亡标记/人数/弹幕/特效残留等公共检查
export const VER = 'tests/46health-utils.js V5.0.2';

/**
 * 获取单位对应的格子 DOM 元素
 * @param {object} unit - 单位对象（需包含 camp, pos）
 * @param {Document} doc - iframe 或主文档的 document
 * @returns {Element|null}
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
 * @param {object} unit - 单位对象（需包含 name, hp, maxHp, _baseMaxHp）
 * @returns {string[]} 错误描述数组，为空表示通过
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
 * 检查死亡标记 _isDead 是否同步
 * @param {object} unit - 单位对象（需包含 name, alive, _isDead）
 * @returns {string[]} 错误描述数组，为空表示通过
 */
export function checkDeathMark(unit) {
    const issues = [];
    if (!unit.alive && !unit._isDead) {
        issues.push(unit.name + '已阵亡但 _isDead 未标记');
    }
    return issues;
}

/**
 * 检查血条高度与引擎 hp/maxHp 是否同步
 * @param {object} unit - 单位对象（需包含 name, hp, maxHp, alive）
 * @param {Document} doc
 * @returns {string[]} 错误描述数组，为空表示通过
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
    if (Math.abs(actualPct - expectedPct) > 3) {
        issues.push(unit.name + '血条高度异常：当前' + actualPct + '%, 预期' + expectedPct + '%');
    }
    return issues;
}

/**
 * 检查血条颜色是否匹配血量百分比
 * @param {object} unit - 单位对象（需包含 name, hp, maxHp, alive）
 * @param {Window} win - iframe 或主窗口
 * @param {Document} doc
 * @returns {string[]} 错误描述数组，为空表示通过
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
 * 检查双方人数是否正确（第5关敌方应为6人）
 * @param {object[]} allyTeam
 * @param {object[]} enemyTeam
 * @param {number} stage - 当前关卡
 * @returns {string[]} 错误描述数组，为空表示通过
 */
export function checkTeamSize(allyTeam, enemyTeam, stage) {
    const issues = [];
    if (allyTeam.length < 5) issues.push('我方人数为' + allyTeam.length + '，预期5');
    const expectedEnemy = (stage === 5) ? 6 : 5;
    if (enemyTeam.length < expectedEnemy) {
        issues.push('第' + stage + '关敌方人数为' + enemyTeam.length + '，预期' + expectedEnemy);
    }
    return issues;
}

/**
 * 检查胜利弹幕是否存在
 * @param {Document} doc
 * @param {object[]} allyTeam
 * @param {object[]} enemyTeam
 * @returns {string[]} 错误描述数组，为空表示通过
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
 * 检查特效残留元素数量
 * @param {Document} doc
 * @returns {string[]} 错误描述数组，为空表示通过
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
 * 检查死亡特效是否正确保留 3s 并在之后正确消失
 * @param {object[]} allUnits - 所有单位
 * @param {Document} doc
 * @returns {string[]} 错误描述数组
 */
export function checkDeathFxRetention(allUnits, doc) {
    const issues = [];
    const now = Date.now();

    for (const u of allUnits) {
        // 1. 引擎层：应该死了但还活着（hp<=0 但 alive=true）
        if (u.alive && u.hp <= 0) {
            issues.push(u.name + '引擎异常：hp=' + Math.floor(u.hp) + '（≤0）但 alive=true，应为阵亡');
        }

        // 2. 引擎层：活着但 _isDead 标记残留
        if (u.alive && u._isDead) {
            issues.push(u.name + '引擎异常：alive=true 但 _isDead=true，死亡标记未清除');
        }

        // 3. UI 层：死亡超过 3 秒，格子上还有残留
        if (!u.alive && u._deathTime && (now - u._deathTime > 3500)) {
            const cell = getCellElement(u, doc);
            if (cell) {
                const deadMark = cell.querySelector('.dead-mark');
                const hasDeadFlash = cell.getAttribute('data-flash') === 'dead';
                if (deadMark || hasDeadFlash) {
                    issues.push(u.name + '死亡超3秒但死亡特效未清除' +
                        (deadMark ? '（dead-mark残留）' : '') +
                        (hasDeadFlash ? '（data-flash=dead残留）' : ''));
                }
            }
        }

        // 4. UI 层：已死亡但格子还在且血量不为 0
        if (!u.alive && u.hp > 0 && u.hp < u.maxHp * 0.1) {
            const cell = getCellElement(u, doc);
            if (cell) {
                const bar = cell.querySelector('.hp-bar-inner');
                if (bar) {
                    const barPct = parseFloat(bar.style.height);
                    if (barPct > 0) {
                        issues.push(u.name + '已阵亡但血条残留：hp=' + Math.floor(u.hp) +
                            '，血条高度=' + barPct + '%');
                    }
                }
            }
        }
    }
    return issues;
}