// tests/health-rules/329-d6-roster-stats-purity.js | 2026-11-08（体检总框架 D6·召唤物与附身窗口）
// 统计口径与虚假单位隔离（谁算「正式队员」）：
//   ① 开局名单（beforeA/beforeE）不得含召唤物（isSummon）/ 拒马（isHorse）——存活率与阵容均值
//      的分母只能是人，召唤物/拒马进分母 = 把幼狮、巨马当成第六/第七人；
//   ② 终局快照里，本场召唤过的 uid 必须仍带 isSummon=true、拒马 uid 必须仍带 isHorse=true——
//      标记在快照里丢一个，统计层就没法排除，存活率与阵容均值必错；
//   ③ 交叉观察（不硬判，登记转交）：附身宿主是否落在召唤物 uid 上（modules/322 `_executeAttach`
//      只排 isHorse、没排 isSummon），以及成昆幻影误伤（PHANTOM_CONFUSE）目标名是否是召唤物专名
//      （召唤物被当成队友误伤 = 虚假单位与召唤串线）。
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

export const rule329 = {
    group: '统计口径',
    name: '存活率/阵容均值口径与虚假单位隔离(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE) {
        const facts = ctx && Array.isArray(ctx.facts) ? ctx.facts : [];
        if (facts.length === 0) return 'skip';

        const summonUids = new Map();   // uid -> summonName
        const horseUids = new Map();    // uid -> horseName
        for (const f of facts) {
            const d = (f && f.data) || {};
            if (!f) continue;
            if (f.factType === FACT_TYPES.SUMMON_UNIT && typeof d.summonUid === 'string' && d.summonUid !== '') {
                summonUids.set(d.summonUid, d.summonName || '召唤物');
            } else if ((f.factType === FACT_TYPES.HORSE_SUMMON || f.factType === FACT_TYPES.XIAO_ZHAO_HORSE)
                && typeof d.horseUid === 'string' && d.horseUid !== '') {
                horseUids.set(d.horseUid, d.horseName || '拒马');
            }
        }
        if (summonUids.size === 0 && horseUids.size === 0) return 'skip';

        const fails = [];
        // ① 开局名单纯净：阵容均值分母不得混入召唤物/拒马
        const opening = (beforeA || []).concat(beforeE || []);
        let openingDirty = 0;
        for (const u of opening) {
            if (!u) continue;
            if (u.isSummon === true || u.isHorse === true) {
                openingDirty++;
                fails.push(`开局名单混入${u.isSummon === true ? '召唤物' : '拒马'} ${u.name || '?'}(${u.uid})——存活率/阵容均值会把召唤物算成正式队员`);
            }
        }

        // ② 终局快照标记：统计层靠 isSummon / isHorse 排除，丢标记 = 口径必错
        const ended = (afterA || []).concat(afterE || []);
        let summonSnap = 0, horseSnap = 0, missingFlag = 0;
        for (const [uid, name] of summonUids) {
            const u = ended.find(x => x && x.uid === uid);
            if (!u) continue;
            summonSnap++;
            if (u.isSummon !== true) {
                missingFlag++;
                fails.push(`终局快照里召唤物 ${name}(${uid}) 丢了 isSummon 标记——存活率无法排除`);
            }
        }
        for (const [uid, name] of horseUids) {
            const u = ended.find(x => x && x.uid === uid);
            if (!u) continue;
            horseSnap++;
            if (u.isHorse !== true) {
                missingFlag++;
                fails.push(`终局快照里拒马 ${name}(${uid}) 丢了 isHorse 标记——存活率无法排除`);
            }
        }

        // ③ 交叉观察（不硬判）：附身宿主落在召唤物上 / 幻影误伤目标是召唤物专名
        let attachToSummon = 0;
        for (const f of facts) {
            const d = (f && f.data) || {};
            if (!f || f.factType !== FACT_TYPES.BUTTERFLY_ATTACH) continue;
            if (typeof d.hostUid === 'string' && summonUids.has(d.hostUid)) {
                attachToSummon++;
            }
        }
        const openingNames = new Set(opening.map(u => u && u.name).filter(Boolean));
        const summonOnlyNames = new Set([...summonUids.values()].filter(n => !openingNames.has(n)));
        let phantomTargetSummon = 0;
        for (const f of facts) {
            const d = (f && f.data) || {};
            if (!f || f.factType !== FACT_TYPES.PHANTOM_CONFUSE) continue;
            if (typeof d.targetName === 'string' && summonOnlyNames.has(d.targetName)) phantomTargetSummon++;
        }

        const observe = `开局名单脏 ${openingDirty} 人 / 终局召唤物标记核对 ${summonSnap} 只、拒马 ${horseSnap} 只（丢标记 ${missingFlag} 只）/ `
            + `附身到召唤物 ${attachToSummon} 次 / 幻影误伤召唤物 ${phantomTargetSummon} 次`;
        if (fails.length) return { fail: true, msg: fails.slice(0, 3).join('；') };
        return { fail: false, observe: observe };
    }
};
