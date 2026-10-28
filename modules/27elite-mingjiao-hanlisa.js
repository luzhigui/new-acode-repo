// modules/27elite-mingjiao-hanlisa.js — 明教精英「寒离飒」：战士 · 弱精英 M107（与韦一笑同池）· 恒定 2 号位
//   ① 九阳神拳 / ② 寒冰神掌：每次普攻独立掷 50/50 —— 出九阳则回复自身最大生命 12%（同张无忌），
//      否则出寒冰神掌给被打目标挂寒毒（3 回合 4%→2%→1% 最大生命，同鹿杖客）；同一种可连续出，不锁
//   ③ 蓄意轰拳：凑齐「九阳 + 寒冰各至少出过一次」→ 本击后挂 20% 最大生命护盾并蓄力；下一回合跳过行动，
//      蓄力回合收尾（ON_ROUND_END·forced:true）轰出蓄意轰拳，基数 N = 最近三回合自身承受总伤害：
//      玩家瞄准敌方一格按九位九形取格——目标格 N/2、相邻格 N/4、更远格 N/6（全部真伤）；不瞄=全屏 123 各 N/3、456 各 N/4、789 各 N/5；
//      瞄 8 特例：8 吃 N/2 且被轰穿中列落 2 号位撞边眩晕，途经 2/5 被崩向两侧（一左一右）；轰完吸血 = 总伤害 1/3。
//      瞄准由「瞄准窗口标记步」（core/11 回合收尾前 yield）的播放层黑幕写 _hlsAim，否则随机前排兜底；
//      寒离飒开局常驻 _ctrlImmune（击退/换位/闪避反击眩晕只掉血不动窝，守卫在 core/12+13）。
//      结算完复原普攻循环并清两个标记——蓄过一次必须再各出一次九阳/寒冰才能再蓄（实机指正「怎么老蓄力」）
// V2.2.3 | 2026-10-27 | ~28060 bytes —— 双拳齐出两个标量参数去掉字面量默认值（原写死 0.4 / 0.5），改 register 期显式抛错：缺参数直接暴露，不静默按老口径算
export const VER = 'modules/27elite-mingjiao-hanlisa.js V2.2.3';
import { getSkillParams } from '../core/01config-5v5-test.js';
import { getFronts } from '../core/03battle-utils.js';
import { getBattleRng, recordHpAudit, moveUnitPosition, emitEvent, previewHeal } from '../core/13battle-shared.js';
import { emitStateChange } from '../infra/59-state-change.js';
import { eventBus, EXECUTION_LAYER as L, EFFECT_TYPES } from '../infra/50-event-bus.js';
import { resolveRoundStatGrants } from '../core/16effect-handlers.js';
import { resolveDeaths } from '../core/12battle-attack-steps.js';
import { SIGNAL_TYPES, FACT_TYPES, CAMP_TYPES, STATE_CHANGE_TYPES, UNIT_EVENT_TYPES } from '../infra/56-battle-enums.js';
import { pushInfo, pushSkillAnnounce } from './23elite-helpers.js';

export function createHanLiSaComponent() {
    return {
        name: '寒离飒',
        register(eventBus, A, B, log) {
            const hls = [...A, ...B].find(u => u.isHanLiSa && u.alive);
            if (!hls) return;

            // 控制位移免疫·开局常驻（老板口径：被闪避反击/击退/换位只掉血不动窝；守卫在 core/12+13）
            hls.state._ctrlImmune = true;
            // 蓄意轰拳爆发序号（fx/93 引擎直发与回放桥重放按 seq 去重）
            let burstSeq = 0;

            const jy = getSkillParams('寒离飒', 'jiuYangQuan');
            if (!jy) throw new Error('缺技能参数: 寒离飒.jiuYangQuan');
            const hb = getSkillParams('寒离飒', 'hanBingShenZhang');
            if (!hb) throw new Error('缺技能参数: 寒离飒.hanBingShenZhang');
            const xl = getSkillParams('寒离飒', 'xuLi');
            if (!xl) throw new Error('缺技能参数: 寒离飒.xuLi');
            // 双拳齐出的两个标量参数只认 content 真值（不做 `?? 字面量` 兜底）：缺了就当场报错。
            //   若只删兜底不校验，比较式会与 undefined 恒不成立 ⇒ 变成「任何血量都追加一拳」的静默错行为。
            if (xl.doublePunchHpPct == null || xl.doublePunchProb == null) {
                throw new Error('缺技能参数: 寒离飒.xuLi.doublePunchHpPct / doublePunchProb');
            }

            const announce = (ctx, note) => {
                if (!ctx || !Array.isArray(ctx.log)) return;
                pushSkillAnnounce(ctx.log, hls, '蓄力', note);
            };
            // 头顶弹幕（「技能1/技能2 出手说明」）：复用灭绝反击/何太冲的
            //   SKILL_ANNOUNCE + floatText/floatUid 通道（render/38 → SKILL_FLOAT → fx/80 头顶放大上浮）；
            //   line:false → 不落战报行（战报行已由本击攻击组的 info 行承担）
            const announceFloat = (ctx, skillName, text) => {
                if (!ctx || !Array.isArray(ctx.log)) return;
                pushSkillAnnounce(ctx.log, hls, skillName, text, { line: false, floatText: text, floatUid: hls.uid });
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
                //   与「本循环是否触发过」无关，同一种可以连出多次
                if (getBattleRng().next() < (jy.prob ?? 0.5)) {
                    hls.state._hlsJiuYangDone = true;   // 标记只为「凑齐解锁蓄力」，不锁技能
                    // 满血转护盾：rawOnly 拿打折后应发额度（不夹 maxHp 缺口），应发 − 实回 = 溢出，
                    //   进永久护盾 _permShield（与蓄力临时 _shield 分家，整场累积）
                    const rawNominal = Math.floor(hls.maxHp * (jy.healPct ?? 0.12));
                    const nominal = previewHeal(hls, rawNominal, true);
                    // 实回按 core/16 HEAL handler 口径（先夹 maxHp 缺口、再打折），保证文案/飘字 = 血条
                    const heal = previewHeal(hls, Math.min(rawNominal, Math.max(0, hls.maxHp - hls.hp)));
                    const shieldGain = Math.max(0, nominal - heal);
                    if (heal > 0) {
                        if (!data.declarations) data.declarations = [];
                        data.declarations.push({
                            // 声明量填原值：core/16 HEAL handler 落账时还会再走一次截脉/寒毒打折
                            type: EFFECT_TYPES.HEAL, value: rawNominal, source: hls,
                            factType: FACT_TYPES.HEAL,
                            factData: { unitName: hls.name, heal, hpBefore: Math.floor(hls.hp), hpAfter: Math.floor(hls.hp + heal), unitUid: hls.uid, icon: '☀️', label: '左拳·九阳回复', mode: 'plusTrail', anchorVerb: '回复' }
                        });
                        recordHpAudit(hls, 'hlsJiuYangHeal', heal, '左拳·九阳治疗'); // 账本记实际落地值（与 fact heal 同口径）
                    }
                    if (shieldGain > 0) {
                        hls.state._permShield = (hls.state._permShield || 0) + shieldGain;
                    }
                    const healText = heal > 0 ? `回复 ${heal} 点生命` : '满血';
                    const shieldText = shieldGain > 0 ? `，${heal > 0 ? '溢出' : ''}转化为 ${shieldGain} 点护盾` : '';
                    pushInfo(data, `<span class="gold">☀️ 寒离飒左拳·九阳：${healText}${shieldText}</span>`);
                    announceFloat(data, '左拳·九阳', `☀️ 左拳·九阳${heal > 0 ? ' +' + heal : ''}${shieldGain > 0 ? ` 🛡+${shieldGain}` : ''}`);
                // ② 右拳·寒冰：另 50% —— 给被打目标挂寒毒
                } else {
                    hls.state._hlsHanBingDone = true;   // 同样只用于凑齐解锁
                    const prev = target.state._hlsHanDu;
                    const stacks = (prev && prev.remaining > 0 && prev.stacks > 0 ? prev.stacks : 0) + 1;
                    target.state._hlsHanDu = { remaining: hb.duration ?? 3, dotPercents: [...(hb.dotPercents || [0.04])], stacks };
                    const pctText = Math.round(((hb.dotPercents || [0.04])[0] || 0) * 100);
                    pushInfo(data, `<span class="gold">❄️ 寒离飒右拳·寒冰：${target.name} 寒气入体（${hb.duration ?? 3} 回合，每回合 ${pctText}%×${stacks} 层最大生命）</span>`);
                    announceFloat(data, '右拳·寒冰', '❄️ 右拳·寒冰');
                }

                // ③ 凑齐两种（九阳 + 寒冰各至少出过一次）→ 本击结束即起蓄力（普攻照打，蓄力从下一回合开始）
                if (hls.state._hlsJiuYangDone && hls.state._hlsHanBingDone && (hls.state._hlsCharging || 0) === 0) {
                    if (xl.shieldPct == null) throw new Error('缺技能参数: 寒离飒.xuLi.shieldPct');
                    const shield = Math.floor(hls.maxHp * xl.shieldPct);
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
                // core/12 写在本击的 absorbed 量：谁的日志归谁——护盾吸收是寒离飒的承伤反应，
                //   不再插进攻击者的攻击组（pushInfo），改为紧跟本击攻击组之后的独立播报行
                if (hls.state._shieldAbsorbed > 0) {
                    pushSkillAnnounce(data.log, hls, '护盾吸收', `🛡️ 寒离飒护盾吸收 ${hls.state._shieldAbsorbed} 点伤害（剩余 ${Math.floor(hls.state._shield || 0)}）`);
                }
            });

            // ——低血双拳：血量 < doublePunchHpPct 时 doublePunchProb 概率追加一拳 ——
            //   走 extraRequests（core/10 AFTER_ATTACK 口统一执行），第二拳是完整独立攻击：
            //   独立选敌（targetUid=null，第一下打死就换人）、独立命中/伤害、独立触发九阳/寒冰。
            //   reason 刻意不进 LINK_REASONS —— 否则会被置 _isLinkAttack，技能特效 handler 首行就 return。
            //   _hlsDoubleFired 回合级防连锁（第二拳的 AFTER_ATTACK 直接返回）。
            eventBus.on(SIGNAL_TYPES.AFTER_ATTACK, 12, (data) => {
                if (data.unit !== hls || !hls.alive) return;
                if (hls.state._isLinkAttack) return;
                if (hls.state._hlsDoubleFired) return;
                const hpPct = hls.maxHp > 0 ? hls.hp / hls.maxHp : 1;
                if (hpPct >= xl.doublePunchHpPct) return;
                if (getBattleRng().next() >= xl.doublePunchProb) return;
                hls.state._hlsDoubleFired = true;
                if (!data.extraRequests) data.extraRequests = [];
                data.extraRequests.push({
                    unit: hls,
                    targetUid: null,
                    reason: 'hanlisaDouble',
                    actedMode: 'restore',
                    actedSnapshot: hls.state._acted,
                    priority: 12
                });
                pushSkillAnnounce(data.log, hls, '双拳', `👊👊 寒离飒双拳齐出！（生命 ${Math.floor(hls.hp)}/${Math.floor(hls.maxHp)}）`, { floatText: '👊👊', floatUid: hls.uid });
            });

            // —— 蓄力回合：跳过行动（core/11 声明通道，产 PASS 行）——
            eventBus.on(SIGNAL_TYPES.BEFORE_ACTION_SELECT, L.BEFORE_ACTION.BUTTERFLY_SKIP, (data) => {
                if (data.unit !== hls) return;
                if ((hls.state._hlsCharging || 0) !== 1) return;
                hls.state._hlsCharging = 2;
                data.declaration.skip = true;
                announce({ log: data.log }, `🌀 ${hls.name} 蓄力中（本回合不行动）`);
            });

            // —— 回合开始：寒毒 tick + 承伤桶滚动（蓄意轰拳结算已迁 ON_ROUND_END·forced:true，V2.1）——
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, L.ROUND_START.XUANMING_POISON + 1, (data) => {
                const allUnits = [...(data.A || []), ...(data.B || [])];

                // 低血双拳的回合级闸门在此清（每回合最多一次）
                hls.state._hlsDoubleFired = false;

                // 寒毒结算（本组件自管，不依赖鹿杖客是否在场）
                allUnits.forEach(u => {
                    if (!u.alive) return;
                    const st = u.state._hlsHanDu;
                    if (!st || st.remaining <= 0) return;
                    st.remaining--;
                    // 不衰减 + 可叠加：固定首档 pct × stacks
                    const hdStacks = st.stacks || 1;
                    const dot = Math.floor(u.maxHp * (st.dotPercents[0] || 0) * hdStacks);
                    if (dot <= 0) return;
                    data.declarations.push({ type: EFFECT_TYPES.ROUND_STAT_GRANT, field: 'hp', delta: -dot, target: u, source: hls, reason: '寒毒' });
                    // 回填 dot 字段供数值对照器读（引擎数值零改动；recordHpAudit 仍用同一 dot 局部变量）
                    pushSkillAnnounce(data.log, u, '寒毒', `❄️ 寒毒发作：${u.name} 损失 ${dot} 点生命${hdStacks > 1 ? `（${hdStacks} 层）` : ''}`, { dot });
                    recordHpAudit(u, 'hlsHanDuDot', -dot, '寒毒');
                });


                // 承伤桶滚动：保留最近 3 桶，新桶承载本回合
                const arr = Array.isArray(hls.state._hlsTaken) ? hls.state._hlsTaken : [];
                arr.push(0);
                hls.state._hlsTaken = arr.slice(-3);
                hls.state._shieldAbsorbed = 0;
            });

            // —— 蓄意轰拳结算（回合收尾 ON_ROUND_END·forced:true；V2.1 老板口径：轰在蓄力回合末，
            //    战报行打印在「第N回合结束」线上方）——瞄准输入由「瞄准窗口标记步」（core/11 回合收尾前 yield）
            //    的播放层黑幕写入 _hlsAim*（与 generator 的 A/B 同引用直达此处）；未写=简单/全自动/快进/headless/PVP
            //    → 随机前排兜底（getBattleRng 保基线可复现）。
            eventBus.on(SIGNAL_TYPES.ON_ROUND_END, L.ROUND_END.HANLISA_BURST, (data) => {
                if (!data || !data.forced) return;   // 每单位行动后的 forced:false 广播不结算
                if ((hls.state._hlsCharging || 0) !== 2) return;
                hls.state._hlsCharging = 0;           // 无论死活都清（防阵亡复活后带陈旧蓄力状态爆发）
                if (!hls.alive) return;
                    // 蓄过一次必须再各触发一次九阳/寒毒才能再蓄 —— 爆发结算即清标记，
                    //   否则两标记一直为 true，下一刀普攻立刻又满足起蓄条件（实机表现为「老蓄力」）
                    hls.state._hlsJiuYangDone = false;
                    hls.state._hlsHanBingDone = false;
                    const decls = [];   // ROUND_END 无 declarations 通道，本地攒齐后统一走 core/16 应用器
                    if (hls.alive) {
                        const enemies = enemyOf();
                        const buckets = Array.isArray(hls.state._hlsTaken) ? hls.state._hlsTaken.slice(-3) : [];
                        const N = Math.floor(buckets.reduce((s, v) => s + (v || 0), 0));

                        // —— 瞄准位：player/42 回合末交互写入优先（华丽模式按住-拖-松手）；
                        //    没写 = 简单模式/全自动/快进/AI → 本处随机前排兜底（getBattleRng 保基线可复现）——
                        let aim = 0;
                        if (hls.state._hlsAimChosen) {
                            aim = Math.min(9, Math.max(0, hls.state._hlsAim | 0));
                        } else {
                            const fronts = getFronts(enemies);
                            if (fronts.length > 0) aim = fronts[getBattleRng().nextInt(0, fronts.length - 1)].pos;
                        }
                        hls.state._hlsAimChosen = false;
                        hls.state._hlsAim = 0;
                        hls.state._hlsAimHoldMs = 0; // 蓄力时长暂不影响伤害（口子留给未来 N1）

                        // —— 取格分档：九位九形（131 demo 老板定稿）+ 全屏兜底；档位=基数 N 的分母 ——
                        const tierOf = (a, p) => {
                            const r1 = Math.ceil(a / 3), c1 = a - (r1 - 1) * 3;
                            const r2 = Math.ceil(p / 3), c2 = p - (r2 - 1) * 3;
                            const d = Math.abs(r1 - r2) + Math.abs(c1 - c2);
                            return d <= 0 ? 'direct' : (d === 1 ? 'near' : 'far');
                        };
                        const shapes = xl.hitShapes;
                        if (!shapes) throw new Error('缺技能参数: 寒离飒.xuLi.hitShapes');
                        let cells;
                        if (aim >= 1 && aim <= 9 && Array.isArray(shapes[String(aim)])) {
                            if (!xl.tierDen) throw new Error('缺技能参数: 寒离飒.xuLi.tierDen');
                            if (xl.eightDen == null) throw new Error('缺技能参数: 寒离飒.xuLi.eightDen');
                            const den = xl.tierDen;
                            const eightDen = xl.eightDen;
                            cells = shapes[String(aim)].map(p => ({
                                pos: p,
                                tier: (aim === 8 && p !== 8) ? 'eight' : tierOf(aim, p),
                                den: (aim === 8 && p !== 8) ? eightDen : (den[tierOf(aim, p)] ?? 6)
                            }));
                        } else {
                            if (!xl.fullDen) throw new Error('缺技能参数: 寒离飒.xuLi.fullDen');
                            const fd = xl.fullDen;
                            cells = [[1, 2, 3, fd.row123, 'full123'], [4, 5, 6, fd.row456, 'full456'], [7, 8, 9, fd.row789, 'full789']]
                                .flatMap(([a, b, c, d, t]) => [a, b, c].map(p => ({ pos: p, tier: t, den: d })));
                        }

                        // —— 真伤声明（ROUND_STAT_GRANT：不吃防不吃闪避，与旧 2/5/8 真伤同通道）——
                        const lines = [], hits = [], bounces = [];
                        let flight = null, totalDealt = 0;
                        if (N > 0) {
                            cells.forEach(cell => {
                                const u = enemies.find(e => e.alive && e.pos === cell.pos);
                                if (!u) return;
                                const dmg = Math.floor(N / cell.den);
                                if (dmg <= 0) return;
                                decls.push({ type: EFFECT_TYPES.ROUND_STAT_GRANT, field: 'hp', delta: -dmg, target: u, source: hls, reason: '蓄意轰拳·真伤' });
                                // 第 106 轮补：轰拳真伤记账（纯记账，零游戏逻辑副作用）——该伤害经
                                //   applyStatChange 只落单位级 dmgDealt/dmgTaken、无按机制 group，数值网归不了因
                                //   （scan-groups 也因无 group 而看不见）。与同文件 hlsVamp/hlsHanDuDot 同范式，
                                //   供 stat-decl HLS_BURST_DMG 契约按 group 'hlsBurstDmg' 与 hlsBurst.hits 声明对账。
                                recordHpAudit(u, 'hlsBurstDmg', -dmg, '蓄意轰拳·真伤');
                                lines.push(`${u.name} −${dmg}（真伤）`);
                                hits.push({ uid: u.uid, pos: cell.pos, dmg, tier: cell.tier });
                                totalDealt += dmg;
                            });
                        }

                        // —— 瞄 8 特例：8 号被轰穿中列、落 2 号位（战场边缘）撞晕；途经 5/2 有人则崩向两侧（一左一右）——
                        if (aim === 8 && N > 0) {
                            const victim = enemies.find(e => e.alive && e.pos === 8);
                            if (victim) {
                                const SIDE_L = { 5: 4, 2: 1 }, SIDE_R = { 5: 6, 2: 3 };
                                const u5 = enemies.find(e => e.alive && e.pos === 5 && e !== victim);
                                const u2 = enemies.find(e => e.alive && e.pos === 2 && e !== victim);
                                let dir5 = null, dir2 = null;
                                if (u5 && u2) { // 两人都在：一左一右（老板 05:07 定稿）
                                    const r = getBattleRng().nextInt(0, 1);
                                    dir5 = r === 0 ? 'L' : 'R'; dir2 = r === 0 ? 'R' : 'L';
                                } else if (u5) { dir5 = getBattleRng().nextInt(0, 1) === 0 ? 'L' : 'R'; }
                                else if (u2) { dir2 = getBattleRng().nextInt(0, 1) === 0 ? 'L' : 'R'; }
                                // 崩飞落点：优先两侧（按一左一右方向），两侧皆满则环形顺延（拒马蛛规矩；2 号位留给 8 号落）
                                const bounceTo = (from, dir) => {
                                    const order = dir === 'R' ? [SIDE_R[from], SIDE_L[from]] : [SIDE_L[from], SIDE_R[from]];
                                    for (const p of order) if (p >= 1 && p <= 9 && !enemies.some(e => e.alive && e.pos === p)) return p;
                                    for (const p of [1, 3, 4, 6, 7, 9]) if (!enemies.some(e => e.alive && e.pos === p)) return p;
                                    return null; // 满员：原地不动
                                };
                                const doBounce = (u, from, dir) => {
                                    if (!u) return;
                                    const p = bounceTo(from, dir);
                                    if (p == null || p === from) return;
                                    moveUnitPosition(u, p, data.log);
                                    data.log.push({ factType: FACT_TYPES.WIND_ASSAULT_PUSH, data: { label: '蓄意轰拳·崩飞', target: { uid: u.uid, name: u.name }, behindUnit: null, oldPos: from, behindPos: p } });
                                    bounces.push({ uid: u.uid, from, to: p });
                                };
                                doBounce(u5, 5, dir5);
                                doBounce(u2, 2, dir2);
                                // 8 号本体：落 2 号位（撞战场边缘眩晕）；2 被占死不让位则退落最近空格，仍晕
                                let land = null;
                                if (!enemies.some(e => e.alive && e.pos === 2 && e !== victim)) land = 2;
                                else { for (const p of [5, 4, 6, 1, 3, 7, 9]) if (!enemies.some(e => e.alive && e.pos === p)) { land = p; break; } }
                                if (land != null && land !== 8) {
                                    moveUnitPosition(victim, land, data.log);
                                    data.log.push({ factType: FACT_TYPES.WIND_ASSAULT_PUSH, data: { label: '蓄意轰拳·轰飞', target: { uid: victim.uid, name: victim.name }, behindUnit: null, oldPos: 8, behindPos: land } });
                                    victim.state._stunned = true;
                                    emitEvent(victim, UNIT_EVENT_TYPES.HP_CHANGE, { hp: victim.hp, maxHp: victim.maxHp, alive: victim.alive, _stunned: true });
                                    emitStateChange(victim, STATE_CHANGE_TYPES.STUNNED, {}, data.log);
                                    data.log.push({ factType: FACT_TYPES.PUSH_STUN, data: { label: '蓄意轰拳', target: { uid: victim.uid, name: victim.name }, pos: land } });
                                    flight = { uid: victim.uid, from: 8, to: land };
                                }
                            }
                        }

                        // —— 吸血 = 总伤害 1/3（封顶缺失生命；正向 ROUND_STAT_GRANT 走 applyStatChange 治疗语义，吃截脉打折）——
                        let vamp = 0;
                        const vampDiv = xl.vampDiv;
                        if (vampDiv == null) throw new Error('缺技能参数: 寒离飒.xuLi.vampDiv');
                        if (totalDealt > 0 && vampDiv > 0) {
                            // 吸血飘字/载荷按实际落地值（截脉/寒毒打折后），避免战报与血条不符
                            const rawVamp = Math.min(Math.floor(totalDealt / vampDiv), Math.max(0, hls.maxHp - hls.hp));
                            vamp = previewHeal(hls, rawVamp);
                            if (vamp > 0) {
                                // 声明 delta 用原值（core/16 ROUND_STAT_GRANT 落账时还会打折一次）：
                                //   填 preview 值会变成二次打折
                                decls.push({ type: EFFECT_TYPES.ROUND_STAT_GRANT, field: 'hp', delta: rawVamp, target: hls, source: hls, reason: '蓄意轰拳·吸血' });
                                recordHpAudit(hls, 'hlsVamp', vamp, '蓄意轰拳吸血'); // 账本记实际落地值（与 SKILL_ANNOUNCE hlsBurst.vamp 同口径）
                            }
                        }

                        // —— 战报 + 爆发视觉（载荷全可序列化：回放/从机经 SKILL_ANNOUNCE 桥重放，fx/93 按 seq 去重）——
                        const isFull = aim < 1 || aim > 9 || !Array.isArray(shapes[String(aim)]);
                        const aimLabel = isFull ? '【全屏】' : `【瞄准 ${aim} 号位】`;
                        const burstPayload = { seq: ++burstSeq, apexUid: hls.uid, aim, taken: N, hits, flight, bounces, vamp };
                        pushSkillAnnounce(data.log, hls, '蓄意轰拳', `💥 ${hls.name} 蓄意轰拳${aimLabel}${lines.length ? '：' + lines.join('、') : (N > 0 ? '（范围内无目标）' : '（能量不足，未能轰出）')}${vamp > 0 ? `；轰拳吸血 +${vamp}` : ''}`, { hlsBurst: burstPayload });
                        // 结算应用：声明统一走 core/16 应用器；击杀落阵亡行（core/12 边裁）——都在 ROUND_END fact 之前。
                        // 爆发视觉不再引擎直发：SKILL_ANNOUNCE 载 hlsBurst 载荷由 render/38→39 舞台动作补发（单机/回放/从机同一通道，时序与战报行对齐）
                        resolveRoundStatGrants(decls);
                        resolveDeaths(data.A, data.B, data.log);
                        // 蓄力结束护盾消散
                        hls.state._shield = 0;
                    }
            });
        }
    };
}
