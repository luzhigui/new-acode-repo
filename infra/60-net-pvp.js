// infra/60-net-pvp.js - 联网对战·阶段2（WebRTC 点对点连接层 + step 同步）
// ~9000 bytes | V6.3.0 | 2026-09-19 阶段2：step 净化/复原 + 收发队列（房主发一步、从机播一步）
export const VER = 'infra/60-net-pvp.js V6.3.0';

// 阶段1 提供连接能力；阶段2 追加 step 同步（房主跑引擎发 step，从机只播演出）。
// PeerJS 走 CDN 懒加载：只有点「创建/加入房间」才下载，单机玩法全程零网络请求。

import { StateMachine } from './51-core-utils.js';

const PEERJS_CDN = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';

const STATUS = {
    IDLE: 'idle',
    CREATING: 'creating',
    WAITING: 'waiting',     // 房主已建房，等对手加入
    JOINING: 'joining',     // 从机正在连房主
    CONNECTED: 'connected',
    ERROR: 'error'
};

let _peer = null;           // 本端 Peer 实例
let _conn = null;           // 与对端的 DataConnection
let _roomId = null;         // 房主：本端的 id；从机：加入的房间号
let _isHost = false;
let _status = STATUS.IDLE;
let _stateCb = null;        // (status, meta) => void
let _dataCb = null;         // (msg) => void  只收非 step 消息（step 由本模块内部消化）
let _loadPromise = null;
let _stepQueue = [];        // 从机：已收到待播放的 step
let _stepWaiter = null;     // 从机：playBattleGuest 正等着下一个 step

// ---- step 净化 / 复原 ----
// step 里的单位是引擎 Unit 实例，直接 JSON 会炸：
//   ① 团队数组 A/B 上挂着 _pendingStateTransitions，其元素持有整队引用 → 循环引用
//   ② 单位上的 _fsm 是 StateMachine 实例，states 里是 onEnter/onExit 函数，序列化不了
// 但渲染层（render/32-grid-render.js）要读 unit._fsm.is('attached'|'flying')，不能直接丢，
// 所以只传 current，从机用空 states 重建一个壳，够 is() 用（从机不跑 transition）。
function plainUnit(u) {
    const o = { ...u };
    if (o._fsm) o._fsm = { current: o._fsm.current };
    return o;
}

function plainStep(step) {
    return {
        log: step.log || [],
        events: step.events || [],
        ally: (step.ally || []).map(plainUnit),
        enemy: (step.enemy || []).map(plainUnit),
        winner: step.winner || null,
        done: !!step.done,
        doubleStrikeUid: step.doubleStrikeUid || null,
        stageActions: step.stageActions || []
    };
}

function reviveStep(raw) {
    const reviveUnit = (u) => {
        const o = { ...u };
        if (o._fsm) o._fsm = new StateMachine({}, o._fsm.current, null);
        return o;
    };
    return { ...raw, ally: (raw.ally || []).map(reviveUnit), enemy: (raw.enemy || []).map(reviveUnit) };
}

function pushStep(step) {
    if (_stepWaiter) { const w = _stepWaiter; _stepWaiter = null; w(step); }
    else _stepQueue.push(step);
}

// 断线时唤醒等待者（返回 null），避免从机主循环永久挂住
function failPendingStep() {
    if (_stepWaiter) { const w = _stepWaiter; _stepWaiter = null; w(null); }
    _stepQueue = [];
}

function setStatus(s, meta) {
    _status = s;
    if (typeof _stateCb === 'function') {
        try { _stateCb(s, meta || {}); } catch (e) {}
    }
}

// 懒加载 PeerJS（只下载一次，之后复用同一 Promise）
function ensurePeerJs() {
    if (window.Peer) return Promise.resolve();
    if (_loadPromise) return _loadPromise;
    _loadPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = PEERJS_CDN;
        s.onload = () => (window.Peer ? resolve() : reject(new Error('PeerJS 加载后未挂载')));
        s.onerror = () => { _loadPromise = null; reject(new Error('PeerJS 下载失败，请检查网络')); };
        document.head.appendChild(s);
    });
    return _loadPromise;
}

function setupConn(conn) {
    _conn = conn;
    conn.on('open', () => {
        setStatus(STATUS.CONNECTED, { roomId: _roomId, isHost: _isHost });
        // 握手：把自己身份告知对端
        try { conn.send({ t: 'hello', from: _isHost ? 'host' : 'guest', roomId: _roomId }); } catch (e) {}
    });
    conn.on('data', (data) => {
        if (data && data.t === 'step') { pushStep(reviveStep(data.step)); return; }
        if (typeof _dataCb === 'function') { try { _dataCb(data); } catch (e) {} }
    });
    conn.on('error', (err) => { failPendingStep(); setStatus(STATUS.ERROR, { msg: (err && err.message) || String(err) }); });
    conn.on('close', () => { _conn = null; failPendingStep(); setStatus(STATUS.IDLE, { roomId: _roomId }); });
}

// 初始化：注册状态回调与数据回调
export function initNetPvp(onState, onData) {
    _stateCb = onState || null;
    _dataCb = onData || null;
}


// 房主建房：onReady(roomId)；customId 为空则自动生成 6 位随机号
// 房间号不做额外前缀，直接用用户填的内容（PeerJS 仅允许小写字母/数字/短横线）
export async function createRoom(onReady, onError, customId) {
    setStatus(STATUS.CREATING);
    try {
        await ensurePeerJs();
    } catch (e) {
        setStatus(STATUS.ERROR, { msg: (e && e.message) || String(e) });
        if (typeof onError === 'function') onError(e);
        return;
    }
    const Peer = window.Peer;
    let id;
    const raw = customId == null ? '' : String(customId).trim();
    if (raw) {
        const clean = raw.toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (!clean) {
            const e = new Error('房间号只能用字母、数字或短横线');
            setStatus(STATUS.ERROR, { msg: e.message });
            if (typeof onError === 'function') onError(e);
            return;
        }
        id = clean;
    } else {
        id = Math.random().toString(36).slice(2, 8);
    }
    let p;
    try { p = new Peer(id); } catch (e) { if (typeof onError === 'function') onError(e); return; }
    _peer = p; _isHost = true; _roomId = id;
    p.on('open', () => {
        setStatus(STATUS.WAITING, { roomId: id, isHost: true });
        if (typeof onReady === 'function') onReady(id);
    });
    p.on('connection', (conn) => setupConn(conn));
    p.on('error', (err) => {
        const isTaken = err && (err.type === 'unavailable-id' || /taken|unavailable/i.test((err.message || '')));
        const msg = isTaken ? '该房间号已被占用，换一个试试' : ((err && err.message) || String(err));
        setStatus(STATUS.ERROR, { msg });
        if (typeof onError === 'function') onError(err);
    });
}

// 从机加入：roomId 直接用用户填的内容（与建房同一套字符规则）
export async function joinRoom(roomId, onReady, onError) {
    const rid = String(roomId).trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!rid) { if (typeof onError === 'function') onError(new Error('房间号只能用字母、数字或短横线')); return; }
    setStatus(STATUS.JOINING);
    try {
        await ensurePeerJs();
    } catch (e) {
        setStatus(STATUS.ERROR, { msg: (e && e.message) || String(e) });
        if (typeof onError === 'function') onError(e);
        return;
    }
    const Peer = window.Peer;
    let p;
    try { p = new Peer(); } catch (e) { if (typeof onError === 'function') onError(e); return; }
    _peer = p; _isHost = false; _roomId = rid;
    p.on('open', () => {
        try {
            const conn = p.connect(rid, { reliable: true });
            _conn = conn;
            setupConn(conn);
        } catch (e) {
            setStatus(STATUS.ERROR, { msg: '连接到房主失败' });
            if (typeof onError === 'function') onError(e);
        }
    });
    p.on('error', (err) => { setStatus(STATUS.ERROR, { msg: (err && err.message) || String(err) }); if (typeof onError === 'function') onError(err); });
}

// 出发送：持续连接下可用
export function netSend(msg) {
    if (_conn && _conn.open) {
        try { _conn.send(msg); return true; } catch (e) { return false; }
    }
    return false;
}

// ---- 阶段2 对外 API ----
// 房主：开战时通知从机进入战斗
export function sendStart() { return netSend({ t: 'start' }); }
// 房主：发一步（净化后传输）
export function sendStep(step) { return netSend({ t: 'step', step: plainStep(step) }); }
// 从机：取下一步（无则挂起等，断线返回 null）
export function recvStep() {
    if (_stepQueue.length) return Promise.resolve(_stepQueue.shift());
    return new Promise((resolve) => { _stepWaiter = resolve; });
}
// 是否已连上对端
export function isConnected() { return _status === STATUS.CONNECTED && !!(_conn && _conn.open); }

export function netStatus() { return _status; }
export function isNetHost() { return _isHost; }
export function currentRoomId() { return _roomId; }

// 断开/销毁
export function closeNetPvp() {
    try { if (_conn) _conn.close(); } catch (e) {}
    try { if (_peer) _peer.destroy(); } catch (e) {}
    _peer = null; _conn = null; _status = STATUS.IDLE; _roomId = null; _isHost = false;
    failPendingStep();
}