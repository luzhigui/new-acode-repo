// 回归规则：伤害数字取整颗粒度统一（各伤害出口只认 fmtNum 分档）—— 306 线（伤害数值与取整域）
// 口径真源：infra/102 fmtNum —— 「≥10 取整；<10 保留一位小数」；fmt1 仅用于计算明细行，不进伤害口径。
//   各出口现状（都应走 fmtNum）：主伤害 render/407、爪伤 render/412 L221-227、溅射 render/412/render/409、
//   真伤 render/412、反伤 render/412。任何出口把原始浮点（两位以上小数）直接印出来，或 ≥10 还带小数尾巴，
//   都是「取整口径分家」，这里判红。
// 判据（log 口径，任一不符判红）：
//   A. 伤害类数字不得出现两位及以上小数（浮点尾巴 / 未过 fmtNum）
//   B. |值| ≥ 10 的数字不得带小数部分（fmtNum 应取整）
//   C. 值 <10 的数字最多一位小数
// 按显示颗粒度放过（写死口径，别当漏账）：1 点级差异不在这里判——
//   · 断锤·耗血 modules/337 每回合静默自损 1 点（selfCost=1，applyStatChange 直改 hp，不产伤害 fact、不印伤害行），
//     既不出现在伤害数字里，也不是「印多了/印少了」，故本规则不判它；303 的 TOL=1 点同理放过。
// 零触发守卫：本局没有任何伤害类数字 → skip。
export const VER = 'tests/health-rules/306-damage-rounding-granularity.js V1.0.0';
import { collectNodes, plain } from '../122health-utils.js';

// 只抓「伤害语义」的数字，避免把计算明细行（19.44-30%…）算进来
const PATTERNS = [
    /造成\s*(-?\d+(?:\.\d+)?)\s*(?:点)?伤害/g,
    /伤害被护盾全部抵挡（(\d+(?:\.\d+)?)\s*点）/g,
    /护盾抵挡\s*(\d+(?:\.\d+)?)\s*点/g,
    /(?:溅射|波及)[^0-9]{0,60}?(?:各)?-(\d+(?:\.\d+)?)/g,
    /融会贯通额外\s*[+\-＋－]?\s*(\d+(?:\.\d+)?)/g,
    /反弹\s*(\d+(?:\.\d+)?)\s*点/g,
    /受到\s*(\d+(?:\.\d+)?)\s*点反伤/g
];

export const rule306 = {
    group: '伤害数值与取整',
    name: '伤害数字取整颗粒度统一(回归)',
    test: function (ctx, log) {
        const nodes = collectNodes(log);
        if (nodes.length === 0) return 'skip';

        let saw = 0;
        const fails = [];
        const seen = new Set();

        for (const n of nodes) {
            const text = plain(n && n.text);
            if (!text || !/伤害|溅射|波及|反伤|融会贯通/.test(text)) continue;

            for (const re of PATTERNS) {
                re.lastIndex = 0;
                let m;
                while ((m = re.exec(text)) !== null) {
                    const raw = m[1];
                    const v = Math.abs(Number(raw));
                    saw++;
                    const key = raw + '@' + (m.index || 0);
                    if (seen.has(key)) continue;
                    seen.add(key);

                    // A. 两位及以上小数
                    if (/\.\d{2,}/.test(raw)) {
                        fails.push(`伤害数字「${raw}」带两位以上小数（未经 fmtNum 洗尾）`);
                        continue;
                    }
                    // B. ≥10 还带小数
                    if (raw.indexOf('.') !== -1 && v >= 10) {
                        fails.push(`伤害数字「${raw}」≥10 仍带小数（fmtNum 应取整）`);
                        continue;
                    }
                    // C. <10 超过一位小数（A 已覆盖，双保险）
                    if (Math.abs(v) < 10 && raw.split('.')[1] && raw.split('.')[1].length > 1) {
                        fails.push(`伤害数字「${raw}」<10 小数位超过 1（fmtNum 口径一位）`);
                    }
                }
            }
        }

        if (saw === 0) return 'skip';
        if (fails.length) return { fail: true, msg: fails.slice(0, 4).join('；') };
        return 'pass';
    }
};
