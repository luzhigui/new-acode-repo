// modules/339-elite-mingjiao-zhangzhong.js — 明教·五散人 张中「召唤蹦蹦」
// 规则：每回合开始，按 content summonBengBeng.prob（默认 1.0）概率，在己方空位召唤一只蹦蹦
//   （参数全部来自 content 的 summonBengBeng，与谢逊幼狮同口径）。
//   蹦蹦攻击或受击时给对方叠一层寒毒（结构与 modules/319 寒离飒同形，dot 由寒离飒在场时结算）。
// 预估约 3400 字节
// V1.2.0 | 2026-11-08 蹦蹦寒毒联动：isBengBeng 标记 + AFTER_DAMAGE_APPLIED 监听，只给敌方叠寒毒
// V1.1.0 | 2026-11-08 加召唤概率：prob<1.0 才掷战斗 RNG，未配置不消耗随机数、保持旧行为
// V1.0.0 | 初版
// V1.2.1 | 2026-11-08 骨架化：占位查找 / 缺参读取 / 血量广播改走 modules/305 公共骨架，行为等价。
export const VER = 'modules/339-elite-mingjiao-zhangzhong.js V1.2.1';

import { registerSettlementHook, EXECUTION_LAYER as L } from '../infra/101-event-bus.js';
import { registerMechanicHandler } from '../core/219-mechanic-registry.js';
import { SIGNAL_TYPES, MECHANIC_TYPES, CAMP_TYPES, FACT_TYPES, ROLE_TYPES, SKILL_CUE_KINDS } from '../infra/106-battle-enums.js';
import { getBattleRng } from '../core/214-battle-shared.js';
import { spawnUnit, pickFreePos } from '../core/205-battle-horse.js';

import { pushSkillAnnounce, requireSkillParams } from './305-elite-helpers.js';

export const summonBengBengHandler = {
    fields: {},
    install({ eventBus, A, B, decl }) {
        const selfTeam = decl.camp === CAMP_TYPES.ALLY ? A : B;
        const self = selfTeam.find(u => u.alive && u.name === decl.name);
        if (!self) return;

        const params = requireSkillParams(decl.name, 'summonBengBeng');

        registerSettlementHook({
            when: SIGNAL_TYPES.ON_ROUND_START,
            priority: L.ROUND_START.XIE_SUMMON,
            handler: (data) => {
                if (!self.alive || self.state._pendingDeath) return;
                // 2026-11-08 召唤概率：读 content summonBengBeng.prob（未配置默认 1.0 = 旧行为）。
                //   每回合 100% 必召在残局会形成人海把对面拖死，50% 控强度。
                //   prob < 1.0 才掷骰：未配置时不消耗 RNG，保持旧随机序列逐字节一致。
                const prob = params.prob != null ? params.prob : 1.0;
                if (prob < 1.0 && getBattleRng().next() >= prob) return;
                const myTeam = self.camp === CAMP_TYPES.ALLY ? data.A : data.B;
                // 落位走 core/205 pickFreePos（每方各自占 1-9，随机取一格；无空位返回 null）
                const pos = pickFreePos(myTeam, getBattleRng());
                if (pos == null) return;
                const unit = spawnUnit(myTeam, '蹦蹦', params.m, ROLE_TYPES.WARRIOR, pos,
                    { atk: params.atk, def: params.def, maxHp: params.maxHp, skipRoleBonus: true });
                unit.isBengBeng = true;   // 蹦蹦专属标记，供寒毒监听判定
                data.log.push({
                    factType: FACT_TYPES.SUMMON_UNIT,
                    data: {
                        summonName: unit.name, summonUid: unit.uid, pos, byName: self.name, byUid: self.uid,
                        // 演出：从张中格到空位留一串残影、落点轻闪（fx/619 只读定位，不影响召唤）
                        cue: (self.pos != null)
                            ? { kind: SKILL_CUE_KINDS.SUMMON_MOVE, from: { uid: self.uid, camp: self.camp, pos: self.pos }, to: { uid: unit.uid, camp: unit.camp, pos } }
                            : null
                    }
                });
            }
        });

        // 蹦蹦攻击或受击时，给对方叠一层寒毒（2026-11-08）
        //   只给敌方挂：unit.camp === target.camp 直接跳过（防惑心换位/友军互殴误挂）。
        //   寒毒结构与 modules/319 寒离飒同形 { remaining, dotPercents, stacks }；
        //   dot 结算在 319 的 ON_ROUND_START（寒离飒在场才跑，不在场只挂 ❄️ 图标不结算）。
        registerSettlementHook({
            when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
            priority: L.AFTER_DAMAGE_APPLIED.SHIELD_DEFEND + 1,   // 30~35 之间的空档（31），不抢既有钩子
            handler: (data) => {
                const { unit, target, log } = data;
                if (!unit || !target) return;
                if (unit.camp === target.camp) return;                                   // 只给敌方挂毒
                if (!unit.isBengBeng && !target.isBengBeng) return;                       // 本击至少一方是蹦蹦
                const victim = unit.isBengBeng ? target : unit;                           // 谁被挂毒：蹦蹦的对手
                if (!victim.alive) return;

                const duration = params.poisonDuration ?? 3;
                const dotPercents = params.poisonDot || [0.04];
                const prev = victim.state._hlsHanDu;
                const stacks = (prev && prev.remaining > 0 && prev.stacks > 0 ? prev.stacks : 0) + 1;
                victim.state._hlsHanDu = { remaining: duration, dotPercents: [...dotPercents], stacks };

                if (log) {
                    const beng = unit.isBengBeng ? unit : target;
                    pushSkillAnnounce(log, beng, '蹦蹦寒气',
                        `❄️ 蹦蹦的寒气侵入 ${victim.name}（${stacks} 层）`,
                        { floatText: '❄️', floatUid: victim.uid });
                }
            }
        });
    }
};

registerMechanicHandler(MECHANIC_TYPES.SUMMON_BENGBENG, summonBengBengHandler);
