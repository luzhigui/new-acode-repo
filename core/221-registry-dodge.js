// core/221-registry-dodge.js — 闪避规则注册表（战斗注册面）
// 从 infra/102-core-utils.js 迁入：闪避是战斗概念，不该住在无业务依赖的 infra。
//   消费方：core/12 注册两条基础规则并遍历（resolveAttackHit / 命中判定）；
//           core/15 注册韦一笑残血幻影闪避；core/11 重置+读取；render/32 读取；ui/74 战斗重置清空。
export const VER = 'core/221-registry-dodge.js V1.0.0';

const _dodgeRules = [];
// 基础规则条数：由 sealBaseDodgeRules() 在基础规则注册完之后写入。
//   以前 clearEliteDodgeRules 写死 length = 2——默认前面永远两条基础规则，
//   加第三条基础规则时会被一起清掉。现在只清「封印之后新加的」（= 精英规则）。
//   初始值 2 是当前实际条数，行为与改前完全一致；正常路径下 sealBaseDodgeRules 会把它刷成真值。
let _baseRuleCount = 2;

export function registerDodgeRule(fn) {
    _dodgeRules.push(fn);
}

// 基础规则注册完之后调用（core/211 末尾）：把当前的条数记成「基数」。
//   之后 clearEliteDodgeRules 只删到这个数为止，基础规则永远留着。
export function sealBaseDodgeRules() {
    _baseRuleCount = _dodgeRules.length;
}

export function clearEliteDodgeRules() {
    _dodgeRules.length = _baseRuleCount;
}

export function getDodgeRules() {
    return _dodgeRules;
}
