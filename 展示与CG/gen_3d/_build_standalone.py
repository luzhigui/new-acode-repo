#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""重建 gallery-standalone.html：把 model-viewer 库与所有 _web.glb 内联进单文件，双击即开。"""
import base64, os

BASE = os.path.dirname(os.path.abspath(__file__))
MV = os.path.join(BASE, "model-viewer.min.js")

with open(MV, "r", encoding="utf-8") as f:
    mv_js = f.read()

# (展示名, 目录名, 压缩版 glb 文件名)
MODELS = [
    ("张无忌",        "zw",        "zw_web.glb"),
    ("韦一笑",        "wy",        "wy_web.glb"),
    ("小昭·姊",       "xz",        "xz_web.glb"),
    ("小昭·妹",       "xm",        "xm_web.glb"),
    ("谢逊",          "xx",        "xx_web.glb"),
    ("周芷若 · 露肩", "zzr",       "zzr_web.glb"),
    ("周芷若 · 黑化", "zzr",      "zzr_dark_web.glb"),
    ("宋青书",        "sqs",       "sqs_web.glb"),
    ("宋远桥",        "syq",       "syq_web.glb"),
    ("灭绝师太",      "mjs",       "mjs_web.glb"),
    ("张三丰",        "zf",        "zf_web.glb"),
]

cards = []
for label, key, fname in MODELS:
    path = os.path.join(BASE, key, fname)
    if not os.path.exists(path):
        print("WARN 缺失:", path)
        continue
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    src = "data:model/gltf-binary;base64," + b64
    cards.append(
        '  <div class="card"><h2>%s<small>%s</small></h2>'
        '<model-viewer src="%s" camera-controls auto-rotate shadow-intensity="1" exposure="1"></model-viewer></div>'
        % (label, fname, src)
    )

HTML = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>光明顶 · 精英 3D 展示（双击版）</title>
<style>
  body { margin:0; background:#f0f0f0; font-family: system-ui,-apple-system,"Microsoft YaHei",sans-serif; }
  header { padding:14px 16px 4px; }
  header h1 { margin:0; font-size:18px; color:#222; }
  header p { margin:6px 0 0; font-size:12px; color:#666; }
  .sec { padding:10px 16px 0; font-size:13px; color:#888; font-weight:600; }
  .wrap { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; padding:12px; }
  .card { background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 1px 6px rgba(0,0,0,.12); }
  h2 { margin:0; padding:8px 10px; font-size:15px; color:#222; background:#fafafa; border-bottom:1px solid #eee;
       display:flex; justify-content:space-between; align-items:center; }
  h2 small { font-weight:normal; color:#999; font-size:11px; }
  model-viewer { width:100%; height:44vh; --poster-color:#f0f0f0; background:#f0f0f0; }
  .placeholder { height:44vh; display:flex; flex-direction:column; align-items:center; justify-content:center;
                 color:#aaa; background:repeating-linear-gradient(45deg,#fafafa,#fafafa 12px,#f2f2f2 12px,#f2f2f2 24px); }
  .placeholder b { font-size:15px; color:#888; }
  .placeholder span { font-size:12px; margin-top:6px; }
</style>
</head>
<body>
<header>
  <h1>光明顶 · 精英 3D 展示（双击版）</h1>
  <p>直接双击本文件即可查看，无需本地服务器；查看器与全部模型已内联进本文件。首次加载需联网取 Draco 解码器（浏览器会缓存）。</p>
</header>

<div class="sec">圣火单卡（GLM5.3 立绘 → 3D）</div>
<div class="wrap">
__GLM__
</div>

<div class="sec">国风立绘（ImageGen 立绘 → 图生 3D，2026-09-24 / 09-26 刷新）</div>
<div class="wrap">
__GUO__
</div>

<script type="module">
__MV__
</script>
</body>
</html>
"""

glm_cards = "\n".join(cards[:4])
guo_cards = "\n".join(cards[4:])

out = HTML.replace("__GLM__", glm_cards).replace("__GUO__", guo_cards).replace("__MV__", mv_js)
out_path = os.path.join(BASE, "gallery-standalone.html")
with open(out_path, "w", encoding="utf-8") as f:
    f.write(out)

print("WROTE", out_path, "size=%.1f MB" % (os.path.getsize(out_path) / 1e6))
