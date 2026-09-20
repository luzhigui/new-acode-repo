// infra/60-net-pvp.js - 联网对战·中继版（公共 MQTT broker 转发 + step 同步 + 阵容/海克斯双向）
// ~18700 bytes | V7.4.0 | 2026-09-19 新增 sendPosUpdate：摆位实时同步（只搬位置，不动准备状态）；sendStart 捎带关卡号（从机补正关卡与左侧标签）；断线重连：建房/加入前 teardownTransport 拆干净旧客户端 + guestJoin 通知房主重发阵容
export const VER = 'infra/60-net-pvp.js V7.4.0';

// 为什么换掉 WebRTC：手机 5G 走运营商 CGNAT，和家用宽带 NAT 类型凑不上，打洞必失败；
// 兜底要 TURN，而 2026 年流传的公共 TURN 凭据全失效、免费服务商注册页在墙内提交不了（reCAPTCHA）。
// 改成两端都主动连公共 broker（出站 wss，不需要入站端口、不需要服务器），消息经 broker 转发。
// 单机玩法依然全程零网络请求：mqtt.js 与 broker 连接都只在点「创建/加入房间」时才发生。
//
// 注意：topic 直接就是房间号，公共 broker 上任何人订阅同一 topic 都能看到消息——房间号别用敏感信息。
// 阶段1 提供连接能力；阶段2 追加 step 同步（房主跑引擎发 step，从机只播演出）；
// 阶段3 追加阵容/站位/海克斯双向（房主权威，从机回传自己的选择）。

import { StateMachine } from './51-core-utils.js';

const MQTT_CDN = 'https://cdn.jsdelivr.net/npm/mqtt@5.10.1/dist/mqtt.min.js';
// EMQX 公共测试 broker（国内访问好、无需注册）。不保证长期可用；挂了可换该服务的其它节点或自建。
const BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
const TOPIC_PREFIX = 'gmd5v5/';
const HEARTBEAT_MS = 5000;        // 心跳间隔
const HEARTBEAT_TIMEOUT = 16000;  // 这么久没收到对端任何消息 → 判定掉线（替代 WebRTC 的 conn.on('close')）
const JOIN_TIMEOUT = 20000;       // 从机发 join 后等 accept 的上限（没人订阅这个房间就永远等不到）

const STATUS = {
    IDLE: 'idle',
    CREATING: 'creating',
    WAITING: 'waiting',     // 房主已建房，等对手加入
    JOINING: 'joining',     // 从机正在连房主
    CONNECTED: 'connected',
    ERROR: 'error'
};

let _client = null;         // 本端 MQTT 客户端
let _rxTopic = null;        // 本端订阅（收对端消息）
let _txTopic = null;        // 本端发布（发给对端）
let _roomId = null;         // 房主：本端房间号；从机：加入的房间号
let _isHost = false;
let _status = STATUS.IDLE;
let _stateCb = null;        // (status, meta) => void
let _dataCb = null;         // (msg) => void  只收非 step 消息（step 由本模块内部消化）
let _onReady = null;        // 从机：收到 accept 后回调（连上才算 ready，不是发出 join 就算）
let _loadPromise = null;
let _stepQueue = [];        // 从机：已收到待播放的 step
let _stepWaiter = null;     // 从机：playBattleGuest 正等着下一个 step
let _msgWaiters = new Map();// 房主：等待从机回传（lineupReady / buffPick），type -> resolve
let _hbTimer = null;
let _lastRx = 0;
let _joinTimer = null;

function hostTopic(room) { return TOPIC_PREFIX + room + '/h2g'; }
function guestTopic(room) { return TOPIC_PREFIX + room + '/g2h'; }

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

// buff 数组净化：cols/rows 是数组，浅拷贝一份避免共享引用
function plainBuffs(buffs) {
    return (buffs || []).map(b => ({
        ...b,
        ...(b.cols ? { cols: [...b.cols] } : {}),
        ...(b.rows ? { rows: [...b.rows] } : {})
    }));
}

function plainStep(step, activeBuffs, speed, ff) {
    return {
        log: step.log || [],
        events: step.events || [],
        ally: (step.ally || []).map(plainUnit),
        enemy: (step.enemy || []).map(plainUnit),
        winner: step.winner || null,
        done: !!step.done,
        doubleStrikeUid: step.doubleStrikeUid || null,
        stageActions: step.stageActions || [],
        // 阶段3：从机不跑引擎，buff 槽要靠房主捎带才能显示
        activeBuffs: plainBuffs(activeBuffs),
        // 方案A：捎带房主当前倍速，从机跟随，避免从机比房主快导致 step 积压
        speed: speed || null,
        // 快进状态也必须捎带：房主点「快进到底」只改本地时钟，不告诉从机的话
        // 房主 12x 冲到底、从机还按 1x 慢慢播，房主都开下一局了从机还在打
        ff: !!ff
    };
}

function reviveUnit(u) {
    const o = { ...u };
    if (o._fsm) o._fsm = new StateMachine({}, o._fsm.current, null);
    return o;
}

function reviveStep(raw) {
    return { ...raw, ally: (raw.ally || []).map(reviveUnit), enemy: (raw.enemy || []).map(reviveUnit) };
}

// 房主下发阵容：两队单位净化后传输，从机复原成普通对象（摆位阶段只读 pos/渲染，不需要方法）
export function plainLineup(stage, allyTeam, enemyTeam) {
    return { stage, ally: (allyTeam || []).map(plainUnit), enemy: (enemyTeam || []).map(plainUnit) };
}

export function reviveLineup(raw) {
    return { stage: raw.stage || 1, ally: (raw.ally || []).map(reviveUnit), enemy: (raw.enemy || []).map(reviveUnit) };
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

// 断线时唤醒全部回传等待者（返回 null），避免房主卡在「等从机准备/选 buff」
function failPendingMsg() {
    for (const w of _msgWaiters.values()) { try { w(null); } catch (e) {} }
    _msgWaiters.clear();
}

// 拆掉旧连接与旧定时器。建房/加入前必须先调：不然重连时旧客户端还订阅着同一个 topic，
// 同一条消息会被处理两遍（旧客户端的 message 回调也指向同一个 onMessage）。
function teardownTransport() {
    stopHeartbeat();
    if (_joinTimer) { clearTimeout(_joinTimer); _joinTimer = null; }
    if (_client) {
        try { _client.removeAllListeners && _client.removeAllListeners(); } catch (e) {}
        try { _client.end(true); } catch (e) {}
        _client = null;
    }
    failPendingStep();
    failPendingMsg();
}

function setStatus(s, meta) {
    _status = s;
    if (typeof _stateCb === 'function') {
        try { _stateCb(s, meta || {}); } catch (e) {}
    }
}

// 懒加载 mqtt.js（只下载一次，之后复用同一 Promise）
function ensureMqtt() {
    if (window.mqtt) return Promise.resolve();
    if (_loadPromise) return _loadPromise;
    _loadPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = MQTT_CDN;
        s.onload = () => (window.mqtt ? resolve() : reject(new Error('mqtt.js 加载后未挂载')));
        s.onerror = () => { _loadPromise = null; reject(new Error('mqtt.js 下载失败，请检查网络')); };
        document.head.appendChild(s);
    });
    return _loadPromise;
}

function publish(msg) {
    if (!_client || !_client.connected) return false;
    try { _client.publish(_txTopic, JSON.stringify(msg), { qos: 0 }); return true; } catch (e) { return false; }
}

// 心跳：替代 WebRTC 的 conn.on('close')。broker 断了或对端没了，靠这里在 16 秒内收敛成 IDLE，
// 否则 recvStep / waitForMsg 会永久挂住，玩家只能刷新页面。
function startHeartbeat() {
    stopHeartbeat();
    _lastRx = Date.now();
    _hbTimer = setInterval(() => {
        if (Date.now() - _lastRx > HEARTBEAT_TIMEOUT) { onPeerLost(); return; }
        if (_client && _client.connected) publish({ t: 'ping' });
    }, HEARTBEAT_MS);
}

function stopHeartbeat() { if (_hbTimer) { clearInterval(_hbTimer); _hbTimer = null; } }

function onPeerLost() {
    stopHeartbeat();
    failPendingStep();
    failPendingMsg();
    setStatus(STATUS.IDLE, { roomId: _roomId });
}

function onMessage(topic, payload) {
    _lastRx = Date.now();
    let data = null;
    try { data = JSON.parse(payload.toString()); } catch (e) { return; }
    if (!data || typeof data.t !== 'string') return;
    if (data.t === 'ping') return;
    if (data.t === 'join') { onGuestJoin(); return; }
    if (data.t === 'accept') { onAccepted(); return; }
    if (data.t === 'step') { pushStep(reviveStep(data.step)); return; }
    // 阶段3：房主正在等这类回传 → 直接交给等待者，不再走 _dataCb（避免重复处理）
    const waiter = _msgWaiters.get(data.t);
    if (waiter) { _msgWaiters.delete(data.t); waiter(data); return; }
    if (typeof _dataCb === 'function') {
        // 不能静默吞：2026-09-19 房主 lineupReady 写 frozen snapshot 抛错被吞，查了很久才定位
        try { _dataCb(data); } catch (e) { console.error('[net] 消息处理异常 t=' + data.t, e); }
    }
}

// 房主：有对手进了房间
function onGuestJoin() {
    if (!_isHost) return;
    const wasConnected = _status === STATUS.CONNECTED;
    // 2026-09-20 修「从机首屏六大派在上方、点一下才翻下来」：setStatus 是同步的，一进 connected
    // 就会当场把 lineup 发给从机。原先 accept 排在 setStatus 后面 → 从机先收到阵容、后收到身份，
    // applyNetLineup 渲染时 netRole 还是 null，按房主视角画（六大派在上方）；要等玩家点格子
    // 触发下一次 renderGrid 才翻正。accept 先上线，身份先落地，渲染自然是对的。
    publish({ t: 'accept', roomId: _roomId });
    if (!wasConnected) setStatus(STATUS.CONNECTED, { roomId: _roomId, isHost: true });
    startHeartbeat();
    // 首次加入靠上面的 setStatus 触发上层；重连时状态本来就是 CONNECTED、不会回调，这里补一次
    if (wasConnected && typeof _dataCb === 'function') {
        try { _dataCb({ t: 'guestJoin' }); } catch (e) { console.error('[net] guestJoin 处理异常', e); }
    }
}

// 从机：房主已应答
function onAccepted() {
    if (_isHost) return;
    if (_joinTimer) { clearTimeout(_joinTimer); _joinTimer = null; }
    if (_status !== STATUS.CONNECTED) setStatus(STATUS.CONNECTED, { roomId: _roomId, isHost: false });
    startHeartbeat();
    if (typeof _onReady === 'function') { const f = _onReady; _onReady = null; f(); }
}

// 初始化：注册状态回调与数据回调
export function initNetPvp(onState, onData) {
    _stateCb = onState || null;
    _dataCb = onData || null;
}

// 房间号字符规则：broker topic 只接受安全字符，统一小写去杂
function normalizeRoomId(raw) {
    return String(raw == null ? '' : raw).trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
}

// 房主建房：onReady(roomId)；customId 为空则自动生成 6 位随机号
export async function createRoom(onReady, onError, customId) {
    teardownTransport();
    setStatus(STATUS.CREATING);
    try {
        await ensureMqtt();
    } catch (e) {
        setStatus(STATUS.ERROR, { msg: (e && e.message) || String(e) });
        if (typeof onError === 'function') onError(e);
        return;
    }
    let id;
    const raw = customId == null ? '' : String(customId).trim();
    if (raw) {
        id = normalizeRoomId(raw);
        if (!id) {
            const e = new Error('房间号只能用字母、数字或短横线');
            setStatus(STATUS.ERROR, { msg: e.message });
            if (typeof onError === 'function') onError(e);
            return;
        }
    } else {
        id = Math.random().toString(36).slice(2, 8);
    }
    _isHost = true; _roomId = id;
    _rxTopic = guestTopic(id); _txTopic = hostTopic(id);
    const clientId = 'gmd_h_' + id + '_' + Math.random().toString(16).slice(2, 8);
    let c;
    try {
        c = window.mqtt.connect(BROKER_URL, { clientId, clean: true, reconnectPeriod: 3000, connectTimeout: 20000 });
    } catch (e) {
        setStatus(STATUS.ERROR, { msg: (e && e.message) || String(e) });
        if (typeof onError === 'function') onError(e);
        return;
    }
    _client = c;
    c.on('connect', () => {
        c.subscribe(_rxTopic, { qos: 0 }, (err) => {
            if (err) {
                setStatus(STATUS.ERROR, { msg: '订阅房间频道失败' });
                if (typeof onError === 'function') onError(err);
                return;
            }
            setStatus(STATUS.WAITING, { roomId: id, isHost: true });
            if (typeof onReady === 'function') onReady(id);
        });
    });
    c.on('message', onMessage);
    c.on('error', (err) => {
        setStatus(STATUS.ERROR, { msg: (err && err.message) || String(err) });
        if (typeof onError === 'function') onError(err);
    });
}

// 从机加入：roomId 直接用用户填的内容（与建房同一套字符规则）
// 断线后可以再调一次重连：teardownTransport 先把旧客户端拆干净，不会重复订阅
export async function joinRoom(roomId, onReady, onError) {
    const rid = normalizeRoomId(roomId);
    if (!rid) { if (typeof onError === 'function') onError(new Error('房间号只能用字母、数字或短横线')); return; }
    teardownTransport();
    setStatus(STATUS.JOINING);
    try {
        await ensureMqtt();
    } catch (e) {
        setStatus(STATUS.ERROR, { msg: (e && e.message) || String(e) });
        if (typeof onError === 'function') onError(e);
        return;
    }
    _isHost = false; _roomId = rid; _onReady = typeof onReady === 'function' ? onReady : null;
    _rxTopic = hostTopic(rid); _txTopic = guestTopic(rid);
    const clientId = 'gmd_g_' + Math.random().toString(16).slice(2, 10);
    let c;
    try {
        c = window.mqtt.connect(BROKER_URL, { clientId, clean: true, reconnectPeriod: 3000, connectTimeout: 20000 });
    } catch (e) {
        setStatus(STATUS.ERROR, { msg: (e && e.message) || String(e) });
        if (typeof onError === 'function') onError(e);
        return;
    }
    _client = c;
    c.on('connect', () => {
        c.subscribe(_rxTopic, { qos: 0 }, (err) => {
            if (err) {
                setStatus(STATUS.ERROR, { msg: '订阅房间频道失败' });
                if (typeof onError === 'function') onError(err);
                return;
            }
            publish({ t: 'join' });
        });
    });
    c.on('message', onMessage);
    c.on('error', (err) => {
        setStatus(STATUS.ERROR, { msg: (err && err.message) || String(err) });
        if (typeof onError === 'function') onError(err);
    });
    // 公共 broker 上没人订阅这个房间就永远收不到 accept，必须超时兜底
    _joinTimer = setTimeout(() => {
        if (_status === STATUS.CONNECTED) return;
        setStatus(STATUS.ERROR, { msg: '没找到这个房间（房主没建，或房间号不对）' });
        if (typeof onError === 'function') onError(new Error('没找到这个房间'));
    }, JOIN_TIMEOUT);
}

// 出发送：持续连接下可用
export function netSend(msg) { return publish(msg); }

// ---- 阶段2 对外 API ----
// 房主：开战时通知从机进入战斗；捎带当前关卡号（从机不跑 doInitBattle，靠它补正关卡与左侧标签）
export function sendStart(stage) { return netSend({ t: 'start', stage: stage || null }); }
// 房主：发一步（净化后传输；activeBuffs 捎带，供从机 buff 槽显示；ff 捎带快进状态）
export function sendStep(step, activeBuffs, speed, ff) { return netSend({ t: 'step', step: plainStep(step, activeBuffs, speed, ff) }); }
// 从机：取下一步（无则挂起等，断线返回 null）
export function recvStep() {
    if (_stepQueue.length) return Promise.resolve(_stepQueue.shift());
    return new Promise((resolve) => { _stepWaiter = resolve; });
}
// 换关时清掉残留 step：不清的话上一局的 step 会被下一局的从机主循环接着播，画面直接串台
export function clearSteps() { failPendingStep(); }

// ---- 阶段3 对外 API ----
// 房主 → 从机：下发双方阵容（从机据此进摆位态，只摆六大派）
export function sendLineup(stage, allyTeam, enemyTeam) {
    return netSend({ t: 'lineup', lineup: plainLineup(stage, allyTeam, enemyTeam) });
}
// 从机 → 房主：回传六大派站位（[{uid, pos}]），房主据此合并进自己的 UI.enemyTeam
export function sendLineupReady(positions) { return netSend({ t: 'lineupReady', positions: positions || [] }); }
// 摆位实时同步（与 lineupReady 是两回事，别合并）：
//   lineupReady = 「我摆完了，你可以开战」的握手，会改 netPeerReady/netGuestReady
//   posUpdate   = 纯画面同步，只搬位置，不动任何准备状态
// 房主挪明教 → camp=ALLY 发给从机；从机挪六大派 → camp=ENEMY 发给房主。
// 不发的话：房主摆位态挪人从机看不到（要等开战第一条 step 才跳正），从机「准备」后再挪人房主拿到的是旧站位
export function sendPosUpdate(camp, positions) { return netSend({ t: 'posUpdate', camp, positions: positions || [] }); }
// 房主 → 从机：下发六大派海克斯选项（选项由房主用引擎 RNG 统一生成，双方看到同一批）
export function sendBuffAsk(choices, duration) { return netSend({ t: 'buffAsk', choices: choices || [], duration: duration || 0 }); }
// 从机 → 房主：回传自己选中的 buff key（null = 不选）
export function sendBuffPick(key) { return netSend({ t: 'buffPick', key: key || null }); }
// 从机 → 房主：本局演出播完了。房主靠它解锁「▶ 下一关」——不等回执就换关会把从机中途打断
export function sendGuestDone() { return netSend({ t: 'guestDone' }); }

// 房主：等从机回传某类消息（lineupReady / buffPick）。断线或超时返回 null，避免卡死
export function waitForMsg(type, timeoutMs = 120000) {
    return new Promise((resolve) => {
        const done = (msg) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
            if (_msgWaiters.get(type) === done) { _msgWaiters.delete(type); resolve(null); }
        }, timeoutMs);
        _msgWaiters.set(type, done);
    });
}

// 是否已连上对端
export function isConnected() { return _status === STATUS.CONNECTED && !!(_client && _client.connected); }

export function netStatus() { return _status; }
export function isNetHost() { return _isHost; }
export function currentRoomId() { return _roomId; }

// 断开/销毁
export function closeNetPvp() {
    teardownTransport();
    _rxTopic = null; _txTopic = null;
    _status = STATUS.IDLE; _roomId = null; _isHost = false; _onReady = null;
}
