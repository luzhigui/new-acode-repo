// 临时升级脚本：把各文件当前版本号 V5.x.y -> V6.0.0，保留历史 changelog
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = '/workspace';
const EXCLUDE_DIRS = /node_modules|\.git|web[\/\\]|文件汇总20260730/;

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (EXCLUDE_DIRS.test(name)) continue;
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) walk(p, out);
        else if (/\.(js|mjs|cjs)$/.test(name)) out.push(p);
    }
    return out;
}

const files = walk(root);
const report = [];
let totalReplaced = 0;

for (const fp of files) {
    const src = readFileSync(fp, 'utf8');
    const lines = src.split('\n');
    const verIdx = lines.findIndex(l => l.includes('export const VER'));
    let curVer = null;
    let replaced = 0;
    if (verIdx >= 0) {
        const m = lines[verIdx].match(/V5\.\d+\.\d+/);
        if (!m) continue;
        curVer = m[0];
        for (let i = 0; i < Math.min(20, lines.length); i++) {
            if (lines[i].includes(curVer)) {
                const n = lines[i].split(curVer).length - 1;
                lines[i] = lines[i].split(curVer).join('V6.0.0');
                replaced += n;
            }
        }
        // 确保 VER 行本身（可能在 20 行之后）也被处理
        if (lines[verIdx].includes(curVer)) {
            const n = lines[verIdx].split(curVer).length - 1;
            lines[verIdx] = lines[verIdx].split(curVer).join('V6.0.0');
            replaced += n;
        }
        for (let i = 20; i < lines.length; i++) {
            if (lines[i].includes('✅') && /V5\.\d+\.\d+/.test(lines[i])) {
                const n = (lines[i].match(/V5\.\d+\.\d+/g) || []).length;
                lines[i] = lines[i].replace(/V5\.\d+\.\d+/g, 'V6.0.0');
                replaced += n;
            }
        }
    } else {
        continue;
    }
    if (replaced > 0) {
        writeFileSync(fp, lines.join('\n'));
        totalReplaced += replaced;
        report.push(`${fp.replace(root + '/', '')}: ${curVer} -> V6.0.0 (${replaced}处)`);
    }
}

console.log('=== JS 升级报告 ===');
report.forEach(r => console.log(r));
console.log(`\n共替换 ${totalReplaced} 处，文件数 ${report.length}`);