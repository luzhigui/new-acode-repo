// V3.8.0 | ~129000 bytes | 2026-10-17 第 98 轮：盲区闭环三契约（49→52）——unity / lastStand / twDash 长期裸奔
// V3.8.2 | 2026-10-17 第 98 轮补：scan-groups 扫地闭环两 hp 盲区（52→54）——hlsJiuYangHeal / hlsHanDuDot（寒离飒九阳/寒毒，均零数值改动）
// V3.8.5 | 2026-10-19 第 106 轮：闭环 hlsBurstDmg 盲区（56 契约）——轰拳真伤原无按机制 group（只落单位级
//   dmgDealt/dmgTaken，scan-groups 因无 group 看不见；第 105 轮闭环 hlsVamp 后人工复核同技能其他数值时发现）。
//   主代码 modules/27 V2.1.1 同处补 recordHpAudit(u,'hlsBurstDmg',-dmg)（纯记账）；契约读 hlsBurst.hits，
//   44 条声明/偏差 0。dir=-1 镜像 XUAN_MING_DOT；天上无敌挡血不计实际（免疫效应如实呈现，已留档）。
// V3.8.4 | 2026-10-19 第 105 轮：scan-groups 扫地闭环 hlsVamp 盲区（55 契约）——寒离飒蓄意轰拳·吸血
//   （modules/27 L266-269，vamp=总伤害1/3封顶缺失血；L268 ROUND_STAT_GRANT 声明 + L269 recordHpAudit 实际）。
//   声明侧读 SKILL_ANNOUNCE 的 hlsBurst 载荷（apexUid/vamp，回放桥同源）；23 条声明/偏差 0，未覆盖清零。
// V3.8.3 | 2026-10-18 第 99 轮修：NINE_YANG_HEAL 契约过期——引擎已迁通用 HEAL 通道（label='九阳神功回复'），契约仍读旧专用 FACT_TYPES.NINE_YANG_HEAL 致零触发假绿；改读通用 HEAL 事实
//         （scan-groups 差集 3 个 group 无契约盯）。主代码补 3 个纯记账数值声明 fact（UNITY_APPLY / LAST_STAND_APPLY
//         / TW_DASH_APPLY，renderFn:null 不进画面）+ infra/56 enum + infra/58 FACT_SPECS 登记（不渲染不抛错）；
//         unity/lastStand 为 op:mul 乘法词条走 mulSum 比对（与 HOLY_FLAME/SOUL_DRAIN 同款），twDash 为 op:add
//         永久词条走 sum 比对（与何太冲红血同款）。咬牙验证：把主代码 addMod value 翻倍 → 3 契约严格比对全命中 EXIT=1。
// V3.6.0 | ~126000 bytes | 2026-10-15 第 94 轮：新增 PANG_HIT_HEAL 胖远桥命中蓄力回血契约（45→46）——
//         scan-groups 扫地：主代码 a6ab497 蓄力改版（命中回血，走通用 HEAL 通道）后新盲区——
//         emit 处无记账、无契约。声明侧可观测（HEAL entry data.label==='蓄力回复' 带 data.heal，
//         core/10 只加 isHealEntry/healAmount/healUnitUid 不剥 data ⇒ 结构化读、不走文本解析）；
//         实际侧需转交：emit 处补 recordHpAudit(pang,'pangHitHeal',healed,'蓄力回复')（九阳先例
//         core/15 L248 同款）——未转交前账本空 ⇒ 零触发警告态（转交块见矩阵第 94 轮节）。
// V3.5.0 | ~126000 bytes | 2026-10-15 胖远桥出手蓄力「上限成长」改「命中回血」（老板拍板）——本对照器撤除 PANG_ATK_HP 契约（46→45）：
//         modules/26 的 addMod(maxHp, group 'pangAtkHp') 与 announce.maxHpDelta 已同步删除（蓄力改走通用 HEAL 声明，
//         回血飘字由 render/38 攻击组白名单出）⇒ 契约声明侧/实际侧两侧皆空，撤除。
// V3.3.1 | ~125000 bytes | 2026-10-15 第 91 轮：hp 记账类注释同步 recordHpAudit ——
//         XUAN_MING_DOT / BLOOD_THIRST_LEECH / HOT_BLOOD_HEAL / FLYER_REGEN / SPIDER_LAND_HEAL 等处的旧注
//         「依赖主代码待补 addMod(u,'hp',{...})」已被主代码 V7.6.19（2de9895）用 recordHpAudit 落地取代，
//         重校为 recordHpAudit(unit, group, value, source)。纯注释、零算法改动；读点仍走 _audit.hp，偏差 0 不变。
// V3.4.0 | ~127400 bytes | 2026-10-15 第 91 轮：新增 PANG_ATK_HP 胖远桥出手蓄力契约（45→46）——
//         scan-groups 扫地：group 'pangAtkHp' 41 条 maxHp（出手蓄力，modules/26pangyuanqiao L100）
//         无契约盯（主代码 81105a8 新机制）。声明侧现只有 note 文本 ⇒ 走数值载荷转交
//         （announce data 补 maxHpDelta，转交块见矩阵第 91 轮节；未转交前零触发警告态）。
// V3.3.0 | ~124400 bytes | 2026-10-15 第 90 轮：账本读点跟随主代码 hp 审计迁移（_mods → unit._audit.hp）——
//         主代码 V7.6.19（2de9895）把 hp 记账迁出 _mods（防污染真实属性容器）后，本对照器读点未同步
//         ⇒ 17 条 hp 类契约集体降级「警告态(账本空)」：声明一大把（热血奋战 462 条）、账本一条读不到。
//         snapLedger 的 hp 改读 _audit.hp 并与 _mods.hp 合并（防过渡期双写漏读；两条写入路径对象不同，
//         不会重复计数）；按引用差集语义不变（core/02 clone 显式浅拷 _audit、元素引用共享）。
//         复验：17 条 hp 契约全部回严格、偏差 0。另：第 88 轮 SPIDER_LAND_HEAL/SPIDER_EGG 转交已由
//         主代码侧 e2fb757 正式落地（严格 34/4 偏差 0）。
// V3.2.0 | ~119000 bytes | 2026-10-13 第 88 轮：新增 SPIDER_LAND_HEAL / SPIDER_EGG 两条小昭·妹契约（43→45）——
//         scan-groups 盲区清零：group 'spiderLandHeal' 37 条 hp（飞天落地回血，modules/20 spiderReturn）
//         + group 'spiderEgg' 4 条 atk/def（毒/反伤致死档结茧，modules/27 toSpiderEgg）——两者记账 addMod
//         均已在主代码（注释"供数值对照器"），缺的只是 fact 侧数值 ⇒ 均走载荷转交（applyStatChange 不产 fact、
//         note 文本非增量，纯 test-side 证死）：SPIDER_RETURN fact 补 landHeal；蜘蛛卵 announce 补
//         eggAtkDelta/eggDefDelta（转交块见矩阵第 88 轮节）。
//         SPIDER_EGG 用 dir=+1 + allowNeg（atk 归零为负、def 可升可降，真实符号逐字比对）。
//         验证闭环：临时转交 → 严格比对 37/4 偏差 0 → 咬牙 addMod 值 ×2 双双命中（37 处 / 2 处 EXIT=1）→
//         咬牙回滚后补丁态全红线绿。转交净版曾被并行会话 f2b4aed 全量提交扫入 HEAD；2026-10-14 用户立规
//         「主代码不经我手落地」后授权改回（a8c1dda，两文件恢复 8630c51 打补丁前状态）；**后由主代码侧
//         e2fb757 正式落地**（与转交块一字不差）⇒ 两契约严格态（实测 34/4 偏差 0）。
// V3.1.1 | ~115300 bytes | 2026-10-13 第 85 轮：新增 HE_TAICHONG_RED 何太冲红血·职业加成契约（42→43）——
//         scan-groups 盲区扫地续：group 'heTaichongRed' 48 条 atk/def/maxHp 词条（两仪互换/单人红血）无契约盯。
//         fact 侧读 SKILL_ANNOUNCE（skillName '两仪互换'/'红血'）的 data.grants 数值载荷（主代码转交补，
//         转交块见矩阵第 85 轮节；未转交前零触发警告态）。emitStateChange(ROLE_CHANGED) 不产 fact
//         （infra/59 只发 eventBus 信号）⇒ 纯 test-side 路线证死，同 weiHeal.maxHpDelta/pangDefGain 先例走载荷转交。
//         验证闭环：临时转交 → 严格比对 32/32 偏差 0（48 账本词条扣 16 个 0 值 stat）→ 咬牙引擎 atk×2
//         命中 16 处 EXIT=1 → 回滚干净。补丁态全红线绿（rules-replay 0 fail / static-scan 0 / smoke 过 / 变异 44/44）。
// V3.1.0 | ~111900 bytes | 2026-10-13 第 84 轮（续）：新增 QIAN_KUN_ATK / QIAN_KUN_HEAL 两条乾坤衍生契约——
//         QIAN_KUN_ATK（group 'qianKunDerived'，atk，dir=+1，读 factData.atkGain/atkTargetUid）：--scan-groups
//         盲区扫描挖出该 group 268 条 atk 词条无契约盯；addMod 与 fact 同 handler 同值 ⇒ **零主代码依赖，落地即严格态**
//         （249 条偏差 0；咬牙 atkGain×2 命中 236 EXIT=1）。QIAN_KUN_HEAL（group 'qianKunHeal'，hp，dir=+1，读
//         data.heal/healTargetUid）：治疗走 applyStatChange 即时 hp，需主代码补记账（转交见矩阵第 84 轮节，警告态 268 条；
//         临时记账严格 248 偏差 0、咬牙 ×2 命中 248 EXIT=1）。溅射两条（V3.0.9）已随并行会话 ac34b34 入库。
// V3.0.9 | 2026-10-13 第 84 轮：新增 METEOR_SHOWER_SPLASH / WIND_ASSAULT_SPLASH 两条溅射伤害契约（dir=-1，
//         group='meteorSplash'/'windSplash'，读 factData.splashDmg，targets 逐目标 uid 归因）——core/16 SPLASH
//         handler 是两条契约共用的唯一落地口，主代码记账一行同时激活两者（转交见矩阵第 84 轮节，补前警告态）；
//         溅射减防部分不在本条范围（已由 STAT_CHANGE 契约经 group 'statChange' 覆盖）
// V3.0.8 | ~106300 bytes | 2026-10-13 警告态显式化：声明>0 但严格比对 0 条时打 ⚠ 点名（账本空跳过≠比对通过，防"偏差 0"被误读）；
//          同批主代码补 3 条 hp 记账（core/12 weiDodgeHeal + core/16 horseRebound/fortifyRebound），三契约警告态→严格态
// V3.0.7 | ~107000 bytes | 2026-10-12 第 81 轮：新增 SPIDER_STRIKE / CLAW_HIT / KUAI_LE_HEAL / CLAW_HEAL 四条 HP 类契约——
//          SPIDER_STRIKE（小昭蛛袭，dir=-1，group='spiderStrike'，读 data.totalDmg；主代码 modules/20 记账待补，警告态 41 条）；
//          CLAW_HIT（九阴白骨爪，dir=-1，group='clawHit'，读回填后 data.dmg；记账在 core/16 CLAW_CHAIN handler 应用点）；
//          KUAI_LE_HEAL（快乐回血，dir=+1，group='kuaiLeHeal'）/ CLAW_HEAL（爪击回血，dir=+1，group='clawHeal'，uid-only 归因）。
//          后三者主代码记账已随 8544c03 全量提交进 HEAD ⇒ 激活态（71/80/27 · 偏差 0）；四条均咬牙验证通过（翻倍记账即命中）。
// V3.0.6 | ~98800 bytes | 2026-10-12 第 80 轮：新增 BLOOD_THIRST_LEECH / HOT_BLOOD_HEAL / FLYER_REGEN 三条即时治疗类契约
//          （dir=+1；group='bloodthirstLeech'/'hotBloodHeal'/'flyerRegen'）——主代码记账已落地（core/04 V6.3.6）：三契约转严格态（60 场 168/394/531 · 偏差 0）。
// V3.0.5 | ~88200 bytes | 2026-10-12 第 77 轮：新增 PHANTOM_DISGUISE_HEAL 契约（成昆·幻影伪装治疗，dir=+1，group='phantomDisguiseHeal'）——
//          成昆只在 stage 6 出场，STAGES 扩 [1-6]；主代码记账条目待用户补（当前警告态）。
//          【第 76 轮】新增 NINE_YANG_HEAL 契约（治疗类 dir=+1，group='nineYangHeal'）——用户已应用并提交（core/15 V6.6.0），激活态严格比对 369/偏差 0；
//          另发现主代码 unit.hp 浮点根因（core/15 L278 Math.min 浮点项），契约因同源精确相等仍稳健，建议主代码独立排查 hp 取整。
//          【第 74/71 轮】BREAK_DEF 契约 extract 加 factType 显式校验，修形状碰撞假偏差——
//          小昭·姊「乾坤衍生」QIAN_KUN_DERIVED（modules/27 L303/354：data.reduce 是减伤值、无 attackerName）被
//          `typeof data.reduce === 'number'` 形状判据吞成破防声明（seed=18 stage=2 r13 声明 10 = 破防 2+2 + 乾坤 3+3，
//          账本 breakDef 仅 -4 ⇒ 干净树假偏差 1，即第 71 轮遗留项）。修后 40 局：声明 581 条 · 严格比对 544 条 / 偏差 0；
//          BREAK_DEF 随之出保守名单升严格判据（复核证伪「跨步错位」旧归因）。
// V3.0.1 | ~80200 bytes | 2026-10-11 SOUL_DRAIN 契约由警告态转严格（主代码 4 处补发 fact：core/04 V6.2.9 / core/11 V6.3.7 /
//          infra/56 V1.4.4 / infra/58 V1.5.7）：声明 827 条 · 严格比对 799 条 / 偏差 0，全程 EXIT=0。
// V3.0.0 | ~79800 bytes | 2026-10-09 账本对照补第 23 条契约 ENDLESS_BREATH_COST（生生不息「付费触发」扣攻：modules/26 L160
//          addMod group 'endlessBreathCost' value -atkCost ↔ ENDLESS_BREATH fact data.cost；factType 守卫 + cost>0 排除免费/fail 形态）。
//          scan-groups 由 22/23 → 23/23 零盲区（endlessBreathCost 曾是唯一账本出现却未绑契约的 group）。
//          干净树 133 条声明严格比对偏差 0；牙齿测试（L160 实际扣攻翻倍、fact 不动）检出 69/69 重复应用 exit1，证明有牙。
// V2.9.0 | ~77400 bytes | 2026-10-08 零触发守卫分两级，修固定样本对稀有形态的假红（BAGUA_DEF 默认 40 场零声明却 exit1，
//          但它与加攻共用 group baguaArray、120 场有 59 条声明，契约没坏，只是加防形态在小样本不触发）：默认模式也记录账本
//          group，契约零声明时——绑定 group 账本未出现=真空转仍硬红（保住 CARRY_APPLY 那类牙），group 已出现仅形态未触发=警告不红。
// V2.8.0 | ~75600 bytes | 2026-10-06 镜像主代码 carry 候选过滤：tickAndPickBuffs 直接 import
//          modules/28buff-tools.js 的 hasCarryTarget，候选里加「carry 位全空则剔除 carry」判据
//          （5 号位；小昭·姊在场放宽 4/5/6）。与 player/49、ui/61、ui/70 及 140/rules-replay 同口径。
// V2.7.0 | 2026-10-02 第 54 轮（覆盖率收官）：主代码 47b4d05 已为 aura/holyFlame/weiDodgeLeech 补发数值声明 fact，本轮补最后两条契约 —— AURA（读 AURA_APPLY 的 emptyCol/bloodAura，0 值不声明避假报；round 续期口径第 53 轮已修，走严格判据）/ HOLY_FLAME（圣火令是**乘法** op:'mul'，fact 声明的是乘率 ratio 而非加法增量，故 groupDelta 新增 mulSum 累加 + 契约 mul:true 让主循环改取 mulSum 比对，避免乘区 sum 恒 0 全判少加）。覆盖率 20/22 → **22/22，零盲区**。
// 方法论首立于 2026-09-27 第 34 轮 | 「数值声明 vs 实际属性增量」逐步对照器（通用）
//
// 立它的原因（第 33 轮的教训，务必先读）：
//   用户实报的「破防双扣」（core/03 直改 + core/16 裁定各一次，日志写 -4 实际 -8）体检全程查不出。
//   根因是**规则只校验日志文本的声明值，从不核对实际状态**——声明本身合法（4∈{2,3,4}）就恒绿。
//   第 33 轮先试过两条文本判据，全都失败并已撤回：
//     ① 跨攻击的波动行 defBase 差值 → 已修复代码上误报 27 场（两次破防间夹增益到期等非破防变动，无法归因）；
//     ② 组内「首行 displayDef vs 波动 defBase」→ displayDef 是渲染时 getStat（render/34 L87），是攻击后值。
//   → 结论：这类洞只能拿**逐步真实状态**填，文本侧补不出可靠判据。
//
// 统一判据（两条契约共用一把尺子）：
//   逐步快照每个单位的真实属性（core/13 getStat，与引擎同源），与同一步发出的数值声明逐条比对。
//   **实际增量 > 声明值 ⇒ 该效果被重复应用**；且只在"增量恰为声明值的整数倍（≥2 倍）"时才报，
//   非整数倍说明同一步还夹了其他来源（坚盾/成长/穿透…），不归因、跳过 —— 宁可漏报不可误报。
//   依据：core/13 L288-293 `addMod` 只做 `_mods[stat].push(mod)`、**不去重不覆盖**，
//   而 getStat 把该 stat 全部 mod 的 value 累加 ⇒ 同一 stat 被应用两次，属性必然翻倍。
//
// 覆盖契约（新增机制＝往 CONTRACTS 加一条，不改主体）：
//   1. BREAK_DEF  破防：目标 def 应下降 reduce（core/16 L76-81 裁定器 addMod permanent）
//   2. CARRY_APPLY carry：单位 atk/def/maxHp 应上升声明值（core/04 L37-42，ttl:'round'）
//   3. BUTTERFLY  蝶变附身：host 的 atk/def/maxHp 应上升 atkTransfer/defTransfer/hpTransfer
//                        （modules/27elite-mingjiao.js L292-294 addMod + L309-321 BUTTERFLY_ATTACH fact 带三项 transfer）
//   4. ENDLESS_BREATH 生生不息：张三丰 回血转永久攻防，自身那笔 atkGain→atk / defGain→def
//                        （modules/26elite-sixsects.js L91-92 addMod + L116-130 ENDLESS_BREATH fact 带 atkGain/defGain）
//   5. XING_FEN_COST  性奋代价：宋青书 maxHp 应下降 penalty（modules/26elite-sixsects.js L634 addMod + L636 XING_FEN_COST fact 带 penalty）
//                        —— 4/5 两条是第 40 轮后发现的：对应 fact 早已携带数值，只是缺契约 → 零主代码改动即可补牙。
//   ✗ 第 42 轮曾用**净增量**模型试过这条并撤回（不加守卫误报 16 处、加守卫零覆盖，两条路都死）——
//     根因是流星成长(atk)与本机制同一步必然同作用于同一单位 atk，净增量分不清份额。
//   ✓ 第 45 轮用**账本模式**重开并成功：直接读 group='meteorSplashGrowth' 的词条增量取该机制自身贡献，
//     不再受远程成长(+2) 干扰（见下方「账本模式」整段）。对应契约 METEOR_GROWTH 已落盘，干净树 0 命中。
//     → 原以为「必须改主代码 Tier2」的判断被**推翻**：引擎 _mods 账本本就按 group 记了贡献，体检侧读即可，零主代码改动。
//   6. BAGUA_ATK / BAGUA_DEF 八卦阵（第 47 轮，依赖主代码批 1 补发 BAGUA_ARRAY fact）：
//      一次触发同时动 atk(减) 与 def(加)，而 dir 是**契约级**的 ⇒ 符号相反必须拆两条；
//      BAGUA_ATK 用 dir:-1 且声明量取 `Math.abs(atkDelta)`（判据要求 sum>0，负值会被跳过）。
//   7. RAGE_ON_HIT 莽撞：主路径(AFTER_DAMAGE_APPLIED) 与溅射路径(SPLASH_DAMAGED) **各发一条同形 fact**，
//      同一步两条合法（主目标+溅射都算挨打）⇒ 聚合比对。
//   8. LION_INSPIRE 雄狮振奋：**一条 fact 覆盖多人** ⇒ 展开 `data.targets`（该 fact 无顶层 unitName）。
//   9. KU_LIAN 苦练：**一条 fact 覆盖多人** ⇒ 展开 `data.targets`（逐人已乘 mult）。
//      ★ 不可走顶层 `atkBonus/defBonus/hpBonus`——那是未乘 mult 的基础值，本人 ×2 那份会被判成翻倍（干净树假阳性）。
//   → 6-9 四条使 A6/A9/A10/A14 由 🟡/🔴 转 🟢；另新增 T7 验证「虚报校验」扩到新 group 后确有牙。
//
// 第 39 轮教训（重要，关乎净增量模型的边界）：本想连同「坚盾 FORTIFY」一起加牙（其 FORTIFY_SHIELD fact 也带 increment），
//   但实测在干净树**误报 39 处**（如「坚盾 何太冲.def 声明+1 实际+2」）。根因：本对照器用「逐步净属性增量 vs 声明」模型，
//   它**暗中假设该机制是某属性增量的唯一来源**。def 这个属性有多处来源（坚盾 / 正义国字脸 / 八卦阵 / 苦练…），
//   同一步里「坚盾+1 再叠别的+1」会被误判成「坚盾翻倍」——无法区分真翻倍与并发多来源。
//   → 故直接用净增量模型**无法安全加牙**。同理，任何「属性有多来源」的机制
//     （苦练/八卦阵加 def、振奋/苦练加 atk…）都需要隔离该机制自身贡献才能加牙。
//   BUTTERFLY 之所以能留（第 39 轮）：host 的 atk/def/maxHp 在固定种子里未被其他同量来源并发污染（实测 dup=0）。
//   第 41 轮新发现（比 seed=6/stage5 更隐蔽）：BREAK_DEF 在 seed=18+stage2 对**张三丰**误报「破防翻倍」。
//     根因：张三丰同时带两个 严阵以待 乘法 mod（op:'mul' value:0.5）——引擎 def = 加和 × 乘积。
//     同一步里一个乘法 mod 到期/切换使净 def 掉 8，但破防本身只 1 条 breakDef mod（-4）→ 净增量模型把「-4 + 乘数变化」算成 8 误判翻倍。
//     → 净增量模型对「加和+乘法」**多效应属性**同样脆弱（不止加法多来源）。
//   ✓ 第 45 轮用**账本模式**一次性解决上述两类脆弱性：直接读 group 账簿取该机制自身贡献，
//     多来源/乘法词条全被隔离在其它 group 里，不再污染本契约。FORTIFY 据此重开（契约已落盘，干净树 0 命中）；
//     BREAK_DEF 在 seed=18:2 的张三丰碰撞点也自然消失（EXCLUDE 护栏已撤）。
//   ★ 推论：此前以为「坚盾/八卦阵/苦练/莽撞/韦一笑/雄狮/幼狮」必须改主代码 Tier2 才能加牙——**错了**。
//     它们各自的 group 早已在 _mods 账本里，只需给每个补一条「绑定 group」的契约即可在体检侧加牙，零主代码改动。
//     第 45 轮已补 METEOR_GROWTH/FORTIFY；第 47 轮（主代码批 1-3 补发 fact 后）再补 八卦阵/莽撞/雄狮振奋/苦练 四条，
//     均已在变异树实测有牙（A6 210 / A9 43 / A10 63 / A14 385 处命中）。
//     韦一笑(WEI_LEECH) 旧 fact 发的是 heal+newMaxHp 绝对值，增量比对曾无法做（由基线兜底）。
//   2026-10-02 审核线更新：commit 12a5808 已给 WEI_LEECH/SPIDER_TRANSFORM/LION_GROW 补发增量字段，
//     其中 LION_GROW（带 unitUid + atkDelta/defDelta/maxHpDelta）已补契约（第 16 条），
//     主循环同步支持 uid 精确归因（成形当步改名 + 多只同名场景），A15 变异由「仅基线兜底」升格为「对照器兜住」。
//   第 52 轮：同模式再补 SPIDER_TRANSFORM（第 17 条）/ LEECH_MAXHP（第 18 条，顶层 WEI_LEECH fact）/ WEI_HEAL（第 19 条，
//     DODGE fact 嵌套的 weiHeal；主代码 12a5808 对 weiLeech 组只补 maxHpDelta 字段、未补 factType，仍无法独立顶层观测，已记入需求四）。
//
// 运行：node tests/stat-decl-vs-actual-check.mjs            → 全量 18 场；有重复应用退出码 1；契约零触发亦退出码 1（防假绿）
//       node tests/stat-decl-vs-actual-check.mjs 18:3       → 只跑指定场次并打印逐步明细
//       node tests/stat-decl-vs-actual-check.mjs --fingerprint
//           → 不跑契约、也不退码 1，只逐步对全体单位的 atk/def/maxHp/hp 做 FNV-1a 指纹并输出 `FINGERPRINT <hex>`。
//             供 `tests/mutation-teeth.mjs` 判定「属性类变异是否真的改变了战斗状态」（属性变了指纹必变；
//             日志/TEXT 类变异只改显示、不改状态，指纹不变）。
export const VER = 'tests/stat-decl-vs-actual-check.mjs V3.8.5';

import { fileURLToPath } from 'node:url';

// 环境 mock（不改引擎源码，Node 补浏览器能力）—— 必须在任何引擎 import 之前
globalThis.fetch = async (url) => {
    const path = fileURLToPath(new URL(url));
    const fs = await import('node:fs');
    const text = fs.readFileSync(path, 'utf8');
    return { ok: true, json: async () => JSON.parse(text) };
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.self = globalThis;

// 含 18：148 报的 carry 重复应用发生在 seed=18 stage=3，纳入默认集才能实证（首版用 baseline 的 6 种子，漏了它）
// 第 40 轮扩展（覆盖缺口闭合）：
//   · STAGES 加 2（张三丰敌，stage 2 专属 → 让 A7 生生不息 / A9 八卦阵 真正触发）
//   · STAGES 加 4（宋青书+周芷若敌，stage 4 专属 → A12 性奋代价需周芷若在场才触发）
//   · SEEDS 加 37/50/67（第 40 轮 seed 搜索证实 A5 流星溅射成长在 stage 1/3 稳定触发，原 7 种子都没撞上）
//   —— 刻意不用 seed=6 / 不用 stage 5：seed=6 stage=5 会让 BREAK_DEF 契约误报
//      （同一步 鹿杖客 被破防-2 又吃流星赶月主降防-2，净降 4 被净增量模型误判成破防翻倍）。
//      这是净增量模型对「def 多来源」的固有脆弱性（与第 39 轮 FORTIFY 同源），扩展覆盖时必须绕开此类巧合。
//   —— 扩展后，原 5 处「未观测到影响」覆盖缺口中 4 处（A5/A7/A9/A12）转为真实牙口判定；
//      A13 小昭·妹永久carry 需 bro 拿到永久 carry 海克斯且队伍无 carry buff（稀有条件），单独搜索仍零触发 → 记结构性稀有条件。
const SEEDS = [1, 18, 37, 42, 50, 67, 999, 12345, 777, 88888];
const STAGES = [1, 2, 3, 4, 5, 6]; // 第 74 轮加 5：stage 5 含鹿杖客/玄冥中毒（XUAN_MING_DOT 契约专属形态）；第 77 轮加 6：stage 6 含成昆·幻影伪装（PHANTOM_DISGUISE_HEAL 契约专属形态）

// dir: +1=声明使该属性上升，-1=声明使该属性下降
// 第 47 轮：以下 group 的 fact 与 addMod 在**同一 handler、用同一变量/同一值**发射，无跨步错位
//   （与 carry(ttl:'round') 不同；BREAK_DEF 同类疑虑经第 72 轮复核已证伪——544 条比对偏差 0，见下方名单说明）
//   ⇒ 干净树必 sum===actual，故可安全开「声明 > 实际」的虚报（少加/多报）校验。
//   新增机制前先确认它满足「同 handler 同值同 step」，否则只保留整数倍（超应用）判据。
const SAME_STEP_GROUPS = new Set(['fortify', 'baguaArray', 'rageOnHit', 'lionInspire', 'kuLian',
    'rangedGrowth', 'zhangSwitch', 'spiderMastery']);

// 第 49 轮：最初这两条契约列保守判据；第 72 轮复核后 **BREAK_DEF 已出列升严格**，名单只剩 RIGHTEOUS_FACE。
//   历史实测依据（40 局干净树偏差扫描，见下方 checked/mismatch 列）：
//     BREAK_DEF    第 49 轮严格比对 548 条 → 偏差 7（fact 嵌攻击 entries、mod 在不同子步，当时判为跨步错位）；
//                  第 72 轮复查：干净树仅存 1 条偏差，且定位为乾坤衍生形状碰撞假阳（extract 已加 factType 守卫）——
//                  修后 40 局严格比对 544 条 / 偏差 0，与其余契约同待遇 ⇒ 按「默认严格」规则出列。
//     CARRY_APPLY  严格比对 267 条 → 偏差 0   （第 53 轮修 ttl:'round' 续期口径后归零；原 198 偏差是跨步时序假阳性，非数值 bug）
//   → 名单规则：默认严格；干净树出现假阳性把它加进来即可。
// 保守判据名单：fact 与 mod 跨步错位（fact 嵌攻击 entries / 不同子步生效），同一步 ledger 比对必然错位
//   ⇒ 只抓整数倍超应用（翻倍），零误报。现仅 RIGHTEOUS_FACE（正义国字脸，def 加在嘲讽设置步、fact 在攻击步）。
const LOOSE_IDS = new Set(['RIGHTEOUS_FACE']);

// 2026-10-02 审核线：factType 守卫。早期契约刻意「不导入枚举、靠字段形状签名」，
//   但 commit 12a5808 给 SPIDER_TRANSFORM 补了 unitUid+atkDelta/defDelta/maxHpDelta 后，
//   形状与 LION_GROW 撞车（且顶层带 unitName+两 delta，连 BAGUA_DEF 也被误吃）→ 干净树 59 处假红。
//   教训：字段形状签名会随主代码补字段静默碰撞，凡能拿到 factType 的契约一律显式校验。
//   枚举在 main() 内动态 import（环境 mock 必须先于引擎 import），故顶层先声明、main 里赋值；extract 调用时必已就绪。
let FACT_TYPES = null;

const CONTRACTS = [
    {
        id: 'BREAK_DEF',
        label: '破防',
        group: 'breakDef',
        dir: -1,
        // 声明挂法（core/12 L503-505 → L549）：attackFact.data.entries 里 { factType, data:{targetName, reduce} }
        extract(stepLog) {
            const out = [];
            const scan = (e) => {
                // 第 72 轮：加 factType 显式校验——形状启发式（typeof data.reduce === 'number' + targetName）会被
                //   小昭·姊「乾坤衍生」QIAN_KUN_DERIVED 静默碰撞（modules/27 L303/354：data.reduce 是**减伤**值、
                //   无 attackerName），冒充破防声明。实证：seed=18 stage=2 r13 声明 10(4条)=破防 2+2 + 乾坤衍生 3+3，
                //   而账本 breakDef 仅 [-2,-2]=4 ⇒ 干净树假偏差 1（第 71 轮遗留，第 72 轮定位）。
                //   与 WEI_LEECH（L615）同式：凡能拿到 factType 的契约一律显式校验（教训见 L135）——
                //   无 factType 保留形状兜底，防未来裸推的破防条目被静默漏计。
                if (!e) return;
                // 第 97 轮（2026-10-17）：免疫分支文本通道——必须放在 data 门禁**之前**：
                //   core/10 V7.6.50（并行会话 99dee79 修 player/46 崩溃）把免疫分支的破防条目从裸
                //   {factType,data} 改成 {type:'detail', text:'🗡️ A 破防：T 防御 -N'}——**无 data 字段**，
                //   会被下面的 `!e.data` 门禁提前挡死（首版就是栽在这：分支写在门禁后，DETAIL-SCAN 零触发）。
                if (e.type === 'detail' && typeof e.text === 'string' && e.text.indexOf('破防：') !== -1) {
                    const tm = e.text.match(/破防：(.+?) 防御 -(\d+)/);
                    if (tm) out.push({ unit: tm[1], stat: 'def', amount: Number(tm[2]) });
                }
                if (!e.data) return;
                if (e.factType && e.factType !== FACT_TYPES.BREAK_DEF) return;
                if (typeof e.data.reduce === 'number' && e.data.targetName) {
                    out.push({ unit: e.data.targetName, stat: 'def', amount: e.data.reduce });
                }
            };
            for (const f of stepLog || []) {
                if (!f) continue;
                scan(f);
                if (f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        id: 'CARRY_APPLY',
        label: 'carry',
        group: 'carry',
        dir: +1,
        // 与破防不同：carry 每单位每回合**至多应用一次**（core/04 L37 门控 + ttl:'round'）。
        //   同一步出现 2 条声明即重复应用；而破防同一步多条是合法的（连击/性奋额外攻击两次破防）。
        //   故本契约定 expectSingle —— 聚合比对会把"两条声明 + 属性也真叠加两份"判成正常（首版就栽在这里）。
        expectSingle: true,
        // 声明（core/04 L42）：顶层 fact { factType: CARRY_APPLY, data:{ unitName, atk, def, hp } }
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data) continue;
                const d = f.data;
                if (typeof d.unitName === 'string' && typeof d.atk === 'number'
                    && typeof d.def === 'number' && typeof d.hp === 'number') {
                    out.push({ unit: d.unitName, stat: 'atk', amount: d.atk });
                    out.push({ unit: d.unitName, stat: 'def', amount: d.def });
                    out.push({ unit: d.unitName, stat: 'maxHp', amount: d.hp });
                }
            }
            return out;
        }
    },
    {
        id: 'BUTTERFLY',
        label: '蝶变附身',
        group: 'butterfly',
        dir: +1,
        // 声明（modules/27elite-mingjiao.js L309-321）：BUTTERFLY_ATTACH fact，
        //   data.{ hostName, atkTransfer, defTransfer, hpTransfer }；L292-294 把这三项分别加给 host 的 atk/def/maxHp。
        //   干净树：host 实际增量恰等于三项 transfer ⇒ 恒真。A8 变异（三项 *2）⇒ 实际=2×声明 ⇒ 命中。
        //   第 38 轮 A8 指纹变但三侧无反应，根因就是对照器缺这条契约——fact 本就带数值，补契约即兜住。
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data) continue;
                const d = f.data;
                if (typeof d.hostName === 'string' && typeof d.atkTransfer === 'number'
                    && typeof d.defTransfer === 'number' && typeof d.hpTransfer === 'number') {
                    out.push({ unit: d.hostName, stat: 'atk', amount: d.atkTransfer });
                    out.push({ unit: d.hostName, stat: 'def', amount: d.defTransfer });
                    out.push({ unit: d.hostName, stat: 'maxHp', amount: d.hpTransfer });
                }
            }
            return out;
        }
    },
    {
        id: 'ENDLESS_BREATH',
        label: '生生不息',
        group: 'endlessBreath',
        dir: +1,
        // 声明（modules/26elite-sixsects.js L116-130）：FACT_TYPES.ENDLESS_BREATH fact，
        //   data.{ unitName, atkGain, defGain }（回血转永久攻防的自身那笔，二选一方向）。
        //   L91-92 把 selfAtkGain/defGain 用 addMod 实际加到 unit 的 atk/def（group:'endlessBreath'）。
        //   干净树：实际增量恰等于 atkGain/defGain ⇒ 恒真。A7 变异（defGain*2）⇒ 实际=2×声明 ⇒ 命中。
        //   净增量安全：回合开始/轮到自己触发时，该步只有生生不息改此单位 atk/def（heal 只动 hp）；
        //     被攻击触发的八卦阵步虽同改 atk/def，但此时实际=生生不息+八卦阵、非声明整数倍 ⇒ 不误报（保守跳过）。
        //   第 40 轮发现该 fact 早已携带数值，只是缺这条契约 → 零主代码改动即可补牙（详见迭代日志第 40 轮后需求精化）。
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data) continue;
                const d = f.data;
                // 字段签名唯一锁定 ENDLESS_BREATH（unitName + 数值型 atkGain/defGain + heal 字段），不依赖枚举导入
                if (typeof d.unitName === 'string' && typeof d.atkGain === 'number'
                    && typeof d.defGain === 'number' && typeof d.heal === 'number') {
                    if (d.atkGain > 0) out.push({ unit: d.unitName, stat: 'atk', amount: d.atkGain });
                    if (d.defGain > 0) out.push({ unit: d.unitName, stat: 'def', amount: d.defGain });
                }
            }
            return out;
        }
    },
    {
        id: 'ENDLESS_BREATH_COST',
        label: '生生不息·付费消耗',
        group: 'endlessBreathCost',
        dir: -1,
        // 声明（modules/26elite-sixsects.js L160-161）：张三丰轮到自己行动且 atk≥atkCost 时「付费触发」——
        //   addMod(actor,'atk',{value:-s.atkCost, ttl:'permanent', group:'endlessBreathCost'})，
        //   随后 triggerEndlessBreath(actor, log, s.atkCost) 发 ENDLESS_BREATH fact，data.cost=atkCost(3)。
        //   干净树：该步 endlessBreathCost 组仅此一笔、atk 净减恰 == cost ⇒ 恒真；把 -atkCost 翻倍变异 ⇒ 实际=2×cost 命中。
        // factType 守卫 + 只认 data.cost>0：回合开始「免费」那次 data 无 cost（undefined 排除）；
        //   攻不足 fail fact 带的是 atkCost 字段（L157，不是 cost），天然排除。
        // 与增益契约 ENDLESS_BREATH 同 factType、读不同字段（那条读 atkGain/defGain→group endlessBreath；本条读 cost→endlessBreathCost）。
        // 八卦阵被打扣攻走 group baguaArray + BAGUA_ARRAY fact（见 BAGUA_ATK），不在此列。
        // permanent 词条无 round 续期问题；同一步生生不息的「加攻」走 endlessBreath 组，账本按 group 隔离互不污染。
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data || f.factType !== FACT_TYPES.ENDLESS_BREATH) continue;
                const d = f.data;
                if (typeof d.unitName === 'string' && typeof d.cost === 'number' && d.cost > 0) {
                    out.push({ unit: d.unitName, uid: d.unitUid || null, stat: 'atk', amount: d.cost });
                }
            }
            return out;
        }
    },
    {
        id: 'XING_FEN_COST',
        label: '性奋代价',
        group: 'xingFenCost',
        dir: -1,
        // 声明（modules/26elite-sixsects.js L632-636）：addMod(unit,'maxHp',{source:'性奋代价',value:-penalty,...})
        //   同处 fact XING_FEN_COST 带 {unitName, oldMaxHp, newMaxHp: floor(maxHp), penalty}。
        //   penalty = 实际扣减量（正数）；干净树 实际 maxHp 降 == penalty ⇒ 恒真。
        //   A12 变异（penalty*2）⇒ 实际降 2×penalty ⇒ 命中。
        //   净增量安全：该步 maxHp 只此一处变（新婚扣血只动 hp，不动 maxHp）。
        //   第 40 轮发现该 fact 早已携带 penalty，只是缺这条契约 → 零主代码改动即可补牙。
        //   注意：对照器只报「实际是声明整数倍≥2」，故 A12 变异必须是「翻倍」而非「归零」，否则 actual=0 < 声明不报（已在 mutation-teeth 改 A12 为翻倍）。
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data) continue;
                const d = f.data;
                if (typeof d.unitName === 'string' && typeof d.penalty === 'number'
                    && typeof d.newMaxHp === 'number' && typeof d.oldMaxHp === 'number') {
                    out.push({ unit: d.unitName, stat: 'maxHp', amount: d.penalty });
                }
            }
            return out;
        }
    },
    {
        // 第 42 轮曾用**净增量**模型试过这条并撤回（不加守卫误报 16 处、加守卫零覆盖，两条路都死）。
        //   第 45 轮用**账本**模式重开：直接读 group='meteorSplashGrowth' 的词条增量，
        //   不再受「同一步远程成长(+2) 也在加 atk」的干扰 —— 那正是当年 16 处误报的根因。
        id: 'METEOR_GROWTH',
        label: '流星溅射成长',
        group: 'meteorSplashGrowth',
        dir: +1,
        // 声明（core/16effect-handlers.js L175，V6.0.3 起补发）：
        //   { factType: METEOR_SPLASH_GROWTH, data: { unitName, growth } }
        //   growth = 溅射存活命中人数 × atkPerSplash(2)
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data) continue;
                const d = f.data;
                // ⚠️ 第 48 轮加固：远程成长 fact 形状同为 `{ unitName, growth }`（只多一个 newAtk），
                //   两者极易互撞。当前本契约只扫顶层、而远程成长嵌在 group.data.entries 里，故暂不相撞；
                //   但一旦主代码改挂载层级就会**静默互撞**（声明量被另一机制顶替），故显式排除 newAtk。
                if (typeof d.unitName === 'string' && typeof d.growth === 'number'
                    && typeof d.newAtk !== 'number' && !d.splashDmg && !d.penalty) {
                    out.push({ unit: d.unitName, stat: 'atk', amount: d.growth });
                }
            }
            return out;
        }
    },
    {
        // 第 39 轮曾用净增量模型试过并撤回（干净树误报 39 处：「坚盾 何太冲.def 声明+1 实际+2」）——
        //   根因是 def 有多个来源（坚盾/正义国字脸/八卦阵/苦练…），净增量分不清哪份是坚盾的。
        //   第 45 轮用账本模式重开：直接读 group='fortify' 的词条增量，多来源不再互相污染。
        id: 'FORTIFY',
        label: '坚盾',
        group: 'fortify',
        dir: +1,
        // 声明（core/03battle-utils.js L239）：FORTIFY_SHIELD fact
        //   data: { unitName, label, increment, current: fortifyThisRound + increment, cap }
        //   注意：防守路径（L252）把 fact 塞进攻击组的 group.data.entries（嵌套一层），须递归扫描。
        extract(stepLog) {
            const out = [];
            const scan = (e) => {
                if (e && e.data && typeof e.data.unitName === 'string'
                    && typeof e.data.increment === 'number' && typeof e.data.cap === 'number'
                    && typeof e.data.current === 'number' && e.data.increment > 0) {
                    out.push({ unit: e.data.unitName, stat: 'def', amount: e.data.increment });
                }
            };
            for (const f of stepLog || []) {
                if (!f) continue;
                scan(f);
                if (f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        // 第 47 轮接入（主代码批 1 补发 fact）：八卦阵**削攻**分支。
        //   一次触发同时动 atk(减) 与 def(加)，而 dir 是**契约级**的、两属性账本符号相反
        //   ⇒ 必须拆两条契约；且判据要求 sum>0，故负的 atkDelta 取**绝对值**当声明幅度。
        //   声明（modules/26elite-sixsects.js L154-159）：
        //     addMod(zhang,'atk',{value:-ba.atkCost,group:'baguaArray'})
        //     + fact BAGUA_ARRAY { unitName: zhang.name, atkDelta: -ba.atkCost, defDelta: ba.defGain }
        id: 'BAGUA_ATK',
        label: '八卦阵·削攻',
        group: 'baguaArray',
        dir: -1,
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data || f.factType !== FACT_TYPES.BAGUA_ARRAY) continue;
                const d = f.data;
                // factType 已锁定 BAGUA_ARRAY（2026-10-02：SPIDER_TRANSFORM 补字段后形状撞车，单靠字段签名不再可靠）
                if (typeof d.unitName === 'string' && typeof d.atkDelta === 'number'
                    && typeof d.defDelta === 'number' && d.atkDelta < 0) {
                    out.push({ unit: d.unitName, stat: 'atk', amount: Math.abs(d.atkDelta) });
                }
            }
            return out;
        }
    },
    {
        // 第 47 轮：八卦阵·加防。2026-10-08 改版（老板拍板）已删除「-1攻+1防」对冲、不再加防
        //   （modules/26elite-sixsects-zhangsanfeng.js L140/L156：defDelta 恒发 0 保住三字段）⇒ 本契**永远零触发**，
        //   属历史契约残留而非缺陷：保留作回归哨兵——未来改版若恢复加防则自动激活；atk 消耗侧由 BAGUA_ATK（dir:-1）盯。
        id: 'BAGUA_DEF',
        label: '八卦阵·加防',
        group: 'baguaArray',
        dir: +1,
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data || f.factType !== FACT_TYPES.BAGUA_ARRAY) continue;
                const d = f.data;
                if (typeof d.unitName === 'string' && typeof d.atkDelta === 'number'
                    && typeof d.defDelta === 'number' && d.defDelta > 0) {
                    out.push({ unit: d.unitName, stat: 'def', amount: d.defDelta });
                }
            }
            return out;
        }
    },
    {
        // 莽撞：主路径（AFTER_DAMAGE_APPLIED L239-252）与溅射路径（SPLASH_DAMAGED L257-270）
        //   **各发一条同形 fact**，都走 group='rageOnHit'，逐步聚合比对即可（同一步两条合法：主目标+溅射都算挨打）。
        id: 'RAGE_ON_HIT',
        label: '莽撞',
        group: 'rageOnHit',
        dir: +1,
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data) continue;
                const d = f.data;
                // 与八卦阵靠「无 defDelta」区分；与雄狮振奋靠「无 targets 数组」区分
                if (typeof d.unitName === 'string' && typeof d.atkDelta === 'number'
                    && d.atkDelta > 0 && typeof d.defDelta !== 'number' && !Array.isArray(d.targets)) {
                    out.push({ unit: d.unitName, stat: 'atk', amount: d.atkDelta });
                }
            }
            return out;
        }
    },
    {
        // 雄狮振奋：**一条 fact 覆盖多目标**（targets 名单），extract 必须展开数组，不能只取 unitName。
        //   声明（modules/27elite-mingjiao.js L725-740）：data:{ targets:[{unitName, atkDelta}] }（无顶层 unitName）
        id: 'LION_INSPIRE',
        label: '雄狮振奋',
        group: 'lionInspire',
        dir: +1,
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data) continue;
                const d = f.data;
                if (!Array.isArray(d.targets)) continue;
                for (const t of d.targets) {
                    // 与苦练 targets 靠「无 defDelta / 无 maxHpDelta」区分
                    if (t && typeof t.unitName === 'string' && typeof t.atkDelta === 'number'
                        && typeof t.defDelta !== 'number' && typeof t.maxHpDelta !== 'number') {
                        out.push({ unit: t.unitName, stat: 'atk', amount: t.atkDelta });
                    }
                }
            }
            return out;
        }
    },
    {
        // 苦练：**一条 fact 覆盖多目标**，且每人增量**已乘 mult**（本人×2）。
        //   ★ 必须走 targets：fact 顶层的 atkBonus/defBonus/hpBonus 是**未乘 mult 的基础值**，
        //     拿它当声明会把本人那一份（×2）判成翻倍 ⇒ 干净树假阳性（主代码批 3 明确点出的坑）。
        id: 'KU_LIAN',
        label: '苦练',
        group: 'kuLian',
        dir: +1,
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data) continue;
                const d = f.data;
                if (!Array.isArray(d.targets)) continue;
                for (const t of d.targets) {
                    if (t && typeof t.unitName === 'string' && typeof t.atkDelta === 'number'
                        && typeof t.defDelta === 'number' && typeof t.maxHpDelta === 'number') {
                        out.push({ unit: t.unitName, stat: 'atk', amount: t.atkDelta });
                        out.push({ unit: t.unitName, stat: 'def', amount: t.defDelta });
                        out.push({ unit: t.unitName, stat: 'maxHp', amount: t.maxHpDelta });
                    }
                }
            }
            return out;
        }
    },
    {
        // 第 48 轮（--scan-groups 查出未覆盖后补，零主代码）：远程成长。
        //   fact（core/03 L182-185）嵌在 `group.data.entries` 里（嵌套一层）⇒ extract 须递归扫描。
        //   ⚠️ 形状与 METEOR_GROWTH 的 `{unitName, growth}` 几乎相同，靠 **newAtk** 字段区分（流星那条没有）。
        id: 'RANGED_GROWTH',
        label: '远程成长',
        group: 'rangedGrowth',
        dir: +1,
        extract(stepLog) {
            const out = [];
            const scan = (e) => {
                if (e && e.data && typeof e.data.unitName === 'string' && typeof e.data.growth === 'number'
                    && typeof e.data.newAtk === 'number') {
                    out.push({ unit: e.data.unitName, stat: 'atk', amount: e.data.growth });
                }
            };
            for (const f of stepLog || []) {
                if (!f) continue;
                scan(f);
                if (f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        // 第 48 轮补（零主代码）：张无忌近战切换 —— 即 **A4 变异**对应的机制，此前只有规则兜、对照器没盯。
        //   fact（core/13 L208-216）data:{ zhang:{uid,name,pos}, atkGain, defGain, maxHpGain }；
        //   addMod（L190-192）用**同名同值**三个变量、group:'zhangSwitch' ⇒ 干净树恒等。
        //   ⚠️ 单位名在 `d.zhang.name` 而非 `d.unitName` —— 正因如此不会与 ENDLESS_BREATH
        //      （谓词要求 `d.unitName` 为 string）误匹配；新增契约时务必保持这一区分。
        id: 'ZHANG_SWITCH',
        label: '近战切换',
        group: 'zhangSwitch',
        dir: +1,
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data) continue;
                const d = f.data;
                if (d.zhang && typeof d.zhang.name === 'string'
                    && typeof d.atkGain === 'number' && typeof d.defGain === 'number'
                    && typeof d.maxHpGain === 'number') {
                    out.push({ unit: d.zhang.name, stat: 'atk', amount: d.atkGain });
                    out.push({ unit: d.zhang.name, stat: 'def', amount: d.defGain });
                    out.push({ unit: d.zhang.name, stat: 'maxHp', amount: d.maxHpGain });
                }
            }
            return out;
        }
    },
    {
        // 第 48 轮补（零主代码）：小昭·弟「精通」—— 排查 9 个未覆盖 group 后，**唯一有现成增量 fact** 的一个。
        //   fact（modules/20elite-skills.js L144）：SPIDER_TRANSFORM 的 `data.masteryGain = { atk, def, hp }`，
        //   正是 L133-135 三处 addMod(gAtk/gDef/gHp, group:'spiderMastery') 用的同三个变量 ⇒ 干净树恒等。
        //   ⚠️ 该 fact 是**蛛变与精通共用**的：只有本次真吃到精通层数时才带 masteryGain，
        //      纯变身场景该字段为 undefined ⇒ 必须判存在性，否则拿到 undefined 当声明量。
        //   ⚠️ 同一条 fact 里**没有**蛛变自己的增量（newStats.atk/def/maxHp 未上报）
        //      ⇒ spiderTransform 本轮仍无法覆盖，已列入给主代码的需求清单。
        id: 'SPIDER_MASTERY',
        label: '精通',
        group: 'spiderMastery',
        dir: +1,
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data) continue;
                const d = f.data;
                const mg = d.masteryGain;
                if (typeof d.unitName === 'string' && mg && typeof mg.atk === 'number'
                    && typeof mg.def === 'number' && typeof mg.hp === 'number') {
                    out.push({ unit: d.unitName, stat: 'atk', amount: mg.atk });
                    out.push({ unit: d.unitName, stat: 'def', amount: mg.def });
                    out.push({ unit: d.unitName, stat: 'maxHp', amount: mg.hp });
                }
            }
            return out;
        }
    },
    {
        id: 'LION_GROW',
        label: '幼狮成长',
        group: 'lionGrow',
        dir: +1,
        // 声明（modules/27elite-mingjiao.js L703-717，V6.4.4 / commit 12a5808）：ON_ROUND_START 幼狮成形，
        //   addMod 三条（group:'lionGrow'，value=atkDelta/defDelta/maxHpDelta）后发 LION_GROW fact，
        //   data 带 unitUid 与三个 delta（2026-10-02 主代码补齐；此前 fact 只有目标值，无法比对，头部 L60 旧结论已作废）。
        //   fact 与 addMod 在同一循环、同一变量、同一 step ⇒ 干净树恒等，走默认严格判据（不进 LOOSE/SAME_STEP 名单）。
        //   必须用 uid 归因：成形当步 cub 由「幼狮」改名为「雄狮/母狮」（L710 在 fact 之前），
        //   且场上可并存多只同名雄狮（第 34/36 轮教训）——按名字配对必然配错个体或被歧义守卫跳过。
        //   A15 变异只把 addMod def 行 value 改 2 倍、fact 的 defDelta 不动 ⇒ 实际=2×声明，严格判据命中。
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data || f.factType !== FACT_TYPES.LION_GROW) continue;
                const d = f.data;
                // factType 已锁定 LION_GROW（SPIDER_TRANSFORM 补字段后同为 unitUid+三 delta 形状，必须靠 factType 区分）
                if (d.unitUid && typeof d.unitName === 'string'
                    && typeof d.atkDelta === 'number' && typeof d.defDelta === 'number'
                    && typeof d.maxHpDelta === 'number') {
                    out.push({ unit: d.unitName, uid: d.unitUid, stat: 'atk', amount: d.atkDelta });
                    out.push({ unit: d.unitName, uid: d.unitUid, stat: 'def', amount: d.defDelta });
                    out.push({ unit: d.unitName, uid: d.unitUid, stat: 'maxHp', amount: d.maxHpDelta });
                }
            }
            return out;
        }
    },
    {
        // 第 52 轮补（零主代码，commit 12a5808 已补发增量字段）：小昭蛛变 —— 与 LION_GROW 同模式。
        //   声明（modules/20elite-skills.js L119-121，V6.0.4）：addMod 三条（group:'spiderTransform'，
        //     value=newStats.atk/def/maxHp）后发 SPIDER_TRANSFORM fact，data 带 unitUid + atkDelta/defDelta/maxHpDelta
        //     （= newStats.*，与 addMod 入参同源）。fact 与 addMod 同函数同变量同 step ⇒ 干净树恒等，走默认严格判据。
        //   ⚠️ factType 守卫必备：12a5808 给 SPIDER_TRANSFORM 补 unitUid+三 delta 后，形状与 LION_GROW 撞车
        //     （顶层带 unitName+两 delta 连 BAGUA_DEF 也被误吃）→ 干净树 59 处假红，详见 LION_GROW 注释。
        //   delta 可为负（远程→战士会掉 def/maxHp），extract 不筛 >0（与 LION_GROW 同）；负增量走账本比对，
        //     严格判定需 sum>0，故负侧由账本兜底（不报，留待必要时再开方向无关判据）。
        id: 'SPIDER_TRANSFORM',
        label: '蛛变',
        group: 'spiderTransform',
        dir: +1,
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data || f.factType !== FACT_TYPES.SPIDER_TRANSFORM) continue;
                const d = f.data;
                if (d.unitUid && typeof d.unitName === 'string'
                    && typeof d.atkDelta === 'number' && typeof d.defDelta === 'number'
                    && typeof d.maxHpDelta === 'number') {
                    out.push({ unit: d.unitName, uid: d.unitUid, stat: 'atk', amount: d.atkDelta });
                    out.push({ unit: d.unitName, uid: d.unitUid, stat: 'def', amount: d.defDelta });
                    out.push({ unit: d.unitName, uid: d.unitUid, stat: 'maxHp', amount: d.maxHpDelta });
                }
            }
            return out;
        }
    },
    {
        // 第 52 轮补（零主代码，commit 12a5808 已补发增量字段）：吸血上限提升 —— 与 LEECH 处理器同模式。
        //   声明（core/15:158 声明 factType=WEI_LEECH / core/16:128 LEECH 处理器补 maxHpDelta）：
        //     WEI_LEECH fact 的 data 带 unitName + maxHpDelta（增量 = addMod 入参 delta；此前只有 newMaxHp 绝对值）。
        //   注意与「韦一笑闪避吸血」区分：闪避路径（core/12 weiLeech 组）的 WEI_HEAL 声明**无 factType**，
        //     不进 step.log 顶层 fact，只在 DODGE fact 的 data.weiHeal 里可见（见 WEI_HEAL 契约）；本契约只吃顶层 WEI_LEECH fact。
        id: 'LEECH_MAXHP',
        label: '吸血上限提升',
        group: 'leechMaxHp',
        dir: +1,
        // 声明（core/15:158 声明 factType=WEI_LEECH / core/16:128 LEECH 处理器补 maxHpDelta）：
        //   WEI_LEECH fact 的 data 带 unitName + maxHpDelta（增量 = addMod 入参 delta；此前只有 newMaxHp 绝对值）。
        //   ⚠️ 该 fact 在 core/10:253 被推入「攻击 fact 的 data.entries」嵌套层（非 step.log 顶层），
        //     故 extract 必须递归扫 f.data.entries（与 BREAK_DEF 同款），否则 0 触发。
        //   注意与「韦一笑闪避吸血」区分：闪避路径（core/12 weiLeech 组）的 WEI_HEAL 声明**无 factType**，
        //     不进 step.log 顶层 fact，只在 DODGE fact 的 data.weiHeal 里可见（见 WEI_HEAL 契约）。
        extract(stepLog) {
            const out = [];
            const scan = (e) => {
                if (!e || !e.data || e.factType !== FACT_TYPES.WEI_LEECH) return;
                const d = e.data;
                if (typeof d.unitName === 'string' && typeof d.maxHpDelta === 'number' && d.maxHpDelta > 0) {
                    out.push({ unit: d.unitName, uid: d.unitUid || null, stat: 'maxHp', amount: d.maxHpDelta });
                }
            };
            for (const f of stepLog || []) {
                if (!f) continue;
                scan(f);
                if (f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        // 第 52 轮补（零主代码，但主代码 12a5808 补发不完整）：韦一笑闪避吸血。
        //   声明（core/12:580 闪避路径 addMod，group:'weiLeech'；core/12:574 算 delta 回写 decl.data.maxHpDelta）：
        //     该 WEI_HEAL 声明**无 factType**（core/10:239 只对带 factType 的声明生成顶层 fact），
        //     ⇒ 不进 step.log 顶层，只在闪避 fact（factType=DODGE）的 data.weiHeal 里可见 —— 仅当闪避方为韦一笑(isWei)时非 null。
        //   增量只能从 dodgeFact.weiHeal.maxHpDelta 取，单位取 dodger（闪避方）。
        //   ⚠️ 主代码 12a5808 对此组只补 maxHpDelta 字段、未补 factType ⇒ 仍无法作为独立顶层 fact 观测；
        //     当前靠 DODGE fact 嵌套兜底，已记入需求四「weiLeech 补发不完整」，待主代码补 factType 后可改为独立 fact 契约。
        //   factType=DODGE 守卫：与 WEI_LEECH（LEECH 处理器）顶层 fact 区分（二者同义但 factType 不同）。
        id: 'WEI_HEAL',
        label: '韦一笑吸血',
        group: 'weiLeech',
        dir: +1,
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data || f.factType !== FACT_TYPES.DODGE) continue;
                const d = f.data;
                const wh = d.weiHeal;
                if (wh && typeof wh.maxHpDelta === 'number' && wh.maxHpDelta > 0
                    && d.dodger && typeof d.dodger.name === 'string') {
                    out.push({ unit: d.dodger.name, uid: d.dodger.uid || null, stat: 'maxHp', amount: wh.maxHpDelta });
                }
            }
            return out;
        }
    },
    // 第 79 轮：韦一笑闪避吸血的 hp 实际增量盲区——WEI_HEAL 契约只盯 maxHp 账本（group weiLeech），
    //   但 refreshMaxHp（core/13 L233）会把 hp 同步抬升同样增量（applyStatChange('hp', delta)），
    //   该 hp 变更无 group 记账 = 数值网盲区。本契约补上：读 WEI_DODGE_LEECH fact 的 maxHpDelta
    //   （core/12 L587 顶层 log.push），**不用 data.heal**——heal 是 27 传的毛估值（floor 前），
    //   实际 hp 增量 = delta = maxHpDelta（refreshMaxHp 同源），用 heal 会因 floor 差误报。
    {
        id: 'WEI_DODGE_HEAL',
        label: '韦一笑闪避吸血回血',
        group: 'weiDodgeHeal',
        dir: +1,
        extract(stepLog) {
            const out = [];
            const scan = (e) => {
                if (!e || !e.data || e.factType !== FACT_TYPES.WEI_DODGE_LEECH) return;
                const d = e.data;
                if (typeof d.unitName === 'string' && typeof d.maxHpDelta === 'number' && d.maxHpDelta > 0) {
                    out.push({ unit: d.unitName, uid: d.unitUid || null, stat: 'hp', amount: d.maxHpDelta });
                }
            };
            for (const f of stepLog || []) {
                if (!f) continue;
                scan(f);
                if (f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    // 第 79 轮：反弹伤害盲区——REBOUND handler（core/16 L189-199）对 hp 伤害无 group 记账。
    //   两个声明源共用同一 handler：小昭马形阵反弹（core/12 L387-394，factData.rebound）
    //   与 张无忌反击（core/12 L397-408 + modules/26 L243-248，factData.reboundDmg；⚠️ 嵌套子 fact，
    //   递归扫）。dir=-1（声明为正伤害、hp 下降）。hasSister 回血走 decl.source，另条契约不覆盖。
    {
        id: 'HORSE_REBOUND',
        label: '马形阵反弹伤害',
        group: 'horseRebound',
        dir: -1,
        extract(stepLog) {
            const out = [];
            const scan = (e) => {
                if (!e || !e.data || e.factType !== FACT_TYPES.HORSE_REBOUND) return;
                const d = e.data;
                if (typeof d.unitName === 'string' && typeof d.rebound === 'number' && d.rebound > 0) {
                    out.push({ unit: d.unitName, uid: d.attackerUid || null, stat: 'hp', amount: d.rebound });
                }
            };
            for (const f of stepLog || []) {
                if (!f) continue;
                scan(f);
                if (f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        id: 'FORTIFY_REBOUND',
        label: '张无忌反击伤害',
        group: 'fortifyRebound',
        dir: -1,
        extract(stepLog) {
            const out = [];
            const scan = (e) => {
                if (!e || !e.data || e.factType !== FACT_TYPES.FORTIFY_REBOUND) return;
                const d = e.data;
                if (typeof d.unitName === 'string' && typeof d.reboundDmg === 'number' && d.reboundDmg > 0) {
                    out.push({ unit: d.unitName, uid: d.attackerUid || null, stat: 'hp', amount: d.reboundDmg });
                }
            };
            for (const f of stepLog || []) {
                if (!f) continue;
                scan(f);
                if (f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        // 第 81 轮：小昭蛛袭（蛛落落地打击）——modules/20 L203-212 直推 fact（非声明通道），
        //   data.totalDmg = penetrationDmg + extraDmg，同函数 applyStatChange(target,'hp',-totalDmg) 即时扣血。
        //   HP 多来源 ⇒ 走 group 账本隔离（mirror HORSE_REBOUND 的 dir=-1）；主代码未补记账时为警告态。
        //   extract 抓 data.totalDmg（>0 才计，与 REBOUND 同式的正值守卫）。
        id: 'SPIDER_STRIKE',
        label: '小昭蛛袭伤害',
        group: 'spiderStrike',
        dir: -1,
        extract(stepLog) {
            const out = [];
            const scan = (e) => {
                if (!e || !e.data || e.factType !== FACT_TYPES.SPIDER_STRIKE) return;
                const d = e.data;
                if (typeof d.targetName === 'string' && typeof d.totalDmg === 'number' && d.totalDmg > 0) {
                    out.push({ unit: d.targetName, uid: d.targetUid || null, stat: 'hp', amount: d.totalDmg });
                }
            };
            for (const f of stepLog || []) {
                if (!f) continue;
                scan(f);
                if (f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        // 第 84 轮：流星赶月溅射伤害（core/04 L231-238 推 SPLASH decl + METEOR_SHOWER_SPLASH fact）——
        //   factData.targets = [{uid,name}]，同一 splashDmg 作用于每个相邻目标；core/16 SPLASH handler L163
        //   逐目标 applyStatChange(st,'hp',-splashDmg)。溅射**减防**部分已由 STAT_CHANGE 契约覆盖
        //   （core/04 L238 的 def decl 无 factType、走通用 group 'statChange'），本条只盯**伤害本体**。
        //   dir=-1（声明 splashDmg 为正、hp 下降）；>0 守卫（floor(dmg×0.3) 可为 0，与 decl 同条件）。
        //   主代码 core/16 记账待补（转交见「体检-fact覆盖矩阵.md」第 84 轮节）：补前 gd=null ⇒ 警告态跳过，不比对。
        id: 'METEOR_SHOWER_SPLASH',
        label: '流星赶月溅射',
        group: 'meteorSplash',
        dir: -1,
        extract(stepLog) {
            const out = [];
            const scan = (e) => {
                if (!e || !e.data || e.factType !== FACT_TYPES.METEOR_SHOWER_SPLASH) return;
                const d = e.data;
                if (typeof d.splashDmg === 'number' && d.splashDmg > 0 && Array.isArray(d.targets)) {
                    for (const t of d.targets) {
                        // uid 归因：溅射目标按 decl 时的 uid 逐个人账（factData 带 uid，优先于显示名）
                        if (t && t.uid != null) out.push({ unit: t.name || null, uid: t.uid, stat: 'hp', amount: d.splashDmg });
                    }
                }
            };
            for (const f of stepLog || []) {
                if (!f) continue;
                scan(f);
                if (f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        // 第 84 轮：乘风突袭溅射伤害（core/04 L180-187 推 SPLASH decl + WIND_ASSAULT_SPLASH fact）——
        //   与流星溅射**同一 handler**（core/16 L157-185 SPLASH），按 decl.buffType 分流 group：
        //   METEOR_SPLASH→meteorSplash / WIND_ASSAULT→windSplash（转交一行同时覆盖两条契约）。
        //   factData 同型 {targets:[{uid,name}], splashDmg}；dir=-1、>0 守卫、uid 归因均同 METEOR_SHOWER_SPLASH。
        id: 'WIND_ASSAULT_SPLASH',
        label: '乘风突袭溅射',
        group: 'windSplash',
        dir: -1,
        extract(stepLog) {
            const out = [];
            const scan = (e) => {
                if (!e || !e.data || e.factType !== FACT_TYPES.WIND_ASSAULT_SPLASH) return;
                const d = e.data;
                if (typeof d.splashDmg === 'number' && d.splashDmg > 0 && Array.isArray(d.targets)) {
                    for (const t of d.targets) {
                        if (t && t.uid != null) out.push({ unit: t.name || null, uid: t.uid, stat: 'hp', amount: d.splashDmg });
                    }
                }
            };
            for (const f of stepLog || []) {
                if (!f) continue;
                scan(f);
                if (f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        // 第 84 轮：乾坤衍生·加攻（小昭·姊，modules/27 L294/L347 addMod group 'qianKunDerived'）——
        //   --scan-groups 盲区扫描挖出：qianKunDerived 268 条 atk 词条无任何契约盯（"改错数值也查不出"）。
        //   fact（QIAN_KUN_DERIVED）自带 atkGain + atkTargetUid，addMod 与 fact **同 handler 同值**（都是 atkGain）
        //   ⇒ 纯 test-side 即可严格比对，**零主代码依赖**，落地即激活。
        //   落点：BEFORE_DAMAGE_CALC 路径经 core/12 L328 derivedEntries → core/10 L219 收入攻击组 entries；
        //   CLAW_HIT_APPLIED 路径经 core/10 L302/L314 落 group.data.entries（均被下方递归扫覆盖）。
        //   ⚠️ 与 BREAK_DEF 的形状碰撞史（第 71/72 轮：data.reduce 曾被误判成破防）——本契约只认
        //   factType===QIAN_KUN_DERIVED 且显式取 atkGain 字段，不碰 reduce，不会重蹈覆辙。
        id: 'QIAN_KUN_ATK',
        label: '乾坤衍生加攻',
        group: 'qianKunDerived',
        dir: +1,
        extract(stepLog) {
            const out = [];
            const scan = (e) => {
                if (!e || !e.data || e.factType !== FACT_TYPES.QIAN_KUN_DERIVED) return;
                const d = e.data;
                if (typeof d.atkGain === 'number' && d.atkGain > 0 && d.atkTargetUid != null) {
                    out.push({ unit: d.atkTargetName || null, uid: d.atkTargetUid, stat: 'atk', amount: d.atkGain });
                }
            };
            for (const f of stepLog || []) {
                if (!f) continue;
                scan(f);
                if (f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        // 第 84 轮：乾坤衍生·治疗（modules/27 L292/L345 applyStatChange(healTarget,'hp',heal) 即时治疗）——
        //   与加攻同一次衍生结算：fact 带 heal + healTargetUid；HP 多来源 ⇒ 需主代码补 group 记账才能隔离比对
        //   （转交见矩阵第 84 轮节，补前警告态）。reduce（减伤值）不在数值契约范围——它是伤害减免、
        //   无对应属性账本，留待伤害侧检测（登记为剩余项）。
        id: 'QIAN_KUN_HEAL',
        label: '乾坤衍生治疗',
        group: 'qianKunHeal',
        dir: +1,
        extract(stepLog) {
            const out = [];
            const scan = (e) => {
                if (!e || !e.data || e.factType !== FACT_TYPES.QIAN_KUN_DERIVED) return;
                const d = e.data;
                if (typeof d.heal === 'number' && d.heal > 0 && d.healTargetUid != null) {
                    out.push({ unit: d.healTargetName || null, uid: d.healTargetUid, stat: 'hp', amount: d.heal });
                }
            };
            for (const f of stepLog || []) {
                if (!f) continue;
                scan(f);
                if (f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        // 第 85 轮：何太冲·红血（机制③：两仪互换 / 单人红血）职业加成——modules/26 addRoleBonus 三连 addMod
        //   （atk/def/maxHp，group 'heTaichongRed'，ttl:'permanent'）。两仪互换 = 双方各叠一套对方职业加成；
        //   单人红血 = 战士+远程两套起手，再按撤退成败叠第三/四套（共 3~4 套，均同 uid 同 step）。
        //   fact 侧：SKILL_ANNOUNCE（skillName '两仪互换'/'红血'）的 data.grants——主代码转交补的数值载荷，
        //   每套职业加成一条 {uid, atk, def, maxHp}（转交块见矩阵第 85 轮节；未转交前本契因为零触发警告态：
        //   声明 0 而账本已 48 词条——正是 scan-groups 挖出的盲区形态）。
        //   ⚠️ 职业信息无法从既有 fact 推得：emitStateChange(ROLE_CHANGED) 只发 eventBus 信号不产 fact
        //   （infra/59 文件头明示「日志 fact 由各源头 log.push 负责」），announce note 又不带角色/数值
        //   ⇒ 纯 test-side 路线已证死，必须 grants 载荷（同 weiHeal.maxHpDelta / pangDefGain 先例）。
        //   ⚠️ refreshMaxHp 不走 addMod（core/13 L221-242 只同步 maxHp+缩放 hp）⇒ maxHp 账本无双算源。
        id: 'HE_TAICHONG_RED',
        label: '何太冲红血·职业加成',
        group: 'heTaichongRed',
        dir: +1,
        extract(stepLog) {
            const out = [];
            const scan = (f) => {
                if (!f || !f.data || f.factType !== FACT_TYPES.SKILL_ANNOUNCE) return;
                const d = f.data;
                if (d.skillName !== '两仪互换' && d.skillName !== '红血') return;
                if (!Array.isArray(d.grants)) return;
                for (const g of d.grants) {
                    if (!g || g.uid == null) continue;
                    if (typeof g.atk === 'number' && g.atk > 0) out.push({ unit: null, uid: g.uid, stat: 'atk', amount: g.atk });
                    if (typeof g.def === 'number' && g.def > 0) out.push({ unit: null, uid: g.uid, stat: 'def', amount: g.def });
                    if (typeof g.maxHp === 'number' && g.maxHp > 0) out.push({ unit: null, uid: g.uid, stat: 'maxHp', amount: g.maxHp });
                }
            };
            for (const f of stepLog || []) {
                scan(f);
                if (f && f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (f && Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        // 第 81 轮：九阴白骨爪爪击（CLAW_CHAIN 链式多爪）——core/16 L247-267 逐爪扣血，
        //   fact 经 core/10 L294-295 以 {factType:CLAW_HIT, data:hit.data} 落进攻击组 entries（嵌套子 fact，须递归扫）。
        //   data.dmg 是 core/16 L263 **回填后的实际落地值**（减伤后、1 位小数），与 addMod 记账值同源 ⇒ 干净树恒等。
        //   ⚠️ 不用 designedDmg（那是减伤前设计值，会被小昭·姊乾坤衍生 reduce 拉开差距）。
        id: 'CLAW_HIT',
        label: '九阴白骨爪爪击',
        group: 'clawHit',
        dir: -1,
        extract(stepLog) {
            const out = [];
            const scan = (e) => {
                if (!e || !e.data || e.factType !== FACT_TYPES.CLAW_HIT) return;
                const d = e.data;
                if (typeof d.targetName === 'string' && typeof d.dmg === 'number' && d.dmg > 0) {
                    out.push({ unit: d.targetName, uid: d.targetUid || null, stat: 'hp', amount: d.dmg });
                }
            };
            for (const f of stepLog || []) {
                if (!f) continue;
                scan(f);
                if (f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        // 第 81 轮：快乐回血（周芷若快乐层数结算）——modules/26 L627 推 ROUND_STAT_GRANT{field:'hp',delta:totalHeal}
        //   声明通道落地治疗，fact 由同处 L635 直推 data.heal=totalHeal。dir=+1 mirror NINE_YANG_HEAL。
        id: 'KUAI_LE_HEAL',
        label: '快乐回血',
        group: 'kuaiLeHeal',
        dir: +1,
        extract(stepLog) {
            const out = [];
            const scan = (e) => {
                if (!e || !e.data || e.factType !== FACT_TYPES.KUAI_LE_HEAL) return;
                const d = e.data;
                if (typeof d.unitName === 'string' && typeof d.heal === 'number' && d.heal > 0) {
                    out.push({ unit: d.unitName, uid: d.unitUid || null, stat: 'hp', amount: d.heal });
                }
            };
            for (const f of stepLog || []) {
                if (!f) continue;
                scan(f);
                if (f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        // 第 81 轮：爪击回血（宋青书吸血段）——modules/26 L717 推 HEAL{value:totalHeal, source:song} 声明，
        //   factData 仅 {totalHeal, unitUid:song.uid}（**无 unitName**）⇒ 走 uid 精确归因（主循环 L1334-1338 支持）。
        //   ⚠️ HEAL handler（core/16）按 min(value, maxHp-hp) 封顶；modules/26 模拟值用 simulatedSongHp，
        //     若模拟与落地之间宋青书血量被别因改变 ⇒ declared≠applied 会现偏差——这正是本契约要盯的洞。
        id: 'CLAW_HEAL',
        label: '爪击回血',
        group: 'clawHeal',
        dir: +1,
        extract(stepLog) {
            const out = [];
            const scan = (e) => {
                if (!e || !e.data || e.factType !== FACT_TYPES.CLAW_HEAL) return;
                const d = e.data;
                if (typeof d.totalHeal === 'number' && d.totalHeal > 0 && d.unitUid != null) {
                    out.push({ unit: null, uid: d.unitUid, stat: 'hp', amount: d.totalHeal });
                }
            };
            for (const f of stepLog || []) {
                if (!f) continue;
                scan(f);
                if (f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        // 第 53 轮（回应主代码③）：通用属性裁定 STAT_CHANGE（EFFECT_TYPES.STAT_CHANGE 声明通道）。
        //   fact（core/16 L207-216）与 addMod **同 handler、同值（decl.delta）**、group:'statChange'、ttl:'permanent' ⇒ 同一步，干净树恒等。
        //   ⚠️ delta 可正可负（atk 升 / def 降），按**带符号**声明；dir:+1 不翻转符号，
        //     故 def 降防时 sum 为负、strict 闸门 sum>0 跳过自动上报，但其偏差仍计入 checked/mismatch 诊断（可查）。
        id: 'STAT_CHANGE',
        label: '属性裁定',
        group: 'statChange',
        dir: +1,
        allowNeg: true,  // def 降防时声明为负，须放开严格闸门负值（见比对主循环 declaredNonZero）
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data || f.factType !== FACT_TYPES.STAT_CHANGE_APPLY) continue;
                const d = f.data;
                if (typeof d.field === 'string' && typeof d.delta === 'number') {
                    out.push({ unit: d.unitName, uid: d.unitUid || null, stat: d.field, amount: d.delta });
                }
            }
            return out;
        }
    },
    {
        // 第 53 轮（回应主代码③）：正义国字脸·叠防（modules/26 addMod def，ttl:'permanent'，group:'righteousFace'）。
        //   2026-10-17 第 98 轮修：加防量声明改随 SKILL_ANNOUNCE 事实走（modules/26 AFTER_SELECT_TARGET 写入，
        //     命中/被闪都发）；此前随 ATTACK 事实 pangDefGain（仅命中后 AFTER_ATTACK 落），被闪避时不发 ⇒ 漏报。
        //   根因：def addMod 在 BEFORE_SELECT_TARGET 无条件施加（永久叠加），声明却在 AFTER_ATTACK 才写，
        //     被闪的嘲讽「加了防却没入账」⇒ 账实偏差（实际>声明）。现声明与 addMod 同触发点，账实一致。
        //   仍走保守判据（LOOSE_IDS）：只抓整数倍超应用（翻倍），零误报。
        id: 'RIGHTEOUS_FACE',
        label: '正义国字脸·叠防',
        group: 'righteousFace',
        dir: +1,
        extract(stepLog) {
            const out = [];
            // 2026-10-17 第 98 轮补：声明改读 SKILL_ANNOUNCE 事实（skillName='正义国字脸'）。
            // 旧版读 ATTACK 事实的 pangDefGain，而 ATTACK 事实只在命中后（AFTER_ATTACK）落，被闪避/落空
            // 时不发 ⇒ 防御加成（BEFORE_SELECT_TARGET 无条件 addMod，永久叠加）已生效却无声明 ⇒ 账实偏差。
            // SKILL_ANNOUNCE 在 AFTER_SELECT_TARGET 落（早于命中判定，命中/被闪都发），与 addMod 同触发点，
            // 账实一致。render/38 的「🛡+N」飘字仍走 ATTACK 事实 pangDefGain，不受影响。
            for (const f of stepLog || []) {
                if (!f || !f.data || f.factType !== FACT_TYPES.SKILL_ANNOUNCE) continue;
                const d = f.data;
                if (d.skillName !== '正义国字脸') continue;
                if (typeof d.pangDefGain === 'number' && d.pangDefGain > 0) {
                    out.push({ unit: d.unitName, uid: d.unitUid || null, stat: 'def', amount: d.pangDefGain });
                }
            }
            return out;
        }
    },
    {
        // 第 54 轮：光环 aura（空列光环 / 残血光环）。
        //   fact AURA_APPLY（core/11 L188/L211）与 addMod **同循环、同值**（emptyCol / bloodAura）、
        //   group:'aura'、op:'add'、ttl:'round' ⇒ 同一步；且第 53 轮已修 round 续期口径
        //   （到期不参与净贡献相减），故可上严格判据。
        //   ⚠️ fact 每存活单位每回合都发（两值为 0 也发），但 addMod 有 `> 0` 守卫 ⇒ 0 值不声明，避免"声明 0 却不加"假报。
        //   同一单位同一步可能同时吃两条（空列 + 残血）⇒ 两条独立声明，主循环按 stat 汇总求和后与账本比对。
        id: 'AURA',
        label: '空列/残血光环',
        group: 'aura',
        dir: +1,
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data || f.factType !== FACT_TYPES.AURA_APPLY) continue;
                const d = f.data;
                if (typeof d.unitName !== 'string') continue;
                for (const key of ['emptyCol', 'bloodAura']) {
                    const v = d[key];
                    if (typeof v === 'number' && v > 0) {
                        out.push({ unit: d.unitName, uid: d.unitUid || null, stat: 'atk', amount: v });
                    }
                }
            }
            return out;
        }
    },
    {
        // 第 54 轮：圣火令 holyFlame（乘法词条）—— 22/22 收官的最后一条。
        //   fact HOLY_FLAME_APPLY（core/14 L31）声明的是**乘率 ratio**（不是加法增量），
        //   addMod 同函数同值（CONFIG.BUFFS.holyFlame.atkBonus / defBonus）、op:'mul'、ttl:'round'。
        //   mul:true ⇒ 主循环改取 groupDelta 的 mulSum（乘法累加值）与 ratio 比对，不用加法 sum
        //   （乘区共享 (1+mulSum)、无"增量"语义，sum 恒 0 会全判少加）。
        //   ⚠️ ratio 恒为正（乘率），dir:+1；atk/def 两条独立声明（列攻 / 行防）。
        id: 'HOLY_FLAME',
        label: '圣火令',
        group: 'holyFlame',
        dir: +1,
        mul: true,
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data || f.factType !== FACT_TYPES.HOLY_FLAME_APPLY) continue;
                const d = f.data;
                if (typeof d.unitName !== 'string') continue;
                const field = d.field === 'def' ? 'def' : (d.field === 'atk' ? 'atk' : null);
                if (field && typeof d.ratio === 'number' && d.ratio > 0) {
                    out.push({ unit: d.unitName, uid: d.unitUid || null, stat: field, amount: d.ratio });
                }
            }
            return out;
        }
    },
    {
        // 第 70 轮（阶段一·数值真值网闭环）：摄魂 soulDrain —— 镜像 HOLY_FLAME（op:'mul' 削弱型海克斯），零主代码侧只绑契约。
        //   第 71 轮（2026-10-11）**严格态**：主代码已补发（core/04 V6.2.9 push fact / core/11 V6.3.7 两处透传 log /
        //     infra/56 V1.4.4 注册 SOUL_DRAIN_APPLY / infra/58 V1.5.7 登记契约），data:{ unitName, unitUid, camp, field:'atk', op:'mul', ratio }
        //     （ratio 为负 -0.25，故 allowNeg 放开严格闸门负值）。
        //   与 HOLY_FLAME 同：mul:true ⇒ 主循环取账本 mulSum 比对；dir:+1 不翻转符号，负 ratio 走 allowNeg。
        //   实测：声明 827 条 · 严格比对 799 条 / 偏差 0（fact 上线即自动激活，无需改本文件判据）。
        //   牙齿：A28（core/04 把 value 翻倍、fact 不动）⇒ 实际 mul=2×ratio 命中（2×声明）——第 70 轮已用临时 worktree 手动验证
        //     （契约严格比对 800 条 / 偏差 800 当场报红）；**尚未登记进 mutation-teeth.mjs**，待补。
        id: 'SOUL_DRAIN',
        label: '摄魂',
        group: 'soulDrain',
        dir: +1,
        mul: true,
        allowNeg: true,
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data || f.factType !== FACT_TYPES.SOUL_DRAIN_APPLY) continue;
                const d = f.data;
                if (typeof d.unitName !== 'string') continue;
                const field = d.field === 'def' ? 'def' : (d.field === 'atk' ? 'atk' : null);
                if (field && typeof d.ratio === 'number') {
                    out.push({ unit: d.unitName, uid: d.unitUid || null, stat: field, amount: d.ratio });
                }
            }
            return out;
        }
    },
    {
        // 第 98 轮（2026-10-17）：众志成城（unity）盲区闭环——core/04 applyUnityBonus 原纯 addMod 无声明侧 fact，
        //   scan-groups 长期裸奔（2044 条词条）。主代码补 UNITY_APPLY 数值声明 fact（atk/def 各一条乘率 ratio），
        //   与 addMod value（tier.atkBonus/defBonus）同值。mul:true ⇒ 主循环取账本 mulSum 比对；dir:+1。
        id: 'UNITY',
        label: '众志成城',
        group: 'unity',
        dir: +1,
        mul: true,
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data || f.factType !== FACT_TYPES.UNITY_APPLY) continue;
                const d = f.data;
                if (typeof d.unitName !== 'string') continue;
                const field = d.field === 'def' ? 'def' : (d.field === 'atk' ? 'atk' : null);
                if (field && typeof d.ratio === 'number' && d.ratio > 0) {
                    out.push({ unit: d.unitName, uid: d.unitUid || null, stat: field, amount: d.ratio });
                }
            }
            return out;
        }
    },
    {
        // 第 98 轮（2026-10-17）：背水一战（lastStand）盲区闭环——core/04 applyLastStandBonus 原纯 addMod 无声明侧，
        //   scan-groups 裸奔（83 条词条）。主代码补 LAST_STAND_APPLY 数值声明 fact（atk 乘率 ratio=cfg.atkBonus），
        //   与 addMod value 同值。mul:true ⇒ 主循环取账本 mulSum 比对；dir:+1。
        id: 'LAST_STAND',
        label: '背水一战',
        group: 'lastStand',
        dir: +1,
        mul: true,
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data || f.factType !== FACT_TYPES.LAST_STAND_APPLY) continue;
                const d = f.data;
                if (typeof d.unitName !== 'string') continue;
                if (d.field === 'atk' && typeof d.ratio === 'number' && d.ratio > 0) {
                    out.push({ unit: d.unitName, uid: d.unitUid || null, stat: 'atk', amount: d.ratio });
                }
            }
            return out;
        }
    },
    {
        // 第 98 轮（2026-10-17）：唐文亮冲刺·转战士（twDash）盲区闭环——modules/26 addRoleBonus 原纯 addMod 无声明侧，
        //   scan-groups 裸奔（6 条词条）。主代码补 TW_DASH_APPLY 数值声明 fact（atk/def/maxHp=getRoleBonus(WARRIOR)），
        //   与 addMod value 同值。op:add 永久词条 ⇒ 主循环取账本 sum 比对（无 mul）；dir:+1。
        id: 'TW_DASH',
        label: '唐文亮冲刺转战士',
        group: 'twDash',
        dir: +1,
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data || f.factType !== FACT_TYPES.TW_DASH_APPLY) continue;
                const d = f.data;
                if (typeof d.unitName !== 'string') continue;
                if (typeof d.atk === 'number' && d.atk > 0) out.push({ unit: d.unitName, uid: d.unitUid || null, stat: 'atk', amount: d.atk });
                if (typeof d.def === 'number' && d.def > 0) out.push({ unit: d.unitName, uid: d.unitUid || null, stat: 'def', amount: d.def });
                if (typeof d.maxHp === 'number' && d.maxHp > 0) out.push({ unit: d.unitName, uid: d.unitUid || null, stat: 'maxHp', amount: d.maxHp });
            }
            return out;
        }
    },
    {
        // 第 74 轮（阶段二·fact全覆盖）：玄冥中毒 DoT 伤害 xuanMingDot —— 首个 HP 类数值契约（治"声明对、做错"核心洞）。
        //   emit（modules/30custom-effects.js L45 dotTick）：{ factType:XUAN_MING_DOT, data:{ unitName, dot, uidD, isDead } }
        //     dot = Math.floor(u.maxHp * pct)；同处已 push ROUND_STAT_GRANT { field:'hp', delta:-dot } 实际扣血。
        //   镜像 BREAK_DEF（dir:-1：声明 dot 为正、hp 下降）：group='xuanMingDot'，比对「玄冥中毒」自身贡献，不受同步其他 hp 来源干扰。
        //   ✅ 记账已落地（主代码 V7.6.19 / 2de9895）：modules/30 dotTick 走 recordHpAudit(u,'xuanMingDot',-dot,'玄冥中毒')
        //     —— 纯记账（core/13 recordHpAudit → unit._audit.hp，零游戏逻辑副作用；真实扣血仍由 ROUND_STAT_GRANT 负责）。
        //     第 90 轮起对照器 snapLedger 已跟迁读 _audit.hp ⇒ 该条目直接激活严格比对，应见偏差 0。
        //     （旧注：主代码未加记账时 gd 为 null → 走 net-delta 兜底但 mismatch 不计（主循环守卫）→ 零触发不误报警告态。）
        //   牙齿：后续补（把 dot 翻倍 / 把 recordHpAudit 的 value 改错 ⇒ 命中）。
        id: 'XUAN_MING_DOT',
        label: '玄冥中毒DoT',
        group: 'xuanMingDot',
        dir: -1,
        extract(stepLog) {
            const out = [];
            const scan = (e) => {
                if (!e || !e.data) return;
                if (e.factType && e.factType !== FACT_TYPES.XUAN_MING_DOT) return;
                const d = e.data;
                if (typeof d.dot === 'number' && d.uidD != null && typeof d.unitName === 'string') {
                    out.push({ unit: d.unitName, uid: d.uidD, stat: 'hp', amount: d.dot });
                }
            };
            for (const f of stepLog || []) {
                if (!f) continue;
                scan(f);
                if (f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        // 2026-10-18 第 99 轮修（高视角扫地发现）：九阳神功早已迁通用 HEAL 通道——core/15 L255 发 FACT_TYPES.HEAL，
        //   factData 带 heal / label='九阳神功回复' / unitUid / unitName。本契约却仍读旧专用 FACT_TYPES.NINE_YANG_HEAL
        //   ⇒ 永远 0 声明（零触发假绿，曾被误登记为"长期遗留"）。改读通用 HEAL 事实（label 归属），
        //   与 HLS_JIUYANG_HEAL / PANG_HIT_HEAL 同范式；recordHpAudit group='nineYangHeal' 不变、dir=+1。
        id: 'NINE_YANG_HEAL',
        label: '九阳神功治疗',
        group: 'nineYangHeal',
        dir: +1,
        extract(stepLog) {
            const out = [];
            const scan = (f) => {
                if (!f || !f.data || f.factType !== FACT_TYPES.HEAL) return;
                const d = f.data;
                if (d.label !== '九阳神功回复') return;
                if (typeof d.heal !== 'number' || d.heal <= 0) return;
                if (d.unitUid == null) return;
                out.push({ unit: d.unitName || null, uid: d.unitUid, stat: 'hp', amount: d.heal });
            };
            for (const f of stepLog || []) {
                scan(f);
                if (f && f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (f && Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        // 第 98 轮补：寒离飒九阳神拳治疗（modules/27 L67-75 recordHpAudit(hls,'hlsJiuYangHeal',heal,...)）。
        //   声明侧：引擎已发 FACT_TYPES.HEAL 事实（L70-74），factData 带 heal / label='九阳神拳回复' / unitUid / unitName
        //   —— 与 PANG_HIT_HEAL / HUI_CHUN 同范式（通用 HEAL 通道靠 label 归属），零主代码改动即严格。
        //   dir=+1；heal 截断 Math.min(floor(maxHp*healPct), maxHp-hp)，与 recordHpAudit 同一 heal 局部变量 ⇒ 恒等比对。
        id: 'HLS_JIUYANG_HEAL',
        label: '寒离飒九阳神拳治疗',
        group: 'hlsJiuYangHeal',
        dir: +1,
        extract(stepLog) {
            const out = [];
            const scan = (f) => {
                if (!f || !f.data || f.factType !== FACT_TYPES.HEAL) return;
                const d = f.data;
                if (d.label !== '九阳神拳回复') return;
                if (typeof d.heal !== 'number' || d.heal <= 0) return;
                if (d.unitUid == null) return;
                out.push({ unit: d.unitName || null, uid: d.unitUid, stat: 'hp', amount: d.heal });
            };
            for (const f of stepLog || []) {
                scan(f);
                if (f && f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (f && Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        // 第 98 轮补：寒离飒寒毒 DoT（modules/27 L129-133 recordHpAudit(u,'hlsHanDuDot',-dot,...)）。
        //   声明侧原只有 SKILL_ANNOUNCE 带文字 note、无结构化数值 ⇒ 盲区。本轮回填 dot 字段（同 SPIDER_EGG 载荷转交范式），
        //   引擎数值零改动（recordHpAudit 仍用同一 dot 局部变量）。dir=-1：声明 dot 为正、hp 下降（镜像 XUAN_MING_DOT）。
        id: 'HLS_HANDU_DOT',
        label: '寒离飒寒毒DoT',
        group: 'hlsHanDuDot',
        dir: -1,
        extract(stepLog) {
            const out = [];
            const scan = (f) => {
                if (!f || !f.data || f.factType !== FACT_TYPES.SKILL_ANNOUNCE) return;
                const d = f.data;
                if (d.skillName !== '寒毒') return;
                if (typeof d.dot === 'number' && d.dot > 0 && d.unitUid != null && typeof d.unitName === 'string') {
                    out.push({ unit: d.unitName, uid: d.unitUid, stat: 'hp', amount: d.dot });
                }
            };
            for (const f of stepLog || []) {
                scan(f);
                if (f && f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (f && Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        // 第 105 轮（scan-groups 扫地）：寒离飒蓄意轰拳·吸血 hlsVamp —— modules/27elite-mingjiao-hanlisa.js L262-279
        //   vamp = Math.min(Math.floor(totalDealt / vampDiv), Math.max(0, hls.maxHp - hls.hp))（吸血=总伤害1/3、封顶缺失生命）；
        //   L268 推 ROUND_STAT_GRANT 声明（field:'hp', delta:vamp, reason:'蓄意轰拳·吸血'，走 core/16 applyStatChange
        //   治疗语义、吃截脉打折）；L269 recordHpAudit(hls,'hlsVamp',vamp,'蓄意轰拳吸血') 纯记账实际侧。
        //   声明侧读同处 L277 SKILL_ANNOUNCE 的 hlsBurst 载荷（{seq, apexUid, aim, taken, hits, flight, bounces, vamp}
        //   ——为回放/从机设计的可序列化桥，render/38→39 同读它；apexUid=吸血受益者即寒离飒本人）。
        //   ⚠ 声明值是施用前（截脉打折在 core/16 应用器内）⇒ 若样本出现「轰拳时挂着截脉」，会现 applied<declared 的
        //   真实偏差——那不是 bug 是外部 modifier 效应，契约如实呈现（供定位，不静音）。
        id: 'HLS_VAMP',
        label: '蓄意轰拳吸血',
        group: 'hlsVamp',
        dir: +1,
        extract(stepLog) {
            const out = [];
            const scan = (f) => {
                if (!f || !f.data || f.factType !== FACT_TYPES.SKILL_ANNOUNCE) return;
                const d = f.data;
                const b = d.hlsBurst;
                if (!b || typeof b.vamp !== 'number' || b.vamp <= 0) return;
                if (b.apexUid == null) return;
                out.push({ unit: d.unitName || null, uid: b.apexUid, stat: 'hp', amount: b.vamp });
            };
            for (const f of stepLog || []) {
                scan(f);
                if (f && f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (f && Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        // 第 106 轮（静态对账+人工复核）：寒离飒蓄意轰拳·真伤 hlsBurstDmg —— modules/27 L204-213 每命中目标
        //   dmg=Math.floor(N/cell.den)（真伤不吃防不吃闪避），原只推 ROUND_STAT_GRANT 声明、经 applyStatChange
        //   只落单位级 dmgDealt/dmgTaken、**无按机制 group** ⇒ 数值网归不了因，且 scan-groups 因无 group 看不见
        //   （第 105 轮闭环 hlsVamp 后人工复核同技能其他数值时发现）。主代码 V2.1.1 同处补
        //   recordHpAudit(u,'hlsBurstDmg',-dmg,'蓄意轰拳·真伤')（纯记账，零逻辑副作用）。
        //   声明侧读同处 L277 SKILL_ANNOUNCE 的 hlsBurst.hits（[{uid,pos,dmg,tier}]，回放桥同源）；
        //   dir=-1（声明 dmg 为正、hp 下降，镜像 XUAN_MING_DOT）。⚠ 天上无敌（小昭飞天）挡掉的血不计入实际
        //   （applyStatChange L199 提前 return、recordHpAudit 不执行）⇒ 若样本出现该叠加会现 declared>applied，
        //   那是免疫效应、契约如实呈现（当前样本无此叠加，已在注释留档）。
        id: 'HLS_BURST_DMG',
        label: '蓄意轰拳真伤',
        group: 'hlsBurstDmg',
        dir: -1,
        extract(stepLog) {
            const out = [];
            const scan = (f) => {
                if (!f || !f.data || f.factType !== FACT_TYPES.SKILL_ANNOUNCE) return;
                const d = f.data;
                const b = d.hlsBurst;
                if (!b || !Array.isArray(b.hits)) return;
                for (const h of b.hits) {
                    if (h && typeof h.dmg === 'number' && h.dmg > 0 && h.uid != null) {
                        out.push({ unit: null, uid: h.uid, stat: 'hp', amount: h.dmg });
                    }
                }
            };
            for (const f of stepLog || []) {
                scan(f);
                if (f && f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (f && Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        id: 'PHANTOM_DISGUISE_HEAL',
        label: '成昆幻影伪装治疗',
        group: 'phantomDisguiseHeal',
        dir: +1,
        extract(stepLog) {
            const out = [];
            const scan = (e) => {
                if (!e || !e.data) return;
                if (e.factType && e.factType !== FACT_TYPES.PHANTOM_DISGUISE_HEAL) return;
                const d = e.data;
                if (typeof d.heal === 'number' && d.unitUid != null && typeof d.unitName === 'string') {
                    out.push({ unit: d.unitName, uid: d.unitUid, stat: 'hp', amount: d.heal });
                }
            };
            for (const f of stepLog || []) {
                if (!f) continue;
                scan(f);
                if (f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        // 第 80 轮（HP 类扩展第三批 · 战斗内即时治疗三连）：三条均 dir:+1、group 隔离、fact 带 unitUid（uid 精确归因）。
        //   三处 fact 与主代码已落地的 recordHpAudit 记账条目都在**同一 handler、同一变量**发射 ⇒ 同一步，可走严格判据；
        //   （旧：缺账本条目时为警告态：声明>0、gd=null → 跳过比对非假绿；主代码已补 recordHpAudit ⇒ 严格态。）
        id: 'BLOOD_THIRST_LEECH',
        label: '嗜血狂刀吸血',
        group: 'bloodthirstLeech',
        dir: +1,
        // emit（core/04 submitBloodthirstDeclaration L106/L117 两条分支）：{ factType:BLOOD_THIRST_LEECH,
        //   data:{ unitName, leechVal, isBrother, unitUid } }；leechVal = Math.floor(dmg * C.BUFFS.bloodthirst.leechRatio)。
        //   记账（主代码已落地）：两条分支 push 声明后各走 recordHpAudit(unit,'bloodthirstLeech',leechVal,'嗜血狂刀')
        //   ——纯记账（core/13 recordHpAudit → unit._audit.hp；真实吸血仍由 EFFECT_TYPES.LEECH 结算负责）。
        //   extract 加 >0 守卫：leechVal 可算出 0（dmg=1 时 floor(0.8)=0，主代码该分支无 >0 守卫），跳过防「声明 0」假报。
        extract(stepLog) {
            const out = [];
            const scan = (e) => {
                if (!e || !e.data) return;
                if (e.factType && e.factType !== FACT_TYPES.BLOOD_THIRST_LEECH) return;
                const d = e.data;
                if (typeof d.leechVal === 'number' && d.leechVal > 0 && d.unitUid != null && typeof d.unitName === 'string') {
                    out.push({ unit: d.unitName, uid: d.unitUid, stat: 'hp', amount: d.leechVal });
                }
            };
            for (const f of stepLog || []) {
                if (!f) continue;
                scan(f);
                if (f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        id: 'HOT_BLOOD_HEAL',
        label: '热血奋战回血',
        group: 'hotBloodHeal',
        dir: +1,
        // emit（core/04 submitHotBloodDeclaration L146-149）：{ factType:HOT_BLOOD_HEAL,
        //   data:{ unitName, leech, tag, isBrother, unitUid } }；leech = Math.min(floor((maxHp-hp)*ratio), maxHp-hp)，声明侧已 clamp。
        //   记账（主代码已落地）：push 声明后走 recordHpAudit(unit,'hotBloodHeal',leech,'热血奋战')
        //   ——纯记账（core/13 recordHpAudit → unit._audit.hp；真实治疗仍由 EFFECT_TYPES.HEAL 结算负责）。
        //   buff 门控（hotBlood，tickAndPickBuffs 确定性轮转选入）——样本覆盖不足时零触发按两级守卫处理。
        extract(stepLog) {
            const out = [];
            const scan = (e) => {
                if (!e || !e.data) return;
                if (e.factType && e.factType !== FACT_TYPES.HOT_BLOOD_HEAL) return;
                const d = e.data;
                if (typeof d.leech === 'number' && d.leech > 0 && d.unitUid != null && typeof d.unitName === 'string') {
                    out.push({ unit: d.unitName, uid: d.unitUid, stat: 'hp', amount: d.leech });
                }
            };
            for (const f of stepLog || []) {
                if (!f) continue;
                scan(f);
                if (f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        id: 'FLYER_REGEN',
        label: '飞行再生',
        group: 'flyerRegen',
        dir: +1,
        // emit（core/04 onUnitDeathFlyerRegen L272-279 循环）：{ factType:FLYER_REGEN,
        //   data:{ unitName, unitUid, heal, deadCount } }；heal = u.hp - before = **实际落地值**（applyStatChange 已被
        //   maxHp 上限截断后的真增量，非 gain 意图值）——记账条目取同一表达式，保证「声明 vs 实际」精确相等。
        //   记账（主代码已落地）：log.push 的 if 块内走 recordHpAudit(u,'flyerRegen',u.hp - before,'飞行再生')
        //   ——纯记账（core/13 recordHpAudit → unit._audit.hp；真实治疗仍由 applyStatChange 负责）。
        //   触发条件宽（任一非马单位阵亡 + 场上存活飞行）——stage 3/4 宋青书、stage 5 鹤笔翁、精英 韦一笑/小昭等均可触发。
        extract(stepLog) {
            const out = [];
            const scan = (e) => {
                if (!e || !e.data) return;
                if (e.factType && e.factType !== FACT_TYPES.FLYER_REGEN) return;
                const d = e.data;
                if (typeof d.heal === 'number' && d.heal > 0 && d.unitUid != null && typeof d.unitName === 'string') {
                    out.push({ unit: d.unitName, uid: d.unitUid, stat: 'hp', amount: d.heal });
                }
            };
            for (const f of stepLog || []) {
                if (!f) continue;
                scan(f);
                if (f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        // 第 88 轮：飞天落地回血（小昭·妹 spiderReturn，modules/20elite-skills.js L188-198）——
        //   --scan-groups 盲区扫地：group 'spiderLandHeal' 33 条 hp 词条无契约盯（"落地回血改错数值也查不出"）。
        //   emit 点：applyStatChange(unit,'hp',heal) 只发 eventBus 事件**不产 fact**（core/13 L222-230 无 log.push），
        //   同函数的 SPIDER_RETURN fact 又只带 pos ⇒ 声明侧无数值 ⇒ 纯 test-side 路线证死，走载荷转交：
        //   主代码把 landHeal 提前算好写进 SPIDER_RETURN fact data（转交块见矩阵第 88 轮节）。
        //   记账（recordHpAudit，主代码 V7.6.19 由 _mods 迁出）已在（注释"供数值对照器"）⇒ 转交只是把**同一 heal 值**
        //   补进 fact，零游戏逻辑副作用。
        //   dir=+1；>0 守卫（孵化落地/满血/比率为 0 时 landHeal=0，与记账同条件不落账）。
        //   fact 与记账同函数同 step（同在 spiderReturn 一步内）⇒ 干净树 sum===actual 恒等，严格安全。
        id: 'SPIDER_LAND_HEAL',
        label: '飞天落地回血',
        group: 'spiderLandHeal',
        dir: +1,
        extract(stepLog) {
            const out = [];
            const scan = (e) => {
                if (!e || !e.data || e.factType !== FACT_TYPES.SPIDER_RETURN) return;
                const d = e.data;
                if (d.spiderUid != null && typeof d.landHeal === 'number' && d.landHeal > 0) {
                    out.push({ unit: d.unitName || null, uid: d.spiderUid, stat: 'hp', amount: d.landHeal });
                }
            };
            for (const f of stepLog || []) {
                if (!f) continue;
                scan(f);
                if (f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        // 第 88 轮：蜘蛛卵结茧属性（小昭·妹 toSpiderEgg，modules/27elite-mingjiao.js L566-576）——
        //   --scan-groups 盲区扫地：group 'spiderEgg' 4 条 atk/def 词条无契约盯（毒/反伤致死档结茧，
        //   "卵属性写错也查不出"）。emit 点：SKILL_ANNOUNCE note 只有文本「0 攻 / eggDef 防」（最终值、非增量，
        //   且 atk 实际增量 = eggModValue 逆算值，依赖当前 atk/乘法词条，无法从文本推 declared delta）⇒
        //   纯 test-side 路线证死，走载荷转交：announce fact data 补 eggAtkDelta/eggDefDelta 两个数值字段
        //   （与 addMod 用同一局部变量，转交块见矩阵第 88 轮节；记账 addMod 已在 L571-572）。
        //   dir=+1 + allowNeg：atk 归零声明为负、def 可升可降，两侧均带真实符号逐字比对（mirror STAT_CHANGE 降防形态）。
        //   ⚠️ 孵化/打碎时 removeModsByGroup('spiderEgg')（L587 / core/04 L330）发生在**无声明条目**的步
        //   （announce 是「蜘蛛孵化」另一 skillName）⇒ 移除步不进比对，不会假偏差。
        id: 'SPIDER_EGG',
        label: '蜘蛛卵结茧属性',
        group: 'spiderEgg',
        dir: +1,
        allowNeg: true,
        extract(stepLog) {
            const out = [];
            const scan = (f) => {
                if (!f || !f.data || f.factType !== FACT_TYPES.SKILL_ANNOUNCE) return;
                const d = f.data;
                if (d.skillName !== '蜘蛛卵') return;
                if (typeof d.unitName !== 'string' || d.unitUid == null) return;
                if (typeof d.eggAtkDelta === 'number' && d.eggAtkDelta !== 0) out.push({ unit: d.unitName, uid: d.unitUid, stat: 'atk', amount: d.eggAtkDelta });
                if (typeof d.eggDefDelta === 'number' && d.eggDefDelta !== 0) out.push({ unit: d.unitName, uid: d.unitUid, stat: 'def', amount: d.eggDefDelta });
            };
            for (const f of stepLog || []) {
                scan(f);
                if (f && f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (f && Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        // 第 94 轮：胖远桥出手蓄力改版（老板拍板，主代码 a6ab497）——每次出手**命中后**自身回血
        //   min(healPerAttack, maxHp-hp)（modules/26elite-sixsects-pangyuanqiao.js AFTER_DAMAGE_APPLIED →
        //   通用 HEAL 声明 → core/10 落 ATTACK 组 data.entries）。scan-groups 扫地揪出的新盲区：零契约盯。
        //   声明侧：HEAL entry 的 data.label==='蓄力回复' 带 data.heal 数值（core/10 只加 isHealEntry/
        //   healAmount/healUnitUid 不剥 data ⇒ 结构化可读，不走文本解析；label 区分胖远桥——通用 HEAL
        //   通道多机制共用，靠本组件写死的 label 字段归属）。
        //   实际侧：emit 处需补 recordHpAudit(pang,'pangHitHeal',healed,'蓄力回复')（九阳先例 core/15
        //   L248 同款；healed 为截断后实际值，记账取同一表达式）——未转交前账本空 ⇒ 零触发警告态
        //   （转交块见矩阵第 94 轮节）。
        //   归因用 uid（胖远桥唯一，统一 uid 口径）。
        id: 'PANG_HIT_HEAL',
        label: '胖远桥命中蓄力回血',
        group: 'pangHitHeal',
        dir: +1,
        extract(stepLog) {
            const out = [];
            const scan = (f) => {
                if (!f || !f.data || f.factType !== FACT_TYPES.HEAL) return;
                const d = f.data;
                if (d.label !== '蓄力回复') return;
                if (typeof d.heal !== 'number' || d.heal <= 0) return;
                if (d.unitUid == null) return;
                out.push({ unit: null, uid: d.unitUid, stat: 'hp', amount: d.heal });
            };
            for (const f of stepLog || []) {
                scan(f);
                if (f && f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (f && Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        // 第 97 轮（2026-10-17）重加：唐文亮回春术（HUI_CHUN）——该契约 10-16 登记后被并行会话
        //   旧版 stat-decl（VER 回退 V3.3.1）覆盖丢失，本轮 scan-groups 揪出后重补。形态同 PANG_HIT_HEAL：
        //   通用 HEAL 通道、label 区分归属（胖远桥'蓄力回复'/本处'回春术'）、零转交即严格。
        id: 'HUI_CHUN',
        label: '唐文亮回春术回复',
        group: 'huiChun',
        dir: +1,
        extract(stepLog) {
            const out = [];
            const scan = (f) => {
                if (!f || !f.data || f.factType !== FACT_TYPES.HEAL) return;
                const d = f.data;
                if (d.label !== '回春术') return;
                if (typeof d.heal !== 'number' || d.heal <= 0) return;
                if (d.unitUid == null) return;
                out.push({ unit: null, uid: d.unitUid, stat: 'hp', amount: d.heal });
            };
            for (const f of stepLog || []) {
                scan(f);
                if (f && f.data && Array.isArray(f.data.entries)) for (const e of f.data.entries) scan(e);
                if (f && Array.isArray(f.entries)) for (const e of f.entries) scan(e);
            }
            return out;
        }
    },
    {
        // 第 97 轮（2026-10-17）盲区清扫：殷天正鹰王威压（yingWangWeiYa）——每次鹰爪功反击命中后
        //   永久削目标攻/防各 atkDown/defDown（content 现 3/3，可无限叠加）。声明侧在攻击组内 info 文本
        //   （pushInfo：「🦅 殷天正鹰王威压：{目标} 攻 −3、防 −3（永久累积）」）——文本解析式可观测
        //   （数值与单位名都在文本里，同 T1/146 文本通道先例）。归因走同名歧义守卫（countName≠1 跳过）。
        id: 'YING_WANG_WEI_YA',
        label: '殷天正鹰王威压削敌',
        group: 'yingWangWeiYa',
        dir: -1,
        allowNeg: true,
        extract(stepLog) {
            const out = [];
            const scanText = (t) => {
                const m = t.match(/殷天正鹰王威压：(.+?) 攻 −(\d+)、防 −(\d+)/);
                if (!m) return;
                out.push({ unit: m[1], stat: 'atk', amount: Number(m[2]) });
                out.push({ unit: m[1], stat: 'def', amount: Number(m[3]) });
            };
            const scan = (e) => {
                if (!e) return;
                if (e.type === 'info' && typeof e.text === 'string' && e.text.indexOf('鹰王威压') !== -1) scanText(e.text);
                if (e.data && Array.isArray(e.data.entries)) for (const x of e.data.entries) scan(x);
                if (Array.isArray(e.entries)) for (const e2 of e.entries) scan(e2);
            };
            for (const f of stepLog || []) scan(f);
            return out;
        }
    },
    {
        // 第 97 轮（2026-10-17）盲区清扫：殷天正老当益壮（laoDangYiZhuang）——每次鹰爪功反击命中后
        //   自身永久 +攻/防各 atkGain/defGain（content 现 5/5）+ 反击率累计。声明侧同为攻击组内 info 文本
        //   （pushInfo：「💪 殷天正老当益壮：攻 +5、防 +5、反击率 +5%」）——文本解析式。自身单位名固定
        //   取「殷天正」（同名歧义时由引擎侧 countName 守卫跳过，宁漏勿误）。
        id: 'LAO_DANG_YI_ZHUANG',
        label: '殷天正老当益壮成长',
        group: 'laoDangYiZhuang',
        dir: +1,
        extract(stepLog) {
            const out = [];
            const scan = (e) => {
                if (!e) return;
                if (e.type === 'info' && typeof e.text === 'string') {
                    const m = e.text.match(/殷天正老当益壮：攻 \+(\d+)、防 \+(\d+)/);
                    if (m) {
                        out.push({ unit: '殷天正', stat: 'atk', amount: Number(m[1]) });
                        out.push({ unit: '殷天正', stat: 'def', amount: Number(m[2]) });
                    }
                }
                if (e.data && Array.isArray(e.data.entries)) for (const x of e.data.entries) scan(x);
                if (Array.isArray(e.entries)) for (const e2 of e.entries) scan(e2);
            };
            for (const f of stepLog || []) scan(f);
            return out;
        }
    }
];

async function main() {
    const [{ CONFIG, loadGameData }, { SeededRNG }, { createRoundStepper },
           { initBattleTeams }, { getStat }, { CAMP_TYPES, BUFF_TYPES, FACT_TYPES: FT }] = await Promise.all([
        import('../core/01config-5v5-test.js'),
        import('../infra/51-core-utils.js'),
        import('../core/11battle-round.js'),
        import('../modules/29battle-init.js'),
        import('../core/13battle-shared.js'),
        import('../infra/56-battle-enums.js')
    ]);

    // carry 候选判据与主代码同口径：直接复用 modules/28buff-tools.js 的 hasCarryTarget
    //   （「carry 位」5 号；小昭·姊在场放宽 4/5/6；无 carry 位则 carry 不进候选）。
    const { hasCarryTarget } = await import('../modules/28buff-tools.js');

    // 团队 Buff 注入 —— 必须有它，否则 buff 门控机制（carry/流星赶月/乘风突袭…）一场都跑不到。
    // 复刻自 tests/rules-replay.mjs L113-143 的 tickAndPickBuffs（该函数是回放器本地函数、不可导入；
    // rules-replay.mjs 属他人并行维护，不改它）。口径一致：seed/round 确定性轮转，**不消耗战斗 RNG**，
    // 故不改变战斗随机序列、可复现。首版漏了这段 → CARRY_APPLY 契约 18 场零触发（假绿），已修。
    const tickAndPickBuffs = (activeBuffs, ally, enemy, round, seed, pickNew) => {
        var next = (activeBuffs || []).map(function (b) { return { ...b, remaining: b.remaining - 1 }; })
            .filter(function (b) { return b.remaining > 0; });
        if (!pickNew) return next;
        var turn = Math.floor(round / 3);
        var sides = [{ camp: CAMP_TYPES.ALLY, team: ally, off: 0 }, { camp: CAMP_TYPES.ENEMY, team: enemy, off: 1 }];
        for (var i = 0; i < sides.length; i++) {
            var s = sides[i];
            var mine = next.filter(function (b) { return (b.target || CAMP_TYPES.ALLY) === s.camp; });
            var existing = mine.map(function (b) { return b.key; });
            var alive = (s.team || []).filter(function (u) { return u && u.alive; });
            var avail = Object.keys(CONFIG.BUFFS).sort().filter(function (k) {
                if (existing.indexOf(k) !== -1) return false;
                if (k === BUFF_TYPES.CARRY && !hasCarryTarget(s.team)) return false;
                var req = CONFIG.BUFF_ROLE_REQUIREMENTS ? CONFIG.BUFF_ROLE_REQUIREMENTS[k] : null;
                if (req && !alive.some(function (u) { return u.role === req; })) return false;
                return true;
            });
            if (!avail.length) continue;
            var pick = avail[(seed + turn + s.off) % avail.length];
            var def = CONFIG.BUFFS[pick] || {};
            var nb = { key: pick, target: s.camp, remaining: def.duration || CONFIG.BUFF_DURATION || 4, name: def.name || pick };
            if (pick === BUFF_TYPES.HOLY_FLAME) {
                var c1 = ((seed + round + s.off) % 3) + 1, c2 = ((seed + round * 3 + s.off) % 3) + 1;
                nb.cols = c1 === c2 ? [c1, (c1 % 3) + 1] : [c1, c2].sort(function (a, b) { return a - b; });
                nb.rows = [((seed * 2 + round + s.off) % 3) + 1, ((seed * 3 + round + s.off) % 3) + 1].sort(function (a, b) { return a - b; });
            }
            next.push(nb);
        }
        return next;
    };
    await import('../modules/25elite-imperial.js');
    await import('../modules/26elite-sixsects.js');
    await import('../modules/27elite-mingjiao.js');
    // 第 56 轮：装配口径对齐 —— dotTick/damageReflect 靠modules/30 **模块顶层副作用**注册进 core/18
    //   （不是export函数，是 import 即注册）。漏 import ⇒ core/18 无该处理器 ⇒ core/15 安装期校验
    //   对鹿杖客 dotTick 直接抛错「未知顶层机制 type "dotTick"」⇒ 对照器开局即崩。
    //   tools/101、115、116 均已补（116 注释明写"不 import 则第 5 关 worker 全灭"），体检三个入口此前漏了。
    await import('../modules/30custom-effects.js');
    await loadGameData();
    FACT_TYPES = FT; // 供顶层契约 extract 的 factType 守卫使用

    const MAX_ROUND = CONFIG.MAX_ROUND || 35;

    // 属性指纹（--fingerprint 模式用）：FNV-1a 32 位，逐步把全体单位的 uid+四属性拼进 hash。
    let fp = 0x811c9dc5 >>> 0;
    const fpBuf = (s) => { for (let i = 0; i < s.length; i++) { fp = (fp ^ s.charCodeAt(i)) >>> 0; fp = Math.imul(fp, 0x01000193) >>> 0; } };

    // 逐步快照：uid -> { uid, name, atk, def, maxHp, hp }（真实属性，与引擎同源 getStat）
    const snapStats = (units) => {
        const m = new Map();
        for (const u of units || []) {
            if (!u) continue;
            m.set(u.uid, {
                uid: u.uid,
                name: u.name,
                atk: Math.floor(getStat(u, 'atk')),
                def: Math.floor(getStat(u, 'def')),
                maxHp: Math.floor(getStat(u, 'maxHp')),
                hp: Math.round(u.hp)
            });
        }
        return m;
    };
    const byName = (m, name) => {
        for (const v of m.values()) if (v.name === name) return v;
        return null;
    };
    // 同名计数：多个单位可能同名（召唤物「雄狮」实测同时 3 只，modules/27 每回合可再召唤）。
    //   战报/fact 只带显示名、**不带 uid**，故同名 ≠1 时无法把声明归因到具体个体 ——
    //   首版按名字取首个命中，把不同雄狮当成同一个体比对，得出"实际增量 0"的**假结论**（第 34 轮）。
    //   → 同名 ≠1 一律跳过，并**计数上报**（静默跳过会变成新的假绿）。
    const countName = (m, name) => {
        let n = 0;
        for (const v of m.values()) if (v.name === name) n++;
        return n;
    };

    // ============ 账本模式（第 45 轮）============
    // 为什么要有它：净增量模型只能看到「这一步某属性**总共**变了多少」，于是一遇到
    //   ① 多个机制同时改同一属性（def 被坚盾/八卦阵/苦练/破防同时动）
    //   ② 乘法类词条（张三丰「严阵以待」op:'mul' value:0.5，def = 加和 × 乘数）
    // 就分不清「这一份是不是本机制加的」，只能跳过 —— 8 个机制因此成了盲区。
    //
    // 突破口：引擎自己就有完整账本 —— `unit._mods[stat]` 里逐条存着每次修改的
    //   { source, group, value, op, ttl }（core/13 L295 addMod 只 push 不去重）。
    //   getStat 就是把它累加出来的：(base + Σadd) × (1 + Σmul)。
    //   hp 的审计记账已迁到 `unit._audit.hp`（主代码 V7.6.19 / 2de9895，防污染属性容器；
    //   2026-10-15 第 90 轮本对照器读点同步，见 snapLedger 内注释）。
    //   且 clone() 复制数组但**共享元素引用**（core/02 L127-130；_audit 由 core/02 L151 显式浅拷），
    //   → 逐步对账本做「按引用」的差集，就能精确知道这一步**哪些机制加了什么、哪些到期了**。
    //   这等价于此前认为必须改主代码才能拿到的「按 group 归集增量」（Tier2），
    //   **而这里一行主代码都不用改** —— 第 44 轮把 Tier2 列为主代码需求是判断错误，已撤回。
    const LEDGER_STATS = ['atk', 'def', 'maxHp', 'hp'];
    const snapLedger = (units) => {
        const m = new Map();
        for (const u of units || []) {
            if (!u) continue;
            const per = {};
            for (const st of LEDGER_STATS) {
                // 2026-10-15 第 90 轮：hp 审计记账已由主代码迁出 _mods → unit._audit.hp
                //   （core/13 recordHpAudit，主代码 V7.6.19 / 2de9895；core/02 clone 显式浅拷
                //   _audit、元素引用共享 ⇒ 按引用差集语义不变）。迁移前本函数只读 _mods，
                //   导致 17 条 hp 类契约集体"账本空"降级警告态（声明一大堆、实际读不到）。
                //   hp 现读 _audit.hp 并与 _mods.hp 合并：防迁移过渡期双写漏读；两条写入路径
                //   （recordHpAudit / addMod）对象不同，不会重复计数。atk/def/maxHp 仍是
                //   _mods 真词条（getStat 消费），不变。
                const arr = st === 'hp'
                    ? [...((u._audit && u._audit.hp) || []), ...((u._mods && u._mods[st]) || [])]
                    : ((u._mods && u._mods[st]) || []);
                const mm = new Map();
                for (const mod of arr) if (mod) mm.set(mod, mod); // 元素引用作 key
                per[st] = mm;
            }
            m.set(u.uid, per);
        }
        return m;
    };
    // 返回该步该属性的新增/移除词条（按引用差集）
    const diffLedger = (prevLed, afterLed, uid, stat) => {
        const p = prevLed.get(uid), a = afterLed.get(uid);
        const added = [], removed = [];
        if (!p || !a) return null;             // 该单位在某一步不在场（召唤/阵亡）→ 账本不可用
        const pm = p[stat], am = a[stat];
        if (!pm || !am) return null;
        for (const [ref, mod] of am) if (!pm.has(ref)) added.push(mod);
        for (const [ref, mod] of pm) if (!am.has(ref)) removed.push(mod);
        return { added, removed };
    };
    // 取某个 group 在这一步对某属性的**净贡献**（新增 - 到期移除；只算加法类，乘法单独走 mulSum）
    // 第 54 轮：加 mulSum —— 乘法词条（圣火令 holyFlame op:'mul'）共享 getStat 的 (1+mulSum) 乘区，
    //   没有"加法增量"可言，旧口径只标 mulTouched 不返回值 ⇒ 无法比对。现把本步该 group 的 mul value
    //   累加进 mulSum，乘法契约（c.mul）声明的 ratio 即与 mulSum 对齐。
    const groupDelta = (diff, group) => {
        if (!diff) return null;
        let sum = 0, mulSum = 0, touched = false, mulTouched = false, roundTouched = false;
        for (const m of diff.added) {
            if (m.group !== group) continue;
            touched = true;
            if (m.op === 'mul') { mulTouched = true; mulSum += (Number(m.value) || 0); }
            else if (m.ttl === 'round') { roundTouched = true; sum += (Number(m.value) || 0); }
            else sum += (Number(m.value) || 0);
        }
        for (const m of diff.removed) {
            if (m.group !== group) continue;
            touched = true;
            if (m.op === 'mul') { mulTouched = true; }
            // 主代码 ② 口径（2026-10-02）：ttl:'round' 词条每回合"到期 + 同值续加"跨在相邻步，
            //   旧口径把续期算成净 -V，与 fact 声明的稳态 +V 错位 → 198 处假阳性（实为跨步时序，非数值 bug）。
            //   续期不参与净贡献相减：round 词条的稳态贡献只取"当前生效(added)"条目，移除(到期)忽略。
            //   （仅 carry 走 op:'add'+ttl:round；fortify/holyFlame 是 op:'mul' 已由上方 mulTouched 处理，不受影响。）
            else if (m.ttl === 'round') { roundTouched = true; }
            else sum -= (Number(m.value) || 0);
        }
        return touched ? { sum, mulSum, mulTouched, roundTouched } : null;
    };

    const FP = process.argv.includes('--fingerprint');
    const SCAN = process.argv.includes('--scan-groups');
    const rawArgs = process.argv.slice(2).filter(a => a !== '--fingerprint' && a !== '--scan-groups');
    const verbose = rawArgs.length > 0;

    // ============ --scan-groups：账本 group 覆盖扫描（第 48 轮）============
    //   直面「体检是不是太水」这个质疑：把全场真实出现过的账本 group **全枚举**出来
    //   （hp 走 _audit.hp、atk/def/maxHp 走 _mods，见 snapLedger），
    //   再与 CONTRACTS 绑定的 group 做差集 ⇒ 差集就是「改了属性、但体检一条契约都没盯」的真盲区。
    //   比凭印象列机制可靠得多：账本是引擎自己写的事实，既不会漏也不会多。
    const groupSeen = new Map();   // group -> { stats:Set, sources:Set, n }
    const seenModRefs = new Set(); // 去重：同一个词条在多个步反复出现只算一条
    const recordGroups = (led) => {
        for (const per of led.values()) {
            for (const st of LEDGER_STATS) {
                const mm = per && per[st];
                if (!mm) continue;
                for (const mod of mm.values()) {
                    if (!mod || seenModRefs.has(mod)) continue;
                    seenModRefs.add(mod);
                    const g = mod.group || '(无group)';
                    let rec = groupSeen.get(g);
                    if (!rec) { rec = { stats: new Set(), sources: new Set(), n: 0 }; groupSeen.set(g, rec); }
                    rec.stats.add(st);
                    if (mod.source) rec.sources.add(mod.source);
                    rec.n++;
                }
            }
        }
    };
    const cases = rawArgs.length > 0
        ? rawArgs.map(s => { const [sd, st] = s.split(':'); return { seed: Number(sd), stage: Number(st) }; })
        : SEEDS.flatMap(seed => STAGES
            .map(stage => ({ seed, stage })));

    const hits = [];
    const stat = {}; // contractId -> { declared, dup }
    // 第 49 轮新增 checked / mismatch：偏差诊断。
    //   checked  = 该契约走了「账本隔离值」（gd 可用）的比对数；净增量兜底的不计入（它本身就不准）。
    //   mismatch = 其中「声明 ≠ 实际」的次数。干净树上恒为 0 的契约 ⇒ 可安全升级为严格判据。
    for (const c of CONTRACTS) stat[c.id] = { declared: 0, dup: 0, ambiguous: 0, checked: 0, mismatch: 0, mismatchEg: '' };

    for (const { seed, stage } of cases) {
        const rng = new SeededRNG(seed);
        const { allyTeam, enemyTeam } = initBattleTeams(stage, rng);
        let battleState = {
            ally: allyTeam.map(u => u.clone()),
            enemy: enemyTeam.map(u => u.clone()),
            round: 1,
            activeBuffs: tickAndPickBuffs([], allyTeam, enemyTeam, 1, seed, true),
            allAllies: allyTeam.map(u => u.clone()),
            _rng: rng
        };
        let prev = snapStats([...battleState.ally, ...battleState.enemy]);
        let prevLed = snapLedger([...battleState.ally, ...battleState.enemy]);
        recordGroups(prevLed); // V2.9.0：默认模式也记录账本 group，供零触发两级判定（绑定 group 到底出没出现）
        let winner = null;

        while (battleState.round <= MAX_ROUND) {
            const stepper = createRoundStepper(battleState);
            let lastStep = null;
            for (const step of stepper) {
                lastStep = step;
                const after = snapStats([...(step.ally || []), ...(step.enemy || [])]);
                const afterLed = snapLedger([...(step.ally || []), ...(step.enemy || [])]);
                recordGroups(afterLed); // V2.9.0：默认模式也记录（同上）
                if (FP) {
                    const parts = [];
                    for (const v of after.values()) parts.push(`${v.uid}:${v.atk},${v.def},${v.maxHp},${v.hp}`);
                    fpBuf(parts.sort().join('|'));
                }

                for (const c of CONTRACTS) {
                    // 同一步可能对同一目标发多条声明（连击/性奋额外攻击/多段），
                    // 必须按「单位 + 属性」汇总声明量再与总增量比对，否则会把多次合法应用误判成重复应用。
                    const agg = new Map(); // "unit|stat"（有 uid 时用 uid）-> { sum, count }
                    for (const d of c.extract(step.log)) {
                        stat[c.id].declared++;
                        const key = (d.uid ? '#uid:' + d.uid + '#' : d.unit) + '|' + d.stat;
                        const cur = agg.get(key) || { unit: d.unit, uid: d.uid || null, statName: d.stat, sum: 0, count: 0, amounts: [] };
                        cur.sum += d.amount;
                        cur.count += 1;
                        cur.amounts.push(d.amount);
                        agg.set(key, cur);
                    }
                    for (const { unit, uid, statName, sum, count, amounts } of agg.values()) {
                        let p, a;
                        if (uid) {
                            // uid 精确归因（幼狮成长当步改名、场上可有多只同名雄狮，见 LION_GROW 契约注释）
                            p = prev.get(uid);
                            a = after.get(uid);
                            if (!p || !a) continue;
                        } else {
                            // 同名歧义守卫：该名字在场个体数 ≠1 时无从归因，跳过并**计数**（不静默）
                            if (countName(prev, unit) !== 1 || countName(after, unit) !== 1) {
                                stat[c.id].ambiguous++;
                                continue;
                            }
                            p = byName(prev, unit);
                            a = byName(after, unit);
                            if (!p || !a) continue;
                        }
                        // 实际增量（按契约方向折算为"声明应有的正向幅度"）
                        // 第 45 轮：带 group 的契约优先用引擎账本按 group 隔离取该机制**自身**贡献，
                        //   不再受同属性其他来源（坚盾/八卦阵/苦练/破防）或乘法词条（严阵以待 op:'mul'）干扰。
                        //   账本不可得（该步该 group 无贡献 / 单位不在场）→ 退回净增量模型兜底。
                        let actual;
                        let gd = null;
                        if (c.group) {
                            const diff = diffLedger(prevLed, afterLed, p.uid, statName);
                            gd = diff && groupDelta(diff, c.group);
                            // 乘法契约（圣火令）：声明的是乘率 ratio，实际取本步该 group 的 mul 累加值，
                            //   不能用加法 sum（乘区无"增量"语义，sum恒为 0 会全判少加）。
                            if (c.mul) actual = gd ? gd.mulSum * c.dir : 0;
                            // 第 74 轮：group 型契约在「隔离账本不可得」（gd 为 null，即主代码尚未补该 group 的
                            //   _mods 记账条目）时，actual 置 null 跳过比对——绝不回退到净增量兜底。原因：HP 等多来源属性
                            //   净增量不可靠，会触发保守分支「整数倍重复应用」假阳性（如玄冥中毒同一步还夹了回血/伤害）。
                            //   非 group 契约（无隔离需求）维持净增量兜底不变。
                            else actual = gd ? gd.sum * c.dir : (c.group ? null : (a[statName] - p[statName]) * c.dir);
                        } else {
                            actual = (a[statName] - p[statName]) * c.dir;
                        }
                        if (verbose) {
                            console.log(`  [${c.id}] r${battleState.round} ${unit}.${statName} 声明=${sum}(${count}条) 实际=${actual}`);
                        }
                        // 第 49 轮：偏差诊断（只观测、不判定）。账本可用 ⇒ 比对可信，统计 sum!==actual 的次数。
                        //   用途：判断哪些契约在干净树上**恒成立 sum===actual** —— 只有恒等的才能开严格判据，
                        //   否则跨步错位（carry/破防）会立刻炸出假阳性。
                        if (gd && c.group) {
                            stat[c.id].checked++;
                            if (actual !== sum) {
                                stat[c.id].mismatch++;
                                if (!stat[c.id].mismatchEg) {
                                    stat[c.id].mismatchEg = `r${battleState.round} ${unit}.${statName} 声明=${sum} 实际=${actual}`;
                                }
                            }
                        }
                        // 判据（账本模式 + 净增量兜底共用）：实际 > 声明，且恰为声明的整数倍（≥2 倍）⇒ 重复应用。
                        //   账本已隔离同属性其他来源（坚盾/八卦阵/苦练/破防）与乘法词条（严阵以待 op:'mul'），
                        //   故「实际=2×声明」可可靠判定为超应用（如 A2 坚盾翻倍、A5 流星成长翻倍）。
                        //   注：曾试过「声明≠实际即报」精确判定，但 carry(ttl:round)/BREAK_DEF(fact 嵌套在攻击 entries、mod 在不同子步生效) 会跨步错位 → 大量假阳性，已弃用；
                        //       仅保留整数倍判据（保守、零误报）兜「实际>声明」方向（超应用）。
                        // ============ 判据（第 49 轮升级：默认严格、名单例外）============
                        //   旧判据只抓「实际恰为声明的整数倍 ≥2」：某技能手抖多加 1 点（该加 2 实际加 3）
                        //   ⇒ 不是整数倍 ⇒ 一声不吭。而「多加/少加一点点」恰恰是最容易发生的真实 bug 形态。
                        //   第 49 轮用干净树偏差扫描证明只有上述 2 条真有跨步错位，其余 13 条恒等
                        //   ⇒ 对它们可以直接判「声明 ≠ 实际」，覆盖 多加 / 少加 / 完全没加 三种失效形态。
                        const strict = c.group && gd && !LOOSE_IDS.has(c.id);
                        // 严格闸门放开负值：默认只认 sum>0（属性上升类）；allowNeg 契约（如 STAT_CHANGE 的降防）声明为负，
                        //   须用 sum!==0 才能抓「降防被漏加/多加」（否则负值声明被闸门直接跳过 → 假绿）。
                        const declaredNonZero = sum !== 0 && (sum > 0 || c.allowNeg);
                        if (strict) {
                            if (declaredNonZero && actual !== sum) {
                                const kind = actual === 0 ? '完全没加' : (actual > sum ? `多加 ${actual - sum}` : `少加 ${sum - actual}`);
                                stat[c.id].dup++;
                                const msg = `[seed=${seed} stage=${stage} r${battleState.round}] ${c.label} ${unit}.${statName} 声明+${sum}(${count}条) 实际${c.dir > 0 ? '+' : '-'}${actual}（${kind}）`;
                                if (hits.length < 12) hits.push(msg);
                            }
                        } else {
                            // 保守判据（仅跨步错位的两条用）：整数倍超应用 + SAME_STEP 虚报，零误报优先。
                            if (sum > 0 && actual > sum && actual % sum === 0) {
                                const k = actual / sum;
                                stat[c.id].dup++;
                                const msg = `[seed=${seed} stage=${stage} r${battleState.round}] ${c.label} ${unit}.${statName} 声明+${sum}(${count}条) 实际${c.dir > 0 ? '+' : '-'}${actual}（${k}倍）`;
                                if (hits.length < 12) hits.push(msg);
                            }
                            if (SAME_STEP_GROUPS.has(c.group) && gd && sum > 0 && sum > actual) {
                                stat[c.id].dup++;
                                const msg = `[seed=${seed} stage=${stage} r${battleState.round}] ${c.label} ${unit}.${statName} 声明+${sum}(${count}条) > 实际+${actual}（虚报/少加 ${sum - actual}）`;
                                if (hits.length < 12) hits.push(msg);
                            }
                        }
                        // 第 46-48 轮的独立「虚报/少加」分支已并入上方判据：
                        //   严格分支用 `actual !== sum` 天然覆盖该方向，保守分支保留原 SAME_STEP 虚报判断，故此处不再重复。
                        // 「至多一条」契约却出现多条 ⇒ 重复应用。附实际增量证据：
                        //   若实际增量 == count × 单条量，证明属性确实被叠加了 count 份（不是只多打了一条日志）。
                        if (c.expectSingle && count >= 2) {
                            const single = amounts[0];
                            let evidence = '';
                            if (single > 0 && actual % single === 0) {
                                evidence = `，实际增量 ${actual} = ${actual / single} × 单条 ${single}（属性${actual > single ? '确实被叠加' : '未叠加'}）`;
                            } else {
                                evidence = `，实际增量 ${actual}（无法按单条量整除，可能夹了其他来源）`;
                            }
                            stat[c.id].dup++;
                            const msg = `[seed=${seed} stage=${stage} r${battleState.round}] ${c.label} ${unit}.${statName} 同一步出现 ${count} 条声明（应为 1 条）${evidence}`;
                            if (hits.length < 12) hits.push(msg);
                        }
                    }
                }
                prev = after;
                prevLed = afterLed;
                if (step.winner) winner = step.winner;
            }
            if (winner) break;
            if (!lastStep) break;
            battleState = {
                ally: lastStep.ally.map(u => u.clone()),
                enemy: lastStep.enemy.map(u => u.clone()),
                round: battleState.round + 1,
                activeBuffs: tickAndPickBuffs(battleState.activeBuffs, lastStep.ally, lastStep.enemy,
                    battleState.round, seed, battleState.round % 3 === 0),
                allAllies: battleState.allAllies,
                _rng: rng
            };
            prev = snapStats([...battleState.ally, ...battleState.enemy]);
            prevLed = snapLedger([...battleState.ally, ...battleState.enemy]);
        }
        if (verbose) console.log(`seed=${seed} stage=${stage} winner=${winner || '平局'}`);
    }

    if (FP) {
        console.log('FINGERPRINT ' + fp.toString(16));
        process.exit(0);
    }
    if (SCAN) {
        const covered = new Set(CONTRACTS.map(c => c.group).filter(Boolean));
        const rows = [...groupSeen.entries()].sort((a, b) => b[1].n - a[1].n);
        console.log('\n=== 账本 group 覆盖扫描（--scan-groups）===');
        console.log(`本场次真实出现 ${rows.length} 个 group；CONTRACTS 已绑定 ${covered.size} 个\n`);
        console.log('group                         | 词条数 | 属性            |契约| 来源样例');
        console.log('------------------------------|--------|-----------------|----|--------');
        let uncovered = 0;
        const missList = [];
        for (const [g, r] of rows) {
            const has = covered.has(g);
            if (!has) { uncovered++; missList.push(g); }
            const stats = [...r.stats].join(',');
            const src = [...r.sources].slice(0, 2).join('/');
            console.log(`${g.padEnd(30)}| ${String(r.n).padStart(6)} | ${stats.padEnd(15)} | ${has ? ' ✅' : ' ❌'} | ${src}`);
        }
        console.log(`\n❌ 未覆盖 ${uncovered} 个：${missList.join(', ') || '（无）'}`);
        console.log('   ↑ 这些机制真的改了 atk/def/maxHp，但体检一条契约都没盯 —— 把数值写错也查不出。');
        const notAppeared = [...covered].filter(g => !groupSeen.has(g));
        if (notAppeared.length) {
            console.log(`\n⚠️  契约已绑定但本场次未出现（结构性稀有 / 需特定阵容）：${notAppeared.join(', ')}`);
        }
        return;
    }

    console.log('\n=== 数值声明 vs 实际属性增量（逐步真值对照）===');
    let hardFail = false;
    for (const c of CONTRACTS) {
        const s = stat[c.id];
        console.log(`${c.id.padEnd(12)} 声明 ${String(s.declared).padStart(4)} 条 · 命中 ${s.dup} · 歧义跳过 ${s.ambiguous} · 严格比对 ${String(s.checked).padStart(4)} 条 / 偏差 ${s.mismatch}`);
        if (s.mismatch > 0) {
            console.log(`  ⚠ 首次偏差样例：${s.mismatchEg}`);
        }
        // 防假绿：契约一次都没跑到要报，但 V2.9.0 起按账本事实分两级，避免固定样本误红稀有形态：
        //   ① 绑定 group 在本批账本里压根没出现 → 机制没装配 / group 写错 / 字段路径错，契约真空转，硬红
        //      （保住第 40 轮 CARRY_APPLY 因 harness 漏选 buff 全场零触发被当场抓出的牙）；
        //   ② group 已出现、只是该契约 extract 的特定形态没触发（如 BAGUA_DEF 共用 baguaArray，加防形态
        //      默认 40 场不出现、120 场有 59 条声明）→ 样本覆盖不足，警告不红，加大 SEEDS/STAGES 或 --scan-groups 复核。
        //   无 group 的契约无法用账本反证，维持硬红。
        if (s.declared === 0) {
            const gRec = c.group && groupSeen.get(c.group);
            if (c.group && gRec) {
                console.log(`  ⚠ 零触发(样本未覆盖该形态)：${c.id} 在 ${cases.length} 场无声明，但 group「${c.group}」账本已出现 ${gRec.n} 词条——非空转；加大 SEEDS/STAGES 或 --scan-groups 复核`);
            } else {
                console.log(`  ✗ 零触发：${c.id} 在 ${cases.length} 场未产生任何声明，且 group「${c.group || '(无)'}」账本中完全没出现——契约空转（装配/字段路径错误，覆盖度缺口）`);
                hardFail = true;
            }
        }
        // 警告态显式化（2026-10-13 复盘）：声明>0 但严格比对 0 = 主代码账本缺记账条目，比对被跳过——
        //   「偏差 0」是没比对、不是比对通过，与零触发同等易误读，必须点名（不硬红：警告态是记账落地前的合法过渡态）
        if (s.declared > 0 && s.checked === 0) {
            console.log(`  ⚠ 警告态(账本空，非真比对)：${c.id} 有 ${s.declared} 条声明，但 group「${c.group || '(无)'}」账本无对应条目——严格比对 0 条，"偏差 0" 不作数；待主代码补记账`);
        }
    }
    if (hits.length > 0) {
        console.log('命中明细（最多列 12 条）：');
        for (const m of hits) console.log('  ✗ ' + m);
    }
    if (hardFail || CONTRACTS.some(c => stat[c.id].dup > 0)) {
        const total = CONTRACTS.reduce((n, c) => n + stat[c.id].dup, 0);
        console.log(`\n✗ 检出重复应用 ${total} 处${hardFail ? '（另有契约零触发）' : ''}`);
        process.exit(1);
    }
    console.log('\n✅ 全部数值声明的实际属性增量均 == 声明值（无重复应用）');
    process.exit(0);
}

main().catch(e => { console.error('对照器异常：', e); process.exit(1); });
