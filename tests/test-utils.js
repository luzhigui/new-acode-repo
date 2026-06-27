// tests/test-utils.js - 测试工具集（合并自25+27+35）
export const VER = 'tests/test-utils.js V4.0.0';

import { calcDamage, getFronts, isBlocked, getFlyDodgeRate, getUnitRow, getUnitCol, getAdjacentPositions, computeBuffStats, Unit, rand, runBattle } from '../core/engine.js';
import { CONFIG, ENEMY_M } from '../core/config.js';
const C = CONFIG;

// ==================== 25unit-tests: 核心函数单元测试 ====================

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

// ==================== 27auto-battle-utils: 自动批量战斗工具 ====================

// 纯数据快照生成器
export function generateSnapshot(currentStage = 1) {
    const PARTY_SIZE = 5;
    let allyTeam = [], enemyTeam = [];
    const mingSquad = C.MING_SQUADS && C.MING_SQUADS[currentStage] ? C.MING_SQUADS[currentStage] : null;
    const enemySquad = C.ENEMY_SQUADS && C.ENEMY_SQUADS[currentStage] ? C.ENEMY_SQUADS[currentStage] : null;

    // --- 明教 ---
    if (mingSquad) {
        let mingConfig;
        if (currentStage === 1 && Array.isArray(mingSquad[0])) {
            mingConfig = mingSquad[rand(0, mingSquad.length - 1)];
        } else {
            mingConfig = mingSquad;
        }
        // 确保 mingConfig 是数组
        if (!Array.isArray(mingConfig)) {
            mingConfig = [mingConfig];
        }
        let takenPos = new Set();
        for (let item of mingConfig) {
            let name, mVal;
            if (typeof item === 'string') {
                name = item;
                mVal = C.MING_M[name] || 95;
            } else {
                mVal = item;
                // 明教弟子统一用带编号的格式
                if (mVal === 95) {
                    const existingDisciples = allyTeam.filter(u => u.name && u.name.startsWith('明教弟子'));
                    name = '明教弟子' + (existingDisciples.length + 1);
                } else {
                    // 按 M 值查找名字，排除已使用的
                    const usedNames = allyTeam.map(u => u.name);
                    const candidates = Object.entries(C.MING_M).filter(([n, v]) => v === mVal && !usedNames.includes(n));
                    if (candidates.length > 0) {
                        name = candidates[rand(0, candidates.length - 1)][0];
                    } else {
                        const allCandidates = Object.entries(C.MING_M).filter(([n, v]) => v === mVal);
                        name = allCandidates.length > 0 ? allCandidates[rand(0, allCandidates.length - 1)][0] : ('明教弟子' + (allyTeam.length + 1));
                    }
                }
            }
            if (!name) name = '明教弟子' + (allyTeam.length + 1);
            if (!mVal) mVal = 95;
            let role = name === '张无忌' ? '远程' : (name === '韦一笑' ? '飞行' : C.ROLES[rand(0, 3)]);
            let unit = new Unit(name, mVal, role, 'ally');
            if (name === '张无忌') unit.isZhang = true;
            if (name === '韦一笑') unit.isWei = true;
            unit.pos = null;
            unit.init(); unit.applyBonus();
            allyTeam.push(unit);
        }
        let zhang = allyTeam.find(u => u.isZhang);
        let wei = allyTeam.find(u => u.isWei);
        if (zhang) { zhang.pos = 5; zhang.fixed = true; takenPos.add(5); }
        if (wei) { wei.pos = 6; wei.fixed = true; takenPos.add(6); }
        let others = allyTeam.filter(u => !u.isZhang && !u.isWei);
        if (others.length > 0 && zhang && !takenPos.has(2)) {
            others[0].pos = 2; others[0].fixed = true; takenPos.add(2);
            others.shift();
        }

    }

    // --- 六大派 ---
    let enemyUnits = [];
    if (enemySquad) {
        let enemyPosSet = new Set();
        for (let item of enemySquad) {
            if (typeof item === 'object' && item.name) {
                let unit = new Unit(item.name, item.m, item.role, 'enemy');
                unit.init(); unit.applyBonus();
                enemyUnits.push(unit);
            } else {
                let mVal = item;
                // 优先从 ENEMY_SQUADS 的定义中查找名字，其次从 ENEMY_M 中查找，最后兜底为"六大派弟子"
                let pool = Object.entries(ENEMY_M).filter(([n, v]) => v === mVal);
                let usedNames = enemyUnits.map(u => u.name);
                let name = null;
                // 先从 ENEMY_SQUADS 中按 mVal 查找未被使用的名字
                const squadDefs = Object.values(C.ENEMY_SQUADS).flat();
                for (let def of squadDefs) {
                    if (typeof def === 'object' && def.m === mVal && !usedNames.includes(def.name)) {
                        name = def.name;
                        break;
                    }
                }
                // 如果 Squad 中没找到，再从 ENEMY_M 池子中随机
                if (!name && pool.length > 0) {
                    let attempts = 0;
                    while ((!name || usedNames.includes(name)) && attempts < 50) {
                        let pick = pool[rand(0, pool.length - 1)];
                        name = pick[0];
                        attempts++;
                    }
                }
                if (!name) name = '六大派弟子';
                let role = C.ROLES[rand(0, 3)];
                let unit = new Unit(name, mVal, role, 'enemy');
                unit.init(); unit.applyBonus();
                enemyUnits.push(unit);
            }
        }
        let template = C.ENEMY_POS_TEMPLATES && C.ENEMY_POS_TEMPLATES[currentStage] ? C.ENEMY_POS_TEMPLATES[currentStage] : null;
        if (template) {
            for (let [role, poses] of Object.entries(template)) {
                if (role === 'random') continue;
                for (let pos of poses) {
                    let unit = enemyUnits.find(u => u.role === role && u.pos == null);
                    if (unit && !enemyPosSet.has(pos)) {
                        unit.pos = pos; unit._originalPos = pos;
                        enemyPosSet.add(pos);
                    }
                }
            }
        }        // 其余随机
        let remaining = enemyUnits.filter(u => u.pos == null);
        let allPos = [1,2,3,4,5,6,7,8,9].filter(p => !enemyPosSet.has(p));
        for (let u of remaining) {
            if (allPos.length > 0) {
                let idx = rand(0, allPos.length - 1);
                u.pos = allPos[idx]; u._originalPos = u.pos;
                enemyPosSet.add(allPos[idx]);
                allPos.splice(idx, 1);
            }
        }
        // 最终兜底：任何仍未获得位置的单位，强制从所有空位中随机分配
        let stillUnplaced = enemyUnits.filter(u => u.pos == null);
        if (stillUnplaced.length > 0) {
            let finalPositions = [1,2,3,4,5,6,7,8,9].filter(p => !enemyPosSet.has(p));
            for (let u of stillUnplaced) {
                if (finalPositions.length > 0) {
                    let idx = rand(0, finalPositions.length - 1);
                    u.pos = finalPositions[idx]; u._originalPos = u.pos;
                    enemyPosSet.add(finalPositions[idx]);
                    finalPositions.splice(idx, 1);
                } else {
                    // 极端情况：所有位置被占，强行给一个合法位置
                    u.unit.pos = 1 + rand(0, 8);
                }
            }
        }
        enemyTeam = enemyUnits.map(e => e.unit || e);
    }

    return {
        ally: allyTeam.map(u => Object.freeze(u.clone())),
        enemy: enemyTeam.map(u => Object.freeze(u.clone()))
    };
}

// 自动挑选海克斯，支持偏好列表
export function autoPickBuff(choices, preferredBuffs = []) {
    if (!choices || choices.length === 0) return null;
    if (preferredBuffs.length > 0) {
        const preferredChoices = choices.filter(c => preferredBuffs.includes(c));
        if (preferredChoices.length > 0) {
            return preferredChoices[Math.floor(Math.random() * preferredChoices.length)];
        }
    }
    return choices[Math.floor(Math.random() * choices.length)];
}

// 生成海克斯选项
function generateBuffChoices() {
    const ALL_BUFF_KEYS = Object.keys(C.BUFFS);
    let shuffled = [...ALL_BUFF_KEYS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, C.BUFF_CHOICES);
}

// 自动批量战斗
export async function runAutoBattle(rounds, onProgress, stage = 1, preferredBuffs = []) {
    let wins = { ally: 0, enemy: 0, draw: 0 };
    for (let i = 0; i < rounds; i++) {
        const snap = generateSnapshot(stage);
        let buffs = [];
        for (let j = 0; j < 4; j++) {
            const choices = generateBuffChoices();
            const picked = autoPickBuff(choices, preferredBuffs);
            if (picked) buffs.push({ key: picked, target: 'ally', remaining: C.BUFFS[picked].duration || C.BUFF_DURATION });
        }
        const result = runBattle(snap, buffs);
        if (result.winner === '明教') wins.ally++;
        else if (result.winner === '六大派') wins.enemy++;
        else wins.draw++;
        if (onProgress) onProgress(i + 1, rounds);
    }
    return wins;
}

// ==================== 35quiz-bank: 题库 ====================

const DEFAULT_QUIZ_BANK = [
    { q: '海克斯每隔几回合选一次？', o: ['每回合', '每2回合', '每3回合', '每4回合'], a: 2, e: '每3回合（3、6、9...回合结束后）' },
    { q: '张无忌初始定位？', o: ['战士', '防战', '远程', '飞行'], a: 2, e: '远程，前排无人时切换近战' },
    { q: '韦一笑被动？', o: ['吸血', '闪避反击', '复活', '额外行动'], a: 1, e: '闪避后反击并吸血' },
    { q: '哪个不是海克斯？', o: ['流云身法', '嗜血狂刀', '九阳神功', '严阵以待'], a: 2, e: '九阳神功是张无忌被动' },
    { q: '防战特色？', o: ['高暴击', '反弹伤害', '中毒', '召唤'], a: 1, e: '反弹伤害（严阵以待）' },
    { q: '宋青书周芷若联动？', o: ['苦练', '新婚', '嫉妒', '以上都是'], a: 3, e: '苦练/新婚/性奋/嫉妒' },
    { q: '游戏几大关？', o: ['4', '5', '6', '8'], a: 2, e: '6关' },
    { q: '飞行单位基础闪避？', o: ['0%', '10%', '15%', '20%'], a: 2, e: '15%（韦一笑20%）' },
    { q: 'Buff持续几回合？', o: ['2', '3', '4', '5'], a: 2, e: '4回合' },
    { q: '圣火令效果？', o: ['全体加攻', '一列加攻一行加防', '吸血', '溅射'], a: 1, e: '随机一列+30%攻击，一行+30%防御' },
    { q: '乘风突袭效果？', o: ['远程溅射', '飞行波及同行', '战士吸血', '防战反弹'], a: 1, e: '飞行80%波及同行，60%击退' },
    { q: '严阵以待效果？', o: ['加攻', '加防+反弹', '吸血', '闪避'], a: 1, e: '防战防御+50%，反弹50%伤害差' },
    { q: '宋青书技能？', o: ['玄冥神掌', '混元霹雳劲', '叛逆突袭', '九阴白骨爪'], a: 2, e: '锁定血量最高目标，伤害+30%+真实伤害' },
    { q: '周芷若技能？', o: ['灭绝双剑', '九阴白骨爪', '玄冥神掌', '鹿角杖法'], a: 1, e: '70%概率追加伤害，不可闪避，张无忌在场伤害提升' },
    { q: '成昆技能？', o: ['玄冥神掌', '混元霹雳劲', '九阴白骨爪', '叛逆突袭'], a: 1, e: '附加已损失生命30%真实伤害' },
    { q: '鹿杖客技能？', o: ['鹿角杖法', '玄冥神掌', '混元霹雳劲', '九阴白骨爪'], a: 1, e: '攻击挂毒，每回合3%最大生命持续3回合' },
    { q: '鹤笔翁技能？', o: ['玄冥神掌', '鹿角杖法', '混元霹雳劲', '九阴白骨爪'], a: 1, e: '忽略30%防御，对中毒目标+50%伤害' },
    { q: '巨马阵效果？', o: ['召唤巨马', '吸血', '闪避', '反弹'], a: 0, e: '每回合生成巨马，回合结束50%概率销毁' },
    { q: '你就是carry给几号位？', o: ['1号', '3号', '5号', '7号'], a: 2, e: '5号位获得队友基础加成' },
    { q: '张无忌远程切换近战条件？', o: ['血量低', '前排无人', '队友死亡', '随机'], a: 1, e: '前排无人时自动切换' },
    { q: '韦一笑基础闪避？', o: ['10%', '15%', '20%', '25%'], a: 2, e: '20%' },
    { q: '嗜血狂刀吸血比例？', o: ['50%', '60%', '80%', '100%'], a: 2, e: '80%' },
    { q: '热血奋战普通回血比例？', o: ['10%', '15%', '20%', '30%'], a: 1, e: '15%，每3次翻倍' },
    { q: '流云身法闪避加成？', o: ['+15%', '+20%', '+25%', '+30%'], a: 2, e: '全体+25%闪避概率' },
    { q: '哪个Buff有溅射效果？', o: ['嗜血狂刀', '严阵以待', '流星赶月', '热血奋战'], a: 2, e: '远程对周围溅射50%伤害' },
    { q: '惑人心智效果？', o: ['吸血', '换位', '溅射', '加攻'], a: 1, e: '最前排80%扰乱敌方换位' },
    { q: '张无忌九阳神功回复量？', o: ['3%', '5%', '8%', '10%'], a: 1, e: '每回合回复5%最大生命' },
    { q: '乾坤大挪移保护哪些位置？', o: ['全部', '1/2/3', '4/6', '5'], a: 2, e: '保护4/6号位队友，反弹15%伤害' },
    { q: '远程单位有MISS概率？', o: ['无', '3%', '5%', '10%'], a: 2, e: '远程/飞行5%未命中' },
    { q: '防战伤害公式特点？', o: ['纯攻击', '攻击+防御+生命', '纯防御', '真实伤害'], a: 1, e: '攻击+防御×K+生命×1%' }
];

// 合并自定义题目
function loadQuizBank() {
    var custom = [];
    try { custom = JSON.parse(localStorage.getItem('ming_quiz_bank') || '[]'); } catch (e) {}
    return DEFAULT_QUIZ_BANK.concat(custom);
}

// 保存自定义题目
function saveCustomQuiz(item) {
    var custom = [];
    try { custom = JSON.parse(localStorage.getItem('ming_quiz_bank') || '[]'); } catch (e) {}
    custom.push(item);
    localStorage.setItem('ming_quiz_bank', JSON.stringify(custom));
}

export { DEFAULT_QUIZ_BANK, loadQuizBank, saveCustomQuiz };