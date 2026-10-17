// modules/27elite-mingjiao-hanlisa.js — 明教精英「寒离飒」：战士 · 弱精英 M107（与韦一笑同池）· 恒定 2 号位
//   ① 九阳神拳 / ② 寒冰神掌：每次普攻独立掷 50/50 —— 出九阳则回复自身最大生命 12%（同张无忌），
//      否则出寒冰神掌给被打目标挂寒毒（3 回合 4%→2%→1% 最大生命，同鹿杖客）；同一种可连续出，不锁
//   ③ 蓄力：凑齐「九阳 + 寒冰各至少出过一次」→ 本击后挂 20% 最大生命护盾并蓄力；
//      下一回合跳过行动，结算时对敌方 4/6/7/9 各造成「对该目标单独算一次普攻伤害 ÷ 2」、
//      2/5/8 造成真伤 = 最近三回合自身承受总伤害（按原始 dmg 累加）；结算完复原普攻循环，并把两个标记清零
//      —— 蓄过一次必须再各出一次九阳/寒冰才能再蓄（2026-10-17 老板实机指正「怎么老蓄力」）
// V1.3.1 | 2026-10-17 九阳/寒冰改「每次普攻独立 50/50 随机出」（删 done 门控，done 仅用于凑齐解锁蓄力）；
//           同一种技能可连续触发（2026-10-17 老板口径：「每下攻击 50% 九阳，50% 寒冰，不是看有没有触发过」）
// V1.3.0 | 2026-10-17 半伤改「逐目标重算一次普攻再取半」（老板拍板：不再用上一击固定值平铺）；
//           爆发演出改由 fx/93 经 FX_SIGNALS.HANLISA_BURST 播，本组件不再写 _hlsBurstAt/_hlsLastDmg
// V1.2.0 | 2026-10-17 ① 爆发结算后重置 _hlsJiuYangDone/_hlsHanBingDone（修「蓄完立刻就又蓄」）；
//           ② 九阳/寒冰触发时头顶飘弹幕（SKILL_ANNOUNCE + line:false + floatText，同灭绝反击/何太冲）
// V1.1.0 | 2026-10-17 结算时写 state._hlsBurstAt = clock.now，交 fx/90 按逻辑时间播 900ms 爆发演出
// V1.0.0 | ~7600 bytes | 2026-10-17 新建（老板拍板设计定稿，见 想法和优化.md 附录）
export const VER = 'modules/27elite-mingjiao-hanlisa.js V1.3.1';
import { getSkillParams } from '../core/01config-5v5-test.js';
import { getBattleRng, recordHpAudit, getStat } from '../core/13battle-shared.js';
import { calcDamage } from '../infra/51-core-utils.js';
import { eventBus, EXECUTION_LAYER as L, EFFECT_TYPES } from '../infra/50-event-bus.js';
import { SIGNAL_TYPES, FACT_TYPES, CAMP_TYPES } from '../infra/56-battle-enums.js';
import { FX_SIGNALS } from '../infra/55-fx-signals.js';

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
            // 头顶弹幕（2026-10-17 老板要的「技能1/技能2 出手说明」）：复用灭绝反击/何太冲的
            //   SKILL_ANNOUNCE + floatText/floatUid 通道（render/38 → SKILL_FLOAT → fx/80 头顶放大上浮）；
            //   line:false → 不落战报行（战报行已由本击攻击组的 info 行承担）
            const announceFloat = (ctx, skillName, text) => {
                if (!ctx || !Array.isArray(ctx.log)) return;
                ctx.log.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: { unitName: hls.name, unitUid: hls.uid, camp: hls.camp, skillName, note: text, line: false, floatText: text, floatUid: hls.uid } });
            };
            const enemyOf = () => (hls.camp === CAMP_TYPES.ALLY ? B : A);

            // —— 普攻命中后：九阳 / 寒毒 / 解锁蓄力 ——
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.LEECH + 2, (data) => {
                if (data.unit !== hls) return;
                if (data.unit.state._isLinkAttack) return;      // 额外/被动出手不计
                if (!data.dmg || data.dmg <= 0) return;
                const target = data.target;
                if (!target) return;

                // ①/② 每次普攻独立掷一次 50/50：出九阳（回最大生命 healPct）或出寒冰（给被打目标挂寒毒）；
                //   与「本循环是否触发过」无关，同一种可以连出多次（2026-10-17 老板口径）
                if (getBattleRng().next() < (jy.prob ?? 0.5)) {
                    hls.state._hlsJiuYangDone = true;   // 标记只为「凑齐解锁蓄力」，不锁技能
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
                    announceFloat(data, '九阳神拳', `☀️ 九阳神拳${heal > 0 ? ' +' + heal : ''}`);
                // ② 寒冰神掌：另 50% —— 给被打目标挂寒毒（同一种可重复出）
                } else {
                    hls.state._hlsHanBingDone = true;   // 同样只用于凑齐解锁
                    target.state._hlsHanDu = { remaining: hb.duration ?? 3, dotPercents: [...(hb.dotPercents || [0.04, 0.02, 0.01])] };
                    const pctText = (hb.dotPercents || []).map(v => Math.round(v * 100) + '%').join('→');
                    pushInfo(data, `<span class="gold">❄️ 寒离飒寒冰神掌：${target.name} 寒气入体（${hb.duration ?? 3} 回合 ${pctText} 最大生命）</span>`);
                    announceFloat(data, '寒冰神掌', '❄️ 寒冰神掌');
                }

                // ③ 凑齐两种（九阳 + 寒冰各至少出过一次）→ 本击结束即起蓄力（普攻照打，蓄力从下一回合开始）
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
                    // 老板口径（2026-10-17）:蓄过一次必须再各触发一次九阳/寒毒才能再蓄 —— 爆发结算即清标记，
                    //   否则两标记一直为 true，下一刀普攻立刻又满足起蓄条件（实机表现为「老蓄力」）
                    hls.state._hlsJiuYangDone = false;
                    hls.state._hlsHanBingDone = false;
                    if (hls.alive) {
                        const enemies = enemyOf();
                        const buckets = Array.isArray(hls.state._hlsTaken) ? hls.state._hlsTaken.slice(-3) : [];
                        const trueDmg = Math.floor(buckets.reduce((s, v) => s + (v || 0), 0));
                        const halfRatio = xl.halfRatio ?? 0.5;
                        const atk = getStat(hls, 'atk');
                        const HIT_POS = [4, 6, 7, 9], TRUE_POS = [2, 5, 8];
                        const lines = [];
                        const trueUids = [], halfUids = [];
                        enemies.forEach(u => {
                            if (!u.alive) return;
                            if (HIT_POS.includes(u.pos)) {
                                // 半伤：对每个目标各算一次普攻伤害（含其防御）再取半（2026-10-17 老板拍板）
                                const half = Math.floor(calcDamage(atk, getStat(u, 'def')) * halfRatio);
                                if (half <= 0) return;
                                data.declarations.push({ type: EFFECT_TYPES.ROUND_STAT_GRANT, field: 'hp', delta: -half, target: u, source: hls, reason: '蓄力·扇形' });
                                lines.push(`${u.name} −${half}`);
                                halfUids.push(u.uid);
                            } else if (TRUE_POS.includes(u.pos) && trueDmg > 0) {
                                data.declarations.push({ type: EFFECT_TYPES.ROUND_STAT_GRANT, field: 'hp', delta: -trueDmg, target: u, source: hls, reason: '蓄力·真伤' });
                                lines.push(`${u.name} −${trueDmg}（真伤）`);
                                trueUids.push(u.uid);
                            }
                        });
                        announce(data, `💥 ${hls.name} 蓄力爆发${lines.length ? '：' + lines.join('、') : '（范围内无目标）'}`);
                        // 蓄力轰拳爆发视觉：发信交 fx/93（fx/89 订阅；快进由 fx 侧拦）
                        if (trueUids.length || halfUids.length) {
                            eventBus.emit(FX_SIGNALS.HANLISA_BURST, { unit: hls, trueUids, halfUids, taken: trueDmg });
                        }
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
