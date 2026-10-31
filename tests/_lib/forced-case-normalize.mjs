#!/usr/bin/env node
// tests/_lib/forced-case-normalize.mjs | V1.0.0 | 2026-11-01 夜间第 172 轮
//
// 「定向覆盖场次能按哪些强制开关」这一款的**唯一来源**（single source of truth）。
//
// ═══ 为什么抽它：不是重复洁癖，是三条口径已经分叉 ═══
//   本轮开场扫 `FORCE_KEYS` 发现 tests/ 下**三份各自维护**的白名单：
//     · tests/fact-emission-census.mjs       L100  ['forceXiaoZhao', 'forceXieXun']
//     · tests/stat-decl-vs-actual-check.mjs  L171  ['forceXiaoZhao', 'forceXieXun']
//     · tests/rules-replay.mjs               L158  ['forceXiaoZhao', 'forceWei']   ← ★ 不一样
//   ⇒ 上面两处收 forceXieXun 拒 forceWei，规则回放反过来收 forceWei 拒 forceXieXun。
//
//   为什么它一直没被机器抓到（重复普查的结构性盲区，必须记下来）：
//     · 前两份**函数体逐字相同** ⇒ 落在「逐字重复」那一桶（第二份快照普查一直在报）；
//     · 第三份**连函数名都不一样**（叫 forcesOfEntry，且用 indexOf 不用 includes）
//       ⇒ 既不同名也不同体，两把尺子都漏 ⇒ 它一直躺在「同名异体 13 组待人工判定」里。
//   ★ 换句话说：机械判据「同名 ∪ 同体」盖不住「换个名字重写一遍」——这是第 170/171 轮同款病的
//     第五种形态（前三轮分别是看不见 / 自产假阳性 / 整份抄 / 命名三轨）。
//
// 它不是洁癖，是已经造成的能力缺口：
//   · 想给**规则回放**喂谢逊相关规则（164 之外的 forceXieXun 场次）⇒ 当场抛错，连试都试不了；
//   · 想给**两本事实账本**喂韦一笑（forceWei，挂账 164 吸血上限那条正是走它）
//     ⇒ 同样当场抛错。
//   两条挂账（164 吸血上限 / 谢逊系规则）被这条分叉卡住，因为「这条路开不通」看不出来在哪报错。
//
// ═══ 白名单为什么取这三个（并集），是谁批的 ═══
//   三个开关在**主代码 modules/29battle-init.js 里全都真实存在**：
//     forceXiaoZhao L144-145 / L245 ；forceWei L140 / L151 ；forceXieXun L141 / L152。
//   ★ 关键是：当初两边**各自论证过对方那份的合法性，只是都没同步给对方** ——
//     第 159 轮在两本账本加 forceXieXun 时写「主代码 29battle-init L95 / L139-147 真实存在」；
//     第 160 轮在规则回放加 forceWei 时写「29battle-init L140 / L151 真实存在」。
//     ⇒ 本轮合并不是凭开放行，是把**双方各自已经验过**的开关登记成同一份清单。
//
// ★ 边界：主代码 L148 的 anyForce 一共认 6 个开关，本件只登记 3 个 ——
//   剩 forceZhang / forceHanLiSa / forceSoloWeak 三个**主代码里有、tests 侧从未登记**，
//   本轮**不顺手加**（那是扩能力，属请拍板），如实列为下轮待办。
//
// 行为口径（纯搬迁，两份报表侧与规则回放侧各自的返回值形态照抄）：
//   · normalizeForces(entry)  → 恒返回对象（可能为空对象 {}）  ← 报表侧原样
//   · forcesOfEntry(entry)    → 无键时返回 null                ← 规则回放侧原样
//   ★ 两者差一个「空的时候返 {} 还是 null」。调用点写着 `Object.keys(forces || {})`，两种都能跑，
//     统一成一种最干净，但那是**改行为**，须单独拍板（与第 171 轮 permHas/hasActiveBuff 入参
//     形态照抄不顺手统一，同一口气）。本轮零行为变化。
//
// ★ VER 必须带（前车之鉴：第 171 轮本族新件出生时漏写 VER，ver-drift-selftest 断言⑩ 当场开红，
//   判「新增孤儿、版本无从追溯」——绊线咬的正是真会犯的错，别嫌啰嗦）。
export const VER = 'tests/_lib/forced-case-normalize.mjs V1.0.0';

/**
 * 允许出现在定向覆盖场次里的 GlobalStore 强制开关键。
 * ★ 每个都必须在 modules/29battle-init.js 里真实存在才可登记（见文件头论证），
 *   不许拿 GlobalStore 当后门改引擎行为。
 */
export const FORCE_KEYS = ['forceXiaoZhao', 'forceXieXun', 'forceWei'];

/**
 * 把一个场次条目归一化成「开关名 → 取值」表。
 * 兼容两种写法：单值 force 字段（等价于 forces:{forceXiaoZhao:force}）与 forces 对象。
 * @returns {object} 恒返回对象；无开关时为 {}
 */
export function normalizeForces(entry) {
    return collect(entry, {});
}

/**
 * 同 normalizeForces，但无开关时返回 null（规则回放侧历史形态，照抄不改）。
 * @returns {object|null}
 */
export function forcesOfEntry(entry) {
    return collect(entry, null);
}

/**
 * 逐场跑之前把全部白名单开关复位为 false —— 闲置，用来杜绝全局态泄漏。
 * @param {object} GlobalStore infra/54-global-store.js 的实例
 */
export function resetForces(GlobalStore) {
    for (const k of FORCE_KEYS) GlobalStore.set(k, false);
}

// 内部唯一实现：两个导出名共用，保证口径不可能分叉。
function collect(entry, empty) {
    const out = {};
    if (entry && entry.force) out.forceXiaoZhao = entry.force;
    if (entry && entry.forces) {
        for (const [k, v] of Object.entries(entry.forces)) {
            if (!FORCE_KEYS.includes(k)) {
                throw new Error(
                    "定向覆盖场次用了未登记的强制开关 '" + k + "'（白名单：" + FORCE_KEYS.join(', ') + "）"
                );
            }
            out[k] = v;
        }
    }
    return Object.keys(out).length ? out : empty;
}
