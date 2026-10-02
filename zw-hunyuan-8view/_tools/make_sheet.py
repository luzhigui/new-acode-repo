# -*- coding: utf-8 -*-
"""把 8 张归一化图拼成对比图，带冠顶/脚底参考线，便于目视核验。"""
import os
from PIL import Image, ImageDraw

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "prep")
FILES = ["01_front_A.jpg", "02_front_B.jpg", "03_right.jpg", "04_left_A.jpg",
         "05_left_B.jpg", "06_left_C.jpg", "07_back_A.jpg", "08_back_B.jpg"]
CW, CH = 360, 480
COLS, ROWS = 4, 2
PAD, LAB = 8, 22
W = COLS * CW + (COLS + 1) * PAD
H = ROWS * (CH + LAB) + (ROWS + 1) * PAD
sheet = Image.new("RGB", (W, H), (245, 245, 247))
d = ImageDraw.Draw(sheet)

CROWN_Y = 0.07   # 归一化图中的冠顶/脚底位置（比例）
FEET_Y = 0.93
for i, f in enumerate(FILES):
    r, c = divmod(i, COLS)
    x = PAD + c * (CW + PAD)
    y = PAD + r * (CH + LAB + PAD)
    im = Image.open(os.path.join(OUT, f)).resize((CW, CH), Image.LANCZOS)
    sheet.paste(im, (x, y))
    # 参考线
    cy = y + int(CH * CROWN_Y); fy = y + int(CH * FEET_Y)
    d.line([(x, cy), (x + CW, cy)], fill=(255, 60, 60), width=1)
    d.line([(x, fy), (x + CW, fy)], fill=(60, 200, 60), width=1)
    d.rectangle([x, y, x + CW - 1, y + CH - 1], outline=(180, 180, 185))
    d.text((x + 4, y + CH + 4), f, fill=(20, 20, 20))

sheet.save(os.path.join(BASE, "_预览-8视图对比.png"))
print("sheet:", os.path.join(BASE, "_预览-8视图对比.png"), W, H)
