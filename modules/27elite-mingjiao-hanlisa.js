// modules/27elite-mingjiao-hanlisa.js — 明教精英「寒离飒」：战士 · 弱精英 M107（与韦一笑同池）· 恒定 2 号位
//   ① 九阳神拳：普攻 50% 概率附带，命中回复自身最大生命 12%（同张无忌九阳）
//   ② 寒冰神掌：普攻未触发九阳时施展，目标挂寒毒（3 回合 4%→2%→1% 最大生命，同鹿杖客）
//   ③ 蓄力：本局九阳与寒毒都触发过 → 普攻后挂 20% 最大生命护盾并蓄力；
//      下一回合跳过行动，回合结束（下一步落地时结算）对敌方 4/6/7/9 造成半次普攻伤害、
//      2/5/8 造成真伤 = 最近三回合自身承受总伤害；结算完复原普攻循环
// V1.0.0 | ~7600 bytes | 2026-10-17 新建（老板拍板设计定稿，见 想法和优化.md 附录）
export const VER = 'modules/27elite-mingjiao-hanlisa.js V1.0.0';
import { getSkillParams } from '../core/01config-5v5-test.js';
import { getBattleRng, recordHpAudit } from '../core/13battle-shared.js';
import { eventBus, EXECUTION_LAYER as L, EFFECT_TYPES } from '../infra/50-event-bus.js';
import { SIGNAL_TYPES, FACT_TYPES, CAMP_TYPES } from '../infra/56-battle-enums.js';

export function createHanLiSaComponent() {
    return {
        name: '寒离飒',
        register(eventBus, A, B, log) {
            const hls = [...A, ...B].find(u => u.isHanLiSa && u.alive);
            if (!hls) return;

            const jy = getSkillParams('寒离飒', 'jiuYangQuan');
            if (!jy) throw new Error('缺技能参数: 寒离飒.jiuYangQuan');
            const hb = getSkillParams('寒离飒', 'hanBingShenZhang');
            if (!hb) throw new Error('缺技能参数: 寒离飒.hanBingShenZhang');
            const xl = getSkillParams('寒离飒', 'xuLi');
            if (!xl) throw new Error('缺技能参数: 寒离飒.xuLi');

            const pushInfo = (data, text) => {
                const gd = data && data.group && data.group.data;
                if (gd && Array.isArray(gd.entries)) gd.entries.push({ type: 'info', text });
            };
            const announce = (ctx, note) => {
                if (!ctx || !Array.isArray(ctx.log)) return;
                ctx.log.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: { unitName: hls.name, unitUid: hls.uid, camp: hls.camp, skillName: '蓄力', note } });
            };
            const enemyOf = () => (hls.camp === CAMP_TYPES.ALLY ? B : A);

            // —— 普攻命中后：九阳 / 寒毒 / 解锁蓄力 ——
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.LEECH + 2, (data) => {
                if (data.unit !== hls) return;
                if (data.unit.state._isLinkAttack) return;      // 额外/被动出手不计
                if (!data.dmg || data.dmg <= 0) return;
                const target = data.target;
                if (!target) return;

                hls.state._hlsLastDmg = data.dmg;

                // ① 九阳神拳：50% 附带，回最大生命 healPct
                if (!hls.state._hlsJiuYangDone && getBattleRng().next() < (jy.prob ?? 0.5)) {
                    hls.state._hlsJiuYangDone = true;
                    const heal = Math.min(Math.floor(hls.maxHp * (jy.healPct ?? 0.12)), hls.maxHp - hls.hp);
                    if (heal > 0) {
                        if (!data.declarations) data.declarations = [];
                        data.declarations.push({
                            type: EFFECT_TYPES.HEAL, value: heal, source: hls,
                            factType: FACT_TYPES.HEAL,
                            factData: { unitName: hls.name, heal, hpBefore: Math.floor(hls.hp), hpAfter: Math.floor(hls.hp + heal), unitUid: hls.uid, icon: '☀️', label: '九阳神拳回复', mode: 'plusTrail', anchorVerb: '回复' }
                        });
                        recordHpAudit(hls, 'hlsJiuYangHeal', heal, '九阳神拳治疗');
                    }
                    pushInfo(data, `<span class="gold">☀️ 寒离飒九阳神拳：回复 ${heal} 点生命</span>`);
                // ② 寒冰神掌：未触发九阳时施展，挂寒毒
                } else if (!hls.state._hlsHanBingDone) {
                    hls.state._hlsHanBingDone = true;
                    target.state._hlsHanDu = { remaining: hb.duration ?? 3, dotPercents: [...(hb.dotPercents || [0.04, 0.02, 0.01])] };
                    const pctText = (hb.dotPercents || []).map(v => Math.round(v * 100) + '%').join('→');
                    pushInfo(data, `<span class="gold">❄️ 寒离飒寒冰神掌：${target.name} 寒气入体（${hb.duration ?? 3} 回合 ${pctText} 最大生命）</span>`);
                }

                // ③ 两者都触发过 → 本击结束即起蓄力（普攻照打，蓄力从下一回合开始）
                if (hls.state._hlsJiuYangDone && hls.state._hlsHanBingDone && (hls.state._hlsCharging || 0) === 0) {
                    const shield = Math.floor(hls.maxHp * (xl.shieldPct ?? 0.2));
                    Object.assign(hls.state, { _hlsCharging: 1, _shield: (hls.state._shield || 0) + shield });
                    pushInfo(data, `<span class="gold">🌀 寒离飒起手蓄力：获得 ${shield} 点护盾（下回合凝聚）</span>`);
                }
            });

            // —— 承伤累计（最近三回合桶）+ 护盾吸收提示 ——
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.LEECH + 3, (data) => {
                if (data.target !== hls) return;
                if (data.dmg && data.dmg > 0) {
                    const arr = hls.state._hlsTaken;
                    if (Array.isArray(arr) && arr.length > 0) arr[arr.length - 1] += data.dmg;
                }
                // core/12 写在本击的 absorbed 量：护盾吸收行挂攻击者本击的攻击组
                if (hls.state._shieldAbsorbed > 0) {
                    pushInfo(data, `<span class="gold">🛡️ 寒离飒护盾吸收 ${hls.state._shieldAbsorbed} 点伤害（剩余 ${Math.floor(hls.state._shield || 0)}）</span>`);
                }
            });

            // —— 蓄力回合：跳过行动（core/11 声明通道，产 PASS 行）——
            eventBus.on(SIGNAL_TYPES.BEFORE_ACTION_SELECT, L.BEFORE_ACTION.BUTTERFLY_SKIP, (data) => {
                if (data.unit !== hls) return;
                if ((hls.state._hlsCharging || 0) !== 1) return;
                hls.state._hlsCharging = 2;
                data.declaration.skip = true;
                announce({ log: data.log }, `🌀 ${hls.name} 蓄力中（本回合不行动）`);
            });

            // —— 回合开始：寒毒 tick + 承伤桶滚动 + 蓄力结算 ——
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, L.ROUND_START.XUANMING_POISON + 1, (data) => {
                const allUnits = [...(data.A || []), ...(data.B || [])];

                // 寒毒结算（本组件自管，不依赖鹿杖客是否在场）
                allUnits.forEach(u => {
                    if (!u.alive) return;
                    const st = u.state._hlsHanDu;
                    if (!st || st.remaining <= 0) return;
                    st.remaining--;
                    const idx = Math.min(st.dotPercents.length - 1, st.dotPercents.length - 1 - st.remaining);
                    const dot = Math.floor(u.maxHp * (st.dotPercents[idx] || 0));
                    if (dot <= 0) return;
                    data.declarations.push({ type: EFFECT_TYPES.ROUND_STAT_GRANT, field: 'hp', delta: -dot, target: u, source: hls, reason: '寒毒' });
                    data.log.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: { unitName: u.name, unitUid: u.uid, camp: u.camp, skillName: '寒毒', note: `❄️ 寒毒发作：${u.name} 损失 ${dot} 点生命` } });
                    recordHpAudit(u, 'hlsHanDuDot', -dot, '寒毒');
                });

                // 蓄力结算（下回合结束时 → 落在下一步的回合开始，战报紧接上回合末）
                if ((hls.state._hlsCharging || 0) === 2) {
                    hls.state._hlsCharging = 0;
                    if (hls.alive) {
                        const enemies = enemyOf();
                        const buckets = Array.isArray(hls.state._hlsTaken) ? hls.state._hlsTaken.slice(-3) : [];
                        const trueDmg = Math.floor(buckets.reduce((s, v) => s + (v || 0), 0));
                        const half = Math.floor((hls.state._hlsLastDmg || 0) * (xl.halfRatio ?? 0.5));
                        const HIT_POS = [4, 6, 7, 9], TRUE_POS = [2, 5, 8];
                        const lines = [];
                        enemies.forEach(u => {
                            if (!u.alive) return;
                            if (HIT_POS.includes(u.pos) && half > 0) {
                                data.declarations.push({ type: EFFECT_TYPES.ROUND_STAT_GRANT, field: 'hp', delta: -half, target: u, source: hls, reason: '蓄力·扇形' });
                                lines.push(`${u.name} −${half}`);
                            } else if (TRUE_POS.includes(u.pos) && trueDmg > 0) {
                                data.declarations.push({ type: EFFECT_TYPES.ROUND_STAT_GRANT, field: 'hp', delta: -trueDmg, target: u, source: hls, reason: '蓄力·真伤' });
                                lines.push(`${u.name} −${trueDmg}（真伤）`);
                            }
                        });
                        announce(data, `💥 ${hls.name} 蓄力爆发${lines.length ? '：' + lines.join('、') : '（范围内无目标）'}`);
                        // 蓄力结束护盾消散
                        hls.state._shield = 0;
                    }
                }

                // 承伤桶滚动：保留最近 3 桶，新桶承载本回合
                const arr = Array.isArray(hls.state._hlsTaken) ? hls.state._hlsTaken : [];
                arr.push(0);
                hls.state._hlsTaken = arr.slice(-3);
                hls.state._shieldAbsorbed = 0;
            });
        }
    };
}
