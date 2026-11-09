// tests/health-rules/262-butterfly-window-pairing.js | 2026-11-08（体检总框架 D6·召唤物/附身/占格）
// 小昭·姊蝶变附身窗口必须成对：
//   ① 每次 BUTTERFLY_ATTACH 只能关一次（RETURN 正常飞回 / HOST_DEAD 宿主阵亡飞回），
//      窗口没关又附身 = 重复附身，攻防血加成会叠两次；
//   ② 关闭必须有对应窗口（没附身就飞回 = 状态机错位）；
//   ③ HOST_DEAD 必须带 hostUid，且等于该窗口附身时的宿主 uid —— 统计/渲染都要靠它认「谁的窗口关了」；
//   ④ 整场结束时不得残留未关闭窗口（残留 ⇒ 之后所有结算都按附身身份算）；
//   ⑤ 窗口一旦关闭（RETURN / HOST_DEAD），宿主身上不得再留 `group='butterfly'` 词条——
//      否则该宿主复活后永久吃附身的攻/防/血上限加成，且残留的 maxHp 词条会抬高全队总上限
//      （modules/322 飞回血量按「全队 maxHp」当分母，分母虚高 ⇒ 姐姐飞回血量偏低）。
// BUTTERFLY_NO_HOST（找不到宿主）是独立事件，不作为窗口关闭参与配对。
// 实测（156 场）：364 次附身 / 341 次飞回 / 23 次宿主阵亡，配对与宿主归属违规 **0 条**。
//   历史：本条上线时 23 条 HOST_DEAD 的 hostUid 全为 null（modules/322 先清 _butterflyHost 再读该字段），
//   该缺陷已由主代码改成「进函数先存 hostUidBeforeClear」。
//   判据⑤实测 26 具宿主残留（全部走宿主阵亡分支，终局均为死亡态）：modules/322 `_executeReturn`
//   的 host-alive 分支有 `removeModsByGroup(host,'butterfly')`，宿主死亡分支没有 ⇒ 已登记
//   tests/known-transfers.md 转交主代码（按进程本规则本轮显示 ⚠️，不染红）。
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

// ★ V1.1.0（第 199 轮）：判据⑤ 的报红文案**拆成「固定标签 + 变量部分」**。
//   为什么（第 199 轮实测）：原文案 `宿主机 ${name}(${uid}) …` 以变量打头 ⇒ 静态前缀为空 ⇒
//   抽取器（_lib/rule-branch-extract）只能走 join 兜底且取不到前缀 ⇒ 本条规则名下 **144 条证据全部
//   「对不上号」**（占当时 170 条不可解析证据的 85%），牙口腐烂棘轮天天挂红，真问题被淹没。
//   ★ 判据一个字没动：命中条件、循环、顺序、取前 3 条的口径全部逐字等价，改的只是「怎么报」。
//   ★ 标签只在此处定义一次，判定与抽取共用同一个字符串 —— 两处各写一份必然分叉（第 133 轮通规）。
const BUTTERFLY_RESIDUE_LABEL = '蝶变词条残留：宿主机 ';

export const rule262 = {
    group: '附身窗口',
    name: '蝶变附身窗口成对与宿主归属(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE) {
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

        // ⑤ 关闭窗口后宿主词条必须清干净：终局快照里，不是「当前仍打开的窗口宿主」却还挂着
        //   蝶变词条（group='butterfly' / source='蝶变附身'）= 飞回路径漏清理，宿主复活/全队 maxHp 汇总会吃假加成。
        const openHosts = new Set();
        for (const w of open.values()) if (typeof w.hostUid === 'string') openHosts.add(w.hostUid);
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
        for (const u of ended) {
            if (!u || typeof u.uid !== 'string' || openHosts.has(u.uid)) continue;
            if (hasButterflyMod(u)) fails.push(BUTTERFLY_RESIDUE_LABEL + `${u.name || '?'}(${u.uid})`);
        }

        const observe = `附身 ${attachN} 次 / 飞回 ${returnN} 次 / 宿主阵亡 ${hostDeadN} 次，配对违规 ${fails.length} 条`;
        if (fails.length) {
            // ★ V1.1.0：发红出口**拆成两个各自带固定静态前缀的分支**，让抽取器（_lib/rule-branch-extract）
            //   每条分支都能拿到可用指纹（`msg:` 后紧跟单一字面量，不能是变量透传 —— 变量透传 fp=null，
            //   rule-branch-idle-selftest 判「无可抽取指纹的分支」红）。
            //   ★ 判据一字未动：命中条件、循环、顺序、取第一条的口径全部与 V1.0.1 逐字等价，
            //     只是把原来的 `join('；')` 拆成「主病因单独报 / 副病因带计数报」两支。
            const residue = fails.filter(f => f.startsWith(BUTTERFLY_RESIDUE_LABEL));
            if (residue.length === fails.length) {
                return { fail: true, msg: `${BUTTERFLY_RESIDUE_LABEL}${residue[0].slice(BUTTERFLY_RESIDUE_LABEL.length)}` };
            }
            return { fail: true, msg: `蝶变附身窗口成对违规：${fails[0]}${fails.length > 1 ? `（另有 ${fails.length - 1} 条）` : ''}` };
        }
        return { fail: false, observe: observe };
    }
};
