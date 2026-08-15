// core/03battle-utils.js - 光明顶5v5 战斗工具函数
// V5.4.0 | ~18500 bytes| 2026-07-28 新增事件总线监听器注册
export const VER = 'core/03battle-utils.js V5.4.0';

import { CONFIG, TAUNT_LIB, DEF_TAUNT, HP_TAUNT, ZHANG_NEAR_TAUNT } from './01config-5v5-test.js';
import { emitEvent, applyStatChange, query, getBattleRng } from './13battle-shared.js';
import { EXECUTION_LAYER as L, EFFECT_TYPES } from './00-event-bus.js';
const C = CONFIG, TL = TAUNT_LIB, DT = DEF_TAUNT, HT = HP_TAUNT, ZT = ZHANG_NEAR_TAUNT;


// 设 atk*0.1 保底：防御极高时 atk²/(atk+def) 会趋近0，保底保证任何攻击都有最低伤害，避免高防单位几乎无伤
// 工具-伤害公式：基础伤害 = atk²/(atk+def)
export function calcDamage(atk, def) { if (def <= 0) return atk; let d = atk * (atk / (atk + def)); return Math.max(d, atk * 0.1); }
// 从末尾往前找：FANG_LEVELS 升序排列，从最高档往下比对返回第一个满足的档位，保证取到满足条件的最高档
// 工具-防战等级：根据防御/兵力比查表
export function getFangLevel(def, m) { let ratio = def / m; for (let i = C.FANG_LEVELS.length - 1; i >= 0; i--) { if (ratio >= C.FANG_LEVELS[i]) return i; } return 0; }
// 工具-近战判断：战士/防战/飞行为近战
export function isMelee(role) { return role === '战士' || role === '防战' || role === '飞行'; }

// 工具-前排：获取每列最靠前的存活单位
export function getFronts(units) {
    let fronts = [];
    for (let col = 0; col < 3; col++) {
        let poses = [1+col, 4+col, 7+col];
        let chars = units.filter(c => poses.includes(c.pos) && c.alive && !(c.state._flyMode === 'butterfly') && !(c.state._flyMode === 'spider') && !c.state._spiderFlying && !(c._fsm && (c._fsm.is('attached') || c._fsm.is('flying')))).sort((a, b) => a.pos - b.pos);
        if (chars.length > 0) fronts.push(chars[0]);
    }
    if (fronts.length === 0) {
        let alive = units.filter(c => c.alive);
        if (alive.length > 0) fronts = [alive[getBattleRng().nextInt(0, alive.length - 1)]];
    }
    return fronts;
}

// 工具-遮挡：判断单位是否被前排遮挡
export function isBlocked(unit, allies) {
    if (unit.role === '飞行') return false;
    if (unit.state._flyMode === 'butterfly') return false;
    if (unit.state._flyMode === 'spider') return false;
    if (unit._fsm && (unit._fsm.is('attached') || unit._fsm.is('flying'))) return false;
    let col = (unit.pos - 1) % 3;
    let poses = [1+col, 4+col, 7+col];
    let front = poses.find(p => allies.some(a => a.pos === p && a.alive && !a.isHorse && !(a.state._flyMode === 'butterfly') && !(a.state._flyMode === 'spider')));
    if (!front) return false;
    if (unit.pos === front) return false;
    return unit.pos > front;
}

export function getFlyDodgeRate(unit, attacker) {
    const FLY_BASE_DODGE = C.BASE_DODGE_FLY || 0.15;
    if (unit.isWei) return FLY_BASE_DODGE;
    if (unit.role === '飞行') return FLY_BASE_DODGE;
    return C.BASE_DODGE_GROUND || 0.03;
}

export function getRandomTaunt(unit) { const rng = getBattleRng(); if (unit.isZhang) return TL['张无忌'][rng.nextInt(0,TL['张无忌'].length-1)]; if (unit.isWei) return TL['韦一笑'][rng.nextInt(0,TL['韦一笑'].length-1)]; let pool=TL[unit.role]; if(pool) return pool[rng.nextInt(0,pool.length-1)]; return '看招！'; }
export function getKillTaunt(unit, KT) { const rng = getBattleRng(); if (unit.isZhang) return KT['张无忌'][rng.nextInt(0,KT['张无忌'].length-1)]; if (unit.isWei) return KT['韦一笑'][rng.nextInt(0,KT['韦一笑'].length-1)]; let pool=KT[unit.role]; if(pool) return pool[rng.nextInt(0,pool.length-1)]; return '受死吧！'; }
export function getZhangNearTaunt(nearAtkCount) { if (nearAtkCount>=1&&nearAtkCount<=3) return ZT[nearAtkCount-1]; return null; }
export function makeFXSnapshot(attacker, defender) { return { attackerPos: attacker?attacker.pos:null, defenderPos: defender?defender.pos:null }; }

export function getActiveBuffs(allies, enemy) {
    let ally = allies[0]?.camp === 'ally' ? allies : enemy;
    return ally._activeBuffs || [];
}
// 工具-查找Buff：检查Buff列表中是否存在指定key
export function hasBuff(buffs, buffKey) { return buffs.some(b => b.key === buffKey); }
// 工具-行号：1-3行
export function getUnitRow(pos) { return Math.ceil(pos / 3); }
// 工具-列号：1-3列
export function getUnitCol(pos) { return (pos - 1) % 3 + 1; }
export function getAdjacentPositions(pos) {
    const row = getUnitRow(pos), col = getUnitCol(pos);
    let adj = [];
    for (let r = row-1; r <= row+1; r++) {
        for (let c = col-1; c <= col+1; c++) {
            if (r === row && c === col) continue;
            if (r >= 1 && r <= 3 && c >= 1 && c <= 3) adj.push((r-1)*3 + c);
        }
    }
    return adj;
}

export function hasAnyEnemyEmptyCol(enemySide) {
    const cols = [[1,4,7], [2,5,8], [3,6,9]];
    return cols.some(poses => !enemySide.some(u => u.alive && poses.includes(u.pos)));
}

export function countEnemyEmptyCols(enemySide) {
    const cols = [[1,4,7], [2,5,8], [3,6,9]];
    let count = 0;
    for (const poses of cols) {
        if (!enemySide.some(u => u.alive && poses.includes(u.pos))) count++;
    }
    return count;
}

export function hasEnemyLowHp(enemySide, threshold = 0.4) {
    return enemySide.some(u => u.alive && u.hp / u.maxHp < threshold);
}

/**
 * 飞行突进选目标：后排优先、中排次之、前排最后
 * 返回可选目标，无则返回 null
 */
export function selectFlyTarget(unit, enemySide) {
    if (unit.role !== '飞行' || unit.isWei) return null; // 韦一笑有自己的选目标逻辑
    const alive = enemySide.filter(u => u.alive && !(u.state._flyMode === 'butterfly') && !(u.state._flyMode === 'spider') && !u.state._spiderFlying && !(u._fsm && (u._fsm.is('attached') || u._fsm.is('flying'))));
    if (alive.length === 0) return null;

    // 优先顺序：后排(789) > 中排(456) > 前排(123)
    const backRow = [7,8,9], midRow = [4,5,6], frontRow = [1,2,3];
    const priorityOrder = [...backRow, ...midRow, ...frontRow];
    
    // 获取第一排空位
    const occupiedFront = new Set(alive.filter(u => [1,2,3].includes(u.pos)).map(u => u.pos));
    const emptySlots = [1,2,3].filter(p => !occupiedFront.has(p));
    if (emptySlots.length === 0) return null; // 第一排全满，无法入场

    // 飞行单位优先打后排，再中排，最后前排；还要检查是否有一条无障碍路径能接近目标
    // 按优先级找目标
    for (const pos of priorityOrder) {
        const target = alive.find(u => u.pos === pos);
        if (!target) continue;
        
        // 找能攻击到目标的攻击位置（十字相邻）
        const col = (target.pos - 1) % 3 + 1;
        const row = Math.ceil(target.pos / 3);
        const attackPositions = [];
        // 上
        if (row > 1) attackPositions.push(target.pos - 3);
        // 下
        if (row < 3) attackPositions.push(target.pos + 3);
        // 左
        if (col > 1) attackPositions.push(target.pos - 1);
        // 右
        if (col < 3) attackPositions.push(target.pos + 1);

        // 检查是否有空位能到达某个攻击位置
        for (const attackPos of attackPositions) {
            for (const slot of emptySlots) {
                if (canReach(slot, attackPos, alive)) {
                    return target;
                }
            }
        }
    }
    return null;
}

/**
 * 判断从空位 slot 到目标位置 targetPos 是否有直线无障碍路径
 */
// 为什么分两条路：同一行或同一列直接走直线；不同行列必须拐弯，
// 而拐弯有"先横后竖"和"先竖后横"两种可能，要都试一遍，任一条通就行。
function canReach(slot, targetPos, enemies) {
    const slotCol = (slot - 1) % 3 + 1;
    const slotRow = Math.ceil(slot / 3);
    const targetCol = (targetPos - 1) % 3 + 1;
    const targetRow = Math.ceil(targetPos / 3);

    // 同列：纵向移动
    if (slotCol === targetCol) {
        const minRow = Math.min(slotRow, targetRow);
        const maxRow = Math.max(slotRow, targetRow);
        for (let r = minRow; r <= maxRow; r++) {
            const checkPos = (r - 1) * 3 + slotCol;
            // 终点位置可以有人（那是要停的位置），但路径中间不能有敌方阻挡
            if (checkPos !== targetPos && enemies.some(e => e.pos === checkPos && e.alive)) {
                return false;
            }
        }
        return true;
    }

    // 同行：横向移动
    if (slotRow === targetRow) {
        const minCol = Math.min(slotCol, targetCol);
        const maxCol = Math.max(slotCol, targetCol);
        for (let c = minCol; c <= maxCol; c++) {
            const checkPos = (slotRow - 1) * 3 + c;
            if (checkPos !== targetPos && enemies.some(e => e.pos === checkPos && e.alive)) {
                return false;
            }
        }
        return true;
    }

    // 不同行不同列：需要拐弯。先横后竖或先竖后横，两条路都试试
    // 先横向再纵向
    const corner1 = (slotRow - 1) * 3 + targetCol;
    if (!enemies.some(e => e.pos === corner1 && e.alive) || corner1 === targetPos) {
        // 横向段（slot → corner1，不含起点）
        const minCol1 = Math.min(slotCol, targetCol);
        const maxCol1 = Math.max(slotCol, targetCol);
        let blocked = false;
        for (let c = minCol1; c <= maxCol1; c++) {
            const p = (slotRow - 1) * 3 + c;
            if (p !== slot && p !== corner1 && enemies.some(e => e.pos === p && e.alive)) {
                blocked = true; break;
            }
        }
        if (!blocked) {
            const minRow1 = Math.min(slotRow, targetRow);
            const maxRow1 = Math.max(slotRow, targetRow);
            for (let r = minRow1; r <= maxRow1; r++) {
                const p = (r - 1) * 3 + targetCol;
                if (p !== corner1 && p !== targetPos && enemies.some(e => e.pos === p && e.alive)) {
                    blocked = true; break;
                }
            }
        }
        if (!blocked) return true;
    }

    // 先纵向再横向
    const corner2 = (targetRow - 1) * 3 + slotCol;
    if (!enemies.some(e => e.pos === corner2 && e.alive) || corner2 === targetPos) {
        const minRow2 = Math.min(slotRow, targetRow);
        const maxRow2 = Math.max(slotRow, targetRow);
        let blocked = false;
        for (let r = minRow2; r <= maxRow2; r++) {
            const p = (r - 1) * 3 + slotCol;
            if (p !== slot && p !== corner2 && enemies.some(e => e.pos === p && e.alive)) {
                blocked = true; break;
            }
        }
        if (!blocked) {
            const minCol2 = Math.min(slotCol, targetCol);
            const maxCol2 = Math.max(slotCol, targetCol);
            for (let c = minCol2; c <= maxCol2; c++) {
                const p = (targetRow - 1) * 3 + c;
                if (p !== corner2 && p !== targetPos && enemies.some(e => e.pos === p && e.alive)) {
                    blocked = true; break;
                }
            }
        }
        if (!blocked) return true;
    }

    return false;
}

export function getBloodAuraBonus(allUnits) {
    let totalBonus = 0;
    allUnits.forEach(u => {
        if (!u.alive) return;
        const pct = u.hp / u.maxHp;
        if (pct < 0.4) totalBonus += 3;
    });
    return totalBonus;
}

/**
 * 光环加成纯函数 — 实时扫描战场，当场计算飞行单位的光环加成
 * 不依赖任何字段存储，每次调用返回最新值
 */
// 工具-光环：飞行单位空列+残血光环加成
// 空列每列5点攻为固定设计值；残血光环由 getBloodAuraBonus 单独计算，二者均非可配置项
export function getAuraBonuses(unit, allySide, enemySide) {
    if (unit.role !== '飞行' || unit.isHorse) return { emptyCol: 0, bloodAura: 0 };
    const isAlly = unit.camp === 'ally';
    const mySide = isAlly ? allySide : enemySide;
    const oppSide = isAlly ? enemySide : allySide;
    const emptyCols = countEnemyEmptyCols(oppSide);
    const allUnits = mySide.concat(oppSide);
    const bloodBonus = getBloodAuraBonus(allUnits);
    return { emptyCol: emptyCols * 5, bloodAura: bloodBonus };
}

// ==================== 事件总线监听器注册 ====================

/**
 * 注册战士破防监听器
 */
// 事件-战士破防：概率降低目标防御
export function registerWarriorBreakDefense(eventBus) {
    eventBus.on('beforeDamageCalc', L.BEFORE_DAMAGE_CALC.WARRIOR_BREAK, (data) => {
        const { unit, target, declarations } = data;
        if (!declarations) return;
        if (unit.role !== '战士' || target.def <= 0) return;
        let defReduced = C.WARRIOR_BREAK_DEF;
        let breakChance = target.def * 2.5;
        if (target.def <= 40) {
            defReduced = 2;
        } else if (target.def <= 50) {
            defReduced = 3;
            breakChance = 100;
        } else {
            defReduced = 4;
            breakChance = 100;
        }
        if (getBattleRng().nextInt(1, 100) > breakChance) return;
        defReduced = Math.min(defReduced, target.def);
        declarations.push({ type: EFFECT_TYPES.BREAK_DEF, value: defReduced, source: unit, target: target });
        unit._pendingDefReduceEntry = {type:'detail', text:`<span class="purple small">🗡️ ${unit.name} 破防：${target.name} 防御 -${C.WARRIOR_BREAK_DEF}</span>`};
    });
}

/**
 * 注册远程成长监听器
 */
// 事件-远程成长：每次攻击+2攻击力
export function registerRangedGrowth(eventBus) {
    eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.RANGED_GROWTH, (data) => {
        const { unit, target, dmg, group } = data;
        if (unit.role !== '远程' || dmg <= 0) return;
        const growth = C.RANGED_GROWTH_ATK;
        if (!data.declarations) data.declarations = [];
        data.declarations.push({
            type: EFFECT_TYPES.STAT_CHANGE,
            field: 'atk',
            delta: growth,
            target: unit,
            oldValue: unit.atk,
            logText: null
        });
        if (unit._baseAtk !== undefined) unit._baseAtk += growth;
        if (group && group.entries) {
            group.entries.push({type:'detail', text:`<span class="blue small">🏹 ${unit.name} 远程熟练：攻击 +${growth} → ${Math.floor(unit.atk + growth)}</span>`});
        }
    });
}

/**
 * 注册战士斩杀监听器
 * - 目标血量低于 15% 时直接斩杀
 * - 嗜血狂刀激活时斩杀线提升至 20%
 * - 不限阵营，六大派战士同样生效
 */
// 事件-战士斩杀：低血量直接击杀（15%/20%阈值）
export function registerWarriorExecute(eventBus) {
    eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.WARRIOR_EXECUTE, (data) => {
        const { unit, target, allySide, declarations } = data;
        if (unit.role !== '战士' || !unit.alive) return;
        if (!target || !target.alive || target.hp <= 0) return;
        const unitBuffs = (allySide && allySide._activeBuffs) || [];
        const hasBloodthirst = hasBuff(unitBuffs, 'bloodthirst');
        const threshold = hasBloodthirst ? 0.20 : 0.15;
        if (target.hp <= target.maxHp * threshold) {
            if (!declarations) return;
            declarations.push({
                type: EFFECT_TYPES.EXECUTE,
                target: target,
                source: unit,
                threshold: threshold,
                logText: `<span class="red">⚔️ 战士斩杀！${unit.name} 直接击杀 ${target.name}！</span>`
            });
        }
    });
}

/**
 * 注册防战坚盾监听器
 * - 被攻击时 60% 概率触发坚盾（防御+1/成昆+2）
 * - 攻击时 100% 概率触发坚盾（与被攻击共享每回合上限，成昆6/其他防战3）
 * - 坚盾增加的防御永久保留（同步更新 _baseDef）
 */
// 事件-防战坚盾：被攻/攻击时概率叠防御（每回合上限）
export function registerFortifyShield(eventBus) {
    // 坚盾触发核心逻辑（被攻击 / 攻击共用）
    function tryFortify(unit, chance, group, log, label, skipStatChange) {
        if (unit.role !== '防战') return;
        if (unit._fortifyThisRound === undefined) unit._fortifyThisRound = 0;
        if (!unit._fortifyStacks) unit._fortifyStacks = 0;
        const increment = unit._fortifyIncrement || 1;
        const cap = unit._fortifyCap || 3;
        if (unit._fortifyThisRound + increment > cap) return;
        if (getBattleRng().nextInt(1, 100) > chance) return;
        unit._fortifyStacks += increment;
        unit._fortifyThisRound += increment;
        if (!skipStatChange) {
            applyStatChange(unit, 'def', increment, null, '坚盾');
        }
        if (unit._baseDef !== undefined) unit._baseDef += increment;
        const text = `<span class="blue small">🛡️ ${unit.name} ${label}：防御+${increment}（已叠${unit._fortifyThisRound}/${cap}）</span>`;
        if (group && group.entries) {
            group.entries.push({type:'detail', text});
        } else if (log) {
            log.push({type:'detail', text});
        }
    }

    // 被攻击时触发（60% 概率）
    eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.SHIELD_DEFEND, (data) => {
        const { target, dmg, group } = data;
        if (dmg <= 0) return;
        const prevStacks = target._fortifyStacks || 0;
        tryFortify(target, 60, group, null, '坚盾', true);
        if ((target._fortifyStacks || 0) > prevStacks) {
            const increment = (target._fortifyStacks || 0) - prevStacks;
            if (!data.declarations) data.declarations = [];
            data.declarations.push({
                type: EFFECT_TYPES.STAT_CHANGE,
                field: 'def',
                delta: increment,
                target: target,
                logText: null
            });
        }
    });

    // 攻击时触发（80% 概率，与被攻击共享每回合上限）
    eventBus.on('afterAttack', L.AFTER_ATTACK.SHIELD_ATTACK, (data) => {
        const { unit, group, log } = data;
        tryFortify(unit, 80, group, log, '攻盾');
    });
}

// 事件-概率连击：80%概率额外攻击一次
export function registerDoubleStrike(eventBus, doubleStrikeUnitUid, allyTeam, activeBuffs) {
    if (!doubleStrikeUnitUid) return;
    eventBus.on('afterAttack', L.AFTER_ATTACK.DOUBLE_STRIKE, (data) => {
        const { unit, target, log } = data;
        if (unit.uid !== doubleStrikeUnitUid || !unit.alive || unit.camp !== 'ally' || unit._doubleStriked) return;
        const xiaoDoubleEnhance = query('xiaoHexEnhance', allyTeam, activeBuffs, 'doubleStrike');
        const missChainChance = xiaoDoubleEnhance ? 1.0 : 0.8;
        if (getBattleRng().next() < missChainChance) {
            log.push({type:'info', text:`<span class="gold">⚡ 概率连击触发！</span>`, isDoubleStrikeBanner:true});
            unit._doubleStriked = true; unit.state._acted = false;
            data.retry = true; data.retryTargetUid = (target && target.alive) ? target.uid : null;
        } else {
            log.push({type:'info', text:`<span class="gray">⚡ 概率连击触发失败，${unit.name} 未能再次攻击</span>`});
        }
    });
}

// 事件-空列加成：已改为纯函数（保留空壳兼容）
export function registerEmptyColBonus(eventBus) {
    // 空列和残血光环已改为纯函数 getAuraBonuses 实时计算，不再需要事件监听
    // 保留空函数以兼容所有调用方，后续可彻底移除调用
}