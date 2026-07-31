﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// modules/28audio-manager.js - 光明顶5v5 音频管理器
// V5.2.1 | ~8328 bytes | 2026-07-05
export const VER = 'modules/28audio-manager.js V5.2.1';

import { CONFIG } from '../core/01config-5v5-test.js';

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
let bgmBuffer = null;
let bgmSource = null;
let bgmGainNode = null;
let bgmStartedAt = 0;
let bgmPausedAt = 0;

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

// 预加载BGM文件到内存
async function loadBgmBuffer(url) {
    try {
        const ctx = getAudioCtx();
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        bgmBuffer = await ctx.decodeAudioData(arrayBuffer);
    } catch (e) {
        console.warn('BGM加载失败:', url, e);
        bgmBuffer = null;
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

export const AudioManager = {
    audio: null,
    enabled: true,
    currentSource: 'local',
    sourceBeforeMute: 'network',
    sfxVolume: 0.3,   // 音效独立音量

    init() {
        this._bgmFailed = false;
        this.audio = null;
        loadBgmBuffer(CONFIG.BGM_LOCAL).then(() => {
            if (bgmBuffer && this.enabled && this.currentSource !== 'mute') {
                this._playBgm();
            }
        });
        initSfx();
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
            } else {
                loadBgmBuffer(CONFIG.BGM_LOCAL).then(() => {
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
        bgmSource = ctx.createBufferSource();
        bgmSource.buffer = bgmBuffer;
        bgmSource.loop = true;
        bgmGainNode = ctx.createGain();
        bgmGainNode.gain.setValueAtTime(0.5, ctx.currentTime);
        bgmSource.connect(bgmGainNode);
        bgmGainNode.connect(ctx.destination);
        bgmSource.start(0, bgmPausedAt);
        bgmStartedAt = ctx.currentTime - bgmPausedAt;
        bgmPausedAt = 0;
    },

    _stopBgm() {
        if (bgmSource) {
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

    playSfx(role) {
        if (!this.enabled) return;
        try {
            if (role === '防战') role = '战士';
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