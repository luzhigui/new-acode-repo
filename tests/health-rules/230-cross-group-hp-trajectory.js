// 同回合相邻同目标血量链连续性（跨攻击组）：同一回合里，同一个受击单位相邻两击的血量必须接得上——
//   第二击的「链前值」只能来自两种合法起点：① 前击的链前值（同一 step 多个攻击组共用 step 起点快照，
//   实测「张无忌 232→204」与「232→218」并存）；② 前击的链后值（跨 step 顺序结算）。
//   除此之外的任何第三个起点，都说明这中间有血量变化没在战报里入账（典型的「静默回血」：
//   引擎以 _events(HP_CHANGE) 在组末入账、渲染层不产出行，如张三丰 159→174 无回血行）。
// 判据来源（2026-11-08）：全量 156 场（20 种子 × 关卡 1~7 + 定向场次）实测：
//   判过 75 场 / 断点 41 场 / 无可判相邻对 40 场；抽检断点明细全部是「血量上升」——
//   即中间那笔回血在日志里没有任何行（静默回血，引擎以 _events(HP_CHANGE) 在组末入账）。
//   更宽的「同回合同目标相邻命中」口径先做过探针：737 对里 57 同快照 + 611 顺序 + 69 断点，
//   但 69 里真假混杂（真伤/溅射等未带 uid 的账目也会落进来）。落地版按「宁可先只覆盖纯伤害段」
//   收窄为**日志里紧挨着的两击**：中间只要插进任何别的条目，就无法证明账目闭合 ⇒ 清基线不判。
//   这样不会把「未入账事件」当成规则假绿，也不会把「真断点」洗掉——判据本身一字未放宽。
// 覆盖边界（只判「纯伤害段」）：
//   · 回合分隔符（round-start/round-end）重置轨迹；
//   · 该单位出现任何已入账的血量变化（回血条目/组级回血/溅射/白骨爪/复活·回春类文案）⇒ 清掉前一击，
//     下一击重新取基线，不再跨着这笔账判（谁的账、什么时候入账）。
//   · 文案类回血若拿不到 uid（buff-splash 无 uid）⇒ 保守清空全部轨迹，宁可少判也不误判。
// V1.0.1（2026-11-08 血量判死域复核，修 3 类假断点，判据不放宽）：
//   ① 闪避组取错血主：render/407 L56 里闪避组 `uidA = 闪避者`、`uidD = 被反击的攻方`，
//      而 L67 的 damage-text 记的是**攻方**血量；旧版取 uidA ⇒ 两连闪里两个不同攻方的血
//      记到同一个闪避者名下（74→45 鹿杖客 / 70→41 莫声谷 判成同一血链）。改两种组统一取 uidD。
//   ② 组内渲染顺序 ≠ 结算顺序：回血条目排在伤害行之后（本击链前=回血后值）⇒ 判伤害行前先清基线。
//   ③ 链后额外扣血：张无忌融会贯通由 core/12 在主结算后单独扣血（本组链后值 ≠ 真值）⇒ 同样先清基线。
//   ④ 1 点级差异按显示颗粒度放过（断锤·耗血 每回合自损 1 点，modules/337 L116 record=false 无 fact）。
export const VER = 'tests/health-rules/230-cross-group-hp-trajectory.js V1.0.1';
import { plain } from '../122health-utils.js';

var HEAL_TEXT = /回血|回春|复活|回复|吸血|吸取|治疗|生生不息/;
// 链后额外扣血（不是回血，但同样让伤害行的链后值不等于真值）：融会贯通 / 伤害加深声明
var EXTRA_DMG_TEXT = /融会贯通额外|伤害加深/;
// 显示颗粒度 = 1 点：血量链只用两位显示值接龙，1 点内的差异要么是取整越界，
//   要么是「断锤·耗血」这类 1 点级静默自损（modules/337 L116 applyStatChange record=false，无 fact）。
//   这类 1 点差异无法归因，按显示颗粒度放过（宁漏勿误）。
var NOISE = 1;

export const rule230 = {
    group: '战报与渲染一致性',
    name: '同回合相邻同目标血量链连续性',
    test: function(ctx, log) {
        var tol = NOISE;
        var flat = [];
        for (var i = 0; i < (log || []).length; i++) {
            var e0 = log[i];
            if (Array.isArray(e0)) { for (var j = 0; j < e0.length; j++) if (e0[j]) flat.push(e0[j]); }
            else if (e0) flat.push(e0);
        }
        var state = {};          // uid -> {before, after}：该单位本回合最近一次命中链
        var lastG = {};          // uid -> 该命中所在的 log 下标
        function clearUnit(uid) { if (uid == null) return; state[uid] = null; lastG[uid] = -1; }
        function clearAll() { state = {}; lastG = {}; }
        var pairs = 0;           // 实际参与判定的相邻对数（不含被清空跳过的）
        var sameSnap = 0, sequential = 0;
        for (var g = 0; g < flat.length; g++) {
            var e = flat[g];
            if (!e) continue;
            if (e.type === 'round-start' || e.type === 'round-end') { clearAll(); continue; }
            if (e.type !== 'attack-group') continue;

            // 组级血量变化入账（休息/生生不息回血、组级 healAmount）
            if ((e.isRest || e.isEndlessBreath) && e.uidA != null) clearUnit(e.uidA);
            if (e.healAmount > 0 && e.healUnitUid != null) clearUnit(e.healUnitUid);

            var entries = e.entries || [];
            // ── 组内预扫：渲染顺序 ≠ 结算顺序（V1.0.1 补）──
            // ① 回血条目（如「🩹 周芷若 静默回复+30（35 → 65）」）在组内排到伤害行之后，
            //   但数值上先于本击（本击链前=65 正是回血后的值）；先清基线再判，否则当断点（seed=2 stage=4 实证）。
            // ② 链后额外扣血声明（张无忌「🔥 融会贯通额外+36」由 core/12 在主攻击结算后单独扣血）
            //   会让「本组链后值」比真值高，下一击链前直接跳过去；同样先清基线（seed=4 stage=2 实证）。
            var extraAfter = false;   // 本组存在「链后额外扣血」声明：组末链值不是真值，组后必须清基线
            for (var k0 = 0; k0 < entries.length; k0++) {
                var s0 = entries[k0];
                if (!s0) continue;
                var t0 = plain(s0.text || '');
                if ((s0.isHealEntry && s0.healAmount > 0)
                    || ((s0.type === 'info' || s0.type === 'detail' || s0.type === 'buff-splash')
                        && (HEAL_TEXT.test(t0) || EXTRA_DMG_TEXT.test(t0)))) {
                    if (s0.healUnitUid != null) clearUnit(s0.healUnitUid);
                    else clearAll();
                    if (EXTRA_DMG_TEXT.test(t0)) extraAfter = true;
                }
            }
            for (var k = 0; k < entries.length; k++) {
                var s = entries[k];
                if (!s) continue;
                // 已入账回血（带 uid 的精确清，不带 uid 的保守全清）
                if (s.isHealEntry && s.healAmount > 0) {
                    if (s.healUnitUid != null) clearUnit(s.healUnitUid);
                    else clearAll();
                    continue;
                }
                // 溅射：目标血量变了，但 splash 行不含前后值，无法接链 ⇒ 清该目标基线
                if (Array.isArray(s.splashUids)) {
                    for (var si = 0; si < s.splashUids.length; si++) clearUnit(s.splashUids[si]);
                }
                // 白骨爪：有 hpAfter 但没有链前值，无法接链 ⇒ 清该目标基线
                if (s.clawTargetUid != null && s.hpAfter !== undefined) clearUnit(s.clawTargetUid);
                // 文案类回血/复活：拿不到 uid 就全清（保守，只判纯伤害段）
                if ((s.type === 'info' || s.type === 'detail' || s.type === 'buff-splash') && HEAL_TEXT.test(plain(s.text))) {
                    if (s.healUnitUid != null) clearUnit(s.healUnitUid);
                    else clearAll();
                }
                if (s.type !== 'damage-text') continue;
                // 只认「链式结算」行（A → B）；无链的行（闪避飘字等）不构成血量轨迹
                var chain = plain(s.text).match(/([\d.]+)\s*→\s*([\d.]+)/);
                if (!chain) continue;
                var cb = parseFloat(chain[1]), ca = parseFloat(chain[2]);
                if (!isFinite(cb) || !isFinite(ca)) continue;
                // 血主 = uidD：普通组的 damage-text 记受击目标（uidD）；闪避组的 uidA 是**闪避者**、
                //   uidD 才是被反击的攻方，而 damage-text 记的正是攻方的 attackerHpBefore→attackerHpAfter
                //   （render/407 L56/L67：`uidA:target.uid, uidD:unit.uid`）。两种组统一取 uidD。
                var uid = e.uidD;
                if (uid == null) continue;
                var prev = state[uid];
                // 只判「日志里紧挨着的两击」：中间只要插进任何别的条目（真伤/溅射/回血/台词…），
                //   就无法证明血量账目闭合 ⇒ 清基线、不判（宁可少判，也不拿未入账事件当断点）
                if (prev && lastG[uid] !== g - 1) { prev = null; }
                if (prev) {
                    pairs++;
                    var hitBefore = Math.abs(cb - prev.before) <= tol;
                    var hitAfter = Math.abs(cb - prev.after) <= tol;
                    if (!hitBefore && !hitAfter) {
                        return { fail: true, msg: '血量轨迹断点：同回合相邻两击接不上——前击 ' + prev.before + '→' + prev.after + '，本击链前 ' + cb + '→' + ca + '（' + (e.isDodge ? '闪避反击攻方 uid=' + e.uidD : '目标 ' + (e.targetName || e.uidD)) + '；中间血量变化未入账）' };
                    }
                    if (hitBefore) sameSnap++; else sequential++;
                }
                state[uid] = { before: cb, after: ca };
                lastG[uid] = g;
            }
            // 链后额外扣血在本组结算之后才落账 ⇒ 组末链值不是该单位真实血量，下一击不能接它
            if (extraAfter) clearAll();
        }
        if (pairs === 0) return 'skip';   // 本场没有可判的相邻对（全是首击或被账目清空）
        return { fail: false, msg: '同回合相邻同目标血量链连续：' + pairs + ' 对（同快照 ' + sameSnap + ' / 顺序 ' + sequential + '）' };
    }
};
