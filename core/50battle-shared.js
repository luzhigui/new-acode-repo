﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// core/50battle-shared.js - 光明顶5v5 战斗共享工具
// V5.2.1 | 提取06和48的公共依赖，解开循环引用
export const VER = 'core/50battle-shared.js V5.2.1';

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
            u.hp = 0;
            u.alive = false;
            u._isDead = true;
            if (!u._deathTime) u._deathTime = Date.now();
            emitCoreEvent(u, 'hp-change', { hp: 0, maxHp: u.maxHp, alive: false, atk: u.atk, def: u.def, _isDead: true });
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
        zhang.atk += warriorBonus.atk * 2;
        zhang.def += warriorBonus.def * 2;
        zhang.maxHp = Math.min(zhang.maxHp + warriorBonus.maxHp * 2, zhang._baseMaxHp * 2);
        zhang.hp = Math.min(zhang.hp + warriorBonus.maxHp * 2, zhang.maxHp);
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
        log.push({ type:'info', text:`<span class="gold">⚔️ 张无忌切换近战形态！攻+${warriorBonus.atk * 2}、防+${warriorBonus.def * 2}、生命上限+${warriorBonus.maxHp * 2}</span>`, isZhangSwitch:true, unit: zhang });
        log.push({ type:'info', text:`<span class="gold">🗣️ 张无忌：不好，要顶上去了！</span>`, isZhangTaunt:true });
    }
}

// ==================== 统一事件发送 ====================
// 优先使用 GlobalStore，回退到 window._emitEvent（兼容旧代码）
function emitCoreEvent(unit, eventType, payload) {
    if (window.GlobalStore) {
        const battleStore = window.GlobalStore.get('battleStore');
        if (battleStore && typeof battleStore.dispatch === 'function') {
            battleStore.dispatch({ type: eventType, unitUid: unit.uid, payload });
        }
    }
}
// 同时挂载到 window 以兼容非 core 层代码的调用
window._emitEvent = emitCoreEvent;

export {
    emitCoreEvent as emitEvent,
    emitFullUnitState,
    finalizeDeaths,
    getNextAvailableUnit,
    checkZhangSwitch
};