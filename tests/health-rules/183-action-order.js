// tests/health-rules/183-action-order.js
// 体检规则：行动顺序纪律（阵亡者不得再出手 / 同一回合不得重复获得行动权）
//
// 为什么只判这两条（2026-11-08 取证）：
//   渲染后的 attack-group 会把「闪避/免疫/反击/追击」混成一条条出手，按渲染条目判「阵营交替」会得到
//   795 条假异常；改用原始 fact 流后，双击、连击、七伤齐发这类**额外攻击**仍然是独立 attack fact，
//   与主行动的区分只靠 attacker.state._isLinkAttack（和 checkActionRights 同源）——故不硬判「阵营必须交替」。
//   能稳定判死的是下面两条结构不变量：
//     ① 阵亡者不得再出手：死在**更早回合**的单位，后续任何一次「非额外」攻击/闪避/未命中/免疫/休息都算违规。
//        同回合豁免：唐文亮「同归于尽」是死亡当回合触发的反噬（attacker 已 hp=0 但仍记一条 dodge fact），
//        属设计内的死亡反应，不是行动权，故只判「跨回合」再出手（实测 2 例假红均为此形态）。
//        复活豁免：收到 skillAnnounce「圣火不熄」后移出死亡名单。
//     ② （已删除）「同一单位两段出手」判据：实测 51/150 场假红（唐文亮冲刺/癫改目标都会产生两段攻击 fact），
//         「出手 + 休息互斥」也有 16/150 场假红（同归于尽后复活会补一条 isBlock 的 PASS），两条都没有干净树的稳定语义，
//         故只保留①这条结构不变量。行动权总数由 checkActionRights 兜底，本规则不重复判。
//   死亡名单只认 attack fact 的 snap.targetAlive===false / dmgResult.dead===true，不看渲染文本；不全时只会漏报。
export const VER = 'tests/health-rules/183-action-order.js V1.2.0';

const TURN_FACT_TYPES = ['attack', 'miss', 'dodge', 'immune'];

function isLink(a) {
    return !!(a && a.state && a.state._isLinkAttack);
}

export const rule183 = {
    group: '行动与目标回归',
    name: '阵亡者不得再出手(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        const fs = facts || [];
        if (!fs.length) return 'skip';

        const dead = Object.create(null);
        let round = null;
        let turns = 0;
        const errs = [];

        for (const f of fs) {
            if (!f || !f.factType) continue;
            const d = f.data || {};

            if (f.factType === 'roundStart') { round = d.round; continue; }
            if (f.factType === 'roundEnd') continue;
            if (f.factType === 'skillAnnounce' && d.skillName === '圣火不熄' && d.unitUid) {
                delete dead[d.unitUid];
                continue;
            }

            let uid = null;
            let display = null;

            if (TURN_FACT_TYPES.indexOf(f.factType) >= 0) {
                const attacker = d.attacker;
                if (!attacker || attacker.uid == null) continue;
                if (isLink(attacker)) continue;     // 反击/追击/联动属额外攻击，不占行动权
                uid = attacker.uid;
                display = attacker.name || attacker.uid;
            } else if (f.factType === 'pass' && d.unit && d.unit.uid != null) {
                uid = d.unit.uid;
                display = d.unit.name || d.unit.uid;
            } else {
                continue;
            }

            turns++;

            // 阵亡者出手：死亡名单只在 attack fact 上登记，漏登记只会少报、不会误报
            //   只判跨回合（死在第 N 回合、第 N+1 回合及以后还出手）；同回合的死亡反噬属设计。
            if (dead[uid] != null && round != null && dead[uid] < round) {
                errs.push('第' + round + '回合：' + display + ' 在第' + dead[uid] + '回合阵亡后仍然出手');
            }

            if (f.factType === 'attack') {
                const t = d.target;
                const snap = d.snap || {};
                const dmg = d.dmgResult || {};
                if (t && t.uid != null && (snap.targetAlive === false || dmg.dead === true)) dead[t.uid] = round == null ? 0 : round;
            }
        }

        if (turns === 0) return 'skip';
        if (errs.length) {
            return {
                fail: true,
                msg: errs.slice(0, 3).join('；') + (errs.length > 3 ? '（共 ' + errs.length + ' 处阵亡后出手）' : '')
            };
        }
        return { fail: false, msg: '阵亡者出手口径成立：核对 ' + turns + ' 次出手，无阵亡后出手' };
    }
};
