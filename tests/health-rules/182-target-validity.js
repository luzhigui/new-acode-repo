// tests/health-rules/182-target-validity.js
// 体检规则：目标选择合法性（不鞭尸 / 不自伤 / 不误伤同阵营）
//
// 三个判据都只用原始 fact 流里的 attacker / target / snap：
//   ① 鞭尸：目标已经阵亡（本战报更早的击杀已把它记入死亡名单），后续任何一次攻击/闪避/免疫/未命中还指向它。
//      复活豁免：收到 skillAnnounce 的「圣火不熄」后把它移出死亡名单（复活后当然可以再被攻击）。
//   ② 自伤：attacker.uid === target.uid（攻击自己）。
//   ③ 误伤同阵营：attacker.camp === target.camp。癫（周颠不分敌友）属于有意设计，
//      本规则在整场战报出现「癫/惑心/心智/混乱/幻影」字样时**整场跳过**③（宁漏勿误，不猜具体豁免条件）。
//
// 死亡名单只认「attack fact 的 snap.targetAlive === false」或「dmgResult.dead === true」，
// 不从渲染文本猜死没死；死亡名单不全时只会漏报，不会误报。
export const VER = 'tests/health-rules/182-target-validity.js V1.0.0';

const TARGET_FACT_TYPES = ['attack', 'miss', 'dodge', 'immune'];
const FRIENDLY_FIRE_EXEMPT_WORDS = ['癫', '惑心', '心智', '混乱', '幻影'];

function collectText(node, out, depth, seen) {
    if (!node || depth > 8) return out;
    if (typeof node === 'string') { out.push(node); return out; }
    if (Array.isArray(node)) { node.forEach(n => collectText(n, out, depth + 1, seen)); return out; }
    if (typeof node !== 'object') return out;
    if (!seen) seen = new WeakSet();
    if (seen.has(node)) return out;    // fact 里存在回指（data.entries 的 item 又指回父 data），必须防环
    seen.add(node);
    if (typeof node.text === 'string') out.push(node.text);
    if (Array.isArray(node.entries)) node.entries.forEach(n => collectText(n, out, depth + 1, seen));
    if (node.data && typeof node.data === 'object') collectText(node.data, out, depth + 1, seen);
    return out;
}

export const rule182 = {
    group: '行动与目标回归',
    name: '目标选择合法性(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        const fs = facts || [];
        if (!fs.length || !Array.isArray(log)) return 'skip';

        let battleText = '';
        try { battleText = collectText(log, [], 0).concat(collectText(fs, [], 0)).join(' '); } catch (e) { battleText = ''; }
        const friendlyExempt = FRIENDLY_FIRE_EXEMPT_WORDS.some(w => battleText.indexOf(w) >= 0);

        const dead = Object.create(null);
        let checked = 0;
        let round = null;
        const errs = [];

        for (const f of fs) {
            if (!f || !f.factType) continue;
            const d = f.data || {};

            if (f.factType === 'roundStart') { round = d.round; continue; }
            if (f.factType === 'roundEnd') continue;
            if (f.factType === 'skillAnnounce' && d.skillName === '圣火不熄' && d.unitUid) {
                delete dead[d.unitUid];   // 复活后解除死亡标记
                continue;
            }
            if (TARGET_FACT_TYPES.indexOf(f.factType) < 0) continue;

            const a = d.attacker;
            const t = d.target || d.dodger;
            if (!a || !a.uid || !t || !t.uid) continue;
            checked++;

            if (dead[t.uid]) {
                errs.push('第' + (round == null ? '?' : round) + '回合：' + (a.name || a.uid) + ' 攻击了已经阵亡的 ' + (t.name || t.uid) + '（鞭尸）');
            }
            if (a.uid === t.uid) {
                errs.push('第' + (round == null ? '?' : round) + '回合：' + (a.name || a.uid) + ' 攻击了自己（自伤）');
            }
            if (!friendlyExempt && a.camp && t.camp && a.camp === t.camp) {
                errs.push('第' + (round == null ? '?' : round) + '回合：' + (a.name || a.uid) + ' 攻击了同阵营的 ' + (t.name || t.uid) + '（误伤）');
            }

            // 本次攻击是否把目标打死——只在 attack fact 上有 snap/dmgResult
            if (f.factType === 'attack' && t.uid) {
                const snap = d.snap || {};
                const dmg = d.dmgResult || {};
                if (snap.targetAlive === false || dmg.dead === true) dead[t.uid] = true;
            }
        }

        if (checked === 0) return 'skip';
        if (errs.length) {
            return {
                fail: true,
                msg: errs.slice(0, 3).join('；') + (errs.length > 3 ? '（共 ' + errs.length + ' 处目标异常）' : '') +
                    (friendlyExempt ? '；本场含癫/惑心类机制，已跳过误伤判据' : '')
            };
        }
        return { fail: false, msg: '目标选择合法：核对 ' + checked + ' 次出手的指目标' + (friendlyExempt ? '（本场含癫/惑心类机制，未判误伤）' : '') };
    }
};
