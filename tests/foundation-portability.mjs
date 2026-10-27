// tests/foundation-portability.mjs | V1.0.0 | 2026-10-28 夜间第 149 轮：新增「地基可携化」。
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
    selfCheck as foundationSelfCheck,
} from './_lib/foundation-scan.mjs';

export const VER = 'tests/foundation-portability.mjs V1.0.0';

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

function runSelfChecks(rawCount, stripCount, claimedCount) {
    const fails = [];
    // ① 认领判据：无人认领与已认领两端都钉住（分错类 = 该搬的没搬、不该搬的搬了 1.9GB）
    // ★ 探针的 rel 刻意**不写成能被归一成仓库路径的字面量**（不用 tests/.mut/ 开头）：
    //   本仓库的"依赖 = 源码里的路径字面量"判据是静态的，它分不清真依赖与自证合成样本 ——
    //   本件第一版把探针写成"仓库路径 + 目录前缀 + 点 txt 后缀"的真形态（连注释里也这么举例），
    //   结果地基普查把这些合成路径当成真地基，报告当场由 MATCH 变 DRIFT、凭空多出"地基缺失"
    //   （本轮实测，见迭代日志第 149 轮）。★ 抽取时不剔注释，所以注释里写同样形态一样中招。
    //   ⇒ 自证要证明的是**分类逻辑**，不是路径长相；路径可以随便取，取了真长相反而污染真值。
    const probe = [
        { rel: 'probe-unclaimed', users: [UNCLAIMED], why: '', present: true },
        { rel: 'probe-claimed', users: ['牙口证据链对账(离线断言)'], why: '', present: true },
    ];
    const sp = splitClaimed(probe);
    if (sp.claimed.length !== 1 || sp.claimed[0].rel !== 'probe-claimed') {
        fails.push('① 认领分级失位：有依赖方的地基没被分进可携化面（实得 ' + JSON.stringify(sp.claimed.map(x => x.rel)) + '）');
    }
    if (sp.unclaimed.length !== 1 || sp.unclaimed[0].rel !== 'probe-unclaimed') {
        fails.push('①b 认领分级失位：无人认领的产物被当成了体检地基（实得 ' + JSON.stringify(sp.unclaimed.map(x => x.rel)) + '）');
    }
    // ② 快照往返自证：导出 → 回灌到临时目标 → 读回校验 sha256，任一步错都必须喊
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp149-'));
    try {
        // 同上：真实地基路径也用拼装取，避免自证样本被静态抽取器认成"本件依赖该地基"
        const srcRel = ['tests', '.mut', 'teeth-results.txt'].join('/');
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
    } catch (e) {
        fails.push('地基可携化自证自身抛异常（' + (e && e.message ? e.message : String(e)) + '）⇒ 本件全部结论作废');
    } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* 临时目录清理失败不影响结论 */ }
    }
    return fails;
}

main();
