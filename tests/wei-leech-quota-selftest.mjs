// tests/wei-leech-quota-selftest.mjs | V1.0.0 | 2026-11-08 夜间第 195 轮
//
// 干什么：给 tests/health-rules/159-wei-bloodsiphon.js 的判据 A2/A3 装一组**离线自检**。
//
// 为什么要有它：第 195 轮把 A2 由「heal ≤ 出手快照缺口」改为「heal ≤ nominal ≤ actual」的额度自洽链，
//   因为前者证据腿不齐（快照 hp 被 fmtHp 四舍五入；同帧前序吸血已抬 maxHp，快照缺口不等于落账缺口）。
//   **任何放宽都必须同时证明它还能咬住原本要咬的东西**——否则就是用「改判据」换来一次绿色。
//   回放看不出这件事：修前 fail=1、修后 fail=0，两者在 156 场里数字都很小，
//   真正「报大数」的回归在回放里可能一场都不出现。故必须离线喂样本，正反两侧都咬一遍。
//
// 样本全部照抄主代码真实落盘形态（core/216 声明期 / core/217 LEECH handler 回写）：
//   fact = { unitName, heal, newMaxHp, maxHpDelta, healActual, healNominal }
//   父攻击 fact = { factType:'attack', data:{ attacker:{name,hp,maxHp,uid}, snap:{attackerHp,attackerHpReal}, dmgResult:{dmg} } }
//
// 退出码：0 = 全部断言通过；1 = 有断言不符（判据被改坏或被改松）。
//
// V1.0.0 | 2026-11-08 夜间第 195 轮：新建。12 条牙（正向 5 / 反向 7），
//   专咬「把额度链改回去」与「把口径改成只看 heal 大小」两类退化。
export const VER = 'tests/wei-leech-quota-selftest.mjs V1.0.0';

import { fileURLToPath } from 'node:url';

// Node 22 的 fetch 不认 file:// 协议 ⇒ core/201 的 loadGameData 会直接 fetch failed。
//   与 tests/buff-rules-case.mjs 同款兜底：把 fetch 指向 readFileSync。
globalThis.fetch = async (url) => {
    const fs = await import('node:fs');
    const text = fs.readFileSync(fileURLToPath(new URL(url)), 'utf8');
    return { ok: true, json: async () => JSON.parse(text) };
};

import { rule106 } from './health-rules/159-wei-bloodsiphon.js';
import { loadGameData } from '../core/201-config-5v5-test.js';

// 比例上限判据（A4）依赖 gameData 里的韦一笑 mechanics.leech.maxRatio：
//   独立进程若不先加载游戏数据，getMechanicField 返回 undefined，A4 会被静默跳过（不是判据坏，是数据没就位）。
//   故这里显式加载；加载失败则 A4 相关样本标「不适用」，绝不假装咬过。
let dataReady = false;
try {
    await loadGameData();   // 异步（fetch content/001-game-data.json），必须 await，漏了会静默拿到 null
    dataReady = true;
} catch (e) {
    dataReady = false;
    console.log('⚠ gameData 加载失败：' + (e && e.message ? e.message : e));
}

const WEI = { name: '韦一笑', uid: 101 };

// 构造一场最小的 fact 流：一条攻击 + 一条 weiLeech。log 非空即可（规则首行 n===0 才 skip）。
function makeCase(opts) {
    const attack = {
        factType: 'attack',
        data: {
            attacker: { ...WEI, hp: opts.snapHp, maxHp: opts.snapMaxHp },
            snap: opts.snapReal != null ? { attackerHpReal: opts.snapReal } : {},
            dmgResult: { dmg: opts.dmg != null ? opts.dmg : 10 }
        }
    };
    const leech = {
        factType: 'weiLeech',
        data: { ...WEI, heal: opts.heal, healActual: opts.healActual, healNominal: opts.healNominal, newMaxHp: 100, maxHpDelta: opts.heal }
    };
    return { log: [{ text: '🦇 青翼蝠王·吸血+' + opts.heal }], facts: [attack, leech] };
}

function run(opts) {
    const c = makeCase(opts);
    const res = rule106.test({}, c.log, [], [], [], [], c.facts);
    if (res === 'skip') return 'skip';
    return res && res.fail ? 'fail' : 'pass';
}

const CASES = [
    // ── 反向（不许放过）：真正「报大数 / 落超缺口」的回归必须仍判红 ──
    ['R1 落地值大于声明额度（报大数）', { snapHp: 50, snapMaxHp: 100, heal: 9, healActual: 9, healNominal: 4 }, 'fail'],
    ['R2 快照满血却落下 +3，且无额度链可核', { snapHp: 100, snapMaxHp: 100, heal: 3, healActual: null, healNominal: null }, 'fail'],
    ['R3 落地值超过快照缺口且额度链自相矛盾', { snapHp: 80, snapMaxHp: 100, heal: 30, healActual: 12, healNominal: 12 }, 'fail'],
    ['R4 heal 为小数（previewHeal 出口取整被改）', { snapHp: 50, snapMaxHp: 100, heal: 2.5, healActual: 2, healNominal: 2 }, 'fail'],
    ['R5 heal 为负（方向写反）', { snapHp: 50, snapMaxHp: 100, heal: -2, healActual: -2, healNominal: -2 }, 'fail'],
    ['R6 缺口充足却落 0、额度链说应落 5（max(1) 漏守）', { snapHp: 50, snapMaxHp: 100, heal: 0, healActual: 0, healNominal: 5 }, 'fail'],
    ['R7 比例上限越界（+40 远超 dmg×0.35）', { snapHp: 10, snapMaxHp: 200, heal: 40, healActual: 40, healNominal: 40, dmg: 20 }, 'fail'],

    // ── 正向（不许误报）：第 195 轮实测出来的两类误报面必须判绿 ──
    // seed=19 stage=7 原型：快照 hp/maxHp 取整后同为 27，真实 26.6/27，heal=1 合法
    ['P1 快照取整掩盖了 0.4 缺口（seed19s7 原型）', { snapHp: 27, snapMaxHp: 27, snapReal: 26.6, heal: 1, healActual: 1, healNominal: 1 }, 'pass'],
    // seed=6 stage=2 原型：快照 real 98.01 / maxHp 已被同帧前序吸血抬到 102，heal=4、nominal=3.96
    ['P2 同帧前序吸血抬高上限（seed6s2 原型）', { snapHp: 98, snapMaxHp: 102, snapReal: 98.01, heal: 4, healActual: 4, healNominal: 3.96 }, 'pass'],
    ['P3 满血落 0（previewHeal 夹缺口，合法）', { snapHp: 100, snapMaxHp: 100, heal: 0, healActual: 0, healNominal: 0 }, 'pass'],
    ['P4 有缺口正常落地', { snapHp: 60, snapMaxHp: 100, heal: 5, healActual: 5, healNominal: 5, dmg: 40 }, 'pass'],
    ['P5 小缺口落 1（floor 后夹到 1）', { snapHp: 99.6, snapMaxHp: 100, snapReal: 99.6, heal: 1, healActual: 1, healNominal: 1 }, 'pass']
];

let bad = 0;
let skipped = 0;
for (const [name, opts, want] of CASES) {
    // R7 专测 A4 比例上限，需要真实 maxRatio；数据没就位时如实跳过并计入「未覆盖」，不记通过。
    if (name.startsWith('R7') && !dataReady) {
        skipped++;
        console.log(`⏭ ${name}：gameData 未加载，A4 无从核对（未覆盖，不计通过）`);
        continue;
    }
    const got = run(opts);
    if (got !== want) {
        bad++;
        console.log(`❌ ${name}：期望 ${want}，实得 ${got}`);
    }
}
if (bad === 0) {
    const pos = CASES.filter(c => c[2] === 'pass').length;
    const neg = CASES.filter(c => c[2] === 'fail').length - skipped;
    console.log(`✅ 韦一笑吸血额度判据自检通过（${CASES.length - skipped} 条：正向 ${pos} 条零误报 / 反向 ${neg} 条全咬住${skipped ? '；另有 ' + skipped + ' 条未覆盖' : ''}）`);
    process.exit(0);
}
console.log(`❌ 韦一笑吸血额度判据自检失败 ${bad} 条`);
process.exit(1);
