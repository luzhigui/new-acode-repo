// 回归规则：明教固定站位锚点 —— modules/330-battle-init.js 站位段（L368-404）静态校验
// 背景（老板口径，代码里写死的硬规则）：
//   张无忌 5 号、韦一笑 6 号、小昭 4 号、谢逊 7 号、寒离飒 2 号；另「固定位恒为 3 个」（toLock 只截断到 3，
//   不足 3 随机补足）。这些锚点是精英技能判定/特效锚定的前提（例如寒离飒的蓄意轰拳以 2 号位为锚，
//   准备阶段不许被拖走），一旦被其他补位逻辑顶走，技能与视觉都会静默错位。
// 判据（只看开场定稿 beforeA）：
//   ① 在队的锚点单位 pos 必须等于硬编码位（寒离飒仅在 2 号位未被占用时适用，故只在她 pos 已落定后比）；
//   ② fixed 标记数恒为 3（队内 ≥3 人时）。
// 防误报：forceXiaoZhao 会先换人再站位，锚点仍按上表；forceMingUnit 只换人不动站位 → 同样适用。
export const VER = 'tests/health-rules/175-ally-anchor-pos.js V1.0.0';
import { CONFIG as C } from '../../core/201-config-5v5-test.js';

const ANCHORS = [
    { flag: 'isZhang', name: '张无忌', pos: 5, label: '张无忌' },
    { flag: 'isWei', name: '韦一笑', pos: 6, label: '韦一笑' },
    { flag: 'isXieXun', name: '金毛狮王谢逊', pos: 7, label: '谢逊' },
    { flag: 'isHanLiSa', name: '寒离飒', pos: 2, label: '寒离飒' }
];

function has(unit, flag, name) {
    return !!(unit && (unit[flag] || unit.name === name));
}

export const rule176 = {
    group: '阵容生成回归',
    name: '明教固定站位锚点(回归)',
    test: function (ctx, log, beforeA) {
        var stage = ctx && ctx.currentStage;
        var A = beforeA || (ctx && ctx.snapshot && ctx.snapshot.ally) || [];
        if (!A.length) return 'skip';

        for (var i = 0; i < ANCHORS.length; i++) {
            var a = ANCHORS[i];
            var unit = A.find(function (u) { return has(u, a.flag, a.name); });
            if (!unit) continue;
            if (unit.pos !== a.pos) {
                return { fail: true, msg: '复发：第' + stage + '关' + a.label + '开场不在 ' + a.pos + ' 号位（实 ' + unit.pos + '，固定站位锚点被顶走）' };
            }
        }
        // 小昭：姊妹两形态共用 4 号位
        var xz = A.find(function (u) { return u && (u.isXiaoZhaoSister || u.isXiaoZhaoBrother); });
        if (xz && xz.pos !== 4) {
            return { fail: true, msg: '复发：第' + stage + '关小昭开场不在 4 号位（实 ' + xz.pos + '，固定站位锚点被顶走）' };
        }
        // 固定位恒为 3 个（队内 ≥3 人时；不足 3 人的极端阵容按实际人数放行）
        if (A.length >= 3) {
            var fixedCount = A.filter(function (u) { return u && u.fixed === true; }).length;
            if (fixedCount !== 3) {
                return { fail: true, msg: '复发：第' + stage + '关明教固定位 ' + fixedCount + ' 个（应恒为 3 个，toLock 截断被破坏）' };
            }
        }
        return { fail: false };
    }
};
