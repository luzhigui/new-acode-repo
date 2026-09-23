// V6.2.0 | ~7300 bytes | 2026-09-23 spawnUnit 支持 stats（固定数值召唤物：谢逊三狮）
export const VER = 'core/05battle-horse.js V6.2.0';

import { CONFIG } from './01config-5v5-test.js';
import { hasBuff } from './03battle-utils.js';
import { query, getBattleRng, applyStatChange, emitEvent } from './13battle-shared.js';
import { Unit, getHpDmgRatio } from './02unit.js';
import { FACT_TYPES, BUFF_TYPES, UNIT_EVENT_TYPES, ROLE_TYPES } from '../infra/56-battle-enums.js';
const C = CONFIG;

// 拒马-生成：创建拒马单位并随机站位
export function spawnHorse(allyTeam, log, enemyTeam, force = false) {
    let buffs = allyTeam._activeBuffs || [];
    if (!force && !hasBuff(buffs, BUFF_TYPES.HORSE_FORMATION)) return;
    let occupiedPositions = new Set(
        allyTeam.filter(u => u.alive).map(u => u.pos)
    );
    let available = [1,2,3,4,5,6,7,8,9].filter(p => !occupiedPositions.has(p));
    if (available.length === 0) return;
    const rng = getBattleRng();
    for (let i = available.length - 1; i > 0; i--) {
        const j = rng.nextInt(0, i);
        [available[i], available[j]] = [available[j], available[i]];
    }
    let horsePos = available[0];
    let horse = new Unit('拒马', 15, ROLE_TYPES.DEFENDER, allyTeam[0].camp);
    const xiaoHEnhance = query('xiaoHexEnhance', allyTeam, allyTeam._activeBuffs || [], BUFF_TYPES.HORSE_FORMATION);
    horse.atk = 0;
    // 拒马血量系数分档：按 50% 血量占位取档，唯一来源 02unit.getHpDmgRatio（原先此处硬编码 0.06）
    horse.state._hpDmgRatio = getHpDmgRatio(0.5);
    if (xiaoHEnhance) {
        horse.def = xiaoHEnhance.horseDef;
        horse.maxHp = xiaoHEnhance.horseHp;
    } else {
        horse.def = C.BUFFS.horseFormation.horseDef;
        horse.maxHp = C.BUFFS.horseFormation.horseHp;
    }
    // 拒马基础防/血写入 state，供词条系统 getStat 使用；hp 直接满血
    horse.state._baseDef = horse.def;
    horse.state._baseMaxHp = horse.maxHp;
    horse.hp = horse.maxHp;
    horse.pos = horsePos; horse.isHorse = true; horse.state._originalPos = horsePos;
    allyTeam.push(horse);
    // 返回生成的拒马单位，让调用方自己写日志
    return horse;
}

// 查空：按 positions 顺序取第一个空位（只看存活单位占的格）；全被占返回 null
export function findFreePos(allyTeam, positions) {
    const occupied = new Set(allyTeam.filter(u => u.alive).map(u => u.pos));
    for (const p of positions) { if (p && !occupied.has(p)) return p; }
    return null;
}

// 指定格召唤：在 pos 生成一个单位（pos 由调用方用 findFreePos 确认空闲）。
// 走 Unit.init + applyBonus，与开局单位同口径（含 _base/_init 数值与 _hpDmgRatio 分档）；
// 打 isSummon 标记便于日志/UI 区分召唤物；拒马不走这里（它有独立的随机格 + 固定数值逻辑）。
// stats 可选：{ atk, def, maxHp } —— 传了就写死属性（谢逊三狮这类固定数值召唤物），
//   不走 M 随机与职业加成；防战形态另按满血占比锁 _hpDmgRatio（攻击公式要用）。
export function spawnUnit(allyTeam, name, m, role, pos, stats = null) {
    const unit = new Unit(name, m, role, allyTeam[0].camp);
    unit.init(getBattleRng());
    unit.applyBonus();
    if (stats) {
        unit.atk = stats.atk;
        unit.def = stats.def;
        unit.maxHp = stats.maxHp;
        unit.hp = stats.maxHp;
        unit.state._baseAtk = stats.atk;
        unit.state._baseDef = stats.def;
        unit.state._baseMaxHp = stats.maxHp;
        unit.state._initAtk = stats.atk;
        unit.state._initDef = stats.def;
        unit.state._initMaxHp = stats.maxHp;
        if (role === ROLE_TYPES.DEFENDER) unit.state._hpDmgRatio = getHpDmgRatio(1);
    }
    unit.pos = pos;
    unit.state._originalPos = pos;
    unit.isSummon = true;
    allyTeam.push(unit);
    return unit;
}

// 拒马-销毁：回合结束概率消散拒马
export function destroyHorse(allyTeam, log) {
    let horses = allyTeam.filter(u => u.isHorse && u.alive).sort((a, b) => b.pos - a.pos);
    if (horses.length === 0) return;

    // 连续销毁概率递减，失败重置。基数唯一来源 gameData.buffs.horseFormation.destroyProb
    // （2026-09-14 参数三源收敛：原先硬编码 50，改数据里 destroyProb 不生效）
    const baseProb = Math.round((C.BUFFS?.horseFormation?.destroyProb ?? 0.5) * 100);
    let currentProb = baseProb;
    const rng = getBattleRng();
    for (const horse of horses) {
        const roll = rng.nextInt(1, 100);
        const success = roll <= currentProb;
        if (success) {
            applyStatChange(horse, 'hp', -horse.hp, null, '拒马消散', false);
            horse.alive = false;
            horse.state._isDead = true;
            emitEvent(horse, UNIT_EVENT_TYPES.HP_CHANGE, { hp: horse.hp, maxHp: horse.maxHp, alive: false, atk: horse.atk, def: horse.def, _isDead: true });
            log.push({ factType: FACT_TYPES.HORSE_DESTROY, data: { pos: horse.pos, success: true, prob: currentProb, roll, horseUid: horse.uid } });
            currentProb = Math.floor(currentProb / 2);
        } else {
            log.push({ factType: FACT_TYPES.HORSE_DESTROY, data: { pos: horse.pos, success: false, prob: currentProb, roll, horseUid: horse.uid } });
            currentProb = baseProb;
        }
    }
}