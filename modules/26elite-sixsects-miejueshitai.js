// modules/26elite-sixsects-miejueshitai.js — 六大派精英「灭绝师太」：反击 / 追击 / 峨眉掌法 / 三击吸血 / 召唤周芷若
// V6.27.2 | 2026-10-22 | ~18700 bytes
export const VER = 'modules/26elite-sixsects-miejueshitai.js V6.27.2';
import { getSkillParams } from '../core/01config-5v5-test.js';
import { spawnUnit, findFreePos } from '../core/05battle-horse.js';
import { getBattleRng, previewHeal } from '../core/13battle-shared.js';
import { eventBus, EFFECT_TYPES, registerSettlementHook, EXECUTION_LAYER as L } from '../infra/50-event-bus.js';
import { SIGNAL_TYPES, FACT_TYPES, CAMP_TYPES, ROLE_TYPES } from '../infra/56-battle-enums.js';
import { pushInfo } from './23elite-helpers.js';

// 灭绝师太（六大派·峨眉掌门·战士·M115）：反击 / 跟随攻击 / 每第三次攻击 / 召唤周芷若
// 新增，作为新第七关精英。四技能分工：
//   反击、每第三次攻击 → 本组件闭环（日志走 group.data.entries 的 { type:'info', text }）
//   跟随攻击 → 走 content mechanics 的 followAttack 声明（core/15 安装）。
//     队友是任意普通单位、没法逐个登记，所以声明挂在灭绝自己名下，而不是像玄冥联动那样挂在攻击者名下。
//   召唤周芷若 → 队友或她本人阵亡时在原位置召唤（全场 1 次），落位时机见下方 flushZhouSummon

// 灭绝师太出手计数的繁体轮换表：第 1/2/3 次依次「壹/貳/參」，第 4 次回到「壹」
const CN_NUM_TRA = ['壹', '貳', '參'];

// 召唤周芷若的统一落位入口：阵亡当帧只记位置（state._pendingZhouPos），落位延到「下一个行动步」。
//   落位与死亡特效的配合：同格「尸体 + 周芷若」由 render/32 保证「尸体优先渲、3 秒清尸后才露人」，
//   所以这里只需避开阵亡当帧，不必等尸体被移除。
//   待落位标记写灭绝自己的 state（battle 级、跨回合克隆保留），不写队伍数组：
//   队伍数组每回合都会重新 map 出来（core/11 createRoundStepper），数组级标记过不了回合边界；
//   她本人在回合最后一手阵亡时下一回合组件不再注册（core/11 只为存活单位注册），
//   所以另有一条模块级 ON_ROUND_START 兜底，靠扫描她的 state 把队列清掉。
function flushZhouSummon(miejue, team, log) {
    const anchor = miejue.state._pendingZhouPos;
    if (anchor == null || anchor < 0) return;
    miejue.state._pendingZhouPos = -1;
    // 名额跨实例共享（多实例化）：双灭绝时任一灭绝召过即全场封顶（周芷若全场仅 1 只），
    //   查全队所有灭绝（含阵亡者，state 跨回合克隆保留）——原设计「全场仅 1 次」不因补员而翻倍
    if (team.some(u => u.isMieJueShiTai && u.state._summonedZhou)) return;
    if (team.some(u => u.isZhouZhiruo && u.alive)) return;
    const summon = getSkillParams('灭绝师太', 'summonZhou');
    if (!summon) return;
    // 落位避让活人（与 modules/20 蛛落同一口径）：以阵亡者原格为 anchor 做「原格+1 环形顺延」
    //   （7→8,9,1,2,3,4,5,6），交给 core/05 findFreePos 取第一个空位——它只算 alive 占位，所以尸体不算占格，
    //   保留「周芷若与尸体同格、render 尸体优先」的既有设计；但拒马/狮子/其他召唤物这些活着的单位必须避让。
    //   旧版直接落原格，而回合开始 spawnHorse 可能恰好刷进刚空出的格（fuzz seed159 关7 r2「周芷若 与 拒马 同占格 7」）。
    const order = [];
    for (let i = 0; i < 9; i++) order.push(((anchor - 1 + i) % 9) + 1);
    const landPos = findFreePos(team, order);
    if (landPos == null) return; // 9 格全被活人占：放弃本次落位（同 spawnHorse 口径），绝不允许两个活人同格
    const zhou = spawnUnit(team, '周芷若', summon.m, ROLE_TYPES.WARRIOR, landPos);
    miejue.state._summonedZhou = true;
    if (log) {
        log.push({ factType: FACT_TYPES.SUMMON_UNIT, data: { summonName: zhou.name, summonUid: zhou.uid, pos: landPos, byName: '灭绝师太' } });
    }
}

// 跨回合兜底：灭绝本人在回合最后一手阵亡 → 当回合已无「下一个行动步」可挂，队列留到下一回合开始落位
eventBus.on(SIGNAL_TYPES.ON_ROUND_START, L.ROUND_START.MIEJUE_SUMMON, (data) => {
    for (const team of [data.A, data.B]) {
        // 多实例化：遍历全队灭绝（find 只处理第一个，补员灭绝的待落位队列会没人 flush）
        for (const miejue of team.filter(u => u.isMieJueShiTai)) flushZhouSummon(miejue, team, data.log);
    }
});

export function createMieJueShiTaiComponent() {
    return {
        name: '灭绝师太',
        register(eventBus, A, B, log, self) {
            // 不写死阵营：按身份标记在两侧找，灭绝换边也照样生效。
            // 多实例化（老板拍板「完全真技能」）：组件认 self=本实例单位；self 阵亡回退全场 find
            const miejue = (self && self.alive) ? self : [...A, ...B].find(u => u.isMieJueShiTai && u.alive);
            if (!miejue) return;
            const myTeam = miejue.camp === CAMP_TYPES.ALLY ? A : B;

            const counter = getSkillParams('灭绝师太', 'counterAttack');
            if (!counter) throw new Error('缺技能参数: 灭绝师太.counterAttack');
            const third = getSkillParams('灭绝师太', 'thirdStrike');
            if (!third) throw new Error('缺技能参数: 灭绝师太.thirdStrike');
            // 普攻系数：峨眉掌法 ×dmgMultiplier（当前 1.0=无加成，旋钮留档；被动出手不吃）
            const normal = getSkillParams('灭绝师太', 'normalAttack');
            if (!normal) throw new Error('缺技能参数: 灭绝师太.normalAttack');
            // 追击：每次打中后 prob 概率对同一目标再追击一次（伤害×dmgMultiplier，可被闪避）
            const chase = getSkillParams('灭绝师太', 'chaseAttack');
            if (!chase) throw new Error('缺技能参数: 灭绝师太.chaseAttack');
            // 召唤参数在落位时（flushZhouSummon）现取；这里只做一次启动期存在性校验
            if (!getSkillParams('灭绝师太', 'summonZhou')) throw new Error('缺技能参数: 灭绝师太.summonZhou');

            // 技能1 反击：被攻击后 prob 概率反击攻击者，伤害 ×dmgRatio，可被闪避（撤掉不可闪避——
            //   与设计对齐：她没有免闪避设计；系数走 extraRequests 的 dmgRatio，由 core/10 写 state、伤害计算统一乘）。
            // 走 extraRequests 而不是直接 applyStatChange——反击要过完整伤害管线（防御/格挡/修饰器/记账），
            // 直接扣血等于绕开引擎。跨阵营换边由 core/10 的额外攻击循环处理。
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.MIEJUE_COUNTER, (data) => {
                if (data.target !== miejue || !miejue.alive) return;
                // 这一击已经把她打进「待死」就不该再反击（此时 alive 还是 true，死亡结算在 resolveDeaths）
                if (miejue.state._pendingDeath) return;
                if (!data.dmg || data.dmg <= 0) return;
                const attacker = data.unit;
                if (!attacker || !attacker.alive || attacker === miejue) return;
                if (getBattleRng().next() >= (counter.prob ?? 1)) return;
                if (!data.extraRequests) data.extraRequests = [];
                data.extraRequests.push({
                    unit: miejue,
                    targetUid: attacker.uid,
                    reason: 'counterAttack',
                    dmgRatio: counter.dmgRatio,
                    actedMode: 'restore',
                    actedSnapshot: miejue.state._acted,
                    priority: 12,
                    // 谁的日志归谁：反击提示行随反击出手落进「灭绝自己的反击组」（core/10 req.infoText），
                    //   不再插进攻击者的组；入队即死被守卫作废时提示行也不会出现（同殷天正反击口径）
                    infoText: `<span class="gold">🗡 灭绝师太反击 ${attacker.name}！（伤害×${counter.dmgRatio}）</span>`
                });
            });

            // 技能1b 追击：她每次打中（普攻/反击/跟随/追击本身）后 prob 概率对同一目标再打一手，
            //   伤害×dmgMultiplier，走 extraRequests 过完整伤害管线（同反击）。
            //   与反击的关键区别：追击**故意不进** core/10 的 LINK_REASONS——要允许追击自身再触发追击（链式），
            //   所以不靠 _isLinkAttack 防乒乓；链式深度由 prob=0.1 自然收敛（连续 N 次的概率 0.1^N，无爆炸风险）。
            //   这一手同样走 processUnitAttack → 计入 _attackCount，故「第 3 下恰好是追击」时照吃三击 ×dmgMultiplier。
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.MIEJUE_CHASE, (data) => {
                if (data.unit !== miejue || !miejue.alive) return;
                if (miejue.state._pendingDeath) return;          // 本击已把她打进待死，不再追击
                if (!data.dmg || data.dmg <= 0) return;          // 只在真正打中后判定
                const t = data.target;
                if (!t || !t.alive || t.state._pendingDeath) return;   // 目标已倒，不追击（不换目标）
                if (getBattleRng().next() >= (chase.prob ?? 0)) return;
                if (!data.extraRequests) data.extraRequests = [];
                data.extraRequests.push({
                    unit: miejue,
                    targetUid: t.uid,
                    reason: 'chaseAttack',
                    dmgRatio: chase.dmgMultiplier,
                    actedMode: 'restore',
                    actedSnapshot: miejue.state._acted,
                    priority: 12
                });
                pushInfo(data, `<span class="gold">⚡ 灭绝师太追击 ${t.name}！（伤害×${chase.dmgMultiplier}）</span>`);
            });

            // 峨眉掌法：普攻伤害 ×1.2。被动出手（反击×0.8/跟随×0.6）不吃——
            //   那两手在 core/10 里带着 _extraDmgRatio，此处跳过即"各自独立倍数、不再叠乘"。
            //   优先级排在三击（15）之前：普攻 1.2 与三击系数按顺序叠乘，战报明细两条都可见。
            eventBus.on(SIGNAL_TYPES.BEFORE_DAMAGE_CALC, L.BEFORE_DAMAGE_CALC.MIEJUE_NORMAL_MULT, (data) => {
                if (data.unit !== miejue || !miejue.alive) return;
                if (miejue.state._extraDmgRatio > 0) return;
                data.declarations.push({ type: EFFECT_TYPES.DMG_MULTIPLIER, value: normal.dmgMultiplier, source: miejue, label: '峨眉掌法' });
            });

            // 技能3 每第三次攻击：第 3 的倍数那一次命中，伤害 ×dmgMultiplier 并吸血 leechRatio 倍本次伤害。
            //   重设计：伤害系数收敛为 1.0（加强留旋钮，改表即生效）、吸血 100% 回本次实伤——
            //   第三下的爆点全在「看运气」：本次赶上普攻/反击/跟随哪种出手，伤害就按哪种的系数算、回血跟着水涨船高。
            // 计数口径 =「她打中过几次」：反击 / 跟随攻击这类被动出手也算她的一次出手（原设计），
            //   只有真正打中的才计（未命中/被闪避到不了 AFTER_DAMAGE_APPLIED）。
            // 三击判定不落标记：两处都按同一个 _attackCount 现算——额外攻击走 lockedTargetUid，
            //   不发 BEFORE_SELECT_TARGET，落标记的方式在反击那一击上必然失同步。
            //   「本次结算前计数 +1 能被 3 整除」= 这一击就是第 3 的倍数。
            const isThirdHit = () => (((miejue.state._attackCount || 0) + 1) % third.interval) === 0;

            eventBus.on(SIGNAL_TYPES.BEFORE_DAMAGE_CALC, L.BEFORE_DAMAGE_CALC.MIEJUE_THIRD_MULT, (data) => {
                if (data.unit !== miejue || !miejue.alive || !isThirdHit()) return;
                data.declarations.push({ type: EFFECT_TYPES.DMG_MULTIPLIER, value: third.dmgMultiplier, source: miejue, label: '灭绝三击' });
            });

            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.MIEJUE_THIRD_LEECH, (data) => {
                if (data.unit !== miejue || !miejue.alive) return;
                if (!data.dmg || data.dmg <= 0) return;
                const isThird = isThirdHit();
                miejue.state._attackCount = (miejue.state._attackCount || 0) + 1;
                const count = miejue.state._attackCount;
                // 计数飘字（壹/貳/參）与攻击行末尾提示都写进本击的 fact（group.data），
                //   由表现层在「演出帧」消费：原先在这里 emit 飘字，是动作生成步执行，飘字会抢在画面前跳出来。
                //   三击那一次不再往攻击行尾塞「伤害×1.5+吸血」——同一件事下一行「🩸 灭绝三击」已报，
                //   两行重复；攻击行只留出手计数。
                if (data.group && data.group.data) {
                    data.group.data.miejueCountText = CN_NUM_TRA[(count - 1) % 3];
                    data.group.data.miejueHint = `<span class="gold small">（第 ${count} 次出手）</span>`;
                }
                if (!isThird) return;
                const leechVal = Math.floor(data.dmg * third.leechRatio);
                // 实际回血量按 core/16 LEECH handler 的同口径现算（封顶当前缺口）：LEECH 结算在本次
                //   AFTER_DAMAGE_APPLIED 之后立刻执行（core/10 resolveAfterDamageEffects），此处算的就是最终值
                // 战报/飘字改实际值：声明 leechVal 会在结算时被截脉/寒毒打折，
                //   旧写法用声明值拼「生命 A → B」= 假账（实测 42 报成实回 21）。
                const capped = Math.max(0, Math.floor(Math.min(leechVal, miejue.maxHp - miejue.hp)));
                const actualHeal = previewHeal(miejue, capped);
                const hpBefore = Math.floor(miejue.hp);
                if (!data.declarations) data.declarations = [];
                data.declarations.push({ type: EFFECT_TYPES.LEECH, value: leechVal, source: miejue });
                // 吸血飘字交给 render/39 的出手演出帧发（同计数飘字，避免抢在画面前）——传实际值
                if (data.group && data.group.data) data.group.data.miejueLeech = actualHeal;
                const mutedTag = actualHeal < capped ? '（治疗被削减）' : '';
                pushInfo(data, `<span class="gold">🩸 灭绝三击：第 ${count} 次出手，回复 ${actualHeal} 点${mutedTag}，生命 ${hpBefore} → ${hpBefore + actualHeal}</span>`);
            });

            // 技能4 召唤周芷若：任一队友或她本人阵亡 → 记下阵亡者原位置，全场仅 1 次。
            //   落位不在当帧（当帧会顶掉死亡特效），交给下一个行动步的 BEFORE_STATE_TRANSITION；
            //   她本人在回合最后一手阵亡时没有下一步，由模块级 ON_ROUND_START 兜底。
            eventBus.on(SIGNAL_TYPES.ON_UNIT_DEATH, L.ON_UNIT_DEATH.MIEJUE_RECORD, (data) => {
                if (myTeam.some(u => u.isMieJueShiTai && u.state._summonedZhou) || miejue.state._pendingZhouPos >= 0) return;   // 名额跨实例共享
                const dead = (data.deadUnits || []).find(u => myTeam.includes(u));
                if (!dead || dead.pos == null) return;
                miejue.state._pendingZhouPos = dead.pos;
            });

            eventBus.on(SIGNAL_TYPES.BEFORE_STATE_TRANSITION, L.BEFORE_STATE_TRANSITION.MIEJUE_SUMMON, (data) => {
                flushZhouSummon(miejue, myTeam, data.log);
            });
        }
    };
}

// —— 跟随攻击（followAttack）：任意队友命中后，chance 概率由跟随者打同一目标，无每回合上限 ——
// 与玄冥联动的方向相反——联动是「攻击者声明带谁跟随」，队友固定；这里是「跟随者声明跟所有人」，
// 队友是任意单位、没法逐个登记，所以声明挂在跟随者名下。
// dmgRatio（可选）：跟随那手的伤害系数（如 0.6）——「越白嫖的出手越弱」。
//   不配 = 全额，跟随机制对其他角色仍可用。系数由 core/10 进额外攻击前写 state、伤害计算统一乘。
// 防乒乓：跟随攻击自身会走 AFTER_ATTACK，core/10 对 reason:'followAttack' 置 _isLinkAttack，
// 这里开头同样判 _isLinkAttack，保证一次额外攻击不会再触发一次跟随。
export const followAttackHandler = {
    // 契约与原 LOCAL_MECHANIC_FIELDS 一致：dmgRatio 是可选字段（不配 = 全额），不进 schema 强校验
    fields: { chance: 'number' },
    install({ decl }) {
        registerSettlementHook({
            when: SIGNAL_TYPES.AFTER_ATTACK,
            priority: L.AFTER_ATTACK.FOLLOW_ATTACK,
            handler: (data) => { submitFollowAttack(data, decl); }
        });
    }
};

function submitFollowAttack(data, decl) {
    const { unit, target, dmg, allySide } = data;
    if (!unit || unit.state._isLinkAttack || dmg <= 0 || !target || !target.alive) return;
    const follower = allySide.find(u => u.name === decl.name && u.alive);
    if (!follower || follower.uid === unit.uid) return;
    if (getBattleRng().next() >= (decl.chance || 0)) return;
    if (data.group && data.group.data && data.group.data.entries) {
        const ratioText = decl.dmgRatio != null ? `（伤害×${decl.dmgRatio}）` : '';
        data.group.data.entries.push({ type: 'info', text: `<span class="gold">🐺 ${follower.name} 跟随 ${unit.name} 出手！${ratioText}</span>` });
    }
    if (!data.extraRequests) data.extraRequests = [];
    data.extraRequests.push({
        unit: follower,
        targetUid: target.uid,
        reason: 'followAttack',
        dmgRatio: decl.dmgRatio ?? null,
        actedMode: 'restore',
        actedSnapshot: follower.state._acted,
        priority: 45
    });
}
