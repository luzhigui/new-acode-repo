// tests/health-rules/128-butterfly-return.js
// 回归规则：姐姐飞回血量不合理 — 修复后按所有队友（含阵亡）比例计算
// 复发信号：飞回血量 = maxHp（满血），可能只算存活队友导致比例偏高
// 对应已修 Bug：姐姐飞回血量不合理（只算存活队友，死亡队友不影响比例）
export const VER = 'tests/health-rules/128-butterfly-return.js V5.5.0';

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
        // 注意：若所有队友都满血存活，飞回也会满血（非复发），此规则有误报风险，msg 标注"可能"
        if (returnHp >= sister.maxHp) {
            return { fail: true, msg: '复发可能：姐姐飞回血量' + returnHp + ' = maxHp' + sister.maxHp + '（满血），可能只算存活队友（修复后应按所有队友含阵亡计算，阵亡者拉低比例）' };
        }
        return { fail: false };
    }
};
