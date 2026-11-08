// 回归规则：血量/判死/复活这一块的「复活闭环 + 回血账目」自洽。
// 机制源：
//   圣火不熄（core/204-buff-system.js submitHolyFireRecord + reviveHolyFireUnit）：
//     - 名额：团队 1 次（含 小昭·姊 强化时 hexEnhance.holyFire.reviveCount，可到 2）；
//       小昭·妹自己额外 1 次独立名额（_holyFireSelf，与团队名额不互占）；
//     - 血量：round(maxHp × ratio)，ratio = 团队版 0.4（姊强化首 1.0 / 次 0.7）、妹版 0.3（002-hex-enhance.json）；
//       落地值 = min(reviveRaw, maxHp - hp)，因阵亡时 hp=0 ⇒ 实际等于 reviveRaw；
//     - 公告：SKILL_ANNOUNCE { skillName:'圣火不熄', unitUid, camp, note:'…回复 N 点生命' }（render 走公告文案）。
//   回血家族各 fact 的数值字段（本规则只做「自身自洽」，不与 143/150/151/159/164 的具体机制判据重复）：
//     heal/kuaiLeHeal：{heal, hpBefore, hpAfter}；endlessBreath：{heal, overflow}；
//     hotBloodHeal：{leech, healActual, healNominal}；bloodthirstLeech：{leechVal, healActual, healNominal}；
//     weiLeech：{heal, newMaxHp, maxHpDelta}；clawHeal：{totalHeal, healActual, healNominal}；
//     flyerRegen：{heal, deadCount}；phantomDisguiseHeal：{heal, healActual, healNominal}。
// 为什么值得盯（本块此前完全没体检规则）：
//   1) 圣火不熄是「阵亡 → 复活」的唯一补充血源，复活量算错/复活到名单外的单位，战报只写一句
//      「原地复活，回复 N 点生命」，肉眼完全看不出（静默错，和本仓库历史多次「文案对、数值错」同型）；
//   2) 名额是队伍级求和（_holyFireUses 记在阵亡者本人 state，跨回合存活），计数写坏会出现
//      「同一队复活 3、4 次」这种没人会察觉的数值膨胀；
//   3) 回血家族里 9 条 fact 通道，除 143/150/151/159/164 各自盯的机制外，没人验「回血账目本身」——
//      回血量为负、hpAfter 比 hpBefore 还低、实际回血超过声明量，都是纯数值型回归。
// 四条复发信号（只选 fact 自身可定性的判据，不反推每步 maxHp —— 战报不带逐步血量快照，硬凑必误报）：
//   1) 复活公告的回复量非有限数 / ≤0 → 复活量算坏（比 0 更糟的是负数，会直接把血写负）；
//   2) 复活对象不在开局名单（按 uid 对 beforeA/beforeE）→ 名额被召唤物/外来单位吃掉，或 uid 串了；
//   3) 同阵营复活次数超名额上限（团队 1 + 姊强化 reviveCount-1 + 妹独立 1）→ 队伍级计数失效；
//   4) 复活量越界：开战 maxHp 与终局 maxHp 一致的单位，回复量必须落在 [0.30×maxHp-1, maxHp+1]
//      （0.30 = 妹版最低比例；上界 = 100% 满血）。maxHp 战中会变（生生不息/性奋代价等）的单位一律跳过，
//      宁漏勿误（第 89 轮 150 的教训）。
//   5) 回血家族：出现负回血 / 非有限数；带 hpBefore/hpAfter 的，hpAfter 不得 <0、不得 < hpBefore、
//      实际增量不得 > 声明回血量（超过声明 = 重复应用或上限夹取写反）。
// V1.1.0 增补（UNIT_DEATH 单一出口上线后）：
//   6) 死亡登记自身合规：uid/name/reason 齐、camp∈{ally,enemy}、hpAfter≈0、hpBefore≥0。
//      hpAfter>0 就是「带血尸体」——毒 DOT/反弹/反伤/吸血反噬/同归于尽/环境伤害里任何一条自己改血
//      绕过 killUnit 归零，都会在这里现形（该 fact 在战报里是隐藏渲染器，肉眼看不到）。
//   7) 复活时 hpBefore≈0；复活前补账的死亡登记（reason=「复活前补账」）后面必须真有同 uid 复活，
//      否则就是 _pendingDeath 被清掉却没人活过来（待死清理时机错）。
//   8) 静态侧配套：tests/hp-death-exit-guard.mjs 拦「裸写 hp 自减/写 0 / 自己置 _pendingDeath / 自己发死亡事实」。
// 误报规避：本场既无圣火不熄又无回血 fact → skip；配置/增强参数读不到时只跳名额上限判据；
//   妹在不在场只认开局名单的 isXiaoZhaoBrother 标记（拿不到标记就按「可能在」放宽 +1，绝不错杀）。
export const VER = 'tests/health-rules/173-hp-death-revive.js V1.1.0';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';
import { CONFIG, getSkillParams, getBrotherHexEnhance } from '../../core/201-config-5v5-test.js';

// CONFIG.BUFFS 是 getter，数据未就绪会抛 —— 与 147/148/149 同款包一层
function holyCfg() {
    try { return (CONFIG && CONFIG.BUFFS && CONFIG.BUFFS.holyFire) ? CONFIG.BUFFS.holyFire : null; } catch (e) { return null; }
}
function teamCap(units) {
    let cap = 1;
    let hasSister = false, hasBrother = false;
    for (const u of units || []) {
        if (!u) continue;
        if (u.isXiaoZhaoSister) hasSister = true;
        if (u.isXiaoZhaoBrother) hasBrother = true;
    }
    if (hasSister) {
        let enh = null;
        try { enh = (getSkillParams('小昭', 'hexEnhance') || {}).holyFire || null; } catch (e) { enh = null; }
        if (enh && enh.reviveCount != null) cap = Math.max(cap, Number(enh.reviveCount) || cap);
    }
    // 妹的独立名额与团队名额叠加（core/204 L670-680）；开局拿不到「永久圣火」证据时按可能在放宽，
    //   宁可漏报也不把合法复活判成越界。
    if (hasBrother) cap += 1;
    try {
        const bh = getBrotherHexEnhance('holyFire');
        if (bh && bh.reviveCount != null) cap = Math.max(cap, Number(bh.reviveCount) || cap);
    } catch (e) { /* 配置未就绪：保持宽口径 */ }
    return cap;
}
function num(x) { return typeof x === 'number' && isFinite(x); }

const HEAL_TYPES = [FACT_TYPES.HEAL, FACT_TYPES.KUAI_LE_HEAL, FACT_TYPES.ENDLESS_BREATH,
    FACT_TYPES.HOT_BLOOD_HEAL, FACT_TYPES.BLOOD_THIRST_LEECH, FACT_TYPES.WEI_LEECH,
    FACT_TYPES.CLAW_HEAL, FACT_TYPES.FLYER_REGEN, FACT_TYPES.PHANTOM_DISGUISE_HEAL];

function maxHpByUid(units, map) {
    for (const u of units || []) if (u && u.uid != null) map.set(u.uid, u.maxHp);
    return map;
}

export const rule173 = {
    name: '血量/判死/复活闭环(回归)',
    test(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        const list = Array.isArray(facts) ? facts : (ctx && Array.isArray(ctx.facts) ? ctx.facts : []);
        const openHp = maxHpByUid(beforeA, maxHpByUid(beforeE, new Map()));
        const endHp = maxHpByUid(afterA, maxHpByUid(afterE, new Map()));
        const roster = new Map();
        for (const u of beforeA || []) if (u && u.uid != null) roster.set(u.uid, 'ally');
        for (const u of beforeE || []) if (u && u.uid != null) roster.set(u.uid, 'enemy');
        const capA = teamCap(beforeA), capE = teamCap(beforeE);
        const revives = { ally: 0, enemy: 0 };
        const reviveUid = new Map();
        const reviveAt = new Map();      // uid -> 最近一次复活公告在 fact 流里的下标
        const backfills = [];            // 复活前补账的死亡登记（待死未结算）
        let revivesSeen = 0, healsSeen = 0, deathsSeen = 0;

        for (let i = 0; i < list.length; i++) {
            const f = list[i];
            if (!f || !f.factType) continue;
            const d = f.data || {};
            // ---- 死亡登记（UNIT_DEATH 单一出口）----
            //   为什么判这条：所有致死路径（毒 DOT/反弹/反伤/吸血反噬/同归于尽/环境伤害）最终都必须由
            //   resolveDeaths 收口，登记时血已归零；hpAfter>0 说明有一条路径绕过了归零（带血尸体），
            //   而战报不会写这行（render/411 隐藏渲染器），肉眼永远看不到。
            if (f.factType === FACT_TYPES.UNIT_DEATH) {
                deathsSeen++;
                const label = d.name || d.uid || '?';
                if (d.uid == null || !d.name || !d.reason) {
                    return { fail: true, msg: '死亡登记缺身份字段：' + label + '（uid/name/reason 必须齐，否则对不上尸位）' };
                }
                if (d.camp !== 'ally' && d.camp !== 'enemy') {
                    return { fail: true, msg: '死亡登记阵营非法：' + label + ' camp=' + String(d.camp) + '（只允许 ally/enemy）' };
                }
                if (d.hpAfter === undefined || !num(d.hpAfter)) {
                    return { fail: true, msg: '死亡登记缺 hpAfter：' + label + '（无法证明判死时血已归零）' };
                }
                if (d.hpAfter > 0.11 || d.hpAfter < -0.11) {
                    return { fail: true, msg: '死亡登记血量未归零：' + label + ' hpAfter=' + d.hpAfter
                        + '（带血尸体/负血：有致死路径绕过了 killUnit 归零）' };
                }
                if (d.hpBefore !== undefined && (!num(d.hpBefore) || d.hpBefore < -0.11)) {
                    return { fail: true, msg: '死亡登记 hpBefore 非法：' + label + ' hpBefore=' + d.hpBefore };
                }
                if (String(d.reason).includes('复活前补账')) backfills.push({ i, uid: d.uid, name: label });
                continue;
            }
            // ---- 圣火不熄复活 ----
            if (f.factType === FACT_TYPES.SKILL_ANNOUNCE && d.skillName === '圣火不熄') {
                revivesSeen++;
                const camp = d.camp === 'enemy' ? 'enemy' : (d.camp === 'ally' ? 'ally' : null);
                const uid = d.unitUid;
                const n = Number((String(d.note || '').match(/回复\s*([\d.]+)\s*点生命/) || [])[1]);
                if (!num(n) || n <= 0) {
                    return { fail: true, msg: '圣火不熄复活量算坏：' + (d.unitName || uid || '?') + ' 公告回复量="'
                        + (d.note || '').slice(0, 80) + '"（必须为正的有限数；≤0 或解析失败会让复活后直接 0/负血）' };
                }
                if (uid != null && !roster.has(uid)) {
                    return { fail: true, msg: '圣火不熄复活对象不在开局名单（uid=' + uid + ' / ' + (d.unitName || '?')
                        + '）：名额被召唤物或外来单位吃掉，或 uid 串了' };
                }
                if (uid != null && camp && roster.get(uid) !== camp) {
                    return { fail: true, msg: '圣火不熄阵营串了：' + (d.unitName || uid) + ' 公告 camp=' + camp
                        + '，开局名单在 ' + roster.get(uid) + ' 阵营' };
                }
                if (camp) revives[camp]++;
                if (uid != null) reviveUid.set(uid, (reviveUid.get(uid) || 0) + 1);
                if (uid != null) reviveAt.set(uid, i);
                // 复活时血必须已归零（阵亡 → 复活的前置）；hpBefore 非 0 说明待死清理时机错位或血被写负
                if (d.hpBefore !== undefined && (!num(d.hpBefore) || Math.abs(d.hpBefore) > 0.11)) {
                    return { fail: true, msg: '圣火不熄复活时血未归零：' + (d.unitName || uid) + ' hpBefore=' + d.hpBefore
                        + '（应为 0：待死清理/_pendingDeath 时机错，或致死路径没把血夹到 0）' };
                }
                // 复活量越界：只在 maxHp 战中稳定时比（宁漏勿误）
                const mhOpen = openHp.get(uid), mhEnd = endHp.get(uid);
                if (num(mhOpen) && num(mhEnd) && Math.abs(mhOpen - mhEnd) < 1e-6 && mhOpen > 0) {
                    if (n > mhOpen + 1 || n < 0.30 * mhOpen - 1) {
                        return { fail: true, msg: '圣火不熄复活量越界：' + (d.unitName || uid) + ' 回复 ' + n
                            + '，合法区间 [' + (0.30 * mhOpen).toFixed(1) + ', ' + mhOpen.toFixed(1) + ']'
                            + '（比例配置 0.4 / 姊强化 1.0→0.7 / 妹 0.3）' };
                    }
                }
                continue;
            }
            // ---- 回血家族账目自洽 ----
            if (!HEAL_TYPES.includes(f.factType)) continue;
            healsSeen++;
            const vals = ['heal', 'healActual', 'healNominal', 'leech', 'leechVal', 'totalHeal', 'overflowHealed'];
            for (const k of vals) {
                if (d[k] === undefined || d[k] === null) continue;
                if (!num(d[k])) {
                    return { fail: true, msg: String(f.factType) + ' 回血数值非有限数：' + (d.unitName || d.unitUid || '?')
                        + ' 的 ' + k + '=' + d[k] };
                }
                if (d[k] < 0) {
                    return { fail: true, msg: String(f.factType) + ' 出现负回血：' + (d.unitName || d.unitUid || '?')
                        + ' 的 ' + k + '=' + d[k] + '（回血只能 ≥0，负数会把血写负/直接判死）' };
                }
            }
            if (d.hpBefore !== undefined && d.hpAfter !== undefined) {
                if (!num(d.hpBefore) || !num(d.hpAfter)) {
                    return { fail: true, msg: String(f.factType) + ' 血量账目非有限数：' + (d.unitName || d.unitUid || '?')
                        + ' hpBefore=' + d.hpBefore + ' hpAfter=' + d.hpAfter };
                }
                if (d.hpAfter < 0) {
                    return { fail: true, msg: String(f.factType) + ' 回血后血量 <0：' + (d.unitName || d.unitUid || '?')
                        + ' hpAfter=' + d.hpAfter };
                }
                if (d.hpAfter < d.hpBefore - 0.35) {
                    return { fail: true, msg: String(f.factType) + ' 回血后血量反而下降：' + (d.unitName || d.unitUid || '?')
                        + ' hpBefore=' + d.hpBefore + ' → hpAfter=' + d.hpAfter };
                }
                if (num(d.heal) && d.hpAfter - d.hpBefore > d.heal + 1.05) {
                    return { fail: true, msg: String(f.factType) + ' 实际回血超过声明量：' + (d.unitName || d.unitUid || '?')
                        + ' 声明 ' + d.heal + '，实际 ' + (d.hpAfter - d.hpBefore).toFixed(2)
                        + '（重复应用或上限夹取写反；容差 1.05 是给显示层取整留的）' };
                }
            }
        }

        // ---- 待死被清掉但没活过来：复活前补账的死亡登记后面必须真有同 uid 的复活公告 ----
        //   补账的语义是「_pendingDeath 待死未结算，被复活流程先记一笔死亡」；如果后面没有同 uid 复活，
        //   说明待死标记被清但 reviveHolyFireUnit 没落地 —— 血停在 0、alive 还是 false，战报只剩一句公告。
        for (const b of backfills) {
            const ri = reviveAt.get(b.uid);
            if (ri == null || ri <= b.i) {
                return { fail: true, msg: '待死被清掉但没复活：' + b.name + '（复活前补账 @' + b.i
                    + '，之后无同 uid 圣火不熄公告：_pendingDeath 清理时机错）' };
            }
        }

        // ---- 每阵营复活次数上限（放在最后，先保证单条 fact 自身没坏）----
        if (revivesSeen > 0) {
            if (revives.ally > capA) {
                return { fail: true, msg: '己方复活 ' + revives.ally + ' 次，超名额上限 ' + capA
                    + '（团队 1 + 姊强化 + 妹独立 1；_holyFireUses 队伍级求和失效）' };
            }
            if (revives.enemy > capE) {
                return { fail: true, msg: '敌方复活 ' + revives.enemy + ' 次，超名额上限 ' + capE
                    + '（团队 1 + 姊强化 + 妹独立 1）' };
            }
        }
        if (revivesSeen === 0 && healsSeen === 0 && deathsSeen === 0) return 'skip';
        return { fail: false };
    }
};
