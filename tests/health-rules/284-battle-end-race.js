// tests/health-rules/284-battle-end-race.js | 2026-11-08（第 284 轮·存活胜负与结算链域）
// 终局全链：全灭即结束 + 复活公告必须活到终局（判死 ↔ 复活的竞争）。
//
// 判据①（全灭后不得再出手）：终局快照里 0 活人的一侧，其「最后一条 UNIT_DEATH」之后不得再出现
//   该阵营的 ATTACK。不需要开局名单——攻击 fact 自带 attacker.camp，因此召唤/补员中途进场也不会误判。
//   （用开局名单自建存活集合的做法已废弃：众志成城补员/幼狮等中途进场单位不在名单里，会把「还有召唤物」
//    误判成全灭，实测 19/156 假红。）
// 判据②（复活不得被终局覆盖）：某 uid 最后一次复活公告晚于最后一次死亡时，终局快照必须 alive；
//   若仍阵亡 ⇒ 判红（复活被覆盖 / 落位失败）。复活后再次阵亡是合法路径，按「最后一次」比较即可区分。
// 判据③（平局/双灭口径）归 233，本规则不重复判。
// 数据依赖：UNIT_DEATH / SKILL_ANNOUNCE / ATTACK / afterA / afterE，全部回放侧可得。
export const VER = 'tests/health-rules/284-battle-end-race.js V1.1.0';
import { FACT_TYPES, CAMP_TYPES } from '../../infra/106-battle-enums.js';

const SIDE_CN = { [CAMP_TYPES.ALLY]: '我方', [CAMP_TYPES.ENEMY]: '敌方' };

export const rule284 = {
    group: '行动与目标回归',
    name: '终局全链与复活判死竞争(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        const fs = (facts && facts.length) ? facts : ((ctx && ctx.facts) || []);
        if (!fs.length) return 'skip';

        const finalAlive = new Map();                       // uid -> 终局 alive
        const campAlive = { [CAMP_TYPES.ALLY]: 0, [CAMP_TYPES.ENEMY]: 0 };
        for (const u of (afterA || [])) if (u && u.uid != null) { finalAlive.set(u.uid, !!u.alive); if (u.alive) campAlive[CAMP_TYPES.ALLY]++; }
        for (const u of (afterE || [])) if (u && u.uid != null) { finalAlive.set(u.uid, !!u.alive); if (u.alive) campAlive[CAMP_TYPES.ENEMY]++; }

        const lastDeathByCamp = new Map();                  // camp -> 最后一条 UNIT_DEATH 下标
        const lastDeath = new Map();                        // uid -> 最后一次死亡下标
        const lastRevive = new Map();                       // uid -> 最后一次复活公告下标
        for (let i = 0; i < fs.length; i++) {
            const f = fs[i];
            if (!f || !f.factType) continue;
            const d = f.data || {};
            if (f.factType === FACT_TYPES.UNIT_DEATH) {
                if (d.uid != null) lastDeath.set(d.uid, i);
                if (d.camp) lastDeathByCamp.set(d.camp, i);
            } else if (f.factType === FACT_TYPES.SKILL_ANNOUNCE) {
                if (d.skillName === '圣火不熄' && d.unitUid != null) lastRevive.set(d.unitUid, i);
            }
        }

        const errs = [];

        // 判据①：0 活的一侧，最后死亡之后不得再有该阵营出手
        for (const camp of [CAMP_TYPES.ALLY, CAMP_TYPES.ENEMY]) {
            if (campAlive[camp] !== 0) continue;
            const di = lastDeathByCamp.get(camp);
            if (di == null) continue;
            for (let i = di + 1; i < fs.length; i++) {
                const f = fs[i];
                if (!f || f.factType !== FACT_TYPES.ATTACK) continue;
                const a = f.data && f.data.attacker;
                if (a && a.camp === camp) {
                    errs.push(`终局0活后仍出手：${SIDE_CN[camp]} 单位 ${a.name || a.uid} 在最后死亡@${di} 之后仍出手@${i}`);
                    break;
                }
            }
        }

        // 判据②：最后一次复活晚于最后一次死亡 ⇒ 终局必须活着
        for (const [uid, ri] of lastRevive) {
            const di = lastDeath.get(uid);
            if (di != null && di > ri) continue;
            if (finalAlive.has(uid) && finalAlive.get(uid) === false) {
                errs.push(`复活后被终局覆盖：uid ${uid} 最后一次复活@${ri} 之后无死亡，终局却仍阵亡（复活被覆盖/落位失败）`);
            }
        }

        // ★ V1.1.0（第 199 轮）：**分子病因发红**，不再把 errs 拼成一条 msg。
        //   为什么必须拆（第 199 轮实测，务必先读）：本条把 errs 前 4 条 `join('；')` 成一条 msg，
        //   于是「判据①出手」与「判据②复活被覆盖」混在同一句话里，**两种病因的开头完全相同**
        //   （改前两种病因都以「我方 终局 0 活」或「uid u​…」打头，抽取器只能给一个分支取**一个**静态前缀），
        //   因此这条规则名下 16 条证据全部「对不上号」。改后两种病因各自以固定中文标签打头，前缀天然互不相同。
        //   ★ 判据一个字没动：errs 的判定条件、循环、顺序、命中集合与改前**逐字等价**，
        //     改的只是「怎么报」—— 每个子病因各发一条（前缀天然互不相同），顺序仍是源码顺序。
        if (errs.length) {
            // 判据①的病因（每阵营至多 1 条）
            for (const camp of [CAMP_TYPES.ALLY, CAMP_TYPES.ENEMY]) {
                const hit = errs.find(e => e.startsWith(`终局0活后仍出手：${SIDE_CN[camp]} `));
                if (hit) return { fail: true, msg: '终局0活后仍出手：' + hit.slice('终局0活后仍出手：'.length) };
            }
            // 判据②的病因（每个 uid 至多 1 条）
            for (const e of errs) {
                if (e.startsWith('复活后被终局覆盖：uid ')) return { fail: true, msg: '复活后被终局覆盖：' + e.slice('复活后被终局覆盖：'.length) };
            }
            // 兜底：口径未识别的新形态原样报（不吞错、不静默）
            return { fail: true, msg: '未识别病因：' + errs.slice(0, 4).join('；') };
        }
        return {
            fail: false,
            msg: '终局全链一致：0 活一侧无后续出手，复活公告全部活到终局（终局存活 我方 ' + campAlive[CAMP_TYPES.ALLY] + ' / 敌方 ' + campAlive[CAMP_TYPES.ENEMY] + '）'
        };
    }
};
