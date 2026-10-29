// V6.1.16 | ~29000 bytes | 2026-09-26 新增 checkActionRights（行动权不变量·回合级）：_acted=true 的活人本回合必须有正常位行动记录，抓「吞回合」（灭绝反击 bug 通用形态）；121/回放共用此唯一实现（合并移植：本条与远端并线第 24-49 轮共存）
// V6.1.15 | ~26700 bytes | 2026-09-25 不变量单一真值源：checkUnitHpValidity 定为血量类不变量的**唯一**实现，
import { BUFF_TYPES, CAMP_TYPES, ROLE_TYPES, FACT_TYPES } from '../infra/56-battle-enums.js';
import { getUnitCol, getUnitRow } from '../infra/51-core-utils.js';
// V6.7.2 | 2026-10-29 第 135 轮 checkBuffIcons 截断豁免改镜像渲染预算模型：格子 logo 预算 = 2 -（胶囊占 1），
//          logoList 含 🔔/eliteSkillIcon/buff 图标/🎯☯🔻❌ 状态标记，超预算尾部优先截断 → buff 图标被挤出
//          是设计行为（render/32 L328-356，何太冲标记压尾即老板拍板）。旧豁免只数受益 Buff 图标
//          （>2 且名≥4字），没算其他占位 → 10-29 实测 5 条误报（流云💨×4、圣火🔥×1，张无忌 1/3 胶囊占位最典型）。
//          新豁免：缺图标且格子预算已满（DOM emoji 数 + 胶囊占位 ≥ 2）→ 放过；格子未满仍缺 → 照常上报。
// V6.7.3 | 2026-10-29 第 135 轮续：死亡血条残留 + GAMEOVER 主按钮禁用两处误报修复（均不削弱真实缺陷捕获）。
//          - checkDeathFxRetention #4：死者血条走 updateHpDisplay→tickHpAnim 平滑回落到 0（render/32 L222 死者目标 hpPct=0），
//            动画约 0.7s；原判据见 barPct>0 即报，会把动画途中一帧（如 61.4125% = 72.25−0.15×72.25）误判为"残留"。
//            改为追踪连续两次取样高度：仍下降=动画中跳过，不再下降且 >0=真·卡死才报。
//          - checkBottomButtonStates GAMEOVER：auto 模式 GAMEOVER 后自动点击推进，点击→下一局开战之间 btnMain
//            处于 RUNNING 禁用态而 gs 滞后为 GAMEOVER，形成瞬时禁用窗口（finishBattle 已同步 enableAllButtons）。
//            加 GAMEOVER 稳定计时 >1200ms 才判主按钮禁用，跳过切换途中误报；真·卡死仍捕获。
// V6.7.4（续迭代）：checkHpBarSync 同款修复——单位受击后引擎 hp 即时更新、DOM 血条动画回落约 0.7s，
//   原判据见 |actual-expected|>5 即报，会把"刚受击的动画途中一帧"误判为"血条高度异常"（每次受击都触发）。
//   改为追踪连续两次取样高度：仍变化=动画中跳过；稳定且仍偏离>5%=真·卡死/错位才报。
export const VER = 'tests/122health-utils.js V6.7.4';

// [模块级状态] 见 V6.7.3：死亡血条动画收敛追踪 + GAMEOVER 按钮稳定计时
const _barPrev = new Map();      // uid -> 上次观测到的血条高度(%)，区分"动画回落中"与"卡死残留"
let _gamoeverSeenAt = 0;         // GAMEOVER 首次观测时刻，跳过 auto 推进切换途中的瞬时禁用窗口
const _hpSyncPrev = new Map();   // uid -> 上次观测到的血条高度(%)，区分"受击动画途中"与"真·高度错位"

/**
 * 获取单位对应的格子 DOM 元素
 */
export function getCellElement(unit, doc) {
    if (!unit || unit.pos == null) return null;
    const gridId = unit.camp === CAMP_TYPES.ALLY ? 'allyGrid' : 'enemyGrid';
    const grid = doc.getElementById(gridId);
    if (!grid) return null;
    const order = unit.camp === CAMP_TYPES.ENEMY ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
    const idx = order.indexOf(unit.pos);
    return idx >= 0 ? grid.children[idx] : null;
}

/**
 * 按 uid 精确定位格子（渲染器在 div.dataset.uid 上写死 uid，render/32 L418）。
 * 与 checkBuffIcons 同根因：死亡单位（如 拒马）死后 pos 可能被复用 / 尸体被 REMOVE_UNIT 移除，
 *   按 pos 反查会误把同格存活单位的血条/特效算到死者头上 → 假"血条残留/缺死亡特效"。
 *   按 uid 查，查不到说明该单位已不在场上（尸体移除/被复用）→ 跳过，避免误报。
 */
export function getCellByUid(uid, doc) {
    if (uid == null || !doc) return null;
    return doc.querySelector('#allyGrid .cell[data-uid="' + uid + '"]')
        || doc.querySelector('#enemyGrid .cell[data-uid="' + uid + '"]') || null;
}

/**
 * 检查单位血量合法性（负数、溢出、膨胀）
 * 韦一笑(isWei)豁免膨胀检查：闪避反击吸血涨上限是设计机制(applyMaxHpChange 只涨 maxHp 不涨 _baseMaxHp，无上限)
 */
export function checkUnitHpValidity(unit) {
    const issues = [];
    // 血上限自身必须先合法（第 21 轮补）：maxHp 非数值 / ≤0 会让下面所有钳制判据失去意义，
    //   且会静默把"上限被写成 0"这类回归放过去。上限都不合法时后续钳制无从判断，直接返回。
    if (typeof unit.maxHp !== 'number' || Number.isNaN(unit.maxHp) || unit.maxHp <= 0) {
        issues.push(unit.name + '血上限非法：' + unit.maxHp);
        return issues;
    }
    if (typeof unit.hp !== 'number' || Number.isNaN(unit.hp)) {
        issues.push(unit.name + '血量非数值：' + unit.hp);
        return issues;
    }
    if (unit.hp < 0) issues.push(unit.name + '血量负数：' + Math.floor(unit.hp));
    if (unit.maxHp > 0 && unit.hp > unit.maxHp) {
        issues.push(unit.name + '血量溢出：' + Math.floor(unit.hp) + '/' + Math.floor(unit.maxHp));
    }
    if (!unit.isWei && unit._baseMaxHp && unit._baseMaxHp > 0 && unit.maxHp > unit._baseMaxHp * 2.5) {
        issues.push(unit.name + '血量异常膨胀：maxHp=' + Math.floor(unit.maxHp) +
            '，初始=' + Math.floor(unit._baseMaxHp) + '，膨胀' + Math.floor(unit.maxHp / unit._baseMaxHp * 100) + '%');
    }
    return issues;
}

/**
 * 检查血条高度与引擎 hp/maxHp 是否同步
 * 注意：血条高度走 updateHpDisplay→tickHpAnim 平滑回落（render/32 L222，约 0.7s）。
 *   单位受击后引擎 hp 立即更新，但 DOM 高度仍动画中，瞬间 actualPct 滞后 expected 可达数十%，
 *   原判据见 |diff|>5 即报，会把"刚受击的动画途中一帧"误判为"血条高度异常"（每次受击都触发）。
 *   改为追踪连续两次取样高度：仍变化=动画中跳过；不再变化且仍偏离>5%=真·卡死/错位才报（保留真实缺陷捕获）。
 */
export function checkHpBarSync(unit, doc) {
    const issues = [];
    if (!unit.alive || !unit.maxHp) return issues;
    const cell = getCellByUid(unit.uid, doc);
    if (!cell) return issues;
    const bar = cell.querySelector('.hp-bar-inner');
    if (!bar) return issues;
    const actualPct = parseFloat(bar.style.height) || 0;
    const expectedPct = Math.floor((unit.hp / unit.maxHp) * 100);
    if (Math.abs(actualPct - expectedPct) > 5) {
        const prev = _hpSyncPrev.get(unit.uid);
        if (prev === undefined) {
            _hpSyncPrev.set(unit.uid, actualPct);            // 首次观测：可能是动画刚开始，记录后再判
        } else if (Math.abs(prev - actualPct) > 0.05) {
            _hpSyncPrev.set(unit.uid, actualPct);            // 高度仍在变化（动画中）：正常，跳过
        } else {
            issues.push(unit.name + '血条高度异常：当前' + actualPct + '%, 预期' + expectedPct + '%');
            _hpSyncPrev.set(unit.uid, actualPct);
        }
    } else {
        _hpSyncPrev.delete(unit.uid);                        // 已对齐：清状态
    }
    return issues;
}

/**
 * 检查血条颜色是否匹配血量百分比
 */
export function checkHpBarColor(unit, win, doc) {
    const issues = [];
    if (!unit.alive || !unit.maxHp) return issues;
    const cell = getCellByUid(unit.uid, doc);
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
 * 排除胜利庆祝粒子（ui/62 celebrate()：party-particle 60 + star-particle 15 = 75 个）：
 *   它们自带 2.8~3.3s 自清，属设计内瞬时特效。结算检查在 GAMEOVER+3000ms 跑，正赶上它们存活期
 *   → 误报"75个特效未清理"。这些不是"残留孤儿"（一定会自清），只盯真正的残留（其他临时FX卡住不清理）。
 */
export function checkFxOrphans(doc) {
    const issues = [];
    const orphans = doc.querySelectorAll('[data-fx="temporary"]');
    if (!orphans.length) return issues;
    let count = 0;
    for (let i = 0; i < orphans.length; i++) {
        const el = orphans[i];
        if (el.classList.contains('party-particle') || el.classList.contains('star-particle')) continue;
        count++;
    }
    if (count > 5) {
        issues.push('战斗结束后' + count + '个特效未清理');
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
        // 按 uid 精确定位该死者自己的格子（render/32 L418 写死 data-uid），不用 pos 反查：
        //   拒马等死后尸体被移除 / pos 被复用，按 pos 会查到同格存活单位的格子 → 假"血条残留"。
        //   uid 查不到说明该单位已不在场上 → 跳过（其血条自然已随尸体消失）。
        const cell = getCellByUid(u.uid, doc);
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
        //    死者血条走 updateHpDisplay→tickHpAnim 平滑回落到 0（render/32 L222 死者目标 hpPct=0），动画约 0.7s。
        //    原判据见 barPct>0 即报，会把动画途中一帧（如 61.4125% = 72.25−0.15×72.25）误判为"残留"。
        //    改为追踪连续两次取样高度：仍下降=动画中跳过；不再下降且 >0=真·卡死才报（保留真实缺陷捕获）。
        if (!u.alive && u.hp <= 0 && cell) {
            const bar = cell.querySelector('.hp-bar-inner');
            const barPct = bar ? (parseFloat(bar.style.height) || 0) : 0;
            if (barPct > 0) {
                const prev = _barPrev.get(u.uid);
                if (prev === undefined) {
                    _barPrev.set(u.uid, barPct);            // 首次观测：可能是动画刚开始，记录后再判
                } else if (barPct < prev - 0.05) {
                    _barPrev.set(u.uid, barPct);            // 仍在回落（动画中）：正常，跳过
                } else {
                    issues.push(u.name + ' UI异常：已阵亡但血条残留，高度=' + barPct + '%');
                    _barPrev.set(u.uid, barPct);
                }
            } else {
                _barPrev.delete(u.uid);                     // 已归零：清状态
            }
        } else if (!u.alive && u.hp <= 0 && !cell) {
            _barPrev.delete(u.uid);                        // 死者已离场（格子移除）：清状态，避免复用 uid 串扰
        }
    }
    return issues;
}

/**
 * [新增] 近战攻击特效检测：飞走/虚影模式下原格子状态
 * 检查近战单位发起攻击后，原位置的视觉残留是否符合预期
 */
export function checkMeleeFxState(ctx, doc, liveAlly, liveEnemy) {
    const issues = [];
    // 数据真值源（V6.2.0 同根因修正，与 checkBuffIcons 一致）：近战/防御特效检查也必须用实时 battleStore
    //   单位，不能用 ctx.UI.allyTeam/enemyTeam 开战副本——张无忌近战切换(RANGED→WARRIOR)、惑人心智换位
    //   会让快照与实时漂移，误报"飞走未清空/虚影透明度异常"。取不到实时再退回 UI 快照（不静默伪造）。
    const allyTeam = (liveAlly && liveAlly.length) ? liveAlly : ((ctx.UI && ctx.UI.allyTeam) || []);
    const enemyTeam = (liveEnemy && liveEnemy.length) ? liveEnemy : ((ctx.UI && ctx.UI.enemyTeam) || []);
    const allUnits = allyTeam.concat(enemyTeam);

    for (const u of allUnits) {
        if (!u.alive || u.isHorse) continue;
        if (u.role !== ROLE_TYPES.WARRIOR && u.role !== ROLE_TYPES.DEFENDER && u.role !== ROLE_TYPES.FLYER) continue;

        // 按 uid 精确定位（render/32 L418 写死 data-uid），不用 pos 反查——换位/近战切换后 pos 可能偏移
        const cell = getCellByUid(u.uid, doc);
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
 *
 * 数据真值源（V6.2.0 同步修正）：受益判定必须用「实时 battleStore」单位，不能用 ctx.UI.allyTeam。
 *   ctx.UI.allyTeam 是 ui/65 开战时 clone 的副本，战斗全程冻结——张无忌近战切换（RANGED→WARRIOR）、
 *   惑人心智换位（前排快照≠实时）、单位阵亡等都会让"快照角色/位置/存活"与实时不一致，
 *   体检据此误判缺图标（与 121 文件头 V6.2.0 同根因，此处补上 live 化）。
 *   liveAlly 由 121.runUIChecks 经 teamsFromStore(ctx) 传入（取不到再退回 UI 快照）。
 */
const ICON_BUFFER_MS = 1000;
const _missingBuffIconSince = {};
export function checkBuffIcons(ctx, doc, liveAlly) {
    const issues = [];
    const allyTeam = (liveAlly && liveAlly.length) ? liveAlly : ((ctx.UI && ctx.UI.allyTeam) || []);
    // V6.1.20 阵营过滤（对齐 render/32-grid-render L267-272）：渲染只给「target === 本阵营 或 无 target（历史）」
    //   的 Buff 画图标。体检原先不过滤，敌方阵营的热血奋战等全队 Buff 会让 5 个己方单位被误报缺 ❤️。
    const activeBuffs = (ctx.activeBuffs || []).filter(b => !b.target || b.target === CAMP_TYPES.ALLY);
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
            case BUFF_TYPES.CARRY: {
                // 从格子 DOM 读取实际站位，避免换位后 pos 不一致
                const cell = getCellByUid(unit.uid, doc);
                const actualPos = cell ? parseInt(cell.dataset.pos) : unit.pos;
                return actualPos === 5 && unit.alive;
            }
            case BUFF_TYPES.METEOR_SHOWER: return unit.role === ROLE_TYPES.RANGED;
            case BUFF_TYPES.BLOODTHIRST: return unit.role === ROLE_TYPES.WARRIOR;
            case BUFF_TYPES.FORTIFY: return unit.role === ROLE_TYPES.DEFENDER;
            case BUFF_TYPES.WIND_ASSAULT: return unit.role === ROLE_TYPES.FLYER;
            case BUFF_TYPES.CLOUD_BODY: return !unit.state?._cloudBodySkip;
        case BUFF_TYPES.HOLY_FLAME: {
            if (!activeBuffs) return false;
            const holyBuffs = activeBuffs.filter(b => b.key === BUFF_TYPES.HOLY_FLAME);
            return holyBuffs.some(b => {
                const cols = b.cols || (b.col != null ? [b.col] : []);
                const rows = b.rows || (b.row != null ? [b.row] : []);
                return cols.includes(getUnitCol(unit.pos)) || rows.includes(getUnitRow(unit.pos));
            });
        }
            case BUFF_TYPES.HOT_BLOOD: return true;
            case BUFF_TYPES.DOUBLE_STRIKE: return unit.uid === doubleStrikeUid;
            case BUFF_TYPES.HORSE_FORMATION: return false;
            case BUFF_TYPES.MIND_CONTROL: {
                const frontUnit = allyTeam.filter(u => u.alive && !u.isHorse).sort((a, b) => a.pos - b.pos)[0];
                return frontUnit && unit.uid === frontUnit.uid;
            }
            default: return false;
        }
    }

    // [V6.6.0] 陈旧时间戳清理：ICON_BUFFER_MS 只应度量「**连续**缺失」。
    //   旧实现只在「本采样仍受益」时才清零时间戳，于是单位本回合没受益（如概率连击 currentDoubleStrikeUid
    //   每步重选、张无忌本回合没被抽中）、buff 已消失、单位已阵亡时，时间戳全留着；
    //   下回合该单位重新受益时，时间差早已越过 1 秒 ⇒ 首次缺失就立刻上报，而渲染其实刚画上 —— 假阳性。
    //   修法：每次进入检查，先把「单位不在场/已死」或「buff 已不在 activeBuffs」的 key 全部清掉；
    //   再由下方循环在「本次不受益」时清掉（见 L364），两次合起来才是真正的连续缺失语义。
    const liveUids = new Set(allyTeam.filter(u => u && u.alive).map(u => String(u.uid)));
    const liveBuffKeys = new Set(activeBuffs.map(b => b.key));
    for (const k of Object.keys(_missingBuffIconSince)) {
        const sep = k.indexOf('|');
        const uidStr = sep >= 0 ? k.substring(0, sep) : k;
        const buffKey = sep >= 0 ? k.substring(sep + 1) : '';
        if (!liveUids.has(uidStr) || !liveBuffKeys.has(buffKey)) delete _missingBuffIconSince[k];
    }

    for (const unit of allyTeam) {
        if (!unit.alive) continue;
        // 只按 uid 定位该单位自己的格子（渲染器在 div.dataset.uid 上写死 uid），绝不回退到按 pos 查——
        // 同格尸体/换位会让 pos→children[idx] 偏移到别人的格子（含尸体格），读到错误格子 → 假"缺图标"。
        // uid 格不在（如位置被尸体占据，主代码正常显示尸体而非该单位）→ 该单位图标本就不该出现，跳过避免误报。
        const cell = doc.querySelector('#allyGrid .cell[data-uid="' + unit.uid + '"]');
        if (!cell) continue;
        const nameEl = cell.querySelector('.cell-name');
        if (!nameEl) continue;
        const nameText = nameEl.textContent || '';

        // 渲染预算模型豁免（第 135 轮重写，镜像 render/32 L328-356）：格子 logo 预算 = 2 -（计数胶囊占 1），
        //   logoList = 🔔护罩 + eliteSkillIcon + buff 图标(按图标聚合) + 🎯☯🔻❌ 状态标记，超预算尾部优先截断
        //   → buff 图标会被状态标记/胶囊挤出（设计如此）。旧豁免只数「受益 Buff 图标 >2 且名≥4 字」，
        //   没算其他 logo 占位 → 张无忌(1/3 胶囊占位)等「图标被合法截断」场景全误报（10-29 实测 5 条）。
        //   新豁免：缺图标且格子预算已满（DOM 已显示 emoji 数 + 胶囊占位 ≥ 2）→ 截断合法，放过；
        //   格子未满仍缺图标 → 照常上报（真信号不丢）。emoji 用 Unicode 属性正则；胶囊按
        //   buildCountBadge 的「N/M」计数文本识别（名字本身不含数字与斜杠，不会误匹配）。
        const benefitedIcons = activeBuffs.filter(b => BUFF_ICONS[b.key] && isBenefited(unit, b.key)).map(b => BUFF_ICONS[b.key]);
        const shownLogos = (nameText.match(/\p{Extended_Pictographic}/gu) || []).length;
        const hasCountBadge = /\d+\/\d+/.test(nameText);
        if (benefitedIcons.length > 0 && shownLogos + (hasCountBadge ? 1 : 0) >= 2) continue;

        for (const buff of activeBuffs) {
            const icon = BUFF_ICONS[buff.key];
            if (!icon) continue;
            const missKey = unit.uid + '|' + buff.key;
            // 本次不受益 ⇒ 立即清零：保证缓冲窗口只累计「连续缺失」，跨回合/跨抽签的陈旧时间戳不得复用
            if (!isBenefited(unit, buff.key)) { delete _missingBuffIconSince[missKey]; continue; }
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
    // GAMEOVER 主按钮稳定计时：auto 模式在 GAMEOVER 后会自动点击推进下一局，点击→下一局开战之间
    // btnMain 处于 RUNNING 的禁用态而 gs 仍滞后为 GAMEOVER，形成"gs=GAMEOVER 但按钮禁用"瞬时窗口
    // （可达数百毫秒）。主代码 finishBattle 已同步 enableAllButtons，窗口结束即恢复启用。
    // 故仅当 GAMEOVER 稳定持续 >1200ms 后才判主按钮禁用，跳过切换途中误报；真·卡死仍会捕获。
    if (gs !== 'GAMEOVER') _gamoeverSeenAt = 0;
    else if (!_gamoeverSeenAt) _gamoeverSeenAt = Date.now();
    const stableGamoever = (gs === 'GAMEOVER') && (_gamoeverSeenAt > 0) && (Date.now() - _gamoeverSeenAt > 1200);
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
        // 仅 GAMEOVER 稳定 >1200ms 才判主按钮禁用（跳过 auto 推进切换途中的瞬时禁用窗口，见上方计时）
        if (stableGamoever) expectDisabled(btnMain, '主按钮', false);
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
 * [新增] 倍速按钮高亮一致性检查 — 当前倍速必须落在"可见且高亮"的按钮上
 * 复发信号（2026-10-09 用户实测）：非调试模式下把 speed 设成 300（4x）——8x/4x 按钮组
 *   display:none（ui/68 updateSpeedButtons 只在调试模式显示 speedGroupHigh/Low），
 *   可见的 2x/0.5x 全灭 → 界面看不到"当前倍速"，且无任何报错（ui/68 只对隐藏按钮 addClass，
 *   不做可见性断言）。121 默认 4 倍速遇非调试模式即此症。
 * 契约（ui/77 V1.1.1 全局×2 档位口径，2026-10-27 订正）：300=2x(原速)、50=8x、150=4x、800=0.5x（按 debugMode 取变体按钮）；
 *   speed=400=取消档（ui/77 点已亮按钮回落 400）/ 1000=旧默认值，六个按钮应全不高亮；其余值（加载期 500 / 快进期 1）不判，避免误报。
 * 可见性按"内联 display:none 祖先链"判断，不用 offsetParent——体检页面切到报告视图时
 *   iframe 整体隐藏，任何布局型判可见都会全量假红。
 */
export function checkSpeedButtonStates(doc) {
    const issues = [];
    if (!doc) return issues;
    const win = doc.defaultView || null;
    const gs = win && win.GlobalStore;
    if (!gs) return issues;
    const speed = gs.get('speed');
    const debugMode = !!gs.get('debugMode');
    const ids = ['btnSpeed2', 'btnSpeed2x', 'btnSpeed8x', 'btnSpeed4x', 'btnSpeed05', 'btnSpeed05x'];
    const btns = [];
    for (const id of ids) { const b = doc.getElementById(id); if (b) btns.push({ id: id, b: b }); }
    const activeNow = btns.filter(x => x.b.classList.contains('active')).map(x => x.id);
    const inlineHidden = (el) => {
        for (let n = el; n && n.style; n = n.parentElement) { if (n.style.display === 'none') return true; }
        return false;
    };
    if (speed === 1000 || speed === 400) {
        if (activeNow.length) issues.push('默认/取消档(' + speed + ')下不应有倍速按钮高亮，实际高亮：' + activeNow.join('/'));
        return issues;
    }
    const wantId = speed === 300 ? (debugMode ? 'btnSpeed2x' : 'btnSpeed2')
        : speed === 50 ? 'btnSpeed8x'
        : speed === 150 ? 'btnSpeed4x'
        : speed === 800 ? (debugMode ? 'btnSpeed05x' : 'btnSpeed05') : null;
    if (!wantId) return issues;   // 未映射档位（加载期 500 / 快进 1），不判
    const want = btns.find(x => x.id === wantId);
    if (!want) return issues;
    if (inlineHidden(want.b)) {
        issues.push('当前倍速' + speed + '对应按钮(' + wantId + ')被隐藏（' + (debugMode ? '调试' : '非调试') + '模式下该按钮组 display:none）→ 界面无可见高亮反映当前倍速');
    } else if (!want.b.classList.contains('active')) {
        issues.push('当前倍速' + speed + '对应按钮(' + wantId + ')未高亮，实际高亮：' + (activeNow.length ? activeNow.join('/') : '无'));
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
 * [新增] 特效DOM/弹幕池检查 — 对象池容量泄漏与池失效
 * 池容量（fx/80fx-common-5v5-test.js POOL_SIZES）：danmaku 8 / dmgFloat 6 / dodge 4 /
 *   healFloat 4 + atkBuffFloat 4 + defBuffFloat 4 = 12（三池共用 .heal-float 类，V6.2.3 新增 defBuffFloat 池）
 * 复发信号：元素数超池容量（泄漏累积→多局后弹幕卡顿）/
 *          RUNNING 中弹幕DOM为0（ui/74reset-runtime.js（原69）重置时移除弹幕DOM，但对象池仍持有游离引用→弹幕永久失效）
 * 对应已报 Bug：多打几局，弹幕特别卡
 * 注意：.heal-float 阈值须用 12（三池之和），不是 8 —— 池元素常驻 DOM（隐藏+激活），稳态恒为 12，
 *   只有出现第 13 个游离元素才真泄漏。旧阈值 8 会把稳态池误报成"泄漏"（每局必误报）。
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
    if (healFloat > 12) issues.push('治疗/加攻飘字' + healFloat + '个超池容量12（对象池泄漏）');
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

// --- 战报条目摊平（第 25 轮收口）---
// 根因：同一段"顶层 → attack-group 的 entries 下钻"逻辑曾在 7 个规则里各复制一份
//   （123/129/132/133/150/151/152），复制时就地改参数，遂分化成三种形态。
//   取证（归一化后逐字比对）：129/133/150/151/152 **五份完全相同**（扁平 push 节点）；
//   132 为 `{e, gi}`；123 为 `{e, gi, i}`，且 123 的判据**真的用 `.i` 做同组内排序**（L85-86），
//   不是冗余字段 —— 故带组号版本必须保留 `i`。
// 收敛：在此提供唯一实现，各规则 import；`i` 对 132 是多余字段，无害。
export function collectNodes(log) {
    var out = [];
    function walk(node, depth) {
        if (!node) return;
        if (Array.isArray(node)) { for (var i = 0; i < node.length; i++) walk(node[i], depth); return; }
        out.push(node);
        if (depth === 0 && Array.isArray(node.entries)) {
            for (var k = 0; k < node.entries.length; k++) walk(node.entries[k], depth + 1);
        }
    }
    for (var j = 0; j < (log || []).length; j++) walk(log[j], 0);
    return out;
}

// --- 以下三个小工具同批收口（第 27 轮）：曾在 9 个规则里各有副本，归一化比对确认**各自只有一种实现** ---
//   plain        ×5（146/148/149/150/151）
//   entryTexts   ×2（136/144）
//   maxHpOf      ×2（150/151）
// 与 collectNodes 同款病：复制即埋雷，改一处漏八处。名字本来就一致，import 时无需 as。

/** 去掉 HTML 标签取纯文本（战报条目带 <span> 等富文本，判据一律比纯文本） */
export function plain(s) {
    return String(s || '').replace(/<[^>]+>/g, '');
}

/** 取一条日志自身文本 + 其 entries 子条目的文本（判据常要"顶层或子条目任一命中"） */
export function entryTexts(e) {
    var out = [];
    if (!e) return out;
    if (typeof e.text === 'string' && e.text) out.push(e.text);
    if (Array.isArray(e.entries)) {
        for (var i = 0; i < e.entries.length; i++) {
            var sub = e.entries[i];
            if (sub && typeof sub.text === 'string' && sub.text) out.push(sub.text);
        }
    }
    return out;
}

/** entryTexts 的数组递归版本：渲染函数可能返回 [行1,行2] 多件套（如 renderZhangSwitchFact），
 *  浏览器端 log 未摊平时需要递归下钻。134/143 原各有一份逐字相同的副本（switchTexts/nineYangTexts）。 */
export function entryTextsDeep(e) {
    var out = [];
    if (!e) return out;
    if (Array.isArray(e)) {
        for (var a = 0; a < e.length; a++) {
            var got = entryTextsDeep(e[a]);
            for (var g = 0; g < got.length; g++) out.push(got[g]);
        }
        return out;
    }
    if (typeof e.text === 'string' && e.text) out.push(e.text);
    if (Array.isArray(e.entries)) {
        for (var i = 0; i < e.entries.length; i++) {
            var sub = e.entries[i];
            if (sub && typeof sub.text === 'string' && sub.text) out.push(sub.text);
        }
    }
    return out;
}

/** 按名字在终局两队里查 maxHp（吸血/回血类判据要用"回血量不得超过血上限"） */
export function maxHpOf(name, afterA, afterE) {
    var lists = [afterA, afterE];
    for (var i = 0; i < lists.length; i++) {
        var arr = lists[i] || [];
        for (var k = 0; k < arr.length; k++) {
            var u = arr[k];
            if (u && u.name === name && typeof u.maxHp === 'number') return u.maxHp;
        }
    }
    return null;
}

// 带组号版本：`gi` = 该条目所属顶层日志下标（用于"同一攻击组内"的判据），`i` = 摊平后的序号。
export function collectNodesGrouped(log) {
    var out = [];
    function walk(node, depth, gi) {
        if (!node) return;
        if (Array.isArray(node)) { for (var i = 0; i < node.length; i++) walk(node[i], depth, gi); return; }
        out.push({ e: node, gi: gi, i: out.length });
        if (depth === 0 && Array.isArray(node.entries)) {
            for (var k = 0; k < node.entries.length; k++) walk(node.entries[k], depth + 1, gi);
        }
    }
    for (var j = 0; j < (log || []).length; j++) walk(log[j], 0, j);
    return out;
}

/**
 * 行动权不变量（回合级，第 24 轮新增·本机线移植）：
 * 每个 alive 且 state._acted=true 的单位，本回合必须留下过一条「正常位行动」记录。
 * 抓的 bug 形态：额外攻击（反击/跟随/联动）若没被 LINK_REASONS 识别、又没配 actedMode，
 *   攻击流程会提前把本人 _acted 置 true（core/10:203/266），主循环 candidates 过滤（core/11:365），
 *   正常位被吞 —— 表现为「_acted=true 但本回合查无此人出手」（灭绝反击 bug 的通用形态）。
 * 正常位口径：攻击结算类（attack/miss/dodge/immune/emptyTarget）出手者在 data.attacker；
 *   pass（休息/遮挡/生生不息）在 data.unit；快照 _isLinkAttack=true 的属额外攻击、不认；
 *   状态转换即行动（butterflyAttach/Return→data.sisterUid，spiderFly/Return→data.spiderUid）：
 *   FSM 进入附身/飞天时主动置 _acted=true，这就是本人本回合的行动。
 *   压进（突进）= 行动（第 129 轮新增，见函数内注释）：SKILL_ANNOUNCE('突进' + 射程不及) 记本人。
 * 边界：胜负已分当回合未行动者 _acted=false 不查；死亡者 alive=false 不查；
 *   召唤物 _acted 默认 false、当回合进正常位有记录。
 */
export function checkActionRights(roundFacts, units) {
    const actedNormal = new Set();
    for (const f of roundFacts || []) {
        if (!f || !f.factType) continue;
        const d = f.data || {};
        const a = d.attacker;
        if (a && a.uid != null && !(a.state && a.state._isLinkAttack)) actedNormal.add(a.uid);
        if (f.factType === FACT_TYPES.PASS && d.unit && d.unit.uid != null) actedNormal.add(d.unit.uid);
        // 状态转换即行动：FSM 进入 attached/flying 时主动置 _acted=true（modules/27:172/439），
        //   附身/飞天就是本人这回合的行动，回合末回归同理。主体：butterfly*=data.sisterUid，spider*=data.spiderUid。
        if ((f.factType === FACT_TYPES.BUTTERFLY_ATTACH || f.factType === FACT_TYPES.BUTTERFLY_RETURN ||
             f.factType === FACT_TYPES.SPIDER_FLY || f.factType === FACT_TYPES.SPIDER_RETURN) &&
            (d.sisterUid != null || d.spiderUid != null)) {
            actedNormal.add(d.sisterUid != null ? d.sisterUid : d.spiderUid);
        }
        // 压进（突进）即行动（第 129 轮）：标枪射程不及时的「向前压至 N 号位」（core/10:42
        //   tryAdvanceJavelin）是设计上的「本回合唯一一手」——消耗行动力、本回合不再出手
        //   （老板口径 2026-10-23），落地面只有一条 SKILL_ANNOUNCE('突进')，既无 attack 也无
        //   emptyTarget ⇒ 按旧口径被判「_acted=true 却查无出手」= 假红（第 129 轮合入上游后
        //   唐文亮 7 类）。★ 只认这一支已登记机制（skillName 突进 + 射程不及），**不**推广成
        //   「有技能公告就算行动」——那会让「被打断/被吞回合」的真红也被放行，属判据放宽。
        if (f.factType === FACT_TYPES.SKILL_ANNOUNCE && d.skillName === '突进' && d.unitUid != null &&
            PRESS_FORWARD_RE.test(String(d.note || ''))) {
            actedNormal.add(d.unitUid);
        }
    }
    const issues = [];
    for (const u of units || []) {
        if (!u || u.alive !== true) continue;
        const acted = u.state ? u.state._acted : u._acted;
        if (acted === true && !actedNormal.has(u.uid)) {
            issues.push((u.name || u.uid) + ' _acted=true 但本回合无正常位行动记录（行动权疑似被额外攻击吞掉）');
        }
    }
    return issues;
}

// ===== 静默位移白名单（第 124 轮：138 / 166 各写一份的重复实现收口为唯一来源）=====
// 背景（第 115 / 121 轮实证，本轮在合并上游 main 后复发一次）：
//   moveUnitPosition / swapUnitPositions（core/13battle-shared.js）只发 ON_UNIT_STATE_CHANGE 信号，
//   **不产** buff-push / buff-swap 条目 ⇒ 战报里没有任何「位置被改写」的标记。138 / 166 的
//   「宣告位置是否真实生效」判据只认 buff-push/buff-swap 打断，于是把「已落地、之后被第三方挪走」
//   误判成「没落地」。
// 全库调用点（第 124 轮 grep 实证，6 处——今后再加务必登记，否则这里会静默漏判）：
//   core/10battle-attack.js:52           标枪射程不及前压  「🥢 X 射程不及，向前压至 N 号位」
//   modules/26…-tangwenliang.js:115      唐文亮冲刺·七伤齐发（强推挤压，多单位 moveUnitPosition）
//   modules/26…-hetaichong.js:128        何太冲红血撤退    「🩸 X 红血：撤退至 N 号位、转远程」
//   modules/26…-hetaichong.js:156        两仪互换（swapUnitPositions）「☯ 两仪互换：A ⇄ B（互换职业与位置）」
//   modules/27…-hanlisa.js:294 / 305     蓄意轰拳·崩飞 / 轰飞（WIND_ASSAULT_PUSH fact）
// 两条判据（任一命中 ⇒ 期望位被合法改写，放弃本条归因；宁漏勿误，数值与落地判据一字未放宽）：
//   ① 落位号证据（通用，不限机制）：条目宣告任意单位落到 N 号位且 N === exp.pos ⇒ 该格被重写，
//      无法再归因（第 121 轮实证：冲刺文案只报被拽者，占位者的名字全程不出现，只能靠落位号认）；
//   ② 具名互换证据（按机制登记）：条目宣告两人互换位置却不报落位号、且文本含期望单位名。
//      两仪互换是此类唯一机制（第 124 轮实证 seed=19 stage=3）；「位置被免疫挡下」那支文案
//      不带「互换职业与位置」字样，不会被误放行。
const LANDING_POS_RE = /(?:至|落在|落至|压至|推至|拽至|飞至|退至)\s*(\d+)\s*号位/;
const SWAP_ANNOUNCE_RE = /两仪互换/;
// ⑤ 压进（突进）机制关键词：core/10:55 的「🥢 X 射程不及，向前压至 N 号位」
const PRESS_FORWARD_RE = /射程不及/;
// ③ 箭头落位证据：已登记「改站位却不发位移事件」的机制关键词（V6.1.3 立、V6.3.0 与上游第 118 轮
//   名单取并集）。★ 今后再加此类机制，往这里登记关键词即可；但优先靠 ④ 载荷证据自动覆盖。
const RELOCATE_MECHANISMS = ['冲刺·七伤齐发', '红血', '蓄意轰拳', '两仪互换', '标枪'];
// ④ 载荷落位证据：fact 里表示「落/被推到哪个位」的字段名（值必须是位号 1..9）
//   behindPos / land / to / newPos 语义唯一，直接认；
//   pos 语义太泛（很多 fact 用它记「当时所在位」，若照单全收会把「单位本来就在期望位」
//   当成「被合法改写」而误放行 ⇒ 只在标签/类型明示是推挤位移时才认（PUSH_STUN 的 pos 即落点）。
const LANDING_FIELDS = ['behindPos', 'land', 'to', 'newPos'];
const PUSH_LABEL_RE = /崩飞|轰飞|轰拳|击退|PUSH|STUN|推/;
function hasMechanism(t) {
    for (var i = 0; i < RELOCATE_MECHANISMS.length; i++) {
        if (t.indexOf(RELOCATE_MECHANISMS[i]) !== -1) return true;
    }
    return false;
}
// 载荷落位：只认「这条落位说的就是期望的那个单位」——uid 优先，其次 target.name / name。
// 拿不到归属（无名无 uid）的一律不认，宁漏勿误。
function payloadLanding(mid, exp) {
    if (!mid || exp == null || exp.pos == null) return false;
    var d = mid.data;
    if (!d || typeof d !== 'object') return false;
    var dd = (d.data && typeof d.data === 'object') ? d.data : null;
    var tgt = d.target || (dd && dd.target) || null;
    var tName = (tgt && tgt.name) || d.name || (dd && dd.name) || null;
    var tUid = (tgt && tgt.uid) || d.uid || d.targetUid || (dd && dd.uid) || null;
    var same = (exp.uid != null && tUid != null && tUid === exp.uid)
            || (!exp.uid || !tUid) && (exp.name && tName && tName === exp.name);
    if (!same) return false;
    for (var k = 0; k < LANDING_FIELDS.length; k++) {
        var v = d[LANDING_FIELDS[k]];
        if (v == null && dd) v = dd[LANDING_FIELDS[k]];
        if (v == null) continue;
        var n = parseInt(v, 10);
        if (!isNaN(n) && n >= 1 && n <= 9 && n === exp.pos) return true;
    }
    // pos 只在明示推挤位移时才认落点
    var pv = d.pos != null ? d.pos : (dd ? dd.pos : null);
    if (pv != null) {
        var n2 = parseInt(pv, 10);
        var lbl = String(d.label || (dd && dd.label) || mid.type || '');
        if (!isNaN(n2) && n2 >= 1 && n2 <= 9 && n2 === exp.pos && PUSH_LABEL_RE.test(lbl)) return true;
    }
    return false;
}
export function isSilentRelocate(mid, exp) {
    if (!mid || !exp) return false;
    var t = typeof mid.text === 'string' ? mid.text : '';
    // ② 具名互换证据（按机制登记）
    if (t && SWAP_ANNOUNCE_RE.test(t) && exp.name && t.indexOf(exp.name) !== -1) return true;
    // ① 落位号证据（通用，不限机制）
    if (t && exp.pos != null) {
        var dm = t.match(LANDING_POS_RE);
        if (dm && parseInt(dm[1], 10) === exp.pos) return true;
    }
    // ③ 箭头落位证据（名字锚定的「N→M」，覆盖不带「号位」二字的报幕写法）
    if (t && exp.pos != null && exp.name && hasMechanism(t)) {
        var am = t.match(new RegExp(exp.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*(\\d+)\\s*→\\s*(\\d+)'));
        // M === exp.pos：单位经该机制**落到**期望位（原口径）。
        // N === exp.pos：单位**曾在**期望位、被该机制**挪走**（第 143 轮续8 补）——实证 seed=6 stage=6：
        //   惑心把唐文亮换到 1 号位（L112 已落地），紧随的冲刺报幕「唐文亮 1→2」立刻把他挪到 2 号位，
        //   此后 17 次快照都不在 1 号位 ⇒ 旧口径 M=2≠1 认不出、误判「换位未生效」。N===exp.pos 恰证
        //   「换位确实落地过」，属该机制合法改写，归因到此为止（不冤枉惑心）。
        //   仍名字锚定（避免同句「张松溪 4→1」误认）+ 需 hasMechanism，窄口径不放宽。
        if (am && (parseInt(am[2], 10) === exp.pos || parseInt(am[1], 10) === exp.pos)) return true;
    }
    // ④ 载荷落位证据（无文本的纯 fact 位移，如蓄意轰拳）
    if (payloadLanding(mid, exp)) return true;
    // ⑤ 压进位移（第 129 轮）：「🥢 X 射程不及，向前压至 N 号位」（core/10:55，skillName '突进'，
    //   任何远程单位够不着目标都会压进）。它点名位移者、且真的改写了站位，却**从不发位移事件**
    //   ⇒ 之前四条判据一条都认不出：①要看落位号恰好等于期望位（压到别的位就不算），
    //   ③④要看已登记机制关键词（'突进' 从未登记）。
    //   后果：166 惑心换位把唐文亮换到 8 号位（同条武当弟子 8→6 已落地，实证换位生效），
    //   换完还没等到第一条带快照的出场，唐文亮就被压进挪到 5 号位 ⇒ 11 次出场均不在 8 号位
    //   ⇒ 166 报「换位后位置未生效」= 假红（seed=6 stage=6 / seed=20 stage=5 两条）。
    //   判定：点名期望单位 + 命中压进关键词 + 宣告落位号 ⇒ 该单位位置已被第三方改写，归因链到此为止。
    //   ★ 只认「压进」这一支已登记机制，**不**推广成「点名即打断」—— 广口径会推翻既有
    //     ①反/③反/通反 三条反例的语义（那三条是第 121-125 轮按「宁漏勿误」立的），属判据放宽，
    //     本轮**否决**广口径、只补这一支漏判，并把广口径是否采纳留给用户拍板（见第 129 轮日志挂账）。
    if (t && exp.name && t.indexOf(exp.name) !== -1 && PRESS_FORWARD_RE.test(t) && LANDING_POS_RE.test(t)) return true;
    return false;
}