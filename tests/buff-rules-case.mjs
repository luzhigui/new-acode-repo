// buff/debuff 体检规则的正反用例（227 生命周期 / 228 加成声明对账）。
// 目的：证明两条规则既会报（负向）也不会乱报（正向），且覆盖回放里没命中的「小昭·姊强化」分支。
// 用法：node tests/buff-rules-case.mjs   （退出码 0 = 全对）
import { fileURLToPath } from 'node:url';

globalThis.fetch = async (url) => {
    const fs = await import('node:fs');
    const p = fileURLToPath(new URL(url));
    const text = fs.readFileSync(p, 'utf8');
    return { ok: true, json: async () => JSON.parse(text) };
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.self = globalThis;

const { loadGameData, loadHexEnhanceData } = await import('../core/201-config-5v5-test.js');
await loadGameData();
await loadHexEnhanceData();

const { FACT_TYPES, CAMP_TYPES, BUFF_TYPES } = await import('../infra/106-battle-enums.js');
const { rule227 } = await import('./health-rules/227-buff-lifecycle.js');
const { rule228 } = await import('./health-rules/228-buff-effect-decl.js');

const R = (n) => ({ factType: FACT_TYPES.ROUND_START, data: { round: n } });
const S = (key, camp, rem) => ({ factType: FACT_TYPES.BUFF_SUMMARY, data: { buff: { key: key, remaining: rem, target: camp } } });
const AP = (type, uid, camp, field, ratio) => ({ factType: type, data: { unitUid: uid, unitName: uid, camp: camp, field: field, op: 'mul', ratio: ratio } });
const sisterTeam = [{ name: '小昭·姊', isXiaoZhaoSister: true, alive: true }];

let bad = 0;
function expect(name, got, want) {
    const ok = got === want;
    if (!ok) bad++;
    console.log(`${ok ? '✅' : '❌'} ${name} → ${got}${ok ? '' : '（期望 ' + want + '）'}`);
}
function expectFail(name, got, mustContain) {
    const ok = got !== 'pass' && got !== 'skip' && got.indexOf(mustContain) >= 0;
    if (!ok) bad++;
    console.log(`${ok ? '✅' : '❌'} ${name} → ${got}`);
}

// ---------- 227 生命周期 ----------
{
    const facts = [R(1), S('holyFlame', 'ally', 4), R(2), S('holyFlame', 'ally', 3), R(3), S('holyFlame', 'ally', 2), R(4), S('holyFlame', 'ally', 1), R(5)];
    expect('227 正常递减到到期消失', rule227.test({ facts: facts }), 'pass');
}
{
    const facts = [R(1), S('holyFlame', 'ally', 4), R(2), S('holyFlame', 'ally', 2)];
    expectFail('227 一回合扣多回合', rule227.test({ facts: facts }), '跳减');
}
{
    const facts = [R(1), S('holyFlame', 'ally', 1), R(2), S('holyFlame', 'ally', 1)];
    expectFail('227 剩余 1 仍在下一回合', rule227.test({ facts: facts }), '到期未清理');
}
{
    const facts = [R(1), S('holyFlame', 'ally', 7)];
    expectFail('227 初值超出配置时长', rule227.test({ facts: facts }), '初值');
}
{
    const facts = [R(1), S('fortify', 'ally', Infinity), R(2), S('fortify', 'ally', Infinity)];
    expect('227 无限时长不参与递减', rule227.test({ facts: facts }), 'pass');
}
{
    const facts = [R(1), S('holyFlame', 'ally', 4), R(2), S('holyFlame', 'ally', 3), R(3), R(4), S('holyFlame', 'ally', 4)];
    expect('227 到期后重新抽到 = 新实例', rule227.test({ facts: facts }), 'pass');
}

// ---------- 228 加成声明 ----------
// 全合法：姊在场 + 圣火令团队版（0.25）、众志成城 5 人档（0.1/0.2）、摄魂基础降防（第1回合 -0.1）、背水一战 0.1
{
    const facts = [
        R(1),
        S('holyFlame', 'ally', 4),
        AP(FACT_TYPES.HOLY_FLAME_APPLY, 'u1', 'ally', 'atk', 0.25),
        S('unity', 'ally', 3),
        AP(FACT_TYPES.UNITY_APPLY, 'u1', 'ally', 'atk', 0.1),
        AP(FACT_TYPES.UNITY_APPLY, 'u1', 'ally', 'def', 0.2),
        S('soulDrain', 'enemy', 4),
        AP(FACT_TYPES.SOUL_DRAIN_APPLY, 'u1', 'ally', 'atk', -0.3),
        AP(FACT_TYPES.SOUL_DRAIN_APPLY, 'u1', 'ally', 'def', -0.1),
        S('lastStand', 'ally', 35),
        AP(FACT_TYPES.LAST_STAND_APPLY, 'u2', 'ally', 'atk', 0.1),
        AP(FACT_TYPES.LAST_STAND_APPLY, 'u2', 'ally', 'def', -0.2)
    ];
    expect('228 全部合法声明', rule228.test({ facts: facts, beforeA: sisterTeam, beforeE: [] }), 'pass');
}
{
    // 姊在场 + 团队圣火令 → 必须 0.25，声明成基础 0.30 就是强化接线断了
    const facts = [R(1), S('holyFlame', 'ally', 4), AP(FACT_TYPES.HOLY_FLAME_APPLY, 'u1', 'ally', 'atk', 0.3)];
    expectFail('228 姊强化被吞（圣火令仍 0.30）', rule228.test({ facts: facts, beforeA: sisterTeam, beforeE: [] }), '姊强化应为 0.25');
}
{
    // 众志成城攻防跨档：atk 0.2（6 人档）配 def 0.2（5 人档）
    const facts = [R(1), S('unity', 'ally', 3), AP(FACT_TYPES.UNITY_APPLY, 'u1', 'ally', 'atk', 0.2), AP(FACT_TYPES.UNITY_APPLY, 'u1', 'ally', 'def', 0.2)];
    expectFail('228 众志成城攻防不同档', rule228.test({ facts: facts }), '不同档');
}
{
    // 摄魂降防：第 2 回合应为 0.9×0.96-1 = -0.136，声明 -0.1 = 回合指数没生效
    const facts = [R(1), R(2), S('soulDrain', 'enemy', 4), AP(FACT_TYPES.SOUL_DRAIN_APPLY, 'u1', 'ally', 'def', -0.1)];
    expectFail('228 摄魂降防回合指数没生效', rule228.test({ facts: facts }), '配置应为');
}
{
    // 摄魂姊强化：施法方（enemy）有姊 → 基础应为 -0.4、步长 0.1；-0.5 合法
    const facts = [R(1), S('soulDrain', 'enemy', 4), AP(FACT_TYPES.SOUL_DRAIN_APPLY, 'u1', 'ally', 'atk', -0.5)];
    expect('228 摄魂姊强化栅格', rule228.test({ facts: facts, beforeA: [], beforeE: sisterTeam }), 'pass');
    const badFacts = [R(1), S('soulDrain', 'enemy', 4), AP(FACT_TYPES.SOUL_DRAIN_APPLY, 'u1', 'ally', 'atk', -0.35)];
    expectFail('228 摄魂姊强化步长错（-0.35）', rule228.test({ facts: badFacts, beforeA: [], beforeE: sisterTeam }), '配置栅格');
}
{
    // 同回合同单位同属性两条施加 = 重复施加（属性会翻倍）
    const facts = [R(1), S('holyFlame', 'ally', 4), AP(FACT_TYPES.HOLY_FLAME_APPLY, 'u1', 'ally', 'atk', 0.3), AP(FACT_TYPES.HOLY_FLAME_APPLY, 'u1', 'ally', 'atk', 0.3)];
    expectFail('228 同回合重复施加', rule228.test({ facts: facts, beforeA: [], beforeE: [] }), '重复施加');
}
{
    // 背水一战整局只触发一次
    const facts = [R(1), S('lastStand', 'ally', 35), AP(FACT_TYPES.LAST_STAND_APPLY, 'u3', 'ally', 'atk', 0.1), R(2), S('lastStand', 'ally', 34), AP(FACT_TYPES.LAST_STAND_APPLY, 'u3', 'ally', 'atk', 0.1)];
    expectFail('228 背水一战整局触发两次', rule228.test({ facts: facts }), '应仅 1 次');
}
{
    const facts = [R(1), S('holyFlame', 'ally', 4)];
    expect('228 无施加声明 → skip', rule228.test({ facts: facts }), 'skip');
}

console.log(bad === 0 ? 'RESULT: 全对' : `RESULT: ${bad} 条不对`);
process.exit(bad === 0 ? 0 : 1);
