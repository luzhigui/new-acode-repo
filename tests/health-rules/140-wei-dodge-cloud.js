// tests/health-rules/140-wei-dodge-cloud.js
// 回归规则：流云身法闪避面板数据源 — 面板读 unit.buffDodgeBonus（render/32-grid-render.js getDodgeBreakdown）
// 复发信号：战报出现"💨 流云身法"摘要（buff 已生效），但全体存活队友 buffDodgeBonus 仍为 0
//          → 闪避面板（含韦一笑详情面板）将不显示流云加成也不计入合计
// 对应已报 Bug：韦一笑闪避面板没有考虑流云，有了流云也不显示不加
// 注意：若主代码后续把面板改为实时从 activeBuffs 计算（而非 buffDodgeBonus 字段），本规则需同步调整口径
export const VER = 'tests/health-rules/140-wei-dodge-cloud.js V5.5.0';

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

        // 口径修正（2026-09-03）：buffDodgeBonus 是"当前值"镜像，每回合 prepareRoundStart 重算并发射
        // STAT_BONUS_CHANGE 覆盖写入。流云在战斗中途过期后，末轮重算会合法地把字段清回 0——
        // 此时终值为 0 不代表链路坏了。只有 GAMEOVER 时流云仍挂在 activeBuffs（末轮生效），
        // 终值才必须 > 0；已过期的场次跳过，等流云活到末尾的场次再判。
        var cloudStillOn = false;
        var ab = ctx.activeBuffs || [];
        for (var c = 0; c < ab.length; c++) {
            if (ab[c] && ab[c].key === 'cloudBody') { cloudStillOn = true; break; }
        }
        if (!cloudStillOn) return 'skip';

        var alive = [];
        for (var j = 0; j < afterA.length; j++) {
            if (afterA[j] && afterA[j].alive) alive.push(afterA[j]);
        }
        if (alive.length === 0) return 'skip';

        var withBonus = 0;
        for (var k = 0; k < alive.length; k++) {
            if ((alive[k].buffDodgeBonus || 0) > 0) withBonus++;
        }
        if (withBonus === 0) {
            var wei = null;
            for (var m = 0; m < alive.length; m++) {
                if (alive[m].isWei) wei = alive[m];
            }
            return { fail: true, msg: '复发：流云身法已生效，但' + alive.length + '名存活队友 buffDodgeBonus 全为0' +
                (wei ? '（含韦一笑，闪避面板将不显示流云加成）' : '（闪避面板将不显示流云加成）') };
        }
        return { fail: false };
    }
};
