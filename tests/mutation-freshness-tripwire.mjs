// tests/mutation-freshness-tripwire.mjs | V1.0.0 | 2026-11-02 夜间第 176 轮
//
// ★ 立它的由头（第 174 轮备忘，第 175 轮沿用）：
//     「变异树每四轮没跑就没人喊 —— 它是观察项、不进分母、也不进体检调度，只有人记得才会跑。」
//
// ★ 病根不在「变异树跑得勤不勤」，在**那道守门只在门被推开时才检查门有没有锁**：
//     mutation-teeth.mjs 的 V2.9.0 新鲜度守卫（六项：VER / MUTFP / RULEFP / ENGFP / mtime / 自 mtime）
//     只在 `--report` 时才跑。不跑变异树 ⇒ 不进那个函数 ⇒ 陈旧结论安安静静躺在
//     tests/.mut/teeth-results.txt 里，而体检 25 项一项都不喊。第 170~173 轮连续四轮如此。
//
// ★ 本件的定位（关键取舍，别改宽也别改窄）：
//     · 守卫管「结果**对不对**」（指纹级正确性）—— 被动，只在跑变异树时触发，本件**不重复实现**；
//     · 本件管「结果**有多久没产出了**」（时间维度）—— 主动，每轮随 run-all 秒级自动跑。
//   ⇒ 两者互补、不重叠。刻意不把指纹逻辑抄一份进来：抄了就有两处判据，两处早晚分叉
//     （第 173 轮「第二份快照」那条教训）。本件只在结论里指路：要指纹级校验请跑 --report。
//
// ★ 三栏输出，各管一个失效面：
//     ① 本地实时：tests/.mut/teeth-results.txt 的 #META HEAD 相对当前 HEAD 落后几笔提交
//        （.mut 被 gitignore ⇒ 换机器/重克隆后这一栏必然是「无迹可寻」，如实报，不假装新鲜）；
//     ② 跨机器：tests/体检迭代日志.md 里最后一次「本轮跑过变异树」的轮次 vs 已记录最新轮次
//        （日志进版本库 ⇒ 这一栏是白天会话唯一看得见的证据，故必须把匹配到的**原文行**摊出来
//          供人工核验 —— 启发式认错了，人一眼能看出来，这是本栏不撒谎的前提）；
//     ③ 结论：PASS / TRIP。
//
// ★ 只点名、不收口（沿用第 152 / 173 / 175 轮取舍）：本件是观察项、不进分母、不计退码。
//   它要解决的正是「没人喊」，而**每轮自动出现在体检输出里**本身就是喊 —— 不必靠加红。
//   哪天拍板要开红，把它从 OBSERVES 挪到 CHECKS 即可，脚本逻辑一个字不用改。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const VER = 'tests/mutation-freshness-tripwire.mjs V1.0.0';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const RESULTS = path.join(HERE, '.mut', 'teeth-results.txt');
const LOG = path.join(HERE, '体检迭代日志.md');

// 落后多少笔提交算「太久没跑」：第 170~173 轮连续四轮未跑才被人翻出来 ⇒ 取 4。
export const STALE_COMMITS = 4;
// 轮差阈值同口径。
export const STALE_ROUNDS = 4;

function git(args) {
    try {
        return execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();
    } catch {
        return null;
    }
}

// ---- ① 本地实时栏 ----------------------------------------------------------
// 抽成纯函数，喂字符串即可判定 ⇒ 双向牙可以直接构造输入，不必碰真实 .mut 文件。
export function assessResultFile(txt, headNow) {
    if (typeof txt !== 'string' || txt.length === 0) {
        return { ok: false, reason: '无结果文件（或内容为空）' };
    }
    const meta = {};
    for (const line of txt.split('\n')) {
        const m = line.match(/^#META\s+(\w+)=(.*)$/);
        if (m) meta[m[1]] = m[2].trim();
        if (line.startsWith('#####')) break; // META 只在文件头，见 mutation-teeth L823-830
    }
    if (!meta.HEAD) {
        return { ok: false, reason: '结果文件缺少 #META HEAD 头（无法证明它是哪笔提交上跑出来的）' };
    }
    const cnt = git(['rev-list', `${meta.HEAD}..HEAD`, '--count']);
    if (cnt === null) {
        // 跨机器 clone 时旧 HEAD 可能压根不在本仓库里：这不是「新鲜」，是「无从判断」，如实报。
        return {
            ok: false,
            metaAt: meta.AT || '(无)',
            metaHead: meta.HEAD,
            reason: `#META HEAD=${meta.HEAD} 不在本仓库可达范围内，无法计算落后笔数`,
        };
    }
    const behind = Number(cnt);
    return {
        ok: true,
        metaHead: meta.HEAD,
        metaAt: meta.AT || '(无)',
        headNow,
        behind,
        stale: behind > STALE_COMMITS,
    };
}

// ---- ② 跨机器栏 ------------------------------------------------------------
// 日志里「本轮跑过变异树」的正面表述。★ 刻意要求「变异树」+ 动作词同时出现，且排除「未跑」类：
// 只看「变异树」三个字会把「本轮未跑」「先收口再跑」全部误判成产出（第 175 轮「假候选」同款病）。
const RE_POSSITIVE = /变异树[^。\n]{0,40}(?:重跑|已做|重建|全量)/;
const RE_NEGATIVE = /变异树[^。\n]{0,60}(?:未跑|没跑|未做|未重跑)/;

export function assessLog(txt) {
    if (typeof txt !== 'string' || txt.length === 0) {
        return { ok: false, reason: '体检迭代日志缺失或为空' };
    }
    const lines = txt.split('\n');
    // 轮次标题形如：## 第 175 轮（2026-11-02 夜间 · V9 双通道轮）：……
    const rounds = [];
    let cur = null;
    const hits = [];
    for (const line of lines) {
        const h = line.match(/^##\s*第\s*(\d+)\s*轮/);
        if (h) {
            cur = Number(h[1]);
            rounds.push(cur);
            continue;
        }
        if (cur === null) continue;
        if (RE_NEGATIVE.test(line)) continue;
        if (RE_POSSITIVE.test(line)) hits.push({ round: cur, line: line.trim() });
    }
    if (rounds.length === 0) return { ok: false, reason: '日志里解析不出任何「## 第 N 轮」标题' };
    const latest = Math.max(...rounds);
    if (hits.length === 0) {
        return { ok: false, latest, reason: '日志里找不到任何「本轮跑过变异树」的记录' };
    }
    const last = hits[hits.length - 1];
    const gap = latest - last.round;
    return {
        ok: true,
        latest,
        lastRound: last.round,
        gap,
        evidence: last.line,
        stale: gap > STALE_ROUNDS,
    };
}

// ---- ③ 结论 ----------------------------------------------------------------
function main() {
    const headNow = git(['rev-parse', '--short', 'HEAD']) || '(unknown)';
    const a = assessResultFile(fs.existsSync(RESULTS) ? fs.readFileSync(RESULTS, 'utf8') : '', headNow);
    const b = assessLog(fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8') : '');

    const out = [];
    out.push('变异树新鲜度绊线（时间维度；指纹正确性归 mutation-teeth 六项守卫，本件不重复）');
    out.push('① 本地实时（tests/.mut/teeth-results.txt，被 gitignore ⇒ 换机器后必然无迹可寻）：');
    if (a.ok) {
        out.push(`   产出于 ${a.metaHead}（AT ${a.metaAt}），当前 ${a.headNow} ⇒ 落后 ${a.behind} 笔提交（阈值 ${STALE_COMMITS}）`);
    } else {
        out.push(`   ⚠️ ${a.reason}${a.metaAt ? `（AT ${a.metaAt}）` : ''}`);
    }
    out.push('② 跨机器（tests/体检迭代日志.md，进版本库 ⇒ 白天会话唯一看得见的证据）：');
    if (b.ok) {
        out.push(`   最后一次跑变异树：第 ${b.lastRound} 轮；已记录最新：第 ${b.latest} 轮 ⇒ 轮差 ${b.gap}（阈值 ${STALE_ROUNDS}）`);
        out.push(`   认定依据原文：${b.evidence.slice(0, 120)}`);
    } else {
        out.push(`   ⚠️ ${b.reason}${b.latest ? `（已记录最新第 ${b.latest} 轮）` : ''}`);
    }

    const trips = [];
    if (a.ok && a.stale) trips.push(`① 本地结果落后 ${a.behind} 笔提交 > ${STALE_COMMITS}`);
    if (b.ok && b.stale) trips.push(`② 日志轮差 ${b.gap} 轮 > ${STALE_ROUNDS}`);
    if (!a.ok) trips.push(`① ${a.reason}`);
    if (!b.ok) trips.push(`② ${b.reason}`);

    if (trips.length === 0) {
        out.push(`RESULT: PASS —— 变异树产出新鲜度在阈值内（落后 ${a.behind} 笔 / 轮差 ${b.gap} 轮）`);
    } else {
        out.push('RESULT: TRIP —— 变异树太久没跑了，下述结论勿当作当前代码的真值：');
        for (const t of trips) out.push(`   · ${t}`);
        out.push('   处理：跑 node tests/mutation-teeth.mjs --emit-prep / --emit-run / --report 刷新；');
        out.push('   指纹级（VER/MUTFP/RULEFP/ENGFP）校验由 --report 的六项守卫负责，本件不重复。');
    }
    console.log(out.join('\n'));
}

// ---- 自证牙 ----------------------------------------------------------------
// 第 175 轮教训：新增普查/绊线必须带双向牙，否则「今天绿」只是因为还没被污染。
// 牙喂合成文本，不碰真实 .mut ⇒ 无打桩文件需还原。
function selftest() {
    const headNow = git(['rev-parse', '--short', 'HEAD']) || '(unknown)';
    const fails = [];
    const ok = (cond, name) => { if (!cond) fails.push(name); };
    const mk = (head) => `#META VER=x\n#META HEAD=${head}\n#META AT=t\n##### MUT _base #####\n`;
    // 取一个确实存在的老提交做「陈旧」样本：基线提交 8fc478e1（第 99 轮）。
    const old = git(['rev-parse', '--short', '8fc478e1']) || null;

    // 牙 Z1（正面·会咬）：喂一个老 HEAD ⇒ 必须判 stale。
    // 牙 Z2（反面·不许乱咬）：喂当前 HEAD ⇒ 必须判不 stale。
    const rNow = assessResultFile(mk(headNow), headNow);
    ok(rNow.ok && rNow.behind === 0 && rNow.stale === false, 'Z2 当前 HEAD 应判不陈旧');
    if (old) {
        const rOld = assessResultFile(mk(old), headNow);
        ok(rOld.ok && rOld.behind > STALE_COMMITS && rOld.stale === true, `Z1 老 HEAD 应判陈旧（实测落后 ${rOld.behind}）`);
    }
    // 牙 Z3：缺 #META HEAD ⇒ 不许当作新鲜放行。
    const rNoHead = assessResultFile('#META VER=x\n##### MUT _base #####\n', headNow);
    ok(rNoHead.ok === false, 'Z3 缺 META HEAD 应判无法证明');
    // 牙 Z4：空文件 / 无结果文件 ⇒ 同上。
    ok(assessResultFile('', headNow).ok === false, 'Z4 空结果应判无法证明');

    // 牙 Z5（跨机器栏·会咬）：日志里最后一次产出在 100 轮、最新 176 轮 ⇒ 轮差 76 应判 stale。
    const log = '## 第 100 轮（x）：y\n- 变异树全量重跑完毕\n## 第 176 轮（x）：y\n- 别的事\n';
    const rLog = assessLog(log);
    ok(rLog.ok && rLog.lastRound === 100 && rLog.latest === 176 && rLog.gap === 76 && rLog.stale === true, 'Z5 日志轮差大应判陈旧');
    // 牙 Z6（不许乱咬）：「本轮未跑」这类负面表述不得被认成产出 —— 这是本栏最容易自产的假绿。
    const logNeg = '## 第 175 轮（x）：y\n- 变异树本轮未跑（先收口再跑）\n## 第 176 轮（x）：y\n- 别的事\n';
    ok(assessLog(logNeg).ok === false, 'Z6 「未跑」不得被认成产出记录');
    // 牙 Z7：正面与负面同一行时，负面优先（宁可认不出，也不许自产）。
    const logMix = '## 第 170 轮（x）：y\n- 变异树本轮未跑，但下轮会全量重跑\n';
    ok(assessLog(logMix).ok === false, 'Z7 正负同现应取负面优先');

    if (fails.length === 0) {
        console.log('自证牙 7 条全咬住（Z1 老 HEAD 必报 / Z2 当前 HEAD 不报 / Z3 缺 HEAD 不放行 / Z4 空文件不放行 / Z5 日志轮差大必报 / Z6 未跑不得认成产出 / Z7 正负同现取负面）');
        return 0;
    }
    console.log(`❌ 自证牙失败 ${fails.length} 条：${fails.join('；')}`);
    return 1;
}

if (process.argv.includes('--selftest')) {
    process.exit(selftest());
}
main();
