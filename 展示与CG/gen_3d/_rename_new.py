# -*- coding: utf-8 -*-
"""把 _new/ 里本轮新生成的图按内容重命名到 立绘/，并检测右下角水印。
水印检测：右下角候选区 vs 左下角对照区，比较亮度>230 的像素占比与灰度标准差。
只检测不修改，避免盲目涂改毁图。
"""
import os, glob, shutil
from PIL import Image

SRC = r"D:/003 5V5 only one rukou 20260628/003 github newsest 20260628/new-acode-repo/展示与CG/gen_3d/_new"
DST = r"D:/003 5V5 only one rukou 20260628/003 github newsest 20260628/new-acode-repo/展示与CG/gen_3d/立绘"

# (源文件名时间戳, 目标文件名)
mapping = [
    ("16-28-20", "鹤笔翁-玄冥二老-苏版老者-立绘-v2.png"),
    ("16-29-08", "鹿杖客-玄冥二老-苏版老者-立绘-v2.png"),
    ("16-29-06", "周芷若-泳池黄昏白比基尼-大尺度-v1.png"),
    ("16-29-37", "周芷若-海边礁石黑比基尼-大尺度-v1.png"),
    ("16-29-36", "周芷若-落地窗蕾丝睡袍-大尺度-v1.png"),
    ("16-30-05", "周芷若-汤泉玫瑰雾气-大尺度-v1.png"),
    ("16-30-08", "周芷若-黑金高定深V开衩-时尚大片-v1.png"),
    ("16-30-42", "周芷若-拳馆运动汗光-性感向-v1.png"),
    ("16-30-49", "周芷若-青花旗袍高开衩-古典美-v1.png"),
    ("16-31-19", "周芷若-月光天台丝绸吊带-性感向-v1.png"),
    ("16-31-20", "周芷若-雨夜霓虹湿身街拍-性感向-v1.png"),
    ("16-32-03", "周芷若-晨光卧室真丝衬衫-性感向-v1.png"),
    ("16-32-44", "周芷若-玫瑰花瓣浴-大尺度-v1.png"),
]

def stat_region(im, box):
    g = im.convert("L").crop(box)
    px = list(g.getdata())
    n = len(px)
    bright = sum(1 for p in px if p > 230) / n
    mean = sum(px) / n
    std = (sum((p - mean) ** 2 for p in px) / n) ** 0.5
    return bright, std

moved = []
for ts, dst in mapping:
    hits = [f for f in glob.glob(os.path.join(SRC, "*.png")) if ts in os.path.basename(f)]
    if not hits:
        print("MISS", ts, dst); continue
    src = hits[0]
    out = os.path.join(DST, dst)
    shutil.copy2(src, out)
    # 水印检测：右下角候选区 vs 左下角对照区
    im = Image.open(out)
    W, H = im.size
    rb, rs = stat_region(im, (W - 300, H - 75, W - 20, H - 15))
    lb, ls = stat_region(im, (20, H - 75, 300, H - 15))
    flag = "有水印?" if (rb - lb > 0.02 and rs - ls > 8) else "ok"
    moved.append((dst, round(rb, 3), round(rs, 1), round(lb, 3), round(ls, 1), flag))
    print(f"{dst}  右下亮占比={rb:.3f} 标准差={rs:.1f} | 左下对照 亮占比={lb:.3f} 标准差={ls:.1f}  -> {flag}")

print("\n共处理", len(moved), "张")
