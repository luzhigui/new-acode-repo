// 显示取整单一出口：渲染正文里不允许出现 3 位以上小数的"浮点尾巴"。
// 为什么需要：2026-11-08 起全仓显示统一走 infra/102 的 fmtNum / fmtHpText / fmtAtk 唯一出口
//   （v>=10 取整、v<10 保留 1 位小数）。任何绕开出口直接 `${某浮点}` 插值的行，都会把
//   14.999999999999998、9.800000000000001 这类尾巴甩到玩家脸上。
// 阈值为什么是 ≥4 位小数：引擎与渲染的合法显示最多用到 2 位（公式行如「4.83 + 38×0.12」），
//   3 位也有合法值（如 ×0.025 的系数），4 位以上实测 140 场 0 条，出现即说明未过出口。
// 判据来源：2026-11-08 实测 140 场 = 20 种子 × 1~7 关，阈值 4 位 0 误报（阈值 3 位会误报 641 条公式行）。
export const VER = 'tests/health-rules/186-display-single-exit.js V1.0.0';
import { collectNodes } from '../122health-utils.js';

export const rule186 = {
    group: '战报与渲染一致性',
    name: '显示数值单一出口(浮点尾巴)',
    test: function(ctx, log) {
        var nodes = collectNodes(log);
        if (!nodes.length) return 'skip'; // 本场没有任何渲染条目
        for (var i = 0; i < nodes.length; i++) {
            var e = nodes[i];
            if (!e) continue;
            var text = String(e.text || '').replace(/<[^>]+>/g, '');
            var m = text.match(/\d+\.\d{4,}/);
            if (m) {
                return { fail: true, msg: '显示未过唯一出口：正文出现浮点尾巴 ' + m[0] + '（应走 fmtNum/fmtHpText）：' + text.slice(0, 100) };
            }
        }
        return { fail: false };
    }
};
