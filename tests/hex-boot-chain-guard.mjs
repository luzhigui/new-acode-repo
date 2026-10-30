// V1.0.0 | 2026-10-31 夜间第 162 轮：海克斯分库「迁出 200 → 201」的启动链守门（新增）
//   由来：上游把 content/200game-data.json 里的小昭.hexEnhance 整段迁到新文件 content/201hex-enhance.json，
//   并把 core/01config-5v5-test.js 的 getSkillParams('小昭','hexEnhance') 改成「只认 201、缺段即抛、不允许回落」。
//   但迁出时**没有任何体检脚本（tests/）跟着补 loadHexEnhanceData()** —— 一夜之间 25 项体检里 16 项
//   以同一个 Error 崩掉（规则回放 / 胜负基线 / 账本对照 / fact 普查 / golden / fuzz …），而红因全都写成
//   「201hex-enhance.json 缺 sister 段」，看上去像数据文件丢了，实际是**启动链没跟上迁移**。
//   ★ 本件防的就是这一类病：数据换了家，消费方没换钥匙，且没有任何一条红线会点名这件事。
//   三段取证：
//     ⓪ 数据面（离线读文件）：201 存在且可解析、sister/brother 两段都在且键数不低于棘轮下限、
//        200 已不再留 hexEnhance 副本（双份真值 = 漂移温床，迁移必须净）；
//     ① 启动链（静态点名）：tests/ 与 ui/、tools/ 里「自己加载 gameData 且消费 hexEnhance/战局」的
//        文件，必须成对出现 loadHexEnhanceData —— 缺一个即逐条点名（不许整体豁免）；
//     ② 运行期实证（垫 fetch shim 真加载一次）：getSkillParams('小昭','hexEnhance') 不再抛错且返回非空、
//        getSisterHexEnhance / getBrotherHexEnhance 各取到一段 —— 证明数据真的接上了，不是"文件在硬盘上"就算数。
//   口径：只点名不放宽 —— 本件不替任何体检项改判据、不改任何基线；它只回答"启动链有没有跟上迁移"。
export const VER = 'tests/hex-boot-chain-guard.mjs V1.0.0';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// 棘轮下限：sister/brother 两段各自的键数，只许升不许降（迁移后首次实测值，见正文）
const MIN_SISTER_KEYS = 12;
const MIN_BROTHER_KEYS = 9;

// ① 判定「这个消费方需要 201」的语料特征（任中一条即需要）
const NEED_MARKERS = ['getSkillParams', 'getSisterHexEnhance', 'getBrokerHexEnhance', 'getBrotherHexEnhance', 'initBattleTeams', 'createRoundStepper'];

const problems = [];
const notes = [];

function walk(dir, out) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name === 'node_modules' || ent.name === '.mut' || ent.name === '.git') continue;
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p, out);
        else if (/\.(mjs|js|html)$/.test(ent.name)) out.push(p);
    }
    return out;
}

// ── ⓪ 数据面 ───────────────────────────────────────────────────────────
const P201 = path.join(root, 'content/201hex-enhance.json');
const P200 = path.join(root, 'content/200game-data.json');
let hex = null;
if (!fs.existsSync(P201)) {
    problems.push('⓪ content/201hex-enhance.json 不存在 —— 小昭.hexEnhance 已迁出 200，这份文件是唯一真值，丢了游戏起不来');
} else {
    try {
        hex = JSON.parse(fs.readFileSync(P201, 'utf8'));
    } catch (e) {
        problems.push(`⓪ content/201hex-enhance.json 解析失败: ${e.message}`);
    }
}
if (hex) {
    const sisterKeys = Object.keys(hex.sister || {});
    const brotherKeys = Object.keys(hex.brother || {});
    if (!sisterKeys.length) problems.push('⓪ 201 缺 sister 段（或为空）—— getSkillParams(小昭,hexEnhance) 会直接抛错');
    if (!brotherKeys.length) problems.push('⓪ 201 缺 brother 段（或为空）—— 妹永久海克斯全线回落普通版');
    if (sisterKeys.length && sisterKeys.length < MIN_SISTER_KEYS) problems.push(`⓪ sister 段键数 ${sisterKeys.length} < 棘轮下限 ${MIN_SISTER_KEYS}（只许升不许降）`);
    if (brotherKeys.length && brotherKeys.length < MIN_BROTHER_KEYS) problems.push(`⓪ brother 段键数 ${brotherKeys.length} < 棘轮下限 ${MIN_BROTHER_KEYS}（只许升不许降）`);
    notes.push(`⓪ 201 段键数：sister ${sisterKeys.length} / brother ${brotherKeys.length}（下限 ${MIN_SISTER_KEYS} / ${MIN_BROTHER_KEYS}）`);
}
try {
    const g200 = JSON.parse(fs.readFileSync(P200, 'utf8'));
    if (Object.prototype.hasOwnProperty.call(g200, 'hexEnhance')) {
        problems.push('⓪ content/200game-data.json 仍留着 hexEnhance 副本 —— 迁移必须净，两份真值必然漂移');
    } else {
        notes.push('⓪ 200 已无 hexEnhance 副本（迁移干净，201 是唯一真值）');
    }
} catch (e) {
    problems.push(`⓪ content/200game-data.json 解析失败: ${e.message}`);
}

// ── ① 启动链静态点名 ────────────────────────────────────────────────────
const scanDirs = [path.join(root, 'tests'), path.join(root, 'ui'), path.join(root, 'tools')];
const gaps = [];
let scanned = 0;
for (const d of scanDirs) {
    if (!fs.existsSync(d)) continue;
    for (const f of walk(d, [])) {
        const src = fs.readFileSync(f, 'utf8');
        // 剥注释前先粗判：文件得自己加载 gameData（否则数据由宿主给，本条不适用）
        if (!/loadGameData\s*\(/.test(src)) continue;
        if (!NEED_MARKERS.some(m => src.includes(m))) continue; // 只读 getGameData 的（157/170 那类）不消费 hex，豁免
        scanned += 1;
        if (!/loadHexEnhanceData/.test(src)) gaps.push(path.relative(root, f));
    }
}
if (gaps.length) {
    problems.push(`① 启动链缺口 ${gaps.length} 处（有 loadGameData 且消费 hexEnhance/战局，却没有 loadHexEnhanceData）: ${gaps.join(' / ')}`);
} else {
    notes.push(`① 启动链成对，扫描 ${scanned} 个消费方，缺口 0`);
}

// ── ② 运行期实证 ────────────────────────────────────────────────────────
globalThis.fetch = async (url) => {
    const p = fileURLToPath(new URL(url));
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) };
};
const cfg = await import('../core/01config-5v5-test.js');
await cfg.loadGameData();
await cfg.loadHexEnhanceData();
try {
    const sister = cfg.getSkillParams('小昭', 'hexEnhance');
    if (!sister || typeof sister !== 'object' || !Object.keys(sister).length) problems.push('② getSkillParams(小昭,hexEnhance) 返回空 —— 201 没真正接上');
    else notes.push(`② 运行期实证：sister 段 ${Object.keys(sister).length} 键可取`);
} catch (e) {
    problems.push(`② getSkillParams(小昭,hexEnhance) 抛错（启动链没跟上迁移）: ${e.message}`);
}
if (!cfg.getSisterHexEnhance('cloudBody')) problems.push('② getSisterHexEnhance(cloudBody) 取不到 —— 姊强化云体参数空');
if (!cfg.getBrotherHexEnhance('cloudBody')) problems.push('② getBrotherHexEnhance(cloudBody) 取不到 —— 妹永久云体参数空');

// ── 结论 ────────────────────────────────────────────────────────────────
for (const n of notes) console.log('  · ' + n);
if (problems.length) {
    console.log(`\n❌ 海克斯分库启动链守门失败：${problems.length} 条`);
    for (const p of problems) console.log('  ❌ ' + p);
    process.exit(1);
}
console.log('\n✅ 海克斯分库启动链守门通过：数据面净、启动链成对、运行期可取');
