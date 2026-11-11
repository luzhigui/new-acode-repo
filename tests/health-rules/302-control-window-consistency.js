// tests/health-rules/302-control-window-consistency.js | D1 补盲段 302
// 眩晕 / 定身「控制窗口一致性」：每次控制都要有出处、有消耗、窗口内不许出手、宣称的回合数不许越界。
//   主代码依据：
//     core/214-battle-shared.js  resolvePushOrStun → state._stunned=true + PUSH_STUN fact（定身）
//     core/215-buff-effects.js   stunOnSwap → _stunned=true（MIND_CONTROL_SWAP 换位后统一上控）
//     core/212-battle-attack-chain.js EFFECT_TYPES.STUN → _stunned=true（闪避反击眩晕）
//     core/209-battle-attack.js  isControlled → STUN_SKIP fact；core/210-battle-round.js 行动序 → PASS(reason 眩晕)
//     modules/327 杨逍·弹指神通（点穴文案「本回合无法行动」）/ modules/325 说不得·布袋（「回合末放出」）
//     modules/314 何太冲红血 → subject._stunned=false（唯一可见的控制解除出口之一）
//   判据：
//     ① 名册归属：STUN_SKIP / PUSH_STUN 的目标必须能在本场名册里找到
//     ② 有出处：每条跳过记录之前必须已有控制源（PUSH_STUN / MIND_CONTROL_SWAP / 点穴·布袋·换位·寒冰公告 / 同单位先前的眩晕跳过）
//     ③ 不跨回合：_stunned 是回合级字段（core/218 ROUND_STATE_SCHEMA，每回合开始 resetStateFields 清 false），
//        定身之后「后续回合仍被跳过」= 控制残留（判红）；下一回合正常出手是设计口径（不判红）
//     ④ 当回合不出手：PUSH_STUN 之后到本回合结束，目标不得再有攻击事实；解除公告之后才放行
//     ⑤ 宣称窗口不许越界：点穴「本回合无法行动」→ 之后回合不得再因它被跳过；布袋「回合末放出」→ 释放在下一回合开始前必须出现
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

const CONTROL_WORDS = ['点穴', '布袋', '眩晕', '换位', '寒冰', '定身', '惑心'];
const RELEASE_WORDS = ['布袋放生', '布袋憋死'];

function nameMap(a, e) {
  const m = new Map();
  for (const list of [a, e]) for (const u of list || []) if (u && u.name != null) m.set(u.name, u);
  return m;
}

export const rule302 = {
  group: '控制与意识回归',
  name: '眩晕定身控制窗口一致(回归)',
  test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
    const fs = (facts && facts.length ? facts : (ctx && ctx.facts) || []);
    if (fs.length === 0) return 'pass';
    const roster = nameMap(beforeA, beforeE);
    const finalAll = [...(afterA || []), ...(afterE || [])];
    const finalByName = nameMap(finalAll, []);
    const finalDead = new Set();
    for (const u of finalAll) if (u && u.alive === false) finalDead.add(u.uid);

    let round = 1;
    const maxRound = { v: 1 };
    // 控制源：uid → [{index, round, kind}]
    const sources = new Map();
    const lastSource = new Map();
    const msgs = [];
    const pushStuns = [];
    const dianXue = [];
    const bagPut = [];
    const skips = [];            // {index, round, uid, name, via}
    const attacks = [];          // {index, round, uid, name}
    const releases = [];         // {index, round, uid, name}

    function addSource(uid, name, index, kind) {
      const s = { index, round, kind };
      if (!sources.has(uid)) sources.set(uid, []);
      sources.get(uid).push(s);
      lastSource.set(uid, s);
    }

    fs.forEach((f, index) => {
      const t = f && f.factType;
      if (!t) return;
      const d = f.data || {};
      if (t === FACT_TYPES.ROUND_START) {
        round = d.round || round;
        if (round > maxRound.v) maxRound.v = round;
        return;
      }
      if (t === FACT_TYPES.PUSH_STUN) {
        const tg = d.target || {};
        if (!tg.uid || !roster.has(tg.name) && !finalByName.has(tg.name)) {
          msgs.push(`定身目标不在名册：${tg.name || tg.uid}`);
        }
        if (tg.uid) {
          pushStuns.push({ uid: tg.uid, name: tg.name, index, round });
          addSource(tg.uid, tg.name, index, 'pushStun');
        }
      } else if (t === FACT_TYPES.MIND_CONTROL_SWAP) {
        for (const s of d.swaps || []) {
          if (s && s.uid) addSource(s.uid, s.name, index, 'mindSwap');
        }
      } else if (t === FACT_TYPES.SKILL_ANNOUNCE) {
        const note = d.note || '';
        const uid = d.floatUid != null ? d.floatUid : d.unitUid;
        if (/弹指神通/.test(d.skillName || '') && /点中/.test(note) && /穴道/.test(note) && uid != null) {
          const victim = /点中\s*(.+?)\s*穴道/.exec(note);
          const nm = victim ? victim[1] : null;
          dianXue.push({ uid, name: nm, index, round });
          addSource(uid, nm, index, 'dianXue');
        } else if (/布袋/.test(d.skillName || '') && /装袋|保护/.test(note) && uid != null) {
          bagPut.push({ uid, index, round, name: d.unitName });
        } else if (/布袋/.test(d.skillName || '') && RELEASE_WORDS.some(w => note.includes(w)) && uid != null) {
          releases.push({ index, round, uid, name: d.unitName });
        } else if ((/红血/.test(d.skillName || '') || /两仪互换/.test(d.skillName || '')) && uid != null) {
          releases.push({ index, round, uid, name: d.unitName });
          if (d.skillName === '红血' && d.swap && d.swap.aUid != null) releases.push({ index, round, uid: d.swap.aUid, name: null });
        } else if (CONTROL_WORDS.some(w => note.includes(w)) && uid != null) {
          addSource(uid, d.unitName, index, 'announce');
        }
      } else if (t === FACT_TYPES.PASS) {
        const u = d.unit || {};
        if (u.uid && /眩晕/.test(d.reason || '')) {
          skips.push({ index, round, uid: u.uid, name: u.name, via: 'pass' });
        }
      } else if (t === FACT_TYPES.STUN_SKIP) {
        skips.push({ index, round, uid: null, name: d.unitName, via: 'stunSkip' });
        if (!roster.has(d.unitName) && !finalByName.has(d.unitName)) {
          msgs.push(`眩晕跳过单位不在名册：${d.unitName || '?'}`);
        }
      } else if (t === FACT_TYPES.ATTACK) {
        const a = d.attacker || {};
        if (a.uid) attacks.push({ index, round, uid: a.uid, name: a.name });
      }
    });

    // ② 控制来源不得「晚于跳过」：若同一单位在跳过之后才出现控制源，说明状态/来源顺序串了。
    //    （眩晕本身是 signal、不落 fact，很多闪避/寒冰类硬控在战报里没有公告，故不把「无来源」判红。）
    for (const s of skips) {
      if (!s.uid) continue;
      const src = sources.get(s.uid) || [];
      const hasEarlier = src.some(x => x.index < s.index) || skips.some(x => x.uid === s.uid && x.index < s.index);
      const hasLater = src.some(x => x.index > s.index);
      if (!hasEarlier && hasLater) {
        msgs.push(`控制来源晚于眩晕跳过：${s.name}（第 ${s.round} 回合）`);
      }
    }

    // ③ 定身窗口只能覆盖「本回合剩余时间」：core/218 ROUND_STATE_SCHEMA 里 _stunned 是回合级字段，
    //    每回合开始 resetStateFields 统一清 false（core/210 prepareSoulDrain）。所以「定身 → 后续回合仍被跳过」
    //    属于控制跨回合残留（真缺陷），而「定身 → 下一回合正常出手」才是设计口径，不判红。
    for (const p of pushStuns) {
      if (finalDead.has(p.uid)) continue;
      for (const s of skips) {
        if (s.index <= p.index || s.round <= p.round) continue;
        if (s.uid !== p.uid && !(s.uid == null && s.name === p.name)) continue;
        const newer = (sources.get(p.uid) || []).some(x => x.index > p.index && x.index < s.index);
        if (!newer) {
          msgs.push(`眩晕跨回合残留：${p.name} 第 ${p.round} 回合定身，第 ${s.round} 回合仍被跳过`);
          break;
        }
      }
    }

    // ④ 定身当回合内不得再出手（解除公告之后才放行）；下一回合天然放行（③ 已说明回合级清理）
    for (const p of pushStuns) {
      for (const at of attacks) {
        if (at.index <= p.index || at.uid !== p.uid) continue;
        if (at.round !== p.round) continue;
        const released = releases.some(r => r.index > p.index && r.index < at.index && r.uid === p.uid);
        if (!released) {
          msgs.push(`定身当回合仍出手：${p.name} 第 ${at.round} 回合攻击（定身于同回合）`);
          break;
        }
      }
    }

    // ⑤ 点穴「本回合无法行动」：之后回合不得再因点穴被跳过
    for (const dx of dianXue) {
      for (const s of skips) {
        if (s.index <= dx.index) continue;
        if (s.uid !== dx.uid && !(s.uid == null && dx.name && s.name === dx.name)) continue;
        const srcs = sources.get(dx.uid) || [];
        const newer = srcs.some(x => x.index > dx.index && x.index < s.index);
        if (!newer && s.round > dx.round) {
          msgs.push(`点穴宣称「本回合无法行动」但仍跳过：${dx.name || dx.uid} 第 ${dx.round}→${s.round} 回合`);
          break;
        }
      }
    }

    // ⑤ 布袋「回合末放出」：释放在下一回合开始前必须出现，放出后不得再因布袋被跳过
    for (const bp of bagPut) {
      const nextRoundStart = fs.findIndex((f, i) => i > bp.index && f && f.factType === FACT_TYPES.ROUND_START);
      const rel = releases.find(r => r.uid === bp.uid && r.index > bp.index);
      if (!rel) {
        msgs.push(`布袋入袋后未见放出公告：${bp.name || bp.uid}（第 ${bp.round} 回合）`);
        continue;
      }
      if (nextRoundStart >= 0 && rel.index > nextRoundStart) {
        msgs.push(`布袋放出越过回合末：${bp.name || bp.uid} 第 ${bp.round} 回合入袋，下一回合开始后才放出`);
      }
      for (const s of skips) {
        if (s.index <= rel.index) continue;
        if (s.uid === bp.uid || (s.uid == null && s.name === bp.name)) {
          const newer = (sources.get(bp.uid) || []).some(x => x.index > rel.index && x.index < s.index);
          if (!newer) {
            msgs.push(`布袋放出后仍被眩晕跳过：${bp.name || bp.uid} 第 ${s.round} 回合`);
            break;
          }
        }
      }
    }

    if (msgs.length) return { fail: true, msg: msgs.slice(0, 8).join(' | ') };
    return 'pass';
  }
};
