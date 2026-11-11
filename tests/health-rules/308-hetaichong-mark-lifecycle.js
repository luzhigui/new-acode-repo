// tests/health-rules/308-hetaichong-mark-lifecycle.js | D2 号段 308
// 何太冲「箭靶标记」生命周期：挂标人身份、目标阵营、重挂语义、3 回合窗口、×1.3 / ×1.1 乘区分配。
//   主代码依据：modules/314-elite-sixsects-hetaichong.js 机制②
//     挂标：AFTER_DAMAGE_APPLIED（何太冲或其搭档命中且伤害>0）
//     公告：`🎯 X 标记 Y` / `🎯 X 重新标记 Y`；乘区公告：`箭靶标记 ×M`（line:false 但仍是 fact）
//     消耗：任何人打中带标目标 → 当帧 markBurst；挂标人再命中 → 消耗并重挂（重新标记）
//   判据：
//     ① 挂标人只能是何太冲或其两仪搭档（搭档取自 两仪双修 公告）
//     ② 目标必须与挂标人不同阵营
//     ③ 重新标记前必须有同目标的旧标记；碎裂（markBurst）必须有标记在身
//     ④ 同一目标两次「标记」之间必须至少隔 2 回合（未过期不得重挂，应走「重新标记」）
//     ⑤ 乘区数值全场至多两档、均 >1，且挂标人打出的档位不得低于其他队友
import { FACT_TYPES, CAMP_TYPES } from '../../infra/106-battle-enums.js';

const MARK_ROUNDS = 2; // content/001 何太冲 attackMark.rounds=2（挂标当回合 + 下一回合，共 2 回合）

function unitsOf(a, b) { return [...(a || []), ...(b || [])]; }
function buildNameMap(a, b, c, d) {
  const m = new Map();
  for (const u of [...unitsOf(a, b), ...unitsOf(c, d)]) {
    if (u && u.name != null && !m.has(u.name)) m.set(u.name, u);
  }
  return m;
}

export const rule308 = {
  group: '敌方精英·何太冲',
  name: '何太冲箭靶标记生命周期(回归)',
  test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
    const fs = (facts && facts.length ? facts : (ctx && ctx.facts) || []);
    const byName = buildNameMap(beforeA, beforeE, afterA, afterE);
    const msgs = [];

    // 两仪搭档（从 307 同源公告取）
    let heUid = null, partnerName = null;
    for (const f of fs) {
      if (!f || f.factType !== FACT_TYPES.SKILL_ANNOUNCE || !f.data) continue;
      if (f.data.skillName !== '两仪双修') continue;
      const m = /两仪连接：(.+?)\s*与\s*(.+?)$/.exec(f.data.note || '');
      if (!m) continue;
      if (m[1] === '何太冲') partnerName = m[2].trim();
      else if (m[2] === '何太冲') partnerName = m[1].trim();
      heUid = f.data.unitUid != null ? f.data.unitUid : heUid;
    }
    const carrierUids = new Set();
    if (heUid != null) carrierUids.add(heUid);
    const carrierNames = new Set(['何太冲']);
    if (partnerName) carrierNames.add(partnerName);
    // 搭档 uid 以终局互指为准（同名不同阵营时按名字会认错人）
    const finalUnits = unitsOf(afterA, afterE);
    let partnerUid = null;
    if (heUid != null) {
      const byLink = finalUnits.find(u => u && u.uid !== heUid && u.state && u.state._liangyiPartnerUid === heUid);
      if (byLink) partnerUid = byLink.uid;
    }
    if (partnerUid == null && partnerName && byName.get(partnerName)) partnerUid = byName.get(partnerName).uid;
    if (partnerUid != null) carrierUids.add(partnerUid);

    let round = 1;
    const marks = new Map();       // key → {round, kind}
    const markByName = new Map();  // 目标名 → 最近一次标记的 key（重新标记无 floatUid 时用来找回同一 key）
    const multipliers = [];        // {value, isCarrier, unitName, round}
    let hasMarkFact = false;

    const uidOf = (name) => (name && byName.get(name) ? byName.get(name).uid : null);
    const campOfUid = (uid) => {
      if (uid == null) return null;
      const u = finalUnits.find(x => x && x.uid === uid);
      return u ? u.camp : null;
    };

    fs.forEach((f, index) => {
      const t = f && f.factType;
      if (!t) return;
      const d = f.data || {};
      if (t === FACT_TYPES.ROUND_START) { round = d.round || round; return; }
      if (t === FACT_TYPES.ATTACK) {
        if (d.markBurst) {
          const tg = d.target || {};
          const atk = d.attacker || {};
          const key = tg.uid != null ? tg.uid : tg.name;
          const isCarrier = (atk.uid != null && carrierUids.has(atk.uid)) || carrierNames.has(atk.name);
          if (!marks.has(key)) {
            msgs.push(`碎裂演出没有对应标记：${tg.name || tg.uid}（第 ${round} 回合）`);
          } else if (!isCarrier) {
            // 队友消费：标记当帧消失；挂标人自打自挂（先出「重新标记」公告、后落本击 ATTACK），不在此清
            marks.delete(key);
          }
        }
        return;
      }
      if (t !== FACT_TYPES.SKILL_ANNOUNCE) return;
      const note = d.note || '';
      const skill = d.skillName || '';
      if (/箭靶标记/.test(skill) && /×/.test(note)) {
        const mv = /×(\d+(?:\.\d+)?)/.exec(note);
        if (mv) {
          // 乘区公告固定以何太冲名义落（unitName 恒为何太冲），真实出手者在 floatUid
          const attackerUid = d.floatUid != null ? d.floatUid : d.unitUid;
          const carrier = attackerUid != null && carrierUids.has(attackerUid);
          multipliers.push({ value: parseFloat(mv[1]), isCarrier: carrier, unitName: d.unitName, round });
        }
        return;
      }
      if (!/箭靶标记/.test(skill)) return;
      const rem = /🎯\s*(.+?)\s*重新标记\s*(.+?)$/.exec(note);
      const fresh = rem ? null : /🎯\s*(.+?)\s*标记\s*(.+?)$/.exec(note);
      const mm = rem || fresh;
      if (!mm) return;
      hasMarkFact = true;
      const cName = mm[1].trim(), tName = mm[2].trim();
      const isRem = !!rem;
      if (!carrierNames.has(cName) && !(cName && byName.get(cName) && carrierUids.has(byName.get(cName).uid))) {
        msgs.push(`非何太冲/搭档挂标：${cName} 标记 ${tName}（第 ${round} 回合）`);
      }
      // 只在载荷带结构化 uid 时才判阵营（何太冲挂标公告同时带 unitUid=挂号人、floatUid=目标，均为引擎 uid）；
      //   重新标记公告不带 floatUid，按名字可能撞同名跨阵营，不做阵营判定。
      const structural = d.unitUid != null && d.floatUid != null;
      if (structural) {
        const carrierCamp = campOfUid(d.unitUid);
        const targetCamp = campOfUid(d.floatUid);
        if (carrierCamp && targetCamp && carrierCamp === targetCamp) {
          msgs.push(`挂标目标同阵营：${cName}（${carrierCamp}）标记 ${tName}（${targetCamp}）`);
        }
      }
      let key = (structural ? d.floatUid : null) || markByName.get(tName) || uidOf(tName) || tName;
      markByName.set(tName, key);
      if (isRem) {
        if (!marks.has(key)) {
          msgs.push(`重新标记无旧标记：${cName} 重新标记 ${tName}（第 ${round} 回合）`);
        }
        marks.set(key, { round, kind: 're' });
      } else {
        const old = marks.get(key);
        if (old && round - old.round < MARK_ROUNDS) {
          msgs.push(`标记未过期就重挂（应走重新标记）：${tName} 旧标第 ${old.round} 回合、新标第 ${round} 回合`);
        }
        marks.set(key, { round, kind: 'fresh' });
      }
    });


    // ⑤ 乘区档位
    if (multipliers.length) {
      const vals = [...new Set(multipliers.map(x => x.value))];
      if (vals.length > 2) msgs.push(`箭靶标记乘区出现 ${vals.length} 档：${vals.join('/')}（应仅挂号/队友两档）`);
      if (vals.some(v => !(v > 1))) msgs.push(`箭靶标记乘区出现 ≤1 的档位：${vals.join('/')}`);
      if (vals.length === 2) {
        const hi = Math.max(...vals), lo = Math.min(...vals);
        for (const mul of multipliers) {
          if (mul.isCarrier && mul.value !== hi) msgs.push(`挂号人 ${mul.unitName} 用了低档 ×${mul.value}（应 ×${hi}）`);
          if (!mul.isCarrier && mul.value !== lo) msgs.push(`队友 ${mul.unitName} 用了高档 ×${mul.value}（应 ×${lo}）`);
        }
      }
    }

    if (!hasMarkFact && announcesHasMarkFact(fs)) {
      // 有挂标相关公告却解析不到结构，不静默放行
      msgs.push('箭靶标记公告存在但无法解析挂标行');
    }

    if (msgs.length) return { fail: true, msg: msgs.slice(0, 8).join(' | ') };
    if (hasMarkFact) return 'pass';
    return 'skip';
  }
};

function announcesHasMarkFact(fs) {
  return fs.some(f => f && f.data && /箭靶标记/.test(f.data.skillName || '') && /🎯/.test(f.data.note || ''));
}
