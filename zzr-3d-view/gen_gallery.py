"""把周芷若 5 个 GLB 全嵌进一个 HTML：点开就能转，点名字切换。免费离线，无任何外链。"""
import base64, os

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = [("zzr", "白衣 89"), ("zzrws", "周芷若 87"), ("zzrjc", "比基尼长剑 87"),
          ("zzr_dark", "黑化 86"), ("zzr_hf", "双剑 85")]

parts = []
for key, _ in MODELS:
    b64 = base64.b64encode(open(f"{HERE}/{key}.glb", "rb").read()).decode()
    parts.append('"%s":"data:model/gltf-binary;base64,%s"' % (key, b64))
js = "var M={%s};" % ",".join(parts)

btns = "".join('<button data-k="%s" class="%s">%s</button>'
               % (k, "on" if i == 0 else "", lab)
               for i, (k, lab) in enumerate(MODELS))

tpl = """<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<title>周芷若 3D 全集</title>
<script type="module" src="https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js"></script>
<style>
  html,body{margin:0;height:100%;background:#0f172a;font-family:sans-serif;overflow:hidden;}
  #bar{position:fixed;left:0;right:0;top:0;z-index:9;display:flex;gap:8px;flex-wrap:wrap;
       padding:10px 12px;background:rgba(15,23,42,.85);}
  #bar button{background:#1e293b;color:#e5e7eb;border:1px solid #334155;border-radius:999px;
       padding:7px 14px;font-size:14px;cursor:pointer;}
  #bar button.on{background:#fbbf24;color:#111827;border-color:#fbbf24;font-weight:600;}
  model-viewer{width:100vw;height:100vh;--poster-color:transparent;}
  #tip{position:fixed;left:14px;bottom:14px;color:#94a3b8;font-size:13px;}
</style>
</head>
<body>
<div id="bar">__BTN__</div>
<model-viewer id="mv" camera-controls auto-rotate rotation-per-second="18deg"
  shadow-intensity="1" exposure="1.05" environment-image="neutral"></model-viewer>
<div id="tip">拖拽旋转 · 滚轮缩放 · 点上面名字切换模型</div>
<script>
__JS__
var mv=document.getElementById('mv');
mv.src=M['zzr'];
var btns=document.querySelectorAll('#bar button');
btns.forEach(function(b){
  b.onclick=function(){
    btns.forEach(function(x){x.classList.remove('on');});
    b.classList.add('on');
    mv.src=M[b.dataset.k];
  };
});
</script>
</body>
</html>
"""

out = f"{HERE}/周芷若3D全集.html"
open(out, "w", encoding="utf-8").write(tpl.replace("__JS__", js).replace("__BTN__", btns))
print("wrote", out, "bytes:", os.path.getsize(out))
