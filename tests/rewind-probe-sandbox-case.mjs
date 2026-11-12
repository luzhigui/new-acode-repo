// tests/rewind-probe-sandbox-case.mjs — 倒针域探针共用件（node 直跑；本域定向用例复用）
// 本件只做四件事：
//   ① 最小 DOM / 浏览器桩：ui/727 要 document.getElementById('log')、document.body.classList、
//      location/localStorage（isRewindEnabled 读）；
//   ② 假 battleStore：吃 SET_UNITS / SET_ROUND / REMOVE_UNIT / SET_FLASH / SET_VISUAL /
//      CLEAR_UNIT_FLASH，让 syncStoreFromStep 的落账可观测；
//   ③ 录制桩：真调 player/513 的 startBattleRecording / feedBattleStep（回看数据源同款接口）；
//   ④ 变异体工厂：把 ui/727 的**真源码**改坏 → 写到系统临时目录 → 相对 import 改写成绝对
//      file:// URL → 动态 import。于是「反向样本」跑的是被改坏的真代码，不是假造的结果。
// 子进程约定：设 HC_PROBE_MUT=<变异名> 时，本进程只跑变异体（父进程用它验「反向样本真的红」）；
//   不设时跑原版（正路径）。
// ★ 本件是倒针域的合成动态探针，不挂 run-all 常规链（需要桩环境），由本域手动/里程碑跑。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REWIND_SRC = path.join(REPO, 'ui', '727-rewind-core.js');

// ---------- ① DOM / 浏览器桩 ----------
export function installDom() {
    function fakeEl(id) {
        return {
            id: id || '', innerHTML: '', children: [], scrollTop: 0, scrollHeight: 0,
            lastElementChild: null, style: {},
            classList: { add() { }, remove() { }, contains() { return false; } },
            appendChild(c) { this.children.push(c); this.lastElementChild = c; return c; },
            remove() { }, addEventListener() { }, removeEventListener() { }
        };
    }
    const logEl = fakeEl('log');
    globalThis.document = {
        readyState: 'complete',
        body: { classList: { add() { }, remove() { }, contains() { return false; } }, appendChild() { } },
        head: { appendChild() { } },
        getElementById(id) { return id === 'log' ? logEl : null; },
        createElement() { return fakeEl(); },
        querySelector() { return null; }, querySelectorAll() { return []; },
        addEventListener() { }
    };
    globalThis.window = { addEventListener() { }, updateBuffSlots() { }, setTimeout, clearTimeout, setInterval, clearInterval };
    globalThis.localStorage = { getItem() { return null; }, setItem() { }, removeItem() { } };
    globalThis.location = { search: '' };
    return logEl;
}

// ---------- ② 假 battleStore ----------
export function makeFakeStore() {
    return {
        _state: { units: [], round: 1 },
        dispatch(a) {
            if (!a) return;
            const st = this._state;
            if (a.type === 'SET_UNITS') st.units = a.units || [];
            else if (a.type === 'SET_ROUND') st.round = a.round;
            else if (a.type === 'REMOVE_UNIT') st.units = st.units.filter(u => u.uid !== a.uid);
            else if (a.type === 'SET_FLASH' || a.type === 'SET_VISUAL') {
                const u = st.units.find(x => x.uid === a.uid);
                if (u) { if (a.type === 'SET_FLASH') u._flash = a.flash; else u[a.uid ? '_visual' : '_x'] = a.value; }
            } else if (a.type === 'CLEAR_UNIT_FLASH') {
                const u = st.units.find(x => x.uid === a.uid);
                if (u) u._flash = null;
            }
        },
        getState() { return this._state; },
        subscribe() { return () => { }; },
        setState(s) { this._state = Object.assign({}, this._state, s); }
    };
}

// ---------- ③ 录制桩 ----------
export function mkUnit(uid, alive) {
    // _mods 必须是三数组齐全的形状：player/506 的 syncStoreFromStep 会做 [...u._mods.atk] 展开
    return { uid, alive: alive !== false, hp: 100, maxHp: 100, atk: 10, def: 5, pos: 1, role: 'warrior', name: uid, _mods: { atk: [], def: [], maxHp: [] } };
}
export function mkStep(allyUids, opts) {
    const o = opts || {};
    return {
        log: o.log || [], events: [],
        ally: (allyUids || []).map(u => mkUnit(u, true)),
        enemy: (o.enemy || []).map(u => mkUnit(u, true)),
        winner: null, done: false, doubleStrikeUid: null,
        stageActions: o.stageActions || [], frozenValues: {}
    };
}

// ---------- ④ 变异体工厂 ----------
// mutations: { 变异名: (src: string) => string }，每个函数必须真的改到源码（否则视为打空，报错）。
export function makeMutantFile(mutName, mutations) {
    const fn = mutations[mutName];
    if (!fn) throw new Error('未知变异名 ' + mutName + '（可用：' + Object.keys(mutations).join('/') + '）');
    // 统一成 LF 再改：仓库文件是 CRLF，变异串按 '\n' 拼的话会打空（打空 = 反向样本假绿）
    const src = fs.readFileSync(REWIND_SRC, 'utf8').replace(/\r\n/g, '\n');
    const out = fn(src);
    if (out === src) throw new Error('变异 ' + mutName + ' 没改到任何字符 ⇒ 反向样本无效（打空了）');
    // 相对 import（'../infra/xxx.js'）改写成绝对 file:// URL：变异体住在系统临时目录里，
    // 相对路径会指到 temp，必须改写成仓库绝对地址才能 import 到同一批模块。
    const rewritten = out.replace(/from\s+'(\.\.\/[^']+)'/g, (_m, rel) => {
        const abs = path.join(REPO, rel.replace(/^\.\.\//, ''));
        return "from '" + pathToFileURL(abs).href + "'";
    });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hc-rewind-probe-'));
    const file = path.join(dir, '727-mutant-' + mutName.replace(/[^\w-]/g, '_') + '.mjs');
    fs.writeFileSync(file, rewritten, 'utf8');
    return { file, dir, cleanup() { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ } } };
}

/** 载入原版或变异体 ui/727（mutName 为空 ⇒ 原版）。 */
export async function loadRewind(mutName, mutations) {
    if (!mutName) return await import(pathToFileURL(REWIND_SRC).href);
    const m = makeMutantFile(mutName, mutations);
    try { return await import(pathToFileURL(m.file).href); }
    finally { m.cleanup(); }
}

/** 以子进程跑本用例的变异体，返回 { code, out }（父进程用来自证「反向样本真的红」）。 */
export function runMutantChild(selfPath, mutName) {
    const r = spawnSync(process.execPath, [selfPath], {
        cwd: REPO, encoding: 'utf8', timeout: 120000,
        env: Object.assign({}, process.env, { HC_PROBE_MUT: mutName })
    });
    return { code: typeof r.status === 'number' ? r.status : 1, out: (r.stdout || '') + (r.stderr || '') };
}

// ---------- 断言与汇总 ----------
export function check(list, name, cond, detail) {
    list.push({ name, ok: !!cond, detail: detail || '' });
    console.log((cond ? '  ✓ ' : '  ✗ ') + name + (detail ? ' — ' + detail : ''));
}
export function summarize(list, label) {
    const bad = list.filter(x => !x.ok);
    if (bad.length) {
        console.log('RESULT: FAIL (' + bad.length + '/' + list.length + ' 条断言失败)');
        process.exitCode = 1;
        return false;
    }
    console.log('RESULT: PASS (' + list.length + ' 条断言全过) · ' + (label || ''));
    return true;
}

// ---------------------------------------------------------------------------
// 第二轮追加（2026-11-12 · D13 第二棒）：闸门环境守卫 + 时钟/日志保真 + 子进程失败识别
// ---------------------------------------------------------------------------

/** 「守卫前提失效」的统一措辞：规则、探针、日志、交付都用这一句，便于搜。 */
export const ENV_SKIP_REASON = '守卫前提失效：环境不允许起子进程';

/** 系统级「起不来子进程」的 errno 集合：这些不是主代码缺陷，是环境前提失效。 */
export const SPAWN_ENV_FAIL_CODES = new Set([
    'EPERM', 'ENOENT', 'EACCES', 'EAGAIN', 'EBUSY', 'EIO', 'EMFILE', 'ENFILE',
    'ENOMEM', 'ENOSPC', 'ENOSYS', 'ENOTDIR', 'EFAULT', 'EINVAL', 'EPIPE', 'EDEADLK'
]);

/**
 * 判断一次 spawn 失败是不是「环境不允许起子进程」。
 * ★ 关键分辨：子进程**跑完了并退码非 0**（err.status 是数字）= 探针真的报红 ⇒ 必须算 fail；
 *   只有「压根没起来」（ENOENT/EPERM…）才是环境问题 ⇒ 只能 skip，不能误报红。
 */
export function isSpawnEnvFailure(err) {
    if (!err || typeof err !== 'object') return false;
    if (typeof err.status === 'number') return false;
    const code = err.code || err.errno;
    if (typeof code === 'string' && SPAWN_ENV_FAIL_CODES.has(code)) return true;
    if (err.syscall === 'spawn' || err.syscall === 'spawnSync') return true;
    return false;
}

/** 探针自己宣告「环境前提失效」：规则据此返回 skip，而不是误报红。 */
export function envSkipMarker(reason) {
    return 'RESULT: SKIP-ENV (' + (reason || ENV_SKIP_REASON) + ')';
}
export function isEnvSkipOutput(out) {
    return /RESULT:\s*SKIP-ENV/.test(String(out || ''));
}

/** 起一个子进程并回报「是不是压根没起来」（spawnError 非空 ⇒ 环境问题）。 */
export function runChildWithEnv(selfPath, env, timeoutMs) {
    const r = spawnSync(process.execPath, [selfPath], {
        cwd: REPO, encoding: 'utf8', timeout: timeoutMs || 180000,
        env: Object.assign({}, process.env, env || {})
    });
    return {
        code: typeof r.status === 'number' ? r.status : 1,
        out: (r.stdout || '') + (r.stderr || ''),
        spawnError: r.error ? (r.error.code || r.error.message || 'SPAWN_FAILED') : null
    };
}

/** rAF 桩 + 启动时钟：infra/103 的 clock 靠 requestAnimationFrame 推进，
 *  没有它 clock.wait()/waitReal() 永远不 resolve ⇒ 探针里的播放路径会挂死。 */
export async function installClockShim() {
    globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
    const { clock } = await import('../infra/103-clock.js');
    clock.start();
    return clock;
}

/** 让 log 元素的 innerHTML ↔ children 联动：真 DOM 里 innerHTML='' 会清空子节点，
 *  旧桩只存字符串 ⇒ 「清空真账本」这类改动在桩上根本看不见。 */
export function upgradeLogDomFidelity() {
    const el = globalThis.document && globalThis.document.getElementById('log');
    if (!el) return false;
    let html = el.innerHTML || '';
    Object.defineProperty(el, 'innerHTML', {
        configurable: true,
        get() { return html; },
        set(v) {
            html = String(v);
            el.children = html ? [{ tag: 'div', innerHTML: html }] : [];
            el.lastElementChild = html ? el.children[0] : null;
        }
    });
    return true;
}
