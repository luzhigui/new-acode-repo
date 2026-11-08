// 倒针写入面「动态」探针（合成用例，node 直跑，不开浏览器）：
//   静态规则 267 只能证明源码结构上只有 enterReview/exitReview 会换账本；
//   本用例把 ui/727 真跑起来，用最小 DOM/Store 桩 + 真录制接口（513 startBattleRecording），
//   动态验证三条硬契约：
//     ① 回看期间 GlobalStore.battleLog / battleFacts 被换成临时数组（快照隔离生效）；
//     ② 回看期间做步进/段拨等定位动作，原真账本数组不被任何一处写入（引用与内容都不变）；
//     ③ 退出回看后两份账本按「引用」整块还原，isRewinding 复位为 false。
//   附图：double-enter（重复进场幂等）、double-exit（重复退出不抛）。
// 运行：node tests/rewind-write-probe-case.mjs
//   期望末行 RESULT: PASS（全绿）；任一断言失败打印 FAIL 并以退出码 1 结束。
// 说明：本件是倒针域的合成动态探针，不挂 run-all 常规链（需要桩环境），由本域手动/里程碑跑。
const RESULT = [];

// ---------- 最小 DOM / 浏览器桩 ----------
function fakeEl(id) {
    const el = {
        id: id || '',
        innerHTML: '',
        children: [],
        scrollTop: 0,
        scrollHeight: 0,
        lastElementChild: null,
        style: {},
        classList: { add() { }, remove() { }, contains() { return false; } },
        appendChild(c) { this.children.push(c); this.lastElementChild = c; return c; },
        remove() { },
        addEventListener() { },
        removeEventListener() { }
    };
    return el;
}
const logEl = fakeEl('log');
globalThis.document = {
    readyState: 'complete',
    body: { classList: { add() { }, remove() { }, contains() { return false; } }, appendChild() { } },
    head: { appendChild() { } },
    getElementById(id) { return id === 'log' ? logEl : null; },
    createElement() { return fakeEl(); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() { }
};
globalThis.window = { addEventListener() { }, updateBuffSlots() { }, setTimeout, clearTimeout, setInterval, clearInterval };
globalThis.localStorage = { getItem() { return null; }, setItem() { }, removeItem() { } };
globalThis.location = { search: '' };

const { GlobalStore, getPlayerContext } = await import('../infra/104-global-store.js');
const { STATE } = await import('../core/201-config-5v5-test.js');
const { FACT_TYPES } = await import('../infra/106-battle-enums.js');
const { startBattleRecording, feedBattleStep } = await import('../player/513-battle-export.js');
const rw = await import('../ui/727-rewind-core.js');

function check(name, cond, detail) {
    RESULT.push({ name, ok: !!cond, detail: detail || '' });
    console.log((cond ? '  ✓ ' : '  ✗ ') + name + (detail ? ' — ' + detail : ''));
}

// 伪造一局录制（两步空演出步：无时钟依赖，startPlay 可立即跑完）
// 账本哨兵必须是 schema 合法形状（107 会在 GlobalStore.set 时校验）：
//   日志条目 = 至少带 text 或 type 的对象；事实 = 已登记的 factType + data 对象。
const VALID_FACT = { factType: FACT_TYPES.ROUND_START, data: { round: 1 } };
startBattleRecording({ mode: 'probe' });
const mkStep = (log) => ({ log: log || [], events: [], ally: [], enemy: [], winner: null, done: false, doubleStrikeUid: null, stageActions: [], frozenValues: {} });
feedBattleStep(mkStep([]), []);
feedBattleStep(mkStep([]), []);

// ---------- 桩 store + 账本 ----------
const fakeStore = {
    _state: { units: [], round: 1 },
    dispatch(a) {
        if (a && a.type === 'SET_UNITS') this._state.units = a.units || [];
        if (a && a.type === 'SET_ROUND') this._state.round = a.round;
    },
    getState() { return this._state; },
    subscribe() { return () => { }; },
    setState(s) { this._state = Object.assign({}, this._state, s); }
};
const MARK_LOG = [{ text: '真账本-日志-哨兵' }];
const MARK_FACTS = [VALID_FACT];
GlobalStore.set('battleStore', fakeStore);
GlobalStore.set('gs', STATE.RUNNING);
GlobalStore.set('isPaused', true);
GlobalStore.set('speed', 300);
GlobalStore.set('activeBuffs', []);
GlobalStore.set('battleLog', MARK_LOG);
GlobalStore.set('battleFacts', MARK_FACTS);

// 记录所有 set 键，用于统计回看期间的记账写入
const setKeys = [];
const origSet = GlobalStore.set.bind(GlobalStore);
GlobalStore.set = function(k, v) { setKeys.push(k); return origSet(k, v); };

const c = getPlayerContext();
c._removedUids = new Set();
c._deathTimers = {};
c._lastLogType = null;

try {
    await rw.enterReview();
} catch (e) {
    check('enterReview 不抛异常', false, String(e && e.message || e));
}

// ① 快照隔离生效
const duringLog = GlobalStore.get('battleLog');
const duringFacts = GlobalStore.get('battleFacts');
check('回看期间 battleLog 换成临时数组（引用不等于真账本）', duringLog !== MARK_LOG);
check('回看期间 battleFacts 换成临时数组（引用不等于真账本）', duringFacts !== MARK_FACTS);
check('回看期间 isRewinding=true（静默态生效）', c.isRewinding === true);
const logWritesInEnter = setKeys.filter(k => k === 'battleLog').length;
check('进场只写一次 battleLog（快照清空）', logWritesInEnter === 1, '实际 ' + logWritesInEnter);

// ② 定位动作期间不得写真账本
const beforeNavLogLen = MARK_LOG.length, beforeNavFactsLen = MARK_FACTS.length;
setKeys.length = 0;
try { await rw.prevStep(); } catch (e) { check('prevStep 不抛异常', false, String(e && e.message || e)); }
try { await rw.nextStep(); } catch (e) { check('nextStep 不抛异常', false, String(e && e.message || e)); }
try { await rw.prevCue(); } catch (e) { check('prevCue 不抛异常', false, String(e && e.message || e)); }
try { await rw.nextCue(); } catch (e) { check('nextCue 不抛异常', false, String(e && e.message || e)); }
check('步进/段拨期间真账本数组内容不变', MARK_LOG.length === beforeNavLogLen && MARK_FACTS.length === beforeNavFactsLen, 'log ' + MARK_LOG.length + '/' + beforeNavLogLen + '，facts ' + MARK_FACTS.length + '/' + beforeNavFactsLen);
check('步进/段拨期间没有 set 真账本键', !setKeys.includes('battleLog') && !setKeys.includes('battleFacts'), setKeys.join(','));

// ②b 连续播放（504 真播通道会往「当前账本」push 渲染条目）：push 目标必须是临时账本。
//   探针不喂可渲染日志（渲染要等真实时钟，node 桩里会挂），改由静态规则 289 断言
//   504 的 push 源是 GlobalStore.get('battleLog') 的即时引用；此处只动态验「真账本零写入」。
setKeys.length = 0;
let playThrew = null;
try { await rw.startPlay(); } catch (e) { playThrew = String(e && e.message || e); }
check('连续播放不抛异常', !playThrew, playThrew || '');
check('连续播放期间 battleLog 仍是临时数组', GlobalStore.get('battleLog') !== MARK_LOG);
check('连续播放期间真账本内容不变', MARK_LOG.length === beforeNavLogLen && MARK_FACTS.length === beforeNavFactsLen, 'log ' + MARK_LOG.length + '，facts ' + MARK_FACTS.length);
check('连续播放期间没有 set 真账本键', !setKeys.includes('battleLog') && !setKeys.includes('battleFacts'), setKeys.join(','));

// ③ 重复进场幂等
let dupEnter = null;
try { dupEnter = await rw.enterReview(); } catch (e) { dupEnter = { ok: false, msg: String(e && e.message || e) }; }
check('重复进场返回 ok 且不重清账本', dupEnter && dupEnter.ok === true);

// ④ 退出还原（按引用）
rw.exitReview({ resume: false });
check('退出后 battleLog 按引用还原', GlobalStore.get('battleLog') === MARK_LOG);
check('退出后 battleFacts 按引用还原', GlobalStore.get('battleFacts') === MARK_FACTS);
check('退出后 isRewinding=false（恢复演出）', c.isRewinding === false);
check('退出后 getView 报非激活', rw.getView().active === false);

// ⑤ 重复退出不抛（防面板重复点 ✕）
let dupExitOk = true;
try { rw.exitReview({ resume: false }); } catch (e) { dupExitOk = false; }
check('重复退出不抛异常', dupExitOk);

// ⑥ 快进路径：进场 → fastForward（内部会自行退出）→ 账本必须还原
try {
    await rw.enterReview();
    await rw.fastForward();
} catch (e) {
    check('二次进场+快进不抛异常', false, String(e && e.message || e));
}
check('快进退出后 battleLog 按引用还原', GlobalStore.get('battleLog') === MARK_LOG);
check('快进退出后 battleFacts 按引用还原', GlobalStore.get('battleFacts') === MARK_FACTS);
check('快进退出后 isRewinding=false', c.isRewinding === false);

const bad = RESULT.filter(x => !x.ok);
if (bad.length) {
    console.log('RESULT: FAIL (' + bad.length + '/' + RESULT.length + ' 条断言失败)');
    process.exitCode = 1;
} else {
    console.log('RESULT: PASS (' + RESULT.length + ' 条断言全过)');
}
