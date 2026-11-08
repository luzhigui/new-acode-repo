// tests/health-rules/184-death-revive-rights.js
// 体检规则：回合中途死亡 / 复活之后的行动权归属（同回合口径）
//
// 与 183 的分工：183 管「跨回合还出手」（死在第 N 回合，第 N+1 回合及以后又动）；本规则只盯**同一回合内**
//   死亡 → 出手 的时序，补住 183 刻意豁免的同回合空档。
//
// 口径（2026-11-08 第 191 轮实测 60 场 / 746 回合 / 5202 段出手）：
//   ① 同回合「阵亡（未被复活）后仍产出**命中型** attack fact」= 违规。实测 0 例。
//      dodge / miss / immune **不算**：唐文亮「同归于尽」死在当回合仍会记一条 dodge 反噬（attacker hp=0），
//      被闪避/被挡的反噬属设计内的死亡反应，不是新的一手行动权。
//   ② 同回合「阵亡后仍收到 PASS（休息）」= 违规。PASS 是「本回合放弃出手」的记账，死人不该再记账。实测 0 例。
//      （复活后补 PASS 的形态不误报：圣火不熄公告一到就把它移出死亡名单。）
//   ③ 复活后同回合出几次**不设上限**：实测复活当回合出手 0～2 次都出现（复活即恢复行动权 + 后续连击），
//      设上限会误伤正常战斗，故只判 ① ② 两条时序。
//
// 死亡登记通道：只认 attack fact 的 snap.targetAlive===false / dmgResult.dead===true（引擎不在 fact 流里发
//   `death` 类型事实，实测 seed=1 stage=1 全程 death fact 0 条）。漏登记（毒/反伤类死亡）只会少报，不会误报。
// 复活通道：skillAnnounce skillName==='圣火不熄' 且带 unitUid。
export const VER = 'tests/health-rules/184-death-revive-rights.js V1.0.0';

const HIT_FACT_TYPES = ['attack', 'miss', 'dodge', 'immune'];

export const rule184 = {
    group: '行动与目标回归',
    name: '死亡与复活的行动权归属(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        const fs = facts || [];
        if (!fs.length) return 'skip';

        const dead = Object.create(null);   // uid -> 死亡所在回合
        let round = null;
        let samples = 0;
        const errs = [];

        const registerDeath = (uid, r) => { if (uid != null) dead[uid] = (r == null ? 0 : r); };

        for (const f of fs) {
            if (!f || !f.factType) continue;
            const d = f.data || {};

            if (f.factType === 'roundStart') { round = d.round; continue; }

            // 复活：死亡名单清除，行动权恢复
            if (f.factType === 'skillAnnounce' && d.skillName === '圣火不熄' && d.unitUid != null) {
                delete dead[d.unitUid];
                continue;
            }

            // 死亡登记（看这一击是否把目标打死）
            if (f.factType === 'attack') {
                const t = d.target;
                const snap = d.snap || {};
                const dmg = d.dmgResult || {};
                if (t && t.uid != null && (snap.targetAlive === false || dmg.dead === true)) registerDeath(t.uid, round);
            }

            // ① 同回合阵亡后仍命中出手
            if (f.factType === 'attack') {
                const a = d.attacker;
                if (a && a.uid != null && dead[a.uid] != null && round != null && dead[a.uid] === round) {
                    // 自身自损（七伤拳等）：attacker === target 且同一事实，属伤害结算本身，不计出手
                    if (!(d.target && d.target.uid === a.uid)) {
                        samples++;
                        errs.push('第' + round + '回合：' + (a.name || a.uid) + ' 本回合阵亡后仍命中出手');
                    }
                }
            }

            // ② 同回合阵亡后仍 PASS
            if (f.factType === 'pass' && d.unit && d.unit.uid != null && dead[d.unit.uid] != null && round != null && dead[d.unit.uid] === round) {
                samples++;
                errs.push('第' + round + '回合：' + (d.unit.name || d.unit.uid) + ' 本回合阵亡后仍收到休息(PASS)');
            }

            if (HIT_FACT_TYPES.indexOf(f.factType) >= 0) samples++;
        }

        if (samples === 0) return 'skip';
        if (errs.length) {
            return {
                fail: true,
                msg: errs.slice(0, 3).join('；') + (errs.length > 3 ? '（共 ' + errs.length + ' 处）' : '')
            };
        }
        return { fail: false, msg: '死亡/复活行动权口径成立：核对 ' + samples + ' 次出手，无同回合阵亡后出手或 PASS' };
    }
};
