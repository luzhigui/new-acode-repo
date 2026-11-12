// tests/rewind-guard-prereq-case.mjs — 倒针运行时守卫的「前提失效」自证（315/316 的异常处理配套）
// 为什么需要这条：315/316 用 execFileSync 起探针子进程。同一环境实测过 spawnSync git EPERM、
//   health-rules-syntax-sweep 子进程 EPERM ⇒ 沙箱禁子进程时，若把「环境起不来」一律当成
//   「探针报红」，就会把**环境问题误报成「主代码倒针坏了」**——这是最坏的一种假红：
//   它指着主代码，而主代码一点问题都没有。
// 本件用两条反向样本把这条边界钉死：
//   ① 模拟子进程起不来（把要起的解释器指到不存在的路径）⇒ 规则必须返回 skip、打印
//      「守卫前提失效：环境不允许起子进程」，**不许**返回 fail:true（不许误报红）；
//   ② 改坏 ui/727 真源码（HC_PROBE_MUT）⇒ 规则**仍必须**报红 fail:true
//      （不许把加严做成放宽：环境问题能豁免，真缺陷不能豁免）。
// 运行：node tests/rewind-guard-prereq-case.mjs
//   期望末行 RESULT: PASS；任何一条红 → 退出码 1。
import {
    runChildWithEnv, ENV_SKIP_REASON, isSpawnEnvFailure
} from './rewind-probe-sandbox-case.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');
const R = [];

function check(name, cond, detail) {
    R.push({ name, ok: !!cond });
    console.log((cond ? '  ✓ ' : '  ✗ ') + name + (detail ? ' — ' + detail : ''));
}

// ── 子进程模式：被父进程拉起来，直接调规则、把结果吐出来 ──
const CHILD = process.env.HC_PREREQ_CHILD || '';
if (CHILD) {
    const which = CHILD.split('-')[0];               // '315' / '316'
    const mod = await import('./health-rules/' + which + '-rewind-' +
        (which === '315' ? 'gate-park-runtime.js' : 'snapshot-restore-runtime.js'));
    const key = Object.keys(mod).find(k => k.startsWith('rule'));
    let res = null, err = null;
    try { res = mod[key].test({}, () => { }); } catch (e) { err = String((e && e.message) || e); }
    console.log('PREREQ_RESULT ' + JSON.stringify({ res, err }));
    process.exit(0);
}

// ── 父进程模式：两条反向样本 ──
// ① 环境起不来：把解释器指到仓库里一个不存在的路径 ⇒ 模拟「沙箱禁子进程」
const BOGUS_EXE = path.join(ROOT, '__no_such_node_binary__');
for (const which of ['315', '316']) {
    const child = runChildWithEnv(SELF, { HC_PREREQ_CHILD: which + '-spawnfail', HC_PROBE_EXE: BOGUS_EXE });
    const out = child.out || '';
    const m = /PREREQ_RESULT\s+(\{.*\})/.exec(out);
    let res = null;
    try { res = m ? JSON.parse(m[1]).res : null; } catch (e) { res = null; }
    const isSkip = res === 'skip';
    const notFail = !(res && typeof res === 'object' && res.fail === true);
    check('① 子进程起不来时规则 ' + which + ' 必须返回 skip（不得 fail:true）',
        isSkip && notFail, 'res=' + JSON.stringify(res));
    check('① 子进程起不来时规则 ' + which + ' 必须打印「' + ENV_SKIP_REASON + '」',
        out.indexOf(ENV_SKIP_REASON) >= 0, out.split('\n').filter(l => /守卫前提失效/.test(l))[0] || '没打印');
}

// ② 改坏 ui/727 真源码 ⇒ 规则仍必须报红（不许把加严做成放宽）
const MUT_FOR = { '315': 'no-gate', '316': 'steps-live' };
for (const which of ['315', '316']) {
    const child = runChildWithEnv(SELF, { HC_PREREQ_CHILD: which + '-mut', HC_PROBE_MUT: MUT_FOR[which] });
    const out = child.out || '';
    const m = /PREREQ_RESULT\s+(\{.*\})/.exec(out);
    let res = null;
    try { res = m ? JSON.parse(m[1]).res : null; } catch (e) { res = null; }
    const isFail = !!(res && typeof res === 'object' && res.fail === true);
    check('② 改坏 ui/727（' + MUT_FOR[which] + '）时规则 ' + which + ' 仍必须报红 fail:true',
        isFail, 'res=' + JSON.stringify(res && res.msg ? res.msg.slice(0, 90) : res));
    check('② 改坏 ui/727 时规则 ' + which + ' 不得返回 skip（豁免只给环境问题，不给真缺陷）',
        res !== 'skip', 'res=' + JSON.stringify(res));
}

const bad = R.filter(x => !x.ok);
if (bad.length) {
    console.log('RESULT: FAIL (' + bad.length + '/' + R.length + ' 条断言失败)');
    process.exit(1);
}
console.log('RESULT: PASS (' + R.length + ' 条断言全过) · 守卫前提失效自证（起不来 ⇒ skip / 改坏 ⇒ 仍红）');
process.exit(0);
