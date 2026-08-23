// tests/health-rules/135-break-def-pos.js
// 回归规则：破防显示位置 — 破防发生于 beforeDamageCalc（伤害结算前），应挂在对应攻击组内且先于伤害行
// 复发信号：破防行与所在攻击组的攻击者/目标不一致（_pendingDefReduceFact 泄漏到下一次攻击）/ 破防显示在伤害行之后
// 对应已报 Bug：破防显示位置不对
export const VER = 'tests/health-rules/135-break-def-pos.js V5.5.0';

export const rule82 = {
    group: '战报渲染回归',
    name: '破防显示位置(回归)',
    test: function(ctx, log) {
        var misplace = 0, afterDmg = 0, total = 0;
        for (var i = 0; i < log.length; i++) {
            var e = log[i];
            if (!e || e.type !== 'attack-group' || !e.entries) continue;
            var dmgIdx = -1, brk = null, brkIdx = -1;
            for (var j = 0; j < e.entries.length; j++) {
                var en = e.entries[j];
                if (!en) continue;
                var t = en.text || '';
                if (en.type === 'damage-text' && dmgIdx === -1) dmgIdx = j;
                if (!brk && t.indexOf('🗡️') !== -1 && t.indexOf('破防') !== -1) { brk = en; brkIdx = j; }
            }
            if (!brk) continue;
            total++;
            // 1) 顺序：破防先于伤害结算发生，应在伤害行之前展示
            if (dmgIdx !== -1 && brkIdx > dmgIdx) afterDmg++;
            // 2) 归属：破防行的攻击者/目标应与所在攻击组一致（不一致=破防信息挂错攻击组）
            var plain = (brk.text || '').replace(/<[^>]+>/g, '');
            var m = plain.match(/🗡️\s*(\S+)\s*破防：(\S+)\s*防御/);
            if (m) {
                var head = (e.entries[0] && e.entries[0].text || '').replace(/<[^>]+>/g, '');
                if (head.indexOf(m[1]) === -1 || head.indexOf(m[2]) === -1) misplace++;
            }
        }
        // 3) 游离：破防行不应出现在攻击组之外
        for (var i2 = 0; i2 < log.length; i2++) {
            var e2 = log[i2];
            if (e2 && e2.type !== 'attack-group' && (e2.text || '').indexOf('破防：') !== -1 && (e2.text || '').indexOf('🗡️') !== -1) misplace++;
        }
        if (total === 0 && misplace === 0) return 'skip';
        var msgs = [];
        if (misplace > 0) msgs.push(misplace + '处破防行与所在攻击组攻击者/目标不一致（破防信息挂错位置）');
        if (afterDmg > 0) msgs.push(afterDmg + '处破防显示在伤害行之后（破防先于伤害发生，应前置展示）');
        if (msgs.length > 0) return { fail: true, msg: '复发：' + msgs.join(' | ') };
        return { fail: false };
    }
};
