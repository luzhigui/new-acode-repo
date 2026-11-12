// modules/333-elite-mingjiao-crazy.js — 周颠·癫（普通兵机制）
// 规则：初始携带「癫」，攻击随机不分敌友，命中后传给被打者；
// 死亡时传给攻击者，找不到给周颠，周颠死了随机传。
// 带「癫」时：必中，且无视目标闪避（从而不会触发闪避反击）。
export const VER = 'modules/333-elite-mingjiao-crazy.js V1.1.3';

import { registerSettlementHook, EXECUTION_LAYER as L } from '../infra/101-event-bus.js';
import { registerMechanicHandler } from '../core/219-mechanic-registry.js';
import { SIGNAL_TYPES, MECHANIC_TYPES, FACT_TYPES } from '../infra/106-battle-enums.js';
import { getBattleRng } from '../core/214-battle-shared.js';
import { canBeTargeted } from '../core/203-battle-utils.js';
import { buildTargetCandidates } from '../core/207-target-strategies.js';
import { pushSkillAnnounce } from './305-elite-helpers.js';

// 统一管理癫的赋予与撤销，同时控制必中与无视闪避
function grantCrazy(unit) {
    if (!unit || !unit.alive) return;
    unit.state._isCrazy = true;
    unit.state._neverMiss = true;
    unit.state._ignoreDodge = true;
}
function revokeCrazy(unit) {
    if (!unit) return;
    unit.state._isCrazy = false;
    unit.state._neverMiss = false;
    unit.state._ignoreDodge = false;
}

function crazyAttackNote(unit, target) {
    return `🤪 ${unit.name} 受到「癫」的影响，不分敌友地向 ${target ? target.name : '?'} 发起攻击！`;
}

// 出手开场白必须落进本击自己的攻击组：core/209 先 log.push(group) 再发 AFTER_DAMAGE_APPLIED。
//   早期挂在 AFTER_SELECT_TARGET（组建成之前）会写进日志尾部 → 渲染成上一个攻击组的尾巴。
function pushCrazyOpening(data, unit) {
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
        // 如果场上没有任何人带有「癫」，且周颠存活，则周颠自动拾起「癫」
        const all = [...A, ...B];
        const hasCrazy = all.some(u => u.alive && u.state._isCrazy);
        if (!hasCrazy) {
            const zhouDian = all.find(u => u.name === decl.name && u.alive);
            if (zhouDian) {
                grantCrazy(zhouDian);
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
                    revokeCrazy(unit);
                    grantCrazy(target);
                    if (data.log) pushSkillAnnounce(data.log, unit, '癫', `🤪 ${unit.name} 将「癫」传染给了 ${target.name}`, { floatText: '🤪', floatUid: target.uid });
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
                    revokeCrazy(dead);

                    // 1. 找攻击者
                    let killer = null;
                    if (dead.state._killerUid) {
                        const all = [...data.allySide, ...data.enemySide];
                        killer = all.find(u => u.uid === dead.state._killerUid && u.alive);
                    }
                    if (killer && killer.uid !== dead.uid) {
                        grantCrazy(killer);
                        if (data.log) pushSkillAnnounce(data.log, dead, '癫', `🤪 「癫」随着 ${dead.name} 的死亡传给了 ${killer.name}`, { floatText: '🤪', floatUid: killer.uid });
                        continue;
                    }

                    // 2. 找不到攻击者，回周颠
                    const zhouDian = [...data.allySide, ...data.enemySide].find(u => u.name === '周颠' && u.alive);
                    if (zhouDian) {
                        grantCrazy(zhouDian);
                        if (data.log) pushSkillAnnounce(data.log, dead, '癫', `🤪 「癫」找不到攻击者，回到了 ${zhouDian.name} 身上`, { floatText: '🤪', floatUid: zhouDian.uid });
                        continue;
                    }

                    // 3. 周颠已死，随机传递
                    const pool = [...data.allySide, ...data.enemySide].filter(u => u.alive && canBeTargeted(u));
                    if (pool.length > 0) {
                        const rnd = pool[getBattleRng().nextInt(0, pool.length - 1)];
                        grantCrazy(rnd);
                        if (data.log) pushSkillAnnounce(data.log, dead, '癫', `🤪 周颠已阵亡，「癫」随机传给了 ${rnd.name}`, { floatText: '🤪', floatUid: rnd.uid });
                    }
                }
            }
        });
    }
};

registerMechanicHandler(MECHANIC_TYPES.CRAZY, crazyHandler);