#!/usr/bin/env node
// V1.1.0 | 2026-11-21 第35轮：补版本日志行（VER 已抬 V1.1.0，此前日志停在 V1.0.0）。
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
//   三个开关在**主代码 modules/330-battle-init.js 里全都真实存在**：
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
// ═══ 白名单为什么取这 9 个（2026-11-17 第37轮扩到 9 条）═══
//   前 3 个（第 172 轮定）：forceXiaoZhao / forceXieXun / forceWei —— 主代码 330 里全都真实存在，
//   两边各自论证过对方那份的合法性（详见上方「白名单为什么取这三个」一节）。
//
//   ★ 第37轮补的 6 个（本轮逐条核对主代码 330-battle-init.js 的读取面与语义后登记）：
//     · forceZhang    （L181/L191）强制张无忌(Boss)上场 —— 强/精英规则关注面，且 dev 面板有按钮。
//     · forceHanLiSa  （L185/L194）强制寒离飒(强精英)上场 —— V7.6.1 独立通道；盯寒离飒的规则
//                     （138风推/166惑心/175锚位/188多段）全靠随机碰，补登记后不再恒 skip。
//     · forcePang     （L417-422）强制第3关选含「胖远桥」的阵容变体 —— 胖远桥规则(正义国字脸)
//                     需要它才能稳定命中。
//     · forceWeakElite（L128/L132/L229/L537）强制弱精英上场（可带值）—— 弱精英是规则关注面；
//                     注意主代码对它做了入池校验，无效值会 throw。
//     · forceMingUnit （L318-329）强制明教带技能普通兵（如说不得/周颠）上场（可带值）。
//     · forceSectUnit （L624-647）强制六大派带技能角色出场（可带值）—— 敌方角色规则需要它。
//   ⇒ 这 6 个全部在主代码**读取面**里（`force-switch-registry-drift-guard` 的幽灵判定为 0），
//     且都有 dev 面板写入按钮（ui/701）⇒ 登记它们不会造出「白名单里躺着一个主代码根本不读的键」
//     那种静默无效的后门/假绿。
//
// ★ 唯一**不登记**的是 forceSoloWeakElite（L188，V7.5.26「工具强精英单挑」）：
//   它的语义是「只锁寒离飒、不产生第二个精英」，属 dev 调试工具态、不是正常体检形态；
//   定向场次不需要它，也不该由回放器喂进去（喂了会造出线上不会出现的局面）。
//   ⚠ 它在主代码读取面里 ⇒ 守门的「未登记」桶里会一直留着它 1 条（这是**如实反映**，不是漏）。
//     故守门棘轮上限相应地定为 1（只许降不许升）。
//
// ★ 边界（不变）：本白名单只管「定向场次允许用哪些 force 开关」；
//   体检通道（124rule-recipes 的 RULE_META/collectForceFlags）是**另一套**登记面，
//   两者互不覆盖 —— 补了本表不等于体检通道也认（#31 已单独补过体检通道那侧）。
export const VER = 'tests/_lib/forced-case-normalize.mjs V1.1.0';

/**
 * 允许出现在定向覆盖场次里的 GlobalStore 强制开关键。
 * ★ 每个都必须在 modules/330-battle-init.js 里真实存在才可登记（见文件头论证），
 *   不许拿 GlobalStore 当后门改引擎行为。
 */
export const FORCE_KEYS = ['forceXiaoZhao', 'forceXieXun', 'forceWei',
    'forceZhang', 'forceHanLiSa', 'forcePang', 'forceWeakElite', 'forceMingUnit', 'forceSectUnit'];

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
 * 各开关的「空值」形态（与 infra/112-store-schema.js 的类型声明一一对应）。
 * ★ 单一真值源在 schema；本表是它的镜像，任何一方改动都必须同步另一方 ——
 *   断言「本表覆盖 FORCE_KEYS 全集且无多余键、且类型与 schema 一致」由
 *   tests/forced-case-reset-selftest.mjs 盯着。
 */
export const RESET_VALUE = {
    forceHanLiSa: false,
    forceMingUnit: null,     // string 型 ⇒ 空值是 null，不是 false、也不是 ''（'' 会被当成「强制空名」）
    forcePang: false,
    forceSectUnit: null,
    forceWei: false,
    forceXiaoZhao: false,    // BOOLEAN|STRING 双型 ⇒ 用 false 复位（'sister'/'brother' 才是真值）
    forceXieXun: false,
    forceZhang: false,
    forceWeakElite: null,
};

/**
 * 逐场跑之前把全部白名单开关复位 —— 闲置，用来杜绝全局态泄漏。
 * ★ 复位值必须按 **store schema 的真实类型**给，不能一律 false：
 *   infra/112-store-schema.js L104-114 的权威类型是
 *     BOOLEAN：forceHanLiSa / forcePang / forceSoloWeakElite / forceWei / forceXieXun / forceZhang
 *     STRING ：forceMingUnit / forceSectUnit / forceWeakElite（带值开关，值是角色名）
 *     BOOLEAN|STRING：forceXiaoZhao（'sister'/'brother'）
 *   一律设 false ⇒ 对那 3 个 string 键就等于「把字符串键塞了个 boolean」，
 *   GlobalStore.set 会走 schema 校验并**当场抛错**：
 *     [GlobalStore.schema] key='forceWeakElite' forceWeakElite 期望 string，实际 boolean
 *   ⇒ 这不是「多清几个键」的无害差别，是直接把 stat-decl-vs-actual-check 等消费方打崩。
 *   （本条是第37轮补登记时真踩出来的：补登记前白名单只有 3 个 boolean 键，问题不显形。）
 * @param {object} GlobalStore infra/104-global-store.js 的实例
 */
export function resetForces(GlobalStore) {
    for (const k of FORCE_KEYS) GlobalStore.set(k, RESET_VALUE[k]);
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
