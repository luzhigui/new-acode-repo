// modules/342-elite-sixsects-san-du.js — 少林三渡与炎魔狮王、魔化谢逊（第6关·正三角金刚伏魔阵 / 倒三角枯禅轮回阵）
// 设计：三渡技能固定；正三角职业随站位（2号位=防战 / 7号位=战士 / 9号位=飞行），倒三角职业绑人（渡厄防战/渡劫战士/渡难飞行），均由 modules/330 建队时落实。
//   渡厄：防御 +40%（严阵以待）
//   渡劫：每回合攻击两次（必发；走引擎 doubleStrike 额外出手通道）
//   渡难：自带流云身法，闪避 +25%
//   共有：站 7~9 号位时每回合开始回复 30 点生命（金刚伏魔阵）
//   炎魔狮王：锁在 5 号位、永久无法行动；每回合收尾（所有单位行动完、回合结束结算前）随机对一名明教角色打出一发炎爆（28 点真实伤害）。
//   魔化谢逊（倒三角）：0 攻 / 28 防 / 2888 血，锁在 5 号位不行动；开局先轰一发 28，之后每次被攻击 /
//     回合收尾各轰一发 28——每发独立掷打明教（可闪避，真伤）或给自家三渡回 28 血，轰完立刻续蓄。
// 注：引擎的 ON_ROUND_END 在每个出手后都会广播（并非整回合只一次），
//   故「每回合收尾」类效果统一挂 ROUND_SETTLED（core/210 行动循环结束后只发一次）。
// V1.1.2 | 2026-11-21 炎爆从「回合开始」改到 ROUND_SETTLED（回合结束前）；ON_ROUND_START 只负责每回合重新压 _stunned
// V1.1.3 | 2026-11-22 炎爆播报带needsSeparator自成一组(修贴上组尾巴)
// V1.1.4 | 2026-11-22 金刚伏魔阵回复补播报+飘字(老板报:回血无日志无飘字)
// V1.1.5 | 2026-11-22 三渡重排版(老板拍板):渡厄个人技换圣火令(常驻side buff),2号位严阵以待/7,9号位热血奋战(阵位授予)
// V1.1.6 | 2026-11-22 老板钉死口径对调:三样个人技绑和尚(严阵以待回渡厄),圣火令改2号位阵位授予(空位熄灭)
// V1.1.7 | 2026-11-22 老板二钉:圣火令降级移除;金刚不坏(40%防)回渡厄个人;阵位=2严阵以待/7,9热血奋战
// V1.1.8 | 2026-11-22 渡厄个人技改名首当其冲(金刚不坏让给空见金钟罩,老板拍板)
// V1.1.9 | 2026-11-22 修复重复三份的 doubleAttack 分支(首个空块吃掉分支，渡劫必发双击完全失效)
// V2.0.0 | 2026-11-22 老板口径落地：渡劫改 80% 概率连击；删 7/9 热血奋战（只留回血 30）；2 号位严阵以待补受击反弹 40%+战报/横幅/飘字；流云/严阵以待补回合播报；两个 40% 共用同一常量
// V2.0.1 | 2026-11-22 修V2雷:概率连击掷骰nextFloat不存在(EventBus吞TypeError=连击静默死),改全仓惯例nextInt(1,100)
// V2.1.0 | 2026-11-22 老板口径：三渡与炎魔全体免疫控制；炎魔双发炎爆——回合开始 18 点，轮到自己蓄力、回合收尾 28 点
// V2.1.1 | 2026-11-22 渡劫概率连击格子补 ⚡ logo（_sanDuDoubleStrike 常驻旗，同流云💨/严阵🛡️ 出口）
// V2.1.2 | 2026-11-22 炎爆/蓄力强制自成一组：回合开始那发 18 紧跟回合头时也画分隔符（separatorForce 放行）
// V2.1.3 | 2026-11-22 老板口径：炎爆（开局 18 / 收尾 28）可被闪避，但不触发闪避反击——只判闪避率，不走进攻链
// V2.1.4 | 2026-11-22 金刚伏魔阵回血日志改绿色（tone:'heal'）；飘字 💚 本就在（V1.1.4 补），确认可用
// V2.2.0 | 2026-11-24 新增第六关倒三角变体「枯禅轮回阵」：新增魔化谢逊（demonXiexun）——锁 5 号位不动（攻 0），
//   回合收尾 ROUND_SETTLED 对全场随机 2×28 真伤（敌我不分、非召唤、不含自己；按任务书不可闪避）；
//   任一三渡首次跌破 70%/40% → 三渡按实际站位顺时针轮转 1→3→8→1（friendlyPull 放行免控）；
//   8 号位三渡行动前回复 30% 最大生命（每回合一次）；枯禅阵内金刚伏魔阵 30 点平回血停用。
//   正三角（炎魔狮王）原样保留，由 modules/330 按 squadVariants["6"] 抽变体。
// V2.2.1 | 2026-11-24 老板纠正：魔化谢逊 28 点真伤改可被闪避（先判闪避率，闪开则本次不掉血、飘「闪避！」），与正三角炎爆口径一致
// V2.2.2 | 2026-11-24 老板口径：魔化谢逊真伤只打对手方（明教），不再敌我不分误伤自己人
// V2.2.3 | 2026-11-24 老板最终口径：恢复敌我不分——落到自家人身上改为回血 28（不判闪避），打明教仍是 28 真伤可闪避
// V2.2.4 | 2026-11-24 老板四连修：①轮回三人同帧瞬移看不清 → 新增 sanDuCycle 逐条描轨迹(0/240/480ms)；②谢逊格子不显示 😴 休息标记(_noRestMark)；③谢逊真伤补炎爆同款演出(demonBurst cue)
// V2.2.5 | 2026-11-24 谢逊拍醒队友补圣光演出（demonHeal：光柱+十字光+上浮光点），不再与真伤共用火球
// V2.3.0 | 2026-11-24 老板口径：炎魔/魔化统一改「蓄力循环炮台」——回合开始固定一发（炎魔18/魔化28），
//   被攻击或轮到自己→进入蓄力（每次+10%最大生命护盾，可叠）；已蓄力再被攻击/轮到行动/回合收尾→
//   立刻打一发28并马上续蓄。魔化收尾不再固定两发，改为按蓄力结算（挨打越多打越多）。
// V2.3.1 | 2026-11-24 老板口径：蓄力不再加护盾（炎魔/魔化都取消），只保留「多挨一次打多打一发」。
// V2.3.2 | 2026-11-24 老板口径：倒三角 8 号位枯禅回血 30% → 40% 最大生命。
// V2.3.3 | 2026-11-24 老板口径：枯禅轮回不再「首次」——血量回到 70%/40% 以上就重新武装，每次跌破都再转。
// V2.3.4 | 2026-11-25 老板二钉「换位太快、要击退换位那种节奏」：撤掉 sanDuCycle 自绘残影，
//   轮转改发 swapChain 载荷 → render/419 翻成两条 POS_SWAP，走 fx/604 滑行互换（逐段可见）
// V2.4.0 | 2026-11-25 老板最终口径（魔化谢逊）：属性锁 0攻/18防/1888血；开局直接蓄力；
//   蓄力期间被攻击 / 轮到自己行动 / 回合收尾 → 开轰「两下」并立刻续蓄；每下独立掷 18 真伤（可闪避）或
//   对自家回 18 生命；火球动画放慢（cue.slow）且两发串行播放。
// V2.4.1 | 2026-11-25 枯禅轮回不再固定顺时针：70% 概率把血最少的渡送回 8 号位（其余 1/3 对调），
//   30% 维持顺时针；每次轮转三渡 + 谢逊各回复 10% 最大生命。
// V2.5.0 | 2026-11-25 老板口径：①魔化谢逊改回 0 攻/28 防/2888 血，每次只轰一发 28（不再两发）；
//   开局先轰一发再蓄力，被攻击立刻轰一发、回合收尾再轰一发，轮到自己行动不再单独开轰；
//   ②取消枯禅轮回轮转时三渡+谢逊各回 10% 最大生命；
//   ③枯禅轮回换位演出改走击退式 PUSH（fx/605 animatePushSwap），撤掉 POS_SWAP 滑行连闪的花哨演出。
// V2.5.1 | 2026-11-25 老板口径：三渡所在队伍开局携带「圣火不熄」（正/倒三角通用）。
// V2.5.2 | 2026-11-25 老板纠正：圣火不熄是全局海克斯（每队每局只有 1 个复活名额），
//   改为挂队伍 _activeBuffs（谁先阵亡谁复活一次），不再给三渡每人各发一份。
// V2.6.0 | 2026-11-26 老板口径：枯禅轮回演出改「三格同时滑行」——带阵营色描边、无击退挤压、无闪烁红锁，
//   时长 900ms（比原换位慢）；载荷 swapChain → posCycle（render/419 → POS_CYCLE → fx/604 animatePosCycle）。
// V2.6.1 | 2026-11-26 老板纠错：取消 30% 随机顺时针——血最少已站 8 号位时，原逻辑会把满血者转进 8 号位；
//   现在永远优先把血最少的放 8 号位（已在 8 则跳过），其余两人 1/3 对调。
// V2.6.2 | 2026-11-26 老板口径：魔化谢逊每回合开始直接轰一发（不先蓄力），轰完续蓄；
//   蓄力期间被攻击 → 立刻轰并续蓄；回合收尾若仍在蓄力 → 把这一发打出去。
// V2.7.0 | 2026-11-26 老板口径：枯禅轮回改「三渡每次被攻击都判定」——把血量比例最低者换到 8 号位
//   （已在 8 号位则不动）；删除 70%/40% 阈值与 1/3 对调；回血仍为 8 号位行动前每回合一次。
export const VER = 'modules/342-elite-sixsects-san-du.js V2.7.1';

import { registerSettlementHook, EFFECT_TYPES } from '../infra/101-event-bus.js';
import { registerMechanicHandler } from '../core/219-mechanic-registry.js';
import { SIGNAL_TYPES, MECHANIC_TYPES, CAMP_TYPES, FACT_TYPES, SKILL_CUE_KINDS, BUFF_TYPES } from '../infra/106-battle-enums.js';
import { addMod, applyStatChange, getBattleRng, getStat, swapUnitPositions } from '../core/214-battle-shared.js';
import { computeBuffStats } from '../core/204-buff-system.js';
import { computeDodgeChance } from '../core/213-battle-attack-edge.js';
import { pushSkillAnnounce } from './305-elite-helpers.js';
import { registerDodgeRule } from '../core/221-registry-dodge.js';
import { GlobalStore } from '../infra/104-global-store.js';

// 本回合在场的自己（decl.camp 指明站在哪一方；三渡/谢逊只会出现在敌方 B 队）
function findSelf(A, B, decl) {
    const team = decl.camp === CAMP_TYPES.ALLY ? A : B;
    return (team || []).find(u => u && u.name === decl.name) || null;
}

// 三渡数值唯一来源（老板 2026-11-22 拍板：首当其冲与 2 号位严阵以待两个 40% 共用同一常量，不写死两处）
const SAN_DU_DEF_BONUS = 0.4;          // 防御 +40%（个人技 / 2 号位阵位，共用）
const SAN_DU_FORTIFY_REBOUND = 0.4;    // 2 号位严阵以待受击反弹：实际承伤的 40%
const SAN_DU_LIUYUN_RATE = 0.25;       // 流云身法闪避 +25%
const SAN_DU_DOUBLE_STRIKE_RATE = 0.8; // 概率连击：80%

// ── 枯禅轮回阵（第6关倒三角变体）数值唯一来源 ──
const SAN_DU_NAME_SET = new Set(['渡厄', '渡劫', '渡难']); // 三渡名单（枯禅轮回/8号位回血识别用）
const SAN_DU_KUCHAN_HEAL_RATE = 0.4;   // 8 号位枯禅回血：40% 最大生命（V2.3.2 老板上调）
const DEMON_BURST_DMG = 28;            // 魔化谢逊每发：28 点（打敌方=真伤 / 落自家=回血），V2.5.0 老板改回 28
const DEMON_SHOTS_PER_VOLLEY = 1;      // 每次「开轰」一发（V2.5.0 老板：轰两下太夸张，改回一发）
// （枯禅轮回：跌破 70%/40% 两档触发；血最少者优先回 8 号位，无随机分支）

// ── 三大高僧的固定被动 ──
export const monkFixedBuffHandler = {
    fields: { buffType: 'string' },
    install({ A, B, decl }) {
        const self = findSelf(A, B, decl);
        if (!self) return;
        // 三渡免疫控制（2026-11-22 老板口径）：眩晕/击退/换位一律不吃，守卫在 core/12+13
        self.state._ctrlImmune = true;
        // 三渡所在队伍开局携带「圣火不熄」（老板 2026-11-25 口径，正/倒三角通用）：
        //   走全局海克斯名额——每局首次有本队非巨马/非召唤单位阵亡 → 该单位原地复活一次（回 40% 最大生命）。
        //   挂在队伍 _activeBuffs（core/204 submitHolyFireRecord 认队伍 buff），不是每个三渡各发一份。
        const myTeam = (decl.camp === CAMP_TYPES.ALLY ? (A || []) : (B || []));
        if (!Array.isArray(myTeam._activeBuffs)) myTeam._activeBuffs = [];
        if (!myTeam._activeBuffs.some(b => b && b.key === BUFF_TYPES.HOLY_FIRE)) {
            myTeam._activeBuffs.push({ key: BUFF_TYPES.HOLY_FIRE, name: '圣火不熄', icon: '🕯️', permanent: true });
        }
        // UI 永久海克斯徽章（老板 2026-11-26：圣火不熄要出现在六大派名字下面的永久海克斯区）：
        //   ui/719 读 GlobalStore.activeBuffs，按 target 分阵营、按 permanent 走阵营名下徽章。
        const uiBuffs = GlobalStore.get('activeBuffs') || [];
        if (!uiBuffs.some(b => b && b.key === BUFF_TYPES.HOLY_FIRE && b.target === decl.camp)) {
            GlobalStore.set('activeBuffs', [...uiBuffs, {
                key: BUFF_TYPES.HOLY_FIRE, name: '圣火不熄', icon: '🕯️',
                target: decl.camp, remaining: Infinity, permanent: true
            }]);
        }
        // 枯禅轮回阵（第6关倒三角变体）在场判定：本队含魔化谢逊 → 金刚伏魔阵 30 点平回血停用（V2.2.0）
        const kuchanActive = ((decl.camp === CAMP_TYPES.ALLY ? (A || []) : (B || [])))
            .some(u => u && u.name === '魔化谢逊');

        if (decl.buffType === 'defense') {
            // 渡厄·首当其冲（个人技，绑人）：防御 +40%（ttl:'round' 每回合重挂，避免永久 mod 逐回合叠加）
            registerSettlementHook({
                when: SIGNAL_TYPES.ON_ROUND_START,
                priority: 20,
                handler: () => {
                    if (!self.alive) return;
                    addMod(self, 'def', { source: '首当其冲', value: SAN_DU_DEF_BONUS, ttl: 'round', op: 'mul', group: 'monkDef' });
                }
            });
            // 阵位授予（认位不认人）：2 号位=严阵以待（防御 +40% + 受击反弹 40%）；7/9 号位只保留金刚伏魔阵回血
            registerSettlementHook({
                when: SIGNAL_TYPES.ON_ROUND_START,
                priority: 19,
                handler: (data) => {
                    const team = (decl.camp === CAMP_TYPES.ALLY ? (A || []) : (B || []));
                    let fortifyUnit = null;
                    team.forEach(u => {
                        if (!u || !u.state) return;
                        const atTwo = u.alive && u.pos === 2;
                        u.state._sanDuFortify = atTwo;
                        if (!atTwo) return;
                        addMod(u, 'def', { source: '严阵以待', value: SAN_DU_DEF_BONUS, ttl: 'round', op: 'mul', group: 'sanDuPosFort' });
                        fortifyUnit = u;
                    });
                    if (fortifyUnit) {
                        pushSkillAnnounce(data && data.log, fortifyUnit, '严阵以待',
                            `🛡️ 严阵以待：${fortifyUnit.name} 防御 +${Math.round(SAN_DU_DEF_BONUS * 100)}%，受击反弹 ${Math.round(SAN_DU_FORTIFY_REBOUND * 100)}%`);
                    }
                }
            });
            // 严阵以待反击：2 号位实际掉血后反弹 40% 给攻击者（FORTIFY_REBOUND 自带横幅 + 飘字 + 战报）
            registerSettlementHook({
                when: 'afterDamageApplied',
                priority: 24,
                handler: (data) => {
                    const { unit, target, dmg } = data || {};
                    if (!unit || !target || !target.alive || !target.state || !target.state._sanDuFortify) return;
                    if (target.pos !== 2 || !dmg || dmg <= 0) return;
                    const value = Math.floor(dmg * SAN_DU_FORTIFY_REBOUND);
                    if (value <= 0) return;
                    if (!data.declarations) data.declarations = [];
                    data.declarations.push({
                        type: EFFECT_TYPES.REBOUND,
                        value,
                        source: target,
                        target: unit,
                        factType: FACT_TYPES.FORTIFY_REBOUND,
                        factData: { reboundDmg: value, unitName: unit.name, attackerUid: unit.uid, unitUid: target.uid }
                    });
                }
            });
        } else if (decl.buffType === 'doubleAttack') {
            // 渡劫·概率连击：命中/闪避后 80% 概率追加一次（每回合只掷一次骰，不 100% 必发）
            // 格子 ⚡：连击不是轮盘抽的，step.doubleStrikeUid 里没有他 → 用常驻旗给格子补 logo
            self.state._sanDuDoubleStrike = true;
            const submitSecond = (data) => {
                if (!data || data.unit !== self || !self.alive) return;
                if (self.state._doubleStrikeRolled) return;
                self.state._doubleStrikeRolled = true;
                if (self.state._doubleStriked) return;
                // 概率掷骰走全仓惯例 nextInt(1,100)（205 同款）；nextFloat 不是本仓 RNG 的 API（EventBus 会吞 TypeError，症状=连击静默死）
                if (getBattleRng().nextInt(1, 100) > SAN_DU_DOUBLE_STRIKE_RATE * 100) return;
                self.state._doubleStriked = true;
                const fact = {
                    factType: FACT_TYPES.DOUBLE_STRIKE,
                    data: { success: true, unitName: self.name }
                };
                if (Array.isArray(data.deferredFacts)) data.deferredFacts.push(fact);
                else if (Array.isArray(data.log)) data.log.push(fact);
                if (!Array.isArray(data.extraRequests)) data.extraRequests = [];
                data.extraRequests.push({
                    unit: self,
                    targetUid: (data.target && data.target.alive && !data.target.state._pendingDeath) ? data.target.uid : null,
                    reason: 'doubleStrike',
                    actedMode: 'allow',
                    priority: 10,
                    ignoreBlock: true
                });
            };
            registerSettlementHook({ when: SIGNAL_TYPES.AFTER_ATTACK, priority: 20, handler: submitSecond });
            registerSettlementHook({ when: SIGNAL_TYPES.AFTER_MISS, priority: 20, handler: submitSecond });
            // 每回合重置掷骰与追加标记（_doubleStriked 由核心统一清，这里只补掷骰标记）
            registerSettlementHook({
                when: SIGNAL_TYPES.ON_ROUND_START,
                priority: 18,
                handler: () => { self.state._doubleStrikeRolled = false; self.state._doubleStriked = false; }
            });
        } else if (decl.buffType === 'dodge') {
            // 渡难·流云身法：闪避 +25%（格子挂 💨 logo，回合开始播报一条，避免只有属性面板能看见）
            self.state._sanDuLiuYun = true;
            registerDodgeRule((target) => (target && target.uid === self.uid && target.alive ? SAN_DU_LIUYUN_RATE : 0));
            registerSettlementHook({
                when: SIGNAL_TYPES.ON_ROUND_START,
                priority: 22,
                handler: (data) => {
                    if (!self.alive) return;
                    pushSkillAnnounce(data && data.log, self, '流云身法',
                        `💨 流云身法：${self.name} 闪避 +${Math.round(SAN_DU_LIUYUN_RATE * 100)}%`);
                }
            });
        }

        // 共有：7~9 号位每回合开始回复 30 点生命
        //   2026-11-22 老板报：回血没日志没飘字——补 SKILL_ANNOUNCE 播报 + 飘字（满血回复 0 不刷行）。
        //   注意：本回复暂未接 341 智取抢血前置钩子（休息回血/飞行再生走的是 stealHealByHook），要接说一声。
        registerSettlementHook({
            when: SIGNAL_TYPES.ON_ROUND_START,
            priority: 21,
            handler: (data) => {
                if (kuchanActive) return;   // 枯禅轮回阵在场：30 点平回血停用（8 号位 30% 接管）
                if (!self.alive || ![7, 8, 9].includes(self.pos)) return;
                const hpBefore = self.hp;
                applyStatChange(self, 'hp', 30, self, '金刚伏魔阵回复');
                const healed = self.hp - hpBefore;
                if (healed > 0) {
                    pushSkillAnnounce(data && data.log, self, '金刚伏魔阵',
                        `${self.name} 金刚伏魔阵回复 ${Math.round(healed)} 点生命（${Math.round(hpBefore)} → ${Math.round(self.hp)}）`,
                        // 回血=绿色日志 + 绿色飘字（老板 2026-11-22 口径：恢复类走绿色，伤害/加防才金色）
                        { floatText: '💚', floatUid: self.uid, tone: 'heal' });
                }
            }
        });
    }
};

// ── 炎魔狮王：被金刚伏魔圈锁死 ──
// V2.1.0：免疫控制；双发炎爆——回合开始固定 18 点，轮到自己蓄力，回合收尾（ROUND_SETTLED）再打 28 点
export const blazeLionKingHandler = {
    fields: {},
    install({ A, B, decl }) {
        const self = findSelf(A, B, decl);
        if (!self) return;
        // 炎魔免疫控制（2026-11-22 老板口径）：眩晕/击退/换位一律不吃
        self.state._ctrlImmune = true;

        // 炎爆统一出口：随机挑一名明教非召唤单位，真伤 + 火球演出 + 战报
        //   forceSeparator：回合开始那发紧跟「第N回合开始」头，播放层默认不画分隔符（省墨），
        //   但炎爆是独立伤害事件，必须强制自成一组，所以单独抬一个 separatorForce 放行。
        function fireBurst(dmg, data, title, forceSeparator) {
            if (!self.alive) return;
            const pool = (((data && data.A) || A) || []).filter(u => u && u.alive && u.camp === CAMP_TYPES.ALLY && !u.isSummon);
            if (pool.length === 0) return;
            const victim = pool[getBattleRng().nextInt(0, pool.length - 1)];
            // 可被闪避：只判闪避率（规则型 + buff 闪避），不走进攻链 resolveAttackHit，
            //   因此不会触发闪避后的反伤/眩晕/追击（老板口径：可闪，但无闪避反击）。
            const vSide = victim.camp === CAMP_TYPES.ALLY ? ((data && data.A) || A) : ((data && data.B) || B);
            const dodgeStats = computeBuffStats(victim, (vSide && vSide._activeBuffs) || [], vSide);
            const dodgeRate = computeDodgeChance(victim, self, dodgeStats);
            if (dodgeRate > 0 && getBattleRng().nextInt(1, 100) <= Math.round(dodgeRate * 100)) {
                pushSkillAnnounce(data && data.log, self, title,
                    `炎魔狮王${title}轰向 ${victim.name}，被其身法闪开！`,
                    {
                        floatText: '💨', floatUid: victim.uid,
                        needsSeparator: true,
                        separatorForce: forceSeparator || undefined
                    });
                return;
            }
            applyStatChange(victim, 'hp', -dmg, self, `炎魔狮王·${title}`, true, false);
            pushSkillAnnounce(data && data.log, self, title,
                `炎魔狮王${title}轰向 ${victim.name}，造成 ${dmg} 点真实伤害！`,
                {
                    cue: {
                        kind: SKILL_CUE_KINDS.BLAZE_BURST,
                        self: { uid: self.uid, camp: self.camp, pos: self.pos },
                        target: { uid: victim.uid, camp: victim.camp, pos: victim.pos }
                    },
                    needsSeparator: true,
                    separatorForce: forceSeparator || undefined
                });
        }

        registerSettlementHook({
            when: SIGNAL_TYPES.ON_ROUND_START,
            priority: 24,
            handler: (data) => {
                if (!self.alive) return;
                // 永久无法行动：_stunned 每回合被重置，这里每回合重新压上（跳过出手/行动）
                self.state._stunned = true;
                self.state._blazeCharged = false;
                // 回合开始固定一发 18
                fireBurst(18, data, '炎爆', true);
            }
        });

        // 蓄力循环（2026-11-24 老板口径）：回合开始固定一发 18；之后处于「未蓄力」，
        //   被攻击 / 轮到自己 → 进入蓄力；
        //   已蓄力后再被攻击 / 轮到行动 / 回合收尾 → 立刻引爆一发 28，并马上重新蓄力。
        //   净效果：每多挨一次打，就多打一发。
        // V2.3.1 | 2026-11-24 老板口径：蓄力不再加护盾（护盾让炎魔太强）。
        function enterCharge(data, label) {
            self.state._blazeCharged = true;
            pushSkillAnnounce(data && data.log, self, '蓄力',
                `🔥 ${label}烈焰凝聚，蓄力待发…`,
                { floatText: '🔥', floatUid: self.uid, needsSeparator: true });
        }
        function fireCharged(data, label) {
            if (!self.state._blazeCharged) return;
            self.state._blazeCharged = false;
            fireBurst(28, data, label);
        }

        // 「轮到自己」：炎魔被眩晕跳过，走的是 PASS 分支的 ON_UNIT_ACTED，同样能接住
        registerSettlementHook({
            when: SIGNAL_TYPES.ON_UNIT_ACTED,
            priority: 24,
            handler: (data) => {
                if (!self.alive || !data || data.unit !== self) return;
                if (!self.state._blazeCharged) enterCharge(data, '炎魔狮王');
                fireCharged(data, '炎爆');
            }
        });

        // 被攻击：未蓄力则开始蓄力；已蓄力则立刻引爆一发并续蓄（挨打越多打越多）
        registerSettlementHook({
            when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
            priority: 25,
            handler: (data) => {
                if (!self.alive || !data || data.target !== self) return;
                if (!(data.dmg > 0)) return;
                if (!self.state._blazeCharged) { enterCharge(data, '炎魔狮王'); return; }
                fireCharged(data, '炎爆');
                enterCharge(data, '炎魔狮王');
            }
        });

        // 回合收尾（所有单位行动完、回合结束结算前）：蓄着就炸出去
        //   ⚠️ 不能挂 ON_ROUND_END——那是每次出手后广播，会一回合打很多次。
        registerSettlementHook({
            when: SIGNAL_TYPES.ROUND_SETTLED,
            priority: 24,
            handler: (data) => {
                if (!self.alive) return;
                fireCharged(data, '炎爆');
            }
        });
    }
};

registerMechanicHandler(MECHANIC_TYPES.MONK_FIXED_BUFF, monkFixedBuffHandler);
registerMechanicHandler(MECHANIC_TYPES.BLAZE_LION_KING, blazeLionKingHandler);

// ── 魔化谢逊：被金刚伏魔圈锁死（第6关倒三角·枯禅轮回阵核心，V2.2.0） ──
// 锁 5 号位不动（攻 0，输出全走收尾真伤）；回合收尾对全场随机 2 发 28 点真伤（敌我不分=魔化）；
// 任一三渡血量首次跌破 70%/40% 时驱动枯禅轮回：三渡按实际站位顺时针轮转 1→3→8→1。
// 真伤按任务书口径不可闪避（与炎爆 V2.1.3 的「可闪」口径不同）——要改成可闪说一声。
export const demonXiexunHandler = {
    fields: {},
    install({ A, B, decl }) {
        const self = findSelf(A, B, decl);
        if (!self) return;
        self.state._ctrlImmune = true;   // 免疫控制（同炎魔）
        self.atk = 0;                    // 不普攻：攻 0（含基础值），输出全走收尾真伤
        self.state._baseAtk = 0;
        self.state._noRestMark = true;   // 格子不显示 😴 休息标记（老板 2026-11-24 报「谢逊职业 logo 是个晕」）
        // 三渡花名册（本队、存活）
        const trio = () => ((decl.camp === CAMP_TYPES.ALLY ? (A || []) : (B || [])))
            .filter(u => u && SAN_DU_NAME_SET.has(u.name) && u.alive);

        // 开局先轰一发 28（轰完立刻续蓄）；之后只由 ①被攻击 ②回合收尾 触发开轰。
        // 每回合压 _stunned（同炎魔：_stunned 会被引擎每回合重置）
        registerSettlementHook({
            when: SIGNAL_TYPES.ON_ROUND_START,
            priority: 24,
            handler: (data) => {
                if (!self.alive) return;
                self.state._stunned = true;
                // 老板 2026-11-26：每回合开始直接轰一发（不先蓄力），轰完立刻续蓄；
                //   蓄力期间被攻击 → 立刻开轰并续蓄；回合收尾若仍在蓄力，就把这一发打出去。
                self.state._demonCharged = true;
                fireVolley(data);
            }
        });

        // 魔化真伤统一出口（V2.2.1 起可被闪避；自家人改为回血）
        //   ⚠️ 不能挂 ON_ROUND_END——那是每次出手后广播，会一回合打很多次。
        // V2.2.1：真伤可被闪避（老板 2026-11-24 口径，与正三角炎爆一致）——先判闪避率，
        //   闪开则本次不掉血、飘「闪避！」；不走进攻链，因此不触发闪避后的反击/追击。
        // V2.2.2（2026-11-24 老板口径）：恢复敌我不分，但打到自家人时改为**回血 28**（不判闪避）——
        //   魔化谢逊发狂不分敌我，落在三渡身上反而是「拍醒队友」。
        function demonStrike(data) {
            if (!self.alive) return;
            const aSide = ((data && data.A) || A) || [];
            const bSide = ((data && data.B) || B) || [];
            const pool = [...aSide, ...bSide].filter(u => u && u.alive && !u.isSummon && u.uid !== self.uid);
            if (pool.length === 0) return;
            const victim = pool[getBattleRng().nextInt(0, pool.length - 1)];
            // 自家人：改判回血，不回血判闪避
            if (victim.camp === self.camp) {
                const hpBefore = victim.hp;
                applyStatChange(victim, 'hp', DEMON_BURST_DMG, self, '魔化·枯禅回血');
                const healed = Math.max(0, Math.round(victim.hp - hpBefore));
                pushSkillAnnounce(data && data.log, self, '魔化',
                    `💚 魔化谢逊反手一掌拍醒 ${victim.name}，回复 ${healed} 点生命`,
                    {
                        floatText: '💚', floatUid: victim.uid, tone: 'heal', needsSeparator: true,
                        // 老板 2026-11-24 口径：回血不要火球，要「圣光/十字架」那种治疗演出
                        cue: {
                            kind: SKILL_CUE_KINDS.DEMON_HEAL,
                            target: { uid: victim.uid, camp: victim.camp, pos: victim.pos }
                        }
                    });
                return;
            }
            const vSide = victim.camp === CAMP_TYPES.ALLY ? aSide : bSide;
            const dodgeStats = computeBuffStats(victim, (vSide && vSide._activeBuffs) || [], vSide);
            const dodgeRate = computeDodgeChance(victim, self, dodgeStats);
            if (dodgeRate > 0 && getBattleRng().nextInt(1, 100) <= Math.round(dodgeRate * 100)) {
                pushSkillAnnounce(data && data.log, self, '魔化',
                    `💀 魔化谢逊扑向 ${victim.name}，被其身法闪开！`,
                    { floatText: '闪避！', floatUid: victim.uid, needsSeparator: true });
                return;
            }
            applyStatChange(victim, 'hp', -DEMON_BURST_DMG, self, '魔化·枯禅真伤', true, false);
            pushSkillAnnounce(data && data.log, self, '魔化',
                `💀 魔化谢逊发狂，对 ${victim.name} 造成 ${DEMON_BURST_DMG} 点真实伤害！`,
                {
                    floatText: '💀', floatUid: victim.uid, needsSeparator: true,
                    // 老板 2026-11-24 报「谢逊打伤害没有炎爆那种演出」：复用炎爆三段（凝球→飞行→爆开）
                    cue: {
                        kind: SKILL_CUE_KINDS.DEMON_BURST,
                        slow: true,   // 老板 2026-11-25：开轰动画慢一点，看得清
                        self: { uid: self.uid, camp: self.camp, pos: self.pos },
                        target: { uid: victim.uid, camp: victim.camp, pos: victim.pos }
                    }
                });
        }
        // 蓄力循环（V2.5.0，2026-11-25 老板口径）：
        //   开局轰一发 28 → 蓄力；蓄力状态下 ①被攻击 ②回合收尾 —— 任一发生就再轰一发，
        //   轰完立刻续蓄（所以只要还在挨打，就会一直「挨一下→轰一发→再蓄」）。
        //   落到明教=28 真伤（可闪避），落到自家三渡=回 28 生命（圣光演出）。
        function enterCharge(data) {
            self.state._demonCharged = true;
            pushSkillAnnounce(data && data.log, self, '蓄力',
                '🔥 魔化谢逊魔气凝聚，蓄力待发…',
                { floatText: '🔥', floatUid: self.uid, needsSeparator: true });
        }
        function fireVolley(data) {
            if (!self.state._demonCharged) return;
            self.state._demonCharged = false;
            for (let i = 0; i < DEMON_SHOTS_PER_VOLLEY; i++) demonStrike(data);
            enterCharge(data);   // 轰完立刻重新蓄力
        }
        // 被攻击：蓄力中就开轰（没蓄力就先蓄，正常流程下开局已蓄满，此分支只在极端时序出现）
        registerSettlementHook({
            when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
            priority: 24,
            handler: (data) => {
                if (!self.alive || !data || data.target !== self) return;
                if (!(data.dmg > 0)) return;
                if (self.state._demonCharged) fireVolley(data);
                else enterCharge(data);
            }
        });
        // 回合收尾：蓄力中就开轰（轰完续蓄，下一回合开局即处于蓄力）
        registerSettlementHook({
            when: SIGNAL_TYPES.ROUND_SETTLED,
            priority: 23,
            handler: (data) => { if (self.alive) fireVolley(data); }
        });

        // 枯禅轮回（老板 2026-11-26 口径）：三渡**每被攻击一次**就判定一次——
        //   把当前血量比例最低的那位换到 8 号位（本身已在 8 号位则不动、不播报）。
        //   不再用 70%/40% 血量阈值，也不再额外 1/3 对调；回血仍走「8 号位轮到行动前，每回合一次」。
        //   ！三渡免疫控制，swapUnitPositions 必须 friendlyPull:true 放行 core/214 的免控拦截（自家阵法轮转=友方拉）。
        registerSettlementHook({
            when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
            priority: 26,
            handler: (data) => {
                if (!data || !(data.dmg > 0) || !data.target) return;
                const monks = trio();
                if (monks.length < 3) return;
                if (!monks.includes(data.target)) return;   // 只认三渡自己挨打
                const at = (p) => monks.find(u => u.pos === p) || null;
                const at8 = at(8);
                if (!at8) return;
                const ratioOf = (u) => u.hp / Math.max(1, getStat(u, 'maxHp'));
                const lowest = monks.reduce((a, b) => (ratioOf(b) < ratioOf(a) ? b : a));
                if (lowest === at8) return;                 // 血最少的已在 8 号位，不动
                const fromPos = lowest.pos;
                if (!swapUnitPositions(lowest, at8, data.log, { friendlyPull: true })) return;
                const posCycle = [
                    { uid: lowest.uid, fromPos, toPos: 8 },
                    { uid: at8.uid, fromPos: 8, toPos: fromPos }
                ];
                pushSkillAnnounce(data.log, lowest, '枯禅轮回',
                    `☸️ 枯禅轮回：${lowest.name} 退到 8 号位，${at8.name} 顶上 ${fromPos} 号位`,
                    {
                        floatText: '☸️', floatUid: lowest.uid, needsSeparator: true,
                        posCycle, camp: lowest.camp
                    });
            }
        });

        // 8 号位枯禅回血：轮到三渡行动前回 40% 最大生命（每回合一次 _kuchanHealed 闸，防渡劫连击双回；满血不刷行）
        registerSettlementHook({
            when: SIGNAL_TYPES.ON_ROUND_START,
            priority: 17,
            handler: () => { trio().forEach(u => { u.state._kuchanHealed = false; }); }
        });
        registerSettlementHook({
            when: SIGNAL_TYPES.BEFORE_ACTION_SELECT,
            priority: 10,
            handler: (data) => {
                if (!data || !data.unit || !data.unit.alive || !SAN_DU_NAME_SET.has(data.unit.name)) return;
                if (data.unit.pos !== 8 || data.unit.state._kuchanHealed) return;
                const maxHp = getStat(data.unit, 'maxHp');
                if (!(data.unit.hp < maxHp)) return;
                data.unit.state._kuchanHealed = true;
                const hpBefore = data.unit.hp;
                applyStatChange(data.unit, 'hp', Math.floor(maxHp * SAN_DU_KUCHAN_HEAL_RATE), self, '枯禅轮回回复');
                const healed = data.unit.hp - hpBefore;
                if (healed > 0) {
                    pushSkillAnnounce(data.log, data.unit, '枯禅轮回',
                        `🌿 ${data.unit.name} 在谢逊身后入定，回复 ${Math.round(healed)} 点生命（${Math.round(hpBefore)} → ${Math.round(data.unit.hp)}）`,
                        { floatText: '🌿', floatUid: data.unit.uid, tone: 'heal' });
                }
            }
        });
    }
};

registerMechanicHandler(MECHANIC_TYPES.DEMON_XIEXUN, demonXiexunHandler);
