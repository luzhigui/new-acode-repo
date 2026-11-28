// modules/343-common-mech-poison-monk.js — 空闻（业火轮回） / 班淑娴（妒心奇毒）
// 定位：M104 弱精英随机混入（modules/330 的 SIX_SECTS_WEAK_ELITE_POOLS），不进关卡固定池、不改 squadVariants。
// 玩家口径（网页端任务书 2026-11-28）：
//   空闻：任一角色阵亡 → 业火焚身，全场存活单位按「当前生命 10%」掉血；累计引爆 3 次后觉醒，
//         攻击 +50%（永久），此后每次攻击附带破防 30。
//   班淑娴：每回合开始锁定敌方攻击最高者下奇毒（防御 -20%，之后每回合扣 4% 最大生命，持续 2 回合）；
//         何太冲阵亡 → 自身攻击永久 +50%，全场敌人一起染毒。
// 与任务书的实现差异（都是引擎既有口径，不改变玩家可感知效果）：
//   ① 业火不走 declarations：ON_UNIT_DEATH 是纯通知广播，没有任何一方消费 declarations（原写法等于不生效）；
//      改为直接 applyStatChange + emitHpChange，格子血条/日志才同步（同 342 魔化谢逊真伤口径）。
//   ② 毒发补 emitHpChange：否则掉的是引擎血量、格子血条不刷新。
//   ③ 破防取 min(30, 当前防御)：防御已为 0 时不发空词条（同 core/203 战士破防口径）。
//   ④ 觉醒 / 丧夫狂怒都按 mod.group 查重：install 每回合重跑，靠 state 标记会重复叠加（渡厄踩过的坑）。
// V1.0.0 | 2026-11-28 首次实装（M104 精英混入：空闻 / 班淑娴）
export const VER = 'modules/343-common-mech-poison-monk.js V1.0.0';

import { registerSettlementHook, EXECUTION_LAYER as L, EFFECT_TYPES } from '../infra/101-event-bus.js';
import { registerMechanicHandler } from '../core/219-mechanic-registry.js';
import { SIGNAL_TYPES, MECHANIC_TYPES, CAMP_TYPES } from '../infra/106-battle-enums.js';
import { addMod, applyStatChange, getStat, emitHpChange } from '../core/214-battle-shared.js';
import { pushSkillAnnounce } from './305-elite-helpers.js';

// ── 数值唯一来源（改数值只改这里）──
const KONG_WEN_FIRE_RATE = 0.10;       // 业火：当前生命 10%
const KONG_WEN_AWAKEN_COUNT = 3;       // 引爆 3 次觉醒
const KONG_WEN_AWAKEN_ATK = 0.5;       // 觉醒攻击 +50%
const KONG_WEN_BREAK_DEF = 30;         // 觉醒后每刀破防 30
const DU_JI_DEF_DOWN = -0.2;           // 妒心奇毒：防御 -20%
const DU_JI_DOT_RATE = 0.04;           // 毒发：每回合 4% 最大生命
const DU_JI_ROUNDS = 2;                // 毒持续 2 回合
const DU_JI_RAGE_ATK = 0.5;            // 丧夫狂怒：攻击 +50%

// 永久词条防重：按 addMod 的 group 查（不许用 state 标记，clone 会丢）
function hasModGroup(unit, stat, group) {
    return ((unit && unit._mods && unit._mods[stat]) || []).some(m => m && m.group === group);
}

// ── 空闻：业火轮回 ──
export const kongWenFireHandler = {
    fields: {},
    install({ A, B, decl }) {
        const selfTeam = decl.camp === CAMP_TYPES.ALLY ? A : B;
        const self = (selfTeam || []).find(u => u && u.alive && u.name === decl.name);
        if (!self) return;

        // 任一角色阵亡 → 业火焚身
        registerSettlementHook({
            when: SIGNAL_TYPES.ON_UNIT_DEATH,
            priority: 35,
            handler: (data) => {
                if (!self.alive) return;
                if (!data || !data.deadUnits || data.deadUnits.length === 0) return;
                if (self.state._isYeHuoProcessing) return;   // 同帧防重入（业火自己打死人不再套娃）
                self.state._isYeHuoProcessing = true;
                try {
                    const allAlive = [...(A || []), ...(B || [])].filter(u => u && u.alive);
                    const parts = [];
                    for (const u of allAlive) {
                        const dmg = Math.floor(u.hp * KONG_WEN_FIRE_RATE);
                        if (dmg <= 0) continue;
                        const before = Math.round(u.hp);
                        applyStatChange(u, 'hp', -dmg, self, '业火焚身');
                        emitHpChange(u);
                        parts.push(`${u.name}（${before} → ${Math.round(u.hp)}）`);
                    }
                    self.state._yeHuoCount = (self.state._yeHuoCount || 0) + 1;
                    pushSkillAnnounce(data.log, self, '业火轮回',
                        `🔥 业火引爆！全场损失当前生命 10%（第 ${self.state._yeHuoCount} 次）${parts.length ? '：' + parts.join('、') : ''}`,
                        { floatText: '🔥', floatUid: self.uid, needsSeparator: true });

                    // 觉醒：攻击 +50%（按 group 查重，只挂一次）
                    if (self.state._yeHuoCount >= KONG_WEN_AWAKEN_COUNT && !self.state._isKongWenAwakened) {
                        self.state._isKongWenAwakened = true;
                        if (!hasModGroup(self, 'atk', 'yeHuoAwake')) {
                            addMod(self, 'atk', {
                                source: '金刚降魔', value: KONG_WEN_AWAKEN_ATK,
                                ttl: 'permanent', op: 'mul', group: 'yeHuoAwake'
                            });
                        }
                        pushSkillAnnounce(data.log, self, '金刚降魔',
                            '😡 空闻不再慈悲：攻击力 +50%，此后每次攻击附带破防！',
                            { floatText: '😡', floatUid: self.uid, needsSeparator: true });
                    }
                } finally {
                    self.state._isYeHuoProcessing = false;
                }
            }
        });

        // 觉醒后：每次攻击附带破防（走统一裁定入口，不直改属性）
        registerSettlementHook({
            when: SIGNAL_TYPES.BEFORE_DAMAGE_CALC,
            priority: L.BEFORE_DAMAGE_CALC.TRUE_DMG - 5,
            handler: (data) => {
                if (!self.alive || !self.state._isKongWenAwakened) return;
                if (!data || data.unit !== self || !data.target) return;
                const defNow = Math.floor(getStat(data.target, 'def'));
                const reduce = Math.min(KONG_WEN_BREAK_DEF, defNow);
                if (reduce <= 0) return;   // 防御已归零：不发空词条
                if (!data.declarations) data.declarations = [];
                data.declarations.push({
                    type: EFFECT_TYPES.BREAK_DEF, value: reduce, source: self, target: data.target,
                    factData: { attackerName: self.name, targetName: data.target.name, reduce }
                });
            }
        });
    }
};

// ── 班淑娴：妒心奇毒 ──
export const banShuXianPoisonHandler = {
    fields: {},
    install({ A, B, decl }) {
        const selfTeam = decl.camp === CAMP_TYPES.ALLY ? A : B;
        const enemyTeam = decl.camp === CAMP_TYPES.ALLY ? B : A;
        const self = (selfTeam || []).find(u => u && u.alive && u.name === decl.name);
        if (!self) return;

        const poison = (target, data) => {
            if (!target || !target.alive) return;
            target.state._duJiPoison = { rounds: DU_JI_ROUNDS };
            addMod(target, 'def', {
                source: '妒心奇毒', value: DU_JI_DEF_DOWN, ttl: 'round', op: 'mul', group: 'duJiDefDown'
            });
            pushSkillAnnounce(data && data.log, self, '妒心奇毒',
                `🧪 班淑娴嫉妒最强者，给 ${target.name} 下了无解奇毒！（防御 -20%）`,
                { floatText: '🧪', floatUid: target.uid, needsSeparator: true });
        };

        // 每回合开始：锁敌方攻击最高者
        registerSettlementHook({
            when: SIGNAL_TYPES.ON_ROUND_START,
            priority: 25,
            handler: (data) => {
                if (!self.alive) return;
                const validEnemies = (enemyTeam || []).filter(u => u && u.alive);
                if (validEnemies.length === 0) return;
                validEnemies.sort((a, b) => getStat(b, 'atk') - getStat(a, 'atk'));
                poison(validEnemies[0], data);
            }
        });

        // 毒发：回合收尾结算（ROUND_SETTLED 每回合只发一次；ON_ROUND_END 是每次出手都发，不能用）
        registerSettlementHook({
            when: SIGNAL_TYPES.ROUND_SETTLED,
            priority: 40,
            handler: (data) => {
                (enemyTeam || []).forEach((u) => {
                    const st = u && u.state && u.state._duJiPoison;
                    if (!u || !u.alive || !st || st.rounds <= 0) return;
                    st.rounds -= 1;
                    const dmg = Math.floor(u.maxHp * DU_JI_DOT_RATE);
                    if (dmg > 0) {
                        const before = Math.round(u.hp);
                        applyStatChange(u, 'hp', -dmg, self, '妒心奇毒发作');
                        emitHpChange(u);
                        pushSkillAnnounce(data && data.log, self, '妒心奇毒',
                            `🧪 ${u.name} 受到奇毒侵蚀，损失 ${dmg} 点生命（${before} → ${Math.round(u.hp)}）`,
                            { floatText: '🧪', floatUid: u.uid });
                    }
                    if (st.rounds <= 0) u.state._duJiPoison = null;
                });
            }
        });

        // 夫妻联动：何太冲阵亡 → 狂怒 + 全场染毒
        registerSettlementHook({
            when: SIGNAL_TYPES.ON_UNIT_DEATH,
            priority: 30,
            handler: (data) => {
                if (!self.alive) return;
                const dead = (data && data.deadUnits) || [];
                if (!dead.some(u => u && u.name === '何太冲')) return;
                if (!hasModGroup(self, 'atk', 'kuFuRage')) {
                    addMod(self, 'atk', {
                        source: '丧夫狂怒', value: DU_JI_RAGE_ATK, ttl: 'permanent', op: 'mul', group: 'kuFuRage'
                    });
                }
                (enemyTeam || []).forEach(u => { if (u && u.alive) poison(u, data); });
                pushSkillAnnounce(data && data.log, self, '丧夫狂怒',
                    '💢 何太冲死了！班淑娴陷入狂怒：攻击 +50%，全场染毒！',
                    { floatText: '💢', floatUid: self.uid, needsSeparator: true });
            }
        });
    }
};

registerMechanicHandler(MECHANIC_TYPES.KONG_WEN_FIRE, kongWenFireHandler);
registerMechanicHandler(MECHANIC_TYPES.BAN_SHU_XIAN_POISON, banShuXianPoisonHandler);
