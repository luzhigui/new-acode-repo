"""把 zzr.glb 嵌成自包含 HTML（model-viewer），浏览器直接可转。免费本地版，无任何付费引导。"""
import base64, os
HERE = os.path.dirname(os.path.abspath(__file__))
glb = open(f"{HERE}/zzr.glb", "rb").read()
b64 = base64.b64encode(glb).decode()
html = f"""<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<title>周芷若 · 白衣 3D</title>
<script type="module" src="https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js"></script>
<style>
  html,body{{margin:0;height:100%;background:#0f172a;font-family:sans-serif;}}
  model-viewer{{width:100vw;height:100vh;--poster-color:transparent;}}
  #hud{{position:fixed;left:14px;top:12px;color:#e5e7eb;background:rgba(0,0,0,.45);
        padding:8px 12px;border-radius:10px;font-size:14px;line-height:1.5;}}
  #hud b{{color:#fbbf24;}}
  #hud span{{color:#86efac;}}
</style>
</head>
<body>
<div id="hud"><b>周芷若 · 白衣</b>（部署站 GLB，评分 89）<br><span>本地文件 · 免费 · 无需账号</span><br>拖拽旋转 · 滚轮缩放 · 双指可转</div>
<model-viewer src="data:model/gltf-binary;base64,{b64}"
  camera-controls auto-rotate rotation-per-second="18deg"
  shadow-intensity="1" exposure="1.05" environment-image="neutral"
  min-camera-orbit="auto 60deg auto" max-camera-orbit="auto 120deg auto"></model-viewer>
</body>
</html>
"""
out = f"{HERE}/周芷若-白衣3D.html"
open(out, "w", encoding="utf-8").write(html)
print("wrote", out, "bytes:", os.path.getsize(out))
