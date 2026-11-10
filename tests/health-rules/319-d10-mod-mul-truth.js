// tests/health-rules/319-d10-mod-mul-truth.js
// 体检规则：乘率词条「配置真值 ↔ 账本实值」逐条对账（词条装备与套装域 D14）
//
// 为什么要有这条（对账口径）：
//   228 只看「声明 fact 里的 ratio 是否等于配置」，238 只看两类 add 词条；**账本里 op:'mul' 的
//   乘率词条从来没有和 content 配置逐条对过**。声明对了、addMod 入参写错，就是静默失效：
//   战报写「攻击 +25%」，getStat 实际按 0.40 乘，规则全绿。
//   本条以账本为唯一被检对象，逐 group/逐属性比对 001/002 配置（含姊版/妹版分支）。
//
// 覆盖 group（来源已逐条读码确认）：
//   holyFlame   core/215 L67/L71（atk 命中列 / def 命中行，姊强化切换 002 sister.holyFlame）
//   soulDrain   core/204 applySoulDrain（atk 按人数递减栅格 / def 按回合指数，姊版同切）
//   unity       core/204 L255-256（档位表）
//   lastStand   core/204 L208/L213（atk 基础/姊版，def −defPenalty）
//   brotherLastStand modules/324 L32-33（妹永久背水，直接用 CONFIG.BUFFS.lastStand）
//   fortify(仅 mul) core/215 L26 严阵以待 def；同 group 下的 add（坚盾 L313）不在本条判据内
//
// 误报规避：
//   - 只判 op === 'mul' 的词条；add 词条（坚盾/战士/成长）归 321/322；
//   - 配置缺键 → 该 group 直接跳过，不猜；
//   - soulDrain 的 def 是回合指数：允许 1~20 回合内的任一档（终局只知道收尾那一档）；
//   - 顶点 20 人均在栅格内，超出范围不判（避免有限枚举误伤）。
// 返回契约：{ fail:true, msg } = 失败；'skip' / 'pass' = 通过。
export const VER = 'tests/health-rules/319-d10-mod-mul-truth.js V1.0.0';
import { CONFIG, getSisterHexEnhance } from '../../core/201-config-5v5-test.js';

const EPS = 1e-9;
const near = (a, b) => typeof a === 'number' && isFinite(a) && Math.abs(a - b) <= EPS;
const inSet = (v, set) => set.some((x) => typeof x === 'number' && isFinite(x) && near(v, x));

function buffCfg(key) {
    try { return CONFIG.BUFFS ? (CONFIG.BUFFS[key] || null) : null; } catch (e) { return null; }
}
function sisterCfg(key) {
    try { return getSisterHexEnhance(key) || null; } catch (e) { return null; }
}

export const rule319 = {
    group: '词条装备与套装',
    name: '乘率词条账本vs配置真值',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE) {
        const tail = [...(afterA || []), ...(afterE || [])];
        if (!tail.some((u) => u && u._mods)) return 'skip';

        const HF = buffCfg('holyFlame');
        const SD = buffCfg('soulDrain');
        const UN = buffCfg('unity');
        const LS = buffCfg('lastStand');
        const FT = buffCfg('fortify');
        const HF_S = sisterCfg('holyFlame');
        const SD_S = sisterCfg('soulDrain');
        const LS_S = sisterCfg('lastStand');

        const soulAtk = [];
        if (SD && typeof SD.atkBonus === 'number' && typeof SD.perUnitBonus === 'number') {
            for (let n = 0; n <= 20; n++) soulAtk.push(SD.atkBonus - SD.perUnitBonus * n);
        }
        if (SD_S && typeof SD_S.atkBonus === 'number' && typeof SD_S.perUnitBonus === 'number') {
            for (let n = 0; n <= 20; n++) soulAtk.push(SD_S.atkBonus - SD_S.perUnitBonus * n);
        }
        const soulDef = [];
        for (const c of [SD, SD_S]) {
            if (!c || typeof c.defBonus !== 'number' || typeof c.perRoundBonus !== 'number') continue;
            for (let r = 1; r <= 20; r++) {
                soulDef.push((1 + c.defBonus) * Math.pow(1 + c.perRoundBonus, r - 1) - 1);
            }
        }

        function allowed(group, stat) {
            if (group === 'holyFlame') {
                if (!HF) return null;
                const base = stat === 'def' ? HF.defBonus : HF.atkBonus;
                const sis = HF_S ? (stat === 'def' ? HF_S.defBonus : HF_S.atkBonus) : null;
                return [base, sis].filter((x) => typeof x === 'number');
            }
            if (group === 'soulDrain') return stat === 'def' ? soulDef : soulAtk;
            if (group === 'unity') {
                if (!UN || !Array.isArray(UN.tiers)) return null;
                return UN.tiers.map((t) => (stat === 'def' ? t.defBonus : t.atkBonus)).filter((x) => typeof x === 'number');
            }
            if (group === 'lastStand') {
                if (!LS) return null;
                if (stat === 'def') {
                    const p = typeof LS.defPenalty === 'number' ? LS.defPenalty : 0.2;
                    return [-p];
                }
                return [LS.atkBonus, LS_S ? LS_S.atkBonus : null].filter((x) => typeof x === 'number');
            }
            if (group === 'brotherLastStand') {
                if (!LS) return null;
                if (stat === 'def') {
                    const p = typeof LS.defPenalty === 'number' ? LS.defPenalty : 0.2;
                    return [-p];
                }
                return typeof LS.atkBonus === 'number' ? [LS.atkBonus] : null;
            }
            if (group === 'fortify') {
                if (!FT || typeof FT.defBonus !== 'number') return null;
                return stat === 'def' ? [FT.defBonus] : null;
            }
            return null;
        }

        const bad = [];
        let scanned = 0, checked = 0;
        for (const u of tail) {
            if (!u || !u._mods || typeof u._mods !== 'object') continue;
            const who = u.name || u.uid;
            for (const stat of ['atk', 'def', 'maxHp']) {
                for (const m of (u._mods[stat] || [])) {
                    scanned++;
                    if (!m || m.op !== 'mul' || typeof m.value !== 'number' || !isFinite(m.value)) continue;
                    const set = allowed(m.group, stat);
                    if (!set || set.length === 0) continue;
                    checked++;
                    if (!inSet(m.value, set)) {
                        bad.push(`${who} ${stat}（${m.group}）账本 ${m.value} 不在配置集合 {${set.map((x) => (+x.toFixed(6))).join('/')}}`);
                    }
                }
            }
        }
        if (scanned === 0) return 'skip';
        // ★ V1.2.0（第 200 轮）：msg 只留「可定位的短前缀 + 被测单位」，数值集合与账本值降为明细。
        //   V1.1.0 分 group 之后仍剩 3 种子病因，逐条查明**不是三种病因**，而是同一条判据的三种写法：
        //     ① 单位名 `u#` / `u##` / `u###`（实体名长度不同）被当成不同指纹；
        //     ② 配置集合 `{#/#/#/#/…}` 的**档位数**随配置版本变化（soulDrain 实测 11 档），
        //        但「账本值不在配置集合里」这一病因与档位数无关。
        //   修法：msg 固定为「口径 · 统计项 · group」，单位名与两串数值一律放明细且**限长**，
        //   并明确给出「集合档位数」这个真正有用的量（档位数进明细，不进指纹）。
        //   判据（allowed / inSet / 过滤条件 / 计数）一字未动，只把「怎么报」拆成「病因头 + 明细」。
        const pf = (g) => bad.filter((x) => x.indexOf('（' + g + '）') >= 0);
        const tail4 = (part) => part.slice(0, 4).join('；') + (part.length > 4 ? `（共 ${part.length} 条）` : '');
        // 明细只留「谁 · 统计项 · 实值 vs 档位数」——数值集合本身不再进 msg（它是配置版本，不是病因）
        const detail = (part) => part.slice(0, 4).map((x) => {
            const m = x.match(/^(\S+) (atk|def|maxHp)（([^）]+)）账本 (\S+) 不在配置集合 \{(.*)\}$/);
            if (!m) return x.slice(0, 40);
            const cnt = m[4] === '' ? 0 : m[4].split('/').length;
            return m[1] + ' · ' + m[2] + ' · 账本 ' + m[3] + ' 不在 ' + cnt + ' 档配置里';
        }).join('；') + (part.length > 4 ? `（共 ${part.length} 条）` : '');
        const bHoly = pf('holyFlame');
        if (bHoly.length) return { fail: true, msg: '乘率词条与配置不同源·圣火不熄：' + detail(bHoly) };
        const bSoul = pf('soulDrain');
        if (bSoul.length) return { fail: true, msg: '乘率词条与配置不同源·摄魂：' + detail(bSoul) };
        const bUnity = pf('unity');
        if (bUnity.length) return { fail: true, msg: '乘率词条与配置不同源·众志成城：' + detail(bUnity) };
        const bLast = pf('lastStand');
        if (bLast.length) return { fail: true, msg: '乘率词条与配置不同源·背水一战：' + detail(bLast) };
        const bBro = pf('brotherLastStand');
        if (bBro.length) return { fail: true, msg: '乘率词条与配置不同源·妹永久背水：' + detail(bBro) };
        const bFort = pf('fortify');
        if (bFort.length) return { fail: true, msg: '乘率词条与配置不同源·严阵以待：' + detail(bFort) };
        if (bad.length) {
            return { fail: true, msg: '乘率词条与配置不同源：' + bad.slice(0, 4).join('；') + (bad.length > 4 ? `（共 ${bad.length} 条）` : '') };
        }
        if (checked === 0) return 'skip';
        return { fail: false, msg: `乘率词条与配置逐条一致：比对 ${checked} 条（扫描 ${scanned} 条）` };
    }
};
