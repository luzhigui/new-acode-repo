// tests/37health-rules/62-speed-button.js
// V5.2.0 | 倍速锁定状态检查
export const VER = 'tests/37health-rules/62-speed-button.js V5.2.0';

export const rule62 = {
    group: '按钮状态',
    name: '倍速锁定状态检查',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var speed = ctx.speed;
        var issues = [];
        var btn2 = document.getElementById('btnSpeed2');
        var btn7x = document.getElementById('btnSpeed7x');
        var btn4x = document.getElementById('btnSpeed4x');

        var speedToBtn = { 500: btn2, 143: btn7x, 250: btn4x };
        var expectedBtn = speedToBtn[speed];
        if (expectedBtn && !expectedBtn.classList.contains('active') && !expectedBtn.classList.contains('semi-active')) {
            issues.push('UI问题：当前速度=' + speed + '，但对应按钮没有高亮');
        }
        if (ctx.manualSpeedLock && speed !== 500 && speed !== 143 && speed !== 250 && speed !== 1800) {
            issues.push('UI问题：当前速度' + speed + '不在已知倍速列表中');
        }
        if (issues.length > 0) {
            return { fail: true, msg: issues.join(' | ') };
        }
        return { fail: false };
    }
};