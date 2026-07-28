﻿﻿﻿﻿﻿// tests/37health-rules/60-separator.js
// V5.2.0 | 分隔符缺失检查 - 只检查8种触发动作类型
export const VER = 'tests/37health-rules/60-separator.js V5.2.0';

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
        // 反向检查：只抓真正多余的分隔符（连续两个分隔符 / round-start后面紧跟分隔符）
        for (var j = 1; j < log.length; j++) {
            var prev2 = log[j-1];
            var curr2 = log[j];
            
            if (curr2.type === 'combat-text' || curr2.type === 'detail') continue;
            
            // 只有 round-start 或 attack-group 后面紧跟分隔符才算多余
            // attack-group→attack-group 中间有分隔符是正常的，attack-group→round-end 也是正常的
            if (prev2.type === 'round-start' || (prev2.type === 'attack-group' && curr2.type === 'attack-group')) {
                var prevDiv2 = null;
                for (var d2 = divIndex; d2 < allDivs.length; d2++) {
                    var html2 = allDivs[d2].innerHTML || '';
                    if (html2.indexOf('separator') === -1 && html2.trim() !== '' && html2 !== '<br>') {
                        prevDiv2 = allDivs[d2];
                        divIndex = d2 + 1;
                        break;
                    }
                }
                if (prevDiv2 && prevDiv2.nextElementSibling && prevDiv2.nextElementSibling.nextElementSibling) {
                    var betweenHtml = prevDiv2.nextElementSibling.innerHTML || '';
                    var nextHtml2 = prevDiv2.nextElementSibling.nextElementSibling.innerHTML || '';
                    // 如果中间是分隔符，且紧挨着下一个还是分隔符 → 连续两个分隔符，报多余
                    if (betweenHtml.indexOf('separator') !== -1 && nextHtml2.indexOf('separator') !== -1) {
                        issues.push('日志问题：存在连续两个多余的分隔符');
                    }
                }
            }
        }

        if (issues.length > 0) {
            return { fail: true, msg: issues.slice(0, 3).join(' | ') + (issues.length > 3 ? ' 等' + issues.length + '处' : '') };
        }
        return { fail: false };
    }
};