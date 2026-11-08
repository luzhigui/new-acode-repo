// tests/health-rules/262-butterfly-window-pairing.js | 2026-11-08（体检总框架 D6·召唤物/附身/占格）
// 小昭·姊蝶变附身窗口必须成对：
//   ① 每次 BUTTERFLY_ATTACH 只能关一次（RETURN 正常飞回 / HOST_DEAD 宿主阵亡飞回），
//      窗口没关又附身 = 重复附身，攻防血加成会叠两次；
//   ② 关闭必须有对应窗口（没附身就飞回 = 状态机错位）；
//   ③ HOST_DEAD 必须带 hostUid，且等于该窗口附身时的宿主 uid —— 统计/渲染都要靠它认「谁的窗口关了」；
//   ④ 整场结束时不得残留未关闭窗口（残留 ⇒ 之后所有结算都按附身身份算）。
// BUTTERFLY_NO_HOST（找不到宿主）是独立事件，不作为窗口关闭参与配对。
// 实测（156 场）：356 次附身 / 333 次 RETURN / 23 次 HOST_DEAD —— ★ 23 条 HOST_DEAD 的 hostUid 全为 null，
//   主代码 modules/322 的 _executeReturn 先 Object.assign(_butterflyHost:null) 再读该字段，读到的永远是 null。
//   这是真问题，已登记 tests/known-transfers.md（等主代码一行修正：先取 uid 再清 state）。
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

export const rule262 = {
    group: '附身窗口',
    name: '蝶变附身窗口成对与宿主归属(回归)',
    test: function (ctx) {
        const facts = ctx && Array.isArray(ctx.facts) ? ctx.facts : [];
        if (facts.length === 0) return 'skip';

        const fails = [];
        const open = new Map();   // sisterUid -> { hostUid, index, round }
        let attachN = 0, returnN = 0, hostDeadN = 0, round = 0;
        const CLOSERS = [FACT_TYPES.BUTTERFLY_RETURN, FACT_TYPES.BUTTERFLY_HOST_DEAD];

        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f) continue;
            if (f.factType === FACT_TYPES.ROUND_START) {
                round = (f.data && typeof f.data.round === 'number') ? f.data.round : round + 1;
                continue;
            }
            if (f.factType === FACT_TYPES.BUTTERFLY_ATTACH) {
                const d = f.data || {};
                attachN++;
                const key = d.sisterUid;
                if (open.has(key)) fails.push(`第${round}回合附身时上一个窗口还没关（sister=${String(key)}）`);
                if (typeof d.hostUid !== 'string' || d.hostUid === '') fails.push(`附身 fact 缺 hostUid（sister=${String(key)}）`);
                open.set(key, { hostUid: d.hostUid, index: i, round: round });
                continue;
            }
            if (!CLOSERS.includes(f.factType)) continue;
            const d = f.data || {};
            const key = d.sisterUid;
            const w = open.get(key);
            if (f.factType === FACT_TYPES.BUTTERFLY_RETURN) returnN++;
            else hostDeadN++;
            if (!w) {
                fails.push(`第${round}回合窗口关闭无对应附身（${f.factType}，sister=${String(key)}）`);
                continue;
            }
            if (f.factType === FACT_TYPES.BUTTERFLY_HOST_DEAD) {
                if (typeof d.hostUid !== 'string' || d.hostUid === '') {
                    fails.push(`第${round}回合宿主阵亡 fact 缺 hostUid（窗口宿主是 ${String(w.hostUid)}）`);
                } else if (d.hostUid !== w.hostUid) {
                    fails.push(`第${round}回合宿主阵亡 uid 不符：关闭=${d.hostUid} 附身=${String(w.hostUid)}`);
                }
            }
            open.delete(key);
        }

        for (const [key, w] of open) {
            fails.push(`附身窗口未关闭：sister=${String(key)} 自第${w.round}回合起一直挂着`);
        }
        if (attachN === 0) return 'skip';

        const observe = `附身 ${attachN} 次 / 飞回 ${returnN} 次 / 宿主阵亡 ${hostDeadN} 次，配对违规 ${fails.length} 条`;
        if (fails.length) return { fail: true, msg: fails.slice(0, 3).join('；') };
        return { fail: false, observe: observe };
    }
};
