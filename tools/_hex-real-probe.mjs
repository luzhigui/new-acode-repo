// 临时探针（用完即删）：真实口径海克斯胜率——垫 shim 驱动 tools/116 的 kind:'hex' job，聚合口径复刻 tools/108。
// 用法：node tools/_hex-real-probe.mjs [每关场次=1000] [masterSeed]
import { readFileSync } from 'node:fs';

if (typeof localStorage === 'undefined') {
  const _ls = new Map();
  globalThis.localStorage = {
    getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
    setItem: (k, v) => { _ls.set(k, String(v)); },
    removeItem: (k) => { _ls.delete(k); },
    clear: () => _ls.clear()
  };
}
const _origFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const u = String(input);
  if (u.includes('200game-data.json')) {
    const buf = readFileSync(new URL('../content/200game-data.json', import.meta.url));
    return { ok: true, status: 200, json: async () => JSON.parse(buf.toString('utf-8')) };
  }
  if (_origFetch) return _origFetch(input, init);
  throw new Error('无 fetch 垫片可处理：' + u);
};

const mailbox = [];
globalThis.self = { postMessage: (m) => mailbox.push(m) };

await import('./116-role-balance-worker.js');

const PER = parseInt(process.argv[2] || '1000', 10);
const masterSeed = Number(process.argv[3]) || Date.now();
const STAGES = [1, 2, 3, 4, 5, 6, 7];

const t0 = Date.now();
const hexLogAll = [];
let id = 0;
for (const stage of STAGES) {
  const jobId = ++id;
  const seed = masterSeed + stage * 131;
  self.onmessage({ data: { jobId, kind: 'hex', stage, seed, startIndex: 0, runs: PER, lineupMode: 'normal' } });
  const msg = mailbox.filter((m) => m.jobId === jobId).pop();
  if (!msg || !msg.ok) { console.error(`第${stage}关失败：`, msg && msg.error); process.exit(1); }
  if (msg.hookErrors) console.error(`  ⚠ 第${stage}关 hook 运行时错误 ${msg.hookErrors} 次：`, msg.hookErrorSamples);
  hexLogAll.push(...msg.result.hexLog);
  console.error(`  第${stage}关 ${PER} 场完成（累计 ${hexLogAll.length}，${((Date.now() - t0) / 1000).toFixed(1)}s）`);
}

// ==== 聚合口径逐字复刻 tools/108-hex-dashboard.js render() ====
const HEX_NAME_MAP = {
  doubleStrike: '概率连击', horseFormation: '巨马阵', carry: '你就是carry', windAssault: '乘风突袭',
  cloudBody: '流云身法', mindControl: '惑人心智', fortify: '严阵以待', hotBlood: '热血奋战',
  meteorShower: '流星赶月', bloodthirst: '嗜血狂刀', holyFlame: '圣火令', soulDrain: '摄魂',
  holyFire: '圣火不熄', lastStand: '背水一战', unity: '众志成城'
};
const total = hexLogAll.length;
const allyWins = hexLogAll.filter((l) => l.winner === '明教').length;
const enemyWins = hexLogAll.filter((l) => l.winner === '六大派').length;
const draws = total - allyWins - enemyWins;
const noHex = hexLogAll.filter((l) => !(l.buffs || []).length);
const noHexRate = noHex.length ? noHex.filter((l) => l.winner === '明教').length / noHex.length * 100 : null;

const hexKeys = new Set();
hexLogAll.forEach((l) => (l.buffs || []).forEach((b) => hexKeys.add(b)));
const perKey = [];
for (const key of hexKeys) {
  const withHex = hexLogAll.filter((l) => (l.buffs || []).includes(key));
  perKey.push({ key, count: withHex.length, winRate: withHex.filter((l) => l.winner === '明教').length / withHex.length * 100 });
}
const avgRate = perKey.reduce((s, x) => s + x.winRate, 0) / perKey.length;
const diffs = perKey.map((x) => x.winRate - avgRate);
const sigma = Math.sqrt(diffs.reduce((s, d) => s + d * d, 0) / diffs.length);
const tagLine = Math.max(2, sigma);
perKey.sort((a, b) => (b.winRate - a.winRate) || (b.count - a.count));

console.log(`\n=== 真实口径（116 hex job + 108 聚合）｜每关 ${PER} 场｜共 ${total} 场 ===`);
console.log(`明教胜 ${allyWins} / 六大派胜 ${enemyWins} / 平局 ${draws}｜总胜率 ${(allyWins / total * 100).toFixed(1)}%`);
if (noHexRate !== null) console.log(`未抽到任何海克斯的局：${noHex.length} 场，明教胜率 ${noHexRate.toFixed(1)}%`);
console.log(`海克斯平均基准 ${avgRate.toFixed(1)}%｜判定线 ±${tagLine.toFixed(1)}%（σ 自适应）\n`);
console.log('海克斯'.padEnd(12) + '出场'.padStart(6) + '胜率'.padStart(9) + '差值'.padStart(9) + '  判定');
console.log('─'.repeat(46));
for (const r of perKey) {
  const d = r.winRate - avgRate;
  const tag = (r.count >= 10 && Math.abs(d) > tagLine) ? (d > 0 ? 'OP' : 'WEAK') : '-';
  console.log(
    (HEX_NAME_MAP[r.key] || r.key).padEnd(12)
    + String(r.count).padStart(6)
    + (r.winRate.toFixed(1) + '%').padStart(9)
    + ((d > 0 ? '+' : '') + d.toFixed(1) + '%').padStart(9)
    + '  ' + tag
  );
}
console.log(`\n总耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s｜masterSeed ${masterSeed}`);
