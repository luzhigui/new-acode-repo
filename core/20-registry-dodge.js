// core/20-registry-dodge.js — 闪避规则注册表（战斗注册面）
// V1.0.0 | 2026-10-16 从 infra/51-core-utils.js 迁入：闪避是战斗概念，不该住在无业务依赖的 infra。
//   消费方：core/12 注册两条基础规则并遍历（resolveAttackHit / 命中判定）；
//           core/15 注册韦一笑残血幻影闪避；core/11 重置+读取；render/32 读取；ui/74 战斗重置清空。
export const VER = 'core/20-registry-dodge.js V1.0.0';

const _dodgeRules = [];

export function registerDodgeRule(fn) {
    _dodgeRules.push(fn);
}

export function clearEliteDodgeRules() {
    _dodgeRules.length = 2;
}

export function getDodgeRules() {
    return _dodgeRules;
}
