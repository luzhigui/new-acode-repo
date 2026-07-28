﻿﻿﻿﻿﻿// tests/37health-rules/67-cloud-dodge.js
// V5.2.0 | 流云身法闪避率
export const VER = 'tests/37health-rules/67-cloud-dodge.js V5.2.0';

export const rule67 = {
    group: 'Buff效果',
    name: '流云身法闪避率',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var hasCloudBody = (ctx.activeBuffs || []).some(function(b) { return b.key === 'cloudBody'; });
        if (!hasCloudBody) return 'skip';
        var dodgeCount = log.filter(function(e) { return e.type === 'attack-group' && e.isDodge; }).length;
        var attackCount = log.filter(function(e) { return e.type === 'attack-group' && !e.isMiss && !e.isBlock; }).length;
        if (attackCount < 10) return 'skip';

        var dodgeRate = dodgeCount / attackCount;
        if (dodgeCount === 0) {
            return { fail: true, msg: '日志问题：有流云身法Buff，但' + attackCount + '次攻击中0次闪避（期望至少3~4次），流云身法可能未生效' };
        }
        if (dodgeRate > 0.5) {
            return { fail: true, msg: '日志问题：有流云身法Buff，闪避率' + Math.floor(dodgeRate*100) + '%（' + dodgeCount + '/' + attackCount + '），异常偏高，可能有双重闪避叠加' };
        }
        return { fail: false };
    }
};