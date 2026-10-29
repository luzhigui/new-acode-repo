// infra/60-net-pvp.js - 联网对战·中继版（公共 MQTT broker 转发 + step 同步 + 阵容/海克斯双向）
// V7.4.3 | 2026-10-29 | ~20300 bytes
//   从机 step 队列加防积压：积压超 MAX_STEP_BACKLOG(5) 条就清空旧账只播最新，修「从机越打越落后、
//   和房主差好几回合」；step 自带全量阵容快照，跳过中间演出不影响画面状态。
// V7.4.2 | 2026-10-29 | ~20200 bytes
//   联机 mqtt.js 改「本地 vendor 优先 + 远端兜底」：cdn.jsdelivr.net 国内多地实测直连失败（000），
//   原单源写法一点「创建房间」就报「下载失败」；现在读 ./vendor/mqtt-5.10.1.min.js（随仓库分发，零网络依赖），
//   仅当本地缺失时才依次尝试 npmmirror / fastly.jsdelivr / unpkg。
export const VER = 'infra/60-net-pvp.js V7.4.3';

// 为什么换掉 WebRTC：手机 5G 走运营商 CGNAT，和家用宽带 NAT 类型凑不上，打洞必失败；
// 兜底要 TURN，而 2026 年流传的公共 TURN 凭据全失效、免费服务商注册页在墙内提交不了（reCAPTCHA）。
// 改成两端都主动连公共 broker（出站 wss，不需要入站端口、不需要服务器），消息经 broker 转发。
// 单机玩法依然全程零网络请求：mqtt.js 与 broker 连接都只在点「创建/加入房间」时才发生。
//
// 注意：topic 直接就是房间号，公共 broker 上任何人订阅同一 topic 都能看到消息——房间号别用敏感信息。
// 阶段1 提供连接能力；阶段2 追加 step 同步（房主跑引擎发 step，从机只播演出）；
// 阶段3 追加阵容/站位/海克斯双向（房主权威，从机回传自己的选择）。

// mqtt.js 加载源：本地 vendor 优先（已随仓库分发，零网络依赖），
// 远端仅作兜底——cdn.jsdelivr.net 在国内多地实测直接失败（000），故不再作为首选。
const MQTT_LOCAL = './vendor/mqtt-5.10.1.min.js';
const MQTT_CDN_FALLBACK = [
    'https://registry.npmmirror.com/mqtt/5.10.1/files/dist/mqtt.min.js',
    'https://fastly.jsdelivr.net/npm/mqtt@5.10.1/dist/mqtt.min.js',
    'https://unpkg.com/mqtt@5.10.1/dist/mqtt.min.js'
];
// EMQX 公共测试 broker（国内访问好、无需注册）。不保证长期可用；挂了可换该服务的其它节点或自建。
const BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
const TOPIC_PREFIX = 'gmd5v5/';
const HEARTBEAT_MS = 5000;        // 心跳间隔
const HEARTBEAT_TIMEOUT = 16000;  // 这么久没收到对端任何消息 → 判定掉线（替代 WebRTC 的 conn.on('close')）
const JOIN_TIMEOUT = 20000;       // 从机发 join 后等 accept 的上限（没人订阅这个房间就永远等不到）
// 从机 step 积压上限：超过就丢旧账只播最新（step 自带 ally/enemy 全量快照，状态不丢，只跳过中间演出）。
//   房主按「每步发一条」的速度推，从机演出慢一点就会无限滞后再也追不上——卡死队列长度是唯一的止血点。
const MAX_STEP_BACKLOG = 5;

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
// _fsm 侧不再需要复原：渲染层已改读 state._fsmPhase，
// 从机不跑 transition，单位浅拷贝即可。
//
// ⚠️ 与 player/50battle-export.js 的 plainStep 是**两份、职责不同**，不是重复实现，不要合并：
//   · 本文件（联机从机）：浅拷 + 下一步整份覆盖，不需要深拷 state。
//   · player/50（战报导出）：state 必须按 core/17 schema 深拷（copyAllStateFields）断引用，
//     否则引擎原地改 state 会让整份战报读到终态 → 回放全程全灰。
//   为什么不能合并：infra 不能反向依赖 core/17 的 schema（业务依赖），player→infra 单向合法。


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
        ally: step.ally || [],
        enemy: step.enemy || [],
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

function reviveStep(raw) {
    return { ...raw, ally: (raw.ally || []).map(u => ({ ...u })), enemy: (raw.enemy || []).map(u => ({ ...u })) };
}

// 房主下发阵容：两队单位净化后传输，从机复原成普通对象（摆位阶段只读 pos/渲染，不需要方法）
export function plainLineup(stage, allyTeam, enemyTeam) {
    return { stage, ally: allyTeam || [], enemy: enemyTeam || [] };
}

export function reviveLineup(raw) {
    return { stage: raw.stage || 1, ally: (raw.ally || []).map(u => ({ ...u })), enemy: (raw.enemy || []).map(u => ({ ...u })) };
}

function pushStep(step) {
    if (_stepWaiter) { const w = _stepWaiter; _stepWaiter = null; w(step); return; }
    // 防积压：从机播放慢于房主时队列会无限增长，从机永远停在过去的回合。
    //   超过上限直接清空旧账，只播最新一条，强行把进度对齐到现在。
    if (_stepQueue.length > MAX_STEP_BACKLOG) _stepQueue = [];
    _stepQueue.push(step);
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

// 懒加载 mqtt.js（只加载一次，之后复用同一 Promise）
// 按 sources 顺序逐个尝试：本地 vendor 命中即用；缺失或加载报错才落到远端兜底。
function ensureMqtt() {
    if (window.mqtt) return Promise.resolve();
    if (_loadPromise) return _loadPromise;
    const sources = [MQTT_LOCAL, ...MQTT_CDN_FALLBACK];
    const loadAt = (i) => new Promise((resolve, reject) => {
        if (i >= sources.length) {
            reject(new Error('mqtt.js 加载失败：本地 vendor 与 ' + MQTT_CDN_FALLBACK.length + ' 个 CDN 源均不可用'));
            return;
        }
        const s = document.createElement('script');
        s.src = sources[i];
        s.onload = () => {
            if (window.mqtt) { resolve(); return; }
            s.remove();
            loadAt(i + 1).then(resolve, reject);
        };
        s.onerror = () => { s.remove(); loadAt(i + 1).then(resolve, reject); };
        document.head.appendChild(s);
    });
    // 全源失败时清掉缓存，允许玩家再点一次重试
    _loadPromise = loadAt(0).catch((e) => { _loadPromise = null; throw e; });
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
        // 不能静默吞：房主 lineupReady 写 frozen snapshot 抛错被吞，查了很久才定位
        try { _dataCb(data); } catch (e) { console.error('[net] 消息处理异常 t=' + data.t, e); }
    }
}

// 房主：有对手进了房间
function onGuestJoin() {
    if (!_isHost) return;
    const wasConnected = _status === STATUS.CONNECTED;
    // accept 必须先于 setStatus 发送：身份（netRole）先落地，applyNetLineup 渲染才按从机视角画，
    // 否则先收到阵容时 netRole 还是 null，会按房主视角画反。
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
