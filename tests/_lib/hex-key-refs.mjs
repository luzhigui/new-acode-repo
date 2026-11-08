// tests/_lib/hex-key-refs.mjs | V1.0.0 | 2026-11-08
//
// 海克斯强化「配置键 → 消费方」静态引用的**唯一来源**。
// 为什么抽它：同一套正则曾同时出现在 hex-enhance-wiring-guard（① 接线对账）与
//   hex-config-closure-check（① 死键/反向）里 —— 两份各写一次，早晚一边加了
//   「变量式访问 / BUFF_TYPES 动态派发」另一边没跟，同一份配置在两处跑出两套结论。
//
// 口径（与 guard V1.0.0 逐字一致，纯搬迁）：
//   · getSisterHexEnhance('K') / getBrotherHexEnhance('K') 显式取名
//   · getSkillParams('小昭','hexEnhance').K
//   · const P = getSkillParams('小昭','hexEnhance') → P.K（只认 baseKeys 内的键，防同名变量噪音）
//   · query('xiaoHexEnhance', …, BUFF_TYPES.X) → 经 infra/106 枚举表映射成键名
//
// 返回 { refs:{sister:{k:[文件]},brother:{…}}, problems:[…], enumMap }
import fs from 'node:fs';
import path from 'node:path';

export function scanHexKeyRefs({ root, relDirs, baseKeys }) {
    const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    const sources = [];
    const walk = (dir) => {
        if (!fs.existsSync(dir)) return;
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
            if (['node_modules', '.git', '.tmp', '.mut'].includes(ent.name)) continue;
            const p = path.join(dir, ent.name);
            if (ent.isDirectory()) walk(p);
            else if (/\.(js|mjs)$/.test(ent.name)) sources.push(p);
        }
    };
    for (const d of relDirs) walk(path.join(root, d));

    // BUFF_TYPES 枚举名 → 值（动态派发也算消费）
    const enumMap = {};
    try {
        const src = fs.readFileSync(path.join(root, 'infra', '106-battle-enums.js'), 'utf8');
        const mm = src.match(/export const BUFF_TYPES\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/);
        if (mm) for (const m of mm[1].matchAll(/([A-Z_]+)\s*:\s*'([^']+)'/g)) enumMap[m[1]] = m[2];
    } catch (e) { /* 枚举文件缺失由其他规则点名 */ }

    const refs = { sister: {}, brother: {} };
    const problems = [];
    const addRef = (section, key, where) => {
        if (!key) return;
        if (!refs[section][key]) refs[section][key] = [];
        refs[section][key].push(where);
    };
    for (const f of sources) {
        const rel = path.relative(root, f).replace(/\\/g, '/');
        const src = stripComments(fs.readFileSync(f, 'utf8'));
        for (const m of src.matchAll(/getSisterHexEnhance\s*\(\s*'([A-Za-z0-9_]+)'/g)) addRef('sister', m[1], rel);
        for (const m of src.matchAll(/getBrotherHexEnhance\s*\(\s*'([A-Za-z0-9_]+)'/g)) addRef('brother', m[1], rel);
        for (const m of src.matchAll(/getSkillParams\s*\(\s*'小昭'\s*,\s*'hexEnhance'\s*\)\s*[?.]*\.\s*([A-Za-z_$][\w$]*)/g)) {
            addRef('sister', m[1], rel);
        }
        for (const m of src.matchAll(/([A-Za-z_$][\w$]*)\s*=\s*getSkillParams\s*\(\s*'小昭'\s*,\s*'hexEnhance'\s*\)/g)) {
            const varName = m[1];
            const re = new RegExp(varName.replace(/[$]/g, '\\$&') + '\\s*[?.]*\\.\\s*([A-Za-z_$][\\w$]*)', 'g');
            for (const k of src.matchAll(re)) if (baseKeys.indexOf(k[1]) >= 0) addRef('sister', k[1], rel);
        }
        for (const m of src.matchAll(/query\s*\(\s*'xiaoHexEnhance'[\s\S]{0,240}?BUFF_TYPES\.([A-Z_]+)/g)) {
            const v = enumMap[m[1]];
            if (v) addRef('sister', v, rel);
            else problems.push('① ' + rel + ' 传了未登记的 BUFF_TYPES.' + m[1] + '（无法对账海克斯键）');
        }
    }
    return { refs, problems, enumMap, sources };
}
