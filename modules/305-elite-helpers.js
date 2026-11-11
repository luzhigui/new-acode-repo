// modules/305-elite-helpers.js — 精英组件公共骨架（找人 / 缺参 / 血量广播 / 推 fact / 播报 / 职业加成 / 换职业）
import { getRoleBonus } from '../core/202-unit.js';
import { getSkillParams } from '../core/201-config-5v5-test.js';
import { addMod, refreshMaxHp, emitHpChange } from '../core/214-battle-shared.js';
// pushFact 实作已下移 infra/102（V6.1.6）：core 层也要推 fact，放 modules 层底层够不到。
import { pushFact } from '../infra/102-core-utils.js';
// UNIT_EVENT_TYPES 随 emitHpChange 下移 core/214 一并移除（本文件不再直接发事件）
import { STATE_CHANGE_TYPES, FACT_TYPES } from '../infra/106-battle-enums.js';
import { emitStateChange } from '../infra/108-state-change.js';
// 血量/攻防广播入口的唯一实现在 core/214（V6.4.8 下移）：core 是最底层业务层，放这里 core 够不到。
//   本文件只做转口，保持 modules 以上层的既有 import 路径不变。
//   ★ 必须 import 建本地绑定后再 export：`export {x} from` 不建本地名，switchRoleOnly 内部调会 undefined。
export { emitHpChange, pushFact };

// V2.0.1 | 2026-11-08 两个通用动作实作下移最低可用层：emitHpChange → core/214（V6.4.8）、 pushFact → infra/102（V6.1.6）。放 modules 层时 core 自身（HP 广播 22 处 / 推 fact 113 处） 永远够不到入口，守卫规则形同虚设。本文件改为转口，对外签名与行为不变。
export const VER = 'modules/305-elite-helpers.js V2.0.1';

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
    emitHpChange(unit, { role });
    emitStateChange(unit, STATE_CHANGE_TYPES.ROLE_CHANGED, { newRole: role }, outLog);
}

// ---------- 骨架：通用动作 ----------

// 找队伍里带某角色标记的活人。teams 可传单队（数组）或多队（[A, B]）。
//   predicate 可选，叠加额外条件（如 !u.state._stunned）；不传即「活着 + 带该标记」。
//   传空队 / null 返回 null，不抛错（与原 .find 行为一致）。
export function findAlive(teams, flag, predicate) {
    if (!teams) return null;
    const lists = Array.isArray(teams[0]) ? teams : [teams];
    for (const list of lists) {
        if (!list) continue;
        const hit = list.find(u => u && u[flag] && u.alive && (!predicate || predicate(u)));
        if (hit) return hit;
    }
    return null;
}

// 出手者本人优先；本人不在/已阵亡才按标记找。
//   与原手写 `(self && self.alive) ? self : ...` 完全等价。
export function selfOrFindAlive(self, teams, flag, predicate) {
    if (self && self.alive) return self;
    return findAlive(teams, flag, predicate);
}

// 读技能参数并强制存在：缺键直接炸。
//   全项目「配置缺键显式抛错、不回落」的唯一入口；错误文案与原手写逐字一致。
export function requireSkillParams(characterName, skillKey) {
    const params = getSkillParams(characterName, skillKey);
    if (params == null) throw new Error(`缺技能参数: ${characterName}.${skillKey}`);
    return params;
}

// 取二级键并强制存在（如 params.atkHalfRatio / params.minReduce）。
//   context 传「角色.技能」，报错文案与 requireSkillParams 同格式。
export function requireField(obj, field, context) {
    const v = (obj == null) ? null : obj[field];
    if (v == null) throw new Error(`缺技能参数: ${context}.${field}`);
    return v;
}

// 推一条 fact。log 为空静默跳过。
//   ★ 实作已下移 infra/102（V6.1.6）并在文件头转口；此处不再保留本地副本。

// 广播单位数值变化（UI 重画攻防血）：固定 5 字段，extra 追加或覆盖。
//   ★ 实作已下移 core/214（V6.4.8）并在文件头上方转口；此处不再保留本地副本。

// 往 log 里推一条技能播报（SKILL_ANNOUNCE）。基础 5 字段固定，额外字段（floatText/floatUid/
//   line:false/grants/swap/dot/eggAtkDelta/eggDefDelta/pangDefGain…）走 extra 展开；
//   extra 里的同名字段会覆盖基础值（例：hetaichong 箭靶标记的 camp 需覆盖为施法者阵营）。
//   log 为空时静默跳过（与各原调用点的 if (log) 保护一致）。
// 技能名 → 稳定 label：体检规则不靠中文文案匹配（文案随时可改），一律认这个英文短标识。
//   333-339 新精英此前只有 skillName 中文，规则只能扒 note 文本；新增技能在此登记一行即可。
const SKILL_LABELS = {
    '癫': 'crazy',
    '吸星大法': 'absorb',
    '妙手回春': 'healAlly',
    '现原形': 'yuanZhen',
    '断锤三式': 'zhuangZheng',
    '双面观音': 'pengYingYu'
};

export function pushSkillAnnounce(log, unit, skillName, note, extra) {
    if (!log || !unit) return;
    log.push({
        factType: FACT_TYPES.SKILL_ANNOUNCE,
        data: {
            unitName: unit.name,
            unitUid: unit.uid,
            camp: unit.camp,
            skillName,
            label: SKILL_LABELS[skillName] || skillName,
            note,
            ...(extra || {})
        }
    });
}