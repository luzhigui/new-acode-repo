# -*- coding: utf-8 -*-
"""构建 _publish/ ：手机友好的在线画廊（内置 draco 解码器，不依赖外部 CDN）"""
import os, shutil, glob
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "_publish")
MODELS_DIR = os.path.join(OUT, "models")
IMG_DIR = os.path.join(OUT, "img")
DRACO_DIR = os.path.join(OUT, "draco")
os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(IMG_DIR, exist_ok=True)
os.makedirs(DRACO_DIR, exist_ok=True)

# 1) 查看器：把默认的 gstatic 解码器路径改成本地 ./draco/
CDN = "https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
with open(os.path.join(BASE, "model-viewer.min.js"), "r", encoding="utf-8") as f:
    mv = f.read()
patched = mv.replace(CDN, "./draco/")
if "./draco/" not in patched:
    raise SystemExit("!! model-viewer.min.js 中未找到 CDN 常量，请检查")
with open(os.path.join(OUT, "model-viewer.min.js"), "w", encoding="utf-8") as f:
    f.write(patched)
print("[mv] patched -> %s" % os.path.join(OUT, "model-viewer.min.js"))

# 2) 模型：复制 12 个压缩版 + 各自的官方预览图当 poster
MODELS = [
    ("张无忌",      "zw",    "zw_web.glb",        "zw_preview.png"),
    ("韦一笑",      "wy",    "wy_web.glb",        "wy_preview.png"),
    ("小昭·姊",     "xz",    "xz_web.glb",        "xz_preview.png"),
    ("小昭·妹",     "xm",    "xm_web.glb",        "xm_preview.png"),
    ("谢逊",        "xx",    "xx_web.glb",        "xx_preview.png"),
    ("周芷若·露肩", "zzr",   "zzr_web.glb",       "zzr_preview.png"),
    ("周芷若·黑化", "zzr",   "zzr_dark_web.glb",  "zzr_dark_preview.png"),
    ("宋青书",      "sqs",   "sqs_web.glb",       "sqs_preview.png"),
    ("宋远桥",      "syq",   "syq_web.glb",       "syq_preview.png"),
    ("灭绝师太",    "mjs",   "mjs_web.glb",       "mjs_preview.png"),
    ("张三丰",      "zf",    "zf_web.glb",        "zf_preview.png"),
    ("周芷若·湿身纱", "zzrws", "zzrws_web.glb",    "zzrws_preview.png"),
]
model_cards = []
for label, d, glb, prev in MODELS:
    src_glb = os.path.join(BASE, d, glb)
    if not os.path.exists(src_glb):
        print("WARN 缺模型:", src_glb); continue
    key = glb.replace("_web.glb", "")
    shutil.copy2(src_glb, os.path.join(MODELS_DIR, key + ".glb"))
    src_prev = os.path.join(BASE, d, prev)
    poster = ""
    if os.path.exists(src_prev):
        shutil.copy2(src_prev, os.path.join(MODELS_DIR, key + ".png"))
        poster = ' poster="models/%s.png"' % key
    model_cards.append(
        '  <div class="card"><h2>%s<small>%s</small></h2>'
        '<model-viewer src="models/%s.glb"%s camera-controls auto-rotate '
        'shadow-intensity="1" exposure="1" loading="lazy" '
        'alt="%s"></model-viewer></div>' % (label, glb, key, poster, label)
    )
print("[models] %d 个" % len(model_cards))

# 3) 立绘：等比缩到宽 1000px 存 JPEG，控制手机流量
imgs = sorted(glob.glob(os.path.join(BASE, "立绘", "*.png")))
img_items = []
for i, src in enumerate(imgs, 1):
    name = os.path.splitext(os.path.basename(src))[0]
    dst = os.path.join(IMG_DIR, "%02d.jpg" % i)
    im = Image.open(src).convert("RGB")
    w, h = im.size
    W = 1000
    if w > W:
        im = im.resize((W, int(h * W / w)), Image.LANCZOS)
    im.save(dst, "JPEG", quality=82, optimize=True)
    img_items.append(
        '  <div class="it"><a href="img/%02d.jpg" target="_blank" rel="noopener">'
        '<img src="img/%02d.jpg" loading="lazy" alt="%s"></a><div class="ph">%s</div></div>'
        % (i, i, name, name)
    )
print("[imgs] %d 张" % len(img_items))

HTML = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0f1116">
<title>光明顶 · 精英形象展</title>
<style>
  :root{--bg:#0f1116;--card:#191c23;--fg:#e8eaf0;--sub:#9aa3b2;--accent:#d4af6a}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);
       font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
       -webkit-font-smoothing:antialiased}
  header{padding:16px 14px 6px}
  h1{margin:0;font-size:19px;letter-spacing:.5px}
  header p{margin:6px 0 0;font-size:12px;color:var(--sub);line-height:1.6}
  .sec{padding:16px 14px 4px;font-size:13px;color:var(--accent);font-weight:600;letter-spacing:1px}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;padding:8px 12px}
  @media(min-width:760px){.grid{grid-template-columns:repeat(3,1fr)}}
  .card{background:var(--card);border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.35)}
  .card h2{margin:0;padding:8px 10px;font-size:13px;background:rgba(255,255,255,.04);
       border-bottom:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between;
       align-items:center;gap:6px}
  .card h2 small{font-weight:400;color:var(--sub);font-size:10px}
  model-viewer{width:100%;height:46vh;background:#141720;--poster-color:#141720}
  .it{background:var(--card);border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.35)}
  .it a{display:block;line-height:0}
  .it img{width:100%;height:auto;display:block;background:#141720}
  .ph{padding:8px 9px;font-size:11px;color:var(--sub);line-height:1.3;word-break:break-all}
  footer{padding:16px 14px 24px;font-size:11px;color:var(--sub);text-align:center;line-height:1.6}
</style>
</head>
<body>
<header>
  <h1>光明顶 · 精英形象展</h1>
  <p>共 __NIMG__ 张角色立绘、__NMDL__ 个 3D 模型。3D 卡片可单指旋转、双指缩放；解码器已打包进本站，不依赖外部网络。</p>
</header>
<div class="sec">角色立绘（点击查看大图）</div>
<div class="grid">
__IMGS__
</div>
<div class="sec">3D 模型（拖拽旋转 / 双指缩放）</div>
<div class="grid">
__MODELS__
</div>
<footer>光明顶 5v5 · 2026-09-26 生成</footer>
<script type="module" src="./model-viewer.min.js"></script>
</body>
</html>
"""

html = (HTML.replace("__IMGS__", "\n".join(img_items))
            .replace("__MODELS__", "\n".join(model_cards))
            .replace("__NIMG__", str(len(img_items)))
            .replace("__NMDL__", str(len(model_cards))))
with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8") as f:
    f.write(html)

total = sum(os.path.getsize(os.path.join(r, fl))
            for r, _, fs in os.walk(OUT) for fl in fs)
print("[out] %s  总大小 %.1f MB" % (OUT, total / 1e6))
