// tests/render-assert-skeleton.mjs — 渲染层契约断言骨架（演出层盲区最小可行体检）
// V1.0.1 | 2026-11-08 立项：体检条目.md 第七章 C 条「演出层盲区」从纯文字转成可机检。
//   V1.0.1 修正：--check 路径改用同步 fs 读取，避免顶层 await 漏接导致提前退出。
// V1.0.0 | 2026-11-08 立项。
//   体检长期偏「数值/结算对不对」，对「画面/渲染产物有没有按契约产出」几乎不判。
//   本件不依赖 DOM：直接对「渲染层产出的 log 条目对象」做结构契约校验——
//   这些条目正是 rules-replay / 回放器喂给健康规则的东西（规则 166 的 swaps.uid、
//   164/158 的 _fxSnapshot 坐标都来自这里），所以它们一旦缺字段，规则会误报。
//   把契约固化成机检 = 在「引擎 → 渲染 → 规则」链路上加一道防火墙，避免渲染侧静默掉字段。
//
// 三种跑法：
//   node tests/render-assert-skeleton.mjs                → 默认跑 --selftest（synthetic 正负路径，exit 0 = 守门自身健康）
//   node tests/render-assert-skeleton.mjs --selftest    → 同上
//   node tests/render-assert-skeleton.mjs --check file.json → 对真实渲染日志 JSON 跑契约，发现违例 exit 1
//
// 默认挂 run-all OBSERVES（非 hard，不进 CHECKS 分母）。真实日志采集见文件末「采集方式」。

import { readFileSync } from 'node:fs';

const KNOWN_TYPES = new Set(['attack-group', 'buff-swap', 'buff-push', 'txt', 'skill', 'death', 'fact']);

// 单条契约校验：返回 { name, pass, detail }
function checkEntry(e, idx) {
  const out = [];
  if (!e || typeof e !== 'object') {
    out.push({ name: `entry[${idx}] 非对象`, pass: false, detail: 'log 条目必须是对象' });
    return out;
  }
  // 1) 每条必须有 type 字符串（防「无名条目」流入规则）
  if (typeof e.type !== 'string') {
    out.push({ name: `entry[${idx}] 缺 type`, pass: false, detail: '条目缺少 type 字段' });
  } else if (!KNOWN_TYPES.has(e.type)) {
    // 未知 type 不致命，但记一笔（便于发现渲染层新增类型没登记）
    out.push({ name: `entry[${idx}] 未知 type=${e.type}`, pass: true, detail: '未知类型，仅提示' });
  }

  // 2) buff-swap：必须带 swaps[]，且每个元素带 uid/name/fromPos/toPos
  //    （规则 166 的「被打断识别」完全依赖 swaps[].uid，render/409 必须透传）
  if (e.type === 'buff-swap') {
    if (!Array.isArray(e.swaps)) {
      out.push({ name: `entry[${idx}] buff-swap 缺 swaps[]`, pass: false, detail: 'buff-swap 条目未带 swaps 数组' });
    } else {
      e.swaps.forEach((s, i) => {
        if (!s || typeof s.uid === 'undefined' || typeof s.name !== 'string' ||
            typeof s.fromPos !== 'number' || typeof s.toPos !== 'number') {
          out.push({ name: `entry[${idx}] swaps[${i}] 字段不全`, pass: false,
            detail: 'swap 元素需含 uid(number/string)/name(string)/fromPos(number)/toPos(number)' });
        }
      });
    }
  }

  // 3) attack-group 带 _fxSnapshot：必须含 attackerPos / defenderPos（数字）
  //    （规则 164/158 的「坐标锚点对齐」依赖这两个字段）
  if (e.type === 'attack-group' && e._fxSnapshot) {
    const fx = e._fxSnapshot;
    if (typeof fx.attackerPos !== 'number' || typeof fx.defenderPos !== 'number') {
      out.push({ name: `entry[${idx}] attack-group._fxSnapshot 坐标缺失`, pass: false,
        detail: '需 attackerPos/defenderPos 均为 number' });
    }
  }

  // 4) buff-push：必须带 pushTargetUid 或 behindUid（位移目标可追溯）
  if (e.type === 'buff-push') {
    if (typeof e.pushTargetUid === 'undefined' && typeof e.behindUid === 'undefined') {
      out.push({ name: `entry[${idx}] buff-push 缺目标 uid`, pass: false,
        detail: 'buff-push 需 pushTargetUid 或 behindUid' });
    }
  }

  if (out.length === 0) out.push({ name: `entry[${idx}] 契约通过`, pass: true, detail: '' });
  return out;
}

// 对整段 log 跑契约，返回 { fail: [...], warn: [...], total }
export function assertRenderLog(log) {
  const fail = [];
  const warn = [];
  if (!Array.isArray(log)) {
    return { fail: [{ name: 'log 非数组', pass: false, detail: '传入的渲染日志必须是数组' }], warn: [], total: 0 };
  }
  log.forEach((e, idx) => {
    const res = checkEntry(e, idx);
    res.forEach(r => { (r.pass ? warn : fail).push(r); });
  });
  // 把「未知 type 提示」从 fail/warn 里挪到 warn（它们 pass=true，已在 warn）
  return { fail, warn: warn.filter(w => w.name.startsWith('entry') && w.detail === '未知类型，仅提示'), total: log.length };
}

// ---------- 自测（默认跑） ----------
function selftest() {
  let ok = true;
  const cases = [
    // 正向：应全部 pass
    { tag: '正-buff-swap 完整', entry: { type: 'buff-swap', swaps: [{ uid: 8, name: '空性', fromPos: 3, toPos: 5 }] }, expectFail: false },
    { tag: '正-attack-group 带快照', entry: { type: 'attack-group', _fxSnapshot: { attackerPos: 5, defenderPos: 2 } }, expectFail: false },
    { tag: '正-buff-push 带目标', entry: { type: 'buff-push', pushTargetUid: 3 }, expectFail: false },
    { tag: '正-txt 无名无碍', entry: { type: 'txt', text: 'hello' }, expectFail: false },
    // 负向：应 fail
    { tag: '负-buff-swap 掉 swaps', entry: { type: 'buff-swap' }, expectFail: true },
    { tag: '负-buff-swap swaps 缺 uid', entry: { type: 'buff-swap', swaps: [{ name: '空性', fromPos: 3, toPos: 5 }] }, expectFail: true },
    { tag: '负-attack-group 快照缺坐标', entry: { type: 'attack-group', _fxSnapshot: { attackerPos: 5 } }, expectFail: true },
    { tag: '负-buff-push 无目标', entry: { type: 'buff-push' }, expectFail: true },
    { tag: '负-缺 type', entry: { name: '无 type' }, expectFail: true },
  ];
  console.log('=== render-assert-skeleton --selftest ===');
  for (const c of cases) {
    const res = checkEntry(c.entry, 0);
    const failed = res.some(r => !r.pass);
    const got = failed; // 该条目是否产生了 fail
    const pass = (got === c.expectFail); // 期望 fail 的产生了 fail=对；期望 pass 的没产生 fail=对
    if (!pass) ok = false;
    console.log(`${pass ? '✅' : '❌'} ${c.tag} | 期望${c.expectFail ? 'fail' : 'pass'} 实际${got ? 'fail' : 'pass'}`);
  }
  // 整段装配自测：正向数组应 0 fail
  const goodLog = [
    { type: 'buff-swap', swaps: [{ uid: 8, name: '空性', fromPos: 3, toPos: 5 }] },
    { type: 'attack-group', _fxSnapshot: { attackerPos: 5, defenderPos: 2 } },
    { type: 'buff-push', pushTargetUid: 3 },
    { type: 'txt', text: 'x' },
  ];
  const r = assertRenderLog(goodLog);
  if (r.fail.length !== 0) { ok = false; console.log('❌ 正向装配应 0 fail，实际', r.fail.length); }
  else console.log(`✅ 正向装配 ${r.total} 条 0 fail`);
  console.log(ok ? 'SELFTEST_PASS' : 'SELFTEST_FAIL');
  return ok;
}

// ---------- 真实日志检查 ----------
function checkFile(path) {
  let raw;
  try { raw = readFileSync(path, 'utf8'); }
  catch (e) { console.error('读取失败:', e.message); process.exit(2); }
  let log;
  try { log = JSON.parse(raw); } catch (e) { console.error('JSON 解析失败:', e.message); process.exit(2); }
  const r = assertRenderLog(log);
  console.log(`=== render-assert 对 ${path}（${r.total} 条）===`);
  if (r.fail.length === 0) {
    console.log(`✅ 全部通过（warn ${r.warn.length} 条：多为未知 type 提示）`);
    process.exit(0);
  } else {
    console.log(`❌ ${r.fail.length} 条契约违例：`);
    r.fail.forEach(f => console.log(`  - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
}

const mode = process.argv[2] || '--selftest';
if (mode === '--selftest' || mode === undefined) {
  process.exit(selftest() ? 0 : 1);
} else if (mode === '--check') {
  const f = process.argv[3];
  if (!f) { console.error('用法: --check <file.json>'); process.exit(2); }
  checkFile(f);
} else {
  console.error('未知参数:', mode);
  process.exit(2);
}

// ================= 采集方式（给执行人） =================
// 真实渲染日志 = rules-replay / 回放器喂给健康规则的那个 `log` 数组（renderLog 产物）。
// 当前 rules-replay 的 DUMP=seed:stage 是文本；要拿 JSON 有两种现成路径：
//   ① 临时在 tests/rules-replay.mjs 的 runCase 末尾 `fs.writeFileSync('tmp_log.json', JSON.stringify(log))` 抓一场；
//   ② 或写一个极薄 harness import render/409 的 renderLog，喂合成 fact 序列，落 JSON。
// 抓到后 `node tests/render-assert-skeleton.mjs --check tmp_log.json` 即可机检演出层契约。
// 后续升级方向：把 ① 做成 rules-replay 的 `--emit-json` 开关，让本守门直接进 CI 真实链路。
