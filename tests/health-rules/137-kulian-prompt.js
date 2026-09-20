// 回归规则：苦练提示 — 设计为宋青书每回合行动前给全队叠加 +攻+防+血上限（自身倍率放大）
// 当前版本数值（对照 记录-更改履历.md）：
//   V6.1.7 苦练数值：atkBonus=1、defBonus 1→2、hpBonus 3→5 —— 全队（队友）基础值 = +1攻/+2防/+5血上限
//   V6.1.8 宋青书自身倍率 3→2 —— 宋青书自身 = ×2（即 +2攻/+4防/+10血），文案同步"自身三倍"→"自身双倍"
//   渲染口径（render/30 第466行）："🏋️ 苦练强化：{名} 激励全体队友+{atkBonus}攻+{defBonus}防+{hpBonus}血上限（自身双倍）"
// 复发信号：
//   1. 出现"+0攻/+0防"占位提示（占位 fact 未过滤，数值不对）
//   2. 文案回退为"自身三倍"（render/30 未随 V6.1.8 改"自身双倍"）
//   3. 提示数值 ≠ 当前版本基础值（atk/def/hp 不等于 1/2/5，V6.1.7 数值回退）
//   4. 一场超 24 次疑死循环
//   5. 同一回合出现 ≥2 次苦练提示（刷屏/死循环复发——本应每回合每单位仅 1 次）
// 对应已报 Bug：苦练提示数值为+0攻/+0防（占位未过滤）
// 优化（V6.1.x 复核）：原仅用"全场>24 次"粗粒度上限兜底，无法识别"单回合内多次触发"这一
//   真实刷屏/死循环信号（如每回合每爪击各发一次）。新增逐回合计数——同一回合 ≥2 次即判，
//   比"全场总数"精确，且仍保留 24 次总上限作为回合标记缺失时的兜底，避免漏检。
export const VER = 'tests/health-rules/137-kulian-prompt.js V6.1.11';

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
        if (count > 24) {
            return { fail: true, msg: '异常：苦练提示出现' + count + '次（每回合叠加设计，一场正常应≤回合数，疑死循环）' };
        }
        return { fail: false };
    }
};
