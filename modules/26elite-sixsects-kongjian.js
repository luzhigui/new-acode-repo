// modules/26elite-sixsects-kongjian.js — 少林精英「空见」：金刚不坏 / 逗你玩
// 五个条件各触发一次（共 5 次），每次为随机一名无护罩的友方（含自身）施加「免疫一次伤害」护罩；
// 5 次用完后升级：此后每回合开始自动施加一次。
// 触发时只入待发队列，AFTER_ATTACK（整组攻击含溅射/追击/双击全部打完）统一发出，避免被流星赶月二段打掉。
// 空见自己阵亡也算「友方阵亡」条件，但立即发出（他的组件下回合不再注册）。
import { getSkillParams } from '../core/01config-5v5-test.js';
import { getBattleRng } from '../core/13battle-shared.js';
import { eventBus } from '../infra/50-event-bus.js';
import { SIGNAL_TYPES, CAMP_TYPES } from '../infra/56-battle-enums.js';
import { pushSkillAnnounce } from './23elite-helpers.js';

export const VER = 'modules/26elite-sixsects-kongjian.js V1.1.0';

// 触发监听排在常规 afterDamage 之后（吸血/嗜血/乘风等在 20~35），保证溅射受伤也记进待发队列
const TRIGGER_PRIORITY = 55;
// 待发队列的发送时机：AFTER_ATTACK（整组攻击结算完毕）
const FLUSH_PRIORITY = 60;
// 护罩消费：BEFORE_DAMAGE_APPLY 里排在飞天（SPIDER_IMMUNE=100）之后，飞天接管时不消耗护罩
const CONSUME_PRIORITY = 110;

export function createKongJianComponent() {
    return {
        name: '空见',
        register(eventBus, A, B, log, self) {
            const kj = (self && self.alive) ? self : [...A, ...B].find(u => u.isKongJian && u.alive);
            if (!kj) return;
            const myTeam = kj.camp === CAMP_TYPES.ALLY ? A : B;

            const skill = getSkillParams('空见', 'jinGangBuHuai');
            if (!skill) throw new Error('缺技能参数: 空见.jinGangBuHuai');
            const maxUses = skill.maxUses ?? 5;
            const lowThreshold = skill.lowHpThreshold ?? 0.7;

            // 首次注册时初始化五个条件标记（battle 级字段，跨回合保留）
            if (!kj.state._kongJianFlags) {
                Object.assign(kj.state, {
                    _kongJianFlags: { opening: false, allyHurt: false, allyDead: false, selfHurt: false, selfLow: false }
                });
            }

            // 施加一个护罩：候选 = 本队存活且无护罩；空见阵亡时不含自己
            function grantOneShield(outLog, tag) {
                const candidates = myTeam.filter(u => u.alive && !u.state._immuneShield);
                if (candidates.length === 0) return false;
                const rng = getBattleRng();
                const pick = candidates[rng.nextInt(0, candidates.length - 1)];
                pick.state._immuneShield = { sourceUid: kj.uid, sourceName: kj.name };
                kj.state._kongJianUsed = (kj.state._kongJianUsed || 0) + 1;
                if (outLog) {
                    const nth = kj.state._kongJianUpgraded ? '' : `（第 ${kj.state._kongJianUsed}/${maxUses} 次）`;
                    pushSkillAnnounce(outLog, kj, '金刚不坏', `🛡️ 金刚不坏：${kj.name} 为 ${pick.name} 加持护罩${nth}（${tag}）`);
                }
                return true;
            }

            function checkUpgrade(outLog) {
                if (kj.state._kongJianUpgraded) return;
                if ((kj.state._kongJianUsed || 0) < maxUses) return;
                kj.state._kongJianUpgraded = true;
                if (outLog) {
                    pushSkillAnnounce(outLog, kj, '逗你玩', `🎭 逗你玩！${kj.name} 金刚不坏神功大成——「只能用五次」是逗你玩的，此后每回合自动加持护罩`);
                }
            }

            // 触发一个条件：只入待发队列（已升级 / 已触发过 / 次数用尽 直接返回）
            function trigger(flagKey, outLog, reason) {
                if (kj.state._kongJianUpgraded) return;
                if ((kj.state._kongJianUsed || 0) + (kj.state._kongJianPending || 0) >= maxUses) return;
                if (kj.state._kongJianFlags[flagKey]) return;
                kj.state._kongJianFlags[flagKey] = true;
                kj.state._kongJianPending = (kj.state._kongJianPending || 0) + 1;
                if (outLog) {
                    pushSkillAnnounce(outLog, kj, '金刚不坏', `🛡️ ${reason}：金刚不坏神功发动`, { line: false, floatText: '🛡️', floatUid: kj.uid });
                }
            }

            // —— 条件0：开局（直接发出，此时没有攻击在跑） ——
            if (!kj.state._kongJianFlags.opening) {
                kj.state._kongJianFlags.opening = true;
                grantOneShield(log, '开局');
            }

            // —— 条件1/2/4：友方受伤 / 自身首次受伤 / 自身血量≤70% ——
            //   被护罩挡掉的那一击走 IMMUNE 分支，不到 AFTER_DAMAGE_APPLIED / SPLASH_DAMAGED，天然不触发
            function onHurt(outLog, target, dmg, tag) {
                if (!target || !myTeam.includes(target)) return;
                if (!dmg || dmg <= 0) return;
                if (target.uid === kj.uid) {
                    trigger('selfHurt', outLog, `${kj.name} 首次受伤${tag}`);
                    if (kj.alive && kj.hp < kj.maxHp * lowThreshold) {
                        trigger('selfLow', outLog, `${kj.name} 生命降至 ${Math.round(kj.hp / kj.maxHp * 100)}%${tag}`);
                    }
                } else {
                    trigger('allyHurt', outLog, `${target.name} 首次受伤${tag}`);
                }
            }
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, TRIGGER_PRIORITY, (data) => {
                onHurt(data.log, data.target, data.dmg, '');
            });
            eventBus.on(SIGNAL_TYPES.SPLASH_DAMAGED, 50, (data) => {
                onHurt(data.log, data.unit, data.dmg, '（溅射）');
            });

            // —— 条件3：友方阵亡（含自己） ——
            eventBus.on(SIGNAL_TYPES.ON_UNIT_DEATH, 30, (data) => {
                if (kj.state._kongJianFlags.allyDead) return;
                const myDead = (data.deadUnits || []).filter(u => myTeam.includes(u));
                if (myDead.length === 0) return;
                kj.state._kongJianFlags.allyDead = true;
                kj.state._kongJianPending = (kj.state._kongJianPending || 0) + 1;
                const selfDead = myDead.some(u => u.uid === kj.uid);
                if (selfDead) {
                    // 自己阵亡：立即发出（组件下一回合不再注册，pending 没人处理）
                    while (kj.state._kongJianPending > 0) {
                        if (!grantOneShield(data.log, `${kj.name} 阵亡`)) break;
                        kj.state._kongJianPending--;
                    }
                    checkUpgrade(data.log);
                } else if (data.log) {
                    pushSkillAnnounce(data.log, kj, '金刚不坏', `🛡️ ${myDead.map(u => u.name).join('、')} 阵亡：金刚不坏神功发动`, { line: false, floatText: '🛡️', floatUid: kj.uid });
                }
            });

            // —— 待发队列：AFTER_ATTACK 统一发出 ——
            eventBus.on(SIGNAL_TYPES.AFTER_ATTACK, FLUSH_PRIORITY, (data) => {
                if ((kj.state._kongJianPending || 0) <= 0) return;
                let sent = 0;
                while (kj.state._kongJianPending > 0) {
                    if (!grantOneShield(data.log, '触发')) break;
                    kj.state._kongJianPending--;
                    sent++;
                }
                kj.state._kongJianPending = 0;   // 候选为空：本次作废，不跨轮保留
                if (sent > 0) checkUpgrade(data.log);
            });

            // —— 升级后：每回合开始自动施加 ——
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, 25, (data) => {
                if (!kj.alive) return;
                if (!kj.state._kongJianUpgraded) return;
                grantOneShield(data.log, '大成');
            });

            // —— 护罩消费：正规攻击（排在飞天之后；飞天接管时不消耗护罩） ——
            eventBus.on(SIGNAL_TYPES.BEFORE_DAMAGE_APPLY, CONSUME_PRIORITY, (data) => {
                const t = data.target;
                if (!t || !t.state || !t.state._immuneShield) return;
                if (Array.isArray(data.declarations) && data.declarations.some(d => d.immune)) return;
                if (!data.declarations) data.declarations = [];
                data.declarations.push({ immune: true, reason: '🛡️ 金刚不坏：护罩挡下这一击' });
                t.state._immuneShield = null;
            });
        }
    };
}
