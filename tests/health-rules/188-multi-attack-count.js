// tests/health-rules/188-multi-attack-count.js
// 体检规则：同一回合「多段出手」的计数口径
//
// 为什么要有这条：一段攻击 ≠ 一次行动权。双击、概率连击、宋青书性奋、鹿角杖法、唐文亮冲刺、
//   同归于尽反噬、召唤兽出手都会让同一单位在一个回合里产出多条 attack/miss/dodge/immune fact。
//   体检此前没有「段数」口径：多段异常增长（重复写入 / 循环没终止 / 身份串号）没人能发现。
//
// 实测结论（2026-11-08 第 191 轮，156 场回放 / 746+ 回合 / 5202 段）：
//   · 段数 2 段 204 例、3 段 4 例、4 段 9 例、6 段 1 例（seed=1 stage=7 第1回合 灭绝师太）——**多段是常态**。
//   · 「第 2 段起必须可溯源（_linkReason / _isLinkAttack / 同回合具名公告）」这条断言**不可用**：
//     实测 48/156 场都有合法多段却完全无标记（鹿杖客、宋青书、母狮等），属主代码未打标记的既有机制，
//     硬判只会天天假红。因此本规则不判溯源，只判下面三条真正稳的结构不变量：
//
//   ① 段数上限 SEG_CAP = 6。超过即「段数失控」（重复写入 / 循环失控 / 身份串号）。
//      ⚠️ 这个常量是实测拟合值，不是引擎真值。若日后出现合法 7 段机制：先确认出处，再把本常量改大并在
//      本文件头写清「哪一局、什么机制、几段」，别默默删规则。
//   ② 同一 (回合, 单位) 的多段里，attacker 的 camp / name 必须一致 —— 抓「同一 uid 前后身份漂移」
//      （例如快照被复用、复活后换了单位对象）。
//   ③ 每一段都要取得到目标：attack/miss/immune 取 target，dodge 取 dodger。取不到 = 空目标出手，渲染必炸。
//
// 行动权归属本身由 183（跨回合）/ 184（同回合死亡与复活）管，本规则只管「段数」这一种计数口径，不重复判。
export const VER = 'tests/health-rules/188-multi-attack-count.js V1.0.1';

const SEG_FACT_TYPES = ['attack', 'miss', 'dodge', 'immune'];
const SEG_CAP = 6;

export const rule188 = {
    group: '行动与目标回归',
    name: '同回合多段出手计数口径(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        const fs = facts || [];
        if (!fs.length) return 'skip';

        let round = null;
        let cur = new Map();     // uid -> [{type, name, camp, hasTarget}]
        let totalSegs = 0;
        const errs = [];

        const flush = function () {
            if (cur.size === 0) return;
            for (const [uid, segs] of cur) {
                const n = segs.length;
                const name = segs[0].name;
                const camp = segs[0].camp;
                if (n > SEG_CAP) {
                    errs.push('第' + round + '回合：' + (name || uid) + ' 单回合出手 ' + n + ' 段，超过上限 ' + SEG_CAP + '（疑似重复写入/循环失控）');
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
        return { fail: false, msg: '多段出手计数口径成立：核对 ' + totalSegs + ' 段，无超过 ' + SEG_CAP + ' 段的失控、无身份漂移、无空目标段' };
    }
};
