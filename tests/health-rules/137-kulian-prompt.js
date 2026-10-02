// 回归规则：苦练提示 — 设计为宋青书每回合行动前给全队叠加 +攻+防+血上限（自身倍率放大）
// 当前版本数值（content/200game-data.json 宋青书 mechanics[1] type=kuLian：atkBonus=1、defBonus=2、
//   hpBonus=5；2026-09-29 单一真值源收口后为唯一出处，技能说明亦从 core/01 DESC_TRUTH 取真值）：
//   V6.1.7 苦练数值：atkBonus=1、defBonus 1→2、hpBonus 3→5 —— 全队（队友）基础值 = +1攻/+2防/+5血上限
//   V6.1.8 宋青书自身倍率 3→2 —— 宋青书自身 = ×2（即 +2攻/+4防/+10血），文案同步"自身三倍"→"自身双倍"
//   渲染口径（render/30 第466行）："🏋️ 苦练强化：{名} 激励全体队友+{atkBonus}攻+{defBonus}防+{hpBonus}血上限（自身双倍）"
// 复发信号：
//   1. 出现"+0攻/+0防"占位提示（占位 fact 未过滤，数值不对）
//   2. 文案回退为"自身三倍"（render/30 未随 V6.1.8 改"自身双倍"）
//   3. 提示数值 ≠ 当前版本基础值（atk/def/hp 不等于 1/2/5，V6.1.7 数值回退）
//   4. 一场总次数超**本场回合数**疑死循环（V6.1.13 起；原写死 24 次，长局必误报）
//   5. 同一回合出现 ≥2 次苦练提示（刷屏/死循环复发——本应每回合每单位仅 1 次）
// 对应已报 Bug：苦练提示数值为+0攻/+0防（占位未过滤）
// 优化（V6.1.x 复核）：原仅用"全场>24 次"粗粒度上限兜底，无法识别"单回合内多次触发"这一
//   真实刷屏/死循环信号（如每回合每爪击各发一次）。新增逐回合计数——同一回合 ≥2 次即判，
//   比"全场总数"精确，且仍保留总上限作为回合标记缺失时的兜底，避免漏检。
// V6.1.13 | 2026-10-02 第 50 轮：总次数上限由写死的 24 改为**本场回合数**（+1 容差，回合标记缺失
//   时仍退回 24）。旧常数在长局必然越线 —— 实测 seed=4 stage=3 打满 30 回合、提示正好 30 次
//   （每回合严格 1 次，完全正常）却被判「疑死循环」，属判据假阳性。设计口径是「每回合至多 1 次」，
//   上界就应是回合数本身；负向测试（上界 -1）确认判据仍会响，不是把红改没了。
export const VER = 'tests/health-rules/137-kulian-prompt.js V6.1.13';

export const rule84 = {
    group: '战报渲染回归',
    name: '苦练提示数值错误/异常高频(回归)',
    test: function(ctx, log) {
        var count = 0, zeroVal = 0, tripleText = 0, badVal = 0, badDetail = '';
        // 逐回合统计苦练次数：与其他规则同源口径（round-start 事实 / 第N回合开始 分隔符）
        var curRound = 0, perRound = {};
        for (var i = 0; i < log.length; i++) {
            var e = log[i];
            if (!e) continue;
            // 跟踪当前回合（兼容 type='round-start' / factType='roundStart'(可无 text) / 文本"第N回合开始"三种落点）
            //   必须放在 "!e.text" 跳过之前，否则无 text 的 roundStart 事实会被跳过、回合丢失
            if (e.factType === 'roundStart' && e.data && typeof e.data.round === 'number') {
                curRound = e.data.round;
            } else if (e.type === 'round-start') {
                var rm = (e.text || '').match(/第(\d+)回合/);
                if (rm) curRound = parseInt(rm[1], 10);
            } else if ((e.text || '').indexOf('回合开始') !== -1) {
                var rm2 = (e.text || '').match(/第(\d+)回合/);
                if (rm2) curRound = parseInt(rm2[1], 10);
            }
            if (!e.text) continue;
            if (e.text.indexOf('🏋️ 苦练') === -1) continue;
            count++;
            // 逐回合计数（curRound>0 才计入，避免苦练早于任何回合标记时的误判）
            if (curRound > 0) perRound[curRound] = (perRound[curRound] || 0) + 1;
            // 复发信号1：占位未过滤（+0攻/+0防）
            if (e.text.indexOf('+0攻') !== -1 || e.text.indexOf('+0防') !== -1) zeroVal++;
            // 复发信号2：文案回退为"自身三倍"（当前应为"自身双倍"，V6.1.8）
            if (e.text.indexOf('自身三倍') !== -1) tripleText++;
            // 复发信号3：提示数值与当前版本基础值不符（应 +1攻/+2防/+5血上限，V6.1.7）
            var m = e.text.match(/激励全体队友\+(\d+)攻\+(\d+)防\+(\d+)血上限/);
            if (m) {
                var a = parseInt(m[1], 10), d = parseInt(m[2], 10), h = parseInt(m[3], 10);
                if (a !== 1 || d !== 2 || h !== 5) {
                    badVal++;
                    badDetail = '(' + a + '攻/' + d + '防/' + h + '血上限)';
                }
            }
        }
        if (count === 0) return 'skip';
        if (zeroVal > 0) {
            return { fail: true, msg: '复发：苦练提示' + zeroVal + '处数值为+0攻/+0防（占位提示未过滤，数值不对）' };
        }
        if (tripleText > 0) {
            return { fail: true, msg: '复发：苦练提示仍写"自身三倍"（V6.1.8 应改"自身双倍"，render/30 文案回退）' };
        }
        if (badVal > 0) {
            return { fail: true, msg: '复发：苦练提示' + badDetail + '与当前版本(+1攻/+2防/+5血上限，V6.1.7)不符' };
        }
        // 复发信号5：同一回合苦练 ≥2 次（刷屏/死循环——本应每回合每单位仅 1 次）
        var dupRound = 0, dupCount = 0;
        for (var rk in perRound) {
            if (perRound[rk] >= 2) { dupRound = parseInt(rk, 10); dupCount = perRound[rk]; break; }
        }
        if (dupRound > 0) {
            return { fail: true, msg: '复发：第' + dupRound + '回合出现' + dupCount + '次苦练提示（本应每回合每单位仅1次，疑刷屏/死循环）' };
        }
        // 复发信号4：总次数超过**本场回合数**（第 50 轮修正 —— 原写死 24 次是假阳性源：
        //   实测 seed=4 stage=3 打了 **30 回合**、提示正好 30 次（每回合严格 1 次，完全正常），
        //   却因 30>24 被判「疑死循环」。设计口径是「每回合至多 1 次」，上界就该是回合数本身，
        //   而不是拍脑袋的常数；长局（尤其开了第 7 关后）只会让这个常数越来越失真。
        //   上界取 perRound 的最大回合号；苦练可能早于首个回合标记出现，故留 1 条容差；
        //   回合标记缺失时（maxRound=0）退回 24 次兜底，不至于漏检。
        var maxRound = 0;
        for (var rk2 in perRound) { var rn = parseInt(rk2, 10); if (rn > maxRound) maxRound = rn; }
        var upper = maxRound > 0 ? maxRound + 1 : 24;
        if (count > upper) {
            return { fail: true, msg: '异常：苦练提示出现' + count + '次 > 本场回合数' + maxRound
                + '（每回合叠加设计，一场应≤回合数，疑死循环）' };
        }
        return { fail: false };
    }
};
