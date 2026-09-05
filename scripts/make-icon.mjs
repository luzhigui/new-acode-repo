// make-icon.mjs — 从 source 图标生成 Capacitor 所需的 1024x1024 正方形 PNG
// 居中裁剪：宽图取中间方形区域
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'assets', 'icon-source.webp');
const outDir = join(root, 'resources');
const out = join(outDir, 'icon.png');

const SIZE = 1024;

try {
    const img = sharp(readFileSync(src));
    const meta = await img.metadata();
    const w = meta.width, h = meta.height;

    // 居中正方形裁剪：边长 = 短边
    const side = Math.min(w, h);
    const left = Math.floor((w - side) / 2);
    const top = Math.floor((h - side) / 2);

    mkdirSync(outDir, { recursive: true });
    await sharp(readFileSync(src))
        .extract({ left, top, width: side, height: side })
        .resize(SIZE, SIZE, { fit: 'fill' })
        .png()
        .toFile(out);

    console.log(`[make-icon] ${w}x${h} → 居中裁剪 ${side}x${side} → ${out} (${SIZE}x${SIZE})`);
} catch (e) {
    console.error('[make-icon] 失败:', e.message);
    process.exit(1);
}
