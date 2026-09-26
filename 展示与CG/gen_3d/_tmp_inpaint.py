# -*- coding: utf-8 -*-
"""Watermark removal via OpenCV content-aware inpainting (no hard patch seam)."""
import os
import cv2
import numpy as np

D = os.path.dirname(os.path.abspath(__file__))
RAWD = os.path.join(D, "_src", "v2候选", "raw2")
OUTD = os.path.join(D, "_src", "v2候选")

def target_for(name):
    if "灭绝" in name:
        return "灭绝师太-剃度尼姑中年-立绘-v4.png"
    if "黑化" in name and "周芷若" in name:
        return "周芷若-黑化黑金加料-性感向-v4.png"
    if "周芷若" in name:
        return "周芷若-露肩高开衩加料-性感向-v4.png"
    return None

for fn in sorted(os.listdir(RAWD)):
    if not fn.lower().endswith(".png"):
        continue
    tgt = target_for(fn)
    if not tgt:
        print("skip(no target):", fn)
        continue
    src = os.path.join(RAWD, fn)
    img = cv2.imdecode(np.fromfile(src, dtype=np.uint8), cv2.IMREAD_COLOR)
    H, W = img.shape[:2]
    # tight mask over the bottom-right watermark text
    x0, y0, x1, y1 = W - 120, H - 80, W - 6, H - 6
    mask = np.zeros((H, W), np.uint8)
    mask[y0:y1, x0:x1] = 255
    out = cv2.inpaint(img, mask, 4, cv2.INPAINT_TELEA)
    dst = os.path.join(OUTD, tgt)
    ok, buf = cv2.imencode(".png", out)
    with open(dst, "wb") as f:
        f.write(buf.tobytes())
    print("inpainted ->", tgt, W, H, os.path.getsize(dst))
