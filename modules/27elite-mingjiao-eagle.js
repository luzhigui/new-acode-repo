// modules/27elite-mingjiao-eagle.js — 明教精英「雄鹰」：组件工厂（carry 海克斯召唤·飞行）
// V1.0.1 | ~4000 bytes | 2026-10-19 恢复行动力报幕带 restoreActed 标记：render/38 据此补发 RESTORE_ACTED 舞台动作，
//          让 render/39 把账本 _acted=false 同步进 store 并清 _renderActed 镜像（修「被恢复者格子不绿」）
// V1.0.0 | ~3869 bytes | 2026-10-17 自 modules/27elite-mingjiao.js V7.1.7 拆出（纯搬移，零逻辑改动；组件工厂逐字迁入，集中注册留 barrel）
export const VER = 'modules/27elite-mingjiao-eagle.js V1.0.1';
import { CONFIG } from '../core/01config-5v5-test.js';
import { spawnUnit } from '../core/05battle-horse.js';
import { getBattleRng, addMod } from '../core/13battle-shared.js';
import { eventBus, EXECUTION_LAYER as L } from '../infra/50-event-bus.js';
import { FACT_TYPES, CAMP_TYPES, SIGNAL_TYPES } from '../infra/56-battle-enums.js';
export function createEagleComponent() {
    return {
        name: '雄鹰',
        register(eventBus, A, B, log) {
            const eagle = [...A, ...B].find(u => u.isCarryEagle && u.alive);
            if (!eagle) return;
            const myTeam = eagle.camp === CAMP_TYPES.ALLY ? A : B;
            const spec = CONFIG.BUFFS?.carry?.params?.eagle;
            if (!spec || !spec.female) return;
            const femSpec = spec.female;
            // 飞天态（蝶/蛛/FSM flying）不可被当作正常队友：与 core/11 行动跳过口径一致
            const isFlying = (u) => !!(u.state && (u.state._flyMode === 'butterfly' || u.state._flyMode === 'spider' || u.state._spiderFlying || (u._fsm && u._fsm.is('flying'))));

            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.EAGLE_RESTORE, (data) => {
                const u = data.unit;
                if (!u || !u.isCarryEagle || !u.alive) return;
                if (!data.dmg || data.dmg <= 0) return;
                const pool = myTeam.filter(t => t.alive && t.uid !== u.uid && t.state._acted && !t.isHorse && !isFlying(t));
                if (pool.length > 0) {
                    const pick = pool[getBattleRng().nextInt(0, pool.length - 1)];
                    pick.state._acted = false;
                    if (data.log) data.log.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: {
                        unitName: u.name, unitUid: u.uid, camp: u.camp, skillName: '雄鹰',
                        note: `🦅 雄鹰振翅！${pick.name} 恢复行动力`, floatText: '🦅', floatUid: pick.uid,
                        // 2026-10-19 恢复行动力：引擎只改账本 state._acted，UI 判灰是账本或视图镜像双路取或
                        //   （render/32）——补 restoreActed 标记让 render/38 翻出 RESTORE_ACTED 舞台动作双清
                        restoreActed: true
                    } });
                    return;
                }
                // 无人可恢复 → 召唤白板雌鹰（永久存在，不做数量上限）
                const occupied = new Set(myTeam.filter(t => t.alive).map(t => t.pos));
                const free = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(p => !occupied.has(p));
                if (free.length === 0) return;
                const pos = free[getBattleRng().nextInt(0, free.length - 1)];
                const fem = spawnUnit(myTeam, femSpec.name, femSpec.m, femSpec.role, pos, { atk: femSpec.atk, def: femSpec.def, maxHp: femSpec.maxHp });
                fem.isEagleFemale = true;
                if (data.log) data.log.push({ factType: FACT_TYPES.SUMMON_UNIT, data: { summonName: fem.name, summonUid: fem.uid, pos } });
            });
        }
    };
}

// 殷天正（白眉鹰王·明教·防战·弱精英 m104）：反击 / 反击削敌 / 反击自壮
// ① 鹰爪功：被攻击后 (基础 22% + 老当益壮累计) 概率反击攻击者，伤害×dmgRatio，走 extraRequests 过完整伤害管线
// ② 鹰王威压：殷天正「反击命中」后永久削目标攻/防各 2（addMod 无 ttl = 整局累积，可无限叠加）；普攻命中不触发
// ③ 老当益壮：殷天正「反击命中」后自身永久 +攻/防各 2，并累计反击概率 +2%（反击率封顶 0.9）；普攻命中不触发
// ②③ 的「仅反击」判定靠 core/10 runExtraAttackRequests 执行期写在 yin.state._linkReason 上的 'counterAttack'
