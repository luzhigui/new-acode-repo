// tests/37health-rules/74-butterfly-stack.js
// 回归规则：姐姐附身属性叠加 — 修复后基于 _baseAtk/_baseDef 转移，不重复计算 Buff
// 复发信号：附身转移值 atkTransfer != floor(_baseAtk/3)（转移值包含 Buff 加成，回退到直接操作 atk）
// 对应已修 Bug：姐姐附身属性叠加（直接操作 atk/def 导致 Buff 重复计算）
export const VER = 'tests/37health-rules/74-butterfly-stack.js V5.2.0';

export const rule74 = {
    group: '精英技能回归',
    name: '姐姐附身叠加(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        // 找附身日志："🦋 蝶变：{sister} 化为蝴蝶附身于 {host}！攻+X 防+Y 血上限+Z"
        var possessText = null;
        for (var j = 0; j < log.length; j++) {
            var e = log[j];
            if (!e) continue;
            if (e.type === 'info' && (e.text || '').indexOf('化为蝴蝶附身') !== -1) {
                possessText = e.text;
                break;
            }
        }
        if (!possessText) return 'skip';

        // 解析"攻+X"
        var m = possessText.match(/攻\+(\d+)/);
        if (!m) return 'skip';
        var atkTransfer = parseInt(m[1], 10);

        // 找姐姐的 _baseAtk（before 优先，附身发生在战斗开始）
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
        if (!sister || sister._baseAtk === undefined) return 'skip';

        var expected = Math.floor(sister._baseAtk / 3);
        // 复发信号：转移值 != 基础值/3（包含 Buff 加成）
        if (atkTransfer !== expected) {
            return { fail: true, msg: '复发：附身攻转移值' + atkTransfer + ' != floor(_baseAtk/3)=' + expected + '，可能直接操作 atk 导致 Buff 重复计算' };
        }
        return { fail: false };
    }
};
