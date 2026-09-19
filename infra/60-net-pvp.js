// infra/60-net-pvp.js - 联网对战·阶段1（WebRTC 点对点连接层）
// ~5700 bytes | V6.2.0 | 2026-09-19 阶段1：PeerJS 懒加载封装，建房/加入/状态回调；阶段2 才做 step 同步
export const VER = 'infra/60-net-pvp.js V6.2.0';

// 阶段1 只提供连接能力：建房生成房间号、加入连上对端、可收发普通消息。
// PeerJS 走 CDN 懒加载：只有点「创建/加入房间」才下载，单机玩法全程零网络请求。

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
let _dataCb = null;         // (msg) => void
let _suffix = '';
let _loadPromise = null;

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
        if (typeof _dataCb === 'function') { try { _dataCb(data); } catch (e) {} }
    });
    conn.on('error', (err) => setStatus(STATUS.ERROR, { msg: (err && err.message) || String(err) }));
    conn.on('close', () => { _conn = null; setStatus(STATUS.IDLE, { roomId: _roomId }); });
}

// 初始化（可带后缀，避免局域网多项目共存时 PeerJS id 撞车）
export function initNetPvp(onState, onData, suffix) {
    _stateCb = onState || null;
    _dataCb = onData || null;
    if (suffix) _suffix = suffix;
}

// 房主建房：成功回调 onReady(roomId)，hash 为强随机会话标识
export async function createRoom(onReady, onError) {
    setStatus(STATUS.CREATING);
    try {
        await ensurePeerJs();
    } catch (e) {
        setStatus(STATUS.ERROR, { msg: (e && e.message) || String(e) });
        if (typeof onError === 'function') onError(e);
        return;
    }
    const Peer = window.Peer;
    const hash = Math.random().toString(36).slice(2, 8);
    const id = 'gmd-' + hash + (_suffix ? ('-' + _suffix) : '');
    let p;
    try { p = new Peer(id); } catch (e) { if (typeof onError === 'function') onError(e); return; }
    _peer = p; _isHost = true; _roomId = id;
    p.on('open', () => {
        setStatus(STATUS.WAITING, { roomId: id, isHost: true });
        if (typeof onReady === 'function') onReady(id);
    });
    p.on('connection', (conn) => setupConn(conn));
    p.on('error', (err) => { setStatus(STATUS.ERROR, { msg: (err && err.message) || String(err) }); if (typeof onError === 'function') onError(err); });
}

// 从机加入：roomId 为房主公布 id
export async function joinRoom(roomId, onReady, onError) {
    const rid = String(roomId).trim();
    if (!rid) { if (typeof onError === 'function') onError(new Error('房间号为空')); return; }
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

// 出发送：持续连接下可用（阶段2 step 数据走这里）
export function netSend(msg) {
    if (_conn && _conn.open) {
        try { _conn.send(msg); return true; } catch (e) { return false; }
    }
    return false;
}

export function netStatus() { return _status; }
export function isNetHost() { return _isHost; }
export function currentRoomId() { return _roomId; }

// 断开/销毁
export function closeNetPvp() {
    try { if (_conn) _conn.close(); } catch (e) {}
    try { if (_peer) _peer.destroy(); } catch (e) {}
    _peer = null; _conn = null; _status = STATUS.IDLE; _roomId = null; _isHost = false;
}