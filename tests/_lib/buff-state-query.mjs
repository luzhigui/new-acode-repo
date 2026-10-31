#!/usr/bin/env node
// tests/_lib/buff-state-query.mjs | V1.0.0 | 2026-11-01 夜间第 171 轮
//
// 「查某个 buff 现在在不在」这一款的**唯一来源**（single source of truth）。
//
// 为什么抽它（本轮实测，不是推想）：
//   second-source-scan 的「跨文件重复函数普查」报**逐字重复 5 组 > 棘轮上限 4**，观察项 FAIL。
//   其中两组落在同一对文件上 —— phantom-confuse-brother-case.mjs 与 xiaozhao-horse-carry-case.mjs
//   各写了一份 `hasActiveBuff`（查团队生效 buff 表 _activeBuffs）与 `permHas`
//   （查单位自己的永久表 state._permanentBuffs），**函数体逐字相同**。
//   ★ 这对文件正是第 170 轮点过名的那一对：那轮核掉一条「打印到解析」的假耦合后，
//     留下一条真正的隐患 —— 同一句报错文案在两个文件里各写一遍。本轮重复普查给出的
//     答案更硬：它们不只是文案重复，是**连判定函数都整份抄了一遍**。
//
// 危险在哪（抄一份又改一点 ⇒ 口径分叉，而两处都跑绿）：
//   这两个函数定的是「某 buff 算不算已生效」，而两条定向用例（兄分支惑心 / 兄永久巨马-carry）
//   的**计数结论直接由它决定**：
//     · phantom 用它数「敌方已生效惑心 ⇒ 该回合跳过」与「兄持永久惑心」两桶；
//     · xiaozhao 用它数「兄永久表有键」与「团队表无键」两层前置。
//   ⇒ 哪天有人只改其中一份的判据（比如把 permHas 的 Array.isArray 判定放宽成只认 truthy），
//     两个用例对同一件事会数出不同的"进入次数"，而**体检照样全绿** —— 与第 122 轮
//     （静默位移白名单收口为唯一来源）、第 133 轮（_lib/rule-branch-extract）同款埋雷。
//
// 行为口径（与两处副本逐字一致，纯搬迁，零行为变化）：
//   · permHas(u, key)：单位存在且其 state._permanentBuffs 是数组，且其中有 b.key === key
//   · hasActiveBuff(side, key)：side 的 _activeBuffs 存在且其中有 b.key === key
//     ★ 注意入参形态不同：前者收**单位**（u.state），后者收**阵营侧对象**（直接是数组），
//       搬迁时一律照抄，不"顺手统一" —— 统一是好事，但那是改行为，须单独拍板。
//
// 收口后棘轮变化：逐字重复 5 组 → 3 组（剩 fail×3 / normalizeForces×2 / parentDmgOf×2），
//   落回上限 4 以内 ⇒ second-source-scan 观察项由 FAIL 转 PASS。★ 上限未抬、判据未放宽。
//
// ★ VER 必须带（第 171 轮自踩：本件出生时漏写，ver-drift-selftest 断言⑩ 当场判「新增孤儿、
//   版本无从追溯」开红 —— 与第 170 轮「抬了 VER 常量却漏登记处」同款，绊线咬的是真会犯的错）。
export const VER = 'tests/_lib/buff-state-query.mjs V1.0.0';

/**
 * 单位是否持有某个**永久** buff（读 u.state._permanentBuffs）。
 * @param {object} u 单位对象
 * @param {string} key buff 键
 * @returns {boolean}
 */
export function permHas(u, key) {
    return !!(u && Array.isArray(u.state && u.state._permanentBuffs)
        && u.state._permanentBuffs.some(b => b.key === key));
}

/**
 * 阵营侧**生效中**的 buff 表里是否有某个键（读 side._activeBuffs）。
 * @param {object} side 阵营侧对象（ally / enemy 的 battleState 分片）
 * @param {string} key buff 键
 * @returns {boolean}
 */
export function hasActiveBuff(side, key) {
    const arr = side && side._activeBuffs;
    return !!(arr && arr.some(b => b && b.key === key));
}
