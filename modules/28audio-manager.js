// modules/28audio-manager.js - 光明顶5v5 音频管理器
// V4.0.0 | ~150 lines | 2026-06-29 09:29
export const VER = 'modules/28audio-manager.js V4.0.0';

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

// 防战专用：厚重大锤合成音效
function playHammer() {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.linearRampToValueAtTime(60, now + 0.3);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(now + 0.3);

    const noiseDuration = 0.25;
    const bufferSize = ctx.sampleRate * noiseDuration;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseGain = ctx.createGain();
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(800, now);
    noiseGain.gain.setValueAtTime(0.25, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + noiseDuration);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start();
    noise.stop(now + noiseDuration);
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
    sfxVolume: 0.8,   // 新增：音效独立音量

    init() {
            const url = CONFIG.BGM_LOCAL;
        try {
            if (this.audio) {
                this.audio.pause();
                this.audio = null;
            }
            this.audio = new Audio(url);
            this.audio.loop = true;
            this.audio.volume = 0.6;
            this.audio.onerror = () => { this.enabled = false; };
        } catch (e) {
            this.audio = null;
            this.enabled = false;
        }
        // 预加载所有 mp3 音效
        initSfx();
    },
    
    play() {
        if (this.enabled && this.audio) {
            this.audio.play().catch(() => {});
        }
    },
    
    pause() {
        if (this.audio) {
            this.audio.pause();
        }
    },
    
    setVolume(v) {
        if (this.audio) {
            this.audio.volume = v;
        }
    },
    
    fadeTo(targetVol, durationMs) {
        if (!this.audio) return;
        const startVol = this.audio.volume;
        const startTime = Date.now();
        const timer = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(1, elapsed / durationMs);
            this.audio.volume = startVol + (targetVol - startVol) * progress;
            if (progress >= 1) clearInterval(timer);
        }, 50);
    },
    
    switchSource(source) {
        if (source === this.currentSource) return;
        const wasPlaying = this.enabled && this.audio && !this.audio.paused;
        if (this.audio) {
            this.audio.pause();
            this.audio = null;
        }
        this.currentSource = source;
        if (source === 'mute') {
            this.enabled = false;
        } else {
            this.enabled = true;
            const url = CONFIG.BGM_LOCAL;
            try {
                this.audio = new Audio(url);
                this.audio.loop = true;
                this.audio.volume = 0.6;
            } catch (e) {
                this.audio = null;
                this.enabled = false;
            }
        }
        if (this.enabled) this.play();
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

    playSfx(role) {
        if (!this.enabled) return;
        try {
            const sfxConfig = CONFIG.SFX || {};
            const sfx = sfxConfig[role];
            if (!sfx) return;

            // 暂时压低 BGM
            if (this.audio && this.audio.volume > 0.2) {
                this.audio.volume = 0.2;
            }
            const restoreBGM = () => {
                if (this.audio) this.audio.volume = 0.6;
            };
            const ctx = getAudioCtx();
            if (ctx.state === 'suspended') { ctx.resume(); }
            if (sfx === 'hammer') {
                playHammer();
                setTimeout(restoreBGM, 600);
            } else if (sfx === 'slash') {
                playSlash();
                setTimeout(restoreBGM, 600);
            } else {
                // 从预加载的缓冲区播放 mp3 音效，使用独立音量
                playBufferSfx(role, this.sfxVolume);
                setTimeout(restoreBGM, 800);
            }
        } catch (e) {
            // 音效播放失败不影响游戏
        }
    }
};

window.AudioManager = AudioManager;