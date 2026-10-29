// modules/27elite-mingjiao-yintianzheng.js — 明教精英「殷天正」：组件工厂（白眉鹰王·防战·反击三段）
export const VER = 'modules/27elite-mingjiao-yintianzheng.js V1.2.0';
import { getSkillParams } from '../core/01config-5v5-test.js';
import { getBattleRng, addMod } from '../core/13battle-shared.js';
import { eventBus, EXECUTION_LAYER as L } from '../infra/50-event-bus.js';
import { SIGNAL_TYPES } from '../infra/56-battle-enums.js';
import { pushInfo, pushSkillAnnounce } from './23elite-helpers.js';
export function createYinTianZhengComponent() {
    return {
        name: '殷天正',
        register(eventBus, A, B, log, self) {
            // 不写死阵营：按身份标记在两侧找，殷天正换边也照样生效。
            // 多实例化（老板拍板「完全真技能」）：组件认 self=本实例单位；self 阵亡回退全场 find
            const yin = (self && self.alive) ? self : [...A, ...B].find(u => u.isYinTianZheng && u.alive);
            if (!yin) return;

            const counter = getSkillParams('殷天正', 'yingZhuaGong');
            if (!counter) throw new Error('缺技能参数: 殷天正.yingZhuaGong');
            const weiya = getSkillParams('殷天正', 'yingWangWeiYa');
            if (!weiya) throw new Error('缺技能参数: 殷天正.yingWangWeiYa');
            const grow = getSkillParams('殷天正', 'laoDangYiZhuang');
            if (!grow) throw new Error('缺技能参数: 殷天正.laoDangYiZhuang');

            // ② 鹰王威压（16→此处 18）：反击命中后削目标攻防（永久，跨回合延续）
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.YIN_PRESSURE, (data) => {
                if (data.unit !== yin || !yin.alive) return;
                if (!data.dmg || data.dmg <= 0) return;
                // 收窄为「仅反击命中」（老板拍板）：靠 core/10 runExtraAttackRequests 执行期写在攻击者
                //   state 上的 _linkReason 识别本次出手是不是鹰爪功反击——普攻命中不再削人
                if (data.unit.state._linkReason !== 'counterAttack') return;
                const t = data.target;
                if (!t || !t.alive) return;
                addMod(t, 'atk', { source: '鹰王威压', value: -weiya.atkDown, op: 'add', group: 'yingWangWeiYa' });
                addMod(t, 'def', { source: '鹰王威压', value: -weiya.defDown, op: 'add', group: 'yingWangWeiYa' });
                pushInfo(data, `<span class="gold">🦅 殷天正鹰王威压：${t.name} 攻 −${weiya.atkDown}、防 −${weiya.defDown}（永久累积）</span>`);
                // 头顶弹幕「第二段」：反击那一记已有 ⚔️反击！ 徽章（core/10 reason 链路），
                //   此处补「鹰王威压」飘字，让「先反击、命中后再压」两段式一眼可见。
                //   line:false —— 战报行已由上方 pushInfo 承担，此处只走头顶飘字不重复落行
                pushSkillAnnounce(data.log, yin, '鹰王威压', `📉 鹰王威压！${t.name} 攻 −${weiya.atkDown}·防 −${weiya.defDown}`,
                    { line: false, floatText: '📉鹰王威压！', floatUid: yin.uid });
            });

            // ① 鹰爪功反击：被攻击后 prob 概率反击攻击者，伤害×dmgRatio，可被闪避
            //   改「掷骰在此、出手推迟到 AFTER_ATTACK」：本击的主伤害此刻已落地，但同一击的后置连锁
            //   （周芷若白骨爪斩）在 AFTER_ATTACK 之后才落地；原先在 AFTER_DAMAGE_APPLIED 就 push 反击请求、由
            //   core/10 L295 执行完毕 → 他先反击、后死于爪链（「已经死了还能反击」）。现在只掷骰 + 暂存，
            //   由 YIN_COUNTER_FIRE 挂到 AFTER_ATTACK 的 extraRequests（core/10 L355 执行，晚于爪链落地），
            //   届时已死于本击连锁者被 runExtraAttackRequests 的 _pendingDeath 守卫拦掉；提示行同样推迟。
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.YIN_COUNTER, (data) => {
                if (data.target !== yin || !yin.alive) return;
                if (yin.state._pendingDeath) return;                 // 本击已把他打进待死，不再反击
                if (!data.dmg || data.dmg <= 0) return;
                const attacker = data.unit;
                if (!attacker || !attacker.alive || attacker === yin) return;
                const prob = Math.min(0.9, (counter.counterProb ?? 0) + (yin.state._counterProbBonus || 0));
                if (getBattleRng().next() >= prob) return;
                yin.state._yinCounterPending = {
                    attackerUid: attacker.uid,
                    attackerName: attacker.name,
                    dmgRatio: counter.dmgRatio,
                    actedSnapshot: yin.state._acted
                };
            });

            // ①续 鹰爪功反击出手：挂在 AFTER_ATTACK（priority 低于 CLAW 40，保住掷骰/结算相对顺序不变），
            //   把暂存的反击转成本次出手的额外攻击请求（core/10 L355 统一执行）
            eventBus.on(SIGNAL_TYPES.AFTER_ATTACK, L.AFTER_ATTACK.YIN_COUNTER_FIRE, (data) => {
                if (data.target !== yin) return;
                const pend = yin.state._yinCounterPending;
                if (!pend) return;
                yin.state._yinCounterPending = null;
                if (!data.extraRequests) data.extraRequests = [];
                data.extraRequests.push({
                    unit: yin,
                    targetUid: pend.attackerUid,
                    reason: 'counterAttack',
                    dmgRatio: pend.dmgRatio,
                    actedMode: 'restore',
                    actedSnapshot: pend.actedSnapshot,
                    priority: 12,
                    infoText: `<span class="gold">🦅 殷天正鹰爪功反击 ${pend.attackerName}！（伤害×${pend.dmgRatio}）</span>`
                });
            });

            // ③ 老当益壮：反击命中后自身永久成长，反击概率累计（封顶由上面 prob 的 min 0.9 兜住）
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.YIN_GROW, (data) => {
                if (data.unit !== yin || !yin.alive) return;
                if (!data.dmg || data.dmg <= 0) return;
                // 同②：仅反击命中才成长（普攻命中不再滚雪球）
                if (data.unit.state._linkReason !== 'counterAttack') return;
                addMod(yin, 'atk', { source: '老当益壮', value: grow.atkGain, op: 'add', group: 'laoDangYiZhuang' });
                addMod(yin, 'def', { source: '老当益壮', value: grow.defGain, op: 'add', group: 'laoDangYiZhuang' });
                yin.state._counterProbBonus = (yin.state._counterProbBonus || 0) + grow.probGain;
                pushInfo(data, `<span class="gold">💪 殷天正老当益壮：攻 +${grow.atkGain}、防 +${grow.defGain}、反击率 +${Math.round(grow.probGain * 100)}%</span>`);
            });
        }
    };
}

