#!/usr/bin/env node
// tests/rule-idle-selftest.mjs | V1.1.0 | 2026-10-27 夜间第 143 轮：接公共取样判定器（tests/_lib/sample-sufficiency.mjs），
//   把「样本塌了」与「判据真漂移」分开报。此前规模闸门（⑤）只管喊"结论不可信"，收到同一份报告的人
//   却仍会看到一串「新增恒空转（不在白名单）⇒ 三种病因之一，必须取证后修」—— 样本被裁时几乎每条
//   规则都会 pass=0 fail=0，这里会一次性报出几十条，而真因只有一条（样本规模），属第 140 轮点名过的
//   同根因噪音淹没真因。本轮：规模闸门照旧无条件红（防静默绿），新增恒空转在取样不足时**收口成一条
//   「不成立」**并写明真因先查样本规模；★ 是收口不是豁免 —— 收口后红由规模闸门兜住，退码仍为 1。
// tests/rule-idle-selftest.mjs | V1.0.0 | 2026-10-25 第 130 轮
//
// 背景（为什么要有它，务必先读）：
//   契约侧早就有「恒空转契约」棘轮（contract-guard-selftest 第③条，只许收缩不许新增），
//   **规则侧一直没有同款**。第 129 轮在交付「规则绑定键漂移自检」时把它点名为下轮最高优先：
//   那条自检只保证"键还在、零命中会红"，**不能**证明规则真的还在判定。
//   规则侧的风险更隐蔽，而且三种病因的表现完全一样、回放数字一模一样、肉眼撞不见：
//     ① 样本没覆盖（机制在这 140 场里根本没被构造出来）⇒ 该扩样本；
//     ② 判据键过期（主代码改文案，规则还认旧键）⇒ 真·假绿，属缺陷，必须修；
//     ③ 数据源错位（扫不到 entries 子条目这类）⇒ 真·假绿，属缺陷，必须修。
//   三者都表现为 pass=0 fail=0 全 skip，回放汇总只打一个 ⏭ 就过去了（第 128 轮立的通规：
//   「白名单型 / 静默判据都是回放盲区」的又一次应验）。本自检就是来把这个盲区做成常驻绊线。
//
// 口径（与契约侧恒空转棘轮对齐，棘轮只许收缩）：
//   跑标准样本（20seed × 7 关 = 140 场）回放，取逐条规则 pass / fail / skip 计数：
//     ① 恒空转 = pass === 0 && fail === 0（整份样本一次都没真正判定过）
//     ② 恒空转集合必须**恰好等于**白名单集合：
//        - 白名单外出现新的恒空转 ⇒ 红（新盲区：要么取证登记、要么修，不许静默放行）
//        - 白名单条目已不再恒空转（被激活 / 被删除）⇒ 红（白名单必须同步收缩，防腐烂）
//     ③ 白名单条目必须仍出现在规则名集合里（规则改名后白名单静默失效 ⇒ 红）
//     ④ 白名单条目对应的规则文件必须仍在 tests/health-rules/ 下（文件被删后白名单静默失效 ⇒ 红）
//     ⑤ 规模闸门：样本场次 ≥ MIN_CASES、规则条数 ≥ MIN_RULES —— 防样本或规则被批量裁剪后自检恒绿
//
// 数据来源：复用 tests/rules-replay.mjs 的真实回放（已在第 130 轮加了 RULE_STATS_OUT 落盘口径，
//   仅在该环境变量显式设置时才写文件，默认零副作用），**不另造一套判据**，避免两套口径分叉。
//
// 与既有自检的分工：rule-binding-drift-selftest 盯「键还在不在」（静态，快）；
//   本自检盯「规则到底判定过没有」（运行时，~4s），两者互补，缺一都可能漏。
//
// 用法：node tests/rule-idle-selftest.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const VER = 'tests/rule-idle-selftest.mjs V1.1.0';

// 取样充分性判定与对照器守卫 / 契约绑定 / fact 普查共用同一份口径，不另写一份。
import {
    judgeSample, checkThreshold, selfCheck
} from './_lib/sample-sufficiency.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const RULE_DIR = path.join(root, 'tests', 'health-rules');

// 规模闸门：低于此值说明样本被裁或规则被批量删除 ⇒ 自检结论不可信（防静默恒绿）
const MIN_CASES = 140;
const MIN_RULES = 45;

// 恒空转白名单（棘轮：只许收缩不许新增；每一条都必须写明「为什么它不是缺陷」）
const IDLE_WHITELIST = [
    {
        name: '流星溅射成长渲染形态(单位名/重复)',
        file: '155-meteor-growth-dup.js',
        why: '样本未覆盖（非判据失效）：该规则的触发形态（流星溅射成长 + 渲染重复）在标准 20seed×7关样本里一次都没被构造出来 ⇒ 恒 skip 属样本不足。第 121 轮已取证并登记挂账③「155 扩样本等拍板」。★ 扩样本后若仍恒空转，则性质变为②判据漂移（接线松了），必须修并从本白名单移出 —— 不得靠留白名单让它继续静默'
    }
];

function fail(msg) {
    console.log('  ❌ ' + msg);
    return msg;
}

function main() {
    const tmp = path.join(os.tmpdir(), 'rule-idle-stats-' + process.pid + '.json');
    const res = spawnSync(process.execPath, [path.join(here, 'rules-replay.mjs')], {
        cwd: root,
        env: { ...process.env, RULE_STATS_OUT: tmp },
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024
    });
    if (res.status !== 0) {
        // 回放本身红 ≠ 本自检红：本自检只裁定「恒空转」，回放红由 run-all 的回放项负责。
        // 但回放若崩到连统计都没落盘，本自检无法给出结论 ⇒ 判红（不可静默放行）。
        if (!fs.existsSync(tmp)) {
            console.log('❌ 规则恒空转自检失败：回放未产出统计（exit=' + res.status + '），无法判定恒空转');
            process.exit(1);
        }
    }
    let stats;
    try {
        stats = JSON.parse(fs.readFileSync(tmp, 'utf8'));
    } catch (e) {
        console.log('❌ 规则恒空转自检失败：统计文件解析失败 ' + (e && e.message ? e.message : e));
        process.exit(1);
    } finally {
        try { fs.unlinkSync(tmp); } catch (e) { /* 清理失败不影响结论 */ }
    }

    const cases = stats.cases || 0;
    const names = Object.keys(stats.agg || {});
    const problems = [];
    // 取样不足时不成立的结论（2026-10-27 夜间第 143 轮新增）：不计绿也不计红，逐条写明为什么不成立
    const vacuous = [];

    console.log('=== 规则恒空转自检（' + cases + ' 场 / ' + names.length + ' 条规则）===');

    // ⑤ 规模闸门（无条件判失败，防静默绿的兜底：取样塌了必然在此报出，整条线不至于转绿）
    if (cases < MIN_CASES) problems.push(fail('样本规模掉到 ' + cases + ' 场（下限 ' + MIN_CASES + '）⇒ 恒空转结论不可信（样本被裁会让自检恒绿）'));
    if (names.length < MIN_RULES) problems.push(fail('规则条数掉到 ' + names.length + '（下限 ' + MIN_RULES + '）⇒ 恒空转结论不可信（规则被批量删除会让自检恒绿）'));
    // 取样档位（第 143 轮新增，走公共件）：薄线 = 规模下限的一半（70 场 / 22 条），
    //   与「低于硬下限」是两件事 —— 硬下限判的是"结论不可信"，档位判的是"这批结论该不该逐条定性"。
    const SAMPLE_C = judgeSample({
        count: cases, floor: MIN_CASES, unit: '场', mode: 'floor', source: '规则回放'
    });
    const SAMPLE_R = judgeSample({
        count: names.length, floor: MIN_RULES, unit: '条', mode: 'floor', source: '规则集'
    });
    const SAMPLE_INSUFFICIENT = SAMPLE_C.insufficient || SAMPLE_R.insufficient;
    console.log('  · 取样档位：样本 ' + SAMPLE_C.state + '（薄线 ' + SAMPLE_C.thin + ' 场）· 规则 '
        + SAMPLE_R.state + '（薄线 ' + SAMPLE_R.thin + ' 条）'
        + (SAMPLE_INSUFFICIENT ? ' ⇒ **取样不足**：恒空转逐条定性不成立，真因先查样本规模' : ' ⇒ 取样充分'));

    // ① 恒空转集合
    const idle = names.filter(n => {
        const a = stats.agg[n];
        return a.pass === 0 && a.fail === 0;
    });
    const wlNames = IDLE_WHITELIST.map(w => w.name);

    // ② 白名单外的新恒空转 ⇒ 红（取样不足时收口，见下）
    const newIdle = [];
    for (const n of idle) {
        if (!wlNames.includes(n)) {
            const a = stats.agg[n];
            newIdle.push(n + '(skip=' + a.skip + ')');
        }
    }
    if (newIdle.length && SAMPLE_INSUFFICIENT) {
        // 第 143 轮收口：样本被裁时几乎每条规则都会 pass=0 fail=0，逐条报「三种病因之一」会把人
        //   引去查判据键与数据源，而真因只有一条（样本规模）—— 与第 140 轮守卫侧的老毛病同构。
        //   红由规模闸门兜住（退码仍 1），故此处是收口不是豁免。
        vacuous.push('新增恒空转 ' + newIdle.length + ' 条（' + newIdle.slice(0, 8).join('、')
            + (newIdle.length > 8 ? ' 等' : '') + '）—— 取样不足（' + SAMPLE_C.detail + '、' + SAMPLE_R.detail
            + '）时「pass=0 fail=0」极可能只是样本没跑到，不作「判据键过期 / 数据源错位」定性；'
            + '真因先查样本规模（红由 ⑤ 规模闸门无条件兜住）');
    } else if (newIdle.length) {
        problems.push(fail('新增恒空转规则（不在白名单）：' + newIdle.join('、') +
            ' ⇒ 三种病因之一（样本未覆盖 / 判据键过期 / 数据源错位），必须取证后修或显式登记，不得静默放行'));
    }
    // ② 白名单条目已不再恒空转 ⇒ 红（白名单必须收缩）
    for (const w of IDLE_WHITELIST) {
        if (!idle.includes(w.name)) {
            const a = stats.agg[w.name];
            if (!a) {
                // 归③处理：规则名已消失
                continue;
            }
            problems.push(fail('白名单条目已不再恒空转：' + w.name + '  pass=' + a.pass + ' fail=' + a.fail +
                ' skip=' + a.skip + ' ⇒ 它已被激活（或病因已消除），白名单必须同步收缩，防腐烂'));
        }
    }
    // ③ 白名单条目必须仍在规则名集合里
    for (const w of IDLE_WHITELIST) {
        if (!names.includes(w.name)) {
            problems.push(fail('白名单腐烂：' + w.name + ' 已不在规则名集合中（规则改名或被删）⇒ 白名单静默失效，须同步更新'));
        }
    }
    // ④ 白名单条目对应的规则文件必须仍在
    for (const w of IDLE_WHITELIST) {
        if (w.file && !fs.existsSync(path.join(RULE_DIR, w.file))) {
            problems.push(fail('白名单腐烂：' + w.name + ' 对应的规则文件 ' + w.file + ' 已不存在 ⇒ 白名单静默失效，须同步更新'));
        }
    }

    console.log('  · 恒空转（pass=0 fail=0）' + idle.length + ' 条：' + (idle.join(' / ') || '（无）'));
    console.log('  · 白名单 ' + IDLE_WHITELIST.length + ' 条（棘轮只许收缩）');
    for (const w of IDLE_WHITELIST) console.log('      - ' + w.name + '  [' + w.file + ']  ' + w.why);
    // 转交中不属恒空转（它们 fail>0、确实在判定），这里顺带留痕，便于人工核对豁免面
    const transferring = names.filter(n => stats.agg[n].fail > 0);
    if (transferring.length) {
        console.log('  · 有失败（转交中·不计本自检退码）' + transferring.length + ' 条：' + transferring.join(' / '));
    }

    // ⑦ 公共取样判定器自证 + 本线门槛自证（2026-10-27 夜间第 143 轮新增）：
    //   公共件一腐烂，守卫线 / 绑定线 / fact 普查 / 本线会在同一时刻集体失守，而 ①~⑥ 一条都验不到它。
    for (const bad of selfCheck()) {
        problems.push(fail('取样充分性公共判定器自证未过：' + bad
            + ' —— tests/_lib/sample-sufficiency.mjs 已腐烂，恒空转结论此刻不可信'));
    }
    for (const [tag, s] of [['样本', SAMPLE_C], ['规则', SAMPLE_R]]) {
        const bad = checkThreshold(s);
        if (bad) problems.push(fail(tag + '取样门槛：' + bad));
    }

    for (const v of vacuous) console.log('  ⚠️  ' + v);
    if (problems.length) {
        console.log('❌ 规则恒空转自检失败（' + problems.length + ' 项'
            + (vacuous.length ? '，另有 ' + vacuous.length + ' 项因取样不足**不成立**、不计绿也不计红' : '') + '）');
        process.exit(1);
    }
    console.log('✅ 规则恒空转自检通过（' + (5 + IDLE_WHITELIST.length * 2) + ' 项断言：规模闸门 2 / 恒空转集合恰好等于白名单 / 白名单名在册 / 白名单文件在册 / 取样公共件自证 1 / 取样门槛自证 2）');
    process.exit(0);
}

main();
