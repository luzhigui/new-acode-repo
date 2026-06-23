// 25unit-tests.js - 光明顶对战 5v5 核心函数单元测试（可导出调用）
// 预估行数: 145, 发送时间: 20260620 09:45, 版本: V2.1.0
export const VER = '25unit-tests.js V2.1.0';

import { calcDamage, getFronts } from './03battle-utils.js';
import { computeBuffStats } from './04buff-system.js';
import { Unit } from './02unit.js';

export function runTests(logFn, errorFn) {
    const log = logFn || console.log;
    const err = errorFn || console.error;
    let passed = 0, failed = 0;

    function assert(desc, actual, expected) {
        const ok = actual === expected;
        if (ok) { passed++; log(`✅ ${desc}`); }
        else { failed++; err(`❌ ${desc} —— 期望 ${expected}，实际 ${actual}`); }
    }

    // calcDamage
    assert('基础伤害 50攻30防', Math.floor(calcDamage(50, 30)), 31);
    assert('攻击远大于防御', Math.floor(calcDamage(100, 10)), 90);
    assert('攻击等于防御', Math.floor(calcDamage(50, 50)), 25);
    assert('防御远大于攻击（下限保护）', Math.floor(calcDamage(20, 200)), 2);
    assert('防御为0', calcDamage(50, 0), 50);
    assert('防御为负数', calcDamage(50, -10), 50);

    // computeBuffStats
    let u = new Unit('测试', 100, '防战', 'ally');
    u.pos = 5; u.alive = true; u._baseMaxHp = u.maxHp;
    
    let stats = computeBuffStats(u, [], []);
    assert('无Buff加成', stats.atkBonus === 0 && stats.defBonus === 0 && stats.dodgeBonus === 0 && stats.hpBonus === 0, true);
    
    stats = computeBuffStats(u, [{key:'cloudBody'}], []);
    assert('流云身法闪避+30%', stats.dodgeBonus, 0.3);
    
    stats = computeBuffStats(u, [{key:'fortify'}], []);
    assert('严阵以待防御+50%', stats.defBonus, 0.5);
    
    let sf = {key:'holyFlame', col:2, row:2};
    stats = computeBuffStats(u, [sf], []);
    assert('圣火令列攻击+30%', stats.atkBonus, 0.3);
    assert('圣火令行防御+30%', stats.defBonus, 0.3);
    
    let ally = [
        {uid:'a',alive:false},
        {uid:'b',alive:true},
        {uid:'c',alive:false}
    ];
    stats = computeBuffStats(u, [{key:'carry'}], ally);
    assert('Carry加成 1活2死', stats.atkBonus, 0.4);

    // getFronts - 每列取行号最小的存活单位
    // 三列各有一个最前排的单位：1(147列)、2(258列)、3(369列)
    let units = [
        {pos:1, alive:true},
        {pos:2, alive:true},
        {pos:3, alive:true}
    ];
    let fronts = getFronts(units);
    assert('三列各一个前排', fronts.length, 3);
    assert('147列前排是1号', fronts.some(u => u.pos === 1), true);
    assert('258列前排是2号', fronts.some(u => u.pos === 2), true);
    assert('369列前排是3号', fronts.some(u => u.pos === 3), true);

    // 147列1号死，4号替补；258列和369列不变
    units = [
        {pos:1, alive:false},
        {pos:4, alive:true},
        {pos:2, alive:true},
        {pos:3, alive:true}
    ];
    fronts = getFronts(units);
    assert('1号死后4号补位', fronts.some(u => u.pos === 4), true);
    assert('258列仍是2号', fronts.some(u => u.pos === 2), true);
    assert('总共三个前排', fronts.length, 3);

    // 只有5号一个人存活 → 258列前排是5号，其余两列无人
    units = [{pos:5, alive:true}];
    fronts = getFronts(units);
    assert('仅5号存活', fronts.length, 1);
    assert('5号是258列前排', fronts[0].pos, 5);

    log(`\n📋 测试完成：通过 ${passed} 项，失败 ${failed} 项`);
    if (failed === 0) log('🎉 全部核心函数测试通过！');
    return { passed, failed };
}