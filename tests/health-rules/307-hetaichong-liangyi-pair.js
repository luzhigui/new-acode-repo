// tests/health-rules/307-hetaichong-liangyi-pair.js | D2 号段 307
// 何太冲「两仪双修」：结连一次、搭档对系、双方互指、结连公告条目齐全。
//   主代码依据：modules/314-elite-sixsects-hetaichong.js register() 机制①
//     he.state._liangyiPartnerUid = partner.uid；partner.state._liangyiPartnerUid = he.uid
//     pushSkillAnnounce('两仪双修', `☯ 两仪连接：${he.name} 与 ${partner.name}`)
//   判据：
//     ① 每场最多一条「两仪双修」公告（连接绑定不更换）
//     ② 公告里的双方都是本场名册里的单位，且不是同一人
//     ③ 终局若双方都在，state._liangyiPartnerUid 必须互相指向
//     ④ 双方未触发红血（红血会换职业）时，职业必须是对系（战士↔远程）
import { FACT_TYPES, ROLE_TYPES } from '../../infra/106-battle-enums.js';

function allUnits(a, b, c, d) {
  return [...(a || []), ...(b || []), ...(c || []), ...(d || [])];
}
function findByName(units, name) {
  return units.find(u => u && u.name === name) || null;
}

export const rule307 = {
  group: '敌方精英·何太冲',
  name: '何太冲两仪双修数值与状态(回归)',
  test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
    const fs = (facts && facts.length ? facts : (ctx && ctx.facts) || []);
    const announces = fs.filter(f => f && f.factType === FACT_TYPES.SKILL_ANNOUNCE
      && (f.data && f.data.skillName === '两仪双修'));
    if (announces.length === 0) return 'skip';

    const msgs = [];
    if (announces.length > 1) msgs.push(`两仪双修公告 ${announces.length} 条（应最多 1 条，连接绑定不更换）`);

    const a = announces[0].data || {};
    const m = /两仪连接：(.+?)\s*与\s*(.+?)$/.exec(a.note || '');
    if (!m) {
      msgs.push(`两仪双修公告缺连接双方：${a.note || '（空）'}`);
      return { fail: true, msg: msgs.join(' | ') };
    }
    const n1 = m[1].trim(), n2 = m[2].trim();
    if (n1 === n2) msgs.push(`两仪双修连接到自己：${n1}`);
    if (n1 !== '何太冲' && n2 !== '何太冲') msgs.push(`两仪双修缺少何太冲本人：${n1} / ${n2}`);

    const roster = allUnits(beforeA, beforeE);
    if (roster.length) {
      for (const n of [n1, n2]) {
        if (!findByName(roster, n)) msgs.push(`两仪双修搭档不在本场名册：${n}`);
      }
    }

    const final = allUnits(afterA, afterE);
    const u1 = findByName(final, n1);
    const u2 = findByName(final, n2);
    if (u1 && u2) {
      const p1 = u1.state && u1.state._liangyiPartnerUid;
      const p2 = u2.state && u2.state._liangyiPartnerUid;
      if (p1 != null || p2 != null) {
        if (p1 !== u2.uid || p2 !== u1.uid) {
          msgs.push(`两仪双修互指断链：${n1}→${p1}（应 ${u2.uid}） / ${n2}→${p2}（应 ${u1.uid}）`);
        }
      }
      const redUsed = (u1.state && u1.state._redBloodUsed) || (u2.state && u2.state._redBloodUsed);
      if (!redUsed && u1.role && u2.role) {
        const opp = (u1.role === ROLE_TYPES.WARRIOR && u2.role === ROLE_TYPES.RANGED)
          || (u1.role === ROLE_TYPES.RANGED && u2.role === ROLE_TYPES.WARRIOR);
        if (!opp) {
          msgs.push(`两仪双修双方职业不是对系：${n1}=${u1.role} / ${n2}=${u2.role}`);
        }
      }
    }

    return msgs.length ? { fail: true, msg: msgs.join(' | ') } : 'pass';
  }
};
