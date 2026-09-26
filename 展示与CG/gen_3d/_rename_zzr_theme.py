import os, glob
from PIL import Image, ImageFilter

src_dir = "D:/003 5V5 only one rukou 20260628/003 github newsest 20260628/new-acode-repo/展示与CG/gen_3d/立绘"

pairs = [
    ("倚天屠龙记周芷若_现代海滩写真_写实摄影_夕阳金色海面_身穿", "周芷若-海滩踏浪泳装-夕阳回眸-v1.png"),
    ("倚天屠龙记周芷若_海边游泳_写实摄影_身穿贴身竞技风泳装在清",   "周芷若-海边游泳竞技泳装-v1.png"),
    ("倚天屠龙记周芷若_热带海滩侧卧写真_写实摄影_身穿浅色优雅泳",   "周芷若-海滩侧卧泳装-v1.png"),
    ("倚天屠龙记周芷若_现代高定时装大片_写实摄影_身穿设计师款高",   "周芷若-高定时装回眸杂志-v1.png"),
    ("倚天屠龙记周芷若_现代都市街拍时装写真_写实摄影_身穿时髦修",   "周芷若-都市街拍回眸-v1.png"),
    ("倚天屠龙记周芷若_汉服_cosplay_人像摄影_写实摄影风",           "周芷若-汉服cosplay武姿-v1.png"),
]

for frag, dst_name in pairs:
    matches = glob.glob(os.path.join(src_dir, frag + "*"))
    if not matches:
        print("MISS", frag); continue
    src = matches[0]
    dst = os.path.join(src_dir, dst_name)
    im = Image.open(src).convert("RGB")
    W, H = im.size
    mh, mw = 60, 130
    x0, y0 = W - mw, H - mh
    band = im.crop((x0, y0 - mh, x0 + mw, y0)).filter(ImageFilter.GaussianBlur(3))
    im.paste(band, (x0, y0))
    im.save(dst, quality=95)
    os.remove(src)
    print("saved", dst_name, "size=%.2f MB" % (os.path.getsize(dst)/1e6))
