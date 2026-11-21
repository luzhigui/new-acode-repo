// modules/340-common-mech-disciples.js — M97 机制弟子：拼命 / 防化（木桩待定，见文件末）
//   content/001 的 characters.<弟子名>.mechanics 顶层声明 → core/15 安装期按 type 查本文件注册的 handler。
export const VER = 'modules/340-common-mech-disciples.js V1.0.0';

import { registerSettlementHook, EFFECT_TYPES, EXECUTION_LAYER as L } from '../infra/101-event-bus.js';
import { registerMechanicHandler } from '../core/219-mechanic-registry.js';
import { SIGNAL_TYPES, MECHANIC_TYPES, CAMP_TYPES, FACT_TYPES } from '../infra/106-battle-enums.js';
import { getStat, addMod, removeModsByGroup, setPoisonBlockedHook } from '../core/214-battle-shared.js';
import { canBeTargeted } from '../core/203-battle-utils.js';

const allOf = (data) => [...((data && data.A) || []), ...((data && data.B) || [])];
const findByName = (data, name) => allOf(data).find(u => u.name === name) || null;
const teamOf = (data, camp) => ((camp === CAMP_TYPES.ALLY ? (data && data.A) : (data && data.B)) || []);

// ---------- 拼命弟子：免疫治疗 + 每损失 10% 生命永久 +10% 攻击 ----------
export const desperateHandler = {
    fields: {},
    install({ decl }) {
        const refresh = (data) => {
            if (!data) return;
            const self = findByName(data, decl.name);
            if (!self || !self.alive) return;
            self.state._noHeal = true;                 // core/214 的 hp 正向落账统一拒疗
            const maxHp = getStat(self, 'maxHp') || 1;
            const lostPct = Math.max(0, (maxHp - self.hp) / maxHp);
            const stacks = Math.floor(lostPct * 10 + 1e-9);   // 每满 10% 一层
            if (stacks === (self.state._desperateStacks || 0)) return;
            self.state._desperateStacks = stacks;
            // addMod 同 group 不覆盖：先清旧乘率再按当前层数重挂，避免重复叠乘
            removeModsByGroup(self, 'desperate');
            if (stacks > 0) {
                addMod(self, 'atk', { value: 0.1 * stacks, op: 'mul', group: 'desperate', source: '拼命' });
                if (data.log) {
                    data.log.push({
                        factType: FACT_TYPES.STAT_CHANGE_APPLY,
                        data: {
                            unitUid: self.uid, unitName: self.name, stat: 'atk',
                            value: 0.1 * stacks, op: 'mul', group: 'desperate', reason: '拼命'
                        }
                    });
                }
            }
        };
        registerSettlementHook({ when: 'afterDamageApplied', priority: L.AFTER_DAMAGE_APPLIED.REBOUND, handler: refresh });
        registerSettlementHook({ when: SIGNAL_TYPES.ON_ROUND_START, priority: L.ROUND_START.XUANMING_POISON, handler: refresh });
    }
};

// ---------- 木桩弟子：攻击力全部并入防御；同列队友被选中时，改由木桩承受这一击 ----------
//   2026-11-21 老板口径：不做「50% 分摊 + 二次防御结算」那套数学——直接把目标换成木桩，
//   伤害按木桩的高防正常结算，战报天然正确，也不需要事后补扣/补奶。
export const woodenDummyHandler = {
    fields: {},
    install({ A, B, decl }) {
        const myTeam = decl.camp === CAMP_TYPES.ALLY ? (A || []) : (B || []);
        const self0 = myTeam.find(u => u.name === decl.name);
        // 攻击归零、攻击力并入基础防御（getStat 读 _baseAtk/_baseDef）
        if (self0 && self0.state) {
            const atk = self0.state._baseAtk ?? getStat(self0, 'atk');
            self0.state._baseAtk = 0;
            self0.state._baseDef = (self0.state._baseDef ?? getStat(self0, 'def')) + atk;
        }
        registerSettlementHook({
            when: SIGNAL_TYPES.BEFORE_SELECT_TARGET,
            priority: L.BEFORE_SELECT_TARGET.PANG_TAUNT_FORCE,
            handler: (data) => {
                const dec = data && data.declaration;
                const target = dec && dec.targetResult;
                if (!target || !data) return;
                const team = decl.camp === CAMP_TYPES.ALLY ? (data.A || []) : (data.B || []);
                if (!team.includes(target)) return;                 // 只替自己人挡
                const self = team.find(u => u.name === decl.name);
                if (!self || !self.alive || self === target) return;
                if (self.pos == null || target.pos == null) return;
                // 同列判定：pos 1..9 按 3 列排布，列 = (pos-1) % 3
                if ((target.pos - 1) % 3 !== (self.pos - 1) % 3) return;
                if (!canBeTargeted(self)) return;
                dec.targetResult = self;
            }
        });
    }
};

// ---------- 防化弟子：全场毒素无效化；每次拦毒给明教全体回 3% 最大生命 ----------
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

        // 毒被拦下（毒已抹掉、抑疗随之消失）→ 每拦一次，明教全体各回 3% 最大生命
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
                const heal = Math.max(1, Math.round(maxHp * 0.03));
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
