// tests/health-rules/325-d6-butterfly-host-cleanup.js | 2026-11-08（体检总框架 D6·召唤物与附身窗口）
// 附身窗口关闭后宿主蝶变词条必须清干净，尤其「宿主阵亡关窗 → 圣火不熄复活」这条最容易永久吃加成的路径：
//   ① 窗口因宿主阵亡关闭（BUTTERFLY_HOST_DEAD）后，终局快照里该宿主不得再挂 `group='butterfly'` /
//      `source='蝶变附身'` 的 atk/def/maxHp 词条——死亡态残留的 maxHp 还会抬高全队总上限；
//   ② 若该宿主随后被圣火不熄复活（healUnitUid 命中该宿主 uid），残留词条 = 复活后永久吃附身攻/防/血上限，硬判红；
//   ③ 宿主已死亡但未被复活时只计数观察（同一根因另见 262 判据⑤，不重复染红）。
// 实测口径（156 场）：364 次附身 / 23 次宿主阵亡；残留词条 26 具全部走 death 分支，复活 0 具。
// 根因（转交主代码，tests/known-transfers.md）：modules/322 `_executeReturn` 的 host-alive 分支有
//   `removeModsByGroup(host,'butterfly')`，宿主死亡分支没有 ⇒ 死亡宿主词条不清。
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

export const rule325 = {
    group: '附身窗口',
    name: '附身关窗后宿主蝶变词条清理(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE) {
        const facts = ctx && Array.isArray(ctx.facts) ? ctx.facts : [];
        if (facts.length === 0) return 'skip';

        let round = 0, attachN = 0;
        const open = new Map();          // sisterUid -> hostUid
        const deathClosed = [];          // {sisterUid, hostUid, round}
        const revived = new Set();       // 圣火不熄复活过的 uid
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f) continue;
            const d = f.data || {};
            if (f.factType === FACT_TYPES.ROUND_START) {
                round = typeof d.round === 'number' ? d.round : round + 1;
                continue;
            }
            if (f.factType === FACT_TYPES.BUTTERFLY_ATTACH) {
                attachN++;
                open.set(d.sisterUid, d.hostUid);
                continue;
            }
            if (f.factType === FACT_TYPES.BUTTERFLY_HOST_DEAD) {
                const host = typeof d.hostUid === 'string' && d.hostUid !== '' ? d.hostUid : open.get(d.sisterUid);
                if (typeof host === 'string' && host !== '') deathClosed.push({ sisterUid: d.sisterUid, hostUid: host, round: round });
                open.delete(d.sisterUid);
                continue;
            }
            if (f.factType === FACT_TYPES.BUTTERFLY_RETURN) {
                open.delete(d.sisterUid);
                continue;
            }
            if (f.factType === FACT_TYPES.SKILL_ANNOUNCE && d.skillName === '圣火不熄'
                && typeof d.healUnitUid === 'string' && d.healUnitUid !== '') {
                revived.add(d.healUnitUid);
            }
        }
        if (attachN === 0) return 'skip';

        const hasButterflyMod = (u) => {
            if (!u || !u._mods) return false;
            for (const stat in u._mods) {
                const list = u._mods[stat];
                if (!Array.isArray(list)) continue;
                for (const m of list) {
                    if (m && (m.group === 'butterfly' || m.source === '蝶变附身')) return true;
                }
            }
            return false;
        };
        const ended = (afterA || []).concat(afterE || []);
        const fails = [];
        let residual = 0, residualRevived = 0;
        for (const w of deathClosed) {
            const host = ended.find(u => u && u.uid === w.hostUid);
            if (!host || !hasButterflyMod(host)) continue;
            residual++;
            if (revived.has(w.hostUid)) {
                residualRevived++;
                fails.push(`宿主 ${host.name || '?'}(${w.hostUid}) 第${w.round}回合阵亡关窗、后被圣火不熄复活，仍带蝶变词条（复活后永久吃攻/防/血上限）`);
            }
        }

        const observe = `附身 ${attachN} 次 / 宿主阵亡关窗 ${deathClosed.length} 次 / 全场圣火复活 ${revived.size} 具 / 死亡宿主残留蝶变词条 ${residual} 具（复活后仍残留 ${residualRevived} 具）`;
        if (fails.length) return { fail: true, msg: fails.slice(0, 3).join('；') };
        return { fail: false, observe: observe };
    }
};
