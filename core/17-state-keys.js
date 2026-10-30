export const VER = 'core/17-state-keys.js V2.9.30';

/** 字段类型：决定 clone 时的拷贝方式 */
export const STATE_FIELD_TYPES = Object.freeze({
    BOOLEAN: 'boolean',
    NUMBER: 'number',
    STRING: 'string',
    ARRAY: 'array',
    OBJECT: 'object',
});

// 回合级状态：回合开始统一重置为 default
export const ROUND_STATE_SCHEMA = Object.freeze({
    _acted:                  { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _stunned:                { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _resting:                { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _blocked:                { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _emptyColBonus:          { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _bloodAuraBonus:         { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _holyAtkBonus:           { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _holyDefBonus:           { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _fortifyDefBonus:        { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _xingFenActive:          { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _isLinkAttack:           { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    // 被动出手原因：core/10 额外攻击执行期写入（counterAttack/followAttack/lionFollow/xuanmingLink/chaseAttack…），
    //   core/12 快照进 attack fact，render 层出【反击】等徽章与头顶飘字；结束即清。
    //   ⚠️ 已被 modules/27 当判定条件消费（鹰王威压/老当益壮仅在 _linkReason==='counterAttack' 时触发），不再是纯展示
    _linkReason:             { type: STATE_FIELD_TYPES.STRING,  default: null },
    _spiderAttacked:         { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _spiderTriggeredThisRound: { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _spiderFlying:           { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _fortifyThisRound:       { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _xiaoZhaoDoubleStriked:  { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _linkTriggered:          { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    // 胖远桥·正义国字脸：被嘲讽者本回合后续只能打胖远桥（回合级，回合开始自动清）
    _tauntedByPang:          { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    // 流云身法：团队版每回合随机有一人无法享受闪避加成（>1人时生效）
    _cloudBodySkip:          { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    // 唐文亮冲刺后待叠回春：等冲刺后那一拳结算完再叠（回合开始自动清）
    _pendingDashHeal:        { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
});

// 整场状态：跨回合持续，不重置
export const BATTLE_STATE_SCHEMA = Object.freeze({
    // 谢逊幼狮归属（多实例化）：召唤时写召唤者 uid，成长/振奋/随动按此认主——整场级，跨回合克隆保留
    // scope:'create' = 创建期字段（跨局复用时保留，不归零）
    _lionOwnerUid:           { type: STATE_FIELD_TYPES.STRING,  default: null, scope: 'create' },
    _isDead:                 { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _phantomTarget:          { type: STATE_FIELD_TYPES.STRING,  default: null },
    _xuanmingPoison:         { type: STATE_FIELD_TYPES.OBJECT,  default: null },
    _kuaiLeStack:            { type: STATE_FIELD_TYPES.ARRAY,   default: [] },
    _xingFenCount:           { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _xingFenPenaltyCount:    { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _kuLianActive:           { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _masteredRoles:          { type: STATE_FIELD_TYPES.ARRAY,   default: [] },
    _permanentBuffs:         { type: STATE_FIELD_TYPES.ARRAY,   default: [] },
    // 妹永久carry死亡计数桶 {cur,r1,r2}（modules/27 计数钩子累 cur、回合初蛛变滚动；层数=1+2×r1+r2）
    _xiaoCarryDeaths:        { type: STATE_FIELD_TYPES.OBJECT,  default: null },
    // 妹永久圣火令每回合行列表 {cols,rows}（回合初蛛变掷骰，core/14 按妹落位命中判攻防加成）
    _xiaoHolyFlame:          { type: STATE_FIELD_TYPES.OBJECT,  default: null },
    // 殷天正·老当益壮：反击命中累计的反击概率成长（本局累计，叠加在鹰爪功基础概率上）
    _counterProbBonus:       { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    // 唐文亮·七伤拳计数（整场）：战报行「伤己 x/7」7 档一循环；重做后改为「每次出手」计数
    //   （AFTER_SELECT_TARGET 递增，命中/闪避都计），满 7 触发冲刺·七伤齐发
    _qiShangCount:           { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    // 唐文亮·回春术层数（整场，可叠加）：数组每项=该层剩余回合数；
    //   行动完那一刻（ON_UNIT_ACTED）每层回自身已损生命的 lostHpPct（血 <30% 时 lostHpPctLow），
    //   减 1 回合、归零即移除。本回合是否已 tick 由 _hcTickedThisTurn 防双回血（冲刺后赠送攻击 vs 正常行动）
    _hcStacks:               { type: STATE_FIELD_TYPES.ARRAY,   default: [] },
    _hcTickedThisTurn:       { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    // 唐文亮·七伤拳「本击展示三件套」（仅本击有效：BEFORE_DAMAGE_CALC 写 → AFTER_DAMAGE_APPLIED
    //   搬进**本击自己的攻击组** → 立即清零）：_qiShangDmg 自损量→组 data.qiShangSelfDmg（render/38 飘 💥-N）、
    //   _qiShangNote 报幕文本→组 entries 开头 info 行、_qiShangBanner 满 7 横幅→组 data.qiShangBanner（BANNER 演出）
    _qiShangDmg:             { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _qiShangNote:            { type: STATE_FIELD_TYPES.STRING,  default: null },
    _qiShangBanner:          { type: STATE_FIELD_TYPES.STRING,  default: null },
    // 殷天正·鹰爪功反击暂存（定案「被白骨爪斩杀后不得反击」）：本击命中掷中反击后暂存
    //   待发的额外攻击请求，推迟到 AFTER_ATTACK 相位再出手——那时白骨爪连锁已落地，若他已死则不出手
    _yinCounterPending:      { type: STATE_FIELD_TYPES.OBJECT,  default: null },
    // 通用护盾（数值 = 剩余可吸收伤害；core/12 攻击扣血前先扣盾）：寒离飒蓄力时挂 20% 最大生命
    _shield:                 { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    // 永久护盾（九阳满血溢出）：与蓄力临时护盾分家——蓄力爆发结算只清 _shield，不清本字段
    _permShield:             { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _shieldAbsorbed:         { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    // 寒离飒：本局「九阳 / 寒毒」各触发过一次后解锁蓄力
    _hlsJiuYangDone:         { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _hlsHanBingDone:         { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    // 蓄力相位：0 未蓄力 / 1 已触发待下回合蓄 / 2 本回合蓄力（跳过行动）
    _hlsCharging:            { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    // 寒离飒低血双拳：本回合已触发过就置 true，回合开始统一清（防同回合无限连锁）
    _hlsDoubleFired:         { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    // 最近三回合承伤（每回合一个桶，回合开始滚动；蓄力真伤 = 桶和）
    _hlsTaken:               { type: STATE_FIELD_TYPES.ARRAY,   default: [] },
    // 寒冰神掌寒毒（结构同 _xuanmingPoison：{remaining, dotPercents}，modules/27 组件自结算）
    _hlsHanDu:               { type: STATE_FIELD_TYPES.OBJECT,  default: null },
    // 金刚不坏护罩（空见）：{ sourceUid, sourceName }，免疫一次伤害；被正规攻击/溅射消耗后置 null
    _immuneShield:           { type: STATE_FIELD_TYPES.OBJECT,  default: null },
    // 空见：已发出护罩次数 / 待发数量 / 五条件标记（opening/allyHurt/allyDead/selfHurt/selfLow）/ 升级标记
    _kongJianUsed:           { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _kongJianPending:        { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _kongJianFlags:          { type: STATE_FIELD_TYPES.OBJECT,  default: null },
    _kongJianUpgraded:       { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _butterflyAtk:           { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _butterflyDef:           { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _butterflyHp:            { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _butterflyHpTransfer:    { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _spiderRemaining:        { type: STATE_FIELD_TYPES.NUMBER,  default: 3 },
    _linkedPartnerUid:       { type: STATE_FIELD_TYPES.STRING,  default: null },
    // 何太冲·两仪双修：附加的对方职业能力（连接建立时写入、整场保留；core/03 三个特效声明按它放行）
    _dualSchools:            { type: STATE_FIELD_TYPES.ARRAY,   default: [] },
    // 何太冲·两仪连接对象 uid（建立即绑定不更换；搭档阵亡即视为断连）
    _liangyiPartnerUid:      { type: STATE_FIELD_TYPES.STRING,  default: null },
    // 何太冲·红血额度（每局限一次；血量回升也不再触发）
    _redBloodUsed:           { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    // 箭靶标记 🎯 剩余回合数（0 = 无标记；何太冲命中刷新为 3）
    _heMarkRounds:           { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    // 摄魂·妹永久「点名」剩余回合数（0 = 未被点名；core/11 每回合开始先 -1、再随机点名置 2）
    _soulDrainRounds:        { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _spiderTriggeredHit:     { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _spiderTriggered70:      { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _spiderTriggered40:      { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _spiderTriggeredDeath:   { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    // 本次飞天档位（'70' / '40' / 'death' / 'hatch'）：落地回血依此选 landHealRatio / landHealRatioDeath
    _spiderLandTier:         { type: STATE_FIELD_TYPES.STRING,  default: null },
    // 小昭·妹蜘蛛卵：毒/反伤致死绕过飞天 → 原地结茧；卵期计满 2 回合末孵化
    _spiderEgg:              { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _spiderEggUsed:          { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _spiderEggRounds:        { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    // 孵化过（保留 40% 血）：落地回血跳过、三档全作废，本局再死=真死
    _spiderEggHatch:         { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _untargetable:           { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _hotBloodCount:          { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _doubleStriked:          { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _zhangSwitched:          { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _fortifyStacks:          { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _fortifyIncrement:       { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _fortifyCap:             { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _dodgeStack:             { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _flyMode:                { type: STATE_FIELD_TYPES.STRING,  default: null },
    // FSM 当前相位镜像（张无忌 ranged/near/ronghui、小昭·姊 attached、小昭·妹 flying）。
    //   由 infra/51 StateMachine 的 onChange 回调实时写入，随本 schema 走 clone/UI 同步，
    //   渲染层只读它判「附身/飞天」，不再伸手读引擎的 unit._fsm 实例。
    _fsmPhase:               { type: STATE_FIELD_TYPES.STRING,  default: null },
    _butterflyHost:          { type: STATE_FIELD_TYPES.STRING,  default: null },
    // 蝶变附身额外选中受惠的队友 uid
    _extraButterflyHost:     { type: STATE_FIELD_TYPES.STRING,  default: null },
    _zhangTauntDone:         { type: STATE_FIELD_TYPES.BOOLEAN, default: false },

    // 张三丰：第十回合严阵以待
    _roundCountForFortify:   { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _tenRoundFired:          { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    // 背水一战·姐姐强化专属吸血率：applyLastStandBonus 触发了低血才写入 0.15，没触发自动清零
    _lastStandLeechRatio:    { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    // 背水一战整局触发标记（每个人仅触发一次获得战士加成，之后永久保留）
    _lastStandTriggered:     { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    // 妹永久背水专属（modules/27elite-mingjiao-brother-laststand）：
    //   一次性触发 / 永久吸血率 / 本局永久禁飞天禁变卵
    _brotherLastStandTriggered: { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _brotherLastStandLeech:     { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _noFlyNoEgg:                { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    // 背水一战易伤乘率（默认 1 无易伤，触发后设为 1.2 即多受 20% 伤害）
    _lastStandTakenMul:      { type: STATE_FIELD_TYPES.NUMBER,  default: 1 },

    // 胖远桥：莽撞 / 正义国字脸 / 年轻气盛
    // _clumsyHit / _tauntFired 都是「仅本次攻击内有效」的标记，
    // 各自有明确复位点，登记在这里只为统一 clone 口径（回合级字段见 ROUND_STATE_SCHEMA）
    _clumsyHit:              { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _tauntFired:             { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _clumsyMult:             { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },

    // 灭绝师太：反击 / 跟随攻击 / 每第三次攻击 / 召唤周芷若
    // 出手次数含反击/跟随这类被动出手（原设计）；三击不落标记，两处按 _attackCount 现算
    _attackCount:            { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _summonedZhou:           { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    // 召唤周芷若待落位位置：阵亡当帧只记位置，下一个行动步（或下一回合兜底）才 spawn。
    //   跨回合兜底要靠它活过回合边界，所以必须是 battle 级字段（队伍数组每回合都重建，挂不住）
    _pendingZhouPos:         { type: STATE_FIELD_TYPES.NUMBER,  default: -1 },
    // 圣火不熄海克斯：每局首次己方非巨马阵亡时写在阵亡者本体上——'pending' 待复活 / 'used' 本局已复活。
    //   必须 battle 级（跨回合保留）：队伍数组每回合重建，挂数组过不了回合边界（同 _pendingZhouPos 理由）
    _holyFire:               { type: STATE_FIELD_TYPES.STRING,  default: null },
    // 小昭·妹专属复活名额：妹永久 holyFire 的独立名额，与团队 _holyFire 名额叠加、互不占用
    _holyFireSelf:           { type: STATE_FIELD_TYPES.STRING,  default: null },
    // 杨逍·点穴冷却：同一目标 cdRounds 回合内最多被点一次（回合开始递减，>0 即免疫本次点穴判定）
    _dianXueCd:              { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    // 杨逍·截脉（禁疗❌）：点穴命中同时挂上 rounds 回合，{ rounds: 剩余回合数, ratio: 治疗/吸血回复乘率 }。
    //   ratio 由 components 侧从 content 写入（单一数据源，core/13 不在热路径上查表）；
    //   只读不就地改——OBJECT 字段在 state 拷贝（copyBattleStateFields）里是浅拷贝，改内容会漏到 UI 镜像，递减时整对象换新
    _jinMai:                 { type: STATE_FIELD_TYPES.OBJECT,  default: null },
    // 不可闪避：仅一次攻击内有效，由 core/10 额外攻击循环置/清
    _ignoreDodge:            { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    // 被动出手伤害系数（反击×0.8/跟随×0.6）：仅一次攻击内有效，由 core/10 额外攻击循环置/清，
    //   伤害计算（core/12 calcFinalDamage）读它当 dmgMultiplier 初值；-1 = 无（哨兵，同 _pendingZhouPos 风格）
    _extraDmgRatio:          { type: STATE_FIELD_TYPES.NUMBER,  default: -1 },

    // 原顶层永久字段，迁入 state
    _baseAtk:                { type: STATE_FIELD_TYPES.NUMBER,  default: 0, scope: 'create' },
    _baseDef:                { type: STATE_FIELD_TYPES.NUMBER,  default: 0, scope: 'create' },
    _baseMaxHp:              { type: STATE_FIELD_TYPES.NUMBER,  default: 0, scope: 'create' },
    _initAtk:                { type: STATE_FIELD_TYPES.NUMBER,  default: 0, scope: 'create' },
    _initDef:                { type: STATE_FIELD_TYPES.NUMBER,  default: 0, scope: 'create' },
    _initMaxHp:              { type: STATE_FIELD_TYPES.NUMBER,  default: 0, scope: 'create' },
    _hpDmgRatio:             { type: STATE_FIELD_TYPES.NUMBER,  default: 0, scope: 'create' },
    _originalPos:            { type: STATE_FIELD_TYPES.NUMBER,  default: -1, scope: 'create' },

    // 机制标记（原顶层临时字段，迁入 state 统一 clone）
    _deathTime:              { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _tokenDropped:           { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _chestDropped:           { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _lastRole:               { type: STATE_FIELD_TYPES.STRING,  default: null },
    _neverMiss:              { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    // 行动过仍可闪避（韦一笑特权）：由组件声明，core 不再认 isWei
    _canAlwaysDodge:         { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    // 免疫斩杀（寒离飒常驻）：无法被战士斩杀或白骨爪斩杀带走，只能被普通伤害打死
    _immuneExecute:          { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _bloodthirstStriked:     { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _xingFenExtraAttacking:  { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _dodgeChance:            { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _pendingDeath:           { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    // 击杀者记账（uid 非引用）：core/13 致死出口写入，唐文亮「同归于尽」反噬击杀者用（modules/26 读）
    _killerUid:              { type: STATE_FIELD_TYPES.STRING,  default: null },
});

/** 保留旧导出名以兼容现有代码：合并 key 清单 */
export const ROUND_STATE_KEYS = Object.freeze(Object.keys(ROUND_STATE_SCHEMA));
export const BATTLE_STATE_KEYS = Object.freeze(Object.keys(BATTLE_STATE_SCHEMA));

// 默认值/数组深度拷贝逻辑全部走 STATE_FIELD_TYPES 类型分发，schema 是唯一事实源。

// 身份标记 isXiaoZhaoSister / isXiaoZhaoBrother 留在顶层（不属于战斗数值）。

/** 按 schema 初始化一个 state 对象 */
export function createInitialState() {
    // 数组和对象 default 需独立实例，避免多单位共享引用
    const state = {};
    for (const [key, spec] of Object.entries(ROUND_STATE_SCHEMA)) {
        state[key] = spec.default;
    }
    for (const [key, spec] of Object.entries(BATTLE_STATE_SCHEMA)) {
        state[key] = spec.type === STATE_FIELD_TYPES.ARRAY
            ? []
            : spec.type === STATE_FIELD_TYPES.OBJECT
                ? spec.default
                : spec.default;
    }
    return state;
}

/** 拷贝整场状态字段到目标 state；数组深拷贝、对象浅拷贝 */
export function copyBattleStateFields(srcState, dstState) {
    for (const [key, spec] of Object.entries(BATTLE_STATE_SCHEMA)) {
        if (spec.type === STATE_FIELD_TYPES.ARRAY) {
            dstState[key] = (srcState && srcState[key]) ? srcState[key].map(x => (typeof x === 'object' && x !== null ? { ...x } : x)) : [];
        } else if (spec.type === STATE_FIELD_TYPES.OBJECT) {
            dstState[key] = (srcState && srcState[key]) ? { ...srcState[key] } : null;
        } else if (srcState && srcState[key] !== undefined) {
            dstState[key] = srcState[key];
        }
    }
    return dstState;
}

// 创建期字段不再用手工名单区分：BATTLE_STATE_SCHEMA 里 scope:'create' 的即为创建期字段
//   （基础数值、落位锚、幼狮认主），其余整场字段一律「局内累计」，跨局复用时由
//   resetBattleTransientState 按 schema 的 scope 判定归零。加新创建期字段只需在 schema 里标 scope。
const BATTLE_STATE_CREATE_KEYS = Object.freeze(new Set(
    Object.entries(BATTLE_STATE_SCHEMA).filter(([, s]) => s.scope === 'create').map(([k]) => k)
));

/** 跨局复用单位时的整场字段清洗：保留创建期字段，局内累计字段全部归零（防上局状态漏进新局）。
 *  挂在「原班再战 / 随机重开」的恢复出口：快照里可能带着上一局的永久海克斯/回春层/精通等
 *  局内累计字段，不清洗会漏进新局（如妹带着上局巨马阵，第 1 回合蛛变就召拒马）。 */
export function resetBattleTransientState(unit) {
    if (!unit || !unit.state) return unit;
    for (const [key, spec] of Object.entries(BATTLE_STATE_SCHEMA)) {
        if (BATTLE_STATE_CREATE_KEYS.has(key)) continue;
        unit.state[key] = spec.default;
    }
    return unit;
}

/** 拷贝全量状态字段（回合级 + 整场）到目标 state */
export function copyAllStateFields(srcState, dstState) {
    for (const [key, spec] of Object.entries(ROUND_STATE_SCHEMA)) {
        if (srcState && srcState[key] !== undefined) dstState[key] = srcState[key];
        else dstState[key] = spec.default;
    }
    return copyBattleStateFields(srcState, dstState);
}

/** UI 镜像统一同步：全量 state 字段 */
export function syncStateToUI(srcState, srcUid, dstState) {
    copyAllStateFields(srcState, dstState);
    return dstState;
}

/** 回合级状态统一重置 */
export function resetStateFields(state) {
    for (const [key, spec] of Object.entries(ROUND_STATE_SCHEMA)) {
        state[key] = spec.default;
    }
    return state;
}