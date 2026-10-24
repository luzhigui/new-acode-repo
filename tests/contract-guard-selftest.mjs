#!/usr/bin/env node
// tests/contract-guard-selftest.mjs | V1.0.0 | 2026-10-24 第 127 轮
//
// 背景：18 颗 ATTR 变异牙的判定是「规则无牙·对照器兜住」——规则侧抓不到，全靠 stat-decl 对照器兜。
//   也就是说，对照器是这 18 颗牙**唯一**的证据来源。但它此前没有任何离线自检：
//   第 125 轮立过一条通规——「凡靠放弃归因来避免误报的白名单型判据，都是回放盲区（改坏不改数字）」，
//   静默位移判据照这条补了离线自检（silent-relocate-judge-selftest.mjs），对照器侧一直没补。本文件补上。
//
// 自检五条（全部离线、秒级，不跑变异树）：
//   ① 契约表可解析且规模不缩水 —— 对照器输出格式一改，逐契约行就解析不出来，
//      18 颗牙的「对照器兜住」会集体失去依据（且不会报错）。这是最要命的静默失效，故第一条就钉它。
//   ② 干净树逐契约 命中 必须全为 0 —— 这是 mutation-teeth V2.9.14「对照器侧不得作证」闸门
//      （干净树已命中的契约失去作证资格）为空操作的前提。一旦非零，闸门开始生效，必须让人知道。
//   ③ 恒空转契约（声明 0 且严格比对 0）白名单棘轮 —— 声明侧空 ⇒ 「偏差 0」是**没得比**而不是
//      「比过了没偏差」，这类契约守不住任何牙。当前已知 1 条 BAGUA_DEF（第 127 轮实测：group
//      baguaArray 账本 117 词条全是 atk，def 侧零条目 ⇒ 该契约永远无数据）。
//      白名单只允许收缩（新出现的恒空转契约一律判失败），**不**允许放宽。
//   ④ 牙→守卫契约 归属表逐条存在性校验 —— 契约改名会让归属静默失效。
//   ⑤ 守卫契约不得是恒空转契约 —— 否则「对照器兜住」就是自欺（守着它的是个死契约）。
//
// 局限（如实写）：本自检是**廉价绊线**，不是变异结论的替代。它只能保证「契约还在、还活着、名字没变」，
//   不能证明「该契约真的能抓住这颗牙」——后者只有全量跑 46 棵变异树才能回答（约 6 分半）。
//
// 用法：node tests/contract-guard-selftest.mjs
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const VER = 'tests/contract-guard-selftest.mjs V1.0.0';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// ③ 恒空转契约白名单（只允许收缩，不允许新增）。
//   **第 128 轮收缩：2 条 → 1 条** —— 原第二条 HLS_JIUYANG_HEAL 不是样本问题，是**契约绑定键过期**：
//   它绑 label === '九阳神拳回复'，主代码实际发的是 '左拳·九阳回复'（modules/27elite-mingjiao-hanlisa.js L80），
//   全库检索旧键零命中 ⇒ 声明侧恒 0 ⇒ 严格比对恒 0 ⇒ 61 条账本词条一条没比对上（真·假绿）。
//   本轮已按主代码实际 label 精确重绑，修复后实测「声明 61 条 · 严格比对 61 条 · 偏差 0」⇒ 从白名单移出。
//
//   现只剩 1 条：BAGUA_DEF（group「baguaArray」账本 117 词条全是 atk，def 侧零条目）。
//   **性质更正（第 128 轮）**：它不是缺陷，是**设计上的回归哨兵**——契约头注释已写明，
//   2026-10-08 改版（老板拍板）删掉了「-1攻+1防」对冲、八卦阵不再加防，defDelta 恒发 0 只为保住三字段。
//   故第 127 轮「等主代码补发 def 侧…或撤除契约」的待办方向应作废：撤除会丢掉"未来改版若恢复加防则自动激活"的哨兵能力。
//   处置：保留在白名单，不撤除、不静默加白名单了事（已按棘轮钉住，新增恒空转契约一律转红）。
const KNOWN_ZERO_TRIGGER = ['BAGUA_DEF'];

// ④ 牙 → 守卫契约（第 127 轮全量重跑 46 棵变异树实测，逐颗牙的对照器命中归属 1:1 且无错配）。
//   格式：牙 ID → 命中它的契约名。实测每颗牙都只被**一条**契约命中（多契约命中属异常，见 ④b）。
const TEETH_GUARDIAN = {
    A1: 'BREAK_DEF', A2: 'FORTIFY', A3: 'CARRY_APPLY', A4: 'ZHANG_SWITCH',
    A5: 'METEOR_GROWTH', A6: 'KU_LIAN', A7: 'ENDLESS_BREATH', A8: 'BUTTERFLY',
    A9: 'BAGUA_ATK', A10: 'RAGE_ON_HIT', A11: 'WEI_HEAL', A12: 'XING_FEN_COST',
    A13: 'XING_FEN_COST', A14: 'LION_INSPIRE', A15: 'LION_GROW', A16: 'RANGED_GROWTH',
    A17: 'SPIDER_MASTERY', A18: 'KU_LIAN', A19: 'BUTTERFLY', A20: 'LEECH_MAXHP',
    A21: 'SPIDER_TRANSFORM', A22: 'STAT_CHANGE', A23: 'RIGHTEOUS_FACE', A24: 'AURA',
    A25: 'HOLY_FLAME', A28: 'SOUL_DRAIN',
    T2: 'FORTIFY', T3: 'METEOR_GROWTH', T7: 'KU_LIAN'
};

// ① 规模下限：第 127 轮实测 56 条契约。低于此值说明契约被删或输出解析不全。
const MIN_CONTRACTS = 50;

function runComparer() {
    const r = spawnSync(process.execPath, [path.join(root, 'tests/stat-decl-vs-actual-check.mjs')],
        { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return ((r.stdout || '') + '\n' + (r.stderr || ''));
}

function parseContracts(out) {
    // 行形如：LEECH_MAXHP  声明  185 条 · 命中 0 · 歧义跳过 0 · 严格比对  185 条 / 偏差 0
    const list = [];
    for (const line of out.split('\n')) {
        const m = line.match(/^([A-Z][A-Z_0-9]*)\s+声明\s+(\d+)\s+条\s+·\s+命中\s+(\d+)\s+·\s+歧义跳过\s+(\d+)\s+·\s+严格比对\s+(\d+)\s+条\s*\/\s*偏差\s+(\d+)/);
        if (m) {
            list.push({
                id: m[1], decl: Number(m[2]), hit: Number(m[3]),
                skip: Number(m[4]), strict: Number(m[5]), mismatch: Number(m[6])
            });
        }
    }
    return list;
}

const fails = [];
const notes = [];

const out = runComparer();
const contracts = parseContracts(out);

// ① 契约表可解析 + 规模不缩水
if (contracts.length < MIN_CONTRACTS) {
    fails.push(`① 契约表解析到 ${contracts.length} 条，低于下限 ${MIN_CONTRACTS} —— `
        + '对照器输出格式可能已变（逐契约行解析不出 ⇒ 18 颗 ATTR 牙的「对照器兜住」集体失去依据，且不报错）');
} else {
    notes.push(`① 契约表解析正常：${contracts.length} 条（下限 ${MIN_CONTRACTS}）`);
}

const byId = new Map(contracts.map(c => [c.id, c]));

// ② 干净树逐契约 命中 必须全为 0
const dirty = contracts.filter(c => c.hit > 0);
if (dirty.length) {
    fails.push(`② 干净树上有 ${dirty.length} 条契约命中>0（${dirty.map(c => c.id + ':' + c.hit).join('、')}）`
        + ' —— 对照器自身已在报红；同时 mutation-teeth 的「对照器侧不得作证」闸门开始生效，'
        + '被判定为脏的契约其命中不再计入「有牙」，牙口结论会整体降级');
} else {
    notes.push(`② 干净树 ${contracts.length} 条契约命中皆为 0 —— 「不得作证」闸门当前为空操作（零判定迁移）`);
}

// ③ 恒空转契约棘轮（只允许收缩）
const zeroTrigger = contracts.filter(c => c.decl === 0 && c.strict === 0).map(c => c.id);
const unknownZero = zeroTrigger.filter(id => !KNOWN_ZERO_TRIGGER.includes(id));
if (unknownZero.length) {
    fails.push(`③ 新增恒空转契约 ${unknownZero.length} 条（${unknownZero.join('、')}）`
        + ' —— 声明 0 且严格比对 0 ⇒ 「偏差 0」是没得比、不是比过了没偏差，这类契约守不住任何牙；'
        + '已知白名单只允许收缩，新增一律判失败');
} else {
    // 把「账本有值却比对不上」的量级显式报出来：这些词条改错了查不出，是实打实的覆盖缺口。
    const blind = [];
    let blindEntries = 0;
    for (const line of out.split('\n')) {
        const m = line.match(/零触发.*?：([A-Z][A-Z_0-9]*)\s+在\s+\d+\s+场无声明.*?账本已出现\s+(\d+)\s+词条/);
        if (m && zeroTrigger.includes(m[1])) { blind.push(`${m[1]}(账本${m[2]}条)`); blindEntries += Number(m[2]); }
    }
    notes.push(`③ 恒空转契约 ${zeroTrigger.length} 条，全部在已知白名单内 —— 无新增；`
        + `但它们守着的账本词条合计 ${blindEntries} 条（${blind.join('、')}）一条都没比对上`
        + ' ⇒ 这部分数值改错查不出，已立待办（不是放宽，是如实标注）');
}

// ④ 牙→守卫契约 归属表存在性
const missing = [];
for (const [tooth, cid] of Object.entries(TEETH_GUARDIAN)) {
    if (!byId.has(cid)) missing.push(`${tooth}→${cid}`);
}
if (missing.length) {
    fails.push(`④ 归属表里有 ${missing.length} 项指向不存在的契约（${missing.join('、')}）`
        + ' —— 契约改名会让该牙的「对照器兜住」静默失效');
} else {
    notes.push(`④ 归属表 ${Object.keys(TEETH_GUARDIAN).length} 项逐条命中现存契约，无改名失效`);
}

// ⑤ 守卫契约不得是恒空转契约
const deadGuard = [];
for (const [tooth, cid] of Object.entries(TEETH_GUARDIAN)) {
    if (zeroTrigger.includes(cid)) deadGuard.push(`${tooth}→${cid}`);
}
if (deadGuard.length) {
    fails.push(`⑤ ${deadGuard.length} 颗牙的守卫契约是恒空转契约（${deadGuard.join('、')}）`
        + ' —— 守着它的是个死契约，「对照器兜住」属自欺');
} else {
    notes.push(`⑤ ${Object.keys(TEETH_GUARDIAN).length} 项守卫契约均非恒空转，无「死契约兜住」假象`);
}

for (const n of notes) console.log('  ✅ ' + n);
if (fails.length) {
    console.log(`\n❌ 对照器守卫自检失败 ${fails.length}/${notes.length + fails.length} 项：`);
    for (const f of fails) console.log('  ❌ ' + f);
    process.exit(1);
}
console.log(`\n✅ 对照器守卫自检通过（${notes.length}/${notes.length} 项断言：契约表可解析 / 干净树零命中 / 恒空转棘轮 / 归属表存在 / 守卫非死契约）`);
process.exit(0);
