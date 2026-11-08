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

export const VER = 'tests/mutation-freshness-tripwire.mjs V1.1.0';

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
// V1.1.0（第 189 轮）：第 186/188 两轮确实全量重跑过（`--emit-prep` → `--emit-run` → `--report`），
// 但日志原文写作「按既有三步全量重跑 48 棵树」「变异树恢复：全量重跑 47 棵树」「收尾跑 mutation-teeth 的 --report 复核」，
// 三条都不满足旧口径（前两条「变异树」与动作词不相邻，后一条只有命令行没有「变异树」），
// 于是识别不出，第 189 轮开场误报「轮差 5 > 4」。
// ★ 这是「识别器字面清单不全」的漏报（把产出读成没产出），与 Z6/Z7 防的「假绿」方向相反；
//   修法只能是**补三条独立成词的正字面**，绝不放宽 RE_NEGATIVE，也绝不让「未跑」类靠近闸门。
//   ★ 三条正面字面各自独立、互不借力，任一条成立即算产出：
//     P1 「变异树」+ 动作词（近距离，≤40 字）—— 原口径，不变；
//     P2 「<数字> 棵树」+ 动作词（近距离，≤12 字）—— 日志写「全量重跑 48 棵树」这种把主语写成树数的措辞；
//     P3 三连命令 `--emit-prep` 与 `--emit-run` 同现 —— 这两个子命令存在的唯一用途就是跑变异树，
//        只跑 --report 不算（report 只读旧结果，不产出新证据）；
//        ★ V1.1.0 同轮追加的边界：**表格行与反引号内的引用式提及不算**。由头是本轮自证——日志在
//          解释 P1/P2/P3 时自己引用了 `--emit-prep` 与 `--emit-run`（表格里并列写着「同现」），
//          这种「谈论命令」的行被 P3 当成了「执行命令」。判据改为：必须是一行**真命令行**
//          （`node tests/mutation-teeth.mjs ...` 或 `--emit-prep` 裸在正文里，且不是 `|` 开头的表格行、
//           不是反引号包着的行内代码片段）。宁可漏认一条措辞，也不许把「谈论」读成「执行」。
//   ★ 负面优先不受影响：RE_NEGATIVE 仍先判，命中即跳过（Z6/Z7/Z12）。
const RE_POSSITIVE = /变异树[^。\n]{0,40}(?:重跑|已做|重建|恢复|跑了|全量)/;
const RE_POSSITIVE_TREES = /[0-9二三四五六七八九十]{1,3}\s*棵树[^。\n]{0,12}(?:重跑|已跑|跑完|恢复|emit-run|全量)/;
const RE_NEGATIVE = /变异树[^。\n]{0,60}(?:未跑|没跑|未做|未重跑)/;

// P3 专用：判断这一行是不是「真的在跑命令」，而不是「在谈论命令」。
// 三条否据：① Markdown 表格行（以 | 开头 / 含 |...| 结构）；② 整行被反引号包成行内代码；
//          ③ 两个命令都被反引号包着且同行出现「同现」「不算」「只有」这类讨论词（本轮自证的表格行形态）。
function looksLikeRealCommandLine(line) {
    const t = line.trim();
    if (t.startsWith('|')) return false;                        // 表格行
    if (/^`[^`]+`$/.test(t)) return false;                      // 整行是一段行内代码
    if (!/--emit-prep/.test(t) || !/--emit-run/.test(t)) return false;
    // ④ 新：命令被反引号包着且该行有「引用/原文/样本/措辞/写法」这类**谈论措辞** ⇒ 是在引用别人跑过的记录。
    //   （真执行行通常写成 `node tests/mutation-teeth.mjs --emit-prep` 且不会同时谈「原文/样本」。）
    if (/`--emit-(?:prep|run)`/.test(t) && /(?:原文|样本|措辞|写法|引用|字面|日志写)/.test(t)) return false;
    // 「谈论」词与两个命令同现 ⇒ 判为引用而非执行（宁可漏认）。
    if (/(?:同现|不算|只有|专门|唯一用途|这个词|字面)/.test(t)) return false;
    return true;
}

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
        const pos =
            RE_POSSITIVE.test(line) ||
            RE_POSSITIVE_TREES.test(line) ||
            looksLikeRealCommandLine(line);
        if (pos) hits.push({ round: cur, line: line.trim() });
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

    // ---- V1.1.0 新增：词表漏报的三条真实措辞（Z8/Z9/Z10 正面）与两条防误收（Z11/Z12 反面）----
    // ★ 这三条不是臆造的样本，是第 187/188 轮日志的**原文**：绊线当时认不出，误报轮差 5。
    const logR48 = '## 第 188 轮（x）：y\n- 按既有三步全量重跑 48 棵树（`--emit-prep` → `--emit-run` → `--report`）\n';
    const r48 = assessLog(logR48);
    ok(r48.ok && r48.lastRound === 188, 'Z8 「全量重跑 48 棵树」应被认成产出（V1.0.0 漏报的真实措辞）');
    const logRep = '## 第 187 轮（x）：y\n- 收尾按 node tests/mutation-teeth.mjs --emit-prep 与 --emit-run 三步走完\n';
    ok(assessLog(logRep).lastRound === 187, 'Z9 「--emit-prep/--emit-run 三步」应被认成产出');
    // Z14（不许乱咬·V1.1.0 同轮追加）：**谈论**命令的行不得被当成**执行**命令。
    // 由头是本轮自证踩到的两处真形态：① 表格行里并列写着两个命令与「同现」；② 正文引用别轮原文。
    // 判据在 looksLikeRealCommandLine 里，这里各喂一条真实形态。
    const logTableTalk = '## 第 190 轮（x）：y\n| P3（新） | `--emit-prep` 与 `--emit-run` **同现** | 这两个子命令的唯一用途就是跑变异树 |\n';
    ok(assessLog(logTableTalk).ok === false, 'Z14a 表格行谈论命令不得算产出');
    const logQuoteTalk = '## 第 190 轮（x）：y\n- 三条正面样本取自日志原文：`--emit-prep` → `--emit-run` → `--report`，未改写\n';
    ok(assessLog(logQuoteTalk).ok === false, 'Z14b 引用别轮原文不得算产出');
    // Z13（不许乱咬·V1.1.0 新增的边界）：只跑 `--report` 不产出新证据，不许算成「本轮跑过变异树」。
    // 这是 P3 设计时定的取舍：report 只读旧结果、不刷树；把 report 当产出等于让陈旧结果自称新鲜。
    const logReportOnly = '## 第 187 轮（x）：y\n- 收尾跑了 mutation-teeth 的 --report 复核旧结果\n';
    ok(assessLog(logReportOnly).ok === false, 'Z13 只跑 --report 不得算成产出');
    const logFix = '## 第 186 轮（x）：y\n- 变异树恢复：全量重跑 47 棵树\n';
    ok(assessLog(logFix).lastRound === 186, 'Z10 「变异树恢复」应被认成产出');
    // Z11：只有「变异树」没有动作词 ⇒ 不许认（词表扩了，但「变异树」在场这个前提不能丢）。
    const logBare = '## 第 190 轮（x）：y\n- 看了下变异树目录里的 3 个文件\n';
    ok(assessLog(logBare).ok === false, 'Z11 只提变异树、无动作词应不认成产出');
    // Z12：负面＋某个计数 ⇒ 仍必须负面优先（扩词表不许污染 Z6/Z7 立的规矩）。
    const logNeg2 = '## 第 190 轮（x）：y\n- 变异树未跑，只跑了 --report 看旧结果\n';
    ok(assessLog(logNeg2).ok === false, 'Z12 未跑＋--report 同现仍应判负面优先');

    if (fails.length === 0) {
        console.log('自证牙 15 条全咬住（Z1 老 HEAD 必报 / Z2 当前 HEAD 不报 / Z3 缺 HEAD 不放行 / Z4 空文件不放行 / Z5 日志轮差大必报 / Z6 未跑不得认成产出 / Z7 正负同现取负面 / Z8–Z10 三种真实措辞必认 / Z11 无动作词不认 / Z12 未跑＋计数仍负面优先 / Z13 只跑 --report 不算产出 / Z14a 表格行谈论命令不认 / Z14b 引用原文不认）');
        return 0;
    }
    console.log(`❌ 自证牙失败 ${fails.length} 条：${fails.join('；')}`);
    return 1;
}

if (process.argv.includes('--selftest')) {
    process.exit(selftest());
}
main();
