// modules/340-common-mech-disciples.js — M97 机制弟子：拼命 / 木桩 / 防化
//   content/001 的 characters.<弟子名>.mechanics 顶层声明 → core/15 安装期按 type 查本文件注册的 handler。
// V1.1.0 | 2026-11-21 拼命改禁疗（统一读 CONFIG.HEAL_REDUCE_MULT=减疗33%）+ 每 5% 血一层攻；木桩 atk×200% 入防；防化拦毒回 5%
// V1.1.1 | 2026-11-22 木桩代受修真雷:旧钩子读恒null的targetResult从未生效,改registerTargetFilter(同列候选换桩)
export const VER = 'modules/340-common-mech-disciples.js V1.1.1';

import { registerSettlementHook, EFFECT_TYPES, EXECUTION_LAYER as L } from '../infra/101-event-bus.js';
import { registerMechanicHandler } from '../core/219-mechanic-registry.js';
import { SIGNAL_TYPES, MECHANIC_TYPES, CAMP_TYPES, FACT_TYPES } from '../infra/106-battle-enums.js';
import { getStat, addMod, removeModsByGroup, setPoisonBlockedHook } from '../core/214-battle-shared.js';
import { canBeTargeted } from '../core/203-battle-utils.js';
import { registerTargetFilter } from '../core/207-target-strategies.js';

const allOf = (data) => [...((data && data.A) || []), ...((data && data.B) || [])];
const findByName = (data, name) => allOf(data).find(u => u.name === name) || null;
const teamOf = (data, camp) => ((camp === CAMP_TYPES.ALLY ? (data && data.A) : (data && data.B)) || []);

// ---------- 拼命弟子：禁疗（统一减疗 33%）+ 每损失 5% 生命永久 +10% 攻击 ----------
export const desperateHandler = {
    fields: {},
    install({ decl }) {
        const refresh = (data) => {
            if (!data) return;
            const self = findByName(data, decl.name);
            if (!self || !self.alive) return;
            self.state._healBan = true;                // core/214 统一打折块读 CONFIG.HEAL_REDUCE_MULT（减疗 33%）
            const maxHp = getStat(self, 'maxHp') || 1;
            const lostPct = Math.max(0, (maxHp - self.hp) / maxHp);
            const stacks = Math.floor(lostPct * 20 + 1e-9);   // 每满 5% 一层
            if (stacks === (self.state._desperateStacks || 0)) return;
            self.state._desperateStacks = stacks;
            // addMod 同 group 不覆盖：先清旧乘率再按当前层数重挂，避免重复叠乘
            removeModsByGroup(self, 'desperate');
            if (stacks > 0) {
                addMod(self, 'atk', { value: 0.1 * stacks, op: 'mul', group: 'desperate', source: '拼命' });
                if (data.log) {
                    data.log.push({
                        factType: FACT_TYPES.DESPERATE_APPLY,
                        data: {
                            unitUid: self.uid, unitName: self.name, camp: self.camp,
                            field: 'atk', op: 'mul', ratio: 0.1 * stacks, group: 'desperate', reason: '拼命'
                        }
                    });
                }
            }
        };
        registerSettlementHook({ when: 'afterDamageApplied', priority: L.AFTER_DAMAGE_APPLIED.REBOUND, handler: refresh });
        registerSettlementHook({ when: SIGNAL_TYPES.ON_ROUND_START, priority: L.ROUND_START.XUANMING_POISON, handler: refresh });
    }
};

// ---------- 木桩弟子：攻击力的 200% 并入防御；同列队友被选中时，改由木桩承受这一击 ----------
//   2026-11-21 老板口径：不做「50% 分摊 + 二次防御结算」那套数学——直接把目标换成木桩，
//   伤害按木桩的高防正常结算，战报天然正确，也不需要事后补扣/补奶。
export const woodenDummyHandler = {
    fields: {},
    install({ A, B, decl }) {
        const myTeam = decl.camp === CAMP_TYPES.ALLY ? (A || []) : (B || []);
        const self0 = myTeam.find(u => u.name === decl.name);
        // 攻击归零、攻击力的 200% 并入基础防御（getStat 读 _baseAtk/_baseDef）
        if (self0 && self0.state) {
            const atk = self0.state._baseAtk ?? getStat(self0, 'atk');
            self0.state._baseAtk = 0;
            self0.state._baseDef = (self0.state._baseDef ?? getStat(self0, 'def')) + atk * 2;
        }
        registerTargetFilter('woodenDummyShare', (unit, candidates) => {
            const team = (decl.camp === CAMP_TYPES.ALLY ? (A || []) : (B || []));
            const self = team.find(u => u.name === decl.name);
            if (!self || !self.alive || self.pos == null) return null;
            const pool = Array.isArray(candidates) ? candidates : [];
            // 木桩不在合法候选池（近战裁前排等）就不代受——不把后排塞进近战池破硬规则
            if (!pool.some(c => c && c.uid === self.uid)) return null;
            const sameCol = pool.filter(c => c && c !== self && c.pos != null && (c.pos - 1) % 3 === (self.pos - 1) % 3);
            if (sameCol.length === 0) return null;
            //   改走 core/07 过滤注册面：同列队友的候选位原地换成木桩，策略选中谁就打谁——选中同列=打木桩。
            return pool.map(c => sameCol.includes(c) ? self : c);
        });
    }
};

// ---------- 防化弟子：全场毒素无效化；每次拦毒给明教全体回 5% 最大生命 ----------
export const antiPoisonHandler = {
    fields: {},
    install({ decl }) {
        // 本阵营全体免疫毒（含自己）：331 dotTick / 319 寒毒 / 339 蹦蹦毒 四个消费点都认 _immunePoison
        const markImmune = (data) => {
            if (!data) return;
            const self = findByName(data, decl.name);
            if (!self || !self.alive) return;
            teamOf(data, decl.camp).forEach(u => { if (u.alive) u.state._immunePoison = true; });
        };
        // 先于毒结算（priority 比玄冥毒小 1）：本回合开始前就把免疫挂上，毒一次都不掉
        registerSettlementHook({ when: SIGNAL_TYPES.ON_ROUND_START, priority: L.ROUND_START.XUANMING_POISON - 1, handler: markImmune });
        registerSettlementHook({ when: 'afterDamageApplied', priority: L.AFTER_DAMAGE_APPLIED.REBOUND, handler: markImmune });

        // 毒被拦下（毒已抹掉、抑疗随之消失）→ 每拦一次，明教全体各回 5% 最大生命
        setPoisonBlockedHook((victim, ctx) => {
            if (!ctx || !ctx.A || !ctx.B) return;
            const self = allOf(ctx).find(u => u.name === decl.name);
            if (!self || !self.alive) return;
            self.state._antiPoisonPulse = Date.now();          // render/403 挂 🧪 1 秒
            const declarations = ctx.declarations;
            if (!declarations) return;
            teamOf(ctx, decl.camp).forEach(u => {
                if (!u.alive) return;
                const maxHp = getStat(u, 'maxHp') || 1;
                const heal = Math.max(1, Math.round(maxHp * 0.05));
                declarations.push({
                    type: EFFECT_TYPES.HEAL,
                    value: heal,
                    source: self,
                    target: u,
                    factType: FACT_TYPES.HEAL,
                    factData: { label: '防化转化', icon: '🧪' },
                    logText: `🧪 防化弟子拦下 ${victim ? victim.name : '队友'} 身上的毒：${u.name} 回复 ${heal} 点生命`
                });
            });
        });
    }
};

registerMechanicHandler(MECHANIC_TYPES.WOODEN_DUMMY, woodenDummyHandler);
registerMechanicHandler(MECHANIC_TYPES.DESPERATE, desperateHandler);
registerMechanicHandler(MECHANIC_TYPES.ANTI_POISON, antiPoisonHandler);
