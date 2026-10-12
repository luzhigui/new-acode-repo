// 临时牙齿探针：scanSharedSymbolImport 形参遮蔽修法的双向验证（用完即删）
import { scanSharedSymbolImport, maskStrings, collectParamScopes } from './123static-scan.js';

let fail = 0;
function t(name, code, expectMissing) {
    const miss = scanSharedSymbolImport(code, {}).map(x => x.sym);
    const ok = expectMissing ? miss.includes('eventBus') : !miss.includes('eventBus');
    console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + ' | missing=' + JSON.stringify(miss));
    if (!ok) fail++;
}

// 应绿：形参遮蔽的三种形态（对应 4 条假红的现场）
t('牙1 register(eventBus,...){} 形参遮蔽→不报', `
export const VER = 'x';
export function register(eventBus, entry, log) { eventBus.emit('a'); eventBus.on('b', () => {}); }
`, false);
t('牙2 install({ eventBus, decl }){} 解构形参遮蔽→不报', `
export const VER = 'x';
export function install({ eventBus, decl }) { eventBus.emit('a'); }
`, false);
t('牙3 箭头解构形参遮蔽→不报', `
export const VER = 'x';
export const f = ({ eventBus }) => { eventBus.on('a', () => {}); };
`, false);

// 应红：牙齿保住——顶层/无绑定引用仍必须被抓
t('牙4 顶层 eventBus.emit()→报', `
export const VER = 'x';
eventBus.emit('a');
`, true);
t('牙5 if 块体内引用（非形参遮蔽）→报', `
export const VER = 'x';
export function f(x) { if (x) { eventBus.emit('a'); } }
`, true);
t('牙6 无绑定普通函数体→报', `
export const VER = 'x';
export function f() { eventBus.on('a', () => {}); }
`, true);
t('牙7 引入同名形参但使用在函数外→报', `
export const VER = 'x';
export function f(eventBus) { eventBus.emit('a'); }
eventBus.emit('b');
`, true);
t('牙8 字符串内假使用→不报', `
export const VER = 'x';
const s = 'eventBus.emit(fake)';
const m = \`eventBus.on(fake)\`;
`, false);

// 细粒度：maskStrings / collectParamScopes 自身
const masked = maskStrings(`const s = 'a)b(' ; f(x);`);
const okMask = !masked.includes('a)b(') && masked.includes('f(x)');
console.log((okMask ? 'PASS' : 'FAIL') + ' 牙9 maskStrings 掩码串内容保结构');
if (!okMask) fail++;
const scopes = collectParamScopes(`export function register(eventBus, A) { eventBus.emit(); }`);
const okScope = scopes.length === 1 && scopes[0].binds.has('eventBus') && scopes[0].binds.has('A');
console.log((okScope ? 'PASS' : 'FAIL') + ' 牙10 collectParamScopes 绑定与区间');
if (!okScope) fail++;
const scopes2 = collectParamScopes(`if (eventBus) { x(); }`);
console.log((scopes2.length === 0 ? 'PASS' : 'FAIL') + ' 牙11 控制语句括号不算形参遮蔽');
if (scopes2.length !== 0) fail++;

console.log(fail === 0 ? 'ALL TEETH PASS (11/11)' : `TEETH FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
