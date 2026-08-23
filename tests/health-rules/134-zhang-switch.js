// tests/health-rules/134-zhang-switch.js
// 回归规则：张无忌近身切换时机 — 同列前排无存活队友才切（core/13battle-shared.js checkZhangSwitch）
// 复发信号：同列前排队友存活却切换（时机过早）/ 前排阵亡后隔≥2回合才切换（时机过晚）/ 一场切换多次
// 对应已报 Bug：张无忌切换近身时机不对
export const VER = 'tests/health-rules/134-zhang-switch.js V5.5.0';

function roundAt(log, idx) {
    for (var i = idx; i >= 0; i--) {
        var e = log[i];
        if (e && e.type === 'round-start') {
            var m = (e.text || '').match(/第(\d+)回合/);
            if (m) return parseInt(m[1], 10);
        }
    }
    return 0;
}

export const rule81 = {
    group: '技能时机回归',
    name: '张无忌近身切换时机(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        // 1. 收集切换条目与所在回合
        var switches = [];
        var curRound = 0;
        for (var i = 0; i < log.length; i++) {
            var e = log[i];
            if (!e) continue;
            if (e.type === 'round-start') {
                var m = (e.text || '').match(/第(\d+)回合/);
                if (m) curRound = parseInt(m[1], 10);
            }
            if (e.isZhangSwitch || ((e.text || '').indexOf('张无忌切换近战形态') !== -1)) {
                switches.push({ idx: i, round: curRound });
            }
        }
        if (switches.length === 0) return 'skip';
        if (switches.length > 1) {
            return { fail: true, msg: '复发：张无忌近战形态切换' + switches.length + '次（每场应仅1次）' };
        }
        var sw = switches[0];

        // 2. 开局快照：张无忌初始站位 + 同列前排队友（与 checkZhangSwitch 的 front=1+col 口径一致）
        var snap = (ctx && ctx.snapshot && Array.isArray(ctx.snapshot.ally)) ? ctx.snapshot.ally : null;
        var zhangInitPos = null, frontUid = null;
        if (snap) {
            for (var k = 0; k < snap.length; k++) {
                if (snap[k] && snap[k].isZhang) zhangInitPos = snap[k].pos;
            }
            if (zhangInitPos != null) {
                var frontPos = ((zhangInitPos - 1) % 3) + 1;
                for (var k2 = 0; k2 < snap.length; k2++) {
                    var u2 = snap[k2];
                    if (u2 && !u2.isHorse && u2.pos === frontPos && u2.uid !== undefined) frontUid = u2.uid;
                }
            }
        }
        // 自身在前排（frontPos 即自己）或无快照：按现逻辑开局即切属正常口径，不判
        if (frontUid == null) return { fail: false };

        // 3. 切换前：前排队友是否阵亡 / 是否发生过换位击退（影响前排占用判断，有则放弃判定避免误报）
        var frontDead = null, posChanged = false;
        for (var j = 0; j < sw.idx; j++) {
            var f = log[j];
            if (!f) continue;
            if (frontDead === null && f.isDead === true && (f.uidD === frontUid || f.uidA === frontUid)) {
                frontDead = { round: roundAt(log, j), idx: j };
            }
            if (f.type === 'buff-push' || f.type === 'buff-swap') posChanged = true;
        }
        if (frontDead === null && sw.round <= 1 && !posChanged) {
            return { fail: true, msg: '复发：第' + sw.round + '回合同列前排队友存活，张无忌却切换近战（切换时机过早）' };
        }
        if (frontDead !== null && !posChanged && sw.round >= frontDead.round + 2) {
            return { fail: true, msg: '复发：前排队友第' + frontDead.round + '回合阵亡，张无忌第' + sw.round + '回合才切换近战（切换时机过晚）' };
        }
        return { fail: false };
    }
};
