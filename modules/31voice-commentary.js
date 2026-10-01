// modules/31voice-commentary.js — 语音解说引擎（实时朗读版）
// V1.0.0 | 2026-10-01 首版：播放层每条战报播完后调 speakFact（防剧透：动画收尾再开口），
// 关键节点现场编词、手机系统 TTS 实时朗读；音色/语速/音调/话痨度可调，设置面板在 ui/73。
// 单机/联机主机/联机从机/战报回放四条路全走 playSingleLogEntry，一处挂钩全生效。
import { GlobalStore } from '../infra/54-global-store.js';
import { FACT_TYPES } from '../infra/56-battle-enums.js';
import { AudioManager } from './22audio-manager.js';

export const VER = 'modules/31voice-commentary.js V1.0.0';

const LS_KEY = 'ming_voice_commentary';

// ── 设置（localStorage 持久化，面板在 ui/73）────────────────────────
const cfg = {
    on: false,          // 总开关
    voiceURI: '',       // 指定音色（空=系统默认）
    rate: 1.05,         // 语速 0.6~1.6
    pitch: 1.0,         // 音调 0.6~1.4
    chatty: false       // 话痨模式：额外播报每回合开始
};
try { Object.assign(cfg, JSON.parse(localStorage.getItem(LS_KEY) || '{}')); } catch (e) { /* 忽略坏档 */ }
export function getVoiceCfg() { return cfg; }
export function setVoiceCfg(patch) {
    Object.assign(cfg, patch || {});
    try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) { /* 存不了就算了 */ }
}

// ── 音色清单（中文优先排前；安卓 Chrome 异步加载要挂 onvoiceschanged）──
let voicesCache = [];
let warnedNoTTS = false;
function refreshVoices() {
    if (!('speechSynthesis' in window)) return;
    voicesCache = speechSynthesis.getVoices().slice();
    // zh 开头的排最前，普通话 zh-CN/zh-* 优先于粤语等
    voicesCache.sort((a, b) => zhScore(b) - zhScore(a));
}
function zhScore(v) {
    const l = (v.lang || '').toLowerCase();
    if (l === 'zh-cn' || l === 'zh_cn') return 4;
    if (l.startsWith('zh')) return 3;
    if (/chinese|中文|普通话|mandarin/i.test(v.name || '')) return 2;
    return 0;
}
if ('speechSynthesis' in window) {
    refreshVoices();
    if (typeof speechSynthesis.onvoiceschanged !== 'undefined') {
        speechSynthesis.addEventListener('voiceschanged', refreshVoices);
    }
}
export function listVoices() {
    if (!voicesCache.length) refreshVoices();
    return voicesCache;
}

// ── 名字念法清洗：中点念不出来（小昭·妹 → 小昭妹）────────────────────
function speakName(n) {
    return String(n || '').replace(/·/g, '');
}

// ── fact → 解说词（只挑关键节点；返回 null = 不播）──────────────────
// 优先级：2=胜负/击杀（可打断低优先级） 1=carry/掉落 0=回合开始（仅话痨模式）
function factToSpeech(fact) {
    if (!fact || !fact.factType) return null;
    const d = fact.data || {};
    switch (fact.factType) {
        case FACT_TYPES.ATTACK: {
            const r = d.dmgResult || {};
            if (r.dead || r.executeKill) {
                const a = speakName(d.attacker && d.attacker.name);
                const t = speakName(d.target && d.target.name);
                if (a && t) return { text: `${a}，击杀了${t}`, p: 2 };
            }
            return null;
        }
        case FACT_TYPES.WARRIOR_EXECUTE: {
            const a = speakName(d.unitName), t = speakName(d.targetName);
            if (a && t) return { text: `战士斩杀！${a}，直接处决了${t}`, p: 2 };
            return null;
        }
        case FACT_TYPES.CARRY_APPLY: {
            const n = speakName(d.unitName);
            if (n) return { text: `${n}获得carry加成，攻防大涨`, p: 1 };
            return null;
        }
        case FACT_TYPES.DROP: {
            if (d.kind === 'token') return { text: `圣火令掉落，${speakName(d.killerName)}拾取`, p: 1 };
            if (d.kind === 'chest') return { text: `宝箱掉落，${speakName(d.killerName)}拾取`, p: 1 };
            return null;
        }
        case FACT_TYPES.ROUND_START: {
            if (!cfg.chatty || !d.round) return null;
            return { text: `第${d.round}回合`, p: 0 };
        }
        default:
            return null;
    }
}

// ── 播报队列（浏览器 TTS 自带队列，这里管优先级打断与丢弃）───────────
const MAX_QUEUE = 4;
const queue = [];
let speaking = false;
let ducked = false;

function bgmAudible() {
    return AudioManager.enabled && AudioManager.currentSource !== 'mute';
}
function duckBGM(on) {
    if (on === ducked) return;
    ducked = on;
    if (!bgmAudible()) return;
    let base = 0.5;
    try { base = parseFloat(localStorage.getItem('ming_bgm_volume') || '0.5'); } catch (e) { /* 用默认 */ }
    AudioManager.fadeTo(on ? base * 0.3 : base, on ? 250 : 600);
}

function pump() {
    if (speaking || !queue.length) {
        if (!speaking && ducked) duckBGM(false);   // 队列清空，音乐回位
        return;
    }
    const item = queue.shift();
    speaking = true;
    duckBGM(true);
    const u = new SpeechSynthesisUtterance(item.text);
    u.lang = 'zh-CN';
    u.rate = cfg.rate;
    u.pitch = cfg.pitch;
    if (cfg.voiceURI) {
        const v = voicesCache.find(x => x.voiceURI === cfg.voiceURI);
        if (v) { u.voice = v; u.lang = v.lang; }
    }
    const done = () => { speaking = false; duckBGM(false); setTimeout(pump, 120); };
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
}

function enqueue(text, p) {
    // 队满：从低优先级开始丢，胜负/击杀永不丢
    if (queue.length >= MAX_QUEUE) {
        const dropIdx = queue.findIndex(x => x.p < p);
        if (dropIdx === -1) return;             // 全是同级以上：这条不要了
        queue.splice(dropIdx, 1);
    }
    queue.push({ text, p });
    // 高优先级打断正在念的低优先级（回合播报给击杀让路）
    if (p >= 2 && speaking) speechSynthesis.cancel();
    pump();
}

// 快进/暂停不说话——表现层惯例，与 fx 同口径
function mutedNow() {
    if (!cfg.on) return true;
    if (GlobalStore.get('fastForwardActive')) return true;
    if (GlobalStore.get('isPaused')) return true;
    return false;
}

// ── 对外播报口（player/42 逐条日志收尾时调用；防剧透铁律：动画播完才开口）──
let _lastFactRef = null;   // 一个 fact 可能拆多条日志播（引用相同），去重防复读
export function speakFact(fact) {
    if (mutedNow()) return;
    if (fact === _lastFactRef) return;
    _lastFactRef = fact;
    const s = factToSpeech(fact);
    if (s) enqueue(s.text, s.p);
}

// 胜负收口播报（finishBattle 一处调用，单机/联机/回放共用）
export function speakVictory(winner) {
    if (!cfg.on) return;
    queue.length = 0;
    speechSynthesis.cancel();
    let text;
    if (winner === '明教' || winner === '六大派') text = `${winner}获得最终胜利！`;
    else text = '双方战平，不分胜负。';
    enqueue(text, 2);
}

export function stopCommentary() {
    queue.length = 0;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    speaking = false;
    duckBGM(false);
}

// 面板试听用（用户手势触发，顺便解锁 iOS 类浏览器的 TTS 权限）
export function speakTest(text) {
    if (!('speechSynthesis' in window)) return false;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text || '第五回合，宗维侠击杀明教岳山，明教只剩三人。');
    u.lang = 'zh-CN';
    u.rate = cfg.rate;
    u.pitch = cfg.pitch;
    if (cfg.voiceURI) {
        const v = voicesCache.find(x => x.voiceURI === cfg.voiceURI);
        if (v) { u.voice = v; u.lang = v.lang; }
    }
    speechSynthesis.speak(u);
    return true;
}

// 环境自检（无可用的 speechSynthesis 时只警告一次）
export function ttsAvailable() {
    const ok = 'speechSynthesis' in window;
    if (!ok && !warnedNoTTS) {
        warnedNoTTS = true;
        console.warn('[voice-commentary] 此浏览器不支持 speechSynthesis，解说不可用');
    }
    return ok;
}
