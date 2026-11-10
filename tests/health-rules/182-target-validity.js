// tests/health-rules/182-target-validity.js
// 体检规则：目标选择合法性（不鞭尸 / 不自伤 / 不误伤同阵营）
//
// 三个判据都只用原始 fact 流里的 attacker / target / snap：
//   ① 鞭尸：目标已经阵亡（本战报更早的击杀已把它记入死亡名单），后续任何一次攻击/闪避/免疫/未命中还指向它。
//      复活豁免：收到 skillAnnounce 的「圣火不熄」后把它移出死亡名单（复活后当然可以再被攻击）。
//   ② 自伤：attacker.uid === target.uid（攻击自己）。
//   ③ 误伤同阵营：attacker.camp === target.camp。两条豁免通道（宁漏勿误）：
//      a) 机制豁免（按回合+阵营）：同回合内只要 fact 流里出现过 phantomConfuse{deceiver=施术者}，
//         就证明该术者的「强制改目标」在这一回合生效，故该回合内**敌对阵营**的同阵营出手全部豁免。
//         三个发射点共用这一种 fact：modules/307 成昆「幻影伪装」、modules/338 彭莹玉「双面观音」
//         （女装期他是敌方唯一可选目标时，targetResult 改为攻击自己队友，且不改 attacker 的 camp）、
//         modules/323 小昭·兄「蝶舞迷心」。
//         为什么不用「每条 fact 抵一次」：core/209 只在 buildAttackGroup 时挂 phantomFact，
//         闪避/未命中分支（L281-304）会把这条 fact 丢掉 —— 被改目标的那一击若被闪避，
//         fact 流里就查不到 phantomConfuse（seed=15 stage=5 的 鹿杖客→鹤笔翁 dodge 即此类）。
//      b) 词表兜底（整场跳过）：战报出现「癫/惑心/心智/混乱/幻影」时整套跳过③（如周颠不分敌友）。
//
// 死亡名单只认「attack fact 的 snap.targetAlive === false」或「dmgResult.dead === true」，
// 不从渲染文本猜死没死；死亡名单不全时只会漏报，不会误报。
//
// V1.1.1 | 2026-11-08 第 194 轮：③ 加机制豁免。
//   证据（seed=15 stage=5 共 7 处假红）：同阵营攻击方 空性 / 何太冲 / 少林圆真 / 鹤笔翁 / 鹿杖客，
//   其中 6 次 attack 都有对应 phantomConfuse{deceiver:'彭莹玉', deceiverCamp:'ally', sourceSkill:'双面观音'}；
//   剩下 1 次 dodge（鹿杖客→鹤笔翁）因闪避分支丢 fact 而无从配对，故豁免粒度取「回合+阵营」。
//   真因不是「圆真=成昆伪装」（该场圆真未现形），而是彭莹玉双面观音的强制改目标（camp 不变）。
// V1.1.2 | 2026-11-10 第 202 轮：fact 类型表收口到 _lib/static-truth-slice.mjs 的 FACT_TYPE_MISS（取值一字未动）。
export const VER = 'tests/health-rules/182-target-validity.js V1.1.2';

// fact 类型表走公共件（第 202 轮「一事一源」收口，原先本文件手抄一份）
import { FACT_TYPE_MISS as TARGET_FACT_TYPES } from '../_lib/static-truth-slice.mjs';

const FRIENDLY_FIRE_EXEMPT_WORDS = ['癫', '惑心', '心智', '混乱', '幻影'];
const PHANTOM_CONFUSE_TYPE = 'phantomConfuse';

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

        // 改目标回合账（预扫一遍）：'round' → 施术者阵营。先扫后判，不依赖 fact 先后顺序。
        //   phantomConfuse 的 deceiverCamp 字段只有 modules/338 带；307/323 只有名字，
        //   故用全流 attacker/target/dodger 快照建「名字→阵营」表来补。
        const redirectRounds = Object.create(null);
        const nameCamp = Object.create(null);
        for (const f of fs) {
            if (!f || !f.factType) continue;
            const d = f.data || {};
            const us = [d.attacker, d.target, d.dodger];
            for (const u of us) if (u && u.name && u.camp) nameCamp[u.name] = u.camp;
        }
        let pr = null;
        for (const f of fs) {
            if (!f || !f.factType) continue;
            const d = f.data || {};
            if (f.factType === 'roundStart') { pr = d.round; continue; }
            if (f.factType !== PHANTOM_CONFUSE_TYPE || !d.unitName) continue;
            const decCamp = d.deceiverCamp || nameCamp[d.deceiver];
            if (!decCamp) continue;   // 施术者阵营查不到就不放宽（宁可漏报，不给假绿）
            redirectRounds[pr == null ? '?' : pr] = decCamp;
        }

        const dead = Object.create(null);
        let checked = 0;
        let exempted = 0;
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
            if (a.camp && t.camp && a.camp === t.camp) {
                const decCamp = redirectRounds[(round == null ? '?' : round)];
                if (friendlyExempt || (decCamp && a.camp !== decCamp)) {
                    exempted++;   // 该回合已证实施术者强制改目标生效，敌对阵营的同阵营出手不算误伤
                } else {
                    errs.push('第' + (round == null ? '?' : round) + '回合：' + (a.name || a.uid) + ' 攻击了同阵营的 ' + (t.name || t.uid) + '（误伤）');
                }
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
                    (exempted ? '；另有 ' + exempted + ' 次同阵营出手已按机制豁免（' +
                        (friendlyExempt ? '癫/惑心类词表' : 'phantomConfuse') + '）' : '')
            };
        }
        return { fail: false, msg: '目标选择合法：核对 ' + checked + ' 次出手的指目标' + (exempted ? '（' + exempted + ' 次同阵营出手按机制豁免）' : '') };
    }
};
