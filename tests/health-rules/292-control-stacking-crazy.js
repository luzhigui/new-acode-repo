// tests/health-rules/292-control-stacking-crazy.js | 2026-11-08（体检总框架 D11·控制与意识类机制）
// 控制叠加一致性：癫（不分敌友）与其它控制同时存在时，癫的两条硬承诺不能被任何控制路径改写。
//
// 机制源（modules/333-elite-mingjiao-crazy.js）：
//   · 持有者出手前强制 _neverMiss / _ignoreDodge（选敌钩子里每击重设）；
//   · 目标随机不分敌友，开场白「🤪 X 受到「癫」的影响，不分敌友地向 Y 发起攻击！」进本击攻击组；
//   · 攻击后先落开场白，再把癫传染给目标（持有者换人）。
// 为什么盯叠加：惑心（core/215 applyMindControlCore）会洗乱站位，癫的选敌是独立钩子；
//   两者同时在场时，位置/阵营一变，最容易出现「癫持有者被换位后不再必中」或
//   「癫随手改目标但攻击组里没有开场白」——战绩会把这次误伤记成全随机，归因链断。
//
// 判据：
//   ① 必中/无视闪避：当前癫持有者（按开场白/传染报幕的 uid 链维护）不得出现 MISS 或 DODGE；
//   ② 报幕留痕：持有者每一次 ATTACK 都必须在本回合事实流里带一条「受到「癫」的影响」开场白
//      （免疫分支的开场白落在免疫块之后，仍属本击，故按「本回合 + 名字」认，不要求嵌在攻击组里）；
//   ③ 持有者自指：传染源与目标同一 uid（自己传自己＝癫卡死）——与 190 的重合部分只作兜底，
//      190 已按名字链判，本规则按 uid 判，两者独立。
//
// 误报规避：本场既没有癫开场白、开局也没有 _isCrazy 单位 → skip；
//   同名克隆（拒马等召唤物）按名字认留痕，宁漏勿误。
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

export const VER = 'tests/health-rules/292-control-stacking-crazy.js V1.0.0';

const RE_OPEN = /🤪 (.+?) 受到「癫」的影响/;
const RE_TRANSFER = /🤪 (.+?) 将「癫」传染给了 (.+?)$/;
const RE_DEATH = /🤪 「癫」随着 (.+?) 的死亡传给了 (.+?)$/;
const RE_BACK = /🤪 「癫」找不到攻击者，回到了 (.+?) 身上$/;
const RE_RANDOM = /🤪 周颠已阵亡，「癫」随机传给了 (.+?)$/;

function stripTags(s) {
    return String(s || '').replace(/<[^>]+>/g, '');
}

export const rule292 = {
    group: '控制与意识回归',
    name: '控制叠加一致性·癫必中与报幕(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        const fs = facts || (ctx && ctx.facts) || [];
        if (!Array.isArray(fs) || fs.length === 0) return 'skip';

        // 持有者：uid 主锚点 + 名字兜底（召唤物可能没有稳定 uid）
        const holderUids = new Set();
        const holderNames = new Set();
        for (const u of (beforeA || [])) {
            if (u && u.state && u.state._isCrazy) {
                if (u.uid != null) holderUids.add(u.uid);
                if (u.name) holderNames.add(u.name);
            }
        }
        for (const u of (beforeE || [])) {
            if (u && u.state && u.state._isCrazy) {
                if (u.uid != null) holderUids.add(u.uid);
                if (u.name) holderNames.add(u.name);
            }
        }
        const isHolder = (u) => !!u && ((u.uid != null && holderUids.has(u.uid)) || (u.name && holderNames.has(u.name)));

        // 预扫：回合号 + 癫开场白（回合|名字）—— 开场白可能落在攻击组之后的免疫块，不按条目位置认
        const roundAt = new Array(fs.length);
        const openSet = new Set();      // 回合|名字（拒马这类无稳定 uid 的召唤物兜底）
        const openUidSet = new Set();   // 回合|uid（成昆/圆真这类会改名的单位按 uid 认）
        let round = 0;
        let announceN = 0;
        for (let i = 0; i < fs.length; i++) {
            const f = fs[i];
            const d = (f && f.data) || {};
            if (f && f.factType === FACT_TYPES.ROUND_START) {
                round = (typeof d.round === 'number') ? d.round : round + 1;
            }
            roundAt[i] = round;
            if (f && f.factType === FACT_TYPES.SKILL_ANNOUNCE && d.skillName === '癫') {
                announceN++;
                const note = stripTags(d.note);
                const m = note.match(RE_OPEN);
                if (m) openSet.add(round + '|' + m[1]);
                if (d.unitUid != null) openUidSet.add(round + '|' + d.unitUid);
            }
        }
        if (announceN === 0 && holderUids.size === 0 && holderNames.size === 0) return 'skip';
        if (process.env.D11_DEBUG) {
            for (const f of fs) {
                const d = f && f.data || {};
                if (f && f.factType === FACT_TYPES.SKILL_ANNOUNCE && d.skillName === '癫') console.log('[D11] ANN', JSON.stringify(d));
                if (f && f.factType === FACT_TYPES.ATTACK && d.attacker && d.attacker.name === '成昆') console.log('[D11] ATK', JSON.stringify(d.attacker));
            }
        }

        const fails = [];
        let holderAttacks = 0;
        for (let i = 0; i < fs.length; i++) {
            const f = fs[i];
            if (!f || !f.factType) continue;
            const d = f.data || {};
            const r = roundAt[i];

            if (f.factType === FACT_TYPES.SKILL_ANNOUNCE && d.skillName === '癫') {
                const note = stripTags(d.note);
                let m;
                if ((m = note.match(RE_OPEN))) {
                    if (d.unitUid != null) holderUids.add(d.unitUid);
                    if (m[1]) holderNames.add(m[1]);
                } else if ((m = note.match(RE_TRANSFER))) {
                    if (d.unitUid != null) holderUids.delete(d.unitUid);
                    if (d.floatUid != null) holderUids.add(d.floatUid);
                    if (m[1]) holderNames.delete(m[1]);
                    if (m[2]) holderNames.add(m[2]);
                    if (d.unitUid != null && d.floatUid != null && d.unitUid === d.floatUid) {
                        fails.push('癫传染源与目标同一单位（uid=' + d.unitUid + '，自我传染＝癫卡死）');
                    }
                } else if ((m = note.match(RE_DEATH))) {
                    if (d.unitUid != null) holderUids.delete(d.unitUid);
                    if (d.floatUid != null) holderUids.add(d.floatUid);
                    if (m[1]) holderNames.delete(m[1]);
                    if (m[2]) holderNames.add(m[2]);
                } else if ((m = note.match(RE_BACK)) || (m = note.match(RE_RANDOM))) {
                    if (d.floatUid != null) holderUids.add(d.floatUid);
                    if (m[1]) holderNames.add(m[1]);
                }
                continue;
            }

            if (f.factType === FACT_TYPES.MISS || f.factType === FACT_TYPES.DODGE) {
                const a = d.attacker;
                if (!isHolder(a)) continue;
                if (a && a.state && a.state._isDead) continue; // 死后出手：unit.alive=false 时 333 的报幕钩子本就不发，归 D10
                fails.push('第' + r + '回合 癫持有者「' + (a && a.name) + '」' +
                    (f.factType === FACT_TYPES.MISS ? '未命中' : '被闪避') + '（必中/无视闪避失效）');
                continue;
            }

            if (f.factType === FACT_TYPES.ATTACK) {
                const a = d.attacker || d.unit;
                if (!isHolder(a)) continue;
                if (a && a.state && a.state._isDead) continue; // 同上：阵亡后仍排队的攻击不再走 333 报幕
                holderAttacks++;
                if (!openSet.has(r + '|' + (a && a.name)) && !(a && a.uid != null && openUidSet.has(r + '|' + a.uid))) {
                    fails.push('第' + r + '回合 癫持有者「' + (a && a.name) + '」出手但没有「受到「癫」的影响」报幕');
                }
            }
        }

        if (fails.length) {
            return { fail: true, msg: '癫（控制叠加）违规 ' + fails.length + ' 处：' + fails.slice(0, 4).join('；') };
        }
        if (holderAttacks === 0 && announceN === 0) return 'skip';
        return { fail: false, msg: '癫必中/无视闪避与报幕一致：持有者出手 ' + holderAttacks + ' 次，报幕 ' + announceN + ' 条' };
    }
};
