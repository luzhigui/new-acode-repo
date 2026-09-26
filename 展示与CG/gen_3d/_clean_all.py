# -*- coding: utf-8 -*-
import os
from PIL import Image, ImageFilter

D = r"D:/003 5V5 only one rukou 20260628/003 github newsest 20260628/new-acode-repo/展示与CG/gen_3d/立绘"

files = [
    "张三丰-武当宗师-立绘-v1.png",
    "鹿杖客-玄冥二老-立绘-v1.png",
    "鹤笔翁-玄冥二老-立绘-v1.png",
    "成昆-圆真-立绘-v1.png",
    "周芷若-薄纱侧高开衩-大尺度性感-v1.png",
    "周芷若-黑金深V露背-大尺度性感-v1.png",
    "周芷若-水雾湿身纱-大尺度性感-v1.png",
]

for name in files:
    p = os.path.join(D, name)
    if not os.path.exists(p):
        print("MISS", name); continue
    im = Image.open(p).convert("RGB")
    W, H = im.size
    x0, y0 = W-200, H-70
    above = im.crop((x0, y0-1, W, y0)).resize((W-x0, 1))
    patch = above.resize((W-x0, H-y0))
    feather = int((H-y0)*0.4)
    mask = Image.new("L", (W-x0, H-y0), 0)
    for yy in range(feather):
        mask.putpixel((0, yy), int(255*(1-yy/feather)))
    mask = mask.filter(ImageFilter.GaussianBlur(3))
    im.paste(patch, (x0, y0), mask)
    im.save(p)
    print("CLEANED", name, os.path.getsize(p)//1024, "KB")
