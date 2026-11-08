// 回归规则：六大派精英站位 —— modules/330-battle-init.js 站位段（L596-674）
// 站位口径（按代码执行顺序）：模板排位（普通兵）→ 唐文亮 4~9 洗牌 → 周芷若 2~9 → 宋青书（有周顺延／无周从 4 起）
//   → 其它精英按 content.roster.enemyElitePos 身份优先表 → 剩余普通兵随机填空位。
//
// rule184「精英站位不跳位 · 周芷若/宋青书底线」：
//   ① 身份优先表 invariant：精英落位必须是其优先表 P 中「前面所有位都已被别人占掉」的第一个空位。
//      （占位只增不减，所以终局快照可直接验证：P 中排在 pos 之前的位必须全部有人。）唐文亮走 4~9 洗牌特例，豁免。
//   ② 周芷若恒 ≥2 号位（优先表从 2 起，兜底也只放 2）——她不许站 1 号位当靶子。
//   ③ 宋青书：队内无周芷若时恒 ≥4 号位（V7.5.25 老板口径「不许被唐文亮挤到前排」）；有周芷若（第4关）顺延其后。
//
// rule291「张三丰恒 1 号位」：
//   330 的 1 号位锁只在本关固定池精英里找 `eliteUnits.find(name==='张三丰')`，而张三丰属于第 2 关固定池；
//   被额外混入（M107，首现第 2 关，故第 3~7 关合法）后他变成普通兵，走模板/随机位 → 实测出现过 9 号位
//   （seed=7 第 7 关）。老板口径是「张三丰固定 1 号位」，与他在哪一关出场无关 —— 本规则把它钉住；
//   修复属主代码（需求已登记 tests/known-transfers.md）。
export const VER = 'tests/health-rules/288-enemy-elite-pos.js V1.0.0';
import { CONFIG as C } from '../../core/201-config-5v5-test.js';

const POS_MAP = C.ENEMY_ELITE_POS_FLAGS_MAP || [];

export const rule288 = {
    group: '阵容生成回归',
    name: '精英站位不跳位·周芷若宋青书底线(回归)',
    test: function (ctx, log, beforeA, beforeE) {
        var stage = ctx && ctx.currentStage;
        var E = beforeE || (ctx && ctx.snapshot && ctx.snapshot.enemy) || [];
        if (!E.length) return 'skip';

        // ① 身份优先表不跳位
        for (var i = 0; i < E.length; i++) {
            var u = E[i];
            if (!u || !u.name) continue;
            if (u.name === '唐文亮') continue;   // 4~9 洗牌特例（L626-641）
            var hit = null;
            for (var k = 0; k < POS_MAP.length; k++) { if (u[POS_MAP[k][0]]) { hit = POS_MAP[k][1]; break; } }
            if (!hit) continue;
            var idx = hit.indexOf(u.pos);
            if (idx === -1) {
                return { fail: true, msg: '复发：站位越界 · 第' + stage + '关「' + u.name + '」站位 ' + u.pos + ' 不在身份优先表 ' + hit.join(',') + ' 内' };
            }
            for (var j = 0; j < idx; j++) {
                var p = hit[j];
                var occupied = E.some(function (o) { return o !== u && o.pos === p; });
                if (!occupied) {
                    return { fail: true, msg: '复发：站位跳位 · 第' + stage + '关「' + u.name + '」跳过优先表空位 ' + p + '（实站 ' + u.pos + '，优先表 ' + hit.join(',') + '）' };
                }
            }
        }
        // ② 周芷若 ≥2
        var zhou = E.find(function (x) { return x && (x.isZhouZhiruo || x.name === '周芷若'); });
        if (zhou && zhou.pos < 2) {
            return { fail: true, msg: '复发：周芷若前排 · 第' + stage + '关周芷若落在 ' + zhou.pos + ' 号位（应 ≥2，1 号位不许当靶子）' };
        }
        // ③ 宋青书：无周芷若时 ≥4
        var song = E.find(function (x) { return x && (x.isSongQingshu || x.name === '宋青书'); });
        if (song && !zhou && song.pos < 4) {
            return { fail: true, msg: '复发：宋青书前排 · 第' + stage + '关无周芷若时宋青书落在 ' + song.pos + ' 号位（应 ≥4，被前排挤位）' };
        }
        return { fail: false };
    }
};

export const rule291 = {
    group: '阵容生成回归',
    name: '张三丰恒 1 号位(跨关混入同样适用)',
    test: function (ctx, log, beforeA, beforeE) {
        var stage = ctx && ctx.currentStage;
        var E = beforeE || (ctx && ctx.snapshot && ctx.snapshot.enemy) || [];
        if (!E.length) return 'skip';
        var u = E.find(function (x) { return x && (x.isZhangSanFeng || x.name === '张三丰'); });
        if (!u) return { fail: false };
        if (u.pos !== 1) {
            return { fail: true, msg: '复发：张三丰非1号位 · 第' + stage + '关张三丰落在 ' + u.pos + ' 号位（应恒为 1 号位；额外混入后 1 号位锁失效）' };
        }
        return { fail: false };
    }
};
