# -*- coding: utf-8 -*-
"""逐行背景中值相减，抵抗垂直渐变 / 星空噪点，测主体包围盒。"""
import os
import numpy as np
from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(BASE, "raw")
TEXT = {"zw_front": (0.09, 0.0), "zw_side": (0.13, 0.0), "zw_side3": (0.11, 0.05)}
NAMES = ["zw_front", "zw_front_1", "zw_side", "zw_sideR", "zw_side_1", "zw_side3", "zw_back", "zw_rear"]

def run(name, thr=30, edge=0.12, min_frac=0.02):
    im = Image.open(os.path.join(RAW, name + ".jpg")).convert("RGB")
    w, h = im.size
    t, b = TEXT.get(name, (0.0, 0.0))
    im = im.crop((0, int(h * t), w, int(h * (1 - b))))
    w, h = im.size
    a = np.asarray(im).astype(int)
    ew = max(2, int(w * edge))
    edges = np.concatenate([a[:, :ew], a[:, -ew:]], axis=1)
    bg_row = np.median(edges, axis=1)          # (h,3) 每行背景色
    dist = np.sqrt(((a - bg_row[:, None, :]) ** 2).sum(2))
    mask = dist > thr
    rows = np.where(mask.sum(1) > w * min_frac)[0]
    cols = np.where(mask.sum(0) > h * min_frac)[0]
    if len(rows) == 0 or len(cols) == 0:
        return None
    T, B, L, R = int(rows[0]), int(rows[-1]), int(cols[0]), int(cols[-1])
    return (L, T, R, B), w, h

print(f"{'name':12} {'WxH':>10}  {'bbox(L,T,R,B)':>22}  {'frac L,T,R,B':>28}  subjH_frac")
for n in NAMES:
    r = run(n)
    if not r:
        print(f"{n:12} NONE"); continue
    bb, w, h = r
    L, T, R, B = bb
    fr = (round(L/w,3), round(T/h,3), round(R/w,3), round(B/h,3))
    print(f"{n:12} {w}x{h:<6}  {str(bb):>22}  {str(fr):>28}  {round((B-T)/h,3)}")
