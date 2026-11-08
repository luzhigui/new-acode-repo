// modules/337-elite-mingjiao-zhuangzheng.js — 明教·天鹰教 庄铮「断锤三式」
// V1.0.1 | 2026-11-07 | 触发瞬间攻击力减半并记 N，此后每次出手 +N；自身 -1 血补 hp>1 守卫（不自杀）
// ① 首次受到致死伤害：不倒，保留 keepHp 点生命（免疫本击），并立即反手打攻击者一次；
// ② 此后每次受伤最多只受 cap 点（_dmgCap 单一来源，core/12 + core/13 两条落账出口共读）；
// ③ 触发瞬间攻击力减半（减掉的量记为 N，存 state._duanChuiN）；此后每次出手后攻击 +N、自身生命 -selfCost
//    （hp 不大于 1 时不扣，不自杀）。
// 注册面说明（按现码修正，勿照抄旧稿）：
//   · BEFORE_DAMAGE_APPLY 的 payload 只有 { target, dmg, hpBefore, A, log, declarations }，
//     没有 unit / B / state —— 攻击者在这是拿不到的，所以「立即反击」不在这里做。
//   · 免疫分支不处理 extraRequests，挂 AFTER_DAMAGE_APPLIED 的反击请求会被整段吞掉；
//     故反击挂 AFTER_ATTACK_IMMUNE（免疫分支专属广播，payload 带 unit/A/B/state），
//     直调 core/10 processUnitAttack（与宋青书·性奋同一既有模式，不另造一套额外攻击系统）。
// V1.0.2 | 2026-11-08 体检转交：报幕 N= 走 fmtNum（原直接印内部浮点，实测出现 N=29.39124375）。
// V1.0.3 | 2026-11-08 精英数值一致性：触发瞬间的「减半」系数从写死 0.5 改为读 duanChui.params.atkHalfRatio
//           （旧值 0.5 原样搬进 content/001，数值不变；配置缺键显式抛错，不回落）。
export const VER = 'modules/337-elite-mingjiao-zhuangzheng.js V1.0.3';

import { processUnitAttack } from '../core/209-battle-attack.js';
import { registerSettlementHook, EXECUTION_LAYER as L } from '../infra/101-event-bus.js';
import { registerMechanicHandler } from '../core/219-mechanic-registry.js';
import { SIGNAL_TYPES, MECHANIC_TYPES, CAMP_TYPES, SKILL_CUE_KINDS } from '../infra/106-battle-enums.js';
import { applyStatChange, addMod, getStat } from '../core/214-battle-shared.js';
import { getSkillParams } from '../core/201-config-5v5-test.js';
import { pushSkillAnnounce } from './305-elite-helpers.js';
import { fmtNum } from '../infra/102-core-utils.js';

export const duanChuiHandler = {
    fields: {},
    install({ eventBus, A, B, decl }) {
        const selfTeam = decl.camp === CAMP_TYPES.ALLY ? A : B;
        const self = selfTeam.find(u => u.alive && u.name === decl.name);
        if (!self) return;

        const params = getSkillParams(decl.name, 'duanChui');
        if (!params) throw new Error(`缺技能参数: ${decl.name}.duanChui`);
        const keepHp = params.keepHp;
        const cap = params.cap;
        const selfCost = params.selfCost;
        // 触发瞬间的攻击力保留比例（0.5 = 减半）。旧代码写死 atkNow / 2，2026-11-08 参数化，数值不变。
        const atkHalfRatio = params.atkHalfRatio;
        if (atkHalfRatio == null) throw new Error(`缺技能参数: ${decl.name}.duanChui.atkHalfRatio`);

        // ① 首击保命：先把血收到 keepHp，再挂 _dmgCap —— 顺序反了会把自己这一收截成只掉 cap 点。
        registerSettlementHook({
            when: SIGNAL_TYPES.BEFORE_DAMAGE_APPLY,
            priority: L.BEFORE_DAMAGE_APPLY.SPIDER_IMMUNE + 1,
            handler: (data) => {
                if (data.target !== self || !self.alive) return;
                if (self.state._duanChuiTriggered) return;
                if (self.hp - data.dmg > 0) return;
                applyStatChange(self, 'hp', keepHp - self.hp, null, '断锤保命', false, false);
                self.state._duanChuiTriggered = true;
                self.state._dmgCap = cap;
                // 触发瞬间攻击力真减半：N = 当前 getStat(atk) 的一半（不取整），写入 -N 使减半后恰为原值一半
                //   （29.4 → 14.7）；此后每次出手 +N 递增（14.7 → 29.4 → 44.1）。取整只在显示层，不在计算里截断。
                const atkNow = getStat(self, 'atk');
                const n = atkNow * atkHalfRatio;
                if (n > 0) {
                    addMod(self, 'atk', { source: '断锤三式·减半', value: -n, ttl: 'permanent', group: 'duanChuiHalve', op: 'add' });
                    self.state._duanChuiN = n;
                }
                // 演出：攻击数字被剥走一半往上飘（fx/619），只表现，减半数值仍以上面 addMod 为准
                const halveCue = (self.pos != null && n > 0)
                    ? { kind: SKILL_CUE_KINDS.ATK_HALVE, unit: { uid: self.uid, camp: self.camp, pos: self.pos }, amount: n }
                    : null;
                pushSkillAnnounce(data.log, self, '断锤三式', `${self.name} 锤裂人未倒——保留 ${fmtNum(keepHp)} 点生命，攻击减半（N=${fmtNum(n)}）！`, { cue: halveCue });
                data.declarations.push({ immune: true, reason: `🔨 断锤三式：${self.name} 屹立不倒` });
            }
        });

        // ①-反击：只在免疫分支（保命那一下必然走这里），锁攻击者为目标直接出手一次。
        registerSettlementHook({
            when: SIGNAL_TYPES.AFTER_ATTACK_IMMUNE,
            priority: L.AFTER_ATTACK_IMMUNE.XINGFEN_EXTRA + 5,
            handler: (data) => {
                if (data.target !== self || !data.unit || data.unit.name === self.name) return;
                if (!self.state._duanChuiTriggered || self.state._duanChuiCountering || !self.alive) return;
                const attacker = data.unit;
                if (!attacker.alive || attacker.state._pendingDeath) return;
                const myTeam = self.camp === CAMP_TYPES.ALLY ? data.A : data.B;
                const foeTeam = self.camp === CAMP_TYPES.ALLY ? data.B : data.A;
                const actedBefore = self.state._acted;
                self.state._duanChuiCountering = true;
                self.state._isLinkAttack = true;
                self.state._linkReason = 'counterAttack';
                self.state._acted = false;   // 已行动过也要能反手（被动出手不消耗行动权）
                try {
                    processUnitAttack(self, myTeam, foeTeam, data.log, data.A, data.B, data.state, null, attacker.uid);
                } finally {
                    self.state._isLinkAttack = false;
                    self.state._linkReason = null;
                    self.state._duanChuiCountering = false;
                    self.state._acted = actedBefore;
                }
            }
        });

        // ③ 出手后成长：攻击永久 +N（触发时减半量，N→2N→3N），生命 -selfCost（hp≤1 不扣，被动出手同样算一次出手）
        registerSettlementHook({
            when: SIGNAL_TYPES.AFTER_ATTACK,
            priority: L.AFTER_ATTACK.PANG_TAUNT + 5,
            handler: (data) => {
                if (data.unit !== self || !self.alive) return;
                if (!self.state._duanChuiTriggered) return;
                const n = self.state._duanChuiN;
                if (n > 0) {
                    addMod(self, 'atk', { source: '断锤三式', value: n, ttl: 'permanent', group: 'duanChuiGrow', op: 'add' });
                    // 演出：每次出手后攻击数字回补一格（⚔+N 飘字），只表现、不改回涨数值
                    if (data.log && self.pos != null) {
                        pushSkillAnnounce(data.log, self, '断锤三式', '', {
                            line: false,
                            cue: { kind: SKILL_CUE_KINDS.ATK_GROW, unit: { uid: self.uid, camp: self.camp, pos: self.pos }, amount: n }
                        });
                    }
                }
                if (self.hp > 1) applyStatChange(self, 'hp', -selfCost, null, '断锤·耗血', false, false);
            }
        });
    }
};

registerMechanicHandler(MECHANIC_TYPES.DUAN_CHUI, duanChuiHandler);
