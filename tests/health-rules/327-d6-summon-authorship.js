// tests/health-rules/327-d6-summon-authorship.js | 2026-11-08（体检总框架 D6·召唤物与附身窗口）
// 召唤契约 byName / byUid 落账口径（core/204 + core/205 各召唤点）：
//   ① 带 byUid 的召唤（个人召唤：周芷若/雌鹰/幼狮/雄狮/母狮/蹦蹦等）必须同时带非空 byName，
//      且 byName 必须等于 byUid 对应单位的真实名字——防止张冠李戴、用显示名/称号顶替；
//   ② byUid 不得等于 summonUid 本身；召唤者本身也是召唤物（谢逊召幼狮）属既有设计，只核归属名、不判链长；
//   ③ 只有 byName、没有 byUid 的只能是团队补召标签（众志成城 / 小昭·妹），白名单外一律红；
//   ④ 两者都没有的是团队级召唤（副将雄鹰：全队 carry 溢出补位，无单一召唤者），只计数观察，不硬判。
// 已知缺口（tests/known-transfers.md「待用户定夺·召唤者 uid」行）：core/204 副将雄鹰 / 众志成城补员两条没写 byUid，本条不重复染红。
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

const TEAM_LEVEL_BY_NAME = new Set(['众志成城', '小昭·妹']);

export const rule327 = {
    group: '召唤契约',
    name: '召唤者身份归属byName/byUid(回归)',
    test: function (ctx, log, beforeA, beforeE) {
        const facts = ctx && Array.isArray(ctx.facts) ? ctx.facts : [];
        if (facts.length === 0) return 'skip';

        const nameByUid = new Map();
        for (const u of (beforeA || []).concat(beforeE || [])) {
            if (u && typeof u.uid === 'string' && u.uid !== '') nameByUid.set(u.uid, u.name);
        }
        const summonNames = new Map();
        for (const f of facts) {
            const d = (f && f.data) || {};
            if (f && f.factType === FACT_TYPES.SUMMON_UNIT && typeof d.summonUid === 'string' && d.summonUid !== '') {
                summonNames.set(d.summonUid, d.summonName || '召唤物');
            }
        }

        let total = 0, named = 0, chainN = 0, teamLabelN = 0, noAuthorN = 0;
        const noAuthorNames = new Set();
        const fails = [];
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f || f.factType !== FACT_TYPES.SUMMON_UNIT) continue;
            const d = f.data || {};
            if (typeof d.summonUid !== 'string' || d.summonUid === '') continue;
            total++;
            const label = `${d.summonName || '召唤物'}(${d.summonUid})`;
            const byUid = typeof d.byUid === 'string' && d.byUid !== '' ? d.byUid : null;
            const byName = typeof d.byName === 'string' && d.byName !== '' ? d.byName : null;

            if (byUid) {
                named++;
                if (!byName) {
                    fails.push(`${label} 有 byUid(${byUid}) 却缺 byName`);
                    continue;
                }
                if (byUid === d.summonUid) {
                    fails.push(`${label} byUid 指向自己（自召）`);
                    continue;
                }
                if (summonNames.has(byUid)) {
                    // 召唤者本身是召唤物（如谢逊召幼狮）属既有设计：只核对归属名，不判召唤链
                    chainN++;
                    if (summonNames.get(byUid) !== byName) {
                        fails.push(`${label} byName(${byName}) 与召唤者 ${summonNames.get(byUid)} 不符`);
                    }
                    continue;
                }
                const actual = nameByUid.has(byUid) ? nameByUid.get(byUid) : null;
                if (actual == null) {
                    fails.push(`${label} byUid(${byUid}) 不属于开局己方名单，召唤者身份无法核对`);
                } else if (actual !== byName) {
                    fails.push(`${label} byName(${byName}) 与召唤者真实名字(${actual}) 不符`);
                }
                continue;
            }
            if (byName) {
                if (!TEAM_LEVEL_BY_NAME.has(byName)) {
                    fails.push(`${label} 有 byName(${byName}) 无 byUid，且不是团队补召白名单（众志成城/小昭·妹）`);
                } else {
                    teamLabelN++;
                }
                continue;
            }
            noAuthorN++;
            noAuthorNames.add(d.summonName || '召唤物');
        }
        if (total === 0) return 'skip';

        const observe = `召唤 ${total} 次 / 具名(byUid) ${named} 次（其中召唤者是召唤物 ${chainN} 次） / 团队补召标签 ${teamLabelN} 次 / 无召唤者归属 ${noAuthorN} 次`
            + (noAuthorN ? `（${[...noAuthorNames].slice(0, 5).join('、')}）` : '') + `，身份违规 ${fails.length} 条`;
        if (fails.length) return { fail: true, msg: fails.slice(0, 3).join('；') };
        return { fail: false, observe: observe };
    }
};
