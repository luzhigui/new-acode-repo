#!/usr/bin/env node
// tests/d6-summon-case.mjs | V1.0.0 | 2026-11-08
// D6 召唤物与附身窗口（325-329 线）定向用例：给五条规则喂**构造事实**，正向（应 pass）与负向（应 fail）
// 各跑一遍，证明规则有牙、不是恒绿；不跑整局、不开浏览器。
// 用法：node tests/d6-summon-case.mjs    全绿 exit 0；任一条判错 exit 1
export const VER = 'tests/d6-summon-case.mjs V1.0.0';

import { FACT_TYPES as FT } from '../infra/106-battle-enums.js';
import { rule325 } from './health-rules/325-d6-butterfly-host-cleanup.js';
import { rule326 } from './health-rules/326-d6-butterfly-window-payload.js';
import { rule327 } from './health-rules/327-d6-summon-authorship.js';
import { rule328 } from './health-rules/328-d6-summon-death-exit.js';
import { rule329 } from './health-rules/329-d6-roster-stats-purity.js';

const cases = [];
function expect(name, rule, ctx, beforeA, beforeE, afterA, afterE, want) {
    let got;
    try { got = rule.test(ctx, [], beforeA, beforeE, afterA, afterE); }
    catch (e) { got = { fail: true, msg: '抛错: ' + e.message }; }
    const isFail = got && typeof got === 'object' && got.fail === true;
    const isSkip = got === 'skip';
    const ok = want === 'pass' ? (!isFail && !isSkip) : (want === 'skip' ? isSkip : isFail);
    cases.push({ name, want, ok, got });
}

const RS = (r) => ({ factType: FT.ROUND_START, data: { round: r } });
const ATTACH = (sis, host) => ({ factType: FT.BUTTERFLY_ATTACH, data: { sisterUid: sis, sisterName: '小昭·姊', hostUid: host, hostName: '宿主' } });
const RETURN = (sis, host) => ({ factType: FT.BUTTERFLY_RETURN, data: { sisterUid: sis, hostUid: host } });
const HOST_DEAD = (sis, host) => ({ factType: FT.BUTTERFLY_HOST_DEAD, data: { sisterUid: sis, hostUid: host } });
const NO_HOST = (sis) => ({ factType: FT.BUTTERFLY_NO_HOST, data: { sisterUid: sis, unitName: '小昭·姊' } });
const REVIVE = (uid) => ({ factType: FT.SKILL_ANNOUNCE, data: { skillName: '圣火不熄', camp: 'ally', reviveSlot: 'team', reviveTier: 1, reviveRatio: 1, healAmount: 100, healUnitUid: uid } });
const SUMMON = (o) => ({ factType: FT.SUMMON_UNIT, data: Object.assign({ summonName: '幼狮', summonUid: 's1', pos: 5 }, o) });
const DEATH = (uid, reason) => ({ factType: FT.UNIT_DEATH, data: { uid: uid, name: '幼狮', camp: 'ally', reason: reason || '死亡结算', hpBefore: 10, hpAfter: 0 } });
const ATK_KILL = (uid) => ({ factType: FT.ATTACK, data: { attacker: { uid: 'e1', name: '敌' }, target: { uid: uid, name: '幼狮' }, dmg: 99, dmgResult: { dead: true } } });

const ally = [
    { uid: 'sis', camp: 'ally', isXiaoZhaoSister: true, alive: true },
    { uid: 'h1', camp: 'ally', name: '张无忌', alive: true, _mods: {} },
    { uid: 'mj', camp: 'ally', name: '灭绝师太', alive: true },
    { uid: 's1', camp: 'ally', name: '幼狮', isSummon: true, alive: true }
];

const butterflyMods = { atk: [{ group: 'butterfly', source: '蝶变附身', value: 30 }], def: [{ group: 'butterfly', source: '蝶变附身', value: 10 }], maxHp: [{ group: 'butterfly', source: '蝶变附身', value: 50 }] };
const hostWithMods = () => ({ uid: 'h1', camp: 'ally', name: '张无忌', alive: true, _mods: butterflyMods });
const hostClean = () => ({ uid: 'h1', camp: 'ally', name: '张无忌', alive: true, _mods: {} });

// ── 322 附身关窗后宿主词条清理 ─────────────────────────────────────────
expect('325 正向·宿主阵亡无残留', rule325,
    { facts: [RS(1), ATTACH('sis', 'h1'), HOST_DEAD('sis', 'h1')] }, ally, [], [hostClean()], [], 'pass');
expect('325 负向·宿主阵亡后被圣火复活仍吃加成', rule325,
    { facts: [RS(1), ATTACH('sis', 'h1'), HOST_DEAD('sis', 'h1'), REVIVE('h1')] }, ally, [], [hostWithMods()], [], 'fail');
expect('325 跳过·无附身', rule325, { facts: [RS(1)] }, ally, [], [hostClean()], [], 'skip');

// ── 323 关窗载荷与尸体路径 ─────────────────────────────────────────────
expect('326 正向·正常飞回 uid 对齐', rule326,
    { facts: [RS(1), ATTACH('sis', 'h1'), RETURN('sis', 'h1')] }, ally, [], [hostClean()], [], 'pass');
expect('326 负向·飞回宿主 uid 不符', rule326,
    { facts: [RS(1), ATTACH('sis', 'h1'), RETURN('sis', 'h2')] }, ally, [], [hostClean()], [], 'fail');
expect('326 负向·窗口开着却报无宿主', rule326,
    { facts: [RS(1), ATTACH('sis', 'h1'), NO_HOST('sis')] }, ally, [], [hostClean()], [], 'fail');
expect('326 负向·宿主阵亡 uid 不属于己方', rule326,
    { facts: [RS(1), ATTACH('sis', 'ghost'), HOST_DEAD('sis', 'ghost')] }, ally, [], [hostClean()], [], 'fail');

// ── 324 召唤者身份归属 ─────────────────────────────────────────────────
expect('327 正向·具名召唤 byName 与 uid 一致', rule327,
    { facts: [RS(1), SUMMON({ byName: '灭绝师太', byUid: 'mj' })] }, ally, [], ally, [], 'pass');
expect('327 负向·byName 与实际召唤者不符', rule327,
    { facts: [RS(1), SUMMON({ byName: '周芷若', byUid: 'mj' })] }, ally, [], ally, [], 'fail');
expect('327 负向·byUid 指向另一只召唤物', rule327,
    { facts: [RS(1), SUMMON({ summonUid: 's1', byName: '幼狮', byUid: 's0' }),
              SUMMON({ summonUid: 's0', summonName: '雄狮', byName: '谢逊', byUid: 'mj' })] }, ally, [], ally, [], 'fail');
expect('327 正向·召唤者是召唤物但归属名一致（谢逊召幼狮）', rule327,
    { facts: [RS(1), SUMMON({ summonUid: 's0', summonName: '金毛狮王谢逊', byName: '灭绝师太', byUid: 'mj' }),
              SUMMON({ summonUid: 's1', summonName: '幼狮', byName: '金毛狮王谢逊', byUid: 's0' })] }, ally, [], ally, [], 'pass');
expect('327 正向·团队补召标签（众志成城，无 byUid）', rule327,
    { facts: [RS(1), SUMMON({ summonName: '补员', byName: '众志成城' })] }, ally, [], ally, [], 'pass');
expect('327 负向·有 byName 却非团队标签', rule327,
    { facts: [RS(1), SUMMON({ byName: '野生标签' })] }, ally, [], ally, [], 'fail');
expect('327 正向·团队级召唤无归属（副将雄鹰）只观察', rule327,
    { facts: [RS(1), SUMMON({ summonName: '雄鹰', summonUid: 'eagle9' })] }, ally, [], ally, [], 'pass');

// ── 325 召唤物阵亡单一出口 ─────────────────────────────────────────────
expect('328 正向·被打死且恰一条 UNIT_DEATH', rule328,
    { facts: [RS(1), SUMMON({}), ATK_KILL('s1'), DEATH('s1')] }, ally, [], ally, [], 'pass');
expect('328 负向·被打死却没有 UNIT_DEATH', rule328,
    { facts: [RS(1), SUMMON({}), ATK_KILL('s1')] }, ally, [], ally, [], 'fail');
expect('328 负向·UNIT_DEATH 重复落账', rule328,
    { facts: [RS(1), SUMMON({}), ATK_KILL('s1'), DEATH('s1'), DEATH('s1')] }, ally, [], ally, [], 'fail');
expect('328 负向·召唤物走复活前补账出口', rule328,
    { facts: [RS(1), SUMMON({}), ATK_KILL('s1'), DEATH('s1', '复活前补账（待死未结算）')] }, ally, [], ally, [], 'fail');

// ── 326 统计口径与虚假单位隔离 ─────────────────────────────────────────
expect('329 正向·开局名单纯净且终局标记齐', rule329,
    { facts: [RS(1), SUMMON({})] }, ally.filter(u => u.uid !== 's1'), [], ally, [], 'pass');
expect('329 负向·开局名单混入召唤物', rule329,
    { facts: [RS(1), SUMMON({})] }, ally, [], ally, [], 'fail');
expect('329 负向·终局召唤物丢 isSummon 标记', rule329,
    { facts: [RS(1), SUMMON({})] }, ally.filter(u => u.uid !== 's1'), [],
    [{ uid: 's1', camp: 'ally', name: '幼狮', alive: true }], [], 'fail');

let bad = 0;
for (const c of cases) {
    if (!c.ok) {
        bad++;
        console.log(`❌ ${c.name}：期望 ${c.want}，实得 ${JSON.stringify(c.got)}`);
    }
}
if (bad) { console.log(`❌ D6 定向用例失败 ${bad}/${cases.length} 项`); process.exit(1); }
console.log(`✅ D6 定向用例全部通过（${cases.length} 项：325/326/327/328/329 各含正向、负向、边界）`);
