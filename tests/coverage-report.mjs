// V1.0.0 | ~4700 bytes | 2026-09-27 第 28 轮：把「每条规则到底跑过几次」做成常驻报告。
// 干什么：跑规则回放 → 解析每条规则的 pass/fail/skip → 按**触发次数（pass+fail）**升序排 → 标出低覆盖的。
// 为什么要有它：只看「0 fail / 恒 skip 0」会漏掉一种弱覆盖 —— 一条规则 120 场里只触发 6 次，
//   它"通过"了，但它几乎没在测东西。覆盖度是体检自身质量的指标，与"恒 skip"红线互补。
// 取证结论（第 28 轮，写在这里免得以后重趟）：低覆盖规则**不是**判据坏了 ——
//   把种子数 20→40（120→240 场）后，触发数按比例增长（流云 6→15、未命中重试 11→20、
//   苦练 13→20、生生不息 15→32）。判据若真坏了，数字不会随样本放大，会停在 0 附近。
//   根因是**出场随机性**：触发次数 ≈ 20 × 「该机制所属角色出现在几个关卡」。
// 实现要点：本环境 spawnSync 启 node 子进程会 EBUSY，故改为**进程内直接 import 回放器**，
//   并拦下 console.log 收集输出；回放器失败时会 process.exit，故报告挂在 process.on('exit') 上打印。
// 退出码：默认 0（本报告性质上是对照表）。仅当某条规则**一次都没触发**（触发=0）时退 1 ——
//   那等价"恒 skip"，是真正的空转，不该静默。
// 运行：node tests/coverage-report.mjs
//      SEEDS=1,2,3 STAGES=2,4 node tests/coverage-report.mjs   （环境变量同样作用于回放器）
export const VER = 'tests/coverage-report.mjs V1.0.0';

const WARN_RATE = 0.10; // 触发率低于 10% 列为「覆盖偏薄」

const lines = [];
const origLog = console.log.bind(console);
console.log = (...a) => { lines.push(a.map(String).join(' ')); };

let printed = false;
function buildReport() {
    if (printed) return;
    printed = true;
    console.log = origLog;
    const out = lines.join('\n');
    const totalM = out.match(/规则回放自检：(\d+)\s*场/);
    const total = totalM ? Number(totalM[1]) : 0;
    const rows = [];
    for (const line of lines) {
        const m = line.match(/^(.+?)\(回归\)\s+pass=(\d+) fail=(\d+) skip=(\d+)/);
        if (!m) continue;
        const pass = Number(m[2]), fail = Number(m[3]), skip = Number(m[4]);
        rows.push({ name: m[1].trim(), pass, fail, skip, trig: pass + fail });
    }
    if (!rows.length) {
        console.error('[coverage] 没解析到任何规则结果 —— 回放器输出格式可能变了，或回放本身失败');
        process.exitCode = 1;
        return;
    }
    rows.sort((a, b) => a.trig - b.trig);

    console.log(`规则覆盖度：${rows.length} 条规则 / ${total} 场（触发 = pass + fail）\n`);
    console.log('  触发   占比    pass/fail/skip    规则');
    for (const x of rows) {
        const rate = total ? (x.trig / total * 100).toFixed(1) + '%' : '-';
        const flag = x.trig === 0 ? ' ❌' : (total && x.trig / total < WARN_RATE ? ' ⚠' : '');
        console.log(String(x.trig).padStart(5), String(rate).padStart(7),
            String(x.pass + '/' + x.fail + '/' + x.skip).padEnd(15), x.name + flag);
    }

    const zero = rows.filter(x => x.trig === 0);
    const thin = rows.filter(x => x.trig > 0 && total && x.trig / total < WARN_RATE);
    if (thin.length) {
        console.log(`\n⚠ 覆盖偏薄（触发率 < ${WARN_RATE * 100}%）${thin.length} 条 ——`
            + ' 经放大样本取证属"机制本身罕见"，非判据失效；要提高覆盖就加大 SEEDS（触发数按比例增长）');
        for (const x of thin) console.log('   · ' + x.name + '（' + x.trig + '/' + total + '）');
    }
    if (zero.length) {
        console.log(`\n❌ 全程未触发 ${zero.length} 条（等价恒 skip，是空转）：`);
        for (const x of zero) console.log('   · ' + x.name);
        process.exitCode = 1;
    }
    console.log('\n提示：加大样本 SEEDS=1,2,...,40 node tests/coverage-report.mjs');
}

// 回放器若 process.exit（有失败时），以下 import 之后的代码不会执行 —— 故报告挂在 exit 上兜底
process.on('exit', buildReport);

try {
    await import('./rules-replay.mjs');
} catch (e) {
    console.log = origLog;
    console.error('[coverage] 回放器抛出异常：', e && e.message);
    process.exitCode = 1;
}
buildReport();
