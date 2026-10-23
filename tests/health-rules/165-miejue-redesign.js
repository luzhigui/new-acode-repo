// 回归规则：灭绝师太 重设计(2026-10-09) 行为数值 — 此前灭绝无专门体检覆盖（只有"技能说明数字==引擎真值"
//   单源守卫覆盖了 desc 里的数字，但反击/三击/召唤这三条行为层数值不在 desc，规则侧盲区）。
// 机制源（modules/26elite-sixsects.js L427-543 createMieJueShiTaiComponent）：
//   - 反击：被攻击后 prob 概率反击，伤害 ×counterAttack.dmgRatio（可闪避）；
//           渲染「🗡 灭绝师太反击 X！（伤害×R）」（全角括号）
//   - 三击：每第三次出手 伤害 ×thirdStrike.dmgMultiplier + 吸血 thirdStrike.leechRatio 倍本次伤害；
//           渲染「🩸 灭绝三击：第 N 次出手，回复本次伤害P%=K，生命 H1 → H2」
//   - 召唤周芷若：任一队友/自身阵亡 → SUMMON_UNIT fact（byName:'灭绝师太', summonName:'周芷若', pos）
//   - 普攻峨眉掌法 ×1.2：DMG_MULTIPLIER 声明不进 fact、渲染明细只标 label，规则侧不单独验（交由单源守卫）
// 为什么值得盯（真实回归，非对照器能替）：这三条是 2026-10-09 新写的系数/行为，配置改错（dmgRatio 写反、
//   leechRatio 漏乘、召唤 pos 越界）对照器（stat-decl 盯增量类）完全看不到；本规则直接对配置真值。
// 复活信号：
//   1) SUMMON_UNIT fact byName==='灭绝师太'：pos 必须在 1~9；summonName 必须含「周芷若」→ 召唤越界/对象错
//   2) 反击渲染「伤害×R」：R 必须 == counterAttack.dmgRatio（全角括号，保留小数位比对）
//   3) 三击渲染「回复 K 点，生命 H1 → H2」：K==H2-H1（落地值自洽）+ K>=0；leechRatio 公式值(fact声明侧)交由 stat-decl LEECH 契约验
// V1.1.0 | 2026-10-23 判据3 落地值化：三击文案经 5de0846 refactor 改格式，旧 regex「回复本次伤害P%=K」恒不匹配⇒空转；
//   改匹配新格式「回复 K 点[（治疗被削减）]，生命 H1 → H2」并验 K==H2-H1 自洽。修 rule165 三击盲区。
// 误报规避：本场灭绝未出场（无 SUMMON_UNIT fact 且无相关渲染文案）直接 skip；getSkillParams 取不到跳过对应判据。
export const VER = 'tests/health-rules/165-miejue-redesign.js V1.1.0';
import { getSkillParams } from '../../core/01config-5v5-test.js';
import { plain } from '../122health-utils.js';
import { FACT_TYPES } from '../../infra/56-battle-enums.js';

export const rule112 = {
    group: '数值回归',
    name: '灭绝重设计行为数值(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!Array.isArray(facts) || facts.length === 0) return 'skip';
        const counter = getSkillParams('灭绝师太', 'counterAttack');
        const third = getSkillParams('灭绝师太', 'thirdStrike');
        let triggered = false;

        // 判据1：召唤周芷若（SUM MON_UNIT fact，引擎侧 byName 写死『灭绝师太』）
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f || f.factType !== FACT_TYPES.SUMMON_UNIT || !f.data) continue;
            if (f.data.byName !== '灭绝师太') continue;
            triggered = true;
            if (typeof f.data.pos !== 'number' || f.data.pos < 1 || f.data.pos > 9) {
                return { fail: true, msg: '灭绝召唤周芷若落点 pos=' + f.data.pos + '（合法 1~9）' };
            }
            if (f.data.summonName && !/周芷若/.test(f.data.summonName)) {
                return { fail: true, msg: '灭绝召唤对象异常: ' + f.data.summonName + '（预期周芷若）' };
            }
        }

        // 判据2/3：渲染文案对账（log 为渲染后战报；plain() 去标签）。
        //   反击/三击文案由引擎写入「攻击组 data.entries」的 info 子条目，渲染后落在**顶层条目的 .entries 嵌套**里
        //   （非顶层 .text）—— 只扫顶层 .text 必漏报（与 129/143/133 同款病：嵌套子 fact 不递归必漏）。
        //   故递归收集所有层级的 text：顶层条目、其 .entries、再深一层……全部摊平后再比对。
        const texts = [];
        const collectText = (e) => {
            if (!e) return;
            if (typeof e.text === 'string' && e.text) texts.push(e.text);
            if (Array.isArray(e.entries)) e.entries.forEach(collectText);
        };
        (Array.isArray(log) ? log : []).forEach(collectText);
        const logText = texts.map(t => plain(t)).join('\n');

        if (counter && counter.dmgRatio != null) {
            const gr = /🗡 灭绝师太反击 .*（伤害×([0-9.]+)）/g;
            let gm;
            while ((gm = gr.exec(logText)) !== null) {
                triggered = true;
                const r = parseFloat(gm[1]);
                if (!(r >= 0) || Math.abs(r - counter.dmgRatio) > 1e-6) {
                    return { fail: true, msg: '灭绝反击系数渲染=' + r + ' 与配置 counterAttack.dmgRatio=' + counter.dmgRatio + ' 不符' };
                }
            }
        }

        if (third && third.leechRatio != null) {
            // 2026-10-23 落地值口径：三击吸血文案经 5de0846 refactor 改为「回复 {实际落地值} 点，
            //   生命 H1 → H2」（旧「回复本次伤害P%=K」格式已不存在，旧 regex 恒不匹配 ⇒ 判据3 空转）。
            //   leechRatio 公式值(fact 声明侧)交由 stat-decl 的 LEECH 契约验；本判据改验落地值自洽：
            //   K==H2-H1 + K>=0 + 整数(K 由 \d+ 保证)。
            const gr = /🩸 灭绝三击：第 \d+ 次出手，回复 (\d+) 点(?:（治疗被削减）)?，生命 (\d+) → (\d+)/g;
            let gm;
            while ((gm = gr.exec(logText)) !== null) {
                triggered = true;
                const k = parseInt(gm[1], 10);
                const h1 = parseInt(gm[2], 10);
                const h2 = parseInt(gm[3], 10);
                if (!(k >= 0)) {
                    return { fail: true, msg: '灭绝三击回血量 K=' + k + ' 非负校验失败' };
                }
                if (Math.abs(h2 - (h1 + k)) > 1) {
                    return { fail: true, msg: '灭绝三击回复 ' + k + ' 与血线 ' + h1 + '→' + h2 + ' 不一致（回血没写进血量）' };
                }
            }
        }

        // 本场灭绝未出场 / 未触发任何被盯行为 → 无信号，skip（非 fail）
        if (!triggered) return 'skip';
        return { pass: true };
    }
};
