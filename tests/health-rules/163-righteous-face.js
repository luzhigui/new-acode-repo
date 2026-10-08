// 回归规则：正义国字脸·叠防数值（ATTACK fact 的 data.pangDefGain）
// 机制源（modules/26elite-sixsects.js L334 addMod def，group:'righteousFace'；L365 把 defGain 写进本击
//   ATTACK fact 的 data.pangDefGain，render/38 据此产 STAT_CHANGE(def) 飘「🛡+N」）。
// 此前该 group 只有对照器（stat-decl RIGHTEOUS_FACE）盯"声明==实际"，规则侧看不到——
//   pangDefGain 挂在攻击 fact 嵌套数据里，规则只看渲染文案根本看不见。2026-10-08 Step 0 后规则能读
//   原始 fact，本规则按"声明值==配置真值"对账，真正长牙（与 160 蛛变同模式）。
// 为什么值得盯（真实回归，非对照器能替）：对照器只验"事实 pangDefGain==实际 addMod 值"，本规则验
//   "事实 pangDefGain 本身==配置 defGain"——即写事实那行（modules/26 L365）被改硬编码/漏改引用、
//   或 config 改了但事实没更时，对照器（看 addMod 入参）未必现形，本规则会。
// 复活信号：
//   1) pangDefGain 非有限数 / ≤0 → 加防量算坏（取整/漏值）
//   2) pangDefGain !== getSkillParams('胖远桥','righteousFace').defGain → 配置改了事实没更/写错值
//   3) 带 pangDefGain 的攻击 attacker 非胖远桥 → 字段串味
// 误报规避：本场无带 pangDefGain 的 ATTACK fact 直接 skip；config 取不到就跳过对应判据。
export const VER = 'tests/health-rules/163-righteous-face.js V1.0.0';
import { getSkillParams } from '../../core/01config-5v5-test.js';
import { FACT_TYPES } from '../../infra/56-battle-enums.js';

export const rule110 = {
    group: '数值回归',
    name: '正义国字脸叠防数值(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!Array.isArray(facts) || facts.length === 0) return 'skip';
        let face = null;
        try { face = getSkillParams('胖远桥', 'righteousFace'); } catch (e) { face = null; }
        let checked = 0;
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f || f.factType !== FACT_TYPES.ATTACK) continue;
            const d = f.data || {};
            if (typeof d.pangDefGain !== 'number') continue;

            // 判据1：加防量有限且为正（永久叠防，非正即机制坏）
            if (!isFinite(d.pangDefGain) || d.pangDefGain <= 0) {
                return { fail: true, msg: '复发：正义国字脸 pangDefGain=' + d.pangDefGain + '（非正/非数）' };
            }
            // 判据2：声明值 == 配置真值
            if (face && typeof face.defGain === 'number' && d.pangDefGain !== face.defGain) {
                return { fail: true, msg: '复发：正义国字脸 pangDefGain=' + d.pangDefGain
                    + '（配置 defGain=' + face.defGain + '，事实与配置不符）' };
            }
            // 判据3：带 pangDefGain 的攻击应来自胖远桥
            if (d.attacker && d.attacker.name && d.attacker.name !== '胖远桥') {
                return { fail: true, msg: '复发：正义国字脸 pangDefGain 出现在非胖远桥攻击上（attacker=' + d.attacker.name + '）' };
            }
            checked++;
        }
        if (checked === 0) return 'skip';
        return { fail: false };
    }
};
