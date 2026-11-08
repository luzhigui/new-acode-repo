// tests/health-rules/291-control-trace-on-edge.js | 2026-11-08（体检总框架 D11·控制与意识类机制）
// 改目标一击「被边裁挡下」时不得丢留痕 —— 从「谁选了谁」到「实际打的是谁」的最后一环。
//
// 判据两条：
//   ① 配对：同阵营（attacker.camp === target.camp）的一次出手，若本回合有 phantomConfuse 且
//      正好点名「这名攻击者 → 这名目标」，算有留痕；否则视为留痕丢失。
//      · 豁免：癫持有者出手（不分敌友是设计，报幕由 292 判）——按本回合癫开场白登记；
//      · 免疫分支：core/209 IMMUNE 路径仍不挂 phantomFact（已知主代码缺口，登记在
//        tests/known-transfers.md），本批按 observe 记账，不染红；
//      · 未命中/闪避分支：主代码已在 missFact/dodgeFact 上补挂 phantomFact，
//        查不到即真丢（硬判）。
//   ② 挂点自洽：任何 attack/miss/dodge 上挂的 data.phantomFact，其 unitName/targetName
//      必须等于这一击自己的 attacker/target，否则就是「留痕挂错一击」（下游会按错的配对归因）。
//
// 机制源：core/209-battle-attack.js（attack/miss/dodge 三处挂 phantomFact）、
//   core/212 buildAttackGroup（attackFact.data.phantomFact）、modules/338（双面观音）、
//   modules/307（幻影伪装）、modules/323（蝶舞迷心）、modules/333（癫随机选敌）。
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

export const VER = 'tests/health-rules/291-control-trace-on-edge.js V1.0.0';

const TARGET_EVENTS = [FACT_TYPES.ATTACK, FACT_TYPES.MISS, FACT_TYPES.DODGE, FACT_TYPES.IMMUNE];
const RE_CRAZY_OPEN = /🤪 (.+?) 受到「癫」的影响/;

function stripTags(s) {
    return String(s || '').replace(/<[^>]+>/g, '');
}

export const rule291 = {
    group: '控制与意识回归',
    name: '改目标一击边裁分支留痕不丢(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        const fs = facts || (ctx && ctx.facts) || [];
        if (!Array.isArray(fs) || fs.length === 0) return 'skip';

        // 第一遍：按事实序维护回合号；同时收集癫持有者出手的（回合, 名字）
        const roundAt = new Array(fs.length);
        const crazySet = new Set();
        let round = 0;
        for (let i = 0; i < fs.length; i++) {
            const f = fs[i];
            const d = (f && f.data) || {};
            if (f && f.factType === FACT_TYPES.ROUND_START) {
                round = (typeof d.round === 'number') ? d.round : round + 1;
            }
            roundAt[i] = round;
            if (f && f.factType === FACT_TYPES.SKILL_ANNOUNCE && d.skillName === '癫') {
                const m = stripTags(d.note).match(RE_CRAZY_OPEN);
                if (m) crazySet.add(round + '|' + m[1]);
            }
        }

        // 留痕索引：回合 + 攻击者名 + 目标名
        const confPairs = new Set();
        let confN = 0;
        for (let i = 0; i < fs.length; i++) {
            const f = fs[i];
            if (!f || f.factType !== FACT_TYPES.PHANTOM_CONFUSE) continue;
            const d = f.data || {};
            if (!d.unitName || !d.targetName) continue;
            confN++;
            confPairs.add(roundAt[i] + '|' + d.unitName + '|' + d.targetName);
        }

        // 第二遍：配对 + 挂点自洽
        const fails = [];
        const immuneLost = [];
        let sameCampN = 0;
        for (let i = 0; i < fs.length; i++) {
            const f = fs[i];
            if (!f || TARGET_EVENTS.indexOf(f.factType) < 0) continue;
            const d = f.data || {};
            const a = f.factType === FACT_TYPES.ATTACK ? (d.attacker || d.unit) : d.attacker;
            const t = (f.factType === FACT_TYPES.DODGE ? d.dodger : d.target) || d.target;
            if (!a || !t) continue;
            const r = roundAt[i];
            const pair = r + '|' + a.name + '|' + t.name;

            // ② 挂点自洽：改目标挂 phantomConfuse；现原形挂 phantomReveal（两者都必须指向本击的攻击者）
            if (d.phantomFact) {
                const pf = d.phantomFact;
                const pd = pf.data || {};
                if (pf.factType === FACT_TYPES.PHANTOM_CONFUSE) {
                    if (pd.unitName !== a.name || pd.targetName !== t.name) {
                        fails.push('第' + r + '回合 ' + a.name + '→' + t.name + ' 的 phantomConfuse 挂错一击（留痕指向 ' + pd.unitName + '→' + pd.targetName + '）');
                    }
                } else if (pf.factType === FACT_TYPES.PHANTOM_REVEAL) {
                    if (pd.unitName !== a.name) {
                        fails.push('第' + r + '回合 ' + a.name + '→' + t.name + ' 的 phantomReveal 挂错一击（留痕指向 ' + pd.unitName + '）');
                    }
                } else {
                    fails.push('第' + r + '回合 ' + a.name + '→' + t.name + ' 挂的 phantomFact 类型未登记（' + pf.factType + '）');
                }
            }

            if (a.camp !== t.camp) continue; // 只盯同阵营误伤
            sameCampN++;
            if (confPairs.has(pair)) continue;
            if (crazySet.has(r + '|' + a.name)) continue; // 癫随机选敌，报幕归 292

            if (f.factType === FACT_TYPES.IMMUNE) immuneLost.push('第' + r + '回合 ' + a.name + '→' + t.name);
            else {
                const branch = f.factType === FACT_TYPES.MISS ? '未命中' : (f.factType === FACT_TYPES.DODGE ? '闪避' : '命中');
                fails.push('第' + r + '回合 ' + a.name + '→' + t.name + ' 同阵营一击（' + branch + '）没有 phantomConfuse 留痕');
            }
        }

        if (confN === 0 && sameCampN === 0) return 'skip';
        if (fails.length) {
            return { fail: true, msg: '改目标留痕丢失 ' + fails.length + ' 处：' + fails.slice(0, 4).join('；') };
        }
        const observe = immuneLost.length
            ? '免疫分支未挂 phantomFact ' + immuneLost.length + ' 处（主代码缺口，已登记 known-transfers）：' + immuneLost.slice(0, 3).join('、')
            : null;
        return { fail: false, observe, msg: '改目标边裁分支留痕完整：同阵营出手 ' + sameCampN + ' 次逐条配对' };
    }
};
