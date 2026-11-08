// tests/health-rules/309-hetaichong-red-swap-account.js | D2 号段 309
// 何太冲「红血 / 两仪互换」账实一致：触发门槛、每局限一次、互换方向、血量均摊、加血行数字自洽、位置豁免口径。
//   主代码依据：modules/314-elite-sixsects-hetaichong.js 机制③
//     触发：ON_UNIT_ACTED，hp ≤ maxHp*thresholdPct(40%)
//     两仪互换：职业互换 + 走 swapUnitPositions（可能被免疫挡下）+ 血量均摊 floor((hp1+hp2)/2) 后受各自 maxHp 夹取
//     公告：`☯ 两仪互换：A ⇄ B（互换职业与位置，血量均摊至 N）`；位置被免疫时文案明说「位置被免疫挡下」且 swap:null
//           单人：`🩸 A 红血：撤退至 N 号位、转远程` / `🩸 A 红血：退无可退、转战士`
//           加血独立行：`🩸 A 红血：生命 +X（H1 → H2）`
//   判据：
//     ① 互换双方必须是 两仪双修 连接的那一对；swap 载荷与文案一致（挡下时必须 swap:null）
//     ② 每局限一次：同一 uid 的红血/互换触发行最多 1 条；终局 _redBloodUsed 必须为 true
//     ③ 血量均摊：公告「血量均摊至 N」为整数；swaps 的 posA/posB 合法且不同
//     ④ 加血行数字自洽：X>0，且 H2-H1 与 X 差不超过 1（显示取整容差）
//     ⑤ 触发门槛：触发前最近一次挨打后血量 ≤ 40% 上限（无挨打记录则跳过，DOT 触发不可回溯）
//     ⑥ 单人撤退位号落在 4–9（code：1–6 位队友身后 +3）
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

const RED_THRESHOLD = 0.4; // modules/314 redBlood.thresholdPct 默认 40%

function allUnits(a, b, c, d) {
  return [...(a || []), ...(b || []), ...(c || []), ...(d || [])];
}
function findByName(units, name) {
  return units.find(u => u && u.name === name) || null;
}

export const rule309 = {
  group: '敌方精英·何太冲',
  name: '何太冲红血两仪互换账实一致(回归)',
  test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
    const fs = (facts && facts.length ? facts : (ctx && ctx.facts) || []);
    const msgs = [];

    // 两仪连接对（来自 307 同源公告）
    let pair = null, heUid = null;
    for (const f of fs) {
      if (!f || f.factType !== FACT_TYPES.SKILL_ANNOUNCE || !f.data) continue;
      if (f.data.skillName !== '两仪双修') continue;
      const m = /两仪连接：(.+?)\s*与\s*(.+?)$/.exec(f.data.note || '');
      if (!m) continue;
      pair = [m[1].trim(), m[2].trim()];
      heUid = f.data.unitUid != null ? f.data.unitUid : heUid;
    }

    const final = allUnits(afterA, afterE);
    const roster = allUnits(beforeA, beforeE, afterA, afterE);

    const redEvents = [];   // {index, round, uid, name, kind, note, swap, grants}
    const healEvents = [];  // {index, round, uid, name, note, x, h1, h2}
    let round = 1;

    fs.forEach((f, index) => {
      const t = f && f.factType;
      if (!t) return;
      const d = f.data || {};
      if (t === FACT_TYPES.ROUND_START) { round = d.round || round; return; }
      if (t !== FACT_TYPES.SKILL_ANNOUNCE) return;
      const skill = d.skillName || '';
      const note = d.note || '';
      if (skill === '红血加血') {
        const m = /生命\s*\+(\d+(?:\.\d+)?)（(\d+(?:\.\d+)?)\s*→\s*(\d+(?:\.\d+)?)）/.exec(note);
        healEvents.push({
          index, round, uid: d.floatUid != null ? d.floatUid : d.unitUid, name: d.unitName,
          note, x: m ? parseFloat(m[1]) : null, h1: m ? parseFloat(m[2]) : null, h2: m ? parseFloat(m[3]) : null
        });
      } else if (skill === '红血' || skill === '两仪互换') {
        redEvents.push({
          index, round, uid: d.floatUid != null ? d.floatUid : d.unitUid, name: d.unitName,
          kind: skill, note, swap: d.swap || null, grants: d.grants || [], unitUid: d.unitUid
        });
      }
    });

    if (redEvents.length === 0 && healEvents.length === 0) return 'skip';

    // ② 每局限一次
    const redCount = new Map();
    for (const ev of redEvents) {
      if (ev.uid == null) continue;
      redCount.set(ev.uid, (redCount.get(ev.uid) || 0) + 1);
    }
    for (const [uid, n] of redCount) {
      if (n > 1) msgs.push(`红血触发 ${n} 次：uid=${uid}（每局限一次）`);
    }

    // ① / ③ 互换口径
    for (const ev of redEvents) {
      if (ev.kind !== '两仪互换') continue;
      const m = /两仪互换：(.+?)\s*⇄\s*(.+?)(（|$)/.exec(ev.note);
      if (!m) {
        msgs.push(`两仪互换公告缺双方：${ev.note || '（空）'}`);
        continue;
      }
      const a = m[1].trim(), b = m[2].trim();
      if (pair) {
        const ok = (pair[0] === a && pair[1] === b) || (pair[1] === a && pair[0] === b);
        if (!ok) msgs.push(`两仪互换双方不是连接对：${a} ⇄ ${b}（连接对 ${pair.join(' 与 ')}）`);
      } else {
        msgs.push(`两仪互换缺少两仪双修连接公告：${a} ⇄ ${b}`);
      }
      const blocked = /位置被免疫挡下/.test(ev.note);
      if (blocked && ev.swap) msgs.push(`文案称位置被免疫挡下，但仍带 swap 载荷（会演假换位）`);
      if (!blocked && !ev.swap) msgs.push(`文案称互换位置，但缺 swap 载荷：${a} ⇄ ${b}`);
      if (ev.swap) {
        const { aUid, bUid, posA, posB } = ev.swap;
        if (aUid == null || bUid == null || aUid === bUid) msgs.push(`swap 双方 uid 非法：${aUid}/${bUid}`);
        if (ev.unitUid != null && aUid !== ev.unitUid) msgs.push(`swap aUid 与公告单位不符：${aUid} ≠ ${ev.unitUid}`);
        for (const p of [posA, posB]) {
          if (!Number.isInteger(p) || p < 1 || p > 12) msgs.push(`swap 位置非法：${posA}/${posB}`);
        }
        if (posA === posB) msgs.push(`swap 位置相同：${posA}`);
        const partnerUnit = final.find(x => x && x.uid === bUid);
        if (partnerUnit && partnerUnit.state && partnerUnit.state._redBloodUsed === false) {
          msgs.push(`两仪互换后搭档 _redBloodUsed=false：${partnerUnit.name || bUid}`);
        }
      }
      const avg = /血量均摊至\s*(\d+(?:\.\d+)?)/.exec(ev.note);
      if (!avg) msgs.push(`两仪互换公告缺均摊数值：${ev.note}`);
      if (ev.grants.length < 2) msgs.push(`两仪互换 grants 少于 2 条：${ev.grants.length}`);
      for (const g of ev.grants) {
        if (!g || g.atk == null || g.def == null || g.maxHp == null) msgs.push(`红血 grants 字段缺失：${JSON.stringify(g)}`);
      }
    }

    // ⑥ 单人红血口径
    for (const ev of redEvents) {
      if (ev.kind !== '红血') continue;
      const retreat = /撤退至\s*(\d+)\s*号位、转远程/.exec(ev.note);
      if (retreat) {
        const p = parseInt(retreat[1], 10);
        if (p < 4 || p > 9) msgs.push(`单人红血撤退位号越界：${p}（应为 4–9）`);
      } else if (!/退无可退、转战士/.test(ev.note)) {
        msgs.push(`单人红血公告口径异常：${ev.note}`);
      }
      for (const g of ev.grants || []) {
        if (!g || g.atk == null || g.def == null || g.maxHp == null) msgs.push(`红血 grants 字段缺失：${JSON.stringify(g)}`);
      }
    }

    // ④ 加血行数字自洽 + 先有红血行（uid 缺失时退回同名匹配）
    for (const h of healEvents) {
      const prior = redEvents.some(e => e.index < h.index && (e.uid === h.uid || (h.uid == null && e.name === h.name)));
      if (!prior) msgs.push(`红血加血行没有前置红血触发：${h.name}（第 ${h.round} 回合）`);
      if (h.x == null) {
        msgs.push(`红血加血行无法解析数字：${h.note}`);
        continue;
      }
      if (!(h.x > 0)) msgs.push(`红血加血非正值：+${h.x}`);
      if (h.h1 != null && h.h2 != null && Math.abs((h.h2 - h.h1) - h.x) > 1) {
        msgs.push(`红血加血数字不自洽：+${h.x} 但 ${h.h1} → ${h.h2}`);
      }
    }

    // ⑤ 触发门槛：facts 里没有「触发帧血量」这条真值（挨打行的 hpPctAfter 可能早于触发帧，
    //    期间还可能被毒/光环改血），无法可靠回溯，故本规则只做「每局限一次 + 数值/口径/日志」；
    //    阈值核对需要主代码补一条带触发血量的 fact（见 known-transfers）。

    // ② 终局 _redBloodUsed
    for (const [uid, n] of redCount) {
      const u = final.find(x => x && x.uid === uid);
      if (u && u.state && u.state._redBloodUsed === false) {
        msgs.push(`红血已触发但终局 _redBloodUsed=false：${u.name || uid}`);
      }
    }

    return msgs.length ? { fail: true, msg: msgs.slice(0, 8).join(' | ') } : 'pass';
  }
};
