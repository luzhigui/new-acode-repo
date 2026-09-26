import os, glob
from PIL import Image, ImageFilter

src_dir = "D:/003 5V5 only one rukou 20260628/003 github newsest 20260628/new-acode-repo/展示与CG/gen_3d/立绘"

# (含通配的来源名片段, 目标名)
pairs = [
    ("倚天屠龙记周芷若_写实摄影风格_水雾湿身薄纱写真_清晨暖色窗", "周芷若-湿身写实暖窗美人痣-v1.png"),
    ("倚天屠龙记周芷若_写实摄影风格_水汽氤氲的汤泉湿身写真_冷调",   "周芷若-湿身写实汤泉冷月-v1.png"),
    ("倚天屠龙记周芷若_写实摄影风格_雨后湿身薄纱_逆光水汽_半透",     "周芷若-湿身写实雨后逆光-v1.png"),
    ("倚天屠龙记周芷若_写实摄影棚拍_湿丝绸薄纱裹身_柔光_湿纱半",     "周芷若-湿身写实棚拍柔光-v1.png"),
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
