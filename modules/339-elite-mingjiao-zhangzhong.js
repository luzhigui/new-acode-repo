// modules/339-elite-mingjiao-zhangzhong.js — 明教·五散人 张中「召唤蹦蹦」
// 规则：每回合开始，按 content summonBengBeng.prob（默认 1.0）概率，在己方空位召唤一只蹦蹦
//   （参数全部来自 content 的 summonBengBeng，与谢逊幼狮同口径）。
//   蹦蹦攻击或受击时给对方叠一层寒毒（独立毒账 _bengHanDu，本模块自结算，与寒离飒无关——V1.3.0）。
// 预估约 3400 字节
// V1.2.0 | 2026-11-08 蹦蹦寒毒联动：isBengBeng 标记 + AFTER_DAMAGE_APPLIED 监听，只给敌方叠寒毒
// V1.1.0 | 2026-11-08 加召唤概率：prob<1.0 才掷战斗 RNG，未配置不消耗随机数、保持旧行为
// V1.0.0 | 初版
// V1.2.1 | 2026-11-08 骨架化：占位查找 / 缺参读取 / 血量广播改走 modules/305 公共骨架，行为等价。
// V1.3.0 | 2026-11-10 毒归挂毒方（TA 拍板）：蹦蹦毒独立 _bengHanDu 字段+模块内自结算，与寒离飒彻底解耦；
//   三通道挂毒=打蹦蹦/被蹦蹦打/任何伤害击杀蹦蹦（凶手读 _killerUid 账，溅射/DOT/反弹全覆盖）；
//   抑疗（寒毒抑疗削减）与格上 ❄️ 图标同享；毒账随受害者走，扣到回合数耗尽为止，跟三家死活无关。
export const VER = 'modules/339-elite-mingjiao-zhangzhong.js V1.3.0';

import { registerSettlementHook, EFFECT_TYPES, EXECUTION_LAYER as L } from '../infra/101-event-bus.js';
import { registerMechanicHandler } from '../core/219-mechanic-registry.js';
import { SIGNAL_TYPES, MECHANIC_TYPES, CAMP_TYPES, FACT_TYPES, ROLE_TYPES, SKILL_CUE_KINDS } from '../infra/106-battle-enums.js';
import { getBattleRng } from '../core/214-battle-shared.js';
import { recordHpAudit } from '../core/214-battle-shared.js';
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

        // 蹦蹦攻击或受击时，给对方叠一层寒毒（2026-11-08 建钩；2026-11-10 V1.3.0 毒归挂毒方）
        //   只给敌方挂：unit.camp === target.camp 直接跳过（防惑心换位/友军互殴误挂）。
        //   毒账用蹦蹦专属 _bengHanDu（不与寒离飒 _hlsHanDu 混桶），结算在本模块下方 ON_ROUND_START。
        //   致死一击不在此挂（避免与 ON_UNIT_DEATH 凶手毒双挂）：蹦蹦被打到 _pendingDeath 时让路给死亡钩子。
        registerSettlementHook({
            when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
            priority: L.AFTER_DAMAGE_APPLIED.SHIELD_DEFEND + 1,   // 30~35 之间的空档（31），不抢既有钩子
            handler: (data) => {
                const { unit, target, log } = data;
                if (!unit || !target) return;
                if (unit.camp === target.camp) return;                                   // 只给敌方挂毒
                if (!unit.isBengBeng && !target.isBengBeng) return;                       // 本击至少一方是蹦蹦
                if (target.isBengBeng && target.state._pendingDeath) return;              // 致死一击 → 死亡钩子管
                const victim = unit.isBengBeng ? target : unit;                           // 谁被挂毒：蹦蹦的对手
                if (!victim.alive) return;

                const duration = params.poisonDuration ?? 3;
                const dotPercents = params.poisonDot || [0.04];
                const prev = victim.state._bengHanDu;
                const stacks = (prev && prev.remaining > 0 && prev.stacks > 0 ? prev.stacks : 0) + 1;
                victim.state._bengHanDu = { remaining: duration, dotPercents: [...dotPercents], stacks };

                if (log) {
                    const beng = unit.isBengBeng ? unit : target;
                    pushSkillAnnounce(log, beng, '蹦蹦寒气',
                        `❄️ 蹦蹦的寒气侵入 ${victim.name}（${stacks} 层）`,
                        { floatText: '❄️', floatUid: victim.uid });
                }
            }
        });

        // 蹦蹦毒结算（2026-11-10 毒归挂毒方，TA 拍板）：回合开始独立扣血，不依赖寒离飒在不在。
        //   钩子随张中编入战场安装、战斗期常驻；毒账在受害者身上（_bengHanDu），扣到回合数耗尽为止，
        //   张中/蹦蹦/寒离飒死活都不影响扣血。结算口径照抄 319 寒毒（floor(maxHp×档位×层数)，不衰减）。
        registerSettlementHook({
            when: SIGNAL_TYPES.ON_ROUND_START,
            priority: L.ROUND_START.XUANMING_POISON + 2,   // 319 寒毒(+1) 同窗口之后
            handler: (data) => {
                const allUnits = [...(data.A || []), ...(data.B || [])];
                allUnits.forEach(u => {
                    if (!u.alive) return;
                    const st = u.state._bengHanDu;
                    if (!st || st.remaining <= 0) return;
                    st.remaining--;
                    const stacks = st.stacks || 1;
                    const dot = Math.floor(u.maxHp * (st.dotPercents[0] || 0) * stacks);
                    if (dot <= 0) return;
                    data.declarations.push({ type: EFFECT_TYPES.ROUND_STAT_GRANT, field: 'hp', delta: -dot, target: u, source: self, reason: '蹦蹦寒毒' });
                    if (data.log) pushSkillAnnounce(data.log, self, '蹦蹦寒气',
                        `❄️ 蹦蹦寒毒发作：${u.name} 损失 ${dot} 点生命${stacks > 1 ? `（${stacks} 层）` : ''}`,
                        { floatText: '❄️', floatUid: u.uid });
                    recordHpAudit(u, 'bengHanDuDot', -dot, '蹦蹦寒毒');
                });
            }
        });

        // 致死毒（2026-11-10 TA 拍板：任何伤害打死蹦蹦，正主必中毒）：
        //   凶手唯一来源 = _killerUid（core/214 伤害归零时记账，溅射/DOT/反弹都带 source 覆盖；
        //   无来源的清场死亡不挂）。致死主击已在主钩子让路，这里单点负责，同击不会双挂。
        //   阵营判断按死者 camp 对比，不用 allySide 语义（履历 51 该载荷有坑）。
        registerSettlementHook({
            when: SIGNAL_TYPES.ON_UNIT_DEATH,
            priority: L.ON_UNIT_DEATH.HOLY_FIRE + 1,   // 圣火复活判定之后：被救回的蹦蹦不算死
            handler: (data) => {
                for (const dead of (data.deadUnits || [])) {
                    if (!dead || !dead.isBengBeng || !dead.state || !dead.state._killerUid) continue;
                    const killer = [...(data.allySide || []), ...(data.enemySide || [])]
                        .find(u => u && u.uid === dead.state._killerUid);
                    if (!killer || !killer.alive) continue;
                    if (killer.camp === dead.camp) continue;                             // 友方误伤不挂
                    const duration = params.poisonDuration ?? 3;
                    const dotPercents = params.poisonDot || [0.04];
                    const prev = killer.state._bengHanDu;
                    const stacks = (prev && prev.remaining > 0 && prev.stacks > 0 ? prev.stacks : 0) + 1;
                    killer.state._bengHanDu = { remaining: duration, dotPercents: [...dotPercents], stacks };
                    if (data.log) pushSkillAnnounce(data.log, dead, '蹦蹦寒气',
                        `❄️ ${killer.name} 击杀蹦蹦，寒气反噬（${stacks} 层）`,
                        { floatText: '❄️', floatUid: killer.uid });
                }
            }
        });
    }
};

registerMechanicHandler(MECHANIC_TYPES.SUMMON_BENGBENG, summonBengBengHandler);
