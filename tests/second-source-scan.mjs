#!/usr/bin/env node
// tests/second-source-scan.mjs | V1.1.0 | 2026-10-29 夜间第 152 轮：输出段扩到 ⑦「跨文件重复函数点名」
//   （逐字重复 = 铁证如山的第二份；同名异体 = 待人工判定，后者更危险：改的那点就是口径分叉）。
//   本件只**点名**、不收口 —— 与第 151 轮同一取舍：先看清还剩什么，再谈动刀。
// tests/second-source-scan.mjs | V1.0.0 | 2026-10-28 夜间第 151 轮
//
// 「第二份快照」普查：tests 下凡是手写一份别人已经写过的东西（本轮先收"剥注释"这一款），
//   逐条点名，并受棘轮约束（只降不抬）。
//
// 为什么单独立一件（而不是写进某条既有 CHECKS 里）：
//   第 150 轮把「自证别写真形态」从**纪律**改成了**机制**——靠的不是"下轮记得别这么写"，
//   而是让公共件自己把污染关掉。本轮同款病换个皮：同一个"剥注释"能力在 tests 下有三份
//   各写一遍的实现，口径互不相同（一处吃换行、一处认正则）。★ 修好这三处只是"这一轮
//   干净了"，真正要关掉的是**下轮还会不会再写出第四份**。故立本件做机械点名 + 棘轮。
//
// 判据（机械可验，不靠自觉，见 _lib/static-truth-slice.auditStripCopies）：
//   扫 tests/ 下所有 .js/.mjs，按函数名找剥注释/串掩码类的本地定义；
//     · 命中公共件自身 ⇒ 唯一来源，不计；
//     · 命中文件 import 了公共件 ⇒ 已收口（转发/复用），计入 closed；
//     · 其余 ⇒ 未收口，逐条点名；未登记条数受 STRIP_COPY_RATCHET 约束，新增即报。
// ★ 与第 150 轮同一句话：机制负责关掉污染，点名负责把「关掉了什么、还剩什么」打印出来 ——
//   否则哪天又抄一份，报告依旧绿，那就是静默复发。
//
// 挂 OBSERVES 而非 CHECKS：与第 147/148/149 轮同一取舍 —— 挂 CHECKS 会让体检分母 24 变 25，
//   须拍板；挂观察项不改分母，结论照常打出来供研判。哪天拍板开红，挪进 CHECKS 即可，
//   本件逻辑一个字不用改。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    VER as TRUTH_VER, selfCheck as truthSelfCheck,
    auditStripCopies, STRIP_COPY_ALLOWLIST, STRIP_COPY_RATCHET,
    auditDupFnNames, DUP_FN_ALLOWLIST, DUP_FN_RATCHET
} from './_lib/static-truth-slice.mjs';

const VER = 'tests/second-source-scan.mjs V1.1.0';
const here = path.dirname(fileURLToPath(import.meta.url));

function main() {
    // ① 先跑公共件自证：本件的结论全部建立在它的口径上，它自己歪了则本件结论一并作废
    const scFails = truthSelfCheck();
    for (const f of scFails) console.log('❌ 公共件自证：' + f);

    const a = auditStripCopies(here);
    console.log('第二份快照普查（剥注释/串掩码类）：');
    console.log('  已收口（改用公共件）' + a.closed.length + ' 条：');
    for (const c of a.closed) console.log('    ✓ ' + c.file + '（' + c.fns.join(' / ') + '）');
    console.log('  未收口 ' + a.open.length + ' 条 / 棘轮上限 ' + STRIP_COPY_RATCHET + '：');
    for (const o of a.open) {
        const w = STRIP_COPY_ALLOWLIST.find(x => x.file === o.file);
        console.log('    ' + (w ? '⚠ 已登记豁免 ' : '✗ 未登记 ') + o.file + '（' + o.fns.join(' / ') + '）'
            + (w ? ' —— ' + w.why : ' —— 请改为复用公共件'));
    }
    const bad0 = scFails.length + a.fails.length;
    for (const f of a.fails) console.log('❌ ' + f);

    // ⑦ 跨文件同名 / 逐字重复函数点名（第 152 轮新增的扩面：第二份不只"剥注释"一款）
    const d = auditDupFnNames(here);
    console.log('跨文件重复函数普查（同名函数 ≥2 处各定义一遍）：');
    console.log('  【逐字重复 · 铁证如山的第二份】' + d.identical.length + ' 组 / 棘轮上限 ' + DUP_FN_RATCHET + '：');
    for (const r of d.identical) {
        console.log('    ✗ ' + r.name + ' ×' + r.copies + ' —— ' + r.files.join(' , ') + '：' + r.why);
    }
    console.log('  【同名但函数体不同 · 待人工判定】' + d.sameNameOnly.length + ' 组：');
    for (const r of d.sameNameOnly) {
        console.log('    ⚠ ' + r.name + ' ×' + r.copies + ' —— ' + r.files.join(' , '));
    }
    const skipNames = DUP_FN_ALLOWLIST.map(x => x.name).join(' / ');
    console.log('  已按设计排除（本来就该各写一份）：' + skipNames);
    for (const f of d.fails) console.log('❌ ' + f);

    const bad = bad0 + d.fails.length;
    if (bad === 0) {
        console.log('RESULT: PASS —— 第二份快照 ' + a.open.length + ' 条（均在豁免表内），已收口 ' + a.closed.length + ' 条'
            + '；逐字重复函数 ' + d.identical.length + ' 组（棘轮上限 ' + DUP_FN_RATCHET + '），同名异体 ' + d.sameNameOnly.length + ' 组待人工判定');
    } else {
        console.log('RESULT: FAIL —— ' + bad + ' 项');
    }
    console.log('VER: ' + VER + ' | ' + TRUTH_VER);
    return bad === 0 ? 0 : 1;
}

process.exit(main());
