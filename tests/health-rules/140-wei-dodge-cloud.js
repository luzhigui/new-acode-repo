// 回归规则：流云身法闪避面板数据源 — 直接调面板函数 render/32-grid-render.js 的 getDodgeBreakdown，
// 断言「流云身法」这行能读出来（值 > 0）。
// 复发信号：战报出现"流云身法"且末年仍挂在我方，但面板函数返回的 sources 里没有「流云身法」
//          → 闪避面板（含韦一笑详情面板）不显示流云加成，也不计入合计
// 对应已报 Bug：韦一笑闪避面板没有考虑流云，有了流云也不显示不加
// V6.1.0 口径重写（2026-09-25）：原实现断言 unit.buffDodgeBonus > 0 —— 该字段是 V6.1.1 词条化时
//   剥离掉的顶层字段，全库已无写入源，规则因此必然报假（永远读到 0）；面板已改走
//   computeBuffStats().dodgeBonus 现算。本规则改为直接调用被测函数本身，不再复制产品侧实现口径
//   （复制实现 = 产品改了规则不改就一起假绿，正是本次漏检的成因）。
export const VER = 'tests/health-rules/140-wei-dodge-cloud.js V6.1.0';

import { getDodgeBreakdown } from '../../render/32-grid-render.js';

export const rule87 = {
    group: '面板数据回归',
    name: '流云身法闪避面板不生效(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var hasCloud = false;
        for (var i = 0; i < log.length; i++) {
            var e = log[i];
            if (e && e.text && e.text.indexOf('流云身法') !== -1) { hasCloud = true; break; }
        }
        if (!hasCloud) return 'skip';

        // 阵营口径（保留 2026-09-03 修正）：引擎按 buff.target 分流（core/11battle-round.js：
        //   A._activeBuffs = target==='ally' 或无 target；B._activeBuffs = target==='enemy'）。
        // ctx.activeBuffs 是双方合计表；流云挂在敌方时我方本就该是 0，只在确属我方时才继续判。
        var allyBuffs = [];
        var hasCloudBuff = false;
        var ab = ctx.activeBuffs || [];
        for (var c = 0; c < ab.length; c++) {
            if (!ab[c]) continue;
            if (ab[c].target && ab[c].target !== 'ally') continue;
            allyBuffs.push(ab[c]);
            if (ab[c].key === 'cloudBody') hasCloudBuff = true;
        }
        // 流云已过期（末年未挂）时终值为 0 是合法的，跳过，等活到末尾的场次再判
        if (!hasCloudBuff) return 'skip';

        var alive = [];
        for (var j = 0; j < afterA.length; j++) {
            if (afterA[j] && afterA[j].alive) alive.push(afterA[j]);
        }
        if (alive.length === 0) return 'skip';

        // 直接问面板自己的函数：面板看到了什么，这里就断言什么
        var shown = 0;
        for (var k = 0; k < alive.length; k++) {
            var db;
            try {
                db = getDodgeBreakdown(alive[k], allyBuffs, alive);
            } catch (err) {
                return { fail: true, msg: '面板函数异常：' + ((err && err.message) || '未知错误') };
            }
            var src = (db && db.sources) || [];
            for (var s = 0; s < src.length; s++) {
                if (src[s] && src[s].label === '流云身法' && src[s].value > 0) { shown++; break; }
            }
        }
        if (shown === 0) {
            var wei = null;
            for (var m = 0; m < alive.length; m++) {
                if (alive[m].isWei) wei = alive[m];
            }
            return { fail: true, msg: '复发：流云身法末年仍挂在我方，但' + alive.length + '名存活队友的闪避面板都不显示流云加成' +
                (wei ? '（含韦一笑）' : '') };
        }
        return { fail: false };
    }
};
