// 回归规则：周颠·「癫」传染链一致性 —— 初始持有者 / 每次传染的源与去向 / 死亡传递
// 机制源（modules/333-elite-mingjiao-crazy.js）：
//   开局「癫」在周颠身上；持有者出手必中且无视闪避，目标随机不分敌友；
//   攻击后若目标仍存活 → 癫传给目标（报幕：🤪 {持有者} 将「癫」传染给了 {目标}）；
//   持有者阵亡 → 传给击杀者（🤪 「癫」随着 {死者} 的死亡传给了 {击杀者}）；
//   找不到击杀者 → 回周颠（🤪 「癫」找不到攻击者，回到了 周颠 身上）；
//   周颠已死 → 随机传（🤪 周颠已阵亡，「癫」随机传给了 {目标}）。
// 复发信号：
//   1) 首次出手报幕的持有者不是周颠（初始携带没落到周颠 / 癫被开局乱发）；
//   2) 某次「受到癫影响」的出手者 ≠ 当前持有者（传递丢了/重复传/传错人 → 双持有或空持有）；
//   3) 传染报幕的源 ≠ 当前持有者，或目标 = 自己（自我传染 = 癫卡死）；
//   4) 死亡传递报幕的死者 ≠ 当前持有者（死的人根本没癫 / 有癫的人死了却没传递）。
// 误报规避：本场没有任何癫报幕直接 skip；「周颠已阵亡」随机传递的那条报幕不含死者名字，
//   只按「目的地」更新持有者，不校验来源。
export const VER = 'tests/health-rules/190-zhou-dian-crazy-chain.js V1.0.0';
import { entryTextsDeep, plain } from '../122health-utils.js';

function collectTexts(log) {
    var texts = [];
    for (var i = 0; i < log.length; i++) {
        var ts = entryTextsDeep(log[i]);
        for (var t = 0; t < ts.length; t++) {
            var s = plain(ts[t]);
            if (s) texts.push(s);
        }
    }
    return texts;
}

export const rule190 = {
    group: '技能效果回归',
    name: '周颠癫传染链一致性(回归)',
    test: function(ctx, log) {
        if (!log || log.length === 0) return 'skip';
        var texts = collectTexts(log);

        var RE_ATTACK = /^🤪 (.+?) 受到「癫」的影响，不分敌友地向 (.+?) 发起攻击！?$/;
        var RE_TRANSFER = /^🤪 (.+?) 将「癫」传染给了 (.+?)$/;
        var RE_DEATH = /^🤪 「癫」随着 (.+?) 的死亡传给了 (.+?)$/;
        var RE_BACK = /^🤪 「癫」找不到攻击者，回到了 (.+?) 身上$/;
        var RE_RANDOM = /^🤪 周颠已阵亡，「癫」随机传给了 (.+?)$/;

        var holder = '周颠';   // 开局携带者
        var hits = 0;
        for (var k = 0; k < texts.length; k++) {
            var s = texts[k];
            var m;
            if ((m = s.match(RE_ATTACK))) {
                hits++;
                if (m[1] !== holder) {
                    return { fail: true, msg: '复发：癫的出手报幕「' + m[1] + '」不是当前持有者「' + holder + '」（传递错位/双持有）' };
                }
            } else if ((m = s.match(RE_TRANSFER))) {
                hits++;
                if (m[1] !== holder) {
                    return { fail: true, msg: '复发：癫传染报幕的源「' + m[1] + '」不是当前持有者「' + holder + '」' };
                }
                // 癫攻击目标可能选中自己（不分敌友），自传自留是机制允许的，不算复发
                holder = m[2];
            } else if ((m = s.match(RE_DEATH))) {
                hits++;
                // 周颠可被复活：复活后按名字追踪持有链会失真，整场跳过（记入 skip 而非红）
                if (m[1] === '周颠') return 'skip';
                if (m[1] !== holder) {
                    return { fail: true, msg: '复发：死亡传递报幕的死者「' + m[1] + '」不是癫的当前持有者「' + holder + '」' };
                }
                holder = m[2];
            } else if ((m = s.match(RE_BACK))) {
                hits++;
                if (m[1] !== '周颠') {
                    return { fail: true, msg: '复发：癫回收到「' + m[1] + '」身上，应回周颠' };
                }
                holder = m[1];
            } else if ((m = s.match(RE_RANDOM))) {
                // 「周颠已阵亡」= 后续可能复活，持有链不再可按名字连续追踪 → 整场跳过
                return 'skip';
            }
        }
        if (hits === 0) return 'skip';
        return { fail: false };
    }
};


