// modules/337-elite-mingjiao-zhuangzheng.js — 明教·天鹰教 庄铮「断锤三式」
// V1.0.10 | 2026-11-21 保命落血精确收到 keepHp：上限带加成（carry 等）时等比缩后血量可能 > keepHp，补血分支不触发
// V1.0.9 | 2026-11-20 触发后单次上限 _dmgCap 丢失自愈（防「一次掉 4 点」）
export const VER = 'modules/337-elite-mingjiao-zhuangzheng.js V1.0.10';

import { processUnitAttack } from '../core/209-battle-attack.js';
import { registerSettlementHook, EXECUTION_LAYER as L } from '../infra/101-event-bus.js';
import { registerMechanicHandler } from '../core/219-mechanic-registry.js';
import { SIGNAL_TYPES, MECHANIC_TYPES, CAMP_TYPES, SKILL_CUE_KINDS, STATE_CHANGE_TYPES } from '../infra/106-battle-enums.js';
import { applyStatChange, addMod, getStat } from '../core/214-battle-shared.js';
import { refreshMaxHp } from '../core/214-battle-shared.js';

import { pushSkillAnnounce, requireSkillParams, emitHpChange } from './305-elite-helpers.js';
import { fmtNum } from '../infra/102-core-utils.js';

export const duanChuiHandler = {
    fields: {},
    install({ eventBus, A, B, decl }) {
        const selfTeam = decl.camp === CAMP_TYPES.ALLY ? A : B;
        const self = selfTeam.find(u => u.alive && u.name === decl.name);
        if (!self) return;
        // 控制位移免疫（2026-11-15 老板拍板）：不死时与寒离飒同款——击退/撞晕/换位/拽位只掉血不动窝；
        //   死亡单位本就不是位移目标，「不死时」由 alive 语义天然保证
        self.state._ctrlImmune = true;

        const params = requireSkillParams(decl.name, 'duanChui');
        const keepHp = params.keepHp;
        const cap = params.cap;
        const selfCost = params.selfCost;
        // 触发瞬间的攻击力保留比例（0.5 = 减半）。旧代码写死 atkNow / 2，2026-11-08 参数化，数值不变。
        const atkHalfRatio = params.atkHalfRatio;
        if (atkHalfRatio == null) throw new Error(`缺技能参数: ${decl.name}.duanChui.atkHalfRatio`);
        // 2026-11-18 老板拍板：触发瞬间防御同样减半（减掉的量记为 M），此后每次出手 +M。
        const defHalfRatio = params.defHalfRatio;
        if (defHalfRatio == null) throw new Error(`缺技能参数: ${decl.name}.duanChui.defHalfRatio`);

        // 不死触发（供普通伤害与白骨爪两条管线共用）。调用前 self 必须仍存活、且尚未触发。
        //   白骨爪走 core/217 独立结算、不发 BEFORE_DAMAGE_APPLY，所以不能只靠那个钩子。
        const triggerDuanChui = () => {
            // 2026-11-12 老板拍板：触发瞬间 maxHp 锁到 keepHp（8 点），面板显示 8/8，而不是 8/162。
            //   上限锁走绝对值字段（core/214 getStat 直接返回），不写差值 add 词条：
            //   差值会把锁定时生效的 ttl:'round' 词条（carry 的 +maxHp 等）算进去，
            //   回合末清临时词条后 base+差值 落到负数、被 refreshMaxHp 夹到 1 —— 就是「carry 结束后没回到 8」。
            //   绝对值锁无视词条增删，carry 在不在都恒等于 keepHp。
            //   refreshMaxHp 的等比缩会把 hp 按 (8/原上限) 缩到 <8，随后再拉一次到 keepHp——两步顺序不能反。
            self.state._maxHpLock = keepHp;
            refreshMaxHp(self, null, '断锤三式·锁血');
            // 保命落血：上限带加成（carry 等）时等比缩后血量可能 > keepHp，必须双向收到 keepHp，否则违背「保留 keepHp 点生命」
            if (Math.abs(self.hp - keepHp) > 1e-6) applyStatChange(self, 'hp', keepHp - self.hp, null, '断锤保命', false, false);
            self.state._duanChuiTriggered = true;
            self.state._dmgCap = cap;
            // 断锤形态整套免疫（2026-11-11 老板拍板，2026-11-18 调整）：
            //   _ctrlImmune    霸体免疫眩晕（组四订阅 STUNNED 清 _stunned）
            //   _neverMiss     必中（不未命中）
            //   _ignoreDodge   必中（不被闪避；对方不闪避 → 闪避反击链断）
            //   _immuneExecute 免疫斩杀（core/203 getExecuteBlockReason / modules/310 白骨爪斩杀 已读）
            //   _immunePoison  免疫毒素（2026-11-18 老板拍板加回；消费点 core/216 挂毒 / 331 dotTick / 319 寒毒 / 339 蹦蹦寒毒）
            // 2026-11-18 老板拍板删 _immuneClaw：该字段全仓无人读取（旧注释称 modules/310 读，实际 310 读的是 _immuneExecute），
            //   白骨爪改为「照样连击、每爪只 1 点」，由 _dmgCap 在 core/217 落地时截断，可被连击磨死。
            Object.assign(self.state, {
                _ctrlImmune: true,
                _neverMiss: true,
                _ignoreDodge: true,
                _immuneExecute: true,
                _immunePoison: true
            });
            // 触发瞬间攻击力真减半：N = 当前 getStat(atk) 的一半（不取整），写入 -N 使减半后恰为原值一半
            //   （29.4 → 14.7）；此后每次出手 +N 递增（14.7 → 29.4 → 44.1）。取整只在显示层，不在计算里截断。
            const atkNow = getStat(self, 'atk');
            const n = atkNow * atkHalfRatio;
            if (n > 0) {
                addMod(self, 'atk', { source: '断锤三式·减半', value: -n, ttl: 'permanent', group: 'duanChuiHalve', op: 'add' });
                self.state._duanChuiN = n;
            }
            // 防御同口径减半：M = 当前 def 的一半，此后每次出手 +M（与攻击 N 同一套成长节奏）
            const defNow = getStat(self, 'def');
            const m = defNow * defHalfRatio;
            if (m > 0) {
                addMod(self, 'def', { source: '断锤三式·减半', value: -m, ttl: 'permanent', group: 'duanChuiHalve', op: 'add' });
                self.state._duanChuiM = m;
            }
            // 演出：攻击数字被剥走一半往上飘（fx/619），只表现，减半数值仍以上面 addMod 为准
            // 日志不在这里推（2026-11-13 老板拍板修正顺位）：BEFORE_DAMAGE_APPLY 时 IMMUNE fact 还没落账，
            //   pushSkillAnnounce 会排到 IMMUNE 前面 → 读起来像「还没被打就提示锤裂」。
            //   挪到 AFTER_ATTACK_IMMUNE（IMMUNE fact 已 push、反击 extraRequests 还未 push），
            //   顺位自然变成 IMMUNE → SKILL_ANNOUNCE → 反击攻击组。
            self.state._duanChuiHalveCue = (self.pos != null && n > 0)
                ? { kind: SKILL_CUE_KINDS.ATK_HALVE, unit: { uid: self.uid, camp: self.camp, pos: self.pos }, amount: n }
                : null;
        };

        // ① 首击保命：先把血收到 keepHp，再挂 _dmgCap —— 顺序反了会把自己这一收截成只掉 cap 点。
        registerSettlementHook({
            when: SIGNAL_TYPES.BEFORE_DAMAGE_APPLY,
            priority: L.BEFORE_DAMAGE_APPLY.SPIDER_IMMUNE + 1,
            handler: (data) => {
                if (data.target !== self || !self.alive) return;
                if (self.state._duanChuiTriggered) {
                    // 自愈（2026-11-20）：触发标记在、单次上限丢了 → 补回 cap。否则后续每击按原伤害掉血，
                    //   实机出现「庄铮 8.1 → 4」这种一次掉 4 点的情况。
                    if (!(self.state._dmgCap > 0)) self.state._dmgCap = cap;
                    return;
                }
                if (self.hp - data.dmg > 0) return;
                // 拒绝回血/吸血不额外挂标记：_dmgCap > 0 已由 core/214 拦正向治疗；
                //   姐姐附身 isHeal=false 不受拦，仍可加血 → 组五按契约回退到 keepHp。
                triggerDuanChui();
                data.declarations.push({ immune: true, reason: `🔨 断锤三式：${self.name} 屹立不倒` });
            }
        });

        // ①-白骨爪保命（2026-11-18 老板拍板）：白骨爪走 core/217 独立结算，不发 BEFORE_DAMAGE_APPLY，
        //   旧实现里庄铮会在「首爪致死」时被直接打死、断锤根本触发不了（实测第4关 52% 的死亡都属于这一类）。
        //   这里挂在「先广播后扣血」的 CLAW_HIT_APPLIED 上，致死时把本爪整爪减伤掉（reduce 拉满），
        //   再由 triggerDuanChui 把血收到 keepHp；此后每爪由 _dmgCap 截到 1 点，可被连击磨死。
        //   白骨爪分支不触发反手（连击中插反击会打断链条），与普通伤害分支的差异仅此一处。
        eventBus.on(SIGNAL_TYPES.CLAW_HIT_APPLIED, 5, (data) => {
            if (!data || data.target !== self || !self.alive) return;
            if (self.state._duanChuiTriggered) {
                if (!(self.state._dmgCap > 0)) self.state._dmgCap = cap;   // 同上：上限丢失自愈
                return;
            }
            if (self.hp - data.dmg > 0) return;
            triggerDuanChui();
            data.reduce = Math.max(data.reduce || 0, data.dmg);
            self.state._duanChuiHalveCue = null;   // 白骨爪不经过 AFTER_ATTACK_IMMUNE，cue 不会被消费，清掉免得残留
        });

        // ①-斩杀保命（2026-11-18 补）：战士斩杀走 EXECUTE→killUnit，不是一次伤害、不经 BEFORE_DAMAGE_APPLY，
        //   未触发断锤时会被直接清零（实机：庄铮被素问打到 5.8 血，紧接「战士斩杀」当场带走，断锤一次没触发）。
        //   这里把本次斩杀拦下，照常走 triggerDuanChui 保命（收血到 keepHp + 挂免疫/减半）；
        //   不反手，与白骨爪分支同口径（斩杀在结算管线内部，插反手会打乱本击的账）。
        eventBus.on(SIGNAL_TYPES.EXECUTE_APPLIED, 5, (data) => {
            if (!data || data.target !== self || !self.alive) return;
            if (self.state._duanChuiTriggered) return;
            triggerDuanChui();
            self.state._duanChuiHalveCue = null;   // 同上：不走 AFTER_ATTACK_IMMUNE，cue 不会被消费
            data.cancelled = true;
            data.reason = `🔨 断锤三式：${self.name} 屹立不倒，保留 ${fmtNum(keepHp)} 点生命（攻击减半）`;
        });

        // ①-反击：只在免疫分支（保命那一下必然走这里），锁攻击者为目标直接出手一次。
        registerSettlementHook({
            when: SIGNAL_TYPES.AFTER_ATTACK_IMMUNE,
            priority: L.AFTER_ATTACK_IMMUNE.XINGFEN_EXTRA + 5,
            handler: (data) => {
                if (data.target !== self || !data.unit || data.unit.name === self.name) return;
                if (!self.state._duanChuiTriggered || self.state._duanChuiCountering || !self.alive) return;
                // 顺位修正（2026-11-13）：IMMUNE fact 已在 core/10 免疫分支落账，此处推 SKILL_ANNOUNCE，
                //   紧跟在 IMMUNE 之后、反击之前。去掉 needsSeparator——IMMUNE 已是独立的攻击组，
                //   中间再插分隔符会显得「提示被切断」。
                const halveCue = self.state._duanChuiHalveCue;
                self.state._duanChuiHalveCue = null;
                pushSkillAnnounce(data.log, self, '断锤三式', `${self.name} 锤裂人未倒——保留 ${fmtNum(keepHp)} 点生命，攻击减半（N=${fmtNum(self.state._duanChuiN || 0)}）！`, { cue: halveCue });
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
                    // 返回 false = 没产出攻击组（已死/受控/飞天/锁定目标不可选），日志里就会“免疫公告后直接跳下一击”。
                    //   只在失败时告警，正常运行零噪音，便于下次复现时一眼看出是哪条 early-return。
                    const ok = processUnitAttack(self, myTeam, foeTeam, data.log, data.A, data.B, data.state, null, attacker.uid);
                    if (!ok) {
                        console.warn('[337] 断锤反击未产出：',
                            'self.alive=' + self.alive, 'hp=' + self.hp,
                            '_pendingDeath=' + self.state._pendingDeath,
                            'attacker=' + attacker.name, 'attacker.alive=' + attacker.alive,
                            'attacker._pendingDeath=' + attacker.state._pendingDeath);
                    }
                } finally {
                    self.state._isLinkAttack = false;
                    self.state._linkReason = null;
                    self.state._duanChuiCountering = false;
                    self.state._acted = actedBefore;
                }
            }
        });

        // ③ 出手后成长：攻击永久 +N、防御永久 +M（触发时各自减半的量），生命 -selfCost（hp≤1 不扣，被动出手同样算一次出手）
        registerSettlementHook({
            when: SIGNAL_TYPES.AFTER_ATTACK,
            priority: L.AFTER_ATTACK.PANG_TAUNT + 5,
            handler: (data) => {
                if (data.unit !== self || !self.alive) return;
                if (!self.state._duanChuiTriggered) return;
                const n = self.state._duanChuiN;
                const m = self.state._duanChuiM;
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
                // 防御回补（2026-11-18 老板拍板）：与攻击同一节奏，+M 永久叠加；不单独出飘字
                if (m > 0) {
                    addMod(self, 'def', { source: '断锤三式', value: m, ttl: 'permanent', group: 'duanChuiGrow', op: 'add' });
                }
                if (self.hp > 1) applyStatChange(self, 'hp', -selfCost, null, '断锤·耗血', false, false);
            }
        });

        // 霸体免疫眩晕：任何路径设 _stunned（杨逍点穴 / 寒离飒撞边 / 惑心换位等）都即时清掉。
        //   只在自己身上生效；以 _ctrlImmune 标记为判据——没触发断锤就不会被清。
        eventBus.on(SIGNAL_TYPES.ON_UNIT_STATE_CHANGE, 5, (data) => {
            if (!data || data.unitUid !== self.uid) return;
            if (data.changeType !== STATE_CHANGE_TYPES.STUNNED) return;
            if (!self.state._ctrlImmune) return;
            self.state._stunned = false;
            emitHpChange(self, { _stunned: false });
        });

        // 姐姐附身飞回时血量回退：附身期间 refreshMaxHp「上限升则等量加血」
        //   绕过拒绝回血给了庄铮加血（isHeal=false），飞回后按契约「超 keepHp 保留 keepHp，
        //   低于保留当前值」收口。宿主 uid 靠组六/七 让 RETURNED 信号带上 hostUid 识别。
        eventBus.on(SIGNAL_TYPES.ON_UNIT_STATE_CHANGE, 5, (data) => {
            if (!data || data.changeType !== STATE_CHANGE_TYPES.RETURNED) return;
            if (data.hostUid !== self.uid) return;
            if (!self.state._duanChuiTriggered) return;
            if (self.hp > keepHp) {
                // ignoreCap=true：_dmgCap 会把负向 delta 夹到 -1，「回退到 5」就变成每次只削 1 点。
                //   血量回退是形态收口、不是一次受伤，与 killUnit 同口径。
                applyStatChange(self, 'hp', keepHp - self.hp, null, '蝶变飞回血量回退', false, false, true);
                emitHpChange(self);
            }
        });
    }
};

registerMechanicHandler(MECHANIC_TYPES.DUAN_CHUI, duanChuiHandler);