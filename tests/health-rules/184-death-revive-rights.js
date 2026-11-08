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
// 死亡登记通道（V1.2.0 第 193 轮）：**只认 `unitDeath` fact**（infra/106 UNIT_DEATH）。
//   core/213 resolveDeaths 是唯一真实死亡出口，每死者发一条 { uid, name, camp, reason, hpBefore, hpAfter }，
//   覆盖毒 DOT / 反伤 / 自伤 / 攻击致死全部死法；core/204 复活前也会对 `_pendingDeath && hp<=0` 补一条。
//   **旧通道已删**（原先从 attack fact 的 snap.targetAlive===false / dmgResult.dead===true 反推死亡）——
//   那条通道看不见毒/反伤致死的单位，导致「复活公告但无死亡登记」在 172 场里出现 20 例假观察。
//
// 复活通道：skillAnnounce skillName==='圣火不熄' 且带 unitUid ⇒ 移出死亡名单、恢复行动权。
//   升级为硬判据（第 193 轮）：复活公告但死亡名单里没有该 uid ⇒ 违规（旧通道下 172 场 20 例，
//   换 UNIT_DEATH 后实测 0 例，故升硬判据；若日后复现，说明死亡出口漏发或复活链在无死亡时报复活）。
export const VER = 'tests/health-rules/184-death-revive-rights.js V1.2.0';

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

        for (const f of fs) {
            if (!f || !f.factType) continue;
            const d = f.data || {};

            if (f.factType === 'roundStart') { round = d.round; continue; }

            // 死亡登记：唯一真通道 UNIT_DEATH（resolveDeaths 单一出口）
            if (f.factType === 'unitDeath' && d.uid != null) {
                dead[d.uid] = (round == null ? 0 : round);
                continue;
            }

            // 复活：死亡名单清除，行动权恢复；无死亡登记者＝违规
            if (f.factType === 'skillAnnounce' && d.skillName === '圣火不熄' && d.unitUid != null) {
                if (dead[d.unitUid] == null) {
                    errs.push('第' + (round == null ? '?' : round) + '回合：' + (d.unitName || d.unitUid) +
                        ' 收到复活公告，但此前没有任何死亡登记（unitDeath 漏发或异常复活）');
                }
                delete dead[d.unitUid];
                continue;
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
        return { fail: false, msg: '死亡/复活行动权口径成立：核对 ' + samples + ' 次出手，无同回合阵亡后出手或 PASS，复活均有死亡登记' };
    }
};
