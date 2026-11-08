// 回归规则：破防显示位置 + 破防量 — 破防发生于 beforeDamageCalc（伤害结算前），应在攻击组最前面（波动行之前）；
//   破防量（防御 -X）取自 core/01config WARRIOR_BREAK_DEF_TIERS（V6.1.3 参数三源收敛后集中管理，reduce 仅可能为 2/3/4）。
// 复发信号：
//   1. 破防行挂在攻击组末尾（fact.entries 被压到伤害行之后）
//   2. 破防行的攻击者/目标与所在攻击组不一致（破防信息挂错攻击组）
//   3. 破防行游离在攻击组之外
//   4. 破防量 -X 不在合法区间 (0, 4]（V6.1.3 分档回归：reduce 归零/越界 = 破防逻辑回退）
export const VER = 'tests/health-rules/135-break-def-pos.js V6.1.5';

// V6.1.5 | 2026-11-08 第 194 轮：破防量允许小数（正则改 (\d+(?:\.\d+)?)）。
//   core/203 L219 `defReduced = Math.min(defReduced, getStat(target,'def'))` 会把整数档夹成小数
//   （实测 0.8）——旧正则 `防御 -(\d+)` 把 -0.8 截成 0，再撞整数白名单被判非法（seed=20 stage=1 误报）。
//   判定改为区间 (0, 4]：0 = reduce 归零、>4 = 越界，两者才是回归信号；夹取产生的任意小数放行。
const MAX_BREAK_REDUCE = 4;

export const rule82 = {
    group: '战报渲染回归',
    name: '破防显示位置/破防量(回归)',
    test: function(ctx, log) {
        var misplace = 0, latePos = 0, badReduce = 0, total = 0, badSamples = [];
        for (var i = 0; i < log.length; i++) {
            var e = log[i];
            if (!e || e.type !== 'attack-group' || !e.entries) continue;
            var brk = null, brkIdx = -1, waveIdx = -1;
            for (var j = 0; j < e.entries.length; j++) {
                var en = e.entries[j];
                if (!en) continue;
                var t = en.text || '';
                // 波动行是攻击组第2条（有phantom时第3条），展示了 defBase→defAct（已含破防削减）
                if (waveIdx === -1 && t.indexOf('波动：') !== -1) waveIdx = j;
                if (!brk && t.indexOf('🗡️') !== -1 && t.indexOf('破防') !== -1) { brk = en; brkIdx = j; }
            }
            if (!brk) continue;
            total++;
            // 1) 位置：破防先于伤害计算发生，应在攻击组最前面（波动行之前）展示；
            //    波动行展示的 defBase→defAct 已含破防削减，破防行若在其后则因果倒置
            if (waveIdx !== -1 && brkIdx > waveIdx) latePos++;
            // 2) 归属 + 4) 破防量：解析"🗡️ 攻击者 破防：目标 防御 -X"
            var plain = (brk.text || '').replace(/<[^>]+>/g, '');
            var ma = plain.match(/🗡️\s*(\S+)\s*破防：(\S+)\s*防御/);
            if (ma) {
                var head = (e.entries[0] && e.entries[0].text || '').replace(/<[^>]+>/g, '');
                if (head.indexOf(ma[1]) === -1 || head.indexOf(ma[2]) === -1) misplace++;
            }
            var mr = plain.match(/防御\s*-(\d+(?:\.\d+)?)/);
            if (mr) {
                var reduce = parseFloat(mr[1]);
                // 破防量回归：0（归零）或 >4（越界）才是信号；Math.min 夹取产生的 0.x 小数属正常
                if (!(reduce > 0 && reduce <= MAX_BREAK_REDUCE)) { badReduce++; badSamples.push('第' + i + '组「' + plain.slice(0, 80) + '」→ 解析值 ' + reduce); }
            }
        }
        // 3) 游离：破防行不应出现在攻击组之外
        for (var i2 = 0; i2 < log.length; i2++) {
            var e2 = log[i2];
            if (e2 && e2.type !== 'attack-group' && (e2.text || '').indexOf('破防：') !== -1 && (e2.text || '').indexOf('🗡️') !== -1) misplace++;
        }
        if (total === 0 && misplace === 0 && badReduce === 0) return 'skip';
        var msgs = [];
        if (latePos > 0) msgs.push(latePos + '/' + total + '处破防显示位置靠后（应在攻击组最前面、波动行之前）');
        if (misplace > 0) msgs.push(misplace + '处破防行与所在攻击组攻击者/目标不一致或游离在攻击组外');
        if (badReduce > 0) msgs.push(badReduce + '处破防量不在合法区间(0,4]（V6.1.3 破防分档回归：归零或越界）：' + badSamples.slice(0, 3).join('；'));
        // ★ 第 132 轮：原 msg 为「复发：」+ msgs.join()，整体动态 ⇒ 无法定位到分支，现已补前缀
        if (msgs.length > 0) return { fail: true, msg: '复发：破防显示位置/破防量：' + msgs.join(' | ') };
        return { fail: false };
    }
};
