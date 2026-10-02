# -*- coding: utf-8 -*-
"""去掉文字条后，用「亮/彩」掩码测主体包围盒，评估各视图缩放是否一致。"""
import os
import numpy as np
from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(BASE, "raw")

# 文字条裁切比例 (top, bottom)
TEXT = {
    "zw_front":  (0.09, 0.00),
    "zw_side":   (0.13, 0.00),
    "zw_side3":  (0.11, 0.05),
}
NAMES = ["zw_front", "zw_front_1", "zw_side", "zw_sideR", "zw_side_1", "zw_side3", "zw_back", "zw_rear"]

def text_crop(im, name):
    t, b = TEXT.get(name, (0.0, 0.0))
    w, h = im.size
    return im.crop((0, int(h * t), w, int(h * (1 - b))))

def fgmask(a):
    lum = a.mean(2)
    sat = a.max(2) - a.min(2)
    return (lum > 70) | (sat > 50)

def bbox(mask, min_frac=0.02):
    h, w = mask.shape
    rows = np.where(mask.sum(1) > w * min_frac)[0]
    cols = np.where(mask.sum(0) > h * min_frac)[0]
    if len(rows) == 0 or len(cols) == 0:
        return None
    return int(cols[0]), int(rows[0]), int(cols[-1]), int(rows[-1])

print(f"{'name':12} {'afterText WxH':>14}  {'bbox(L,T,R,B)':>22}  {'frac L,T,R,B':>26}  subjH_frac")
for n in NAMES:
    im = Image.open(os.path.join(RAW, n + ".jpg")).convert("RGB")
    im = text_crop(im, n)
    w, h = im.size
    a = np.asarray(im).astype(int)
    bb = bbox(fgmask(a))
    if bb is None:
        print(f"{n:12} {w}x{h:<8}  NONE"); continue
    L, T, R, B = bb
    fr = (round(L / w, 3), round(T / h, 3), round(R / w, 3), round(B / h, 3))
    print(f"{n:12} {w}x{h:<8}  {str(bb):>22}  {str(fr):>26}  {round((B-T)/h,3)}")
