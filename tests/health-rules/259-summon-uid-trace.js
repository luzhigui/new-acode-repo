// tests/health-rules/259-summon-uid-trace.js | 2026-11-08（体检总框架 D6·召唤物/附身/占格）
// SUMMON_UNIT 契约刚补 summonUid（2026-11-08）。本规则只验「uid 本身可信」：
//   ① 必带 summonUid（非空字符串）—— 缺了后续事件就无法按个体归位；
//   ② 同一场里 uid 不许重复（重复 = 两只召唤物共用一个身份，统计必串行）；
//   ③ 落点 pos 必须是 1~9 整数（3×3 站位）；
//   ④ 必带 summonName（渲染与统计都靠它）。
// 「召唤之后有没有 fact 引用这只」只进观察项：实测 156 场 677 次召唤中 245 只此后零引用
//   （多为战斗结束前没轮到出手的蹦蹦/幼狮），零引用本身不等于机制坏，不据此报红。
// 已知契约缺口（登记 tests/known-transfers.md，等主代码）：SUMMON_UNIT 只带 byName 不带 byUid，
//   同名双谢逊/双张中时无法按 uid 核对「谁召唤的谁」。
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

export const rule259 = {
    group: '召唤物生命周期',
    name: '召唤物 uid 唯一与落点合法(回归)',
    test: function (ctx) {
        const facts = ctx && Array.isArray(ctx.facts) ? ctx.facts : [];
        if (facts.length === 0) return 'skip';

        let round = 0;
        const fails = [];
        const summons = [];
        const seen = new Set();
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f) continue;
            if (f.factType === FACT_TYPES.ROUND_START) {
                round = (f.data && typeof f.data.round === 'number') ? f.data.round : round + 1;
                continue;
            }
            if (f.factType !== FACT_TYPES.SUMMON_UNIT) continue;
            const d = f.data || {};
            const uid = d.summonUid;
            summons.push({ i: i, uid: uid, name: d.summonName, pos: d.pos });
            if (typeof uid !== 'string' || uid === '') {
                fails.push(`第${round}回合召唤「${d.summonName || '?'}」缺 summonUid`);
            } else if (seen.has(uid)) {
                fails.push(`第${round}回合召唤 uid 重复：${uid}（${d.summonName || '?'}）`);
            } else {
                seen.add(uid);
            }
            if (!(typeof d.pos === 'number' && Number.isInteger(d.pos) && d.pos >= 1 && d.pos <= 9)) {
                fails.push(`召唤「${d.summonName || '?'}」落点 pos=${String(d.pos)}（合法 1~9 整数）`);
            }
            if (typeof d.summonName !== 'string' || d.summonName === '') {
                fails.push(`召唤 fact 缺 summonName（uid=${String(uid)}，渲染与统计都读它）`);
            }
        }
        if (summons.length === 0) return 'skip';

        // 观察：召唤后是否有任何 fact 引用该 uid（出手/被选/被治疗/被激励/成长）
        let neverRef = 0;
        for (const s of summons) {
            if (typeof s.uid !== 'string' || s.uid === '') continue;
            let ref = false;
            for (let i = s.i + 1; i < facts.length && !ref; i++) {
                const f = facts[i];
                if (!f) continue;
                const d = f.data || {};
                if (f.factType === FACT_TYPES.ATTACK) {
                    if ((d.attacker && d.attacker.uid === s.uid) || (d.target && d.target.uid === s.uid)) ref = true;
                } else if (f.factType === FACT_TYPES.LION_GROW) {
                    if (d.unitUid === s.uid) ref = true;
                } else if (f.factType === FACT_TYPES.LION_INSPIRE) {
                    if (Array.isArray(d.targets) && d.targets.some(t => t && t.uid === s.uid)) ref = true;
                }
            }
            if (!ref) neverRef++;
        }

        const observe = `召唤 ${summons.length} 只，其中 ${neverRef} 只此后零引用（多为结束前没轮到出手）`;
        if (fails.length) return { fail: true, msg: fails.slice(0, 3).join('；') };
        return { fail: false, observe: observe };
    }
};
