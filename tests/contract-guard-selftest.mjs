#!/usr/bin/env node
// tests/contract-guard-selftest.mjs | V1.3.0 | 2026-10-27 夜间第 142 轮：薄取样档 ——
//   ②③⑤ 在「取样不为空但极小」时仍会恒过（第 141 轮点名的同一类盲区余量），本轮把判定的
//   空-成立门槛从 0 抬到「规模下限的一半」；红由 ① 无条件兜住，另加 ⑥d 门槛自证
// tests/contract-guard-selftest.mjs | V1.2.0 | 2026-10-27 夜间第 141 轮：空取样闸门 —— 崩时下游结论一律标「不成立」
//   （含②③⑤ 三条空转假绿的收口，与 ⑥ 三条自证断言）
// tests/contract-guard-selftest.mjs | V1.1.0 | 2026-10-27 夜间第 140 轮：新增判据 ⓪（对照器崩溃预检）
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

export const VER = 'tests/contract-guard-selftest.mjs V1.3.0';

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

// 薄取样上限（2026-10-27 夜间第 142 轮新增）：低于 MIN_CONTRACTS 的一半即视为「取样不足」。
//   起因是第 141 轮自己点名的余量 —— ②③⑤ 只在取样**恰好为 0** 时才标「不成立」，
//   取样是 1 至 5 条时它们的「零命中 / 无新增恒空转 / 守卫非空转」照样是 ✅，
//   而"从 3 条里看出 0 条命中"根本推不出"剩下 53 条也没命中" —— 这是同一类假绿，只是换了个体量。
//   取 MIN_CONTRACTS 的一半是为了不另抄魔数：门槛随规模闸门联动抬降。
//   注意它恒小于 MIN_CONTRACTS ⇒ 凡判「薄」必然同时触 ① 的无条件失败，红不会丢（见 ① 处注释）。
const THIN_SAMPLE_MAX = Math.floor(MIN_CONTRACTS / 2);

// ⑥b 规模下限：第 127 轮全量重跑 46 棵变异树实测 29 项「牙 → 守卫契约」归属。
//   低于此值说明归属表被误删 —— 表一空，④ 就什么都不用比、恒过，属静默失效。
const MIN_GUARDIAN = 25;

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
// 空转不成立清单（2026-10-27 夜间第 141 轮新增）：取样为空时，依赖该取样的结论既**不是通过也不是失败**，
//   而是「没得判」。此前这类结论两头骗人 —— ②③⑤ 因集合为空而恒过（空转假绿），
//   ④ 因契约表 0 条而 29 项全「不存在」并归因成「契约改名」（空转假红、且指错方向）。
//   故单列一档，不计绿也不计红，逐条写明为什么不成立。
const vacuous = [];

const out = runComparer();
const contracts = parseContracts(out);

// 崩溃行识别正则。抽成常量是为了 ⑥a 能拿合成样本自证它没腐烂 —— 它一旦失配，
//   ① 就会被重新归因成「输出格式漂移」，又回到第 140 轮之前「56 条噪音淹没真因」的老路。
const CRASH_RE = /对照器异常|^\s*Error:|throw |台词池缺失|击杀台词池缺失/;

// ⓪ 对照器自身必须跑完（2026-10-27 夜间第 140 轮新增）—— 起因：上游 5818419a 把小昭·姊职业改成
//   「蝴蝶」却漏补 taunts 池，对照器一跑到她开口就 throw「台词池缺失」，stdout 整片为空；
//   而既有的 ①~⑤ 全把"解析不出 / 恒空"归因为「输出格式变了 / 契约改名」，
//   **真因被 56 条同根因噪音淹没**，白天会话照着报错去改解析正则只会越改越错。
//   故先钉一条：对照器崩 ⇒ 下面所有解析结论一律不成立，先修对照器（主代码侧），不许拿解析结论当真。
const crashLine = out.split('\n').find(l => CRASH_RE.test(l));
const CRASH_FLAG = Boolean(crashLine);
// 取样为空 ⇒ ①~⑤ 中凡依赖取样的结论全部「没得判」。
const SAMPLE_EMPTY = contracts.length === 0;
// 取样薄（2026-10-27 夜间第 142 轮新增）：条数 > 0 但远低于规模闸门 ⇒ ②③⑤ 的结论是**查不全**
//   得出的：25 条里没有命中，推不出 56 条里没有命中。与空取样同一处置：标「不成立」，不计绿也不计红。
const SAMPLE_THIN = contracts.length > 0 && contracts.length < THIN_SAMPLE_MAX;
const SAMPLE_INSUFFICIENT = SAMPLE_EMPTY || SAMPLE_THIN;
const SAMPLE_STATE = SAMPLE_EMPTY
    ? '取样 0 条（对照器未产出任何契约行）'
    : `取样仅 ${contracts.length} 条（低于 ${THIN_SAMPLE_MAX} 条的薄取样线，历史基线 ${MIN_CONTRACTS}+ 条）`;

// 取样不足时的取舍原则（第 142 轮立，下轮沿用）：**有罪证据不受取样量影响，无罪结论受取样量影响**。
//   ①②③ 里真抓到的东西（② 干净树有命中、③ 白名单外的新增恒空转、以及 ① 规模不够本身）
//   是「查到了坏消息」—— 取样再少也是实打实的坏消息，故一律照判失败，不因取样薄而豁免；
//   ②③⑤ 的"没查出问题"（② 零命中、③ 无新增、⑤ 守卫没进恒空转集合）是「没等到坏消息」——
//   只查了 3 条就说 56 条都没问题不成立，故一律标「不成立」，也不许它冒充 ✅。

if (crashLine) {
    fails.push('⓪ 对照器本次根本没跑完（异常中断）：' + crashLine.trim().slice(0, 160)
        + ' —— 下述 ①~⑤ 的解析结论**全部不成立**（拿空输出去判"格式漂移/契约改名"是假诊断），'
        + '先修对照器崩这一条主代码回归，再谈解析');
}

// ① 契约表可解析 + 规模不缩水。**无条件判失败**（不因 ⓪ 命中而豁免）：
//   这是防静默绿的兜底闸门 —— 即便 ⓪ 的崩溃正则哪天失配，0 条也必然在此报出，整条线不至于转绿。
//   第 141 轮只改归因文案：崩已知时明说「同根因、别去改解析正则」，未崩时才说「格式可能已变」。
if (contracts.length < MIN_CONTRACTS) {
    fails.push(`① 契约表解析到 ${contracts.length} 条，低于下限 ${MIN_CONTRACTS} —— `
        + (CRASH_FLAG
            ? '取样为空且 ⓪ 已判定对照器崩溃 ⇒ 本条与 ⓪ **同根因**（不是输出格式漂移，别去改解析正则）'
            : '对照器输出格式可能已变（逐契约行解析不出 ⇒ 18 颗 ATTR 牙的「对照器兜住」集体失去依据，且不报错）'));
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
} else if (SAMPLE_INSUFFICIENT) {
    // 第 141 轮收口（0 条）+ 第 142 轮扩到薄取样：N 条「零命中」是**没得比**，不是比过没问题。
    vacuous.push(`② 「干净树零命中」不成立 —— ${SAMPLE_STATE}，零命中是没得比、不是比过没问题`
        + '（mutation-teeth「对照器侧不得作证」闸门此刻无从判断）');
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
} else if (SAMPLE_INSUFFICIENT) {
    // 第 141 轮收口（0 条）+ 第 142 轮扩到薄取样：少量契约时棘轮只咬得住这区区几条，新增恒空转会被漏掉。
    vacuous.push(`③ 恒空转契约棘轮不成立 —— ${SAMPLE_STATE}，白名单收缩与否无从判断`
        + '（此刻新增的恒空转契约会被漏掉，棘轮暂时失效）');
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
const guardCount = Object.keys(TEETH_GUARDIAN).length;
if (SAMPLE_INSUFFICIENT) {
    // 第 141 轮收口（0 条）+ 第 142 轮扩到薄取样：取样不足时逐条「不存在」分不清是**真改名**还是**没取样到**，
    //   第 140 轮正是把白天会话引向「查契约是不是改名了」的方向，属指错方向，故不计入失败。
    //   归属明细照常列出（信息不丢），只是不定性；定性所需的前提（取样完整）此刻不成立。
    vacuous.push(`④ 归属表 ${guardCount} 项存在性校验不成立 —— ${SAMPLE_STATE}，`
        + `其中 ${missing.length} 项查不到对应契约（${missing.slice(0, 8).join('、') || '无'}）`
        + ' ⇒ 无法区分「契约真改名」与「取样没带到」，不作改名定性（红由 ① 无条件兜住）');
} else if (missing.length) {
    fails.push(`④ 归属表里有 ${missing.length} 项指向不存在的契约（${missing.join('、')}）`
        + ' —— 契约改名会让该牙的「对照器兜住」静默失效');
} else {
    notes.push(`④ 归属表 ${guardCount} 项逐条命中现存契约，无改名失效`);
}

// ⑤ 守卫契约不得是恒空转契约
const deadGuard = [];
for (const [tooth, cid] of Object.entries(TEETH_GUARDIAN)) {
    if (zeroTrigger.includes(cid)) deadGuard.push(`${tooth}→${cid}`);
}
if (SAMPLE_INSUFFICIENT) {
    // 第 141 轮收口（0 条）+ 第 142 轮扩到薄取样：零恒空转是「一个都没查 / 只查了这几条」，不是「查过都没问题」。
    vacuous.push(`⑤ 守卫契约非空转校验不成立 —— ${SAMPLE_STATE}，`
        + `恒空转集合里查到 ${deadGuard.length} 项守卫契约（${deadGuard.slice(0, 6).join('、') || '无'}）`
        + ' ⇒ 取样不足时「decl 0 / strict 0」可能是对照器中途中断所致，不作死契约定性，明细照列（信息不丢）');
} else if (deadGuard.length) {
    fails.push(`⑤ ${deadGuard.length} 颗牙的守卫契约是恒空转契约（${deadGuard.join('、')}）`
        + ' —— 守着它的是个死契约，「对照器兜住」属自欺');
} else {
    notes.push(`⑤ ${guardCount} 项守卫契约均非恒空转，无「死契约兜住」假象`);
}

// ⑥ 自证断言（2026-10-27 夜间第 141 轮新增）—— 本线自己的抽取器与闸门腐烂时，先把自己报红：
//   不许恒绿（那是假绿），也不许恒红（那是噪音）。三条各守一个腐烂面。
//   ⑥a 崩溃正则失配 ⇒ ⓪ 失效，① 会被重新归因成「格式漂移」，本线开始指错方向；
//   ⑥b 归属表被清空 ⇒ ④ 什么都不用比就恒过，属静默失效；
//   ⑥c 契约行解析器腐烂 ⇒ ① 恒红、②③⑤ 恒空转，本线结论全不可信。
{
    const synthCrash = '对照器异常： Error: 台词池缺失: 小昭·姊';
    if (!CRASH_RE.test(synthCrash)) {
        fails.push('⑥a 崩溃行识别正则在合成崩溃样本上失配 —— ⓪ 已失效，'
            + '① 会被重新归因成「输出格式漂移」，本线开始指错方向（先修本文件，不是主代码）');
    } else {
        notes.push('⑥a 崩溃行识别正则在合成崩溃样本上命中 —— ⓪ 未腐烂');
    }

    if (guardCount < MIN_GUARDIAN) {
        fails.push(`⑥b 牙→守卫契约 归属表只剩 ${guardCount} 项，低于下限 ${MIN_GUARDIAN} —— `
            + '表被清空会让 ④ 恒过（什么都不用比就"无改名失效"）');
    } else {
        notes.push(`⑥b 归属表 ${guardCount} 项（下限 ${MIN_GUARDIAN}）—— ④ 不会因表被清空而恒过`);
    }

    const synthLine = 'LEECH_MAXHP  声明  185 条 · 命中 0 · 歧义跳过 0 · 严格比对  185 条 / 偏差 0';
    if (parseContracts(synthLine).length !== 1) {
        fails.push('⑥c 契约行解析器在合成样本上解析不出 1 条 —— 解析器已腐烂，'
            + '① 会恒红、②③⑤ 会恒空转，本线结论全不可信（先修本文件）');
    } else {
        notes.push('⑥c 契约行解析器在合成契约行上解析正常 —— 抽取器未腐烂');
    }

    // ⑥d（2026-10-27 夜间第 142 轮新增）—— 薄取样门槛本身必须站得住：
    //   取 0 ⇒ ②③⑤ 退回第 141 轮之前「1 至 5 条也判全绿」的老盲区；
    //   ≥ MIN_CONTRACTS ⇒ 门槛高过规模闸门，取样永远算「薄」，②③⑤ 从此永不判、等于被静默拆掉。
    if (!(THIN_SAMPLE_MAX > 0 && THIN_SAMPLE_MAX < MIN_CONTRACTS)) {
        fails.push(`⑥d 薄取样门槛 ${THIN_SAMPLE_MAX} 失位（须满足 0 < 门槛 < ${MIN_CONTRACTS}）`
            + ' —— 门槛为 0 则②③⑤ 退回「极少量取样也判全绿」的老盲区；'
            + '门槛 ≥ 规模下限则②③⑤ 从此永不判、等于被静默拆掉（先修本文件的常量，不是主代码）');
    } else {
        notes.push(`⑥d 薄取样门槛 ${THIN_SAMPLE_MAX} 条落在合理区间（0 < ${THIN_SAMPLE_MAX} < ${MIN_CONTRACTS}）`
            + ' —— ②③⑤ 既不恒绿也不恒虚');
    }
}

for (const n of notes) console.log('  ✅ ' + n);
for (const v of vacuous) console.log('  ⚠️  ' + v);
if (fails.length) {
    console.log(`\n❌ 对照器守卫自检失败 ${fails.length}/${notes.length + vacuous.length + fails.length} 项`
        + (vacuous.length ? `（另有 ${vacuous.length} 项因取样不足**不成立**，不计绿也不计红）` : '') + '：');
    for (const f of fails) console.log('  ❌ ' + f);
    process.exit(1);
}
console.log(`\n✅ 对照器守卫自检通过（${notes.length}/${notes.length} 项断言：契约表可解析 / 干净树零命中 / 恒空转棘轮 / 归属表存在 / 守卫非死契约 / 自证四条）`);
process.exit(0);
