# -*- coding: utf-8 -*-
"""量出每张图的尺寸 / 背景色 / 主体包围盒，用于决定统一裁切方案。"""
import os, sys
import numpy as np
from PIL import Image

RAW = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "raw")
names = ["zw_front", "zw_front_1", "zw_side", "zw_sideR", "zw_side_1", "zw_side3", "zw_back", "zw_rear"]

def bbox_by_bg(img, tol=38):
    """以四角均值为背景色，取与背景差异超过 tol 的像素为前景，求包围盒。"""
    a = np.asarray(img.convert("RGB")).astype(np.int16)
    h, w, _ = a.shape
    corners = np.stack([a[0, 0], a[0, w-1], a[h-1, 0], a[h-1, w-1]])
    bg = corners.mean(axis=0)
    diff = np.sqrt(((a - bg) ** 2).sum(axis=2))
    mask = diff > tol
    # 去掉零散噪点：按行/列计数，取有效范围
    rows = np.where(mask.sum(axis=1) > w * 0.02)[0]
    cols = np.where(mask.sum(axis=0) > h * 0.02)[0]
    if len(rows) == 0 or len(cols) == 0:
        return None, bg
    return (int(cols[0]), int(rows[0]), int(cols[-1]), int(rows[-1])), bg

print(f"{'name':12} {'WxH':>11}  {'bg(RGB)':>16}  {'bbox(L,T,R,B)':>26}  {'bbox_frac(L,T,R,B)':>28}")
for n in names:
    p = os.path.join(RAW, n + ".jpg")
    if not os.path.exists(p):
        print(f"{n:12} MISSING"); continue
    im = Image.open(p)
    w, h = im.size
    bb, bg = bbox_by_bg(im)
    if bb is None:
        print(f"{n:12} {w}x{h:<6}  bg={tuple(int(x) for x in bg)}  bbox=None")
        continue
    bf = tuple(round(v / (w if i % 2 == 0 else h), 3) for i, v in enumerate(bb))
    print(f"{n:12} {w}x{h:<6}  bg={str(tuple(int(x) for x in bg)):>16}  {str(bb):>26}  {str(bf):>28}")
