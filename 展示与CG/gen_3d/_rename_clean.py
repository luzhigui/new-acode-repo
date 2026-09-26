import os, glob
from PIL import Image, ImageFilter

D = r"D:/003 5V5 only one rukou 20260628/003 github newsest 20260628/new-acode-repo/展示与CG/gen_3d/立绘"

# (匹配子串, 目标文件名)
mapping = [
    ("角色张三丰", "张三丰-武当宗师-立绘-v1.png"),
    ("角色鹿杖客", "鹿杖客-玄冥二老-立绘-v1.png"),
    ("角色鹤笔翁", "鹤笔翁-玄冥二老-立绘-v1.png"),
    ("角色成昆",   "成昆-圆真-立绘-v1.png"),
    ("周芷若_绝美少女", "周芷若-薄纱侧高开衩-大尺度性感-v1.png"),
    ("周芷若黑化版",   "周芷若-黑金深V露背-大尺度性感-v1.png"),
    ("周芷若_水雾薄纱", "周芷若-水雾湿身纱-大尺度性感-v1.png"),
]

def find(sub):
    for f in glob.glob(os.path.join(D, "*.png")):
        if sub in os.path.basename(f):
            return f
    return None

renamed = []
for sub, dst in mapping:
    src = find(sub)
    if not src:
        print("MISS", sub); continue
    out = os.path.join(D, dst)
    if os.path.abspath(src) != os.path.abspath(out):
        os.rename(src, out)
    renamed.append(out)
    print("OK", dst, os.path.getsize(out)//1024, "KB")

# ---- 清洗张三丰右下角水印 (feathered fill from row above) ----
zf = os.path.join(D, "张三丰-武当宗师-立绘-v1.png")
im = Image.open(zf).convert("RGB")
W, H = im.size
x0, y0 = W-220, H-80          # 水印所在右下区域
crop = im.crop((x0, y0, W, H))
above = im.crop((x0, y0-1, W, y0)).resize((W-x0, 1))  # 正上方一行
patch = above.resize((W-x0, H-y0))                      # 向下平铺
feather = int((H-y0)*0.35)
mask = Image.new("L", (W-x0, H-y0), 0)
for yy in range(feather):
    mask.putpixel((0, yy), int(255*(1-yy/feather)))  # 顶部羽化
mask = mask.filter(ImageFilter.GaussianBlur(3))
im.paste(patch, (x0, y0), mask)
zf2 = os.path.join(D, "张三丰-武当宗师-立绘-v1.png")
im.save(zf2)
print("CLEANED 张三丰 ->", os.path.getsize(zf2)//1024, "KB")
