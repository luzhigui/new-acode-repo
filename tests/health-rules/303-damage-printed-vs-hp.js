// 回归规则：伤害行印数 = 血条实际变化（显示值 vs 实落值同源）—— 303 线（伤害数值与取整域）
// 背景：8993cb73 把伤害行/飘字改为印「dmg − hpBonus」（render/407 L104-106、L209、L217），
//   目的是消掉老 bug「造成 18 而血条只掉 13」。本规则就是这条口径的守门人：
//   任何新分支再把印数算成别的值（只取 dmg、另抄一份减伤、或漏掉 hpBonus），这里直接判红。
// 判据（log 口径，浏览器体检与回放都跑；不依赖 facts）：
//   A. 伤害行正文里的数字 === 该行 dmg 字段（同一出口，逐字同源）
//   B. 血条实落 = hpBefore − hpAfterReal（damage-text 自带实数血量，core/212 snap 透传）
//      · 无护盾证据、非斩杀、未被血量上限截断时：|实落 − 印数| ≤ TOL
//      · TOL = 1 点 = 显示颗粒度上限（fmtNum「≥10 整数 / <10 一位小数」+ 存活最少显示 1 的叠加误差）
// 豁免（不算漏账）：
//   · 斩杀（hpAfterReal ≤ 0）与血量上限截断（printed > hpBefore）：掉落量不是伤害口径
//   · 护盾吸收：吸收量另起一行记账（render 独立行「护盾吸收 N 点伤害 / 抵挡 N 点」），
//     伤害行按吸收前计数 → 本组后面 3 条顶层日志里找到对得上的吸收量，就放过
//   · dmgResult._shield/_permShield > 0（仍有护盾余额）→ 放过
//   · 断锤·耗血：modules/337 每回合 applyStatChange(self,'hp',-selfCost) 静默自损（selfCost=1），
//     不产伤害 fact、不进目标血条、也不印伤害行；它的对象是出手者本人，不在 A→B 上，天然不判。
//     若将来该自损被搬进伤害行，按 TOL=1 点颗粒度放过（要求写死在本规则）。
// 零触发守卫：一局里没有任何可对账的 damage-text → skip。
export const VER = 'tests/health-rules/303-damage-printed-vs-hp.js V1.0.1';
import { collectNodesGrouped, plain } from '../122health-utils.js';

const TOL = 1; // 显示颗粒度（点）
const ABSORB_RE = /护盾吸收\s*(\d+(?:\.\d+)?)\s*点伤害|抵挡\s*(\d+(?:\.\d+)?)\s*点|全部抵挡（(\d+(?:\.\d+)?)\s*点/;

function isNum(v) { return typeof v === 'number' && isFinite(v); }

export const rule303 = {
    group: '伤害数值与取整',
    name: '伤害印数与血条实落同源(回归)',
    test: function (ctx, log) {
        const nodes = collectNodesGrouped(log);
        if (nodes.length === 0) return 'skip';

        // 本组后续顶层日志里的护盾吸收量（吸收行是独立条目，紧跟攻击组）
        function absorbNear(gi, amount) {
            const top = Array.isArray(log) ? log : [];
            for (let k = gi + 1; k <= gi + 3 && k < top.length; k++) {
                const t = plain(top[k] && top[k].text);
                const m = t.match(ABSORB_RE);
                if (!m) continue;
                const v = Number(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]));
                if (isNum(v) && Math.abs(v - amount) <= TOL + 1e-9) return true;
            }
            return false;
        }

        let saw = 0;
        const fails = [];

        for (const { e, gi } of nodes) {
            if (!e || e.type !== 'damage-text') continue;
            const printed = Number(e.dmg);
            const hpBefore = Number(e.hpBefore);
            const hpAfter = Number(e.hpAfterReal);
            if (!isNum(printed) || !isNum(hpBefore) || !isNum(hpAfter)) continue;
            saw++;

            // A. 正文数字 === dmg 字段
            const txt = plain(e.text);
            const m = txt.match(/造成\s*(-?\d+(?:\.\d+)?)\s*伤害/);
            if (m) {
                const printedText = Number(m[1]);
                if (Math.abs(printedText - printed) > 0.05) {
                    fails.push(`正文印 ${m[1]} ≠ dmg 字段 ${printed}（同一行两套数）`);
                }
            }

            // 豁免：斩杀 / 血量上限截断
            if (e.deadFlag || hpAfter <= 0) continue;
            if (printed > hpBefore + TOL) continue;

            const drop = hpBefore - hpAfter;
            const gap = Math.abs(drop - printed);
            if (gap <= TOL + 1e-9) continue;

            // 豁免：护盾吸收（余额 >0 或紧随其后的吸收行能对上差额）
            if ((isNum(e._shield) && e._shield > 0) || (isNum(e._permShield) && e._permShield > 0)) continue;
            if (printed > drop && absorbNear(gi, printed - drop)) continue;

            fails.push(`印 ${printed} 而血条实落 ${Math.round(drop * 10) / 10}（差 ${Math.round(gap * 10) / 10} 点，超显示颗粒度 ${TOL} 点）`);
        }

        if (saw === 0) return 'skip';
        if (fails.length) return { fail: true, msg: fails.slice(0, 4).join('；') };
        return 'pass';
    }
};
