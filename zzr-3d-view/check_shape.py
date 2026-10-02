import sys, os
import numpy as np
from PIL import Image

d = sys.argv[1]
files = sorted(f for f in os.listdir(d) if f.endswith('.jpg'))
for f in files[:8]:
    a = np.asarray(Image.open(os.path.join(d, f)).convert('RGB')).astype(np.int16)
    # 背景是纯 128 灰
    bg = (np.abs(a - 128).sum(2) < 12)
    mask = ~bg
    ys, xs = np.nonzero(mask)
    hh, ww = mask.shape
    print(f'--- {f}  bbox x[{xs.min()}-{xs.max()}] y[{ys.min()}-{ys.max()}] '
          f'顶={ys.min()/hh:.3f} 底={ys.max()/hh:.3f} 宽占比={(xs.max()-xs.min())/ww:.3f}')
    rows, cols = 30, 22
    for r in range(rows):
        line = ''
        for c in range(cols):
            y0 = int(r * hh / rows); y1 = int((r + 1) * hh / rows)
            x0 = int(c * ww / cols); x1 = int((c + 1) * ww / cols)
            m = mask[y0:y1, x0:x1].mean()
            line += '#' if m > 0.5 else ('+' if m > 0.18 else '.')
        print('    ' + line)
