// 回归规则：反伤弟子（damageReflect）反弹数值、取整与归属自洽 —— 301 线（伤害数值与取整域）
// 机制真源：modules/331-custom-effects.js registerMechanicHandler(DAMAGE_REFLECT)
//   · 触发：目标名 === 机制声明名（反伤弟子）且存活，且本击 dmg > 0
//   · 值：value = Math.floor(dmg × reflectRatio)，dmg = core/209 L460 广播的 dmgCalc.dmg
//     （波动减伤 hpBonus 之前、护盾吸收之前的最终伤害）——反伤只认引擎实数，不吃显示口径。
//   · 比例唯一真源：content/001 characters['反伤弟子'].mechanics.damageReflect.reflectRatio
//   · 归属：反弹落在「进攻者」头上；条目挂在本次 ATTACK 组的 entries 里（core/209 L474-489）。
// 判据（任一不符判红）：
//   A. 取整：反弹值必须是整数且 ≥1（floor 后 ≤0 时机制直接 return，不得产条目）
//   B. 公式：反弹值 === floor(本击 dmgCalc.dmg × reflectRatio)
//   C. 归属不串：data.unitUid === 本击 attacker.uid；data.sourceName === 本击 target.name
//   D. 印数同源：本击战报组里的「⚡ 反伤护盾：X反弹 N 点给 Y」N === fmtNum(反弹值)，
//      X=来源名、Y=进攻者名（按「ATTACK fact ↔ 攻击组」同序配对，避免抄到别击的行）
// 颗粒度：反伤是 floor 后整数，不做 1 点「显示颗粒度」容忍（那是主伤害行的口径，别串到这里）。
// 零触发守卫：本局没有 DISCIPLE_REBOUND 条目 → skip（没场景 ≠ 通过）。
export const VER = 'tests/health-rules/301-disciple-rebound-account.js V1.0.1';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';
import { fmtNum } from '../../infra/102-core-utils.js';
import { getGameData } from '../../core/201-config-5v5-test.js';
import { plain } from '../122health-utils.js';

function isNum(v) { return typeof v === 'number' && isFinite(v); }

// content 里 mechanics 可能是对象（当前）也可能被规范化成数组，两种都认
function findReflectRatio(charName) {
    const gd = getGameData && getGameData();
    const char = gd && gd.characters && gd.characters[charName];
    const mech = char && char.mechanics;
    if (!mech) return null;
    const list = Array.isArray(mech) ? mech : [mech];
    for (const m of list) {
        if (!m || m.type !== 'damageReflect') continue;
        if (isNum(m.reflectRatio)) return m.reflectRatio;
    }
    return null;
}

// ATTACK fact 与「攻击组」同序配对（组=顶层带 entries 且有 combat-text/damage-text 的节点）
function pairGroups(log) {
    const groups = [];
    for (const n of (log || [])) {
        if (!n || !Array.isArray(n.entries)) continue;
        const hasHit = n.entries.some(e => e && (e.type === 'combat-text' || e.type === 'damage-text'));
        if (hasHit) groups.push(n);
    }
    return groups;
}

export const rule301 = {
    group: '伤害数值与取整',
    name: '反伤弟子反弹数值与归属自洽(回归)',
    test: function (ctx, log) {
        const facts = ctx && Array.isArray(ctx.facts) ? ctx.facts : [];
        if (facts.length === 0) return 'skip';

        const attacks = facts.filter(f => f && f.factType === FACT_TYPES.ATTACK);
        const groups = pairGroups(log);
        const pairOk = groups.length === attacks.length;

        const ratioCache = {};
        let saw = 0;
        const fails = [];

        attacks.forEach((f, ai) => {
            const d = f.data || {};
            const entries = Array.isArray(d.entries) ? d.entries : [];
            const attackerUid = d.attacker ? d.attacker.uid : null;
            const attackerName = d.attacker ? d.attacker.name : '';
            const targetName = d.target ? d.target.name : '';
            const dmg = d.dmgCalc && d.dmgCalc.dmg;
            const grp = pairOk ? groups[ai] : null;
            const grpText = grp ? grp.entries.map(e => plain(e && e.text)).filter(Boolean) : [];

            for (const e of entries) {
                if (!e || e.factType !== FACT_TYPES.DISCIPLE_REBOUND) continue;
                saw++;
                const ed = e.data || {};
                const rebound = ed.rebound;

                // A. 取整 + 下限
                if (!isNum(rebound)) {
                    fails.push(`反伤条目缺数值（sourceName=${String(ed.sourceName)}）`);
                    continue;
                }
                if (rebound < 1 || Math.abs(rebound - Math.round(rebound)) > 1e-9) {
                    fails.push(`反伤 ${rebound} 非「floor 后 ≥1 的整数」（取整/下限失守）`);
                }

                // B. 公式（本击 dmg × 内容表比例）
                const src = String(ed.sourceName || targetName);
                if (!(src in ratioCache)) ratioCache[src] = findReflectRatio(src);
                const ratio = ratioCache[src];
                if (!isNum(ratio)) {
                    fails.push(`content/001 缺 ${src} 的 damageReflect.reflectRatio（反弹比例无真源）`);
                } else if (!isNum(dmg)) {
                    fails.push('反伤所在 ATTACK 缺 dmgCalc.dmg（无法对账反弹基数）');
                } else {
                    const expect = Math.floor(dmg * ratio);
                    if (Math.abs(rebound - expect) > 1e-9) {
                        fails.push(`反伤 ${rebound} ≠ floor(${fmtNum(dmg)}×${ratio})=${expect}`);
                    }
                }

                // C. 归属不串：反弹打给进攻者，来源是本击目标
                if (attackerUid != null && ed.unitUid != null && String(ed.unitUid) !== String(attackerUid)) {
                    fails.push(`反伤承受者 uid=${ed.unitUid} ≠ 本击进攻者 uid=${attackerUid}（归属串了）`);
                }
                if (targetName && src && src !== targetName) {
                    fails.push(`反伤来源 ${src} ≠ 本击目标 ${targetName}（归属串了）`);
                }

                // D. 印数同源（只认本击攻击组内的行）
                const line = grpText.find(t => t.indexOf('反伤护盾') !== -1);
                if (line) {
                    const m = line.match(/反弹\s*(-?\d+(?:\.\d+)?)\s*点/);
                    if (m && Math.abs(Number(m[1]) - fmtNum(rebound)) > 1e-9) {
                        fails.push(`战报印数 ${m[1]} ≠ 反弹值 ${fmtNum(rebound)}（印数不同源）`);
                    }
                    if (attackerName && line.indexOf(attackerName) === -1) {
                        fails.push(`反伤行未落在进攻者 ${attackerName} 头上（文案归属错）`);
                    }
                }
            }
        });

        if (saw === 0) return 'skip';
        if (fails.length) return { fail: true, msg: fails.slice(0, 4).join('；') };
        return 'pass';
    }
};
