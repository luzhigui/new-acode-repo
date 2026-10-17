// modules/23elite-helpers.js — 精英组件公共小工具
// V1.2.0 | ~2100 bytes | 2026-10-17 追加 pushSkillAnnounce（收敛 22 处 SKILL_ANNOUNCE 直写）
// V1.1.0 | ~1700 bytes | 2026-10-17 追加 applyRoleBonusMods / switchRoleOnly（收敛何太冲·唐文亮的换职业样板）
// V1.0.0 | ~450 bytes | 2026-10-17 新建：收敛 5 份同形 pushInfo
//   （27elite-mingjiao-yintianzheng / -xiexun / -hanlisa、26elite-sixsects-pangyuanqiao / -miejueshitai）
import { getRoleBonus } from '../core/02unit.js';
import { addMod, refreshMaxHp, emitEvent, getStat } from '../core/13battle-shared.js';
import { UNIT_EVENT_TYPES, STATE_CHANGE_TYPES, FACT_TYPES } from '../infra/56-battle-enums.js';
import { emitStateChange } from '../infra/59-state-change.js';

export const VER = 'modules/23elite-helpers.js V1.2.0';

// 往本击攻击组（ATTACK fact 的 data）里追加一行文本。
//   攻击组不存在（技能在组外触发）时静默跳过——行为与抽离前 5 份内联实现一致。
export function pushInfo(data, text) {
    if (data && data.group && data.group.data && data.group.data.entries) {
        data.group.data.entries.push({ type: 'info', text });
    }
}


// 登记一套职业加成词条（atk/def/maxHp 各 +bonus），并同步 maxHp。
//   group 必须由调用方传：体检对照器按 group 隔离比对「声明 vs 账本」，统一成一个会破契约
//   （何太冲=heTaichongRed、唐文亮=twDash）。返回 bonus 供调用方发数值声明 fact。
export function applyRoleBonusMods(unit, role, label, group) {
    const bonus = getRoleBonus(role);
    addMod(unit, 'atk', { source: label, value: bonus.atk, ttl: 'permanent', group, op: 'add' });
    addMod(unit, 'def', { source: label, value: bonus.def, ttl: 'permanent', group, op: 'add' });
    addMod(unit, 'maxHp', { source: label, value: bonus.maxHp, ttl: 'permanent', group, op: 'add' });
    refreshMaxHp(unit, null, label);
    return bonus;
}

// 换职业 + 广播（HP_CHANGE 让 UI 重画攻防，ROLE_CHANGED 走 infra/59 状态变更通道）。
//   不含任何 addMod：加成本身走 applyRoleBonusMods，调用时序由各角色自己掌握
//   （何太冲 switchRole 内嵌加成，唐文亮 doDash 是「先加成、再打 fact、后换职业」两步）。
export function switchRoleOnly(unit, role, label, outLog) {
    unit.role = role;
    emitEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: getStat(unit, 'atk'), def: getStat(unit, 'def'), role });
    emitStateChange(unit, STATE_CHANGE_TYPES.ROLE_CHANGED, { newRole: role }, outLog);
}

// 往 log 里推一条技能播报（SKILL_ANNOUNCE）。基础 5 字段固定，额外字段（floatText/floatUid/
//   line:false/grants/swap/dot/eggAtkDelta/eggDefDelta/pangDefGain…）走 extra 展开；
//   extra 里的同名字段会覆盖基础值（例：hetaichong 箭靶标记的 camp 需覆盖为施法者阵营）。
//   log 为空时静默跳过（与各原调用点的 if (log) 保护一致）。
export function pushSkillAnnounce(log, unit, skillName, note, extra) {
    if (!log || !unit) return;
    log.push({
        factType: FACT_TYPES.SKILL_ANNOUNCE,
        data: {
            unitName: unit.name,
            unitUid: unit.uid,
            camp: unit.camp,
            skillName,
            note,
            ...(extra || {})
        }
    });
}
