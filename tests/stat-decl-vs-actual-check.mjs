// V1.0.0 | 2026-09-27 第 34 轮 | 「数值声明 vs 实际属性增量」逐步对照器（通用）
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
//     剩余 韦一笑(WEI_LEECH) / 幼狮成长(LION_GROW) 的 fact 发的是**绝对值/目标值**而非增量
//     （前者 heal+newMaxHp、后者 atk/def/maxHp 是目标值，而 addMod 用的是 tgtAtk-cub.atk 这类增量），
//     当前 extract(stepLog) 接口拿不到单位前后状态 ⇒ 无法直接比对，暂不硬塞（二者现由基线兜底）。
//
// 运行：node tests/stat-decl-vs-actual-check.mjs            → 全量 18 场；有重复应用退出码 1；契约零触发亦退出码 1（防假绿）
//       node tests/stat-decl-vs-actual-check.mjs 18:3       → 只跑指定场次并打印逐步明细
//       node tests/stat-decl-vs-actual-check.mjs --fingerprint
//           → 不跑契约、也不退码 1，只逐步对全体单位的 atk/def/maxHp/hp 做 FNV-1a 指纹并输出 `FINGERPRINT <hex>`。
//             供 `tests/mutation-teeth.mjs` 判定「属性类变异是否真的改变了战斗状态」（属性变了指纹必变；
//             日志/TEXT 类变异只改显示、不改状态，指纹不变）。
export const VER = 'tests/stat-decl-vs-actual-check.mjs V2.3.0';

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
const STAGES = [1, 2, 3, 4];

// dir: +1=声明使该属性上升，-1=声明使该属性下降
// 第 47 轮：以下 group 的 fact 与 addMod 在**同一 handler、用同一变量/同一值**发射，无跨步错位
//   （与 carry(ttl:'round') / BREAK_DEF(fact 嵌套在攻击 entries、mod 在不同子步生效) 不同）
//   ⇒ 干净树必 sum===actual，故可安全开「声明 > 实际」的虚报（少加/多报）校验。
//   新增机制前先确认它满足「同 handler 同值同 step」，否则只保留整数倍（超应用）判据。
const SAME_STEP_GROUPS = new Set(['fortify', 'baguaArray', 'rageOnHit', 'lionInspire', 'kuLian',
    'rangedGrowth', 'zhangSwitch', 'spiderMastery']);

// 第 49 轮：**仅**这两条契约存在跨步错位，必须走保守判据。
//   实测依据（40 局干净树偏差扫描，见下方 checked/mismatch 列）：
//     BREAK_DEF    严格比对 548 条 → 偏差 7   （fact 嵌套在攻击 entries、mod 在不同子步生效）
//     CARRY_APPLY  严格比对 267 条 → 偏差 198 （ttl:'round'，fact 回合开始发、mod 下个攻击步才加）
//   其余 13 条**全部 0 偏差** ⇒ 当年「一刀切保守」是被这 2 条拖累的，误伤了本可严格的 11 条。
//   → 改为「默认严格、名单例外」：新契约自动享受严格判据；若哪天干净树出现假阳性，把它加进来即可。
const LOOSE_IDS = new Set(['BREAK_DEF', 'CARRY_APPLY']);

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
                if (e && e.data && typeof e.data.reduce === 'number' && e.data.targetName) {
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
                if (!f || !f.data) continue;
                const d = f.data;
                // 签名锁定：unitName + 负 atkDelta + 正 defDelta（与莽撞「无 defDelta」、苦练 targets 互斥）
                if (typeof d.unitName === 'string' && typeof d.atkDelta === 'number'
                    && typeof d.defDelta === 'number' && d.atkDelta < 0) {
                    out.push({ unit: d.unitName, stat: 'atk', amount: Math.abs(d.atkDelta) });
                }
            }
            return out;
        }
    },
    {
        id: 'BAGUA_DEF',
        label: '八卦阵·加防',
        group: 'baguaArray',
        dir: +1,
        extract(stepLog) {
            const out = [];
            for (const f of stepLog || []) {
                if (!f || !f.data) continue;
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
    }
];

async function main() {
    const [{ CONFIG, loadGameData }, { SeededRNG }, { createRoundStepper },
           { initBattleTeams }, { getStat }, { CAMP_TYPES, BUFF_TYPES }] = await Promise.all([
        import('../core/01config-5v5-test.js'),
        import('../infra/51-core-utils.js'),
        import('../core/11battle-round.js'),
        import('../modules/29battle-init.js'),
        import('../core/13battle-shared.js'),
        import('../infra/56-battle-enums.js')
    ]);

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
    await loadGameData();

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
    //   且 clone() 复制数组但**共享元素引用**（core/02 L127-130），
    //   → 逐步对 `_mods` 做「按引用」的差集，就能精确知道这一步**哪些机制加了什么、哪些到期了**。
    //   这等价于此前认为必须改主代码才能拿到的「按 group 归集增量」（Tier2），
    //   **而这里一行主代码都不用改** —— 第 44 轮把 Tier2 列为主代码需求是判断错误，已撤回。
    const LEDGER_STATS = ['atk', 'def', 'maxHp'];
    const snapLedger = (units) => {
        const m = new Map();
        for (const u of units || []) {
            if (!u || !u._mods) continue;
            const per = {};
            for (const st of LEDGER_STATS) {
                const arr = u._mods[st] || [];
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
    // 取某个 group 在这一步对某属性的**净贡献**（新增 - 到期移除；只算加法类，乘法不参与累加）
    const groupDelta = (diff, group) => {
        if (!diff) return null;
        let sum = 0, touched = false, mulTouched = false, roundTouched = false;
        for (const m of diff.added) {
            if (m.group !== group) continue;
            touched = true;
            if (m.op === 'mul') mulTouched = true;
            else if (m.ttl === 'round') { roundTouched = true; sum += (Number(m.value) || 0); }
            else sum += (Number(m.value) || 0);
        }
        for (const m of diff.removed) {
            if (m.group !== group) continue;
            touched = true;
            if (m.op === 'mul') mulTouched = true;
            else if (m.ttl === 'round') { roundTouched = true; sum -= (Number(m.value) || 0); }
            else sum -= (Number(m.value) || 0);
        }
        return touched ? { sum, mulTouched, roundTouched } : null;
    };

    const FP = process.argv.includes('--fingerprint');
    const SCAN = process.argv.includes('--scan-groups');
    const rawArgs = process.argv.slice(2).filter(a => a !== '--fingerprint' && a !== '--scan-groups');
    const verbose = rawArgs.length > 0;

    // ============ --scan-groups：账本 group 覆盖扫描（第 48 轮）============
    //   直面「体检是不是太水」这个质疑：把全场真实出现过的 `_mods` group **全枚举**出来，
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
        if (SCAN) recordGroups(prevLed);
        let winner = null;

        while (battleState.round <= MAX_ROUND) {
            const stepper = createRoundStepper(battleState);
            let lastStep = null;
            for (const step of stepper) {
                lastStep = step;
                const after = snapStats([...(step.ally || []), ...(step.enemy || [])]);
                const afterLed = snapLedger([...(step.ally || []), ...(step.enemy || [])]);
                if (SCAN) recordGroups(afterLed);
                if (FP) {
                    const parts = [];
                    for (const v of after.values()) parts.push(`${v.uid}:${v.atk},${v.def},${v.maxHp},${v.hp}`);
                    fpBuf(parts.sort().join('|'));
                }

                for (const c of CONTRACTS) {
                    // 同一步可能对同一目标发多条声明（连击/性奋额外攻击/多段），
                    // 必须按「单位 + 属性」汇总声明量再与总增量比对，否则会把多次合法应用误判成重复应用。
                    const agg = new Map(); // "unit|stat" -> { sum, count }
                    for (const d of c.extract(step.log)) {
                        stat[c.id].declared++;
                        const key = d.unit + '|' + d.stat;
                        const cur = agg.get(key) || { unit: d.unit, statName: d.stat, sum: 0, count: 0, amounts: [] };
                        cur.sum += d.amount;
                        cur.count += 1;
                        cur.amounts.push(d.amount);
                        agg.set(key, cur);
                    }
                    for (const { unit, statName, sum, count, amounts } of agg.values()) {
                        // 同名歧义守卫：该名字在场个体数 ≠1 时无从归因，跳过并**计数**（不静默）
                        if (countName(prev, unit) !== 1 || countName(after, unit) !== 1) {
                            stat[c.id].ambiguous++;
                            continue;
                        }
                        const p = byName(prev, unit);
                        const a = byName(after, unit);
                        if (!p || !a) continue;
                        // 实际增量（按契约方向折算为"声明应有的正向幅度"）
                        // 第 45 轮：带 group 的契约优先用引擎账本按 group 隔离取该机制**自身**贡献，
                        //   不再受同属性其他来源（坚盾/八卦阵/苦练/破防）或乘法词条（严阵以待 op:'mul'）干扰。
                        //   账本不可得（该步该 group 无贡献 / 单位不在场）→ 退回净增量模型兜底。
                        let actual;
                        let gd = null;
                        if (c.group) {
                            const diff = diffLedger(prevLed, afterLed, p.uid, statName);
                            gd = diff && groupDelta(diff, c.group);
                            actual = gd ? gd.sum * c.dir : (a[statName] - p[statName]) * c.dir;
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
                        if (strict) {
                            if (sum > 0 && actual !== sum) {
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
        // 防假绿：某个契约一次都没跑到 = 该契约空转，必须报出来而不是默认"通过"
        if (s.declared === 0) {
            console.log(`  ✗ 零触发：${c.id} 在 18 场未产生任何声明，本契约空转（覆盖度缺口）`);
            hardFail = true;
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
