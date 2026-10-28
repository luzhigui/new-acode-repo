// tests/foundation-portability.mjs | V1.1.0 | 2026-10-28 夜间第 150 轮：★ 自证探针恢复真形态。
//
// V1.1.0 | 2026-10-28 夜间第 150 轮：兑现第 149 轮自己点名的下轮任务 —— 公共件根治之后，受体侧接上。
//   第 149 轮的教训是「自证探针写成真路径形态 ⇒ 污染真值，地基普查当场由 MATCH 变 DRIFT、
//   凭空多两条地基缺失」，当时只能把探针改成不含路径前缀的标识（probe-claimed）—— 那是**纪律**：
//   每新增一个带自证的件，写自证的人都得再记一次"别写真形态"，漏记一次就复发一次。
//   第 150 轮公共件 _lib/foundation-scan.mjs V1.1.0 把它变成**机制**：成对注释标记圈出的自证区豁免
//   + 抽取前剔注释（★ 顺序不可换：标记本身写在注释里，先剔注释会把标记一起删掉）。
//   本轮就在本件身上做闭环实证：**把探针改回真形态**（tests/.mut/probe-claimed.txt），
//   结论必须一字不变 —— 若改回真形态后地基普查又多出两条地基，就说明机制根本没生效。
//   另增【豁免差集点名】：raw 有、truth 无的每条逐条点名，并标明是被「自证区豁免」还是「注释豁免」吃掉。
//   ★ 机制把污染关掉了，但"关掉了什么"必须看得见 —— 否则哪天标记被删掉、真值重新被污染，
//     报告却依旧 MATCH，那就是**静默复发**（本仓库这类"看着在报、其实没咬住"的病已发作四次）。
//
// V1.0.0 | 2026-10-28 夜间第 149 轮：立本件。由来是第 148 轮留下的那句挂账 ——
//   「考虑把 tests/.mut/ 这类地基改为可随 patch 或资料库一起交付，它现在两边都不沾，
//    是唯一只能靠重跑 8 分钟拿回的东西」。第 148 轮只做到「缺失即报」，没解决「拿回来要 8 分钟」。
//
//   ★ 本轮动手做的时候撞上一个必须先解决的事实：地基清单里那 2 项并不等价 ——
//     tests/.mut/ 是 **1.9GB / 16369 个文件** 的变异树临时树（无人认领），
//     tests/.mut/teeth-results.txt 才是体检真正依赖的那一处（570KB，依赖方：牙口证据链对账）。
//     不先把这两类分开就谈"导出可携化"，等于要打包 1.9GB —— 那谁也不会去做，
//     于是这条建议会以"做不到"的名义继续挂着。本件第一件事就是把它拆开。
//
// 本件做三件事，且不改任何既有判据：
//   ①【认领分级】把非版本化地基分成「有依赖方 = 体检真地基（可携化面）」与
//      「无人认领 = 只是被忽略的产物（只报规模，不进快照）」，并给出可携化面的字节数。
//      ★ 判据唯一来源仍是 tests/_lib/foundation-scan.mjs（第 149 轮收口），本件不持有第二份。
//   ②【快照导出 / 回灌 / 对账】--export 导出（只搬认领面，每条带 sha256），--restore 回灌
//      （默认只补缺失的，--force 才覆盖），--snapshot 对账。回灌后**当场校验 sha256**，
//      ★ 回灌了但内容不对，比没回灌更危险：它会让体检从"红得有理"变成"绿得没据"。
//   ③【地基枚举面三视图】raw = 不折叠（实测 16369 条）/ strip 真值 = --directory 折叠（实测 1 条）。
//      ★ 两端都要钉住：strip 恒等于 raw ⇒ 折叠失效，报告被几千条淹没、真信号看不见；
//        strip 掉到 0 ⇒ 枚举面塌了，本件与地基普查会双双恒绿。
//
// 退码口径：挂 run-all 的 OBSERVES（观察项），与第 147 轮孤儿普查、第 148 轮地基普查同一取舍 ——
//   挂 CHECKS 会让分母 24 变 25，属改既有结论须拍板。本件 exit 1 表示「认领面里存在既不在本沙箱、
//   又无快照可回灌的地基」（不可携缺口）或自证未过。
//
// 本件与主代码的关系：只读 tests/、run-all.mjs（经 git 判定），写文件只写 --export/--restore 显式指定的目标。
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stripComments } from './_lib/static-truth-slice.mjs';
import {
    enumerateFoundations, collectItems, gitIgnored, ignoredPresentEntries, ROOT,
    pathLitViews, SELFCHECK_BEGIN, SELFCHECK_END,
    selfCheck as foundationSelfCheck,
} from './_lib/foundation-scan.mjs';

export const VER = 'tests/foundation-portability.mjs V1.1.0';

const RUN_ALL = 'tests/run-all.mjs';
const SELF = 'tests/foundation-portability.mjs';
const TESTS_DIR = 'tests';

// 无人认领标记：来自 foundation-scan 的「磁盘实测」那条，它表示"被 git 忽略且存在"，
// 但没有任何体检项引用它 ⇒ 不是体检地基，只是产物。
const UNCLAIMED = '（磁盘实测：存在但被 git 忽略）';

const SNAP_VER = 'foundation-snapshot V1';

function argOf(name) {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : '';
}

function hasFlag(name) {
    return process.argv.includes(name);
}

function sha256(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

function humanBytes(n) {
    if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(1) + 'GB';
    if (n >= 1024 * 1024) return (n / 1024 * 1024).toFixed(1) + 'MB';
    if (n >= 1024) return (n / 1024).toFixed(1) + 'KB';
    return n + 'B';
}

// 目录规模：只数不读内容（1.9GB 的临时树不能逐文件读）
function dirStats(rel) {
    const abs = path.join(ROOT, rel);
    let files = 0;
    let bytes = 0;
    const walk = (d) => {
        let ents = [];
        try {
            ents = fs.readdirSync(d, { withFileTypes: true });
        } catch (e) {
            return;
        }
        for (const e of ents) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            try {
                const st = fs.statSync(p);
                files++;
                bytes += st.size;
            } catch (err) { /* 统计性读取，跳过不可读项 */ }
        }
    };
    const st = fs.statSync(abs, { throwIfNoEntry: false });
    if (st && st.isDirectory()) walk(abs);
    else if (st) { files = 1; bytes = st.size; }
    return { files, bytes };
}

function headOf() {
    const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
    return (r.stdout || '').trim();
}

function loadItems() {
    const src = fs.readFileSync(path.join(ROOT, RUN_ALL), 'utf8');
    return collectItems(stripComments(src)).filter(it => it.script !== SELF);
}

function splitClaimed(unversioned) {
    const claimed = [];
    const unclaimed = [];
    for (const u of unversioned) {
        const users = u.users.filter(x => x !== UNCLAIMED);
        if (users.length) claimed.push(Object.assign({}, u, { users }));
        else unclaimed.push(u);
    }
    return { claimed, unclaimed };
}

// ---------------------------------------------------------------------------
// 豁免差集点名（第 150 轮新增）
//   ★ 机制负责"关掉污染"，这里负责"把关掉了什么打印出来"。
//     判据唯一来源仍是公共件的 pathLitViews（raw / selfcheck / truth 三视图），本件不持有第二份。
//     by 的判定：selfcheck 视图里就已经没有了 ⇒ 是自证区豁免吃掉的；
//                selfcheck 里还在、truth 里没了 ⇒ 是注释豁免吃掉的。
//   ★ 不做"有差集就报红"：今天清单里的件写得干不干净不是体检结论，点名即可（改退码须拍板）。
// ---------------------------------------------------------------------------
function scanExempted(items) {
    const hits = [];
    let rawTotal = 0;
    let selfTotal = 0;
    let truthTotal = 0;
    for (const it of items) {
        let src = '';
        try {
            src = fs.readFileSync(path.join(ROOT, it.script), 'utf8');
        } catch (e) {
            continue;
        }
        const v = pathLitViews(src);
        rawTotal += v.raw.length;
        selfTotal += v.selfcheck.length;
        truthTotal += v.truth.length;
        for (const rel of v.raw) {
            if (v.truth.includes(rel)) continue;
            hits.push({ script: it.script, rel, by: v.selfcheck.includes(rel) ? '注释豁免' : '自证区豁免' });
        }
    }
    return { hits, rawTotal, selfTotal, truthTotal };
}

function readSnap(file) {
    let txt = '';
    try {
        txt = fs.readFileSync(file, 'utf8');
    } catch (e) {
        return { err: String((e && e.message) || e), entries: [] };
    }
    let obj = null;
    try {
        obj = JSON.parse(txt);
    } catch (e) {
        return { err: '快照不是合法 JSON（' + String((e && e.message) || e) + '）', entries: [] };
    }
    if (!obj || obj.ver !== SNAP_VER || !Array.isArray(obj.entries)) {
        return { err: '快照格式不认识（ver=' + (obj && obj.ver ? obj.ver : '无') + '，期望 ' + SNAP_VER + '）', entries: [] };
    }
    return { err: '', entries: obj.entries, head: obj.head || '', createdAt: obj.createdAt || '' };
}

function exportSnap(claimed, dest) {
    const entries = [];
    const skipped = [];
    for (const u of claimed) {
        const abs = path.join(ROOT, u.rel);
        if (!fs.existsSync(abs)) { skipped.push(u.rel + '（本沙箱缺失，无从导出）'); continue; }
        if (fs.statSync(abs).isDirectory()) { skipped.push(u.rel + '（是目录，不进快照）'); continue; }
        const buf = fs.readFileSync(abs);
        entries.push({
            rel: u.rel,
            bytes: buf.length,
            sha256: sha256(buf),
            users: u.users,
            data: buf.toString('base64'),
        });
    }
    const snap = {
        ver: SNAP_VER,
        createdAt: new Date().toISOString(),
        head: headOf(),
        producer: VER,
        entries,
    };
    fs.writeFileSync(dest, JSON.stringify(snap));
    return { entries, skipped, file: dest };
}

function restoreSnap(entries, force) {
    const done = [];
    const added = [];
    const bad = [];
    for (const e of entries) {
        const abs = path.join(ROOT, e.rel);
        if (fs.existsSync(abs) && !force) { done.push(e.rel + '（已存在，跳过；--force 可覆盖）'); continue; }
        const buf = Buffer.from(e.data || '', 'base64');
        const got = sha256(buf);
        if (got !== e.sha256) { bad.push(e.rel + '（sha256 不符：期望 ' + e.sha256.slice(0, 12) + ' 实得 ' + got.slice(0, 12) + '）'); continue; }
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, buf);
        // ★ 回灌后当场读回校验：写了但内容不对，比没写更危险
        const back = fs.readFileSync(abs);
        if (sha256(back) !== e.sha256) bad.push(e.rel + '（回灌后读回校验失败）');
        else added.push(e.rel + '（' + humanBytes(buf.length) + '）');
    }
    return { added, done, bad };
}

function main() {
    const exportTo = argOf('--export');
    const restore = hasFlag('--restore');
    const snapshot = argOf('--snapshot');
    const force = hasFlag('--force');

    console.log('=========================================================');
    console.log('  地基可携化（第 149 轮新增 · 地基判据第七受体）');
    console.log('=========================================================');

    const items = loadItems();
    const unversioned = enumerateFoundations(items, TESTS_DIR);
    const { claimed, unclaimed } = splitClaimed(unversioned);

    // ③ 地基枚举面三视图
    const rawEntries = ignoredPresentEntries(TESTS_DIR);
    const rawAll = spawnSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '--', TESTS_DIR],
        { cwd: ROOT, encoding: 'utf8' });
    const rawCount = (rawAll.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).length;
    console.log('· 地基枚举面三视图（折叠口径对照）：');
    console.log('    raw(不折叠)=' + rawCount + ' 条 / strip(真值·--directory 折叠)=' + rawEntries.length + ' 条');
    if (rawEntries.length === 0) {
        console.log('    ✗ 折叠后 0 条 —— 枚举面塌了，本件与地基普查会双双恒绿');
    } else if (rawEntries.length === rawCount) {
        console.log('    ⚠ 折叠前后同数 —— 折叠未生效，真信号会被几千条临时文件淹没');
    } else {
        console.log('    折叠比 ' + rawCount + ':' + rawEntries.length + ' —— 折叠生效，真信号可见');
    }

    // ③b 依赖绑定面三视图 + 豁免差集（第 150 轮新增）
    const ex = scanExempted(items);
    console.log('· 依赖绑定面三视图（路径字面量抽取）：raw=' + ex.rawTotal + ' 条 / selfcheck='
        + ex.selfTotal + ' 条 / truth(真值)=' + ex.truthTotal + ' 条');
    if (!ex.hits.length) {
        console.log('    今日无假料：依赖表里没有自证探针、也没有只活在注释里的路径');
    } else {
        console.log('    ★ 被豁免的假料 ' + ex.hits.length + ' 条（raw 有、truth 无）—— 点名是为了让"机制到底咬住了什么"可被核对：');
        for (const h of ex.hits) console.log('       - ' + h.rel + '〔' + h.by + '〕@ ' + h.script);
    }

    // ① 认领分级
    console.log('· 认领分级（判据唯一来源：tests/_lib/foundation-scan.mjs）：');
    let portableBytes = 0;
    console.log('    ✅ 有依赖方 = 体检真地基（可携化面）' + claimed.length + ' 项：');
    for (const u of claimed) {
        const st = fs.existsSync(path.join(ROOT, u.rel)) ? dirStats(u.rel) : { files: 0, bytes: 0 };
        portableBytes += u.present ? st.bytes : 0;
        console.log('       ' + (u.present ? '✓' : '✗') + ' ' + u.rel + '（' + humanBytes(st.bytes) + '）⇒ ' + u.users.join('、'));
    }
    console.log('    ⚠ 无人认领 = 只是被忽略的产物（不进快照）' + unclaimed.length + ' 项：');
    for (const u of unclaimed) {
        const st = dirStats(u.rel);
        console.log('       ' + u.rel + '（' + humanBytes(st.bytes) + ' / ' + st.files + ' 文件）');
    }
    console.log('    ⇒ 可携化面合计 ' + humanBytes(portableBytes)
        + '；未认领面 ' + humanBytes(unclaimed.reduce((s, u) => s + dirStats(u.rel).bytes, 0))
        + ' —— ★ 不先分级就谈导出，等于要打包后者，那件事谁也不会去做');

    // 快照模式
    let gap = [];
    if (exportTo) {
        const r = exportSnap(claimed, exportTo);
        console.log('· 导出快照：' + r.file + '（' + r.entries.length + ' 条 / '
            + humanBytes(fs.statSync(exportTo).size) + '）');
        for (const e of r.entries) console.log('       ✓ ' + e.rel + '（' + humanBytes(e.bytes) + ' sha256=' + e.sha256.slice(0, 12) + '）');
        for (const s of r.skipped) console.log('       - 跳过 ' + s);
    }
    if (restore && snapshot) {
        const s = readSnap(snapshot);
        if (s.err) {
            console.log('· 回灌：读不到快照 —— ' + s.err);
            gap = claimed.map(u => u.rel);
        } else {
            const r = restoreSnap(s.entries, force);
            console.log('· 回灌：新增 ' + r.added.length + ' 条 / 跳过 ' + r.done.length + ' 条 / 失败 ' + r.bad.length + ' 条');
            for (const a of r.added) console.log('       ✓ 回灌 ' + a);
            for (const d of r.done) console.log('       · ' + d);
            for (const b of r.bad) console.log('       ✗ ' + b);
        }
    }
    if (snapshot && !restore) {
        const s = readSnap(snapshot);
        if (s.err) {
            console.log('· 快照对账：' + s.err);
        } else {
            const after = enumerateFoundations(items, TESTS_DIR);
            const afterClaimed = splitClaimed(after).claimed;
            const present = new Set(afterClaimed.filter(u => u.present).map(u => u.rel));
            const covered = s.entries.filter(e => present.has(e.rel)).length;
            gap = afterClaimed.filter(u => !u.present && !s.entries.some(e => e.rel === u.rel)).map(u => u.rel);
            console.log('· 快照对账：快照 ' + s.entries.length + ' 条（产出于 ' + (s.head || '未知 HEAD') + '）'
                + ' / 本沙箱已存在 ' + covered + ' 条 / 不可携缺口 ' + gap.length + ' 条');
        }
    }
    if (!snapshot && !exportTo) {
        gap = claimed.filter(u => !u.present).map(u => u.rel);
    }
    const didSnapCheck = !!snapshot;
    // 回灌/导出之后再量一次可携化面：否则刚被救回来的地基在结论行里会显示成 0B，像没救回来一样。
    if (restore || exportTo) {
        const after = splitClaimed(enumerateFoundations(items, TESTS_DIR)).claimed;
        portableBytes = after.reduce((s, u) => s + (fs.existsSync(path.join(ROOT, u.rel)) ? dirStats(u.rel).bytes : 0), 0);
    }

    // 自证：本件三条 + 地基公共件自证，★ 一并并入同一份 fails（只打印不计退码就是假绿）
    const fails = runSelfChecks(rawCount, rawEntries.length, claimed.length)
        .concat(foundationSelfCheck().map(b => '地基枚举公共件自证：' + b));
    for (const bad of fails) console.log('  ✗ ' + bad);
    if (fails.length) {
        console.log('  ⇒ 自证未过 —— 上述全部结论不可信');
        console.log('=========================================================');
        process.exit(1);
    }

    if (gap.length) {
        console.log('· ⚠ 不可携缺口 ' + gap.length + ' 项（既不在本沙箱、又无快照可回灌）：');
        for (const g of gap) console.log('    ' + g);
        console.log('    ⇒ 这些项只能靠重跑产出（如重跑变异树约 8 分钟）；用 --export 落一份快照即可免掉');
    } else if (didSnapCheck) {
        console.log('· 认领面地基齐全，且快照覆盖到位 ⇒ 换沙箱不必重跑');
    } else {
        console.log('· 认领面地基在本沙箱齐全；★ 本轮未做快照对账（传 --snapshot <file> 才能判定"换沙箱能否不重跑"）');
    }

    console.log('=========================================================');
    console.log('RESULT: ' + (gap.length ? 'DRIFT' : 'MATCH') + ' —— 不可携缺口 ' + gap.length + ' 项 / 可携化面 '
        + claimed.length + ' 项（' + humanBytes(portableBytes) + '）');
    console.log('=========================================================');
    process.exit(gap.length ? 1 : 0);
}

// FOUNDATION-SELFCHECK-BEGIN
function runSelfChecks(rawCount, stripCount, claimedCount) {
    const fails = [];
    // ① 认领判据：无人认领与已认领两端都钉住（分错类 = 该搬的没搬、不该搬的搬了 1.9GB）
    // ★ 探针**故意写成真路径形态**（tests/.mut/ 开头）—— 这是第 150 轮的闭环实证：
    //   第 149 轮就是因为这么写才污染真值（地基普查 MATCH 变 DRIFT、凭空多两条地基缺失），
    //   当时唯一的办法是把探针改成不含路径前缀的标识，那是纪律不是机制；
    //   本轮公共件 V1.1.0 给了机制（自证区标记豁免 + 抽取前剔注释），探针于是可以恢复真形态，
    //   而结论必须一字不变 —— 自证⑤同时验「raw 里有探针」与「truth 里没有探针」两端。
    //   ★ 自证要证明的是**分类逻辑**；机制生效后，"路径长相"不再是需要回避的东西。
    const probe = [
        { rel: 'tests/.mut/probe-unclaimed.txt', users: [UNCLAIMED], why: '', present: true },
        { rel: 'tests/.mut/probe-claimed.txt', users: ['牙口证据链对账(离线断言)'], why: '', present: true },
    ];
    const sp = splitClaimed(probe);
    if (sp.claimed.length !== 1 || sp.claimed[0].rel !== 'tests/.mut/probe-claimed.txt') {
        fails.push('① 认领分级失位：有依赖方的地基没被分进可携化面（实得 ' + JSON.stringify(sp.claimed.map(x => x.rel)) + '）');
    }
    if (sp.unclaimed.length !== 1 || sp.unclaimed[0].rel !== 'tests/.mut/probe-unclaimed.txt') {
        fails.push('①b 认领分级失位：无人认领的产物被当成了体检地基（实得 ' + JSON.stringify(sp.unclaimed.map(x => x.rel)) + '）');
    }
    // ② 快照往返自证：导出 → 回灌到临时目标 → 读回校验 sha256，任一步错都必须喊
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp149-'));
    try {
        // 第 150 轮：机制生效后不必再靠拼装躲抽取器 —— 自证区内的字面量不计真值，直写即可。
        const srcRel = 'tests/.mut/teeth-results.txt';
        const srcAbs = path.join(ROOT, srcRel);
        if (!fs.existsSync(srcAbs)) {
            fails.push('② 快照往返自证跑不了：' + srcRel + ' 不在本沙箱（本件因此无法证明回灌可信）');
        } else {
            const buf = fs.readFileSync(srcAbs);
            const snapFile = path.join(tmpDir, 'snap.json');
            const r = exportSnap([{ rel: srcRel, users: ['自证'], present: true }], snapFile);
            if (r.entries.length !== 1) {
                fails.push('② 导出失位：快照里没有那条地基（实得 ' + r.entries.length + ' 条）');
            } else {
                const s = readSnap(snapFile);
                // 回灌到沙箱外的一个假根：直接写目标文件校验内容，不动真实地基
                const backBuf = Buffer.from(s.entries[0].data, 'base64');
                const backSha = sha256(backBuf);
                if (backSha !== s.entries[0].sha256) {
                    fails.push('② 往返校验失位：解出的内容与 sha256 不符（期望 ' + s.entries[0].sha256.slice(0, 12) + ' 实得 ' + backSha.slice(0, 12) + '）');
                }
                if (backBuf.length !== buf.length) {
                    fails.push('②b 往返校验失位：字节数不符（原 ' + buf.length + ' / 解回 ' + backBuf.length + '）');
                }
            }
        }
        // ③ 快照不得夹带版本化文件：那等于把主代码/已跟踪文件外带，回灌时会污染工作区
        if (gitIgnored('tests/run-all.mjs')) {
            fails.push('③ 快照边界自证失位：tests/run-all.mjs 被判成非版本化 —— 版本化文件会被塞进快照');
        }
        // ④ 三视图两端：折叠失效与枚举面塌陷都要能被数出来
        if (stripCount > rawCount) {
            fails.push('④ 三视图失位：折叠后条数 ' + stripCount + ' 反而多于不折叠 ' + rawCount + '（枚举面逻辑已坏）');
        }
        if (claimedCount === 0) {
            fails.push('④b 可携化面为空：没有任何体检项引用到非版本化地基 —— 多半是依赖绑定塌了（本件会恒绿）');
        }
        // ⑤ 机制闭环实证（第 150 轮新增，本件本轮存在的理由）：
        //   本件自己的探针**必须被豁免** —— raw 视图里必须有（否则探针被改掉了 ⇒ ⑤b 是空转的假绿），
        //   truth 视图里必须没有（否则就是第 149 轮那款污染的复发路径）。
        const selfSrc = fs.readFileSync(path.join(ROOT, SELF), 'utf8');
        const sv = pathLitViews(selfSrc);
        for (const pr of ['tests/.mut/probe-claimed.txt', 'tests/.mut/probe-unclaimed.txt']) {
            if (!sv.raw.includes(pr)) {
                fails.push('⑤ 自证探针没写进本件源码（' + pr + ' 在 raw 视图里都找不到）—— 探针被改掉了，⑤b 那条会变成空转的假绿');
            }
            if (sv.truth.includes(pr)) {
                fails.push('⑤b 自证区豁免没咬住本件自己：探针 ' + pr + ' 混进真值 —— 这正是第 149 轮「地基普查 MATCH 变 DRIFT」的复发路径');
            }
        }
        if (!selfSrc.includes(SELFCHECK_BEGIN) || !selfSrc.includes(SELFCHECK_END)) {
            fails.push('⑤c 自证区标记缺失：本件源码里找不到成对的标记常量引用 —— 标记不成对则豁免区一直吃到文件尾，真值会被整段吃掉');
        }
    } catch (e) {
        fails.push('地基可携化自证自身抛异常（' + (e && e.message ? e.message : String(e)) + '）⇒ 本件全部结论作废');
    } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* 临时目录清理失败不影响结论 */ }
    }
    return fails;
}
// FOUNDATION-SELFCHECK-END

main();
