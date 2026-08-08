﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// core/50battle-shared.js - 光明顶5v5 战斗共享工具
// V5.2.1 | 提取06和48的公共依赖，解开循环引用
export const VER = 'core/50battle-shared.js V5.3.1';

import { CONFIG } from './01config-5v5-test.js';
import { ROLE_BONUS } from './02unit.js';
import { GlobalStore } from '../modules/46global-store.js';
const C = CONFIG;

// ==================== 事件系统 ====================
// 原始 emitEvent 函数已在文件末尾通过 emitCoreEvent 统一处理，此处删除重复定义
// window._emitEvent 挂载已在文件末尾 emitCoreEvent 函数中完成

function emitFullUnitState(unit, eventType) {
    emitCoreEvent(unit, eventType, {
        uid: unit.uid,
        name: unit.name,
        role: unit.role,
        camp: unit.camp,
        pos: unit.pos,
        hp: unit.hp,
        maxHp: unit.maxHp,
        atk: unit.atk,
        def: unit.def,
        alive: unit.alive,
        isHorse: unit.isHorse || false,
        _isDead: unit._isDead || false
    });
}

// ==================== 辅助函数 ====================

function finalizeDeaths(team) {
    for (const u of team) {
        if (u.hp <= 0 && u.alive) {
            applyStatChange(u, 'hp', -u.hp, null, '死亡结算');
            u.alive = false;
            u._isDead = true;
            if (!u._deathTime) u._deathTime = Date.now();
            emitCoreEvent(u, 'unit-remove', { uid: u.uid });
        }
    }
}

function getNextAvailableUnit(team) {
    return team.filter(c => c.alive && !c._acted).sort((a, b) => a.pos - b.pos)[0] || null;
}

function checkZhangSwitch(A, log) {
    let zhang = A.find(c => c.isZhang && c.alive && !c._zhangSwitched);
    if (!zhang) return;
    let col = (zhang.pos - 1) % 3;
    let hasFrontAlly = A.some(c => c.alive && !c.isHorse && c.pos === 1 + col && c.uid !== zhang.uid);
    if (!hasFrontAlly) {
        zhang.rangedForm = false;
        const warriorBonus = ROLE_BONUS['战士'];
        zhang.atk += warriorBonus.atk * 3;
        zhang.def += warriorBonus.def * 3;
        zhang.maxHp = Math.min(zhang.maxHp + warriorBonus.maxHp * 3, zhang._baseMaxHp * 3);
        zhang.hp = Math.min(zhang.hp + warriorBonus.maxHp * 3, zhang.maxHp);
        zhang.role = '战士';
        zhang._resting = false; zhang._zhangSwitched = true;
        zhang._baseMaxHp = zhang.maxHp;
        emitCoreEvent(zhang, 'zhang-switch', {
            atk: zhang.atk,
            def: zhang.def,
            maxHp: zhang.maxHp,
            hp: zhang.hp,
            role: zhang.role,
            rangedForm: false
        });
        log.push({ type:'info', text:`<span class="gold">⚔️ 张无忌切换近战形态！攻+${warriorBonus.atk * 3}、防+${warriorBonus.def * 3}、生命上限+${warriorBonus.maxHp * 3}</span>`, isZhangSwitch:true, unit: zhang });
        log.push({ type:'info', text:`<span class="gold">🗣️ 张无忌：不好，要顶上去了！</span>`, isZhangTaunt:true });
    }
}

// ==================== 统一事件发送 ====================
// 优先使用 GlobalStore，回退到 window._emitEvent（兼容旧代码）
function emitCoreEvent(unit, eventType, payload) {
    if (window.GlobalStore) {
        window.GlobalStore.pushBattleEvent({ unitUid: unit.uid, eventType, payload });
    }
}
// 同时挂载到 window 以兼容非 core 层代码的调用
window._emitEvent = emitCoreEvent;

/**
 * 状态变更裁定边裁 — 统一入口
 * 所有直接修改 hp/atk/def/maxHp 的操作必须走此函数。
 * @param {Unit} target - 目标单位
 * @param {string} field - 'hp'|'atk'|'def'|'maxHp'
 * @param {number} delta - 变更量（正为增加，负为减少）
 * @param {Unit|null} source - 变更来源（可为 null）
 * @param {string} reason - 变更原因（用于日志追踪）
 * @returns {boolean} 是否触发死亡标记
 */
function applyStatChange(target, field, delta, source, reason) {
    if (delta === 0 || !target || !target.alive) return false;
    const oldVal = target[field];
    target[field] = field === 'hp' ? Math.max(0, target[field] + delta) : target[field] + delta;
    if (field === 'hp' || field === 'maxHp') target[field] = Math.max(0, target[field]);
    // 血量相关统计
    if (field === 'hp') {
        if (delta < 0) {
            target.dmgTaken += Math.abs(delta);
            if (source) source.dmgDealt = (source.dmgDealt || 0) + Math.abs(delta);
        } else {
            target.healDone += delta;
        }
    }
    // 死亡标记
    if (field === 'hp' && target.hp <= 0) {
        target._pendingDeath = true;
        if (!target._deathTime) target._deathTime = Date.now();
    }
    emitCoreEvent(target, 'hp-change', {
        hp: target.hp, maxHp: target.maxHp, alive: target.alive,
        atk: target.atk, def: target.def, _isDead: target._isDead || false
    });
    return target._pendingDeath || false;
}

/**
 * 最大生命值变更边裁
 * - 上限增加：当前生命直接增加等额差值
 * - 上限减少：当前生命等比缩放
 * @param {Unit} target - 目标单位
 * @param {number} newMaxHp - 新的最大生命值
 * @param {Unit|null} source - 变更来源
 * @param {string} reason - 变更原因
 */
function applyMaxHpChange(target, newMaxHp, source, reason) {
    if (!target || !target.alive) return;
    const oldMaxHp = target.maxHp;
    if (oldMaxHp <= 0 || newMaxHp <= 0) return;
    const oldHp = target.hp;
    target.maxHp = newMaxHp;
    let newHp;
    if (newMaxHp > oldMaxHp) {
        newHp = oldHp + (newMaxHp - oldMaxHp);
    } else {
        newHp = Math.floor(oldHp * (newMaxHp / oldMaxHp));
    }
    newHp = Math.min(newHp, target.maxHp);
    const delta = newHp - oldHp;
    if (newHp <= 0) {
        applyStatChange(target, 'hp', -target.hp, null, 'maxHp变更致死');
    } else if (delta !== 0) {
        applyStatChange(target, 'hp', delta, source, reason);
    }
}

// ==================== 查询注册表 ====================
// modules 层通过 registerQuery 注册查询处理器，core 层通过 query 调用，切断 core→modules 的反向依赖
const _queries = {};
export function registerQuery(name, fn) { _queries[name] = fn; }
export function query(name, ...args) { return _queries[name] ? _queries[name](...args) : undefined; }

export {
    emitCoreEvent as emitEvent,
    emitFullUnitState,
    finalizeDeaths,
    getNextAvailableUnit,
    checkZhangSwitch,
    applyStatChange,
    applyMaxHpChange
};