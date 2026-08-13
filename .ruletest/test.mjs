import { rule76 } from './r64.mjs';
import { rule77 } from './r65.mjs';
import { rule78 } from './r66.mjs';

function run(name, rule, log) {
    const r = rule.test(null, log, [], [], [], []);
    console.log(`[${name}] -> ${JSON.stringify(r)}`);
}

console.log('--- rule76 小昭妹飞天免疫次数 ---');
run('76-skip(无飞天)', rule76, [{ type: 'info', text: '普通日志' }]);
run('76-pass(2次<=3)', rule76, [
    { type: 'info', text: '<span class="gold">🕷️ 飞天：小昭妹 即将阵亡，免疫本次攻击的 100 点伤害，化为蜘蛛遁走！剩余次数：2</span>' },
    { type: 'info', text: '<span class="gold">🕷️ 飞天：小昭妹 即将阵亡，免疫本次攻击的 50 点伤害，化为蜘蛛遁走！剩余次数：1</span>' }
]);
run('76-fail(4次>3)', rule76, [
    { type: 'info', text: '🕷️ 飞天：小昭妹 a，剩余次数：2' },
    { type: 'info', text: '🕷️ 飞天：小昭妹 b，剩余次数：1' },
    { type: 'info', text: '🕷️ 飞天：小昭妹 c，剩余次数：0' },
    { type: 'info', text: '🕷️ 飞天：小昭妹 d，剩余次数：-1' }
]);
run('76-fail(剩余次数负数)', rule76, [{ type: 'info', text: '🕷️ 飞天：小昭妹 x，剩余次数：-1' }]);

console.log('--- rule77 坚盾叠加超上限 ---');
run('77-skip(无坚盾)', rule77, [{ type: 'info', text: '别的日志' }]);
run('77-pass(3/6)', rule77, [{ type: 'info', text: '<span class="blue small">🛡️ 成昆 坚盾：防御+1（已叠3/6）</span>' }]);
run('77-fail(7/6溢出)', rule77, [{ type: 'info', text: '<span class="blue small">🛡️ 成昆 坚盾：防御+2（已叠7/6）</span>' }]);

console.log('--- rule78 分隔符重复 ---');
run('78-pass(唯一)', rule78, [
    { type: 'round-start', text: '<div class="separator">———— 第1回合开始 ————</div>' },
    { type: 'round-end', text: '<div class="separator">———— 第1回合结束 ————</div>' },
    { type: 'round-start', text: '<div class="separator">———— 第2回合开始 ————</div>' }
]);
run('78-fail(第2回合开始两次)', rule78, [
    { type: 'round-start', text: '<div class="separator">———— 第1回合开始 ————</div>' },
    { type: 'round-start', text: '<div class="separator">———— 第2回合开始 ————</div>' },
    { type: 'round-start', text: '<div class="separator">———— 第2回合开始 ————</div>' }
]);
run('78-fail(第1回合结束两次)', rule78, [
    { type: 'round-end', text: '<div class="separator">———— 第1回合结束 ————</div>' },
    { type: 'round-end', text: '<div class="separator">———— 第1回合结束 ————</div>' }
]);
