// 回归规则：姐姐飞回血量不合理 — 修复后按所有队友（含阵亡）比例计算
// 复发信号：飞回血量 = maxHp（满血），只算存活队友导致比例偏高
// 对应已修 Bug：姐姐飞回血量不合理（只算存活队友，死亡队友不影响比例）
// 边界修正（对照 modules/27 _executeReturn）：totalHp 含阵亡队友计 0、totalMaxHp 含全部队友，
//   故只要存在阵亡队友，比例必 <1、飞回血量必 < maxHp——仅当存在阵亡队友才判定，避免全员满血时的误报。
export const VER = 'tests/health-rules/128-butterfly-return.js V6.0.0';

export const rule75 = {
    group: '精英技能回归',
    name: '姐姐飞回血量(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        // 找飞回日志："🦋 蝶变：{sister} 从 {host} 飞回，恢复原形！攻 X 防 Y 血 Z"
        var returnText = null;
        for (var j = 0; j < log.length; j++) {
            var e = log[j];
            if (!e) continue;
            if (e.type === 'info' && (e.text || '').indexOf('飞回') !== -1 && (e.text || '').indexOf('蝶变') !== -1) {
                returnText = e.text;
                break;
            }
        }
        if (!returnText) return 'skip';

        // 解析"血 X"（注意飞回日志末尾是"血 Z"）
        var m = returnText.match(/血\s*(\d+)/);
        if (!m) return 'skip';
        var returnHp = parseInt(m[1], 10);

        // 找姐姐的 maxHp
        var sister = null;
        var allBefore = (beforeA || []).concat(beforeE || []);
        for (var i = 0; i < allBefore.length; i++) {
            if (allBefore[i] && allBefore[i].isXiaoZhaoSister) { sister = allBefore[i]; break; }
        }
        if (!sister) {
            var allAfter = (afterA || []).concat(afterE || []);
            for (var i2 = 0; i2 < allAfter.length; i2++) {
                if (allAfter[i2] && allAfter[i2].isXiaoZhaoSister) { sister = allAfter[i2]; break; }
            }
        }
        if (!sister || !sister.maxHp) return 'skip';

        // 复发信号：飞回满血（只算存活队友导致比例偏高）
        // 修复口径（modules/27 _executeReturn）：totalHp 含阵亡队友计 0、totalMaxHp 含全部队友，
        // 故只要存在阵亡队友，比例必 <1、飞回血量必 < maxHp（floor 仍取不到满血）。
        // 边界修正：若全场无阵亡且全员满血，飞回满血属正常——此前会误报，故仅当存在阵亡队友才判定，避免误报。
        var hasDeadAlly = false;
        for (var d = 0; d < afterA.length; d++) {
            var du = afterA[d];
            if (du && du.uid !== sister.uid && du.alive === false) { hasDeadAlly = true; break; }
        }
        if (hasDeadAlly && returnHp >= sister.maxHp) {
            return { fail: true, msg: '复发：姐姐飞回血量' + returnHp + ' = maxHp' + sister.maxHp + '（满血），但场上有阵亡队友——修复后应按所有队友含阵亡计算、比例应<1（仍满血=只算存活队友，回归）' };
        }
        return { fail: false };
    }
};
