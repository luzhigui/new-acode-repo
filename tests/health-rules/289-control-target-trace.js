// tests/health-rules/289-control-target-trace.js | 2026-11-08（体检总框架 D11·控制与意识类机制）
// 控制类「改目标」效果的事实留痕契约 —— 从「谁选了谁」到「实际打的是谁」的第一环。
//
// 机制源（三个改目标发射点，全部落 PHANTOM_CONFUSE）：
//   · modules/307-elite-imperial.js（成昆·幻影伪装）：sourceSkill='幻影伪装'，deceper=成昆名，无 deceiverUid；
//   · modules/338-elite-mingjiao-pengyingyu.js（彭莹玉·双面观音）：sourceSkill='双面观音'，带 deceiverUid/camp/pos；
//   · modules/323-elite-mingjiao-xiaozhao-brother.js（小昭·兄·蝶舞迷心）：sourceSkill='蝶舞迷心'，带 deceiverIsSpider；
//   · 现形（PHANTOM_REVEAL）由 modules/307 发射，带 deceiverUid。
// 本规则只验「留痕完整性」：字段齐不齐、来源词认不认识、施术者/被改目标/原目标能不能在本场定位到、
//   有没有「自己惑自己」这种自指记录。改目标后的阵营/加成另由 290 判；命中/闪避分支丢不丢记录由 291 判。
// V1.1.0（2026-11-08）：补「原目标是谁」这一环 —— 要求 phantomFact 带 origTargetName/origTargetUid，
//   且与改后目标不同、能在本场定位；双面观音的原目标必须是施术者本人（她是被选中后才被改掉的）。
//   当前主代码三处发射点都还没落原目标字段（已登记 known-transfers），缺字段按 observe 记账不染红；
//   字段一旦落地即转硬判，不允许静默跳过。
//
// 为什么值得盯：幻影 fact 挂在 attackFact.data.phantomFact（不在 entries 里），采集口径一旦退回
//   只扫 entries 就会「零命中」；这时渲染仍在打「幻影伪装」标记，战绩/归因却只剩一个攻击者名字，
//   等于改目标的因果链整段消失（tests/_lib/fact-collect.mjs 的由来就是这个洞）。
//
// 误报规避：本场没有 phantomConfuse / phantomReveal 直接 skip；召唤物不在开局名册时，
//   用事实快照（attacker/target/dodger）补进定位表，不因名册不全误判「查不到」。
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

export const VER = 'tests/health-rules/289-control-target-trace.js V1.1.0';

const KNOWN_SOURCES = ['幻影伪装', '双面观音', '蝶舞迷心'];

export const rule289 = {
    group: '控制与意识回归',
    name: '控制改目标事实留痕(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        const fs = facts || (ctx && ctx.facts) || [];
        if (!Array.isArray(fs) || fs.length === 0) return 'skip';

        // 本场可定位名册：开局双方名册 + 事实快照（召唤物/克隆体只出现在后者）
        const byName = new Map();
        const byUid = new Map();
        const addUnit = (u) => {
            if (!u) return;
            if (u.name && !byName.has(u.name)) byName.set(u.name, u);
            if (u.uid != null && !byUid.has(u.uid)) byUid.set(u.uid, u);
        };
        for (const u of (beforeA || [])) addUnit(u);
        for (const u of (beforeE || [])) addUnit(u);
        for (const f of fs) {
            const d = f && f.data;
            if (!d) continue;
            addUnit(d.attacker); addUnit(d.target); addUnit(d.dodger);
        }

        let confN = 0, revealN = 0, origMissing = 0;
        const fails = [];
        for (let i = 0; i < fs.length; i++) {
            const f = fs[i];
            if (!f || !f.factType) continue;
            const d = f.data || {};
            const at = '第' + (i + 1) + '条';

            if (f.factType === FACT_TYPES.PHANTOM_CONFUSE) {
                confN++;
                const miss = [];
                if (!d.unitName) miss.push('unitName');
                if (!d.deceiver) miss.push('deceiver');
                if (!d.targetName) miss.push('targetName');
                if (!d.sourceSkill) miss.push('sourceSkill');
                if (miss.length) {
                    fails.push(at + ' phantomConfuse 缺字段：' + miss.join('/'));
                    continue;
                }
                if (KNOWN_SOURCES.indexOf(d.sourceSkill) < 0) {
                    fails.push(at + ' 未登记的改目标来源「' + d.sourceSkill + '」（合法集：' + KNOWN_SOURCES.join('/') + '）');
                }
                if (d.unitName === d.deceiver) {
                    fails.push(at + ' 攻击者「' + d.unitName + '」自己惑自己（施术者=被改者）');
                }
                if (!byName.has(d.unitName)) {
                    fails.push(at + ' 攻击者「' + d.unitName + '」在本场名册/快照里查不到');
                }
                if (!byName.has(d.deceiver) && d.deceiverUid == null) {
                    fails.push(at + ' 施术者「' + d.deceiver + '」既无名字可查也无 deceiverUid');
                }
                if (d.deceiverUid != null && !byUid.has(d.deceiverUid)) {
                    fails.push(at + ' 施术者 deceiverUid=' + d.deceiverUid + ' 不在本场单位里');
                }
                if (!byName.has(d.targetName)) {
                    fails.push(at + ' 被改目标「' + d.targetName + '」在本场名册/快照里查不到');
                }

                // V1.1.0：原目标留痕（字段未落地前按 observe 记账）
                if (d.origTargetName != null) {
                    if (d.origTargetName === d.targetName) {
                        fails.push(at + ' 原目标与改后目标同一人「' + d.targetName + '」（没真的改目标）');
                    }
                    if (!byName.has(d.origTargetName) && d.origTargetUid == null) {
                        fails.push(at + ' 原目标「' + d.origTargetName + '」在本场名册/快照里查不到');
                    }
                    if (d.origTargetUid != null && !byUid.has(d.origTargetUid)) {
                        fails.push(at + ' 原目标 origTargetUid=' + d.origTargetUid + ' 不在本场单位里');
                    }
                    if (d.sourceSkill === '双面观音' && d.origTargetName !== d.deceiver) {
                        fails.push(at + ' 双面观音原目标应为施术者「' + d.deceiver + '」，实际记的是「' + d.origTargetName + '」');
                    }
                } else {
                    origMissing++;
                }
            }

            if (f.factType === FACT_TYPES.PHANTOM_REVEAL) {
                revealN++;
                if (!d.unitName || !d.deceiver) {
                    fails.push(at + ' phantomReveal 缺字段（unitName/deceiver）');
                    continue;
                }
                if (d.deceiverUid != null && !byUid.has(d.deceiverUid)) {
                    fails.push(at + ' 现形施术者 deceiverUid=' + d.deceiverUid + ' 不在本场单位里');
                }
            }
        }

        if (confN === 0 && revealN === 0) return 'skip';
        if (fails.length) {
            return { fail: true, msg: '改目标留痕缺口 ' + fails.length + ' 处：' + fails.slice(0, 4).join('；') };
        }
        const observe = origMissing > 0
            ? 'phantomFact 缺「原目标」字段 ' + origMissing + ' 条（主代码三处发射点只记 unitName/deceiver/targetName，已登记 known-transfers；字段落地后转硬判）'
            : null;
        return { fail: false, observe, msg: '改目标留痕完整：惑心 ' + confN + ' 条 / 现形 ' + revealN + ' 条' };
    }
};
