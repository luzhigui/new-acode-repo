// tests/health-rules/259-summon-uid-trace.js | 2026-11-08（体检总框架 D6·召唤物/附身/占格）
// SUMMON_UNIT 契约刚补 summonUid（2026-11-08）。本规则只验「uid 本身可信」：
//   ① 必带 summonUid（非空字符串）—— 缺了后续事件就无法按个体归位；
//   ② 同一场里 uid 不许重复（重复 = 两只召唤物共用一个身份，统计必串行）；
//   ③ 落点 pos 必须是 1~9 整数（3×3 站位）；
//   ④ 必带 summonName（渲染与统计都靠它）。
// 「召唤之后有没有 fact 引用这只」只进观察项：实测 156 场 525 次召唤中**零出现 0 只**
//   （deep 查 data 任意字段/嵌套数组；早先只查攻击/成长/激励时统计出的「245 只零引用」是漏查
//   增益、毒、治疗等引用造成的假数，已改正）。事实流是渲染的唯一输入，不存在另一条渲染消费通道。
// 已知契约缺口（登记 tests/known-transfers.md）：具名召唤点 313/318/326/339 已于 0c9f44f7 补 `byUid`；
//   仍缺 core/204 两处——L154 雌鹰召唤无 byName/byUid、L344 众志成城补员只有 byName 无 byUid，
//   同名双谢逊/双张中时无法按 uid 核对「谁召唤的谁」。补齐后本条再加「byName/byUid 必填」硬判据。
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

        // 观察：召唤后事实流里是否还出现过该 uid —— 任意字段/嵌套数组都算（deep 查），
        //   不只查攻击，避免把「被加增益/中毒/被治疗/被复活」这类引用漏成零引用。
        //   事实流是渲染的唯一输入（render/412 按 fact 类型消费），所以「零出现」= 战报里除召唤那一行外
        //   再没有任何关于这只的演出，并不存在另一条「渲染消费」通道要单独核对。
        const containsUid = (o, uid, depth) => {
            if (depth > 4 || o == null) return false;
            if (typeof o === 'string') return o === uid;
            if (Array.isArray(o)) return o.some(x => containsUid(x, uid, depth + 1));
            if (typeof o === 'object') {
                for (const k in o) if (containsUid(o[k], uid, depth + 1)) return true;
            }
            return false;
        };
        let neverRef = 0;
        for (const s of summons) {
            if (typeof s.uid !== 'string' || s.uid === '') continue;
            let ref = false;
            for (let i = s.i + 1; i < facts.length && !ref; i++) {
                if (containsUid(facts[i] ? facts[i].data : null, s.uid, 0)) ref = true;
            }
            if (!ref) neverRef++;
        }

        const observe = `召唤 ${summons.length} 只，其中 ${neverRef} 只此后事实流零出现（战报里只有召唤那一行）`;
        if (fails.length) return { fail: true, msg: fails.slice(0, 3).join('；') };
        return { fail: false, observe: observe };
    }
};
