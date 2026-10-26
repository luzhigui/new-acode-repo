// tests/_lib/sample-sufficiency.mjs | V1.0.0 | 2026-10-27 夜间第 143 轮：把第 141 / 142 两轮在
//   contract-guard-selftest 与 contract-binding-drift-selftest 里**各自长出来一份**的「取样充分性」
//   判定（空 / 薄 / 足 三档 + 有罪豁免）抽成公共判定器，供所有依赖取样的自检复用。
//
// 为什么必须抽（第 142 轮自己点名的下轮最高优先，本轮兑现）：
//   同一款以偏概全的盲区在三处独立存在 —— fact-coverage-selftest（取样面 = FACT_TYPES 全表 +
//   规则/引擎文件集）、fact-emission-census（取样面 = 真实对局场数与 fact 条数）、rule-idle-selftest
//   （取样面 = 回放场数与规则条数）。它们此刻都把「取样残缺」当成「结论成立」：
//      · 取样塌了 ⇒ 「零缺口 / 零盲区 / 零恒空转」⇒ 一路报绿（无罪结论被冒充成绿）；
//      · 取样塌了 ⇒ 逐条「不存在 / 没出现 / 恒空转」⇒ 一堆同根因噪音把真因淹没（指错方向）。
//   三处各写一份就是三份口径，将来改一处忘两处 = 新分叉。故抽成唯一来源，判据松紧**一字不改**，
//   只换存放位置（本轮所有调用方的行为等价性由验牙反证）。
//
// 口径（照抄第 142 轮，不另立标准）：
//   三档：EMPTY（取样 0）/ THIN（0 < 取样 < 薄线）/ ENOUGH（取样 ≥ 薄线）。
//   薄线 = 规模下限 × THIN_RATIO（默认一半）。取一半的理由有二：门槛随规模闸门联动升降，不另抄魔数；
//     且薄线恒小于规模下限 ⇒ 凡判「薄」必然同时触规模闸门的红，红不会因本档位而丢。
//   取舍原则：**有罪证据不受取样量影响，无罪结论受取样量影响**。
//     found = true（真抓到了坏消息）⇒ FAIL，取样再薄也是实打实的坏消息，不豁免；
//     found = false（只是没等到坏消息）⇒ 取样不足时 VACUOUS（不成立，不计绿也不计红），取样足才 PASS。
//   调用方落地时就是 if 顺序：先判「有没有真抓到」，再判「取样够不够」，不能倒过来。
//
// 用法：
//   const SAMPLE = judgeSample({ count: contracts.length, floor: MIN_CONTRACTS, unit: '条', source: '对照器' });
//   const v = verdict(dirty.length > 0, SAMPLE);   // 'FAIL' | 'VACUOUS' | 'PASS'
//   const bad = checkThreshold(SAMPLE);             // 门槛自证：null = 门槛站得住
export const VER = 'tests/_lib/sample-sufficiency.mjs V1.0.0';

// 薄线占规模下限的比例。第 142 轮定为一半（守卫侧 25 / 50，绑定侧 26 / 51），沿用不改。
export const THIN_RATIO = 0.5;

// 三档状态名（字符串常量，便于调用方比较与打印）
export const STATE = { EMPTY: 'EMPTY', THIN: 'THIN', ENOUGH: 'ENOUGH' };

// 结论三档：FAIL = 判失败（有罪证据 / 规模闸门）；VACUOUS = 不成立（不计绿也不计红）；PASS = 判通过
export const VERDICT = { FAIL: 'FAIL', VACUOUS: 'VACUOUS', PASS: 'PASS' };

// 薄线计算。mode 保留 'floor' / 'ceil' 两种取整是为了与各调用方**既有阈值逐位一致**：
//   守卫侧历史是 floor(50/2)=25，绑定侧历史是 ceil(51/2)=26。抽公共件时若强行统一取整方式，
//   会让绑定侧薄线从 26 掉到 25 —— 那是改判据（放宽一格），本轮不做，故显式保留 mode。
export function thinFloorOf(floor, mode) {
    const m = mode === 'ceil' ? 'ceil' : 'floor';
    const raw = Math[m](floor * THIN_RATIO);
    return Math.max(1, raw);
}

// 判定取样档位。floor = 规模下限（调用方各自的 MIN_*）；unit = 计量单位（条 / 个 group / 场）；
// source = 取样来源名（进文案，便于一眼看出是哪条线塌了）。
export function judgeSample(opts) {
    const count = Number(opts && opts.count) || 0;
    const floor = Number(opts && opts.floor) || 0;
    const unit = (opts && opts.unit) || '条';
    const mode = (opts && opts.mode) === 'ceil' ? 'ceil' : 'floor';
    const source = (opts && opts.source) || '取样器';
    const thin = thinFloorOf(floor, mode);
    let state = STATE.ENOUGH;
    if (count <= 0) state = STATE.EMPTY;
    else if (count < thin) state = STATE.THIN;
    const insufficient = state !== STATE.ENOUGH;
    const detail = state === STATE.EMPTY
        ? `取样 0 ${unit}（${source}未产出任何可用行）`
        : (state === STATE.THIN
            ? `取样仅 ${count} ${unit}（低于 ${thin} ${unit} 的薄取样线，历史基线 ${floor}+ ${unit}）`
            : `取样 ${count} ${unit}（薄取样线 ${thin} ${unit}）`);
    return { count, floor, thin, mode, unit, state, insufficient, detail };
}

// 取舍核心：found = 是否真抓到了东西。
//   found=true ⇒ FAIL（有罪证据不受取样量影响）；
//   found=false ⇒ 取样不足时 VACUOUS、取样足时 PASS（无罪结论受取样量影响）。
export function verdict(found, sample) {
    if (found) return VERDICT.FAIL;
    return sample.insufficient ? VERDICT.VACUOUS : VERDICT.PASS;
}

// verdict 的人话版本（给「不成立」那一档写清为什么不成立，避免只打一个 ⚠️ 让人猜）
export function verdictNote(found, sample, what) {
    if (found) {
        return sample.insufficient
            ? `取样不足，但**查到了坏消息** ⇒ 照判失败（有罪证据不受取样量影响）：${sample.detail}`
            : sample.detail;
    }
    return sample.insufficient
        ? `${what}不成立 —— ${sample.detail}，没查到 ≠ 没有问题（只查了 ${sample.count} ${sample.unit}，`
            + `推不出全部 ${sample.floor}+ ${sample.unit} 都没问题），不计绿也不计红`
        : `${what}通过 —— ${sample.detail}`;
}

// 门槛自证：薄线必须落在 (0, floor) 开区间内。
//   取 0 ⇒ 退回「取样 1 至 5 条也判全绿」的老盲区；≥ floor ⇒ 相关判据从此永不判、等于被静默拆掉。
//   两种失位都必须先把自己报红（与第 142 轮的 ⑥d / ④c 同款，只是搬到这里统一维护）。
export function checkThreshold(sample) {
    if (!(sample.thin > 0 && sample.thin < sample.floor)) {
        return `薄取样门槛 ${sample.thin} 失位（须满足 0 < 门槛 < ${sample.floor}）`
            + ' —— 门槛为 0 则无罪结论退回「极少量取样也判全绿」的老盲区；'
            + '门槛 ≥ 规模下限则相关判据从此永不判、等于被静默拆掉（先修门槛来源，不是主代码）';
    }
    return null;
}

// 公共件自证（2026-10-27 夜间第 143 轮新增）。★ 为什么必须有：抽成公共件之后，本文件一旦被改坏，
//   **所有调用方会在同一时刻集体假绿 / 集体假红**，而每一处的验牙都只验自己那一处、验不到公共件。
//   故把「三档判定 + 取舍三态 + 门槛两端」钉成合成样本上的自证，由各调用方挂成自己的一条断言
//   （守卫侧 ⑥e / 绑定侧 ④d）。返回值为失败文案数组，空数组 = 公共件站得住。
export function selfCheck() {
    const bad = [];
    // ① 三档：0 ⇒ EMPTY、3/50 ⇒ THIN、56/50 ⇒ ENOUGH
    const sEmpty = judgeSample({ count: 0, floor: 50, unit: '条' });
    const sThin = judgeSample({ count: 3, floor: 50, unit: '条' });
    const sFull = judgeSample({ count: 56, floor: 50, unit: '条' });
    if (!(sEmpty.state === STATE.EMPTY && sEmpty.insufficient)) bad.push('空档判定失位（取样 0 未判 EMPTY）');
    if (!(sThin.state === STATE.THIN && sThin.insufficient)) bad.push('薄档判定失位（取样 3 < 薄线 25 未判 THIN）');
    if (sFull.state !== STATE.ENOUGH || sFull.insufficient) bad.push('足档判定失位（取样 56 ≥ 薄线 25 未判 ENOUGH）');
    if (!(sThin.thin === 25 && sFull.thin === 25)) bad.push('薄线计算失位（floor(50×0.5) 应为 25）');
    // ② 取舍三态：有罪不受取样影响 / 无罪受取样影响 / 取样足则无罪成立
    if (verdict(true, sThin) !== VERDICT.FAIL) bad.push('有罪证据被豁免（薄取样下真抓到的坏消息必须照判失败）');
    if (verdict(false, sThin) !== VERDICT.VACUOUS) bad.push('无罪结论在薄取样下未转不成立（会冒充绿）');
    if (verdict(false, sFull) !== VERDICT.PASS) bad.push('取样足时无罪结论未判通过（会恒虚）');
    if (verdict(true, sFull) !== VERDICT.FAIL) bad.push('取样足时有罪证据未判失败（会静默放行）');
    // ③ 门槛两端：取 0 与 ≥ 规模下限都必须被 checkThreshold 拦下
    if (!checkThreshold({ thin: 0, floor: 50 })) bad.push('门槛为 0 未被拦下（无罪结论会退回恒绿老盲区）');
    if (!checkThreshold({ thin: 50, floor: 50 })) bad.push('门槛 ≥ 规模下限未被拦下（判据会被静默拆掉）');
    if (checkThreshold({ thin: 25, floor: 50 })) bad.push('合理门槛被误判为失位（自证本身腐烂）');
    return bad;
}
