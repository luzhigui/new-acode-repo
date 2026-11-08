#!/usr/bin/env node
// tests/hex-dual-effect-check.mjs | V1.0.0 | 2026-11-08
//
// 干什么：证明「双海克斯」在回放里**真的改变战局**，而不只是「选了、挂上了、账上记了」。
//
// 为什么要有它：rules-replay 的 ENEMY_HEX 开关（默认双档）只统计「敌方补选次数 / 敌方身上生效回合数」。
//   这两项只能证明 buff 对象进了引擎，证明不了它对战斗结果有任何影响 —— 敌方 buff 完全可能
//   因为阵营取值、快照重建、加成只读己方等原因静默失效，而计数照样漂亮。
//   本件用同一批场次跑两遍（双档 / 单档），逐场对比「胜负 + 回合数 + 双方总损血」：
//   · 全部相同 ⇒ 敌方海克斯零影响（双档是摆设）→ 判红
//   · 有差异   ⇒ 双档确实参与结算
//
// 口径与边界：
//   · 不复制回放逻辑，直接 subprocess 跑 tests/rules-replay.mjs 并读它的 STATS=1 指纹行
//     （指纹行只在 STATS=1 时输出，默认运行零副作用）。
//   · rules-replay 因**其他规则**失败时退出码非 0 属正常，本件只看 stdout 的指纹行，不看退出码。
//   · 只读、零主代码改动。
// 用法：
//   node tests/hex-dual-effect-check.mjs               默认 2 种子 × 3 关 = 6 场，跑两遍
//   HE_DUAL_SEEDS=1,2,3 HE_DUAL_STAGES=1,3,5 node tests/hex-dual-effect-check.mjs
//   node tests/hex-dual-effect-check.mjs --selftest    纯本地自证判据（不跑引擎）
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const VER = 'tests/hex-dual-effect-check.mjs V1.0.0';

const FP_RE = /^\[指纹\] seed=(\d+) stage=(\d+) winner=(\S+) rounds=(\d+) allyLoss=(-?\d+(?:\.\d+)?) enemyLoss=(-?\d+(?:\.\d+)?)$/;

// 解析指纹行 → Map<'seed:stage', 指纹字符串化>
export function parseFingerprints(stdout) {
    const out = new Map();
    for (const line of String(stdout || '').split(/\r?\n/)) {
        const m = line.match(FP_RE);
        if (!m) continue;
        out.set(m[1] + ':' + m[2], line.trim());
    }
    return out;
}

// 判据本体（抽出来供 --selftest 直接喂合成数据）
//   expectedCases 不硬算：rules-replay 除默认 SEEDS×STAGES 外还会**固定追加** DIRected 定向场次，
//   按公式算必然对不上（首版就是栽在这）。改为只要求「两遍场次数一致且非空」+「逐场有交集对比」。
export function judge(dual, single) {
    if (dual.size === 0 || single.size === 0) {
        return { fail: true, msg: '指纹行一条都没抓到（STATS 探针可能被改坏或回放没跑起来）' };
    }
    if (dual.size !== single.size) {
        return { fail: true, msg: '两遍场次数不一致：双档 ' + dual.size + ' / 单档 ' + single.size + '（有场次没跑完，结论不可信）' };
    }
    let diff = 0, compared = 0;
    for (const k of dual.keys()) {
        if (!single.has(k)) continue;
        compared++;
        if (single.get(k) !== dual.get(k)) diff++;
    }
    if (compared === 0) return { fail: true, msg: '两遍场次 key 完全不重叠（指纹行格式或口径变了）' };
    if (diff === 0) {
        return { fail: true, msg: '双档与单档逐场结果完全一致（' + compared + ' 场零差异）—— 敌方海克斯"选了、挂上了、但对战局零影响"，双档是摆设' };
    }
    return { fail: false, diff, total: compared };
}

function runReplay(seedList, stageList, enemyHex) {
    const env = {
        ...process.env,
        SEEDS: seedList, STAGES: stageList, STATS: '1', ENEMY_HEX: enemyHex ? '1' : '0'
    };
    const r = spawnSync(process.execPath, [fileURLToPath(new URL('./rules-replay.mjs', import.meta.url))], {
        env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 300000
    });
    if (r.error) throw r.error;
    // 退出码可能是其他规则失败（与本件无关），只读 stdout
    return parseFingerprints(r.stdout || '');
}

function selftest() {
    const ok = [];
    const bad = [];
    const same = new Map([['1:1', '[指纹] seed=1 stage=1 winner=明教 rounds=10 allyLoss=434.2 enemyLoss=745']]);
    const same2 = new Map([['1:1', '[指纹] seed=1 stage=1 winner=明教 rounds=10 allyLoss=434.2 enemyLoss=745']]);
    const diff2 = new Map([['1:1', '[指纹] seed=1 stage=1 winner=六大派 rounds=12 allyLoss=677.5 enemyLoss=328.8']]);
    (judge(same, same2).fail ? ok : bad).push('全同 → 判红');
    (judge(same, diff2).fail ? bad : ok).push('有差异 → 放行');
    (judge(new Map([['1:1', 'x'], ['1:2', 'y']]), diff2).fail ? ok : bad).push('两遍场次数不一致 → 判红');
    (judge(new Map(), new Map()).fail ? ok : bad).push('零指纹 → 判红');
    // 正则严格性：缺字段/多空格必须认不出（否则会把残行当样本，掩盖采集断链）
    ('[指纹] seed=1 stage=1 winner=明教 rounds=10'.match(FP_RE) ? bad : ok).push('缺字段行 → 不认');
    console.log(ok.map(s => '  ✅ ' + s).join('\n'));
    if (bad.length) { console.log(bad.map(s => '  ❌ ' + s).join('\n')); console.log('SELFTEST FAIL'); process.exit(1); }
    console.log('SELFTEST PASS');
}

function main() {
    if (process.argv.includes('--selftest')) return selftest();
    const seedList = process.env.HE_DUAL_SEEDS || '1,2';
    const stageList = process.env.HE_DUAL_STAGES || '1,4,7';

    console.log('=== 双海克斯效应哨兵：seed=' + seedList + ' stage=' + stageList
        + '（含回放固定追加的定向场次，两遍同口径）===');
    const dual = runReplay(seedList, stageList, true);
    const single = runReplay(seedList, stageList, false);

    // 逐场显形差异（便于人工核对方向：敌方变强 ⇒ enemyLoss/rounds 应发生变化）；只详列前 6 场
    let shown = 0;
    for (const k of dual.keys()) {
        const a = dual.get(k), b = single.get(k);
        if (b === undefined) { console.log('  ❌ ' + k + ' 单档口径缺这一场'); continue; }
        if (a !== b && shown < 6) {
            shown++;
            console.log('  差异 ' + k + '\n     双档: ' + a + '\n     单档: ' + b);
        }
    }

    const v = judge(dual, single);
    if (v.fail) { console.log('RESULT: FAIL — ' + v.msg); process.exit(1); }
    console.log('差异场次 ' + v.diff + '/' + v.total + '（说明敌方海克斯实际参与了结算）');
    console.log('RESULT: PASS');
}

main();
