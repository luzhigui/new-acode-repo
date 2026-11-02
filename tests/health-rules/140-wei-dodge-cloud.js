// 回归规则：流云身法闪避面板数据源 — 直接调面板函数 render/403-grid-render.js 的 getDodgeBreakdown，
// 断言「流云身法」这行能读出来（值 > 0）。
// 复发信号：战报出现"流云身法"且末年仍挂在我方，但面板函数返回的 sources 里没有「流云身法」
//          → 闪避面板（含韦一笑详情面板）不显示流云加成，也不计入合计
// 对应已报 Bug：韦一笑闪避面板没有考虑流云，有了流云也不显示不加
export const VER = 'tests/health-rules/140-wei-dodge-cloud.js V6.1.2';

import { getDodgeBreakdown } from '../../render/403-grid-render.js';
import { getGameData } from '../../core/201-config-5v5-test.js';

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

        // 阵营口径（保留 2026-09-03 修正）：引擎按 buff.target 分流（core/210-battle-round.js：
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
        // 流云已过期（末年未挂）时终值为 0 是合法的——但原写法直接 skip 会导致本规则**恒空转**
        //   （cloudBody 只持续 4 回合，样本战斗普遍 6~14 回合，末年必过期 ⇒ 150 场全 skip，
        //    规则空转自检 + 覆盖率两项同时报红）。改走「合成 buff 直测面板」：构造一条 cloudBody，
        //    用末年存活单位问 getDodgeBreakdown，断言面板能读出「流云身法」——仍是对「面板数据源」
        //    的实打实回归守卫（面板若不再读 cloudBody，合成后 sources 依然没有该行 → 照样报红），
        //    且不再受 buff 生命周期影响，恒能取证。
        if (!hasCloudBuff) {
            if (!getGameData()) return 'skip';
            var anyAlive = (afterA || []).filter(function (x) { return x && x.alive; });
            if (anyAlive.length === 0) return 'skip';
            var synthBuff = [{ key: 'cloudBody', target: 'ally', remaining: 1 }];
            var shownS = 0;
            for (var q = 0; q < anyAlive.length; q++) {
                var dbS;
                try { dbS = getDodgeBreakdown(anyAlive[q], synthBuff, anyAlive); }
                catch (errS) { return { fail: true, msg: '面板函数异常(合成流云)：' + ((errS && errS.message) || '未知错误') }; }
                var srcS = (dbS && dbS.sources) || [];
                for (var sS = 0; sS < srcS.length; sS++) {
                    if (srcS[sS] && srcS[sS].label === '流云身法' && srcS[sS].value > 0) { shownS++; break; }
                }
            }
            if (shownS === 0) {
                return { fail: true, msg: '复发：流云身法面板数据源失效——合成 cloudBody buff 后，' + anyAlive.length + ' 名存活队友的面板仍不显示流云加成（面板不再读 cloudBody）' };
            }
            return { fail: false };
        }

        var alive = [];
        for (var j = 0; j < afterA.length; j++) {
            if (afterA[j] && afterA[j].alive) alive.push(afterA[j]);
        }
        if (alive.length === 0) return 'skip';

        // 数据就绪防御（与 147/148 同款）：getDodgeBreakdown → computeBuffStats → CONFIG.BUFFS getter
        //   内部走 getGameData()，未就绪返回 null 即抛 null.buffs，被下方 catch 吞成「面板函数异常」。
        //   数据没就绪时本项判不了，skip 宁漏勿误。
        if (!getGameData()) return 'skip';

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
