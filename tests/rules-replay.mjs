// V6.13.0 | 2026-11-08（第 229 轮）回放器补三块 Buff 覆盖（均不涉主代码）：
//   ① 定向场次补「小昭·姊 + 热血奋战/乘风突袭/众志成城」：DIRECTED_CASES 新增 buffs 字段，
//     经 buff-picker 第 8 参 forcePick 强制明教侧选中，并在收尾打印三键的姊强化样本数（0 即判红）。
//   ② buff-picker 的 remaining 不再恒 4，复刻 modules/329 createBuffObject（姊 extraDuration +1 /
//     流星固定 4 / permanent 用 MAX_ROUND），首次挂载即时断言「姊在场必须 base+extra」。
//   ③ 妹妹 _permanentBuffs 每回合补一条 BUFF_SUMMARY（permanent:true，同回合团队摘要已有同 key 则跳过），
//     让 229 能验「永久 buff 整局不消失」——此前该状态只在 unit.state，fact 通道完全看不到。
// V6.12.0 | 2026-11-07 迭代：机制装配由四行手抄清单改走 tests/_lib/install-mechanics.mjs
//   （→ 生产唯一总入口 modules/301-reg-mechanics.js），与其余十几个离线宿主同口径。
//   上游 4230eb9a 增 333/334/335 + content 的 statAbsorb 后，本件仍只装 307/308/317/331，
//   回放开局即抛「未在 core/18 注册」、stdout 全空；夜间第180轮以「补一行 301 import」点修，
//   白天侧统一收口到 helper 并由 mechanics-install-selftest 常驻禁止绕过。零判定口径变化。
// V6.2.0 | 2026-09-25 新增「不变量套件」：hp∈[0,maxHp] / maxHp>0 / pos 唯一 / facts 映射完整，
// 用法：node tests/rules-replay.mjs           （默认 20 个种子 × 1~6 关 = 120 场）
//      SEEDS=1,2,3 STAGES=2,4 node tests/rules-replay.mjs
//      KEYWORDS=新婚|苦练 node tests/rules-replay.mjs   （额外统计战报文本关键字命中数）
//
// 干什么：真跑引擎（core/11 stepper）→ 收集 fact → 走 render/30 渲染成战报条目 → 依次执行
//         tests/health-rules/ 下的全部规则，统计每条规则 pass / fail / skip。
// 为什么要有它：规则靠"本场阵容刚好触发机制"才跑得到，浏览器里跑一趟体检只能看到当轮结果；
//   这里能一次性喂 100+ 场真实战报，用来验证「改规则没改坏」「新规则真跑得起来」以及
//   揪出"恒 skip 的空转规则"（数据源错位、扫不到 entries 子条目这类）。
// 注意：渲染 buff 阵营摘要依赖 GlobalStore.battleStore，本 runner 已按真实流程建 store 并每回合
//       SET_UNITS 同步（否则所有 buff-summary 渲染不出来，会让 140/141 之类的规则假红）。
import { readdir } from 'node:fs/promises';
import { collectFacts } from './_lib/fact-collect.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkWorktreeClean, warnIfDirty } from './_lib/worktree-guard.mjs';

// --- 环境垫片：引擎零 DOM，但 import 链上会碰浏览器 API ---
globalThis.fetch = async (url) => {
    const fs = await import('node:fs');
    const p = fileURLToPath(new URL(url));
    const text = fs.readFileSync(p, 'utf8');
    return { ok: true, json: async () => JSON.parse(text) };
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.self = globalThis;

// --- fact 契约警告收集（V6.4.0）---
// infra/107-fact-contract.js 的 validateFactContract 在缺字段时打 console.error，
// 但回放器此前不收集 → 契约违规只是控制台噪声，五件套全绿也看不到。
// 劫持 console.error 只收 [fact契约] 前缀，按 type|field 去重，计入不变量违规与退出码。
const factContractWarns = new Map(); // key: "type|field" -> count
const _origConsoleError = console.error.bind(console);
console.error = function (...args) {
    _origConsoleError(...args);
    try {
        const first = args[0];
        if (typeof first === 'string' && first.startsWith('[fact契约] ')) {
            const m = first.match(/^\[fact契约\]\s+(\S+)\s+缺字段:\s+(\S+)/);
            const key = m ? (m[1] + '|' + m[2]) : first.slice(0, 80);
            factContractWarns.set(key, (factContractWarns.get(key) || 0) + 1);
        }
    } catch (e) {}
};

// 补 VER（第 21 轮）：此前本文件无 export const VER，tools/118 的版本头对账会漏掉它
// V6.14.0 | 2026-11-08（第 192 轮）新增「观察项」通道：规则可返回 { fail:false, observe:'...' }，
//   汇总到「观察项」段打印，不进 fails 计数、不改退出码。用于「实测拟合、非引擎真值」的软判据
//   （首例：188 同回合多段出手计数口径的段数阈值 6）。既有规则返回值不受影响。
// V6.15.0 | 2026-11-08 D13 回放器上下文透传：initBattleTeams 自 330 V7.7.0 起返回值多带
//   encounterVariant（抽中的关卡变体 id，无变体关为 null）与 rngContractVersion（抽签契约版本）。
//   回放器此前只解构 allyTeam/enemyTeam ⇒ 286「关卡变体抽签真值与阵容互证」拿到的
//   ctx.encounterVariant 恒为 undefined，156 场全部走 skip（结构性假绿）。本轮把两字段原样接入
//   ctx，规则自身与判据一字未改；全库仅 286 消费这两个字段，其它规则口径零变化。
export const VER = 'tests/rules-replay.mjs V6.15.1';
// V6.11.0 | 2026-11-01 夜间第 172 轮：FORCE_KEYS / forcesOfEntry / resetForces 三件套收口至
//   tests/_lib/forced-case-normalize.mjs 唯一来源。★ 本文件原白名单缺 forceXieXun（其在主代码
//   29battle-init L141 / L152 真实存在），此前想喂谢逊系规则会当场抛错而看不出原因；
//   收口后本通道也能用 forceXieXun，两本事实账本也能用 forceWei。★ 零行为变化：
//   forcesOfEntry 仍保留「无键时返 null」的原形态（统一成 {} 须单独拍板），白名单外的键照旧当场抛错。
// V6.9.0 | 2026-10-31 第 160 轮：定向覆盖通道从「只认 forceXiaoZhao」泛化为白名单多键，
//   并新增 4 场 forceWei（韦一笑）定向场次 —— 补的是「判据分支级空转自检」那条挂了几十轮的老红。
//   取证（/tmp 探针，不入库；结论以本文件实测为准）：
//     ① 默认随机阵容 140 场里**我方 0 场有韦一笑**，WEI_LEECH fact 仅 221 条、heal>0 仅 41 条，
//        且 getStat 小数上限观测 0 次 ⇒ 规则 164 判据4（heal>0 ⇒ maxHpDelta===heal）根本没机会成立；
//     ② 加 forceWei 后 140 场**场场有韦一笑**，WEI_LEECH 2004 条、heal>0 1474 条，
//        其中 **77 条 maxHpDelta!==heal**，小数上限观测 1717 次 ⇒ 缺陷**仍在**，是样本被裁不是已修复。
//   ⇒ 按自检给出的第三种处置「样本被裁或数据源错位则修」处理：**补样本**，不收缩基线、不放宽判据。
//   主代码开关依据：modules/330-battle-init.js L140 / L151（forceWei → pushElite(isWei)）。
// V6.8.0 | 2026-10-30 第 159 轮：新增「定向覆盖场次」（DIRECTED_CASES），规则恒空转 3 条 → 0 条。
//   动因：124rule-recipes.js 把四条小昭规则登记成「随机精英，**无法强制**，需连打多局碰出」——
//     这句 know-how 已过期（主代码 29battle-init L245-262 的 forceXiaoZhao 开关一直在）
//     ⇒ 依赖小昭形态的规则在 140 场里 pass=0 fail=0 skip=140，常年白挂。详见 DIRECTED_CASES 处注释。
//   改法：默认 140 场一个不减，在其后**追加** 6 场定向组（brother×2 / sister×4），合计 146 场，
//     沿用与体检对照器 V3.11.0 同一套安全边界（FORCE_KEYS 白名单 + 逐场复位 + 循环末复位）。
//   ★ 补样本而非放宽：未改任何规则判据、未加跳过条件、未动 ANY_DEAD 以外的门槛。
//   实测：三条恒空转规则全部真正执行并**全部通过**（129 飞天免疫 pass=2 / 155 流星成长形态 pass=4 /
//     160 蛛变精通 pass=2）；45 条规则里 fail 增加 0、pass 下降 0。
//   ⚠️ 后续注意：规则一旦被喂到样本就可能炸出真红（此前沉在 skip 里的 bug 浮出来），
//     那是收益不是事故，不许为维绿加豁免；炸出来就走「登记转交 + 人工研判」的正常流程。

const HERE = new URL('.', import.meta.url);
const [{ CONFIG, loadGameData, loadHexEnhanceData, getSisterHexEnhance }, { SeededRNG }, { createRoundStepper }, { initBattleTeams },
    { renderLog }, { createStore, battleReducer }, { createInitialState }, { GlobalStore },
    { STORE_ACTION_TYPES, CAMP_TYPES, BUFF_TYPES, FACT_TYPES },
    { tickAndPickBuffs: _sharedTickAndPickBuffs }] = await Promise.all([
        import('../core/201-config-5v5-test.js'),
        import('../infra/102-core-utils.js'),
        import('../core/210-battle-round.js'),
        import('../modules/330-battle-init.js'),
        import('../render/401-fact-renderer.js'),
        import('../modules/306-battle-store.js'),
        import('../core/218-state-keys.js'),
        import('../infra/104-global-store.js'),
        import('../infra/106-battle-enums.js'),
        import('./_lib/buff-picker.mjs')
    ]);
// carry 候选判据与主代码同口径：直接复用 modules/329-buff-tools.js 的 hasCarryTarget
//   （「carry 位」5 号；小昭·姊在场放宽 4/5/6；无 carry 位则 carry 不进候选）。
const { hasCarryTarget } = await import('../modules/329-buff-tools.js');
// 精英组件需先注册（initBattleTeams 依赖其组件安装）。V6.12.0：统一走 helper，勿再手抄模块清单。
await import('./_lib/install-mechanics.mjs');
// DOM 无关的 hook 运行时错误通道（V6.5.0）：页面端靠 modules/21 劫持 console.error 弹弱面板，
//   node/worker 无 DOM，这里开局清零，跑完读计数——任何监听器抛错都计入退出码，不再被静默吞掉。
const { eventBus } = await import('../infra/101-event-bus.js');
eventBus.resetErrorTracker();
await loadGameData();
// 第 162 轮：上游把小昭.hexEnhance 整段迁到 content/002-hex-enhance.json，启动链必须一并 loadHexEnhanceData（缺口由 tests/hex-boot-chain-guard.mjs 点名）
await loadHexEnhanceData();
// 不变量用：查询某 factType 是否**注册了**渲染器（render/33:72）。
// 注意别用"本次渲染有没有产出"当映射缺口判据 —— buffSummary/mindControlBanner 都有注册渲染器
// （render/35:498/511），只是在无 buff / 无条件时合法地渲染为空（首版据此误报 929 条）。
const { getFactRenderer, allFactRenderers } = await import('../render/406-fact-registry.js');
const { FACT_SPECS } = await import('../infra/107-fact-contract.js');
// 注册一致性（V6.5.0）：render/33 的 validateRegistry 只 console.error、不影响退出码，
//   「死注册」（如 FLYER_REGEN 曾漏登 58）会被五件套漏掉。注册副作用现已完成，对**渲染器层**
//   做一次双向核对：① 58 声明 renderFn 但 33 没人注册（声明了不实现）；② 注册了但 58 无 spec（死注册）。
//   spec.renderFn===null 是契约明示「数值声明 fact，无渲染」（58:145），两个方向都不报。
//   不核 translator 层：全库无任何 registerFactTranslator 调用、getFactTranslator 也无消费方，
//   翻译层是尚未开建的预留架构（58 里的 translateFn 全是规划名），核了必然恒红 53 条，无意义。
const registryProblems = new Set();
{
    const _renderers = allFactRenderers();
    for (const [type, spec] of Object.entries(FACT_SPECS)) {
        if (spec.renderFn && !_renderers.has(type)) registryProblems.add(`[注册] ${type} 58 声明 ${spec.renderFn} 但 33 未注册渲染器`);
    }
    for (const t of _renderers.keys()) if (!FACT_SPECS[t]) registryProblems.add(`[注册] renderer ${t} 已注册但 58 未声明（死注册）`);
}
// 不变量单一真值源：血量类不变量的唯一实现在 122 的 checkUnitHpValidity（含「maxHp 相对
// _baseMaxHp 膨胀」判据与 isWei 豁免）。回放侧直接复用，不再另写一份 —— 两处各写一份等于
// 同一批单位在浏览器体检和回放里跑出两套结论（第 21 轮统一）。
const { checkUnitHpValidity, checkActionRights } = await import('./122health-utils.js');

// 自动装载 health-rules 下全部规则（文件名序 = 编号序），新增规则无需改本文件
const ruleDir = fileURLToPath(new URL('./health-rules/', import.meta.url));
const files = (await readdir(ruleDir)).filter(f => f.endsWith('.js')).sort();
const rules = [];
for (const f of files) {
    const mod = await import(new URL('./health-rules/' + f, HERE).href);
    for (const k of Object.keys(mod)) {
        if (/^rule\d+$/.test(k) && mod[k] && typeof mod[k].test === 'function') rules.push(mod[k]);
    }
}

const MAX_ROUND = CONFIG.MAX_ROUND || 35;
const SEEDS = process.env.SEEDS ? process.env.SEEDS.split(',').map(Number)
    : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const STAGES = process.env.STAGES ? process.env.STAGES.split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7];
const KEYWORDS = process.env.KEYWORDS ? process.env.KEYWORDS.split('|') : [];
// NOBUFFS=1 可关掉 Buff 注入，用于「注入前后」对比同一批战报
const NOBUFFS = process.env.NOBUFFS === '1';
// ENEMY_HEX=0 可退回「只有明教带海克斯」的单档口径（默认 1 = 双档，明教/六大派各选一个）。
//   双档在回放里必须真的落到敌方单位身上才算覆盖：runCase 会统计敌方 buff 数与生效回合，
//   开启双档却全程 0 ⇒ 直接判红（防"选了但引擎丢了"的假双档）。
const ENEMY_HEX = process.env.ENEMY_HEX === '0' ? false : true;
const dualStats = { enemyPicks: 0, enemyActiveRounds: 0 };

// #9 脏树前置守卫：规则回放依赖引擎/主数据，叠 WIP 的主树会把健康规则误判成恒空转/假绿/覆盖不足，必须先闸住。
const _wtg = checkWorktreeClean(import.meta.url);
if (_wtg.dirty) {
    warnIfDirty(_wtg, { label: 'rules-replay', maxShow: 6 });
    console.log('⚠️ 脏树警告：当前工作树非干净，恒空转/假绿/覆盖不足结论作废，请在干净 detached worktree 重跑后再下判定。');
    process.exit(1);
}

// 第 159 轮新增：定向覆盖场次（默认随机阵容凑不齐的前置条件，靠主代码现成的强制开关补）。
//   与 tests/stat-decl-vs-actual-check.mjs V3.11.0 同款口径、同一条安全边界：逐场设置、开场全键复位、
//   场次循环结束再复位一次，绝不让 GlobalStore 泄漏到后续场次或其他体检入口。
//   ★ 动因（本轮最重要的取证）：tests/124rule-recipes.js 里四条小昭规则被登记为
//     「小昭为随机精英，**无法强制**，需连打多局碰出」（L16 / L17 / L18 / L19 / L70）—— 这句 know-how **已过期**：
//     主代码 modules/330-battle-init.js L245-262 就有 GlobalStore 'forceXiaoZhao'（取值 'sister' / 'brother'），
//     tests/xiaozhao-brother-leech-case.mjs 与体检对照器（自第 158 轮）都已在用它。
//     「以为不能强制」直接导致依赖小昭形态的规则常年零执行：本轮改前 160-spider-transform-mastery
//     与 129-spider-fly-count 在 140 场里 **pass=0 fail=0 skip=140**，规则恒空转自检常年挂红。
//   ★ 方向是补样本让规则有机会跑，不改任何判据、不加任何豁免、不降任何人次下限。
// 第 160 轮：白名单加 forceWei（29battle-init L140 / L151 真实存在）。★ 仍是白名单制，
//   未登记的开关直接抛错，防止拼错键导致「强制静默失效、规则继续空转」这种最难查的假象。
// 第 172 轮收口：FORCE_KEYS / forcesOfEntry / resetForces 三件套搬去唯一来源
//   tests/_lib/forced-case-normalize.mjs（本文件不再自带副本）。
//   ★ 动因：本套白皮书写着「与 stat-decl-vs-actual-check V3.11.0 同一条安全边界」，实际却分叉了 ——
//     本文件是 ['forceXiaoZhao','forceWei']（第 160 轮加 forceWei 时未同步给对照器），
//     两本事实账本是 ['forceXiaoZhao','forceXieXun']（第 159 轮加 forceXieXun 时未同步给本文件）。
//     三个开关在主代码 29battle-init L140/L141/L144 里全都真实存在 ⇒ 收口后并为三者交集之上的全集，
//     本通道方才也能用 forceXieXun（喂谢逊系规则），两本账本方才也能用 forceWei。
//   ★ 零行为变化：forcesOfEntry 仍保留「无键时返 null」的原形态（统一成 {} 须单独拍板）。
import { forcesOfEntry, resetForces } from './_lib/forced-case-normalize.mjs';

const DIRECTED_CASES = [
    // 小昭·妹（brother）形态 → 蛛变 / 精通 / 飞天免疫 三条规则的唯一入口。
    //   场次与对照器一致（seed 17 × stage 1 / 4），实测对照器侧能稳定产出 SPIDER_TRANSFORM / SPIDER_MASTERY 声明。
    { seed: 17, stage: 1, force: 'brother' },
    { seed: 17, stage: 4, force: 'brother' },
    // 小昭·姊（sister）形态 → 流星溅射成长渲染形态（155）的守卫条件。
    //   第 175 轮重标定：第 158 轮的 seed 23 × stage 1-4 已零触发——buff 轮转按角色过滤后的
    //   键表取模，阵容/键表一变落点就漂；实测 seed 8 × stage 1-4 小昭·姊存活且明教远程带
    //   meteorShower，逐关都有 METEOR_SPLASH_GROWTH 样本。
    { seed: 8, stage: 1, force: 'sister' },
    { seed: 8, stage: 2, force: 'sister' },
    { seed: 8, stage: 3, force: 'sister' },
    { seed: 8, stage: 4, force: 'sister' },
    // 第 160 轮新增：韦一笑（forceWei）定向场次 —— 喂规则 164「吸血上限提升数值(回归)」的判据4。
    //   场次由 /tmp 探针定量挑出（取 WEI_LEECH 样本量最大的四场，保证稳定复现；四场失配各 1 条）：
    //   seed=15 stage=6（43 条 / heal>0 36）、seed=14 stage=2（36 / 30）、
    //   seed=20 stage=6（35 / 18）、seed=13 stage=6（16 / 12）。
    { seed: 15, stage: 6, forces: { forceWei: true } },
    { seed: 14, stage: 2, forces: { forceWei: true } },
    { seed: 20, stage: 6, forces: { forceWei: true } },
    { seed: 13, stage: 6, forces: { forceWei: true } },
    // 第 229 轮：三个「姊强化时长」buff 的定向样本（sister 在场 + forcePick 强制选中）。
    //   buff-picker V1.1.1 按 modules/329 口径给这三键 +sister.extraDuration；此前回放 remaining
    //   恒 4，227 的 base/base+1 双档永远只命中 base，强化时长分支在回放里零样本。
    { seed: 8, stage: 1, force: 'sister', buffs: BUFF_TYPES.HOT_BLOOD },
    { seed: 8, stage: 3, force: 'sister', buffs: BUFF_TYPES.WIND_ASSAULT },
    { seed: 8, stage: 5, force: 'sister', buffs: BUFF_TYPES.UNITY },
    { seed: 9, stage: 2, force: 'sister', buffs: BUFF_TYPES.HOT_BLOOD },
    { seed: 9, stage: 4, force: 'sister', buffs: BUFF_TYPES.WIND_ASSAULT },
    { seed: 9, stage: 6, force: 'sister', buffs: BUFF_TYPES.UNITY }
];

// （第 172 轮：下面 resetForces / forcesOfEntry / FORCE_KEYS 三件套已迁出至 tests/_lib/forced-case-normalize.mjs）
// --- 团队海克斯 Buff 注入 ---
// 为什么要有它：回放器此前 activeBuffs 恒为 []，而流星赶月/乘风突袭/流云身法/概率连击/巨马阵
//   这一整批机制全部由团队 Buff 门控，于是 11 条规则 120 场一次都跑不到（恒 skip 空转）。
// 口径来源：tools/816-role-balance-worker.js 的跑批写法 + player/512-battle-flow.js 的全自动选 Buff
//   口径（过滤已有 key 与 BUFF_ROLE_REQUIREMENTS 的职业要求，duration 取 buff 自带或 BUFF_DURATION）。
//   每回合递减 remaining（过期淘汰），每 3 回合为明教/六大派各补选一个（与 player/42 的
//   `round % 3 === 0` 补选节奏一致），并按「已选轮次」轮转键名，让 11 个 Buff 都能轮到。
// 注意：这里用 seed/round 确定性轮转，不消耗战斗 RNG —— 否则会改变战斗随机序列，破坏可复现性。
// V6.7.3 | 2026-10-25 第 123 轮：主体逻辑收口至 tests/_lib/buff-picker.mjs（唯一来源）——本函数在
//   tests/ 下曾有 8 份拷贝且已实证分化三档（xinhun 那份连 cols/rows 块与永久继承都没跟上），
//   按第 133 轮 _lib/rule-branch-extract.mjs 先例收口。本文件只留 NOBUFFS 环境开关这一 runner 特有能力。
function tickAndPickBuffs(activeBuffs, ally, enemy, round, seed, pickNew, forcePick = null) {
    var next = (activeBuffs || []).map(function (b) { return { ...b, remaining: b.remaining - 1 }; })
        .filter(function (b) { return b.remaining > 0; });
    // NOBUFFS=1 可关掉 Buff 注入，用于「注入前后」对比同一批战报（runner 特有开关，共享模块不管环境变量）
    if (NOBUFFS || !pickNew) return next;
    const beforeKeys = new Set((activeBuffs || []).map(function (b) { return b.key + '|' + (b.target || CAMP_TYPES.ALLY); }));
    const out = _sharedTickAndPickBuffs(activeBuffs, ally, enemy, round, seed, pickNew, ENEMY_HEX, forcePick);
    // 双档覆盖取证：真的给敌方补进了新 buff 才计一次（不是"选了但被丢弃"）
    if (ENEMY_HEX && out.some(function (b) { return (b.target || CAMP_TYPES.ALLY) === CAMP_TYPES.ENEMY && !beforeKeys.has(b.key + '|' + b.target); })) {
        dualStats.enemyPicks++;
    }
    return out;
}

// --- 不变量套件（V6.2.0）：与具体机制无关的低成本断言，逐步跑 ---
// ① 根因：过去体检只做"终局快照"比对 —— 中期越界后被自行修回的漂移，终局快照看不到；
//    且 hp 钳制/位置唯一这类不变量原先散落在各机制规则里，没有独立、每步都跑的断言。
// ② 口径/证据：引擎每次血量变动都 emit HP_CHANGE{hp,maxHp}（core/12:171/188/253/382），
//    回放里每一步都能拿到真实单位数组，故逐步断言几乎零成本、覆盖面最大。
// ③ 影响范围：不针对任何单一机制 —— 任何机制写坏了血量或占位都会在这里现形。
//    违规去重后汇总（同一步重复报没有意义），取不到字段时跳过而非伪造。
const invIssues = new Set();
const invUnmappedTypes = new Set();
let invUnmappedCount = 0;

function assertInvariants(units, round, seed, stage) {
    if (!Array.isArray(units)) return;
    const seenPos = new Map();
    const seenPosObj = new Map();
    for (const u of units) {
        if (!u) continue;
        const tag = `[seed=${seed} stage=${stage} round=${round}] `;
        // 血量类不变量直接复用 122 的唯一实现（钳制 + 膨胀 + isWei 豁免），此处不再复制一份。
        // 踩坑备忘（2026-09-25）：**不要**在这里另加"hp 必须为整数" —— 引擎内部 hp/maxHp 本就是
        //   浮点（maxHp 可 112.5，百分比治疗天然带小数），取整只在显示层 fmtHp。首版加了误报 11901 条。
        for (const msg of checkUnitHpValidity(u)) invIssues.add(tag + msg);
        // 注意（踩坑 2026-09-25）：**不要**断言 hp 为整数。引擎内部 hp/maxHp 本就是浮点
        //   （maxHp 可为 112.5，百分比治疗天然带小数），取整只发生在显示层 fmtHp 与伤害结算
        //   `hpAfter = Math.floor(target.hp) - dmg`。首版加了这条 → 120 场误报 11901 条，纯假阳性。
        // 生死与血量一致（第 23 轮加）：存活者 hp 应 >0、已阵亡者 hp 应 <=0。
        //   "活死人"（alive 但血空）与"带血尸体"（已死却还有血）都是明确的回归信号。
        // 生死与血量一致（第 23 轮加，第 24 轮按 _pendingDeath 对齐设计内中间态）。
        //   取证：此前 5 条违规经探针核证 **全部** `state._pendingDeath === true`（探针 _tmp-pending.mjs）。
        //   成因（业务侧 V7.4.5 / core/10 V6.3.3）：致死不再当场 `alive=false`，统一挂 `_pendingDeath`
        //   交 core/12 L413 `resolveDeaths` 结算（修「带血尸体」hp 不清零 + DEATH 信号不发两个洞）。
        //   于是「hp<=0 且 alive 仍 true」是**设计内中间态**——逐步断言恰落在这个窗口里，不是缺陷。
        //   这是口径对齐、不是放宽：引擎自己判"还能不能被选/被打"就是 `u.alive && !u.state._pendingDeath`
        //   （core/03 L63/L290、core/10 L59/L88、modules/27 L573/L737），体检沿用同一契约，不另立一套。
        //   故真正的红线收窄为：**血已空、却既没标记待死也没结算** → 死亡结算链路断了。
        const isPendingDeath = !!(u.state && u.state._pendingDeath);
        // 小昭·姊附身中 hp=0、alive=true 是设计合法态（血按比例转给宿主，modules/27:303）：
        //   按 state._butterflyHost 精确豁免（第 24 轮·本机线移植）；其余"活死人"仍报。
        const isButterflyAttached = !!(u.state && u.state._butterflyHost);
        if (u.alive === true && !(u.hp > 0) && !isPendingDeath && !isButterflyAttached) {
            invIssues.add(tag + (u.name || u.uid) + ' 空血却未标记待死（死亡结算断链）：hp=' + u.hp);
        }
        if (u.alive === false && u.hp > 0) {
            invIssues.add(tag + (u.name || u.uid) + ' 已阵亡但 hp>0：' + u.hp);
        }
        // 累计统计不得为负（第 23 轮）。注意**不能**写成"单调不减"：core/13:55-59 有
        //   `case 'immuneRollback'`（免疫回退：承伤已记、只退输出），会刻意把 dmgDealt
        //   `Math.max(0, x - amount)` 减回去 —— 首版按"单调不减"写，120 场误报 **44 条**，已作废。
        //   作者既已用 Math.max(0,..) 兜底，真正成立的不变量就是"不为负"：
        //   一旦兜底被撤，统计就会漏出负值，这条能抓住。
        for (const k of ['dmgDealt', 'dmgTaken', 'healDone']) {
            if (typeof u[k] === 'number' && u[k] < 0) {
                invIssues.add(tag + (u.name || u.uid) + ' 累计 ' + k + ' 为负：' + u[k]);
            }
        }

        // pos 唯一：同阵营内两个活人不能占同一格
        if (u.pos != null && u.alive !== false) {
            const key = (u.camp || '?') + '#pos' + u.pos;
            if (seenPos.has(key)) {
                const prev = seenPosObj.get(key);
                invIssues.add(tag + (u.name || u.uid) + ' pos 冲突: 格 ' + u.pos + ' 与 ' + seenPos.get(key) + ' 重叠');
                console.error('[PROBE pos] cur=', JSON.stringify({name:u.name,pos:u.pos,alive:u.alive,camp:u.camp,isSis:!!u.isXiaoZhaoSister,fly:u.state&&u.state._flyMode,host:u.state&&u.state._butterflyHost,stun:u.state&&u.state._stunned}), ' prev=', JSON.stringify({name:prev&&prev.name,pos:prev&&prev.pos,alive:prev&&prev.alive,isSis:prev&&!!prev.isXiaoZhaoSister,fly:prev&&prev.state&&prev.state._flyMode,host:prev&&prev.state&&prev.state._butterflyHost}));
            }
            else { seenPos.set(key, u.name || u.uid); seenPosObj.set(key, u); }
        }
    }
}

// V6.10.0 | 2026-10-31 夜间第 163 轮：collectFacts 补 f.data.phantomFact（core/12 buildAttackGroup 挂点）。
//   此前规则的第 7 参 facts 里根本没有幻影 fact ⇒ 任何靠 PHANTOM_* 认领战报的规则都**恒不可命中**，
//   一旦这类规则存在，它就会以「对照器兜住」或压根不认领的面目悄悄假绿，没人察觉。本轮补的是同一款病：
//   不是规则没长牙，是喂给它的战报少了半拉。
// Step 0（2026-10-08）：把每场原始 fact 流（含嵌套 data.entries / entries）递归展平后也喂给规则，
//   作为 rule.test 的第 7 参 facts。此前规则只看渲染文案（renderLog 产物），renderFn:null 的
//   数值声明 fact 完全不可见 → 那 22 条「对照器兜底」的根因。喂入后规则可读 atkDelta/ratio/delta
//   等数值字段做重算对账，真正长牙。现有 37 条规则忽略多余参数，向后兼容。

// V6.13.0：三键姊强化样本计数 + 妹永久摘要补发（回放侧建模，不改主代码）
const SISTER_BUFF_KEYS = {
    [BUFF_TYPES.HOT_BLOOD]: 'hotBlood',
    [BUFF_TYPES.WIND_ASSAULT]: 'windAssault',
    [BUFF_TYPES.UNITY]: 'unity'
};
const sisterBuffCover = { hotBlood: 0, windAssault: 0, unity: 0 };
function sisterExtraFor(key) {
    const enhKey = SISTER_BUFF_KEYS[key];
    if (!enhKey) return null;
    const enh = getSisterHexEnhance(enhKey);
    return (enh && typeof enh.extraDuration === 'number') ? enh.extraDuration : null;
}
// 妹妹 _permanentBuffs 只在 unit.state 里，引擎的 BUFF_SUMMARY 只遍历团队 activeBuffs ⇒ 永久副本
// 在 fact 通道完全不可见。这里每回合补一条（remaining=MAX_ROUND + permanent:true）；
// 同回合团队摘要已有同 key 时跳过，避免 228 把「团队 + 永久」误判成重复挂载。
function appendPermanentSummaries(allyUnits, roundFacts, facts) {
    const bro = (allyUnits || []).find(function (u) { return u && u.isXiaoZhaoBrother; });
    const list = bro && bro.state && Array.isArray(bro.state._permanentBuffs) ? bro.state._permanentBuffs : null;
    if (!list || !list.length) return 0;
    const teamKeys = new Set();
    for (const f of (roundFacts || [])) {
        if (!f || f.factType !== FACT_TYPES.BUFF_SUMMARY) continue;
        const b = f.data && f.data.buff;
        if (b && b.key) teamKeys.add((b.target || CAMP_TYPES.ALLY) + '|' + b.key);
    }
    let n = 0;
    for (const pb of list) {
        if (!pb || !pb.key) continue;
        const camp = pb.target || CAMP_TYPES.ALLY;
        if (teamKeys.has(camp + '|' + pb.key)) continue;
        facts.push({
            factType: FACT_TYPES.BUFF_SUMMARY,
            data: {
                buff: {
                    key: pb.key, target: camp, remaining: CONFIG.MAX_ROUND,
                    name: pb.name || pb.key, permanent: true
                },
                allyTeamUids: (allyUnits || []).filter(function (u) { return u && u.alive; }).map(function (u) { return u.uid; })
            }
        });
        n++;
    }
    return n;
}

function runCase(seed, stage, forces, forcePick = null) {
    // 第 159 轮：开场先把全部白名单开关复位，再按本场 forces 设置（双重复位，杜绝全局态泄漏）。
    resetForces(GlobalStore);
    for (const k of Object.keys(forces || {})) GlobalStore.set(k, forces[k]);
    const rng = new SeededRNG(seed);
    const store = createStore({ ...createInitialState(), units: [] }, battleReducer);
    GlobalStore.set('battleStore', store);
    // V6.15.0：encounterVariant / rngContractVersion 是 330 V7.7.0 起的返回值（变体 id 与抽签契约
    //   版本），必须原样透传进 ctx —— 286 靠 encounterVariant 才能分桶判定，拿 undefined 就只能 skip。
    const { allyTeam, enemyTeam, encounterVariant, rngContractVersion } = initBattleTeams(stage, rng);
    const beforeA = allyTeam.map(u => ({ ...u }));
    const beforeE = enemyTeam.map(u => ({ ...u }));
    let battleState = {
        ally: allyTeam.map(u => u.clone()),
        enemy: enemyTeam.map(u => u.clone()),
        // 第 1 回合预注入一轮：真实流程要等到第 3 回合才选 Buff，体检为覆盖机制提前一拍
        round: 1, activeBuffs: [],
        allAllies: allyTeam.map(u => u.clone()), _rng: rng
    };
    // V6.7.2 永久继承补丁：选 Buff 必须落在**本场战斗单位**（battleState.ally 克隆体）上——
    //   旧写法把 allyTeam（原型）传给 tickAndPickBuffs，永久副本全写进不被战斗使用的对象，
    //   战斗克隆体永远拿不到（实测蝶血渲染 0 次）。pick 输入只看 alive/role，原型与克隆体等价，pick 结果不变。
    battleState.activeBuffs = tickAndPickBuffs([], battleState.ally, battleState.enemy, 1, seed, true, forcePick);
    // V6.13.0：首次挂载即验证「姊在场 → base + extraDuration」，不等规则 227 的宽松合法集（base/base+1）
    {
        const sis = battleState.ally.some(u => u && u.alive && u.isXiaoZhaoSister);
        for (const b of battleState.activeBuffs) {
            if ((b.target || CAMP_TYPES.ALLY) !== CAMP_TYPES.ALLY) continue;
            const extra = sisterExtraFor(b.key);
            if (extra == null || !sis) continue;
            const cfg = CONFIG.BUFFS[b.key] || {};
            const base = cfg.duration || CONFIG.BUFF_DURATION || 4;
            sisterBuffCover[SISTER_BUFF_KEYS[b.key]]++;
            if (b.remaining !== base + extra) {
                invIssues.add(`[seed=${seed} stage=${stage}] ${b.key} 首挂剩余=${b.remaining}，姊在场应为 ${base}+${extra}=${base + extra}`);
            }
        }
    }
    const log = [];
    const facts = [];   // Step 0：本场原始 fact 全流（含嵌套），喂给规则做数值对账
    let winner = null, lastStep = null;
    while (battleState.round <= MAX_ROUND) {
        try {
            store.dispatch({ type: STORE_ACTION_TYPES.SET_UNITS, units: [...battleState.ally, ...battleState.enemy].map(u => ({ ...u })) });
            store.dispatch({ type: STORE_ACTION_TYPES.SET_ROUND, round: battleState.round });
        } catch (e) { /* 状态同步失败不影响回放 */ }
        const roundFacts = [];
        for (const step of createRoundStepper(battleState)) {
            lastStep = step;
            for (const f of step.log || []) {
                if (!f || !f.factType) continue;
                roundFacts.push(f);
                try {
                    const e = renderLog(f.factType, f.data);
                    // 不变量：fact 发射了却找不到渲染归属 = facts 映射缺口。以 58 契约为准（V6.5.0）：
                    //   ① 58 无 spec：fact 类型未登记（漏改 58，真缺口）；
                    //   ② spec.renderFn 非空但 33 没注册器：声明了渲染却没实现（真缺口）；
                    //   ③ spec.renderFn===null：契约明示「数值声明 fact 不进画面」（58:145，
                    //      八卦阵/莽撞/雄狮振奋），合法，不报。旧版只问 getFactRenderer，③ 被误报 634 条。
                    {
                        const _spec = FACT_SPECS[f.factType];
                        if (!_spec) {
                            invUnmappedCount++;
                            invUnmappedTypes.add(f.factType + '(58未声明)');
                        } else if (_spec.renderFn && !getFactRenderer(f.factType)) {
                            invUnmappedCount++;
                            invUnmappedTypes.add(f.factType + '(声明渲染但未注册)');
                        }
                    }
                    // 渲染函数可能返回「数组」（如 renderZhangSwitchFact 返回 [切换行, 台词行] 两件套）：
                    // 旧版直接 log.push(e) 会把数组当单条目压入，数组元素自身既无 .text 也无标记位，
                    // 导致所有"锚点落在数组元素上"的规则恒空转（134/143 同款病）。此处摊平后再压入。
                    if (Array.isArray(e)) { for (const one of e) { if (one) log.push(one); } }
                    else if (e) log.push(e);
                } catch (e) { /* 单条渲染失败不阻断 */ }
            }
            collectFacts(step.log, facts);   // Step 0：收集本步原始 fact（含嵌套）供规则对账
            // 不变量：每步断言一次（比"每回合末"更细 —— 中期越界后被修回也能抓到）
            assertInvariants([...(step.ally || []), ...(step.enemy || [])], battleState.round, seed, stage);
            if (step.winner) winner = step.winner;
        }
        // V6.13.0：把妹妹永久副本补进 fact 通道（每回合一条；229 用它验整局不消失）
        appendPermanentSummaries((lastStep || {}).ally, roundFacts, facts);
        // 行动权不变量（回合级，第 24 轮·本机线移植）：本回合行动序列走完后核对，抓「吞回合」（122 唯一实现）
        for (const msg of checkActionRights(roundFacts,
            [...((lastStep || {}).ally || []), ...((lastStep || {}).enemy || [])])) {
            invIssues.add(`[seed=${seed} stage=${stage} round=${battleState.round}] ` + msg);
        }
        // 回合末兜底断言（第 24 轮）：本回合**正常打完**（无胜者、即将进入下一回合）时，不应再有
        //   「存活但血空」单位——连仍挂 _pendingDeath 的也不该留下：core/12 有"回合循环内 + 回合结束兜底"
        //   双路径，待死单位到回合末必被结算。这条补回"标记了却没人结算"那一类，避免上面按 _pendingDeath
        //   放行后该情形就此失去覆盖。
        //   有胜者时跳过：胜负已分即战斗终止，最后一击的待死单位本就不再结算，属正常收尾而非缺陷。
        if (!winner && lastStep) {
            for (const u of [...(lastStep.ally || []), ...(lastStep.enemy || [])]) {
                if (!u) continue;
                const tag2 = `[seed=${seed} stage=${stage} round=${battleState.round}] `;
                const pend = !!(u.state && u.state._pendingDeath);
                // 小昭附身态（state._butterflyHost）hp=0、alive=true 属设计合法（血按比例转给宿主），
                //   与 _pendingDeath 豁免并行（第 24 轮·本机线移植），否则回合末 ② 必误报。
                const isButterflyAttached = !!(u.state && u.state._butterflyHost);
                // ① **仍存活**却带着待死标记到回合末 —— resolveDeaths 这一轮没把它结算掉。
                //    最危险的一种：标记留着，下一轮 resolveDeaths 会把**已经救回来的人再杀一次**。
                //    取证（第 25 轮）：**必须限定 alive===true**——首版不限，120 场误报一大片
                //    「拒马/少林弟子 alive=false hp=0 仍挂 _pendingDeath」，即**已死单位**上的标记残留。
                //    已死单位不在 `resolveDeaths` 的 `(pending && alive)` 过滤里，残留无后果，属无害脏数据。
                if (pend && u.alive === true) {
                    invIssues.add(tag2 + (u.name || u.uid) + ' 回合末仍存活却挂着 _pendingDeath（结算未跑完）：hp=' + u.hp);
                }
                // ② 没有任何待死标记，却血已空且仍存活 —— 致死路径压根没挂标记、也没结算（断链）。
                //    与 ① 互斥：有标记的一律算 ①，避免同一件事报两遍。
                else if (u.alive === true && !(u.hp > 0) && !isButterflyAttached) {
                    invIssues.add(tag2 + (u.name || u.uid) + ' 回合末仍存活但血空（死亡结算断链）：hp=' + u.hp);
                }
            }
        }
        if (winner || !lastStep) break;
        // 双档覆盖取证：敌方身上确有生效 buff 才计一回合（引擎只给"持有方"挂 _activeBuffs）
        if (ENEMY_HEX && lastStep) {
            const eb = (lastStep.enemy && lastStep.enemy._activeBuffs) || [];
            const perUnit = (lastStep.enemy || []).reduce(function (n, u) { return n + ((u && u._activeBuffs && u._activeBuffs.length) || 0); }, 0);
            if (eb.length || perUnit) dualStats.enemyActiveRounds++;
        }
        // V6.7.2 永久继承补丁的顺序前提：tickAndPickBuffs 会把新 Buff 的永久副本写进传入单位的
        //   state._permanentBuffs，必须先于 clone() 执行——clone() 深拷 state（core/02 L157-158
        //   copyAllStateFields 数组深拷贝），顺序反了副本全落进随后被丢弃的旧单位（实测蝶血 0 次）。
        //   除写入目标外语义与原写法一致（round/pickNew 参数仍用旧 battleState.round）。
        const nextRoundNo = battleState.round + 1;
        const nextActiveBuffs = tickAndPickBuffs(battleState.activeBuffs, lastStep.ally, lastStep.enemy,
            battleState.round, seed, battleState.round % 3 === 0, forcePick);
        battleState = {
            ally: lastStep.ally.map(u => u.clone()),
            enemy: lastStep.enemy.map(u => u.clone()),
            round: nextRoundNo,
            activeBuffs: nextActiveBuffs,
            allAllies: battleState.allAllies,
            _rng: rng
        };
    }
    const afterA = (lastStep ? lastStep.ally : battleState.ally).map(u => ({ ...u }));
    const afterE = (lastStep ? lastStep.enemy : battleState.enemy).map(u => ({ ...u }));
    const ctx = {
        gs: 'GAMEOVER', currentStage: stage,
        // V6.15.0：关卡变体抽签真值（无变体关 = null）与抽签契约版本，规则只读不改。
        encounterVariant: encounterVariant,
        rngContractVersion: rngContractVersion,
        activeBuffs: battleState.activeBuffs || [],
        // 开局快照：语义务必取自 ui/702-main-5v5-test.js:392-393 的注释 ——
        //   「战斗进行中 snapshot 不反映当前态」、snapshot.enemy 是 Object.freeze 的定稿。
        //   故这里喂**开战定稿**（beforeA/beforeE），**不是**终局单位 —— 喂终局会伪造口径。
        //   补充动机：回放原先根本没造 snapshot，导致 134/139 里依赖它的判据全程静默不执行
        //   （回放侧假绿），覆盖率缺口不可见。补上后这部分判据才真正参与。
        snapshot: { ally: beforeA, enemy: beforeE },
        UI: { allyTeam: afterA, enemyTeam: afterE },
        _enhancedBattleLog: log,
        facts: facts   // Step 0：原始 fact 全流（规则可经 ctx.facts 取用，独立于渲染文案）
    };
    // STATS=1 逐场指纹要用：winner / rounds 此前不在返回值里（只有规则用 ctx）
    return { seed, stage, ctx, log, facts, beforeA, beforeE, afterA, afterE, winner, rounds: battleState.round };
}

const agg = {}, kwHit = {};
// 观察项通道（第 192 轮）：规则可返回 { fail:false, observe:'...' } 表示「结论供研判、但不是硬判据」。
// 只汇总打印，不进 fails 计数、不改退出码 —— 与 run-all 的 OBSERVES 同一取舍。
const OBSERVATIONS = new Map(); // ruleName -> Set(msg)
// 分支指纹落盘（第 131 轮 V6.7.2）：仅在显式设置 RULE_MSGS_OUT 时才建容器，默认零副作用
// ——不改任何判据、不影响既有输出与退出码。与 V6.7.1 的 RULE_STATS_OUT 同款口径（各管一个环境变量）。
// 落盘内容：逐条规则本次样本里**实际报出过**的 fail msg 全集（去重，供分支级空转自检做前缀匹配）。
const BRANCH_MSGS = process.env.RULE_MSGS_OUT ? new Map() : null;
let cases = 0;
for (const { seed, stage, force, forces: entryForces, buffs: entryBuffs } of [...SEEDS.flatMap(seed => STAGES.map(stage => ({ seed, stage }))),
    // 第 159 轮：默认场次之后**追加**定向覆盖组（默认场次一个不减）。
    ...DIRECTED_CASES.map(c => ({ seed: c.seed, stage: c.stage, force: c.force, forces: c.forces, buffs: c.buffs }))]) {
    // 第 160 轮：单值 force 仍向后兼容（等价 forces:{forceXiaoZhao:force}），新增的 forces 走白名单校验。
    const forces = forcesOfEntry({ force, forces: entryForces });
    const c = runCase(seed, stage, forces, entryBuffs || null);
    cases++;
    // STATS=1 逐场指纹（双档 vs 单档对照用，不进默认输出）：胜负 / 回合数 / 双方总损血
    //   用途：ENEMY_HEX=1 与 ENEMY_HEX=0 各跑一遍后逐场 diff —— 若全无差异，说明敌方海克斯
    //   「选了、挂上了，但对战局零影响」，即双档只是摆设。这不是判红项，只做取证。
    if (process.env.STATS) {
        var lossOf = function (b, a) { var n = 0; for (var i = 0; i < b.length; i++) { var u = b[i], v = a[i]; n += Math.max(0, (u && u.hp || 0) - (v && v.hp || 0)); } return n; };
        console.log('[指纹] seed=' + c.seed + ' stage=' + c.stage + ' winner=' + (c.winner || 'null')
            + ' rounds=' + c.rounds + ' allyLoss=' + Math.round(lossOf(c.beforeA, c.afterA) * 10) / 10
            + ' enemyLoss=' + Math.round(lossOf(c.beforeE, c.afterE) * 10) / 10);
    }
        // DUMP=seed:stage 单场调试：打印该场 buff-push/buff-swap 及相邻的攻击快照位置
        if (process.env.DUMP && process.env.DUMP === seed + ':' + stage) {
            console.log('--- DUMP ' + process.env.DUMP + ' 共 ' + c.log.length + ' 条 ---');
            c.log.forEach(function (e, i) {
                if (!e) return;
                if (e.type === 'buff-push') console.log(i + ' [push] ' + (e.text || '').replace(/<[^>]+>/g, '') + ' || pushUid=' + e.pushTargetUid + ' behindUid=' + e.behindUid + ' old=' + e.oldPos + ' new=' + e.newPos + ' behindOld=' + e.behindOldPos);
                else if (e.type === 'buff-swap') console.log(i + ' [swap] ' + (e.text || '').replace(/<[^>]+>/g, '') + ' || A=' + e.uidA + ' B=' + e.uidB + ' posA=' + e.oldPosA + ' posB=' + e.oldPosB);
                else if (e.type === 'attack-group' && e._fxSnapshot) console.log(i + ' [atk ] A=' + e.uidA + '@' + e._fxSnapshot.attackerPos + ' D=' + e.uidD + '@' + e._fxSnapshot.defenderPos);
                else if (typeof e.text === 'string' && e.text) console.log(i + ' [txt ] ' + e.text.replace(/<[^>]+>/g, ''));
            });
        }
        for (const kw of KEYWORDS) {
            for (const e of c.log) {
                if (e && typeof e.text === 'string' && e.text.indexOf(kw) !== -1) kwHit[kw] = (kwHit[kw] || 0) + 1;
            }
        }
        for (const r of rules) {
            let res;
            try {
                res = r.test(c.ctx, c.log, c.beforeA, c.beforeE, c.afterA, c.afterE, c.facts);
            } catch (e) {
                res = { fail: true, msg: '规则抛异常: ' + (e.message || e) };
            }
            // 形状防御（第 200 轮）：只认 {fail:boolean,msg} 与 'skip'。
            //   此前 `res && res.fail ? 'fail' : 'pass'` —— 规则失败时返回普通字符串会被静默算 pass，
            //   229 曾 156 场假绿、227/228 上线起一直假绿（直接调 .test 是 fail=70/70，回放却 pass=156）。
            let st;
            if (res === 'skip') st = 'skip';
            else if (res === 'pass') st = 'pass';   // 显式成功状态词，语义明确
            else if (res && typeof res === 'object') st = res.fail ? 'fail' : 'pass';
            else {
                st = 'fail';
                res = { fail: true, msg: '返回值形状非法（只认 {fail:boolean,msg} 或 "skip"）：' + String(res).slice(0, 120) };
            }
            const a = agg[r.name] || (agg[r.name] = { pass: 0, fail: 0, skip: 0, msgs: [] });
            a[st]++;
            if (res && res.observe) {
                let s = OBSERVATIONS.get(r.name);
                if (!s) { s = new Set(); OBSERVATIONS.set(r.name, s); }
                if (s.size < 20) s.add(`[seed=${seed} stage=${stage}] ${String(res.observe).slice(0, 180)}`);
            }
            if (st === 'fail' && a.msgs.length < 3) a.msgs.push(`[seed=${seed} stage=${stage}] ${(res.msg || '').slice(0, 160)}`);
            // 分支指纹：只收集"真的报出来过"的 msg（去重；单规则上限 400 条防内存膨胀）
            if (BRANCH_MSGS && st === 'fail') {
                let s = BRANCH_MSGS.get(r.name);
                if (!s) { s = new Set(); BRANCH_MSGS.set(r.name, s); }
                if (s.size < 400) s.add(String((res && res.msg) || ''));
            }
        }
}
// 第 159 轮：场次循环结束统一复位（同进程内后续任何 initBattleTeams 都不该被强制成小昭阵容）。
resetForces(GlobalStore);

// --- 不变量报告（与机制规则分开报，不混进规则 pass/fail 计数）---
console.log('=== 不变量（逐步断言）===');
if (factContractWarns.size) {
    const total = [...factContractWarns.values()].reduce((a, b) => a + b, 0);
    console.log(`  ❌ fact 契约违规：${factContractWarns.size} 类（去重），共 ${total} 次`);
    for (const [k, cnt] of [...factContractWarns.entries()].slice(0, 8)) {
        console.log(`      - ${k}  ×${cnt}`);
    }
}
if (invUnmappedCount) {
    console.log(`  ❌ facts 映射缺口：${invUnmappedCount} 条（58 未登记 / 声明渲染但未注册），涉及类型：${[...invUnmappedTypes].join(', ')}`);
}
if (registryProblems.size) {
    console.log(`  ❌ fact 注册一致性 ${registryProblems.size} 类（33 ↔ 58）：`);
    for (const m of registryProblems) console.log('      ' + m);
}
// hook 运行时错误（infra/50 V6.5.0 的 DOM 无关计数）：页面端错误面板在 node 不存在，
// 跑批里监听器抛错过去只进 console.error，这里把它变成退出码红线。
const hookErrorCount = eventBus.getErrorCount();
if (hookErrorCount) {
    console.log(`  ❌ eventBus 监听器运行时错误：${hookErrorCount} 次（无 DOM 环境计数，明细最多列 8 条）`);
    for (const e of eventBus.getRecentErrors().slice(0, 8)) console.log(`      - [${e.signal}] ${(e.message || '').slice(0, 160)}`);
}
if (invIssues.size) {
    const arr = [...invIssues];
    for (const m of arr.slice(0, 12)) console.log('  ❌ ' + m);
    if (arr.length > 12) console.log(`  … 另有 ${arr.length - 12} 条同类`);
} else if (!factContractWarns.size && !invUnmappedCount && !registryProblems.size && !hookErrorCount) {
    console.log('  ✅ hp∈[0,maxHp] / maxHp>0 / pos 唯一 / facts 映射完整 / 注册一致 / fact 契约无缺字段 / hook 无运行时错误 —— 全部通过');
}

console.log(`=== 规则回放自检：${cases} 场 / ${rules.length} 条规则 ===`);
// 双档覆盖自检（ENEMY_HEX）：开了双档却一次都没给敌方补到 buff ⇒ 判红——
//   "选了但引擎整批丢弃"会让双海克斯长期假覆盖，这条把它变成可观测事实。
if (ENEMY_HEX) {
    console.log(`=== 双海克斯覆盖：敌方补选 ${dualStats.enemyPicks} 次 / 敌方身上生效 ${dualStats.enemyActiveRounds} 回合 ===`);
    if (dualStats.enemyPicks === 0) console.log('  ❌ 双档开启但敌方从未补到 buff（双海克斯等于没跑）');
} else {
    console.log('=== 单海克斯对照口径（ENEMY_HEX=0）：只给明教补选 ===');
}
// 第 229 轮：三个姊强化 buff 时长分支的样本自检——定向场次若一个都没挂上，等于又回零样本。
console.log(`=== 姊强化时长覆盖：热血奋战 ${sisterBuffCover.hotBlood} / 乘风突袭 ${sisterBuffCover.windAssault} / 众志成城 ${sisterBuffCover.unity} ===`);
const sisterBuffZero = !NOBUFFS && (sisterBuffCover.hotBlood + sisterBuffCover.windAssault + sisterBuffCover.unity) === 0;
if (sisterBuffZero) console.log('  ❌ 三键姊强化零样本（定向场次未生效：forcePick 不在候选池或姊未在场）');
// 第 97 轮（2026-10-17）转交态：known-transfers.md 登记中的项显示 ⚠️ 且不计退出码——
//   「转交中」与「真回归」必须分开，否则红线常红 = 狼来了（审核发现，详见该清单）。
const KNOWN_TRANSFERS = (() => {
    try {
        const txt = readFileSync(new URL('./known-transfers.md', import.meta.url), 'utf8');
        const names = new Set();
        for (const line of txt.split(/\r?\n/)) {
            const m = line.match(/^\|\s*([^|]+?)\s*\|/);
            if (!m) continue;
            const cell = m[1].trim();
            if (cell && cell !== '规则/检查项' && cell !== '检查项' && !cell.startsWith('---')) names.add(cell);
        }
        return names;
    } catch (e) { return new Set(); }
})();
let fails = 0, dead = 0, transferred = 0;
for (const name of Object.keys(agg)) {
    const a = agg[name];
    const isTransfer = a.fail > 0 && KNOWN_TRANSFERS.has(name);
    if (a.fail > 0 && !isTransfer) fails++;
    else if (isTransfer) transferred++;
    else if (a.pass === 0) dead++; // 恒 skip = 空转规则，值得单独盯
    const tag = a.fail > 0 ? (isTransfer ? '⚠️ ' : '❌') : (a.pass > 0 ? '✅' : '⏭ ');
    console.log(`${tag} ${name}  pass=${a.pass} fail=${a.fail} skip=${a.skip}${isTransfer ? '  【已转交·等主代码】' : ''}`);
    for (const m of a.msgs) console.log(`      ${m}`);
}
if (OBSERVATIONS.size) {
    console.log('=== 观察项（不计红 / 不计退码，仅供研判） ===');
    for (const [name, set] of OBSERVATIONS) {
        console.log(`  🔎 ${name}  ${set.size} 例`);
        for (const m of set) console.log(`      ${m}`);
    }
}
if (KEYWORDS.length) {
    console.log('=== 关键字命中 ===');
    for (const kw of KEYWORDS) console.log(`  ${kw}: ${kwHit[kw] || 0}`);
}
const invFail = invIssues.size + (invUnmappedCount ? 1 : 0) + factContractWarns.size + registryProblems.size + (hookErrorCount ? 1 : 0) + ((ENEMY_HEX && dualStats.enemyPicks === 0) ? 1 : 0) + (sisterBuffZero ? 1 : 0);
console.log(`RESULT: ${fails === 0 ? '无失败规则' : fails + ' 条规则报失败'}${transferred ? `；转交中 ${transferred} 条（⚠️ 不计退出码，见 tests/known-transfers.md）` : ''}；恒 skip(空转)规则 ${dead} 条` +
    `；不变量违规 ${invIssues.size} 类${invUnmappedCount ? ' / facts 映射缺口 ' + invUnmappedCount + ' 条' : ''}` +
    `${factContractWarns.size ? ' / fact 契约违规 ' + factContractWarns.size + ' 类' : ''}` +
    `${registryProblems.size ? ' / 注册一致性 ' + registryProblems.size + ' 类' : ''}` +
    `${hookErrorCount ? ' / hook 运行时错误 ' + hookErrorCount + ' 次' : ''}`);
// 第 130 轮：为「规则恒空转自检」（tests/rule-idle-selftest.mjs）提供机器可读口径。
// 仅在显式设置 RULE_STATS_OUT 时落盘，默认零副作用——不改任何判据、不影响既有输出与退出码。
// 落盘内容：样本场次 cases、规则条数、逐条规则 pass/fail/skip 计数，以及本轮解析出的转交名单。
if (process.env.RULE_STATS_OUT) {
    try {
        writeFileSync(
            process.env.RULE_STATS_OUT,
            JSON.stringify({ cases, ruleCount: rules.length, agg, knownTransfers: [...KNOWN_TRANSFERS] })
        );
    } catch (e) {
        console.error('RULE_STATS_OUT 落盘失败: ' + (e && e.message ? e.message : e));
    }
}
if (BRANCH_MSGS) {
    try {
        const branchMsgs = {};
        for (const [k, v] of BRANCH_MSGS) branchMsgs[k] = [...v];
        writeFileSync(
            process.env.RULE_MSGS_OUT,
            JSON.stringify({ cases, ruleCount: rules.length, branchMsgs })
        );
    } catch (e) {
        console.error('RULE_MSGS_OUT 落盘失败: ' + (e && e.message ? e.message : e));
    }
}
process.exit((fails === 0 && invFail === 0) ? 0 : 1);
