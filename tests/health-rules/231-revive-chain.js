// tests/health-rules/231-revive-chain.js
// 体检规则：圣火不熄「复活链」完整性（死亡前置 → 复活公告 → 血量/档位落账）
//
// 覆盖边界（与 173/184 互补，不重复判它们的既有口径）：
//   173 判「复活量非有限/越界 + 阵营名额上限」；184 判「复活前后同回合的行动权归属」。
//   本规则把整条链串起来，专盯两边都没判的三件事：
//     ① 时序：同一 uid 的死亡登记下标必须早于复活公告（死→活逆序判红；缺死亡前置也判红）；
//     ② 档位：reviveRatio 必须落在合法档位 {0.40, 0.70}，第 2 次复活必须 0.40；
//     ③ 血量落账：raw === round(maxHp×ratio)、heal === min(raw, 缺口)、hpAfter === hpBefore+heal、hpAfter ≤ maxHp。
//
// V1.1.0（2026-11-08）：主代码补齐后由「观察项」升硬判据——
//   · aaff7277 起 core/213 的 resolveDeaths 单一出口发 UNIT_DEATH（uid/name/camp/reason/hpBefore/hpAfter），
//     core/204 复活前对「_pendingDeath && hp<=0」补一条 ⇒ 死亡前置全量可判，不再靠观测；
//   · 0a686611 起复活公告带 reviveTier/reviveRatio/reviveRaw/healAmount/reviveMaxHp/hpBefore/hpAfter，
//     档位与血量落账改为结构化精确核对，不再从 note 中文里抠数字、也不再拿终局 maxHp 反推。
// 死亡登记通道：UNIT_DEATH 为主；攻击帧 snap/dead 与 deaths[]、玄冥 DOT 作兜底。
export const VER = 'tests/health-rules/231-revive-chain.js V1.1.0';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

const LEGAL_RATIOS = [0.40, 0.70];
const EPS = 1e-6;
const HP_EPS = 0.11;   // 血量按 0.1 精度落账，留一格余量

export const rule231 = {
    group: '行动与目标回归',
    name: '圣火复活链完整性(回归)',
    test: function (ctx) {
        const fs = (ctx && Array.isArray(ctx.facts)) ? ctx.facts : [];
        if (!fs.length) return 'skip';

        const deathIdx = new Map();    // uid -> 最近一次死亡登记在 fact 流里的下标
        const revived = new Set();
        const errs = [];
        let revives = 0, tierChecked = 0;

        for (let i = 0; i < fs.length; i++) {
            const f = fs[i];
            if (!f || !f.factType) continue;
            const d = f.data || {};

            // 死亡登记①（主通道）：resolveDeaths 统一出口
            if (f.factType === FACT_TYPES.UNIT_DEATH) {
                if (d.uid != null) deathIdx.set(d.uid, i);
                continue;
            }
            // 死亡登记②（兜底）：攻击帧快照；UNIT_DEATH 上线后不再依赖攻击帧的 deaths 数组
            if (f.factType === FACT_TYPES.ATTACK) {
                const t = d.target, snap = d.snap || {}, dmg = d.dmgResult || {};
                if (t && t.uid != null && (snap.targetAlive === false || dmg.dead === true)) deathIdx.set(t.uid, i);
                continue;
            }
            if (f.factType === FACT_TYPES.XUAN_MING_DOT) {
                if (d.isDead && d.uidD != null) deathIdx.set(d.uidD, i);
                continue;
            }
            if (f.factType !== FACT_TYPES.SKILL_ANNOUNCE || d.skillName !== '圣火不熄' || d.unitUid == null) continue;

            // 复活公告
            revives++;
            const uid = d.unitUid;
            const label = d.unitName || uid;

            // ① 死亡前置 / 时序
            const di = deathIdx.get(uid);
            if (di == null) {
                errs.push((revived.has(uid) ? '二次复活' : '复活') + '缺死亡前置：' + label);
            } else if (di > i) {
                errs.push(label + ' 的死亡登记@' + di + ' 晚于复活公告@' + i + '（死→活顺序倒置）');
            } else {
                deathIdx.delete(uid);
            }
            revived.add(uid);

            // ② 档位
            const tier = d.reviveTier, ratio = d.reviveRatio, slot = d.reviveSlot;
            if (!Number.isInteger(tier) || tier < 1) errs.push(label + ' 复活档位非法：reviveTier=' + String(tier));
            if (typeof ratio !== 'number' || !LEGAL_RATIOS.some(x => Math.abs(x - ratio) < EPS)) {
                errs.push(label + ' 复活比例 ' + String(ratio) + ' 不在合法档位 [' + LEGAL_RATIOS.join(', ') + ']');
            } else if (tier === 2 && Math.abs(ratio - 0.40) > EPS) {
                errs.push(label + ' 第2次复活比例应为 0.40，实际 ' + ratio);
            }
            if (slot !== 'team' && slot !== 'self') errs.push(label + ' 复活名额非法：reviveSlot=' + String(slot));

            // ③ 血量落账
            const raw = d.reviveRaw, maxHp = d.reviveMaxHp, heal = d.healAmount;
            const hpBefore = d.hpBefore, hpAfter = d.hpAfter;
            if (!isFinite(raw) || !isFinite(maxHp) || !isFinite(heal) || !isFinite(hpBefore) || !isFinite(hpAfter) || !(maxHp > 0)) {
                errs.push(label + ' 复活 fact 缺结构化字段（reviveRaw/reviveMaxHp/healAmount/hpBefore/hpAfter）');
            } else {
                tierChecked++;
                const expRaw = Math.round(maxHp * ratio);
                if (raw !== expRaw) {
                    errs.push(label + ' 复活原始量 raw=' + raw + ' ≠ round(maxHp(' + maxHp + ')×' + ratio + ')=' + expRaw);
                }
                const expHeal = Math.min(raw, Math.max(0, maxHp - hpBefore));
                if (Math.abs(heal - expHeal) > HP_EPS) {
                    errs.push(label + ' 实际回复 heal=' + heal + ' ≠ min(raw, maxHp-hpBefore)=' + expHeal);
                }
                if (Math.abs(hpBefore + heal - hpAfter) > HP_EPS) {
                    errs.push(label + ' 血线不自洽：hpBefore(' + hpBefore + ')+heal(' + heal + ')≠hpAfter(' + hpAfter + ')');
                }
                if (hpAfter > maxHp + HP_EPS) {
                    errs.push(label + ' 复活后血量超上限：hpAfter=' + hpAfter + ' > maxHp=' + maxHp);
                }
            }
        }

        if (revives === 0) return 'skip';
        if (errs.length) {
            return { fail: true, msg: errs.slice(0, 4).join('；') + (errs.length > 4 ? '（共 ' + errs.length + ' 处）' : '') };
        }
        return {
            fail: false,
            msg: '复活链成立：复活 ' + revives + ' 次，结构化档位/血量核对 ' + tierChecked + ' 次，死→活无逆序、无缺前置'
        };
    }
};
