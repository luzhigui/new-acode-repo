// 临时牙齿探针：checkSixsectsStructure 反例注入验证（用完即删）
import { checkSixsectsStructure } from './registration-check.mjs';

let fail = 0;
function t(name, entry, comps, expectProblem) {
    const probs = checkSixsectsStructure(entry, comps);
    const ok = expectProblem === null
        ? probs.length === 0
        : probs.some(p => p.includes(expectProblem));
    console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (probs.length ? ' | 问题: ' + probs.join(' ; ') : ''));
    if (!ok) fail++;
}

// 合法基线：入口 import 组件的两个导出并全部引用，注册 API 都有 import
const entryOK = `
import { registerElite, registerLinkPartners } from '../core/08-elite-registry.js';
import { registerMechanicHandler } from '../core/18mechanic-registry.js';
import { createAComponent, aHandler } from './26elite-sixsects-a.js';
export const VER = 'x';
registerElite('甲', createAComponent);
registerMechanicHandler('k', aHandler);
registerLinkPartners('甲', '乙');
`;
const compA = `
export const VER = 'y';
export function createAComponent() {}
export const aHandler = {};
`;
const compB = `
export const VER = 'z';
export function createBComponent() {}
`;

t('牙1 合法基线→绿', entryOK, { '26elite-sixsects-a.js': compA }, null);
t('牙2 (a)死文件→红', entryOK, { '26elite-sixsects-a.js': compA, '26elite-sixsects-b.js': compB }, '(a) 死文件');
t('牙3 (b)import断裂→红', entryOK + `import { createBComponent } from './26elite-sixsects-b.js';\ncreateBComponent;\n`, { '26elite-sixsects-a.js': compA }, '(b) import 断裂');
t('牙4 (c)死导出→红', entryOK, { '26elite-sixsects-a.js': compA + '\nexport const deadExport = 1;\n' }, '(c) 死导出');
t('牙5 (d)漏import→红', entryOK.replace(`import { registerMechanicHandler } from '../core/18mechanic-registry.js'`, ''), { '26elite-sixsects-a.js': compA }, '(d) 漏 import');
t('牙6 (e)漏导出→红', entryOK.replace('createAComponent, aHandler', 'createAComponent, aHandler, ghostExport'), { '26elite-sixsects-a.js': compA }, '(e) 漏导出');
t('牙7 空入口→守卫红', '', { '26elite-sixsects-a.js': compA }, '零触发守卫');
t('牙8 空组件集→守卫红', entryOK, {}, '零触发守卫');
t('牙9 入口无组件import→守卫红', `import { registerElite } from '../core/08-elite-registry.js';\nexport const VER = 'x';\nregisterElite('甲', 1);\n`, { '26elite-sixsects-a.js': compA }, '零触发守卫');
t('牙10 组件无导出→守卫红', entryOK, { '26elite-sixsects-a.js': '// 空文件\n' }, '零触发守卫');

console.log(fail === 0 ? 'ALL TEETH PASS (10/10)' : `TEETH FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
