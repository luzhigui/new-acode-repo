"""把八视图拼成一张对照长图（4 列 x 2 行），带序号标签。"""
import os, sys
from PIL import Image, ImageDraw

d = sys.argv[1]
out = sys.argv[2]
CELL = 512
files = sorted(f for f in os.listdir(d) if f.lower().endswith('.jpg'))
cols = 4
rows = (len(files) + cols - 1) // cols
pad = 12
W = cols * CELL + (cols + 1) * pad
H = rows * (CELL + 30) + (rows + 1) * pad
sheet = Image.new('RGB', (W, H), (18, 20, 26))
dr = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    r, c = divmod(i, cols)
    im = Image.open(os.path.join(d, f)).convert('RGB').resize((CELL, CELL), Image.LANCZOS)
    x = pad + c * (CELL + pad)
    y = pad + r * (CELL + 30 + pad)
    sheet.paste(im, (x, y))
    label = '%02d  %s' % (i + 1, os.path.splitext(f)[0].split('_', 1)[1])
    dr.text((x + 4, y + CELL + 6), label, fill=(232, 234, 240))
sheet.save(out)
print('对照图', out, sheet.size, '共', len(files), '张')
