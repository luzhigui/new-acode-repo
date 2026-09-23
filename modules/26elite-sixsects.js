// V6.11.0 | ~22000 bytes | 2026-09-23 胖远桥改版：嘲讽/打歪合并为攻击前二选一（正义国字脸全体嘲讽+减半 / 年轻气盛随机×1.5+击退眩晕），莽撞 +3
export const VER = 'modules/26elite-sixsects.js V6.11.0';
import { registerElite } from '../core/08-elite-registry.js';
import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { SIGNAL_TYPES, FACT_TYPES, BUFF_TYPES, CAMP_TYPES, ROLE_TYPES } from '../infra/56-battle-enums.js';
import { applyStatChange, addMod, getStat, getBattleRng, resolvePushOrStun } from '../core/13battle-shared.js';
import { EFFECT_TYPES, EXECUTION_LAYER as L } from '../infra/50-event-bus.js';
import { canBeTargeted } from '../core/03battle-utils.js';
import { spawnUnit, findFreePos } from '../core/05battle-horse.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { FX_SIGNALS } from '../infra/55-fx-signals.js';

// 宋青书
export function createSongQingshuComponent() {
    return {
        name: '宋青书',
        register(eventBus, A, B, log) {}
    };
}

// 周芷若
export function createZhouZhiruoComponent() {
    return {
        name: '周芷若',
        register(eventBus, A, B, log) {}
    };
}

// 张三丰（六大派·防战）：不攻击的续航核心
// 技能1 生生不息 / 技能3 八卦阵 / 技能5 第五回合严阵以待
// 技能4 不争（仅剩一人判负）在 core/11 的胜负判定里
export function createZhangSanfengComponent() {
    return {
        name: '张三丰',
        register(eventBus, A, B, log) {
            const zhang = B.find(u => u.isZhangSanfeng && u.alive);
            if (!zhang) return;

            const s = getSkillParams('张三丰', 'endlessBreath');
            if (!s) throw new Error('缺技能参数: 张三丰.endlessBreath');
            const ba = getSkillParams('张三丰', 'baguaArray');
            if (!ba) throw new Error('缺技能参数: 张三丰.baguaArray');
            const tf = getSkillParams('张三丰', 'tenRoundFortify');
            if (!tf) throw new Error('缺技能参数: 张三丰.tenRoundFortify');

            // 生生不息：只回 healPct 上限（三处触发共用：回合开始 / 轮到自己 / 八卦阵）。加防不在这里——加防属于八卦阵（掉攻的同时加防）
            // 2026-09-21 溢出转嫁：自身回不满的那部分（满血时即全部）转给随机一名存活友方，
            // 拒马也算友方；满血队友也可被选中（选中即作废，不改选）；随机走战斗 RNG（getBattleRng），保证 PVP 双端同源
            function triggerEndlessBreath(unit, log) {
                if (!unit || !unit.alive) return;
                const heal = Math.floor(unit.maxHp * s.healPct);
                const hpBefore = unit.hp;
                applyStatChange(unit, 'hp', heal, null, '生生不息');
                const healed = Math.round(Math.max(0, unit.hp - hpBefore));
                const overflow = Math.max(0, heal - healed);

                // 溢出转嫁：从「存活友方」里随机挑一个（不含自己，满血也可被选中）；挑中满血者则该次溢出作废，不再改选
                let receiver = null;
                let receiverHealed = 0;
                if (overflow > 0) {
                    const cands = B.filter(u => u.alive && u.uid !== unit.uid);
                    if (cands.length > 0) {
                        const pick = cands[getBattleRng().nextInt(0, cands.length - 1)];
                        const rHpBefore = pick.hp;
                        // source 必须传张三丰：统计层按产出者记账（core/13 `(source||target).healDone`），
                        // 不传 source 会把溢出治疗记到接盘队友头上，张三丰的治疗量看起来少一大截
                        applyStatChange(pick, 'hp', overflow, unit, '生生不息·溢出');
                        receiver = pick;
                        // 队友可能只差一点点血（或本就满血），实际收到的比溢出量少——飘字和日志都报实际值
                        receiverHealed = Math.round(Math.max(0, receiver.hp - rHpBefore));
                    }
                }

                // 2026-09-17 飘字：三处触发共用（回合开始 / 轮到自己 / 八卦阵）；2026-09-20 溢出接盘者单独飘一条
                if (!GlobalStore.get('fastForwardActive')) {
                    // 太极印：三处触发共用（回合开始 / 轮到自己 / 八卦阵）。
                    // 1 号位会出现「回合开始 + 立刻轮到自己」两次紧邻——不去抖会连出两个，
                    // 由 fx/80 showMeditateEffect 内部按 uid 去抖（1.2s），此处只管发。
                    eventBus.emit(FX_SIGNALS.MEDITATE, { unit });
                    if (healed > 0) eventBus.emit(FX_SIGNALS.HEAL_FLOAT, { unit, amount: healed });
                    if (receiverHealed > 0) eventBus.emit(FX_SIGNALS.HEAL_FLOAT, { unit: receiver, amount: receiverHealed });
                }
                // 2026-09-17 日志：走 fact（两处触发都进主 log，随 step 渲染）
                if (log) {
                    log.push({
                        factType: FACT_TYPES.ENDLESS_BREATH,
                        data: {
                            unitName: unit.name, unitUid: unit.uid,
                            heal: healed,
                            overflow,
                            overflowToName: receiver ? receiver.name : null,
                            overflowHealed: receiverHealed
                        }
                    });
                }
            }

            // 技能1：回合开始时触发（2026-09-20 曾取消，同日恢复——第二关张三丰续航偏弱）
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, 12, (data) => {
                if (!zhang.alive) return;
                triggerEndlessBreath(zhang, data.log);
            });

            // 技能1：轮到自己行动完成时触发（「如沐春风」2026-09-20 取消）
            eventBus.on(SIGNAL_TYPES.ON_UNIT_ACTED, 50, (data) => {
                const actor = data.unit;
                if (!actor || !actor.alive || !actor.isZhangSanfeng) return;
                triggerEndlessBreath(actor, data.log);
            });

            // 技能3：八卦阵——被攻击时 50% 概率削自身攻 1（攻 > atkFloor 才触发），掉攻的同时加防，并触发生生不息
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, 45, (data) => {
                if (data.target !== zhang || !zhang.alive) return;
                if (!data.dmg || data.dmg <= 0) return;
                if (getStat(zhang, 'atk') <= ba.atkFloor) return;
                const rng = getBattleRng();
                if (rng.nextInt(1, 100) > ba.procChance * 100) return;
                addMod(zhang, 'atk', { source: '八卦阵', value: -ba.atkCost, ttl: 'permanent', group: 'baguaArray', op: 'add' });
                addMod(zhang, 'def', { source: '八卦阵', value: ba.defGain, ttl: 'permanent', group: 'baguaArray', op: 'add' });
                triggerEndlessBreath(zhang, data.log);
                if (data.group && data.group.data && data.group.data.entries) {
                    data.group.data.entries.push({ type: 'info', text: `<span class="gold">☯ 八卦阵：张三丰攻击-${ba.atkCost}、防御+${ba.defGain}，触发生生不息</span>` });
                }
            });

            // 技能5：第 5 回合结束后仍未分胜负（即第 6 回合开始）→ 张三丰获得严阵以待（仅限自身）
            // 2026-09-17 不走 B._activeBuffs：那条会让六大派全体防战都吃到；改为直接挂词条 + 组件自算反弹
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, 45, (data) => {
                if (!zhang.state._tenRoundFired) {
                    zhang.state._roundCountForFortify = (zhang.state._roundCountForFortify || 0) + 1;
                    if (zhang.state._roundCountForFortify <= tf.round) return;
                    zhang.state._tenRoundFired = true;
                }
                // 防御 +50%（ttl: round，每回合开始重挂，跟明教同源参数）
                addMod(zhang, 'def', { source: '严阵以待', value: CONFIG.BUFFS.fortify.defBonus, ttl: 'round', op: 'mul', group: 'fortify' });
                if (data.log) {
                    data.log.push({
                        factType: FACT_TYPES.BUFF_SUMMARY,
                        data: {
                            buff: { key: BUFF_TYPES.FORTIFY, name: '严阵以待', remaining: Infinity },
                            allyTeamUids: [zhang.uid]
                        }
                    });
                }
            });

            // 严阵以待反弹：仅张三丰自身（不走 camp buff 检查，故不受 core/12 那条影响）
            // 原版公式在 core/12 = floor((atkAct - 格挡量)/2)，此处按"实际伤害的一半"近似
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, 46, (data) => {
                if (!zhang.state._tenRoundFired || !zhang.alive) return;
                if (data.target !== zhang) return;
                if (!data.dmg || data.dmg <= 0) return;
                const attacker = data.unit;
                if (!attacker || !attacker.alive || attacker === zhang) return;
                const rebound = Math.max(1, Math.floor(data.dmg / 2));
                if (!data.declarations) data.declarations = [];
                data.declarations.push({
                    type: EFFECT_TYPES.REBOUND,
                    value: rebound,
                    source: zhang,
                    target: attacker,
                    hasSister: false,
                    factType: FACT_TYPES.FORTIFY_REBOUND,
                    factData: { reboundDmg: rebound, unitName: attacker.name, hasSister: false, attackerUid: attacker.uid, unitUid: zhang.uid }
                });
            });
        }
    };
}

// 胖远桥（六大派·武当·战士）：莽撞 / 正义国字脸 / 年轻气盛
// 2026-09-22 新增；2026-09-23 改版：嘲讽与打歪合并为「每次攻击前二选一」——
//   血越高越容易发动正义国字脸（全体敌人本回合后续只能打他，且对其伤害减半），
//   攻越高越容易发动年轻气盛（随机目标 ×1.5 + 击退，退无可退则眩晕）。
// 第三关与宋青书每局随机二选一（content 的 encounters.squadVariants["3"]）。
// 三个技能全在本组件闭环：击退/眩晕复用 core/13 的公共 fact，其余日志走 group.data.entries。
export function createPangYuanQiaoComponent() {
    return {
        name: '胖远桥',
        register(eventBus, A, B, log) {
            // 不写死阵营：core/11 固定传（A=明教 / B=六大派），这里按身份标记在两侧找，
            // 胖远桥将来换边也照样生效
            const pang = [...A, ...B].find(u => u.isPangYuanQiao && u.alive);
            if (!pang) return;

            const rage = getSkillParams('胖远桥', 'rageOnHit');
            if (!rage) throw new Error('缺技能参数: 胖远桥.rageOnHit');
            const face = getSkillParams('胖远桥', 'righteousFace');
            if (!face) throw new Error('缺技能参数: 胖远桥.righteousFace');
            const young = getSkillParams('胖远桥', 'youngBlood');
            if (!young) throw new Error('缺技能参数: 胖远桥.youngBlood');

            function pushInfo(data, text) {
                if (data && data.group && data.group.data && data.group.data.entries) {
                    data.group.data.entries.push({ type: 'info', text });
                }
            }

            // 技能1 莽撞（被动）：每次被攻击后自身攻击 +atkPerHit，永久累计、无上限
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.PANG_RAGE, (data) => {
                if (data.target !== pang || !pang.alive) return;
                if (!data.dmg || data.dmg <= 0) return;
                addMod(pang, 'atk', { source: '莽撞', value: rage.atkPerHit, ttl: 'permanent', group: 'rageOnHit', op: 'add' });
                pushInfo(data, `<span class="gold">💢 莽撞：胖远桥挨了打，攻击+${rage.atkPerHit}（当前 ${Math.floor(getStat(pang, 'atk'))}）</span>`);
            });

            // 技能2/3 二选一（每次攻击前掷一次，必触发其一）：
            //   T = 0.10 + (atk - 30)/200      —— 打歪阈值，攻击越高 T 越大
            //   p_打歪 = clamp((1 - 血量比) / (1 - T), 0, 1)，p_嘲讽 = 1 - p_打歪
            //   满血 → 必嘲讽；血量 ≤ T → 必打歪
            eventBus.on(SIGNAL_TYPES.BEFORE_SELECT_TARGET, L.BEFORE_SELECT_TARGET.PANG_CLUMSY, (data) => {
                if (data.unit !== pang || !pang.alive) return;
                pang.state._clumsyHit = false;
                pang.state._tauntFired = false;
                const cands = (data.validTargets || []).filter(t => t && t.alive && t !== pang);
                if (cands.length === 0) return;
                const rng = getBattleRng();
                const hpRatio = pang.maxHp > 0 ? pang.hp / pang.maxHp : 1;
                const threshold = Math.min(0.95, 0.10 + (getStat(pang, 'atk') - 30) / 200);
                const clumsyProb = Math.min(1, Math.max(0, (1 - hpRatio) / (1 - threshold)));
                if (rng.next() < clumsyProb) {
                    // 年轻气盛（打歪）：随机挑一名敌人，×dmgMultiplier 并附带击退/眩晕
                    data.declaration.targetResult = cands[rng.nextInt(0, cands.length - 1)];
                    pang.state._clumsyHit = true;
                    return;
                }
                // 正义国字脸（嘲讽）：全体敌人本回合后续只能打胖远桥（标记回合级，不消耗）
                for (const foe of cands) foe.state._tauntedByPang = true;
                pang.state._tauntFired = true;
            });

            // 年轻气盛：该次伤害 ×dmgMultiplier（DMG_MULTIPLIER 修饰器由 core/12 calcFinalDamage 消费）
            eventBus.on(SIGNAL_TYPES.BEFORE_DAMAGE_CALC, L.BEFORE_DAMAGE_CALC.PANG_YOUNG_MULT, (data) => {
                if (data.unit !== pang || !pang.state._clumsyHit) return;
                data.declarations.push({ type: EFFECT_TYPES.DMG_MULTIPLIER, value: young.dmgMultiplier, source: pang, label: '年轻气盛' });
            });

            // 年轻气盛：命中后击退（退无可退则眩晕）——与乘风突袭共用 core/13 的判定
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.PANG_CLUMSY_LOG, (data) => {
                if (data.unit !== pang || !pang.state._clumsyHit) return;
                pang.state._clumsyHit = false;
                const tgt = data.target;
                if (!tgt || !tgt.alive) return;
                pushInfo(data, `<span class="gold">😵 年轻气盛：胖远桥一拳打歪，招呼到 ${tgt.name} 身上（伤害×${young.dmgMultiplier}）</span>`);
                resolvePushOrStun(tgt, tgt.camp === CAMP_TYPES.ALLY ? A : B, data.log, '😤 年轻气盛');
            });

            // 正义国字脸的台词：目标选择阶段没有日志通道，攒到本次攻击收尾（AFTER_ATTACK）再补一条
            eventBus.on(SIGNAL_TYPES.AFTER_ATTACK, L.AFTER_ATTACK.PANG_TAUNT, (data) => {
                if (data.unit !== pang || !pang.alive || !pang.state._tauntFired) return;
                pang.state._tauntFired = false;
                pushInfo(data, `<span class="gold">😤 正义国字脸：胖远桥横眉一喝，敌人本回合只能打他（伤害×${face.dmgMultiplier}）</span>`);
            });

            // 嘲讽的强制执行：被嘲讽者本回合每次选目标都改成胖远桥（标记回合级，回合开始统一清）
            eventBus.on(SIGNAL_TYPES.BEFORE_SELECT_TARGET, L.BEFORE_SELECT_TARGET.PANG_TAUNT_FORCE, (data) => {
                const u = data.unit;
                if (!u || !u.state) return;
                // 每次选目标先复位「本次被嘲讽」标记：上一次被嘲讽的攻击若闪避/未命中，
                // 走不到 BEFORE_DAMAGE_CALC 消费，不复位会把减伤带到下一次攻击
                u.state._tauntAttackActive = false;
                if (!u.state._tauntedByPang) return;
                if (!pang.alive || !canBeTargeted(pang)) return;
                data.declaration.targetResult = pang;
                u.state._tauntAttackActive = true;
            });

            // 被嘲讽者的该次伤害 ×dmgMultiplier（DMG_MULTIPLIER 修饰器由 core/12 calcFinalDamage 消费）
            eventBus.on(SIGNAL_TYPES.BEFORE_DAMAGE_CALC, L.BEFORE_DAMAGE_CALC.PANG_TAUNT_REDUCE, (data) => {
                const u = data.unit;
                if (!u || !u.state || !u.state._tauntAttackActive) return;
                u.state._tauntAttackActive = false;
                data.declarations.push({ type: EFFECT_TYPES.DMG_MULTIPLIER, value: face.dmgMultiplier, source: pang, label: '正义国字脸' });
            });

            // 未命中 / 被闪避路径的复位点
            eventBus.on(SIGNAL_TYPES.AFTER_MISS, L.AFTER_MISS.PANG_CLEAR, (data) => {
                if (data.unit === pang) pang.state._clumsyHit = false;
                if (data.unit && data.unit.state) data.unit.state._tauntAttackActive = false;
            });
        }
    };
}

// 灭绝师太（六大派·峨眉掌门·战士·M112）：反击 / 跟随攻击 / 每第三次攻击 / 召唤周芷若
// 2026-09-22 新增，作为新第七关精英。四技能分工：
//   反击、每第三次攻击 → 本组件闭环（日志走 group.data.entries 的 { type:'info', text }）
//   跟随攻击 → 走 content mechanics 的 followAttack 声明（core/15 安装）。
//     队友是任意普通单位、没法逐个登记，所以声明挂在灭绝自己名下，而不是像玄冥联动那样挂在攻击者名下。
//   召唤周芷若 → spawnUnit 落 2 号位（被占则 3/1/5），每局 1 次
export function createMieJueShiTaiComponent() {
    return {
        name: '灭绝师太',
        register(eventBus, A, B, log) {
            // 不写死阵营：按身份标记在两侧找，灭绝换边也照样生效
            const miejue = [...A, ...B].find(u => u.isMieJueShiTai && u.alive);
            if (!miejue) return;
            const myTeam = miejue.camp === CAMP_TYPES.ALLY ? A : B;

            const counter = getSkillParams('灭绝师太', 'counterAttack');
            if (!counter) throw new Error('缺技能参数: 灭绝师太.counterAttack');
            const third = getSkillParams('灭绝师太', 'thirdStrike');
            if (!third) throw new Error('缺技能参数: 灭绝师太.thirdStrike');
            const summon = getSkillParams('灭绝师太', 'summonZhou');
            if (!summon) throw new Error('缺技能参数: 灭绝师太.summonZhou');

            function pushInfo(data, text) {
                if (data && data.group && data.group.data && data.group.data.entries) {
                    data.group.data.entries.push({ type: 'info', text });
                }
            }

            // 技能1 反击：被攻击后 prob 概率反击攻击者，伤害 ×dmgRatio，不可闪避，无每回合上限。
            // 走 extraRequests 而不是直接 applyStatChange——反击要过完整伤害管线（防御/格挡/修饰器/记账），
            // 直接扣血等于绕开引擎。跨阵营换边与不可闪避由 core/10 的额外攻击循环处理。
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.MIEJUE_COUNTER, (data) => {
                if (data.target !== miejue || !miejue.alive) return;
                if (!data.dmg || data.dmg <= 0) return;
                const attacker = data.unit;
                if (!attacker || !attacker.alive || attacker === miejue) return;
                if (getBattleRng().next() >= (counter.prob ?? 1)) return;
                if (!data.extraRequests) data.extraRequests = [];
                data.extraRequests.push({
                    unit: miejue,
                    targetUid: attacker.uid,
                    reason: 'counterAttack',
                    ignoreDodge: true,
                    actedMode: 'restore',
                    actedSnapshot: miejue.state._acted,
                    priority: 12
                });
                pushInfo(data, `<span class="gold">🗡 灭绝师太反击 ${attacker.name}！（伤害×${counter.dmgRatio}，不可闪避）</span>`);
            });

            // 技能3 每第三次攻击：伤害 ×dmgMultiplier + 吸血 leechRatio。
            // 计数口径 =「打中过几次」：只在 AFTER_DAMAGE_APPLIED 累加，未命中/被闪避不计。
            // 因此 _thirdStrike 每次选目标时按「这次是不是第 3 的倍数」重算，不需要额外的清除点。
            eventBus.on(SIGNAL_TYPES.BEFORE_SELECT_TARGET, L.BEFORE_SELECT_TARGET.MIEJUE_THIRD_MARK, (data) => {
                if (data.unit !== miejue || !miejue.alive) return;
                miejue.state._thirdStrike = (((miejue.state._attackCount || 0) + 1) % 3) === 0;
            });

            eventBus.on(SIGNAL_TYPES.BEFORE_DAMAGE_CALC, L.BEFORE_DAMAGE_CALC.MIEJUE_THIRD_MULT, (data) => {
                if (data.unit !== miejue || !miejue.state._thirdStrike) return;
                data.declarations.push({ type: EFFECT_TYPES.DMG_MULTIPLIER, value: third.dmgMultiplier, source: miejue, label: '灭绝三击' });
            });

            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.MIEJUE_THIRD_LEECH, (data) => {
                if (data.unit !== miejue || !miejue.alive) return;
                if (!data.dmg || data.dmg <= 0) return;
                const isThird = !!miejue.state._thirdStrike;
                miejue.state._thirdStrike = false;
                miejue.state._attackCount = (miejue.state._attackCount || 0) + 1;
                if (!isThird) return;
                if (!data.declarations) data.declarations = [];
                data.declarations.push({ type: EFFECT_TYPES.LEECH, value: Math.floor(data.dmg * third.leechRatio), source: miejue });
                pushInfo(data, `<span class="gold">🩸 灭绝师太第 ${miejue.state._attackCount} 次出手：伤害×${third.dmgMultiplier}，吸血 ${Math.round(third.leechRatio * 100)}%</span>`);
            });

            // 技能4 召唤周芷若：每局 1 次，回合开始落 2 号位（被占则按 posPriority 顺延）
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, L.ROUND_START.MIEJUE_SUMMON, (data) => {
                if (!miejue.alive || miejue.state._summonedZhou) return;
                if (myTeam.some(u => u.isZhouZhiruo && u.alive)) return;
                const pos = findFreePos(myTeam, summon.posPriority || [2]);
                if (pos == null) return;
                const zhou = spawnUnit(myTeam, '周芷若', summon.m, ROLE_TYPES.WARRIOR, pos);
                miejue.state._summonedZhou = true;
                if (data && data.log) {
                    data.log.push({ factType: FACT_TYPES.SUMMON_UNIT, data: { summonName: zhou.name, summonUid: zhou.uid, pos, byName: miejue.name } });
                }
            });
        }
    };
}

registerElite('宋青书', createSongQingshuComponent);
registerElite('周芷若', createZhouZhiruoComponent);
registerElite('张三丰', createZhangSanfengComponent);
registerElite('胖远桥', createPangYuanQiaoComponent);
registerElite('灭绝师太', createMieJueShiTaiComponent);