// tests/health-rules/294-double-face-retarget.js | 2026-11-08（体检总框架 D11·控制与意识类机制）
// 女装（双面观音）改目标专项：她是「能被选中的」，只是别人不舍得打 —— 不是「看不见」。
//
// 机制源（modules/338-elite-mingjiao-pengyingyu.js V1.0.9，提交 227e3382 起的口径）：
//   · 女装期不做目标过滤（不删候选），敌人照常能选到她；
//   · AFTER_SELECT_TARGET 统一改目标：选中她 → 改打攻击方自己队友（按 pos 取第一位活队友）；
//   · 攻击方身边已无可替之人 → 本击落空（EMPTY_TARGET），且不回头打她。
// 与 289 的分工：289 只验「谁改的/改成谁/原目标」字段完整；本规则只验女装这条机制的落地结果。
//
// 判据：
//   ① 留痕必落地：每条 sourceSkill='双面观音' 的 phantomConfuse 必须在同回合找到同一击
//      （攻击者名 + 改后目标名对得上）；找不到 = 留痕挂空。
//   ② 改后必须打自己队友：该击攻击者与最终目标同阵营；目标不是施术者本人；施术者也必须是对面阵营。
//   ③ 女装期她绝不成为最终目标：窗口内任何敌方一击的 target/dodger 都不许是她。
//   ④ 「不忍下手」不许虚报：EMPTY_TARGET 报「身边已无可替之人」时，攻击方账面（开局名册）
//      必须真的没有活队友；账面还有活队友 = 她被当成看不见 / 替身逻辑失效。
//
// 误报规避：
//   · 只认本场出现过的「女装上阵 / 女装延长」窗口；窗口缺失归 293；
//   · 同名彭莹玉（双方都有可能）优先按 uid 认窗口，名字兜底仅在唯一同名时使用；
//   · 召唤物不在开局名册 → ④ 直接跳过（不拿名册不全当违规）；
//   · 队友存活按「全局死亡事实 + 最终快照」从严判死（宁可漏报，不误报）。
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

export const VER = 'tests/health-rules/294-double-face-retarget.js V1.0.0';

const RE_ON = /(.+?) 女装上阵，众人不忍下手（(\d+) 回合）/;
const RE_EXT = /(.+?) 女装延长 1 回合（剩余 (\d+) 回合）/;
const RE_NO_MATE = /身边已无可替之人/;
const TARGET_EVENTS = [
    FACT_TYPES.ATTACK, FACT_TYPES.MISS, FACT_TYPES.DODGE, FACT_TYPES.IMMUNE
];

function stripTags(s) {
    return String(s || '').replace(/<[^>]+>/g, '');
}

export const rule294 = {
    group: '控制与意识回归',
    name: '女装改目标·不忍下手(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        const fs = facts || (ctx && ctx.facts) || [];
        if (!Array.isArray(fs) || fs.length === 0) return 'skip';

        const roster = [];
        for (const u of (beforeA || [])) if (u) roster.push(u);
        for (const u of (beforeE || [])) if (u) roster.push(u);

        const roundAt = new Array(fs.length);
        let round = 0;
        // 女装窗口：key = uid 优先，名字只作兜底
        const dress = new Map();   // key -> { name, uid, camp, on, expiry }
        const keyOf = (uid, name) => (uid != null ? 'u' + uid : 'n' + name);

        for (let i = 0; i < fs.length; i++) {
            const f = fs[i];
            const d = (f && f.data) || {};
            if (f && f.factType === FACT_TYPES.ROUND_START) {
                round = (typeof d.round === 'number') ? d.round : round + 1;
            }
            roundAt[i] = round;
            if (!f || f.factType !== FACT_TYPES.SKILL_ANNOUNCE || d.skillName !== '双面观音') continue;
            const note = stripTags(d.note);
            const k = keyOf(d.unitUid, d.unitName);
            let m;
            if ((m = note.match(RE_ON))) {
                const dur = Number(m[2]);
                dress.set(k, {
                    name: m[1] || d.unitName, uid: d.unitUid,
                    camp: d.camp || campOfRoster(d.unitUid, d.unitName, roster),
                    on: round, expiry: round + dur - 1
                });
            } else if ((m = note.match(RE_EXT))) {
                const prev = dress.get(k) || {};
                const left = Number(m[2]);
                dress.set(k, {
                    name: prev.name || m[1] || d.unitName,
                    uid: d.unitUid != null ? d.unitUid : prev.uid,
                    camp: d.camp || prev.camp,
                    on: prev.on != null ? prev.on : round,
                    expiry: round + left - 1
                });
            }
        }
        if (dress.size === 0) return 'skip';

        const confs = [];
        const strikes = [];
        const empties = [];
        const deadUids = new Set();
        const lastState = new Map();   // uid -> { alive, hp }
        for (let i = 0; i < fs.length; i++) {
            const f = fs[i];
            const d = (f && f.data) || {};
            if (f && f.factType === FACT_TYPES.UNIT_DEATH && d.uid != null) deadUids.add(d.uid);
            if (!f || !f.factType) continue;

            if (f.factType === FACT_TYPES.PHANTOM_CONFUSE && d.sourceSkill === '双面观音') {
                confs.push(Object.assign({ i, round: roundAt[i] }, d));
            }
            if (f.factType === FACT_TYPES.EMPTY_TARGET) {
                empties.push({ i, round: roundAt[i], a: d.attacker, reason: d.reason || d.skipReason || '' });
            }
            if (TARGET_EVENTS.indexOf(f.factType) < 0) continue;
            const a = f.factType === FACT_TYPES.ATTACK ? (d.attacker || d.unit) : d.attacker;
            const t = (f.factType === FACT_TYPES.DODGE ? d.dodger : d.target) || d.target;
            if (a && a.uid != null) lastState.set(a.uid, { alive: a.alive !== false && !(a.state && a.state._isDead), hp: Number(a.hp) });
            if (t && t.uid != null) lastState.set(t.uid, { alive: t.alive !== false && !(t.state && t.state._isDead), hp: Number(t.hp) });
            if (a && t) strikes.push({ i, round: roundAt[i], a, t, phantom: d.phantomFact || null });
        }

        const activeAt = (entry, r) => !!entry && r >= entry.on && r <= entry.expiry;
        const dressByUid = (uid) => (uid != null ? dress.get('u' + uid) : null);
        const dressByName = (name) => {
            let hit = null, n = 0;
            for (const e of dress.values()) if (e.name === name) { hit = e; n++; }
            return n === 1 ? hit : null;   // 同名多份 → 不猜
        };
        const dressOf = (uid, name) => dressByUid(uid) || dressByName(name);

        const fails = [];
        let confHit = 0;

        // ① + ②：留痕必须落地，落地必须打自己队友
        for (const c of confs) {
            const entry = dressOf(c.deceiverUid, c.deceiver);
            if (!entry) continue;   // 窗口缺失归 293
            const strike = strikes.find(s =>
                s.round === c.round && s.a && s.a.name === c.unitName && s.t && s.t.name === c.targetName);
            if (!strike) {
                fails.push('第' + c.round + '回合 双面观音留痕（' + c.unitName + '→' + c.targetName + '）找不到对应一击（留痕挂空）');
                continue;
            }
            confHit++;
            if (c.targetName === c.deceiver) {
                fails.push('第' + c.round + '回合 ' + c.unitName + ' 被改成打施术者本人「' + c.deceiver + '」');
            }
            const ac = strike.a.camp;
            const tc = strike.t.camp;
            if (ac && tc && ac !== tc) {
                fails.push('第' + c.round + '回合 ' + c.unitName + '→' + c.targetName + ' 改目标后仍打敌方（应为攻击方自己队友）');
            }
            const dc = c.deceiverCamp || entry.camp;
            if (ac && dc && ac === dc) {
                fails.push('第' + c.round + '回合 「' + c.unitName + '」与施术者「' + c.deceiver + '」同阵营，双面观音不该对同阵营生效');
            }
        }

        // ③：女装期她绝不成为最终目标（她是能选中的，但别人不舍得打）
        for (const s of strikes) {
            const entry = dressOf(s.t.uid, s.t.name);
            if (!entry || !activeAt(entry, s.round)) continue;
            if (s.a && s.a.name === s.t.name) continue;   // 她自己出手
            const dc = entry.camp;
            if (!dc || !s.a || !s.a.camp || s.a.camp === dc) continue;   // 只判敌方一击
            fails.push('第' + s.round + '回合 女装期「' + s.t.name + '」仍被敌方「' + s.a.name + '」当最终目标打（应改打攻击方自己队友）');
        }

        // ④：报「身边已无可替之人」时，账面不许还有活队友
        for (const e of empties) {
            if (!RE_NO_MATE.test(e.reason)) continue;
            const a = e.a;
            if (!a || !a.name || a.uid == null || !a.camp) continue;
            if (!roster.some(u => u.uid === a.uid)) continue;   // 召唤物不在名册 → 跳过
            const enemyDress = [];
            for (const entry of dress.values()) {
                if (activeAt(entry, e.round) && entry.camp && entry.camp !== a.camp) enemyDress.push(entry);
            }
            if (enemyDress.length === 0) continue;
            const aliveMates = roster.filter(u => {
                if (u.camp !== a.camp || u.uid === a.uid) return false;
                if (u.uid != null && deadUids.has(u.uid)) return false;
                const st = u.uid != null ? lastState.get(u.uid) : null;
                if (st && (!st.alive || !(st.hp > 0))) return false;
                return true;
            });
            if (aliveMates.length > 0) {
                fails.push('第' + e.round + '回合 「' + a.name + '」报「身边已无可替之人」却还有 ' + aliveMates.length
                    + ' 名活队友（' + aliveMates.slice(0, 3).map(u => u.name).join('/') + '）—— 她被当成看不见 / 替身逻辑失效');
            }
        }

        if (fails.length) {
            return { fail: true, msg: '女装改目标违规 ' + fails.length + ' 处：' + fails.slice(0, 4).join('；') };
        }
        if (confHit === 0 && strikes.length === 0 && empties.length === 0) return 'skip';
        return {
            fail: false,
            msg: '女装改目标一致：改目标留痕 ' + confHit + ' 条 / 女装窗口 ' + dress.size + ' 份'
        };
    }
};

function campOfRoster(uid, name, roster) {
    if (uid != null) {
        const u = roster.find(x => x && x.uid === uid);
        if (u) return u.camp;
    }
    const hits = roster.filter(x => x && x.name === name);
    return hits.length === 1 ? hits[0].camp : null;
}
