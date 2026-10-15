// modules/26elite-sixsects-pangyuanqiao.js — 六大派精英「胖远桥」：莽撞 / 正义国字脸 / 年轻气盛
// V6.27.0 | ~12800 bytes | 2026-10-15 出手声明前移：掷骰结果（国字脸加防 / 打歪倍率 + 出手蓄力上限）改在选敌完成后
//   （新信号 AFTER_SELECT_TARGET，早于命中/闪避判定）立即落日志 → 被闪避反击时也能看见「加防/加血」声明；
//   AFTER_ATTACK / AFTER_DAMAGE_APPLIED 里重复的 pushInfo 拆除，演出标记 pangTaunt/pangDefGain/pangClumsy 保留
// V6.26.0 | ~12240 bytes | 2026-10-15 三改（老板拍板）：出手蓄力每次攻击前 maxHp+hpPerAttack（国字脸 defGain 50→40 补偿，数值走 content）；
//   打歪倍率固定 2.0 改 dmgMultMin~dmgMultMax 随机（步长 dmgMultStep，本击定值存 _clumsyMult）
// V6.25.0 | 2026-10-13 自 modules/26elite-sixsects.js V6.24.2 拆出（纯搬移，数值/日志/fact 顺序零变化）
export const VER = 'modules/26elite-sixsects-pangyuanqiao.js V6.27.0';
import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { addMod, getStat, getBattleRng, resolvePushOrStun, refreshMaxHp } from '../core/13battle-shared.js';
import { canBeTargeted } from '../core/03battle-utils.js';
import { EFFECT_TYPES, EXECUTION_LAYER as L } from '../infra/50-event-bus.js';
import { SIGNAL_TYPES, FACT_TYPES, CAMP_TYPES } from '../infra/56-battle-enums.js';

// 胖远桥（六大派·武当·战士）：莽撞 / 正义国字脸 / 年轻气盛
// 2026-09-22 新增；2026-09-23 改版：嘲讽与打歪合并为「每次攻击前二选一」——
//   血越高越容易发动正义国字脸（全体敌人本回合后续只能打他，且自身防御永久+40、无上限叠加），
//   攻越高越容易发动年轻气盛（随机目标 ×2.0 + 击退，退无可退则眩晕）。
// 第三关与宋青书每局随机二选一（content 的 encounters.squadVariants["3"]）。
// 三个技能全在本组件闭环：击退/眩晕复用 core/13 的公共 fact；出手声明走 SKILL_ANNOUNCE（出手帧落行），其余日志走 group.data.entries。
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

            // 2026-10-15 出手声明暂存：PANG_CLUMSY 掷完骰写入，AFTER_SELECT_TARGET（选敌完成·出手前）落日志后清空。
            //   存结构化结果（kind + 数值），目标名在落日志时用信号里的 data.target 现取，
            //   避免掷骰时声明的目标被后续选敌处理器（嘲讽强制/幻影等）改写后名字对不上。
            let pendingDecl = null;

            // 技能1 莽撞（被动）：每次被攻击后自身攻击 +atkPerHit，永久累计、无上限
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.PANG_RAGE, (data) => {
                if (data.target !== pang || !pang.alive) return;
                if (!data.dmg || data.dmg <= 0) return;
                addMod(pang, 'atk', { source: '莽撞', value: rage.atkPerHit, ttl: 'permanent', group: 'rageOnHit', op: 'add' });
                // 2026-10-02 飘字：加攻量随本击 fact 走一格（此前只有金色战报行、头顶零飘字）。
                //   group.data === 本击 ATTACK fact 的 data（core/12 buildAttackGroup 同一对象），render/38 据此产
                //   STAT_CHANGE(atk) → render/39 发 ATK_BUFF_FLOAT → fx/80 在胖远桥头顶飘「⚔+N」。
                if (data.group && data.group.data) data.group.data.pangAtkGain = rage.atkPerHit;
                // 数值声明 fact：发实际 addMod 的带符号值，供体检对照器按 group='rageOnHit' 隔离比对
                if (data.log) {
                    data.log.push({
                        factType: FACT_TYPES.RAGE_ON_HIT,
                        data: { unitName: pang.name, atkDelta: rage.atkPerHit }
                    });
                }
                pushInfo(data, `<span class="gold">💢 莽撞：胖远桥挨了打，攻击+${rage.atkPerHit}（当前 ${Math.floor(getStat(pang, 'atk'))}）</span>`);
            });

            // 技能1 补充（2026-09-24）：流星赶月/乘风突袭的溅射（二次伤害）同样算「挨打」，与主目标口径一致。
            //   AFTER_DAMAGE_APPLIED 只发主目标，溅射由 core/16 的 SPLASH handler 走 SPLASH_DAMAGED 窄信号。
            eventBus.on(SIGNAL_TYPES.SPLASH_DAMAGED, 50, (data) => {
                if (data.unit !== pang || !pang.alive) return;
                if (!data.dmg || data.dmg <= 0) return;
                addMod(pang, 'atk', { source: '莽撞', value: rage.atkPerHit, ttl: 'permanent', group: 'rageOnHit', op: 'add' });
                // 数值声明 fact：与主路径同口径，供对照器按 group='rageOnHit' 比对
                if (data.log) {
                    data.log.push({
                        factType: FACT_TYPES.RAGE_ON_HIT,
                        data: { unitName: pang.name, atkDelta: rage.atkPerHit }
                    });
                }
                // 台词挂在溅射那条 fact 上（render/35 会追加到行尾）
                if (data.factData) {
                    data.factData.rageText = `<span class="gold">💢 莽撞：胖远桥吃了溅射，攻击+${rage.atkPerHit}（当前 ${Math.floor(getStat(pang, 'atk'))}）</span>`;
                    // 2026-10-02 飘字同主路径：溅射 fact 也在本击 ATTACK fact 的 entries 里，
                    //   render/38 扫到该 factType 时按此 uid/加攻量飘「⚔+N」
                    data.factData.pangAtkUid = pang.uid;
                    data.factData.pangAtkGain = rage.atkPerHit;
                }
            });

            // 技能2/3 二选一（每次攻击前掷一次，必触发其一）：
            //   T = 0.10 + (atk - 30)/200      —— 打歪阈值，攻击越高 T 越大
            //   p_打歪 = clamp((1 - 血量比) / (1 - T), 0, 1)，p_嘲讽 = 1 - p_打歪
            //   满血 → 必嘲讽；血量 ≤ T → 必打歪
            eventBus.on(SIGNAL_TYPES.BEFORE_SELECT_TARGET, L.BEFORE_SELECT_TARGET.PANG_CLUMSY, (data) => {
                if (data.unit !== pang || !pang.alive) return;
                pang.state._clumsyHit = false;
                pang.state._tauntFired = false;
                pendingDecl = null;
                // 2026-10-15 出手蓄力（老板拍板，国字脸 −10 防的补偿）：每次发起攻击前生命上限永久+hpPerAttack
                addMod(pang, 'maxHp', { source: '蓄力', value: face.hpPerAttack, ttl: 'permanent', group: 'pangAtkHp', op: 'add' });
                refreshMaxHp(pang, null, '蓄力');
                const cands = (data.validTargets || []).filter(t => t && t.alive && t !== pang);
                if (cands.length === 0) return;
                const rng = getBattleRng();
                const hpRatio = pang.maxHp > 0 ? pang.hp / pang.maxHp : 1;
                // 阈值公式系数走 CONFIG.PANG_CLUMSY_FORMULA（参数体系收敛批 2）
                const f = CONFIG.PANG_CLUMSY_FORMULA;
                const threshold = Math.min(f.cap, f.base + (getStat(pang, 'atk') - f.atkRef) / f.atkDiv);
                const clumsyProb = Math.min(1, Math.max(0, (1 - hpRatio) / (1 - threshold)));
                if (rng.next() < clumsyProb) {
                    // 年轻气盛（打歪）：随机挑一名敌人，×随机倍率（2026-10-15 老板拍板：固定 2.0 改
                    //   dmgMultMin~dmgMultMax 波动、步长 dmgMultStep，本击定值存 _clumsyMult）并附带击退/眩晕
                    const steps = Math.round((young.dmgMultMax - young.dmgMultMin) / young.dmgMultStep) + 1;
                    pang.state._clumsyMult = Math.round((young.dmgMultMin + rng.nextInt(0, steps - 1) * young.dmgMultStep) * 10) / 10;
                    data.declaration.targetResult = cands[rng.nextInt(0, cands.length - 1)];
                    pang.state._clumsyHit = true;
                    pendingDecl = { kind: 'clumsy', mult: pang.state._clumsyMult };
                    return;
                }
                // 正义国字脸（嘲讽）：全体敌人本回合后续只能打胖远桥（标记回合级，不消耗），
                //   同时自身防御永久 +defGain（2026-09-24 由「被嘲讽者的伤害 ×0.3」改为叠防，无上限叠加）
                for (const foe of cands) foe.state._tauntedByPang = true;
                addMod(pang, 'def', { source: '正义国字脸', value: face.defGain, ttl: 'permanent', group: 'righteousFace', op: 'add' });
                pang.state._tauntFired = true;
                pendingDecl = { kind: 'face' };
            });

            // 出手声明落日志（2026-10-15）：core/10 在选敌完成、命中/闪避判定之前广播本信号，
            //   因此被闪避反击时声明行仍在 DODGE 行之前（此前声明挂 AFTER_ATTACK/AFTER_DAMAGE_APPLIED，被闪时两条都不发）。
            //   走 SKILL_ANNOUNCE（契约五字段齐），只落战报行不飘字；演出仍由 pangTaunt/pangClumsy 标记在出手帧触发。
            eventBus.on(SIGNAL_TYPES.AFTER_SELECT_TARGET, L.AFTER_SELECT_TARGET.PANG_DECLARE, (data) => {
                if (data.unit !== pang) return;
                const decl = pendingDecl;
                pendingDecl = null;
                if (!decl || !data.log) return;
                const hpNote = `蓄力生命上限+${face.hpPerAttack}`;
                const note = decl.kind === 'clumsy'
                    ? `😵 年轻气盛：胖远桥一拳打歪，招呼到 ${data.target ? data.target.name : '?'} 身上（伤害×${decl.mult}；${hpNote}）`
                    : `😤 正义国字脸：胖远桥横眉一喝，敌人本回合只能打他（自身防御+${face.defGain}，当前 ${Math.floor(getStat(pang, 'def'))}；${hpNote}）`;
                data.log.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: {
                    unitName: pang.name, unitUid: pang.uid, camp: pang.camp,
                    skillName: decl.kind === 'clumsy' ? '年轻气盛' : '正义国字脸',
                    note
                } });
            });

            // 年轻气盛：该次伤害 ×本击掷定的随机倍率（DMG_MULTIPLIER 修饰器由 core/12 calcFinalDamage 消费）
            eventBus.on(SIGNAL_TYPES.BEFORE_DAMAGE_CALC, L.BEFORE_DAMAGE_CALC.PANG_YOUNG_MULT, (data) => {
                if (data.unit !== pang || !pang.state._clumsyHit) return;
                data.declarations.push({ type: EFFECT_TYPES.DMG_MULTIPLIER, value: pang.state._clumsyMult || young.dmgMultMin, source: pang, label: '年轻气盛' });
            });

            // 年轻气盛：命中后击退（退无可退则眩晕）——与乘风突袭共用 core/13 的判定
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.PANG_CLUMSY_LOG, (data) => {
                if (data.unit !== pang || !pang.state._clumsyHit) return;
                pang.state._clumsyHit = false;
                const tgt = data.target;
                if (!tgt || !tgt.alive) return;
                // 打歪的演出标记：本击 fact 带上，render/39 出手帧据此发 PANG_CLUMSY（生成步不发，避免抢画面）
                if (data.group && data.group.data) data.group.data.pangClumsy = true;
                // 战报行已在出手帧（AFTER_SELECT_TARGET）落过，这里只保留演出标记 + 击退/眩晕结算
                resolvePushOrStun(tgt, tgt.camp === CAMP_TYPES.ALLY ? A : B, data.log, '😤 年轻气盛');
            });

            // 正义国字脸的演出标记：与台词同帧写进本击 fact，render/39 出手帧据此发 PANG_TAUNT（战报行已前移到出手帧）
            eventBus.on(SIGNAL_TYPES.AFTER_ATTACK, L.AFTER_ATTACK.PANG_TAUNT, (data) => {
                if (data.unit !== pang || !pang.alive || !pang.state._tauntFired) return;
                pang.state._tauntFired = false;
                if (data.group && data.group.data) {
                    data.group.data.pangTaunt = true;
                    // 2026-10-02 加防量随 fact 走一格（此前只有上面那行文字、无飘字），
                    //   render/38 据此产 STAT_CHANGE(def) → fx/80 飘「🛡+N」
                    data.group.data.pangDefGain = face.defGain;
                }
                // 战报行已在出手帧（AFTER_SELECT_TARGET）落过，这里只保留演出标记（pangTaunt/pangDefGain → 出手帧特效）
            });

            // 嘲讽的强制执行：被嘲讽者本回合每次选目标都改成胖远桥（标记回合级，回合开始统一清）
            eventBus.on(SIGNAL_TYPES.BEFORE_SELECT_TARGET, L.BEFORE_SELECT_TARGET.PANG_TAUNT_FORCE, (data) => {
                const u = data.unit;
                if (!u || !u.state) return;
                if (!u.state._tauntedByPang) return;
                if (!pang.alive || !canBeTargeted(pang)) return;
                data.declaration.targetResult = pang;
            });

            // 未命中 / 被闪避路径的复位点
            eventBus.on(SIGNAL_TYPES.AFTER_MISS, L.AFTER_MISS.PANG_CLEAR, (data) => {
                if (data.unit === pang) pang.state._clumsyHit = false;
            });
        }
    };
}
