"""拼一张 8 视图对照长图（4列×2行），方便肉眼检查一致性。"""
import os
from PIL import Image, ImageDraw

PREP = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + "/prep"
OUT = os.path.dirname(PREP) + "/_预览-8视图打包.png"
ORDER = [("01_front_A", "01 前A zw_front_1"),
         ("02_front_B", "02 前B zw_front"),
         ("03_right",   "03 右  zw_side"),
         ("04_left_A",  "04 左A zw_sideR"),
         ("05_left_B",  "05 左B zw_side_1"),
         ("06_left_C",  "06 左C zw_side3"),
         ("07_back_A",  "07 后A zw_back"),
         ("08_back_B",  "08 后B zw_rear")]
TW, TH = 384, 512
COLS, ROWS = 4, 2
sheet = Image.new("RGB", (TW * COLS, TH * ROWS + 24), (20, 20, 24))
d = ImageDraw.Draw(sheet)
for i, (name, label) in enumerate(ORDER):
    im = Image.open(f"{PREP}/{name}.jpg").convert("RGB").resize((TW, TH))
    x = (i % COLS) * TW
    y = (i // COLS) * TH + 24
    sheet.paste(im, (x, y))
    d.text((x + 6, y + 6), label, fill=(255, 220, 80))
sheet.save(OUT)
print("wrote", OUT, sheet.size)
