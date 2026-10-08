// 回归规则：幼狮成长数值（LION_GROW fact）— 此前该 group 只有对照器（stat-decl）盯"声明==实际"，
//   规则侧看不到（LION_GROW 虽渲染，但规则只看渲染文案、且增量字段散在 fact.data，无独立校验）。
//   2026-10-08 Step 0 后规则能读原始 fact（rule.test 第 7 参 facts），本规则据此对账。
// 机制源（modules/27elite-mingjiao.js L720-741 幼狮成长）：cub 原地改名 + 永久词条叠加 atk/def/maxHp，
//   atkDelta/defDelta/maxHpDelta = 目标值 − cub 原值，fact 携带 绝对值 atk/def/maxHp + 增量 + pos + name。
// 为什么值得盯：成长是**永久词条**，增量算错（如 tgtAtk 取错角色基础、或 delta 漏减 cub 原值）会让狮子
//   终身属性失真，对照器只验"声明==实际落地"，本规则额外验"声明值本身合理 + 渲染文案与 fact 一致"。
// 复活信号：
//   1) atkDelta/defDelta/maxHpDelta 非正有限数 → 增量算坏（成长=永久加值，非正即机制坏）
//   2) pos 不在 1~6 → 落点非法（3×3 站位）
//   3) 渲染文案「攻 A/防 B/血 C」与 fact 绝对目标 atk/def/maxHp 不符 → 渲染字段漂移（写错变量）
// 误报规避：本场无 LION_GROW fact 直接 skip；渲染文案匹配不上就跳过判据3（不硬报）。
export const VER = 'tests/health-rules/161-lion-grow.js V1.0.0';
import { plain } from '../122health-utils.js';
import { FACT_TYPES } from '../../infra/56-battle-enums.js';

export const rule108 = {
    group: '数值回归',
    name: '幼狮成长数值(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!Array.isArray(facts) || facts.length === 0) return 'skip';
        const grows = [];
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (f && f.factType === FACT_TYPES.LION_GROW) grows.push(f.data || {});
        }
        if (grows.length === 0) return 'skip';
        // 渲染文案里的幼狮成长行：按「pos|atk|def|maxHp」签名建集合（不按 pos 单键，避免同场不同回合
        //   同一 pos 先后成长时后者覆盖前者造成误报）。renderPosSeen 记出现过的 pos，用于区分
        //   「该 pos 有渲染但数值漂移」（真误报）与「该 pos 根本无渲染行」（渲染未捕获，跳过）。
        const logText = (Array.isArray(log) ? log : []).map(e => plain(e && e.text)).join('\n');
        const renderSet = new Set();
        const renderPosSeen = new Set();
        const gr = /幼狮成长为[^\n（]*（(\d+) 号位）：攻 (\d+) \/ 防 (\d+) \/ 血 (\d+)/g;
        let gm;
        while ((gm = gr.exec(logText)) !== null) {
            const p = parseInt(gm[1], 10), a = parseInt(gm[2], 10), b = parseInt(gm[3], 10), c = parseInt(gm[4], 10);
            renderSet.add(p + '|' + a + '|' + b + '|' + c);
            renderPosSeen.add(p);
        }
        let checked = 0;
        for (let i = 0; i < grows.length; i++) {
            const d = grows[i];
            if (typeof d.atkDelta !== 'number' || !isFinite(d.atkDelta) || d.atkDelta <= 0) {
                return { fail: true, msg: '复发：幼狮成长 atkDelta=' + d.atkDelta + '（非正/非数）' };
            }
            if (typeof d.defDelta !== 'number' || !isFinite(d.defDelta) || d.defDelta <= 0) {
                return { fail: true, msg: '复发：幼狮成长 defDelta=' + d.defDelta + '（非正/非数）' };
            }
            if (typeof d.maxHpDelta !== 'number' || !isFinite(d.maxHpDelta) || d.maxHpDelta <= 0) {
                return { fail: true, msg: '复发：幼狮成长 maxHpDelta=' + d.maxHpDelta + '（非正/非数）' };
            }
            // 3×3 站位，合法落点 1~9（modules/27 L752 召唤空位池 1..9 证实；前排<=frontMax、后排 7~9）
            if (typeof d.pos !== 'number' || !Number.isInteger(d.pos) || d.pos < 1 || d.pos > 9) {
                return { fail: true, msg: '复发：幼狮成长落点 pos=' + d.pos + '（合法 1~9 整数）' };
            }
            const sig = d.pos + '|' + d.atk + '|' + d.def + '|' + d.maxHp;
            if (renderSet.has(sig)) {
                // 渲染文案与 fact 绝对目标一致 —— 通过
            } else if (renderPosSeen.has(d.pos)) {
                return { fail: true, msg: '复发：幼狮成长落点 ' + d.pos + ' 的渲染文案 攻/防/血 与 fact 绝对目标 '
                    + d.atk + '/' + d.def + '/' + d.maxHp + ' 不符（渲染漂移）' };
            }
            // 该 pos 无渲染行：渲染未捕获（可能嵌套未展开），跳过判据3，不硬报
            checked++;
        }
        if (checked === 0) return 'skip';
        return { fail: false };
    }
};
