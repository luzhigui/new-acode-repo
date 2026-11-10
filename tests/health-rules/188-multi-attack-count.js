// tests/health-rules/188-multi-attack-count.js
// 体检规则：同一回合「多段出手」的计数口径（观察项）
//
// 为什么要有这条：一段攻击 ≠ 一次行动权。双击、概率连击、宋青书性奋、鹿角杖法、唐文亮冲刺、
//   同归于尽反噬、召唤兽出手都会让同一单位在一个回合里产出多条 attack/miss/dodge/immune fact。
//   体检此前没有「段数」口径：多段异常增长（重复写入 / 循环没终止 / 身份串号）没人能发现。
//
// ★ 段数阈值 6 只是实测拟合，不是引擎真值（2026-11-08 第 192 轮取证）：
//   引擎侧没有任何段数上限常量 —— core/209 的额外出手只按 extraRequests 逐条追加，靠
//   _isLinkAttack 防「同类触发乒乓」，没有计数上限；主回合又是 _acted 一人一手，所以
//   「本回合段数」= 1 次主行动 + N 次被动/联动追加，N 由机制触发链决定，理论上不封顶。
//   实测（156 场 / 5202 段）最高 6 段（seed=1 stage=7 第 1 回合 灭绝师太），2 段 204 例、
//   3 段 4 例、4 段 9 例、6 段 1 例 ⇒ 6 是当前样本见过的最大值，不是规则边界。
//   （第 195 轮复跑出现 7 段样本：seed=2 stage=7 第 8 回合 灭绝师太 —— 同样只打 observe。）
//   因此 6 只作【观察阈值】：超过时打 observe（回放汇总进「观察项」段，不计红、不计退码），
//   供人工研判「是合法新机制，还是重复写入/循环失控/身份串号」。若日后确认某机制合法 7 段，
//   把阈值改大并在本文件头写清「哪一局、什么机制、几段」即可，别默默删规则。
//
// 仍按硬判据（fail 报红）的仍然只有两条真正稳的结构不变量：
//   ① 同一 (回合, 单位) 的多段里，attacker 的 camp / name 必须一致 —— 抓「同一 uid 前后身份漂移」
//      （例如快照被复用、复活后换了单位对象）。
//   ② 每一段都要取得到目标：attack/miss/immune 取 target，dodge 取 dodger。取不到 = 空目标出手，渲染必炸。
//
// ★ 第 195 轮想用 `_linkReason` 把段数升硬判，实测证伪（记录在此，别再试一遍）：
//   假设是「每回合 1 次主行动 + 只走 runExtraAttackRequests 的追加段，所以 _linkReason 为空的段最多 1 段」。
//   实测 156 场里 124 场红（如 seed=1 stage=1 第5回合 寒离飒 2 段无 reason、seed=1 stage=4 宋青书/莫声谷同回合 2 段），
//   原因是**一次追加请求内部也会结算多段**（双击/连击/多目标连打）—— 段与请求不是一对一。
//   结论：没有「请求归属」就区分不了『一次请求多段』与『主行动重复执行』。
//   转交主代码（tests/known-transfers.md 第 195 轮条目）：给 attack/miss/dodge/immune fact 加 `_requestId`
//   （同一个 runExtraAttackRequests 请求内所有段同 id），体检才能把「同 requestId 多段」与「同回合多请求」分开，
//   段数上限才升得成硬判。
//
// 行动权归属本身由 183（跨回合）/ 184（同回合死亡与复活）管，本规则只管「段数」这一种计数口径，不重复判。
// V1.1.2 | 2026-11-10 第 202 轮：fact 类型表收口到 _lib/static-truth-slice.mjs 的 FACT_TYPE_MISS（取值一字未动）。
export const VER = 'tests/health-rules/188-multi-attack-count.js V1.1.2';

// fact 类型表走公共件（第 202 轮「一事一源」收口，原先本文件手抄一份）
import { FACT_TYPE_MISS as SEG_FACT_TYPES } from '../_lib/static-truth-slice.mjs';
const SEG_OBSERVE = 6; // 观察阈值（实测拟合值，非引擎上限；见头注）

export const rule188 = {
    group: '行动与目标回归',
    name: '同回合多段出手计数口径(观察项)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        const fs = facts || [];
        if (!fs.length) return 'skip';

        let round = null;
        let cur = new Map();     // uid -> [{type, name, camp, hasTarget}]
        let totalSegs = 0;
        let maxSeg = 0, maxSegWho = null, maxSegRound = null;
        const errs = [];         // 硬判据：身份漂移 / 空目标
        const observes = [];     // 观察项：段数超过实测阈值

        const flush = function () {
            if (cur.size === 0) return;
            for (const [uid, segs] of cur) {
                const n = segs.length;
                const name = segs[0].name;
                const camp = segs[0].camp;
                if (n > maxSeg) { maxSeg = n; maxSegWho = name || uid; maxSegRound = round; }
                if (n > SEG_OBSERVE) {
                    observes.push('第' + round + '回合：' + (name || uid) + ' 单回合 ' + n + ' 段（观察阈值 ' + SEG_OBSERVE +
                        '，引擎无硬上限，需人工研判是否循环失控/身份串号）');
                    continue;
                }
                for (let k = 1; k < n; k++) {
                    const s = segs[k];
                    if (s.name && name && s.name !== name) {
                        errs.push('第' + round + '回合：同一 uid(' + uid + ') 段间名字漂移：' + name + ' → ' + s.name);
                    }
                    if (s.camp && camp && s.camp !== camp) {
                        errs.push('第' + round + '回合：' + (name || uid) + ' 段间阵营漂移：' + camp + ' → ' + s.camp);
                    }
                }
            }
            cur = new Map();
        };

        for (const f of fs) {
            if (!f || !f.factType) continue;
            const d = f.data || {};

            if (f.factType === 'roundStart') { flush(); round = d.round; continue; }
            if (SEG_FACT_TYPES.indexOf(f.factType) < 0) continue;

            const a = d.attacker;
            if (!a || a.uid == null) continue;
            const t = d.target || d.dodger;
            const hasTarget = !!(t && t.uid != null);
            const list = cur.get(a.uid) || [];
            list.push({ type: f.factType, name: a.name || null, camp: a.camp || null, hasTarget });
            cur.set(a.uid, list);
            totalSegs++;
            if (!hasTarget) errs.push('第' + round + '回合：' + (a.name || a.uid) + ' 的 ' + f.factType + ' 段取不到目标（空目标出手）');
        }
        flush();

        if (totalSegs === 0) return 'skip';
        if (errs.length) {
            return {
                fail: true,
                msg: errs.slice(0, 3).join('；') + (errs.length > 3 ? '（共 ' + errs.length + ' 处）' : '')
            };
        }
        if (observes.length) {
            return {
                fail: false,
                observe: observes.slice(0, 3).join('；') + (observes.length > 3 ? '（共 ' + observes.length + ' 处）' : ''),
                msg: '多段出手计数：核对 ' + totalSegs + ' 段，最高 ' + maxSeg + ' 段（' + maxSegWho + ' 第' + maxSegRound + '回合），超观察阈值 ' + observes.length + ' 处'
            };
        }
        return { fail: false, msg: '多段出手计数：核对 ' + totalSegs + ' 段，最高 ' + maxSeg + ' 段（' + maxSegWho + ' 第' + maxSegRound + '回合），未超观察阈值 ' + SEG_OBSERVE };
    }
};
