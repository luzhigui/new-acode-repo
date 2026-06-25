// 25unit-tests.js - 光明顶对战 5v5 核心函数单元测试（扩展版）
// 0625 10:29 kimi: 流云身法 dodgeBonus 已调整为 0.25，测试期望值同步更新
// 预估行数: 250, 发送时间: 20260625 18:00, 版本: V2.2.1
// 变更: 修正 Carry 测试预期值（deathMultiplier=3），新增 20+ 条测试覆盖边界
export const VER = '25unit-tests.js V2.2.1';

import { calcDamage, getFronts, isBlocked, getFlyDodgeRate, getUnitRow, getUnitCol, getAdjacentPositions } from './03battle-utils.js';
import { computeBuffStats } from './04buff-system.js';
import { Unit } from './02unit.js';

export function runTests(logFn, errorFn) {
    const log = logFn || console.log;
    const err = errorFn || console.error;
    let passed = 0, failed = 0;

    function assert(desc, actual, expected) {
        const ok = actual === expected;
        if (ok) { passed++; log('✅ ' + desc); }
        else { failed++; err('❌ ' + desc + ' —— 期望 ' + expected + '，实际 ' + actual); }
    }

    function assertApprox(desc, actual, expected, tolerance) {
        const ok = Math.abs(actual - expected) <= (tolerance || 0.0001);
        if (ok) { passed++; log('✅ ' + desc); }
        else { failed++; err('❌ ' + desc + ' —— 期望 ≈' + expected + '，实际 ' + actual); }
    }

    // ==================== calcDamage ====================
    log('--- calcDamage ---');
    assert('基础伤害 50攻30防', Math.floor(calcDamage(50, 30)), 31);
    assert('攻击远大于防御', Math.floor(calcDamage(100, 10)), 90);
    assert('攻击等于防御', Math.floor(calcDamage(50, 50)), 25);
    assert('防御远大于攻击（下限保护）', Math.floor(calcDamage(20, 200)), 2);
    assert('防御为0', calcDamage(50, 0), 50);
    assert('防御为负数', calcDamage(50, -10), 50);
    assert('攻击为0', calcDamage(0, 50), 0);
    assert('攻击和防御都很大', Math.floor(calcDamage(500, 500)), 250);
    assert('极小攻击极大防御', Math.floor(calcDamage(1, 1000)), 1);
    assert('10%下限保护', calcDamage(100, 10000) >= 10, true);

    // ==================== computeBuffStats ====================
    log('--- computeBuffStats ---');
    let u = new Unit('测试', 100, '防战', 'ally');
    u.pos = 5; u.alive = true; u._baseMaxHp = u.maxHp;

    let stats = computeBuffStats(u, [], []);
    assert('无Buff加成', stats.atkBonus === 0 && stats.defBonus === 0 && stats.dodgeBonus === 0 && stats.hpBonus === 0, true);

    stats = computeBuffStats(u, [{key:'cloudBody'}], []);
    assert('流云身法闪避+25%', stats.dodgeBonus, 0.25);

    stats = computeBuffStats(u, [{key:'fortify'}], []);
    assert('严阵以待防御+50%', stats.defBonus, 0.5);

    let sf = {key:'holyFlame', col:2, row:2};
    stats = computeBuffStats(u, [sf], []);
    assert('圣火令列攻击+30%', stats.atkBonus, 0.3);
    assert('圣火令行防御+30%', stats.defBonus, 0.3);

    // Carry: deathMultiplier=3, atkBonus=0.08
    let ally = [
        {uid:'a',alive:false},
        {uid:'b',alive:true},
        {uid:'c',alive:false}
    ];
    stats = computeBuffStats(u, [{key:'carry'}], ally);
    // 1活×0.08 + 2死×0.08×3 = 0.08 + 0.48 = 0.56
    assertApprox('Carry加成 1活2死', stats.atkBonus, 0.56);

    // Carry: 全部存活
    ally = [{uid:'a',alive:true},{uid:'b',alive:true},{uid:'c',alive:true},{uid:'d',alive:true}];
    stats = computeBuffStats(u, [{key:'carry'}], ally);
    assertApprox('Carry加成 4活0死', stats.atkBonus, 0.32);

    // Carry: 全部阵亡
    ally = [{uid:'a',alive:false},{uid:'b',alive:false},{uid:'c',alive:false},{uid:'d',alive:false}];
    stats = computeBuffStats(u, [{key:'carry'}], ally);
    assertApprox('Carry加成 0活4死', stats.atkBonus, 0.96);

    // Carry: 非5号位不触发
    u.pos = 3;
    stats = computeBuffStats(u, [{key:'carry'}], [{uid:'a',alive:true}]);
    assert('Carry非5号位无加成', stats.atkBonus, 0);

    // Carry: 死亡单位不触发
    u.pos = 5; u.alive = false;
    stats = computeBuffStats(u, [{key:'carry'}], [{uid:'a',alive:true}]);
    assert('Carry自身死亡无加成', stats.atkBonus, 0);
    u.alive = true;

    // 多个 buff 叠加
    stats = computeBuffStats(u, [{key:'cloudBody'},{key:'fortify'}], []);
    assert('流云+严阵 闪避叠加', stats.dodgeBonus, 0.25);
    assert('流云+严阵 防御叠加', stats.defBonus, 0.5);

    // ==================== getFronts ====================
    log('--- getFronts ---');
    let units = [
        {pos:1, alive:true}, {pos:2, alive:true}, {pos:3, alive:true}
    ];
    let fronts = getFronts(units);
    assert('三列各一个前排', fronts.length, 3);
    assert('147列前排是1号', fronts.some(u => u.pos === 1), true);
    assert('258列前排是2号', fronts.some(u => u.pos === 2), true);
    assert('369列前排是3号', fronts.some(u => u.pos === 3), true);

    units = [{pos:1, alive:false}, {pos:4, alive:true}, {pos:2, alive:true}, {pos:3, alive:true}];
    fronts = getFronts(units);
    assert('1号死后4号补位', fronts.some(u => u.pos === 4), true);
    assert('258列仍是2号', fronts.some(u => u.pos === 2), true);
    assert('总共三个前排', fronts.length, 3);

    units = [{pos:5, alive:true}];
    fronts = getFronts(units);
    assert('仅5号存活', fronts.length, 1);
    assert('5号是258列前排', fronts[0].pos, 5);

    // 空数组
    assert('空数组返回空', getFronts([]).length, 0);

    // 全部死亡
    units = [{pos:1, alive:false}, {pos:2, alive:false}, {pos:3, alive:false}];
    assert('全部死亡返回空', getFronts(units).length, 0);

    // 同列多人，取最前（行号最小）
    units = [{pos:1, alive:true}, {pos:4, alive:true}, {pos:7, alive:true}];
    fronts = getFronts(units);
    assert('同列三人取最前', fronts.length, 1);
    assert('最前是1号', fronts[0].pos, 1);

    // ==================== isBlocked ====================
    log('--- isBlocked ---');
    let u2 = {pos: 4, role: '战士', alive: true, isHorse: false};
    let allies = [{pos: 1, role: '战士', alive: true, isHorse: false}];
    assert('前排有人的后排战士被阻挡', isBlocked(u2, allies), true);

    u2.pos = 1;
    assert('前排战士不被阻挡', isBlocked(u2, allies), false);

    u2 = {pos: 4, role: '飞行', alive: true, isHorse: false};
    assert('飞行单位不被阻挡', isBlocked(u2, allies), false);

    u2 = {pos: 4, role: '战士', alive: true, isHorse: false};
    allies = []; // 没有前排
    assert('无前排时不被阻挡', isBlocked(u2, []), false);

    // ==================== getFlyDodgeRate ====================
    log('--- getFlyDodgeRate ---');
    let wei = {isWei: true, role: '飞行'};
    assert('韦一笑闪避20%', getFlyDodgeRate(wei), 0.20);

    let fly = {isWei: false, role: '飞行'};
    assert('普通飞行闪避15%', getFlyDodgeRate(fly), 0.15);

    let warrior = {isWei: false, role: '战士'};
    assert('战士闪避0%', getFlyDodgeRate(warrior), 0);

    // ==================== 位置工具函数 ====================
    log('--- 位置工具 ---');
    assert('pos=1 行1', getUnitRow(1), 1);
    assert('pos=5 行2', getUnitRow(5), 2);
    assert('pos=9 行3', getUnitRow(9), 3);
    assert('pos=1 列1', getUnitCol(1), 1);
    assert('pos=4 列1', getUnitCol(4), 1);
    assert('pos=3 列3', getUnitCol(3), 3);
    assert('pos=5 列2', getUnitCol(5), 2);

    let adj = getAdjacentPositions(1);
    assert('1号相邻有2号', adj.includes(2), true);
    assert('1号相邻有4号', adj.includes(4), true);
    assert('1号相邻有5号', adj.includes(5), true);
    assert('1号相邻共3个', adj.length, 3);

    adj = getAdjacentPositions(5);
    assert('5号相邻共8个', adj.length, 8);

    log('\n📋 测试完成：通过 ' + passed + ' 项，失败 ' + failed + ' 项');
    if (failed === 0) log('🎉 全部核心函数测试通过！');
    return { passed, failed };
}