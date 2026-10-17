// modules/27elite-mingjiao-xiexun.js — 明教精英「金毛狮王谢逊」：组件工厂（狮吼/狂暴）
// V1.0.0 | ~12826 bytes | 2026-10-17 自 modules/27elite-mingjiao.js V7.1.7 拆出（纯搬移，零逻辑改动；组件工厂逐字迁入，集中注册留 barrel）
export const VER = 'modules/27elite-mingjiao-xiexun.js V1.0.0';
import { getSkillParams } from '../core/01config-5v5-test.js';
import { getBenefitTargets } from '../core/03battle-utils.js';
import { spawnUnit } from '../core/05battle-horse.js';
import { applyHeroFlags, getRoleBonus } from '../core/02unit.js';
import { emitEvent, applyStatChange, refreshMaxHp, getBattleRng, addMod, getStat } from '../core/13battle-shared.js';
import { eventBus, EXECUTION_LAYER as L } from '../infra/50-event-bus.js';
import { FACT_TYPES, UNIT_EVENT_TYPES, CAMP_TYPES, SIGNAL_TYPES } from '../infra/56-battle-enums.js';
export function createXieXunComponent() {
    return {
        name: '金毛狮王谢逊',
        register(eventBus, A, B, log) {
            // 不写死阵营：按身份标记在两侧找，谢逊换边也照样生效
            const xiexun = [...A, ...B].find(u => u.isXieXun && u.alive);
            if (!xiexun) return;
            const myTeam = xiexun.camp === CAMP_TYPES.ALLY ? A : B;

            const summon = getSkillParams('金毛狮王谢逊', 'summonLion');
            if (!summon) throw new Error('缺技能参数: 金毛狮王谢逊.summonLion');
            const inspire = getSkillParams('金毛狮王谢逊', 'lionInspire');
            if (!inspire) throw new Error('缺技能参数: 金毛狮王谢逊.lionInspire');
            if (!getSkillParams('金毛狮王谢逊', 'lionFollow')) throw new Error('缺技能参数: 金毛狮王谢逊.lionFollow');

            function pushInfo(data, text) {
                if (data && data.group && data.group.data && data.group.data.entries) {
                    data.group.data.entries.push({ type: 'info', text });
                }
            }

            // ① 成长：上一回合留下的幼狮，本回合开始按所在位置成形（1-6 雄狮 / 7-9 母狮）。
            //    必须排在召唤之前（LION_GROW 15 < XIE_SUMMON 16），否则刚召出来的幼狮会在同一次回合开始里立刻长大。
            //    2026-09-23 成长加概率：每只幼狮独立掷 grow.prob（默认1=必定成长），未中则保持幼狮下回合再判定。
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, L.ROUND_START.LION_GROW, (data) => {
                const cubs = myTeam.filter(u => u.isLionCub && u.alive && u.pos);
                const growRng = getBattleRng();
                for (const cub of cubs) {
                    if (growRng.next() >= summon.grow.prob) continue;
                    const spec = cub.pos <= summon.grow.frontMax ? summon.grow.front : summon.grow.back;
                    // spec 里写的是【基础值】，目标形态的最终值 = 基础值 + 该职业加成
                    //   （2026-09-26 口径统一：m 是基础预算，职业加成由引擎加、不写进配置）。
                    //   基线用 cub 配置值：幼狮自身豁免加成，且幼狮期间吃到的振奋要留在成长值之上。
                    const bonus = getRoleBonus(spec.role);
                    const tgtAtk = spec.atk + bonus.atk;
                    const tgtDef = spec.def + bonus.def;
                    const tgtMaxHp = spec.maxHp + bonus.maxHp;
                    // 属性只算不存：成长差值登记为永久词条；maxHp 另走 refreshMaxHp 同步（上限升则当前血等量加）
                    // 2026-10-02 差值先落变量：fact 增量字段与 addMod 入参必须同源（体检对照同一表达式）
                    const atkDelta = tgtAtk - summon.cub.atk;
                    const defDelta = tgtDef - summon.cub.def;
                    const maxHpDelta = tgtMaxHp - summon.cub.maxHp;
                    addMod(cub, 'atk', { source: '幼狮成长', value: atkDelta, ttl: 'permanent', group: 'lionGrow', op: 'add' });
                    addMod(cub, 'def', { source: '幼狮成长', value: defDelta, ttl: 'permanent', group: 'lionGrow', op: 'add' });
                    addMod(cub, 'maxHp', { source: '幼狮成长', value: maxHpDelta, ttl: 'permanent', group: 'lionGrow', op: 'add' });
                    refreshMaxHp(cub, null, '幼狮成长');
                    cub.name = spec.name;
                    cub.role = spec.role;
                    cub.m = spec.m;            // m 同步为目标形态的基础预算（原先缺这行，成形后的狮子一直挂着幼狮的 m=20）
                    applyHeroFlags(cub);       // 按新名字补 isLionMale / isLioness
                    cub.isLionCub = false;     // 形态标记互斥，旧形态显式清掉
                    emitEvent(cub, UNIT_EVENT_TYPES.HP_CHANGE, { hp: cub.hp, maxHp: cub.maxHp, alive: cub.alive, role: cub.role, atk: getStat(cub, 'atk'), def: getStat(cub, 'def') });
                    if (data && data.log) {
                        data.log.push({ factType: FACT_TYPES.LION_GROW, data: { name: spec.name, unitName: spec.name, unitUid: cub.uid, pos: cub.pos, atk: tgtAtk, def: tgtDef, maxHp: tgtMaxHp, atkDelta, defDelta, maxHpDelta } });
                    }
                }
            });

            // ② 召唤：每回合开始 prob 概率，在随机空位召唤 1 只幼狮（落点随机 → 成长方向随机；无空位则不召）
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, L.ROUND_START.XIE_SUMMON, (data) => {
                if (!xiexun.alive) return;
                const rng = getBattleRng();
                if (rng.next() >= summon.prob) return;
                const occupied = new Set(myTeam.filter(u => u.alive).map(u => u.pos));
                const free = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(p => !occupied.has(p));
                if (free.length === 0) return;
                const pos = free[rng.nextInt(0, free.length - 1)];
                const cub = spawnUnit(myTeam, summon.cub.name, summon.cub.m, summon.cub.role, pos,
                    { atk: summon.cub.atk, def: summon.cub.def, maxHp: summon.cub.maxHp, skipRoleBonus: summon.cub.skipRoleBonus });
                if (data && data.log) {
                    data.log.push({ factType: FACT_TYPES.SUMMON_UNIT, data: { summonName: cub.name, summonUid: cub.uid, pos, byName: xiexun.name } });
                }
            });

            // ③ 雄狮·振奋：雄狮命中后，己方全体存活角色（含雄狮自己、谢逊）永久 +atkPerHit 攻。
            //    走 addMod 登记永久词条，getStat 现算，不直改 unit.atk。
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.LION_INSPIRE, (data) => {
                const lion = data.unit;
                if (!lion || !lion.isLionMale || !lion.alive) return;
                if (!data.dmg || data.dmg <= 0) return;
                const gain = inspire.atkPerHit;
                // 2026-10-06 振奋受益池统一走 canBeTargeted + 排拒马：天上蝶/蛛不白吃加攻，拒马不加攻
                // 2026-10-07 收编进 03 的 getBenefitTargets 裁判（行为不变，口径一处管）
                // 2026-10-08 幼狮也豁免（用户拍板）：攻被振奋抬>0 会真的出手（幼狮设计是零攻白板），
                //   且幼狮吃振奋会让"成长前白赚全队攻"变成最优解——成长链的代价感就没了
                const targets = getBenefitTargets(myTeam).filter(u => !u.isLionCub);
                if (targets.length === 0) return;
                const inspireTargets = [];
                for (const t of targets) {
                    addMod(t, 'atk', { source: '振奋', value: gain, ttl: 'permanent', group: 'lionInspire', op: 'add' });
                    inspireTargets.push({ unitName: t.name, atkDelta: gain });
                    emitEvent(t, UNIT_EVENT_TYPES.HP_CHANGE, { hp: t.hp, maxHp: t.maxHp, alive: t.alive, atk: getStat(t, 'atk'), def: getStat(t, 'def') });
                }
                // 数值声明 fact：一次触发给多人各 +gain，用 targets 名单承载（供体检对照器按 group='lionInspire' 比对）
                // 2026-10-01 契约补齐：requiredFields 要 unitName（触发者=雄狮）但发射处一直没带——校验器红字但不阻断，此前漏了
                if (data.log) {
                    data.log.push({
                        factType: FACT_TYPES.LION_INSPIRE,
                        data: { unitName: lion.name, targets: inspireTargets }
                    });
                }
                // 2026-09-24 狮吼演出改由表现层发：引擎在「生成步」时就 emit 会让吼抢在画面前面
                //   （随动出手的演出被 isLinkAttack 延后 1400ms、苦练延后 1200ms），看起来像「母狮出手反而吼」。
                //   现由 render/39 的 ATTACK 演出在雄狮真正出手的那一帧发 LION_ROAR + ATK_BUFF_FLOAT。
                pushInfo(data, `<span class="gold">🦁 雄狮振奋！己方全体攻击力 +${gain}</span>`);
            });

            // ④ 母狮·随动：母狮命中后，其他雄狮/母狮与谢逊各随动攻击一次，打母狮同一个目标。
            //    走 extraRequests（core/10 只在 doubleStrike 判遮挡），因此「无论是否被遮挡」都能出手；
            //    reason:'lionFollow' 会被 core/10 置 _isLinkAttack，随动自身不会再触发一次随动（防乒乓）。
            //    目标已阵亡 / 待死 → 整条随动取消。
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.LION_FOLLOW, (data) => {
                const lioness = data.unit;
                if (!lioness || !lioness.isLioness || !lioness.alive) return;
                if (lioness.state._isLinkAttack) return;
                if (!data.dmg || data.dmg <= 0) return;
                const target = data.target;
                if (!target || !target.alive || target.state._pendingDeath) return;
                // 2026-09-25 顺序改按站位：原来直接沿用队伍数组顺序（建队/召唤先后），
                //   谢逊在建队时就入队，于是永远第一个随动、狮子按召出先后排；现改 pos 升序，位置靠前的先出手。
                const mates = myTeam.filter(u => u.alive && u.uid !== lioness.uid && !u.isLionCub && (u.isLionMale || u.isLioness || u.isXieXun))
                    .sort((a, b) => a.pos - b.pos);
                if (mates.length === 0) return;
                if (!data.extraRequests) data.extraRequests = [];
                for (const m of mates) {
                    data.extraRequests.push({
                        unit: m,
                        targetUid: target.uid,
                        reason: 'lionFollow',
                        actedMode: 'restore',
                        actedSnapshot: m.state._acted,
                        priority: 44
                    });
                }
                pushInfo(data, `<span class="gold">🦁 母狮长啸！${mates.map(m => m.name).join('、')} 随动出击！</span>`);
            });
        }
    };
}

// 杨逍（光明左使·飞行·弱精英 m104）
// ① 弹指神通：命中后 prob 概率点穴——回合级 _stunned（😵 复用现有渲染，本回合选人时被跳过）+ 同时挂截脉禁疗 _jinMai（❌）
//    rounds 回合（本回合+下+下下，回合开始递减），冷却 _dianXueCd（同一目标 cdRounds 回合最多被点一次）。
//    禁疗消费落点在 core/13 applyStatChange 单点收口（全库 10+ 治疗出口）。
// ② 选敌：pool-filter 优先未行动敌人（点穴控到还有行动权的 target 才有意义）；敌方全部已行动 → 候选排空照飞行默认选敌，
//    且本次伤害 ×allActedDmgRatio（BEFORE_DAMAGE_CALC 声明，战报明细可见）。
// ③ 鹰眼被动（未命中 −12pp）实装在 core/03 getMissBreakdown 单源，详情弹窗自动同步。
// ④ 先机（2026-10-16，老板口径=占位式）：每个队友拟出手前（他自己还没出手时）各掷一次 jumpProb——
//    命中即声明 declaration.jumpConsume=true，core/11 里他插到本步队首出手，且本步本该出手的那名队友
//    被他占用（本回合不再出手，core/11 置 _acted 并发 PASS fact '被先机占用'，render/35 已同步）；
//    他一旦出过手就不再是候选 → 停止掷骰；若他已在队首（无人可抢）则无从占用、不掷骰。
