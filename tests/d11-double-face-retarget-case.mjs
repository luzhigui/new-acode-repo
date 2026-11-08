// tests/d11-double-face-retarget-case.mjs | 2026-11-08（D11 控制与意识·女装专项定向用例）
// 规则 294 的「有牙」定向取证：合成 fact，不跑整局对局。
//   正例 ① 正常改打攻击方自己队友 → 必须绿；
//   正例 ② 攻击方身边确实无队友、本击落空 → 必须绿；
//   反例 ③ 改目标后仍打敌方 → 必须红；
//   反例 ④ 女装期她本人成为最终目标 → 必须红；
//   反例 ⑤ 留痕挂空（有 phantomConfuse 但没有对应一击）→ 必须红；
//   反例 ⑥ 报「身边已无可替之人」但账面还有活队友 → 必须红。
// 跑法：node tests/d11-double-face-retarget-case.mjs
export const VER = 'tests/d11-double-face-retarget-case.mjs V1.0.0';

import { rule294 } from './health-rules/294-double-face-retarget.js';
import { FACT_TYPES, CAMP_TYPES } from '../infra/106-battle-enums.js';

const FT = FACT_TYPES;
const A = CAMP_TYPES.ALLY;
const E = CAMP_TYPES.ENEMY;

const mk = (name, uid, camp) => ({
    name, uid, camp, alive: true, pos: uid, role: '', hp: 100, maxHp: 100, state: {}
});

function unit(u) {
    return { uid: u.uid, name: u.name, camp: u.camp, alive: true, pos: u.pos, hp: u.hp, maxHp: u.maxHp, state: {} };
}

function dressFacts(round, noteText) {
    return [
        { factType: FT.ROUND_START, data: { round } },
        { factType: FT.SKILL_ANNOUNCE, data: { skillName: '双面观音', unitName: '彭莹玉', unitUid: 100, camp: E, note: noteText } }
    ];
}

function phantom(attacker, targetName, extra) {
    return Object.assign({
        factType: FT.PHANTOM_CONFUSE,
        data: {
            unitName: attacker.name, deceiver: '彭莹玉', targetName,
            sourceSkill: '双面观音', deceiverUid: 100, deceiverCamp: E, deceiverPos: 7
        }
    }, extra || {});
}

function attack(attacker, target, withPhantom) {
    const data = { attacker: unit(attacker), target: unit(target) };
    if (withPhantom) data.phantomFact = phantom(withPhantom.attacker || attacker, withPhantom.targetName || target.name);
    return { factType: FT.ATTACK, data };
}

function empty(attacker, reason) {
    return { factType: FT.EMPTY_TARGET, data: { attacker: unit(attacker), reason } };
}

function run(name, facts, beforeA, beforeE, expectFail) {
    const r = rule294.test({}, [], beforeA, beforeE, beforeA, beforeE, facts);
    const failed = !!(r && typeof r === 'object' && r.fail);
    const skip = r === 'skip';
    const ok = skip ? false : (failed === expectFail);
    console.log((ok ? '✅' : '❌') + ' ' + name + ' → ' + (skip ? 'skip' : (failed ? '红' : '绿'))
        + (ok ? '' : '（期望 ' + (expectFail ? '红' : '绿') + '）'));
    if (!ok) {
        console.log('   ' + JSON.stringify(r));
        return 1;
    }
    return 0;
}

const song = mk('宋青书', 1, A);
const wuji = mk('张无忌', 2, A);
const peng = mk('彭莹玉', 100, E);
const miejue = mk('灭绝', 101, E);

let bad = 0;
const ON = '彭莹玉 女装上阵，众人不忍下手（2 回合）。';

// 正例 ①：选中她 → 改打攻击方自己队友（facts 已按 collectFacts 口径展平，phantom 单独一条）
bad += run('① 正常改打自己队友', [
    ...dressFacts(1, ON),
    attack(song, wuji, { targetName: '张无忌' }),
    phantom(song, '张无忌')
], [song, wuji], [peng, miejue], false);

// 正例 ②：攻击方身边无队友，本击落空
bad += run('② 无队友→落空', [
    ...dressFacts(1, ON),
    empty(song, '彭莹玉女装，不忍下手，身边已无可替之人')
], [song], [peng], false);

// 反例 ③：改后仍打敌方
bad += run('③ 改后仍打敌方', [
    ...dressFacts(1, ON),
    attack(song, miejue, { targetName: '灭绝' }),
    phantom(song, '灭绝')
], [song, wuji], [peng, miejue], true);

// 反例 ④：女装期她本人成为最终目标
bad += run('④ 女装期她被打', [
    ...dressFacts(1, ON),
    attack(song, peng)
], [song, wuji], [peng, miejue], true);

// 反例 ⑤：留痕挂空（有 phantom，没有对应一击）
bad += run('⑤ 留痕挂空', [
    ...dressFacts(1, ON),
    phantom(song, '张无忌')
], [song, wuji], [peng, miejue], true);

// 反例 ⑥：报「身边已无可替之人」但账面还有活队友
bad += run('⑥ 无人可替却还有队友', [
    ...dressFacts(1, ON),
    empty(song, '彭莹玉女装，不忍下手，身边已无可替之人')
], [song, wuji], [peng, miejue], true);

// 正例 ⑦：窗口外（已到期）的一击不再按女装规则判 → 规则 skip 或绿（此处不出现女装事实则 skip）
if (bad === 0) {
    console.log('\n定向用例全部通过：规则 294 有牙（=== 正例绿 / !== 反例红）');
} else {
    console.log('\n定向用例失败 ' + bad + ' 项');
    process.exitCode = 1;
}
