// tests/37health-rules/60-separator.js
// V5.0.6 | ~3200 bytes | 分隔符缺失检查
export const VER = 'tests/37health-rules/60-separator.js V5.0.6';

export const rule60 = {
    group: '日志格式',
    name: '分隔符缺失检查',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var issues = [];
        var doc = ctx._doc || document;
        var logDiv = doc.getElementById('log');
        if (!logDiv) return 'skip';

        var allDivs = logDiv.querySelectorAll('div');
        var divIndex = 0;

        for (var i = 1; i < log.length; i++) {
            var prev = log[i-1];
            var curr = log[i];

            // 只检查明确需要分隔符的8种类型：上一步是buff触发动作，下一步是攻击动作
            var needSepTypes = ['buff-leech','buff-rebound-fortify','buff-swap','buff-push','buff-bonus','buff-splash','buff-destroy','buff-summon'];
            if (curr.type === 'attack-group' && needSepTypes.indexOf(prev.type) !== -1) {
                var prevDiv = null;
                for (var d = divIndex; d < allDivs.length; d++) {
                    var html = allDivs[d].innerHTML || '';
                    if (html.indexOf('separator') === -1 && html.trim() !== '' && html !== '<br>') {
                        prevDiv = allDivs[d];
                        divIndex = d + 1;
                        break;
                    }
                }
                var hasSep = false;
                if (prevDiv && prevDiv.nextElementSibling) {
                    var nextHtml = prevDiv.nextElementSibling.innerHTML || '';
                    hasSep = nextHtml.indexOf('separator') !== -1;
                }
                if (!hasSep && prevDiv) {
                    var displayText = (prevDiv.textContent || '').substring(0, 50);
                    var buffName = '';
                    if (prev.buffType === 'leech') buffName = '嗜血狂刀';
                    else if (prev.buffType === 'hotBlood') buffName = '热血奋战';
                    else if (prev.buffType === 'fortify_rebound') buffName = '严阵以待反弹';
                    else if (prev.type === 'buff-swap') buffName = '惑人心智换位';
                    else if (prev.type === 'buff-push') buffName = '乘风突袭击退';
                    else if (prev.type === 'buff-bonus') buffName = '流星赶月伤害加深';
                    else if (prev.type === 'buff-splash') buffName = '溅射';
                    else if (prev.type === 'buff-destroy') buffName = '拒马销毁';
                    else if (prev.type === 'buff-summon') buffName = '拒马召唤';
                    else buffName = prev.type;
                    issues.push('日志问题：' + buffName + '（"' + displayText + '"）后面缺少分隔符，直接接了攻击动作');
                }
            }
        }
        if (issues.length > 0) {
            return { fail: true, msg: issues.slice(0, 3).join(' | ') + (issues.length > 3 ? ' 等' + issues.length + '处' : '') };
        }
        return { fail: false };
    }
};