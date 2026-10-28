#!/usr/bin/env node
// tests/guard-presence-scan.mjs | V1.0.0 | 2026-10-29 夜间第 155 轮
//
// 「守门人的守门人」：静态点名第 154 轮那套端到端守门人（两通道 + 第三处校验）**还在不在**。
//
// 为什么单独立一件、而不是在 commit-claim-audit.mjs 里再加几条断言：
//   第 154 轮自己写下的残余边界是「连同 guardCheck 一起关掉则无人守」，当时能做的只是
//   **把三条语句放在文件三个不同位置**提高"一次全关"的代价 —— 但这三条语句都在同一个文件里，
//   改这个文件的人顺手就能全关掉，改完本件自己也一起没了，谁也不报。这正是第 153 轮牙K
//   那款病（守门者被关掉这件事本身没人守）在**上一层**复发。
//   ★ 本轮的解法与第 154 轮同构、但更进一层：把守门人的守门人放到**另一个文件**里。
//     本件不在 commit-claim-audit.mjs 内部运行、不调用它的任何函数、不读它的运行结果，
//     只把它的**源码当文本**读一遍 ⇒ 那边被改坏、被整段关掉，本件照样独立复现并报出来。
//   证据路径也刻意不同：那边走"运行时登记 + 运行时校验"，这边走"静态源码存在性"，
//     两条路径互不依赖，任一条单独被改坏都挡不住另一条。
//
// 判据（七条不变量，机械可验）：在**剥注释后的真代码**里必须同时找到
//   ① guardCheck 的定义 ② GUARD_CHANNELS 的定义 ③ indep 通道登记 ④ bucket 通道登记
//   ⑤ guardCheck 被调用 ⑥ guardFails 计进退码 ⑦ 结论行打印守门状态。
// 为什么必须剥注释后找（第 149 / 151 / 154 三轮反复发作的那款病）：
//   注释里写一句「guardCheck 已生效」就把声称兑现了 —— 故本件只认真代码，不认散文。
//   剥注释一律走公共件唯一来源 stripCommentsMapped（带行号映射 + 正则字面量感知），
//   绝不手写第二份（由 auditStripCopies 守着）。
//
// ★ 本件与第 154 轮那个待拍板问题的关系（如实记，不擅自拍板）：
//   第 154 轮牙C2 实证「摘掉 guardFails 的退码计入 ⇒ 打印仍在、退码仍是 0 —— 退码计入是承重件」，
//   当时挂账待拍板（选项 a 维持现状 / b 单独抬退码）。本件**不改变**那个取舍：它维持 (a) 现状口径，
//   只把"必须计入"这一条做成机械点名 —— 即：拍板之前，谁也不许把承重件悄悄摘掉。
//   哪天拍板选 (b)，把不变量⑥改成"必须另有独立退码"即可，本件其余逻辑一个字不用改。
//
// 挂 OBSERVES 而非 CHECKS：与第 147/148/149/151/153 轮同一取舍 —— 挂 CHECKS 会让体检分母
//   24 变 25，须拍板；挂观察项不改分母，结论照常打出来供研判。哪天拍板开红，挪进 CHECKS 即可。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    VER as TRUTH_VER, selfCheck as truthSelfCheck, stripCommentsMapped
} from './_lib/static-truth-slice.mjs';

const VER = 'tests/guard-presence-scan.mjs V1.0.0';
const here = path.dirname(fileURLToPath(import.meta.url));
export const TARGET_FILE = 'commit-claim-audit.mjs';

// 七条不变量。★ 每条 re 都只匹配**真代码形态**（赋值 / 调用 / 定义），不匹配注释或字符串里的字样。
//   id 用于点名与自证；why 是报给人工看的一句话，必须说清"摘掉这条会退化成什么样"。
export const GUARD_INVARIANTS = [
    {
        id: 'define', re: /export\s+function\s+guardCheck\s*\(/,
        why: 'guardCheck 的定义不见了 ⇒ 守门人被连根拔掉，两通道查都没人查'
    },
    {
        id: 'channels', re: /export\s+const\s+GUARD_CHANNELS\s*=/,
        why: 'GUARD_CHANNELS 不见了 ⇒ 通道名单没了，校验无从枚举'
    },
    {
        id: 'reg-indep', re: /guard\s*\.\s*indep\s*=/,
        why: '通道 indep（独立复算，置于扫描之前）的登记语句被摘掉 ⇒ 链条断在源头'
    },
    {
        id: 'reg-bucket', re: /guard\s*\.\s*bucket\s*=/,
        why: '通道 bucket（桶内命中，置于扫描之后）的登记语句被摘掉 ⇒ 链条断在末端'
    },
    {
        id: 'called', re: /guardCheck\s*\(\s*guard\s*\)/,
        why: 'guardCheck 定义了却没被调用 ⇒ 守门人没上岗，登记了也没人验'
    },
    {
        id: 'counted', re: /guardFails\s*\.\s*length/,
        why: 'guardFails 没有计进退码 ⇒ 第 154 轮牙C2 已实证：摘掉计入后打印仍在、退码仍是 0，守门人退化成「看得见但不拦」'
    },
    {
        id: 'printed', re: /独立复算=/,
        why: '结论行不再打印守门状态 ⇒ 连肉眼也看不见了'
    }
];

export const CHANNELS_REQUIRED = ['indep', 'bucket'];

// 从剥注释后的源码里取 GUARD_CHANNELS 数组里登记的字面量通道名
export function channelsOf(code) {
    const m = code.match(/export\s+const\s+GUARD_CHANNELS\s*=\s*\[([^\]]*)\]/);
    if (!m) return [];
    return (m[1].match(/['"]([^'"]+)['"]/g) || []).map(s => s.slice(1, -1));
}

/**
 * 核心审计：读目标文件源码 → 剥注释 → 逐条验不变量 → 交叉验通道名单。
 * 返回 { missing:[{id,why}], hits:[{id,line}], chanMissing:[], fails:[] }
 * ★ line 是**原文行号**（stripCommentsMapped 保行结构 + 行号映射），报错能直接指回原文件。
 */
export function auditGuardPresence(src) {
    const res = { missing: [], hits: [], chanMissing: [], fails: [] };
    if (typeof src !== 'string' || !src.length) {
        res.fails.push('目标文件源码为空 ⇒ 本件没有真的取到东西（不许把"取不到"当成"没问题"）');
        return res;
    }
    const m = stripCommentsMapped(src);
    const code = m.code || '';
    // 行号回指：owner[i] 是 out[i] 对应的原文下标；据此换算原文行号
    const lineOf = (idxInCode) => {
        const o = m.owner && m.owner[idxInCode];
        if (typeof o !== 'number') return 0;
        return src.slice(0, o).split('\n').length;
    };
    for (const inv of GUARD_INVARIANTS) {
        const hit = code.match(inv.re);
        if (hit) res.hits.push({ id: inv.id, line: lineOf(hit.index) });
        else res.missing.push({ id: inv.id, why: inv.why });
    }
    const got = channelsOf(code);
    for (const c of CHANNELS_REQUIRED) if (!got.includes(c)) res.chanMissing.push(c);
    // ★ 交叉验：通道名单里写了、却找不到对应登记语句 ⇒ 名单与代码已经分叉（改了一头没改另一头）
    for (const c of got) {
        if (!res.hits.some(h => h.id === 'reg-' + c)) {
            res.fails.push('GUARD_CHANNELS 里登记了通道「' + c + '」却找不到它的登记语句 ⇒ 名单与代码分叉，校验形同虚设');
        }
    }
    return res;
}

// ---------------------------------------------------------------------------
// 自证：全部咬新代码，样本一律**拼接构造**（第 153 轮自伤四的教训：样本写在字符串字面量里，
// 会被别的扫描器当成真形态，也可能自己把自己绊倒）。
export function selfCheck() {
    const fails = [];
    const L = (s) => s;
    // 真形态样本：七条不变量齐全（刻意用拼接，避免出现可被别的扫描误认的完整字面块）
    // ★ 通道名单必须是**同一行**（数组元素会被 join('\n') 拆开，拆开就不是同一条语句了）
    const CHAN_FULL = L('export const GUARD_CHANNELS = ') + '[' + "'indep'" + ', ' + "'bucket'" + '];';
    const CHAN_HALF = L('export const GUARD_CHANNELS = ') + '[' + "'indep'" + '];';
    const good = [
        CHAN_FULL,
        L('export function guardCheck(g) { return []; }'),
        L('guard.indep = endToEndGuard({});'),
        L('guard.bucket = { ran: true, hit: true };'),
        L('const guardFails = guardCheck(guard);'),
        L('let bad = scFails.length + guardFails.length;'),
        L("console.log('端到端守门：独立复算=' + mark('indep'));")
    ].join('\n');

    // ⑲ 咬"剥注释是否真的生效"：把 define 只留在注释里、真代码删掉 ⇒ 必须报 define 缺失。
    //    ★ 这条是本件存在的凭据 —— 注释里的字样不能兑声称（第 149/151/154 三轮那款病）。
    const inComment = good.replace(L('export function guardCheck(g) { return []; }'), '')
        + '\n// export function guardCheck(g) { return []; }\n';
    const r19 = auditGuardPresence(inComment);
    if (!r19.missing.some(x => x.id === 'define')) {
        fails.push('自证⑲失效：guardCheck 只写在注释里却没报缺失 ⇒ 注释能兑声称，本件形同虚设');
    }

    // ⑳ 咬"整段关掉两通道登记" ⇒ 必须两条都报（与第 154 轮牙B 同款，但走的是源码路径）
    const noReg = good.replace(L('guard.indep = endToEndGuard({});'), '')
        .replace(L('guard.bucket = { ran: true, hit: true };'), '');
    const r20 = auditGuardPresence(noReg);
    if (!r20.missing.some(x => x.id === 'reg-indep') || !r20.missing.some(x => x.id === 'reg-bucket')) {
        fails.push('自证⑳失效：两通道登记语句都被摘掉却没有逐条报 ⇒ 整段关掉仍能蒙混过关');
    }

    // ㉑ 咬"摘掉退码计入"（第 154 轮牙C2 那款病，本轮把它从挂账变成机械点名）⇒ 必须报 counted
    const noCount = good.replace(L('let bad = scFails.length + guardFails.length;'), L('let bad = scFails.length;'));
    const r21 = auditGuardPresence(noCount);
    if (!r21.missing.some(x => x.id === 'counted')) {
        fails.push('自证㉑失效：guardFails 没计进退码却没报 ⇒ 牙C2 那款"承重件被摘"仍能蒙混过关');
    }

    // ㉒ 咬"定义了却不调用" ⇒ 必须报 called（防有人只把函数留着充样子）
    const noCall = good.replace(L('const guardFails = guardCheck(guard);'), L('const guardFails = [];'));
    const r22 = auditGuardPresence(noCall);
    if (!r22.missing.some(x => x.id === 'called')) {
        fails.push('自证㉒失效：guardCheck 定义了却没被调用、没报 ⇒ 守门人不上岗也没人知道');
    }

    // ㉓ 咬"把通道名单改小" ⇒ 必须报通道缺失（防把 GUARD_CHANNELS 改成空数组让校验恒通过）
    const shrink = good.replace(CHAN_FULL, CHAN_HALF);
    const r23 = auditGuardPresence(shrink);
    if (!r23.chanMissing.includes('bucket')) {
        fails.push('自证㉓失效：GUARD_CHANNELS 少写一个通道却没报 ⇒ 改小名单就能让校验恒通过');
    }

    // ㉔ 咬"本件不许恒红"：真形态样本必须一条不报（样本自身必须是真风险形态，不能是摆设）
    const r24 = auditGuardPresence(good);
    if (r24.missing.length || r24.chanMissing.length || r24.fails.length) {
        fails.push('自证㉔失效：齐全的真形态样本被误报 '
            + (r24.missing.length + r24.chanMissing.length + r24.fails.length) + ' 项 ⇒ 本件在恒红');
    }

    // ㉕ 咬"不许吞掉取样失败"：源码为空必须报（断链不许静默）
    const r25 = auditGuardPresence('');
    if (!r25.fails.length) {
        fails.push('自证㉕失效：源码为空（取不到文件）却没报 ⇒ 取样失败被当成没问题');
    }
    return fails;
}

function main() {
    // ① 先跑公共件自证：本件的"剥注释"全部建立在它的口径上，它自己歪了则本件结论一并作废
    const scFails = truthSelfCheck();
    for (const f of scFails) console.log('❌ 公共件自证：' + f);
    // ② 本件自证：咬的是本件自己的判据
    const myFails = selfCheck();
    for (const f of myFails) console.log('❌ 本件自证：' + f);

    const target = path.join(here, TARGET_FILE);
    let src = '';
    try {
        src = fs.readFileSync(target, 'utf8');
    } catch (e) {
        console.log('❌ 读不到目标文件 ' + TARGET_FILE + '：' + (e && e.message || e));
    }
    const a = auditGuardPresence(src);

    console.log('守门人的守门人（静态点名 · 目标 ' + TARGET_FILE + '）：');
    console.log('  【在真代码里找到】' + a.hits.length + ' / ' + GUARD_INVARIANTS.length + ' 条不变量：');
    for (const h of a.hits) {
        const inv = GUARD_INVARIANTS.find(x => x.id === h.id);
        console.log('    ✓ ' + h.id.padEnd(11) + ' 第 ' + h.line + ' 行 —— 在真代码里（非注释）');
    }
    console.log('  【缺失 · 即守门人被关掉或改坏】' + a.missing.length + ' 条：');
    for (const x of a.missing) console.log('    ✗ ' + x.id.padEnd(11) + ' —— ' + x.why);
    if (a.chanMissing.length) {
        console.log('  【通道名单缺】' + a.chanMissing.join(' / ') + ' ⇒ 校验覆盖不到该通道');
    }
    for (const f of a.fails) console.log('❌ ' + f);

    const bad = scFails.length + myFails.length + a.missing.length + a.chanMissing.length + a.fails.length;
    if (bad === 0) {
        console.log('RESULT: PASS —— 七条不变量在剥注释后的真代码里全部在位（两通道登记 + 第三处校验 + 退码计入 + 结论行打印），'
            + '守门人未被整段关掉');
    } else {
        console.log('RESULT: FAIL —— ' + bad + ' 项');
    }
    console.log('VER: ' + VER + ' | ' + TRUTH_VER);
    return bad === 0 ? 0 : 1;
}

process.exit(main());
