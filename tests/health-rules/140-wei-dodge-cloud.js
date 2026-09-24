// 回归规则：流云身法闪避面板数据源 — 面板读 unit.buffDodgeBonus（render/32-grid-render.js getDodgeBreakdown）
// 复发信号：战报出现"💨 流云身法"摘要（buff 已生效），但全体存活队友 buffDodgeBonus 仍为 0
//          → 闪避面板（含韦一笑详情面板）将不显示流云加成也不计入合计
// 对应已报 Bug：韦一笑闪避面板没有考虑流云，有了流云也不显示不加
// V6.0.2 | 成因**重新取证并升级定性**（2026-09-24 第 13 轮）：V6.0.1 注释的"仅 prepareRoundStart 重算、
//   末回合中途授予无重算机会"已**过期**。`e266abc`（V6.1.0 妆造字段剥离）把 `u.buffDodgeBonus =
//   stats.dodgeBonus` 的三处写入（core/11 A 段 / B 段 / 事件载荷）一并删除后，**live 源码已无任何写入点**。
//   取证：全仓（排除 `web/` 部署副本与 tests/）`buffDodgeBonus` 只剩 render/32:97-99 三处**读**点、0 处写点；
//   `git log -S buffDodgeBonus -- core/11battle-round.js` 定位删除点正是 e266abc；core/04:46-55 的
//   computeBuffStats 仍返回 dodgeBonus，而 core/11:187/207 调完后 `stats` / `bStats` 变成
//   **只赋值不使用的死变量**（全文件 grep 仅此两行出现）→ 佐证写入确已断链、非挪到别处。
//   结论：本规则命中的不再是"末回合时序问题"，而是**面板数据源被抽干**——结构性恒红，
//   只要我方流云在场必红，与回合时序无关。修法仍在主代码侧（二选一）：恢复写入
//   （授予/每回合重算即写回 unit），或把 render/32 getDodgeBreakdown 改成实时从 activeBuffs 计算。
//   **不得给本规则加豁免**——那等于掩盖真信号，属兜底。
// 注意：若主代码改为"实时计算"口径，unit.buffDodgeBonus 将不复存在，本规则判据需同步重写（不是放宽）。
export const VER = 'tests/health-rules/140-wei-dodge-cloud.js V6.0.2';

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
                '。已知成因（2026-09-24 重新取证）：该字段在 live 源码已**无写入点**——e266abc 删掉 ' +
                'core/11 的 u.buffDodgeBonus 三处写入后，render/32:97-99 仍在读、core/11:187/207 的 ' +
                'stats/bStats 沦为死变量 → 属主代码侧面板数据源断链（非末回合时序问题），非本规则误报' };
        }
        return { fail: false };
    }
};
