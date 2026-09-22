// 回归规则：流云身法闪避面板数据源 — 面板读 unit.buffDodgeBonus（render/32-grid-render.js getDodgeBreakdown）
// 复发信号：战报出现"💨 流云身法"摘要（buff 已生效），但全体存活队友 buffDodgeBonus 仍为 0
//          → 闪避面板（含韦一笑详情面板）将不显示流云加成也不计入合计
// 对应已报 Bug：韦一笑闪避面板没有考虑流云，有了流云也不显示不加
// V6.0.1 | 补充"末回合中途授予"成因说明。**未加豁免**：判定误报需先证伪该成因，掩盖真信号即兜底。
//   已知成因（2026-09-22 取证）：unit.buffDodgeBonus 只在 prepareRoundStart 重算
//   （core/11 L187-191 computeBuffStats 写入），回合中途新授予的流云无下一次重算机会，
//   故 GAMEOVER 时终值恒 0，而 buff 本身仍挂在 activeBuffs（未过期）→ 本规则命中。
//   这是主代码侧真实缺陷（面板读该字段，render/32 getDodgeBreakdown），修法应为
//   "授予即重算"，而非给本规则加跳过条件。下轮迭代如欲加豁免，须先证明该场流云
//   确实在末回合 prepareRoundStart 之前已存在。
// 注意：若主代码后续把面板改为实时从 activeBuffs 计算（而非 buffDodgeBonus 字段），本规则需同步调整口径
export const VER = 'tests/health-rules/140-wei-dodge-cloud.js V6.0.1';

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
        var cloudBuff = null;
        var ab = ctx.activeBuffs || [];
        for (var c = 0; c < ab.length; c++) {
            if (ab[c] && ab[c].key === 'cloudBody') { cloudBuff = ab[c]; break; }
        }
        // 阵营口径修正：引擎按 buff.target 分流（core/11battle-round.js：
        //   A._activeBuffs = target==='ally' 或无 target；B._activeBuffs = target==='enemy'）。
        // ctx.activeBuffs 是**双方合计**表，原实现只看"表里有没有流云"就断言我方闪避必 >0；
        // 若流云挂在敌方(target='enemy')，我方 buffDodgeBonus 本就该是 0 —— 属误报。
        // 只在流云确属我方（target==='ally' 或无 target）时才继续判，避免把合法 0 报成回归。
        if (!cloudBuff) return 'skip';
        if (cloudBuff.target && cloudBuff.target !== 'ally') return 'skip';

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
                (wei ? '（含韦一笑，闪避面板将不显示流云加成）' : '（闪避面板将不显示流云加成）') +
                '。已知成因：该字段仅 prepareRoundStart 重算(core/11 L187-191)，末回合中途授予的流云' +
                '无下一次重算机会 → 属主代码侧"授予即重算"缺失，非本规则误报' };
        }
        return { fail: false };
    }
};
