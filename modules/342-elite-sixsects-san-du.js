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
// V2.7.2 | 2026-11-26 老板口径：魔化谢逊血量 2888 → 288（每发 28 对应 288 血），
//   每次开轰给自己叠 1% 最大生命护盾；content.m/poolTier 由 115 校正为 143（288/2.5+0+28）。
// V2.7.3 | 2026-11-26 老板口径：魔化谢逊每炮护盾 1% → 2% 最大生命（288 血每炮 +5 点，可叠）。
// V2.7.4 | 2026-11-26 老板报「拒马开局被轰直接显示 2 血、看不到 30」：开局轰从 ON_ROUND_START 推迟到
//   本回合第一个单位行动前（BEFORE_ACTION_SELECT），让 ROUND_START 的召唤物先按初始血量渲染一帧。
// V2.7.5 | 2026-11-26 老板报「轰了 28 但对面血条像没变、日志没有前后血量」：真伤/回血补 emitHpChange
//   广播（真伤不走攻击链，原本不刷格子血条），日志补「造成 N 点真实伤害（A → B）」。
// V2.7.6 | 2026-11-26 老板报「六大派下面仍没有圣火不熄徽章」：开局 buff 抽取会整体覆盖 activeBuffs，
//   install 时写一次被冲掉 → 抽 syncHolyFireBadge()，install + 每回合开始各补一次（幂等）。
// V2.7.7 | 2026-11-26 老板拍板：8 号位回血改为「换位落地即回」——原「轮到自己行动前」会漏掉
//   本回合已行动过、被换进 8 号位的人；现换入当场回 40%（每回合每人一次闸，满血不刷行）。
// V2.7.8 | 2026-11-26 老板口径：①取消魔化谢逊「每轰一炮叠护盾」；②渡难流云身法之外再 +20% 闪避（合计 45%）；
//   ③渡厄在首当其冲之外再挂个人「严阵以待」（防御再 +40% + 受击反弹 40%，不认站位）；
//   ④渡劫在概率连击之外再加战士加成 +9 攻 / +9 防 / +90 血。
// V2.7.9 | 2026-11-27 老板报「渡劫血 165→255→338→428→512、攻 29→60」：core/210 每回合重跑
//   installDeclaredSkills → 342 的战士加成每回合重复 addMod。加 _sanDuWarriorBonus 幂等闸，只生效一次。
// V2.7.10 | 2026-11-27 老板口径：8 号位枯禅回血 40% → 20% 最大生命（轮回几乎每回合都能触发，
//   40% 等于反复回满，是三渡强度暴涨的主因；属性加强保持不动）。
// V2.7.11 | 2026-11-27 老板纠正：渡难追加闪避 / 渡厄个人严阵以待 / 渡劫战士加成 三项都是「倒三角专属」，
//   只在枯禅轮回阵（本队有魔化谢逊）时生效；正三角（炎魔）回到原口径，避免加强外溢。
// V2.7.13 | 2026-11-27 老板纠正：严阵以待不许删——倒三角渡厄 = 个人严阵以待（防御+40%、受击反弹40%，不认站位）
//   + 防战职业加成（-8攻/+2防/+45血）；渡劫 = 战士职业加成（+3/+3/+30）；渡难 = 流云 25% + 额外 20% 闪避。
// V2.7.14 | 2026-11-27 老板口径：炎魔狮王回合开始那发 18 → 28，与其它炎爆统一（不再有 18 的档）。
// V2.7.15 | 2026-11-27 老板口径：渡厄「首当其冲」改为永久词条、安装一次（原每回合挂/清一轮）。
// V2.7.16 | 2026-11-27 老板报「正三角六大派没有圣火不熄徽章」：补挂 hook 的 priority 60 早于
//   buff 抽写 → 每回合写完就被覆盖（实测 activeBuffs 只剩 unity/cloudBody）；改为 999 最后补。
// V2.7.17 | 2026-11-27 老板口径：炎魔狮王不挨打引爆——只保留「回合开始一发 28 → 轮到自己蓄力 → 收尾一发 28」；
//   「被攻击立刻引爆/续蓄」专属魔化谢逊。
// V2.7.18 | 2026-11-27 枯禅轮回改三人整体旋转（顺/逆时针，方向自动选让血最少者落 8 号位），
//   不再两两互换；动画改白底带格子内容、时长 1700ms（原来半透明红框看不出是谁）。
// V2.7.19 | 2026-11-27 渡厄攻归零（攻击力不足无法出手）：防战职业加成改按 group='sanDuDefender' 查重，
//   修复单位克隆后标记丢失导致每回合重复扣 -8 攻（防/血上限同源累积）。
// V2.7.20 | 2026-11-27 老板口径：撤掉渡厄的「防战职业加成」（已有首当其冲 + 严阵以待足够）。
// V2.7.21 | 2026-11-27 圣火不熄徽章收口到 ui/719（按 UI.enemyTeam 阵容自愈）；本文件删掉 syncHolyFireBadge
//   与 priority 999 补挂钩子，只保留队伍 _activeBuffs 的复活名额，杜绝两处各写一份 activeBuffs。
// V2.7.22 | 2026-11-27 老板口径：8 号位已是最低血时不旋转、也不回血（不转=不回）。
//   同期确认：「血最少」判据由 hp/maxHp 比例改为绝对血量（三渡最大血不同，比例会让高血职业抢 8 号位）。
export const VER = 'modules/342-elite-sixsects-san-du.js V2.7.22';

import { registerSettlementHook, EFFECT_TYPES } from '../infra/101-event-bus.js';
import { registerMechanicHandler } from '../core/219-mechanic-registry.js';
import { SIGNAL_TYPES, MECHANIC_TYPES, CAMP_TYPES, FACT_TYPES, SKILL_CUE_KINDS, BUFF_TYPES, ROLE_TYPES } from '../infra/106-battle-enums.js';
import { addMod, applyStatChange, emitHpChange, getBattleRng, getStat, swapUnitPositions } from '../core/214-battle-shared.js';
import { computeBuffStats } from '../core/204-buff-system.js';
import { computeDodgeChance } from '../core/213-battle-attack-edge.js';
import { pushSkillAnnounce, applyRoleBonusMods } from './305-elite-helpers.js';
import { registerDodgeRule } from '../core/221-registry-dodge.js';

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
const SAN_DU_KUCHAN_HEAL_RATE = 0.2;   // 8 号位枯禅回血：20% 最大生命（V2.7.10 老板下调：40% 几乎回满，太强）
const SAN_DU_LIUYUN_EXTRA = 0.20;      // 渡难追加闪避：流云 25% 之外再 +20%（V2.7.8 老板口径 → 合计 45%）
// 渡厄/渡劫 的追加加成统一走 content roles 的职业加成表（V2.7.12 老板口径），不再本地写死数值
const DEMON_BURST_DMG = 28;            // 魔化谢逊每发：28 点（打敌方=真伤 / 落自家=回血），V2.5.0 老板改回 28
const DEMON_SHOTS_PER_VOLLEY = 1;      // 每次「开轰」一发（V2.5.0 老板：轰两下太夸张，改回一发）
// V2.7.8 老板口径：取消「每轰一炮叠护盾」——倒三角不再有护盾。
// （枯禅轮回：跌破 70%/40% 两档触发；血最少者优先回 8 号位，无随机分支）

// 圣火不熄的 UI 徽章不在这里写：唯一出口是 ui/719 updateBuffSlots（按 UI.enemyTeam 阵容自愈补齐）。
//   本文件只负责引擎侧效果（队伍 _activeBuffs 复活名额），避免两处各写一份 activeBuffs 互相覆盖（2026-11-27）。

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
        // UI 永久海克斯徽章由 ui/719 updateBuffSlots 按阵容自愈补齐（2026-11-27 收口，本文件不再往 UI store 写）
        // 枯禅轮回阵（第6关倒三角变体）在场判定：本队含魔化谢逊 → 金刚伏魔阵 30 点平回血停用（V2.2.0）
        const kuchanActive = ((decl.camp === CAMP_TYPES.ALLY ? (A || []) : (B || [])))
            .some(u => u && u.name === '魔化谢逊');

        if (decl.buffType === 'defense') {
            // 渡厄·首当其冲（个人技，绑人）：永久防御 ×1.4，挂一次就一直在，不重挂、不清除。
            //   真正原因：addMod 是纯 push 不去重（core/214:442），install 每回合重跑时，
            //   `_sanDuShouDangApplied` 标记随单位克隆/重建丢失 → 每回合再 push 一条 → ×1.4 累积（23→78）。
            //   改为按 group='monkDef' 查重：已经挂着永久词条就不再 push。
            const hasShouDang = ((self._mods && self._mods.def) || [])
                .some(m => m && m.group === 'monkDef' && m.ttl === 'permanent');
            if (!hasShouDang) {
                addMod(self, 'def', { source: '首当其冲', value: SAN_DU_DEF_BONUS, ttl: 'permanent', op: 'mul', group: 'monkDef' });
            }
            // V2.7.13 老板纠正：严阵以待不删——倒三角里渡厄照旧吃「个人严阵以待」（防御 +40% + 受击反弹 40%，
            //   不认站位，因为倒三角三渡站 1/3/8 永远不在 2 号位），并且再叠加一套防战职业加成。
            if (kuchanActive) {
                registerSettlementHook({
                    when: SIGNAL_TYPES.ON_ROUND_START,
                    priority: 22,
                    handler: (data) => {
                        if (!self.alive) return;
                        addMod(self, 'def', { source: '严阵以待', value: SAN_DU_DEF_BONUS, ttl: 'round', op: 'mul', group: 'monkFortify' });
                        self.state._sanDuFortify = true;
                        pushSkillAnnounce(data && data.log, self, '严阵以待',
                            `🛡️ 严阵以待：${self.name} 防御 +${Math.round(SAN_DU_DEF_BONUS * 100)}%，受击反弹 ${Math.round(SAN_DU_FORTIFY_REBOUND * 100)}%`);
                    }
                });
            }
            // V2.7.20 老板口径：渡厄已有「首当其冲 + 严阵以待」，不再叠加防战职业加成（上一条已撤）。
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
                    // V2.7.8：倒三角里渡厄的个人「严阵以待」也置同一个旗，反弹口径一致
                    // V2.7.13：倒三角内不认站位（三渡站 1/3/8）；其它阵（正三角）仍只认 2 号位
                    if (!kuchanActive && target.pos !== 2) return;
                    if (!dmg || dmg <= 0) return;
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
            // V2.7.8 老板口径：渡劫在概率连击之外，额外吃一套战士职业加成（content roles.战士 = +3攻/+3防/+30血）
            // V2.7.9 关键修复：core/210 每回合都会重跑 installDeclaredSkills → 安装必须幂等，只生效一次
            // V2.7.11：仅倒三角（枯禅轮回阵）生效
            if (kuchanActive && !self.state._sanDuWarriorBonus) {
                self.state._sanDuWarriorBonus = true;
                applyRoleBonusMods(self, ROLE_TYPES.WARRIOR, '三渡·战士加成', 'sanDuWarrior');
            }
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
            // 渡难·流云身法：闪避 +25%，V2.7.8 再追加 20%（合计 45%，仅倒三角枯禅轮回阵生效）
            self.state._sanDuLiuYun = true;
            const dodgeTotal = SAN_DU_LIUYUN_RATE + (kuchanActive ? SAN_DU_LIUYUN_EXTRA : 0);
            registerDodgeRule((target) => (target && target.uid === self.uid && target.alive ? dodgeTotal : 0));
            registerSettlementHook({
                when: SIGNAL_TYPES.ON_ROUND_START,
                priority: 22,
                handler: (data) => {
                    if (!self.alive) return;
                    pushSkillAnnounce(data && data.log, self, '流云身法',
                        `💨 流云身法：${self.name} 闪避 +${Math.round(dodgeTotal * 100)}%`);
                }
            });
        }

        // 共有：7~9 号位每回合开始回复 30 点生命
        //   2026-11-22 老板报：回血没日志没飘字——补 SKILL_ANNOUNCE 播报 + 飘字（满血回复 0 不刷行）。
        //   注意：本回复暂未接 343 智取抢血前置钩子（休息回血/飞行再生走的是 stealHealByHook），要接说一声。
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
                // 回合开始固定一发 28（V2.7.14 老板口径：18 取消，统一按 28 打）
                fireBurst(28, data, '炎爆', true);
            }
        });

        // 蓄力循环（V2.7.16 老板口径：炎魔狮王不挨打引爆）：
        //   回合开始固定一发 28 → 轮到自己行动时进入蓄力 → 回合收尾蓄力完成打一发 28。
        //   「被攻击立刻引爆」只属于魔化谢逊，炎魔不挂该钩子。
        function enterCharge(data, label) {
            if (self.state._blazeCharged) return;
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

        // 「轮到自己」：炎魔被眩晕跳过，走的是 PASS 分支的 ON_UNIT_ACTED，这里只负责开始蓄力
        registerSettlementHook({
            when: SIGNAL_TYPES.ON_UNIT_ACTED,
            priority: 24,
            handler: (data) => {
                if (!self.alive || !data || data.unit !== self) return;
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
            handler: () => {
                if (!self.alive) return;
                self.state._stunned = true;
                self.state._demonOpened = false;
                // 老板 2026-11-26：开局这一发不再挂在 ROUND_START——拒马/幼狮等召唤也发生在 ROUND_START，
                //   同一步里渲染会直接显示扣完血的结果（拒马 30 → 2，中间的 30 看不到）。
                //   改为本回合「第一个单位行动前」开轰（下方 BEFORE_ACTION_SELECT），此时召唤物已按初始血量渲染过。
            }
        });

        // 开局轰（比 ROUND_START 晚一步）：本回合第一个单位行动前轰一发 28，轰完续蓄；每回合只一次。
        registerSettlementHook({
            when: SIGNAL_TYPES.BEFORE_ACTION_SELECT,
            priority: 24,
            handler: (data) => {
                if (!self.alive) return;
                if (self.state._demonOpened) return;
                self.state._demonOpened = true;
                fireVolley(data, true);
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
                emitHpChange(victim);
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
            const hpBefore = victim.hp;
            applyStatChange(victim, 'hp', -DEMON_BURST_DMG, self, '魔化·枯禅真伤', true, false);
            // 真伤不走攻击链，没有扣血广播 → 格子血条不刷新（老板 2026-11-26 报「轰了但血条像没变」）
            emitHpChange(victim);
            const lost = Math.max(0, Math.round(hpBefore - victim.hp));
            pushSkillAnnounce(data && data.log, self, '魔化',
                `💀 魔化谢逊发狂，对 ${victim.name} 造成 ${lost} 点真实伤害（${Math.round(hpBefore)} → ${Math.max(0, Math.round(victim.hp))}）！`,
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
        function fireVolley(data, force) {
            if (!force && !self.state._demonCharged) return;
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
                // 老板 2026-11-27 口径：按「绝对血量」最低者换位（三渡最大血不同，比比例会让高血职业抢 8 号位）
                const lowest = monks.reduce((a, b) => (b.hp < a.hp ? b : a));
                if (lowest === at8) return;   // 血最少的已在 8 号位：不旋转，也不回血（V2.7.21 老板口径：不转就不回）
                // 三人整体旋转（老板 2026-11-27 口径）：不是两两互换，是顺时针/逆时针三个格子一起转；
                //   方向自动选「能让血最少者落到 8 号位」的那一边。血最少者本来就在 8 号位 → 不转，也不回血。
                const ring = monks.slice().sort((a, b) => a.pos - b.pos);
                const iLow = ring.indexOf(lowest);
                const i8 = ring.indexOf(at8);
                const clockwise = ((iLow + 1) % 3) === i8;
                const order = clockwise ? ring : [ring[0], ring[2], ring[1]];
                const fromPosOf = new Map(ring.map(u => [u.uid, u.pos]));
                const [A, B, C] = order;
                // 环序 A→B→C→A：两次对换 (A C) 再 (A B) 完成 3-循环
                if (!swapUnitPositions(A, C, data.log, { friendlyPull: true })) return;
                if (!swapUnitPositions(A, B, data.log, { friendlyPull: true })) return;
                const posCycle = [
                    { uid: A.uid, fromPos: fromPosOf.get(A.uid), toPos: fromPosOf.get(B.uid) },
                    { uid: B.uid, fromPos: fromPosOf.get(B.uid), toPos: fromPosOf.get(C.uid) },
                    { uid: C.uid, fromPos: fromPosOf.get(C.uid), toPos: fromPosOf.get(A.uid) }
                ];
                pushSkillAnnounce(data.log, lowest, '枯禅轮回',
                    `☸️ 枯禅轮回（${clockwise ? '顺时针' : '逆时针'}）：${A.name}→${posCycle[0].toPos}号位，${B.name}→${posCycle[1].toPos}号位，${C.name}→${posCycle[2].toPos}号位`,
                    {
                        floatText: '☸️', floatUid: lowest.uid, needsSeparator: true,
                        posCycle, camp: lowest.camp
                    });
                // 换位落地即回血（老板 2026-11-26 拍板）：不等他行动——本回合已行动过的人被换进 8 号位
                //   原本会永远错过回血；改为换入当场回 40%，仍受「每回合每人一次」闸约束。
                healKuchan8(lowest, data.log);
            }
        });

        // 8 号位回血唯一出口：换入 8 号位当场回 40% 最大生命（每回合每人一次，满血不刷行）
        function healKuchan8(u, log) {
            if (!u || !u.alive || u.state._kuchanHealed) return;
            const maxHp = getStat(u, 'maxHp');
            if (!(u.hp < maxHp)) return;
            u.state._kuchanHealed = true;
            const hpBefore = u.hp;
            applyStatChange(u, 'hp', Math.floor(maxHp * SAN_DU_KUCHAN_HEAL_RATE), self, '枯禅轮回回复');
            emitHpChange(u);
            const healed = u.hp - hpBefore;
            if (healed > 0) {
                pushSkillAnnounce(log, u, '枯禅轮回',
                    `🌿 ${u.name} 在谢逊身后入定，回复 ${Math.round(healed)} 点生命（${Math.round(hpBefore)} → ${Math.round(u.hp)}）`,
                    { floatText: '🌿', floatUid: u.uid, tone: 'heal' });
            }
        }
        // 8 号位枯禅回血闸：每回合开头重置（每回合每人最多回一次，防渡劫连击/多次换位刷血）
        registerSettlementHook({
            when: SIGNAL_TYPES.ON_ROUND_START,
            priority: 17,
            handler: () => { trio().forEach(u => { u.state._kuchanHealed = false; }); }
        });
    }
};

registerMechanicHandler(MECHANIC_TYPES.DEMON_XIEXUN, demonXiexunHandler);
