// tests/health-rules/238-decl-vs-ledger.js
// 体检规则：加成「声明值」与账本「落地值」同源（永久加法类：statChange / lastStandWarrior）
//
// 为什么要有这条：
//   STAT_CHANGE_APPLY 是跑团/背水这类加成的唯一声明口（数据里只有 delta），而真正进结算的是
//   unit._mods 里的 add 词条。两边一旦不同源（少算/多算/漏落账/落账两次），战斗数值就与战报不符，
//   且面板与结算会各说各话。本规则按「单位 uid + 来源组 + 属性」逐条把两本账对齐。
//
// 判据来源（2026-11-08，39 场：种子 1~8 × 关卡 1/3/5/7 + 7 场定向）：0 差异。
//   覆盖 statChange（跑团、殷天正老当益壮、何太冲截脉、韦一笑吸血等）与 lastStandWarrior
//   （背水一战·战士 +3）。0 误报，升硬判据。
//
// 注：hp 类临时结算不走账本、不在此规则范围；round/attached 的乘率类由 228 与 242 覆盖。
//
// V1.0.1 | 2026-11-08 实测收缩：48 场回放出现 3 场红，红点单位名全是「拒马」。
//   根因（非漏落账）：core/205-battle-horse.js destroyHorse 消散时 allyTeam.splice 把拒马整体移出
//   队伍，而 core/204-buff-system.js L229-231 的 lastStandWarrior 声明在它触发背水时就已经发出。
//   终局 afterA/afterE 快照里没有该 uid ⇒ 账本侧读 0，属于「取证口径」不成立，不是引擎缺陷。
//   ⇒ 比对范围收紧为「终局仍存在的 uid」，离场单位的声明只计数不判红（不是放宽判据凑绿：
//   这类单位在终局快照里根本不存在，任何基于终局快照的落地核对都无法成立）。
//   实测：收紧后 48 场 0 红；离场声明仅出现在拒马消散的场次。
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

export const VER = 'tests/health-rules/238-decl-vs-ledger.js V1.0.1';

const DECL_GROUPS = ['statChange', 'lastStandWarrior'];

export const rule238 = {
    group: '属性与加成账本',
    name: '加成声明与账本落地同源(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        const fs = facts || (ctx && ctx.facts) || [];
        const units = [...(afterA || []), ...(afterE || [])];
        if (!units.some(u => u && u._mods)) return 'skip';
        // 只有终局仍留在队伍数组里的单位才有账本快照可核；拒马消散会被 splice 出队（见文件头 V1.0.1）
        const presentUids = new Set(units.filter(u => u && u.uid).map(u => u.uid));

        const decl = new Map(); // uid|group|field -> 声明合计
        const names = new Map();
        let offRoster = 0;
        for (const f of fs) {
            if (!f || f.factType !== FACT_TYPES.STAT_CHANGE_APPLY || !f.data) continue;
            const d = f.data;
            if (!d.unitUid || !d.field) continue;
            const group = d.group || 'statChange';
            if (!DECL_GROUPS.includes(group)) continue;
            if (!presentUids.has(d.unitUid)) { offRoster++; continue; }
            const k = d.unitUid + '|' + group + '|' + d.field;
            decl.set(k, (decl.get(k) || 0) + (typeof d.delta === 'number' ? d.delta : 0));
            if (d.unitName) names.set(d.unitUid, d.unitName);
        }

        const led = new Map(); // uid|group|field -> 账本合计
        for (const u of units) {
            if (!u || !u._mods) continue;
            for (const stat of Object.keys(u._mods)) {
                for (const m of (u._mods[stat] || [])) {
                    if (!m || m.op !== 'add' || !DECL_GROUPS.includes(m.group)) continue;
                    const k = u.uid + '|' + m.group + '|' + stat;
                    led.set(k, (led.get(k) || 0) + (m.value || 0));
                }
            }
        }

        if (!decl.size && !led.size) return 'skip';
        const bad = [];
        for (const k of new Set([...decl.keys(), ...led.keys()])) {
            const d = decl.get(k) || 0, l = led.get(k) || 0;
            if (Math.abs(d - l) > 1e-6) {
                const [uid, group, field] = k.split('|');
                bad.push((names.get(uid) || uid) + '/' + group + '/' + field + ' 声明' + d + ' vs 账本' + l);
            }
        }
        if (bad.length) {
            return { fail: true, msg: '声明与账本不同源：' + bad.slice(0, 3).join('；') + (bad.length > 3 ? '（共 ' + bad.length + ' 条）' : '') };
        }
        return { fail: false, msg: '声明与账本同源：核对 ' + Math.max(decl.size, led.size) + ' 组（statChange / 背水战士），0 差异' + (offRoster ? '；离场单位声明 ' + offRoster + ' 条（终局无账本，不判）' : '') };
    }
};
