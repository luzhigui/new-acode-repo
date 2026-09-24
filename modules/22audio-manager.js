// V6.0.0 | ~8000 bytes | 2026-07-05
export const VER = 'modules/22audio-manager.js V6.1.0';

import { CONFIG } from '../core/01config-5v5-test.js';

import { ROLE_TYPES } from '../infra/56-battle-enums.js';

let audioCtx = null;
function getAudioCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

// 预加载的音效缓冲区
const sfxBuffers = {};

// BGM 缓存与播放控制
const bgmBuffers = {};   // trackId -> AudioBuffer
let bgmBuffer = null;    // 当前曲目 buffer
let bgmSource = null;
let bgmGainNode = null;
let bgmStartedAt = 0;
let bgmPausedAt = 0;
// 播完自动切歌用：每次主动停播都自增，让在飞的 onended 失效
// （AudioBufferSourceNode.stop() 也会触发 onended，不挡会把"暂停"误判成"播完"）
let _bgmGen = 0;
// 目标响度（RMS）。三首 mp3 母带响度不同——另两首偏大、心爱偏小，
// 加载后按各自 RMS 把样本烘焙到同一目标，下游（滑杆/淡入淡出）无需感知。
const BGM_TARGET_RMS = 0.07;

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
        if (path !== 'hammer' && path !== 'slash') {
            promises.push(loadSfxBuffer(role, path));
        }
    }
    await Promise.all(promises);
}

// 响度归一化：按 RMS 把整首样本缩放。直接改采样数据而非乘 gainNode，
// 这样 setVolume / fadeTo / 音乐面板滑杆三处都不必知道 trim。
// 每首只在首次加载时做一次；改参数需刷新页面（buffer 已缓存）。
function normalizeBgmBuffer(buf) {
    try {
        const d0 = buf.getChannelData(0);
        let sum = 0, n = 0;
        for (let i = 0; i < d0.length; i += 500) { sum += d0[i] * d0[i]; n++; }
        const rms = Math.sqrt(sum / Math.max(1, n));
        if (rms < 0.0001) return;
        let g = BGM_TARGET_RMS / rms;
        g = Math.max(0.35, Math.min(2.5, g));   // 限幅，避免把安静的曲子放到失真
        if (Math.abs(g - 1) < 0.05) return;     // 本来就接近目标，不动
        for (let c = 0; c < buf.numberOfChannels; c++) {
            const d = buf.getChannelData(c);
            for (let i = 0; i < d.length; i++) d[i] *= g;
        }
    } catch (e) { /* 归一化失败就用原始响度，不影响播放 */ }
}

// 预加载BGM文件到内存（多曲目缓存）
async function loadBgmBuffer(trackId, url) {
    try {
        const ctx = getAudioCtx();
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const buf = await ctx.decodeAudioData(arrayBuffer);
        normalizeBgmBuffer(buf);
        bgmBuffers[trackId] = buf;
        if (trackId === AudioManager.currentBgmId) bgmBuffer = buf;
    } catch (e) {
        console.warn('BGM加载失败:', url, e);
        if (trackId === AudioManager.currentBgmId) bgmBuffer = null;
    }
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



// 战士专用：低频斩击合成音效
function playSlash() {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.linearRampToValueAtTime(80, now + 0.2);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(now + 0.2);

    const noiseDuration = 0.15;
    const bufferSize = ctx.sampleRate * noiseDuration;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseGain = ctx.createGain();
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime(1500, now);
    noiseGain.gain.setValueAtTime(0.2, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + noiseDuration);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start();
    noise.stop(now + noiseDuration);
}

// 狮吼合成音效：双锯齿低吼滑落 + 颤音 LFO + 气息噪声，低通收尾（无 mp3 素材，与 playSlash 同为合成路线）
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
        // 恢复用户手动选择的曲目；无保存时从前两首默认曲目随机，避免每次都听第一首
        let trackId = 'bgm_a';
        try {
            // 每次启动都从前两首默认曲目随机，不读历史选择
            const defaultTracks = (CONFIG.BGM_TRACKS || []).slice(0, 2);
            if (defaultTracks.length > 0) {
                trackId = defaultTracks[Math.floor(Math.random() * defaultTracks.length)].id;
            }
        } catch (e) {}
        this.currentBgmId = trackId;
        const track = (CONFIG.BGM_TRACKS || []).find(t => t.id === trackId) || {};
        loadBgmBuffer(trackId, track.file || CONFIG.BGM_LOCAL).then(() => {
            if (bgmBuffer && this.enabled && this.currentSource !== 'mute') {
                this._playBgm();
            }
        });
        // 其余曲目后台静默预载——否则第一次自动切歌要现 fetch+decode，会卡一下
        for (const t of (CONFIG.BGM_TRACKS || [])) {
            if (t.id === trackId || bgmBuffers[t.id]) continue;
            loadBgmBuffer(t.id, t.file || CONFIG.BGM_LOCAL);
        }
        initSfx();
    },
    
    // 切换 BGM 曲目（id 来自 CONFIG.BGM_TRACKS）
    switchBgm(trackId) {
        const track = (CONFIG.BGM_TRACKS || []).find(t => t.id === trackId);
        if (!track) return;
        const prev = this.currentBgmId;
        this.currentBgmId = trackId;
        bgmPausedAt = 0;
        if (bgmBuffers[trackId]) {
            bgmBuffer = bgmBuffers[trackId];
            if (this.enabled && this.currentSource !== 'mute' && prev !== trackId) {
                this._stopBgm();
                this._playBgm();
            }
        } else {
            bgmBuffer = null;
            if (this.enabled && this.currentSource !== 'mute' && prev !== trackId) {
                this._stopBgm();
            }
            loadBgmBuffer(trackId, track.file).then(() => {
                if (this.currentBgmId === trackId && this.enabled && this.currentSource !== 'mute' && bgmBuffer) {
                    this._playBgm();
                }
            });
        }
        try { localStorage.setItem('ming_bgm_track', trackId); } catch (e) {}
    },
    
    play() {
        if (this.enabled && bgmBuffer && !this._bgmFailed) {
            this._playBgm();
        }
    },
    
    pause() {
        if (bgmSource) {
            const ctx = getAudioCtx();
            bgmPausedAt = ctx.currentTime - bgmStartedAt;
            this._stopBgm();
        }
    },
    
    // 响度已在加载时烘焙进 buffer，此处只需设用户音量，不必再乘 trim
    setVolume(v) {
        if (bgmGainNode) {
            const ctx = getAudioCtx();
            bgmGainNode.gain.setValueAtTime(v, ctx.currentTime);
        }
    },
    
    fadeTo(targetVol, durationMs) {
        if (!bgmGainNode) return;
        const ctx = getAudioCtx();
        const now = ctx.currentTime;
        bgmGainNode.gain.setValueAtTime(bgmGainNode.gain.value, now);
        bgmGainNode.gain.linearRampToValueAtTime(targetVol, now + durationMs / 1000);
    },
    
    switchSource(source) {
        if (source === this.currentSource) return;
        this._stopBgm();
        this.currentSource = source;
        if (source === 'mute') {
            this.enabled = false;
        } else {
            this.enabled = true;
            if (bgmBuffer) {
                this._playBgm();
            } else if (this.currentBgmId) {
                const track = (CONFIG.BGM_TRACKS || []).find(t => t.id === this.currentBgmId) || {};
                loadBgmBuffer(this.currentBgmId, track.file || CONFIG.BGM_LOCAL).then(() => {
                    if (bgmBuffer && this.enabled) this._playBgm();
                });
            }
        }
    },
    
    cycleSource() {
        switch (this.currentSource) {
            case 'network':
                this.sourceBeforeMute = 'network';
                this.switchSource('local');
                break;
            case 'local':
                this.sourceBeforeMute = 'local';
                this.switchSource('mute');
                break;
            case 'mute':
                this.switchSource(this.sourceBeforeMute || 'network');
                break;
        }
        return this.currentSource;
    },

    _playBgm() {
        if (!bgmBuffer) return;
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        this._stopBgm();
        const gen = _bgmGen;              // 记下本代编号，停播后自增即作废
        bgmSource = ctx.createBufferSource();
        bgmSource.buffer = bgmBuffer;
        bgmSource.loop = false;           // 不再单曲循环——播完自动随机切下一首
        bgmGainNode = ctx.createGain();
        let initVol = 0.5;
        try { initVol = parseFloat(localStorage.getItem('ming_bgm_volume') || '0.5'); } catch (e) {}
        bgmGainNode.gain.setValueAtTime(initVol, ctx.currentTime);
        bgmSource.connect(bgmGainNode);
        bgmGainNode.connect(ctx.destination);
        bgmSource.onended = () => {
            if (gen !== _bgmGen) return;                  // 被暂停/切歌停掉，不是自然播完
            if (!this.enabled || this.currentSource === 'mute') return;
            this._nextTrack();
        };
        bgmSource.start(0, bgmPausedAt);
        bgmStartedAt = ctx.currentTime - bgmPausedAt;
        bgmPausedAt = 0;
    },

    // 播完自动切下一首：只在默认曲目（前两首）之间轮；隐藏曲需手动选中，播完自动回轮播池
    _nextTrack() {
        const all = CONFIG.BGM_TRACKS || [];
        const pool = all.slice(0, 2);
        if (pool.length === 0) return;
        const cands = pool.filter(t => t.id !== this.currentBgmId);
        const list = cands.length > 0 ? cands : pool;
        const next = list[Math.floor(Math.random() * list.length)];
        this.currentBgmId = next.id;
        bgmPausedAt = 0;
        if (bgmBuffers[next.id]) {
            bgmBuffer = bgmBuffers[next.id];
            if (this.enabled && this.currentSource !== 'mute') this._playBgm();
        } else {
            bgmBuffer = null;
            loadBgmBuffer(next.id, next.file || CONFIG.BGM_LOCAL).then(() => {
                if (this.enabled && this.currentSource !== 'mute' && bgmBuffer) this._playBgm();
            });
        }
    },

    _stopBgm() {
        _bgmGen++;                                    // 作废在飞的 onended
        if (bgmSource) {
            try { bgmSource.onended = null; } catch (e) {}
            try { bgmSource.stop(); } catch (e) {}
            bgmSource.disconnect();
            bgmSource = null;
        }
        if (bgmGainNode) {
            bgmGainNode.disconnect();
            bgmGainNode = null;
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
            const sfxConfig = CONFIG.SFX || {};
            const sfx = sfxConfig[role];
            if (!sfx) return;

            const ctx = getAudioCtx();
            if (ctx.state === 'suspended') { ctx.resume(); }
            if (sfx === 'slash') {
                playSlash();
            } else {
                playBufferSfx(role, this.sfxVolume);
            }
        } catch (e) {
            // 音效播放失败不影响游戏
        }
    }
};

window.AudioManager = AudioManager;