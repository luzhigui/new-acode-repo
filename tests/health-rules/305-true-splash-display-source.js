// 回归规则：真伤（融会贯通额外）/溅射（流星赶月、乘风突袭）的取整与归属同源 —— 305 线（伤害数值与取整域）
// 机制真源：
//   · 真伤：modules/320 L153-167 extra = Math.floor(|目标atk − 目标def| × CONFIG.ZHANG_RONGHUI_RATIO)，
//     BONUS_DMG 声明在主攻击之后单独扣血；fact 挂在本次 ATTACK 的 entries 里，带 targetUid/targetAlive。
//   · 溅射：core/204 L557/L629 splashDmg = Math.floor(...)，targets 为被溅射单位列表；
//     core/209 L474-489 把声明挂成 ATTACK entries（buff-splash）。
// 判据（任一不符判红）：
//   A. 取整：真伤 extra 必须是整数（floor 出口）；溅射 splashDmg 必须是「floor 后 ≥1 的整数」
//   B. 归属不串：真伤 targetUid 必须等于本击目标 uid；溅射目标名单不得包含本击进攻者（不许自伤）
//   C. 印数同源：本击组里「🔥 融会贯通额外±N」的 N === fmtNum(extra)；
//     「<label>溅射/波及：名单，各-N」的 N === fmtNum(splashDmg)
//   D. 名册一致：溅射 fact.targets 里每个名字都必须出现在该行文本里（条目不串目标）
// 配对口径：ATTACK fact 与「攻击组」同序配对（组=顶层带 entries 且有 combat-text/damage-text 的节点），
//   只认本击组内的行，避免抄到别击的融会贯通/溅射。组数对不上时只做 A/B（不做印数比对）。
// 零触发守卫：本局既无真伤也无溅射条目 → skip。
export const VER = 'tests/health-rules/305-true-splash-display-source.js V1.0.1';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';
import { fmtNum } from '../../infra/102-core-utils.js';
import { plain } from '../122health-utils.js';

function isNum(v) { return typeof v === 'number' && isFinite(v); }
function isInteger(v) { return isNum(v) && Math.abs(v - Math.round(v)) <= 1e-9; }

function pairGroups(log) {
    const groups = [];
    for (const n of (log || [])) {
        if (!n || !Array.isArray(n.entries)) continue;
        const hasHit = n.entries.some(e => e && (e.type === 'combat-text' || e.type === 'damage-text'));
        if (hasHit) groups.push(n);
    }
    return groups;
}

export const rule305 = {
    group: '伤害数值与取整',
    name: '真伤/溅射印数与归属同源(回归)',
    test: function (ctx, log) {
        const facts = ctx && Array.isArray(ctx.facts) ? ctx.facts : [];
        if (facts.length === 0) return 'skip';

        const attacks = facts.filter(f => f && f.factType === FACT_TYPES.ATTACK);
        const groups = pairGroups(log);
        const pairOk = groups.length === attacks.length;

        let saw = 0;
        const fails = [];

        attacks.forEach((f, ai) => {
            const d = f.data || {};
            const entries = Array.isArray(d.entries) ? d.entries : [];
            const attackerName = d.attacker ? d.attacker.name : '';
            const targetUid = d.target ? d.target.uid : null;
            const grp = pairOk ? groups[ai] : null;
            const grpText = grp ? grp.entries.map(e => plain(e && e.text)).filter(Boolean) : [];

            for (const e of entries) {
                if (!e || !e.factType) continue;
                const ed = e.data || {};

                // ── 真伤（融会贯通额外） ────────────────────────────
                if (e.factType === FACT_TYPES.RONG_HUI_BONUS) {
                    saw++;
                    const extra = ed.extra;
                    if (!isInteger(extra)) {
                        fails.push(`融会贯通额外 ${String(extra)} 非整数（floor 出口失守）`);
                    }
                    if (targetUid != null && ed.targetUid != null && String(ed.targetUid) !== String(targetUid)) {
                        fails.push(`融会贯通 targetUid=${ed.targetUid} ≠ 本击目标 uid=${targetUid}（归属串了）`);
                    }
                    // 印数同源：本击组里任意一行对得上即算同源（多段命中可能多行）
                    const lines = grpText.filter(t => /融会贯通额外/.test(t));
                    if (lines.length > 0) {
                        const nums = lines
                            .map(t => t.match(/融会贯通额外\s*[+\-＋－]?\s*(\d+(?:\.\d+)?)/))
                            .filter(Boolean).map(m => Number(m[1]));
                        if (nums.indexOf(fmtNum(extra)) === -1 && nums.every(n => Math.abs(n - fmtNum(extra)) > 1e-9)) {
                            fails.push(`战报印「额外${nums.join('/')}」≠ 真伤值 ${fmtNum(extra)}（印数不同源）`);
                        }
                    }
                }

                // ── 溅射（流星赶月 / 乘风突袭） ──────────────────────
                if (e.factType === FACT_TYPES.METEOR_SHOWER_SPLASH || e.factType === FACT_TYPES.WIND_ASSAULT_SPLASH) {
                    saw++;
                    const splashDmg = ed.splashDmg;
                    if (!isInteger(splashDmg) || splashDmg < 1) {
                        fails.push(`溅射 ${String(splashDmg)} 非「floor 后 ≥1 的整数」（取整/下限失守）`);
                    }
                    const targets = Array.isArray(ed.targets) ? ed.targets : [];
                    const tNames = targets.map(t => (t && t.name) || '').filter(Boolean);
                    if (attackerName && tNames.indexOf(attackerName) !== -1) {
                        fails.push(`溅射名单包含本击进攻者 ${attackerName}（归属串了，自伤）`);
                    }
                    const label = String(ed.label || '');
                    const lines = grpText.filter(t => /溅射|波及/.test(t) && (!label || t.indexOf(label) !== -1));
                    if (lines.length > 0) {
                        let matched = false;
                        for (const t of lines) {
                            const m = t.match(/(?:各)?-(\d+(?:\.\d+)?)/);
                            if (m && isNum(splashDmg) && Math.abs(Number(m[1]) - fmtNum(Math.abs(splashDmg))) <= 1e-9) matched = true;
                        }
                        if (!matched && isNum(splashDmg)) {
                            fails.push(`战报印数 ≠ 溅射值 ${fmtNum(Math.abs(splashDmg))}（印数不同源）`);
                        }
                        for (const n of tNames) {
                            if (lines.some(t => t.indexOf(n) !== -1)) continue;
                            fails.push(`溅射名单 ${n} 未出现在战报行（名册与条目不一致）`);
                        }
                    }
                }
            }
        });

        if (saw === 0) return 'skip';
        if (fails.length) return { fail: true, msg: fails.slice(0, 4).join('；') };
        return 'pass';
    }
};
