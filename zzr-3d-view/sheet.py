import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

d = sys.argv[1]
out = sys.argv[2]
files = sorted(f for f in os.listdir(d) if f.endswith('.jpg'))
if len(sys.argv) > 3:
    files = [f for f in files if any(k in f for k in sys.argv[3].split(','))]

TW, TH = 250, 334
LAB = 34
cols = 4 if len(files) <= 8 else 5
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (cols * TW, rows * (TH + LAB)), (24, 24, 28))
dr = ImageDraw.Draw(sheet)
font = None
for p in ('C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/msyhl.ttc',
          'C:/Windows/Fonts/simhei.ttf', 'C:/Windows/Fonts/simsun.ttc'):
    if os.path.exists(p):
        try:
            font = ImageFont.truetype(p, 20)
            break
        except Exception:
            pass
if font is None:
    font = ImageFont.load_default()

for i, f in enumerate(files):
    im = Image.open(os.path.join(d, f)).convert('RGB').resize((TW, TH), Image.LANCZOS)
    r, c = divmod(i, cols)
    x, y = c * TW, r * (TH + LAB)
    sheet.paste(im, (x, y))
    dr.rectangle([x, y + TH, x + TW, y + TH + LAB], fill=(16, 16, 20))
    name = os.path.splitext(f)[0]
    try:
        bb = dr.textbbox((0, 0), name, font=font)
        w = bb[2] - bb[0]
    except Exception:
        w = len(name) * 10
    dr.text((x + (TW - w) / 2, y + TH + 6), name, fill=(235, 235, 240), font=font)

sheet.save(out)
print('saved', out, sheet.size, len(files), 'views')
