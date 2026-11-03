// V6.3.0 | 2026-10-25 | BGM 收口三件：①play() 被自动播放策略拒后挂一次性手势重试（pointerdown/keydown/touchstart）；
//   ②恢复响度归一（用户音量 × 每曲 trim，trim 由 measureTrims() 一次性按 RMS 0.07 量出写 localStorage）；
//   ③setVolume/fadeTo 统一走 _applyVolume，淡入淡出加 token 防交叠
export const VER = 'modules/304-audio-manager.js V6.3.0';

import { CONFIG } from '../core/201-config-5v5-test.js';

import { ROLE_TYPES } from '../infra/106-battle-enums.js';

let audioCtx = null;
function getAudioCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

// 预加载的音效缓冲区
const sfxBuffers = {};

// BGM 播放：改用 HTMLAudioElement。
//   旧方案 fetch + decodeAudioData 每次页面加载都要把整首 mp3 解成 PCM，手机上是几秒到十几秒的静音；
//   改用 <audio> 后由浏览器 HTTP/媒体缓存接管，刷新后几乎立刻有声。
let _bgmAudio = null;
let _bgmGen = 0;

// 一次性手势重试：浏览器禁止无用户手势的 play()，被拒后不重试就是永久静音。
//   失败时挂 pointerdown/keydown/touchstart（capture，一次性），首次交互再试一次。
let _gestureArmed = false;
function _armGestureRetry() {
    if (_gestureArmed || typeof document === 'undefined') return;
    _gestureArmed = true;
    const fire = () => {
        _gestureArmed = false;
        document.removeEventListener('pointerdown', fire, true);
        document.removeEventListener('keydown', fire, true);
        document.removeEventListener('touchstart', fire, true);
        if (!_bgmAudio) return;
        try {
            const p = _bgmAudio.play();
            if (p && p.catch) p.catch(() => {});
        } catch (e) {}
    };
    document.addEventListener('pointerdown', fire, true);
    document.addEventListener('keydown', fire, true);
    document.addEventListener('touchstart', fire, true);
}

// 预加载所有 mp3 音效文件到内存
async function loadSfxBuffer(key, url) {
    try {
        const ctx = getAudioCtx();
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        sfxBuffers[key] = audioBuffer;
    } catch (e) {
        console.warn('音效加载失败:', url, e);
    }
}

// 初始化：预加载所有 mp3 音效
export async function initSfx() {
    const sfxConfig = CONFIG.SFX || {};
    const promises = [];
    for (const [role, path] of Object.entries(sfxConfig)) {
        promises.push(loadSfxBuffer(role, path));
    }
    await Promise.all(promises);
}

// 播放已预加载的 mp3 音效（应用独立音量）
function playBufferSfx(key, volume) {
    const buffer = sfxBuffers[key];
    if (!buffer) return;
    try {
        const ctx = getAudioCtx();
        const source = ctx.createBufferSource();
        source.buffer = buffer;

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(volume, ctx.currentTime);

        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        source.start();
    } catch (e) {
        // 播放失败不影响游戏
    }
}

// 狮吼合成音效：双锯齿低吼滑落 + 颤音 LFO + 气息噪声，低通收尾（无 mp3 素材，走合成路线）
function playLionRoar(volume = 0.3) {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    const dur = 1.15;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(volume, now + 0.08);
    master.gain.setValueAtTime(volume, now + 0.5);
    master.gain.exponentialRampToValueAtTime(0.001, now + dur);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, now);
    lp.frequency.exponentialRampToValueAtTime(250, now + dur - 0.1);

    lp.connect(master);
    master.connect(ctx.destination);

    // 颤音 LFO：吼声的"抖"
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 12;
    lfo.connect(lfoGain);

    for (const [f0, g] of [[95, 0.5], [143, 0.25]]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f0 * 1.3, now);
        osc.frequency.exponentialRampToValueAtTime(f0 * 0.62, now + 0.9);
        lfoGain.connect(osc.frequency);
        const gain = ctx.createGain();
        gain.gain.value = g;
        osc.connect(gain);
        gain.connect(lp);
        osc.start(now);
        osc.stop(now + dur);
    }
    lfo.start(now);
    lfo.stop(now + dur);

    // 气息噪声层：带通摩擦感
    const bufferSize = ctx.sampleRate * 1.0;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 420;
    nf.Q.value = 0.8;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.95);
    noise.connect(nf);
    nf.connect(noiseGain);
    noiseGain.connect(lp);
    noise.start(now);
    noise.stop(now + 1.0);
}

export const AudioManager = {
    audio: null,
    enabled: true,
    currentSource: 'local',
    sourceBeforeMute: 'network',
    sfxVolume: 0.3,
    currentBgmId: null,

    init() {
        this._bgmFailed = false;
        this.audio = null;
        let trackId = 'bgm_a';
        try {
            const defaultTracks = (CONFIG.BGM_TRACKS || []).slice(0, 2);
            if (defaultTracks.length > 0) {
                trackId = defaultTracks[Math.floor(Math.random() * defaultTracks.length)].id;
            }
        } catch (e) {}
        this.currentBgmId = trackId;
        const track = (CONFIG.BGM_TRACKS || []).find(t => t.id === trackId) || {};
        this._loadBgmAudio(trackId, track.file || CONFIG.BGM_LOCAL);
        initSfx();
    },

    // 创建/切换 BGM <audio> 元素：src 指向 mp3，浏览器自己管 HTTP 缓存与流式播放。
    //   刷新后 src 命中缓存，play() 几乎立刻有声，不再走 fetch + decodeAudioData（那是每次整页加载的静音根源）。
    _loadBgmAudio(trackId, url) {
        this._stopBgm();
        _bgmAudio = new Audio();
        _bgmAudio.src = url;
        _bgmAudio.preload = 'auto';
        _bgmAudio.loop = false;
        this._applyVolume();
        const gen = _bgmGen;
        _bgmAudio.addEventListener('ended', () => {
            if (gen !== _bgmGen) return;
            if (!this.enabled || this.currentSource === 'mute') return;
            this._nextTrack();
        });
        if (this.enabled && this.currentSource !== 'mute') {
            const p = _bgmAudio.play();
            // 被自动播放策略拒 → 挂一次性手势重试，否则首个用户手势前永久静音
            if (p && p.catch) p.catch(() => { if (this.enabled) _armGestureRetry(); });
        }
    },

    switchBgm(trackId) {
        const track = (CONFIG.BGM_TRACKS || []).find(t => t.id === trackId);
        if (!track) return;
        const prev = this.currentBgmId;
        this.currentBgmId = trackId;
        try { localStorage.setItem('ming_bgm_track', trackId); } catch (e) {}
        if (prev === trackId) return;
        this._loadBgmAudio(trackId, track.file || CONFIG.BGM_LOCAL);
    },

    play() {
        if (this.enabled && _bgmAudio && !this._bgmFailed) {
            this._playBgm();
        }
    },

    pause() {
        if (_bgmAudio) {
            try { _bgmAudio.pause(); } catch (e) {}
        }
    },

    // 用户音量（0..1，不含 trim）：滑杆/淡入淡出的唯一刻度
    _userVol() {
        let v = 0.5;
        try { v = parseFloat(localStorage.getItem('ming_bgm_volume') || '0.5'); } catch (e) {}
        if (!isFinite(v)) v = 0.5;
        return Math.max(0, Math.min(1, v));
    },

    // 每首响度补偿倍数：旧方案按 RMS 把样本烘焙到同一目标（BGM_TARGET_RMS 0.07，限幅 0.35~2.5）。
    //   改 <audio> 后拿不到 PCM，改由 measureTrims() 一次性量出并写 localStorage（缺省 1 = 不补偿）。
    _trackTrim() {
        let map = null;
        try { map = JSON.parse(localStorage.getItem('ming_bgm_trim') || 'null'); } catch (e) {}
        const fromStore = map && typeof map[this.currentBgmId] === 'number' ? map[this.currentBgmId] : null;
        const t = (CONFIG.BGM_TRACKS || []).find(x => x.id === this.currentBgmId);
        const cfg = t && typeof t.trim === 'number' ? t.trim : null;
        const v = fromStore != null ? fromStore : (cfg != null ? cfg : 1);
        return Math.max(0.35, Math.min(2.5, v));
    },

    // 一次性响度测量：按旧方案同一目标（RMS 0.07，限幅 0.35~2.5）算出每首的补偿倍数，写 localStorage。
    //   控制台手动调一次即可：AudioManager.measureTrims()。之后不再解码，只读倍数。
    async measureTrims() {
        const all = CONFIG.BGM_TRACKS || [];
        const out = {};
        let ctx = null;
        try { ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100); } catch (e) {}
        for (const t of all) {
            try {
                const ab = await (await fetch(t.file)).arrayBuffer();
                const buf = await ctx.decodeAudioData(ab.slice(0));
                let sum = 0, n = 0;
                for (let c = 0; c < buf.numberOfChannels; c++) {
                    const d = buf.getChannelData(c);
                    for (let i = 0; i < d.length; i += 4) { sum += d[i] * d[i]; n++; }   // 每 4 采样取 1，够准且快
                }
                const rms = Math.sqrt(sum / Math.max(1, n));
                const g = rms > 0.0001 ? 0.07 / rms : 1;
                out[t.id] = Math.round(Math.max(0.35, Math.min(2.5, g)) * 100) / 100;
            } catch (e) { out[t.id] = 1; }
        }
        try { localStorage.setItem('ming_bgm_trim', JSON.stringify(out)); } catch (e) {}
        this._applyVolume();
        return out;
    },

    // 真实音量 = 用户音量 × 该曲 trim（volume 上限 1，超出截断）
    _applyVolume(userVol) {
        if (!_bgmAudio) return;
        const v = typeof userVol === 'number' ? userVol : this._userVol();
        _bgmAudio.volume = Math.max(0, Math.min(1, v * this._trackTrim()));
    },

    setVolume(v) {
        // 手动设音量 = 取消正在跑的淡入淡出
        this._fadeVol = null;
        this._fadeToken = (this._fadeToken || 0) + 1;
        this._applyVolume(v);
    },

    fadeTo(targetVol, durationMs) {
        if (!_bgmAudio) return;
        const startVol = this._fadeVol != null ? this._fadeVol : this._userVol();
        const startT = performance.now();
        const dur = Math.max(1, durationMs);
        const token = (this._fadeToken = (this._fadeToken || 0) + 1);
        const tick = () => {
            if (!_bgmAudio || token !== this._fadeToken) return;   // 被新的淡入淡出/手动设音量接管
            const p = Math.min(1, (performance.now() - startT) / dur);
            this._fadeVol = startVol + (targetVol - startVol) * p;
            this._applyVolume(this._fadeVol);
            if (p < 1) requestAnimationFrame(tick);
            else this._fadeVol = null;
        };
        requestAnimationFrame(tick);
    },

    switchSource(source) {
        if (source === this.currentSource) return;
        this._stopBgm();
        this.currentSource = source;
        if (source === 'mute') {
            this.enabled = false;
        } else {
            this.enabled = true;
            if (this.currentBgmId) {
                const track = (CONFIG.BGM_TRACKS || []).find(t => t.id === this.currentBgmId) || {};
                this._loadBgmAudio(this.currentBgmId, track.file || CONFIG.BGM_LOCAL);
            }
        }
    },

    _playBgm() {
        if (!_bgmAudio) return;
        this._fadeVol = null;
        this._applyVolume();
        const p = _bgmAudio.play();
        // 被自动播放策略拒 → 挂一次性手势重试
        if (p && p.catch) p.catch(() => { if (this.enabled) _armGestureRetry(); });
    },

    _nextTrack() {
        const all = CONFIG.BGM_TRACKS || [];
        const pool = all.slice(0, 2);
        if (pool.length === 0) return;
        const cands = pool.filter(t => t.id !== this.currentBgmId);
        const list = cands.length > 0 ? cands : pool;
        const next = list[Math.floor(Math.random() * list.length)];
        this.currentBgmId = next.id;
        this._loadBgmAudio(next.id, next.file || CONFIG.BGM_LOCAL);
    },

    _stopBgm() {
        _bgmGen++;
        this._fadeVol = null;
        this._fadeToken = (this._fadeToken || 0) + 1;   // 让在跑的淡入淡出立刻失效
        if (_bgmAudio) {
            try { _bgmAudio.pause(); } catch (e) {}
            try { _bgmAudio.src = ''; } catch (e) {}
            try { _bgmAudio.load(); } catch (e) {}
            _bgmAudio = null;
        }
    },

    resumeAudioContext() {
        try {
            const ctx = getAudioCtx();
            if (ctx.state === 'suspended') {
                ctx.resume();
            }
        } catch (e) {}
    },

    // 具名合成音效入口（不走角色 role 映射）：'lionRoar' → 合成狮吼
    playSfxByName(name) {
        if (!this.enabled) return;
        try {
            const ctx = getAudioCtx();
            if (ctx.state === 'suspended') { ctx.resume(); }
            if (name === 'lionRoar') {
                playLionRoar(this.sfxVolume);
            }
        } catch (e) {
            // 音效播放失败不影响游戏
        }
    },

    playSfx(role) {
        if (!this.enabled) return;
        try {
            if (role === ROLE_TYPES.DEFENDER) role = ROLE_TYPES.WARRIOR;
            // 标枪（唐文亮）音效回落战士——它的加成口径本就同战士；原先 SFX 表无「标枪」键 ⇒ 出手静音
            if (role === ROLE_TYPES.JAVELIN) role = ROLE_TYPES.WARRIOR;
            const sfxConfig = CONFIG.SFX || {};
            const sfx = sfxConfig[role];
            if (!sfx) return;

            const ctx = getAudioCtx();
            if (ctx.state === 'suspended') { ctx.resume(); }
            playBufferSfx(role, this.sfxVolume);
        } catch (e) {
            // 音效播放失败不影响游戏
        }
    }
};

window.AudioManager = AudioManager;