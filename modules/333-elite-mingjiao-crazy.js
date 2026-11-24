// modules/333-elite-mingjiao-crazy.js — 周颠·癫（普通兵机制）
// 规则：初始携带「癫」，攻击随机不分敌友，命中后传给被打者；
// 死亡时传给攻击者，找不到给周颠，周颠死了随机传。
// 带「癫」时：必中，且无视目标闪避（从而不会触发闪避反击）。
// V1.1.4 | 2026-11-19 grant/revoke 导出给 311：张三丰持癫乱回后传染走同一出口
// V1.1.5 | 2026-11-22 传染拦截免疫控制者（寒离飒等）：isCCImmune 挡住，癫留在本人身上并播报
// V1.2.0 | 2026-11-22 多来源「癫」共存：state._crazySources 记来源（周颠 / 偷·空智…），各自独立存在，
//             日志与格子图标可区分；传染互斥——目标已带任意癫则不覆盖，癫留在攻击者身上
export const VER = 'modules/333-elite-mingjiao-crazy.js V1.2.0';

import { registerSettlementHook, EXECUTION_LAYER as L } from '../infra/101-event-bus.js';
import { registerMechanicHandler } from '../core/219-mechanic-registry.js';
import { SIGNAL_TYPES, MECHANIC_TYPES, FACT_TYPES } from '../infra/106-battle-enums.js';
import { getBattleRng } from '../core/214-battle-shared.js';
import { canBeTargeted } from '../core/203-battle-utils.js';
import { buildTargetCandidates } from '../core/207-target-strategies.js';
import { pushSkillAnnounce } from './305-elite-helpers.js';
import { isCCImmune } from '../core/218-state-keys.js';

// 多来源「癫」：state._crazySources = { [来源键]: 显示名 }，如 { 周颠: '周颠' } / { 空智: '偷·空智' }。
//   来源键=首个持有者名字（稳定去重），显示名给战报/格子看。_isCrazy/_neverMiss/_ignoreDodge 由「来源表非空」派生，
//   现有读点（core/210 遮挡豁免、core/203 必中、render/403 图标、modules/311/312）零改动照用。
function crazySources(unit) {
    const s = unit && unit.state && unit.state._crazySources;
    return (s && typeof s === 'object') ? s : null;
}
function syncCrazyFlags(unit) {
    const has = !!crazySources(unit);
    unit.state._isCrazy = has;
    unit.state._neverMiss = has;
    unit.state._ignoreDodge = has;
}
// 供 311/日志读：当前身上所有癫的来源显示名（0 个=没癫）
export function crazyLabels(unit) {
    const s = crazySources(unit);
    return s ? Object.values(s) : [];
}
// 加一份来源（同来源幂等）。unit.state 每次整对象换新——OBJECT 字段 clone 是浅拷贝，就地改会漏到 UI 镜像。
export function grantCrazy(unit, sourceKey, label) {
    if (!unit || !unit.alive) return;
    const key = sourceKey || unit.name;
    unit.state._crazySources = { ...(crazySources(unit) || {}), [key]: label || key };
    syncCrazyFlags(unit);
}
// 撤一份来源（不传 sourceKey = 全撤）
export function revokeCrazy(unit, sourceKey) {
    if (!unit) return;
    const cur = crazySources(unit);
    if (!cur || !sourceKey) {
        unit.state._crazySources = null;
        syncCrazyFlags(unit);
        return;
    }
    const next = { ...cur };
    delete next[sourceKey];
    unit.state._crazySources = Object.keys(next).length > 0 ? next : null;
    syncCrazyFlags(unit);
}
// 传染出口：目标已带任意癫 → 不覆盖（互斥），返回 false；否则把自己的全部来源整体搬过去。
export function moveCrazy(from, to) {
    if (!from || !to || !to.alive || to.uid === from.uid) return false;
    const src = crazySources(from);
    if (!src) return false;
    if (crazySources(to)) return false;   // 互斥：已有癫的人不再接收
    revokeCrazy(from);
    for (const [k, v] of Object.entries(src)) grantCrazy(to, k, v);
    return true;
}

function crazyAttackNote(unit, target) {
    const lbl = crazyLabels(unit).join('/');
    return `🤪 ${unit.name} 受到「癫${lbl ? '·' + lbl : ''}」的影响，不分敌友地向 ${target ? target.name : '?'} 发起攻击！`;
}

// 出手开场白必须落进本击自己的攻击组：core/209 先 log.push(group) 再发 AFTER_DAMAGE_APPLIED。
//   早期挂在 AFTER_SELECT_TARGET（组建成之前）会写进日志尾部 → 渲染成上一个攻击组的尾巴。
// 2026-11-23 老板定调：张无忌「我命由我」的手动拖选是玩家操作的技能机制，优先级高于癫——
//   手动指定目标时不播「不分敌友」这句（否则日志与实际行为不符），必中/无视闪避/传染照旧。
function isManualAimed(unit) {
    return !!(unit && unit.state && unit.state._manualTargetUid);
}
function pushCrazyOpening(data, unit) {
    if (isManualAimed(unit)) return;
    const note = crazyAttackNote(unit, data.target);
    if (data.group && data.group.data && Array.isArray(data.group.data.entries)) {
        data.group.data.entries.unshift({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: {
            unitName: unit.name, unitUid: unit.uid, camp: unit.camp,
            skillName: '癫', note, floatText: '🤪', floatUid: unit.uid
        } });
        return;
    }
    if (data.log) pushSkillAnnounce(data.log, unit, '癫', note, { floatText: '🤪', floatUid: unit.uid });
}

export const crazyHandler = {
    fields: {},
    install({ eventBus, A, B, decl }) {
        // 每个来源只发一份：周颠自带「癫」，空智偷学后另有自己的一份「癫」，两份可同时在场
        //   （decl.stolenBy 由 341 偷学时传入）——各自用来源表判重，互不占用
        const all = [...A, ...B];
        const sourceKey = decl.name;
        const sourceLabel = decl.stolenBy ? `偷·${decl.stolenBy}` : decl.name;
        const sourceExists = all.some(u => u.alive && crazySources(u) && crazySources(u)[sourceKey]);
        if (!sourceExists) {
            const holder = all.find(u => u.name === decl.name && u.alive);
            if (holder) {
                grantCrazy(holder, sourceKey, sourceLabel);
            }
        }

        // ① 选敌随机（不分敌友）
        registerSettlementHook({
            when: SIGNAL_TYPES.BEFORE_SELECT_TARGET,
            priority: 1, // 极高优先级，直接覆盖随机选敌
            handler: (data) => {
                if (!data.unit || !data.unit.alive || !data.unit.state._isCrazy) return;
                
                // 每次出手前确保必中和无视闪避（防止被额外攻击/连环机制重置）
                data.unit.state._neverMiss = true;
                data.unit.state._ignoreDodge = true;

                // 周颠本人豁免「不分敌友随机」（2026-11-13 老板拍板：他只是有 buff，不是真蠢）：
                //   癫在他身上只保留「传染」一条，攻击走正常选敌（打敌人），命中后仍把癫传出去。
                //   必中 / 无视闪避 / 无视遮挡（core/210 isCrazyHost）照常保留——这是癫给源头的真正面。
                //   传染后的持有者（被传染者）没有豁免，照样随机打。
                if (data.unit.name === decl.name) return;

                // V1.1.2：候选池统一走 core/207 出口，内部固定含 canBeTargeted + 全部引擎级过滤器，
                //   这里不再自己拼池、也不再显式跑过滤链（技能侧不记得「要过滤」也不会漏）。
                const rng = getBattleRng();
                const pool = buildTargetCandidates(data.unit, [data.allySide, data.enemySide], { rng });
                if (pool.length > 0) {
                    data.declaration.targetResult = pool[rng.nextInt(0, pool.length - 1)];
                }
            }
        });

        // ② 攻击后：先落出手开场白（进本击攻击组），再处理传染
        registerSettlementHook({
            when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
            priority: 1, // 最开始处理，免得死人
            handler: (data) => {
                const unit = data.unit;
                if (!unit || !unit.alive || !unit.state._isCrazy) return;
                pushCrazyOpening(data, unit);
                const target = data.target;
                if (target && target.alive && target.uid !== unit.uid) {
                    // 免疫控制者（寒离飒等）不吃「癫」：传染被挡，癫留在本人身上
                    if (isCCImmune(target)) {
                        if (data.log) pushSkillAnnounce(data.log, unit, '癫', `🤪 ${unit.name} 想传染「癫」给 ${target.name}，但对方免疫控制，传染失败`, { floatText: '🛡️', floatUid: target.uid });
                        return;
                    }
                    const mine = crazyLabels(unit).join('/');
                    // 互斥：对方已有「癫」就不再接收（来源可以不同，同时在场但不叠加）
                    if (!moveCrazy(unit, target)) {
                        if (data.log) pushSkillAnnounce(data.log, unit, '癫', `🤪 ${unit.name} 想把「癫·${mine}」传给 ${target.name}，但对方已带「癫·${crazyLabels(target).join('/')}」，这份癫留在 ${unit.name} 身上`, { floatText: '🤪', floatUid: unit.uid });
                        return;
                    }
                    if (data.log) pushSkillAnnounce(data.log, unit, '癫', `🤪 ${unit.name} 将「癫·${mine}」传染给了 ${target.name}`, { floatText: '🤪', floatUid: target.uid });
                }
            }
        });

        // ②-b 免疫分支不建攻击组（core/209 走 IMMUNE 分支后发本信号），开场白只能落日志，
        //     紧跟免疫块之后，仍属本击自己这一段。
        registerSettlementHook({
            when: SIGNAL_TYPES.AFTER_ATTACK_IMMUNE,
            priority: 10,
            handler: (data) => {
                const unit = data.unit;
                if (!unit || !unit.alive || !unit.state._isCrazy) return;
                if (isManualAimed(unit)) return;   // 手动指定目标：不播「不分敌友」（2026-11-23 定调）
                // 免疫分支不建攻击组，公告无组可依；打分隔线让它自成一段（同 337 断锤公告）。
                if (data.log) pushSkillAnnounce(data.log, unit, '癫', crazyAttackNote(unit, data.target), { floatText: '🤪', floatUid: unit.uid, needsSeparator: true });
            }
        });

        // ③ 死亡传递
        registerSettlementHook({
            when: SIGNAL_TYPES.ON_UNIT_DEATH,
            priority: 1,
            handler: (data) => {
                for (const dead of (data.deadUnits || [])) {
                    if (!dead.state._isCrazy) continue;
                    const deadLabels = crazyLabels(dead).join('/');
                    const deadSources = { ...(crazySources(dead) || {}) };
                    revokeCrazy(dead);
                    const all = [...data.allySide, ...data.enemySide];
                    // 接收者必须身上没有「癫」（互斥）：死者这份可以整体搬给他
                    const canTake = (u) => !!u && u.alive && u.uid !== dead.uid && !crazySources(u);
                    const moveAll = (to, note) => {
                        for (const [k, v] of Object.entries(deadSources)) grantCrazy(to, k, v);
                        if (data.log) pushSkillAnnounce(data.log, dead, '癫', note, { floatText: '🤪', floatUid: to.uid });
                    };

                    // 1. 找攻击者
                    let killer = null;
                    if (dead.state._killerUid) {
                        killer = all.find(u => u.uid === dead.state._killerUid && canTake(u));
                    }
                    if (killer) {
                        moveAll(killer, `🤪 「癫·${deadLabels}」随着 ${dead.name} 的死亡传给了 ${killer.name}`);
                        continue;
                    }

                    // 2. 找不到可接的攻击者，回周颠
                    const zhouDian = all.find(u => u.name === '周颠' && canTake(u));
                    if (zhouDian) {
                        moveAll(zhouDian, `🤪 「癫·${deadLabels}」找不到可接的攻击者，回到了 ${zhouDian.name} 身上`);
                        continue;
                    }

                    // 3. 周颠也没法接，随机传给一个身上没癫的人
                    const pool = all.filter(u => canTake(u) && canBeTargeted(u));
                    if (pool.length > 0) {
                        const rnd = pool[getBattleRng().nextInt(0, pool.length - 1)];
                        moveAll(rnd, `🤪 周颠已阵亡且攻击者也带癫，「癫·${deadLabels}」随机传给了 ${rnd.name}`);
                        continue;
                    }
                    // 4. 全场都带癫了：这份癫无处可去，随死者消散（不再覆盖别人）
                    if (data.log) pushSkillAnnounce(data.log, dead, '癫', `🤪 ${dead.name} 的「癫·${deadLabels}」无人可接（全场都已带癫），随之消散`, { floatText: '🤪', floatUid: dead.uid });
                }
            }
        });
    }
};

registerMechanicHandler(MECHANIC_TYPES.CRAZY, crazyHandler);