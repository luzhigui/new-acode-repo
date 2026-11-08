// tests/health-rules/249-position-bounds-unique.js
// 体检规则：站位快照在界 + 同阵营同格双占
//
// 判据：
//   ① 硬判：任何出场快照（attack/miss/dodge 的 attacker/target、pass 的 unit）的 pos
//      必须是 1~9 的整数。越界＝棋格渲染会落到棋盘外，属于结构性错误。
//   ② 观察：同一阵营内，两个仍存活单位「最后已知位置」不得同格。快照是稀疏的，
//      中间若发生不发位移条目的静默 relocate，会伪造同格——所以先只观察、不染红；
//      等实测误报率归零再升硬判。
//   数据源全部是原始 fact（快照位置 + death 收口），不读渲染文本。
export const VER = 'tests/health-rules/249-position-bounds-unique.js V1.0.0';

function isPos(p) {
    return typeof p === 'number' && isFinite(p) && p >= 1 && p <= 9 && Math.floor(p) === p;
}

function snapOut(f, out) {
    var d = f.data || {};
    if (f.factType === 'attack' || f.factType === 'miss' || f.factType === 'dodge') {
        if (d.attacker) out.push(d.attacker);
        if (d.target || d.dodger) out.push(d.target || d.dodger);
    } else if (f.factType === 'pass' && d.unit) {
        out.push(d.unit);
    }
}

export const rule249 = {
    group: '选靶与站位回归',
    name: '站位快照在界与同格双占(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        var fs = facts || [];
        if (!fs.length) return 'skip';

        var last = Object.create(null);   // uid → {pos, camp, name, alive}
        var round = null;
        var checked = 0;
        var outOfRange = [];
        var dupKeys = Object.create(null);
        var dups = [];

        for (var i = 0; i < fs.length; i++) {
            var f = fs[i];
            if (!f || !f.factType) continue;
            var d = f.data || {};
            if (f.factType === 'roundStart') { round = d.round; continue; }
            if (f.factType === 'death' && d.uid != null) {
                if (last[d.uid]) last[d.uid].alive = false;
                continue;
            }

            var snaps = [];
            snapOut(f, snaps);
            for (var k = 0; k < snaps.length; k++) {
                var s = snaps[k];
                if (!s || s.uid == null || typeof s.pos !== 'number') continue;
                checked++;
                if (!isPos(s.pos)) {
                    outOfRange.push('第' + (round == null ? '?' : round) + '回合 ' + (s.name || s.uid) + ' 位置 ' + s.pos);
                    continue;
                }
                // 同阵营同格：和「最后一个仍存活」的占位者比
                for (var uid in last) {
                    var o = last[uid];
                    if (uid === String(s.uid)) continue;
                    if (!o.alive || o.camp !== s.camp || o.pos !== s.pos) continue;
                    var key = o.camp + '|' + s.pos + '|' + [String(uid), String(s.uid)].sort().join('&');
                    if (!dupKeys[key]) {
                        dupKeys[key] = true;
                        dups.push('第' + (round == null ? '?' : round) + '回合 ' + o.camp + ' 阵营 ' + (o.name || uid) + ' 与 ' + (s.name || s.uid) + ' 同占 ' + s.pos + ' 号位');
                    }
                }
                last[s.uid] = { pos: s.pos, camp: s.camp, name: s.name, alive: s.alive !== false };
            }
        }

        if (checked === 0) return 'skip';
        if (outOfRange.length) {
            return {
                fail: true,
                msg: outOfRange.slice(0, 3).join('；') + (outOfRange.length > 3 ? '（共 ' + outOfRange.length + ' 次号位越界）' : '')
            };
        }
        if (dups.length) {
            return { fail: false, observe: '同阵营同格双占 ' + dups.length + ' 处（快照稀疏，待确认非静默位移）：' + dups.slice(0, 3).join('；') };
        }
        return { fail: false, msg: '站位快照在界且无同格双占：核对 ' + checked + ' 个出场位置' };
    }
};
