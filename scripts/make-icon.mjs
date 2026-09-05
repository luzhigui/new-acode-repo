// make-icon.mjs — 从 icon-source 生成安卓全密度图标 + Capacitor 1024 图标
// 居中裁剪：宽图取中间方形区域，再缩放各密度
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'assets', 'icon-source.webp');
const outDir = join(root, 'resources');
mkdirSync(outDir, { recursive: true });

// 安卓各密度图标尺寸（ic_launcher / ic_launcher_round）
const DENSITIES = [
    { name: 'mdpi', size: 48 },
    { name: 'hdpi', size: 72 },
    { name: 'xhdpi', size: 96 },
    { name: 'xxhdpi', size: 144 },
    { name: 'xxxhdpi', size: 192 }
];

try {
    const srcBuf = readFileSync(src);
    const meta = await sharp(srcBuf).metadata();
    const w = meta.width, h = meta.height;

    // 居中正方形裁剪：边长 = 短边
    const side = Math.min(w, h);
    const left = Math.floor((w - side) / 2);
    const top = Math.floor((h - side) / 2);
    const crop = { left, top, width: side, height: side };

    // 1) 生成各密度图标（普通 + round）
    for (const d of DENSITIES) {
        const base = sharp(srcBuf).extract(crop).resize(d.size, d.size, { fit: 'fill' });
        await base.clone().png().toFile(join(outDir, `ic_launcher_${d.name}.png`));
        await base.clone().png().toFile(join(outDir, `ic_launcher_round_${d.name}.png`));
    }

    // 2) 生成 Capacitor 1024 图标（备用/高分辨率）
    await sharp(srcBuf).extract(crop).resize(1024, 1024, { fit: 'fill' }).png().toFile(join(outDir, 'icon.png'));

    console.log(`[make-icon] ${w}x${h} → 居中裁剪 ${side}x${side} → 10 个密度图标 + icon.png 完成`);
} catch (e) {
    console.error('[make-icon] 失败:', e.message);
    process.exit(1);
}
