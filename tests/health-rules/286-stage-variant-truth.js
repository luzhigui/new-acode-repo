// 回归规则：关卡变体「抽签真值 vs 实际阵容」互证 —— modules/330-battle-init.js L679 返回值
// 背景：330 已把抽中的变体 id 落成返回值 `encounterVariant`（v1/v2…，无变体关 = null），回放器把它放进
//   ctx.encounterVariant。这是唯一可信的分桶依据——按「阵里有没有胖远桥/宋青书」反推已被实测证伪
//   （变体1 局能被额外混入塞进胖远桥；张松溪/俞岱岩/俞莲舟 本身就是普通兵池名字）。
// 判据：
//   ① 无变体配置的关：encounterVariant 必须为 null（变体路径不许串关）；
//   ② 有变体配置的关（目前仅第 3 关）：id 必须落在配置序号内（v1…vN）；
//   ③ id 对应的那套变体，其**具名（不可替换）成员**必须全员在场 —— 抽签真值与阵容必须一致。
// 宿主无该字段时（非回放器的旧宿主）返回 skip，不做假绿。
export const VER = 'tests/health-rules/286-stage-variant-truth.js V1.0.0';
import { CONFIG as C, getGameData, loadGameData } from '../../core/201-config-5v5-test.js';

loadGameData().catch(() => { });

export const rule286 = {
    group: '阵容生成回归',
    name: '关卡变体抽签真值与阵容互证(回归)',
    test: function (ctx, log, beforeA, beforeE) {
        if (!ctx || ctx.encounterVariant === undefined) return 'skip';
        var stage = ctx.currentStage;
        var variant = ctx.encounterVariant;
        var variants = C.ENCOUNTER_VARIANTS[stage];
        var configured = !!(variants && variants.length);

        if (!configured) {
            if (variant != null) {
                return { fail: true, msg: '复发：变体串关 · 第' + stage + '关没有变体配置却抽到变体「' + variant + '」' };
            }
            return { fail: false };
        }
        var ids = variants.map(function (v, i) { return 'v' + (i + 1); });
        if (ids.indexOf(variant) === -1) {
            return { fail: true, msg: '复发：变体id非法 · 第' + stage + '关变体 id 不在配置序号内（实 ' + variant + '，配置只有 ' + ids.join('/') + '）' };
        }
        var E = beforeE || (ctx.snapshot && ctx.snapshot.enemy) || [];
        if (!E.length) return 'skip';

        var chars;
        try { chars = getGameData().characters || {}; } catch (e) { return 'skip'; }
        var idx = ids.indexOf(variant);
        var squad = (variants[idx] && variants[idx].squad) || [];
        var required = squad.filter(function (it) {
            return it && typeof it === 'object' && it.name && chars[it.name] && chars[it.name].named === true;
        }).map(function (it) { return it.name; });
        if (!required.length) return { fail: false };   // 该变体没有具名成员（静态规则 178 另行报）

        var names = {};
        E.forEach(function (u) { if (u && u.name) names[u.name] = true; });
        var miss = required.filter(function (n) { return !names[n]; });
        if (miss.length) {
            return { fail: true, msg: '复发：变体成员缺失 · 第' + stage + '关抽到变体 ' + variant + '，但其具名成员「' + miss.join(',') + '」不在场（抽签真值与实际阵容不一致）' };
        }
        return { fail: false };
    }
};
