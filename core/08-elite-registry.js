// V7.5.13 | 2026-10-08 回合钩子注册面四件套（core/11 英雄特判收口，老板批）：
//   core 引擎只认「注册面 + 通用协议」，不认识任何具体英雄；英雄知识全部住在 modules 的注册里。
//   加载时序：modules/00reg-mechanics 是全战斗入口统一装载点（先于任何 prepareRoundStart），
//   模块顶层注册保证开战前就位。
// V6.0.0 | 2026-08-12 core层定义注册接口，modules层注册
export const VER = 'core/08-elite-registry.js V7.5.13';

const eliteRegistry = new Map();

// 注册精英组件工厂：name=角色名，factory 返回 { register }
export function registerElite(name, factory) {
    eliteRegistry.set(name, factory);
}

export function getEliteFactories() {
    return eliteRegistry;
}

// —— ① 回合组件标记：factoryName → camp ——
// 标记为回合组件的工厂：prepareRoundStart 的工厂循环对「该 camp 的同名存活单位」
// 每轮实例化一次、每个同名单位都 register、实例保留供主循环相位调度（不收 declarations）。
// 原小昭·姊/妹特判分支的泛化。
const roundComponentNames = new Map();
export function registerRoundComponent(factoryName, camp) { roundComponentNames.set(factoryName, camp); }
export function getRoundComponentNames() { return roundComponentNames; }

// —— ② 回合开始 buff 变换器：buffKey → (buff, rng, A, B) => buff ——
// prepareRoundStart 对 activeBuffs 逐个过变换器（同位置同条件画 rng，序与旧内联版一致）。
// 原小昭 hexEnhance 圣火令重画覆盖行列的泛化。
const buffRoundTransformers = new Map();
export function registerBuffRoundTransformer(buffKey, fn) { buffRoundTransformers.set(buffKey, fn); }
export function getBuffRoundTransformers() { return buffRoundTransformers; }

// —— ③ 搭档连线：[nameA, nameB] 对 ——
// 回合开始时双方在场则互写 _linkedPartnerUid。原宋青书×周芷若、鹿杖客×鹤笔翁
// 内连线的泛化（原版仅扫敌方 B，消费方保持）。
const linkPartnerPairs = [];
export function registerLinkPartners(nameA, nameB) { linkPartnerPairs.push([nameA, nameB]); }
export function getLinkPartnerPairs() { return linkPartnerPairs; }

// —— ⑤ 圣火令增强判定：modules 侧注册「圣火令何时算被增强」（(A) => boolean）——
//   原小昭姊在场判定的泛化：数值加成（applyHolyFlameBonus 的第三参）与行列重画（buff 变换器）
//   两处消费同一语义，注册面只有一份。
const holyFlameEnhancers = [];
export function registerHolyFlameEnhancer(fn) { holyFlameEnhancers.push(fn); }
export function isHolyFlameEnhanced(A) { return holyFlameEnhancers.some(fn => fn(A)); }

// —— ④ 状态迁移声明分发：declType → { deferred, dispatch(comps, decl, A, B, log) } ——
// 主循环消费 _pendingStateTransitions 时的通用路由：deferred 的攒到下回合/回合末，
// 即时的当场执行。dispatch 闭包住在对应英雄的模块里（组件方法签名各异，闭包负责适配）。
// 原 butterflyAttach/Return、spiderFly/Descend 的 sisterComp/brotherComp if-else 链泛化。
const stateTransitionSpecs = new Map();
export function registerStateTransition(declType, spec) { stateTransitionSpecs.set(declType, spec); }
export function getStateTransitionSpec(declType) { return stateTransitionSpecs.get(declType) || null; }
