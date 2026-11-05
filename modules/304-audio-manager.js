// modules/304-audio-manager.js — 音频总控（Web Audio 优先，file:// 退回 <audio>）
// V7.0.0 | 2026-11-05 | 全切 Web Audio（http 下 BGM + 音效）：
//   · 小米等浏览器对 <audio> 播放的媒体指示器（喇叭/通知栏）不再弹；WebAudio 走 AudioBufferSourceNode，不被监测
//   · 环境探测 location.protocol：http(s) → WebAudio（fetch+decode+node）；file:// → 退回 <audio>（fetch 被安全策略拦死）
//   · BGM：fetch+decode 缓存 AudioBuffer，播放走 AudioBufferSourceNode；pause = stop+记 offset，resume 从 offset 重建
//   · 音效：所有 role 的 mp3 并发 fetch+decode 预热缓存，每次播放新建 source（可叠放）
//   · 合成音（狮吼）不变，仍走 WebAudio；对外 API 签名一字不改
//   · <audio> 实现整段保留（file:// 分支），两套后端并存、入口按环境选择
export const VER = 'modules/304-audio-manager.js V7.0.0';

import { CONFIG } from '../core/201-config-5v5-test.js';

import { ROLE_TYPES } from '../infra/106-battle-enums.js';

// ─── 合成音（与后端无关，始终 WebAudio） ───
let audioCtx = null;
function getAudioCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
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

// ─── 环境探测：http(s) → WebAudio；其余（file:// 直开）→ <audio> ───
// file:// 下 fetch 会被浏览器安全策略直接拦死（这正是 V6.5.1 把音效改 <audio> 的起因），
//   所以 WebAudio 只在 http(s) 下可用；其余环境退回 <audio>，声音保底，喇叭保底弹（物理限制）。
const _isHttp = typeof location !== 'undefined'
    && (location.protocol === 'http:' || location.protocol === 'https:');

// ─── WebAudio 缓存与状态（http 下用） ───
const _bgmBuffers = new Map();      // trackId -> AudioBuffer
const _sfxBuffers = new Map();      // role    -> AudioBuffer
let _bgmNode = null;                // 当前播放的 AudioBufferSourceNode
let _bgmGain = null;                // BGM 独立 gain（fadeTo 用），首播时建、ctx 终身复用
let _bgmOffset = 0;                 // 暂停时记下已播进度（秒），resume 从这继续
let _bgmStartAt = 0;                // 当前 source 起播时刻（ctx.currentTime - offset）
let _bgmFetchGen = 0;               // fetch 代际号：切歌时 ++，旧 fetch 回调发现自己过期就丢弃

// ─── <audio> 缓存与状态（file:// 下用） ───
const sfxEls = {};
let _bgmAudio = null;
let _bgmGen = 0;                    // <audio> 代际号：每次主动停播 ++，作废在飞的 ended 回调

// 音效预热（file:// 用）：只建元素，不播；浏览器据此把文件读进缓存
function preloadSfxAudio(key, url) {
    try {
        const el = new Audio(url);
        el.preload = 'auto';
        sfxEls[key] = el;
    } catch (e) {}
}

// 音效预热（http 用）：fetch + decode → AudioBuffer 缓存
async function preloadSfxWebAudio(key, url) {
    try {
        const ctx = getAudioCtx();
        const resp = await fetch(url);
        if (!resp.ok) { console.warn('[audio] 音效预加载失败 HTTP', resp.status, key); return; }
        const arr = await resp.arrayBuffer();
        const buf = await ctx.decodeAudioData(arr);
        _sfxBuffers.set(key, buf);
    } catch (e) {
        console.warn('[audio] 音效预加载失败:', key, e);
    }
}

// 初始化：预热所有 mp3 音效（http 并发 fetch+decode；file 逐个建元素）
export async function initSfx() {
    const entries = Object.entries(CONFIG.SFX || {});
    if (_isHttp) {
        await Promise.all(entries.map(([role, path]) => preloadSfxWebAudio(role, path)));
    } else {
        for (const [role, path] of entries) preloadSfxAudio(role, path);
    }
}

// 播放一个音效（http: 新建 AudioBufferSourceNode，可叠放；file: 每次新建 <audio>，可叠放）
function playSfxFile(key, volume) {
    const v = Math.max(0, Math.min(1, volume));
    if (_isHttp) {
        const buf = _sfxBuffers.get(key);
        if (!buf) return;
        try {
            const ctx = getAudioCtx();
            if (ctx.state === 'suspended') ctx.resume();
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const g = ctx.createGain();
            g.gain.value = v;
            src.connect(g);
            g.connect(ctx.destination);
            src.start();
        } catch (e) {}
        return;
    }
    const base = sfxEls[key];
    if (!base || !base.src) return;
    try {
        const el = new Audio(base.src);
        el.volume = v;
        const p = el.play();
        if (p && p.catch) p.catch(() => {});
    } catch (e) {}
}

export const AudioManager = {
    audio: null,
    enabled: true,
    currentSource: 'local',
    sourceBeforeMute: 'network',
    sfxVolume: 0.3,   // 音效独立音量
    currentBgmId: null,
    _bgmFailed: false,
    _fadeTimer: null,

    init() {
        this._bgmFailed = false;
        this.audio = null;
        // 每次启动都从前两首默认曲目随机，不读历史选择
        let trackId = 'bgm_a';
        try {
            const defaultTracks = (CONFIG.BGM_TRACKS || []).slice(0, 2);
            if (defaultTracks.length > 0) {
                trackId = defaultTracks[Math.floor(Math.random() * defaultTracks.length)].id;
            }
        } catch (e) {}
        this.currentBgmId = trackId;
        const track = (CONFIG.BGM_TRACKS || []).find(t => t.id === trackId) || {};
        this._mountBgm(trackId, track.file || CONFIG.BGM_LOCAL);
        initSfx();
    },

    // 挂载曲目：http 走 WebAudio（fetch+decode 缓存），file 走 <audio> 元素
    _mountBgm(trackId, url) {
        if (_isHttp) this._mountBgmWebAudio(trackId, url);
        else this._mountBgmAudio(trackId, url);
    },

    // <audio> 版（file:// 分支，沿用 V6.5.1 现状）
    _mountBgmAudio(trackId, url) {
        this._stopBgm(false);
        const gen = _bgmGen;
        _bgmAudio = new Audio(url);
        _bgmAudio.preload = 'auto';
        _bgmAudio.loop = false;
        _bgmAudio.volume = this._userVol();
        _bgmAudio.onended = () => {
            if (gen !== _bgmGen) return;
            if (!this.enabled || this.currentSource === 'mute') return;
            this._nextTrack();
        };
        if (this.enabled && this.currentSource !== 'mute') this._playBgm();
    },

    // WebAudio 版（http 分支）
    async _mountBgmWebAudio(trackId, url) {
        const gen = ++_bgmFetchGen;
        this._stopBgm(false);
        this.currentBgmId = trackId;
        _bgmOffset = 0;
        _bgmStartAt = 0;
        try {
            const ctx = getAudioCtx();
            let buf = _bgmBuffers.get(trackId);
            if (!buf) {
                const resp = await fetch(url);
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                const arr = await resp.arrayBuffer();
                buf = await ctx.decodeAudioData(arr);
                if (gen !== _bgmFetchGen) return;   // 用户又切歌了，丢弃本次
                _bgmBuffers.set(trackId, buf);
            }
            if (gen !== _bgmFetchGen) return;
            if (this.enabled && this.currentSource !== 'mute') this._playBgm();
        } catch (e) {
            console.warn('[audio] BGM 加载失败:', trackId, e);
            this._bgmFailed = true;
        }
    },

    // 切换 BGM 曲目（id 来自 CONFIG.BGM_TRACKS）
    switchBgm(trackId) {
        const track = (CONFIG.BGM_TRACKS || []).find(t => t.id === trackId);
        if (!track) return;
        const prev = this.currentBgmId;
        this.currentBgmId = trackId;
        try { localStorage.setItem('ming_bgm_track', trackId); } catch (e) {}
        if (prev === trackId) return;
        this._mountBgm(trackId, track.file || CONFIG.BGM_LOCAL);
    },

    play() {
        if (!this.enabled) return;
        if (_isHttp) { this._playBgm(); return; }
        if (_bgmAudio && !this._bgmFailed) this._playBgm();
    },

    pause() {
        if (_isHttp) { this._stopBgm(true); return; }   // 留 offset，resume 从这继续
        if (_bgmAudio) { try { _bgmAudio.pause(); } catch (e) {} }
    },

    // 用户音量（0..1）：滑杆与淡入淡出共用的唯一刻度
    _userVol() {
        let v = 0.5;
        try { v = parseFloat(localStorage.getItem('ming_bgm_volume') || '0.5'); } catch (e) {}
        if (!isFinite(v)) v = 0.5;
        return Math.max(0, Math.min(1, v));
    },

    setVolume(v) {
        // 手动设音量 = 取消正在跑的淡入淡出
        if (this._fadeTimer) { clearInterval(this._fadeTimer); this._fadeTimer = null; }
        const vv = Math.max(0, Math.min(1, v));
        if (_isHttp) {
            if (_bgmGain) {
                try { _bgmGain.gain.setValueAtTime(vv, getAudioCtx().currentTime); } catch (e) {}
            }
            return;
        }
        if (_bgmAudio) _bgmAudio.volume = vv;
    },

    fadeTo(targetVol, durationMs) {
        const vv = Math.max(0, Math.min(1, targetVol));
        if (_isHttp) {
            if (!_bgmGain) return;
            try {
                const ctx = getAudioCtx();
                const now = ctx.currentTime;
                const g = _bgmGain.gain;
                g.cancelScheduledValues(now);
                g.setValueAtTime(g.value, now);
                g.linearRampToValueAtTime(vv, now + Math.max(0.01, durationMs / 1000));
            } catch (e) {}
            return;
        }
        if (!_bgmAudio) return;
        if (this._fadeTimer) clearInterval(this._fadeTimer);
        const el = _bgmAudio;                    // 锁住本次元素：切歌后旧定时器不再动新曲
        const startVol = el.volume;
        const startTime = Date.now();
        const dur = Math.max(1, durationMs);
        this._fadeTimer = setInterval(() => {
            if (_bgmAudio !== el) { clearInterval(this._fadeTimer); this._fadeTimer = null; return; }
            const p = Math.min(1, (Date.now() - startTime) / dur);
            el.volume = Math.max(0, Math.min(1, startVol + (vv - startVol) * p));
            if (p >= 1) { clearInterval(this._fadeTimer); this._fadeTimer = null; }
        }, 50);
    },

    switchSource(source) {
        if (source === this.currentSource) return;
        this.currentSource = source;
        if (source === 'mute') {
            this.enabled = false;
            this.pause();
            return;
        }
        this.enabled = true;
        if (this.currentBgmId) {
            const needRemount = _isHttp ? !_bgmNode : !_bgmAudio;
            if (needRemount) {
                const track = (CONFIG.BGM_TRACKS || []).find(t => t.id === this.currentBgmId) || {};
                this._mountBgm(this.currentBgmId, track.file || CONFIG.BGM_LOCAL);
            } else {
                this._playBgm();
            }
        }
    },

    _playBgm() {
        if (_isHttp) {
            const ctx = getAudioCtx();
            try { if (ctx.state === 'suspended') ctx.resume(); } catch (e) {}
            const buf = _bgmBuffers.get(this.currentBgmId);
            if (!buf) return;                    // 还没加载完，等 _mountBgmWebAudio 的 fetch 回调再 play
            if (_bgmNode) return;                // 已在播
            if (!_bgmGain) {
                _bgmGain = ctx.createGain();
                _bgmGain.connect(ctx.destination);
            }
            _bgmGain.gain.setValueAtTime(this._userVol(), ctx.currentTime);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.loop = false;
            src.connect(_bgmGain);
            const offset = _bgmOffset;
            try { src.start(0, offset); } catch (e) { return; }
            _bgmStartAt = ctx.currentTime - offset;
            _bgmNode = src;
            src.onended = () => {
                if (_bgmNode !== src) return;    // 已被替换（切歌/暂停）
                _bgmNode = null;
                _bgmOffset = 0;
                _bgmStartAt = 0;
                if (AudioManager.enabled && AudioManager.currentSource !== 'mute') {
                    AudioManager._nextTrack();
                }
            };
            return;
        }
        // file：<audio>
        if (!_bgmAudio) return;
        _bgmAudio.volume = this._userVol();
        const p = _bgmAudio.play();
        if (p && p.catch) p.catch(() => {});
    },

    // 播完自动切下一首：只在默认曲目（前两首）之间轮；隐藏曲播完自动回轮播池
    _nextTrack() {
        const all = CONFIG.BGM_TRACKS || [];
        const pool = all.slice(0, 2);
        if (pool.length === 0) return;
        const cands = pool.filter(t => t.id !== this.currentBgmId);
        const list = cands.length > 0 ? cands : pool;
        const next = list[Math.floor(Math.random() * list.length)];
        this.currentBgmId = next.id;
        this._mountBgm(next.id, next.file || CONFIG.BGM_LOCAL);
    },

    // 停播。keepOffset=true 用于暂停（保留已播进度，resume 从这继续）；false 用于切歌/主动停（从头开始）
    _stopBgm(keepOffset) {
        _bgmGen++;                               // 作废在飞的 ended 回调
        // <audio> 收尾
        if (this._fadeTimer) { clearInterval(this._fadeTimer); this._fadeTimer = null; }
        if (_bgmAudio) {
            try { _bgmAudio.onended = null; } catch (e) {}
            try { _bgmAudio.pause(); } catch (e) {}
            _bgmAudio = null;                    // 直接丢弃元素；不要置 src=''（那会让浏览器把页面 URL 当音频加载）
        }
        // WebAudio 收尾
        if (_bgmNode) {
            if (keepOffset) {
                try { _bgmOffset += getAudioCtx().currentTime - _bgmStartAt; } catch (e) { _bgmOffset = 0; }
            } else {
                _bgmOffset = 0;
            }
            try { _bgmNode.onended = null; } catch (e) {}
            try { _bgmNode.stop(); } catch (e) {}
            _bgmNode = null;
            _bgmStartAt = 0;
        } else if (!keepOffset) {
            _bgmOffset = 0;
        }
    },

    resumeAudioContext() {
        try {
            const ctx = getAudioCtx();
            if (ctx.state === 'suspended') ctx.resume();
            if (_isHttp && this.enabled && this.currentSource !== 'mute' && !_bgmNode) {
                this._playBgm();
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
        } catch (e) {}
    },

    playSfx(role) {
        if (!this.enabled) return;
        try {
            if (role === ROLE_TYPES.DEFENDER) role = ROLE_TYPES.WARRIOR;
            // 标枪（唐文亮）音效回落战士
            if (role === ROLE_TYPES.JAVELIN) role = ROLE_TYPES.WARRIOR;
            const sfxConfig = CONFIG.SFX || {};
            const sfx = sfxConfig[role];
            if (!sfx) return;
            const ctx = getAudioCtx();
            if (ctx.state === 'suspended') { ctx.resume(); }
            playSfxFile(role, this.sfxVolume);
        } catch (e) {}
    }
};

window.AudioManager = AudioManager;
