// scripts/set-version.mjs - CI 构建前写入递增版本号
// 作用：android/ 不入库，每次 CI 都从零生成工程，versionCode 固定为 1，
//       导致新包无法覆盖安装旧包。此脚本用秒级时间戳重写 gradle 版本。
import { readFileSync, writeFileSync } from 'node:fs';

const GRADLE = 'android/app/build.gradle';
const verCode = Math.floor(Date.now() / 1000); // 秒级时间戳，单调递增，保证覆盖安装判定通过
const d = new Date();
const pad = (n) => String(n).padStart(2, '0');
const verName = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}.${pad(d.getHours())}${pad(d.getMinutes())}`;

let g = readFileSync(GRADLE, 'utf8');
g = g.replace(/(versionCode\s*=?\s*)\d+/, `$1${verCode}`);
g = g.replace(/(versionName\s*=?\s*)"[^"]*"/, `$1"${verName}"`);
writeFileSync(GRADLE, g);
console.log(`版本已写入: versionCode=${verCode} versionName=${verName}`);