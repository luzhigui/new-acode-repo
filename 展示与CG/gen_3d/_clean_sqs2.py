import os, glob
from PIL import Image, ImageFilter

src_dir = "D:/003 5V5 only one rukou 20260628/003 github newsest 20260628/new-acode-repo/展示与CG/gen_3d/立绘"
src = os.path.join(src_dir, "倚天屠龙记角色宋青书_武当派第三代弟子_武当七侠宋远桥之子__2026-09-26T03-15-25.png")
dst = os.path.join(src_dir, "宋青书-武当苦练玉面-立绘-v1.png")

im = Image.open(src).convert("RGB")
W, H = im.size
# 水印在右下角，取底部 60 行、右 120 列区域，用其上方一行同宽度像素做羽化填充
mh, mw = 60, 130
x0, y0 = W - mw, H - mh
band = im.crop((x0, y0 - mh, x0 + mw, y0))          # 上方参考带
band = band.filter(ImageFilter.GaussianBlur(3))
im.paste(band, (x0, y0))
im.save(dst, quality=95)
print("saved", dst, "size=%.2f MB" % (os.path.getsize(dst)/1e6))
# 删除原始长名文件
os.remove(src)
print("removed", os.path.basename(src))
