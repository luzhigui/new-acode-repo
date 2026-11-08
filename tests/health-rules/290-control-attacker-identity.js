// tests/health-rules/290-control-attacker-identity.js | 2026-11-08（体检总框架 D11·控制与意识类机制）
// 控制类「改目标」后的攻击者身份合同 —— 目标被改写，但出手的人仍然是他本人：
//   ① 阵营不得跟着被改目标一起翻面（阵营是最容易在改写路径里被顺手覆盖的字段）；
//   ② 攻击/防御加成必须是攻击者自己的（快照里的 atk/def 与同一时点的 snap 一致，
//      出现偏差＝改目标路径二次结算或漏算攻击者自身 buff）；
//   ③ uid 必须在场（没有 uid 就无法把这一击记回任何单位，战绩/承伤都会丢账）。
//
// 机制源：core/212-battle-attack-chain.js buildAttackGroup（attackFact.data.attacker 快照 +
//   snap.attackerAtk/attackerDef + data.phantomFact 三条并列落账）。
// 与相邻规则的边界：
//   · 289 验留痕字段齐不齐；290 只验「留痕里点名的那一击，攻击者身份/加成没被改写」；
//   · 291 验未命中/闪避/免疫分支还留不留痕；本规则只对已落地的攻击/未命中/闪避快照对账。
//
// 误报规避：没有 phantomConfuse 直接 skip；改目标那一击若在本场事实里找不到对应快照
//   （例如被免疫分支吞掉），本规则不猜、交给 291 报；同名克隆单位名册阵营有歧义时不判阵营。
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

export const VER = 'tests/health-rules/290-control-attacker-identity.js V1.0.0';

const TARGET_EVENTS = [FACT_TYPES.ATTACK, FACT_TYPES.MISS, FACT_TYPES.DODGE, FACT_TYPES.IMMUNE];

export const rule290 = {
    group: '控制与意识回归',
    name: '改目标后攻击者身份与加成原样(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        const fs = facts || (ctx && ctx.facts) || [];
        if (!Array.isArray(fs) || fs.length === 0) return 'skip';

        // 阵营基准：uid 优先；同名多阵营（克隆体/召唤物）视为歧义不判
        const campByUid = new Map();
        const campByName = new Map();
        const seedCamp = (u) => {
            if (!u || !u.name || !u.camp) return;
            if (u.uid != null && !campByUid.has(u.uid)) campByUid.set(u.uid, u.camp);
            if (campByName.has(u.name) && campByName.get(u.name) !== u.camp) campByName.set(u.name, null);
            else if (!campByName.has(u.name)) campByName.set(u.name, u.camp);
        };
        for (const u of (beforeA || [])) seedCamp(u);
        for (const u of (beforeE || [])) seedCamp(u);

        let round = 0;
        const confs = [];
        const events = [];
        for (let i = 0; i < fs.length; i++) {
            const f = fs[i];
            if (!f || !f.factType) continue;
            const d = f.data || {};
            if (f.factType === FACT_TYPES.ROUND_START) {
                round = (typeof d.round === 'number') ? d.round : round + 1;
                continue;
            }
            if (f.factType === FACT_TYPES.PHANTOM_CONFUSE) {
                confs.push({ i, round, unitName: d.unitName, targetName: d.targetName });
                continue;
            }
            if (TARGET_EVENTS.indexOf(f.factType) >= 0) {
                const a = d.attacker || d.unit;
                const t = d.target || d.dodger;
                if (a && t) events.push({ i, round, type: f.factType, attacker: a, target: t, snap: d.snap || null });
            }
        }
        if (confs.length === 0) return 'skip';

        const fails = [];
        let checked = 0;
        for (const c of confs) {
            if (!c.unitName || !c.targetName) continue; // 字段缺失由 289 报
            const hits = events.filter(e =>
                e.round === c.round &&
                e.attacker && e.attacker.name === c.unitName &&
                e.target && e.target.name === c.targetName);
            if (hits.length === 0) continue; // 没有落地快照（免疫等分支），交给 291 判

            for (const e of hits) {
                checked++;
                const a = e.attacker;
                const at = '第' + e.round + '回合「' + a.name + '」改打「' + c.targetName + '」那一击';

                if (a.uid == null) {
                    fails.push(at + ' 攻击者快照没有 uid，无法归账');
                }
                const base = (a.uid != null ? campByUid.get(a.uid) : null) || campByName.get(a.name);
                if (base && a.camp && a.camp !== base) {
                    fails.push(at + ' 攻击者阵营被改写：事实里 ' + a.camp + ' ≠ 原阵营 ' + base);
                }
                if (e.type === FACT_TYPES.ATTACK && e.snap) {
                    if (typeof a.atk === 'number' && typeof e.snap.attackerAtk === 'number' &&
                        Math.floor(a.atk) !== e.snap.attackerAtk) {
                        fails.push(at + ' 攻击力与快照不一致：' + Math.floor(a.atk) + ' ≠ ' + e.snap.attackerAtk);
                    }
                    if (typeof a.def === 'number' && typeof e.snap.attackerDef === 'number' &&
                        Math.floor(a.def) !== e.snap.attackerDef) {
                        fails.push(at + ' 防御力与快照不一致：' + Math.floor(a.def) + ' ≠ ' + e.snap.attackerDef);
                    }
                }
            }
        }

        if (checked === 0) return 'skip';
        if (fails.length) {
            return { fail: true, msg: '改目标攻击者身份/加成异常 ' + fails.length + ' 处：' + fails.slice(0, 4).join('；') };
        }
        return { fail: false, msg: '改目标攻击者身份/加成原样：核对 ' + checked + ' 击' };
    }
};
