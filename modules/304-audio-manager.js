// modules/304-audio-manager.js — 音频总控（BGM 与音效均走 HTMLAudioElement，WebAudio 只留合成音）
// V6.5.1 | 2026-11-04 | 音效也改走 <audio>：BGM 修好后 file:// 下剩下的 4 条「音效加载失败/Failed to fetch」
//   全是 fetch 被拦导致；音效改为建元素预热 + 播放时新建一份（可叠放），彻底不碰 fetch。
//   合成音（狮吼）仍用 WebAudio，不依赖文件。
export const VER = 'modules/304-audio-manager.js V6.5.1';

import { CONFIG } from '../core/201-config-5v5-test.js';

import { ROLE_TYPES } from '../infra/106-battle-enums.js';

let audioCtx = null;
function getAudioCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

// 音效：同样走 HTMLAudioElement，不走 fetch。
//   每个 role 预建一个元素暖缓存（浏览器自己记），播放时按同 URL 新建一份——同音效可叠放，
//   且 file:// 直开时不会被 fetch 的同源策略拦掉。
const sfxEls = {};

// BGM 播放：单个 HTMLAudioElement（与历史实现同款）。浏览器自己管加载/缓存/解码，
// 不走 fetch —— file:// 下 fetch 会被浏览器安全策略直接拦死。
let _bgmAudio = null;
// 播完自动切歌用：每次主动停播都自增，让在飞的 ended 回调失效（否则「暂停/切歌」会被误判成「播完」）
let _bgmGen = 0;

// 预热一个音效文件：只建元素，不播；浏览器据此把文件读进缓存
function preloadSfx(key, url) {
    try {
        const el = new Audio(url);
        el.preload = 'auto';
        sfxEls[key] = el;
    } catch (e) {
        // 拿不到文件就静音，不影响游戏
    }
}

// 初始化：预热所有 mp3 音效
export async function initSfx() {
    for (const [role, path] of Object.entries(CONFIG.SFX || {})) {
        preloadSfx(role, path);
    }
}

// 播放一个音效（每次新建元素：可叠放，音量独立）
function playSfxFile(key, volume) {
    const base = sfxEls[key];
    if (!base || !base.src) return;
    try {
        const el = new Audio(base.src);
        el.volume = Math.max(0, Math.min(1, volume));
        const p = el.play();
        if (p && p.catch) p.catch(() => {});
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
    sfxVolume: 0.3,   // 音效独立音量
    currentBgmId: null,

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

    // 挂载曲目：一个 <audio> 元素，交给浏览器加载/缓存/解码
    _mountBgm(trackId, url) {
        this._stopBgm();
        const gen = _bgmGen;
        _bgmAudio = new Audio(url);
        _bgmAudio.preload = 'auto';
        _bgmAudio.loop = false;          // 不再单曲循环——播完自动随机切下一首
        _bgmAudio.volume = this._userVol();
        _bgmAudio.onended = () => {
            if (gen !== _bgmGen) return;                     // 被暂停/切歌停掉，不是自然播完
            if (!this.enabled || this.currentSource === 'mute') return;
            this._nextTrack();
        };
        if (this.enabled && this.currentSource !== 'mute') this._playBgm();
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
        if (this.enabled && _bgmAudio && !this._bgmFailed) {
            this._playBgm();
        }
    },

    pause() {
        if (_bgmAudio) {
            try { _bgmAudio.pause(); } catch (e) {}
        }
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
        if (_bgmAudio) _bgmAudio.volume = Math.max(0, Math.min(1, v));
    },

    fadeTo(targetVol, durationMs) {
        if (!_bgmAudio) return;
        if (this._fadeTimer) clearInterval(this._fadeTimer);
        const el = _bgmAudio;                    // 锁住本次元素：切歌后旧定时器不再动新曲
        const startVol = el.volume;
        const startTime = Date.now();
        const dur = Math.max(1, durationMs);
        this._fadeTimer = setInterval(() => {
            if (_bgmAudio !== el) { clearInterval(this._fadeTimer); this._fadeTimer = null; return; }
            const p = Math.min(1, (Date.now() - startTime) / dur);
            el.volume = Math.max(0, Math.min(1, startVol + (targetVol - startVol) * p));
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
        if (!_bgmAudio && this.currentBgmId) {
            const track = (CONFIG.BGM_TRACKS || []).find(t => t.id === this.currentBgmId) || {};
            this._mountBgm(this.currentBgmId, track.file || CONFIG.BGM_LOCAL);
        } else {
            this._playBgm();
        }
    },

    _playBgm() {
        if (!_bgmAudio) return;
        _bgmAudio.volume = this._userVol();      // 起播/切曲后按用户音量对齐
        const p = _bgmAudio.play();
        if (p && p.catch) p.catch(() => {});     // 无手势时被自动播放策略拒，等下一次 play() 再起
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

    _stopBgm() {
        _bgmGen++;                               // 作废在飞的 ended 回调
        if (this._fadeTimer) { clearInterval(this._fadeTimer); this._fadeTimer = null; }
        if (_bgmAudio) {
            try { _bgmAudio.onended = null; } catch (e) {}
            try { _bgmAudio.pause(); } catch (e) {}
            _bgmAudio = null;                    // 直接丢弃元素；不要置 src=''（那会让浏览器把页面 URL 当音频加载）
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
            playSfxFile(role, this.sfxVolume);
        } catch (e) {
            // 音效播放失败不影响游戏
        }
    }
};

window.AudioManager = AudioManager;
